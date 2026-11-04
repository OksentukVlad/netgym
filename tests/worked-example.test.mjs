// The worked example (round 5, spec 5b-2 A with v2): the shared
// WorkedExample, its CSS in both themes, the screens' test helper, and the
// gate's example-row check (tools/shots.mjs exampleRow, the gate-only state
// example-open).
//   - server render: closed by default (no content in the page, the live
//     region already there), the toggle's words and aria-expanded, the
//     ExerciseLayout slot between the action line and the answer;
//   - CSS: tokens only, muted, never below 14 px, readable in both themes;
//   - expectWorkedExample on markup;
//   - the gate's recipe pieces;
//   - in Chromium (real CSS, 1280 × 800 and 1000 × 700, dark and light): a
//     first view with the folded row still passes its R5 essentials, and
//     the gate's checkExample passes it; the toggle's target and the first
//     control's are disjoint (edge clicks reach the intended one); opened,
//     the card is read and readable, Tab skips it, a new task closes it;
//     negative fixtures fail (unregistered, missing on a registered first
//     view, opened on a first view, an essential inside it, not under the
//     action line, two on a screen, an input inside, overlapping targets,
//     the folded label clipped or painted over, the folded row painted over
//     the action line, nothing to open).
// Mounted behaviour (open, reset on task change, own state apart from
// first-visit folding) is in tests/helpers/mounted-shared.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as h from '../.test-bundles/harness/round5.mjs';
import { expectWorkedExample } from './helpers/worked-example.mjs';
import { browserSkip, launchChromium } from '../tools/browser.mjs';
import { checkExample, EXAMPLE_LABEL, exampleMode, exampleRecipes, exampleRow, expectedTargets, gateStates, measureEssentials, MIN_FONT_PX } from '../tools/shots.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const missing = browserSkip();
const el = h.createElement;
const css = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const example = { taskKey: 't1', context: 'R1 → LAN-C 192.0.2.0/24, сусід 198.51.100.2', head: ['Мережа', 'Маска', 'Наступний перехід'], rows: [['192.0.2.0', '255.255.255.0', '198.51.100.2']] };

test('WorkedExample: closed by default — the toggle button, its words, aria-expanded, the empty live region it controls', () => {
  const html = h.render(el(h.WorkedExample, example));
  const id = /aria-controls="([^"]+)"/.exec(html)[1];
  assert.match(html, /^<div class="ng-wex" data-worked-example="">/);
  assert.match(html, /<button type="button" class="ng-wex-toggle" aria-expanded="false" aria-controls="[^"]+">/);
  assert.equal(html.replace(/<[^>]+>/g, ''), 'Приклад: як це розв’язують ▸', 'the toggle\'s words, nothing else in the page');
  assert.match(html, /<span class="ng-wex-label">Приклад: як це розв’язують <span aria-hidden="true">▸<\/span><\/span>/, 'the arrow is not part of the name');
  assert.ok(html.endsWith(`<div id="${id}" class="ng-wex-body" aria-live="polite"></div></div>`), 'the live region is there, empty, before it opens');
  assert.doesNotMatch(html, /192\.0\.2|ng-wex-card|tabindex/, 'no example values in the page while closed');
  expectWorkedExample(html);
  assert.throws(() => expectWorkedExample(html, { open: true }), /open/);
});

test('ExerciseLayout: the example slot sits directly under the action line, above the answer', () => {
  const html = h.render(el(h.ExerciseLayout, { heading: 'Маска', question: el('p', null, 'Питання'), action: 'Обери маску.', actionId: 'act',
    example: el(h.WorkedExample, example), answer: el('div', { role: 'radiogroup', 'aria-labelledby': 'act' }) }));
  assert.match(html, /<div class="ng-exercise-act"><p id="act" class="ng-action-line" data-action-line="">Обери маску\.<\/p><div class="ng-wex" data-worked-example="">.*?<\/div><\/div><div class="ng-exercise-answer" data-region="answer">/);
  assert.ok(!h.render(el(h.ExerciseLayout, { heading: 'x', action: 'Дія.', answer: el('div') })).includes('ng-wex'), 'no example, no row');
});

