import { renumber, generatorVersion } from './generated.js';
import { ui } from '../uk.js';
import { hintLadder, presentCheck, describeTrace } from '../syntax/presentation.js';
export { presentCheck, describeTrace } from '../syntax/presentation.js';
export { validateRoute } from '../../../engine/route-validation.js';
export { guidedView, slotId, slotDestination, putRoute, compactRoutes } from './routes.js';
import { prefixToMask, network } from '../../../engine/ip.js';
import { ping } from '../../../engine/forward.js';
import { normIp, normalizeAnswer } from './normalise.js';
import { reasonCodes } from './rowReasons.js';
import { assessObjective, assessUnknownSpace } from './objectives.js';

export const id = 'routing.static';
export const version = 1;
export const codes = ['ok', 'unsupported', 'legacy-hint', 'no-route', 'no-device', 'discarded', 'loop', 'ttl-exceeded', 'return-path-failed', 'unsupported-ecmp', 'wrong-path', 'coverage-missing', 'objective-not-met', 'internet-coverage-missing', 'unknown-space-loops', 'distance-order', 'redundant-default', 'form-errors', 'missing-return-route', 'hint-question', 'hint-evidence', 'hint-example', 'could-use-default', 'could-summarise', 'duplicate-route', 'route-to-connected', 'same-in-fewer', 'no-destination-route', 'shorter-known', ...reasonCodes];

/** Resolve a string stored verbatim per syntax. */
export function textFor(value, syntax = 'cisco') {
  return typeof value === 'string' ? value : value?.[syntax];
}

/** Create a syntax-independent task. The caller supplies bank identity.
 * @param {import('../../../engine/network.js').TaskRecord} record
 * @param {{variantId?:string,bank?:object,bankId?:string,bankRevision?:number,seed?:number|null}} params
 */
export function create(record, { variantId, bank, bankId = bank?.bankId, bankRevision = bank?.bankRevision, seed = null } = {}) {
  if (seed !== null) {
    record = renumber(record, variantId ?? record.variants[0].id, seed, bank);
    if (record.infeasible) return record;
  }
  const variant = record.variants.find(v => v.id === (variantId ?? record.variants[0].id));
  if (!variant) throw new RangeError(`Unknown variant: ${variantId}`);
  const identity = { formatVersion: 1, exerciseId: id, bankId, bankRevision, taskId: record.id, variantId: variant.id, generatorVersion: seed === null ? null : generatorVersion, seed };
  return { record, variant, network: record.network, identity, instanceKey: JSON.stringify(identity) };
}

/** Transitional row grading: comparison rules equal each app; reference values stay private.
 * @param {object} task
 * @param {string} routerId
 * @param {number} rowIndex
 * @param {object} fields
 * @param {'cisco'|'routeros'} syntax
 */
export function checkRow(task, routerId, rowIndex, fields, syntax) {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError(`Unknown syntax: ${syntax}`);
  const route = task.variant.referenceRoutes[routerId]?.[rowIndex];
  if (!route) throw new RangeError(`Unknown row: ${routerId}/${rowIndex}`);
  const norm = syntax === 'cisco' ? normIp : normalizeAnswer;
  const gateways = [route.discard === true ? 'Null0' : route.via, ...(route.alternatives ?? [])];
  const gwOk = route.discard === true
    ? syntax === 'cisco' ? /^null0$/i.test(norm(fields.gw)) : fields.blackhole === true && !norm(fields.gw)
    : fields.blackhole !== true && gateways.some(gw => norm(fields.gw) === norm(gw));
  const needDist = route.distance != null;
  const dAns = norm(fields.dist);
  const distOk = !needDist || (route.distance > 1 ? /^\d+$/.test(dAns) && Number(dAns) >= 2 && Number(dAns) <= 255 : dAns === '' || dAns === '1');
  if (syntax === 'routeros') {
    const dstOk = norm(fields.dst) === norm(`${route.dst}/${route.prefix}`);
    return { ok: dstOk && gwOk && distOk, dstOk, gwOk, distOk, needDist };
  }
  const net = route.dst, cidr = route.prefix, mask = prefixToMask(cidr);
  const netOk = norm(fields.net) === norm(net);
  const maskOk = norm(fields.mask) === mask && !norm(fields.mask).includes('/');
  return { ok: netOk && maskOk && gwOk && distOk, netOk, maskOk, gwOk, distOk, needDist };
}

/** Full routing assessment; demonstrations are evidence only. No scaffold or
 * reference route is consulted, and advice never changes completion.
 */
export function check(task, answer) {
  return assess(task, answer, true);
}

