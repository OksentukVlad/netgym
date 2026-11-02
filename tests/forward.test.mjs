import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing from './helpers/routing.mjs';
import { lookup, ping, routingTable, trace } from '../src/engine/forward.js';

for (const record of tasks) for (const variant of record.variants) {
  const n = record.displayNumber;
  test(`routing check task ${n}/${variant.id}: reference and reordered routes pass request/reply probes`, () => {
    const task = routing.create(record, { variantId: variant.id });
    const reference = routing.solution(task);
    const original = structuredClone(reference);
    const result = routing.check(task, reference);
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    for (const probe of result.evidence.probes) {
      assert.equal(probe.request.ok, true);
      assert.equal(probe.reply.ok, true);
    }
    const reordered = Object.fromEntries(Object.entries(reference).reverse().map(([id, rows]) => [id, [...rows].reverse()]));
    assert.equal(routing.check(task, reordered).ok, true);
    assert.deepEqual(reference, original);
  });
}

test('routing check explicitly rejects a record without declared probes', () => {
  const record = structuredClone(tasks[0]);
  record.probes = [];
  const task = routing.create(record);
  assert.deepEqual(routing.check(task, {}), { ok: false, complete: false, code: 'unsupported', findings: [{ code: 'unsupported', severity: 'blocks' }] });
});

for (const [router, gateway] of [['R1', '10.2.0.2'], ['R2', '10.3.0.2'], ['R3', '10.3.0.1']]) {
  test(`task 10 ${router}: alternative passes its transit probe; deletion or corruption fails it`, () => {
    const task = routing.create(tasks[9]);
    const reference = routing.solution(task);
    const route = reference[router][1];
    const alternative = structuredClone(reference);
    alternative[router][1].via = gateway;
    const result = routing.check(task, alternative);
    assert.equal(result.ok, true);
    const probe = result.evidence.probes.find(p => p.id === `transit-${router}`);
    assert.equal(probe.ok, true);
    assert.equal(probe.request.hops[0].nextHop, gateway);
    assert.equal(probe.request.hops[0].routeId, route.id);
    for (const change of ['delete', 'corrupt']) {
      const broken = structuredClone(reference);
      if (change === 'delete') broken[router].splice(1, 1);
      else broken[router][1].via = '203.0.113.254';
      const failed = routing.check(task, broken).evidence.probes.find(p => p.id === `transit-${router}`);
      assert.equal(failed.ok, false);
      assert.equal(failed.code, 'no-route');
    }
  });
}

test('routing check requires a return path and reports its failed reply trace', () => {
  const task = routing.create(tasks[0]);
  const routes = routing.solution(task);
  routes.R2 = [];
  const result = routing.check(task, routes);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'return-path-failed');
  const probe = result.evidence.probes[0];
  assert.equal(probe.request.ok, true);
  assert.equal(probe.reply.ok, false);
  assert.equal(probe.reply.stop.code, 'no-route');
});

test('routing check reports a loop with the closing edge in its trace', () => {
  const task = routing.create(tasks[3]);
  const routes = routing.solution(task);
  routes.R2.find(r => r.dst === '192.168.3.0').via = '10.0.0.1';
  const result = routing.check(task, routes);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'loop');
  const failed = result.evidence.probes.find(p => p.code === 'loop');
  assert.deepEqual(failed.request.hops.map(h => h.deviceId), ['R1', 'R2']);
  assert.deepEqual(failed.request.stop, { code: 'loop', deviceId: 'R2', nextDeviceId: 'R1' });
});

test('forwarding: connected ties, longest prefixes, multiple LANs and the hop limit', () => {
  const record = tasks[2], net = record.network;
  const task = routing.create(record, { variantId: 'defaults' });
  const routes = routing.solution(task);
  assert.equal(routingTable(net, routes, 'R1').filter(r => r.type === 'connected').length, 3);
  assert.equal(lookup(net, routes, 'R1', '10.2.0.2').type, 'connected');
  routes.R1.push({ id: 'redundant', dst: '10.2.0.0', prefix: 24, via: '192.168.0.2' });
  assert.equal(lookup(net, routes, 'R1', '10.2.0.2').type, 'connected');
  routes.R1.push({ id: 'specific', dst: '10.3.0.2', prefix: 32, via: '192.168.0.2' });
  assert.equal(lookup(net, routes, 'R1', '10.3.0.2').id, 'specific');
  const from = net.endpoints[0].id, to = net.endpoints[2].id;
  assert.equal(ping(net, routes, from, to).ok, true);
  assert.equal(trace(net, routes, from, to, { hopLimit: 1 }).stop.code, 'ttl-exceeded');
  assert.equal(trace(net, routes, from, '203.0.113.1').stop.code, 'no-route');
  // Reciprocal defaults remain a deliberately unsafe forwarding fixture.
  routes.R2 = [{ dst: '0.0.0.0', prefix: 0, via: '192.168.0.1' }];
  assert.equal(trace(net, routes, from, '203.0.113.1').stop.code, 'loop');
  assert.equal(lookup(net, routes, 'missing', '10.2.0.2'), null);
  assert.equal(trace(net, routes, 'missing', to).stop.code, 'no-device');
});

test('forwarding: unknown next hop fails; explicit ISP peers answer internet pings', () => {
  const task = routing.create(tasks[0]);
  const routes = routing.solution(task);
  routes.R1[0].via = '10.0.0.3'; // Broadcast is not a gateway.
  assert.equal(routing.check(task, routes).code, 'no-route');
  routes.R1[0].via = '192.168.1.9'; // On-link host address without a modeled device.
  assert.equal(routing.check(task, routes).code, 'no-device');
  const net = tasks[14].network;
  assert.equal(routingTable(net, {}, 'ISP1')[0].type, 'connected');
  assert.equal(ping(net, tasks[14].variants[0].referenceRoutes, 'segment-3.host', 'internet').ok, true);
});
