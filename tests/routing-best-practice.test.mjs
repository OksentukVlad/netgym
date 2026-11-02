import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { presentCheck, hints, textFor } from './helpers/routing.mjs';
import { coverSpace, unknownSpace } from '../src/engine/coverage.js';
import { contains, toInt } from '../src/engine/ip.js';
import { lookup } from '../src/engine/forward.js';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { validateRoute } from '../src/engine/route-validation.js';
import { validateNetwork } from '../src/engine/network.js';
import { ui, hintQuestions, networkUi } from '../src/sections/routing/uk.js';
import * as cisco from '../src/engine/vendors/cisco.js';
import * as routeros from '../src/engine/vendors/routeros.js';
import { leaks } from './helpers/routing-leaks.mjs';

const setup = (n, variantId) => {
  const task = routing.create(structuredClone(tasks[n - 1]), { variantId });
  return { task, answer: routing.solution(task) };
};
const defaultRoute = via => ({ dst: '0.0.0.0', prefix: 0, via });

test('A1/A2/A3: every reference passes probes, every objective and safety from every router in every scenario', () => {
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id }), answer = routing.solution(task);
    const result = routing.check(task, answer);
    assert.equal(result.ok, true, variant.code);
    assert.ok(result.evidence.probes.every(p => p.ok), variant.code);
    assert.ok(result.evidence.objectives.every(o => o.ok), variant.code);
    assert.ok(result.evidence.safety.every(s => s.ok), variant.code);
    assert.equal(result.evidence.safety.length, task.network.devices.filter(d => d.kind === 'router').length * record.scenarios.length);
    for (const scenario of record.scenarios) for (const device of task.network.devices.filter(d => d.kind === 'router')) {
      const stops = coverSpace(task.network, answer, device.id, unknownSpace(task.network), { internet: true, downLinks: scenario.downLinks });
      assert.ok(stops.every(s => ['no-route', 'discarded'].includes(s.code)), `${variant.code}/${scenario.id}/${device.id}`);
    }
  }
});

const unsafeCases = [
  [4, undefined, answer => { answer.R1 = [defaultRoute('10.0.0.2')]; answer.R2.push(defaultRoute('10.0.0.1')); }, 'R1'],
  [7, undefined, answer => { answer['R-HUB'].push(defaultRoute('10.0.1.2')); }, 'R-HUB'],
  [8, 'stub-defaults', answer => { answer.R2.push(defaultRoute('10.0.0.6')); answer.R3.push(defaultRoute('10.0.0.5')); }, 'R2'],
  [14, undefined, answer => { answer['R-HQ'][0].prefix = 22; }, 'R-HQ'],
  [9, undefined, answer => { answer.R1 = answer.R1.filter(r => r.prefix !== 30); answer.R1.push({ dst: '10.0.0.0', prefix: 28, via: '10.0.0.2' }); }, 'R1'],
];
for (const [n, variant, mutate, repair] of unsafeCases) test(`A1/A7: unsafe task ${variant ? '8b' : n} fails unknown-space-loops with names-only feedback`, () => {
  const { task, answer } = setup(n, variant); mutate(answer);
  const result = routing.check(task, answer);
  assert.ok(result.evidence.probes.every(p => p.ok), 'unsafe answer still passes the listed pings');
  assert.equal(result.ok, false);
  assert.equal(result.code, [9, 14].includes(n) ? 'internet-coverage-missing' : 'unknown-space-loops');
  const view = presentCheck(task, result);
  const safety = view.lines.find(l => l.safety && l.code === 'unknown-space-loops');
  assert.ok(safety);
  assert.equal(view.firstFailure.code, result.code);
  assert.equal(safety.repairRouter, repair, 'safety repair is the first router in the cycle');
  assert.match(safety.text, /невідомий трафік ходить по колу/i);
  assert.ok(result.evidence.scenarios.every(s => !s.ok));
  for (const syntax of syntaxList) {
    assert.deepEqual(leaks(task, presentCheck(task, result, syntax.id).strip, 'strip'), []);
    const ladder = hints(task, answer, syntax.id);
    if ([9, 14].includes(n)) assert.equal(ladder[2].params.kind, 'default', 'blocking internet coverage precedes safety');
    else {
      assert.equal(ladder[2].params.kind, 'loop');
      assert.deepEqual(ladder[2].params.commands, []);
      assert.match(ladder[1].params.text, /Прибери, звузь або зміни напрямок маршруту/);
    }
  }
  if (n === 14) assert.match(view.lines.find(l => l.params.type === 'summary').text, /невикористані адреси повертаються назад — це петля/);
});

