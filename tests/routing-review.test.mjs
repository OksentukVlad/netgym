import { full } from './helpers/sweep-mode.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { tasks } from '../src/banks/routing/tasks.js';
import { create, solution, check, codes } from './helpers/routing.mjs';
import { review, reviewSteps, shortest } from './helpers/routing-review.mjs';
import { compressedRows, fullySafe } from '../src/sections/routing/logic/table-tools.js';
import { equalForwarding, forwardingMap } from '../src/engine/forwarding-map.js';
import { unknownSpace } from '../src/engine/coverage.js';
import { network } from '../src/engine/ip.js';
import { optimiserUi, routePlural, t } from '../src/sections/routing/uk.js';
import { createLeakSweep, leaks } from './helpers/routing-leaks.mjs';

const inspectLeaks = createLeakSweep();


function applyTips(task, answer, tips) {
  const edited = structuredClone(answer);
  for (const tip of tips) {
    if (tip.scope === 'route') edited[tip.routerId] = edited[tip.routerId].filter(r => r.id !== tip.routeId);
    if (tip.scope === 'router') edited[tip.routerId] = compressedRows(task, answer, tip.routerId);
  }
  return edited;
}
function verifyTips(task, answer, tips) {
  const edited = applyTips(task, answer, tips);
  assert.ok(fullySafe(check(task, edited)));
  for (const router of new Set(tips.filter(t => t.routerId).map(t => t.routerId))) {
    const ignore = tips.some(t => t.routerId === router && t.code === 'no-destination-route') ? unknownSpace(task.network) : [];
    for (const options of [{}, ...task.record.scenarios.map(s => ({ downLinks: s.downLinks }))]) assert.ok(equalForwarding(forwardingMap(task.network, answer, router, options), forwardingMap(task.network, edited, router, options), ignore));
  }
}
function crafted(task, code) {
  const answer = shortest(task), routerId = Object.keys(task.variant.scaffold)[0];
  const row = answer[routerId][0];
  if (code === 'duplicate-route') answer[routerId].push({ ...row, id: 'crafted-duplicate' });
  if (code === 'route-to-connected') {
    const iface = task.network.devices.find(d => d.id === routerId).interfaces.find(f => f.address);
    answer[routerId].push({ id: 'crafted-connected', dst: network(iface.address.ip, iface.address.prefix), prefix: iface.address.prefix, discard: true });
  }
  if (code === 'same-in-fewer') {
    // A supplied-default router can have /0 excluded; student first routes are
    // all non-discard hops. Splitting a prefix preserves its exact forwarding.
    const prefix = row.prefix + 1, parts = row.dst.split('.').map(Number);
    const start = parts.reduce((n, v) => n * 256 + v, 0) + 2 ** (32 - prefix);
    const dst = [24, 16, 8, 0].map(shift => (start >>> shift) & 255).join('.');
    answer[routerId] = [{ ...row, prefix }, { ...row, dst, prefix, id: 'crafted-half' }, ...answer[routerId].slice(1)];
  }
  if (code === 'no-destination-route') answer[routerId].push({ id: 'crafted-unknown', dst: '203.0.113.0', prefix: 24, discard: true });
  return answer;
}

test('review: every scoped tip, priorities, concrete safe edits and failed check shape', () => {
  const task = create(tasks[0]);
  assert.deepEqual(review(task, {}), { tips: [], star: false });
  for (const code of ['duplicate-route', 'route-to-connected', 'same-in-fewer', 'no-destination-route']) {
    const answer = crafted(task, code), before = structuredClone(answer), result = review(task, answer);
    assert.ok(check(task, answer).ok);
    assert.deepEqual(result.tips.map(t => t.code), [code]);
    const tip = result.tips[0];
    assert.equal(tip.scope, code === 'same-in-fewer' ? 'router' : 'route');
    assert.equal('routeId' in tip, tip.scope === 'route');
    verifyTips(task, answer, result.tips);
    if (code === 'no-destination-route') assert.equal(equalForwarding(forwardingMap(task.network, answer, 'R1'), forwardingMap(task.network, applyTips(task, answer, result.tips), 'R1')), false);
    assert.deepEqual(answer, before);
  }
  const advised = structuredClone(task);
  advised.variant.objectives.push({ id: 'advice-only', type: 'summary', severity: 'advice', code: 'could-summarise', routerId: 'R1', dst: '192.168.0.0', prefix: 16, destinations: [{ dst: '192.168.2.0', prefix: 24 }] });
  assert.ok(check(advised, solution(advised)).ok);
  assert.deepEqual(review(advised, solution(advised)), { tips: [], star: false });
  const task3 = create(tasks[2]), result = review(task3, solution(task3));
  assert.deepEqual(result, { tips: [], star: true });
});

