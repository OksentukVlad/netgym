// Dragging ReorderList's rows in a real browser (round 10). Mouse input is
// Playwright's. Touch input goes through CDP's Input.dispatchTouchEvent, so it
// passes Chromium's own gesture handling: `touch-action`, native page scroll
// and pointercancel are the browser's, not a script's. It is still synthetic:
// no finger, no phone, no OS gestures.
//   - first to last and back on a 12-card deck, with auto-scroll, by touch and
//     by mouse on a phone viewport, by mouse on a desktop (.ng-screen scrolls);
//   - the page scrolls from a card's body on touch;
//   - the card follows, the rows make room, a slot shows the place, one
//     `onReorder` on the drop,
//     none on a drop where it started; Esc and pointercancel put it back;
//   - a click (and a tap) still grabs; controls inside a card and a locked deck
//     never drag; the firewall's two chain lists keep their own rules.
// Needs Playwright's Chromium (tools/browser.mjs): a missing browser fails,
// unless NETGYM_ALLOW_NO_BROWSER=1 allows a skip locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserSkip, launchChromium } from '../tools/browser.mjs';
import { edgeSpeed, landing, moveTo } from '../src/ui/reorder.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const missing = browserSkip();
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const ROW = '.ng-reorder-item', HANDLE = '.ng-reorder-handle', SLOT = '.ng-reorder-slot', LIVE = '.ng-reorder-live';

async function bundle() {
  const require = createRequire(path.join(root, 'shell/frontend/package.json'));
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'tests/browser/drag.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/drag', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"', __NETGYM_WEB__: 'false' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

test('landing: the place follows the card\'s centre, the slot is the gap the drop would fill', () => {
  const rows = [{ top: 0, bottom: 40 }, { top: 42, bottom: 82 }, { top: 84, bottom: 124 }];
  assert.deepEqual(landing(rows, 0, 20), { to: 0, top: 0, height: 40, step: 42 }, 'at home');
  assert.deepEqual(landing(rows, 0, 70), { to: 1, top: 42, height: 40, step: 42 }, 'past the next row\'s middle');
  assert.deepEqual(landing(rows, 0, 124), { to: 2, top: 84, height: 40, step: 42 }, 'the end of the list');
  assert.deepEqual(landing(rows, 2, 0), { to: 0, top: 0, height: 40, step: 42 }, 'the last row to the start');
  assert.equal(landing([{ top: 0, bottom: 40 }], 0, 20).step, 0, 'one row: nothing moves aside');
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'a', landing(rows, 0, 124).to), ['b', 'c', 'a'], 'the place is moveTo\'s index');
});

test('edgeSpeed: nothing in the middle, faster nearer the edge, up negative', () => {
  assert.equal(edgeSpeed(400, 0, 800), 0);
  assert.ok(edgeSpeed(790, 0, 800) > edgeSpeed(740, 0, 800) && edgeSpeed(740, 0, 800) > 0);
  assert.ok(edgeSpeed(5, 0, 800) < edgeSpeed(60, 0, 800) && edgeSpeed(60, 0, 800) < 0);
  assert.equal(edgeSpeed(900, 0, 800), edgeSpeed(800, 0, 800), 'past the edge is the top speed');
  assert.equal(edgeSpeed(10, 0, 0), 0, 'no area, no scroll');
});

