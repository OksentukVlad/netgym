import { sameNetwork, parseIp, parsePrefix } from './ip.js';

/**
 * @typedef {{id:string,label:{cisco:string,routeros:string}}} L2Port
 * @typedef {{device:string,port:string}} LinkEnd
 * @typedef {{devices:Array<{id:string,kind:'switch'|'host'|'router',ports:L2Port[]}>,
 *   links:Array<{a:LinkEnd,b:LinkEnd}>, hosts:Array<{device:string,ip:string,prefix:number}>,
 *   attachments?:Array<{id:string,device:string,port:string,vid?:number|null,ip?:string,prefix?:number,up?:boolean,gateway?:string}>}} L2Topology
 * @typedef {{vendor?:'cisco'|'routeros',filtering:boolean,vlans:Set<number>,
 *   ports:Object<string,{pvid:number|null,admitUntagged:boolean,admitTagged:boolean,
 *     ingressFilter:boolean,allowed?:'all'|Set<number>}>,
 *   members:Object<string,{tagged:Set<string>,untagged:Set<string>}>}} PortTable
 * @typedef {{from:string,hops:Array<{device:string,inPort:string|null,vid:number|null,
 *   tagged:boolean,transparent?:boolean,out:Array<{port:string,tagged:boolean,vid:number|null}>,
 *   dropped:Array<{port:string,code:string}>}>,received:Set<string>,
 *   arrivals:Array<{host:string,device:string,port:string,tagged:boolean,vid:number|null,from:LinkEnd}>,
 *   attachmentArrivals:Array<{attachment:string,device:string,port:string,tagged:boolean,vid:number|null,code:string}>}} L2Walk
 */
export const codes = Object.freeze([
  'ok', 'untagged-not-admitted', 'tagged-not-admitted', 'not-member',
  'vlan-not-on-switch', 'not-allowed-out', 'host-got-tagged', 'unmodelled',
  'different-network', 'no-path', 'one-way', 'bad-vid', 'cisco-reserved-vid', 'invalid-config',
  'mode-not-set', 'port-in-two-vlans-untagged', 'dynamic-pvid', 'vlan-auto-created',
  'invalid-topology',
]);
export const frameTypes = Object.freeze([
  'admit-all', 'admit-only-untagged-and-priority-tagged', 'admit-only-vlan-tagged',
]);
export const validVid = v => Number.isInteger(v) && v >= 1 && v <= 4094;
export const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const issue = (code, field, severity = 'blocks', params = {}) => ({ code, severity, field, params });
const membership = (table, vid) => table.members[vid] ??= { tagged: new Set(), untagged: new Set() };
export const member = (table, vid, port) => !!(table?.members[vid]?.tagged.has(port) || table?.members[vid]?.untagged.has(port));
const emptyTable = (vendor, filtering) => ({ vendor, filtering, vlans: new Set(), ports: {}, members: {} });
const only = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
const reservedCiscoVid = vid => vid >= 1002 && vid <= 1005;
const allowedOnPort = (port, vid) => port.allowed === undefined || port.allowed === 'all' || port.allowed.has(vid);
const admit = (port, frame) => frame.tagged ? port.admitTagged : port.admitUntagged;
const classify = (port, frame) => frame.tagged ? frame.vid : port.pvid;

/** Compilers accept the forms' incomplete/wrong configurations. They never
 * repair them using a reference. Diagnostics contain submitted facts only. */
