// The order arithmetic of ReorderList (components/ReorderList.jsx), pure so
// tests and later users (the firewall order exercise) can run it in Node.

/** The order after moving `id` to index `to` (clamped to the list), or null when nothing moves. */
export function moveTo(ids, id, to) {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  const at = Math.max(0, Math.min(ids.length - 1, to));
  if (at === from) return null;
  const next = ids.filter(x => x !== id);
  next.splice(at, 0, id);
  return next;
}

/** Where a key takes the row at `index` (ArrowUp, ArrowDown one step; Home, End the ends), or null for any other key. Only the list's ends limit it. */
export function keyTarget(key, index, count) {
  const to = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: count - 1 }[key];
  return to === undefined ? null : Math.max(0, Math.min(count - 1, to));
}

/**
 * Where a dragged row lands: `rows` are the rows' { top, bottom } in the list's
 * order (the row at `from` at home), `centre` the carried card's centre, all in
 * one coordinate system. `to` is its index after the drop (moveTo's); `top` and
 * `height` the slot it would fill; `step` how far the rows it passes move aside.
 */
export function landing(rows, from, centre) {
  const others = rows.filter((_, i) => i !== from);
  const to = others.filter(row => (row.top + row.bottom) / 2 < centre).length;
  const height = rows[from].bottom - rows[from].top;
  const step = from + 1 < rows.length ? rows[from + 1].top - rows[from].top : from > 0 ? rows[from].bottom - rows[from - 1].bottom : 0;
  return { to, top: to > from ? rows[to].bottom - height : rows[to].top, height, step };
}

const EDGE_ZONE = 72;
const EDGE_SLOW = 180;
const EDGE_FAST = 900;

/** Auto-scroll for a pointer at `y` in an area from `top` to `bottom`: px per second, up negative, faster nearer the edge, 0 away from it. */
export function edgeSpeed(y, top, bottom) {
  const zone = Math.min(EDGE_ZONE, (bottom - top) / 4);
  if (zone <= 0) return 0;
  const up = top + zone - y, down = y - (bottom - zone);
  const depth = Math.min(1, Math.max(up, down) / zone);
  if (depth <= 0) return 0;
  return (up > down ? -1 : 1) * (EDGE_SLOW + depth * (EDGE_FAST - EDGE_SLOW));
}
