import { parseIp, blockSize, isNetworkAddress, overlaps, role, sameNetwork } from './ip.js';

/** @typedef {{id:string, slot?:string, dst:string, prefix:number, via?:string, discard?:boolean, distance?:number}} Route */
/** @typedef {Object<string, Route[]>} Routes */
/** @typedef {{id:string, segmentId:string, address:{ip:string,prefix:number}|null, dhcp?:true, labels:{cisco:string,routeros:string}, note?:string}} Interface */
/** @typedef {{devices:{id:string,kind:string,interfaces:Interface[]}[], segments:{id:string,kind:string,name:string}[], endpoints:object[], supplied:Routes}} Network */
/** @typedef {{kind:'lan'|'link'|'summary'|'default', segments:string[]}} RowDestination */
/** @typedef {{label:string|object, needDist:boolean, suggestion?:boolean, dest:RowDestination, discard?:boolean, role?:'primary'|'backup'}} ScaffoldRow */
/** @typedef {{dst:string, prefix:number}} CoveragePrefix */
/** @typedef {{id:string, from:string, to:string, coverage?:{from:CoveragePrefix|null,to:CoveragePrefix|null}}} Probe */
/** @typedef {{id:string, downLinks:string[], probeIds:string[]}} Scenario */
/** @typedef {{id:string, type:string, severity:'blocks'|'advice', scenarioId:string|null, justification:string, routerId?:string, probeIds?:string[], destinations?:CoveragePrefix[], exclude?:CoveragePrefix[], dst?:string, prefix?:number, destination?:string, probeId?:string, deviceId?:string, direction?:'request'|'reply', primaryVia?:string, backupVia?:string, code?:string}} Objective */
/** @typedef {{id:string, code:string, title:string|object, text:string|object, referenceRoutes:Routes, objectives:Objective[], scaffold:Object<string, ScaffoldRow[]>}} TaskVariant */
/** @typedef {{id:string, displayNumber:number, revision:number, title:string|object, text:string|object, network:Network, probes:Probe[], scenarios:Scenario[], demonstrations:Probe[], variants:TaskVariant[]}} TaskRecord */

export const objectiveTypes = ['coverage', 'summary', 'default-on', 'no-default', 'direct-neighbour', 'distance-order', 'path-via', 'specific-to', 'internet-coverage'];

/** Validate references, addressing and segment boundaries without changing the model.
 * @param {Network} net
 * @returns {{code:string, entity:string}[]}
 */
