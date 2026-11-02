import { addressExampleAllowed, interfaceExampleAllowed } from './address.js';
import { prefixToMask } from '../ip.js';
import { parseFields } from './fields.js';

/** @param {import('../network.js').Interface} iface */
export const interfaceLabel = iface => iface.labels.cisco;
/** Render a vendor-neutral route; reference distances come from data. */
export function renderRoute(route) {
  return `ip route ${route.dst} ${prefixToMask(route.prefix)} ${route.discard === true ? 'Null0' : route.via}${route.distance ? ` ${route.distance}` : ''}`;
}
export const parseRouteFields = fields => parseFields(fields, 'cisco');

/** Render an interface-address example, or null when it must be omitted.
 * /32 is restricted to Loopback0; /31's calculator supplies the lower end.
 */
export function renderAddress(address, label = address?.prefix === 32 ? 'Loopback0' : address?.prefix === 31 ? 'GigabitEthernet0/1' : 'GigabitEthernet0/0') {
  if (!addressExampleAllowed(address) || !interfaceExampleAllowed(label)) return null;
  if (address.prefix === 32 && label !== 'Loopback0') return null;
  return `interface ${label}\n ip address ${address.ip} ${prefixToMask(address.prefix)}${address.prefix === 32 ? '' : '\n no shutdown'}`;
}
