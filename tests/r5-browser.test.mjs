// Round 5 shared parts in a real browser (repair v1, item 13): what server
// rendering and the mini DOM can't show.
//   - FactLink: Tab reaches it, Enter and Space activate it, and the owner
//     is announced in its polite region only then;
//   - the highlight outline: drawn around its label (clear of the text, so
//     it covers none of it), pulsing; static with reduced motion;
//   - scrollToLabel: one column brings the label into view, `nearest`;
//     two columns move nothing;
//   - purpose lines: every firewall rule purpose is one line in a 420 px
//     panel (the real CSS; headless fonts are wider than Segoe UI).
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

async function bundle() {
  const require = createRequire(path.join(root, 'shell/frontend/package.json'));
  const esbuild = require('esbuild');
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'tests/browser/round5.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/r5', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

test('round 5 shared parts in Chromium: FactLink keys, the outline, one-column scroll, purpose lines', { skip: missing }, async () => {
  const { js, css } = await bundle();
  const browser = await launchChromium();
  const open = async (reducedMotion = 'no-preference', viewport = { width: 1000, height: 700 }) => {
    const page = await browser.newPage({ viewport, reducedMotion });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="margin:0"><div id="host"></div></body></html>`);
    await page.addScriptTag({ content: js });
    assert.deepEqual(errors, []);
    return page;
  };
  try {
    // FactLink by keyboard: a native button.
    let page = await open();
    await page.evaluate(() => window.r5.factLink(document.getElementById('host')));
    const said = () => page.evaluate(() => document.querySelector('.ng-fact-link').nextElementSibling.textContent);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'ng-fact-link', 'Tab reaches it');
    assert.equal(await said(), '', 'focus says nothing');
    await page.keyboard.press('Enter');
    assert.deepEqual([await page.evaluate(() => window.r5.activations), await said()], [1, '192.168.88.1 — адреса R1 у LAN']);
    await page.keyboard.press(' ');
    assert.equal(await page.evaluate(() => window.r5.activations), 2, 'Space too');
    assert.equal(await page.evaluate(() => document.querySelector('.ng-fact-link').title), '192.168.88.1 — показати на схемі');
    await page.close();

    // The outline: around the label, clear of its text; pulsing, or static with reduced motion.
    for (const [motion, animation] of [['no-preference', 'ng-hl-pulse'], ['reduce', 'none']]) {
      page = await open(motion);
      await page.evaluate(() => window.r5.label(document.getElementById('host'), true));
      const m = await page.evaluate(() => {
        const t = document.querySelector('[data-highlight]').getBoundingClientRect(), r = document.querySelector('.ng-hl-mark');
        const b = r.getBoundingClientRect();
        return { inside: b.left < t.left && b.right > t.right && b.top < t.top && b.bottom > t.bottom, fill: getComputedStyle(r).fill, animation: getComputedStyle(r).animationName, marks: document.querySelectorAll('.ng-hl-mark').length };
      });
      assert.deepEqual(m, { inside: true, fill: 'none', animation, marks: 1 }, motion);
      await page.close();
    }
    page = await open();
    await page.evaluate(() => window.r5.label(document.getElementById('host'), false));
    assert.equal(await page.evaluate(() => document.querySelectorAll('.ng-hl-mark').length), 0, 'no highlight, no outline');
    await page.close();

    // One column: the label scrolls into view; two columns: nothing moves.
    for (const [oneColumn, moves] of [[true, true], [false, false]]) {
      page = await open('no-preference', { width: 900, height: 500 });
      const top = await page.evaluate(one => {
        const host = document.getElementById('host');
        host.style.cssText = 'height:300px; overflow:auto';
        host.innerHTML = '<div style="height:900px"></div><div id="lbl"></div>';
        window.r5.label(document.getElementById('lbl'), true);
        window.r5.scrollToLabel(host.querySelector('svg'), one);
        const t = host.querySelector('[data-highlight]').getBoundingClientRect(), h = host.getBoundingClientRect();
        return { scrolled: host.scrollTop > 0, inView: t.top >= h.top && t.bottom <= h.bottom };
      }, oneColumn);
      assert.deepEqual(top, { scrolled: moves, inView: moves }, `one column: ${oneColumn}`);
      await page.close();
    }

    // Purpose lines: one line each at a 420 px panel.
    page = await open();
    await page.evaluate(() => window.r5.rules(document.getElementById('host')));
    const lines = await page.evaluate(() => [...document.querySelectorAll('[data-purpose]')].map(p => {
      const range = document.createRange(); range.selectNodeContents(p);
      return [p.textContent, new Set([...range.getClientRects()].map(r => Math.round(r.top))).size];
    }));
    assert.ok(lines.length >= 9, `${lines.length} purposes`);
    assert.deepEqual(lines.filter(([, n]) => n !== 1), [], 'every purpose is one line');
    await page.close();
  } finally { await browser.close(); }
});
