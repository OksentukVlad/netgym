// The VLAN diagram's layout and what it shows (VLAN-1 spec §4, W9): a small
// adapter for switched networks next to src/ui/topology, whose geometry is
// routing-oriented. Pure: tested in Node. VlanDiagram.jsx draws it in a
// frame sized and zoomed by src/ui/topology/size.js.
//
// Layout (viewBox units; about one CSS pixel at the class PCs' 1280 px):
//
//   PC1 ───fa0/3─┐ SW1 ┌─fa0/5─── PC2
//   PC3 ─────────┤     │
//                └──┬──┘
//                   │ gi0/1     the trunk: switches stacked in a column,
//          тег 10   │           one under the other in the topology's order
//                   │ gi0/1
//                ┌──┴──┐
//   PC4 ─────────┤ SW2 ├─────── PC5
//
//   - each switch's PCs split into a left and a right column (the first
//     half left), one row each; the switch box spans its rows;
//   - a port's label sits above its link, next to the switch (trunks: to
//     the right of the line, at each end);
//   - during a walk, a link the frame crossed carries «тег 10» or «без тега»
//     below it, near the PC (trunks: to the left of the line, halfway);
//   - a drop is a ✕ on the link, next to the port that dropped the frame.
// Text is 12 units or more (TEXT). Every PC box has four lines: its name,
// its address, a third line the screen fills (its goal VLAN in «Налаштуй
// порти», «обрано» in the prediction) and, after a walk, its status in words
// («надсилає», «✓ отримав», «✕ з тегом», «✕ отримав, а не мав»).
//
// «Між VLAN» (VLAN-2) adds, with the same rules:
//   - a router: a box in the same column, above the switches (routers come
//     first), joined to its switch by a vertical trunk; in task 4 its own PCs
//     sit left and right of it, as a switch's do;
//   - interface lines inside a router or switch box (`lines`, from the
//     submitted configuration only): the column widens to fit the longest
//     (up to COL_MAX; longer lines end in «…»), the box grows to fit them;
//   - a fifth PC line («шлюз …», `hostLines: 5`), the status moving under it;
//   - an IP trace (traceScene): per segment, only the links on the tree path
//     from the segment's sender to its next hop, each plate with its
//     direction; the drop where the frame stopped on that path; the router's
//     interfaces marked on their lines. Only the trace's own destination can
//     say «✓ отримав».
export const TEXT = { min: 12, label: 12, name: 14, switch: 16 };
/** Monospace text width per character, in units at 12 (0.62 em). */
export const MONO = 0.62 * TEXT.label;

const MARGIN = 12;
export const PC = { w: 164, h: 78 };
const GAP = 10;          // between two PC boxes in a column
const LINK_LEN = 80;     // a PC's link, between its box and the switch
const SW_W = 104;      // wide enough for the selected device's «налаштовуєш» at 12
const TRUNK = 66;        // a trunk, between two switches
const HOST_LINE = 17;    // between a PC box's lines
// A router's or switch's interface lines (VLAN-2): under the name, one per
// LINE, after a marker column (✓, ✕, •) of MARK units.
export const LINES = { top: 42, step: 16, pad: 10, mark: 14 };
const COL_MAX = 194;
const ROUTER_MIN = 56;
/** «Між VLAN»'s geometry: five PC lines in a slightly narrower box («шлюз
 * 172.16.200.254» still fits) and shorter links, so that a router column of
 * COL_MAX still fits the stage at 1280 px without panning (674 units). */
export const ROUTE_LAYOUT = { hostLines: 5, pcWidth: 156, link: 72 };

