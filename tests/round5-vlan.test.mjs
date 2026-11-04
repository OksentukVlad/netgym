// Round 5, stage 5b-1, VLAN (spec 5b-1 §4, v2, v2.1, v2.2): the screen side.
//   - «Куди дійде кадр»: the port evidence on the first view, from the given
//     configuration only (an access port reassigned, a missing transit VLAN,
//     filtering off), each port a fact link; the action line naming the
//     choices; the choices carry the PC's name only; the intro's definitions;
//   - «Налаштуй порти»: two-line modes named «доступ (access)», «VLAN цього
//     порту», «створити на комутаторі (один раз)», the action line per syntax,
//     the ports as fact links;
//   - «Між VLAN»: the action line from the task's givens (interVlanAction);
//   - «Між VLAN» and «Знайди несправність»: one compact drawing that keeps
//     every PC with its gateway, every switch and the router at 12 px in a
//     1000 × 700 window (its frame is about 514 × 346 units at most);
//   - explicit facts on the diagram's labels: ports device-qualified, the
//     goal's VLAN, the gateway's address, the interface lines'.
// The mounted lifecycle (taps, highlight, clearing) is in
// tests/helpers/mounted-vlan.mjs; the R5 measurement in the gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT, MONO, TEXT, compactPcWidth, layout } from '../src/sections/vlan/screens/diagram.js';
import { blankRouteForm, deviceLines, flushRoute, toRouteAnswer } from '../src/sections/vlan/screens/routeState.js';
import { toFaultConfig, toFaultForm } from '../src/sections/vlan/screens/faultsState.js';
import { portEvidence } from '../src/sections/vlan/logic/facts.js';
import { interVlanAction } from '../src/sections/vlan/logic/route-action.js';
import { faultsUi, introduction, ui, vlanTeaching } from '../src/sections/vlan/uk.js';
import { commit, initialCommitState, inspect } from '../src/sections/vlan/logic/predict.js';

const h = await import('../.test-bundles/harness/vlan.mjs');
const route = (await import('../src/sections/vlan/logic/route.js')).default;
const { evidenceValue, evidenceGroups, peerOf, hostLines, taskCounts, isShort } = await import('../.test-bundles/harness/round5-vlan.mjs');
const { predict, ports, faults, bank } = h;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const VENDORS = ['cisco', 'routeros'];

/** A store with the VLAN place and one instance's view. */
function storeFor({ place, key, view = {}, prefs = {} }) {
  const state = h.initialStore(prefs);
  state.places.vlan = place;
  if (key) state.instances[key] = { ...h.initialInstance(), view };
  return state;
}
const predictPlace = (shape, vendor, seed, level) => ({ exercise: 'predict', shape, predict: { [`${shape}|${vendor}`]: { seed, level } } });
const predictHtml = (task, vendor, view = {}) => unescape(h.renderScreen(storeFor({
  place: predictPlace(task.identity.variantId, vendor, task.identity.seed, task.identity.surprises), prefs: { syntax: vendor }, key: task.instanceKey, view,
})));
/** The first seed whose generated task has the surprise `slot`. */
function withSurprise(variantId, vendor, slot) {
  for (let seed = 1; seed < 400; seed++) for (const surprises of [1, 2]) {
    let raw;
    try { raw = inspect(bank.predict, { variantId, seed, vendor, surprises }); } catch { continue; }
    if (raw.activeSurprises.some(s => s.id === slot)) return { raw, task: predict.create(bank.predict, { variantId, seed, vendor, surprises }) };
  }
  throw new Error(`no seed with ${slot}`);
}
/** The evidence table's rows as [switch cell, port, PC, value] (the switch cell only on a group's first row). */
function evidenceRows(html) {
  const table = html.match(/<table class="ng-vl-evidence"[^]*?<\/table>/)?.[0] ?? '';
  return [...table.matchAll(/<tr data-evidence-row="">([^]*?)<\/tr>/g)].map(m => {
    const cells = [...m[1].matchAll(/<t[hd][^>]*>([^]*?)<\/t[hd]>/g)].map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return cells.length === 4 ? cells : ['', ...cells];
  });
}

// ── «Куди дійде кадр» ────────────────────────────────────────────────────

