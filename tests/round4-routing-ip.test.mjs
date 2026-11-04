import test from 'node:test';
import assert from 'node:assert/strict';
import binary from '../src/sections/ip/logic/binary.js';
import * as mask from '../src/sections/ip/logic/mask-core.js';
import { bits8, network, broadcast, toInt, prefixToMask } from '../src/engine/ip.js';
import { makeRng } from '../src/engine/rng.js';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
import * as routing from '../src/sections/routing/logic/static.js';
import { syntaxes } from '../src/sections/routing/syntax/index.js';
import { t as ipText } from '../src/sections/ip/uk.js';
import { t as routeText, faultText } from '../src/sections/routing/uk.js';
import { leaks } from './helpers/binary-leaks.mjs';

test('R5 generator 3: fixed new-level placements guard the seeded draw sequence', () => {
  // Initial generator-3 placements. The unchanged binary-v2 fixture remains
  // the independent historical oracle for level 3 and all its answer rows.
  for (const [level, seed, ip, prefix] of [
    [1, 0, '10.57.37.98', 26], [1, 42, '10.218.171.40', 28], [1, 9999, '192.168.211.70', 26],
    [2, 0, '10.57.37.139', 24], [2, 42, '10.218.171.134', 24], [2, 9999, '192.168.211.25', 24],
  ]) {
    const task = binary.create(null, { seed, level });
    assert.deepEqual([task.ip, task.prefix], [ip, prefix]);
  }
});

for (const level of [1, 2, 3]) test(`R5 level ${level}: 200 seeds, givens, immutable drafts, every row and provenance`, () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const task = binary.create(null, { seed, level });
    assert.deepEqual(task, binary.create(null, { seed, level }));
    assert.equal(task.identity.level, level);
    assert.equal(task.identity.generatorVersion, 3);
    assert.equal(task.instanceKey, JSON.stringify(task.identity));
    assert.ok(toInt(task.ip) > toInt(network(task.ip, task.prefix)));
    assert.ok(toInt(task.ip) < toInt(broadcast(task.ip, task.prefix)));
    seen.add(task.prefix);
    const expected = [task.ip, prefixToMask(task.prefix), network(task.ip, task.prefix), broadcast(task.ip, task.prefix)]
      .map(ip => ip.split('.').map(n => bits8(Number(n))));
    for (let step = 0; step < 4; step++) {
      const row = binary.row(task, step);
      assert.equal(row.octets.length, 4);
      row.octets.forEach((octet, entity) => assert.deepEqual(octet, level === 1 && entity < 3
        ? { provenance: 'given', bits: expected[step][entity] } : { provenance: 'learner', bits: null }));
      const draft = binary.draft(task, { step, octets: expected[step] });
      assert.equal(binary.check(task, draft).ok, true);
      assert.equal(binary.check(task, draft).complete, step === 3);
      // Restoring or pasting a whole row cannot overwrite fixed octets.
      const spoofed = { step, octets: ['bad', 'bad', 'bad', expected[step][3]] };
      if (level === 1) {
        assert.deepEqual(binary.draft(task, spoofed), draft);
        assert.equal(binary.check(task, spoofed).ok, true);
        const given = row.octets.slice(0, 3).map(o => o.bits);
        assert.deepEqual(leaks(task, given.join(' '), 'given', { step }), []);
        const altered = [...given, expected[step][3]];
        if (!given.includes(altered[3])) assert.ok(leaks(task, altered.join(' '), 'given', { step }).length);
      }
      for (const hint of binary.hints(task, null, { step })) {
        const text = ipText(`binary.${hint.code}`, hint.params);
        assert.ok(!text.includes('undefined'));
        assert.deepEqual(leaks(task, text, hint.provenance, { step, example: hint.params }), []);
        if (hint.rung === 3) assert.match(text, /^Приклад \(інші числа\)/);
      }
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), level === 1 ? [25, 26, 27, 28, 29, 30] : level === 2 ? [24] : binary.prefixes);
});

