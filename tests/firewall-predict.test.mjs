import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, policies, records, safetyCardIds, outcomes, clone, expectedAnswer, fullTask, resolveRecord } from './helpers/firewall.mjs';
import exercise, { create, check, solution, hints, initialCommitState, commit, validateRecord } from '../src/sections/firewall/logic/predict.js';
import { t } from '../src/sections/firewall/uk.js';
import { makeRng } from '../src/engine/rng.js';

for (const policy of policies) test(`firewall predict correct answer on EVERY card: ${policy.id}`, () => {
  const task = fullTask(policy.id);
  const answer = Object.fromEntries(cards.map(c => [c.id, expectedAnswer(outcomes[policy.id][c.id])]));
  assert.deepEqual(solution(task), answer);
  const result = check(task, answer);
  assert.equal(result.ok, true); assert.equal(result.complete, true); assert.deepEqual(result.findings, []);
  assert.deepEqual(Object.keys(result.evidence).sort(), task.cards.map(c => c.id).sort());
});

for (const [name, cardId, selection, code, policyId = 'home-basic'] of [
  ['missing hook and rule', 'lan-winbox', {}, 'invalid-selection'],
  ['null', 'lan-winbox', null, 'invalid-selection'],
  ['unknown rule', 'lan-winbox', { hook: 'input', decidedBy: 'missing' }, 'invalid-selection'],
  ['unknown hook', 'lan-winbox', { hook: 'output', decidedBy: 'r4' }, 'invalid-selection'],
  ['ambiguous chain end', 'lan-web-out', { hook: 'forward', decidedBy: 'chain-end' }, 'invalid-selection'],
  ['wrong door', 'lan-winbox', { hook: 'forward', decidedBy: 'r7' }, 'wrong-door'],
  ['disabled', 'lan-winbox', { hook: 'input', decidedBy: 'r4' }, 'rule-disabled', 'home-disabled'],
  ['other chain', 'lan-winbox', { hook: 'input', decidedBy: 'r7' }, 'rule-other-chain'],
  ['other chain end', 'lan-web-out', { hook: 'forward', decidedBy: 'chain-end:input' }, 'rule-other-chain'],
  ['fasttrack', 'reply-to-pc', { hook: 'forward', decidedBy: 'r6' }, 'fasttrack-not-final'],
  ['same action later rule', 'wan-invalid-router', { hook: 'input', decidedBy: 'r5' }, 'right-verdict-wrong-rule'],
  ['same action earlier rule', 'lan-winbox', { hook: 'input', decidedBy: 'r1' }, 'right-verdict-wrong-rule'],
  ['same action chain end', 'reply-to-pc', { hook: 'forward', decidedBy: 'chain-end:forward' }, 'right-verdict-wrong-rule'],
  ['wrong action', 'lan-winbox', { hook: 'input', decidedBy: 'r5' }, 'wrong-verdict'],
  ['wrong action chain end', 'wan-winbox', { hook: 'input', decidedBy: 'chain-end:input' }, 'wrong-verdict'],
  ['invalid precedes wrong door', 'lan-winbox', { hook: 'forward', decidedBy: 'missing' }, 'invalid-selection'],
  ['wrong door precedes disabled', 'lan-winbox', { hook: 'forward', decidedBy: 'r4' }, 'wrong-door', 'home-disabled'],
  ['disabled precedes other chain', 'reply-to-pc', { hook: 'forward', decidedBy: 'r4' }, 'rule-disabled', 'home-disabled'],
  ['other chain precedes fasttrack', 'lan-winbox', { hook: 'input', decidedBy: 'r6' }, 'rule-other-chain'],
]) test(`firewall finding precedence: ${name}`, () => {
  const result = check(fullTask(policyId), { [cardId]: selection });
  assert.equal(result.ok, false); assert.equal(result.complete, false);
  assert.deepEqual(result.findings, [{ code, entity: cardId, severity: 'blocks' }]);
  assert.deepEqual(Object.keys(result.evidence), code === 'invalid-selection' ? [] : [cardId]);
});

