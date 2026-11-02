// The VLAN screens (VLAN-1 spec §4, brief items 4–6): their pure view
// (diagram.js, predictState.js, portsState.js), the screen rendered on the
// server from a given store (tests/harness/vlan.jsx), the screen-level leak
// gate, and the strings. The mounted lifecycle checks are
// tests/vlan-mounted.test.mjs.
//
// The leak gate (one seed per shape, vendor and level; per task and
// syntax), structural rather than a word list:
//   - «Куди дійде кадр»: before a round is committed, the whole screen
//     except the given configuration is byte-identical when the switches'
//     configuration is replaced by one where every PC hears every other: so
//     nothing outside the givens depends on who receives the frame (names,
//     titles and hidden DOM included). Plus a scan for the walk's and the
//     domains' marks, and a positive control after the commit;
//   - «Налаштуй порти»: before «Показати відповідь», no command line of the
//     reference that the student's own answer doesn't have appears anywhere
//     (blank, after a failed check, with all three hints open), and the
//     screen never calls solution(); after the reveal, they do appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, walkScene, hostStatus, domainGroups, endOf, PC, TEXT } from '../src/sections/vlan/screens/diagram.js';
import * as P from '../src/sections/vlan/screens/predictState.js';
import * as S from '../src/sections/vlan/screens/portsState.js';
import { compileAll } from '../src/sections/vlan/logic/model.js';
import { flood } from '../src/engine/l2.js';
import { initialInstance } from '../src/ui/exercise-state.js';
import { copy, t, ui, introduction, notes, section } from '../src/sections/vlan/uk.js';
import { codes } from '../src/sections/vlan/logic/codes.js';
import { commit, initialCommitState } from '../src/sections/vlan/logic/predict.js';
import { initialAnswer } from '../src/sections/vlan/logic/ports.js';
import { hop, out } from './helpers/vlan.mjs';

const h = await import('../.test-bundles/harness/vlan.mjs');
const { predict, ports, bank } = h;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const VENDORS = ['cisco', 'routeros'];

/** The outer markup of the first element whose opening tag contains `marker`. */
function region(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.lastIndexOf('<', at);
  const name = html.slice(start + 1).match(/^[\w-]+/)[0];
  const tags = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*?(/?)>`, 'g');
  tags.lastIndex = start;
  let depth = 0, m;
  while ((m = tags.exec(html))) {
    if (m[2] === '/') { if (depth === 0) return html.slice(start, tags.lastIndex); continue; }
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  return null;
}
const without = (html, marker) => { const r = region(html, marker); return r ? html.replace(r, '') : html; };
/** Round 5: the givens are the command block and the port evidence above the choices (both from the configuration). */
const GIVENS = ['class="ng-vl-given"', 'class="ng-vl-evidence"'];
const withoutGivens = html => GIVENS.reduce(without, html).replace(/ data-task-ports="\d+"/, '');

/** A store with the VLAN place and one instance's view and session. */
function storeFor({ place, key, view = {}, session = null, prefs = {}, result = null, presses = 0 }) {
  const state = h.initialStore(prefs);
  state.places.vlan = place;
  if (key) state.instances[key] = { ...initialInstance(), view, result, presses, ...(session ? { session: { ...initialInstance().session, ...session } } : {}) };
  return state;
}
const predictPlace = (shape, vendor, seed, level) => ({ exercise: 'predict', shape, predict: { [`${shape}|${vendor}`]: { seed, level } }, introClosed: false });
const portsPlace = (taskId, seed) => ({ exercise: 'ports', portsTask: taskId, portsSeeds: { [taskId]: seed }, predict: {} });

/** Count solution() calls while `fn` runs. */
function counting(fn) {
  const real = { p: predict.solution, q: ports.solution };
  let n = 0;
  predict.solution = (...a) => { n += 1; return real.p(...a); };
  ports.solution = (...a) => { n += 1; return real.q(...a); };
  try { return { value: fn(), calls: () => n }; } finally { predict.solution = real.p; ports.solution = real.q; }
}

// ── The diagram ──────────────────────────────────────────────────────────

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('VLAN diagram: switches stacked, PCs left and right, nothing overlaps, everything inside the view', () => {
  for (const variantId of ['p1', 'p2', 'p3']) for (const vendor of VENDORS) for (const seed of [1, 2, 3]) {
    const task = predict.create(bank.predict, { variantId, seed, vendor, surprises: 0 });
    const geo = layout(task.topology, vendor);
    const boxes = [...geo.switches, ...geo.hosts];
    assert.equal(geo.hosts.length, task.topology.hosts.length);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${variantId}/${seed}: ${boxes[i].id} × ${boxes[j].id}`);
    for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= geo.view.w && b.y + b.h <= geo.view.h, `${b.id} inside`);
    // Switches in the topology's order, top to bottom; every link drawn; trunks vertical.
    assert.deepEqual(geo.switches.map(s => s.id), task.topology.devices.filter(d => d.kind === 'switch').map(d => d.id));
    assert.ok(geo.switches.every((s, i) => i === 0 || s.y > geo.switches[i - 1].y + geo.switches[i - 1].h));
    assert.equal(geo.links.length, task.topology.links.length);
    for (const link of geo.links.filter(l => l.kind === 'trunk')) assert.equal(link.line.x1, link.line.x2);
    // Every switch port's label in this syntax.
    const labels = geo.links.flatMap(l => Object.values(l.ends)).filter(e => e.label).map(e => e.label).sort();
    const expected = task.topology.links.flatMap(l => [l.a, l.b]).filter(e => !e.device.startsWith('PC'))
      .map(e => task.topology.devices.find(d => d.id === e.device).ports.find(p => p.id === e.port).label[vendor]).sort();
    assert.deepEqual(labels, expected);
  }
  assert.ok(TEXT.min >= 12 && Object.values(TEXT).every(size => size >= 12), 'text 12 units or more');
  // The longest address fits its box at 0.62 em per monospace character.
  assert.ok('192.168.200.250/24'.length * 0.62 * TEXT.label + 10 <= PC.w);
  // So does the longest status word (regular sans is narrower than 0.62 em a character).
  assert.ok(ui.status.leaked.length * 0.62 * TEXT.label + 10 <= PC.w, ui.status.leaked);
});

