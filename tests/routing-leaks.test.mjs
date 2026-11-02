import { withReadOnlyLogic } from './helpers/read-only-logic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tasks from '../src/banks/routing/tasks.js';
import routing, { textFor, checkRow, describeTrace, presentCheck } from './helpers/routing.mjs';
import { rowVerdict } from '../src/sections/routing/logic/rowReasons.js';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { scoreOf } from '../src/ui/exercise-state.js';
import { ui } from '../src/sections/routing/uk.js';
import { createLeakSweep, instanceAddresses, leaks, normalise, wrongAnswers } from './helpers/routing-leaks.mjs';

import { formatCode } from '../src/sections/routing/logic/codes.js';
import { shortest } from './helpers/routing-review.mjs';
import { bankId, bankRevision } from '../src/banks/routing/tasks.js';
import * as h from '../.test-bundles/harness/contract.mjs';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';

const inspectLeaks = createLeakSweep();

// Use the parser already installed with the pinned Vite toolchain. Inspecting
// syntax, rather than call spelling, also catches imports renamed to reveal().
const require = createRequire(new URL('../shell/frontend/package.json', import.meta.url));
const { parse } = require(process.env.NETGYM_TEST_NODE_MODULES ? `${process.env.NETGYM_TEST_NODE_MODULES}/@babel/parser` : '@babel/parser');

