// Contrast of every colour pair the routing screen draws (round 2 step 7,
// ARCHITECTURE §6 design tokens; step 6 adds the packet path): text at least
// 4.5:1, lines and the focus ring at least 3:1, in both themes. Colours come from src/ui/tokens.css;
// the pairs follow src/sections/routing/screens/routing.css. Where routing.css
// mixes a colour (color-mix in srgb), the same mix is computed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');

/** The --ng-* colours of one theme block of tokens.css. */
function themeColours(name) {
  const block = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].find(([, selector]) => selector.includes(`[data-theme="${name}"]`));
  assert.ok(block, `theme ${name}`);
  const colours = [...block[2].matchAll(/--ng-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, key, hex]) => [key, hex.toLowerCase()]);
  const shares = [...block[2].matchAll(/--ng-([\w-]+):\s*([\d.]+)%\s*;/g)].map(([, key, pct]) => [key, Number(pct) / 100]);
  return Object.fromEntries([...colours, ...shares]);
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
/** color-mix(in srgb, a p, b): sRGB channels interpolated. */
const mix = (a, p, b) => toHex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Every pair the routing screen draws: [label, foreground, background, minimum]. */
function pairs(c) {
  const out = [];
  const text = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 4.5]));
  const line = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 3]));
  const panels = ['bg', 'panel', 'surf', 'side', 'input-bg', 'svg-bg', 'net-fill'];
  const rowBgs = ['surf', 'red-bg', 'green-bg'];
  text('text', 'text', [...panels, 'blue-bg', ...rowBgs, 'amber-bg']);
  text('muted (captions, notes, labels, placeholders)', 'muted', [...panels, 'blue-bg', ...rowBgs]);
  text('title', 'title', ['bg']);
  text('cyan (row destination, internet label)', 'cyan', [...rowBgs, 'net-fill']);
  text('blue (link network)', 'blue', ['net-fill']);
  text('amber (badge, hint, server label)', 'amber', ['amber-bg', 'input-bg', 'net-fill']);
  text('purple (role, distance label)', 'purple', rowBgs);
  text('red (feedback, open reveal)', 'red', ['red-bg']);
  text('green (feedback, solved mark)', 'green', ['green-bg', 'side', 'blue-bg']);
  text('button text', 'button-text', ['button-bg']);
  text('code', 'code', ['code-bg']);
  for (let i = 0; i < 8; i++) {
    const rc = c[`router-${i}`];
    text(`router ${i}`, rc, ['svg-bg', 'net-fill', 'surf']);
    out.push([`router ${i} name on its selected circle`, rc, mix(rc, c['tint-strong'], c['svg-bg']), 4.5]);
    out.push([`router ${i} on its pressed button`, rc, mix(rc, c.tint, c['input-bg']), 4.5]);
    line(`router ${i} lines`, rc, ['svg-bg']);
    out.push([`router ${i} circle edge`, mix(rc, c.edge, c.surf), c['svg-bg'], 3]);
  }
  for (const [n, lv] of [[0, c.cyan], ...[1, 2, 3, 4, 5].map(n => [n, c[`level-${n}`]])]) {
    text(`level ${n} badge`, lv, ['bg']);
    out.push([`level ${n} pressed filter`, lv, mix(lv, c.tint, c['input-bg']), 4.5]);
    line(`level ${n} task edge`, lv, ['side', 'blue-bg']);
  }
  line('focus ring', 'focus', [...panels, 'blue-bg', ...rowBgs]);
  line('diagram link', 'link', ['svg-bg']);
  line('internet and server lines', 'cyan', ['svg-bg']);
  line('server line', 'amber', ['svg-bg']);
  line('input border', 'line', [...rowBgs, 'input-bg']);
  line('invalid input border', 'red', ['red-bg', 'input-bg']);
  // Step 6: the packet path (PathLayer.jsx) on the diagram, its legend, the
  // strip and «Усі перевірки».
  line('path: request', 'path', ['svg-bg', 'net-fill']);
  line('path: reply', 'path-reply', ['svg-bg', 'net-fill']);
  line('path: link down', 'path-down', ['svg-bg']);
  line('path: stop ring', 'amber', ['svg-bg']);
  // Request and reply never touch (each has an --ng-svg-bg casing, side by
  // side); solid versus dashed tells them apart, the hue only helps.
  text('path: hop number on its dot', 'svg-bg', ['path']);
  text('path: ✓ on its dot', 'svg-bg', ['green']);
  text('path: ✗ on its dot', 'svg-bg', ['amber']);
  text('path: ⟲ and TTL', 'amber', ['svg-bg']);
  text('path: «⚡ впав»', 'path-down', ['svg-bg']);
  text('legend', 'text', ['svg-bg']);
  text('strip count', 'green', ['green-bg']);
  text('strip count', 'amber', ['amber-bg']);
  text('check marks in the list', 'green', ['surf', 'input-bg', 'blue-bg']);
  text('check marks in the list', 'amber', ['surf', 'input-bg', 'blue-bg']);
  text('hint button', 'amber', ['input-bg', 'blue-bg']);
  // OPT-1 UI: the tips' links in the success notes, the blackhole checkbox
  // and the disabled gateway's «—» (round 4: no ★ in the strip).
  // Round 4 shared parts: DoneMark's ✓ in task lists and buttons, «Почни тут»,
  // the «показано» chip, HelpPanel's muted words (folds, «до змін», the cue),
  // the hint box, «⋯» and «?».
  text('DoneMark ✓', 'green', ['panel', 'surf', 'side', 'input-bg', 'blue-bg']);
  text('«Почни тут» chip', 'green', ['green-bg']);
  text('«показано» chip', 'cyan', ['panel', 'surf']);
  text('help panel folds, «до змін», cue, «⋯», «?»', 'muted', ['panel', 'surf', 'green-bg', 'amber-bg']);
  text('help panel hint and its label (quiet: amber is for «Ще ні» only)', 'text', ['surf']);
  text('tip link', 'cyan', ['green-bg']);
  text('tip and improve text', 'text', ['green-bg']);
  line('blackhole checkbox', 'cyan', ['surf', 'input-bg', 'green-bg']);
  text('disabled gateway «—»', 'muted', ['surf']);
  // Polish: the success lap's green outline around a box or cloud reached.
  line('lap: box outline', 'green', ['svg-bg', 'net-fill']);
  line('strip edge', 'green', ['surf']);
  line('strip edge', 'amber', ['surf']);
  // Step 9: the task's code in the heading and «Попередні адреси»' code, on
  // the screen's background; the code field's refusal (on the task list) and
  // the address row's polite line in amber; the field's invalid border.
  text('task code and previous code', 'cyan', ['bg']);
  text('code field refusal', 'amber', ['side', 'bg']);
  text('address row line', 'amber', ['bg']);
  text('subtitle and «Попередні адреси»', 'muted', ['bg']);
  line('invalid code field border', 'amber', ['input-bg']);
  // FW-1: the firewall screen (src/sections/firewall/screens/firewall.css).
  // Rule rows and the walk: words on their row's tint, the chain in muted.
  text('firewall row text', 'text', ['surf', 'amber-bg', 'green-bg', 'blue-bg']);
  text('firewall chain and not reached', 'muted', ['surf', 'amber-bg', 'green-bg', 'blue-bg']);
  text('firewall walk: mismatch', 'amber', ['amber-bg']);
  text('firewall walk: decides', 'green', ['green-bg']);
  text('firewall walk: FastTrack', 'button-text', ['blue-bg']);
  text('firewall chosen door', 'button-text', ['button-bg']);
  line('firewall row edges and the action chip', 'line', ['surf', 'amber-bg', 'green-bg', 'blue-bg']);
  line('firewall row edge: mismatch', 'amber', ['amber-bg', 'surf']);
  line('firewall row edge: decides', 'green', ['green-bg', 'surf']);
  line('firewall row edge and the selection outline', 'blue', ['blue-bg', 'surf', 'input-bg', 'green-bg', 'amber-bg']);
  text('firewall current dot', 'cyan', ['input-bg']);
  line('firewall current dot ring', 'cyan', ['input-bg']);
  line('firewall the filter\'s door after commitment', 'path', ['blue-bg']);
  line('firewall assumption edge', 'blue', ['panel']);
  text('firewall assumption and meanings', 'text', ['panel', 'surf', 'amber-bg', 'green-bg', 'blue-bg']);
  // The diagram: R1 is --ng-surf inside, the doors --ng-input-bg (the chosen
  // one --ng-blue-bg); text ≥ 4.5, lines and marks ≥ 3.
  text('firewall diagram text', 'text', ['svg-bg', 'net-fill', 'surf', 'input-bg', 'blue-bg']);
  text('firewall diagram muted words', 'muted', ['svg-bg', 'input-bg']);
  text('firewall given labels', 'cyan', ['svg-bg', 'net-fill']);
  text('firewall R1 name', 'router-0', ['surf']);
  line('firewall request path', 'path', ['svg-bg', 'net-fill', 'surf', 'input-bg', 'blue-bg']);
  line('firewall lanes and door edges', 'muted', ['surf', 'input-bg']);
  line('firewall given outlines and chips', 'cyan', ['svg-bg', 'net-fill', 'blue-bg']);
  line('firewall reached outline', 'green', ['svg-bg', 'net-fill', 'surf']);
  line('firewall ✕ mark', 'amber', ['svg-bg', 'surf']);
  text('firewall ✕ on its dot', 'svg-bg', ['amber']);
  line('firewall envelope', 'path', ['svg-bg', 'surf']);
  // FW-2 «Упорядкуй правила» (order.css): the chain pills on their own
  // surface (so a walk's tint never changes them), «• Ще ні» on its tint,
  // the walk's words on the learner's rows, the focused row's tint, and the
  // marked row's amber edge on every row background it can have.
  text('FW-2 chain pill: input', 'cyan', ['surf']);
  text('FW-2 chain pill: forward', 'purple', ['surf']);
  line('FW-2 chain pill edges', 'cyan', ['surf']);
  line('FW-2 chain pill edges: forward', 'purple', ['surf']);
  text('FW-2 «• Ще ні» mark', 'amber', ['amber-bg']);
  text('FW-2 rows: words, conditions and the action on a focused or FastTrack row', 'text', ['surf', 'blue-bg', 'amber-bg', 'green-bg']);
  text('FW-2 rows: other chain, not reached, the policy line', 'muted', ['surf', 'panel']);
  text('FW-2 walk: mismatch', 'amber', ['amber-bg']);
  text('FW-2 walk: decides', 'green', ['green-bg']);
  text('FW-2 walk: FastTrack', 'button-text', ['blue-bg']);
  line('FW-2 marked row edge', 'amber', ['surf', 'amber-bg', 'green-bg']);
  line('FW-2 focused row edge', 'blue', ['blue-bg', 'surf']);
  line('FW-2 goal edge', 'cyan', ['bg']);
  return out;
}