export function compileCisco(config) {
  const table = emptyTable('cisco', true), findings = [];
  const add = (code, field, severity, params) => findings.push(issue(code, field, severity, params));
  const checkVid = (vid, field) => {
    const code = !validVid(vid) ? 'bad-vid' : reservedCiscoVid(vid) ? 'cisco-reserved-vid' : null;
    if (code) add(code, field);
    return code === null;
  };
  if (!only(config, ['vlans', 'ports']) || !Array.isArray(config.vlans) || !object(config.ports)) {
    return { table, findings: [issue('invalid-config', '')] };
  }
  table.vlans.add(1); // the default native VLAN exists on a 2960
  for (const vid of config.vlans) if (checkVid(vid, 'vlans')) table.vlans.add(vid);
  for (const [id, p] of Object.entries(config.ports)) {
    const fields = p?.mode === 'access' ? ['mode', 'vlan']
      : p?.mode === 'trunk' ? ['mode', 'allowed', 'native'] : ['mode'];
    if (!only(p, fields) || !['access', 'trunk', null].includes(p.mode)) {
      add('invalid-config', `ports.${id}`);
      continue;
    }
    if (p.mode === null) {
      table.ports[id] = { pvid: null, admitTagged: false, admitUntagged: false, ingressFilter: true };
      continue;
    }
    if (p.mode === 'access') {
      if (!checkVid(p.vlan, `ports.${id}.vlan`)) continue;
      if (!table.vlans.has(p.vlan)) {
        table.vlans.add(p.vlan);
        add('vlan-auto-created', `ports.${id}`, 'info', { vid: p.vlan, port: id });
      }
      table.ports[id] = { pvid: p.vlan, admitTagged: false, admitUntagged: true, ingressFilter: true };
      membership(table, p.vlan).untagged.add(id);
    } else {
      if (p.allowed !== 'all') {
        if (!Array.isArray(p.allowed)) { add('bad-vid', `ports.${id}.allowed`); continue; }
        // Check every supplied VID so reserved values receive a specific finding.
        if (!p.allowed.map(vid => checkVid(vid, `ports.${id}.allowed`)).every(Boolean)) continue;
      }
      const native = p.native === undefined ? 1 : p.native;
      if (!checkVid(native, `ports.${id}.native`)) continue;
      table.ports[id] = {
        pvid: native, admitTagged: true, admitUntagged: true, ingressFilter: true,
        allowed: p.allowed === 'all' ? 'all' : new Set(p.allowed),
      };
    }
  }
  // Access assignments can create VLANs after a trunk was declared (F8).
  for (const [id, p] of Object.entries(config.ports)) {
    if (p?.mode !== 'trunk' || !table.ports[id]) continue;
    for (const vid of table.vlans) {
      if (allowedOnPort(table.ports[id], vid)) {
        membership(table, vid)[vid === table.ports[id].pvid ? 'untagged' : 'tagged'].add(id);
      }
    }
  }
  return { table, findings };
}