test('firewall finding copy covers same-action rules on either side and disabled rules unambiguously', () => {
  assert.equal(t('right-verdict-wrong-rule'), 'Дія та сама, але вирішує інше правило — перше, де збіглися всі умови.');
  assert.equal(t('rule-disabled'), 'Це правило вимкнене — фільтр його минає.');
});

test('firewall completion means committed, success means correct; only both earn round', () => {
  const task = fullTask(), answer = solution(task);
  assert.deepEqual(check(task, {}), { ok: true, complete: false, code: 'ok', findings: [], evidence: {} });
  let result = check(task, { 'lan-winbox': answer['lan-winbox'] });
  assert.equal(result.ok, true); assert.equal(result.complete, false);
  answer['lan-winbox'] = { hook: 'input', decidedBy: 'r5' };
  result = check(task, answer);
  assert.equal(result.ok, false); assert.equal(result.complete, true);
  assert.doesNotMatch(JSON.stringify(result), /"(?:score|percentage|correctCount|total)"/);
});

test('firewall commitment locks first submission, snapshots inputs and isolates task instances', () => {
  const task = fullTask(), answer = { hook: 'input', decidedBy: 'r5' }, initial = initialCommitState(task);
  const first = commit(task, initial, 'lan-winbox', answer);
  answer.decidedBy = 'r4';
  assert.equal(first.answer['lan-winbox'].decidedBy, 'r5'); assert.deepEqual(initial.answer, {});
  assert.equal(commit(task, first, 'lan-winbox', answer), first);
  assert.deepEqual(Object.keys(first.result.evidence), ['lan-winbox']);
  const next = commit(task, first, 'reply-to-pc', { hook: 'forward', decidedBy: 'r7' });
  assert.deepEqual(Object.keys(first.answer), ['lan-winbox']);
  assert.deepEqual(Object.keys(next.result.evidence), ['reply-to-pc', 'lan-winbox']);
  const newTask = create(resolveRecord(records[0]), { seed: 'again' });
  assert.throws(() => commit(newTask, first, 'reply-to-pc', answer), /invalid-selection/);
  assert.deepEqual(initialCommitState(newTask).answer, {});
});

for (const [name, selection] of [
  ['missing both', {}], ['null', null], ['missing hook', { decidedBy: 'r4' }],
  ['missing rule', { hook: 'input' }], ['unknown hook', { hook: 'output', decidedBy: 'r4' }],
  ['unknown rule', { hook: 'input', decidedBy: 'missing' }],
]) test(`firewall invalid commit stays unlocked and hides evidence: ${name}`, () => {
  const task = fullTask(), state = initialCommitState(task), before = clone(state);
  assert.throws(() => commit(task, state, 'lan-winbox', selection), { name: 'RangeError', message: 'invalid-selection' });
  assert.deepEqual(state, before);
  const answer = solution(task); answer['lan-winbox'] = selection;
  const result = check(task, answer);
  assert.equal(result.complete, false);
  assert.equal(Object.hasOwn(result.evidence, 'lan-winbox'), false);
  const fixed = commit(task, state, 'lan-winbox', { hook: 'input', decidedBy: 'r4' });
  assert.equal(fixed.result.ok, true);
  assert.deepEqual(Object.keys(fixed.result.evidence), ['lan-winbox']);
});

test('firewall hints are three code-only rungs; solution follows answer contract', () => {
  const task = fullTask();
  assert.deepEqual(hints(task), [
    { code: 'hint-door', params: {}, rung: 1 }, { code: 'hint-order', params: {}, rung: 2 }, { code: 'hint-example', params: {}, rung: 3 },
  ]);
  assert.equal(exercise.id, 'fw-predict'); assert.equal(exercise.version, 1);
  for (const a of Object.values(solution(task))) assert.deepEqual(Object.keys(a), ['hook', 'decidedBy']);
});

