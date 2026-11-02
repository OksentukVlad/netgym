import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { validateBank } from '../src/banks/routing/validate.js';
import { validateNetwork } from '../src/engine/network.js';
import { validateRoute } from '../src/engine/route-validation.js';
import { lookup, ping, routingTable, trace } from '../src/engine/forward.js';
import { coverPrefix, coverSpace, excludePrefixes, unknownSpace } from '../src/engine/coverage.js';
import { toInt, contains } from '../src/engine/ip.js';
import { fieldsToRoute, parseFields, validateFields } from '../src/engine/vendors/fields.js';
import routing, { checkRow, compactRoutes, guidedView, putRoute, slotDestination, presentCheck, describeTrace } from './helpers/routing.mjs';
import { assessObjective, assessUnknownSpace } from '../src/sections/routing/logic/objectives.js';
import { rowReasons, rowVerdict } from '../src/sections/routing/logic/rowReasons.js';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { networkUi, ui } from '../src/sections/routing/uk.js';
import { leaks, normalise } from './helpers/routing-leaks.mjs';
import * as h from '../.test-bundles/harness/polish.mjs';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';

const discard = (dst, prefix, extra = {}) => ({ dst, prefix, discard: true, ...extra });
const setup = (number = 17) => {
  const task = routing.create(structuredClone(tasks[number - 1]));
  return { task, net: task.network, answer: routing.solution(task) };
};
const withoutDiscard = answer => ({ ...answer, 'R-CORE': answer['R-CORE'].filter(r => !r.discard) });
const inetDiscard = answer => ({ ...withoutDiscard(answer), 'R-INET': [...answer['R-INET'], discard('172.16.3.0', 24, { id: 'student-hole' })] });

test('discard lookup: longest prefix wins in both directions; connected wins at equal prefix', () => {
  const { net, answer } = setup(1);
  answer.R1.push(discard('192.168.0.0', 16), discard('192.168.1.0', 24));
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').via, '10.0.0.2', 'longer forward beats discard');
  assert.equal(lookup(net, answer, 'R1', '192.168.1.2').type, 'connected');
  answer.R1.push(discard('192.168.2.0', 25));
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').discard, true, 'longer discard beats forward');
  answer.R1.push(discard('192.168.1.2', 32));
  assert.equal(lookup(net, answer, 'R1', '192.168.1.2').discard, true, 'longer discard beats connected');
});

test('discard lookup: distances, ECMP ambiguity and equivalent duplicates', () => {
  const { net, answer } = setup(1);
  const drop = discard('192.168.2.0', 24, { id: 'drop', distance: 10 });
  answer.R1.push(drop);
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').via, '10.0.0.2');
  answer.R1[0].distance = 20;
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').id, 'drop');
  answer.R1[0].distance = 10;
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').code, 'unsupported-ecmp');
  answer.R1 = [drop, { ...drop, id: 'duplicate' }];
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').code, undefined);
  assert.equal(lookup(net, answer, 'R1', '192.168.2.2').discard, true);
  net.supplied.R1 = [discard('0.0.0.0', 0)];
  answer.R1 = [discard('0.0.0.0', 0)];
  assert.equal(lookup(net, answer, 'R1', '203.0.113.1').code, undefined, 'supplied and answer discards are equivalent too');
});

test('discard rows have no egress and remain up when every attached link is down', () => {
  const { net } = setup(1);
  const options = { downLinks: net.segments.map(s => s.id) };
  const rows = routingTable(net, { R1: [discard('0.0.0.0', 0, { id: 'drop-default' })] }, 'R1', options);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].egressId, rows[0].discard], [null, true]);
  assert.equal(lookup(net, { R1: rows }, 'R1', '203.0.113.9', options).id, 'drop-default');
});

test('discard default drops unmatched traffic while connected and specific routes still work', () => {
  const { net, answer } = setup(1);
  answer.R1.push(discard('0.0.0.0', 0));
  assert.equal(trace(net, answer, 'segment-1.host', '203.0.113.9').stop.code, 'discarded');
  assert.equal(ping(net, answer, 'segment-1.host', 'segment-3.host').ok, true);
  assert.equal(lookup(net, answer, 'R1', '192.168.1.2').type, 'connected');
});