export function compileRouterOS(config, { vlanIfs = [], bridge = vlanIfs.length > 0, dynamicBridgeTagged = false } = {}) {
  const table = emptyTable('routeros', config?.filtering === true), findings = [];
  const add = (code, field, severity, params) => findings.push(issue(code, field, severity, params));
  if (!only(config, ['filtering', 'ports', 'vlans']) || typeof config.filtering !== 'boolean'
    || !object(config.ports) || !Array.isArray(config.vlans)) {
    return { table, findings: [issue('invalid-config', '')] };
  }
  for (const [id, p] of Object.entries(config.ports)) {
    if (!only(p, ['pvid', 'frameTypes'])) { add('invalid-config', `ports.${id}`); continue; }
    const pvid = p.pvid === undefined ? 1 : p.pvid;
    const type = p.frameTypes === undefined ? 'admit-all' : p.frameTypes;
    if (!validVid(pvid)) { add('bad-vid', `ports.${id}.pvid`); continue; }
    if (!frameTypes.includes(type)) { add('invalid-config', `ports.${id}.frameTypes`); continue; }
    table.ports[id] = {
      pvid, admitUntagged: type !== 'admit-only-vlan-tagged',
      admitTagged: type !== 'admit-only-untagged-and-priority-tagged', ingressFilter: true,
    };
  }
  for (const [i, row] of config.vlans.entries()) {
    if (!only(row, ['vids', 'tagged', 'untagged']) || !Array.isArray(row.vids) || !row.vids.length
      || !Array.isArray(row.tagged) || !Array.isArray(row.untagged)) {
      add('invalid-config', `vlans.${i}`);
      continue;
    }
    for (const vid of row.vids) {
      if (!validVid(vid)) { add('bad-vid', `vlans.${i}.vids`); continue; }
      table.vlans.add(vid);
      const m = membership(table, vid);
      for (const kind of ['tagged', 'untagged']) for (const id of row[kind]) {
        if (typeof id !== 'string' || (!table.ports[id] && !(bridge && id === 'bridge1'))) add('invalid-config', `vlans.${i}.${kind}`);
        else m[kind].add(id);
      }
    }
  }
  const conflictingPorts = new Set();
  const checkMembership = id => {
    const untagged = Object.entries(table.members).filter(([, m]) => m.untagged.has(id));
    const mixed = Object.values(table.members).some(m => m.tagged.has(id) && m.untagged.has(id));
    const cpuVlan = id === 'bridge1' && vlanIfs.some(v => v?.on === 'bridge1'
      && table.members[v.vid]?.untagged.has(id));
    if ((untagged.length > 1 || mixed || cpuVlan) && !conflictingPorts.has(id)) {
      conflictingPorts.add(id);
      add('port-in-two-vlans-untagged', `ports.${id}`);
    }
  };
  const membershipPorts = [...Object.keys(table.ports), ...(bridge ? ['bridge1'] : [])];
  // Validate explicit rows before automatic tagging can obscure a conflict.
  membershipPorts.forEach(checkMembership);
  // Effective CPU membership for RouterOS 7.16+. The caller explicitly opts
  // into that device capability; static rows are never rewritten or inferred
  // from a reference answer. Older versions need explicit bridge1 membership.
  if (table.filtering && dynamicBridgeTagged) for (const v of vlanIfs) {
    if (v?.on !== 'bridge1' || !validVid(v.vid) || conflictingPorts.has('bridge1')) continue;
    const m = membership(table, v.vid);
    table.vlans.add(v.vid);
    if (!m.tagged.has('bridge1')) {
      m.tagged.add('bridge1');
      add('bridge-tag-implicit', 'vlans', 'advice', { vid: v.vid });
    }
  }
  if (table.filtering) for (const [id, p] of Object.entries(table.ports)) if (p.admitUntagged) {
    table.vlans.add(p.pvid);
    const m = membership(table, p.pvid);
    if (!m.untagged.has(id)) {
      m.untagged.add(id);
      add('dynamic-pvid', `ports.${id}`, 'info', { port: id, vid: p.pvid });
    }
  }
  // Dynamic PVID membership can also conflict with explicit physical rows.
  membershipPorts.forEach(checkMembership);
  return { table, findings };
}

const validPort = p => object(p) && typeof p.id === 'string' && p.id && object(p.label)
  && (p.up === undefined || typeof p.up === 'boolean')
  && ['cisco', 'routeros'].every(s => typeof p.label[s] === 'string');
const validDevice = d => object(d) && typeof d.id === 'string' && d.id
  && ['switch', 'host', 'router'].includes(d.kind) && !('vendorModel' in d)
  && Array.isArray(d.ports) && d.ports.length > 0 && d.ports.every(validPort)
  && new Set(d.ports.map(p => p.id)).size === d.ports.length
  && ['cisco', 'routeros'].every(s => new Set(d.ports.map(p => p.label[s])).size === d.ports.length)
  && (d.kind !== 'host' || (d.ports.length === 1 && d.ports[0].id === 'nic'));
const validHost = (h, devices) => object(h) && devices.get(h.device)?.kind === 'host'
  && typeof h.ip === 'string' && Number.isInteger(h.prefix)
  && parseIp(h.ip) === h.ip && parsePrefix(h.prefix) === h.prefix;

