// The firewall screen mounted (FW-1 screen spec §8, v2 S2, S3, S5 e, g):
// lifecycle checks that server rendering can't make, because effects,
// timers and events must run. The scenarios are in
// tests/helpers/mounted-firewall.mjs; they mount the real FirewallScreen
// with react-dom/client in a small test DOM (tests/helpers/mini-dom.mjs)
// with mocked timers, in a process of their own:
//   - the commit flow («Перевірити» needs both choices; focus stays on the
//     button that becomes «Наступний пакет →»), arrow keys in each group;
//   - a press skips a walk without blocking the press;
//   - no replay on navigation or a remount; «Показати ще раз» replays;
//   - reveal marks assistance, per card, and reads the reference only then;
//   - a full round earns the variant; «Ще раз» gives a new seed; «↺»;
//   - reduced motion shows the animated walk's last frame;
//   - card k+1 stays a fresh render after committing or revealing card k;
//   - «Текстом», «Правила», «По кроках»; no React warnings;
//   - fix round 1: the verdict at once, the deciding chain and row only at
//     the walk's end; the assumption line under the table once the FastTrack
//     row is lit; state meanings on keyboard focus (rows, the card).
// tools/test.sh runs the helper first and passes its results file; direct
// `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-firewall.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_FIREWALL_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_FIREWALL_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted firewall screen: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 320, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted firewall: ${r.name}`, () => assert.ok(r.ok, r.detail));
