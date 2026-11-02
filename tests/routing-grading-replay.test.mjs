import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import tasks from '../src/banks/routing/tasks.js';
import routing from './helpers/routing.mjs';
import * as cisco from '../src/engine/vendors/cisco.js';
import * as routeros from '../src/engine/vendors/routeros.js';

const bytes = readFileSync(new URL('./fixtures/routing-grading-34ee9ac.json', import.meta.url));
export const frozen = JSON.parse(bytes);

test('frozen grading: the corpus fixture is byte for byte the one captured from the live apps', () => {
  // The SHA-256 recorded when the fixture was captured; never regenerate the fixture.
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'fd36fd28d247205ce912653db9b4b0f43a72ba2fc64341186980ec089e8b2ae7');
});
export const verdictOf = row => ({ ...row.verdict, ...Object.fromEntries(row.undefinedVerdictKeys.map(key => [key, undefined])) });

test('frozen grading: 10,708 full verdicts replay without legacy imports, including historical 3b', () => {
  assert.deepEqual(frozen.counts, { comparisons: 10708, routeLabels: 240, interfaceLabels: 256, scaffoldLabels: 242 });
  assert.equal(frozen.rows.length, 10708);
  const identities = new Set();
  for (const row of frozen.rows) {
    const record = tasks.find(t => t.id === row.task);
    assert.equal(record.displayNumber, row.displayNumber);
    const task = routing.create(record, { variantId: row.variant });
    assert.equal(task.variant.code, row.code);
    if (row.context) {
      const context = frozen[row.context];
      assert.equal(context.task, row.task);
      assert.equal(context.variant, row.variant);
      task.variant = { ...task.variant, referenceRoutes: { ...task.variant.referenceRoutes, ...context.referenceRoutes } };
    }
    identities.add(`${row.syntax}/${row.task}/${row.variant}/${row.router}/${row.index}`);
    assert.equal(task.variant.referenceRoutes[row.router][row.index].id, row.routeId);
    assert.deepEqual(routing.checkRow(task, row.router, row.index, row.answer, row.syntax), Object.fromEntries(Object.entries(verdictOf(row)).filter(([key]) => !['net', 'mask', 'cidr', 'gw', 'dist'].includes(key))),
      `${row.syntax}/${row.task}/${row.variant}/${row.router}/${row.index} ${JSON.stringify(row.answer)}`);
  }
  assert.equal(identities.size, 240);
});

test('frozen grading: current scaffold replays all 242 safe labels and field requirements', () => {
  assert.equal(frozen.scaffoldLabels.length, 242);
  for (const row of frozen.scaffoldLabels) {
    const task = routing.create(tasks.find(t => t.id === row.task), { variantId: row.variant });
    const actual = routing.scaffold(task, row.syntax)[row.router][row.index];
    assert.deepEqual({ label: actual.label, fields: actual.fields, needDist: actual.needDist },
      { label: row.label, fields: row.fields, needDist: row.needDist });
  }
  assert.equal(frozen.routeLabels.length, 240, 'historical full describeRoute values remain archived');
});

test('frozen grading: all 256 interface labels replay against vendor adapters', () => {
  assert.equal(frozen.interfaceLabels.length, 256);
  for (const row of frozen.interfaceLabels) {
    const iface = tasks.find(t => t.id === row.task).network.devices.find(d => d.id === row.router).interfaces[row.index];
    assert.equal(iface.id, row.interfaceId);
    assert.equal(({ cisco, routeros })[row.syntax].interfaceLabel(iface), row.label);
  }
});
