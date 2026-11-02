// The routing screen's syntax adapters and row facts against the round 1
// apps' frozen data (step 8: the apps are retired; tests/fixtures/
// routing-legacy-34ee9ac.json and routing-grading-34ee9ac.json were captured
// from them first): fields, labels, commands, feedback wording and the
// neutral-route round trip that lets the syntax switch keep an answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import tasks from '../src/banks/routing/tasks.js';
import routing, { checkRow } from './helpers/routing.mjs';
import { rowReasons, rowVerdict } from '../src/sections/routing/logic/rowReasons.js';
import { topology } from '../src/sections/routing/logic/topology.js';
import { syntaxes, syntaxList } from '../src/sections/routing/syntax/index.js';
import { hasDhcpWan, rowFacts } from '../src/sections/routing/screens/facts.js';
import { ui } from '../src/sections/routing/uk.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const legacy = fixture('routing-legacy-34ee9ac.json');
const grading = fixture('routing-grading-34ee9ac.json');
// The frozen round 1 data cover tasks 1–16; task 17 (OPT-1a) is new.
const legacyTasks = tasks.filter(record => record.displayNumber <= 16);
const plain = parts => parts.map(p => (typeof p === 'string' ? p : p.code ?? p.b)).join('');

function* rowsOf() {
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    for (const [router, list] of Object.entries(variant.referenceRoutes)) {
      for (const index of list.keys()) yield { record, variant, task, router, index };
    }
  }
}

test('syntax adapters: fields follow the scaffold; placeholders use independent examples', () => {
  for (const syntax of syntaxList) {
    for (const { task, router, index } of rowsOf()) {
      const row = routing.scaffold(task, syntax.id)[router][index];
      assert.deepEqual(syntax.fields.filter(f => row.fields.includes(f.name)).map(f => f.name), row.fields);
    }
  }
  const placeholder = (s, name, isDefault = false) => s.fields.find(f => f.name === name).placeholder({ isDefault });
  assert.deepEqual(syntaxes.cisco.fields.map(f => f.label), ['МЕРЕЖА', 'ПОВНА МАСКА', 'NEXT-HOP', 'DISTANCE']);
  assert.deepEqual(['net', 'mask', 'gw', 'dist'].map(n => placeholder(syntaxes.cisco, n)), ['напр. 203.0.113.0', 'напр. 255.255.255.0', 'напр. 198.51.100.1', 'distance'], 'step 7 fix: «distance», as in MikroTik (Fable)');
  assert.deepEqual(['net', 'mask'].map(n => placeholder(syntaxes.cisco, n, true)), ['0.0.0.0', '0.0.0.0']);
  assert.equal(placeholder(syntaxes.routeros, 'dst', true), '0.0.0.0');
  assert.deepEqual(syntaxes.routeros.fields.map(f => f.name), ['dst', 'gw', 'dist'], 'MikroTik has no mask field');
  assert.deepEqual(['dst', 'gw', 'dist'].map(n => placeholder(syntaxes.routeros, n)), ['dst-address, напр. 203.0.113.0/24', 'gateway, напр. 198.51.100.1', 'distance']);
  assert.equal(syntaxes.routeros.filterInput('  10.0.0.1 '), '10.0.0.1', 'round 1 MikroTik trimmed as it was typed');
  assert.equal(syntaxes.cisco.filterInput(' 10.0.0.1 '), ' 10.0.0.1 ');
});

test('syntax adapters: interface labels are the diagram labels of each round 1 app (frozen)', () => {
  let count = 0;
  for (const record of legacyTasks) for (const syntax of syntaxList) {
    const topo = topology(record.network, syntax.id);
    for (const device of record.network.devices.filter(d => d.kind === 'router')) {
      device.interfaces.forEach((iface, i) => {
        const frozen = grading.interfaceLabels.find(row => row.syntax === syntax.id && row.task === record.id && row.router === device.id && row.index === i);
        assert.equal(syntax.ifaceLabel(iface), topo.routers[device.id].interfaces[i].name);
        assert.equal(syntax.ifaceLabel(iface), frozen.label);
        count++;
      });
    }
  }
  assert.equal(count, 256);
});

test('syntax adapters: the reference commands equal round 1 (frozen), per router and variant', () => {
  let blocks = 0;
  for (const record of legacyTasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const solution = routing.solution(task);
    for (const syntax of syntaxList) {
      for (const [router, rows] of Object.entries(solution)) {
        const frozen = legacy.commands.find(row => row.syntax === syntax.id && row.task === record.id && row.variant === variant.id && row.router === router);
        assert.equal(syntax.commandBlock(rows), frozen.block, `${variant.code} ${router} ${syntax.id}`);
        if (syntax.id === 'cisco' && frozen.block) assert.match(frozen.block, /^configure terminal\n[\s\S]*\nend\nwrite memory$/);
        blocks++;
      }
    }
  }
  assert.equal(blocks, legacy.commands.length);
});

