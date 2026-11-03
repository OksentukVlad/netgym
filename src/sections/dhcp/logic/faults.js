import { broadcast, contains, fromInt, parseIp, prefixToMask, toInt } from '../../../engine/ip.js';
import { makeRng } from '../../../engine/rng.js';
import { fault as words, labels } from '../uk.js';
import { createTopology } from './scenario.js';
import { checkAllocation, checkOptions, effectiveAllocation } from './server.js';
import { aclMatches } from './nat.js';
import { evaluate, portsFor } from './client.js';
export { evaluate } from './client.js';

export const id = 'dhcp-fault';
export const version = 1;
export const generatorVersion = 1;
const causeIds = Object.freeze(['no-server', 'wrong-range', 'gateway', 'dns', 'exhausted', 'nat', 'route']);
const copy = value => structuredClone(value);
export function causesForLevel(level) {
  if (![1, 2, 3].includes(level)) throw new RangeError('invalid-dhcp-level');
  return causeIds.slice(0, level === 1 ? 4 : 7).map(id => ({ id, text: words.causes[id] }));
}
const at = (task, offset) => fromInt(toInt(task.network) + offset);
const exclusionsFor = (task, from, to) => [
  { from: at(task, 1), to: fromInt(toInt(from) - 1) },
  { from: fromInt(toInt(to) + 1), to: fromInt(toInt(broadcast(task.network, task.prefix)) - 1) },
].filter(r => toInt(r.from) <= toInt(r.to));
function setRange(task, config, from, to) {
  config.dhcp.ranges = [{ from, to }];
  config.dhcp.exclusions = exclusionsFor(task, from, to);
}

/** Computed on demand; never embedded as a hidden answer in generated tasks. */
export function referenceRepair(task) {
  const p = portsFor(task);
  const config = {
    dhcp: { enabled: true, interface: p.lan, ranges: [], exclusions: [],
      poolNetwork: task.network, poolPrefix: task.prefix,
      network: task.network, networkPrefix: task.prefix, gateway: task.router, dns: [task.providerDns[0]], dnsNone: true },
    nat: { enabled: true, outInterface: p.wan, acl: [{ network: task.network, wildcard: fromInt(2 ** (32 - task.prefix) - 1) }],
      roles: { [p.lan]: 'inside', [p.wan]: 'outside' } },
    routing: { dhcpDefault: task.vendor === 'mikrotik', staticDefault: task.vendor === 'cisco' ? task.topology.ispGateway : '', routes: [] },
  };
  setRange(task, config, at(task, 50), at(task, 99));
  return config;
}

/** Optional fourth argument selects a fixture or renumbers the same fault.
 * `routeros` is accepted as an alias, task.vendor is always `mikrotik`.
 * No branch of the evaluator depends on faultId. */
