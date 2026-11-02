import test from 'node:test';
import assert from 'node:assert/strict';
import * as route from '../src/sections/vlan/logic/route.js';
import { records } from '../src/banks/vlan/route.js';
import { validateRouteInstance } from '../src/banks/vlan/validate.js';
import { compileRouterOS, attachmentStatus, flood, ping3 } from '../src/engine/l2.js';
import { t } from '../src/sections/vlan/uk.js';
import { managementAnswer, slaveAddressAnswer } from './fixtures/vlan2/review-handwritten.mjs';
import { stick, tables } from './fixtures/vlan2/handwritten.mjs';

function managementTask(syntax) {
  const task = route.create(records[2], { syntax, seed: 17 });
  // Astra's precise /24 directed-broadcast counterexample; user nets outside /23.
  Object.assign(task.networks[2], { network: '172.16.100.0', gateway: '172.16.100.1' });
  Object.assign(task.management, task.networks[2]);
  return task;
}

for (const syntax of ['cisco', 'routeros']) {
  test(`review 1: R1 M .2 with SW1 pointing at .2 cannot replace given .1 (${syntax})`, () => {
    const task = managementTask(syntax), answer = managementAnswer(syntax);
    assert.equal(route.check(task, answer).ok, true);
    if (syntax === 'cisco') {
      answer.R1.subifs[2].ip = '172.16.100.2'; answer.SW1.defaultGateway = '172.16.100.2';
    } else {
      answer.R1.addresses[2].ip = '172.16.100.2'; answer.SW1.routes[0].gateway = '172.16.100.2';
    }
    const result = route.check(task, answer);
    assert.equal(result.ok, false);
    assert.ok(result.findings.some(f => f.code === 'router-gateway-missing'));
    assert.ok(result.evidence.probes.find(p => p.kind === 'management').ok);
    const probe = result.evidence.probes.find(p => p.kind === 'gateway' && p.to === '172.16.100.1');
    assert.equal(probe.from, 'PC1'); assert.equal(probe.ok, false);
    assert.ok(result.evidence.objectives.some(o => o.id === 'coverage:172.16.100.1' && !o.ok));
    assert.ok(validateRouteInstance(task, answer).length);
  });

  test(`review 1: absent M attachment produces failed coverage and actual gateway walk (${syntax})`, () => {
    const task = managementTask(syntax), answer = managementAnswer(syntax);
    if (syntax === 'cisco') answer.R1.subifs.pop();
    else { answer.R1.vlanIfs.pop(); answer.R1.addresses.pop(); }
    const result = route.check(task, answer);
    assert.ok(result.findings.some(f => f.code === 'router-gateway-missing'));
    const probe = result.evidence.probes.find(p => p.to === '172.16.100.1');
    assert.equal(probe.ok, false); assert.ok(probe.request.segments.length);
  });

  test(`review 3: .255/23 is unusable under given M /24 (${syntax})`, () => {
    const task = managementTask(syntax), answer = managementAnswer(syntax);
    const address = syntax === 'cisco' ? answer.SW1.svi : answer.SW1.addresses[0];
    Object.assign(address, { ip: '172.16.100.255', prefix: 23 });
    assert.deepEqual(route.compile(task, answer).findings.filter(f => f.severity === 'blocks'), []);
    const result = route.check(task, answer);
    assert.ok(result.evidence.probes.every(p => p.ok));
    assert.equal(result.code, 'management-vlan-mismatch');
    assert.ok(validateRouteInstance(task, answer).length);
    Object.assign(address, { ip: '172.16.100.75', prefix: 23 });
    assert.equal(route.check(task, answer).ok, true);
    assert.deepEqual(validateRouteInstance(task, answer), []);
  });
}

for (const name of ['ether2', 'r']) test(`review 2: RouterOS VLAN name ${name} uses displayed namespace`, () => {
  const task = route.create(records[0], { syntax: 'routeros', seed: 17 });
  task.topology.devices.find(d => d.id === 'R1').ports[0].label.routeros = 'ether2';
  const answer = { ...route.initialAnswer(task), R1: {
    vlanIfs: [{ name, vid: 200, on: 'r' }, { name: 'officeB', vid: 100, on: 'r' }],
    addresses: [
      { iface: name, ip: '172.16.113.1', prefix: 24 },
      { iface: 'officeB', ip: '172.16.147.1', prefix: 24 },
    ],
  } };
  const result = route.check(task, answer);
  if (name === 'ether2') {
    assert.equal(result.code, 'duplicate-interface'); assert.deepEqual(result.evidence.probes, []);
  } else {
    assert.equal(result.ok, true);
    const compiled = route.compile(task, answer);
    assert.deepEqual(compiled.topology.attachments.map(a => [a.iface, a.port, a.vid]), [['r', 'r', 200], ['officeB', 'r', 100]]);
    const commands = route.render(answer, 'routeros', task.topology).R1;
    assert.match(commands, /name=r vlan-id=200 interface=ether2/);
    assert.match(commands, /address=172\.16\.113\.1\/24 interface=r\n/);
  }
});

