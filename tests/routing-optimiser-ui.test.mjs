// OPT-1 UI (spec-opt1-ui v1 with its v2 overrides U1–U9): the review's
// display (which review, which tips in which mode, their rows), its queue
// (steps only while nothing plays; cancelled by a new check or an edit, not
// by navigation; final result only), the instance's guarded write, the
// discard input as rendered, and the tips, ★ and reveal through the leak
// gate, and where the blackhole box shows (polish-2 P2). The mounted
// lifecycle (lap, skip, reduced motion, edits, navigation,
// tip focus, the reveal) is in routing-mounted (tests/helpers/mounted-routing.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { presentCheck } from './helpers/routing.mjs';
import { reviewSteps } from './helpers/routing-review.mjs';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { currentReview, starFor, tipItems, tipsFor } from '../src/sections/routing/screens/reviewView.js';
import { teachesDiscard } from '../src/sections/routing/screens/facts.js';
import { createReviewQueue } from '../src/sections/routing/screens/reviewQueue.js';
import { initialInstance, instanceReducer } from '../src/ui/exercise-state.js';
import { optimiserUi, ui } from '../src/sections/routing/uk.js';
import { createLeakSweep, leaks, normalise } from './helpers/routing-leaks.mjs';

import * as p from '../.test-bundles/harness/polish.mjs';

const inspectLeaks = createLeakSweep();

const create = (n, variantId) => routing.create(tasks[n - 1], variantId ? { variantId } : {});
/** reviewSteps to its final return. */
const drain = steps => { for (;;) { const step = steps.next(); if (step.done) return step.value; } };

// ── Which review is on display ───────────────────────────────

test('review display: only the latest check’s, while its answer is unedited; a fresh check and «↺» drop it (U1, U4)', () => {
  const ok = { ok: true, complete: true, code: 'ok', findings: [], evidence: {} };
  let s = instanceReducer(initialInstance(), { type: 'checked', answer: {}, result: ok });
  assert.deepEqual([s.generation, s.edits], [1, undefined]);
  s = instanceReducer(s, { type: 'review', generation: 1, edits: 0, tips: [{ code: 'duplicate-route' }], star: false });
  assert.deepEqual(currentReview(s), { generation: 1, edits: 0, tips: [{ code: 'duplicate-route' }], star: false });
  // Typing, adding and deleting always count; a row check counts only if it
  // changes the routes or the drafts; checks and views never do.
  const route = { id: 'R1.f1', dst: '192.0.2.0', prefix: 24, via: '198.51.100.1', distance: 1 };
  for (const action of [
    { type: 'draft', mode: 'free', syntax: 'cisco', routeId: 'R1.f1', value: { net: '1' } },
    { type: 'route-upsert', routerId: 'R1', route: {} },
    { type: 'route-deleted', routeId: 'R1.f9' },
    { type: 'row-checked', routerId: 'R1', route, part: 'R1.row1', partResult: { ok: true } },
  ]) {
    const edited = instanceReducer(s, action);
    assert.equal(edited.edits, (s.edits ?? 0) + 1, action.type);
    assert.equal(currentReview(edited), null, `${action.type} hides the review`);
  }
  assert.equal(instanceReducer(s, { type: 'view', patch: { zoom: 12 } }).edits, undefined);
  // A row check of what the row already holds: its verdict is recorded, the review stays (decision 5, changed).
  const held = instanceReducer(instanceReducer(initialInstance(), { type: 'checked', answer: { R1: [route] }, result: ok }), { type: 'review', generation: 1, edits: 0, tips: [], star: true });
  for (const action of [
    { type: 'row-checked', routerId: 'R1', route: { ...route, slot: 'R1.row1' }, part: 'R1.row1', partResult: { ok: true } },
    { type: 'row-checked', routerId: 'R1', part: 'R1.row2', partResult: { ok: false } },
  ]) {
    const checked = instanceReducer(held, action);
    assert.equal(checked.edits, undefined, JSON.stringify(action));
    assert.equal(currentReview(checked)?.star, true, 'the review and its ★ stay');
    assert.ok(checked.parts[action.part], 'the verdict is recorded');
  }
  // Stale writes: an older check, or an answer edited since.
  const later = instanceReducer(s, { type: 'checked', answer: {}, result: ok });
  assert.deepEqual([later.generation, later.view.review], [2, undefined], 'a fresh check drops the old review before its own result');
  assert.equal(instanceReducer(later, { type: 'review', generation: 1, edits: 0, tips: [], star: true }), later, 'an older generation is ignored');
  const typed = instanceReducer(later, { type: 'draft', mode: 'free', syntax: 'cisco', routeId: 'R1.f1', value: { net: '1' } });
  assert.equal(instanceReducer(typed, { type: 'review', generation: 2, edits: 0, tips: [], star: true }), typed, 'an answer edited since is ignored');
  const cleared = instanceReducer(s, { type: 'clear-results' });
  assert.deepEqual([cleared.view.review, cleared.generation], [undefined, s.generation + 1], '«↺» drops it and advances the generation');
  assert.equal(instanceReducer(cleared, { type: 'review', generation: cleared.generation, edits: cleared.edits ?? 0, tips: [], star: true }), cleared, 'no review without a passing current result');
  assert.equal(currentReview({ ...s, result: { ok: false } }), null, 'only for a passing check');
});

