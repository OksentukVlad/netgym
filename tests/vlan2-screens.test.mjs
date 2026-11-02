// «Між VLAN» screens (VLAN-2 spec §3, v2 X1, X5–X7; brief v1 items 1–7):
// their pure view (routeState.js, diagram.js's layout and traceScene), the
// screen rendered on the server from a given store (tests/harness/vlan.jsx),
// the leak gate, and the strings. The mounted lifecycle checks are in
// tests/helpers/mounted-vlan.mjs (run by tests/vlan-mounted.test.mjs).
//
// The leak gate, per task and syntax: before «Показати відповідь», no
// command line of the reference that the student's own configuration
// doesn't have, and no reference interface mapping (a subinterface or VLAN
// interface label for a VLAN the student didn't configure), appears
// anywhere: blank, after a failed check, with all three hints open. The
// screen never calls the logic's solution. Address strings the task already
// gives (the PCs' gateways, X6) are allowed. After the reveal they appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, traceScene, treePath, followPath, hostStatus, lineStatus, PC } from '../src/sections/vlan/screens/diagram.js';
import * as R from '../src/sections/vlan/screens/routeState.js';
import route from '../src/sections/vlan/logic/route.js';
import { switchReference, routerReference } from '../src/sections/vlan/logic/route-model.js';
import { records } from '../src/banks/vlan/route.js';
import { copy, t, routeUi, routeNotes, routeText, ui } from '../src/sections/vlan/uk.js';
import { initialInstance } from '../src/ui/exercise-state.js';
import { hop, out } from './helpers/vlan.mjs';

const h = await import('../.test-bundles/harness/vlan.mjs');
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const combos = records.flatMap(r => r.variants[0].syntaxes.map(syntax => [r, syntax]));
const create = (n, syntax, seed = 5) => route.create(records[n - 1], { seed, syntax });
const reference = (task, syntax) => ({ SW1: switchReference(task, 'SW1', syntax), R1: routerReference(task, syntax) });

// ── Forms and answers ────────────────────────────────────────────────────

test('route forms: blank forms are route.initialAnswer (no reference), and come back as it', () => {
  for (const [record, syntax] of combos) {
    const task = route.create(record, { seed: 9, syntax });
    const form = R.blankRouteForm(task, syntax);
    assert.deepEqual(R.toRouteAnswer(form, syntax), route.initialAnswer(task, syntax), `${record.id}/${syntax}`);
  }
  // The router starts blank (X6) except task 3's given rows.
  assert.deepEqual(R.blankRouteForm(create(1, 'cisco'), 'cisco').R1, { interfaces: { r: { up: false } }, subifs: [] });
  assert.deepEqual(R.blankRouteForm(create(2, 'routeros'), 'routeros').R1, { vlanIfs: [], addresses: [] });
  assert.equal(R.blankRouteForm(create(3, 'cisco'), 'cisco').R1.subifs.length, 2);
  assert.deepEqual(R.fixedOf(create(3, 'cisco'), 'cisco').rows, { subifs: 2, vlanIfs: 0, addresses: 0 });
  assert.equal(R.fixedOf(create(1, 'routeros'), 'routeros').switchWhole, true);
  assert.deepEqual(R.fixedOf(create(3, 'routeros'), 'routeros').switchPorts.sort(), ['a1', 'a2', 'a3', 'a4']);
});

