import { sameNetwork } from '../../../engine/ip.js';
import { label, isTrunk } from './model.js';
import { peer } from '../../../engine/l2.js';
import { t } from '../uk.js';

/** With no evidence, describe only the given diagram/goals. Never computes a
 * walk, a domain or a reference. Pass check evidence explicitly after checking. */
export function describe(task, { syntax = task.vendor ?? task.syntax ?? 'cisco', walks = [] } = {}) {
  const lines = task.topology.hosts.map(h => `${h.device}: ${h.ip}/${h.prefix}${task.goals ? `, VLAN ${task.goals[h.device]}` : ''}`);
  for (const l of task.topology.links) lines.push(`${l.a.device} ${label(task.topology, l.a.device, l.a.port, syntax)} ↔ ${l.b.device} ${label(task.topology, l.b.device, l.b.port, syntax)}`);
  if (task.goals && walks.length) lines.push(t('reachability-abstraction'));
  for (const walk of walks) {
    lines.push(t('frame-source', { host: walk.from, tagged: walk.hops[0]?.tagged, vid: walk.hops[0]?.vid }));
    for (const hop of walk.hops) {
      if (hop.inPort !== null && task.topology.devices.find(d => d.id === hop.device)?.kind === 'switch') {
        const unclassified = hop.dropped.some(d => d.port === hop.inPort
          && ['untagged-not-admitted', 'tagged-not-admitted', 'unmodelled'].includes(d.code));
        const code = unclassified ? 'frame-arrival' : hop.transparent ? 'frame-transparent' : 'frame-ingress';
        lines.push(t(code, {
          device: hop.device, port: label(task.topology, hop.device, hop.inPort, syntax), vid: hop.vid,
        }));
      }
      for (const out of hop.out) if (hop.inPort !== null) lines.push(t(out.tagged ? 'frame-tagged-out' : !hop.transparent && !isTrunk(task.topology, hop.device, out.port) ? 'frame-access-out' : 'frame-untagged-out', { device: hop.device, port: label(task.topology, hop.device, out.port, syntax), vid: out.vid }));
      // Ordinary isolation (the frame not going out to another VLAN's access
      // ports) folds into one line per switch; trunk restrictions and
      // admission failures keep a line each.
      const quiet = hop.dropped.filter(d => d.code === 'not-allowed-out' && d.port !== hop.inPort && peer(task.topology, hop.device, d.port)
        && !isTrunk(task.topology, hop.device, d.port));
      for (const drop of hop.dropped) if (!quiet.includes(drop)) lines.push(`${hop.device} ${label(task.topology, hop.device, drop.port, syntax)}: ${t(drop.code)}`);
      if (quiet.length) lines.push(t('frame-other-access', { device: hop.device, count: quiet.length, ports: quiet.map(d => label(task.topology, hop.device, d.port, syntax)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(', ') }));
    }
    const source = task.topology.hosts.find(h => h.device === walk.from);
    for (const host of walk.received) {
      const dest = task.topology.hosts.find(h => h.device === host);
      if (source && dest && (!sameNetwork(source.ip, dest.ip, source.prefix) || !sameNetwork(source.ip, dest.ip, dest.prefix))) lines.push(t('address-other-network', { host }));
    }
  }
  return lines;
}
