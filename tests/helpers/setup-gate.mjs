// The setup decks' structural and lifecycle leak gate (DR-1 spec v2 Q5,
// decks spec v2 C6, round 4 spec S), for a mounted screen
// (tests/helpers/mounted-setup.mjs, mini-dom) or any DOM with
// querySelectorAll, attributes and textContent. Besides setupLeaks' string
// scan, an ordering exercise can leak through structure: a list in the
// reference order, numbers that follow the reference instead of the
// position, a prompt chosen in advance, move buttons disabled by the
// dependencies, ids or data in attributes, a purpose or a Winbox path (DR-3's
// third line) on another card's row, the reference script before it is asked
// for, a recall line shown before it is typed. Every deck goes through it:
// what a deck offers (prompts) comes from capabilities(task). Each function
// returns a list of violations (empty: passes).
import { render, recallRows, scriptForState, cardText } from '../../src/sections/setup/logic/render.js';
import { explanation } from '../../src/sections/setup/logic/hints.js';
import { capabilities } from '../../src/sections/setup/logic/model.js';
import copy, { comprehension, text, ui } from '../../src/sections/setup/uk.js';
import { uk as shared } from '../../src/ui/uk.js';
import { setupLeaks } from './setup-leaks.mjs';

export const words = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** The element and every element under it. */
function elements(root) {
  const out = [];
  const walk = node => { if (node.nodeType === 1) out.push(node); for (const child of node.childNodes ?? []) walk(child); };
  walk(root);
  return out;
}
/** The help panel's status in words: its badge («✓ Так», «• Ще ні»), the sentence, «до змін». */
export const statusWords = root => words(root.querySelector('[role="status"]'));
/** A script part's own text: its lines, without the gutter, tags and paths (what the copy holds). */
export const scriptText = part => [...(part?.querySelectorAll('.ng-su-text') ?? [])].map(el => el.textContent).join('\n');

/** Every name a card goes by: its opaque per-seed id and its command's own id. */
export const identities = task => task.cards.flatMap(c => [c.id, c.commandId]).filter(Boolean);
/** Shared components' fixed class names that happen to contain a command id
 * (HintLadder's list and DR-3's `list`): the app's vocabulary, not a card's. */
const UI_CLASSES = new Set(['ng-hints-list']);
/** The panel's and the gate's own hooks (spec A1): they say what is current, never what is right.
 * Round 5's shared markers (empty): a row with a term and its purpose, the action line, the worked example. */
const HOOKS = /^data-(?:theme|layout|help|help-[\w-]+|evidence|term|purpose|action-line|worked-example)$/;
/** The deck's success words: DR-3 promises no prompts (`ok.dr-3`). */
export const okWords = task => text(`ok.${task.identity.taskId}` in copy ? `ok.${task.identity.taskId}` : 'ok');
/** A row's purpose as shown, its first line (5b-2 F): the card's own; the login check says it is a step. */
export const shownPurpose = row => (row?.kind === 'checkpoint' ? comprehension.checkpointPurpose : row?.purpose);
/** A row's second line as shown: «Winbox:» and the path. */
export const pathWords = secondary => `${ui.winbox} ${secondary}`;

/** The sortable rows as the learner sees them: a card's command, or the login check's words. */
export function rowTexts(root) {
  return [...root.querySelectorAll('.ng-reorder-item')].map(li => {
    const command = li.querySelector('.ng-su-cmd');
    if (command) return command.textContent;
    return words(li.querySelector('.ng-su-step')).replace(/^✋\s*/u, '');
  });
}

/**
 * Structure: one sortable list while sorting (none after), in the learner's
 * order, numbered by position, move limits only at the ends, prompts as the
 * learner chose them (none at first when `unchecked`; no prompt group at all
 * on a deck without prompts), each row's second line its own card's, and
 * nothing in attributes that ties a card to its place, mode or identity.
 */
