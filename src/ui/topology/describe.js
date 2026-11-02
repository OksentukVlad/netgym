// A network's givens in words: the text equivalent of a topology diagram
// (ARCHITECTURE §6 TextEquivalent, round 2 step 7). Built from the network
// model, never from routes, so it says what the diagram shows and nothing
// more:
//   - the routers and the providers;
//   - each link between routers, with both ends' interface names and addresses;
//   - each LAN or server segment, with its address and prefix and the router
//     interface on it;
//   - each WAN: a DHCP address, or a provider's network (as the diagram shows
//     the provider's link network, its own address isn't given either).
// Pure: no React. Interface names in the labels of `labelKey` ('cisco' or
// 'routeros').
import { network as networkOf } from '../../engine/ip.js';
import { uk } from '../uk.js';

const T = uk.network;

/** An interface as a diagram end: `R1 g0/1 10.0.0.1/30`, or DHCP. */
const end = (device, iface, labelKey) => `${device} ${iface.labels[labelKey]} ${iface.address ? `${iface.address.ip}/${iface.address.prefix}` : T.dhcp}`;

/**
 * @param {import('../../engine/network.js').Network} net
 * @param {string} labelKey the interface label set (a syntax id)
 * @returns {{ heading: string, items: string[] }[]} sections in reading order
 */
export function describeNetwork(net, labelKey) {
  const routers = net.devices.filter(d => d.kind === 'router');
  const isps = net.devices.filter(d => d.kind === 'isp');
  const on = segment => routers.flatMap(d => d.interfaces.filter(i => i.segmentId === segment.id).map(iface => ({ device: d.id, iface })));
  const addressOf = members => {
    const a = members.find(m => m.iface.address)?.iface.address;
    return a ? `${networkOf(a.ip, a.prefix)}/${a.prefix}` : null;
  };
  const links = [], lans = [], wans = [];
  for (const segment of net.segments) {
    const members = on(segment);
    const ends = members.map(m => end(m.device, m.iface, labelKey));
    const address = addressOf(members);
    if (segment.kind === 'link') links.push(`${ends.join(' — ')} (${T.network} ${address})`);
    else if (segment.kind === 'wan') {
      const isp = isps.find(d => d.interfaces.some(i => i.segmentId === segment.id));
      wans.push(`${segment.name}${address ? ` ${address}` : ''}: ${ends.join(', ')}${isp ? `; ${T.provider} ${isp.id}` : ''}`);
    } else lans.push(`${segment.name} ${address}: ${ends.join(', ')}`);
  }
  return [
    { heading: T.routers, items: [routers.map(d => d.id).join(', ')] },
    isps.length && { heading: T.isps, items: [isps.map(d => d.id).join(', ')] },
    links.length && { heading: T.links, items: links },
    lans.length && { heading: T.lans, items: lans },
    wans.length && { heading: T.wans, items: wans },
  ].filter(Boolean);
}

/** The same description as plain lines (tests, the leak gate). */
export const describeLines = (net, labelKey) => describeNetwork(net, labelKey).flatMap(s => [s.heading, ...s.items]);
