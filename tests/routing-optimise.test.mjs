import test from 'node:test';
import { full } from './helpers/sweep-mode.mjs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import frozen from '../src/banks/routing/optimiser-results.json' with { type: 'json' };
import executableFrozen from '../src/banks/routing/optimiser-results.js';
import { tasks } from '../src/banks/routing/tasks.js';
import { create, check, solution } from './helpers/routing.mjs';
import { optimise, optimiserVersion } from '../src/sections/routing/logic/optimise.js';
import { routeCounts, compressedRows, routerProblem, fullySafe, hasSafeShape } from '../src/sections/routing/logic/table-tools.js';
import { lookup, trace } from '../src/engine/forward.js';
import { coverSpace } from '../src/engine/coverage.js';
import { toInt } from '../src/engine/ip.js';
import { optimiserHash } from '../tools/optimiser-hash.mjs';

const instances = tasks.flatMap(record => record.variants.map(v => create(record, { variantId: v.id })));

test('frozen optimiser bank: content hash, every scenario/objective/A1, counts and hand comparison', () => {
  assert.deepEqual(executableFrozen, frozen);
  assert.equal(frozen.version, optimiserVersion); assert.equal(frozen.hash, optimiserHash());
  assert.equal(Object.keys(frozen.results).length, 19);
  const expected = { '1': 2, '2': 2, '3': 4, '3b': 3, '4': 4, '5': 6, '6': 2, '7': 6, '8': 15, '8b': 10,
    '9': 11, '10': 9, '11': 6, '12': 4, '13': 2, '14': 4, '15': 2, '16': 20, '17': 21 };
  for (const task of instances) {
    const result = frozen.results[`${task.record.id}/${task.variant.id}`];
    assert.ok(fullySafe(check(task, result.answer)), task.variant.code);
    assert.ok(result.total <= result.referenceTotal);
    assert.deepEqual(routeCounts(task, result.answer), { counts: result.counts, total: result.total });
    assert.equal(routeCounts(task, solution(task)).total, result.referenceTotal);
    assert.equal(result.total, expected[task.variant.code], `hand expectation for ${task.variant.code}`);
  }
});

test('every frozen answer has best-practice shape on every student router', () => {
  for (const task of instances) {
    const { answer } = frozen.results[`${task.record.id}/${task.variant.id}`];
    for (const routerId of Object.keys(task.variant.scaffold)) assert.ok(hasSafeShape(task, answer, routerId), `${task.variant.code}/${routerId}`);
  }
});

test('shape rejects overbroad summaries and peer defaults, including coalesced hop actions', () => {
  const task3 = create(tasks[2]), wide = solution(task3);
  wide.R1 = [{ ...wide.R1[0], dst: '10.0.0.0', prefix: 13 }];
  assert.ok(fullySafe(check(task3, wide)), 'model safety alone allowed this summary');
  assert.deepEqual(coverSpace(task3.network, wide, 'R1', [[toInt('10.5.0.0'), toInt('10.6.0.0')]]).map(p => p.code), ['no-route']);
  assert.equal(hasSafeShape(task3, wide, 'R1'), false);
  const task8b = create(tasks[7], { variantId: 'stub-defaults' }), peer = solution(task8b);
  peer.R2 = compressedRows(task8b, peer, 'R2', true);
  assert.ok(fullySafe(check(task8b, peer)), 'safe peer defaults still fail shape');
  assert.equal(hasSafeShape(task8b, peer, 'R2'), false);
  const triangle = create(tasks[9]), triangleAnswer = solution(triangle);
  triangleAnswer.R1.push({ ...triangleAnswer.R1[0], dst: '0.0.0.0', prefix: 0, id: 'peer-default' });
  assert.equal(hasSafeShape(triangle, triangleAnswer, 'R1'), false);
  // A supplied default and the added summary share one hop action. Checking
  // only a coalesced map piece's first row would overlook the summary.
  const upstream = create(tasks[1]), answer = solution(upstream);
  answer.R1.push({ ...upstream.network.supplied.R1[0], id: 'wide', dst: '203.0.0.0', prefix: 16 });
  assert.equal(hasSafeShape(upstream, answer, 'R1'), false);
  assert.equal(hasSafeShape(upstream, solution(upstream), 'R1'), true);
});