// Round 5 (spec 5b-1 §4 v2, narrow): «Між VLAN» and «Знайди несправність»
// draw one compact drawing at every size, so every PC with its gateway,
// every switch and the router keep 12 px text in a 1000 × 700 window
// (a frame about 514 units wide, 340–370 high) without zoom. The arrangement stays the
// same (routers and switches in a column, PCs left and right of their
// device), tighter: a PC's name and its third line (the goal) share the
// first line, then the address, the gateway (the fourth line), the status;
// links just long enough for their port labels; the switch column narrow,
// a router without PCs of its own as wide as its lines need.
/** A compact PC box's lines (baselines from the box's top) and paddings. */
export const COMPACT = { pad: 8, right: 2, gap: 6, name: 18, step: 17, nameGap: 6, switchW: 96, trunk: 32, margin: 6, minLink: 40, inlineTop: 38, routerMin: 48, routerMax: 470, tagW: 90 };
/** A sans name's width at TEXT.name, bold (an estimate on the safe side). */
const nameWidth = name => name.length * TEXT.name * 0.72;
/** Monospace width per character at 12 for the compact sums: Courier New and
 * Liberation Mono are 0.6 em; a little over, without MONO's wider margin. */
const MONO_TIGHT = 0.605 * TEXT.label;

/**
 * The compact PC box width for these PCs and the screen's third and fourth
 * lines ({ [host]: { text } }): the longest line, with its paddings.
 */
export function compactPcWidth(topology, third = {}, fourth = {}) {
  const widest = Math.max(0, ...topology.hosts.map(h => Math.max(
    nameWidth(h.device) + (third[h.device]?.text ? COMPACT.nameGap + third[h.device].text.length * MONO_TIGHT : 0),
    `${h.ip}/${h.prefix}`.length * MONO_TIGHT,
    (fourth[h.device]?.text ?? '').length * MONO_TIGHT,
  )));
  return Math.ceil(widest + COMPACT.pad + COMPACT.right);
}

/** A compact PC box's height: name (with its third line), address, the fourth line if any, the status. */
export const compactPcHeight = withFourth => COMPACT.name + COMPACT.step * (withFourth ? 3 : 2) + 9;

/** Compact: each indented continuation line (an address, «на bridge1») joined to the line before it with « · ». */
export function joinLines(list = []) {
  const out = [];
  for (const line of list) {
    const prev = out.at(-1);
    if (prev && /^\s/.test(line.text) && (line.kind === 'address' || line.kind === 'on-port')) {
      out[out.length - 1] = { ...prev, text: `${prev.text} · ${line.text.trim()}`, ids: [...new Set([...(prev.ids ?? []), ...(line.ids ?? [])])],
        ...(prev.facts || line.facts ? { facts: [...(prev.facts ?? []), ...(line.facts ?? [])] } : {}) };
    } else out.push(line);
  }
  return out;
}

/** Where a port label, a tag label or a mark sits: x, y and text anchor. */
const at = (x, y, anchor = 'start') => ({ x, y, anchor });

/**
 * @param {import('../../../engine/l2.js').L2Topology} topology
 * @param {'cisco'|'routeros'} syntax port labels
 * @param {{ lines?: Object<string, Array<{text: string}>>, hostLines?: number, pcWidth?: number, link?: number }} [options]
 *   `lines`: interface lines per router or switch (VLAN-2); `hostLines`: 4, or
 *   5 with the gateway line; `pcWidth`, `link`: ROUTE_LAYOUT's for «Між VLAN»
 * @returns {{ view: {x:number,y:number,w:number,h:number}, switches: object[], hosts: object[], links: object[], hostLines: number }}
 *   `switches`: the column's boxes (routers first, then switches), each with its kind and lines
 */
