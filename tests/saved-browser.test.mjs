// Keeping progress on this device (spec save v2) in Chromium: the web build's
// shell at http://netgym.test/netgym/, with a real localStorage, reloads and a
// second tab:
//   - answer, refresh: the answer, the verdict and the ✓ are back;
//   - a refresh right after typing: pagehide has flushed; hiding the page too;
//   - a shared link wins over a saved place; the plain address opens the start
//     screen and a section opens where it was;
//   - «Почати спочатку»: there only with something to clear, confirmed, gone
//     afterwards, the preferences staying; another open tab follows;
//   - a corrupted blob and a failing localStorage: the app works as before;
//   - a screen that fails to render: one line and the ways out, with the bar
//     alive; recovery by each of them, on the web and in the Windows app;
//   - each section, clicked through by a seeded walk: nothing real is rejected,
//     and nothing restored breaks its screen.
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
const BASE = 'http://netgym.test/netgym/';
const KEY = 'netgym.v1', GEN_KEY = 'netgym.gen';
const CONFIRM = 'Стерти всі відповіді та позначки ✓, збережені на цьому пристрої? Налаштування залишаться.';

async function bundle() {
  const require = createRequire(path.join(root, 'shell/frontend/package.json'));
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'tests/browser/saved.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/saved', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"', __NETGYM_WEB__: 'true' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

/** A seeded walk through a section: what a learner's taps and typing reach. */
async function walkSection(page, seed, steps) {
  let value = seed >>> 0;
  const next = n => { value = (Math.imul(1664525, value) + 1013904223) >>> 0; return value % n; };
  const words = ['10.0.0.0', '192.168.1.1', '255.255.255.0', '/24', '24', '20', 'ip route 10.0.0.0 255.255.255.0 10.0.0.2', 'x'];
  for (let i = 0; i < steps; i += 1) {
    const controls = page.locator('.ng-screen :is(button, [role="radio"], input[type="text"], input:not([type]), textarea):visible:not([disabled]):not([aria-disabled="true"])');
    const total = await controls.count();
    if (!total) return;
    const control = controls.nth(next(total));
    const editable = await control.evaluate(el => ['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.readOnly).catch(() => false);
    if (editable) await control.fill(words[next(words.length)], { timeout: 1000 }).catch(() => {});
    else await control.click({ timeout: 1000 }).catch(() => {});
  }
}

test('saved progress in Chromium: refresh, flush, links, clearing, a second tab, bad storage, a failed screen, every section', { skip: missing, timeout: 420000 }, async () => {
  const { js, css } = await bundle();
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>body{margin:0}${css}</style></head><body><div id="host"></div><script src="app.js"></script></body></html>`;
  const browser = await launchChromium();
  const errors = [];
  const newContext = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await context.route('http://netgym.test/**', route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/netgym/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (pathname === '/netgym/app.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: js });
      return route.fulfill({ status: 404, body: '' });
    });
    return context;
  };
  const newPage = async context => {
    const page = await context.newPage();
    page.on('pageerror', e => { if (!e.message.includes('injected render failure')) errors.push(e.message); });
    return page;
  };
  const settle = async page => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(60); };
  const go = async (page, url) => { await page.goto(url); await page.locator('.ng-home, .ng-screen').first().waitFor(); await settle(page); };
  const reload = async page => { await page.reload(); await page.locator('.ng-home, .ng-screen').first().waitFor(); await settle(page); };
  const stored = (page, key = KEY) => page.evaluate(k => localStorage.getItem(k), key);
  const blob = async page => JSON.parse(await stored(page));
  const clean = async page => assert.deepEqual((await page.evaluate(() => window.saved.report())).dropped, []);
  const reset = page => page.getByRole('button', { name: 'Почати спочатку' });
  const check = page => page.getByRole('button', { name: 'Перевірити' }).first();
  const levelOne = `${BASE}#/ip-mask?level=1&seed=42`;
  try {
    // ── Answer, refresh: the answer and the ✓ are back ──
    let context = await newContext();
    let page = await newPage(context);
    await go(page, levelOne);
    await page.locator('.ng-screen input').first().fill('1');
    await check(page).click();
    await settle(page);
    await page.waitForTimeout(600);
    assert.ok(await stored(page), 'the debounced write came');
    await clean(page);
    const wrong = await page.locator('.ng-screen').innerText();
    await reload(page);
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '1', 'the typed answer');
    assert.equal(await page.locator('.ng-screen').innerText(), wrong, 'the same screen, its wrong verdict too');
    const solution = await page.evaluate(() => window.saved.maskAnswer());
    const fields = page.locator('.ng-screen input');
    const values = Object.values(solution);
    for (let i = 0; i < await fields.count(); i += 1) await fields.nth(i).fill(String(values[i]));
    await check(page).click();
    await settle(page);
    assert.equal((await page.locator('.ng-screen .ng-done').count()) > 0, true, 'solved: the level has its ✓');
    await reload(page);
    assert.ok((await page.locator('.ng-screen .ng-done').count()) > 0, 'the ✓ is back');
    await clean(page);

    // ── A refresh right after typing: pagehide flushes ──
    await page.getByRole('radio', { name: /^3 · / }).first().click();
    await settle(page);
    const typed = page.locator('.ng-screen input').first();
    await typed.fill('10.1.2.3');
    await page.reload();
    await page.locator('.ng-screen input').first().waitFor();
    await settle(page);
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '10.1.2.3', 'no 500 ms had passed: pagehide wrote it');

    // ── Hiding the page flushes too, and a visible page doesn't ──
    await page.locator('.ng-screen input').first().fill('10.9.9.9');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.ok(!(await stored(page)).includes('10.9.9.9'), 'still visible: the debounce decides');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    assert.ok((await stored(page)).includes('10.9.9.9'), 'hidden: written at once');

    // ── The plain address: the start screen first, the section where it was ──
    await go(page, BASE);
    assert.ok(await page.locator('.ng-home').count(), 'the start screen is the first view');
    await page.getByRole('button', { name: /IP-адреси: маска/ }).click();
    await settle(page);
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '10.9.9.9');
    assert.match(await page.evaluate(() => decodeURIComponent(location.hash)), /level=3/);

    // ── A shared link wins over the saved place, and keeps the saved vendor ──
    await page.getByRole('button', { name: /Розділи/ }).first().click();
    await settle(page);
    await page.getByRole('button', { name: /Маршрутизація/ }).click();
    await settle(page);
    await page.getByRole('radio', { name: 'MikroTik' }).first().click();
    await page.waitForTimeout(600);
    assert.equal((await blob(page)).prefs.syntax, 'routeros');
    await go(page, `${BASE}#/ip-mask?level=2&seed=7`);
    assert.match(await page.evaluate(() => decodeURIComponent(location.hash)), /level=2&seed=7/, 'the link\'s task');
    await page.getByRole('radio', { name: /^3 · / }).first().click();
    await settle(page);
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '10.9.9.9', 'the other level is as it was');
    await go(page, `${BASE}#/dhcp?ex=server&level=1&seed=5`);
    assert.match(await page.evaluate(() => decodeURIComponent(location.hash)), /syntax=routeros/, 'a link without a vendor keeps the saved one');

    // ── «Почати спочатку» ──
    await page.getByRole('button', { name: /Розділи/ }).first().click();
    await settle(page);
    await page.getByRole('button', { name: 'Світла тема' }).click();
    await page.waitForTimeout(600);
    const button = reset(page);
    assert.equal(await button.count(), 1);
    assert.equal(await button.evaluate(el => [el.tagName, el.previousElementSibling?.textContent, el.previousElementSibling?.previousElementSibling?.tagName].join('|')), 'BUTTON| · |A', 'a button after the notices link, « · » between');
    const said = [];
    page.once('dialog', dialog => { said.push(dialog.message()); dialog.dismiss(); });
    await button.click();
    await settle(page);
    assert.deepEqual(said, [CONFIRM]);
    assert.equal(await reset(page).count(), 1, 'dismissed: nothing happens');
    assert.ok((await blob(page)).instances);
    page.once('dialog', dialog => dialog.accept());
    await button.click();
    await settle(page);
    assert.equal(await reset(page).count(), 0, 'it vanishes');
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'ng-home-title', 'focus goes to the heading, not nowhere');
    await page.waitForTimeout(600);
    let left = await blob(page);
    assert.deepEqual([left.instances, left.places, left.done, left.prefs.theme, left.prefs.syntax], [{}, {}, {}, 'light', 'routeros'], 'answers gone, settings kept');
    assert.equal(await stored(page, GEN_KEY), '1');
    await reload(page);
    assert.equal(await reset(page).count(), 0, 'and it stays so');
    assert.equal(await page.locator('.ng-home').getAttribute('data-theme'), 'light', 'the theme stayed');
    await page.getByRole('button', { name: /IP-адреси: маска/ }).click();
    await settle(page);
    assert.equal(await page.locator('.ng-screen .ng-done').count(), 0, 'no ✓ left');
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '');
    await context.close();

    // ── Another open tab follows a reset, and its pending work can't undo it ──
    context = await newContext();
    const tabA = await newPage(context), tabB = await newPage(context);
    await go(tabA, levelOne);
    await tabA.locator('.ng-screen input').first().fill('1');
    await tabA.waitForTimeout(600);
    await go(tabB, BASE);
    assert.equal(await reset(tabB).count(), 1, 'the second tab loaded the first one\'s progress');
    await tabA.locator('.ng-screen input').first().fill('12');
    tabB.once('dialog', dialog => dialog.accept());
    await reset(tabB).click();
    await settle(tabB);
    await settle(tabA);
    assert.equal(await tabA.locator('.ng-screen input').first().inputValue(), '', 'the open screen started again');
    await tabA.waitForTimeout(600);
    const after = await stored(tabA);
    assert.ok(!(after ?? '').includes('"12"'), 'the pending write didn\'t bring it back');
    await tabB.reload();
    await tabB.locator('.ng-home').waitFor();
    await context.close();

    // ── A corrupted blob starts clean; a failing localStorage changes nothing ──
    context = await newContext();
    page = await newPage(context);
    await go(page, BASE);
    await page.evaluate(k => localStorage.setItem(k, '{"version":1,"inst'), KEY);
    await reload(page);
    assert.equal(await reset(page).count(), 0);
    await page.getByRole('button', { name: /IP-адреси: маска/ }).click();
    await settle(page);
    await page.locator('.ng-screen input').first().fill('1');
    await page.waitForTimeout(600);
    assert.ok((await stored(page)).startsWith('{"version":1'), 'a good write replaces it');
    await context.close();
    for (const script of [
      () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); },
      () => { for (const name of ['getItem', 'setItem', 'removeItem']) Storage.prototype[name] = () => { throw new Error('quota'); }; },
    ]) {
      context = await newContext();
      await context.addInitScript(script);
      page = await newPage(context);
      await go(page, levelOne);
      await page.locator('.ng-screen input').first().fill('1');
      await check(page).click();
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: /Розділи/ }).first().click();
      await settle(page);
      await page.getByRole('button', { name: /IP-адреси: маска/ }).click();
      await settle(page);
      assert.equal(await page.locator('.ng-screen input').first().inputValue(), '1', 'the session works as it always did');
      await page.getByRole('button', { name: /Розділи/ }).first().click();
      await settle(page);
      page.once('dialog', dialog => dialog.accept());
      await reset(page).click();
      await settle(page);
      assert.equal(await reset(page).count(), 0, 'clearing works on the session alone');
      await context.close();
    }

    // ── Clearing on a phone keeps the footer in view, focus on the heading ──
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route('http://netgym.test/**', route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/netgym/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (pathname === '/netgym/app.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: js });
      return route.fulfill({ status: 404, body: '' });
    });
    page = await newPage(context);
    await go(page, levelOne);
    await page.locator('.ng-screen input').first().fill('1');
    await page.waitForTimeout(600);
    await page.locator('.ng-bar-back').click();
    await settle(page);
    await reset(page).scrollIntoViewIfNeeded();
    const scrolled = await page.evaluate(() => document.scrollingElement.scrollTop);
    assert.ok(scrolled > 0, 'the footer is below the first view');
    page.once('dialog', dialog => dialog.accept());
    await reset(page).click();
    await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'ng-home-title');
    // The page is a line shorter now, so the scroll may settle by that line; it doesn't go to the top.
    const view = await page.evaluate(() => {
      const box = document.querySelector('.ng-home-footer a').getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: window.innerHeight, scrollTop: document.scrollingElement.scrollTop };
    });
    assert.ok(view.scrollTop > scrolled - 60, `the page stayed down: ${view.scrollTop} of ${scrolled}`);
    assert.ok(view.top >= 0 && view.bottom <= view.height, 'the footer is still in view: the control is seen to go');
    await context.close();

    // ── A screen that fails to render: the line, the ways out, and recovery by each ──
    const failed = page => page.locator('.ng-screen-failed');
    const goBack = page => page.getByRole('button', { name: 'Повернутися до розділів' });
    const fail = async (page, on) => page.evaluate(value => { if (value) localStorage.setItem('test.fail', '1'); else localStorage.removeItem('test.fail'); }, on);
    context = await newContext();
    page = await newPage(context);
    await go(page, levelOne);
    await page.locator('.ng-screen input').first().fill('1');
    await page.getByRole('button', { name: 'Світла тема' }).click().catch(() => {});
    await page.waitForTimeout(600);
    await fail(page, true);
    await reload(page);
    assert.equal(await failed(page).locator('p').innerText(), 'Цей розділ не відкрився.');
    assert.equal(await page.locator('.ng-bar-back').count(), 1, 'the bar stays alive above it');
    assert.equal(await page.locator('.ng-screen-failed').getByRole('button', { name: 'Почати спочатку' }).count(), 1);
    // Back to the sections; nothing was dropped by itself.
    await goBack(page).click();
    await page.locator('.ng-home').waitFor();
    await settle(page);
    await fail(page, false);
    await page.getByRole('button', { name: /IP-адреси: маска/ }).click();
    await settle(page);
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '1', 'the saved answer is still there');
    // The bar's «←» works from the fallback too.
    await fail(page, true);
    await reload(page);
    assert.equal(await failed(page).count(), 1);
    await page.locator('.ng-bar-back').click();
    await page.locator('.ng-home').waitFor();
    await settle(page);
    // Navigating within the section resets it: a new place tries the screen again.
    await page.getByRole('button', { name: /IP-адреси: маска/ }).click();
    await settle(page);
    assert.equal(await failed(page).count(), 1, 'still failing, still contained');
    await fail(page, false);
    await page.evaluate(() => { location.hash = '#/ip-mask?level=3&seed=7'; });
    await settle(page);
    assert.equal(await failed(page).count(), 0, 'the new place opened');
    assert.ok(await page.locator('.ng-screen input').count());
    // «Почати спочатку» from the fallback: confirmed, the screen starts again, settings stay.
    await fail(page, true);
    await reload(page);
    const prefsBefore = (await blob(page)).prefs;
    const clearHere = page.locator('.ng-screen-failed').getByRole('button', { name: 'Почати спочатку' });
    const asked = [];
    page.once('dialog', dialog => { asked.push(dialog.message()); dialog.dismiss(); });
    await clearHere.click();
    await settle(page);
    assert.deepEqual(asked, [CONFIRM], 'the same confirmation');
    assert.equal(await failed(page).count(), 1, 'dismissed: nothing happens');
    await fail(page, false);
    page.once('dialog', dialog => dialog.accept());
    await clearHere.click();
    await settle(page);
    assert.equal(await failed(page).count(), 0, 'clearing resets it');
    assert.equal(await page.locator('.ng-screen input').first().inputValue(), '');
    await page.waitForTimeout(600);
    const after2 = await blob(page);
    assert.deepEqual([Object.keys(after2.instances), after2.prefs], [[], prefsBefore], 'answers gone, settings kept');
    await context.close();

    // The Windows app: the same box, without the clear action, and no saving.
    context = await newContext();
    await context.addInitScript(() => { window.wails = {}; localStorage.setItem('test.fail', '1'); });
    page = await newPage(context);
    await go(page, levelOne);
    assert.equal(await failed(page).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Почати спочатку' }).count(), 0, 'no clear action in the app');
    await goBack(page).click();
    await page.locator('.ng-home').waitFor();
    assert.equal(await stored(page), null, 'the app saves nothing');
    await context.close();

    // ── Every section: real work is accepted, and a reload shows it without error ──
    context = await newContext();
    page = await newPage(context);
    // An entry for every exercise, so each stores real work, a check's result too: what the
    // section's validators must let through. Too strict a check here means lost progress.
    const entries = ['ip-calculator', 'ip-mask', 'ip-binary', 'routing', 'routing?view=fault&level=1', 'dhcp', 'dhcp?ex=server&level=3',
      'dhcp?ex=nat&level=1', 'dhcp?ex=nat&level=2', 'dhcp?ex=fault&level=2', 'checks', 'checks?ex=ladder&level=2', 'checks?ex=claims&level=1',
      'firewall', 'firewall?ex=predict&level=2', 'firewall?ex=order', 'vlan', 'vlan?ex=ports', 'vlan?ex=route&task=2', 'vlan?ex=faults&level=2', 'setup'];
    const steps = Number(process.env.NETGYM_SAVED_WALK ?? 10);
    for (const [i, id] of entries.entries()) {
      await go(page, `${BASE}#/${id}`);
      await walkSection(page, 1000 + i, steps);
      await check(page).click({ timeout: 1000 }).catch(() => {});
      await walkSection(page, 2000 + i, 4);
      await settle(page);
      await reload(page);
      const report = await page.evaluate(() => window.saved.report());
      assert.deepEqual([report.dropped, report.droppedPlaces], [[], []], id);
      assert.ok((await page.locator('.ng-screen, .ng-home').first().innerText()).length > 0, `${id} renders`);
      assert.equal(await page.locator('.ng-screen-failed').count(), 0, `${id}: what was restored opens`);
      assert.deepEqual(errors, [], id);
    }
    const reached = await page.evaluate(k => Object.keys(JSON.parse(localStorage.getItem(k)).instances).map(key => JSON.parse(key).exerciseId), KEY);
    assert.ok(new Set(reached).size >= 15, `the walks reached most exercises: ${[...new Set(reached)].sort()}`);
    await context.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
