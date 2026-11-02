// The phone layer (round 6, plan-mobile v2 P1–P6) in a real browser: the
// whole NetGym target (tests/browser/phone.jsx) at 390 × 844, and crossing
// to 1280 × 800 and back. What the server render and the mini DOM can't show:
//   - scroll ownership: on a phone the page scrolls and the bar goes with it;
//     on a desktop the screen area scrolls and the page doesn't;
//   - the «⋯» sheet: a modal dialog (focus in, Tab kept in, Escape, «Готово»
//     and a tap outside close it, focus back on «⋯», the page inert while
//     open); widening closes it;
//   - crossing 640 px remounts nothing: the bar's controls and a screen's
//     choices are the same nodes on both sides, and a typed value stays;
//   - the full-screen diagram: a modal dialog with «Закрити», Escape, focus
//     back on «Розгорнути схему», open across a turn to landscape; its own
//     zoom never changes the stored one, and a resize keeps the stored one;
//   - the port cards: one field per port, edited in a card, kept across
//     640 px; the reorder rows: the handle and «↑» «↓» under the content,
//     overlapping nothing, 44 px targets, «↓» moves the card.
// Needs Playwright's Chromium (tools/browser.mjs): a missing browser fails,
// unless NETGYM_ALLOW_NO_BROWSER=1 allows a skip locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserSkip, launchChromium } from '../tools/browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const missing = browserSkip();
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };

async function bundle() {
  const require = createRequire(path.join(root, 'shell/frontend/package.json'));
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'tests/browser/phone.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/phone', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"', __NETGYM_WEB__: 'false' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

test('the phone layer in Chromium: scrolling, the sheet, 640 px, the full-screen diagram, port cards, reorder rows', { skip: missing, timeout: 240000 }, async () => {
  const { js, css } = await bundle();
  const browser = await launchChromium();
  const errors = [];
  const open = async (viewport = PHONE) => {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width"><style>body{margin:0}${css}</style></head><body><div id="host"></div></body></html>`);
    await page.addScriptTag({ content: js });
    await page.evaluate(() => window.phone.mount(document.getElementById('host')));
    return page;
  };
  const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const section = async (page, title) => {
    await page.locator('.ng-card').filter({ has: page.locator('.ng-card-title', { hasText: title }) }).click();
    await settle(page);
  };
  const sheetButton = page => page.locator('.ng-bar-sheet-button');
  const inSheet = page => page.evaluate(() => Boolean(document.activeElement?.closest('.ng-bar-end[data-sheet="open"]')));
  try {
    // ── Scroll ownership ──
    let page = await open(PHONE);
    await section(page, 'VLAN');
    let m = await page.evaluate(() => {
      const doc = document.scrollingElement, screen = document.querySelector('.ng-screen');
      return { pageScrolls: doc.scrollHeight > doc.clientHeight + 1, screenOverflow: getComputedStyle(screen).overflowY, barPosition: getComputedStyle(document.querySelector('.ng-bar')).position };
    });
    assert.deepEqual(m, { pageScrolls: true, screenOverflow: 'visible', barPosition: 'static' }, 'phone: the page is the scroller');
    await page.evaluate(() => window.scrollTo(0, 400));
    assert.ok(await page.evaluate(() => document.querySelector('.ng-bar').getBoundingClientRect().bottom <= 0), 'phone: the bar scrolls away with the page');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.ng-bar').length && getComputedStyle(document.querySelector('.ng-bar')).flexWrap), 'nowrap', 'phone: the bar is one row');
    assert.ok(await page.evaluate(() => document.querySelector('.ng-bar').getBoundingClientRect().height < 64), 'phone: the bar is one row high');
    await page.setViewportSize(DESK); await settle(page);
    m = await page.evaluate(() => {
      const doc = document.scrollingElement, screen = document.querySelector('.ng-screen');
      return { pageScrolls: doc.scrollHeight > doc.clientHeight + 1, screenOverflow: getComputedStyle(screen).overflowY };
    });
    assert.deepEqual(m, { pageScrolls: false, screenOverflow: 'auto' }, 'desktop: the screen area is the scroller');
    await page.close();

    // ── The «⋯» sheet ──
    page = await open(PHONE);
    await section(page, 'VLAN');
    assert.equal(await sheetButton(page).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.ng-bar-end').evaluate(el => getComputedStyle(el).display), 'none', 'closed: out of sight');
    await sheetButton(page).click(); await settle(page);
    m = await page.evaluate(() => {
      const sheet = document.querySelector('.ng-bar-end');
      return { state: sheet.dataset.sheet, role: sheet.getAttribute('role'), modal: sheet.getAttribute('aria-modal'), named: Boolean(document.getElementById(sheet.getAttribute('aria-labelledby'))?.textContent),
        focusIn: sheet.contains(document.activeElement), inert: document.querySelector('.ng-screen').inert, groups: [...sheet.querySelectorAll('[role="radiogroup"]')].map(g => g.getAttribute('aria-label')) };
    });
    assert.deepEqual(m, { state: 'open', role: 'dialog', modal: 'true', named: true, focusIn: true, inert: true, groups: ['Вправа', 'Мережа', 'Синтаксис'] }, 'open: a named modal dialog with the choices');
    // Its sibling regions are isolated too: the bar's «←», title and «⋯» are inert and hidden; focus can't go there.
    m = await page.evaluate(() => {
      const back = document.querySelector('.ng-bar-back'), button = document.querySelector('.ng-bar-sheet-button');
      back.focus(); button.focus();
      return { hidden: [back, button, document.querySelector('.ng-bar-title')].every(el => el.inert && el.getAttribute('aria-hidden') === 'true'), focusIn: Boolean(document.activeElement.closest('.ng-bar-end[data-sheet="open"]')),
        captions: [...document.querySelectorAll('.ng-bar-end .ng-sheet-caption')].filter(c => c.getClientRects().length).map(c => c.textContent) };
    });
    assert.deepEqual(m, { hidden: true, focusIn: true, captions: ['Вправа', 'Мережа', 'Синтаксис'] }, 'the bar\'s own controls isolated; every group captioned');
    // One column, however tall: the head above the choices (it scrolls, it never wraps into a second column).
    assert.ok(await page.evaluate(() => document.querySelector('.ng-bar-sheet-body').getBoundingClientRect().top >= document.querySelector('.ng-bar-sheet-head').getBoundingClientRect().bottom - 1), 'the sheet is one column');
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.ok(await inSheet(page), `Tab ${i + 1} stays in the sheet`); }
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Shift+Tab'); assert.ok(await inSheet(page), `Shift+Tab ${i + 1} stays in the sheet`); }
    // A choice in it works, and the sheet stays open for the next one.
    await page.getByRole('radio', { name: 'Налаштуй порти' }).click(); await settle(page);
    assert.equal(await page.evaluate(() => document.querySelector('.ng-vl').dataset.exercise), 'ports');
    assert.equal(await page.locator('.ng-bar-end').getAttribute('data-sheet'), 'open');
    await page.keyboard.press('Escape'); await settle(page);
    m = await page.evaluate(() => ({ state: document.querySelector('.ng-bar-end').dataset.sheet, focus: document.activeElement.className, inert: document.querySelectorAll('[inert]').length }));
    assert.deepEqual(m, { state: 'closed', focus: 'ng-bar-sheet-button', inert: 0 }, 'Escape closes it, focus back on «⋯»');
    await sheetButton(page).click(); await settle(page);
    await page.locator('.ng-bar-sheet-done').click(); await settle(page);
    assert.equal(await page.locator('.ng-bar-end').getAttribute('data-sheet'), 'closed', '«Готово» closes it');
    await sheetButton(page).click(); await settle(page);
    await page.mouse.click(195, 30); await settle(page);
    assert.equal(await page.locator('.ng-bar-end').getAttribute('data-sheet'), 'closed', 'a tap outside closes it');

    // ── Crossing 640 px remounts nothing ──
    await page.evaluate(() => {
      window.__tags = {
        vendor: document.querySelector('.ng-bar-slot [role="radio"]'),
        exercise: document.querySelector('.ng-vl-exercises [role="radio"]'),
        task: document.querySelector('.ng-vl-variants [role="radio"]'),
        field: document.querySelector('.ng-vl-form input[type="text"]'),
      };
    });
    const field = page.locator('.ng-vl-form input[type="text"]').first();
    await field.fill('20, 100');
    const same = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__tags).map(([k, el]) => [k, el.isConnected && document.querySelectorAll('.ng-vl-exercises, .ng-vl-variants').length === 2])));
    const where = () => page.evaluate(() => ({ exercise: Boolean(window.__tags.exercise.closest('.ng-bar-end')), task: Boolean(window.__tags.task.closest('.ng-bar-end')) }));
    assert.deepEqual(await where(), { exercise: true, task: true }, 'phone: the screen\'s choices are in the sheet');
    for (const size of [DESK, { width: 640, height: 800 }, { width: 639, height: 800 }, PHONE]) {
      await page.setViewportSize(size); await settle(page);
      assert.deepEqual(await same(), { vendor: true, exercise: true, task: true, field: true }, `${size.width} px: the same nodes`);
      assert.equal(await page.evaluate(() => window.__tags.field.value), '20, 100', `${size.width} px: the typed value stays`);
      assert.deepEqual(await where(), size.width < 640 ? { exercise: true, task: true } : { exercise: false, task: false }, `${size.width} px: where the choices are`);
    }
    // The sheet open while widening: it closes, nothing moves out of the page.
    await sheetButton(page).click(); await settle(page);
    await page.setViewportSize(DESK); await settle(page);
    m = await page.evaluate(() => ({ sheet: document.querySelector('.ng-bar-end').dataset.sheet ?? null, inert: document.querySelectorAll('[inert]').length, locked: document.documentElement.classList.contains('ng-sheet-open') }));
    assert.deepEqual(m, { sheet: null, inert: 0, locked: false }, 'widened with the sheet open: closed, nothing inert');
    await page.close();

    // ── The port cards: one field per port, edited in its card ──
    page = await open(PHONE);
    await section(page, 'VLAN');
    await sheetButton(page).click(); await page.getByRole('radio', { name: 'Налаштуй порти' }).click(); await page.locator('.ng-bar-sheet-done').click(); await settle(page);
    const rows = page.locator('.ng-vl-form-table > tbody > tr:not(.ng-vl-allowed-row):not(.ng-vl-mark-row)');
    const ports = await rows.count();
    assert.ok(ports >= 2);
    m = await rows.first().evaluate(tr => ({ display: getComputedStyle(tr).display, thead: getComputedStyle(tr.closest('table').tHead).display,
      height: tr.getBoundingClientRect().height, width: tr.getBoundingClientRect().right <= innerWidth, modes: tr.querySelectorAll('[role="radio"]').length }));
    assert.deepEqual({ ...m, height: m.height < 110 }, { display: 'grid', thead: 'none', height: true, width: true, modes: 3 }, 'a port is a card under 110 px, inside the window');
    await rows.first().getByRole('radio', { name: /доступ/ }).click(); await settle(page);
    const vid = rows.first().locator('input.is-vid');
    await vid.fill('20'); await settle(page);
    m = await page.evaluate(() => {
      const tr = document.querySelector('.ng-vl-form-table > tbody > tr'), input = tr.querySelector('input.is-vid'), th = tr.querySelector('th');
      const a = input.getBoundingClientRect(), b = th.getBoundingClientRect();
      return { inputs: document.querySelectorAll('.ng-vl-form-table input.is-vid').length, sameLine: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 24, label: input.getAttribute('aria-label') };
    });
    assert.deepEqual(m, { inputs: 1, sameLine: true, label: `${await rows.first().locator('th').evaluate(th => th.textContent.split(' —')[0].trim())}: VLAN доступу` }, 'one field, on its port\'s line, named by its port');
    await page.evaluate(() => { window.__vid = document.querySelector('.ng-vl-form-table input.is-vid'); });
    await page.setViewportSize(DESK); await settle(page);
    await page.setViewportSize(PHONE); await settle(page);
    assert.deepEqual(await page.evaluate(() => [window.__vid.isConnected, window.__vid.value]), [true, '20'], 'the same field and value across 640 px');
    await page.close();

    // ── The full-screen diagram and the zoom ──
    page = await open(PHONE);
    await section(page, 'Маршрутизація');
    // Round 6 repair: routing keeps «Текстом» closed on a phone; the closed button says how many lines it has.
    assert.equal(await page.locator('.ng-te-button').getAttribute('aria-expanded'), 'false', '«Текстом» closed by default on routing');
    assert.match(await page.locator('.ng-te-button').textContent(), /^Текстом \(\d+\)/, 'the closed button counts its lines');
    await page.locator('.ng-te-button').click(); await settle(page);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ng-te-panel')).position), 'relative', 'its panel is in the flow');
    await page.locator('.ng-te-button').click(); await settle(page);
    const frame = page.locator('.ng-rt-stage .ng-dg-frame');
    const zoomIn = page.locator('.ng-rt-stage .ng-dg-zoom button').nth(1);
    assert.equal(await zoomIn.count(), 1, 'the drawing pans at 12 px: the zoom bar shows');
    await zoomIn.click(); await settle(page);
    const stored = await frame.getAttribute('data-zoom');
    assert.notEqual(stored, 'default');
    await page.getByRole('button', { name: 'Розгорнути схему' }).click(); await settle(page);
    m = await page.evaluate(() => {
      const d = document.querySelector('.ng-dx.is-open'), r = d?.getBoundingClientRect();
      return { role: d?.getAttribute('role'), modal: d?.getAttribute('aria-modal'), focus: document.activeElement.className, fills: Boolean(r) && r.width === innerWidth && r.height === innerHeight,
        zoom: d?.querySelector('.ng-dg-frame').dataset.zoom, locked: getComputedStyle(document.documentElement).overflow };
    });
    assert.deepEqual(m, { role: 'dialog', modal: 'true', focus: 'ng-dx-close', fills: true, zoom: 'all', locked: 'hidden' }, 'open in portrait: a modal over the window, at the whole drawing');
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest('.ng-dx.is-open'))), `Tab ${i + 1} stays in the dialog`); }
    // Modal isolation: the rest of the page is inert and aria-hidden; focus can't be put there.
    m = await page.evaluate(() => {
      const outside = [document.querySelector('.ng-bar'), document.querySelector('.ng-rt-taskbar'), document.querySelector('.ng-rt-work')];
      const hidden = outside.every(el => el.closest('[inert][aria-hidden="true"]'));
      document.querySelector('.ng-bar-sheet-button').focus();
      document.querySelector('.ng-rt-work input')?.focus();
      return { hidden, focusIn: Boolean(document.activeElement.closest('.ng-dx.is-open')) };
    });
    assert.deepEqual(m, { hidden: true, focusIn: true }, 'the background is inert and hidden; focus stays in the dialog');
    // Its own zoom: «+» from the whole drawing (the stored zoom must not change).
    const plus = page.locator('.ng-dx.is-open .ng-dg-zoom button').nth(1);
    assert.equal(await plus.count(), 1, 'the zoom bar shows in the dialog');
    await plus.click(); await settle(page);
    await page.setViewportSize({ width: 844, height: 390 }); await settle(page);
    assert.ok(await page.evaluate(() => { const r = document.querySelector('.ng-dx.is-open')?.getBoundingClientRect(); return Boolean(r) && r.width === innerWidth && r.height === innerHeight; }), 'turned to landscape: still open, filling the window');
    await page.setViewportSize(PHONE); await settle(page);
    await page.keyboard.press('Escape'); await settle(page);
    m = await page.evaluate(() => ({ open: Boolean(document.querySelector('.ng-dx.is-open')), focus: document.activeElement.matches('[data-diagram-expand]'), zoom: document.querySelector('.ng-rt-stage .ng-dg-frame').dataset.zoom, locked: getComputedStyle(document.documentElement).overflow }));
    assert.deepEqual(m, { open: false, focus: true, zoom: stored, locked: 'visible' }, 'closed: focus back, the stored zoom as it was');
    assert.equal(await page.evaluate(() => document.querySelectorAll('[inert], [aria-hidden="true"].ng-shell, .ng-screen[aria-hidden]').length), 0, 'closed: nothing left inert or hidden');
    // Closed directly in landscape (the expand button is gone above 640 px): focus goes to a visible fallback.
    await page.getByRole('button', { name: 'Розгорнути схему' }).click(); await settle(page);
    await page.setViewportSize({ width: 844, height: 390 }); await settle(page);
    await page.keyboard.press('Escape'); await settle(page);
    m = await page.evaluate(() => ({ open: Boolean(document.querySelector('.ng-dx.is-open')), focus: document.activeElement.className, visible: document.activeElement.getClientRects().length > 0, inert: document.querySelectorAll('[inert]').length }));
    assert.deepEqual({ ...m, focus: /ng-te-button|ng-dg-frame/.test(m.focus) }, { open: false, focus: true, visible: true, inert: 0 }, 'closed in landscape: focus on «Текстом» (or the frame), visible');
    await page.setViewportSize(PHONE); await settle(page);
    await page.setViewportSize(DESK); await settle(page);
    await page.setViewportSize(PHONE); await settle(page);
    assert.equal(await frame.getAttribute('data-zoom'), stored, 'a resize keeps the stored zoom');
    await page.close();

    // ── Reorder rows: the handle and «↑» «↓» under the content ──
    page = await open(PHONE);
    await section(page, 'Налаштування з нуля');
    const items = page.locator('.ng-su-board .ng-reorder > .ng-reorder-item');
    m = await items.first().evaluate(li => {
      const box = el => el.getBoundingClientRect();
      const body = box(li.querySelector('.ng-reorder-body')), handle = box(li.querySelector('.ng-reorder-handle'));
      const moves = [...li.querySelectorAll('.ng-reorder-move')].map(box), choice = box(li.querySelector('.ng-su-choice'));
      const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const targets = [handle, ...moves, ...[...li.querySelectorAll('.ng-su-prompts [role="radio"]')].map(box)];
      return {
        below: handle.top >= body.bottom - 1 && moves.every(r => r.top >= body.bottom - 1),
        oneRow: moves.every(r => Math.abs(r.top - handle.top) < 2),
        clear: ![handle, ...moves].some(r => meets(r, choice)),
        fullWidth: choice.width > 0.8 * body.width,
        targets: targets.every(r => r.height >= 43.5 && r.width >= 43.5),
        inside: li.getBoundingClientRect().right <= innerWidth,
      };
    });
    assert.deepEqual(m, { below: true, oneRow: true, clear: true, fullWidth: true, targets: true, inside: true }, 'rows: content, then the handle and «↑» «↓»; 44 px targets; no overlap');
    const purpose = n => items.nth(n).locator('[data-purpose]').textContent();
    const first = await purpose(0);
    await items.first().getByRole('button', { name: /^Нижче/ }).click(); await settle(page);
    assert.equal(await purpose(1), first, '«↓» moves the card one place down');
    assert.ok(await page.evaluate(() => document.activeElement.matches('.ng-reorder-move') && document.activeElement.closest('.ng-reorder-item') === document.querySelectorAll('.ng-su-board .ng-reorder > .ng-reorder-item')[1]), 'focus follows the card');
    await page.close();

    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
  }
});