test('discard stops a request on its actual device and route id, and blocks check', () => {
  const { task, net, answer } = setup(1);
  answer.R1 = [discard('192.168.2.0', 24, { id: 'student-discard' })];
  const result = ping(net, answer, 'segment-1.host', 'segment-3.host');
  assert.equal(result.code, 'discarded');
  assert.deepEqual(result.request.stop, { code: 'discarded', deviceId: 'R1', routeId: 'student-discard' });
  assert.equal(result.request.hops.at(-1).routeId, 'student-discard');
  assert.equal(result.reply, null);
  const checked = routing.check(task, answer);
  assert.equal(checked.ok, false);
  assert.equal(checked.code, 'discarded');
  assert.match(presentCheck(task, checked).strip, /Пакет до LAN-B відкинуто на R1 discard-маршрутом/);
});

test('reply discard remains a blocking return-path-failed with its underlying stop', () => {
  const { task, net, answer } = setup(1);
  answer.R2 = [discard('192.168.1.0', 24, { id: 'reply-drop' })];
  const result = ping(net, answer, 'segment-1.host', 'segment-3.host');
  assert.equal(result.request.ok, true);
  assert.equal(result.code, 'return-path-failed');
  assert.deepEqual(result.reply.stop, { code: 'discarded', deviceId: 'R2', routeId: 'reply-drop' });
  const checked = routing.check(task, answer);
  assert.equal(checked.ok, false);
  const view = presentCheck(task, checked);
  assert.equal(view.firstFailure.trace.direction, 'reply');
  assert.match(view.strip, /Пакет до LAN-A відкинуто на R2 discard-маршрутом/);
  assert.ok(describeTrace(result, net).some(s => s.includes('discard-маршрутом')));
});

test('A1 accepts discards; required network and internet coverage report discarded pieces', () => {
  const { task, net, answer } = setup(1);
  answer.R1 = [discard('0.0.0.0', 0)];
  const missing = coverPrefix(net, answer, 'R1', { dst: '192.168.2.0', prefix: 24 });
  assert.deepEqual(missing, [{ code: 'discarded', deviceId: 'R1', size: 256 }]);
  assert.ok(coverSpace(net, answer, 'R1', unknownSpace(net), { internet: true }).some(p => p.code === 'discarded'));
  assert.ok(assessUnknownSpace(net, answer, task.record.scenarios).every(s => s.ok));
  const checked = routing.check(task, answer);
  assert.ok(checked.evidence.objectives.some(o => o.code === 'coverage-missing' && o.params.missing.some(m => m.code === 'discarded')));
  const internet = setup(2);
  internet.answer.R1.push(discard('203.0.113.0', 24));
  const result = routing.check(internet.task, internet.answer);
  assert.ok(result.evidence.probes.every(p => p.ok), 'sample ping still works');
  assert.equal(result.ok, false);
  assert.ok(result.evidence.objectives.some(o => o.code === 'internet-coverage-missing' && o.params.missing.some(m => m.code === 'discarded')));
});

test('exclude subtracts overlapping, nested, duplicate and edge intervals without mutation', () => {
  const input = [[0, 2 ** 32]];
  const exclusions = [{ dst: '0.0.0.0', prefix: 1 }, { dst: '64.0.0.0', prefix: 2 }, { dst: '255.255.255.255', prefix: 32 }];
  assert.deepEqual(excludePrefixes(input, exclusions), [[2 ** 31, 2 ** 32 - 1]]);
  assert.deepEqual(excludePrefixes(input, [{ dst: '0.0.0.0', prefix: 0 }]), []);
  const hole = { dst: '172.16.3.0', prefix: 24 };
  assert.deepEqual(excludePrefixes(input, [hole, hole]), [[0, toInt(hole.dst)], [toInt(hole.dst) + 256, 2 ** 32]]);
  assert.deepEqual(input, [[0, 2 ** 32]]);
});

test('discard with via is invalid in route, table, supplied network, reference bank and check', () => {
  const { task, net, answer } = setup();
  for (const via of ['10.0.0.1', '', undefined]) {
    const bad = discard('172.16.0.0', 22, { via });
    assert.equal(validateRoute(net, 'R-CORE', bad), 'discard-with-gateway');
    assert.deepEqual(routingTable(net, { 'R-CORE': [bad] }, 'R-CORE').filter(r => r.type === 'static'), []);
    const copy = structuredClone(net);
    copy.supplied['R-CORE'] = [bad];
    assert.ok(validateNetwork(copy).some(i => i.code === 'invalid-route'));
    const record = structuredClone(task.record);
    Object.assign(record.variants[0].referenceRoutes['R-CORE'].at(-1), { via });
    assert.ok(validateBank([record]).some(i => i.code === 'invalid-reference-route'));
    const altered = { ...answer, 'R-CORE': [...answer['R-CORE'], bad] };
    assert.equal(routing.check(task, altered).code, 'discard-with-gateway');
  }
});