test('round 5 VLAN: the intro holds the broadcast and trunk definitions (no second aside)', () => {
  assert.equal(introduction[0], vlanTeaching.broadcast);
  assert.ok(introduction.includes(vlanTeaching.trunk));
  assert.ok(!introduction.some(line => /Транк переносить кілька VLAN із тегами/.test(line)), 'the old trunk line went');
  const task = predict.create(bank.predict, { variantId: 'p1', seed: 7, vendor: 'cisco', surprises: 0 });
  const html = predictHtml(task, 'cisco');
  assert.equal((html.match(/class="ng-aside[ "]/g) ?? []).length, 1, 'one aside on the prediction');
  for (const line of introduction) assert.ok(html.includes(`<li>${line}</li>`), line);
});

test('round 5 VLAN: the port evidence is the given configuration, row for row, in every shape and vendor', () => {
  for (const variantId of ['p1', 'p2', 'p3']) for (const vendor of VENDORS) for (const surprises of [0, 1, 2]) {
    const task = predict.create(bank.predict, { variantId, seed: 31, vendor, surprises });
    const evidence = portEvidence(task);
    const rows = evidenceRows(predictHtml(task, vendor));
    assert.equal(rows.length, evidence.length, `${variantId}/${vendor}/${surprises}: a row per configured port`);
    assert.equal(rows.length, Object.values(task.configurations).reduce((n, c) => n + Object.keys(c.ports).length, 0));
    rows.forEach(([, port, host, value], i) => {
      const row = evidence[i];
      assert.equal(port, row.port);
      assert.equal(host.replace(/ надсилає$/, ''), row.host ?? `до ${peerOf(task.topology, row.device, row.port)}`);
      if (!row.host) assert.match(host, /^до SW\d$/, 'a trunk row names its neighbour');
      assert.equal(value, evidenceValue(row));
    });
    assert.deepEqual(evidenceGroups(evidence).map(g => g.device), [...new Set(evidence.map(r => r.device))], 'one group per switch');
  }
});

test('round 5 VLAN: evidence — an access port reassigned shows the configured VLAN, not the planned one', () => {
  for (const vendor of VENDORS) {
    const { raw, task } = withSurprise('p1', vendor, 'access-a');
    const moved = raw.activeSurprises.find(s => s.id === 'access-a');
    const config = task.configurations[moved.device].ports[moved.port];
    const label = task.topology.devices.find(d => d.id === moved.device).ports.find(p => p.id === moved.port).label[vendor];
    const row = evidenceRows(predictHtml(task, vendor)).find(r => r[1] === label);
    assert.equal(row[2].replace(/ надсилає$/, ''), 'PC1');
    assert.equal(row[3].split(' · ')[0], vendor === 'cisco' ? `VLAN ${config.vlan}` : `PVID ${config.pvid}`, `${vendor}: the configured value`);
  }
});

test('round 5 VLAN: evidence — a missing transit VLAN: the trunk allows it, the switch says what is created', () => {
  const { raw, task } = withSurprise('p3', 'cisco', 'missing-transit');
  const vids = task.configurations.SW1.vlans;
  const missing = vids.find(v => !task.configurations.SW2.vlans.includes(v));
  assert.ok(missing !== undefined && raw.activeSurprises.some(s => s.id === 'missing-transit'));
  const rows = evidenceRows(predictHtml(task, 'cisco'));
  const sw2 = rows.find(r => r[0].startsWith('SW2'));
  assert.ok(sw2[0].includes(ui.evidenceCreated({ vids: task.configurations.SW2.vlans })), sw2[0]);
  assert.ok(!sw2[0].includes(String(missing)), 'the missing VLAN is not among the created');
  const sw2Trunks = portEvidence(task).filter(r => r.device === 'SW2' && r.allowed);
  assert.ok(sw2Trunks.some(r => r.allowed.includes(missing)), 'a trunk still allows it');
  assert.ok(rows.some(r => r[3].includes(`транк: `) && r[3].includes(String(missing))), 'and the table shows that allowance');
});

