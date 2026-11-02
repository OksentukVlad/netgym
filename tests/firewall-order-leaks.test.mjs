import test from 'node:test';
import assert from 'node:assert/strict';
import { create, hints, prepareOrder } from '../src/sections/firewall/logic/order.js';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';
import { orderText, orderUi, t } from '../src/sections/firewall/uk.js';
import { firewallOrderLeaks, normaliseReactIds, orderListFindings } from './helpers/firewall-order-leaks.mjs';
import { firewallLeaks } from './helpers/firewall-leaks.mjs';
import { sweepSeeds } from './helpers/sweep-mode.mjs';
import { renderOrderGivens } from '../.test-bundles/harness/firewall-order.mjs';
import { forRecord } from '../src/sections/firewall/logic/order.js';
import { initialState, transition } from '../src/sections/firewall/logic/order-state.js';
import { initialInstance } from '../src/ui/exercise-state.js';

const record = resolveOrderRecord();
const screen = await import('../.test-bundles/harness/firewall.mjs');

test('FW-2 B4 dedicated gate permits goals/rule meanings that FW-1 correctly forbids', () => {
  const task = create(record);
  assert.deepEqual(firewallOrderLeaks(task, { kind: 'task' }), []);
  assert.ok(firewallLeaks(task.text, 'variant').length);
  assert.deepEqual(firewallOrderLeaks(`${orderUi.policy} ${task.text} input forward accept drop`), []);
});