test('WorkedExample CSS: tokens only, muted and read-only in look, never below 14 px, readable in both themes', () => {
  const style = css('ui/components/WorkedExample.css');
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only: both themes follow tokens.css');
  assert.doesNotMatch(style, /font-size:\s*\d/, 'sizes from tokens (caption 14 px at least)');
  assert.match(style, /\.ng-wex-toggle \{[^}]*border: 1px solid var\(--ng-stroke\);[^}]*color: var\(--ng-text\);[^}]*font-weight: 700;/, 'a secondary button: the weight of «Підказка» (B3)');
  assert.match(style, /\.ng-wex-toggle \{[^}]*min-height: var\(--ng-target\);/, 'a full target');
  assert.match(style, /\.ng-wex-card \{[^}]*border: 1px dashed var\(--ng-stroke\);[^}]*color: var\(--ng-muted\);[^}]*font-size: var\(--ng-font-caption\);/, 'muted, dashed: not a field');
  assert.match(style, /\.ng-wex-toggle:focus-visible \{[^}]*outline: var\(--ng-focus-width\) solid var\(--ng-focus\)/);
  assert.doesNotMatch(style, /display: none|visibility: hidden/, 'the live region is never removed from the tree');
  // Muted text on the panels it sits on, both themes (4.5:1).
  const tokens = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
  const theme = name => Object.fromEntries([...[...tokens.matchAll(/([^{}]*)\{([^}]*)\}/g)].find(([, sel]) => sel.includes(`[data-theme="${name}"]`))[2]
    .matchAll(/--ng-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]));
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const name of ['dark', 'light']) {
    const c = theme(name);
    for (const bg of ['panel', 'surf', 'bg', 'side']) assert.ok(ratio(c.muted, c[bg]) >= 4.5, `${name}: muted on ${bg} ${ratio(c.muted, c[bg]).toFixed(2)}`);
  }
});

test('expectWorkedExample: one per screen, closed unless asked, no controls inside (markup)', () => {
  const closed = h.render(el(h.WorkedExample, example));
  expectWorkedExample(closed);
  assert.throws(() => expectWorkedExample(closed + closed), /worked examples on the screen: 2/);
  assert.throws(() => expectWorkedExample('<p>нічого</p>'), /worked examples on the screen: 0/);
  assert.throws(() => expectWorkedExample(closed.replace('aria-expanded="false"', 'aria-expanded="true"')), /closed/);
  assert.throws(() => expectWorkedExample(closed.replace(' aria-live="polite"', '')), /live region/);
  // An opened example's markup (the card), as a screen with it open would render it.
  const card = '<div class="ng-wex-card"><p class="ng-wex-tag">приклад · інші числа</p><p class="ng-wex-context">R1 → LAN-C</p><table class="ng-wex-table"><tbody><tr><td class="ng-wex-mark" aria-hidden="true">✓</td><td class="ng-wex-value">192.0.2.0</td></tr></tbody></table></div>';
  const opened = closed.replace('aria-expanded="false"', 'aria-expanded="true"').replace('aria-live="polite"></div>', `aria-live="polite">${card}</div>`);
  expectWorkedExample(opened, { open: true, rows: 1 });
  assert.throws(() => expectWorkedExample(opened, { open: true, rows: 2 }), /✓ rows: 1/);
  assert.throws(() => expectWorkedExample(opened.replace('<td class="ng-wex-value">', '<td class="ng-wex-value"><input value="x"/>'), { open: true }), /focus or input: <input/);
  assert.throws(() => expectWorkedExample(opened.replace('<td class="ng-wex-value">', '<td class="ng-wex-value" tabindex="0">'), { open: true }), /focus or input/);
  assert.throws(() => expectWorkedExample(opened.replace('приклад · інші числа', 'приклад'), { open: true }), /tag/);
});

