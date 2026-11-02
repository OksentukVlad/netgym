import { makeRng } from '../../../engine/rng.js';
import { fixThenCause } from '../../../engine/faults.js';
import { validateRoute } from '../../../engine/route-validation.js';
import { addressOf } from '../../../engine/forward.js';
import { prefixToMask, contains } from '../../../engine/ip.js';
import { check as checkRouting, codes as routingCodes } from './static.js';
import { presentCheck as presentRouting, describeTrace as describeRoutingTrace } from '../syntax/presentation.js';
import { syntaxes } from '../syntax/index.js';
import { clone, plainRoutes, routeKey, levelCodes, eligibility, publicPolicy, requirements } from './faults.js';
import { frozenAnalysis, generatorVersion } from './faults-frozen.js';
import { faultText, faultCauseText, faultExample, networkUi } from '../uk.js';

export const id = 'routing-faults', version = 1;
export const codes = Object.freeze([...new Set([...routingCodes, 'invalid-config', 'ok', 'form-errors', 'fault-cause-required', 'fault-cause-other', 'invalid-cause',
  'fault-hint-question', 'fault-hint-evidence', 'fault-hint-example'])]);
const instances = new WeakMap(), checked = new WeakMap();

export function eligibleVariants(record, bank, level) {
  return record.variants.filter(v => v.levels.includes(level)).flatMap(v => {
    const source = bank.tasks.find(r => r.id === v.taskId), variant = source?.variants.find(s => s.id === v.variantId);
    return source && variant && eligibility(source, variant) ? [{ ...v, source, variant }] : [];
  });
}
function build(record, { bank, seed = 0, level = 1, taskId, variantId, faultCode, siteKey } = {}) {
  if (!bank?.tasks || record?.id !== 'routing.faults' || record.version !== 1
    || !Number.isInteger(seed) || seed < 0 || seed >= 10000 || !levelCodes[level]) throw new RangeError('invalid-record');
  const eligible = eligibleVariants(record, bank, level).filter(v => (!taskId || v.taskId === taskId) && (!variantId || v.variantId === variantId));
  const selected = makeRng(`${seed}:routing-faults:task:${level}`).pick(eligible);
  if (!selected) throw new RangeError('ineligible-variant');
  const { internal, baseline, candidates } = frozenAnalysis(record, bank, selected.source, selected.variantId, seed);
  const pool = candidates.filter(c => c.accepted && levelCodes[level].includes(c.site.code));
  const forced = faultCode !== undefined || siteKey !== undefined;
  const chosen = forced ? pool.find(c => (!faultCode || c.site.code === faultCode) && (!siteKey || c.site.key === siteKey))
    : makeRng(`${seed}:routing-faults:site:${level}`).pick(pool);
  if (!chosen) throw new RangeError('fault-not-in-pool');
  const identity = { formatVersion: 1, exerciseId: id, bankId: bank.bankId, bankRevision: bank.bankRevision,
    recordVersion: record.version, taskId: selected.taskId, variantId: selected.variantId, level, seed, generatorVersion };
  const policy = publicPolicy(internal.record, internal.variant);
  // No spread of a bank record, variant, reference row, hints or scaffold.
  const task = { identity, instanceKey: JSON.stringify(identity), title: faultText.title,
    instructions: faultText.instructions, level, requirements: requirements(policy),
    network: clone(internal.network),
    probes: clone(policy.probes), scenarios: clone(policy.scenarios),
    initialRoutes: plainRoutes(chosen.faulty) };
  const assessment = { network: task.network, identity, record: { probes: policy.probes, scenarios: policy.scenarios, demonstrations: [] },
    variant: { objectives: policy.objectives } };
  const canonical = plainRoutes(baseline);
  const rowAt = (routes, visible) => {
    const row = routes[chosen.site.router][chosen.site.index];
    return clone(visible[chosen.site.router].find(r => r.dst === row.dst && r.prefix === row.prefix
      && r.via === row.via && (r.distance ?? 1) === (row.distance ?? 1)));
  };
  const metadata = { task, internal: assessment,
    change: { router: chosen.site.router, before: chosen.site.code === 'missing-route' ? null : rowAt(chosen.faulty, task.initialRoutes),
      after: rowAt(baseline, canonical) }, baseline: canonical, site: chosen.site, candidates,
    faulty: clone(task.initialRoutes), record, bank };
  instances.set(task, metadata);
  return metadata;
}
/** Tooling-only forcing and metadata. Never put this object in learner state. */
export const inspect = (record, params) => build(record, params);
export function create(record, { faultCode, siteKey, ...params } = {}) { return build(record, params).task; }
function metadata(task) {
  const value = instances.get(task);
  if (!value) throw new RangeError('restore-instance-with-bank');
  return value;
}
/** Rehydrate JSON learner state using trusted bank data, never serialized
 * private metadata. This also checks the public task against deterministic replay. */
