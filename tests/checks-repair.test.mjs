// Regression fixtures for Astra's logic review of «Перевірка мережі»
// (round 7, logic-astra-1): hand-written expectations, not snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, probe } from '../src/sections/checks/logic/probes.js';
import * as out from '../src/sections/checks/logic/outputs.js';
import * as ladder from '../src/sections/checks/logic/ladder.js';
import * as claims from '../src/sections/checks/logic/claims.js';
import * as proofs from '../src/sections/checks/logic/proofs.js';
import { routingExample } from '../src/sections/routing/logic/examples.js';

const vendors = ['cisco', 'routeros'];
const L2 = (faultId, vendor = 'cisco', seed = 3) => ladder.createLadder(2, vendor, seed, { faultId });
const run = (task, ids) => ids.reduce((rows, [id, arg]) => [...rows, ladder.runRung(task, id, arg, rows)], []);
const fits = output => output.lines.length <= 10 && output.lines.every(l => [...l.text].length <= 40);

test('M1: the same observation grades the same, whichever rung produced it', () => {
  for (const vendor of vendors) {
    const task = L2('nat', vendor);
    const viaRemote = ladder.runRung(task, 'remote');
    const viaGateway = ladder.runRung(task, 'gateway', '8.8.8.8');
    assert.equal(viaGateway.output.text, viaRemote.output.text);
    assert.deepEqual(ladder.acceptedPlaces([viaGateway]), ladder.acceptedPlaces([viaRemote]));
    assert.ok(ladder.acceptedPlaces([viaGateway]).includes('exit'));
    // The PC's own gateway typed into the «remote» rung is a gateway check.
    const broken = L2('static-gateway', vendor);
    const gw = ladder.runRung(broken, 'remote', ladder.rungs(broken).find(r => r.id === 'gateway').target);
    assert.equal(gw.expected, false);
    assert.ok(!ladder.acceptedPlaces([gw]).includes('exit'));
    assert.ok(ladder.acceptedPlaces([gw]).includes('gateway'));
  }
});

test('M1: router tables are graded: a missing default route is unexpected, and stopping there passes', () => {
  for (const vendor of vendors) {
    const task = L2('route', vendor), routes = ladder.runRung(task, 'routes');
    assert.equal(routes.expected, false);
    const grade = ladder.gradeStop(task, [routes], 'exit');
    assert.equal(grade.ok, true); assert.equal(grade.stoppedAtEarliest, true);
    assert.equal(ladder.runRung(L2('healthy', vendor), 'routes').expected, true);
    // An empty NAT table proves little before traffic; after the LAN answered
    // and the PC sent traffic out, it is unexpected.
    const nat = L2('nat', vendor);
    assert.equal(ladder.runRung(nat, 'nat', undefined, []).expected, true);
    const rows = run(nat, [['gateway'], ['remote'], ['nat']]);
    assert.equal(rows[2].expected, false);
    assert.deepEqual(ladder.acceptedPlaces(rows), ['exit']);
  }
});

test('M2: a healthy L2 network can be confirmed with «усе працює», but only after every requirement is checked', () => {
  for (const vendor of vendors) {
    const task = L2('healthy', vendor), r = ladder.requirements(task);
    assert.deepEqual(r.checks, ['remote', 'http', 'ssh']);
    const some = run(task, [['remote'], ['http']]);
    const partial = ladder.gradeHealthy(task, some);
    assert.equal(partial.ok, false); assert.deepEqual(partial.missing, ['ssh']);
    assert.match(partial.text, new RegExp(`SSH на ${r.gateway.replaceAll('.', '\\.')}`));
    const all = run(task, [['remote'], ['http'], ['ssh']]);
    assert.equal(ladder.gradeHealthy(task, all).ok, true);
    assert.equal(ladder.gradeStop(task, all, 'more').ok, false, 'nothing unexpected to stop at');
    // A fault the checks reveal blocks the completion and is named.
    const denied = L2('ssh-denied', vendor), rows = run(denied, [['remote'], ['http'], ['ssh']]);
    const grade = ladder.gradeHealthy(denied, rows);
    assert.equal(grade.ok, false); assert.equal(grade.earliest.id, 'ssh');
  }
  // L1 always has a planted fault: no completion there.
  const l1 = ladder.createLadder(1, 'cisco', 0, { faultId: 'dns' });
  assert.equal(ladder.gradeHealthy(l1, ladder.fixedRungs.map(id => ladder.runRung(l1, id))).ok, false);
  // The routing topologies require their remote address only.
  const ex = routingExample();
  const routed = ladder.createLadder(2, 'cisco', 0, { routing: { record: ex.task.record, routes: ex.answer, pcId: 'pc1', destination: '198.51.100.66' } });
  assert.deepEqual(ladder.requirements(routed).checks, ['remote']);
  assert.equal(ladder.gradeHealthy(routed, run(routed, [['remote']])).ok, true);
});

