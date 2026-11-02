import { ambiguousSites, faultGates, fixThenCause } from '../../../engine/faults.js';
import { object } from '../../../engine/l2.js';
import { compileL3 } from '../../../engine/l3-config.js';
import { makeRng } from '../../../engine/rng.js';
import { observeVlan, vlanEvidenceKey, observableVlan, hasUnmodelled } from '../../../engine/vlan-evidence.js';
import { clone, validSeed, vendors, generateNetwork, reference, compileAll, label } from './model.js';
import { generateRoute } from './route-model.js';
import * as ports from './ports.js';
import * as route from './route.js';
import { catalogue, sites, plant, repair, changes } from './faults.js';
import { causeText, faultText, faultExample } from '../uk.js';
export const id = 'vlan-faults', version = 1;
export const codes = Object.freeze([...new Set([...ports.codes, ...route.codes, 'fault-cause-other', 'fault-cause-required',
  'invalid-cause', 'fault-hint-question', 'fault-hint-evidence', 'fault-hint-example'])]);
const privateInstances = new WeakMap();
const only = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
export function validRecord(r) {
  return only(r, ['id', 'version', 'variants']) && r.id === 'vlan.faults' && r.version === 1
    && Array.isArray(r.variants) && r.variants.length > 0 && new Set(r.variants.map(v => v?.id)).size === r.variants.length
    && r.variants.every(v => only(v, ['id', 'title', 'placements', 'objective', 'task', 'levels', 'syntaxes'])
      && typeof v.id === 'string' && typeof v.title === 'string'
      && Array.isArray(v.levels) && v.levels.length && new Set(v.levels).size === v.levels.length && v.levels.every(n => [1, 2, 3].includes(n))
      && Array.isArray(v.syntaxes) && v.syntaxes.length && new Set(v.syntaxes).size === v.syntaxes.length && v.syntaxes.every(s => vendors.includes(s))
      && (v.task !== undefined ? [1, 2, 3, 4].includes(v.task) && !v.levels.includes(1) && (v.task !== 4 || v.syntaxes.every(s => s === 'routeros'))
        : Array.isArray(v.placements) && v.placements.length >= 2 && v.placements.length <= 3
          && (!v.levels.includes(1) || v.placements.length === 2) && v.placements.every(p => Array.isArray(p) && p.length && p.length <= 6 && p.every(g => [0, 1, 2].includes(g)))
          && v.placements.flat().length >= 4 && v.placements.flat().length <= 8 && [null, undefined, 'local-c', 'transit-b'].includes(v.objective)));
}
export function compile(task, configuration) {
  if (task.taskNumber) return compileL3(task.topology, configuration, task.vendor, { gateways: task.networks.map(n => n.gateway) });
  return { topology: task.topology, ...compileAll(task.topology, configuration, task.vendor) };
}
export function evaluate(task, configuration) {
  const compiled = compile(task, configuration);
  const result = (task.taskNumber ? route : ports).evaluate(task, compiled, { syntax: task.vendor, answer: configuration });
  // Configure-exercise diagnoses name causes. Keep their walks and stop codes,
  // but never forward diagnosis fields through the diagnosis exercise adapter.
  for (const f of result.findings) if (f.params) { delete f.params.diagnosis; delete f.params.location; }
  for (const probe of result.evidence.probes) delete probe.diagnosis;
  return result;
}
export function grid(task, answer = initialAnswer(task)) {
  return observeVlan(task, compile(task, answer?.configuration));
}
const levelAllows = (task, site) => task.level === 3 || catalogue.find(c => c.code === site.code).layer === (task.level === 1 ? 2 : 3);
const findingKey = f => JSON.stringify([f.entity, f.field, f.code, f.severity, f.params]);
function findingsMatch(baseline, faulty, mutations) {
  // Automatic CPU tagging advice depends on VLAN-interface configuration,
  // even though the compiler attaches that advice to the VLAN table.
  const near = f => mutations.some(m => m.path[0] === f.entity && ((f.code === 'bridge-tag-implicit' && m.path[1] === 'vlanIfs') || !f.field || m.path.slice(1).join('.').startsWith(f.field) || f.field.startsWith(m.path.slice(1).join('.'))));
  return JSON.stringify(baseline.filter(f => !near(f)).map(findingKey).sort()) === JSON.stringify(faulty.filter(f => !near(f)).map(findingKey).sort());
}

/** Enumerate all codes/sites before choosing. Every other code participates
 * in identifiability, including faults outside this level's selection pool. */
