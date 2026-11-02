// The firewall diagram's fixed layout and what it shows at a walk frame
// (FW-1 screen spec §3, v2 S4). Pure: tested in Node.
//
// Layout (viewBox units; round 5 made it compact, so the whole drawing
// keeps 12 px text in the 1000 × 700 window's left column, about 510 px):
//
//    (Інтернет)                       ┌ ПК ──────────┐
//   203.0.113.50   ┌ R1 ─ сам роутер ┐┌┤192.168.88.10│
//         │        │    [input]      ││└──────────────┘
//   [шлюз ISP]─────■                 ■┴[Сервер        ]
//    100.64.0.1    │    [forward]    │  192.168.88.20
//   ether1 · WAN   │ адреси цього    │ bridge · LAN
//                  │ роутера: ether1 │
//                  │ · …, bridge · … │
//                  └─────────────────┘
//
// Label placement, per element:
//   - the cloud and the host boxes: name, then address, centred inside;
//     the cloud sits above the ISP gateway, the PC above the server, so the
//     links stay straight and the port labels have room beneath them;
//   - the ISP gateway: «шлюз ISP», then its address, inside its box;
//   - the router's own addresses (round 5, spec G): a three-line block at
//     the bottom of R1, «адреси цього роутера», then «ether1 · 100.64.0.2»
//     and «bridge · 192.168.88.1» (WAN first, as the ports), 12-unit bold
//     monospace like the hosts' addresses;
//   - each port: «ether1 · WAN» / «bridge · LAN» under the link, outside R1,
//     right-aligned to R1's left edge or left-aligned to its right edge;
//   - the doors: two-line pills inside R1 («input» / «до самого роутера»,
//     «forward» / «крізь роутер»), 14 units, the same size and style;
//   - R1's name top left inside its box; the core mark top centre with
//     «сам роутер» to its right;
//   - the ingress chip («ether1 ∈ WAN») under the ingress port's label;
//   - a dst-NAT card's rule: three lines under the bridge label.
// Text is 12 units or more; the door labels 14.
//
// Before commitment the scene depends only on the givens the spec allows:
// the source, the ingress port (with its list chip) and a dst-NAT card's
// label. It never reads the destination, the door or a verdict, so two
// cards with the same source, ingress and dst-NAT draw the same picture.
export const VIEW = { x: 0, y: 0, w: 452, h: 252 };
export const TEXT = { min: 12, label: 12, name: 13, door: 14, router: 18 };

export const R1 = { x: 124, y: 8, w: 184, h: 238 };
const MID = R1.x + R1.w / 2;
const LINK_Y = 118;
export const PORTS = {
  ether1: { x: R1.x, y: LINK_Y, side: 'left' },
  bridge: { x: R1.x + R1.w, y: LINK_Y, side: 'right' },
};
export const DOORS = {
  input: { x: MID - 75, y: 56, w: 150, h: 38 },
  forward: { x: MID - 75, y: 142, w: 150, h: 38 },
};
export const CORE = { x: MID, y: 32, r: 12 };
/** The router's own addresses (spec G): baselines of the heading and the two lines, inside R1. */
export const ADDRESSES = { x: R1.x + 12, y: [204, 220, 236] };
export const CLOUD = { cx: 58, cy: 50, rx: 52, ry: 36 };
export const ISP = { x: 16, y: LINK_Y - 22, w: 84, h: 44 };
/** Port labels and the ingress chip under the link; the dst-NAT lines under the bridge's. */
export const UNDER = { label: LINK_Y + 38, chip: LINK_Y + 46, nat: [204, 220, 236] };
const BUS_X = 330;
export const HOSTS = {
  pc: { x: 342, y: LINK_Y - 86, w: 104, h: 44 },
  'web-server': { x: 342, y: LINK_Y - 22, w: 104, h: 44 },
};
export const BUS = { x: BUS_X, y1: HOSTS.pc.y + HOSTS.pc.h / 2, y2: LINK_Y };

const centre = box => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
/** Where inside its door the envelope waits: beside the short first line
 * («input», «forward»), above the second, so it covers neither. */
const WAIT_INSET = 16;
const WAIT_TOP = 11;
const doorCentre = hook => centre(DOORS[hook]);
const doorSide = (hook, side) => ({ x: side === 'left' ? DOORS[hook].x : DOORS[hook].x + DOORS[hook].w, y: DOORS[hook].y + DOORS[hook].h / 2 });

/** The neutral lanes inside R1: each port to each door, and input up to the core. Equal for both doors. */
export const LANES = [
  ...['ether1', 'bridge'].flatMap(port => ['input', 'forward'].map(hook => {
    const p = PORTS[port], d = doorSide(hook, p.side);
    return { key: `${port}-${hook}`, hook, x1: p.x, y1: p.y, x2: d.x, y2: d.y };
  })),
  { key: 'input-core', hook: 'input', x1: MID, y1: DOORS.input.y, x2: MID, y2: CORE.y + CORE.r },
];

/** Where a host, the internet or the router's core sits on the drawing. */
function placeOf(topology, address) {
  if (topology.router.interfaces.some(i => i.address === address)) return 'core';
  const host = topology.hosts.find(h => h.address === address);
  return host && HOSTS[host.role] ? host.role : 'internet';
}

