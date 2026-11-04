import { contains, isNetworkAddress, network, parseIp, role, toInt } from './ip.js';

const deviceById = (net, id) => net.devices.find(d => d.id === id);
const interfaces = net => net.devices.flatMap(device => device.interfaces.map(iface => ({ device, iface })));
const linkUp = (iface, options) => iface && !(options.downLinks ?? []).includes(iface.segmentId);
const distance = row => row.type === 'connected' ? 0 : (row.distance ?? 1);

/** All usable candidates, including backups, in prefix/preference order.
 * downLinks contains segment IDs; taking a segment down removes both ends.
 * A supplied DHCP gateway is resolved to the ISP on that WAN, without inventing
 * a fixed address for the student's DHCP interface.
 * @param {import('./network.js').Network} net
 * @param {import('./network.js').Routes} routes
 */
export function routingTable(net, routes, deviceId, options = {}) {
  const device = deviceById(net, deviceId);
  if (!device) return [];
  const up = device.interfaces.filter(f => linkUp(f, options));
  const addressed = up.filter(f => f.address);
  const rows = addressed.map(f => ({ id: `connected:${f.id}`, dst: network(f.address.ip, f.address.prefix), prefix: f.address.prefix, type: 'connected', egressId: f.id, segmentId: f.segmentId }));
  for (const [source, candidates] of [['supplied', net.supplied?.[deviceId]], ['answer', routes?.[deviceId]]]) {
    for (const [index, route] of (Array.isArray(candidates) ? candidates : []).entries()) {
      if (!route || !isNetworkAddress(route.dst, route.prefix) || parseIp(route.dst) !== route.dst || (route.discard === true ? 'via' in route : parseIp(route.via) !== route.via) || (route.discard !== undefined && typeof route.discard !== 'boolean')) continue;
      if (!Number.isInteger(route.distance ?? 1) || (route.distance ?? 1) < 1 || (route.distance ?? 1) > 254) continue;
      if (route.discard === true) {
        rows.push({ ...route, id: route.id ?? `${deviceId}:${source}:${index}`, type: 'static', source, egressId: null, segmentId: null });
        continue;
      }
      if (device.interfaces.some(f => f.address?.ip === route.via)) continue;
      const egress = addressed.find(f => role(route.via, f.address.ip, f.address.prefix) === 'host')
        ?? (source === 'supplied' || (net.supplied?.[deviceId] ?? []).some(r => r.via === route.via) ? up.find(f => f.dhcp && interfaces(net).some(p => p.device.kind === 'isp' && p.iface.segmentId === f.segmentId && p.iface.address?.ip === route.via)) : null);
      if (!egress) continue;
      rows.push({ ...route, id: route.id ?? `${deviceId}:${source}:${index}`, type: 'static', source, egressId: egress.id, segmentId: egress.segmentId });
    }
  }
  return rows.sort((a, b) => b.prefix - a.prefix || toInt(a.dst) - toInt(b.dst) || distance(a) - distance(b) || String(a.id).localeCompare(String(b.id)));
}

/** Longest prefix, then connected, then lowest distance. Ambiguous next hops
 * are returned as a diagnostic row so callers cannot silently choose an ECMP leg.
 * A learner's default on the supplied DHCP default's own next hop is not one:
 * IOS prefers the static (DHCP is 254), RouterOS ties (both 1), and either way
 * the packet leaves by the same gateway. A different next hop stays diagnosed.
 */
export function lookup(net, routes, deviceId, dst, options = {}) {
  const rows = routingTable(net, routes, deviceId, options).filter(row => contains(row.dst, row.prefix, dst));
  const best = rows[0];
  if (!best) return null;
  const equal = rows.filter(r => r.prefix === best.prefix && distance(r) === distance(best));
  const supplied = equal.some(r => r.source === 'supplied');
  if (new Set(equal.map(r => r.discard === true ? 'discard' : `${r.egressId}/${r.via ?? ''}`)).size > 1) {
    return { ...best, code: 'unsupported-ecmp', routeIds: equal.map(r => r.id), supplied };
  }
  return best;
}

function location(net, value) {
  const endpoint = net.endpoints.find(e => e.id === value || e.ip === value);
  if (endpoint?.kind === 'internet') return { ip: endpoint.ip ?? '198.19.255.254', internet: endpoint };
  if (endpoint?.kind === 'host') {
    const gateway = interfaces(net).find(({ iface }) => iface.segmentId === endpoint.segmentId && iface.address?.ip === endpoint.gateway);
    return gateway ? { ip: endpoint.ip, deviceId: gateway.device.id, ingressId: gateway.iface.id, segmentId: endpoint.segmentId, host: true } : null;
  }
  const own = interfaces(net).find(({ iface }) => iface.id === value || iface.address?.ip === value);
  return own?.iface.address ? { ip: own.iface.address.ip, deviceId: own.device.id, ingressId: null, segmentId: own.iface.segmentId } : null;
}

