// «Знайди несправність» mounted (VLAN-3 spec v2 §4, Z1, Z2, Z7; brief v1
// item 9): lifecycle checks that server rendering can't make, because
// effects and events must run. The scenarios are in
// tests/helpers/mounted-vlan3.mjs; they mount the real VlanScreen with
// react-dom/client in a small test DOM (tests/helpers/mini-dom.mjs), in a
// process of their own: the start, a walk on demand, the grid only on a
// check, each Z2 outcome, the levels, a form error, the native field, an IP
// task, the hints and the reveal, a syntax switch, and the leak rounds over
// several forced faults.
// tools/test.sh runs the helper first and passes its results file; direct
// `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-vlan3.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_VLAN3_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_VLAN3_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted fault-finding: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 60, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted VLAN-3: ${r.name}`, () => assert.ok(r.ok, r.detail));