test('VLAN diagram: a walk puts tags, untagged egress and drops where the walk says, reading nothing else', () => {
  // Hand-written walk on the given seed-0 p2 shape (as tests/vlan-exercises.test.mjs's golden).
  const task = predict.create(bank.predict, { variantId: 'p2', vendor: 'cisco', seed: 0, surprises: 0 });
  const geo = layout(task.topology, 'cisco');
  const walk = {
    from: 'PC1', received: new Set(['PC3', 'PC4']), arrivals: [],
    hops: [
      hop('PC1', null, false, null, [out('nic', false, null)]),
      hop('SW1', 'a3', false, 40, [out('a5', false, 40), out('t1', true, 40)], [{ port: 'a1', code: 'not-allowed-out' }], false),
      hop('PC3', 'nic', false, null),
      hop('SW2', 't1', true, 40, [out('a1', false, 40)], ['a3', 'a2'].map(port => ({ port, code: 'not-allowed-out' })), false),
      hop('PC4', 'nic', false, null),
    ],
  };
  const scene = walkScene(geo, walk);
  const at = (d, p) => endOf(geo, d, p).link.index;
  assert.deepEqual(scene.carried[at('SW1', 't1')], { tagged: true, vid: 40 });
  assert.deepEqual(scene.carried[at('SW1', 'a5')], { tagged: false, vid: null });
  assert.deepEqual(scene.carried[at('PC1', 'nic')], { tagged: false, vid: null });
  assert.equal(Object.keys(scene.carried).length, 4);
  assert.deepEqual(scene.drops.map(d => `${d.device}:${d.port}:${d.code}`), ['SW1:a1:not-allowed-out', 'SW2:a3:not-allowed-out', 'SW2:a2:not-allowed-out']);
  assert.deepEqual(scene.received, ['PC3', 'PC4']);
  assert.deepEqual(['PC1', 'PC2', 'PC3'].map(id => hostStatus(scene, id)), ['source', 'missed', 'received']);
  assert.equal(hostStatus(null, 'PC1'), null);
  const tagged = walkScene(geo, { from: 'PC1', received: new Set(), arrivals: [], hops: [hop('PC2', 'nic', true, 40, [], [{ port: 'nic', code: 'host-got-tagged' }])] });
  assert.equal(hostStatus(tagged, 'PC2'), 'tagged');
  // A PC an isolation failure names is leaked to, not «✓ отримав» (fix brief 4).
  const leakedScene = walkScene(geo, walk, { leaked: ['PC3'] });
  assert.deepEqual(['PC3', 'PC4'].map(id => hostStatus(leakedScene, id)), ['leaked', 'received']);
  const leakedSvg = unescape(h.renderDiagram({ geo, topology: task.topology, scene: leakedScene }));
  assert.equal((leakedSvg.match(/>✕ отримав, а не мав</g) ?? []).length, 1);
  assert.equal((leakedSvg.match(/>✓ отримав</g) ?? []).length, 1);
  assert.match(leakedSvg, /class="ng-vl-host is-leaked/);
  // The drawing: «тег 40» once, «без тега» on the untagged links, a ✕ per drop.
  const svg = unescape(h.renderDiagram({ geo, topology: task.topology, scene }));
  assert.equal((svg.match(/>тег 40</g) ?? []).length, 1);
  assert.equal((svg.match(/>без тега</g) ?? []).length, 3);
  assert.equal((svg.match(/class="ng-vl-drop[ "]/g) ?? []).length, 3);
  assert.match(svg, /aria-hidden="true"/);
  // Domains: numbered from 1 in host order, colour and number together.
  const groups = domainGroups(task.topology, [['PC4', 'PC2'], ['PC1', 'PC3']]);
  assert.deepEqual(groups.map(g => [g.n, g.hosts, g.colour]), [[1, ['PC1', 'PC3'], 0], [2, ['PC2', 'PC4'], 1]]);
  const drawn = h.renderDiagram({ geo, topology: task.topology, domains: groups });
  assert.equal((drawn.match(/class="ng-vl-badge-text"[^>]*>1</g) ?? []).length, 2);
});

