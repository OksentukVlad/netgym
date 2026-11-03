import { contains, fromInt, parseIp, sameNetwork, toInt } from '../../../engine/ip.js';
import { makeRng } from '../../../engine/rng.js';
import { ping as forwardPing, trace } from '../../../engine/forward.js';
import { acquire, effectiveNat, portsFor, routeTo, routingTable } from '../../dhcp/logic/client.js';
import { createFault, referenceRepair } from '../../dhcp/logic/faults.js';
import { translate, reverse } from '../../dhcp/logic/nat.js';

export const version = 1;
export const l1Faults = Object.freeze(['no-server', 'wrong-range', 'gateway', 'dns', 'exhausted', 'nat', 'route', 'link', 'static-mask', 'static-gateway']);
export const l2Faults = Object.freeze([...l1Faults, 'icmp-blocked', 'host-silent', 'return-path', 'ssh-denied', 'ssh-refused', 'ssh-timeout', 'host-key', 'http-error', 'nxdomain', 'wrong-answer', 'healthy']);
const dhcpFaults = l1Faults.slice(0, 7);
const copy = value => structuredClone(value);
/** The PC's source port, or its ICMP Echo identifier. */
const flowId = 51000;

/** One LAN/WAN uses E4's allocator, lookup and NAT without its gatewayOk
 * configuration comparator. Optional networkModel/routes adapt routing-bank
 * topologies (up to four observed hops); pc identifies their source endpoint.
 * All state is explicit and serializable; probes never mutate a scenario. */
export function createScenario(seed = 0, { level = 1, vendor = 'cisco', faultId, otherAddresses = false, example = false } = {}) {
  if (![1, 2].includes(level)) throw new RangeError('invalid-checks-level');
  const choices = level === 1 ? l1Faults : l2Faults;
  faultId ??= makeRng(`checks:${level}:${seed}`).pick(choices);
  if (!choices.includes(faultId)) throw new RangeError('invalid-checks-fault');
  const dhcp = createFault(2, vendor, seed, { otherAddresses, faultId: dhcpFaults.includes(faultId) ? faultId : 'dns' });
  if (example) {
    const old = dhcp.network;
    const map = value => typeof value === 'string' && parseIp(value) !== null
      ? contains(old, 24, value) ? fromInt(toInt('192.0.2.0') + toInt(value) - toInt(old))
        : contains('203.0.113.0', 24, value) ? fromInt(toInt('198.51.100.0') + toInt(value) - toInt('203.0.113.0')) : value
      : Array.isArray(value) ? value.map(map) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, map(v)])) : value;
    Object.assign(dhcp, map(dhcp));
    dhcp.remoteIp = '198.51.100.80';
  }
  // Rebuild after R4 mapping, so ACLs, option values and topology agree.
  if (!dhcpFaults.includes(faultId) || (example && faultId === 'dns')) dhcp.config = referenceRepair(dhcp);
  const t = dhcp.topology;
  const s = { id: 'checks-scenario', version, seed, level, vendor: dhcp.vendor, faultId, otherAddresses, example,
    dhcp, config: dhcp.config, topology: t, linkUp: faultId !== 'link', staticClient: null,
    remoteIp: dhcp.remoteIp, websiteName: 'www.example.com', missingName: 'missing.example.com',
    dnsRecords: { 'www.example.com': t.website }, reverseRecords: { [t.website]: 'www.example.com' },
    dnsMode: example && faultId === 'dns' ? 'timeout' : 'answer',
    hosts: {}, icmpFilters: [], ttlSilent: [], ttlSilentSlots: {}, ttlReturnBlocked: [],
    returnPath: true, returnDownLinks: [], downLinks: [], routedLan: false,
    services: { ssh: 'authenticated', http: 'ok' },
  };
  if (faultId === 'static-mask' || faultId === 'static-gateway') s.staticClient = {
    acquired: false, address: fromInt(toInt(t.network) + 50), prefix: faultId === 'static-mask' ? 28 : t.prefix,
    gateway: faultId === 'static-gateway' ? fromInt(toInt(t.network) + 254) : t.router,
    dns: [...t.providerDns], reason: 'static',
  };
  if (faultId === 'icmp-blocked') s.icmpFilters = ['R1'];
  if (faultId === 'host-silent') s.hosts[s.remoteIp] = { responds: false };
  if (faultId === 'return-path') s.returnPath = false;
  if (faultId.startsWith('ssh-')) s.services.ssh = faultId.slice(4);
  if (faultId === 'host-key') s.services.ssh = 'host-key';
  if (faultId === 'http-error') s.services.http = 'http-error';
  if (faultId === 'nxdomain') delete s.dnsRecords[s.websiteName];
  if (faultId === 'wrong-answer') s.dnsRecords[s.websiteName] = t.providerDns[1];
  return s;
}