export function createFault(level = 1, vendor = 'cisco', seed = 0, { otherAddresses = false, faultId } = {}) {
  const choices = causesForLevel(level);
  if (!['cisco', 'mikrotik', 'routeros'].includes(vendor)) throw new RangeError('invalid-dhcp-vendor');
  vendor = vendor === 'routeros' ? 'mikrotik' : vendor;
  const rng = makeRng(`dhcp:fault:${seed}:${level}`), topology = createTopology(seed, { otherAddresses });
  faultId ??= rng.pick(choices).id;
  if (!choices.some(c => c.id === faultId)) throw new RangeError('invalid-dhcp-fault');
  const task = { id, seed, level, vendor, otherAddresses, faultId, topology,
    network: topology.network, prefix: topology.prefix, router: topology.router,
    providerDns: [...topology.providerDns], remoteIp: '8.8.8.8', websiteName: 'www.example.com',
    statics: [{ id: 'printer', name: labels.devices[0], genitive: labels.deviceGenitives[0], address: at(topology, 20) }],
    clients: 10, failingPc: faultId === 'exhausted' ? 'pc2' : 'pc1',
    pcs: faultId === 'exhausted' ? [{ id: 'pc1', name: 'ПК1' }, { id: 'pc2', name: 'ПК2' }] : [{ id: 'pc1', name: 'ПК1' }],
    bridgePorts: vendor === 'mikrotik' ? ['ether2', 'ether3', 'ether4', 'wlan1'] : [], leases: [],
    assumptions: words.assumptions,
  };
  const config = referenceRepair(task), p = portsFor(task);
  const variant = rng.int(0, 1);
  if (faultId === 'no-server') {
    if (vendor === 'cisco' || variant === 0) config.dhcp.enabled = false;
    else config.dhcp.interface = 'ether2';
  }
  if (faultId === 'wrong-range') {
    // Sibling /24 stays in the same private /16 after renumbering.
    const wrongNetwork = fromInt((toInt(task.network) ^ 256) >>> 0);
    if (vendor === 'cisco') config.dhcp.poolNetwork = wrongNetwork;
    else config.dhcp.ranges = [{ from: fromInt(toInt(wrongNetwork) + 150), to: fromInt(toInt(wrongNetwork) + 179) }];
  }
  if (faultId === 'gateway') config.dhcp.gateway = variant ? at(task, 254) : '';
  if (faultId === 'dns') config.dhcp.dns = variant ? [at(task, 254)] : [];
  if (faultId === 'exhausted') {
    task.clients = 4;
    setRange(task, config, at(task, 50), at(task, 52));
    task.leases = ['pc1', 'pc3', 'pc4'].map((clientId, i) => ({ clientId, name: `ПК${clientId.slice(2)}`, address: at(task, 50 + i) }));
  }
  if (faultId === 'nat') {
    const form = rng.int(0, vendor === 'cisco' ? 2 : 1);
    if (form === 0) config.nat.enabled = false;
    else if (vendor === 'mikrotik') config.nat.outInterface = p.lan;
    else if (form === 1) config.nat.roles = { [p.lan]: 'outside', [p.wan]: 'inside' };
    else config.nat.acl = [{ network: at(task, 128), wildcard: '0.0.0.127' }];
  }
  if (faultId === 'route') { config.routing.dhcpDefault = false; config.routing.staticDefault = ''; }
  task.config = config;
  task.task = words.task(task.pcs.find(pc => pc.id === task.failingPc).name);
  return task;
}

/** Fixed order and keys per level, including healthy lines. Values are read
 * from the same config the form edits; no fault-specific diagnostic labels. */
export function evidence(task, config = task.config, result = evaluate(config, task)) {
  const d = config.dhcp, p = portsFor(task), allocation = effectiveAllocation(task, d);
  const showRanges = rows => Array.isArray(rows) ? rows.map(r => `${r.from}–${r.to}`).join(', ') || words.none : String(rows ?? words.none);
  const leases = [...task.leases.filter(l => l.clientId !== result.clientId).map(l => words.evidence.lease(l.name, l.address)),
    words.evidence.lease(task.pcs.find(pc => pc.id === result.clientId)?.name ?? result.clientId, result.lease.acquired ? result.lease.address : null)];
  const line = (id, value) => ({ id, label: words.evidence[id], value });
  const rows = [
    line('server', d.enabled ? words.enabled : words.disabled),
    line('interface', `${d.interface}; LAN ${p.lan} ${task.router}/${task.prefix}${task.vendor === 'mikrotik' ? `; ${words.evidence.bridge(task.bridgePorts)}` : ''}`),
    line('allocation', task.vendor === 'cisco' ? `network ${d.poolNetwork} ${prefixToMask(d.poolPrefix)}; ${task.level === 3 ? `excluded-address ${showRanges(d.exclusions)}` : showRanges(d.ranges)}`
      : `/ip pool: ${showRanges(d.ranges)}; /ip dhcp-server network: ${d.network}/${d.networkPrefix}`),
    line('gateway', d.gateway || words.none),
    line('dns', `${Array.isArray(d.dns) ? d.dns.join(', ') || words.none : d.dns || words.none}${task.vendor === 'mikrotik' ? `; ${words.evidence.dnsNone}` : ''}`),
    { ...line('leases', leases.join('; ')), leases: copy(task.leases), allocationCount: allocation.ok ? allocation.count : null },
  ];
  if (task.level > 1) rows.push(
    line('nat', task.vendor === 'cisco'
      ? `${config.nat.enabled ? 'ip nat inside source list 1 interface ' + p.wan + ' overload' : words.disabled}; ${p.lan}: ${config.nat.roles[p.lan]}; ${p.wan}: ${config.nat.roles[p.wan]}; ${(Array.isArray(config.nat.acl) ? config.nat.acl : []).map(a => `access-list 1 permit ${a?.network} ${a?.wildcard}`).join('; ')}`
      : `${config.nat.enabled ? 'chain=srcnat action=masquerade' : words.disabled}; out-interface=${config.nat.outInterface}`),
    { ...line('routes', result.router.routes.map(r => words.evidence.route(r.network, r.prefix, r.gateway ?? r.interface, words.evidence.sources[r.source] ?? r.source, r.interface)).join('; ')), routes: copy(result.router.routes) },
    { id: 'router', label: words.evidence.router(task.remoteIp), value: result.router.ok ? '✓' : '✗', ok: result.router.ok, source: result.router.source },
  );
  return rows;
}