test('task 17 INET /22 has safe shape through the downstream CORE discard', () => {
  const task = create(tasks.find(t => t.displayNumber === 17));
  const { answer } = frozen.results[`${task.record.id}/${task.variant.id}`];
  const hole = [[toInt('172.16.3.0'), toInt('172.16.4.0')]];
  for (const source of [solution(task), answer]) {
    assert.ok(source['R-INET'].some(r => r.dst === '172.16.0.0' && r.prefix === 22));
    assert.ok(source['R-CORE'].some(r => r.dst === '172.16.0.0' && r.prefix === 22 && r.discard));
    for (const options of [{ downLinks: [] }, ...task.record.scenarios]) {
      assert.deepEqual(coverSpace(task.network, source, 'R-INET', hole, options), [
        { deviceId: 'R-CORE', size: 256, code: 'discarded' },
      ]);
    }
    assert.equal(hasSafeShape(task, source, 'R-INET'), true);
  }
});

test('shape requires a downstream discard to cover the entire summary hole', () => {
  const task = create(tasks[0]), answer = solution(task);
  answer.R1 = [{ ...answer.R1[0], dst: '192.168.2.0', prefix: 23 }];
  const hole = [[toInt('192.168.3.0'), toInt('192.168.4.0')]];
  answer.R2.push({ id: 'partial-discard', dst: '192.168.3.0', prefix: 25, discard: true });
  assert.ok(fullySafe(check(task, answer)), 'implicit drops still satisfy model safety');
  assert.deepEqual(coverSpace(task.network, answer, 'R1', hole), [
    { deviceId: 'R2', size: 128, code: 'discarded' },
    { deviceId: 'R2', size: 128, code: 'no-route' },
  ]);
  assert.equal(hasSafeShape(task, answer, 'R1'), false);
  answer.R2.at(-1).prefix = 24;
  assert.equal(hasSafeShape(task, answer, 'R1'), true, 'covering the other half repairs shape');
});

test('shape follows downstream discard protection in every task scenario and rejects ISP arrival', () => {
  const task = structuredClone(create(tasks[0])), answer = solution(task);
  answer.R1 = [{ ...answer.R1[0], dst: '192.168.2.0', prefix: 23 }];
  const peer = task.network.devices.find(d => d.id === 'R2');
  peer.interfaces.push({ id: 'to-sink', segmentId: 'discard-link', address: { ip: '198.18.0.1', prefix: 30 } });
  task.network.devices.push({ id: 'sink', kind: 'router', interfaces: [
    { id: 'from-R2', segmentId: 'discard-link', address: { ip: '198.18.0.2', prefix: 30 } },
  ] });
  answer.R2.push({ id: 'hole-to-sink', dst: '192.168.3.0', prefix: 24, via: '198.18.0.2' });
  answer.sink = [{ id: 'sink-discard', dst: '192.168.3.0', prefix: 24, discard: true }];
  assert.equal(hasSafeShape(task, answer, 'R1'), true, 'protection can span multiple hops');
  task.record.scenarios.push({ id: 'sink-down', downLinks: ['discard-link'], probeIds: [] });
  assert.equal(hasSafeShape(task, answer, 'R1'), false, 'normal protection is insufficient');
  task.record.scenarios.pop();
  task.network.devices.at(-1).kind = 'isp';
  assert.equal(hasSafeShape(task, answer, 'R1'), false, 'ISP arrival is not explicit discard protection');
});

