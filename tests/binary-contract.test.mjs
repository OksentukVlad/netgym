import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../.test-bundles/harness/binary-contract.mjs';

const probe = (store, params = { seed: 42 }) => {
  let ex;
  store.render(h.BinaryProbe, { params, expose: value => { ex = value; } });
  return ex;
};
// The screen's required guard and accepted part payload, exercised through
// the real useExercise hook. Production logic intentionally stays stateless.
function submit(ex, octets) {
  const step = ex.view.step ?? 0;
  const answer = { step, octets };
  if (h.binary.isIncomplete(answer)) return null;
  const result = h.binary.check(ex.task, answer);
  ex.check(answer, { result, ...(result.ok ? { part: step, partResult: { octets: [...octets] } } : {}) });
  if (result.ok) ex.setView({ step: Math.min(3, step + 1) });
  return result;
}

test('binary hook: incomplete rows dispatch nothing; four accepted parts persist and only the last earns', () => {
  const store = h.testStore();
  let ex = probe(store);
  assert.equal(ex.solution, null);
  assert.equal(submit(ex, ['', '', '', '']), null);
  assert.equal(submit(ex, ['0000000', '00000000', '00000000', '00000000']), null);
  assert.equal(store.actions.length, 0);
  ex = probe(store);
  assert.deepEqual([ex.session.attempts, ex.presses, ex.answer], [0, 0, null]);
  const rows = h.binary.solution(ex.task).steps;
  for (let step = 0; step < 4; step++) {
    assert.equal(submit(ex, rows[step].octets).ok, true);
    ex = probe(store);
    assert.deepEqual(ex.parts[step], { octets: rows[step].octets });
    assert.deepEqual([ex.session.attempts, ex.presses, ex.status, ex.finished], [step + 1, step + 1, step === 3 ? 'solved' : 'working', step === 3]);
    assert.equal(ex.solution, null, 'solving does not reveal the reference');
  }
  assert.deepEqual(ex.session.earned, { solved: true, assisted: false });
});

test('binary hook: view keeps step, per-step drafts and hint counts across navigation; parts keep accepted rows', () => {
  const store = h.testStore();
  let ex = probe(store);
  const key = ex.key, solution = h.binary.solution(ex.task);
  submit(ex, solution.steps[0].octets);
  ex = probe(store);
  const drafts = { 0: solution.steps[0].octets, 1: ['111', '', '', ''] };
  ex.setView({ drafts, hintCounts: { 0: 0, 1: 2 } });
  ex.hint();
  const other = probe(store, { seed: 43 });
  assert.notEqual(other.key, key);
  assert.deepEqual(other.view, {});
  ex = probe(store);
  assert.equal(ex.key, key);
  assert.deepEqual(ex.view, { step: 1, drafts, hintCounts: { 0: 0, 1: 2 } });
  assert.deepEqual(ex.parts[0], { octets: solution.steps[0].octets });
  assert.equal(ex.session.assisted, true);
  assert.equal(ex.solution, null);
  assert.deepEqual(ex.hints({ step: 1 }), h.binary.hints(ex.task, ex.answer, { step: 1 }));
  for (let step = 1; step < 4; step++) {
    submit(ex, solution.steps[step].octets);
    ex = probe(store);
  }
  assert.deepEqual(ex.session.earned, { solved: true, assisted: true });
});

test('binary hook: wrong AND never advances or overwrites an accepted part', () => {
  const store = h.testStore();
  let ex = probe(store);
  const rows = h.binary.solution(ex.task).steps;
  for (let step = 0; step < 2; step++) { submit(ex, rows[step].octets); ex = probe(store); }
  const before = structuredClone(ex.parts);
  assert.equal(submit(ex, Array(4).fill('00000000')).code, 'wrong-and');
  ex = probe(store);
  assert.equal(ex.view.step, 2);
  assert.deepEqual(ex.parts, before);
  assert.equal(ex.session.attempts, 3);
  assert.equal(ex.session.earned.solved, false);
});

test('binary hook: reveal mid-walk exposes all rows, retains progress and disqualifies completion', () => {
  const store = h.testStore();
  let ex = probe(store);
  const rows = h.binary.solution(ex.task).steps;
  submit(ex, rows[0].octets);
  ex = probe(store);
  ex.reveal();
  ex = probe(store);
  assert.equal(ex.finished, true);
  assert.equal(ex.status, 'revealed');
  assert.deepEqual(ex.solution, { steps: rows });
  assert.equal(ex.view.step, 1);
  assert.deepEqual(ex.parts[0], { octets: rows[0].octets });
  for (let step = 1; step < 4; step++) { submit(ex, rows[step].octets); ex = probe(store); }
  assert.deepEqual(ex.session.earned, { solved: false, assisted: false });
  assert.equal(ex.status, 'revealed');
  assert.equal(ex.session.assisted, true);
});
