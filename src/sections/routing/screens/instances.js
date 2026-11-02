// Routing task instances for the screen (step 9, «Інші адреси»): the base
// addresses of a bank record, or a seeded instance with other addresses that
// logic/static.js's create() renumbers and accepts. Every part of the screen
// uses the one instance it gets from here: its record, network, texts,
// checks, hints, reveal and frozen table (spec step 9 R7).
//
//   - instanceOf: create(), remembered per record and parameters. A generated
//     instance takes up to half a second to place and accept (task 17), so
//     the screen never builds one twice; the hook gets the same object. Its
//     network is remembered per record and seed (one network per record,
//     spec R6): the other variant of tasks 3 and 8 on the same addresses is
//     the same placed record, so switching 3 → 3b doesn't place it again.
//   - otherSeed: «Інші адреси»'s pick, skipping infeasible seeds.
//   - ownInstances: the bank's routing instances in the store, base and
//     generated, for the score, the list's ✓ and «Скинути рахунок».
import routing from '../logic/static.js';

/** Instances and networks remembered per record (the oldest goes first). */
const LIMIT = 24;
const memo = new WeakMap();
const networks = new WeakMap();
const mapOf = (store, record) => store.get(record) ?? store.set(record, new Map()).get(record);
function remember(map, key, value) {
  map.delete(key);
  map.set(key, value);
  if (map.size > LIMIT) map.delete(map.keys().next().value);
  return value;
}

/** Another variant on a generated task's network: what create() returns for
 * it (the same placed record; the identity names the variant), without
 * placing and accepting the network again. A test keeps the two equal. */
function onSameNetwork(task, variantId) {
  const variant = task.record.variants.find(v => v.id === variantId);
  if (!variant) throw new RangeError(`Unknown variant: ${variantId}`);
  const identity = { ...task.identity, variantId: variant.id };
  return { record: task.record, variant, network: task.record.network, identity, instanceKey: JSON.stringify(identity) };
}

/**
 * @param {object} record a bank record
 * @param {{ variantId?: string, seed?: number|null, bankId: string, bankRevision: number }} params
 * @returns {object} create()'s task, or its `{ infeasible: true, code: 'infeasible' }`
 *   (a record's seed is infeasible for every variant: they are accepted together)
 */
export function instanceOf(record, { variantId, seed = null, bank, bankId = bank?.bankId, bankRevision = bank?.bankRevision }) {
  const tasks = mapOf(memo, record), key = JSON.stringify([variantId, seed, bankId, bankRevision]);
  if (tasks.has(key)) return remember(tasks, key, tasks.get(key));
  if (seed === null) return remember(tasks, key, routing.create(record, { variantId, seed, bank, bankId, bankRevision }));
  const placed = mapOf(networks, record), net = JSON.stringify([seed, bankId, bankRevision]);
  const known = placed.get(net);
  const task = !known ? routing.create(record, { variantId, seed, bank, bankId, bankRevision })
    : known.infeasible ? known : onSameNetwork(known, variantId ?? record.variants[0].id);
  remember(placed, net, known ?? task);
  return remember(tasks, key, task);
}

/** The routing logic with instanceOf as its create, for useExercise. */
export const cachedRouting = Object.freeze({ ...routing, create: (record, params) => instanceOf(record, params) });

/** Seeds of the generator (four digits in a code). */
export const SEEDS = 10000;

/**
 * «Інші адреси»: a random seed other than the current one whose instance can
 * be built (`feasible`), or null if none of `tries` draws can.
 * @param {(seed: number) => boolean} feasible
 * @param {{ current?: number|null, random?: () => number, tries?: number }} [options]
 */
export function otherSeed(feasible, { current = null, random = Math.random, tries = 20 } = {}) {
  for (let i = 0; i < tries; i++) {
    const seed = Math.min(SEEDS - 1, Math.floor(random() * SEEDS));
    if (seed !== current && feasible(seed)) return seed;
  }
  return null;
}

/** The bank's own routing instances in the store, base and generated alike:
 * an instance key is its JSON identity (logic/static.js create()). */
export function ownInstances(instances, bank) {
  const ids = new Set(bank.tasks.map(r => r.id));
  return Object.entries(instances ?? {}).flatMap(([key, instance]) => {
    let identity = null;
    try { identity = JSON.parse(key); } catch { return []; }
    return identity && identity.exerciseId === routing.id && identity.bankId === bank.bankId && identity.bankRevision === bank.bankRevision
      && ids.has(identity.taskId) ? [{ key, identity, instance }] : [];
  });
}

/** Task ids earned on any instance (any variant, any addresses): each counts once. */
export function earnedTasks(own) {
  return new Set(own.filter(o => o.instance?.session?.earned?.solved).map(o => o.identity.taskId));
}
