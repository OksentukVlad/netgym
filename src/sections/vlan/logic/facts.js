import { peer } from '../../../engine/l2.js';
import { label, orderedPorts } from './model.js';

/** Label facts are device-qualified: SW1 and SW2 can both have fa0/1.
 * Pass the displayed port label, not an internal topology port id.
 */
export const portFact = (device, port) => ({ kind: 'port', value: `${device}:${port}` });
export const vlanFact = value => ({ kind: 'vlan', value: String(value) });

/** Configuration evidence, never intended membership or computed receivers.
 * RouterOS rows also carry the port's configured `frameTypes` (round 5
 * repair, Astra 1): a trunk that admits only untagged frames must not look
 * like a working trunk.
 * Topology supplies only physical port/host names. `allowed` is the configured
 * trunk list (RouterOS: tagged membership), even if filtering is off or the
 * Cisco VLAN database lacks a transit VLAN. `created` preserves that database
 * separately so a screen must not mistake an allowed VLAN for a created one.
 */
export function portEvidence(task) {
  const syntax = task.vendor ?? task.syntax;
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError('invalid-syntax');
  return Object.entries(task.configurations).flatMap(([device, config]) => {
    const node = task.topology.devices.find(d => d.id === device);
    return orderedPorts(node, syntax).filter(p => Object.hasOwn(config.ports, p.id)).map(p => {
      const configured = config.ports[p.id], other = peer(task.topology, device, p.id);
      const host = task.topology.devices.find(d => d.id === other?.device)?.kind === 'host' ? other.device : null;
      const row = { device, port: label(task.topology, device, p.id, syntax), host };
      if (syntax === 'cisco') return { ...row,
        ...(configured.mode === 'trunk' ? { allowed: [...configured.allowed], created: [...config.vlans] } : { vlan: configured.vlan }),
        filtering: true };
      const tagged = config.vlans.flatMap(v => v.tagged.includes(p.id) ? v.vids : []);
      return { ...row, pvid: configured.pvid, frameTypes: configured.frameTypes,
        ...(tagged.length || !host ? { allowed: [...new Set(tagged)].sort((a, b) => a - b) } : {}),
        filtering: config.filtering };
    });
  });
}

/** Direct facts for the evidence row; no text parsing or goal lookup. */
export function portEvidenceFacts(row) {
  const vlans = row.allowed ?? [row.vlan ?? row.pvid];
  return [portFact(row.device, row.port), ...vlans.filter(v => v !== undefined).map(vlanFact)];
}