test('discard supports every prefix 0–32 and only static distances 1–254', () => {
  const { net } = setup(1);
  for (let prefix = 0; prefix <= 32; prefix++) assert.equal(validateRoute(net, 'R1', discard('0.0.0.0', prefix)), null);
  for (const distance of [1, 254]) assert.equal(validateRoute(net, 'R1', discard('0.0.0.0', 0, { distance })), null);
  for (const distance of [0, 255, -1, 1.5, '1']) {
    const row = discard('0.0.0.0', 0, { distance });
    assert.equal(validateRoute(net, 'R1', row), 'invalid-distance');
    assert.equal(lookup(net, { R1: [row] }, 'R1', '203.0.113.1'), null);
  }
  assert.equal(validateRoute(net, 'R1', discard('0.0.0.0', 33)), 'dst-not-network');
  assert.equal(validateRoute(net, 'R1', discard('192.0.2.7', 24)), 'dst-not-network');
});

for (const syntax of syntaxList) test(`${syntax.id}: discard field parsing, render goldens, distances and round trips`, () => {
  const row = discard('172.16.0.0', 22);
  const fields = syntax.fromRoute(row, false);
  assert.deepEqual(fields, syntax.id === 'cisco' ? { net: row.dst, mask: '255.255.252.0', gw: 'Null0', dist: '' } : { dst: '172.16.0.0/22', gw: '', blackhole: true, dist: '' });
  const expected = syntax.id === 'cisco' ? 'ip route 172.16.0.0 255.255.252.0 Null0' : '/ip route add dst-address=172.16.0.0/22 blackhole';
  assert.equal(syntax.command(row), expected);
  assert.equal(syntax.command({ ...row, distance: 254 }), `${expected}${syntax.id === 'cisco' ? ' 254' : ' distance=254'}`);
  for (const parsed of [syntax.toRoute(fields), fieldsToRoute(fields, syntax.id), parseFields(fields, syntax.id).route]) assert.deepEqual(parsed, { ...row, distance: 1 });
  assert.equal(syntax.validateFields(fields), null);
  assert.equal(validateFields(fields, syntax.id), null);
  for (const dist of ['0', '255', '256', '1.5', 'no']) {
    assert.equal(syntax.validateFields({ ...fields, dist }), 'invalid-distance');
    assert.equal(parseFields({ ...fields, dist }, syntax.id).code, 'invalid-distance');
  }
  for (const prefix of [0, 32]) {
    const edge = discard('0.0.0.0', prefix, { distance: 254 });
    assert.deepEqual(syntax.toRoute(syntax.fromRoute(edge, true)), edge);
  }
});

test('Cisco accepts Null0 case-insensitively with one optional space; RouterOS rejects a gateway with blackhole', () => {
  for (const gw of ['Null0', 'null0', 'NULL0', 'null 0', 'NuLl 0']) {
    const fields = { net: '192.0.2.0', mask: '255.255.255.0', gw };
    assert.equal(validateFields(fields, 'cisco'), null);
    assert.equal(parseFields(fields, 'cisco').route.discard, true);
    assert.equal(syntaxes.cisco.command(syntaxes.cisco.toRoute(fields)), 'ip route 192.0.2.0 255.255.255.0 Null0 1');
  }
  const fields = { dst: '192.0.2.0/24', blackhole: true, gw: '203.0.113.1' };
  for (const validation of [validateFields(fields, 'routeros'), syntaxes.routeros.validateFields(fields), parseFields(fields, 'routeros').code]) assert.equal(validation, 'blackhole-with-gateway');
  assert.equal(syntaxes.routeros.toRoute(fields), null);
  assert.equal(fieldsToRoute(fields, 'routeros'), null);
  assert.equal(parseFields({ dst: fields.dst, type: 'blackhole' }, 'routeros').ok, false, 'v6 type=blackhole is not taught');
});

test('task 17 reference passes every probe, objective, A1 and bank validation', () => {
  const { task, answer } = setup();
  assert.equal(tasks.length, 17);
  assert.equal(tasks.flatMap(r => r.variants).length, 19);
  assert.deepEqual(validateBank(tasks), []);
  const result = routing.check(task, answer);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  for (const group of ['probes', 'objectives', 'safety', 'scenarios']) assert.ok(result.evidence[group].every(p => p.ok), group);
  assert.deepEqual(task.variant.objectives.map(o => [o.id, o.severity]).sort(), [['coverage-all', 'blocks'], ['internet-normal', 'blocks'], ['summary-R-INET', 'blocks']]);
});