/** Structural guard for tree topologies. Labels are syntax-neutral data. */
export function validateTopology(topology) {
  const bad = () => [{ code: 'invalid-topology' }];
  if (!object(topology) || !Array.isArray(topology.devices)
    || !Array.isArray(topology.links) || !Array.isArray(topology.hosts)) return bad();
  const devices = new Map();
  for (const d of topology.devices) {
    if (!validDevice(d) || devices.has(d.id)) return bad();
    devices.set(d.id, d);
  }
  const validEnd = end => object(end) && devices.get(end.device)?.ports.some(p => p.id === end.port);
  const parent = new Map(topology.devices.map(d => [d.id, d.id]));
  const root = id => parent.get(id) === id ? id : root(parent.get(id));
  const used = new Set();
  for (const link of topology.links) {
    if (!object(link)) return bad();
    for (const end of [link.a, link.b]) {
      if (!validEnd(end)) return bad();
      const key = JSON.stringify([end.device, end.port]);
      if (used.has(key)) return bad();
      used.add(key);
    }
    const a = root(link.a.device), b = root(link.b.device);
    if (a === b) return bad();
    parent.set(a, b);
  }
  if (!topology.hosts.every(h => validHost(h, devices))
    || new Set(topology.hosts.map(h => h.device)).size !== topology.hosts.length
    || new Set(topology.hosts.map(h => h.ip)).size !== topology.hosts.length
    || topology.devices.filter(d => d.kind === 'host').length !== topology.hosts.length) return bad();
  if (topology.attachments !== undefined) {
    if (!Array.isArray(topology.attachments)
      || new Set(topology.attachments.map(a => a?.id)).size !== topology.attachments.length
      || topology.attachments.some(a => !object(a) || typeof a.id !== 'string' || !a.id || devices.has(a.id)
        || (!validEnd(a) && !(['svi', 'bridge'].includes(a.port) && devices.has(a.device) && devices.get(a.device).kind !== 'host' && validVid(a.vid)))
        || (a.vid !== undefined && a.vid !== null && !validVid(a.vid))
        || (a.ip !== undefined && (parseIp(a.ip) !== a.ip || parsePrefix(a.prefix) !== a.prefix)))) return bad();
  }
  return [];
}

export function peer(topology, device, port) {
  const matches = end => end.device === device && end.port === port;
  const link = topology.links.find(l => matches(l.a) || matches(l.b));
  return link ? (matches(link.a) ? link.b : link.a) : null;
}

/** Links are up and STP is forwarding in this teaching model. SVI state
 * uses effective table membership, never an allowed-list shortcut (X1/F9). */
export function attachmentStatus(topology, tables, a) {
  if (a.up === false) return 'interface-down';
  const table = tables[a.device];
  if (a.port === 'svi') return table?.vlans.has(a.vid)
    && topology.devices.find(d => d.id === a.device)?.ports.some(p => p.up !== false && member(table, a.vid, p.id))
    ? 'ok' : 'interface-down';
  if (a.port === 'bridge') return !table ? 'interface-down'
    : !table.filtering || table.members[a.vid]?.tagged.has('bridge1') ? 'ok' : 'bridge-cpu-not-tagged';
  if (topology.devices.find(d => d.id === a.device)?.ports.find(p => p.id === a.port)?.up === false) return 'interface-down';
  if (table?.ports[a.port]) return 'vlan-on-bridge-port';
  return 'ok';
}

/** Broadcast traversal, also used for each *new* routed frame. Port L3
 * attachments receive by wire tag; internal attachments receive after ingress
 * classification. Neither internal reception nor injection bypasses the table. */