const referencePermissions = {
  referenceRoutes: ['logic/static.js', 'logic/table-tools.js', 'logic/faults.js'],
  solution: ['logic/static.js', 'logic/optimise.js', 'logic/generated.js', 'screens/RouterCard.jsx', 'logic/faults.js', 'logic/faults-exercise.js', 'logic/faults-state.js', 'logic/faults-frozen.js'],
  // The explicit reveal API owns frozen data. Its one UI caller is the
  // «Показати найкоротший варіант» hook (gated by the earned exact instance).
  shortest: ['logic/review.js', 'screens/useShortestReveal.js'],
  frozen: ['logic/review.js', 'logic/generated.js', 'logic/faults-frozen.js', 'logic/faults-templates.js'],
  frozenFor: ['logic/review.js', 'logic/generated.js'],
};
function referenceAccess(file, source) {
  const violations = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    const name = node.type === 'Identifier' ? node.name : node.type === 'StringLiteral' ? node.value : null;
    const pattern = Object.hasOwn(referencePermissions, name) ? name
      : name === 'faultsFrozen' || (typeof name === 'string' && /(?:^|\/)(?:optimiser|faults)-results\.(?:json|js)$/.test(name)) ? 'frozen' : null;
    if (pattern && !referencePermissions[pattern].includes(file)) violations.add(pattern);
    for (const [key, child] of Object.entries(node)) {
      if (['comments', 'leadingComments', 'trailingComments', 'innerComments', 'loc'].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
  return [...violations];
}

function routingSources(root, directory = '') {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}${entry.name}`;
    return entry.isDirectory() ? routingSources(root, `${file}/`) : /\.(?:js|jsx|mjs)$/.test(file) ? [file] : [];
  });
}

function probe(store, record, variantId, syntax, seed = null) {
  let exposed;
  store.render(h.RoutingProbe, { record, variantId, syntax, seed, expose: value => { exposed = value; } });
  return exposed;
}

const attributes = html => [...html.matchAll(/(?:placeholder|title|aria-label|aria-description)="([^"]*)"/g)].map(m => m[1]);

/** One guided row's wrong-answer corpus (wrongAnswers): each wrong row typed
 * and checked through the screen's session hook, then its feedback, its
 * announcement and the checked row rendered in both syntaxes and scanned.
 * `seed`: the instance with other addresses (step 9), else the base. */
function wrongRows(task, record, variant, syntax, router, index, inspect, seed = null) {
  let wrong = 0, viewed = 0;
  for (const fields of wrongAnswers(task, router, index, syntax)) {
    const verdict = checkRow(task, router, index, fields, syntax.id);
    if (verdict.ok) continue;
    wrong++;
    const store = h.testStore({ syntax: syntax.id });
    let p = probe(store, record, variant.id, syntax.id, seed);
    assert.equal(p.ex.key, task.instanceKey, 'the probe runs on this instance');
    // The row's unchecked text: a guided draft keyed by its slot (step 6).
    p.ex.act({ type: 'draft', mode: 'guided', syntax: syntax.id, routeId: `${router}.row${index + 1}`, value: fields });
    p = probe(store, record, variant.id, syntax.id, seed);
    const checked = p.answers.check(router, index);
    // The form check runs before the frozen checkRow; it only ever adds a wrong field.
    const frozen = rowVerdict(verdict);
    assert.deepEqual(checked.detail, surfaces.rowCheck(task, router, index, fields, syntax).detail);
    for (const [field, ok] of Object.entries(checked.detail)) if (ok === true) assert.equal(frozen[field], true, field);
    const key = p.ex.key;
    const saved = store.state.instances[key];
    // Step 6: a row check is not an attempt and never decides solved.
    assert.deepEqual(scoreOf([saved]), { correct: 0, total: 16, presses: 0 });
    assert.deepEqual([saved.session.attempts, saved.session.status, saved.session.revealed], [0, 'working', false]);
    for (const view of syntaxList) {
      viewed++;
      p = probe(store, record, variant.id, view.id, seed);
      const shown = p.answers.resultOf(router, index);
      assert.equal(shown.ok, false);
      if (shown.detail) assert.ok(Object.values(shown.detail).every(v => typeof v === 'boolean'), 'no reference values reach feedback');
      const rendered = surfaces.renderFeedback(view, shown, router, index);
      inspect(task, rendered.visible, 'feedback', `${syntax.id}→${view.id} visible feedback`);
      inspect(task, rendered.announcement, 'feedback', `${syntax.id}→${view.id} announcement`);
      const html = surfaces.renderCheckedRow(task, view, router, routing.scaffold(task, view.id), index, shown, p.answers.valuesOf(router, index));
      inspect(task, html, 'text', `${syntax.id}→${view.id} actual checked row`);
      // The verdict sits beside «Перевірити», the reasons under it (step 6).
      const squeeze = text => normalise(text).replace(/\s+/g, '');
      // Round 4: the row is marked wrong and lists its reasons under its fields (no «❌ Помилка.» word, no row button).
      assert.ok(html.includes('class="ng-rt-row is-wrong"') && squeeze(html).includes(squeeze(rendered.reasons)), 'actual row renders the tested feedback');
      for (const attr of attributes(html)) inspect(task, attr, 'placeholder', `${syntax.id}→${view.id} checked attribute`);
      assert.equal(store.state.instances[key], saved, 'viewing reasons preserves score, attempts, completion and solved state');
    }
  }
  return { wrong, viewed };
}

test('routing leak gate: every rendered surface, wrong row and all four syntax combinations', t => h.withReadOnlyRouting(() => surfaces.withReadOnlyRouting(() => withReadOnlyLogic(routing, () => {
  let staticSurfaces = 0, feedbackSurfaces = 0, wrong = 0, viewed = 0, rows = 0;
  const inspect = (task, text, kind, label) => {
    if (kind === 'feedback') feedbackSurfaces++; else staticSurfaces++;
    assert.deepEqual(inspectLeaks(task, text, kind), [], `${task.variant.code} ${label}: ${normalise(text)}`);
  };
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    rows += Object.values(variant.scaffold).flat().length;
    for (const syntax of syntaxList) {
      const scaffold = routing.scaffold(task, syntax.id);
      for (const [name, value] of Object.entries({ title: variant.title, text: variant.text, recordText: record.text, topology: record.topology })) {
        inspect(task, textFor(value, syntax.id), name === 'topology' ? 'given' : 'text', `${syntax.id} ${name}`);
      }
      inspect(task, surfaces.renderTopology(task, syntax), 'given', `${syntax.id} diagram`);
      // Step 7: the opened Rules panel in both syntaxes, and the opened «Текстом».
      inspect(task, surfaces.renderRules(syntax), 'rules', `${syntax.id} expanded rules`);
      inspect(task, surfaces.renderTextEquivalent(task, syntax), 'text-equivalent', `${syntax.id} text equivalent`);
      for (const [router, list] of Object.entries(scaffold)) {
        const rowHtml = surfaces.renderRows(task, syntax, router, scaffold);
        inspect(task, rowHtml, 'text', `${syntax.id} ${router} headers`);
        for (const attr of attributes(rowHtml)) inspect(task, attr, 'placeholder', `${syntax.id} ${router} attribute`);
        // Step 6: free mode's own rows (no destination label) and their placeholders.
        const freeHtml = surfaces.renderRows(task, syntax, router, scaffold, null, {}, 'free');
        inspect(task, freeHtml, 'text', `${syntax.id} ${router} free rows`);
        for (const attr of attributes(freeHtml)) inspect(task, attr, 'placeholder', `${syntax.id} ${router} free attribute`);
        for (const row of list) inspect(task, row.label, 'text', `${syntax.id} scaffold label`);
        const card = surfaces.renderCard(task, syntax, router);
        inspect(task, card, 'given', `${syntax.id} ${router} card and hidden reveal`);
        // The interface card lines, one per interface, are in what the gate reads (round 5: a link names
        // the routers at its other end, «до R2», instead of the bank's «→R2»).
        for (const iface of record.network.devices.find(d => d.id === router).interfaces) {
          const ip = iface.address ? `${iface.address.ip}/${iface.address.prefix}` : 'DHCP';
          const segment = record.network.segments.find(s => s.id === iface.segmentId);
          const peers = record.network.devices.filter(d => d.kind === 'router' && d.id !== router && d.interfaces.some(i => i.segmentId === iface.segmentId)).map(d => d.id);
          const note = segment.kind === 'link' && peers.length ? `до ${peers.join(', ')}` : iface.note ?? segment.name;
          assert.ok(normalise(card).includes(`${iface.labels[syntax.id]} · ${note} · ${ip}`), `${syntax.id} ${router} card line`);
        }
        assert.ok(!normalise(card).includes(ui.shared.copy), 'no copy control or payload before reveal');
        for (const attr of attributes(card)) inspect(task, attr, 'placeholder', `${syntax.id} card attribute`);

        const screenStore = h.testStore({ syntax: syntax.id });
        screenStore.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router, variants: { [record.id]: variant.id } } });
        const screen = screenStore.render(h.RoutingScreen, { bank: h.routingBank });
        inspect(task, screen, 'given', `${syntax.id} full screen (diagram/interface givens)`);
        // Without a bar the screen renders its bar controls in place, so the gate reads them too.
        assert.ok(screen.includes('aria-label="Синтаксис"') && screen.includes('aria-label="Режим"'), 'bar controls in the scanned screen');
        for (const attr of attributes(screen)) inspect(task, attr, 'placeholder', `${syntax.id} screen attribute`);
        assert.ok(!normalise(screen).includes(ui.shared.copy));

        for (const index of list.keys()) {
          const counts = wrongRows(task, record, variant, syntax, router, index, inspect);
          wrong += counts.wrong; viewed += counts.viewed;
        }
      }
    }
  }
  assert.equal(rows, 143); // 121 historical rows plus task 17’s 22 rows, including its discard.
  assert.equal(viewed, wrong * 2);
  t.diagnostic(JSON.stringify({ tasks: tasks.length, variants: tasks.flatMap(r => r.variants).length, rows, wrongAnswers: wrong, checkViewCases: viewed, feedbackSurfaces, otherSurfaces: staticSurfaces, totalSurfaces: feedbackSurfaces + staticSurfaces }));
}))));

// Step 6 (spec §7): the rendered check area after a network check, in both
// modes and syntaxes: the strip, the drawn path, the success block and
// demonstrations on the screen; all three hints open (rungs 1–2 names only,
// rung 3 as designated example content); «Усі перевірки» and «Шлях пакета»
// opened; the other syntax's commands only as the submitted routes (kind 3).
test('routing leak gate, step 6: the check area, hints, the list, the path text and the success block, rendered', t => h.withReadOnlyRouting(() => surfaces.withReadOnlyRouting(() => withReadOnlyLogic(routing, () => {
  let surfacesChecked = 0, screens = 0;
  const inspect = (task, text, kind, label, context) => {
    surfacesChecked++;
    assert.deepEqual(inspectLeaks(task, text, kind, context), [], `${task.variant.code} ${label}: ${normalise(text)}`);
  };
  // Round 4: the help panel folds the opened rungs under «Підказки (3)» while the verdict is current.
  const rungs = /<ol class="ng-hints-list ng-help-folded">([\s\S]*?)<\/ol>/;
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const reference = routing.solution(task);
    const answers = [{}, reference, ...Object.keys(reference).map(r => ({ ...reference, [r]: [] }))];
    for (const syntax of syntaxList) for (const answer of answers) {
      const result = routing.check(task, answer);
      const view = presentCheck(task, result, syntax.id);
      for (const mode of ['guided', 'free']) {
        const store = h.testStore({ syntax: syntax.id, mode });
        const router = Object.keys(reference)[0];
        store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router, variants: { [record.id]: variant.id } } });
        const act = action => store.dispatch({ type: 'instance', key: task.instanceKey, action });
        act({ type: 'checked', answer, result });
        for (let i = 0; i < 3; i++) act({ type: 'session', action: { type: 'hint' } });
        if (result.ok) act({ type: 'view', patch: { proven: JSON.stringify(answer) } });
        const html = store.render(h.RoutingScreen, { bank: h.routingBank });
        screens++;
        const ladder = html.match(rungs);
        assert.ok(ladder, 'all three hints open');
        const items = [...ladder[1].matchAll(/<li data-help="hint"><b>Підказка (\d) з 3\.<\/b> ([\s\S]*?)<\/li>/g)];
        assert.equal(items.length, 3);
        for (const [, n, text] of items) inspect(task, text, n === '3' ? 'example' : n === '1' ? 'hint-question' : 'hint-evidence', `${syntax.id} ${mode} rung ${n}`);
        const rest = html.replace(rungs, '');
        inspect(task, rest, 'given', `${syntax.id} ${mode} checked screen`);
        for (const attr of attributes(rest)) inspect(task, attr, 'placeholder', `${syntax.id} ${mode} checked attribute`);
        // Round 4: the panel's verdict sentence (presentCheck's words) is what the strip was.
        const strip = rest.match(/<p class="ng-help-summary[^"]*">([\s\S]*?)<\/p>/)[1];
        inspect(task, strip, 'strip', `${syntax.id} ${mode} strip`);
        assert.ok(normalise(strip).includes(normalise(view.ok ? 'Мережа працює' : view.firstFailure?.text || view.strip)), 'the verdict says presentCheck’s words');
        assert.equal(rest.includes('class="ng-rt-success"'), result.ok, 'the success block only on success');
        for (const demo of view.demonstrations) {
          assert.ok(normalise(rest).includes(normalise(demo.text)), 'the demonstration is on the screen');
          inspect(task, demo.text, 'demonstration', `${syntax.id} ${mode} demonstration`);
        }
      }
      inspect(task, surfaces.renderChecks(task, syntax, result), 'strip', `${syntax.id} opened list`);
      const path = view.firstFailure?.probe ? describeTrace(result.evidence.probes.find(p => p.id === view.firstFailure.probe.id && p.scenarioId === view.firstFailure.scenarioId), task.network, syntax.id) : describeTrace(result.evidence, task.network, syntax.id);
      inspect(task, surfaces.renderPathText([...new Set(path)]), 'path', `${syntax.id} «Шлях пакета»`);
      if (result.ok) {
        // Kind 3: exactly the submitted routes, as commands of the other syntax.
        const other = syntaxList.find(x => x.id !== syntax.id);
        const lines = surfaces.otherSyntaxBlocks(answer, other).flatMap(b => b.lines).join('\n');
        const plain = Object.fromEntries(Object.entries(answer).map(([r, rows]) => [r, rows.map(({ dst, prefix, via, discard, distance }) => ({ dst, prefix, ...(discard === true ? { discard: true } : { via }), ...(distance > 1 ? { distance } : {}) }))]));
        inspect(task, lines, 'submitted', `${syntax.id} other syntax`, { answer: plain, syntax: other.id });
      }
    }
  }
  t.diagnostic(JSON.stringify({ screens, surfaces: surfacesChecked }));
}))));

// Step 9 (spec step 9 R7): the same gate on «Інші адреси» instances, one seed
// per variant, with the instance's own address set: the givens, rows and
// cards, the full screen on that instance, network checks of an empty answer,
// the reference, partial answers (each router left empty), task 17 without
// its discard and a passing answer that isn't the reference (the known
// shortest table), in both modes with every hint open, «Усі перевірки» and
// «Шлях пакета» for each; after a pass, the other syntax's commands and their
// copy payload, read against the submission itself. Also the code field's
// four refusals, the copy payload (the code) and every accessible name and
// title. And the isolation the screen promises: none of the base task's
// addresses on a generated instance's screen.
const generatedSeed = index => (index * 2647 + 4821) % 10000;
/** Routes as the commands show them: no ids, slots, hints or default distance. */
const plainRoutes = answer => Object.fromEntries(Object.entries(answer).map(([r, rows]) => [r, rows.map(({ dst, prefix, via, discard, distance }) => ({ dst, prefix, ...(discard === true ? { discard: true } : { via }), ...(distance > 1 ? { distance } : {}) }))]));
test('routing leak gate, step 9: generated instances, one seed per variant, with the instance’s own addresses', t => h.withReadOnlyRouting(() => surfaces.withReadOnlyRouting(() => withReadOnlyLogic(routing, () => {
  let checked = 0, screens = 0;
  const inspect = (task, text, kind, label, context) => {
    checked++;
    assert.deepEqual(inspectLeaks(task, text, kind, context), [], `${task.variant.code}/${task.identity.seed} ${label}: ${normalise(text)}`);
  };
  const dotted = text => normalise(text).match(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d]|\.\d)/g) ?? [];
  // Round 4: the help panel folds the opened rungs under «Підказки (3)» while the verdict is current.
  const rungs = /<ol class="ng-hints-list ng-help-folded">([\s\S]*?)<\/ol>/;
  let nonReference = 0;
  for (const [index, record] of tasks.entries()) for (const variant of record.variants) {
    const seed = generatedSeed(index);
    const task = routing.create(record, { variantId: variant.id, seed, bankId, bankRevision });
    assert.equal(task.identity.seed, seed);
    const base = routing.create(record, { variantId: variant.id, bankId, bankRevision });
    const own = instanceAddresses(task);
    const foreign = [...instanceAddresses(base)].filter(ip => ip !== '0.0.0.0' && !own.has(ip));
    const isolated = (html, label) => {
      const stray = dotted(html).filter(ip => foreign.includes(ip));
      assert.deepEqual(stray, [], `${variant.code}/${seed} ${label}: a base address on the generated instance`);
    };
    const code = formatCode(task.identity);
    assert.equal(code, `A${variant.code}-${String(seed).padStart(4, '0')}`);
    // Fixed sentences and the code: no reference command, destination or
    // instance address ('feedback' would read the bad-seed message's «від 1
    // до 4 цифр» as a reference distance).
    for (const kind of ['text', 'placeholder']) inspect(task, code, kind, `copy payload (${kind})`);
    for (const message of Object.values(ui.address.codeErrors)) for (const kind of ['text', 'placeholder']) inspect(task, message, kind, `code field refusal (${kind})`);
    const reference = routing.solution(task);
    const known = shortest(task);
    const sameRoutes = (a, b) => JSON.stringify(plainRoutes(a)) === JSON.stringify(plainRoutes(b));
    const submissions = [['nothing checked', null], ['empty', {}], ['reference', reference],
      ...Object.keys(reference).map(r => [`partial, ${r} empty`, { ...reference, [r]: [] }]),
      ...(Object.values(reference).flat().some(r => r.discard === true)
        ? [['missing discard', Object.fromEntries(Object.entries(reference).map(([r, rows]) => [r, rows.filter(x => x.discard !== true)]))]] : []),
      ...(sameRoutes(known, reference) ? [] : [['known shortest, not the reference', known]]),
      // A router whose routes all go to one neighbour, given one default route there instead, where that passes.
      ...Object.entries(reference).flatMap(([r, rows]) => {
        const vias = new Set(rows.map(x => x.via));
        if (!rows.length || rows.some(x => x.discard === true || x.prefix === 0) || vias.size !== 1) return [];
        const answer = { ...reference, [r]: [{ id: `${r}.default`, dst: '0.0.0.0', prefix: 0, via: rows[0].via }] };
        return routing.check(task, answer).ok ? [[`${r} by a default route`, answer]] : [];
      })];
    if (record.displayNumber === 17) assert.ok(submissions.some(([name]) => name === 'missing discard'));
    for (const syntax of syntaxList) {
      const scaffold = routing.scaffold(task, syntax.id);
      for (const [name, value] of Object.entries({ title: task.variant.title, text: task.variant.text, recordText: task.record.text, topology: task.record.topology })) {
        inspect(task, textFor(value, syntax.id), name === 'topology' ? 'given' : 'text', `${syntax.id} ${name}`);
        isolated(textFor(value, syntax.id), `${syntax.id} ${name}`);
      }
      inspect(task, surfaces.renderTopology(task, syntax), 'given', `${syntax.id} diagram`);
      inspect(task, surfaces.renderTextEquivalent(task, syntax), 'text-equivalent', `${syntax.id} text equivalent`);
      for (const router of Object.keys(scaffold)) {
        for (const mode of ['guided', 'free']) {
          const rows = surfaces.renderRows(task, syntax, router, scaffold, null, {}, mode);
          inspect(task, rows, 'text', `${syntax.id} ${router} ${mode} rows`);
          for (const attr of attributes(rows)) inspect(task, attr, 'placeholder', `${syntax.id} ${router} ${mode} row attribute`);
        }
        const card = surfaces.renderCard(task, syntax, router);
        inspect(task, card, 'given', `${syntax.id} ${router} card and hidden reveal`);
        isolated(card, `${syntax.id} ${router} card`);
        for (const attr of attributes(card)) inspect(task, attr, 'placeholder', `${syntax.id} ${router} card attribute`);
      }
      // The screen on this instance, as the place gives it (its seed for the task).
      const router = Object.keys(reference)[0];
      const place = { taskId: record.id, router, variants: { [record.id]: variant.id }, seeds: { [record.id]: seed } };
      for (const [name, answer] of submissions) for (const mode of ['guided', 'free']) {
        const store = h.testStore({ syntax: syntax.id, mode });
        store.dispatch({ type: 'place', scope: 'routing', patch: place });
        let html = store.render(h.RoutingScreen, { bank: h.routingBank });
        if (answer) {
          const result = routing.check(task, answer);
          const act = action => store.dispatch({ type: 'instance', key: task.instanceKey, action });
          act({ type: 'checked', answer, result });
          for (let i = 0; i < 3; i++) act({ type: 'session', action: { type: 'hint' } });
          if (name === 'missing discard') assert.equal(result.ok, false, 'task 17 without its discard fails');
          if (result.ok) act({ type: 'view', patch: { proven: JSON.stringify(answer) } });
          html = store.render(h.RoutingScreen, { bank: h.routingBank });
          const ladder = html.match(rungs);
          assert.ok(ladder, 'all three hints open');
          for (const [, n, text] of ladder[1].matchAll(/<li data-help="hint"><b>Підказка (\d) з 3\.<\/b> ([\s\S]*?)<\/li>/g)) {
            inspect(task, text, n === '3' ? 'example' : n === '1' ? 'hint-question' : 'hint-evidence', `${syntax.id} ${mode} rung ${n}`);
          }
          html = html.replace(rungs, '');
          const strip = html.match(/<p class="ng-help-summary[^"]*">([\s\S]*?)<\/p>/)[1];
          inspect(task, strip, 'strip', `${syntax.id} ${mode} ${name} strip`);
          assert.equal(html.includes('class="ng-rt-success"'), result.ok);
        }
        screens++;
        const plain = normalise(html);
        // Round 4: the heading is the title only; the code is in «⋯» (the heading carries it as data).
        assert.ok(html.includes(`data-variant="${variant.code}" data-code="${code}"`), `${variant.code}/${seed}: the instance's code`);
        assert.ok(plain.includes('Та сама задача з іншими адресами'), 'the subtitle');
        inspect(task, html, 'given', `${syntax.id} ${mode} ${name} screen`);
        isolated(html, `${syntax.id} ${mode} ${name} screen`);
        for (const attr of attributes(html)) inspect(task, attr, 'placeholder', `${syntax.id} ${mode} ${name} screen attribute`);
      }
      const other = syntaxList.find(x => x.id !== syntax.id);
      for (const [name, answer] of submissions.filter(([, answer]) => answer)) {
        const result = routing.check(task, answer), view = presentCheck(task, result, syntax.id);
        inspect(task, surfaces.renderChecks(task, syntax, result), 'strip', `${syntax.id} ${name}: opened list`);
        const path = view.firstFailure?.probe ? describeTrace(result.evidence.probes.find(p => p.id === view.firstFailure.probe.id && p.scenarioId === view.firstFailure.scenarioId), task.network, syntax.id) : describeTrace(result.evidence, task.network, syntax.id);
        inspect(task, surfaces.renderPathText([...new Set(path)]), 'path', `${syntax.id} ${name}: «Шлях пакета»`);
        for (const demo of view.demonstrations) inspect(task, demo.text, 'demonstration', `${syntax.id} ${name}: demonstration`);
        if (!result.ok) continue;
        // Kind 3, read against this submission: its own routes, shown and
        // copied in the other syntax, and nothing else.
        const lines = surfaces.otherSyntaxBlocks(answer, other).flatMap(b => b.lines).join('\n');
        inspect(task, lines, 'submitted', `${syntax.id} ${name}: other syntax`, { answer: plainRoutes(answer), syntax: other.id });
        const payload = surfaces.otherSyntaxPayload(answer, other);
        const commands = payload.split('\n').filter(line => line && !/^[!#] /.test(line)).join('\n');
        inspect(task, commands, 'submitted', `${syntax.id} ${name}: other syntax copy payload`, { answer: plainRoutes(answer), syntax: other.id });
        assert.deepEqual(payload.split('\n').filter(line => /^[!#] /.test(line)), Object.entries(answer).filter(([, rows]) => rows.length).map(([r]) => `${other.id === 'cisco' ? '!' : '#'} ${r}`));
        if (name !== 'reference') {
          nonReference++;
          const own = new Set(Object.values(plainRoutes(answer)).flat().map(r => normalise(other.command(r))));
          const referenceOnly = Object.values(plainRoutes(reference)).flat().map(r => normalise(other.command(r))).filter(c => !own.has(c));
          assert.ok(referenceOnly.every(c => !normalise(payload).includes(c)), `${variant.code} ${name}: no reference-only command copied`);
        }
      }
    }
  }
  assert.ok(nonReference >= 20, `passing non-reference submissions read: ${nonReference}`);
  t.diagnostic(JSON.stringify({ variants: tasks.flatMap(r => r.variants).length, screens, surfaces: checked, passingNonReference: nonReference }));
}))));