export function restore(task, record, bank) {
  if (task.identity?.generatorVersion !== generatorVersion) throw new RangeError('instance-mismatch: unsupported faults generator');
  const rebuilt = create(record, { bank, ...task.identity });
  if (JSON.stringify(rebuilt) !== JSON.stringify(task)) throw new RangeError('instance-mismatch');
  instances.set(task, instances.get(rebuilt));
  return task;
}
export function initialAnswer(task) { return { routes: clone(task.initialRoutes), cause: null }; }

/** Accept neutral rows OR free-mode text rows: fields[router] = [{id, values}].
 * Every submitted row is validated before any behaviour verdict can pass. */
export function parseAnswer(task, answer = initialAnswer(task), syntax = 'cisco') {
  const adapter = syntaxes[syntax];
  if (!adapter) throw new RangeError('invalid-syntax');
  const routes = {}, findings = [], input = answer.fields ?? answer.routes;
  const routers = task.network.devices.filter(d => d.kind === 'router').map(d => d.id);
  const invalid = (router, rowId, code) => findings.push({ code, severity: 'blocks', entity: router, params: { routerId: router, rowId } });
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid(null, null, 'invalid-config');
  for (const router of Object.keys(input ?? {})) if (!routers.includes(router)) invalid(router, null, 'invalid-config');
  for (const router of routers) {
    routes[router] = [];
    const rows = input?.[router] ?? [];
    if (!Array.isArray(rows)) { invalid(router, null, 'invalid-config'); continue; }
    const ids = new Set();
    for (const [index, row] of rows.entries()) {
      const rowId = row?.id ?? `input-${index + 1}`;
      if (ids.has(rowId)) { invalid(router, rowId, 'invalid-config'); continue; }
      ids.add(rowId);
      let values;
      if (answer.fields) values = row?.values;
      else if (row && typeof row === 'object') values = syntax === 'cisco'
        ? { net: row.dst, mask: prefixToMask(row.prefix), gw: row.discard === true ? 'Null0' : row.via, dist: String(row.distance ?? 1) }
        : { dst: `${row.dst}/${row.prefix}`, gw: row.via, dist: String(row.distance ?? 1), ...(row.discard === true ? { blackhole: true } : {}) };
      let code = !values || typeof values !== 'object' ? 'invalid-config' : adapter.validateFields(values);
      const route = !code ? adapter.toRoute(values) : null;
      code ||= validateRoute(task.network, router, route);
      if (!answer.fields && row?.discard === true && Object.hasOwn(row, 'via')) code = 'discard-with-gateway';
      if (!answer.fields && row?.discard !== undefined && typeof row.discard !== 'boolean') code = 'invalid-discard';
      if (code) invalid(router, rowId, code);
      if (route && !code) routes[router].push({ id: rowId, ...route });
    }
  }
  return { routes, findings };
}