export function clientState(s) {
  const lease = s.staticClient ?? acquire(s.config, s.dhcp);
  return { ...copy(lease), linkUp: s.linkUp, dhcpEnabled: !s.staticClient,
    dhcpServer: !s.staticClient && lease.acquired ? s.topology.router : null,
    interface: s.pc?.interface ?? 'Ethernet', leaseObtained: !s.staticClient && lease.acquired ? '2026-11-03' : null };
}

/** This adapter supplies the attached gateway to forward.js only after our
 * host-mask/on-link decision. It does NOT turn a missing/wrong PC gateway into
 * a working default route. Routing-bank consumers may supply networkModel,
 * routes and pc={address,prefix,gateway,interface,segmentId,id}. */
export function networkState(s) {
  const c = { ...clientState(s), ...s.pc }, t = s.topology, p = portsFor(s.dhcp);
  if (s.networkModel) {
    const net = copy(s.networkModel), pc = net.endpoints.find(e => e.id === (s.pc?.id ?? 'pc'));
    if (!pc) throw new RangeError('missing-checks-pc');
    Object.assign(pc, { ip: c.address });
    return { net, routes: copy(s.routes ?? {}), client: c, pcId: pc.id };
  }
  const iface = (id, segmentId, ip, prefix) => ({ id, segmentId, address: { ip, prefix }, labels: { cisco: id, routeros: id } });
  const net = {
    devices: [
      { id: 'R1', kind: 'router', interfaces: [iface(p.lan, 'lan', t.router, t.prefix), iface(p.wan, 'wan', t.wan, t.wanPrefix)] },
      { id: 'ISP', kind: 'isp', interfaces: [iface('isp-wan', 'wan', t.ispGateway, t.wanPrefix)] },
    ],
    segments: [{ id: 'lan', kind: 'lan', name: 'LAN' }, { id: 'wan', kind: 'wan', name: 'WAN' }], supplied: {},
    endpoints: [
      { id: 'pc', kind: 'host', ip: c.address, gateway: t.router, segmentId: 'lan' },
      { id: 'peer', kind: 'host', ip: t.server, gateway: t.router, segmentId: 'lan' },
      ...[...new Set([s.remoteIp, t.website, ...t.providerDns])].map((ip, i) => ({ id: `remote-${i}`, kind: 'internet', ip, viaPeers: ['ISP'] })),
    ],
  };
  const routes = { R1: routingTable(s.config, s.dhcp).filter(r => r.source !== 'connected')
    .map(r => ({ dst: r.network, prefix: r.prefix, via: r.gateway, distance: r.distance })) };
  return { net, routes, client: c, pcId: 'pc' };
}
const addressed = net => net.devices.flatMap(d => d.interfaces.map(f => ({ deviceId: d.id, ...f })));
const boundaryFor = request => {
  const end = request.hops.at(-1), previous = request.hops.at(-2);
  return end && previous ? { deviceId: end.deviceId, egressId: end.ingressId, nextDeviceId: previous.deviceId, nextIngressId: previous.egressId } : undefined;
};