// The row corpus of the first test (every guided row's wrong answers, checked
// and viewed in both syntaxes) on the same generated instances.
test('routing leak gate, step 9: every guided row’s wrong answers on a generated instance, all four syntax combinations', t => h.withReadOnlyRouting(() => surfaces.withReadOnlyRouting(() => withReadOnlyLogic(routing, () => {
  let wrong = 0, viewed = 0, surfacesChecked = 0;
  const inspect = (task, text, kind, label) => {
    surfacesChecked++;
    assert.deepEqual(inspectLeaks(task, text, kind), [], `${task.variant.code}/${task.identity.seed} ${label}: ${normalise(text)}`);
  };
  for (const [index, record] of tasks.entries()) for (const variant of record.variants) {
    const seed = generatedSeed(index);
    const task = routing.create(record, { variantId: variant.id, seed, bankId, bankRevision });
    for (const syntax of syntaxList) for (const [router, list] of Object.entries(routing.scaffold(task, syntax.id))) {
      for (const row of list.keys()) {
        const counts = wrongRows(task, record, variant, syntax, router, row, inspect, seed);
        wrong += counts.wrong; viewed += counts.viewed;
      }
    }
  }
  assert.equal(viewed, wrong * 2);
  assert.ok(wrong > 10000, `wrong rows: ${wrong}`);
  t.diagnostic(JSON.stringify({ wrongAnswers: wrong, checkViewCases: viewed, surfaces: surfacesChecked }));
}))));

