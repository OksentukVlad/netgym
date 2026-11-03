// The exercise contract rendered with react-dom/server (bundled harness in
// tests/harness/contract.jsx): routing and the mask exercise share
// useExercise, ExerciseLayout and the app store; the routing screen keeps
// its session per task instance across syntax and variant switches.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../.test-bundles/harness/contract.mjs';
import { tasks } from '../src/banks/routing/tasks.js';
import { scoreOf } from '../src/ui/exercise-state.js';

const [task1, task2, task3] = tasks;
const task8 = tasks[7];
const count = (html, pattern) => (html.match(pattern) ?? []).length;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('contract harness: routing task 1 through useExercise and ExerciseLayout (create, scaffold, hints, check, solution)', () => {
  const store = h.testStore();
  let ex;
  const render = () => unescape(store.render(h.RoutingContract, { record: task1, expose: e => { ex = e; } }));
  let html = render();
  assert.match(html, /data-layout="exercise"/);
  assert.equal(count(html, /role="status"/g), 1, 'Feedback is the only status');
  for (const label of ['R1 · LAN-B · МЕРЕЖА', 'R1 · LAN-B · ПОВНА МАСКА', 'R1 · LAN-B · NEXT-HOP', 'R2 · LAN-A · NEXT-HOP']) assert.ok(html.includes(`>${label}</label>`), label);
  assert.ok(!html.includes('ip route'), 'no reference before the reveal');
  assert.equal(ex.key, h.routing.create(task1).instanceKey);

  // Only R1's route: the reply from LAN-B has no way back.
  const reference = h.routing.solution(ex.task);
  ex.check({ R1: reference.R1, R2: [] });
  html = render();
  assert.equal(ex.result.ok, false);
  assert.equal(ex.result.code, 'return-path-failed');
  assert.ok(html.includes('Не всі мережі досяжні.'));
  assert.deepEqual([ex.session.status, ex.session.attempts], ['working', 1]);

  ex.hint(2);
  html = render();
  // Round 4 (2a hint rule): rung 1 names the evidence on screen (the stopped return path).
  // Repair 10: rung 1 says where to look (the router's table, the row to find), not the verdict again.
  assert.match(html, /Підказка 1 з 3\.<\/b> Де дивитися: маршрути R2/);
  assert.equal(ex.session.assisted, true);

  // Routes in another order still pass: the probes decide, not row positions.
  ex.check({ R2: reference.R2, R1: reference.R1 });
  html = render();
  assert.deepEqual([ex.result.ok, ex.result.complete, ex.session.status], [true, true, 'solved']);
  assert.ok(html.includes('Усі мережі бачать одна одну в обидва боки.'));
  assert.ok(html.includes('value="192.168.2.0"') && html.includes('value="255.255.255.0"'), 'the canonical answer fills the fields');
  assert.ok(!html.includes('ip route'));

  ex.reveal();
  html = render();
  assert.ok(html.includes('ip route 192.168.2.0 255.255.255.0 10.0.0.2'), 'the reveal path shows the reference');
  assert.deepEqual([ex.session.revealed, ex.session.assisted], [true, true]);
  // The same instance in RouterOS words: the syntax is presentation only.
  html = unescape(store.render(h.RoutingContract, { record: task1, syntax: 'routeros', expose: e => { ex = e; } }));
  assert.ok(html.includes('/ip route add dst-address=192.168.2.0/24 gateway=10.0.0.2'));
  assert.ok(html.includes('value="192.168.2.0/24"'));
});

