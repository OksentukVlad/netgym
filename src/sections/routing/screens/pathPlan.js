// The packet path as a layer of the diagram's own SVG (round 2 step 6,
// design §2 "Drawing"): pure geometry, no React, tested in Node.
//
// Input: the diagram geometry (ui/topology/geometry.js), the task's network,
// the active syntax (the diagram labels interfaces in it), and a drawing
// trace from presentCheck: { request, reply, downLinks } with legs of
// { ok, hops: [{ deviceId, segmentId, nextDeviceId }], stop }. Device and
// segment ids only; the trace carries no address, and neither does the plan.
//
// Output, in viewBox units:
//   moves     the packet's steps in order: the request's straight moves (hop
//             numbers 1, 2, 3…), its loop arc, then the reply's. Request and
//             reply run side by side, each OFFSET to its own left, so the two
//             legs of one link never overlap;
//   stops     an amber ring where a leg stopped (`expected` for a
//             demonstration's safe drop; r 0: a provider's cloud, ✗ only);
//             a failure without a stopped packet rings its repair router;
//   arrived   ✓ on the box the request reached;
//   downLinks a link that is down in the scenario («⚡ впав»);
//   focus     the point to bring into view without motion (the stop).
// `after` on a mark is the index of the last move that must be drawn first,
// so a mark appears when its leg is done; with every move drawn, the plan is
// the static drawing (the last frame of the motion).
// A straight move also names what it joins: `from` and `to` are a device id
// (a router, or a provider drawn as its cloud) or `box:<diagram key>` for a
// LAN or server box, and `toBox` is the diagram key of the box or cloud it
// ends at (the success lap marks it, lapPlan.js). Ids and keys only.
import { DIAGRAM_R } from '../../../ui/topology/geometry.js';

/** One move of the packet takes this long (PathLayer's motion). */
export const STEP_MS = 450;

/** Request and reply: this far either side of the drawn link. */
export const OFFSET = 1.3;
/** Where a move's hop number sits: on a link between routers, 40 % along;
 * on a box's line (where the port name sits on the line), beside it. */
export function badgeOf(move, a, b) {
  const routers = a.kind === 'router' && b.kind === 'router';
  const t = routers ? 0.4 : 0.5, side = routers ? 0 : BADGE_SIDE;
  const L = Math.hypot(move.x2 - move.x1, move.y2 - move.y1) || 1;
  const nx = -(move.y2 - move.y1) / L, ny = (move.x2 - move.x1) / L;
  return { x: round(move.x1 + (move.x2 - move.x1) * t + nx * side), y: round(move.y1 + (move.y2 - move.y1) * t + ny * side) };
}
/** A hop number beside a box's line: this far from the request. */
const BADGE_SIDE = 4.6;
/** How far a loop arc bulges, as a share of the distance it spans. */
const BULGE = 0.34;

const round = v => Math.round(v * 100) / 100;

/** Where things are on the diagram: routers, segment boxes and clouds. */
export function placesOf(geo, net, syntaxId) {
  const routers = new Map(geo.routers.map(r => [r.name, r]));
  const box = e => (e.shape === 'ellipse'
    ? { x: e.x, y: e.y, kind: 'cloud', rx: e.box.rx, ry: e.box.ry, endpoint: e }
    : { x: e.x, y: e.y, kind: 'box', w: e.box.w, h: e.box.h, endpoint: e });
  /** The diagram's box (LAN, servers) or cloud (WAN) for a segment, if it draws one. */
  function segment(segmentId) {
    for (const d of net.devices.filter(x => x.kind === 'router')) {
      const iface = d.interfaces.find(f => f.segmentId === segmentId);
      if (!iface) continue;
      const e = geo.endpoints.find(x => x.router === d.id && x.ep.name === iface.labels?.[syntaxId]);
      if (e) return box(e);
    }
    return null;
  }
  /** A router's circle, or a provider's cloud (an ISP is drawn as its WAN). */
  function device(id) {
    const r = routers.get(id);
    if (r) return { x: r.x, y: r.y, kind: 'router', r: DIAGRAM_R.keep, ring: r.ring, deviceId: id };
    const d = net.devices.find(x => x.id === id);
    for (const f of d?.interfaces ?? []) {
      const p = segment(f.segmentId);
      if (p) return { ...p, deviceId: id };
    }
    return null;
  }
  /** A probe's end: a host's box, a router interface's router; the internet has no point of its own. */
  function endpoint(ref) {
    if (!ref) return null;
    const ep = net.endpoints.find(e => e.id === ref);
    if (ep) return ep.kind === 'internet' || !ep.segmentId ? null : segment(ep.segmentId);
    const owner = net.devices.find(d => d.interfaces.some(f => f.id === ref || f.address?.ip === ref));
    return owner ? device(owner.id) : null;
  }
  return { routers, segment, device, endpoint };
}

