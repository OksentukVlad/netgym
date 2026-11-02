import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import { full, sweepSeeds } from './helpers/sweep-mode.mjs';
import { sweep } from '../tools/rf1-sweep.mjs';
import behaviours from './fixtures/rf1/behaviour-classes-v1.json' with { type: 'json' };
const seeds = sweepSeeds(Array.from({ length: 200 }, (_, n) => n), [0], 1);
test(`A7 RF-1 gates: every variant × cause × ${full ? 'site' : 'behaviour'}, ${seeds.length} deterministic seeds`, () => {
  const report = sweep(record, bank, seeds, { exhaustive: full, onSeed: progress => {
    if (process.env.NETGYM_RF1_PROGRESS) writeFileSync(process.env.NETGYM_RF1_PROGRESS, `${JSON.stringify(progress)}\n`);
  } });
  // Frozen from the exhaustive 0–199 run at 3ed0b55, independently of this
  // sampler: dropping a class in either mode must fail, not shrink the sample.
  assert.deepEqual(report.behaviours.map(b => JSON.stringify([b.taskId, b.variantId, ...b.behaviour])).sort(),
    behaviours.classes.map(b => JSON.stringify(b)).sort());
  assert.equal(report.combinations.length, 22);
  for (const c of report.combinations) {
    assert.equal(c.seeds, seeds.length, `every seed retains ${c.taskId}/${c.variantId}/${c.code}`);
    if (full) assert.equal(c.independentRepairs, 2 * seeds.length);
  }
  if (process.env.NETGYM_RF1_REPORT) writeFileSync(process.env.NETGYM_RF1_REPORT, `${JSON.stringify(report, null, 2)}\n`);
});
