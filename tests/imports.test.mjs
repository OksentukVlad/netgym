import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/', import.meta.url));
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function violationsFor(path, source) {
  const violations = [];
  const parts = path.split('/'), area = parts[0];
  const logic = area === 'sections' && parts[2] === 'logic';
  const pure = path === 'ui/commit.js' || area === 'engine' || area === 'banks' || logic || (area === 'sections' && ['syntax', 'uk.js'].includes(parts[2]));
  const reactAllowed = ['ui', 'app', 'targets'].includes(area) || (area === 'sections' && parts[2] === 'screens');
  // Static imports, re-exports, literal dynamic imports and require calls.
  const imports = /\b(?:import\s+(?:[^'";]*?\s+from\s*)?|export\s+[^'";]*?\s+from\s*|(?:import|require)\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const [, specifier] of source.matchAll(imports)) {
    const target = relative(src, resolve(dirname(resolve(src, path)), specifier)).split('/');
    if (area === 'engine' && (!specifier.startsWith('.') || target[0] !== 'engine')) violations.push('engine imports outside engine');
    if (/^react(?:-dom)?(?:\/|$)/.test(specifier) && !reactAllowed) violations.push('React outside presentation');
    // W7 moves the second predict consumer's pure commitment reducer to ui.
    const sharedCommit = logic && target.join('/') === 'ui/commit.js';
    if (pure && !sharedCommit && (!specifier.startsWith('.') || ['ui', 'app', 'targets'].includes(target[0]))) violations.push('pure module imports presentation or external API');
    if (logic && target[0] === 'banks') violations.push('logic imports banks');
    // The one cross-section exception (round 7): «Перевірка мережі» diagnoses the DHCP scenarios, so its
    // logic reads the DHCP section's logic (client, faults, nat); nothing else may, and never the reverse.
    const checksReadsDhcp = parts[1] === 'checks' && target.slice(0, 3).join('/') === 'sections/dhcp/logic'
      && ['client.js', 'faults.js', 'nat.js'].includes(target[3]) && target.length === 4;
    if (logic && !sharedCommit && !checksReadsDhcp && !(target[0] === 'engine' || (target[0] === 'sections' && target[1] === parts[1] && ['logic', 'syntax', 'uk.js'].includes(target[2])))) violations.push('logic imports outside engine or its own logic');
    if (area === 'banks' && !['engine', 'banks'].includes(target[0])) violations.push('bank imports outside engine or banks');
    if (area === 'sections' && target[0] === 'sections' && target[1] !== parts[1] && !(logic && checksReadsDhcp)) violations.push('section imports another section');
    // ARCHITECTURE §5: ui imports engine (and itself), never sections, banks, app or targets.
    if (area === 'ui' && specifier.startsWith('.') && !['ui', 'engine'].includes(target[0])) violations.push('ui imports outside ui and engine');
    if (specifier.startsWith('.') && target[0] === '..') violations.push('import from outside src');
  }
  if (pure) {
    // Remove comments and literals before looking for browser or storage globals.
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '');
    if (/\b(?:window|document|navigator|history|localStorage|sessionStorage|indexedDB)\b/.test(code)) violations.push('pure module uses browser or storage');
    // Pure means repeatable: no clock and no unseeded randomness (rng.js is seeded).
    if (/\b(?:performance\s*\.|Date\s*\.\s*now|new\s+Date\b|Math\s*\.\s*random)/.test(code)) violations.push('pure module reads a clock or unseeded randomness');
  }
  return violations;
}

test('shared imports: engine, ui, sections and banks obey dependency and purity rules', () => {
  const violations = sourceFiles(src).flatMap(file => violationsFor(relative(src, file), readFileSync(file, 'utf8')).map(reason => `${relative(src, file)}: ${reason}`));
  assert.deepEqual(violations, []);
});

test('import guard rejects each forbidden direction and permits screens and targets', () => {
  for (const [path, source] of [
    ['engine/bad.js', "import x from '../ui/session.js'"],
    ['sections/vlan/logic/bad.js', "import x from '../../../ui/useExercise.js'"],
    ['ui/commit.js', "import React from 'react'"],
    ['ui/commit.js', 'document.querySelector("x")'],
    ['sections/ip/logic/bad.js', "import x from '../../../banks/routing/tasks.js'"],
    ['sections/ip/screens/Bad.jsx', "import x from '../../routing/logic/static.js'"],
    ['sections/ip/logic/bad.js', "import x from '../screens/Bad.jsx'"],
    ['banks/bad.js', "import x from '../sections/ip/screens/Bad.jsx'"],
    ['sections/ip/syntax/bad.js', "import React from 'react'"],
    ['banks/bad.js', 'localStorage.getItem("x")'],
    ['engine/bad.js', 'document.querySelector("x")'],
    ['sections/ip/logic/bad.js', 'navigator.clipboard.writeText("x")'],
    ['ui/bad.js', "export { default } from '../../apps/cisco-routing/App.jsx'"],
    ['targets/bad.js', "import x from '../../apps/ip-calculator/App.jsx'"],
    ['ui/components/Bad.jsx', "import routing from '../../sections/routing/logic/static.js'"],
    ['ui/components/Bad.jsx', "import { syntaxes } from '../../sections/routing/syntax/index.js'"],
    ['ui/bad.js', "import { tasks } from '../banks/routing/tasks.js'"],
    ['ui/topology/bad.js', "export * from '../../banks/routing/tasks.js'"],
    ['ui/bad.js', "const x = await import('../app/store.js')"],
    ['ui/bad.js', "import target from '../targets/netgym.js'"],
    ['sections/firewall/logic/bad.js', "import { cards } from '../../../banks/firewall/cards.js'"],
    ['sections/firewall/logic/bad.js', "import React from 'react'"],
    ['sections/firewall/logic/bad.js', 'localStorage.getItem("answer")'],
    ['sections/firewall/logic/bad.js', "import x from '../../routing/logic/static.js'"],
    ['banks/firewall/bad.js', "import x from '../../sections/firewall/logic/evaluate.js'"],
    // The checks → DHCP exception is one-way and names three modules only.
    ['sections/dhcp/logic/bad.js', "import x from '../../checks/logic/probes.js'"],
    ['sections/checks/logic/bad.js', "import x from '../../dhcp/logic/server.js'"],
    ['sections/checks/logic/bad.js', "import x from '../../dhcp/uk.js'"],
    ['sections/checks/logic/bad.js', "import x from '../../dhcp/screens/url.js'"],
    ['sections/checks/screens/Bad.jsx', "import x from '../../dhcp/logic/client.js'"],
    ['sections/checks/logic/bad.js', "import x from '../../routing/logic/static.js'"],
  ]) assert.ok(violationsFor(path, source).length, `${path}: ${source}`);
  for (const [path, source] of [
    ['sections/vlan/logic/good.js', "import { createCommitFlow } from '../../../ui/commit.js'"],
    ['sections/firewall/logic/good.js', "import { createCommitFlow } from '../../../ui/commit.js'"],
    ['sections/ip/screens/Good.jsx', "import React from 'react'"],
    ['sections/routing/logic/good.js', "import x from '../../../engine/ip.js'"],
    ['targets/good.js', "import x from '../sections/ip/screens/CalculatorScreen.jsx'"],
    ['banks/routing/good.js', "import x from '../../engine/ip.js'"],
    ['ui/components/Good.jsx', "import { useMemo } from 'react'; import Button from './Button.jsx'; import '../tokens.css'"],
    ['ui/topology/good.js', "import { toInt } from '../../engine/ip.js'"],
    ['ui/good.js', "import { sessionReducer } from './session.js'"],
    ['sections/firewall/logic/good.js', "import { makeRng } from '../../../engine/rng.js'"],
    ['sections/firewall/logic/good.js', "import { evaluate } from './evaluate.js'"],
    ['banks/firewall/good.js', "import { topology } from './topology.js'"],
    ['sections/checks/logic/good.js', "import { acquire } from '../../dhcp/logic/client.js'"],
    ['sections/checks/logic/good.js', "import { createFault } from '../../dhcp/logic/faults.js'"],
    ['sections/checks/logic/good.js', "import { translate } from '../../dhcp/logic/nat.js'"],
  ]) assert.deepEqual(violationsFor(path, source), [], path);
});

test('app and targets: nothing imports from outside src; app reaches sections and banks only through targets', () => {
  const repo = resolve(src, '..');
  const violations = [];
  const imports = /\b(?:import\s+(?:[^'";]*?\s+from\s*)?|export\s+[^'";]*?\s+from\s*|(?:import|require)\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const file of sourceFiles(src)) {
    const area = relative(src, file).split(sep)[0];
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(imports)) {
      if (!specifier.startsWith('.')) continue;
      const [top, sub] = relative(repo, resolve(dirname(file), specifier)).split(sep);
      if (top !== 'src') violations.push(`${relative(src, file)} imports from outside src: ${specifier}`);
      if (area === 'app' && top === 'src' && ['sections', 'banks', 'targets'].includes(sub)) {
        violations.push(`${relative(src, file)} imports ${sub} directly (use a target manifest): ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

// Besides useExercise, the firewall's reveal path (FW-1 screen spec v2 S3,
// S5 g): «Показати відповідь» commits one card with its reference selection.
// firewall-screen.test.mjs checks that only revealCard calls it, and that the
// screen never does before a reveal.
test('the reveal path: only useExercise (once revealed) and the firewall’s revealCard call a logic’s solution() (ARCHITECTURE §5)', () => {
  const calls = sourceFiles(src).filter(file => !relative(src, file).split(sep).includes('logic'))
    .flatMap(file => [...readFileSync(file, 'utf8').matchAll(/^.*\bsolution\s*\(.*$/gm)].map(m => `${relative(src, file)}: ${m[0].trim()}`));
  assert.deepEqual(calls.sort(), [
    'sections/firewall/screens/reveal.js: const selection = logic.solution(task)[cardId];',
    'ui/useExercise.js: const solution = useMemo(() => (session.revealed ? logic.solution(task) : null), [logic, task, session.revealed]);',
  ]);
});
