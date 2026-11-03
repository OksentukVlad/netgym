// «DHCP і NAT» mounted (round 6): the real DhcpScreen in a small test DOM —
// E1's cards and their port highlight, E2's strip, steps, rows and wizard,
// E3's round, replay and rules. The scenarios are in
// tests/helpers/mounted-dhcp.mjs and run in a process of their own, so that
// DOM never reaches this one (the other tests render on the server).
// tools/test.sh runs the helper first and passes its results file; direct
// `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-dhcp.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_DHCP_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_DHCP_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted «DHCP і NAT» screens: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 138, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted DHCP: ${r.name}`, () => assert.ok(r.ok, r.detail));
