// Round 2 step 6, the screens (Opus): the path layer's geometry, the check
// view's overlay state, both modes through the screen's own hook (free
// rows, the form check before the network check, carry-over between modes,
// row checks that never move or count), and what the screen renders before
// and after a network check.
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { presentCheck } from './helpers/routing.mjs';
import { topology } from '../src/sections/routing/logic/topology.js';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { diagramGeometry, NETGYM_DIAGRAM_FONT } from '../src/ui/topology/geometry.js';
import { cycleTrace, frameAt, OFFSET, planPath, solvedMarks } from '../src/sections/routing/screens/pathPlan.js';
import { checkViewReducer, initialCheckView, shownOf } from '../src/sections/routing/screens/checkView.js';
import { ui } from '../src/sections/routing/uk.js';
import { normalise } from './helpers/routing-leaks.mjs';
import * as h from '../.test-bundles/harness/contract.mjs';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';

const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const setup = (n, variantId) => { const task = routing.create(tasks[n - 1], { variantId }); return { task, answer: routing.solution(task) }; };
const geometryOf = (task, syntax = 'cisco') => { const topo = topology(task.network, syntax); return diagramGeometry(topo, topo, undefined, NETGYM_DIAGRAM_FONT); };
/** The plan the screen draws for a check's first failure (or a picked line). */
function planOf(task, answer, pick = null, syntax = 'cisco') {
  const view = presentCheck(task, routing.check(task, answer), syntax);
  const line = pick ? view.lines.find(pick) : view.firstFailure;
  const trace = line.trace ?? cycleTrace(line.cycle);
  const ends = task.record.probes.find(p => p.id === line.probe?.id);
  return { line, plan: planPath(geometryOf(task, syntax), task.network, syntax, trace, { from: ends?.from, to: ends?.to, repairRouter: line.repairRouter, failed: line.status === 'fail' }) };
}
const side = (move, centre) => Math.sign((move.y1 + move.y2) / 2 - centre.y || (move.x1 + move.x2) / 2 - centre.x);

// ── The path layer ──────────────────────────────────────────

test('path layer: a missing return route draws the request to LAN-B (✓) and the reply stopping on R2 (amber ring)', () => {
  const { task, answer } = setup(1);
  answer.R2 = [];
  const { line, plan } = planOf(task, answer);
  assert.equal(line.code, 'return-path-failed');
  assert.deepEqual(plan.moves.map(m => [m.leg, m.kind, m.n ?? null]), [['request', 'line', 1], ['request', 'line', 2], ['request', 'line', 3], ['reply', 'line', null]]);
  const geo = geometryOf(task), r2 = geo.routers.find(r => r.name === 'R2');
  assert.deepEqual(plan.stops.map(s => [s.leg, s.deviceId, s.code, s.after]), [['reply', 'R2', 'no-route', 3]]);
  assert.equal(plan.stops[0].x, r2.x);
  assert.equal(plan.arrived.length, 1, '✓ on LAN-B');
  assert.equal(plan.arrived[0].after, 2, 'once the request is done');
  assert.deepEqual(plan.focus, { x: r2.x, y: r2.y, deviceId: 'R2' });
  // Request (down into LAN-B) and reply (up from it) run either side of the same line.
  const [down, up] = [plan.moves[2], plan.moves[3]];
  assert.ok(Math.abs(Math.abs(down.x1 - up.x2) - 2 * OFFSET) < 0.05, 'side by side, OFFSET each way');
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(plan)), 'no address in the drawing');
});

test('path layer: a loop closes with a ⟲ arc that bulges away from the link’s label; TTL the same', () => {
  const { task, answer } = setup(4);
  answer.R2 = answer.R2.map(r => (r.dst === '192.168.3.0' ? { ...r, via: '10.0.0.1' } : r));
  const { line, plan } = planOf(task, answer);
  assert.equal(line.code, 'loop');
  const loop = plan.moves.at(-1);
  assert.deepEqual([loop.kind, loop.label, loop.deviceId], ['loop', '⟲', 'R1']);
  const geo = geometryOf(task), link = geo.links.find(l => [l.from, l.to].sort().join() === 'R1,R2');
  const mid = { x: (link.x1 + link.x2) / 2, y: (link.y1 + link.y2) / 2 };
  assert.notEqual(Math.sign(loop.cy - mid.y), Math.sign(link.label.cy - mid.y), 'the arc and the label are on opposite sides');
  assert.deepEqual(plan.stops.map(s => s.deviceId), ['R2']);
  // TTL: a leg without nextDeviceId closes between its last two hops.
  const ttl = { request: { ok: false, hops: [{ deviceId: 'R1' }, { deviceId: 'R2' }, { deviceId: 'R1' }, { deviceId: 'R2' }], stop: { deviceId: 'R2', code: 'ttl-exceeded', nextDeviceId: null } }, reply: null };
  const ttlPlan = planPath(geo, task.network, 'cisco', ttl);
  assert.deepEqual([ttlPlan.moves.at(-1).kind, ttlPlan.moves.at(-1).label], ['loop', 'TTL']);
});