test('contract harness: the mask screen is the second consumer of the same hook, layout and store', () => {
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 1, seeds: { 1: 4821 } } });
  const task = h.mask.create(null, { seed: 4821, level: 1 });
  const key = h.instanceKeyOf(h.mask, task, { seed: 4821, level: 1 });
  let html = unescape(store.render(h.MaskScreen));
  assert.match(html, /data-layout="exercise"/);
  assert.equal(count(html, /role="status"/g), 1);
  assert.ok(html.includes(`Адреса ${task.ip}, маска /${task.prefix} = `), 'the task from create(null, { seed })');
  assert.ok(html.includes('>Адреса мережі</label>') && html.includes('>Широкомовна адреса</label>'));
  assert.ok(html.includes('Обрати з варіантів'), 'options() offers choose mode');
  assert.ok(html.includes('class="ng-button ng-button-quiet ng-help-next is-skip">Пропустити<span aria-hidden="true"> →</span>') && html.includes('class="ng-button ng-button-primary ng-help-check">Перевірити<'),
    'round 4 (Q6): «Перевірити» primary; round 6: before completion «next» is the quiet «Пропустити →», not a button beside it');
  const solution = h.mask.solution(task);
  assert.ok(!html.includes(solution.network) || task.ip === solution.network, 'no answer before the reveal');

  // A routing instance in the same store.
  let ex;
  store.render(h.RoutingContract, { record: task1, expose: e => { ex = e; } });
  ex.check(h.routing.solution(ex.task));

  // The mask screen's check, as its «Перевірити» dispatches it.
  store.dispatch({ type: 'instance', key, action: { type: 'checked', answer: solution, result: h.mask.check(task, solution) } });
  html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes('Перша адреса блоку — мережа, остання — широкомовна.'), 'mask.ok copy');
  // Round 4 (spec A1): the verdict is HelpPanel's current item; «Далі →» the one primary action.
  assert.match(html, /class="ng-help-current ng-help-verdict is-ok" data-help-current="" data-help-tone="ok" data-help-scope="task"/);
  assert.ok(!html.includes('>Перевірити<'), 'a solved task offers only «Далі →»');
  assert.match(html, /<button type="button" class="ng-button ng-button-primary ng-help-next">Далі<span aria-hidden="true"> →<\/span><\/button>/);
  assert.deepEqual(Object.keys(store.state.instances).sort(), [ex.key, key].sort());
  assert.equal(store.state.instances[key].session.status, 'solved');
  assert.equal(store.state.instances[ex.key].session.status, 'solved');

  // Round 4 (spec R4): choice mode belongs to the task instance; the app-wide preference no longer switches it.
  store.dispatch({ type: 'pref', name: 'inputMode', value: 'choose' });
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { seeds: { 1: 7 } } });
  html = unescape(store.render(h.MaskScreen));
  const next = h.mask.create(null, { seed: 7, level: 1 });
  const nextKey = h.instanceKeyOf(h.mask, next, { seed: 7, level: 1 });
  assert.ok(html.includes('>Адреса мережі</label>') && html.includes('Обрати з варіантів'), 'a new task starts typed');
  store.dispatch({ type: 'instance', key: nextKey, action: { type: 'view', patch: { choices: { network: true, broadcast: true } } } });
  html = unescape(store.render(h.MaskScreen));
  for (const value of h.mask.options(next, 'network')) assert.ok(html.includes(`>${value}</button>`), value);
  assert.ok(html.includes('Ввести самому'));
});

test('contract harness: the mask reveal shows the solution only after «Показати відповідь»', () => {
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 2, seeds: { 2: 3 } } });
  const task = h.mask.create(null, { seed: 3, level: 2 });
  const key = h.instanceKeyOf(h.mask, task, { seed: 3, level: 2 });
  let html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes('Показати відповідь'));
  assert.ok(html.includes(`Підказка 1 з ${h.mask.hints(task).length}`));
  store.dispatch({ type: 'instance', key, action: { type: 'session', action: { type: 'hint' } } });
  store.dispatch({ type: 'instance', key, action: { type: 'session', action: { type: 'reveal' } } });
  html = unescape(store.render(h.MaskScreen));
  const s = h.mask.solution(task);
  const answer = task.kind === 'fit' ? `Найменший блок: /${s.prefix} = ` : `Мережа ${s.network}, широкомовна ${s.broadcast}.`;
  assert.ok(html.includes(answer), answer);
  // Round 4 (spec A1, A5): the answer is the current item; no penalty wording; the opened hint folds, reachable.
  assert.ok(!/зарахов|Спробуй нове/.test(html), 'no penalty wording');
  assert.match(html, /<details class="ng-help-fold"><summary>Підказки \(1\)<\/summary>/);
  assert.ok(html.includes('Підказка 1 з 3.</b>'), 'opened hints stay listed (folded)');
  assert.ok(!html.includes('>Перевірити<'));
  assert.ok(html.includes('data-revealed=""') && html.includes('>показано<'), 'the ruler is marked as shown, never as a solve');
});

