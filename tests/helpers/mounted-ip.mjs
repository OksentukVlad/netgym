// Mounted lifecycle scenarios for the step 8 IP screens: the real screens in
// the app store (or the real shell), mounted with react-dom/client in
// tests/helpers/mini-dom.mjs, with node:test's mocked setTimeout. Run in its
// own process by tests/ip-mounted.test.mjs (tools/test.sh runs it first and
// passes the results file), so this DOM never reaches the main test process.
// Prints one JSON line: { results: [{ name, ok, detail }] }.
//   - BitOctet (polish-2 P1): cells start at 0; 0/1, Backspace (the cell
//     before, and past the end), Delete, arrows, Home/End, Space and a
//     click flip, Enter, Ctrl/Cmd+A and V not blocked, paste of 8 and 32
//     bits, roving tabindex, the help line in both modes (on each octet's
//     group in toggle mode, on each field in text mode);
//   - text mode: overwrite, deletion to 0, select-all and typing, a native
//     insert, a character outside the BMP, focus selects, a click past the
//     digits selects the last one, IME composition, shortcuts not blocked,
//     8- and 32-bit pastes;
//   - an all-zero row is checked like any other (an attempt); an accepted
//     row moves the walk on;
//   - the live calculator: results, the last valid result, the gateway
//     toggle, the copy payloads, «У бітах»;
//   - in the shell: the link payloads (history entries) and the destination
//     state, no link while working, away and back mid-walk, the reveal
//     mid-walk;
//   - the shell's one theme switch: on the start screen and at the end of an
//     IP screen's bar, pressing it flips data-theme and keeps focus;
//   - no React warnings.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';

const { document, fire } = installDom();
// React handles composition events only where the window has CompositionEvent.
window.CompositionEvent = class CompositionEvent {};
mock.timers.enable({ apis: ['setTimeout'] });
// Seeds come from Math.random: a fixed, never-repeating sequence here.
let random = 0;
Math.random = () => (random = (random + 0.1234567) % 1);
// The shell mirrors navigation into the history: record what it pushes.
const pushed = [];
globalThis.history = { pushState: state => pushed.push(structuredClone(state)), replaceState() {} };
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const { act, binary, mask, cisco, routeros, mountScreen, mountShell } = await import('../../.test-bundles/harness/mounted-ip.mjs');
const { binaryLevel1Text } = await import('../../src/sections/ip/uk.js');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

const step = fn => { let out; act(() => { out = fn(); }); act(() => { mock.timers.tick(200); }); return out; };
const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const key = (el, k, init = {}) => step(() => fire(el, 'keydown', { key: k, ...init }));
const click = el => step(() => { el.focus(); fire(el, 'click'); });
const type = (el, value) => step(() => { el.value = value; fire(el, 'input'); });
/** A native edit in a text field: its new value, the caret where the browser leaves it. */
const typeAt = (el, value, caret, init = {}) => step(() => { el.value = value; el.selectionStart = el.selectionEnd = caret; fire(el, 'input', init); });
const paste = (el, text) => step(() => fire(el, 'paste', { clipboardData: { getData: () => text } }));
const cells = () => all('.ng-bit').filter(el => el.closest('.ng-bitrow'));
const bits = () => cells().map(el => el.textContent).join('');
const focused = () => cells().indexOf(document.activeElement);
const status = () => q('[role="status"]')?.textContent ?? '';
const button = text => all('button').find(b => b.textContent.includes(text));
const typeBits = text => { cells()[0].focus(); for (const c of text) key(document.activeElement, c); };

