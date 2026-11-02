// The firewall round's state, as the store keeps it (FW-1 screen spec §6,
// v2 S3). Pure: no React, DOM or clock; tested in Node.
//
// Per task instance (its key includes the seed and, round 4, the level),
// `instance.view` holds:
//   drafts    { [cardId]: { hook?, decidedBy?, retry? } }  the choices before
//             «Перевірити». Level 1: `hook`, then «Перевірити» commits it.
//             Level 2 (spec F1 v3): `hook` is the chain the learner chose and
//             checkHook accepted (it unlocks the rule step); a wrong chain is
//             not committed: `retry` keeps its words (the session got
//             `assist`) and `hook` stays empty; `decidedBy` is the rule row
//   position  the card on screen
//   commit    predict.js's CommitState (answer, result), locked per card
//   revealed  [cardId]  cards locked by «Показати відповідь»
//   played    [cardId]  commits whose walk has played (in commit order)
//   zoom      the diagram's zoom
// Hint progress is the session's hintIndex (per round: the rungs stay open
// for later cards; their text can use the current card). The section place
// keeps the active variant and each variant's seed.
import { generatorVersion, initialCommitState } from '../logic/predict.js';

export const EXERCISE_ID = 'fw-predict';

/** A store key's identity, if it is a firewall prediction instance. */
export function identityOf(key) {
  try {
    const identity = JSON.parse(key);
    return identity && identity.exerciseId === EXERCISE_ID ? identity : null;
  } catch { return null; }
}

/** Every firewall instance key in the store. */
export const firewallKeys = instances => Object.keys(instances).filter(key => identityOf(key));

/** The set of `pick(identity)` over earned firewall prediction instances
 * (as DoneMark.jsx's earnedBy, kept here so this module stays pure). */
function earnedBy(instances, pick) {
  const out = new Set();
  for (const [key, instance] of Object.entries(instances ?? {})) {
    const identity = identityOf(key);
    if (!identity || identity.generatorVersion !== generatorVersion || !instance?.session?.earned?.solved) continue;
    const value = pick(identity);
    if (value !== null && value !== undefined) out.add(value);
  }
  return out;
}

/** The level of an identity (instances from before round 4 have none: level 2). */
export const levelOf = identity => (identity?.level === 1 ? 1 : 2);

/** Variants with an earned round, across seeds (S3): the ✓ (DoneMark) on their labels. */
export const earnedVariants = instances => earnedBy(instances, identity => (identity.exerciseId === EXERCISE_ID ? identity.variantId : null));

/** Levels with an earned round in any of their variants (spec F1 v2): the ✓ on the level switch. */
export const earnedLevels = instances => earnedBy(instances, identity => (identity.exerciseId === EXERCISE_ID ? levelOf(identity) : null));

/** The draft of the card on screen at a level: level 2's chain counts only once accepted. */
export const hookAccepted = (level, draft) => level === 2 && Boolean(draft?.hook);

/** The instance's round view, read safely: a commit from another instance never applies. */
export function roundView(view = {}, task) {
  const position = Number.isInteger(view.position) ? Math.max(0, Math.min(task.cards.length - 1, view.position)) : 0;
  return {
    drafts: view.drafts ?? {},
    position,
    commit: view.commit?.instanceKey === task.instanceKey ? view.commit : null,
    revealed: Array.isArray(view.revealed) ? view.revealed : [],
    played: Array.isArray(view.played) ? view.played : [],
  };
}

/** The commit state to use: the stored one, or a fresh one. */
export const commitOf = (round, task) => round.commit ?? initialCommitState(task);

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export const isCommitted = (commitState, cardId) => has(commitState.answer, cardId);

/** A committed card's mark: ok, no (the filter decided otherwise) or revealed. */
export function cardStatus(commitState, revealed, cardId) {
  if (!isCommitted(commitState, cardId)) return null;
  if (revealed.includes(cardId)) return 'revealed';
  return commitState.result.findings.some(f => f.entity === cardId) ? 'no' : 'ok';
}

/** The progress dots (§6, S3): committed dots and the current card are clickable. */
export function dotsOf(task, commitState, revealed, position) {
  return task.cards.map((card, i) => {
    const status = cardStatus(commitState, revealed, card.id);
    return { n: i + 1, status, current: i === position, clickable: status !== null || i === position };
  });
}

/** The round (S3): it ends when every card is committed (a revealed card is
 * committed); all right means no finding and no reveal. */
export function roundOf(task, commitState, revealed) {
  const complete = task.cards.every(c => isCommitted(commitState, c.id));
  return { complete, allRight: complete && commitState.result.ok && revealed.length === 0 };
}

/** The next card still open after `position` (wrapping), or null. */
export function nextOpen(task, commitState, position) {
  const n = task.cards.length;
  for (let step = 1; step <= n; step++) {
    const i = (position + step) % n;
    if (!isCommitted(commitState, task.cards[i].id)) return i;
  }
  return null;
}

/** A new round's seed («Далі →»): a different one each time. */
export function nextSeed(previous, random = Math.random) {
  let seed;
  do seed = 1 + Math.floor(random() * 999999); while (seed === previous);
  return seed;
}
