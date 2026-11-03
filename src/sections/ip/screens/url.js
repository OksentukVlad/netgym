// The IP sections' URL codecs (spec URL v2.1; the contract is in ui/url-params.js).
// The three IP screens are three sections of the target (ip-calculator,
// ip-mask, ip-binary), so the section in the route names the exercise and no
// `ex` key is needed.
//
//   ip-calculator  no keys: its address and prefix are the learner's drafts.
//   ip-mask        level 1–3   → ip.mask.level (default 1)
//                  seed 0–9999 → ip.mask.seeds[level] (default: a new seed)
//   ip-binary      level 1–3   → ip.binary.level (default 1)
//                  seed 0–9999 → ip.binary.seeds[level] (default: a new seed)
//
// The other levels' seeds and the binary walk's text-mode toggle are kept as
// remembered. Seeds are links.js newSeed's range.
import { int, pairs } from '../../../ui/url-params.js';

export const MAX_SEED = 9999;
const LEVELS = 3;
const newSeed = random => Math.floor(random() * (MAX_SEED + 1));

export const calculatorUrl = Object.freeze({
  keys: [], scopes: [],
  decode: () => ({}),
  encode: () => [],
});

/** A level-and-seed codec for one scope; `first` is the screen's first place. */
function levelSeed(scope, first) {
  return Object.freeze({
    keys: ['level', 'seed'],
    scopes: [scope],
    decode(p, { places, random = Math.random }) {
      const base = places[scope] ?? first(random);
      const level = int(p.level, 1, LEVELS) ?? 1;
      const seed = int(p.seed, 0, MAX_SEED) ?? newSeed(random);
      return { [scope]: { ...base, level, seeds: { ...base.seeds, [level]: seed } } };
    },
    encode({ places }) {
      const place = places[scope];
      if (!place) return [];
      const level = int(String(place.level), 1, LEVELS) ?? 1;
      const seed = place.seeds?.[level];
      return pairs([['level', level], ['seed', Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED ? seed : null]]);
    },
  });
}

// The screens' own first places (MaskScreen.jsx, BinaryScreen.jsx), with the seed for level 1.
export const maskUrl = levelSeed('ip.mask', random => ({ level: 1, seeds: { 1: newSeed(random) } }));
export const binaryUrl = levelSeed('ip.binary', random => ({ level: 1, seeds: { 1: newSeed(random) }, text: false }));
