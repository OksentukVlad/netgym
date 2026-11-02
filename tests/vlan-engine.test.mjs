import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCisco, compileRouterOS, flood, ping, domains, validateTopology } from '../src/engine/l2.js';
import { simple, cisco, routeros, transit, transitCisco, topology, clone, hop, out } from './helpers/vlan.mjs';

const compile = (configs, compiler = compileCisco) => Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, compiler(config).table]));

test('L2 hand fixture: access classification, isolation, untag egress and exact walk', () => {
  const walk = flood(simple(), { SW1: compileCisco(cisco).table }, { from: 'PC1' });
  assert.deepEqual(walk.received, new Set(['PC2']));
  assert.deepEqual(walk.hops, [
    hop('PC1', null, false, null, [out('nic', false, null)]),
    hop('SW1', 'a', false, 10, [out('b', false, 10)], [{ port: 'c', code: 'not-allowed-out' }], false),
    hop('PC2', 'nic', false, null),
  ]);
  assert.deepEqual(walk.arrivals, [{ host: 'PC2', device: 'PC2', port: 'nic', tagged: false, vid: null, from: { device: 'SW1', port: 'b' } }]);
});

test('F1: RouterOS 7 ingress filtering defaults to true and rejects nonmembers', () => {
  const config = clone(routeros); config.ports.a.frameTypes = 'admit-all';
  const table = compileRouterOS(config).table;
  assert.equal(table.ports.a.ingressFilter, true);
  const walk = flood(simple(), { SW1: table }, { from: 'PC1', tagged: 20 });
  assert.deepEqual(walk.received, new Set());
  assert.deepEqual(walk.hops[1].dropped, [{ port: 'a', code: 'not-member' }]);
});

test('F2: dynamic PVID membership includes untagged admission, except tagged-only', () => {
  const config = { filtering: true, ports: { a: { pvid: 10 }, b: { pvid: 20, frameTypes: 'admit-only-vlan-tagged' } }, vlans: [] };
  const { table, findings } = compileRouterOS(config);
  assert.deepEqual([...table.vlans], [10]);
  assert.deepEqual(table.members[10], { tagged: new Set(), untagged: new Set(['a']) });
  assert.equal(table.members[20], undefined);
  assert.deepEqual(findings, [{ code: 'dynamic-pvid', severity: 'info', field: 'ports.a', params: { port: 'a', vid: 10 } }]);
  config.filtering = false;
  assert.deepEqual(compileRouterOS(config).table.members, {});
});

