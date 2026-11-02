// Round 2 step 7 fix round (Fable's and Astra's reviews, Vlad's zoom):
// task 15's distance rule, the hedged loop sentence, the diagram zoom (pure,
// and kept per task instance in the store), and the overlays' markup. Step 6
// cut the stub badge, the Cisco mask line and the per-row hints.
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { textFor } from './helpers/routing.mjs';
import { topology } from '../src/sections/routing/logic/topology.js';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { ui } from '../src/sections/routing/uk.js';
import { initialStore, storeReducer } from '../src/app/store.js';
import { scoreOf } from '../src/ui/exercise-state.js';
import { initialSession } from '../src/ui/session.js';
import { diagramFit, diagramView, MAX_SCALE, MAX_ZOOM_PX, MIN_TEXT_PX, scrollToShow, zoomBy, zoomIn, zoomOut } from '../src/ui/topology/size.js';
import { normalise } from './helpers/routing-leaks.mjs';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';
import * as h from '../.test-bundles/harness/contract.mjs';

test('step 6 cuts: no stub badge, no Cisco mask line and no per-row hint, over every task, variant, router, mode and syntax', () => {
  let views = 0;
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    for (const syntax of syntaxList) {
      const scaffold = routing.scaffold(task, syntax.id);
      for (const router of Object.keys(scaffold)) for (const mode of ['guided', 'free']) {
        const html = normalise(surfaces.renderRows(task, syntax, router, scaffold, null, {}, mode));
        views++;
        for (const cut of ['тупіковий: досить default', 'Маска — повна', '💡', 'Підказка']) assert.ok(!html.includes(cut), `#${variant.code} ${syntax.id} ${router} ${mode}: ${cut}`);
        if (mode === 'free') assert.ok(html.includes(ui.shared.addRoute) && !html.includes(ui.shared.routeTo), 'free rows: «+ Маршрут», no destination label');
        // Round 4 (spec R1): one check, the panel's; a guided row checks itself on blur, with no button of its own.
        else assert.ok(!html.includes('Перевірити'), 'guided rows have no row check button');
      }
    }
  }
  assert.ok(views >= 18 * 2 * 2 * 2, `${views} router views`);
  assert.ok(!('stubRows' in ui.cisco) && !('maskLine' in ui.cisco) && !('hint' in ui.shared), 'the cut strings are gone');
});

test('task 15: both syntaxes state relative distance order and bounds, and name no gateway', () => {
  const record = tasks.find(t => t.displayNumber === 15);
  for (const syntax of syntaxList) for (const text of [record.text, record.variants[0].text]) {
    const words = textFor(text, syntax.id);
    assert.ok(words.includes('Основному дай меншу distance'), `${syntax.id}: primary rule`);
    assert.ok(words.includes('резервному — більшу, від 2 до 254'), `${syntax.id}: backup rule`);
    assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(words), `${syntax.id}: no address`);
  }
  // Task 11 drops «Складна» in both syntaxes (Fable).
  const star = tasks.find(t => t.displayNumber === 11);
  for (const syntax of syntaxList) assert.ok(textFor(star.variants[0].text, syntax.id).startsWith('Зірка: R-GW у центрі з інтернетом, 3 філії.'));
});

test('Rules: the loop sentence is a possibility, when the next router sends the traffic back; the content for the «⋯» disclosure', () => {
  for (const syntax of syntaxList) {
    const html = surfaces.renderRules(syntax);
    const text = normalise(html);
    assert.match(text, /Петля: надто широкий сумарний маршрут або два default, що вказують один на одного, можуть зациклити пакет — якщо наступний роутер відсилає цей трафік назад \(наприклад, своїм default\)\./);
    assert.ok(!text.includes('пакет до неї ходить по колу'), 'the old certain wording is gone');
    // Round 4 (spec R1, A4): «Правила» is a «⋯» item; MoreMenu gives the disclosure its heading and «Закрити».
    assert.ok(html.startsWith('<div class="ng-rt-rules-panel">') && !html.includes('ng-overlay'), `${syntax.id}: plain content for the menu's disclosure`);
  }
});

// ── Zoom ────────────────────────────────────────────────────────────────

