// «Куди дійде кадр»: the round's state as the store keeps it (VLAN-1 spec §2
// with v2 W1, W6, W7). Pure: no React, DOM or clock; tested in Node.
//
// The section place (`vlan`) keeps, per shape and vendor («p2|routeros»),
// the instance last shown: its seed and its surprise level. A shape starts at
// level 0 (a network without faults); «Ще одна» moves to 1, then 2, and stays
// at 2 with a new seed. The syntax switch opens (or returns to) the other
// vendor's instance: its own seed, level and rounds.
//
// Per task instance (its key includes the vendor and the level),
// `instance.view` holds:
//   drafts    { [roundId]: hostId[] }   the PCs tapped before «Перевірити»
//   position  the round on screen
//   commit    predict.js's CommitState (answer, result), locked per round
// Rounds come from task.rounds (three or four); nothing assumes how many.
import { initialCommitState } from '../logic/predict.js';

export const SHAPES = ['p1', 'p2', 'p3'];
export const MAX_LEVEL = 2;

/** The place key of a shape's instance in one vendor. */
export const slotKey = (shape, vendor) => `${shape}|${vendor}`;

/** A seed for «Ще одна» or a first visit: a different one each time. */
export function nextSeed(previous, random = Math.random) {
  let seed;
  do seed = 1 + Math.floor(random() * 999999); while (seed === previous);
  return seed;
}

/** The first seed `valid` accepts (the logic can build it), trying a bounded
 * number; failing that, the current seed (so the instance on screen stays). */
export function validSeed(valid, previous, random = Math.random) {
  for (let i = 0; i < 50; i++) {
    const seed = nextSeed(previous, random);
    if (valid(seed)) return seed;
  }
  return previous ?? 1;
}

/** A place written before a task existed has no seed for it: the first seed
 * the logic can build (deterministic, so every render agrees). */
export function firstValidSeed(valid, tries = 50) {
  for (let seed = 1; seed <= tries; seed++) if (valid(seed)) return seed;
  return 1;
}

/** The instance a shape shows in a vendor: { seed, level }, from the place. */
export function slotOf(place, shape, vendor) {
  const slot = place?.predict?.[slotKey(shape, vendor)];
  return { seed: slot?.seed ?? 1, level: Number.isInteger(slot?.level) ? Math.max(0, Math.min(MAX_LEVEL, slot.level)) : 0 };
}

/** The params predict.create gets for a slot. */
export const paramsOf = (shape, vendor, slot) => ({ variantId: shape, seed: slot.seed, vendor, surprises: slot.level });

/** «Ще одна»: the next level (up to 2) and a new seed. */
export const nextSlot = (slot, seed) => ({ seed, level: Math.min(MAX_LEVEL, slot.level + 1) });

/** The instance's round view, read safely: a commit from another instance never applies. */
export function roundView(view = {}, task) {
  const last = task.rounds.length - 1;
  const position = Number.isInteger(view.position) ? Math.max(0, Math.min(last, view.position)) : 0;
  return {
    drafts: view.drafts ?? {},
    position,
    commit: view.commit?.instanceKey === task.instanceKey ? view.commit : null,
  };
}

/** The commit state to use: the stored one, or a fresh one. */
export const commitOf = (round, task) => round.commit ?? initialCommitState(task);

export const isCommitted = (commitState, roundId) => Object.prototype.hasOwnProperty.call(commitState.answer, roundId);

/** A committed round's mark: ok or no (the frame went elsewhere); null before. */
export function roundStatus(commitState, roundId) {
  if (!isCommitted(commitState, roundId)) return null;
  return commitState.result.findings.some(f => f.entity === roundId) ? 'no' : 'ok';
}

/** The progress dots: committed rounds and the current one are clickable. */
export function dotsOf(task, commitState, position) {
  return task.rounds.map((round, i) => {
    const status = roundStatus(commitState, round.id);
    return { n: i + 1, status, current: i === position, clickable: status !== null || i === position };
  });
}

/** Every round committed (right or wrong). */
export const allCommitted = (task, commitState) => task.rounds.every(r => isCommitted(commitState, r.id));

/** The next round still open after `position` (wrapping), or null. */
export function nextOpen(task, commitState, position) {
  const n = task.rounds.length;
  for (let step = 1; step <= n; step++) {
    const i = (position + step) % n;
    if (!isCommitted(commitState, task.rounds[i].id)) return i;
  }
  return null;
}

/** The PCs a round can choose from: every host but its source, in host order. */
export const choicesOf = (task, round) => task.topology.hosts.map(h => h.device).filter(id => id !== round.from);

/** Toggle a PC in a draft selection, kept in host order. «Нікому» is the empty list. */
export function toggle(task, selection, host) {
  const set = new Set(selection ?? []);
  if (set.has(host)) set.delete(host); else set.add(host);
  return task.topology.hosts.map(h => h.device).filter(id => set.has(id));
}
