// «Налаштування з нуля» mounted (round 4, spec S): lifecycle and keyboard
// checks that server rendering can't make, because effects, focus, events
// and timers must run. The scenarios are in tests/helpers/mounted-setup.mjs
// (the real SetupScreen with react-dom/client in tests/helpers/mini-dom.mjs,
// in a process of their own), with the structural leak gate in
// tests/helpers/setup-gate.mjs:
//   - keyboard-only reordering through the handle (Esc restores), ↑ ↓;
//   - the help panel: missing modes first, one rule, its evidence row, an
//     edit «до змін», a mode finding, hints, asides folding on a check;
//   - the reveal on the board and «Моя відповідь», success with the
//     learner's script (copy, «⋯»), the deck's ✓;
//   - recall by keyboard (each line's Enter, focus on, hints, unlocking,
//     done, its reveal, skip, a weak secret kept out of the copy), the
//     three lines hidden everywhere until typed; navigation restoration;
//   - the three decks, DR-3's two copy parts around the login check;
//   - the gate after each step, and injected structural and lifecycle leaks
//     it must catch; no React warnings.
// tools/test.sh runs the helper first and passes its results file; direct
// `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-setup.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_SETUP_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_SETUP_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted setup screen: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 509, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted setup: ${r.name}`, () => assert.ok(r.ok, r.detail));