test('M3: the comparison evidence is shown, and grading uses exactly what is shown', () => {
  for (const vendor of vendors) {
    const task = L2('wrong-answer', vendor), r = ladder.requirements(task), lines = ladder.requirementLines(task);
    assert.ok(lines.some(l => l.includes(`${r.network}/${r.prefix}`) && l.includes(r.gateway)));
    assert.ok(lines.some(l => l.includes(r.record.name) && l.includes(r.record.address)));
    const dns = ladder.runRung(task, 'dns');
    assert.equal(dns.expected, false);
    assert.ok(!dns.output.text.includes(r.record.address), 'the answer differs from the shown record');
    // A name with no trusted record: any answer (NXDOMAIN too) is expected.
    assert.equal(ladder.runRung(task, 'dns', 'missing.example.com').expected, true);
    // The DHCP gateway fault: ipconfig's gateway differs from the shown one.
    const gw = ladder.createLadder(1, vendor, 4, { faultId: 'gateway' }), config = ladder.runRung(gw, 'config');
    assert.equal(config.expected, false);
    assert.ok(!config.output.lines.find(l => l.key === 'gateway').text.endsWith(ladder.requirements(gw).gateway));
    assert.deepEqual(ladder.acceptedPlaces([config]), ['gateway']);
  }
});

test('M4: NAT displays: RouterOS 7.16 address:port tuples, ICMP identifiers, Cisco ID in all four columns', () => {
  const tcp = { protocol: 'tcp', inside: { address: '192.0.2.50', port: 51000 }, outside: { address: '198.51.100.2', port: 51000 }, remote: { address: '198.51.100.80', port: 80 } };
  assert.deepEqual(out.nat([tcp], 'routeros').lines.map(l => l.text), [
    'Flags: s - srcnat', '0 s protocol=tcp', 'src-address=192.0.2.50:51000', 'dst-address=198.51.100.80:80',
    'reply-src-address=198.51.100.80:80', 'reply-dst-address=198.51.100.2:51000',
  ]);
  const icmp = { protocol: 'icmp', inside: { address: '192.0.2.50', port: 7 }, outside: { address: '198.51.100.2', port: 7 }, remote: { address: '198.51.100.80', port: 7 } };
  assert.deepEqual(out.nat([icmp], 'routeros').lines.map(l => l.text), [
    'Flags: s - srcnat', '0 s protocol=icmp', 'src-address=192.0.2.50', 'dst-address=198.51.100.80',
    'reply-src-address=198.51.100.80', 'reply-dst-address=198.51.100.2', 'icmp-id=7',
  ]);
  assert.deepEqual(out.nat([icmp], 'cisco').lines.map(l => l.text), [
    'Pro Inside global / Inside local', 'icmp 198.51.100.2:7', '    192.0.2.50:7',
    'Outside local / Outside global', '198.51.100.80:7', '198.51.100.80:7',
  ]);
  // The probe itself keeps one identifier across the four addresses.
  for (const vendor of vendors) {
    const [entry] = probe(createScenario(7, { level: 2, vendor, faultId: 'healthy' })).natState;
    assert.equal(entry.protocol, 'icmp');
    assert.deepEqual(new Set([entry.inside.port, entry.outside.port, entry.remote.port]).size, 1);
    assert.notEqual(entry.remote.port, 0);
  }
});

test('M5: every NAT entry the checks created is kept: tracert slots, and DNS from named ping and SSH', () => {
  for (const vendor of vendors) {
    const task = L2('healthy', vendor), r = ladder.requirements(task);
    const [trace, nat] = run(task, [['trace'], ['nat']]);
    assert.equal(trace.result.ok, true);
    assert.ok(nat.result.entries.some(e => e.protocol === 'icmp' && e.remote.address === r.remote));
    for (const id of ['remote', 'ssh', 'trace']) {
      const rows = run(task, [[id, r.record.name], ['nat']]);
      assert.ok(rows[1].result.entries.some(e => e.protocol === 'udp' && e.remote.port === 53), `${id} by name`);
    }
  }
});

