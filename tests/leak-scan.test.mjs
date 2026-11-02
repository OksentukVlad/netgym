// The public export's leak scan (tools/leak-scan.mjs): what it must find,
// what it must let through, and how exact its reviewed exceptions are.
// Words the scan looks for are assembled from parts, so this file passes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCEPTIONS, MAX_BYTES, decodeEscapes, parseExceptions, scanFile, scanText, scanTree } from '../tools/leak-scan.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const w = (...parts) => parts.join('');
const rulesOf = text => scanText(text).map(f => f.rule);
const scan = (rel, text, exceptions) => scanFile(rel, Buffer.from(text), exceptions);

test('leak scan: finds course and assessment words, machine paths, hosts, private links, e-mail and tokens', () => {
  const cases = {
    course: [w('ВО', 'С600'), w('vo', 's-600'), w('VO', 'S 600'), w('ВО', 'С'), w('class', '-apps'), w('class ', 'app')],
    assessment: [w('біл', 'ет'), w('кви', 'ток'), w('екза', 'мен'), w('іспи', 'ти'), w('норма', 'тив'), w('Ex', 'am'), w('ex', 'ams'), w('tic', 'kets')],
    'machine-path': [w('/ho', 'me/someone/x'), w('~/.loc', 'al/state/x'), w('/Us', 'ers/x'), w('C:\\', 'Users\\x'), w('C:\\\\', 'Users')],
    host: [w('remote', '-land'), w('box.tail1234.', 'ts.net')],
    'private-doc': [w('see no', 'tes/round2.md'), w('AGE', 'NTS.md'), w('ROAD', 'MAP.md'), w('PL', 'AN.md'), w('CLA', 'UDE.md')],
    email: [w('someone', '@gmail.com'), w('a.b+c', '@uni.edu.ua')],
    token: [w('gh', 'p_', 'a'.repeat(36)), w('github', '_pat_', 'b'.repeat(30)), w('s', 'k-', 'c'.repeat(24)), w('AK', 'IA', 'ABCDEFGHIJKLMNOP'),
      w('-----BEGIN RSA PRIV', 'ATE KEY-----'), w('api_key = "', 'Z'.repeat(20), '"')],
  };
  for (const [rule, texts] of Object.entries(cases)) for (const text of texts) assert.ok(rulesOf(text).includes(rule), `${rule}: ${text}`);
});

test('leak scan: lets ordinary project text through', () => {
  for (const text of ['for example', 'examples with other numbers', 'domain lab.example', 'ip domain-name practice.example',
    'golang.org/toolchain@v0.0.1-go1.23.4.linux-amd64', 'Co-Authored-By: Claude <noreply@anthropic.com>', '12345+someone@users.noreply.github.com',
    'width: 600px', 'seed 600', 'classic-mistake codes', 'class="ng-card"', 'routing.class-16', 'secret: "<пароль>"', 'Перегляд у браузері']) {
    assert.deepEqual(scanText(text), [], text);
  }
});

test('leak scan: escaped text is decoded first (minified bundles, JSON strings)', () => {
  const escaped = [...w('екза', 'мен')].map(ch => `\\u${ch.codePointAt(0).toString(16).padStart(4, '0')}`).join('');
  assert.equal(decodeEscapes(escaped), w('екза', 'мен'));
  assert.ok(rulesOf(`const s="${escaped}"`).includes('assessment'));
  assert.ok(rulesOf('\\x2fho\\x6de/x/').includes('machine-path'));
  // A key or string of a .json file, also when the raw line hides it.
  const json = JSON.stringify({ [w('tic', 'ket')]: 1, list: ['ok', escaped] }).replace(/\\\\u/g, '\\u');
  const found = scan('data/x.json', json);
  assert.ok(found.some(f => f.rule === 'assessment' && f.match.toLowerCase() === w('tic', 'ket')));
  assert.ok(found.some(f => f.rule === 'assessment' && f.match === w('екза', 'мен')));
  assert.ok(scan('broken.json', '{').some(f => f.rule === 'json'));
});