export function flood(topology, tables, { from, tagged = null }) {
  const host = topology.devices.find(d => d.id === from && d.kind === 'host');
  const attachment = topology.attachments?.find(a => a.id === from)
    ?? (host ? { device: from, port: 'nic' } : null);
  if (!attachment || (tagged !== null && !validVid(tagged))) throw new RangeError('invalid-topology');
  if (attachment.vid !== undefined && tagged !== null && tagged !== attachment.vid) throw new RangeError('invalid-topology');
  const hops = [], received = new Set(), arrivals = [], attachmentArrivals = [], seen = new Set();
  const internal = ['svi', 'bridge'].includes(attachment.port);
  const wireVid = tagged ?? attachment.vid ?? null;
  const wire = { tagged: wireVid !== null, vid: wireVid };
  const sourceHop = { device: attachment.device, inPort: null, ...wire, out: [], dropped: [] };
  const status = host ? 'ok' : attachmentStatus(topology, tables, attachment);
  let queue = [];
  if (status !== 'ok') {
    sourceHop.dropped.push({ port: attachment.port, code: status });
    hops.push(sourceHop);
  } else if (internal) {
    queue.push({ device: attachment.device, port: null, ...wire, internal: true });
  } else {
    sourceHop.out.push({ port: attachment.port, ...wire });
    hops.push(sourceHop);
    const first = peer(topology, attachment.device, attachment.port);
    if (first) queue.push({ ...first, ...wire, via: { device: attachment.device, port: attachment.port } });
  }
  while (queue.length) {
    const frame = queue.shift(), d = topology.devices.find(d => d.id === frame.device);
    const key = JSON.stringify([frame.device, frame.port, frame.tagged, frame.vid]);
    if (seen.has(key)) continue;
    seen.add(key);
    const hop = { device: frame.device, inPort: frame.port, tagged: frame.tagged, vid: frame.vid, out: [], dropped: [] };
    hops.push(hop);
    const drop = (port, code) => hop.dropped.push({ port, code });
    if (d.ports.find(p => p.id === frame.port)?.up === false) { drop(frame.port, 'interface-down'); continue; }
    if (d.kind === 'host') {
      arrivals.push({ host: d.id, device: d.id, port: frame.port, tagged: frame.tagged, vid: frame.vid, from: frame.via });
      if (frame.tagged) drop(frame.port, 'host-got-tagged'); else received.add(d.id);
      continue;
    }
    const table = tables[d.id], ingress = table?.ports[frame.port];
    const physical = (topology.attachments ?? []).filter(a => a.device === d.id && a.port === frame.port
      && (a.vid ?? null) === (frame.tagged ? frame.vid : null));
    for (const a of physical) {
      const code = attachmentStatus(topology, tables, a);
      attachmentArrivals.push({ attachment: a.id, device: d.id, port: frame.port, tagged: frame.tagged, vid: frame.vid, code });
      if (code === 'ok') received.add(a.id); else drop(frame.port, code);
    }
    if (!table || (!ingress && !frame.internal)) {
      if (d.kind === 'router') {
        if (!physical.length) drop(frame.port, frame.tagged ? 'no-subinterface' : 'no-l3-interface');
      } else drop(frame.port, 'unmodelled');
      continue;
    }
    hop.transparent = !table.filtering;
    if (table.filtering && !frame.internal) {
      if (!admit(ingress, frame)) { drop(frame.port, frame.tagged ? 'tagged-not-admitted' : 'untagged-not-admitted'); continue; }
      hop.vid = classify(ingress, frame);
      if (!allowedOnPort(ingress, hop.vid)) { drop(frame.port, 'not-member'); continue; }
      if (table.vendor === 'cisco' && !table.vlans.has(hop.vid)) { drop(frame.port, 'vlan-not-on-switch'); continue; }
      if (ingress.ingressFilter && !member(table, hop.vid, frame.port)) { drop(frame.port, 'not-member'); continue; }
    }
    if (!frame.internal) for (const a of topology.attachments ?? []) {
      if (a.device !== d.id || !['svi', 'bridge'].includes(a.port)) continue;
      // Without filtering, a VLAN interface still consumes only tagged frames.
      const vid = table.filtering ? hop.vid : frame.tagged ? frame.vid : null;
      if (a.vid !== vid) continue;
      const code = attachmentStatus(topology, tables, a);
      attachmentArrivals.push({ attachment: a.id, device: d.id, port: a.port, tagged: frame.tagged, vid, code });
      if (code === 'ok') received.add(a.id); else drop(a.port, code);
    }
    for (const p of d.ports) {
      if (p.id === frame.port || p.up === false) continue;
      const next = peer(topology, d.id, p.id);
      if (!next) continue;
      // An omitted/invalid row or a standalone routed port is not a bridge
      // egress. Keep that exclusion visible even when filtering is disabled.
      if (!table.ports[p.id]) { drop(p.id, 'not-allowed-out'); continue; }
      let outTagged = frame.tagged, vid = frame.vid;
      if (table.filtering) {
        if (!allowedOnPort(table.ports[p.id], hop.vid) || !member(table, hop.vid, p.id)) { drop(p.id, 'not-allowed-out'); continue; }
        outTagged = !table.members[hop.vid].untagged.has(p.id);
        vid = hop.vid;
      }
      hop.out.push({ port: p.id, tagged: outTagged, vid });
      queue.push({ ...next, tagged: outTagged, vid: outTagged ? vid : null, via: { device: d.id, port: p.id } });
    }
  }
  return { from, hops, received, arrivals, attachmentArrivals };
}

