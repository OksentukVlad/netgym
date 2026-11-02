import test from 'node:test';
import assert from 'node:assert/strict';
import * as route from '../src/sections/vlan/logic/route.js';
import { records, availableRecords } from '../src/banks/vlan/route.js';
import { validateRouteRecord, validateRouteInstance, validateBank } from '../src/banks/vlan/validate.js';
import { records as portsRecords } from '../src/banks/vlan/ports.js';
import { record as predictRecord } from '../src/banks/vlan/predict.js';
import { copy, t, routeNotes, routeText } from '../src/sections/vlan/uk.js';
import { compileL3 } from '../src/engine/l3-config.js';
import { factMap, numberConvention } from './fixtures/vlan2/handwritten.mjs';

const task = (n = 2, syntax = 'cisco', seed = 17) => route.create(records[n - 1], { syntax, seed });
for (const record of records) for (const syntax of record.variants[0].syntaxes) test(`VLAN2 reference: ${record.id}/${syntax}`, () => {
  const a = route.create(record, { syntax, seed: 'vlan2' }), answer = route.solution(a), before = structuredClone({ a, answer });
  const checked = route.check(a, answer);
  assert.equal(checked.ok, true); assert.equal(checked.complete, true); assert.deepEqual(checked.findings, []);
  assert.deepEqual(validateRouteRecord(record), []); assert.deepEqual(validateRouteInstance(a, answer), []);
  assert.equal(checked.evidence.probes.filter(p => p.kind === 'gateway').length, a.topology.hosts.length + (a.management ? 1 : 0));
  assert.equal(checked.evidence.probes.filter(p => p.kind === 'pc-pair').length, a.topology.hosts.length * (a.topology.hosts.length - 1) / 2);
  assert.deepEqual({ a, answer }, before);
});

test('X6 identity and topology are syntax-neutral; per-syntax drafts are fresh and router rows start blank', () => {
  const a = task(1), b = task(1, 'routeros');
  assert.equal(a.instanceKey, b.instanceKey); assert.deepEqual(a.topology, b.topology);
  assert.deepEqual(route.initialAnswer(a).R1.subifs, []);
  assert.deepEqual(route.initialAnswer(b).R1, { vlanIfs: [], addresses: [] });
  assert.equal(route.initialAnswer(a).R1.interfaces.r.up, false);
  const d = route.initialAnswer(b); d.R1.vlanIfs.push({}); assert.deepEqual(route.initialAnswer(b).R1.vlanIfs, []);
  assert.equal(route.check(a, route.solution(b), { syntax: 'routeros' }).ok, true);
});
test('X6 task 3 exposes A/B routing, access ports and management givens; management answer is blank', () => {
  for (const syntax of ['cisco', 'routeros']) {
    const a = task(3, syntax), d = route.initialAnswer(a), g = route.givens(a, syntax), m = a.management;
    assert.ok(Object.keys(g.SW1.ports).every(p => p !== 't'));
    assert.equal(d.SW1.svi ?? null, null); assert.equal((d.SW1.addresses ?? []).length, 0);
    assert.equal(syntax === 'cisco' ? d.R1.subifs.length : d.R1.vlanIfs.length, 2);
    assert.ok(!JSON.stringify(g).includes(m.gateway));
    assert.ok(a.topology.hosts.every(h => a.goals[h.device] !== m.vid));
  }
});
test('X6 fixed givens remain effective when a serialized draft tries to alter them', () => {
  const a = task(1), answer = route.solution(a); answer.SW1 = { nonsense: true };
  assert.equal(route.check(a, answer).ok, true);
  const b = task(3), other = route.solution(b); other.R1.subifs[0].ip = '1.2.3.4';
  other.SW1.ports[Object.keys(route.givens(b, 'cisco').SW1.ports)[0]] = { mode: 'access', vlan: 999 };
  assert.equal(route.check(b, other).ok, true);
});
for (const syntax of ['cisco', 'routeros']) test(`X6 management address is chosen and probe targets submitted IP: ${syntax}`, () => {
  const a = task(3, syntax), answer = route.solution(a), chosen = a.management.network.replace(/\.0$/, '.75');
  if (syntax === 'cisco') answer.SW1.svi.ip = chosen; else answer.SW1.addresses[0].ip = chosen;
  const r = route.check(a, answer);
  assert.equal(r.code, 'ok');
  const probe = r.evidence.probes.find(p => p.kind === 'management');
  assert.equal(r.evidence.attachments.find(a => a.id === probe.to).ip, chosen);
});
for (const syntax of ['cisco', 'routeros']) test(`G5/G9 missing management default fails only the reply: ${syntax}`, () => {
  const a = task(3, syntax), answer = route.solution(a);
  if (syntax === 'cisco') answer.SW1.defaultGateway = ''; else answer.SW1.routes = [];
  const r = route.check(a, answer), p = r.evidence.probes.find(p => p.kind === 'management');
  assert.equal(r.code, 'reply-no-gateway'); assert.equal(p.request.ok, true); assert.equal(p.reply.code, 'no-gateway');
});
test('X7 missing management trunk VLAN shows the forward trunk stop before SVI inactivity', () => {
  const a = task(3), answer = route.solution(a), m = a.management.vid;
  answer.SW1.ports.t.allowed = answer.SW1.ports.t.allowed.filter(v => v !== m);
  const r = route.check(a, answer), p = r.evidence.probes.find(p => p.kind === 'management');
  assert.equal(r.code, 'gateway-unreachable');
  assert.equal(p.request.segments.at(-1).walks[0].hops.some(h => h.device === 'SW1' && h.dropped.some(d => d.port === 't' && d.code === 'not-member')), true);
  assert.ok(r.findings.findIndex(f => f.code === 'interface-down') > 0);
});
test('X1 missing management VLAN database is not repaired by allowed list; SVI has no up field or no-shutdown command', () => {
  const a = task(3), answer = route.solution(a);
  assert.equal(Object.hasOwn(answer.SW1.svi, 'up'), false);
  const commands = route.render(answer, 'cisco', a.topology).SW1;
  assert.match(commands, /interface vlan \d+\n ip address/); assert.doesNotMatch(commands, /no shutdown/);
  answer.SW1.vlans = answer.SW1.vlans.filter(v => v !== a.management.vid);
  assert.equal(route.check(a, answer).ok, false);
});
test('G1 parent shutdown is behavioural, with no form findings', () => {
  const a = task(1), answer = route.solution(a); answer.R1.interfaces.r.up = false;
  assert.deepEqual(route.compile(a, answer).findings, []);
  assert.equal(route.check(a, answer).code, 'interface-down');
});

