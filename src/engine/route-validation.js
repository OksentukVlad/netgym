import { contains, isNetworkAddress, role } from './ip.js';

/** Validate topology-dependent route form, without reference answers. Call the
 * syntax adapter's validateFields first. Returns one code, or null.
 * @param {import('./network.js').Network} net
 * @param {string} routerId
 * @param {import('./network.js').Route} route
 * @returns {string|null}
 */
export function validateRoute(net, routerId, route) {
  if (route && (!Number.isInteger(route.distance ?? 1) || (route.distance ?? 1) < 1 || (route.distance ?? 1) > 254)) return 'invalid-distance';
  if (!route || !isNetworkAddress(route.dst, route.prefix)) return 'dst-not-network';
  if (route.discard !== undefined && typeof route.discard !== 'boolean') return 'invalid-discard';
  if (route.discard === true) return 'via' in route ? 'discard-with-gateway' : null;
  const own = net.devices.find(d => d.id === routerId)?.interfaces ?? [];
  if (own.some(f => f.address?.ip === route.via)) return 'gateway-is-self';
  const connected = own.filter(f => f.address && contains(f.address.ip, f.address.prefix, route.via));
  const dhcp = own.filter(f => f.dhcp && (net.supplied?.[routerId] ?? []).some(r => r.via === route.via));
  if (!connected.length && !dhcp.length) return 'gateway-off-link';
  if (connected.some(f => role(route.via, f.address.ip, f.address.prefix) !== 'host')) return 'gateway-not-host';
  if (!net.devices.some(d => d.id !== routerId && d.interfaces.some(f => [...connected, ...dhcp].some(c => c.segmentId === f.segmentId) && f.address?.ip === route.via))) return 'gateway-not-router';
  return null;
}
