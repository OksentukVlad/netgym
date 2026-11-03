// «DHCP і NAT»'s URL codec (spec URL v2.1; the contract is in ui/url-params.js).
//
//   ex     sides | server | nat | fault    → dhcp.exercise          (default sides)
//   level  server 1–3, nat 1–2, fault 1–3  → dhcp.server.level / dhcp.nat.level / dhcp.fault.level (default 1)
//   seed   0–999 999                       → that exercise's (and level's) current task:
//                                            dhcp.sides.seed, dhcp.server.tasks[level].seed,
//                                            dhcp.nat.tasks[level].seed, dhcp.fault.tasks[level].seed
//                                            (default: a new seed)
//   other  1                               → the same task's `other` (renumbered addresses; default false)
//   n      nat level 2 only, 0–999 999     → dhcp.nat.tasks[2].n (its round count: Cisco's
//                                            two-LAN task on odd rounds; default 0)
//
// The other levels' tasks, the other exercises and the asides are kept as
// remembered. Seeds start below 100 000 and count up by one per round,
// wrapping to 0 after 999 999 (seeds.js), as `n` does.
import { int, oneOf, pairs } from '../../../ui/url-params.js';
import { EXERCISES, firstPlace } from './DhcpScreen.jsx';
import { MAX_SEED, newSeed } from './seeds.js';

export { MAX_SEED };
const LEVELS = { server: 3, nat: 2, fault: 3 };

const seedOf = value => (Number.isInteger(value) && value >= 0 && value <= MAX_SEED ? value : null);

export const url = Object.freeze({
  keys: ['ex', 'level', 'seed', 'other', 'n'],
  syntax: true,
  scopes: ['dhcp'],
  decode(p, { places, random = Math.random }) {
    const base = places.dhcp ?? firstPlace(random);
    const exercise = oneOf(p.ex, EXERCISES) ?? 'sides';
    const seed = int(p.seed, 0, MAX_SEED) ?? newSeed(random);
    const other = p.other === '1';
    if (exercise === 'sides') return { dhcp: { ...base, exercise, sides: { seed, other } } };
    const level = int(p.level, 1, LEVELS[exercise]) ?? 1;
    const task = exercise === 'nat' && level === 2 ? { seed, other, n: int(p.n, 0, MAX_SEED) ?? 0 } : { seed, other };
    // A place remembered before E4 existed has no `fault` slot: the first place's.
    const slot = base[exercise] ?? firstPlace(random)[exercise];
    return { dhcp: { ...base, exercise, [exercise]: { ...slot, level, tasks: { ...slot.tasks, [level]: task } } } };
  },
  encode({ places }) {
    const place = places.dhcp;
    if (!place) return [];
    const exercise = EXERCISES.includes(place.exercise) ? place.exercise : 'sides';
    if (exercise === 'sides') return pairs([['ex', exercise], ['seed', seedOf(place.sides?.seed)], ['other', place.sides?.other === true && 1]]);
    const level = place[exercise]?.level;
    const task = place[exercise]?.tasks?.[level] ?? {};
    const n = exercise === 'nat' && level === 2 && Number.isInteger(task.n) && task.n > 0 && task.n <= MAX_SEED ? task.n : null;
    return pairs([['ex', exercise], ['level', level], ['seed', seedOf(task.seed)], ['other', task.other === true && 1], ['n', n]]);
  },
});
