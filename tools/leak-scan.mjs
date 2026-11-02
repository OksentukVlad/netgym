#!/usr/bin/env node
// The public export's leak scan (tools/export-public.sh runs it). It fails on
// anything that must not be published: words that tie NetGym to a particular
// course or its assessments, machine paths and host names, personal e-mail
// addresses, token-like strings, links to the private files the export leaves
// out, symlinks, executables and archives, unexpected binary files and files
// over 10 MB.
//
// It scans every file under each directory (hidden ones too): the path, every
// line (also with \uXXXX and \xXX escapes decoded, as in minified bundles),
// every key and string of a .json file, and the printable strings of binary
// files. Exceptions are exact: tools/leak-scan-exceptions.tsv lists path,
// rule and the whole (trimmed) line, each one reviewed; an entry that no
// longer matches a finding is stale and fails the scan too.
//
// Usage: node tools/leak-scan.mjs [--exceptions FILE] DIR [--artifact DIR]
//   DIR's paths are reported relative to it; the artifact's (a built web
//   site) under `pages/`. Exit 0 when clean, 1 on any finding, 2 on usage.
//
// The course and assessment words are assembled from parts, so this file and
// its tests don't match themselves.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const w = (...parts) => parts.join('');
export const MAX_BYTES = 10 * 1024 * 1024;
export const EXCEPTIONS = 'tools/leak-scan-exceptions.tsv';

const term = (id, source, flags = 'iu') => ({ id, re: new RegExp(source, flags) });
// Reserved and no-reply addresses are not personal: GitHub's per-user
// noreply addresses, the commit co-author address, RFC 2606 domains.
const allowedEmail = /^(?:noreply@anthropic\.com|[\w.+-]+@users\.noreply\.github\.com|[\w.+-]+@(?:[\w-]+\.)*(?:example|test|invalid|localhost)|[\w.+-]+@(?:[\w-]+\.)*example\.(?:com|net|org))$/i;

export const rules = [
  term('course', `(?:${w('в', 'ос')}|${w('v', 'os')})[\\s_-]*600`),
  term('course', `(?<!\\p{L})${w('в', 'ос')}(?!\\p{L})`),
  term('course', `${w('cla', 'ss')}[\\s_-]*apps?\\b`),
  term('assessment', w('біл', 'ет')),
  term('assessment', w('кви', 'т')),
  term('assessment', w('екза', 'мен')),
  term('assessment', w('іспи', 'т')),
  term('assessment', w('норма', 'тив')),
  term('assessment', `\\b${w('ex', 'am')}(?:s|ination|inations)?\\b`),
  term('assessment', `\\b${w('tic', 'ket')}s?\\b`),
  term('machine-path', w('/ho', 'me/'), 'u'),
  term('machine-path', `\\.${w('loc', 'al')}/state`, 'u'),
  term('machine-path', w('/Us', 'ers/'), 'u'),
  term('machine-path', `\\b[A-Za-z]:\\\\{1,2}${w('Us', 'ers')}\\b`, 'iu'),
  term('host', `${w('remote', '-land')}|\\.${w('ts', '.net')}\\b`),
  term('private-doc', `\\b${w('no', 'tes')}/[\\w.-]+\\.md\\b|\\b(?:${w('AGE', 'NTS')}|${w('PL', 'AN')}|${w('ROAD', 'MAP')}|${w('CLA', 'UDE')})\\.md\\b`, 'u'),
  term('token', `\\b(?:gh[pousr]|${w('github', '_pat')})_[A-Za-z0-9_]{20,}`, 'u'),
  term('token', `\\b${w('s', 'k-')}[A-Za-z0-9_-]{20,}`, 'u'),
  term('token', `\\b${w('AK', 'IA')}[0-9A-Z]{16}\\b`, 'u'),
  term('token', `\\bxox[abprs]-[A-Za-z0-9-]{10,}`, 'u'),
  term('token', `\\b${w('AI', 'za')}[0-9A-Za-z_-]{35}\\b`, 'u'),
  term('token', `-----BEGIN [A-Z ]*${w('PRIV', 'ATE')} KEY-----`, 'u'),
  term('token', `\\b(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token)\\b\\s*[:=]\\s*['"][A-Za-z0-9_+/=-]{16,}['"]`),
];
// Addresses around each @ (a bounded window, so long minified lines stay
// linear). Domain labels start with a letter: Go module versions
// (name@v0.0.1-...) are not addresses.
const localRe = /[A-Za-z0-9._%+-]{1,64}$/u;
const domainRe = /^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)*\.[A-Za-z]{2,}/u;
function emails(text) {
  const list = [];
  for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
    const local = text.slice(Math.max(0, at - 64), at).match(localRe);
    const domain = text.slice(at + 1, at + 256).match(domainRe);
    if (local && domain) list.push(`${local[0]}@${domain[0]}`);
  }
  return list;
}