test('route forms: addresses, gateways and names parse on blur; a typo stays as typed and is marked', () => {
  assert.deepEqual(R.parseAddress('172.16.10.1/24'), { ip: '172.16.10.1', prefix: 24 });
  assert.deepEqual(R.parseAddress(' 172.16.10.1 255.255.255.0 '), { ip: '172.16.10.1', prefix: 24 });
  assert.deepEqual(R.parseAddress('172,16,10,1 / 255.255.255.128'), { ip: '172.16.10.1', prefix: 25 });
  for (const bad of ['172.16.10.1', '172.16.10.1/33', '172.16.10.300/24', '172.16.10.1 255.0.255.0', 'abc']) assert.equal(R.parseAddress(bad), null, bad);
  assert.equal(R.formatAddress({ ip: '10.0.0.1', prefix: 24 }, 'cisco'), '10.0.0.1 255.255.255.0');
  assert.equal(R.formatAddress({ ip: '10.0.0.1', prefix: 24 }, 'routeros'), '10.0.0.1/24');
  assert.equal(R.formatAddress({ ip: '10.0.0.x', prefix: null }, 'cisco'), '10.0.0.x');
  const task = create(1, 'cisco');
  let form = R.addRow(task, R.blankRouteForm(task, 'cisco'), 'R1', 'subifs');
  assert.deepEqual(form.R1.subifs, [{ parent: 'r', number: '', vid: '', ip: '', prefix: null }], 'a new row is blank');
  form = R.flushRoute(form, { 'R1|subifs.0.number': '10', 'R1|subifs.0.vid': '1x', 'R1|subifs.0.address': '10.0.0.1 255.255.255.0', 'R1|subifs.5.vid': '3' });
  assert.deepEqual(form.R1.subifs[0], { parent: 'r', number: 10, vid: '1x', ip: '10.0.0.1', prefix: 24 });
  assert.equal(form.R1.subifs.length, 1, 'a removed row’s text is dropped');
  form = R.writeRouteText(form, 'R1', 'subifs.0.address', '10.0.0.1/2x');
  assert.deepEqual([form.R1.subifs[0].ip, form.R1.subifs[0].prefix], ['10.0.0.1/2x', null]);
  const result = route.check(task, R.toRouteAnswer(form, 'cisco'), { syntax: 'cisco' });
  assert.equal(R.isFormFailure(result), true);
  // The live commands: what parses only (never «null» for a mask).
  const shown = route.render(R.forCommands(route.configuration(task, R.toRouteAnswer(form, 'cisco'), 'cisco')), 'cisco', task.topology).R1;
  assert.doesNotMatch(shown, /null|ip address/);
  assert.match(shown, /interface gi0\/\d\.10\n encapsulation dot1Q 1x/);
  // Cisco's management block and MikroTik's route.
  const t3 = create(3, 'cisco');
  let sw = R.writeRouteText(R.blankRouteForm(t3, 'cisco'), 'SW1', 'svi.address', '172.16.224.60 255.255.255.0');
  sw = R.writeRouteText(sw, 'SW1', 'defaultGateway', ' 172.16.224.254 ');
  assert.deepEqual(sw.SW1.svi, { vid: '', ip: '172.16.224.60', prefix: 24 });
  assert.equal(sw.SW1.defaultGateway, '172.16.224.254');
  assert.equal(R.toRouteAnswer(sw, 'cisco').SW1.svi.vid, null);
  const r3 = create(3, 'routeros');
  let ros = R.writeRouteText(R.blankRouteForm(r3, 'routeros'), 'SW1', 'routes.0.gateway', '172.16.224.254');
  assert.deepEqual(ros.SW1.routes, [{ dst: '0.0.0.0/0', gateway: '172.16.224.254' }]);
  assert.deepEqual(R.writeRouteText(ros, 'SW1', 'routes.0.gateway', '').SW1.routes, []);
  // Renaming a VLAN interface: its addresses follow (as in Winbox), unless another keeps the name.
  ros = R.addRow(r3, R.addRow(r3, ros, 'SW1', 'vlanIfs'), 'SW1', 'addresses');
  ros = R.flushRoute(ros, { 'SW1|vlanIfs.0.name': 'mgmt', 'SW1|vlanIfs.0.vid': '10', 'SW1|addresses.0.address': '172.16.224.60/24' });
  ros.SW1.addresses[0].iface = 'mgmt';
  ros = R.writeRouteText(ros, 'SW1', 'vlanIfs.0.name', 'manage');
  assert.equal(ros.SW1.addresses[0].iface, 'manage');
  // Removing a row: its list's typed texts go in first; later rows' texts don't land on the wrong row.
  const twoRows = R.addRow(task, R.addRow(task, R.blankRouteForm(task, 'cisco'), 'R1', 'subifs'), 'R1', 'subifs');
  const removed = R.removeRow(twoRows, { 'R1|subifs.1.number': '20', 'R1|subifs.0.number': '10' }, 'R1', 'subifs', 0);
  assert.deepEqual(removed.form.R1.subifs.map(s => s.number), [20]);
  assert.deepEqual(removed.raw, {});
});

// ── After a check ────────────────────────────────────────────────────────

