// Frozen matcher from 526cd5f for differential testing. Do not regenerate
// from the prepared matcher when changing its implementation.
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

/** Inspect a single semantic surface. Givens do not exempt commands or placeholders.
 * Kinds: 'text', 'feedback', 'placeholder', 'given' (diagram and interface
 * givens), 'rules' (examples must use documentation addresses) and
 * 'text-equivalent' (a given that may name only router interface addresses and
 * segment networks, as the diagram does). */
export function leaks(task, surface, kind = 'text', context = {}) {
  let text = normalise(surface);
  const found = new Set();
  const routes = Object.values(task.variant.referenceRoutes).flat();
  if (['ping', 'strip', 'path', 'demonstration', 'hint-question', 'hint-evidence', 'network-feedback'].includes(kind)) {
    if (dotted(text).length) found.add('address-in-names-only');
    const ids = task.network.devices.flatMap(d => d.interfaces.flatMap(f => [f.id, ...Object.values(f.labels ?? {})])).filter(Boolean);
    if (ids.some(id => has(text, id))) found.add('interface-in-names-only');
  }
  if (kind === 'example' || kind === 'rules') {
    const ips = dotted(text).filter(ip => maskToPrefix(ip) === null);
    if (ips.some(ip => !DOCUMENTATION.some(([net, p]) => contains(net, p, ip)))) found.add('non-documentation-address');
    const taskValues = new Set([
      ...task.network.devices.flatMap(d => d.interfaces.filter(f => f.address).flatMap(f => [f.address.ip, network(f.address.ip, f.address.prefix)])),
      ...task.network.endpoints.map(e => e.ip),
      ...routes.flatMap(r => [r.dst, r.via, ...(r.alternatives ?? [])]),
    ].filter(v => v && v !== '0.0.0.0'));
    if (ips.some(ip => taskValues.has(ip))) found.add('task-value-in-example');
    if (kind === 'example') return [...found];
  }
  if (kind === 'submitted') {
    const syntax = syntaxList.find(s => s.id === context.syntax);
    const expected = syntax && context.answer ? Object.values(context.answer).flat().filter(Boolean).map(r => normalise(syntax.command(r))).join(' ') : null;
    if (expected === null || text !== expected) found.add('unproven-submission');
    return [...found];
  }

  const addresses = task.network.devices.flatMap(d => d.interfaces.filter(i => i.address).map(i => i.address));
  if (kind === 'placeholder' && [...instanceAddresses(task)].some(ip => ip !== '0.0.0.0' && has(text, ip))) found.add('bank-address-in-placeholder');
  if (kind === 'rules' && dotted(text).some(ip => maskToPrefix(ip) === null && !DOCUMENTATION.some(([net, p]) => contains(net, p, ip)))) found.add('non-documentation-address');
  if (kind === 'text-equivalent') {
    // Router interfaces and their networks; a provider's own address isn't drawn.
    const routers = task.network.devices.filter(d => d.kind === 'router').flatMap(d => d.interfaces.filter(i => i.address).map(i => i.address));
    const shown = new Set(routers.flatMap(a => [a.ip, network(a.ip, a.prefix)]));
    if (dotted(text).some(ip => !shown.has(ip))) found.add('address-not-on-diagram');
  }
  if (kind === 'rules') {
    // The generic RouterOS default route, as the Cisco rules have always shown
    // `ip route 0.0.0.0 0.0.0.0 [NEXT-HOP аплінку]`: a definition, not a task's
    // answer (no gateway). Exact literal only; a real gateway still fails.
    text = text.replace('dst-address=0.0.0.0/0 gateway=[GATEWAY аплінку]', '');
  }
  const givenKind = kind === 'given' || kind === 'text-equivalent';
  for (const route of routes) {
    for (const via of [route.via, ...(route.alternatives ?? [])]) {
      for (const syntax of syntaxList) if (has(text, normalise(syntax.command({ ...route, via, ...(route.distance === 1 ? { distance: undefined } : {}) })))) found.add('reference-command');
      if (via && !givenKind && has(text, route.dst) && has(text, via)) found.add('destination-and-gateway');
    }
    const given = addresses.some(a => a.prefix === route.prefix && network(a.ip, a.prefix) === route.dst);
    if (!given && (has(text, `${route.dst}/${route.prefix}`)
      || (route.prefix !== 0 && has(text, route.dst) && has(text, prefixToMask(route.prefix)))
      || (route.prefix !== 0 && !addresses.some(a => network(a.ip, a.prefix) === route.dst) && has(text, route.dst)))) found.add('hidden-destination');
  }
  if (kind === 'feedback') {
    // Exact format examples/policy ranges required by spec v2, independent of the bank.
    // Never remove a dynamic string from uk.js: that would hide regressions in the copy.
    text = text.replace('/24 = 255.255.255.0, /30 = 255.255.255.252', '')
      .replace('Основному маршруту distance не потрібна (або 1).', '')
      .replace('від 2 до 255', '')
      .replace('від 2 до 254', '')
      .replace('Distance має бути цілим числом від 1 до 254.', '');
    for (const route of routes) {
      for (const value of [route.dst, prefixToMask(route.prefix), route.via, ...(route.alternatives ?? [])].filter(Boolean)) if (has(text, value)) found.add('reference-value-in-feedback');
      if (route.distance != null && new RegExp(`(?<![\\p{L}\\d.#/])${route.distance}(?![\\p{L}\\d]|\\.\\d)`, 'u').test(text)) found.add('reference-distance-in-feedback');
    }
  }
  return [...found];
}