test('leak scan: names, file types, binaries and size are checked', () => {
  assert.ok(scan(w('docs/vo', 's600-notes.txt'), 'ok').some(f => f.rule === 'course' && f.line === 0));
  for (const name of ['dist/NetGym.exe', 'a.zip', 'lab.pdf', 'b.docx', 'net.pkt', 'r.rsc']) assert.ok(scan(name, 'x').some(f => f.rule === 'file-type'), name);
  assert.ok(scanFile('blob.bin', Buffer.from([0, 1, 2, 3])).some(f => f.rule === 'binary'));
  assert.deepEqual(scanFile('icon.png', Buffer.from([0x89, 0x50, 0, 0, 0x41])), []);
  // Printable runs inside an allowed binary are still scanned.
  assert.ok(scanFile('icon.png', Buffer.concat([Buffer.from([0, 0]), Buffer.from(w('/ho', 'me/user/icon.svg')), Buffer.from([0])])).some(f => f.rule === 'machine-path'));
  assert.ok(scanFile('big.txt', Buffer.alloc(MAX_BYTES + 1, 0x61)).some(f => f.rule === 'size'));
});

test('leak scan: an exception covers exactly its path, rule and whole line', () => {
  const line = `assert.doesNotMatch(html, /${w('іспи', 'т')}/);`;
  const exceptions = () => parseExceptions(`# comment\ntests/a.test.mjs\tassessment\t${line}\n`);
  assert.deepEqual(scan('tests/a.test.mjs', `  ${line}\n`, exceptions()), [], 'same path, rule and line (trimmed)');
  assert.equal(scan('tests/b.test.mjs', line, exceptions()).length, 1, 'another file');
  assert.equal(scan('tests/a.test.mjs', `${line} // ${w('іспи', 'т')}`, exceptions()).length, 1, 'a changed line');
  assert.equal(scan('tests/a.test.mjs', `${line}\nconst x = '${w('іспи', 'т')}';`, exceptions()).length, 1, 'another line of the same file');
  const list = exceptions();
  scan('tests/a.test.mjs', line, list);
  assert.equal(list[0].used, true);
  assert.throws(() => parseExceptions('only-a-path\n'), /expected path<TAB>rule<TAB>line/);
});

test('leak scan: a tree scan reports symlinks, skips .git, scans the exceptions file\'s own fields, and marks unused exceptions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'netgym-leak-'));
  try {
    mkdirSync(path.join(dir, '.git'));
    writeFileSync(path.join(dir, '.git', 'config'), w('url = /ho', 'me/x'));
    mkdirSync(path.join(dir, 'tools'));
    mkdirSync(path.join(dir, 'tests'));
    const line = `const words = /${w('екза', 'мен')}/;`;
    writeFileSync(path.join(dir, 'tests', 'calm.test.mjs'), `${line}\n`);
    writeFileSync(path.join(dir, '.hidden'), w('mail me: someone', '@gmail.com'));
    writeFileSync(path.join(dir, EXCEPTIONS), `# reviewed\ntests/calm.test.mjs\tassessment\t${line}\nREADME.md\tassessment\t${w('ex', 'am')} gone\n`);
    symlinkSync('/etc/hostname', path.join(dir, 'link'));
    const exceptions = parseExceptions(readFileSync(path.join(dir, EXCEPTIONS), 'utf8'));
    const { findings, files } = scanTree(dir, '', exceptions);
    assert.equal(files, 3);
    assert.deepEqual(findings.map(f => `${f.path}:${f.rule}`).sort(), ['.hidden:email', 'link:symlink']);
    assert.deepEqual(exceptions.map(e => e.used), [true, false], 'the second entry matches nothing: stale');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('leak scan: the reviewed exceptions file parses, names known rules, and lists only font notices and negative-test wordlists', () => {
  const list = parseExceptions(readFileSync(path.join(root, EXCEPTIONS), 'utf8'));
  assert.ok(list.length > 0);
  for (const e of list) {
    if (e.rule === 'email') {
      assert.match(e.line, /^Copyright 2016 The Nunito Project Authors \(contact@sansoxygen\.com\),$/, e.path);
      assert.ok(['THIRD_PARTY_NOTICES.md', 'shell/frontend/src/assets/fonts/OFL.txt', 'pages/OFL.txt', 'pages/THIRD_PARTY_NOTICES.md', 'pages/third-party-notices.html'].includes(e.path), e.path);
    } else {
      assert.ok(['course', 'assessment'].includes(e.rule), `${e.path}: ${e.rule}`);
      assert.match(e.path, /^tests\/[\w-]+\.test\.mjs$/);
      assert.match(e.line, /doesNotMatch|const CALM = /, `${e.path}: a negative-test wordlist`);
      assert.ok(readFileSync(path.join(root, e.path), 'utf8').split('\n').some(l => l.trim() === e.line), `${e.path}: the line exists`);
    }
  }
});
