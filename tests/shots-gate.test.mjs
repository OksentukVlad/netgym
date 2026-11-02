// The visibility gate's exemptions (tools/shots.mjs, round 4 stage 1 repair):
// waivers are declared per recipe state, never taken from what the page
// shows. Negative cases: required evidence stays required when the page
// shows a success (also a part success) or a stale verdict the recipe didn't
// declare, and a declared outcome fails when the page shows another.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceRule, expectedTargets, gateStates, notApplicable } from '../tools/shots.mjs';

const facts = (over = {}) => ({ tones: [], scopes: [], stale: false, ...over });
const okTask = facts({ tones: ['ok'], scopes: ['task'] });
const okPart = facts({ tones: ['ok'], scopes: ['part'] });
const stale = facts({ tones: ['no'], scopes: ['task'], stale: true });

test('gate: what the page shows never waives required evidence', () => {
  for (const [id, state] of [['fw-order1', 'wrong'], ['fw-order2', 'hint'], ['mask-type', 'done'], ['mask-type', 'mistake'], ['rt-guided', 'success-recheck'], ['setup-router', 'mistake'], ['setup-switch', 'hint'], ['setup-router', 'recall-mistake'], ['setup-switch', 'recall-hint'], ['setup-router', 'recall-solved']]) {
    const gate = expectedTargets(id, state);
    assert.ok(gate.evidence.length > 0 && !gate.waive, `${id} ${state} declares evidence and no waiver`);
    for (const shown of [okTask, okPart, stale, facts()]) {
      const decision = evidenceRule(gate, shown);
      assert.deepEqual([decision.required, decision.waived], [true, null], `${id} ${state}: ${JSON.stringify(shown)}`);
    }
  }
});

test('gate: declared waivers carry their reason, and the declared outcome must show', () => {
  for (const id of ['fw-order1', 'fw-order2']) {
    for (const state of ['solved', 'success-recheck']) {
      const gate = expectedTargets(id, state);
      assert.equal(gate.expect, 'success');
      const ok = evidenceRule(gate, okTask);
      assert.deepEqual([ok.required, ok.failures], [false, []]);
      assert.match(ok.waived, /task-scope success/);
      assert.equal(evidenceRule(gate, okPart).failures.length, 1, 'a part success is not the declared task success');
      assert.equal(evidenceRule(gate, facts({ tones: ['no'], scopes: ['task'] })).failures.length, 1, 'a wrong verdict fails the declared success');
    }
    const edit = expectedTargets(id, 'success-edit');
    assert.equal(edit.expect, 'stale');
    assert.deepEqual(evidenceRule(edit, stale).failures, []);
    assert.deepEqual([evidenceRule(edit, stale).required, edit.waive], [true, undefined], 'no waiver: the edited row is the evidence');
    assert.equal(evidenceRule(edit, okTask).failures.length, 1, 'a fresh verdict fails the declared stale one');
  }
  for (const [id, state] of [['mask-type', 'first'], ['fw-order1', 'restore'], ['home', 'first']]) {
    const gate = expectedTargets(id, state);
    assert.equal(gate.kind, null);
    assert.match(gate.waive.evidence, /no visibility target/);
  }
});

test('gate: the mask\'s edit after success is not applicable (declared), not a skipped state', () => {
  for (const id of ['mask-type']) {
    const states = gateStates({ id, states: ['first', 'wrong', 'hint', 'done', 'mistake', 'hints-all'] });
    assert.ok(!states.includes('success-edit') && !states.includes('success-recheck'), id);
    assert.match(notApplicable[id]['success-edit'], /read-only/);
  }
  assert.ok(gateStates({ id: 'fw-order1', states: ['first', 'solved'] }).includes('success-edit'), 'other screens keep the edit probe');
});

