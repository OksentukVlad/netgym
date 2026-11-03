// «Фаєрвол»'s URL codec (spec URL v2.1; the contract is in ui/url-params.js).
//
//   ex       predict | order (order where the bank has it)  → firewall-tab.exercise (default predict)
//   «Передбач» (ex=predict):
//   level    1 | 2 (1 only where the bank has the chain level) → firewall.level
//                                                             (default 1, or 2 without the chain level)
//   variant  level 2 only: basic | disabled | drop-above      → firewall.variantId (default basic)
//   seed     1–999 999                                        → firewall.seeds[the shown variant]
//                                                             (level 1: the chain's; default: a new seed)
//   «Упорядкуй правила» (ex=order):
//   variant  input | all                                      → firewall-order.variantId (default input)
//   seed     1–999 999                                        → firewall-order.seeds[variant] (default: a new seed)
//
// The other variants' seeds and the exercise not shown are kept as
// remembered. Seeds are round.js nextSeed's range. No vendor switch here.
import { int, oneOf, pairs } from '../../../ui/url-params.js';
import { predictRecord } from './FirewallScreen.jsx';
import { nextSeed } from './round.js';

export const MAX_SEED = 999999;

const records = new WeakMap();
/** The bank's resolved records (predict with its chain level; order where offered), once per bank. */
function recordsOf(bank) {
  if (!records.has(bank)) {
    const predict = predictRecord(bank);
    const order = bank.orderRecords?.length && bank.resolveOrderRecord ? bank.resolveOrderRecord(bank.orderRecords[0]) : null;
    records.set(bank, {
      ruleSets: predict.variants.filter(v => v.kind !== 'chain'), chain: predict.variants.find(v => v.kind === 'chain') ?? null,
      all: predict.variants, order,
    });
  }
  return records.get(bank);
}
const seedOf = value => (Number.isInteger(value) && value >= 1 && value <= MAX_SEED ? value : null);
const seedsFor = (variants, random) => Object.fromEntries(variants.map(v => [v.id, nextSeed(undefined, random)]));

export const url = Object.freeze({
  keys: ['ex', 'level', 'variant', 'seed'],
  scopes: ['firewall-tab', 'firewall', 'firewall-order'],
  decode(p, { bank, places, random = Math.random }) {
    const { ruleSets, chain, all, order } = recordsOf(bank);
    const exercise = oneOf(p.ex, order ? ['predict', 'order'] : ['predict']) ?? 'predict';
    const tab = { ...places['firewall-tab'], exercise };
    const seed = int(p.seed, 1, MAX_SEED) ?? nextSeed(undefined, random);
    if (exercise === 'order') {
      const ids = order.variants.map(v => v.id);
      const base = places['firewall-order'] ?? { variantId: ids[0], seeds: seedsFor(order.variants, random) };
      const variantId = oneOf(p.variant, ids) ?? ids[0];
      return { 'firewall-tab': tab, 'firewall-order': { ...base, variantId, seeds: { ...base.seeds, [variantId]: seed } } };
    }
    const base = places.firewall ?? { level: chain ? 1 : 2, variantId: ruleSets[0].id, seeds: seedsFor(all, random) };
    const level = chain ? int(p.level, 1, 2) ?? 1 : 2;
    const variantId = level === 2 ? oneOf(p.variant, ruleSets.map(v => v.id)) ?? ruleSets[0].id : base.variantId;
    const shown = level === 1 ? chain.id : variantId;
    return { 'firewall-tab': tab, firewall: { ...base, level, variantId, seeds: { ...base.seeds, [shown]: seed } } };
  },
  encode({ bank, places }) {
    const { ruleSets, chain, order } = recordsOf(bank);
    const exercise = places['firewall-tab']?.exercise === 'order' && order ? 'order' : 'predict';
    if (exercise === 'order') {
      const place = places['firewall-order'];
      if (!place) return [['ex', 'order']];
      const variant = order.variants.find(v => v.id === place.variantId) ?? order.variants[0];
      return pairs([['ex', 'order'], ['variant', variant.id], ['seed', seedOf(place.seeds?.[variant.id])]]);
    }
    const place = places.firewall;
    if (!place) return [['ex', 'predict']];
    const level = place.level === 1 && chain ? 1 : 2;
    const variant = level === 1 ? chain : ruleSets.find(v => v.id === place.variantId) ?? ruleSets[0];
    return pairs([['ex', 'predict'], ['level', level], ['variant', level === 2 ? variant.id : null], ['seed', seedOf(place.seeds?.[variant.id])]]);
  },
});
