import test from 'node:test';
import assert from 'node:assert/strict';
import { createFault, referenceRepair, evaluate, checkRepair, checkCause, causesForLevel, evidence, repairFields, faultExample } from '../src/sections/dhcp/logic/faults.js';
import { acquire, routingTable, routeTo } from '../src/sections/dhcp/logic/client.js';
import { contains, fromInt, toInt } from '../src/engine/ip.js';
import { fault as words } from '../src/sections/dhcp/uk.js';

const vendors = ['cisco', 'mikrotik'];
const expected = { 'no-server': '0000', 'wrong-range': '0000', gateway: '1000', dns: '1110', exhausted: '0000', nat: '1100', route: '1100' };
const bits = result => result.rows.map(r => +r.ok).join('');
const ip = (task, n) => fromInt(toInt(task.network) + n);
const clone = x => structuredClone(x);

for (const vendor of vendors) for (const level of [1, 2, 3]) {
  for (const { id } of causesForLevel(level)) test(`E4 ${vendor} L${level} ${id}: rows, evidence, cause, repair and renumbering`, () => {
    for (const otherAddresses of [false, true]) for (let seed = 0; seed < 12; seed++) {
      const task = createFault(level, vendor, seed, { otherAddresses, faultId: id }), before = clone(task);
      const result = evaluate(task.config, task), lines = evidence(task);
      assert.equal(bits(result), expected[id]);
      assert.deepEqual(result.rows.map(r => r.id), ['address', 'gateway', 'remote', 'dns']);
      for (const row of result.rows) { assert.ok(row.explanation); assert.ok(row.highlight); }
      assert.deepEqual(lines.map(l => l.id), ['server', 'interface', 'allocation', 'gateway', 'dns', 'leases', ...(level > 1 ? ['nat', 'routes', 'router'] : [])]);
      assert.ok(lines.every(l => l.value && l.label));
      for (const c of causesForLevel(level)) assert.equal(checkCause(task, c.id).ok, c.id === id);
      assert.equal(checkCause(task, 'garbage').kind, 'info');
      assert.equal(checkRepair(task, task.config).ok, false);
      const repaired = checkRepair(task, referenceRepair(task));
      assert.equal(repaired.ok, true, repaired.code); assert.equal(bits(repaired), '1111');
      assert.deepEqual(task, before, 'evaluation does not mutate the task or broken config');
      if (otherAddresses) assert.notEqual(task.network, '192.168.88.0');
      if (id === 'exhausted') {
        assert.equal(task.task, 'ПК2 не має мережі.'); assert.equal(result.clientId, 'pc2');
        assert.equal(evaluate(task.config, task, { clientId: 'pc1' }).ok, true);
        assert.equal(lines.find(l => l.id === 'leases').allocationCount, 3);
        assert.equal(task.leases.length, 3); assert.match(lines.find(l => l.id === 'leases').value, /ПК2: немає оренди/);
      } else assert.equal(task.task, 'ПК1 не має мережі.');
      if (id === 'nat' || id === 'route') assert.equal(result.router.ok, id === 'nat');
      assert.equal(result.router.source, task.topology.wan);
      if (id === 'route') assert.ok(result.router.routes.every(r => r.source === 'connected'));
      if (id === 'no-server' && vendor === 'mikrotik') assert.match(lines.find(l => l.id === 'interface').value, /порти bridge: ether2/);
      if (id === 'gateway') assert.equal(result.rows[1].value, result.lease.gateway ?? words.none);
      if (id === 'dns') assert.ok(lines.find(l => l.id === 'dns').value.includes(task.config.dhcp.dns[0] ?? words.none));
      if (id === 'wrong-range') {
        assert.equal(result.lease.acquired, vendor === 'mikrotik');
        if (vendor === 'cisco') assert.equal(result.lease.reason, 'no-pool');
        else {
          assert.equal(contains(task.network, task.prefix, result.lease.address), false);
          assert.equal(result.lease.reason, 'unmatched-network');
          assert.equal(result.lease.gateway, null); assert.deepEqual(result.lease.dns, []);
          assert.equal(result.lease.prefix, null, 'manual does not specify an unmatched netmask');
          assert.equal(task.config.dhcp.network, task.network);
          assert.equal(task.config.dhcp.gateway, task.router);
          assert.deepEqual(task.config.dhcp.dns, [task.providerDns[0]]);
        }
      }
    }
  });
  test(`E4 ${vendor} L${level}: uniform form and fixed causes`, () => {
    const tasks = causesForLevel(level).map(c => createFault(level, vendor, 4, { faultId: c.id }));
    const shape = task => repairFields(task).map(({ id, path, type, options, native, group }) => ({ id, path, type, options, native, group }));
    for (const task of tasks) assert.deepEqual(shape(task), shape(tasks[0]));
    const fields = repairFields(tasks[0]), ids = fields.map(f => f.id);
    for (const id of ['enabled', 'interface', 'gateway', 'dns']) assert.ok(ids.includes(id));
    if (vendor === 'cisco') for (const id of ['poolNetwork', 'poolPrefix', level === 3 ? 'exclusions' : 'ranges']) assert.ok(ids.includes(id));
    if (level > 1) for (const id of ['natEnabled', 'dhcpDefault', 'staticDefault', ...(vendor === 'cisco' ? ['acl', 'roles'] : ['outInterface'])]) assert.ok(ids.includes(id));
    assert.equal(causesForLevel(level).length, level === 1 ? 4 : 7);
    assert.equal(fields.every(f => !!f.native), level === 3);
    const initial = tasks[0].config.dhcp.enabled; fields[0].value = 'mutated'; assert.equal(tasks[0].config.dhcp.enabled, initial);
  });
}