export function analyse(task, baseline) {
  const compiled = compile(task, baseline), healthy = evaluate(task, baseline);
  if (!healthy.ok || hasUnmodelled(observeVlan(task, compiled))) throw new RangeError('unhealthy-baseline');
  const candidates = sites(task, baseline).map(site => {
    const faulty = plant(baseline, site, task.vendor), state = compile(task, faulty), observation = observeVlan(task, state);
    const mutations = changes(baseline, faulty);
    const valid = mutations.length > 0 && !state.findings.some(f => f.severity === 'blocks')
      && findingsMatch(compiled.findings, state.findings, mutations) && observableVlan(observation) && !hasUnmodelled(observation);
    return { site, faulty, mutations, valid, observation, signature: vlanEvidenceKey(observation) };
  });
  for (const c of candidates) {
    c.ambiguousWith = ambiguousSites(c, candidates);
    c.accepted = faultGates({ valid: c.valid, identifiable: !c.ambiguousWith.length, level: levelAllows(task, c.site) }).length === 0;
  }
  return candidates;
}

function build(record, { variantId, seed = 0, vendor = 'cisco', syntax, level = 1, faultCode, siteKey } = {}) {
  vendor = syntax ?? vendor;
  if (!validRecord(record) || !validSeed(seed) || !vendors.includes(vendor) || ![1, 2, 3].includes(level)) throw new RangeError('invalid-record');
  const eligible = record.variants.filter(v => v.levels.includes(level) && v.syntaxes.includes(vendor));
  const shape = variantId ? eligible.find(v => v.id === variantId) : makeRng(`${seed}:shape`).pick(eligible);
  if (!shape) throw new RangeError('invalid-record');
  const identity = { formatVersion: 1, exerciseId: id, taskId: record.id, recordVersion: record.version, shape: shape.id, vendor, level, seed, generatorVersion: 1 };
  // Retry seeds never replace the public identity. Reconstruction replays the
  // same bounded search; neither the fault nor a retry count enters the key.
  for (let retry = 0; retry < 8; retry++) {
    const generatedSeed = retry ? `${seed}:retry:${retry}` : seed;
    const network = shape.task ? generateRoute(shape, generatedSeed) : generateNetwork(shape, generatedSeed);
    const task = { identity, instanceKey: JSON.stringify(identity), title: faultText.title, shapeSpec: clone(shape), vendor, syntax: vendor, level, ...network };
    // Disclose the device capability irrespective of which fault is selected.
    const dynamicBridgeTagged = makeRng(`${seed}:capability`).pick([false, true]);
    if (vendor === 'routeros') for (const d of task.topology.devices.filter(d => d.kind !== 'host')) d.dynamicBridgeTagged = dynamicBridgeTagged;
    task.capabilities = vendor === 'routeros' ? { dynamicBridgeTagged, label: dynamicBridgeTagged ? 'RouterOS 7.16+' : 'RouterOS до 7.16' } : {};
    const baseline = task.taskNumber ? route.solution(task, vendor) : reference(task, vendor);
    // Healthy user-native switch-to-switch links make a native mismatch
    // observable. Router-facing trunks retain native 1 (G2).
    if (vendor === 'cisco' && level === 3 && !task.taskNumber) for (const c of Object.values(baseline)) for (const p of Object.values(c.ports)) {
      if (p.mode === 'trunk') p.native = task.vids[0];
    }
    const candidates = analyse(task, baseline), pool = candidates.filter(c => c.accepted);
    const forced = faultCode !== undefined || siteKey !== undefined;
    const chosen = forced ? pool.find(c => (faultCode === undefined || c.site.code === faultCode) && (siteKey === undefined || c.site.key === siteKey))
      : makeRng(`${seed}:fault:${retry}`).pick(pool);
    if (!chosen) {
      if (forced) throw new RangeError('fault-not-in-pool');
      continue;
    }
    task.initialConfiguration = clone(chosen.faulty);
    const metadata = { task, baseline, site: chosen.site, faulty: clone(chosen.faulty), candidates, retry, repaired: repair(chosen.faulty, baseline, chosen.site, vendor) };
    privateInstances.set(task, metadata);
    return metadata;
  }
  throw new RangeError('no-identifiable-fault');
}
/** Tooling only. Never pass this return value into learner state or the DOM. */
export const inspect = (record, options) => build(record, options);
export function create(record, options = {}) {
  const { faultCode, siteKey, ...publicOptions } = options;
  return build(record, publicOptions).task;
}
function metadata(task) {
  if (privateInstances.has(task)) return privateInstances.get(task);
  const record = { id: task.identity.taskId, version: task.identity.recordVersion, variants: [task.shapeSpec] };
  const result = build(record, { ...task.identity, variantId: task.identity.shape });
  privateInstances.set(task, result);
  return result;
}
export function initialAnswer(task, syntax = task.vendor) {
  if (syntax !== task.vendor) throw new RangeError('invalid-config');
  return { cause: null, configuration: clone(task.initialConfiguration) };
}
export function options(task, field) {
  if (field !== 'cause') return [];
  const codes = [...new Set(metadata(task).candidates.map(c => c.site.code))];
  return makeRng(`${task.identity.seed}:cause-options:${task.identity.shape}:${task.vendor}`).shuffle(codes)
    .map(value => ({ value, label: causeText[task.vendor][value] }));
}
export function check(task, answer = initialAnswer(task)) {
  const result = evaluate(task, answer?.configuration);
  result.evidence.grid = grid(task, answer);
  return fixThenCause(result, () => ({ cause: answer.cause, expected: metadata(task).site.code,
    allowed: options(task, 'cause').map(o => o.value) }));
}