test('review: a primary with a distance-7 LAN backup is not a no-destination route', () => {
  const task = create(tasks[0]), answer = solution(task), primary = answer.R1[0];
  answer.R1.push({ ...primary, id: 'lan-backup', distance: 7 });
  const steps = reviewSteps(task, answer); let step;
  do { step = steps.next(); } while (!step.done);
  assert.ok(check(task, answer).ok);
  assert.deepEqual(step.value.tips.map(t => t.code), ['shorter-known'], 'neither LAN row lies wholly in unknownSpace');
  assert.ok(step.value.tips.every(t => t.scope === 'task'), 'no primary or backup deletion is offered');
  assert.equal(step.value.star, false);
  // Exact compression still owns ordinary shadowed-row advice.
  const shadowed = solution(task);
  shadowed.R1.push({ ...primary, dst: '192.168.2.0', prefix: 25, id: 'shadowed-specific' });
  assert.deepEqual(review(task, shadowed).tips.map(t => t.code), ['same-in-fewer']);
  const partial = solution(task);
  partial.R1.push({ ...primary, dst: '192.168.0.0', prefix: 16, id: 'partly-unknown' });
  assert.ok(check(task, partial).ok);
  assert.ok(review(task, partial).tips.every(t => t.code !== 'no-destination-route'), 'partial overlap with unknown space is insufficient');
});

test('review: task 3 with a student /13 never earns a star', () => {
  const task = create(tasks[2]), answer = solution(task);
  answer.R1 = [{ ...answer.R1[0], dst: '10.0.0.0', prefix: 13 }];
  assert.ok(fullySafe(check(task, answer)));
  assert.deepEqual(review(task, answer), { tips: [], star: false });
});

test('review: star requires downstream discard protection for the entire summary hole', () => {
  const task = structuredClone(create(tasks[0])), answer = solution(task);
  answer.R1 = [{ ...answer.R1[0], dst: '192.168.2.0', prefix: 23 }];
  // Supplied protection adds no student row or deletion tip, isolating the
  // shared shape predicate from the count and improvement-tip star gates.
  task.network.supplied.R2 = [{ id: 'partial-discard', dst: '192.168.3.0', prefix: 25, discard: true }];
  assert.ok(fullySafe(check(task, answer)));
  assert.deepEqual(review(task, answer), { tips: [], star: false });
  task.network.supplied.R2[0].prefix = 24;
  assert.ok(fullySafe(check(task, answer)));
  assert.deepEqual(review(task, answer), { tips: [], star: true });
});

test('reviewSteps reuses a supplied assessment and equivalent checks normal only once', () => {
  const task = create(tasks[0]), answer = crafted(task, 'duplicate-route'), assessment = check(task, answer);
  const network = { ...task.network };
  let reads = 0;
  Object.defineProperty(network, 'supplied', { get() { reads++; return task.network.supplied; } });
  const untilCandidate = scenarios => {
    reads = 0;
    const steps = reviewSteps({ ...task, network, record: { ...task.record, scenarios } }, answer, { assessment });
    assert.equal(steps.next().value.phase, 'assessment');
    assert.equal(reads, 0, 'no repeated initial check');
    assert.equal(steps.next().value.phase, 'candidate-ready');
    return reads;
  };
  const baseline = untilCandidate([]);
  assert.ok(baseline > 0, 'equivalence actually consulted routing tables');
  assert.equal(untilCandidate(task.record.scenarios), baseline);
  assert.equal(untilCandidate([...task.record.scenarios, { id: 'another-normal', downLinks: [] }]), baseline);
  const failed = reviewSteps(task, answer, { assessment: { ok: false } });
  assert.deepEqual(failed.next(), { done: true, value: { tips: [], star: false } });
  assert.deepEqual(review(task, shortest(task), { assessment: check(task, shortest(task)) }), { tips: [], star: true });
});