test('path layer: reciprocal defaults (the safety rule) draw R1 → R2 and back, ringing the first router of the cycle', () => {
  const { task, answer } = setup(4);
  answer.R1.push({ dst: '0.0.0.0', prefix: 0, via: '10.0.0.2' });
  answer.R2.push({ dst: '0.0.0.0', prefix: 0, via: '10.0.0.1' });
  const { line, plan } = planOf(task, answer);
  assert.deepEqual([line.code, line.trace, line.repairRouter, line.cycle], ['unknown-space-loops', null, 'R1', ['R1', 'R2', 'R1']]);
  assert.deepEqual(plan.moves.map(m => [m.kind, m.deviceId]), [['line', 'R2'], ['loop', 'R1']]);
  assert.deepEqual(plan.stops.map(s => s.deviceId), ['R1']);
  for (const bad of [null, ['R1'], ['R1', 'R1'], ['R1', 'R2']]) assert.equal(cycleTrace(bad), null, JSON.stringify(bad));
});

test('path layer: task 10’s three-router safety cycle is drawn R1 → R2 → R3 → R1, as the routes send it (O2)', () => {
  const { task, answer } = setup(10);
  for (const [router, via] of [['R1', '10.1.0.2'], ['R2', '10.3.0.2'], ['R3', '10.2.0.1']]) answer[router].push({ dst: '0.0.0.0', prefix: 0, via });
  const { line, plan } = planOf(task, answer);
  assert.deepEqual([line.code, line.cycle, line.repairRouter], ['unknown-space-loops', ['R1', 'R2', 'R3', 'R1'], 'R1']);
  assert.deepEqual(plan.moves.map(m => [m.kind, m.deviceId, m.n ?? null]), [['line', 'R2', 1], ['line', 'R3', 2], ['line', 'R1', 3]], 'three edges, in order, each along its own link; no edge back R2 → R1');
  const geo = geometryOf(task);
  const near = (x, y) => geo.routers.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)).name;
  assert.deepEqual(plan.moves.map(m => [near(m.x1, m.y1), near(m.x2, m.y2)]), [['R1', 'R2'], ['R2', 'R3'], ['R3', 'R1']]);
  assert.deepEqual(plan.stops.map(s => s.deviceId), ['R1'], 'the ring on R1, the first router of the cycle');
});

test('path layer: task 15 draws ISP1’s link down («⚡ впав») in its scenario, and a wrong path rings the repair router', () => {
  const { task, answer } = setup(15);
  const backupOnly = { R1: [answer.R1[0]] };
  const { line, plan } = planOf(task, backupOnly);
  assert.deepEqual([line.scenarioId, line.code], ['isp1-down', 'no-route']);
  assert.deepEqual(plan.downLinks.map(d => d.segmentId), ['segment-1']);
  const geo = geometryOf(task), wan = geo.endpoints.find(e => e.router === 'R1' && e.ep.name === 'g0/0');
  assert.deepEqual([plan.downLinks[0].x1, plan.downLinks[0].y1], [Math.round(wan.visible.x1 * 100) / 100, Math.round(wan.visible.y1 * 100) / 100]);
  const wrong = planOf(task, { R1: [answer.R1[1]] });
  assert.equal(wrong.line.code, 'wrong-path');
  assert.deepEqual(wrong.plan.stops.map(s => [s.deviceId, s.code]), [['R1', 'repair']], 'no stop: the repair router is ringed');
  assert.equal(wrong.plan.downLinks.length, 0, 'the normal scenario has every link up');
});