test('route marks: form findings by field (an attachment id becomes its row), bridge1 conflicts mark its VLAN rows, coverage marks its row, not the SVI’s state', () => {
  const task = create(1, 'cisco'), ref = reference(task, 'cisco');
  const noEncap = structuredClone(ref);
  noEncap.R1.subifs[1].vid = null;
  const r1 = route.check(task, noEncap, { syntax: 'cisco' });
  assert.deepEqual(R.routeMarks(task, r1, noEncap, 'cisco'), { R1: [{ field: 'subifs.1.vid', code: 'missing-encapsulation', params: {} }] });
  assert.equal(R.routeFailure(r1).kind, 'form');
  // A collision is reported on the attachment id: the row is marked.
  const collide = structuredClone(ref);
  collide.R1.subifs[1].ip = task.topology.hosts[0].ip;
  const marks = R.routeMarks(task, route.check(task, collide, { syntax: 'cisco' }), collide, 'cisco');
  assert.ok(marks.R1.some(m => m.field === 'subifs.1' && m.code === 'address-collision'), JSON.stringify(marks));
  // A real bridge1 conflict (the logic's field ports.bridge1, no port row): the VLAN rows that list it.
  const r3 = create(3, 'routeros'), m3 = r3.management;
  const cpu = { SW1: switchReference(r3, 'SW1', 'routeros'), R1: routerReference(r3, 'routeros') };
  const row = cpu.SW1.vlans.findIndex(r => r.vids.includes(m3.vid));
  cpu.SW1.vlans[row].untagged.push('bridge1');
  Object.assign(cpu.SW1, { vlanIfs: [{ name: 'm', vid: m3.vid, on: 'bridge1' }], addresses: [{ ip: m3.network.replace(/\.0$/, '.60'), prefix: 24, iface: 'm' }], routes: [{ dst: '0.0.0.0/0', gateway: m3.gateway }] });
  const conflict = route.check(r3, cpu, { syntax: 'routeros' });
  assert.ok(conflict.findings.some(f => f.field === 'ports.bridge1'), JSON.stringify(conflict.findings));
  assert.deepEqual(R.routeMarks(r3, conflict, cpu, 'routeros').SW1.filter(m => m.code === 'port-in-two-vlans-untagged').map(m => m.field), [`vlans.${row}`]);
  // Coverage (X5): the narrower prefix's row, beside a probe failure.
  const narrow = structuredClone(ref);
  narrow.R1.subifs[1].prefix = 25;
  const r2 = route.check(task, narrow, { syntax: 'cisco' });
  assert.deepEqual(R.routeMarks(task, r2, narrow, 'cisco').R1.map(m => [m.field, m.code]), [['subifs.1', 'router-prefix-mismatch']]);
  // X7: the trunk's stop first, the SVI's inactivity second, and no SVI mark.
  const t3 = create(3, 'cisco'), m = t3.management;
  const cut = route.initialAnswer(t3, 'cisco');
  Object.assign(cut.SW1, { svi: { vid: m.vid, ip: m.network.replace(/\.0$/, '.60'), prefix: 24 }, defaultGateway: m.gateway });
  cut.R1.subifs.push({ parent: 'r', number: m.vid, vid: m.vid, ip: m.gateway, prefix: 24 });
  const cutResult = route.check(t3, cut, { syntax: 'cisco' });
  const failure = R.routeFailure(cutResult);
  assert.equal(failure.kind, 'probe');
  const words = R.routeFailureWords(t3, failure, { syntax: 'cisco', attachments: cutResult.evidence.attachments, config: cut });
  assert.match(words[0], new RegExp(`^PC1 → SW1 Vlan${m.vid}: Не вдається дістатися`));
  assert.equal(words[1], `Також SW1 Vlan${m.vid}: ${t('internal-interface-down')}`, 'an SVI says why it is down, not the router-port words');
  assert.deepEqual(R.routeMarks(t3, cutResult, cut, 'cisco'), {});
  // SW1 with no address at all: the logic's own code (management-missing).
  const blank = route.check(t3, route.initialAnswer(t3, 'cisco'), { syntax: 'cisco' });
  assert.equal(blank.code, 'management-missing');
  assert.deepEqual(R.routeFailureWords(t3, R.routeFailure(blank), { syntax: 'cisco', attachments: blank.evidence.attachments }), [`SW1: ${t('management-missing')}`]);
  // A missing router gateway (real merged finding): named once, with its address.
  const noGateway = structuredClone(ref);
  noGateway.R1.subifs[1].ip = noGateway.R1.subifs[1].ip.replace(/\.\d+$/, '.99');
  const missing = route.check(task, noGateway, { syntax: 'cisco' });
  const finding = missing.findings.find(f => f.code === 'router-gateway-missing');
  const gw = task.networks[1].gateway;
  assert.deepEqual(finding.params, { gateway: gw });
  const missingFailure = R.routeFailure({ ...missing, findings: [finding] });
  assert.equal(missingFailure.kind, 'objective');
  assert.deepEqual(R.routeFailureWords(task, missingFailure, { syntax: 'cisco', attachments: missing.evidence.attachments }), [`R1: Немає інтерфейсу з адресою шлюзу ${gw}, заданою в умові.`]);
  // The bridge CPU port not tagged (RouterOS before 7.16, no dynamic membership): its «Також» line.
  const old = structuredClone(create(3, 'routeros'));
  for (const d of old.topology.devices) if (d.id === 'SW1') d.dynamicBridgeTagged = false;
  const noCpu = { SW1: switchReference(old, 'SW1', 'routeros'), R1: routerReference(old, 'routeros') };
  Object.assign(noCpu.SW1, { vlanIfs: [{ name: 'm', vid: old.management.vid, on: 'bridge1' }], addresses: [{ ip: old.management.network.replace(/\.0$/, '.60'), prefix: 24, iface: 'm' }], routes: [{ dst: '0.0.0.0/0', gateway: old.management.gateway }] });
  const cpuResult = route.check(old, noCpu, { syntax: 'routeros' });
  const cpuWords = R.routeFailureWords(old, R.routeFailure(cpuResult), { syntax: 'routeros', attachments: cpuResult.evidence.attachments });
  assert.ok(cpuWords.includes(`Також SW1 m: ${t('bridge-cpu-not-tagged')}`), cpuWords.join('\n'));
});

test('route probe shown: the failing one; after a success, task 3’s management address, else two VLANs', () => {
  const t1 = create(1, 'routeros'), ok1 = route.check(t1, reference(t1, 'routeros'), { syntax: 'routeros' });
  const p1 = R.shownProbe(t1, ok1, null);
  assert.equal(p1.kind, 'pc-pair');
  assert.notEqual(t1.goals[p1.from], t1.goals[p1.to]);
  const t3 = create(3, 'routeros'), ref3 = route.initialAnswer(t3, 'routeros');
  const full = { SW1: switchReference(t3, 'SW1', 'routeros'), R1: routerReference(t3, 'routeros') };
  full.SW1.vlans.find(r => r.vids.includes(t3.management.vid)).tagged.push('bridge1');
  Object.assign(full.SW1, { vlanIfs: [{ name: 'm', vid: t3.management.vid, on: 'bridge1' }], addresses: [{ ip: t3.management.network.replace(/\.0$/, '.60'), prefix: 24, iface: 'm' }], routes: [{ dst: '0.0.0.0/0', gateway: t3.management.gateway }] });
  const ok3 = route.check(t3, full, { syntax: 'routeros' });
  assert.equal(ok3.ok, true, JSON.stringify(ok3.findings));
  const p3 = R.shownProbe(t3, ok3, null);
  assert.equal(p3.kind, 'management');
  assert.equal(ok3.evidence.attachments.find(a => a.id === p3.to).device, 'SW1');
  assert.ok(ref3);
});