for (const dynamic of [false, true]) for (const mode of ['mixed', 'untagged', 'two-vlans']) {
  test(`review 4: CPU explicit ${mode} blocks before dynamic tagging (${dynamic})`, () => {
    const task = managementTask('routeros'), answer = managementAnswer('routeros');
    task.topology.devices.find(d => d.id === 'SW1').dynamicBridgeTagged = dynamic;
    const row = answer.SW1.vlans[2]; row.untagged.push('bridge1');
    if (mode !== 'mixed') row.tagged = ['t'];
    if (mode === 'two-vlans') answer.SW1.vlans[0].untagged.push('bridge1');
    const before = structuredClone(answer), compiled = route.compile(task, answer);
    const finding = compiled.findings.find(f => f.code === 'port-in-two-vlans-untagged');
    assert.equal(finding.severity, 'blocks'); assert.equal(finding.field, 'ports.bridge1');
    assert.equal(route.check(task, answer).code, 'port-in-two-vlans-untagged');
    assert.deepEqual(route.check(task, answer).evidence, { probes: [], objectives: [] });
    assert.match(t(finding.code), /bridge1/);
    assert.equal(compiled.tables.SW1.members[40].tagged.has('bridge1'), mode === 'mixed');
    assert.equal(compiled.tables.SW1.members[40].untagged.has('bridge1'), true);
    assert.deepEqual(answer, before);
  });
}

test('review 5: Fable task 4 seed 3 direct gateway address on slave ether4 never works', () => {
  const task = route.create(records[3], { syntax: 'routeros', seed: 3 }), answer = slaveAddressAnswer();
  const compiled = route.compile(task, answer), attachment = compiled.topology.attachments.find(a => a.iface === 'a1');
  assert.deepEqual(compiled.findings.filter(f => f.severity === 'blocks'), []);
  assert.equal(attachmentStatus(compiled.topology, compiled.tables, attachment), 'vlan-on-bridge-port');
  const result = route.check(task, answer);
  const gateway = result.evidence.probes.find(p => p.kind === 'gateway' && p.from === 'PC1');
  assert.equal(gateway.code, 'vlan-on-bridge-port');
  assert.equal(gateway.request.segments[0].walks[0].received.has(attachment.id), false);
  assert.deepEqual(flood(compiled.topology, compiled.tables, { from: attachment.id }).hops[0].dropped,
    [{ port: 'a1', code: 'vlan-on-bridge-port' }]);
  assert.match(t('vlan-on-bridge-port'), /VLAN-інтерфейс або адреса/);
});

test('review 6: direct peer failure copy covers the destination as well as a gateway', () => {
  const f = stick(); f.topology.hosts[1].ip = '10.10.10.21';
  assert.equal(ping3(f.topology, tables(f), 'PC1', 'PC2').code, 'gateway-unreachable');
  assert.match(t('gateway-unreachable'), /адресата.*наступного вузла/);
});

test('review 7: blank RouterOS task 1 uses vendor-neutral missing VLAN interface copy', () => {
  const task = route.create(records[0], { syntax: 'routeros', seed: 2 });
  assert.equal(route.check(task, route.initialAnswer(task)).code, 'no-subinterface');
  assert.match(t('no-subinterface'), /Cisco.*RouterOS/);
});

test('review 8: missing CPU tagging has an explicit walk reason in each direction', () => {
  const f = stick(); f.topology.attachments[0].port = 'bridge';
  const compiled = compileRouterOS({ filtering: true, ports: { r: { frameTypes: 'admit-only-vlan-tagged' } },
    vlans: [{ vids: [10], tagged: ['r'], untagged: [] }] }, { bridge: true });
  f.routerTable = compiled.table;
  const into = flood(f.topology, tables(f), { from: 'PC1' });
  assert.ok(into.hops.some(h => h.dropped.some(d => d.port === 'bridge' && d.code === 'bridge-cpu-not-tagged')));
  assert.deepEqual(flood(f.topology, tables(f), { from: 'r10' }).hops[0].dropped,
    [{ port: 'bridge', code: 'bridge-cpu-not-tagged' }]);
  assert.equal(ping3(f.topology, tables(f), 'PC1', 'PC2').code, 'bridge-cpu-not-tagged');
  assert.match(t('bridge-cpu-not-tagged'), /bridge1.*tagged/);
});

for (const filtering of [false, true]) test(`review 9: absent bridge egress records a drop (filtering ${filtering})`, () => {
  const f = stick(), t = tables(f); delete t.SW1.ports.b; t.SW1.filtering = filtering;
  const walk = flood(f.topology, t, { from: 'PC1' });
  assert.ok(walk.hops.find(h => h.device === 'SW1').dropped.some(d => d.port === 'b' && d.code === 'not-allowed-out'));
});

for (const name of ['ether1', 't']) test(`review 2: switch VLAN name ${name} has the same namespace rule`, () => {
  const task = managementTask('routeros'), answer = managementAnswer('routeros');
  answer.SW1.vlanIfs[0].name = name; answer.SW1.addresses[0].iface = name;
  const result = route.check(task, answer);
  if (name === 'ether1') assert.equal(result.code, 'duplicate-interface');
  else {
    assert.equal(result.ok, true);
    const attachment = route.compile(task, answer).topology.attachments.find(a => a.device === 'SW1');
    assert.deepEqual([attachment.iface, attachment.port, attachment.vid], ['t', 'bridge', 40]);
    assert.match(route.render(answer, 'routeros', task.topology).SW1,
      /address=172\.16\.100\.50\/24 interface=t\n/);
  }
});

test('review 2: a physical address reference still resolves by internal ID without a matching VLAN name', () => {
  const task = route.create(records[0], { syntax: 'routeros', seed: 17 });
  const answer = { ...route.initialAnswer(task), R1: {
    vlanIfs: [], addresses: [{ iface: 'r', ip: '192.0.2.1', prefix: 24 }],
  } };
  const compiled = route.compile(task, answer);
  assert.deepEqual(compiled.findings.filter(f => f.severity === 'blocks'), []);
  assert.deepEqual(compiled.topology.attachments.map(a => [a.port, a.label, a.vid]), [['r', 'ether1', null]]);
  assert.match(route.render(answer, 'routeros', task.topology).R1, /address=192\.0\.2\.1\/24 interface=ether1$/);
});