test('guided mode follows its scaffold (U3): 8, 8b, 16 and 17 as scaffolded get no same-in-fewer, shorter-known or ★; free mode the whole review', () => {
  for (const [n, variantId] of [[8, 'specific'], [8, 'stub-defaults'], [16], [17]]) {
    const task = create(n, variantId), answer = routing.solution(task);
    const review = drain(reviewSteps(task, answer));
    const label = `${n}${variantId ? ` ${variantId}` : ''}`;
    assert.deepEqual(tipsFor(review, 'guided', task), [], `${label}: guided, nothing implies the scaffold was wrong`);
    assert.equal(starFor(review, 'guided'), false);
    assert.deepEqual(tipsFor(review, 'free', task), review.tips, `${label}: free mode, the whole review`);
    assert.equal(starFor(review, 'free'), review.star);
  }
  assert.ok(drain(reviewSteps(create(8, 'specific'), routing.solution(create(8, 'specific')))).tips.some(t => t.code === 'same-in-fewer'), 'task 8 has more to say in free mode');
  // More rows than the scaffold, or a duplicate: guided mode says so too.
  const task = create(8, 'specific');
  const crafted = [
    { code: 'same-in-fewer', scope: 'router', routerId: 'R1', params: { routerId: 'R1', now: 6, could: 4 } },
    { code: 'same-in-fewer', scope: 'router', routerId: 'R1', params: { routerId: 'R1', now: 5, could: 4 } },
    { code: 'shorter-known', scope: 'task', params: { total: 15, count: 19 } },
    { code: 'shorter-known', scope: 'task', params: { total: 15, count: 18 } },
    { code: 'duplicate-route', scope: 'route', routerId: 'R1', routeId: 'R1.f1', params: { routerId: 'R1' } },
  ];
  assert.deepEqual(tipsFor({ tips: crafted }, 'guided', task).map(t => [t.code, t.params.now ?? t.params.count ?? null]), [['same-in-fewer', 6], ['shorter-known', 19], ['duplicate-route', null]]);
});

