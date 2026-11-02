// The routing screen mounted (polish repair round 1): lifecycle checks that
// server rendering can't make, because effects, timers and events must
// run. The scenarios are in tests/helpers/mounted-routing.mjs; they mount the
// real RoutingScreen with react-dom/client in a small test DOM
// (tests/helpers/mini-dom.mjs) and mocked timers. They run in a process of
// their own, so that DOM never reaches this one (the other tests render on
// the server and must not see a `window`). Each scenario's result is one
// test here:
//   - A → B → A (by task, during a lap, by variant): no lap without a check;
//     «Показати ще раз» still offered;
//   - one announcement per check, none for a replay;
//   - a new check, a navigation and unmounting cancel the lap's timers;
//   - reduced motion renders the animated lap's last frame (tasks 1, 15, 3b,
//     16);
//   - a picked demonstration's «Текстом» line;
//   - the optimiser's review after a solve: its queue, the ★, the tips and
//     «Показати найкоротший відомий варіант» (OPT-1 UI);
//   - step 9: «Інші адреси» (a new instance; the old one's work kept; stored
//     only once edited), «Код задачі» (Enter or «Відкрити», four refusals),
//     «Скопіювати код», the lap, tips, ★ and known table on generated
//     instances, base revealed → generated unrevealed, solved seed → another;
//     repair round 1: a pending build never overrides newer navigation,
//     Ukrainian-keyboard codes, a passing non-reference answer shown and
//     copied as submitted, the reveal panel's state kept off the store;
//   - RF-1 «Знайди несправність» (round 3): the switch on the address row,
//     each check outcome (form errors, a failing ping, a blocking finding
//     while every ping passes, a passing fix), the cause question only after
//     a passing fix and closed by an edit, a wrong and a right cause, «Ще
//     одна», paths on demand and their announcement, hints (rung 2 from the
//     pings on screen, rung 3 assisted), the reveal, a syntax switch (and a
//     leftover draft closing the cause question), read-only rows once solved,
//     focus on another router's form error, the requirement line, and leaks
//     with each witnessed combination forced;
//   - no React warnings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-routing.mjs', import.meta.url));
// tools/test.sh supplies freshly run results; direct node --test still uses
// the standalone child where nested process creation is available.
const run = process.env.NETGYM_MOUNTED_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted routing screen: runner bounds every mounted helper to 240 seconds', () => {
  const runner = readFileSync(new URL('../tools/test.sh', import.meta.url), 'utf8');
  assert.match(runner, /mounted_helpers=\(routing firewall ip vlan vlan3 setup shared\)/);
  assert.match(runner, /timeout --kill-after=5 240 node --import "\$project_root\/tools\/test-mounted-profile\.mjs" "tests\/helpers\/mounted-\$helper\.mjs"/);
  assert.match(runner, /mounted-results\.mjs/);
  assert.match(runner, /wait -n -p completed "\$\{pids\[@\]\}"/);
  assert.match(runner, /flock -n 9/);
});

test('mounted routing screen: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 438, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted: ${r.name}`, () => assert.ok(r.ok, r.detail));