const formCases = [
  ['missing-encapsulation', a => { delete a.R1.subifs[0].vid; }],
  ['duplicate-encapsulation', a => { a.R1.subifs.push({ ...a.R1.subifs[0], number: 999, ip: a.R1.subifs[0].ip.replace(/\.\d+$/, '.77') }); }],
  ['duplicate-interface', a => { a.R1.subifs[1].number = a.R1.subifs[0].number; }],
  ['unknown-interface', a => { a.R1.subifs[0].parent = 'missing'; }],
  ['overlapping-networks', a => { a.R1.subifs[1].ip = a.R1.subifs[0].ip.replace(/\.\d+$/, '.77'); }],
  ['missing-prefix', a => { a.R1.subifs[0].prefix = null; }],
  ['unusable-address', a => { a.R1.subifs[0].ip = a.R1.subifs[0].ip.replace(/\.\d+$/, '.0'); }],
  ['unusable-address', a => { a.R1.subifs[0].ip = a.R1.subifs[0].ip.replace(/\.\d+$/, '.255'); }],
];
for (const [code, mutate] of formCases) test(`X4 rejected form: ${code}/${mutate.toString()}`, () => {
  const a = task(2), answer = route.solution(a); mutate(answer);
  const r = route.check(a, answer);
  assert.ok(r.findings.some(f => f.code === code)); assert.deepEqual(r.evidence, { probes: [], objectives: [] });
});
test('X4 collisions with a PC or a disclosed management gateway block before probes', () => {
  const a = task(2), answer = route.solution(a); answer.R1.subifs[0].ip = a.topology.hosts[0].ip;
  assert.equal(route.check(a, answer).code, 'address-collision');
  const b = task(3), other = route.solution(b); other.SW1.svi.ip = b.management.gateway; other.R1.subifs.pop();
  assert.equal(route.check(b, other).code, 'address-collision');
});
test('X4 outside-VLAN network and wrong encapsulation fail through the trace, not the form', () => {
  for (const mutate of [a => { a.R1.subifs[0].ip = '10.99.0.1'; }, a => { a.R1.subifs[0].vid = 999; }]) {
    const a = task(1), answer = route.solution(a); mutate(answer);
    assert.deepEqual(route.compile(a, answer).findings, []);
    const r = route.check(a, answer); assert.equal(r.ok, false); assert.ok(r.evidence.probes.length);
  }
});
test('G7 VLAN on bridge slave is a behavioural diagnosis', () => {
  const a = task(4, 'routeros'), answer = route.solution(a); answer.R1.vlanIfs[0].on = 'r';
  assert.ok(route.compile(a, answer).findings.every(f => f.severity !== 'blocks'));
  assert.ok(route.check(a, answer).findings.some(f => /vlan-on-bridge-port$/.test(f.code)));
});
test('X5 router narrower prefix fails coverage even when every sampled probe passes', () => {
  const a = task(1, 'cisco', 4), answer = route.solution(a);
  // Put the two PCs and given gateway into the same /25, without changing VLAN/network givens.
  const net = a.networks[0], base = net.gateway.replace(/\.\d+$/, ''), high = Number(net.gateway.split('.').at(-1)) >= 128;
  a.topology.hosts.filter(h => h.gateway === net.gateway).forEach((h, i) => { h.ip = `${base}.${(high ? 140 : 40) + i}`; });
  answer.R1.subifs[0].prefix = 25;
  const r = route.check(a, answer);
  assert.ok(r.evidence.probes.every(p => p.ok)); assert.equal(r.code, 'router-prefix-mismatch');
});
for (const syntax of ['cisco', 'routeros']) test(`X4 equivalent user VLAN renumbering and interface names/numbers: ${syntax}`, () => {
  const a = task(2, syntax), answer = route.solution(a), map = new Map(a.vids.map((v, i) => [v, 300 + i]));
  if (syntax === 'cisco') {
    answer.SW1.vlans = answer.SW1.vlans.map(v => map.get(v));
    for (const p of Object.values(answer.SW1.ports)) if (p.mode === 'access') p.vlan = map.get(p.vlan); else p.allowed = p.allowed.map(v => map.get(v));
    answer.R1.subifs.forEach((s, i) => { s.vid = map.get(s.vid); s.number = 800 + i; });
  } else {
    for (const p of Object.values(answer.SW1.ports)) if (map.has(p.pvid)) p.pvid = map.get(p.pvid);
    answer.SW1.vlans.forEach(row => { row.vids = row.vids.map(v => map.get(v)); });
    answer.R1.vlanIfs.forEach((s, i) => { s.vid = map.get(s.vid); s.name = `office${i}`; answer.R1.addresses[i].iface = s.name; });
  }
  const r = route.check(a, answer); assert.equal(r.ok, true);
  assert.deepEqual(r.findings.map(f => f.code), syntax === 'cisco' ? ['subif-number-differs'] : []);
});
test('G3 advice is a reading convention, appears only on success, and is capped', () => {
  const { task: a, answer, expected } = numberConvention();
  assert.equal(route.check(a, answer).code, expected.code);
  assert.deepEqual(route.check(a, answer).findings.map(f => f.code), expected.advice);
  assert.match(t('subif-number-differs'), /легше читати/);
  answer.R1.interfaces.r.up = false;
  assert.equal(route.check(a, answer).code, expected.parentDown);
  assert.ok(route.check(a, answer).findings.every(f => f.severity === 'blocks'));
});
for (const n of [3, 4]) test(`G8 effective automatic CPU tagging is accepted with advice: task ${n}`, () => {
  const a = task(n, 'routeros'), answer = route.solution(a), d = n === 3 ? 'SW1' : 'R1';
  answer[d].vlans.forEach(row => { row.tagged = row.tagged.filter(p => p !== 'bridge1'); });
  assert.deepEqual(route.check(a, answer).findings.map(f => f.code), ['bridge-tag-implicit']);
  a.topology.devices.find(dev => dev.id === d).dynamicBridgeTagged = false;
  assert.equal(route.check(a, answer).ok, false);
});
test('X5 full routing passes without raw L2 leakage, including management; tagged leaks block', () => {
  const a = task(3, 'routeros'), answer = route.solution(a), r = route.check(a, answer);
  assert.equal(r.ok, true); assert.ok(r.evidence.objectives.every(o => o.ok));
  answer.SW1.filtering = false;
  const failed = route.check(a, answer);
  assert.ok(failed.findings.some(f => f.code === 'must-not-reach'));
  assert.ok(failed.evidence.objectives.some(o => !o.ok && (o.walk?.arrivals.some(a => a.tagged) || o.walks?.some(w => w.arrivals.length))));
});
test('X5 management stays in M even if routing to a user-VLAN management address would work', () => {
  const a = task(3), answer = route.solution(a), n = a.networks[0];
  answer.SW1.svi = { vid: n.vid, ip: n.network.replace(/\.0$/, '.75'), prefix: n.prefix }; answer.SW1.defaultGateway = n.gateway;
  const r = route.check(a, answer); assert.ok(r.findings.some(f => f.code === 'management-vlan-mismatch'));
});

