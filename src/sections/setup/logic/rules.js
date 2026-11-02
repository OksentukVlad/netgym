import { capabilities } from './model.js';

/** First failed rule, in bank priority order; never returns the reference. */
export function orderFinding(task, order) {
  for (const rule of task.rules) {
    if (rule.kind === 'before' && order.indexOf(rule.a) >= order.indexOf(rule.b)) return { code: 'needs-before', why: rule.why, cards: [rule.a, rule.b] };
    if (rule.kind === 'last' && order.at(-1) !== rule.a) return { code: 'not-last', why: rule.why, cards: [rule.a] };
  }
  return null;
}

export function check(task, answer) {
  const fail = finding => ({ ok: false, complete: false, code: finding.code, findings: [{ severity: 'blocks', ...finding }] });
  const caps = capabilities(task);
  if (!answer || !Array.isArray(answer.order) || answer.order.length !== task.cards.length
    || new Set(answer.order).size !== task.cards.length || answer.order.some(id => !task.cards.some(c => c.id === id))) return fail({ code: 'invalid-answer', cards: [] });
  // Missing choices take priority over every order rule and wrong choice.
  if (caps.prompts.length) {
    const missing = answer.order.filter(id => answer.prompts?.[id] == null);
    if (missing.length) return fail({ code: 'mode-missing', cards: missing });
  }
  const order = orderFinding(task, answer.order);
  if (order) return fail(order);
  if (caps.prompts.length) for (const id of answer.order) {
    const card = task.cards.find(c => c.id === id), chosen = answer.prompts?.[id];
    if (!caps.prompts.includes(chosen) || chosen !== card.mode) return fail({ code: 'wrong-mode', cards: [id] });
  }
  const advice = [];
  for (const rule of task.rules) if (rule.kind === 'together' && Math.abs(answer.order.indexOf(rule.a) - answer.order.indexOf(rule.b)) !== 1) advice.push({ code: 'keep-together', severity: 'advice', why: rule.why });
  return { ok: true, complete: true, code: 'ok', findings: advice };
}
