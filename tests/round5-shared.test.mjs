// Round 5 stage 5a (spec 5a §2 A–C, v2 A–C): the shared parts for the
// comprehension rules, server-rendered, and their pure decisions:
//   - ActionLine (R1) and ExerciseLayout's `action` slot;
//   - Purpose (R2), its one-line cap, and the expectPurposes helper;
//   - FactLink (R3): a button with its text equivalent, nothing about the
//     owner before a tap (mounted behaviour: tests/helpers/mounted-firewall.mjs);
//   - the diagram highlight: label only, in all three diagrams.
// The R5 must-see checker runs in a browser: tests/r5-must-see.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as h from '../.test-bundles/harness/round5.mjs';
import * as rt from '../.test-bundles/harness/routing-leaks.mjs';
import * as vl from '../.test-bundles/harness/vlan.mjs';
import { expectPurposes } from './helpers/purposes.mjs';
import { hl, matches, bareAddress, vlanOf, HIGHLIGHT_KINDS } from '../src/ui/topology/highlight.js';
import { predictStep, ui } from '../src/sections/firewall/uk.js';
import { topology } from '../src/banks/firewall/topology.js';
import { policies } from '../src/banks/firewall/policies.js';
import routing from './helpers/routing.mjs';
import tasks from '../src/banks/routing/tasks.js';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { layout } from '../src/sections/vlan/screens/diagram.js';

const el = h.createElement;
const css = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('ActionLine (R1): one plain sentence, an id for the group it names; nothing without words', () => {
  assert.equal(h.render(el(h.ActionLine, { id: 'a' }, 'Обери, кому адресовано пакет.')), '<p id="a" class="ng-action-line" data-action-line="">Обери, кому адресовано пакет.</p>');
  assert.equal(h.render(el(h.ActionLine, { id: 'a' }, '')), '');
  const style = css('ui/components/ActionLine.css');
  assert.match(style, /font-weight: 400/);
  assert.match(style, /color: var\(--ng-text\)/);
  assert.match(style, /text-transform: none/, 'never a caption');
  assert.doesNotMatch(style, /--ng-muted/);
});

test('ExerciseLayout (R1): the action slot sits right before the answer, in the work area', () => {
  const html = h.render(el(h.ExerciseLayout, { heading: 'Маска', question: el('p', null, 'Питання'), action: 'Обери маску.', actionId: 'act', answer: el('div', { role: 'radiogroup', 'aria-labelledby': 'act' }), help: el('p', null, 'Допомога') }));
  const work = html.slice(html.indexOf('data-region="work"'));
  assert.ok(work.indexOf('data-region="question"') < work.indexOf('class="ng-action-line"'));
  assert.match(work, /<div class="ng-exercise-act"><p id="act" class="ng-action-line" data-action-line="">Обери маску\.<\/p><div class="ng-exercise-answer" data-region="answer">/, 'directly before the answer region, the two as one item');
  assert.match(css('ui/components/ExerciseLayout.css'), /\.ng-exercise-act \{[^}]*gap: 6px;/, 'their own gap, no negative margin');
  assert.doesNotMatch(css('ui/components/ExerciseLayout.css'), /margin-top: -/);
  assert.ok(!h.render(el(h.ExerciseLayout, { heading: 'x', answer: el('div') })).includes('ng-action-line'), 'no slot, no line');
});

test('Purpose (R2): the markup contract, the normal text colour at 14 px, and the one-line cap', () => {
  assert.equal(h.render(el(h.Purpose, null, 'відкидає решту')), '<span class="ng-purpose" data-purpose="">відкидає решту</span>');
  assert.equal(h.render(el(h.Purpose, { stacked: true }, 'x')), '<span class="ng-purpose is-stacked" data-purpose="">x</span>');
  const style = css('ui/components/Purpose.css');
  assert.match(style, /color: var\(--ng-text\)/);
  assert.match(style, /font-size: var\(--ng-font-caption\)/, '14 px, above the 12 px floor');
  assert.doesNotMatch(style, /--ng-muted|text-transform: uppercase/);
  assert.equal(h.PURPOSE_MAX, 48);
  // Every firewall purpose fits one line at a 420 px panel.
  assert.deepEqual(h.tooLong(Object.values(ui.purpose)), []);
  assert.deepEqual(h.tooLong(['x'.repeat(49), '', '  ']), ['x'.repeat(49), '', '  '], 'too long, empty and blank fail');
  // Every rule of every policy has its purpose.
  for (const policy of policies) for (const rule of policy.rules) assert.ok(ui.purpose[rule.descriptionCode], `${policy.id}/${rule.id}`);
});

