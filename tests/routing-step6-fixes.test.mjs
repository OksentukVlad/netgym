import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { presentCheck, hints, describeTrace } from './helpers/routing.mjs';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { networkUi as text, ui } from '../src/sections/routing/uk.js';
import { leaks } from './helpers/routing-leaks.mjs';

const setup = (n, variantId) => {
  const task = routing.create(structuredClone(tasks[n - 1]), { variantId });
  return { task, answer: routing.solution(task) };
};
const route = (via, dst = '0.0.0.0', prefix = 0) => ({ dst, prefix, via });
const safetyLines = view => view.lines.filter(l => l.safety);

test('S1: unknown-space ECMP blocks task 10 even when probes and objectives pass', () => {
  const { task, answer } = setup(10);
  for (const device of task.network.devices) {
    const gateways = task.network.devices.filter(d => d.id !== device.id).flatMap(d => d.interfaces
      .filter(f => f.address && device.interfaces.some(own => own.segmentId === f.segmentId))
      .map(f => f.address.ip));
    answer[device.id].push(...gateways.map(via => route(via)));
  }
  const result = routing.check(task, answer);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.ok(result.evidence.objectives.every(o => o.ok));
  assert.equal(result.ok, false);
  assert.equal(result.complete, false);
  assert.equal(result.code, 'unsupported-ecmp');
  assert.ok(result.evidence.safety.every(s => !s.ok && s.code === 'unsupported-ecmp'));
  assert.ok(result.evidence.scenarios.every(s => !s.ok));
  const view = presentCheck(task, result);
  assert.equal(view.firstFailure.code, 'unsupported-ecmp');
  assert.equal(view.firstFailure.text, text.probe['unsupported-ecmp'](view.firstFailure.params));
  assert.match(hints(task, answer)[0].params.text, /однаковою distance/);
  assert.match(hints(task, answer)[1].params.text, /резервному більшу відстань/);
  assert.deepEqual(leaks(task, view.strip, 'strip'), []);
});

for (const [n, router] of [[2, 'R1'], [5, 'R1'], [9, 'R1'], [12, 'R-CORE'], [14, 'R-HQ']]) {
  test(`S2: task ${n} empty answer keeps ISP trace and diagnoses ${router} in strip, hint and repair`, () => {
    const { task } = setup(n);
    const result = routing.check(task, {});
    const before = structuredClone(result);
    for (const syntax of syntaxList) {
      const view = presentCheck(task, result, syntax.id), line = view.firstFailure;
      const { from, to } = line.params;
      const sentence = `Пакет з ${from} до ${to} пішов через ${router} до провайдера: у ${router} немає маршруту до ${to}, тож його забрав маршрут за замовчуванням.`;
      assert.equal(line.text, sentence);
      assert.equal(view.strip, `• Ще ні. ${sentence}`);
      assert.equal(view.repairRouter, router);
      assert.equal(line.repairRouter, router);
      assert.equal(line.trace.ringAt, router);
      assert.equal(line.trace.request.stop.deviceId, 'ISP');
      assert.equal(line.trace.request.hops.at(-1).deviceId, router);
      // Repair 10: rung 1 says where to look (the repair router's table), not the verdict again.
      const rung1 = hints(task, {}, syntax.id)[0].params.text;
      assert.ok(rung1.startsWith(`Де дивитися: маршрути ${router}`) && rung1 !== sentence, rung1);
      const rung2 = hints(task, {}, syntax.id)[1].params.text;
      assert.match(rung2, new RegExp(`сусіда ${router}`));
      assert.ok(!rung2.includes('ISP'));
      assert.deepEqual(leaks(task, rung2, 'hint-evidence'), []);
      assert.deepEqual(leaks(task, view.strip, 'strip'), []);
      assert.ok(describeTrace(result.evidence.probes[0], task.network, syntax.id)[0].includes(sentence));
    }
    assert.deepEqual(result, before, 'presentation preserves the physical evidence');
  });
}

