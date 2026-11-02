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
