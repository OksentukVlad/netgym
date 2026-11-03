// Round 4 stage 1 (spec A): the shared parts' pure decisions and server
// markup. HelpPanel's memory (which item is current) and its primary-button
// rule, useZoomBar's decision, DoneMark's aggregation, the words, the start
// screen, and the no-sticky rules in the CSS. The mounted lifecycle (focus,
// scrolling, anchoring, the contract fixtures) is tests/shared-mounted.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as h from '../.test-bundles/harness/shared.mjs';

const el = h.createElement;
import { uk } from '../src/ui/uk.js';
import { MIN_TEXT_PX } from '../src/ui/topology/size.js';

const css = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('HelpPanel memory: the event table, newest wins, and what a new task or step forgets', () => {
  const at = (prev, now) => h.helpMemory(prev, { taskKey: 't', ...now });
  let m = at(null, {});
  assert.deepEqual([m.last, m.event], [null, null], 'first view: nothing current');
  m = at(m, { stamp: 1 });
  assert.deepEqual([m.last, m.event], ['verdict', 'verdict'], 'check (wrong): the verdict');
  m = at(m, { stamp: 1, shown: 1 });
  assert.deepEqual([m.last, m.event], ['hint', 'hint'], 'hint: the rung');
  m = at(m, { stamp: 1, shown: 1 });
  assert.equal(m.event, null, 'a render without a change is no event (no scroll, no focus)');
  m = at(m, { stamp: 2, shown: 1 });
  assert.deepEqual([m.last, m.event], ['verdict', 'verdict'], 'a new check: the verdict again');
  m = at(m, { stamp: 2, shown: 1, revealed: true });
  assert.deepEqual([m.last, m.event], ['reveal', 'reveal'], 'reveal');
  m = at(m, { stamp: 3, shown: 1, revealed: true });
  assert.deepEqual([m.last, m.event], ['verdict', 'verdict'], 'a check after the reveal shows as usual');
  const seq = m.seq;
  m = h.helpMemory(m, { taskKey: 'u', stamp: 3, shown: 1, revealed: true });
  assert.deepEqual([m.last, m.event, m.seq], ['reveal', null, seq], 'a new task: the fallback, no event');
  // Simultaneous changes: reveal > hint > verdict, except a verdict that finishes the task.
  assert.equal(at(at(null, {}), { stamp: 1, shown: 1 }).event, 'hint', 'hint 2 that checks: the hint is current');
  assert.equal(at(at(null, {}), { stamp: 1, shown: 1, done: true }).event, 'verdict', 'hint 2 that passes: the success is current');
  assert.equal(at(at(null, {}), { stamp: 1, shown: 1, revealed: true }).event, 'reveal');
  // Restore (a mount with everything there): reveal > verdict > newest hint, no event.
  assert.deepEqual(['reveal', 'verdict', 'hint', null].map((want, i) => at(null, [{ stamp: 1, shown: 2, revealed: true }, { stamp: 1, shown: 2 }, { shown: 2 }, {}][i]).last), ['reveal', 'verdict', 'hint', null]);
  // A step change forgets the verdict (it was about the previous step).
  m = h.helpMemory(null, { taskKey: 't', stepKey: 1, stamp: 1 });
  m = h.helpMemory(m, { taskKey: 't', stepKey: 2, stamp: 1 });
  assert.deepEqual([m.last, m.event], [null, null], 'new step: the old verdict is not current and not an event');
  m = h.helpMemory(m, { taskKey: 't', stepKey: 2, stamp: 2 });
  assert.equal(m.event, 'verdict', 'the new step\'s first check');
  // A verdict or hint that went away (a reset) falls back.
  assert.equal(at(at(at(null, {}), { stamp: 1 }), {}).last, null);
});

