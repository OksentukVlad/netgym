import test from 'node:test';
import assert from 'node:assert/strict';
import { contains, toInt } from '../src/engine/ip.js';
import * as server from '../src/sections/dhcp/logic/server.js';

const fixture = (overrides = {}) => ({
  level: 1, vendor: 'mikrotik', network: '192.168.88.0', prefix: 24, router: '192.168.88.1',
  statics: [{ id: 'printer', name: 'принтер', genitive: 'принтера', address: '192.168.88.250' }],
  clients: 40, providerDns: ['203.0.113.53', '203.0.113.54'], routerForwardsDns: false,
  interface: 'bridge1', lease: '10m', ...overrides,
});
const range = (from, to) => ({ from: `192.168.88.${from}`, to: `192.168.88.${to}` });
const answer = (ranges = [range(100, 199)], extra = {}) => ({ ranges, gateway: '192.168.88.1', dns: ['203.0.113.53'], ...extra });

test('E2 parsers: every endpoint, reversed rows, singleton exclusions, MikroTik ranges and DNS lists', () => {
  assert.equal(server.parseRanges([range(2, 1)]).code, 'order');
  for (const value of [null, [], '', [{ from: 'no', to: '192.168.88.2' }], [range(100, 199), { from: '192.168.88.300', to: '192.168.88.4' }]]) assert.equal(server.parseRanges(value).ok, false);
  assert.equal(server.parseExclusions('ip dhcp excluded-address 192.168.88.2').ok, false);
  assert.deepEqual(server.parseExclusions([{ from: '192.168.88.2', to: '' }]).rows, [range(2, 2)]);
  assert.deepEqual(server.parseRanges('192.168.88.10-192.168.88.20,192.168.88.30').rows, [range(10, 20), range(30, 30)]);
  assert.deepEqual(server.parseDns('203.0.113.53, 203.0.113.54;203.0.113.53').addresses, ['203.0.113.53', '203.0.113.54']);
  assert.equal(server.parseDns([]).ok, false);
});

test('E2 returns one finding in priority order, parsing before semantics', () => {
  const t = fixture();
  const cases = [
    { a: answer([range(0, 255), range(20, 10)]), code: 'order', kind: 'info' },
    { a: answer([{ from: '192.168.87.255', to: '192.168.88.255' }]), code: 'outside' },
    { a: answer([range(0, 255)]), code: 'boundary', address: '192.168.88.0' },
    { a: answer([range(1, 255)]), code: 'boundary', address: '192.168.88.255' },
    { a: answer([range(1, 254)]), code: 'static' },
    { a: answer([range(1, 40)]), code: 'router' },
    { a: answer([range(100, 138)]), code: 'capacity' },
  ];
  for (const c of cases) {
    const result = server.checkAllocation(t, c.a);
    assert.equal(result.ok, false); assert.equal(result.code, c.code);
    assert.equal(result.kind, c.kind ?? 'verdict');
    if (c.address) assert.equal(result.address, c.address);
    assert.equal(result.findings, undefined);
  }
  assert.equal(server.checkAllocation(t, answer([range(0, 255), { from: 'bad', to: 'bad' }])).code, 'syntax');
  assert.equal(server.checkAllocation(t, answer([{ from: '192.168.88.100', to: '192.168.89.1' }])).address, '192.168.89.0');
  assert.equal(server.checkAllocation(t, answer([range(2, 2)])).code, 'capacity');
});

test('E2 union counts distinct addresses; singleton and capacity boundaries are inclusive', () => {
  const t = fixture();
  assert.equal(server.effectiveAllocation(t, answer([range(100, 119), range(110, 129), range(100, 119)])).count, 30);
  assert.equal(server.checkAllocation(t, answer([range(100, 119), range(110, 129)])).code, 'capacity');
  assert.equal(server.checkAllocation(t, answer([range(100, 139)])).ok, true);
  assert.deepEqual(server.effectiveAllocation(t, answer([range(120, 139), range(100, 119)])).ranges, [range(100, 139)]);
  assert.equal(server.checkAllocation(fixture({ clients: 1 }), answer([range(249, 249)])).ok, true);
  assert.equal(server.checkAllocation(fixture({ clients: 1 }), answer([range(250, 250)])).code, 'static');
  assert.equal(server.checkAllocation(t, answer([range(2, 249)])).count, 248);
});

