import { parseIp, parsePrefix, network, broadcast } from '../ip.js';

/** Address-only policy for educational interface command examples.
 * Keep arithmetic available for all IPv4 inputs, but never suggest deploying
 * unspecified/this-network, loopback, link-local, multicast or reserved space.
 * Documentation and private ranges are useful examples and remain allowed.
 */
export function unicastExample(ip) {
  if (typeof ip !== 'string' || parseIp(ip) !== ip) return false;
  const [a, b] = ip.split('.').map(Number);
  return a !== 0 && a !== 127 && a < 224 && !(a === 169 && b === 254);
}

/** Return false for invalid/noncanonical fields and LAN boundary addresses. */
export function addressExampleAllowed(address) {
  const { ip, prefix } = address ?? {};
  if (!unicastExample(ip) || parsePrefix(prefix) !== prefix || prefix < 8) return false;
  return prefix >= 31 || (ip !== network(ip, prefix) && ip !== broadcast(ip, prefix));
}

// Avoid inserting whitespace or command separators through the example label.
export const interfaceExampleAllowed = label => typeof label === 'string' && /^[A-Za-z][A-Za-z0-9/_.:-]*$/.test(label);