/** Distance from a shape's centre to its edge in direction (ux, uy). */
function edge(p, ux, uy) {
  if (p.kind === 'router') return p.r;
  if (p.kind === 'cloud') return 1 / Math.hypot(ux / p.rx, uy / p.ry);
  const sx = Math.abs(ux) > 1e-9 ? p.w / 2 / Math.abs(ux) : Infinity;
  const sy = Math.abs(uy) > 1e-9 ? p.h / 2 / Math.abs(uy) : Infinity;
  return Math.min(sx, sy);
}

const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** A straight move from shape a to shape b: edge to edge, OFFSET to its left. */
function lineMove(a, b, leg) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const nx = -uy, ny = ux;
  let s = edge(a, ux, uy), e = edge(b, ux, uy);
  if (s + e > L - 1) { s = 0; e = 0; } // overlapping shapes: centre to centre
  const x1 = a.x + ux * s + nx * OFFSET, y1 = a.y + uy * s + ny * OFFSET;
  const x2 = b.x - ux * e + nx * OFFSET, y2 = b.y - uy * e + ny * OFFSET;
  return { leg, kind: 'line', x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2),
    length: round(Math.hypot(x2 - x1, y2 - y1)), target: { x: b.x, y: b.y }, deviceId: b.deviceId ?? null,
    from: placeId(a), to: placeId(b), toBox: b.kind === 'router' ? null : b.endpoint?.key ?? null };
}

/** A shape's id in a move: its device, else its diagram box. */
const placeId = p => p.deviceId ?? (p.endpoint ? `box:${p.endpoint.key}` : null);

/** The closing edge of a loop: a curved arrow from a back to b, bulging to
 * its left, or to its right where the link's label box is on the left. */
function loopMove(a, b, leg, label, avoid = null) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  if (avoid && (avoid.x - (a.x + b.x) / 2) * nx + (avoid.y - (a.y + b.y) / 2) * ny > 0) { nx = -nx; ny = -ny; }
  const cx = (a.x + b.x) / 2 + nx * L * BULGE, cy = (a.y + b.y) / 2 + ny * L * BULGE;
  const from = (p, q) => { const d = Math.hypot(q.x - p.x, q.y - p.y) || 1, u = { x: (q.x - p.x) / d, y: (q.y - p.y) / d }; const k = edge(p, u.x, u.y); return { x: p.x + u.x * k, y: p.y + u.y * k }; };
  const s = from(a, { x: cx, y: cy }), e = from(b, { x: cx, y: cy });
  const mid = { x: 0.25 * s.x + 0.5 * cx + 0.25 * e.x, y: 0.25 * s.y + 0.5 * cy + 0.25 * e.y };
  return { leg, kind: 'loop', label, x1: round(s.x), y1: round(s.y), x2: round(e.x), y2: round(e.y), cx: round(cx), cy: round(cy),
    d: `M${round(s.x)},${round(s.y)} Q${round(cx)},${round(cy)} ${round(e.x)},${round(e.y)}`,
    labelX: round(mid.x + nx * 3.4), labelY: round(mid.y + ny * 3.4),
    length: round(Math.hypot(cx - s.x, cy - s.y) + Math.hypot(e.x - cx, e.y - cy)), target: { x: b.x, y: b.y }, deviceId: b.deviceId ?? null };
}