test('E2 Cisco subtracts overlapping/singleton/reordered exclusions and its interface, never static devices', () => {
  const t = fixture({ level: 3, vendor: 'cisco', router: '192.168.88.9' });
  const a = { exclusions: [{ from: '192.168.88.250' }], gateway: t.router, dns: t.providerDns };
  const allocation = server.check(t, a);
  assert.equal(allocation.ok, true); assert.equal(allocation.count, 252);
  assert.ok(allocation.ranges.every(r => !(toInt(r.from) <= toInt(t.router) && toInt(t.router) <= toInt(r.to))));
  assert.equal(server.check(t, { ...a, exclusions: [] }).code, 'static');
  const exclusions = [range(0, 99), range(200, 255)];
  const first = server.effectiveAllocation(t, { exclusions });
  const equivalent = server.effectiveAllocation(t, { exclusions: [range(220, 255), range(200, 230), range(0, 99), { from: t.router }] });
  assert.equal(first.count, 100); assert.deepEqual(first, equivalent); assert.deepEqual(first.ranges, [range(100, 199)]);
  assert.equal(server.checkAllocation(t, { exclusions: [range(0, 255)] }).code, 'capacity');
  assert.equal(server.checkAllocation(t, { exclusions: [...exclusions, { from: '10.0.0.1' }] }).ok, true);
  assert.match(server.exclusionLines([{ from: t.router }])[0], /^ip dhcp excluded-address 192\.168\.88\.9$/);
});

test('E2 accepts resolver subsets/both resolvers; router DNS needs explicit forwarding', () => {
  const t = fixture();
  for (const dns of [t.providerDns, [t.providerDns[1]], `${t.providerDns[0]} ${t.providerDns[1]}`]) assert.equal(server.check(t, answer(undefined, { dns })).ok, true);
  assert.equal(server.check(t, answer(undefined, { gateway: '192.168.88.2' })).code, 'gateway');
  assert.equal(server.check(t, answer(undefined, { dns: ['203.0.113.53', '8.8.8.8'] })).code, 'dns');
  assert.equal(server.check(t, answer(undefined, { dns: [t.router] })).ok, false);
  assert.equal(server.check(fixture({ routerForwardsDns: true }), answer(undefined, { dns: [t.router, ...t.providerDns] })).ok, true);
  assert.equal(server.checkOptions(t, { gateway: '', dns: [] }).kind, 'info');
  assert.equal(server.check(t, answer(undefined, { dns: [] })).code, 'dns-syntax');
});

test('E2 client evidence comes from the answer; native bindings and wizard order are correct and pure', () => {
  const t = fixture(), a = answer([range(151, 199)], { dns: ['203.0.113.54', '203.0.113.53'] });
  const before = structuredClone({ t, a }), rows = server.clientCheck(t, a);
  assert.deepEqual(rows.map(r => r.value), ['192.168.88.151/24', t.router, a.dns.join(', ')]);
  assert.ok(rows.every(r => r.ok)); assert.deepEqual(server.clientCheck(t, answer([range(1, 3)])), []);
  const ios = server.nativeLines(t, a, 'cisco');
  assert.deepEqual(ios.slice(-4), ['ip dhcp pool LAN', 'network 192.168.88.0 255.255.255.0', 'default-router 192.168.88.1', 'dns-server 203.0.113.54 203.0.113.53']);
  assert.ok(ios.includes('ip dhcp excluded-address 192.168.88.1 192.168.88.150'));
  assert.match(server.nativeLines(t, a)[1], /interface=bridge1 address-pool=LAN/);
  assert.ok(server.nativeLines(t, a)[1].includes(`lease-time=${server.wizardFields(t).at(-1).value}`), 'native lease matches the given wizard field');
  assert.deepEqual(server.wizardFields(t).map(f => f.id), ['interface', 'addressSpace', 'gateway', 'ranges', 'dns', 'lease']);
  assert.deepEqual(server.wizardFields(t).filter(f => f.given).map(f => f.id), ['interface', 'addressSpace', 'lease']);
  assert.deepEqual({ t, a }, before);
});

test('E2 strip caption includes all pins; marker precedes band; Cisco shows its remaining pool', () => {
  const t = fixture(), a = answer();
  assert.equal(server.stripCaption(t, a), 'мережа .0–.255 · роутер .1 · принтер .250 · твій діапазон .100–.199');
  const partial = server.stripView(t, { ranges: [{ from: '192.168.88.100', to: '' }] });
  assert.equal(partial.marker, '192.168.88.100'); assert.deepEqual(partial.ranges, []);
  assert.deepEqual(server.stripView(t, a).ranges, [range(100, 199)]);
  const view = server.stripView(fixture({ level: 3, vendor: 'cisco' }), { exclusions: [range(200, 254)] });
  assert.equal(view.routerAutoExcluded, true); assert.deepEqual(view.ranges, [range(2, 199)]);
});

