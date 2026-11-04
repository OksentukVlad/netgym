// Screen behaviour rendered with react-dom/server (the bundled harness in
// tests/harness/contract.jsx): the routing screen's bank comes from the
// target, «↺» takes the solved marks with the score, a solved mask answer is
// read-only in both input modes, the mask screen's address ruler shows the
// block only once the student may see it, and the theme preference reaches
// a screen through its area.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../.test-bundles/harness/contract.mjs';
import { tasks } from '../src/banks/routing/tasks.js';

const [task1, task2] = tasks;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const listed = html => [...html.matchAll(/class="ng-rt-task-title">#(\d+) /g)].map(m => Number(m[1]));
// Step 9: the ✓ may come from another address set of the task, and says so.
// Round 4 (spec A5): the list's quiet ✓ is DoneMark; no score.
const SOLVED = '<span class="ng-done"><span aria-hidden="true">✓</span><span class="ng-sr-only"> розв’язано</span></span>';

/** Checks one routing instance as the screen would record a right row. */
function solveRow(store, key, part = 'R1/0') {
  store.dispatch({ type: 'instance', key, action: { type: 'checked', answer: {}, result: { ok: true, complete: true, code: 'ok', findings: [] }, part, partResult: { ok: true, syntax: 'cisco', visible: true }, syntax: 'cisco', supersede: true } });
}

test('routing screen: the bank comes from the target; the task list, score and keys follow it', () => {
  const small = { bankId: 'test.bank', bankRevision: 7, tasks: [task2, task1] };
  const keys = h.instanceKeys(small);
  assert.deepEqual(keys.map(k => JSON.parse(k)).map(({ bankId, bankRevision, taskId }) => [bankId, bankRevision, taskId]),
    [['test.bank', 7, task2.id], ['test.bank', 7, task1.id]]);
  const store = h.testStore();
  let html = unescape(store.render(h.RoutingScreen, { bank: small }));
  assert.deepEqual(listed(html), [2, 1], 'only the given bank’s tasks, in its order');
  // Round 4: the heading is the title only.
  assert.ok(html.includes(`class="ng-rt-title" data-variant="${task2.variants[0].code}"`), 'opens on the bank’s first task');
  // The class bank's instance of task 1 is not this bank's: the list's ✓ ignores it.
  solveRow(store, h.instanceKeys(h.routingBank)[0]);
  html = unescape(store.render(h.RoutingScreen, { bank: small }));
  assert.ok(!html.includes(SOLVED), 'another bank’s solved task 1 marks nothing here');
  solveRow(store, keys[0]);
  html = unescape(store.render(h.RoutingScreen, { bank: small }));
  assert.equal(html.split(SOLVED).length - 1, 1, 'the bank’s own solved task has its ✓ (OPT-1 UI §1)');
  assert.ok(!/✅|спроб:|ng-rt-score/.test(html), 'no score (round 4: calm)');
  // The full bank lists all 17.
  assert.equal(listed(unescape(h.testStore().render(h.RoutingScreen, { bank: h.routingBank }))).length, 17);
});

test('routing screen: clearing the results clears the solved marks; no score, no «↺»', () => {
  const store = h.testStore();
  const keys = h.instanceKeys(h.routingBank);
  solveRow(store, keys[1]);
  let html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(html.includes(SOLVED) && !/✅|спроб:|Скинути рахунок/.test(html));
  // The store's clear-results (no screen button dispatches it any more).
  store.dispatch({ type: 'instances', keys, action: { type: 'clear-results' } });
  html = unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
  assert.ok(!html.includes(SOLVED), 'no ✓ once the earned result is cleared');
});

test('Segmented: read-only, no key moves the choice', () => {
  assert.equal(h.keyChoice('ArrowRight', 3, 4), 0, 'wraps');
  assert.equal(h.keyChoice('ArrowLeft', 0, 4), 3);
  assert.equal(h.keyChoice('End', 0, 4), 3);
  assert.equal(h.keyChoice('Tab', 0, 4), null);
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) assert.equal(h.keyChoice(key, 1, 4, true), null, key);
});

test('mask screen: a solved answer is read-only in both input modes', () => {
  for (const mode of ['choose', 'type']) {
    const store = h.testStore();
    store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 1, seeds: { 1: 4821 } } });
    const params = { seed: 4821, level: 1 };
    const task = h.mask.create(null, params);
    const key = h.instanceKeyOf(h.mask, task, params);
    const solution = h.mask.solution(task);
    let html = unescape(store.render(h.MaskScreen));
    assert.ok(!html.includes('aria-readonly') && !html.includes('readOnly=""') && !html.includes('readonly=""'), `${mode}: editable before`);
    // Round 4 (spec R4): choice mode is the instance's (its view), not the app-wide preference.
    if (mode === 'choose') store.dispatch({ type: 'instance', key, action: { type: 'view', patch: { choices: { network: true, broadcast: true } } } });
    store.dispatch({ type: 'instance', key, action: { type: 'draft', syntax: 'text', part: 'answer', value: solution } });
    store.dispatch({ type: 'instance', key, action: { type: 'checked', answer: solution, result: h.mask.check(task, solution) } });
    html = unescape(store.render(h.MaskScreen));
    if (mode === 'choose') {
      assert.equal((html.match(/role="radiogroup" aria-label="[^"]*: варіанти" aria-readonly="true"/g) ?? []).length, 2, 'both fields');
      assert.ok(html.includes(`aria-checked="true" tabindex="0" class="ng-segmented-option">${solution.network}<`), 'the solved choice stays shown');
    } else {
      assert.equal((html.match(/readOnly=""|readonly=""/g) ?? []).length, 2);
    }
  }
});