function scenario(name, mountIt, fn) {
  const m = mountIt();
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}
/** A step whose effects finish in promises (the clipboard): flushed inside act. */
const stepAsync = async fn => { await act(async () => { fn(); for (let i = 0; i < 5; i++) await Promise.resolve(); }); act(() => { mock.timers.tick(200); }); };
async function scenarioAsync(name, mountIt, fn) {
  const m = mountIt();
  try { await fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}

// ── 1. BitOctet keyboard and paste (toggles) ──
const HELP_TOGGLES = 'Натисни на біт, щоб змінити 0 на 1 чи назад, або друкуй 0 і 1.';
const HELP_TEXT = 'Друкуй 0 і 1 поверх цифр: кожна лишається на своєму місці.';
/** Every id an element's aria-describedby names, and whether each is on the page. */
const describedIds = el => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
const resolves = el => describedIds(el).every(id => all('[id]').filter(e => e.getAttribute('id') === id).length === 1);

scenario('BitOctet keys', () => mountScreen('binary'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.binary', patch: { level: 3, seeds: { 3: 42 }, text: false } }));
  const task = binary.create(null, { seed: 42, level: 3 });
  const rows = binary.solution(task).steps.map(s => s.octets);
  const instance = () => m.store.state.instances[task.instanceKey];
  check('BitOctet: 32 cells, every one 0 at first', cells().length === 32 && bits() === '0'.repeat(32), bits());
  check('BitOctet: aria-pressed on every cell, false for a 0', cells().every(c => c.getAttribute('aria-pressed') === 'false'));
  check('BitOctet: a 0 is drawn as a value (is-zero), never empty', cells().every(c => c.className.includes('is-zero')) && all('.ng-bit.is-empty').length === 0, cells().map(c => c.className));
  check('BitOctet: one cell per octet in the Tab order (roving tabindex)', all('.ng-bitoctet').every(o => o.querySelectorAll('.ng-bit').filter(c => c.getAttribute('tabindex') === '0').length === 1));
  check('BitOctet: the name ends with the value', cells()[1].getAttribute('aria-label') === 'Адреса, октет 1, біт 64: 0', cells()[1].getAttribute('aria-label'));
  const help = q('.ng-bin-help');
  check('help line (toggles): one plain line under the question', help?.textContent === HELP_TOGGLES && help.previousSibling?.className === 'ng-bin-question', help?.textContent);
  check('help line (toggles): it describes each octet’s group, not every cell (arrow keys don’t repeat it)',
    all('.ng-bitoctet').length === 4 && all('.ng-bitoctet').every(g => g.getAttribute('role') === 'group' && describedIds(g).join() === help.getAttribute('id'))
      && cells().every(c => !c.hasAttribute('aria-describedby')), cells()[0].getAttribute('aria-describedby'));
  cells()[0].focus();
  for (const c of '1101') key(document.activeElement, c);
  check('BitOctet: 0 and 1 set the cell and move right', bits().slice(0, 8) === '11010000' && focused() === 4, { bits: bits(), focused: focused() });
  check('BitOctet: aria-pressed true for 1, false for 0; the name says which', cells()[0].getAttribute('aria-pressed') === 'true' && cells()[2].getAttribute('aria-pressed') === 'false'
    && cells()[0].getAttribute('aria-label').endsWith('біт 128: 1'));
  key(document.activeElement, 'Backspace');
  check('BitOctet: Backspace zeroes the cell before the focus and moves there', bits().slice(0, 8) === '11000000' && focused() === 3, { bits: bits(), focused: focused() });
  key(document.activeElement, 'Backspace');
  key(document.activeElement, 'Backspace');
  check('BitOctet: Backspace again: one cell back each time', bits().slice(0, 8) === '10000000' && focused() === 1, { bits: bits(), focused: focused() });
  key(cells()[0], 'Backspace');
  check('BitOctet: Backspace on the first cell zeroes it and stays', bits().slice(0, 8) === '00000000' && focused() === 0, { bits: bits(), focused: focused() });
  const space = key(cells()[5], ' ');
  check('BitOctet: Space flips 0 to 1 (default prevented, so no second click)', cells()[5].textContent === '1' && space.defaultPrevented);
  key(cells()[5], ' ');
  check('BitOctet: Space flips 1 to 0', cells()[5].textContent === '0');
  click(cells()[5]);
  check('BitOctet: a click flips 0 to 1', cells()[5].textContent === '1');
  key(cells()[5], 'Delete');
  check('BitOctet: Delete zeroes the focused cell and stays', cells()[5].textContent === '0' && focused() === 5);
  cells()[7].focus();
  key(cells()[7], 'ArrowRight');
  check('BitOctet: → crosses into the next octet', focused() === 8, focused());
  key(document.activeElement, 'ArrowDown');
  check('BitOctet: ↓ is the same bit of the next octet', focused() === 16, focused());
  key(document.activeElement, 'End');
  check('BitOctet: End is the octet’s last bit', focused() === 23, focused());
  key(document.activeElement, 'Home');
  check('BitOctet: Home is the octet’s first bit', focused() === 16, focused());
  key(document.activeElement, 'ArrowUp'); key(document.activeElement, 'ArrowLeft');
  check('BitOctet: ↑ and ← move back', focused() === 7, focused());
  const shortcuts = [['a', { ctrlKey: true }], ['v', { ctrlKey: true }], ['a', { metaKey: true }], ['v', { metaKey: true }], ['1', { ctrlKey: true }]].map(([k, init]) => key(cells()[3], k, init).defaultPrevented);
  check('BitOctet: Ctrl/Cmd+A and V (and any Ctrl+key) are not blocked', shortcuts.every(p => !p) && cells()[3].textContent === '0', shortcuts);
  // The row is all 0 again: an answer like any other (polish-2 P1, V3).
  const enter = key(cells()[3], 'Enter');
  check('BitOctet: Enter checks the row (default prevented)', enter.defaultPrevented);
  check('an all-zero row is checked: an attempt, its octets as typed', instance()?.session.attempts === 1 && instance()?.answer?.octets.join('') === '0'.repeat(32), instance()?.answer);
  // Round 4 (spec R5 v2): only the first wrong octet is flagged (a legitimately
  // zero octet is right), its verdict and own line give «зараз …, треба …».
  const firstWrong = rows[0].findIndex(o => o !== '00000000');
  const target = parseInt(rows[0][firstWrong], 2);
  check('an all-zero row: «Ще ні», only the first wrong octet marked, its target sum said', status().includes(`Октет ${firstWrong + 1}: зараз 0, треба ${target}.`)
    && all('.ng-bitoctet.is-wrong').length === 1 && all('.ng-bitoctet')[firstWrong].className.includes('is-wrong'), status());
  check('the flagged octet alone carries data-evidence="current"', all('[data-evidence="current"]').length === 1 && all('.ng-bitoctet')[firstWrong].getAttribute('data-evidence') === 'current');
  check('no incomplete state: no notice; the octet\'s own line «Зараз 0, треба N.»',
    !status().includes('Заповни') && all('.ng-bitoctet-msg').length === 1 && all('.ng-bitoctet-msg')[0].textContent === `Зараз 0, треба ${target}.`, all('.ng-bitoctet-msg').map(p => p.textContent));
  const marked = all('.ng-bitoctet.is-wrong')[0].querySelectorAll('.ng-bit')[0];
  const markedGroup = all('.ng-bitoctet.is-wrong')[0];
  check('a marked octet: its cells described by its message; its group still by the help line',
    describedIds(marked).length === 1 && all('[id]').find(e => e.getAttribute('id') === describedIds(marked)[0])?.textContent === `Зараз 0, треба ${target}.`
      && describedIds(markedGroup).join() === help.getAttribute('id') && [...cells(), ...all('.ng-bitoctet')].every(resolves), describedIds(marked));
  // Paste: 8 bits into octet 2, then 32 into the row, then junk.
  paste(cells()[9], '1010 1010');
  check('paste: eight bits fill the octet under focus', cells().slice(8, 16).map(c => c.textContent).join('') === '10101010', bits());
  const junk = paste(cells()[9], '192.168.1.1');
  check('paste: anything else is a notice, nothing changes', junk.defaultPrevented && status().includes('Встав вісім цифр') && cells().slice(8, 16).map(c => c.textContent).join('') === '10101010', status());
  paste(cells()[0], rows[0].join('.'));
  check('paste: thirty-two bits (dots ignored) fill the row', bits() === rows[0].join(''), bits());
  key(cells()[31], 'Enter');
  check('accepted row: part 0 stored, the walk moves to the mask row', instance().parts[0]?.octets.join('') === rows[0].join('') && instance().view.step === 1 && instance().session.attempts === 2, instance().view);
  check('accepted row: focus on the new row’s first cell, all 0', focused() === 0 && cells()[0].getAttribute('aria-label').startsWith('Маска, октет 1') && bits() === '0'.repeat(32), cells()[0]?.getAttribute('aria-label'));
  check('accepted row: no prefix line before the mask row', all('.is-line').length === 0);
  // A wrong mask: octet marks only, an attempt, no move.
  typeBits(rows[1].map((o, i) => (i === 3 ? '00000000' : o)).join(''));
  key(document.activeElement, 'Enter');
  check('wrong row: one octet marked, the walk stays, an attempt counted', all('.ng-bitoctet.is-wrong').length === 1 && instance().view.step === 1 && instance().session.attempts === 3 && !instance().parts[1], status());
  check('wrong row: no bit is marked', all('.ng-bit.is-wrong').length === 0);
  paste(cells()[0], rows[1].join(''));
  key(cells()[0], 'Enter');
  check('mask accepted: the prefix line on the sheet and on the new row', all('.ng-bin-sheet').length === 1 && all('.is-line').length > 0 && cells().some(c => c.className.includes('is-line')));
});

// ── 1b. Backspace after the row's last digit (polish-2 V1) ──
scenario('BitOctet Backspace past the end', () => mountScreen('binary'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.binary', patch: { level: 3, seeds: { 3: 3 }, text: false } }));
  typeBits('1'.repeat(32));
  check('past the end: 32 bits typed, focus stays on the last cell', bits() === '1'.repeat(32) && focused() === 31, { bits: bits(), focused: focused() });
  for (let i = 0; i < 3; i++) key(document.activeElement, 'Backspace');
  check('past the end: Backspace ×3 zeroes cells 32, 31 and 30, focus on 30', bits() === `${'1'.repeat(29)}000` && focused() === 29, { bits: bits(), focused: focused() });
  typeBits('1'.repeat(32));
  key(document.activeElement, 'ArrowLeft');
  key(document.activeElement, 'ArrowRight');
  key(document.activeElement, 'Backspace');
  check('past the end: another key clears it, so Backspace zeroes the cell before', bits() === `${'1'.repeat(30)}01` && focused() === 30, { bits: bits(), focused: focused() });
  typeBits('1'.repeat(32));
  click(cells()[31]);
  key(document.activeElement, 'Backspace');
  check('past the end: a click clears it too (the clicked cell flips; Backspace zeroes the one before)', bits() === `${'1'.repeat(30)}00` && focused() === 30, { bits: bits(), focused: focused() });
});

// ── 1c. A stray empty cell reads as 0 (polish-2 V3: none can arise now) ──
scenario('BitOctet empty cell', () => mountScreen('binary'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.binary', patch: { level: 3, seeds: { 3: 5 }, text: false } }));
  const task = binary.create(null, { seed: 5, level: 3 });
  const row = binary.solution(task).steps[0].octets;
  const draft = row.map(o => [...o].map(c => (c === '0' ? '' : c)));
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { drafts: { 0: draft } } } }));
  key(cells()[0], 'Enter');
  const instance = m.store.state.instances[task.instanceKey];
  check('a draft with empty cells is checked with 0s: accepted', instance.parts[0]?.octets.join('') === row.join('') && instance.session.attempts === 1, instance.answer);
});

