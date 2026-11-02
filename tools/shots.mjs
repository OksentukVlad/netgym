#!/usr/bin/env node
// Offline, UI-only review captures. No imports from the app or its task banks.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = promisify(execFile);
const seed = 600; // Versioned capture recipe; independent of --only and execution order.
const viewport = { width: 1280, height: 800 };
const narrowViewport = { width: 1000, height: 700 };
let commit, browserVersion;
const origin = 'http://netgym.test';
const sections = {
  home: 'Розділи', routing: 'Маршрутизація', calc: 'IP-калькулятор',
  mask: 'IP-адреси: маска', binary: 'IP-адреси: у бітах', firewall: 'Фаєрвол',
  vlan: 'VLAN', setup: 'Налаштування з нуля',
};
const standard = ['first', 'wrong', 'hint', 'done'];
// The setup decks' recall step and the reveal's «Моя відповідь» (spec S v2 shots table).
// Recall's line checks are panel events (repair v1): a repeated Enter, a late line failing after the
// hints, an edit after a check («до змін») and its recheck are gated too, apart from the locked sort.
const setupRecallStates = ['shown-own', 'recall-first', 'recall-wrong', 'recall-repeat', 'recall-mistake', 'recall-partial', 'recall-hint', 'recall-hints-all',
  'recall-late', 'recall-edit', 'recall-recheck', 'recall-solved', 'recall-done', 'recall-skip'];
const exercises = [
  { id: 'home', section: 'home', title: 'Список розділів', states: ['first'] },
  { id: 'rt-guided', section: 'routing', title: 'Налаштуй маршрути · із готовими рядками · задача 1' },
  { id: 'rt-hard', section: 'routing', title: 'Налаштуй маршрути · із готовими рядками · задача 15 (рівень 5)' },
  { id: 'rt-free', section: 'routing', title: 'Налаштуй маршрути · без готових рядків · задача 1' },
  { id: 'rt-mikrotik', section: 'routing', title: 'Налаштуй маршрути · MikroTik · задача 1' },
  // Round 4 (spec R2 v2/v3): a wrong cause after a passing repair; «Початкова таблиця» open; the start's snapshot and path in the cause step.
  { id: 'rt-fault', section: 'routing', title: 'Знайди несправність', states: ['first', 'wrong', 'hint', 'step2', 'done', 'wrong-cause', 'original', 'original-paths', 'coverage', 'form-elsewhere', 'form-long'] },
  { id: 'calc', section: 'calc', title: 'IP-калькулятор', states: ['first', 'empty', 'done'] },
  // Round 4 (spec R4 v3): one mask exercise; the old «вибір» states are its `choices-*` states, plus the fit task's.
  { id: 'mask-type', section: 'mask', title: 'Маска', states: ['first', 'wrong', 'hint', 'done', 'choices-first', 'choices-wrong', 'choices-hint', 'choices-done', 'choices-solved', 'choices-offer', 'choices-partial', 'fit-first', 'fit-choices'] },
  // Round 4 (spec R5): the old states run at level 3 (today's prefixes); levels 1 and 2 get their own.
  { id: 'binary', section: 'binary', title: 'Двійковий запис · рівень 3', states: ['first', 'wrong', 'hint', 'step2', 'step3', 'step4', 'done', 'l1-first', 'l1-text', 'l1-step2', 'l2-first', 'l2-step3'] },
  { id: 'fw-predict', section: 'firewall', title: 'Передбач · 2 · Яке правило (і рівень 1)', states: ['first', 'hint', 'chain-wrong', 'chain-right', 'wrong', 'step2', 'default-accept', 'done', 'l1-first', 'l1-wrong', 'l1-done'] },
  { id: 'fw-order1', section: 'firewall', title: 'Порядок правил · лише до роутера' },
  // A rule that never sees its packets (spec F2) exists only with forward's FastTrack: the shadow state is fw-order2's.
  { id: 'fw-order2', section: 'firewall', title: 'Порядок правил · увесь фільтр', states: [...standard, 'shadow'] },
  { id: 'vl-predict', section: 'vlan', title: 'Куди дійде кадр', states: ['first', 'wrong', 'step2', 'done'] },
  { id: 'vl-ports', section: 'vlan', title: 'Налаштуй порти' },
  { id: 'vl-route', section: 'vlan', title: 'Між VLAN' },
  { id: 'vl-fault', section: 'vlan', title: 'Знайди несправність', states: ['first', 'wrong', 'hint', 'repair', 'done', 'repair-pass', 'cause', 'wrong-cause', 'edit-after-pass'] },
  // Round 4 repair (Astra 4): later VLAN shapes, tasks and levels, and MikroTik. `base` is the
  // exercise whose recipe and targets they share; `syntax`, `shape`, `task`, `level` set them up.
  { id: 'vl-predict-mt', base: 'vl-predict', section: 'vlan', title: 'Куди дійде кадр · Три в ряд · MikroTik', syntax: 'routeros', shape: 'Три в ряд', states: ['first', 'wrong', 'step2', 'done'] },
  { id: 'vl-ports4', base: 'vl-ports', section: 'vlan', title: 'Налаштуй порти · 4 · Транзит', task: 4 },
  { id: 'vl-ports-mt', base: 'vl-ports', section: 'vlan', title: 'Налаштуй порти · 2 · Транк · MikroTik', syntax: 'routeros', task: 2 },
  { id: 'vl-route2', base: 'vl-route', section: 'vlan', title: 'Між VLAN · 2 · Транк теж твій', task: 2 },
  { id: 'vl-route-mt', base: 'vl-route', section: 'vlan', title: 'Між VLAN · 4 · Із мостом · MikroTik', syntax: 'routeros', task: 4 },
  { id: 'vl-fault-mt', base: 'vl-fault', section: 'vlan', title: 'Знайди несправність · MikroTik', syntax: 'routeros', states: ['first', 'wrong', 'hint', 'repair', 'done'] },
  { id: 'vl-fault3', base: 'vl-fault', section: 'vlan', title: 'Знайди несправність · рівень 3', level: 3, states: ['first', 'wrong', 'hint', 'repair', 'done'] },
  // Round 5 repair v1 (Astra 3): the compact drawing's fit, with a router's and a switch's given lines.
  { id: 'vl-route3', base: 'vl-route', section: 'vlan', title: 'Між VLAN · 3 · Керування', task: 3 },
  { id: 'vl-route-mt2', base: 'vl-route', section: 'vlan', title: 'Між VLAN · 2 · Транк теж твій · MikroTik', syntax: 'routeros', task: 2 },
  { id: 'vl-route-mt3', base: 'vl-route', section: 'vlan', title: 'Між VLAN · 3 · Керування · MikroTik', syntax: 'routeros', task: 3 },
  { id: 'vl-fault2', base: 'vl-fault', section: 'vlan', title: 'Знайди несправність · рівень 2 (маршрутизація)', level: 2, states: ['first', 'wrong', 'hint', 'repair', 'done'] },
  { id: 'vl-fault2-mt', base: 'vl-fault', section: 'vlan', title: 'Знайди несправність · рівень 2 · MikroTik', syntax: 'routeros', level: 2, states: ['first', 'wrong', 'hint', 'repair', 'done'] },
  // Round 4 (spec S): «Введи сам» is the recall step after the cards (the recall-… states).
  { id: 'setup-router', section: 'setup', title: 'Роутер Cisco · картки, потім по пам’яті', states: [...standard, ...setupRecallStates] },
  { id: 'setup-switch', section: 'setup', title: 'Комутатор Cisco 2960 · картки, потім по пам’яті', states: [...standard, ...setupRecallStates] },
  { id: 'setup-mikrotik', section: 'setup', title: 'Роутер MikroTik · картки', states: [...standard, 'shown-own', 'checkpoint'] },
].map(e => ({ states: standard, ...e }));
const mistakes = new Set(['rt-guided', 'rt-free', 'rt-mikrotik', 'rt-fault', 'mask-type', 'binary', 'vl-ports', 'vl-route', 'vl-fault', 'setup-router', 'setup-switch', 'setup-mikrotik']);
const replays = new Set(['rt-hard', 'rt-fault', 'fw-order1', 'fw-order2', 'vl-ports', 'vl-route', 'vl-fault', 'setup-router', 'setup-switch', 'setup-mikrotik']);
const narrows = new Set(['rt-hard', 'rt-fault', 'fw-order2', 'vl-fault', 'vl-route', 'setup-router']);
/** The exercise a variant shares its recipe and targets with (round 4 repair). */
const baseOf = id => exercises.find(e => e.id === id)?.base ?? id;
const hasHints = e => !['home', 'calc', 'vl-predict'].includes(baseOf(e.id));
for (const e of exercises) {
  e.states = [...new Set([...e.states, ...(mistakes.has(e.id) ? ['mistake'] : []), ...(hasHints(e) ? ['hints-all'] : []), ...(replays.has(e.id) ? ['solved'] : [])])];
}

export function parseSizes(value) {
  const sizes = value.split(',').map(size => {
    const m = /^(\d+)x(\d+)$/.exec(size);
    if (!m || Number(m[1]) < 320 || Number(m[2]) < 240 || Number(m[1]) > 7680 || Number(m[2]) > 4320) throw new Error(`Invalid --sizes viewport: ${size}`);
    return { width: Number(m[1]), height: Number(m[2]) };
  });
  return sizes.filter((size, i) => sizes.findIndex(s => s.width === size.width && s.height === size.height) === i);
}
export function argumentsOf(args) {
  let out = path.join(root, '.shots'), only, sizes = [viewport, narrowViewport], narrowShots = false, gate = 'enforce';
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg === '--help') return { help: true };
    if (arg === '--narrow-shots') { narrowShots = true; continue; }
    let value;
    if (arg.includes('=')) [arg, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
    else value = args[++i];
    if (!['--out', '--only', '--sizes', '--gate'].includes(arg) || !value || value.startsWith('--')) throw new Error(`Unexpected option or missing value: ${arg}`);
    if (arg === '--out') out = path.resolve(value);
    if (arg === '--only') only = value.split(',');
    if (arg === '--sizes') sizes = parseSizes(value);
    if (arg === '--gate') {
      if (!['enforce', 'report'].includes(value)) throw new Error('--gate must be enforce or report');
      gate = value;
    }
  }
  if (only?.some(id => !exercises.some(e => e.id === id))) throw new Error(`Unknown exercise in --only. IDs: ${exercises.map(e => e.id).join(',')}`);
  return { out, selected: exercises.filter(e => !only || only.includes(e.id)), sizes, narrowShots, gate };
}

// The contract follows the action, not whichever DOM nodes happen to exist.
// `done` historically mixes successful checks, reveals and completed rounds.
// Exemptions are declared here, per recipe state, with their reason (gate.json
// records them as `waived`); nothing on the page can waive a requirement.
// `expect` declares the outcome a state must show ('success': a task-scope
// success is the current verdict; 'stale': the current verdict predates an
// edit); the gate fails when the page shows anything else.
export function expectedTargets(id, raw) {
  id = baseOf(id);
  // Round 4 2b: a variant of a state (the mask's chips or fit task, a binary
  // level) has its base state's targets.
  const state = id === 'mask-type' ? raw.replace(/^(?:choices|fit)-/, '') : id === 'binary' ? raw.replace(/^l[12]-/, '') : raw;
  // Round 5 (spec 5b-2 A): the worked example opened by its toggle, a view the learner asks for (gate-only).
  if (raw === 'example-open') {
    return { kind: null, row: false, evidence: [], targets: ['[data-worked-example] .ng-wex-card'], waive: {
      evidence: 'opening the worked example is a view toggle, not a check: its declared target is the opened example itself (full checks)',
      message: 'opening the worked example is not an event of the help panel: nothing scrolls to it',
    } };
  }
  // Round 5 (5b-2 B): «Порядок правил» hint 1 before any check asks for a check; it names no packet or rule.
  if (id.startsWith('fw-order') && raw === 'hint-unchecked') {
    return { kind: 'hint', row: true, evidence: [], waive: { evidence: 'hint 1 before any check asks for a check: it names no packet or rule, so no row is current' } };
  }
  if (id.startsWith('setup-')) { const setup = setupTargets(state); if (setup) return setup; }
  // The old «вибір» states that are their own: the offer and a partly right answer after a check, a level's fit chips.
  if (id === 'mask-type' && ['offer', 'partial', 'choices'].includes(state)) return { kind: 'verdict', row: true, evidence: ['.ng-exercise-answer [aria-invalid="true"], .ng-exercise-answer input, .ng-exercise-answer [role="radiogroup"]'] };
  // «Початкова таблиця» is a view the learner opens, not a check or a hint: the table itself must be in view (checked by the recipe).
  if (id === 'rt-fault' && state === 'original') {
    return { kind: null, row: false, evidence: [], targets: ['.ng-rf-original'], waive: { evidence: 'opening the original table is a view toggle: its declared target is the table itself (full checks)', message: 'opening the original table is not an event of the help panel: nothing scrolls to it' } };
  }
  // The old «вибір» reveal (spec R v3 map): «choices-done» is the reveal with chips; «choices-solved» the chips' success.
  if (id === 'mask-type' && raw === 'choices-done') return { kind: 'reveal', row: true, evidence: [] };
  // Restore (leave and come back) must not scroll or move focus to help; it has no visibility target.
  // A stage opened by a tap (vl-fault «Ремонт» from a failing check) shows no new message: like a first view.
  // Round 5: the binary walk's level 1 in text mode (`l1-text`) is a first view too.
  if (id === 'home' || id === 'calc' || state === 'first' || state === 'l1-first' || /^l[12]-card\d$/.test(state) || (id === 'binary' && raw === 'l1-text') || state === 'restore') {
    return { kind: null, row: false, evidence: [], waive: {
      evidence: 'no visibility target (a first view or a restore): nothing may scroll there, so no evidence is checked',
      message: 'no visibility target (a first view or a restore): a restored item stays where it was, nothing scrolls to it',
    } };
  }
  let kind = 'verdict';
  // vl-fault «Ремонт» is opened by a tap after a check and a hint: the hint is current (Astra 4).
  if (['hint', 'hint2', 'hints-all'].includes(state) || (id === 'vl-fault' && state === 'repair')) kind = 'hint';
  if (state === 'reveal' || (state === 'done' && !['rt-guided', 'rt-free', 'rt-mikrotik', 'mask-type', 'binary', 'fw-predict', 'vl-predict'].includes(id))) kind = 'reveal';
  if (state === 'reveal-next') kind = 'empty';
  const evidence = [];
  if (['verdict', 'hint'].includes(kind) || state === 'device-tab' || (kind === 'reveal' && ['fw-predict', 'vl-fault', 'rt-fault'].includes(id))) {
    if (id === 'rt-fault') evidence.push(['step2', 'solved', 'wrong-cause', 'original-paths'].includes(state) ? '.ng-rf-causes' : '.ng-rf-ping.is-fail, .ng-rf-ping');
    else if (id.startsWith('rt-')) evidence.push('.ng-rt-row:has([aria-invalid="true"]), .ng-rt-row');
    else if (id.startsWith('mask-')) evidence.push('.ng-exercise-answer [aria-invalid="true"], .ng-exercise-answer input, .ng-exercise-answer [role="radiogroup"]');
    else if (id === 'binary') evidence.push(state === 'done' ? '[data-provenance="accepted"]' : '.ng-exercise-answer');
    else if (id.startsWith('fw-')) evidence.push(id === 'fw-predict' ? '.ng-fw-work [data-evidence="current"], .ng-fw-card' : '.ng-fwo-work .is-marked, .ng-fwo-work .ng-fw-card, .ng-fwo-work .ng-reorder-item');
    else if (id === 'vl-fault') evidence.push('[data-evidence="current"], .ng-vf-grid .ng-vf-row.is-no, .ng-vf-grid-head');
    else if (id === 'vl-predict') evidence.push('.ng-vl-choices, .ng-vl-question');
    else if (id.startsWith('vl-')) evidence.push('[data-evidence="current"], .ng-vl-form-head');
    else if (id.startsWith('setup-')) evidence.push('.ng-su-board .is-marked, .ng-su-board .ng-reorder-item');
  }
  // Rule order (HelpPanel): a solve and a recheck of a still-working list are
  // task-scope successes about the whole list; an edit after success leaves
  // a stale verdict. Neither names a single row.
  if (id.startsWith('fw-order') && ['solved', 'success-recheck'].includes(state)) {
    return { kind, row: true, evidence, expect: 'success', waive: { evidence: 'a task-scope success is about the whole list: no single row is current' } };
  }
  // An edit after success: the stale verdict's evidence is the edited row, the panel anchored after it.
  if (id.startsWith('fw-order') && state === 'success-edit') return { kind, row: true, evidence, expect: 'stale' };
  // Routing (round 4 R1): a passing network check is about the whole network, and the diagram shows it; an edit after it, the edited row.
  if (['rt-guided', 'rt-free', 'rt-mikrotik', 'rt-hard'].includes(id) && ['done', 'solved'].includes(state) && kind === 'verdict') {
    return { kind, row: true, evidence, expect: 'success', waive: { evidence: 'a task-scope success is about the whole network: no single row is current' } };
  }
  // Typing never scrolls (repair 3): the dimmed verdict stays where the panel anchors, beside the edited row; that row (the evidence) is checked, the recipe asserts the field didn't move.
  if (['rt-guided', 'rt-free', 'rt-mikrotik', 'rt-hard'].includes(id) && state === 'success-edit') {
    const why = 'typing never scrolls (repair 3): the panel (its check row and dimmed verdict) stays where it was, above or below the edited row; the edited row is the checked evidence and must not move';
    return { kind, row: true, evidence, expect: 'stale', waive: { message: why, row: why } };
  }
  // The binary walk's last row: the success names the accepted result (the ruler and the two addresses).
  if (id === 'binary' && ['done', 'solved'].includes(state)) return { kind, row: true, evidence, expect: 'success' };
  // VLAN configure and fault screens (round 4, spec F4–F6): a solve is about
  // the whole network; an edit after a check leaves its verdict stale, with
  // the field edited as its evidence; choosing a cause after «Мережа працює»
  // leaves that verdict stale too (the causes are its evidence).
  if (['vl-ports', 'vl-route', 'vl-fault'].includes(id) && state === 'solved') {
    return { kind, row: true, evidence, expect: 'success', waive: { evidence: 'a task-scope success is about the whole network: no single field or check is current' } };
  }
  if (['vl-ports', 'vl-route'].includes(id) && state === 'success-edit') return { kind, row: true, evidence, expect: 'stale' };
  if (id === 'vl-fault' && state === 'success-edit') return { kind, row: true, evidence, expect: 'stale' };
  if (id === 'vl-fault' && ['edit-after-pass', 'cause'].includes(state)) return { kind, row: true, evidence, expect: 'stale' };
  return { kind, row: true, evidence };
}

/** Routing's equivalent of a device tab: the router switch after a failing check (spec R2 v2 coverage, repair 5). */
const routerSwitch = id => ['rt-guided', 'rt-free', 'rt-mikrotik'].includes(id);

/**
 * The setup decks' own states (round 4, spec S). The deck is a long board:
 * a check names its first flagged row (data-evidence); recall lines check
 * themselves on Enter and their verdict under the field is the newest
 * message (data-help-current), the line its evidence. Returns null for the
 * shared rules (first, restore, done, reveal, reveal-next, hint after a check).
 */
function setupTargets(state) {
  const deck = 'the deck is the board: ';
  if (['hints-all', 'hint2'].includes(state)) return { kind: 'hint', row: true, evidence: [], waive: { evidence: `${deck}a hint before any check is about where to start, not one card` } };
  if (['solved', 'checkpoint'].includes(state)) return { kind: 'verdict', row: true, evidence: [], expect: 'success', waive: { evidence: `${deck}a passing check is about the whole deck, no single card is current` } };
  if (state === 'shown-own') return { kind: 'reveal', row: true, evidence: [] };
  if (state === 'recall-first') return { kind: null, row: true, evidence: [], waive: { evidence: 'recall opens with empty lines and no message: nothing is current yet', message: 'recall opens with no message; focus is on the first line' } };
  if (['recall-wrong', 'recall-repeat', 'recall-mistake', 'recall-partial', 'recall-late', 'recall-recheck'].includes(state)) return { kind: 'verdict', row: true, evidence: ['.ng-su-recall-line'] };
  if (state === 'recall-edit') return { kind: 'verdict', row: true, evidence: ['.ng-su-recall-line'], expect: 'stale' };
  if (['recall-hint', 'recall-hints-all'].includes(state)) return { kind: 'hint', row: true, evidence: ['.ng-su-recall-line'] };
  if (state === 'recall-solved') return { kind: 'verdict', row: true, evidence: ['.ng-su-recall-line'], expect: 'success' };
  if (state === 'recall-done') return { kind: 'reveal', row: true, evidence: [] };
  if (state === 'recall-skip') return { kind: 'empty', row: true, evidence: [] };
  return null;
}

/**
 * The evidence requirement and the declared outcome, decided from the recipe
 * (`gate`) and the current item's facts. Self-contained: measurePage gets its
 * source as a string and runs it in the page.
 * @param {{ evidence: string[], expect?: 'success'|'stale', waive?: { evidence?: string } }} gate
 * @param {{ tones: string[], scopes: string[], stale: boolean }} facts  of the current items
 * @returns {{ required: boolean, waived: string|null, failures: string[] }}
 */
export function evidenceRule(gate, facts) {
  const failures = [];
  const success = facts.tones.some((tone, i) => tone === 'ok' && (facts.scopes[i] ?? 'task') === 'task');
  if (gate.expect === 'success' && !success) failures.push('expected a task-scope success as the current verdict');
  if (gate.expect === 'stale' && !facts.stale) failures.push('expected a stale verdict («до змін») as the current item');
  const waived = gate.waive?.evidence ?? null;
  return { required: !waived && (gate.evidence ?? []).length > 0, waived, failures };
}