test('tips name the row the student sees (guided slots, then «Інші маршрути»; the free list), by route id; a tip with no row isn’t shown (U5)', () => {
  const tips = [
    { code: 'duplicate-route', scope: 'route', routerId: 'R1', routeId: 'R1.f7', params: { routerId: 'R1' } },
    { code: 'route-to-connected', scope: 'route', routerId: 'R2', routeId: 'R2.gone', params: { routerId: 'R2' } },
    { code: 'same-in-fewer', scope: 'router', routerId: 'R2', params: { routerId: 'R2', now: 3, could: 2 } },
    { code: 'shorter-known', scope: 'task', params: { total: 2, count: 3 } },
  ];
  const guided = { R1: [{ kind: 'slot', index: 0, key: 'R1.f1', route: { id: 'R1.f1' } }, { kind: 'route', n: 2, key: 'R1.f7', route: { id: 'R1.f7' } }], R2: [] };
  const items = tipItems(tips, { rowsOf: r => guided[r], bestAvailable: true });
  assert.deepEqual(items.map(t => [t.kind, t.label, t.target]), [
    ['row', 'R1, маршрут №2', { kind: 'row', router: 'R1', key: 'R1.f7' }],
    ['router', 'R2', { kind: 'router', router: 'R2' }],
    ['best', null, null],
  ]);
  // After its place, a tip doesn't name the router again.
  assert.deepEqual(items.map(t => t.plain), [
    'R1, маршрут №2: повторює інший — один можна прибрати.',
    'R2: та сама поведінка вміщується в 2 маршрути замість 3.',
    'Відомий безпечний варіант має 2 маршрути, у тебе — 3.',
  ]);
  const free = { R1: [{ kind: 'route', n: 1, key: 'R1.f7', route: { id: 'R1.f7' } }], R2: [] };
  assert.equal(tipItems(tips, { rowsOf: r => free[r], bestAvailable: false })[0].label, 'R1, маршрут №1', 'the same route in the free list');
  assert.equal(tipItems(tips, { rowsOf: r => free[r], bestAvailable: false }).at(-1).kind, 'text', 'no reveal on the screen: a shorter-known tip is words');
});

// ── The queue ────────────────────────────────────────────────

/** A queue with a manual scheduler, a fake store and counting reviews. */
function harness() {
  const passing = { ok: true };
  const scheduled = [], written = [], store = { a: { generation: 1, edits: 0, result: passing }, b: { generation: 1, edits: 0, result: passing } };
  let busy = false;
  const queue = createReviewQueue({
    instanceOf: key => store[key], write: (key, review) => written.push([key, review]), isBusy: () => busy,
    schedule: fn => { const job = { fn, cancelled: false }; scheduled.push(job); return () => { job.cancelled = true; }; },
  });
  const steps = (n, result) => { const it = { calls: 0, next() { it.calls++; return it.calls < n ? { done: false, value: { tips: [], star: false } } : { done: true, value: result }; } }; return it; };
  const runNext = () => { const job = scheduled.shift(); if (job && !job.cancelled) job.fn(); return Boolean(job); };
  return { queue, scheduled, written, store, steps, runNext, setBusy: b => { busy = b; } };
}