test('HelpPanel primary: one rule (check, else continue, else next), and the override', () => {
  const check = { onCheck() {} }, next = { onNext() {} }, cont = { label: 'Наступний пакет →', onClick() {} };
  const no = { tone: 'no', summary: 'x', stamp: 1 }, ok = { tone: 'ok', summary: 'x', stamp: 1 }, part = { tone: 'ok', scope: 'part', summary: 'x', stamp: 1 };
  assert.equal(h.primaryOf({ check, next }), 'check', 'a live check, task not done');
  assert.equal(h.primaryOf({ check, verdict: no, next }), 'check');
  assert.equal(h.primaryOf({ check, verdict: part, next }), 'check', 'a right row is not a done task');
  assert.equal(h.primaryOf({ check, verdict: ok, next }), 'next', 'after success: «Далі →»');
  assert.equal(h.primaryOf({ check, reveal: { revealed: true }, next }), 'next', 'after a reveal: «Далі →»');
  // Round 6: before a pass or a reveal «next» is a skip (a quiet link), never the primary button;
  // a screen whose own round is over says so (`ready`).
  assert.equal(h.primaryOf({ check: null, next }), null, 'no check, task not done: the skip is no primary');
  assert.equal(h.primaryOf({ check: null, next: { ...next, ready: true } }), 'next', 'a round over (a committed prediction): «Далі →»');
  assert.equal(h.primaryOf({ check: { onCheck() {}, disabled: true }, next }), 'check', 'nothing chosen yet: the check keeps the primary look, not the skip');
  assert.equal(h.primaryOf({ check: null, continueAction: cont, next }), 'continue', 'in a round: the step button');
  assert.equal(h.primaryOf({ check, verdict: ok, continueAction: cont, next }), 'continue');
  assert.equal(h.primaryOf({ check, primary: 'continue', continueAction: cont }), 'continue', 'the override wins');
  assert.equal(h.primaryOf({ check: null }), null);
  assert.equal(h.primaryOf({ check, next, primary: 'none' }), null, '\'none\': no primary button');
  assert.equal(h.primaryOf({ check: { onCheck() {}, disabled: true } }), 'check', 'a disabled check with nothing else keeps the primary look');
  assert.deepEqual([h.isSuccess(ok), h.isSuccess(part), h.isSuccess(no), h.isSuccess(null)], [true, false, false, false]);
});

test('HelpPanel markup: one status region, the gate hooks, the row, the words', () => {
  const html = unescape(h.renderPlain(el(h.HelpPanel, {
    taskKey: 't', check: { onCheck() {} }, verdict: { tone: 'no', summary: 'Широкомовна — ні.', summaryNode: el('p', { className: 'node' }, 'картка'), detail: 'Детально.', stamp: 1 },
    hints: { texts: ['а', 'б', 'в'], shown: 0, onMore() {} }, reveal: { revealed: false, onReveal() {}, render: () => 'відповідь' },
  })));
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, 'exactly one status region');
  assert.ok(html.includes('data-help="row"') && html.includes('data-help="message"') && html.includes('data-help-current=""') && html.includes('data-help-tone="no"'));
  assert.match(html, /<div role="status" aria-live="polite" class="ng-help-said"><p class="ng-help-summary"><span class="ng-help-badge">• Ще ні<\/span> Широкомовна — ні\.<\/p><\/div><div class="ng-help-node">/, 'the summary is announced; summaryNode sits outside the status');
  assert.ok(html.includes('<summary>Детальніше</summary>'), 'a wrong verdict\'s detail behind «Детальніше»');
  assert.ok(html.includes('>Перевірити</button>') && html.includes('>Підказка 1 з 3</button>') && html.includes('>Показати відповідь</button>'));
  assert.ok(!html.includes('>відповідь'), 'the answer is not in the page before the reveal');
  // Words: no penalty, no score anywhere in the generic words.
  assert.doesNotMatch(JSON.stringify(uk), /зарахов|Спробуй нове|спроб:|рахунок|✅|★/);
  assert.deepEqual([uk.next, uk.nextName, uk.fails, uk.passes, uk.remove, uk.revealed], ['Далі →', 'Далі', '✗ не проходить', '✓ проходить', 'Видалити', 'Розв’язок показано.']);
});

