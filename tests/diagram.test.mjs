// The shared diagram geometry (src/ui/topology/geometry.js) with the round 1
// font set, DIAGRAM_FONT, for all 16 bank tasks in both syntaxes: the
// invariants the round 1 apps' diagrams were tested for, kept when the apps
// were retired (step 8). The bank's topology gives the same geometry the
// apps drew (routing-bank.test.mjs: the frozen topology and the geometry
// SHA-256 snapshot); NetGym's own font set is in netgym-diagram.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { topology } from '../src/sections/routing/logic/topology.js';
import { diagramGeometry, DIAGRAM_FONT, DIAGRAM_R, mixHex } from '../src/ui/topology/geometry.js';

/** The bank's tasks as each round 1 app drew them: its topology, geometry and number. */
const appOf = syntax => ({
  DIAGRAM_FONT, DIAGRAM_R, mixHex,
  TASKS: tasks.map(record => ({ id: record.displayNumber, topo: topology(record.network, syntax) })),
  diagramGeometry: task => diagramGeometry(task.topo, task.topo),
});
const cisco = appOf('cisco'), mikrotik = appOf('routeros');

// Text extents, in viewBox units, from the font sizes TopologyMap draws with
// (DIAGRAM_FONT, router nameSize, port size). Advance per character, measured in
// Chromium: monospace 0.60 em (DejaVu Sans Mono, Liberation Mono = Courier New
// metrics; Consolas is 0.55), so 0.62 em here. Bold sans-serif: DejaVu Sans Bold
// reaches 0.74 em per character on capitals-only words (VLAN10, LAN-HUB), Arial
// Bold 0.66 em, lowercase less, so 0.78 em for capitals, digits and Cyrillic and
// 0.62 em for the rest. Glyphs run from 0.8 em above the baseline to 0.25 em below.
function textWidth(text, size, sans) {
  let em = 0;
  for (const ch of String(text)) em += !sans ? 0.62 : /[A-Z0-9\u0400-\u04FF]/.test(ch) ? 0.78 : 0.62;
  return em * size;
}
const EPS = 1e-9;
const inside = (b, vb) => b.x >= vb.x - EPS && b.y >= vb.y - EPS && b.x + b.w <= vb.x + vb.w + EPS && b.y + b.h <= vb.y + vb.h + EPS;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hitsCircle = (b, c) => Math.hypot(Math.max(b.x - c.x, 0, c.x - b.x - b.w), Math.max(b.y - c.y, 0, c.y - b.y - b.h)) < c.r;
function segmentHitsBox(s, b) {
  // sample the segment densely: enough for boxes a few units wide
  const n = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 0.1) + 1;
  for (let i = 0; i <= n; i++) {
    const x = s.x1 + (s.x2 - s.x1) * i / n, y = s.y1 + (s.y2 - s.y1) * i / n;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
function segmentHitsCircle(s, c) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, t = Math.max(0, Math.min(1, ((c.x - s.x1) * dx + (c.y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(s.x1 + t * dx - c.x, s.y1 + t * dy - c.y) < c.r;
}
// Clip a segment to the part outside a circle at its start and a box or circle at its end.
function between(x1, y1, r1, x2, y2, r2) {
  const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  return { x1: x1 + r1 * ux, y1: y1 + r1 * uy, x2: x2 - r2 * ux, y2: y2 - r2 * uy };
}

// Everything that must stay clear: router circles (with the selection ring), link
// labels, LAN/ISP boxes and port names. Text boxes come from the text itself.
function items(app, task) {
  const F = app.DIAGRAM_FONT, R = app.DIAGRAM_R;
  const geo = app.diagramGeometry(task);
  const circles = geo.routers.map(r => ({ name: r.name, x: r.x, y: r.y, r: R.ring + 0.25 }));
  const boxes = [];
  for (const l of geo.links) {
    const [net, ports] = l.label.lines;
    assert.equal(net.size, F.net); assert.equal(ports.size, F.ports);
    const need = Math.max(textWidth(net.text, net.size), textWidth(ports.text, ports.size));
    assert.ok(need <= l.label.w, `task ${task.id}: link ${l.network} text ${need.toFixed(1)} wider than its box ${l.label.w.toFixed(1)}`);
    boxes.push({ id: `link ${l.network}`, ...l.label });
  }
  for (const e of geo.endpoints) {
    for (const line of e.lines) {
      const w = textWidth(line.text, line.size, line.sans), top = line.dy - 0.8 * line.size, bottom = line.dy + 0.25 * line.size;
      if (e.shape === 'rect') {
        assert.ok(w <= e.box.w && top >= -e.box.h / 2 && bottom <= e.box.h / 2, `task ${task.id}: "${line.text}" fits its box`);
      } else {
        const ym = Math.max(Math.abs(top), Math.abs(bottom));
        assert.ok((w / 2 / e.box.rx) ** 2 + (ym / e.box.ry) ** 2 <= 1, `task ${task.id}: "${line.text}" fits its ellipse`);
      }
    }
    boxes.push({ id: `${e.type} ${e.key}`, key: e.key, ...e.box });
    if (e.port) {
      const base = e.port.cy + 0.36 * e.port.size, w = textWidth(e.port.text, e.port.size);
      boxes.push({ id: `port ${e.key}`, key: e.key, x: e.port.cx - w / 2, y: base - 0.8 * e.port.size, w, h: 1.05 * e.port.size });
    }
  }
  return { geo, circles, boxes };
}

for (const [name, app, portPattern] of [['Cisco', cisco, /^g0\/\d$/], ['MikroTik', mikrotik, /^ether\d$/]]) {
  test(`${name} diagram: every circle, box, label and port name is inside the viewBox`, () => {
    for (const task of app.TASKS) {
      const { geo, circles, boxes } = items(app, task);
      for (const c of circles) assert.ok(inside({ x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r }, geo.viewBox), `task ${task.id}: ${c.name}`);
      for (const b of boxes) assert.ok(inside(b, geo.viewBox), `task ${task.id}: ${b.id} cut off`);
    }
  });

  test(`${name} diagram: no label, box or port name overlaps a router or another box`, () => {
    for (const task of app.TASKS) {
      const { geo, circles, boxes } = items(app, task);
      assert.deepEqual(geo.clashes, [], `task ${task.id}: layout reports clashes`);
      for (const b of boxes) for (const c of circles) assert.ok(!hitsCircle(b, c), `task ${task.id}: ${b.id} overlaps ${c.name}`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(!overlap(boxes[i], boxes[j]), `task ${task.id}: ${boxes[i].id} overlaps ${boxes[j].id}`);
      }
      for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i], b = circles[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, `task ${task.id}: ${a.name} overlaps ${b.name}`);
      }
    }
  });

  test(`${name} diagram: no line runs under a box or through another router`, () => {
    for (const task of app.TASKS) {
      const { geo, circles, boxes } = items(app, task);
      const at = Object.fromEntries(circles.map(c => [c.name, c]));
      const segments = [
        ...geo.links.map(l => ({ id: `link ${l.network}`, ends: [l.from, l.to], own: `link ${l.network}`,
          ...between(l.x1, l.y1, at[l.from].r, l.x2, l.y2, at[l.to].r) })),
        ...geo.endpoints.map(e => {
          const L = Math.hypot(e.x - at[e.router].x, e.y - at[e.router].y), ux = (e.x - at[e.router].x) / L, uy = (e.y - at[e.router].y) / L;
          // where the line enters its own box or ellipse
          const reach = e.shape === 'rect' ? Math.min(e.box.w / 2 / Math.abs(ux), e.box.h / 2 / Math.abs(uy)) : 1 / Math.hypot(ux / e.box.rx, uy / e.box.ry);
          return { id: `line ${e.key}`, ends: [e.router], key: e.key, ...between(at[e.router].x, at[e.router].y, at[e.router].r, e.x, e.y, reach) };
        }),
      ];
      for (const s of segments) {
        for (const b of boxes) {
          if (b.id === s.own || (s.key && b.key === s.key)) continue; // a port name sits on its own line, on purpose
          assert.ok(!segmentHitsBox(s, b), `task ${task.id}: ${s.id} runs under ${b.id}`);
        }
        for (const c of circles) if (!s.ends.includes(c.name)) assert.ok(!segmentHitsCircle(s, c), `task ${task.id}: ${s.id} runs through ${c.name}`);
      }
    }
  });

  test(`${name} diagram: router names fit inside their circles (estimated text widths)`, () => {
    for (const task of app.TASKS) {
      for (const r of app.diagramGeometry(task).routers) {
        const top = 0.2 + 0.8 * r.nameSize; // text baseline is 0.2 above the centre
        const room = 2 * (Math.sqrt(r.r ** 2 - top ** 2) - 0.55); // minus half the selected stroke
        assert.ok(textWidth(r.name, r.nameSize, true) <= room, `task ${task.id}: ${r.name}`);
        const model = name; // the circle's second line reads "Cisco" or "MikroTik"
        assert.ok(textWidth(model, app.DIAGRAM_FONT.model) <= 2 * (Math.sqrt(r.r ** 2 - (3.6 + 0.25 * app.DIAGRAM_FONT.model) ** 2) - 0.55), `task ${task.id}: model label`);
      }
    }
  });

  test(`${name} diagram: ports and link labels use the app's interface names`, () => {
    for (const task of app.TASKS) {
      const geo = app.diagramGeometry(task);
      for (const e of geo.endpoints) if (e.port) assert.match(e.port.text, portPattern);
      for (const l of geo.links) {
        assert.equal(l.label.lines[1].text, `${l.a.name}.${l.a.ip.split('/')[0].split('.').pop()}↔${l.b.name}.${l.b.ip.split('/')[0].split('.').pop()}`);
        assert.match(l.a.name, portPattern);
      }
    }
  });

  test(`${name} diagram: mixHex gives an opaque selected-router colour`, () => {
    assert.equal(app.mixHex('#a78bfa', '#050a14', 0.2), '#252442'); // 0.2·167+0.8·5 = 37 = 0x25, …
    assert.equal(app.mixHex('#00d4ff', '#f7fafd', 0.2), '#c6f2fd'); // light theme
    assert.match(app.mixHex('#ef4444', '#050a14', 0.2), /^#[0-9a-f]{6}$/);
  });
}

test('Diagrams: task 13 draws four separate VLAN boxes and task 15 two labelled ISP clouds', () => {
  for (const app of [cisco, mikrotik]) {
    const t13 = app.diagramGeometry(app.TASKS.find(t => t.id === 13)).endpoints.filter(e => e.router === 'R2');
    assert.deepEqual(t13.map(e => e.label), ['VLAN10', 'VLAN20', 'VLAN30', 'VLAN40']);
    assert.equal(new Set(t13.map(e => `${e.x},${e.y}`)).size, 4);
    const t15 = app.diagramGeometry(app.TASKS.find(t => t.id === 15)).endpoints.filter(e => e.type === 'internet');
    assert.deepEqual(t15.map(e => e.label), ['ISP1', 'ISP2']);
    assert.ok(!overlap(t15[0].box, t15[1].box));
    // The cloud shows the provider link's network, not R1's own address, which students could mistake for the gateway
    // (A3 re-keyed the round 1 1.1.1.0 and 2.2.2.0 to shared address space).
    assert.deepEqual(t15.map(e => e.lines[1].text), ['100.64.1.0', '100.64.2.0']);
  }
});

test('Diagrams: a chain is drawn from an end router, so task 14 has no link through R-F1', () => {
  for (const app of [cisco, mikrotik]) {
    const geo = app.diagramGeometry(app.TASKS.find(t => t.id === 14));
    const x = Object.fromEntries(geo.routers.map(r => [r.name, r.x]));
    assert.ok(x['R-F1'] < x['R-HQ'] && x['R-HQ'] < x['R-F2']);
  }
});