function evaluate(task, answer, syntax) {
  const { routes, findings } = parseAnswer(task, answer, syntax);
  const result = checkRouting(metadata(task).internal, routes);
  if (findings.length) Object.assign(result, { ok: false, complete: false, code: 'form-errors', findings,
    formErrors: findings.map(f => ({ routerId: f.entity, rowId: f.params.rowId, code: f.code })) });
  return { result, routes };
}
function makeSnapshot(task, result, label) {
  return { label, invalid: result.code === 'form-errors', rows: task.probes.map(p => {
    const observed = result.evidence.probes.find(r => r.id === p.id);
    return { id: p.id, from: p.from, to: p.to, ok: observed.ok, code: observed.code,
      request: clone(observed.request), reply: clone(observed.reply) };
  }) };
}
export function pingList(task) {
  const { result } = evaluate(task, initialAnswer(task), 'cisco');
  return makeSnapshot(task, result, faultText.initial);
}
/** Step one succeeds as fixOk=true, but ok/complete remain false until a
 * cause passes. Step two always rechecks the submitted routes. */
export function check(task, answer = initialAnswer(task), { step = 'fix', syntax = 'cisco' } = {}) {
  if (!['fix', 'cause'].includes(step)) throw new RangeError('invalid-step');
  const { result, routes } = evaluate(task, answer, syntax);
  result.evidence.snapshot = makeSnapshot(task, result, faultText.checked);
  let verdict;
  if (!result.ok) verdict = { ...result, step: 'fix', fixOk: false };
  else {
    const judged = fixThenCause(result, () => ({ cause: step === 'fix' ? null : answer.cause,
      expected: metadata(task).site.code, allowed: causeOptions(task).map(o => o.value) }));
    verdict = { ...judged, step: judged.ok ? 'done' : 'cause', fixOk: true };
  }
  checked.set(verdict, { task, key: routeKey(routes), routes: clone(routes), syntax });
  return verdict;
}
function currentPass(task, result, answer, syntax) {
  const proof = checked.get(result);
  if (!proof || proof.task !== task || !result.fixOk) return false;
  const parsed = parseAnswer(task, answer, syntax ?? proof.syntax);
  return !parsed.findings.length && proof.key === routeKey(parsed.routes);
}
function causeOptions(task) {
  const m = metadata(task);
  // Only causes with an accepted witness on this exact variant and level.
  const plausible = [...new Set(m.candidates.filter(c => c.accepted && levelCodes[task.level].includes(c.site.code)).map(c => c.site.code))];
  return makeRng(`${task.identity.seed}:routing-faults:options:${task.identity.taskId}:${task.level}`)
    .shuffle(plausible).map(value => ({ value, label: faultCauseText[value] }));
}
export function options(task, field, { result, answer = initialAnswer(task), syntax } = {}) {
  return field === 'cause' && currentPass(task, result, answer, syntax) ? causeOptions(task) : [];
}
/** Observation wording always follows the failing leg, including reply loops. */
export function stopEvidence(task, snapshot) {
  const probe = snapshot.rows.find(p => !p.ok);
  if (!probe) return null;
  const direction = probe.request.ok ? 'reply' : 'request', leg = probe[direction], stop = leg.stop;
  const repairRouter = task.network.devices.some(d => d.id === stop.deviceId && d.kind === 'router') ? stop.deviceId
    : leg.hops.findLast(h => task.network.devices.some(d => d.id === h.deviceId && d.kind === 'router'))?.deviceId;
  return { probeId: probe.id, direction, router: stop.deviceId, repairRouter, next: stop.nextDeviceId,
    destination: addressOf(task.network, direction === 'reply' ? probe.from : probe.to), code: stop.code };
}
export function hints(task, answer, { result, snapshot: observed, rung = 2, assisted = false } = {}) {
  const snapshot = observed ?? result?.evidence.snapshot ?? pingList(task), stop = stopEvidence(task, snapshot);
  const fixed = !stop && currentPass(task, result, answer ?? initialAnswer(task));
  const list = [{ rung: 1, code: 'fault-hint-question', text: stop ? faultText.stopped(stop) : faultText.compare, params: stop ?? {} },
    { rung: 2, code: 'fault-hint-evidence', text: fixed ? faultText.causeMove : stop ? faultText.move : faultText.scopeMove,
      params: { fixed, noStop: !stop } }];
  if (rung >= 3 && assisted) list.push({ rung: 3, code: 'fault-hint-example', assisted: true,
    text: faultExample(metadata(task).site.code), params: { example: faultExample(metadata(task).site.code) } });
  return list.slice(0, Math.max(0, rung));
}
export function solution(task) {
  const m = metadata(task), before = initialAnswer(task), after = { routes: clone(m.baseline), cause: m.site.code };
  return { ...after, causeText: faultCauseText[m.site.code], assisted: true,
    change: clone(m.change),
    before: { routes: before.routes, snapshot: pingList(task) },
    after: { routes: clone(after.routes), snapshot: check(task, after).evidence.snapshot } };
}
/** Use existing coverage/safety wording if a whole-prefix or universal safety
 * check blocks even though sampled host pings pass. Return only one finding. */