/** Run `fn` with exampleRecipes holding exactly `ids`; the production set is restored afterwards. */
async function withRecipes(ids, fn) {
  const saved = [...exampleRecipes];
  exampleRecipes.clear();
  for (const id of ids) exampleRecipes.add(id);
  try { return await fn(); } finally { exampleRecipes.clear(); for (const id of saved) exampleRecipes.add(id); }
}

test('the gate: example-open is gate-only for registered recipes, a view toggle with the card as its target; modes per state', async () => {
  const before = [...exampleRecipes];
  await withRecipes([], () => assert.ok(!gateStates({ id: 'wex-fixture', states: ['first'] }).includes('example-open'), 'unregistered: no example-open'));
  await withRecipes(['wex-fixture'], () => {
    assert.ok(gateStates({ id: 'wex-fixture', states: ['first'] }).includes('example-open'), 'registered: the gate-only state');
    assert.ok(!gateStates({ id: 'wex-other', states: ['first'] }).includes('example-open'), 'only the registered recipe');
  });
  assert.deepEqual([...exampleRecipes], before, 'the production registry is restored');
  const target = expectedTargets('vl-route', 'example-open');
  assert.equal(target.kind, null, 'not a help-panel event');
  assert.deepEqual(target.targets, ['[data-worked-example] .ng-wex-card'], 'the opened card must be in view and unclipped');
  assert.ok(target.waive.evidence && target.waive.message);
  assert.equal(expectedTargets('setup-router', 'example-open').kind, null, 'setup decks too');
  assert.deepEqual(['first', 'l1-first', 'l2-card3', 'example-open', 'wrong', 'hint', 'restore'].map(exampleMode), ['first', 'first', 'first', 'open', 'closed', 'closed', 'closed']);
});