/** Observable transaction contract:
 * source {address,interface}, destination, protocol, onLink, nextHop;
 * delivery {request,reply,ok}, natState (only entries THIS request creates);
 * outcome/ok describe the response, never a hidden fault ID.
 * returnRoutes/returnDownLinks can independently break response forwarding.
 * TTL errors are separate ICMP messages: filters and response routes apply
 * to them independently of echo forwarding. No ECMP, ARP cache or real sockets. */
export function probe(s, { source = 'pc', destination = s.remoteIp, service, protocol = ['ssh', 'http'].includes(service) ? 'tcp' : service === 'dns' ? 'udp' : 'icmp', ttl = 64, slot = 0 } = {}) {
  const { net, routes, client: c, pcId } = networkState(s), t = s.topology, p = portsFor(s.dhcp);
  const rows = addressed(net);
  const sourceAddress = source === 'router' ? t.wan : typeof source === 'object' ? source.address : c.address;
  const sourceInterface = source === 'router' ? p.wan : typeof source === 'object' ? source.interface : c.interface;
  const sourceRow = rows.find(f => f.address?.ip === sourceAddress);
  const routerSource = source === 'router' || (!!sourceRow && sourceAddress !== c.address);
  const sourceValid = routerSource ? !!sourceRow && [sourceRow.id, ...Object.values(sourceRow.labels ?? {})].includes(sourceInterface)
    : sourceAddress === c.address && sourceInterface === c.interface;
  const result = { source: { address: sourceAddress, interface: sourceInterface }, destination, protocol, service: service ?? null,
    onLink: routerSource ? sameNetwork(sourceAddress, destination, sourceRow?.address.prefix) : sameNetwork(sourceAddress, destination, c.prefix),
    nextHop: null, delivery: { request: null, reply: null, ok: false }, natState: [], ok: false, outcome: 'timeout', reporter: null };
  const finish = (outcome, extra = {}) => ({ ...result, outcome, ok: ['reply', 'answer', 'authenticated', 'ok'].includes(outcome), ...extra });
  if (!sourceValid || parseIp(sourceAddress) === null || parseIp(destination) === null || !['icmp', 'udp', 'tcp'].includes(protocol)
    || (['ssh', 'http'].includes(service) && protocol !== 'tcp') || (service === 'dns' && protocol !== 'udp')
    || !Number.isInteger(ttl) || ttl < 1) return finish('invalid');
  if (!routerSource && !s.linkUp) return finish('unreachable', { reporter: sourceAddress });
  const sourceEndpoint = net.endpoints.find(e => e.id === pcId);
  const known = net.endpoints.find(e => e.ip === destination) ?? rows.find(f => f.address?.ip === destination);
  if (!routerSource) {
    const local = result.onLink;
    result.nextHop = local ? destination : c.gateway;
    if (!local && (!c.gateway || !sameNetwork(c.address, c.gateway, c.prefix)
      || !rows.some(f => f.segmentId === sourceEndpoint.segmentId && f.address?.ip === c.gateway))) return finish('unreachable', { reporter: c.address });
    if (local && destination !== c.address && (!known || known.segmentId !== sourceEndpoint.segmentId)) return finish('unreachable', { reporter: c.address });
  }
  if (!known) return finish('timeout');
  const from = routerSource || typeof source === 'object' ? sourceAddress : pcId;
  const replyOptions = { downLinks: [...new Set([...s.downLinks, ...s.returnDownLinks])] };
  const options = { downLinks: s.downLinks }, request = trace(net, routes, from, destination, options);
  result.delivery.request = request;
  const pathIds = [...request.hops.map(h => h.deviceId), known.deviceId].filter(Boolean);
  const routers = request.hops.filter(h => h.egressId !== null);
  const external = known.kind === 'internet';
  // A TTL of one expires at the first forwarding router, not at an attached
  // destination. A silent hop does not remove that router from forwarding.
  if (protocol === 'icmp' && ttl <= routers.length) {
    const hop = routers[ttl - 1], hopAddress = rows.find(f => f.deviceId === hop.deviceId && f.id === hop.ingressId)?.address?.ip
      ?? rows.find(f => f.deviceId === hop.deviceId)?.address?.ip;
    const reply = trace(net, s.returnRoutes ?? routes, hopAddress, sourceAddress, replyOptions);
    result.delivery.reply = reply;
    const silent = s.ttlSilent.includes(hop.deviceId) || (s.ttlSilentSlots[hop.deviceId] ?? []).includes(slot)
      || s.ttlReturnBlocked.includes(hop.deviceId) || !reply.ok;
    return finish(silent ? 'timeout' : 'ttl-expired', { reporter: silent ? null : hopAddress, ttl, ttlReply: { source: hopAddress, filtered: silent, reply } });
  }
  if (!request.ok) return finish(request.stop.code === 'no-route' ? 'unreachable' : 'timeout', {
    reporter: (rows.find(f => f.deviceId === request.stop.deviceId && f.address?.ip === request.hops.at(-1)?.nextHop)
      ?? rows.find(f => f.deviceId === request.stop.deviceId && !s.downLinks.includes(f.segmentId)))?.address?.ip ?? sourceAddress,
  });
  let translated = null;
  if (!routerSource && external && !s.networkModel) {
    // Route selection is the E4 lookup, not its configuration verdict.
    const route = routeTo(s.config, s.dhcp, destination);
    if (route?.interface !== p.wan) return finish('unreachable', { reporter: t.router });
    // TCP/UDP carry ports; ICMP Echo carries one identifier, which every
    // tuple keeps (the remote end too), never a fabricated port.
    const packet = { protocol, src: { address: sourceAddress, port: flowId },
      dst: { address: destination, port: protocol === 'icmp' ? flowId : service === 'ssh' ? 22 : service === 'http' ? 80 : 53 }, ingress: p.lan, egress: p.wan };
    translated = s.config.nat.enabled ? translate(packet, effectiveNat(s.config, s.dhcp)) : null;
    if (translated?.entry) result.natState = [translated.entry];
    // Upstream has no route to private LANs in this topology. NAT absence
    // causes no response; it is not an independent service success switch.
    if (!translated?.entry && !s.routedLan) return finish('timeout');
  }
  const blocked = protocol === 'icmp' && s.icmpFilters.some(id => pathIds.includes(id) || id === destination);
  if (blocked || s.hosts[destination]?.responds === false) return finish('timeout');
  const wireSource = translated?.entry ? t.wan : from;
  const both = forwardPing(net, routes, wireSource, destination, options);
  let reply = both.reply;
  if (s.returnRoutes || s.returnDownLinks.length) reply = trace(net, s.returnRoutes ?? routes, destination,
    translated?.entry ? t.wan : sourceAddress, { ...replyOptions, boundary: external ? boundaryFor(both.request) : undefined });
  if (external && !s.returnPath && reply?.ok) reply = { ...reply, ok: false, stop: { code: 'upstream-return-unreachable', deviceId: 'ISP' } };
  result.delivery.reply = reply;
  let delivered = both.request.ok && !!reply?.ok;
  if (translated?.entry && delivered) {
    const entry = translated.entry;
    const restored = reverse({ protocol, src: entry.remote, dst: entry.outside, ingress: p.wan, egress: p.lan }, result.natState);
    const lastLeg = trace(net, s.returnRoutes ?? routes, t.router, restored?.dst.address, replyOptions);
    delivered = restored?.dst.address === sourceAddress && lastLeg.ok;
    result.delivery.restored = restored; result.delivery.lastLeg = lastLeg;
  }
  result.delivery.ok = delivered;
  if (!delivered) return finish('timeout');
  if (service === 'dns') return finish(s.topology.providerDns.includes(destination) || s.hosts[destination]?.dns ? 'reply' : 'refused');
  if (service === 'ssh') return finish(s.hosts[destination]?.ssh ?? (destination === (s.pc?.gateway ?? t.router) ? s.services.ssh : 'refused'));
  if (service === 'http') {
    const outcome = s.hosts[destination]?.http ?? (destination === t.website ? s.services.http : 'refused');
    return finish(outcome, { status: outcome === 'ok' ? 200 : outcome === 'http-error' ? 503 : null });
  }
  return finish('reply', { reporter: destination });
}

