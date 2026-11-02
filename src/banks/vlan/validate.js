import { observeVlan, vlanEvidenceKey, observableVlan, hasUnmodelled } from '../../engine/vlan-evidence.js';
import { compileCisco, compileRouterOS, flood, ping3, validateTopology, object, peer, validVid } from '../../engine/l2.js';
import { makeRng } from '../../engine/rng.js';
import { shapes } from './predict.js';
import { compileL3 } from '../../engine/l3-config.js';
import { sameNetwork, role } from '../../engine/ip.js';

const vendors = ['cisco', 'routeros'];
const only = (value, keys) => object(value) && Object.keys(value).every(k => keys.includes(k));
const bad = () => [{ code: 'invalid-bank' }];
const switches = topology => topology.devices.filter(d => d.kind === 'switch');
const trunk = (topology, device, port) => switches(topology).some(d => d.id === peer(topology, device, port)?.device);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const targets = {
  p1: { cisco: ['access-a', 'access-b'], routeros: ['access-a', 'access-b', 'filtering-off'] },
  p2: { cisco: ['allowed-a', 'allowed-b'], routeros: ['allowed-a', 'allowed-b', 'trunk-untagged', 'pvid-one'] },
  p3: { cisco: ['allowed-a', 'allowed-b', 'missing-transit'], routeros: ['allowed-a', 'allowed-b', 'filtering-off'] },
};

export function validateRecord(record) {
  if (!only(record, ['id', 'version', 'variants']) || typeof record.id !== 'string' || !record.id || !Number.isInteger(record.version) || record.version < 1
    || !Array.isArray(record.variants) || !record.variants.length || new Set(record.variants.map(v => v?.id)).size !== record.variants.length) return bad();
  for (const v of record.variants) {
    if (!only(v, ['id', 'title', 'placements', 'slots', 'objective']) || typeof v.id !== 'string' || typeof v.title !== 'string'
      || !Array.isArray(v.placements) || !v.placements.length || v.placements.length > 3
      || v.placements.some(p => !Array.isArray(p) || !p.length || p.length > 6 || p.some(g => ![0, 1, 2].includes(g)))
      || v.placements.flat().length < 4 || v.placements.flat().length > 8 || ![undefined, null, 'local-c', 'transit-b'].includes(v.objective)) return bad();
    if (v.slots && (!targets[v.id] || !only(v.slots, vendors) || vendors.some(s => !Array.isArray(v.slots[s]) || !v.slots[s].length
      || new Set(v.slots[s]).size !== v.slots[s].length || v.slots[s].some(slot => !targets[v.id][s].includes(slot))))) return bad();
  }
  return [];
}

function compile(topology, answer, syntax) {
  if (!vendors.includes(syntax) || !object(answer) || Object.keys(answer).some(id => !switches(topology).some(d => d.id === id))) return null;
  const tables = {};
  for (const d of switches(topology)) {
    const config = answer[d.id], { table, findings } = (syntax === 'cisco' ? compileCisco : compileRouterOS)(config);
    if (findings.some(f => f.severity === 'blocks') || !object(config?.ports) || Object.keys(config.ports).some(p => !d.ports.some(port => port.id === p))
      || d.ports.some(p => peer(topology, d.id, p.id) && (!config.ports[p.id] || (syntax === 'cisco' && config.ports[p.id].mode === null)))) return null;
    tables[d.id] = table;
  }
  return tables;
}
const reach = (topology, tables) => Object.fromEntries(topology.hosts.map(h => [h.device, flood(topology, tables, { from: h.device })]));
const key = walk => [...walk.received].sort().join(',');

/** Independent bank-side validity checks. Only engine/bank dependencies;
 * never ask executable exercise logic to approve its own generated instance. */