/** Descriptor `path` is relative to the full config; values are fresh copies.
 * A prefix control stores the integer prefix and may display its dotted mask.
 * Cisco L3 edits exclusions, not a fictitious IOS ranges command. */
export function repairFields(task, config = task.config) {
  const fields = [], p = portsFor(task), native = task.level === 3;
  const add = (id, path, type, options, term) => {
    const value = path.reduce((v, key) => v?.[key], config);
    fields.push({ id, path, type, label: words.fields[id], value: copy(value), group: path[0] === 'dhcp' ? 'dhcp' : 'wan',
      ...(options ? { options } : {}), ...(native && term ? { native: term } : {}) });
  };
  add('enabled', ['dhcp', 'enabled'], 'boolean', null, task.vendor === 'cisco' ? 'service dhcp' : 'disabled');
  add('interface', ['dhcp', 'interface'], 'select', [p.lan, p.wan, ...task.bridgePorts], task.vendor === 'cisco' ? 'receiving interface' : 'DHCP Server Interface');
  if (task.vendor === 'cisco') {
    add('poolNetwork', ['dhcp', 'poolNetwork'], 'ip', null, 'network');
    add('poolPrefix', ['dhcp', 'poolPrefix'], 'prefix', null, 'network mask');
  }
  if (task.vendor === 'cisco' && task.level === 3) add('exclusions', ['dhcp', 'exclusions'], 'intervals', null, 'ip dhcp excluded-address');
  else add('ranges', ['dhcp', 'ranges'], 'intervals', null, 'Addresses to Give Out');
  add('gateway', ['dhcp', 'gateway'], 'ip', null, task.vendor === 'cisco' ? 'default-router' : 'Gateway for DHCP Network');
  add('dns', ['dhcp', 'dns'], 'dns', null, task.vendor === 'cisco' ? 'dns-server' : 'DNS Servers');
  if (task.level > 1) {
    add('natEnabled', ['nat', 'enabled'], 'boolean', null, task.vendor === 'cisco' ? 'ip nat inside source … overload' : 'srcnat masquerade');
    if (task.vendor === 'cisco') {
      add('acl', ['nat', 'acl'], 'acl', null, 'access-list 1 permit');
      add('roles', ['nat', 'roles'], 'roles', ['inside', 'outside', 'none'], 'ip nat inside / ip nat outside');
    } else add('outInterface', ['nat', 'outInterface'], 'select', [p.wan, p.lan], 'out-interface');
    add('dhcpDefault', ['routing', 'dhcpDefault'], 'boolean', null, task.vendor === 'cisco' ? 'ip address dhcp (router option)' : 'add-default-route');
    add('staticDefault', ['routing', 'staticDefault'], 'optional-ip', null, task.vendor === 'cisco' ? 'ip route 0.0.0.0 0.0.0.0' : '/ip route dst-address=0.0.0.0/0 gateway');
  }
  return fields;
}