test('mask screen: the ruler shows the address, and the block only after success or the reveal', () => {
  // Block task: 192.168.50.11 /27 → block 0–31 in the fourth octet.
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 1, seeds: { 1: 4821 } } });
  const params = { seed: 4821, level: 1 };
  const task = h.mask.create(null, params);
  const key = h.instanceKeyOf(h.mask, task, params);
  // Round 5 5b-2 (spec D): an address task's ruler says the octet, the label spacing, the block size for its prefix and the address.
  const ruler = 'Лінійка: 4-те число адреси, від 0 до 255; поділки через 32, блок для /27 — 32 адреси. Твоя адреса: 11.';
  let html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes(`<figcaption class="ng-ruler-text">${ruler}</figcaption>`), 'before an answer: strip, ticks, address');
  assert.ok(html.includes('<svg class="ng-ruler-svg" viewBox="0 0 328 96" aria-hidden="true"'));
  assert.ok(!html.includes('Виділений блок') && !html.includes('ng-ruler-block') && !html.includes('ng-ruler-edge'));
  const wrong = { network: '192.168.50.32', broadcast: '192.168.50.63' };
  store.dispatch({ type: 'instance', key, action: { type: 'checked', answer: wrong, result: h.mask.check(task, wrong) } });
  html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes('Подивись на лінійку') && html.includes(ruler), 'the feedback’s ruler is there');
  assert.ok(!html.includes('Виділений блок') && !html.includes('ng-ruler-block'), 'a wrong answer shows no block');
  const right = h.mask.solution(task);
  store.dispatch({ type: 'instance', key, action: { type: 'checked', answer: right, result: h.mask.check(task, right) } });
  html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes(`${ruler} Виділений блок: від 0 до 31.`), 'success: the block and its two ends');
  assert.ok(html.includes('class="ng-ruler-block"') && html.includes('>31</text>'));

  // Level 3: the third octet. Revealed: the block.
  const p3 = { seed: 5, level: 3 };
  const t3 = h.mask.create(null, p3);
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 3, seeds: { 1: 4821, 3: 5 } } });
  html = unescape(store.render(h.MaskScreen));
  const ruler3 = `Лінійка: 3-те число адреси, від 0 до 255; поділки через 64, блок для /${t3.prefix} — ${2 ** (32 - t3.prefix)} адреси (у цьому числі це 64). Твоя адреса: 167.`;
  assert.ok(html.includes(`${ruler3}</figcaption>`));
  store.dispatch({ type: 'instance', key: h.instanceKeyOf(h.mask, t3, p3), action: { type: 'session', action: { type: 'reveal' } } });
  html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes(`${ruler3} Виділений блок: від 128 до 191.`));

  // Fit task: nothing before a check; then the student's own mask; the answer once revealed.
  const pf = { seed: 1, level: 2 };
  const tf = h.mask.create(null, pf);
  const kf = h.instanceKeyOf(h.mask, tf, pf);
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 2, seeds: { 1: 4821, 2: 1, 3: 5 } } });
  html = unescape(store.render(h.MaskScreen));
  assert.equal(tf.kind, 'fit');
  assert.ok(!html.includes('ng-ruler'), 'fit: no ruler before a check');
  // What «Перевірити» stores after «/28» (too big a block for 2 devices).
  store.dispatch({ type: 'instance', key: kf, action: { type: 'checked', answer: { prefix: '/28' }, result: h.mask.check(tf, { prefix: '/28' }) } });
  store.dispatch({ type: 'instance', key: kf, action: { type: 'view', patch: { rulerPrefix: 28 } } });
  html = unescape(store.render(h.MaskScreen));
  // Repair 13: the network-size task has no address: no marker, the block's size in words.
  assert.ok(html.includes('Блок цієї маски — 16 адрес: від 0 до 15.') && !html.includes('ng-ruler-marker'), 'the block of the mask the student gave');
  store.dispatch({ type: 'instance', key: kf, action: { type: 'session', action: { type: 'reveal' } } });
  html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes('Блок цієї маски — 4 адреси: від 0 до 3.'), 'revealed: the answer’s block (/30)');
});

test('Standalone: the screen gets its section’s bank, and the area carries the theme preference', () => {
  let seen = null;
  const Capture = props => { seen = props; return null; };
  const bank = { bankId: 'test.bank', bankRevision: 1, tasks: [] };
  let html = h.renderPlain(h.Standalone, { section: { Screen: Capture, bank }, prefs: { theme: 'light' } });
  assert.equal(seen.bank, bank);
  assert.equal(seen.route, null);
  assert.equal(html, '<div class="ng-standalone" data-theme="light"></div>');
  html = h.renderPlain(h.Standalone, { section: { Screen: h.MaskScreen } });
  assert.match(html, /^<div class="ng-standalone" data-theme="dark"><div class="ng-exercise"/);
});