test('round 5 VLAN: evidence — MikroTik filtering off is said where it is the case, and only there', () => {
  const { task } = withSurprise('p3', 'routeros', 'filtering-off');
  const html = predictHtml(task, 'routeros');
  const off = Object.entries(task.configurations).filter(([, c]) => c.filtering === false).map(([id]) => id);
  assert.ok(off.length > 0);
  const cells = evidenceRows(html).filter(r => r[0]);
  for (const [cell] of cells) assert.equal(cell.includes(vlanTeaching.filteringOff), off.includes(cell.split(' ')[0]), cell);
  assert.match(html, /class="ng-vl-ev-note is-off">vlan-filtering вимкнено</);
  const on = predict.create(bank.predict, { variantId: 'p3', seed: 31, vendor: 'routeros', surprises: 0 });
  assert.ok(!predictHtml(on, 'routeros').includes(vlanTeaching.filteringOff), 'filtering on: no note');
});

test('repair v1 VLAN: evidence — MikroTik frame types; a trunk admitting only untagged frames reads differently', () => {
  const { raw, task } = withSurprise('p2', 'routeros', 'trunk-untagged');
  const bad = raw.activeSurprises.find(s => s.id === 'trunk-untagged');
  const label = task.topology.devices.find(d => d.id === bad.device).ports.find(p => p.id === bad.port).label.routeros;
  const rows = evidenceRows(predictHtml(task, 'routeros'));
  const broken = rows.find((r, i) => r[1] === label && portEvidence(task)[i].device === bad.device);
  const working = rows.find((r, i) => r[2].startsWith('до ') && !(r[1] === label && portEvidence(task)[i].device === bad.device));
  assert.match(broken[3], /^транк: [\d, ]+ · без тега$/, broken[3]);
  assert.match(working[3], /^транк: [\d, ]+ · з тегом$/, working[3]);
  assert.notEqual(broken[3].split(' · ')[1], working[3].split(' · ')[1]);
  assert.ok(portEvidence(task).every(r => typeof r.frameTypes === 'string'), 'every MikroTik row carries its frame types');
  assert.ok(rows.filter(r => !r[2].startsWith('до ')).every(r => / · (без тега|з тегом|усі кадри)$/.test(r[3])));
  const cisco = predict.create(bank.predict, { variantId: 'p2', seed: 31, vendor: 'cisco', surprises: 0 });
  assert.ok(portEvidence(cisco).every(r => r.frameTypes === undefined), 'Cisco has none');
});

test('repair v1 VLAN: evidence — the sender\'s row says «надсилає», and only the sender\'s', () => {
  const task = predict.create(bank.predict, { variantId: 'p2', seed: 31, vendor: 'cisco', surprises: 1 });
  const rows = evidenceRows(predictHtml(task, 'cisco'));
  const marked = rows.filter(r => r[2].endsWith(' надсилає'));
  assert.deepEqual(marked.map(r => r[2]), [`${task.rounds[0].from} надсилає`]);
});

test('round 5 VLAN: the evidence columns; ports are fact links; the work column carries its task counts', () => {
  const task = predict.create(bank.predict, { variantId: 'p2', seed: 31, vendor: 'cisco', surprises: 1 });
  const html = predictHtml(task, 'cisco');
  for (const word of vlanTeaching.evidenceColumns) assert.ok(html.includes(`<th scope="col">${word}</th>`), word);
  const links = [...html.matchAll(/<button type="button" class="ng-fact-link" aria-label="([^"]+) — показати на схемі"/g)].map(m => m[1]);
  assert.deepEqual(links, portEvidence(task).map(r => r.port));
  assert.match(html, new RegExp(`data-task-hosts="${task.topology.hosts.length}"`));
  assert.match(html, new RegExp(`data-task-ports="${portEvidence(task).length}"`));
  assert.deepEqual(taskCounts({ hosts: 3 }), { 'data-task-hosts': '3' });
});

test('round 5 VLAN: the action line names the choices; the choices carry the PC only; after the commit it says so', () => {
  const task = predict.create(bank.predict, { variantId: 'p1', seed: 7, vendor: 'cisco', surprises: 0 });
  const html = predictHtml(task, 'cisco');
  // Round 5 (5b-2 E): it says to go by the table's VLAN, not the addresses.
  assert.match(html, /<p id="ng-vl-predict-action" class="ng-action-line" data-action-line="">Познач ПК за VLAN, не за IP-адресами\.<\/p>/);
  assert.match(html, /class="ng-vl-choices" role="group" aria-labelledby="ng-vl-predict-action"/);
  // The action line sits right before the choices, after the evidence.
  assert.ok(html.indexOf('ng-vl-evidence') < html.indexOf('ng-vl-predict-action') && html.indexOf('ng-vl-predict-action') < html.indexOf('ng-vl-choices'));
  const choices = html.match(/<div class="ng-vl-choices"[^]*?<\/div>/)[0];
  assert.doesNotMatch(choices, /\d+\.\d+\.\d+\.\d+/, 'no address on a choice');
  assert.match(html, /class="ng-vl-svg is-quiet-ip"/, 'the addresses stay on the diagram, muted');
  const round = task.rounds[0];
  const answer = predict.solution(task)[round.id];
  const done = predictHtml(task, 'cisco', { commit: commit(task, initialCommitState(task), round.id, answer), position: 0 });
  assert.match(done, />Вибір зафіксовано\.</);
  assert.match(done, /aria-labelledby="ng-vl-choices-locked"/);
});

