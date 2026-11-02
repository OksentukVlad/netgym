import { comprehension as copy } from '../uk.js';

/** Captions for the evaluated slow-path packet. Positions in the engine are
 * one-based. Prediction uses RouterOS numbers from 0; the ordering board
 * uses numbered list positions from 1. Choose the matching numberBase.
 * Pass the walkInput DTO from either predict or order; never rebuild a policy
 * in the screen or infer a verdict from a finding's expected outcome.
 */
export function traceCaptions({ policy, card, walk }, { numberBase = 0 } = {}) {
  if (![0, 1].includes(numberBase)) throw new RangeError('invalid-number-base');
  const captions = [{ kind: 'ingress', ingress: card.facts.ingress, text: copy.traceIngress(card.facts.ingress) }];
  if (card.facts.dstNat === true) captions.push({ kind: 'dst-nat', text: card.facts.dstNatFrom
    ? copy.traceNat({ ...card.facts.dstNatFrom, dstIp: card.packet.dstIp, dstPort: card.packet.dstPort }) : copy.traceNatKnown });
  captions.push({ kind: 'chain', chain: walk.hook, text: copy.traceChain(walk.hook) });
  for (const step of walk.steps) {
    const rule = policy.rules[step.position - 1];
    if (rule?.id !== step.ruleId) throw new RangeError('trace-policy-mismatch');
    const number = step.position - 1 + numberBase;
    captions.push({ kind: 'rule', ruleId: rule.id, number, chain: rule.chain, outcome: step.outcome,
      text: copy.traceRule({ number, chain: rule.chain, outcome: step.outcome, action: rule.action }) });
  }
  if (walk.decidedBy === 'chain-end') captions.push({ kind: 'chain-end', chain: walk.hook, verdict: walk.verdict, text: copy.traceEnd(walk.hook) });
  return captions;
}