/** The shapes one leg passes, in order, from its source to where it ends. */
function legPoints(places, leg, sourceRef) {
  const points = [];
  const push = p => { if (p && !(points.length && same(points.at(-1), p))) points.push(p); };
  push(places.endpoint(sourceRef));
  for (const hop of leg.hops ?? []) push(places.device(hop.deviceId));
  if (leg.stop?.deviceId && leg.stop.deviceId !== leg.hops?.at(-1)?.deviceId) push(places.device(leg.stop.deviceId));
  const last = leg.hops?.at(-1);
  if (leg.ok && last?.segmentId && places.routers.has(last.deviceId)) push(places.segment(last.segmentId));
  return points;
}

/** The corner of a box or cloud where a small mark (✓) sits. */
export function cornerOf(p) {
  if (p.kind === 'cloud') return { x: round(p.x + p.rx * 0.74), y: round(p.y - p.ry * 0.74) };
  if (p.kind === 'box') return { x: round(p.x + p.w / 2), y: round(p.y - p.h / 2) };
  return { x: round(p.x + p.r * 0.72), y: round(p.y - p.r * 0.72) };
}

/** The device a loop's closing edge points back to. */
function loopEnds(leg) {
  const stop = leg.stop;
  if (!stop || !['loop', 'ttl-exceeded'].includes(stop.code)) return null;
  if (stop.nextDeviceId) return [stop.deviceId, stop.nextDeviceId];
  const devices = (leg.hops ?? []).map(h => h.deviceId);
  const [b, a] = [devices.at(-2), devices.at(-1)];
  return a && b && a !== b ? [a, b] : null;
}

/**
 * The drawing of one trace.
 * @param {object} geo     diagramGeometry(...) of the diagram on screen
 * @param {object} net     the task's network
 * @param {'cisco'|'routeros'} syntaxId  the diagram's interface labels
 * @param {{ request?: object|null, reply?: object|null, downLinks?: string[] }|null} trace
 * @param {{ from?: string|null, to?: string|null, repairRouter?: string|null, failed?: boolean, expected?: boolean }} [ends]
 *   the probe's endpoints (from the bank), the repair router of a failed
 *   line, and `expected` for a demonstration (its stop is the right outcome).
 */
export function planPath(geo, net, syntaxId, trace, { from = null, to = null, repairRouter = null, failed = false, expected = false } = {}) {
  const plan = { moves: [], stops: [], arrived: [], downLinks: [], focus: null };
  if (!trace) return plan;
  const places = placesOf(geo, net, syntaxId);
  let number = 0;
  for (const [legName, leg, source] of [['request', trace.request, from], ['reply', trace.reply, to]]) {
    if (!leg) continue;
    const points = legPoints(places, leg, source);
    for (let i = 0; i + 1 < points.length; i++) {
      const move = lineMove(points[i], points[i + 1], legName);
      if (legName === 'request') {
        move.n = ++number;
        move.badge = badgeOf(move, points[i], points[i + 1]);
      }
      plan.moves.push(move);
    }
    const loop = loopEnds(leg);
    if (loop) {
      const [a, b] = loop.map(id => places.device(id));
      const link = geo.links.find(l => loop.includes(l.from) && loop.includes(l.to));
      const avoid = link ? { x: link.label.cx, y: link.label.cy } : null;
      if (a && b && !same(a, b)) plan.moves.push(loopMove(a, b, legName, leg.stop.code === 'ttl-exceeded' ? 'TTL' : '⟲', avoid));
    }
    const after = plan.moves.length - 1;
    const ringId = leg.stop && (trace.ringAt ?? leg.stop.deviceId);
    const stopAt = ringId && places.device(ringId);
    if (stopAt && stopAt.kind === 'router') {
      plan.stops.push({ leg: legName, deviceId: ringId, code: leg.stop.code, x: stopAt.x, y: stopAt.y, r: round(stopAt.ring + 1.8), after, expected });
    } else if (stopAt) {
      // A provider stopped it (its cloud): the ✗ on the cloud, no ring.
      plan.stops.push({ leg: legName, deviceId: ringId, code: leg.stop.code, ...cornerOf(stopAt), r: 0, after, expected });
    }
    const end = points.at(-1);
    if (legName === 'request' && leg.ok && end && end.kind !== 'router') plan.arrived.push({ ...cornerOf(end), after });
  }
  if (failed && !plan.stops.length && repairRouter) {
    const p = places.device(repairRouter);
    if (p?.kind === 'router') plan.stops.push({ leg: null, deviceId: repairRouter, code: 'repair', x: p.x, y: p.y, r: round(p.ring + 1.8), after: plan.moves.length - 1, expected: false });
  }
  for (const segmentId of trace.downLinks ?? []) {
    const line = downLine(geo, net, places, segmentId);
    if (line) plan.downLinks.push(line);
  }
  const stop = plan.stops.find(s => !s.expected) ?? plan.stops[0];
  plan.focus = stop ? { x: stop.x, y: stop.y, deviceId: stop.deviceId } : null;
  return plan;
}