test('F3: RouterOS admission happens before PVID and membership checks', () => {
  const config = clone(routeros); config.ports.a = { pvid: 1, frameTypes: 'admit-only-vlan-tagged' };
  let walk = flood(simple(), { SW1: compileRouterOS(config).table }, { from: 'PC1' });
  assert.deepEqual(walk.hops[1].dropped, [{ port: 'a', code: 'untagged-not-admitted' }]);
  config.ports.a = { pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' };
  walk = flood(simple(), { SW1: compileRouterOS(config).table }, { from: 'PC1', tagged: 20 });
  assert.deepEqual(walk.hops[1].dropped, [{ port: 'a', code: 'tagged-not-admitted' }]);
});

test('W2: untagged classification also checks ingress membership', () => {
  const table = compileCisco(cisco).table;
  table.members[10].untagged.delete('a');
  const walk = flood(simple(), { SW1: table }, { from: 'PC1' });
  assert.equal(walk.hops[1].vid, 10);
  assert.deepEqual(walk.hops[1].dropped, [{ port: 'a', code: 'not-member' }]);
});

test('F4: filtering off ignores PVID, membership and admission; preserves wire tags', () => {
  const config = clone(routeros); config.filtering = false;
  const table = compileRouterOS(config).table;
  assert.deepEqual(flood(simple(), { SW1: table }, { from: 'PC1' }).received, new Set(['PC2', 'PC3']));
  const walk = flood(simple(), { SW1: table }, { from: 'PC1', tagged: 77 });
  assert.deepEqual(walk.received, new Set());
  assert.deepEqual(walk.hops[1].out, [out('b', true, 77), out('c', true, 77)]);
  assert.deepEqual(walk.arrivals.map(a => [a.host, a.tagged, a.vid]), [['PC2', true, 77], ['PC3', true, 77]]);
  assert.deepEqual(walk.hops.slice(2).map(h => h.dropped), [[{ port: 'nic', code: 'host-got-tagged' }], [{ port: 'nic', code: 'host-got-tagged' }]]);
});

test('F5: VLAN-1 has no CPU/L3 interface or automatic bridge membership', () => {
  const { table, findings } = compileRouterOS(routeros);
  assert.deepEqual(findings, []);
  assert.deepEqual(Object.keys(table.ports), ['a', 'b', 'c']);
  assert.equal(Object.values(table.members).some(m => m.tagged.has('bridge1') || m.untagged.has('bridge1')), false);
  const config = clone(routeros); config.vlans[0].tagged.push('bridge1');
  assert.equal(compileRouterOS(config).findings[0].code, 'invalid-config');
});

test('F7: documented RouterOS access/trunk example compiles with dynamic access', () => {
  const config = { filtering: true, ports: { ether1: { frameTypes: 'admit-only-vlan-tagged' }, ether2: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' } }, vlans: [{ vids: [20], tagged: ['ether1'], untagged: [] }] };
  const { table } = compileRouterOS(config);
  assert.deepEqual(table.members[20], { tagged: new Set(['ether1']), untagged: new Set(['ether2']) });
  assert.deepEqual(table.ports.ether1, { pvid: 1, admitUntagged: false, admitTagged: true, ingressFilter: true });
});

test('F8: an access assignment creates a missing Cisco VLAN, including on earlier trunks', () => {
  const config = { vlans: [], ports: { t: { mode: 'trunk', allowed: [10] }, a: { mode: 'access', vlan: 10 } } };
  const { table, findings } = compileCisco(config);
  assert.deepEqual(table.vlans, new Set([1, 10]));
  assert.deepEqual(table.members[10], { tagged: new Set(['t']), untagged: new Set(['a']) });
  assert.deepEqual(findings, [{ code: 'vlan-auto-created', severity: 'info', field: 'ports.a', params: { vid: 10, port: 'a' } }]);
});

test('F9: missing transit VLAN drops despite allowed lists, with no VTP', () => {
  const configs = clone(transitCisco); configs.SW2.vlans = [];
  const walk = flood(transit(), compile(configs), { from: 'PC1' });
  assert.deepEqual(walk.received, new Set());
  assert.deepEqual(walk.hops[1].out, [out('t', true, 20)]);
  assert.deepEqual(walk.hops[2], hop('SW2', 'l', true, 20, [], [{ port: 'l', code: 'vlan-not-on-switch' }], false));
});

test('Cisco allowed lists reject ingress and egress, without creating VLANs', () => {
  const configs = clone(transitCisco); configs.SW2.ports.r.allowed = [];
  const tables = compile(configs);
  const forward = flood(transit(), tables, { from: 'PC1' }), reverse = flood(transit(), tables, { from: 'PC2' });
  assert.deepEqual(forward.received, new Set());
  assert.deepEqual(forward.hops[2].dropped, [{ port: 'r', code: 'not-allowed-out' }]);
  assert.deepEqual(reverse.hops[2].dropped, [{ port: 'r', code: 'not-member' }]);
});

test('F10: compiler never guesses DTP for null mode', () => {
  const { table, findings } = compileCisco({ vlans: [10], ports: { a: { mode: null } } });
  assert.deepEqual(findings, []); // topology-aware used-port validation belongs to compileAll
  assert.deepEqual(table.ports.a, { pvid: null, admitTagged: false, admitUntagged: false, ingressFilter: true });
  assert.deepEqual(table.members, {});
});

test('F11: default native VLAN 1 is untagged only when allowed and existing', () => {
  let table = compileCisco({ vlans: [10], ports: { a: { mode: 'trunk', allowed: 'all' }, b: { mode: 'trunk', allowed: [10] } } }).table;
  assert.equal(table.ports.a.pvid, 1);
  assert.deepEqual(table.members[1], { tagged: new Set(), untagged: new Set(['a']) });
  assert.deepEqual(table.members[10], { tagged: new Set(['a', 'b']), untagged: new Set() });
  const net = topology({ SW1: ['a', 'b'] }, { PC1: ['SW1', 'a', '192.168.1.2'], PC2: ['SW1', 'b', '192.168.1.3'] });
  table = compileCisco({ vlans: [], ports: { a: { mode: 'trunk', allowed: [1] }, b: { mode: 'trunk', allowed: [1] } } }).table;
  assert.deepEqual(flood(net, { SW1: table }, { from: 'PC1' }).hops[1].out, [out('b', false, 1)]);
});

test('F12 corrected: Cisco access ports drop tagged frames, even their own VLAN', () => {
  const walk = flood(simple(), { SW1: compileCisco(cisco).table }, { from: 'PC1', tagged: 10 });
  assert.deepEqual(walk.received, new Set());
  assert.deepEqual(walk.hops[1].dropped, [{ port: 'a', code: 'tagged-not-admitted' }]);
});

test('W5: each endpoint applies its own prefix; connection is bidirectional', () => {
  const net = simple(); net.hosts[0].prefix = 16; net.hosts[1].ip = '192.168.11.3';
  assert.equal(ping(net, { SW1: compileCisco(cisco).table }, 'PC1', 'PC2').code, 'different-network');
  net.hosts[1].prefix = 16;
  const result = ping(net, { SW1: compileCisco(cisco).table }, 'PC1', 'PC2');
  assert.equal(result.code, 'ok'); assert.equal(result.walks.length, 2);
});

test('W5: one-way and no-path have hand-written asymmetric outcomes', () => {
  const net = simple(); net.hosts.pop(); net.devices = net.devices.filter(d => d.id !== 'PC3'); net.links.pop();
  const table = { filtering: true, vendor: 'routeros', vlans: new Set([10, 20]), ports: { a: { pvid: 10, admitTagged: true, admitUntagged: true, ingressFilter: true }, b: { pvid: 20, admitTagged: true, admitUntagged: true, ingressFilter: true } }, members: { 10: { tagged: new Set(), untagged: new Set(['a', 'b']) }, 20: { tagged: new Set(), untagged: new Set(['b']) } } };
  assert.equal(ping(net, { SW1: table }, 'PC1', 'PC2').code, 'one-way');
  table.members[10].untagged.delete('b');
  assert.equal(ping(net, { SW1: table }, 'PC1', 'PC2').code, 'no-path');
});

test('W9: domains are connected components when mutual reach is not transitive', () => {
  const net = simple();
  const table = { filtering: true, vendor: 'routeros', vlans: new Set([10, 20, 30]),
    ports: Object.fromEntries(['a', 'b', 'c'].map((p, i) => [p, { pvid: (i + 1) * 10, admitTagged: true, admitUntagged: true, ingressFilter: true }])),
    members: Object.fromEntries([[10, ['a', 'b']], [20, ['a', 'b', 'c']], [30, ['b', 'c']]].map(([vid, ports]) => [vid, { tagged: new Set(), untagged: new Set(ports) }])) };
  assert.deepEqual(flood(net, { SW1: table }, { from: 'PC1' }).received, new Set(['PC2']));
  assert.deepEqual(flood(net, { SW1: table }, { from: 'PC2' }).received, new Set(['PC1', 'PC3']));
  assert.deepEqual(flood(net, { SW1: table }, { from: 'PC3' }).received, new Set(['PC2']));
  assert.deepEqual(domains(net, { SW1: table }), [['PC1', 'PC2', 'PC3']]);
});

test('W9: physical attachment IDs accept tagged input without host-specific lookup', () => {
  const net = transit(); net.attachments = [{ id: 'router-on-stick', device: 'PC1', port: 'nic' }];
  const configs = clone(transitCisco); configs.SW1.ports.a = { mode: 'trunk', allowed: [20] };
  assert.deepEqual(validateTopology(net), []);
  assert.deepEqual(flood(net, compile(configs), { from: 'router-on-stick', tagged: 20 }).received, new Set(['PC2']));
  assert.throws(() => flood(net, compile(configs), { from: 'missing' }), /invalid-topology/);
});

test('L2 port traversal is deterministic and does not mutate tables or topology', () => {
  const net = transit(), tables = compile(transitCisco), before = clone({ net, tables });
  const first = flood(net, tables, { from: 'PC1' });
  assert.deepEqual(flood(net, tables, { from: 'PC1' }), first);
  assert.deepEqual({ net, tables }, before);
  assert.deepEqual(first.received, new Set(['PC2']));
});

for (const [name, mutate] of [
  ['duplicate address', t => t.hosts[1].ip = t.hosts[0].ip],
  ['duplicate port', t => t.devices[0].ports.push(clone(t.devices[0].ports[0]))],
  ['duplicate label', t => t.devices[0].ports[1].label.cisco = 'a'],
  ['reused link endpoint', t => t.links.push(clone(t.links[0]))],
  ['invalid host address', t => t.hosts[0].ip = null],
  ['invalid host prefix', t => t.hosts[0].prefix = null],
  ['unknown link endpoint', t => t.links[0].a.port = 'missing'],
  ['cycle', t => { t.devices[0].ports.push({ id: 'x', label: { cisco: 'x', routeros: 'x' } }); t.links.push({ a: { device: 'SW1', port: 'x' }, b: { device: 'SW1', port: 'x' } }); }],
]) test(`topology validator rejects ${name}`, () => { const net = simple(); mutate(net); assert.equal(validateTopology(net)[0].code, 'invalid-topology'); });

for (const compiler of [compileCisco, compileRouterOS]) for (const value of [null, [], {}, { ports: null, vlans: [] }]) test(`compiler ${compiler.name} handles malformed ${JSON.stringify(value)}`, () => {
  assert.equal(compiler(value).findings[0].code, 'invalid-config');
});
for (const vid of [0, 4095, -1, 1.5, '10', null]) test(`compilers reject invalid VID ${vid}`, () => {
  assert.equal(compileCisco({ vlans: [], ports: { a: { mode: 'access', vlan: vid } } }).findings[0].code, 'bad-vid');
  assert.equal(compileRouterOS({ filtering: true, ports: { a: { pvid: vid } }, vlans: [] }).findings[0].code, 'bad-vid');
});

test('RouterOS detects ambiguous explicit/dynamic untagged membership and invalid rows', () => {
  const config = clone(routeros); config.vlans[1].untagged.push('a');
  assert.ok(compileRouterOS(config).findings.some(f => f.code === 'port-in-two-vlans-untagged'));
  config.vlans = [{ vids: [10], tagged: ['a'], untagged: ['a'] }];
  assert.ok(compileRouterOS(config).findings.some(f => f.code === 'port-in-two-vlans-untagged'));
  config.vlans = [{ vids: [10], tagged: ['absent'], untagged: [] }];
  assert.ok(compileRouterOS(config).findings.some(f => f.code === 'invalid-config'));
});

test('topology validator rejects a cycle with distinct ports on every edge', () => {
  const net = topology({ SW1: ['a', 'b'], SW2: ['a', 'b'], SW3: ['a', 'b'] }, {}, [
    ['SW1', 'a', 'SW2', 'a'], ['SW2', 'b', 'SW3', 'a'], ['SW3', 'b', 'SW1', 'b'],
  ]);
  assert.deepEqual(validateTopology(net), [{ code: 'invalid-topology' }]);
});
