// The success lap («коло пошани», polish spec v2 §2): what plays on the
// diagram when a network check passes, built from that check's evidence
// (presentCheck) and the bank's probe and demonstration endpoints only.
// Pure, tested in Node; LapLayer.jsx draws its frames and plays its
// schedule. Presentation only: assessment, the score and «Далі» don't move.
//
//   - The lap: every passing probe of a scenario with every link up whose
//     source and destination are a host or the internet (transit probes
//     aren't animated), all at once: each probe's request, then its reply
//     from the moment its own request arrives. Each move is one of the
//     trace's own hops (pathPlan.planPath), never a synthetic edge; strokes
//     that overlap (the same leg along the same line) are drawn once; no hop
//     numbers. A move takes min(0.45 s, 4 s / the longest probe's moves).
//   - ✓ while the lap plays only where its own packets arrived: a request at
//     its destination's box or cloud, a reply back at its source's box.
//   - An ending, after a 0.6 s pause, only where the evidence has one:
//       failover: the passing probes of a scenario with a link down (task
//         15, «Якщо лінк до ISP1 недоступний»): the link drawn down and the
//         packets going the other way; then the link comes back;
//       demonstration: presentCheck's first demonstration (tasks 3 and 3b
//         today), drawn as it is when picked.
//     While an ending plays, the lap's lines fade (to 0.3).
//   - The end state, the same with motion or without: the lap's lines, ✓ on
//     every LAN and server box (solvedMarks) and on every cloud a packet
//     reached, then the ending's own end state (failover: the link back up,
//     the lines bright again; a demonstration: its drawing over the faded
//     lines). The strip appends the ending's words once the ending starts.
//   - Evidence is checked before anything is drawn (wholeLeg): each hop a
//     device of the network, each next hop on the link the hop left by, the
//     first hop where the source is attached, the last where the
//     destination is, and every place on the diagram. A probe (or a
//     demonstration) whose evidence isn't whole isn't animated at all: no
//     path is invented for it, and no edge drawn across a missing hop.
import { cornerOf, placesOf, planPath, solvedMarks, STEP_MS } from './pathPlan.js';
import { ui } from '../uk.js';

/** The lap takes at most this long; with an ending, everything WITH_ENDING_MS. */
export const LAP_MS = 4000;
export const WITH_ENDING_MS = 6000;
/** The pause before an ending; how long a failover's detour stays before the link comes back. */
export const PAUSE_MS = 600;
export const HOLD_MS = 600;

/** A probe end the lap animates: a host or the internet, not a router's own interface. */
const animatedEnd = (net, ref) => net.endpoints.some(e => e.id === ref && (e.kind === 'host' || e.kind === 'internet'));
/** The links a scenario takes down (none for the normal one). */
const downLinksOf = (record, scenarioId) => record.scenarios?.find(s => s.id === scenarioId)?.downLinks ?? [];
/** One stroke of the drawing: the same leg along the same line is the same stroke. */
export const strokeKey = m => `${m.leg}:${m.x1},${m.y1},${m.x2},${m.y2}`;

/**
 * True when one leg of a drawing trace is whole: the devices it visits (its
 * hops, then where it stopped, if elsewhere) are devices of the network;
 * each hop's next device is the one the trace names and sits on the link
 * the hop left by; the first is attached where the leg starts (a host's
 * LAN, or a provider of the internet); and a leg that arrived ends where it
 * was going. Ids only: geometry is checked separately (drawable).
 * @param {object} net the task's network
 * @param {{ ok: boolean, hops: { deviceId, segmentId, nextDeviceId }[], stop: object|null }} leg
 * @param {string} from the endpoint (or interface) the leg starts at
 * @param {string} to the endpoint the leg goes to
 */