test('review: pairs pass together across routers, and replacements never pair with a same-router edit', () => {
  const task = create(tasks[0]), answer = crafted(task, 'duplicate-route');
  answer.R2.push({ ...answer.R2[0], id: 'second-duplicate' });
  const result = review(task, answer);
  assert.equal(result.tips.length, 2); verifyTips(task, answer, result.tips);
  const compressed = crafted(task, 'same-in-fewer');
  compressed.R2.push({ ...compressed.R2[0], id: 'other-router-duplicate' });
  const pair = review(task, compressed);
  assert.deepEqual(pair.tips.map(t => t.code), ['duplicate-route', 'same-in-fewer']);
  verifyTips(task, compressed, pair.tips);
  const sameRouter = crafted(task, 'same-in-fewer');
  sameRouter.R1.push({ id: 'connected', dst: '192.168.1.0', prefix: 24, discard: true });
  const single = review(task, sameRouter);
  assert.equal(single.tips.length, 1); assert.equal(single.tips[0].code, 'route-to-connected');
});

test('review: unsafe pair is skipped in favour of the next safe candidate', () => {
  const task = create(tasks[2], { variantId: 'defaults' }), answer = solution(task);
  answer.R1.push({ ...answer.R1[0], id: 'duplicate-default' }, { id: 'unknown', dst: '203.0.113.0', prefix: 24, discard: true });
  const result = review(task, answer);
  assert.deepEqual(result.tips.map(t => t.routeId), ['duplicate-default', 'unknown']);
  verifyTips(task, answer, result.tips);
});

test('3b shadowed default: equivalence alone cannot authorize removing the required default', () => {
  const task = create(tasks[2], { variantId: 'defaults' }), answer = solution(task), base = answer.R1[0];
  answer.R1.push({ ...base, id: 'lower', prefix: 1 }, { ...base, id: 'upper', dst: '128.0.0.0', prefix: 1 });
  assert.ok(check(task, answer).ok);
  const removed = { ...answer, R1: answer.R1.filter(r => r.id !== base.id) };
  assert.ok(equalForwarding(forwardingMap(task.network, answer, 'R1'), forwardingMap(task.network, removed, 'R1')));
  assert.equal(check(task, removed).ok, false);
  const result = review(task, answer);
  assert.ok(result.tips.every(t => t.routeId !== base.id));
  verifyTips(task, answer, result.tips);
});

test('connected deletion is checked under link failure; backup-preserving compression may also be rejected', () => {
  const task = create(tasks.find(t => t.displayNumber === 15)), answer = solution(task);
  answer.R1.push({ id: 'down-only', dst: '100.64.1.0', prefix: 30, discard: true });
  assert.ok(check(task, answer).ok);
  const steps = reviewSteps(task, answer); let step;
  do { step = steps.next(); } while (!step.done);
  assert.ok(step.value.tips.every(t => t.routeId !== 'down-only'));
  assert.equal(step.value.star, false);
});

test('candidate cap leaves review incomplete; generator resumes and completes without a star', () => {
  const task = structuredClone(create(tasks[0])), answer = solution(task);
  const dests = ['203.0.113.0', '198.51.100.0', '192.0.2.0', '198.18.0.0'];
  for (const [i, dst] of dests.entries()) {
    answer.R1.push({ id: `required-${i}`, dst, prefix: 24, via: '10.0.0.2' });
    task.variant.objectives.push({ id: `specific-${i}`, type: 'specific-to', severity: 'blocks', routerId: 'R1', destinations: [{ dst, prefix: 24 }] });
  }
  assert.ok(check(task, answer).ok);
  assert.deepEqual(review(task, answer), { tips: [], star: false });
  const iterator = reviewSteps(task, answer); let step, ready = 0, pauses = 0;
  do {
    step = iterator.next();
    if (!step.done) { assert.equal(step.value.star, false); if (step.value.phase === 'candidate-ready') ready++; pauses++; }
  } while (!step.done);
  assert.equal(ready, 4); assert.ok(pauses >= 9);
  assert.deepEqual(step.value.tips.map(t => t.code), ['shorter-known']);
});

