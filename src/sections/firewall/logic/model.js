import { parseIp, contains, broadcast, network } from '../../../engine/ip.js';

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {{srcIp: string, dstIp: string, protocol: 'tcp'|'udp'|'icmp', srcPort?: number, dstPort?: number, icmpType?: number}} packet Post-dst-NAT addresses seen by the filter.
 * @property {{ingress: string, state: 'new'|'established'|'related'|'invalid'|'untracked'|'unknown', dstNat: boolean|'unknown', dstNatFrom?: {address: string, port: number}}} facts Supplied, never inferred.
 * @property {boolean} [safety] Sampling metadata, stripped by create.
 *
 * @typedef {Object} Context
 * @property {'input'|'forward'} hook
 * @property {string} ingress
 * @property {string|null} egress
 * @property {string[]} ingressLists
 * @property {string[]} egressLists
 *
 * @typedef {Object} Walk
 * @property {'accept'|'drop'|'unknown'} verdict
 * @property {'input'|'forward'} hook
 * @property {string} decidedBy Rule id or unqualified 'chain-end'.
 * @property {string} code
 * @property {{ruleId: string, position: number, outcome: 'other-chain'|'disabled'|'mismatch'|'match'|'marked'|'unknown', code?: string, field?: string, expected?: Object, actual?: *}[]} steps
 * @property {string[]} assumptions
 */

// Also the comparison/render order. A known mismatch wins over an earlier unknown.
export const fields = {
  connectionState: 'connection-state', connectionNatState: 'connection-nat-state',
  protocol: 'protocol', srcAddress: 'src-address', dstAddress: 'dst-address',
  srcPort: 'src-port', dstPort: 'dst-port', inInterface: 'in-interface',
  inInterfaceList: 'in-interface-list', outInterface: 'out-interface',
  outInterfaceList: 'out-interface-list',
};
export const states = ['new', 'established', 'related', 'invalid', 'untracked'];
export const hooks = ['input', 'forward'];
export const actions = ['accept', 'drop', 'fasttrack-connection'];
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const only = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
export const ip = value => typeof value === 'string' && parseIp(value) === value;
export const prefix = value => {
  if (typeof value !== 'string') return false;
  const [address, bits, extra] = value.split('/');
  return extra === undefined && ip(address) && /^(?:0|[1-9]\d?)$/.test(bits) && Number(bits) <= 32;
};
export const port = value => Number.isInteger(value) && value >= 0 && value <= 65535;
export const portValue = value => port(value) || (only(value, ['from', 'to']) && port(value.from) && port(value.to) && value.from <= value.to);
export const unicast = value => ip(value) && !['0.', '127.', '169.254.'].some(p => value.startsWith(p))
  && Number(value.split('.')[0]) < 224 && value !== '255.255.255.255';
const nonemptyString = value => typeof value === 'string' && value.length > 0;
const unique = values => new Set(values).size === values.length;
const transportProtocol = predicate => predicate?.not === false && predicate.values?.length === 1
  && ['tcp', 'udp'].includes(predicate.values[0]);
const predicateShape = predicate => only(predicate, ['values', 'not']) && typeof predicate.not === 'boolean'
  && Array.isArray(predicate.values) && predicate.values.length > 0;

function supportedValues(field, values, rule, topology) {
  if (field === 'connectionState') return values.every(v => states.includes(v));
  if (field === 'connectionNatState') return values.every(v => v === 'dstnat');
  if (field === 'protocol') return values.length === 1 && values.every(v => ['tcp', 'udp', 'icmp'].includes(v));
  if (field.endsWith('Address')) return values.length === 1 && values.every(prefix);
  if (field.endsWith('Port')) return values.every(portValue) && transportProtocol(rule.match.protocol);
  if (field.endsWith('Interface')) return values.length === 1 && values.every(v => topology?.router?.interfaces?.some(i => i.id === v));
  if (field.endsWith('InterfaceList')) return values.length === 1 && values.every(v => Object.hasOwn(topology?.router?.lists ?? {}, v));
  return false;
}

/** Rule semantic validation. `siblings` makes duplicate ids a rule-level error too.
 * Address predicates are CIDR strings; port ranges are {from, to} (inclusive).
 * Topology owns interface-list membership, never policy.
 */
export function validateRule(rule, topology, siblings = []) {
  const issues = [];
  const bad = field => issues.push({ code: 'invalid-rule', entity: rule?.id, field });
  if (!only(rule, ['id', 'enabled', 'chain', 'action', 'match', 'descriptionCode'])) return [{ code: 'invalid-rule', entity: rule?.id }];
  if (!nonemptyString(rule.id) || rule.id.startsWith('chain-end') || siblings.filter(r => r?.id === rule.id).length > 1) bad('id');
  if (typeof rule.enabled !== 'boolean') bad('enabled');
  if (!hooks.includes(rule.chain)) bad('chain');
  if (!actions.includes(rule.action)) bad('action');
  if (rule.descriptionCode !== undefined && !nonemptyString(rule.descriptionCode)) bad('descriptionCode');
  if (!only(rule.match, Object.keys(fields))) { bad('match'); return issues; }
  for (const [field, predicate] of Object.entries(rule.match)) {
    if (!predicateShape(predicate)) { bad(field); continue; }
    const values = predicate.values;
    if (!unique(values.map(v => JSON.stringify(v))) || (predicate.not && values.length !== 1)) bad(field);
    if (!supportedValues(field, values, rule, topology)) bad(field);
    if (rule.chain === 'input' && field.startsWith('outInterface')) bad(field);
  }
  return issues;
}

