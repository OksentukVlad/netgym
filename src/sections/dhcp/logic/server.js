import { blockSize, broadcast, fromInt, parseIp, prefixToMask, toInt } from '../../../engine/ip.js';
import { makeRng } from '../../../engine/rng.js';
import { findings, labels, verdicts, wizard } from '../uk.js';
import { lanMapper } from './scenario.js';

export const id = 'dhcp-server';
export const version = 1;
export const generatorVersion = 1;
const ros = vendor => vendor === 'mikrotik' || vendor === 'routeros';
const asRows = value => Array.isArray(value) ? value : [];
const issue = (code, text, details = {}, kind = 'verdict') => ({ ok: false, code, kind, text, ...details });
const numeric = rows => rows.map(r => ({ from: toInt(r.from), to: toInt(r.to) }));
const dotted = rows => rows.map(r => ({ from: fromInt(r.from), to: fromInt(r.to) }));
const bounds = task => ({ from: toInt(task.network), to: toInt(broadcast(task.network, task.prefix)) });

// Closed intervals throughout: singleton exclusions have a capacity of one.
function union(rows) {
  const sorted = rows.map(r => ({ ...r })).sort((a, b) => a.from - b.from || a.to - b.to), result = [];
  for (const row of sorted) {
    if (result.length && row.from <= result.at(-1).to + 1) result.at(-1).to = Math.max(result.at(-1).to, row.to);
    else result.push(row);
  }
  return result;
}
function subtract(rows, removed) {
  let result = union(rows);
  for (const cut of union(removed)) result = result.flatMap(row => {
    if (cut.to < row.from || cut.from > row.to) return [row];
    return [
      ...(row.from < cut.from ? [{ from: row.from, to: cut.from - 1 }] : []),
      ...(row.to > cut.to ? [{ from: cut.to + 1, to: row.to }] : []),
    ];
  });
  return result;
}
const includes = (rows, ip) => rows.some(row => row.from <= toInt(ip) && toInt(ip) <= row.to);

/** Rows are {from,to}. Exclusion rows allow a blank/missing `to` (one address).
 * MikroTik ranges may also be a comma-separated native ranges= value.
 * Cisco command text is deliberately not parsed: L3 uses labelled row fields. */
function parseRows(input, { singleton = false, text = false, empty = false } = {}) {
  let rows = input;
  if (text && typeof rows === 'string') rows = rows.trim() ? rows.split(',').map(part => {
    const pieces = part.trim().split('-');
    return pieces.length <= 2 ? { from: pieces[0], to: pieces[1] ?? pieces[0] } : null;
  }) : [];
  if (!Array.isArray(rows) || (!rows.length && !empty)) return issue('syntax', findings.syntax, {}, 'info');
  const result = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], from = parseIp(row?.from);
    const to = singleton && (row?.to === undefined || row?.to === '') ? from : parseIp(row?.to);
    if (from === null || to === null) return issue('syntax', findings.syntax, { row: index }, 'info');
    if (toInt(from) > toInt(to)) return issue('order', findings.order, { row: index }, 'info');
    result.push({ from, to });
  }
  return { ok: true, rows: result };
}
export const parseRanges = input => parseRows(input, { text: true });
export const parseExclusions = input => parseRows(input, { singleton: true, empty: true });
export function parseDns(input) {
  const values = Array.isArray(input) ? input : typeof input === 'string' ? input.trim().split(/[\s,;]+/) : [];
  const parsed = values.map(parseIp);
  return parsed.length && parsed.every(ip => ip !== null)
    ? { ok: true, addresses: [...new Set(parsed)] }
    : issue('dns-syntax', findings.syntax, {}, 'info');
}

/** L1/L2 have neutral range fields for either vendor. Only L3 Cisco uses the
 * usable subnet minus exclusions and its automatically excluded interface.
 * Exclusions are global IOS statements: harmless exclusions outside this pool
 * do not allocate outside addresses and are accepted. No static is auto-removed. */
export function effectiveAllocation(task, answer = {}) {
  const cisco = task.level === 3 && task.vendor === 'cisco';
  const parsed = cisco ? parseExclusions(answer.exclusions) : parseRanges(answer.ranges);
  if (!parsed.ok) return parsed;
  const b = bounds(task);
  const intervals = cisco
    ? subtract([{ from: b.from + 1, to: b.to - 1 }], [...numeric(parsed.rows), { from: toInt(task.router), to: toInt(task.router) }])
    : union(numeric(parsed.rows));
  return { ok: true, ranges: dotted(intervals), count: intervals.reduce((sum, r) => sum + r.to - r.from + 1, 0), firstAddress: intervals.length ? fromInt(intervals[0].from) : null };
}

/** Exactly one finding: parsing/order → outside → boundaries → static → router
 * → capacity. A malformed later row wins over all semantic findings. */
