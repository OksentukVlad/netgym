import { flood, ping, domains, peer } from '../../../engine/l2.js';
import {
  validRecord, validSeed, vendors, identity, generateNetwork, reference, compileAll,
  switches, isTrunk, hostPort, clone, label, neededOnTrunk,
} from './model.js';
import { codes } from './codes.js';
export { codes } from './codes.js';
export { portCaption } from './model.js';
export { render } from './render.js';
import { render } from './render.js';
export { describe } from './describe.js';
import { describe } from './describe.js';
export const id = 'vlan-ports', version = 1;

export function create(record, { variantId = record?.variants?.[0]?.id, seed = 0, syntax = 'cisco' } = {}) {
  if (!validRecord(record) || !validSeed(seed) || !vendors.includes(syntax)) throw new RangeError('invalid-record');
  const variant = record.variants.find(v => v.id === variantId);
  if (!variant) throw new RangeError('invalid-record');
  const ident = identity(record, variant, seed, id);
  return clone({ identity: ident, instanceKey: JSON.stringify(ident), title: variant.title, syntax, ...generateNetwork(variant, seed) });
}

/** Editable structured drafts, never prefilled with the reference. Keep one
 * per instance and syntax. No native/DTP/ingress-filter fields in VLAN-1. */
export function initialAnswer(task, syntax = task.syntax) {
  if (!vendors.includes(syntax)) throw new RangeError('invalid-config');
  return Object.fromEntries(switches(task.topology).map(d => [d.id, syntax === 'cisco'
    ? { vlans: [], ports: Object.fromEntries(d.ports.map(p => [p.id, { mode: null }])) }
    : { filtering: false, ports: Object.fromEntries(d.ports.map(p => [p.id, { pvid: 1, frameTypes: 'admit-all' }])), vlans: [] }]));
}

function diagnose(task, answer, syntax, walks, from) {
  if (syntax === 'cisco') for (const walk of walks) for (const hop of walk.hops) {
    if (hop.tagged && hop.dropped.some(d => d.code === 'tagged-not-admitted') && answer[hop.device]?.ports[hop.inPort]?.mode === 'access'
      && isTrunk(task.topology, hop.device, hop.inPort)) return 'trunk-faces-access';
  }
  const middleDrop = walks.some(w => w.hops.some(h => h.device === 'SW2'
    && h.dropped.some(d => isTrunk(task.topology, h.device, d.port))));
  return task.objective === 'transit-b' && task.goals[from] === task.vids[1] && middleDrop
    ? 'carry-through-middle' : null;
}

export function check(task, answer, { syntax = task.syntax } = {}) {
  const { tables, findings: compiled } = compileAll(task.topology, answer, syntax);
  return evaluate(task, { tables, findings: compiled }, { answer, syntax });
}

