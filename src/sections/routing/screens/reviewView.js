// What the routing screen shows of a post-success review (spec OPT-1 UI §2–§3
// with its v2 overrides U1, U3–U5). Pure: no React, tested in Node.
//
//   - A review belongs to one check: it is on display only while that check
//     is the instance's latest (`generation`) and its answer is unedited
//     (`edits`, which only grows, so typing the old text back doesn't
//     restore it). Late tips aren't announced; «Текстом» carries them.
//   - Guided mode («З підказками») follows its scaffold: no ★, and
//     `same-in-fewer` / `shorter-known` only where the student has more rows
//     than the scaffold (on that router; for `shorter-known`, in the task).
//     Duplicates, routes to connected networks and routes to nowhere always
//     show. Free mode («Самостійно») shows the whole review, ★ included.
//   - A route tip names the row the student sees now («R1, маршрут №2»):
//     guided slots, then «Інші маршрути», or the free list, resolved by the
//     route's lifetime id, never by array position. A tip whose row can't be
//     found isn't shown. After its place («R1, маршрут №2: », «R1: ») a tip
//     doesn't name the router again (optimiserUi.tipsAfterPlace).
import { optimiserUi, ui } from '../uk.js';

/** The review on display for an instance (useExercise's spread), or null. */
export function currentReview(instance) {
  const review = instance?.view?.review;
  if (!review || instance.result?.ok !== true) return null;
  return review.generation === (instance.generation ?? 0) && review.edits === (instance.edits ?? 0) ? review : null;
}

/** The tips a mode shows (U3). */
export function tipsFor(review, mode, task) {
  const tips = review?.tips ?? [];
  if (mode === 'free') return tips;
  const scaffold = task.variant.scaffold;
  const rowsOn = router => scaffold[router]?.length ?? 0;
  const allRows = Object.values(scaffold).reduce((n, rows) => n + rows.length, 0);
  return tips.filter(tip => {
    if (tip.code === 'same-in-fewer') return tip.params.now > rowsOn(tip.routerId);
    if (tip.code === 'shorter-known') return tip.params.count > allRows;
    return true;
  });
}

/** ★ «найкоротший відомий»: the final review's star, in free mode only (U3, U4). */
export const starFor = (review, mode) => mode === 'free' && review?.star === true;

/**
 * The tips as the screen draws them, in review order; unresolvable route tips left out.
 * @param {object[]} tips
 * @param {{ rowsOf: (router: string) => object[], bestAvailable: boolean }} where
 *   rowsOf: the rows the active mode lists for a router (items of useRouteAnswers);
 *   bestAvailable: «Показати найкоротший варіант» is on the screen
 * @returns {{ id: string, kind: 'row'|'router'|'best'|'text', label: string|null, text: string, plain: string, target: object|null }[]}
 */
export function tipItems(tips, { rowsOf, bestAvailable }) {
  const out = [];
  for (const [i, tip] of tips.entries()) {
    const text = (tip.scope === 'task' ? optimiserUi.tips : optimiserUi.tipsAfterPlace)[tip.code]?.(tip.params);
    if (!text) continue;
    const id = `tip-${i}-${tip.code}`;
    if (tip.scope === 'route') {
      const rows = rowsOf(tip.routerId) ?? [];
      const at = rows.findIndex(item => item.route?.id === tip.routeId);
      if (at < 0) continue;
      const item = rows[at];
      const label = ui.shared.tipRoute(tip.routerId, item.kind === 'slot' ? item.index + 1 : item.n);
      out.push({ id, kind: 'row', label, text, plain: `${label}: ${text}`, target: { kind: 'row', router: tip.routerId, key: item.key } });
    } else if (tip.scope === 'router') {
      out.push({ id, kind: 'router', label: tip.routerId, text, plain: `${tip.routerId}: ${text}`, target: { kind: 'router', router: tip.routerId } });
    } else {
      out.push({ id, kind: bestAvailable ? 'best' : 'text', label: null, text, plain: text, target: null });
    }
  }
  return out;
}
