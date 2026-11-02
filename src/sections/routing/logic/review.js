import { frozenFor } from './generated.js';
import { check } from './static.js';
import { compressedRows, fullySafe, hasSafeShape, routeCounts } from './table-tools.js';
import { actionKey, equalForwarding, forwardingMap } from '../../../engine/forwarding-map.js';
import { unknownSpace } from '../../../engine/coverage.js';
import { blockSize, network, toInt } from '../../../engine/ip.js';

const resultFor = frozenFor;

/** Explicit reveal. The UI must gate this by the earned exact instance. */
export function shortest(task, bank) {
  const result = resultFor(task, bank);
  if (!result) throw new RangeError('No frozen optimiser result for this instance');
  return structuredClone(result.answer);
}

function apply(answer, candidates) {
  const edited = { ...answer };
  for (const c of candidates) edited[c.tip.routerId] = c.rows ?? (edited[c.tip.routerId] ?? []).filter(r => r?.id !== c.tip.routeId);
  return edited;
}

function compatible(a, b) {
  return a.tip.routerId !== b.tip.routerId || (a.tip.scope === 'route' && b.tip.scope === 'route' && a.tip.routeId !== b.tip.routeId);
}

/** Both single and cumulative edits compare every edited router to the original
 * in every scenario. A mixed pair uses exact equality on exact-only routers. */
function equivalent(task, original, edited, candidates, originals) {
  for (const routerId of new Set(candidates.map(c => c.tip.routerId))) {
    const ignored = candidates.some(c => c.tip.routerId === routerId && c.unknownOnly) ? unknownSpace(task.network) : [];
    for (const [i, options] of [{ downLinks: [] }, ...(task.record.scenarios ?? []).filter(s => s.downLinks.length).map(s => ({ downLinks: s.downLinks }))].entries()) {
      const key = `${routerId}:${i}`;
      if (!originals.has(key)) originals.set(key, forwardingMap(task.network, original, routerId, options));
      if (!equalForwarding(originals.get(key), forwardingMap(task.network, edited, routerId, options), ignored)) return false;
    }
  }
  return true;
}

function* candidates(task, answer, accepted) {
  const routers = task.network.devices.filter(d => Object.hasOwn(task.variant.scaffold, d.id));
  const claimed = new Set();
  const deletion = (code, routerId, routeId, unknownOnly = false) => ({ tip: { code, scope: 'route', routerId, routeId, params: { routerId } }, unknownOnly });
  for (const device of routers) {
    const seen = new Set();
    for (const row of (answer[device.id] ?? []).filter(Boolean)) {
      const signature = `${row.dst}/${row.prefix}|${actionKey(row.discard === true ? { kind: 'discard' } : { kind: 'hop', via: row.via })}|${row.distance ?? 1}`;
      if (seen.has(signature) && row.id) {
        claimed.add(`${device.id}:${row.id}`);
        yield deletion('duplicate-route', device.id, row.id);
      }
      seen.add(signature);
    }
  }
  for (const device of routers) for (const row of (answer[device.id] ?? []).filter(Boolean)) {
    const key = `${device.id}:${row.id}`;
    if (row.id && !claimed.has(key) && device.interfaces.some(f => f.address && f.address.prefix === row.prefix && network(f.address.ip, f.address.prefix) === row.dst)) {
      claimed.add(key); yield deletion('route-to-connected', device.id, row.id);
    }
  }
  for (const device of routers) {
    const rows = compressedRows(task, answer, device.id);
    const now = (answer[device.id] ?? []).filter(Boolean).length, could = rows?.length;
    const accounted = accepted.filter(c => c.tip.routerId === device.id && ['duplicate-route', 'route-to-connected'].includes(c.tip.code)).length;
    if (rows && could < now && now - could > accounted) yield { tip: { code: 'same-in-fewer', scope: 'router', routerId: device.id, params: { routerId: device.id, now, could } }, rows };
  }
  const unknown = unknownSpace(task.network);
  for (const device of routers) for (const row of (answer[device.id] ?? []).filter(Boolean)) {
    const start = toInt(row.dst), end = start + blockSize(row.prefix);
    if (row.id && !claimed.has(`${device.id}:${row.id}`) && unknown.some(([a, b]) => a <= start && end <= b)) {
      yield deletion('no-destination-route', device.id, row.id, true);
    }
  }
}

/** Resumable assessment. Each yield is a safe progress snapshot with
 * {tips,star:false,finished:false,phase}. 'candidate-ready' precedes a full
 * candidate check; 'pair-ready' precedes combined validation. Continue next()
 * to resume; the return value is {tips,star}.
 * Pass {assessment} to reuse check(task, answer) for this exact answer snapshot.
 * No edit is applied to the caller's answer. */
export function* reviewSteps(task, answer, { assessment, bank } = {}) {
  assessment ??= check(task, answer);
  if (!assessment.ok) return { tips: [], star: false };
  const accepted = [], originals = new Map();
  const snapshot = phase => ({ tips: accepted.slice(0, 1).map(c => c.tip), star: false, finished: false, phase });
  yield snapshot('assessment');
  for (const candidate of candidates(task, answer, accepted)) {
    // A replacement may never be composed with another edit on its router.
    if (accepted.length && !compatible(accepted[0], candidate)) continue;
    const edited = apply(answer, [candidate]);
    if (!equivalent(task, answer, edited, [candidate], originals)) continue;
    yield snapshot('candidate-ready');
    if (fullySafe(check(task, edited))) {
      if (!accepted.length) accepted.push(candidate);
      else {
        const pair = [accepted[0], candidate], combined = apply(answer, pair);
        yield snapshot('pair-ready');
        if (equivalent(task, answer, combined, pair, originals) && fullySafe(check(task, combined))) return { tips: pair.map(c => c.tip), star: false };
      }
    }
    yield snapshot('candidate-checked');
  }
  if (accepted.length) return { tips: [accepted[0].tip], star: false };
  const count = routeCounts(task, answer).total, frozenResult = resultFor(task, bank);
  if (frozenResult && count > frozenResult.total) return { tips: [{ code: 'shorter-known', scope: 'task', params: { total: frozenResult.total, count } }], star: false };
  return { tips: [], star: Boolean(frozenResult && count <= frozenResult.total && !assessment.findings.some(f => f.severity === 'advice')
    && task.network.devices.filter(d => Object.hasOwn(task.variant.scaffold, d.id)).every(d => hasSafeShape(task, answer, d.id))) };
}

/** Synchronous budget: at most three full candidate checks, plus pair validation.
 * An incomplete result cannot award a star; reviewSteps can finish it in idle
 * callbacks. With a clock (`options.now`, e.g. () => performance.now()) the
 * budget is also 300 ms; the initial assessment and cheap equivalence work
 * count as time. Logic reads no clock of its own. */
export function review(task, answer, options) {
  const now = options?.now ?? (() => 0);
  const started = now(), steps = reviewSteps(task, answer, options);
  let evaluated = 0, latest = { tips: [], star: false };
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    latest = { tips: step.value.tips, star: false };
    if (step.value.phase === 'candidate-ready') {
      if (evaluated >= 3 || now() - started >= 300) return latest;
      evaluated++;
    }
  }
}