// ── Pure state ───────────────────────────────────────────────────────────

test('VLAN predict state: slots per shape and vendor, levels 0 → 1 → 2, rounds from task.rounds', () => {
  const place = { predict: { 'p1|cisco': { seed: 5, level: 7 }, 'p1|routeros': { seed: 9 } } };
  assert.deepEqual(P.slotOf(place, 'p1', 'cisco'), { seed: 5, level: 2 });
  assert.deepEqual(P.slotOf(place, 'p1', 'routeros'), { seed: 9, level: 0 });
  assert.deepEqual(P.slotOf({}, 'p2', 'cisco'), { seed: 1, level: 0 });
  assert.deepEqual([0, 1, 2].map(level => P.nextSlot({ seed: 1, level }, 2).level), [1, 2, 2]);
  assert.deepEqual(P.paramsOf('p3', 'routeros', { seed: 4, level: 1 }), { variantId: 'p3', seed: 4, vendor: 'routeros', surprises: 1 });
  let calls = 0;
  assert.equal(P.validSeed(s => { calls += 1; return calls > 2; }, null, () => 0.25), 250000);
  assert.equal(P.validSeed(() => false, 77, () => 0.25), 77, 'no buildable seed: the current one stays');
  let r = 0;
  assert.equal(P.nextSeed(500000, () => [0.5, 0.25][r++]), 250000, 'never the previous seed');
  // Three rounds or four: nothing assumes four.
  const task = predict.create(bank.predict, { variantId: 'p1', seed: 3 });
  const three = { ...task, rounds: task.rounds.slice(0, 3) };
  const state = P.commitOf(P.roundView({}, three), three);
  assert.equal(P.dotsOf(three, state, 0).length, 3);
  assert.equal(P.roundView({ position: 9 }, three).position, 2);
  assert.equal(P.nextOpen(three, state, 2), 0);
  // A commit from another instance never applies.
  const other = predict.create(bank.predict, { variantId: 'p1', seed: 4 });
  const foreign = commit(other, initialCommitState(other), other.rounds[0].id, []);
  assert.equal(P.roundView({ commit: foreign }, task).commit, null);
  // Taps keep host order; the source is never a choice.
  assert.deepEqual(P.toggle(task, ['PC5'], 'PC2'), ['PC2', 'PC5']);
  assert.deepEqual(P.toggle(task, ['PC2', 'PC5'], 'PC2'), ['PC5']);
  assert.ok(!P.choicesOf(task, task.rounds[0]).includes(task.rounds[0].from));
});