test('X8 RouterOS rendering puts VLAN table, VLAN interfaces, addresses and explicit default before filtering', () => {
  const a = task(3, 'routeros'), c = route.render(route.solution(a), 'routeros', a.topology).SW1;
  const parts = ['/interface bridge vlan add', '/interface vlan add', '/ip address add', '/ip route add dst-address=0.0.0.0/0 gateway=', '/interface bridge set bridge1 vlan-filtering=yes'];
  for (let i = 1; i < parts.length; i++) assert.ok(c.indexOf(parts[i]) > c.indexOf(parts[i - 1]));
  assert.match(c, /tagged=.*bridge1/); assert.ok(c.endsWith(parts.at(-1)));
});
test('Cisco rendering uses submitted numbers, encapsulation, mask and explicit parent no shutdown', () => {
  const a = task(1), answer = route.solution(a); answer.R1.subifs[0].number = 777;
  const c = route.render(answer, 'cisco', a.topology).R1;
  assert.match(c, / no shutdown/); assert.match(c, /\.777\n encapsulation dot1Q \d+\n ip address .*255.255.255.0/);
});
test('X6 leak guard: public APIs expose givens and submitted rows; no reference mappings or commands before reveal', () => {
  for (const n of [1, 2, 3, 4]) {
    const a = task(n, n === 4 ? 'routeros' : 'cisco'), blank = route.initialAnswer(a), hints = route.hints(a, blank), checked = route.check(a, blank);
    assert.doesNotMatch(JSON.stringify(a), /"(?:reference|subifs|vlanIfs|addresses|svi|commands)"/);
    assert.deepEqual(hints.map(h => h.rung), [1, 2, 3]);
    assert.doesNotMatch(JSON.stringify(hints), /"(?:vid|number|ip|prefix|subifs|vlanIfs|reference|commands)"/);
    if (n !== 3) {
      assert.doesNotMatch(route.render(blank, a.syntax, a.topology).R1, /encapsulation|\/interface vlan add|ip address/);
      assert.doesNotMatch(route.describe(a).join('\n'), /encapsulation|\/interface vlan add|interface gi/);
    }
    assert.ok(checked.findings.every(f => f.severity === 'blocks'));
  }
});
test('X7 Ukrainian notes state both limits and preserve console and old access', () => {
  assert.match(routeText[3], /не захищає.*SSH.*Winbox/);
  assert.match(routeNotes.management, /консоль.*зворотний шлях.*старий доступ/);
  assert.match(routeNotes.svi, /administratively down.*no shutdown/);
});
test('all new codes have Ukrainian strings, and fixtures map every G fact', () => {
  for (const code of route.codes) { assert.ok(Object.hasOwn(copy, code), code); assert.notEqual(t(code), `[${code}]`); }
  assert.deepEqual(Object.keys(factMap), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
});
test('X9 Cisco hides task 4 at bank boundary and create rejects it', () => {
  assert.deepEqual(availableRecords('cisco').map(r => r.variants[0].task), [1, 2, 3]);
  assert.deepEqual(availableRecords('routeros').map(r => r.variants[0].task), [1, 2, 3, 4]);
  assert.throws(() => task(4), /invalid-record/);
});
test('bank validators reject mutations without consulting exercise logic', () => {
  assert.deepEqual(validateBank({ predict: [predictRecord], ports: portsRecords, route: records }), []);
  for (const r of [null, {}, { ...records[0], reference: {} }, { ...records[3], variants: [{ ...records[3].variants[0], syntaxes: ['cisco', 'routeros'] }] }]) assert.equal(validateRouteRecord(r)[0].code, 'invalid-bank');
  const a = task(3); a.management.vid = 1; assert.equal(validateRouteInstance(a)[0].code, 'invalid-bank');
  const b = task(2); b.topology.hosts[0].gateway = b.topology.hosts[0].ip; assert.equal(validateRouteInstance(b)[0].code, 'invalid-bank');
});
for (const answer of [null, [], {}, { SW1: null, R1: null }]) test(`invalid answer does not throw: ${JSON.stringify(answer)}`, () => {
  const a = task(2), r = route.check(a, answer); assert.equal(r.ok, false); assert.deepEqual(r.evidence.probes, []);
});

test('X2 parent shutdown is detected before missing encapsulation on the wire, including blank router rows', () => {
  const a = task(1), blank = route.initialAnswer(a), r = route.check(a, blank);
  assert.equal(r.code, 'interface-down');
  assert.ok(r.evidence.probes.some(p => p.kind === 'gateway' && p.code === 'interface-down'));
});
test('X4 arbitrary RouterOS names remain equivalent, and command arguments are quoted safely', () => {
  const a = task(1, 'routeros'), answer = route.solution(a), name = 'Office "A" $test';
  answer.R1.vlanIfs[0].name = name; answer.R1.addresses[0].iface = name;
  assert.equal(route.check(a, answer).ok, true);
  const commands = route.render(answer, 'routeros', a.topology).R1;
  assert.ok(commands.includes('name="Office \\"A\\" \\$test"'));
  assert.ok(commands.includes('interface="Office \\"A\\" \\$test"'));
});
test('X4 malformed nested RouterOS rows return form errors instead of throwing', () => {
  const a = task(4, 'routeros');
  for (const key of ['vlanIfs', 'addresses', 'routes']) {
    const answer = route.solution(a); answer.R1[key] = [null];
    assert.equal(route.check(a, answer).ok, false);
  }
});
test('X5 an extra switch management alias in a user VLAN violates management separation', () => {
  const a = task(3, 'routeros'), answer = route.solution(a), n = a.networks[0];
  answer.SW1.vlanIfs.push({ name: 'unsafe', on: 'bridge1', vid: n.vid });
  answer.SW1.addresses.push({ iface: 'unsafe', ip: n.network.replace(/\.0$/, '.75'), prefix: 24 });
  assert.ok(route.check(a, answer).findings.some(f => f.code === 'management-vlan-mismatch'));
});
test('hints identify the failing trunk hop and ignore normal VLAN isolation on other branches', () => {
  const a = task(2), answer = route.solution(a); answer.SW1.ports.t.allowed = [];
  const hint = route.hints(a, answer)[1];
  assert.equal(hint.params.device, 'SW1'); assert.equal(hint.params.port, 'gi0/1'); assert.equal(hint.params.reason, 'not-allowed-out');
});
test('text equivalent describes forward and return routed hops using submitted interface labels', () => {
  const a = task(1), answer = route.solution(a); answer.R1.subifs[0].number = 777;
  const lines = route.describe(a, { answer, result: route.check(a, answer) }).join('\n');
  assert.match(lines, /Відповідь:/); assert.match(lines, /маршрутизація.*\.777/);
  assert.doesNotMatch(lines, /R1:r\./);
});

for (const syntax of ['cisco', 'routeros']) test(`X4 restoring fixed task-3 rows preserves extra duplicate interfaces for rejection: ${syntax}`, () => {
  const a = task(3, syntax), answer = route.solution(a);
  if (syntax === 'cisco') answer.R1.subifs.push({ ...answer.R1.subifs[0] });
  else answer.R1.vlanIfs.push({ ...answer.R1.vlanIfs[0] });
  assert.ok(route.check(a, answer).findings.some(f => f.code === 'duplicate-interface'));
});
