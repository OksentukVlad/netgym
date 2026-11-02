import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSession, sessionReducer } from '../src/ui/session.js';
import mask from '../src/sections/ip/logic/mask.js';
import * as core from '../src/sections/ip/logic/mask-core.js';
import binary from '../src/sections/ip/logic/binary.js';
import routing from './helpers/routing.mjs';
import tasks from '../src/banks/routing/tasks.js';
import { makeRng } from '../src/engine/rng.js';
import { copy as ipCopy, t as ipText } from '../src/sections/ip/uk.js';
import { copy as routingCopy, t as routingText } from '../src/sections/routing/uk.js';

test('session: attempts, hints, completion, reveal and reset are immutable transitions', () => {
  const initial = initialSession();
  let state = sessionReducer(initial, { type: 'check', result: { ok: false, complete: false } });
  assert.deepEqual(initial, initialSession());
  assert.equal(state.attempts, 1);
  assert.equal(state.status, 'working');
  state = sessionReducer(state, { type: 'hint' });
  assert.equal(state.hintIndex, 1);
  assert.equal(state.assisted, true);
  assert.equal(state.attempts, 1);
  state = sessionReducer(state, { type: 'check', result: { ok: true, complete: true } });
  assert.equal(state.status, 'solved');
  assert.equal(state.assisted, true);
  // «↺»: the checks are forgotten, the hints stay.
  assert.deepEqual(sessionReducer(state, { type: 'clear' }), { ...state, status: 'working', attempts: 0, earned: { solved: false, assisted: false } });
  state = sessionReducer(state, { type: 'reveal' });
  state = sessionReducer(state, { type: 'check', result: { ok: true, complete: true } });
  assert.equal(state.status, 'solved');
  assert.equal(state.revealed, true);
  assert.equal(state.assisted, true);
  assert.equal(state.attempts, 3);
  assert.deepEqual(sessionReducer(state, { type: 'clear' }), { ...state, status: 'revealed', attempts: 0, earned: { solved: false, assisted: false } }, 'clear removes earned but retains reveal');
  assert.equal(sessionReducer(state, { type: 'unknown' }), state);
  assert.deepEqual(sessionReducer(state, { type: 'reset' }), initialSession());
});

test('mask adapter: deterministic core generation, checks, hints, reveal and per-field choices', () => {
  for (let level = 1; level <= 3; level++) for (let seed = 0; seed < 60; seed++) {
    const task = mask.create(null, { seed, level });
    assert.deepEqual(task, core.generate(makeRng(seed), level));
    assert.deepEqual(mask.create(null, { seed, level }), task);
    const answer = mask.solution(task);
    assert.deepEqual(answer, core.solution(task));
    assert.deepEqual(mask.hints(task), core.hints(task));
    for (const [field, values] of Object.entries(core.options(task))) assert.deepEqual(mask.options(task, field), values);
    assert.deepEqual(mask.check(task, answer), { ok: true, complete: true, code: 'ok', findings: [], evidence: core.check(task, answer) });
    const wrong = mask.check(task, {});
    assert.equal(wrong.ok, false);
    assert.equal(wrong.complete, false);
    assert.equal(wrong.findings[0].severity, 'blocks');
    assert.deepEqual(wrong.findings[0].params, (({ ok, code, ...rest }) => rest)(core.check(task, {})));
    assert.equal(sessionReducer(initialSession(), { type: 'check', result: mask.check(task, answer) }).status, 'solved');
  }
  assert.deepEqual(mask.create(null, { seed: 4821 }), core.generate(makeRng(4821), 1));
});

test('binary slice through session: four accepted rows, only step 3 solves', () => {
  const task = binary.create(null, { ip: '192.168.10.77', prefix: 26, level: 3 });
  const rows = [
    ['11000000', '10101000', '00001010', '01001101'],
    ['11111111', '11111111', '11111111', '11000000'],
    ['11000000', '10101000', '00001010', '01000000'],
    ['11000000', '10101000', '00001010', '01111111'],
  ];
  let state = initialSession();
  for (let step = 0; step < 4; step++) {
    const result = binary.check(task, { step, octets: rows[step] });
    assert.deepEqual(result, { ok: true, complete: step === 3, code: 'ok', findings: [] });
    state = sessionReducer(state, { type: 'check', result });
    assert.equal(state.status, step === 3 ? 'solved' : 'working');
    assert.equal(state.attempts, step + 1);
    assert.equal(state.assisted, false);
  }
  assert.deepEqual(binary.solution(task).steps.map(answer => binary.check(task, answer).ok), [true, true, true, true]);
});

test('binary slice through session: wrong AND is step 2; reveal never earns completion', () => {
  const task = binary.create(null, { ip: '192.168.10.77', prefix: 26, level: 3 });
  const result = binary.check(task, { step: 2, octets: ['00000000', '00000000', '00000000', '00000000'] });
  assert.equal(result.code, 'wrong-and');
  let state = sessionReducer(initialSession(), { type: 'check', result });
  assert.equal(state.status, 'working');
  state = sessionReducer(state, { type: 'reveal' });
  assert.equal(state.status, 'revealed');
  assert.equal(state.assisted, true);
  assert.equal(state.attempts, 1);
  state = sessionReducer(state, { type: 'check', result: binary.check(task, binary.solution(task).steps[3]) });
  assert.equal(state.earned.solved, false);
  assert.equal(state.status, 'revealed');
  assert.equal(binary.check(task, { step: 2, octets: [] }).code, 'invalid-bits');
  assert.equal(binary.check(task, { step: 2, octets: ['bad'] }).code, 'invalid-bits');
  assert.equal(binary.check(task, {}).code, 'invalid-step');
  assert.throws(() => binary.create(null, { ip: 'bad' }), RangeError);
});

test('every logic result and hint code has Ukrainian copy', () => {
  for (const [logic, prefix, copy, text] of [[routing, 'routing.static', routingCopy, routingText], [mask, 'mask', ipCopy, ipText], [core, 'mask', ipCopy, ipText], [binary, 'binary', ipCopy, ipText]]) {
    for (const code of logic.codes) assert.ok(`${prefix}.${code}` in copy, `${logic.id}.${code}`);
    // Render real hints so parameterised copy is also exercised.
    const task = logic === routing ? routing.create(tasks[0]) : logic === core ? core.generate(makeRng(4821), 1) : logic.create(null, { seed: 4821 });
    for (const hint of logic.hints(task)) assert.ok(text(`${prefix}.${hint.code}`, hint.params).length);
  }
});
