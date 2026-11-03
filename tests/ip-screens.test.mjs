// The step 8 IP screens rendered with react-dom/server (the bundled harness
// tests/harness/ip-screens.jsx):
//   - the calculator's rows, lines, bits and command payloads for /0–/32,
//     the gateway convention and the last valid result while a field is
//     invalid (spec S2, S3);
//   - the binary walk's provenance-aware leak gate (S5): every rendered
//     surface before the reveal, for 200 seeds, every step, both input
//     modes, all hint rungs, a wrong check and the finished walk;
//   - the links (S7): «Відкрити в калькуляторі» only inside the shell and
//     only once the task is finished, with the right params;
//   - the ruler for all four octets.
import test from 'node:test';
import { full, sweepSeeds } from './helpers/sweep-mode.mjs';
import witnesses from './fixtures/speed-witnesses-v1.json' with { type: 'json' };

const binarySeeds = sweepSeeds(Array.from({ length: 200 }, (_, i) => i), full ? [] : Object.values(witnesses.binary));
import assert from 'node:assert/strict';
import * as h from '../.test-bundles/harness/ip-screens.mjs';
import { renderAddress as cisco } from '../src/engine/vendors/cisco.js';
import { renderAddress as routeros } from '../src/engine/vendors/routeros.js';
import { t } from '../src/sections/ip/uk.js';
import { leaks } from './helpers/binary-leaks.mjs';

const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const decimal = octets => octets.map(o => parseInt(o, 2)).join('.');
const LINK = 'Відкрити в калькуляторі';

/** Elements carrying data-provenance (outermost), and the markup without them. */
function regions(html) {
  const found = [];
  let rest = '', at = 0;
  const open = /<([a-z]+)\b[^>]*\bdata-provenance="([^"]+)"[^>]*>/g;
  let m;
  while ((m = open.exec(html))) {
    if (m.index < at) continue;
    const tag = m[1];
    let depth = 1, i = m.index + m[0].length;
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
    re.lastIndex = i;
    let n;
    while (depth && (n = re.exec(html))) { depth += n[0].startsWith('</') ? -1 : n[0].endsWith('/>') ? 0 : 1; i = re.lastIndex; }
    found.push({ provenance: m[2], html: html.slice(m.index, i) });
    rest += html.slice(at, m.index);
    at = i;
    open.lastIndex = i;
  }
  return { found, rest: rest + html.slice(at) };
}

// ── The calculator ─────────────────────────────────────────────────────────

function calcHtml(place, nav) {
  const store = h.ipStore();
  store.dispatch({ type: 'place', scope: 'ip.calc', patch: { ip: '192.168.1.10', prefix: '/24', last: { ip: '192.168.1.10', prefix: '/24' }, gateway: 'first', bits: true, commands: true, ...place } });
  return unescape(store.render(h.CalculatorScreen, {}, nav));
}
/** A row's value (two for the device range), without the notes under it. */
const dd = (html, label) => {
  const cell = html.match(new RegExp(`<dt>${label}</dt><dd>(.*?)</dd>`))?.[1];
  return cell === undefined ? undefined : [...cell.matchAll(/<span class="ng-calc-value">(.*?)<\/span>/g)].map(m => m[1]).join(' – ');
};
const bitRows = html => [...new Set([...html.matchAll(/class="ng-bitrows-row is-(\w+)"/g)].map(m => m[1]))];
const copies = html => [...html.matchAll(/<pre class="ng-commands-pre" data-copy="(\w+)">(.*?)<\/pre>/g)].map(m => [m[1], m[2].replace(/<\/span>(?=<span)/g, '\n').replace(/<[^>]+>/g, '')]);

