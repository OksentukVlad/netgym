// VLAN's URL codec (spec URL v2.1; the contract is in ui/url-params.js). The
// place `vlan` keeps a slot per vendor where an exercise has one: the URL's
// keys go to the current vendor's (the link's `syntax`, else the learner's).
//
//   ex     predict | ports | route | faults (route and faults where the bank has them)
//                                   → vlan.exercise (default predict)
//   «Куди дійде кадр» (ex=predict):
//   shape  p1 | p2 | p3             → vlan.shape (default p1)
//   level  0–2                      → vlan.predict['<shape>|<vendor>'].level (default 0)
//   seed   1–999 999, one the logic builds for that shape, vendor and level
//                                   → vlan.predict['<shape>|<vendor>'].seed (default: a new one)
//   «Налаштуй порти» (ex=ports):
//   task   1–4 (vlan.ports-N)       → vlan.portsTask (default the first)
//   seed   1–999 999, built in both vendors → vlan.portsSeeds[task] (default: a new one)
//   «Між VLAN» (ex=route):
//   task   1–4 (vlan.route-N), one this vendor offers (4 is MikroTik's)
//                                   → vlan.routeTask (default the vendor's first)
//   seed   1–999 999, built in every vendor of the task → vlan.routeSeeds[task] (default: a new one)
//   «Знайди несправність» (ex=faults):
//   level  1–3                      → vlan.faults[vendor].level (default 1)
//   net    a network id (two-switch, local, transit, route-1 … route-4), optional
//                                   → vlan.faults[vendor].shape: «Інші номери» keeps it
//   seed   1–999 999, one the logic builds there → vlan.faults[vendor].seed
//                                   (default: a new one, on `net` where that network has
//                                   the level, else on the network the logic picks)
//
// The other exercises, shapes, tasks and vendors, and «Попередні номери», are
// kept as remembered. Seeds are predictState.js nextSeed's range.
import predict from '../logic/predict.js';
import ports from '../logic/ports.js';
import route from '../logic/route.js';
import faults from '../logic/faults-exercise.js';
import { builds, int, oneOf, pairs } from '../../../ui/url-params.js';
import { firstPlace, SYNTAXES } from './VlanScreen.jsx';
import { pickSlot } from './FaultsView.jsx';
import { MAX_LEVEL, SHAPES, paramsOf as predictParams, slotKey, slotOf as predictSlot, validSeed } from './predictState.js';
import { slotOf as faultsSlot } from './faultsState.js';
import { recordsFor, shownRecord } from './routeState.js';

export const MAX_SEED = 999999;
const FAULT_LEVELS = 3;

/** A task's short name in the URL: the number its id ends with (vlan.ports-2 → 2). */
export const taskName = record => record.id.slice(record.id.lastIndexOf('-') + 1);
const exercisesOf = bank => ['predict', 'ports', ...(bank.route?.length ? ['route'] : []), ...(bank.faults?.length ? ['faults'] : [])];
const seedOf = value => (Number.isInteger(value) && value >= 1 && value <= MAX_SEED ? value : null);
/** The URL's seed if the logic builds it, else a new one it builds. */
const chosenSeed = (seed, ok, random) => (seed !== null && ok(seed) ? seed : validSeed(ok, undefined, random));

export const url = Object.freeze({
  keys: ['ex', 'shape', 'task', 'net', 'level', 'seed'],
  syntax: true,
  scopes: ['vlan'],
  decode(p, { bank, syntax, places, random = Math.random }) {
    const base = places.vlan ?? firstPlace(bank, random);
    const exercise = oneOf(p.ex, exercisesOf(bank)) ?? 'predict';
    const seed = int(p.seed, 1, MAX_SEED);
    if (exercise === 'ports') {
      const record = bank.ports.find(r => taskName(r) === p.task) ?? bank.ports[0];
      const ok = s => SYNTAXES.every(x => builds(() => ports.create(record, { variantId: record.variants[0].id, seed: s, syntax: x })));
      return { vlan: { ...base, exercise, portsTask: record.id, portsSeeds: { ...base.portsSeeds, [record.id]: chosenSeed(seed, ok, random) } } };
    }
    if (exercise === 'route') {
      const offered = recordsFor(bank.route, syntax);
      const record = offered.find(r => taskName(r) === p.task) ?? offered[0];
      const ok = s => record.variants[0].syntaxes.every(x => builds(() => route.create(record, { variantId: 'main', seed: s, syntax: x })));
      return { vlan: { ...base, exercise, routeTask: record.id, routeSeeds: { ...base.routeSeeds, [record.id]: chosenSeed(seed, ok, random) } } };
    }
    if (exercise === 'faults') {
      const record = bank.faults[0];
      const level = int(p.level, 1, FAULT_LEVELS) ?? 1;
      const net = oneOf(p.net, record.variants.map(v => v.id));
      let slot = null;
      if (seed !== null) {
        try {
          const task = faults.create(record, { vendor: syntax, level, seed, ...(net ? { variantId: net } : {}) });
          slot = { seed, level, shape: task.identity.shape };
        } catch { /* not a task the logic builds there: a new one */ }
      }
      // No seed (or one the logic can't build): a new one, on the link's network where it has this level.
      const variant = record.variants.find(v => v.id === net);
      const onNet = variant?.levels.includes(level) && variant.syntaxes.includes(syntax) ? net : null;
      if (!slot && onNet) { try { slot = pickSlot(record, syntax, level, { random, shape: onNet }); } catch { /* the logic's choice below */ } }
      return { vlan: { ...base, exercise, faults: { ...base.faults, [syntax]: slot ?? pickSlot(record, syntax, level, { random }) } } };
    }
    const shape = oneOf(p.shape, SHAPES) ?? SHAPES[0];
    const level = int(p.level, 0, MAX_LEVEL) ?? 0;
    const ok = s => builds(() => predict.create(bank.predict, predictParams(shape, syntax, { seed: s, level })));
    return { vlan: { ...base, exercise, shape, predict: { ...base.predict, [slotKey(shape, syntax)]: { seed: chosenSeed(seed, ok, random), level } } } };
  },
  encode({ bank, syntax, places }) {
    const place = places.vlan;
    if (!place) return [];
    const exercise = exercisesOf(bank).includes(place.exercise) ? place.exercise : 'predict';
    if (exercise === 'ports') {
      const record = bank.ports.find(r => r.id === place.portsTask) ?? bank.ports[0];
      return pairs([['ex', exercise], ['task', taskName(record)], ['seed', seedOf(place.portsSeeds?.[record.id])]]);
    }
    if (exercise === 'route') {
      const record = shownRecord(bank.route, place.routeTask, syntax);
      return pairs([['ex', exercise], ['task', taskName(record)], ['seed', seedOf(place.routeSeeds?.[record.id])]]);
    }
    if (exercise === 'faults') {
      const slot = faultsSlot(place, syntax);
      return pairs([['ex', exercise], ['net', slot?.shape ?? null], ['level', slot?.level ?? null], ['seed', seedOf(slot?.seed)]]);
    }
    const shape = SHAPES.includes(place.shape) ? place.shape : SHAPES[0];
    const slot = predictSlot(place, shape, syntax);
    return pairs([['ex', exercise], ['shape', shape], ['level', slot.level], ['seed', seedOf(slot.seed)]]);
  },
});