export function validateNetwork(net) {
  const issues = [];
  const add = (code, entity) => issues.push({ code, entity });
  if (!net || !['devices', 'segments', 'endpoints'].every(k => Array.isArray(net[k]))) {
    return [{ code: 'invalid-network', entity: 'network' }];
  }
  const unique = (items, kind) => {
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) add('duplicate-or-missing-id', kind);
      ids.add(item?.id);
    }
  };
  unique(net.devices, 'devices');
  unique(net.segments, 'segments');
  unique(net.endpoints, 'endpoints');
  const segments = new Map(net.segments.filter(Boolean).map(s => [s.id, s]));
  const all = [];
  const addresses = new Set();
  const address = (value, entity) => {
    if (parseIp(value) !== value) add('invalid-ip', entity);
    if (addresses.has(value)) add('duplicate-address', entity);
    addresses.add(value);
  };
  for (const segment of net.segments) {
    if (!segment || !['lan', 'link', 'wan', 'server'].includes(segment.kind) || typeof segment.name !== 'string' || !segment.name) add('invalid-segment', segment?.id);
  }
  for (const device of net.devices) {
    if (!device || !['router', 'isp'].includes(device.kind) || !Array.isArray(device.interfaces)) {
      add('invalid-device', device?.id);
      continue;
    }
    for (const iface of device.interfaces) {
      if (!iface) { add('invalid-interface', device.id); continue; }
      all.push(iface);
      const segment = segments.get(iface.segmentId);
      if (!segment) add('unknown-segment', iface.id);
      if (!iface.labels || !['cisco', 'routeros'].every(k => typeof iface.labels[k] === 'string')) add('invalid-labels', iface.id);
      if (iface.address === null) {
        if (iface.dhcp !== true || segment?.kind !== 'wan') add('invalid-dhcp', iface.id);
      } else if (!iface.address || blockSize(iface.address.prefix) === null) {
        add('invalid-prefix', iface.id);
      } else {
        address(iface.address.ip, iface.id);
        if (iface.dhcp || role(iface.address.ip, iface.address.ip, iface.address.prefix) !== 'host') add('invalid-interface-address', iface.id);
      }
    }
  }
  unique(all, 'interfaces');
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (!a.address) continue;
    for (const b of all.slice(i + 1).filter(f => f.address)) {
      const same = a.segmentId === b.segmentId;
      if (same && (a.address.prefix !== b.address.prefix || !sameNetwork(a.address.ip, b.address.ip, a.address.prefix))) add('segment-prefix-mismatch', b.id);
      if (!same && overlaps(a.address.ip, a.address.prefix, b.address.ip, b.address.prefix)) add('overlapping-segments', b.id);
    }
  }
  for (const segment of net.segments.filter(Boolean)) {
    const members = all.filter(f => f.segmentId === segment.id);
    if (!members.length || (segment.kind === 'link' && members.length !== 2)) add('invalid-segment-members', segment.id);
  }
  for (const endpoint of net.endpoints) {
    if (endpoint?.kind === 'internet') {
      if (!Array.isArray(endpoint.viaPeers) || !endpoint.viaPeers.length || endpoint.viaPeers.some(id => !net.devices.some(d => d?.id === id && d.kind === 'isp'))) add('unknown-peer', endpoint.id);
      // An omitted IP uses the engine's benchmark address for this boundary.
      address(endpoint.ip ?? '198.19.255.254', endpoint.id);
      continue;
    }
    if (!endpoint || endpoint.kind !== 'host' || !segments.has(endpoint.segmentId)) {
      add('invalid-endpoint', endpoint?.id); continue;
    }
    address(endpoint.ip, endpoint.id);
    const gateway = all.find(f => f.segmentId === endpoint.segmentId && f.address?.ip === endpoint.gateway);
    if (!gateway || role(endpoint.ip, gateway.address.ip, gateway.address.prefix) !== 'host') add('invalid-endpoint-gateway', endpoint.id);
  }
  if (!net.supplied || typeof net.supplied !== 'object' || Array.isArray(net.supplied)) add('invalid-supplied', 'supplied');
  else for (const [id, routes] of Object.entries(net.supplied)) {
    if (!net.devices.some(d => d?.id === id) || !Array.isArray(routes)) { add('invalid-supplied', id); continue; }
    for (const route of routes) {
      if (!route || !isNetworkAddress(route.dst, route.prefix) || parseIp(route.dst) !== route.dst || (route.discard === true ? 'via' in route : parseIp(route.via) !== route.via) || (route.discard !== undefined && typeof route.discard !== 'boolean')
        || !Number.isInteger(route.distance ?? 1) || (route.distance ?? 1) < 1 || (route.distance ?? 1) > 254) add('invalid-route', id);
    }
  }
  // DHCP addresses remain null. The supplied gateway belongs to an explicit
  // ISP peer on that WAN; only that supplied peer resolves this unnumbered egress.
  for (const device of net.devices) for (const iface of device?.interfaces ?? []) if (iface?.dhcp) {
    const peers = net.devices.filter(d => d.kind === 'isp').flatMap(d => d.interfaces ?? []).filter(f => f.segmentId === iface.segmentId);
    if (!(Array.isArray(net.supplied?.[device.id]) ? net.supplied[device.id] : []).some(r => r?.prefix === 0 && r.dst === '0.0.0.0' && peers.some(f => f.address?.ip === r.via))) add('missing-dhcp-default', iface.id);
  }
  return issues;
}