test('path layer: a demonstration’s safe drop is ringed as expected; success puts ✓ on every LAN and server box', () => {
  const { task, answer } = setup(3, 'defaults');
  const view = presentCheck(task, routing.check(task, answer));
  const demo = view.demonstrations[0], ends = task.record.demonstrations[0];
  const plan = planPath(geometryOf(task), task.network, 'cisco', demo.trace, { from: ends.from, to: ends.to, expected: true });
  assert.deepEqual(plan.stops.map(s => [s.deviceId, s.expected]), [['R2', true]]);
  for (const n of [1, 12, 16]) {
    const { task: t } = setup(n), geo = geometryOf(t);
    assert.equal(solvedMarks(geo).length, geo.endpoints.filter(e => e.type === 'lan' || e.type === 'server').length);
  }
});

test('path layer: the motion’s frames grow move by move, and the last frame is the static drawing', () => {
  const { task, answer } = setup(1);
  answer.R2 = [];
  const { plan } = planOf(task, answer);
  const total = plan.moves.length;
  const first = frameAt(plan, 0);
  assert.deepEqual([first.drawn.length, first.moving, first.stops.length, first.arrived.length, first.done], [0, plan.moves[0], 0, 0, false]);
  assert.equal(frameAt(plan, 3).arrived.length, 1, '✓ once the request’s three moves are done');
  assert.equal(frameAt(plan, 3).stops.length, 0, 'the ring waits for the reply');
  const last = frameAt(plan, total), beyond = frameAt(plan, total + 5);
  assert.deepEqual(last, beyond);
  assert.deepEqual([last.drawn, last.moving, last.stops, last.arrived, last.done], [plan.moves, null, plan.stops, plan.arrived, true]);
});

test('path layer: every probe and demonstration of every variant plans without an address, in both syntaxes', () => {
  let plans = 0;
  for (const record of tasks) for (const variant of record.variants) for (const syntax of syntaxList) {
    const task = routing.create(record, { variantId: variant.id });
    const geo = geometryOf(task, syntax.id);
    for (const answer of [{}, routing.solution(task)]) {
      const view = presentCheck(task, routing.check(task, answer), syntax.id);
      for (const line of view.lines.filter(l => l.trace)) {
        const ends = task.record.probes.find(p => p.id === line.probe?.id);
        const plan = planPath(geo, task.network, syntax.id, line.trace, { from: ends?.from, to: ends?.to, repairRouter: line.repairRouter, failed: line.status === 'fail' });
        plans++;
        assert.ok(plan.moves.every(m => Number.isFinite(m.x1) && Number.isFinite(m.y2)), `${variant.code} ${line.id}`);
        if (line.status === 'fail') assert.ok(plan.stops.length > 0, `${variant.code} ${line.id}: a failure is ringed`);
        assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(plan)));
      }
    }
  }
  assert.ok(plans > 400, `${plans} plans`);
});

// ── The check view (overlays, the drawn path) ───────────────

test('check view: one overlay at a time; picking a check closes the list and replays; a new check draws its first failure', () => {
  let s = initialCheckView('a');
  s = checkViewReducer(s, { type: 'toggle', overlay: 'rules' });
  assert.equal(s.overlay, 'rules');
  s = checkViewReducer(s, { type: 'toggle', overlay: 'checks' });
  assert.equal(s.overlay, 'checks', 'opening the list closes «Правила»');
  s = checkViewReducer(s, { type: 'pick', kind: 'line', id: 'normal/lan-1-2' });
  assert.deepEqual([s.overlay, s.shown, s.play], [null, { kind: 'line', id: 'normal/lan-1-2' }, 1]);
  s = checkViewReducer(s, { type: 'pick', kind: 'line', id: 'normal/lan-1-2' });
  assert.equal(s.play, 2, 'the same line again plays again');
  s = checkViewReducer(s, { type: 'toggle', overlay: 'text' });
  s = checkViewReducer(s, { type: 'checked' });
  assert.deepEqual([s.overlay, s.shown, s.play], ['text', null, 3]);
  assert.equal(checkViewReducer(s, { type: 'toggle', overlay: 'text' }).overlay, null, 'toggling the open one closes it');
  const other = checkViewReducer({ ...s, shown: { kind: 'demo', id: 'x' } }, { type: 'instance', key: 'b' });
  assert.deepEqual([other.key, other.shown, other.overlay], ['b', null, 'text'], 'another task: nothing picked, the overlay stays');
  assert.equal(checkViewReducer(s, { type: 'instance', key: 'a' }), s);
  assert.throws(() => checkViewReducer(s, { type: 'toggle', overlay: 'nope' }), RangeError);
});

