// Mounted lifecycle scenarios for «Налаштування з нуля» (round 4, spec S on
// the shared parts of spec A): the real SetupScreen with NetGym's deck
// registry in the app store, mounted with react-dom/client in
// tests/helpers/mini-dom.mjs (focus events on), with node:test's mocked
// setTimeout. Run in its own process by tests/setup-mounted.test.mjs
// (tools/test.sh runs it first and passes the results file). Prints one JSON
// line: { results: [{ name, ok, detail }] }.
//   - keyboard-only reordering through the handle (grab, arrows, Home, End,
//     drop; Esc restores; focus by identity; announcements; nested controls
//     ignored), and the ↑ ↓ buttons;
//   - the help panel: missing modes first, one rule, marks on its cards and
//     the first flagged row as evidence; an edit keeps the verdict «до змін»
//     and marks the edited row; a mode finding; hints (no dead button, focus
//     on the last); asides open until the first check;
//   - the reveal on the board («показано», «Моя відповідь»), success (the
//     learner's script, its copy, the ✓ on the deck picker), the locked deck;
//   - recall by keyboard: «Тепер по пам'яті →», each line's own Enter check
//     (the wrong word underlined and named, no attempt counted), focus on to
//     the next line, hints for the first unfinished line, edits unlocking,
//     done; its reveal keeps the deck's ✓; «Далі →» skips; a weak secret kept
//     out of every copy; the three lines hidden everywhere until typed;
//   - navigation restoration in sorting and in recall;
//   - the deck picker (DR-1 Cisco router, DR-2 Cisco 2960, DR-3 MikroTik):
//     each deck at start, a pass and a failure each (orders and scripts
//     written by hand here, not read from the bank), DR-3's two copy parts
//     around the login check, switching decks keeping each deck apart,
//     «Далі →» changing only its own deck;
//   - the structural leak gate (tests/helpers/setup-gate.mjs) after every
//     step, and injected structural and lifecycle leaks it must catch;
//   - the shared CopyBlock's clipboard cases; no React warnings.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';
import { copyFindings, disclosureFindings, hiddenFindings, recallFindings, rowTexts, scriptText, statusWords, structureFindings, verdictWords, words } from './setup-gate.mjs';
import { setupLeaks } from './setup-leaks.mjs';
import { expectPurposes } from './purposes.mjs';
import { expectWorkedExample } from './worked-example.mjs';

const { document, fire } = installDom({ focusEvents: true });
// React's select-event plugin asks the window for the selection once a field has the focus
// (the screen focuses recall lines itself); mini-dom has no selection.
window.getSelection = () => ({ anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0, rangeCount: 0, removeAllRanges() {}, selectAllChildren() {} });
mock.timers.enable({ apis: ['setTimeout'] });
let random = 0;
Math.random = () => (random = (random + 0.1234567) % 1);
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;
const copies = [];
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async value => { copies.push(value); } } }, configurable: true, writable: true });

const H = await import('../../.test-bundles/harness/mounted-setup.mjs');
const { act, drill, ciscoRouter, cisco2960, cardText, recallRows, render, scriptForState, check: checkAnswer, explanation, hints, initialState, successTips, lineSummary, deckUi, text, ui, shared, comprehension, setupExample } = H;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
/** A gate's violations: none passes. */
const gate = (name, found) => check(name, found.length === 0, found.slice(0, 6));

// Count the reference solution's reads (useExercise's reveal path; the screen's scripts never need it).
const realSolution = drill.solution;
let solutionCalls = 0;
drill.solution = (...args) => { solutionCalls += 1; return realSolution(...args); };

const flush = () => { for (let i = 0; i < 4; i++) act(() => { mock.timers.tick(200); }); };
const step = fn => { let out; act(() => { out = fn(); }); flush(); return out; };
const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const click = el => step(() => { el.focus(); fire(el, 'click'); });
const key = (el, k) => step(() => fire(el, 'keydown', { key: k }));
const type = (el, value) => step(() => { el.value = value; fire(el, 'input'); });
const status = () => statusWords(document);
const live = () => words(q('.ng-reorder-live'));
/** A step whose effects finish in promises (the clipboard): flushed inside act. */
const stepAsync = async fn => { await act(async () => { fn(); for (let i = 0; i < 5; i++) await Promise.resolve(); }); flush(); };

// The section's place: the chosen deck and a seed per deck.
const placeOf = m => m.store.state.places.setup;
const deckOf = m => placeOf(m).deck;
const seedOf = m => placeOf(m).seeds[deckOf(m)];
const recordOf = m => H.bank.decks.find(d => d.id === deckOf(m));
const taskOf = m => drill.create(recordOf(m), { seed: seedOf(m) });
const instOf = m => m.store.state.instances[taskOf(m).instanceKey];
const stateOf = m => instOf(m)?.view?.setup ?? initialState(taskOf(m));
/** Another seed for the deck on screen (as «Далі →» does, without its button). */
const setSeed = (m, seed) => step(() => m.store.dispatch({ type: 'place', scope: 'setup', patch: { seeds: { ...placeOf(m).seeds, [deckOf(m)]: seed } } }));
const rows = () => all('.ng-reorder-item');
const handle = i => q('.ng-reorder-handle', rows()[i]);
const moves = i => all('.ng-reorder-move', rows()[i]);
const radio = (i, label) => all('[role="radio"]', rows()[i]).find(b => words(b) === label);
const root = () => q('.ng-su');
// The help panel's controls.
const checkButton = () => q('.ng-help-check');
const hintButton = () => q('.ng-help-hint-button');
const revealButton = () => q('.ng-help-reveal-link');
const nextButton = () => q('.ng-help-next');
const continueButton = () => q('.ng-help-continue');
const primary = el => Boolean(el?.className.split(/\s+/).includes('ng-button-primary'));
const evidence = () => all('[data-evidence="current"]');
// Recall.
const fields = () => all('.ng-su-field');
const lines = () => all('.ng-su-recall-line');
const verdict = i => q('.ng-su-verdict', lines()[i]);
/** The deck picker's options, and choosing one by its label (a click, as a learner would). */
const deckRadios = () => all('.ng-su-decks [role="radio"]');
const deckName = b => words(b).replace(/\s*✓.*$/u, '');
const pick = label => click(deckRadios().find(b => deckName(b) === label));
const modes = task => Object.fromEntries(task.cards.filter(c => c.mode).map(c => [c.id, c.mode]));
const strong = 'Str0ngOwn!42';
/** The full command a learner would type for a recall line (a strong secret of their own). */
const command = (task, id) => cardText(task, id).replace('<пароль>', strong);
const asidesOpen = () => all('.ng-aside-q[aria-expanded="true"]').length;
/** The task sentence's words. */
const taskWords = () => words(q('.ng-su-task'));
/** The action line's words without the mode help's «?» (a button at its end on the Cisco decks). */
const actionWords = () => words(q('.ng-action-line')).replace(/ \?$/u, '');
/** expectPurposes as a check: every deck row carries its purpose, `n` rows. */
const purposesOk = n => { try { expectPurposes(q('.ng-su-board'), { expected: n }); return ''; } catch (e) { return e.message; } };
// The mode help (round 5): one «?» in the task sentence, its popover.
const modeQ = () => all('.ng-su-modes-q');
const modePop = () => q('.ng-su-modes-pop');
const popOpen = () => Boolean(modePop()) && !modePop().hasAttribute('hidden');
// The worked example (round 5, 5b-2 A): one per screen, folded unless opened.
const exampleToggle = () => q('[data-worked-example] .ng-wex-toggle');
/** expectWorkedExample as a check: '' when it holds. */
const exampleOk = (options = {}) => { try { expectWorkedExample(document, options); return ''; } catch (e) { return e.message; } };

/** Put the deck in `target` order with the ↑ buttons, as a learner would. */
function arrange(m, target) {
  for (let i = 0; i < target.length; i++) {
    let at = stateOf(m).answer.order.indexOf(target[i]);
    while (at > i) { click(moves(at)[0]); at -= 1; }
  }
}
/** Choose each row's prompt by its label. */
function choose(m, prompts) {
  stateOf(m).answer.order.forEach((id, i) => { if (prompts[id] && stateOf(m).answer.prompts[id] !== prompts[id]) click(radio(i, prompts[id])); });
}
/** A valid order other than the reference: the reference with one free adjacent pair swapped. */
function otherValidOrder(task) {
  const ref = realSolution(task).order;
  for (let i = 0; i + 1 < ref.length; i++) {
    const order = [...ref];
    [order[i], order[i + 1]] = [order[i + 1], order[i]];
    if (checkAnswer(task, { order, prompts: modes(task), typed: {}, assisted: [] }).ok) return order;
  }
  throw new Error('no other valid order');
}
/** Arrange, choose and check: the deck passes. */
function solve(m, order = otherValidOrder(taskOf(m))) {
  arrange(m, order);
  choose(m, modes(taskOf(m)));
  click(checkButton());
}
const seedWhere = (test, record = ciscoRouter) => { for (let seed = 1; seed < 500; seed++) if (test(drill.create(record, { seed }))) return seed; throw new Error('no seed'); };
const usernameSeed = seedWhere(t => t.recallLines.some(l => l.commandId === 'username'));

