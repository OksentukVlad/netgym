// The R5 must-see checker (round 5, spec 5a §2D, v2 D, v2.1, v2.2) on
// fixtures in a real browser (tools/shots.mjs measureEssentials): what a
// first view's declared essentials must be, measured as painted.
// Negative fixtures must fail: a missing essential, an empty one, a wrong
// count, text scaled too small (SVG, scaleY, a small tspan), transparent
// text, partial occlusion, a narrow strip between any sample points, v11's
// clipped «bridge · LAN 192.168.88.1» at 1000 × 700 (inside an aria-hidden
// SVG), text clipped by its own overflow, an ancestor, an SVG viewport or a
// <g> clip-path, opaque and semi-opaque pointer-events: none overlays
// (inline !important too), an SVG shape painted over a label, text below
// the fold. Positive: a visible label inside aria-hidden,
// a transparent overlay that paints nothing, a box drawn under its label.
// Plus the recipe rule: a first view that must declare essentials and
// declares none fails. Needs Playwright's Chromium (tools/browser.mjs): a
// missing browser fails, unless NETGYM_ALLOW_NO_BROWSER=1 allows a skip locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { browserSkip, launchChromium } from '../tools/browser.mjs';
import { declaredEssentials, essentialRecipes, essentialsOf, expectedTargets, gateStates, measureEssentials, MIN_FONT_PX } from '../tools/shots.mjs';

const missing = browserSkip();

test('R5 recipe: firewall prediction declares its essentials on both levels\' first views; a first view without them fails', () => {
  assert.ok(essentialRecipes.has('fw-predict'));
  const sels = list => list.map(e => (typeof e === 'string' ? e : e.sel));
  const l1raw = essentialsOf('fw-predict', 'l1-first'), l2raw = essentialsOf('fw-predict', 'first');
  const l1 = sels(l1raw), l2 = sels(l2raw);
  const countOf = (list, part) => list.find(e => typeof e !== 'string' && e.sel.includes(part))?.count;
  // Counts (repair 1, 4): both choices, all three router-address lines, each card field on its own.
  for (const list of [l1raw, l2raw]) {
    assert.equal(countOf(list, '.ng-fw-door-option'), 2);
    assert.equal(countOf(list, 'label:fw-label-router-addresses'), 3);
  }
  assert.deepEqual(l1.filter(x => x.includes('data-field')), ['from', 'to'].map(f => `.ng-fw-card [data-field~="${f}"]`));
  assert.deepEqual(l2.filter(x => x.includes('data-field')), ['from', 'to', 'ports', 'state', 'nat'].map(f => `.ng-fw-card [data-field~="${f}"]`));
  assert.ok(l1.includes('.ng-fw-rule-sentence') && !l2.includes('.ng-fw-rule-sentence'), 'the rule sentence at level 1 only (v2.1)');
  for (const list of [l1, l2]) for (const part of ['.ng-fw-variant-text', '.ng-fw-work .ng-action-line', '.ng-fw-card [data-field', '.ng-fw-door-option',
    'label:fw-label-router-addresses', 'label:fw-label-pc-address', 'label:fw-label-internet-address']) assert.ok(list.some(s => s.includes(part)), part);
  assert.ok(l2.some(s => s.includes('label:fw-label-server-address')) && !l1.some(s => s.includes('server')), 'the server is a destination at level 2 only');
  assert.deepEqual(essentialsOf('fw-predict', 'l1-card2'), l1raw, 'each level 1 card is measured');
  assert.deepEqual(essentialsOf('fw-predict', 'l2-card4'), l2raw, 'each level 2 card is measured (repair 4)');
  for (const state of ['l1-card3', 'l2-card2', 'l2-card6']) assert.ok(gateStates({ id: 'fw-predict', states: ['first', 'l1-first'] }).includes(state), state);
  assert.equal(expectedTargets('fw-predict', 'l2-card3').kind, null);
  assert.equal(expectedTargets('fw-predict', 'l1-card2').kind, null, 'a first view: nothing may scroll there');
  assert.deepEqual(declaredEssentials('fw-predict', 'first').failures, []);
  assert.deepEqual(declaredEssentials('fw-predict', 'wrong'), { list: [], failures: [] }, 'later states declare none');
  // A recipe that declares nothing (5b-1 VLAN now declares its own: the fixture is a made-up id).
  assert.deepEqual(declaredEssentials('r5-undeclared', 'first'), { list: [], failures: [] }, 'not required: nothing declared, nothing failed');
  essentialRecipes.add('r5-undeclared');
  try {
    assert.match(declaredEssentials('r5-undeclared', 'first').failures[0].reason, /declares no essentials/, 'required and missing: fails');
  } finally { essentialRecipes.delete('r5-undeclared'); }
  // VLAN (5b-1): every screen's first view declares its essentials; «all» counts come from the task.
  for (const id of ['vl-predict', 'vl-ports', 'vl-route', 'vl-fault', 'vl-predict-mt', 'vl-route2', 'vl-fault3']) {
    const { list, failures } = declaredEssentials(id, 'first');
    assert.ok(essentialRecipes.has(id.replace(/-mt$|\d$/, '')) && list.length >= 5 && failures.length === 0, id);
    assert.ok(list.some(e => e.sel.includes('.ng-action-line') && e.count === 1), `${id}: the action line, once`);
    assert.ok(list.every(e => e.count !== undefined || e.countAttr !== undefined), `${id}: every entry counted`);
  }
  assert.equal(MIN_FONT_PX, 12);
});

