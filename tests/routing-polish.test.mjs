// Polish after Vlad's step 6 test (spec-polish v1, its v2 must-fixes
// override): live conversion between syntaxes (one resolver, canonical
// drafts, distance, the note, cleanup, isolation, provenance for the leak
// gate) and the success lap (plans from evidence only, timing, endings, the
// end state, playback, the strip, the announcement and the leak gate).
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { presentCheck } from './helpers/routing.mjs';
import { topology } from '../src/sections/routing/logic/topology.js';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { diagramGeometry, NETGYM_DIAGRAM_FONT } from '../src/ui/topology/geometry.js';
import { planPath, solvedMarks, STEP_MS } from '../src/sections/routing/screens/pathPlan.js';
import { HOLD_MS, LAP_MS, lapAnnouncement, lapEnding, lapFrame, lapOf, lapPlayer, lapSchedule, PAUSE_MS, strokeKey, wholeLeg, WITH_ENDING_MS } from '../src/sections/routing/screens/lapPlan.js';
import { checkViewReducer, initialCheckView, shownOf } from '../src/sections/routing/screens/checkView.js';
import { initialInstance, instanceReducer, RESERVED_DRAFT_KEYS } from '../src/ui/exercise-state.js';
import { readdirSync, readFileSync } from 'node:fs';
import { networkUi, ui } from '../src/sections/routing/uk.js';
import { createLeakSweep, leaks, normalise } from './helpers/routing-leaks.mjs';

import * as p from '../.test-bundles/harness/polish.mjs';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';

const inspectLeaks = createLeakSweep();

// ── Live conversion between syntaxes ────────────────────────

function probe(store, record, syntax, mode = 'guided', variantId) {
  let api;
  store.render(p.RoutingProbe, { record, syntax, mode, variantId, expose: a => { api = a; } });
  return api;
}
/** Type `values` field by field into the row `pick(answers)` picks, as a student would. */
function type(store, record, syntax, pick, values, mode = 'guided', variantId) {
  for (const [name, value] of Object.entries(values)) {
    const api = probe(store, record, syntax, mode, variantId);
    api.answers.edit(pick(api.answers), name, value);
  }
  return probe(store, record, syntax, mode, variantId);
}
const slot = (router, index) => a => a.slotItem(router, index);
const view = (store, record, syntax, pick, mode = 'guided', variantId) => {
  const api = probe(store, record, syntax, mode, variantId);
  const item = pick(api.answers);
  return { api, item, values: api.answers.valuesOf(item), source: api.answers.effective(item).source, note: api.answers.noteOf(item) };
};
/** True when an instance's drafts hold anything (raw text, a canonical draft or a revision) under `key`. */
const hasDraft = (drafts, key) => JSON.stringify(drafts ?? {}).includes(`"${key}":`);

test('conversion: an unchecked MikroTik draft shows converted in Cisco, mistakes kept; a Cisco draft shows in MikroTik; nothing is checked', () => {
  const [task1] = tasks;
  const store = p.testStore();
  let api = type(store, task1, 'routeros', slot('R1', 0), { dst: '192.0.2.5/24', gw: '198.51.100.7' });
  const key = api.ex.key, before = store.state.instances[key];
  const cisco = view(store, task1, 'cisco', slot('R1', 0));
  assert.deepEqual(cisco.values, { net: '192.0.2.5', mask: '255.255.255.0', gw: '198.51.100.7', dist: '' }, 'host bits stay as typed: parsing doesn’t correct or grade');
  assert.deepEqual([cisco.source, cisco.note], ['canonical', null]);
  assert.equal(cisco.api.answers.resultOf('R1', 0), null, 'no verdict: nothing was checked');
  assert.equal(store.state.instances[key], before, 'showing the conversion changes nothing');
  assert.deepEqual([before.presses, before.session.attempts, before.answer, before.parts, before.session.earned.solved], [0, 0, null, {}, false]);
  // The MikroTik row shows its own text, as typed.
  assert.deepEqual(view(store, task1, 'routeros', slot('R1', 0)).values, { dst: '192.0.2.5/24', gw: '198.51.100.7' });
  // And back: a Cisco draft on R2's row, shown in MikroTik.
  api = type(store, task1, 'cisco', slot('R2', 0), { net: '203.0.113.0', mask: '255.255.255.128', gw: '198.51.100.9' });
  const routeros = view(store, task1, 'routeros', slot('R2', 0));
  assert.deepEqual([routeros.values, routeros.source], [{ dst: '203.0.113.0/25', gw: '198.51.100.9', dist: '' }, 'canonical']);
  // What the row shows is what a row check grades and a network check sends (one resolver).
  assert.deepEqual(routeros.api.answers.currentAnswer().R2, [{ dst: '203.0.113.0', prefix: 25, via: '198.51.100.9', distance: 1, id: 'R2.row1' }]);
});

test('conversion: Cisco edits after a switch win over the older MikroTik text; unfinished Cisco text stays, with a note in MikroTik', () => {
  const [task1] = tasks;
  const store = p.testStore();
  type(store, task1, 'routeros', slot('R1', 0), { dst: '192.0.2.0/24', gw: '198.51.100.7' });
  // Cisco starts from the converted text; one field edited.
  let api = type(store, task1, 'cisco', slot('R1', 0), { gw: '198.51.100.9' });
  const key = api.ex.key;
  let routeros = view(store, task1, 'routeros', slot('R1', 0));
  assert.deepEqual([routeros.values, routeros.source, routeros.note], [{ dst: '192.0.2.0/24', gw: '198.51.100.9', dist: '' }, 'canonical', null], 'the newer Cisco edit wins');
  assert.equal(store.state.instances[key].drafts.guided.routeros['R1.row1'].gw, '198.51.100.7', 'the older MikroTik text is kept, not shown');
  // Cisco half-typed: it stays in Cisco; MikroTik keeps the last route that parsed, with the note.
  api = type(store, task1, 'cisco', slot('R1', 0), { mask: '255.255' });
  const cisco = view(store, task1, 'cisco', slot('R1', 0));
  assert.deepEqual([cisco.values, cisco.source, cisco.note], [{ net: '192.0.2.0', mask: '255.255', gw: '198.51.100.9', dist: '' }, 'raw', null]);
  routeros = view(store, task1, 'routeros', slot('R1', 0));
  assert.deepEqual([routeros.values.gw, routeros.source, routeros.note], ['198.51.100.9', 'canonical', 'Cisco']);
  const html = normalise(store.render(p.RoutingRows, { record: task1, syntax: 'routeros', router: 'R1' }));
  assert.ok(html.includes('У Cisco цей маршрут не дописано або в ньому помилка: доповни чи виправ його там — або введи тут.'), html);
  assert.ok(!normalise(store.render(p.RoutingRows, { record: task1, syntax: 'cisco', router: 'R1' })).includes('не дописано'));
});