test('review queue: one step per scheduled callback, only while nothing plays; final result only; replaced, cancelled and disposed as U1 says', () => {
  let h = harness();
  const a = h.steps(3, { tips: [{ code: 'x' }], star: true });
  h.queue.add({ key: 'a', generation: 1, edits: 0, steps: a });
  assert.equal(h.scheduled.length, 0, 'adding schedules nothing: the screen kicks once nothing plays');
  h.setBusy(true);
  h.queue.kick();
  assert.equal(h.scheduled.length, 0, 'nothing is scheduled while a lap plays');
  h.setBusy(false);
  h.queue.kick();
  h.runNext();
  assert.equal(a.calls, 1, 'one step');
  h.setBusy(true);
  h.runNext();
  assert.deepEqual([a.calls, h.scheduled.length], [1, 0], 'a replay started: deferred, not cancelled');
  h.setBusy(false);
  h.queue.kick();
  h.runNext();
  assert.deepEqual(h.written, [], 'no progress is written');
  h.runNext();
  assert.deepEqual(h.written, [['a', { generation: 1, edits: 0, tips: [{ code: 'x' }], star: true }]], 'the final return, once');
  // A newer check or an edit of that instance drops the job; another instance's change doesn't.
  for (const change of [{ generation: 2 }, { edits: 1 }]) {
    h = harness();
    const it = h.steps(3, { tips: [], star: true });
    h.queue.add({ key: 'a', generation: 1, edits: 0, steps: it });
    h.queue.kick();
    h.runNext();
    Object.assign(h.store.a, change);
    Object.assign(h.store.b, { generation: 9, edits: 9 });
    while (h.runNext());
    assert.deepEqual([it.calls, h.written, h.queue.pending], [1, [], []], JSON.stringify(change));
  }
  // «↺» between queued steps: the next step drops the job; no further generator work, nothing stored.
  h = harness();
  const reviewing = h.steps(5, { tips: [], star: true });
  h.queue.add({ key: 'a', generation: 1, edits: 0, steps: reviewing });
  h.queue.kick();
  h.runNext();
  h.store.a = instanceReducer({ ...initialInstance(), generation: 1, result: { ok: true } }, { type: 'clear-results' });
  while (h.runNext());
  assert.deepEqual([reviewing.calls, h.written, h.queue.pending, h.scheduled.length], [1, [], [], 0], '«↺» mid-review');
  // A result that stopped passing without a new generation (defensive): dropped too.
  h = harness();
  const failing = h.steps(3, { tips: [], star: true });
  h.queue.add({ key: 'a', generation: 1, edits: 0, steps: failing });
  h.queue.kick();
  h.runNext();
  h.store.a.result = { ok: false };
  while (h.runNext());
  assert.deepEqual([failing.calls, h.written], [1, []]);
  // A new check of the same instance replaces its job; instances queue in turn.
  h = harness();
  const first = h.steps(5, { tips: [], star: false }), second = h.steps(1, { tips: [], star: true }), other = h.steps(1, { tips: [], star: false });
  h.queue.add({ key: 'a', generation: 1, edits: 0, steps: first });
  h.queue.add({ key: 'b', generation: 1, edits: 0, steps: other });
  h.store.a.generation = 2;
  h.queue.add({ key: 'a', generation: 2, edits: 0, steps: second });
  h.queue.kick();
  while (h.runNext());
  assert.deepEqual([first.calls, h.written.map(([k, r]) => [k, r.generation, r.star])], [0, [['b', 1, false], ['a', 2, true]]]);
  // Leaving the screen: everything goes, the scheduled step too.
  h = harness();
  h.queue.add({ key: 'a', generation: 1, edits: 0, steps: h.steps(3, {}) });
  h.queue.kick();
  h.queue.dispose();
  assert.deepEqual([h.scheduled[0].cancelled, h.queue.pending], [true, []]);
});

// ── The discard input, rendered ──────────────────────────────

/** The <input> or <label> tags of rendered markup, as text: the assertions
 * read attributes by name, not in the order React writes them. */
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(m => m[0]);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
const inputById = (html, id) => tagsOf(html, 'input').find(tag => attr(tag, 'id') === id) ?? '';
/** The blackhole boxes rendered: each row's id prefix, ✓ when ticked. */
const boxes = html => tagsOf(html, 'input').filter(tag => attr(tag, 'class') === 'ng-rt-checkbox')
  .map(tag => `${attr(tag, 'id').replace(/-blackhole$/, '')}${attr(tag, 'checked') !== null ? '✓' : ''}`);