test('dragging ReorderList rows in Chromium: mouse and touch, auto-scroll, cancel, click, controls, locked, chains', { skip: missing, timeout: 180000 }, async () => {
  const { js, css } = await bundle();
  const browser = await launchChromium();
  const errors = [];

  async function open({ viewport = PHONE, touch = false, reducedMotion = 'reduce', run }) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, reducedMotion });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width"><style>body{margin:0}${css}</style></head><body><div id="host"></div></body></html>`);
    await page.addScriptTag({ content: js });
    await page.evaluate(run);
    return page;
  }
  const shell = () => window.phone.mount(document.getElementById('host'));
  const section = async (page, title) => { await page.locator('.ng-card').filter({ has: page.locator('.ng-card-title', { hasText: title }) }).click(); };
  const deck = async opts => {
    const page = await open({ ...opts, run: shell });
    await section(page, 'Налаштування з нуля');
    await page.locator(ROW).nth(11).waitFor();
    return page;
  };
  const frames = (page, n = 2) => page.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  const cards = page => page.locator(`${ROW} .ng-su-cmd`).allTextContents();
  /** The centre of a row's handle, brought into view first. */
  const handleAt = async (page, i) => {
    const handle = page.locator(ROW).nth(i).locator(HANDLE);
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const pressed = page => page.locator(`${HANDLE}[aria-pressed="true"]`).count();
  const clean = async (page, label) => {
    const left = await page.evaluate(([row, slot]) => ({ transforms: [...document.querySelectorAll(row)].filter(r => r.style.transform).length, dragging: document.querySelectorAll('.is-dragging, .is-carrying').length, slots: document.querySelectorAll(slot).length }), [ROW, SLOT]);
    assert.deepEqual(left, { transforms: 0, dragging: 0, slots: 0 }, `${label}: nothing left of the drag`);
  };
  /** Holds until the slot is at that end of the (first) list: the viewport's edge has scrolled it there. */
  const untilEnd = async (page, want) => {
    for (let i = 0; i < 400; i++) {
      await frames(page, 2);
      if (await page.evaluate(([want, slot]) => {
        const list = document.querySelector('ol.ng-reorder'), mark = list.parentElement.querySelector(slot)?.getBoundingClientRect(), box = list.getBoundingClientRect();
        return Boolean(mark) && (want === 'last' ? Math.abs(mark.bottom - box.bottom) < 2 : Math.abs(mark.top - box.top) < 2);
      }, [want, SLOT])) return;
    }
    assert.fail(`the place never reached the ${want} end`);
  };
  const touchOf = async page => {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    return {
      start: ({ x, y }) => send('touchStart', [{ x, y, id: 1 }]),
      async to(from, to, steps = 12) {
        for (let i = 1; i <= steps; i++) {
          await send('touchMove', [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, id: 1 }]);
          await frames(page, 1);
        }
      },
      end: () => send('touchEnd', []),
      cancel: () => send('touchCancel', []),
    };
  };

  try {
    // ── Touch, a phone: first to last on the 12-card deck, then back ──
    let page = await deck({ touch: true });
    let before = await cards(page);
    assert.equal(before.length, 12, 'the router deck has 12 cards');
    let t = await touchOf(page);
    let at = await handleAt(page, 0);
    const startScroll = await page.evaluate(() => window.scrollY);
    await t.start(at);
    await t.to(at, { x: at.x, y: PHONE.height - 6 });
    await untilEnd(page, 'last');
    assert.ok(await page.evaluate(() => window.scrollY) > startScroll + 300, 'touch: the page scrolled under the card');
    assert.equal((await cards(page)).join(), before.join(), 'touch: the order waits for the drop');
    await t.end();
    await frames(page);
    assert.deepEqual(await cards(page), [...before.slice(1), before[0]], 'touch: first card to last, the others in order');
    await clean(page, 'touch');
    assert.ok(await page.evaluate(([row, handle]) => document.activeElement === [...document.querySelectorAll(row)].pop().querySelector(handle), [ROW, HANDLE]), 'touch: focus follows the card');
    await page.waitForFunction(sel => /позицію 12 з 12/.test(document.querySelector(sel).textContent), LIVE);

    before = await cards(page);
    at = await handleAt(page, 11);
    await t.start(at);
    await t.to(at, { x: at.x, y: 6 });
    await untilEnd(page, 'first');
    await t.end();
    await frames(page);
    assert.deepEqual(await cards(page), [before[11], ...before.slice(0, 11)], 'touch: last card back to first');
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth), true, 'touch: the page never got wider');

    // ── The page scrolls from a card's body; the handle keeps its touch ──
    before = await cards(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const body = await page.locator(`${ROW} .ng-reorder-body`).nth(2);
    await body.scrollIntoViewIfNeeded();
    const box = await body.boundingBox();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const scrolled = await page.evaluate(() => window.scrollY);
    await t.start(from);
    await t.to(from, { x: from.x, y: from.y - 240 });
    await t.end();
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => window.scrollY) > scrolled + 100, 'touch: a swipe on a card body scrolls the page');
    assert.equal((await cards(page)).join(), before.join(), 'touch: and moves nothing');
    await clean(page, 'body swipe');
    assert.deepEqual(await page.evaluate(([row, handle]) => ({ handle: getComputedStyle(document.querySelector(handle)).touchAction, row: getComputedStyle(document.querySelector(row)).touchAction, body: getComputedStyle(document.body).touchAction }), [ROW, HANDLE]),
      { handle: 'none', row: 'auto', body: 'auto' }, 'touch-action: none on the handle only');

    // ── pointercancel puts it back; a tap still grabs ──
    await page.evaluate(() => window.scrollTo(0, 0));
    at = await handleAt(page, 1);
    await t.start(at);
    await t.to(at, { x: at.x, y: at.y + 200 }, 6);
    await frames(page);
    assert.equal(await page.locator(`${ROW}.is-dragging`).count(), 1, 'touch: dragging');
    await t.cancel();
    await frames(page);
    assert.equal((await cards(page)).join(), before.join(), 'pointercancel: the card is back');
    await clean(page, 'pointercancel');
    await page.waitForFunction(sel => /^Скасовано/.test(document.querySelector(sel).textContent), LIVE);
    at = await handleAt(page, 3);
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForFunction(sel => document.querySelectorAll(sel).length === 1, `${HANDLE}[aria-pressed="true"]`);
    assert.equal((await cards(page)).join(), before.join(), 'tap: grabs, moves nothing');
    await page.context().close();

    // ── Mouse on a phone viewport: first to last; the card follows, a line shows the place ──
    page = await deck({ viewport: PHONE });
    before = await cards(page);
    at = await handleAt(page, 0);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + 200, { steps: 8 });
    await frames(page);
    const during = await page.evaluate(([row, slot]) => {
      const card = document.querySelector(`${row}.is-dragging`), mark = document.querySelector(slot), box = mark.getBoundingClientRect();
      const rows = [...document.querySelectorAll(row)].filter(r => r !== card);
      return {
        lifted: getComputedStyle(card).filter, z: getComputedStyle(card).zIndex, pressed: card.querySelector('[aria-pressed="true"]') !== null, hidden: mark.getAttribute('aria-hidden'), top: card.getBoundingClientRect().top,
        clear: rows.every(r => { const b = r.getBoundingClientRect(); return b.bottom <= box.top + 1 || b.top >= box.bottom - 1; }), height: Math.abs(box.height - card.getBoundingClientRect().height) < 1,
        aside: rows.filter(r => r.style.transform).length > 0, instant: rows.every(r => getComputedStyle(r).transitionDuration === '0s'),
      };
    }, [ROW, SLOT]);
    assert.ok(during.lifted.includes('drop-shadow') && during.z === '2' && during.pressed && during.hidden === 'true', JSON.stringify(during));
    assert.ok(during.clear && during.height && during.aside, `the rows make room: a card-high slot, no row on it: ${JSON.stringify(during)}`);
    assert.ok(during.instant, 'reduced motion: the rows jump, they don\'t glide');
    await page.mouse.move(at.x, at.y + 260);
    await frames(page);
    assert.ok(Math.abs(await page.evaluate(sel => document.querySelector(`${sel}.is-dragging`).getBoundingClientRect().top, ROW) - during.top - 60) < 2, 'mouse: the card follows the pointer');
    await page.mouse.move(at.x, PHONE.height - 6, { steps: 4 });
    await untilEnd(page, 'last');
    await page.mouse.up();
    await frames(page);
    assert.deepEqual(await cards(page), [...before.slice(1), before[0]], 'mouse, phone: first card to last');
    assert.equal(await pressed(page), 0, 'mouse: the release is no click: nothing grabbed');
    await clean(page, 'mouse');
    await page.context().close();

    // ── Mouse on a desktop: .ng-screen scrolls, the page doesn't; Esc; click; ↑ ↓ and keys after a drag ──
    page = await deck({ viewport: DESK, reducedMotion: 'no-preference' });
    assert.ok(await page.evaluate(() => document.querySelector('.ng-screen').scrollHeight > document.querySelector('.ng-screen').clientHeight), 'desktop: the deck overflows its area');
    before = await cards(page);
    at = await handleAt(page, 0);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, DESK.height - 4, { steps: 6 });
    await untilEnd(page, 'last');
    assert.deepEqual(await page.evaluate(() => ({ screen: document.querySelector('.ng-screen').scrollTop > 0, page: window.scrollY })), { screen: true, page: 0 }, 'desktop: the screen area scrolled');
    assert.notEqual(await page.evaluate(sel => getComputedStyle(document.querySelector(`${sel}:not(.is-dragging)`)).transitionDuration, ROW), '0s', 'motion allowed: the rows glide aside');
    await page.keyboard.press('Escape');
    await frames(page);
    await clean(page, 'Esc');
    assert.equal((await cards(page)).join(), before.join(), 'Esc: the card is back');
    await page.mouse.move(at.x, 300);
    await frames(page);
    await clean(page, 'after Esc');
    await page.mouse.up();
    await frames(page);
    assert.equal(await pressed(page), 0, 'Esc: the release that follows is no click');
    await page.waitForFunction(sel => /^Скасовано/.test(document.querySelector(sel).textContent), LIVE);

    at = await handleAt(page, 2);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 1, at.y + 2);
    await page.mouse.up();
    await frames(page);
    assert.ok(await page.locator(ROW).nth(2).locator(`${HANDLE}[aria-pressed="true"]`).count() === 1, 'click: a press that barely moves grabs');
    await page.keyboard.press('ArrowDown');
    await frames(page);
    assert.deepEqual(await cards(page), moveTo(before, before[2], 3), 'keys: a click\'s grab still carries');
    await page.keyboard.press('Space');
    await frames(page);
    assert.equal(await pressed(page), 0, 'keys: dropped');

    // A grabbed card dragged: the drag takes over, a drop leaves nothing grabbed.
    before = await cards(page);
    await page.locator(ROW).nth(4).locator(HANDLE).focus();
    await page.keyboard.press('Space');
    at = await handleAt(page, 4);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const next = await page.locator(ROW).nth(5).boundingBox();
    await page.mouse.move(at.x, next.y + next.height, { steps: 5 });
    await frames(page);
    await page.mouse.up();
    await frames(page);
    assert.deepEqual(await cards(page), moveTo(before, before[4], 5), 'a grabbed card drags too');
    assert.equal(await pressed(page), 0, 'and the drop ends the grab');
    before = await cards(page);
    await page.locator(ROW).nth(1).locator('.ng-reorder-move').last().click();
    await frames(page);
    assert.deepEqual(await cards(page), moveTo(before, before[1], 2), '↓ still moves after a drag');
    await page.context().close();

    // ── A plain list: one onReorder, none without a move; controls and other buttons don't drag ──
    page = await open({ viewport: DESK, run: () => window.dragList.mount(document.getElementById('host')) });
    const calls = () => page.evaluate(() => window.dragList.calls);
    const rows = () => page.locator(`${ROW} [data-row] > span`).allTextContents();
    at = await handleAt(page, 0);
    const third = await page.locator(ROW).nth(2).boundingBox();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, third.y + third.height - 2, { steps: 10 });
    await frames(page);
    assert.equal((await calls()).length, 0, 'no commit before the drop');
    await page.mouse.up();
    await frames(page);
    assert.deepEqual(await calls(), [{ ids: ['row-2', 'row-3', 'row-1', 'row-4', 'row-5', 'row-6'], moved: 'row-1' }], 'one onReorder, with the moved row');
    await page.waitForFunction(sel => /row-1: покладено на позицію 3 з 6/.test(document.querySelector(sel).textContent), LIVE);

    at = await handleAt(page, 3);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + 12, { steps: 3 });
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await frames(page);
    await page.mouse.up();
    await frames(page);
    assert.equal((await calls()).length, 1, 'a drop where it started commits nothing');
    assert.equal(await pressed(page), 0, 'and is no click');
    await page.waitForFunction(sel => /покладено на позицію 4 з 6/.test(document.querySelector(sel).textContent), LIVE);

    for (const [what, target] of [['a choice', '[role="radio"]'], ['a field', 'input'], ['the card', '[data-row] > span'], ['«↓»', '.ng-reorder-move']]) {
      const b = await page.locator(ROW).nth(1).locator(target).last().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + 200, { steps: 5 });
      await frames(page);
      assert.equal(await page.locator(`${ROW}.is-dragging`).count(), 0, `${what} starts no drag`);
      await page.mouse.up();
    }
    assert.equal((await calls()).length, 1, 'controls moved nothing');
    at = await handleAt(page, 1);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(at.x, at.y + 80, { steps: 3 });
    await frames(page);
    assert.equal(await page.locator(`${ROW}.is-dragging`).count(), 0, 'only the main button drags');
    await page.mouse.up({ button: 'right' });
    await page.context().close();

    // ── Locked: the order passed, the cards have no handle and a drag does nothing ──
    page = await open({ viewport: PHONE, run: () => { window.setup.mount(document.getElementById('host'), 'dr-1'); window.setup.toModes('dr-1'); } });
    const locked = () => page.locator('.ng-su-modes-deck .ng-su-cmd').allTextContents();
    before = await locked();
    assert.equal(before.length, 12, 'the locked deck is on screen');
    assert.equal(await page.locator(HANDLE).count(), 0, 'locked: no handles');
    const card = page.locator('.ng-su-modes-deck .ng-su-own-item').first();
    await card.scrollIntoViewIfNeeded();
    const cb = await card.boundingBox();
    await page.mouse.move(cb.x + 10, cb.y + 10);
    await page.mouse.down();
    await page.mouse.move(cb.x + 10, cb.y + 300, { steps: 6 });
    await frames(page);
    assert.equal(await page.locator('.is-dragging').count(), 0, 'locked: no drag');
    await page.mouse.up();
    assert.deepEqual(await locked(), before, 'locked: the order stays');
    await page.context().close();

    // ── The firewall's two lists: a drag stays in its own, on a phone by touch ──
    page = await open({ viewport: PHONE, touch: true, run: shell });
    await section(page, 'Фаєрвол');
    await page.locator('.ng-bar-sheet-button').click();
    await page.getByRole('radio', { name: 'Порядок правил', exact: true }).click();
    await page.getByRole('radio', { name: 'Увесь фільтр', exact: true }).click();
    await page.locator('.ng-bar-sheet-done').click();
    await page.locator('.ng-fwo ol.ng-reorder').nth(1).waitFor();
    const chains = () => page.locator('.ng-fwo ol.ng-reorder').evaluateAll(lists => lists.map(ol => [...ol.querySelectorAll('.ng-reorder-handle')].map(h => h.getAttribute('aria-label').replace(/^\d+\. Переставити: /, ''))));
    const [input, forward] = await chains();
    assert.deepEqual([input.length, forward.length], [5, 4], 'two lists');
    t = await touchOf(page);
    const firstInput = page.locator('.ng-fwo ol.ng-reorder').first().locator(HANDLE).first();
    await firstInput.scrollIntoViewIfNeeded();
    const fb = await firstInput.boundingBox();
    at = { x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 };
    await t.start(at);
    await t.to(at, { x: at.x, y: PHONE.height - 6 }, 10);
    await untilEnd(page, 'last');
    // The list scrolled well above the pointer: the card stays in its own list.
    await page.evaluate(() => window.scrollBy(0, 300));
    await frames(page, 3);
    assert.ok(await page.evaluate(sel => { const c = document.querySelector(`${sel}.is-dragging`).getBoundingClientRect(); return (c.top + c.bottom) / 2 <= document.querySelector('.ng-fwo ol.ng-reorder').getBoundingClientRect().bottom + 1; }, ROW), 'firewall: the card can\'t leave its list');
    await t.end();
    await frames(page);
    const [input2, forward2] = await chains();
    assert.deepEqual(input2, [...input.slice(1), input[0]], 'firewall: the rule went to the end of its own list');
    assert.deepEqual(forward2, forward, 'firewall: the other list is untouched');
    await page.context().close();

    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
  }
});