export function validatePredictInstance(task, variant = shapes.find(v => v.id === task?.identity?.variantId)) {
  if (!variant || !object(variant.slots) || task?.identity?.vendor !== task?.vendor || task?.identity?.variantId !== variant.id || validateRecord({ id: 'validation', version: 1, variants: [variant] }).length || validateTopology(task?.topology).length
    || !vendors.includes(task.vendor) || !Array.isArray(task.rounds) || task.rounds.length < 3 || task.rounds.length > 4
    || new Set(task.rounds.map(r => r?.id)).size !== task.rounds.length || new Set(task.rounds.map(r => r?.from)).size !== task.rounds.length
    || task.rounds.some(r => !task.topology.hosts.some(h => h.device === r?.from)) || !Array.isArray(task.activeSurprises)
    || task.activeSurprises.length !== task.identity?.surprises || ![0, 1, 2].includes(task.identity?.surprises)
    || new Set(task.activeSurprises.map(s => `${s?.device}/${s?.port}`)).size !== task.activeSurprises.length) return bad();
  const tables = compile(task.topology, task.configurations, task.vendor);
  if (!tables) return bad();
  const walks = reach(task.topology, tables);
  if (Object.values(walks).some(w => w.hops.some(h => h.dropped.some(d => d.code === 'unmodelled')))) return bad();
  const classKey = host => [host, ...walks[host].received].sort().join(',');
  const available = new Set(task.topology.hosts.map(h => classKey(h.device))).size;
  if (task.rounds.length !== (available <= 3 ? 3 : 4)
    || new Set(task.rounds.map(r => classKey(r.from))).size !== Math.min(task.rounds.length, available)) return bad();
  const vids = makeRng(task.identity.seed).shuffle([10, 20, 30, 40, 50, 100, 200]).slice(0, 3);
  const groupByHost = Object.fromEntries(variant.placements.flat().map((group, i) => [`PC${i + 1}`, vids[group]]));
  if (!same(task.topology.devices.filter(d => d.kind === 'switch').map(d => d.id), variant.placements.map((_, i) => `SW${i + 1}`))
    || !same(task.topology.hosts.map(h => h.device), Object.keys(groupByHost))) return bad();
  for (const slot of task.activeSurprises) {
    if (!object(slot) || !variant.slots[task.vendor].includes(slot.id)) return bad();
    const alt = structuredClone(task.configurations);
    if (['access-a', 'access-b', 'pvid-one'].includes(slot.id)) {
      const host = slot.id === 'access-a' ? 'PC1' : variant.id === 'p1' ? 'PC3' : 'PC2';
      const end = peer(task.topology, host, 'nic'), correct = groupByHost[host];
      if (slot.device !== end.device || slot.port !== end.port) return bad();
      const changed = slot.id === 'pvid-one' ? 1 : correct === vids[0] ? vids[1] : vids[0];
      if (task.vendor === 'cisco') {
        if (alt[end.device].ports[end.port].vlan !== changed) return bad();
        alt[end.device].ports[end.port].vlan = correct;
      } else {
        if (alt[end.device].ports[end.port].pvid !== changed) return bad();
        alt[end.device].ports[end.port].pvid = correct;
        for (const row of alt[end.device].vlans) row.untagged = row.untagged.filter(p => p !== end.port);
        let row = alt[end.device].vlans.find(r => r.vids.includes(correct));
        if (!row) { row = { vids: [correct], tagged: [], untagged: [] }; alt[end.device].vlans.push(row); }
        row.untagged.push(end.port);
      }
    } else if (slot.id === 'filtering-off') {
      if (slot.device !== (variant.id === 'p1' ? 'SW1' : 'SW2') || slot.port !== 'bridge' || alt[slot.device]?.filtering !== false) return bad();
      alt[slot.device].filtering = true;
    } else if (slot.id === 'trunk-untagged') {
      if (slot.device !== 'SW2' || slot.port !== 't1' || alt.SW2.ports.t1.frameTypes !== 'admit-only-untagged-and-priority-tagged') return bad();
      alt.SW2.ports.t1.frameTypes = 'admit-only-vlan-tagged';
    } else if (slot.id === 'missing-transit') {
      if (slot.device !== 'SW2' || slot.port !== 'database' || alt.SW2.vlans.includes(vids[1])) return bad();
      alt.SW2.vlans.push(vids[1]);
    } else {
      const device = slot.id === 'allowed-a' ? 'SW1' : 'SW2';
      const port = slot.id === 'allowed-a' || variant.id === 'p2' ? 't1' : 't2';
      const vid = slot.id === 'allowed-a' ? vids[0] : vids[1];
      if (slot.device !== device || slot.port !== port) return bad();
      if (task.vendor === 'cisco') {
        if (alt[device].ports[port].allowed.includes(vid)) return bad();
        alt[device].ports[port].allowed.push(vid);
      } else {
        const row = alt[device].vlans.find(r => r.vids.includes(vid));
        if (!row || row.tagged.includes(port)) return bad();
        row.tagged.push(port);
      }
    }
    const alternative = compile(task.topology, alt, task.vendor);
    if (!alternative || !task.rounds.some(r => key(walks[r.from]) !== key(flood(task.topology, alternative, { from: r.from })))) return bad();
  }
  return [];
}