export function checkAllocation(task, answer) {
  const allocation = effectiveAllocation(task, answer);
  if (!allocation.ok) return allocation;
  const rows = numeric(allocation.ranges), b = bounds(task);
  const outside = rows.find(row => row.from < b.from || row.to > b.to);
  if (outside) {
    const address = fromInt(outside.from < b.from ? outside.from : Math.max(b.to + 1, outside.from));
    return issue('outside', findings.outside(address, task.network, task.prefix), { address });
  }
  for (const [address, isBroadcast] of [[fromInt(b.from), false], [fromInt(b.to), true]]) {
    if (includes(rows, address)) return issue('boundary', findings.boundary(address, isBroadcast), { address, highlight: { kind: 'address', value: address } });
  }
  for (const device of task.statics) if (includes(rows, device.address)) {
    return issue('static', findings.static(device.genitive, device.address), { address: device.address, device: device.id, highlight: { kind: 'address', value: device.address } });
  }
  if (includes(rows, task.router)) return issue('router', findings.router(task.router), { address: task.router, highlight: { kind: 'address', value: task.router } });
  if (allocation.count < task.clients) return issue('capacity', findings.capacity(allocation.count, task.clients), { count: allocation.count, needed: task.clients });
  return { ...allocation, kind: 'verdict', code: 'allocation-ok', text: verdicts.allocation };
}

export function checkOptions(task, answer = {}) {
  const gateway = parseIp(answer.gateway);
  if (gateway === null) return issue('gateway-syntax', findings.syntax, { field: 'gateway' }, 'info');
  if (gateway !== task.router) return issue('gateway', findings.gateway(task.router), { field: 'gateway' });
  const dns = parseDns(answer.dns);
  if (!dns.ok) return { ...dns, field: 'dns' };
  const allowed = [...task.providerDns, ...(task.routerForwardsDns ? [task.router] : [])];
  if (dns.addresses.some(ip => !allowed.includes(ip))) return issue('dns', task.routerForwardsDns ? findings.dnsWithRouter : findings.dns, { field: 'dns' });
  return { ok: true, gateway, dns: dns.addresses };
}

export function check(task, answer, { step = 'all' } = {}) {
  if (step === 'options') return checkOptions(task, answer);
  const allocation = checkAllocation(task, answer);
  if (!allocation.ok || step === 'allocation') return allocation;
  const options = checkOptions(task, answer);
  return options.ok ? { ...allocation, ...options, code: 'server-ok', text: verdicts.server } : options;
}

function freeRanges(task) {
  const b = bounds(task);
  return subtract([{ from: b.from + 1, to: b.to - 1 }], [task.router, ...task.statics.map(s => s.address)].map(ip => ({ from: toInt(ip), to: toInt(ip) })));
}

export function generateScenario({ seed = 0, level = 1, vendor = 'cisco', otherAddresses = false } = {}) {
  if (![1, 2, 3].includes(level) || !['cisco', 'mikrotik', 'routeros'].includes(vendor)) throw new RangeError('invalid-dhcp-scenario');
  const rng = makeRng(`dhcp:server:${seed}:${level}`), map = lanMapper(seed, otherAddresses);
  const prefix = level === 1 ? 24 : rng.int(25, 27), size = blockSize(prefix);
  const start = toInt('192.168.88.0') + (level === 1 ? 0 : rng.int(0, 256 / size - 1) * size);
  const ip = offset => map(fromInt(start + offset));
  const offsets = level === 1 ? [250, 2, 3] : [size / 2, 1, size - 2];
  const statics = offsets.slice(0, rng.int(1, 3)).map((offset, i) => ({ id: ['printer', 'server', 'camera'][i], name: labels.devices[i], genitive: labels.deviceGenitives[i], address: ip(offset) }));
  const task = {
    id, seed, level, vendor: ros(vendor) ? 'mikrotik' : 'cisco', otherAddresses,
    network: ip(0), prefix, router: ip(level === 1 ? 1 : rng.int(2, 4)), statics,
    clients: 1, providerDns: [map('203.0.113.53'), map('203.0.113.54')],
    routerForwardsDns: level > 1 && rng.int(0, 1) === 1,
    interface: 'bridge1', lease: '10m',
  };
  const biggest = Math.max(...freeRanges(task).map(r => r.to - r.from + 1));
  task.clients = rng.int(Math.min(10, biggest), Math.min(level === 1 ? 60 : 40, biggest));
  return task;
}

/** A reference is computed only when explicitly requested; it is not a field
 * in generated task data. One interval on the bigger side always fits. */