test('S3: reciprocal defaults with failed probes select probe before objectives and one safety cycle', () => {
  const { task } = setup(4);
  const answer = { R1: [route('10.0.0.2')], R2: [route('10.0.0.1')] };
  const result = routing.check(task, answer), view = presentCheck(task, result);
  const firstProbe = result.evidence.probes.find(p => !p.ok);
  assert.equal(result.evidence.probes.filter(p => !p.ok).length, 3);
  assert.equal(result.code, firstProbe.code);
  assert.equal(view.firstFailure.probe.id, firstProbe.id);
  assert.equal(view.firstFailure.probe.ok, false);
  assert.ok(!JSON.stringify(view.lines).includes('Усе доходить'));
  assert.ok(!JSON.stringify(view.lines).includes('Пінги проходять'));
  assert.equal(safetyLines(view).length, 1);
  assert.ok(view.lines.indexOf(safetyLines(view)[0]) > view.lines.findLastIndex(l => l.kind === 'probe'));
  const form = presentCheck(task, { ...result, formErrors: [{ routerId: 'R3', code: 'invalid-ip' }] });
  assert.equal(form.firstFailure.kind, 'form');
  assert.equal(form.repairRouter, 'R3');
});

test('S3: blocking objective precedes safety when all probes pass', () => {
  const { task, answer } = setup(14);
  answer['R-HQ'][0].prefix = 22;
  const result = routing.check(task, answer), view = presentCheck(task, result);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'internet-coverage-missing');
  assert.equal(view.firstFailure.code, 'internet-coverage-missing');
  assert.ok(view.lines.find(l => l.code === 'unknown-space-loops' && l.safety));
});

test('S4: ordered three-router cycle is closed, deduplicated across starts and cause-neutral for host routes', () => {
  const { task, answer } = setup(10);
  for (const [router, via] of [['R1', '10.1.0.2'], ['R2', '10.3.0.2'], ['R3', '10.2.0.1']]) {
    answer[router].push(route(via, '198.19.1.9', 32));
  }
  const result = routing.check(task, answer), view = presentCheck(task, result);
  assert.ok(result.evidence.probes.every(p => p.ok));
  const lines = safetyLines(view);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].cycle, ['R1', 'R2', 'R3', 'R1']);
  assert.equal(lines[0].text, 'Невідомий трафік ходить по колу R1 → R2 → R3 → R1.');
  assert.equal(lines[0].params.cycleCause, 'other');
  assert.deepEqual(result.evidence.safety[0].params.missing[0].cycle, lines[0].cycle);
  assert.equal(lines[0].repairRouter, lines[0].cycle[0]);
  for (const value of [lines[0].text, hints(task, answer)[1].params.text]) {
    assert.deepEqual(leaks(task, value, 'network-feedback'), []);
    assert.ok(!value.includes('⇄'), 'no invented two-router return');
    assert.ok(!value.includes('за замовчуванням'));
  }
});

test('S4: all-default cycle retains its cause; a summary names the actual forwarding routers', () => {
  const { task, answer } = setup(10);
  for (const [router, via] of [['R1', '10.1.0.2'], ['R2', '10.3.0.2'], ['R3', '10.2.0.1']]) answer[router].push(route(via));
  const line = safetyLines(presentCheck(task, routing.check(task, answer)))[0];
  assert.deepEqual(line.cycle, ['R1', 'R2', 'R3', 'R1']);
  assert.equal(line.params.cycleCause, 'defaults');
  assert.match(line.text, /Маршрути за замовчуванням дивляться один на одного/);
  assert.ok(!line.text.includes('Два маршрути'), 'three routers do not imply two defaults');
  const { task: summaryTask, answer: summaryAnswer } = setup(14);
  summaryAnswer['R-HQ'][0].prefix = 22;
  const summary = safetyLines(presentCheck(summaryTask, routing.check(summaryTask, summaryAnswer)))[0];
  assert.equal(summary.params.cycleCause, 'summary');
  assert.equal(summary.params.summaryRouter, 'R-HQ');
  assert.equal(summary.params.summaryNext, 'R-F1');
  assert.match(summary.text, /Сумарний маршрут на R-HQ захоплює адреси, які R-F1 повертає назад/);
  assert.ok(!summary.text.includes('за замовчуванням'));
});

