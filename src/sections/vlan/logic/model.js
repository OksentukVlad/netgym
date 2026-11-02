import { makeRng } from '../../../engine/rng.js';
import { compileCisco, compileRouterOS, object, peer } from '../../../engine/l2.js';
export const clone = v => JSON.parse(JSON.stringify(v));
export const vendors = ['cisco', 'routeros'];
export const pool = [10, 20, 30, 40, 50, 100, 200];
export const validSeed = seed => typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed));
export const validRecord = record => object(record) && typeof record.id === 'string' && record.id.length > 0 && Number.isInteger(record.version) && record.version > 0
  && Object.keys(record).every(k => ['id', 'version', 'variants'].includes(k))
  && Array.isArray(record.variants) && record.variants.length > 0 && new Set(record.variants.map(v => v?.id)).size === record.variants.length
  && record.variants.every(v => object(v) && typeof v.id === 'string' && typeof v.title === 'string'
    && Object.keys(v).every(k => ['id', 'title', 'placements', 'objective', 'slots'].includes(k))
    && [null, undefined, 'local-c', 'transit-b'].includes(v.objective)
    && Array.isArray(v.placements) && v.placements.length >= 1 && v.placements.length <= 3
    && v.placements.every(p => Array.isArray(p) && p.length > 0 && p.length <= 6 && p.every(g => [0, 1, 2].includes(g)))
    && v.placements.flat().length >= 4 && v.placements.flat().length <= 8);
export const switches = topology => topology.devices.filter(d => d.kind === 'switch');
export const label = (topology, device, port, syntax) => topology.devices.find(d => d.id === device)?.ports.find(p => p.id === port)?.label[syntax] ?? port;
export const hostPort = (topology, host) => peer(topology, host, 'nic');
export const isTrunk = (topology, device, port) => ['switch', 'router'].includes(topology.devices.find(d => d.id === peer(topology, device, port)?.device)?.kind);

/** Given configurations use displayed vendor port order, including trunks.
 * Stable IDs alone put RouterOS ether1 (t1) after its access ports. */
export function orderedPorts(device, syntax) {
  return [...device.ports].sort((a, b) => a.label[syntax].localeCompare(b.label[syntax], 'en', { numeric: true }));
}

/** Caption for an editable port; host identity is a given physical link. */
export function portCaption(topology, device, port, syntax) {
  const other = peer(topology, device, port);
  const host = topology.hosts.find(h => h.device === other?.device);
  const name = label(topology, device, port, syntax);
  return host ? `${name} — ${host.device}` : name;
}

/** Same seed means identical geometry, addresses and goals in both syntaxes. */
export function generateNetwork(variant, seed) {
  const rng = makeRng(seed), vids = rng.shuffle(pool).slice(0, 3);
  const topology = { devices: [], links: [], hosts: [] }, goals = {};
  let hostNumber = 0;
  variant.placements.forEach((groups, i) => {
    const id = `SW${i + 1}`, used = rng.shuffle(Array.from({ length: 6 }, (_, p) => p + 1)).slice(0, groups.length);
    const ports = used.map(p => ({ id: `a${p}`, label: { cisco: `fa0/${p}`, routeros: `ether${p + 1}` } }));
    if (i > 0) ports.push({ id: 't1', label: { cisco: 'gi0/1', routeros: 'ether1' } });
    if (i < variant.placements.length - 1) ports.push({ id: i === 0 ? 't1' : 't2', label: { cisco: i === 0 ? 'gi0/1' : 'gi0/2', routeros: i === 0 ? 'ether1' : 'ether8' } });
    topology.devices.push({ id, kind: 'switch', ports });
    groups.forEach((group, j) => {
      const device = `PC${++hostNumber}`;
      topology.devices.push({ id: device, kind: 'host', ports: [{ id: 'nic', label: { cisco: 'nic', routeros: 'nic' } }] });
      topology.hosts.push({ device, ip: `192.168.${vids[group]}.${rng.int(2, 25) + hostNumber * 25}`, prefix: 24 });
      topology.links.push({ a: { device, port: 'nic' }, b: { device: id, port: ports[j].id } });
      goals[device] = vids[group];
    });
    if (i > 0) topology.links.push({ a: { device: `SW${i}`, port: i === 1 ? 't1' : 't2' }, b: { device: id, port: 't1' } });
  });
  return { topology, vids, goals, objective: variant.objective ?? null };
}

