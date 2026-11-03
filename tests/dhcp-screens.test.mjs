// «DHCP і NAT»'s screens rendered on the server (round 6): the shared
// drawing's DHCP view (what it shows and leaves out, its facts on labels
// only, the text equivalent with the same addresses), the strip on the
// shared ruler (pins in one row, never overlapping, inside the drawing;
// bands and the marker as the logic's strip says), the forms' answers and
// the reveal's drafts for every level and vendor, the purposes' length,
// and the first views (each exercise's action line, its worked example
// closed under it, no verdict, no reference).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopology } from '../src/sections/dhcp/logic/scenario.js';
import * as server from '../src/sections/dhcp/logic/server.js';
import * as nat from '../src/sections/dhcp/logic/nat.js';
import { actions, labels, modes, screen } from '../src/sections/dhcp/uk.js';

const h = await import('../.test-bundles/harness/dhcp.mjs');
const { tooLong } = h;
const facts = html => [...new Set([...html.matchAll(/data-hl="([^"]*)"/g)].flatMap(m => m[1].split(' ')))];
const texts = html => [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

test('the shared drawing, DHCP view: PC, R1 with WAN /30 first, the ISP gateway, the website; no doors, lanes, core or chip', () => {
  const t = createTopology();
  for (const vendor of ['cisco', 'mikrotik']) {
    const html = h.renderDrawing(t, vendor), ports = t.ports[vendor];
    assert.doesNotMatch(html, /ng-fw-door|ng-fw-lane|ng-fw-core|ng-fw-chip|ng-fw-envelope/, `${vendor}: nothing of the firewall's walk`);
    assert.ok(texts(html).includes(`${ports.wan} · ${t.wan}/${t.wanPrefix}`) && texts(html).includes(`${ports.lan} · ${t.router}`), `${vendor}: R1's block, WAN with its /30`);
    assert.ok(texts(html).indexOf(`${ports.wan} · ${t.wan}/${t.wanPrefix}`) < texts(html).indexOf(`${ports.lan} · ${t.router}`), 'WAN first');
    assert.deepEqual(texts(html).filter(x => / · (WAN|LAN)$/.test(x)), [`${ports.wan} · WAN`, `${ports.lan} · LAN`], `${vendor}: the port labels in the vendor's words`);
    for (const ip of [t.pc, t.website, t.ispGateway]) assert.ok(texts(html).includes(ip), `${vendor}: ${ip}`);
    assert.ok(!texts(html).includes(t.server) && !texts(html).includes(screen.drawing.server), 'no server unless asked');
    assert.match(html, /viewBox="0 0 452 166"/, 'the shorter DHCP view');
    // Facts on labels only, and both port names on each port label.
    assert.deepEqual(facts(html).filter(f => f.startsWith('port:')).sort(), ['port:bridge', 'port:ether1', ...(vendor === 'cisco' ? ['port:g0/0', 'port:g0/1'] : [])].sort());
    for (const f of facts(html)) {
      const [kind, value] = f.split(/:(.*)/);
      const lit = [...h.renderDrawing(t, vendor, { highlight: { kind, value } }).matchAll(/<(\w+)[^>]*data-highlight=""/g)].map(m => m[1]);
      assert.ok(lit.length && lit.every(tag => ['text', 'g'].includes(tag)), `${vendor} ${f}: a label`);
    }
  }
  const withServer = h.renderDrawing(t, 'cisco', { server: true });
  assert.ok(texts(withServer).includes(t.server) && texts(withServer).includes(screen.drawing.server), 'E3 card 2: the LAN server');
});

test('the drawing in words: «Текстом» names every address the drawing shows, and the training-address line', () => {
  for (const otherAddresses of [false, true]) for (const vendor of ['cisco', 'mikrotik']) for (const server of [false, true]) {
    const t = createTopology(7, { otherAddresses });
    const words = h.textSections(t, vendor, { server }).flatMap(s => s.items).join(' ');
    const drawn = texts(h.renderDrawing(t, vendor, { server })).join(' ');
    for (const ip of [t.pc, t.router, t.wan, t.ispGateway, t.website, ...(server ? [t.server] : [])]) {
      assert.ok(drawn.includes(ip) && words.includes(ip), `${ip} on the drawing and in words`);
    }
    assert.ok(words.includes(labels.trainingPublic));
    assert.ok(words.includes(t.ports[vendor].wan) && words.includes(t.ports[vendor].lan));
  }
});

test('the strip: pins in one row, apart and inside the drawing, for every level, vendor and many seeds; the band and marker as the logic says', () => {
  let twoRows = 0, numbersOnly = 0;
  for (let seed = 0; seed < 120; seed++) for (const level of [1, 2, 3]) for (const vendor of ['cisco', 'mikrotik']) {
    const task = server.generateScenario({ seed, level, vendor, otherAddresses: seed % 2 === 1 });
    const props = h.stripProps(task, {});
    const span = props.span.end - props.span.start + 1;
    const px = v => 14 + (v - props.span.start) * 300 / span;
    const { placed } = h.pinLabels(props.pins, px);
    assert.equal(placed.length, 1 + task.statics.length);
    for (const row of [0, 1]) {
      const sorted = placed.filter(p => p.row === row).sort((a, b) => a.left - b.left);
      for (let i = 0; i < sorted.length; i++) {
        assert.ok(sorted[i].left >= 0 && sorted[i].left + sorted[i].w <= 328, `seed ${seed} L${level}: inside the drawing`);
        if (i) assert.ok(sorted[i].left >= sorted[i - 1].left + sorted[i - 1].w, `seed ${seed} L${level}: labels apart`);
      }
    }
    // An upper label's line never crosses a lower label (it passes through a gap of the lower row).
    const lower = placed.filter(p => p.row === 0);
    for (const pin of placed.filter(p => p.row === 1)) {
      const through = pin.points[2][0];
      assert.ok(lower.every(l => through <= l.left || through >= l.left + l.w), `seed ${seed} L${level}: an upper line crosses a lower label`);
    }
    if (placed.some(p => p.row === 1)) twoRows++;
    if (placed.every(p => p.text === p.short)) numbersOnly++;
    assert.equal(props.caption.startsWith(server.stripCaption(task, {})), true, 'the text equivalent is the logic\'s');
    assert.equal(props.bands.length, 0); assert.equal(props.value, null);
    const ref = server.referenceAnswer(task);
    const filled = h.stripProps(task, h.answerOf(task, h.draftOf(task, ref)));
    assert.ok(filled.bands.length >= 1 && filled.bands.every(b => b.start >= props.span.start && b.end <= props.span.end), 'the answer\'s band inside the network');
  }
  assert.ok(twoRows > 0, 'some strips need two rows of names');
  assert.ok(numbersOnly <= 6, `names kept: only ${numbersOnly} of 720 strips fall back to numbers`);
  // The level 3 strip the review saw (four pins at .129 .131 .160 .190 of a /26): every name kept, on two rows.
  const l3 = h.pinLabels(['сервер .129', 'роутер .131', 'принтер .160', 'камера .190'].map(label => ({ value: Number(label.split('.')[1]), label, short: `.${label.split('.')[1]}` })), v => 14 + (v - 128) * 300 / 64);
  assert.deepEqual(l3.placed.map(p => p.text), ['сервер .129', 'роутер .131', 'принтер .160', 'камера .190']);
  assert.ok(l3.top > 26 && l3.placed.some(p => p.row === 1));
  const t = server.generateScenario({ seed: 3, level: 1 });
  const base = t.network.slice(0, -1);
  assert.equal(h.stripProps(t, { ranges: [{ from: `${base}100`, to: '' }] }).value, 100, 'a marker at «від» once it parses');
  assert.equal(h.stripProps(t, { ranges: [{ from: `${base}100`, to: `${base}150` }] }).value, null, 'the band replaces the marker');
  const html = h.renderRuler(h.stripProps(t, {}));
  assert.equal([...html.matchAll(/class="ng-ruler-pin-label[" ]/g)].length, 1 + t.statics.length);
  assert.match(html, new RegExp(`${labels.router} \\.1<`));
  // Names that don't fit in the row: every label becomes its number.
  const crowded = [1, 2, 3, 4].map(n => ({ value: 120 + n, label: `дуже довга назва .${120 + n}`, short: `.${120 + n}` }));
  assert.deepEqual(h.pinLabels(crowded, v => 14 + v * 300 / 256).placed.map(p => p.text), ['.121', '.122', '.123', '.124']);
});

test('the IP ruler is unchanged by the move: no pins, no bands, the 0–255 strip', () => {
  const html = h.renderRuler({ octet: 4, unit: 64, value: 77, block: { start: 64, end: 127, size: 64 }, caption: 'x' });
  assert.match(html, /viewBox="0 0 328 96"/);
  assert.doesNotMatch(html, /ng-ruler-pin|ng-ruler-band|translate/);
});

test('E2 forms: the reveal\'s draft is the reference as the form holds it, and passes, for every level and vendor', () => {
  for (let seed = 0; seed < 60; seed++) for (const level of [1, 2, 3]) for (const vendor of ['cisco', 'mikrotik']) {
    const task = server.generateScenario({ seed, level, vendor, otherAddresses: seed % 3 === 0 });
    const form = h.formOf(task);
    assert.equal(form, level < 3 ? 'neutral' : vendor === 'cisco' ? 'cisco' : 'wizard');
    const answer = h.answerOf(task, h.draftOf(task, server.referenceAnswer(task)));
    assert.equal(server.check(task, answer).ok, true, `seed ${seed} L${level} ${vendor}`);
  }
  const cisco = server.generateScenario({ seed: 1, level: 3, vendor: 'cisco' });
  assert.deepEqual(h.answerOf(cisco, {}).exclusions, [{ from: '', to: '' }], 'Cisco L3 starts with one blank row');
});

test('E2 and E3: every purpose is one line (48 characters at most)', () => {
  const purposes = [];
  for (const level of [1, 2, 3]) purposes.push(...server.wizardFields(server.generateScenario({ level: 3, vendor: 'mikrotik', seed: level })).map(f => f.purpose));
  for (const vendor of ['cisco', 'mikrotik']) for (const twoLans of [false, true]) {
    const task = nat.createL2(2, { vendor, twoLans });
    purposes.push(...task.options.map(o => o.purpose), ...task.insideOptions.map(o => o.purpose));
  }
  assert.deepEqual(tooLong(purposes), []);
});

test('first views: each exercise\'s heading, its action line with the worked example folded right under it, no verdict and no reference', () => {
  for (const exercise of ['sides', 'server', 'nat']) for (const syntax of ['cisco', 'routeros']) {
    let state = h.initialStore({ syntax });
    state = h.storeReducer(state, { type: 'place', scope: 'dhcp', patch: { ...h.firstPlace(), exercise } });
    const html = h.renderSection(state);
    assert.match(html, new RegExp(`<h1[^>]*>${modes[exercise]}</h1>`));
    const action = exercise === 'sides' ? actions.sides : exercise === 'server' ? actions.range : null;
    const line = html.match(/<p id="ng-dh-action" class="ng-action-line" data-action-line="">([^<]*)<\/p>(<div[^>]*data-worked-example)/);
    assert.ok(line, `${exercise}: the action line, then the worked example`);
    if (action) assert.equal(line[1], action);
    assert.match(html, /aria-expanded="false"[^>]*>.*?Приклад/s, `${exercise}: the example folded`);
    assert.doesNotMatch(html, /data-help-current/, `${exercise}: no verdict on the first view`);
    assert.doesNotMatch(html, /ng-dh-client|ng-dh-native-lines/, `${exercise}: nothing after a pass`);
  }
});
