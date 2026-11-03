// E2's native output, rebuilt independently (logic review, Astra's open
// suggestion): fixed /25–/27 tasks, not generated ones. From the lines the
// screen shows («так це виглядає в налаштуваннях»), the pool is rebuilt
// address by address the way each vendor would give it out:
//   - Cisco: every usable host of the `network` line's subnet, minus each
//     `ip dhcp excluded-address A [B]` line, minus the interface address
//     (IOS excludes it on its own);
//   - RouterOS: the `/ip pool add … ranges=` list.
// The rebuilt set must equal the checker's effective allocation (and the
// gateway and DNS the lines carry must be the checked ones), for neutral
// answers (L1–L2: one or two ranges) and Cisco L3's own exclusion rows
// (singleton, overlapping, out of the subnet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromInt, toInt } from '../src/engine/ip.js';
import * as server from '../src/sections/dhcp/logic/server.js';

const device = (id, name, genitive, address) => ({ id, name, genitive, address });
const task = overrides => ({
  id: 'dhcp-server', seed: 0, vendor: 'cisco', otherAddresses: false, clients: 10,
  providerDns: ['203.0.113.53', '203.0.113.54'], routerForwardsDns: false, interface: 'bridge1', lease: '10m', ...overrides,
});
const FIXTURES = [
  {
    name: '/25, router not at .1, a device in the middle, one range on the bigger side',
    task: task({ level: 2, network: '10.20.30.128', prefix: 25, router: '10.20.30.130',
      statics: [device('printer', 'принтер', 'принтера', '10.20.30.192'), device('server', 'сервер', 'сервера', '10.20.30.129')], clients: 40 }),
    answer: { ranges: [{ from: '10.20.30.131', to: '10.20.30.191' }], gateway: '10.20.30.130', dns: ['203.0.113.54'] },
  },
  {
    name: '/26, two ranges around the device, the router answering DNS',
    task: task({ level: 2, network: '172.16.5.64', prefix: 26, router: '172.16.5.67', routerForwardsDns: true,
      statics: [device('printer', 'принтер', 'принтера', '172.16.5.96'), device('camera', 'камера', 'камери', '172.16.5.126')], clients: 30 }),
    answer: { ranges: [{ from: '172.16.5.68', to: '172.16.5.95' }, { from: '172.16.5.97', to: '172.16.5.125' }], gateway: '172.16.5.67', dns: ['172.16.5.67', '203.0.113.53'] },
  },
  {
    name: '/27, a range that touches the device from below',
    task: task({ level: 2, network: '192.168.89.224', prefix: 27, router: '192.168.89.226',
      statics: [device('printer', 'принтер', 'принтера', '192.168.89.240')], clients: 12 }),
    answer: { ranges: [{ from: '192.168.89.227', to: '192.168.89.239' }], gateway: '192.168.89.226', dns: ['203.0.113.53', '203.0.113.54'] },
  },
  {
    name: '/26 Cisco L3: singleton, overlapping and out-of-subnet exclusions; the interface left to IOS',
    task: task({ level: 3, network: '10.1.2.0', prefix: 26, router: '10.1.2.3',
      statics: [device('printer', 'принтер', 'принтера', '10.1.2.32'), device('server', 'сервер', 'сервера', '10.1.2.1'), device('camera', 'камера', 'камери', '10.1.2.62')], clients: 20 }),
    answer: {
      exclusions: [{ from: '10.1.2.1', to: '10.1.2.2' }, { from: '10.1.2.30', to: '10.1.2.40' }, { from: '10.1.2.32', to: '' }, { from: '10.1.2.62', to: '' }, { from: '10.9.9.9', to: '' }],
      gateway: '10.1.2.3', dns: ['203.0.113.53'],
    },
  },
  {
    name: '/27 Cisco L3: one exclusion row for the whole low side',
    task: task({ level: 3, network: '192.168.88.32', prefix: 27, router: '192.168.88.34',
      statics: [device('printer', 'принтер', 'принтера', '192.168.88.48')], clients: 12 }),
    answer: { exclusions: [{ from: '192.168.88.33', to: '192.168.88.48' }], gateway: '192.168.88.34', dns: ['203.0.113.54'] },
  },
];