test('VLAN ports state: parsing, forms per syntax, flush, marks, failures and the verdict’s syntax', () => {
  assert.deepEqual([S.parseVid(' 10 '), S.parseVid(''), S.parseVid('1x')], [10, '', '1x']);
  assert.deepEqual(S.parseVidList('10, 20 30'), [10, 20, 30]);
  assert.deepEqual(S.parseVidList('10-12,11'), [10, 11, 12]);
  // Ranges (fix brief 1): any span of VLAN numbers expands; anything else stays as typed, at once.
  assert.equal(S.parseVidList('10-200').length, 191);
  assert.equal(S.parseVidList('1-4094').length, 4094);
  const started = Date.now();
  assert.deepEqual(S.parseVidList('9007199254740992-9007199254740992'), ['9007199254740992-9007199254740992']);
  assert.deepEqual(S.parseVidList('9007199254740993'), ['9007199254740993'], 'not rounded to a neighbouring number');
  assert.deepEqual(S.parseVidList('0-5,4094-4095,20-10,1-99999999999999999999'), ['0-5', '4094-4095', '20-10', '1-99999999999999999999']);
  assert.ok(Date.now() - started < 200, 'no long loop');
  assert.deepEqual(S.parseVidList('4094-4094'), [4094]);
  assert.equal(S.parseVid('9007199254740993'), '9007199254740993');
  assert.equal(S.parseVid('4094'), 4094);
  assert.deepEqual(S.parseVidList('10,x'), [10, 'x']);
  assert.equal(S.parseVidList('ALL', { all: true }), 'all');
  assert.deepEqual(S.parseVidList('all'), ['all'], 'a VLAN list to create takes no «all»');
  assert.equal(S.formatValue([10, 20]), '10,20');
  const task = ports.create(bank.ports[1], { seed: 7, syntax: 'cisco' });
  const blank = S.blankForm(task, 'cisco');
  assert.deepEqual(S.toAnswer(blank, 'cisco'), initialAnswer(task, 'cisco'), 'blank: no reference in it');
  let form = S.writeField(blank, 'SW1', 'ports.t1.mode', 'trunk');
  form = S.writeField(form, 'SW1', 'ports.t1.vlan', 10);
  assert.deepEqual(S.toAnswer(form, 'cisco').SW1.ports.t1, { mode: 'trunk', allowed: [] }, 'a trunk keeps only its list');
  form = S.flush(form, { 'SW1|ports.t1.allowed': '10,20', 'SW1|vlans': '10 20', 'SW9|vlans': '1', 'SW1|vlans.4.vids': '3' });
  assert.deepEqual(form.SW1.ports.t1.allowed, [10, 20]);
  assert.deepEqual(form.SW1.vlans, [10, 20]);
  assert.equal(S.blankForm(task, 'routeros').SW1.filtering, false);
  // A form finding marks its field; a field mark covers its subfields.
  const answer = S.toAnswer(S.blankForm(task, 'cisco'), 'cisco');
  const result = ports.check(task, answer, { syntax: 'cisco' });
  const marks = S.marksOf(result);
  assert.ok(marks.SW1.every(m => m.code === 'mode-not-set'));
  assert.ok(S.markOn(marks.SW1, 'ports.t1'));
  assert.equal(S.markOn([{ field: 'ports.a1.vlan', code: 'bad-vid' }], 'ports.a1')?.code, 'bad-vid');
  assert.equal(S.markOn([{ field: 'ports.a10', code: 'bad-vid' }], 'ports.a1'), null);
  assert.deepEqual(S.failureOf(task, result), { kind: 'form', code: 'mode-not-set', device: 'SW1', port: result.findings[0].field.split('.')[1], walk: null });
  // A behaviour failure gives a walk; a success, the domains by VLAN.
  const ref = ports.solution(task, 'cisco');
  const leaked = structuredClone(ref);
  for (const sw of Object.values(leaked)) for (const p of Object.values(sw.ports)) if (p.mode === 'access') p.vlan = task.vids[0];
  const fail = S.failureOf(task, ports.check(task, leaked, { syntax: 'cisco' }));
  assert.equal(fail.kind, 'probe');
  assert.equal(fail.code, 'must-not-reach');
  assert.equal(fail.leaked, fail.walk.from === fail.from ? fail.to : fail.from, 'the PC the frame must not reach');
  assert.ok(fail.walk.arrivals.some(a => a.host === fail.leaked));
  const okResult = ports.check(task, ref, { syntax: 'cisco' });
  const legend = S.domainLegend(task, okResult.evidence.domains, okResult.evidence);
  assert.deepEqual(legend.map(d => d.vids[0]).sort(), [...task.vids.slice(0, 2)].sort());
  assert.deepEqual(legend.map(d => d.n), [1, 2]);
  assert.deepEqual(S.tipsOf(okResult), []);
  // An equivalent renumbering (300/400) passes; the legend names the answer's VLANs, not the goals (fix brief 2).
  const renumber = vid => (vid === task.vids[0] ? 300 : vid === task.vids[1] ? 400 : vid);
  const renumbered = structuredClone(ref);
  for (const sw of Object.values(renumbered)) {
    sw.vlans = sw.vlans.map(renumber);
    for (const p of Object.values(sw.ports)) if (p.mode === 'access') p.vlan = renumber(p.vlan); else p.allowed = p.allowed.map(renumber);
  }
  const passed = ports.check(task, renumbered, { syntax: 'cisco' });
  assert.equal(passed.ok, true);
  const relabelled = S.domainLegend(task, passed.evidence.domains, passed.evidence);
  assert.deepEqual(relabelled.flatMap(d => d.vids).sort(), [300, 400]);
  assert.ok(relabelled.every(d => d.hosts.every(h => (task.goals[h] === task.vids[0] ? 300 : 400) === d.vids[0])));
  assert.equal(ui.portsDomain(relabelled[0]), `Домен 1 — VLAN ${relabelled[0].vids[0]}: ${relabelled[0].hosts.join(', ')}`);
  // Cisco's reserved VLANs mark their field (fix brief 5).
  const reserved = structuredClone(ref);
  const [accessId] = Object.entries(reserved.SW2.ports).find(([, p]) => p.mode === 'access');
  reserved.SW2.ports[accessId].vlan = 1003;
  const reservedResult = ports.check(task, reserved, { syntax: 'cisco' });
  assert.ok(S.FORM_CODES.includes('cisco-reserved-vid'));
  assert.deepEqual(S.marksOf(reservedResult).SW2, [{ field: `ports.${accessId}.vlan`, code: 'cisco-reserved-vid' }]);
  assert.deepEqual(S.failureOf(task, reservedResult), { kind: 'form', code: 'cisco-reserved-vid', device: 'SW2', port: accessId, walk: null });
  // A mark goes once its field is edited (fix brief 9); unrelated edits keep it.
  const edited = structuredClone(reserved);
  edited.SW2.ports[accessId].vlan = 1004;
  assert.deepEqual(S.freshMarks(S.marksOf(reservedResult), reserved, edited), {});
  const elsewhere = structuredClone(reserved);
  elsewhere.SW1.vlans = [...elsewhere.SW1.vlans, 999];
  assert.deepEqual(S.freshMarks(S.marksOf(reservedResult), reserved, elsewhere), S.marksOf(reservedResult));
  assert.deepEqual(S.freshMarks({ SW1: [{ field: '', code: 'invalid-config' }] }, { SW1: { a: 1 } }, { SW1: { a: 2 } }), {});
  // The verdict: only in its syntax; stale after an edit.
  const key = JSON.stringify(ref);
  assert.equal(S.verdictOf(okResult, { syntax: 'cisco', answer: key }, 'routeros', key), null);
  assert.equal(S.verdictOf(okResult, { syntax: 'cisco', answer: key }, 'cisco', key).stale, false);
  assert.equal(S.verdictOf(okResult, { syntax: 'cisco', answer: key }, 'cisco', '{}').stale, true);
  assert.equal(S.verdictOf(okResult, null, 'cisco', key), null);
});