test('calculator: the default /24 host, its rows, first gateway and both command syntaxes', () => {
  const html = calcHtml({});
  assert.ok(html.includes('192.168.1.0/24</p>'));
  assert.equal(dd(html, 'Адреса мережі'), '192.168.1.0');
  assert.equal(dd(html, 'Маска'), '255.255.255.0 = /24');
  assert.equal(dd(html, 'Широкомовна адреса'), '192.168.1.255');
  assert.equal(dd(html, 'Адреси для пристроїв'), '192.168.1.1 – 192.168.1.254');
  assert.equal(dd(html, 'Місць для пристроїв'), '254 вузли');
  assert.ok(html.includes('<dt>Шлюз</dt><dd><span class="ng-calc-value">192.168.1.1</span>'));
  assert.ok(html.includes(t('calc.gateway')), 'the gateway caption');
  assert.deepEqual(copies(html), [
    ['cisco', cisco({ ip: '192.168.1.1', prefix: 24 })],
    ['routeros', routeros({ ip: '192.168.1.1', prefix: 24 })],
  ]);
  assert.ok(html.includes(t('calc.example-interface')));
  assert.deepEqual(bitRows(html), ['address', 'mask', 'network', 'broadcast']);
  // A whole-octet block has no ticks to mention (step 8 fix: no «поділки через 256»).
  assert.ok(html.includes('Лінійка: четверте число адреси від 0 до 255. Адреса: 10.') && !html.includes('через 256'));
  assert.ok(html.includes(`<dt>Місць для пристроїв</dt><dd><span><span class="ng-calc-value">254 вузли</span> <span class="ng-calc-count-what">(без адреси мережі та широкомовної)</span></span><p class="ng-calc-note">${t('calc.conventional-count')}</p></dd>`), 'the count says what it counts, and that it is plain arithmetic');
  assert.equal(t('calc.conventional-count'), 'Це проста арифметика: деякі діапазони адрес мають особливе призначення.');
  assert.ok(html.includes('class="ng-calc-stale" aria-live="polite"></p>'), 'the stale banner: an empty polite live region');
  assert.ok(html.indexOf('data-region="work"') < html.indexOf('data-region="stage"'), 'the inputs come first (one column, focus order)');
  assert.ok(html.includes('data-first="work"'));
  assert.ok(!html.includes('ng-exercise-bar'), 'a tool: no sticky check bar');
});

test('calculator (round 4 R3): the configuration example is folded by default; copying is off, with its reason, while an input is empty or malformed', () => {
  const folded = calcHtml({ commands: false });
  assert.ok(folded.includes('aria-expanded="false"') && folded.includes('Приклад конфігурації') && copies(folded).length === 0, 'folded: no commands in the page');
  assert.ok(folded.indexOf('Потренуватися') === -1 || folded.indexOf('Потренуватися') < folded.indexOf('Приклад конфігурації'), 'the practice link (in the shell) comes before the example');
  for (const place of [{ prefix: '' }, { prefix: '/2x' }, { ip: '' }, { ip: '10.0.0' }]) {
    const html = calcHtml(place);
    assert.ok(html.includes('class="ng-commands-off"') && html.includes('Копіювання вимкнено'), `${JSON.stringify(place)}: the reason in words`);
    assert.equal((html.match(/class="ng-commands-copy" aria-disabled="true"/g) ?? []).length, 2, `${JSON.stringify(place)}: both copy buttons off`);
  }
  const valid = calcHtml({});
  assert.ok(!valid.includes('ng-commands-off') && !valid.includes('aria-disabled="true"'), 'valid inputs: copying on');
  for (const [n, words] of [[1, '1 вузол'], [2, '2 вузли'], [5, '5 вузлів'], [14, '14 вузлів'], [22, '22 вузли'], [254, '254 вузли'], [16777214, '16\u202f777\u202f214 вузлів']]) {
    assert.equal(h.hostWords(n)[0], words, String(n));
  }
});

test('calculator: the gateway convention moves the example address and the commands', () => {
  const html = calcHtml({ gateway: 'last' });
  assert.ok(html.includes('<dt>Шлюз</dt><dd><span class="ng-calc-value">192.168.1.254</span>'));
  assert.ok(html.includes('aria-checked="true" tabindex="0" class="ng-segmented-option">остання адреса'));
  assert.deepEqual(copies(html).map(([, text]) => text), [cisco({ ip: '192.168.1.254', prefix: 24 }), routeros({ ip: '192.168.1.254', prefix: 24 })]);
});