export function validatePortsInstance(task, answer, syntax = task?.syntax) {
  if (validateTopology(task?.topology).length || !object(task.goals) || task.topology.hosts.some(h => !validVid(task.goals[h.device]))) return bad();
  if (answer && !compile(task.topology, answer, syntax)) return bad();
  return [];
}
export function validateBank(bank) {
  const { predict, ports, route, faults } = bank ?? {};
  if (!Array.isArray(predict) || !Array.isArray(ports) || !predict.length || !ports.length) return bad();
  const records = [...predict, ...ports, ...(Array.isArray(route) ? route : []), ...(Array.isArray(faults) ? faults : [])];
  if (route !== undefined && (!Array.isArray(route) || !route.length)) return bad();
  if (faults !== undefined && (!Array.isArray(faults) || !faults.length)) return bad();
  return new Set(records.map(r => r?.id)).size === records.length
    ? [...predict, ...ports].flatMap(validateRecord).concat((route ?? []).flatMap(validateRouteRecord), (faults ?? []).flatMap(validateFaultRecord)) : bad();
}

/** VLAN-2 banks are separate from VLAN-1 placements and surprise slots. */
export function validateRouteRecord(r) {
  if (!only(r, ['id', 'version', 'variants']) || r.version !== 1 || !Array.isArray(r.variants) || r.variants.length !== 1) return bad();
  const v = r.variants[0];
  return only(v, ['id', 'title', 'task', 'syntaxes']) && v.id === 'main' && typeof v.title === 'string'
    && [1, 2, 3, 4].includes(v.task) && r.id === `vlan.route-${v.task}`
    && same(v.syntaxes, v.task === 4 ? ['routeros'] : ['cisco', 'routeros']) ? [] : bad();
}

function validRouteTopology(task) {
  if (validateTopology(task.topology).length) return false;
  const ofKind = kind => task.topology.devices.filter(d => d.kind === kind);
  return ofKind('router').length === 1 && ofKind('router')[0].id === 'R1'
    && ofKind('switch').length === 1 && ofKind('switch')[0].id === 'SW1'
    && task.topology.hosts.length === (task.taskNumber === 2 ? 6 : 4);
}

function validRouteIdentity(task) {
  return task.identity?.exerciseId === 'vlan-route'
    && task.identity?.taskId === `vlan.route-${task.taskNumber}`
    && task.identity?.variantId === 'main' && task.identity?.generatorVersion === 1;
}

function validRouteNetworks(task) {
  const count = task.taskNumber === 1 || task.taskNumber === 4 ? 2 : 3;
  if (!object(task.goals) || !Array.isArray(task.networks) || task.networks.length !== count) return false;
  const validNetwork = n => validVid(n?.vid) && n.vid !== 1 && n.prefix === 24
    && role(n.gateway, n.network, n.prefix) === 'host';
  const validHostNetwork = h => validVid(task.goals[h.device]) && task.networks.some(n =>
    n.vid === task.goals[h.device] && sameNetwork(n.network, h.ip, n.prefix)
    && h.gateway === n.gateway && h.prefix === n.prefix && h.ip !== h.gateway);
  return new Set(task.networks.map(n => n?.vid)).size === count
    && new Set(task.networks.map(n => n?.network)).size === count
    && same(task.vids, task.networks.map(n => n?.vid))
    && task.networks.every(validNetwork) && task.topology.hosts.every(validHostNetwork);
}

function validManagementGiven(task) {
  if (task.taskNumber !== 3) return true;
  const m = task.management;
  return !!m && m.vid !== 1 && !Object.values(task.goals).includes(m.vid)
    && task.networks.some(n => n.vid === m.vid && n.gateway === m.gateway
      && n.network === m.network && n.prefix === m.prefix);
}

