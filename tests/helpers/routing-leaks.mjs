import { prefixToMask, maskToPrefix, network, broadcast, fromInt, toInt, contains } from '../../src/engine/ip.js';
import { syntaxList } from '../../src/sections/routing/syntax/index.js';

/** Use the exact instance, including generated networks and aggregate routes. */
export function instanceAddresses(task) {
  return new Set([
    ...task.network.devices.flatMap(d => d.interfaces.filter(i => i.address).flatMap(i => [i.address.ip, network(i.address.ip, i.address.prefix)])),
    ...task.network.endpoints.flatMap(e => [e.ip, e.gateway]),
    ...Object.values(task.network.supplied ?? {}).flatMap(rows => rows.flatMap(r => [r.dst, r.via])),
    ...Object.values(task.variant.referenceRoutes).flatMap(rows => rows.flatMap(r => [r.dst, r.via, ...(r.alternatives ?? [])])),
  ].filter(Boolean));
}

export const normalise = text => String(text).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map();
function has(text, value) {
  if (!patterns.has(value)) patterns.set(value, new RegExp(`(?<![\\d.])${escape(value).replaceAll('/', '\\s*/\\s*')}(?!\\d|\\.\\d)`));
  return patterns.get(value).test(text);
}

// The Rules panel's examples: documentation addresses only (RFC 5737), or masks.
const DOCUMENTATION = [['192.0.2.0', 24], ['198.51.100.0', 24], ['203.0.113.0', 24]];
const dotted = text => text.match(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d]|\.\d)/g) ?? [];

/** Compile immutable task facts once for a rendered-surface sweep. This is an
 * explicit snapshot, not a global cache: ordinary leaks() still reads mutations.
 * No rendered surface or verdict is cached. */
export function createLeakInspector(task) {
  const facts = leakFacts(task);
  return (surface, kind = 'text', context = {}) => inspect(surface, kind, context, facts);
}

export function createLeakSweep() {
  const tasks = new WeakMap();
  return (task, ...args) => {
    if (!tasks.has(task)) tasks.set(task, createLeakInspector(task));
    return tasks.get(task)(...args);
  };
}

function leakFacts(task) {
  const routes = Object.values(task.variant.referenceRoutes).flat();
  const addresses = task.network.devices.flatMap(d => d.interfaces.filter(i => i.address).map(i => i.address));
  const networks = new Set(addresses.map(a => network(a.ip, a.prefix)));
  const routers = task.network.devices.filter(d => d.kind === 'router').flatMap(d => d.interfaces.filter(i => i.address).map(i => i.address));
  return {
    routes: routes.map(route => ({
      route,
      vias: [route.via, ...(route.alternatives ?? [])].map(via => ({ via,
        commands: syntaxList.map(syntax => normalise(syntax.command({ ...route, via, ...(route.distance === 1 ? { distance: undefined } : {}) }))),
      })),
      given: addresses.some(a => a.prefix === route.prefix && network(a.ip, a.prefix) === route.dst),
      networkGiven: networks.has(route.dst),
      mask: prefixToMask(route.prefix),
      feedback: [route.dst, prefixToMask(route.prefix), route.via, ...(route.alternatives ?? [])].filter(Boolean),
      distance: route.distance == null ? null : new RegExp(`(?<![\\p{L}\\d.#/])${route.distance}(?![\\p{L}\\d]|\\.\\d)`, 'u'),
    })),
    ids: task.network.devices.flatMap(d => d.interfaces.flatMap(f => [f.id, ...Object.values(f.labels ?? {})])).filter(Boolean),
    values: new Set([...addresses.flatMap(a => [a.ip, network(a.ip, a.prefix)]),
      ...task.network.endpoints.map(e => e.ip),
      ...routes.flatMap(r => [r.dst, r.via, ...(r.alternatives ?? [])]),
    ].filter(v => v && v !== '0.0.0.0')),
    addresses: [...instanceAddresses(task)].filter(ip => ip !== '0.0.0.0'),
    shown: new Set(routers.flatMap(a => [a.ip, network(a.ip, a.prefix)])),
  };
}

/** Inspect a single semantic surface. Givens do not exempt commands or placeholders.
 * Kinds: 'text', 'feedback', 'placeholder', 'given' (diagram and interface
 * givens), 'rules' (examples must use documentation addresses) and
 * 'text-equivalent' (a given that may name only router interface addresses and
 * segment networks, as the diagram does). */
export function leaks(task, surface, kind = 'text', context = {}) {
  return inspect(surface, kind, context, leakFacts(task));
}