for (const name of ['dark', 'light']) {
  test(`contrast (${name} theme): routing text ≥ 4.5:1, lines and focus ≥ 3:1`, () => {
    const c = themeColours(name);
    const failures = pairs(c).map(([label, fg, bg, min]) => {
      assert.match(fg, /^#[0-9a-f]{6}$/, `${label}: foreground`);
      assert.match(bg, /^#[0-9a-f]{6}$/, `${label}: background`);
      const ratio = contrast(fg, bg);
      return ratio >= min ? null : `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)} < ${min}`;
    }).filter(Boolean);
    assert.deepEqual(failures, []);
  });
}

test('contrast helper: known WCAG ratios', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
  assert.equal(mix('#ff0000', 0.5, '#0000ff'), '#800080');
});

// Step 8: the IP screens (sections/ip/screens/*.css): the calculator's
// result, the ruler, the bit rows and the walk's cells, all on the panels.
function ipPairs(c) {
  const out = [];
  const text = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 4.5]));
  const line = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 3]));
  text('the block and the rows (title, text)', 'title', ['panel']);
  text('row names, notes, weights, band captions, the walk’s help line (muted)', 'muted', ['panel', 'surf']);
  text('captions («Приклад конфігурації», «Твої рядки»)', 'cyan', ['panel']);
  text('ruler: block ends', 'blue', ['panel']);
  text('ruler: the address', 'amber', ['panel']);
  text('walk: a step done ✓', 'green', ['panel']);
  text('walk: «Перевір цей октет»', 'amber', ['panel']);
  text('walk: a 1 cell', 'button-text', ['button-bg']);
  text('walk: a 0 cell', 'text', ['input-bg']);
  text('calculator: «останній правильний запис»', 'text', ['amber-bg']);
  text('commands', 'code', ['code-bg']);
  line('bit cell border', 'line', ['panel']);
  line('a 1 cell’s border', 'blue', ['panel']);
  line('a marked octet’s border', 'amber', ['panel', 'input-bg']);
  line('the prefix line', 'cyan', ['panel', 'input-bg']);
  return out;
}