export function wholeLeg(net, leg, from, to) {
  if (!leg) return false;
  const hops = leg.hops ?? [];
  const device = id => net.devices.find(d => d.id === id);
  const on = (id, segmentId) => Boolean(segmentId) && Boolean(device(id)?.interfaces.some(f => f.segmentId === segmentId));
  const visits = hops.map(h => h.deviceId);
  if (leg.stop?.deviceId && leg.stop.deviceId !== visits.at(-1)) visits.push(leg.stop.deviceId);
  if (!visits.length || !visits.every(id => device(id))) return false;
  for (let i = 0; i + 1 < visits.length; i++) {
    const hop = hops[i];
    if (hop.nextDeviceId != null && hop.nextDeviceId !== visits[i + 1]) return false;
    if (!on(visits[i + 1], hop.segmentId)) return false;
  }
  const start = net.endpoints.find(e => e.id === from), end = net.endpoints.find(e => e.id === to);
  if (start?.kind === 'host' && !on(visits[0], start.segmentId)) return false;
  if (start?.kind === 'internet' && !start.viaPeers?.includes(visits[0])) return false;
  if (leg.ok && end?.kind === 'host' && hops.at(-1)?.segmentId !== end.segmentId) return false;
  if (leg.ok && end?.kind === 'internet' && !end.viaPeers?.includes(hops.at(-1)?.deviceId)) return false;
  return true;
}

/** A passing ping between hosts or the internet, with both legs of whole evidence. */
function playable(net, record, line) {
  if (line.kind !== 'probe' || line.status !== 'pass' || !line.trace?.request || !line.trace?.reply) return false;
  const ends = record.probes?.find(p => p.id === line.probe?.id);
  return Boolean(ends) && animatedEnd(net, ends.from) && animatedEnd(net, ends.to)
    && wholeLeg(net, line.trace.request, ends.from, ends.to) && wholeLeg(net, line.trace.reply, ends.to, ends.from);
}

/** True when every place a leg passes is drawn on the diagram: its devices and its hosts' LAN boxes. */
function drawable(places, legs, refs) {
  const devices = legs.flatMap(leg => [...leg.hops.map(h => h.deviceId), ...(leg.stop?.deviceId ? [leg.stop.deviceId] : [])]);
  return devices.every(id => places.device(id)) && refs.every(ref => ref === null || places.endpoint(ref));
}

/**
 * The ending a passing check has, from its evidence alone (no geometry):
 *   { kind: 'failover', lines, scenarioId, words } the passing probes of the
 *     first scenario with a link down;
 *   { kind: 'demo', demo, words } presentCheck's first demonstration;
 * or null. `words` is what the strip appends.
 * @param {object} presented presentCheck(...)
 * @param {object} net the task's network
 * @param {object} record the bank record (probes, scenarios, demonstrations)
 */
export function lapEnding(presented, net, record) {
  if (!presented?.ok) return null;
  const outage = presented.lines.filter(l => downLinksOf(record, l.scenarioId).length > 0 && playable(net, record, l));
  if (outage.length) {
    const scenarioId = outage[0].scenarioId;
    const label = presented.groups.find(g => g.id === scenarioId)?.label ?? '';
    return { kind: 'failover', scenarioId, lines: outage.filter(l => l.scenarioId === scenarioId), words: ui.shared.lapFailover(label) };
  }
  const demo = presented.demonstrations?.find(d => {
    const ends = record.demonstrations?.find(x => x.id === d.id);
    return d.trace?.request && wholeLeg(net, d.trace.request, ends?.from, ends?.to);
  });
  return demo ? { kind: 'demo', demo, words: demo.text } : null;
}

/** What `role="status"` says for a passing check, once: the strip's end state. */
export function lapAnnouncement(presented, net, record) {
  return [presented.strip, lapEnding(presented, net, record)?.words].filter(Boolean).join(' ');
}

/** A host endpoint's id (its LAN box must be drawn), else null (the internet has no box). */
const hostRef = (net, ref) => (net.endpoints.find(e => e.id === ref)?.kind === 'host' ? ref : null);

/** One probe's moves (request, then reply), without hop numbers, and the
 * boxes it reaches; null if any place it passes isn't on the diagram. */