export function structureFindings(root, task, state, { unchecked = false } = {}) {
  const out = [];
  const prompted = capabilities(task).prompts.length > 0;
  const sorting = state.phase === 'sorting';
  const lists = root.querySelectorAll('ol.ng-reorder');
  if (lists.length !== (sorting ? 1 : 0)) out.push(`lists: ${lists.length} in ${state.phase}`);
  const rows = [...root.querySelectorAll('.ng-reorder-item')];
  const shown = sorting ? render(task, state) : [];
  if (rows.length !== shown.length) out.push(`rows: ${rows.length}`);
  const texts = rowTexts(root);
  shown.forEach((row, i) => { if (texts[i] !== row.text) out.push(`order: row ${i + 1} shows «${texts[i]}», the learner has «${row.text}» there`); });
  rows.forEach((li, i) => {
    const n = i + 1, last = rows.length;
    const handle = li.querySelector('.ng-reorder-handle');
    if (words(handle?.querySelector('.ng-reorder-n')) !== String(n)) out.push(`numbering: row ${n} shows ${words(handle?.querySelector('.ng-reorder-n'))}`);
    if (!handle?.getAttribute('aria-label')?.startsWith(`${n}. `)) out.push(`numbering: row ${n} handle «${handle?.getAttribute('aria-label')}»`);
    const group = li.querySelector('[role="radiogroup"]');
    if (!prompted && group) out.push(`prompts: row ${n} has a prompt group on a deck without prompts`);
    if (prompted && group?.getAttribute('aria-label') !== ui.promptOf({ n })) out.push(`numbering: row ${n} prompt group «${group?.getAttribute('aria-label')}»`);
    const path = li.querySelectorAll('.ng-su-path');
    const secondary = shown[i]?.secondary;
    if (path.length !== (secondary ? 1 : 0) || (secondary && words(path[0]) !== pathWords(secondary))) out.push(`second line: row ${n} shows «${[...path].map(words).join(' | ')}», its card has «${secondary ?? ''}»`);
    // Round 5 (R2): every row's purpose is its own card's, one per row, on the row that carries the term.
    const purposes = li.querySelectorAll('[data-purpose]');
    if (purposes.length !== 1 || words(purposes[0]) !== shownPurpose(shown[i])) out.push(`purpose: row ${n} shows «${[...purposes].map(words).join(' | ')}», its card has «${shownPurpose(shown[i]) ?? ''}»`);
    // 5b-2 F: the purpose is the row's first line and its name in words (the handle).
    const row = li.querySelector('.ng-su-row');
    if (row && row.children[0] !== purposes[0]) out.push(`purpose: row ${n} does not start with its purpose`);
    if (shown[i] && !handle?.getAttribute('aria-label')?.endsWith(`: ${shownPurpose(shown[i])}`)) out.push(`name: row ${n} handle «${handle?.getAttribute('aria-label')}» is not named by its purpose`);
    if (li.querySelectorAll('[data-term]').length !== 1) out.push(`purpose: row ${n} has ${li.querySelectorAll('[data-term]').length} rows with a term`);
    const [up, down] = li.querySelectorAll('.ng-reorder-move');
    if (up?.getAttribute('aria-label') !== shared.reorder.up({ n }) || down?.getAttribute('aria-label') !== shared.reorder.down({ n })) out.push(`numbering: row ${n} move buttons`);
    if (up?.getAttribute('aria-disabled') !== String(i === 0)) out.push(`move limits: row ${n} ↑ aria-disabled=${up?.getAttribute('aria-disabled')}`);
    if (down?.getAttribute('aria-disabled') !== String(n === last)) out.push(`move limits: row ${n} ↓ aria-disabled=${down?.getAttribute('aria-disabled')}`);
    if (up?.hasAttribute('disabled') || down?.hasAttribute('disabled')) out.push(`move limits: row ${n} a disabled button`);
    const checked = [...li.querySelectorAll('[role="radio"]')].filter(b => b.getAttribute('aria-checked') === 'true').map(words);
    const chosen = shown[i] ? state.answer.prompts[shown[i].id] : null;
    if (unchecked && checked.length) out.push(`prompts: row ${n} starts with ${checked.join(', ')} checked`);
    if (JSON.stringify(checked) !== JSON.stringify(chosen == null ? [] : [chosen])) out.push(`prompts: row ${n} shows ${checked.join(', ') || 'none'}, the learner chose ${chosen ?? 'none'}`);
    if (prompted && Boolean(li.querySelector('.ng-su-empty')) !== (chosen == null && !li.querySelector('.ng-su-choice .ng-su-mark'))) out.push(`prompts: row ${n} «${ui.noPrompt}» with ${chosen ?? 'none'} chosen`);
  });
  // Attributes: only the panel's hooks among data attributes, no card
  // identity (the opaque id or the command's own name) in machine
  // attributes, nothing setupLeaks finds.
  const ids = identities(task);
  const values = [];
  for (const el of elements(root)) {
    for (const { name, value } of el.attributes) {
      if (name.startsWith('data-') && !HOOKS.test(name)) out.push(`attribute: ${name}="${value}"`);
      if (name === 'data-evidence' && value !== 'current') out.push(`attribute: data-evidence="${value}"`);
      if (['id', 'for', 'class', 'name', 'title', 'aria-controls', 'aria-describedby', 'aria-labelledby'].includes(name)
        && value.split(/[^\w-]+/).some(token => !(name === 'class' && UI_CLASSES.has(token)) && ids.some(id => `-${token}-`.includes(`-${id}-`)))) out.push(`identity: ${name}="${value}"`);
      if (name === 'value' && el.className.includes('ng-su-field')) continue; // the learner's own text
      values.push(`${name}=${value}`);
    }
  }
  for (const leak of setupLeaks(values.join('\n'))) out.push(`attribute leak: ${leak}`);
  // No mirror of the deck elsewhere (a hidden list, a script) while sorting.
  if (sorting && !state.revealed) {
    const commands = shown.filter(r => r.kind === 'card').map(r => r.text);
    const deck = root.querySelector('ol.ng-reorder');
    for (const el of elements(root)) {
      if (deck && (deck.contains(el) || el.contains(deck))) continue;
      if (commands.filter(c => (el.textContent ?? '').includes(c)).length >= 2) { out.push(`mirror: ${el.className || el.localName} repeats the commands`); break; }
    }
  }
  return out;
}