test('discard input (U8, U9, polish-2 P2): the discard row’s own title; the discard placeholder there only (round 5: symbols, no Null0); in guided mode the blackhole box on that row only, ticked = gateway «—» and disabled', () => {
  const record = tasks[16];
  const store = p.testStore();
  let html = store.render(p.RoutingRows, { record, syntax: 'cisco', router: 'R-CORE' });
  const heads = [...html.matchAll(/<h4 class="ng-rt-row-head"[^>]*>([\s\S]*?)<\/h4>/g)].map(m => normalise(m[1]));
  assert.equal(heads[7], '#8 Discard для всього сумарного блоку');
  assert.ok(heads.slice(0, 7).every(h => !h.includes('Discard')) && heads[1].includes('Маршрут до'));
  assert.deepEqual([...html.matchAll(/id="rt-R-CORE-(\d)-gw"[^>]*placeholder="([^"]*)"/g)].map(m => m[2]),
    [...Array(7).fill('адреса сусіда'), 'інтерфейс відкидання']);
  assert.ok(!html.includes('type="checkbox"'), 'Cisco: no new control');
  html = store.render(p.RoutingRows, { record, syntax: 'routeros', router: 'R-CORE' });
  // Guided: the box only where the scaffold row is the discard (polish-2 P2, V7).
  assert.deepEqual(boxes(html), ['rt-R-CORE-7']);
  assert.ok(tagsOf(html, 'input').filter(tag => attr(tag, 'class') === 'ng-rt-checkbox').every(tag => attr(tag, 'type') === 'checkbox'));
  assert.deepEqual(tagsOf(html, 'label').filter(tag => attr(tag, 'class') === 'ng-rt-check-label').map(tag => attr(tag, 'for')), ['rt-R-CORE-7-blackhole'], 'labelled');
  let api;
  store.render(p.RoutingRows, { record, syntax: 'routeros', router: 'R-CORE', expose: a => { api = a; } });
  api.answers.edit(api.answers.slotItem('R-CORE', 7), 'gw', '10.0.0.9');
  store.render(p.RoutingRows, { record, syntax: 'routeros', router: 'R-CORE', expose: a => { api = a; } });
  api.answers.edit(api.answers.slotItem('R-CORE', 7), 'blackhole', true);
  html = store.render(p.RoutingRows, { record, syntax: 'routeros', router: 'R-CORE' });
  const gw = inputById(html, 'rt-R-CORE-7-gw');
  assert.deepEqual([attr(gw, 'placeholder'), attr(gw, 'disabled'), attr(gw, 'value')], ['—', '', '']);
  assert.deepEqual(boxes(html), ['rt-R-CORE-7✓']);
});

// ── Where the blackhole box shows (polish-2 P2) ──────────────

const routersOf = record => record.network.devices.filter(d => d.kind === 'router').map(d => d.id);
/** A neighbour's address on one of the router's segments: a gateway the form check accepts. */
function neighbourOf(task, router) {
  for (const own of task.network.devices.find(d => d.id === router).interfaces) {
    const peer = task.network.devices.flatMap(d => (d.id === router ? [] : d.interfaces)).find(f => f.segmentId === own.segmentId && f.address);
    if (peer) return peer.address.ip;
  }
  throw new Error(`${router}: no neighbour`);
}
/** A route of «Інші маршрути» (rendered as a free row: `rt-R1-f1`), not a guided row's `rt-R1-0`. */
const isExtra = id => /-f\d+$/.test(id);
/** The rows of every router as they render: guided rows, or free rows
 * (`free` added per router). With `extras`, each router first gets a route
 * no guided row takes, as a student makes one: typed in free mode and
 * network-checked, so the guided view lists it under «Інші маршрути». */