// ── R5 must-see (round 5, spec 5a §2D, v2 D, v2.1, v2.2; repair v1) ───────
// A recipe's first views declare their essentials: the task, the action
// line, the deciding facts (the diagram labels that carry them) and the
// first control. On the untouched view (no scrolling, no zoom) each must
// exist (in the declared number), have text, be at least MIN_FONT_PX as
// rendered (each text run's height under every transform), be painted
// (text alpha above 0), lie inside the viewport, be unclipped by every
// ancestor and itself (overflow, an SVG viewport, clip-path) and not be
// painted over. aria-hidden subtrees are not skipped: the diagrams are
// aria-hidden, their labels still must show. 5a declares firewall
// prediction (both levels); 5b adds the other screens to
// `essentialRecipes` with their own lists.
export const MIN_FONT_PX = 12; // src/ui/topology/size.js MIN_TEXT_PX
const fwLabel = id => `.ng-fw-svg [data-hl~="label:${id}"]`;
/** An essential: a selector that must match `count` elements (default: at least one). */
const fwPredictEssentials = level => [
  '.ng-fw-variant-text',
  ...(level === 1 ? ['.ng-fw-rule-sentence'] : []),
  '.ng-fw-work .ng-action-line',
  // Every field the level shows, each on its own selector (PacketCard data-field).
  ...(level === 1 ? ['from', 'to'] : ['from', 'to', 'ports', 'state', 'nat']).map(field => ({ sel: `.ng-fw-card [data-field~="${field}"]`, count: 1 })),
  { sel: '.ng-fw-door-option', count: 2 },
  // Every possible destination's address label (level 1: R1, the PC, the internet; level 2 adds the server).
  { sel: `${fwLabel('fw-label-router-addresses')} text`, count: 3 },
  { sel: fwLabel('fw-label-pc-address'), count: 1 },
  { sel: fwLabel('fw-label-internet-address'), count: 1 },
  ...(level === 2 ? [{ sel: fwLabel('fw-label-server-address'), count: 1 }] : []),
];
/** Setup decks (5b-1 §3, matrix; 5b-2 F): the task, the action line, Cisco's mode «?» (at both
 * sizes), cards 1–3 each with its purpose (first line), its command and (Cisco) its prompt
 * group, and «Перевірити». The folded worked example under the action line is never one. */
const setupEssentials = prompted => [
  { sel: '.ng-su-intro .ng-su-task', count: 1 },
  { sel: '.ng-su-board .ng-action-line', count: 1 },
  ...(prompted ? [{ sel: '.ng-su-board .ng-action-line .ng-su-modes-q', count: 1 }] : []),
  ...[1, 2, 3].flatMap(n => ['[data-purpose]', '.ng-su-term', ...(prompted ? ['.ng-su-choice'] : [])]
    .map(part => ({ sel: `.ng-su-board .ng-reorder > .ng-reorder-item:nth-child(${n}) ${part}`, count: 1 }))),
  { sel: '.ng-help-check', count: 1 },
];
/**
 * «All» (spec 5b-1 essentials matrix; repair v1, Astra 2): exactly as many
 * labels as the task has. The screen states the count from its task data on
 * an element (`data-{attr}` on `from`: the router's interfaces, the network's
 * routers, links, ISP gateways, the failing pings); the checker reads it and
 * requires that many matches of `sel`, the labels themselves (`times`: labels
 * per item, two ends per link), each measured. A count of 0 needs no match.
 */
export const allOf = (sel, from, attr, times = 1) => ({ sel, count: { from, attr: `data-${attr}`, times } });
// Routing (spec 5b-1 §1 with v2, v2.1, v2.2): the task, the action line, the
// selected router's own addresses (all), the first route's fields, the
// diagram labels it needs (the LANs' networks, both ends of the link) and
// «Перевірити». Task 15 adds both ISP gateways and both distance fields
// (its first route is a default route: no network box; the ISP gateway is
// its link's far end, R1's own end is in «адреси цього роутера»).
const svg = '.ng-rt-stage .ng-dg-svg';
const firstRow = '.ng-rt-rows .ng-rt-rowlist > .ng-rt-row:first-child';
const rtEssentials = (id, fields) => [
  { sel: '.ng-rt-desc:not(.ng-rt-failover)', count: 1 },
  { sel: '.ng-rt-work .ng-action-line', count: 1 },
  allOf('.ng-rt-ifaces > li', '.ng-rt-ifaces', 'count'),
  { sel: `${firstRow} .ng-rt-field:not(.ng-rt-f-dist):not(.ng-rt-f-blackhole)`, count: fields },
  ...(id === 'rt-hard' ? [
    // Both routes' distances, at both sizes (repair v1, Astra 1): two distinct fields.
    { sel: `${firstRow} .ng-rt-f-dist`, count: 1 },
    { sel: '.ng-rt-rows .ng-rt-rowlist > .ng-rt-row:nth-child(2) .ng-rt-f-dist', count: 1 },
    { sel: `${svg} > g.ng-dg-ep.is-gw .ng-dg-ep-ip`, count: 2 },
    // Its one LAN's network, so the whole address world is on the first view at both sizes (repair v1, v2).
    { sel: `${svg} > g.ng-dg-ep[data-ep="lan"] .ng-dg-ep-ip`, count: 1 }]
    : [{ sel: `${svg} > g.ng-dg-ep[data-ep="lan"] .ng-dg-ep-ip`, count: 2 }, { sel: `${svg} .ng-dg-end`, count: 2 }]),
  { sel: '.ng-rt-help .ng-help-check', count: 1 },
];
// «Знайди несправність» (v2.1 matrix, v2.2): the task, the action line,
// every router's name on the diagram, every gateway address (both ends of
// every link, every ISP gateway), the failing pings, the table's first row
// and «Перевірити».
const rfSvg = '.ng-rf-stage .ng-dg-svg';
const rtFaultEssentials = () => [
  { sel: '.ng-rf-task', count: 1 },
  { sel: '.ng-rf-work .ng-action-line', count: 1 },
  allOf(`${rfSvg} .ng-dg-name`, rfSvg, 'routers'),
  allOf(`${rfSvg} .ng-dg-end`, rfSvg, 'links', 2),
  // A DHCP uplink shows no gateway address (count 0).
  allOf(`${rfSvg} .ng-dg-ep.is-gw .ng-dg-ep-ip`, rfSvg, 'gateways'),
  allOf('.ng-rf-pinglist li.is-fail', '.ng-rf-pinglist', 'failing'),
  { sel: '.ng-rf-rowlist > .ng-rt-row:first-child', count: 1 },
  { sel: '.ng-rf-help .ng-help-check', count: 1 },
];
// The binary walk (spec 5b-1 §2, v2.1): level 1's question, action line,
// octet 4's eight toggles (or its one field in text mode), the given band's
// caption and «Перевірити»; level 3's first view (the old walk) its
// question, help line, all 32 toggles and «Перевірити».
const binaryEssentials = mode => [
  { sel: '.ng-bin-question', count: 1 },
  ...(mode === 'l3' ? [{ sel: '.ng-bin-help', count: 1 }, { sel: '.ng-bitrow .ng-bit', count: 32 }] : [
    { sel: '.ng-bin-now .ng-action-line', count: 1 },
    { sel: '.ng-bitband-caption', count: 1 },
    mode === 'text' ? { sel: '.ng-bitrow > .ng-bittext:not(.is-given)', count: 1 } : { sel: '.ng-bitrow > .ng-bitoctet:not(.is-given) .ng-bit', count: 8 },
  ]),
  { sel: '.ng-help-check', count: 1 },
];
// VLAN (round 5, spec 5b-1 §4 and its essentials matrix): «all» is counted
// from the task's data. Each such entry names `countAttr`, a `data-task-*`
// count the screen puts on its work column; vlanShots compares it with the
// matches on the untouched first view (so a missing label fails), and
// measureEssentials measures every match.
const vlWork = '.ng-vl-work';
const vlSvg = '.ng-vl-svg';
const vlCommon = [
  { sel: `${vlWork} .ng-action-line`, count: 1 },
  { sel: `${vlWork} .ng-help-check`, count: 1 },
];
const vlEssentials = {
  'vl-predict': [
    { sel: `${vlWork} .ng-vl-question`, count: 1 },
    { sel: `${vlWork} .ng-vl-choice.is-source`, count: 1 },
    // The sender on the diagram: its box's name and its status word (repair v1, Fable 1).
    { sel: `${vlSvg} .ng-vl-host.is-source :is(.ng-vl-host-name, .ng-vl-status)`, count: 2 },
    { sel: `${vlWork} .ng-vl-evidence tbody tr`, countAttr: 'ports' },
    // Every other PC and «Нікому»: as many as there are PCs.
    { sel: `${vlWork} .ng-vl-choices button.ng-vl-choice`, countAttr: 'hosts' },
    ...vlCommon,
  ],
  'vl-ports': [
    { sel: '.ng-vl-intro .ng-vl-task-text', count: 1 },
    { sel: `${vlWork} .ng-vl-form-table th.ng-vl-port`, countAttr: 'ports' },
    { sel: `${vlWork} .ng-vl-form-table :is(.ng-vl-modes, .ng-vl-frames)`, countAttr: 'ports' },
    // Each PC's name on its port's row («fa0/3 — PC1»): as many as the switch has PC links (repair v1, Astra 4).
    { sel: `${vlWork} .ng-vl-form-table th.ng-vl-port .ng-vl-port-pc`, countAttr: 'hostports' },
    ...vlCommon,
  ],
  'vl-route': [
    { sel: '.ng-vl-intro .ng-vl-task-text', count: 1 },
    { sel: `${vlSvg} .ng-vl-host-name`, countAttr: 'hosts' },
    { sel: `${vlSvg} .ng-vl-host-fourth`, countAttr: 'gateways' },
    { sel: `${vlSvg} .ng-vl-switch-name`, countAttr: 'devices' },
    // The first control: the device tabs.
    { sel: `${vlWork} .ng-vl-form-head [role="radiogroup"]`, count: 1 },
    { sel: `${vlWork} .ng-action-line`, count: 1 },
  ],
  'vl-fault': [
    { sel: '.ng-vl-intro .ng-vl-task-text', count: 1 },
    { sel: `${vlSvg} .ng-vl-host-name`, countAttr: 'hosts' },
    // A routed fault's gateways (none at level 1: the PC names stand in, so the selector always matches).
    { sel: `${vlSvg} :is(.ng-vl-host-fourth, .ng-vl-host-name)`, countAttr: ['gateways', 'hosts'] },
    { sel: `${vlSvg} .ng-vl-switch-name`, countAttr: 'devices' },
    { sel: `${vlWork} .ng-vf-grid .ng-vf-row.is-no`, countAttr: 'failing' },
    ...vlCommon,
  ],
};
// «Порядок правил» · увесь фільтр (spec 5b-2 B, v2): the router's own
// addresses (below two columns: the strip under the task; two: the
// diagram's block beside the list), the port-forward line of the task, and the first five
// rows, each with its chain, its description and its native rule.
const fwOrderEssentials = () => [
  { sel: '.ng-fwo-task', count: 1 },
  { sel: '.ng-fwo:not([data-layout="two"]) .ng-fwo-strip, .ng-fwo[data-layout="two"] .ng-fw-svg [data-hl~="label:fw-label-router-addresses"]', count: 1 },
  { sel: '.ng-fwo-goal [data-nat]', count: 1 },
  { sel: '.ng-fwo-list .ng-action-line', count: 1 },
  ...[1, 2, 3, 4, 5].flatMap(n => ['.ng-fwo-chain', '.ng-fwo-desc', '.ng-fwo-native']
    .map(part => ({ sel: `.ng-fwo-list .ng-reorder > .ng-reorder-item:nth-child(${n}) ${part}`, count: 1 }))),
];
/** Recipes whose first views must declare essentials (a first view without them fails). */
export const essentialRecipes = new Set(['fw-predict', 'fw-order2', 'setup-router', 'setup-switch', 'setup-mikrotik', 'rt-guided', 'rt-hard', 'rt-free', 'rt-mikrotik', 'rt-fault', 'binary', ...Object.keys(vlEssentials)]);
/** Gate-only first views of later cards: each destination's card is measured fresh (level 1 and level 2). */
const laterCard = /^l[12]-card\d$/;
/** The first views of a recipe. */
export const isFirstView = state => ['first', 'l1-first'].includes(state) || laterCard.test(state);
/** A state's declared essentials (selectors or { sel, count }), or null. */
export function essentialsOf(id, state) {
  id = baseOf(id);
  if (id === 'fw-predict' && (state === 'first' || /^l2-card\d$/.test(state))) return fwPredictEssentials(2);
  if (id === 'fw-predict' && (state === 'l1-first' || /^l1-card\d$/.test(state))) return fwPredictEssentials(1);
  if (id === 'fw-order2' && state === 'first') return fwOrderEssentials();
  if (id.startsWith('setup-') && state === 'first') return setupEssentials(id !== 'setup-mikrotik');
  if (['rt-guided', 'rt-free', 'rt-hard'].includes(id) && state === 'first') return rtEssentials(id, 3);
  if (id === 'rt-mikrotik' && state === 'first') return rtEssentials(id, 2);
  if (id === 'rt-fault' && state === 'first') return rtFaultEssentials();
  if (id === 'binary' && state === 'first') return binaryEssentials('l3');
  if (id === 'binary' && state === 'l1-first') return binaryEssentials('toggles');
  if (id === 'binary' && state === 'l1-text') return binaryEssentials('text');
  if (vlEssentials[id] && state === 'first') return vlEssentials[id];
  return null;
}

/**
 * VLAN (round 5): «all» essentials counted from the task. In the page: each
 * `countAttr` entry's matches against the work column's `data-task-*` (a
 * list of attributes is summed). Returns the mismatches.
 */
export function vlanCounts(list) {
  const work = document.querySelector('.ng-vl-work');
  const out = [];
  for (const entry of list) {
    if (!entry.countAttr) continue;
    const attrs = [].concat(entry.countAttr);
    const values = attrs.map(a => work?.getAttribute(`data-task-${a}`));
    if (!work || values.some(v => v === null)) { out.push({ sel: entry.sel, reason: `no task count ${attrs.join('+')}` }); continue; }
    const expected = values.reduce((n, v) => n + Number(v), 0);
    const found = document.querySelectorAll(entry.sel).length;
    if (found !== expected) out.push({ sel: entry.sel, reason: `expected ${expected} from the task (${attrs.join('+')}), found ${found}` });
  }
  return out;
}
/** Failures for a first view whose recipe requires essentials and declares none. */
export function declaredEssentials(id, state) {
  const list = essentialsOf(id, state);
  if (essentialRecipes.has(baseOf(id)) && isFirstView(state) && !list?.length) return { list: [], failures: [{ element: 'recipe', role: 'essential', reason: 'first view declares no essentials', distance: null }] };
  return { list: list ?? [], failures: [] };
}

// ── The worked example's row (round 5, spec 5b-2 A, v2) ─────────────────
// A screen that adopts WorkedExample adds its recipe here: it then gets the
// gate-only state `example-open` (the recipe opens the example by its toggle;
// the opened card is a declared target: in view, unclipped). On every gated
// state of every screen, `checkExample` checks the worked example:
//   - registration both ways: an example on a screen whose recipe is not
//     listed fails (its opened state would never be gated), and a listed
//     recipe's first view without one fails;
//   - one per screen; closed unless the state is `example-open` (it never
//     opens by itself);
//   - on first views: directly under the action line, its toggle's target
//     disjoint from every other control's, no essential inside it (it is
//     never an essential), and the folded label itself measured as an
//     essential is (painted, at least 12 px, in view, unclipped, not painted
//     over), separately from the declared essentials, which are measured
//     with the folded row in place.
/** Recipes whose screens carry a worked example (the section writers add theirs). */
export const exampleRecipes = new Set(['setup-router', 'setup-switch', 'setup-mikrotik', 'rt-guided', 'rt-hard', 'rt-free', 'rt-mikrotik', 'mask-type', 'fw-order1', 'fw-order2', 'vl-ports', 'vl-route']);
/** The folded row's words (measured on first views). */
export const EXAMPLE_LABEL = '[data-worked-example] > .ng-wex-toggle .ng-wex-label';
/** What `exampleRow` checks on a state: 'first' (a first view), 'open' (example-open) or 'closed' (any other). */
export const exampleMode = state => (state === 'example-open' ? 'open' : isFirstView(state) ? 'first' : 'closed');
/**
 * The worked example's row in the page (self-contained: Playwright sends its
 * source). `mode`: exampleMode(state); `essentials`: the state's declared
 * essentials; `registered`: the recipe is in exampleRecipes. Returns
 * { present, failures }.
 * @param {{ mode: 'first'|'open'|'closed', essentials?: Array<string|{ sel: string }>, registered?: boolean }} args
 */
export function exampleRow({ mode, essentials = [], registered = false }) {
  const failures = [];
  const rows = [...document.querySelectorAll('[data-worked-example]')];
  const fail = (reason, element = '[data-worked-example]') => failures.push({ element, role: 'worked example', reason, distance: null });
  if (rows.length && !registered) fail('a worked example on a screen whose recipe is not in exampleRecipes (its opened state would never be gated)');
  if (registered && mode === 'first' && !rows.length) fail('no worked example on this first view (its recipe is in exampleRecipes)');
  if (registered && mode === 'open' && !rows.length) fail('no worked example to open on this screen');
  if (rows.length > 1) fail(`${rows.length} worked examples on one screen (one at most)`);
  for (const ex of rows) {
    const toggle = [...ex.children].find(el => el.matches('button.ng-wex-toggle'));
    const body = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    const card = ex.querySelector('.ng-wex-card');
    const open = toggle?.getAttribute('aria-expanded') === 'true';
    if (!toggle) fail('no toggle button (button.ng-wex-toggle)');
    else if (!body || !ex.contains(body) || body.getAttribute('aria-live') !== 'polite') fail('the toggle controls no polite live region inside the example');
    if (mode === 'open') {
      if (!open || !card) fail('the toggle did not open the example');
      else if (!/приклад · інші числа/u.test(card.textContent)) fail('the opened example has no «приклад · інші числа» tag');
    } else if (open || card) fail('the example is open without the learner asking (it opens only by its toggle, on the gate-only state example-open)');
    // Read-only: nothing inside the content takes focus or input.
    for (const el of body ? body.querySelectorAll('*') : []) {
      if (el.matches('input, select, textarea, button, a[href], [tabindex], [contenteditable]:not([contenteditable="false"])')) fail(`a focusable or input element inside the example: ${el.tagName.toLowerCase()}`, '[data-worked-example] .ng-wex-body');
    }
    // Never an essential: no declared essential is the example or inside it.
    for (const entry of essentials) {
      const sel = typeof entry === 'string' ? entry : entry.sel;
      if ([...document.querySelectorAll(sel)].some(el => ex === el || ex.contains(el))) fail(`the essential ${sel} is inside the worked example (it is never an essential)`);
    }
    // The slot (first views): directly under the action line (its next sibling), above the first control.
    if (mode === 'first') {
      const line = ex.previousElementSibling;
      if (!line?.matches('[data-action-line]')) fail('not directly under the action line (the WorkedExample is the ActionLine\'s next sibling)');
      else if (toggle) {
        const label = toggle.querySelector('.ng-wex-label') ?? toggle;
        if (label.getBoundingClientRect().top < line.getBoundingClientRect().bottom - 1) fail('the toggle\'s words are not below the action line');
      }
      // Disjoint targets: no other control's box meets the toggle's (a click on either edge reaches the intended one).
      if (toggle) {
        const t = toggle.getBoundingClientRect();
        for (const other of document.querySelectorAll('button, input, select, textarea, a[href], summary, [role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])')) {
          if (other === toggle || toggle.contains(other) || other.contains(toggle)) continue;
          const o = other.getBoundingClientRect();
          if (o.width && o.height && o.left < t.right && o.right > t.left && o.top < t.bottom && o.bottom > t.top) {
            fail(`the toggle's target overlaps another control's: ${other.tagName.toLowerCase()}${other.className ? `.${String(other.className).trim().split(/\s+/).join('.')}` : ''}`);
          }
        }
      }
    }
  }
  return { present: rows.length > 0, failures };
}

/**
 * The gate's worked-example check of one state (Playwright `page`): the row
 * (exampleRow, with the recipe's registration) and, on first views, the
 * folded label measured on its own (measureEssentials). Returns
 * { mode, present, failures }.
 */
export async function checkExample(page, { id, state, essentials = [] }) {
  const mode = exampleMode(state);
  const row = await page.evaluate(exampleRow, { mode, essentials, registered: exampleRecipes.has(baseOf(id)) });
  const failures = [...row.failures];
  if (row.present && mode === 'first') {
    const label = await page.evaluate(measureEssentials, { essentials: [{ sel: EXAMPLE_LABEL, count: 1 }], minFont: MIN_FONT_PX });
    failures.push(...label.failures.map(f => ({ ...f, role: 'worked example label' })));
  }
  return { mode, present: row.present, failures };
}