export function validateRouteInstance(task, answer, syntax = task?.syntax) {
  if (!task || ![1, 2, 3, 4].includes(task.taskNumber) || !vendors.includes(syntax)
    || (task.taskNumber === 4 && syntax !== 'routeros') || !validRouteTopology(task)
    || !validRouteIdentity(task) || !validRouteNetworks(task) || !validManagementGiven(task)) return bad();
  if (answer) {
    const compiled = compileL3(task.topology, answer, syntax, { gateways: task.networks.map(n => n.gateway) });
    if (compiled.findings.some(f => f.severity === 'blocks')) return bad();
    const { topology, tables } = compiled;
    for (const n of task.networks) if (!topology.attachments.some(a => a.device === 'R1' && a.ip === n.gateway && a.prefix === n.prefix)) return bad();
    for (const a of topology.hosts) for (const b of topology.hosts) if (a !== b && !ping3(topology, tables, a.device, b.device).ok) return bad();
    const walks = topology.hosts.map(h => flood(topology, tables, { from: h.device }));
    if (walks.some(w => w.arrivals.some(a => task.goals[w.from] !== task.goals[a.host]))) return bad();
    if (task.management) {
      const a = topology.attachments.find(a => a.device === 'SW1');
      if (!a || topology.attachments.filter(a => a.device === 'SW1').some(a => a.vid !== task.management.vid || role(a.ip, task.management.network, task.management.prefix) !== 'host')
        || !ping3(topology, tables, task.management.admin, a.id).ok
        || !ping3(topology, tables, task.management.admin, task.management.gateway).ok
        || flood(topology, tables, { from: a.id }).arrivals.length
        || walks.some(w => w.received.has(a.id))) return bad();
    }
  }
  return [];
}

// VLAN-3 validation consumes tooling-only inspect output. It replays every
// candidate with engine primitives; it never trusts validity flags, grids,
// signatures or canonical answers supplied by the generator.
export function validateFaultRecord(r) {
  if (!only(r, ['id', 'version', 'variants']) || r.id !== 'vlan.faults' || r.version !== 1
    || !Array.isArray(r.variants) || !r.variants.length || new Set(r.variants.map(v => v?.id)).size !== r.variants.length) return bad();
  for (const v of r.variants) {
    if (!only(v, ['id', 'title', 'placements', 'objective', 'task', 'levels', 'syntaxes']) || typeof v.id !== 'string' || typeof v.title !== 'string'
      || !Array.isArray(v.levels) || !v.levels.length || new Set(v.levels).size !== v.levels.length || v.levels.some(n => ![1, 2, 3].includes(n))
      || !Array.isArray(v.syntaxes) || !v.syntaxes.length || new Set(v.syntaxes).size !== v.syntaxes.length || v.syntaxes.some(s => !vendors.includes(s))) return bad();
    if (v.task !== undefined) {
      if (![1, 2, 3, 4].includes(v.task) || v.levels.includes(1) || (v.task === 4 && !same(v.syntaxes, ['routeros']))) return bad();
    } else if (validateRecord({ id: 'shape', version: 1, variants: [{ id: v.id, title: v.title, placements: v.placements, objective: v.objective }] }).length
      || v.placements.length < 2 || (v.levels.includes(1) && v.placements.length !== 2)) return bad();
  }
  return [];
}
const faultCodes = ['trunk-missing-vlan', 'access-wrong-vlan', 'transit-vlan-missing', 'filtering-off', 'trunk-frame-types',
  'native-mismatch', 'trunk-is-access', 'access-frame-types', 'parent-shutdown', 'wrong-encapsulation',
  'router-address-wrong-network', 'vlan-if-on-bridge-port', 'bridge-not-tagged', 'access-is-trunk'];
