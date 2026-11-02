#!/usr/bin/env node
import * as bank from '../src/banks/routing/tasks.js';
// Run separately from tools/test.sh: 200 accepted seeds per variant, three
// optimiser totals and all mapped legacy verdicts. Optional --output <file>.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import tasks from '../src/banks/routing/tasks.js';
import { create } from '../src/sections/routing/logic/static.js';
import { optimise } from '../src/sections/routing/logic/optimise.js';
import { frozenFor } from '../src/sections/routing/logic/generated.js';
import { assertAccepted, goldenSeeds, replayWrongRows, replayWrongNetworks, unitPlan } from '../tests/helpers/step9.mjs';

const outputIndex = process.argv.indexOf('--output');
if (process.argv.slice(2).some((v, i, args) => v !== '--output' && args[i - 1] !== '--output') || (outputIndex !== -1 && !process.argv[outputIndex + 1])) throw new Error('Usage: node tools/step9-sweep.mjs [--output path]');
const started = performance.now();
const report = { generatorVersion: 1, seeds: '0–199 inclusive', seedsPerVariant: 200, variants: [], optimiser: [], wrongAnswers: [], unitPlans: {}, timings: {} };
const feasibilityStart = performance.now();
for (const record of tasks) {
  report.unitPlans[record.displayNumber] = unitPlan(record);
  for (const variant of record.variants) {
    const start = performance.now(), attempts = {}, seeds = [];
    for (let seed = 0; seed < 200; seed++) {
      const task = create(record, { variantId: variant.id, seed, bank });
      assertAccepted(record, task);
      attempts[task.record.generation.attempt] = (attempts[task.record.generation.attempt] ?? 0) + 1;
      seeds.push(seed);
    }
    const result = { code: variant.code, feasible: seeds.length, accepted: seeds.length, attempts, ms: Math.round(performance.now() - start) };
    report.variants.push(result);
    console.log(`Acceptance ${variant.code}: ${result.accepted}/200, ${result.ms} ms, attempts ${JSON.stringify(attempts)}`);
  }
}
report.timings.acceptanceMs = Math.round(performance.now() - feasibilityStart);
const optimiserStart = performance.now();
for (const record of tasks) for (const variant of record.variants) {
  const totals = [], start = performance.now();
  for (const seed of goldenSeeds) {
    const task = create(record, { variantId: variant.id, seed, bank }), actual = optimise(task).total, expected = frozenFor(task, bank).total;
    assert.equal(actual, expected, `optimiser ${variant.code}/${seed}`); totals.push({ seed, actual, expected });
  }
  const result = { code: variant.code, totals, ms: Math.round(performance.now() - start) };
  report.optimiser.push(result); console.log(`Optimiser ${variant.code}: ${totals.map(t => t.actual).join('/')}, ${result.ms} ms`);
}
report.timings.optimiserMs = Math.round(performance.now() - optimiserStart);
const wrongStart = performance.now();
for (const record of tasks) for (const variant of record.variants) {
  const start = performance.now(), seeds = [];
  for (const seed of goldenSeeds) {
    const task = create(record, { variantId: variant.id, seed, bank });
    seeds.push({ seed, rows: replayWrongRows(record, task), semanticCases: replayWrongNetworks(record, task) });
  }
  const result = { code: variant.code, seeds, ms: Math.round(performance.now() - start) };
  report.wrongAnswers.push(result); console.log(`Wrong answers ${variant.code}: ${seeds.reduce((n, s) => n + s.rows, 0)} rows, ${result.ms} ms`);
}
report.timings.wrongAnswersMs = Math.round(performance.now() - wrongStart);
report.timings.totalMs = Math.round(performance.now() - started);
report.accepted = report.variants.reduce((n, v) => n + v.accepted, 0);
report.legacyVerdicts = report.wrongAnswers.reduce((n, v) => n + v.seeds.reduce((n, s) => n + s.rows, 0), 0);
if (outputIndex !== -1) writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
console.log(`PASS ${report.accepted} generated variants; ${report.legacyVerdicts} legacy verdicts; ${(report.timings.totalMs / 1000).toFixed(3)} s`);
