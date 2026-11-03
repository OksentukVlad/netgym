// «DHCP і NAT»'s picture: the logic's topology (logic/scenario.js) as the
// shared PC / R1 / Інтернет drawing's input (ui/topology/RouterDiagram.jsx,
// its `dhcp` view), and the same facts as text («Текстом»). Pure.
//
// The drawing's port positions are named ether1 (left, WAN) and bridge
// (right, LAN) for both vendors; Cisco's labels say g0/0 and g0/1
// (`portNames`), and each label carries both names as facts, so E1's
// `port:ether1` / `port:bridge` highlight works whatever the vendor.
import { labels, screen } from '../uk.js';

/** The vendor's port names: { wan, lan } (Cisco g0/0, g0/1; MikroTik ether1, bridge). */
export const portsOf = (topology, vendor) => topology.ports[vendor === 'cisco' ? 'cisco' : 'mikrotik'];

/**
 * The drawing's topology for a DHCP topology. `server`: E3's LAN-server card
 * (spec v2.1: the server shows on that card only). `pcs` (E4): the PCs as
 * the last check left them, [{ id, name, address }]: the first in the PC's
 * place, a second (the exhausted pool's ПК2) in the server's.
 */
export function drawingTopology(t, vendor, { server = false, pcs = null } = {}) {
  const ports = portsOf(t, vendor);
  const lan = pcs
    ? pcs.slice(0, 2).map((pc, i) => ({ id: pc.id, role: i ? 'web-server' : 'pc', address: pc.address }))
    : [{ id: 'pc', role: 'pc', address: t.pc }, ...(server ? [{ id: 'server', role: 'web-server', address: t.server }] : [])];
  return {
    router: {
      interfaces: [{ id: ports.wan, address: t.wan, prefix: t.wanPrefix, showPrefix: true }, { id: ports.lan, address: t.router }],
      gateway: t.ispGateway,
      lists: { WAN: ['ether1'], LAN: ['bridge'] },
      portNames: { ether1: ports.wan, bridge: ports.lan },
    },
    hosts: [lan[0], { id: 'internet', role: 'internet', address: t.website }, ...lan.slice(1)],
  };
}

/** «Текстом»: what the drawing shows, in words (TextEquivalent sections). */
export function textSections(t, vendor, { server = false, pcs = null } = {}) {
  const ports = portsOf(t, vendor), w = screen.text;
  return [{
    heading: w.heading,
    items: [
      ...(pcs ? pcs.slice(0, 2).map(pc => screen.fault.textPc(pc.name, pc.address, ports.lan)) : [w.pc(t.pc, ports.lan)]),
      ...(server && !pcs ? [w.server(t.server, ports.lan)] : []),
      w.lan(ports.lan, t.router, t.prefix),
      w.wan(ports.wan, t.wan, t.wanPrefix),
      w.isp(t.ispGateway),
      w.website(t.website),
      labels.trainingPublic,
    ],
  }];
}