test('task 17 without discard fails unknown-space-loops while every probe and objective still passes', () => {
  const { task, answer } = setup();
  const result = routing.check(task, withoutDiscard(answer));
  assert.equal(result.code, 'unknown-space-loops');
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.ok(result.evidence.objectives.every(o => o.ok));
  assert.ok(result.evidence.safety.some(o => !o.ok));
  for (const syntax of syntaxList) {
    const hints = routing.hints(task, withoutDiscard(answer), syntax.id);
    assert.match(hints[0].params.text, /R-INET.*R-CORE|R-CORE.*R-INET/);
    assert.match(hints[1].params.text, /discard-маршрут/);
    assert.equal(hints[2].params.kind, 'discard');
    assert.match(hints[2].params.commands[0], syntax.id === 'cisco' ? /Null0/ : /blackhole/);
    assert.deepEqual(leaks(task, hints[2].params.text, 'example'), []);
  }
  task.record.demonstrations = [];
  for (const syntax of syntaxList) assert.notEqual(routing.hints(task, withoutDiscard(answer), syntax.id)[2].params.kind, 'discard');
});

test('task 17 missing LAN2 on R-AGG1 gives a probe hint instead of a discard example', () => {
  const { task, answer } = setup();
  answer['R-AGG1'] = answer['R-AGG1'].filter(r => r.dst !== '172.16.1.0');
  const result = routing.check(task, answer);
  assert.equal(result.ok, false);
  assert.equal(presentCheck(task, result).firstFailure.kind, 'probe');
  for (const syntax of syntaxList) assert.notEqual(routing.hints(task, answer, syntax.id)[2].params.kind, 'discard');
});

test('summary rejects a bare /22 discard on R-INET', () => {
  const { task, answer } = setup();
  const summary = task.variant.objectives.find(o => o.type === 'summary');
  assert.equal(assessObjective(task.network, answer, summary, [], [], []).ok, true);
  answer['R-INET'][0] = discard('172.16.0.0', 22, { id: 'discard-summary' });
  assert.equal(lookup(task.network, answer, 'R-INET', '172.16.0.0').discard, true);
  assert.equal(routing.check(task, answer).evidence.objectives.find(o => o.id === summary.id).ok, false);
});

test('default-on rejects a /0 discard in 3b even when two /1 routes carry every ping', () => {
  const task = routing.create(structuredClone(tasks[2]), { variantId: 'defaults' });
  const answer = routing.solution(task), forward = answer.R1[0];
  answer.R1 = [discard('0.0.0.0', 0, { id: 'discard-default' }),
    { ...forward, id: 'lower-half', dst: '0.0.0.0', prefix: 1 },
    { ...forward, id: 'upper-half', dst: '128.0.0.0', prefix: 1 }];
  const result = routing.check(task, answer);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.ok(result.evidence.safety.every(s => s.ok));
  assert.equal(result.evidence.objectives.find(o => o.id === 'default-on-R1').ok, false);
  assert.equal(result.ok, false);
  answer.R1[0] = forward;
  assert.equal(routing.check(task, answer).ok, true);
});

test('specific-to rejects a discard selected for the required destination', () => {
  const { task, net, answer } = setup(1);
  const objective = { id: 'required-specific', type: 'specific-to', routerId: 'R1', severity: 'blocks',
    destinations: [{ dst: '192.168.2.0', prefix: 24 }] };
  assert.equal(assessObjective(net, answer, objective, [], [], []).ok, true);
  answer.R1 = [discard('192.168.2.0', 24, { id: 'discard-specific' })];
  assert.equal(lookup(net, answer, 'R1', '192.168.2.0').discard, true);
  assert.equal(assessObjective(net, answer, objective, [], [], []).ok, false);
});

test('task 17 accepts a hole /24 discard on R-INET and rejects an equal-preference /22 discard there', () => {
  const { task, net, answer } = setup();
  const alternative = inetDiscard(answer);
  assert.equal(routing.check(task, alternative).ok, true);
  alternative['R-INET'].at(-1).dst = '172.16.0.0';
  alternative['R-INET'].at(-1).prefix = 22;
  assert.equal(lookup(net, alternative, 'R-INET', '172.16.3.10').code, 'unsupported-ecmp');
  assert.ok(routing.check(task, alternative).findings.some(f => f.code === 'unsupported-ecmp'));
});

