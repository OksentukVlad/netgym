import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import tasks from '../src/banks/routing/tasks.js';
import { create, check, solution } from './helpers/routing.mjs';
import { renumber, addressMapper, mapAddresses, mapText, planBlocks, numberedSegments, accidentalAdjacency, placementIssues } from '../src/engine/renumber.js';
import { frozenFor } from './helpers/routing.mjs';
import { reviewSteps, shortest } from './helpers/routing-review.mjs';
import { optimise } from '../src/sections/routing/logic/optimise.js';
import { contains, toInt, blockSize, fromInt } from '../src/engine/ip.js';
import { instanceAddresses, leaks } from './helpers/routing-leaks.mjs';
import { assertAccepted, goldenSeeds, suiteSeeds, replay, mappedAnswers, replayWrongRows, replayWrongNetworks } from './helpers/step9.mjs';

for (const record of tasks) for (const variant of record.variants) {
  test(`generated ${variant.code}: ${suiteSeeds.length} seeds, full acceptance and deterministic replay`, () => {
    for (const seed of suiteSeeds) {
      const task = create(record, { variantId: variant.id, seed });
      assertAccepted(record, task);
      assert.deepEqual(create(record, { variantId: variant.id, seed }), task);
      assert.equal(task.identity.seed, seed); assert.equal(task.identity.generatorVersion, 1);
      // No old three-octet prefix survives any mapped prose (except invariant engine addresses).
      const texts = JSON.stringify([task.record.text, task.record.topology, task.record.variants.map(v => v.text)]);
      for (const segment of numberedSegments(record).filter(s => !contains('198.18.0.0', 15, s.dst))) {
        assert.equal(texts.includes(segment.dst.split('.').slice(0, 3).join('.') + '.'), false, `${variant.code}/${seed}/${segment.dst}`);
      }
    }
  });
  test(`generated ${variant.code}: mapped optimiser retains frozen total`, () => {
    const task = create(record, { variantId: variant.id, seed: 42 });
    assert.equal(optimise(task).total, frozenFor(task).total);
  });
  test(`generated ${variant.code}: three replay goldens`, () => {
    const goldens = JSON.parse(readFileSync(new URL('./fixtures/routing-generated-v1.json', import.meta.url)));
    for (const seed of goldenSeeds) assert.deepEqual(replay(create(record, { variantId: variant.id, seed })), goldens[`${variant.code}/${seed}`]);
  });
  test(`generated ${variant.code}: wrong row sample and semantic verdict codes`, () => {
    const task = create(record, { variantId: variant.id, seed: 42 });
    replayWrongRows(record, task, { sample: true }); replayWrongNetworks(record, task);
  });
}

test('unit plans: summaries, excludes and frozen-only aggregates reserve complete intervals', () => {
  const expected = { 6: ['10.10.0.0/23'], 8: ['192.168.2.0/23', '10.0.0.0/29'], 9: ['192.168.2.0/23'],
    13: ['10.0.0.0/22'], 14: ['172.20.0.0/23'], 16: ['172.16.0.0/22'], 17: ['172.16.0.0/22'] };
  for (const record of tasks) {
    const units = planBlocks(record, record.variants[0], mappedAnswers(record));
    assert.deepEqual(units.filter(u => u.segments.length > 1).map(u => `${u.dst}/${u.prefix}`).sort(), (expected[record.displayNumber] ?? []).sort());
    assert.equal(new Set(units.flatMap(u => u.segments)).size, numberedSegments(record).length);
  }
  const record = structuredClone(tasks[12]);
  record.variants[0].objectives.push({ type: 'summary', dst: '10.0.0.0', prefix: 23 });
  const units = planBlocks(record);
  assert.equal(units.filter(u => u.dst === '10.0.0.0').length, 1);
  assert.equal(units.find(u => u.dst === '10.0.0.0').prefix, 22);
});