async function bundle() {
  const require = createRequire(path.join(root, 'shell/frontend/package.json'));
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'tests/browser/worked-example.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/wex', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

// A first view's essentials, as a recipe declares them: the task, the action line, the choices, «Перевірити».
const essentials = [{ sel: '.fx-task', count: 1 }, { sel: '.ng-action-line', count: 1 }, { sel: '.fx-choice', count: 3 }, { sel: '.fx-check', count: 1 }];
const reasons = result => result.failures.map(f => f.reason);

test('WorkedExample in Chromium: the folded row keeps a first view\'s R5 essentials; opened, read-only and readable; negatives fail', { skip: missing }, async () => {
  const { js, css: style } = await bundle();
  const browser = await launchChromium();
  const open = async viewport => {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setContent(`<!doctype html><html><head><style>${style} body { margin: 0 } .fx-overlap { margin-top: -40px }</style></head><body><div id="host"></div></body></html>`);
    await page.addScriptTag({ content: js });
    page.errors = errors;
    return page;
  };
  const view = (page, options) => page.evaluate(o => window.wex.firstView(document.getElementById('host'), o), options);
  const row = (page, mode, list = essentials, registered = true) => page.evaluate(exampleRow, { mode, essentials: list, registered });
  // The gate's whole check for a state, as Driver.gate runs it, with the fixture recipe registered or not.
  const gateCheck = (page, state, registered = true, list = essentials) => withRecipes(registered ? ['wex-fixture'] : [], () => checkExample(page, { id: 'wex-fixture', state, essentials: list }));
  const must = (page, list = essentials) => page.evaluate(measureEssentials, { essentials: list, minFont: MIN_FONT_PX });
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 1000, height: 700 }]) for (const layout of ['exercise', 'custom']) for (const theme of ['dark', 'light']) {
      const at = `${viewport.width}×${viewport.height} ${layout} ${theme}`;
      const page = await open(viewport);
      // The same first view without the example: where the first control sits.
      await view(page, { layout, theme, example: false });
      const before = await page.evaluate(() => document.querySelector('.fx-choice').getBoundingClientRect().top);
      await view(page, { layout, theme, taskKey: 'task-1' });
      const first = await page.evaluate(() => {
        const line = document.querySelector('.ng-action-line').getBoundingClientRect(), label = document.querySelector('.ng-wex-label').getBoundingClientRect();
        const style = getComputedStyle(document.querySelector('.ng-wex-toggle'));
        return { control: document.querySelector('.fx-choice').getBoundingClientRect().top, under: label.top >= line.bottom - 1, size: parseFloat(style.fontSize), colour: style.color,
          muted: getComputedStyle(document.querySelector('[data-theme]')).getPropertyValue('--ng-muted').trim(), plain: getComputedStyle(document.querySelector('[data-theme]')).getPropertyValue('--ng-text').trim() };
      });
      // R5 with the folded row in place, and the gate's row check.
      assert.deepEqual(reasons(await must(page)), [], `${at}: the first view's essentials pass with the folded row`);
      assert.deepEqual(reasons(await gateCheck(page, 'first')), [], `${at}: the gate's example check passes (row, place, disjoint targets, folded label)`);
      // Disjoint targets: the toggle's box meets neither the action line nor the first control; edge clicks reach the intended one.
      const boxes = await page.evaluate(() => Object.fromEntries(['.ng-action-line', '.ng-wex-toggle', '.fx-choice'].map(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [sel, { top: r.top, bottom: r.bottom, left: r.left, right: r.right }]; })));
      const [line, tg, ch] = ['.ng-action-line', '.ng-wex-toggle', '.fx-choice'].map(k => boxes[k]);
      assert.ok(line.bottom <= tg.top && tg.bottom <= ch.top, `${at}: action line, toggle and first control stacked without overlap ${JSON.stringify(boxes)}`);
      assert.ok(tg.bottom - tg.top >= 44, `${at}: a full 44 px target`);
      const expanded = () => page.evaluate(() => document.querySelector('.ng-wex-toggle').getAttribute('aria-expanded'));
      const midX = (tg.left + tg.right) / 2;
      await page.mouse.click(midX, tg.top + 1);
      assert.equal(await expanded(), 'true', `${at}: the toggle's top edge opens it`);
      await page.mouse.click(midX, tg.bottom - 1);
      assert.equal(await expanded(), 'false', `${at}: the toggle's bottom edge closes it`);
      await page.mouse.click(ch.left + 4, ch.top + 1);
      assert.deepEqual([await page.evaluate(() => document.activeElement.className), await expanded()], ['fx-choice', 'false'], `${at}: the first control's top edge reaches the control, not the toggle`);
      await page.mouse.click(midX, line.bottom - 1);
      assert.equal(await expanded(), 'false', `${at}: the action line's bottom edge doesn't toggle it`);
      // The folded row and its words: under the action line, its 44 px target plus a gap (about 50 px), a button's weight (round 9, B3).
      assert.ok(first.under, `${at}: the toggle's words are below the action line`);
      const added = first.control - before;
      assert.ok(added > 0 && added <= 56, `${at}: the folded row adds ${added} px above the first control`);
      assert.equal(first.size, 16);
      assert.equal(first.colour, (await page.evaluate(hex => { const d = document.createElement('i'); d.style.color = hex; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, first.plain)), `${at}: a button's text colour`);
      assert.deepEqual(reasons(await must(page, [{ sel: EXAMPLE_LABEL, count: 1 }])), [], `${at}: the folded row itself is readable`);
      // Tab: the toggle, then the first control (the closed example holds nothing to reach).
      await page.evaluate(() => document.querySelector('.ng-wex-toggle').focus());
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'fx-choice', `${at}: Tab goes from the toggle to the first control`);
      // Open by keyboard: the live region was there before and holds the card now.
      const region = await page.evaluate(() => { window.__region = document.getElementById(document.querySelector('.ng-wex-toggle').getAttribute('aria-controls')); return window.__region.childElementCount; });
      assert.equal(region, 0);
      await page.evaluate(() => document.querySelector('.ng-wex-toggle').focus());
      await page.keyboard.press('Enter');
      const opened = await page.evaluate(() => {
        const toggle = document.querySelector('.ng-wex-toggle'), card = document.querySelector('.ng-wex-card');
        return { expanded: toggle.getAttribute('aria-expanded'), same: window.__region === document.getElementById(toggle.getAttribute('aria-controls')) && window.__region.contains(card),
          live: window.__region.getAttribute('aria-live'), label: toggle.textContent, text: card.innerText.replace(/\s+/g, ' ').trim(),
          colour: getComputedStyle(card).color, value: getComputedStyle(card.querySelector('.ng-wex-value')).fontFamily };
      });
      assert.deepEqual({ ...opened, colour: undefined, value: undefined }, { expanded: 'true', same: true, live: 'polite', label: 'Приклад: як це розв’язують ▾',
        text: 'приклад · інші числа R1 → LAN-C 192.0.2.0/24, сусід 198.51.100.2 Мережа Маска Наступний перехід ✓ 192.0.2.0 255.255.255.0 198.51.100.2 Мережа — адреса блоку, не адреса вузла.', colour: undefined, value: undefined }, at);
      assert.equal(opened.colour, await page.evaluate(hex => { const d = document.createElement('i'); d.style.color = hex; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, first.muted), `${at}: the card is muted`);
      assert.match(opened.value, /Courier New|monospace/, 'values in monospace');
      assert.deepEqual(reasons(await gateCheck(page, 'example-open')), [], `${at}: example-open passes the gate's check`);
      assert.deepEqual(reasons(await must(page, ['.ng-wex-card .ng-wex-tag', '.ng-wex-card .ng-wex-context', '.ng-wex-card tbody td', '.ng-wex-card th', '.ng-wex-card .ng-wex-note'])), [], `${at}: the opened card is readable, in view, unclipped`);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'fx-choice', `${at}: opened, Tab still skips its content`);
      // A new task closes it; coming back to the first task finds it closed.
      await view(page, { layout, theme, taskKey: 'task-2' });
      assert.equal(await page.evaluate(() => document.querySelector('.ng-wex-toggle').getAttribute('aria-expanded') + document.querySelectorAll('.ng-wex-card').length), 'false0', `${at}: a new task closes it`);
      await view(page, { layout, theme, taskKey: 'task-1' });
      assert.equal(await page.evaluate(() => document.querySelectorAll('.ng-wex-card').length), 0, `${at}: back to the first task: still closed`);
      assert.deepEqual(page.errors, [], at);
      await page.evaluate(() => window.wex.unmount());
      await page.close();
    }

    // Negative fixtures (1000 × 700, the custom layout).
    const page = await open({ width: 1000, height: 700 });
    await view(page, { layout: 'custom' });
    // Registration both ways.
    assert.ok(reasons(await gateCheck(page, 'first', false)).some(r => /not in exampleRecipes/.test(r)), 'an example on an unregistered recipe fails (first view)');
    assert.ok(reasons(await gateCheck(page, 'wrong', false)).some(r => /not in exampleRecipes/.test(r)), '… and on any other state');
    await view(page, { layout: 'custom', example: false });
    assert.ok(reasons(await gateCheck(page, 'first')).some(r => /no worked example on this first view/.test(r)), 'a registered recipe\'s first view without one fails');
    assert.deepEqual(reasons(await gateCheck(page, 'wrong')), [], 'later states may lose it (a solved or revealed screen)');
    // The folded label measured on its own: clipped, painted over.
    await view(page, { layout: 'custom', taskKey: 'label' });
    await page.addStyleTag({ content: '.fx-clip .ng-wex-label { display: inline-block; max-width: 40px; overflow: hidden; white-space: nowrap }' });
    await page.evaluate(() => document.querySelector('.fx-work').classList.add('fx-clip'));
    assert.ok((await gateCheck(page, 'first')).failures.some(f => f.role === 'worked example label' && /clipped/.test(f.reason)), 'a clipped folded label fails');
    await page.evaluate(() => { document.querySelector('.fx-work').classList.remove('fx-clip'); const cover = document.createElement('div'); cover.className = 'fx-cover'; const r = document.querySelector('.ng-wex-label').getBoundingClientRect();
      Object.assign(cover.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: '60px', height: `${r.height}px`, background: '#000', pointerEvents: 'none' }); document.body.append(cover); });
    assert.ok((await gateCheck(page, 'first')).failures.some(f => f.role === 'worked example label' && /painted over/.test(f.reason)), 'a folded label painted over fails');
    await page.evaluate(() => document.querySelector('.fx-cover').remove());
    assert.deepEqual(reasons(await gateCheck(page, 'first')), [], 'uncovered again: passes');
    // Overlapping targets: the old 8 px overhang, with a control 6 px below.
    await page.addStyleTag({ content: '.fx-hang .ng-wex-toggle { margin: -8px -6px } .fx-hang { gap: 6px !important }' });
    await page.evaluate(() => document.querySelector('.fx-work').classList.add('fx-hang'));
    assert.ok(reasons(await gateCheck(page, 'first')).some(r => /target overlaps another control's: button\.fx-choice/.test(r)), 'a toggle target overlapping the first control fails');
    await page.evaluate(() => document.querySelector('.fx-work').classList.remove('fx-hang'));
    await view(page, { layout: 'custom' });
    await page.click('.ng-wex-toggle');
    assert.ok(reasons(await row(page, 'first')).some(r => /open without the learner asking/.test(r)), 'opened on a first view (or by itself) fails');
    assert.ok(reasons(await row(page, 'closed')).some(r => /open without the learner asking/.test(r)), 'open on any other state fails');
    await page.click('.ng-wex-toggle');
    assert.ok(reasons(await row(page, 'first', [...essentials, '.ng-wex-label'])).some(r => /inside the worked example/.test(r)), 'an essential inside it fails');
    await view(page, { layout: 'custom', misplaced: true });
    assert.ok(reasons(await row(page, 'first')).some(r => /not directly under the action line/.test(r)), 'below the first control fails');
    await view(page, { layout: 'custom', twice: true });
    assert.ok(reasons(await row(page, 'first')).some(r => /2 worked examples/.test(r)), 'two on a screen fail');
    await view(page, { layout: 'custom', control: true });
    await page.click('.ng-wex-toggle');
    assert.ok(reasons(await row(page, 'open')).some(r => /focusable or input element inside the example: input/.test(r)), 'an input inside fails');
    // A fresh, folded example (a new task) pulled up over the action line.
    await view(page, { layout: 'custom', overlap: true, taskKey: 'overlap' });
    assert.equal(await page.evaluate(() => document.querySelector('.ng-wex-toggle').getAttribute('aria-expanded') + document.querySelectorAll('.ng-wex-card').length), 'false0', 'the overlap fixture is the folded row');
    assert.ok((await must(page)).failures.some(f => f.element === '.ng-action-line' && /painted over by (span|button)\.ng-wex/.test(f.reason)), 'a folded row painted over the action line breaks R5');
    await view(page, { layout: 'custom', example: false });
    assert.deepEqual(reasons(await row(page, 'open')), ['no worked example to open on this screen'], 'example-open on a screen without one fails');
    assert.deepEqual(await gateCheck(page, 'first', false), { mode: 'first', present: false, failures: [] }, 'an unregistered screen without one: nothing to check');
    await page.close();
  } finally { await browser.close(); }
});