test('S4: distinct cycles and scenarios remain separate, repeated address pieces do not', () => {
  const { task, answer } = setup(10);
  answer.R1.push(route('10.1.0.2'), route('10.2.0.2', '198.19.1.9', 32));
  answer.R2.push(route('10.1.0.1'));
  answer.R3.push(route('10.2.0.1', '198.19.1.9', 32));
  task.record.scenarios.push({ id: 'other', downLinks: [], probeIds: [] });
  const lines = safetyLines(presentCheck(task, routing.check(task, answer)));
  assert.equal(lines.length, 4);
  for (const id of ['normal', 'other']) {
    assert.deepEqual(lines.filter(l => l.scenarioId === id).map(l => l.cycle), [['R1', 'R2', 'R1'], ['R1', 'R3', 'R1']]);
  }
});

test('S5: safe-drop demonstrations have their own action label and exact sentence in both variants', () => {
  for (const [variant, router] of [['explicit-routes', 'R1'], ['defaults', 'R2']]) {
    const { task, answer } = setup(3, variant);
    const demo = presentCheck(task, routing.check(task, answer)).demonstrations[0];
    assert.equal(ui.shared.demoTitle(demo.label), 'Демонстрація: пакет до невідомої адреси');
    assert.notEqual(demo.label, text.unknown);
    assert.equal(demo.text, `${router} не знає, куди слати пакет до невідомої адреси, і відкидає його — так і має бути.`);
    assert.deepEqual(leaks(task, demo.text, 'demonstration'), []);
  }
});

test('S6: interface-source transit labels name the device and retain the target link context', () => {
  const { task, answer } = setup(10);
  const probe = task.record.probes.find(p => p.id === 'transit-R1');
  probe.from = 'R1.if3';
  probe.to = 'R3.if2';
  for (const syntax of syntaxList) {
    const line = presentCheck(task, routing.check(task, answer), syntax.id).lines.find(l => l.probe?.id === probe.id);
    assert.equal(line.label, 'R1 → R3 (лінк R2–R3)');
    assert.deepEqual(leaks(task, line.label, 'ping'), []);
  }
});

test('S7: line state is concise and distinct from strip text, including reply, loop, form and goals', () => {
  const { task, answer } = setup(1);
  assert.equal(presentCheck(task, routing.check(task, {})).firstFailure.state, '✗ зупинився на R1');
  answer.R2 = [];
  const reply = presentCheck(task, routing.check(task, answer)).firstFailure;
  assert.equal(reply.state, '✗ відповідь зупинилась на R2');
  assert.ok(reply.text.length > reply.state.length);
  const { task: loopTask, answer: loopAnswer } = setup(4);
  loopAnswer.R1.push(route('10.0.0.2'));
  loopAnswer.R2.push(route('10.0.0.1'));
  const loop = presentCheck(loopTask, routing.check(loopTask, loopAnswer));
  assert.equal(safetyLines(loop)[0].state, '✗ по колу');
  const form = presentCheck(task, { ...routing.check(task, {}), formErrors: [{ routerId: 'R1', code: 'invalid-ip' }] });
  assert.equal(form.firstFailure.state, '✗ виправ маршрут');
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    for (const answer of [{}, routing.solution(task)]) {
      const view = presentCheck(task, routing.check(task, answer));
      for (const line of view.lines) {
        assert.equal(typeof line.state, 'string');
        assert.ok(line.state.length > 0 && line.state.length < 45, `${variant.code}: ${line.state}`);
        if (line.ok) assert.equal(line.state, '✓');
        assert.deepEqual(leaks(task, line.state, 'network-feedback'), []);
      }
    }
  }
});

test('S8: partial internet coverage has the exact new diagnostic', () => {
  const { task, answer } = setup(2), original = answer.R2[0];
  answer.R2 = [{ ...original, dst: '198.19.255.254', prefix: 32 }, { ...original, dst: '10.20.0.0', prefix: 24 }];
  for (const syntax of syntaxList) {
    const view = presentCheck(task, routing.check(task, answer), syntax.id);
    assert.equal(view.firstFailure.code, 'internet-coverage-missing');
    assert.equal(view.firstFailure.text, 'R2 шле в інтернет лише частину невідомих адрес: потрібен один маршрут за замовчуванням на все інше.');
    assert.deepEqual(leaks(task, view.strip, 'strip'), []);
  }
});
