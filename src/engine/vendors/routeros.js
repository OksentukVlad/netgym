import { addressExampleAllowed, interfaceExampleAllowed } from './address.js';
import { parseFields } from './fields.js';

/** @param {import('../network.js').Interface} iface */
export const interfaceLabel = iface => iface.labels.routeros;
/** Render a vendor-neutral route byte for byte as in the legacy app. */
export function renderRoute(route) {
  return `/ip route add dst-address=${route.dst}/${route.prefix} ${route.discard === true ? 'blackhole' : `gateway=${route.via}`}${route.distance ? ` distance=${route.distance}` : ''}`;
}
export const parseRouteFields = fields => parseFields(fields, 'routeros');

/** RouterOS /32 is omitted until an exact supported lo version is evidenced. */
export function renderAddress(address, label = address?.prefix === 31 ? 'ether1' : 'bridge') {
  if (!addressExampleAllowed(address) || address.prefix === 32 || !interfaceExampleAllowed(label)) return null;
  return `/ip address add address=${address.ip}/${address.prefix} interface=${label}`;
}