/** Resolve a modeled endpoint/interface or a literal address for lookup.
 * Internet endpoints without an IP use this benchmark-only destination.
 */
export function addressOf(net, value) {
  return location(net, value)?.ip ?? (parseIp(value) === value ? value : null);
}

/** Trace an endpoint/interface ping leg. ISP replies use the request's arrival
 * edge as their boundary injection, then every student hop uses ordinary lookup.
 * There is no simulated ISP routing policy or NAT.
 * @param {{hopLimit?:number, downLinks?:string[], boundary?:object}} options
 */
export function trace(net, routes, from, to, options = {}) {
  const { hopLimit = 64, boundary } = options;
  const source = location(net, from), target = location(net, to);
  const dst = addressOf(net, to);
  const hops = [], visited = new Set();
  let current = source?.internet ? boundary?.deviceId : source?.deviceId, ingressId = source?.ingressId ?? null;
  const stopped = code => ({ ok: false, hops, stop: { deviceId: current ?? null, code } });
  if (!source || !dst || !current) return stopped('no-device');
  if (source.host && !linkUp(interfaces(net).find(p => p.iface.id === source.ingressId)?.iface, options)) return stopped('no-route');
  // Only attached addresses are reachable on the segment with no gateway walk.
  if (!source.internet && target && source.segmentId === target.segmentId && source.ip !== target.ip) {
    const iface = deviceById(net, source.deviceId)?.interfaces.find(f => f.segmentId === source.segmentId);
    if (linkUp(iface, options)) return { ok: true, hops, stop: null };
  }
  const limit = Number.isInteger(hopLimit) && hopLimit > 0 ? hopLimit : 0;
  for (let count = 0; count < limit; count++) {
    const device = deviceById(net, current);
    if (!device) return stopped('no-device');
    visited.add(current);
    if (target?.internet && device.kind === 'isp' && target.internet.viaPeers.includes(current)) {
      hops.push({ deviceId: current, ingressId, egressId: null, routeId: null, nextHop: null });
      return { ok: true, hops, stop: null };
    }
    if (source.internet && count === 0) {
      const egress = device.interfaces.find(f => f.id === boundary.egressId);
      const peer = interfaces(net).find(p => p.device.id === boundary.nextDeviceId && p.iface.id === boundary.nextIngressId && p.iface.segmentId === egress?.segmentId);
      if (!source.internet.viaPeers.includes(current) || !linkUp(egress, options) || !peer) return stopped('no-route');
      hops.push({ deviceId: current, ingressId: null, egressId: egress.id, routeId: null, nextHop: peer.iface.address?.ip ?? null });
      current = peer.device.id;
      ingressId = peer.iface.id;
      continue;
    }
    if (device.interfaces.some(f => linkUp(f, options) && f.address?.ip === dst)) {
      hops.push({ deviceId: current, ingressId, egressId: null, routeId: null, nextHop: null });
      return { ok: true, hops, stop: null };
    }
    const row = lookup(net, routes, current, dst, options);
    if (!row) return stopped('no-route');
    if (row.code) return { ok: false, hops, stop: { code: row.code, deviceId: current, routeIds: row.routeIds, ...(row.supplied ? { supplied: true } : {}) } };
    if (row.discard === true) {
      hops.push({ deviceId: current, ingressId, egressId: null, routeId: row.id, nextHop: null });
      return { ok: false, hops, stop: { code: 'discarded', deviceId: current, routeId: row.id } };
    }
    const nextHop = row.type === 'static' ? row.via : dst;
    hops.push({ deviceId: current, ingressId, egressId: row.egressId, routeId: row.id, nextHop });
    if (row.type === 'connected' && net.endpoints.some(e => e.kind === 'host' && e.ip === dst && e.segmentId === row.segmentId)) return { ok: true, hops, stop: null };
    const peer = interfaces(net).find(({ device: d, iface }) => d.id !== current && iface.segmentId === row.segmentId && iface.address?.ip === nextHop);
    if (!peer) return stopped('no-device');
    if (visited.has(peer.device.id)) return { ok: false, hops, stop: { deviceId: current, nextDeviceId: peer.device.id, code: 'loop' } };
    current = peer.device.id;
    ingressId = peer.iface.id;
  }
  return stopped('ttl-exceeded');
}

/** A ping succeeds only when its request and reply both arrive. The answering
 * ISP is the one reached by this request, including in a failover scenario.
 */
export function ping(net, routes, from, to, options = {}) {
  const request = trace(net, routes, from, to, options);
  if (!request.ok) return { ok: false, code: request.stop.code, request, reply: null };
  let boundary;
  if (location(net, to)?.internet) {
    const end = request.hops.at(-1), previous = request.hops.at(-2);
    if (end && previous) boundary = { deviceId: end.deviceId, egressId: end.ingressId, nextDeviceId: previous.deviceId, nextIngressId: previous.egressId };
  }
  const reply = trace(net, routes, to, from, { ...options, boundary });
  return { ok: reply.ok, code: reply.ok ? 'ok' : 'return-path-failed', request, reply };
}
