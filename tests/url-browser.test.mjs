// Where you are, in the URL (round 6, spec URL v2.1), in Chromium: the whole
// NetGym target (tests/browser/url.jsx) served at http://netgym.test/netgym/,
// so the page has a real address, history and reload:
//   - a cold load of a link: that section, exercise, level, task and vendor;
//     the start screen's entry synthesized before it (Back reaches it);
//   - a refresh: the same task, without its answers, and no extra entry;
//   - Back and Forward between the start screen and a section;
//   - a place change replaces the entry; section navigation pushes one;
//   - «← Розділи»: back to the start screen's entry, adding none;
//   - a hash typed in (hashchange): applied once, its entry gets our state;
//   - a garbage link: the section's defaults and the learner's own vendor;
//     an unknown section: the start screen, «#/»;
//   - the /netgym/ subpath kept throughout;
//   - repair (Astra 1, 2): «←» counts the history's entries (typed hashes for
//     the same section, an edit after a refresh); a link's seed is applied
//     once, so Back and Forward show the URL's task.
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

async function bundle() {
  const require = createRequire(path.join(root, 'shell/frontend/package.json'));
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'tests/browser/url.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/url', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"', __NETGYM_WEB__: 'false' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

test('the URL in Chromium: a link, a refresh, Back and Forward, «←», a typed hash, garbage, the /netgym/ subpath', { skip: missing, timeout: 180000 }, async () => {
  const { js, css } = await bundle();
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>body{margin:0}${css}</style></head><body><div id="host"></div><script src="app.js"></script></body></html>`;
  const browser = await launchChromium();
  const errors = [];
  const newPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://netgym.test/**', route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/netgym/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (pathname === '/netgym/app.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: js });
      return route.fulfill({ status: 404, body: '' });
    });
    return page;
  };
  const settle = async page => {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(80);
  };
  const where = page => page.evaluate(() => ({
    path: location.pathname, hash: decodeURIComponent(location.hash), length: history.length, depth: history.state?.depth ?? null,
    home: Boolean(document.querySelector('.ng-home')), title: document.querySelector('.ng-bar-section')?.textContent ?? null,
    checked: [...document.querySelectorAll('.ng-screen [role="radio"][aria-checked="true"], .ng-bar [role="radio"][aria-checked="true"]')].map(r => r.textContent.trim()),
  }));
  const task = page => page.evaluate(() => document.querySelector('.ng-screen')?.innerText ?? '');
  const go = async (page, url) => { await page.goto(url); await page.locator('.ng-home, .ng-screen').first().waitFor(); await settle(page); };
  const typeHash = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, hash); await settle(page); };
  const back = async page => { await page.goBack(); await settle(page); };
  const forward = async page => { await page.goForward(); await settle(page); };
  const has = (list, prefix) => list.some(t => t.startsWith(prefix));
  try {
    // ── A cold load of a link ──
    const page = await newPage();
    const link = '#/dhcp?ex=server&level=2&seed=11&syntax=routeros';
    await go(page, BASE + link);
    let s = await where(page);
    assert.equal(s.path, '/netgym/', 'the subpath is kept');
    assert.equal(s.hash, link, 'the link is already canonical');
    assert.ok(!s.home && s.title === 'DHCP і NAT', 'the section opens');
    assert.ok(has(s.checked, 'DHCP-сервер') && has(s.checked, 'MikroTik') && has(s.checked, 'Рівень 2'), `exercise, vendor and level from the link: ${s.checked}`);
    assert.equal(s.depth, 1);
    const opened = s.length;
    const first = await task(page);
    assert.ok(first.length > 40);

    // ── A refresh: the same task, its answers gone, no new entry ──
    const field = page.locator('.ng-screen input[type="text"]').first();
    await field.fill('192.168.1.77');
    await page.reload();
    await page.locator('.ng-screen').waitFor(); await settle(page);
    s = await where(page);
    assert.deepEqual([s.path, s.hash, s.length, s.depth], ['/netgym/', link, opened, 1], 'a refresh keeps the URL and the history');
    assert.equal(await task(page), first, 'the same task after a refresh');
    assert.equal(await page.locator('.ng-screen input[type="text"]').first().inputValue(), '', 'its answer is not kept');

    // ── Back reaches the start screen; Forward returns ──
    await back(page);
    s = await where(page);
    assert.deepEqual([s.home, s.path, s.hash, s.depth], [true, '/netgym/', '#/', 0], 'Back from a link: the start screen');
    await forward(page);
    s = await where(page);
    assert.ok(!s.home && s.hash === link && has(s.checked, 'Рівень 2'), 'Forward: the section again');
    assert.equal(await task(page), first);

    // ── A place change replaces the entry ──
    await page.getByRole('radio', { name: /^Рівень 3/ }).click(); await settle(page);
    s = await where(page);
    assert.match(s.hash, /^#\/dhcp\?ex=server&level=3&seed=\d+&syntax=routeros$/, 'the level in the URL');
    assert.equal(s.length, opened, 'no new entry for a place change');
    const level3 = s.hash;
    const level3Task = await task(page);
    await back(page);
    assert.ok((await where(page)).home, 'Back still leaves the section in one step');
    await forward(page);
    s = await where(page);
    assert.equal(s.hash, level3);
    assert.equal(await task(page), level3Task, 'Forward: the replaced place');

    // ── Section navigation pushes; «← Розділи» goes back to the start screen's entry ──
    await back(page);
    await page.locator('.ng-card').filter({ has: page.locator('.ng-card-title', { hasText: 'Фаєрвол' }) }).click(); await settle(page);
    s = await where(page);
    assert.match(s.hash, /^#\/firewall\?ex=predict&level=1&seed=\d+$/, 'a card pushes the section with its first place');
    assert.equal(s.depth, 1);
    const firewall = s.hash;
    const pushed = s.length;
    await page.locator('.ng-bar-back').click(); await settle(page);
    s = await where(page);
    assert.deepEqual([s.home, s.hash, s.length], [true, '#/', pushed], '«←»: the start screen, no new entry');
    await forward(page);
    assert.equal((await where(page)).hash, firewall, 'Forward after «←»: the section again, the same task');

    // ── A typed hash: applied once, our state on its entry ──
    const before = await page.evaluate(() => window.randomCalls);
    await typeHash(page, '#/dhcp?ex=nat&level=2');
    s = await where(page);
    assert.match(s.hash, /^#\/dhcp\?ex=nat&level=2&seed=\d+&syntax=routeros$/, 'the typed place, with its new seed written');
    assert.equal(await page.evaluate(() => window.randomCalls) - before, 1, 'decoded once (one seed drawn): popstate and hashchange are one change');
    assert.ok(has(s.checked, 'Що бачить сайт') && has(s.checked, 'Рівень 2') && has(s.checked, 'MikroTik'));
    assert.deepEqual([s.depth, s.length], [2, pushed + 1], 'a typed hash is one entry, two from the start screen');
    // The browser's pair for one change, at once (before React renders): only the first is applied.
    const pair = await page.evaluate(() => {
      const start = window.randomCalls;
      history.pushState(null, '', '#/dhcp?ex=nat&level=1');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return window.randomCalls - start;
    });
    await settle(page);
    assert.equal(pair, 1, 'popstate then hashchange for the same URL: decoded once');
    assert.match((await where(page)).hash, /^#\/dhcp\?ex=nat&level=1&seed=\d+&syntax=routeros$/);
    await back(page);
    await page.locator('.ng-bar-back').click(); await settle(page);
    s = await where(page);
    assert.deepEqual([s.home, s.hash], [true, '#/'], '«←» from two sections in: the start screen');
    await forward(page);
    assert.equal((await where(page)).hash, firewall);
    await forward(page);
    assert.match((await where(page)).hash, /^#\/dhcp\?ex=nat&level=2&seed=\d+/, 'Forward twice: the typed entry, as written');

    // ── Garbage: the section's defaults and the learner's own vendor; an unknown section: the start screen ──
    await typeHash(page, '#/dhcp?ex=zzz&level=99&syntax=x');
    s = await where(page);
    assert.match(s.hash, /^#\/dhcp\?ex=sides&seed=\d+&syntax=routeros$/);
    assert.ok(has(s.checked, 'WAN чи LAN') && has(s.checked, 'MikroTik'), `defaults, the session's vendor: ${s.checked}`);
    await typeHash(page, '#/nope?x=1');
    s = await where(page);
    assert.deepEqual([s.home, s.hash, s.path], [true, '#/', '/netgym/']);
    await page.close();

    // ── Another seed is another task; a plain address stays plain; a bad link becomes «#/» ──
    const other = await newPage();
    await go(other, BASE + '#/dhcp?ex=server&level=2&seed=12&syntax=routeros');
    assert.notEqual(await task(other), first, 'the seed picks the task');
    await go(other, BASE + '#/zzz?ex=1');
    s = await where(other);
    assert.deepEqual([s.home, s.hash, s.path], [true, '#/', '/netgym/']);
    await other.close();
    const plain = await newPage();
    await go(plain, BASE);
    s = await where(plain);
    assert.deepEqual([s.home, s.hash, s.path], [true, '', '/netgym/'], 'no hash added to a plain address');
    await plain.locator('.ng-card').filter({ has: plain.locator('.ng-card-title', { hasText: 'Маршрутизація' }) }).click(); await settle(plain);
    assert.match((await where(plain)).hash, /^#\/routing\?code=A1&syntax=cisco$/, 'routing: its share code');
    await back(plain);
    s = await where(plain);
    assert.deepEqual([s.home, s.hash], [true, ''], 'Back to the plain address');

    // ── Repair (Astra 1): the depth is the history's, not the route stack's ──
    // Home → DHCP → the DHCP hash edited twice (the stack stays [home, DHCP]) → a refresh → edited again: «←» reaches home.
    await plain.locator('.ng-card').filter({ has: plain.locator('.ng-card-title', { hasText: 'DHCP і NAT' }) }).click(); await settle(plain);
    assert.equal((await where(plain)).depth, 1);
    await typeHash(plain, '#/dhcp?ex=server&level=1');
    assert.equal((await where(plain)).depth, 2, 'a typed hash for the same section is one entry more');
    await typeHash(plain, '#/dhcp?ex=nat');
    assert.equal((await where(plain)).depth, 3);
    await plain.reload(); await plain.locator('.ng-screen').waitFor(); await settle(plain);
    assert.equal((await where(plain)).depth, 3, 'a refresh keeps the depth');
    await typeHash(plain, '#/dhcp?ex=sides');
    assert.equal((await where(plain)).depth, 4, 'an edit after a refresh counts from the refreshed entry');
    await plain.locator('.ng-bar-back').click(); await settle(plain);
    s = await where(plain);
    assert.deepEqual([s.home, s.hash, s.depth], [true, '', 0], '«←»: the first entry, the start screen');
    await plain.close();

    // ── Repair (Astra 2): a link's seed is applied once; Back and Forward restore the URL's task ──
    const link2 = await newPage();
    await go(link2, BASE);
    await link2.locator('.ng-card').filter({ has: link2.locator('.ng-card-title', { hasText: 'IP-калькулятор' }) }).click(); await settle(link2);
    await link2.getByRole('button', { name: 'Потренуватися → Маска' }).click(); await settle(link2);
    const seedA = (await where(link2)).hash.match(/seed=(\d+)/)?.[1];
    assert.ok(seedA, 'the link\'s seed is in the URL');
    await link2.locator('.ng-help-next').click(); await settle(link2);
    s = await where(link2);
    const seedB = s.hash.match(/seed=(\d+)/)?.[1];
    assert.ok(seedB && seedB !== seedA, '«Далі →»: another task, its seed written');
    assert.ok(!('seed' in (await link2.evaluate(() => history.state.ng.params))), 'the entry keeps no seed param of its own');
    const taskB = await task(link2);
    await back(link2);
    assert.equal((await where(link2)).title, 'IP-калькулятор');
    await forward(link2);
    s = await where(link2);
    assert.equal(s.hash.match(/seed=(\d+)/)?.[1], seedB, 'Forward: the URL\'s task, not the link\'s seed again');
    assert.equal(await task(link2), taskB);
    await back(link2); await forward(link2);
    assert.equal(await task(link2), taskB, 'and again');
    await link2.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
