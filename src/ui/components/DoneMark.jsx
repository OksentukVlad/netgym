// A quiet ✓ on a task, variant, deck or level the learner has solved (round 4
// spec A5): no counters, no scores. It goes inside the control it marks, so
// «розв’язано» becomes part of that control's accessible name; the ✓ itself
// is aria-hidden.
//
// Meaning: solved at least once without a reveal in this app run (the
// shared session's `earned.solved`; a reveal before earning prevents it, a
// reveal after keeps it; the store is in memory, nothing persists).
// `earnedBy` aggregates it over the store's instances by any part of their
// identity (a task id, a variant, a level): a level shows ✓ when at least one
// of its tasks was earned.
import { uk } from '../uk.js';
import '../tokens.css';
import './DoneMark.css';

/** @param {{ done?: boolean }} props */
export default function DoneMark({ done = true }) {
  if (!done) return null;
  return <span className="ng-done"><span aria-hidden="true">✓</span><span className="ng-sr-only"> {uk.solved}</span></span>;
}

/**
 * The set of `pick(identity)` values over earned instances. Instance keys are
 * JSON identities (useExercise's instanceKeyOf); `pick` returns a value to
 * collect, or null/undefined to skip an instance of another exercise.
 * @param {Record<string, { session?: { earned?: { solved?: boolean } } }>} instances  the store's
 * @param {(identity: object) => any} pick
 */
export function earnedBy(instances, pick) {
  const out = new Set();
  for (const [key, instance] of Object.entries(instances ?? {})) {
    if (!instance?.session?.earned?.solved) continue;
    let identity = null;
    try { identity = JSON.parse(key); } catch { continue; }
    const value = identity && typeof identity === 'object' ? pick(identity) : null;
    if (value !== null && value !== undefined) out.add(value);
  }
  return out;
}
