import { blockSize, fromInt, toInt } from './ip.js';
import { lookup, routingTable } from './forward.js';

/** Canonical, structural action identity; route IDs and distances aren't actions. */
export function actionKey(action) {
  if (action === 'dontCare') return '"dontCare"';
  return JSON.stringify(Object.fromEntries(Object.keys(action).sort().map(key => [key, action[key]])));
}

export function forwardingAction(row) {
  if (!row) return { kind: 'none' };
  if (row.code === 'unsupported-ecmp') return { kind: 'ecmp' };
  if (row.discard === true) return { kind: 'discard' };
  if (row.type === 'connected') return { kind: 'connected', egressId: row.egressId };
  return { kind: 'hop', egressId: row.egressId, via: row.via };
}

/** Disjoint half-open {start,end,action} intervals covering all IPv4 addresses. */
export function forwardingMap(net, routes, deviceId, options = {}) {
  const bounds = new Set([0, 2 ** 32]);
  for (const row of routingTable(net, routes, deviceId, options)) {
    const start = toInt(row.dst);
    bounds.add(start); bounds.add(start + blockSize(row.prefix));
  }
  const sorted = [...bounds].sort((a, b) => a - b), result = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i], end = sorted[i + 1];
    const action = forwardingAction(lookup(net, routes, deviceId, fromInt(start), options));
    const last = result.at(-1);
    if (last && actionKey(last.action) === actionKey(action)) last.end = end;
    else result.push({ start, end, action });
  }
  return result;
}

/** Compare union boundaries. ignored is a disjoint list of [start,end) ranges. */
export function equalForwarding(left, right, ignored = []) {
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start), end = Math.min(left[i].end, right[j].end);
    if (actionKey(left[i].action) !== actionKey(right[j].action)
      && !ignored.some(([a, b]) => a <= start && b >= end)) {
      // An ignored interval can end inside this piece: compare all remaining space.
      let cursor = start;
      for (const [a, b] of ignored) {
        if (b <= cursor) continue;
        if (a > cursor) break;
        cursor = Math.max(cursor, b);
      }
      if (cursor < end) return false;
    }
    if (left[i].end === end) i++;
    if (right[j].end === end) j++;
  }
  return i === left.length && j === right.length;
}