function faultCompile(task, answer) {
  if (task.taskNumber) return compileL3(task.topology, answer, task.vendor, { gateways: task.networks.map(n => n.gateway) });
  const tables = {}, findings = [];
  if (!compile(task.topology, answer, task.vendor)) findings.push({ code: 'invalid-config', severity: 'blocks' });
  for (const d of switches(task.topology)) {
    const c = (task.vendor === 'cisco' ? compileCisco : compileRouterOS)(answer?.[d.id]);
    tables[d.id] = c.table;
    findings.push(...c.findings.map(f => ({ ...f, entity: d.id })));
  }
  return { topology: task.topology, tables, findings };
}
function faultHealthy(task, answer) {
  const c = faultCompile(task, answer), g = observeVlan(task, c);
  if (g.invalid || [...g.reachability, ...g.isolation].some(r => !r.observed) || hasUnmodelled(g)) return false;
  if (task.taskNumber && task.networks.some(n => !c.topology.attachments.some(a => a.device === 'R1' && a.ip === n.gateway && a.prefix === n.prefix))) return false;
  if (task.management && c.topology.attachments.filter(a => a.device === 'SW1').some(a => a.vid !== task.management.vid || role(a.ip, task.management.network, task.management.prefix) !== 'host')) return false;
  if (task.objective === 'local-c') for (const h of task.topology.hosts.filter(h => task.goals[h.device] === task.vids[2])) {
    if (flood(c.topology, c.tables, { from: h.device }).hops.some(h => h.device === 'SW1' && h.out.some(o => trunk(task.topology, h.device, o.port)))) return false;
  }
  return true;
}