test('E4 RouterOS model assumption (matching-network rule; not a device capture): wrong /ip pool is leased without the LAN network options', () => {
  // https://manual.mikrotik.com/docs/network-management/dhcp/server/#network
  // Pool provides the address; only a matching network supplies its options.
  const t = createFault(1, 'routeros', 1, { faultId: 'wrong-range' });
  assert.deepEqual(acquire(t.config, t), { acquired: true, address: '192.168.89.150', prefix: null, gateway: null, dns: [], reason: 'unmatched-network' });
  const c = clone(t.config); c.dhcp.network = '192.168.89.0';
  assert.equal(acquire(c, t).gateway, t.router);
  assert.deepEqual(acquire(c, t).dns, [t.providerDns[0]]);
  assert.equal(evaluate(c, t).ok, false, 'options alone do not fix the wrong address');
});

test('E4 IOS selects pool by receiving interface subnet, not server interface name alone', () => {
  const t = createFault(1, 'cisco', 1), c = referenceRepair(t);
  c.dhcp.poolNetwork = t.router; assert.equal(evaluate(c, t).ok, true, 'network host bits canonicalize');
  c.dhcp.poolNetwork = '192.168.89.0'; assert.equal(acquire(c, t).reason, 'no-pool');
  c.dhcp.poolNetwork = t.network; c.dhcp.interface = t.topology.ports.cisco.wan;
  assert.equal(acquire(c, t).reason, 'no-server');
});

test('E4 equivalent safe ranges, DNS, ACL decompositions and static/DHCP defaults pass', () => {
  for (const v of vendors) for (const level of [1, 2, 3]) {
    const t = createFault(level, v, 8), c = referenceRepair(t);
    c.dhcp.ranges = [{ from: ip(t, 60), to: ip(t, 69) }, { from: ip(t, 80), to: ip(t, 99) }];
    c.dhcp.dns = [t.providerDns[1], t.providerDns[0]];
    if (level === 3 && v === 'cisco') c.dhcp.exclusions = [{ from: ip(t, 2), to: ip(t, 59) }, { from: ip(t, 100), to: ip(t, 254) }, { from: ip(t, 20), to: '' }];
    if (v === 'cisco') c.nat.acl = [0, 128].map(n => ({ network: ip(t, n), wildcard: '0.0.0.127' }));
    c.routing.dhcpDefault = true; c.routing.staticDefault = '';
    assert.equal(checkRepair(t, c).ok, true);
    c.routing.dhcpDefault = false; c.routing.staticDefault = t.topology.ispGateway;
    assert.equal(checkRepair(t, c).ok, true);
  }
});

test('E4 rejects a working single client with insufficient capacity or unsafe future leases/NAT', () => {
  for (const v of vendors) for (const level of [1, 2, 3]) {
    const t = createFault(level, v, 5), c = referenceRepair(t);
    const range = (from, to) => {
      c.dhcp.ranges = [{ from: ip(t, from), to: ip(t, to) }];
      c.dhcp.exclusions = [{ from: ip(t, 2), to: ip(t, from - 1) }, { from: ip(t, to + 1), to: ip(t, 254) }];
    };
    range(50, 50); assert.equal(evaluate(c, t).ok, true); assert.equal(checkRepair(t, c).code, 'capacity');
    range(10, 30); assert.equal(evaluate(c, t).ok, true); assert.equal(checkRepair(t, c).code, 'static');
    if (!(v === 'cisco' && level === 3)) { range(50, 255); assert.equal(evaluate(c, t).ok, true); assert.equal(checkRepair(t, c).code, 'boundary'); }
    const broad = referenceRepair(t);
    if (v === 'cisco') {
      broad.nat.acl = [{ network: '0.0.0.0', wildcard: '255.255.255.255' }];
      assert.equal(evaluate(broad, t).ok, true); assert.equal(checkRepair(t, broad).code, 'safety');
      broad.nat.acl = [{ network: ip(t, 50), wildcard: '0.0.0.0' }];
      assert.equal(evaluate(broad, t).ok, true); assert.equal(checkRepair(t, broad).code, 'safety');
    }
  }
});