// ── 2. Text mode ──
scenario('text mode', () => mountScreen('binary'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.binary', patch: { level: 3, seeds: { 3: 7 }, text: false } }));
  const task = binary.create(null, { seed: 7, level: 3 });
  const rows = binary.solution(task).steps.map(s => s.octets);
  const instance = () => m.store.state.instances[task.instanceKey];
  typeBits('101');
  click(q('.ng-bin-mode'));
  const fields = () => all('.ng-bittext-input');
  check('text mode: four native fields with the same draft, eight digits each', fields().length === 4 && fields()[0].value === '10100000' && fields().slice(1).every(f => f.value === '00000000'), fields().map(f => f.value));
  check('text mode: no placeholder and no «_»', fields().every(f => !f.hasAttribute('placeholder')));
  const help = q('.ng-bin-help');
  check('help line (text): its own words, describing every field', help?.textContent === HELP_TEXT && fields().every(f => describedIds(f).join() === help.getAttribute('id')), help?.textContent);
  type(fields()[1], '1a02x1101x10');
  check('text mode: only 0 and 1 are kept, eight of them', fields()[1].value === '10110110', fields()[1].value);
  // A digit typed at the caret overwrites the one after it; the caret stays after it.
  const field = fields()[1];
  field.setSelectionRange = (a, b) => { field.selectionStart = a; field.selectionEnd = b; };
  field.focus();
  typeAt(field, '100110110', 3);
  check('text mode: typing overwrites the digit after the caret', field.value === '10010110', field.value);
  check('text mode: the caret stays just after the typed digit', field.selectionStart === 3 && field.selectionEnd === 3, field.selectionStart);
  typeAt(field, '0010110', 0);
  check('text mode: a deleted digit becomes 0 in its place', field.value === '00010110' && field.selectionStart === 0, field.value);
  typeAt(field, '000a10110', 4);
  check('text mode: a character that isn’t a bit is dropped, no neighbour changes, the caret stays', field.value === '00010110' && field.selectionStart === 3, field.value);
  typeAt(field, '1', 1);
  check('text mode: select-all, then a digit: the digit, then 0s', field.value === '10000000' && field.selectionStart === 1, field.value);
  typeAt(field, '110000000', 2);
  check('text mode: … and typing on overwrites', field.value === '11000000', field.value);
  const short = paste(field, '101');
  check('text mode: a short paste is not intercepted (the browser inserts it)', !short.defaultPrevented);
  typeAt(field, '10111000000', 3);
  check('text mode: a native multi-character insert keeps positions (it overwrites)', field.value === '10100000' && field.selectionStart === 3, field.value);
  // A click past the digits in the focused field: the caret at the end would drop typing, so the last digit is selected.
  const clickAt = (start, end = start) => step(() => { field.selectionStart = start; field.selectionEnd = end; fire(field, 'click'); });
  clickAt(8);
  check('text mode: a click past the digits selects the last one', field.selectionStart === 7 && field.selectionEnd === 8, [field.selectionStart, field.selectionEnd]);
  typeAt(field, '10100001', 8);
  check('text mode: … so a digit typed then replaces it', field.value === '10100001' && field.selectionStart === 8, field.value);
  clickAt(8);
  typeAt(field, '1010000', 7);
  check('text mode: … and Backspace zeroes it', field.value === '10100000' && field.selectionStart === 7, field.value);
  clickAt(3);
  const inside = [field.selectionStart, field.selectionEnd];
  clickAt(2, 5);
  check('text mode: a click inside the digits, or a selection, is left as it is', inside.join() === '3,3' && field.selectionStart === 2 && field.selectionEnd === 5, { inside, now: [field.selectionStart, field.selectionEnd] });
  // A character outside the BMP (two UTF-16 units; the caret counts units) replacing positions 0–1, then inserted at 3.
  typeAt(field, '😀100000', 2);
  check('text mode: an emoji over a selection: those positions 0, nothing else moves', field.value === '00100000' && field.selectionStart === 0, field.value);
  typeAt(field, '001😀00000', 5);
  check('text mode: an emoji inserted at the caret is dropped; nothing moves, the caret stays', field.value === '00100000' && field.selectionStart === 3, field.value);
  // Focus selects the whole field, so a click right of the digits can't leave the caret at the end.
  const selected = [];
  fields()[2].select = () => selected.push(2);
  step(() => { fields()[2].focus(); fire(fields()[2], 'focusin'); });
  check('text mode: focus selects the whole field', selected.join() === '2', selected);
  // An IME composing: its text stays as it is until the composition ends; Enter then doesn't check.
  const ime = fields()[3];
  ime.focus();
  typeAt(ime, '00０00000', 3, { isComposing: true });
  check('IME: while composing, the field is not rewritten', ime.value === '00０00000' && instance().view.drafts[0][3].join('') === '00000000', ime.value);
  const attempts = instance()?.session.attempts ?? 0;
  const composingEnter = key(ime, 'Enter', { isComposing: true });
  check('IME: Enter during composition doesn’t check', !composingEnter.defaultPrevented && (instance()?.session.attempts ?? 0) === attempts);
  step(() => { ime.value = '001000000'; ime.selectionStart = ime.selectionEnd = 3; fire(ime, 'compositionend'); });
  check('IME: the composition’s end rewrites the field by the same rule', ime.value === '00100000', ime.value);
  const shortcuts = [['a', { ctrlKey: true }], ['v', { ctrlKey: true }], ['a', { metaKey: true }], ['Home', {}], ['End', {}], ['Backspace', {}]].map(([k, init]) => key(fields()[1], k, init).defaultPrevented);
  check('text mode: Ctrl/Cmd+A and V, Home, End and Backspace are the browser’s', shortcuts.every(p => !p), shortcuts);
  const eight = paste(fields()[2], '1111 0000');
  check('text mode: an 8-bit paste fills that octet (separators ignored)', eight.defaultPrevented && fields()[2].value === '11110000', fields()[2].value);
  const other = paste(fields()[2], 'abc');
  check('text mode: other text is pasted natively (not intercepted)', !other.defaultPrevented);
  const full = paste(fields()[0], rows[0].join(' '));
  check('text mode: a 32-bit paste fills all four fields', full.defaultPrevented && fields().map(f => f.value).join('') === rows[0].join(''), fields().map(f => f.value));
  key(fields()[3], 'Enter');
  check('text mode: Enter checks; the row is accepted', instance().parts[0]?.octets.join('') === rows[0].join(''));
  type(fields()[0], rows[1][0]);
  click(q('.ng-bin-mode'));
  check('back to toggles: the same draft', cells().slice(0, 8).map(c => c.textContent).join('') === rows[1][0]);
});