test('conversion: half-typed text stays in its own syntax with the note in the other, until a newer edit parses', () => {
  const [task1] = tasks;
  const store = p.testStore();
  type(store, task1, 'routeros', slot('R1', 0), { dst: '192.0.2' });
  let cisco = view(store, task1, 'cisco', slot('R1', 0));
  assert.deepEqual([cisco.values, cisco.source, cisco.note], [{}, 'empty', 'MikroTik']);
  const html = store.render(p.RoutingRows, { record: task1, syntax: 'cisco', router: 'R1' });
  assert.ok(normalise(html).includes(ui.shared.convertNote('MikroTik')));
  // The note is heard on focus: each of the row's fields is described by it.
  assert.ok(html.includes(`<p id="rt-R1-0-note" class="ng-rt-note ng-rt-convert-note">`));
  assert.equal((html.match(/<input[^>]*aria-describedby="rt-R1-0-note"/g) ?? []).length, 3, 'net, mask, gw');
  assert.ok(!store.render(p.RoutingRows, { record: task1, syntax: 'routeros', router: 'R1' }).includes('aria-describedby'), 'no note, nothing to describe');
  let routeros = view(store, task1, 'routeros', slot('R1', 0));
  assert.deepEqual([routeros.values, routeros.note], [{ dst: '192.0.2' }, null]);
  // A complete route typed in Cisco is newer: the note goes, and MikroTik shows it converted.
  type(store, task1, 'cisco', slot('R1', 0), { net: '192.0.2.0', mask: '255.255.255.0', gw: '198.51.100.7' });
  cisco = view(store, task1, 'cisco', slot('R1', 0));
  routeros = view(store, task1, 'routeros', slot('R1', 0));
  assert.deepEqual([cisco.note, routeros.note, routeros.source, routeros.values], [null, null, 'canonical', { dst: '192.0.2.0/24', gw: '198.51.100.7', dist: '' }]);
  // Free mode works the same per route id; an empty «+ Маршрут» row has nothing to convert.
  const free = p.testStore();
  probe(free, task1, 'cisco', 'free').answers.addRoute('R1');
  probe(free, task1, 'cisco', 'free').answers.addRoute('R1');
  const first = a => a.freeItems('R1')[0], second = a => a.freeItems('R1')[1];
  type(free, task1, 'routeros', first, { dst: '203.0.113.0/24', gw: '198.51.100.7' }, 'free');
  type(free, task1, 'routeros', second, { gw: '198.51.100' }, 'free');
  assert.deepEqual(view(free, task1, 'cisco', first, 'free').values, { net: '203.0.113.0', mask: '255.255.255.0', gw: '198.51.100.7', dist: '' });
  assert.deepEqual([view(free, task1, 'cisco', second, 'free').values, view(free, task1, 'cisco', second, 'free').note], [{}, 'MikroTik']);
  const freeHtml = free.render(p.RoutingRows, { record: task1, syntax: 'cisco', mode: 'free', router: 'R1' });
  assert.equal((freeHtml.match(/<input[^>]*aria-describedby="rt-R1-f2-note"/g) ?? []).length, 3, 'a free row’s note describes its fields too');
  assert.ok(freeHtml.includes('<p id="rt-R1-f2-note"'));
  // Guided mode keeps its own drafts: free text never shows there.
  assert.equal(view(free, task1, 'cisco', slot('R1', 0)).source, 'empty');
});

test('conversion: distance round trips (blank and 1 → blank; 5, 10, 254 as numbers); 0 and 255 don’t convert; no backup value is invented', () => {
  const task15 = tasks[14];
  for (const [from, to] of [['cisco', 'routeros'], ['routeros', 'cisco']]) {
    for (const [index, typed, expected] of [[0, '', ''], [0, '1', ''], [0, '5', '5'], [1, '', ''], [1, '10', '10'], [1, '254', '254']]) {
      const store = p.testStore();
      const fields = from === 'cisco' ? { net: '0.0.0.0', mask: '0.0.0.0', gw: '198.51.100.1', dist: typed } : { dst: '0.0.0.0/0', gw: '198.51.100.1', dist: typed };
      type(store, task15, from, slot('R1', index), fields);
      const there = view(store, task15, to, slot('R1', index));
      assert.equal(there.values.dist, expected, `${from}→${to} row ${index}: «${typed}»`);
      // And back: the other syntax's converted text, edited nowhere, round-trips to the same route.
      assert.deepEqual(syntaxes[to].toRoute(there.values), syntaxes[from].toRoute(fields));
    }
    for (const bad of ['0', '255']) {
      const store = p.testStore();
      const fields = from === 'cisco' ? { net: '0.0.0.0', mask: '0.0.0.0', gw: '198.51.100.2', dist: bad } : { dst: '0.0.0.0/0', gw: '198.51.100.2', dist: bad };
      type(store, task15, from, slot('R1', 1), fields);
      // The other syntax keeps the row's last parseable edit (typed before the distance, so blank), and the note.
      const there = view(store, task15, to, slot('R1', 1));
      assert.deepEqual([there.source, there.values.dist, there.note], ['canonical', '', syntaxes[from].label], `${from} distance ${bad} doesn’t convert`);
      assert.equal(view(store, task15, from, slot('R1', 1)).values.dist, bad, 'it stays as typed');
      // Typed in one go (a paste), nothing parsed yet: nothing converts at all.
      const pasted = p.testStore();
      const api = probe(pasted, task15, from);
      api.ex.act({ type: 'draft', mode: 'guided', syntax: from, routeId: 'R1.row2', value: fields });
      assert.deepEqual([view(pasted, task15, to, slot('R1', 1)).source, view(pasted, task15, to, slot('R1', 1)).note], ['empty', syntaxes[from].label]);
    }
  }
});