for (const name of ['dark', 'light']) {
  test(`contrast (${name} theme): the IP screens, text ≥ 4.5:1, lines ≥ 3:1`, () => {
    const c = themeColours(name);
    const failures = ipPairs(c).map(([label, fg, bg, min]) => {
      const ratio = contrast(fg, bg);
      return ratio >= min ? null : `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)} < ${min}`;
    }).filter(Boolean);
    assert.deepEqual(failures, []);
  });
}

// VLAN-1: the VLAN screens (src/sections/vlan/screens/vlan.css): the diagram
// (PC boxes on --ng-net-fill, a picked PC on --ng-blue-bg, switches on
// --ng-surf), the walk's plates and ✕, the domains' badges and edges, the
// Winbox tables and the forms.
function vlanPairs(c) {
  const out = [];
  const text = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 4.5]));
  const line = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 3]));
  text('diagram text (names, addresses, port labels, tag plates)', 'text', ['svg-bg', 'net-fill', 'blue-bg', 'surf']);
  text('a PC’s VLAN and the source’s word', 'cyan', ['net-fill', 'blue-bg']);
  text('«✓ отримав»', 'green', ['net-fill', 'blue-bg']);
  text('«✕ з тегом» and a quiet ✕', 'amber', ['net-fill', 'svg-bg']);
  text('switch name', 'router-0', ['surf']);
  line('PC links and the PC box edge', 'line', ['svg-bg']);
  line('PC box edge', 'muted', ['svg-bg', 'net-fill']);
  line('trunks', 'link', ['svg-bg']);
  line('the walk and its plates', 'path', ['svg-bg', 'net-fill']);
  line('source and received edges', 'cyan', ['svg-bg', 'net-fill']);
  line('received edge', 'green', ['svg-bg', 'net-fill']);
  line('picked edge', 'blue', ['svg-bg', 'blue-bg']);
  line('✕ dot, and a leaked PC’s dashed edge', 'amber', ['svg-bg', 'net-fill']);
  line('the walk’s reachability note edge', 'blue', ['panel']);
  text('✕ on its dot', 'svg-bg', ['amber']);
  for (let i = 0; i < 8; i++) {
    line(`domain ${i} edge`, `router-${i}`, ['svg-bg', 'net-fill', 'blue-bg']);
    text(`domain ${i} badge number`, 'svg-bg', [`router-${i}`]);
  }
  text('tables and forms', 'text', ['surf', 'panel', 'input-bg']);
  text('table headers and captions', 'muted', ['surf', 'panel']);
  text('commands', 'code', ['code-bg']);
  text('pressed choices and members', 'button-text', ['button-bg']);
  line('pressed choice edge', 'blue', ['button-bg', 'panel']);
  line('member toggle edge', 'line', ['input-bg', 'surf']);
  line('VLAN Filtering edge', 'green', ['panel']);
  line('VLAN Filtering off edge', 'amber', ['panel']);
  line('marked field and row edges', 'amber', ['input-bg', 'surf', 'panel']);
  text('marked row header', 'amber', ['surf']);
  text('feedback (wrong round)', 'text', ['surf']);
  line('feedback edge (wrong round)', 'amber', ['surf']);
  // VLAN-2 «Між VLAN»: interface lines in the router and switch boxes
  // (--ng-surf): a trace's •, ✓ and ✕, shutdown, addresses; a PC's gateway.
  text('interface lines: taking part in a trace', 'cyan', ['surf']);
  text('interface lines: received', 'green', ['surf']);
  text('interface lines: dropped, shutdown', 'amber', ['surf']);
  text('interface lines: addresses, gateway', 'muted', ['surf']);
  text('a PC’s gateway line', 'text', ['net-fill', 'blue-bg']);
  line('a device the trace stops at', 'amber', ['svg-bg', 'surf']);
  line('the walk’s sub-heading edge', 'path', ['panel']);
  // The selected device (its form open): tinted with --ng-blue-bg, a blue outline, its tag and lines on the tint.
  text('selected device: its name', 'router-0', ['blue-bg']);
  text('selected device: tag and interface lines', 'text', ['blue-bg']);
  text('selected device: addresses, gateway', 'muted', ['blue-bg']);
  text('selected device: shutdown, a dropped line', 'amber', ['blue-bg']);
  text('selected device: a trace’s marks', 'cyan', ['blue-bg']);
  line('selected device: outline', 'blue', ['blue-bg', 'svg-bg']);
  text('device switcher’s choice (light theme fill)', 'panel', ['button-text']);
  // The walks in motion: the token (path, cyan for R1's new frame, a domain's
  // colour on the lap: their edges are tested above), «VLAN N» on its plate, the router-hop caption.
  text('a «VLAN N» chip', 'text', ['svg-bg']);
  line('a «VLAN N» chip’s edge, the router-hop caption’s edge', 'cyan', ['svg-bg', 'panel']);
  line('device switcher’s choice against its panel (light theme)', 'button-text', ['panel']);
  text('Cisco’s task-4 line in the header', 'muted', ['bg']);
  // VLAN-3 «Знайди несправність»: the grid's rows (on --ng-surf; the row whose
  // walk is shown on --ng-blue-bg) with ✓ так, ✕ ні and the muted expected ✓,
  // their edges; a chosen cause; the level line; the reveal's Було/Стало edges.
  text('grid rows: words, ✓ так, ✕ ні, expected', 'text', ['surf', 'blue-bg']);
  text('grid rows: ✓ так', 'green', ['surf', 'blue-bg']);
  text('grid rows: ✕ ні', 'amber', ['surf', 'blue-bg']);
  text('grid rows: the expected ✓ and its divider', 'muted', ['surf', 'blue-bg']);
  line('grid rows: passing and failing edges', 'green', ['surf', 'panel']);
  line('grid rows: failing edge', 'amber', ['surf', 'panel']);
  line('grid row shown, chosen cause: edge', 'blue', ['blue-bg', 'panel']);
  text('chosen cause', 'text', ['blue-bg']);
  text('the level line', 'text', ['bg']);
  return out;
}