test('task 17 cannot discard a real LAN even if the sample internet ping still works', () => {
  const { task, answer } = setup();
  answer['R-CORE'] = answer['R-CORE'].filter(r => r.dst !== '172.16.2.0');
  answer['R-CORE'].push(discard('172.16.2.0', 24, { id: 'bad-lan-drop' }));
  const result = routing.check(task, answer);
  assert.equal(result.ok, false);
  assert.ok(result.evidence.probes.some(p => p.code === 'discarded' && p.request.stop.routeId === 'bad-lan-drop'));
  assert.ok(result.evidence.objectives.some(o => o.code === 'coverage-missing' && o.params.missing.some(m => m.code === 'discarded')));
});

test('task 17 discarded LAN3 gives a failure hint instead of a discard example', () => {
  const { task, answer } = setup();
  answer['R-CORE'] = answer['R-CORE'].filter(r => r.dst !== '172.16.2.0');
  answer['R-CORE'].push(discard('172.16.2.0', 24, { id: 'bad-lan-drop' }));
  assert.equal(presentCheck(task, routing.check(task, answer)).firstFailure.code, 'discarded');
  for (const syntax of syntaxList) assert.notEqual(routing.hints(task, answer, syntax.id)[2].params.kind, 'discard');
});

test('task 17 v2.1 exemption allows a hole-specific route to ISP, with no no-escape objective', () => {
  const { task, net, answer } = setup();
  const alternative = withoutDiscard(answer);
  alternative['R-INET'].push({ id: 'student-escape', dst: '172.16.3.0', prefix: 24, via: net.supplied['R-INET'][0].via });
  const result = routing.check(task, alternative);
  assert.equal(result.ok, true);
  assert.ok(result.evidence.safety.every(s => s.ok));
  assert.ok(result.evidence.objectives.find(o => o.id === 'internet-normal').ok);
  // Without the exemption the reference's intentional discard is missing internet coverage.
  const objective = { ...task.variant.objectives.find(o => o.id === 'internet-normal'), exclude: [] };
  const reference = routing.check(task, answer);
  const assessed = assessObjective(net, answer, objective, reference.evidence.probes, task.record.probes, task.record.scenarios);
  assert.equal(assessed.code, 'internet-coverage-missing');
  assert.ok(assessed.params.missing.some(m => m.code === 'discarded'));
});

test('task 17 summary-hole demonstration stopping at ISP uses neutral v2.1 wording', () => {
  const { task, net, answer } = setup();
  const alternative = withoutDiscard(answer);
  alternative['R-INET'].push({ id: 'student-escape', dst: '172.16.3.0', prefix: 24, via: net.supplied['R-INET'][0].via });
  const result = routing.check(task, alternative);
  assert.equal(result.ok, true);
  for (const syntax of syntaxList) {
    const demo = presentCheck(task, result, syntax.id).demonstrations[0];
    assert.equal(demo.trace.request.stop.deviceId, 'ISP');
    assert.equal(demo.code, 'no-route');
    assert.equal(demo.text, 'Пакет до вільної частини блоку вийшов до ISP: петлі немає, але власні адреси краще відкидати в себе.');
    assert.deepEqual(leaks(task, demo.text, 'demonstration'), []);
  }
});

test('task 17 LAN3 /24 is consistent everywhere, has a real /24 hole, uses safe addresses and address-free text', () => {
  const { task, net } = setup();
  const original = tasks[15];
  assert.equal(original.network.devices.find(d => d.id === 'R-ACC3').interfaces[1].address.prefix, 23, 'task 16 unchanged');
  assert.equal(net.devices.find(d => d.id === 'R-ACC3').interfaces[1].address.prefix, 24);
  assert.deepEqual(net.endpoints, original.network.endpoints, 'host and gateway remain valid in /24');
  for (const probe of task.record.probes) for (const prefix of Object.values(probe.coverage).filter(Boolean)) if (prefix.dst === '172.16.2.0') assert.equal(prefix.prefix, 24);
  for (const rows of Object.values(task.variant.referenceRoutes)) for (const route of rows) if (route.dst === '172.16.2.0') assert.equal(route.prefix, 24);
  assert.equal(task.variant.objectives.at(-1).destinations.at(-1).prefix, 24);
  assert.ok(unknownSpace(net).some(([a, b]) => a <= toInt('172.16.3.0') && b >= toInt('172.16.4.0')));
  assert.doesNotMatch(JSON.stringify(task.record), /172\.16\.2\.0\/23|"prefix":23/);
  for (const syntax of syntaxList) {
    assert.match(task.record.topology[syntax.id], /LAN3 172\.16\.2\.0\/24/);
    assert.doesNotMatch(task.variant.text[syntax.id], /\d+\.\d+\.\d+\.\d+/);
  }
  const allowed = [['10.0.0.0', 8], ['172.16.0.0', 12], ['198.18.0.0', 15]];
  for (const ip of JSON.stringify(task.record).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) if (ip !== '0.0.0.0') assert.ok(allowed.some(([dst, p]) => contains(dst, p, ip)), ip);
});