test('firewall create is deterministic, detached from bank, with seed in identity', () => {
  const record = resolveRecord(records[0]), before = clone(record);
  const task = create(record, { seed: 'one' });
  assert.deepEqual(task, create(record, { seed: 'one' }));
  assert.notEqual(task.instanceKey, create(record, { seed: 'two' }).instanceKey);
  task.cards[0].packet.dstIp = '192.0.2.200'; task.policy.rules[0].enabled = false;
  assert.deepEqual(record, before);
});

test('firewall sampling reshuffles after rejection instead of filling from the first shuffle', () => {
  const record = resolveRecord(records[0]), variant = record.variants[0];
  const rng = makeRng(1);
  const suitable = cards => {
    const expected = cards.map(c => outcomes[variant.policy.id][c.id]);
    return ['input', 'forward'].every(hook => expected.some(e => e.hook === hook))
      && expected.some(e => e.decidedBy === 'chain-end') && cards.filter(c => c.safety).length >= 2;
  };
  const first = rng.shuffle(variant.cards).slice(0, 6);
  assert.equal(suitable(first), false, 'fixture must require a retry');
  let accepted;
  for (let attempt = 1; attempt < 1024; attempt++) {
    const next = rng.shuffle(variant.cards).slice(0, 6);
    if (suitable(next)) { accepted = next; break; }
  }
  assert.ok(accepted);
  const task = create(record, { seed: 1 });
  assert.deepEqual(task.cards.map(c => c.id), accepted.map(c => c.id));
  // Level 2's generator v2 sampling replay remains unchanged in v4.
  assert.deepEqual(task.cards.map(c => c.id), [
    'port-forward', 'reply-to-pc', 'lan-web-out', 'invalid-fwd', 'wan-to-router-lan-ip', 'wan-to-pc-new',
  ]);
  assert.equal(task.identity.generatorVersion, 4);
});

test('firewall round constraints on every variant across 200 seeds; smaller rounds use all cards', () => {
  const record = resolveRecord(records[0]), orders = new Set();
  for (const v of record.variants) for (let seed = 0; seed < 200; seed++) {
    const task = create(record, { variantId: v.id, seed });
    assert.equal(task.cards.length, Math.min(6, v.cards.length));
    assert.equal(new Set(task.cards.map(c => c.id)).size, task.cards.length);
    const expected = task.cards.map(c => outcomes[v.policy.id][c.id]);
    for (const hook of ['input', 'forward']) assert.ok(expected.some(e => e.hook === hook));
    assert.ok(expected.some(e => e.decidedBy === 'chain-end'));
    assert.ok(task.cards.filter(c => safetyCardIds.includes(c.id)).length >= 2);
    if (v.id === 'basic') orders.add(task.cards.map(c => c.id).join(','));
    else assert.deepEqual(task.cards.map(c => c.id).sort(), v.cards.map(c => c.id).sort());
  }
  assert.ok(orders.size > 100);
});

test('firewall resolved record rejects unknowns, unresolved ids, missing facts and impossible rounds', () => {
  const record = resolveRecord(records[0]);
  assert.throws(() => create(records[0]), /invalid-record/);
  for (const mutate of [
    r => r.expected = {}, r => r.variants[0].expected = {},
    r => r.variants[0].cards[0].expected = {},
    r => r.variants[0].cards[0].facts.state = 'unknown',
    r => r.variants[0].cards.push(clone(r.variants[0].cards[0])),
    r => r.variants[0].cards = r.variants[0].cards.filter(c => c.id === 'lan-winbox'),
  ]) { const r = clone(record); mutate(r); assert.throws(() => create(r), /invalid-record/); }
  assert.throws(() => create(record, { variantId: 'missing' }), /invalid-record/);
  assert.throws(() => create(record, { seed: NaN }), /invalid-record/);
  assert.ok(validateRecord(null).length);
});

test('firewall unknown card keys and malformed answer never reveal another card', () => {
  const task = fullTask();
  const result = check(task, { missing: { hook: 'input', decidedBy: 'r4' } });
  assert.equal(result.code, 'invalid-selection'); assert.deepEqual(result.evidence, {});
  assert.equal(check(task, null).code, 'invalid-selection');
});
