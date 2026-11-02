// Older browsers: src/app/compat.js supplies the newer built-in methods the
// app uses, and the build lowers syntax to Chrome 80 and its peers
// (shell/frontend/vite.config.js). Vlad found firewall, VLAN, setup and the
// routing check blank on a Chrome older than 92 («.at is not a function»).
// Here: the polyfills behave like the built-ins; the source uses no newer
// method the polyfills don't cover; and the built site, with those methods
// removed before it loads, opens every section and checks a route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { browserSkip, launchChromium } from '../tools/browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(path.join(root, 'src/app/compat.js'), 'utf8');
const missing = browserSkip();

// What compat.js installs, and the oldest browser the build targets.
const POLYFILLED = ['Array.prototype.at', 'String.prototype.at', 'Object.hasOwn', 'Array.prototype.findLast',
  'Array.prototype.findLastIndex', 'String.prototype.replaceAll', 'structuredClone'];
// Built-ins newer than Chrome 80 that compat.js does not supply: the source must not use them.
const BANNED = [/\.toSorted\(/, /\.toReversed\(/, /\.toSpliced\(/, /\bObject\.groupBy\(/, /\bMap\.groupBy\(/,
  /\bArray\.fromAsync\(/, /\bPromise\.withResolvers\(/, /\bPromise\.any\(/, /\bAggregateError\b/, /\bWeakRef\b/,
  /\bFinalizationRegistry\b/, /\.isWellFormed\(/, /\.toWellFormed\(/, /\bcrypto\.randomUUID\(/, /\bAbortSignal\.timeout\(/,
  /\bIntl\.Segmenter\b/, /\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(new Set/];
const REMOVE = `
  delete Array.prototype.at; delete String.prototype.at; delete Object.getPrototypeOf(Int8Array.prototype).at;
  delete Object.hasOwn; delete Array.prototype.findLast; delete Array.prototype.findLastIndex;
  delete String.prototype.replaceAll; delete globalThis.structuredClone;`;

function oldRealm() {
  const context = vm.createContext({});
  vm.runInContext(REMOVE, context);
  for (const name of POLYFILLED) assert.equal(vm.runInContext(`typeof ${name}`, context), 'undefined', name);
  vm.runInContext(source, context);
  return code => vm.runInContext(code, context);
}

test('compat: each polyfill is installed where missing and behaves like the built-in', () => {
  const realm = oldRealm();
  // Values cross the realm as JSON (undefined becomes null).
  const run = code => JSON.parse(realm(`JSON.stringify(${code})`));
  for (const name of POLYFILLED) assert.equal(run(`typeof ${name}`), 'function', name);
  assert.equal(run('Object.keys(Array.prototype).length'), 0, 'non-enumerable');
  assert.deepEqual(run('[[1,2,3].at(0), [1,2,3].at(-1), [1,2,3].at(3), [1,2,3].at(-4), [].at(0), [1,2].at(1.7)]'), [1, 3, null, null, null, 2]);
  assert.deepEqual(run('["abc".at(-1), "abc".at(5), new Uint8Array([4,5]).at(-1)]'), ['c', null, 5]);
  assert.deepEqual(run('[Object.hasOwn({a: 1}, "a"), Object.hasOwn({}, "toString"), Object.hasOwn([7], 0)]'), [true, false, true]);
  assert.deepEqual(run('[[1,2,3,4].findLast(x => x % 2), [1,2,3,4].findLastIndex(x => x % 2), [].findLast(() => true), [1].findLastIndex(() => false)]'), [3, 2, null, -1]);
  assert.deepEqual(run('["1,2,3".replaceAll(",", "."), "aXbXc".replaceAll("X", (m, i) => i), "a.b".replaceAll(/\\./g, "-"), "x".replaceAll("y", "z")]'), ['1.2.3', 'a1b3c', 'a-b', 'x']);
  const cloned = run(`(() => {
    const a = { n: 1, list: [1, { deep: true }], when: new Date(5), map: new Map([['k', { v: 2 }]]), set: new Set([3]) };
    a.self = a;
    const b = structuredClone(a);
    return [b !== a, b.list[1] !== a.list[1], b.list[1].deep, b.when.getTime(), b.map.get('k').v, b.map.get('k') !== a.map.get('k'), b.set.has(3), b.self === b];
  })()`);
  assert.deepEqual(cloned, [true, true, true, 5, 2, true, true, true]);
});

test('compat: an existing built-in is left alone', () => {
  const before = Array.prototype.at;
  vm.runInThisContext(source);
  assert.equal(Array.prototype.at, before);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.(js|jsx|mjs)$/.test(name) ? [file] : [];
  });
}

test('compat: the source uses no built-in newer than the build target that compat.js does not supply', () => {
  const found = [];
  for (const file of sourceFiles(path.join(root, 'src'))) {
    if (file.endsWith(path.join('app', 'compat.js'))) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of BANNED) if (pattern.test(text)) found.push(`${path.relative(root, file)}: ${pattern}`);
  }
  assert.deepEqual(found, []);
});

test('compat: the frontend loads compat.js before anything else, and the build lowers syntax to Chrome 80', () => {
  const main = readFileSync(path.join(root, 'shell/frontend/src/main.jsx'), 'utf8');
  const firstImport = main.split('\n').find(line => line.startsWith('import'));
  assert.equal(firstImport, "import '@compat'");
  const vite = readFileSync(path.join(root, 'shell/frontend/vite.config.js'), 'utf8');
  assert.match(vite, /'@compat': fileURLToPath\(new URL\('\.\.\/\.\.\/src\/app\/compat\.js', import\.meta\.url\)\)/);
  assert.match(vite, /target: \['chrome80', 'edge80', 'firefox78', 'safari14'\]/);
});

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('compat: the built site runs without the newer built-ins: every section opens and a route check works', { skip: missing, timeout: 180000 }, async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'netgym-compat-'));
  let server, browser;
  try {
    execFileSync(path.join(root, 'tools/build-web.sh'), [out], { stdio: 'ignore' });
    server = await serve(out);
    browser = await launchChromium();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(REMOVE);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.evaluate(() => typeof [].at), 'function', 'compat.js filled the gap');
    for (const title of ['IP-калькулятор', 'IP-адреси: маска', 'IP-адреси: у бітах', 'Маршрутизація', 'Фаєрвол', 'VLAN', 'Налаштування з нуля']) {
      await page.getByText(title, { exact: true }).first().click();
      await page.getByText('Розділи').first().waitFor();
      if (title === 'Маршрутизація') {
        await page.getByRole('button', { name: 'Перевірити' }).first().click();
        await page.waitForTimeout(200);
      }
      assert.deepEqual(errors, [], title);
      await page.getByText('Розділи').first().click();
      await page.getByText(title, { exact: true }).first().waitFor();
    }
  } finally {
    await browser?.close();
    server?.close();
    rmSync(out, { recursive: true, force: true });
  }
});
