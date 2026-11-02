// The step 8 IP screens mounted (react-dom/client in a small test DOM, mocked
// timers): keyboard, paste and text entry in the walk's answer row, the live
// calculator, and the links between screens inside the real shell, with
// their payloads and destination state, and the shell's theme switch. The scenarios are in
// tests/helpers/mounted-ip.mjs and run in a process of their own, so that
// DOM never reaches this one (the other tests render on the server).
// tools/test.sh runs the helper first and passes its results file; direct
// `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-ip.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_IP_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_IP_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted IP screens: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 60, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted IP: ${r.name}`, () => assert.ok(r.ok, r.detail));
