import { contains, fromInt, network, parseIp, parsePrefix, toInt } from '../../../engine/ip.js';
import { effectiveAllocation, parseDns } from './server.js';
import { natConfig, translate, reverse } from './nat.js';
import { fault as words } from '../uk.js';

const validSubnet = (ip, prefix) => parseIp(ip) !== null && parsePrefix(prefix) !== null;
export const portsFor = scenario => scenario.topology.ports[scenario.vendor];
export const allocationTask = scenario => ({ ...scenario, routerForwardsDns: false });

/** E2's native Cisco exclusion model at L3; neutral intervals otherwise.
 * Cisco pool selection happens BEFORE allocation, by the receiving subnet.
 * There is no relay, secondary subnet, competing server or static PC here. */
export function acquire(config, scenario, clientId = scenario.failingPc) {
  const d = config?.dhcp, p = portsFor(scenario);
  const missing = reason => ({ acquired: false, address: '169.254.23.57', prefix: 16, gateway: null, dns: [], reason });
  if (!d?.enabled || d.interface !== p.lan) return missing('no-server');
  if (scenario.vendor === 'cisco' && (!validSubnet(d.poolNetwork, d.poolPrefix)
    || d.poolPrefix !== scenario.prefix || network(d.poolNetwork, d.poolPrefix) !== scenario.network)) return missing('no-pool');
  const allocation = effectiveAllocation(allocationTask(scenario), d);
  if (!allocation.ok) return missing('invalid-allocation');
  const inPool = ip => allocation.ranges.some(r => toInt(r.from) <= toInt(ip) && toInt(ip) <= toInt(r.to));
  const occupied = scenario.leases.filter(l => l.clientId !== clientId).map(l => toInt(l.address));
  const own = scenario.leases.find(l => l.clientId === clientId && inPool(l.address));
  let address = own && !occupied.includes(toInt(own.address)) ? own.address : null;
  for (const range of allocation.ranges) {
    if (address) break;
    let candidate = toInt(range.from);
    // At most one increment per occupied lease, even for a huge range.
    for (const used of [...new Set(occupied)].sort((a, b) => a - b)) {
      if (used === candidate) candidate++;
      else if (used > candidate) break;
    }
    if (candidate <= toInt(range.to)) address = fromInt(candidate);
  }
  if (!address) return missing('exhausted');
  const matched = scenario.vendor === 'cisco' || (validSubnet(d.network, d.networkPrefix) && contains(d.network, d.networkPrefix, address));
  const dns = matched ? parseDns(d.dns) : { ok: false };
  // RouterOS takes addresses from /ip pool, options only from a matching
  // /ip dhcp-server network. No matching row => no gateway or DNS options.
  // The vendor manual does not specify the unmatched netmask; keep it unknown
  // rather than claiming a particular Windows interpretation (/32, etc.).
  return { acquired: true, address, prefix: matched ? (scenario.vendor === 'cisco' ? d.poolPrefix : d.networkPrefix) : null,
    gateway: matched ? parseIp(d.gateway) : null, dns: dns.ok ? dns.addresses : [], reason: matched ? 'bound' : 'unmatched-network' };
}

/** One directly connected LAN and WAN, static routes and WAN-DHCP default.
 * Routes have no recursive next hops, ECMP, policy routing or VRFs. */
export function routingTable(config, scenario) {
  const t = scenario.topology, p = portsFor(scenario), r = config?.routing ?? {};
  const rows = [
    { network: scenario.network, prefix: scenario.prefix, gateway: null, interface: p.lan, source: 'connected', distance: 0 },
    { network: network(t.wan, t.wanPrefix), prefix: t.wanPrefix, gateway: null, interface: p.wan, source: 'connected', distance: 0 },
    ...(r.routes ?? []),
    ...(r.staticDefault ? [{ network: '0.0.0.0', prefix: 0, gateway: r.staticDefault, interface: p.wan, source: 'static', distance: 1 }] : []),
    ...(r.dhcpDefault ? [{ network: '0.0.0.0', prefix: 0, gateway: t.ispGateway, interface: p.wan, source: 'dhcp', distance: scenario.vendor === 'cisco' ? 254 : 1 }] : []),
  ];
  return rows.filter(row => row.active !== false && validSubnet(row.network, row.prefix)).map(row => ({ ...row }));
}
export function routeTo(config, scenario, destination) {
  if (parseIp(destination) === null) return null;
  const route = routingTable(config, scenario).filter(r => contains(r.network, r.prefix, destination))
    .sort((a, b) => b.prefix - a.prefix || (a.distance ?? 1) - (b.distance ?? 1))[0];
  return route ?? null;
}
const wanPath = (config, s, ip) => {
  const route = routeTo(config, s, ip);
  return route?.interface === portsFor(s).wan && (route.source === 'connected' || route.gateway === s.topology.ispGateway);
};