test('HelpPanel markup: a reveal replaces the verdict; hints fold; an applied reveal is one line', () => {
  const base = { taskKey: 't', check: null, verdict: { tone: 'no', summary: 'Ні.', stamp: 1 }, hints: { texts: ['а', 'б'], shown: 2, onMore() {} } };
  const html = unescape(h.renderPlain(el(h.HelpPanel, { ...base, reveal: { revealed: true, onReveal() {}, render: () => 'Мережа 10.0.0.0.', heading: 'Один із правильних порядків' }, next: { onNext() {} } })));
  assert.ok(html.includes('<h2 class="ng-caption ng-reveal-heading" tabindex="-1">Один із правильних порядків</h2>Мережа 10.0.0.0.'));
  assert.ok(!html.includes('Ще ні'), 'the stale «Ще ні» is gone');
  assert.ok(html.includes('<summary>Підказки (2)</summary>') && (html.match(/data-help="hint"/g) ?? []).length === 2, 'both rungs folded, reachable');
  assert.ok(html.includes('class="ng-button ng-button-primary ng-help-next">Далі<span aria-hidden="true"> →</span>'), '«Далі →» primary, its arrow aria-hidden');
  const applied = unescape(h.renderPlain(el(h.HelpPanel, { ...base, reveal: { revealed: true, onReveal() {}, render: () => 'не тут', applied: uk.help.applied } })));
  assert.ok(applied.includes(`<p class="ng-help-applied-text" tabindex="-1">${uk.help.applied}</p>`) && !applied.includes('не тут'));
  const dest = unescape(h.renderPlain(el(h.HelpPanel, { taskKey: 't', next: { onNext() {}, destination: 'наступний раунд', ready: true } })));
  assert.ok(dest.includes('Далі<span aria-hidden="true"> →</span><span class="ng-sr-only">, наступний раунд</span>'), 'a destination joins the name when several continuations coexist');
});