/**
 * Measures declared essentials in the page (self-contained: Playwright sends
 * its source). Each essential is a selector (at least one match) or
 * { sel, count } (exactly `count`). For each match, every text run (each
 * text node, in HTML and in SVG <text>/<tspan>) is checked over its whole
 * boxes, never at sample points only:
 *   - rendered size: each line box's height and the run's total width
 *     against the same text measured untransformed in the same font, times
 *     the computed font size (the smaller), so CSS and SVG scaling (scaleX,
 *     scaleY) count; at least `minFont` px;
 *   - painted: text fill (-webkit-text-fill-color; SVG fill or stroke)
 *     alpha × the opacity of it and its ancestors above 0;
 *   - inside the viewport, and unclipped by its own element and every
 *     ancestor: clipping overflow, an <svg> viewport, clip-path (a
 *     clipPath's shapes' joint box; a CSS basic shape: the element's box —
 *     known limits, unused in NetGym and tested so);
 *   - not painted over (v2.2): every element painted above it whose box
 *     intersects the run is checked for paint inside the run's box — a
 *     background colour or image, a border band, its own text, an SVG
 *     shape's fill or stroke (its geometry grown by half its stroke, tested
 *     on a 1 px grid), SVG text — with effective alpha above 0, only where
 *     its own clip-path and its ancestors' clipping let it show. «Above»: in
 *     one SVG, later in document order; otherwise the paint order at that
 *     painted point (elementsFromPoint, with pointer-events forced on inline
 *     for every element during the query, so `pointer-events: none
 *     !important` overlays count).
 * @param {{ essentials: Array<string|{ sel: string, count?: number }>, minFont: number }} args
 */