test('E2 every level/vendor/renumbered seed has capacity, a one-range solution and consistent addresses', () => {
  const prefixes = new Set(), forwards = new Set();
  for (let seed = 0; seed < 200; seed++) for (const level of [1, 2, 3]) for (const vendor of ['cisco', 'mikrotik']) for (const otherAddresses of [false, true]) {
    const args = { seed, level, vendor, otherAddresses }, t = server.generateScenario(args), a = server.referenceAnswer(t);
    assert.deepEqual(t, server.generateScenario(args));
    assert.equal(server.check(t, a).ok, true, JSON.stringify({ args, t, a }));
    assert.ok(!Object.hasOwn(t, 'answer')); assert.ok(t.statics.length >= 1 && t.statics.length <= 3);
    for (const ip of [t.router, ...t.statics.map(s => s.address)]) assert.equal(contains(t.network, t.prefix, ip), true);
    assert.equal(new Set([t.router, ...t.statics.map(s => s.address)]).size, t.statics.length + 1);
    if (level === 1) { assert.equal(t.prefix, 24); assert.equal(t.router.split('.').at(-1), '1'); assert.equal(t.routerForwardsDns, false); }
    else { prefixes.add(t.prefix); forwards.add(t.routerForwardsDns); assert.notEqual(t.router.split('.').at(-1), '1'); }
    if (a.ranges) assert.equal(a.ranges.length, 1); else assert.ok(a.exclusions.length <= 3);
    if (t.prefix === 27) assert.ok(t.clients < 30);
    const base = server.generateScenario({ seed, level, vendor });
    assert.equal(toInt(t.router) - toInt(t.network), toInt(base.router) - toInt(base.network));
    assert.deepEqual(t.statics.map(s => toInt(s.address) - toInt(t.network)), base.statics.map(s => toInt(s.address) - toInt(base.network)));
    assert.ok(server.nativeLines(t, a).length >= 3);
    assert.equal(server.clientCheck(t, a)[0].value, `${server.effectiveAllocation(t, a).firstAddress}/${t.prefix}`);
  }
  assert.deepEqual(prefixes, new Set([25, 26, 27])); assert.deepEqual(forwards, new Set([false, true]));
});

test('E2 non-/24 network/broadcast edges are semantic boundaries, not .0 and .255 conventions', () => {
  const t = fixture({ level: 2, network: '192.168.88.96', prefix: 27, router: '192.168.88.98', statics: [], clients: 1 });
  for (const [a, code, address] of [
    [answer([range(95, 95)]), 'outside', '192.168.88.95'],
    [answer([range(96, 97)]), 'boundary', '192.168.88.96'],
    [answer([range(126, 127)]), 'boundary', '192.168.88.127'],
    [answer([range(128, 128)]), 'outside', '192.168.88.128'],
  ]) {
    const result = server.checkAllocation(t, a); assert.equal(result.code, code); assert.equal(result.address, address);
  }
  assert.equal(server.checkAllocation(t, answer([range(97, 97)])).ok, true);
  assert.equal(server.checkAllocation(t, answer([range(126, 126)])).ok, true);
});

test('E2 effective sets agree with a small independent address-by-address oracle', () => {
  const t = fixture({ level: 3, vendor: 'cisco', network: '192.168.88.96', prefix: 27, router: '192.168.88.101', statics: [], clients: 1 });
  for (let seed = 0; seed < 128; seed++) {
    const intervals = [range(96 + seed % 12, 108 + seed % 15), range(100 + seed % 4, 113 + seed % 14)];
    for (const cisco of [false, true]) {
      const task = cisco ? t : { ...t, vendor: 'mikrotik' };
      const effective = server.effectiveAllocation(task, cisco ? { exclusions: intervals } : { ranges: intervals });
      const expected = [];
      for (let octet = 96; octet <= 127; octet++) {
        const covered = intervals.some(r => Number(r.from.split('.').at(-1)) <= octet && octet <= Number(r.to.split('.').at(-1)));
        if (cisco ? octet > 96 && octet < 127 && octet !== 101 && !covered : covered) expected.push(octet);
      }
      const actual = effective.ranges.flatMap(r => {
        const lo = Number(r.from.split('.').at(-1)), hi = Number(r.to.split('.').at(-1));
        return Array.from({ length: hi - lo + 1 }, (_, index) => lo + index);
      });
      assert.deepEqual(actual, expected); assert.equal(effective.count, expected.length);
    }
  }
});