for (const name of ['dark', 'light']) {
  test(`contrast (${name} theme): the VLAN screens, text ≥ 4.5:1, lines ≥ 3:1`, () => {
    const c = themeColours(name);
    const failures = vlanPairs(c).map(([label, fg, bg, min]) => {
      const ratio = contrast(fg, bg);
      return ratio >= min ? null : `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)} < ${min}`;
    }).filter(Boolean);
    assert.deepEqual(failures, []);
  });
}

// DR-1: «Налаштування з нуля» (src/sections/setup/screens/setup.css) and the
// generic ReorderList and CopyBlock (src/ui/components): rows on --ng-surf,
// a carried row on --ng-blue-bg, handles and moves on --ng-input-bg, the
// marks and the wrong part in amber, scripts on --ng-code-bg.
function setupPairs(c) {
  const out = [];
  const text = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 4.5]));
  const line = (label, fg, bgs) => bgs.forEach(bg => out.push([`${label} on ${bg}`, c[fg] ?? fg, c[bg] ?? bg, 3]));
  text('commands, descriptions, the typed field', 'text', ['surf', 'blue-bg', 'input-bg', 'bg']);
  text('heading, captions, keyboard line, profile, a typed card’s note, the grip, DR-3’s Winbox line, unchosen decks', 'muted', ['bg', 'surf', 'blue-bg', 'input-bg']);
  text('handle number and moves', 'text', ['input-bg']);
  text('a carried handle', 'button-text', ['button-bg']);
  text('prompt options', 'muted', ['surf', 'blue-bg']);
  text('a chosen prompt or deck', 'button-text', ['button-bg']);
  text('a chosen prompt, way or deck (light theme fill)', 'panel', ['button-text']);
  line('a chosen prompt’s fill against the row (light theme)', 'button-text', ['surf', 'bg']);
  text('«• Ще ні» on a row', 'amber', ['surf', 'blue-bg']);
  text('the wrong part', 'text', ['amber-bg']);
  text('«✓ Так» on a typed card', 'green', ['surf', 'blue-bg']);
  text('the side: notes, tips, feedback', 'text', ['bg', 'surf', 'green-bg', 'amber-bg']);
  text('scripts', 'code', ['code-bg']);
  // Round 4: the script on the board (prompt gutter, «перехід» and «як у роутері» tags,
  // Winbox paths, dimmed lines, recall's «…», the login-check pause), recall lines on rows.
  text('the script’s lines and its login-check pause, a recall line’s description and verdict', 'text', ['surf']);
  text('the script’s gutter, tags, paths and dimmed lines', 'muted', ['surf']);
  text('a recall line still to type («…»)', 'amber', ['surf']);
  text('«режим?», a recall prompt, the read-only chosen prompt', 'muted', ['surf']);
  text('a recall line’s ✓', 'green', ['surf']);
  line('a recall line that is right', 'green', ['surf', 'bg']);
  // Row, option and button edges (--ng-stroke) are decoration: each control
  // is named by its own text, so they carry no 3:1 requirement.
  line('a carried row’s dashed edge', 'blue', ['blue-bg', 'bg']);
  line('a marked row, a marked group, the wrong part’s underline', 'amber', ['surf', 'bg', 'amber-bg', 'input-bg']);
  line('the typed field’s edge', 'line', ['input-bg', 'surf']);
  line('focus ring', 'focus', ['bg', 'surf', 'blue-bg', 'input-bg', 'button-bg']);
  return out;
}

