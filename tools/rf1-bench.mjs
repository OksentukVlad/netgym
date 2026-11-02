// Run directly from src (no bundle or warm analysis cache).
// node tools/rf1-bench.mjs [--all] [--output path.json]
import { writeFileSync } from 'node:fs';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
const args = process.argv.slice(2), all = args.includes('--all');
const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
const count = all ? 10000 : 20;
const measure = fn => { const start = performance.now(), value = fn(); return [value, performance.now() - start]; };
const summary = entries => {
  const sorted = entries.map(e => e.ms).sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    max: sorted.at(-1), worstSeed: entries.reduce((a, b) => a.ms > b.ms ? a : b).seed,
    over100ms: entries.filter(e => e.ms >= 100).length };
};
const results = [], started = performance.now();
for (const level of [1, 2, 3]) {
  const times = { create: [], inspect: [], ...(!all ? { inspectMaterialized: [], checkFaulty: [], checkFixed: [], options: [] } : {}) };
  for (let seed = 0; seed < count; seed++) {
    const [task, ms] = measure(() => F.create(record, { bank, level, seed }));
    times.create.push({ seed, ms });
    // Default timings use distinct, fresh seeds for the two entry points.
    const inspectSeed = all ? seed : seed + 100;
    times.inspect.push({ seed: inspectSeed, ms: measure(() => F.inspect(record, { bank, level, seed: inspectSeed }))[1] });
    if (!all) {
      times.inspectMaterialized.push({ seed, ms: measure(() => {
        const inspected = F.inspect(record, { bank, level, seed });
        // Include EVERY tooling diagnostic, so deferred walks/signatures
        // cannot hide a slow inspector behind the entry-point measurement.
        for (const candidate of inspected.candidates) {
          void candidate.observation; void candidate.signature;
        }
        return inspected;
      })[1] });
      times.checkFaulty.push({ seed, ms: measure(() => F.check(task))[1] });
      const answer = F.solution(task);
      const [result, checkedMs] = measure(() => F.check(task, answer));
      times.checkFixed.push({ seed, ms: checkedMs });
      times.options.push({ seed, ms: measure(() => F.options(task, 'cause', { result, answer }))[1] });
    }
  }
  const result = { level, count, ms: Object.fromEntries(Object.entries(times).map(([key, entries]) => [key, summary(entries)])) };
  results.push(result);
  console.log(JSON.stringify(result));
}
const report = { results, elapsedMs: performance.now() - started };
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (results.some(r => r.ms.create.over100ms || r.ms.inspect.over100ms)) process.exitCode = 1;