const VB = { w: 200, h: 100 };
const MIN = 2.5; // NetGym's smallest text (prefix), in diagram units

test('zoom: the default view is the step 7 size rule; «Уся схема» fits the whole diagram even below 12 px', () => {
  for (const frame of [{ width: 600, height: 400 }, { width: 1200, height: 900 }, { width: 480, height: Infinity }]) {
    const fit = diagramFit(VB, MIN, frame), view = diagramView(VB, MIN, frame, undefined);
    assert.deepEqual([view.scale, view.pan, view.minPx], [fit.scale, fit.pan, fit.minPx], JSON.stringify(frame));
  }
  // 600 px wide: the whole diagram would be 7.5 px text, so the default pans at 12 px.
  const frame = { width: 600, height: 400 };
  const pannable = diagramView(VB, MIN, frame, undefined);
  assert.deepEqual([pannable.pan, pannable.minPx, pannable.all], [true, MIN_TEXT_PX, false]);
  const all = diagramView(VB, MIN, frame, 'all');
  assert.deepEqual([all.pan, all.all, all.scale, all.width, all.minPx], [false, true, 3, 600, 7.5]);
  assert.deepEqual([all.canZoomOut, all.canZoomIn], [false, true]);
  // A big frame fits at MAX_SCALE: the default is already the whole diagram.
  const roomy = diagramView(VB, MIN, { width: 4000, height: 4000 }, undefined);
  assert.deepEqual([roomy.all, roomy.scale, roomy.canZoomOut], [true, MAX_SCALE, false]);
});

test('zoom: «+» and «−» step through 12 · 1.25ⁿ px text, down to the whole diagram and up to MAX_ZOOM_PX', () => {
  const frame = { width: 600, height: 400 }; // the whole diagram: scale 3, 7.5 px text
  const at = zoom => diagramView(VB, MIN, frame, zoom);
  assert.equal(zoomIn(at(undefined)), 15);
  assert.equal(zoomIn(at(15)), 18.75);
  assert.equal(zoomIn(at(13)), 15, 'off the ladder (Ctrl + wheel): up to the next step');
  assert.equal(zoomOut(at(15)), 12);
  assert.equal(zoomOut(at(13)), 12);
  assert.equal(zoomOut(at(undefined)), 9.6);
  assert.equal(zoomOut(at(9.6)), 12 / 1.25 ** 2);
  assert.equal(zoomOut(at(12 / 1.25 ** 2)), 'all', 'the next step, 6.14 px, is smaller than the whole diagram (7.5 px)');
  assert.equal(zoomIn(at('all')), 12 / 1.25 ** 2, 'from the whole diagram, the next step up (7.68 px)');
  // The top: no step past MAX_ZOOM_PX.
  let zoom;
  for (let i = 0; i < 20; i++) zoom = zoomIn(at(zoom));
  assert.equal(zoom, MAX_ZOOM_PX);
  assert.deepEqual([at(zoom).canZoomIn, at(zoom).minPx], [false, MAX_ZOOM_PX]);
  assert.equal(at(99).minPx, MAX_ZOOM_PX, 'a stored size beyond the top is clamped');
  assert.equal(at(3).all, true, 'a stored size below the whole diagram shows the whole diagram');
  // Ctrl + wheel: by a factor, clamped the same way.
  assert.ok(Math.abs(zoomBy(at(12), 1.1) - 13.2) < 1e-9);
  assert.equal(zoomBy(at(12), 0.1), 'all');
  assert.equal(zoomBy(at(30), 2), MAX_ZOOM_PX);
});

test('zoom: scrolling a point into view (the selected router now, the packet’s hop in step 6)', () => {
  const visible = { left: 100, top: 50, width: 400, height: 300 };
  assert.equal(scrollToShow({ x: 300, y: 200, margin: 40 }, visible, { ifHidden: true }), null, 'in view: stay');
  assert.deepEqual(scrollToShow({ x: 300, y: 200, margin: 40 }, visible), { left: 100, top: 50 }, 'centred on request');
  assert.deepEqual(scrollToShow({ x: 900, y: 600, margin: 40 }, visible, { ifHidden: true }), { left: 700, top: 450 });
  assert.deepEqual(scrollToShow({ x: 480, y: 200, margin: 40 }, visible, { ifHidden: true }), { left: 280, top: 50 }, 'its ring would be cut off');
});