// The gate's matcher really reads the instance: a generated address in a
// placeholder fails, and so does a base address shown on a generated screen.
test('routing leak gate, step 9: the generated instance’s own addresses are caught', () => {
  const task = routing.create(tasks[0], { variantId: 'main', seed: 4821, bankId, bankRevision });
  const lan = task.network.devices.find(d => d.id === 'R2').interfaces.find(f => f.segmentId === 'segment-3').address.ip;
  assert.ok(inspectLeaks(task, `напр. ${lan}`, 'placeholder').includes('bank-address-in-placeholder'));
  const route = task.variant.referenceRoutes.R1[0];
  assert.ok(inspectLeaks(task, `${route.dst} ${route.via}`).includes('destination-and-gateway'));
  assert.deepEqual(leaks(routing.create(tasks[0]), `${route.dst} ${route.via}`), [], 'the base task doesn’t know the generated values');
});

const fixtures = [
  { name: 'ping prints the internal endpoint', kind: 'ping', text: 'Пакет до 198.19.255.254', code: 'address-in-names-only' },
  { name: 'strip prints the supplied peer', kind: 'strip', text: 'Шлюз 198.18.0.1', code: 'address-in-names-only' },
  { name: 'path prints an interface id', kind: 'path', text: 'R1.if1 → R2', code: 'interface-in-names-only' },
  { name: 'demonstration prints an old documentation endpoint', kind: 'demonstration', text: 'Пакет до 203.0.113.1', code: 'address-in-names-only' },

  { name: 'feedback prints gateway', kind: 'feedback', text: 'Next-hop має бути 10.0.0.2.', code: 'reference-value-in-feedback' },
  { name: 'placeholder prints reference address', kind: 'placeholder', text: 'напр. 192.168.2.0', code: 'bank-address-in-placeholder' },
  { name: 'hint prints command', kind: 'text', text: 'Впиши ip route 192.168.2.0 255.255.255.0 10.0.0.2', code: 'reference-command' },
  { name: 'rules example uses a bank address', kind: 'rules', text: 'МЕРЕЖА = адреса мережі призначення. Напр. для 192.168.2.10/24 → 192.168.2.0.', code: 'non-documentation-address' },
  { name: 'text equivalent names the provider’s address', kind: 'text-equivalent', text: 'ISP1 (основний) 1.1.1.0/30: R1 g0/0 1.1.1.2/30 — ISP1 1.1.1.1', code: 'address-not-on-diagram', task: 14 },
];
for (const fixture of fixtures) test(`routing leak fixture fails: ${fixture.name}`, () => {
  const task = routing.create(tasks[fixture.task ?? 0]);
  const rendered = surfaces.renderLeakFixture(fixture.kind, fixture.text);
  const surface = fixture.kind === 'placeholder' ? attributes(rendered)[0] : rendered;
  assert.ok(inspectLeaks(task, surface, fixture.kind).includes(fixture.code));
  assert.throws(() => assert.deepEqual(inspectLeaks(task, surface, fixture.kind), []), assert.AssertionError);
});