export function layout(topology, syntax, { lines: given = {}, hostLines = 4, pcWidth = PC.w, link: LINK = LINK_LEN, compact = false } = {}) {
  const device = id => topology.devices.find(d => d.id === id);
  const portLabel = (id, port) => device(id)?.ports.find(p => p.id === port)?.label[syntax] ?? port;
  const kindOf = id => device(id)?.kind;
  const inColumn = kind => kind === 'switch' || kind === 'router';
  const columnIds = [...topology.devices.filter(d => d.kind === 'router'), ...topology.devices.filter(d => d.kind === 'switch')].map(d => d.id);
  const hostOrder = topology.hosts.map(h => h.device);
  const margin = compact ? COMPACT.margin : MARGIN, gap = compact ? COMPACT.gap : GAP, trunkLen = compact ? COMPACT.trunk : TRUNK;
  const pcH = compact ? compactPcHeight(hostLines >= 5) : PC.h + Math.max(0, hostLines - 4) * HOST_LINE;
  const ownPCs = id => topology.links.some(l => (l.a.device === id && kindOf(l.b.device) === 'host') || (l.b.device === id && kindOf(l.a.device) === 'host'));
  // Compact (repair v1): in a router without PCs (wide), a line that only continues its interface (its
  // address, «на bridge1») joins it, so the router keeps few rows; the joined line keeps both lines' ids and facts.
  const lines = compact ? Object.fromEntries(Object.entries(given).map(([id, list]) => [id, ownPCs(id) ? list : joinLines(list)])) : given;
  // The column is as wide as its longest interface line needs (VLAN-1: SW_W).
  // Compact: only the devices with PCs share the column's width; a router
  // without PCs takes its own width, centred on the column.
  const lineWidth = (ids, max = COL_MAX) => {
    const longest = Math.max(0, ...ids.flatMap(id => (lines[id] ?? []).map(l => l.text.length)));
    const base = compact ? COMPACT.switchW : SW_W;
    return longest ? Math.max(base, Math.min(max, Math.ceil(longest * MONO + 2 * LINES.pad + LINES.mark))) : base;
  };
  // Compact (repair v1, Astra 3): a device with PCs keeps the narrow column; its lines (an SVI and its
  // gateway, a router's VLAN interfaces) go on a tray under its PC rows, as wide as the drawing.
  const trayIds = compact ? columnIds.filter(id => ownPCs(id) && (lines[id] ?? []).length) : [];
  const colW = compact ? COMPACT.switchW : lineWidth(columnIds);
  // Compact: a PC's link is just long enough for its switch-side port label.
  const hostPortLabels = topology.links.flatMap(l => [l.a, l.b].filter(end => inColumn(kindOf(end.device)) && kindOf((end === l.a ? l.b : l.a).device) === 'host').map(end => portLabel(end.device, end.port)));
  const linkLen = compact ? Math.max(COMPACT.minLink, Math.ceil(Math.max(0, ...hostPortLabels.map(t => t.length)) * MONO_TIGHT + 8)) : LINK;
  const swX = margin + pcWidth + linkLen;
  const rightX = swX + colW + linkLen;
  const switches = [], hosts = [], links = [];
  const swBox = {};
  let y = margin;
  for (const id of columnIds) {
    // This device's PCs, in the topology's host order, with the link to each.
    const own = topology.links.flatMap((link, index) => {
      const [sw, host] = link.a.device === id && kindOf(link.b.device) === 'host' ? [link.a, link.b]
        : link.b.device === id && kindOf(link.a.device) === 'host' ? [link.b, link.a] : [null, null];
      return sw ? [{ host: host.device, port: sw.port, index }] : [];
    }).sort((a, b) => hostOrder.indexOf(a.host) - hostOrder.indexOf(b.host));
    const left = own.slice(0, Math.ceil(own.length / 2)), right = own.slice(left.length);
    const rows = Math.max(left.length, right.length, 1);
    // With interface lines, a row under the name stays free for the selected
    // device's tag («налаштовуєш»), so choosing a device never moves a line.
    // Compact: a router without PCs is wide enough for its tag beside its name,
    // and (repair v1) its physical interface's line («gi0/2 · shutdown») sits at
    // the right of that row; a router without PCs may span most of the drawing.
    const inlineTag = compact && !own.length;
    const all = trayIds.includes(id) ? [] : lines[id] ?? [];
    const headLine = inlineTag && ['on', 'off'].includes(all[0]?.kind) ? all[0] : null;
    const body = headLine ? all.slice(1) : all;
    const nameRow = headLine ? Math.ceil(id.length * TEXT.switch * 0.72 + 8 + COMPACT.tagW + 16 + (headLine.text.length + 2) * MONO + 2 * LINES.pad) : 0;
    const boxW = inlineTag ? Math.min(COMPACT.routerMax, Math.max(nameRow, lineWidth([id], COMPACT.routerMax) * (body.length ? 1 : 0), COMPACT.switchW)) : colW;
    const boxX = swX + (colW - boxW) / 2;
    const fits = Math.floor((boxW - 2 * LINES.pad - LINES.mark) / MONO);
    const shown = body.map(l => ({ ...l, shown: l.text.length > fits ? `${l.text.slice(0, Math.max(1, fits - 1))}…` : l.text }));
    const linesTop = inlineTag ? COMPACT.inlineTop : LINES.top + LINES.step;
    const textH = shown.length ? linesTop + (shown.length - 1) * LINES.step + LINES.pad : 0;
    // A router with no PCs of its own is only as tall as its lines need.
    const h = Math.max(own.length || kindOf(id) !== 'router' ? rows * (pcH + gap) - gap : compact ? COMPACT.routerMin : ROUTER_MIN, textH);
    const box = { id, kind: kindOf(id), x: boxX, y, w: boxW, h, cx: boxX + boxW / 2, lines: shown, linesTop, ...(inlineTag ? { inlineTag } : {}),
      ...(headLine ? { head: { ...headLine, shown: headLine.text } } : {}) };
    if (trayIds.includes(id)) {
      const trayLines = joinLines(lines[id]);
      const trayW = 2 * pcWidth + 2 * linkLen + colW;
      const trayFits = Math.floor((trayW - 2 * LINES.pad - LINES.mark) / MONO);
      box.tray = { x: margin, y: y + h + COMPACT.gap, w: trayW, h: LINES.top - 18 + (trayLines.length - 1) * LINES.step + LINES.pad,
        lines: trayLines.map(l => ({ ...l, shown: l.text.length > trayFits ? `${l.text.slice(0, Math.max(1, trayFits - 1))}…` : l.text })) };
      box.bottom = box.tray.y + box.tray.h;
    }
    swBox[id] = box;
    switches.push(box);
    for (const [side, list] of [['left', left], ['right', right]]) {
      list.forEach((entry, row) => {
        const hy = y + row * (pcH + gap), cy = hy + pcH / 2;
        const hb = { id: entry.host, x: side === 'left' ? margin : rightX, y: hy, w: pcWidth, h: pcH, side };
        hosts.push(hb);
        const swEdge = side === 'left' ? swX : swX + colW, pcEdge = side === 'left' ? margin + pcWidth : rightX;
        const out = side === 'left' ? -1 : 1;
        links.push({
          index: entry.index, kind: 'host',
          line: { x1: pcEdge, y1: cy, x2: swEdge, y2: cy },
          ends: {
            // Compact: the label a little higher, so a drop's ✕ on the link never covers it.
            [`${id}|${entry.port}`]: { label: portLabel(id, entry.port), text: at(swEdge + out * 5, compact ? cy - 9 : cy - 6, side === 'left' ? 'end' : 'start'), port: { x: swEdge, y: cy }, mark: { x: swEdge + out * 10, y: cy } },
            [`${entry.host}|nic`]: { label: null, text: null, port: null, mark: { x: pcEdge - out * 10, y: cy } },
          },
          // Compact (repair v1, Astra 5): a PC's link is shorter than a plate, and a plate may never cross a box,
          // so it carries none; the link drawn bold and the PC's status words («✓ отримав», «✕ з тегом») say it.
          tag: compact ? null : at(pcEdge - out * 5, cy + 17, side === 'left' ? 'start' : 'end'),
          tag2: compact ? null : at(pcEdge - out * 5, cy + 35, side === 'left' ? 'start' : 'end'),
        });
      });
    }
    y = (box.bottom ?? y + h) + trunkLen;
  }
  // Trunks: a vertical line from one box's bottom to the next one's top.
  topology.links.forEach((link, index) => {
    if (!inColumn(kindOf(link.a.device)) || !inColumn(kindOf(link.b.device))) return;
    const [upper, lower] = swBox[link.a.device].y <= swBox[link.b.device].y ? [link.a, link.b] : [link.b, link.a];
    const u = swBox[upper.device], l = swBox[lower.device], x = u.cx;
    const top = u.bottom ?? u.y + u.h, bottom = l.y, mid = (top + bottom) / 2;
    links.push({
      index, kind: 'trunk',
      line: { x1: x, y1: top, x2: x, y2: bottom },
      ends: {
        // Compact: the two ends' labels on either side of the short trunk, so they never meet.
        [`${upper.device}|${upper.port}`]: { label: portLabel(upper.device, upper.port), text: compact ? at(x + 11, top + 14) : at(x + 12, top + 16), port: { x, y: top }, mark: { x, y: top + 10 } },
        [`${lower.device}|${lower.port}`]: { label: portLabel(lower.device, lower.port), text: compact ? at(x - 11, bottom - 4, 'end') : at(x + 12, bottom - 7), port: { x, y: bottom }, mark: { x, y: bottom - 10 } },
      },
      // Compact: a plate on the side away from each port label (the upper label right, the lower left).
      tag: compact ? at(x - 10, top + 13, 'end') : at(x - 10, mid + 4, 'end'),
      tag2: compact ? at(x + 10, bottom - 4, 'start') : at(x + 10, mid + 4, 'start'),
    });
  });
  links.sort((a, b) => a.index - b.index);
  const h = y - trunkLen + margin;
  // The view spans the widest box too (a compact router without PCs may be wider than the column).
  const right = Math.max(rightX + pcWidth + margin, ...switches.map(b => b.x + b.w + margin));
  const left = Math.min(0, ...switches.map(b => b.x - margin));
  return { view: { x: left, y: 0, w: right - left, h }, switches, hosts, links, hostLines, compact };
}

