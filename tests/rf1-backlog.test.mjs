import test from 'node:test';
import assert from 'node:assert/strict';
import * as bank from '../src/banks/routing/tasks.js';
import { create, check, solution, checkRow } from '../src/sections/routing/logic/static.js';
import { frozenFor } from '../src/sections/routing/logic/generated.js';
import { shortest } from '../src/sections/routing/logic/review.js';
test('backlog: generated routing uses caller bank identity, records and frozen data', () => {
  const custom = { ...bank, bankId: 'test.routing', bankRevision: 7, tasks: [bank.tasks[0]] };
  const task = create(custom.tasks[0], { bank: custom, seed: 42 });
  assert.equal(task.identity.bankId, custom.bankId);
  assert.equal(task.identity.bankRevision, 7);
  assert.ok(check(task, solution(task)).ok);
  assert.ok(check(task, shortest(task, custom)).ok);
  assert.equal(frozenFor(task, bank), null);
  assert.equal(frozenFor(task, custom).total, custom.frozen.results[`${task.record.id}/main`].total);
  const missing = create(custom.tasks[0], { bank: { ...custom, frozen: { results: {} } }, seed: 42 });
  assert.equal(missing.infeasible, true);
});
test('A4 checkRow exposes only verdict booleans in both syntaxes', () => {
  const task = create(bank.tasks[0], { bank }), row = solution(task).R1[0];
  for (const syntax of ['cisco', 'routeros']) {
    const fields = syntax === 'cisco' ? { net: row.dst, mask: '255.255.255.0', gw: row.via } : { dst: `${row.dst}/${row.prefix}`, gw: row.via };
    const result = checkRow(task, 'R1', 0, fields, syntax);
    assert.ok(result.ok);
    assert.ok(Object.values(result).every(value => typeof value === 'boolean'));
    for (const key of ['net', 'mask', 'cidr', 'gw', 'dist']) assert.ok(!Object.hasOwn(result, key));
  }
});
