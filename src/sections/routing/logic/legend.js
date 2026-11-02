import { network } from '../../../engine/ip.js';

/** Examples from this instance's public network, including renumbered tasks.
 * Task 15 has only WAN links: its first ISP link supplies both real ends.
 * A missing kind returns null so a screen can omit that legend paragraph.
 */
export function legendFacts(task, syntax = 'cisco') {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError('invalid-syntax');
  const net = task.network;
  const members = segment => net.devices.flatMap(device => device.interfaces
    .filter(iface => iface.segmentId === segment.id && iface.address)
    .map(iface => ({ device, iface })));
  const lanSegment = net.segments.find(segment => segment.kind === 'lan');
  const lanEnd = lanSegment && members(lanSegment).find(end => end.device.kind === 'router');
  const linkSegment = net.segments.find(segment => segment.kind === 'link' && members(segment).length >= 2)
    ?? net.segments.find(segment => segment.kind === 'wan' && members(segment).length >= 2);
  const ends = linkSegment ? members(linkSegment) : [];
  const cidr = iface => `${network(iface.address.ip, iface.address.prefix)}/${iface.address.prefix}`;
  return {
    lan: lanEnd ? { network: cidr(lanEnd.iface), port: lanEnd.iface.labels[syntax], address: lanEnd.iface.address.ip } : null,
    link: ends.length ? { network: cidr(ends[0].iface), ends: ends.map(({ device, iface }) => ({ router: device.id, address: iface.address.ip })) } : null,
  };
}
