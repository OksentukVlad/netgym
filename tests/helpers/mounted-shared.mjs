// Mounted scenarios for the round 4 shared parts (spec A: HelpPanel, MoreMenu,
// Aside, DoneMark) and the contract fixtures in tests/harness/mounted-shared.jsx,
// mounted with react-dom/client in tests/helpers/mini-dom.mjs with mocked
// timers. Run in its own process by tests/shared-mounted.test.mjs (tools/test.sh
// runs it first and passes the results file), so this DOM never reaches the
// main test process. Prints one JSON line: { results: [{ name, ok, detail }] }.
//   - HelpPanel's event table (check wrong, hint, edit, reveal, check right,
//     next), one status region, the newest item only, a repeated verdict
//     announced again, no penalty words;
//   - focus: the last hint's text, the reveal's heading or applied line, the
//     pressed button otherwise, the primary when the pressed one goes;
//     silent status when focus moves into the new content;
//   - no scroll on mount, restore, `stale` or typing; a scroll after an event;
//   - the one primary action (check, continue, next) and its override;
//   - a long board: the panel's home before or after it, anchored after a
//     late flagged row (a pseudo-layout gives elements their boxes);
//   - the contract fixtures: per-row checks, a committed prediction, a tabbed
//     form with `evidence()`, recall lines with their own Enter;
//   - MoreMenu keyboard, outside click, copy label, disclosure focus;
//   - Aside open on the first visit, folded after the first check, «?» holds;
//   - DoneMark's name;
//   - WorkedExample (round 5, 5b-2): closed by default, opened only by its
//     toggle into the live region already there, read-only, its own state
//     (not first-visit folding, not the learner's answers), closed again on
//     a task change and after navigation.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';
import { expectWorkedExample } from './worked-example.mjs';

const { window, document, fire } = installDom({ focusEvents: true });
mock.timers.enable({ apis: ['setTimeout'] });
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;
const copied = [];
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied.push(text); } } });

const h = await import('../../.test-bundles/harness/mounted-shared.mjs');
const { act } = h;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

const step = fn => { let out; act(() => { out = fn(); }); act(() => { mock.timers.tick(200); }); return out; };
const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = el => step(() => { el.focus(); fire(el, 'click'); });
const key = (el, k, init = {}) => step(() => fire(el, 'keydown', { key: k, ...init }));
const type = (el, value) => step(() => { el.value = value; fire(el, 'input'); });
const status = () => all('[role="status"]');
const said = () => text(status()[0]);
const current = () => q('[data-help-current]');
const row = () => q('[data-help="row"]');
const buttons = () => all('button', row());
const primary = () => all('.ng-button-primary', row());
const PENALTY = /зарахов|не зараховується|Спробуй нове|спроб:|✅|★|рахунок/;