test('R5: first wrong octet skips legitimate zeros, identifies its sums, and moves after repair', () => {
  const task = binary.create(null, { ip: '10.0.8.77', prefix: 24, level: 2 });
  let answer = { step: 2, octets: ['00000000', '00000000', '00000000', '00000000'] };
  let result = binary.check(task, answer);
  assert.deepEqual(result.findings, [{ code: 'wrong-and', severity: 'blocks', field: 'octet', entity: 0,
    params: { octet: 1, current: 0, target: 10 } }]);
  answer.octets[0] = '00001010';
  result = binary.check(task, answer);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].entity, 2, 'zero-valued second octet is correct');
  assert.deepEqual(result.findings[0].params, { octet: 3, current: 0, target: 8 });
  assert.equal(ipText('binary.wrong-and', result.findings[0].params), 'Октет 3: зараз 0, треба 8.');
  const marked = binary.create(null, { ip: '192.168.10.77', prefix: 26, level: 3 });
  const invalid = binary.check(marked, { step: 0, octets: ['01000000', 'bad', 'bad', 'bad'] });
  assert.deepEqual(invalid.findings[0].params, { octet: 1, current: 64, target: 192 });
  assert.match(ipText(`binary.${invalid.code}`, invalid.findings[0].params), /зараз 64, треба 192/);
  assert.equal(binary.create(null).level, 1);
  const keys = [1, 2, 3].map(level => binary.create(null, { seed: 7, level }).instanceKey);
  assert.equal(new Set(keys).size, 3);
  for (const level of [0, 4, 1.5, null, '2']) assert.throws(() => binary.create(null, { level }), RangeError);
  assert.throws(() => binary.create(null, { level: 1, ip: '10.1.1.7', prefix: 24 }), RangeError);
  assert.throws(() => binary.create(null, { level: 2, ip: '10.1.1.7', prefix: 25 }), RangeError);
});

test('R2: level 1 only has two routers, uniform specific masks, both causes and safe independent repairs', () => {
  const definitions = F.eligibleVariants(record, bank, 1);
  assert.deepEqual(definitions.map(d => d.taskId), ['routing.task-01', 'routing.task-02']);
  for (const definition of definitions) for (const seed of [0, 600, 9999]) for (const faultCode of ['missing-route', 'wrong-destination']) {
    const inspected = F.inspect(record, { bank, level: 1, seed, taskId: definition.taskId, faultCode });
    const { task, baseline } = inspected;
    assert.equal(task.network.devices.filter(d => d.kind === 'router').length, 2);
    assert.deepEqual([...new Set(Object.values(baseline).flat().filter(r => r.prefix > 0).map(r => r.prefix))], [24]);
    assert.ok(Object.values(task.initialRoutes).flat().filter(r => r.prefix > 0).every(r => r.prefix === 24));
    // Construct routes from public topology rather than the canonical solution.
    const routes = {};
    for (const device of task.network.devices.filter(d => d.kind === 'router')) {
      routes[device.id] = [];
      for (const other of task.network.devices.filter(d => d.kind === 'router' && d.id !== device.id)) {
        const hop = other.interfaces.find(f => f.address && device.interfaces.some(o => o.segmentId === f.segmentId));
        for (const iface of other.interfaces.filter(f => f.address && !device.interfaces.some(o => o.segmentId === f.segmentId)))
          routes[device.id].push({ dst: network(iface.address.ip, iface.address.prefix), prefix: iface.address.prefix, via: hop.address.ip });
        if (device.id === 'R2' && task.requirements.length) routes[device.id].push({ dst: '0.0.0.0', prefix: 0, via: hop.address.ip });
      }
    }
    const answer = { routes, cause: faultCode };
    const failed = F.check(task, F.initialAnswer(task), { step: 'cause' });
    assert.equal(failed.fixOk, false);
    for (const cause of [null, faultCode, 'invented'])
      assert.deepEqual(F.check(task, { ...F.initialAnswer(task), cause }, { step: 'cause' }), failed, 'a cause cannot repair broken routing');
    const result = F.check(task, answer, { step: 'cause' });
    assert.equal(result.ok, true);
    const fixedHints = F.hints(task, answer, { result });
    assert.equal(fixedHints[1].text, faultText.causeMove, 'a passing repair gets a cause-comparison move');
    assert.equal(routeText(`routing-faults.${fixedHints[1].code}`, fixedHints[1].params), fixedHints[1].text);
    const staleAnswer = structuredClone(answer); staleAnswer.routes.R1 = [];
    assert.equal(F.hints(task, staleAnswer, { result })[1].params.fixed, false, 'unchecked edits cannot reuse passing-repair hints');
    const wrong = F.check(task, { ...answer, cause: faultCode === 'missing-route' ? 'wrong-destination' : 'missing-route' }, { step: 'cause' });
    assert.equal(F.feedback(task, wrong), 'Ремонт правильний — залиш його. Причина була інша.');
  }
  for (const id of [4, 5, 12, 14]) {
    const taskId = `routing.task-${String(id).padStart(2, '0')}`;
    assert.throws(() => F.create(record, { bank, level: 1, taskId }), /ineligible-variant/);
    assert.ok(F.eligibleVariants(record, bank, 2).some(d => d.taskId === taskId));
  }
});

