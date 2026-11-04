import test from 'node:test';
import assert from 'node:assert/strict';
import * as order from '../src/sections/firewall/logic/order.js';
import { initialState, transition, hintsForState } from '../src/sections/firewall/logic/order-state.js';
import { traceCaptions } from '../src/sections/firewall/logic/trace.js';
import { evaluate } from '../src/sections/firewall/logic/evaluate.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';
import { describe } from '../src/sections/ip/logic/calc.js';
import { comprehension as ip } from '../src/sections/ip/uk.js';
import { comprehension as routing } from '../src/sections/routing/uk.js';
import { comprehension as vlan } from '../src/sections/vlan/uk.js';
import { comprehension as fw } from '../src/sections/firewall/uk.js';
import { comprehension as setup } from '../src/sections/setup/uk.js';
import * as bank from '../src/banks/routing/tasks.js';
import { create, checkRow, textFor, solution, check } from './helpers/routing.mjs';
import { mapAddresses } from '../src/engine/renumber.js';
import { parseField } from '../src/sections/vlan/screens/portsState.js';

const record = resolveOrderRecord();
const byCode = (task, code) => task.rules.find(r => r.descriptionCode === `rule.${code}`).id;

test('firewall witness is trace evidence for the supplied learner order, including a shadow with a correct verdict', () => {
  for (const variant of record.variants) for (const seed of [0, 2, 19, 42]) {
    const task = order.create(record, { variantId: variant.id, seed }), answer = order.initialAnswer(task);
    const finding = order.check(task, answer, record).feedback;
    const before = structuredClone({ task, answer, finding });
    const witness = order.witnessFor(task, answer.order, finding);
    assert.ok(witness);
    assert.deepEqual(witness.policy.rules.map(r => r.id), answer.order);
    assert.deepEqual(witness.walk, evaluate(witness.policy, witness.card, classify(task.topology, witness.card)));
    assert.equal(witness.captions[0].ingress, witness.card.facts.ingress);
    const hint = order.hints(task, answer, { finding })[0];
    assert.equal(hint.params.chain, witness.walk.hook);
    assert.equal(hint.params.verdict, witness.walk.verdict);
    assert.equal(hint.params.ruleNumber, witness.walk.decidedBy === 'chain-end' ? null : answer.order.indexOf(witness.walk.decidedBy) + 1);
    assert.ok(hint.text.includes(witness.card.packet.srcIp));
    assert.deepEqual({ task, answer, finding }, before);
  }
  const task = order.create(record, { variantId: 'all' }), p = order.prepareOrder(task, record);
  const answer = p.solution(), ft = byCode(task, 'forward-fasttrack'), replies = byCode(task, 'forward-replies');
  const fi = answer.order.indexOf(ft), ri = answer.order.indexOf(replies);
  [answer.order[fi], answer.order[ri]] = [replies, ft];
  const result = p.check({ order: answer.order });
  assert.equal(result.code, 'order-dead'); assert.equal(p.analyze(answer.order).sameVerdicts, true);
  const w = order.witnessFor(task, answer.order, result.feedback);
  assert.ok(w); assert.equal(w.walk.decidedBy, replies);
  let state = initialState(task), logic = order.forRecord(record);
  state = transition(logic, task, state, { type: 'order', order: answer.order });
  state = transition(logic, task, state, { type: 'check' });
  state = transition(logic, task, state, { type: 'walk' });
  assert.equal(state.walkOpen, true, 'shadow finding has a packet walk');
  assert.equal(evaluate({ ...w.policy, rules: [task.rules.find(r => r.id === ft)] }, w.card, classify(task.topology, w.card)).steps[0].outcome, 'marked');
  assert.ok(!w.walk.steps.some(s => s.ruleId === ft));
  assert.match(order.hints(task, { order: answer.order }, { finding: result.feedback })[0].text, /зупинився на правилі/);
  assert.equal(order.witnessFor(task, answer.order, { code: 'order-invalid' }), null);
  assert.throws(() => order.witnessFor(task, [], result.feedback), /order-invalid/);
});