test('calculator: /30, /31, /32 and /0 show their own rows and lines (S2, S3)', () => {
  let html = calcHtml({ ip: '10.20.30.41', prefix: '/30' });
  assert.equal(dd(html, 'Місць для пристроїв'), '2 вузли');
  assert.deepEqual(bitRows(html), ['address', 'mask', 'network', 'broadcast']);

  html = calcHtml({ ip: '10.0.0.1', prefix: '/31' });
  assert.ok(html.includes('<span class="ng-sr-only">Блок: </span>10.0.0.0/31</p>'));
  assert.equal(dd(html, 'Дві адреси'), '10.0.0.0 і 10.0.0.1');
  for (const label of ['Широкомовна адреса', 'Адреси для пристроїв', 'Місць для пристроїв', 'Шлюз']) assert.equal(dd(html, label), undefined, label);
  assert.ok(html.includes(t('calc.p2p')) && t('calc.p2p').includes('RFC 3021'));
  assert.deepEqual(bitRows(html), ['address', 'mask', 'network'], '/31: no broadcast row');
  // The entered address is the example's local end (step 8 fix).
  assert.deepEqual(copies(html), [['cisco', cisco({ ip: '10.0.0.1', prefix: 31 })], ['routeros', routeros({ ip: '10.0.0.1', prefix: 31 })]]);
  assert.ok(html.includes('У прикладі — введена адреса; інший кінець пари — 10.0.0.0.'));
  assert.deepEqual(copies(calcHtml({ ip: '10.0.0.0', prefix: '/31' })).map(([, text]) => text.split('\n')[1] ?? text), [' ip address 10.0.0.0 255.255.255.254', '/ip address add address=10.0.0.0/31 interface=ether1']);

  html = calcHtml({ ip: '10.0.0.1', prefix: '/32' });
  assert.ok(html.includes('<span class="ng-sr-only">Адреса: </span>10.0.0.1/32</p>'));
  assert.ok(html.includes(t('calc.host')));
  assert.deepEqual(bitRows(html), ['address', 'mask', 'network'], '/32: no broadcast row');
  assert.deepEqual(copies(html), [['cisco', 'interface Loopback0\n ip address 10.0.0.1 255.255.255.255']], '/32: Cisco Loopback0 only');
  assert.equal(routeros({ ip: '10.0.0.1', prefix: 32 }), null);

  html = calcHtml({ ip: '10.0.0.1', prefix: '/0' });
  assert.ok(html.includes(t('calc.default-route')));
  assert.equal(dd(html, 'Місць для пристроїв'), undefined, '/0: no count');
  assert.equal(dd(html, 'Шлюз'), undefined);
  assert.deepEqual(copies(html), []);
  assert.ok(html.includes(t('calc.no-commands')));
  assert.ok(html.includes('Лінійка: перше число адреси'), '/0: the first octet');
});

test('calculator: special space and short prefixes get no gateway or commands; every count is labelled', () => {
  for (const [ip, prefix] of [['127.0.0.1', '/8'], ['169.254.3.4', '/16'], ['224.1.2.3', '/24'], ['10.0.0.1', '/5']]) {
    const html = calcHtml({ ip, prefix });
    assert.equal(dd(html, 'Шлюз'), undefined, `${ip}${prefix}`);
    assert.deepEqual(copies(html), [], `${ip}${prefix}`);
    assert.ok(html.includes(t('calc.no-commands')), `${ip}${prefix}`);
    assert.ok(html.includes(t('calc.conventional-count')), `${ip}${prefix}: arithmetic only`);
  }
  // Step 8 fix: the qualification goes with every conventional count, an
  // ordinary /24 too; /0, /31 and /32 show no count, so no note.
  assert.ok(calcHtml({}).includes(t('calc.conventional-count')));
  const ordinary = calcHtml({ ip: '169.1.1.1', prefix: '/8' });
  assert.ok(ordinary.includes(t('calc.conventional-count')) && dd(ordinary, 'Шлюз') === '169.0.0.1', '169.1.1.1/8: an ordinary block, its count labelled');
  for (const prefix of ['/0', '/31', '/32']) assert.ok(!calcHtml({ ip: '10.0.0.1', prefix }).includes(t('calc.conventional-count')), prefix);
});

