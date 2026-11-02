import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCisco, compileRouterOS, flood, ping3, trace3, ping3Codes, ping3BaseCodes, validateTopology, attachmentStatus } from '../src/engine/l2.js';
import { compileL3 } from '../src/engine/l3-config.js';
import { stick, asymmetric, tables, requestCases, replyCases, expectedWalk } from './fixtures/vlan2/handwritten.mjs';

for (const fixture of requestCases) test(`VLAN2 hand fixture request: ${fixture.code}`, () => {
  const f = stick(); fixture.mutate(f);
  const r = ping3(f.topology, tables(f), 'PC1', 'PC2');
  assert.equal(r.code, fixture.code); assert.equal(r.request.code, fixture.code);
  if (fixture.code !== 'ok') assert.equal(r.reply, null);
});
for (const fixture of replyCases) test(`VLAN2 hand fixture reply: ${fixture.code}`, () => {
  const f = fixture.separateVlans ? stick() : asymmetric(); fixture.mutate(f);
  const r = ping3(f.topology, tables(f), 'PC1', 'PC2');
  assert.equal(r.request.code, 'ok'); assert.equal(r.reply?.code, fixture.code);
  assert.equal(r.code, fixture.code === 'ok' ? 'ok' : `reply-${fixture.code}`);
});

test('X3 closed codes are completely covered by hand fixtures in each direction', () => {
  assert.deepEqual(new Set(requestCases.map(f => f.code)), new Set(ping3BaseCodes));
  assert.deepEqual(new Set(replyCases.map(f => f.code)), new Set(ping3BaseCodes));
  assert.equal(new Set(ping3Codes).size, 23);
});
test('X2/X3 hand-authored L3 segment/hop oracle; routed frames never merge into the first walk', () => {
  const f = stick(), r = ping3(f.topology, tables(f), 'PC1', 'PC2');
  for (const direction of ['request', 'reply']) {
    assert.deepEqual(r[direction].segments.map(s => [s.from, s.to]), expectedWalk[direction].segments);
    assert.deepEqual(r[direction].hops, expectedWalk[direction].hops);
  }
  const segments = r.request.segments;
  assert.equal(segments[0].walks[0].received.has('PC2'), false);
  assert.deepEqual(segments[0].walks[0].hops.find(h => h.device === 'SW1').out, [{ port: 't', tagged: true, vid: 10 }]);
  assert.deepEqual(segments[1].walks[0].hops[0].out, [{ port: 'r', tagged: true, vid: 20 }]);
  assert.equal(segments[1].walks[0].received.has('PC2'), true);
  assert.equal(validateTopology(f.topology).length, 0);
});
test('G2 main port receives untagged; a tagged attachment never receives native traffic', () => {
  const f = stick(); f.switchConfig.ports.a.vlan = 1; f.switchConfig.ports.t.allowed.push(1);
  f.topology.attachments.push({ id: 'main', device: 'R1', port: 'r', vid: null, ip: '10.10.10.9', prefix: 24, up: true });
  const w = flood(f.topology, tables(f), { from: 'PC1' });
  assert.equal(w.received.has('main'), true); assert.equal(w.received.has('r10'), false);
  assert.deepEqual(w.attachmentArrivals, [{ attachment: 'main', device: 'R1', port: 'r', tagged: false, vid: null, code: 'ok' }]);
});
test('G4 corrected: SVI needs the database AND actual member; allowed list alone does not activate it', () => {
  const f = stick(), svi = { id: 'svi', device: 'SW1', port: 'svi', vid: 99, ip: '10.99.0.50', prefix: 24 };
  f.topology.attachments.push(svi); f.switchConfig.ports.t.allowed.push(99);
  assert.equal(attachmentStatus(f.topology, tables(f), svi), 'interface-down');
  f.switchConfig.vlans.push(99);
  assert.equal(attachmentStatus(f.topology, tables(f), svi), 'ok');
  f.switchConfig.ports.t.allowed = [10, 20];
  assert.equal(attachmentStatus(f.topology, tables(f), svi), 'interface-down');
  assert.equal(flood(f.topology, tables(f), { from: 'svi' }).hops[0].dropped[0].code, 'interface-down');
});

