import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { validateBank } from '../src/banks/routing/validate.js';
import { validateNetwork } from '../src/engine/network.js';
import { lookup, routingTable, ping, trace } from '../src/engine/forward.js';
import routing from './helpers/routing.mjs';

const setup = (n, variantId) => {
  const task = routing.create(structuredClone(tasks[n - 1]), { variantId });
  return { task, net: task.network, routes: routing.solution(task) };
};
const failedObjective = (result, type) => result.evidence.objectives.find(o => o.params.type === type && !o.ok);

test('all variants declare probes, scenarios, coverage, final objectives and complete evidence', () => {
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const before = structuredClone(task);
    const result = routing.check(task, routing.solution(task));
    assert.equal(result.ok, true, `${record.id}/${variant.id}`);
    assert.ok(result.evidence.probes.every(p => p.ok && p.request.ok && p.reply.ok && p.scenarioId));
    assert.ok(result.evidence.scenarios.every(s => s.ok));
    assert.ok(result.evidence.objectives.every(o => o.severity !== 'blocks' || o.ok));
    assert.ok(variant.objectives.length > 0 && variant.objectives.every(o => !('draft' in o) && o.justification.length));
    assert.equal(result.evidence.probes.length, record.scenarios.reduce((n, s) => n + s.probeIds.length, 0));
    assert.equal(result.evidence.objectives.length, variant.objectives.length);
    assert.deepEqual(task, before);
  }
});

test('a missing request route reports no-route and the stop device', () => {
  const { task, routes } = setup(1);
  routes.R1 = [];
  const result = routing.check(task, routes);
  assert.equal(result.code, 'no-route');
  assert.equal(result.ok, false);
  assert.deepEqual(result.evidence.probes[0].request.stop, { code: 'no-route', deviceId: 'R1' });
  assert.equal(result.evidence.probes[0].reply, null);
});

test('specifics can be replaced by defaults unless an explicit form objective forbids it', () => {
  for (const [n, variantId] of [[1], [3, 'explicit-routes'], [4], [8, 'specific']]) {
    const { task, routes } = setup(n, variantId);
    // Replace a stub's entire list by one default to its sole neighbour.
    routes.R1 = [{ dst: '0.0.0.0', prefix: 0, via: routes.R1[0].via }];
    const result = routing.check(task, routes);
    assert.equal(result.ok, ![3, 8].includes(n), `${n}: ${JSON.stringify(result.findings)}`);
  }
});

test('coverage rejects host routes even when both sampled hosts answer', () => {
  const { task, net, routes } = setup(1);
  routes.R1[0] = { ...routes.R1[0], dst: '192.168.2.2', prefix: 32 };
  routes.R2[0] = { ...routes.R2[0], dst: '192.168.1.2', prefix: 32 };
  assert.equal(ping(net, routes, task.record.probes[0].from, task.record.probes[0].to).ok, true);
  const result = routing.check(task, routes);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'coverage-missing');
  const missing = failedObjective(result, 'coverage').params.missing;
  assert.deepEqual([...new Set(missing.map(m => `${m.direction}/${m.deviceId}`))], ['request/R1', 'reply/R2']);
  assert.equal(missing.reduce((sum, m) => sum + m.size, 0), 510);
});

test('coverage examines intermediate hops and reply hops, including internet replies', () => {
  const { task, routes } = setup(5);
  routes.R2.find(r => r.prefix === 24).dst = '172.20.0.2';
  routes.R2.find(r => r.dst === '172.20.0.2').prefix = 32;
  const result = routing.check(task, routes);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'coverage-missing');
  const missing = failedObjective(result, 'coverage').params.missing;
  assert.ok(missing.some(m => m.deviceId === 'R2' && m.direction === 'request'));
  assert.ok(missing.some(m => m.deviceId === 'R2' && m.direction === 'reply' && m.probeId === 'internet-3'));
});

test('a working host route can coexist with collective coverage and optional route ids', () => {
  const { task, routes } = setup(1);
  // Duplicate, empty and missing metadata must not bypass coverage assessment.
  for (const id of [routes.R1[0].id, '', undefined]) {
    routes.R1[1] = { id, dst: '192.168.2.2', prefix: 32, via: routes.R1[0].via };
    assert.equal(routing.check(task, routes).code, 'ok');
  }
});