test('route trace on the diagram (hand-written walk): only the path, the drop on it, no «✓» for a PC the broadcast also reached', () => {
  const task = create(1, 'cisco'), [a] = task.vids, gateway = task.networks[0].gateway;
  const geo = layout(task.topology, 'cisco', { hostLines: 5 });
  const walk = {
    from: 'PC1', received: new Set(['PC2']), arrivals: [], attachmentArrivals: [],
    hops: [
      hop('PC1', null, false, null, [out('nic', false, null)]),
      hop('SW1', 'a1', false, a, [out('t', true, a), out('a2', false, a)], [{ port: 'a3', code: 'not-allowed-out' }], false),
      hop('R1', 'r', true, a, [], [{ port: 'r', code: 'interface-down' }]),
      hop('PC2', 'nic', false, null),
    ],
  };
  const trace = { from: 'PC1', to: 'PC3', ok: false, code: 'interface-down', hops: [], steps: [{ kind: 'segment', index: 0 }],
    segments: [{ from: 'PC1', to: null, nextHopIp: gateway, ok: false, code: 'interface-down', walks: [walk] }] };
  const linkTo = (x, y) => task.topology.links.findIndex(l => (l.a.device === x && l.b.device === y) || (l.a.device === y && l.b.device === x));
  assert.deepEqual(treePath(task.topology, 'PC1', 'R1').map(s => s.index), [linkTo('PC1', 'SW1'), linkTo('SW1', 'R1')]);
  const scene = traceScene(geo, task.topology, trace, []);
  assert.deepEqual(Object.keys(scene.carried).map(Number).sort(), [linkTo('PC1', 'SW1'), linkTo('SW1', 'R1')].sort(), 'not PC2’s link, though the broadcast went there');
  assert.deepEqual(scene.carried[linkTo('SW1', 'R1')], [{ tagged: true, vid: a, arrow: '↑' }]);
  assert.deepEqual(scene.drops, [{ device: 'R1', port: 'r', code: 'interface-down' }], 'the drop on the path only (not SW1’s other access port)');
  assert.deepEqual(scene.received, []);
  assert.equal(hostStatus(scene, 'PC2'), 'missed', 'PC2 got the broadcast but not the packet: no «✓ отримав»');
  assert.equal(hostStatus(scene, 'PC1'), 'source');
  const svg = unescape(h.renderDiagram({ geo, topology: task.topology, scene }));
  assert.doesNotMatch(svg, />✓ отримав</);
  assert.equal((svg.match(/>↑ тег \d+</g) ?? []).length, 1);
  // The same walk in words: along the path, stopping at R1's port.
  const words = R.traceLines(task, 'cisco', trace, []);
  assert.deepEqual(words.slice(0, 2), [t('route-segment', { from: 'PC1', to: null, nextHopIp: gateway }), 'PC1 надсилає широкомовний кадр без тега.']);
  assert.ok(words.some(w => w.startsWith('R1 gi0/') && w.endsWith(t('interface-down'))), words.join('\n'));
  assert.ok(!words.some(w => w.includes('PC2')), 'nothing about PC2');
  assert.equal(words.at(-1), routeUi.stops);
  assert.doesNotMatch(words[0], /обидва боки/, 'no «both ways» without a way back shown');
  const steps = R.traceSteps(task, 'cisco', trace, []);
  assert.deepEqual(steps.groups.map(g => g.kind), ['segment']);
  assert.equal(steps.groups[0].heading, words[0]);
  // followPath reads the walk; it computes nothing.
  assert.equal(followPath(task.topology, walk, 'PC1', 'R1', null).stop.code, 'interface-down');
});

test('route trace on the diagram (a real success): up in one VLAN, routed, down in another; interface lines marked', () => {
  const task = create(1, 'cisco'), ref = reference(task, 'cisco'), result = route.check(task, ref, { syntax: 'cisco' });
  const probe = R.shownProbe(task, result, null), atts = result.evidence.attachments;
  const lines = R.deviceLines(task, route.configuration(task, ref, 'cisco'), 'cisco');
  const geo = layout(task.topology, 'cisco', { lines, hostLines: 5 });
  const scene = traceScene(geo, task.topology, probe.request, atts);
  const trunk = task.topology.links.findIndex(l => l.a.device === 'SW1' && l.b.device === 'R1');
  assert.deepEqual(scene.carried[trunk].map(c => `${c.arrow}${c.vid}`), [`↑${task.goals[probe.from]}`, `↓${task.goals[probe.to]}`]);
  assert.deepEqual(scene.received, [probe.to]);
  const r1 = geo.switches.find(b => b.id === 'R1');
  assert.deepEqual(r1.lines.map(l => lineStatus(scene, l)), [null, 'received', 'received', 'hop', 'hop']);
  const words = R.traceLines(task, 'cisco', probe.request, atts);
  const hopAt = words.findIndex(w => w.startsWith('R1: маршрутизація'));
  assert.ok(hopAt > 0 && words.slice(0, hopAt).some(w => w.endsWith('кадр отримано.')) && words.at(-1) === routeUi.arrived({ to: probe.to }), words.join('\n'));
  // Sub-headings: segment, router hop, segment; the hop has no lines of its own.
  const steps = R.traceSteps(task, 'cisco', probe.request, atts);
  assert.deepEqual(steps.groups.map(g => g.kind), ['segment', 'hop', 'segment']);
  assert.deepEqual(steps.groups[1].lines, []);
  assert.ok(steps.groups.every(g => !/обидва боки/.test(g.heading)));
});

