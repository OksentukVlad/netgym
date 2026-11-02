// The web build (tools/build-web.sh) and the Windows app share one frontend.
// Only the web build shows the start screen's browser note and its notices
// link: tools/build.sh (the Wails path) never sets NETGYM_WEB, Vite defines
// __NETGYM_WEB__ from it, and a page with the Wails runtime counts as the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as h from '../.test-bundles/harness/start-screen.mjs';
import { uk } from '../src/app/uk.js';
import { noticesPage } from '../tools/notices-page.mjs';
import { browserSkip } from '../tools/browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFileSync(`${root}/${file}`, 'utf8');

function withGlobals(globals, run) {
  const saved = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.assign(globalThis, globals);
    return run();
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('web build: the note and the notices link are absent without the web flag (the Wails build path)', () => {
  assert.equal(h.webPreview(), false);
  const html = h.renderStart();
  assert.ok(html.includes(uk.sectionsCaption), 'the start screen rendered');
  assert.ok(!html.includes(uk.webNotice));
  assert.ok(!html.includes(uk.noticesHref));
});

test('web build: with the web flag the start screen shows the note and links the notices page', () => {
  withGlobals({ __NETGYM_WEB__: true }, () => {
    assert.equal(h.webPreview(), true);
    const html = h.renderStart();
    assert.ok(html.includes(`role="note">${uk.webNotice.replace(/'/g, '&#x27;')}</p>`), html.slice(0, 600));
    assert.ok(html.includes(`<a href="${uk.noticesHref}">${uk.noticesLink}</a>`));
    assert.equal(uk.webNotice, 'Перегляд у браузері: розраховано на комп\'ютер; на телефоні поки незручно.');
  });
});

test('web build: inside the Wails runtime neither shows, even with the web flag', () => {
  for (const window of [{ WailsInvoke: () => {} }, { wails: {} }]) {
    assert.equal(h.inWails(window), true);
    withGlobals({ __NETGYM_WEB__: true, window }, () => {
      assert.equal(h.webPreview(), false);
      const html = h.renderStart();
      assert.ok(!html.includes(uk.webNotice) && !html.includes(uk.noticesHref));
    });
  }
  assert.equal(h.inWails({}), false);
  assert.equal(h.inWails({ wails: null }), false);
  assert.equal(h.inWails(undefined), false);
});

test('web build: only tools/build-web.sh sets NETGYM_WEB; tools/build.sh clears it; Vite defines the flag from it', () => {
  const build = read('tools/build.sh'), web = read('tools/build-web.sh'), vite = read('shell/frontend/vite.config.js');
  assert.match(build, /env -u NETGYM_WEB NETGYM_TARGET="\$entry" wails build/);
  assert.doesNotMatch(build.replace(/env -u NETGYM_WEB/g, ''), /NETGYM_WEB/);
  assert.match(web, /NETGYM_WEB=1 NETGYM_TARGET="\$entry"/);
  assert.match(vite, /const web = process\.env\.NETGYM_WEB === '1'/);
  assert.match(vite, /__NETGYM_WEB__: JSON\.stringify\(web\)/);
  assert.match(vite, /base: web \? '\.\/' : '\/'/);
  // The site ships the notices and the font licence the start screen links.
  for (const part of ['"$out/LICENSE.txt"', 'THIRD_PARTY_NOTICES.md" "$out/"', '"$out/OFL.txt"', '"$out/third-party-notices.html"']) assert.ok(web.includes(part), part);
});

test('web build: the notices page escapes the text and links the shipped files', () => {
  const page = noticesPage('a <b> & "c"\n');
  assert.ok(page.includes('<pre>a &lt;b&gt; &amp; "c"\n</pre>'));
  for (const href of ['./', 'LICENSE.txt', 'OFL.txt', 'THIRD_PARTY_NOTICES.md']) assert.ok(page.includes(`href="${href}"`), href);
  assert.match(page, /<meta charset="UTF-8">/);
});

test('browser checks: a missing browser skips only with NETGYM_ALLOW_NO_BROWSER=1 outside CI', () => {
  const missing = { chromium: null, reason: 'no browser' }, found = { chromium: {}, reason: null };
  assert.equal(browserSkip({}, missing), false, 'runs, and launching fails');
  assert.equal(browserSkip({ NETGYM_ALLOW_NO_BROWSER: '1' }, missing), 'no browser');
  assert.equal(browserSkip({ NETGYM_ALLOW_NO_BROWSER: '1', CI: 'true' }, missing), false, 'CI never skips');
  assert.equal(browserSkip({ NETGYM_ALLOW_NO_BROWSER: '1' }, found), false);
  // The CI workflow installs Chromium with its system dependencies and sets no skip flag.
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.doesNotMatch(workflow, /NETGYM_ALLOW_NO_BROWSER/);
  assert.match(read('shell/frontend/package.json'), /"playwright": "1\.63\.0"/);
});
