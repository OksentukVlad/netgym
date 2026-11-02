// Step 9 UI (spec step 9 §3, R6, R7): «Інші адреси», the task's code, «Код
// задачі», and instance isolation, without a DOM. The screen rendered on the
// server for the heading, the address row and the task list; the screen's
// pure helpers (screens/instances.js) for the seed pick, the instances the
// score counts and the memo. The mounted scenarios (tests/helpers/
// mounted-routing.mjs, «step 9: …») cover clicks, Enter, the clipboard,
// focus, the lap, tips, ★, the reveal and «↺»; the leak gate on one seed per
// variant is in routing-leaks.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as suppliedBank from '../src/banks/routing/tasks.js';
import { bankId, bankRevision, tasks } from '../src/banks/routing/tasks.js';
import routing from './helpers/routing.mjs';
import { earnedTasks, instanceOf, otherSeed, ownInstances, SEEDS } from '../src/sections/routing/screens/instances.js';
import { ui } from '../src/sections/routing/uk.js';
import { codeErrors } from '../src/sections/routing/logic/codes.js';
import * as h from '../.test-bundles/harness/contract.mjs';

const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plain = html => unescape(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ');
const bank = { bank: suppliedBank, bankId, bankRevision };
const create = (n, seed = null, variantId) => routing.create(tasks[n - 1], { variantId: variantId ?? tasks[n - 1].variants[0].id, seed, ...bank });
const earn = { type: 'checked', answer: {}, result: { ok: true, complete: true, code: 'ok', findings: [] } };

function screen(place, prefs, setup = () => {}) {
  const store = h.testStore(prefs);
  store.dispatch({ type: 'place', scope: 'routing', patch: { router: null, filterLevel: 0, variants: {}, seeds: {}, ...place } });
  setup(store);
  return { store, html: unescape(store.render(h.RoutingScreen, { bank: h.routingBank })) };
}

test('«Інші адреси» picks a random seed: never the current one, skipping seeds it can’t build, within 0–9999', () => {
  const draws = [0.5, 0.25, 0.75, 0.125];
  const sequence = () => { let i = 0; return () => draws[i++ % draws.length]; };
  assert.equal(otherSeed(() => true, { random: sequence() }), 5000);
  assert.equal(otherSeed(() => true, { current: 5000, random: sequence() }), 2500, 'not the current seed');
  assert.equal(otherSeed(seed => seed !== 2500 && seed !== 5000, { random: sequence() }), 7500, 'infeasible ones skipped');
  let asked = 0;
  assert.equal(otherSeed(() => { asked++; return false; }, { random: sequence(), tries: 7 }), null, 'none buildable');
  assert.equal(asked, 7, 'bounded');
  assert.equal(otherSeed(() => true, { random: () => 0.99999999 }), SEEDS - 1);
  assert.equal(otherSeed(() => true, { random: () => 0 }), 0, 'seed 0 is a generated seed too');
  for (let i = 0; i < 200; i++) {
    const seed = otherSeed(() => true);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < SEEDS);
  }
});

test('instances: create() remembered per record and parameters; an infeasible result is returned as such', () => {
  const params = { variantId: 'defaults', seed: 42, ...bank };
  const first = instanceOf(tasks[2], params);
  assert.equal(instanceOf(tasks[2], { ...params }), first, 'the same object for the same instance');
  assert.deepEqual(first.identity, { formatVersion: 1, exerciseId: 'routing.static', bankId, bankRevision, taskId: 'routing.task-03', variantId: 'defaults', generatorVersion: 1, seed: 42 });
  assert.notEqual(instanceOf(tasks[2], { ...params, seed: 43 }), first);
  assert.equal(instanceOf(tasks[2], { ...params, seed: null }).identity.seed, null);
  assert.equal(first.instanceKey, create(3, 42, 'defaults').instanceKey);
  const broken = structuredClone(tasks[1]);
  for (const v of broken.variants) v.referenceRoutes = Object.fromEntries(Object.keys(v.referenceRoutes).map(r => [r, []]));
  const failed = instanceOf(broken, { variantId: 'main', seed: 7, ...bank });
  assert.equal(failed.code, 'infeasible');
  assert.equal(instanceOf(broken, { variantId: 'main', seed: 7, ...bank }), failed, 'not tried again');
});