test('A1: a later-router /32 exception and a cycle outside probe paths are still detected', () => {
  const { task, answer } = setup(4);
  answer.R1.push(defaultRoute('10.0.0.2'));
  answer.R2.push({ dst: '198.19.1.9', prefix: 32, via: '10.0.0.1' });
  const result = routing.check(task, answer);
  assert.equal(result.code, 'unknown-space-loops');
  assert.ok(result.evidence.safety.some(s => s.params.missing.some(m => m.size === 1)));
  // Keep only a local LAN probe; all configurable routers remain subject to A1.
  task.record.probes = task.record.probes.filter(p => p.id === 'lan-1-2');
  task.record.scenarios = [{ id: 'normal', downLinks: [], probeIds: ['lan-1-2'] }];
  task.variant.objectives = [];
  assert.equal(routing.check(task, answer).code, 'unknown-space-loops');
});

test('A1: safety evaluates failure scenarios even if no declared probe traverses the failed link', () => {
  const { task, answer } = setup(4);
  answer.R1.push(defaultRoute('10.0.0.2'));
  answer.R2.push(defaultRoute('10.0.0.1'));
  task.record.scenarios = [
    { id: 'disconnected', downLinks: ['segment-2'], probeIds: [] },
    { id: 'cycle-active', downLinks: [], probeIds: [] },
  ];
  task.variant.objectives = [];
  const result = routing.check(task, answer);
  assert.ok(result.evidence.safety.filter(s => s.scenarioId === 'disconnected').every(s => s.ok));
  assert.ok(result.evidence.safety.some(s => s.scenarioId === 'cycle-active' && !s.ok));
});

test('A2: 3b keeps a default only on R1, reuses explicit return routes, and demonstrates a safe drop on R2', () => {
  const { task, answer } = setup(3, 'defaults');
  assert.deepEqual(answer.R2, routing.solution(routing.create(tasks[2], { variantId: 'explicit-routes' })).R2);
  assert.deepEqual(task.variant.objectives.filter(o => ['default-on', 'no-default'].includes(o.type)).map(o => [o.type, o.routerId, o.severity]), [['default-on', 'R1', 'blocks'], ['no-default', 'R2', 'blocks']]);
  const view = presentCheck(task, routing.check(task, answer));
  assert.equal(view.demonstrations[0].code, 'no-route');
  assert.equal(view.demonstrations[0].text, 'R2 не знає, куди слати пакет до невідомої адреси, і відкидає його — так і має бути.');
  answer.R2 = [defaultRoute('192.168.0.1')];
  const unsafe = routing.check(task, answer);
  assert.equal(unsafe.code, 'objective-not-met', 'no-default objective precedes safety');
  assert.ok(unsafe.evidence.safety.some(s => s.code === 'unknown-space-loops'));
});

test('A3: LANs exactly fill task 16 summary, including both halves of LAN3; summaries never remove unknown space', () => {
  const { task, answer } = setup(16);
  const lans = task.variant.objectives.find(o => o.type === 'summary').destinations;
  assert.deepEqual(lans, [{ dst: '172.16.0.0', prefix: 24 }, { dst: '172.16.1.0', prefix: 24 }, { dst: '172.16.2.0', prefix: 23 }]);
  assert.deepEqual(unknownSpace(task.network, [{ dst: '0.0.0.0', prefix: 0 }]), unknownSpace(task.network), 'no summary exemption remains');
  for (const ip of ['172.16.2.2', '172.16.3.254']) assert.equal(lookup(task.network, answer, 'R-AGG2', ip).dst, '172.16.2.0');
  for (const ip of ['172.16.0.1', '172.16.3.255']) assert.ok(!unknownSpace(task.network).some(([a,b]) => toInt(ip) >= a && toInt(ip) < b));
  assert.deepEqual(task.record.demonstrations, []);
});