test('conversion: the one resolver drives the O1 verdict rule; viewing never moves attempts, verdicts, earned or the reveal', () => {
  const task4 = tasks[3];
  const reference = routing.solution(routing.create(task4)).R2[0];
  const store = p.testStore();
  type(store, task4, 'cisco', slot('R2', 0), syntaxes.cisco.fromRoute(reference));
  let api = probe(store, task4, 'cisco');
  assert.equal(api.answers.check('R2', 0).ok, true);
  const key = api.ex.key, checked = store.state.instances[key];
  assert.equal(view(store, task4, 'routeros', slot('R2', 0)).api.answers.resultOf('R2', 0).ok, true, 'the same route in MikroTik keeps its ✓');
  assert.equal(store.state.instances[key], checked);
  // A MikroTik draft that parses to another route: Cisco shows it converted, and no verdict (O1 on the effective route).
  const id = checked.parts['R2.row1'].routeId;
  const act = action => store.dispatch({ type: 'instance', key, action });
  act({ type: 'draft', mode: 'guided', syntax: 'routeros', routeId: id, value: { dst: `${reference.dst}/${reference.prefix}`, gw: '10.0.0.6' }, canonical: { dst: reference.dst, prefix: reference.prefix, via: '10.0.0.6', distance: 1 } });
  for (const syntax of ['cisco', 'routeros']) {
    const shown = view(store, task4, syntax, slot('R2', 0));
    assert.equal(shown.values.gw, '10.0.0.6');
    assert.equal(shown.api.answers.resultOf('R2', 0), null, `${syntax}: another route, no verdict`);
  }
  // An equivalent round trip (the checked route, spelt in MikroTik): the verdict holds again.
  act({ type: 'draft', mode: 'guided', syntax: 'routeros', routeId: id, value: { dst: `${reference.dst}/${reference.prefix}`, gw: reference.via, dist: '1' }, canonical: { dst: reference.dst, prefix: reference.prefix, via: reference.via, distance: 1 } });
  assert.equal(view(store, task4, 'cisco', slot('R2', 0)).api.answers.resultOf('R2', 0).ok, true);
  // An invalid edit: the note, no verdict where the text is.
  act({ type: 'draft', mode: 'guided', syntax: 'routeros', routeId: id, value: { dst: '192.168', gw: reference.via } });
  assert.equal(view(store, task4, 'cisco', slot('R2', 0)).note, 'MikroTik');
  assert.equal(view(store, task4, 'routeros', slot('R2', 0)).api.answers.resultOf('R2', 0), null);
  const now = store.state.instances[key];
  assert.deepEqual([now.presses, now.session, now.parts, now.answer, now.result], [checked.presses, checked.session, checked.parts, checked.answer, checked.result], 'drafts only');
  // After an earned pass: a converted draft doesn't touch the session, the result or the score.
  const task1 = tasks[0], solved = p.testStore();
  const answer = routing.solution(routing.create(task1));
  for (const r of ['R1', 'R2']) type(solved, task1, 'cisco', slot(r, 0), syntaxes.cisco.fromRoute(answer[r][0]));
  assert.equal(probe(solved, task1, 'cisco').answers.checkNetwork().result.ok, true);
  const earned = solved.state.instances[probe(solved, task1, 'cisco').ex.key];
  type(solved, task1, 'routeros', slot('R1', 0), { gw: '198.51.100.7' });
  const later = solved.state.instances[probe(solved, task1, 'cisco').ex.key];
  assert.deepEqual([later.session, later.presses, later.result, later.answer], [earned.session, earned.presses, earned.result, earned.answer]);
  assert.equal(view(solved, task1, 'cisco', slot('R1', 0)).values.gw, '198.51.100.7');
});

test('conversion cleanup: slot→id and network checks consume raw, canonical and revisions together; free→guided updates; clearing; deletion; reset', () => {
  const [task1] = tasks, task4 = tasks[3];
  // Slot → id by a row check: every syntax's text for the slot goes with it.
  let store = p.testStore();
  type(store, task1, 'routeros', slot('R1', 0), { dst: '192.0.2.0/24', gw: '10.0.0.2' });
  type(store, task1, 'cisco', slot('R1', 0), { mask: '255.255' });
  let api = view(store, task1, 'routeros', slot('R1', 0)).api;
  assert.deepEqual(api.answers.valuesOf('R1', 0), { dst: '192.0.2.0/24', gw: '10.0.0.2' });
  api.answers.check('R1', 0);
  let instance = store.state.instances[api.ex.key];
  const id = instance.parts['R1.row1'].routeId;
  assert.ok(id && !hasDraft(instance.drafts, 'R1.row1') && !hasDraft(instance.drafts, id), JSON.stringify(instance.drafts));
  assert.deepEqual([view(store, task1, 'cisco', slot('R1', 0)).source, view(store, task1, 'cisco', slot('R1', 0)).note], ['route', null]);
  // Slot → id by a network check: the canonical draft becomes the route, and nothing stale stays under the slot.
  store = p.testStore();
  type(store, task1, 'routeros', slot('R1', 0), { dst: '192.0.2.0/24', gw: '10.0.0.2' });
  api = probe(store, task1, 'cisco');
  api.answers.checkNetwork();
  instance = store.state.instances[api.ex.key];
  assert.deepEqual(instance.answer.R1.map(r => [r.dst, r.prefix, r.via, r.slot]), [['192.0.2.0', 24, '10.0.0.2', 'R1.row1']]);
  assert.ok(!hasDraft(instance.drafts, 'R1.row1') && !hasDraft(instance.drafts, instance.answer.R1[0].id), JSON.stringify(instance.drafts));
  // Free → guided: a route network-checked in free mode replaces an older guided draft of it.
  store = p.testStore();
  const reference = routing.solution(routing.create(task4)).R2[0];
  type(store, task4, 'cisco', slot('R2', 0), syntaxes.cisco.fromRoute(reference));
  probe(store, task4, 'cisco').answers.check('R2', 0);
  type(store, task4, 'routeros', slot('R2', 0), { gw: '198.51.100.9' });
  type(store, task4, 'cisco', a => a.freeItems('R2')[0], { gw: '10.0.0.6' }, 'free');
  assert.notEqual(probe(store, task4, 'cisco', 'free').answers.checkNetwork().result.code, 'form-errors');
  for (const syntax of ['cisco', 'routeros']) {
    const shown = view(store, task4, syntax, slot('R2', 0));
    assert.deepEqual([shown.source, shown.values.gw], ['route', '10.0.0.6'], `${syntax}: the newer free-mode route, not the older guided draft`);
  }
  // A free route that lands in an empty guided row takes that row's old text with it.
  store = p.testStore();
  type(store, task4, 'routeros', slot('R1', 0), { dst: '192.168.2' });
  probe(store, task4, 'cisco', 'free').answers.addRoute('R1');
  type(store, task4, 'cisco', a => a.freeItems('R1')[0], syntaxes.cisco.fromRoute(routing.solution(routing.create(task4)).R1[0]), 'free');
  probe(store, task4, 'cisco', 'free').answers.checkNetwork();
  assert.ok(!hasDraft(store.state.instances[probe(store, task4, 'cisco').ex.key].drafts, 'R1.row1'));
  assert.deepEqual([view(store, task4, 'routeros', slot('R1', 0)).source, view(store, task4, 'cisco', slot('R1', 0)).note], ['route', null]);
  // Clearing a row is a change too: the other syntax shows it empty, without a note.
  store = p.testStore();
  type(store, task1, 'routeros', slot('R1', 0), { dst: '192.0.2.0/24', gw: '10.0.0.2' });
  type(store, task1, 'routeros', slot('R1', 0), { dst: '', gw: '' });
  const cleared = view(store, task1, 'cisco', slot('R1', 0));
  assert.deepEqual([cleared.values, cleared.source, cleared.note], [{}, 'canonical', null]);
  // Deletion drops the route's raw text, canonical draft and revisions in every mode and syntax.
  store = p.testStore();
  probe(store, task1, 'cisco', 'free').answers.addRoute('R1');
  type(store, task1, 'routeros', a => a.freeItems('R1')[0], { dst: '192.0.2.0/24', gw: '10.0.0.2' }, 'free');
  type(store, task1, 'cisco', a => a.freeItems('R1')[0], { mask: '255' }, 'free');
  api = probe(store, task1, 'cisco', 'free');
  const freeId = api.answers.freeItems('R1')[0].key;
  assert.ok(hasDraft(store.state.instances[api.ex.key].drafts, freeId));
  api.answers.removeRoute(api.answers.freeItems('R1')[0]);
  instance = store.state.instances[api.ex.key];
  assert.ok(!hasDraft(instance.drafts, freeId), JSON.stringify(instance.drafts));
  // «↺» keeps drafts, so it keeps all three together; a reset drops them together.
  let s = instanceReducer(initialInstance(), { type: 'draft', mode: 'guided', syntax: 'cisco', routeId: 'R1.row1', value: { net: '192.0.2.0' } });
  s = instanceReducer(s, { type: 'draft', mode: 'guided', syntax: 'routeros', routeId: 'R1.row1', value: { dst: '192.0.2.0/24', gw: '198.51.100.1' }, canonical: { dst: '192.0.2.0', prefix: 24, via: '198.51.100.1', distance: 1 } });
  assert.deepEqual(s.drafts.guided.revs, { cisco: { 'R1.row1': 1 }, routeros: { 'R1.row1': 2 } });
  assert.deepEqual(s.drafts.guided.canonical, { 'R1.row1': { route: { dst: '192.0.2.0', prefix: 24, via: '198.51.100.1', distance: 1 }, rev: 2 } });
  assert.deepEqual(instanceReducer(s, { type: 'clear-results' }).drafts, s.drafts);
  assert.deepEqual(instanceReducer(s, { type: 'reset' }), initialInstance());
});