test('calculator: an invalid field keeps the last valid result, labelled as such', () => {
  let html = calcHtml({ ip: '192.168.5.', last: { ip: '192.168.5.77', prefix: '/26' }, prefix: '/26' });
  assert.ok(html.includes('Показано останній правильний запис, 192.168.5.77/26.'));
  assert.equal(dd(html, 'Адреса мережі'), '192.168.5.64');
  assert.ok(html.includes('aria-invalid="true"') && html.includes('Адресу записують чотирма числами'));
  html = calcHtml({ prefix: '/33', last: { ip: '192.168.1.10', prefix: '/24' } });
  assert.ok(html.includes('Показано останній правильний запис, 192.168.1.10/24.') && html.includes(t('mask.invalid-prefix')));
  html = calcHtml({ ip: '', last: { ip: '192.168.1.10', prefix: '/24' } });
  assert.ok(html.includes('Показано останній правильний запис') && !html.includes('aria-invalid="true"'), 'an empty field: no error line yet');
});

test('calculator: «Потренуватися → Маска» only inside the shell, with a fresh seed', () => {
  assert.ok(!calcHtml({}).includes('Потренуватися'));
  assert.ok(calcHtml({}, h.testNav()).includes('Потренуватися → Маска'));
  assert.ok(!calcHtml({}, h.testNav(['ip-calculator'])).includes('Потренуватися'), 'not when the target has no mask section');
});