function probePlan(geo, net, syntaxId, record, line, places) {
  const ends = record.probes.find(p => p.id === line.probe.id);
  if (!drawable(places, [line.trace.request, line.trace.reply], [hostRef(net, ends.from), hostRef(net, ends.to)])) return null;
  const plan = planPath(geo, net, syntaxId, line.trace, { from: ends.from, to: ends.to });
  const moves = plan.moves.filter(m => m.kind === 'line').map(({ badge, n, ...move }) => move);
  const request = moves.filter(m => m.leg === 'request'), reply = moves.filter(m => m.leg === 'reply');
  if (!request.length) return null;
  return { id: line.id, scenarioId: line.scenarioId, request, reply, requestEnd: request.at(-1).toBox, replyEnd: reply.at(-1)?.toBox ?? null, downLinks: plan.downLinks };
}

/** A box or cloud of the diagram, by its key, with the corner its ✓ sits on. */
function shapeOf(geo, key) {
  const e = geo.endpoints.find(x => x.key === key);
  if (!e) return null;
  const shape = e.shape === 'ellipse'
    ? { kind: 'cloud', x: e.x, y: e.y, rx: e.box.rx, ry: e.box.ry }
    : { kind: 'box', x: e.x, y: e.y, w: e.box.w, h: e.box.h };
  return { key, ...shape, mark: cornerOf(shape) };
}

const longest = probes => Math.max(0, ...probes.map(p => p.request.length + p.reply.length));

/**
 * The lap for a passing check, or null.
 * @param {object} geo diagramGeometry(...) of the diagram on screen
 * @param {object} net the task's network
 * @param {'cisco'|'routeros'} syntaxId the diagram's interface labels
 * @param {object} presented presentCheck(...) of the passing check
 * @param {object} record the bank record
 * @returns {null|{ probes: object[], steps: number, stepMs: number, ending: null|object,
 *   shapes: Object<string, object>, endMarks: string[] }}
 */
export function lapOf(geo, net, syntaxId, presented, record) {
  if (!presented?.ok) return null;
  const places = placesOf(geo, net, syntaxId);
  const plan = line => probePlan(geo, net, syntaxId, record, line, places);
  const probes = presented.lines.filter(l => downLinksOf(record, l.scenarioId).length === 0 && playable(net, record, l)).map(plan).filter(Boolean);
  const steps = longest(probes);
  const stepMs = steps ? Math.min(STEP_MS, LAP_MS / steps) : STEP_MS;
  const found = lapEnding(presented, net, record);
  let ending = null;
  if (found?.kind === 'failover') {
    const own = found.lines.map(plan).filter(Boolean);
    const downLinks = [...new Map(own.flatMap(p => p.downLinks).map(d => [d.segmentId, d])).values()];
    ending = { kind: 'failover', scenarioId: found.scenarioId, probes: own, steps: longest(own), downLinks, words: found.words };
  } else if (found?.kind === 'demo') {
    const ends = record.demonstrations?.find(d => d.id === found.demo.id);
    if (drawable(places, [found.demo.trace.request], [hostRef(net, ends?.from)])) {
      const demoPlan = planPath(geo, net, syntaxId, found.demo.trace, { from: ends?.from, to: ends?.to, expected: true });
      ending = { kind: 'demo', id: found.demo.id, plan: demoPlan, steps: demoPlan.moves.length, words: found.words };
    }
  }
  if (ending) {
    const room = WITH_ENDING_MS - steps * stepMs - PAUSE_MS - (ending.kind === 'failover' ? HOLD_MS : 0);
    ending.stepMs = ending.steps ? Math.min(stepMs, room / ending.steps) : stepMs;
  }
  const reached = [...probes, ...(ending?.probes ?? [])].flatMap(p => [p.requestEnd, p.replyEnd]).filter(Boolean);
  const keys = [...new Set([...solvedMarks(geo).map(m => m.key), ...reached])];
  const shapes = Object.fromEntries(keys.map(key => [key, shapeOf(geo, key)]).filter(([, s]) => s));
  return { probes, steps, stepMs, ending, shapes, endMarks: keys.filter(key => shapes[key]) };
}

/**
 * When each frame of the lap starts: [{ i, at (ms from the start), phase, step }].
 * Phases: 'lap' (step s: every probe's move s under way), 'pause' (the lap
 * done), 'ending' (its move s), 'hold' (a failover's detour, done), 'end'.
 */