test('a generated network is placed once per record and seed: the other variant on it is what create() returns', () => {
  for (const n of [3, 8]) for (const seed of [11, 4821]) {
    const record = tasks[n - 1], [first, second] = record.variants;
    const a = instanceOf(record, { variantId: first.id, seed, ...bank });
    const started = performance.now();
    const b = instanceOf(record, { variantId: second.id, seed, ...bank });
    const took = performance.now() - started;
    assert.equal(b.record, a.record, `${n}/${seed}: the same placed record, not placed again`);
    assert.ok(took < 50, `${n}/${seed}: ${took} ms`);
    const created = routing.create(record, { variantId: second.id, seed, ...bank });
    assert.deepEqual(b, created, `${n}/${seed}: equal to create()`);
    assert.equal(b.instanceKey, created.instanceKey);
    assert.equal(instanceOf(record, { variantId: second.id, seed, ...bank }), b, 'and remembered');
  }
  // Infeasible is per record: every variant is accepted together.
  const broken = structuredClone(tasks[2]);
  for (const v of broken.variants) v.referenceRoutes = Object.fromEntries(Object.keys(v.referenceRoutes).map(r => [r, []]));
  const failed = instanceOf(broken, { variantId: 'explicit-routes', seed: 5, ...bank });
  assert.equal(failed.code, 'infeasible');
  assert.equal(instanceOf(broken, { variantId: 'defaults', seed: 5, ...bank }), failed);
  assert.throws(() => instanceOf(tasks[2], { variantId: 'missing', seed: 11, ...bank }), RangeError);
});

test('the score and the list count a task once, from any instance of the bank; other exercises and banks are not counted', () => {
  const store = h.testStore();
  const keys = { base1: create(1).instanceKey, gen1: create(1, 5).instanceKey, gen1b: create(1, 6).instanceKey, gen2: create(2, 9).instanceKey };
  for (const key of [keys.base1, keys.gen1, keys.gen1b]) store.dispatch({ type: 'instance', key, action: earn });
  store.dispatch({ type: 'instance', key: keys.gen2, action: { type: 'draft', mode: 'guided', syntax: 'cisco', routeId: 'R1.row1', value: { net: '1' } } });
  const other = routing.create(tasks[3], { variantId: 'main', seed: 5, bankId: 'other.bank', bankRevision: 1 }).instanceKey;
  store.dispatch({ type: 'instance', key: other, action: earn });
  store.dispatch({ type: 'instance', key: 'not json', action: earn });
  store.dispatch({ type: 'instance', key: JSON.stringify({ exerciseId: 'firewall.fw1', bankId, bankRevision, taskId: 'routing.task-04' }), action: earn });
  const own = ownInstances(store.state.instances, h.routingBank);
  assert.deepEqual(own.map(o => o.key).sort(), Object.values(keys).sort());
  assert.deepEqual([...earnedTasks(own)], ['routing.task-01']);
  const html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  // Round 4 (spec A5): no score; the list's quiet ✓ (DoneMark) counts the task once, from three instances.
  assert.ok(!/✅|спроб:|ng-rt-score/.test(html), 'no score');
  assert.equal((html.match(/class="ng-done"/g) ?? []).length, 1, 'one task ✓, from three instances');
  assert.ok(html.includes('<span class="ng-done"><span aria-hidden="true">✓</span><span class="ng-sr-only"> розв’язано</span></span>'), 'DoneMark inside the task’s button');
  // The store's clear-results over every own instance, generated ones included.
  store.dispatch({ type: 'instances', keys: own.map(o => o.key), action: { type: 'clear-results' } });
  const after = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(!after.includes('class="ng-done"'));
  assert.equal(store.state.instances[other].session.earned.solved, true, 'another bank’s instance is not this screen’s to clear');
});

