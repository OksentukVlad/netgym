// What the routing diagram labels (round 4 spec R1), on top of the logic's
// topology adapter (logic/topology.js), so the learner never mistakes a
// port's address for its network:
//   - a LAN's box shows its network (192.168.2.0 over /24), and the port
//     label by the router its interface over the port's own address
//     («g0/1» / «.1»);
//   - a provider's cloud shows its gateway (the ISP's own address on the
//     link: the next hop for a route to the internet; `ispGateway` on the
//     endpoint), when the network has one; a DHCP uplink stays «DHCP»;
//   - a link between routers names both ends' whole addresses
//     («10.0.0.1 ↔ 10.0.0.2», geometry.js `full`).
// Pure: no React.
import { network as networkOf } from '../../../engine/ip.js';
import { topology } from '../logic/topology.js';
import { ui } from '../uk.js';

const lastOctet = ip => String(ip).split('/')[0].split('.').pop();

/** The ISP's address on each WAN segment: { [segmentId]: ip }. */
function gateways(net) {
  const out = {};
  for (const device of net.devices.filter(d => d.kind !== 'router')) {
    for (const iface of device.interfaces ?? []) if (iface.address) out[iface.segmentId] = iface.address.ip;
  }
  return out;
}

/**
 * @param {object} net     the task instance's network
 * @param {'cisco'|'routeros'} syntax
 * @returns {{ routers: object, links: object[], endpoints: object[] }} topology() with labels
 */
export function diagramTopology(net, syntax = 'cisco') {
  const topo = topology(net, syntax);
  const gw = gateways(net);
  // Each endpoint's segment, by its router and interface label (as topology() builds them).
  const segmentOf = {};
  for (const device of net.devices.filter(d => d.kind === 'router')) {
    for (const iface of device.interfaces) segmentOf[`${device.id}|${iface.labels[syntax]}`] = iface.segmentId;
  }
  const endpoints = topo.endpoints.map(ep => {
    const [ip, prefix] = String(ep.ip).split('/');
    if (ep.type === 'internet') {
      const gateway = gw[segmentOf[`${ep.router}|${ep.name}`]];
      return gateway && prefix ? { ...ep, shown: ui.shared.ispGateway(gateway), ispGateway: gateway } : ep;
    }
    if (!prefix) return ep;
    return { ...ep, shown: networkOf(ip, Number(prefix)), portLines: [ep.name, `.${lastOctet(ip)}`] };
  });
  return { ...topo, endpoints, links: topo.links.map(l => ({ ...l, full: true })) };
}