/** The first two hints use the last checked grid, or the initial symptoms. The
 * worked cause example is built lazily, after an explicit assistance action. */
export function hints(task, answer, { result, rung = 2, assisted = false } = {}) {
  const observation = result?.evidence.grid ?? grid(task), failed = observation.reachability.find(r => !r.observed), leak = observation.isolation.find(r => !r.observed);
  const arrival = leak?.unexpected[0], stop = arrival ? { device: arrival.device, port: arrival.port, code: 'must-not-reach' } : failed?.stops.flat(Infinity).find(Boolean);
  const attachments = result?.evidence.attachments ?? compile(task, task.initialConfiguration).topology.attachments ?? [];
  const named = id => {
    const a = attachments.find(a => a.id === id);
    return a ? `${a.device} ${a.label}` : id ?? '';
  };
  const displayedStop = stop ? { ...stop, port: ['svi', 'bridge', 'nic'].includes(stop.port)
    ? stop.port : label(task.topology, stop.device, stop.port, task.vendor) } : null;
  const list = [
    { rung: 1, code: 'fault-hint-question', params: {} },
    { rung: 2, code: 'fault-hint-evidence', params: { from: named(arrival?.from ?? failed?.from), to: named(arrival?.host ?? failed?.to), stop: displayedStop, reason: failed?.probe?.code ?? null, gridPass: !observation.invalid && !failed && !leak } },
  ];
  if (rung >= 3 && assisted) list.push({ rung: 3, code: 'fault-hint-example', assisted: true, params: { example: faultExample(metadata(task).site.code, task.vendor) } });
  return list.slice(0, Math.max(0, rung));
}
export function solution(task) {
  const { site, baseline, faulty } = metadata(task), configuration = repair(faulty, baseline, site, task.vendor);
  return { cause: site.code, configuration, causeText: causeText[task.vendor][site.code], assisted: true,
    change: { device: site.device, port: site.port, text: faultText.repair(site.code, task.vendor), fields: changes(faulty, configuration) },
    before: { configuration: clone(faulty), grid: observeVlan(task, compile(task, faulty)), result: evaluate(task, faulty) },
    after: { configuration: clone(configuration), grid: observeVlan(task, compile(task, configuration)), result: evaluate(task, configuration) } };
}
export const render = (answer, syntax, topology) => route.render(answer?.configuration ?? answer, syntax, topology);
export function describe(task, { answer, result } = {}) {
  const lines = [faultText.title, faultText.instructions, ...ports.describe(task, { syntax: task.vendor })];
  for (const h of task.topology.hosts) if (h.gateway) lines.push(`${h.device}: шлюз ${h.gateway}.`);
  if (task.management) lines.push(`Керування: VLAN ${task.management.vid}; ${task.management.network}/${task.management.prefix}; шлюз ${task.management.gateway}.`);
  if (task.capabilities.label) lines.push(task.capabilities.label);
  if (answer) for (const [d, text] of Object.entries(render(answer, task.vendor, task.topology))) lines.push(`${d}:\n${text}`);
  if (result?.evidence.grid) for (const r of [...result.evidence.grid.reachability, ...result.evidence.grid.isolation]) lines.push(`${r.id}: ${r.observed ? 'так' : 'ні'}`);
  return lines;
}
export default { id, version, codes, create, check, hints, solution, options, grid, describe, inspect, initialAnswer, render, compile };