// ── The screen, rendered ─────────────────────────────────────────────────

test('VLAN screen: the section card, both exercises, the syntax switch and no score', () => {
  assert.deepEqual(section, { title: 'VLAN', blurb: 'порти доступу, транки й шлях широкомовного кадру' });
  const place = h.firstPlace(bank, () => 0.3);
  assert.deepEqual(Object.keys(place.predict).sort(), ['p1|cisco', 'p1|routeros', 'p2|cisco', 'p2|routeros', 'p3|cisco', 'p3|routeros']);
  assert.ok(Object.values(place.predict).every(s => s.level === 0), 'every shape starts at level 0');
  const html = unescape(h.renderScreen(storeFor({ place })));
  assert.match(html, /<h1 class="ng-vl-h1">VLAN<\/h1>/);
  assert.match(html, /aria-label="Вправа"[^]*>Куди дійде кадр<[^]*>Налаштуй порти</);
  assert.match(html, /aria-label="Синтаксис"[^]*>Cisco<[^]*>MikroTik</);
  assert.doesNotMatch(html, /✅|спроб|рахунок/i, 'calm: no score');
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, 'one status');
  assert.ok(introduction.every(line => html.includes(`<li>${line}</li>`)), 'the four-line introduction');
  const portsHtml = unescape(h.renderScreen(storeFor({ place: { ...place, exercise: 'ports' } })));
  assert.equal((portsHtml.match(/role="status"/g) ?? []).length, 1);
  // Round 4 (F4): the goal is a first-visit aside; the nonegotiate note only where there is a trunk.
  assert.ok(portsHtml.includes(ui.taskGoal) && !portsHtml.includes(notes.cisco), 'task 1 has no trunk: no nonegotiate note');
  const trunkHtml = unescape(h.renderScreen(storeFor({ place: { ...place, exercise: 'ports', portsTask: bank.ports[1].id } })));
  assert.ok(trunkHtml.includes(notes.cisco), 'task 2 has a trunk: the note, once');
  assert.equal(trunkHtml.split(notes.cisco).length - 1, 1);
  assert.doesNotMatch(portsHtml, />—</, '«не задано», not «—»');
  assert.match(portsHtml, />не задано</);
  assert.match(portsHtml, /aria-label="Інші дії"/);
  assert.doesNotMatch(portsHtml, />Інші номери</, '«Інші номери VLAN» moved into «⋯»');
  const mt = unescape(h.renderScreen(storeFor({ place: { ...place, exercise: 'ports' }, prefs: { syntax: 'routeros' } })));
  assert.ok(mt.includes(notes.routeros) && mt.includes('VLAN Filtering') && mt.includes(ui.frameLegend));
});

