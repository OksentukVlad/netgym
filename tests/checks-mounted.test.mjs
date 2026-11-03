// «Перевірка мережі» mounted (round 7): the real ChecksScreen in a small test
// DOM — C3's requirements, C1's ladder at both levels (folded rungs, the stop,
// the places, the argument field, «Усе працює»), C2's lines and verdicts, the
// links in. The scenarios are in tests/helpers/mounted-checks.mjs and run in a
// process of their own, so that DOM never reaches this one. tools/test.sh runs
// the helper first and passes its results file; direct `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-checks.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_CHECKS_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_CHECKS_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted «Перевірка мережі» screens: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 69, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted checks: ${r.name}`, () => assert.ok(r.ok, r.detail));
