import test from 'node:test';
import assert from 'node:assert/strict';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
import * as S from '../src/sections/routing/logic/faults-state.js';
import { analyse, plant, classify, eligibility, evidenceKey, levelCodes, visibleCauses, publicPolicy } from '../src/sections/routing/logic/faults.js';
import { create, solution, check as checkRouting } from '../src/sections/routing/logic/static.js';
import { ambiguousSites } from '../src/engine/faults.js';
import { copy as words, t } from '../src/sections/routing/uk.js';
import { syntaxes } from '../src/sections/routing/syntax/index.js';
import { sweepSeeds } from './helpers/sweep-mode.mjs';
// These tests only edit detached answers/copies, never the cached public task or
// metadata. Checks still execute normally so current-verdict identity is tested.
const instances = new Map();
const instance = (params = {}) => {
  const key = JSON.stringify(params);
  if (!instances.has(key)) instances.set(key, F.inspect(record, { bank, ...params }));
  return instances.get(key);
};
const copy = structuredClone;

test('A1 exact bank eligibility: normal coverage and visible internet policy; unsupported requirements rejected', () => {
  assert.deepEqual(bank.tasks.flatMap(r => r.variants.filter(v => eligibility(r, v)).map(v => v.code)), ['1', '2', '4', '5', '9', '12', '14']);
  for (const definition of record.variants) assert.ok(eligibility(bank.tasks.find(r => r.id === definition.taskId), bank.tasks.find(r => r.id === definition.taskId).variants[0]));
  assert.throws(() => instance({ level: 4 }), /invalid-record/);
  assert.throws(() => instance({ taskId: bank.tasks[2].id }), /ineligible-variant/);
  assert.deepEqual(levelCodes[1], ['missing-route', 'wrong-destination']);
  assert.deepEqual(levelCodes[2], ['missing-route', 'wrong-destination', 'wrong-next-hop', 'default-wrong-way']);
});