test('E4 routing uses longest prefix, active routes, source and WAN next hop for each probe', () => {
  for (const v of vendors) {
    const t = createFault(2, v, 0, { faultId: 'route' }), c = referenceRepair(t);
    c.routing.staticDefault = ''; c.routing.dhcpDefault = false;
    assert.equal(evaluate(c, t).router.ok, false);
    c.routing.dhcpDefault = true; assert.equal(evaluate(c, t).router.ok, true, 'WAN DHCP survives a deleted static default');
    c.routing.dhcpDefault = false;
    const route = destination => ({ network: destination, prefix: 32, gateway: t.topology.ispGateway, interface: t.topology.ports[v].wan, source: 'dhcp', active: true });
    c.routing.routes = [route(t.remoteIp)];
    assert.equal(bits(evaluate(c, t)), '1110', 'remote route alone does not reach remote DNS');
    c.routing.routes.push(route(t.providerDns[0]));
    assert.equal(checkRepair(t, c).ok, true, 'equivalent specific routes work without default');
    c.routing.routes[0].active = false; assert.equal(evaluate(c, t).router.ok, false);
    c.routing.routes[0].active = true; c.routing.routes[0].gateway = ip(t, 254);
    assert.equal(evaluate(c, t).router.ok, false);
    c.routing.dhcpDefault = true;
    assert.equal(evaluate(c, t).router.ok, false, 'bad more-specific route wins over default');
    assert.equal(routeTo(c, t, t.remoteIp).prefix, 32);
    assert.ok(routingTable(c, t).some(r => r.source === 'dhcp' && r.prefix === 0));
    c.nat.enabled = false; c.routing.routes = []; assert.equal(evaluate(c, t).router.ok, true, 'WAN-source probe needs no LAN NAT');
  }
});

test('E4 acquisition retries, retains own occupied address and never allocates another active lease', () => {
  for (const v of vendors) for (const level of [2, 3]) {
    const t = createFault(level, v, 0, { faultId: 'exhausted' });
    assert.equal(acquire(t.config, t, 'pc1').address, ip(t, 50));
    const repaired = referenceRepair(t);
    assert.equal(acquire(repaired, t).address, ip(t, 53));
    assert.equal(checkRepair(t, repaired).ok, true);
    const before = JSON.stringify(t); checkRepair(t, repaired); assert.equal(JSON.stringify(t), before);
    repaired.dhcp.gateway = ''; assert.equal(bits(evaluate(repaired, t)), '1000');
  }
});

test('E4 malformed editable fields return failures without changing the frozen task', () => {
  for (const v of vendors) {
    const t = createFault(2, v, 3);
    for (const change of [c => c.dhcp.ranges = 'bad', c => c.dhcp.gateway = 'invalid', c => c.dhcp.dns = ['bad'], c => c.nat.acl = [{network:'bad', wildcard:'bad'}], c => c.routing.staticDefault = 'bad']) {
      const c = referenceRepair(t); change(c);
      assert.doesNotThrow(() => checkRepair(t, c));
    }
  }
});

test('E4 deterministic generation covers every cause and fault variant without answer fields', () => {
  for (const v of vendors) for (const level of [1, 2, 3]) {
    const seen = new Set(), variants = new Set();
    for (let seed = 0; seed < 240; seed++) {
      const t = createFault(level, v, seed); seen.add(t.faultId);
      assert.deepEqual(t, createFault(level, v, seed));
      assert.equal('answer' in t, false); assert.equal('reference' in t, false);
      if (t.faultId === 'nat') variants.add(JSON.stringify(t.config.nat));
    }
    assert.equal(seen.size, level === 1 ? 4 : 7);
    if (level > 1) assert.ok(variants.size >= (v === 'cisco' ? 3 : 2));
  }
});

test('E4 R4 examples solve their own instance, stay separate and cannot repair learner tasks', () => {
  for (const vendor of vendors) for (const level of [1, 2, 3]) {
    const e = faultExample({ level, vendor });
    assert.equal(bits(e.before), '1110'); assert.equal(e.after.ok, true);
    assert.equal(checkCause(e.task, e.cause).ok, true);
    assert.equal(e.task.network, '192.0.2.0');
    assert.equal(e.task.topology.wan, '198.51.100.2');
    for (let seed = 0; seed < 30; seed++) for (const otherAddresses of [false, true]) {
      const t = createFault(level, vendor, seed, { otherAddresses });
      assert.equal(checkRepair(t, e.answer).ok, false);
    }
    e.answer.dhcp.dns = ['bad']; assert.equal(faultExample({ level, vendor }).after.ok, true);
  }
});

test('E4: a self-assigned address lies in 169.254.1.0–169.254.254.255 (RFC 3927 §2.1 reserves the first and last /24)', () => {
  for (const vendor of ['cisco', 'mikrotik']) {
    const task = createFault(1, vendor, 0, { faultId: 'no-server' });
    const { address, prefix } = evaluate(task.config, task).lease;
    assert.equal(prefix, 16, vendor);
    const [a, b, c] = address.split('.').map(Number);
    assert.ok(a === 169 && b === 254 && c >= 1 && c <= 254, `${vendor}: ${address}`);
  }
});
