import { readFileSync } from 'node:fs';
import { topology, policies, cards, records, safetyCardIds, safetyExceptions, resolveRecord } from '../../src/banks/firewall/tasks.js';
import { classify } from '../../src/sections/firewall/logic/classify.js';
import { evaluate } from '../../src/sections/firewall/logic/evaluate.js';
import { create } from '../../src/sections/firewall/logic/predict.js';
export { topology, policies, cards, records, safetyCardIds, safetyExceptions, resolveRecord, classify, evaluate };
export const clone = value => structuredClone(value);
export const bank = { topology, policies, cards, records, safetyCardIds, safetyExceptions };
// Independently hand-walked fixtures, never generated from evaluator output.
export const outcomes = JSON.parse(readFileSync(new URL('../fixtures/firewall-outcomes.json', import.meta.url), 'utf8'));
export const commands = JSON.parse(readFileSync(new URL('../fixtures/firewall-commands.json', import.meta.url), 'utf8'));
export const pred = (...values) => ({ values, not: false });
export const rule = (match = {}, action = 'drop', extras = {}) => ({ id: 'test-rule', chain: 'forward', action, enabled: true, match, ...extras });
export const card = id => clone(cards.find(c => c.id === id));
export const run = (rules, c = card('lan-web-out')) => evaluate({ id: 'test', rules }, c, classify(topology, c));
export const expectedAnswer = expected => ({ hook: expected.hook, decidedBy: expected.decidedBy === 'chain-end' ? `chain-end:${expected.hook}` : expected.decidedBy });
// A fixture task with the full inventory lets checks exercise cards that were
// not sampled into one particular seed. It contains only create's given fields.
export function fullTask(policyId = 'home-basic') {
  const variantId = { 'home-basic': 'basic', 'home-disabled': 'disabled', 'home-drop-above': 'drop-above' }[policyId];
  const task = create(resolveRecord(records[0]), { variantId, seed: 'tests' });
  task.cards = clone(cards).map(({ safety, ...c }) => c);
  return task;
}