function assess(task, answer, withAdvice) {
  if (!task.record.probes?.length) return { ok: false, complete: false, code: 'unsupported', findings: [{ code: 'unsupported', severity: 'blocks' }] };
  const definitions = task.record.probes;
  const scenarios = task.record.scenarios ?? [];
  const run = (probe, scenarioId, downLinks = []) => ({ id: probe.id, from: probe.from, to: probe.to, scenarioId, ...ping(task.network, answer, probe.from, probe.to, { downLinks }) });
  const probes = definitions.filter(probe => !scenarios.some(s => s.probeIds.includes(probe.id))).map(probe => run(probe, null));
  for (const scenario of scenarios) for (const probeId of scenario.probeIds) {
    probes.push(run(definitions.find(p => p.id === probeId), scenario.id, scenario.downLinks));
  }
  const safety = assessUnknownSpace(task.network, answer, scenarios);
  const objectives = (task.variant.objectives ?? []).map(objective => {
    const result = assessObjective(task.network, answer, objective, probes, definitions, scenarios);
    if (objective.type === 'summary' && result.params.reason === 'too-wide') {
      result.params.loops = safety.some(s => s.params.missing.some(m => m.cycle?.includes(objective.routerId)));
    }
    return result;
  });
  const genericAdvice = [];
  for (const device of withAdvice ? task.network.devices.filter(d => d.kind === 'router') : []) {
    const neighbours = task.network.devices.filter(d => d.id !== device.id && d.interfaces.some(f => device.interfaces.some(own => own.segmentId === f.segmentId)));
    const rows = (answer?.[device.id] ?? []).filter(Boolean);
    const forbidden = task.variant.objectives.some(o => o.type === 'no-default' && o.routerId === device.id);
    const destinations = new Set(rows.filter(r => r.prefix > 0 && !device.interfaces.some(f => f.address && f.address.prefix === r.prefix && network(f.address.ip, f.address.prefix) === r.dst)).map(r => `${r.dst}/${r.prefix}`));
    if (neighbours.length === 1 && !forbidden && ![...rows, ...(task.network.supplied?.[device.id] ?? [])].some(r => r.prefix === 0) && destinations.size >= 2) {
      const via = neighbours[0].interfaces.find(f => f.address && device.interfaces.some(own => own.segmentId === f.segmentId))?.address.ip;
      if (!via) continue;
      const candidate = { ...answer, [device.id]: [{ dst: '0.0.0.0', prefix: 0, via }] };
      const tested = assess(task, candidate, false);
      if (tested.ok && tested.evidence.objectives.every(o => o.ok)) genericAdvice.push({ code: 'could-use-default', severity: 'advice', entity: device.id, params: { routerId: device.id } });
    }
  }
  // A default the DHCP lease already gives: it works, and needn't be written.
  for (const [routerId, supplied] of Object.entries(withAdvice ? task.network.supplied ?? {} : {})) {
    const given = (supplied ?? []).filter(r => r.prefix === 0);
    if ((answer?.[routerId] ?? []).some(r => r?.prefix === 0 && r.discard !== true && given.some(g => g.via === r.via))) genericAdvice.push({ code: 'redundant-default', severity: 'advice', entity: routerId, params: { routerId } });
  }
  const findings = [
    ...Object.entries(answer ?? {}).flatMap(([routerId, rows]) => (rows ?? []).filter(r => r && (!Number.isInteger(r.distance ?? 1) || (r.distance ?? 1) < 1 || (r.distance ?? 1) > 254)).map(() => ({ code: 'invalid-distance', severity: 'blocks', entity: routerId, params: { routerId } }))),
    ...Object.entries(answer ?? {}).flatMap(([routerId, rows]) => (rows ?? []).filter(r => r && ((r.discard === true && 'via' in r) || (r.discard !== undefined && typeof r.discard !== 'boolean'))).map(r => ({ code: r.discard === true ? 'discard-with-gateway' : 'invalid-discard', severity: 'blocks', entity: routerId, params: { routerId } }))),
    ...genericAdvice,
    ...probes.filter(p => !p.ok).map(p => ({ code: p.code, severity: 'blocks', entity: p.id, params: { scenarioId: p.scenarioId } })),
    ...objectives.filter(o => !o.ok).map(o => ({ code: o.code, severity: o.severity, entity: o.id, params: { ...o.params, scenarioId: o.scenarioId } })),
    ...safety.filter(o => !o.ok).map(o => ({ code: o.code, severity: o.severity, entity: o.id, params: { ...o.params, scenarioId: o.scenarioId } })),
  ];
  const demonstrations = (task.record.demonstrations ?? []).map(probe => run(probe, null));
  const failed = findings.find(f => f.severity === 'blocks');
  return { ok: !failed, complete: !failed, code: failed?.code ?? 'ok', findings, evidence: {
    taskId: task.identity.taskId, probes, objectives, safety, advice: findings.filter(f => f.severity === 'advice'), demonstrations,
    scenarios: scenarios.map(s => ({ id: s.id, downLinks: [...s.downLinks], ok: probes.filter(p => p.scenarioId === s.id).every(p => p.ok) && [...objectives, ...safety].filter(o => o.scenarioId === s.id && o.severity === 'blocks').every(o => o.ok) })),
  } };
}

/** Three hints for the current parsed rows; null/unparseable rows are ignored.
 * @returns {{code:string,params:object,rung:number,provenance:string}[]}
 */
export function hints(task, answer = {}, syntax = 'cisco') {
  const parsed = Object.fromEntries(Object.entries(answer ?? {}).map(([router, rows]) => [router, (rows ?? []).filter(r => r && typeof r.dst === 'string' && Number.isInteger(r.prefix) && (r.discard === true || typeof r.via === 'string'))]));
  return hintLadder(task, check(task, parsed), syntax);
}

/** Reference Routes, copied so editable answers cannot mutate the bank. */
export function solution(task) {
  return Object.fromEntries(Object.entries(task.variant.referenceRoutes).map(([router, rows]) => [router, rows.map(({ hint, alternatives, ...route }) => ({ ...route }))]));
}

/** Ordered rows per router, without destination addresses or gateways. */
export function scaffold(task, syntax = 'cisco') {
  return Object.fromEntries(Object.entries(task.variant.scaffold).map(([router, rows]) => [router, rows.map(row => ({ label: row.suggestion ? ui.shared.summarySuggestion : textFor(row.label, syntax), fields: [...(syntax === 'cisco' ? ['net', 'mask', 'gw'] : ['dst', 'gw']), ...(row.needDist ? ['dist'] : [])], needDist: row.needDist, dest: { ...row.dest, segments: [...row.dest.segments] }, ...(row.role ? { role: row.role } : {}), ...(row.discard !== undefined ? { discard: row.discard } : {}) }))]));
}

export default { id, version, codes, create, check, hints, solution, scaffold, checkRow, presentCheck, describeTrace };