test('R2: wrong-destination feedback comes from the checked visible table, never the planted site', () => {
  const { task } = F.inspect(record, { bank, level: 1, seed: 600, taskId: 'routing.task-01', faultCode: 'wrong-destination' });
  const result = F.check(task);
  const ispTask = F.inspect(record, { bank, level: 1, seed: 600, taskId: 'routing.task-02', faultCode: 'wrong-destination' }).task;
  const ispResult = F.check(ispTask);
  assert.match(F.feedback(ispTask, ispResult), /^R1: маршрут до [\d.]+\/24 не охоплює [\d.]+\.$/);
  assert.match(F.feedback(task, result), /^R[12]: маршрут до [\d.]+\/24 не охоплює [\d.]+\.$/);
  const answer = F.solution(task);
  // A learner's different bad destination is diagnosed in its own terms.
  answer.routes.R1[0].dst = '203.0.113.0';
  const edited = F.check(task, answer);
  assert.match(F.feedback(task, edited), /маршрут до 203\.0\.113\.0\/24 не охоплює/);
  const hints = F.hints(task, null, { result, rung: 3, assisted: true });
  assert.equal(hints[0].text, faultText.look(hints[0].params));
  assert.equal(hints[1].text, faultText.move);
  assert.match(hints[2].text, /^Приклад \(інші числа\)/);
  for (const hint of hints) assert.equal(routeText(`routing-faults.${hint.code}`, hint.params), hint.text);
});

for (const syntax of ['cisco', 'routeros']) test(`R1 task 15 ${syntax}: current 1–254 boundaries and unchanged legacy 255`, () => {
  const task = routing.create(bank.tasks.find(t => t.displayNumber === 15), { bank });
  const original = routing.solution(task);
  const adapter = syntaxes[syntax];
  for (const [primary, backup, ok] of [[1, 2, true], [1, 254, true], [2, 254, true], [1, 1, false], [254, 254, false], [1, 255, false], [0, 2, false], [1, 0, false], [255, 2, false]]) {
    const input = structuredClone(original);
    input.R1[0].distance = primary; input.R1[1].distance = backup;
    const fields = input.R1.map(r => adapter.fromRoute(r, true));
    const parsed = fields.map(f => adapter.toRoute(f));
    assert.equal(parsed.every(Boolean) && routing.check(task, { R1: parsed }).ok, ok, `${primary}/${backup}`);
    assert.equal(routing.check(task, input).ok, ok, `neutral ${primary}/${backup}`);
  }
  const backup = adapter.fromRoute({ ...original.R1[1], distance: 255 }, true);
  assert.equal(adapter.validateFields(backup), 'invalid-distance');
  assert.equal(routing.checkRow(task, 'R1', 1, backup, syntax).ok, true, 'frozen historical grader keeps 255');
  const hints = routing.hints(task, {}, syntax);
  // Repair (Fable): rung 1 says where to look (the router and the row), not the verdict again.
  const failure = routing.presentCheck(task, routing.check(task, {}), syntax).firstFailure;
  assert.notEqual(hints[0].params.text, failure.text);
  assert.ok(hints[0].params.text.startsWith(`Де дивитися: маршрути ${failure.params.router}`), hints[0].params.text);
  assert.match(hints[1].params.text, /Cisco: ip route <.*MikroTik: \/ip route add/);
  assert.match(hints[2].params.text, /^Приклад \(інші числа\): Cisco: ip route .*MikroTik: \/ip route add/);
  assert.equal(hints[2].params.commandsBySyntax.cisco.length, 2);
  assert.equal(hints[2].params.commandsBySyntax.routeros.length, 2);
});

test('hint rule: every mask level/task kind points at evidence, gives a move and a separate example', () => {
  const seen = new Set();
  for (const level of [1, 2, 3]) for (let seed = 0; seed < 30; seed++) {
    const task = mask.generate(makeRng(seed), level);
    seen.add(`${level}/${task.kind}`);
    const hints = mask.hints(task);
    const text = hints.map(h => ipText(`mask.${h.code}`, h.params));
    assert.ok(text.every(s => !s.includes('undefined')));
    assert.match(text[2], /^Приклад \(інші числа\)/);
    assert.ok(!text[1].includes('?'));
    if (task.kind === 'block') {
      assert.match(text[0], /На лінійці позначено/);
      assert.equal(hints[0].params.value, Number(task.ip.split('.')[hints[0].params.octet - 1]));
      assert.notEqual(hints[2].params.prefix, task.prefix);
      assert.notEqual(hints[2].params.broadcast, mask.solution(task).broadcast);
    } else {
      assert.match(text[0], new RegExp(String(task.hosts)));
      assert.notEqual(hints[2].params.prefix, mask.solution(task).prefix);
    }
  }
  assert.deepEqual([...seen].sort(), ['1/block', '2/block', '2/fit', '3/block']);
});
