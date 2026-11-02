// The VLAN walks in motion (VLAN-anim spec v2, Y1–Y11): what moves at each
// step, built from the very evidence the static scene draws. Pure: no
// React, DOM or clock; tested in Node. VlanDiagram.jsx draws its tokens;
// walkPlayer.js plays it through src/ui/motion.js.
//
// A motion is { scene, total, moves, chips, captions, reveal }:
//   - scene: the static end frame (diagram.js walkScene / traceScene), the
//     one shown before and after the motion and under reduced motion (Y11);
//   - moves: one token crossing one link in one step (STEP_MS), with the
//     wire form it carries there (out.tagged / out.vid: «тег N» or «без
//     тега», never the task's goals, Y1);
//   - chips: «VLAN N» inside a bridge that classified the frame, while it
//     leaves (Y1); a transparent hop or an ingress drop has none;
//   - captions: a router's hop (Y3): the same IP packet, a new Ethernet frame;
//   - reveal: from which step each part of the end frame shows.
//
// Two kinds (Y2):
//   - floodMotion, «Куди дійде кадр» and «Налаштуй порти»: one token per
//     actual hop.out, grouped by causal depth. The hops carry no depth: a
//     hop's parent is the earlier hop whose out reaches its in-port across
//     a link (geo.links[].ends). An ordinary «not allowed out» has no token,
//     only its quiet mark when the frame is at that switch; an ingress drop
//     shows its ✕ once the token got there (Y4);
//   - traceMotion, «Між VLAN»: no fan-out. Each segment's token follows
//     followPath (diagram.js traceScene, which records it), a router hop is
//     a pause step, and the next segment is a new token (Y3).
// A sequence plays motions one after another (the success laps, Y9; a
// request then its reply, Y10).
import { endOf, traceScene, walkScene } from './diagram.js';

/** One step of the motion (Y8); the success lap's whole run is capped at
 * LAP_MS, as routing's lap is (routing/screens/lapPlan.js: sections don't
 * import each other). */
export const STEP_MS = 450;
export const LAP_MS = 4000;

const blankTimeline = () => ({ total: 0, moves: [], chips: [], captions: [], reveal: { carried: {}, drops: {}, hosts: {}, ifaces: {}, deviceDrops: {} } });

/**
 * A broadcast (engine/l2.js flood) in motion: one token per real hop.out at
 * its hop's causal depth.
 * @param {object} geo layout()
 * @param {object} walk a flood walk
 * @param {{ leaked?: string[] }} [options] PCs the frame must not reach (as walkScene)
 */
export function floodMotion(geo, walk, { leaked = [] } = {}) {
  const scene = walkScene(geo, walk, { leaked });
  const tl = blankTimeline();
  const depth = new Map();
  walk.hops.forEach((hop, i) => {
    if (hop.inPort === null) { depth.set(i, 0); return; }
    // The parent: an earlier hop whose out crosses the link to this hop's in-port.
    const found = endOf(geo, hop.device, hop.inPort);
    const other = found ? Object.keys(found.link.ends).find(key => key !== `${hop.device}|${hop.inPort}`) : null;
    const [device, port] = other ? other.split('|') : [];
    const parent = walk.hops.findIndex((h, j) => j < i && h.device === device && h.out.some(o => o.port === port && (o.tagged ? o.vid : null) === (hop.tagged ? hop.vid : null)));
    depth.set(i, parent >= 0 ? (depth.get(parent) ?? 0) + 1 : 1);
  });
  let total = 0, drop = 0;
  walk.hops.forEach((hop, i) => {
    const d = depth.get(i);
    // Everything this hop shows (its arrival, its drops) shows once the frame is there.
    const there = d - 1;
    // walkScene lists the drops hop by hop, in this order.
    for (let k = 0; k < hop.dropped.length; k++) tl.reveal.drops[drop++] = [there];
    if (hop.inPort !== null && geo.hosts.some(b => b.id === hop.device)) tl.reveal.hosts[hop.device] ??= [there];
    for (const out of hop.out) {
      const found = endOf(geo, hop.device, out.port);
      if (!found) continue;
      const from = `${hop.device}|${out.port}`, to = Object.keys(found.link.ends).find(key => key !== from);
      tl.moves.push({ step: d, link: found.link.index, from, to, tagged: out.tagged, vid: out.tagged ? out.vid : null, arrow: '', slot: 0, token: `${i}:${out.port}`, frame: 1, back: false });
      (tl.reveal.carried[found.link.index] ??= []).push(d);
      total = Math.max(total, d + 1);
    }
    // Inside a bridge that classified the frame (Y1), while it leaves; a
    // transparent hop and an ingress drop keep the wire form.
    const ingressDrop = hop.dropped.some(x => x.port === hop.inPort);
    if (hop.inPort !== null && hop.out.length && hop.transparent === false && hop.vid != null && !ingressDrop) tl.chips.push({ step: d, device: hop.device, port: hop.inPort, vid: hop.vid });
  });
  // A broadcast from an L3 interface (not a PC) lights its line from the start.
  if (!geo.hosts.some(b => b.id === walk.from)) tl.reveal.ifaces[walk.from] = [{ at: -1, status: 'source' }];
  tl.total = total;
  return { scene, ...tl };
}

