import { blockSize, contains, fromInt, network, toInt } from './ip.js';
import { lookup, routingTable } from './forward.js';

const interval = (dst, prefix) => [toInt(network(dst, prefix)), toInt(network(dst, prefix)) + blockSize(prefix)];

/** Unknown IPv4 intervals, excluding every numbered segment in the task.
 * Half-open integer intervals avoid enumerating hosts (including /0).
 * @returns {number[][]}
 */
export function unknownSpace(net) {
  let pieces = [[0, 2 ** 32]];
  for (const prefix of net.devices.flatMap(d => d.interfaces).filter(f => f.address).map(f => ({ dst: f.address.ip, prefix: f.address.prefix }))) {
    const [lo, hi] = interval(prefix.dst, prefix.prefix);
    pieces = pieces.flatMap(([a, b]) => hi <= a || lo >= b ? [[a, b]] : [[a, Math.max(a, lo)], [Math.min(b, hi), b]].filter(([x, y]) => x < y));
  }
  return pieces;
}

/** Subtract prefixes from half-open address intervals. Exemptions affect only
 * the caller's objective; unknownSpace and A1 retain the original space. */
export function excludePrefixes(pieces, prefixes = []) {
  return prefixes.reduce((remaining, prefix) => {
    const [lo, hi] = interval(prefix.dst, prefix.prefix);
    return remaining.flatMap(([a, b]) => hi <= a || lo >= b ? [[a, b]]
      : [[a, Math.max(a, lo)], [Math.min(b, hi), b]].filter(([x, y]) => x < y));
  }, pieces);
}

/** Follow every piece, splitting again at each hop's route boundaries. Connected
 * delivery succeeds on the owning segment, even when no sample host exists.
 * For internet coverage any ISP is the boundary; only student routers are checked.
 * Loop pieces include a closed `cycle` of device IDs and `cycleCause`
 * ('defaults', 'summary', 'other'); summaries also name `summaryRouter` and
 * `summaryNext` by ID. ECMP pieces retain the supplied-route diagnostic flag.
 * @returns {{deviceId:string,size:number,code:string}[]} Failed pieces, in traversal order.
 */
export function coverSpace(net, routes, start, pieces, { segmentId = null, internet = false, downLinks = [] } = {}) {
  const options = { downLinks }, missing = [];
  function walk(deviceId, a, b, path) {
    const device = net.devices.find(d => d.id === deviceId);
    if (internet && device?.kind === 'isp') return;
    const fail = (code, lo = a, hi = b) => missing.push({ deviceId, size: hi - lo, code });
    if (!device) return fail('no-device');
    const bounds = new Set([a, b]);
    for (const row of routingTable(net, routes, deviceId, options)) {
      const [lo, hi] = interval(row.dst, row.prefix);
      if (lo > a && lo < b) bounds.add(lo);
      if (hi > a && hi < b) bounds.add(hi);
    }
    const sorted = [...bounds].sort((x, y) => x - y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const lo = sorted[i], hi = sorted[i + 1];
      const row = lookup(net, routes, deviceId, fromInt(lo), options);
      if (!row || row.code) {
        missing.push({ deviceId, size: hi - lo, code: row?.code ?? 'no-route',
          ...(row?.code === 'unsupported-ecmp' ? { supplied: row.supplied === true } : {}) });
        continue;
      }
      if (row.discard === true) {
        fail('discarded', lo, hi);
        continue;
      }
      if (row.type === 'connected') {
        if (row.segmentId !== segmentId || internet) fail('no-device', lo, hi);
        continue;
      }
      const peer = net.devices.find(d => d.id !== deviceId && d.interfaces.some(f => f.segmentId === row.segmentId && f.address?.ip === row.via));
      const visited = [...path, { deviceId, row }];
      if (!peer) fail('no-device', lo, hi);
      else if (visited.some(hop => hop.deviceId === peer.id)) {
        const edges = visited.slice(visited.findIndex(hop => hop.deviceId === peer.id));
        // Closed, ordered topology IDs; no route addresses escape the walk.
        const cycle = [...edges.map(hop => hop.deviceId), peer.id];
        const summary = edges.find(hop => hop.row.prefix > 0 && net.devices.some(d => d.interfaces.some(f =>
          f.address && hop.row.prefix < f.address.prefix && contains(hop.row.dst, hop.row.prefix, f.address.ip))));
        missing.push({ deviceId, nextDeviceId: peer.id, cycle,
          cycleCause: edges.every(hop => hop.row.prefix === 0) ? 'defaults' : summary ? 'summary' : 'other',
          ...(summary ? { summaryRouter: summary.deviceId, summaryNext: cycle[edges.indexOf(summary) + 1] } : {}),
          size: hi - lo, code: 'loop' });
      }
      else walk(peer.id, lo, hi, visited);
    }
  }
  for (const [a, b] of pieces) walk(start, a, b, []);
  return missing;
}

/** Collective destination coverage for one leg, starting at its first student hop. */
export function coverPrefix(net, routes, start, prefix, options = {}) {
  const owner = net.devices.flatMap(d => d.interfaces).find(f => f.address && network(f.address.ip, f.address.prefix) === prefix.dst && f.address.prefix === prefix.prefix);
  return coverSpace(net, routes, start, [interval(prefix.dst, prefix.prefix)], { ...options, segmentId: owner?.segmentId });
}
