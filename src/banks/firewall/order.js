import { topology } from './topology.js';
import { policies } from './policies.js';
import { cards, orderWitnessCards } from './cards.js';
import { validateBank } from './validate.js';

export const orderRecords = [{
  id: 'fw-order', version: 1,
  variants: [
    { id: 'input', title: 'Лише до роутера', policyId: 'home-basic', cardIds: [...cards, ...orderWitnessCards].map(c => c.id), text: 'Упорядкуй правила для пакетів до роутера.' },
    { id: 'all', title: 'Увесь фільтр', policyId: 'home-basic', cardIds: [...cards, ...orderWitnessCards].map(c => c.id), text: 'Упорядкуй правила кожного ланцюжка: input і forward.' },
  ],
}];

/** Separate bank slice preserves FW-1's frozen inventory and generator replay.
 * Use the same strict bank validator, including every witness boundary.
 */
export function validateOrderBank(records = orderRecords, witnesses = orderWitnessCards) {
  if (!Array.isArray(records) || !Array.isArray(witnesses)) return [{ code: 'invalid-bank', field: 'order' }];
  const issues = validateBank({
    topology, policies: [policies[0]], cards: [...cards, ...witnesses], records,
    safetyCardIds: cards.filter(c => c.safety).map(c => c.id), safetyExceptions: { 'home-basic': [] },
  });
  if (issues.length) return issues;
  if (records.length !== 1 || records[0]?.id !== 'fw-order' || records[0]?.variants?.length !== 2
    || !['input', 'all'].every(id => records[0].variants.some(v => v.id === id && v.policyId === 'home-basic'))
    || witnesses.some(c => !c?.facts || c.facts.state === 'unknown' || typeof c.facts.dstNat !== 'boolean')) {
    issues.push({ code: 'invalid-bank', field: 'order' });
  }
  return issues;
}

export function resolveOrderRecord(record = orderRecords[0]) {
  const inventory = [...cards, ...orderWitnessCards];
  return {
    id: record.id, version: record.version,
    variants: record.variants.map(({ id, title, text, policyId, cardIds }) => ({
      id, title, text, topology,
      policy: { id: policyId, rules: policies.find(p => p.id === policyId).rules.filter(r => id !== 'input' || r.chain === 'input') },
      cards: cardIds.map(id => inventory.find(c => c.id === id)),
    })),
  };
}