// ── 2b. Text mode: overwriting keeps every bit in its position ──
scenario('text mode overwrite keeps positions', () => mountScreen('binary'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.binary', patch: { level: 3, seeds: { 3: 9 }, text: false } }));
  click(cells()[7]);
  check('positions: the last bit of octet 1 set with a toggle', cells().slice(0, 8).map(c => c.textContent).join('') === '00000001');
  click(q('.ng-bin-mode'));
  const field = () => all('.ng-bittext-input')[0];
  check('positions: text mode shows the eight digits', field().value === '00000001', field().value);
  typeAt(field(), '000000010', 9);
  check('positions: a 0 typed at the end has nothing to overwrite and shifts nothing', field().value === '00000001', field().value);
  typeAt(field(), '000100001', 4);
  check('positions: a 1 typed after the third digit overwrites the fourth', field().value === '00010001', field().value);
  click(q('.ng-bin-mode'));
  check('positions: back to toggles, every bit where it was', cells().slice(0, 8).map(c => c.textContent).join('') === '00010001', cells().slice(0, 8).map(c => c.textContent).join(''));
});

// ── 3. The live calculator ──
scenario('live calculator', () => {
  const copied = [];
  const m = mountScreen('calculator', { onCopy: text => copied.push(text) });
  m.copied = copied;
  return m;
}, m => {
  const fields = () => all('.ng-field-input');
  const block = () => q('.ng-calc-block').textContent.replace(/^(Блок|Адреса): /, '');
  const row = label => all('.ng-calc-row').find(r => r.querySelector('dt').textContent === label)?.querySelector('dd').querySelector('.ng-calc-value')?.textContent;
  check('calculator: the default 192.168.1.10/24', block() === '192.168.1.0/24' && row('Шлюз')?.startsWith('192.168.1.1'), block());
  type(fields()[0], '10.20.30.41');
  check('calculator: a new address updates at once', block() === '10.20.30.0/24', block());
  type(fields()[1], '/30');
  check('calculator: a new prefix updates at once; the count says what it counts', block() === '10.20.30.40/30' && row('Місць для пристроїв') === '2 вузли'
    && all('.ng-calc-count-what')[0]?.textContent === '(без адреси мережі та широкомовної)', [block(), row('Місць для пристроїв')]);
  type(fields()[1], '255.255.255.248');
  check('calculator: a dotted mask works too', block() === '10.20.30.40/29', block());
  type(fields()[0], '10.20.30.');
  check('calculator: an invalid address keeps the last valid result, labelled', block() === '10.20.30.40/29' && q('.ng-calc-stale')?.textContent.includes('10.20.30.41/29') && fields()[0].getAttribute('aria-invalid') === 'true', q('.ng-calc-stale')?.textContent);
  check('calculator: the label is a polite live region that stays mounted', q('.ng-calc-stale').getAttribute('aria-live') === 'polite');
  type(fields()[0], '10.20.30.45');
  check('calculator: valid again, live again (the live region empties)', q('.ng-calc-stale')?.textContent === '' && block() === '10.20.30.40/29');
  const last = all('[role="radio"]').find(r => r.textContent === 'остання адреса');
  click(last);
  check('calculator: the gateway toggle picks the last address', row('Шлюз')?.startsWith('10.20.30.46'), row('Шлюз'));
  const toggle = q('.ng-calc-disclosure');
  check('calculator: «У бітах» closed by default', toggle.getAttribute('aria-expanded') === 'false' && all('.ng-bitrows').length === 0);
  click(toggle);
  check('calculator: «У бітах» opens the four rows', toggle.getAttribute('aria-expanded') === 'true' && all('.ng-bitrows').length === 1 && q('.ng-bitrows').querySelector('ul').querySelectorAll('li').length === 4);
  type(fields()[1], '/31');
  check('calculator: /31 drops the broadcast row and the gateway', q('.ng-bitrows').querySelector('ul').querySelectorAll('li').length === 3 && row('Шлюз') === undefined);
  check('calculator: no practise link outside the shell', !button('Потренуватися'));
  // Round 4 (spec R3): «Приклад конфігурації» folded by default; copying off, with its reason, while an input is empty or malformed.
  const commands = () => all('button').find(b => b.textContent.startsWith('Приклад конфігурації'));
  check('calculator: the configuration example is folded by default', commands()?.getAttribute('aria-expanded') === 'false' && all('.ng-commands-pre').length === 0);
  type(fields()[1], '/24');
  click(commands());
  check('calculator: unfolded, its copy buttons work', commands().getAttribute('aria-expanded') === 'true' && all('.ng-commands-copy').length === 2
    && all('.ng-commands-copy').every(b => !b.hasAttribute('aria-disabled')) && !q('.ng-commands-off'));
  type(fields()[1], '');
  check('calculator: an empty input turns copying off, with the reason in words', all('.ng-commands-copy').every(b => b.getAttribute('aria-disabled') === 'true') && q('.ng-commands-off')?.textContent.includes('Копіювання вимкнено')
    && all('.ng-commands-copy').every(b => b.getAttribute('aria-describedby') === q('.ng-commands-off').getAttribute('id')));
  const before = m.copied.length;
  click(all('.ng-commands-copy')[0]);
  check('calculator: a disabled copy copies nothing', m.copied.length === before);
  type(fields()[1], '/2x');
  check('calculator: a malformed input keeps copying off', all('.ng-commands-copy').every(b => b.getAttribute('aria-disabled') === 'true'));
  type(fields()[1], '/24');
  check('calculator: valid again, copying recovers', all('.ng-commands-copy').every(b => !b.hasAttribute('aria-disabled')) && !q('.ng-commands-off'));
});

// ── 4. The shell: links, payloads and destination state ──
const lastPush = () => pushed.at(-1)?.ng;
const openCard = title => { const back = button('Розділи'); if (back) click(back); click(all('.ng-card').find(c => c.textContent.includes(title))); };
const heading = () => q('h1')?.textContent;