/** A bidirectional on-link reachability check, not an ICMP packet replay. */
export function ping(topology, tables, a, b) {
  const left = topology.hosts.find(h => h.device === a), right = topology.hosts.find(h => h.device === b);
  if (!left || !right) throw new RangeError('invalid-topology');
  if (!sameNetwork(left.ip, right.ip, left.prefix) || !sameNetwork(left.ip, right.ip, right.prefix)) {
    return { ok: false, code: 'different-network', walks: [] };
  }
  const walks = [flood(topology, tables, { from: a }), flood(topology, tables, { from: b })];
  const forward = walks[0].received.has(b), reverse = walks[1].received.has(a);
  const code = forward && reverse ? 'ok' : forward || reverse ? 'one-way' : 'no-path';
  const drops = walks.flatMap(w => w.hops.flatMap(h => h.dropped.map(d => ({ device: h.device, ...d }))));
  return { ok: code === 'ok', code, walks, drops };
}

/** Connected components of the undirected mutual-reach graph. Components
 * describe colour groups, never a claim that every pair is mutually reachable. */
export function domains(topology, tables) {
  const hosts = topology.hosts.map(h => h.device);
  const walks = new Map(hosts.map(id => [id, flood(topology, tables, { from: id })]));
  const remaining = new Set(hosts), groups = [];
  for (const start of hosts) {
    if (!remaining.delete(start)) continue;
    const group = [start];
    for (let i = 0; i < group.length; i++) for (const other of hosts) {
      const mutual = walks.get(group[i]).received.has(other) && walks.get(other).received.has(group[i]);
      if (remaining.has(other) && mutual) { remaining.delete(other); group.push(other); }
    }
    groups.push(group);
  }
  return groups;
}

export const ping3BaseCodes = Object.freeze([
  'ok', 'different-network', 'no-gateway', 'gateway-off-link',
  'gateway-unreachable', 'gateway-not-a-router', 'no-l3-interface',
  'no-subinterface', 'interface-down', 'no-route', 'vlan-on-bridge-port', 'bridge-cpu-not-tagged',
]);
export const ping3Codes = Object.freeze([...ping3BaseCodes, ...ping3BaseCodes.filter(c => c !== 'ok').map(c => `reply-${c}`)]);
const endpoints = topology => [...topology.hosts.map(h => ({ ...h, id: h.device, port: 'nic' })), ...(topology.attachments ?? [])];

/** One-way IP decision. Each L2 segment resolves the next hop both ways;
 * request and reply invoke this separately, with the sender's own prefix.
 * There is one router, connected routes only, and no proxy ARP. */