test('A4: task 15 backup 254 passes and 255 is invalid at each new validation boundary', () => {
  const { task, answer } = setup(15);
  answer.R1[1].distance = 254;
  assert.equal(routing.check(task, answer).ok, true);
  for (const syntax of syntaxList) {
    const fields = syntax.fromRoute(answer.R1[1], true);
    assert.equal(syntax.validateFields(fields), null);
    fields.dist = '255';
    assert.equal(syntax.validateFields(fields), 'invalid-distance');
    assert.equal(syntax.toRoute(fields), null);
    assert.equal((syntax.id === 'cisco' ? cisco : routeros).parseRouteFields(fields).code, 'invalid-distance');
    assert.equal(routing.checkRow(task, 'R1', 1, fields, syntax.id).distOk, true, 'frozen comparison remains historical; preflight rejects first');
  }
  answer.R1[1].distance = 255;
  assert.equal(validateRoute(task.network, 'R1', answer.R1[1]), 'invalid-distance');
  assert.equal(lookup(task.network, answer, 'R1', '198.19.255.254', { downLinks: ['segment-1'] }), null);
  const result = routing.check(task, answer);
  assert.equal(result.code, 'invalid-distance');
  assert.equal(presentCheck(task, result).firstFailure.code, 'invalid-distance');
  const { task: supplied } = setup(2);
  supplied.network.supplied.R1[0].distance = 255;
  assert.ok(validateNetwork(supplied.network).some(issue => issue.code === 'invalid-route'));
});

test('A4/A7: every bank address belongs to RFC 1918, shared or engine benchmark space', () => {
  const allowed = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['198.18.0.0', 15]];
  for (const record of tasks) {
    // Every address-bearing string, including text/topology, endpoints, probes,
    // objectives, alternatives and scaffolds. Default destinations are sentinels.
    for (const ip of JSON.stringify(record).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []) {
      if (ip === '0.0.0.0') continue;
      assert.ok(allowed.some(([dst, prefix]) => contains(dst, prefix, ip)), `${record.id}: ${ip}`);
    }
  }
});

test('A5: default advice is safe, and is withheld when replacing listed routes would loop or violate an objective', () => {
  const { task, answer } = setup(4);
  assert.ok(routing.check(task, answer).evidence.advice.some(a => a.code === 'could-use-default' && a.entity === 'R1'));
  // Current specifics are safe; the proposed R1 default would bounce back.
  answer.R2.push(defaultRoute('10.0.0.1'));
  let result = routing.check(task, answer);
  assert.equal(result.ok, true);
  assert.ok(!result.evidence.advice.some(a => a.code === 'could-use-default' && a.entity === 'R1'));
  // No-default and exact-summary constraints also suppress the tip.
  for (const [n, v] of [[3, 'explicit-routes'], [3, 'defaults'], [6, undefined], [13, undefined]]) {
    const { task: constrained, answer: routes } = setup(n, v);
    assert.ok(!routing.check(constrained, routes).evidence.advice.some(a => a.code === 'could-use-default'));
  }
  task.variant.objectives.push({ id: 'required-specific', type: 'specific-to', routerId: 'R1', severity: 'blocks', destinations: [{ dst: '192.168.3.0', prefix: 24 }] });
  answer.R2.pop();
  assert.ok(!routing.check(task, answer).evidence.advice.some(a => a.code === 'could-use-default' && a.entity === 'R1'));
});

test('A6: amended Ukrainian task, hint and Rules copy is available without screen changes', () => {
  assert.match(tasks[2].variants[0].text, /Налаштуй маршрути до чужих мереж без default\./);
  assert.equal(tasks[2].variants[1].title, 'Тупіковий роутер — default в один бік');
  assert.equal(ui.shared.variants.defaults, 'default на тупіковому');
  assert.equal(hintQuestions['5'], 'Куди йде невідомий трафік, а які мережі лежать у протилежному напрямку?');
  assert.match(hintQuestions['13'], /вирівняні/);
  assert.equal(ui.shared.rulesDefaultDirection, 'Тому default пишемо лише вгору — до інтернету чи до центру, ніколи назустріч.');
  assert.equal(ui.shared.rulesExactSummary, 'Сумарний маршрут має точно охоплювати потрібні мережі.');
  assert.equal(networkUi.down, 'Якщо лінк до ISP1 недоступний');
  assert.match(tasks[6].variants[0].text, /HUB відкидає невідомий трафік/);
  assert.match(tasks[7].variants[0].text, /без default/);
  for (const syntax of syntaxList) {
    assert.match(textFor(tasks[8].variants[0].text, syntax.id), /R1 уже отримує default від провайдера/);
    assert.match(textFor(tasks[11].variants[0].text, syntax.id), /R-CORE має вихід в Інтернет; забезпеч доступ з офісів і серверної мережі\./);
  }
});