const level3 = () => click(all('[role="radio"]').find(r => r.textContent.startsWith('3 ·')));
scenario('shell links', mountShell, () => {
  openCard('у бітах');
  check('shell: the walk opens; its heading has focus', heading() === 'Адреса і маска в бітах' && document.activeElement === q('h1'));
  level3();
  const ipText = q('[data-provenance="given"]').textContent;
  const [, ip, prefix] = ipText.match(/Адреса (\S+), маска \/(\d+)/);
  const task = binary.create(null, { ip, prefix: Number(prefix) });
  const rows = binary.solution(task).steps.map(s => s.octets);
  check('shell: no calculator link while working', !button('Відкрити в калькуляторі'));
  for (const s of [0, 1]) { paste(cells()[0], rows[s].join('')); key(cells()[0], 'Enter'); }
  typeBits(rows[2].slice(0, 2).join(''));
  check('shell: still no link mid-walk', !button('Відкрити в калькуляторі'));
  // Away and back mid-walk.
  openCard('IP-калькулятор');
  check('away mid-walk: the calculator is open', heading() === 'Мережа за адресою і маскою');
  openCard('у бітах');
  const sheet = q('.ng-bin-sheet');
  check('back mid-walk: the same task', q('[data-provenance="given"]').textContent === ipText);
  check('back mid-walk: the two accepted rows', sheet && sheet.querySelector('ul').querySelectorAll('li').length === 2);
  check('back mid-walk: the network row’s draft as it was', bits() === rows[2].slice(0, 2).join('').padEnd(32, '0'), bits());
  check('back mid-walk: the step', q('li[aria-current="step"]')?.textContent.includes('Мережа'));
  // Finish, then the link and its payload.
  paste(cells()[0], rows[2].join('')); key(cells()[0], 'Enter');
  paste(cells()[0], rows[3].join('')); key(cells()[0], 'Enter');
  check('solved: the ruler with the student’s block', all('.ng-ruler-block').length === 1);
  const link = button('Відкрити в калькуляторі');
  check('solved: the link', Boolean(link));
  click(link);
  check('link payload: the calculator with the walk’s address and prefix', JSON.stringify(lastPush()) === JSON.stringify({ section: 'ip-calculator', screen: 'main', params: { ip, prefix: Number(prefix) } }), lastPush());
  const net = rows[2].map(o => parseInt(o, 2)).join('.');
  check('link destination: the calculator shows that block', heading() === 'Мережа за адресою і маскою' && all('.ng-field-input')[0].value === ip && q('.ng-calc-block').textContent.endsWith(`${net}/${prefix}`), q('.ng-calc-block').textContent);
  check('link destination: focus on its heading', document.activeElement === q('h1'));
  // «Потренуватися → Маска»: a fresh task with the pushed seed.
  click(button('Потренуватися → Маска'));
  const route = lastPush();
  check('practise payload: the mask section with an integer seed', route?.section === 'ip-mask' && Number.isInteger(route.params.seed) && Object.keys(route.params).length === 1, route);
  const expected = mask.create(null, { seed: route.params.seed, level: 1 });
  check('practise destination: that seed’s task at level 1', heading() === 'Маска і блок адрес' && q('[data-region="stage"]').textContent.includes(expected.ip), { want: expected.ip, got: q('[data-region="stage"]').textContent.slice(0, 80) });
  check('mask: no calculator link while working', !button('Відкрити в калькуляторі'));
  check('mask (round 4, Q6): «Далі →» is offered before completion, secondary (skip without revealing)', Boolean(q('.ng-help-next')) && !q('.ng-help-next').className.includes('primary')
    && q('.ng-help-check').className.includes('primary'));
  check('mask: its block rule (Aside) is open on the first visit', Boolean(q('.ng-aside-body')));
  click(button('Перевірити'));
  check('mask: an empty check is a note, not an attempt: tone info, no «Ще ні», the aside stays open', q('[data-help-current]')?.getAttribute('data-help-tone') === 'info'
    && status() === 'Спочатку заповни відповідь.' && Boolean(q('.ng-aside-body')), status());
  click(button('Показати відповідь'));
  const maskLink = button('Відкрити в калькуляторі');
  check('mask: the link once revealed', Boolean(maskLink));
  click(maskLink);
  check('mask link payload: the task’s address and prefix', JSON.stringify(lastPush()) === JSON.stringify({ section: 'ip-calculator', screen: 'main', params: { ip: expected.ip, prefix: expected.prefix } }), lastPush());
  check('mask link destination: the calculator shows the task’s address', all('.ng-field-input')[0].value === expected.ip);
});

scenario('reveal mid-walk', mountShell, () => {
  openCard('у бітах');
  level3();
  const ipText = q('[data-provenance="given"]').textContent;
  const [, ip, prefix] = ipText.match(/Адреса (\S+), маска \/(\d+)/);
  const rows = binary.solution(binary.create(null, { ip, prefix: Number(prefix) })).steps.map(s => s.octets);
  paste(cells()[0], rows[0].join('')); key(cells()[0], 'Enter');
  typeBits('11');
  check('before the reveal: no reference rows in the page', !q('[data-provenance="reference"]'));
  click(button('Показати відповідь'));
  const reveal = q('.ng-reveal');
  check('reveal mid-walk: all four rows', reveal && reveal.querySelector('ul').querySelectorAll('li').length === 4);
  check('reveal mid-walk: focus on the answer’s heading', document.activeElement === q('.ng-reveal-heading'));
  check('reveal mid-walk: no editing, no check; «Далі →» primary and the link', cells().length === 0 && !button('Перевірити') && q('.ng-help-next')?.className.includes('primary') && Boolean(button('Відкрити в калькуляторі')));
  check('reveal mid-walk: the accepted address row stays on the sheet', q('.ng-bin-sheet')?.querySelector('ul').querySelectorAll('li').length === 1);
  // Round 4 (spec A5): no penalty wording; that a reveal before earning isn't counted is the session's (store tests).
  check('reveal mid-walk: the answer in the panel, no penalty wording', status().startsWith('Відповідь') && !/зарахов|Спробуй нове/.test(document.body.textContent), status().slice(0, 40));
  click(q('.ng-help-next'));
  check('«Далі»: a new task at the same level, a fresh row with focus', q('[data-provenance="given"]').textContent !== ipText && cells().length === 32 && focused() === 0);
});