test('conversion: drafts are isolated per task and variant', () => {
  const task3 = tasks[2], task2 = tasks[1];
  const store = p.testStore();
  type(store, task3, 'routeros', slot('R2', 0), { dst: '192.0.2.0/24', gw: '198.51.100.7' }, 'guided', 'explicit-routes');
  assert.equal(view(store, task3, 'cisco', slot('R2', 0), 'guided', 'explicit-routes').source, 'canonical');
  assert.deepEqual(view(store, task3, 'cisco', slot('R2', 0), 'guided', 'defaults').values, {}, 'the other variant of the task');
  assert.equal(view(store, task3, 'routeros', slot('R2', 0), 'guided', 'defaults').note, null);
  assert.deepEqual(view(store, task2, 'cisco', slot(Object.keys(routing.scaffold(routing.create(task2), 'cisco'))[0], 0)).values, {}, 'another task');
});

test('draft schema: `canonical` and `revs` beside the syntax ids are never read as syntaxes; nothing but dropRouteDrafts walks the tree; deletion takes exactly one row', () => {
  // The names can't collide: syntax ids and modes aren't reserved; route ids and slots have a dot.
  for (const id of [...syntaxList.map(x => x.id), 'guided', 'free']) assert.ok(!RESERVED_DRAFT_KEYS.includes(id), id);
  const keys = tasks.flatMap(record => record.variants.flatMap(v => Object.entries(v.scaffold).flatMap(([router, rows]) => rows.map((_, i) => `${router}.row${i + 1}`))));
  assert.ok(keys.length && keys.every(k => k.includes('.')), 'slots have a dot');
  // No source file iterates a drafts object's keys, except the one schema-blind walk.
  const files = dir => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(`${dir}${e.name}/`) : /\.jsx?$/.test(e.name) ? [`${dir}${e.name}`] : []));
  const walks = files('../src/').flatMap(file => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    return [...source.matchAll(/Object\.(?:keys|values|entries)\([^)]*drafts[^)]*\)|for\s*\([^)]*\bin\s+[^)]*drafts/gi)].map(m => `${file}: ${m[0]}`);
  });
  assert.deepEqual(walks, ['../src/ui/exercise-state.js: Object.entries(drafts)'], 'only dropRouteDrafts walks the tree');
  // A full tree: deleting a route takes its raw text in both modes and syntaxes, its canonical draft and revisions, and nothing else.
  let s = initialInstance();
  const put = (mode, syntax, key, value, canonical) => { s = instanceReducer(s, { type: 'draft', mode, syntax, routeId: key, value, ...(canonical !== undefined ? { canonical } : {}) }); };
  const route = { dst: '192.0.2.0', prefix: 24, via: '198.51.100.1', distance: 1 };
  for (const mode of ['guided', 'free']) for (const key of ['R1.f1', 'R1.f2']) {
    put(mode, 'cisco', key, { net: '192.0.2.0', gw: 'R1.f1' });
    put(mode, 'routeros', key, { dst: '192.0.2.0/24', gw: '198.51.100.1' }, route);
  }
  s = instanceReducer(s, { type: 'draft', syntax: 'cisco', part: 'R1.f1', value: { net: '1' } });
  const keep = structuredClone(s.drafts);
  s = instanceReducer(s, { type: 'route-deleted', routeId: 'R1.f1' });
  const expected = structuredClone(keep);
  for (const mode of ['guided', 'free']) {
    for (const syntax of ['cisco', 'routeros']) { delete expected[mode][syntax]['R1.f1']; delete expected[mode].revs[syntax]['R1.f1']; }
    delete expected[mode].canonical['R1.f1'];
  }
  delete expected.cisco['R1.f1'];
  assert.deepEqual(s.drafts, expected, 'a value that looks like an id (gw: "R1.f1") is text, and stays');
});