test('routing leak matcher: normalised markup, address boundaries, summaries, defaults and alternatives', () => {
  const task = routing.create(tasks[0]);
  assert.ok(inspectLeaks(task, '192.168.2.0 \n <b>10.0.0.2</b>').includes('destination-and-gateway'));
  assert.deepEqual(inspectLeaks(task, '192.168.2.0 10.0.0.25'), []);
  assert.deepEqual(inspectLeaks(task, '10.0.0.25', 'feedback'), []);
  assert.ok(inspectLeaks(task, '192.168.1.1', 'placeholder').includes('bank-address-in-placeholder'), 'placeholder addresses are checked against the exact instance');
  assert.ok(leaks(routing.create(tasks[5]), '10.10.0.0 / 23').includes('hidden-destination'));
  assert.ok(leaks(routing.create(tasks[12]), '10.0.0.0, маска 255.255.252.0').includes('hidden-destination'));
  assert.deepEqual(leaks(routing.create(tasks[12]), '10.0.0.0/24 10.0.1.0/24'), []);
  assert.ok(leaks(routing.create(tasks[1]), '0.0.0.0 / 0').includes('hidden-destination'));
  assert.deepEqual(leaks(routing.create(tasks[1]), '0.0.0.0', 'placeholder'), []);
  const triangle = routing.create(tasks[9]);
  for (const routes of Object.values(triangle.variant.referenceRoutes)) for (const route of routes) for (const via of route.alternatives ?? []) {
    assert.ok(leaks(triangle, `${route.dst} ${via}`).includes('destination-and-gateway'));
  }
  assert.ok(leaks(routing.create(tasks[14]), 'distance <b>1</b>.', 'feedback').includes('reference-distance-in-feedback'));
  // Rules (step 7): the generic RouterOS default is exempt only as the literal
  // the panel prints; a task's own default route, or its destination, still fails.
  assert.deepEqual(leaks(routing.create(tasks[1]), '/ip route add dst-address=0.0.0.0/0 gateway=[GATEWAY аплінку]', 'rules'), []);
  assert.ok(leaks(routing.create(tasks[1]), '/ip route add dst-address=0.0.0.0/0 gateway=172.16.0.1', 'rules').includes('reference-command'));
  assert.ok(leaks(routing.create(tasks[1]), 'dst-address=0.0.0.0/0', 'rules').includes('hidden-destination'));
  assert.ok(leaks(routing.create(tasks[0]), 'Напр. 10.0.0.0/30', 'rules').includes('non-documentation-address'));
  assert.deepEqual(leaks(routing.create(tasks[0]), '198.51.100.0/25 + 198.51.100.128/25 = 198.51.100.0/24 (маска 255.255.255.0)', 'rules'), []);
});