// Independent semantic reconstruction rejects a valid-looking grid produced
// by two edits. Rows/ports outside the one planter must be unchanged.
function expectedFault(baseline, s, vendor) {
  const result = structuredClone(baseline), c = result[s.device], p = c?.ports?.[s.port];
  if (!c || !faultCodes.includes(s.code)) return null;
  switch (s.code) {
    case 'trunk-missing-vlan':
      if (!p) return null;
      if (vendor === 'cisco') p.allowed = (p.allowed === 'all' ? [...compileCisco(c).table.vlans] : p.allowed).filter(v => v !== s.vid);
      else for (const row of c.vlans.filter(r => r.vids.includes(s.vid))) {
        if (row.vids.length > 1) { c.vlans.push({ ...structuredClone(row), vids: row.vids.filter(v => v !== s.vid) }); row.vids = [s.vid]; }
        row.tagged = row.tagged.filter(p => p !== s.port);
      }
      break;
    case 'access-is-trunk':
      if (vendor !== 'cisco' || !p) return null;
      c.ports[s.port] = { mode: 'trunk', allowed: [...c.vlans] }; break;
    case 'access-wrong-vlan':
      if (!p || s.changed === s.vid) return null;
      if (vendor === 'cisco') p.vlan = s.changed;
      else {
        p.pvid = s.changed;
        for (const row of c.vlans) row.untagged = row.untagged.filter(p => p !== s.port);
        if (s.changed !== 1) {
          let row = c.vlans.find(r => r.vids.length === 1 && r.vids[0] === s.changed);
          if (!row) { row = { vids: [s.changed], tagged: [], untagged: [] }; c.vlans.push(row); }
          row.untagged.push(s.port);
        }
      }
      break;
    case 'transit-vlan-missing':
      if (vendor !== 'cisco' || Object.values(c.ports).some(p => p.mode === 'access' && p.vlan === s.vid)) return null;
      c.vlans = c.vlans.filter(v => v !== s.vid); break;
    case 'filtering-off': c.filtering = false; break;
    case 'trunk-frame-types': p.frameTypes = 'admit-only-untagged-and-priority-tagged'; break;
    case 'access-frame-types': p.frameTypes = 'admit-only-vlan-tagged'; break;
    case 'trunk-is-access': c.ports[s.port] = { mode: 'access', vlan: s.changed }; break;
    case 'native-mismatch': p.native = s.changed; break;
    case 'parent-shutdown': c.interfaces[s.port].up = false; break;
    case 'wrong-encapsulation': (vendor === 'cisco' ? c.subifs : c.vlanIfs)[s.index].vid = s.changed; break;
    case 'router-address-wrong-network': (vendor === 'cisco' ? c.subifs : c.addresses)[s.index].ip = s.changed; break;
    case 'vlan-if-on-bridge-port': if (!p) return null; c.vlanIfs[s.index].on = s.port; break;
    case 'bridge-not-tagged': for (const row of c.vlans.filter(r => r.vids.includes(s.vid))) {
      if (row.vids.length > 1) { c.vlans.push({ ...structuredClone(row), vids: row.vids.filter(v => v !== s.vid) }); row.vids = [s.vid]; }
      row.tagged = row.tagged.filter(p => p !== 'bridge1');
    } break;
  }
  return result;
}
// Site completeness is derived from the baseline rather than the generator's
// candidate list. Removing a competing cause from inspect output cannot make
// an ambiguous planting validate. Numbers here are the v1 planter domains.
const faultSiteProof = s => JSON.stringify([s.code, s.device, s.port, s.vid, s.changed, s.index]);
function expectedFaultSites(task, baseline) {
  const result = [], cisco = task.vendor === 'cisco';
  const add = (code, device, port, extra = {}) => result.push({ code, device, port, ...extra });
  for (const d of task.topology.devices.filter(d => d.kind !== 'host')) {
    const c = baseline[d.id], ports = Object.entries(c.ports ?? {});
    for (const [port, p] of ports) {
      const other = peer(task.topology, d.id, port), vid = task.goals[other?.device];
      if (vid !== undefined) {
        for (const changed of new Set([1, ...Object.values(task.goals)])) if (changed !== vid) add('access-wrong-vlan', d.id, port, { vid, changed, slot: `host:${other.device}:to:${changed === 1 ? 'default' : task.vids.indexOf(changed)}` });
        if (cisco) add('access-is-trunk', d.id, port);
        else add('access-frame-types', d.id, port);
      } else {
        const carried = cisco ? p.allowed === 'all' ? c.vlans : p.allowed : c.vlans.filter(r => r.tagged.includes(port)).flatMap(r => r.vids);
        for (const vid of carried) add('trunk-missing-vlan', d.id, port, { vid, slot: task.vids.indexOf(vid) });
        if (cisco) {
          add('trunk-is-access', d.id, port, { changed: p.native ?? 1 });
          if (task.level === 3 && task.topology.devices.find(x => x.id === other?.device)?.kind === 'switch')
            for (const changed of [1, ...carried]) if (changed !== (p.native ?? 1)) add('native-mismatch', d.id, port, { changed, slot: changed === 1 ? 'default' : task.vids.indexOf(changed) });
        } else add('trunk-frame-types', d.id, port);
      }
    }
    if (!cisco && c.ports) add('filtering-off', d.id, 'bridge');
    if (cisco && d.kind === 'switch' && d.ports.filter(p => switches(task.topology).some(x => x.id === peer(task.topology, d.id, p.id)?.device)).length >= 2)
      for (const vid of c.vlans) if (!ports.some(([, p]) => p.mode === 'access' && p.vlan === vid)) add('transit-vlan-missing', d.id, 'database', { vid, slot: task.vids.indexOf(vid) });
    if (cisco && d.kind === 'router') for (const port of Object.keys(c.interfaces)) add('parent-shutdown', d.id, port);
    const rows = cisco ? c.subifs ?? [] : c.vlanIfs ?? [];
    for (const [index, row] of rows.entries()) {
      const changed = [10, 20, 30, 40, 50, 100, 200].find(v => !rows.some(r => r.vid === v));
      add('wrong-encapsulation', d.id, cisco ? row.parent : row.on, { index, changed, slot: index });
      if (!cisco && c.ports) {
        for (const port of Object.keys(c.ports)) add('vlan-if-on-bridge-port', d.id, port, { index, slot: index });
        if (d.dynamicBridgeTagged === false && row.on === 'bridge1') add('bridge-not-tagged', d.id, 'bridge1', { index, vid: row.vid, slot: index });
      }
    }
    if (d.kind === 'router') for (const [index, row] of (cisco ? c.subifs : c.addresses).entries()) {
      const family = task.networks[0].network.split('.').slice(0, 2).join('.');
      const octet = Array.from({ length: 220 }, (_, n) => n + 10).filter(n => !task.networks.some(net => Number(net.network.split('.')[2]) === n))[index];
      add('router-address-wrong-network', d.id, cisco ? row.parent : row.iface, { index, changed: `${family}.${octet}.1`, slot: index });
    }
  }
  return result;
}
/** Independent matrix: public topology/baseline and both declared capability
 * states, never the emitted candidate list or the randomly selected fault. */
