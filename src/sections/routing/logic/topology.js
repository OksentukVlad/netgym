import { network } from '../../../engine/ip.js';

/** Adapt explicit bank segments to the frozen geometry input shape.
 * ISP devices remain data only; WAN interfaces draw the original clouds.
 * @param {import('../../../engine/network.js').Network} net
 * @param {'cisco'|'routeros'} syntax
 */
export function topology(net, syntax = 'cisco') {
  const routers = {}, links = [], endpoints = [];
  const members = new Map(net.segments.map(s => [s.id, []]));
  for (const device of net.devices.filter(d => d.kind === 'router')) {
    routers[device.id] = { interfaces: [] };
    for (const iface of device.interfaces) {
      const ip = iface.address ? `${iface.address.ip}/${iface.address.prefix}` : 'DHCP';
      const item = { name: iface.labels[syntax], ip, note: iface.note ?? net.segments.find(s => s.id === iface.segmentId).name };
      routers[device.id].interfaces.push(item);
      members.get(iface.segmentId).push({ ...item, router: device.id, network: iface.address ? `${network(iface.address.ip, iface.address.prefix)}/${iface.address.prefix}` : null });
    }
  }
  for (const segment of net.segments) {
    const items = members.get(segment.id);
    if (segment.kind === 'link') {
      for (let i = 0; i < items.length - 1; i++) links.push({ from: items[i].router, to: items[i + 1].router, network: items[i].network, a: items[i], b: items[i + 1] });
    } else endpoints.push(...items.map(item => ({ ...item, type: segment.kind === 'wan' ? 'internet' : segment.kind === 'server' ? 'server' : 'lan' })));
  }
  return { routers, links, endpoints };
}
