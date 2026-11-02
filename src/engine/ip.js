/** Parse IPv4 entry, accepting commas as dots, trimming and reading decimal octets. */
export function parseIp(s) {
  if (typeof s !== 'string') return null
  const value = s.trim().replaceAll(',', '.')
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(value)) return null
  const octets = value.split('.').map(Number)
  return octets.every((n) => n >= 0 && n <= 255) ? octets.join('.') : null
}

/** Convert dotted IPv4 to an unsigned 32-bit number; commas are rejected. */
export function toInt(ip) {
  if (typeof ip !== 'string' || ip.includes(',')) return null
  const parsed = parseIp(ip)
  return parsed === null ? null : parsed.split('.').reduce((n, octet) => n * 256 + Number(octet), 0)
}

/** Convert an unsigned 32-bit integer to dotted IPv4. */
export function fromInt(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.')
}

function validPrefix(p) {
  return Number.isInteger(p) && p >= 0 && p <= 32
}

/** Read a numeric prefix, /prefix or contiguous dotted mask. */
export function parsePrefix(s) {
  if (typeof s === 'number') return validPrefix(s) ? s : null
  if (typeof s !== 'string') return null
  const value = s.trim()
  if (value.includes('.')) return maskToPrefix(value)
  if (!/^\/?\d+$/.test(value)) return null
  const p = Number(value.replace(/^\//, ''))
  return validPrefix(p) ? p : null
}

/** Convert a prefix to its dotted subnet mask. */
export function prefixToMask(p) {
  return validPrefix(p) ? fromInt(2 ** 32 - 2 ** (32 - p)) : null
}

/** Convert a contiguous dotted mask to its prefix. */
export function maskToPrefix(mask) {
  const n = toInt(mask)
  if (n === null) return null
  for (let p = 0; p <= 32; p++) {
    if (n === 2 ** 32 - 2 ** (32 - p)) return p
  }
  return null
}

/** Count all addresses in a prefix's block. */
export function blockSize(p) {
  return validPrefix(p) ? 2 ** (32 - p) : null
}

/** Count usable LAN hosts; /31 and /32 have no LAN capacity here. */
export function hostCount(p) {
  return validPrefix(p) ? Math.max(0, blockSize(p) - 2) : null
}

/** Return the network address containing ip. */
export function network(ip, p) {
  const n = toInt(ip)
  const size = blockSize(p)
  return n === null || size === null ? null : fromInt(Math.floor(n / size) * size)
}

/** Return the broadcast address of ip's block. */
export function broadcast(ip, p) {
  const net = toInt(network(ip, p))
  return net === null ? null : fromInt(net + blockSize(p) - 1)
}

/** Return the first usable LAN address, or null for /31 and /32. */
export function firstHost(ip, p) {
  const net = toInt(network(ip, p))
  return net === null || p > 30 ? null : fromInt(net + 1)
}

/** Return the last usable LAN address, or null for /31 and /32. */
export function lastHost(ip, p) {
  const end = toInt(broadcast(ip, p))
  return end === null || p > 30 ? null : fromInt(end - 1)
}

/** Test membership in the same prefix block. Invalid input returns null. */
export function sameNetwork(a, b, p) {
  const left = network(a, p)
  const right = network(b, p)
  return left === null || right === null ? null : left === right
}

/** Classify an address relative to a network block. */
export function role(ip, net, p) {
  const address = parseIp(ip)
  const start = network(net, p)
  if (address === null || start === null) return null
  if (!sameNetwork(address, start, p)) return 'outside'
  if (address === start) return 'network'
  if (address === broadcast(start, p)) return 'broadcast'
  return 'host'
}

/** Test whether ip is aligned to its prefix. */
export function isNetworkAddress(ip, p) {
  const start = network(ip, p)
  return start === null ? null : parseIp(ip) === start
}

/** Find the longest prefix that holds a positive integer number of LAN hosts. */
export function smallestPrefixFor(hosts) {
  if (!Number.isInteger(hosts) || hosts < 1) return null
  for (let p = 30; p >= 0; p--) {
    if (hostCount(p) >= hosts) return p
  }
  return null
}

/**
 * Test whether a prefix block contains an address. Invalid input returns null.
 * @param {string} net An address in the containing block (need not be aligned).
 * @param {number} p Prefix length, 0–32.
 * @param {string} ip Address to test.
 * @returns {boolean|null}
 */
export function contains(net, p, ip) {
  return sameNetwork(net, ip, p)
}

/**
 * Test whether two prefix blocks intersect. Invalid input returns null.
 * @param {string} a An address in the first block.
 * @param {number} aPrefix First prefix length, 0–32.
 * @param {string} b An address in the second block.
 * @param {number} bPrefix Second prefix length, 0–32.
 * @returns {boolean|null}
 */
export function overlaps(a, aPrefix, b, bPrefix) {
  if (!validPrefix(aPrefix) || !validPrefix(bPrefix)) return null
  return sameNetwork(a, b, Math.min(aPrefix, bPrefix))
}

/**
 * Format one octet as eight binary digits. Invalid input returns null.
 * @param {number} n Integer octet, 0–255.
 * @returns {string|null}
 */
export function bits8(n) {
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n.toString(2).padStart(8, '0') : null
}