/** The link a port is on, with its end there: { link, end } or null. */
export function endOf(geo, device, port) {
  for (const link of geo.links) {
    const end = link.ends[`${device}|${port}`];
    if (end) return { link, end };
  }
  return null;
}

/**
 * What a walk (engine/l2.js flood) puts on the diagram: the links the frame
 * crossed, each with its wire form (tagged and its VLAN, or untagged), the
 * drops, the PCs that took it (untagged) and its source. Nothing here is
 * computed: it only reads the walk. `leaked`: PCs a failed isolation check
 * names (portsState failureOf), shown as such rather than as received.
 * @returns {{ source: string, carried: Object<number, {tagged: boolean, vid: number|null}>,
 *   drops: Array<{device: string, port: string, code: string}>, received: string[], tagged: string[], leaked: string[] }}
 */
export function walkScene(geo, walk, { leaked = [] } = {}) {
  const carried = {}, drops = [];
  for (const hop of walk.hops) {
    for (const out of hop.out) {
      const found = endOf(geo, hop.device, out.port);
      if (found) carried[found.link.index] = { tagged: out.tagged, vid: out.tagged ? out.vid : null };
    }
    for (const drop of hop.dropped) drops.push({ device: hop.device, port: drop.port, code: drop.code });
  }
  const received = [...walk.received].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const tagged = walk.hops.filter(h => h.inPort === 'nic' && h.dropped.some(d => d.code === 'host-got-tagged')).map(h => h.device);
  return { source: walk.from, carried, drops, received, tagged, leaked: leaked.filter(Boolean) };
}