test('route isolation objective: VLAN-1’s walk, the PCs it must not reach named, in VLAN-1’s words', () => {
  const task = create(2, 'cisco'), [a, b] = task.vids;
  const pcA = task.topology.hosts.find(h => task.goals[h.device] === a).device, pcB = task.topology.hosts.find(h => task.goals[h.device] === b).device;
  const port = id => task.topology.links.find(l => l.a.device === id || l.b.device === id);
  const portOf = id => (port(id).a.device === id ? port(id).b.port : port(id).a.port);
  // Hand-written: A's broadcast reaches B's link (a leak); B's own stays home.
  const leak = { from: pcA, received: new Set([pcB]), arrivals: [{ host: pcB, device: pcB, port: 'nic', tagged: false, vid: null }], attachmentArrivals: [],
    hops: [hop(pcA, null, false, null, [out('nic', false, null)]), hop('SW1', portOf(pcA), false, a, [out(portOf(pcB), false, a)], [], false), hop(pcB, 'nic', false, null)] };
  const home = { from: pcB, received: new Set(), arrivals: [], attachmentArrivals: [], hops: [hop(pcB, null, false, null, [out('nic', false, null)])] };
  const objective = { id: `isolation:${pcA}:${pcB}`, ok: false, code: 'must-not-reach', walks: [home, leak] };
  const shown = R.objectiveWalk(task, objective);
  assert.equal(shown.walk, leak);
  assert.deepEqual(shown.leaked, [pcB]);
  const words = R.objectiveLines(task, 'cisco', leak, []);
  assert.ok(!words.includes(t('reachability-abstraction')), 'VLAN-1’s ping note is not about an isolation walk');
  assert.equal(words[0], `${pcA} надсилає широкомовний кадр без тега.`);
  const failure = R.routeFailure({ ok: false, findings: [{ code: 'must-not-reach', severity: 'blocks', entity: `${pcA}:${pcB}` }], evidence: { probes: [{ id: 'p' }], objectives: [objective], attachments: [] } });
  assert.equal(failure.kind, 'objective');
  assert.deepEqual(R.routeFailureWords(task, failure, { syntax: 'cisco' }), [ui.line({ where: ui.pair({ from: `${pcA} (${ui.goal(a)})`, to: `${pcB} (${ui.goal(b)})` }), text: t('must-not-reach') })]);
  // A management address's walk reaching a PC link: that PC; reached by a PC's frame: the interface.
  const mgmt = { id: 'management-isolation:SW1:svi', ok: false, code: 'must-not-reach', walk: { ...home, from: 'SW1:svi', arrivals: [{ host: pcA }] }, reverseWalks: [] };
  assert.deepEqual(R.objectiveWalk(task, mgmt), { walk: mgmt.walk, leaked: [pcA], iface: { id: 'SW1:svi', status: 'source' } });
  const reverse = { ...mgmt, walk: { ...home, from: 'SW1:svi', arrivals: [] }, reverseWalks: [leak] };
  assert.deepEqual(R.objectiveWalk(task, reverse).iface, { id: 'SW1:svi', status: 'leaked' });
});