test('round 5 VLAN: the diagram\'s port labels are device-qualified facts; goal lines carry their VLAN', () => {
  const task = predict.create(bank.predict, { variantId: 'p3', seed: 31, vendor: 'cisco', surprises: 0 });
  const html = predictHtml(task, 'cisco');
  const facts = [...html.matchAll(/class="ng-vl-port-name" data-hl="([^"]+)"/g)].map(m => m[1]);
  assert.equal(facts.length, portEvidence(task).length);
  assert.ok(facts.every(f => /^port:SW\d:[\w/]+$/.test(f)), facts.join());
  assert.equal(new Set(facts).size, facts.length, 'no two labels share a fact (SW1:gi0/1 ≠ SW2:gi0/1)');
  const portsTask = ports.create(bank.ports[1], { variantId: bank.ports[1].variants[0].id, seed: 3, syntax: 'cisco' });
  const { third, fourth } = hostLines(portsTask);
  for (const hst of portsTask.topology.hosts) assert.deepEqual(third[hst.device].facts, [{ kind: 'vlan', value: String(portsTask.goals[hst.device]) }]);
  assert.deepEqual(fourth, {});
});

// ── «Налаштуй порти» ─────────────────────────────────────────────────────

const portsHtml = (taskIndex, syntax) => {
  const place = { exercise: 'ports', portsTask: bank.ports[taskIndex].id, portsSeeds: { [bank.ports[taskIndex].id]: 3 } };
  return unescape(h.renderScreen(storeFor({ place, prefs: { syntax } })));
};