export function measureEssentials({ essentials, minFont }) {
  const failures = [], targets = [];
  const cls = el => (typeof el.className === 'string' ? el.className : el.className?.baseVal ?? '').trim();
  const short = el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls(el) ? `.${cls(el).split(/\s+/).join('.')}` : ''}`;
  const alphaOf = colour => {
    if (!colour || colour === 'none' || colour === 'transparent') return 0;
    if (colour.startsWith('url(')) return 1;
    const m = /rgba?\(([^)]+)\)/.exec(colour);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length > 3 ? parseFloat(parts[3]) * (parts[3].endsWith('%') ? 0.01 : 1) : 1;
  };
  const opacityChain = el => { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o; };
  const isSvg = el => el instanceof SVGElement;
  const isViewport = el => el instanceof SVGSVGElement;
  const topSvg = el => { let s = null; for (let a = el; a; a = a.parentElement) if (isViewport(a)) s = a; return s; };
  const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const meet = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const empty = r => r.right - r.left <= 0.5 || r.bottom - r.top <= 0.5;
  const centre = r => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  const textRects = node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()].filter(q => q.width > 0 && q.height > 0).map(box); };
  function hiddenBy(el) {
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (a.hidden || st.display === 'none' || st.visibility !== 'visible' || parseFloat(st.opacity) === 0) return short(a);
    }
    return null;
  }
  // HTML glyphs paint in -webkit-text-fill-color (currentcolor by default), not `color`.
  const htmlTextAlpha = st => alphaOf(st.getPropertyValue('-webkit-text-fill-color') || st.color);
  const textAlpha = owner => {
    const st = getComputedStyle(owner);
    const paint = isSvg(owner) ? Math.max(alphaOf(st.fill) * parseFloat(st.fillOpacity || '1'), parseFloat(st.strokeWidth) > 0 ? alphaOf(st.stroke) * parseFloat(st.strokeOpacity || '1') : 0) : htmlTextAlpha(st);
    return paint * opacityChain(owner);
  };
  // The same text, untransformed, in the same font: its box height at the computed size.
  // An inline span in an absolutely placed holder (an absolute span itself would be blockified).
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-10000px;top:0;margin:0;padding:0;border:0;transform:none;line-height:normal;white-space:pre';
  const probe = document.createElement('span');
  probe.style.cssText = 'margin:0;padding:0;border:0;line-height:normal';
  holder.appendChild(probe);
  document.body.appendChild(holder);
  /** The run's untransformed box (the same words on one line, same font): { width, height }. */
  function plainBox(owner, text) {
    const st = getComputedStyle(owner);
    Object.assign(probe.style, { fontFamily: st.fontFamily, fontSize: st.fontSize, fontWeight: st.fontWeight, fontStyle: st.fontStyle,
      fontStretch: st.fontStretch, fontVariant: st.fontVariant, letterSpacing: st.letterSpacing, wordSpacing: st.wordSpacing, textTransform: st.textTransform });
    probe.textContent = text;
    const q = textRects(probe.firstChild)[0] ?? box(probe.getBoundingClientRect());
    return { width: q.right - q.left, height: q.bottom - q.top, size: parseFloat(st.fontSize) };
  }
  /** Rendered size from both directions: each line box's height, and the run's total width (scaleX counts too). */
  function renderedPx(plain, rect, runWidth) {
    const byHeight = plain.height ? plain.size * (rect.bottom - rect.top) / plain.height : plain.size;
    const byWidth = plain.width ? plain.size * runWidth / plain.width : plain.size;
    return Math.min(byHeight, byWidth);
  }
  /** What a's own clip-path leaves (its clipPath shapes' joint box), or null. Known limit: disjoint shapes count as their envelope; CSS basic shapes as the element's box (NetGym uses neither: tests/r5-must-see.test.mjs). */
  function clipPathBox(a) {
    const st = getComputedStyle(a);
    let out = null;
    const clipPath = st.clipPath && st.clipPath !== 'none' ? st.clipPath : null;
    if (clipPath) {
      const id = /url\(["']?#([^"')]+)["']?\)/.exec(clipPath)?.[1];
      const shape = id ? document.getElementById(id) : null;
      // A clipPath's shapes in the referencing element's user space (userSpaceOnUse), mapped to the screen.
      const ctm = isSvg(a) && a.getScreenCTM ? a.getScreenCTM() : null;
      const parts = shape && ctm ? [...shape.children].filter(c => c.getBBox).map(c => {
        const bb = c.getBBox();
        const pts = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(ctm));
        return { left: Math.min(...pts.map(q => q.x)), right: Math.max(...pts.map(q => q.x)), top: Math.min(...pts.map(q => q.y)), bottom: Math.max(...pts.map(q => q.y)), width: bb.width, height: bb.height };
      }).filter(r => r.width || r.height) : [];
      out = parts.length ? parts.reduce((u, r) => ({ left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) }), box(parts[0])) : box(a.getBoundingClientRect());
    }
    return out;
  }
  /** What a leaves visible of its content: its clip-path, an <svg> viewport, clipping overflow; null: no clipping. */
  function clipBox(a) {
    const st = getComputedStyle(a);
    const out = clipPathBox(a);
    if (isSvg(a) && !isViewport(a)) return out;
    const b = a.getBoundingClientRect();
    if (isViewport(a)) return st.overflow === 'visible' ? out : out ? meet(out, box(b)) : box(b);
    if (st.overflowX === 'visible' && st.overflowY === 'visible') return out;
    const inner = { left: b.left + a.clientLeft, top: b.top + a.clientTop, right: b.left + a.clientLeft + a.clientWidth, bottom: b.top + a.clientTop + a.clientHeight };
    const o = { left: st.overflowX === 'visible' ? -Infinity : inner.left, right: st.overflowX === 'visible' ? Infinity : inner.right, top: st.overflowY === 'visible' ? -Infinity : inner.top, bottom: st.overflowY === 'visible' ? Infinity : inner.bottom };
    return out ? meet(out, o) : o;
  }
  function clippedBy(owner, rect) {
    for (let a = owner; a && a.nodeType === 1; a = a.parentElement) {
      const c = clipBox(a);
      if (c && (c.left > rect.left + 1 || c.right < rect.right - 1 || c.top > rect.top + 1 || c.bottom < rect.bottom - 1)) {
        return { by: short(a), distance: { left: Math.max(0, c.left - rect.left), top: Math.max(0, c.top - rect.top), right: Math.max(0, rect.right - c.right), bottom: Math.max(0, rect.bottom - c.bottom) } };
      }
    }
    return null;
  }
  /** Where e's own paint can show at all: its clip-path and every ancestor's clipping (an infinite box: none). */
  function clipRegion(e) {
    let region = clipPathBox(e) ?? { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let a = e.parentElement; a && a.nodeType === 1; a = a.parentElement) { const c = clipBox(a); if (c) region = meet(region, c); }
    return region;
  }
  const isShape = e => isSvg(e) && !isViewport(e) && typeof e.isPointInFill === 'function';
  /** e's paint box: for an SVG shape its geometry box grown by half its stroke (a horizontal line has none of its own). */
  function paintBox(e) {
    const r = box(e.getBoundingClientRect());
    if (!isShape(e)) return r;
    const st = getComputedStyle(e), ctm = e.getScreenCTM();
    const half = (parseFloat(st.strokeWidth) || 0) / 2 * (ctm ? Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) : 1);
    return alphaOf(st.stroke) > 0 ? { left: r.left - half, top: r.top - half, right: r.right + half, bottom: r.bottom + half } : r;
  }
  /** A point inside `rect` where `e` itself paints with alpha above 0, else null. Clipped-away paint doesn't count. */
  function paintPoint(e, area) {
    if (hiddenBy(e)) return null;
    const op = opacityChain(e);
    if (op <= 0) return null;
    const rect = meet(area, clipRegion(e));
    if (empty(rect)) return null;
    const st = getComputedStyle(e);
    const tag = e.tagName.toLowerCase();
    const within = meet(paintBox(e), rect);
    if (isSvg(e) && !isViewport(e)) {
      if (['image', 'foreignobject', 'use'].includes(tag)) return empty(within) ? null : centre(within);
      const fill = alphaOf(st.fill) * parseFloat(st.fillOpacity || '1') * op;
      const stroke = parseFloat(st.strokeWidth) > 0 ? alphaOf(st.stroke) * parseFloat(st.strokeOpacity || '1') * op : 0;
      if (['text', 'tspan', 'textpath'].includes(tag)) {
        if (fill <= 0 && stroke <= 0) return null;
        for (const node of e.childNodes) if (node.nodeType === 3) for (const q of textRects(node)) { const m = meet(q, rect); if (!empty(m)) return centre(m); }
        return null;
      }
      if (typeof e.isPointInFill !== 'function' || (fill <= 0 && stroke <= 0) || empty(within)) return null;
      const svg = e.ownerSVGElement, ctm = e.getScreenCTM();
      if (!svg || !ctm) return centre(within);
      const inverse = ctm.inverse(), p = svg.createSVGPoint();
      const area = (within.right - within.left) * (within.bottom - within.top), step = Math.max(1, Math.sqrt(area / 6000));
      for (let y = within.top + step / 2; y < within.bottom; y += step) for (let x = within.left + step / 2; x < within.right; x += step) {
        p.x = x; p.y = y;
        const local = p.matrixTransform(inverse);
        if ((fill > 0 && e.isPointInFill(local)) || (stroke > 0 && e.isPointInStroke(local))) return { x, y };
      }
      return null;
    }
    if (['IMG', 'CANVAS', 'VIDEO', 'IFRAME', 'OBJECT', 'EMBED'].includes(e.tagName)) return empty(within) ? null : centre(within);
    if (!empty(within) && (alphaOf(st.backgroundColor) * op > 0 || st.backgroundImage !== 'none')) return centre(within);
    const b = e.getBoundingClientRect();
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = parseFloat(st[`border${side}Width`]);
      if (!(width > 0) || ['none', 'hidden'].includes(st[`border${side}Style`]) || alphaOf(st[`border${side}Color`]) * op <= 0) continue;
      const band = side === 'Top' ? { left: b.left, right: b.right, top: b.top, bottom: b.top + width }
        : side === 'Bottom' ? { left: b.left, right: b.right, top: b.bottom - width, bottom: b.bottom }
          : side === 'Left' ? { left: b.left, right: b.left + width, top: b.top, bottom: b.bottom } : { left: b.right - width, right: b.right, top: b.top, bottom: b.bottom };
      const m = meet(band, rect);
      if (!empty(m)) return centre(m);
    }
    if (htmlTextAlpha(st) * op > 0) for (const node of e.childNodes) {
      if (node.nodeType !== 3 || !/\S/u.test(node.textContent)) continue;
      for (const q of textRects(node)) { const m = meet(q, rect); if (!empty(m)) return centre(m); }
    }
    return null;
  }
  /** Is `e` painted above `owner` at `p`? */
  function above(e, owner, p) {
    const svg = topSvg(owner);
    if (svg && svg.contains(e)) return Boolean(owner.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    const stack = document.elementsFromPoint(p.x, p.y);
    const ie = stack.indexOf(e);
    const io = stack.findIndex(x => x === owner || x === svg || x.contains(owner));
    if (ie < 0 || io < 0) return Boolean(owner.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    return ie < io;
  }
  // pointer-events forced on, inline, for the paint-order queries (restored after).
  const all = [...document.querySelectorAll('*')];
  const saved = all.map(el => [el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events'), el.hasAttribute('style')]);
  for (const el of all) el.style.setProperty('pointer-events', 'auto', 'important');
  try {
    for (const entry of essentials) {
      const { sel, count: declared } = typeof entry === 'string' ? { sel: entry } : entry;
      // A count the screen states from its task data (allOf): `data-…` on `from`, times `times`.
      // Only digits count (repair v2, Astra): a blank, spaced or malformed value is no count; «0» is.
      const raw = declared && typeof declared === 'object' ? document.querySelector(declared.from)?.getAttribute(declared.attr) : null;
      const count = declared && typeof declared === 'object' ? (/^\d+$/.test(raw ?? '') ? Number(raw) * declared.times : NaN) : declared;
      if (Number.isNaN(count)) { failures.push({ element: sel, role: 'essential', reason: `no count on ${declared.from}`, distance: null }); continue; }
      const els = [...document.querySelectorAll(sel)];
      if (!els.length && count !== 0) { failures.push({ element: sel, role: 'essential', reason: 'missing essential', distance: null }); continue; }
      if (count !== undefined && els.length !== count) failures.push({ element: sel, role: 'essential', reason: `expected ${count}, found ${els.length}`, distance: null });
      for (const el of els) {
        const runs = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!/\S/u.test(n.textContent) || n.parentElement.closest('.ng-sr-only')) continue;
          let rects = textRects(n);
          if (!rects.length && isSvg(n.parentElement)) rects = [box(n.parentElement.getBoundingClientRect())].filter(q => !empty(q));
          runs.push({ owner: n.parentElement, text: n.textContent.trim(), rects });
        }
        const text = (el.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 120);
        const fail = (reason, extra = {}) => failures.push({ element: sel, tag: short(el), text, role: 'essential', reason, distance: null, ...extra });
        const before = failures.length;
        if (!runs.length) fail('empty essential');
        for (const { owner, text: words, rects } of runs) {
          const hidden = hiddenBy(owner);
          if (hidden) { fail(`not rendered (${hidden})`); continue; }
          if (!rects.length) { fail('text has no box'); continue; }
          if (textAlpha(owner) <= 0) fail('text is not painted (transparent)');
          const plain = plainBox(owner, words.replace(/\s+/gu, ' '));
          const runWidth = rects.reduce((sum, r) => sum + (r.right - r.left), 0);
          for (const q of rects) {
            const px = renderedPx(plain, q, runWidth);
            if (px < minFont - 0.25) fail(`text too small: ${px.toFixed(1)} px`, { fontPx: px });
            const out = { left: Math.max(0, -q.left), top: Math.max(0, -q.top), right: Math.max(0, q.right - innerWidth), bottom: Math.max(0, q.bottom - innerHeight) };
            if (Object.values(out).some(v => v > 0.5)) fail('outside the viewport', { distance: out });
            const clip = clippedBy(owner, q);
            if (clip) fail(`clipped by ${clip.by}`, { distance: clip.distance });
            const over = new Set();
            for (const e of all) {
              if (e === owner || e.contains(owner) || owner.contains(e)) continue;
              const r = paintBox(e);
              if (r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom) continue;
              const p = paintPoint(e, q);
              if (p && above(e, owner, p)) over.add(short(e));
            }
            if (over.size) fail(`painted over by ${[...over].join(', ')}`);
          }
        }
        targets.push({ selector: sel, tag: short(el), text, pass: failures.length === before });
      }
    }
  } finally {
    for (const [el, value, priority, had] of saved) {
      if (value) el.style.setProperty('pointer-events', value, priority); else el.style.removeProperty('pointer-events');
      if (!had) el.removeAttribute('style');
    }
    holder.remove();
  }
  return { failures, targets };
}

/** States a recipe can't reach on a screen, by design, with the reason (not skips). */
export const notApplicable = {
  'mask-type': { 'success-edit': 'a solved mask keeps its checked answer read-only (accepted, spec A Q3)', 'success-recheck': 'no edit is possible after success, so no recheck' },
  ...Object.fromEntries(['setup-router', 'setup-switch', 'setup-mikrotik'].map(id => [id, {
    'success-edit': 'a passing deck is locked: the board becomes its script (spec S1, order and prompts read-only after the check passes)',
    'success-recheck': 'no edit is possible after the check passes, so no recheck',
  }])),
  'rt-fault': { 'success-edit': 'a solved fault keeps its table read-only (its answer is the repair that passed and the cause)', 'success-recheck': 'no edit is possible after the cause is found, so no recheck' },
  binary: { 'success-edit': 'a finished walk shows no row to edit: the accepted rows are read-only (as the mask)', 'success-recheck': 'no edit is possible after the last row, so no recheck' },
};

export function gateStates(exercise) {
  return [...new Set([...exercise.states, ...(hasHints(exercise) ? ['hint2', 'reveal', 'reveal-next', 'restore'] : []),
    // Round 5 (R5): level 1's other cards are first views too (each L1 destination's card is measured).
    ...(baseOf(exercise.id) === 'fw-predict' ? ['l1-card2', 'l1-card3', 'l2-card2', 'l2-card3', 'l2-card4', 'l2-card5', 'l2-card6'] : []),
    // Round 5 (5b-2 B, verification): the stepper's named steps; hint 1 before a check; the shadowing's packet walk.
    ...(baseOf(exercise.id) === 'fw-predict' ? ['step3', 'step-end'] : []),
    ...(exercise.id.startsWith('fw-order') ? ['hint-unchecked'] : []),
    ...(exercise.id === 'fw-order2' ? ['shadow-walk'] : []),
    ...(['vl-ports', 'vl-route', 'vl-fault'].includes(baseOf(exercise.id)) || routerSwitch(exercise.id) ? ['device-tab'] : []),
    ...(exampleRecipes.has(baseOf(exercise.id)) ? ['example-open'] : []),
    ...(replays.has(exercise.id) || ['mask-type', 'binary', 'rt-guided', 'rt-free', 'rt-mikrotik'].includes(exercise.id) ? ['success-edit', 'success-recheck'] : [])])]
    .filter(state => !notApplicable[exercise.id]?.[state]);
}

// Read geometry only. Text is in DOM reading order, word by word, including
// visible input values/placeholders. Clip against every scrolling ancestor and
// test paint hit points so text covered by a sticky footer isn't counted.
export function measurePage({ gate, rule } = {}) {
  const root = document.querySelector('.ng-screen, .ng-home');
  function clip(el, r, metric = true) {
    let box = { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, innerWidth), bottom: Math.min(r.bottom, innerHeight) };
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (a.hidden || a.matches(metric ? '.ng-sr-only, .ng-bar, .ng-home-header' : '.ng-sr-only') || s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) return null;
      if (a.parentElement?.matches('details:not([open])') && !a.matches('summary')) return null;
      const b = a.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { box.left = Math.max(box.left, b.left + a.clientLeft); box.right = Math.min(box.right, b.left + a.clientLeft + a.clientWidth); }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { box.top = Math.max(box.top, b.top + a.clientTop); box.bottom = Math.min(box.bottom, b.top + a.clientTop + a.clientHeight); }
    }
    return !metric || box.right > box.left && box.bottom > box.top ? box : null;
  }
  function painted(el, r) {
    const b = clip(el, r);
    if (!b) return false;
    return [0.25, 0.5, 0.75].some(f => {
      const hit = document.elementFromPoint(b.left + (b.right - b.left) * f, (b.top + b.bottom) / 2);
      return hit && (el.contains(hit) || hit.contains(el));
    });
  }
  const pieces = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.matches('input:not([type=radio]):not([type=checkbox]), textarea') && painted(n, n.getBoundingClientRect())) pieces.push(n.value || n.placeholder || '');
      if (n.matches('select') && painted(n, n.getBoundingClientRect())) pieces.push([...n.selectedOptions].map(o => o.textContent).join(' '));
      continue;
    }
    const el = n.parentElement;
    if (!el || el.closest('script, style, select, textarea')) continue;
    const words = [];
    for (const match of n.textContent.matchAll(/\S+/gu)) {
      const range = document.createRange();
      range.setStart(n, match.index); range.setEnd(n, match.index + match[0].length);
      if ([...range.getClientRects()].some(r => painted(el, r))) words.push(match[0]);
    }
    if (words.length) pieces.push(words.join(' '));
  }
  const visibleText = pieces.filter(Boolean).join('\n');
  const controls = [...root.querySelectorAll('button,input,textarea,select,a[href],[role=button],[role=tab],[role=radio],[role=checkbox],[role=switch],[role=option]')]
    .filter(el => !el.matches(':disabled,[aria-disabled=true]') && !el.closest('[inert], [aria-disabled=true]') && painted(el, el.getBoundingClientRect())).length;
  // CSS paths identify scroll areas without writing attributes into the app.
  function selector(el) {
    if (el === root) return root.matches('.ng-screen') ? '.ng-screen' : '.ng-home';
    const index = [...el.parentElement.children].indexOf(el) + 1;
    return `${selector(el.parentElement)} > :nth-child(${index})`;
  }
  if (gate) {
    const targets = [], failures = [], missing = [], checked = new Set();
    const adopted = Boolean(root.querySelector('[data-help="message"]'));
    const rendered = el => Boolean(el.getClientRects().length) && clip(el, el.getBoundingClientRect(), false) !== null;
    const content = el => /\S/u.test(el.textContent ?? '') && rendered(el);
    const describe = el => ({ element: selector(el), tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 180) });
    const failMissing = (role, expected) => { missing.push(role); failures.push({ element: expected, role, reason: 'missing expected element', distance: null }); };
    function inspect(el, role, long = false) {
      if (checked.has(el)) return;
      checked.add(el);
      const info = { ...describe(el), role, long, pass: true }, before = failures.length;
      const raw = el.getBoundingClientRect();
      const r = { left: raw.left, top: raw.top, right: raw.right, bottom: long ? Math.min(raw.bottom, raw.top + 120) : raw.bottom };
      const b = clip(el, r, false);
      const distance = b ? { left: Math.max(0, b.left - r.left), top: Math.max(0, b.top - r.top), right: Math.max(0, r.right - b.right), bottom: Math.max(0, r.bottom - b.bottom) }
        : { left: Math.max(0, -r.left), top: Math.max(0, -r.top), right: Math.max(0, r.right - innerWidth), bottom: Math.max(0, r.bottom - innerHeight) };
      const add = (reason, extra = {}) => failures.push({ ...describe(el), role, reason, distance, ...extra });
      if (!b || b.right <= b.left || b.bottom <= b.top || Object.values(distance).some(n => n > 1)) add('outside viewport or clipped by ancestor');
      if (b) for (const fy of [0.1, 0.5, 0.9]) for (const fx of [0.1, 0.5, 0.9]) {
        const x = r.left + (r.right - r.left) * fx, y = r.top + (r.bottom - r.top) * fy;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) add('covered at inset hit-test point', { point: { x, y }, covering: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null });
      }
      for (const node of [el, ...el.querySelectorAll('*')]) {
        if (!rendered(node) || node.closest('.ng-sr-only, [aria-hidden="true"]')) continue;
        const nr = node.getBoundingClientRect();
        if (long && (nr.top >= r.bottom || nr.bottom <= r.top)) continue;
        const style = getComputedStyle(node);
        const clamped = parseInt(style.webkitLineClamp, 10) > 0;
        const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY) || clamped;
        const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX);
        // A long container's remaining height is intentionally scrollable;
        // horizontal clipping and clipped descendants in the preview still fail.
        if (((!long || node !== el) && (clipsY || node === el) && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1) || (clipsX && node.scrollWidth > node.clientWidth + 1)) {
          add('text clipped or line-clamped', { clippingElement: selector(node), overflow: { x: Math.max(0, node.scrollWidth - node.clientWidth), y: Math.max(0, node.scrollHeight - node.clientHeight) } });
        }
        // Range rectangles catch text spilling beyond a box even with visible
        // overflow; descendants outside the long preview are deliberately left.
        for (const text of node.childNodes) if (text.nodeType === Node.TEXT_NODE && /\S/u.test(text.textContent)) {
          const range = document.createRange(); range.selectNodeContents(text);
          for (const rect of range.getClientRects()) {
            if (long && rect.bottom > r.bottom) continue;
            const visible = clip(node, rect, false);
            if (!visible || visible.left > rect.left + 1 || visible.right < rect.right - 1 || visible.top > rect.top + 1 || visible.bottom < rect.bottom - 1) add('text clipped by viewport or ancestor', { clippingElement: selector(node), distance: visible ? { left: Math.max(0, visible.left - rect.left), top: Math.max(0, visible.top - rect.top), right: Math.max(0, rect.right - visible.right), bottom: Math.max(0, rect.bottom - visible.bottom) } : null });
          }
        }
      }
      info.pass = before === failures.length; info.distance = distance; targets.push(info);
    }
    const current = [...root.querySelectorAll('[data-help-current]')].filter(content);
    // A state without a visibility target (declared waiver) doesn't require the restored item in view.
    let messages = gate.waive?.message ? [] : current;
    if (gate.kind && gate.kind !== 'empty') {
      if (adopted) {
        if (!current.length) failMissing(gate.kind, '[data-help-current]');
        if (gate.kind === 'hint' && !current.some(el => el.matches('[data-help="hint"]') || el.querySelector('[data-help="hint"]'))) failMissing('hint', '[data-help-current] [data-help="hint"]');
        if (['verdict', 'reveal'].includes(gate.kind) && current.length && current.every(el => el.matches('[data-help="hint"]') || el.querySelector('[data-help="hint"]'))) failMissing(gate.kind, 'current verdict/reveal (a hint is still current)');
      } else {
        const fallback = gate.kind === 'hint' ? '.ng-hints-list > li, #ng-rt-hint-notes li' : gate.kind === 'reveal' ? '.ng-rt-reveal:has(.ng-rt-commands), .ng-rf-reveal, .ng-fw-reveal:not(button), .ng-reveal' : '.ng-feedback, .ng-rf-result, .ng-rt-strip:not(.is-pending)';
        messages = [...root.querySelectorAll(fallback)].filter(content);
        if (gate.kind === 'hint') messages = messages.slice(-1);
        if (!messages.length) failMissing(gate.kind, fallback);
      }
    }
    if (gate.kind === 'empty' && (current.length || !adopted && [...root.querySelectorAll('.ng-feedback,.ng-reveal,.ng-rf-reveal,.ng-rt-reveal:has(.ng-rt-commands),.ng-hints-list > li')].some(content))) failures.push({ element: '[data-help-current], legacy message', role: 'reset', reason: 'message did not reset after next', distance: null });
    for (const el of messages) {
      const long = el.hasAttribute('data-help-long') || Boolean(el.closest('[data-help-long]') || el.querySelector('[data-help-long]'));
      inspect(el, 'message', long);
      if (long) {
        const heading = el.querySelector('h1,h2,h3,h4,[role="heading"]') ?? el.closest('[data-help="message"]')?.querySelector('h1,h2,h3,h4,[role="heading"]');
        if (heading) inspect(heading, 'long heading'); else failMissing('long heading', '[data-help-long] :is(h1,h2,h3,h4,[role="heading"])');
        // An explicit disclosure/link, or a visible scrolling cue in the
        // preview. A bare clipped script does not explain how to reach the rest.
        const cue = [...(el.closest('[data-help="message"]') ?? el).querySelectorAll('summary,button,a[href],[data-help-more],p,span')]
          .filter(content).find(node => node.hasAttribute('data-help-more') || /решт|прокрут|нижче|повн(?:ий|а|е)|детальніше|читати далі|показати все/iu.test(node.textContent));
        const scroller = (() => { for (let a = el.parentElement; a; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 1) return a; })();
        if (cue) inspect(cue, 'long continuation cue');
        else failures.push({ ...describe(el), role: 'long continuation', reason: 'missing visible cue for remaining long content', distance: null });
        if (!scroller) failures.push({ ...describe(el), role: 'long continuation', reason: 'remaining long content has no normal scrolling ancestor', distance: null });
        // A scrollable page cannot expose text cut off inside a fixed-height
        // hidden box. Check the full answer up to its nearest real scroller.
        const fullBottom = Math.max(el.getBoundingClientRect().bottom, el.getBoundingClientRect().top + el.scrollHeight);
        for (let a = el; a && a !== scroller; a = a.parentElement) {
          if (/(hidden|clip)/.test(getComputedStyle(a).overflowY)) {
            const bottom = a.getBoundingClientRect().top + a.clientTop + a.clientHeight;
            if (fullBottom > bottom + 1) failures.push({ ...describe(a), role: 'long continuation', reason: 'remaining long content is clipped before the scrolling ancestor', distance: { bottom: fullBottom - bottom } });
          }
        }
      }
    }
    const evidence = [...root.querySelectorAll('[data-evidence="current"]')];
    // The recipe decides (tools/shots.mjs evidenceRule): declared waivers and outcomes only.
    const decide = new Function(`return (${rule})`)();
    const facts = { tones: current.map(el => el.getAttribute('data-help-tone')).filter(Boolean), scopes: current.filter(el => el.getAttribute('data-help-tone')).map(el => el.getAttribute('data-help-scope')), stale: current.some(el => el.hasAttribute('data-help-stale')) };
    const decision = adopted ? decide(gate, facts) : { required: false, waived: null, failures: [] };
    for (const reason of decision.failures) failures.push({ element: '[data-help-current]', role: 'declared outcome', reason, distance: null });
    if (adopted && decision.required && !evidence.length) failMissing('evidence', '[data-evidence="current"]');
    const waived = Object.entries(gate.waive ?? {}).map(([role, reason]) => ({ role, reason }));
    if (!adopted) for (const fallback of gate.evidence) {
      const el = fallback.split(',').flatMap(selector => [...root.querySelectorAll(selector)]).find(rendered);
      if (el) evidence.push(el); else failMissing('evidence (partial baseline)', fallback);
    }
    // Without a visibility target (a first view, a restore) nothing may scroll, so evidence is not checked.
    if (gate.kind) for (const el of evidence) inspect(el, 'evidence');
    // A state's own declared targets (e.g. a table the learner opened): the same full checks.
    for (const selector of gate.targets ?? []) {
      const els = [...root.querySelectorAll(selector)].filter(rendered);
      if (!els.length) failMissing('declared target', selector);
      for (const el of els) inspect(el, 'declared target');
    }
    const helpRow = adopted ? root.querySelector('[data-help="row"]') : null;
    if (gate.row && gate.waive?.row) { /* declared waiver, recorded in `waived` */ } else if (gate.row && helpRow) {
      // HelpPanel's check row (data-help="row"): every control in it.
      const controls = [...helpRow.querySelectorAll('button,a[href],summary')].filter(rendered);
      if (!controls.length) failMissing('check row', '[data-help="row"] controls');
      for (const control of controls) inspect(control, 'check row control');
    } else if (gate.row) {
      // No row hook (legacy screens): find the check/continue control by its name
      // and inspect all controls in the shared row, using legacy row classes.
      const button = [...root.querySelectorAll('button')].find(el => /^(Перевірити(?: мережу)?|Далі(?: →)?|Ще одна(?: →)?|Ще раз|Інші значення|Наступний (?:пакет|раунд) →)$/u.test(el.textContent.trim()) && rendered(el));
      if (!button) failMissing('check row', 'check or continue button');
      else {
        const row = button.closest('.ng-rt-check-bar,.ng-rf-foot-row,.ng-fw-actions,.ng-vl-foot-row') ?? button.parentElement;
        for (const control of row.querySelectorAll('button,a[href],summary')) inspect(control, 'check row control');
      }
    }
    const help = adopted ? root.querySelector('[data-help="message"]')?.parentElement : null;
    const folds = new Set(help ? help.querySelectorAll('summary') : []);
    for (const el of messages) {
      for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (parent.matches('details')) { const summary = parent.querySelector(':scope > summary'); if (summary) folds.add(summary); }
        if (parent.id) for (const control of root.querySelectorAll('[aria-controls]')) if (control.getAttribute('aria-controls').split(/\s+/).includes(parent.id)) folds.add(control);
      }
    }
    if (!adopted) for (const control of root.querySelectorAll('.ng-vl-more,.ng-rt-fold-toggle')) if (rendered(control)) folds.add(control);
    // A waived message (declared) waives its fold controls with it.
    if (!gate.waive?.message) for (const control of folds) inspect(control, 'fold control');
    if (gate.home && (root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1)) failures.push({ element: '.ng-home', role: 'home', reason: 'start screen requires scrolling', distance: { bottom: Math.max(0, root.scrollHeight - root.clientHeight), right: Math.max(0, root.scrollWidth - root.clientWidth) } });
    return { pass: failures.length === 0, baseline: adopted ? 'HelpPanel' : 'partial baseline', expected: gate, targets, missing, waived, failures };
  }
  const areas = [root, ...root.querySelectorAll('*')].filter(el => {
    const b = el.getBoundingClientRect(), s = getComputedStyle(el);
    return b.width > 1 && b.height > 1 && el.clientHeight > 1 && el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(s.overflowY) && !el.closest('[hidden]');
  }).map(el => ({ area: selector(el), height: el.scrollHeight, client: el.clientHeight, top: Math.round(el.scrollTop), below: Math.max(0, Math.round(el.scrollHeight - el.clientHeight - el.scrollTop)) }));
  const fallback = { area: selector(root), height: root.scrollHeight, client: root.clientHeight, top: Math.round(root.scrollTop), below: Math.max(0, Math.round(root.scrollHeight - root.clientHeight - root.scrollTop)) };
  return { visibleText, words: visibleText.trim() ? visibleText.trim().split(/\s+/u).length : 0, controls, areas, fallback };
}

class Driver {
  constructor(page, exercise, records, gaps, out, gates, capture = true, variant = '') { Object.assign(this, { page, exercise, records, gaps, out, gates, capture, variant }); this.steps = []; }
  note(text) { this.steps.push(text); }
  async settle() {
    await this.page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    // Feedback deliberately clears for 150 ms after a check. Reduced motion
    // finishes packet animations; leave the browser clock otherwise untouched.
    await this.page.waitForTimeout(200);
  }
  async click(locator, description, options) { await locator.click(options); this.note(description); await this.settle(); }
  button(name) { return this.page.getByRole('button', { name, exact: typeof name === 'string' }); }
  async press(name, description) { await this.click(this.button(name), description); }
  async radio(name, description) { await this.click(this.page.getByRole('radio', { name, exact: typeof name === 'string' }), description); }
  async hint() { await this.press(/Підказка 1 з/, 'Open the first hint'); }
  async reveal() {
    await this.press(/Показати відповідь/, 'Reveal the reference answer');
  }
  async open() {
    await this.page.goto(origin);
    this.note('Open NetGym with a fresh seeded page');
    await this.page.locator('.ng-home').waitFor();
    if (await this.button('Темна тема').count()) await this.press('Темна тема', 'Switch to dark theme');
    const e = this.exercise;
    if (e.section !== 'home') {
      await this.click(this.page.locator('.ng-card').filter({ has: this.page.locator('.ng-card-title', { hasText: sections[e.section] }) }), `Open ${sections[e.section]}`);
    }
    if (e.id === 'rt-hard') {
      await this.press('☰ Задачі', 'Open the routing task drawer');
      await this.click(this.page.locator('.ng-rt-task').filter({ hasText: /#15\s/ }), 'Choose task 15, level 5');
    }
    if (e.id === 'rt-free') await this.radio('Без готових рядків', 'Choose the mode without pre-named rows');
    if (e.id === 'rt-mikrotik') await this.radio('MikroTik', 'Choose MikroTik syntax');
    if (e.id === 'rt-fault') {
      await this.radio('Знайди несправність', 'Open routing fault finding');
      await this.page.locator('.ng-rf .ng-help-check').waitFor();
    }
    // The binary walk's old states run at level 3 (round 4: level 1 is the default).
    if (e.id === 'binary') await this.radio(/^3 ·/, 'Choose level 3 (any mask)');
    if (e.id === 'fw-predict') await this.radio(/^2 · Яке правило/, 'Choose level 2 (which rule decides)');
    if (e.id.startsWith('fw-order')) {
      await this.radio('Порядок правил', 'Open firewall rule ordering');
      if (e.id === 'fw-order2') await this.radio('Увесь фільтр', 'Choose the whole-filter level');
    }
    const vlanTabs = { 'vl-ports': 'Налаштуй порти', 'vl-route': 'Між VLAN', 'vl-fault': 'Знайди несправність' };
    if (e.syntax === 'routeros') await this.radio('MikroTik', 'Choose MikroTik syntax');
    if (vlanTabs[baseOf(e.id)]) await this.radio(vlanTabs[baseOf(e.id)], `Choose ${vlanTabs[baseOf(e.id)]}`);
    if (e.shape) await this.click(this.page.getByRole('radiogroup', { name: 'Мережа', exact: true }).getByRole('radio', { name: new RegExp(`^${e.shape}`) }), `Choose the network «${e.shape}»`);
    if (e.task) await this.click(this.page.getByRole('radiogroup', { name: 'Задача', exact: true }).getByRole('radio', { name: new RegExp(`^${e.task} ·`) }), `Choose task ${e.task}`);
    for (let n = 1; n < (e.level ?? 1); n++) await this.click(this.button(/^Далі/).first(), 'Skip to the next level («Далі →»)');
    const decks = { 'setup-switch': 'Комутатор Cisco 2960', 'setup-mikrotik': 'Роутер MikroTik' };
    if (decks[e.id]) await this.radio(decks[e.id], `Choose ${decks[e.id]}`);
    await this.settle();
  }
  async wheel(area, delta) {
    // Find an exposed point belonging to this scroll area, avoiding nested
    // scrollers and sticky controls. Scrolling itself is a real mouse wheel.
    await this.page.locator(area).scrollIntoViewIfNeeded();
    const point = await this.page.locator(area).evaluate(el => {
      const b = el.getBoundingClientRect();
      for (const fy of [0.2, 0.4, 0.6, 0.8]) for (const fx of [0.1, 0.5, 0.9]) {
        const x = Math.max(1, b.left) + (Math.min(innerWidth - 1, b.right) - Math.max(1, b.left)) * fx;
        const y = Math.max(1, b.top) + (Math.min(innerHeight - 1, b.bottom) - Math.max(1, b.top)) * fy;
        let hit = document.elementFromPoint(x, y);
        for (; hit; hit = hit.parentElement) {
          if (hit === el) return { x, y };
          const s = getComputedStyle(hit);
          if (/auto|scroll/.test(s.overflowY) && hit.scrollHeight > hit.clientHeight + 1) break;
        }
      }
      return null;
    });
    if (point) {
      await this.page.mouse.move(point.x, point.y);
      await this.page.mouse.wheel(0, delta);
    } else {
      // Fully covered by nested scrollers or sticky controls: scroll the area
      // itself, as a scrollbar drag would (view only, no app state).
      await this.page.locator(area).evaluate((el, dy) => el.scrollBy(0, dy), delta);
    }
    await this.settle();
  }
  async shot(state, theme = 'dark', variant = '') {
    await this.settle();
    await this.gate(state, theme);
    if (!this.capture && !(state === 'first' && theme === 'dark' && this.variant === 'narrow' && narrows.has(this.exercise.id))) return;
    variant ||= this.variant;
    let measured = await this.page.evaluate(measurePage);
    // Capturing scrolls; the next state must start from where the action left
    // the page, as it does without capture (--narrow-shots must not change the
    // gate). Remember every scroll position and put it back afterwards.
    const positions = [...measured.areas, measured.fallback].filter((a, i, list) => list.findIndex(b => b.area === a.area) === i).map(a => ({ area: a.area, top: a.top }));
    for (const area of [...measured.areas].reverse()) {
      if (area.top) await this.wheel(area.area, -area.height);
    }
    measured = await this.page.evaluate(measurePage);
    let index = 0;
    const save = async (area, scrolled) => {
      const m = await this.page.evaluate(measurePage);
      const scroll = m.areas.find(a => a.area === area) ?? m.areas[0] ?? m.fallback;
      const file = `${this.exercise.id}-${state}-${theme}${variant ? `-${variant}` : ''}${index ? `-scroll${index}` : ''}.png`;
      await this.page.screenshot({ path: path.join(this.out, file), fullPage: false, animations: 'disabled', caret: 'hide' });
      this.records.push({ file, exercise: this.exercise.id, section: sections[this.exercise.section], state, theme,
        commit, seed, viewport: this.page.viewportSize(), ...(variant ? { variant } : {}),
        steps: [...this.steps, ...(scrolled ? [`Scroll down to ${scroll.top} pixels`] : [])], 'url-free': true,
        visibleText: m.visibleText, words: m.words, controls: m.controls, scroll });
      index++;
    };
    await save(measured.areas[0]?.area, false);
    for (const initial of measured.areas) {
      let previous = 0;
      for (let n = 0; n < 100; n++) {
        const current = await this.page.locator(initial.area).evaluate(el => ({ top: el.scrollTop, below: el.scrollHeight - el.clientHeight - el.scrollTop, client: el.clientHeight }));
        if (current.below <= 1) break;
        await this.wheel(initial.area, Math.min(current.below, Math.max(80, current.client - 160)));
        const top = await this.page.locator(initial.area).evaluate(el => el.scrollTop);
        if (top <= previous + 0.5) throw new Error(`Scroll did not advance: ${initial.area}`);
        previous = top;
        await save(initial.area, true);
        if (n === 99) throw new Error('Scroll capture exceeded 100 pages');
      }
      if (previous) await this.wheel(initial.area, -initial.height);
    }
    for (const { area, top } of positions) await this.page.locator(area).evaluate((el, value) => { el.scrollTop = value; }, top);
    await this.settle();
  }
  async gate(state, theme = 'dark', extra = {}) {
    await this.settle();
    const result = await this.page.evaluate(measurePage, { gate: { ...expectedTargets(this.exercise.id, state), home: this.exercise.id === 'home', ...extra }, rule: evidenceRule.toString() });
    // R5 must-see: the declared essentials of a first view, on the view as it is (before any capture scrolling).
    const declared = declaredEssentials(this.exercise.id, state);
    if (declared.list.length || declared.failures.length) {
      const must = declared.list.length ? await this.page.evaluate(measureEssentials, { essentials: declared.list, minFont: MIN_FONT_PX }) : { failures: [], targets: [] };
      result.essentials = { declared: declared.list, targets: must.targets };
      result.failures.push(...declared.failures, ...must.failures);
      result.pass = result.failures.length === 0;
    }
    // The worked example's row, wherever a screen has one (and the gate-only example-open state).
    const example = await checkExample(this.page, { id: this.exercise.id, state, essentials: declared.list });
    if (example.present || example.failures.length) {
      result.example = { mode: example.mode, present: example.present };
      result.failures.push(...example.failures);
      result.pass = result.failures.length === 0;
    }
    this.gates.push({ exercise: this.exercise.id, state, theme, viewport: this.page.viewportSize(), commit, seed, steps: [...this.steps], ...result });
    // NETGYM_SHOTS_SEEN=1: also keep the view exactly as the gate measured it (before any
    // screenshot scrolling), for honest before/after pictures. Not part of the gate.
    if (process.env.NETGYM_SHOTS_SEEN === '1') {
      const { width, height } = this.page.viewportSize();
      await mkdir(path.join(this.out, 'seen'), { recursive: true });
      await this.page.screenshot({ path: path.join(this.out, 'seen', `${this.exercise.id}-${state}-${theme}-${width}x${height}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
    }
    return result;
  }
  skip(state, reason) {
    this.gates.push({ exercise: this.exercise.id, state, theme: 'dark', viewport: this.page.viewportSize(), pass: null, baseline: 'not measured', skipped: reason, failures: [] });
  }
  async first(light) {
    await this.shot('first');
    if (light) {
      await this.press('Світла тема', 'Switch to light theme with the shell button');
      await this.shot('first', 'light');
      await this.press('Темна тема', 'Switch back to dark theme with the shell button');
    }
  }
  async feedback(selector = '.ng-feedback') {
    await this.settle();
    if (!await this.page.locator(`${selector}, [data-help-current]`).filter({ hasText: /\S/ }).count()) throw new Error('Expected feedback after checking');
  }
}