export function lapSchedule(lap) {
  const ticks = [];
  const push = (at, phase, step = 0) => ticks.push({ i: ticks.length, at: Math.round(at), phase, step });
  for (let s = 0; s < lap.steps; s++) push(s * lap.stepMs, 'lap', s);
  let t = lap.steps * lap.stepMs;
  const ending = lap.ending;
  if (ending) {
    push(t, 'pause');
    t += PAUSE_MS;
    for (let s = 0; s < ending.steps; s++) push(t + s * ending.stepMs, 'ending', s);
    t += ending.steps * ending.stepMs;
    if (ending.kind === 'failover') {
      push(t, 'hold');
      t += HOLD_MS;
    }
  }
  push(t, 'end');
  return ticks;
}

/** Probes at step `step` of their own clock: the strokes drawn, the moves
 * under way (each probe's reply starts when its request has arrived), and
 * the boxes reached so far. */
function probesAt(probes, step) {
  const lines = new Map(), moving = new Map(), marks = [];
  for (const p of probes) {
    const moves = [...p.request, ...p.reply];
    const s = Math.min(step, moves.length);
    for (const m of moves.slice(0, s)) lines.set(strokeKey(m), m);
    if (s < moves.length) moving.set(strokeKey(moves[s]), moves[s]);
    if (s >= p.request.length && p.requestEnd) marks.push(p.requestEnd);
    if (s >= moves.length && p.replyEnd) marks.push(p.replyEnd);
  }
  return { lines: [...lines.values()], moving: [...moving.values()], marks };
}

/**
 * What is drawn at a tick of lapSchedule:
 *   lines, moving  the lap's strokes drawn and the moves under way (an
 *                  envelope each; a stroke not yet drawn fades in);
 *   faded          the lap's lines at 0.3 (while an ending is drawn);
 *   ending         null, { kind: 'failover', lines, moving, downLinks,
 *                  stepMs }, or { kind: 'demo', plan, step, stepMs } (the
 *                  demonstration's plan at that step: frameAt);
 *   marks          the boxes and clouds with ✓ and a green outline;
 *   words          the ending's words, once it has started, else null.
 */
export function lapFrame(lap, tick) {
  const { phase } = tick, done = phase === 'end', ending = lap.ending;
  const own = probesAt(lap.probes, phase === 'lap' ? tick.step : Infinity);
  const marks = new Set(own.marks);
  let drawn = null;
  if (ending?.kind === 'failover' && (phase === 'ending' || phase === 'hold')) {
    const at = probesAt(ending.probes, phase === 'ending' ? tick.step : Infinity);
    at.marks.forEach(key => marks.add(key));
    drawn = { kind: 'failover', lines: at.lines, moving: at.moving, downLinks: ending.downLinks, stepMs: ending.stepMs };
  } else if (ending?.kind === 'demo' && (phase === 'ending' || done)) {
    drawn = { kind: 'demo', plan: ending.plan, step: done ? ending.steps : tick.step, stepMs: ending.stepMs };
  }
  return {
    i: tick.i, phase, done,
    lines: own.lines, moving: own.moving, stepMs: lap.stepMs,
    faded: Boolean(drawn),
    ending: drawn,
    marks: (done ? lap.endMarks : [...marks]).map(key => lap.shapes[key]).filter(Boolean),
    words: ending && ['ending', 'hold', 'end'].includes(phase) ? ending.words : null,
  };
}

/**
 * Plays a schedule: `onTick(i)` at each tick's time. `start()` (again: a
 * replay from the top), `skip()` to the last tick, `cancel()`. The timers
 * are injectable for tests.
 */
export function lapPlayer(schedule, onTick, timers = globalThis) {
  let handles = [], index = -1;
  const show = i => { if (i > index) { index = i; onTick(i); } };
  const cancel = () => { handles.forEach(h => timers.clearTimeout(h)); handles = []; };
  return {
    start() {
      cancel();
      index = -1;
      show(0);
      handles = schedule.slice(1).map(tick => timers.setTimeout(() => show(tick.i), tick.at));
    },
    skip() { cancel(); show(schedule.length - 1); },
    cancel,
    get index() { return index; },
  };
}