test('selection retains backups, uses distance per prefix and longest prefix for packets', () => {
  const { net, routes } = setup(15);
  assert.equal(routingTable(net, routes, 'R1').filter(r => r.prefix === 0).length, 2);
  assert.equal(lookup(net, routes, 'R1', '203.0.113.1').via, '100.64.1.1');
  routes.R1.reverse();
  assert.equal(lookup(net, routes, 'R1', '203.0.113.1').via, '100.64.1.1');
  routes.R1.push({ id: 'specific', dst: '203.0.113.0', prefix: 24, via: '100.64.2.1', distance: 250 });
  assert.equal(lookup(net, routes, 'R1', '203.0.113.1').id, 'specific');
  routes.R1.push({ id: 'connected-tie', dst: '192.168.100.0', prefix: 24, via: '100.64.1.1', distance: 1 });
  assert.equal(lookup(net, routes, 'R1', '192.168.100.2').type, 'connected');
});

test('link-down removes connected and static routes on both ends and activates the backup', () => {
  const { net, routes } = setup(15);
  const options = { downLinks: ['segment-1'] };
  assert.ok(routingTable(net, routes, 'R1', options).every(r => r.segmentId !== 'segment-1'));
  assert.deepEqual(routingTable(net, routes, 'ISP1', options), []);
  assert.equal(lookup(net, routes, 'R1', '203.0.113.1', options).via, '100.64.2.1');
  const result = ping(net, routes, 'segment-3.host', 'internet', options);
  assert.equal(result.ok, true);
  assert.equal(result.request.hops.at(-1).deviceId, 'ISP2');
  assert.equal(result.reply.hops[0].deviceId, 'ISP2');
  assert.equal(trace(net, routes, 'R1.if3', 'ISP1.wan', { downLinks: ['segment-1', 'segment-2'] }).stop.code, 'no-route');
});

test('two active equal-distance next hops stop with unsupported-ecmp and their route IDs', () => {
  const { task, net, routes } = setup(15);
  routes.R1[1].distance = 1;
  const result = routing.check(task, routes);
  assert.equal(result.code, 'unsupported-ecmp');
  assert.deepEqual(result.evidence.probes[0].request.stop, { code: 'unsupported-ecmp', deviceId: 'R1', routeIds: ['R1.route1', 'R1.route2'] });
  assert.equal(lookup(net, routes, 'R1', '203.0.113.1').code, 'unsupported-ecmp');
  assert.equal(ping(net, routes, 'segment-3.host', 'internet', { downLinks: ['segment-1'] }).ok, true);
});

test('an identical next hop listed twice is not ECMP; an equal-distance inactive backup is harmless', () => {
  const { net, routes } = setup(15);
  routes.R1.push({ ...routes.R1[0], id: 'same-next-hop' });
  assert.equal(ping(net, routes, 'segment-3.host', 'internet').ok, true);
  routes.R1.push({ dst: '0.0.0.0', prefix: 0, via: '100.64.1.1', distance: 2 });
  assert.equal(ping(net, routes, 'segment-3.host', 'internet').ok, true);
});

test('invalid distances never become usable forwarding routes', () => {
  const { net, routes } = setup(1);
  for (const distance of [0, 255, 256, 1.5, '1', NaN]) {
    routes.R1[0].distance = distance;
    assert.equal(lookup(net, routes, 'R1', '192.168.2.2'), null);
  }
});

test('DHCP uses only the supplied default and its WAN goes down with the segment', () => {
  const { task, net, routes } = setup(2);
  const row = lookup(net, routes, 'R1', '203.0.113.1');
  assert.equal(row.id, 'dhcp:R1.if1');
  assert.equal(row.egressId, 'R1.if1');
  assert.equal(net.devices[0].interfaces[0].address, null);
  assert.equal(lookup(net, routes, 'R1', '203.0.113.1', { downLinks: ['segment-1'] }), null);
  const supplied = net.supplied;
  net.supplied = {};
  // A submission cannot invent an on-link DHCP address/gateway route.
  routes.R1.push({ dst: '0.0.0.0', prefix: 0, via: row.via });
  assert.equal(routing.check(task, routes).ok, false);
  assert.ok(validateNetwork(net).some(i => i.code === 'missing-dhcp-default'));
  net.supplied = supplied;
});

