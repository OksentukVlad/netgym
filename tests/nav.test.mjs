import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME, currentRoute, initialNav, isHome, navReducer, sameRoute, toRoute } from '../src/app/nav.js';

const go = (nav, section, screen, params) => navReducer(nav, { type: 'go', route: { section, screen, params } });
const sections = nav => nav.stack.map(r => r.section);

test('nav: starts on the start screen', () => {
  const nav = initialNav();
  assert.deepEqual(nav.stack, [HOME]);
  assert.equal(isHome(currentRoute(nav)), true);
  assert.equal(Object.isFrozen(HOME), true);
});

test('nav: go pushes a filled-in route without changing the old state', () => {
  const start = initialNav();
  const nav = go(start, 'cisco-routing');
  assert.deepEqual(currentRoute(nav), { section: 'cisco-routing', screen: 'main', params: {} });
  assert.deepEqual(start.stack, [HOME]);
  const deeper = go(nav, 'cisco-routing', 'task', { task: 3 });
  assert.deepEqual(currentRoute(deeper), { section: 'cisco-routing', screen: 'task', params: { task: 3 } });
  assert.equal(deeper.stack.length, 3);
});

test('nav: go to the current route changes nothing', () => {
  const nav = go(initialNav(), 'ip-calculator');
  assert.equal(go(nav, 'ip-calculator'), nav);
  assert.equal(go(nav, 'ip-calculator', 'main', {}), nav);
  assert.notEqual(go(nav, 'ip-calculator', 'main', { seed: 1 }), nav);
});

test('nav: go needs a section id', () => {
  for (const section of [undefined, null, '', 3]) {
    assert.throws(() => go(initialNav(), section), TypeError);
  }
});

test('nav: back pops one route and stops at the start screen', () => {
  const nav = go(go(initialNav(), 'a'), 'b');
  const once = navReducer(nav, { type: 'back' });
  assert.deepEqual(sections(once), [null, 'a']);
  const twice = navReducer(once, { type: 'back' });
  assert.deepEqual(twice.stack, [HOME]);
  assert.equal(navReducer(twice, { type: 'back' }), twice);
});

test('nav: home returns to the start screen from any depth', () => {
  const nav = go(go(go(initialNav(), 'a'), 'b'), 'c');
  assert.deepEqual(navReducer(nav, { type: 'home' }).stack, [HOME]);
  const start = initialNav();
  assert.equal(navReducer(start, { type: 'home' }), start);
});

test('nav: restore follows the browser back and forward buttons', () => {
  const nav = go(go(initialNav(), 'a'), 'b');
  // Back to an earlier route truncates the stack to it.
  const back = navReducer(nav, { type: 'restore', route: { section: 'a', screen: 'main', params: {} } });
  assert.deepEqual(sections(back), [null, 'a']);
  // Forward to a route no longer on the stack pushes it.
  const forward = navReducer(back, { type: 'restore', route: { section: 'b', screen: 'main', params: {} } });
  assert.deepEqual(sections(forward), [null, 'a', 'b']);
  // The current route is a no-op.
  assert.equal(navReducer(forward, { type: 'restore', route: currentRoute(forward) }), forward);
  // History state is a structured clone, so routes compare by value.
  assert.deepEqual(sections(navReducer(forward, { type: 'restore', route: structuredClone(HOME) })), [null]);
});

test('nav: restore after «← Розділи» reopens the section (back button)', () => {
  // History: [home, cisco, home]; the back button restores cisco.
  const atHome = navReducer(go(initialNav(), 'cisco-routing'), { type: 'home' });
  const restored = navReducer(atHome, { type: 'restore', route: { section: 'cisco-routing', screen: 'main', params: {} } });
  assert.deepEqual(sections(restored), [null, 'cisco-routing']);
});

test('nav: restore of a missing or foreign history state goes home', () => {
  const nav = go(initialNav(), 'a');
  for (const route of [undefined, null, {}, { section: null }, { section: '' }, { section: 7 }]) {
    assert.deepEqual(navReducer(nav, { type: 'restore', route }).stack, [HOME]);
  }
});

test('nav: routes compare by section, screen and params', () => {
  assert.equal(sameRoute(toRoute({ section: 'a' }), { section: 'a', screen: 'main', params: {} }), true);
  assert.equal(sameRoute(toRoute({ section: 'a' }), toRoute({ section: 'a', screen: 'other' })), false);
  assert.equal(sameRoute(toRoute({ section: 'a', params: { n: 1 } }), toRoute({ section: 'a', params: { n: 2 } })), false);
});

test('nav: unknown actions are programming errors', () => {
  assert.throws(() => navReducer(initialNav(), { type: 'jump' }), /unknown navigation action/);
});