export function dnsLookup(s, name = s.websiteName) {
  const c = clientState(s), resolver = c.dns[0] ?? null;
  const delivered = resolver ? probe(s, { destination: resolver, protocol: 'udp', service: 'dns' }) : null;
  const result = { name, resolver, resolverName: resolver ? 'resolver.example' : 'UnKnown', protocol: 'udp',
    source: delivered?.source ?? { address: c.address, interface: c.interface }, delivery: delivered?.delivery ?? { request: null, reply: null, ok: false },
    natState: delivered?.natState ?? [], ok: false, outcome: 'timeout', address: null };
  if (!delivered?.ok || s.dnsMode === 'timeout') return result;
  if (parseIp(name) !== null) {
    const answerName = s.reverseRecords?.[parseIp(name)];
    return { ...result, outcome: answerName ? 'answer' : 'nxdomain', ok: !!answerName, address: answerName ? parseIp(name) : null, answerName: answerName ?? null };
  }
  if (!Object.hasOwn(s.dnsRecords, name.toLowerCase())) return { ...result, outcome: 'nxdomain' };
  const address = s.dnsRecords[name.toLowerCase()];
  return { ...result, outcome: address === s.topology.website ? 'answer' : 'wrong-answer', ok: true, address };
}
export function httpFetch(s, name = s.websiteName) {
  const literal = parseIp(name);
  if (literal !== null) return { ...probe(s, { destination: literal, service: 'http' }), name: literal, dns: null };
  const dns = dnsLookup(s, name);
  if (!dns.ok) return { ...dns, service: 'http', outcome: 'dns-failure', name, dns, ok: false };
  const result = probe(s, { destination: dns.address, protocol: 'tcp', service: 'http' });
  return { ...result, natState: [...dns.natState, ...result.natState], name, dns };
}

