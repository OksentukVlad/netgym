// «Налаштування з нуля»'s URL codec (spec URL v2.1; the contract is in ui/url-params.js).
//
//   deck  router | switch | mikrotik  → setup.deck: dr-1 | dr-2 | dr-3, a deck the
//                                       bank has (default: the bank's first deck)
//   seed  1–9 999 999                 → setup.seeds[deck], the deck's card order
//                                       (default: a new seed)
//
// The other decks' seeds are kept as remembered. The section has no vendor
// switch (each deck is one vendor's), so no `syntax`.
import { int, pairs } from '../../../ui/url-params.js';
import { firstPlace, firstSeed } from './SetupScreen.jsx';

/** The decks' short names in the URL. */
export const DECK_NAMES = Object.freeze({ 'dr-1': 'router', 'dr-2': 'switch', 'dr-3': 'mikrotik' });
/** The generator gives 1–1 000 000 (and one more on a repeat); seven digits bound it. */
export const MAX_SEED = 9999999;

export const url = Object.freeze({
  keys: ['deck', 'seed'],
  scopes: ['setup'],
  decode(p, { bank, places, random = Math.random }) {
    const { decks } = bank;
    const base = places.setup ?? firstPlace(decks, random);
    const named = decks.find(d => DECK_NAMES[d.id] && DECK_NAMES[d.id] === p.deck);
    const deck = (named ?? decks[0]).id;
    const seed = int(p.seed, 1, MAX_SEED) ?? firstSeed(random);
    return { setup: { ...base, deck, seeds: { ...base.seeds, [deck]: seed } } };
  },
  encode({ bank, places }) {
    const place = places.setup;
    if (!place) return [];
    const record = bank.decks.find(d => d.id === place.deck) ?? bank.decks[0];
    const seed = place.seeds?.[record.id];
    return pairs([['deck', DECK_NAMES[record.id] ?? null], ['seed', Number.isInteger(seed) && seed >= 1 && seed <= MAX_SEED ? seed : null]]);
  },
});