/** VLANs needed across an edge, from public host goals on both sides. */
export function neededOnTrunk(task, device, port) {
  const next = peer(task.topology, device, port), visited = new Set([device]), queue = next ? [next.device] : [], beyond = new Set();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (visited.has(id)) continue;
    visited.add(id);
    if (task.goals[id] !== undefined) beyond.add(task.goals[id]);
    for (const link of task.topology.links) {
      if (link.a.device === id && !visited.has(link.b.device)) queue.push(link.b.device);
      if (link.b.device === id && !visited.has(link.a.device)) queue.push(link.a.device);
    }
  }
  const here = new Set(Object.entries(task.goals).filter(([id]) => !visited.has(id)).map(([, vid]) => vid));
  return [...beyond].filter(vid => here.has(vid)).sort((a, b) => a - b);
}

export function reference(task, syntax) {
  return Object.fromEntries(switches(task.topology).map(d => {
    const ports = {}, memberships = {};
    for (const p of d.ports) {
      const other = peer(task.topology, d.id, p.id);
      if (!other) continue;
      const trunk = isTrunk(task.topology, d.id, p.id), vlans = trunk ? neededOnTrunk(task, d.id, p.id) : [task.goals[other.device]];
      if (syntax === 'cisco') ports[p.id] = trunk ? { mode: 'trunk', allowed: vlans } : { mode: 'access', vlan: vlans[0] };
      else ports[p.id] = { pvid: trunk ? 1 : vlans[0], frameTypes: trunk ? 'admit-only-vlan-tagged' : 'admit-only-untagged-and-priority-tagged' };
      for (const vid of vlans) (memberships[vid] ??= { vids: [vid], tagged: [], untagged: [] })[trunk ? 'tagged' : 'untagged'].push(p.id);
    }
    return [d.id, syntax === 'cisco' ? { vlans: Object.keys(memberships).map(Number), ports } : { filtering: true, ports, vlans: Object.values(memberships) }];
  }));
}

export function compileAll(topology, answer, syntax) {
  const tables = {}, findings = [];
  if (!vendors.includes(syntax) || !object(answer)) return { tables, findings: [{ code: 'invalid-config', severity: 'blocks' }] };
  for (const key of Object.keys(answer)) if (!switches(topology).some(d => d.id === key)) findings.push({ code: 'invalid-config', severity: 'blocks', entity: key });
  for (const d of switches(topology)) {
    const config = answer[d.id], result = syntax === 'cisco' ? compileCisco(config) : compileRouterOS(config);
    tables[d.id] = result.table;
    findings.push(...result.findings.map(f => ({ ...f, entity: d.id })));
    if (!object(config?.ports)) continue;
    for (const p of Object.keys(config.ports)) if (!d.ports.some(port => port.id === p)) findings.push({ code: 'invalid-config', severity: 'blocks', entity: d.id, field: `ports.${p}` });
    for (const p of d.ports) if (peer(topology, d.id, p.id)) {
      const code = syntax === 'cisco' && config.ports[p.id]?.mode === null ? 'mode-not-set' : !config.ports[p.id] ? 'invalid-config' : null;
      if (code) findings.push({ code, severity: 'blocks', entity: d.id, field: `ports.${p.id}` });
    }
  }
  return { tables, findings };
}

export function identity(record, variant, seed, exerciseId, extra = {}) {
  return { formatVersion: 1, exerciseId, taskId: record.id, recordVersion: record.version, variantId: variant.id, seed, generatorVersion: 1, ...extra };
}