/** The sorting verdict as the panel words it: the flagged cards' positions first (but for missing modes), then the rule. */
export function verdictWords(task, state) {
  const failed = state.feedback?.findings[0];
  const lesson = explanation(state.feedback);
  const at = failed.code === 'mode-missing' || !failed.positions?.length ? '' : `${ui.cardsAt({ positions: [...failed.positions].sort((a, b) => a - b) })} `;
  return `${at}${text(lesson.code, lesson.params)}`;
}

/** Recall lines: their words and attributes (never the learner's text or its echo) carry no command keyword. */
export function recallFindings(root) {
  const out = [];
  for (const li of root.querySelectorAll('.ng-su-recall-line')) {
    const parts = [];
    for (const el of elements(li)) {
      if (el.className.includes('ng-su-verdict') || el.closest('.ng-su-verdict')) continue; // the learner's echoed line
      for (const { name, value } of el.attributes) if (!(name === 'value' && el.className.includes('ng-su-field'))) parts.push(value);
      for (const node of el.childNodes) if (node.nodeType === 3) parts.push(node.textContent);
    }
    for (const leak of setupLeaks(parts.join('\n'), 'typed')) out.push(`recall line: ${leak}`);
  }
  return out;
}

/**
 * Recall hides three commands. Until a line is right (or shown), its command
 * may appear nowhere on the screen: text, attributes, live regions, titles,
 * scripts. Exempt: the learner's own field and its echoed verdict.
 */
export function hiddenFindings(root, task, state) {
  if (state.phase !== 'recall' && state.phase !== 'done') return [];
  const rows = recallRows(task, state);
  const hidden = task.typedIds.filter((id, i) => !rows[i].locked).map(id => cardText(task, id));
  const out = [];
  for (const el of elements(root)) {
    if (el.closest('.ng-su-verdict')) continue;
    for (const { name, value } of el.attributes) {
      if (name === 'value' && el.className.includes('ng-su-field')) continue;
      for (const command of hidden) if (value.includes(command)) out.push(`hidden command in ${name}: ${command}`);
    }
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue;
      for (const command of hidden) if (node.textContent.includes(command)) out.push(`hidden command in ${el.className || el.localName}: ${command}`);
    }
  }
  return out;
}

/**
 * Disclosure: marks only for a current (not stale) finding's cards,
 * aria-invalid only for a mode finding, the panel's one sentence; the
 * script only once the check passed or the answer was shown, and then
 * exactly scriptForState's (the learner's accepted order, or the reference
 * once revealed, recall lines masked); recall lines only in recall.
 */