test('the ISP answers only its named internet boundary and replies through student routes', () => {
  const { task, net, routes } = setup(2);
  const before = ping(net, routes, 'segment-4.host', 'internet');
  assert.equal(before.ok, true);
  assert.deepEqual(before.request.hops.map(h => h.deviceId), ['R2', 'R1', 'ISP']);
  assert.deepEqual(before.reply.hops.map(h => h.deviceId), ['ISP', 'R1', 'R2']);
  routes.R1 = [];
  const after = routing.check(task, routes).evidence.probes.find(p => p.id === 'internet-2');
  assert.equal(after.request.ok, true);
  assert.equal(after.code, 'return-path-failed');
  assert.equal(after.reply.ok, false);
  assert.equal(after.reply.stop.code, 'loop');
  assert.deepEqual(after.reply.stop, { code: 'loop', deviceId: 'R1', nextDeviceId: 'ISP' });
  const outside = trace(net, routes, 'segment-4.host', '203.0.113.99');
  assert.equal(outside.ok, false);
  assert.equal(outside.stop.deviceId, 'ISP');
});

test('server and numbered WAN host segments deliver request and reply like LANs', () => {
  const { task, net, routes } = setup(12);
  const probe = task.record.probes.find(p => p.from === 'segment-3.host');
  assert.equal(ping(net, routes, probe.from, probe.to).ok, true);
  net.segments.find(s => s.id === 'segment-3').kind = 'wan';
  assert.equal(ping(net, routes, probe.from, probe.to).ok, true);
});

test('ISP2-only fails the normal path assertion even though its internet ping succeeds', () => {
  const { task, routes } = setup(15);
  routes.R1.shift();
  const result = routing.check(task, routes);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'wrong-path');
  assert.ok(result.evidence.probes.every(p => p.ok));
  const wrong = failedObjective(result, 'path-via');
  assert.equal(wrong.scenarioId, 'normal');
  assert.equal(wrong.code, 'wrong-path');
  assert.equal(result.evidence.scenarios.find(s => s.id === 'normal').ok, false);
  assert.equal(result.evidence.scenarios.find(s => s.id === 'isp1-down').ok, true);
});

test('without backup the normal path passes and the ISP1-down probe fails at R1', () => {
  const { task, routes } = setup(15);
  routes.R1.pop();
  const result = routing.check(task, routes);
  assert.equal(result.ok, false);
  assert.equal(result.evidence.scenarios.find(s => s.id === 'normal').ok, true);
  assert.equal(result.evidence.scenarios.find(s => s.id === 'isp1-down').ok, false);
  const failed = result.evidence.probes.find(p => p.scenarioId === 'isp1-down');
  assert.equal(failed.code, 'no-route');
  assert.deepEqual(failed.request.stop, { code: 'no-route', deviceId: 'R1' });
});

test('distance order allows any primary below backup, up to 254', () => {
  const { task, routes } = setup(15);
  routes.R1[1].distance = 254;
  assert.equal(routing.check(task, routes).ok, true);
  routes.R1[0].distance = 2;
  assert.equal(routing.check(task, routes).ok, true);
  routes.R1[0].distance = 255;
  assert.equal(failedObjective(routing.check(task, routes), 'distance-order').code, 'distance-order');
});

test('task 6 requires a summary instead of individually valid specifics', () => {
  const { task, routes } = setup(6);
  const route = routes.R1[0];
  routes.R1 = [{ ...route, prefix: 24 }, { ...route, id: 'second', dst: '10.10.1.0', prefix: 24 }];
  const result = routing.check(task, routes);
  assert.equal(result.ok, false);
  assert.equal(result.complete, false);
  assert.equal(result.code, 'objective-not-met');
  assert.equal(failedObjective(result, 'summary').params.reason, 'separate');
  assert.equal(failedObjective(result, 'summary').severity, 'blocks');
});

test('a required summary blocks individually correct specific routes', () => {
  const { task, routes } = setup(13);
  const route = routes.R1[0];
  routes.R1 = [0, 1, 2, 3].map(i => ({ ...route, id: `specific-${i}`, dst: `10.0.${i}.0`, prefix: 24 }));
  const result = routing.check(task, routes);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'objective-not-met');
  assert.equal(failedObjective(result, 'summary').id, 'summary-R1');
});

