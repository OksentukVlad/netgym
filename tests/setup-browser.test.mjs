// «Налаштування з нуля» in a real browser (round 5, spec 5b-2 F and A): the
// card rows and the mode popover with the real CSS, which server rendering
// and the mini DOM can't lay out.
//   - every card's purpose is its first line and stays one line (R2) at
//     1280 (desk) and 1000 (narrow), on every deck; the command is under it,
//     and the prompt group shares the command's line (one band), never the
//     purpose's;
//   - the folded worked example sits between the action line and the deck,
//     and the mode «?» still opens its popover right under the action line
//     (over the folded example), not under the example.
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
    entryPoints: [path.join(root, 'tests/browser/setup.jsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    outdir: '/setup', nodePaths: [path.join(root, 'shell/frontend/node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  return { js: out.outputFiles.find(f => f.path.endsWith('.js')).text, css: out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' };
}

/** In the page: each deck row's purpose, command and prompt group boxes, and the purpose's line count. */
function rowBoxes() {
  const box = el => (el ? (({ top, bottom }) => ({ top, bottom }))(el.getBoundingClientRect()) : null);
  return [...document.querySelectorAll('.ng-reorder-item .ng-su-row, .ng-su-modes-deck .ng-su-row')].map(row => {
    const purpose = row.querySelector('[data-purpose]');
    const range = document.createRange();
    range.selectNodeContents(purpose);
    return {
      text: purpose.textContent,
      first: row.children[0] === purpose,
      lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size,
      purpose: box(purpose), term: box(row.querySelector('.ng-su-term')), group: box(row.querySelector('.ng-su-choice')),
    };
  });
}

test('setup decks in Chromium: purpose-first rows (one line, the prompt group on the command\'s line) and the mode popover under the action line', { skip: missing }, async () => {
  const { js, css } = await bundle();
  const browser = await launchChromium();
  try {
    for (const width of [1280, 1000]) {
      for (const deck of ['dr-1', 'dr-2', 'dr-3']) {
        const label = `${deck} at ${width}`;
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="margin:0"><div id="host"></div></body></html>`);
        await page.addScriptTag({ content: js });
        await page.evaluate(d => window.setup.mount(document.getElementById('host'), d), deck);
        await page.waitForFunction(w => document.querySelector('.ng-su')?.dataset.layout === (w >= 1200 ? 'desk' : 'narrow'), width);
        const rows = await page.evaluate(rowBoxes);
        assert.equal(rows.length, { 'dr-1': 12, 'dr-2': 5, 'dr-3': 13 }[deck], label);
        assert.deepEqual(rows.filter(r => !r.first).map(r => r.text), [], `${label}: every row starts with its purpose`);
        assert.deepEqual(rows.filter(r => r.lines !== 1).map(r => r.text), [], `${label}: every purpose is one line`);
        assert.deepEqual(rows.filter(r => r.term.top < r.purpose.bottom - 1).map(r => r.text), [], `${label}: the command under its purpose`);
        if (deck !== 'dr-3') {
          // Round 9 (B1): the modes wait for their own step.
          assert.deepEqual(rows.filter(r => r.group).map(r => r.text), [], `${label}: no prompt group on the order step`);
          await page.evaluate(d => window.setup.toModes(d), deck);
          await page.waitForSelector('.ng-su-modes-deck');
          const moded = await page.evaluate(rowBoxes);
          assert.deepEqual(moded.filter(r => r.lines !== 1).map(r => r.text), [], `${label}: every purpose is one line on the modes step`);
          // One band: the group's middle within the command's box, and clear of the purpose.
          assert.deepEqual(moded.filter(r => {
            const mid = (r.group.top + r.group.bottom) / 2;
            return mid < r.term.top - 1 || mid > r.term.bottom + 1 || r.group.top < r.purpose.bottom - 1;
          }).map(r => r.text), [], `${label}: the prompt group on the command's line`);
          // The mode popover: right under the action line, over the folded example.
          await page.click('.ng-su-modes-q');
          const pop = await page.evaluate(() => {
            const b = sel => document.querySelector(sel).getBoundingClientRect();
            return { line: b('.ng-su-action > .ng-action-line').bottom, pop: b('.ng-su-modes-pop').top, example: b('[data-worked-example]').bottom, hidden: document.querySelector('.ng-su-modes-pop').hidden };
          });
          assert.ok(!pop.hidden && Math.abs(pop.pop - pop.line - 2) <= 1 && pop.pop < pop.example, `${label}: the popover under the action line, over the folded example: ${JSON.stringify(pop)}`);
        }
        assert.deepEqual(errors, [], label);
        await page.close();
      }
    }
  } finally { await browser.close(); }
});
