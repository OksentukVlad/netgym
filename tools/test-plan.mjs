// Greedy balancing from measured file costs. Discovery always includes new files;
// the costs affect scheduling only, never which tests run or which seeds they use.
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import costs from './test-costs.json' with { type: 'json' };
const count = Number(process.argv[2]);
assert.ok(Number.isInteger(count) && count >= 1 && count <= 3, 'NETGYM_TEST_JOBS must be 1, 2 or 3');
const files = readdirSync('tests').filter(f => f.endsWith('.test.mjs'));
assert.ok(files.length >= count, 'not enough test files');
assert.ok(files.every(f => !/[\r\n]/.test(f)), 'test filenames cannot contain line breaks');
files.sort((a, b) => (costs[b] ?? 1000) - (costs[a] ?? 1000) || a.localeCompare(b));
const groups = Array.from({ length: count }, () => ({ cost: 0, files: [] }));
for (const file of files) {
  const group = groups.reduce((best, g) => g.cost < best.cost ? g : best);
  group.files.push(`tests/${file}`);
  group.cost += costs[file] ?? 1000;
}
groups.forEach((g, i) => writeFileSync(`.test-bundles/shard-${i}.files`, g.files.join('\n') + '\n'));
console.error(`Node tests: ${count} shell-launched shards, isolation=none (${files.length} files)`);
