import { contains } from '../../../engine/ip.js';
import { fields } from './model.js';
export { validateRule, validatePolicy } from './model.js';

function actualFor(field, card, context) {
  const { packet: p, facts: f } = card;
  return {
    connectionState: f.state, connectionNatState: f.dstNat === 'unknown' ? 'unknown' : f.dstNat ? ['dstnat'] : [],
    protocol: p.protocol, srcAddress: p.srcIp, dstAddress: p.dstIp, srcPort: p.srcPort ?? 'unknown', dstPort: p.dstPort ?? 'unknown',
    inInterface: context.ingress, inInterfaceList: context.ingressLists,
    outInterface: context.egress, outInterfaceList: context.egressLists,
  }[field];
}

function matches(field, predicate, actual) {
  if (actual === 'unknown') return null;
  const matched = predicate.values.some(value => {
    if (field.endsWith('Address')) { const [net, bits] = value.split('/'); return contains(net, Number(bits), actual); }
    if (field.endsWith('Port') && typeof value === 'object') return actual >= value.from && actual <= value.to;
    return Array.isArray(actual) ? actual.includes(value) : value === actual;
  });
  return predicate.not ? !matched : matched;
}

/** Evaluate a validated policy for ONE packet the filter sees (slow path).
 * Call classify(topology, card) first; facts are supplied, never inferred.
 * @param {import('./model.js').Card} card
 * @param {import('./model.js').Context} context
 * @returns {import('./model.js').Walk}
 */
export function evaluate(policy, card, context) {
  const steps = [], assumptions = [];
  const result = (verdict, decidedBy, code) => ({ verdict, hook: context.hook, decidedBy, code, steps, assumptions });
  for (const [index, rule] of policy.rules.entries()) {
    const step = { ruleId: rule.id, position: index + 1 };
    if (!rule.enabled) { steps.push({ ...step, outcome: 'disabled' }); continue; }
    if (rule.chain !== context.hook) { steps.push({ ...step, outcome: 'other-chain' }); continue; }
    let failure, missing;
    for (const field of Object.keys(fields)) {
      const expected = rule.match[field];
      if (!expected) continue;
      const actual = actualFor(field, card, context), match = matches(field, expected, actual);
      if (match === false && !failure) failure = { field, expected, actual };
      if (match === null && !missing) missing = { field, expected, actual };
    }
    if (failure) { steps.push({ ...step, outcome: 'mismatch', code: `mismatch.${failure.field}`, ...failure }); continue; }
    // A possible match cannot safely be skipped, even for FastTrack.
    if (missing) {
      steps.push({ ...step, outcome: 'unknown', code: 'missing-fact', ...missing });
      return result('unknown', rule.id, 'missing-fact');
    }
    if (rule.action === 'fasttrack-connection') {
      steps.push({ ...step, outcome: 'marked' });
      if (!assumptions.includes('fasttrack-slow-path')) assumptions.push('fasttrack-slow-path');
      continue;
    }
    steps.push({ ...step, outcome: 'match' });
    return result(rule.action, rule.id, rule.action === 'accept' ? 'rule-accepted' : 'rule-dropped');
  }
  return result('accept', 'chain-end', 'chain-end-accepted');
}
