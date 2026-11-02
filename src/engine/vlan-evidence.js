import { sameNetwork } from './ip.js';
import { flood, ping, ping3, attachmentStatus } from './l2.js';

/** First stop on the tree path, including the complete device/port/code.
 * Ignore ordinary isolation drops on unrelated branches. */
export function walkStop(topology, walk, to, attachments = topology.attachments ?? []) {
  const deviceOf = id => attachments.find(a => a.id === id)?.device ?? id;
  const from = deviceOf(walk.from), destination = deviceOf(to);
  const queue = [{ device: from, path: [] }], visited = new Set();
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    if (visited.has(entry.device)) continue;
    visited.add(entry.device);
    if (entry.device === destination) {
      for (const step of [...entry.path, { device: destination }]) for (const h of walk.hops.filter(h => h.device === step.device)) {
        const d = h.dropped.find(d => d.port === h.inPort || d.port === step.port || ['svi', 'bridge'].includes(d.port));
        if (d) return { device: h.device, port: d.port, code: d.code };
      }
      return null;
    }
    for (const link of topology.links) {
      const own = link.a.device === entry.device ? link.a : link.b.device === entry.device ? link.b : null;
      if (own) {
        const next = own === link.a ? link.b : link.a;
        queue.push({ device: next.device, path: [...entry.path, { device: own.device, port: own.port }] });
      }
    }
  }
  return null;
}

export function probeStops(topology, probe, tables = {}) {
  if (probe.walks) return probe.walks.map(w => w.received.has(w.from === probe.from ? probe.to : probe.from)
    ? null : walkStop(topology, w, w.from === probe.from ? probe.to : probe.from));
  return [probe.request, probe.reply].map(trace => {
    if (!trace || trace.ok) return null;
    const segments = trace.segments.filter(s => !s.ok);
    if (segments.length) return segments.map(segment => segment.walks.map(walk => {
      const to = segment.to === null ? 'R1' : walk.from === segment.from ? segment.to : segment.from;
      return walk.received.has(to) ? null : walkStop(topology, walk, to);
    }));
    const attachments = topology.attachments ?? [];
    const incoming = attachments.find(a => a.id === trace.segments.at(-1)?.to);
    const destination = [...topology.hosts.map(h => ({ ...h, id: h.device })), ...attachments].find(a => a.id === trace.to || a.ip === trace.to);
    const blocked = destination && incoming && attachments.filter(a => a.device === incoming.device && sameNetwork(a.ip, destination.ip, a.prefix))
      .sort((a, b) => b.prefix - a.prefix).find(a => attachmentStatus(topology, tables, a) === trace.code);
    const a = blocked || incoming || attachments.find(a => a.id === trace.from);
    return { device: a?.device ?? trace.from, port: a?.port ?? 'nic', code: trace.code };
  });
}

/** Expected reachability only; raw arrivals prove per-VLAN isolation in both
 * directions, including tagged frames and management attachments. No routing
 * segment is counted as an L2 leak. Safe to show as the initial symptom grid. */
export function observeVlan(task, { topology, tables, findings = [] }) {
  if (findings.some(f => f.severity === 'blocks')) return { reachability: [], isolation: [], invalid: true };
  const reachability = [], hosts = topology.hosts;
  const add = (from, to, kind) => {
    const result = task.taskNumber ? ping3(topology, tables, from, to) : ping(topology, tables, from, to);
    const probe = { id: `${kind}:${from}:${to}`, from, to, kind, ...result };
    reachability.push({ id: probe.id, from, to, kind, expected: true, observed: result.ok, stops: probeStops(topology, probe, tables), probe });
  };
  for (let i = 0; i < hosts.length; i++) for (let j = i + 1; j < hosts.length; j++) {
    if (task.taskNumber || task.goals[hosts[i].device] === task.goals[hosts[j].device]) add(hosts[i].device, hosts[j].device, 'pc-pair');
  }
  if (task.taskNumber) for (const h of hosts) add(h.device, topology.attachments.find(a => a.ip === h.gateway)?.id ?? h.gateway, 'gateway');
  if (task.management) {
    const a = topology.attachments.find(a => a.device === 'SW1');
    if (a) add(task.management.admin, a.id, 'management');
    else reachability.push({ id: 'management', kind: 'management', from: task.management.admin, to: 'SW1', expected: true, observed: false,
      stops: [{ device: 'SW1', port: 'svi', code: 'management-missing' }], probe: null });
    add(task.management.admin, topology.attachments.find(a => a.device === 'R1' && a.ip === task.management.gateway)?.id ?? task.management.gateway, 'gateway');
  }
  const walks = hosts.map(h => ({ vid: task.goals[h.device], walk: flood(topology, tables, { from: h.device }) }));
  if (task.management) for (const a of topology.attachments.filter(a => a.vid === task.management.vid)) walks.push({ vid: task.management.vid, walk: flood(topology, tables, { from: a.id }) });
  const vids = [...new Set([...Object.values(task.goals), ...(task.management ? [task.management.vid] : [])])];
  const isolation = vids.map(vid => {
    const sources = walks.filter(w => w.vid === vid), unexpected = [];
    for (const { walk } of sources) {
      for (const arrival of walk.arrivals) if (task.goals[arrival.host] !== vid) unexpected.push({ from: walk.from, host: arrival.host, vlan: task.goals[arrival.host], tagged: arrival.tagged, ...arrival.from });
      if (task.management && vid !== task.management.vid) for (const a of topology.attachments.filter(a => a.vid === task.management.vid)) {
        if (walk.received.has(a.id)) unexpected.push({ from: walk.from, host: a.id, vlan: a.vid, tagged: true, device: a.device, port: a.port });
      }
    }
    return { id: `vlan:${vid}`, vid, expected: true, observed: !unexpected.length, unexpected, walks: sources.map(s => s.walk) };
  });
  return { reachability, isolation, invalid: false };
}

/** All displayed outcomes + every probe's complete directional stop points. */
export const vlanEvidenceKey = grid => JSON.stringify({
  reachability: grid.reachability.map(r => [r.id, r.expected, r.observed, r.probe?.code ?? null,
    r.stops.map(direction => {
      const stops = [direction].flat(Infinity).filter(Boolean).map(s => [s.device, s.port, s.code]);
      return stops.length ? stops : null;
    })]),
  isolation: grid.isolation.map(r => [r.vid, r.expected, r.observed, [...new Set(r.unexpected.map(a => JSON.stringify([a.host, a.vlan])))].sort()]),
  invalid: grid.invalid,
});
export const observableVlan = grid => !grid.invalid && [...grid.reachability, ...grid.isolation].some(r => !r.observed);
export const hasUnmodelled = grid => [
  ...grid.isolation.flatMap(r => r.walks),
  ...grid.reachability.flatMap(r => r.probe?.walks ?? [r.probe?.request, r.probe?.reply].flatMap(t => t?.segments.flatMap(s => s.walks) ?? [])),
].some(w => w.hops.some(h => h.dropped.some(d => d.code === 'unmodelled')));
