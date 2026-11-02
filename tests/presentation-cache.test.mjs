import test from 'node:test';
import assert from 'node:assert/strict';
import routing from './helpers/routing.mjs';
import tasks from '../src/banks/routing/tasks.js';
import { withReadOnlyLogic } from './helpers/read-only-logic.mjs';

test('presentation fixture reuse preserves real verdicts, distinct answers and caller-owned results', () => {
  const task = routing.create(tasks[0]), answer = routing.solution(task);
  const check = routing.check, hints = routing.hints;
  const expected = check(task, answer), wrong = check(task, {});
  withReadOnlyLogic(routing, () => {
    assert.deepEqual(routing.check(task, answer), expected);
    const first = routing.check(task, answer);
    first.findings.push({ code: 'caller-edit' });
    first.evidence.probes.length = 0;
    assert.deepEqual(routing.check(task, answer), expected);
    assert.deepEqual(routing.check(task, {}), wrong);
    assert.deepEqual(routing.hints(task, {}, 'cisco'), hints(task, {}, 'cisco'));
    assert.deepEqual(routing.hints(task, {}, 'routeros'), hints(task, {}, 'routeros'));
  });
  assert.equal(routing.check, check);
  assert.equal(routing.hints, hints);
  assert.throws(() => withReadOnlyLogic(routing, () => { throw new Error('fixture failure'); }), /fixture failure/);
  assert.equal(routing.check, check);
  assert.equal(routing.hints, hints);
});