test('interval function maps holes and exact prefixes; rejects crossing unit boundaries', () => {
  const task = create(tasks[16], { seed: 42 }), map = addressMapper(task.record.generation.units);
  const base = toInt(map('172.16.0.0', 22));
  assert.equal(map('172.16.3.10'), fromInt(base + 778));
  assert.equal(map('0.0.0.0', 0), '0.0.0.0'); assert.equal(map('198.19.255.254'), '198.19.255.254');
  assert.throws(() => map('172.16.0.0', 21), /outside one unit/);
  assert.throws(() => map('172.16.0.1', 24), /Unaligned/);
  assert.throws(() => map('203.0.113.5'), /outside one unit/);
  assert.throws(() => map('0.0.0.0', 1), /outside one unit/);
});

test('mapping covers every R3 field and text form; fails unknown tokens and fields', () => {
  const task = create(tasks[12], { seed: 42 }), map = addressMapper(task.record.generation.units);
  const first = map('10.0.0.0').split('.'), last = map('10.0.3.255').split('.');
  assert.equal(mapText('VLAN 10.0.0–3.x/24; 255.255.255.0', map), `VLAN ${first[0]}.${first[1]}.${first[2]}–${last[2]}.x/24; 255.255.255.0`);
  assert.equal(mapText('10.0.1.x; 10.0.1.1/32', map), `${map('10.0.1.0', 24).split('.').slice(0, 3).join('.')}.x; ${map('10.0.1.1', 32)}/32`);
  for (const text of ['203.0.113.1', '10.0.0–7.x/24', '10.0.999.x', '10.0.1.z']) assert.throws(() => mapText(text, map), RangeError);
  assert.throws(() => mapAddresses({ futureAddressField: '10.0.1.1' }, map), /Unmapped address field/);
  const fields = { from: '10.0.0.2', to: '10.0.3.10', destination: '10.0.1.1', primaryVia: '10.0.2.1', backupVia: '10.0.3.1', alternatives: ['10.0.2.2'] };
  assert.deepEqual(mapAddresses(fields, map), Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? v.map(ip => map(ip)) : map(v)])));
  const task10 = create(tasks[9], { seed: 0 });
  assert.ok(Object.values(task10.variant.referenceRoutes).flat().some(r => r.alternatives?.length));
});

test('a sentence-final «…/24.» is read with its prefix; a record that can’t be planned is infeasible, not an error', () => {
  const task = create(tasks[12], { seed: 42 }), map = addressMapper(task.record.generation.units);
  const calls = [], spy = (ip, prefix) => { calls.push([ip, prefix]); return map(ip, prefix); };
  assert.equal(mapText('Мережа 10.0.1.0/24.', spy), `Мережа ${map('10.0.1.0', 24)}/24.`);
  assert.deepEqual(calls, [['10.0.1.0', 24]], 'the token carries its prefix');
  assert.throws(() => mapText('Хост 10.0.1.1/24.', map), /Unaligned/, 'a host with a prefix is not read as a bare address');
  assert.equal(mapText('Кінець: 10.0.1.1.', map), `Кінець: ${map('10.0.1.1')}.`);
  const odd = structuredClone(tasks[0]);
  odd.variants[0].objectives.push({ id: 'empty-summary', type: 'summary', severity: 'advice', routerId: 'R1', dst: '203.0.113.0', prefix: 24 });
  assert.throws(() => planBlocks(odd, odd.variants[0]), /Mixed or empty/);
  const result = create(odd, { seed: 7 });
  assert.deepEqual([result.infeasible, result.code, result.seed], [true, 'infeasible', 7]);
  assert.ok(create(odd).identity, 'its base addresses still open');
});