async function maskShots(d) {
  await d.press('Перевірити', 'Check an incomplete answer'); await d.feedback(); await d.shot('wrong');
  await d.hint(); await d.shot('hint');
  // Level 1's network and broadcast follow directly from the printed IP/mask.
  const given = await d.page.locator('.ng-exercise-stage').innerText();
  const ips = given.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  if (!ips || ips.length < 2) throw new Error('Cannot read the address and dotted mask from the task');
  const a = ips[0].split('.').map(Number), m = ips[1].split('.').map(Number);
  const values = [a.map((v, i) => v & m[i]).join('.'), a.map((v, i) => (v & m[i]) | (255 ^ m[i])).join('.')];
  for (const [i, name] of ['Адреса мережі', 'Широкомовна адреса'].entries()) {
    await d.page.getByRole('textbox', { name, exact: true }).fill(values[i]); d.note(`Enter ${name}: ${values[i]}`);
  }
  await d.press('Перевірити', 'Check the calculated block addresses');
  await d.feedback();
  await d.page.locator('.ng-feedback.is-ok, [data-help-current]').filter({ hasText: /✓|Так/u }).first().waitFor();
  await d.shot('done');
  if (!notApplicable[d.exercise.id]?.['success-edit']) await successEdit(d);
}

async function binaryShots(d) {
  await d.press('Перевірити', 'Check the initial all-zero bit row'); await d.feedback(); await d.shot('wrong');
  await d.hint(); await d.shot('hint');
  const given = await d.page.locator('p[data-provenance=given]').innerText();
  const match = given.match(/(\d+\.\d+\.\d+\.\d+), маска \/(\d+)/);
  if (!match) throw new Error('Cannot read binary task IP/prefix');
  const a = match[1].split('.').map(Number), p = Number(match[2]);
  const m = a.map((_, i) => Math.max(0, Math.min(255, 256 - 2 ** (8 - Math.max(0, Math.min(8, p - 8 * i))))));
  const rows = [a, m, a.map((v, i) => v & m[i]), a.map((v, i) => (v & m[i]) | (255 ^ m[i]))];
  for (let step = 0; step < rows.length; step++) {
    // Preserve the first-time toggle UI: type each bit using its keyboard path.
    // The accessible label is stable even if the bit-button CSS changes.
    const first = d.page.getByRole('button', { name: /, октет 1, біт 128:/ });
    await first.click();
    await d.page.keyboard.type(rows[step].map(v => v.toString(2).padStart(8, '0')).join(''));
    d.note(`Type the ${['address', 'mask', 'network', 'broadcast'][step]} as 32 bits`);
    await d.press('Перевірити', 'Check the bit row'); await d.feedback();
    if (step < 3) {
      await d.page.locator('.ng-bin-steps li.is-done').nth(step).waitFor();
      await d.shot(`step${step + 2}`);
    }
  }
  await d.page.locator('.ng-feedback.is-ok, [data-help-current]').filter({ hasText: /✓|Так/u }).first().waitFor();
  await d.shot('done');
  if (!notApplicable[d.exercise.id]?.['success-edit']) await successEdit(d);
}

/** Round 4 (spec R5): levels 1 (octet 4 only) and 2 (/24), typed in their open octets. */
async function binaryLevelShots(exercise, withDriver) {
  if (exercise.id !== 'binary') return;
  for (const level of [1, 2]) {
    await withDriver(`l${level}`, async d => {
      await d.open();
      await d.radio(new RegExp(`^${level} ·`), `Choose binary level ${level}`);
      await d.shot(`l${level}-first`);
      // Round 5: level 1's first view in text mode too (its own action line, octet 4 as one field),
      // and in the light theme (repair v1: the given band's fill and contrast).
      if (level === 1) {
        await d.press('Світла тема', 'Switch to light theme with the shell button');
        await d.shot('l1-first', 'light');
        await d.press('Темна тема', 'Switch back to dark theme with the shell button');
        await d.press('Ввести текстом', 'Switch to text entry');
        await d.shot('l1-text');
        await d.press('Перемикачами', 'Back to the toggles');
      }
      const given = await d.page.locator('p[data-provenance=given]').innerText();
      const match = given.match(/(\d+\.\d+\.\d+\.\d+), маска \/(\d+)/);
      if (!match) throw new Error('Cannot read binary task IP/prefix');
      const a = match[1].split('.').map(Number), p = Number(match[2]);
      const m = a.map((_, i) => Math.max(0, Math.min(255, 256 - 2 ** (8 - Math.max(0, Math.min(8, p - 8 * i))))));
      const rows = [a, m, a.map((v, i) => v & m[i])];
      const open = level === 1 ? [3] : [0, 1, 2, 3];
      for (let step = 0; step < (level === 1 ? 1 : 2); step++) {
        await d.page.getByRole('button', { name: new RegExp(`, октет ${open[0] + 1}, біт 128:`) }).click();
        await d.page.keyboard.type(open.map(o => rows[step][o].toString(2).padStart(8, '0')).join(''));
        d.note(`Type the ${['address', 'mask'][step]}'s open octets as bits`);
        await d.press('Перевірити', 'Check the bit row');
        await d.page.locator('.ng-bin-steps li.is-done').nth(step).waitFor();
      }
      await d.shot(level === 1 ? 'l1-step2' : 'l2-step3');
    });
  }
}

/** Free mode's quiet link that adds a route (round 5 5b-2, spec C); «Знайди несправність» keeps «+ Маршрут». */
const FREE_ADD = '+ ще один маршрут (якщо потрібен)';

async function routingShots(d) {
  await d.press('Перевірити', 'Check the empty routing table');
  await d.shot('wrong'); await d.hint(); await d.shot('hint');
  // Task 1 is simple: the UI reveal is used for harder tasks. Reveal shots
  // remain honest about assistance and preserve the visible feedback.
  if (d.exercise.id === 'rt-hard') { await d.reveal(); await d.shot('done'); return; }
  const routers = d.page.locator('.ng-rt-routers .ng-rt-router');
  const names = await routers.allTextContents();
  // Read interfaces through the UI, then find the shared link and remote LAN.
  const interfaces = {};
  for (const name of names) {
    const button = d.page.locator('.ng-rt-routers').getByRole('button', { name: name.trim(), exact: true });
    if (await button.getAttribute('aria-pressed') !== 'true') await d.click(button, `Select router ${name}`);
    interfaces[name] = (await d.page.locator('.ng-rt-ifaces').innerText()).match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d+/g) ?? [];
  }
  if (names.length !== 2 || names.some(n => interfaces[n].length !== 2)) throw new Error('Task 1 no longer has two routers with two interfaces');
  const parts = cidr => { const [ip, prefix] = cidr.split('/'); const n = ip.split('.').reduce((v, o) => (v * 256 + Number(o)) >>> 0, 0); const mask = (0xffffffff << (32 - Number(prefix))) >>> 0; return { ip, prefix: Number(prefix), net: (n & mask) >>> 0, mask }; };
  const dotted = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
  for (const [i, name] of names.entries()) {
    const other = names[1 - i], own = interfaces[name].map(parts), theirs = interfaces[other].map(parts);
    const remote = theirs.find(x => !own.some(o => o.net === x.net && o.prefix === x.prefix));
    const link = theirs.find(x => own.some(o => o.net === x.net && o.prefix === x.prefix));
    if (!remote || !link) throw new Error('Cannot derive the remote LAN/shared link from shown interfaces');
    await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: name.trim(), exact: true }), `Select ${name} to enter its route`);
    if (d.exercise.id === 'rt-free') await d.press(FREE_ADD, 'Add a route');
    if (d.exercise.id === 'rt-mikrotik') {
      await d.page.getByRole('textbox', { name: 'Мережа призначення (dst-address)', exact: true }).fill(`${dotted(remote.net)}/${remote.prefix}`);
      await d.page.getByRole('textbox', { name: 'Шлюз — адреса сусіда (gateway)', exact: true }).fill(link.ip);
    } else {
      for (const [label, value] of [['Мережа', dotted(remote.net)], ['Маска', dotted(remote.mask)], ['Адреса сусіда (next-hop)', link.ip]]) await d.page.getByRole('textbox', { name: label, exact: true }).fill(value);
    }
    d.note(`Enter the remote LAN route via the neighbor on ${name}`);
  }
  await d.press('Перевірити', 'Check both routers together');
  await d.page.locator('.ng-rt[data-lap=done]').waitFor(); await d.shot('done'); await successEdit(d);
}

async function routingFaultShots(d) {
  await d.press('Перевірити', 'Check the unchanged faulty routes'); await d.feedback(); await d.shot('wrong');
  await d.hint(); await d.shot('hint');
  await d.reveal(); await d.shot('done');
  // The public reveal names the changed router and the exact before/after.
  // Reopen the same seeded page to show the cause step without its answer open.
  const heading = await d.page.locator('.ng-rf-reveal-head').innerText();
  const router = heading.match(/на (\S+)/)?.[1];
  const before = await d.page.locator('.ng-rf-change .is-was dd').innerText();
  const after = await d.page.locator('.ng-rf-change .is-now dd').innerText();
  if (!router) throw new Error('Cannot read changed router from the revealed answer');
  await d.open(); d.note('Reopen the same seeded fault after reading the reference repair');
  await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: router, exact: true }), `Select ${router}`);
  const command = text => text.match(/^ip route (\S+) (\S+) (\S+)(?: (\d+))?$/);
  const fixed = command(after), original = command(before);
  if (!fixed) throw new Error(`Cannot parse the displayed Cisco repair: ${after}`);
  let row;
  if (!original) {
    await d.press('+ Маршрут', 'Add the missing route'); row = d.page.locator('.ng-rf-rowlist .ng-rt-row').last();
  } else {
    for (const candidate of await d.page.locator('.ng-rf-rowlist .ng-rt-row').all()) {
      const fields = await candidate.getByRole('textbox').all();
      const values = await Promise.all(fields.map(f => f.inputValue()));
      if (values.slice(0, 3).join(' ') === original.slice(1, 4).join(' ')) { row = candidate; break; }
    }
  }
  if (!row) throw new Error('Cannot find the before-route in the editable table');
  for (const [i, label] of ['Мережа', 'Маска', 'Адреса сусіда (next-hop)'].entries()) await row.getByRole('textbox', { name: label, exact: true }).fill(fixed[i + 1]);
  const distance = row.getByRole('textbox', { name: 'Відстань (distance)', exact: true });
  if (await distance.count()) await distance.fill(fixed[4] ?? '1');
  d.note('Enter the displayed reference repair');
  await d.press('Перевірити', 'Check the repaired routes to open the cause question');
  await d.page.locator('.ng-rf-causes').waitFor(); await d.shot('step2');
}

// Round 4 (spec F1 v2): «Передбач» level 2 checks the chain at once, then
// the rule; level 1 asks the chain only. The recipe reads the chain from the
// givens a learner sees (the packet's destination against R1's addresses on
// the diagram), never from the app's state; wrong answers are ones that are
// wrong by construction (an input packet's chain end comes after «drop the
// rest»; FastTrack never decides).
async function firewallChain(d) {
  // Round 5: the router's own addresses are the block inside R1 («ether1 · 100.64.0.2»).
  const routers = (await d.page.locator('.ng-fw-address').allTextContents()).map(text => clean(text).split(' · ').at(-1));
  const card = clean(await d.page.locator('.ng-fw-card').innerText());
  const to = card.match(/(?:Куди|після dst-NAT):\s*(\d+\.\d+\.\d+\.\d+)/)?.[1];
  if (!to || !routers.length) throw new Error('Cannot read the packet destination or the router addresses');
  return routers.includes(to) ? 'input' : 'forward';
}
// Level 2's «input — до самого роутера»; level 1's «самому роутеру → input».
const chainButton = (d, hook) => d.page.locator('.ng-fw-door-option').filter({ hasText: new RegExp(`^${hook} —|→ ${hook}$`) });
async function firewallRow(d, pick) {
  const rows = d.page.locator('.ng-fw-table .ng-fw-row');
  for (const row of await rows.all()) if (pick(clean(await row.innerText()))) return row;
  throw new Error('No rule row matches the recipe');
}
async function firewallShots(d) {
  if (d.exercise.id !== 'fw-predict') {
    await d.press('Перевірити', 'Check the initial shuffled rules'); await d.feedback(); await d.shot('wrong');
    await d.hint(); await d.shot('hint'); await d.reveal(); await d.shot('done');
    if (d.exercise.id === 'fw-order2') {
      // A rule that never gets its packets, with every outcome right: level
      // 1 has none (each of its 120 orders works or changes an outcome), so
      // the reference with FastTrack moved right after forward's «accept the
      // replies».
      await d.open(); const reference = await firewallReference(d);
      await d.open();
      const fasttrack = reference.findIndex(text => /FastTrack/.test(text));
      const rest = [...reference.slice(0, fasttrack), ...reference.slice(fasttrack + 1)];
      const replies = rest.findIndex(text => /^forward accept .*без відстеження крізь роутер/.test(text));
      const order = [...rest.slice(0, replies + 1), reference[fasttrack], ...rest.slice(replies + 1)];
      d.note('Replay the revealed order with FastTrack moved after the forward replies rule');
      await firewallReplay(d, order, false);
      await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor();
      await d.shot('shadow');
      // Round 5 (5b-2 B): the shadowing has its packet too, and its walk on the learner's rows (gate only).
      await d.press('Показати шлях пакета', 'Open the walk of the packet the hidden rule never gets');
      await d.page.locator('.ng-fwo .ng-reorder-item.is-walk').first().waitFor();
      await d.gate('shadow-walk');
    }
    // Round 5 (5b-2 B): hint 1 before any check (it asks for a check), gate only.
    await d.open(); await d.hint(); await d.gate('hint-unchecked');
    return;
  }
  // Level 2. Hint 1 before any choice (the packet card is its evidence).
  await d.hint(); await d.shot('hint');
  const hook = await firewallChain(d);
  await d.click(chainButton(d, hook === 'input' ? 'forward' : 'input'), 'Choose the other chain (checked at once: retry)');
  await d.shot('chain-wrong');
  await d.click(chainButton(d, hook), `Choose ${hook}, the packet's chain`);
  await d.shot('chain-right');
  await d.click(await firewallRow(d, text => (hook === 'input' ? /кінець списку/.test(text) : /fasttrack/.test(text))), hook === 'input' ? 'Choose the end of input (after «drop the rest»: wrong)' : 'Choose FastTrack (it never decides: wrong)');
  await d.press('Перевірити', 'Commit the wrong rule after the right chain'); await d.feedback(); await d.shot('wrong');
  await d.press('По кроках', 'Open the packet walk stepper');
  await d.press('Крок уперед', 'Advance the packet walk by one step'); await d.shot('step2');
  // Round 5 (5b-2 B): every step is named in words under the stepper; the next one and the last, gate only.
  await d.press('Крок уперед', 'Advance the packet walk to the chain'); await d.gate('step3');
  for (let i = 0; i < 20 && await d.page.locator('.ng-fw-stepper button[aria-label="Крок уперед"][aria-disabled="false"]').count(); i++) await d.press('Крок уперед', 'Advance the packet walk');
  await d.gate('step-end');
  // A packet the end-of-chain row decides: forward packets answered with the
  // chain end until one is right; other packets are revealed to move on.
  await d.open(); d.note('Restart the same seeded round to find a packet decided by the end of forward');
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    const chain = await firewallChain(d);
    if (chain === 'forward') {
      await d.click(chainButton(d, 'forward'), 'Choose forward');
      await d.click(await firewallRow(d, text => /кінець списку/.test(text)), 'Choose the end of forward');
      await d.press('Перевірити', 'Commit the end-of-chain prediction');
      if (await d.page.locator('[data-help-current][data-help-tone="ok"]').count()) { await d.shot('default-accept'); found = true; break; }
    } else await d.reveal();
    if (!await d.button('Наступний пакет →').count()) break;
    await d.press('Наступний пакет →', 'Move to the next packet');
  }
  if (!found) throw new Error('No packet decided by the end of forward in the round');
  await d.open(); d.note('Restart the same seeded round to reveal every packet');
  for (let i = 0; i < 20; i++) {
    await d.reveal();
    if (!await d.button('Наступний пакет →').count()) { await d.shot('done'); break; }
    await d.press('Наступний пакет →', 'Move to the next packet');
    // R5: each level 2 card's first view (its destination's label and fields), gate only.
    if (i < 5) await d.gate(`l2-card${i + 2}`);
    if (i === 19) throw new Error('Firewall round did not finish within 20 packets');
  }
  // Level 1: the chain only, three packets.
  await d.open(); await d.radio(/^1 · Куди йде пакет/, 'Choose level 1 (where the packet goes)'); await d.shot('l1-first');
  await d.press('Світла тема', 'Switch to light theme with the shell button'); await d.shot('l1-first', 'light');
  await d.press('Темна тема', 'Switch back to dark theme with the shell button');
  const first = await firewallChain(d);
  await d.click(chainButton(d, first === 'input' ? 'forward' : 'input'), 'Choose the other chain');
  await d.press('Перевірити', 'Commit the wrong chain (level 1 has no retry)'); await d.feedback(); await d.shot('l1-wrong');
  await d.open(); await d.radio(/^1 · Куди йде пакет/, 'Choose level 1 again in a fresh page');
  for (let i = 0; i < 6; i++) {
    const chain = await firewallChain(d);
    await d.click(chainButton(d, chain), `Choose ${chain}`);
    await d.press('Перевірити', 'Commit the chain');
    if (!await d.button('Наступний пакет →').count()) { await d.shot('l1-done'); return; }
    await d.press('Наступний пакет →', 'Move to the next packet');
    // R5: each level 1 card's first view (its destination's label and lines), gate only.
    if (i < 2) await d.gate(`l1-card${i + 2}`);
  }
  throw new Error('Level 1 round did not finish');
}

async function vlanShots(d) {
  const base = baseOf(d.exercise.id);
  // R5 (round 5): the first view's «all» essentials, counted from the task (still the untouched first view).
  const wrong = await d.page.evaluate(vlanCounts, essentialsOf(base, 'first'));
  if (wrong.length) throw new Error(`R5 first view: ${wrong.map(w => `${w.sel}: ${w.reason}`).join('; ')}`);
  d.note('R5: every «all» essential matches its count from the task');
  if (base === 'vl-predict') {
    await d.press('Перевірити', 'Check before selecting any receivers (says what it waits for)'); await d.feedback(); await d.shot('wrong');
    for (let i = 0; i < 20; i++) {
      await d.press('Нікому', 'Predict that nobody receives this frame');
      await d.press('Перевірити', 'Commit the prediction and disclose the actual receivers');
      if (i === 0) await d.shot('step2');
      if (await d.page.locator('.ng-vl-done').count()) { await d.shot('done'); return; }
      await d.press('Наступний раунд →', 'Move to the next frame');
    }
    throw new Error('VLAN prediction did not finish within 20 rounds');
  }
  await d.press('Перевірити', 'Check the incomplete or unchanged configuration'); await d.feedback(); await d.shot('wrong');
  await d.hint(); await d.shot('hint');
  if (base === 'vl-fault') {
    // Round 4 (spec F6): checks → repair → cause. A failing check opens «Ремонт».
    await d.click(d.page.locator('.ng-vf-grid .ng-vf-row.is-no').first(), 'Tap a failing check: its path, and the repair stage');
    await d.shot('repair');
  }
  await d.reveal(); await d.shot('done');
  if (d.exercise.id !== 'vl-fault') return;   // the later states replay Cisco commands: the main exercise only
  await d.open(); const reference = await vlanReference(d);
  await d.open(); d.note('Replay the revealed repair in a fresh context (no hints, no reveal), without a cause');
  await vlanRepair(d, reference);
  await d.press('Перевірити', 'Check the repair (no cause chosen yet)');
  await d.page.locator('.ng-vf-causes').waitFor(); await d.shot('repair-pass');
  await chooseCause(d, '.ng-vf-causes', reference.cause); await d.shot('cause');
  await chooseCause(d, '.ng-vf-causes', reference.cause, true);
  await d.press('Перевірити', 'Check a plausible but wrong cause'); await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor(); await d.shot('wrong-cause');
  await d.click(d.page.locator('.ng-vf-stepper').getByRole('button', { name: /Ремонт/ }), 'Back to the repair stage');
  const field = d.page.locator('.ng-vf-repair input:not([type=radio]):not([type=checkbox])').first();
  await fill(d, field, `${await field.inputValue()},999`);
  if (await d.page.locator('.ng-vf-stepper [aria-disabled="true"]').count() !== 1) throw new Error('Editing the passing repair did not close «Причина»');
  await d.shot('edit-after-pass');
}