const page = body => `<!doctype html><html><head><style>
  body { margin: 0; font: 16px sans-serif; background: #111; color: #eee; }
  .frame { width: 500px; height: 320px; overflow: hidden; border: 1px solid #555; }
  .over { position: absolute; pointer-events: none; }
</style></head><body>${body}</body></html>`;
// v11's firewall diagram at 1000 × 700: a 668-unit drawing at 12 px text in a frame about 500 px wide.
const v11 = (x, hidden = 'aria-hidden="true"') => `<div class="frame"><svg ${hidden} viewBox="0 0 668 304" width="668" height="304">
  <rect x="236" y="24" width="200" height="252" fill="#123"/>
  <text class="label" x="${x}" y="202" font-size="12" fill="#ddd" font-family="monospace">bridge · LAN 192.168.88.1</text></svg></div>`;
const fixtures = {
  'plain text': { html: '<p class="e">Обери, кому адресовано пакет.</p>', pass: true },
  'missing essential': { html: '<p>other</p>', fail: /missing essential/ },
  'empty essential': { html: '<p class="e">   </p>', fail: /empty essential/ },
  'text scaled too small (SVG)': { html: '<svg width="200" height="100" viewBox="0 0 400 200"><text class="e" x="10" y="50" font-size="12" fill="#fff">192.168.88.1</text></svg>', fail: /too small/ },
  'text scaled too small (CSS)': { html: '<p class="e" style="font-size: 10px">дрібно</p>', fail: /too small/ },
  'partial occlusion': { html: '<p class="e" style="position:absolute; left:20px; top:20px; margin:0">192.168.88.1 — адреса</p><div style="position:absolute; left:80px; top:10px; width:200px; height:40px; background:#222"></div>', fail: /painted over by div/ },
  'v11 clipped label inside aria-hidden': { html: v11(470), essentials: ['.label'], fail: /clipped by div\.frame/ },
  'visible label inside aria-hidden': { html: v11(240), essentials: ['.label'], pass: true },
  'opaque pointer-events:none overlay': { html: '<p class="e" style="margin:20px">192.168.88.1</p><div class="over" style="left:0; top:0; width:300px; height:80px; background:#000"></div>', fail: /painted over by div\.over/ },
  'semi-opaque pointer-events:none fill': { html: '<p class="e" style="margin:20px">192.168.88.1</p><div class="over" style="left:0; top:0; width:300px; height:80px; background:rgba(255,0,0,0.3)"></div>', fail: /painted over/ },
  'transparent overlay, nothing painted': { html: '<p class="e" style="margin:20px">192.168.88.1</p><div class="over" style="left:0; top:0; width:300px; height:80px; opacity:1; background:transparent"></div>', pass: true },
  'invisible overlay (opacity 0)': { html: '<p class="e" style="margin:20px">192.168.88.1</p><div class="over" style="left:0; top:0; width:300px; height:80px; opacity:0; background:#000"></div>', pass: true },
  'SVG shape painted over a label': { html: '<svg aria-hidden="true" width="300" height="100"><text class="e" x="10" y="40" font-size="14" fill="#fff">192.168.88.10</text><rect x="0" y="20" width="300" height="30" fill="#000" style="pointer-events:none"/></svg>', fail: /painted over by rect/ },
  'SVG box under its label, outline around it': { html: '<svg aria-hidden="true" width="300" height="100"><rect x="0" y="20" width="300" height="30" fill="#234"/><text class="e" x="10" y="40" font-size="14" fill="#fff">192.168.88.10</text><rect x="4" y="24" width="120" height="22" fill="none" stroke="#fb0" stroke-width="2"/></svg>', pass: true },
  'below the fold': { html: '<div style="height:800px"></div><p class="e">Обери, кому адресовано пакет.</p>', fail: /outside the viewport/ },
  'hidden by visibility': { html: '<p class="e" style="visibility:hidden">x</p>', fail: /not rendered/ },
  // Repair v1 (Astra 1–4).
  'HTML text clipped by its own overflow': { html: '<p class="e" style="width:60px; overflow:hidden; white-space:nowrap">192.168.88.1 — адреса</p>', fail: /clipped by p\.e/ },
  'HTML text partly clipped by an ancestor': { html: '<div style="width:120px; overflow:hidden"><span class="e" style="white-space:nowrap">192.168.88.1 — адреса роутера</span></div>', fail: /clipped by div/ },
  'SVG text partly outside its viewport': { html: '<svg width="80" height="40"><text class="e" x="10" y="25" font-size="14" fill="#fff">192.168.88.10</text></svg>', fail: /clipped by svg/ },
  'SVG text cut by a <g> clip-path': { html: '<svg width="300" height="60"><defs><clipPath id="c"><rect x="0" y="0" width="60" height="60"/></clipPath></defs><g clip-path="url(#c)"><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text></g></svg>', fail: /clipped by g/ },
  'a narrow opaque strip between sample points': { html: '<p class="e" style="position:absolute; left:20px; top:20px; margin:0; font-size:16px">192.168.88.1 — адреса</p><div style="position:absolute; left:57px; top:10px; width:2px; height:40px; background:#000"></div>', fail: /painted over by div/ },
  'an inline pointer-events:none !important overlay': { html: '<p class="e" style="margin:20px">192.168.88.1</p><div style="position:absolute; left:0; top:0; width:300px; height:80px; background:#000; pointer-events:none !important"></div>', fail: /painted over by div/ },
  'an overlay over an aria-hidden SVG label': { html: '<svg aria-hidden="true" width="300" height="60"><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text></svg><div class="over" style="left:0; top:0; width:300px; height:60px; background:rgba(0,0,0,0.5)"></div>', fail: /painted over by div\.over/ },
  'HTML text squashed by scaleY(.25)': { html: '<p class="e" style="margin:20px; font-size:16px; transform:scaleY(.25)">192.168.88.1</p>', fail: /too small/ },
  'a small <tspan> inside normal SVG text': { html: '<svg width="300" height="60"><text class="e" x="10" y="30" font-size="14" fill="#fff">адреса <tspan font-size="7">192.168.88.1</tspan></text></svg>', fail: /too small: [3-8]\.\d px/ },
  'transparent text': { html: '<p class="e" style="margin:20px; color:transparent">192.168.88.1</p>', fail: /not painted/ },
  'transparent SVG text': { html: '<svg width="300" height="60"><text class="e" x="10" y="30" font-size="14" fill="none">192.168.88.1</text></svg>', fail: /not painted/ },
  'one choice where two are required': { html: '<button class="e">самому роутеру → input</button>', essentials: [{ sel: '.e', count: 2 }], fail: /expected 2, found 1/ },
  'both choices': { html: '<button class="e">самому роутеру → input</button><button class="e">іншому пристрою → forward</button>', essentials: [{ sel: '.e', count: 2 }], pass: true },
  // Recheck (Astra 5a-astra-2): clipped-away overlays, stroke extent, width and text fill.
  'an SVG overlay clipped away by its <g> clip-path': { html: '<svg width="300" height="60"><defs><clipPath id="away"><rect x="200" y="0" width="100" height="60"/></clipPath></defs><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text><g clip-path="url(#away)"><rect x="0" y="0" width="300" height="60" fill="#000"/></g></svg>', pass: true },
  'an SVG overlay clipped away by its own clip-path': { html: '<svg width="300" height="60"><defs><clipPath id="own"><rect x="200" y="0" width="100" height="60"/></clipPath></defs><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text><rect clip-path="url(#own)" x="0" y="0" width="300" height="60" fill="#000"/></svg>', pass: true },
  'an SVG overlay whose clip leaves the text covered': { html: '<svg width="300" height="60"><defs><clipPath id="on"><rect x="0" y="0" width="150" height="60"/></clipPath></defs><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text><g clip-path="url(#on)"><rect x="0" y="0" width="300" height="60" fill="#000"/></g></svg>', fail: /painted over by rect/ },
  'an HTML overlay clipped away by its container': { html: '<p class="e" style="position:absolute; left:20px; top:20px; margin:0">192.168.88.1</p><div style="position:absolute; left:0; top:0; width:300px; height:15px; overflow:hidden"><div style="height:80px; background:#000"></div></div>', pass: true },
  'a thick horizontal SVG line over a label': { html: '<svg width="300" height="60"><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text><line x1="0" y1="25" x2="300" y2="25" stroke="#000" stroke-width="12"/></svg>', fail: /painted over by line/ },
  'a thin line beside a label': { html: '<svg width="300" height="60"><text class="e" x="10" y="30" font-size="14" fill="#fff">192.168.88.10</text><line x1="0" y1="50" x2="300" y2="50" stroke="#000" stroke-width="2"/></svg>', pass: true },
  'HTML text squashed by scaleX(.01)': { html: '<p class="e" style="margin:20px; font-size:16px; transform:scaleX(.01); transform-origin:left">192.168.88.1</p>', fail: /too small/ },
  'transparent -webkit-text-fill-color': { html: '<p class="e" style="margin:20px; -webkit-text-fill-color:transparent">192.168.88.1</p>', fail: /not painted/ },
  'wrapped HTML text at 12 px': { html: '<p class="e" style="width:200px; font-size:12px">Адреса «Куди» належить самому роутеру — це input. Іншому пристрою — це forward.</p>', pass: true },
  'normal SVG text at scale 1': { html: '<svg width="300" height="60"><text class="e" x="10" y="30" font-size="12" font-weight="700" font-family="monospace" fill="#fff">bridge · 192.168.88.1</text></svg>', pass: true },
  // Round 6 (the phone contract): `reach` is measured after scrolling vertically to each run; `first: n` in view, the rest reachable.
  'below the fold, reachable': { html: '<div style="height:1600px"></div><p class="e">Обери, кому адресовано пакет.</p>', essentials: [{ sel: '.e', reach: true }], pass: true },
  'below the fold inside a scroller, reachable': { html: '<div style="height:300px; overflow:auto"><div style="height:900px"></div><p class="e">192.168.88.1</p></div>', essentials: [{ sel: '.e', reach: true }], pass: true },
  'reachable, but cut off at the right': { html: '<div style="height:1600px"></div><div style="width:120px; overflow:hidden"><span class="e" style="white-space:nowrap">192.168.88.1 — адреса роутера</span></div>', essentials: [{ sel: '.e', reach: true }], fail: /clipped by div/ },
  'reachable, but too small': { html: '<div style="height:1600px"></div><p class="e" style="font-size:10px">дрібно</p>', essentials: [{ sel: '.e', reach: true }], fail: /too small/ },
  'reachable, but painted over': { html: '<div style="height:1600px"></div><div style="position:relative"><p class="e" style="margin:0">192.168.88.1 — адреса</p><div style="position:absolute; left:0; top:0; width:300px; height:30px; background:#000"></div></div>', essentials: [{ sel: '.e', reach: true }], fail: /painted over by div/ },
  'the first in view, the rest reachable': { html: '<p class="e">перша</p><div style="height:1600px"></div><p class="e">друга</p><p class="e">третя</p>', essentials: [{ sel: '.e', count: 3, first: 1 }], pass: true },
  'the second of two first-view matches below the fold': { html: '<p class="e">перша</p><div style="height:1600px"></div><p class="e">друга</p>', essentials: [{ sel: '.e', count: 2, first: 2 }], fail: /outside the viewport/ },
};

