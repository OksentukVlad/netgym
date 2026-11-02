import * as ipv4 from '../../../engine/ip.js';
import { addressExampleAllowed, unicastExample } from '../../../engine/vendors/address.js';

export const defaultAddress = { ip: '192.168.1.10', prefix: 24 };
export const choosePrefixes = Array.from({ length: 23 }, (_, i) => i + 8);

/** Local calculator semantics: RFC 3021 pairs and single-host blocks are not
 * LAN capacity. Engine hostCount/firstHost/lastHost retain their old meaning.
 * Invalid input returns null, like the engine's parsing/arithmetic helpers.
 */
export function usable(ip, prefix) {
  const address = ipv4.parseIp(ip), p = ipv4.parsePrefix(prefix);
  if (address === null || p === null) return null;
  const first = ipv4.network(address, p), last = ipv4.broadcast(address, p);
  if (p === 32) return { first, last, count: 1, kind: 'host' };
  if (p === 31) return { first, last, count: 2, kind: 'p2p' };
  return { first: ipv4.firstHost(address, p), last: ipv4.lastHost(address, p), count: ipv4.hostCount(p), kind: 'lan' };
}

/** Complete, presentation-neutral calculator model. `broadcast` is absent as a
 * networking concept above /30 (blockLast still describes the arithmetic).
 * `gateway` selects the example convention; it never claims a real gateway.
 */
export function describe(ip, prefix, { gateway = 'first' } = {}) {
  const address = ipv4.parseIp(ip), p = ipv4.parsePrefix(prefix);
  if (address === null || p === null || !['first', 'last'].includes(gateway)) return null;
  const range = usable(address, p);
  const network = ipv4.network(address, p), blockLast = ipv4.broadcast(address, p);
  const gatewayAddress = range.kind === 'lan' ? range[gateway] : null;
  // /31: the example configures the address the student entered (either end
  // of the pair; Claude's decision after review, overriding S3's lower end).
  const local = p === 31 || p === 32 ? address : gatewayAddress;
  const commandAddress = { ip: local, prefix: p };
  const allowed = unicastExample(address) && addressExampleAllowed(commandAddress);
  return {
    ip: address, prefix: p, cidr: `${address}/${p}`, mask: ipv4.prefixToMask(p), maskCidr: `/${p}`,
    network, block: `${network}/${p}`, blockLast, broadcast: p <= 30 ? blockLast : null,
    firstHost: ipv4.firstHost(address, p), lastHost: ipv4.lastHost(address, p), hostCount: ipv4.hostCount(p),
    usable: range, gateway: gatewayAddress, gateways: range.kind === 'lan' ? { first: range.first, last: range.last } : null,
    // /0's count is deliberately hidden in the UI; other free-typed prefixes
    // use conventional subnet arithmetic, not a claim about deployable space.
    displayCount: p === 0 ? null : range.count,
    countCode: p <= 30 ? 'calc.conventional-count' : null,
    noteCode: p === 0 ? 'calc.default-route' : p === 31 ? 'calc.p2p' : p === 32 ? 'calc.host' : null,
    commandAddress: allowed ? commandAddress : null,
    commandVendors: allowed ? (p === 32 ? ['cisco'] : ['cisco', 'routeros']) : [],
    commandNoteCode: !allowed ? 'calc.no-commands' : p === 31 ? 'calc.p2p-local' : 'calc.example-interface',
    commandNoteParams: allowed && p === 31 ? { other: address === range.first ? range.last : range.first } : {},
    knowledge: p === 31 ? { kind: 'general-networking', reference: 'RFC 3021' } : null,
  };
}

export default { describe, usable, choosePrefixes, defaultAddress };
