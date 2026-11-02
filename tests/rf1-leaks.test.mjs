import test from 'node:test';
import assert from 'node:assert/strict';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
import { levelCodes, analyse } from '../src/sections/routing/logic/faults.js';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { create } from '../src/sections/routing/logic/static.js';
import { rf1Leaks } from './helpers/rf1-leaks.mjs';
import * as rendered from '../.test-bundles/harness/routing-leaks.mjs';
import { full, sweepSeeds } from './helpers/sweep-mode.mjs';

const seeds = sweepSeeds([0, 1], [0], 1);

test('A4 RF-1 seeded public payloads, copy, hints 1–2, ping snapshots, traces, map and accessible topology have no fault metadata', () => {
  for (const definition of record.variants) for (const seed of seeds) {
    const available = analyse(create(bank.tasks.find(r => r.id === definition.taskId), { bank, seed, variantId: definition.variantId }));
    for (const level of definition.levels) for (const faultCode of levelCodes[level]) {
      // Cause/variant coverage remains complete; lower-level copies of the same
      // cause repeat identical surfaces. Every level is exercised by the sweep.
      if (!full && definition.levels.find(l => levelCodes[l].includes(faultCode)) !== level) continue;
      if (!available.candidates.some(c => c.accepted && c.site.code === faultCode)) continue;
      const i = F.inspect(record, { bank, taskId: definition.taskId, variantId: definition.variantId, seed, level, faultCode });
      const task = i.task, answer = F.initialAnswer(task), result = F.check(task, answer), initial = F.pingList(task);
      assert.deepEqual(initial.rows.map(r => r.id), task.probes.map(p => p.id));
      assert.deepEqual(F.options(task, 'cause', { answer, result }), []);
      const common = [F.hints(task), F.hints(task, answer, { result, rung: 3 }),
        F.initialAnswer(task), F.parseAnswer(task, answer), initial, result];
      for (const syntax of syntaxList) {
        const surfaces = [F.describe(task, { syntax: syntax.id }), F.describe(task, { answer, result, syntax: syntax.id }),
          ...common,
          ...initial.rows.map(row => F.traceFor(task, row, syntax.id)),
          ...initial.rows.map(row => F.describeTrace(task, row, syntax.id)),
          rendered.renderTopology(task, syntax), rendered.renderTextEquivalent(task, syntax)];
        assert.deepEqual(rf1Leaks(task, surfaces), [], `${definition.taskId}/${level}/${seed}/${faultCode}/${syntax.id}`);
      }
      for (const rows of Object.values(task.initialRoutes)) assert.deepEqual(rows.map(r => r.id.split('-').at(-1)), rows.map((_, n) => String(n + 1)), 'deleted rows leave no reference gaps');
    }
  }
});
test('RF-1 leak gate has positive controls for nested metadata, ids, values and rendered attributes', () => {
  const task = F.create(record, { bank });
  assert.ok(rf1Leaks({ ...task, record: {} }).length);
  assert.ok(rf1Leaks(task, ['<span title="wrong-next-hop" data-fault="missing-route">']).length);
  const nested = structuredClone(task); nested.network.devices[0].hint = 'answer';
  assert.ok(rf1Leaks(nested).length);
  const id = structuredClone(task); Object.values(id.initialRoutes).find(rows => rows.length)[0].id = 'R1.route1';
  assert.ok(rf1Leaks(id).length);
  for (const surface of [{ evidence: { nested: { referenceRoutes: {} } } }, { traces: [{ routeId: 'R1.route2' }] }, { result: { originalRoute: {} } }])
    assert.ok(rf1Leaks(task, [surface]).length, JSON.stringify(surface));
});