test('routing leak static guard: reference access only in the explicit reveal/command files; feedback takes codes and booleans', () => {
  const root = new URL('../src/sections/routing/', import.meta.url);
  const files = routingSources(root);
  assert.ok(files.includes('logic/review.js') && files.includes('screens/RouterCard.jsx') && files.includes('syntax/cisco.js'));
  const violations = files.flatMap(file => referenceAccess(file, readFileSync(new URL(file, root), 'utf8')).map(pattern => `${file}: ${pattern}`));
  assert.deepEqual(violations, []);
  const feedback = readFileSync(new URL('syntax/feedback.js', root), 'utf8');
  assert.match(feedback, /function reasonFeedback\(verdict, reasons = \{\}\)/);
  assert.doesNotMatch(feedback.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''), /\b(?:fields|reference)\b|\b(?:result|verdict)\.(?:net|mask|gw|cidr|dist)\b/);
  const reasons = readFileSync(new URL('logic/rowReasons.js', root), 'utf8');
  assert.doesNotMatch(reasons, /referenceRoutes|\bsolution\s*\(/);
  const facts = readFileSync(new URL('screens/facts.js', root), 'utf8');
  assert.doesNotMatch(facts, /referenceRoutes|\.label\b|\.via\b|\.distance\b/);
});