/** Behaviour over the supplied compiled tables; never restores givens. */
export function evaluate(task, { tables, findings: compiled }, { answer = {}, syntax = task.syntax } = {}) {
  // Inferences are for displaying the supplied configuration, not advice or
  // reference membership; form failures short-circuit all behavioural evidence.
  const findings = compiled.filter(f => f.severity === 'blocks');
  const evidence = { probes: [], objectives: [] };
  const finish = () => {
    const ok = !findings.some(f => f.severity === 'blocks');
    return { ok, complete: ok, code: findings.find(f => f.severity === 'blocks')?.code ?? 'ok', findings, evidence };
  };
  if (findings.length) return finish();
  evidence.assumptions = ['reachability-abstraction'];
  const walks = Object.fromEntries(task.topology.hosts.map(h => [h.device, flood(task.topology, tables, { from: h.device })]));
  const hosts = task.topology.hosts.map(h => h.device);
  const add = (code, probe, params = {}) => findings.push({ code, severity: 'blocks', entity: probe.id, params: { from: probe.from, to: probe.to, ...params } });
  // Task 3 checks SW1's actual egress, even if its neighbour drops the frame.
  if (task.objective === 'local-c') {
    const vid = task.vids[2];
    for (const from of hosts.filter(h => task.goals[h] === vid)) {
      const walk = walks[from], escapes = walk.hops.flatMap(h => h.device === 'SW1' ? h.out.filter(o => isTrunk(task.topology, h.device, o.port)).map(o => ({ device: h.device, ...o })) : []);
      const objective = { id: `local:${from}`, from, ok: !escapes.length, code: escapes.length ? 'vlan-leaves-switch' : 'ok', walk, egress: escapes };
      evidence.objectives.push(objective);
      if (!objective.ok) add('vlan-leaves-switch', objective);
    }
  }
  for (let i = 0; i < hosts.length; i++) for (let j = i + 1; j < hosts.length; j++) {
    const from = hosts[i], to = hosts[j], id = `${from}:${to}`, same = task.goals[from] === task.goals[to];
    if (same) {
      const result = ping(task.topology, tables, from, to);
      const code = result.ok ? 'ok' : result.code === 'different-network' ? 'different-network' : 'must-ping';
      const probe = { id, from, to, ok: result.ok, code, reachability: result.code, walks: result.walks };
      const diagnosis = diagnose(task, answer, syntax, result.walks, from);
      if (diagnosis && !probe.ok) probe.diagnosis = diagnosis;
      evidence.probes.push(probe);
      if (!probe.ok) add(code, probe, diagnosis ? { diagnosis } : {});
    } else {
      const pairWalks = [walks[from], walks[to]], leaked = pairWalks[0].arrivals.some(a => a.host === to) || pairWalks[1].arrivals.some(a => a.host === from);
      const probe = { id, from, to, ok: !leaked, code: leaked ? 'must-not-reach' : 'ok', walks: pairWalks };
      evidence.probes.push(probe);
      if (leaked) add('must-not-reach', probe);
    }
  }
  if (findings.length) return finish();
  evidence.domains = domains(task.topology, tables);
  const advice = [];
  const advise = (code, device, port) => { if (!advice.some(f => f.code === code)) advice.push({ code, severity: 'advice', entity: device, field: `ports.${port}` }); };
  for (const d of switches(task.topology)) for (const p of d.ports) {
    if (!peer(task.topology, d.id, p.id)) continue;
    const port = answer[d.id]?.ports?.[p.id] ?? {}, trunk = isTrunk(task.topology, d.id, p.id);
    if (trunk) {
      if (syntax === 'cisco' && port.allowed === 'all') advise('allowed-all', d.id, p.id);
      if (syntax === 'routeros' && port.frameTypes !== 'admit-only-vlan-tagged') advise('trunk-frame-types', d.id, p.id);
      const needed = neededOnTrunk(task, d.id, p.id);
      // Equivalent renumberings are accepted. Unused means absent from hosts'
      // actual ingress classifications, not absent from the reference layout.
      const usedActual = new Set(task.topology.hosts.filter(h => needed.includes(task.goals[h.device])).map(h => {
        const end = hostPort(task.topology, h.device); return tables[end.device].ports[end.port].pvid;
      }));
      const localC = new Set(task.topology.hosts.filter(h => task.goals[h.device] === task.vids[2]).map(h => {
        const end = hostPort(task.topology, h.device);
        return tables[end.device].ports[end.port].pvid;
      }));
      const excess = Object.entries(tables[d.id].members).some(([vid, m]) => {
        if (!(m.tagged.has(p.id) || m.untagged.has(p.id)) || usedActual.has(Number(vid))) return false;
        // SW1 carrying C is already a blocking objective; other excess still earns advice.
        if (task.objective === 'local-c' && d.id === 'SW1' && localC.has(Number(vid))) return false;
        // PVID-generated membership is not an explicitly configured carried VLAN.
        return syntax !== 'routeros' || (answer[d.id]?.vlans ?? []).some(row => row.vids.includes(Number(vid))
          && (row.tagged.includes(p.id) || row.untagged.includes(p.id)));
      });
      if (excess) advise('trunk-carries-unused', d.id, p.id);
    } else {
      if (tables[d.id].ports[p.id].pvid === 1) advise('user-port-vlan-1', d.id, p.id);
      if (syntax === 'routeros' && port.frameTypes !== 'admit-only-untagged-and-priority-tagged') advise('access-frame-types', d.id, p.id);
    }
  }
  findings.push(...advice.slice(0, 2));
  return finish();
}