export function feedback(task, result, syntax = 'cisco') {
  if (result.code === 'form-errors') return networkUi.formErrors;
  const snapshot = result.evidence?.snapshot, stop = snapshot && stopEvidence(task, snapshot);
  if (stop) {
    // Diagnose only the submitted, visible table. Never read the planted site
    // or the healthy table to name a row before the explicit reveal.
    const routes = checked.get(result)?.routes;
    const router = stop.repairRouter ?? stop.router;
    const remote = task.network.devices.filter(d => d.id !== router).flatMap(d => d.interfaces).filter(f => f.address);
    const unrelated = (routes?.[router] ?? []).filter(r => r.prefix > 0
      && !contains(r.dst, r.prefix, stop.destination)
      && !remote.some(f => f.address.prefix >= r.prefix && contains(r.dst, r.prefix, f.address.ip)));
    if (stop.code === 'no-route' && unrelated.length === 1)
      return faultText.wrongDestination({ router, destination: stop.destination, ...unrelated[0] });
    return faultText.stopped(stop);
  }
  if (result.code === 'fault-cause-other') return faultText.otherCause;
  if (result.code === 'fault-cause-required') return faultText.chooseCause;
  if (result.ok) return faultText.complete;
  const finding = presentRouting(metadata(task).internal, result, syntax).firstFailure;
  return finding?.code === 'internet-coverage-missing' ? faultText.internetFailure(finding.params.router) : finding?.text ?? result.code;
}
/** Existing PathLayer DTO (device/segment ids) for any original or checked row. */
export function traceFor(task, row, syntax = 'cisco') {
  const result = { ok: row.ok, findings: [], evidence: { probes: [{ ...row, scenarioId: 'normal' }],
    objectives: [], safety: [], advice: [], scenarios: [], demonstrations: [] } };
  return presentRouting(metadata(task).internal, result, syntax).lines[0].trace;
}
export function describeTrace(task, row, syntax = 'cisco') {
  return describeRoutingTrace(row, task.network, syntax);
}
export function describe(task, { answer, result, syntax = 'cisco' } = {}) {
  const lines = [task.title, task.instructions, ...(task.requirements ?? [])];
  for (const device of task.network.devices) for (const iface of device.interfaces)
    if (iface.address) lines.push(`${device.id} ${iface.labels[syntax]}: ${iface.address.ip}/${iface.address.prefix}`);
  const routes = answer ? parseAnswer(task, answer, syntax).routes : task.initialRoutes;
  for (const [router, rows] of Object.entries(routes)) for (const row of rows) lines.push(`${router}: ${syntaxes[syntax].command(row)}`);
  const snapshot = result?.evidence.snapshot ?? pingList(task);
  lines.push(snapshot.label);
  for (const row of snapshot.rows) lines.push(`${row.from} → ${row.to}: ${row.ok ? '✓' : '✕'}`);
  return lines;
}
export default { id, version, codes, create, restore, check, initialAnswer, options, pingList, hints, solution, describe, feedback, describeTrace, traceFor };
