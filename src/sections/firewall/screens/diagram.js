// The firewall diagram's fixed layout and what it shows at a walk frame
// (FW-1 screen spec §3, v2 S4). Pure: tested in Node.
//
// The layout itself (the drawing shared with «DHCP і NAT») is
// ui/topology/router-layout.js; it is re-exported here for the firewall's
// screens and tests.
//
// Before commitment the scene depends only on the givens the spec allows:
// the source, the ingress port (with its list chip) and a dst-NAT card's
// label. It never reads the destination, the door or a verdict, so two
// cards with the same source, ingress and dst-NAT draw the same picture.
import { BUS_X, CLOUD, CORE, DOORS, HOSTS, LINK_Y, MID, PORTS, doorSide } from '../../../ui/topology/router-layout.js';

export { ADDRESSES, BUS, CLOUD, CORE, DOORS, HOSTS, ISP, LANES, PORTS, R1, TEXT, UNDER, VIEW, pointsOf } from '../../../ui/topology/router-layout.js';

const centre = box => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
/** Where inside its door the envelope waits: beside the short first line
 * («input», «forward»), above the second, so it covers neither. */
const WAIT_INSET = 16;
const WAIT_TOP = 11;
const doorCentre = hook => centre(DOORS[hook]);

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