async function exerciseShots(d, light) {
  await d.open(); await d.first(light);
  const id = d.exercise.id;
  if (id === 'home') return;
  if (id === 'calc') {
    const inputs = d.page.locator('.ng-exercise-answer input');
    for (const input of await inputs.all()) await input.fill('');
    d.note('Clear both calculator inputs; its previous result remains visible by design'); await d.shot('empty');
    await inputs.nth(0).fill('192.168.10.42'); await inputs.nth(1).fill('/26');
    d.note('Enter 192.168.10.42 and /26'); await d.shot('done'); return;
  }
  if (id.startsWith('mask-')) return maskShots(d);
  if (id === 'binary') return binaryShots(d);
  if (id === 'rt-fault') return routingFaultShots(d);
  if (id.startsWith('rt-')) return routingShots(d);
  if (id.startsWith('fw-')) return firewallShots(d);
  if (id.startsWith('vl-')) return vlanShots(d);
  await d.press('Перевірити', 'Check the initial shuffled deck with missing prompts/commands'); await d.feedback(); await d.shot('wrong');
  await d.hint(); await d.shot('hint'); await d.reveal(); await d.shot('done');
}

// V2 runs independently of the v1 recipes. Reference answers cross contexts
// only as text read from the rendered UI; no app/bank imports or store writes.
const clean = text => text.replace(/\s+/gu, ' ').trim();
const linesOf = text => text.split('\n').map(s => s.trim()).filter(Boolean);
const sameText = (a, b) => clean(a) === clean(b);
const regexLiteral = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function fill(d, field, value) {
  await field.fill(String(value));
  // VLAN text fields commit on blur; use the keyboard path, including when
  // a reference repeats the value that was already shown.
  await field.press('Tab');
  d.note(`Enter ${await field.getAttribute('aria-label') ?? 'command'}: ${value}`);
}

async function allHints(d, name = 'hints-all') {
  let total = null, opened = 0;
  for (let i = 0; i < 20; i++) {
    const button = d.button(/Підказка \d+ з \d+/);
    if (!await button.count()) throw new Error(`Hint ladder disappeared after ${opened} rungs`);
    const match = (await button.innerText()).match(/Підказка (\d+) з (\d+)/);
    if (!match || Number(match[1]) !== opened + 1 || (total !== null && total !== Number(match[2]))) throw new Error('Hint ladder changed unexpectedly');
    total = Number(match[2]);
    await d.click(button, `Open hint ${++opened} of ${total}`);
    if (opened === 2) await d.gate('hint2');
    if (opened === total) {
      const hooks = d.page.locator('[data-help="hint"]');
      const rungs = await hooks.count() ? hooks : d.page.locator('.ng-hints-list > li');
      if (await rungs.count() !== total) throw new Error('Not every hint rung is rendered (current item or folded history)');
      if (total < 2) d.skip('hint2', 'This task has only one hint');
      await d.shot(name); return;
    }
  }
  throw new Error('Hint ladder exceeded 20 rungs');
}

function parseRoute(text) {
  const m = text.match(/^ip route (\S+) (\S+) (\S+)(?: (\d+))?$/);
  if (!m) throw new Error(`Cannot parse displayed Cisco route: ${text}`);
  return { net: m[1], mask: m[2], gw: m[3], distance: m[4] ?? '1' };
}
async function enterRoute(d, row, route, mikrotik = false) {
  if (mikrotik) {
    const prefix = route.mask.split('.').reduce((n, octet) => n + Number(octet).toString(2).replace(/0/g, '').length, 0);
    await fill(d, row.getByRole('textbox', { name: 'Мережа призначення (dst-address)', exact: true }), `${route.net}/${prefix}`);
    await fill(d, row.getByRole('textbox', { name: 'Шлюз — адреса сусіда (gateway)', exact: true }), route.gw);
  } else {
    for (const [label, value] of [['Мережа', route.net], ['Маска', route.mask], ['Адреса сусіда (next-hop)', route.gw]]) await fill(d, row.getByRole('textbox', { name: label, exact: true }), value);
  }
  const distance = row.getByRole('textbox', { name: 'Відстань (distance)', exact: true });
  if (await distance.count()) await fill(d, distance, route.distance);
  else if (route.distance !== '1') throw new Error('Displayed route needs distance but its field is missing');
}
/** The task's routers: the router row's buttons; a one-router task has no row (round 5 5b-2), its rows' heading names it. */
async function routerNames(d) {
  const names = (await d.page.locator('.ng-rt-routers .ng-rt-router').allTextContents()).map(clean);
  if (names.length) return names;
  const heading = clean(await d.page.locator('.ng-rt-work .ng-rt-card .ng-rt-caption').first().innerText());
  const lone = heading.match(/—\s*(\S+)$/u)?.[1];
  if (!lone) throw new Error(`Cannot read the router's name from «${heading}»`);
  return [lone];
}
/** Select a router by its button (a one-router task has none: it is always selected). */
async function selectRouter(d, name, description) {
  const button = d.page.locator('.ng-rt-routers').getByRole('button', { name, exact: true });
  if (await button.count()) await d.click(button, description);
}
async function routingReference(d) {
  if (d.exercise.id === 'rt-mikrotik') await d.radio('Cisco', 'Read reference routes in Cisco syntax');
  const names = await routerNames(d);
  const routes = [];
  // Round 4: one reveal, applied to the rows; each router shows its own.
  await d.reveal();
  for (const name of names) {
    await selectRouter(d, name, `Read reference for ${name}`);
    routes.push({ name, routes: linesOf(await d.page.locator('.ng-rt-commands').innerText()).filter(s => s.startsWith('ip route ')).map(parseRoute) });
  }
  if (!routes.some(r => r.routes.length)) throw new Error('Reference contains no routes');
  return routes;
}
async function routingReplay(d, reference, mistake = false) {
  if (d.exercise.id === 'rt-hard') await d.radio('Без готових рядків', 'Replay the revealed routes in the free route editor');
  let changed = false;
  for (const router of reference) {
    await selectRouter(d, router.name, `Select ${router.name}`);
    for (const [i, route] of router.routes.entries()) {
      const free = ['rt-hard', 'rt-free'].includes(d.exercise.id);
      if (free) await d.press(FREE_ADD, 'Add the reference route');
      const row = free ? d.page.locator('.ng-rt-free-row').last() : d.page.locator('.ng-rt-rowlist .ng-rt-row').nth(i);
      const entered = { ...route };
      if (mistake && !changed) {
        const own = (await d.page.locator('.ng-rt-ifaces').innerText()).match(/\b(?:\d{1,3}\.){3}\d{1,3}(?=\/)/g)?.find(ip => ip !== route.gw);
        if (!own) throw new Error('Cannot read a real non-neighbour IP for wrong next hop');
        entered.gw = own; changed = true;
        d.note('Use this router’s own real interface address as next hop instead of its neighbour');
      }
      await enterRoute(d, row, entered, d.exercise.id === 'rt-mikrotik');
    }
  }
  if (mistake && !changed) throw new Error('No route was changed for the conceptual mistake');
  await d.press('Перевірити', 'Check all entered routes');
  if (mistake) {
    if (await d.page.locator('.ng-rt[data-lap]').count()) throw new Error('Wrong next hop unexpectedly solved the network');
    await d.page.locator('[data-help-current][data-help-tone="no"]').first().waitFor();
  } else await d.page.locator('.ng-rt[data-lap=done]').waitFor();
}

async function faultReference(d) {
  await d.reveal();
  const heading = await d.page.locator('.ng-rf-reveal-head').innerText();
  const router = heading.match(/на (\S+)/)?.[1];
  if (!router) throw new Error('Cannot read the revealed repair router');
  return { router, before: await d.page.locator('.ng-rf-change .is-was dd').innerText(),
    after: parseRoute(await d.page.locator('.ng-rf-change .is-now dd').innerText()),
    cause: clean((await d.page.locator('.ng-rf-reveal-cause').innerText()).replace(/^Причина:\s*/, '')).replace(/\.$/, '') };
}
async function chooseCause(d, selector, cause, wrong = false) {
  const radios = d.page.locator(selector).getByRole('radio');
  let chosen;
  for (const radio of await radios.all()) {
    // Native inputs get their accessible name from the enclosing label.
    const label = clean(await radio.evaluate(el => el.closest('label')?.textContent ?? el.textContent)).replace(/\.$/, '');
    if (sameText(label, cause) !== wrong) { chosen = radio; break; }
  }
  if (!chosen) throw new Error(`Cannot match ${wrong ? 'another' : 'revealed'} cause in the displayed options: ${cause}`);
  await d.click(chosen, wrong ? 'Choose a plausible but wrong cause' : `Choose the revealed cause: ${cause}`);
}
async function faultReplay(d, reference, mistake = false) {
  await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: reference.router, exact: true }), `Select ${reference.router}`);
  if (mistake) {
    await d.press('+ Маршрут', 'Add a correct-looking route to an unrelated network, leaving the fault in place');
    await enterRoute(d, d.page.locator('.ng-rf-rowlist .ng-rt-row').last(), { ...reference.after, net: '203.0.113.0', mask: '255.255.255.0' });
    await d.press('Перевірити', 'Check the edit that does not repair the fault');
    await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor(); return;
  }
  let original;
  if (reference.before.startsWith('ip route ')) original = parseRoute(reference.before);
  let row;
  if (!original) { await d.press('+ Маршрут', 'Add the missing route'); row = d.page.locator('.ng-rf-rowlist .ng-rt-row').last(); }
  else for (const candidate of await d.page.locator('.ng-rf-rowlist .ng-rt-row').all()) {
    const values = await Promise.all((await candidate.getByRole('textbox').all()).map(f => f.inputValue()));
    if (values.slice(0, 3).join(' ') === [original.net, original.mask, original.gw].join(' ')) { row = candidate; break; }
  }
  if (!row) throw new Error('Cannot find the revealed before-route in the fresh context');
  await enterRoute(d, row, reference.after);
  await d.press('Перевірити', 'Check the replayed repair');
  await d.page.locator('.ng-rf-causes').waitFor();
  await chooseCause(d, '.ng-rf-causes', reference.cause);
  await d.press('Перевірити', 'Check the cause in the second step');
  await d.page.locator('[data-help-current][data-help-tone="ok"][data-help-scope="task"]').waitFor();
  if (await d.page.locator('.ng-rf .ng-help-check').count()) throw new Error('Cause replay did not complete the fault exercise');
}

/** Round 4 (spec R2 v2/v3): a wrong cause after a passing repair; the
 * original table open; in the cause step, the start's pings and a failing
 * ping's original path. */
async function faultExtraShots(exercise, withDriver) {
  if (exercise.id !== 'rt-fault') return;
  let reference;
  const read = await withDriver('wrong-cause', async d => { await d.open(); reference = await faultReference(d); });
  if (!read) return;
  const repaired = async d => {
    await d.open();
    d.note('Read the reference repair in another fresh context; replay it here with the same seed');
    await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: reference.router, exact: true }), `Select ${reference.router}`);
    let original, row;
    if (reference.before.startsWith('ip route ')) original = parseRoute(reference.before);
    if (!original) { await d.press('+ Маршрут', 'Add the missing route'); row = d.page.locator('.ng-rf-rowlist .ng-rt-row').last(); }
    else for (const candidate of await d.page.locator('.ng-rf-rowlist .ng-rt-row').all()) {
      const values = await Promise.all((await candidate.getByRole('textbox').all()).map(f => f.inputValue()));
      if (values.slice(0, 3).join(' ') === [original.net, original.mask, original.gw].join(' ')) { row = candidate; break; }
    }
    if (!row) throw new Error('Cannot find the revealed before-route in the fresh context');
    await enterRoute(d, row, reference.after);
    await d.press('Перевірити', 'Check the replayed repair');
    await d.page.locator('.ng-rf-causes').waitFor();
  };
  await withDriver('wrong-cause', async d => {
    await repaired(d);
    await chooseCause(d, '.ng-rf-causes', reference.cause, true);
    await d.press('Перевірити', 'Check a plausible but wrong cause');
    await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor();
    await d.shot('wrong-cause');
  });
  await withDriver('original-paths', async d => {
    await repaired(d);
    await d.radio('на початку', 'Show the pings as they were at the start');
    const failing = d.page.locator('.ng-rf-pings .ng-rf-ping.is-fail').first();
    await d.click(failing.locator('.ng-rt-checkline-body'), 'Draw a failing ping\'s original path');
    await d.shot('original-paths');
  });
  await withDriver('original', async d => {
    await d.open();
    await d.press('Перевірити', 'Check the unchanged faulty routes');
    await d.press('Початкова таблиця', 'Open the original table, read-only');
    // Declared target: the table itself, with the gate's full clipping and occlusion checks.
    await d.shot('original');
  });
  // Every ping passes but the repair covers one host (/32): a coverage finding; its router's table is the evidence.
  await withDriver('coverage', async d => {
    await d.open();
    await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: reference.router, exact: true }), `Select ${reference.router}`);
    let original, row;
    if (reference.before.startsWith('ip route ')) original = parseRoute(reference.before);
    if (!original) { await d.press('+ Маршрут', 'Add a route'); row = d.page.locator('.ng-rf-rowlist .ng-rt-row').last(); }
    else for (const candidate of await d.page.locator('.ng-rf-rowlist .ng-rt-row').all()) {
      const values = await Promise.all((await candidate.getByRole('textbox').all()).map(f => f.inputValue()));
      if (values.slice(0, 3).join(' ') === [original.net, original.mask, original.gw].join(' ')) { row = candidate; break; }
    }
    if (!row) throw new Error('Cannot find the revealed before-route');
    await enterRoute(d, row, { ...reference.after, net: reference.after.net.replace(/\.\d+$/, '.2'), mask: '255.255.255.255' });
    d.note('A route to the one host the pings use (/32), not the whole network');
    await d.press('Перевірити', 'Check a repair that passes the pings but not the whole network');
    await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor();
    await d.shot('coverage');
  });
  // A long table (rows added until it is taller than half the visible band) with its first row malformed:
  // the panel anchors right after the flagged row (Astra recheck 2).
  await withDriver('form-long', async d => {
    await d.open();
    const band = (d.page.viewportSize().height - 52) / 2;
    for (let n = 0; n < 12 && ((await d.page.locator('.ng-rf-rows').boundingBox())?.height ?? 0) <= band; n++) await d.press('+ Маршрут', 'Add an empty route row');
    if (((await d.page.locator('.ng-rf-rows').boundingBox())?.height ?? 0) <= band) throw new Error('The table did not grow past half the band');
    await fill(d, d.page.locator('.ng-rf-rowlist .ng-rt-row').first().getByRole('textbox').first(), '10.1');
    await d.press('Перевірити', 'Check with the first row malformed in a long table');
    await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor();
    await d.shot('form-long');
  });
  // A form error on a router other than the one shown: the check opens it, the marked row is the evidence.
  await withDriver('form-elsewhere', async d => {
    await d.open();
    await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: reference.router, exact: true }), `Select ${reference.router}`);
    await fill(d, d.page.locator('.ng-rf-rowlist .ng-rt-row').first().getByRole('textbox').first(), '10.1');
    const other = (await d.page.locator('.ng-rt-routers .ng-rt-router').allTextContents()).map(clean).find(name => name !== reference.router);
    await d.click(d.page.locator('.ng-rt-routers').getByRole('button', { name: other, exact: true }), `Select ${other}`);
    await d.press('Перевірити', 'Check with a malformed row on the other router');
    await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor();
    await d.shot('form-elsewhere');
  });
}

async function reorder(d, selector, target, texts) {
  // Move by the public keyboard handle; selection is always by the learner's
  // visible command/description, never opaque task IDs.
  const rows = d.page.locator(`${selector} > li`);
  const current = await texts(rows);
  const from = current.findIndex(text => sameText(text, target.text));
  if (from < 0 || current.filter(text => sameText(text, target.text)).length !== 1) throw new Error(`Cannot uniquely match reorder row: ${target.text}`);
  if (from === target.index) return;
  const handle = rows.nth(from).locator('.ng-reorder-handle');
  await handle.press('Space');
  await d.page.keyboard.press('Home');
  for (let i = 0; i < target.index; i++) await d.page.keyboard.press('ArrowDown');
  await d.page.keyboard.press('Space'); await d.settle();
  d.note(`Move ${target.text} to position ${target.index + 1}`);
}
async function firewallReference(d) {
  await d.reveal();
  const order = (await d.page.locator('.ng-fwo-answer > li').allTextContents()).map(clean);
  if (!order.length) throw new Error('No firewall rules in the revealed answer');
  return order;
}
async function firewallReplay(d, reference, solved = true) {
  const texts = async rows => Promise.all((await rows.all()).map(async row => clean([
    await row.locator('.ng-fwo-chain').innerText(), await row.locator('.ng-fw-action').innerText(), await row.locator('.ng-fwo-desc').innerText(),
  ].join(' '))));
  for (const [index, text] of reference.entries()) await reorder(d, '.ng-fwo-list .ng-reorder', { index, text }, texts);
  await d.press('Перевірити', 'Check the replayed firewall rule order');
  if (solved) await d.page.locator('.ng-fwo.is-solved').waitFor();
}

// Setup decks (round 4): a row is known by its visible command (or, for the
// MikroTik login check, its step words); the revealed answer is the script
// on the board, each command line with the prompt it is typed at.
async function setupTexts(rows) {
  return Promise.all((await rows.all()).map(async row => clean(await row.locator('.ng-su-cmd, .ng-su-step').first().innerText()).replace(/^✋\s*/u, '')));
}
async function setupReference(d) {
  const deck = d.page.locator('.ng-su-board .ng-reorder > li');
  const texts = await setupTexts(deck);
  const step = (await d.page.locator('.ng-su-board .ng-su-step').count()) ? clean(await d.page.locator('.ng-su-board .ng-su-step').first().innerText()).replace(/^✋\s*/u, '') : null;
  await d.reveal();
  const cards = [];
  for (const line of await d.page.locator('.ng-su-board .ng-su-line').all()) {
    const kind = await line.getAttribute('class');
    const command = clean(await line.locator('.ng-su-text').innerText());
    const gutter = await line.locator('.ng-su-gutter').count() ? clean(await line.locator('.ng-su-gutter').innerText()) : null;
    if (/\bis-pause\b/.test(kind)) { if (!step) throw new Error('A login check in the script without its card'); cards.push({ text: step, command, mode: null }); continue; }
    if (!/\bis-command\b/.test(kind)) continue;
    if (!texts.some(t => sameText(t, command))) throw new Error(`Cannot associate reference command with a displayed card: ${command}`);
    cards.push({ text: command, command, mode: gutter });
  }
  if (cards.length !== texts.length || new Set(cards.map(c => c.text)).size !== texts.length) throw new Error('Reference script does not map one-to-one to every setup card');
  // The recall lines' commands: shown in their fields by recall's own reveal (Cisco decks).
  let recall = [];
  if (await d.button(/^Тепер по пам/u).count()) {
    await d.press(/^Тепер по пам/u, 'Continue to recall in the reference context');
    await d.reveal();
    recall = await Promise.all((await d.page.locator('.ng-su-recall-line').all()).map(async line => ({
      description: clean(await line.locator('.ng-su-recall-desc').innerText()).replace(/^\d+\.\s*/u, '').replace(/\s*показано$/u, ''),
      command: await line.locator('input').inputValue(),
    })));
  }
  return { cards, recall };
}
async function setupReplay(d, reference, mistake = false) {
  const order = [...reference.cards];
  if (mistake) {
    // Invert one real dependency, leaving every other pair in reference order.
    const id = d.exercise.id;
    const first = id === 'setup-mikrotik' ? /^\/interface bridge add / : id === 'setup-switch' ? /^hostname / : /^ip domain-name /;
    const second = id === 'setup-mikrotik' ? /^\/interface bridge port add / : id === 'setup-switch' ? /^write memory$/ : /^crypto key generate /;
    const a = order.findIndex(c => first.test(c.command)), b = order.findIndex(c => second.test(c.command));
    if (a < 0 || b <= a) throw new Error('Cannot find a displayed dependency pair to swap');
    [order[a], order[b]] = [order[b], order[a]];
    d.note(id === 'setup-mikrotik' ? 'Swap the bridge/port dependency pair' : id === 'setup-switch' ? 'Swap the save card with the first card' : 'Swap the domain/key dependency pair');
  }
  for (const [index, card] of order.entries()) await reorder(d, '.ng-su-board .ng-reorder', { index, text: card.text }, setupTexts);
  for (const [index, card] of order.entries()) {
    const prompts = d.page.locator('.ng-su-board .ng-reorder > li').nth(index).getByRole('radiogroup');
    if (card.mode && await prompts.count()) await d.click(prompts.getByRole('radio', { name: card.mode, exact: true }), `Choose ${card.mode} for ${card.text}`);
  }
  await d.press('Перевірити', 'Check the replayed setup deck');
  await d.page.locator(mistake ? '[data-help-current][data-help-tone="no"]' : '.ng-su.is-sorted').waitFor();
}
/** Type a recall line (by its description) and press Enter. */
async function recallLine(d, reference, index, wrong = false) {
  const line = d.page.locator('.ng-su-recall-line').nth(index);
  const description = clean(await line.locator('.ng-su-recall-desc').innerText()).replace(/^\d+\.\s*/u, '');
  const known = reference.recall.find(r => sameText(r.description, description));
  if (!known) throw new Error(`No recall command read for: ${description}`);
  const value = wrong ? `x${known.command}` : known.command.replace(/<пароль>/g, 'Practice!Example1');
  const field = line.locator('input');
  await field.fill(value); await field.press('Enter'); await d.settle();
  d.note(`${wrong ? 'Mistype the first word of' : 'Type'} recall line ${index + 1} and press Enter`);
}
/** The setup decks' added states (spec S v2 shots table), each in a fresh
 * context after the deck is replayed from a reference read in another one. */
