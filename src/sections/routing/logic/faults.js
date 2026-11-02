import { faultCatalogue, ambiguousSites, faultGates } from '../../../engine/faults.js';
import { validateRoute } from '../../../engine/route-validation.js';
import { ping, addressOf } from '../../../engine/forward.js';
import { network, toInt, fromInt, contains } from '../../../engine/ip.js';
import { check, solution as reference } from './static.js';
import { assessObjective, assessUnknownSpace } from './objectives.js';
import { faultCauseText, faultRequirements } from '../uk.js';

export const clone = value => structuredClone(value);
export const levelCodes = Object.freeze({
  1: Object.freeze(['missing-route', 'wrong-destination']),
  2: Object.freeze(['missing-route', 'wrong-destination', 'wrong-next-hop', 'default-wrong-way']),
  3: Object.freeze(['missing-route', 'wrong-destination', 'wrong-next-hop', 'default-wrong-way']),
});
export const catalogue = faultCatalogue([
  { code: 'missing-route' }, { code: 'wrong-destination' }, { code: 'wrong-next-hop' }, { code: 'default-wrong-way' },
], entry => ({ text: faultCauseText[entry.code],
  sites: task => sites(task).filter(s => s.code === entry.code),
  plant: (baseline, site) => plant(baseline, { ...site, code: entry.code }),
  repair: (faulty, baseline, site) => repair(faulty, baseline, { ...site, code: entry.code }),
}));

/** One allowlist supplies both checking constraints and visible requirements.
 * No bank prose, advice, scaffold or reference row enters this projection. */
export function publicPolicy(record, variant) {
  const scenarios = record.scenarios ?? [], normal = scenarios.find(s => s.id === 'normal');
  if (scenarios.length !== 1 || !normal || normal.downLinks.length) return null;
  const probes = record.probes ?? [], ids = new Set(normal.probeIds);
  if (!probes.length || ids.size !== probes.length || normal.probeIds.length !== ids.size || probes.some(p => !ids.has(p.id))) return null;
  const blocking = (variant.objectives ?? []).filter(o => o.severity === 'blocks');
  if (!blocking.length || blocking.some(o => !['coverage', 'internet-coverage'].includes(o.type)
    || o.scenarioId !== 'normal' || !o.probeIds?.length || o.probeIds.some(id => !ids.has(id)))) return null;
  if (blocking.some(o => o.type === 'internet-coverage' && o.probeIds.some(id => {
    const p = probes.find(p => p.id === id);
    return !p.coverage?.from || !record.network.endpoints.some(e => e.id === p.to && e.kind === 'internet');
  }))) return null;
  return {
    probes: probes.map(p => ({ id: p.id, from: p.from, to: p.to, ...(p.coverage ? { coverage: clone(p.coverage) } : {}) })),
    scenarios: [{ id: 'normal', downLinks: [], probeIds: [...normal.probeIds] }],
    objectives: blocking.map(o => ({ id: o.id, type: o.type, severity: 'blocks', scenarioId: 'normal',
      probeIds: [...o.probeIds], ...(o.exclude ? { exclude: o.exclude.map(({ dst, prefix }) => ({ dst, prefix })) } : {}) })),
  };
}
export function requirements(policy) {
  return policy.objectives.filter(o => o.type === 'internet-coverage').map(o => faultRequirements.internet(
    [...new Set(o.probeIds.map(id => { const p = policy.probes.find(p => p.id === id); return `${p.coverage.from.dst}/${p.coverage.from.prefix}`; }))],
    (o.exclude ?? []).map(p => `${p.dst}/${p.prefix}`)));
}
export function eligibility(record, variant) {
  return !!publicPolicy(record, variant) && Object.values(variant.referenceRoutes).flat().every(r => r.discard !== true);
}