/** Safety applies to the whole offered pool, not just today's first lease.
 * Restrict Cisco ACL to exactly LAN using fixed wildcard bits; accept arbitrary
 * decompositions into narrower wildcard entries with a bounded host check. */
function safeNat(task, config) {
  if (task.vendor !== 'cisco') return config.nat.outInterface === portsFor(task).wan;
  const acl = config.nat.acl;
  if (!Array.isArray(acl) || !acl.length) return false;
  const hostMask = 2 ** (32 - task.prefix) - 1, fixedMask = (~hostMask) >>> 0;
  if (!acl.every(a => a && parseIp(a.network) !== null && parseIp(a.wildcard) !== null
    && (toInt(a.wildcard) & fixedMask) === 0 && contains(task.network, task.prefix, a.network))) return false;
  // Generated LANs are /24; cap this bounded checker rather than iterating a
  // user-supplied large network. All LAN hosts must be covered, including future leases.
  if (task.prefix < 24) return false;
  for (let offset = 1; offset < hostMask; offset++) if (!acl.some(a => aclMatches(at(task, offset), a))) return false;
  return true;
}
export function checkRepair(task, config) {
  const result = evaluate(config, task), allocation = checkAllocation(task, config?.dhcp ?? {}), options = checkOptions(task, config?.dhcp ?? {});
  const safety = { ok: !!config?.nat?.enabled && safeNat(task, config)
    && task.leases.every(l => evaluate(config, task, { clientId: l.clientId }).ok), code: 'safety', text: words.safety };
  const ok = result.ok && allocation.ok && options.ok && safety.ok;
  return { ok, kind: 'verdict', code: ok ? 'repair-ok' : !allocation.ok ? allocation.code : !options.ok ? options.code : !safety.ok ? 'safety' : 'probes',
    text: ok ? null : !allocation.ok ? allocation.text : !options.ok ? options.text : !safety.ok ? safety.text : words.repairFailed,
    lease: result.lease, rows: result.rows, router: result.router, clientId: result.clientId, allocation, options, safety, evidence: evidence(task, config, result) };
}
export function checkCause(task, causeId) {
  const chosen = causesForLevel(task.level).some(c => c.id === causeId);
  return { ok: chosen && causeId === task.faultId, kind: chosen ? 'verdict' : 'info', code: chosen ? 'cause' : 'invalid-choice' };
}

/** R4: this complete numeric repair solves only the separate documentation
 * network, and is checked by the same repair/cause functions as learner tasks. */
export function faultExample({ level = 1, vendor = 'cisco' } = {}) {
  const task = createFault(level, vendor, 'example', { faultId: 'dns' });
  const old = toInt(task.network), map = ip => {
    if (contains(task.network, 24, ip)) return fromInt(toInt('192.0.2.0') + toInt(ip) - old);
    if (contains('203.0.113.0', 24, ip)) return fromInt(toInt('198.51.100.0') + toInt(ip) - toInt('203.0.113.0'));
    return ip;
  };
  const remap = value => typeof value === 'string' && parseIp(value) !== null ? map(value)
    : Array.isArray(value) ? value.map(remap) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)])) : value;
  const mapped = remap(task);
  mapped.remoteIp = '198.51.100.53';
  mapped.task = words.task('ПК1');
  mapped.config = referenceRepair(mapped); mapped.config.dhcp.dns = [];
  const answer = copy(mapped.config); answer.dhcp.dns = [mapped.providerDns[0]];
  return { context: words.exampleContext, note: words.exampleNote, task: mapped, answer, cause: 'dns',
    before: evaluate(mapped.config, mapped), after: checkRepair(mapped, answer), fields: repairFields(mapped), evidence: evidence(mapped) };
}