function renderAll(record, { variantId, syntax = 'routeros', mode = 'guided', seed = null, extras = false, free = 0 } = {}) {
  const store = p.testStore({ mode });
  const props = (router, m = mode) => ({ record, variantId, syntax, mode: m, seed, router });
  let api;
  const expose = a => { api = a; };
  if (extras) {
    for (const router of routersOf(record)) {
      store.render(p.RoutingRows, { ...props(router, 'free'), expose });
      api.answers.addRoute(router);
      store.render(p.RoutingRows, { ...props(router, 'free'), expose });
      const item = api.answers.freeItems(router).at(-1);
      api.answers.edit(item, 'dst', '203.0.113.0/24');
      store.render(p.RoutingRows, { ...props(router, 'free'), expose });
      api.answers.edit(api.answers.freeItems(router).at(-1), 'gw', neighbourOf(api.ex.task, router));
    }
    store.render(p.RoutingRows, { ...props(routersOf(record)[0], 'free'), expose });
    const { result } = api.answers.checkNetwork();
    assert.ok(!result.formErrors, `${record.id}: the extra routes pass the form check ${JSON.stringify(result.formErrors)}`);
  }
  store.render(p.RoutingRows, { ...props(routersOf(record)[0]), expose });
  for (let i = 0; i < free; i++) for (const router of routersOf(record)) {
    store.render(p.RoutingRows, { ...props(router), expose });
    api.answers.addRoute(router);
  }
  return { api, html: Object.fromEntries(routersOf(record).map(router => [router, store.render(p.RoutingRows, props(router))])) };
}

test('teachesDiscard: read from the scaffold alone; true for task 17 and its instances, and only where the reference has a discard', () => {
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const reference = Object.values(variant.referenceRoutes).flat().some(r => r.discard === true);
    assert.equal(teachesDiscard(task), reference, `${variant.code}`);
    assert.equal(teachesDiscard(task), record.displayNumber === 17, `${variant.code}: only task 17 today`);
  }
  const instance = routing.create(tasks[16], { seed: 3, bankId: p.routingBank.bankId, bankRevision: p.routingBank.bankRevision });
  assert.equal(teachesDiscard(instance), true, '«Інші адреси» keeps the flag');
  assert.equal(teachesDiscard({ variant: { scaffold: { R1: [{ discard: false }] } } }), false);
});

test('blackhole box, task 17 (MikroTik): guided on the discard row only; free and «Інші маршрути» on every row', () => {
  const record = tasks[16];
  const guided = renderAll(record);
  assert.deepEqual(Object.values(guided.html).flatMap(boxes), ['rt-R-CORE-7'], 'guided: the discard row only');
  const extras = renderAll(record, { extras: true });
  const extraBoxes = Object.values(extras.html).flatMap(boxes);
  assert.equal(extraBoxes.filter(isExtra).length, routersOf(record).length, `«Інші маршрути»: one per router, ${extraBoxes}`);
  assert.deepEqual(extraBoxes.filter(id => !isExtra(id)), ['rt-R-CORE-7'], 'the guided rows unchanged');
  for (const router of routersOf(record)) assert.match(extras.html[router], /<section class="ng-rt-extras"[\s\S]*class="ng-rt-checkbox"/, `${router}: the box inside «Інші маршрути»`);
  const free = renderAll(record, { mode: 'free', free: 2 });
  for (const router of routersOf(record)) assert.equal(boxes(free.html[router]).length, 2, `free ${router}: every row`);
});