test('gate (round 4 2b): state variants keep their base state\'s targets; routing\'s declared outcomes', () => {
  // The mask's chips and fit task, the binary levels: the same targets as the base state.
  // The old «вибір» reveal: «choices-done» is a reveal (spec R v3 map); «choices-solved» the success.
  assert.equal(expectedTargets('mask-type', 'choices-done').kind, 'reveal');
  assert.deepEqual(expectedTargets('mask-type', 'choices-solved'), expectedTargets('mask-type', 'solved'));
  // Routing's device tab: the router switch after a failing check; the original table: a declared target with full checks.
  assert.ok(gateStates({ id: 'rt-guided', states: ['first'] }).includes('device-tab'));
  assert.deepEqual(expectedTargets('rt-fault', 'original').targets, ['.ng-rf-original']);
  for (const [id, variant, base] of [['mask-type', 'choices-wrong', 'wrong'], ['mask-type', 'choices-hint', 'hint'],
    ['mask-type', 'fit-first', 'first'], ['binary', 'l1-step2', 'step2'], ['binary', 'l2-first', 'first']]) {
    assert.deepEqual(expectedTargets(id, variant), expectedTargets(id, base), `${id} ${variant}`);
  }
  // The offer and a partly right answer are checks: evidence required, no waiver.
  for (const state of ['choices-offer', 'choices-partial', 'fit-choices']) {
    const gate = expectedTargets('mask-type', state);
    assert.equal(gate.kind, 'verdict');
    assert.deepEqual([evidenceRule(gate, facts()).required, gate.waive], [true, undefined], state);
  }
  // A passing network check: a declared task-scope success, about the whole network.
  for (const id of ['rt-guided', 'rt-free', 'rt-mikrotik']) {
    for (const state of ['done', 'solved']) {
      const gate = expectedTargets(id, state);
      assert.equal(gate.expect, 'success', `${id} ${state}`);
      assert.match(evidenceRule(gate, okTask).waived, /whole network/);
      assert.equal(evidenceRule(gate, facts({ tones: ['no'], scopes: ['task'] })).failures.length, 1, 'a wrong verdict fails the declared success');
    }
    const edit = expectedTargets(id, 'success-edit');
    assert.deepEqual([edit.expect, edit.waive?.evidence, evidenceRule(edit, stale).required], ['stale', undefined, true], 'the edited row is the evidence (never waived)');
    assert.match(edit.waive.message, /typing never scrolls/, 'the dimmed verdict may stay off screen: typing never scrolls (repair 3)');
    assert.match(edit.waive.row, /typing never scrolls/);
  }
  // rt-hard's «done» is a reveal: not waived as a success.
  assert.equal(expectedTargets('rt-hard', 'done').kind, 'reveal');
  // The faults' cause states point at the cause question.
  for (const state of ['step2', 'wrong-cause', 'original-paths', 'solved']) assert.deepEqual(expectedTargets('rt-fault', state).evidence, ['.ng-rf-causes'], state);
  assert.equal(expectedTargets('rt-fault', 'original').kind, null);
  assert.match(expectedTargets('rt-fault', 'original').waive.evidence, /view toggle/);
  // The binary walk's finished row: a declared success, and its result is the evidence (no waiver).
  assert.deepEqual([expectedTargets('binary', 'done').expect, expectedTargets('binary', 'done').waive], ['success', undefined]);
});

test('gate: the setup decks declare their own states (round 4, spec S)', () => {
  for (const id of ['setup-router', 'setup-switch', 'setup-mikrotik']) {
    // A passing deck is about the whole deck: a declared task success, no single card.
    for (const state of ['solved', 'checkpoint']) {
      const gate = expectedTargets(id, state);
      assert.equal(gate.expect, 'success');
      assert.match(gate.waive.evidence, /whole deck/);
      assert.equal(evidenceRule(gate, okPart).failures.length, 1, `${id} ${state}: a part success is not the deck passing`);
    }
    // Hints before any check name no card; after a check they keep the flagged row.
    assert.match(expectedTargets(id, 'hints-all').waive.evidence, /before any check/);
    assert.equal(expectedTargets(id, 'hint').waive, undefined);
    // The deck is locked once it passes: the edit probe is not applicable, by design.
    const states = gateStates({ id, states: ['first', 'wrong', 'hint', 'done', 'mistake', 'hints-all', 'solved'] });
    assert.ok(!states.includes('success-edit') && !states.includes('success-recheck'), id);
    assert.match(notApplicable[id]['success-edit'], /locked/);
  }
  // Recall: each line's message and the line itself; the last one also the panel's success.
  for (const state of ['recall-wrong', 'recall-repeat', 'recall-mistake', 'recall-partial', 'recall-hint', 'recall-hints-all', 'recall-late', 'recall-edit', 'recall-recheck', 'recall-solved']) {
    const gate = expectedTargets('setup-router', state);
    assert.ok(gate.kind && gate.row && gate.evidence.length && !gate.waive, state);
  }
  assert.equal(expectedTargets('setup-switch', 'recall-solved').expect, 'success');
  // An edit after a line's check: its verdict «до змін», the edited line the evidence (no waiver).
  assert.equal(expectedTargets('setup-router', 'recall-edit').expect, 'stale');
  assert.equal(evidenceRule(expectedTargets('setup-router', 'recall-edit'), okTask).failures.length, 1, 'a fresh verdict fails the declared stale one');
  assert.equal(expectedTargets('setup-router', 'recall-done').kind, 'reveal');
  assert.equal(expectedTargets('setup-router', 'recall-skip').kind, 'empty');
  assert.equal(expectedTargets('setup-router', 'recall-first').kind, null);
});