test('HelpPanel: before a pass or a reveal «next» is the quiet «Пропустити →» after «Показати відповідь», never beside «Перевірити» (round 6)', () => {
  const base = { taskKey: 't', check: { onCheck() {} }, hints: { texts: ['а'], shown: 0, onMore() {} }, reveal: { revealed: false, onReveal() {}, render: () => 'x' }, next: { onNext() {}, destination: 'наступна задача' } };
  for (const verdict of [null, { tone: 'no', summary: 'Ні.', stamp: 1 }, { tone: 'ok', scope: 'part', summary: 'Так.', stamp: 1 }]) {
    const html = unescape(h.renderPlain(el(h.HelpPanel, { ...base, verdict })));
    const [checkRow, linkRow] = [html.split('<div class="ng-help-row-link">')[0], html.split('<div class="ng-help-row-link">')[1].split('</div>')[0]];
    assert.ok(checkRow.includes('>Перевірити</button>') && !checkRow.includes('ng-help-next'), `${verdict?.tone ?? 'first view'}: no next button in the check row`);
    assert.match(linkRow, /ng-help-reveal-link">Показати відповідь<\/button><button type="button" class="ng-button ng-button-quiet ng-help-next is-skip">Пропустити<span aria-hidden="true"> →<\/span><span class="ng-sr-only">, наступна задача<\/span><\/button>$/, 'the skip after «Показати відповідь», its destination kept');
  }
  const passed = unescape(h.renderPlain(el(h.HelpPanel, { ...base, check: null, verdict: { tone: 'ok', summary: 'Так.', stamp: 1 } })));
  assert.ok(passed.includes('class="ng-button ng-button-primary ng-help-next">Далі<span aria-hidden="true"> →</span>') && !passed.includes('is-skip'), 'after a pass: the «Далі →» button');
  const revealed = unescape(h.renderPlain(el(h.HelpPanel, { ...base, reveal: { ...base.reveal, revealed: true } })));
  assert.ok(revealed.includes('ng-help-next">Далі') && !revealed.includes('is-skip'), 'after a reveal: the «Далі →» button');
  const noReveal = unescape(h.renderPlain(el(h.HelpPanel, { taskKey: 't', check: { onCheck() {} }, next: { onNext() {} } })));
  assert.match(noReveal, /<div class="ng-help-row-link"><button type="button" class="ng-button ng-button-quiet ng-help-next is-skip">Пропустити/, 'without a reveal the skip has the line to itself');
  const committed = unescape(h.renderPlain(el(h.HelpPanel, { taskKey: 't', check: null, continueAction: { label: 'Наступний пакет →', onClick() {} }, next: { onNext() {} } })));
  assert.match(committed, /ng-help-continue">Наступний пакет →<\/button><button type="button" class="ng-button ng-button-quiet ng-help-next is-skip">Пропустити/, 'no check and no reveal: the skip shares the row after the continue button');
  assert.ok(!committed.includes('ng-help-row-link'), 'and takes no line of its own');
  const own = unescape(h.renderPlain(el(h.HelpPanel, { taskKey: 't', check: null, next: { onNext() {}, label: 'Новий раунд', ready: true } })));
  assert.ok(own.includes('ng-help-next">Новий раунд</button>') && !own.includes('is-skip'), 'a screen\'s own label, its round over: the button as before');
});

test('useZoomBar: shown only when the fitted text is too small or the learner zoomed; width decides, height never', () => {
  const s = (prev, now) => h.zoomBarState(prev, { taskKey: 'a', zoomed: false, ...now });
  let z = s(null, { width: null, fitPx: null });
  assert.equal(z.show, false, 'before the first measurement: no bar');
  z = s(z, { width: 800, fitPx: MIN_TEXT_PX + 2 });
  assert.equal(z.show, false, 'readable at its fit scale: no bar');
  const same = s(z, { width: 800, fitPx: MIN_TEXT_PX - 3 });
  assert.equal(same.show, false, 'a height change (same width, smaller fit) never shows it');
  assert.equal(same, z, 'and changes nothing');
  z = s(z, { width: 500, fitPx: MIN_TEXT_PX - 3 });
  assert.equal(z.show, true, 'a narrower frame where the text would be too small: the bar');
  z = s(z, { width: 1200, fitPx: MIN_TEXT_PX + 5 });
  assert.equal(z.show, true, 'once shown for a task it stays (no flicker)');
  z = h.zoomBarState(z, { taskKey: 'b', width: 1200, fitPx: MIN_TEXT_PX + 5, zoomed: false });
  assert.equal(z.show, false, 'a new task decides again');
  z = h.zoomBarState(z, { taskKey: 'b', width: 1200, fitPx: MIN_TEXT_PX + 5, zoomed: true });
  assert.equal(z.show, true, 'keys or Ctrl + wheel zoomed: the bar appears');
  assert.equal(h.zoomBarState(null, { taskKey: 'c', width: 300, fitPx: MIN_TEXT_PX - 1, zoomed: false }).show, true, 'a task that opens too small');
  assert.deepEqual([h.isZoomed(undefined), h.isZoomed(null), h.isZoomed('all'), h.isZoomed(15)], [false, false, true, true]);
});

test('DoneMark: its name, and earned aggregated by task or level (at least one earned task)', () => {
  assert.equal(unescape(h.renderPlain(el('button', null, 'Рівень 2', el(h.DoneMark)))), '<button>Рівень 2<span class="ng-done"><span aria-hidden="true">✓</span><span class="ng-sr-only"> розв’язано</span></span></button>');
  assert.equal(h.renderPlain(el(h.DoneMark, { done: false })), '');
  const key = (taskId, level, seed) => JSON.stringify({ exerciseId: 'x', taskId, level, seed });
  const earned = solved => ({ session: { earned: { solved } } });
  const instances = { [key('a', 1, 1)]: earned(true), [key('a', 1, 2)]: earned(false), [key('b', 2, 1)]: earned(false), 'not json': earned(true), [JSON.stringify({ exerciseId: 'y', taskId: 'c', level: 3 })]: earned(true) };
  assert.deepEqual([...h.earnedBy(instances, id => (id.exerciseId === 'x' ? id.taskId : null))], ['a'], 'per task, once, own exercise only');
  assert.deepEqual([...h.earnedBy(instances, id => (id.exerciseId === 'x' ? id.level : null))], [1], 'a level with one earned task');
});

test('Aside: open on the first visit, folded once the screen started; the explicit choice wins', () => {
  const aside = el(h.Aside, { screen: 's', id: 'keys', title: 'Як читати схему' }, el('p', null, 'Стрілки.'));
  const first = unescape(h.render(aside));
  assert.match(first, /<button type="button" class="ng-aside-q" aria-label="Як читати схему" title="Як читати схему" aria-expanded="true" aria-controls="[^"]+"><span class="ng-aside-dot" aria-hidden="true">\?<\/span><\/button>/);
  assert.ok(first.includes('Стрілки.'));
  const started = unescape(h.render(aside, { s: { started: true } }));
  assert.ok(started.includes('aria-expanded="false"') && !started.includes('Стрілки.'), 'folded after the first check or «Далі»');
  assert.ok(unescape(h.render(aside, { s: { started: true, asides: { keys: true } } })).includes('Стрілки.'), '«?» reopened: holds');
  assert.ok(!unescape(h.render(aside, { s: { asides: { keys: false } } })).includes('Стрілки.'), 'folded by hand on the first visit: holds');
});

test('MoreMenu markup: a quiet «⋯» named «Інші дії», a menu button, closed', () => {
  const html = unescape(h.renderPlain(el(h.MoreMenu, { items: [{ id: 'a', label: 'Скопіювати код', copy: 'x' }, null, false] })));
  assert.match(html, /<button type="button" class="ng-more-button" aria-label="Інші дії" title="Інші дії" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">⋯<\/span><\/button>/);
  assert.ok(!html.includes('role="menu"'));
});

test('«Текстом»: a small text link by default (A3), the old button on request', () => {
  const link = h.renderPlain(el(h.TextEquivalentButton, { id: 'x', label: 'Текстом', open: false, onToggle() {} }));
  assert.ok(link.startsWith('<button type="button" class="ng-te-button is-link" aria-expanded="false" aria-controls="x">Текстом'));
  assert.ok(h.renderPlain(el(h.TextEquivalentButton, { id: 'x', label: 'Текстом', open: false, onToggle() {}, variant: 'button' })).startsWith('<button type="button" class="ng-te-button" '));
});

test('ExerciseLayout: the help slot under the answer; no bar, never sticky', () => {
  const html = h.renderPlain(el(h.ExerciseLayout, { heading: 'H', answer: el('input'), help: el('p', null, 'панель'), tools: el('p', null, 'інше'), feedback: el('p', null, 'відгук'), action: el('button', null, 'Ок') }));
  assert.ok(!html.includes('відгук') && !html.includes('data-region="bar"'), 'the old feedback/action props are gone (round 4: binary moved to the help panel)');
  assert.ok(html.indexOf('data-region="answer"') < html.indexOf('data-region="help"') && html.indexOf('data-region="help"') < html.indexOf('data-region="tools"'));
  assert.doesNotMatch(css('ui/components/ExerciseLayout.css'), /position:\s*sticky/, 'no sticky bar (it covered hint 3)');
  assert.doesNotMatch(css('ui/components/HelpPanel.css'), /position:\s*sticky/, 'the panel is in the normal flow');
  const hint = css('ui/components/HelpPanel.css').match(/\.ng-help-hint \{[^}]*\}/)[0];
  assert.doesNotMatch(hint, /amber/, 'a hint is quiet: amber is for «Ще ні» only');
});

test('no sticky diagram in one column (A2); the order screen has no inner scroll box', () => {
  const order = css('sections/firewall/screens/order.css');
  const sticky = [...order.matchAll(/([^{}]+)\{[^}]*position:\s*sticky[^}]*\}/g)].map(m => m[1].trim());
  assert.ok(sticky.length > 0 && sticky.every(sel => sel.includes('[data-layout="two"]')), sticky.join(' | '));
  assert.doesNotMatch(order, /overflow-y:\s*auto/, 'the list and its panel scroll with the page');
  assert.match(css('ui/tokens.css'), /--ng-scroll-pad:\s*\d+px;[\s\S]*scroll-padding:\s*var\(--ng-scroll-pad\) 0/, 'scroll-into-view keeps clear of the bar');
});

test('the start screen: the IP screens first, «Почни тут» inside the first card, the arrow a corner mark, no locks', () => {
  const html = unescape(h.startScreen());
  const cards = [...html.matchAll(/<button type="button" class="ng-card">([\s\S]*?)<\/button>/g)].map(m => m[1]);
  assert.equal(cards.length, 9);
  assert.ok(cards[0].includes('IP-калькулятор') && cards[0].includes('<span class="ng-card-start">Почни тут</span>'), 'chip text inside the first card\'s button');
  assert.ok(cards.slice(1).every(c => !c.includes('Почни тут')), 'only the first');
  assert.ok(cards.every(c => c.includes('<span class="ng-card-arrow" aria-hidden="true">→</span>') && !c.includes('Відкрити')), 'the whole card is the button; no separate «Відкрити →»');
  assert.ok(!/disabled|aria-disabled|🔒/.test(html), 'no locks');
  assert.deepEqual(cards.map(c => c.match(/class="ng-card-title">([^<]+)</)[1]), ['IP-калькулятор', 'IP-адреси: маска', 'IP-адреси: у бітах', 'Маршрутизація', 'DHCP і NAT', 'Перевірка мережі', 'Фаєрвол', 'VLAN', 'Налаштування з нуля']);
});
