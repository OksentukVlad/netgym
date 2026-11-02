import { parseIp, contains, network, broadcast } from '../../engine/ip.js';

// Bank checks stay bank-side (§5), independent of the executable logic schema.
const str = v => typeof v === 'string' && v.length > 0;
const bool = v => typeof v === 'boolean';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unique = v => new Set(v).size === v.length;
const list = (v, test) => Array.isArray(v) && v.every(test);
const shape = (v, required, optional = {}) => object(v)
  && Object.keys(required).every(k => Object.hasOwn(v, k) && required[k](v[k]))
  && Object.keys(v).every(k => Object.hasOwn(required, k) || (Object.hasOwn(optional, k) && optional[k](v[k])));
const ip = v => str(v) && parseIp(v) === v;
const unicast = v => ip(v) && !['0.', '127.', '169.254.'].some(p => v.startsWith(p)) && Number(v.split('.')[0]) < 224;
const name = v => str(v) && /^[\w-]+$/.test(v);
const bits = v => Number.isInteger(v) && v >= 0 && v <= 32;
const port = v => Number.isInteger(v) && v >= 0 && v <= 65535;
const range = v => port(v) || (shape(v, { from: port, to: port }) && v.from <= v.to);
const prefix = v => {
  if (!str(v)) return false;
  const [address, length, extra] = v.split('/');
  return extra === undefined && ip(address) && /^(0|[1-9]\d?)$/.test(length) && bits(Number(length));
};
const states = ['new', 'established', 'related', 'invalid', 'untracked'];
const member = values => v => values.includes(v);
const pred = check => v => shape(v, {
  values: x => list(x, check) && x.length > 0 && unique(x.map(v => JSON.stringify(v))), not: bool,
}) && (!v.not || v.values.length === 1);
const interfaceShape = v => shape(v, { id: name, address: unicast, prefix: bits });
const hostShape = v => shape(v, { id: str, role: str, address: unicast });
const membershipsShape = v => object(v) && Object.keys(v).every(name)
  && Object.values(v).every(members => list(members, str) && unique(members));
const topologyShape = v => shape(v, {
  router: r => shape(r, {
    interfaces: x => list(x, interfaceShape) && x.length > 0 && unique(x.map(i => i.id)) && unique(x.map(i => i.address)),
    gateway: unicast, lists: membershipsShape,
  }),
  hosts: x => list(x, hostShape) && unique(x.map(h => h.id)),
});
const validMemberships = (router, interfaces) => Object.values(router.lists).every(members => members.every(id => interfaces.includes(id)));
const singleDefaultRoute = router => router.interfaces.filter(i =>
  router.lists.WAN?.includes(i.id) && contains(i.address, i.prefix, router.gateway)).length === 1;
const transportProtocol = v => v?.not === false && v.values.length === 1 && ['tcp', 'udp'].includes(v.values[0]);
const inputEgress = rule => rule.chain === 'input' && Object.keys(rule.match).some(k => k.startsWith('outInterface'));
const singleValueField = key => !['connectionState', 'srcPort', 'dstPort'].includes(key);

function validatePolicies(policies, interfaces, lists, add) {
  const tests = {
    connectionState: member(states), connectionNatState: member(['dstnat']), protocol: member(['tcp', 'udp', 'icmp']),
    srcAddress: prefix, dstAddress: prefix, srcPort: range, dstPort: range,
    inInterface: member(interfaces), outInterface: member(interfaces), inInterfaceList: member(lists), outInterfaceList: member(lists),
  };
  const match = v => shape(v, {}, Object.fromEntries(Object.entries(tests).map(([k, check]) => [k, pred(check)])));
  const ruleShape = r => shape(r, {
    id: str, enabled: bool, chain: member(['input', 'forward']), action: member(['accept', 'drop', 'fasttrack-connection']), match,
  }, { descriptionCode: str });
  const policyShape = p => shape(p, { id: str, rules: v => list(v, ruleShape) && unique(v.map(r => r.id)) });
  for (const policy of policies) {
    if (!policyShape(policy)) { add('policies'); continue; }
    for (const rule of policy.rules) {
      if (rule.id.startsWith('chain-end') || inputEgress(rule)) add(`policies.${policy.id}.${rule.id}`);
      for (const [key, predicate] of Object.entries(rule.match)) {
        const multipleUnsupported = singleValueField(key) && predicate.values.length !== 1;
        const unsupportedPorts = key.endsWith('Port') && !transportProtocol(rule.match.protocol);
        if (multipleUnsupported || unsupportedPorts) add(`policies.${policy.id}.${rule.id}.${key}`);
      }
    }
  }
}