function inspect(surface, kind, context, facts) {
  let text = normalise(surface);
  const found = new Set();
  const { routes } = facts;
  if (['ping', 'strip', 'path', 'demonstration', 'hint-question', 'hint-evidence', 'network-feedback'].includes(kind)) {
    if (dotted(text).length) found.add('address-in-names-only');
    if (facts.ids.some(id => has(text, id))) found.add('interface-in-names-only');
  }
  if (kind === 'example' || kind === 'rules') {
    const ips = dotted(text).filter(ip => maskToPrefix(ip) === null);
    if (ips.some(ip => !DOCUMENTATION.some(([net, p]) => contains(net, p, ip)))) found.add('non-documentation-address');
    if (ips.some(ip => facts.values.has(ip))) found.add('task-value-in-example');
    if (kind === 'example') return [...found];
  }
  if (kind === 'submitted') {
    const syntax = syntaxList.find(s => s.id === context.syntax);
    const expected = syntax && context.answer ? Object.values(context.answer).flat().filter(Boolean).map(r => normalise(syntax.command(r))).join(' ') : null;
    if (expected === null || text !== expected) found.add('unproven-submission');
    return [...found];
  }

  if (kind === 'placeholder' && facts.addresses.some(ip => has(text, ip))) found.add('bank-address-in-placeholder');
  if (kind === 'rules' && dotted(text).some(ip => maskToPrefix(ip) === null && !DOCUMENTATION.some(([net, p]) => contains(net, p, ip)))) found.add('non-documentation-address');
  if (kind === 'text-equivalent') {
    // Router interfaces and their networks; a provider's own address isn't drawn.
    if (dotted(text).some(ip => !facts.shown.has(ip))) found.add('address-not-on-diagram');
  }
  if (kind === 'rules') {
    // The generic RouterOS default route, as the Cisco rules have always shown
    // `ip route 0.0.0.0 0.0.0.0 [NEXT-HOP аплінку]`: a definition, not a task's
    // answer (no gateway). Exact literal only; a real gateway still fails.
    text = text.replace('dst-address=0.0.0.0/0 gateway=[GATEWAY аплінку]', '');
  }
  // Round 5 repair v1 (spec 5b-1 v2 §1, routingPlaceholders.defaultRoute): a default-route row's
  // placeholder is the one allowed constant, «0.0.0.0/0» (Cisco: «0.0.0.0» in network and mask); the
  // row's title already says «Маршрут за замовчуванням». Exact attribute values only.
  if (kind === 'placeholder' && ['0.0.0.0/0', '0.0.0.0'].includes(text)) return [...found];
  const givenKind = kind === 'given' || kind === 'text-equivalent';
  for (const { route, vias, given, networkGiven, mask } of routes) {
    for (const { via, commands } of vias) {
      for (const command of commands) if (has(text, command)) found.add('reference-command');
      if (via && !givenKind && has(text, route.dst) && has(text, via)) found.add('destination-and-gateway');
    }
    if (!given && (has(text, `${route.dst}/${route.prefix}`)
      || (route.prefix !== 0 && has(text, route.dst) && has(text, mask))
      || (route.prefix !== 0 && !networkGiven && has(text, route.dst)))) found.add('hidden-destination');
  }
  if (kind === 'feedback') {
    // Exact format examples/policy ranges required by spec v2, independent of the bank.
    // Never remove a dynamic string from uk.js: that would hide regressions in the copy.
    text = text.replace('/24 = 255.255.255.0, /30 = 255.255.255.252', '')
      .replace('Основному маршруту distance не потрібна (або 1).', '')
      .replace('від 2 до 255', '')
      .replace('від 2 до 254', '')
      .replace('Distance має бути цілим числом від 1 до 254.', '');
    for (const { feedback, distance } of routes) {
      for (const value of feedback) if (has(text, value)) found.add('reference-value-in-feedback');
      if (distance?.test(text)) found.add('reference-distance-in-feedback');
    }
  }
  return [...found];
}

/** Wrong-answer corpus: named cases plus every interface/accepted hop and distance edge. */
export function wrongAnswers(task, router, index, syntax) {
  const route = task.variant.referenceRoutes[router][index];
  const row = task.variant.scaffold[router][index];
  const base = syntax.fromRoute(route, row.needDist);
  const destination = ip => syntax.id === 'cisco' ? { net: ip } : { dst: `${ip}/${route.prefix}` };
  const list = [{}, { ...base, ...destination('203.0.113.0') }, { ...base, ...destination(fromInt(toInt(route.dst) + 1)) }];
  const device = task.network.devices.find(d => d.id === router);
  const addresses = task.network.devices.flatMap(d => d.interfaces.filter(i => i.address).map(i => i.address.ip));
  const gateways = new Set([...addresses, ...Object.values(task.variant.referenceRoutes).flatMap(rows => rows.flatMap(r => [r.via, ...(r.alternatives ?? [])])), '', '203.0.113.254', '10.0.0.02', 'not-an-ip']);
  for (const iface of device.interfaces.filter(i => i.address)) {
    const { ip, prefix } = iface.address;
    list.push({ ...base, ...destination(ip) });
    gateways.add(network(ip, prefix)); gateways.add(broadcast(ip, prefix));
    if (prefix < 30) gateways.add(fromInt(toInt(network(ip, prefix)) + 50));
  }
  for (const gw of gateways) list.push({ ...base, gw });
  for (const dist of ['', '0', '1', '2', '5', '255', '256', '-1', '2.5', 'two', '01']) list.push({ ...base, dist });
  for (const name of syntax.fields.filter(f => !f.distance || row.needDist).map(f => f.name)) {
    list.push({ ...base, [name]: '' }, { ...base, [name]: 'malformed' }, { ...base, [name]: `  ${base[name]}  ` });
  }
  if (syntax.id === 'routeros') list.push({ ...base, blackhole: true, gw: '' }, { ...base, blackhole: false }, { ...base, blackhole: true, gw: '203.0.113.1' });
  else list.push({ ...base, gw: 'Null0' }, { ...base, gw: 'null 0' });
  if (syntax.id === 'cisco') for (const mask of ['255.255.0.0', '/24', '255.0.255.0']) list.push({ ...base, mask });
  else for (const dst of ['203.0.113.0/33', '203.0.113.0/024', '203.0.113.1/24', '203.0.113.0', '192.168.002.0/24', '0.0.0.00.0.0.0']) list.push({ ...base, dst });
  return [...new Map(list.map(values => [JSON.stringify(values), values])).values()];
}