test('ruler: all four octets, thinned ticks below a step of 4, labels clear of the marker', () => {
  assert.deepEqual(h.blockOn('10.20.30.41', 30), { octet: 4, unit: 4, start: 40, end: 43 });
  assert.deepEqual(h.blockOn('10.20.30.41', 20), { octet: 3, unit: 16, start: 16, end: 31 });
  assert.deepEqual(h.blockOn('10.20.30.41', 12), { octet: 2, unit: 16, start: 16, end: 31 });
  assert.deepEqual(h.blockOn('10.20.30.41', 5), { octet: 1, unit: 8, start: 8, end: 15 });
  assert.deepEqual(h.blockOn('10.20.30.41', 0), { octet: 1, unit: 256, start: 0, end: 255 });
  assert.deepEqual(h.blockOn('10.20.30.41', 32), { octet: 4, unit: 1, start: 41, end: 41 });
  const ticks = html => (html.match(/class="ng-ruler-tick/g) ?? []).length;
  const store = h.ipStore();
  assert.equal(ticks(store.render(h.AddressRuler, h.rulerFor('10.0.0.1', 32, true))), 65, '/32: every 4th value');
  assert.equal(ticks(store.render(h.AddressRuler, h.rulerFor('10.0.0.1', 30, true))), 65);
  assert.equal(ticks(store.render(h.AddressRuler, h.rulerFor('10.0.0.1', 27, true))), 9);
  const narrow = unescape(store.render(h.AddressRuler, h.rulerFor('10.20.30.41', 30, true)));
  assert.ok(narrow.includes('>40–43</text>'), 'a narrow block: one label');
  assert.deepEqual(h.rulerWith('192.168.10.77', 26, '192.168.10.64', '192.168.10.127'), h.rulerFor('192.168.10.77', 26, true));
});

// ── The binary walk: the provenance leak gate (S5) ─────────────────────────

/** The store as the screen leaves it: rows before `step` accepted (as the
 * student would enter them), a wrong learner draft at `step` checked, and
 * all three hints of the step open. `done`: all four rows accepted. */
function walk(seed, step, { text = false, done = false, nav, level = 3 } = {}) {
  const store = h.ipStore();
  store.dispatch({ type: 'place', scope: 'ip.binary', patch: { level, seeds: { [level]: seed }, text } });
  const task = h.binary.create(null, { seed, level });
  const key = task.instanceKey;
  // The test types what a student would: the rows they work out. These are
  // the student's own (learner provenance) once on the page.
  const typed = h.binary.solution(task).steps.map(s => s.octets);
  const accept = s => {
    const answer = { step: s, octets: typed[s] };
    store.dispatch({ type: 'instance', key, action: { type: 'checked', answer, result: h.binary.check(task, answer), part: s, partResult: { octets: [...typed[s]] } } });
  };
  const last = done ? 4 : step;
  for (let s = 0; s < last; s++) accept(s);
  let draft = null, finding = null;
  if (!done) {
    draft = typed[step].map((octet, o) => (o === 3 ? `${octet[0] === '1' ? '0' : '1'}${octet.slice(1)}` : octet));
    const answer = { step, octets: draft };
    const result = h.binary.check(task, answer);
    finding = result.findings[0];
    store.dispatch({ type: 'instance', key, action: { type: 'checked', answer, result } });
  }
  const cells = draft ? draft.map(o => [...o]) : h.zeroCells();
  // Round 4: the screen keeps the first wrong octet's mark with its sums.
  const marks = [0, 1, 2, 3].map(o => (finding?.entity === o ? { current: finding.params.current, target: finding.params.target } : null));
  store.dispatch({ type: 'instance', key, action: { type: 'view', patch: { step: Math.min(last, 3), drafts: { [step]: cells }, hintCounts: { [step]: 3 }, marks: { [step]: marks }, submits: 1 } } });
  const parts = store.state.instances[key].parts;
  return { store, task, key, draft, parts, finding, html: unescape(store.render(h.BinaryScreen, {}, nav)) };
}

/** Checks every surface of a rendered walk; returns how many it checked. */
function gate(task, step, html, { draft, parts }) {
  const { found, rest: markup } = regions(html);
  let rest = markup, surfaces = 0;
  const own = Object.values(parts).flatMap(p => p.octets);
  const ownAddresses = [2, 3].filter(s => parts[s]).map(s => decimal(parts[s].octets));
  for (const region of found) {
    surfaces++;
    // Level 1's given octets (read-only in the current row) are this row's first three.
    const context = region.provenance === 'learner' ? { step, octets: draft ?? [] } : region.provenance === 'given' ? { step, sourceStep: step } : { step, octets: own, addresses: ownAddresses };
    assert.notEqual(region.provenance, 'reference', 'no reference region before the reveal');
    assert.deepEqual(leaks(task, region.html, region.provenance, context), [], `${region.provenance}: ${region.html.slice(0, 300)}`);
  }
  // Hints read the row as it is now (round 4): the current draft.
  for (const hint of h.binary.hints(task, draft ? { step, octets: draft } : null, { step })) {
    const text = t(`binary.${hint.code}`, hint.params);
    assert.ok(rest.includes(text), `hint ${hint.code} rendered`);
    surfaces++;
    assert.deepEqual(leaks(task, text, hint.provenance, { step, example: hint.params }), [], text);
    rest = rest.split(text).join('');
  }
  surfaces++;
  assert.deepEqual(leaks(task, rest, 'unattributed', { step }), [], `the rest of the page (feedback, names, descriptions): ${rest.match(/(?<!\d)[01]{8}(?!\d)/)?.[0] ?? ''}`);
  return surfaces;
}

test(`binary walk leak gate: ${binarySeeds.length} seeds, all three levels, every step, both input modes, open hints and a wrong check (S5)`, () => {
  let surfaces = 0;
  for (const seed of binarySeeds) {
    for (const level of [1, 2, 3]) {
      for (let step = 0; step < 4; step++) {
        const text = (seed + step + level) % 2 === 1;
        const { task, html, draft, parts, finding } = walk(seed, step, { text, level });
        assert.ok(html.includes(text ? 'ng-bittext-input' : 'class="ng-bit is-'), `${seed}/${level}/${step}: the ${text ? 'text' : 'toggle'} row`);
        assert.equal((html.match(/role="status"/g) ?? []).length, 1);
        // The first wrong octet's feedback with its sums (round 4 R5).
        assert.ok(finding && html.includes(t(`binary.${['wrong-binary', 'wrong-mask', 'wrong-and', 'wrong-or'][step]}`, finding.params)), `${seed}/${level}/${step}: the wrong-check feedback`);
        assert.equal((html.match(/data-evidence="current"/g) ?? []).length, 1, `${seed}/${level}/${step}: only the flagged octet is the evidence`);
        assert.equal((html.match(/class="ng-bit(?:octet|text) is-given"/g) ?? []).length, level === 1 ? 3 : 0, `${seed}/${level}/${step}: given octets at level 1 only`);
        assert.equal(html.includes('ng-bitrows-table') && /is-line/.test(regions(html).found.find(r => r.provenance === 'accepted')?.html ?? ''), step >= 2, `${seed}/${level}/${step}: the prefix line only after the mask row`);
        surfaces += gate(task, step, html, { draft, parts });
      }
      const finished = walk(seed, 3, { done: true, level });
      surfaces += gate(finished.task, 3, finished.html, { draft: null, parts: finished.parts });
      assert.ok(finished.html.includes('class="ng-ruler-block"'), `${seed}/${level}: the student's block on the ruler`);
    }
  }
  assert.ok(surfaces > binarySeeds.length * 3 * 4 * 5, `surfaces checked: ${surfaces}`);
});

test('binary walk: legacy prefixes are level 3 (explicitly selected); levels 1 and 2 have their own', () => {
  for (const seed of binarySeeds) {
    assert.ok(h.binary.create(null, { seed, level: 3 }).prefix !== 24);
    assert.ok([25, 26, 27, 28, 29, 30].includes(h.binary.create(null, { seed, level: 1 }).prefix));
    assert.equal(h.binary.create(null, { seed, level: 2 }).prefix, 24);
  }
});

test('binary walk leak gate: planted leaks in rendered markup are caught', () => {
  const { task, html, draft, parts } = walk(7, 2);
  const reference = h.binary.solution(task).steps;
  // The network row (current) and the broadcast row (future) planted in an
  // accessible name, and the current row as the success line's words.
  for (const planted of [
    html.replace('<h1', `<h1 aria-label="${reference[2].octets.join(' ')}"`),
    html.replace('</h1>', `<span class="ng-sr-only">${reference[3].octets.join('')}</span></h1>`),
    html.replace('>Пропустити<', `>Пропустити ${decimal(reference[2].octets)}<`),
  ]) assert.throws(() => gate(task, 2, planted, { draft, parts }), assert.AssertionError);
  // The learner's own draft may repeat reference octets (it is theirs).
  assert.ok(draft.slice(0, 3).every((octet, i) => octet === reference[2].octets[i]));
  assert.doesNotThrow(() => gate(task, 2, html, { draft, parts }));
});

test('binary walk: the reveal shows all four rows; before it, no reference region exists', () => {
  const { store, key, task, html } = walk(11, 1);
  assert.ok(!html.includes('data-provenance="reference"'));
  store.dispatch({ type: 'instance', key, action: { type: 'session', action: { type: 'reveal' } } });
  const after = unescape(store.render(h.BinaryScreen));
  const { found } = regions(after);
  const ref = found.find(r => r.provenance === 'reference');
  assert.ok(ref, 'the reveal region');
  // Bits spaced per octet, so a screen reader reads bits, not numbers (step 8 fix).
  for (const { octets } of h.binary.solution(task).steps) assert.ok(ref.html.includes(octets.map(o => [...o].join(' ')).join(', ')), 'every row in words');
  assert.ok(!after.includes('data-provenance="learner"'), 'no editing after the reveal');
  assert.ok(after.includes('class="ng-caption ng-reveal-heading"') && !/зарахов/.test(after), 'the answer under its heading; no penalty wording');
});

// ── Links (S7) ─────────────────────────────────────────────────────────────

test('binary walk: «Відкрити в калькуляторі» only inside the shell and only once finished', () => {
  const nav = h.testNav();
  for (let step = 0; step < 4; step++) assert.ok(!walk(3, step, { nav }).html.includes(LINK), `step ${step}: no link while working`);
  assert.ok(!walk(3, 3, { done: true }).html.includes(LINK), 'no link outside the shell');
  assert.ok(walk(3, 3, { done: true, nav }).html.includes(LINK), 'solved: the link');
  const { store, key } = walk(3, 2, { nav });
  store.dispatch({ type: 'instance', key, action: { type: 'session', action: { type: 'reveal' } } });
  assert.ok(unescape(store.render(h.BinaryScreen, {}, nav)).includes(LINK), 'revealed: the link');
  assert.ok(!unescape(store.render(h.BinaryScreen, {}, h.testNav(['ip-binary']))).includes(LINK), 'not when the target has no calculator');
});

test('mask exercise: the calculator link only once finished; its params use the accepted or revealed prefix', () => {
  const nav = h.testNav();
  const at = (level, seed) => {
    const store = h.ipStore();
    store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level, seeds: { [level]: seed } } });
    const params = { seed, level };
    const task = h.mask.create(null, params);
    return { store, task, key: h.instanceKeyOf(h.mask, task, params) };
  };
  // A block task: working → no link; solved → the task's address and prefix.
  const block = at(1, 4821);
  assert.ok(!unescape(block.store.render(h.MaskScreen, {}, nav)).includes(LINK));
  const wrong = { network: '192.168.50.32', broadcast: '192.168.50.63' };
  block.store.dispatch({ type: 'instance', key: block.key, action: { type: 'checked', answer: wrong, result: h.mask.check(block.task, wrong) } });
  assert.ok(!unescape(block.store.render(h.MaskScreen, {}, nav)).includes(LINK), 'a wrong answer: still no link');
  const right = h.mask.solution(block.task);
  block.store.dispatch({ type: 'instance', key: block.key, action: { type: 'checked', answer: right, result: h.mask.check(block.task, right) } });
  assert.ok(unescape(block.store.render(h.MaskScreen, {}, nav)).includes(LINK));
  assert.ok(!unescape(block.store.render(h.MaskScreen)).includes(LINK), 'outside the shell: none');
  assert.deepEqual(h.calculatorParams({ finished: true, task: block.task, session: { revealed: false }, view: {}, result: null }), { ip: block.task.ip, prefix: block.task.prefix });

  // A fit task (no task.prefix): the accepted prefix, or the revealed one.
  const fit = at(2, 1);
  assert.equal(fit.task.kind, 'fit');
  const solved = { finished: true, task: fit.task, session: { revealed: false }, view: { rulerPrefix: 30 }, result: { evidence: { given: 30 } } };
  assert.deepEqual(h.calculatorParams(solved), { ip: fit.task.ip, prefix: 30 });
  assert.deepEqual(h.calculatorParams({ ...solved, session: { revealed: true }, solution: { prefix: 29 }, result: null }), { ip: fit.task.ip, prefix: 29 });
  assert.equal(h.calculatorParams({ ...solved, finished: false }), null, 'working: no params at all');
  fit.store.dispatch({ type: 'instance', key: fit.key, action: { type: 'session', action: { type: 'reveal' } } });
  assert.ok(unescape(fit.store.render(h.MaskScreen, {}, nav)).includes(LINK), 'a revealed fit task: the link');
});