test('8b rejects a transit default that returns unknown traffic toward a stub', () => {
  const { task, routes } = setup(8, 'stub-defaults');
  // Pings alone pass; R1 defaults back to R2, so the transit default is unsafe.
  routes.R2.find(r => r.dst === '192.168.1.0').dst = '0.0.0.0';
  routes.R2.find(r => r.dst === '0.0.0.0').prefix = 0;
  const result = routing.check(task, routes);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'unknown-space-loops');
  assert.equal(failedObjective(result, 'no-default'), undefined);
});

test('default-on rejects a list of specifics that still makes every declared ping work', () => {
  const { task, routes } = setup(3, 'defaults');
  routes.R1 = routing.solution(routing.create(tasks[2], { variantId: 'explicit-routes' })).R1;
  const result = routing.check(task, routes);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'objective-not-met');
  assert.equal(failedObjective(result, 'default-on').id, 'default-on-R1');
});

test('task 10 rejects a longer working LAN path but permits transit alternatives', () => {
  const { task, routes } = setup(10);
  routes.R1.find(r => r.dst === '192.168.2.0').via = '10.2.0.2';
  const result = routing.check(task, routes);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'objective-not-met');
  assert.equal(failedObjective(result, 'direct-neighbour').id, 'direct-neighbour-R1');
});

test('task 16 has an exact summary and no hole demonstration', () => {
  const { task, routes } = setup(16);
  const result = routing.check(task, routes);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.evidence.demonstrations, []);
  assert.ok(result.evidence.safety.every(s => s.ok));
});

test('task 3 and 3b demonstrate safe drops', () => {
  for (const variant of ['defaults', 'explicit-routes']) {
    const { task, routes } = setup(3, variant);
    const result = routing.check(task, routes);
    assert.equal(result.ok, true);
    assert.equal(result.evidence.demonstrations[0].code, 'no-route');
  }
});

test('hop limits bound request and ISP reply walks', () => {
  const { net, routes } = setup(2);
  assert.equal(trace(net, routes, 'segment-4.host', 'internet', { hopLimit: 1 }).stop.code, 'ttl-exceeded');
  assert.equal(trace(net, routes, 'segment-4.host', 'internet', { hopLimit: 0 }).stop.code, 'ttl-exceeded');
  assert.equal(ping(net, routes, 'segment-4.host', 'internet', { hopLimit: 3 }).ok, true);
});

test('assessment uses submitted routes and explicit data without reading reference routes or scaffold', () => {
  const { task, routes } = setup(16);
  Object.defineProperty(task.variant, 'referenceRoutes', { get() { throw new Error('reference read'); } });
  Object.defineProperty(task.variant, 'scaffold', { get() { throw new Error('scaffold read'); } });
  assert.equal(routing.check(task, routes).ok, true);
});

test('bank validation catches malformed assessment data and missing DHCP defaults', () => {
  const bad = (mutate, code) => {
    const records = structuredClone(tasks);
    mutate(records);
    assert.ok(validateBank(records).some(i => i.code === code), code);
  };
  bad(r => { r[0].probes[0].from = 'missing'; }, 'invalid-probe');
  bad(r => { r[0].probes[0].coverage.to.prefix = 33; }, 'invalid-probe-coverage');
  bad(r => { r[0].scenarios[0].probeIds = ['missing']; }, 'invalid-scenario');
  bad(r => { r[14].scenarios[1].downLinks = ['missing']; }, 'invalid-scenario');
  bad(r => { r[0].variants[0].objectives[0].severity = 'error'; }, 'invalid-objective');
  bad(r => { r[0].variants[0].objectives[0].type = 'unknown'; }, 'invalid-objective');
  bad(r => { r[0].variants[0].objectives = []; }, 'missing-coverage-objective');
  bad(r => { r[12].variants[0].objectives[1].destinations[0].prefix = 33; }, 'invalid-objective-destinations');
  bad(r => { r[1].network.supplied = {}; }, 'missing-dhcp-default');
  bad(r => { r[2].demonstrations[0].from = 'missing'; }, 'invalid-demonstration');
});