/** A host's status after a walk: the source, leaked to (it must not get
 * the frame), received, a tagged frame dropped at its NIC, or not reached. */
export function hostStatus(scene, host) {
  if (!scene) return null;
  if (scene.source === host) return 'source';
  if (scene.leaked?.includes(host)) return 'leaked';
  if (scene.received.includes(host)) return 'received';
  if (scene.tagged.includes(host)) return 'tagged';
  return 'missed';
}

/** Broadcast domains (groups of host ids) numbered from 1 in host order, for colours and labels. */
export function domainGroups(topology, groups) {
  const order = topology.hosts.map(h => h.device);
  const sorted = groups.map(g => [...g].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return sorted.map((hosts, i) => ({ n: i + 1, hosts, colour: i % 8 }));
}

/** host id → its domain group, for the PC boxes. */
export const domainOf = (groups, host) => groups?.find(g => g.hosts.includes(host)) ?? null;

// ── An IP trace (VLAN-2 «Між VLAN») ──────────────────────────────────────

/** The tree path between two devices: [{ index, from: LinkEnd, to: LinkEnd }]
 * in order (`index` the topology link's), [] for the same device, null when
 * they aren't joined. */
export function treePath(topology, from, to) {
  if (from === to) return [];
  const queue = [{ device: from, path: [] }], seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const { device, path } = queue[i];
    for (const [index, link] of topology.links.entries()) {
      const [own, other] = link.a.device === device ? [link.a, link.b] : link.b.device === device ? [link.b, link.a] : [null, null];
      if (!own || seen.has(other.device)) continue;
      const next = [...path, { index, from: own, to: other }];
      if (other.device === to) return next;
      seen.add(other.device);
      queue.push({ device: other.device, path: next });
    }
  }
  return null;
}

