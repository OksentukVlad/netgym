// When a diagram shows its zoom bar («−», «+», «Уся схема»): round 4 spec
// A3 with its v2 rules, for the three diagrams (routing TopologyMap, the
// firewall's and VLAN's).
//
// - The bar shows only when the diagram, fitted to its frame, would draw its
//   smallest text below the readable size (fitScale × smallest text <
//   MIN_TEXT_PX), or when the learner has zoomed (a stored zoom: «+»/«−» keys
//   and Ctrl + wheel still work while the bar is hidden, and then it appears).
// - Decided when the task opens and when the frame's *width* changes, never
//   because of a height change (routing's frame grows with its check strip)
//   or because a check or a packet appeared.
// - Once shown for a task it stays until the task changes (no flicker).
// - Before the first measurement there is no bar (the screens reserve its
//   row's height, so its appearance moves nothing).
import { useRef } from 'react';
import { MIN_TEXT_PX } from './size.js';

/**
 * The decision, pure. `prev` is the last result (or null).
 * @param {{ taskKey: any, width: number|null|undefined, fitPx: number|null|undefined, zoomed: boolean }} now
 *   `width`: the frame's width (null before it is measured); `fitPx`: the
 *   smallest text at the fit scale; `zoomed`: the learner has zoomed
 * @returns {{ taskKey: any, width: number|null, show: boolean }}
 */
export function zoomBarState(prev, { taskKey, width, fitPx, zoomed }) {
  const same = prev && prev.taskKey === taskKey;
  const measured = Number.isFinite(width) && width > 0;
  let show = same ? prev.show : false;
  if (measured && (!same || prev.width !== width) && Number.isFinite(fitPx) && fitPx < MIN_TEXT_PX) show = true;
  if (zoomed) show = true;
  const next = { taskKey, width: measured ? width : same ? prev.width : null, show };
  return same && prev.width === next.width && prev.show === next.show ? prev : next;
}

/** A stored zoom (a number or 'all') means the learner has zoomed. */
export const isZoomed = zoom => zoom !== undefined && zoom !== null;

/**
 * @param {{ taskKey: any, width?: number|null, fitPx?: number|null, zoom?: any }} input
 * @returns {boolean} whether to render the zoom bar
 */
export function useZoomBar({ taskKey, width, fitPx, zoom }) {
  const state = useRef(null);
  // Idempotent for the same inputs, so a repeated render gives the same answer.
  state.current = zoomBarState(state.current, { taskKey, width, fitPx, zoomed: isZoomed(zoom) });
  return state.current.show;
}
