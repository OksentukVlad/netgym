// FW-2 «Упорядкуй правила»: the screen's pure view (src/sections/firewall/
// screens/orderView.js): the task's lines, hint 2's words, the learner's
// rows, the walk on them, the diagram's scene and «Текстом». The screen
// itself is driven in tests/helpers/mounted-firewall.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, prepareOrder } from '../src/sections/firewall/logic/order.js';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';
import { orderGoals, orderText, orderUi, t, ui } from '../src/sections/firewall/uk.js';
import { TIPS, hint2Text, orderRows, orderScene, orderTextSections, quoted, taskLines, walkRows } from '../src/sections/firewall/screens/orderView.js';
import { natRuleOf } from '../src/sections/firewall/screens/walkView.js';

const record = resolveOrderRecord();
const variant = id => record.variants.find(v => v.id === id);

test('orderView: taskLines splits the level\'s sentence from the goal lines (B3)', () => {
  for (const v of record.variants) {
    const task = create(record, { variantId: v.id, seed: 3 });
    const { sentence, goals } = taskLines(task);
    assert.equal(sentence, v.text);
    assert.deepEqual(goals, orderGoals[v.id].split('\n'));
    assert.equal([sentence, ...goals].join('\n'), task.text);
    assert.match(goals.at(-1), /Кожне правило має отримувати пакети/);
  }
});

test('orderView: hint 2\'s words follow the finding it was opened for', () => {
  assert.equal(hint2Text('order-verdict'), orderText('order-hint-walk'));
  assert.equal(hint2Text(undefined), orderText('order-hint-walk'));
  assert.equal(hint2Text('order-dead'), orderUi.hintDead);
  assert.equal(hint2Text('order-ok'), orderUi.hintDone);
  assert.doesNotMatch(orderUi.hintDead, /шлях|вище|нижче|перед|після/);
  // Round 4 repair (Fable 1): it names the two marks a shadowing gives.
  assert.ok(orderUi.hintDead.includes(orderUi.markBlocker.replace('• ', '')) && orderUi.hintDead.includes(orderUi.markHidden.replace('• ', '')));
});

test('orderView: rows follow the given order and carry no number or command', () => {
  const task = create(record, { variantId: 'all', seed: 5 });
  const order = [...task.rules.map(r => r.id)].reverse();
  const rows = orderRows(task, order);
  assert.deepEqual(rows.map(r => r.id), order);
  for (const row of rows) {
    const rule = task.rules.find(r => r.id === row.id);
    assert.deepEqual(Object.keys(row).sort(), ['action', 'chain', 'chips', 'description', 'id']);
    assert.equal(row.chain, rule.chain);
    assert.equal(row.description, t(rule.descriptionCode));
    assert.ok(row.chips.length > 0);
  }
  assert.equal(rows.find(r => r.action === 'fasttrack')?.chain, 'forward');
  assert.equal(quoted('Відкидає решту пакетів до роутера.'), 'Відкидає решту пакетів до роутера');
  assert.deepEqual(TIPS, { input: ['replies', 'input'], all: ['fasttrack', 'replies', 'input', 'forward'] });
});

test('orderView: the walk lies on the learner\'s rows: why each missed, the decider, then not reached', () => {
  const task = create(record, { variantId: 'input', seed: 11 });
  const order = task.rules.map(r => r.id), p = prepareOrder(task, record);
  const feedback = p.check({ order }).feedback;
  assert.equal(feedback.code, 'order-verdict');
  const walkIn = p.walkInput(order, feedback.card);
  const walk = walkRows(walkIn);
  assert.deepEqual(Object.keys(walk.byId).sort(), [...order].sort());
  const decider = order.indexOf(walkIn.walk.decidedBy);
  assert.equal(walk.byId[order[decider]].state, 'match');
  assert.equal(walk.byId[order[decider]].text, ui.walk.match);
  for (const id of order.slice(decider + 1)) assert.equal(walk.byId[id].state, 'not-reached');
  for (const id of order.slice(0, decider)) assert.equal(walk.byId[id].state, 'mismatch');
  assert.equal(walk.end, null);
  assert.deepEqual(walk.assumptions, []);
});

test('orderView: a FastTrack-marked forward packet brings the slow-path words; a chain end that decides is named', () => {
  const task = create(record, { variantId: 'all', seed: 2 }), p = prepareOrder(task, record);
  const reference = p.solution().order;
  const reply = variant('all').cards.find(c => c.id === 'reply-to-pc');
  const walk = walkRows(p.walkInput(reference, reply));
  assert.ok(Object.values(walk.byId).some(o => o.state === 'marked'));
  // Round 4 (spec F1 v2): the corrected slow-path words, as FW-1's walk says them.
  assert.ok(walk.assumptions.length > 0 && /повільному шляху/.test(walk.assumptions[0]) && /наступне правило accept потрібне/.test(walk.assumptions[0]));
  const lanOut = variant('all').cards.find(c => c.id === 'lan-web-out');
  const end = walkRows(p.walkInput(reference, lanOut)).end;
  assert.deepEqual(end && end.chain, 'forward');
});

test('orderView: the diagram has no packet until a finding names one, then its source, then its walk', () => {
  const task = create(record, { variantId: 'all', seed: 7 }), p = prepareOrder(task, record);
  const nat = natRuleOf(task.topology, variant('all').cards);
  const neutral = orderScene({ topology: task.topology, nat });
  assert.equal(neutral.ingress, null);
  assert.equal(neutral.envelope, null);
  assert.deepEqual(neutral.path, []);
  assert.deepEqual(neutral.nat, nat);
  const card = variant('all').cards.find(c => c.id === 'lan-winbox');
  const given = orderScene({ topology: task.topology, nat, card });
  assert.equal(given.ingress, card.facts.ingress);
  assert.deepEqual(given.path, []);
  assert.deepEqual(given.nat, nat, 'the network\'s dst-NAT label stays');
  const walked = orderScene({ topology: task.topology, nat, card, walkIn: p.walkInput(p.solution().order, card) });
  assert.ok(walked.path.length > 0 && walked.envelope !== null);
  assert.equal(walked.doors.input, 'chosen');
});

test('orderView: «Текстом» says the network, then the packet, then the door and the conclusion', () => {
  const task = create(record, { variantId: 'input', seed: 1 }), p = prepareOrder(task, record);
  const card = variant('input').cards.find(c => c.id === 'lan-winbox');
  const headings = args => orderTextSections({ topology: task.topology, ...args }).map(s => s.heading);
  assert.deepEqual(headings({}), [ui.text.router, ui.text.hosts]);
  assert.deepEqual(headings({ card }), [ui.text.router, ui.text.hosts, ui.text.packet]);
  const sections = orderTextSections({ topology: task.topology, card, walkIn: p.walkInput(p.solution().order, card) });
  assert.deepEqual(sections.map(s => s.heading), [ui.text.router, ui.text.hosts, ui.text.packet, ui.text.door, ui.text.conclusion]);
  assert.equal(sections.at(-2).items[0], ui.hook.input);
  const nat = natRuleOf(task.topology, variant('all').cards);
  assert.deepEqual(headings({ nat }), [ui.text.router, ui.text.hosts, ui.text.nat]);
});