test('pool bounds, mixed families, offsets and no accidental adjacency', () => {
  for (const record of tasks) for (const seed of [0, 42, 9999]) {
    const task = create(record, { seed }), g = task.record.generation;
    assert.deepEqual(placementIssues(record, task.record), []);
    assert.equal(g.linkPool.dst, g.lanPool.prefix === 8 ? '172.31.0.0' : '10.255.0.0');
    const used = numberedSegments(record).filter(s => ['lan', 'server'].includes(s.kind));
    assert.ok(!used.some(s => contains(g.lanPool.dst, g.lanPool.prefix, s.dst)));
    if ([5, 12].includes(record.displayNumber)) assert.equal(g.lanPool.dst, record.displayNumber === 5 ? '10.0.0.0' : '172.16.0.0');
    for (const unit of g.units) assert.equal(toInt(unit.mapped) % blockSize(unit.prefix), 0);
  }
  assert.ok(accidentalAdjacency({ start: 0, end: 256 }, { start: 256, end: 512 }));
  assert.ok(accidentalAdjacency({ start: 0, end: 512 }, { start: 768, end: 1024 }));
  assert.equal(accidentalAdjacency({ start: 0, end: 256 }, { start: 512, end: 768 }), false);
});

test('retry identity is record-scoped; bounded exhaustion is explicit', () => {
  for (const record of [tasks[2], tasks[7]]) {
    const [a, b] = record.variants.map(v => create(record, { variantId: v.id, seed: 0 }));
    assert.deepEqual(a.network, b.network); assert.deepEqual(a.record.generation, b.record.generation); assert.notEqual(a.instanceKey, b.instanceKey);
  }
  const record = tasks[0], attempts = [];
  const generated = renumber(record, 'main', 0, { accept: mapped => { attempts.push(mapped.generation.attempt); return mapped.generation.attempt === 2; } });
  assert.deepEqual(attempts, [0, 1, 2]); assert.equal(generated.generation.seed, 0);
  assert.equal(generated.generation.attempt, 2);
  const second = renumber(record, 'main', 0, { accept: mapped => mapped.generation.attempt === 2 });
  assert.deepEqual(generated, second);
  assert.notDeepEqual(generated.network, renumber(record, 'main', 0).network);
  let count = 0;
  assert.equal(renumber(record, 'main', 0, { accept: () => { count++; return false; } }).code, 'infeasible'); assert.equal(count, 21);
  for (const seed of [-1, 10000, 1.5, '42', NaN]) assert.throws(() => create(record, { seed }), RangeError);
  assert.throws(() => create(record, { seed: 0, variantId: 'missing' }), RangeError);
});

test('shortest and review bind frozen answers to the complete generated identity', () => {
  const task = create(tasks[0], { seed: 0 }), answer = shortest(task);
  assert.deepEqual(answer, frozenFor(task).answer); assert.ok(check(task, answer).ok);
  const steps = reviewSteps(task, answer); let result; do { result = steps.next(); } while (!result.done);
  assert.equal(result.value.star, true);
  answer.R1[0].dst = '203.0.113.0'; assert.notDeepEqual(shortest(task), answer);
  for (const key of ['seed', 'bankRevision', 'generatorVersion', 'taskId', 'variantId', 'exerciseId', 'bankId', 'formatVersion']) {
    const other = structuredClone(task); other.identity[key] = typeof other.identity[key] === 'number' ? other.identity[key] + 1 : 'different';
    other.instanceKey = JSON.stringify(other.identity);
    assert.equal(frozenFor(other), null, key); assert.throws(() => shortest(other), RangeError);
  }
  const mismatched = structuredClone(task); mismatched.instanceKey = create(tasks[0]).instanceKey;
  assert.equal(frozenFor(mismatched), null);
});

test('leak helper uses generated interface, endpoint, supplied and aggregate addresses', () => {
  const task = create(tasks[7], { seed: 42 }), addresses = instanceAddresses(task);
  const value = task.network.devices[0].interfaces.find(f => f.address).address.ip;
  assert.ok(addresses.has(value)); assert.deepEqual(leaks(task, value, 'placeholder'), ['bank-address-in-placeholder']);
  assert.equal(addresses.has('192.168.1.1'), false);
  const hidden = task.variant.referenceRoutes.R1[0];
  assert.ok(leaks(task, `${hidden.dst}/${hidden.prefix} via ${hidden.via}`).length);
});