/** Plain, regenerated ids: no reference id, hint, alternatives, role or slot. */
export function plainRoutes(routes) {
  return Object.fromEntries(Object.entries(routes).sort(([a], [b]) => a.localeCompare(b)).map(([router, rows], ri) => [router, [...rows].sort((a, b) => toInt(a.dst) - toInt(b.dst) || a.prefix - b.prefix
    || toInt(a.via) - toInt(b.via) || (a.distance ?? 1) - (b.distance ?? 1)).map((r, i) => ({
    id: `route-${ri + 1}-${i + 1}`, dst: r.dst, prefix: r.prefix, via: r.via,
    ...(r.distance !== undefined ? { distance: r.distance } : {}),
  }))]));
}
const semantic = routes => Object.entries(routes).map(([router, rows]) => [router,
  rows.map(({ dst, prefix, via, distance = 1, discard = false }) => ({ dst, prefix, via, distance, discard }))]);
export const routeKey = routes => JSON.stringify(semantic(routes));

/** Only real neighbours on connected links can be next-hop plantings. */
function neighbours(net, router) {
  const own = net.devices.find(d => d.id === router);
  return net.devices.filter(d => d.id !== router).flatMap(d => d.interfaces.filter(f => f.address
    && own.interfaces.some(o => o.segmentId === f.segmentId && (o.address || o.dhcp))));
}
export function sites(task, baseline = reference(task)) {
  const result = [];
  for (const [router, rows] of Object.entries(baseline)) rows.forEach((route, index) => {
    const add = (code, changed, slot = '') => result.push({ code, router, index, changed,
      key: `${code}/${router}/${index}${slot ? `/${slot}` : ''}` });
    add('missing-route');
    if (route.prefix > 0) {
      const changed = network(fromInt((toInt(route.dst) + 2 ** (32 - route.prefix)) >>> 0), route.prefix);
      if (changed !== route.dst && !rows.some(r => r.dst === changed && r.prefix === route.prefix)) add('wrong-destination', changed);
    }
    for (const iface of neighbours(task.network, router)) if (iface.address.ip !== route.via)
      add(route.prefix === 0 ? 'default-wrong-way' : 'wrong-next-hop', iface.address.ip, iface.id);
  });
  return result;
}
export function plant(baseline, site) {
  const routes = clone(baseline), row = routes[site.router][site.index];
  if (site.code === 'missing-route') routes[site.router].splice(site.index, 1);
  else if (site.code === 'wrong-destination') row.dst = site.changed;
  else if ((site.code === 'wrong-next-hop' && row.prefix > 0) || (site.code === 'default-wrong-way' && row.prefix === 0)) row.via = site.changed;
  else throw new RangeError('invalid-fault');
  return routes;
}
/** Undo exactly the planted row change; used only for gates/reveal. */
export function repair(faulty, baseline, site) {
  const routes = clone(faulty), original = baseline[site.router][site.index];
  if (site.code === 'missing-route') routes[site.router].splice(site.index, 0, clone(original));
  else if (site.code === 'wrong-destination') routes[site.router][site.index].dst = original.dst;
  else if (['wrong-next-hop', 'default-wrong-way'].includes(site.code)) routes[site.router][site.index].via = original.via;
  else throw new RangeError('invalid-fault');
  return routes;
}
/** Classify the semantic change, independently of its supplied code. */
export function classify(baseline, faulty) {
  const changed = Object.keys(baseline).filter(r => routeKey({ [r]: baseline[r] }) !== routeKey({ [r]: faulty[r] }));
  if (changed.length !== 1) return [];
  const router = changed[0], a = baseline[router], b = faulty[router];
  if (a.length === b.length + 1 && a.some((_, i) => routeKey({ [router]: a.filter((_, j) => j !== i) }) === routeKey({ [router]: b }))) return ['missing-route'];
  if (a.length !== b.length) return [];
  const deltas = a.flatMap((row, index) => ['dst', 'prefix', 'via', 'distance', 'discard'].filter(k => row[k] !== b[index][k]).map(field => ({ index, field })));
  if (deltas.length !== 1) return [];
  const { index, field } = deltas[0];
  return field === 'dst' ? ['wrong-destination'] : field === 'via' ? [a[index].prefix === 0 ? 'default-wrong-way' : 'wrong-next-hop'] : [];
}
export function observe(task, routes) {
  const normal = task.record.scenarios.find(s => s.id === 'normal');
  return task.record.probes.filter(p => normal.probeIds.includes(p.id)).map(p => ({ id: p.id, from: p.from, to: p.to,
    ...ping(task.network, routes, p.from, p.to) }));
}
/** Learner evidence includes the whole visible configuration, ordered pings
 * and both complete walks, not only the first failing stop or planter diff. */