export function expectedFaultCoverage(task, baseline) {
  return (task.vendor === 'routeros' ? [false, true] : [undefined]).flatMap(dynamic => {
    const t = structuredClone(task);
    for (const d of t.topology.devices.filter(d => d.kind !== 'host')) d.dynamicBridgeTagged = dynamic;
    return expectedFaultSites(t, baseline).filter(s => task.level === 3
      || (['parent-shutdown', 'wrong-encapsulation', 'router-address-wrong-network', 'vlan-if-on-bridge-port', 'bridge-not-tagged'].includes(s.code) ? 3 : 2) === (task.level === 1 ? 2 : 3))
      .map(s => `${s.code}/${s.device}/${s.port}/${s.slot ?? ''}/${dynamic === undefined ? 'default' : dynamic ? 'dynamic' : 'static'}`);
  }).sort();
}
function differentFields(a, b, path = []) {
  if (same(a, b)) return [];
  if ((object(a) && object(b)) || (path.at(-1) === 'vlans' && Array.isArray(a) && Array.isArray(b) && [...a, ...b].every(object))) return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => differentFields(a[k], b[k], [...path, k]));
  return [path];
}
function unchangedFindings(task, baseline, faulty) {
  const fields = differentFields(baseline, faulty);
  // CPU-tag advice is derived from VLAN interfaces, not an unrelated row edit.
  const apart = f => !fields.some(p => p[0] === f.entity && ((f.code === 'bridge-tag-implicit' && p[1] === 'vlanIfs') || !f.field || f.field.startsWith(p.slice(1).join('.')) || p.slice(1).join('.').startsWith(f.field)));
  return same(faultCompile(task, baseline).findings.filter(apart), faultCompile(task, faulty).findings.filter(apart));
}
export function validateFaultInstance(inspection) {
  try {
    const { task, baseline, faulty, site, candidates, repaired } = inspection ?? {};
    if (!task || validateTopology(task.topology).length || !vendors.includes(task.vendor)
      || validateFaultRecord({ id: 'vlan.faults', version: 1, variants: [task.shapeSpec] }).length
      || task.identity?.exerciseId !== 'vlan-faults' || task.identity.shape !== task.shapeSpec.id
      || task.identity.vendor !== task.vendor || task.identity.level !== task.level
      || !task.shapeSpec.levels.includes(task.level) || !task.shapeSpec.syntaxes.includes(task.vendor)
      || !same(faulty, task.initialConfiguration) || !faultHealthy(task, baseline)
      || !Array.isArray(candidates) || !candidates.length || !candidates.some(c => same(c.site, site) && same(c.faulty, faulty))) return bad();
    if (task.vendor === 'routeros' && (typeof task.capabilities?.dynamicBridgeTagged !== 'boolean'
      || task.topology.devices.filter(d => d.kind !== 'host').some(d => d.dynamicBridgeTagged !== task.capabilities.dynamicBridgeTagged))) return bad();
    if (!same(expectedFaultSites(task, baseline).map(faultSiteProof).sort(), candidates.map(c => faultSiteProof(c.site)).sort())) return bad();
    const state = faultCompile(task, faulty), grid = observeVlan(task, state);
    if (grid.invalid || !observableVlan(grid) || hasUnmodelled(grid) || same(faulty, baseline)
      || !same(expectedFault(baseline, site, task.vendor), faulty) || !unchangedFindings(task, baseline, faulty)) return bad();
    const selected = vlanEvidenceKey(grid);
    for (const c of candidates) {
      if (!same(expectedFault(baseline, c.site, task.vendor), c.faulty)) return bad();
      if (c.site.code === 'native-mismatch' && (task.level !== 3 || task.taskNumber || task.topology.devices.find(d => d.id === peer(task.topology, c.site.device, c.site.port)?.device)?.kind !== 'switch')) return bad();
      if (c.site.code === 'bridge-not-tagged' && task.topology.devices.find(d => d.id === c.site.device)?.dynamicBridgeTagged !== false) return bad();
      const other = observeVlan(task, faultCompile(task, c.faulty));
      if (c.site.code !== site.code && !other.invalid && observableVlan(other) && !hasUnmodelled(other) && vlanEvidenceKey(other) === selected) return bad();
    }
    // Restore the one semantic edit and prove the canonical repaired network.
    if (!same(repaired, baseline) || !faultHealthy(task, repaired)) return bad();
    return [];
  } catch { return bad(); }
}