async function setupExtra(exercise, withDriver) {
  if (!exercise.id.startsWith('setup-')) return;
  await withDriver('shown-own', async d => {
    await d.open(); await d.reveal();
    await d.press('Моя відповідь', 'Show my own order beside the revealed answer'); await d.shot('shown-own');
  });
  if (!exercise.states.includes('recall-first')) return;
  let reference;
  if (!await withDriver('recall-first', async d => {
    await d.open(); reference = await setupReference(d);
    if (reference.recall.length !== 3) throw new Error('Expected three recall lines in the reference');
  })) return;
  const solved = async d => {
    await d.open();
    d.note('Read the reference answer and recall commands in another fresh context; replay the deck here with the same seed');
    await setupReplay(d, reference);
    await d.press(/^Тепер по пам/u, 'Continue to recall');
  };
  await withDriver('recall-first', async d => {
    await solved(d); await d.shot('recall-first');
    const empty = d.page.locator('.ng-su-recall-line input').first();
    await empty.press('Enter'); await d.settle(); d.note('Press Enter on the empty first line'); await d.shot('recall-wrong');
    await empty.press('Enter'); await d.settle(); d.note('Press Enter on it again'); await d.shot('recall-repeat');
    await recallLine(d, reference, 0, true); await d.shot('recall-mistake');
    await recallLine(d, reference, 0); await d.shot('recall-partial');
    await d.hint(); await d.shot('recall-hint');
    for (const n of [2, 3]) await d.press(new RegExp(`^Підказка ${n} з`, 'u'), `Open recall hint ${n}`);
    await d.shot('recall-hints-all');
    await recallLine(d, reference, 2, true); await d.shot('recall-late');
    const last = d.page.locator('.ng-su-recall-line input').nth(2);
    await last.fill(''); await d.settle();
    d.note('Edit the checked third line (its verdict goes «до змін»)'); await d.shot('recall-edit');
    await recallLine(d, reference, 2); await d.shot('recall-recheck');
    await recallLine(d, reference, 1); await d.shot('recall-solved');
  });
  await withDriver('recall-done', async d => { await solved(d); await d.reveal(); await d.shot('recall-done'); });
  await withDriver('recall-skip', async d => { await solved(d); await d.press(/^Далі/u, 'Skip recall with «Далі →»'); await d.shot('recall-skip'); });
}

async function maskMistake(d, choices = false) {
  const given = await d.page.locator('.ng-exercise-stage').innerText();
  const ips = given.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  if (!ips || ips.length < 2) throw new Error('Cannot read mask task address/mask');
  const a = ips[0].split('.').map(Number), m = ips[1].split('.').map(Number);
  const network = a.map((v, i) => v & m[i]).join('.');
  const broadcast = a.map((v, i) => (v & m[i]) | (255 ^ m[i]));
  const n = broadcast.reduce((v, o) => v * 256 + o, 0);
  const dotted = value => [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
  const values = [network, dotted(n - 1)];
  for (const [i, name] of ['Адреса мережі', 'Широкомовна адреса'].entries()) {
    if (choices) {
      const group = d.page.getByRole('radiogroup', { name: `${name}: варіанти`, exact: true });
      let value = values[i];
      if (i && !await group.getByRole('radio', { name: value, exact: true }).count()) value = dotted(n + 1);
      await d.click(group.getByRole('radio', { name: value, exact: true }), `Choose ${name}: ${value}${i ? ' (broadcast off by one)' : ''}`);
    } else await fill(d, d.page.getByRole('textbox', { name, exact: true }), values[i]);
  }
  await d.press('Перевірити', 'Check the right network and broadcast off by one');
  await d.page.locator('[data-help-current][data-help-tone="no"]').first().waitFor();
}

/** The mask's chips (round 4 spec R4 v3): the card-wide link from the start,
 * the offer after a typed wrong check, a right typed field kept, the fit task. */
async function maskBlockValues(d) {
  const given = await d.page.locator('.ng-exercise-stage').innerText();
  const ips = given.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  if (!ips || ips.length < 2) throw new Error('Cannot read the address and dotted mask from the task');
  const a = ips[0].split('.').map(Number), m = ips[1].split('.').map(Number);
  return [a.map((v, i) => v & m[i]).join('.'), a.map((v, i) => (v & m[i]) | (255 ^ m[i])).join('.')];
}
async function chooseAll(d, values) {
  for (const [i, name] of ['Адреса мережі', 'Широкомовна адреса'].entries()) {
    await d.click(d.page.getByRole('radiogroup', { name: `${name}: варіанти`, exact: true }).getByRole('radio', { name: values[i], exact: true }), `Choose ${name}: ${values[i]}`);
  }
}
async function maskChoiceShots(exercise, withDriver) {
  if (exercise.id !== 'mask-type') return;
  const toChips = d => d.press('Обрати з варіантів', 'Switch the whole card to option chips (the quiet link)');
  await withDriver('choices', async d => {
    await d.open(); await toChips(d); await d.shot('choices-first');
    await d.press('Перевірити', 'Check with nothing chosen'); await d.feedback(); await d.shot('choices-wrong');
    await d.hint(); await d.shot('choices-hint');
    await d.reveal(); await d.shot('choices-done');
  });
  await withDriver('choices-solved', async d => {
    await d.open(); await toChips(d);
    await chooseAll(d, await maskBlockValues(d));
    await d.press('Перевірити', 'Check the chosen block addresses');
    await d.page.locator('[data-help-current][data-help-tone="ok"]').first().waitFor();
    await d.shot('choices-solved');
  });
  await withDriver('choices-hints-all', async d => { await d.open(); await toChips(d); await allHints(d, 'choices-hints-all'); });
  await withDriver('choices-mistake', async d => { await d.open(); await toChips(d); await maskMistake(d, true); await d.shot('choices-mistake'); });
  await withDriver('choices-offer', async d => {
    await d.open();
    const [network] = await maskBlockValues(d);
    await fill(d, d.page.getByRole('textbox', { name: 'Адреса мережі', exact: true }), '1.2.3.4');
    await fill(d, d.page.getByRole('textbox', { name: 'Широкомовна адреса', exact: true }), '1.2.3.5');
    await d.press('Перевірити', 'Check two typed wrong addresses');
    await d.page.locator('[data-help-current][data-help-tone="no"]').first().waitFor();
    await d.press('Показати варіанти', 'Take the offer (the card-wide link now reads «Показати варіанти»): the wrong fields become chips');
    await d.shot('choices-offer');
    await d.press('Перевірити', 'Check with the chips not chosen yet'); d.note(`(the network would be ${network})`);
  });
  await withDriver('choices-partial', async d => {
    await d.open();
    const [network, broadcast] = await maskBlockValues(d);
    await fill(d, d.page.getByRole('textbox', { name: 'Адреса мережі', exact: true }), network);
    await fill(d, d.page.getByRole('textbox', { name: 'Широкомовна адреса', exact: true }), '1.2.3.5');
    await d.press('Перевірити', 'Check a right network and a wrong broadcast');
    await d.page.locator('[data-help-current][data-help-tone="no"]').first().waitFor();
    await d.press('Показати варіанти', 'Take the offer: only the wrong broadcast becomes chips');
    if (!await d.page.getByRole('textbox', { name: 'Адреса мережі', exact: true }).count()) throw new Error('The right typed network did not stay typed');
    await d.click(d.page.getByRole('radiogroup', { name: 'Широкомовна адреса: варіанти', exact: true }).getByRole('radio', { name: broadcast, exact: true }), `Choose the broadcast: ${broadcast}`);
    await d.press('Перевірити', 'Check the kept network and the chosen broadcast');
    await d.page.locator('[data-help-current][data-help-tone="ok"]').first().waitFor();
    await d.shot('choices-partial');
  });
  // Level 2's fit task (one field). The seed decides which kind level 2 draws: try a few «Далі».
  await withDriver('fit', async d => {
    await d.open(); await d.radio(/^2 ·/, 'Choose level 2 (/28–/30 and network size)');
    for (let i = 0; i < 12 && !await d.page.getByRole('textbox', { name: 'Маска', exact: true }).count(); i++) await d.press(/^Далі/, 'Next task, until a network-size task');
    if (!await d.page.getByRole('textbox', { name: 'Маска', exact: true }).count()) throw new Error('No network-size task within 12 tasks');
    await d.shot('fit-first');
    await fill(d, d.page.getByRole('textbox', { name: 'Маска', exact: true }), '/24');
    await d.press('Перевірити', 'Check a block that is too big');
    await d.page.locator('[data-help-current][data-help-tone="no"]').first().waitFor();
    await d.press('Показати варіанти', 'Take the offer: the mask becomes chips');
    await d.shot('fit-choices');
  });
}
async function binaryMistake(d) {
  const given = await d.page.locator('p[data-provenance=given]').innerText();
  const match = given.match(/(\d+\.\d+\.\d+\.\d+), маска \/(\d+)/);
  if (!match) throw new Error('Cannot read binary task address');
  const bits = match[1].split('.').map(v => Number(v).toString(2).padStart(8, '0')).join('');
  const wrong = (bits[0] === '1' ? '0' : '1') + bits.slice(1);
  await d.page.getByRole('button', { name: /, октет 1, біт 128:/ }).click();
  await d.page.keyboard.type(wrong); d.note('Type the correct address row with exactly its first bit inverted');
  await d.press('Перевірити', 'Check the row with one wrong bit');
  await d.page.locator('[data-help-current][data-help-tone="no"]').waitFor();
}

async function prepareExtra(d, state) {
  if (d.exercise.id === 'vl-route' && state === 'mistake') {
    // Task 1 gives the whole switch read-only. Task 2 is the first task with
    // an editable trunk, so use it for the requested missing-VLAN mistake.
    await d.click(d.page.getByRole('radiogroup', { name: 'Задача', exact: true }).getByRole('radio', { name: /^2 ·/ }), 'Choose VLAN routing task 2: its switch ports are editable');
  }
}
async function vlanReference(d) {
  await d.reveal();
  if (d.exercise.id === 'vl-fault') {
    const reveal = d.page.locator('.ng-vf-reveal');
    const paragraphs = await reveal.locator(':scope > p').allTextContents();
    const device = paragraphs[1]?.match(/\(([^,)]+)/)?.[1];
    const cause = clean(paragraphs[0]?.replace(/^Причина:\s*/, '') ?? '').replace(/\.$/, '');
    const commands = (await reveal.locator('.ng-vf-diff.is-now .ng-vl-cmd-line').allTextContents()).join('\n');
    if (!device || !cause || !commands) throw new Error('Cannot read VLAN fault cause/device/repair from the reveal');
    return { cause, devices: [{ device, commands }] };
  }
  const devices = [];
  for (const block of await d.page.locator('.ng-vl-reference > div').all()) {
    // textContent: the heading is upper-cased by CSS, so innerText isn't.
    const heading = clean(await block.locator('h3').textContent());
    const device = heading.match(/^Команди (\S+)$/i)?.[1];
    const commands = (await block.locator('.ng-vl-cmd-line').allTextContents()).join('\n');
    if (!device) throw new Error(`Cannot read VLAN reference device: ${heading}`);
    devices.push({ device, commands });
  }
  if (!devices.length) throw new Error('No VLAN command blocks in the reveal');
  return { devices };
}
async function vlanDevice(d, device) {
  const tabs = d.page.locator('.ng-vl-form-head .ng-vl-switches').getByRole('radio', { name: new RegExp(`^${regexLiteral(device)}(?: •)?$`) });
  if (await tabs.count()) await d.click(tabs, `Edit ${device}'s configuration`);
  else if (!(await d.page.locator('.ng-vl-form-head h2').innerText()).includes(device)) throw new Error(`No editor tab for ${device}`);
}
async function vlanCommands(d, commands, device) {
  await vlanDevice(d, device);
  if (await d.page.locator('.ng-vl-given-switch').count()) { d.note(`${device}'s entire configuration is given and read-only`); return; }
  const vlans = [], stanzas = [];
  let stanza;
  for (const line of linesOf(commands)) {
    if (/^vlan \d+$/.test(line)) { vlans.push(line.slice(5)); continue; }
    if (line.startsWith('interface ')) { stanza = { iface: line.slice(10), lines: [] }; stanzas.push(stanza); continue; }
    if (line.startsWith('ip default-gateway ')) {
      await fill(d, d.page.locator(`[id="vl-${device}-defaultGateway"]`), line.slice(19)); continue;
    }
    if (!stanza) throw new Error(`Unmapped VLAN command: ${line}`);
    stanza.lines.push(line);
  }
  if (vlans.length) {
    const vlanField = d.page.locator(`[id="vl-${device}-vlans"]`);
    if (!await vlanField.count()) throw new Error(`No VLAN creation field for ${device}`);
    // A fault reveal may contain a one-VLAN delta; retain the other VLANs.
    const current = await vlanField.inputValue();
    await fill(d, vlanField, [...new Set([...current.split(/[\s,]+/).filter(Boolean), ...vlans])].join(','));
  }
  for (const s of stanzas) {
    const portRows = d.page.locator('.ng-vl-form-table tbody > tr').filter({ has: d.page.locator('th', { hasText: new RegExp(`^${regexLiteral(s.iface)}(?:\\s—\\s\\S+)?$`) }) }); // «fa0/3 — PC1» (a no-break space before the PC)
    if (await portRows.count()) {
      const row = portRows.first();
      const group = row.getByRole('radiogroup');
      if (await group.getAttribute('aria-readonly') === 'true') { d.note(`${device} ${s.iface} is given and read-only`); continue; }
      for (const line of s.lines) {
        let m;
        // Round 5: a mode is named «доступ (access)», «транк (trunk)».
        if ((m = line.match(/^switchport mode (access|trunk)$/))) await d.click(group.getByRole('radio', { name: `${{ access: 'доступ', trunk: 'транк' }[m[1]]} (${m[1]})`, exact: true }), `Set ${device} ${s.iface} to ${m[1]}`);
        else if ((m = line.match(/^switchport access vlan (\d+)$/))) await fill(d, row.getByRole('textbox').first(), m[1]);
        // Round 5 repair v1: a trunk's list (and its native VLAN) are on the line under its row.
        else if ((m = line.match(/^switchport trunk allowed vlan (.+)$/))) await fill(d, trunkLine(row).getByRole('textbox').first(), m[1]);
        else if ((m = line.match(/^switchport trunk native vlan (\d+)$/))) {
          if (await trunkLine(row).getByRole('textbox').count() < 2) throw new Error('Native VLAN field is absent');
          await fill(d, trunkLine(row).getByRole('textbox').nth(1), m[1]);
        } else if (line !== 'switchport nonegotiate') throw new Error(`Unmapped switchport command: ${line}`);
      }
      continue;
    }
    const subif = s.iface.match(/^(.+)\.(\d+)$/);
    if (subif) {
      const rows = d.page.locator('.ng-vl-subifs > li');
      let row;
      for (const candidate of await rows.all()) {
        if (await candidate.locator('input').count()) {
          if (await candidate.locator('input').first().inputValue() === subif[2]) { row = candidate; break; }
        } else if ((await candidate.innerText()).includes(`interface ${s.iface}`)) { row = candidate; break; }
      }
      if (row && !await row.locator('input').count()) { d.note(`${device} ${s.iface} is given and read-only`); continue; }
      if (!row) {
        await d.click(d.page.locator(`[id="vl-${device}-subifs-add"]`), 'Add the displayed subinterface');
        row = rows.last(); await fill(d, row.locator('input').nth(0), subif[2]);
      }
      for (const line of s.lines) {
        let m;
        if ((m = line.match(/^encapsulation dot1Q (\d+)$/))) await fill(d, row.locator('input').nth(1), m[1]);
        else if ((m = line.match(/^ip address (.+)$/))) await fill(d, row.locator('input').nth(2), m[1]);
        else throw new Error(`Unmapped subinterface command: ${line}`);
      }
      continue;
    }
    if (/^vlan \d+$/.test(s.iface)) {
      await fill(d, d.page.locator(`[id="vl-${device}-svi-vid"]`), s.iface.slice(5));
      for (const line of s.lines) {
        if (!line.startsWith('ip address ')) throw new Error(`Unmapped SVI command: ${line}`);
        await fill(d, d.page.locator(`[id="vl-${device}-svi-address"]`), line.slice(11));
      }
      continue;
    }
    const physical = d.page.locator('.ng-vl-states').getByRole('radiogroup', { name: `${s.iface}: адміністративний стан`, exact: true });
    if (!await physical.count()) throw new Error(`Cannot map interface ${device} ${s.iface} to an editor`);
    for (const line of s.lines) {
      if (!['shutdown', 'no shutdown'].includes(line)) throw new Error(`Unmapped physical interface command: ${line}`);
      // Round 5 (5b-2 E): the option reads «увімкнено» over «(no shutdown)» (its name has both).
      if (await physical.getAttribute('aria-readonly') !== 'true') await d.click(physical.getByRole('radio', { name: `${line === 'shutdown' ? 'вимкнено' : 'увімкнено'} (${line})`, exact: true }), `Set ${device} ${s.iface}: ${line}`);
    }
  }
}
/** A Cisco trunk port's own line under its row: its allowed list and native VLAN (round 5 repair v1). */
const trunkLine = row => row.locator('xpath=following-sibling::tr[1][contains(concat(" ", @class, " "), " ng-vl-allowed-row ")]');
/** VLAN-3 (round 4): the repair is typed in the «Ремонт» stage. */
async function vlanRepair(d, reference) {
  await d.click(d.page.locator('.ng-vf-stepper').getByRole('button', { name: /Ремонт/ }), 'Open the repair stage');
  for (const { device, commands } of reference.devices) await vlanCommands(d, commands, device);
}
async function vlanReplay(d, reference, mistake = false) {
  if (d.exercise.id === 'vl-fault') {
    await vlanRepair(d, reference);
    await d.press('Перевірити', 'Check the repair first (checks → repair → cause)');
    await d.page.locator('.ng-vf-causes').waitFor();
    await chooseCause(d, '.ng-vf-causes', reference.cause, mistake);
  } else {
    for (const { device, commands } of reference.devices) await vlanCommands(d, commands, device);
  }
  if (d.exercise.id !== 'vl-fault' && mistake) {
    let changed = false;
    for (const { device } of reference.devices) {
      await vlanDevice(d, device);
      for (const row of await d.page.locator('.ng-vl-form-table tbody > tr').all()) {
        const group = row.getByRole('radiogroup');
        if (!await group.count() || await group.getAttribute('aria-readonly') === 'true') continue;
        const selected = group.locator('[aria-checked=true]');
        const mode = (await selected.textContent()).match(/\b(access|trunk)\b/)?.[1] ?? null;
        const field = row.getByRole('textbox').first();
        const value = await field.inputValue();
        if (mode === 'access') {
          // Use another VLAN already created on this switch.
          const vlans = (await d.page.locator(`[id="vl-${device}-vlans"]`).inputValue()).split(/[\s,]+/);
          const other = vlans.find(v => v && v !== value);
          if (!other) continue;
          await fill(d, field, other); d.note('Put one access port in the other real VLAN'); changed = true;
        } else if (mode === 'trunk') {
          const allowed = value.split(/[\s,]+/).filter(Boolean);
          if (allowed.length < 2) continue;
          await fill(d, field, allowed.slice(1).join(',')); d.note('Omit one required VLAN from the trunk allowed list'); changed = true;
        }
        if (changed) break;
      }
      if (changed) break;
    }
    if (!changed) throw new Error('Cannot find an editable access port or trunk for the VLAN mistake');
  }
  await d.press('Перевірити', mistake ? 'Check the plausible VLAN mistake' : 'Check the replayed VLAN configuration and cause');
  await d.page.locator(mistake ? '[data-help-current][data-help-tone="no"]' : '[data-help-current][data-help-tone="ok"]').waitFor();
  if (!mistake && await d.page.locator('[data-help="row"] button').filter({ hasText: /Підказка|Показати відповідь/ }).count()) throw new Error('VLAN feedback is positive but exercise is not finished');
}

async function readReference(d) {
  const id = d.exercise.id;
  if (id === 'rt-fault') return faultReference(d);
  if (id.startsWith('rt-')) return routingReference(d);
  if (id.startsWith('fw-order')) return firewallReference(d);
  if (id.startsWith('vl-')) return vlanReference(d);
  if (id.startsWith('setup-')) return setupReference(d);
  throw new Error(`No reference reader for ${id}`);
}
async function replay(d, reference, mistake = false) {
  const id = d.exercise.id;
  if (id === 'rt-fault') return faultReplay(d, reference, mistake);
  if (id.startsWith('rt-')) return routingReplay(d, reference, mistake);
  if (id.startsWith('fw-order')) return firewallReplay(d, reference);
  if (id.startsWith('vl-')) return vlanReplay(d, reference, mistake);
  return setupReplay(d, reference, mistake);
}

// One fresh context for every new state. A failure belongs to that state and
// cannot suppress v1 captures or any other added state.
async function extraShots(exercise, withDriver) {
  if (hasHints(exercise)) await withDriver('hints-all', async d => { await d.open(); await allHints(d); });
  for (const state of ['mistake', 'solved']) {
    if (!(state === 'mistake' ? mistakes : replays).has(exercise.id)) continue;
    let reference;
    if (!['mask-type', 'binary'].includes(exercise.id)) {
      const ok = await withDriver(state, async d => {
        await d.open(); await prepareExtra(d, state); reference = await readReference(d);
      });
      if (!ok) continue;
    }
    await withDriver(state, async d => {
      await d.open(); await prepareExtra(d, state);
      if (reference) {
        d.note('Read the reference answer in another fresh context; replay it here with the same seed, without opening hints or reveal');
        await replay(d, reference, state === 'mistake');
      } else if (exercise.id === 'binary') await binaryMistake(d);
      else await maskMistake(d);
      await d.shot(state);
      // MikroTik: the split script after success (both parts and their copy buttons, scrolled through).
      if (state === 'solved' && exercise.states.includes('checkpoint')) await d.shot('checkpoint');
      if (state === 'solved' && !notApplicable[exercise.id]?.['success-edit']) await successEdit(d);
    });
  }
  await setupExtra(exercise, withDriver);
  await maskChoiceShots(exercise, withDriver);
  await binaryLevelShots(exercise, withDriver);
  await faultExtraShots(exercise, withDriver);
}

async function successEdit(d) {
  // A solved fault ends in «Причина»: the repair is edited in «Ремонт» (round 4 repair, Astra 4).
  if (baseOf(d.exercise.id) === 'vl-fault') await d.click(d.page.locator('.ng-vf-stepper').getByRole('button', { name: /Ремонт/ }), 'Back to the repair stage to edit it');
  const fields = d.page.locator('.ng-screen input:not([type=radio]):not([type=checkbox]):not([readonly]):not(:disabled)');
  let edited = false, moved = null;
  for (const field of await fields.all()) if (await field.isVisible()) {
    const value = await field.inputValue();
    // Routing (repair 3): nothing moves while the learner types: the field stays where it is on screen
    // (the panel anchors beside the edited row; the browser's scroll anchoring keeps the row in place).
    await field.scrollIntoViewIfNeeded();
    const top = async () => (await field.boundingBox())?.y ?? 0;
    const before = await top();
    await fill(d, field, value === '0' ? '1' : '0'); edited = true;
    const after = await top();
    // Less than a line: the panel above a long board may change height as its verdict dims (its detail folds,
    // the hint button returns); nothing scrolls the field away.
    if (d.exercise.id.startsWith('rt-') && Math.abs(after - before) >= 24) moved = { before, after };
    break;
  }
  if (!edited) {
    const handles = d.page.locator('.ng-reorder-handle');
    if (await handles.count() > 1) {
      await handles.first().focus(); await d.page.keyboard.press('Space'); await d.page.keyboard.press('ArrowDown'); await d.page.keyboard.press('Space');
      d.note('Move the first solved row down one place'); edited = true;
    }
  }
  if (!edited) { d.skip('success-edit', 'The solved screen has no editable fields or reorder handles'); d.skip('success-recheck', 'No edit is available after success'); return; }
  const editGate = await d.gate('success-edit');
  if (moved) {
    const record = d.gates.at(-1);
    record.failures.push({ element: 'edited field', role: 'edit', reason: 'the edited field moved on screen while typing', distance: { top: moved.after - moved.before } });
    record.pass = false; editGate.pass = false;
  }
  const check = d.button(/^Перевірити(?: мережу)?$/u);
  if (!await check.count()) { d.skip('success-recheck', 'This screen replaces its check control after success'); return; }
  await d.click(check, 'Recheck the edited successful answer'); await d.gate('success-recheck');
}

/** Open the screen's worked example by its toggle (none: exampleRow fails the state). */
async function openExample(d) {
  const toggle = d.page.locator('[data-worked-example] > .ng-wex-toggle');
  if (await toggle.count() === 1) await d.click(toggle, 'Open the worked example («Приклад ▸ готова відповідь (інші числа)»)');
}

async function lifecycleGates(exercise, withDriver) {
  // Round 5 (spec 5b-2 A): the worked example, opened by its toggle on the untouched screen (gate-only).
  if (exampleRecipes.has(baseOf(exercise.id))) await withDriver('example-open', async d => {
    await d.open(); await openExample(d); await d.gate('example-open');
    // The opened card in the light theme too, on one firewall and one VLAN screen (5b-2 repair v1, Fable 5).
    if (['fw-order2', 'vl-route'].includes(exercise.id)) {
      await d.press('Світла тема', 'Switch to light theme with the shell button'); await d.gate('example-open', 'light');
      await d.press('Темна тема', 'Switch back to dark theme with the shell button');
    }
  });
  if (!hasHints(exercise)) return;
  await withDriver('reveal-next', async d => {
    await d.open(); await d.reveal();
    await d.gate('reveal', 'dark', baseOf(exercise.id) === 'fw-predict' ? { kind: 'verdict' } : {});
    const next = d.button(/^(?:Далі(?: →)?(?: ?, .+)?|Ще одна(?: →)?|Ще раз|Інші значення|Наступний пакет →)$/u);
    if (!await next.count()) { d.skip('reveal-next', 'The current screen offers no next action after reveal'); return; }
    await d.click(next.first(), 'Continue after revealing the answer'); await d.gate('reveal-next');
  });
  if (routerSwitch(exercise.id)) await withDriver('device-tab', async d => {
    await d.open(); await d.press('Перевірити', 'Check the empty table (it fails on the first router)');
    const routers = d.page.locator('.ng-rt-routers .ng-rt-router');
    let selected;
    for (const r of await routers.all()) if (await r.getAttribute('aria-pressed') !== 'true') { selected = r; break; }
    if (!selected) { d.skip('device-tab', 'One router only'); return; }
    await d.click(selected, 'Switch to the other router after the failing check (routing\'s device tab)'); await d.gate('device-tab');
  });
  if (['vl-ports', 'vl-route', 'vl-fault'].includes(baseOf(exercise.id))) await withDriver('device-tab', async d => {
    await d.open();
    // Round 4: «Налаштуй порти» task 1 has one switch; task 2 has two. VLAN-3's forms are in «Ремонт».
    if (exercise.id === 'vl-ports') await d.click(d.page.getByRole('radiogroup', { name: 'Задача', exact: true }).getByRole('radio', { name: /^2 ·/ }), 'Choose ports task 2: two switches');
    if (baseOf(exercise.id) === 'vl-fault') await d.click(d.page.locator('.ng-vf-stepper').getByRole('button', { name: /Ремонт/ }), 'Open the repair stage');
    await d.press('Перевірити', 'Check before changing device tab');
    const tabs = d.page.locator('.ng-vl-form-head .ng-vl-switches').getByRole('radio');
    let selected;
    for (const tab of await tabs.all()) if (await tab.getAttribute('aria-checked') !== 'true') { selected = tab; break; }
    if (!selected) { d.skip('device-tab', 'This task exposes only one device editor'); return; }
    await d.click(selected, 'Change the VLAN device tab after checking'); await d.gate('device-tab');
  });
  await withDriver('restore', async d => {
    await d.open(); await d.hint();
    await d.press('← Розділи', 'Leave the exercise with an open hint');
    // Observe restore effects without changing app state, focus or scrolling.
    // Install before the navigation click so synchronous layout effects count.
    await d.page.evaluate(() => {
      const events = [];
      // The shell focuses the new screen's heading on navigation (Shell.jsx): that is intended. Fail only when
      // focus lands elsewhere, e.g. in the help panel, a verdict or a hint.
      const focus = event => { if (event.target.closest?.('.ng-screen,.ng-bar') && !event.target.matches?.('h1[tabindex="-1"]')) events.push({ type: 'focus', element: event.target.outerHTML.slice(0, 240) }); };
      const scroll = event => { const el = event.target === document ? document.scrollingElement : event.target; if (el?.closest?.('.ng-screen') || el === document.scrollingElement) events.push({ type: 'scroll', top: el.scrollTop, left: el.scrollLeft }); };
      document.addEventListener('focusin', focus, true); document.addEventListener('scroll', scroll, true);
      window.__shotsRestoreAudit = { events, finish() { document.removeEventListener('focusin', focus, true); document.removeEventListener('scroll', scroll, true); return events; } };
    });
    await d.click(d.page.locator('.ng-card').filter({ has: d.page.locator('.ng-card-title', { hasText: sections[exercise.section] }) }), 'Restore the same exercise through the section card');
    const events = await d.page.evaluate(() => { const events = window.__shotsRestoreAudit.finish(); delete window.__shotsRestoreAudit; return events; });
    const result = await d.gate('restore');
    for (const event of events) if (event.type === 'focus' || event.top || event.left) result.failures.push({ element: event.element ?? '.ng-screen', role: 'restore', reason: event.type === 'focus' ? 'restore moved focus' : 'restore scrolled the page', distance: event.type === 'scroll' ? { top: event.top, left: event.left } : null });
    result.restoreEvents = events; result.pass = result.failures.length === 0;
    // gate() stores a copy so include the restore audit in the emitted record.
    Object.assign(d.gates.at(-1), result);
  });
}

export function gateSummary(gates) {
  return { states: gates.length, passed: gates.filter(g => g.pass === true).length, failed: gates.filter(g => g.pass === false).length, skipped: gates.filter(g => g.pass === null).length,
    partial: gates.filter(g => g.baseline === 'partial baseline').length, waived: gates.filter(g => g.waived?.length).length };
}

export async function writeIndex(out, selected, records, gaps, seconds, fatal, options, gates) {
  await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`);
  const summary = gateSummary(gates);
  const na = selected.flatMap(e => Object.entries(notApplicable[e.id] ?? {}).map(([state, reason]) => ({ exercise: e.id, state, reason })));
  await writeFile(path.join(out, 'gate.json'), `${JSON.stringify({ recipe: 'v3-visibility', commit, seed, mode: options.gate, sizes: options.sizes, summary, notApplicable: na, states: gates }, null, 2)}\n`);
  const lines = ['# NetGym review screenshots', '', `Recipe v3 (v2 screenshot names retained) · commit ${commit ?? 'unavailable'} (working tree) · seed ${seed} · Chromium ${browserVersion ?? 'unavailable'} · ${options.sizes.map(s => `${s.width}×${s.height}`).join(', ')} · scale 1 · reduced motion · ${seconds.toFixed(1)} seconds.`, '',
    `Visibility gate: **${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} unsupported/skipped**; ${summary.partial} partial baseline states; ${summary.waived} states with declared waivers; ${na.length} states not applicable by design (listed in gate.json). Mode: ${options.gate}. [gate.json](gate.json) records every state and size before screenshot scrolling. Legacy screens use fallback selectors: this baseline is partial, including evidence approximations.`, '',
    'The first requested size saves screenshots; other sizes run all action states as gate-only views (use `--narrow-shots` to save them). The six historical narrow first views are still saved when 1000×700 is a secondary size. Hint 2, lifecycle probes and an opened worked example (`example-open`) are gate-only; a worked example on any state is checked: its recipe registered (and present on a registered recipe\'s first views), one per screen, closed unless opened by its toggle; on first views directly under the action line, its target disjoint from other controls, its folded label visible, never an essential.', '',
    'Viewport PNGs in review order. Scroll images continue the same state; independently scrolling columns are traversed separately. `done` may be a reference reveal, not an earned solve; read the recorded steps. Light first views use the shell switch, once per selected section.', '',
    'The calculator starts with a result; empty inputs retain its stale result. VLAN prediction discloses the answer after each check and has no hint/reveal. VLAN fault finding asks the cause from the start; its step2 shows that existing question.', '',
    '`solved` is a checked replay in a fresh context after reading the reveal in another context with the same seed. It is earned through UI checks, with prior reference knowledge. `done` retains the v1 reveal. New states run independently. VLAN routing mistake uses task 2 because task 1 gives the whole switch read-only.', '',
    '## Coverage matrix', '', 'Numbers count viewport PNGs, including scroll continuations. Each missing requested cell includes its reason. N/A cells explain deliberate omissions; `first-light` is once per selected section. `first-narrow` is a separate fresh context.', ''];
  const columns = ['first', 'wrong', 'mistake', 'empty', 'hint', 'hints-all', 'step2', 'step3', 'step4', 'done', 'solved', 'first-narrow', 'first-light'];
  lines.push(`| Exercise | ${columns.join(' | ')} |`, `| --- | ${columns.map(() => '---').join(' | ')} |`);
  const omission = (e, state) => {
    if (state === 'first-narrow') return 'N/A: no narrow view requested';
    if (state === 'first-light') return 'N/A: section light view on another exercise';
    if (state === 'hints-all' || state === 'hint') return hasHints(e) ? 'N/A: first-hint view not requested for added typed deck' : 'N/A: no hints';
    if (state === 'empty') return 'N/A: calculator only';
    if (state.startsWith('step')) return 'N/A: no such step';
    if (state === 'solved') return 'N/A: no reveal replay requested';
    if (state === 'mistake') return 'N/A: no additional mistake requested';
    return 'N/A: no such state requested';
  };
  const cell = (e, state) => {
    const shots = records.filter(r => r.exercise === e.id && (state === 'first-narrow' ? r.state === 'first' && r.variant === 'narrow' : state === 'first-light' ? r.state === 'first' && r.theme === 'light' : r.state === state && r.theme === 'dark' && !r.variant));
    if (shots.length) return String(shots.length);
    const expected = state === 'first-narrow' ? narrows.has(e.id) && options.sizes.slice(1).some(s => s.width === 1000 && s.height === 700) : state === 'first-light' ? selected.find(item => item.section === e.section)?.id === e.id : e.states.includes(state);
    if (!expected) return omission(e, state);
    const gap = gaps.find(g => g.exercise === e.id && g.state === state) ?? gaps.find(g => g.exercise === e.id && g.state === '*');
    return `Missing: ${(gap?.reason.split('\n')[0] ?? 'capture did not complete').replace(/\|/g, '/').replace(/</g, '&lt;')}`;
  };
  for (const e of selected) lines.push(`| ${e.id} | ${columns.map(state => cell(e, state)).join(' | ')} |`);
  lines.push('');
  for (const e of selected) {
    const shots = records.filter(r => r.exercise === e.id);
    lines.push(`## ${e.id} — ${sections[e.section]} / ${e.title}`, '', `${shots.length} PNGs.`, '');
    for (const state of e.states) {
      for (const shot of shots.filter(r => r.state === state)) lines.push(`- [${shot.file}](${shot.file}) · ${shot.theme} · ${shot.words} words · ${shot.controls} controls · ${shot.scroll.below} px below`);
      if (!shots.some(r => r.state === state && r.theme === 'dark')) lines.push(`- Missing ${state}: ${gaps.find(g => g.exercise === e.id && (g.state === state || g.state === '*'))?.reason.split('\n')[0] ?? 'capture did not complete'}`);
    }
    for (const gap of gaps.filter(g => g.exercise === e.id && g.state !== '*')) lines.push(`- Gap (${gap.state}): ${gap.reason.split('\n')[0]}`);
    lines.push('');
  }
  if (fatal) lines.push('## Run failure', '', '```text', fatal, '```', '');
  if (summary.failed) {
    lines.push('## Gate failures', '', '| Exercise | State | Size | Baseline | Failing element / reason |', '| --- | --- | --- | --- | --- |');
    for (const g of gates.filter(g => g.pass === false)) lines.push(`| ${g.exercise} | ${g.state} | ${g.viewport.width}×${g.viewport.height} | ${g.baseline} | ${g.failures.map(f => `${f.element}: ${f.reason}`).join('; ').replace(/\|/g, '/').replace(/</g, '&lt;')} |`);
    lines.push('');
  }
  if (gaps.length) lines.push('## Diagnostics', '', '```json', JSON.stringify(gaps, null, 2), '```', '');
  lines.push('Metrics: visible text follows DOM reading order, counts whitespace-separated words, and includes visible input values/placeholders. Clipping, hidden accessibility text, sticky occlusion and the shell header/bar are excluded. Controls are visible enabled buttons, inputs, textareas, selects, links and interactive ARIA roles. Scroll measurements identify the captured area and include its current top offset.', '');
  await writeFile(path.join(out, 'README.md'), lines.join('\n'));
}