test('task 17 demo names the actual discard router for both student placements and contains no reference addresses', () => {
  const { task, answer } = setup();
  for (const [routes, router] of [[answer, 'R-CORE'], [inetDiscard(answer), 'R-INET']]) for (const syntax of syntaxList) {
    const result = routing.check(task, routes);
    const demo = presentCheck(task, result, syntax.id).demonstrations[0];
    assert.equal(demo.code, 'discarded');
    assert.equal(demo.text, `${router} відкидає пакет до вільної частини блоку — так і має бути`);
    assert.equal(demo.trace.request.stop.deviceId, router);
    assert.deepEqual(leaks(task, demo.text, 'demonstration'), []);
    assert.deepEqual(leaks(task, h.renderStrip(presentCheck(task, result), false, { kind: 'demo', ...demo }), 'strip'), []);
  }
});

test('hints retain discard rows: task 17 reference has no loop evidence and examples use only documentation addresses', () => {
  const { task, answer } = setup();
  for (const syntax of syntaxList) {
    const hints = routing.hints(task, answer, syntax.id);
    assert.equal(hints[0].params.text, networkUi.success);
    assert.equal(hints[1].params.text, networkUi.hintsReady);
    assert.deepEqual(leaks(task, hints[0].params.text, 'hint-question'), []);
    assert.deepEqual(leaks(task, hints[1].params.text, 'hint-evidence'), []);
    assert.deepEqual(leaks(task, hints[2].params.text, 'example'), []);
  }
  assert.deepEqual(leaks(task, surfaces.renderLeakFixture('rules', ui.shared.rulesDiscardSummary), 'rules'), []);
});

test('guided discard metadata computes /22 and matches only the same destination and action, including bound routes', () => {
  const { task, answer } = setup();
  const row = task.variant.scaffold['R-CORE'].at(-1), index = task.variant.scaffold['R-CORE'].length - 1;
  const drop = answer['R-CORE'].at(-1);
  assert.deepEqual(slotDestination(task, row), { dst: '172.16.0.0', prefix: 22 });
  for (const syntax of syntaxList) assert.equal(routing.scaffold(task, syntax.id)['R-CORE'][index].discard, true);
  const forwarding = { id: 'forward', dst: drop.dst, prefix: drop.prefix, via: '10.0.0.1' };
  assert.equal(guidedView(task, { 'R-CORE': [forwarding, drop] })['R-CORE'].slots[index].route, drop);
  assert.ok(guidedView(task, { 'R-CORE': [forwarding] })['R-CORE'].extras.includes(forwarding));
  const bound = { ...forwarding, slot: `R-CORE.row${index + 1}` };
  assert.equal(guidedView(task, { 'R-CORE': [bound] })['R-CORE'].slots[index].route, null);
  const wrongDestination = { ...drop, dst: '172.16.3.0', prefix: 24, slot: `R-CORE.row${index + 1}` };
  assert.equal(guidedView(task, { 'R-CORE': [wrongDestination] })['R-CORE'].slots[index].route, null);
  const inetDrop = discard('172.16.0.0', 22, { id: 'unbound' });
  assert.equal(guidedView(task, { 'R-INET': [inetDrop] })['R-INET'].slots[0].route, null);
  const canonical = putRoute(task, {}, 'R-CORE', { ...drop, id: 'drop-id' }, { slot: `R-CORE.row${index + 1}` });
  const edited = putRoute(task, canonical, 'R-CORE', { ...forwarding, id: 'drop-id' });
  assert.equal(edited['R-CORE'][0].slot, undefined, 'free-mode action edit drops stale binding');
  assert.equal(compactRoutes({ 'R-CORE': [null, drop] })['R-CORE'][0], drop);
});