async function scenario(name, fn, options = {}) {
  const m = H.mountSetup(options);
  try { await fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}
/** The structural, recall, hidden-command and disclosure gates for the screen as it is now. */
function gates(m, label, { unchecked = false } = {}) {
  const st = stateOf(m), task = taskOf(m);
  gate(`${label}: structure`, structureFindings(root(), task, st, { unchecked }));
  gate(`${label}: recall lines`, recallFindings(root()));
  gate(`${label}: hidden commands`, hiddenFindings(root(), task, st));
  gate(`${label}: disclosure`, disclosureFindings(root(), task, st));
}

// ── The first view ───────────────────────────────────────────────────────

await scenario('first view', m => {
  const task = taskOf(m);
  check('first: twelve rows in the generated (learner’s) order', JSON.stringify(rowTexts(root())) === JSON.stringify(render(task, stateOf(m)).map(r => r.text)) && rows().length === 12);
  gates(m, 'first', { unchecked: true });
  check('first: every prompt group unchecked, «режим?» on each', all('.ng-su-board [role="radio"]').every(b => b.getAttribute('aria-checked') === 'false')
    && all('.ng-su-board [role="radio"]').length === 60 && all('.ng-su-empty').length === 12);
  check('first: the heading and the one task sentence', words(q('.ng-su-h1')) === deckUi['dr-1'].heading && taskWords() === ui.task, taskWords());
  // Round 5 (R1, R2): one action line, above the deck; every card's purpose under its command.
  const action = all('.ng-action-line');
  const board = [...q('.ng-su-board').childNodes].filter(n => n.nodeType === 1);
  check('first: one action line, the deck’s, right above the deck, the «?» its last thing after the full stop', action.length === 1 && actionWords() === ui.action
    && words(action[0]) === `${ui.action} ?` && action[0].lastChild === q('.ng-su-modes-q')
    && (board[0] === action[0] || board[0].contains(action[0])) && (board[1]?.localName === 'ol' || Boolean(q('ol.ng-reorder', board[1]))), words(action[0]));
  // 5b-2 A: the folded worked example is the action line's next sibling, above the deck.
  check('first: the worked example folded, right under the action line, before the deck', exampleOk() === '' && action[0].nextSibling === q('[data-worked-example]')
    && !q('ol.ng-reorder', board[0]), exampleOk());
  const missing = purposesOk(12);
  check('first: twelve rows with a term, each with its own card’s purpose', !missing && rows().every((li, i) => words(q('[data-purpose]', li)) === render(task, stateOf(m))[i].purpose), missing);
  check('first: the purpose is the row’s first line (the purpose, the command, its prompt group), never a muted note', rows().every(li => {
    const parts = [...q('.ng-su-row', li).childNodes].filter(n => n.nodeType === 1);
    return parts.length === 3 && parts[0].hasAttribute('data-purpose') && parts[1].className === 'ng-su-term' && Boolean(q('.ng-su-cmd', parts[1])) && parts[2].className.startsWith('ng-su-choice');
  }));
  check('first: each handle is named by its card’s purpose', all('.ng-reorder-handle').every((h, i) => h.getAttribute('aria-label') === shared.reorder.handle({ n: i + 1, name: render(task, stateOf(m))[i].purpose })));
  check('first: one mode «?» (in the action line), none in the task sentence or per card', modeQ().length === 1 && Boolean(q('.ng-action-line .ng-su-modes-q'))
    && !q('.ng-su-task .ng-su-modes-q') && !q('.ng-reorder .ng-su-modes-q')
    && modeQ()[0].getAttribute('aria-expanded') === 'false' && modeQ()[0].getAttribute('aria-label') === ui.modesTitle && !popOpen());
  check('first: «Перевірити» primary, «Далі →» secondary (skip), «Показати відповідь» a link', primary(checkButton()) && nextButton() && !primary(nextButton())
    && words(revealButton()) === shared.showAnswer && !continueButton());
  check('first: one status, empty; nothing current', all('[role="status"]').length === 1 && status() === '' && evidence().length === 0 && !q('[data-help-current]'));
  check('first: the two asides open (CLI modes, how to arrange)', asidesOpen() === 2 && words(q('.ng-su-modes')).includes('Router(config-if)# exit'));
  check('first: no «⋯» before there is something to copy', !q('.ng-more-button'));
  check('first: the reference was never read', solutionCalls === 0, { solutionCalls });
});

// ── The mode help (round 5, spec 5b-1 §3 v2) ─────────────────────────────

await scenario('mode help', m => {
  const before = JSON.stringify(stateOf(m));
  click(modeQ()[0]);
  check('mode help: «?» opens the popover under the action line, the focus in it', popOpen() && modeQ()[0].getAttribute('aria-expanded') === 'true'
    && modePop().getAttribute('role') === 'dialog' && document.activeElement === modePop() && modeQ()[0].getAttribute('aria-controls') === modePop().getAttribute('id'));
  check('mode help: the five prompts in words, and «Повний приклад»', JSON.stringify(all('dt', modePop()).map(words)) === JSON.stringify(Object.keys(ui.modes))
    && JSON.stringify(all('dd', modePop()).map(words)) === JSON.stringify(Object.values(ui.modes)) && words(q('.ng-su-modes-full')) === ui.modesFull
    && words(all('[id]', modePop()).find(e => e.getAttribute('id') === modePop().getAttribute('aria-labelledby'))) === ui.modesTitle);
  check('mode help: its words name no card or order', setupLeaks(words(modePop()), 'typed').length === 0 && !rowTexts(root()).some(t => words(modePop()).includes(t)));
  gates(m, 'mode help open', { unchecked: true });
  key(modePop(), 'Escape');
  check('mode help: Escape closes it, the focus back on «?»', !popOpen() && document.activeElement === modeQ()[0] && modeQ()[0].getAttribute('aria-expanded') === 'false');
  click(modeQ()[0]);
  click(modeQ()[0]);
  check('mode help: «?» again closes it', !popOpen());
  // Fold the asides (the first check), then ask for the full example: the aside opens and takes the focus.
  click(checkButton());
  check('mode help: the asides folded after the first check', asidesOpen() === 0);
  click(modeQ()[0]);
  click(q('.ng-su-modes-full'));
  const aside = q('.ng-su-aside-modes');
  check('mode help: «Повний приклад» closes the popover, opens the CLI example and moves the focus to it', !popOpen() && Boolean(q('.ng-su-modes', aside))
    && document.activeElement === q('.ng-aside-q', aside) && q('.ng-aside-q', aside).getAttribute('aria-expanded') === 'true');
  click(modeQ()[0]);
  click(q('.ng-su-modes-full'));
  check('mode help: with the example already open, «Повний приклад» moves the focus there', !popOpen() && document.activeElement === q('.ng-aside-q', q('.ng-su-aside-modes')));
  check('mode help: the deck untouched by the help (only the check changed it)', JSON.stringify(stateOf(m).answer) === JSON.stringify(JSON.parse(before).answer));
});

// ── The worked example (round 5, spec 5b-2 A and F) ──────────────────────

/** The opened example's words: the context, the column labels and each row's cells. */
const exampleShown = () => ({
  context: words(q('.ng-wex-context')),
  head: all('.ng-wex-table th').map(words),
  rows: all('.ng-wex-table tbody tr').map(tr => all('.ng-wex-value', tr).map(words)),
});
const sameExample = syntax => {
  const e = setupExample({ syntax });
  return JSON.stringify(exampleShown()) === JSON.stringify({ context: e.context, head: e.columns, rows: e.rows });
};

await scenario('worked example', m => {
  solutionCalls = 0;
  const store = () => JSON.stringify(m.store.state);
  check('example: folded at first, its quiet toggle in words', exampleOk() === '' && words(exampleToggle()) === `${shared.example.toggle} ▸ ${shared.example.toggleRest}`, words(exampleToggle()));
  const before = store();
  click(exampleToggle());
  check('example (Cisco): opened by its toggle, one finished card with its mode, the tag', exampleOk({ open: true, rows: 1 }) === '' && sameExample('cisco'), [exampleOk({ open: true, rows: 1 }), exampleShown()]);
  check('example (Cisco): the purpose first, then the command and its mode, as the cards read', JSON.stringify(exampleShown().head) === JSON.stringify(['Призначення', 'Команда', 'Режим']));
  check('example: its command is in no card of the deck', !rowTexts(root()).some(t => exampleShown().rows.some(r => r.includes(t))));
  check('example: opening it changes nothing in the store (no answer, draft, hint or assistance)', store() === before && !instOf(m)?.session?.assisted);
  gates(m, 'example open', { unchecked: true });
  // The mode help still opens right under the action line, over the example.
  click(modeQ()[0]);
  check('example: the mode popover comes after it in the block, and opens', popOpen() && q('.ng-su-action').children.indexOf(modePop()) === q('.ng-su-action').children.indexOf(q('[data-worked-example]')) + 1);
  key(modePop(), 'Escape');
  click(exampleToggle());
  check('example: its toggle folds it again', exampleOk() === '');
  // Never opened by a check, a hint or the asides' fold.
  click(checkButton());
  click(hintButton());
  check('example: a check and a hint leave it folded', exampleOk() === '' && stateOf(m).phase === 'sorting');
  click(exampleToggle());
  click(checkButton());
  check('example: a check leaves an opened example open (the same task)', exampleOk({ open: true, rows: 1 }) === '');
  // A new task (values or deck) folds it; coming back finds it folded.
  click(nextButton());
  check('example: «Далі →» (new values) folds it', exampleOk() === '' && seedOf(m) !== 1);
  click(exampleToggle());
  pick('Роутер MikroTik');
  check('example: another deck shows its own, folded', exampleOk() === '' && deckOf(m) === 'dr-3');
  click(exampleToggle());
  check('example (MikroTik): two cards in create-before-use order, no mode column, the reason in the context', exampleOk({ open: true, rows: 2 }) === '' && sameExample('routeros')
    && JSON.stringify(exampleShown().head) === JSON.stringify(['Призначення', 'Команда']) && /міст/u.test(exampleShown().context), exampleShown());
  gates(m, 'example open (MikroTik)', { unchecked: true });
  pick('Роутер Cisco');
  check('example: back on the router deck it is folded', exampleOk() === '');
  click(exampleToggle());
  m.remount();
  check('example: leaving the section and coming back finds it folded', exampleOk() === '');
  // Only while sorting, with the action line: none on the passed deck's script.
  solve(m);
  check('example: none once the deck is sorted (no action line either)', stateOf(m).phase === 'sorted' && !q('[data-worked-example]') && !q('.ng-action-line'));
  check('example: the reference was never read', solutionCalls === 0, { solutionCalls });
});

/** A key on a native button as a browser does it: Enter clicks on keydown, Space on keyup, unless the keydown was prevented. */
function keyActivate(el, k) {
  let prevented = false;
  step(() => { el.focus(); prevented = fire(el, 'keydown', { key: k }).defaultPrevented; });
  if (k === ' ') step(() => fire(el, 'keyup', { key: k }));
  if (!prevented) step(() => fire(el, 'click'));
}

await scenario('mode help by keyboard and pointer (repair v1)', () => {
  keyActivate(modeQ()[0], 'Enter');
  check('mode help: Enter on «?» opens it, the focus in it', popOpen() && document.activeElement === modePop());
  key(modePop(), 'Escape');
  keyActivate(modeQ()[0], ' ');
  check('mode help: Space on «?» opens it too', popOpen() && document.activeElement === modePop());
  step(() => q('.ng-su-modes-full').focus());
  check('mode help: Tab inside (to «Повний приклад») keeps it open', popOpen() && document.activeElement === q('.ng-su-modes-full'));
  step(() => handle(0).focus());
  check('mode help: Tab out of it closes it, the focus where it went', !popOpen() && document.activeElement === handle(0) && modeQ()[0].getAttribute('aria-expanded') === 'false');
  keyActivate(modeQ()[0], 'Enter');
  step(() => fire(q('dd', modePop()), 'pointerdown'));
  check('mode help: a press inside the popover keeps it open', popOpen());
  step(() => fire(q('.ng-su-row', rows()[1]), 'pointerdown'));
  check('mode help: a press outside closes it without moving the focus to «?»', !popOpen() && document.activeElement !== modeQ()[0]);
  click(modeQ()[0]);
  step(() => fire(modeQ()[0], 'pointerdown'));
  click(modeQ()[0]);
  check('mode help: a press on «?» itself toggles it closed (not closed and reopened)', !popOpen());
  check('mode help: no deck change from the help', !q('.ng-reorder-item.is-marked') && status() === '');
});

// ── Keyboard-only reordering ─────────────────────────────────────────────

await scenario('keyboard', m => {
  const start = [...stateOf(m).answer.order];
  const id = start[2];
  const nameOf = () => render(taskOf(m), stateOf(m)).find(r => r.id === id).purpose;   // 5b-2 F: rows are named by their purpose
  const own = () => handle(stateOf(m).answer.order.indexOf(id));
  handle(2).focus();
  key(handle(2), ' ');
  check('keys: Space grabs (aria-pressed, a dashed row)', handle(2).getAttribute('aria-pressed') === 'true' && rows()[2].className.includes('is-grabbed'));
  check('keys: the grab is announced with its position', live() === shared.reorder.grabbed({ name: nameOf(), n: 3, total: 12 }), live());
  key(handle(2), 'ArrowDown');
  check('keys: ArrowDown moves the card one down', stateOf(m).answer.order.indexOf(id) === 3);
  check('keys: focus stays with the card (by identity)', document.activeElement === own() && own() === handle(3));
  check('keys: the position is announced', live() === shared.reorder.moved({ n: 4, total: 12 }), live());
  gates(m, 'keys after ArrowDown');
  key(own(), 'End');
  check('keys: End takes it to the last place', stateOf(m).answer.order.at(-1) === id && document.activeElement === handle(11));
  key(own(), 'Home');
  check('keys: Home takes it to the first place', stateOf(m).answer.order[0] === id && document.activeElement === handle(0) && live() === shared.reorder.moved({ n: 1, total: 12 }));
  key(own(), 'ArrowUp');
  check('keys: at the top, ArrowUp leaves it there', stateOf(m).answer.order[0] === id);
  act(() => fire(own(), 'keydown', { key: 'ArrowUp' }));
  const cleared = live();
  flush();
  check('keys: a repeated announcement clears first, then says it again', cleared === '' && live() === shared.reorder.moved({ n: 1, total: 12 }), { cleared, now: live() });
  key(own(), 'Escape');
  check('keys: Esc restores the order the grab started from', JSON.stringify(stateOf(m).answer.order) === JSON.stringify(start));
  check('keys: and drops it, announced, focus on it in its old place', handle(2).getAttribute('aria-pressed') === 'false' && document.activeElement === handle(2)
    && live() === shared.reorder.cancelled({ name: nameOf(), n: 3, total: 12 }), live());
  gates(m, 'keys after Esc', { unchecked: true });
  key(handle(2), ' ');
  key(own(), 'ArrowUp');
  key(own(), 'ArrowUp');
  key(own(), ' ');
  check('keys: Space drops where it is (two up)', stateOf(m).answer.order[0] === id && handle(0).getAttribute('aria-pressed') === 'false'
    && live() === shared.reorder.dropped({ name: nameOf(), n: 1, total: 12 }), live());
  check('keys: Enter grabs and drops as Space does', (() => { key(handle(0), 'Enter'); const on = handle(0).getAttribute('aria-pressed') === 'true'; key(handle(0), 'Enter'); return on && handle(0).getAttribute('aria-pressed') === 'false'; })());
  const before = [...stateOf(m).answer.order];
  key(handle(0), 'ArrowDown');
  check('keys: not grabbed, ArrowDown moves focus to the next handle only', document.activeElement === handle(1) && JSON.stringify(stateOf(m).answer.order) === JSON.stringify(before));
  key(handle(1), 'End');
  check('keys: not grabbed, End focuses the last handle', document.activeElement === handle(11));
  // Nested controls: their keys never reach the handle.
  const option = radio(4, '#');
  click(option);
  key(option, 'ArrowRight');
  check('nested: arrows in a prompt group change the prompt, never the order', JSON.stringify(stateOf(m).answer.order) === JSON.stringify(before)
    && stateOf(m).answer.prompts[before[4]] === '(config)#' && handle(4).getAttribute('aria-pressed') === 'false');
  check('nested: a chosen prompt takes «режим?» away from its row only', !q('.ng-su-empty', rows()[4]) && all('.ng-su-empty').length === 11);
  key(radio(4, '(config)#'), ' ');
  check('nested: Space in a prompt group grabs nothing', all('.ng-reorder-handle[aria-pressed="true"]').length === 0);
  key(handle(5), ' ');
  key(handle(5), 'ArrowDown');
  click(radio(0, '>'));
  check('keys: focus elsewhere drops the card in its new place', all('.ng-reorder-handle[aria-pressed="true"]').length === 0 && stateOf(m).answer.order[6] === before[5]);
  click(handle(3));
  const grabbedByClick = handle(3).getAttribute('aria-pressed') === 'true';
  click(handle(3));
  check('pointer: a click on the handle grabs, another drops', grabbedByClick && handle(3).getAttribute('aria-pressed') === 'false');
});

await scenario('buttons', m => {
  const order = [...stateOf(m).answer.order];
  click(moves(0)[1]);
  check('↓: the first card goes one down', stateOf(m).answer.order[1] === order[0]);
  check('↓: focus stays on that card’s ↓', document.activeElement === moves(1)[1]);
  check('↓: announced', live() === shared.reorder.placed({ name: render(taskOf(m), stateOf(m))[1].purpose, n: 2, total: 12 }), live());
  click(moves(1)[0]);
  check('↑: back up, focus on its ↑ (now aria-disabled, still focused)', stateOf(m).answer.order[0] === order[0] && document.activeElement === moves(0)[0] && moves(0)[0].getAttribute('aria-disabled') === 'true');
  click(moves(0)[0]);
  click(moves(11)[1]);
  check('ends: ↑ on the first and ↓ on the last change nothing', JSON.stringify(stateOf(m).answer.order) === JSON.stringify(order));
  check('ends: only the first ↑ and the last ↓ are unavailable', all('.ng-reorder-move[aria-disabled="true"]').length === 2);
  gates(m, 'buttons', { unchecked: true });
});

// ── Checks ───────────────────────────────────────────────────────────────

await scenario('missing modes come first', m => {
  const task = taskOf(m);
  click(checkButton());
  const st = stateOf(m), finding = st.feedback.findings[0];
  check('missing: an empty prompt is reported before any order rule', finding.code === 'mode-missing' && finding.cards.length === 12, finding);
  check('missing: the status counts the cards (no list of twelve numbers)', status() === `• ${shared.notYet} ${text('mode-missing', { positions: finding.positions })}` && !/1, 2, 3/.test(status()), status());
  check('missing: every row says «Ще ні» in the prompt group’s place, every group aria-invalid', all('.ng-su-choice .ng-su-mark').length === 12 && all('.ng-su-empty').length === 0
    && all('.ng-su-board [role="radiogroup"][aria-invalid="true"]').length === 12);
  check('missing: the first row is the evidence', evidence().length === 1 && rows()[0].contains(evidence()[0]));
  check('missing: one attempt in the session; the asides fold', instOf(m).presses === 1 && asidesOpen() === 0 && all('.ng-aside-q').length === 2);
  gates(m, 'missing modes');
  click(hintButton());
  const ladder = hints(task, stateOf(m)).map(h => text(h.code, h.params));
  check('missing: hint 1 asks where each command is typed, naming no prompt', words(q('.ng-help-hint-text')).endsWith(ladder[0]) && ladder[0] === text('hint-mode-missing', { positions: finding.positions })
    && !/\(config|#/.test(ladder[0]), ladder[0]);
  check('missing: under the hint the verdict shrinks to one line, outside the status', words(q('.ng-help-mini')).startsWith(`• ${shared.notYet}`) && !q('[role="status"] .ng-help-mini'));
  gates(m, 'missing modes, hint 1');
});

await scenario('a check names one rule', m => {
  const task = taskOf(m);
  choose(m, modes(task));
  click(checkButton());
  const st = stateOf(m), finding = st.feedback.findings[0];
  check('check: the generated order fails one dependency', st.feedback.ok === false && ['needs-before', 'not-last'].includes(finding.code), finding);
  gates(m, 'check (order)');
  check('check: one explanation, the rule’s, after the flagged cards’ positions', status() === `• ${shared.notYet} ${ui.cardsAt({ positions: [...finding.positions].sort((a, b) => a - b) })} ${text(finding.why)}`
    && status() === `• ${shared.notYet} ${verdictWords(taskOf(m), stateOf(m))}`, status());
  check('check: only that rule’s cards marked', all('.ng-reorder-item.is-marked').length === finding.cards.length && all('.ng-su-mark').length === finding.cards.length);
  const first = Math.min(...finding.positions) - 1;
  check('check: the first flagged row (by position) is the evidence', evidence().length === 1 && rows()[first].contains(evidence()[0]), { first, positions: finding.positions });
  check('check: no script, recall or reference', !q('.ng-su-script') && !q('.ng-su-recall') && solutionCalls === 0);
  check('check: one attempt in the session', instOf(m).presses === 1 && instOf(m).session.status === 'working');
  // An edit keeps the verdict, dimmed («до змін»): the marks go, the edited row is the evidence.
  const movedId = stateOf(m).answer.order[5];
  click(moves(5)[1]);
  check('edit: the verdict stays, «до змін», no marks', stateOf(m).stale === true && status().endsWith(`· ${shared.help.stale}`) && all('.ng-reorder-item.is-marked').length === 0
    && q('[data-help-stale]') !== null, status());
  check('edit: the edited row is the evidence', evidence().length === 1 && rows()[stateOf(m).answer.order.indexOf(movedId)].contains(evidence()[0]));
  gates(m, 'after an edit');
  click(checkButton());
  check('recheck: a fresh verdict, not stale', stateOf(m).stale === false && !status().includes(shared.help.stale) && instOf(m).presses === 2);
});

await scenario('a mode finding', m => {
  const task = taskOf(m);
  arrange(m, otherValidOrder(task));
  const prompts = modes(task), order = stateOf(m).answer.order;
  const target = order[4];
  choose(m, { ...prompts, [target]: prompts[target] === '#' ? '>' : '#' });
  click(checkButton());
  const finding = stateOf(m).feedback.findings[0];
  check('mode: a wrong prompt is the finding', finding.code === 'wrong-mode' && finding.cards[0] === target, finding);
  gates(m, 'mode finding');
  const group = q('[role="radiogroup"]', rows()[4]);
  check('mode: its group is aria-invalid and described by the mark', group.getAttribute('aria-invalid') === 'true' && group.getAttribute('aria-describedby') === q('.ng-su-mark', rows()[4]).getAttribute('id'));
  check('mode: the right prompt is not named', !status().includes(prompts[target]) && all('[aria-checked="true"]', rows()[4]).length === 1);
  click(radio(4, prompts[target]));
  check('mode: choosing again leaves the verdict «до змін», the group valid again', !q('.ng-su-board [aria-invalid="true"]') && status().endsWith(shared.help.stale) && rows()[4].contains(evidence()[0]));
  gates(m, 'mode finding, edited');
});

// ── Hints, navigation ────────────────────────────────────────────────────

await scenario('hints', m => {
  const task = taskOf(m);
  const ladder = hints(task, stateOf(m)).map(h => text(h.code, h.params));
  for (let n = 1; n <= 3; n++) {
    click(hintButton());
    check(`hints: rung ${n} current, the session counts it`, words(q('.ng-help-hint-text')) === `${shared.hintN({ n, total: 3 })}. ${ladder[n - 1]}` && instOf(m).session.hintIndex === n && stateOf(m).hintIndex === n, words(q('.ng-help-hint-text')));
    // Rung 3 is the shape on other values (spec S2 v2); the first two name no pair or prompt.
    if (n < 3) check(`hints: rung ${n} names no pair or prompt`, setupLeaks(ladder[n - 1], 'hint').length === 0 && !/\(config|#/.test(ladder[n - 1]), ladder[n - 1]);
    else check('hints: rung 3 is the shape on other values', ladder[2] === text('hint-shape', { example: ladder[2].replace(/^[^:]*: /, '') }), ladder[2]);
    check(`hints: rung ${n} marks no card (before any check)`, evidence().length === 0);
    gates(m, `hint ${n}`, { unchecked: true });
  }
  check('hints: the button goes after the last rung (no dead button); focus on that rung', !hintButton() && document.activeElement === q('.ng-help-hint-text'));
  check('hints: the earlier rungs fold into «Підказки (2)»', words(q('.ng-help-fold summary')) === shared.help.hintsFolded({ n: 2 }));
  check('hints: assisted, nothing marked, no reference', instOf(m).session.assisted && all('.ng-su-mark').length === 0 && solutionCalls === 0);
  check('hints: a hint is no check: the asides stay open', asidesOpen() === 2);
});

await scenario('navigation restoration (sorting)', m => {
  const task = taskOf(m);
  click(moves(3)[0]);
  choose(m, modes(task));
  click(checkButton());
  click(hintButton());
  const snap = () => ({ rows: rowTexts(root()), marks: all('.ng-reorder-item.is-marked').length, checked: all('.ng-su-board [aria-checked="true"]').map(words),
    evidence: evidence().length, asides: asidesOpen(), hints: all('[data-help="hint"]').length });
  const before = snap(), verdictWords = words(q('.ng-help-mini'));
  m.remount();
  check('navigation: coming back restores the order, prompts, marks, evidence and the hint', JSON.stringify(before) === JSON.stringify(snap()), { before, after: snap() });
  // Spec A v2: on a remount the panel's current item falls back to the verdict; the hint waits in «Підказки (1)».
  check('navigation: the verdict is current again, the hint folded', status() === verdictWords && words(q('.ng-help-fold summary')) === shared.help.hintsFolded({ n: 1 }));
  check('navigation: focus is not moved into the panel', !q('[data-help-panel]').contains(document.activeElement));
  gates(m, 'restored');
  check('navigation: still no reference', solutionCalls === 0);
});

// ── Reveal and success ───────────────────────────────────────────────────

await scenario('reveal', m => {
  solutionCalls = 0;
  const task = taskOf(m), learner = rowTexts(root());
  click(revealButton());
  const st = stateOf(m);
  check('reveal: the board shows the reference script, marked «показано»', st.phase === 'sorted-shown' && words(q('.ng-su-result-head .ng-shown-chip')) === shared.help.shown
    && scriptText(q('.ng-su-part')) === scriptForState(task, st).script && scriptForState(task, st).script === realSolution(task).script);
  check('reveal: the panel says so in one line, focus on it', status() === ui.applied && document.activeElement === q('.ng-help-applied-text'));
  check('reveal: the session is revealed and assisted; no ✓ on the deck', instOf(m).session.revealed && instOf(m).session.assisted && !instOf(m).session.earned.solved && !q('.ng-su-decks .ng-done'));
  check('reveal: «Тепер по пам’яті →» primary, «Далі →» secondary, no hint or reveal left', primary(continueButton()) && !primary(nextButton()) && !hintButton() && !revealButton()
    && words(nextButton()) === `${shared.nextName} →, ${ui.nextWhere}`);
  gates(m, 'revealed');
  const toggle = q('.ng-su-own-toggle');
  click(toggle);
  check('«Моя відповідь»: the learner’s own order comes back, with their prompts', JSON.stringify(all('.ng-su-own-item').map(li => words(q('.ng-su-cmd, .ng-su-step', li)))) === JSON.stringify(learner)
    && toggle.getAttribute('aria-pressed') === 'true' && !q('.ng-su-part') && all('.ng-su-own .ng-su-chosen').every(el => words(el) === ui.noChoice));
  check('reveal: the task line says what the board shows', words(q('.ng-su-task')) === ui.shownTask);
  check('«Моя відповідь»: no «Ще ні» and nothing to sort', !q('.ng-su-mark') && !q('.ng-reorder-handle'));
  gates(m, 'own answer');
  click(toggle);
  check('«Моя відповідь» again: the reference back', toggle.getAttribute('aria-pressed') === 'false' && Boolean(q('.ng-su-part')));
  check('reveal: the reference read only through useExercise once revealed', solutionCalls > 0);
});

await scenario('success', async m => {
  solutionCalls = 0;
  const task = taskOf(m), order = otherValidOrder(task);
  check('success: the order differs from the reference', JSON.stringify(order) !== JSON.stringify(realSolution(task).order));
  solve(m, order);
  const st = stateOf(m);
  check('success: «✓ Так» and the words', st.phase === 'sorted' && status() === `✓ ${shared.yes} ${text('ok')}`, status());
  gates(m, 'success');
  const { lead, more } = successTips(task, st.feedback);
  check('success: three or four short lines, the rest behind «Детальніше»', lead.length >= 3 && lead.length <= 4
    && JSON.stringify(all('li', q('.ng-su-why .ng-su-tips')).map(words)) === JSON.stringify(lead)
    && JSON.stringify(all('li', q('.ng-su-more .ng-su-tips')).map(words)) === JSON.stringify(more) && words(q('.ng-su-more summary')) === shared.help.more);
  check('success: the board is the learner’s own script, not the reference', scriptText(q('.ng-su-part')) === scriptForState(task, st).script && scriptText(q('.ng-su-part')) !== realSolution(task).script);
  check('success: the deck is locked (nothing to sort or choose)', !q('.ng-reorder') && !q('.ng-su-board [role="radio"]'));
  check('success: earned; ✓ on the deck picker’s option', instOf(m).session.earned.solved === true && deckRadios()[0].contains(q('.ng-done')) && deckName(deckRadios()[0]) === 'Роутер Cisco');
  check('success: «Тепер по пам’яті →» primary, «Далі →» secondary; no check, hint or reveal', primary(continueButton()) && !primary(nextButton()) && !checkButton() && !hintButton() && !revealButton());
  check('success: the task line says the order was accepted; no mode «?» or action line on a locked deck', words(q('.ng-su-task')) === ui.sortedTask && modeQ().length === 0 && !q('.ng-action-line'));
  copies.length = 0;
  await stepAsync(() => fire(q('.ng-su-part .ng-copy-button'), 'click'));
  check('copy: the payload is the shown script', copies.length === 1 && copyFindings(copies[0], task, st, { reference: realSolution(task) }).length === 0);
  check('copy: «✓ Скопійовано»', words(q('.ng-su-part .ng-copy-button')).startsWith(shared.copied));
  // «⋯» holds the same copy.
  click(q('.ng-more-button'));
  const items = all('[role="menuitem"]');
  check('«⋯»: one copy item for the script', items.length === 1 && words(items[0]) === ui.copyScript);
  copies.length = 0;
  await stepAsync(() => fire(items[0], 'click'));
  check('«⋯»: it copies the same script', copies.length === 1 && copies[0] === scriptForState(task, st).script && words(all('[role="menuitem"]')[0]) === shared.copied);
  check('success: no reference read', solutionCalls === 0);
  const seed = seedOf(m);
  click(nextButton());
  check('«Далі →»: a new seed and a fresh deck, focus on its first card', seedOf(m) !== seed && stateOf(m).phase === 'sorting' && status() === ''
    && all('.ng-su-board [aria-checked="true"]').length === 0 && document.activeElement === handle(0));
  gates(m, 'next', { unchecked: true });
});

// ── Recall ───────────────────────────────────────────────────────────────

await scenario('recall by keyboard', m => {
  setSeed(m, usernameSeed);
  const task = taskOf(m);
  solve(m);
  const presses = instOf(m).presses;
  click(continueButton());
  check('recall: three empty lines, focus on the first', stateOf(m).phase === 'recall' && fields().length === 3 && fields().every(f => f.value === '') && document.activeElement === fields()[0]);
  check('recall: the task sentence says what to do (its own line, no action line or mode «?»)', words(q('.ng-su-task')) === ui.recallTask && !q('.ng-action-line') && modeQ().length === 0);
  check('recall: each line labelled by its description, with its prompt', fields().every((f, i) => words(q(`label[for="${f.getAttribute('id')}"]`)) === `${i + 1}. ${recallRows(task, stateOf(m))[i].description}`)
    && all('.ng-su-recall-prompt').map(words).join() === task.recallLines.map(l => l.mode).join());
  check('recall: «Далі →» secondary (skip), a hint and a reveal; no check button', !checkButton() && !primary(nextButton()) && hintButton() && revealButton());
  check('recall: the script masks the three lines', all('.ng-su-line.is-masked').length === scriptForState(task, stateOf(m)).lines.filter(l => l.masked).length && all('.ng-su-line.is-masked').length >= 3);
  gates(m, 'recall first');
  const said = () => all('[data-help-current]');
  key(fields()[0], 'Enter');
  check('recall: Enter on an empty line: the panel says so, naming the line (no attempt counted)', status() === `• ${shared.notYet} ${ui.lineOf({ n: 1 })}: ${text('typed-missing')}` && instOf(m).presses === presses, status());
  check('recall: one current message (the panel’s), the line its evidence; no second live region', said().length === 1 && q('[data-help-panel]').contains(said()[0])
    && lines()[0].getAttribute('data-evidence') === 'current' && !q('.ng-su-recall [aria-live]'));
  gates(m, 'recall empty');
  // The same Enter again is a new event: the status clears, then says it again.
  act(() => fire(fields()[0], 'keydown', { key: 'Enter' }));
  const cleared = q('[role="status"] .ng-help-summary')?.className ?? '';
  flush();
  check('recall: a repeated Enter is announced again (the words clear for a moment, then come back)', cleared.includes('is-clearing') && !q('[role="status"] .ng-help-summary').className.includes('is-clearing')
    && status().endsWith(text('typed-missing')), { cleared, now: status() });
  const first = task.typedIds[0];
  const wrong = `x${command(task, first)}`;
  type(fields()[0], wrong);
  check('recall: typing makes that line’s message «до змін»', status().endsWith(shared.help.stale) && !fields()[0].hasAttribute('aria-invalid'));
  key(fields()[0], 'Enter');
  const fb = stateOf(m).typedFeedback[first];
  check('recall: the wrong word underlined under the field (not announced)', words(q('.ng-su-bad', verdict(0))) === wrong.split(' ')[0] && verdict(0).getAttribute('aria-hidden') === 'true', words(verdict(0)));
  check('recall: and named in the panel, with the reason', status() === `• ${shared.notYet} ${lineSummary(1, wrong, fb)}` && status().includes(ui.marked({ token: wrong.split(' ')[0] })) && status().includes(text(fb.code, fb.findings[0])), status());
  check('recall: the field is aria-invalid', fields()[0].getAttribute('aria-invalid') === 'true' && lines()[0].className.includes('is-no'));
  gates(m, 'recall wrong word');
  type(fields()[0], command(task, first));
  key(fields()[0], 'Enter');
  check('recall: the right command: «✓ Так Рядок 1 правильний.», the line locks, focus on to the next', status() === `✓ ${shared.yes} ${ui.lineRight({ n: 1 })}` && recallRows(task, stateOf(m))[0].locked
    && lines()[0].className.includes('is-right') && document.activeElement === fields()[1] && q('[data-help-current]').getAttribute('data-help-scope') === 'part');
  check('recall: that line shows in the script now', all('.ng-su-line.is-masked').length === scriptForState(task, stateOf(m)).lines.filter(l => l.masked).length);
  gates(m, 'recall partial');
  click(hintButton());
  const ladder = hints(task, stateOf(m)).map(h => text(h.code, h.params));
  check('recall: hint 1 is about the first unfinished line, its line the evidence; the verdict shrinks above it', ladder[0] === text('hint-recall-mode', { mode: task.recallLines[1].mode, count: task.recallLines[1].template.split(' ').length })
    && words(q('.ng-help-hint-text')).endsWith(ladder[0]) && lines()[1].getAttribute('data-evidence') === 'current' && evidence().length === 1 && words(q('.ng-help-mini')).includes(ui.lineRight({ n: 1 })));
  gates(m, 'recall hint');
  click(hintButton());
  // A late line fails after the hints: its message is the current item, the hint folds.
  type(fields()[2], 'xlogin');
  key(fields()[2], 'Enter');
  check('recall: a late-line failure after hints is the one current message; the hints fold', said().length === 1 && status().startsWith(`• ${shared.notYet} ${ui.lineOf({ n: 3 })}:`)
    && !q('.ng-help-hint-text') && words(q('.ng-help-fold summary')) === shared.help.hintsFolded({ n: 2 }) && lines()[2].getAttribute('data-evidence') === 'current' && evidence().length === 1, status());
  gates(m, 'recall late failure');
  type(fields()[0], 'x');
  check('recall: editing a right line unlocks it', !recallRows(task, stateOf(m))[0].locked && words(verdict(0)) === '');
  type(fields()[0], command(task, first));
  key(fields()[0], 'Enter');
  type(fields()[2], command(task, task.typedIds[2]));
  key(fields()[2], 'Enter');
  type(fields()[1], command(task, task.typedIds[1]));
  key(fields()[1], 'Enter');
  const done = stateOf(m);
  check('recall: the final line finishes it: one message, the task’s success, «Далі →» primary', done.phase === 'done' && status() === `✓ ${shared.yes} ${ui.lineRight({ n: 2 })} ${ui.recallDone}`
    && said().length === 1 && q('[data-help-current]').getAttribute('data-help-scope') === 'task' && primary(nextButton()), status());
  check('recall: still one attempt; the deck’s ✓ from sorting', instOf(m).presses === presses && instOf(m).session.earned.solved);
  check('recall: the script whole again, nothing masked', !q('.ng-su-line.is-masked') && scriptText(q('.ng-su-part')) === scriptForState(task, done).script);
  gates(m, 'recall done');
});

await scenario('recall: a weak secret stays out of every copy', async m => {
  setSeed(m, usernameSeed);
  const task = taskOf(m);
  solve(m);
  click(continueButton());
  task.typedIds.forEach((id, i) => {
    const line = task.recallLines[i];
    type(fields()[i], line.commandId === 'username' ? command(task, id).replace(strong, 'Qz7') : command(task, id));
    key(fields()[i], 'Enter');
  });
  const at = task.recallLines.findIndex(l => l.commandId === 'username');
  if (at === task.typedIds.length - 1) check('weak: the line passes with the advice', stateOf(m).phase === 'done' && status().includes(text('weak-secret')), status());
  else check('weak: the line passes (its advice was said when it was checked)', stateOf(m).phase === 'done' && recallRows(task, stateOf(m))[at].result.findings.some(f => f.code === 'weak-secret'));
  check('weak: the shown script has the placeholder', scriptText(q('.ng-su-part')).includes('<пароль>') && !scriptText(q('.ng-su-part')).includes('Qz7'));
  copies.length = 0;
  await stepAsync(() => fire(q('.ng-su-part .ng-copy-button'), 'click'));
  check('weak: the copy has the placeholder, not the weak secret', copies.length === 1 && copyFindings(copies[0], task, stateOf(m), { weak: ['Qz7'] }).length === 0);
  gates(m, 'weak secret');
});

await scenario('recall: the reveal fills the lines and keeps the deck’s ✓', m => {
  const task = taskOf(m);
  solve(m);
  click(continueButton());
  click(revealButton());
  const st = stateOf(m);
  check('recall reveal: the lines hold the commands, read-only, marked «показано»', st.phase === 'done-shown' && fields().every((f, i) => f.value === cardText(task, task.typedIds[i]) && f.hasAttribute('readonly'))
    && all('.ng-su-recall-line .ng-shown-chip').length === 3);
  check('recall reveal: one line in the panel, focus on it', status() === ui.recallApplied && document.activeElement === q('.ng-help-applied-text'));
  check('recall reveal: the deck’s ✓ stays; assistance reaches the session; no sorting reveal', instOf(m).session.earned.solved && instOf(m).session.assisted && !instOf(m).session.revealed
    && Boolean(q('.ng-su-decks .ng-done')));
  check('recall reveal: «Далі →» primary', primary(nextButton()));
  gates(m, 'recall revealed');
});

await scenario('recall: «Далі →» skips', m => {
  solve(m);
  click(continueButton());
  const seed = seedOf(m);
  click(nextButton());
  check('skip: a new seed, sorting again, focus on the first card', seedOf(m) !== seed && stateOf(m).phase === 'sorting' && !q('.ng-su-recall') && document.activeElement === handle(0));
  gates(m, 'skipped', { unchecked: true });
});

await scenario('recall: the lines stay hidden in every live region', m => {
  const task = taskOf(m);
  click(moves(0)[1]);
  check('announce: in sorting a move names the card by its command', live().length > 0);
  solve(m);
  click(continueButton());
  check('announce: recall has no reorder line left to keep a command', !q('.ng-reorder-live'));
  gates(m, 'recall live regions');
  const hidden = cardText(task, task.typedIds[0]);
  q('[role="status"]').textContent = hidden;
  check('gate catches a hidden command kept in a live region', hiddenFindings(root(), task, stateOf(m)).some(f => f.includes(hidden)));
});

await scenario('navigation restoration (recall)', m => {
  const task = taskOf(m);
  solve(m);
  click(continueButton());
  type(fields()[0], command(task, task.typedIds[0]));
  key(fields()[0], 'Enter');
  type(fields()[1], 'ip ssh ver');
  key(fields()[1], 'Enter');
  const snap = () => ({ values: fields().map(f => f.value), underlines: lines().map((_, i) => words(verdict(i))), status: status(), masked: all('.ng-su-line.is-masked').length, evidence: evidence().length });
  const before = snap();
  m.remount();
  check('navigation: recall comes back with its lines, verdicts and masks', JSON.stringify(snap()) === JSON.stringify(before), { before, after: snap() });
  gates(m, 'recall restored');
});

await scenario('the script’s own copy button when the clipboard refuses', async m => {
  solve(m);
  const selected = [];
  const realGet = window.getSelection;
  window.getSelection = () => ({ removeAllRanges() {}, selectAllChildren: el => selected.push(el) });
  navigator.clipboard.writeText = async () => { throw new Error('NotAllowedError'); };
  const button = q('.ng-su-part .ng-copy-button');
  await stepAsync(() => fire(button, 'click'));
  check('copy part refused: asks for Ctrl+C, claims nothing', words(q('.ng-su-part .ng-copy-said')) === shared.copyFailed && !words(button).startsWith(shared.copied));
  check('copy part refused: its lines are selected for a manual copy', selected.length === 1 && selected[0] === q('.ng-su-part .ng-su-script'));
  navigator.clipboard.writeText = async value => { copies.push(value); };
  window.getSelection = realGet;
  copies.length = 0;
  await stepAsync(() => fire(button, 'click'));
  check('copy part: once the clipboard takes it, «✓ Скопійовано» and the failure note gone', copies.length === 1 && words(button).startsWith(shared.copied) && words(q('.ng-su-part .ng-copy-said')) !== shared.copyFailed);
});

// ── The shared CopyBlock ─────────────────────────────────────────────────

async function copyCase(name, fn) {
  const pending = [];
  const c = H.mountCopy({ text: 'enable\nconfigure terminal\nhostname R1', onCopy: value => new Promise((resolve, reject) => pending.push({ value, resolve, reject })) });
  try { await fn(c, pending); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  c.unmount();
}
const said = c => words(q('.ng-copy-said', c.container));
const copyButton = c => q('.ng-copy-button', c.container);

await copyCase('copy', async (c, pending) => {
  check('copy block: its own text is the script, line breaks included (a manual copy)', q('.ng-copy-pre', c.container).textContent === 'enable\nconfigure terminal\nhostname R1');
  await stepAsync(() => fire(copyButton(c), 'click'));
  check('copy block: nothing claimed while the clipboard hasn’t answered', !words(copyButton(c)).startsWith(shared.copied) && said(c) === '');
  await stepAsync(() => pending[0].resolve());
  check('copy block: then «✓ Скопійовано», and a polite «Скопійовано.»', words(copyButton(c)).startsWith(shared.copied) && said(c) === shared.copiedSaid
    && q('.ng-copy-said', c.container).getAttribute('aria-live') === 'polite' && pending[0].value === 'enable\nconfigure terminal\nhostname R1');
  await stepAsync(() => fire(copyButton(c), 'click'));
  check('copy block: a second copy clears the line first (so it is announced again)', said(c) === '');
  await stepAsync(() => pending[1].resolve());
  check('copy block: and says it again', said(c) === shared.copiedSaid);
});

await copyCase('copy refused', async (c, pending) => {
  await stepAsync(() => fire(copyButton(c), 'click'));
  await stepAsync(() => pending[0].reject(new Error('NotAllowedError')));
  check('copy block: a refused clipboard asks for Ctrl+C, claims nothing', said(c) === shared.copyFailed && !words(copyButton(c)).startsWith(shared.copied));
});

await copyCase('copy after the text changed', async (c, pending) => {
  await stepAsync(() => fire(copyButton(c), 'click'));
  c.setText('enable\nwrite memory');
  await stepAsync(() => pending[0].resolve());
  check('copy block: a copy that finishes after the text changed claims nothing for the new text', !words(copyButton(c)).startsWith(shared.copied) && said(c) === '');
  await stepAsync(() => fire(copyButton(c), 'click'));
  await stepAsync(() => pending[1].resolve());
  check('copy block: copying the new text works', words(copyButton(c)).startsWith(shared.copied) && pending[1].value === 'enable\nwrite memory');
});

// ── The decks: DR-2 (Cisco 2960) and DR-3 (MikroTik) ─────────────────────
// Written by hand here from the vendors' setup order, never read from the
// bank's rules, prompts or reference: each deck's cards by the start of
// their command, a working order other than the reference, the prompt each
// Cisco command is typed at, and one broken order whose only fault is one
// hand-picked dependency (every other dependency kept).

const STEP = 'Перевір вхід';
const DR = {
  'dr-2': {
    label: 'Комутатор Cisco 2960', count: 5,
    order: ['ip default-gateway', 'ip address', 'no shutdown', 'hostname', 'write memory'],
    prompts: { 'ip address': '(config-if)#', 'no shutdown': '(config-if)#', 'ip default-gateway': '(config)#', hostname: '(config)#', 'write memory': '#' },
    // Saved before the rest: only that is wrong.
    broken: ['write memory', 'hostname', 'ip address', 'no shutdown', 'ip default-gateway'],
    why: 'save-last', marked: ['write memory'],
  },
  'dr-3': {
    label: 'Роутер MikroTik', count: 13,
    order: ['/user add', '/interface list add', '/interface bridge add', '/ip address add', '/interface bridge port add', '/interface list member add', STEP,
      '/ip service disable', '/user disable admin', '/tool mac-server set', '/tool mac-server mac-winbox', '/ip neighbor', '/ip ssh set'],
    // The default account off before the new login was checked: only that is wrong.
    broken: ['/user disable admin', '/interface bridge add', '/interface bridge port add', '/interface list add', '/interface list member add', '/ip address add', '/user add', STEP,
      '/ip service disable', '/tool mac-server set', '/tool mac-server mac-winbox', '/ip neighbor', '/ip ssh set'],
    why: 'checkpoint-before-disable', marked: [STEP, '/user disable admin'],
  },
};
const byStart = (command, start) => command === start || command.startsWith(`${start} `) || command.startsWith(`${start}:`);
/** The card ids for these command starts, read from the rows as rendered. */
function idsBy(m, starts) {
  const shown = render(taskOf(m), stateOf(m));
  return starts.map(start => {
    const found = shown.filter(row => byStart(row.text, start));
    if (found.length !== 1) throw new Error(`«${start}» matches ${found.length} cards`);
    return found[0].id;
  });
}
/** Choose each row's prompt by the start of its command. */
function chooseBy(m, prompts) {
  rowTexts(root()).forEach((command, i) => {
    const start = Object.keys(prompts).find(s => byStart(command, s));
    if (stateOf(m).answer.prompts[stateOf(m).answer.order[i]] !== prompts[start]) click(radio(i, prompts[start]));
  });
}
const markedTexts = () => rows().filter(li => li.className.split(/\s+/).includes('is-marked')).map(li => rowTexts({ querySelectorAll: () => [li] })[0]);
const snapshot = () => ({
  heading: words(q('.ng-su-h1')), rows: rowTexts(root()), status: status(), marks: markedTexts(), fields: fields().map(f => f.value), phase: root().className,
  checked: all('.ng-su-board [aria-checked="true"]').map(words), hints: all('[data-help="hint"]').length, script: all('.ng-su-part').map(scriptText),
});

await scenario('deck picker', m => {
  const group = all('.ng-su-decks [role="radiogroup"]');
  check('decks: one picker, labelled, the three decks in order, the router chosen', group.length === 1 && group[0].getAttribute('aria-label') === ui.decks
    && JSON.stringify(deckRadios().map(deckName)) === JSON.stringify(['Роутер Cisco', 'Комутатор Cisco 2960', 'Роутер MikroTik'])
    && JSON.stringify(deckRadios().map(b => b.getAttribute('aria-checked'))) === '["true","false","false"]', deckRadios().map(words));
  check('decks: no deck id reaches the DOM', !root().outerHTML.match(/dr-\d/));
  deckRadios()[0].focus();
  key(deckRadios()[0], 'ArrowRight');
  check('decks: ArrowRight picks the switch, the focus stays on the picker', deckOf(m) === 'dr-2' && document.activeElement === deckRadios()[1]
    && deckRadios()[1].getAttribute('aria-checked') === 'true' && words(q('.ng-su-h1')) === deckUi['dr-2'].heading);
  gates(m, 'picker → DR-2', { unchecked: true });
  key(deckRadios()[1], 'ArrowRight');
  check('decks: and on to MikroTik', deckOf(m) === 'dr-3' && document.activeElement === deckRadios()[2] && words(q('.ng-su-h1')) === deckUi['dr-3'].heading);
  gates(m, 'picker → DR-3', { unchecked: true });
  m.remount();
  check('decks: leaving the section and coming back keeps the deck', deckOf(m) === 'dr-3' && deckRadios()[2].getAttribute('aria-checked') === 'true'
    && words(q('.ng-su-h1')) === deckUi['dr-3'].heading && all('.ng-su-path').length === 13);
});

for (const id of ['dr-2', 'dr-3']) {
  const deck = DR[id], record = H.bank.decks.find(d => d.id === id);
  await scenario(`${id} at start`, m => {
    solutionCalls = 0;
    pick(deck.label);
    const task = taskOf(m), own = deckUi[id];
    check(`${id} start: its heading and the one task sentence`, words(q('.ng-su-h1')) === own.heading && taskWords() === ui.task);
    check(`${id} start: the profile, givens in it`, words(q('.ng-su-profile')) === `${ui.device}. ${text(record.profileText, task.values)}${own.givens ? ` ${own.givens(task.values)}` : ''}`, words(q('.ng-su-profile')));
    check(`${id} start: its cards in the generated (learner’s) order`, JSON.stringify(rowTexts(root())) === JSON.stringify(render(task, stateOf(m)).map(r => r.text)) && rows().length === deck.count);
    gates(m, `${id} start`, { unchecked: true });
    check(`${id} start: three hints`, words(hintButton()).includes(shared.hintN({ n: 1, total: 3 })));
    const ladder = hints(task, stateOf(m)).map(h => text(h.code, h.params));
    for (let n = 1; n <= 3; n++) click(hintButton());
    check(`${id} start: the deck’s own pre-check hints, naming no pair`, ladder[0] === text(id === 'dr-3' ? 'hint-start-routeros' : 'hint-start-switch') && words(q('.ng-help-hint-text')).endsWith(ladder[2])
      && ladder.slice(0, 2).every(h => setupLeaks(h, 'hint').length === 0) && ladder[2].startsWith(text('hint-shape', { example: '' }).trim().slice(0, 20)));
    gates(m, `${id} hints`, { unchecked: true });
    check(`${id} start: no reference read`, solutionCalls === 0);
    if (id === 'dr-2') {
      check('dr-2 start: five cards with a prompt choice each, none chosen; the CLI example', all('.ng-su-board [role="radiogroup"]').length === 5
        && all('.ng-su-board [role="radio"]').length === 25 && !q('.ng-su-board [aria-checked="true"]') && Boolean(q('.ng-su-modes')));
      const missing = purposesOk(5);
      check('dr-2 start: every card’s purpose under it (the SVI cards’ say «інтерфейс VLAN»); the gateway card on the generated values', !missing
        && rows().every((li, i) => words(q('[data-purpose]', li)) === render(task, stateOf(m))[i].purpose)
        && rows().filter(li => /^(?:ip address|no shutdown)/.test(words(q('.ng-su-cmd', li)))).every(li => words(q('[data-purpose]', li)).includes('інтерфейс')
        && rowTexts(root()).includes(`ip address ${task.values.ip} ${task.values.mask}`) && rowTexts(root()).includes(`ip default-gateway ${task.values.gateway}`)), missing);
      check('dr-2 start: one mode «?», the action line with modes', modeQ().length === 1 && actionWords() === ui.action);
      check('dr-2 start: no SSH or user card (they are the router’s)', !rowTexts(root()).some(t => /^(?:crypto|username|enable secret|ip ssh|transport|login)/.test(t)));
    } else {
      check('dr-3 start: no prompt choice, no CLI example', all('.ng-su-board [role="radiogroup"]').length === 0 && !q('.ng-su-modes') && !q('.ng-su-empty'));
      check('dr-3 start: every card in three lines: its purpose (the login check: a step, not a command), the command (or the step), its Winbox path (muted)', rows().every((li, i) => {
        const row = render(task, stateOf(m))[i];
        const lines = [...q('.ng-su-row', li).childNodes].filter(n => n.nodeType === 1);
        const purpose = row.kind === 'checkpoint' ? comprehension.checkpointPurpose : row.purpose;
        return lines.length === 3 && words(lines[0]) === purpose && lines[0].hasAttribute('data-purpose') && lines[1].className === 'ng-su-term' && lines[2] === q('.ng-su-path', li)
          && words(q('.ng-su-path', li)) === `${ui.winbox} ${row.secondary}` && (row.kind === 'checkpoint' ? Boolean(q('.ng-su-step', li)) && !q('.ng-su-cmd', li) : Boolean(q('.ng-su-cmd', li)));
      }));
      const missing = purposesOk(13);
      check('dr-3 start: thirteen rows with a purpose (the login check too)', !missing, missing);
      check('dr-3 start: no mode «?» and the action line without modes', modeQ().length === 0 && words(q('.ng-action-line')) === ui.actionOrder && all('.ng-action-line').length === 1);
      check('dr-3 start: create-before-use in the purposes: the bridge cards say «міст», what uses the list says «потрібен»', rows().filter(li => /^\/interface bridge /.test(words(q('.ng-su-cmd', li)))).every(li => words(q('[data-purpose]', li)).includes('міст'))
        && rows().filter(li => /^\/(?:tool mac-server mac-winbox|ip neighbor)/.test(words(q('.ng-su-cmd', li)))).every(li => words(q('[data-purpose]', li)).includes('потрібен')));
      check('dr-3 start: the login check is a step (✋, words, no monospace)', all('.ng-su-step').length === 1 && words(q('.ng-su-hand')) === '✋' && rowTexts(root()).some(t => t.startsWith(STEP)));
      check('dr-3 start: no «міст» chip (the purposes say «міст»)', !q('.ng-su-tag'));
      check('dr-3 start: the handles name each row by its purpose, the login check as a step', all('.ng-reorder-handle').every((h, i) => {
        const row = render(task, stateOf(m))[i];
        return h.getAttribute('aria-label') === shared.reorder.handle({ n: i + 1, name: row.kind === 'checkpoint' ? comprehension.checkpointPurpose : row.purpose });
      }) && all('.ng-reorder-handle').some(h => h.getAttribute('aria-label').endsWith(comprehension.checkpointPurpose)));
      check('dr-3 start: the worked example folded, right under the action line', exampleOk() === '' && q('.ng-action-line').nextSibling === q('[data-worked-example]'), exampleOk());
    }
  });

  await scenario(`${id}: a failed check names the one dependency`, m => {
    solutionCalls = 0;
    pick(deck.label);
    arrange(m, idsBy(m, deck.broken));
    if (deck.prompts) chooseBy(m, deck.prompts);
    click(checkButton());
    check(`${id} fail: the hand-picked dependency, in words, after its cards’ positions`, status().startsWith(`• ${shared.notYet} ${id === 'dr-2' ? 'Картка' : 'Картки'} `) && status().endsWith(` ${text(deck.why)}`)
      && status() === `• ${shared.notYet} ${verdictWords(taskOf(m), stateOf(m))}`, status());
    check(`${id} fail: only its cards marked`, JSON.stringify(markedTexts().map(t => deck.marked.find(s => byStart(t, s))).sort()) === JSON.stringify([...deck.marked].sort()), markedTexts());
    check(`${id} fail: the explanation names no command or Winbox path`, setupLeaks(status(), 'rule').length === 0, setupLeaks(status(), 'rule'));
    gates(m, `${id} failed`);
    check(`${id} fail: no script, recall or reference`, !q('.ng-su-script') && !q('.ng-su-recall') && solutionCalls === 0);
    if (id === 'dr-2') check('dr-2 fail: no prompt group marked for an order finding', !q('.ng-su-board [aria-invalid="true"]'));
    click(moves(2)[1]);
    check(`${id} fail: an edit leaves the verdict «до змін» and no marks`, status().endsWith(shared.help.stale) && markedTexts().length === 0);
    gates(m, `${id} after an edit`);
  });

  await scenario(`${id}: a working order passes`, async m => {
    solutionCalls = 0;
    pick(deck.label);
    const task = taskOf(m), v = task.values;
    arrange(m, idsBy(m, deck.order));
    if (deck.prompts) chooseBy(m, deck.prompts);
    const texts = deck.order.map(start => rowTexts(root()).find(t => byStart(t, start)));
    click(checkButton());
    const st = stateOf(m);
    check(`${id} pass: «✓ Так» with the deck’s words`, st.phase === 'sorted' && status() === `✓ ${shared.yes} ${text(id === 'dr-3' ? 'ok.dr-3' : 'ok')}`, status());
    gates(m, `${id} success`);
    const parts = all('.ng-su-part');
    if (id === 'dr-2') {
      // The learner's order, the vendor's way, with the router's lines right after the hostname.
      const expected = ['enable', 'configure terminal', `ip default-gateway ${v.gateway}`, `interface vlan ${v.mgmt}`, `ip address ${v.ip} ${v.mask}`, 'no shutdown', 'exit',
        `hostname ${v.hostname}`, `ip domain-name ${v.domain}`, 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'enable secret <пароль>',
        `username ${v.username} privilege 15 secret <пароль>`, 'line vty 0 15', 'transport input ssh', 'login local', 'end', 'write memory'];
      check('dr-2 pass: the complete setup in the learner’s order', parts.length === 1 && scriptText(parts[0]) === expected.join('\n'), scriptText(parts[0]));
      check('dr-2 pass: the router’s lines tagged «як у роутері», with the key-size note', all('.ng-su-line.is-learned').length === 8
        && all('.ng-su-line.is-learned .ng-su-line-tag').every(t => words(t) === text('script-as-router')) && all('.ng-su-line-note').filter(n => words(n) === text('tip-2960-key')).length === 1);
      // Round 5 (R2): each learned command keeps the router card's purpose as its muted note; the switch's own lines and the mode changes have none.
      const learned = all('.ng-su-line').filter(l => l.className.split(/\s+/).includes('is-learned') && !/^(?:configure terminal|line vty|exit|end)/.test(words(q('.ng-su-text', l))));
      const routerPurposes = Object.fromEntries(ciscoRouter.cards.map(c => [c.id, c.purpose]));
      check('dr-2 pass: each of the seven learned commands carries the router’s purpose as a note', learned.length === 7
        && learned.every((l, i) => words(q('.ng-su-line-note', l)) === routerPurposes[['domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'transport-ssh', 'login-local'][i]])
        && all('.ng-su-line').filter(l => !learned.includes(l)).every(l => !q('.ng-su-line-note', l) || words(q('.ng-su-line-note', l)) === text('tip-2960-key')), learned.map(l => words(l)));
      check('dr-2 pass: the gateway reasoning among the lines', all('li', q('.ng-su-why .ng-su-tips')).map(words).includes(ui.lead['tip-default-gateway']));
      copies.length = 0;
      await stepAsync(() => fire(q('.ng-copy-button', parts[0]), 'click'));
      check('dr-2 pass: the copy is that script', copies.length === 1 && copies[0] === expected.join('\n') && copyFindings(copies[0], task, st, { reference: realSolution(task) }).length === 0);
    } else {
      const at = deck.order.indexOf(STEP);
      const one = [...texts.slice(0, at), text('checkpoint-comment', v)], two = texts.slice(at + 1);
      check('dr-3 pass: two parts split at the login check, in the learner’s order', parts.length === 2 && scriptText(parts[0]) === one.join('\n') && scriptText(parts[1]) === two.join('\n'),
        [scriptText(parts[0]), scriptText(parts[1])]);
      check('dr-3 pass: «Частина 1» and «Частина 2», each with its own copy button', JSON.stringify(all('.ng-su-part-label').map(words)) === JSON.stringify([text('script-part-1'), text('script-part-2')])
        && all('.ng-su-part .ng-copy-button').length === 2);
      check('dr-3 pass: RouterOS lines with their Winbox paths, nothing of Cisco', !q('.ng-su-gutter') && all('.ng-su-line-path').length === 12 && !/enable|configure|write memory|\(config/.test(all('.ng-su-part').map(scriptText).join('\n')));
      check('dr-3 pass: no «Тепер по пам’яті» (no RouterOS recall); «Далі →» primary', !continueButton() && primary(nextButton()));
      copies.length = 0;
      await stepAsync(() => fire(q('.ng-copy-button', parts[0]), 'click'));
      await stepAsync(() => fire(q('.ng-copy-button', parts[1]), 'click'));
      check('dr-3 pass: two copies, one per part, never joined', copies.length === 2 && copies[0] === one.join('\n') && copies[1] === two.join('\n')
        && copies.every(c => copyFindings(c, task, st, { reference: realSolution(task) }).length === 0));
      click(q('.ng-more-button'));
      check('dr-3 pass: «⋯» offers each part apart', JSON.stringify(all('[role="menuitem"]').map(words)) === JSON.stringify([ui.copyPart({ label: text('script-part-1') }), ui.copyPart({ label: text('script-part-2') })]));
      key(q('[role="menu"]'), 'Escape');
    }
    const lead = all('li', q('.ng-su-why .ng-su-tips')).map(words), more = all('li', q('.ng-su-more .ng-su-tips')).map(words);
    const keep = id === 'dr-3' ? ['tip-routeros-admin', 'tip-routeros-mac', 'tip-routeros-firewall', 'tip-routeros-save'] : ['tip-2960-key', 'tip-management-vlan', 'tip-passwords', 'tip-default-gateway'];
    check(`${id} pass: the deck’s own tips, all reachable`, keep.every(code => more.includes(text(code))) && !more.includes(text(id === 'dr-3' ? 'tip-save' : 'tip-routeros-save')) && lead.length >= 3, { lead, more });
    check(`${id} pass: not the reference, which was never read`, solutionCalls === 0);
  });
}

await scenario('dr-2: recall', m => {
  pick(DR['dr-2'].label);
  const task = taskOf(m), v = task.values;
  arrange(m, idsBy(m, DR['dr-2'].order));
  chooseBy(m, DR['dr-2'].prompts);
  click(checkButton());
  click(continueButton());
  check('dr-2 recall: three lines: the SVI entry, its address, the gateway', JSON.stringify(task.recallLines.map(l => l.template)) === JSON.stringify(['interface vlan {mgmt}', 'ip address {ip} {mask}', 'ip default-gateway {gateway}'])
    && words(lines()[0]).includes(`VLAN ${v.mgmt}`) && fields().length === 3);
  check('dr-2 recall: the SVI entry is masked in the script, every time', all('.ng-su-line.is-masked').length === scriptForState(task, stateOf(m)).lines.filter(l => l.masked).length
    && !all('.ng-su-text').some(t => words(t) === `interface vlan ${v.mgmt}`));
  gates(m, 'dr-2 recall');
  type(fields()[1], `ip adress ${v.ip} ${v.mask}`);
  key(fields()[1], 'Enter');
  check('dr-2 recall: a misspelt word underlined', words(q('.ng-su-bad', lines()[1])) === 'adress' && status().includes(ui.marked({ token: 'adress' })), status());
  type(fields()[0], `int vlan ${v.mgmt}`);
  key(fields()[0], 'Enter');
  check('dr-2 recall: the abbreviated SVI entry is right, and shown as typed in the script', stateOf(m).typedFeedback[task.typedIds[0]]?.ok === true
    && all('.ng-su-text').some(t => words(t) === `int vlan ${v.mgmt}`) && document.activeElement === fields()[1]);
  gates(m, 'dr-2 recall partial');
  const left = snapshot();
  pick('Роутер Cisco');
  check('dr-2 recall: the router is untouched (sorting, no lines)', stateOf(m).phase === 'sorting' && fields().length === 0);
  pick(DR['dr-2'].label);
  check('dr-2 recall: coming back, recall as left', JSON.stringify(snapshot()) === JSON.stringify(left));
  gates(m, 'dr-2 recall restored');
});

await scenario('switching decks keeps each deck apart', m => {
  // The router in recall: one line checked wrong, a hint.
  const first = taskOf(m);
  solve(m);
  click(continueButton());
  type(fields()[0], 'x');
  key(fields()[0], 'Enter');
  click(hintButton());
  const router = snapshot();
  check('switch: the router in recall, a line checked, a hint open', stateOf(m).phase === 'recall' && router.fields[0] === 'x' && router.hints === 1 && Boolean(q('.ng-help-hint-text')));
  pick(DR['dr-3'].label);
  check('switch → MikroTik: nothing of the router shows', status() === '' && markedTexts().length === 0 && !q('.ng-su-field') && !q('.ng-help-hint-text') && !instOf(m)?.session?.assisted);
  gates(m, 'switch → MikroTik', { unchecked: true });
  click(checkButton());
  click(revealButton());
  const mikrotik = snapshot();
  check('switch: MikroTik failed, then revealed', stateOf(m).phase === 'sorted-shown' && mikrotik.script.length === 2 && instOf(m).session.revealed);
  pick(DR['dr-2'].label);
  check('switch → 2960: a fresh deck, nothing carried over', status() === '' && !q('.ng-su-part') && !q('.ng-su-field') && !q('.ng-su-board [aria-checked="true"]') && !instOf(m)?.session?.assisted);
  gates(m, 'switch → 2960', { unchecked: true });
  pick('Роутер Cisco');
  const back = snapshot();
  // Coming back, the panel's current item falls back to the verdict (spec A v2); the hint waits folded.
  check('switch → router: back in recall with its line, verdict and hint', JSON.stringify({ ...back, status: router.status }) === JSON.stringify(router)
    && back.status.startsWith(`• ${shared.notYet} ${ui.lineOf({ n: 1 })}:`), { router, now: back });
  gates(m, 'switch → router');
  pick(DR['dr-3'].label);
  check('switch → MikroTik again: its reveal as left', JSON.stringify(snapshot()) === JSON.stringify(mikrotik));
  gates(m, 'switch → MikroTik again');
  // One seed for all three decks (mountSetup), three instances; the ✓ only on the router.
  const keys = H.bank.decks.map(d => drill.create(d, { seed: placeOf(m).seeds[d.id] }).instanceKey);
  check('switch: the same seed on every deck, separate instances', new Set(Object.values(placeOf(m).seeds)).size === 1 && new Set(keys).size === 3
    && m.store.state.instances[keys[0]].session.earned.solved && !m.store.state.instances[keys[2]].session.earned.solved && first.instanceKey === keys[0]);
  check('switch: ✓ on the router’s option only', deckRadios().map(b => Boolean(q('.ng-done', b))).join() === 'true,false,false');
});

await scenario('«Далі →» changes only its own deck', m => {
  pick(DR['dr-3'].label);
  click(revealButton());
  const seeds = { ...placeOf(m).seeds };
  click(nextButton());
  check('next (MikroTik): a new seed for MikroTik alone', placeOf(m).seeds['dr-3'] !== seeds['dr-3'] && placeOf(m).seeds['dr-1'] === seeds['dr-1'] && placeOf(m).seeds['dr-2'] === seeds['dr-2']);
  check('next (MikroTik): a fresh deck, focus on its first card, the panel empty', document.activeElement === handle(0) && !q('.ng-su-part') && status() === '' && !q('[data-help-current]'));
  gates(m, 'next (MikroTik)', { unchecked: true });
  check('next (MikroTik): the reorder line starts empty', live() === '');
});

// ── The gate catches injected leaks ──────────────────────────────────────

/** Mount afresh on `deck`, break the DOM one way, expect the gate to say so. */
async function injected(name, breakIt, expect, deck = 'dr-1') {
  const label = deck === 'dr-1' ? name : `${deck}: ${name}`;
  await scenario(`inject ${label}`, m => {
    const task = taskOf(m);
    const clean = structureFindings(root(), task, stateOf(m), { unchecked: true });
    breakIt(m, task);
    const found = structureFindings(root(), task, stateOf(m), { unchecked: true });
    check(`gate catches ${label}`, clean.length === 0 && found.some(f => f.startsWith(expect)), { clean, found });
  }, { deck });
}
const swap = (a, b) => { const parent = a.parentNode, next = b.nextSibling; parent.insertBefore(b, a); parent.insertBefore(a, next); };
for (const deck of ['dr-1', 'dr-2', 'dr-3']) {
  await injected('reference DOM ordering', (m, task) => {
    const ol = q('ol.ng-reorder'), ref = realSolution(task).order;
    const byId = Object.fromEntries([...rows()].map((li, i) => [render(task, stateOf(m))[i].id, li]));
    for (const id of ref) ol.appendChild(byId[id]);
  }, 'order', deck);
  await injected('CSS-free reordering of two rows', () => swap(rows()[0], rows()[1]), 'order', deck);
  await injected('fixed numbering', (m, task) => {
    const ref = realSolution(task).order;
    render(task, stateOf(m)).forEach((row, i) => { q('.ng-reorder-n', rows()[i]).textContent = String(ref.indexOf(row.id) + 1); });
  }, 'numbering', deck);
  if (deck !== 'dr-3') await injected('a preselected correct prompt', (m, task) => {
    const id = stateOf(m).answer.order[0];
    radio(0, task.cards.find(c => c.id === id).mode).setAttribute('aria-checked', 'true');
  }, 'prompts', deck);
  await injected('reference-based disabling', (m, task) => {
    const ref = realSolution(task).order, order = stateOf(m).answer.order;
    order.forEach((id, i) => { if (i > 0 && ref.indexOf(id) < ref.indexOf(order[i - 1])) moves(i)[0].setAttribute('aria-disabled', 'true'); });
  }, 'move limits', deck);
  await injected('a data annotation', () => rows()[0].setAttribute('data-mode', '(config)#'), 'attribute', deck);
  await injected('a misused evidence hook', () => rows()[0].setAttribute('data-evidence', 'first'), 'attribute', deck);
  await injected('a card id in a DOM id', m => rows()[0].setAttribute('id', `row-${stateOf(m).answer.order[0]}`), 'identity', deck);
  await injected('a command’s own id in a class', (m, task) => {
    const card = task.cards.find(c => c.id === stateOf(m).answer.order[0]);
    rows()[0].setAttribute('class', `${rows()[0].className} ${card.commandId}`);
  }, 'identity', deck);
  await injected('a hidden mirror list', (m, task) => {
    const hidden = document.createElement('ol');
    hidden.setAttribute('class', 'ng-sr-only');
    for (const id of realSolution(task).order) { const li = document.createElement('li'); li.textContent = cardText(task, id); hidden.appendChild(li); }
    root().appendChild(hidden);
  }, 'mirror', deck);
}
await injected('a Winbox path on another card’s row', () => {
  const [a, b] = [q('.ng-su-path', rows()[0]), q('.ng-su-path', rows()[1])];
  [a.textContent, b.textContent] = [b.textContent, a.textContent];
}, 'second line', 'dr-3');
await injected('a prompt group on a deck without prompts', () => {
  const group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', ui.promptOf({ n: 1 }));
  q('.ng-reorder-body', rows()[0]).appendChild(group);
}, 'prompts', 'dr-3');
await injected('a dependency in an attribute', () => q('ol.ng-reorder').setAttribute('aria-description', 'Міст → порт, список → сусіди'), 'attribute leak', 'dr-3');
await injected('a purpose on another card’s row', () => {
  const [a, b] = [q('[data-purpose]', rows()[0]), q('[data-purpose]', rows()[1])];
  [a.textContent, b.textContent] = [b.textContent, a.textContent];
}, 'purpose', 'dr-2');
// 5b-2 F: the purpose leads the row and names it.
await injected('a row whose command comes before its purpose', () => {
  const row = q('.ng-su-row', rows()[1]);
  row.insertBefore(q('.ng-su-term', row), q('[data-purpose]', row));
}, 'purpose');
await injected('a handle named by its command, not its purpose', (m, task) => {
  q('.ng-reorder-handle', rows()[0]).setAttribute('aria-label', shared.reorder.handle({ n: 1, name: render(task, stateOf(m))[0].text }));
}, 'name', 'dr-3');
await injected('a row without its purpose', () => {
  const a = q('[data-purpose]', rows()[2]);
  a.parentNode.removeChild(a);
}, 'purpose', 'dr-3');

for (const deck of ['dr-1', 'dr-3']) await scenario(`inject lifecycle leaks${deck === 'dr-1' ? '' : ` (${deck})`}`, m => {
  const task = taskOf(m);
  const name = n => (deck === 'dr-1' ? n : `${deck}: ${n}`);
  solve(m);
  const st = stateOf(m), reference = scriptForState(task, { ...st, revealed: true, showOwn: false });
  check(name('gate catches the reference script copied on success'), copyFindings(reference.parts[0].script, task, st, { reference }).length > 0);
  if (deck === 'dr-3') check(name('gate catches one paste across the login check'), copyFindings(scriptForState(task, st).parts.map(p => p.script).join('\n'), task, st).length > 0);
  if (deck === 'dr-1') check('gate catches a weak secret in a copy', copyFindings(`${scriptForState(task, st).script}\nenable secret Qz7`, task, st, { weak: ['Qz7'] }).some(f => f.includes('weak secret')));
  q('.ng-su-text').textContent = deck === 'dr-1' ? 'enable secret Qz7' : '/user add name=admin group=full password=Qz7';
  check(name('gate catches a board script that isn’t the logic’s'), disclosureFindings(root(), task, st).some(f => f.includes('scriptForState')));
  const extra = document.createElement('span');
  extra.setAttribute('class', 'ng-shown-chip');
  q('.ng-su-result-head').appendChild(extra);
  check(name('gate catches «показано» on a solved board'), disclosureFindings(root(), task, st).some(f => f.startsWith('«показано»')));
}, { deck });

await scenario('inject a stale mark after an edit', m => {
  const task = taskOf(m);
  choose(m, modes(task));
  click(checkButton());
  click(moves(4)[1]);
  rows()[7].setAttribute('class', `${rows()[7].className} is-marked`);
  check('gate catches a mark kept after an edit', disclosureFindings(root(), task, stateOf(m)).some(f => f.startsWith('marks')));
});

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