/** Three independently observed TTL probes per hop, with separate error reply
 * routing/filtering. The internal forwarding walk is never exposed as tracert. */
export function traceRoute(s, destination = s.remoteIp, { maxHops = 4 } = {}) {
  if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 4) throw new RangeError('checks-trace-hop-budget');
  const hops = [];
  for (let ttl = 1; ttl <= maxHops; ttl++) {
    const slots = [0, 1, 2].map(slot => probe(s, { destination, ttl, slot }));
    hops.push({ ttl, slots, address: slots.find(r => r.reporter)?.reporter ?? null });
    if (slots.some(r => r.outcome === 'reply' || r.outcome === 'unreachable')) break;
  }
  return { destination, hops, ok: hops.at(-1).slots.some(r => r.outcome === 'reply'), outcome: 'trace' };
}

/** Adapt a chosen routing topology without copying/editing its bank or logic.
 * Routes include the learner-visible configured rows; net.supplied remains
 * authoritative for the return path. No fictitious NAT is added to routed LANs. */
export function createRoutingScenario(record, routes, { seed = 0, vendor = 'cisco', pcId, destination } = {}) {
  const net = record.network ?? record;
  const pc = net.endpoints.find(e => e.id === pcId) ?? net.endpoints.find(e => e.kind === 'host');
  const gateway = addressed(net).find(f => f.segmentId === pc?.segmentId && f.address?.ip === pc.gateway);
  if (!pc || !gateway || parseIp(destination) === null) throw new RangeError('invalid-checks-routing-adapter');
  const s = createScenario(seed, { level: 2, vendor, faultId: 'healthy' });
  s.networkModel = copy(net); s.routes = copy(routes);
  s.pc = { id: pc.id, address: pc.ip, prefix: gateway.address.prefix, gateway: pc.gateway, interface: 'Ethernet', segmentId: pc.segmentId };
  s.staticClient = { acquired: false, address: pc.ip, prefix: gateway.address.prefix, gateway: pc.gateway, dns: [], reason: 'static' };
  s.remoteIp = destination;
  return s;
}