test('check view: the drawn line is the picked one, else the first failure; demonstrations only after success', () => {
  const { task, answer } = setup(1);
  const failing = presentCheck(task, routing.check(task, { R1: answer.R1 }));
  assert.equal(shownOf(initialCheckView(), failing).id, failing.firstFailure.id);
  assert.equal(shownOf(initialCheckView(), null), null);
  const passing = presentCheck(task, routing.check(task, answer));
  assert.equal(shownOf(initialCheckView(), passing), null, 'success draws nothing until a line is picked');
  const picked = shownOf({ ...initialCheckView(), shown: { kind: 'line', id: passing.lines[0].id } }, passing);
  assert.deepEqual([picked.id, picked.picked, picked.failed], [passing.lines[0].id, true, false]);
  const { task: t3, answer: a3 } = setup(3, 'defaults');
  const demoView = presentCheck(t3, routing.check(t3, a3));
  assert.equal(shownOf({ ...initialCheckView(), shown: { kind: 'demo', id: demoView.demonstrations[0].id } }, demoView).kind, 'demo');
});

test('strip: «Тут буде результат… (перевірок: N)» before a check; then the count and presentCheck’s words, or the picked check', () => {
  const { task, answer } = setup(10);
  const pending = presentCheck(task, routing.check(task, {}));
  assert.deepEqual(surfaces.stripOf(null, pending, null), { tone: 'pending', count: null, text: ui.shared.notChecked(9) });
  assert.equal(ui.shared.notChecked(9), 'Тут буде результат. Натисни «Перевірити» (перевірок: 9).');
  const view = presentCheck(task, routing.check(task, answer));
  assert.deepEqual(surfaces.stripOf(view, pending, null), { tone: 'ok', count: { passed: 9, total: 9 }, text: view.strip });
  const failing = presentCheck(task, routing.check(task, { ...answer, R3: [] }));
  const strip = surfaces.stripOf(failing, pending, shownOf(initialCheckView(), failing));
  assert.deepEqual([strip.tone, strip.text], ['no', failing.strip]);
  assert.ok(strip.count.passed < strip.count.total);
});

// ── Both modes through the screen's hook ────────────────────

function probe(store, record, syntax, mode = 'guided', variantId) {
  let api;
  store.render(h.RoutingProbe, { record, syntax, mode, variantId, expose: a => { api = a; } });
  return api;
}