export function solution(task, syntax = task.syntax) {
  if (!vendors.includes(syntax)) throw new RangeError('invalid-config');
  return reference(task, syntax);
}

/** Evidence rung describes only this submitted answer's first failed path.
 * No call to solution(), no target VLAN/membership in hint parameters. */
export function hints(task, answer, { syntax = task.syntax } = {}) {
  const result = check(task, answer ?? initialAnswer(task, syntax), { syntax });
  const failed = result.evidence.probes.find(p => !p.ok);
  const objective = result.evidence.objectives.find(o => !o.ok);
  const first = result.findings.find(f => f.severity === 'blocks');
  let host = failed?.from ?? objective?.from ?? task.topology.hosts[0].device;
  const end = hostPort(task.topology, host);
  let stopped;
  if (failed?.code === 'must-not-reach') for (const walk of failed.walks) {
    const to = walk.from === failed.from ? failed.to : failed.from;
    const arrival = walk.arrivals.find(a => a.host === to);
    if (arrival) { stopped = { ...arrival.from, reason: 'must-not-reach' }; break; }
  }
  if (failed && !stopped) for (const walk of failed.walks ?? []) {
    const to = walk.from === failed.from ? failed.to : failed.from;
    if (walk.received.has(to)) continue;
    const taggedArrival = walk.arrivals.find(a => a.host === to && a.tagged);
    if (taggedArrival) { stopped = { ...taggedArrival.from, reason: 'host-got-tagged' }; break; }
    // Follow the tree path to this probe's destination; ordinary VLAN
    // isolation drops on unrelated branches are not evidence of its failure.
    const queue = [{ device: walk.from, path: [] }], visited = new Set();
    let path = [];
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      if (visited.has(entry.device)) continue;
      visited.add(entry.device);
      if (entry.device === to) { path = entry.path; break; }
      for (const link of task.topology.links) {
        const own = link.a.device === entry.device ? link.a : link.b.device === entry.device ? link.b : null;
        if (own) { const next = own === link.a ? link.b : link.a; queue.push({ device: next.device, path: [...entry.path, { device: own.device, port: own.port }] }); }
      }
    }
    for (const step of path) {
      const hop = walk.hops.find(h => h.device === step.device && h.inPort !== null);
      const drop = hop?.dropped.find(d => d.port === hop.inPort || d.port === step.port);
      if (drop) { stopped = { device: hop.device, port: drop.port, reason: drop.code }; break; }
    }
    if (stopped) break;
  }
  if (!stopped && objective?.egress.length) stopped = { ...objective.egress[0], reason: objective.code };
  const portId = stopped?.port ?? first?.field?.match(/^ports\.([^.]+)/)?.[1] ?? end.port;
  const device = stopped?.device ?? (switches(task.topology).some(d => d.id === first?.entity) ? first.entity : end.device);
  const port = label(task.topology, device, portId, syntax);
  const neighbour = peer(task.topology, device, portId);
  if (task.topology.hosts.some(h => h.device === neighbour?.device)) host = neighbour.device;
  return [
    { code: objective || task.objective === 'transit-b' || isTrunk(task.topology, device, portId) ? 'hint-trunk' : 'hint-port', params: { host }, rung: 1 },
    { code: 'hint-port-move', params: { device, port, host, vid: task.goals[host], syntax,
      trunk: isTrunk(task.topology, device, portId), vids: neededOnTrunk(task, device, portId),
      reason: stopped?.reason ?? first?.code ?? 'ok' }, rung: 2 },
    { code: 'hint-example', params: { syntax }, rung: 3 },
  ];
}
export default { id, version, codes, create, check, hints, solution, render, describe };