// ── 4a. Round 4 (spec R5): the levels, level 1's given octets, the panel ──
scenario('binary levels', mountShell, () => {
  openCard('у бітах');
  const radio = n => all('[role="radio"]').find(r => r.textContent.startsWith(`${n} ·`));
  check('levels: three, by skill; level 1 chosen the first time', ['1 · Один октет', '2 · /24', '3 · Будь-яка маска'].every((t, i) => radio(i + 1)?.textContent.startsWith(t)) && radio(1).getAttribute('aria-checked') === 'true');
  const ipText = q('p[data-provenance="given"]').textContent;
  const [, ip, prefix] = ipText.match(/Адреса (\S+), маска \/(\d+)/);
  const task = binary.create(null, { ip, prefix: Number(prefix), level: 1 });
  const rows = binary.solution(task).steps.map(s => s.octets);
  check('level 1: a prefix 25–30', Number(prefix) >= 25 && Number(prefix) <= 30, prefix);
  // Round 5 (spec 5b-1 §2, v2.1, v2.2): level 1 says what is given and what to do, in this input mode.
  const words = (n, mode = 'toggles') => binaryLevel1Text(task, { step: n, mode });
  const action = () => q('.ng-bin-now .ng-action-line');
  check('R5 level 1: the question names octet 4 and the address\'s fourth number', q('.ng-bin-question')?.textContent === words(0).question && words(0).question.endsWith(`четвертий — ${Number(ip.split('.')[3])}.`), q('.ng-bin-question')?.textContent);
  check('R5 level 1: the action line, in the toggles\' words, right above the row; the old help line gone', action()?.textContent === words(0).action && !q('.ng-bin-help')
    && action().nextSibling?.querySelector?.('.ng-bitrow') && all('.ng-bitoctet').every(g => g.getAttribute('aria-describedby') === action().getAttribute('id')), action()?.textContent);
  check('R5 level 1: one band «Октети 1–3 · задано» named by its caption holds the three given octets; octet 4 outside it',
    q('.ng-bitband-caption')?.textContent === 'Октети 1–3 · задано' && q('.ng-bitband').getAttribute('aria-labelledby') === q('.ng-bitband-caption').getAttribute('id')
      && all('.ng-bitband .ng-bitoctet.is-given').length === 3 && all('.ng-bitband .ng-bitoctet').length === 3 && !q('.ng-bitband').contains(cells()[24]));
  check('level 1: octets 1–3 given (shown, read-only, out of the Tab order), octet 4 open',
    all('.ng-bitoctet.is-given').length === 3 && bits().slice(0, 24) === rows[0].slice(0, 3).join('') && cells().slice(0, 24).every(c => c.getAttribute('aria-disabled') === 'true' && c.getAttribute('tabindex') === '-1')
      && cells().slice(24).filter(c => c.getAttribute('tabindex') === '0').length === 1, bits());
  click(cells()[0]);
  check('level 1: a given cell does not flip', bits().slice(0, 24) === rows[0].slice(0, 3).join(''));
  cells()[24].focus();
  for (const c of rows[0][3]) key(document.activeElement, c);
  check('level 1: typing fills octet 4 only', bits() === rows[0].join(''), bits());
  paste(cells()[24], '1'.repeat(32));
  check('level 1: 32 pasted bits never change a given octet', bits().slice(0, 24) === rows[0].slice(0, 3).join('') && bits().slice(24) === '11111111', bits());
  paste(cells()[24], rows[0][3]);
  key(cells()[24], 'Enter');
  check('level 1: the address row accepted (the logic\'s normalised octets stored)', q('li[aria-current="step"]')?.textContent.includes('Маска') && cells()[0].getAttribute('aria-label').startsWith('Маска'));
  check('level 1: the panel says the part is done (scope part), not the task', q('[data-help-current]')?.getAttribute('data-help-scope') === 'part' && q('[data-help-current]').getAttribute('data-help-tone') === 'ok');
  // A wrong mask octet 4: the verdict gives the sum; text mode keeps the givens read-only.
  key(cells()[24], 'Enter');
  const maskTarget = parseInt(rows[1][3], 2);
  check('level 1: a wrong octet 4: «зараз 0, треба N», only it marked', status().includes(`Октет 4: зараз 0, треба ${maskTarget}.`) && all('.ng-bitoctet.is-wrong').length === 1);
  check('R5 level 1 (repair v1): the band keeps its numbers on the mask step («Октет 1 · 255»); octet 4\'s stays hidden',
    all('.ng-bitband .ng-bitoctet-caption').map(c => c.textContent).join('|') === 'Октет 1 · 255|Октет 2 · 255|Октет 3 · 255' && all('.ng-bitrow .ng-bitoctet-caption').at(-1)?.textContent === 'Октет 4',
    all('.ng-bitrow .ng-bitoctet-caption').map(c => c.textContent));
  click(q('.ng-bin-mode'));
  check('R5 level 1, text mode: the mask step\'s own text-entry words, on every field', action()?.textContent === words(1, 'text').action && q('.ng-bin-question').textContent === words(1).question
    && all('.ng-bittext-input').every(f => (f.getAttribute('aria-describedby') ?? '').split(' ').includes(action().getAttribute('id'))), action()?.textContent);
  const fields = all('.ng-bittext-input');
  check('level 1, text mode: the given octets pre-filled and read-only, octet 4 editable', fields.slice(0, 3).every((f, i) => f.hasAttribute('readonly') && f.value === rows[1][i] && f.getAttribute('tabindex') === '-1') && !fields[3].hasAttribute('readonly'), fields.map(f => [f.value, f.hasAttribute('readonly')]));
  typeAt(fields[0], '00000000', 8);
  check('level 1, text mode: an edit in a given field changes nothing', all('.ng-bittext-input')[0].value === rows[1][0]);
  check('level 1, text mode: the flagged field is the evidence', all('.ng-bittext')[3].getAttribute('data-evidence') === 'current');
  click(q('.ng-bin-mode'));
  // Hints read the row as it is now: rung 1 names its first wrong octet.
  click(all('button').find(b => b.textContent.includes('Підказка 1')));
  check('level 1: hint 1 reads the current row (octet 4 and its sum)', status().includes(`октет 4 рядка маски`) && status().includes(String(maskTarget)), status());
  // Steps 2–4 never print their row's result (the action names the operation and its operands only).
  const leaks = [];
  for (const s of [1, 2, 3]) {
    const result = parseInt(rows[s][3], 2), said = `${q('.ng-bin-question').textContent} ${action().textContent}`;
    if (q('.ng-bin-question').textContent !== words(s).question || action().textContent !== words(s).action) leaks.push(`step ${s + 1}: other words`);
    if (result > 1 && new RegExp(`(^|\\D)${result}(\\D|$)`).test(said)) leaks.push(`step ${s + 1}: ${result} in «${said}»`);
    cells()[24].focus(); paste(cells()[24], rows[s][3]); key(cells()[24], 'Enter');
  }
  check('R5 level 1: steps 2–4 have their own question and action line, and never say the result', leaks.length === 0, leaks);
  check('level 1: solved: the success says the result, «Далі →» primary', q('[data-help-current]')?.getAttribute('data-help-scope') === 'task' && q('.ng-help-next')?.className.includes('primary'));
  check('level 1: solved: its level shows the quiet ✓ (DoneMark), the others don\'t', radio(1).querySelector('.ng-done') && !radio(2).querySelector('.ng-done') && radio(1).textContent.includes('розв'));
  click(radio(2));
  const l2 = q('p[data-provenance="given"]').textContent;
  check('level 2: /24, no given octet', /маска \/24 /.test(l2) && all('.ng-bitoctet.is-given').length === 0, l2);
  click(radio(1));
  check('back to level 1: the same (solved) task, the level kept', q('p[data-provenance="given"]').textContent === ipText && radio(1).getAttribute('aria-checked') === 'true');
});