/** A link that is down in the scenario: the drawn line it is, and where «⚡ впав» goes. */
function downLine(geo, net, places, segmentId) {
  const seg = net.segments.find(s => s.id === segmentId);
  if (!seg) return null;
  let x1, y1, x2, y2;
  if (seg.kind === 'link') {
    const ends = net.devices.filter(d => d.kind === 'router' && d.interfaces.some(f => f.segmentId === segmentId)).map(d => d.id);
    const link = geo.links.find(l => ends.includes(l.from) && ends.includes(l.to));
    if (!link) return null;
    const L = Math.hypot(link.x2 - link.x1, link.y2 - link.y1) || 1, ux = (link.x2 - link.x1) / L, uy = (link.y2 - link.y1) / L, K = DIAGRAM_R.keep;
    [x1, y1, x2, y2] = [link.x1 + ux * K, link.y1 + uy * K, link.x2 - ux * K, link.y2 - uy * K];
  } else {
    const p = places.segment(segmentId);
    if (!p) return null;
    ({ x1, y1, x2, y2 } = p.endpoint.visible);
  }
  const L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
  const side = nx > 0 || (nx === 0 && ny < 0) ? 1 : -1; // the label goes right of the line
  return { segmentId, x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2),
    labelX: round((x1 + x2) / 2 + side * nx * 4.5), labelY: round((y1 + y2) / 2 + side * ny * 4.5) };
}

/** ✓ on every LAN and server box once the whole network passes. */
export function solvedMarks(geo) {
  return geo.endpoints.filter(e => e.type === 'lan' || e.type === 'server').map(e => ({ key: e.key, ...cornerOf({ kind: 'box', x: e.x, y: e.y, w: e.box.w, h: e.box.h }) }));
}

/** What is drawn at a step of the motion: moves before `step` in full, the
 * move at `step` on its way (null once every move is drawn), and the marks
 * whose leg is done. With step ≥ moves.length this is the static drawing. */
export function frameAt(plan, step) {
  const total = plan.moves.length;
  const s = Math.max(0, Math.min(step, total));
  return {
    done: s >= total,
    drawn: plan.moves.slice(0, s),
    moving: s < total ? plan.moves[s] : null,
    stops: plan.stops.filter(m => m.after < s),
    arrived: plan.arrived.filter(m => m.after < s),
  };
}

/** A drawing trace for a safety line's cycle (presentCheck's `cycle`:
 * router ids, closed and directed, e.g. ['R1', 'R2', 'R3', 'R1']): each
 * consecutive pair in order, the ring on the first router (the repair
 * router). Only the edges the cycle has: nothing is drawn back that the
 * routes don't send. Two routers close with the loop's ⟲ arc (the way back
 * is the same link); a longer cycle closes with a straight, numbered move
 * along its own link (an arc would cut across the drawing). */
export function cycleTrace(cycle) {
  if (!Array.isArray(cycle) || cycle.length < 3 || cycle[0] !== cycle.at(-1)) return null;
  const ids = cycle.length === 3 ? cycle.slice(0, -1) : cycle;
  const stop = cycle.length === 3 ? { deviceId: ids.at(-1), nextDeviceId: cycle[0], code: 'loop' } : { deviceId: cycle[0], nextDeviceId: cycle[1], code: 'cycle' };
  return { direction: 'request', ringAt: cycle[0], downLinks: [], reply: null,
    request: { ok: false, hops: ids.map((deviceId, i) => ({ deviceId, segmentId: null, nextDeviceId: cycle[i + 1] ?? cycle[1] })), stop } };
}