test('task 17 pins the CORE /22 discard and stops the segment-3 failure loop', () => {
  const task = create(tasks.find(t => t.displayNumber === 17)), reference = solution(task);
  const { answer } = frozen.results[`${task.record.id}/${task.variant.id}`];
  const pin = { dst: '172.16.0.0', prefix: 22, action: { kind: 'discard' } };
  for (const source of [reference, answer]) {
    assert.deepEqual(routerProblem(task, source, 'R-CORE').pinned, [pin]);
    for (const dontCare of [false, true]) {
      const rows = compressedRows(task, source, 'R-CORE', dontCare);
      assert.ok(rows.some(r => r.dst === pin.dst && r.prefix === pin.prefix && r.discard));
    }
  }
  assert.ok(answer['R-CORE'].some(r => r.dst === pin.dst && r.prefix === 22 && r.discard));
  const options = { downLinks: ['segment-3'] };
  assert.ok(task.record.scenarios.every(s => !s.downLinks.includes('segment-3')), 'extra failure outside bank scenarios');
  assert.equal(lookup(task.network, answer, 'R-CORE', '172.16.0.1', options).discard, true);
  const result = trace(task.network, answer, '10.0.0.1', '172.16.0.1', options);
  assert.equal(result.stop.code, 'discarded'); assert.equal(result.stop.deviceId, 'R-CORE');
  const narrowed = { ...answer, 'R-CORE': answer['R-CORE'].map(r => r.discard ? { ...r, dst: '172.16.3.0', prefix: 24 } : r) };
  assert.equal(trace(task.network, narrowed, '10.0.0.1', '172.16.0.1', options).stop.code, 'loop', 'old narrowing reproduces the defect');
});

test('live optimiser equals every frozen result and is deterministic', () => {
  const start = performance.now();
  for (const task of instances) assert.deepEqual(optimise(task), frozen.results[`${task.record.id}/${task.variant.id}`]);
  console.log(`Live/frozen equality, 19 variants: ${((performance.now() - start) / 1000).toFixed(3)} s`);
  if (!full) return;
  const second = performance.now();
  for (const task of instances) assert.deepEqual(optimise(task), frozen.results[`${task.record.id}/${task.variant.id}`]);
  console.log(`Deterministic second pass: ${((performance.now() - second) / 1000).toFixed(3)} s`);
});

test('unsupported connected/supplied inputs fall back; backups append verbatim once and never promote', () => {
  const task = create(tasks[0]), answer = solution(task), malformed = structuredClone(task);
  malformed.network.devices[0].interfaces.push({ ...malformed.network.devices[0].interfaces[0], id: 'overlap' });
  assert.equal(compressedRows(malformed, answer, 'R1'), null);
  for (const supplied of [
    [{ dst: '0.0.0.0', prefix: 0, via: '10.0.0.2' }, { dst: '0.0.0.0', prefix: 0, via: '10.0.0.2' }],
    [{ dst: '203.0.113.0', prefix: 24, via: '10.0.0.2' }],
    [{ dst: '0.0.0.0', prefix: 0, discard: true }],
  ]) {
    const changed = structuredClone(task); changed.network.supplied.R1 = supplied;
    assert.equal(compressedRows(changed, answer, 'R1'), null);
  }
  const unsupported = structuredClone(task);
  unsupported.network.supplied.R1 = Array.from({ length: 2 }, () => ({ dst: '0.0.0.0', prefix: 0, via: '10.0.0.2' }));
  assert.deepEqual(optimise(unsupported).answer.R1, answer.R1);
  const backup = { ...answer.R1[0], id: 'backup', distance: 7 };
  const withBackup = { ...answer, R1: [...answer.R1, backup] };
  const rows = compressedRows(task, withBackup, 'R1');
  assert.deepEqual(rows.filter(r => r.distance > 1), [backup]);
  assert.deepEqual(rows[0], { id: 'opt:R1:1', dst: '192.168.2.0', prefix: 24, via: '10.0.0.2', distance: 1 });
  assert.equal(compressedRows(task, { ...answer, R1: [backup] }, 'R1'), null);
  assert.throws(() => routerProblem(task, { R1: [backup] }, 'R1'), /backup wins/);
  assert.equal(compressedRows(task, { ...answer, R1: [...answer.R1, { dst: '203.0.113.0', prefix: 24, via: '10.0.0.2' }, { dst: '203.0.113.0', prefix: 24, discard: true }] }, 'R1'), null);
  const task17 = create(tasks.find(t => t.displayNumber === 17));
  const discards = compressedRows(task17, solution(task17), 'R-CORE').filter(r => r.discard);
  assert.ok(discards.length);
  for (const row of discards) { assert.equal(row.distance, 1); assert.equal('via' in row, false); assert.match(row.id, /^opt:R-CORE:/); }
  const task15 = create(tasks.find(t => t.displayNumber === 15));
  assert.deepEqual(optimise(task15).answer, solution(task15));
});