test('conversion leak gate: converted text is the student’s own (kind 3), for routes that differ from the reference, in every row and both directions', t => {
  let rows = 0, teeth = 0, cases = 0;
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const scaffold = routing.scaffold(task, 'cisco');
    for (const [from, to] of [['cisco', 'routeros'], ['routeros', 'cisco']]) {
      for (const [router, list] of Object.entries(scaffold)) list.forEach((row, index) => {
        // Student routes from the documentation ranges, and a near miss with host bits.
        for (const student of [{ dst: '192.0.2.0', prefix: 24, via: '198.51.100.7', distance: row.needDist ? 7 : 1 }, { dst: '203.0.113.9', prefix: 24, via: '198.51.100.7', distance: 1 }]) {
          rows++;
          const store = p.testStore();
          const fields = from === 'cisco'
            ? { net: student.dst, mask: syntaxes.cisco.fromRoute(student, true).mask, gw: student.via, ...(row.needDist ? { dist: String(student.distance) } : {}) }
            : { dst: `${student.dst}/${student.prefix}`, gw: student.via, ...(row.needDist ? { dist: String(student.distance) } : {}) };
          type(store, record, from, slot(router, index), fields, 'guided', variant.id);
          const shown = view(store, record, to, slot(router, index), 'guided', variant.id);
          assert.deepEqual(shown.values, syntaxes[to].fromRoute(student, row.needDist), `${variant.code} ${router}#${index + 1} ${from}→${to}`);
          const html = store.render(p.RoutingRows, { record, variantId: variant.id, syntax: to, router });
          const values = [...html.matchAll(/value="([^"]*)"/g)].map(m => m[1]).filter(Boolean).join(' ');
          assert.ok(values.includes(student.via), 'the converted text is in the fields');
          assert.deepEqual(inspectLeaks(task, `${normalise(html)} ${values}`, 'text'), [], `${variant.code} ${router}#${index + 1} ${from}→${to}`);
          for (const attr of [...html.matchAll(/(?:placeholder|title|aria-label)="([^"]*)"/g)].map(m => m[1])) assert.deepEqual(inspectLeaks(task, attr, 'placeholder'), []);
          const instance = store.state.instances[shown.api.ex.key];
          assert.deepEqual([instance.presses, instance.session.attempts, instance.session.revealed, instance.answer], [0, 0, false, null]);
        }
      });
      // The gate has teeth: the reference itself, typed and converted, would fail it.
      const router = Object.keys(scaffold).find(r => scaffold[r].length && task.variant.referenceRoutes[r]?.length);
      const reference = task.variant.referenceRoutes[router][0];
      const store = p.testStore();
      type(store, record, from, slot(router, 0), syntaxes[from].fromRoute(reference, scaffold[router][0].needDist), 'guided', variant.id);
      const html = store.render(p.RoutingRows, { record, variantId: variant.id, syntax: to, router });
      const values = [...html.matchAll(/value="([^"]*)"/g)].map(m => m[1]).join(' ');
      cases++;
      if (inspectLeaks(task, `${normalise(html)} ${values}`, 'text').length) teeth++;
    }
  }
  assert.ok(rows > 400, `${rows} rows`);
  assert.equal(teeth, cases, `the reference is caught in ${teeth} of ${cases} cases`);
  t.diagnostic(JSON.stringify({ convertedRows: rows, referenceCaught: `${teeth} of ${cases}` }));
});

// ── The success lap ─────────────────────────────────────────

const geometryOf = (task, syntax = 'cisco') => { const topo = topology(task.network, syntax); return diagramGeometry(topo, topo, undefined, NETGYM_DIAGRAM_FONT); };
function passing(n, variantId, syntax = 'cisco') {
  const task = routing.create(tasks[n - 1], variantId ? { variantId } : {});
  const result = routing.check(task, routing.solution(task));
  const presented = presentCheck(task, result, syntax);
  const geo = geometryOf(task, syntax);
  const lap = lapOf(geo, task.network, syntax, presented, task.record);
  return { task, result, presented, geo, lap, schedule: lap && lapSchedule(lap) };
}
function* everyPass() {
  for (const record of tasks) for (const variant of record.variants) for (const syntax of syntaxList) {
    yield { code: variant.code, syntax: syntax.id, ...passing(tasks.indexOf(record) + 1, variant.id, syntax.id) };
  }
}
const allMoves = probes => probes.flatMap(q => [...q.request, ...q.reply]);
/** The segment a LAN/server box or cloud of the diagram stands for. */
function boxSegment(geo, net, syntax, id) {
  const e = geo.endpoints.find(x => `box:${x.key}` === id);
  return net.devices.find(d => d.id === e?.router)?.interfaces.find(f => f.labels?.[syntax] === e.ep.name)?.segmentId ?? null;
}
const shareSegment = (net, a, b) => net.devices.find(d => d.id === a)?.interfaces.some(f => net.devices.find(d => d.id === b)?.interfaces.some(g => g.segmentId === f.segmentId));

test('lap plans: built from the evidence only — each move one of the trace’s own hops along a real link; transit probes and outage scenarios are left out; no hop numbers', () => {
  let probes = 0, moves = 0;
  for (const { code, syntax, task, result, presented, geo, lap } of everyPass()) {
    const net = task.network;
    const ends = id => task.record.probes.find(q => q.id === id);
    const hostOrInternet = ref => net.endpoints.some(e => e.id === ref && ['host', 'internet'].includes(e.kind));
    const outage = id => (task.record.scenarios.find(s => s.id === id)?.downLinks ?? []).length > 0;
    const expected = presented.lines.filter(l => l.kind === 'probe' && !outage(l.scenarioId) && hostOrInternet(ends(l.probe.id).from) && hostOrInternet(ends(l.probe.id).to)).map(l => l.id);
    assert.deepEqual(lap.probes.map(q => q.id), expected, `${code} ${syntax}`);
    for (const q of lap.probes) {
      probes++;
      const evidence = result.evidence.probes.find(e => `${e.scenarioId ?? ''}/${e.id}` === q.id);
      for (const [legName, moveList] of [['request', q.request], ['reply', q.reply]]) {
        const leg = evidence[legName], hops = leg.hops.map(x => x.deviceId);
        moveList.forEach((m, i) => {
          moves++;
          assert.ok(!('badge' in m) && !('n' in m), 'no hop numbers in the lap');
          assert.equal(m.leg, legName);
          if (i > 0) assert.equal(m.from, moveList[i - 1].to, 'one chain');
          const fromBox = m.from.startsWith('box:'), toBox = m.to.startsWith('box:');
          if (!fromBox && !toBox) {
            const at = hops.findIndex((d, k) => d === m.from && hops[k + 1] === m.to);
            assert.ok(at >= 0, `${code} ${q.id} ${legName}: ${m.from} → ${m.to} is a hop of the trace`);
            assert.ok(shareSegment(net, m.from, m.to), `${m.from} and ${m.to} share a link`);
          } else if (fromBox) {
            assert.equal(i, 0, 'a box only starts a leg');
            assert.equal(m.to, hops[0]);
            const source = net.endpoints.find(e => e.id === (legName === 'request' ? ends(evidence.id).from : ends(evidence.id).to));
            assert.equal(boxSegment(geo, net, syntax, m.from), source.segmentId, 'the source host’s own LAN');
          } else {
            assert.equal(i, moveList.length - 1, 'a box only ends a leg');
            assert.equal(m.from, hops.at(-1));
            const egress = presented.lines.find(l => l.id === q.id).trace[legName].hops.at(-1).segmentId;
            assert.equal(boxSegment(geo, net, syntax, m.to), egress, 'the last hop’s egress LAN');
          }
        });
      }
    }
  }
  assert.ok(probes > 150 && moves > 1000, `${probes} probes, ${moves} moves`);
  const t16 = passing(16).lap;
  assert.equal(t16.probes.length, 6, 'task 16: three LAN pings and three internet pings; the eight transit pings aren’t animated');
  assert.ok(t16.probes.every(q => !q.id.includes('transit')));
});