test('RuleTable: while the walk plays, words still to come hold their place; «По кроках» (hold off) holds none (B6)', () => {
  const rows = h.tableRows(policies[0]).filter(r => r.chain === 'input' && !r.end);
  const outcomes = Object.fromEntries(rows.map((row, i) => [row.at ?? i, { state: 'mismatch', text: 'не збігається: довгі слова про це правило' }]));
  const table = hold => h.render(el(h.RuleTable, { rows, value: null, onChange() {}, locked: true, outcomes, lit: 0, hold }));
  assert.equal(table(true).split('aria-hidden="true">не збігається').length - 1, rows.length, 'each row holds its coming words, hidden');
  assert.ok(!table(false).includes('не збігається'), 'stepping: nothing held');
});

test('expectPurposes: passes a rule table; fails a row without a purpose, an empty one, and a missing data-term', () => {
  const rows = h.tableRows(policies[0]).filter(r => r.chain === 'input');
  const table = h.render(el(h.RuleTable, { rows, value: null, onChange() {} }));
  expectPurposes(table, { expected: rows.filter(r => !r.end).length });
  assert.throws(() => expectPurposes(table, { expected: rows.length }), /rows with a term/, 'the chain end is not a term: the count is exact');
  assert.throws(() => expectPurposes(table.replace(/(<span class="ng-purpose[^"]*" data-purpose="">)[^<]+/, '$1'), { expected: 5 }), /an empty purpose/);
  assert.throws(() => expectPurposes(table.replace(/ data-purpose=""/, ''), { expected: 5 }), /no purpose/);
  assert.throws(() => expectPurposes(table.replace(/ data-term=""/, ''), { expected: 5 }), /rows with a term/, 'a lost data-term fails instead of passing empty');
  assert.throws(() => expectPurposes(table), /expected/, 'the count is required');
});

test('FactLink (R3): a native button (Enter and Space), named «… — показати на схемі», silent until tapped', () => {
  const html = h.render(el(h.FactLink, { value: '192.168.88.1', onActivate: () => 'never called on render' }));
  assert.equal(html, '<button type="button" class="ng-fact-link" aria-label="192.168.88.1 — показати на схемі" title="192.168.88.1 — показати на схемі">192.168.88.1</button><span class="ng-sr-only" aria-live="polite"></span>');
  assert.doesNotMatch(html, /tabindex|role=|адреса/, 'no tab-order change, no role override, no owner before a tap');
  assert.match(h.render(el(h.FactLink, { value: 'x', active: true, onActivate() {} })), /class="ng-fact-link is-active"/);
  // The diagram's outline pulses, except with reduced motion: then a static outline.
  const style = css('ui/topology/highlight.css');
  assert.match(style, /\.ng-hl-mark \{[^}]*fill: none;[^}]*animation: ng-hl-pulse/);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ng-hl-mark \{ animation: none; \}/);
});

test('highlight API: hl() marks labels by fact; matches() needs the same kind and value', () => {
  assert.deepEqual(HIGHLIGHT_KINDS, ['address', 'port', 'vlan', 'label']);
  assert.deepEqual(hl(null, ['address', '10.0.0.1']), { 'data-hl': 'address:10.0.0.1' });
  assert.deepEqual(hl({ kind: 'address', value: '10.0.0.1' }, ['port', 'g0/0'], ['address', '10.0.0.1']), { 'data-hl': 'port:g0/0 address:10.0.0.1', 'data-highlight': '' });
  assert.deepEqual(hl({ kind: 'port', value: '10.0.0.1' }, ['address', '10.0.0.1']), { 'data-hl': 'address:10.0.0.1' }, 'another kind');
  assert.deepEqual(hl({ kind: 'address', value: '10.0.0.1' }, ['address', null]), {}, 'no fact, no attribute');
  assert.equal(matches({ kind: 'door', value: 'input' }, 'door', 'input'), false, 'unknown kinds never match');
  assert.deepEqual([bareAddress('192.168.1.1/24'), vlanOf('мета: VLAN 20'), vlanOf('interface vlan10'), vlanOf('g0/1')], ['192.168.1.1', '20', '10', null]);
});

/** Every element carrying data-highlight in a markup string: [tag, class]. */
const lit = html => [...html.matchAll(/<(\w+)((?:\s[\w-]+="[^"]*")*?)\sdata-highlight=""/g)].map(m => [m[1], (m[2].match(/class="([^"]*)"/) ?? [])[1] ?? '']);
/** Every highlightable fact in a markup string. */
const facts = html => [...new Set([...html.matchAll(/data-hl="([^"]*)"/g)].flatMap(m => m[1].split(' ')))];
const NEVER = /door|lane|path|core|(?:router|ng-fw-box|ng-vl-host)(?![\w-])|ng-dg-circle|ng-dg-ep-box|switch-box|host-box|envelope|chip|plate|ng-fw-place/;
function labelsOnly(name, html, render) {
  const all = facts(html);
  assert.ok(all.length > 0, `${name}: labels carry facts`);
  for (const fact of all) {
    const [kind, ...rest] = fact.split(':');
    const shown = render({ kind, value: rest.join(':') });
    const marks = lit(shown);
    assert.ok(marks.length >= 1, `${name} ${fact}: highlighted`);
    for (const [tag, cls] of marks) {
      assert.ok(['text', 'tspan', 'g'].includes(tag), `${name} ${fact}: a ${tag} is no label`);
      assert.doesNotMatch(cls, NEVER, `${name} ${fact}: ${cls} is not a label`);
    }
    // Nothing but the marked labels changes: the same markup without data-highlight.
    assert.equal(shown.replace(/ data-highlight=""/g, ''), html, `${name} ${fact}: only labels change`);
  }
  assert.deepEqual(lit(render({ kind: 'door', value: 'input' })), [], `${name}: a door is never highlighted`);
  assert.deepEqual(lit(render({ kind: 'label', value: 'nothing' })), []);
}

test('highlight: the firewall diagram outlines labels only: R1\'s address block, the hosts\' and the internet\'s addresses, ports', () => {
  const html = h.renderFirewall(topology);
  assert.deepEqual(facts(html).sort(), ['address:100.64.0.1', 'address:100.64.0.2', 'address:192.168.88.1', 'address:192.168.88.10', 'address:192.168.88.20', 'address:203.0.113.50',
    'label:fw-label-internet-address', 'label:fw-label-pc-address', 'label:fw-label-router-addresses', 'label:fw-label-server-address', 'port:bridge', 'port:ether1'].sort());
  labelsOnly('firewall', html, hl => h.renderFirewall(topology, hl));
  // The router's block (logic's owner.labelId): one group, its three lines.
  assert.deepEqual(lit(h.renderFirewall(topology, { kind: 'label', value: 'fw-label-router-addresses' })), [['g', 'ng-fw-addresses']]);
  const block = h.renderFirewall(topology).match(/<g class="ng-fw-addresses"[^]*?<\/g>/)[0].replace(/<[^>]+>/g, '|').split('|').filter(Boolean);
  assert.deepEqual(block, [ui.routerAddresses, 'ether1 · 100.64.0.2', 'bridge · 192.168.88.1'], 'spec G: heading, WAN, then LAN');
  assert.doesNotMatch(html, /ng-fw-port-ip/, 'the grey address labels outside R1 are gone');
  assert.match(html, /class="ng-fw-port-name"[^>]*>ether1 · WAN</);
});

test('highlight: routing\'s and VLAN\'s diagrams outline labels only', () => {
  for (const syntax of syntaxList) for (const record of [tasks[0], tasks.at(-1)]) {
    const task = routing.create(record);
    const html = rt.renderTopology(task, syntax);
    labelsOnly(`routing #${record.displayNumber} ${syntax.id}`, html, hl => rt.renderTopology(task, syntax, hl));
  }
  for (const vendor of ['cisco', 'routeros']) {
    const task = vl.predict.create(vl.bank.predict, { variantId: 'p1', vendor, seed: 1, surprises: 0 });
    const geo = layout(task.topology, vendor);
    const html = vl.renderDiagram({ geo, topology: task.topology });
    labelsOnly(`vlan ${vendor}`, html, hl => vl.renderDiagram({ geo, topology: task.topology, highlight: hl }));
  }
});

test('highlight (repair 14): VLAN labels take explicit facts; the words\' VLAN is only a fallback', () => {
  const task = vl.predict.create(vl.bank.predict, { variantId: 'p1', vendor: 'cisco', seed: 1, surprises: 0 });
  const geo = layout(task.topology, 'cisco');
  const pc = task.topology.hosts[0].device;
  const draw = (third, highlight) => vl.renderDiagram({ geo, topology: task.topology, third: { [pc]: third }, highlight });
  const third = text => draw(text, null).match(/class="ng-vl-host-third"([^>]*)>/)[1];
  assert.match(third({ text: 'мета: VLAN 20' }), /data-hl="vlan:20"/, 'fallback: the VLAN the words name');
  assert.match(third({ text: 'мета: VLAN 20', facts: [['vlan', '30'], ['port', 'f0/1']] }), /data-hl="vlan:30 port:f0\/1"/, 'explicit facts win');
  assert.doesNotMatch(third({ text: 'мета: VLAN 20', facts: [] }), /data-hl/, 'explicit none: nothing');
  assert.match(draw({ text: 'мета: VLAN 20', facts: [['vlan', '30']] }, { kind: 'vlan', value: '30' }), /class="ng-vl-host-third" data-hl="vlan:30" data-highlight=""/);
});

test('round 5 words: the level 1 rule sentence and action lines (spec v2 A, E, v2.1)', () => {
  assert.equal(predictStep.action.l1, 'Обери, кому адресовано пакет.');
  assert.equal(predictStep.action.hook, 'Обери ланцюжок для цього пакета.');
  assert.equal(predictStep.action.rule, 'Тепер обери правило, що вирішить долю пакета.');
  assert.equal(predictStep.rule, 'Адреса «Куди» належить самому роутеру — це input. Іншому пристрою — це forward: пакет іде крізь роутер, а пропустити його чи ні, вирішують правила. Тут усі пакети приходять на роутер, і адресу «Куди» ніхто не змінює (без dst-NAT).');
  assert.equal(predictStep.action.l1Done, 'Відповідь зафіксовано.');
  assert.equal(predictStep.action.ruleDone, 'Правило зафіксовано — нижче видно, де зупинився фільтр.');
  assert.equal(predictStep.marks({ mine: 'forward', filter: 'input' }), 'твій вибір: forward ✗ · фільтр: input ✓');
  assert.equal(predictStep.marks({ mine: 'input', filter: 'input' }), 'твій вибір: input ✓ · фільтр: input', 'one ✓ when they agree');
  assert.equal(predictStep.marks({ mine: null, filter: 'input' }), 'фільтр: input');
});

// Round 5 integration: hl() takes the agreed { kind, value } objects as well as pairs.
import { hl as hlFacts } from '../src/ui/topology/highlight.js';
test('hl accepts { kind, value } objects and [kind, value] pairs alike', () => {
  const obj = hlFacts({ kind: 'port', value: 'SW1:fa0/1' }, { kind: 'port', value: 'SW1:fa0/1' });
  const pair = hlFacts({ kind: 'port', value: 'SW1:fa0/1' }, ['port', 'SW1:fa0/1']);
  assert.deepEqual(obj, pair);
  assert.equal(obj['data-hl'], 'port:SW1:fa0/1');
  assert.ok('data-highlight' in obj);
  assert.deepEqual(hlFacts(null, { kind: 'vlan', value: '' }), {});
});