export function referenceAnswer(task) {
  const largest = freeRanges(task).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
  const ranges = dotted([largest]), b = bounds(task);
  return {
    ...(task.level === 3 && task.vendor === 'cisco'
      ? { exclusions: dotted(subtract([{ from: b.from + 1, to: b.to - 1 }], [largest])) }
      : { ranges }),
    gateway: task.router, dns: [task.providerDns[0]],
  };
}

export function clientCheck(task, answer) {
  const result = check(task, answer);
  if (!result.ok) return [];
  return [
    { id: 'address', ok: true, value: `${result.firstAddress}/${task.prefix}`, text: verdicts.lease(result.firstAddress, task.prefix) },
    { id: 'gateway', ok: true, value: result.gateway, text: verdicts.gateway(result.gateway) },
    { id: 'dns', ok: true, value: result.dns.join(', '), text: verdicts.dns(result.dns) },
  ];
}

/** Complement explicit ranges to emit actual Cisco exclusions, rather than
 * inventing an IOS range command. L3 retains the learner's exclusion rows. */
export function nativeLines(task, answer, vendor = task.vendor) {
  const result = check(task, answer);
  if (!result.ok) return [];
  if (ros(vendor)) {
    const ranges = result.ranges.map(r => r.from === r.to ? r.from : `${r.from}-${r.to}`).join(',');
    return [
      `/ip pool add name=LAN ranges=${ranges}`,
      `/ip dhcp-server add name=LAN interface=${task.interface} address-pool=LAN lease-time=${task.lease} disabled=no`,
      `/ip dhcp-server network add address=${task.network}/${task.prefix} gateway=${result.gateway} dns-server=${result.dns.join(',')}`,
    ];
  }
  const b = bounds(task);
  const exclusions = task.level === 3 && task.vendor === 'cisco'
    ? parseExclusions(answer.exclusions).rows
    : dotted(subtract([{ from: b.from + 1, to: b.to - 1 }], numeric(result.ranges)));
  return [
    ...exclusions.map(r => `ip dhcp excluded-address ${r.from}${r.to === r.from ? '' : ` ${r.to}`}`),
    'ip dhcp pool LAN', `network ${task.network} ${prefixToMask(task.prefix)}`,
    `default-router ${result.gateway}`, `dns-server ${result.dns.join(' ')}`,
  ];
}

export function exclusionLines(rows) {
  const parsed = parseExclusions(rows);
  return parsed.ok ? parsed.rows.map(r => `ip dhcp excluded-address ${r.from}${r.to === r.from ? '' : ` ${r.to}`}`) : [];
}

/** Form order is the real DHCP Setup order, with three given fields. */
export function wizardFields(task) {
  return [
    { id: 'interface', native: 'DHCP Server Interface', purpose: wizard.interface, given: true, value: task.interface },
    { id: 'addressSpace', native: 'DHCP Address Space', purpose: wizard.addressSpace, given: true, value: `${task.network}/${task.prefix}` },
    { id: 'gateway', native: 'Gateway for DHCP Network', purpose: wizard.gateway, given: false },
    { id: 'ranges', native: 'Addresses to Give Out', purpose: wizard.ranges, given: false },
    { id: 'dns', native: 'DNS Servers', purpose: wizard.dns, given: false },
    { id: 'lease', native: 'Lease Time', purpose: wizard.lease, given: true, value: task.lease },
  ];
}

/** Caption always includes the whole network and all pins. The start marker
 * is available as soon as `from` parses; the band needs both valid endpoints. */
export function stripView(task, answer = {}) {
  const allocation = effectiveAllocation(task, answer), first = asRows(answer.ranges)[0];
  const marker = parseIp(first?.from);
  return {
    network: task.network, broadcast: broadcast(task.network, task.prefix), router: task.router,
    statics: task.statics.map(s => ({ ...s })), marker,
    ranges: allocation.ok ? allocation.ranges : [],
    routerAutoExcluded: task.level === 3 && task.vendor === 'cisco',
    caption: stripCaption(task, answer),
  };
}
export function stripCaption(task, answer = {}) {
  const shorten = ip => ip.startsWith(task.network.slice(0, task.network.lastIndexOf('.') + 1)) ? `.${ip.split('.').at(-1)}` : ip;
  const allocation = effectiveAllocation(task, answer);
  const pool = allocation.ok && allocation.ranges.length
    ? allocation.ranges.map(r => `${shorten(r.from)}–${shorten(r.to)}`).join(', ')
    : labels.noRange;
  return [
    `${labels.network} ${shorten(task.network)}–${shorten(broadcast(task.network, task.prefix))}`,
    `${labels.router} ${shorten(task.router)}`,
    ...task.statics.map(s => `${s.name} ${shorten(s.address)}`),
    `${task.level === 3 && task.vendor === 'cisco' ? labels.yourPool : labels.yourRange} ${pool}`,
  ].join(' · ');
}