// ── 4c. Round 4 (spec R4): one mask exercise, chips as help ──
scenario('mask merge', () => mountScreen('mask'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 1, seeds: { 1: 11 } } }));
  const task = mask.create(null, { seed: 11, level: 1 });
  const answer = mask.solution(task);
  const textbox = label => all('.ng-field').find(f => f.querySelector('.ng-field-label')?.textContent === label)?.querySelector('input');
  const group = label => all('[role="radiogroup"]').find(g => g.getAttribute('aria-label') === `${label}: варіанти`);
  const link = () => q('.ng-mask-mode');
  // Repair 8: the offer is the card-wide link itself (one control; the check row keeps three buttons).
  const offer = () => (link()?.textContent === 'Показати варіанти' ? link() : null);
  const prefBefore = m.store.state.prefs.inputMode;
  check('mask: typed fields first, no per-field toggle, one quiet card-wide link', Boolean(textbox('Адреса мережі')) && Boolean(textbox('Широкомовна адреса'))
    && all('.ng-field-mode').length === 0 && link()?.textContent === 'Обрати з варіантів');
  check('mask: levels name their skill', ['1 · /25–/27', '2 · /28–/30 і розмір мережі', '3 · /17–/23'].every(t => all('[role="radio"]').some(r => r.textContent.startsWith(t))));
  check('mask: no offer before a check', !offer());
  type(textbox('Адреса мережі'), answer.network);
  type(textbox('Широкомовна адреса'), '1.2.3.4');
  click(button('Перевірити'));
  check('mask: a wrong check turns the quiet link into «Показати варіанти»; the check row keeps three buttons', Boolean(offer()) && !q('.ng-help-continue')
    && q('[data-help="row"]').querySelectorAll('button').length === 4);
  check('mask: the field the verdict names carries the evidence', q('[data-field="broadcast"]')?.getAttribute('data-evidence') === 'current' && all('[data-evidence="current"]').length === 1);
  click(offer());
  check('mask: the offer turns the wrong field into chips and keeps the right one typed', textbox('Адреса мережі')?.value === answer.network && Boolean(group('Широкомовна адреса')) && !textbox('Широкомовна адреса'));
  check('mask: chips are radios that look like buttons (in the choices group), none chosen yet', group('Широкомовна адреса').closest('.ng-field-choices') && group('Широкомовна адреса').querySelectorAll('[role="radio"]').every(r => r.getAttribute('aria-checked') === 'false'));
  check('mask: focus goes to the chips', document.activeElement?.getAttribute('role') === 'radio' && group('Широкомовна адреса').contains(document.activeElement));
  check('mask: the offer is gone once nothing is left to convert', !offer());
  check('mask: the card link now switches back', link()?.textContent === 'Ввести самому');
  click(button('Перевірити'));
  check('mask: an empty chip group asks for a choice', status() === 'Спочатку обери відповідь.' && q('[data-help-current]')?.getAttribute('data-help-tone') === 'info', status());
  click(group('Широкомовна адреса').querySelectorAll('[role="radio"]').find(r => r.textContent === answer.broadcast));
  click(button('Перевірити'));
  check('mask: solved through chips; per-field feedback unchanged; the level\'s ✓', q('[data-help-current]')?.getAttribute('data-help-tone') === 'ok'
    && all('[role="radio"]').find(r => r.textContent.startsWith('1 ·'))?.querySelector('.ng-done'));
  check('mask: the app-wide input preference is not touched', m.store.state.prefs.inputMode === prefBefore);
  click(q('.ng-help-next'));
  check('mask: the next task starts typed (the choice was this task\'s)', Boolean(textbox('Адреса мережі')) && Boolean(textbox('Широкомовна адреса')) && link()?.textContent === 'Обрати з варіантів');
  click(link());
  check('mask: the card link turns every field to chips from the start', Boolean(group('Адреса мережі')) && Boolean(group('Широкомовна адреса')));
  click(link());
  check('mask: … and back', Boolean(textbox('Адреса мережі')) && Boolean(textbox('Широкомовна адреса')));
});

// ── 4d. Round 5 5b-2 (spec A, D): the calculator's first line and command caption; the mask's action line and worked example ──
const { expectWorkedExample } = await import('./worked-example.mjs');
const { comprehension: ip5, calcUi: calc5, ui: mask5 } = await import('../../src/sections/ip/uk.js');
const passes = fn => { try { fn(); return true; } catch (e) { return e.message; } };
scenario('5b-2 calculator', () => mountScreen('calculator'), () => {
  const fields = () => all('.ng-field-input');
  const line = () => q('[data-action-line]');
  const caption = () => q('.ng-commands-caption')?.textContent ?? null;
  check('5b-2 calculator: the first line, over the inputs, says a correct change updates the result', line()?.textContent === ip5.calculatorAction
    && line().nextSibling === q('.ng-exercise-answer') && !q('[data-worked-example]'), line()?.textContent);
  click(all('button').find(b => b.textContent.startsWith('Приклад конфігурації')));
  check('5b-2 calculator: the example says which address its commands set: the example gateway', caption() === `Команди задають інтерфейсу адресу 192.168.1.1/24 — ${calc5.commandGateway}.`
    && q('.ng-commands-caption').nextSibling === q('.ng-commands-blocks'), caption());
  click(all('[role="radio"]').find(r => r.textContent === 'остання адреса'));
  check('5b-2 calculator: the other gateway, the other address', caption() === `Команди задають інтерфейсу адресу 192.168.1.254/24 — ${calc5.commandGateway}.`, caption());
  type(fields()[0], '10.0.0.1'); type(fields()[1], '/31');
  check('5b-2 calculator: /31 sets the entered address, no gateway named', caption() === 'Команди задають інтерфейсу адресу 10.0.0.1/31.', caption());
  type(fields()[1], '/32');
  check('5b-2 calculator: /32 likewise', caption() === 'Команди задають інтерфейсу адресу 10.0.0.1/32.', caption());
  type(fields()[0], '10.0.0.');
  check('5b-2 calculator: invalid input keeps the previous result and its caption', caption() === 'Команди задають інтерфейсу адресу 10.0.0.1/32.' && Boolean(q('.ng-commands-off')), caption());
  type(fields()[0], '127.0.0.1'); type(fields()[1], '/8');
  check('5b-2 calculator: no commands, no caption (the note says why)', caption() === null && all('.ng-commands-pre').length === 0 && q('.ng-commands-note')?.textContent === 'Для цієї адреси приклад конфігурації не показуємо.', caption());
});
scenario('5b-2 mask', () => mountScreen('mask'), m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 1, seeds: { 1: 11 } } }));
  const task = mask.create(null, { seed: 11, level: 1 });
  const answer = mask.solution(task);
  const textbox = label => all('.ng-field').find(f => f.querySelector('.ng-field-label')?.textContent === label)?.querySelector('input');
  const line = () => q('[data-action-line]');
  const toggle = () => q('[data-worked-example] .ng-wex-toggle');
  check('5b-2 mask: the action line over the fields; the folded example right under it', line()?.textContent === mask5.action.block && line().nextSibling === q('[data-worked-example]')
    && q('[data-worked-example]').nextSibling === q('.ng-exercise-answer') && passes(() => expectWorkedExample(document.body)) === true, line()?.textContent);
  check('5b-2 mask: the ruler says what it shows (the octet, labels, the block size, the address)', q('.ng-mask-stage .ng-ruler-text')?.textContent.startsWith('Лінійка: ')
    && q('.ng-mask-stage .ng-ruler-text').textContent.includes(`блок для /${task.prefix} — ${2 ** (32 - task.prefix)} адрес`), q('.ng-mask-stage .ng-ruler-text')?.textContent);
  const before = JSON.stringify(m.store.state.instances);
  click(toggle());
  const card = q('[data-worked-example] .ng-wex-card');
  check('5b-2 mask: opened, another address\'s /26 block on its ruler, then its network and broadcast as the two fields', passes(() => expectWorkedExample(document.body, { open: true, rows: 1 })) === true
    && Boolean(card.querySelector('.ng-ruler-svg')) && !card.querySelector('figcaption')
    && card.querySelectorAll('td.ng-wex-value').map(td => td.textContent).join('|') === '198.51.100.64|198.51.100.127'
    && card.querySelectorAll('th').map(th => th.textContent).join('|') === 'Адреса мережі|Широкомовна адреса' && card.textContent.includes('198.51.100.77/26'), card?.textContent);
  check('5b-2 mask: opening it writes nothing into the answer', JSON.stringify(m.store.state.instances) === before && textbox('Адреса мережі').value === '' && textbox('Широкомовна адреса').value === '');
  click(q('.ng-mask-mode'));
  check('5b-2 mask: chips: the action line says choose; the example stays open (same task)', line()?.textContent === mask5.action.blockChoose && toggle().getAttribute('aria-expanded') === 'true');
  click(q('.ng-mask-mode'));
  type(textbox('Адреса мережі'), answer.network); type(textbox('Широкомовна адреса'), answer.broadcast);
  click(button('Перевірити'));
  check('5b-2 mask: solved: the action line says so in place; the ruler line adds the block', line()?.textContent === mask5.action.done
    && q('.ng-mask-stage .ng-ruler-text').textContent.endsWith(mask5.rulerBlock({ start: Number(answer.network.split('.')[3]), end: Number(answer.broadcast.split('.')[3]) })), q('.ng-mask-stage .ng-ruler-text')?.textContent);
  click(q('.ng-help-next'));
  check('5b-2 mask: «Далі»: a new task, the example closed again', toggle()?.getAttribute('aria-expanded') === 'false' && !q('.ng-wex-card'));
  let fitSeed = null;
  for (let seed = 0; seed < 40 && fitSeed === null; seed++) if (mask.create(null, { seed, level: 2 }).kind === 'fit') fitSeed = seed;
  step(() => m.store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level: 2, seeds: { ...m.store.state.places['ip.mask'].seeds, 2: fitSeed } } }));
  check('5b-2 mask: a fit task: its own action line, no example (another task shape)', line()?.textContent === mask5.action.fit && !q('[data-worked-example]'));
  click(button('Показати відповідь'));
  check('5b-2 mask: revealed: no action line, no example (no fields under them)', !line() && !q('[data-worked-example]'));
});