test('VLAN screen: MikroTik givens as the two Winbox tables, the same as the commands', () => {
  const task = predict.create(bank.predict, { variantId: 'p3', seed: 5, vendor: 'routeros', surprises: 1 });
  for (const sw of ['SW1', 'SW2', 'SW3']) {
    const state = storeFor({ place: predictPlace('p3', 'routeros', 5, 1), prefs: { syntax: 'routeros' }, key: task.instanceKey, view: { switchId: sw } });
    const given = unescape(region(h.renderScreen(state), 'class="ng-vl-given"'));
    const config = task.configurations[sw];
    assert.ok(given.includes(`bridge1 · VLAN Filtering: ${config.filtering ? 'увімкнено' : 'вимкнено'}`), sw);
    const [portsTable, vlansTable] = given.split('<table').slice(1);
    assert.ok(portsTable.includes('Bridge → Ports') && vlansTable.includes('Bridge → VLANs'));
    const rows = [...portsTable.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>(\d+)<\/td><td class="ng-vl-ft">([^<]+)</g)].map(m => m.slice(1));
    const device = task.topology.devices.find(d => d.id === sw);
    assert.deepEqual(rows.map(r => r[0]).sort(), Object.keys(config.ports).map(p => device.ports.find(x => x.id === p).label.routeros).sort());
    for (const [name, pvid, ft] of rows) {
      const id = device.ports.find(p => p.label.routeros === name).id;
      assert.equal(Number(pvid), config.ports[id].pvid);
      assert.equal(ft, ui.frameTypes[config.ports[id].frameTypes]);
    }
    const vlanRows = [...vlansTable.matchAll(/<tr><th scope="row">([^<]+)<\/th>/g)].map(m => m[1]);
    assert.deepEqual(vlanRows, config.vlans.map(r => r.vids.join(',')));
  }
});

// ── The leak gate ────────────────────────────────────────────────────────

/** A configuration where every PC hears every other: a different reach, the same network. */
function everyone(task) {
  const configurations = {};
  for (const d of task.topology.devices.filter(x => x.kind === 'switch')) {
    configurations[d.id] = task.vendor === 'cisco'
      ? { vlans: [], ports: Object.fromEntries(d.ports.map(p => [p.id, p.id.startsWith('t') ? { mode: 'trunk', allowed: 'all' } : { mode: 'access', vlan: 1 }])) }
      : { filtering: false, ports: Object.fromEntries(d.ports.map(p => [p.id, { pvid: 1, frameTypes: 'admit-all' }])), vlans: [] };
  }
  return configurations;
}
// The walk's and the domains' marks (the introduction's general words about tags are givens).
const REACH_MARKS = /ng-vl-(?:path|tag|drop|steps|legend|badge|walk)(?![\w-])|has-domain|is-received|is-tagged|отримав|Кадр отримали|Кадр не отримав|Шлях кадру|Домен \d|>тег \d/;