test('FW-2 B4 every seeded public/SSR surface has no reference, ids or order hints before reveal', () => {
  for (const v of record.variants) for (const seed of sweepSeeds(Array.from({ length: 50 }, (_, i) => i), [1, 7, 42])) {
    const task = create(record, { variantId: v.id, seed });
    assert.deepEqual(firewallOrderLeaks(JSON.parse(JSON.stringify(task)), { kind: 'task' }), []);
    assert.doesNotMatch(JSON.stringify(task), /"(?:referenceOrder|position|order|originalId|commandId|freeToMove|dependencies)"|"r[1-9]"/);
    for (const r of task.rules) assert.deepEqual(firewallOrderLeaks(t(r.descriptionCode)), []);
    for (const rung of [0, 1, 2, 3]) {
      const html = renderOrderGivens(task, hints().slice(0, rung));
      assert.deepEqual(firewallOrderLeaks(html, { task, kind: rung === 3 ? 'example' : 'surface' }), []);
      for (const r of task.rules) assert.ok(!html.includes(r.id));
      assert.equal((html.match(/class="ng-reorder-item/g) ?? []).length, task.rules.length);
      const positions = task.rules.map(r => html.indexOf(t(r.descriptionCode)));
      assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'DOM and accessible names follow learner order');
    }
    assert.deepEqual(firewallOrderLeaks(orderText(hints()[0].code)), []);
    assert.deepEqual(firewallOrderLeaks(orderText(hints()[2].code), { kind: 'example' }), []);
  }
});

for (const [name, mutate] of [
  ['reference array', t => t.referenceOrder = t.rules.map(r => r.id)],
  ['reference hidden as policy', t => t.policy = { rules: [...t.rules].reverse() }],
  ['free to move', t => t.rules[0].freeToMove = true],
  ['position', t => t.rules[0].position = 1],
  ['ordinal id', t => t.rules[0].id = 'r1'],
  ['original id', t => t.rules[0].originalId = 'r1'],
  ['predicate metadata', t => t.rules[0].match.answerKey = 'first'],
  ['nested expected', t => t.topology.router.lists.expectedOrder = ['r1']],
  ['identity metadata', t => t.identity.rank = 1],
  ['unrecognised root alias', t => t.hiddenInventory = [...t.rules].reverse()],
  ['goal tells order', t => t.text += ' FastTrack має стояти перед accept.'],
]) test(`FW-2 B4 injected task leak is rejected: ${name}`, () => {
  const task = create(record); mutate(task);
  assert.ok(firewallOrderLeaks(task, { kind: 'task' }).length);
});

for (const [name, surface] of [
  ['visible reference', 'Один із правильних порядків'],
  ['ordinal number', 'Правило 6 має стояти вище'],
  ['visible id', 'r6'],
  ['opaque id', 'f-deadbeef'],
  ['title position', '<span title="позиція 6">правило</span>'],
  ['accessible reference', '<span aria-label="еталонний порядок">правило</span>'],
  ['alt reference', '<img alt="правильний порядок">'],
  ['hidden reference', '<span hidden>еталон</span>'],
  ['data reference', '<span data-reference="6">правило</span>'],
  ['data order', '<span data-order="first">правило</span>'],
  ['unquoted attr', '<span data-position=6>правило</span>'],
  ['single quoted attr', "<span aria-description='r6'>правило</span>"],
  ['encoded attr', '<span title="&#114;6">правило</span>'],
  ['encoded markup', '&lt;span data-reference="6"&gt;правило&lt;/span&gt;'],
  ['copy payload', '/ip firewall filter add chain=forward action=fasttrack-connection'],
  ['ordering hint', 'FastTrack — перед правилом, що пропускає встановлені з’єднання.'],
]) test(`FW-2 B4 injected rendered/copy leak is rejected: ${name}`, () => {
  assert.ok(firewallOrderLeaks(surface).length);
});

test('FW-2 B4 copy/metadata gate does not exempt unknown fields or example attributes', () => {
  assert.ok(firewallOrderLeaks({ copy: '/ip firewall filter add chain=input action=drop' }).length);
  assert.ok(firewallOrderLeaks({ arbitrary: { canonicalOrder: ['a', 'b'] } }).length);
  assert.ok(firewallOrderLeaks('<p title="r6">Окремий приклад</p>', { kind: 'example' }).length);
  const malformedIdentity = create(record);
  malformedIdentity.identity.seed = malformedIdentity.rules.map(r => r.id);
  malformedIdentity.instanceKey = JSON.stringify(malformedIdentity.identity);
  assert.ok(firewallOrderLeaks(malformedIdentity, { kind: 'task' }).length, 'identity seed cannot smuggle an array');
  const malformedText = create(record); malformedText.text = [1, 2, 3, 4, 5];
  assert.ok(firewallOrderLeaks(malformedText, { kind: 'task' }).length, 'prose fields have a string grammar');
  const task = create(record), p = prepareOrder(task, record), result = p.check({ order: task.rules.map(r => r.id) });
  assert.equal(result.findings.length, 1);
  assert.ok(!JSON.stringify(result).includes('referenceOrder'));
});

// The production screen (OrderView.jsx through FirewallScreen), rendered on
// the server from a store in each pre-reveal state: the first view, a check,
// its walk, every hint. The mounted helper (mounted-firewall.mjs) drives the
// same screen with events; this sweeps more seeds through the same gate.
test('FW-2 B4 the production screen passes the dedicated gate for every sampled seed before the reveal', () => {
  const logic = forRecord(record);
  let renders = 0;
  for (const v of record.variants) for (const seed of sweepSeeds(Array.from({ length: 50 }, (_, i) => i), [1, 7, 42])) {
    const task = create(record, { variantId: v.id, seed });
    const start = initialState(task), checked = transition(logic, task, start, { type: 'check' });
    for (const [orderState, hintIndex] of [[start, 0], [checked, 0], [transition(logic, task, checked, { type: 'walk' }), 0], [transition(logic, task, checked, { type: 'walk' }), 3]]) {
      const state = screen.initialStore();
      state.places['firewall-tab'] = { exercise: 'order' };
      state.places['firewall-order'] = { variantId: v.id, seeds: { input: seed, all: seed } };
      state.instances[task.instanceKey] = { ...initialInstance(), view: { orderState }, session: { ...initialInstance().session, hintIndex, assisted: hintIndex > 0 } };
      const html = screen.renderScreen(state);
      assert.match(html, /class="ng-fw ng-fwo/, 'the FW-2 screen rendered');
      assert.equal((html.match(/class="ng-reorder-item/g) ?? []).length, task.rules.length);
      assert.deepEqual(firewallOrderLeaks(normaliseReactIds(html), { task }), [], `${v.id} ${seed} ${orderState.result?.feedback?.code ?? 'start'} hints ${hintIndex}`);
      assert.deepEqual(orderListFindings(html), [], 'position names are each row\'s current position');
      for (const r of task.rules) assert.ok(!html.includes(r.id), 'no rule id in the markup');
      assert.doesNotMatch(html, /ng-fwo-answer|ng-copy/, 'no reference list and no copy payload before the reveal or a pass');
      renders++;
    }
  }
  assert.ok(renders >= 2 * 4 * 4, `renders: ${renders}`);
});

test('FW-2 B4 the exemptions are narrow: React ids only where verified, position names only as each row\'s own', () => {
  // Generated ids and their references are normalised; the same token as text, in another attribute or dangling is not.
  assert.equal(normaliseReactIds('<p id=":r0:"></p><b aria-describedby=":r0:"></b>'), '<p id="react-id"></p><b aria-describedby="react-id"></b>');
  assert.equal(normaliseReactIds('<p id=":Rhi:"></p><label for=":Rhi:"></label>'), '<p id="react-id"></p><label for="react-id"></label>');
  for (const kept of ['<b title=":r6:"></b>', '<b aria-describedby=":r6:"></b>', '<b>:r6:</b>', '<b id="r6"></b>']) {
    assert.equal(normaliseReactIds(kept), kept);
    assert.ok(firewallOrderLeaks(normaliseReactIds(kept)).length > 0, kept);
  }
  const other = normaliseReactIds('<p id=":r0:"></p><b data-x=":r0:"></b>');
  assert.equal(other, '<p id="react-id"></p><b data-x=":r0:"></b>', 'another attribute keeps the token');
  assert.ok(firewallOrderLeaks(other).length > 0);
  const row = (n, up = n, down = n, handle = n) => `<li class="ng-reorder-item"><div aria-label="${handle}. Переставити: правило"></div><button aria-label="Вище: позиція ${up}"></button><button aria-label="Нижче: позиція ${down}"></button></li>`;
  const list = rows => `<ol class="ng-reorder" aria-label="Правила фільтра">${rows.join('')}</ol>`;
  assert.deepEqual(orderListFindings(list([row(1), row(2), row(3)])), []);
  assert.deepEqual(orderListFindings(list([row(1), row(2, 5), row(3)])), ['moves 2']);
  assert.deepEqual(orderListFindings(list([row(1), row(2), row(3, 3, 1)])), ['moves 3']);
  assert.deepEqual(orderListFindings(list([row(1, 1, 1, 4), row(2), row(3)])), ['handle 1']);
  assert.deepEqual(orderListFindings(`${list([row(1)])}<p aria-label="Вище: позиція 3"></p>`), ['position names outside the list']);
});