test('the heading and the address row (round 4: the actions in «⋯»): the title; on other addresses the subtitle', () => {
  const base = screen({ taskId: tasks[0].id }).html;
  // The heading is the task's title only; its code is data on it (the menu copies it; the list keeps the codes).
  assert.ok(base.includes('class="ng-rt-title" data-variant="1" data-code="A1">Два роутери, дві LAN</h2>'));
  const row = html => html.match(/<div class="ng-rt-addr(?: is-empty)?">([\s\S]*?)<p class="ng-rt-addr-failed"/)[1];
  assert.ok(!row(base).includes('Скопіювати код') && !row(base).includes('Інші адреси'), 'the actions are in «⋯», not the row');
  assert.ok(base.includes('aria-label="Інші дії"') && base.includes('aria-haspopup="menu"'), 'one «⋯» on the task bar');
  assert.ok(!base.includes(ui.address.subtitle) && !base.includes('Попередні адреси'), 'base: no subtitle, no previous code');
  assert.ok(base.includes('<p class="ng-rt-addr-failed" aria-live="polite"></p>'), 'an empty polite line for what an action did');

  const generated = screen({ taskId: tasks[2].id, variants: { [tasks[2].id]: 'defaults' }, seeds: { [tasks[2].id]: 42 } }).html;
  assert.ok(generated.includes('data-variant="3b" data-code="A3b-0042"'));
  assert.ok(generated.includes(`<span class="ng-rt-addr-sub">${ui.address.subtitle}</span>`) && ui.address.subtitle === 'Та сама задача з іншими адресами');
  const order = ['aria-label="Варіант"', 'ng-rt-addr-sub'].map(x => row(generated).indexOf(x));
  assert.ok(order[0] >= 0 && order[1] > order[0], JSON.stringify(order));
  assert.ok(generated.includes('aria-checked="true"') && plain(row(generated)).includes('3b · default на тупіковому'));

  // A bank without a letter in the code table: no code.
  const small = { frozen: suppliedBank.frozen, bankId: 'test.bank', bankRevision: 7, tasks: [tasks[1], tasks[0]] };
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: tasks[1].id, seeds: { [tasks[1].id]: 3 } } });
  const html = unescape(store.render(h.RoutingScreen, { bank: small }));
  assert.ok(html.includes('class="ng-rt-title" data-variant="2">') && html.includes(ui.address.subtitle));
});

test('«Код задачі»: a labelled field and «Відкрити» at the top of the task list, its polite line empty until a refusal', () => {
  const { html } = screen({ taskId: tasks[0].id });
  const list = html.match(/<aside id="ng-rt-tasks"[\s\S]*?<\/aside>/)[0];
  const field = list.match(/<div class="ng-rt-codefield">[\s\S]*?<p id="ng-rt-codefield-error"[^>]*><\/p><\/div>/)?.[0];
  assert.ok(field, 'in the task list');
  assert.ok(list.indexOf('ng-rt-codefield') < list.indexOf('ng-rt-levels'), 'above the levels');
  assert.ok(field.includes('<label class="ng-rt-caption ng-rt-codefield-label" for="ng-rt-codefield-input">Код задачі</label>'));
  assert.ok(field.includes('placeholder="напр. A3b-4821"') && field.includes('aria-describedby="ng-rt-codefield-error"') && !field.includes('aria-invalid'));
  assert.ok(field.includes('type="button" class="ng-rt-btn ng-rt-codefield-open">Відкрити<'), 'a button, not a form submit: Enter and «Відкрити» only');
  assert.ok(field.includes('<p id="ng-rt-codefield-error" class="ng-rt-codefield-error" aria-live="polite"></p>'));
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, 'still the screen’s one status');
  assert.deepEqual(Object.keys(ui.address.codeErrors).sort(), [...codeErrors].sort(), 'a sentence for each refusal code (uk.js)');
});

test('instance isolation on the server: a generated place shows its own instance; the base instance’s work and reveal stay with it', () => {
  const base = create(1), generated = create(1, 42);
  const { html } = screen({ taskId: tasks[0].id, router: 'R1', seeds: { [tasks[0].id]: 42 } }, {}, store => {
    store.dispatch({ type: 'instance', key: base.instanceKey, action: earn });
    store.dispatch({ type: 'instance', key: base.instanceKey, action: { type: 'session', action: { type: 'reveal' } } });
  });
  const lan = generated.network.devices.find(d => d.id === 'R1').interfaces[0].address;
  assert.ok(html.includes(`${lan.ip}/${lan.prefix}`), 'the card shows the instance’s interface');
  assert.ok(!html.includes('192.168.1.1'), 'not the base’s');
  assert.ok(html.includes('ng-help-reveal-link') && !html.includes('data-revealed') && !/зарахов/.test(html), 'not revealed, not earned on this instance; no penalty wording');
  assert.ok(!html.includes('ng-rt-commands'), 'no reference commands');
  assert.equal((html.match(/class="ng-done"/g) ?? []).length, 1, 'the list’s ✓ counts the task from the base instance');
});