test('M6: the two claims are asked directly, and stay «недостатньо даних»', () => {
  for (const vendor of vendors) {
    const dns = claims.createClaim(1, vendor, 2, { templateId: 'dns-from-ping', outcome: 'reply' });
    assert.equal(dns.claim, 'DNS працює.'); assert.equal(dns.verdict, 'insufficient');
    const lease = claims.createClaim(2, vendor, 2, { templateId: 'binding-options' });
    assert.equal(lease.claim, 'ПК зараз використовує правильні шлюз і DNS.'); assert.equal(lease.verdict, 'insufficient');
  }
});

test('Fable 1–2: «потрібно більше даних» only while the evidence leaves a choice; a wrong stop is about the stop', () => {
  for (const vendor of vendors) {
    const link = ladder.createLadder(1, vendor, 0, { faultId: 'link' }), config = [ladder.runRung(link, 'config')];
    assert.deepEqual(ladder.acceptedPlaces(config), ['link']);
    const more = ladder.gradeStop(link, config, 'more');
    assert.equal(more.ok, false); assert.equal(more.stoppedAtEarliest, true);
    assert.match(more.text, /вже вказують на одне місце: кабель \/ адаптер/);
    assert.equal(ladder.gradeStop(link, config, 'link').ok, true);
    // Two consistent places: «потрібно більше даних» is a fair answer.
    const dns = ladder.createLadder(1, vendor, 0, { faultId: 'dns', example: true }), rows = ladder.fixedRungs.map(id => ladder.runRung(dns, id));
    assert.equal(ladder.gradeStop(dns, rows, 'more').ok, true);
    // A stop on an expected rung: the verdict names the stop only, no place sentence.
    const early = ladder.gradeStop(dns, rows.slice(0, 1), 'more');
    assert.equal(early.stoppedAtEarliest, false);
    assert.ok(!/узгоджується|додаткові свідчення|не вказують/.test(early.text), early.text);
    assert.match(early.text, /Стоп був на іншій перевірці/);
  }
});

test('Fable 4: C3 options are one place, one command, one short result, each requirement with a same-command wrong result', () => {
  for (const vendor of vendors) for (const task of proofs.proofSet(23, { vendor })) {
    const right = task.options.find(o => o.id === task.correctOptionId);
    assert.ok(task.options.some(o => o !== right && o.command === right.command && o.expected !== right.expected), `${vendor}/${task.requirementId}`);
    for (const o of task.options) assert.ok([...o.expected].length <= 48, o.label);
    if (task.requirementId === 'address') assert.match(right.label, /^на ПК: ipconfig \/all → /);
    if (task.requirementId === 'login') {
      const old = task.options.find(o => o.id === 'old-session');
      assert.ok(!old.command.includes(right.command.split('@')[0].slice(4)), 'the new account differs from the old session\'s');
    }
  }
});

test('C3: the right option\'s position varies across a round (each requirement shuffles on its own)', () => {
  let varied = 0;
  for (let seed = 0; seed < 20; seed++) {
    const at = proofs.proofSet(seed).map(t => t.options.findIndex(o => o.id === t.correctOptionId));
    if (new Set(at).size > 1) varied++;
  }
  assert.ok(varied >= 18, `${varied} of 20 rounds`);
});

test('M7: a long valid hostname never throws; 63 characters fit every output', () => {
  const long = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  assert.equal(long.length, 253);
  assert.equal(ladder.parseArgument(long).code, 'argument-length');
  const fit = `${'a'.repeat(51)}.example.com`;
  assert.equal(fit.length, ladder.maxName);
  for (const vendor of vendors) for (const faultId of ['healthy', 'nxdomain', 'dns']) {
    const task = L2(faultId, vendor);
    for (const rung of ladder.rungs(task).filter(r => r.argument)) {
      const bad = ladder.runRung(task, rung.id, long);
      assert.equal(bad.ok, false); assert.equal(bad.code, 'argument-length');
      const good = ladder.runRung(task, rung.id, fit);
      assert.equal(good.ok, true, `${rung.id}`); assert.ok(fits(good.output), good.output.text);
    }
  }
});
