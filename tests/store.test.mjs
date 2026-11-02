import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPrefs, initialStore, storeReducer } from '../src/app/store.js';
import { initialInstance, instanceReducer, scoreOf } from '../src/ui/exercise-state.js';
import { initialSession } from '../src/ui/session.js';

const ok = { ok: true, complete: true, code: 'ok', findings: [] };
const no = { ok: false, complete: false, code: 'no-route', findings: [] };

test('exercise state: a check keeps the answer and result, records the part, counts a press and moves the session', () => {
  const start = initialInstance();
  assert.deepEqual(start, { session: initialSession(), answer: null, result: null, completion: null, parts: {}, presses: 0, drafts: {}, view: {} });
  let s = instanceReducer(start, { type: 'draft', syntax: 'cisco', part: 'R1/0', value: { net: '1' } });
  s = instanceReducer(s, { type: 'draft', syntax: 'routeros', part: 'R1/0', value: { dst: '2' } });
  s = instanceReducer(s, { type: 'draft', syntax: 'routeros', part: 'R2/0', value: { dst: '3' } });
  s = instanceReducer(s, { type: 'checked', answer: { R1: [null] }, result: no, part: 'R1/0', partResult: { ok: false, syntax: 'cisco', visible: true }, syntax: 'cisco' });
  assert.deepEqual(start, initialInstance(), 'immutable');
  assert.equal(s.presses, 1);
  assert.equal(s.session.attempts, 1);
  assert.equal(s.session.status, 'working');
  assert.deepEqual(s.result, no);
  assert.deepEqual(s.parts['R1/0'], { ok: false, syntax: 'cisco', visible: true });
  // Nothing parsed (no `supersede`): every syntax keeps its unfinished text.
  assert.deepEqual(s.drafts, { cisco: { 'R1/0': { net: '1' } }, routeros: { 'R1/0': { dst: '2' }, 'R2/0': { dst: '3' } } });
  s = instanceReducer(s, { type: 'part', part: 'R1/0', patch: { visible: false } });
  assert.equal(s.parts['R1/0'].visible, false);
  assert.equal(instanceReducer(s, { type: 'part', part: 'R9/9', patch: { visible: false } }), s);
  // A check that became the canonical answer supersedes the other syntax's draft of that row only.
  s = instanceReducer(s, { type: 'checked', answer: { R1: [{}] }, result: ok, part: 'R1/0', partResult: { ok: true, syntax: 'routeros', visible: true }, syntax: 'routeros', supersede: true });
  assert.deepEqual(s.drafts, { cisco: {}, routeros: { 'R1/0': { dst: '2' }, 'R2/0': { dst: '3' } } });
  assert.equal(s.session.status, 'solved');
  assert.deepEqual(scoreOf([s]), { correct: 1, total: 16, presses: 2 });
  const view = instanceReducer(s, { type: 'view', patch: { hints: { 'R1/0': true } } });
  assert.deepEqual(view.view, { hints: { 'R1/0': true } });
  const cleared = instanceReducer(view, { type: 'clear-results' });
  assert.deepEqual([cleared.parts, cleared.presses, cleared.result, cleared.completion], [{}, 0, null, null]);
  assert.deepEqual([cleared.answer, cleared.drafts, cleared.view], [view.answer, view.drafts, view.view], '«↺» keeps answers, drafts and view');
  // «↺» takes the solved mark with the score; hints, the reveal and the assisted mark stay.
  assert.deepEqual(cleared.session, { ...view.session, status: 'working', attempts: 0, earned: { solved: false, assisted: false } });
  assert.deepEqual(instanceReducer(cleared, { type: 'reset' }), initialInstance());
});