// ── 4b. The theme switch: the shell's, on the start screen and in the bar ──
scenario('theme switch', mountShell, () => {
  const switches = () => all('button.ng-theme-switch');
  const label = () => switches()[0]?.getAttribute('aria-label');
  const homeTheme = () => q('.ng-home')?.getAttribute('data-theme');
  const screenTheme = () => q('.ng-screen')?.getAttribute('data-theme');
  check('theme: the start screen has one switch, in its header', switches().length === 1 && Boolean(switches()[0].closest('.ng-home-header')), switches().length);
  check('theme: dark at first; the switch names the light theme', homeTheme() === 'dark' && label() === 'Світла тема' && switches()[0].textContent === '☀️', { theme: homeTheme(), label: label() });
  click(switches()[0]);
  check('theme: pressed on the start screen, the start screen turns light', homeTheme() === 'light' && label() === 'Темна тема' && switches()[0].textContent === '🌙', { theme: homeTheme(), label: label() });
  check('theme: focus stays on the switch', document.activeElement === switches()[0]);
  openCard('IP-калькулятор');
  const sw = switches()[0];
  const end = sw?.parentNode;
  check('theme: an IP screen has one switch, last in the top bar, after the slot', switches().length === 1 && Boolean(sw.closest('.ng-bar')) && end.className === 'ng-bar-end'
    && end.childNodes.at(-1) === sw && end.childNodes[0].className === 'ng-bar-slot', switches().length);
  check('theme: the IP screen opens in the light theme chosen on the start screen', screenTheme() === 'light' && label() === 'Темна тема', screenTheme());
  click(sw);
  check('theme: pressed in the bar, the IP screen turns dark', screenTheme() === 'dark' && label() === 'Світла тема', screenTheme());
  check('theme: focus stays on the bar’s switch', document.activeElement === switches()[0]);
  openCard('у бітах');
  check('theme: another IP screen follows it, with the one switch', screenTheme() === 'dark' && switches().length === 1);
  click(button('Розділи'));
  check('theme: back on the start screen, it follows it too', homeTheme() === 'dark' && label() === 'Світла тема');
});

// ── 5. Copy: «Скопійовано» only once the clipboard took it; otherwise the commands are selected ──
const selected = [];
window.getSelection = () => ({ removeAllRanges() {}, selectAllChildren: el => selected.push(el) });
let clipboard = 'ok';
const copied = [];
await scenarioAsync('copy', () => mountScreen('calculator', {
  onCopy: text => (clipboard === 'ok' ? Promise.resolve().then(() => { copied.push(text); }) : Promise.reject(new Error('NotAllowedError'))),
}), async () => {
  click(all('button').find(b => b.textContent.startsWith('Приклад конфігурації')));
  const buttons = () => all('.ng-commands-copy');
  const failed = i => all('.ng-commands-failed')[i];
  check('copy: each block has an empty polite line for a failure', all('.ng-commands-failed').length === 2 && failed(0).getAttribute('aria-live') === 'polite' && failed(0).textContent === '');
  step(() => fire(buttons()[0], 'click'));
  check('copy: nothing claimed before the clipboard answers', !buttons()[0].textContent.includes('Скопійовано'), buttons()[0].textContent);
  await stepAsync(() => {});
  check('copy: «✓ Скопійовано» once the clipboard resolved, with exactly the shown text', buttons()[0].textContent.startsWith('✓ Скопійовано') && copied[0] === cisco({ ip: '192.168.1.1', prefix: 24 }), { text: buttons()[0].textContent, copied });
  clipboard = 'refused';
  await stepAsync(() => fire(buttons()[1], 'click'));
  check('copy refused: no «Скопійовано» anywhere', !buttons()[1].textContent.includes('Скопійовано') && !buttons()[0].textContent.includes('Скопійовано'), buttons().map(b => b.textContent));
  check('copy refused: the line says what to do', failed(1).textContent === 'Не вдалося скопіювати — виділено, натисни Ctrl+C.', failed(1).textContent);
  check('copy refused: the block’s commands are selected', selected.length === 1 && selected[0] === all('.ng-commands-pre')[1]);
  clipboard = 'ok';
  await stepAsync(() => fire(buttons()[1], 'click'));
  check('copy again: the failure line clears and the copy is confirmed', failed(1).textContent === '' && buttons()[1].textContent.startsWith('✓ Скопійовано'));
});

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