/** An IP trace (one ping3 request or reply) in motion, recorded by traceScene itself. */
export function traceMotion(geo, topology, trace, attachments = []) {
  const tl = blankTimeline();
  const scene = traceScene(geo, topology, trace, attachments, tl);
  return { scene, ...tl };
}

/** One evidence in motion: { walk, leaked } (a flood) or { trace, topology, attachments }. */
export function walkMotion(geo, evidence) {
  return evidence.trace ? traceMotion(geo, evidence.topology, evidence.trace, evidence.attachments ?? []) : floodMotion(geo, evidence.walk, { leaked: evidence.leaked ?? [] });
}

/**
 * The spec's step list (§3), for reading and tests: per step, the tokens
 * moving and what shows at its end.
 * @returns {Array<{ t: number, tokens: Array<{ from: string, to: string, badge: object }>, marks: string[] }>}
 */
export function walkSteps(geo, evidence) {
  const m = walkMotion(geo, evidence);
  return Array.from({ length: m.total }, (_, t) => ({
    t,
    tokens: m.moves.filter(x => x.step === t).map(x => ({ from: x.from, to: x.to, badge: { tagged: x.tagged, vid: x.vid } })),
    marks: [
      ...Object.entries(m.reveal.hosts).filter(([, ats]) => ats.includes(t)).map(([host]) => `host:${host}`),
      ...Object.entries(m.reveal.drops).filter(([, ats]) => ats.includes(t)).map(([i]) => `drop:${m.scene.drops[i].device}|${m.scene.drops[i].port}`),
      ...Object.entries(m.reveal.ifaces).filter(([, list]) => list.some(x => x.at === t)).map(([id]) => `iface:${id}`),
      ...Object.entries(m.reveal.deviceDrops).filter(([, ats]) => ats.includes(t)).map(([device]) => `device:${device}`),
      ...m.chips.filter(c => c.step === t).map(c => `vlan:${c.device}|${c.vid}`),
      ...m.captions.filter(c => c.step === t).map(c => `route:${c.router}`),
    ],
  }));
}

/** Motions one after another (a lap, a request then its reply). */
export function sequence(motions) {
  let offset = 0;
  const runs = motions.filter(Boolean).map(motion => { const run = { motion, offset }; offset += motion.total; return run; });
  return { runs, total: offset };
}

/** The run under way at step s (the last one at the end). */
export function runAt(seq, s) {
  const i = seq.runs.findIndex(r => s < r.offset + r.motion.total);
  const index = i >= 0 ? i : seq.runs.length - 1;
  return index >= 0 ? { index, run: seq.runs[index], local: s - seq.runs[index].offset } : null;
}

const RANK = { source: 1, hop: 2, received: 3, dropped: 4 };
const before = (ats, s) => (ats ?? []).some(at => at < s);

