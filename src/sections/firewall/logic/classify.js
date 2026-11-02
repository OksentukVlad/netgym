import { contains } from '../../../engine/ip.js';
import { validateCard, validateTopology } from './model.js';

/** Only routed IPv4 unicast entering this router. No output, bridging or NAT computation.
 * @param {import('./model.js').Card} card
 * @returns {import('./model.js').Context}
 */
export function classify(topology, card) {
  if (validateTopology(topology).length || validateCard(card, topology).length) throw new RangeError('unsupported-packet');
  const { interfaces, lists, gateway } = topology.router;
  const { ingress } = card.facts;
  const memberships = id => Object.keys(lists).filter(name => lists[name].includes(id));
  const local = interfaces.some(i => i.address === card.packet.dstIp);
  if (local) return { hook: 'input', ingress, egress: null, ingressLists: memberships(ingress), egressLists: [] };
  const connected = interfaces.filter(i => contains(i.address, i.prefix, card.packet.dstIp)).sort((a, b) => b.prefix - a.prefix);
  if (connected.length > 1 && connected[0].prefix === connected[1].prefix) throw new RangeError('unsupported-packet');
  const egress = (connected[0] ?? interfaces.find(i => lists.WAN.includes(i.id) && contains(i.address, i.prefix, gateway))).id;
  const incoming = interfaces.find(i => i.id === ingress);
  if (egress === ingress && contains(incoming.address, incoming.prefix, card.packet.srcIp) && contains(incoming.address, incoming.prefix, card.packet.dstIp)) throw new RangeError('unsupported-packet');
  return { hook: 'forward', ingress, egress, ingressLists: memberships(ingress), egressLists: memberships(egress) };
}