// Executables, archives and documents never go into the export or the site.
const forbiddenType = /\.(?:exe|dll|msi|com|scr|bat|cmd|ps1|so|dylib|apk|dmg|zip|7z|rar|tar|gz|tgz|bz2|xz|pdf|docx?|xlsx?|pptx?|odt|pkt|rsc|mp4|mov|mkv)$/i;
// Binary files the project ships: the app icons and the font.
const allowedBinary = /\.(?:png|ico|woff2?)$/i;

/** \uXXXX, \u{...} and \xXX escapes decoded (JSON strings, minified bundles). */
export function decodeEscapes(text) {
  return text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (m, hex) => safeChar(parseInt(hex, 16), m))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, hex) => safeChar(parseInt(hex, 16), m))
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, hex) => safeChar(parseInt(hex, 16), m));
}
function safeChar(code, fallback) {
  try { return String.fromCodePoint(code); } catch { return fallback; }
}

/** The rule ids a piece of text breaks, with what matched. */
export function scanText(text) {
  const found = [];
  const variants = [text];
  const decoded = decodeEscapes(text);
  if (decoded !== text) variants.push(decoded);
  for (const variant of variants) {
    for (const { id, re } of rules) {
      const m = variant.match(re);
      if (m) found.push({ rule: id, match: m[0] });
    }
    for (const address of emails(variant)) {
      if (!allowedEmail.test(address)) found.push({ rule: 'email', match: address });
    }
  }
  const seen = new Set();
  return found.filter(f => { const key = `${f.rule}\0${f.match}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function isBinary(buffer) {
  if (buffer.subarray(0, 8192).includes(0)) return true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); return false; } catch { return true; }
}

function* jsonStrings(value, where = '$') {
  if (typeof value === 'string') yield [where, value];
  else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* jsonStrings(item, `${where}[${i}]`);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      yield [`${where} (key)`, key];
      yield* jsonStrings(item, `${where}.${key}`);
    }
  }
}

/** Parses tools/leak-scan-exceptions.tsv: path, rule, exact trimmed line. */
export function parseExceptions(text) {
  const list = [];
  for (const [n, raw] of text.split('\n').entries()) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    const first = raw.indexOf('\t'), second = raw.indexOf('\t', first + 1);
    if (first < 0 || second < 0) throw new Error(`exceptions line ${n + 1}: expected path<TAB>rule<TAB>line`);
    list.push({ path: raw.slice(0, first), rule: raw.slice(first + 1, second), line: raw.slice(second + 1).trim(), used: false });
  }
  return list;
}

/**
 * Scans one file's content. `rel` is its reported path. Returns findings
 * `{ path, line, rule, match, text }` that no exception covers.
 */
export function scanFile(rel, buffer, exceptions = []) {
  const findings = [];
  const excepted = (rule, text) => {
    const hit = exceptions.find(e => e.path === rel && e.rule === rule && e.line === text.trim());
    if (hit) hit.used = true;
    return !!hit;
  };
  const add = (line, text, hits) => {
    for (const hit of hits) if (!excepted(hit.rule, text)) findings.push({ path: rel, line, rule: hit.rule, match: hit.match, text: text.trim().slice(0, 160) });
  };
  add(0, rel, scanText(rel));
  if (forbiddenType.test(rel)) findings.push({ path: rel, line: 0, rule: 'file-type', match: path.extname(rel), text: 'executables, archives and documents are not published' });
  if (buffer.length > MAX_BYTES) {
    findings.push({ path: rel, line: 0, rule: 'size', match: `${buffer.length} bytes`, text: 'over 10 MB (content not scanned)' });
    return findings;
  }
  if (isBinary(buffer)) {
    if (!allowedBinary.test(rel)) findings.push({ path: rel, line: 0, rule: 'binary', match: path.extname(rel) || '(none)', text: 'unexpected binary file' });
    // Printable runs inside the binary (metadata, embedded paths).
    for (const [run] of buffer.toString('latin1').matchAll(/[\x20-\x7e]{6,}/g)) add(0, run, scanText(run));
    return findings;
  }
  const text = buffer.toString('utf8');
  for (const [i, line] of text.split('\n').entries()) {
    // The exceptions file quotes the excepted lines: their third field is
    // checked by the staleness rule (each entry must match a finding), its
    // paths, rule names and comments like any other text.
    const quoted = rel === EXCEPTIONS && line.trim() && !line.startsWith('#') && line.split('\t').length >= 3;
    add(i + 1, line, scanText(quoted ? line.split('\t').slice(0, 2).join('\t') : line));
  }
  if (rel.endsWith('.json')) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { findings.push({ path: rel, line: 0, rule: 'json', match: 'unparsable', text: 'a .json file that does not parse' }); }
    if (parsed !== undefined) {
      for (const [where, value] of jsonStrings(parsed)) {
        for (const hit of scanText(value)) {
          // A decoded string that only repeats what a line already showed is covered by that line's finding or exception.
          if (text.includes(value) && !value.includes('\n')) continue;
          if (!excepted(hit.rule, value)) findings.push({ path: rel, line: 0, rule: hit.rule, match: hit.match, text: `${where}: ${value.slice(0, 120)}` });
        }
      }
    }
  }
  return findings;
}

/** Every file under `dir`; symlinks are findings, never followed. */
export function scanTree(dir, prefix = '', exceptions = [], skip = new Set(['.git'])) {
  const findings = [];
  let files = 0;
  const walk = sub => {
    for (const entry of readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      const shown = prefix + rel;
      if (!sub && skip.has(entry.name)) continue;
      const stat = lstatSync(path.join(dir, rel));
      if (stat.isSymbolicLink()) { findings.push({ path: shown, line: 0, rule: 'symlink', match: '', text: 'symlinks are not exported' }); continue; }
      if (stat.isDirectory()) { findings.push(...scanFile(shown + '/', Buffer.alloc(0), exceptions).filter(f => f.rule !== 'binary')); walk(rel); continue; }
      if (!stat.isFile()) { findings.push({ path: shown, line: 0, rule: 'file-type', match: '', text: 'not a regular file' }); continue; }
      files++;
      findings.push(...scanFile(shown, readFileSync(path.join(dir, rel)), exceptions));
    }
  };
  walk('');
  return { findings, files };
}

function main(argv) {
  let exceptionsFile, dir, artifact;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--exceptions') exceptionsFile = argv[++i];
    else if (arg === '--artifact') artifact = argv[++i];
    else if (!arg.startsWith('--') && !dir) dir = arg;
    else { console.error(`unknown argument: ${arg}`); return 2; }
  }
  if (!dir || (argv.includes('--exceptions') && !exceptionsFile) || (argv.includes('--artifact') && !artifact)) {
    console.error('Usage: node tools/leak-scan.mjs [--exceptions FILE] DIR [--artifact DIR]');
    return 2;
  }
  const exceptions = exceptionsFile ? parseExceptions(readFileSync(exceptionsFile, 'utf8')) : [];
  const tree = scanTree(dir, '', exceptions);
  const site = artifact ? scanTree(artifact, 'pages/', exceptions, new Set()) : { findings: [], files: 0 };
  const findings = [...tree.findings, ...site.findings];
  for (const f of findings) console.log(`${f.path}${f.line ? `:${f.line}` : ''}: ${f.rule}: «${f.match}» ${f.text}`);
  // An exception whose line is gone (in a scanned part) is stale: review and remove it.
  const stale = exceptions.filter(e => !e.used && (artifact || !e.path.startsWith('pages/')));
  for (const e of stale) console.log(`stale exception: ${e.path}\t${e.rule}\t${e.line}`);
  console.log(`leak scan: ${tree.files} files${artifact ? ` + ${site.files} in the site` : ''}; ${findings.length} findings; ${stale.length} stale exceptions`);
  return findings.length || stale.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