test('lap evidence: a probe whose trace misses a hop, or starts or ends in the wrong place, isn’t animated; no edge is drawn across the gap', () => {
  const t16 = passing(16), all16 = t16.lap.probes.map(q => q.id);
  // Astra's case: R-AGG1 cut from LAN1 → LAN2's request, as drawn.
  const cut = structuredClone(t16.presented);
  cut.lines.find(l => l.id === 'normal/lan-1-2').trace.request.hops.splice(1, 1);
  const lap = lapOf(t16.geo, t16.task.network, 'cisco', cut, t16.task.record);
  assert.deepEqual(lap.probes.map(q => q.id), all16.filter(id => id !== 'normal/lan-1-2'));
  assert.ok(!allMoves(lap.probes).some(m => [m.from, m.to].sort().join() === 'R-ACC1,R-ACC2'), 'no synthetic R-ACC1 → R-ACC2');
  // The same hop cut from the raw evidence (presentCheck then names consistent next hops; the link still isn't there).
  const result = structuredClone(t16.result);
  result.evidence.probes.find(e => e.id === 'lan-1-2').request.hops.splice(1, 1);
  assert.ok(!lapOf(t16.geo, t16.task.network, 'cisco', presentCheck(t16.task, result, 'cisco'), t16.task.record).probes.some(q => q.id === 'normal/lan-1-2'));
  // A reply cut short, an internet ping without its provider, a request starting past its first router, an unknown device.
  for (const [id, mutate] of [
    ['normal/lan-2-3', trace => trace.reply.hops.splice(2, 1)],
    ['normal/internet-1', trace => trace.request.hops.pop()],
    ['normal/internet-3', trace => trace.request.hops.shift()],
    ['normal/lan-1-3', trace => { trace.request.hops[1].deviceId = 'R-NOWHERE'; }],
  ]) {
    const presented = structuredClone(t16.presented);
    mutate(presented.lines.find(l => l.id === id).trace);
    const mutated = lapOf(t16.geo, t16.task.network, 'cisco', presented, t16.task.record);
    assert.deepEqual(mutated.probes.map(q => q.id), all16.filter(x => x !== id), id);
  }
  // Every leg of every passing check's probes and demonstrations is whole as the engine gives it.
  for (const { task, presented } of everyPass()) {
    for (const line of presented.lines.filter(l => l.kind === 'probe')) {
      const ends = task.record.probes.find(q => q.id === line.probe.id);
      assert.ok(wholeLeg(task.network, line.trace.request, ends.from, ends.to) && wholeLeg(task.network, line.trace.reply, ends.to, ends.from), line.id);
    }
    for (const demo of presented.demonstrations) {
      const ends = task.record.demonstrations.find(d => d.id === demo.id);
      assert.ok(wholeLeg(task.network, demo.trace.request, ends.from, ends.to), demo.id);
    }
  }
  // A demonstration whose packet skips its first router: no ending, and no words for it.
  const t3b = passing(3, 'defaults'), demo = structuredClone(t3b.presented);
  demo.demonstrations[0].trace.request.hops = [];
  assert.equal(lapEnding(demo, t3b.task.network, t3b.task.record), null);
  assert.equal(lapOf(t3b.geo, t3b.task.network, 'cisco', demo, t3b.task.record).ending, null);
  assert.equal(lapAnnouncement(demo, t3b.task.network, t3b.task.record), networkUi.success);
});

test('lap timing: one move takes min(0.45 s, 4 s / the longest probe); the lap ≤ 4 s, with an ending ≤ 6 s; 0.6 s before an ending; each reply starts when its own request arrives', () => {
  for (const { code, syntax, lap, schedule } of everyPass()) {
    assert.equal(lap.stepMs, Math.min(STEP_MS, LAP_MS / lap.steps), code);
    assert.equal(lap.steps, Math.max(...lap.probes.map(q => q.request.length + q.reply.length)));
    assert.ok(lap.steps * lap.stepMs <= LAP_MS + 1e-9, `${code}: lap ${lap.steps * lap.stepMs} ms`);
    assert.ok(schedule.at(-1).at <= (lap.ending ? WITH_ENDING_MS : LAP_MS), `${code} ${syntax}: ${schedule.at(-1).at} ms`);
    if (lap.ending) {
      const pause = schedule.find(x => x.phase === 'pause'), first = schedule.find(x => x.phase === 'ending');
      assert.equal(first.at - pause.at, PAUSE_MS);
    }
    for (const tick of schedule.filter(x => x.phase === 'lap')) {
      const frame = lapFrame(lap, tick);
      for (const m of frame.moving) {
        assert.ok(lap.probes.some(q => {
          const all = [...q.request, ...q.reply];
          return all[tick.step] && strokeKey(all[tick.step]) === strokeKey(m) && (m.leg === 'request' || tick.step >= q.request.length);
        }), `${code}: a move under way at step ${tick.step} is that probe's own`);
      }
      // ✓ only where the lap's own packets arrived: a request at its end, a reply back at its source.
      const reached = new Set(lap.probes.flatMap(q => [
        ...(tick.step >= q.request.length && q.requestEnd ? [q.requestEnd] : []),
        ...(tick.step >= q.request.length + q.reply.length && q.replyEnd ? [q.replyEnd] : []),
      ]));
      assert.deepEqual(new Set(frame.marks.map(m => m.key)), reached, `${code} step ${tick.step}`);
      assert.equal(frame.words, null);
    }
  }
  const t16 = passing(16);
  assert.deepEqual([t16.lap.steps, Math.round(t16.lap.stepMs)], [12, 333]);
  const t1 = passing(1);
  assert.deepEqual(t1.schedule.map(x => [x.at, x.phase]), [[0, 'lap'], [450, 'lap'], [900, 'lap'], [1350, 'lap'], [1800, 'lap'], [2250, 'lap'], [2700, 'end']]);
});