const packetShape = v => shape(v, {
  srcIp: unicast, dstIp: unicast, protocol: member(['tcp', 'udp', 'icmp']),
}, { srcPort: port, dstPort: port, icmpType: x => Number.isInteger(x) && x >= 0 && x <= 255 });
const factsShape = interfaces => v => shape(v, {
  ingress: member(interfaces), state: member([...states, 'unknown']), dstNat: member([true, false, 'unknown']),
}, { dstNatFrom: x => shape(x, { address: unicast, port }) }) && (!v.dstNatFrom || v.dstNat === true);
const protocolFields = packet => packet.protocol === 'icmp'
  ? !['srcPort', 'dstPort'].some(k => k in packet) : !('icmpType' in packet);
const routerOriginated = (packet, interfaces) => interfaces.some(i => i.address === packet.srcIp);
const networkOrBroadcast = (address, interfaces) => interfaces.some(i => i.prefix <= 30
  && (address === network(i.address, i.prefix) || address === broadcast(i.address, i.prefix)));
const supportedAddresses = (packet, interfaces) => !routerOriginated(packet, interfaces)
  && ![packet.srcIp, packet.dstIp].some(address => networkOrBroadcast(address, interfaces));

function validateCards(cards, topology, interfaces, add) {
  for (const card of cards) {
    const cardShape = shape(card, { id: str, packet: packetShape, facts: factsShape(interfaces), safety: bool });
    if (!cardShape || !protocolFields(card.packet) || !supportedAddresses(card.packet, topology.router.interfaces)) add('cards');
  }
}

function validateRecords(records, policyIds, cardIds, add) {
  const variantShape = v => shape(v, {
    id: str, title: str, text: str, policyId: member(policyIds),
    cardIds: x => list(x, member(cardIds)) && x.length > 0 && unique(x),
  }, { kind: member(['chain']) });
  const recordShape = r => shape(r, {
    id: str, version: v => Number.isInteger(v) && v > 0,
    variants: v => list(v, variantShape) && v.length > 0 && unique(v.map(x => x.id)),
  });
  if (!records.every(recordShape)) add('records');
  if (!records.length || !unique(records.map(r => r?.id))) add('records.ids');
}

/** Return stable diagnostics instead of throwing, including for malformed roots.
 * Unknown keys are rejected at EVERY object boundary, including predicates.
 */
export function validateBank(bank) {
  const issues = [], add = field => issues.push({ code: 'invalid-bank', field });
  const bankShape = shape(bank, {
    topology: object, policies: Array.isArray, cards: Array.isArray, records: Array.isArray,
    safetyCardIds: Array.isArray, safetyExceptions: object,
  });
  if (!bankShape) return [{ code: 'invalid-bank', field: 'bank' }];
  const { topology, policies, cards, records, safetyCardIds, safetyExceptions } = bank;
  if (!topologyShape(topology)) { add('topology'); return issues; }
  const interfaces = topology.router.interfaces.map(i => i.id), lists = Object.keys(topology.router.lists);
  if (!validMemberships(topology.router, interfaces) || !singleDefaultRoute(topology.router)) add('topology.router.lists');
  validatePolicies(policies, interfaces, lists, add);
  validateCards(cards, topology, interfaces, add);
  const policyIds = policies.map(p => p?.id), cardIds = cards.map(c => c?.id);
  if (!unique(policyIds) || !unique(cardIds) || !policies.length || !cards.length) add('ids');
  const validSafety = list(safetyCardIds, member(cardIds)) && unique(safetyCardIds)
    && cards.every(c => c?.safety === safetyCardIds.includes(c?.id));
  if (!validSafety) add('safetyCardIds');
  const exceptionShape = Object.fromEntries(policyIds.filter(str).map(id => [id, v => list(v, member(safetyCardIds)) && unique(v)]));
  if (!shape(safetyExceptions, exceptionShape)) add('safetyExceptions');
  validateRecords(records, policyIds, cardIds, add);
  return issues;
}
