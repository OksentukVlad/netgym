// «Перевірка мережі»'s URL codec (round 7; the contract is in ui/url-params.js).
//
//   ex     proof | ladder | claims   → checks.exercise                          (default proof)
//   level  ladder 1–2, claims 1–2    → checks.ladder.level / checks.claims.level (default 1)
//   scope  access                    → checks.proof.scope: a setup deck's round  (default: all six)
//   seed   0–999 999                 → that exercise's (and level's) current task:
//                                      checks.proof.seed, checks.ladder.tasks[level].seed,
//                                      checks.claims.tasks[level].seed (default: a new seed)
//
// C3 has no levels: its link has no `level`. The other levels' tasks and the
// other exercises are kept as remembered. Seeds start below 100 000 and count
// up by one per task, wrapping to 0 after 999 999 (seeds.js).
import { int, oneOf, pairs } from '../../../ui/url-params.js';
import { EXERCISES, firstPlace } from './ChecksScreen.jsx';
import { MAX_SEED, newSeed } from './seeds.js';

export { MAX_SEED };
const LEVELS = { ladder: 2, claims: 2 };
const seedOf = value => (Number.isInteger(value) && value >= 0 && value <= MAX_SEED ? value : null);

export const url = Object.freeze({
  keys: ['ex', 'level', 'seed', 'scope'],
  syntax: true,
  scopes: ['checks'],
  decode(p, { places, random = Math.random }) {
    const base = places.checks ?? firstPlace(random);
    const exercise = oneOf(p.ex, EXERCISES) ?? 'proof';
    const seed = int(p.seed, 0, MAX_SEED) ?? newSeed(random);
    if (exercise === 'proof') return { checks: { ...base, exercise, proof: { seed, ...(p.scope === 'access' ? { scope: 'access' } : {}) } } };
    const level = int(p.level, 1, LEVELS[exercise]) ?? 1;
    const slot = base[exercise] ?? firstPlace(random)[exercise];
    return { checks: { ...base, exercise, [exercise]: { ...slot, level, tasks: { ...slot.tasks, [level]: { seed } } } } };
  },
  encode({ places }) {
    const place = places.checks;
    if (!place) return [];
    const exercise = EXERCISES.includes(place.exercise) ? place.exercise : 'proof';
    if (exercise === 'proof') return pairs([['ex', exercise], ['seed', seedOf(place.proof?.seed)], ['scope', place.proof?.scope === 'access' ? 'access' : null]]);
    const level = place[exercise]?.level;
    return pairs([['ex', exercise], ['level', level], ['seed', seedOf(place[exercise]?.tasks?.[level]?.seed)]]);
  },
});