/** Drives the routing screen's session hook: render, act, render again. */
function probe(store, record, syntax, variantId) {
  let api;
  store.render(h.RoutingProbe, { record, syntax, variantId, expose: a => { api = a; } });
  return api;
}

test('routing session: the syntax switch keeps the answer and the row verdicts; row checks are not attempts; the network check decides', () => {
  const store = h.testStore();
  let p = probe(store, task1, 'cisco');
  p.answers.edit('R1', 0, 'net', '192.168.2.0');
  p = probe(store, task1, 'cisco');
  p.answers.edit('R1', 0, 'mask', '255.255.255.0');
  p = probe(store, task1, 'cisco');
  p.answers.edit('R1', 0, 'gw', '10.0.0.2');
  p = probe(store, task1, 'cisco');
  assert.deepEqual(p.answers.valuesOf('R1', 0), { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2' });
  assert.equal(p.answers.resultOf('R1', 0), null);
  assert.equal(p.answers.check('R1', 0).detail.ok, true);
  p = probe(store, task1, 'cisco');
  assert.equal(p.answers.resultOf('R1', 0).detail.netOk, true);
  const instance = () => store.state.instances[p.ex.key];
  assert.deepEqual(h.routing.create(task1).instanceKey, p.ex.key);
  // Step 6: a lifetime id, bound to the row's slot; no null slots.
  assert.deepEqual(instance().answer, { R1: [{ id: 'R1.f1', slot: 'R1.row1', dst: '192.168.2.0', prefix: 24, via: '10.0.0.2', distance: 1 }] });
  // A row check is not an attempt and never decides solved.
  assert.deepEqual([instance().presses, instance().session.attempts, instance().session.status, instance().result], [0, 0, 'working', null]);

  // MikroTik: the same row, in its own fields and words; nothing recorded.
  p = probe(store, task1, 'routeros');
  assert.equal(p.ex.key, h.routing.create(task1).instanceKey, 'same identity in both syntaxes');
  assert.deepEqual(p.answers.valuesOf('R1', 0), { dst: '192.168.2.0/24', gw: '10.0.0.2', dist: '' });
  assert.deepEqual(p.answers.resultOf('R1', 0).detail, { ok: true, dstOk: true, gwOk: true, distOk: true, needDist: false });
  assert.deepEqual([instance().presses, Object.keys(instance().parts)], [0, ['R1.row1']]);

  // R2 checked in MikroTik with a wrong gateway, then right: one row.
  p.answers.edit('R2', 0, 'dst', '192.168.1.0/24');
  p = probe(store, task1, 'routeros');
  p.answers.edit('R2', 0, 'gw', '10.0.0.2');
  p = probe(store, task1, 'routeros');
  assert.equal(p.answers.check('R2', 0).detail.gwOk, false);
  p = probe(store, task1, 'cisco');
  // Cisco shows MikroTik's checked answer in Cisco fields, and Cisco's wording of the same mistake.
  assert.deepEqual(p.answers.valuesOf('R2', 0), { net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.2', dist: '' });
  assert.equal(p.answers.resultOf('R2', 0).reasons.gw, 'gateway-is-self');
  assert.equal(p.answers.resultOf('R2', 0).detail.gw, undefined, 'feedback receives no reference values');
  p.answers.edit('R2', 0, 'gw', ' 10.0.0.1');
  p = probe(store, task1, 'cisco');
  assert.equal(p.answers.resultOf('R2', 0), null, 'typing hides the last result');
  p.answers.check('R2', 0);
  p = probe(store, task1, 'routeros');
  assert.deepEqual(p.answers.valuesOf('R2', 0), { dst: '192.168.1.0/24', gw: '10.0.0.1', dist: '' }, 'the stale MikroTik draft gave way to the newer answer');
  assert.equal(p.answers.resultOf('R2', 0).detail.ok, true);
  assert.deepEqual(Object.values(instance().parts).map(x => x.ok), [true, true]);
  assert.deepEqual([instance().presses, instance().session.status], [0, 'working'], 'every row right is not yet a solved task');

  // «Перевірити мережу»: one attempt; the pings decide.
  const { result } = p.answers.checkNetwork();
  assert.equal(result.ok, true);
  assert.deepEqual([instance().presses, instance().session.attempts, instance().session.status, instance().session.earned.solved], [1, 1, 'solved', true]);
  assert.deepEqual(instance().result.evidence.probes.map(x => x.ok), [true]);
});

/** Types `fields` into one row, one field at a time, as the screen would. */
function type(store, record, syntax, router, index, fields, variantId) {
  let p = probe(store, record, syntax, variantId);
  for (const [name, value] of Object.entries(fields)) {
    p.answers.edit(router, index, name, value);
    p = probe(store, record, syntax, variantId);
  }
  return p;
}

/** A Result says the same thing in every field. */
const consistent = r => r.ok === r.complete && r.ok === (r.code === 'ok') && r.ok === !r.findings.some(f => f.severity === 'blocks');

test('routing session: a syntax switch never changes a recorded verdict (task 15, distance «01»)', () => {
  const task15 = tasks[14];
  const store = h.testStore();
  let p = type(store, task15, 'cisco', 'R1', 0, { net: '0.0.0.0', mask: '0.0.0.0', gw: '100.64.1.1', dist: '01' });
  const checked = p.answers.check('R1', 0);
  assert.deepEqual([checked.detail.ok, checked.detail.distOk], [false, false], 'Cisco rejects «01» on the primary route, as in round 1');

  p = probe(store, task15, 'routeros');
  const values = p.answers.valuesOf('R1', 0);
  assert.deepEqual(values, { dst: '0.0.0.0/0', gw: '100.64.1.1', dist: '' }, 'the canonical route has distance 1: no distance text');
  assert.equal(h.routing.checkRow(p.ex.task, 'R1', 0, values, 'routeros').ok, true, 'a regrade of the converted text would say right');
  assert.deepEqual(p.answers.resultOf('R1', 0), { ok: false, detail: null, values, fields: 'all' }, 'MikroTik shows the recorded verdict (all its fields may be marked)');
  assert.deepEqual(scoreOf([store.state.instances[p.ex.key]]), { correct: 0, total: 16, presses: 0 }, 'a row check is not an attempt');

  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task15.id, router: 'R1', filterLevel: 0, variants: {} } });
  store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' });
  let html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(!html.includes('class="ng-done"') && !/спроб:|ng-rt-score/.test(html), 'nothing earned: no ✓ in the list, and no score (round 4: calm)');
  assert.ok(html.includes('class="ng-rt-row is-wrong"') && !html.includes('ng-rt-row-ok'), 'the recorded wrong row stays wrong (no «✓ правильно»)');
  assert.ok(!html.includes('aria-invalid="true"'), 'no field marks MikroTik did not grade');

  // Back in Cisco: its own words, as checked.
  store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(html.includes('Основному маршруту distance не потрібна (або 1).'));

  // The verdicts agree but the field words wouldn't (wrong gateway and «01»): the verdict alone.
  const other = h.testStore();
  p = type(other, task15, 'cisco', 'R1', 0, { net: '0.0.0.0', mask: '0.0.0.0', gw: '100.64.2.1', dist: '01' });
  assert.deepEqual(p.answers.check('R1', 0).detail.distOk, false);
  p = probe(other, task15, 'routeros');
  assert.equal(h.routing.checkRow(p.ex.task, 'R1', 0, p.answers.valuesOf('R1', 0), 'routeros').distOk, true);
  assert.equal(p.answers.resultOf('R1', 0).detail, null);
  // Where both syntaxes grade alike, the other syntax words it in its own terms.
  p = type(other, task15, 'routeros', 'R1', 1, { dst: '0.0.0.0/0', gw: '100.64.1.1', dist: '2' });
  p.answers.check('R1', 1);
  p = probe(other, task15, 'cisco');
  assert.deepEqual(p.answers.resultOf('R1', 1).detail.gwOk, false);
});

test('routing session: a check never loses the other syntax’s unfinished text, in either direction', () => {
  // [checked syntax, its text (nothing parses), the other syntax, its unfinished text]
  for (const [checked, fields, other, draft] of [
    ['routeros', {}, 'cisco', { net: '192.168.2.0' }],                    // an empty row (Astra)
    ['cisco', { mask: '/24' }, 'routeros', { dst: '192.168.2.0/24' }],    // a mask that doesn't parse (Fable)
    ['cisco', {}, 'routeros', { gw: '10.0.0.2' }],
    ['routeros', { dst: '192.168.2.0' }, 'cisco', { net: '192.168.2.0', mask: '255.255.255.0' }],
  ]) {
    const store = h.testStore();
    type(store, task1, other, 'R1', 0, draft);
    let p = type(store, task1, checked, 'R1', 0, fields);
    assert.equal(p.answers.check('R1', 0).detail.ok, false);
    p = probe(store, task1, other);
    assert.deepEqual(p.answers.valuesOf('R1', 0), draft, `${other} keeps its text after a ${checked} check`);
    assert.equal(p.answers.resultOf('R1', 0), null, 'that text was not checked');
    p = probe(store, task1, checked);
    assert.deepEqual(p.answers.valuesOf('R1', 0), fields, `${checked} keeps the text it checked`);
    assert.equal(p.answers.resultOf('R1', 0).detail.ok, false);
  }
  // A check that parses supersedes the other syntax's text, with exactly the checked route.
  for (const [checked, fields, other, draft, shown] of [
    ['cisco', { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.9' }, 'routeros', { dst: '10.9.9.0/24' }, { dst: '192.168.2.0/24', gw: '10.0.0.9', dist: '' }],
    ['routeros', { dst: '192.168.2.0/24', gw: '10.0.0.2' }, 'cisco', { net: '1.2.3.4' }, { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2', dist: '' }],
  ]) {
    const store = h.testStore();
    type(store, task1, other, 'R1', 0, draft);
    let p = type(store, task1, checked, 'R1', 0, fields);
    const { ok } = p.answers.check('R1', 0).detail;
    p = probe(store, task1, other);
    assert.deepEqual(p.answers.valuesOf('R1', 0), shown, `${other} shows the route checked in ${checked}`);
    assert.equal(p.answers.resultOf('R1', 0).detail.ok, ok);
    // Step 6 (spec §2.2): a check that produced a route replaces its drafts,
    // so the checked syntax shows the canonical route too (the same text).
    p = probe(store, task1, checked);
    assert.deepEqual(p.answers.valuesOf('R1', 0), { ...fields, dist: '' });
  }
});

test('routing screen: a wrong row that didn’t parse shows «❌ Помилка.» in the other syntax, without field words', () => {
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task1.id, router: 'R1', filterLevel: 0, variants: {} } });
  const p = type(store, task1, 'cisco', 'R1', 0, { net: '192.168.2.0', mask: '/24', gw: '10.0.0.2' });
  p.answers.check('R1', 0);
  store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' });
  const html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.match(html, /id="rt-R1-0-dst"[^>]*value=""/, 'nothing to convert: blank fields');
  assert.ok(html.includes('class="ng-rt-row is-wrong"'), 'but the row is marked checked and wrong');
  assert.ok(!html.includes('Мережа має бути') && !html.includes('Gateway має бути'));
});

test('routing session: right rows are not a solved task; the network check stores the contract’s own Result', () => {
  // Every task and variant, solved row by row in Cisco, then checked as a network.
  for (const record of tasks) {
    for (const variant of record.variants) {
      const store = h.testStore();
      let p = probe(store, record, 'cisco', variant.id);
      const solution = h.routing.solution(p.ex.task);
      for (const [router, rows] of Object.entries(p.answers.rows)) {
        rows.forEach((row, i) => {
          p = type(store, record, 'cisco', router, i, h.syntaxes.cisco.fromRoute(solution[router][i], row.needDist), variant.id);
          assert.equal(p.answers.check(router, i).detail.ok, true, `${variant.code} ${router}/${i}`);
        });
      }
      const label = `${record.id}/${variant.id}`;
      let instance = store.state.instances[p.ex.key];
      assert.deepEqual([instance.session.status, instance.presses, instance.result], ['working', 0, null], label);
      p = probe(store, record, 'cisco', variant.id);
      const { result } = p.answers.checkNetwork();
      instance = store.state.instances[p.ex.key];
      assert.equal(instance.session.status, 'solved', `${label}: ${result.code}`);
      assert.equal(instance.completion, null, label);
      assert.equal(instance.result, result, `${label}: stored unaltered`);
      assert.ok(consistent(instance.result), `${label}: ${JSON.stringify(instance.result)}`);
      assert.equal(instance.result.code, 'ok', label);
    }
  }
  // Task 1 with only R1's row: not complete, and the probe Result says why.
  const store = h.testStore();
  let p = type(store, task1, 'cisco', 'R1', 0, { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2' });
  p.answers.check('R1', 0);
  p = probe(store, task1, 'cisco');
  p.answers.checkNetwork();
  const instance = store.state.instances[p.ex.key];
  assert.equal(instance.completion, null);
  assert.equal(instance.result.code, 'return-path-failed');
  assert.ok(consistent(instance.result));
});

test('routing session: unparsed text stays in its syntax; the hint ladder has three rungs; «↺» keeps answers', () => {
  const store = h.testStore();
  let p = probe(store, task2, 'cisco');
  p.answers.edit('R1', 0, 'mask', '/24');
  p = probe(store, task2, 'cisco');
  assert.equal(p.answers.check('R1', 0).detail.maskOk, false);
  p = probe(store, task2, 'routeros');
  assert.deepEqual(p.answers.valuesOf('R1', 0), {}, 'nothing to convert');
  assert.deepEqual(p.answers.resultOf('R1', 0), { ok: false, detail: null, values: null, fields: 'all' }, 'the recorded verdict, without field words');
  p = probe(store, task2, 'cisco');
  assert.deepEqual(p.answers.valuesOf('R1', 0), { mask: '/24' });
  assert.equal(p.answers.resultOf('R1', 0).detail.maskOk, false);

  // Step 6: one ladder per task, from the current rows (the unparsed row is left out).
  assert.deepEqual(p.answers.currentAnswer(), {});
  assert.equal(h.routing.hints(p.ex.task, p.answers.currentAnswer(), 'cisco').length, 3);
  for (let i = 0; i < 4; i++) {
    p.ex.hint(3);
    p = probe(store, task2, i % 2 ? 'cisco' : 'routeros');
  }
  const key = p.ex.key;
  assert.deepEqual([store.state.instances[key].session.hintIndex, store.state.instances[key].session.assisted], [3, true], 'three rungs, then no more');

  store.dispatch({ type: 'instances', keys: [key], action: { type: 'clear-results' } });
  p = probe(store, task2, 'cisco');
  assert.deepEqual([store.state.instances[key].presses, p.answers.resultOf('R1', 0)], [0, null]);
  assert.deepEqual(p.answers.valuesOf('R1', 0), { mask: '/24' });
});

test('routing session: tasks 3 and 8 keep separate answers per variant', () => {
  const store = h.testStore();
  for (const record of [task3, task8]) {
    const [a, b] = record.variants;
    let pa = probe(store, record, 'cisco', a.id);
    const pb = probe(store, record, 'cisco', b.id);
    assert.notEqual(pa.ex.key, pb.ex.key);
    pa.answers.edit('R1', 0, 'gw', '1.2.3.4');
    pa = probe(store, record, 'cisco', a.id);
    pa.answers.check('R1', 0);
    assert.deepEqual(probe(store, record, 'cisco', a.id).answers.valuesOf('R1', 0), { gw: '1.2.3.4' });
    assert.deepEqual(probe(store, record, 'cisco', b.id).answers.valuesOf('R1', 0), {});
    assert.equal(store.state.instances[pb.ex.key], undefined);
  }
});

test('routing screen: each syntax follows its round 1 app; the reference is absent until revealed', () => {
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task1.id, router: 'R1', filterLevel: 0, variants: {} } });
  let html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.equal(count(html, /role="status"/g), 1);
  // Step 7: one header; the screen keeps its h1, the LAB captions are gone.
  assert.ok(html.includes('<h1 class="ng-rt-h1">Статичні маршрути</h1>') && !html.includes('CISCO LAB'));
  assert.ok(html.includes('aria-checked="true" tabindex="0" class="ng-segmented-option">Cisco<'));
  assert.ok(html.includes('Маршрут до ') && html.includes('LAN-B'), 'Cisco names the destination from metadata');
  assert.ok(!html.includes('192.168.2.0 /24') && !html.includes('Next-hop = IP сусіда'), 'header gives no reference values');
  // Round 4 (spec R1): the fields' own words; the rules in «⋯»; one reveal, in the help panel.
  for (const label of ['Мережа', 'Маска', 'Адреса сусіда (next-hop)']) assert.ok(html.includes(`>${label}</label>`), label);
  assert.ok(!html.includes('маска /24?') && html.includes('aria-label="Інші дії"'));
  assert.ok(html.includes('class="ng-button ng-button-quiet ng-help-reveal-link">Показати відповідь<') && !html.includes('ВІДПОВІДЬ — R1'));
  assert.ok(!html.includes('ip route 192.168.2.0'));
  assert.ok(!html.includes('Варіант'), 'no variant switch on task 1');

  store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(!html.includes('MIKROTIK LAB') && html.includes('МАРШРУТИ — R1'));
  // Round 5 5b-2 (spec C): the destination's placeholder shows the shape of its answer.
  assert.ok(html.includes('placeholder="мережа/префікс, напр. x.x.x.0/24"') && html.includes('>Мережа призначення (dst-address)</label>') && html.includes('>Шлюз — адреса сусіда (gateway)</label>'));
  assert.ok(!html.includes('192.168.2.0 /24') && !html.includes('>Маска</label>') && !html.includes('маска /24?'), 'MikroTik shows no network and no mask field');
  assert.ok(!html.includes('EDGE'));
  assert.ok(!html.includes('/ip route add'));

  // The reveal is applied to the rows: the selected router's reference, «показано»; «Моя відповідь» switches back.
  const key = h.routing.create(task1).instanceKey;
  store.dispatch({ type: 'instance', key, action: { type: 'session', action: { type: 'reveal' } } });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(html.includes('/ip route add dst-address=192.168.2.0/24 gateway=10.0.0.2') && html.includes('ВІДПОВІДЬ — R1') && html.includes('>показано<'));
  assert.ok(html.includes('>Моя відповідь</button>') && html.includes('data-revealed=""'));
  store.dispatch({ type: 'instance', key, action: { type: 'view', patch: { mine: true } } });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(!html.includes('/ip route add') && html.includes('МАРШРУТИ — R1') && html.includes('>Відповідь</button>'), '«Моя відповідь»: the learner\'s rows again');
});

test('routing screen: task 3 and 8 open on each syntax’s round 1 variant, with a variant switch', () => {
  for (const [record, cisco, routeros] of [[task3, '3b', '3'], [task8, '8b', '8']]) {
    for (const [syntax, code] of [['cisco', cisco], ['routeros', routeros]]) {
      const store = h.testStore({ syntax });
      store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router: null, filterLevel: 0, variants: {} } });
      const html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
      // Round 4 (spec R1): the heading is the task's title only; «⋯» copies its code (base addresses: «A3b»).
      assert.ok(html.includes(`class="ng-rt-title" data-variant="${code}" data-code="A${code}">`), `${record.id} ${syntax}`);
      assert.ok(!html.includes('id="ng-rt-code"'), 'no code in the heading');
      // The list names the task as that syntax's round 1 app did.
      assert.ok(html.includes(`>#${record.displayNumber} ${record.title[syntax] ?? record.variants.find(v => v.code === code).title}<`), `${record.id} ${syntax} list title`);
      assert.ok(html.includes('aria-label="Варіант"'));
      assert.equal(count(html, /role="radio"/g), 6, 'syntax, variant and mode switches');
    }
  }
  // A chosen variant stays when the syntax changes.
  const store = h.testStore({ syntax: 'cisco' });
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task3.id, router: null, filterLevel: 0, variants: { [task3.id]: 'explicit-routes' } } });
  store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' });
  const chosen = html => html.match(/aria-label="Варіант"[\s\S]*?aria-checked="true"[^>]*>([^<]*)</)?.[1];
  assert.ok(chosen(unescape(store.render(h.RoutingScreen, { bank: h.routingBank }))).startsWith('3 ·'));
  store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' });
  assert.ok(chosen(unescape(store.render(h.RoutingScreen, { bank: h.routingBank }))).startsWith('3 ·'));
});