test('lap, task 15: the lap uses the normal scenario only; ISP2 traffic and the link down appear only in the failover ending; then the link is back', () => {
  const { lap, schedule, result, presented } = passing(15);
  assert.deepEqual(lap.probes.map(q => q.id), ['normal/internet-1']);
  assert.deepEqual([lap.ending.kind, lap.ending.scenarioId, lap.ending.probes.map(q => q.id), lap.ending.downLinks.map(d => d.segmentId)], ['failover', 'isp1-down', ['isp1-down/internet-1'], ['segment-1']]);
  // The ending is the outage line's own trace.
  const outage = result.evidence.probes.find(e => e.scenarioId === 'isp1-down');
  assert.deepEqual([...new Set(allMoves(lap.ending.probes).flatMap(m => [m.from, m.to]).filter(x => !x.startsWith('box:')))].sort(), [...new Set([...outage.request.hops, ...outage.reply.hops].map(x => x.deviceId))].sort());
  const touches = (frame, device) => [...frame.lines, ...frame.moving, ...(frame.ending?.lines ?? []), ...(frame.ending?.moving ?? [])].some(m => m.from === device || m.to === device);
  let seen = 0;
  for (const tick of schedule) {
    const frame = lapFrame(lap, tick);
    const ending = ['ending', 'hold'].includes(tick.phase);
    if (touches(frame, 'ISP2')) { seen++; assert.ok(ending, `ISP2 traffic in ${tick.phase}`); }
    assert.equal(Boolean(frame.ending?.downLinks?.length), ending, `the link is down only in the ending (${tick.phase})`);
    assert.ok(!touches({ ...frame, ending: null }, 'ISP2'), 'the lap’s own lines never go via ISP2');
    assert.equal(frame.faded, ending);
  }
  assert.ok(seen > 0);
  const end = lapFrame(lap, schedule.at(-1));
  assert.deepEqual([end.ending, end.faded, end.moving], [null, false, []], 'the link is back, the lines bright');
  assert.equal(end.words, 'Якщо лінк до ISP1 недоступний — резерв спрацював.');
  assert.equal(stripText(presented, end), '✓ Мережа працює! Усі пінги проходять в обидва боки. Якщо лінк до ISP1 недоступний — резерв спрацював.');
  assert.equal(end.marks.length, 3, 'the LAN box and both provider clouds reached');
});

const stripText = (presented, frame) => surfaces.stripOf(presented, null, { kind: 'lap', words: frame?.words ?? null }).text;
/** The strip as laid out: its words, and the ending's words held invisibly until they show. */
const stripLayout = (presented, lap, frame) => { const s = surfaces.stripOf(presented, null, { kind: 'lap', words: frame.words, ending: lap.ending?.words ?? null }); return [s.text, s.reserve].filter(Boolean).join(' '); };

test('lap endings are data-driven: a demonstration only where presentCheck has one (3, 3b), drawn as when picked; task 16 has none', () => {
  const withEnding = new Map();
  for (const { code, presented, lap } of everyPass()) {
    if (lap.ending) withEnding.set(code, lap.ending.kind);
    assert.equal(lap.ending?.kind === 'demo', presented.demonstrations.length > 0 && lap.ending?.kind !== 'failover', code);
  }
  assert.deepEqual([...withEnding], [['3', 'demo'], ['3b', 'demo'], ['15', 'failover'], ['17', 'demo']]);
  for (const [n, variantId] of [[3, 'explicit-routes'], [3, 'defaults'], [17, 'main']]) {
    const { task, presented, geo, lap, schedule } = passing(n, variantId);
    const demo = presented.demonstrations[0], ends = task.record.demonstrations.find(d => d.id === demo.id);
    // The screen's own plan for a picked demonstration (RoutingScreen: planPath with expected).
    const picked = planPath(geo, task.network, 'cisco', demo.trace, { from: ends.from, to: ends.to, repairRouter: undefined, failed: false, expected: true });
    const end = lapFrame(lap, schedule.at(-1));
    assert.deepEqual(end.ending, { kind: 'demo', plan: picked, step: picked.moves.length, stepMs: lap.ending.stepMs });
    assert.ok(picked.stops.every(s => s.expected), 'the calm ring: so it should be');
    assert.deepEqual([end.faded, end.words], [true, demo.text]);
    assert.match(end.words, /так і має бути/);
    assert.deepEqual(end.lines.map(strokeKey).sort(), [...new Set(allMoves(lap.probes).map(strokeKey))].sort(), 'the lap’s lines stay drawn');
    for (const tick of schedule) assert.equal(lapFrame(lap, tick).faded, ['ending', 'end'].includes(tick.phase), `${tick.phase}: the lines fade while the ending plays`);
  }
  assert.equal(passing(16).lap.ending, null);
});

// The rendered comparison (reduced motion against the animated lap's last
// frame, as the screen draws them) is in routing-mounted.test.mjs.
test('lap end frame: the player reaches it through every tick, in order; lines drawn, ✓ on every box and reached cloud, nothing moving', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const { code, geo, lap, schedule } of everyPass()) {
    const ticks = [];
    const player = lapPlayer(schedule, i => ticks.push(i));
    player.start();
    t.mock.timers.tick(schedule.at(-1).at + 1);
    assert.deepEqual(ticks, schedule.map(x => x.i), `${code}: every tick, in order`);
    const reduced = lapFrame(lap, schedule[ticks.at(-1)]);
    assert.deepEqual([reduced.done, reduced.moving], [true, []]);
    assert.deepEqual(reduced.lines.map(strokeKey).sort(), [...new Set(allMoves(lap.probes).map(strokeKey))].sort());
    const keys = new Set(reduced.marks.map(m => m.key));
    for (const m of solvedMarks(geo)) {
      assert.ok(keys.has(m.key), `${code}: ✓ on ${m.key}`);
      assert.deepEqual(reduced.marks.find(x => x.key === m.key).mark, { x: m.x, y: m.y }, 'where the success marks always sit');
    }
    for (const q of [...lap.probes, ...(lap.ending?.probes ?? [])]) for (const k of [q.requestEnd, q.replyEnd].filter(Boolean)) assert.ok(keys.has(k), `${code}: ✓ on ${k}`);
  }
});