test('route diagram lines: from the submitted configuration only, with the compile’s attachment ids', () => {
  assert.deepEqual(Object.keys(R.deviceLines(create(2, 'routeros'), route.initialAnswer(create(2, 'routeros'), 'routeros'), 'routeros')), []);
  const t1 = create(1, 'cisco');
  assert.deepEqual(R.deviceLines(t1, route.configuration(t1, route.initialAnswer(t1, 'cisco'), 'cisco'), 'cisco').R1.map(l => l.text), [`${t1.topology.devices.find(d => d.id === 'R1').ports[0].label.cisco} · shutdown`]);
  for (const [record, syntax] of combos) {
    const task = route.create(record, { seed: 11, syntax });
    const ref = route.configuration(task, { ...reference(task, syntax) }, syntax);
    const lines = R.deviceLines(task, ref, syntax);
    const ids = new Set(route.compile(task, ref, { syntax }).topology.attachments.map(a => a.id));
    for (const line of Object.values(lines).flat()) for (const id of line.ids) if (line.kind !== 'on' && line.kind !== 'off') assert.ok(ids.has(id), `${record.id}/${syntax}: ${id}`);
    // The layout fits them: router above the switch, nothing overlapping, everything inside.
    const geo = layout(task.topology, syntax, { lines, hostLines: 5 });
    const boxes = [...geo.switches, ...geo.hosts];
    const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${boxes[i].id} × ${boxes[j].id}`);
    for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= geo.view.w && b.y + b.h <= geo.view.h, `${b.id} inside`);
    assert.deepEqual(geo.switches.map(b => b.id), ['R1', 'SW1'], 'the router first, above');
    assert.ok(geo.hosts.every(b => b.h === PC.h + 17), 'PC boxes have the gateway line');
    for (const b of geo.switches) assert.ok(b.h >= 42 + 16 * (b.lines.length - 1) + 10 || !b.lines.length, `${b.id} fits its lines`);
  }
});

test('route hints: in the screen’s words, never an internal id', () => {
  for (const [record, syntax] of combos) {
    const task = route.create(record, { seed: 13, syntax }), answer = route.initialAnswer(task, syntax);
    const texts = R.routeHintTexts(task, route.hints(task, answer, { syntax }), route.compile(task, answer, { syntax }).topology.attachments);
    assert.equal(texts.length, 3);
    for (const text of texts) assert.doesNotMatch(text, /pc-pair:|gateway:|management:|R1:|SW1:svi|\[|undefined|^[:;] /, `${record.id}/${syntax}: ${text}`);
  }
});

test('route fix round: commands wait for a VLAN interface’s port; a missing seed falls back to a buildable one; hint rung 2 in names', async () => {
  const task = create(1, 'routeros');
  const draft = route.initialAnswer(task, 'routeros');
  draft.R1.vlanIfs = [{ name: 'vlan10', vid: 10, on: null }, { name: 'vlan20', vid: 20, on: 'r' }];
  const shown = route.render(R.forCommands(draft), 'routeros', task.topology).R1;
  assert.doesNotMatch(shown, /vlan10|interface=""/);
  assert.match(shown, /name=vlan20 vlan-id=20 interface=ether\d/);
  const { firstValidSeed } = await import('../src/sections/vlan/screens/predictState.js');
  assert.equal(firstValidSeed(s => s > 3), 4);
  assert.equal(firstValidSeed(() => false), 1);
  // Rung 2 from the logic: an L3 interface as «R1 gi0/N.V», a probe id never as a device, «: » only after a prefix.
  const ref = reference(task, 'routeros');
  const okHint = route.hints(task, ref, { syntax: 'routeros' })[1];
  assert.equal(t(okHint.code, okHint.params), t('ok'));
  const t3 = create(3, 'cisco');
  const blankHint = route.hints(t3, route.initialAnswer(t3, 'cisco'), { syntax: 'cisco' })[1];
  assert.equal(t(blankHint.code, blankHint.params), `SW1: ${t('management-missing')}`);
  const c1 = create(1, 'cisco'), one = route.initialAnswer(c1, 'cisco');
  one.R1.interfaces.r.up = true;
  one.R1.subifs = [{ parent: 'r', number: c1.vids[0], vid: c1.vids[0], ip: c1.networks[0].gateway, prefix: 24 }];
  const noRoute = route.hints(c1, one, { syntax: 'cisco' })[1];
  assert.equal(noRoute.params.device, '', 'no device for a router decision, never the probe id');
  assert.match(t(noRoute.code, noRoute.params), /^PC\d → PC\d: Маршрутизатор не має/);
});

// ── The screen, rendered ─────────────────────────────────────────────────

function storeFor({ place, key, view = {}, session = null, prefs = {}, result = null, presses = 0 }) {
  const state = h.initialStore(prefs);
  state.places.vlan = place;
  if (key) state.instances[key] = { ...initialInstance(), view, result, presses, ...(session ? { session: { ...initialInstance().session, ...session } } : {}) };
  return state;
}
const routePlace = (taskId, seed) => ({ exercise: 'route', routeTask: taskId, routeSeeds: { [taskId]: seed }, predict: {} });
function counting(fn) {
  const real = h.route.solution;
  let n = 0;
  h.route.solution = (...a) => { n += 1; return real(...a); };
  try { return { value: fn(), calls: () => n }; } finally { h.route.solution = real; }
}
const commandLines = html => [...unescape(html).matchAll(/<span class="ng-vl-cmd-line">([^<]*)<\/span>/g)].map(m => m[1]);
const r1Lines = html => {
  const svg = unescape(html).match(/<svg[^]*<\/svg>/)?.[0] ?? '';
  const box = svg.split('<g class="ng-vl-switch').find(part => /class="ng-vl-switch-name[^"]*">R1/.test(part)) ?? '';
  return [...box.matchAll(/class="ng-vl-iface-text"[^>]*>([^<]*)</g)].map(m => m[1]);
};

test('route screen: the third tab; task 4 only in MikroTik, one line why in Cisco; the router box and gateways on the diagram', () => {
  const place = h.firstPlace(h.bank, () => 0.3);
  assert.deepEqual(Object.keys(place.routeSeeds), records.map(r => r.id));
  assert.equal(place.routeTask, 'vlan.route-1');
  const cisco = unescape(h.renderScreen(storeFor({ place: { ...place, exercise: 'route' } })));
  assert.match(cisco, /aria-label="Вправа"[^]*>Куди дійде кадр<[^]*>Налаштуй порти<[^]*>Між VLAN</);
  assert.deepEqual([...cisco.matchAll(/role="radio"[^>]*>(\d · [^<]+)</g)].map(m => m[1]), ['1 · На паличці', '2 · Транк теж твій', '3 · Керування']);
  assert.ok(!cisco.includes(routeUi.ciscoNoBridge), 'round 4 (F5): no line about task 4 in Cisco');
  assert.ok(cisco.includes(routeUi.taskOne[1]), 'the task in one sentence');
  assert.equal((cisco.match(/role="status"/g) ?? []).length, 1);
  assert.doesNotMatch(cisco, /✅|спроб|рахунок/i, 'calm: no score');
  const mt = unescape(h.renderScreen(storeFor({ place: { ...place, exercise: 'route' }, prefs: { syntax: 'routeros' } })));
  assert.match(mt, /role="radio"[^>]*>4 · Із мостом</);
  assert.ok(!mt.includes(routeUi.ciscoNoBridge));
  const mt4 = unescape(h.renderScreen(storeFor({ place: { ...place, exercise: 'route', routeTask: 'vlan.route-4' }, prefs: { syntax: 'routeros' } })));
  assert.ok(mt4.includes(routeUi.ciscoNoBridge), 'only MikroTik\'s task 4 says it (in its aside)');
  // Task 4 asked for in Cisco: task 3 shown (never a Cisco task 4).
  const asked = unescape(h.renderScreen(storeFor({ place: routePlace('vlan.route-4', 3) })));
  assert.match(asked, /aria-checked="true"[^>]*>3 · Керування</);
  // The diagram: the router box and «шлюз …» on every PC.
  const task = create(1, 'cisco', 7);
  const html = unescape(h.renderScreen(storeFor({ place: routePlace('vlan.route-1', 7) })));
  assert.match(html, /class="ng-vl-switch is-router/);
  // Round 5 (R3): each gateway line carries its address as an explicit fact.
  for (const host of task.topology.hosts) assert.ok(html.includes(`class="ng-vl-host-fourth is-gateway" data-hl="address:${host.gateway}">шлюз ${host.gateway}<`), host.device);
  assert.ok(html.includes(routeNotes.routerParent) && html.includes(routeNotes.assumptions) && html.includes(routeUi.taskOne[1]) && !html.includes(routeText[1]), 'the task once, in one sentence (Fable 3)');
  // Round 4 (F5): the header keeps to the tabs (no task-4 line in Cisco), so the diagram fits.
  assert.equal(cisco.split(routeUi.ciscoNoBridge).length - 1, 0);
  // Task 3's givens on screen, not only in «Текстом»; the SVI note only for Cisco's management task.
  const t3 = create(3, 'cisco', 8);
  const html3 = unescape(h.renderScreen(storeFor({ place: routePlace('vlan.route-3', 8) })));
  assert.ok(html3.includes(`class="ng-vl-givens">${routeUi.managementGivens(t3.management)}<`), 'task 3 givens');
  assert.ok(html3.includes(routeNotes.sviActive));
  assert.ok(!html.includes(routeNotes.sviActive), 'not in task 1');
  const ros3 = unescape(h.renderScreen(storeFor({ place: routePlace('vlan.route-3', 8), prefs: { syntax: 'routeros' } })));
  assert.ok(!ros3.includes(routeNotes.sviActive) && ros3.includes('ng-vl-givens'), 'no SVI words for MikroTik');
  // After a behavioural check: the evidence's model note under the walk, the walk's abstraction first, sub-headings; no permanent note.
  const answer = route.initialAnswer(task, 'cisco');
  const checked = route.check(task, answer, { syntax: 'cisco' });
  const after = unescape(h.renderScreen(storeFor({ place: routePlace('vlan.route-1', 7), key: task.instanceKey, view: { forms: { cisco: R.blankRouteForm(task, 'cisco') }, verdict: { syntax: 'cisco', answer: JSON.stringify(answer) } }, result: checked, presses: 1 })));
  assert.ok(!after.includes(`>${routeNotes.assumptions}<`), 'one model note');
  const abstractionAt = after.indexOf(`ng-vl-abstraction">${routeUi.walkAbstraction}<`), subheadAt = after.indexOf('class="ng-vl-subhead">Шлях на рівні VLAN');
  assert.ok(abstractionAt > 0 && subheadAt > abstractionAt, 'the abstraction line before the first sub-heading');
  assert.ok(after.includes(`${routeUi.model}: ${t('links-up-stp-forwarding')}`));
});

/** A half-done wrong answer: one router interface in a VLAN the task doesn't use. */
function wrongAnswer(task, syntax) {
  const form = R.blankRouteForm(task, syntax);
  const net = task.networks[0];
  if (syntax === 'cisco') {
    form.R1.interfaces.r = { up: true };
    form.R1.subifs.push({ parent: 'r', number: 4000, vid: 4000, ip: net.gateway, prefix: 24 });
  } else {
    const on = task.taskNumber === 4 ? 'bridge1' : 'r';
    form.R1.vlanIfs.push({ name: 'x4000', vid: 4000, on });
    form.R1.addresses.push({ ip: net.gateway, prefix: 24, iface: 'x4000' });
  }
  return form;
}
/** The reference's own interface mappings (a label per VLAN) the student's configuration lacks. */
function hiddenMappings(task, syntax, own) {
  const ref = route.compile(task, h.route.solution(task, syntax), { syntax }).topology.attachments;
  const mine = new Set(route.compile(task, own, { syntax }).topology.attachments.map(a => a.label));
  return [...new Set(ref.map(a => a.label))].filter(label => !mine.has(label));
}

for (const [record, syntax] of combos) {
  test(`route leak gate: ${record.id}/${syntax}`, () => {
    const seed = 202;
    const task = route.create(record, { seed, syntax });
    const place = routePlace(record.id, seed);
    const form = wrongAnswer(task, syntax);
    const answer = R.toRouteAnswer(form, syntax);
    const failed = route.check(task, answer, { syntax });
    assert.equal(failed.ok, false);
    const states = [
      ['blank', storeFor({ place, prefs: { syntax } }), route.initialAnswer(task, syntax)],
      ['after a failed check', storeFor({ place, prefs: { syntax }, key: task.instanceKey, view: { forms: { [syntax]: form }, verdict: { syntax, answer: JSON.stringify(answer) } }, result: failed, presses: 1 }), answer],
      ['with every hint open', storeFor({ place, prefs: { syntax }, key: task.instanceKey, view: { forms: { [syntax]: form } }, session: { hintIndex: 3, assisted: true } }), answer],
    ];
    const refLines = [...new Set(Object.values(route.render(h.route.solution(task, syntax), syntax, task.topology)).flatMap(text => text.split('\n')))];
    for (const [name, state, own] of states) {
      const mine = new Set(Object.values(route.render(R.forCommands(route.configuration(task, own, syntax)), syntax, task.topology)).flatMap(text => text.split('\n')));
      const hidden = refLines.filter(line => !mine.has(line));
      assert.ok(hidden.length > 0, `${name}: the reference has lines of its own (control)`);
      const run = counting(() => h.renderScreen(state));
      assert.equal(run.calls(), 0, `${name}: the screen never reads the reference`);
      const html = run.value, text = unescape(html), shown = new Set(commandLines(html));
      for (const line of hidden) {
        assert.ok(!shown.has(line), `${name}: «${line}» shown as a command`);
        assert.ok(!new RegExp(`${line.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w,=.-])`).test(text), `${name}: «${line}» in the markup`);
      }
      for (const label of hiddenMappings(task, syntax, own)) {
        assert.ok(!new RegExp(`(?<![\\w])${label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w.])`).test(text), `${name}: the mapping «${label}» in the markup`);
      }
      assert.doesNotMatch(text, /\[[a-z-]+\]/, `${name}: no placeholder for a missing string`);
      // The router box lists only the student's rows (and task 3's givens).
      const given = route.givens(task, syntax).R1;
      // Repair v1: the compact drawing joins each row's lines into one («… · 172.16.20.1/24»), in the box or on its tray.
      const joined = true;
      const expected = syntax === 'cisco' ? 1 + (joined ? 1 : 2) * (name === 'blank' ? given?.subifs?.length ?? 0 : (given?.subifs?.length ?? 0) + 1)
        : (joined ? 1 : 3) * (name === 'blank' ? given?.vlanIfs?.length ?? 0 : (given?.vlanIfs?.length ?? 0) + 1);
      assert.equal(r1Lines(html).length, expected, `${name}: R1’s lines ${JSON.stringify(r1Lines(html))}`);
    }
    // Positive control: revealed, the reference is there, through useExercise.
    const revealed = storeFor({ place, prefs: { syntax }, key: task.instanceKey, session: { revealed: true, assisted: true, status: 'revealed' } });
    const run = counting(() => h.renderScreen(revealed));
    assert.ok(run.calls() > 0);
    const lines = new Set(commandLines(run.value));
    assert.ok(refLines.every(line => lines.has(line)), 'revealed: every reference line');
  });
}

test('the device whose form is open: a tinted, outlined box with «налаштовуєш» on the diagram; the others plain', () => {
  const html = unescape(h.renderScreen(storeFor({ place: routePlace('vlan.route-1', 7) })));
  const boxes = html.split('<g class="ng-vl-switch').slice(1).map(part => part.slice(0, part.indexOf('</g>', part.indexOf('ng-vl-switch-name'))));
  const r1 = boxes.find(b => />R1</.test(b)), sw1 = boxes.find(b => />SW1</.test(b));
  assert.match(r1, /^ is-router is-active/);
  assert.ok(r1.includes(`class="ng-vl-active-tag ng-vl-sans">${ui.activeTag}<`), 'the tag in words');
  assert.ok(!sw1.includes('is-active') && !sw1.includes(ui.activeTag), 'SW1 plain');
  // The prediction shows a given configuration: «показано», not «налаштовуєш».
  const predictHtml = unescape(h.renderScreen(storeFor({ place: { exercise: 'predict', shape: 'p2', predict: { 'p2|cisco': { seed: 3, level: 0 } } } })));
  assert.ok(predictHtml.includes(`>${ui.shownTag}<`) && !predictHtml.includes(`>${ui.activeTag}<`));
});

// ── Strings and the target ───────────────────────────────────────────────

test('route strings: every screen word is non-empty with its parameters; every code the screen shows has its string; calm', () => {
  const sample = { parent: 'gi0/1', n: 2, port: 'gi0/1', ip: '10.0.0.1', prefix: 24, name: 'vlan10', vid: 10, on: 'ether2', from: 'PC1', to: 'PC3', text: 'x', where: 'SW1', device: 'SW1', network: '10.0.0.0', gateway: '10.0.0.1', admin: 'PC1', router: 'R1' };
  const walk = (value, path) => {
    if (typeof value === 'function') {
      const out = value(sample);
      assert.equal(typeof out, 'string', path);
      assert.ok(out.trim().length > 0 && !/undefined|null|NaN|\[object/.test(out), `${path}: ${out}`);
    } else if (typeof value === 'string') assert.ok(value.trim().length > 0, path);
    else for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
  };
  walk(routeUi, 'routeUi');
  walk(routeNotes, 'routeNotes');
  walk(routeText, 'routeText');
  assert.deepEqual(Object.keys(routeUi.taskShort).sort(), records.map(r => r.id).sort());
  assert.equal(ui.exercises.route, 'Між VLAN');
  const params = { from: 'PC1', to: 'PC3', device: 'R1', port: 'gi0/1', reason: 'ok', syntax: 'cisco', router: 'R1', in: 'R1 gi0/1.10', out: 'R1 gi0/1.20', nextHopIp: '10.0.0.1', host: 'PC1', tagged: true, vid: 10, ports: 'fa0/1', count: 2, prefix: 24, gateway: '10.0.0.1' };
  for (const code of route.codes) assert.ok(Object.hasOwn(copy, code) && t(code, params) !== `[${code}]` && !/undefined/.test(t(code, params)), code);
  for (const words of [routeUi, routeNotes, routeText]) assert.doesNotMatch(JSON.stringify(words), /рахун|бал[іиа]|серія|іспит|екзамен|квиток|клас|урок|✅|🎉/i);
  // The X7 note and X1 note as the spec words them.
  assert.equal(routeNotes.management, 'Переносячи керування: залиш доступ через консоль, налаштуй і перевір увесь новий шлях (транк, VLAN, адресу, шлюз і зворотний шлях), і лише тоді прибирай старий доступ.');
  assert.match(routeNotes.svi, /administratively down — no shutdown/);
});

test('route target: NetGym’s VLAN section gets the route bank as a prop; the screen imports no bank', async () => {
  const { default: netgym } = await import('../.test-bundles/targets/netgym.mjs');
  const vlan = netgym.sections.find(s => s.id === 'vlan');
  assert.deepEqual(vlan.bank.route.map(r => r.id), records.map(r => r.id));
  for (const file of ['RouteView.jsx', 'RouteForm.jsx', 'routeState.js']) {
    const source = readFileSync(new URL(`../src/sections/vlan/screens/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /banks\//, file);
  }
});