export function validatePolicy(policy, topology) {
  if (!only(policy, ['id', 'rules']) || !nonemptyString(policy.id) || !Array.isArray(policy.rules)) return [{ code: 'invalid-policy' }];
  return Array.from(policy.rules).flatMap(rule => validateRule(rule, topology, policy.rules));
}

const interfaceShape = i => only(i, ['id', 'address', 'prefix']) && typeof i.id === 'string'
  && /^[\w-]+$/.test(i.id) && unicast(i.address) && Number.isInteger(i.prefix) && i.prefix >= 0 && i.prefix <= 32;
const hostShape = h => only(h, ['id', 'role', 'address']) && nonemptyString(h.id)
  && typeof h.role === 'string' && unicast(h.address);
const validMemberships = (lists, interfaces) => Object.entries(lists).every(([name, members]) =>
  /^[\w-]+$/.test(name) && Array.isArray(members) && unique(members)
  && members.every(id => interfaces.some(i => i.id === id)));
const singleDefaultRoute = (interfaces, lists, gateway) => interfaces.filter(i =>
  lists.WAN?.includes(i.id) && contains(i.address, i.prefix, gateway)).length === 1;

export function validateTopology(topology) {
  const bad = () => [{ code: 'invalid-topology' }];
  if (!only(topology, ['router', 'hosts']) || !only(topology.router, ['interfaces', 'gateway', 'lists']) || !Array.isArray(topology.hosts)) return bad();
  const { interfaces, lists, gateway } = topology.router;
  if (!Array.isArray(interfaces) || !interfaces.length || !plain(lists) || !unicast(gateway)) return bad();
  if (!interfaces.every(interfaceShape) || !unique(interfaces.map(i => i.id)) || !unique(interfaces.map(i => i.address))) return bad();
  if (!validMemberships(lists, interfaces)) return bad();
  // FW-1 has a single unambiguous default route via the supplied WAN gateway.
  if (!singleDefaultRoute(interfaces, lists, gateway)) return bad();
  if (!topology.hosts.every(hostShape) || !unique(topology.hosts.map(h => h.id))) return bad();
  return [];
}

const cardShape = card => only(card, ['id', 'packet', 'facts', 'safety']) && nonemptyString(card.id)
  && (card.safety === undefined || typeof card.safety === 'boolean')
  && only(card.packet, ['srcIp', 'dstIp', 'protocol', 'srcPort', 'dstPort', 'icmpType'])
  && only(card.facts, ['ingress', 'state', 'dstNat', 'dstNatFrom']);
const packetValues = packet => unicast(packet.srcIp) && unicast(packet.dstIp)
  && ['tcp', 'udp', 'icmp'].includes(packet.protocol);
const factValues = facts => [...states, 'unknown'].includes(facts.state) && [true, false, 'unknown'].includes(facts.dstNat);
const packetPorts = packet => ['srcPort', 'dstPort'].every(key => packet[key] === undefined
  || (['tcp', 'udp'].includes(packet.protocol) && port(packet[key])));
const packetIcmp = packet => packet.icmpType === undefined || (packet.protocol === 'icmp'
  && Number.isInteger(packet.icmpType) && packet.icmpType >= 0 && packet.icmpType <= 255);
const natOrigin = facts => facts.dstNatFrom === undefined || (facts.dstNat === true
  && only(facts.dstNatFrom, ['address', 'port']) && unicast(facts.dstNatFrom.address) && port(facts.dstNatFrom.port));
const routerOriginated = (packet, interfaces) => interfaces.some(i => i.address === packet.srcIp);
const networkOrBroadcast = (address, interfaces) => interfaces.some(i => i.prefix <= 30
  && (address === network(i.address, i.prefix) || address === broadcast(i.address, i.prefix)));

/** @param {Card} card */
export function validateCard(card, topology) {
  const bad = () => [{ code: 'unsupported-packet', entity: card?.id }];
  if (!cardShape(card)) return bad();
  const { packet, facts } = card;
  if (!packetValues(packet) || !factValues(facts) || !packetPorts(packet) || !packetIcmp(packet) || !natOrigin(facts)) return bad();
  const interfaces = topology.router.interfaces;
  if (!interfaces.some(i => i.id === facts.ingress) || routerOriginated(packet, interfaces)) return bad();
  if ([packet.srcIp, packet.dstIp].some(address => networkOrBroadcast(address, interfaces))) return bad();
  return [];
}