export function evidenceKey(routes, observation) {
  const neutral = plainRoutes(routes);
  // Recompute trace ids from neutral rows so missing reference indices cannot
  // distinguish two otherwise identical visible configurations.
  const ids = new Map(Object.entries(routes).flatMap(([r, rows]) => rows.map(row => [row.id, neutral[r].find(n => n.dst === row.dst && n.prefix === row.prefix && n.via === row.via && (n.distance ?? 1) === (row.distance ?? 1))?.id])));
  return JSON.stringify([semantic(neutral), observation],
    (key, value) => key === 'routeId' ? ids.get(value) ?? value : value);
}
/** Compare single-edit explanations without a reference table. Every trial
 * must satisfy the same public probes, whole-prefix requirements and safety.
 * A destination row explaining no remote topology prefix is an extra unexplained
 * fact: prefer replacing it over adding a route and leaving that fact behind.
 * Ties across causes remain ambiguous; none is removed by a symptom heuristic. */
export function explanations(net, routes, observation, policy) {
  const addresses = net.devices.filter(d => d.kind === 'router').flatMap(d => d.interfaces)
    .filter(f => f.address).map(f => f.address);
  const prefixes = new Map(addresses.map(a => [`${network(a.ip, a.prefix)}/${a.prefix}`, { dst: network(a.ip, a.prefix), prefix: a.prefix }]));
  // Include public summaries: the common enclosing block of any two attached
  // networks. This recognises legitimate summaries without consulting advice.
  for (const a of addresses) for (const b of addresses) {
    let prefix = Math.min(a.prefix, b.prefix);
    while (prefix > 0 && network(a.ip, prefix) !== network(b.ip, prefix)) prefix--;
    if (prefix > 0) prefixes.set(`${network(a.ip, prefix)}/${prefix}`, { dst: network(a.ip, prefix), prefix });
  }
  prefixes.set('0.0.0.0/0', { dst: '0.0.0.0', prefix: 0 });
  const unsupported = trial => Object.entries(trial).reduce((sum, [router, rows]) => {
    const own = net.devices.find(d => d.id === router).interfaces;
    return sum + rows.filter(row => row.prefix > 0 && !addresses.some(a => a.prefix >= row.prefix
      && contains(row.dst, row.prefix, a.ip) && !own.some(f => f.address && f.address.prefix === a.prefix
        && network(f.address.ip, a.prefix) === network(a.ip, a.prefix)))).length;
  }, 0);
  const orderedProbes = [...policy.probes].sort((a, b) => Number(observation.find(p => p.id === a.id)?.ok) - Number(observation.find(p => p.id === b.id)?.ok));
  const failedLegs = observation.filter(p => !p.ok).map(p => ({ leg: p.request.ok ? p.reply : p.request,
    dst: addressOf(net, p.request.ok ? p.from : p.to) }));
  const found = [], seen = new Set();
  const consider = (code, router, index, row) => {
    if (validateRoute(net, router, row)) return;
    const trial = { ...routes, [router]: [...routes[router]] };
    if (index === null) trial[router].push(row); else trial[router][index] = row;
    const key = `${code}:${routeKey(trial)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const observed = [];
    for (const p of orderedProbes) {
      const result = { id: p.id, scenarioId: 'normal', ...ping(net, trial, p.from, p.to) };
      if (!result.ok) return;
      observed.push(result);
    }
    if (policy.objectives.some(o => !assessObjective(net, trial, o, observed, policy.probes, policy.scenarios).ok)) return;
    if (assessUnknownSpace(net, trial, policy.scenarios).some(o => !o.ok)) return;
    found.push({ code, router, index, row, unexplained: unsupported(trial) });
  };
  // A changing router must appear in a failed walk (including its stop).
  const touched = new Set(observation.filter(p => !p.ok).flatMap(p => [p.request, p.reply].filter(Boolean)
    .flatMap(leg => [...leg.hops.map(h => h.deviceId), leg.stop?.deviceId])));
  for (const [router, rows] of Object.entries(routes)) {
    if (!touched.has(router)) continue;
    const hops = neighbours(net, router);
    const failuresHere = failedLegs.filter(({leg}) => leg.hops.some(h => h.deviceId === router) || leg.stop?.deviceId === router);
    for (const dst of prefixes.values()) for (const hop of hops) {
      if (failuresHere.some(f => contains(dst.dst, dst.prefix, f.dst)) && !rows.some(r => r.dst === dst.dst && r.prefix === dst.prefix))
        consider('missing-route', router, null, { id: 'explanation-new', ...dst, via: hop.address.ip });
    }
    rows.forEach((row, index) => {
      if (row.prefix > 0) for (const dst of new Set(addresses.map(a => network(a.ip, row.prefix)))) {
        if (failuresHere.some(f => contains(dst, row.prefix, f.dst)) && dst !== row.dst && !rows.some(r => r.dst === dst && r.prefix === row.prefix))
          consider('wrong-destination', router, index, { ...row, dst });
      }
      for (const hop of hops) if (failuresHere.some(f => f.leg.hops.some(h => h.deviceId === router && h.routeId === row.id)) && hop.address.ip !== row.via)
        consider(row.prefix === 0 ? 'default-wrong-way' : 'wrong-next-hop', router, index, { ...row, via: hop.address.ip });
    });
  }
  const best = Math.min(...found.map(f => f.unexplained));
  return found.filter(f => f.unexplained === best);
}
export function visibleCauses(net, routes, observation, policy) {
  return [...new Set(explanations(net, routes, observation, policy).map(f => f.code))].sort();
}
// Small private cache for repeated create/restore/options tooling on the same
// deterministic instance. Content keys and detached copies prevent bank edits
// or tooling mutations from reusing a stale analysis. Never serialized.
const analyses = new Map();
export function analyse(task) {
  if (!eligibility(task.record, task.variant)) throw new RangeError('ineligible-variant');
  const key = JSON.stringify([task.network, task.record.probes, task.record.scenarios, task.variant]);
  if (analyses.has(key)) return clone(analyses.get(key));
  const policy = publicPolicy(task.record, task.variant);
  const baseline = reference(task), healthy = check(task, baseline).ok;
  if (!healthy) throw new RangeError('unhealthy-baseline');
  const candidates = sites(task, baseline).map(site => {
    const faulty = plant(baseline, site), observation = observe(task, faulty), failed = observation.filter(p => !p.ok);
    const classified = classify(baseline, faulty), visible = visibleCauses(task.network, faulty, observation, policy);
    const gates = faultGates({ healthy, observable: failed.length > 0,
      symptom: site.code !== 'wrong-next-hop' || failed.some(p => [p.request?.stop?.code, p.reply?.stop?.code].some(c => ['loop', 'ttl-exceeded'].includes(c))),
      // Exact semantic equality to the already checked healthy baseline proves
      // canonical fixability without rerunning the same full assessment per site.
      fixable: healthy && routeKey(repair(faulty, baseline, site)) === routeKey(baseline), valid: Object.entries(faulty).every(([r, rows]) => rows.every(row => !validateRoute(task.network, r, row))),
      visibleCause: visible.length === 1 && visible[0] === site.code,
      identifiableChange: classified.length === 1 && classified[0] === site.code,
    });
    return { site, faulty, observation, visible, signature: evidenceKey(faulty, observation), gates, valid: healthy && failed.length > 0 && classified.length === 1 && Object.entries(faulty).every(([r, rows]) => rows.every(row => !validateRoute(task.network, r, row))) };
  });
  for (const c of candidates) {
    c.ambiguousWith = ambiguousSites(c, candidates);
    if (c.ambiguousWith.length) c.gates.push('ambiguous-evidence');
    c.accepted = !c.gates.length;
  }
  const result = { baseline, candidates };
  if (analyses.size >= 16) analyses.delete(analyses.keys().next().value);
  analyses.set(key, clone(result));
  return result;
}