for (const variantId of ['p1', 'p2', 'p3']) for (const vendor of VENDORS) for (const level of [0, 1, 2]) {
  test(`VLAN leak gate, «Куди дійде кадр»: ${variantId}/${vendor}/level ${level}`, () => {
    const seed = 101;
    const task = predict.create(bank.predict, { variantId, seed, vendor, surprises: level });
    const swapped = { ...structuredClone(task), configurations: everyone(task) };
    // The swap really changes who receives, so the comparison means something.
    const reach = t => task.rounds.map(r => [...flood(t.topology, compileAll(t.topology, t.configurations, vendor).tables, { from: r.from }).received].sort().join());
    assert.notDeepEqual(reach(task), reach(swapped));
    const answers = predict.solution(task);
    let state = initialCommitState(task);
    task.rounds.forEach((round, k) => {
      const store = storeFor({
        place: predictPlace(variantId, vendor, seed, level), prefs: { syntax: vendor }, key: task.instanceKey,
        view: { commit: state, position: k, drafts: { [round.id]: { hosts: P.choicesOf(task, round).slice(0, 1), nobody: false } } }, presses: k,
      });
      const realCreate = predict.create;
      const run = counting(() => {
        const real = h.renderScreen(store);
        predict.create = () => structuredClone(swapped);
        try { return { real, other: h.renderScreen(store) }; } finally { predict.create = realCreate; }
      });
      const { real, other } = run.value;
      assert.equal(run.calls(), 0, 'the screen never reads the reference');
      assert.notEqual(region(real, 'class="ng-vl-given"'), region(other, 'class="ng-vl-given"'), 'the givens differ (control)');
      assert.notEqual(region(real, 'class="ng-vl-evidence"'), region(other, 'class="ng-vl-evidence"'), 'the port evidence differs too (control)');
      assert.equal(withoutGivens(real), withoutGivens(other), `round ${k + 1}: nothing else depends on the reach`);
      const outside = unescape(withoutGivens(real));
      assert.doesNotMatch(outside, REACH_MARKS, `round ${k + 1}: no walk or domain marks before the commit`);
      assert.doesNotMatch(outside, /\[[a-z-]+\]/, 'no placeholder for a missing string');
      // Positive control: committed, the walk appears; the givens stay the same.
      const next = commit(task, state, round.id, answers[round.id]);
      const after = h.renderScreen(storeFor({ place: predictPlace(variantId, vendor, seed, level), prefs: { syntax: vendor }, key: task.instanceKey, view: { commit: next, position: k }, presses: k + 1 }));
      assert.match(unescape(after), /ng-vl-steps[^]*Кадр (отримали|не отримав)/);
      assert.equal(region(after, 'class="ng-vl-given"'), region(real, 'class="ng-vl-given"'), 'the givens are the same before and after');
      if (k === task.rounds.length - 1) assert.match(unescape(after), /ng-vl-legend[^]*Домен 1: /);
      else assert.doesNotMatch(after, /ng-vl-(?:legend|badge)(?![\w-])/);
      state = next;
    });
  });
}

/** Command lines in markup: each is its own span. */
const commandLines = html => [...unescape(html).matchAll(/<span class="ng-vl-cmd-line">([^<]*)<\/span>/g)].map(m => m[1]);
/** Reference lines the student's own answer doesn't have. */
const referenceOnly = (task, syntax, answer) => {
  const own = new Set(Object.values(ports.render(answer, syntax, task.topology)).flatMap(text => text.split('\n')));
  return [...new Set(Object.values(ports.render(ports.solution(task, syntax), syntax, task.topology)).flatMap(text => text.split('\n')))].filter(line => !own.has(line));
};