/** An L3 attachment's internal points (a Cisco SVI, a MikroTik bridge VLAN interface): no link end to draw. */
export const INTERNAL = ['svi', 'bridge'];

/** Where a hop dropped the frame, for a path through `port`: its ingress,
 * the path's out port, or an internal interface (SVI, bridge). */
function stopOf(hop, port) {
  if (!hop) return null;
  const d = (hop.inPort !== null && hop.dropped.find(x => x.port === hop.inPort))
    || hop.dropped.find(x => x.port === port)
    || hop.dropped.find(x => INTERNAL.includes(x.port))
    || (hop.inPort === null ? hop.dropped[0] : null);
  return d ? { device: hop.device, port: d.port, code: d.code, vid: hop.vid, inPort: hop.inPort } : null;
}

/**
 * One L2 walk (engine/l2.js flood) read along the tree path from `from` to
 * `to` (devices): the links it crossed on that path, and where it stopped.
 * Nothing is computed: the walk's own hops say what crossed and what
 * dropped; other branches of the flood are left out. `target`: the next
 * hop's id (a PC or an L3 attachment) the walk had to reach.
 * @returns {{ crossed: Array<{step: object, hop: object, out: object}>, end: object|null, reached: boolean, stop: object|null }}
 */
export function followPath(topology, walk, from, to, target = null) {
  const path = from && to ? treePath(topology, from, to) ?? [] : [];
  const hopAt = (device, inPort) => walk.hops.find(h => h.device === device && h.inPort === inPort);
  const crossed = [];
  let inPort = null;
  for (const step of path) {
    const hop = hopAt(step.from.device, inPort);
    const out = hop?.out.find(o => o.port === step.from.port);
    if (!out) return { crossed, end: hop ?? null, reached: false, stop: stopOf(hop, step.from.port) };
    crossed.push({ step, hop, out });
    inPort = step.to.port;
  }
  const end = to ? hopAt(to, path.length ? inPort : null) ?? null : null;
  const reached = target !== null && walk.received.has(target);
  return { crossed, end, reached, stop: reached ? null : stopOf(end, inPort) };
}