test('frozen answers have no tips and a star; reveals are defensive; warm review timings include candidates/pairs', () => {
  const measurements = [];
  for (const record of tasks) for (const variant of record.variants) {
    const task = create(record, { variantId: variant.id }), answer = shortest(task);
    assert.deepEqual(review(task, answer), { tips: [], star: true }, variant.code);
    const samples = [], pairSamples = [], pair = crafted(task, 'duplicate-route');
    // Two duplicates on the first router exercise two candidate checks and the
    // combined validation (including all scenarios), in addition to assessment.
    const router = Object.keys(task.variant.scaffold)[0];
    pair[router].push({ ...pair[router][0], id: 'crafted-duplicate-2' });
    review(task, pair);
    for (let i = 0; i < (full ? 3 : 1); i++) {
      let start = performance.now(); assert.deepEqual(review(task, answer), { tips: [], star: true }); samples.push(performance.now() - start);
      start = performance.now(); const r = review(task, pair); pairSamples.push(performance.now() - start);
      assert.equal(r.tips.length, 2); verifyTips(task, pair, r.tips);
    }
    measurements.push({ variant: variant.code, frozenMedianMs: +samples.sort((a,b)=>a-b)[Math.floor(samples.length / 2)].toFixed(2), frozenMaxMs: +Math.max(...samples).toFixed(2), pairMedianMs: +pairSamples.sort((a,b)=>a-b)[Math.floor(pairSamples.length / 2)].toFixed(2), pairMaxMs: +Math.max(...pairSamples).toFixed(2) });
    const copy = shortest(task); Object.values(copy)[0][0].dst = 'tampered'; assert.deepEqual(shortest(task), answer);
  }
  console.log(`Warm review timings: ${JSON.stringify(measurements)}`);
});

test('every review code renders Ukrainian leak-safe copy from crafted answers on every variant', () => {
  for (const record of tasks) for (const variant of record.variants) {
    const task = create(record, { variantId: variant.id });
    for (const code of ['duplicate-route', 'route-to-connected', 'same-in-fewer', 'no-destination-route']) {
      const answer = crafted(task, code), iterator = reviewSteps(task, answer); let step;
      do { step = iterator.next(); } while (!step.done);
      // Some edits violate internet coverage (unknown discard) or form goals
      // (split summary), so render the requested scoped text as well as every
      // actual emitted tip; no reference addresses are ever text parameters.
      const tips = [...step.value.tips, { code, params: { routerId: Object.keys(task.variant.scaffold)[0], now: 8, could: 4 } }, { code: 'shorter-known', params: { total: 4, count: 8 } }];
      for (const tip of tips) {
        assert.ok(codes.includes(tip.code));
        const text = t(`routing.static.${tip.code}`, tip.params);
        assert.ok(!text.startsWith('[')); assert.deepEqual(inspectLeaks(task, text, 'network-feedback'), []);
      }
    }
    assert.deepEqual(inspectLeaks(task, optimiserUi.starTooltip, 'network-feedback'), []);
    // What the screen shows of the search's limits (OPT-1 UI U7): the ★'s line and the reveal's.
    assert.deepEqual(inspectLeaks(task, optimiserUi.searchLimits, 'network-feedback'), []);
    assert.deepEqual(inspectLeaks(task, optimiserUi.bestLine(21), 'network-feedback'), []);
  }
  assert.deepEqual([0,1,2,4,5,11,12,14,21,22,25,111].map(routePlural), ['маршрутів','маршрут','маршрути','маршрути','маршрутів','маршрутів','маршрутів','маршрутів','маршрут','маршрути','маршрутів','маршрутів']);
});