test('free mode: «+ Маршрут» adds a row; Enter or «Перевірити мережу» checks every row; untouched rows are ignored; «✕» deletes', () => {
  const [task1] = tasks;
  const store = h.testStore();
  let p = probe(store, task1, 'cisco', 'free');
  p.answers.addRoute('R1');
  p.answers.addRoute('R1');
  p = probe(store, task1, 'cisco', 'free');
  const [first, second] = p.answers.freeItems('R1');
  assert.deepEqual([first.key, second.key, first.route], ['R1.f1', 'R1.f2', null]);
  for (const [name, value] of Object.entries({ net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2' })) {
    p.answers.edit(first, name, value);
    p = probe(store, task1, 'cisco', 'free');
  }
  p.answers.addRoute('R2');
  p = probe(store, task1, 'cisco', 'free');
  for (const [name, value] of Object.entries({ net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.1' })) {
    p.answers.edit(p.answers.freeItems('R2')[0], name, value);
    p = probe(store, task1, 'cisco', 'free');
  }
  const { result, answer } = p.answers.checkNetwork();
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(answer, { R1: [{ dst: '192.168.2.0', prefix: 24, via: '10.0.0.2', distance: 1, id: 'R1.f1' }], R2: [{ dst: '192.168.1.0', prefix: 24, via: '10.0.0.1', distance: 1, id: 'R2.f3' }] }, 'the empty row never reached check()');
  const key = p.ex.key, instance = () => store.state.instances[key];
  assert.deepEqual(instance().answer.R1.map(r => r.id), ['R1.f1', 'R1.f2'], 'the empty row stays in the list');
  assert.deepEqual([instance().presses, instance().session.status], [1, 'solved']);
  assert.ok(!JSON.stringify(instance().drafts).includes('192.168'), 'checked text became the canonical answer');
  p = probe(store, task1, 'cisco', 'free');
  p.answers.edit(p.answers.freeItems('R1')[0], 'gw', '10.0.0.9');
  p = probe(store, task1, 'routeros', 'free');
  p.answers.removeRoute(p.answers.freeItems('R1')[0]);
  p = probe(store, task1, 'cisco', 'free');
  assert.deepEqual(p.answers.freeItems('R1').map(i => i.key), ['R1.f2']);
  assert.ok(!JSON.stringify(instance().drafts).includes('R1.f1'), 'deleting a route drops its drafts in every mode and syntax');
});

test('the form check stops the network check: rows marked, nothing canonical changes, the text stays; 255 is rejected', () => {
  const task15 = tasks[14];
  for (const mode of ['guided', 'free']) {
    const store = h.testStore();
    let p = probe(store, task15, 'cisco', mode);
    const rows = mode === 'guided'
      ? [p.answers.slotItem('R1', 0), p.answers.slotItem('R1', 1)]
      : (p.answers.addRoute('R1'), p.answers.addRoute('R1'), p = probe(store, task15, 'cisco', mode), p.answers.freeItems('R1'));
    const typed = [{ net: '0.0.0.0', mask: '0.0.0.0', gw: '100.64.1.1' }, { net: '0.0.0.0', mask: '0.0.0.0', gw: '100.64.2.1', dist: '255' }];
    rows.forEach((row, i) => {
      for (const [name, value] of Object.entries(typed[i])) {
        p.answers.edit(mode === 'guided' ? p.answers.slotItem('R1', i) : p.answers.freeItems('R1')[i], name, value);
        p = probe(store, task15, 'cisco', mode);
      }
    });
    const before = store.state.instances[p.ex.key].answer;
    const { result } = p.answers.checkNetwork();
    assert.deepEqual([result.code, result.formErrors.map(e => [e.routerId, e.code])], ['form-errors', [['R1', 'invalid-distance']]], mode);
    assert.equal(presentCheck(p.ex.task, result).strip, 'Спочатку виправ позначені маршрути');
    const instance = store.state.instances[p.ex.key];
    assert.deepEqual([instance.answer, instance.presses, instance.session.status], [before, 1, 'working'], `${mode}: one attempt, nothing canonical`);
    p = probe(store, task15, 'cisco', mode);
    const backup = mode === 'guided' ? p.answers.slotItem('R1', 1) : p.answers.freeItems('R1')[1];
    assert.deepEqual(p.answers.valuesOf(backup).dist, '255', 'the text stays');
    assert.deepEqual(p.answers.formErrorOf(backup), { code: 'invalid-distance', fields: ['dist'] });
    assert.equal(p.answers.formErrorOf(mode === 'guided' ? p.answers.slotItem('R1', 0) : p.answers.freeItems('R1')[0]), null);
    p.answers.edit(backup, 'dist', '254');
    p = probe(store, task15, 'cisco', mode);
    assert.equal(p.answers.formErrorOf(mode === 'guided' ? p.answers.slotItem('R1', 1) : p.answers.freeItems('R1')[1]), null, 'the mark goes with the text');
    assert.equal(p.answers.checkNetwork().result.ok, true, `${mode}: backup 254 passes`);
  }
  // The guided row check runs the same form check before the frozen checkRow (which accepts 255).
  const store = h.testStore();
  let p = probe(store, task15, 'routeros');
  for (const [name, value] of Object.entries({ dst: '0.0.0.0/0', gw: '100.64.2.1', dist: '255' })) { p.answers.edit('R1', 1, name, value); p = probe(store, task15, 'routeros'); }
  assert.equal(h.routing.checkRow(p.ex.task, 'R1', 1, p.answers.valuesOf('R1', 1), 'routeros').ok, true, 'frozen checkRow: 255 is fine');
  const shown = p.answers.check('R1', 1);
  assert.deepEqual([shown.ok, shown.detail.distOk, shown.reasons.dist], [false, false, 'invalid-distance']);
});

test('carry-over between modes: routes keep their ids; a free route lands in its row or under «Інші маршрути»', () => {
  const task4 = tasks[3];
  const { answer: reference } = setup(4);
  const store = h.testStore();
  let p = probe(store, task4, 'cisco');
  for (const [name, value] of Object.entries(syntaxes.cisco.fromRoute(reference.R1[0]))) { p.answers.edit('R1', 0, name, value); p = probe(store, task4, 'cisco'); }
  p.answers.check('R1', 0);
  p = probe(store, task4, 'cisco', 'free');
  assert.deepEqual(p.answers.freeItems('R1').map(i => [i.key, i.route.dst]), [['R1.f1', reference.R1[0].dst]], 'the row-checked route is in the free list');
  // Two routes in free mode: one that a guided row takes, one no row takes.
  for (const route of [reference.R1[2], { dst: '10.9.0.0', prefix: 24, via: '10.0.0.2' }]) {
    p.answers.addRoute('R1');
    p = probe(store, task4, 'cisco', 'free');
    const item = p.answers.freeItems('R1').at(-1);
    for (const [name, value] of Object.entries(syntaxes.cisco.fromRoute(route))) { p.answers.edit(item, name, value); p = probe(store, task4, 'cisco', 'free'); }
  }
  // Unchecked free text stays free mode's own.
  assert.deepEqual(probe(store, task4, 'cisco').answers.extraItems('R1'), []);
  p.answers.checkNetwork();
  p = probe(store, task4, 'routeros');
  assert.equal(p.answers.slotItem('R1', 0).key, 'R1.f1');
  assert.equal(p.answers.slotItem('R1', 2).key, 'R1.f2', 'by destination');
  assert.equal(p.answers.slotItem('R1', 1).route, null);
  assert.deepEqual(p.answers.extraItems('R1').map(i => [i.key, i.n]), [['R1.f3', 4]]);
  assert.deepEqual(p.answers.valuesOf(p.answers.extraItems('R1')[0]), { dst: '10.9.0.0/24', gw: '10.0.0.2', dist: '' });
});

test('guided rows: a checked wrong destination stays in its row; ✗ marks hide once the network passes', () => {
  const task1 = tasks[0];
  const store = h.testStore();
  let p = probe(store, task1, 'cisco');
  // R1's row (to LAN-B) given LAN-A's network: wrong for the row, but it stays there.
  for (const [name, value] of Object.entries({ net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.2' })) { p.answers.edit('R1', 0, name, value); p = probe(store, task1, 'cisco'); }
  assert.equal(p.answers.check('R1', 0).ok, false);
  p = probe(store, task1, 'cisco');
  assert.equal(p.answers.slotItem('R1', 0).route.dst, '192.168.1.0', 'checking never moves its text');
  assert.equal(p.answers.resultOf('R1', 0).ok, false);
  // The suggested row is wrong, yet a /25 pair the student adds as free routes makes the network pass.
  p = probe(store, task1, 'cisco', 'free');
  for (const half of ['192.168.2.0', '192.168.2.128']) {
    p.answers.addRoute('R1'); p = probe(store, task1, 'cisco', 'free');
    for (const [name, value] of Object.entries({ net: half, mask: '255.255.255.128', gw: '10.0.0.2' })) { p.answers.edit(p.answers.freeItems('R1').at(-1), name, value); p = probe(store, task1, 'cisco', 'free'); }
  }
  p.answers.addRoute('R2'); p = probe(store, task1, 'cisco', 'free');
  for (const [name, value] of Object.entries({ net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.1' })) { p.answers.edit(p.answers.freeItems('R2')[0], name, value); p = probe(store, task1, 'cisco', 'free'); }
  // R1's wrong first route points LAN-A back to R2: the connected LAN wins, so the pings pass.
  assert.equal(p.answers.checkNetwork().result.ok, true);
  p = probe(store, task1, 'cisco');
  assert.equal(p.answers.slotItem('R1', 0).key, 'R1.f1', 'an unedited free row keeps its row');
  assert.equal(p.answers.resultOf('R1', 0), null, 'row ✗ hidden after a passing network check');
  assert.equal(store.state.instances[p.ex.key].parts['R1.row1'].ok, false, 'the verdict itself is kept');
});

test('guided rows: a verdict shows only while the row holds the route it checked; a gateway changed in free mode loses its ✓ (O1)', () => {
  const task4 = tasks[3];
  const { answer: reference } = setup(4);
  const store = h.testStore();
  let p = probe(store, task4, 'cisco');
  for (const [name, value] of Object.entries(syntaxes.cisco.fromRoute(reference.R2[0]))) { p.answers.edit('R2', 0, name, value); p = probe(store, task4, 'cisco'); }
  assert.equal(p.answers.check('R2', 0).ok, true, 'R2 → LAN1 checked right');
  assert.equal(probe(store, task4, 'cisco').answers.resultOf('R2', 0).ok, true);
  assert.equal(probe(store, task4, 'routeros').answers.resultOf('R2', 0).ok, true, 'the same route in the other syntax keeps its ✓');
  const regateway = via => {
    p = probe(store, task4, 'cisco', 'free');
    p.answers.edit(p.answers.freeItems('R2')[0], 'gw', via);
    p = probe(store, task4, 'cisco', 'free');
    p.answers.checkNetwork();
  };
  // Free mode: the gateway changed and network-checked; back in guided mode the row shows it, without the old ✓.
  regateway('10.0.0.6');
  for (const syntax of ['cisco', 'routeros']) {
    p = probe(store, task4, syntax);
    assert.equal(p.answers.slotItem('R2', 0).route.via, '10.0.0.6', `${syntax}: the row shows the changed route`);
    assert.equal(p.answers.resultOf('R2', 0), null, `${syntax}: no verdict for a route that wasn't checked`);
  }
  assert.equal(store.state.instances[p.ex.key].parts['R2.row1'].ok, true, 'the recorded verdict itself is kept');
  // The checked route again: its verdict holds again. A row check grades whatever is there now.
  regateway(reference.R2[0].via);
  assert.equal(probe(store, task4, 'routeros').answers.resultOf('R2', 0).ok, true);
  regateway('10.0.0.6');
  p = probe(store, task4, 'cisco');
  assert.equal(p.answers.check('R2', 0).ok, false);
  assert.equal(probe(store, task4, 'cisco').answers.resultOf('R2', 0).ok, false, 'a fresh check shows its own verdict');
  // Text that doesn't parse keeps its ✗ while it stays as typed.
  p = probe(store, task4, 'cisco');
  p.answers.edit('R2', 1, 'net', '192.168.3');
  p = probe(store, task4, 'cisco');
  assert.equal(p.answers.check('R2', 1).ok, false);
  assert.equal(probe(store, task4, 'cisco').answers.resultOf('R2', 1).ok, false);
});

// ── The screen ──────────────────────────────────────────────

test('routing screen: the mode switch, the check area and the Rules’ best-practice lines', () => {
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: tasks[0].id, router: 'R1', filterLevel: 0, variants: {} } });
  let html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(html.includes('aria-label="Режим"') && html.includes('>Із готовими рядками<') && html.includes('>Без готових рядків<'));
  // O6: the mode switch is a global preference, beside the syntax switch in the bar's controls, not on the task bar.
  const [controls, taskbar] = [html.indexOf('class="ng-rt-controls"'), html.indexOf('class="ng-rt-taskbar"')];
  assert.ok(controls < html.indexOf('aria-label="Синтаксис"') && html.indexOf('aria-label="Синтаксис"') < html.indexOf('aria-label="Режим"') && html.indexOf('aria-label="Режим"') < taskbar);
  // Round 4 (spec R1): the one check is the help panel's «Перевірити» under the rows; «Усі перевірки» is in «⋯».
  assert.ok(html.includes('class="ng-button ng-button-primary ng-help-check">Перевірити<') && !html.includes('Перевірити мережу') && html.includes('aria-label="Інші дії"'));
  assert.ok(html.indexOf('class="ng-rt-rows"') < html.indexOf('data-help-panel'), 'the panel under the rows');
  assert.ok(html.includes('💡 </span>Підказка 1 з 3'));
  assert.ok(!html.includes('ng-path-legend'), 'no legend without a path');
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, 'one status: the panel\'s');
  store.dispatch({ type: 'pref', name: 'mode', value: 'free' });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  // Round 5 5b-2 (spec C): free mode's add control is the quiet link «+ ще один маршрут (якщо потрібен)».
  assert.ok(html.includes('>+ ще один маршрут (якщо потрібен)<') && !html.includes('>+ Маршрут<') && !html.includes('Маршрут до '));
  for (const syntax of syntaxList) {
    const rules = normalise(surfaces.renderRules(syntax));
    for (const line of [ui.shared.rulesDefaultDirection, ui.shared.rulesExactSummary, ui.shared.rulesDefaultSafety]) assert.ok(rules.includes(line), `${syntax.id}: ${line}`);
  }
});

test('routing screen: a failing network check draws its path statically on the server; success marks the LANs and offers the other syntax and «Далі»', () => {
  const [task1] = tasks;
  const { task, answer } = setup(1);
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task1.id, router: 'R2', filterLevel: 0, variants: {} } });
  const act = action => store.dispatch({ type: 'instance', key: task.instanceKey, action });
  const failing = routing.check(task, { R1: answer.R1 });
  act({ type: 'checked', answer: { R1: answer.R1 }, result: failing });
  let html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  const view = presentCheck(task, failing);
  assert.ok(html.includes(view.firstFailure.text), 'the verdict: the first failure in words');
  assert.ok(html.includes('class="ng-path-layer"') && html.includes('ng-path-line is-request') && html.includes('ng-path-line is-reply'), 'request and reply drawn');
  assert.equal((html.match(/class="ng-path-stop"/g) ?? []).length, 1, 'one amber ring');
  assert.ok(html.includes('суцільна — запит') && html.includes('пунктир — відповідь'));
  assert.ok(!html.includes('ng-rt-success'));
  assert.ok(html.includes('ng-help-reveal-link') && !/зарахов/.test(html), 'the reveal offered (round 4: no penalty wording)');
  assert.ok(html.includes('ng-help-hint-button'));
  act({ type: 'checked', answer, result: routing.check(task, answer) });
  act({ type: 'view', patch: { proven: JSON.stringify(answer) } });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(html.includes('Мережа працює: усі пінги проходять в обидва боки.'));
  // Round 4: one success box in the panel under the rows, its detail open; «Далі →» primary.
  const [work, card, success] = ['class="ng-rt-work"', 'ng-rt-card', 'class="ng-rt-success"'].map(x => html.indexOf(x));
  assert.ok(work < card && card < success, 'the success box in the work panel, under the rows');
  assert.ok(html.includes('class="ng-button ng-button-primary ng-help-next">Далі'), '«Далі →» primary');
  assert.ok(!html.includes('ng-help-hint-button'), 'O5: no hint button after the success');
  assert.ok(!html.includes('ng-help-reveal-link'), 'nothing to reveal after the success');
  assert.equal((html.match(/class="ng-path-mark is-ok"/g) ?? []).length, 2, '✓ on LAN-A and LAN-B');
  assert.ok(html.includes('Показати мовою MikroTik') && html.includes('aria-expanded="false" aria-controls="ng-rt-other-syntax"') && html.includes('class="ng-rt-link ng-rt-other-toggle"'), 'a quiet link, collapsed by default');
  assert.ok(!html.includes('/ip route add'), 'the commands are not in the page until opened');
  assert.ok(!/✅ \d|спроб:/.test(html) && (html.match(/class="ng-done"/g) ?? []).length === 1, 'round 4: no score; the task’s ✓ in the list');
  // A later edit of the answer (a row check) takes the other-syntax block away: it showed only proven routes.
  act({ type: 'row-checked', routerId: 'R1', route: { ...answer.R1[0], id: 'R1.f9', via: '10.0.0.2' }, part: 'R1.row1', partResult: { ok: true } });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(!html.includes('Показати мовою MikroTik'));
});

test('routing screen: open hints fold at the top of the work panel, not under the diagram (O3)', () => {
  const [task1] = tasks;
  const { task, answer } = setup(1);
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task1.id, router: 'R1', filterLevel: 0, variants: {} } });
  const act = action => store.dispatch({ type: 'instance', key: task.instanceKey, action });
  act({ type: 'checked', answer: { R1: answer.R1 }, result: routing.check(task, { R1: answer.R1 }) });
  for (let i = 0; i < 2; i++) act({ type: 'session', action: { type: 'hint' } });
  const html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  // Round 4: the hints are the help panel's, under the rows; opened rungs are reachable (folded behind the current item).
  const [work, card, rows, hints] = ['class="ng-rt-work"', 'ng-rt-card', 'class="ng-rt-rows"', 'data-help="hint"'].map(x => html.indexOf(x));
  assert.ok(work < card && card < rows && rows < hints, 'hints in the panel under the rows');
  assert.equal((html.match(/data-help="hint"/g) ?? []).length, 2, 'both opened rungs reachable');
  assert.ok(html.includes('💡 </span>Підказка 3 з 3'), 'the button for the next rung in the panel\'s row');
  assert.ok(!html.includes('ng-rt-success'));
});

test('«Усі перевірки»: each line’s short state; the sentence only once picked (and in the strip) (O7)', () => {
  const { task, answer } = setup(1);
  const result = routing.check(task, { R1: answer.R1 });
  const view = presentCheck(task, result);
  const line = view.lines.find(l => l.status === 'fail');
  assert.equal(line.state, '✗ відповідь зупинилась на R2');
  const [list, picked] = surfaces.renderChecks(task, syntaxes.cisco, result).split('\n');
  assert.ok(unescape(list).includes('✗ відповідь зупинилась на R2') && unescape(list).includes(line.label));
  assert.ok(!unescape(list).includes(line.text), 'no sentence in the list until picked');
  assert.ok(unescape(picked).includes(line.text) && picked.includes('aria-pressed="true"'));
  const strip = surfaces.stripOf(view, null, shownOf(checkViewReducer(initialCheckView(), { type: 'pick', id: line.id }), view));
  assert.equal(strip.text, `✗ ${line.text}`);
});