/** Whether a segment's way back is worth showing: the frame got there but
 * not back, or it got there unseen (no drop on the path) and the next hop's
 * own frame doesn't come back either (it may be the one that can't send). */
export function backward(seg, forward) {
  if (!seg.to || !seg.walks[1] || seg.walks[1].received.has(seg.from)) return false;
  return forward.reached || !forward.stop;
}

/** The direction a frame crosses a link, as the drawing places the two boxes. */
export function arrowOf(geo, from, to) {
  const box = id => geo.switches.find(b => b.id === id) ?? geo.hosts.find(b => b.id === id);
  const a = box(from), b = box(to);
  if (!a || !b) return '';
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  return Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? '↑' : '↓') : (dx < 0 ? '←' : '→');
}

/**
 * What one IP trace (route.js ping3's request or reply) puts on the diagram.
 * Per segment, the forward walk along the tree path from its sender to its
 * next hop (and, if that one got there but the answer didn't come back, the
 * backward walk too): the links crossed with their wire form and direction,
 * and the one drop on that path. Router hops mark their in and out
 * interfaces; a decision that fails without a drop (no route) marks the
 * device. Only a segment's own target can be «received»: other PCs the
 * broadcast also reached are never shown as having got the packet.
 * @param {object} geo layout()
 * @param {object} topology the task's
 * @param {object} trace a ping3 request or reply
 * @param {object[]} attachments the check's evidence.attachments
 * @returns {{ source: string|null, carried: Object<number, Array<{tagged: boolean, vid: number|null, arrow: string}>>,
 *   drops: object[], received: string[], tagged: string[], leaked: string[], ifaces: Object<string, string>, deviceDrops: Object<string, string> }}
 */
