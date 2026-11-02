// NetGym's diagram (round 2 step 7): the shared geometry with the NetGym
// font set for the routing screen, DIAGRAM_FONT (unchanged) for the round 1
// apps, and the size rule that decides which tasks use the pannable frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { topology } from '../src/sections/routing/logic/topology.js';
import routing from './helpers/routing.mjs';
import { diagramGeometry, DIAGRAM_FONT, DIAGRAM_R, NETGYM_DIAGRAM_FONT } from '../src/ui/topology/geometry.js';
import { diagramFit, MAX_SCALE, MIN_TEXT_PX, smallestText } from '../src/ui/topology/size.js';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';

const F = NETGYM_DIAGRAM_FONT;
// Text extents as in tests/diagram.test.mjs: monospace 0.62 em per character;
// bold sans 0.78 em for capitals, digits and Cyrillic, 0.62 otherwise; glyphs
// from 0.8 em above the baseline to 0.25 em below.
function textWidth(text, size, sans) {
  let em = 0;
  for (const ch of String(text)) em += !sans ? 0.62 : /[A-Z0-9Ѐ-ӿ]/.test(ch) ? 0.78 : 0.62;
  return em * size;
}
const EPS = 1e-9;
const inside = (b, vb) => b.x >= vb.x - EPS && b.y >= vb.y - EPS && b.x + b.w <= vb.x + vb.w + EPS && b.y + b.h <= vb.y + vb.h + EPS;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hitsCircle = (b, c) => Math.hypot(Math.max(b.x - c.x, 0, c.x - b.x - b.w), Math.max(b.y - c.y, 0, c.y - b.y - b.h)) < c.r;
const cases = () => tasks.flatMap(record => syntaxList.map(syntax => ({ record, syntax, topo: topology(record.network, syntax.id) })));

test('NetGym diagram: the NetGym font set, no clashes, every text inside its box and the viewBox, for all 16 tasks in both syntaxes', () => {
  assert.equal(F.model, undefined, 'no model line');
  for (const { record, syntax, topo } of cases()) {
    const label = `#${record.displayNumber} ${syntax.id}`;
    const geo = diagramGeometry(topo, topo, undefined, F);
    assert.deepEqual(geo.clashes, [], `${label}: clashes`);
    const circles = geo.routers.map(r => ({ name: r.name, x: r.x, y: r.y, r: DIAGRAM_R.ring + 0.25 }));
    const boxes = [];
    for (const l of geo.links) {
      const [net, ports] = l.label.lines;
      assert.deepEqual([net.size, ports.size], [F.net, F.ports], label);
      assert.ok(Math.max(textWidth(net.text, net.size), textWidth(ports.text, ports.size)) <= l.label.w, `${label}: link ${l.network} label fits`);
      boxes.push({ id: `link ${l.network}`, ...l.label });
    }
    for (const e of geo.endpoints) {
      assert.deepEqual(e.lines.map(l => l.size), [F.label, F.ip, F.prefix].slice(0, e.lines.length), label);
      for (const line of e.lines) {
        const w = textWidth(line.text, line.size, line.sans), top = line.dy - 0.8 * line.size, bottom = line.dy + 0.25 * line.size;
        if (e.shape === 'rect') assert.ok(w <= e.box.w && top >= -e.box.h / 2 && bottom <= e.box.h / 2, `${label}: "${line.text}" fits its box`);
        else assert.ok((w / 2 / e.box.rx) ** 2 + (Math.max(Math.abs(top), Math.abs(bottom)) / e.box.ry) ** 2 <= 1, `${label}: "${line.text}" fits its ellipse`);
      }
      // Lines don't overlap each other inside a box.
      for (let i = 1; i < e.lines.length; i++) assert.ok(e.lines[i - 1].dy + 0.25 * e.lines[i - 1].size <= e.lines[i].dy - 0.8 * e.lines[i].size + 0.35, `${label}: "${e.lines[i].text}" below "${e.lines[i - 1].text}"`);
      boxes.push({ id: `${e.type} ${e.key}`, ...e.box });
      if (e.port) {
        assert.equal(e.port.size, F.port);
        const base = e.port.cy + 0.36 * e.port.size, w = textWidth(e.port.text, e.port.size);
        boxes.push({ id: `port ${e.key}`, x: e.port.cx - w / 2, y: base - 0.8 * e.port.size, w, h: 1.05 * e.port.size });
      }
    }
    for (const r of geo.routers) {
      assert.ok(r.nameSize <= F.name && textWidth(r.name, r.nameSize, true) <= 12.6 + EPS, `${label}: ${r.name} fits its circle`);
    }
    for (const c of circles) assert.ok(inside({ x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r }, geo.viewBox), `${label}: ${c.name} inside`);
    for (const b of boxes) assert.ok(inside(b, geo.viewBox), `${label}: ${b.id} inside`);
    for (const b of boxes) for (const c of circles) assert.ok(!hitsCircle(b, c), `${label}: ${b.id} overlaps ${c.name}`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${label}: ${boxes[i].id} overlaps ${boxes[j].id}`);
  }
});

test('NetGym diagram: the round 1 apps keep DIAGRAM_FONT (the default), so their geometry is unchanged', () => {
  for (const { topo } of cases()) assert.deepEqual(diagramGeometry(topo, topo), diagramGeometry(topo, topo, undefined, DIAGRAM_FONT));
  assert.deepEqual(DIAGRAM_FONT, { net: 2.5, ports: 2.05, label: 2.9, ip: 2.4, prefix: 2.1, port: 2.1, name: 3.6, model: 2 });
});

test('NetGym diagram: the routing screen draws the NetGym sizes and no «Cisco»/«MikroTik» in the circles', () => {
  for (const { record, syntax } of cases()) {
    const html = surfaces.renderTopology(routing.create(record), syntax);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    assert.ok(!/>(Cisco|MikroTik)</.test(svg), `#${record.displayNumber} ${syntax.id}: no model line`);
    const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => Number(m[1]));
    assert.ok(sizes.length > 0 && Math.min(...sizes) >= F.prefix - EPS, `#${record.displayNumber}: smallest ${Math.min(...sizes)}`);
    assert.ok(sizes.includes(F.label) && (!svg.includes('ng-dg-net-box') || sizes.includes(F.net)), `#${record.displayNumber}: NetGym sizes`);
  }
});