test('BitOctet helpers: zero cells, flipping, text entry and paste shapes (polish-2 P1)', () => {
  assert.deepEqual(h.zeroCells(), Array.from({ length: 4 }, () => [...'00000000']), 'every cell starts at 0');
  assert.deepEqual(['0', '1'].map(h.flip), ['1', '0'], 'a click or Space flips');
  assert.equal(h.textOf([...'00010001']), '00010001', 'the field shows all eight digits');
  assert.equal(h.textOf(['', '1', '', '', '', '', '', '']), '01000000', 'a stray empty cell reads as 0');
  assert.equal(h.pastedBits('1100 0000'), '11000000');
  assert.equal(h.pastedBits('11000000.10101000.00001010.01001101'), '11000000101010000000101001001101');
  for (const bad of ['192', '1100000', '110000001', '11000000 2', '', null]) assert.equal(h.pastedBits(bad), null, String(bad));
});

test('text mode: one rule keeps every digit in its position (polish-2 V2)', () => {
  const show = edit => `${edit.cells.join('')}@${edit.caret}`;
  // The reviewers' worked cases: positions 3–5 of 11111111 selected, 0 typed;
  // 101 pasted (natively) at the start of 00000000.
  assert.equal(show(h.editText('110111', 3)), '11000111@3', 'a replaced selection: its positions become 0, the typed digit from its start');
  assert.equal(show(h.editText('10100000000', 3)), '10100000@3', 'a short paste or insert overwrites from the caret');
  assert.equal(show(h.editText('111101111', 5)), '11110111@5', 'typing overwrites the digit after the caret');
  assert.equal(show(h.editText('111111110', 9)), '11111111@8', 'at the end there is nothing to overwrite: the digit is dropped');
  assert.equal(show(h.editText('1111111', 4)), '11110111@4', 'Backspace or Delete: the deleted position becomes 0, nothing after it moves');
  assert.equal(show(h.editText('11111', 2)), '11000111@2', 'cut: the cut positions become 0');
  assert.equal(show(h.editText('1', 1)), '10000000@1', 'select all, then a digit: the rest padded with 0');
  assert.equal(show(h.editText('100000000', 2)), '10000000@2', '… and typing on overwrites');
  assert.equal(show(h.editText('', 0)), '00000000@0', 'everything deleted: eight 0s');
  assert.equal(show(h.editText('111a11111', 4)), '11111111@3', 'a character that isn’t a bit is dropped; no neighbour changes');
  assert.equal(show(h.editText('1_0 1·', 6)), '10100000@3', 'the old blanks are not bits either');
  assert.equal(show(h.editText('1111111100000000', 16)), '11111111@8', 'more than eight before the caret: the first eight');
  assert.equal(show(h.editText('1010')), '10100000@4', 'no caret: the end');
  // The caret is a UTF-16 offset: a character outside the BMP is two units (review fix).
  assert.equal(show(h.editText('😀110010', 2)), '00110010@0', 'an emoji pasted over positions 0–1: those become 0, no unselected bit moves');
  assert.equal(show(h.editText('101😀10010', 5)), '10110010@3', 'an emoji inserted with no selection: dropped, nothing moves, the caret stays');
  assert.equal(show(h.editText('1😀0110010', 3)), '10110010@1', 'an emoji inserted after the first digit: the same');
  // Every one-digit overwrite at every position keeps the other seven where they were.
  for (let at = 0; at < 8; at++) for (const typed of '01') {
    const before = '10110010';
    const { cells, caret } = h.editText(before.slice(0, at) + typed + before.slice(at), at + 1);
    assert.equal(cells.join(''), before.slice(0, at) + typed + before.slice(at + 1), `typed ${typed} at ${at}`);
    assert.equal(caret, at + 1);
  }
});

test('mask (repair 13): the network-size task\'s ruler has no address marker; its caption names the block size', () => {
  const store = h.ipStore();
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 2, seeds: { 2: 1 } } });
  const params = { seed: 1, level: 2 };
  const task = h.mask.create(null, params);
  assert.equal(task.kind, 'fit');
  const key = h.instanceKeyOf(h.mask, task, params);
  store.dispatch({ type: 'instance', key, action: { type: 'view', patch: { rulerPrefix: 26 } } });
  const html = unescape(store.render(h.MaskScreen));
  assert.ok(html.includes('class="ng-ruler-block"') && !html.includes('ng-ruler-marker') && !html.includes('ng-ruler-value'), 'no marker');
  assert.ok(html.includes('Блок цієї маски — 64 адреси: від 0 до 63.'), 'the block size in words');
});