test('R5 checker\'s known limit can\'t bite: src/ has no CSS clip-path and no clipPath with more than one shape', () => {
  // The checker treats a clip region as its shapes' joint box and a CSS basic shape as the element's box
  // (a documented limit of the checker); NetGym uses neither, and this keeps it so.
  const files = [];
  const walk = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (/\.(css|jsx?|mjs)$/.test(entry.name)) files.push(p); } };
  walk(fileURLToPath(new URL('../src', import.meta.url)));
  assert.ok(files.length > 50);
  for (const file of files) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /(^|[\s;{])clip-path\s*:|clipPath\s*:\s*['"`]/m, `${file}: CSS clip-path`);
    for (const m of code.matchAll(/<clipPath\b[^>]*>([\s\S]*?)<\/clipPath>/g)) assert.ok((m[1].match(/<[a-z]/g) ?? []).length <= 1, `${file}: a clipPath with more than one shape`);
  }
});

test('R5 checker: the fixtures in Chromium (1000 × 700)', { skip: missing }, async () => {
  const browser = await launchChromium();
  try {
    const p = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    for (const [name, f] of Object.entries(fixtures)) {
      await p.setContent(page(f.html));
      const result = await p.evaluate(measureEssentials, { essentials: f.essentials ?? ['.e'], minFont: MIN_FONT_PX });
      const reasons = result.failures.map(x => x.reason);
      if (f.pass) assert.deepEqual(reasons, [], name);
      else assert.ok(reasons.some(r => f.fail.test(r)), `${name}: ${JSON.stringify(reasons)}`);
    }
    // Round 6: measuring reachable runs puts every scroller back where it was.
    await p.setContent(page('<p>top</p><div id="inner" style="height:200px; overflow:auto"><div style="height:900px"></div><p class="e">x</p></div><div style="height:1600px"></div><p class="e">y</p>'));
    await p.evaluate(() => { window.scrollTo(0, 37); document.getElementById('inner').scrollTop = 11; });
    const reached = await p.evaluate(measureEssentials, { essentials: [{ sel: '.e', reach: true }], minFont: MIN_FONT_PX });
    assert.deepEqual(reached.failures, [], 'both reachable');
    assert.deepEqual(await p.evaluate(() => [scrollY, document.getElementById('inner').scrollTop]), [37, 11], 'scroll positions put back');
    // The checker leaves the page as it was: forced pointer-events and its probe are removed.
    await p.setContent(page('<p class="e" style="margin:20px">x</p><div id="o" style="pointer-events:none !important">y</div>'));
    await p.evaluate(measureEssentials, { essentials: ['.e'], minFont: MIN_FONT_PX });
    assert.deepEqual(await p.evaluate(() => { const o = document.getElementById('o').style; return [document.querySelector('.e').getAttribute('style'), o.getPropertyValue('pointer-events'), o.getPropertyPriority('pointer-events'), document.body.children.length]; }), ['margin: 20px;', 'none', 'important', 2]);
  } finally { await browser.close(); }
});
