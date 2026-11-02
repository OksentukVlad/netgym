import { parse } from '../../../engine/vendors/cisco-cli.js';
import { matchesRequirement } from '../../../engine/vendors/setup-record.js';
import { capabilities } from './model.js';

export function weakSecret(secret, values) {
  return [...secret].length < 8 || [values.hostname, values.username, 'password', 'Password1', '12345678', 'cisco', 'admin'].some(v => v.toLowerCase() === secret.toLowerCase());
}

/** Check syntax, independent command identity, then the card's semantic values.
 * Syntax is resolved against the whole profile (`mode: null`), never the
 * card's own mode: a card whose identity doesn't match gets the same verdict
 * whatever its mode, so typed probes can't tell its prompt apart.
 * No cached pass bit is trusted: recall completion reparses the current text.
 */
export function checkTyped(task, cardId, text) {
  const card = task.cards.find(c => c.id === cardId) ?? task.recallLines?.find(c => c.id === cardId);
  const fail = (code, params = {}) => ({ ok: false, code, findings: [{ code, severity: 'blocks', entity: cardId, ...params }] });
  if (!card || !capabilities(task).typed) return fail('invalid-answer');
  if (typeof text !== 'string' || !text.trim()) return fail('typed-missing');
  const parsed = parse(text, { mode: null, profile: task.profile });
  if (!parsed.ok) return fail(parsed.finding.code, parsed.finding);
  if (parsed.id !== card.commandId) return fail('other-command', { position: 0, token: parsed.tokens[0].text, start: parsed.tokens[0].start, end: parsed.tokens[0].end });
  const badValue = (code, field) => {
    const position = parsed.positions[field] ?? parsed.tokens.length;
    const token = parsed.tokens[position] ?? { text: '', start: text.length, end: text.length };
    return fail(code, { field, position, token: token.text, start: token.start, end: token.end });
  };
  // Q7 overrides the earlier split at the legacy 768-bit compatibility limit.
  if (card.commandId === 'crypto' && parsed.values.modulus < 2048) return badValue(task.profile.id === 'c2960-ios15-k9-console' ? 'weak-key.dr-2' : 'weak-key', 'modulus');
  for (const [field, constraint] of Object.entries(card.requires)) {
    const value = parsed.values[field];
    const wanted = typeof constraint === 'string' && constraint.startsWith('$') ? task.values[constraint.slice(1)] : constraint;
    if (!matchesRequirement(value, wanted, field)) return badValue('wrong-value', field);
  }
  const findings = parsed.values.secret !== undefined && weakSecret(parsed.values.secret, task.values)
    ? [{ code: 'weak-secret', severity: 'advice', entity: cardId }] : [];
  // Don't retain plaintext secrets in verdicts, feedback, or evidence.
  return { ok: true, code: 'ok', findings };
}

/** Recall completion rechecks current input; never trust saved pass flags. */
export function checkRecall(task, answer) {
  const advice = [];
  if (!task.typedIds.length) return { ok: false, complete: false, code: 'invalid-answer', findings: [] };
  for (const id of task.typedIds) {
    const result = checkTyped(task, id, answer?.typed?.[id]);
    if (!result.ok) return { ...result, complete: false, findings: result.findings.map(f => ({ ...f, cards: [id] })) };
    advice.push(...result.findings);
  }
  return { ok: true, complete: true, code: 'ok', findings: advice };
}