test('zoom state: kept per task instance in the store, through the instance’s view; not a check, not a hint', () => {
  const [a, b] = ['instance-a', 'instance-b'];
  let state = storeReducer(initialStore(), { type: 'instance', key: a, action: { type: 'view', patch: { zoom: 15 } } });
  const instance = state.instances[a];
  assert.equal(instance.view.zoom, 15);
  assert.deepEqual(instance.session, initialSession(), 'no attempt, hint, reveal or assisted mark');
  assert.deepEqual([instance.presses, instance.parts, instance.result], [0, {}, null]);
  assert.deepEqual(scoreOf(Object.values(state.instances)), { correct: 0, total: 16, presses: 0 }, 'the score doesn’t move');
  assert.equal(state.instances[b], undefined, 'another task instance keeps its own (default) zoom');
  state = storeReducer(state, { type: 'instance', key: b, action: { type: 'view', patch: { zoom: 'all' } } });
  assert.deepEqual([state.instances[a].view.zoom, state.instances[b].view.zoom], [15, 'all']);
  // A check, a hint, «↺» and a syntax switch keep it.
  state = storeReducer(state, { type: 'instance', key: a, action: { type: 'checked', answer: {}, result: { ok: false, complete: false }, part: 'R1/0', partResult: { ok: false }, syntax: 'cisco' } });
  state = storeReducer(state, { type: 'instance', key: a, action: { type: 'session', action: { type: 'hint' } } });
  state = storeReducer(state, { type: 'instances', keys: [a, b], action: { type: 'clear-results' } });
  state = storeReducer(state, { type: 'pref', name: 'syntax', value: 'routeros' });
  assert.deepEqual([state.instances[a].view.zoom, state.instances[b].view.zoom], [15, 'all']);
});

test('zoom state: the routing screen draws each task instance at its own stored zoom', () => {
  const store = h.testStore();
  const key = (record, variantId = record.variants[0].id) => h.routing.create(record, { variantId, bankId: h.routingBank.bankId, bankRevision: h.routingBank.bankRevision }).instanceKey;
  const [task16, task15] = [tasks.find(t => t.displayNumber === 16), tasks.find(t => t.displayNumber === 15)];
  store.dispatch({ type: 'instance', key: key(task16), action: { type: 'view', patch: { zoom: 'all' } } });
  const zoomOf = record => {
    store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router: null, filterLevel: 0, variants: {} } });
    return store.render(h.RoutingScreen, { bank: h.routingBank }).match(/data-zoom="([^"]*)"/)[1];
  };
  assert.equal(zoomOf(task16), 'all');
  assert.equal(zoomOf(task15), 'default');
  store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' });
  assert.equal(zoomOf(task16), 'all', 'the syntax switch keeps the task’s zoom');
  // The frame takes focus (for «+» and «−»). Round 4 (spec A3): a stored zoom
  // means the learner has zoomed, so the bar shows «−» and «+», labelled for
  // screen readers; «Уся схема» only while it would change something (nothing
  // is measured on the server, so not here).
  const html = store.render(h.RoutingScreen, { bank: h.routingBank });
  assert.match(html, /class="ng-dg-frame[^"]*" data-zoom="all" tabindex="0" role="region" aria-label="Схема завдання: «\+» і «−» змінюють масштаб"/);
  for (const label of ['Зменшити', 'Збільшити']) assert.ok(html.includes(`aria-label="${label}"`), label);
  assert.ok(!html.includes('>Уся схема</button>'), '«Уся схема» is not rendered while disabled');
  // A task at its default zoom, before any measurement: no bar at all.
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task15.id, router: null, filterLevel: 0, variants: {} } });
  const fresh = store.render(h.RoutingScreen, { bank: h.routingBank });
  assert.ok(!fresh.includes('class="ng-dg-zoom"') && !fresh.includes('aria-label="Зменшити"'), 'no zoom bar before the diagram is measured, and none without a zoom');
});
