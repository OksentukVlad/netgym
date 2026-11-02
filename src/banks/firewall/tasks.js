import { chainCards } from './chain.js';
export { chainRecords, chainCards, validateChainBank } from './chain.js';
import { topology } from './topology.js';
import { policies } from './policies.js';
import { cards, safetyCardIds } from './cards.js';
export { topology, policies, cards, safetyCardIds };
// FW-2 is a separate slice so FW-1 keeps its frozen records and sampling.
export { orderRecords, resolveOrderRecord, validateOrderBank } from './order.js';

// Outcome exceptions describe the safety audit, never the pre-commit round.
export const safetyExceptions = { 'home-basic': [], 'home-disabled': ['lan-winbox'], 'home-drop-above': ['lan-winbox'] };
export const records = [{
  id: 'fw-predict', version: 1,
  variants: [
    { id: 'basic', policyId: 'home-basic', cardIds: cards.map(c => c.id), title: 'Домашній роутер', text: 'Передбач, як фільтр розгляне кожен пакет.' },
    // Distinct titles that never name the changed rule (FW-1 screen spec §1).
    ...['disabled', 'drop-above'].map((id, i) => ({
      id, policyId: `home-${id}`, cardIds: ['lan-winbox', 'reply-to-pc', 'port-forward', 'wan-winbox', 'lan-web-out'],
      title: `Набір зі зміною ${i + 1}`, text: 'У цьому наборі є помилка. Передбач шлях кожного пакета за наведеними правилами.',
    })),
  ],
}];

/** Caller-side resolution. The exercise receives no bank ids or safety exceptions.
 * Validate the bank with validateBank before resolving it.
 */
export function resolveRecord(record) {
  return {
    id: record.id, version: record.version,
    variants: record.variants.map(({ id, title, text, kind, policyId, cardIds }) => ({
      id, title, text, ...(kind ? { kind } : {}), topology, policy: policies.find(p => p.id === policyId),
      cards: cardIds.map(id => [...cards, ...chainCards].find(c => c.id === id)),
    })),
  };
}