async function main() {
  const options = argumentsOf(process.argv.slice(2));
  if (options.help) { console.log('node tools/shots.mjs --out <dir> [--only <id,...>] [--sizes 1280x800,1000x700] [--narrow-shots] [--gate=report]\nDefault output: .shots/; default gate: enforce; every state runs at every size.\n' + exercises.map(e => `${e.id}: ${e.title}`).join('\n')); return; }
  const { out, selected } = options;
  // Refuse to overwrite an earlier set or unrelated directory. No recursive
  // output deletion: retakes should use a fresh directory for before/after.
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out);
  const started = performance.now(), records = [], gaps = [], gates = [], lightSections = new Set();
  let temporary, browser, fatal;
  try {
    commit = (await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })).stdout.trim();
    temporary = await mkdtemp(path.join(tmpdir(), 'netgym-shots-build-'));
    const web = path.join(temporary, 'web');
    const built = await run(process.execPath, [path.join(root, 'shell/frontend/node_modules/vite/bin/vite.js'), 'build', '--outDir', web, '--emptyOutDir'], {
      cwd: path.join(root, 'shell/frontend'), env: { ...process.env, NETGYM_TARGET: path.join(root, 'src/targets/netgym.js') }, maxBuffer: 8 * 1024 * 1024,
    });
    if (!(await stat(path.join(web, 'index.html'))).size) throw new Error('Vite did not emit index.html');
    if (built.stdout.trim()) console.log(built.stdout.trim());
    if (built.stderr.trim()) console.error(built.stderr.trim());
    console.log('Built netgym into a temporary directory');
    browser = await launchChromium();
    browserVersion = browser.version();
    async function withDriver(exercise, state, size, action, capture, variant) {
      let context;
      try {
        context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, locale: 'uk-UA', timezoneId: 'UTC', colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.addInitScript(({ seed }) => {
          let value = seed >>> 0;
          Math.random = () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296);
        }, { seed });
        await context.route('**/*', route => route.abort('blockedbyclient'));
        await context.route(`${origin}/**`, async route => {
          try {
            const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
            const file = path.resolve(web, `.${pathname === '/' ? '/index.html' : pathname}`);
            if (!file.startsWith(`${web}${path.sep}`) || !(await stat(file)).isFile()) return route.fulfill({ status: 404, body: 'Not found' });
            const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
            await route.fulfill({ status: 200, contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
          } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
        });
        const page = await context.newPage(); page.setDefaultTimeout(10000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        const d = new Driver(page, exercise, records, gaps, out, gates, capture, variant);
        await action(d);
        if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
        return true;
      } catch (error) {
        gaps.push({ exercise: exercise.id, state, viewport: size, reason: error.stack ?? String(error) });
        gates.push({ exercise: exercise.id, state, theme: 'dark', viewport: size, pass: false, baseline: 'not measured', failures: [{ element: 'recipe', reason: error.message, distance: null }] });
        console.error(`${exercise.id} (${state}): ${error.message}`);
        return false;
      } finally { await context?.close(); }
    }
    for (const exercise of selected) {
      for (const [index, size] of options.sizes.entries()) {
        const variant = index === 0 ? '' : size.width === 1000 && size.height === 700 ? 'narrow' : `${size.width}x${size.height}`;
        const capture = index === 0 || options.narrowShots;
        const drive = (state, action) => withDriver(exercise, state, size, action, capture, variant);
        await drive('*', async d => {
          // One light first view per section; per deck for the setup decks.
          const key = `${exercise.section === 'setup' ? exercise.id : exercise.section}:${index}`;
          await exerciseShots(d, !lightSections.has(key));
          lightSections.add(key);
        });
        await extraShots(exercise, drive);
        await lifecycleGates(exercise, drive);
      }
      console.log(`${exercise.id}: ${records.filter(r => r.exercise === exercise.id).length} PNGs`);
    }
  } catch (error) {
    fatal = error.stack ?? String(error);
    const reason = `Run failed before capture: ${error.message.split('\n')[0]}. See Run failure for the exact diagnostic.`;
    for (const e of selected) gaps.push({ exercise: e.id, state: '*', reason });
    console.error(fatal);
  } finally {
    await browser?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
    // Check requested states even after partially successful exercise flows.
    for (const e of selected) for (const state of e.states) {
      if (!records.some(r => r.exercise === e.id && r.state === state && r.theme === 'dark' && !r.variant) && !gaps.some(g => g.exercise === e.id && (g.state === '*' || g.state === state))) gaps.push({ exercise: e.id, state, reason: 'State was not captured' });
    }
    for (const e of selected.filter(e => narrows.has(e.id) && options.sizes.slice(1).some(s => s.width === 1000 && s.height === 700))) {
      if (!records.some(r => r.exercise === e.id && r.state === 'first' && r.variant === 'narrow') && !gaps.some(g => g.exercise === e.id && (g.state === '*' || g.state === 'first-narrow'))) gaps.push({ exercise: e.id, state: 'first-narrow', reason: 'Narrow first view was not captured' });
    }
    for (const section of new Set(selected.map(e => e.section))) {
      if (!records.some(r => r.section === sections[section] && r.state === 'first' && r.theme === 'light')) {
        const e = selected.find(e => e.section === section);
        if (!gaps.some(g => g.exercise === e.id && g.state === '*')) gaps.push({ exercise: e.id, state: 'first-light', reason: 'Section light-theme first view was not captured' });
      }
    }
    // A stopped recipe must not turn missing state/size pairs into a pass.
    for (const exercise of selected) for (const size of options.sizes) for (const state of gateStates(exercise)) {
      if (!gates.some(g => g.exercise === exercise.id && g.state === state && g.theme === 'dark' && g.viewport.width === size.width && g.viewport.height === size.height)) {
        gates.push({ exercise: exercise.id, state, theme: 'dark', viewport: size, pass: false, baseline: 'not measured', expected: expectedTargets(exercise.id, state), failures: [{ element: 'recipe', reason: 'expected state/size was not measured', distance: null }] });
      }
    }
    const seconds = (performance.now() - started) / 1000;
    await writeIndex(out, selected, records, gaps, seconds, fatal, options, gates);
    const summary = gateSummary(gates);
    console.log(`Gate: ${summary.passed} passed; ${summary.failed} failed; ${summary.skipped} unsupported/skipped; ${summary.partial} partial baseline states; ${summary.waived} with declared waivers (${options.gate})`);
    console.log(`${records.length} PNGs; ${gaps.length} gaps; ${seconds.toFixed(1)}s; ${out}`);
    if (gaps.length || options.gate !== 'report' && summary.failed) process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