test('discard row checking and reasons stay code-only and reject a forwarding route in the discard slot', () => {
  const { task } = setup();
  const index = task.variant.referenceRoutes['R-CORE'].length - 1;
  for (const syntax of syntaxList) {
    const fields = syntax.fromRoute(task.variant.referenceRoutes['R-CORE'][index]);
    assert.equal(checkRow(task, 'R-CORE', index, fields, syntax.id).ok, true);
    const wrong = syntax.id === 'cisco' ? { ...fields, gw: '10.0.0.1' } : { ...fields, blackhole: false, gw: '10.0.0.1' };
    const verdict = rowVerdict(checkRow(task, 'R-CORE', index, wrong, syntax.id));
    assert.equal(verdict.gwOk, false);
    const reasons = rowReasons(task, 'R-CORE', index, wrong, syntax.id, verdict);
    assert.equal(reasons.gw, 'discard-mismatch');
    assert.deepEqual(leaks(task, normalise(surfaces.renderFeedback(syntax, { ok: false, detail: verdict, reasons }, 'R-CORE', index).visible), 'feedback'), []);
  }
});

test('bank validators reject malformed discard metadata and internet exemptions', () => {
  const { task } = setup();
  for (const exclude of [null, {}, [{ dst: '172.16.0.1', prefix: 22 }], [{ dst: '172.16.0.0', prefix: 33 }]]) {
    const record = structuredClone(task.record);
    record.variants[0].objectives.find(o => o.type === 'internet-coverage').exclude = exclude;
    assert.ok(validateBank([record]).some(i => i.code === 'invalid-objective-exclude'));
  }
  const record = structuredClone(task.record);
  record.variants[0].scaffold['R-CORE'].at(-1).discard = 'true';
  assert.ok(validateBank([record]).some(i => i.code === 'invalid-row-discard'));
});

test('bank validator rejects a discard scaffold row without a matching reference action at that index', () => {
  const { task } = setup();
  const record = structuredClone(task.record);
  // A discard exists on this same router, but at another index.
  record.variants[0].scaffold['R-CORE'][0].discard = true;
  assert.ok(validateBank([record]).some(i => i.code === 'scaffold-discard-mismatch' && i.entity === 'R-CORE/0'));
});

test('bank validator rejects a reference discard without a matching scaffold action at that index', () => {
  const { task } = setup();
  for (const action of [undefined, false, 'missing-row', 'missing-router']) {
    const record = structuredClone(task.record), scaffold = record.variants[0].scaffold;
    const index = scaffold['R-CORE'].length - 1;
    if (action === 'missing-row') scaffold['R-CORE'].pop();
    else if (action === 'missing-router') delete scaffold['R-CORE'];
    else scaffold['R-CORE'][index].discard = action;
    assert.ok(validateBank([record]).some(i => i.code === 'scaffold-discard-mismatch' && i.entity === `R-CORE/${index}`), String(action));
  }
});

test('bank validator (polish-2 V5): a reference discard implies a scaffold discard, so the screens can read the scaffold alone', () => {
  // The bank as it is: every variant with a reference discard flags its scaffold row.
  for (const record of tasks) for (const variant of record.variants) {
    if (Object.values(variant.referenceRoutes).flat().some(r => r.discard === true)) {
      assert.ok(Object.values(variant.scaffold).flat().some(r => r.discard === true), variant.code);
    }
  }
  // A discard added to another task's reference without its scaffold row is
  // refused; flagging the scaffold row too satisfies the invariant.
  const record = structuredClone(tasks[2]);
  const { via, ...route } = record.variants[0].referenceRoutes.R1[0];
  record.variants[0].referenceRoutes.R1[0] = { ...route, discard: true };
  assert.ok(via && validateBank([record]).some(i => i.code === 'scaffold-discard-mismatch' && i.entity === 'R1/0'));
  record.variants[0].scaffold.R1[0].discard = true;
  assert.ok(!validateBank([record]).some(i => i.code === 'scaffold-discard-mismatch'));
});

function probe(store, record, syntax, mode = 'guided') {
  let api;
  store.render(h.RoutingProbe, { record, syntax, mode, expose: value => { api = value; } });
  return api;
}

test('live conversion preserves discard in canonical drafts in both directions without attempts or verdicts', () => {
  const record = tasks[16];
  for (const from of syntaxList) for (const mode of ['guided', 'free']) {
    const store = h.testStore();
    let api = probe(store, record, from.id, mode);
    if (mode === 'free') api.answers.addRoute('R-CORE');
    const pick = a => mode === 'free' ? a.freeItems('R-CORE')[0] : a.slotItem('R-CORE', 7);
    api = probe(store, record, from.id, mode);
    const fields = from.fromRoute(discard('192.0.2.0', 24));
    for (const [name, value] of Object.entries(fields)) {
      api.answers.edit(pick(api.answers), name, value);
      api = probe(store, record, from.id, mode);
    }
    const before = store.state.instances[api.ex.key];
    const to = syntaxList.find(s => s.id !== from.id);
    const converted = probe(store, record, to.id, mode);
    assert.deepEqual(converted.answers.valuesOf(pick(converted.answers)), to.fromRoute(discard('192.0.2.0', 24, { distance: 1 })));
    assert.deepEqual(converted.answers.currentAnswer()['R-CORE'][0], discard('192.0.2.0', 24, { distance: 1, id: pick(converted.answers).key }));
    assert.equal(store.state.instances[api.ex.key], before);
    assert.deepEqual([before.presses, before.session.attempts, before.session.earned.solved], [0, 0, false]);
    assert.equal(converted.answers.resultOf(pick(converted.answers)), null);
  }
});