function scenario(name, mountIt, fn) {
  let m;
  try { m = mountIt(); fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
}

// A pseudo-layout for geometry: rows (li) are 100 px, the panel's row 50 px,
// its current item 100 px, stacked in document order; a scroller (class
// `scroller`) is 300 px high at the top. Off by default (the DOM has no layout).
const proto = Object.getPrototypeOf(document.body);
const flatRect = proto.getBoundingClientRect;
function layout() {
  const boxes = new Map();
  let y = 0;
  const fixed = el => (el.localName === 'li' && !el.closest('.ng-help') ? 100 : el.className.split(/\s+/).includes('ng-help-row') ? 50
    : el.hasAttribute?.('data-help-current') ? 100 : 0);
  const walk = el => {
    const top = y, h0 = fixed(el);
    if (h0) { y += h0; boxes.set(el, { top, height: h0 }); return; }
    for (const c of el.childNodes) if (c.nodeType === 1) walk(c);
    boxes.set(el, { top, height: y - top });
  };
  walk(document.body);
  return boxes;
}
function withLayout(fn) {
  proto.getBoundingClientRect = function rect() {
    const box = layout().get(this) ?? { top: 0, height: 0 };
    const scrollTop = this.closest?.('.scroller') ? q('.scroller').scrollTop ?? 0 : 0;
    const top = box.top - scrollTop;
    return { x: 0, y: top, top, left: 0, right: 500, bottom: top + box.height, width: 500, height: box.height };
  };
  try { return fn(); } finally { proto.getBoundingClientRect = flatRect; }
}

// ── 1. HelpPanel: the event table ─────────────────────────────────────
const hintTexts = ['Подивись на лінійку.', 'Поділи на блоки по 64.', 'Приклад з іншими числами.'];
function panelProps(over = {}) {
  return { taskKey: 'task-1', check: { onCheck: () => {} }, hints: { texts: hintTexts, shown: 0, onMore: () => {} },
    reveal: { revealed: false, onReveal: () => {}, render: () => 'Мережа 10.0.0.0, широкомовна 10.0.0.63.' }, ...over };
}
const wrong = (stamp, extra = {}) => ({ tone: 'no', scope: 'task', summary: 'Широкомовна адреса — ні.', detail: 'Остання адреса блоку — широкомовна.', stamp, ...extra });

scenario('event table', () => h.mountPanel(panelProps()), m => {
  check('first view: one role="status", empty; no current item; «Перевірити», the hint and the quiet reveal link', status().length === 1 && said() === '' && current() === null
    && text(buttons()[0]) === 'Перевірити' && text(buttons()[1]) === '💡 Підказка 1 з 3' && text(buttons()[2]) === 'Показати відповідь' && buttons()[2].className.includes('ng-button-quiet'));
  check('first view: «Перевірити» is the one primary button', primary().length === 1 && primary()[0] === buttons()[0]);
  check('the hint button is named «Підказка 1 з 3» (the 💡 is aria-hidden)', buttons()[1].querySelector('[aria-hidden="true"]')?.textContent.trim() === '💡');
  check('«Показати відповідь» sits on its own line under the buttons', buttons()[2].parentNode.className === 'ng-help-row-link' && buttons()[2].parentNode.parentNode === row());
  // check (wrong): the verdict, whole; its detail behind «Детальніше».
  step(() => m.set(panelProps({ verdict: wrong(1) })));
  check('check (wrong): the verdict is current, its summary announced with «• Ще ні»', current()?.getAttribute('data-help-tone') === 'no' && said() === '• Ще ні Широкомовна адреса — ні.', said());
  check('check (wrong): the detail folds behind «Детальніше», outside the status region', text(q('.ng-help-more summary')) === 'Детальніше' && !q('.ng-help-more').hasAttribute('open')
    && !status()[0].contains(q('.ng-help-more')) && current().contains(q('.ng-help-more')));
  // A repeated check with the same words: cleared for a moment, then announced again.
  m.set(panelProps({ verdict: wrong(2) }));
  check('a repeated verdict: its words are cleared for a moment (announced again)', Boolean(q('.ng-help-said .is-clearing')));
  act(() => { mock.timers.tick(200); });
  check('…then back, as new text', !q('.ng-help-said .is-clearing') && said() === '• Ще ні Широкомовна адреса — ні.');
  // hint: the new rung, whole; the verdict shrinks to one line above it.
  step(() => m.set(panelProps({ verdict: wrong(2), hints: { texts: hintTexts, shown: 1, onMore: () => {} } })));
  check('hint: the rung is current and announced; the verdict shrinks to one line above it (outside the status)', current()?.querySelector('[data-help="hint"]') !== null
    && said() === 'Підказка 1 з 3. Подивись на лінійку.' && text(q('.ng-help-mini')) === '• Ще ні Широкомовна адреса — ні.' && !status()[0].contains(q('.ng-help-mini')), said());
  step(() => m.set(panelProps({ verdict: wrong(2), hints: { texts: hintTexts, shown: 2, onMore: () => {} } })));
  check('hint 2: earlier rungs fold into «Підказки (1)», outside the status region, reachable', text(q('.ng-help-fold summary')) === 'Підказки (1)'
    && text(q('.ng-help-fold li')) === 'Підказка 1 з 3. Подивись на лінійку.' && !status()[0].contains(q('.ng-help-fold')) && all('[data-help="hint"]').length === 2);
  // edit after a check: unchanged, «до змін», dimmed; nothing announced again.
  step(() => m.set(panelProps({ verdict: wrong(2), stale: true, hints: { texts: hintTexts, shown: 2, onMore: () => {} } })));
  check('edit: the shrunk verdict line says «до змін»; the current item stays the hint', /до змін/.test(text(q('.ng-help-mini'))) && current()?.querySelector('[data-help="hint"]') !== null);
  step(() => m.set(panelProps({ verdict: wrong(3), hints: { texts: hintTexts, shown: 2, onMore: () => {} } })));
  check('check again: the verdict is current, the hints fold into «Підказки (2)»', current()?.getAttribute('data-help-tone') === 'no' && text(q('.ng-help-fold summary')) === 'Підказки (2)');
  step(() => m.set(panelProps({ verdict: wrong(3), stale: true, hints: { texts: hintTexts, shown: 2, onMore: () => {} } })));
  check('edit: the current verdict gets «до змін» (data-help-stale), dimmed', current()?.hasAttribute('data-help-stale') && /до змін/.test(said()));
  // reveal: render(); the verdict and the hints fold away; the stale «Ще ні» is gone.
  step(() => m.set(panelProps({ verdict: wrong(3), stale: true, hints: { texts: hintTexts, shown: 2, onMore: () => {} }, reveal: { revealed: true, onReveal: () => {}, render: () => 'Мережа 10.0.0.0.' } })));
  check('reveal: the answer is current with its heading; no «Ще ні» anywhere in the message', text(q('[data-help-current] .ng-reveal-heading')) === 'Відповідь' && text(current()).endsWith('Мережа 10.0.0.0.') && !/Ще ні/.test(text(q('[data-help="message"]')))
    && text(q('.ng-help-fold summary')) === 'Підказки (2)');
  check('reveal: the reveal link and the hint button go; «Далі» would be the primary (none passed: check stays)', !all('button', row()).some(b => /Показати відповідь|Підказка/.test(text(b))));
  check('no penalty or score words anywhere', !PENALTY.test(text(m.container)), text(m.container));
  // next: a new task; everything resets.
  step(() => m.set(panelProps({ taskKey: 'task-2' })));
  check('next: a new taskKey empties the message area', current() === null && said() === '' && q('.ng-help-fold') === null && q('.ng-help-mini') === null);
});

scenario('check (right)', () => h.mountPanel(panelProps({ hints: { texts: hintTexts, shown: 1, onMore: () => {} } })), m => {
  step(() => m.set(panelProps({ hints: { texts: hintTexts, shown: 1, onMore: () => {} }, verdict: { tone: 'ok', summary: 'Так, це блок.', detail: 'Перша адреса — мережа.', stamp: 1 }, next: { onNext: () => {} } })));
  check('check (right): the verdict and its detail, open; the hint folds', said() === '✓ Так Так, це блок.' && text(q('.ng-help-detail')) === 'Перша адреса — мережа.' && q('.ng-help-more') === null
    && text(q('.ng-help-fold summary')) === 'Підказки (1)');
  check('check (right): «Далі →» is the one primary; «Перевірити» stays, secondary; no hint button, no reveal link', primary().length === 1 && text(primary()[0]) === 'Далі →'
    && text(buttons()[0]) === 'Перевірити' && !buttons()[0].className.includes('primary') && buttons().length === 2);
  check('«Далі»: the arrow is aria-hidden', primary()[0].querySelector('[aria-hidden="true"]')?.textContent.trim() === '→');
  step(() => m.set(panelProps({ hints: { texts: hintTexts, shown: 1, onMore: () => {} }, verdict: { tone: 'ok', summary: 'Так, це блок.', stamp: 1 }, stale: true, next: { onNext: () => {} } })));
  check('an edit after success: the verdict dims («до змін») and «Далі →» stays primary', current()?.hasAttribute('data-help-stale') && text(primary()[0]) === 'Далі →');
  step(() => m.set(panelProps({ hints: { texts: hintTexts, shown: 1, onMore: () => {} }, verdict: { tone: 'ok', summary: 'Так, це блок.', detail: 'Перша адреса — мережа.', stamp: 1 }, stale: true, next: { onNext: () => {} } })));
  check('…and a success\'s detail (about the checked answer) folds behind «Детальніше», kept', text(q('.ng-help-more summary')) === 'Детальніше' && text(q('.ng-help-more .ng-help-detail')) === 'Перша адреса — мережа.');
});

scenario('a step change voids the verdict for good', () => h.mountPanel(panelProps({ stepKey: 1, verdict: { tone: 'ok', summary: 'Так, пакет пройшов.', stamp: 1 }, next: { onNext: () => {} } })), m => {
  const at = (over = {}) => panelProps({ verdict: { tone: 'ok', summary: 'Так, пакет пройшов.', stamp: 1 }, next: { onNext: () => {} }, ...over });
  check('step 1: its verdict is current (a success: «Далі →» primary)', said() === '✓ Так Так, пакет пройшов.' && text(primary()[0]) === 'Далі →');
  step(() => m.set(at({ stepKey: 2 })));
  check('step 2: the old verdict is gone, not a success («Перевірити» primary)', current() === null && said() === '' && text(primary()[0]) === 'Перевірити');
  step(() => m.set(at({ stepKey: 2, stale: true })));
  step(() => m.set(at({ stepKey: 2 })));
  step(() => m.set(at({ stepKey: 2, hints: { texts: hintTexts, shown: 1, onMore: () => {} } })));
  check('later renders (and a hint) never bring it back, not even as the shrunk line', !/пакет пройшов/.test(text(q('[data-help="message"]'))) && text(primary()[0]) === 'Перевірити');
  step(() => m.set(at({ stepKey: 2, hints: { texts: hintTexts, shown: 1, onMore: () => {} }, verdict: { tone: 'no', summary: 'Ні: його відкинуто.', stamp: 2 } })));
  check('a new check on step 2: its verdict is current and announced', said() === '• Ще ні Ні: його відкинуто.');
});

// ── 2. Focus and silence ─────────────────────────────────────────────
function focusScenario() {
  let shown = 0, revealed = false, verdict = null;
  let m;
  const props = () => panelProps({ verdict, hints: { texts: hintTexts, shown, onMore: () => { shown++; m.set(props()); } },
    reveal: { revealed, onReveal: () => { revealed = true; m.set(props()); }, render: () => 'Відповідь тут.' },
    check: revealed ? null : { onCheck: () => { verdict = wrong((verdict?.stamp ?? 0) + 1); m.set(props()); } }, next: revealed ? { onNext: () => {} } : null });
  m = h.mountPanel(props());
  return m;
}
scenario('focus', focusScenario, () => {
  const hint = () => [...buttons()].find(b => /Підказка/.test(text(b)));
  click(buttons()[0]);
  check('check: focus stays on «Перевірити»', document.activeElement === buttons()[0] && status()[0].getAttribute('aria-live') === 'polite');
  click(hint());
  check('hint 1: focus stays on the hint button, now «Підказка 2 з 3»; announced', document.activeElement === hint() && text(hint()) === '💡 Підказка 2 з 3' && status()[0].getAttribute('aria-live') === 'polite');
  click(hint());
  click(hint());
  check('the last hint: «Показати відповідь» stays on its own line (nothing slid into the hint button\'s place)', [...buttons()].find(b => text(b) === 'Показати відповідь')?.parentNode.className === 'ng-help-row-link');
  check('the last hint: its button goes, focus moves to the hint\'s text (tabIndex -1)', !hint() && document.activeElement === q('[data-help-current] [data-help="hint"]')
    && document.activeElement.getAttribute('tabindex') === '-1');
  check('…and the status region is silent for that event (focus already reads it)', status()[0].getAttribute('aria-live') === 'off');
  click([...buttons()].find(b => text(b) === 'Показати відповідь'));
  check('reveal: focus moves to the answer\'s heading; silent status', document.activeElement === q('[data-help-current] .ng-reveal-heading') && status()[0].getAttribute('aria-live') === 'off');
  check('reveal: «Перевірити» went (check: null), «Далі →» is primary', text(primary()[0]) === 'Далі →' && !all('button', row()).some(b => text(b) === 'Перевірити'));
  check('one role="status" through it all', status().length === 1);
});

scenario('applied reveal', () => h.mountPanel(panelProps()), m => {
  click([...buttons()].find(b => text(b) === 'Показати відповідь'));
  step(() => m.set(panelProps({ reveal: { revealed: true, onReveal: () => {}, render: () => 'не має бути', applied: 'Відповідь показано на схемі; твоя спроба — під кнопкою «Моя відповідь».' } })));
  check('applied: the one line is current, focused, instead of render()', text(current()) === 'Відповідь показано на схемі; твоя спроба — під кнопкою «Моя відповідь».'
    && document.activeElement === q('.ng-help-applied-text') && !text(current()).includes('не має бути'));
});

scenario('the pressed button goes', () => {
  let verdict = null, m;
  const props = () => panelProps({ verdict, check: verdict ? null : { onCheck: () => { verdict = { tone: 'ok', summary: 'Так.', stamp: 1 }; m.set(props()); } }, next: verdict ? { onNext: () => {} } : null });
  m = h.mountPanel(props());
  return m;
}, () => {
  click(buttons()[0]);
  check('solved by «Перевірити», which goes: focus moves to the new primary, «Далі →»', document.activeElement === primary()[0] && text(primary()[0]) === 'Далі →');
});

// ── 3. Scrolling: only on events ─────────────────────────────────────
/** A 300 px scroller (scrollTo recorded) whose children get the pseudo-layout. */
function scroller() {
  const wrap = document.createElement('div');
  wrap.setAttribute('class', 'scroller');
  Object.assign(wrap, { clientHeight: 300, scrollHeight: 3000, clientTop: 0, scrollTop: 0, calls: [] });
  wrap.scrollTo = ({ top }) => { wrap.calls.push(top); wrap.scrollTop = top; };
  document.body.appendChild(wrap);
  return wrap;
}
const plainStyle = window.getComputedStyle;
const styleFor = wrap => el => ({ overflowY: el === wrap ? 'auto' : 'visible', scrollPaddingTop: '0', scrollPaddingBottom: '0', getPropertyValue: () => '' });

{
  // The panel below 500 px of rows in a 300 px scroller: out of view until an event brings it in.
  const wrap = scroller();
  const spacer = document.createElement('ol');
  for (let i = 0; i < 5; i++) spacer.appendChild(document.createElement('li'));
  wrap.appendChild(spacer);
  window.getComputedStyle = styleFor(wrap);
  let m;
  try {
    withLayout(() => {
      m = h.mountPanel(panelProps(), wrap);
      check('scroll: none on mount', wrap.calls.length === 0, wrap.calls);
      step(() => m.set(panelProps({ verdict: wrong(1) })));
      check('scroll: a check brings the check row and the verdict into view (block: nearest: their bottom at the bottom)', wrap.calls.length === 1 && wrap.calls[0] === 350, wrap.calls);
      step(() => m.set(panelProps({ verdict: wrong(1), stale: true })));
      type(q('.answer'), '10.0.0.1');
      check('scroll: none for `stale` or typing', wrap.calls.length === 1, wrap.calls);
      step(() => m.set(panelProps({ verdict: wrong(1), hints: { texts: hintTexts, shown: 1, onMore: () => {} } })));
      check('scroll: nothing to do when the row and the item are already in view', wrap.calls.length === 1, wrap.calls);
      wrap.scrollTop = 0;
      step(() => m.set(panelProps({ verdict: wrong(1), hints: { texts: hintTexts, shown: 2, onMore: () => {} } })));
      check('scroll: a hint brings them back into view', wrap.calls.length === 2 && wrap.calls[1] === 350, wrap.calls);
      wrap.scrollTop = 0;
      step(() => m.set(panelProps({ taskKey: 'task-2' })));
      check('scroll: none for «Далі» (a new task)', wrap.calls.length === 2, wrap.calls);
    });
  } catch (e) { check('scroll: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  wrap.parentNode?.removeChild(wrap);
  window.getComputedStyle = plainStyle;
}

{
  // Restore: a panel mounted with a verdict, hints and a reveal already there (navigation back).
  const wrap = scroller();
  window.getComputedStyle = styleFor(wrap);
  let m;
  try {
    withLayout(() => {
      const before = document.activeElement;
      m = h.mountPanel(panelProps({ verdict: wrong(4), hints: { texts: hintTexts, shown: 2, onMore: () => {} } }));
      wrap.appendChild(m.container);
      check('restore: the fallback item (verdict over the newest hint), no scroll, no focus move', current()?.getAttribute('data-help-tone') === 'no' && wrap.calls.length === 0 && document.activeElement === before);
      step(() => m.set(panelProps({ verdict: wrong(4), stale: true, hints: { texts: hintTexts, shown: 2, onMore: () => {} } })));
      check('stale: no scroll', wrap.calls.length === 0);
      type(q('.answer'), '10.0.0.1');
      check('typing: no scroll', wrap.calls.length === 0);
      step(() => m.set(panelProps({ verdict: wrong(4), hints: { texts: hintTexts, shown: 2, onMore: () => {} }, reveal: { revealed: true, onReveal: () => {}, render: () => 'Тут.' } })));
      check('restore of a revealed task: the reveal wins the fallback… after an event (here: reveal)', q('[data-help-current] .ng-reveal-heading') !== null);
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountPanel(panelProps({ verdict: wrong(1), hints: { texts: hintTexts, shown: 1, onMore: () => {} }, reveal: { revealed: true, onReveal: () => {}, render: () => 'Тут.' } }));
      check('a fresh mount with a reveal: reveal > verdict > hint; no scroll', q('[data-help-current] .ng-reveal-heading') !== null && wrap.calls.length === 0);
    });
  } catch (e) { check('restore: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  wrap.parentNode?.removeChild(wrap);
  window.getComputedStyle = plainStyle;
}

{
  // An edit makes the verdict stale: the edited row is the evidence; the panel anchors after it, no scroll.
  const wrap = scroller();
  window.getComputedStyle = styleFor(wrap);
  let m;
  try {
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: null, edit: 7 }, wrap);
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('stale anchoring: before the edit the panel is at home (before the long board)', q('.ng-help-host')?.nextSibling === q('.board'));
      const calls = wrap.calls.length;
      click(q('.edit'));
      check('an edit (stale verdict): the panel anchors right after the edited row, check row included', q('.ng-help-host')?.previousSibling === q('.row-7')
        && q('.ng-help-host').className.includes('is-anchored') && current()?.hasAttribute('data-help-stale') && q('.ng-help-host').contains(row()));
      check('…without scrolling the page', wrap.calls.length === calls, wrap.calls);
      click([...all('button', row())].find(b => /Далі|Пропустити/.test(text(b))));
      check('«Далі» (a new task): back home, before the board', q('.ng-help-host')?.nextSibling === q('.board') && !q('.ng-help-host').className.includes('is-anchored'));
    });
  } catch (e) { check('stale anchoring: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  wrap.parentNode?.removeChild(wrap);
  window.getComputedStyle = plainStyle;
}

{
  // Follow-up 2: the panel's home, its own evidence, the long threshold, the hint button's place.
  let m;
  try {
    withLayout(() => {
      m = h.mountFixture('board', { rows: 3, flag: null, grow: 4 });
      check('home: a short board (300 px): after it', q('.ng-help-host')?.previousSibling === q('.board'));
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('home: a check that grows the board past half the band (700 px) keeps the home: «Перевірити» doesn\'t jump', all('.board li').length === 7 && q('.ng-help-host')?.previousSibling === q('.board'));
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 3, flag: null, stage: { rows: 6 } });
      check('home: a short first stage (300 px): after the board', q('.ng-help-host')?.previousSibling === q('.board'));
      click(q('.next-stage'));
      check('home: a new stepKey (a longer stage, 900 px) is a new layout: the home is decided again, before the board', all('.board li').length === 9 && q('.ng-help-host')?.nextSibling === q('.board'));
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 3, flag: null, stage: { rows: 6, as: 'layoutKey' } });
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      click(q('.next-stage'));
      check('home: a new layoutKey re-decides the home (before the board) and keeps the verdict (a stepKey would forget it)',
        q('.ng-help-host')?.nextSibling === q('.board') && /Порядок не працює/.test(text(q('.ng-help-host'))));
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: 8, nodeEvidence: true });
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      const host = q('.ng-help-host');
      check('anchoring ignores data-evidence inside the panel (its summaryNode): it anchors after the board\'s row, never into itself', host?.previousSibling === q('.row-8') && !host.contains(host.parentNode) && Boolean(host.querySelector('.node-card')));
      click(q('.drop-flag'));
      const after = q('.ng-help-host');
      check('anchored inside the board, the row\'s mark goes and only the panel\'s own mark is left: back home, never inserted into itself',
        after?.nextSibling === q('.board') && !after.contains(after.parentNode) && !after.className.includes('is-anchored'), { parent: after?.parentNode?.className });
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: null, nodeEvidence: true });
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('…and with only the panel\'s own mark there is nothing to anchor to: it stays home', q('.ng-help-host')?.nextSibling === q('.board') && !q('.ng-help-host').className.includes('is-anchored'));
    });
  } catch (e) { check('follow-up 2 board: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
}

{
  // The long threshold is the space left for the item: a 120 px scroller leaves 60 px under the 50 px row (+10 gap).
  const wrap = scroller();
  wrap.clientHeight = 120;
  window.getComputedStyle = styleFor(wrap);
  let m;
  try {
    withLayout(() => {
      m = h.mountPanel(panelProps({ verdict: wrong(1) }), wrap);
      check('long: a 100 px item in a 120 px band under the check row is long (cue shown), though far below 60% of the window', current()?.hasAttribute('data-help-long') && Boolean(q('[data-help-more]')));
    });
    m.unmount(); m = null;
    wrap.clientHeight = 2000;
    withLayout(() => {
      m = h.mountPanel(panelProps({ verdict: wrong(1) }), wrap);
      check('long: the same item with room to spare is not', !current()?.hasAttribute('data-help-long'));
    });
  } catch (e) { check('long threshold: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  wrap.parentNode?.removeChild(wrap);
  window.getComputedStyle = plainStyle;
}

scenario('the hint button\'s place', () => {
  let shown = 0, verdict = null, m;
  const props = () => panelProps({ verdict, next: { onNext: () => { verdict = null; shown = 0; m.set({ ...props(), taskKey: 'task-9' }); } },
    hints: { texts: hintTexts, shown, onMore: () => { shown++; m.set(props()); } }, check: { onCheck: () => { verdict = wrong((verdict?.stamp ?? 0) + 1); m.set(props()); } } });
  m = h.mountPanel(props());
  return m;
}, m => {
  const hintButton = () => [...buttons()].find(b => /Підказка/.test(text(b)));
  const nextIndex = () => [...row().children].findIndex(el => el.className.includes('ng-help-next'));
  const before = nextIndex();
  for (let i = 0; i < 3; i++) click(hintButton());
  check('the last hint: its button goes, an invisible copy (aria-hidden, not a button) holds its place, so «Далі →» doesn\'t slide under the pointer',
    !hintButton() && q('.ng-help-placeholder')?.getAttribute('aria-hidden') === 'true' && q('.ng-help-placeholder').localName === 'span' && nextIndex() === before, { before, now: nextIndex() });
  step(() => m.set(panelProps({ hints: { texts: hintTexts, shown: 3, onMore: () => {} }, next: { onNext: () => {} } })));
  check('the place stays held on later renders', Boolean(q('.ng-help-placeholder')));
  step(() => m.set(panelProps({ verdict: wrong(5), hints: { texts: hintTexts, shown: 3, onMore: () => {} }, next: { onNext: () => {} } })));
  check('the next check releases it', !q('.ng-help-placeholder'));
});

scenario('primary none', () => h.mountPanel(panelProps({ check: null, primary: 'none', next: { onNext: () => {} } })), () => {
  check('primary: \'none\': no primary button at all («Далі →» stays secondary, no fake check)', primary().length === 0 && Boolean(q('.ng-help-next')) && !q('.ng-help-next').className.includes('primary'));
});

// ── 4. Long boards: home and anchoring (pseudo-layout, window 800 px) ─
{
  let m;
  try {
    withLayout(() => {
      m = h.mountFixture('board', { rows: 3, flag: null });
      const host = q('.ng-help-host');
      check('a short board (300 px ≤ half the window): the panel\'s home is after it', host?.previousSibling === q('.board'));
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: 1 });
      const host = q('.ng-help-host');
      check('a long board (1000 px > half the window): the panel\'s home is before it, in reading order', host?.nextSibling === q('.board'));
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('an early flagged row fits with the panel at home: no anchoring', q('.ng-help-host')?.nextSibling === q('.board') && !q('.ng-help-host').className.includes('is-anchored'));
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: 8 });
      const check0 = [...all('button', row())].find(b => text(b) === 'Перевірити');
      click(check0);
      const host = q('.ng-help-host');
      check('a late flagged row that can\'t fit with the panel at home: the panel moves to just after that row, check row included', host?.previousSibling === q('.row-8')
        && host.className.includes('is-anchored') && host.contains(row()) && host.contains(current()));
      check('anchored: focus moved with the check button', document.activeElement === [...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('anchored: the panel stays one block (one status region), not inside the row', status().length === 1 && !q('.row-8').contains(host));
      const hint = () => [...all('button', row())].find(b => /Підказка/.test(text(b)));
      click(hint());
      check('anchored: a hint keeps it there while the verdict names the row', q('.ng-help-host')?.previousSibling === q('.row-8'));
    });
    m.unmount(); m = null;
    check('unmounting takes the panel\'s container away', q('.ng-help-host') === null);
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: 8 });
      click([...all('button', row())].find(b => text(b) === 'Показати відповідь'));
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('a check after a reveal anchors as usual (the current verdict and its row decide, not the reveal)', q('.ng-help-host')?.previousSibling === q('.row-8') && q('.ng-help-host').className.includes('is-anchored'));
    });
    m.unmount(); m = null;
    withLayout(() => {
      m = h.mountFixture('board', { rows: 10, flag: 8, lateEvidence: true });
      click([...all('button', row())].find(b => text(b) === 'Перевірити'));
      check('evidence() runs and its update commits before measuring: the late-marked row anchors the panel', Boolean(q('.row-8 [data-evidence="current"]')) && q('.ng-help-host')?.previousSibling === q('.row-8'),
        { mark: Boolean(q('.row-8 [data-evidence="current"]')), after: q('.ng-help-host')?.previousSibling?.className });
    });
  } catch (e) { check('long board: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
}

// ── 5. The contract fixtures ──────────────────────────────────────────
scenario('per-row check', () => h.mountFixture('rows'), () => {
  type(all('.row input')[1], '10.0.9.0/24');
  click(all('.row-check')[1]);
  check('per-row check: its verdict goes through the panel (the one status region), naming the row', status().length === 1 && said() === '• Ще ні Рядок 2: мережа не та.' && current()?.getAttribute('data-help-tone') === 'no', said());
  check('per-row check: that row is the current evidence', all('[data-evidence="current"]').length === 1 && all('.row')[1].hasAttribute('data-evidence'));
  check('per-row check: a part verdict leaves «Перевірити мережу» primary (the task is not done)', text(primary()[0]) === 'Перевірити мережу');
  type(all('.row input')[1], '10.0.1.0/24');
  click(all('.row-check')[1]);
  check('per-row check: a right row («✓ Так», scope part) is announced; the whole check still primary', said() === '✓ Так Рядок 2 правильний.' && text(primary()[0]) === 'Перевірити мережу');
});

scenario('committed prediction', () => { let next = 0; const m = h.mountFixture('predict', { onNext: () => { next++; } }); m.nexts = () => next; return m; }, m => {
  check('prediction: «Перевірити» waits for a choice (aria-disabled, keeps focus, still the primary look)', all('button', row())[0].getAttribute('aria-disabled') === 'true' && primary()[0] === all('button', row())[0]);
  click(all('button', row())[0]);
  check('prediction: pressing it before a choice does nothing', current() === null && said() === '');
  click(q('.choice.is-drop'));
  click(all('button', row())[0]);
  check('prediction committed: the inputs lock, no check button, «Далі →» the one primary', all('.choice').every(b => b.hasAttribute('disabled')) && !all('button', row()).some(b => text(b) === 'Перевірити')
    && primary().length === 1 && text(primary()[0]) === 'Далі →');
  check('prediction committed: the verdict announced; focus moved to «Далі →» (the pressed check went)', said() === '✓ Так Так: пакет відкинуто.' && document.activeElement === primary()[0]);
  click(primary()[0]);
  check('prediction: «Далі →» calls next', m.nexts() === 1);
});

scenario('tabbed form', () => { let asked = 0; const m = h.mountFixture('tabs', { onEvidence: () => { asked++; } }); m.asked = () => asked; return m; }, m => {
  check('tabs: SW1 shown first', q('.tab-SW1').getAttribute('aria-selected') === 'true' && Boolean(q('.field-SW1')));
  click(all('button', row())[0]);
  act(() => { mock.timers.tick(50); });
  check('tabs: the check calls evidence() first, which opens SW2', m.asked() === 1 && q('.tab-SW2').getAttribute('aria-selected') === 'true');
  check('tabs: the flagged field on SW2 is the current evidence', q('[data-evidence="current"]') === q('.field-SW2') && q('.field-SW2').getAttribute('aria-invalid') === 'true');
  check('tabs: the verdict names the device', said() === '• Ще ні Дивись SW2: порт fa0/7 не в тому VLAN.');
});

scenario('recall lines', () => { let whole = 0; const m = h.mountFixture('recall', { onWhole: () => { whole++; } }); m.whole = () => whole; return m; }, m => {
  const inputs = all('.recall-line input');
  type(inputs[0], 'enable');
  const enter = key(inputs[0], 'Enter');
  check('recall: Enter in a line checks that line only, in its own live line', text(all('.recall-said')[0]) === 'Так.' && m.whole() === 0 && enter.defaultPrevented);
  check('recall: the panel\'s status stays silent for a line\'s own check', said() === '' && status().length === 1);
  click(all('button', row())[0]);
  check('recall: the panel\'s check checks the whole and announces once', m.whole() === 1 && said() === '• Ще ні Не всі рядки.');
});

// ── 6. MoreMenu ───────────────────────────────────────────────────────
scenario('MoreMenu', () => {
  const log = [];
  const m = h.mountMenu({ items: [
    { id: 'copy', label: 'Скопіювати код', copy: 'A1-0042' },
    { id: 'other', label: 'Інші адреси', onSelect: () => log.push('other') },
    { id: 'rules', label: 'Правила', render: () => 'Правила тут.' },
  ] });
  m.log = log;
  return m;
}, m => {
  const more = () => q('.ng-more-button');
  const items = () => all('[role="menuitem"]');
  check('«⋯»: named «Інші дії», a menu button, closed', more().getAttribute('aria-label') === 'Інші дії' && more().getAttribute('aria-haspopup') === 'menu' && more().getAttribute('aria-expanded') === 'false' && !q('[role="menu"]'));
  click(more());
  check('open: aria-expanded, a role="menu" of menuitems, focus on the first', more().getAttribute('aria-expanded') === 'true' && items().length === 3 && document.activeElement === items()[0]);
  key(items()[0], 'ArrowDown');
  check('↓ moves to the next item', document.activeElement === items()[1]);
  key(items()[1], 'ArrowUp'); key(items()[0], 'ArrowUp');
  check('↑ wraps to the last', document.activeElement === items()[2]);
  key(items()[2], 'Home');
  check('Home: the first', document.activeElement === items()[0]);
  key(items()[0], 'End');
  check('End: the last', document.activeElement === items()[2]);
  key(items()[2], 'Escape');
  check('Esc closes, focus back on «⋯»', !q('[role="menu"]') && document.activeElement === more() && more().getAttribute('aria-expanded') === 'false');
  key(more(), 'ArrowDown');
  check('↓ on «⋯» opens it at the first item', document.activeElement === items()[0]);
  step(() => fire(q('.outside'), 'pointerdown'));
  check('an outside click closes it and focus goes back to «⋯» (not lost on the removed item)', !q('[role="menu"]') && document.activeElement === more());
  click(more());
  key(items()[0], 'Tab');
  check('Tab closes it and moves on from «⋯»', !q('[role="menu"]') && document.activeElement === more());
  click(more());
  click(items()[1]);
  check('an action: done, the menu closes, focus back on «⋯»', m.log.join() === 'other' && !q('[role="menu"]') && document.activeElement === more());
});
// The copy label needs the promise to settle: a separate async pass.
await (async () => {
  const m = h.mountMenu({ items: [{ id: 'copy', label: 'Скопіювати код', copy: 'A1-0042' }, { id: 'rules', label: 'Правила', render: () => 'Правила тут.' }] });
  try {
    const more = () => q('.ng-more-button');
    const items = () => all('[role="menuitem"]');
    click(more());
    await act(async () => { fire(items()[0], 'click'); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    check('copy: the menu stays open; the item says «✓ Скопійовано»; the text was copied', Boolean(q('[role="menu"]')) && text(items()[0]) === '✓ Скопійовано' && copied.at(-1) === 'A1-0042', text(items()[0]));
    act(() => { mock.timers.tick(1600); });
    check('copy: after ~1.5 s the label is back', text(items()[0]) === 'Скопіювати код');
    click(items()[1]);
    check('a disclosure: the menu closes, its content opens in the page, focus on its heading', !q('[role="menu"]') && text(q('.ng-more-panel-heading')) === 'Правила' && document.activeElement === q('.ng-more-panel-heading') && text(q('.ng-more-panel')).includes('Правила тут.'));
    click(more());
    click(items()[1]);
    click(more());
    click(items()[1]);
    check('choosing the open disclosure again: its heading gets the focus again', text(q('.ng-more-panel-heading')) === 'Правила' && document.activeElement === q('.ng-more-panel-heading'));
    click(q('.ng-more-close'));
    check('«Закрити» folds it, focus back on «⋯»', !q('.ng-more-panel') && document.activeElement === more());
  } catch (e) { check('MoreMenu copy: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
})();

scenario('MoreMenu disclosure host', () => h.mountMenuWithHost({ items: [{ id: 'rules', label: 'Правила', render: () => 'Довгі правила.' }] }), () => {
  click(q('.ng-more-button'));
  click(q('[role="menuitem"]'));
  const panel = q('.ng-more-panel');
  check('a disclosure opens in the work area (disclosureHost), not inside the header\'s «⋯» box', panel?.parentNode === q('.host') && !q('.head').contains(panel) && document.activeElement === q('.ng-more-panel-heading'));
  click(q('.ng-more-close'));
  check('…and «Закрити» there returns focus to «⋯» in the header', !q('.ng-more-panel') && document.activeElement === q('.ng-more-button'));
});

// ── 7. Aside ──────────────────────────────────────────────────────────
scenario('Aside', () => h.mountAside('demo'), m => {
  const q1 = () => q('.ng-aside-q');
  check('first visit: open, its «?» named by the title, aria-expanded', Boolean(q('.ng-aside-body')) && q1().getAttribute('aria-label') === 'Як читати схему' && q1().getAttribute('aria-expanded') === 'true');
  click(q('.screen-check'));
  check('after the first check on the screen: folded behind «?»', !q('.ng-aside-body') && q1().getAttribute('aria-expanded') === 'false' && m.store.state.places.demo.started === true);
  check('folded: its title shows (muted) beside «?», inside the toggle', text(q('.ng-aside-q .ng-aside-label')) === 'Як читати схему');
  click(q1());
  check('«?» opens it again (the title moves into the note)', Boolean(q('.ng-aside-body')) && q1().getAttribute('aria-expanded') === 'true' && !q('.ng-aside-label'));
  m.remount();
  check('the choice holds across navigation (places, in memory)', Boolean(q('.ng-aside-body')) && m.store.state.places.demo.asides.keys === true);
  click(q1());
  m.remount();
  check('folded by hand: stays folded after coming back', !q('.ng-aside-body'));
});

// ── 8. DoneMark ───────────────────────────────────────────────────────
scenario('DoneMark', () => h.mountDone(true), () => {
  const mark = q('.ng-done');
  check('DoneMark: a visible ✓ (aria-hidden) and «розв’язано» for screen readers, inside the control it marks', mark?.querySelector('[aria-hidden="true"]')?.textContent === '✓'
    && text(mark.querySelector('.ng-sr-only')) === 'розв’язано' && mark.closest('button') === q('.task') && text(q('.task')) === 'Задача 1✓ розв’язано');
});
scenario('DoneMark off', () => h.mountDone(false), () => {
  check('DoneMark: nothing while not earned', q('.ng-done') === null && text(q('.task')) === 'Задача 1');
});

// ── 9. WorkedExample (round 5, spec 5b-2 A) ───────────────────────────
const passes = fn => { try { fn(); return true; } catch (e) { return e.message; } };
scenario('WorkedExample', () => h.mountExample({ taskKey: 't1' }), m => {
  const toggle = () => q('.ng-wex-toggle'), body = () => q('.ng-wex-body'), card = () => q('.ng-wex-card');
  const region = body();
  const before = JSON.stringify(m.store.state);
  check('WorkedExample: closed by default: aria-expanded="false", the live region there and empty, nothing of the example in the page', toggle().getAttribute('aria-expanded') === 'false'
    && region.getAttribute('aria-live') === 'polite' && region.childNodes.length === 0 && toggle().getAttribute('aria-controls') === region.getAttribute('id') && !text(q('.example-screen')).includes('192.0.2'));
  check('WorkedExample: closed: the toggle reads «Приклад: як це розв’язують ▸», the arrow aria-hidden', text(toggle()) === 'Приклад: як це розв’язують ▸' && q('.ng-wex-toggle [aria-hidden="true"]').textContent === '▸');
  check('WorkedExample: closed: expectWorkedExample passes', passes(() => expectWorkedExample(document.body)) === true, passes(() => expectWorkedExample(document.body)));
  check('WorkedExample: the slot: directly under the action line, before the first control', q('.ng-action-line').nextSibling === q('[data-worked-example]') && q('[data-worked-example]').nextSibling === q('.answer'));
  click(toggle());
  check('WorkedExample: the toggle opens it into the same live region (announced once): the tag, the context, the row', toggle().getAttribute('aria-expanded') === 'true' && body() === region && region.contains(card())
    && text(q('.ng-wex-tag')) === 'приклад · інші числа' && text(q('.ng-wex-context')) === 'R1 → LAN-C 192.0.2.0/24, сусід 198.51.100.2'
    && text(q('.ng-wex-table tbody tr')) === '✓192.0.2.0255.255.255.0198.51.100.2' && all('.ng-wex-table th').length === 3);
  check('WorkedExample: opened: the arrow turns (▾); focus stays on the toggle', q('.ng-wex-toggle [aria-hidden="true"]').textContent === '▾' && document.activeElement === toggle());
  check('WorkedExample: opened: read-only — no input, button, link or tabindex inside; one ✓ row', passes(() => expectWorkedExample(document.body, { open: true, rows: 1 })) === true, passes(() => expectWorkedExample(document.body, { open: true, rows: 1 })));
  check('WorkedExample: opening touches no learner state (store unchanged: no answer, draft or place)', JSON.stringify(m.store.state) === before);
  click(q('.screen-check'));
  check('WorkedExample: the first check folds the screen\'s asides but leaves the example as the learner set it (not first-visit folding)', m.store.state.places.demo?.started === true && toggle().getAttribute('aria-expanded') === 'true'
    && !m.store.state.places.demo.asides);
  step(() => m.set({ taskKey: 't1' }));
  check('WorkedExample: the same task rendered again: still open', toggle().getAttribute('aria-expanded') === 'true' && Boolean(card()));
  step(() => m.set({ taskKey: 't2' }));
  check('WorkedExample: a new task (or level, or vendor): closed, its content gone, the live region still there', toggle().getAttribute('aria-expanded') === 'false' && !card() && body() === region && region.childNodes.length === 0);
  step(() => m.set({ taskKey: 't1' }));
  check('WorkedExample: back to the first task: still closed', toggle().getAttribute('aria-expanded') === 'false' && !card());
  click(toggle()); click(toggle());
  check('WorkedExample: the toggle closes it again', toggle().getAttribute('aria-expanded') === 'false' && !card());
  click(toggle());
  m.remount();
  check('WorkedExample: leaving and coming back: closed (its own state, not kept in the store)', toggle().getAttribute('aria-expanded') === 'false' && !card());
});
scenario('WorkedExample lines', () => h.mountExample({ taskKey: 'deck', kind: 'lines' }), () => {
  click(q('.ng-wex-toggle'));
  check('WorkedExample: string rows are lines with a ✓ (aria-hidden), the value in its own span, and the reason last', all('.ng-wex-lines li').length === 1 && q('.ng-wex-lines .ng-wex-mark').getAttribute('aria-hidden') === 'true'
    && text(q('.ng-wex-lines .ng-wex-value')) === 'show running-config → R1#' && text(q('.ng-wex-card').lastChild) === 'Перегляд налаштувань — у привілейованому режимі.' && !q('.ng-wex-table'));
});
scenario('WorkedExample drawing', () => h.mountExample({ taskKey: 'mask', kind: 'drawing' }), () => {
  check('WorkedExample: children stay out of the page while closed', !q('.ruler'));
  click(q('.ng-wex-toggle'));
  check('WorkedExample: children (a static drawing) take the rows\' place inside the card, after the tag and the context', q('.ng-wex-card').contains(q('.ruler')) && text(q('.ruler-words')) === 'Блок 198.51.100.64–127.'
    && q('.ng-wex-card').firstChild === q('.ng-wex-tag') && !q('.ng-wex-lines') && !q('.ng-wex-table'));
});

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