// The size rule (ARCHITECTURE §6): scale = min(frameWidth / vb.w, frameHeight / vb.h);
// if the smallest text is under 12 px there, keep 12 px in a pannable frame.
test('diagram size rule: 12 px minimum, MAX_SCALE cap, pannable beyond', () => {
  assert.deepEqual(diagramFit({ w: 100, h: 50 }, 2.5, { width: 1000, height: 1000 }), { pan: false, scale: MAX_SCALE, width: 800, height: 400, minPx: 20 });
  const fit = diagramFit({ w: 200, h: 100 }, 2.5, { width: 600, height: 400 });
  assert.deepEqual(fit, { pan: true, scale: 4.8, width: 960, height: 480, minPx: MIN_TEXT_PX });
  assert.equal(diagramFit({ w: 100, h: 100 }, 2.5, { width: 480, height: Infinity }).pan, false, '4.8 px per unit is exactly 12 px');
});

/**
 * The desk frame: the diagram column at 1280 px wide (routing.css, TopologyMap
 * FRAME_PAD), inside the frame's padding:
 *   width  1280 − 2·12 main padding − 10 gap − 540 work panel − 2·6 − 2 stage
 *          padding and border − 2·8 − 2 frame padding and box border = 674
 *   height H − 55 bar − 18 main padding − 44 task bar − 6 − 6 − 2 gaps
 *          − 14 stage padding and border − 18.2 caption
 *          − 6 + 44 the frame's tool row («Правила», zoom; step 7 fix)
 *          − 8 − 6 gaps − 44 router buttons − 18 frame padding and box border
 *          − 24.3 per description line                                = H − 289.2 − 24.3·lines
 * With a two-line description: 674 × 462 at 1280×800, 674 × 422 at 1280×760.
 * Tasks 3 and 8 put the variant switch on a second task bar row (56 px less);
 * task 16's seven router buttons and «Текстом» take two rows (50 px less).
 * The browser check measures the real frames (step7-after-fix: 690 × 503
 * with padding for a one-line task at 1280×800, 487 inside) and reports the
 * same list.
 */
export function deskFrame(record, viewportHeight) {
  const extra = (record.variants.length > 1 ? 56 : 0) + (record.network.devices.filter(d => d.kind === 'router').length > 5 ? 50 : 0);
  return { width: 674, height: viewportHeight - 289.2 - 2 * 24.3 - extra };
}

export function pannableTasks(viewportHeight) {
  const out = new Set();
  for (const record of tasks) for (const variant of record.variants) for (const syntax of syntaxList) {
    const topo = topology(record.network, syntax.id);
    const geo = diagramGeometry(topo, topo, undefined, F);
    if (diagramFit(geo.viewBox, smallestText(geo), deskFrame(record, viewportHeight)).pan) out.add(`${record.displayNumber}${variant.code.replace(/^\d+/, '')} ${syntax.id}`);
  }
  return [...out];
}

test('diagram size rule: which tasks use the pannable frame on the class PCs (1280×800 and 1280×760)', t => {
  const at800 = pannableTasks(800), at760 = pannableTasks(760);
  t.diagnostic(JSON.stringify({ frame800: { width: 674, height: 462 }, frame760: { width: 674, height: 422 }, pannable800: at800, pannable760: at760 }));
  // Task 10 needs 682 px in MikroTik (its port names are longer), 629 in Cisco.
  const expected = [...['7', '8', '8b', '9', '11', '16', '17'].flatMap(n => ['cisco', 'routeros'].map(s => `${n} ${s}`)), '10 routeros'];
  assert.deepEqual(at800.sort(), expected.sort());
  assert.deepEqual(at760.sort(), expected.sort());
});
