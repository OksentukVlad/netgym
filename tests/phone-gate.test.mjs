// The phone gate contract (round 6, plan-mobile v2 P6, tools/shots.mjs): the
// third size, the phone essentials (first view: the task sentence, the action
// line and the next action's control; everything else reachable; diagram
// labels replaced by the open text panel and the expand button), and the
// phone's own views. Pure: the measurements themselves are tested in
// tests/r5-must-see.test.mjs (reach fixtures) and tests/phone-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  argumentsOf, essentialRecipes, essentialsOf, expectedTargets, gateStates, isPhoneSize, phoneEssentials, phoneStates, phoneStatesOf,
} from '../tools/shots.mjs';

const PHONE = { width: 390, height: 844 };
const sel = entry => (typeof entry === 'string' ? entry : entry.sel);

test('phone gate: 390 × 844 is the third default size; under 640 px is a phone', () => {
  assert.deepEqual(argumentsOf([]).sizes, [{ width: 1280, height: 800 }, { width: 1000, height: 700 }, PHONE]);
  assert.ok(isPhoneSize(PHONE) && isPhoneSize({ width: 639, height: 800 }));
  assert.ok(!isPhoneSize({ width: 640, height: 800 }) && !isPhoneSize({ width: 1000, height: 700 }) && !isPhoneSize(null));
});

test('phone gate: every essential recipe has a first view of the task, the action line and a control; the rest is reachable', () => {
  const ids = [...essentialRecipes].filter(id => !['binary'].includes(id));
  for (const id of ids) {
    const desk = essentialsOf(id, 'first');
    const phone = phoneEssentials(id, 'first');
    const view = phone.filter(e => !e.reach);
    assert.ok(view.length >= 3, `${id}: at least the task, the action line and a control in view`);
    assert.ok(view.some(e => /action-line/.test(e.sel)), `${id}: the action line in view`);
    for (const entry of desk) {
      if (/-svg\b/.test(sel(entry))) {
        assert.ok(!phone.some(e => e.sel === sel(entry)), `${id}: a diagram label is no phone essential (${sel(entry)})`);
        continue;
      }
      assert.ok(phone.some(e => e.sel === sel(entry)), `${id}: ${sel(entry)} kept (in view or reachable)`);
    }
    if (desk.some(e => /-svg\b/.test(sel(e)))) {
      assert.ok(phone.some(e => e.sel === '[data-diagram-expand]' && e.reach && e.count === 1), `${id}: the expand button, reachable`);
      assert.ok(phone.some(e => e.sel === '.ng-te-button' && e.reach && e.count === 1), `${id}: «Текстом» (with its line count), reachable`);
    }
    // Declarations carried over (a VLAN count from the task's data).
    for (const entry of phone) {
      const was = desk.find(e => sel(e) === entry.sel);
      if (was?.countAttr) assert.equal(entry.countAttr, was.countAttr, `${id}: ${entry.sel} keeps its countAttr`);
    }
  }
  // No lower font threshold, no blanket waiver: the phone list re-casts entries, it never drops a non-diagram one.
  assert.deepEqual(phoneEssentials('fw-predict', 'wrong'), null, 'later states declare none');
  const home = phoneEssentials('home', 'first');
  assert.deepEqual(home.filter(e => !e.reach).map(e => e.sel), ['.ng-home-title', '.ng-cards > li:first-child .ng-card-title']);
  assert.ok(home.some(e => e.sel === '.ng-card-title' && e.count === 8 && e.reach), 'every card reachable');
});

test('phone gate: P3 screens have «Перевірити» reachable at every size (after the inputs)', () => {
  for (const id of ['setup-router', 'setup-switch', 'setup-mikrotik', 'vl-ports']) {
    const check = essentialsOf(id, 'first').find(e => sel(e).endsWith('.ng-help-check'));
    assert.equal(check?.reach, true, id);
  }
  for (const id of ['rt-guided', 'rt-fault', 'vl-route', 'vl-fault']) {
    const check = essentialsOf(id, 'first').find(e => sel(e).endsWith('.ng-help-check'));
    if (check) assert.notEqual(check.reach, true, `${id}: unchanged (in the first view)`);
  }
});

test('phone gate: the phone views (the sheet, the full-screen diagram, the keyboard) at phone sizes only', () => {
  assert.deepEqual(phoneStates, ['sheet-open', 'diagram-full', 'keyboard']);
  const states = id => gateStates({ id, states: ['first'] }, PHONE);
  assert.deepEqual(phoneStatesOf({ id: 'rt-guided' }), ['sheet-open', 'diagram-full', 'keyboard']);
  assert.deepEqual(phoneStatesOf({ id: 'setup-router' }), ['sheet-open']);
  assert.deepEqual(phoneStatesOf({ id: 'calc' }), ['sheet-open', 'keyboard']);
  assert.deepEqual(phoneStatesOf({ id: 'home' }), []);
  assert.ok(phoneStates.every(s => states('rt-guided').includes(s)));
  assert.ok(!gateStates({ id: 'rt-guided', states: ['first'] }, { width: 1000, height: 700 }).some(s => phoneStates.includes(s)), 'none at a desktop size');
  assert.ok(!gateStates({ id: 'rt-guided', states: ['first'] }).some(s => phoneStates.includes(s)), 'none without a size');
  for (const state of phoneStates) {
    const t = expectedTargets('rt-guided', state);
    assert.equal(t.kind, null, `${state}: a view, not a check`);
    assert.ok(t.waive?.evidence && t.waive?.message, `${state}: its exemptions declared with reasons`);
  }
});