/** The end frame as it stands at step s: only what has shown by then. */
export function sceneAt(motion, s) {
  const { scene, reveal } = motion;
  if (s >= motion.total) return scene;
  const carried = {};
  for (const [index, value] of Object.entries(scene.carried)) {
    const ats = reveal.carried[index] ?? [];
    if (Array.isArray(value)) {
      const shown = value.filter((_, k) => ats[k] !== undefined && ats[k] < s);
      if (shown.length) carried[index] = shown;
    } else if (before(ats, s)) carried[index] = value;
  }
  const ifaces = {};
  for (const [id, list] of Object.entries(reveal.ifaces)) {
    const now = list.filter(x => x.at < s).map(x => x.status).sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0))[0];
    if (now) ifaces[id] = now;
  }
  const hosts = list => list.filter(h => before(reveal.hosts[h], s));
  return {
    ...scene,
    carried,
    drops: scene.drops.filter((_, i) => before(reveal.drops[i], s)),
    received: hosts(scene.received),
    tagged: hosts(scene.tagged),
    leaked: hosts(scene.leaked ?? []),
    ifaces,
    deviceDrops: Object.fromEntries(Object.entries(scene.deviceDrops ?? {}).filter(([device]) => before(reveal.deviceDrops[device], s))),
  };
}

/** A link end's point on the drawing: a bridge's port, or the PC's edge. */
export function endPoint(geo, index, key) {
  const link = geo.links.find(l => l.index === index);
  const own = link.ends[key];
  if (own?.port) return { x: own.port.x, y: own.port.y };
  const other = Object.entries(link.ends).find(([k]) => k !== key)?.[1];
  const atStart = other?.port && other.port.x === link.line.x1 && other.port.y === link.line.y1;
  return atStart ? { x: link.line.x2, y: link.line.y2 } : { x: link.line.x1, y: link.line.y1 };
}

/** The tokens moving at step s, with their geometry: one per move. Its
 * wire form shows where the end frame's plate for that crossing will be
 * (the link's tag spot, or its second on a trunk that carries two frames),
 * so it never covers a box's words or a port's label. */
export function tokensAt(geo, motion, s, tone = null) {
  return motion.moves.filter(m => m.step === s).map(m => {
    const link = geo.links.find(l => l.index === m.link);
    return {
      id: `${m.token}@${m.step}`, from: endPoint(geo, m.link, m.from), to: endPoint(geo, m.link, m.to),
      tagged: m.tagged, vid: m.vid, arrow: m.arrow ?? '', badgeAt: (m.slot ?? 0) > 0 ? link.tag2 : link.tag,
      trunk: link.kind === 'trunk', frame: m.frame, back: m.back, tone,
    };
  });
}

/** The «VLAN N» chips at step s: inside the box, on the side of the port
 * the frame came in at, clear of the box's words: under its name and the
 * selected device's tag (which end at 44), and under its interface lines
 * when it has them (SW1 in «Керування», a MikroTik router). */
export function chipsAt(geo, motion, s) {
  return motion.chips.filter(c => c.step === s).map(c => {
    const box = geo.switches.find(b => b.id === c.device);
    const end = endOf(geo, c.device, c.port);
    if (!box || !end) return null;
    const p = end.end.port ?? { x: box.cx, y: box.y };
    // The first free baseline: under the tag row, or under the last line.
    const lines = box.lines?.length ?? 0;
    const free = lines ? box.y + (box.linesTop ?? 42) + lines * 16 + 4 : box.y + 62;
    const fits = y => y <= box.y + box.h - 4;
    let y, x, anchor;
    if (end.link.kind === 'trunk') {
      const top = Math.abs(p.y - box.y) < Math.abs(p.y - (box.y + box.h));
      y = top || lines ? free : box.y + box.h - 10;
      x = box.cx + 8; anchor = 'start';
    } else {
      const left = Math.abs(p.x - box.x) < Math.abs(p.x - (box.x + box.w));
      y = Math.max(p.y + 22, free);
      x = left ? box.x + 6 : box.x + box.w - 6; anchor = left ? 'start' : 'end';
    }
    return { key: `${c.device}|${c.port}`, vid: c.vid, x, y: fits(y) ? y : box.y + box.h - 6, anchor };
  }).filter(Boolean);
}

/** The router hop under way at step s, if any (Y3's caption). */
export const captionAt = (motion, s) => motion.captions.find(c => c.step === s) ?? null;

/** The step length of a run: STEP_MS, a lap within LAP_MS (Y8). */
export const stepMsFor = (total, lap = false) => (lap && total > 0 ? Math.min(STEP_MS, Math.floor(LAP_MS / total)) : STEP_MS);