export function traceScene(geo, topology, trace, attachments = [], timeline = null) {
  const isHost = id => topology.hosts.some(h => h.device === id);
  const deviceOf = id => (isHost(id) ? id : attachments.find(a => a.id === id)?.device ?? null);
  const router = topology.devices.find(d => d.kind === 'router')?.id ?? null;
  const carried = {}, drops = [], received = [], tagged = [], ifaces = {}, deviceDrops = {};
  const RANK = { source: 1, hop: 2, received: 3, dropped: 4 };
  // The motion (walkSteps.js), when asked: each move a step; a mark shows
  // from the end of the step that made it (`at`); a stop with no move, and a
  // router's hop, take a pause step of their own (Y3, Y8).
  const tl = timeline;
  let t = 0, segment = 0, frame = 1;
  const at = () => t - 1;
  const show = (list, key, value = at()) => { if (tl) (tl.reveal[list][key] ??= []).push(value); };
  const mark = (id, status) => {
    if (!id || isHost(id)) return;
    if ((RANK[status] ?? 0) > (RANK[ifaces[id]] ?? 0)) ifaces[id] = status;
    show('ifaces', id, { at: at(), status });
  };
  /** A drop: at a port, a ✕ on its link end; at an internal interface, its line. */
  const dropAt = (stop, own) => {
    if (INTERNAL.includes(stop.port)) {
      const a = (own && attachments.find(x => x.id === own && x.device === stop.device))
        ?? attachments.find(x => x.device === stop.device && x.port === stop.port && (stop.vid === null || x.vid === stop.vid));
      if (a) mark(a.id, 'dropped'); else { deviceDrops[stop.device] = stop.code; show('deviceDrops', stop.device); }
    } else { drops.push({ device: stop.device, port: stop.port, code: stop.code }); show('drops', drops.length - 1); }
  };
  const follow = (walk, fromId, toId, back = false) => {
    const from = deviceOf(fromId), to = toId ? deviceOf(toId) : (from !== router ? router : null);
    const f = followPath(topology, walk, from, to, toId);
    for (const { step, hop, out } of f.crossed) {
      // A trunk can carry the request up in one VLAN and down in another: its plates say which way.
      const trunk = geo.links.find(l => l.index === step.index)?.kind === 'trunk';
      (carried[step.index] ??= []).push({ tagged: out.tagged, vid: out.tagged ? out.vid : null, arrow: trunk ? arrowOf(geo, step.from.device, step.to.device) : '' });
      if (tl) {
        tl.moves.push({ step: t, link: step.index, from: `${step.from.device}|${step.from.port}`, to: `${step.to.device}|${step.to.port}`, tagged: out.tagged, vid: out.tagged ? out.vid : null, arrow: carried[step.index].at(-1).arrow, slot: carried[step.index].length - 1, token: `${segment}${back ? 'b' : ''}`, frame, back });
        // Inside a bridge that classified the frame (Y1): «VLAN N» while it leaves.
        if (hop.inPort !== null && hop.transparent === false && hop.vid != null) tl.chips.push({ step: t, device: hop.device, port: hop.inPort, vid: hop.vid });
        show('carried', step.index, t);
      }
      t += 1;
    }
    if (tl && !f.crossed.length) t += 1; // nothing crossed: a pause, so its stop shows in its turn
    if (f.reached) { if (isHost(toId)) { received.push(toId); show('hosts', toId); } else mark(toId, 'received'); return f; }
    if (f.stop) {
      if (f.stop.code === 'host-got-tagged') { tagged.push(f.stop.device); show('hosts', f.stop.device); }
      else dropAt(f.stop, f.stop.device === from && f.stop.inPort === null ? fromId : toId);
      if (f.stop.device === from && f.stop.inPort === null) mark(fromId, 'dropped');
    }
    return f;
  };
  if (!isHost(trace.from)) mark(trace.from, 'source');
  for (const step of trace.steps) {
    if (step.kind === 'router') {
      const h = trace.hops[step.index];
      // Y3: the incoming frame ends at its interface; the same IP packet leaves in a new Ethernet frame.
      if (tl) { tl.captions.push({ step: t, router: h.router }); t += 1; }
      mark(h.in, 'hop');
      mark(h.out, 'hop');
      frame += 1;
      continue;
    }
    const seg = trace.segments[step.index];
    const forward = follow(seg.walks[0], seg.from, seg.to);
    if (backward(seg, forward)) {
      const back = follow(seg.walks[1], seg.to, seg.from, true);
      if (!forward.reached && !back.stop) { deviceDrops[deviceOf(seg.to)] = seg.code; show('deviceDrops', deviceOf(seg.to)); }
    } else if (!forward.reached && !forward.stop && forward.end) { deviceDrops[forward.end.device] = seg.code; show('deviceDrops', forward.end.device); }
    segment += 1;
  }
  // A decision that failed without a frame stopping (no route, a down
  // interface of the router's own): at the last next hop, or the sender.
  if (!trace.ok && trace.segments.every(s => s.ok)) {
    const last = trace.segments.at(-1);
    const where = last ? deviceOf(last.to) : deviceOf(trace.from);
    const own = attachments.find(a => a.id === trace.to && a.device === where);
    if (own) mark(own.id, 'dropped');
    else if (!isHost(trace.from) && where === deviceOf(trace.from) && !last) mark(trace.from, 'dropped');
    else if (where) { deviceDrops[where] = trace.code; show('deviceDrops', where); }
  }
  if (tl) tl.total = t;
  const source = isHost(trace.from) ? trace.from : null;
  return { source, carried, drops, received: received.filter(h => h !== source), tagged, leaked: [], ifaces, deviceDrops };
}

/** An interface line's status in a scene: the strongest of its attachments'. */
export function lineStatus(scene, line) {
  const order = ['dropped', 'leaked', 'received', 'hop', 'source'];
  const found = (line.ids ?? []).map(id => scene?.ifaces?.[id]).filter(Boolean);
  return order.find(s => found.includes(s)) ?? null;
}