const span = (from, to) => Array.from({ length: toInt(to) - toInt(from) + 1 }, (_, i) => toInt(from) + i);
const maskBits = mask => toInt(mask).toString(2).replace(/0+$/, '').length;
/** The checker's effective allocation as a sorted list of addresses. */
const effective = (t, a) => server.check(t, a).ranges.flatMap(r => span(r.from, r.to));

/** IOS: the usable hosts of the pool's network, minus every exclusion and the interface address. */
function ciscoPool(lines, t) {
  const net = lines.map(l => /^network (\S+) (\S+)$/.exec(l)).find(Boolean);
  assert.ok(net, 'a network line');
  const size = 2 ** (32 - maskBits(net[2]));
  const excluded = new Set([toInt(t.router)]);
  for (const line of lines) {
    const m = /^ip dhcp excluded-address (\S+)(?: (\S+))?$/.exec(line);
    if (m) for (const n of span(m[1], m[2] ?? m[1])) excluded.add(n);
  }
  return span(fromInt(toInt(net[1]) + 1), fromInt(toInt(net[1]) + size - 2)).filter(n => !excluded.has(n));
}

/** RouterOS: the pool's ranges= list. */
function routerOsPool(lines) {
  const m = lines.map(l => /^\/ip pool add name=LAN ranges=(\S+)$/.exec(l)).find(Boolean);
  assert.ok(m, 'a pool line');
  return m[1].split(',').flatMap(part => { const [from, to = from] = part.split('-'); return span(from, to); });
}

test('E2 native output: the Cisco and RouterOS lines give out exactly the checked addresses (/25–/27 fixtures)', () => {
  for (const { name, task: t, answer: a } of FIXTURES) {
    const result = server.check(t, a);
    assert.equal(result.ok, true, `${name}: the fixture passes (${result.code}: ${result.text})`);
    const expected = effective(t, a);
    assert.ok(expected.length >= t.clients, `${name}: enough addresses`);
    const vendors = t.level === 3 ? ['cisco'] : ['cisco', 'mikrotik'];
    for (const vendor of vendors) {
      const lines = server.nativeLines(t, a, vendor);
      const pool = vendor === 'cisco' ? ciscoPool(lines, t) : routerOsPool(lines);
      assert.deepEqual([...pool].sort((x, y) => x - y), expected, `${name} (${vendor}): the pool the lines give out`);
      for (const ip of [t.router, ...t.statics.map(s => s.address), t.network]) assert.ok(!pool.includes(toInt(ip)), `${name} (${vendor}): ${ip} is not given out`);
      const gateway = vendor === 'cisco' ? lines.find(l => l.startsWith('default-router ')).split(' ')[1]
        : /gateway=(\S+)/.exec(lines.at(-1))[1];
      const dns = vendor === 'cisco' ? lines.find(l => l.startsWith('dns-server ')).split(' ').slice(1)
        : /dns-server=(\S+)/.exec(lines.at(-1))[1].split(',');
      assert.equal(gateway, a.gateway, `${name} (${vendor}): gateway`);
      assert.deepEqual(dns, a.dns, `${name} (${vendor}): DNS`);
      if (vendor === 'mikrotik') assert.match(lines.at(-1), new RegExp(`address=${t.network}/${t.prefix} `), `${name}: the DHCP network`);
      else assert.ok(lines.includes(`network ${t.network} ${fromInt(2 ** 32 - 2 ** (32 - t.prefix))}`), `${name}: the pool's network line`);
    }
  }
});

test('E2 native output: Cisco L3 keeps the learner\'s own exclusion rows, as typed (one address without «до»)', () => {
  const { task: t, answer: a } = FIXTURES[3];
  const lines = server.nativeLines(t, a, 'cisco');
  assert.deepEqual(lines.filter(l => l.startsWith('ip dhcp excluded-address')), server.exclusionLines(a.exclusions));
  assert.ok(lines.includes('ip dhcp excluded-address 10.1.2.32'), 'a singleton row renders the one-address form');
  assert.deepEqual(server.exclusionLines([{ from: '10.1.2.1', to: 'x' }]), [], 'no command while a row does not parse');
});