test('exercise state: old transitional completion is ignored; the result is stored unaltered', () => {
  const unsupported = { ok: false, complete: false, code: 'unsupported', findings: [{ code: 'unsupported', severity: 'blocks' }] };
  let s = instanceReducer(initialInstance(), { type: 'checked', answer: {}, result: unsupported, completion: { ok: true, complete: true, rowsOk: true } });
  assert.equal(s.result, unsupported);
  assert.equal(s.completion, null);
  assert.equal(s.session.status, 'working');
  // Without a completion the result decides again.
  s = instanceReducer(s, { type: 'checked', answer: {}, result: no });
  assert.deepEqual([s.completion, s.session.status], [null, 'working']);
  // «↺» on a revealed instance keeps it revealed.
  s = instanceReducer(s, { type: 'session', action: { type: 'reveal' } });
  assert.deepEqual(instanceReducer(s, { type: 'clear-results' }).session, { ...s.session, attempts: 0 });
});

test('exercise state: hints and reveal go to the session; reveal is sticky across checks', () => {
  let s = instanceReducer(initialInstance(), { type: 'session', action: { type: 'hint' } });
  assert.equal(s.session.hintIndex, 1);
  assert.equal(s.session.assisted, true);
  s = instanceReducer(s, { type: 'session', action: { type: 'reveal' } });
  s = instanceReducer(s, { type: 'checked', answer: {}, result: ok });
  assert.equal(s.session.status, 'revealed');
  assert.equal(instanceReducer(s, { type: 'session', action: { type: 'unknown' } }), s);
  assert.equal(instanceReducer(s, { type: 'unknown' }), s);
});

test('exercise state: «assist» marks the session assisted without opening a hint, once', () => {
  const s = instanceReducer(initialInstance(), { type: 'session', action: { type: 'assist' } });
  assert.deepEqual([s.session.assisted, s.session.hintIndex, s.session.status], [true, 0, 'working']);
  assert.equal(instanceReducer(s, { type: 'session', action: { type: 'assist' } }), s, 'already assisted: unchanged');
  const solved = instanceReducer(s, { type: 'checked', answer: {}, result: ok });
  assert.deepEqual(solved.session.earned, { solved: true, assisted: true });
});

test('store: preferences, places and instances are separate; keys carry no syntax', () => {
  let state = initialStore({ syntax: 'routeros' });
  assert.deepEqual(state.prefs, { ...defaultPrefs, syntax: 'routeros' });
  assert.equal(storeReducer(state, { type: 'pref', name: 'syntax', value: 'routeros' }), state);
  assert.throws(() => storeReducer(state, { type: 'pref', name: 'nope', value: 1 }), RangeError);
  assert.throws(() => storeReducer(state, { type: 'nope' }), Error);
  state = storeReducer(state, { type: 'place', scope: 'routing', patch: { taskId: 'a', router: 'R1' } });
  state = storeReducer(state, { type: 'place', scope: 'routing', patch: { router: 'R2' } });
  assert.deepEqual(state.places.routing, { taskId: 'a', router: 'R2' });
  const a = 'task-a', b = 'task-b';
  state = storeReducer(state, { type: 'instance', key: a, action: { type: 'checked', answer: {}, result: ok, part: 'R1/0', partResult: { ok: true }, syntax: 'routeros' } });
  // Switching syntax is a preference change only: the instance is untouched.
  const before = state.instances[a];
  state = storeReducer(state, { type: 'pref', name: 'syntax', value: 'cisco' });
  assert.equal(state.instances[a], before);
  state = storeReducer(state, { type: 'instance', key: a, action: { type: 'checked', answer: {}, result: ok, part: 'R1/0', partResult: { ok: true }, syntax: 'cisco' } });
  state = storeReducer(state, { type: 'instance', key: b, action: { type: 'checked', answer: {}, result: no, part: 'R1/0', partResult: { ok: false }, syntax: 'cisco' } });
  assert.deepEqual(scoreOf([state.instances[a], state.instances[b]]), { correct: 1, total: 16, presses: 3 }, 'one row per part, whatever the syntax');
  const cleared = storeReducer(state, { type: 'instances', keys: [a, b, 'missing'], action: { type: 'clear-results' } });
  assert.deepEqual(scoreOf(Object.values(cleared.instances)), { correct: 0, total: 16, presses: 0 });
  assert.equal(cleared.instances.missing, undefined);
  assert.equal(storeReducer(cleared, { type: 'instances', keys: ['missing'], action: { type: 'clear-results' } }), cleared);
});