export function disclosureFindings(root, task, state) {
  const out = [];
  const sorting = state.phase === 'sorting';
  const fb = sorting ? state.feedback : null;
  const failed = fb && !fb.ok ? fb.findings[0] : null;
  const live = failed && !state.stale ? failed : null;
  const rows = [...root.querySelectorAll('.ng-reorder-item')];
  const shown = sorting ? render(task, state) : [];
  const want = live ? shown.map((r, i) => (live.cards.includes(r.id) ? i : -1)).filter(i => i >= 0) : [];
  const marked = rows.map((li, i) => (li.className.split(/\s+/).includes('is-marked') ? i : -1)).filter(i => i >= 0);
  if (JSON.stringify(marked) !== JSON.stringify(want)) out.push(`marks on rows ${marked.map(i => i + 1)}; the finding has ${want.map(i => i + 1)}`);
  rows.forEach((li, i) => {
    const mark = li.querySelector('.ng-su-mark');
    if (Boolean(mark) !== want.includes(i)) out.push(`«Ще ні» words on row ${i + 1}: ${Boolean(mark)}`);
    if (mark && words(mark) !== `• ${shared.notYet}`) out.push(`mark words: ${words(mark)}`);
  });
  const invalid = rows.map((li, i) => (li.querySelector('[role="radiogroup"][aria-invalid="true"]') ? i : -1)).filter(i => i >= 0);
  const wantInvalid = live && ['mode-missing', 'wrong-mode'].includes(live.code) ? want : [];
  if (JSON.stringify(invalid) !== JSON.stringify(wantInvalid)) out.push(`aria-invalid prompt groups on rows ${invalid.map(i => i + 1)}`);
  const status = statusWords(root);
  if (failed) {
    const expected = `• ${shared.notYet} ${verdictWords(task, state)}${state.stale ? ` · ${shared.help.stale}` : ''}`.replace(/\s+/g, ' ');
    // A hint may be the current item; the verdict then sits above it, outside the status.
    if (status !== expected && !root.querySelector('.ng-help-hint-text')) out.push(`failed status: «${status}», expected «${expected}»`);
  }
  if (sorting && !fb && status && !root.querySelector('.ng-help-hint-text')) out.push(`status without a check: ${status}`);
  if (state.phase === 'sorted' && !status.startsWith(`✓ ${shared.yes} ${okWords(task)}`)) out.push(`success status: ${status}`);
  // The script: none while sorting; after, exactly the logic's, part by part.
  const parts = [...root.querySelectorAll('.ng-su-part')];
  const script = sorting ? null : scriptForState(task, state);
  const own = state.phase === 'sorted-shown' && state.showOwn;
  if (sorting && parts.length) out.push(`script shown while sorting: ${parts.length} parts`);
  if (!sorting && !own) {
    if (!script) { if (parts.length) out.push('a script without an accepted or revealed board'); }
    else {
      if (parts.length !== script.parts.length) out.push(`script parts: ${parts.length}, the logic has ${script.parts.length}`);
      script.parts.forEach((part, i) => { if (scriptText(parts[i]) !== part.script) out.push(`script part ${i + 1} is not scriptForState's`); });
    }
  }
  if (own && parts.length) out.push('a script beside the learner’s own order');
  const chip = root.querySelector('.ng-su-result-head .ng-shown-chip');
  if (Boolean(chip) !== Boolean(state.revealed && !state.showOwn && !sorting)) out.push(`«показано» on the board: ${Boolean(chip)}`);
  const lines = root.querySelectorAll('.ng-su-recall-line');
  if (lines.length !== (['recall', 'done', 'done-shown'].includes(state.phase) ? 3 : 0)) out.push(`recall lines: ${lines.length} in ${state.phase}`);
  return out;
}

/** A copy payload: exactly one of the shown script's parts, never the reference unless revealed, no weak secret. */
export function copyFindings(payload, task, state, { reference = null, weak = [] } = {}) {
  const out = [];
  const script = scriptForState(task, state);
  if (!script) out.push('copy without an accepted or revealed board');
  else if (!script.parts.some(part => part.script === payload)) out.push('copy is not a part of the shown script');
  if (reference && !state.revealed && reference.parts.some(part => part.script === payload) && !script?.parts.some(part => part.script === payload)) out.push('copy is the reference script');
  if (script && script.parts.length > 1 && payload === script.parts.map(p => p.script).join('\n')) out.push('copy joins the parts across the login check');
  for (const secret of weak) if (payload.includes(secret)) out.push(`copy holds a weak secret: ${secret}`);
  return out;
}