test('blackhole box: no other task shows one, in any mode (task 3 and 3b, and all others guided)', () => {
  for (const record of tasks.filter(r => r.displayNumber !== 17)) for (const variant of record.variants) {
    const guided = renderAll(record, { variantId: variant.id, extras: true }).html;
    assert.ok(Object.values(guided).every(html => html.includes('ng-rt-extras')), `${variant.code}: «Інші маршрути» rendered`);
    assert.deepEqual(Object.values(guided).flatMap(boxes), [], `${variant.code} guided, with «Інші маршрути»`);
    if (record.displayNumber !== 3) continue;
    const free = renderAll(record, { variantId: variant.id, mode: 'free', free: 2 }).html;
    assert.ok(Object.values(free).every(html => (html.match(/class="ng-rt-row ng-rt-free-row/g) ?? []).length === 2), `${variant.code}: two free rows per router`);
    assert.deepEqual(Object.values(free).flatMap(boxes), [], `${variant.code} free`);
  }
});

test('blackhole box: a ticked one shows wherever it is (a Cisco Null0 converted to MikroTik), ticked; Cisco shows none', () => {
  const record = tasks[2];
  // Guided task 3, R1's row #1: Null0 typed in Cisco.
  const store = p.testStore();
  let api;
  store.render(p.RoutingRows, { record, syntax: 'cisco', router: 'R1', expose: a => { api = a; } });
  for (const [name, value] of [['net', '192.168.2.0'], ['mask', '255.255.255.0'], ['gw', 'Null0']]) {
    api.answers.edit(api.answers.slotItem('R1', 0), name, value);
    store.render(p.RoutingRows, { record, syntax: 'cisco', router: 'R1', expose: a => { api = a; } });
  }
  assert.deepEqual(boxes(store.render(p.RoutingRows, { record, syntax: 'cisco', router: 'R1' })), [], 'Cisco: no box, Null0 typed in NEXT-HOP');
  const guided = store.render(p.RoutingRows, { record, syntax: 'routeros', router: 'R1' });
  assert.deepEqual(boxes(guided), ['rt-R1-0✓'], 'MikroTik: that row’s box, ticked; no other row');
  assert.deepEqual([attr(inputById(guided, 'rt-R1-0-gw'), 'placeholder'), attr(inputById(guided, 'rt-R1-0-gw'), 'disabled')], ['—', '']);
  // Free task 3: the same in a free row.
  const free = p.testStore({ mode: 'free' });
  free.render(p.RoutingRows, { record, syntax: 'cisco', mode: 'free', router: 'R1', expose: a => { api = a; } });
  api.answers.addRoute('R1');
  api.answers.addRoute('R1');
  for (const [name, value] of [['net', '192.168.2.0'], ['mask', '255.255.255.0'], ['gw', 'null0']]) {
    free.render(p.RoutingRows, { record, syntax: 'cisco', mode: 'free', router: 'R1', expose: a => { api = a; } });
    api.answers.edit(api.answers.freeItems('R1')[0], name, value);
  }
  const freeHtml = free.render(p.RoutingRows, { record, syntax: 'routeros', mode: 'free', router: 'R1' });
  assert.equal(boxes(freeHtml).length, 1, 'the converted row only, not the empty one');
  assert.ok(boxes(freeHtml)[0].endsWith('✓'), boxes(freeHtml));
});

test('blackhole box: an «Інші адреси» instance of task 17 behaves like task 17', () => {
  const record = tasks[16];
  const guided = renderAll(record, { seed: 3 });
  assert.deepEqual(Object.values(guided.html).flatMap(boxes), ['rt-R-CORE-7'], 'guided: the discard row only');
  assert.ok(guided.api.ex.task.identity.seed === 3, 'on the generated instance');
  const free = renderAll(record, { mode: 'free', seed: 3, free: 1 });
  for (const router of routersOf(record)) assert.equal(boxes(free.html[router]).length, 1, `free ${router}`);
});

// ── The leak gate: tips, ★ and the reveal ────────────────────

test('leak gate (OPT-1 UI): tips, the ★ and its line for crafted answers on every variant say names and counts only; the reveal only once earned', t => {
  let surfaces = 0;
  const inspect = (task, text, label) => { surfaces++; assert.deepEqual(inspectLeaks(task, text, 'strip'), [], `${label}: ${normalise(text)}`); };
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const reference = routing.solution(task);
    // The student's own answer with a repeated route, and the reference as it is.
    const router = Object.keys(reference).find(r => reference[r].length);
    const crafted = { ...reference, [router]: [...reference[router], { ...reference[router][0], id: `${router}.f99` }] };
    for (const answer of [crafted, reference]) {
      const result = routing.check(task, answer);
      if (!result.ok) continue;
      const review = drain(reviewSteps(task, answer, { assessment: result }));
      for (const syntax of syntaxList) {
        const presented = presentCheck(task, result, syntax.id);
        const rowsOf = r => (answer[r] ?? []).map((route, i) => ({ kind: 'route', n: i + 1, key: route.id, route }));
        const tips = tipItems(tipsFor(review, 'free', task), { rowsOf, bestAvailable: true });
        if (answer === crafted) assert.ok(tips.length > 0, `${variant.code}: the repeated route gives a tip`);
        const notes = p.renderNotes(presented, { tips, syntax: syntax.id });
        const improve = notes.match(/<section class="ng-rt-improve"[\s\S]*?<\/section>/)?.[0] ?? '';
        if (tips.length) inspect(task, improve, `${variant.code} ${syntax.id} tips`);
        // Round 4 (A5): no ★ and no ★ line anywhere.
        assert.ok(!notes.includes('ng-rt-star') && !notes.includes('★'), `${variant.code}: no ★`);
        const strip = p.renderStrip(presented, null, null, () => {}, { shown: review.star, reserved: true, open: false, onToggle: () => {} });
        inspect(task, strip.match(/<p class="ng-rt-strip[^"]*">([\s\S]*?)<\/p>/)[1], `${variant.code} strip`);
        for (const attr of [...notes.matchAll(/(?:placeholder|title|aria-label)="([^"]*)"/g)].map(m => m[1])) assert.deepEqual(inspectLeaks(task, attr, 'placeholder'), []);
      }
    }
  }
  // The reveal: in free mode only; no button before the exact instance is earned, no commands before it is pressed.
  for (const n of [1, 17]) {
    const task = create(n), answer = routing.solution(task), result = routing.check(task, answer);
    for (const [earned, mode] of [[false, 'free'], [true, 'free'], [true, 'guided']]) {
      const store = p.testStore({ mode });
      store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task.record.id, router: null, variants: {} } });
      const act = action => store.dispatch({ type: 'instance', key: task.instanceKey, action });
      if (!earned) act({ type: 'session', action: { type: 'reveal' } });
      act({ type: 'checked', answer, result });
      const html = store.render(p.RoutingScreen, { bank: p.routingBank });
      assert.equal(html.includes('id="ng-rt-best"'), earned && mode === 'free', `task ${n}, earned ${earned}, ${mode}`);
      assert.ok(!html.includes('ng-rt-best-commands') && !html.includes(optimiserUi.bestLine(1).slice(0, 30)), 'nothing of the table before it is pressed');
      if (earned && mode === 'free') inspect(task, html.match(/<div class="ng-rt-other ng-rt-best">[\s\S]*?<\/div><\/div>/)[0], `task ${n} reveal, closed`);
    }
  }
  assert.ok(surfaces > 100, `${surfaces} surfaces`);
  t.diagnostic(JSON.stringify({ surfaces }));
});

test('strings: no ★ word any more (round 4: calm); the reveal’s honest line comes from uk.js; Ukrainian plurals', () => {
  assert.ok(!('star' in optimiserUi) && !('starLabel' in optimiserUi), 'the ★ «найкоротший відомий» left the strip with its words');
  assert.equal(optimiserUi.bestLine(21), 'Відомий варіант, що проходить усі змодельовані перевірки: 21 маршрут. Перевірено два кандидати на кожному роутері за один прохід; коротший варіант може існувати.');
  assert.match(optimiserUi.bestLine(4), /: 4 маршрути\./);
  assert.match(optimiserUi.bestLine(15), /: 15 маршрутів\./);
  assert.equal(ui.shared.improveTitle, 'Що можна покращити (необов’язково — мережа вже працює)');
  assert.equal(ui.shared.blackhole, 'blackhole (відкидати)');
  assert.deepEqual([optimiserUi.bestShow, optimiserUi.bestHide], ['Показати найкоротший відомий варіант', 'Сховати найкоротший відомий варіант']);
  assert.ok(!('limits' in optimiserUi), 'the long limits text is gone: the screen shows searchLimits');
});