/** Adapt only the editable NAT fields to E3's translation and reply model. */
export function effectiveNat(config, scenario) {
  const base = natConfig(scenario.topology, scenario.vendor), n = config?.nat ?? {}, p = portsFor(scenario);
  if (scenario.vendor === 'cisco') return { ...base, roles: n.roles ?? {}, match: { acl: n.acl ?? [] } };
  return { ...base, interfaceLists: { ...base.interfaceLists, E4: [n.outInterface] },
    match: { outInterfaceList: 'E4' }, insideInterfaces: [p.lan] };
}

export function evaluate(config, scenario, { clientId = scenario.failingPc } = {}) {
  const lease = acquire(config, scenario, clientId), t = scenario.topology, p = portsFor(scenario);
  const addressOk = lease.acquired && contains(scenario.network, scenario.prefix, lease.address) === true
    && lease.prefix === scenario.prefix;
  const gatewayOk = addressOk && lease.gateway === scenario.router;
  const gatewayStop = !addressOk ? (lease.acquired ? 'wrongNetwork' : 'linkLocal') : !lease.gateway ? 'noGateway' : 'wrongGateway';
  const reach = (destination, protocol) => {
    if (!gatewayOk) return { ok: false, stop: gatewayStop };
    if (!wanPath(config, scenario, destination)) return { ok: false, stop: 'route' };
    if (!config?.nat?.enabled) return { ok: false, stop: 'nat' };
    const packet = { protocol, src: { address: lease.address, port: 51000 }, dst: { address: destination, port: protocol === 'udp' ? 53 : 0 }, ingress: p.lan, egress: p.wan };
    const result = translate(packet, effectiveNat(config, scenario));
    if (!result.entry) return { ok: false, stop: 'nat' };
    const reply = { ...packet, src: packet.dst, dst: result.translated.src, ingress: p.wan, egress: p.lan };
    return { ok: reverse(reply, [result.entry])?.dst.address === lease.address, stop: 'remoteOk' };
  };
  const remote = reach(scenario.remoteIp, 'icmp');
  const dnsPaths = lease.dns.filter(ip => scenario.providerDns.includes(ip)).map(ip => reach(ip, 'udp'));
  const dnsOk = dnsPaths.some(r => r.ok);
  const dnsStop = !gatewayOk ? gatewayStop : !lease.dns.length ? 'noDns' : !dnsPaths.length ? 'wrongDns'
    : dnsOk ? 'dnsOk' : dnsPaths[0].stop;
  const explain = stop => stop === 'linkLocal' ? words.linkLocal : words.stops[stop];
  const row = (id, ok, value, stop) => ({ id, ok, value, label: id === 'remote' ? words.rows.remote(scenario.remoteIp) : words.rows[id],
    stop, explanation: explain(stop), highlight: { kind: 'dhcp-probe', target: ['linkLocal', 'wrongNetwork', 'noGateway', 'wrongGateway', 'noDns', 'wrongDns'].includes(stop) ? clientId : stop === 'nat' || stop === 'route' ? 'R1' : id } });
  const rows = [
    row('address', addressOk, `${lease.address}${lease.prefix === null ? '' : `/${lease.prefix}`}`, addressOk ? 'addressOk' : lease.acquired ? 'wrongNetwork' : 'linkLocal'),
    row('gateway', gatewayOk, lease.gateway ?? words.none, gatewayOk ? 'gatewayOk' : gatewayStop),
    row('remote', remote.ok, scenario.remoteIp, remote.stop),
    row('dns', dnsOk, lease.dns.join(', ') || words.none, dnsStop),
  ];
  return { clientId, lease, rows, ok: rows.every(r => r.ok),
    router: { source: t.wan, destination: scenario.remoteIp, ok: wanPath(config, scenario, scenario.remoteIp), routes: routingTable(config, scenario) } };
}
