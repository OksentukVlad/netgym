// The VLAN screen mounted (VLAN-1 spec §4, brief item 6): lifecycle checks
// that server rendering can't make, because effects and events must run.
// The scenarios are in tests/helpers/mounted-vlan.mjs; they mount the real
// VlanScreen with react-dom/client in a small test DOM
// (tests/helpers/mini-dom.mjs), in a process of their own:
//   - «Куди дійде кадр»: commit and lock, the walk, «Ще ні» without per-PC
//     marks, all rounds then the domains, «Ще одна» levels 0 → 1 → 2, the
//     syntax switch's separate instances;
//   - «Налаштуй порти»: parse on blur, live commands, Enter checks, a form
//     failure's marks, a behaviour failure's walk, a success's domains and
//     tips, drafts per syntax with no verdict across a switch, the hints and
//     the reveal;
//   - no React warnings.
// tools/test.sh runs the helper first and passes its results file; direct
// `node --test` spawns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./helpers/mounted-vlan.mjs', import.meta.url));
const run = process.env.NETGYM_MOUNTED_VLAN_RESULTS
  ? { status: 0, stdout: readFileSync(process.env.NETGYM_MOUNTED_VLAN_RESULTS, 'utf8'), stderr: '' }
  : spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 240000, cwd: fileURLToPath(new URL('..', import.meta.url)) });
let results = null;
try { results = JSON.parse(run.stdout.trim().split('\n').at(-1)).results; } catch { results = null; }

test('mounted VLAN screen: the scenarios ran to the end', () => {
  assert.equal(run.status, 0, `exit ${run.status} ${run.signal ?? ''}\n${run.stderr}`);
  assert.ok(Array.isArray(results) && results.length >= 100, `results: ${results?.length}\n${run.stdout.slice(-500)}`);
});

for (const r of results ?? []) test(`mounted VLAN: ${r.name}`, () => assert.ok(r.ok, r.detail));