for (const name of ['dark', 'light']) {
  test(`contrast (${name} theme): the setup drill, text ≥ 4.5:1, lines ≥ 3:1`, () => {
    const c = themeColours(name);
    const failures = setupPairs(c).map(([label, fg, bg, min]) => {
      const ratio = contrast(fg, bg);
      return ratio >= min ? null : `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)} < ${min}`;
    }).filter(Boolean);
    assert.deepEqual(failures, []);
  });
}

// Step 8 fix: every placeholder's rendered colour (its colour at its opacity,
// composited over its field's background) is at least 4.5:1, in both themes.
// The rules are read from the CSS itself, so an opacity added later is caught.
function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}
function placeholders() {
  const out = [];
  for (const file of cssFiles(new URL('../src/', import.meta.url))) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...text.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
    for (const rule of rules.filter(r => r.selector.includes('::placeholder'))) {
      const field = rule.selector.replace('::placeholder', '');
      const base = rules.find(r => r.selector === field)?.body ?? '';
      out.push({
        label: `${file.pathname.split('/src/')[1]} ${rule.selector}`,
        colour: rule.body.match(/(?:^|;|\s)color:\s*var\(--ng-([\w-]+)\)/)?.[1],
        opacity: Number(rule.body.match(/opacity:\s*([\d.]+)/)?.[1] ?? 1),
        background: base.match(/background(?:-color)?:\s*var\(--ng-([\w-]+)\)/)?.[1] ?? 'input-bg',
      });
    }
  }
  return out;
}

for (const name of ['dark', 'light']) {
  test(`contrast (${name} theme): every placeholder as rendered (colour × opacity over its field) ≥ 4.5:1`, () => {
    const c = themeColours(name);
    const found = placeholders();
    assert.ok(found.length >= 3, `placeholder rules found: ${found.length}`);
    const failures = found.map(({ label, colour, opacity, background }) => {
      assert.ok(colour && c[colour], `${label}: a token colour`);
      const rendered = mix(c[colour], opacity, c[background]);
      const ratio = contrast(rendered, c[background]);
      return ratio >= 4.5 ? null : `${label}: ${c[colour]} at ${opacity} on ${c[background]} = ${ratio.toFixed(2)}`;
    }).filter(Boolean);
    assert.deepEqual(failures, []);
  });
}

test('contrast: the placeholder check catches a placeholder at 0.8 opacity', () => {
  const c = themeColours('dark');
  assert.ok(contrast(mix(c.muted, 0.8, c['input-bg']), c['input-bg']) < 4.5, 'muted at 0.8 composites below 4.5:1');
});