test('handwritten missing route: request stops at R1; return-only removal stops reply at R2', () => {
  const task = create(bank.tasks[0], { bank }), baseline = solution(task), original = copy(baseline);
  for (const [router, direction] of [['R1', 'request'], ['R2', 'reply']]) {
    const faulty = plant(baseline, { code: 'missing-route', router, index: 0 });
    assert.deepEqual(faulty[router], []);
    const probe = checkRouting(task, faulty).evidence.probes[0];
    assert.equal(probe[direction].stop.code, 'no-route');
    assert.equal(probe[direction].stop.deviceId, router);
    assert.equal(probe.code, direction === 'reply' ? 'return-path-failed' : 'no-route');
    assert.deepEqual(classify(baseline, faulty), ['missing-route']);
  }
  assert.deepEqual(baseline, original);
});
test('handwritten wrong destination: only destination changes, actual no-route stop', () => {
  const task = create(bank.tasks[0], { bank }), baseline = solution(task);
  const faulty = plant(baseline, { code: 'wrong-destination', router: 'R1', index: 0, changed: '192.168.3.0' });
  assert.deepEqual(faulty.R1, [{ ...baseline.R1[0], dst: '192.168.3.0' }]);
  const probe = checkRouting(task, faulty).evidence.probes[0];
  assert.deepEqual(probe.request.stop, { deviceId: 'R1', code: 'no-route' });
  assert.deepEqual(classify(baseline, faulty), ['wrong-destination']);
});
test('handwritten wrong next hop: real neighbour forms a request loop or a reply loop', () => {
  const task = create(bank.tasks[3], { bank }), baseline = solution(task);
  for (const [index, changed, direction] of [[0, '10.0.0.6', 'reply'], [1, '10.0.0.1', 'request']]) {
    const faulty = plant(baseline, { code: 'wrong-next-hop', router: 'R2', index, changed });
    assert.deepEqual(faulty.R2[index], { ...baseline.R2[index], via: changed });
    const probe = checkRouting(task, faulty).evidence.probes.find(p => p[direction]?.stop?.code === 'loop');
    assert.ok(probe);
    assert.equal(probe[direction].stop.deviceId, direction === 'reply' ? 'R3' : 'R2');
    assert.deepEqual(classify(baseline, faulty), ['wrong-next-hop']);
  }
  const defaults = { R1: [{ dst: '0.0.0.0', prefix: 0, via: '10.0.0.2' }] };
  assert.throws(() => plant(defaults, { code: 'wrong-next-hop', router: 'R1', index: 0, changed: '10.0.0.3' }), /invalid-fault/);
});
test('A2 compare full visible configurations and both walks; reject identical evidence across causes', () => {
  const task = create(bank.tasks[0], { bank }), { candidates } = analyse(task);
  const [a, b] = candidates;
  assert.equal(a.observation[0].code, b.observation[0].code);
  assert.notEqual(a.signature, b.signature, 'same stop does not erase the visible extra destination row');
  assert.deepEqual(visibleCauses(task.network, a.faulty, a.observation, publicPolicy(task.record, task.variant)), ['missing-route']);
  assert.deepEqual(visibleCauses(task.network, b.faulty, b.observation, publicPolicy(task.record, task.variant)), ['wrong-destination']);
  const mixed = copy(a.faulty); mixed.R1.push({ id: 'orphan', dst: '203.0.113.0', prefix: 24, via: '10.0.0.2' });
  assert.deepEqual(visibleCauses(task.network, mixed, a.observation, publicPolicy(task.record, task.variant)), ['wrong-destination'], 'competing repairs explain an orphan row by replacing its destination');
  assert.deepEqual(ambiguousSites(a, [...candidates, { ...a, site: { code: 'wrong-next-hop', key: 'other' } }]), ['other']);
  const routes = copy(a.faulty), observation = copy(a.observation);
  assert.equal(evidenceKey(routes, observation), a.signature);
  observation[0].request.hops.push({ deviceId: 'extra-observed-hop' });
  assert.notEqual(evidenceKey(routes, observation), a.signature);
});
for (const level of [2]) for (const code of levelCodes[level].filter(c => c !== 'default-wrong-way')) test(`A7 canonical and alternative repair; partial repair; cause-independent failure: ${level}/${code}`, () => {
  const i = instance({ level, taskId: bank.tasks[3].id, faultCode: code }), task = i.task;
  const correct = F.solution(task), good = F.check(task, correct);
  assert.equal(good.fixOk, true); assert.equal(good.ok, false); assert.equal(good.step, 'cause');
  assert.equal(F.check(task, correct, { step: 'cause' }).ok, true);
  assert.equal(F.check(task, correct, { step: 'cause', syntax: 'routeros' }).ok, true);
  // Rewrite edge routers using defaults: behaviour and full-prefix coverage
  // accept this even though it differs from the reference table.
  const alternative = copy(correct);
  for (const router of ['R1', 'R3']) alternative.routes[router] = [{ id: `${router}-new`, dst: '0.0.0.0', prefix: 0,
    via: alternative.routes[router][0].via }];
  assert.equal(F.check(task, alternative, { step: 'cause' }).ok, true);
  const partial = copy(correct); partial.routes.R2 = [];
  assert.equal(F.check(task, partial).fixOk, false);
  const bad = F.initialAnswer(task), expected = F.check(task, bad, { step: 'cause' });
  for (const cause of [null, code, 'invented', {}]) assert.deepEqual(F.check(task, { ...bad, cause }, { step: 'cause' }), expected);
});
test('A1 whole prefixes: host-only /32 repair does not pass sampled pings alone', () => {
  const i = instance({ taskId: bank.tasks[0].id }), answer = F.solution(i.task);
  for (const [router, rows] of Object.entries(answer.routes)) {
    const host = i.task.network.endpoints.find(h => h.ip.startsWith(rows[0].dst.slice(0, -1)));
    answer.routes[router][0] = { ...rows[0], dst: host.ip, prefix: 32 };
  }
  const result = F.check(i.task, answer);
  assert.ok(result.evidence.snapshot.rows.every(r => r.ok));
  assert.equal(result.fixOk, false); assert.equal(result.code, 'coverage-missing');
  assert.match(F.feedback(i.task, result), /не всю мережу/);
  const scopeHint = F.hints(i.task, answer, { result })[1];
  assert.equal(scopeHint.params.fixed, false, 'sampled pings alone never validate a repair');
  assert.match(scopeHint.text, /до всього потрібного блоку/);
  assert.equal(t(`routing-faults.${scopeHint.code}`, scopeHint.params), scopeHint.text);
});
test('A1 universal safety stays: reciprocal defaults block after all normal pings pass', () => {
  const i = instance({ taskId: bank.tasks[0].id }), answer = F.solution(i.task);
  for (const [router, rows] of Object.entries(answer.routes)) rows.push({ id: `${router}-default`, dst: '0.0.0.0', prefix: 0, via: rows[0].via });
  const result = F.check(i.task, answer);
  assert.ok(result.evidence.snapshot.rows.every(r => r.ok));
  assert.equal(result.code, 'unknown-space-loops');
  assert.match(F.feedback(i.task, result), /Невідомий трафік ходить по колу/);
});
test('A3 hint and feedback follow the actual reply loop instead of the catalogue label', () => {
  const i = instance({ level: 2, taskId: bank.tasks[3].id, faultCode: 'wrong-next-hop', siteKey: 'wrong-next-hop/R2/0/R3.if1' });
  const result = F.check(i.task, F.initialAnswer(i.task)), hint = F.hints(i.task, null, { result })[0];
  assert.equal(hint.params.direction, 'reply'); assert.equal(hint.params.code, 'loop');
  assert.match(hint.text, /Відповідь ходить по колу/);
  assert.equal(F.feedback(i.task, result), hint.text);
  assert.ok(!hint.text.includes('немає маршруту'));
  assert.ok(F.describeTrace(i.task, result.evidence.snapshot.rows[0]).length);
});
for (const syntax of ['cisco', 'routeros']) test(`A4 syntax and topology validation precede behaviour: ${syntax}`, () => {
  const i = instance(), solution = F.solution(i.task), adapter = syntaxes[syntax];
  const answer = { fields: Object.fromEntries(Object.entries(solution.routes).map(([r, rows]) => [r, rows.map(row => ({ id: row.id, values: adapter.fromRoute(row, row.distance !== undefined) }))])), cause: solution.cause };
  assert.equal(F.check(i.task, answer, { syntax, step: 'cause' }).ok, true);
  const router = Object.keys(answer.fields)[0], row = answer.fields[router][0];
  row.values.gw = '203.0.113.9';
  let result = F.check(i.task, answer, { syntax });
  assert.equal(result.code, 'form-errors'); assert.equal(result.findings[0].code, 'gateway-off-link');
  row.values.gw = 'unfinished';
  result = F.check(i.task, answer, { syntax });
  assert.equal(result.code, 'form-errors'); assert.equal(result.findings[0].code, 'invalid-ip');
});
test('A2/A5 cause options appear after a current passing check, 2–3 plausible seeded options', () => {
  for (const level of [1, 2]) {
    const i = instance({ level, taskId: level === 1 ? bank.tasks[0].id : bank.tasks[3].id }), answer = F.solution(i.task);
    assert.deepEqual(F.options(i.task, 'cause'), []);
    const result = F.check(i.task, answer), opts = F.options(i.task, 'cause', { answer, result });
    assert.equal(opts.length, level === 1 ? 2 : 3);
    assert.ok(opts.some(o => o.value === answer.cause));
    assert.deepEqual(F.options(i.task, 'cause', { answer, result }), opts);
    const edited = copy(answer); edited.routes[Object.keys(edited.routes)[0]] = [];
    assert.deepEqual(F.options(i.task, 'cause', { answer: edited, result }), []);
    assert.deepEqual(F.options(i.task, 'cause', { answer, result: { ...result } }), [], 'fabricated/serialized verdict does not open options');
  }
  const orders = new Set(sweepSeeds(Array.from({ length: 8 }, (_, seed) => seed), [0, 1]).map(seed => {
    const i = instance({ seed }), answer = F.solution(i.task), result = F.check(i.task, answer);
    return F.options(i.task, 'cause', { result, answer }).map(o => o.value).join('/');
  }));
  assert.equal(orders.size, 2);
});
test('A5 state transitions preserve original snapshot, close cause on edit, and track assistance', () => {
  const i = instance(), task = i.task, correct = F.solution(task);
  let state = S.initialState(task), original = copy(state.original);
  assert.equal(state.snapshot.label, 'на початку');
  state = S.edit(state, correct);
  assert.deepEqual(state.snapshot, original, 'unchecked edit is not a live ping oracle');
  state = S.submit(task, state);
  assert.equal(state.step, 'cause'); assert.equal(state.snapshot.label, 'після перевірки'); assert.equal(state.assisted, false);
  const opts = F.options(task, 'cause', { answer: state.answer, result: state.result });
  state = S.chooseCause(task, state, opts.find(o => o.value !== correct.cause).value);
  state = S.submit(task, state);
  assert.equal(state.step, 'cause'); assert.equal(state.assisted, true);
  assert.match(F.feedback(task, state.result), /Ремонт правильний — залиш його. Причина була інша./);
  state = S.chooseCause(task, state, correct.cause); state = S.submit(task, state);
  assert.equal(state.step, 'done'); assert.equal(state.assisted, true);
  state = S.edit(state, correct); assert.equal(state.step, 'fix'); assert.equal(state.answer.cause, null);
  assert.deepEqual(state.original, original);
  assert.match(S.showHint(task, state, 2).hints[0].text, /Пінги проходять/, 'hint 2 retains the latest checked snapshot after edits');
  const clean = S.initialState(task);
  assert.equal(S.showHint(task, clean, 2).assisted, false);
  assert.equal(S.showHint(task, clean, 3).assisted, true);
  assert.equal(S.reveal(task, clean).assisted, true);
  assert.equal(F.hints(task, null, { rung: 3 }).length, 2);
  assert.equal(S.showHint(task, clean, 3).hints[2].assisted, true);
  assert.equal(F.check(task, { ...correct, cause: 'invented' }, { step: 'cause' }).code, 'invalid-cause');
});
test('A7 seeded reconstruction and public adapter stay deterministic and isolated', () => {
  for (const seed of [0, 1, 42, 9999]) {
    const task = F.create(record, { bank, seed });
    assert.equal(JSON.stringify(F.create(record, { bank, seed })), JSON.stringify(task));
    const restored = F.restore(copy(task), record, bank);
    assert.equal(F.check(restored, F.solution(task), { step: 'cause' }).ok, true);
    const damaged = copy(task); damaged.network.devices[0].id = 'changed';
    assert.throws(() => F.restore(damaged, record, bank), /instance-mismatch/);
    const original = JSON.stringify(task), answer = F.initialAnswer(task); answer.routes.R1 = [];
    assert.equal(JSON.stringify(task), original);
  }
  for (const seed of [-1, 10000, '1', 1.5]) assert.throws(() => instance({ seed }), /invalid-record/);
});

test('RF-1 result and hint codes have Ukrainian copy; rung 2 copy uses actual stop evidence', () => {
  for (const code of F.codes) assert.ok(`routing-faults.${code}` in words, code);
  const task = instance().task;
  for (const hint of F.hints(task, null, { rung: 3, assisted: true }))
    assert.equal(t(`routing-faults.${hint.code}`, hint.params), hint.text);
});