/** Where the envelope sits at a host or the internet: clear of its name and
 * address (top left inside a box; above the words inside the cloud). */
export const DOCKS = {
  internet: { x: CLOUD.cx, y: CLOUD.cy - 24 },
  ...Object.fromEntries(Object.entries(HOSTS).map(([role, box]) => [role, { x: box.x + 14, y: box.y + 11 }])),
};

/** From a place to a port (the path a packet takes outside R1), as points. */
function outside(place, port) {
  const p = PORTS[port];
  // Down from the cloud through the ISP gateway, then along the link.
  if (place === 'internet') return [DOCKS.internet, { x: CLOUD.cx, y: CLOUD.cy }, { x: CLOUD.cx, y: LINK_Y }, { x: p.x, y: p.y }];
  const box = HOSTS[place], c = centre(box);
  return [DOCKS[place], c, { x: box.x, y: c.y }, { x: BUS_X, y: c.y }, { x: BUS_X, y: LINK_Y }, { x: p.x, y: p.y }];
}
const reverse = points => [...points].reverse();

/** The ingress interface's lists, as the chip says: «ether1 ∈ WAN». */
export const listsOf = (topology, iface) => Object.keys(topology.router.lists).filter(name => topology.router.lists[name].includes(iface));

/**
 * What the diagram shows. Before commitment (`walk` null): the source, the
 * ingress port and chip, the dst-NAT label; doors neutral. After it, at a
 * walk frame (walkView.walkFrame): the envelope and the path so far, the
 * chosen door and the other dimmed, the waiting mark, then the exit or ✕.
 * @param {{ topology: object, card: object, walk?: object|null, frame?: object|null, context?: object|null }} args
 *   `context`: classify(topology, card) of a committed card (its egress).
 */
export function sceneOf({ topology, card, walk = null, frame = null, context = null }) {
  const source = placeOf(topology, card.packet.srcIp);
  const ingress = card.facts.ingress;
  const nat = card.facts.dstNat === true && card.facts.dstNatFrom
    ? { address: card.facts.dstNatFrom.address, port: card.facts.dstNatFrom.port, to: card.packet.dstIp, toPort: card.packet.dstPort }
    : null;
  const base = { source, ingress, ingressLists: listsOf(topology, ingress), nat, doors: { input: 'neutral', forward: 'neutral' }, path: [], envelope: null, stop: null, arrived: null };
  if (!walk || !frame) return base;

  const toIngress = outside(source, ingress);
  // The envelope waits just inside the door it entered, clear of the door's words.
  const entry = doorSide(walk.hook, PORTS[ingress].side);
  const door = { x: entry.x + (PORTS[ingress].side === 'left' ? 1 : -1) * WAIT_INSET, y: DOORS[walk.hook].y + WAIT_TOP };
  const toDoor = [{ x: PORTS[ingress].x, y: PORTS[ingress].y }, entry, door];
  let onward = null, arrived = null;
  if (walk.verdict === 'accept') {
    if (walk.hook === 'input') {
      onward = [door, doorCentre('input'), { x: MID, y: DOORS.input.y }, { x: CORE.x, y: CORE.y }];
      arrived = 'core';
    } else {
      const egress = context?.egress ?? (ingress === 'ether1' ? 'bridge' : 'ether1');
      const destination = placeOf(topology, card.packet.dstIp);
      onward = [door, doorSide('forward', PORTS[egress].side), ...reverse(outside(destination === 'core' ? 'internet' : destination, egress))];
      arrived = destination;
    }
  }
  const at = points => points.at(-1);
  const scene = { ...base, doors: frame.frame >= 2 ? { input: walk.hook === 'input' ? 'chosen' : 'dim', forward: walk.hook === 'forward' ? 'chosen' : 'dim' } : base.doors };
  if (frame.phase === 'source') return { ...scene, envelope: { ...toIngress[0], waiting: false } };
  if (frame.phase === 'ingress') return { ...scene, path: [toIngress], envelope: { ...at(toIngress), waiting: false } };
  if (frame.phase === 'door') return { ...scene, path: [toIngress, toDoor], envelope: { ...door, waiting: frame.waiting } };
  if (onward) return { ...scene, path: [toIngress, toDoor, onward], envelope: { ...at(onward), waiting: false }, arrived };
  const d = DOORS[walk.hook];
  return { ...scene, path: [toIngress, toDoor], envelope: { ...door, waiting: false }, stop: { x: d.x + d.w - 4, y: d.y + 4 } };
}

/** The diagram with no packet on it (FW-2 «Упорядкуй правила» before a
 * check names one): the network only, doors neutral; `nat` adds the
 * network's dst-NAT label (walkView.natRuleOf). */
export function neutralScene(nat = null) {
  return { source: null, ingress: null, ingressLists: [], nat, doors: { input: 'neutral', forward: 'neutral' }, path: [], envelope: null, stop: null, arrived: null };
}

/** SVG points attribute for a polyline. */
export const pointsOf = points => points.map(p => `${p.x},${p.y}`).join(' ');