test('live conversion can network-check discards in both syntaxes and keeps ordinary routes distinct', () => {
  const record = tasks[16];
  for (const from of syntaxList) {
    const store = h.testStore();
    let api = probe(store, record, from.id);
    const answer = routing.solution(api.ex.task);
    api.ex.act({ type: 'checked', answer, result: routing.check(api.ex.task, answer) });
    api = probe(store, record, from.id);
    api.answers.edit('R-CORE', 7, from.id === 'cisco' ? 'gw' : 'blackhole', from.id === 'cisco' ? 'null 0' : true);
    const to = syntaxList.find(s => s.id !== from.id);
    const other = probe(store, record, to.id);
    const checked = other.answers.checkNetwork();
    assert.equal(checked.result.ok, true);
    assert.equal(checked.answer['R-CORE'].at(-1).discard, true);
    assert.ok(!('via' in checked.answer['R-CORE'].at(-1)));
  }
});

test('discard leak gate recognises hidden commands and only accepts conversions of the actual student answer', () => {
  const { task, answer } = setup();
  const alternative = inetDiscard(answer);
  for (const syntax of syntaxList) {
    const referenceCommand = syntax.command(answer['R-CORE'].at(-1));
    assert.ok(leaks(task, surfaces.renderLeakFixture('text', referenceCommand), 'text').includes('reference-command'));
    const commands = surfaces.otherSyntaxBlocks(alternative, syntax).flatMap(b => b.lines).join('\n');
    const submitted = Object.fromEntries(Object.entries(alternative).map(([r, rows]) => [r, rows.map(({ dst, prefix, via, discard, distance }) => ({ dst, prefix, ...(discard ? { discard: true } : { via }), ...(distance > 1 ? { distance } : {}) }))]));
    assert.deepEqual(leaks(task, commands, 'submitted', { answer: submitted, syntax: syntax.id }), []);
    assert.ok(leaks(task, `${commands}\n${referenceCommand}`, 'submitted', { answer: alternative, syntax: syntax.id }).includes('unproven-submission'));
    const result = routing.check(task, alternative);
    const demo = presentCheck(task, result, syntax.id).demonstrations[0];
    const html = h.renderStrip(presentCheck(task, result, syntax.id), false, { kind: 'demo', ...demo });
    assert.ok(normalise(html).includes('R-INET відкидає пакет'));
    assert.deepEqual(leaks(task, html, 'strip'), []);
    assert.deepEqual(leaks(task, routing.scaffold(task, syntax.id)['R-CORE'].at(-1).label, 'text'), []);
  }
});

test('blackhole edits keep booleans, clear the gateway atomically, and false alone is an empty draft', () => {
  const record = tasks[16], store = h.testStore();
  let api = probe(store, record, 'routeros');
  api.ex.act({ type: 'draft', mode: 'guided', syntax: 'routeros', routeId: 'R-CORE.row8', value: { dst: '172.16.0.0/22', gw: '10.0.0.1' } });
  api = probe(store, record, 'routeros');
  api.answers.edit('R-CORE', 7, 'blackhole', true);
  api = probe(store, record, 'routeros');
  assert.deepEqual(api.answers.valuesOf('R-CORE', 7), { dst: '172.16.0.0/22', gw: '', blackhole: true });
  assert.equal(api.answers.check('R-CORE', 7).ok, true);
  api = probe(store, record, 'routeros');
  assert.equal(api.answers.slotItem('R-CORE', 7).route.discard, true);
  assert.equal(api.answers.resultOf('R-CORE', 7).ok, true);
  const empty = h.testStore();
  api = probe(empty, record, 'routeros');
  api.answers.edit('R-CORE', 7, 'blackhole', false);
  api = probe(empty, record, 'routeros');
  assert.equal(api.answers.valuesOf('R-CORE', 7).blackhole, false);
  assert.ok(!api.answers.checkNetwork().result.formErrors, 'unchecked false alone does not make an unfinished row');
});
