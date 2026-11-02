import { blockSize, fromInt, network, toInt } from '../../../engine/ip.js';

/** Remove old null slots on read; never mutate an existing answer. */
export function compactRoutes(answer = {}) {
  return Object.fromEntries(Object.entries(answer ?? {}).map(([router, rows]) => [router, (rows ?? []).filter(Boolean)]));
}

/** Stable guided slot identifier (independent of syntax and list ordering). */
export const slotId = (router, index) => `${router}.row${index + 1}`;

/** Destination prefix derived solely from scaffold metadata and the network. */
export function slotDestination(task, row) {
  if (row.dest.kind === 'default') return { dst: '0.0.0.0', prefix: 0 };
  const addresses = row.dest.segments.map(id => task.network.devices.flatMap(d => d.interfaces).find(f => f.segmentId === id && f.address)?.address).filter(Boolean);
  if (!addresses.length) return null;
  const low = Math.min(...addresses.map(a => toInt(network(a.ip, a.prefix))));
  const high = Math.max(...addresses.map(a => toInt(network(a.ip, a.prefix)) + blockSize(a.prefix) - 1));
  let prefix = 32;
  while (prefix > 0 && Math.floor(low / blockSize(prefix)) !== Math.floor(high / blockSize(prefix))) prefix--;
  return { dst: network(fromInt(low), prefix), prefix };
}

/** Guided view: honour explicit slot bindings first, then fill matching empty
 * slots in answer order. Duplicate defaults beyond the slots remain extras.
 * @returns {Object<string,{slots:({slot:string,route:object|null})[],extras:object[]}>}
 */
export function guidedView(task, answer) {
  const compact = compactRoutes(answer);
  return Object.fromEntries(Object.entries(task.variant.scaffold).map(([router, rows]) => {
    const slots = rows.map((row, i) => ({ slot: slotId(router, i), route: null, destination: slotDestination(task, row), discard: row.discard === true }));
    const matches = (route, s) => route.dst === s.destination?.dst && route.prefix === s.destination?.prefix && (route.discard === true) === s.discard;
    const routes = compact[router] ?? [], used = new Set();
    // Legacy forwarding bindings keep a checked wrong destination in place.
    // Discard bindings must match both their action and destination.
    for (const slot of slots) {
      const route = routes.find(r => r.slot === slot.slot && ((r.discard !== true && !slot.discard) || matches(r, slot)));
      if (route) { slot.route = route; used.add(route); }
    }
    for (const route of routes.filter(r => !used.has(r) && !r.slot)) {
      const own = slots.find(s => !s.route && s.slot === route.id && matches(route, s));
      if (own) { own.route = route; used.add(route); }
    }
    const extras = [];
    for (const route of routes.filter(r => !used.has(r))) {
      const free = slots.find(s => !s.route && matches(route, s));
      if (free) free.route = route;
      else extras.push(route);
    }
    return [router, { slots: slots.map(({ destination, discard, ...s }) => s), extras }];
  }));
}

/** Insert/replace a route with an existing lifetime id (or a caller-allocated
 * fresh id). Guided checks pass slot; free edits retain a matching binding and
 * drop a stale one. Does not reorder other canonical routes.
 */
export function putRoute(task, answer, router, route, { id = route.id, slot } = {}) {
  if (!id) throw new TypeError('A fresh route needs an allocated id');
  const next = compactRoutes(answer), rows = next[router] ?? [];
  const old = rows.find(r => r.id === id);
  const binding = slot ?? old?.slot ?? (task.variant.scaffold[router]?.some((_, i) => slotId(router, i) === id) ? id : undefined);
  const rowIndex = task.variant.scaffold[router]?.findIndex((_, i) => slotId(router, i) === binding);
  const row = rowIndex >= 0 ? task.variant.scaffold[router][rowIndex] : null;
  const dst = row ? slotDestination(task, row) : null;
  const matches = dst?.dst === route.dst && dst.prefix === route.prefix && (row.discard === true) === (route.discard === true);
  const { slot: ignored, ...body } = route;
  const saved = { ...body, id, ...(slot || matches ? { slot: binding } : {}) };
  // A binding can displace a previous occupant, but must not delete its route.
  next[router] = rows.map(r => {
    if (r.id === id) return saved;
    if (slot && r.slot === slot) { const { slot: previous, ...unbound } = r; return unbound; }
    return r;
  });
  if (!rows.some(r => r.id === id)) next[router].push(saved);
  return next;
}