export function trace3(topology, tables, from, to) {
  const all = endpoints(topology), sender = all.find(a => a.id === from);
  // An unowned destination IP still produces the actual failed ARP walk.
  // No reference attachment is fabricated to stand in for a missing gateway.
  const destination = all.find(a => a.id === to || a.ip === to)
    ?? (parseIp(to) === to ? { id: null, device: null, ip: to, prefix: null } : null);
  if (!sender || !destination) throw new RangeError('invalid-topology');
  const segments = [], hops = [], steps = [];
  const result = code => ({ from, to, ok: code === 'ok', code, segments, hops, steps });
  const isRouter = a => topology.devices.find(d => d.id === a.device)?.kind === 'router';
  const state = a => a.port === 'nic' ? 'ok' : attachmentStatus(topology, tables, a);
  const unresolved = (a, ip) => {
    const walk = flood(topology, tables, { from: a.id });
    const drops = walk.hops.filter(h => topology.devices.find(d => d.id === h.device)?.kind === 'router').flatMap(h => h.dropped);
    const code = ['interface-down', 'vlan-on-bridge-port', 'no-subinterface', 'no-l3-interface'].find(c => drops.some(d => d.code === c)) ?? 'gateway-unreachable';
    segments.push({ from: a.id, to: null, nextHopIp: ip, ok: false, code, walks: [walk] });
    steps.push({ kind: 'segment', index: segments.length - 1 });
    return code;
  };
  const resolve = (a, b) => {
    if (b.id === null) return unresolved(a, b.ip);
    const forward = flood(topology, tables, { from: a.id });
    const reverse = flood(topology, tables, { from: b.id });
    const ok = forward.received.has(b.id) && reverse.received.has(a.id);
    let code = ok ? 'ok' : 'gateway-unreachable';
    // Only diagnose errors at the intended next-hop device. Floods on other
    // branches are useful drawing evidence, not causes of this probe's failure.
    const atTarget = forward.hops.filter(h => h.device === b.device);
    const targetDrops = atTarget.flatMap(h => h.dropped);
    for (const c of ['vlan-on-bridge-port', 'interface-down', 'no-subinterface', 'no-l3-interface', 'bridge-cpu-not-tagged']) {
      if (!ok && targetDrops.some(d => d.code === c)) { code = c; break; }
    }
    const blockedIngress = atTarget.some(h => h.dropped.some(d => d.port === h.inPort
      && ['not-member', 'vlan-not-on-switch', 'tagged-not-admitted', 'untagged-not-admitted'].includes(d.code)));
    if (!ok && code === 'gateway-unreachable' && atTarget.length && !blockedIngress && state(b) !== 'ok') code = state(b);
    if (!ok && state(a) !== 'ok') code = state(a);
    const segment = { from: a.id, to: b.id, ok, code, walks: [forward, reverse] };
    segments.push(segment); steps.push({ kind: 'segment', index: segments.length - 1 });
    return code;
  };
  const route = (router, incoming) => {
    if (destination.device === router && isRouter(destination)) return state(destination);
    const candidates = all.filter(a => a.device === router && sameNetwork(a.ip, destination.ip, a.prefix))
      .sort((a, b) => b.prefix - a.prefix || a.id.localeCompare(b.id));
    const outgoing = candidates.find(a => state(a) === 'ok');
    if (!outgoing) return candidates.length ? state(candidates[0]) : 'no-route';
    const hop = { router, in: incoming, out: outgoing.id };
    hops.push(hop); steps.push({ kind: 'router', index: hops.length - 1 });
    return resolve(outgoing, destination);
  };
  if (isRouter(sender)) return result(state(sender) === 'ok' ? route(sender.device, sender.id) : state(sender));
  if (sameNetwork(sender.ip, destination.ip, sender.prefix)) {
    const code = resolve(sender, destination);
    // An overly broad sender mask cannot make another L2 domain on-link.
    // Keep the VLAN-1 address diagnosis when both prefixes disagree and direct
    // resolution fails; an asymmetric but working L2 path proceeds to reply.
    return result(code === 'gateway-unreachable' && destination.id !== null && !sameNetwork(sender.ip, destination.ip, destination.prefix) ? 'different-network' : code);
  }
  if (!sender.gateway) return result('no-gateway');
  if (!sameNetwork(sender.ip, sender.gateway, sender.prefix)) return result('gateway-off-link');
  const gateway = all.find(a => a.ip === sender.gateway);
  if (!gateway) return result(unresolved(sender, sender.gateway));
  const code = resolve(sender, gateway);
  if (code !== 'ok') return result(code);
  if (!isRouter(gateway)) return result('gateway-not-a-router');
  return result(route(gateway.device, gateway.id));
}

export function ping3(topology, tables, from, to) {
  const request = trace3(topology, tables, from, to);
  const targetId = endpoints(topology).find(a => a.id === to || a.ip === to)?.id;
  const reply = request.ok ? trace3(topology, tables, targetId, from) : null;
  const code = !request.ok ? request.code : !reply.ok ? `reply-${reply.code}` : 'ok';
  return { ok: code === 'ok', code, request, reply };
}