test('round 5 VLAN: ports — two-line modes named «доступ (access)», «VLAN цього порту», what the VLAN list is for', () => {
  const html = portsHtml(1, 'cisco');
  const names = [...html.matchAll(/role="radio"[^>]*>(<span class="ng-vl-mode">[^]*?<\/span><\/span>)<\/button>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  assert.ok(names.length > 0 && names.length % 3 === 0, names.join('|'));
  assert.deepEqual(names.slice(0, 3), ['доступ (access)', 'транк (trunk)', 'не задано']);
  assert.match(html, /<span class="ng-vl-mode-word">доступ<\/span> <span class="ng-vl-mode-term">\(access\)<\/span>/);
  assert.match(html, /<th scope="col">VLAN цього порту<\/th>/);
  assert.match(html, /<p id="vl-SW1-vlans-what" class="ng-vl-form-what">створити на комутаторі \(один раз\)<\/p>/);
  assert.match(html, /id="vl-SW1-vlans"[^>]*aria-describedby="vl-SW1-vlans-what"/);
  assert.match(html, /<p id="ng-vl-ports-action" class="ng-action-line" data-action-line="">Для кожного порту обери режим, потім VLAN\.<\/p>/);
  // The action line comes right before the port table, with only the folded worked example between (5b-2 A).
  assert.match(html, /ng-vl-ports-action[^]*?<\/p><div class="ng-wex" data-worked-example="">[^]*?<\/div><\/div><table class="ng-vl-form-table">/);
  const mt = portsHtml(1, 'routeros');
  assert.ok(mt.includes(`>${ui.portsAction.routeros}</p>`));
});

test('round 5 VLAN: ports — every port cell is a fact link; the task counts are the switch\'s ports and the PCs', () => {
  for (const syntax of VENDORS) {
    const html = portsHtml(1, syntax);
    const task = ports.create(bank.ports[1], { variantId: bank.ports[1].variants[0].id, seed: 3, syntax });
    const sw1 = task.topology.devices.find(d => d.id === 'SW1');
    const cells = [...html.matchAll(/<th scope="row" class="ng-vl-port"><button type="button" class="ng-fact-link" aria-label="([^"]+) — показати на схемі"/g)].map(m => m[1]);
    assert.deepEqual([...cells].sort(), sw1.ports.map(p => p.label[syntax]).sort(), syntax);
    assert.match(html, new RegExp(`data-task-ports="${sw1.ports.length}"`));
  }
});

// ── «Між VLAN» ───────────────────────────────────────────────────────────

test('round 5 VLAN: «Між VLAN» — the action line comes from the task\'s givens, in every task and syntax', () => {
  for (const record of bank.route) for (const syntax of record.variants[0].syntaxes) {
    const place = { exercise: 'route', routeTask: record.id, routeSeeds: { [record.id]: 5 } };
    const html = unescape(h.renderScreen(storeFor({ place, prefs: { syntax } })));
    const task = route.create(record, { variantId: 'main', seed: 5, syntax });
    const action = interVlanAction(task, syntax);
    assert.ok(html.includes(`<p id="ng-vl-route-action" class="ng-action-line" data-action-line="">${action}</p>`), `${record.id}/${syntax}: ${action}`);
    assert.ok(html.indexOf('ng-vl-route-action') < html.indexOf('ng-vl-form-head'), 'above the first control');
    if (task.taskNumber === 1 && syntax === 'cisco') assert.match(action, /^Спочатку ввімкни gi0\/\d+, потім додай підінтерфейс на кожен VLAN\.$/);
    // Repair v1 (Fable suggestion 2): the first step and the order, two lines at 1000 × 700 (the gate measures them).
    assert.ok(action.length <= 90, `${record.id}/${syntax}: ${action.length} characters`);
  }
});

// ── One compact drawing (narrow essentials) ──────────────────────────────

/** The frame a 1000 × 700 window gives the drawing (measured: 514 wide; 346 high in the tightest gate case). */
const FRAME = { w: 514, h: 346 };
/** As production draws it (repair v1, Astra 3): with the interface lines of the actual first configuration
 * («Між VLAN»: the blank form with the task's givens, route.configuration; faults: the given configuration). */
function compactGeo(task, syntax, { gateways, lines = {} }) {
  const { third, fourth } = hostLines(task, { gateways });
  return { geo: layout(task.topology, syntax, { lines, compact: true, hostLines: gateways ? 5 : 4, pcWidth: compactPcWidth(task.topology, third, fourth) }), third, fourth };
}
const routeFirstLines = (task, syntax) => deviceLines(task, route.configuration(task, toRouteAnswer(flushRoute(blankRouteForm(task, syntax)), syntax), syntax), syntax);
const faultFirstLines = (task, syntax) => (task.taskNumber ? deviceLines(task, toFaultConfig(flushRoute(toFaultForm(task.initialConfiguration, syntax)), syntax), syntax) : {});
function assertFits(geo, task, third, fourth, what, frame = FRAME) {
  assert.ok(geo.compact, what);
  assert.ok(geo.view.w <= frame.w, `${what}: ${geo.view.w} wide`);
  assert.ok(geo.view.h <= frame.h, `${what}: ${geo.view.h} high`);
  // Every PC line fits its box at 12 (the drawing is never scaled below 1 here).
  for (const box of geo.hosts) {
    const hst = task.topology.hosts.find(x => x.device === box.id);
    const first = box.id.length * TEXT.name * 0.72 + (third[box.id] ? COMPACT.nameGap + third[box.id].text.length * 0.6 * TEXT.label : 0);
    const widest = Math.max(first, `${hst.ip}/${hst.prefix}`.length * 0.6 * TEXT.label, (fourth[box.id]?.text.length ?? 0) * 0.6 * TEXT.label);
    assert.ok(COMPACT.pad + widest <= box.w, `${what}: ${box.id}'s lines fit (${widest})`);
  }
  // Nothing overlaps: PC boxes apart, inside the view, links between a box and its switch.
  for (const [i, a] of geo.hosts.entries()) for (const b of geo.hosts.slice(i + 1)) {
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${what}: ${a.id} and ${b.id} apart`);
  }
  for (const box of [...geo.hosts, ...geo.switches]) assert.ok(box.x >= geo.view.x && box.x + box.w <= geo.view.x + geo.view.w && box.y + box.h <= geo.view.h, `${what}: ${box.id} inside`);
}

test('round 5 VLAN: «Між VLAN» draws one compact drawing that fits a 1000 × 700 window, every task and syntax', () => {
  for (const record of bank.route) for (const syntax of record.variants[0].syntaxes) for (const seed of [1, 5, 9]) {
    const task = route.create(record, { variantId: 'main', seed, syntax });
    const lines = routeFirstLines(task, syntax);
    if (task.taskNumber === 3) assert.ok(Object.values(lines).flat().length > 0, 'task 3: the router\'s given lines are drawn');
    const { geo, third, fourth } = compactGeo(task, syntax, { gateways: true, lines });
    assertFits(geo, task, third, fourth, `${record.id}/${syntax}/${seed}`);
    // A wide router's lines are never cut («…») on the first view.
    for (const box of geo.switches) assert.ok(box.lines.every(l => !l.shown.endsWith('…')), `${record.id}/${syntax}: ${box.id}'s lines whole`);
    const gateways = Object.values(fourth);
    assert.equal(gateways.length, task.topology.hosts.length, 'a gateway line per PC');
    assert.ok(gateways.every(l => l.facts[0].kind === 'address' && l.text.endsWith(l.facts[0].value)));
  }
});

test('round 5 VLAN: «Знайди несправність» draws the same compact drawing, every shape, level and vendor', () => {
  const record = bank.faults[0];
  for (const vendor of VENDORS) for (const level of [1, 3]) for (const variant of record.variants.filter(v => v.levels.includes(level) && v.syntaxes.includes(vendor))) {
    let task = null;
    for (let seed = 1; seed < 60 && !task; seed++) { try { task = faults.create(record, { vendor, level, seed, variantId: variant.id }); } catch { /* not every seed builds */ } }
    if (!task) continue;
    const routed = Boolean(task.taskNumber);
    const { geo, third, fourth } = compactGeo(task, vendor, { gateways: routed, lines: faultFirstLines(task, vendor) });
    // The faults' frame at 1000 × 700 (measured, a routed level: the level line beside «⋯», the aside folded): 514 × 370.
    assertFits(geo, task, third, fourth, `${variant.id}/${vendor}/L${level}`, { w: FRAME.w, h: 370 });
  }
});

test('round 5 VLAN: a short window folds the intro asides of «Між VLAN» and «Знайди несправність»', () => {
  assert.equal(isShort(641), true, '1000 × 700: the screen area under the bar');
  assert.equal(isShort(741), false, '1280 × 800');
});

test('round 5 VLAN: the interface lines name their facts explicitly (ports device-qualified, VLANs, addresses)', () => {
  const record = bank.route[0];
  const task = route.create(record, { variantId: 'main', seed: 5, syntax: 'cisco' });
  const parent = Object.keys(task.topology.devices.find(d => d.id === 'R1').ports.reduce((o, p) => ({ ...o, [p.id]: 1 }), {}))[0];
  const config = { R1: { interfaces: { [parent]: { up: true } }, subifs: [{ parent, number: '20', vid: '20', ip: '10.0.20.1', prefix: 24 }] } };
  const lines = deviceLines(task, config, 'cisco').R1;
  const label = task.topology.devices.find(d => d.id === 'R1').ports.find(p => p.id === parent).label.cisco;
  assert.deepEqual(lines[0].facts, [{ kind: 'port', value: `R1:${label}` }]);
  assert.deepEqual(lines[1].facts, [{ kind: 'port', value: `R1:${label}.20` }, { kind: 'vlan', value: '20' }]);
  assert.deepEqual(lines[2].facts, [{ kind: 'address', value: '10.0.20.1' }]);
});

test('round 5 VLAN: the faults stages\' action lines', () => {
  assert.equal(faultsUi.action.checks, 'Торкнись перевірки, що не проходить.');
  // Repair v1 (Fable 2): with the action line, the lead says only what a tap shows; one instruction.
  assert.equal(faultsUi.evidenceLead, 'Торкнута перевірка покаже шлях на схемі. Це не спроба.');
  for (const words of Object.values(ui.portsAction)) assert.ok(words.length <= 90, words);
  assert.match(ui.portsAction.routeros, /filtering — останнім\.$/, 'MikroTik ports: filtering after the table');
  for (const words of Object.values(faultsUi.action)) assert.match(words, /^[А-ЯІЇЄҐ][^.]*\.$/u, 'one sentence');
});