for (const [mode, expected, advice] of [['explicit', true, false], ['dynamic', true, true], ['absent', false, false], ['untagged', false, false]]) test(`G6-G8 effective bridge CPU membership: ${mode}`, () => {
  const f = stick(); f.topology.attachments[0].port = 'bridge';
  const config = { filtering: true, ports: { r: { frameTypes: 'admit-only-vlan-tagged' } }, vlans: [{ vids: [10], tagged: ['r', ...(mode === 'explicit' ? ['bridge1'] : [])], untagged: mode === 'untagged' ? ['bridge1'] : [] }] };
  const before = structuredClone(config);
  const compiled = compileRouterOS(config, { bridge: true, vlanIfs: [{ on: 'bridge1', vid: 10 }], dynamicBridgeTagged: mode === 'dynamic' });
  f.routerTable = compiled.table;
  const t = tables(f), into = flood(f.topology, t, { from: 'PC1' }), out = flood(f.topology, t, { from: 'r10' });
  assert.equal(into.received.has('r10'), expected); assert.equal(out.received.has('PC1'), expected);
  assert.equal(compiled.findings.some(f => f.code === 'bridge-tag-implicit'), advice);
  assert.deepEqual(config, before);
});
test('G6 RouterOS plain port VLAN works without a bridge, arbitrary interface name', () => {
  const f = stick(), answer = { SW1: { ...f.switchConfig }, R1: { vlanIfs: [{ name: 'office', vid: 10, on: 'r' }], addresses: [{ ip: '10.10.10.1', prefix: 24, iface: 'office' }] } };
  // Compile just the router against a host+router topology to avoid mixed vendor switch forms.
  const topology = { ...f.topology, devices: f.topology.devices.filter(d => d.id !== 'SW1') };
  const c = compileL3(topology, { R1: answer.R1 }, 'routeros');
  assert.deepEqual(c.findings, []);
  assert.deepEqual(c.topology.attachments.map(a => [a.port, a.vid]), [['r', 10]]);
});
test('X3 local router delivery succeeds even with no destination connected route; return still needs its own route', () => {
  const f = stick(); f.topology.attachments[0].prefix = 30;
  const r = ping3(f.topology, tables(f), 'PC1', 'r10');
  assert.equal(r.request.code, 'ok'); assert.equal(r.reply.code, 'no-route');
  assert.deepEqual(r.request.hops, []);
});
test('X3 router chooses longest connected prefix, independent of attachment array order', () => {
  const f = stick(); f.topology.attachments.push({ id: 'narrow', device: 'R1', port: 'r', vid: 30, ip: '10.10.20.17', prefix: 28, up: true });
  const r = trace3(f.topology, tables(f), 'PC1', 'PC2');
  assert.deepEqual(r.hops, [{ router: 'R1', in: 'r10', out: 'narrow' }]);
  assert.equal(r.ok, false);
});

for (const vendor of ['cisco', 'routeros']) test(`G5/G9 hand-authored management default gateway/route: ${vendor}`, async () => {
  const { management } = await import('./fixtures/vlan2/handwritten.mjs');
  const f = management(vendor), t = { SW1: f.managementTable };
  const a = f.topology.attachments.find(a => a.id === 'management');
  const r = ping3(f.topology, t, 'PC1', 'management');
  assert.equal(r.code, 'ok');
  assert.deepEqual(r.request.hops, [{ router: 'R1', in: 'r10', out: 'r99' }]);
  assert.deepEqual(r.reply.hops, [{ router: 'R1', in: 'r99', out: 'r10' }]);
  delete a.gateway;
  assert.equal(ping3(f.topology, t, 'PC1', 'management').code, 'reply-no-gateway');
});

test('X2 virtual attachment injection cannot override its configured VLAN to bypass CPU membership', () => {
  const f = stick(); f.topology.attachments[0].port = 'bridge';
  assert.throws(() => flood(f.topology, tables(f), { from: 'r10', tagged: 20 }), /invalid-topology/);
});
test('X3 a down router address is not locally delivered through another up attachment', () => {
  const f = stick(); f.topology.attachments[0].up = false;
  assert.equal(ping3(f.topology, tables(f), 'PC2', 'r10').code, 'interface-down');
  assert.equal(trace3(f.topology, tables(f), 'r10', 'PC2').code, 'interface-down');
});
