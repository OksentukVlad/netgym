import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as firewallBank from '../src/banks/firewall/tasks.js';
import { orderRecords, resolveOrderRecord, validateOrderBank } from '../src/banks/firewall/order.js';
import { orderWitnessCards, cards } from '../src/banks/firewall/cards.js';
import { create, prepareOrder, validateRecord, forRecord, hints, check, solution, initialAnswer, codes } from '../src/sections/firewall/logic/order.js';
import { initialState, transition } from '../src/sections/firewall/logic/order-state.js';
import { evaluate } from '../src/sections/firewall/logic/evaluate.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { validateCard } from '../src/sections/firewall/logic/model.js';
import { orderCopy, orderText, orderUi } from '../src/sections/firewall/uk.js';
import { makeRng } from '../src/engine/rng.js';
import { sweepSeeds } from './helpers/sweep-mode.mjs';

const record = resolveOrderRecord(), clone = structuredClone;
const frozenCommands = JSON.parse(readFileSync(new URL('./fixtures/firewall-commands.json', import.meta.url), 'utf8'))['home-basic'];
const byCode = (task, code) => task.rules.find(r => r.descriptionCode === `rule.${code}`).id;
// Independent semantic inventory for replaying display RNG in these fixtures.
const inventory = task => [...task.rules].sort((a, b) => {
  for (const key of ['action', 'chain', 'descriptionCode']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
});

test('FW-2 bank: two home-basic variants and two strictly validated witnesses; FW-1 inventory stays frozen', () => {
  assert.deepEqual(validateOrderBank(), []);
  assert.equal(firewallBank.orderRecords, orderRecords);
  assert.deepEqual(firewallBank.resolveOrderRecord(), record);
  assert.deepEqual(validateRecord(record), []);
  assert.deepEqual(record.variants.map(v => [v.id, v.policy.rules.length]), [['input', 5], ['all', 9]]);
  assert.equal(cards.length, 17);
  assert.equal(orderWitnessCards.length, 2);
  for (const card of orderWitnessCards) {
    assert.deepEqual(validateCard(card, record.variants[0].topology), []);
    assert.equal(classify(record.variants[0].topology, card).hook, 'input');
    assert.equal(card.facts.state, 'invalid');
    assert.equal(evaluate(record.variants[0].policy, card, classify(record.variants[0].topology, card)).verdict, 'drop');
  }
  for (const mutate of [w => w[0].expected = 'drop', w => w[0].facts.state = 'bad', w => w[0].packet.protocol = 'other', w => w[0].facts.ingress = 'other']) {
    const w = clone(orderWitnessCards); mutate(w); assert.ok(validateOrderBank(orderRecords, w).length);
  }
  const invalid = clone(orderRecords); invalid[0].variants[0].cardIds.push('missing');
  assert.ok(validateOrderBank(invalid).length);
  assert.ok(validateOrderBank(null).length); assert.ok(validateOrderBank(orderRecords, null).length);
  assert.ok(validateOrderBank([{ id: 'fw-order', variants: 'xx' }]).length);
  const unknown = clone(orderWitnessCards); unknown[0].facts.state = 'unknown';
  assert.ok(validateOrderBank(orderRecords, unknown).length);
});

for (const [witnessId, acceptCode] of [['wan-invalid-icmp', 'input-icmp'], ['lan-invalid-tcp', 'input-lan']]) {
  test(`FW-2 witness is necessary and selected after existing cards: ${witnessId}`, () => {
    const task = create(record, { variantId: 'input' }), prepared = prepareOrder(task, record);
    const order = prepared.solution().order;
    const invalid = byCode(task, 'input-invalid'), accept = byCode(task, acceptCode);
    order.splice(order.indexOf(accept), 1); order.splice(order.indexOf(invalid), 0, accept);
    const policy = prepared.walkInput(order, orderWitnessCards[0]).policy;
    const topology = task.topology;
    for (const card of cards) assert.equal(evaluate(policy, card, classify(topology, card)).verdict,
      evaluate(record.variants[0].policy, card, classify(topology, card)).verdict, card.id);
    const result = prepared.check({ order });
    assert.equal(result.feedback.code, 'order-verdict');
    assert.equal(result.feedback.card.id, witnessId);
    assert.equal(result.feedback.expected, 'drop'); assert.equal(result.feedback.actual, 'accept');
    assert.deepEqual(result.feedback.ruleIds, [accept]);
  });
}

test('FW-2 factory is deterministic, serialisable and detached; every start fails across seeds', () => {
  const before = clone(record), sortedPositions = new Set();
  for (const variant of record.variants) for (const seed of sweepSeeds(Array.from({ length: 80 }, (_, i) => i), [1, 7, 42])) {
    const task = create(record, { variantId: variant.id, seed });
    assert.deepEqual(task, create(record, { variantId: variant.id, seed }));
    const prepared = prepareOrder(task, record), revealed = prepared.solution();
    assert.equal(prepared.check(initialAnswer(task)).ok, false);
    assert.equal(prepared.check({ order: revealed.order }).ok, true);
    assert.deepEqual(check(clone(task), { order: revealed.order }, clone(record)), prepared.check({ order: revealed.order }));
    assert.deepEqual(Object.keys(task).sort(), ['identity', 'instanceKey', 'rules', 'text', 'title', 'topology']);
    assert.ok(task.rules.every(r => /^f-[a-f0-9]{8}$/.test(r.id)));
    sortedPositions.add(task.rules.map(r => r.id).sort().map(id => revealed.order.indexOf(id)).join());
    task.rules[0].enabled = false; task.topology.router.gateway = '203.0.113.99';
  }
  assert.ok(sortedPositions.size > 3, 'lexically sorted ids have no fixed reference-position mapping');
  assert.deepEqual(record, before);
});

test('FW-2 rejection sampling retries whole shuffles (including a passing first draw)', () => {
  let found = false;
  for (let seed = 0; seed < 150 && !found; seed++) {
    const task = create(record, { seed, variantId: 'input' }), p = prepareOrder(task, record);
    const rules = inventory(task);
    const rng = makeRng(seed), first = rng.shuffle(rules);
    if (!p.check({ order: first.map(r => r.id) }).ok) continue;
    found = true;
    let expected;
    for (let i = 0; i < 1024; i++) { const next = rng.shuffle(rules); if (!p.check({ order: next.map(r => r.id) }).ok) { expected = next; break; } }
    assert.deepEqual(task.rules, expected);
    assert.notDeepEqual(task.rules, first);
  }
  assert.ok(found, 'must exercise a rejection, not just check ordinary starts');
});

test('FW-2 public seed cannot reconstruct the reference through id assignment or inverse display shuffle', () => {
  for (const variant of record.variants) for (const seed of [1, 7, 42, 99, 'review']) {
    const task = create(record, { variantId: variant.id, seed }), p = prepareOrder(task, record);
    // Old exploit 1: replay the public id pool as the reference array.
    const rng = makeRng(JSON.stringify([seed, variant.id, 'fw-order-ids-v1'])), pool = new Set();
    while (pool.size < task.rules.length) pool.add(`f-${rng.int(0, 0xffffffff).toString(16).padStart(8, '0')}`);
    const replayedIds = rng.shuffle([...pool]);
    assert.deepEqual(new Set(replayedIds), new Set(task.rules.map(r => r.id)));
    // Old exploit 2: invert the first seeded display permutation.
    const permutation = makeRng(seed).shuffle(task.rules.map((_, i) => i)), inverted = [];
    permutation.forEach((originalIndex, i) => inverted[originalIndex] = task.rules[i].id);
    for (const order of [replayedIds, inverted]) {
      assert.notDeepEqual(order, p.solution().order, `${variant.id}/${seed}`);
      assert.equal(p.check({ order }).ok, false, `${variant.id}/${seed}`);
    }
  }
});

test('FW-2 public task is invariant under an equivalent private reference and renamed original ids', () => {
  for (const variant of record.variants) for (const seed of [1, 7, 42, 99, 'review']) {
    const task = create(record, { variantId: variant.id, seed }), p = prepareOrder(task, record);
    const changed = clone(record), rules = changed.variants.find(v => v.id === variant.id).policy.rules;
    [rules[0], rules[1]] = [rules[1], rules[0]];
    const alternative = rules.map(r => task.rules.find(publicRule => publicRule.descriptionCode === r.descriptionCode).id);
    assert.equal(p.check({ order: alternative }).ok, true);
    assert.notDeepEqual(alternative, p.solution().order);
    assert.deepEqual(create(changed, { variantId: variant.id, seed }), task);
    const other = prepareOrder(clone(task), changed);
    assert.deepEqual(other.solution().order, alternative, 'reveal uses the supplied private reference');
    assert.equal(other.check({ order: p.solution().order }).ok, true);
    rules.forEach((r, i) => r.id = `renamed-${rules.length - i}`);
    assert.deepEqual(create(changed, { variantId: variant.id, seed }), task);
  }
});

test('FW-2 sparse answers cannot omit any rule, including FastTrack, or produce evidence/scripts', () => {
  for (const variant of record.variants) {
    const task = create(record, { variantId: variant.id, seed: 42 }), p = prepareOrder(task, record);
    for (let slot = 0; slot < task.rules.length; slot++) {
      const order = p.solution().order;
      delete order[slot];
      const result = p.check({ order });
      assert.equal(result.ok, false); assert.equal(result.complete, false); assert.equal(result.code, 'order-invalid');
      assert.deepEqual(result.feedback, { code: 'order-invalid', ruleIds: [] });
      assert.deepEqual(result.findings, [result.feedback]);
      assert.equal(Object.hasOwn(result, 'evidence'), false);
      assert.equal(p.acceptedScript({ order }), null);
      assert.equal(p.analyze(order).valid, false);
      assert.throws(() => p.walkInput(order, cards[0]), /order-invalid/);
    }
  }
});

test('FW-2 exact-permutation validation blocks omitted, repeated, foreign and malformed answers without evidence', () => {
  const task = create(record), p = prepareOrder(task, record), good = p.solution().order;
  for (const answer of [null, [], {}, { order: good.slice(1) }, { order: [...good, good[0]] }, { order: good.map(() => good[0]) }, { order: good.map((id, i) => i ? id : 'foreign') }, { order: good, extra: true }, { order: 'bad' }]) {
    const result = p.check(answer);
    assert.equal(result.ok, false); assert.equal(result.complete, false);
    assert.deepEqual(result.findings, [{ code: 'order-invalid', ruleIds: [] }]);
    assert.equal(p.acceptedScript(answer), null);
  }
});

test('FW-2 forward shadow takes priority in the full filter; otherwise verdict feedback precedes dead rules', () => {
  const task = create(record, { variantId: 'all' }), p = prepareOrder(task, record), order = p.solution().order;
  const fasttrack = byCode(task, 'forward-fasttrack'), replies = byCode(task, 'forward-replies');
  const fi = order.indexOf(fasttrack), ri = order.indexOf(replies);
  [order[fi], order[ri]] = [replies, fasttrack];
  const result = p.check({ order });
  assert.equal(p.analyze(order).sameVerdicts, true);
  assert.deepEqual(p.analyze(order).deadRuleIds, [fasttrack]);
  assert.deepEqual(result.feedback, { code: 'order-dead', ruleId: fasttrack, blockerId: replies, ruleIds: [fasttrack, replies],
    shadow: { ruleNumber: order.indexOf(fasttrack) + 1, blockerNumber: order.indexOf(replies) + 1,
      ruleDescriptionCode: 'rule.forward-fasttrack', blockerDescriptionCode: 'rule.forward-replies', action: 'accept' } });
  const rest = byCode(task, 'input-rest'); order.splice(order.indexOf(rest), 1); order.unshift(rest);
  const broken = p.check({ order });
  assert.equal(broken.findings.length, 1); assert.equal(broken.feedback.code, 'order-dead');
  assert.equal(broken.feedback.ruleId, fasttrack);
  // With no forward failure, the input verdict still precedes its dead rules.
  order.splice(order.indexOf(fasttrack), 1); order.splice(order.indexOf(replies), 0, fasttrack);
  const inputOnly = p.check({ order });
  assert.equal(inputOnly.feedback.code, 'order-verdict');
  assert.ok(!JSON.stringify(inputOnly).includes(fasttrack));
});

test('FW-2 walk uses exactly the learner list; accepted script retains it and reveal is labelled one correct order', () => {
  const task = create(record, { variantId: 'all' }), p = prepareOrder(task, record);
  const input = p.walkInput(task.rules.map(r => r.id), cards[7]);
  assert.deepEqual(input.policy.rules, task.rules);
  assert.deepEqual(input.walk, evaluate(input.policy, input.card, classify(input.topology, input.card)));
  assert.deepEqual(input.walk.steps.map(s => s.ruleId), task.rules.slice(0, input.walk.steps.length).map(r => r.id));
  const ref = p.solution(), alternative = [...ref.order];
  [alternative[0], alternative[1]] = [alternative[1], alternative[0]];
  alternative.unshift(alternative.pop()); // forward WAN drop can interleave with input.
  const script = p.acceptedScript({ order: alternative });
  assert.ok(script); assert.notEqual(script.script, ref.script);
  const input2 = p.walkInput(alternative, cards[7]);
  const frozenByDescription = new Map(record.variants[1].policy.rules.map((r, i) => [r.descriptionCode, frozenCommands[i]]));
  assert.equal(script.script, input2.policy.rules.map(r => frozenByDescription.get(r.descriptionCode)).join('\n'));
  assert.equal(ref.script, frozenCommands.join('\n'));
  assert.equal(script.script.split('\n').length, 9);
  assert.equal(ref.labelCode, 'order-reveal-label');
  assert.match(orderText(ref.labelCode), /Один із правильних/);
  assert.deepEqual(solution(clone(task), record), ref);
});

test('FW-2 lifecycle: reorder clears marks, walk and success; hint 2 opens current evidence; assistance persists', () => {
  const logic = forRecord(record), task = logic.create(null, { variantId: 'all' });
  let state = initialState(task);
  state = transition(logic, task, state, { type: 'check' });
  assert.equal(state.result.feedback.code, 'order-verdict');
  const initialResult = state.result;
  state = transition(logic, task, state, { type: 'hint' });
  assert.equal(state.walkOpen, false);
  state = transition(logic, task, state, { type: 'hint' });
  assert.equal(state.walkOpen, true); assert.equal(state.result, initialResult);
  const next = [...state.answer.order].reverse();
  state = transition(logic, task, state, { type: 'order', order: next });
  assert.equal(state.result, null); assert.equal(state.walkOpen, false); assert.equal(state.assisted, true);
  state = transition(logic, task, state, { type: 'reveal' });
  assert.equal(state.revealed, true); assert.equal(state.assisted, true);
  assert.deepEqual(state.answer.order, next, 'reveal does not silently reorder the learner list');
  state = transition(logic, task, state, { type: 'order', order: logic.solution(task).order });
  state = transition(logic, task, state, { type: 'check' });
  assert.equal(state.result.ok, true);
  state = transition(logic, task, clone(state), { type: 'order', order: next });
  assert.equal(state.result, null); assert.equal(state.walkOpen, false);
  assert.equal(state.revealed, true); assert.equal(state.assisted, true);
  assert.equal(transition(logic, task, state, { type: 'order', order: [] }), state);
  assert.throws(() => transition(logic, logic.create(null, { seed: 2 }), state, { type: 'check' }), /invalid-task/);
});

test('FW-2 hint 2 checks the current list when needed; hint progress caps and dead-only feedback has no packet walk', () => {
  const logic = forRecord(record), task = logic.create(null, { variantId: 'all' });
  let state = initialState(task);
  for (let i = 0; i < 5; i++) state = transition(logic, task, state, { type: 'hint' });
  assert.equal(state.hintIndex, 3); assert.equal(state.walkOpen, true);
  assert.equal(state.result.feedback.code, 'order-verdict');
  let order = logic.solution(task).order;
  const ft = byCode(task, 'forward-fasttrack'); order = order.filter(id => id !== ft); order.push(ft);
  state = transition(logic, task, initialState(task), { type: 'order', order });
  state = transition(logic, task, state, { type: 'check' });
  state = transition(logic, task, state, { type: 'walk' });
  assert.equal(state.walkOpen, false);
});

test('FW-2 B2/B3 wording: bounded home set, slow path, chain-end difference and goal without ordering', () => {
  assert.match(orderUi.policy, /Спрощений домашній набір за практикою MikroTik/);
  assert.match(orderUi.tips.fasttrack, /перед правилом/);
  assert.match(orderUi.tips.fasttrack, /TCP\/UDP/); assert.match(orderUi.tips.fasttrack, /повільним шляхом/);
  assert.match(orderUi.tips.forward, /WAN без dst-NAT/); assert.match(orderUi.tips.forward, /кінці ланцюжка/);
  for (const v of record.variants) {
    const { text } = create(record, { variantId: v.id });
    assert.match(text, /Некоректні пакети відкидаються, навіть із LAN або як ICMP/);
    assert.match(text, /Кожне правило має отримувати пакети, для яких воно призначене/);
    assert.doesNotMatch(text, /вище|нижче|перед правилом|останн|factory|заводськ|іспит|квит|клас/iu);
  }
  assert.equal(orderUi.fate({ expected: 'unknown', actual: 'accept' }), 'має: невідомо · у тебе: пропустити');
  for (const h of hints()) assert.ok(Object.hasOwn(orderCopy, h.code));
  assert.deepEqual([...codes].sort(), Object.keys(orderCopy).sort());
  assert.equal(hints()[1].action, 'open-walk');
  assert.match(orderText(hints()[2].code), /SMTP/);
});

test('FW-2 invalid records and task tampering fail explicitly; public task alone cannot produce a reference', () => {
  for (const bad of [null, orderRecords[0], { ...record, expected: {} }]) assert.throws(() => create(bad), /invalid-record/);
  for (const params of [{ seed: NaN }, { seed: {} }, { variantId: 'missing' }]) assert.throws(() => create(record, params), /invalid-record/);
  const task = create(record);
  assert.throws(() => solution(task), /invalid-record/);
  for (const mutate of [t => t.referenceOrder = [], t => t.rules[0].enabled = false, t => t.identity.generatorVersion = 99, t => t.topology.router.lists.WAN = ['bridge']]) {
    const t = clone(task); mutate(t); assert.throws(() => prepareOrder(t, record), /invalid-(?:record|task)/);
  }
});
