import { forwardingMap, forwardingAction } from '../../../engine/forwarding-map.js';
import { lookup, routingTable } from '../../../engine/forward.js';
import { blockSize, fromInt, toInt } from '../../../engine/ip.js';
import { coverSpace, unknownSpace } from '../../../engine/coverage.js';
import { minimiseTable } from '../../../engine/min-table.js';

/** Student-owned rows only; supplied rows are held in network.supplied. */
export function routeCounts(task, answer) {
  const counts = Object.fromEntries(task.network.devices.filter(d => Object.hasOwn(task.variant.scaffold, d.id))
    .map(d => [d.id, (answer?.[d.id] ?? []).filter(Boolean).length]));
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** Best-practice shape, beyond scenario safety: unknown traffic may only use
 * supplied hops, defaults or paths ending at explicit discards in every scenario;
 * new defaults are only for stub routers.
 * Check route boundaries too: forwardingMap can coalesce distinct winning rows
 * with the same action, hiding an overbroad summary beside a default. */
export function hasSafeShape(task, answer, routerId) {
  const net = task.network, device = net.devices.find(d => d.id === routerId);
  const supplied = net.supplied?.[routerId] ?? [];
  if ([...(answer?.[routerId] ?? []), ...supplied].some(r => r?.prefix === 0)
    && ![...(task.variant.referenceRoutes[routerId] ?? []), ...supplied].some(r => r.prefix === 0)) {
    const neighbours = net.devices.filter(d => d.id !== routerId && d.interfaces.some(f => device.interfaces.some(own => own.segmentId === f.segmentId)));
    if (neighbours.length !== 1) return false;
  }
  const unknown = unknownSpace(net);
  const scenarios = [{ downLinks: [] }, ...(task.record.scenarios ?? []).filter(s => s.downLinks.length)];
  return scenarios.every(options => {
    const table = routingTable(net, answer, routerId, options), needsDiscard = [];
    const edges = table.flatMap(r => [toInt(r.dst), toInt(r.dst) + blockSize(r.prefix)]);
    for (const piece of forwardingMap(net, answer, routerId, options)) {
      if (piece.action.kind !== 'hop') continue;
      const bounds = [piece.start, ...edges.filter(n => piece.start < n && n < piece.end), piece.end].sort((a, b) => a - b);
      for (let i = 0; i < bounds.length - 1; i++) {
        const start = bounds[i], end = bounds[i + 1];
        const row = lookup(net, answer, routerId, fromInt(start), options);
        if (row?.source === 'supplied' || row?.prefix === 0) continue;
        for (const [a, b] of unknown) {
          const lo = Math.max(start, a), hi = Math.min(end, b);
          if (lo < hi) needsDiscard.push([lo, hi]);
        }
      }
    }
    if (!needsDiscard.length) return true;
    const endings = coverSpace(net, answer, routerId, needsDiscard, { ...options, internet: true });
    // ISP arrival returns no failed piece. Require the entire captured space
    // to be reported as discarded, not merely every returned failure.
    return endings.every(piece => piece.code === 'discarded')
      && endings.reduce((size, piece) => size + piece.size, 0) === needsDiscard.reduce((size, [a, b]) => size + b - a, 0);
  });
}

/** Supported immutable baseline. Unsupported shapes never silently enter DP. */
export function routerProblem(task, answer, routerId, dontCare = false) {
  const net = task.network, table = routingTable(net, answer, routerId);
  const fixed = table.filter(r => r.type === 'connected').map(r => ({ dst: r.dst, prefix: r.prefix, action: forwardingAction(r) }));
  const pinned = (answer?.[routerId] ?? []).filter(r => r?.discard === true)
    .map(r => ({ dst: r.dst, prefix: r.prefix, action: { kind: 'discard' } }));
  const supplied = net.supplied?.[routerId] ?? [];
  if (supplied.length > 1 || supplied.some(r => r.prefix !== 0 || r.dst !== '0.0.0.0' || (r.distance ?? 1) !== 1 || r.discard === true)) {
    throw new TypeError('Only one supplied hop default is supported');
  }
  const suppliedRow = table.find(r => r.source === 'supplied');
  if (supplied.length && !suppliedRow) throw new TypeError('Unresolved supplied default');
  const intervals = forwardingMap(net, answer, routerId);
  if (intervals.some(p => p.action.kind === 'ecmp')) throw new TypeError('ECMP compression unsupported');
  // Check every route edge, even when equal actions coalesced in the map.
  const edges = new Set(table.flatMap(r => [toInt(r.dst), toInt(r.dst) + blockSize(r.prefix)]).filter(n => n < 2 ** 32));
  if ([...edges].some(n => (lookup(net, answer, routerId, fromInt(n))?.distance ?? 1) > 1)) {
    throw new TypeError('A backup wins in the normal scenario');
  }
  const unknown = dontCare ? unknownSpace(net) : [];
  const pieces = intervals.flatMap(piece => {
    const bounds = [piece.start, piece.end, ...unknown.flat().filter(n => n > piece.start && n < piece.end)].sort((a, b) => a - b);
    return bounds.slice(0, -1).map((start, i) => ({ start, end: bounds[i + 1], action: unknown.some(([a, b]) => start >= a && start < b) ? 'dontCare' : piece.action }));
  });
  return { intervals: pieces, fixed, pinned, rootAction: suppliedRow ? forwardingAction(suppliedRow) : { kind: 'none' }, forbidDefault: supplied.length > 0 };
}

/** Executable reconstruction; preserve backup objects exactly, once. */
export function compressedRows(task, answer, routerId, dontCare = false) {
  try {
    const result = minimiseTable(routerProblem(task, answer, routerId, dontCare));
    if (result.infeasible) return null;
    return [
      ...result.routes.map(({ dst, prefix, action }, i) => ({ id: `opt:${routerId}:${i + 1}`, dst, prefix,
        ...(action.kind === 'discard' ? { discard: true } : { via: action.via }), distance: 1 })),
      ...(answer?.[routerId] ?? []).filter(r => r && (r.distance ?? 1) > 1).map(r => ({ ...r })),
    ];
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return null;
  }
}

/** All objectives (including advice-severity form objectives), scenarios and A1. */
export const fullySafe = result => result.ok && result.evidence.objectives.every(o => o.ok);