test('hint 1 lifecycle: before check, checked evidence, after reorder last evidence, then no hint when solved; a new task resets it', () => {
  const logic = order.forRecord(record), task = logic.create(null, { variantId: 'all', seed: 19 });
  let state = initialState(task);
  assert.equal(hintsForState(task, state)[0].text, fw.hintBeforeCheck);
  state = transition(logic, task, state, { type: 'hint' });
  assert.equal(state.result, null); assert.equal(state.lastCheck, null);
  state = transition(logic, task, state, { type: 'check' });
  const checked = structuredClone(hintsForState(task, state));
  const savedOrder = [...state.answer.order];
  const legacy = { ...state }; delete legacy.lastCheck;
  const restored = transition(logic, task, legacy, { type: 'order', order: [...state.answer.order].reverse() });
  assert.deepEqual(hintsForState(task, restored), checked, 'restored pre-upgrade state preserves its checked evidence on the first edit');
  state = transition(logic, task, state, { type: 'order', order: [...state.answer.order].reverse() });
  assert.equal(state.result, null); assert.deepEqual(state.lastCheck.order, savedOrder);
  assert.deepEqual(hintsForState(task, state), checked);
  state = transition(logic, task, state, { type: 'order', order: logic.solution(task).order });
  state = transition(logic, task, state, { type: 'check' });
  assert.deepEqual(hintsForState(task, state), []);
  assert.strictEqual(transition(logic, task, state, { type: 'hint' }), state, 'solved state offers no further hint');
  assert.deepEqual(order.hints(task, state.answer, { finding: { code: 'order-ok' } }), []);
  const other = logic.create(null, { variantId: 'input', seed: 20 });
  assert.equal(hintsForState(other, initialState(other))[0].text, fw.hintBeforeCheck);
  assert.equal(order.hints(task, state.answer, { finding: { code: 'order-invalid' } })[0].text, fw.hintInvalid);
});

test('trace captions name ingress, chain, actual zero-based rules and outcomes, dst-NAT, FastTrack and chain-end', () => {
  const task = order.create(record, { variantId: 'all' }), p = order.prepareOrder(task, record), ref = p.solution().order;
  const cards = record.variants.find(v => v.id === 'all').cards;
  const seen = new Set();
  for (const card of cards) {
    const input = p.walkInput(ref, card), captions = traceCaptions(input);
    assert.equal(captions[0].text, fw.traceIngress(card.facts.ingress));
    assert.ok(captions.some(c => c.kind === 'chain' && c.chain === input.walk.hook));
    for (const [i, step] of input.walk.steps.entries()) {
      const c = captions.filter(c => c.kind === 'rule')[i]; seen.add(c.outcome);
      assert.equal(c.ruleId, step.ruleId); assert.equal(c.number, step.position - 1); assert.equal(c.outcome, step.outcome);
      assert.equal(c.chain, input.policy.rules[step.position - 1].chain);
      assert.equal(traceCaptions(input, { numberBase: 1 }).filter(s => s.kind === 'rule')[i].number, step.position);
      if (step.outcome === 'marked') assert.match(c.text, /позначено FastTrack.*іде далі/);
    }
    if (input.walk.decidedBy === 'chain-end') {
      seen.add('chain-end'); assert.equal(captions.at(-1).text, fw.traceEnd(input.walk.hook));
    }
    if (card.facts.dstNat === true) {
      seen.add('dst-nat'); assert.ok(captions.some(c => c.kind === 'dst-nat'));
      if (card.facts.dstNatFrom) assert.ok(captions.find(c => c.kind === 'dst-nat').text.includes(card.packet.dstIp));
    }
  }
  for (const outcome of ['match', 'marked', 'mismatch', 'other-chain', 'chain-end', 'dst-nat']) assert.ok(seen.has(outcome), outcome);
  const input = p.walkInput(ref, cards[0]);
  input.policy.rules[0].enabled = false;
  input.walk = evaluate(input.policy, input.card, classify(input.topology, input.card));
  assert.ok(traceCaptions(input).some(c => c.outcome === 'disabled' && /вимкнено/.test(c.text)));
  const unknown = structuredClone(cards.find(c => c.packet.protocol === 'tcp')); unknown.facts.state = 'unknown';
  const u = p.walkInput(ref, unknown);
  assert.ok(traceCaptions(u).some(c => c.outcome === 'unknown' && /бракує факту/.test(c.text)));
});