for (const record of bank.ports) for (const syntax of VENDORS) {
  test(`VLAN leak gate, «Налаштуй порти»: ${record.id}/${syntax}`, () => {
    const seed = 202;
    const task = ports.create(record, { seed, syntax });
    const place = portsPlace(record.id, seed);
    const blank = S.blankForm(task, syntax);
    // A half-done wrong answer: the first switch's first port only.
    const sw = Object.keys(blank)[0], port = Object.keys(blank[sw].ports)[0];
    const wrong = syntax === 'cisco'
      ? S.writeField(S.writeField(blank, sw, `ports.${port}.mode`, 'access'), sw, `ports.${port}.vlan`, 4000)
      : S.writeField(blank, sw, 'vlans', [{ vids: [4000], tagged: [], untagged: [port] }]);
    const wrongAnswer = S.toAnswer(wrong, syntax);
    const failed = ports.check(task, wrongAnswer, { syntax });
    assert.equal(failed.ok, false);
    const states = [
      ['blank', storeFor({ place, prefs: { syntax } })],
      ['after a failed check', storeFor({ place, prefs: { syntax }, key: task.instanceKey, view: { forms: { [syntax]: wrong }, verdict: { syntax, answer: JSON.stringify(wrongAnswer) } }, result: failed, presses: 1 })],
      ['with every hint open', storeFor({ place, prefs: { syntax }, key: task.instanceKey, view: { forms: { [syntax]: wrong } }, session: { hintIndex: 3, assisted: true } })],
    ];
    const hidden = referenceOnly(task, syntax, wrongAnswer);
    assert.ok(hidden.length > 0, 'the reference has lines of its own (control)');
    for (const [name, state] of states) {
      const run = counting(() => h.renderScreen(state));
      const html = run.value;
      assert.equal(run.calls(), 0, `${name}: the screen never reads the reference`);
      const shown = new Set(commandLines(html));
      const text = unescape(html);
      for (const line of hidden) {
        assert.ok(!shown.has(line), `${name}: «${line}» shown as a command`);
        assert.ok(!new RegExp(`${line.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w,=-])`).test(text), `${name}: «${line}» in the markup`);
      }
      assert.doesNotMatch(text, /\[[a-z-]+\]/, `${name}: no placeholder for a missing string`);
      assert.doesNotMatch(text, /ng-vl-(?:legend|badge)(?![\w-])|has-domain/, `${name}: no domain colours before a success`);
    }
    // Positive control: revealed, the reference is there, through useExercise.
    const revealed = storeFor({ place, prefs: { syntax }, key: task.instanceKey, session: { revealed: true, assisted: true, status: 'revealed' } });
    const run = counting(() => h.renderScreen(revealed));
    assert.ok(run.calls() > 0);
    const lines = new Set(commandLines(run.value));
    assert.ok(hidden.every(line => lines.has(line)), 'revealed: every reference line');
  });
}

// ── Strings ──────────────────────────────────────────────────────────────

test('VLAN strings: every screen word is non-empty, every code the screens show has its string', () => {
  const sample = { host: 'PC1', hosts: ['PC1', 'PC2'], vids: [10], ports: 'fa0/2, fa0/4', n: 2, total: 4, status: 'так', on: true, port: 'fa0/1', device: 'SW1', kind: 'Tagged', from: 'PC1', to: 'PC2', where: 'SW1', text: 'x', a: 10, b: 20, c: 30, vid: 10, what: 'Шлях кадру: від PC1' };
  const walk = (value, path) => {
    if (typeof value === 'function') {
      const out = value(path.endsWith('.tag') || path.endsWith('.goal') ? 10 : sample);
      assert.equal(typeof out, 'string', path);
      assert.ok(out.trim().length > 0 && !/undefined|null|NaN|\[object/.test(out), `${path}: ${out}`);
    } else if (typeof value === 'string') assert.ok(value.trim().length > 0, path);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}.${i}`));
    else for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
  };
  walk(ui, 'ui');
  assert.deepEqual(Object.keys(ui.taskText).sort(), bank.ports.map(r => r.id).sort(), 'a text per ports task');
  assert.deepEqual(Object.keys(ui.frameTypes).sort(), ['admit-all', 'admit-only-untagged-and-priority-tagged', 'admit-only-vlan-tagged']);
  assert.deepEqual(Object.keys(ui.frameShort).sort(), Object.keys(ui.frameTypes).sort());
  // Every code the screens display (drops, findings, advice, diagnoses, hints) has a string.
  for (const code of codes) assert.ok(Object.hasOwn(copy, code) && t(code, sample) !== `[${code}]`, code);
  for (const code of S.FORM_CODES) assert.ok(codes.includes(code), code);
  assert.equal(t('network-convention'), 'Номер мережі як у VLAN — звична домовленість, не правило.');
  // Calm words: no scores, streaks or assessment words.
  assert.doesNotMatch(JSON.stringify(ui), /рахун|бал[іиа]|серія|іспит|екзамен|квиток|клас|урок|✅|🎉/i);
});