test('syntax adapters: wrong feedback uses one reason code for each wrong field, in each syntax', () => {
  // The frozen grading corpus's answers (the historical 3b rows aside, whose
  // reference was replaced by A2): right, wrong, blank and malformed fields.
  let compared = 0;
  const created = new Map();
  for (const row of grading.rows.filter(r => !r.context)) {
    const key = `${row.task}/${row.variant}`;
    if (!created.has(key)) created.set(key, routing.create(tasks.find(t => t.id === row.task), { variantId: row.variant }));
    const task = created.get(key), syntax = syntaxes[row.syntax];
    const result = checkRow(task, row.router, row.index, row.answer, syntax.id);
    const verdict = rowVerdict(result);
    const reasons = rowReasons(task, row.router, row.index, row.answer, syntax.id, verdict);
    const expectedFields = syntax.fields.filter(f => verdict[f.okKey] === false).map(f => f.name);
    assert.deepEqual(Object.keys(reasons), expectedFields);
    if (!result.ok) {
      const actual = plain(syntax.feedback(verdict, reasons).parts);
      assert.equal(actual.split('\n').length, expectedFields.length + 1);
    } else assert.deepEqual(reasons, {});
    compared++;
  }
  assert.ok(compared > 10000, String(compared));
});

test('syntax adapters: an answer survives the syntax switch through the neutral route', () => {
  for (const { task, router, index } of rowsOf()) {
    const reference = routing.solution(task)[router][index];
    const needDist = routing.scaffold(task)[router][index].needDist;
    for (const from of syntaxList) for (const to of syntaxList) {
      const fields = from.fromRoute(reference, needDist);
      const route = from.toRoute(fields);
      assert.deepEqual(route, { dst: reference.dst, prefix: reference.prefix, ...(reference.discard ? { discard: true } : { via: reference.via }), distance: reference.distance ?? 1 });
      // A backup route keeps its distance; the reference answer is right in the other syntax too.
      assert.equal(checkRow(task, router, index, to.fromRoute(route, needDist), to.id).ok, true, `${task.variant.code} ${router}#${index + 1} ${from.id}→${to.id}`);
    }
  }
  // The round 1 graders' normalisation carries over; leading zeros don't parse, as they don't grade.
  assert.deepEqual(syntaxes.cisco.toRoute({ net: ' 192.168.2.0', mask: '255.255.255.0 ', gw: '10.0. 0.2' }), { dst: '192.168.2.0', prefix: 24, via: '10.0.0.2', distance: 1 });
  assert.deepEqual(syntaxes.routeros.toRoute({ dst: '0.0.0.00.0.0.0', gw: '10.0.0.1' }), { dst: '0.0.0.0', prefix: 0, via: '10.0.0.1', distance: 1 });
  assert.equal(syntaxes.cisco.toRoute({ net: '192.168.2.0', mask: '/24', gw: '10.0.0.2' }), null);
  assert.equal(syntaxes.routeros.toRoute({ dst: '192.168.002.0/24', gw: '10.0.0.2' }), null);
  assert.equal(syntaxes.cisco.toRoute({}), null);
});

test('row facts: metadata supplies names, defaults and distance roles without references', () => {
  for (const { task, router, index } of rowsOf()) {
    const row = task.variant.scaffold[router][index];
    const noReferences = { ...task, variant: { scaffold: task.variant.scaffold } };
    const facts = rowFacts(noReferences, router, index);
    assert.equal(facts.isDefault, row.dest.kind === 'default');
    assert.equal(facts.role, row.role);
    assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(facts.label));
    // OPT-1 UI U8: a discard row (task 17's R-CORE) has its own title, from its flag.
    assert.equal(facts.discard, row.discard === true);
    if (row.discard) { assert.equal(facts.label, ui.shared.discardTitle); continue; }
    for (const id of row.dest.segments) assert.ok(facts.label.includes(task.network.segments.find(s => s.id === id).name));
    // Task 14's summary row is a suggestion (step 6): its header says «Порада: …» instead.
    if (row.dest.kind === 'summary') assert.ok(row.suggestion ? facts.suggestion && !facts.label.includes('сумарним') : facts.label.endsWith('одним сумарним маршрутом'));
  }
  for (const record of legacyTasks) for (const syntax of syntaxList) {
    const topo = topology(record.network, syntax.id);
    const frozen = legacy.topologies.find(row => row.syntax === 'cisco' && row.task === record.id).dhcpWan;
    for (const router of Object.keys(topo.routers)) assert.equal(hasDhcpWan(topo, router), frozen[router], `${record.id} ${router}`);
  }
});
