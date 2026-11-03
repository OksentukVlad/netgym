// The PC / R1 / Інтернет drawing's fixed layout (viewBox units), shared by
// the firewall (with its doors, lanes and walk: sections/firewall/screens/
// diagram.js) and «DHCP і NAT» (its `dhcp` view: no doors, a shorter R1).
// Pure: tested in Node.
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
//   - the router's own addresses: a three-line block inside R1, «адреси
//     цього роутера», then WAN's line and LAN's (WAN first, as the ports),
//     12-unit bold monospace like the hosts' addresses; at the bottom of R1
//     in the firewall's view, under R1's name in the DHCP view;
//   - each port: «ether1 · WAN» / «bridge · LAN» under the link, outside R1,
//     right-aligned to R1's left edge or left-aligned to its right edge;
//   - the firewall's doors: two-line pills inside R1 («input» / «до самого
//     роутера», «forward» / «крізь роутер»), 14 units;
//   - R1's name top left inside its box; the firewall's core mark top centre
//     with «сам роутер» to its right;
//   - the firewall's ingress chip («ether1 ∈ WAN») under the ingress port's
//     label; a dst-NAT card's rule: three lines under the bridge label.
// Text is 12 units or more; the door labels 14.
export const VIEW = { x: 0, y: 0, w: 452, h: 252 };
export const TEXT = { min: 12, label: 12, name: 13, door: 14, router: 18 };

export const R1 = { x: 124, y: 8, w: 184, h: 238 };
export const MID = R1.x + R1.w / 2;
export const LINK_Y = 118;
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
export const BUS_X = 330;
export const HOSTS = {
  pc: { x: 342, y: LINK_Y - 86, w: 104, h: 44 },
  'web-server': { x: 342, y: LINK_Y - 22, w: 104, h: 44 },
};
export const BUS = { x: BUS_X, y1: HOSTS.pc.y + HOSTS.pc.h / 2, y2: LINK_Y };

/** Where a door's side meets the lane from a port on that side. */
export const doorSide = (hook, side) => ({ x: side === 'left' ? DOORS[hook].x : DOORS[hook].x + DOORS[hook].w, y: DOORS[hook].y + DOORS[hook].h / 2 });

/** The neutral lanes inside R1: each port to each door, and input up to the core. Equal for both doors. */
export const LANES = [
  ...['ether1', 'bridge'].flatMap(port => ['input', 'forward'].map(hook => {
    const p = PORTS[port], d = doorSide(hook, p.side);
    return { key: `${port}-${hook}`, hook, x1: p.x, y1: p.y, x2: d.x, y2: d.y };
  })),
  { key: 'input-core', hook: 'input', x1: MID, y1: DOORS.input.y, x2: MID, y2: CORE.y + CORE.r },
];

/**
 * The views' own measures. `firewall`: the layout above. `dhcp` («DHCP і
 * NAT»): no doors, lanes or core, so R1 ends just under the link and its
 * address block sits under its name; the drawing ends under the port labels.
 */
export const VIEWS = {
  firewall: { VIEW, R1, ADDRESSES },
  dhcp: { VIEW: { ...VIEW, h: 166 }, R1: { ...R1, h: 132 }, ADDRESSES: { x: ADDRESSES.x, y: [52, 68, 84] } },
};

/** SVG points attribute for a polyline. */
export const pointsOf = points => points.map(p => `${p.x},${p.y}`).join(' ');
