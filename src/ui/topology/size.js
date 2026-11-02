// How big a diagram is drawn (ARCHITECTURE §6, round 2 step 7), and its zoom
// (step 7 fix round, Vlad). Pure.
//
// The rendered scale is min(frameWidth / viewBox.w, frameHeight / viewBox.h)
// pixels per diagram unit. If the smallest text at that scale is below 12 px,
// the diagram is drawn at the scale that keeps it at 12 px instead, inside a
// pannable frame (the text equivalent is next to it).
//
// Zoom, kept per task instance in the store (the instance's `view.zoom`):
//   undefined  the default above: the whole diagram if its text stays at
//              12 px or more, otherwise 12 px text and panning;
//   'all'      the whole diagram («Уся схема»), even if its text drops
//              below 12 px;
//   a number   the smallest text's size in CSS px (12 is the readable
//              scale). Text size rather than a scale, so it means the same
//              in both syntaxes, whose diagrams differ slightly in size.

/** The smallest diagram text in CSS pixels outside a pannable frame. */
export const MIN_TEXT_PX = 12;
/** Small diagrams stop growing here (px per unit), so a two-router task
 * doesn't fill the screen with 40 px router names. */
export const MAX_SCALE = 8;
/** «+» and «−» step through text sizes 12 · 1.25ⁿ px (…, 9.6, 12, 15, 18.75, …). */
export const ZOOM_STEP = 1.25;
/** Zooming in stops when the smallest text reaches this size. */
export const MAX_ZOOM_PX = 32;

const EPS = 1e-6;

/** The smallest text size a geometry draws, in diagram units. */
export function smallestText(geo) {
  return Math.min(
    ...geo.links.flatMap(l => l.label.lines.map(line => line.size)),
    ...geo.endpoints.flatMap(e => [...e.lines.map(line => line.size), ...(e.port ? [e.port.size] : [])]),
    ...geo.routers.map(r => r.nameSize),
  );
}

/**
 * @param {{ w: number, h: number }} viewBox
 * @param {number} minText smallestText(geo)
 * @param {{ width: number, height: number }} frame the frame's inner size in
 *   CSS px; height Infinity where the page scrolls (the frame takes the
 *   diagram's own height)
 * @returns {{ pan: boolean, scale: number, width: number, height: number, minPx: number }}
 */
export function diagramFit(viewBox, minText, frame) {
  const scale = Math.min(frame.width / viewBox.w, frame.height / viewBox.h, MAX_SCALE);
  if (minText * scale >= MIN_TEXT_PX) return { pan: false, scale, width: viewBox.w * scale, height: viewBox.h * scale, minPx: minText * scale };
  const pan = MIN_TEXT_PX / minText;
  return { pan: true, scale: pan, width: viewBox.w * pan, height: viewBox.h * pan, minPx: MIN_TEXT_PX };
}

/**
 * The diagram at a zoom (see the top of this file).
 * @param {{ w: number, h: number }} viewBox
 * @param {number} minText smallestText(geo)
 * @param {{ width: number, height: number }} frame as for diagramFit
 * @param {undefined|null|'all'|number} zoom
 * @returns {{ pan: boolean, scale: number, width: number, height: number, minPx: number,
 *   fitScale: number, maxScale: number, all: boolean, canZoomIn: boolean, canZoomOut: boolean }}
 *   `fitScale`: the whole diagram; `all`: the whole diagram is in view;
 *   `pan`: it is bigger than the frame, which scrolls.
 */
export function diagramView(viewBox, minText, frame, zoom) {
  const fitScale = Math.min(frame.width / viewBox.w, frame.height / viewBox.h, MAX_SCALE);
  const maxScale = Math.max(fitScale, MAX_ZOOM_PX / minText);
  let scale;
  if (zoom === 'all') scale = fitScale;
  else if (typeof zoom === 'number' && zoom > 0) scale = Math.min(Math.max(zoom / minText, fitScale), maxScale);
  else scale = diagramFit(viewBox, minText, frame).scale;
  const all = scale <= fitScale * (1 + EPS);
  return {
    pan: !all,
    scale,
    width: viewBox.w * scale,
    height: viewBox.h * scale,
    minPx: minText * scale,
    fitScale,
    maxScale,
    all,
    canZoomIn: scale < maxScale * (1 - EPS),
    canZoomOut: !all,
  };
}

/** The zoom that shows text of `px` (or the whole diagram, if that's no bigger). */
function zoomFor(view, px) {
  const minText = view.minPx / view.scale;
  const next = Math.min(px, view.maxScale * minText);
  return next <= view.fitScale * minText * (1 + EPS) ? 'all' : next;
}

/** Step n of the ladder: 12 · 1.25ⁿ px (dividing below 12, so 12 / 1.25 is exactly 9.6). */
const step = n => (n >= 0 ? MIN_TEXT_PX * ZOOM_STEP ** n : MIN_TEXT_PX / ZOOM_STEP ** -n);

/** «+»: the next text size up the 12 · 1.25ⁿ ladder. */
export function zoomIn(view) {
  return zoomFor(view, step(Math.floor(Math.log(view.minPx * (1 + EPS) / MIN_TEXT_PX) / Math.log(ZOOM_STEP)) + 1));
}

/** «−»: the next text size down the ladder, or the whole diagram. */
export function zoomOut(view) {
  return zoomFor(view, step(Math.ceil(Math.log(view.minPx * (1 - EPS) / MIN_TEXT_PX) / Math.log(ZOOM_STEP)) - 1));
}

/** Ctrl + wheel: zoom by a factor (smoothly, for touchpads too). */
export function zoomBy(view, factor) {
  return zoomFor(view, view.minPx * factor);
}

/**
 * Where to scroll a frame so a point of the drawing is in view (pure; the
 * caller measures). Coordinates are CSS px in the frame's scroll content.
 * @param {{ x: number, y: number, margin?: number }} point
 * @param {{ left: number, top: number, width: number, height: number }} visible
 *   the frame's scroll position and inner size
 * @param {{ ifHidden?: boolean }} [options] only move if the point (with its
 *   margin) isn't wholly in view already
 * @returns {{ left: number, top: number } | null} the new scroll position, or
 *   null to stay
 */
export function scrollToShow(point, visible, { ifHidden = false } = {}) {
  const m = point.margin ?? 0;
  const inView = point.x - m >= visible.left && point.x + m <= visible.left + visible.width
    && point.y - m >= visible.top && point.y + m <= visible.top + visible.height;
  if (ifHidden && inView) return null;
  return { left: point.x - visible.width / 2, top: point.y - visible.height / 2 };
}