test('routing leak scan guard rejects aliased imports and keeps permissions specific to each pattern', () => {
  for (const file of ['syntax/cisco.js', 'syntax/mikrotik.js', 'screens/RouterCard.jsx', 'logic/nested/helper.js']) {
    for (const source of [
      'shortest (task);',
      "import { frozenFor as answers } from '../logic/generated.js'; answers(task);",
      "import { shortest as reveal } from '../logic/review.js'; reveal(task);",
      "import * as review from '../logic/review.js'; review['shortest'](task);",
      "export { shortest as reveal } from '../logic/review.js';",
      "import frozen from '../logic/optimiser-results.json';",
      "import { default as answers } from '../logic/optimiser-results.js';",
      "const answers = await import('../logic/optimiser-results.js');",
      "const answers = require('../logic/optimiser-results.json');",
      "import { faultsFrozen as answers } from '../../../banks/routing/tasks.js';",
      "import answers from '../../../banks/routing/faults-results.js';",
    ]) assert.ok(referenceAccess(file, source).length, `${file}: ${source}`);
  }
  for (const file of ['syntax/cisco.js', 'syntax/mikrotik.js', 'screens/nested/Helper.jsx']) {
    assert.ok(referenceAccess(file, "import { solution as reveal } from '../logic/static.js'; reveal(task);").includes('solution'));
    assert.ok(referenceAccess(file, "const { referenceRoutes: routes } = task.variant;").includes('referenceRoutes'));
  }
  assert.deepEqual(referenceAccess('screens/RouterCard.jsx', 'ex.solution[router];'), []);
  assert.deepEqual(referenceAccess('logic/review.js', "import frozen from './optimiser-results.js'; export function shortest(task) { return frozen; }"), []);
  assert.ok(referenceAccess('logic/review.js', 'solution(task);').includes('solution'));
  assert.ok(referenceAccess('logic/static.js', "import frozen from './optimiser-results.js';").includes('frozen'));
  assert.deepEqual(referenceAccess('logic/faults-frozen.js', 'solution(task); bank.faultsFrozen;'), []);
  assert.deepEqual(referenceAccess('logic/faults-templates.js', 'bank.frozen;'), []);
  assert.ok(referenceAccess('logic/faults-templates.js', 'solution(task);').includes('solution'));
});

test('routing leak scan guard descends into nested source directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'netgym-leak-scan-'));
  try {
    mkdirSync(join(root, 'logic/nested'), { recursive: true });
    writeFileSync(join(root, 'logic/nested/leak.js'), "import { shortest as reveal } from '../../review.js';");
    writeFileSync(join(root, 'ignored.css'), '/* not JavaScript */');
    const url = pathToFileURL(`${root}/`), files = routingSources(url);
    assert.deepEqual(files, ['logic/nested/leak.js']);
    assert.deepEqual(referenceAccess(files[0], readFileSync(new URL(files[0], url), 'utf8')), ['shortest']);
  } finally {
    rmSync(root, { recursive: true });
  }
});