test('task 15: short text and original details in both task records, syntax views and generated outputs; marking is unchanged', () => {
  const record = bank.tasks.find(t => t.displayNumber === 15);
  for (const value of [record, record.variants[0]]) {
    assert.equal(value.text, 'Два маршрути за замовчуванням: основний через ISP1 і резервний через ISP2. Резервному дай більшу відстань — він спрацює, коли лінк до ISP1 зникне.');
    for (const syntax of ['cisco', 'routeros']) assert.match(textFor(value.details, syntax), /Distance — ціле число від 1 до 254/);
  }
  for (const seed of [null, 1064]) {
    const task = create(record, { seed });
    assert.ok(!task.infeasible); assert.equal(check(task, solution(task)).ok, true);
    assert.equal(task.variant.text, record.text); assert.deepEqual(task.variant.details, record.details);
    for (const syntax of ['cisco', 'routeros']) {
      const a = solution(task).R1;
      for (const [i, placeholder] of [routing.distancePrimaryPlaceholder, routing.distanceBackupPlaceholder].entries()) {
        const fields = syntax === 'cisco' ? { net: a[i].dst, mask: '0.0.0.0', gw: a[i].via, dist: placeholder }
          : { dst: '0.0.0.0/0', gw: a[i].via, dist: placeholder };
        assert.equal(checkRow(task, 'R1', i, fields, syntax).distOk, false);
      }
    }
  }
  assert.deepEqual(mapAddresses({ details: 'Сусід 10.0.0.1' }, () => '192.0.2.1'), { details: 'Сусід 192.0.2.1' });
});

test('new placeholders are symbolic and never pass their corresponding field check', () => {
  for (const record of bank.tasks) for (const variant of record.variants) {
    const task = create(record, { variantId: variant.id });
    for (const [router, rows] of Object.entries(variant.referenceRoutes)) for (let i = 0; i < rows.length; i++) {
      assert.equal(checkRow(task, router, i, { dst: routing.dstPlaceholder, gw: rows[i].via }, 'routeros').dstOk, false);
    }
  }
  assert.ok(parseField('vlans', vlan.vlansPlaceholder).every(value => !Number.isInteger(value)), 'no placeholder token is a VLAN number');
});

test('calculator caption uses commandAddress for LAN, /31, /32; unavailable commands have no caption; invalid input keeps the previous result', () => {
  assert.equal(ip.calculatorAction, 'Після коректної зміни адреси або маски результат оновиться одразу.');
  for (const [address, prefix, expected] of [['192.168.1.10', 24, '192.168.1.1/24'], ['10.0.0.1', 31, '10.0.0.1/31'], ['10.0.0.1', 32, '10.0.0.1/32']]) {
    const result = describe(address, prefix);
    assert.equal(ip.commandCaption(result.commandAddress), `Команди задають інтерфейсу адресу ${expected}`);
    assert.doesNotMatch(ip.commandCaption(result.commandAddress), /шлюз/);
  }
  assert.equal(ip.commandCaption(describe('224.0.0.1', 24).commandAddress), null);
  const previous = describe('10.0.0.1', 31), invalid = describe('bad', 24);
  assert.equal(invalid, null); assert.equal(ip.commandCaption((invalid ?? previous).commandAddress), 'Команди задають інтерфейсу адресу 10.0.0.1/31');
});

test('additive copy: separate ruler spacing/block size, VLAN state meaning, ICMP, order, FastTrack, checkpoint, advice', () => {
  assert.equal(ip.maskRulerCaption({ k: 4, labelStep: 32, prefix: 26, blockSize: 64, value: 77 }), 'Лінійка: 4-те число адреси, від 0 до 255; поділки через 32, блок для /26 — 64 адреси. Твоя адреса: 77.');
  assert.match(vlan.frameAction, /не за IP-адресами/);
  assert.match(vlan.routerOnStick, /логічний інтерфейс з адресою шлюзу для кожного VLAN/);
  assert.deepEqual(vlan.adminStateOptions, [{ value: false, label: 'вимкнено', command: 'shutdown' }, { value: true, label: 'увімкнено', command: 'no shutdown' }]);
  assert.equal(vlan.adminStateLabel, 'Адміністративний стан інтерфейсу'); assert.match(vlan.adminStateNote, /фізично піднятий/);
  assert.equal(vlan.inspecting('SW2'), 'Зараз: SW2');
  assert.equal(fw.icmpGloss, 'ICMP — службові повідомлення, зокрема ping'); assert.equal(fw.icmpEchoGloss, 'ICMP echo — ping');
  assert.match(fw.ordering, /усередині кожного ланцюжка/); assert.match(fw.fasttrackIntro, /повільному шляху/);
  assert.equal(setup.checkpointPurpose, 'крок, не команда: перевір, що новий вхід працює');
  for (const copy of [routing, vlan, fw, setup]) assert.match(copy.recommendedFirst, /^радимо спершу:/);
  assert.equal(routing.addRoute, '+ ще один маршрут (якщо потрібен)'); assert.equal(routing.internet, 'Інтернет (ISP)');
  for (const copy of [ip, routing, vlan, fw, setup]) for (const value of Object.values(copy)) if (typeof value === 'string') assert.doesNotMatch(value, /іспит|екзамен|\bклас\b/iu);
});
