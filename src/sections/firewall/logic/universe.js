import { classify } from './classify.js';
import { evaluate } from './evaluate.js';
import { states, validatePolicy, validateTopology } from './model.js';

const supported = ['connectionState', 'connectionNatState', 'protocol', 'inInterfaceList'];

/** Deliberately bounded to home-basic's routed topology and known facts.
 * Ports/addresses/egress predicates need a new partition proof before reuse.
 * Reject even syntactically valid CIDRs and ranges rather than under-sampling.
 */
export function assertUniverseDomain(policy, topology) {
  if (validateTopology(topology).length || validatePolicy(policy, topology).length
    || policy.id !== 'home-basic') throw new RangeError('unsupported-universe');
  const { interfaces, gateway, lists } = topology.router;
  const expected = [
    { id: 'ether1', address: '100.64.0.2', prefix: 30 },
    { id: 'bridge', address: '192.168.88.1', prefix: 24 },
  ];
  if (gateway !== '100.64.0.1' || interfaces.length !== 2
    || expected.some(e => !interfaces.some(i => Object.keys(e).every(k => i[k] === e[k])))
    || Object.keys(lists).length !== 2 || lists.WAN?.join() !== 'ether1' || lists.LAN?.join() !== 'bridge') {
    throw new RangeError('unsupported-universe');
  }
  for (const rule of policy.rules) {
    if (!rule.enabled || Object.keys(rule.match).some(field => !supported.includes(field))) {
      throw new RangeError('unsupported-universe-predicate');
    }
  }
}

/** Full finite product: 2 hooks × 5 known states × 3 valid protocols ×
 * 2 real ingresses × 2 known dst-NAT facts = 120 valid representatives.
 * No home-basic rule reads an address or port. One valid address tuple and
 * one transport port therefore represent every value of those fields.
 */
export function buildUniverse(policy, topology) {
  assertUniverseDomain(policy, topology);
  const cards = [];
  for (const hook of ['input', 'forward']) for (const state of states)
    for (const protocol of ['tcp', 'udp', 'icmp']) for (const ingress of ['ether1', 'bridge'])
      for (const dstNat of [false, true]) {
        const packet = {
          srcIp: ingress === 'bridge' ? '192.168.88.10' : '203.0.113.50',
          dstIp: hook === 'input' ? '100.64.0.2' : ingress === 'bridge' ? '203.0.113.50' : '192.168.88.10',
          protocol,
          ...(protocol === 'icmp' ? { icmpType: 8 } : { srcPort: 50000, dstPort: 443 }),
        };
        const card = { id: `universe-${cards.length}`, packet, facts: { ingress, state, dstNat } };
        if (classify(topology, card).hook !== hook) throw new RangeError('unsupported-universe');
        cards.push(card);
      }
  return cards;
}

/** Singleton evaluation is the evaluator's complete rule truth vector,
 * including chain selection, terminal matches and nonterminal markings.
 * Equal vectors have identical walks/verdicts under EVERY permutation.
 */
export function predicateVector(policy, topology, card) {
  const context = classify(topology, card);
  return policy.rules.map(rule => evaluate({ ...policy, rules: [rule] }, card, context).steps[0].outcome);
}

export function exactPermutation(ids, order) {
  return Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length
    && Array.from(order).every(id => ids.includes(id));
}

/** Compile evaluator outcomes, never a hand-listed dependency graph.
 * Bank cards keep priority; remaining predicate classes guarantee exactness.
 * Comparison deliberately retains accept/drop/unknown as distinct verdicts.
 */
export function prepareAnalysis(policy, topology, feedbackCards = [], { preferForward = false } = {}) {
  const universe = buildUniverse(policy, topology), ids = policy.rules.map(r => r.id);
  const rows = [], vectors = new Set();
  for (const card of [...feedbackCards, ...universe]) {
    if (card.facts.state === 'unknown' || card.facts.dstNat === 'unknown') throw new RangeError('unsupported-universe-facts');
    const vector = predicateVector(policy, topology, card), key = vector.join();
    if (vectors.has(key)) continue;
    vectors.add(key);
    rows.push({ card, vector, hook: classify(topology, card).hook, expected: evaluate(policy, card, classify(topology, card)).verdict });
  }
  function analyze(order) {
    if (!exactPermutation(ids, order)) return { valid: false, ok: false, sameVerdicts: false, deadRuleIds: [], difference: null };
    const indices = order.map(id => ids.indexOf(id)), fired = new Set();
    let difference = null, differenceHook = null;
    for (const row of rows) {
      let actual = 'accept', decidedBy = 'chain-end';
      for (const index of indices) {
        const outcome = row.vector[index], rule = policy.rules[index];
        if (outcome === 'unknown') { actual = 'unknown'; decidedBy = rule.id; break; }
        if (outcome !== 'match' && outcome !== 'marked') continue;
        fired.add(rule.id);
        if (outcome === 'marked') continue;
        actual = rule.action; decidedBy = rule.id; break;
      }
      if (actual !== row.expected && (!difference || (preferForward && differenceHook !== 'forward' && row.hook === 'forward'))) {
        difference = { card: row.card, expected: row.expected, actual, decidedBy };
        differenceHook = row.hook;
      }
    }
    // Use learner order for deterministic dead-rule priority too.
    const deadRuleIds = order.filter(id => !fired.has(id));
    return { valid: true, ok: !difference && !deadRuleIds.length, sameVerdicts: !difference, deadRuleIds, difference };
  }
  return { analyze, universe, classCount: rows.length };
}