test('lap playback: ticks on time; cancelling (a new check, navigation) stops it; a replay starts from the top; skip jumps to the end', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { schedule } = passing(15);
  const seen = [];
  const player = lapPlayer(schedule, i => seen.push(i));
  player.start();
  assert.deepEqual(seen, [0]);
  t.mock.timers.tick(schedule[3].at);
  assert.deepEqual(seen, [0, 1, 2, 3]);
  player.cancel();
  t.mock.timers.tick(10000);
  assert.deepEqual(seen, [0, 1, 2, 3], 'nothing after a cancel');
  seen.length = 0;
  player.start();
  t.mock.timers.tick(schedule.at(-1).at);
  assert.deepEqual(seen, schedule.map(x => x.i), 'a replay plays every tick again');
  seen.length = 0;
  player.start();
  player.skip();
  t.mock.timers.tick(10000);
  assert.deepEqual(seen, [0, schedule.length - 1], 'skip: straight to the end state, and nothing after');
  assert.equal(player.index, schedule.length - 1);
});

test('check view: a passing check plays the lap; «Показати ще раз» replays it; a picked line yields; a failing check or another task drops it', () => {
  const { presented } = passing(1);
  const failing = presentCheck(routing.create(tasks[0]), routing.check(routing.create(tasks[0]), {}));
  let s = checkViewReducer(initialCheckView('a'), { type: 'checked', ok: true });
  assert.deepEqual([s.shown, s.play], [{ kind: 'lap', id: 'lap' }, 1]);
  assert.equal(shownOf(s, presented).kind, 'lap');
  assert.equal(shownOf(s, failing).id, failing.firstFailure.id, 'the lap only while the check passes');
  s = checkViewReducer(checkViewReducer(s, { type: 'toggle', overlay: 'checks' }), { type: 'pick', id: presented.lines[0].id });
  assert.deepEqual([s.shown.kind, s.play], ['line', 2]);
  s = checkViewReducer(checkViewReducer(s, { type: 'toggle', overlay: 'text' }), { type: 'replay' });
  assert.deepEqual([s.shown.kind, s.overlay, s.play], ['lap', null, 3], 'replay closes the overlay over the diagram');
  assert.equal(checkViewReducer(s, { type: 'checked', ok: false }).shown, null);
  assert.equal(checkViewReducer(s, { type: 'checked' }).shown, null);
  assert.equal(checkViewReducer(s, { type: 'instance', key: 'b' }).shown, null);
});

test('lap words: the strip says the success at once, appends the ending’s words when it starts; the one announcement is the end state’s strip', () => {
  for (const { code, task, presented, lap, schedule } of everyPass()) {
    const texts = schedule.map(tick => stripText(presented, lapFrame(lap, tick)));
    assert.equal(texts[0], networkUi.success, `${code}: the verdict is immediate`);
    assert.ok(new Set(texts).size <= 2, 'the strip changes at most once: the ending’s words appended');
    assert.equal(new Set(schedule.map(tick => stripLayout(presented, lap, lapFrame(lap, tick)))).size, 1, `${code}: the strip’s words take the same room throughout (no layout shift)`);
    assert.equal(lapAnnouncement(presented, task.network, task.record), texts.at(-1), `${code}: announced once, as the strip ends`);
    assert.equal(lapEnding(presented, task.network, task.record)?.words ?? null, lap.ending?.words ?? null);
  }
  assert.equal(networkUi.success, '✓ Мережа працює! Усі пінги проходять в обидва боки.');
  // Round 4: «Показати ще раз» is a quiet link in the success box after a pass, not after a failure.
  const { presented } = passing(1);
  const html = p.renderStrip(presented, null, { kind: 'lap', words: null });
  assert.ok(/<div class="ng-rt-success">[\s\S]*<button type="button" class="ng-rt-link ng-rt-replay">Показати ще раз<\/button>/.test(html), html);
  const failing = presentCheck(routing.create(tasks[0]), routing.check(routing.create(tasks[0]), {}));
  assert.ok(!p.renderStrip(failing, null, null).includes('ng-rt-replay'));
});

test('routing screen: a passing check offers «Показати ще раз»; the lap draws nothing until a check plays it (server render: no lap, the ✓ marks as before)', () => {
  const [task1] = tasks;
  const { task, result } = passing(1);
  const store = p.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: task1.id, router: 'R1', filterLevel: 0, variants: {} } });
  store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'checked', answer: routing.solution(task), result } });
  const html = store.render(p.RoutingScreen, { bank: p.routingBank });
  assert.ok(html.includes('>Показати ще раз</button>'));
  assert.ok(!html.includes('ng-lap'), 'no lap without a check event');
  assert.equal((html.match(/class="ng-path-mark is-ok"/g) ?? []).length, 2);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
});

test('lap leak gate: every frame’s drawing, the strip, the announcement and the conversion note say names only', t => {
  let surfacesChecked = 0;
  const inspect = (task, text, label) => { surfacesChecked++; assert.deepEqual(inspectLeaks(task, text, 'strip'), [], `${label}: ${normalise(text)}`); };
  for (const { code, syntax, task, presented, lap, schedule } of everyPass()) {
    const pending = presentCheck(task, routing.check(task, {}), syntax);
    for (const tick of schedule) {
      const frame = lapFrame(lap, tick);
      const svg = p.renderLap(frame);
      assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(normalise(svg)));
      inspect(task, svg, `${code} ${syntax} ${tick.phase} ${tick.step} drawing`);
      const strip = p.renderStrip(presented, pending, { kind: 'lap', words: frame.words, ending: lap.ending?.words ?? null }).match(/<p class="ng-rt-strip[^"]*">([\s\S]*?)<\/p>/)[1];
      inspect(task, strip, `${code} ${syntax} strip`);
    }
    inspect(task, lapAnnouncement(presented, task.network, task.record), `${code} announcement`);
    for (const name of ['Cisco', 'MikroTik']) inspect(task, ui.shared.convertNote(name), 'note');
    inspect(task, ui.shared.replay, 'replay');
  }
  assert.ok(surfacesChecked > 500, `${surfacesChecked} surfaces`);
  t.diagnostic(JSON.stringify({ surfaces: surfacesChecked }));
});
