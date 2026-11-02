// The routing bank against the round 1 apps' frozen data (step 8: the apps
// are retired; their topology, titles and commands were captured into
// fixtures first, and grading into routing-grading-34ee9ac.json, replayed by
// routing-grading-replay.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import tasks from '../src/banks/routing/tasks.js';
import { validateBank } from '../src/banks/routing/validate.js';
import { contains } from '../src/engine/ip.js';
import { validateNetwork } from '../src/engine/network.js';
import * as cv from '../src/engine/vendors/cisco.js';
import * as mv from '../src/engine/vendors/routeros.js';
import routing, { textFor } from './helpers/routing.mjs';
import { topology } from '../src/sections/routing/logic/topology.js';
import { diagramGeometry } from '../src/ui/topology/geometry.js';

// The frozen round 1 data cover tasks 1–16; task 17 (OPT-1a) is new.
const legacyTasks = tasks.filter(record => record.displayNumber <= 16);
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const legacy = fixture('routing-legacy-34ee9ac.json');

test('frozen round 1 data: the legacy fixture is byte for byte the one captured before the apps were deleted', () => {
  const bytes = readFileSync(new URL('./fixtures/routing-legacy-34ee9ac.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ff35d7058488f27685721fdfea0513cbce98e9043e6623c42fb6e5462fb69834');
});
const grading = fixture('routing-grading-34ee9ac.json');

test('bank: all 17 records and 19 variants validate, including DHCP and ISP data', () => {
  assert.equal(tasks.length, 17);
  assert.equal(tasks.flatMap(r => r.variants).length, 19);
  assert.deepEqual(validateBank(tasks), []);
  const t15 = tasks[14].network;
  assert.deepEqual(t15.devices.filter(d => d.kind === 'isp').map(d => d.interfaces[0].address), [{ ip: '100.64.1.1', prefix: 30 }, { ip: '100.64.2.1', prefix: 30 }]);
  for (const record of tasks) for (const device of record.network.devices) for (const iface of device.interfaces) if (iface.dhcp) {
    assert.equal(iface.address, null);
    assert.equal(record.network.segments.find(s => s.id === iface.segmentId).kind, 'wan');
  }
});

test('bank validation catches broken IDs, references, addresses, overlaps and commands', () => {
  const bad = mutate => { const copy = structuredClone(tasks); mutate(copy); assert.ok(validateBank(copy).length); };
  bad(r => { r[1].id = r[0].id; });
  bad(r => { r[2].variants[1].id = r[2].variants[0].id; });
  bad(r => { r[1].variants[0].code = '1'; });
  bad(r => { r[0].network.devices[0].interfaces[0].segmentId = 'absent'; });
  bad(r => { r[0].network.devices[0].interfaces[0].address.ip = '999.1.1.1'; });
  bad(r => { r[0].network.devices[1].interfaces[1].address.ip = '192.168.1.4'; });
  bad(r => { r[0].variants[0].referenceRoutes.R1[0].via = '10.0.0.02'; });
  bad(r => { delete r[0].variants[0].scaffold.R1[0].dest; });
  bad(r => { r[0].variants[0].scaffold.R1[0].dest.segments = ['absent']; });
  bad(r => { r[0].variants[0].scaffold.R1[0].dest.kind = 'default'; });
  bad(r => { r[0].variants[0].scaffold.R1[0].role = 'primary'; });
  bad(r => { delete r[14].variants[0].scaffold.R1[0].role; });
  assert.ok(validateNetwork(null).length);
});

for (const [syntax, vendor] of [['cisco', cv], ['routeros', mv]]) {
  test(`${syntax}: topology, interface labels, notes and titles match the frozen round 1 app; geometry matches all 16 tasks`, () => {
    let labels = 0;
    for (const record of legacyTasks) {
      const original = legacy.topologies.find(row => row.syntax === syntax && row.task === record.id);
      const actual = topology(record.network, syntax);
      assert.deepEqual(actual.routers, original.routers, record.id);
      for (const device of record.network.devices.filter(d => d.kind === 'router')) {
        for (const [i, iface] of device.interfaces.entries()) {
          assert.equal(vendor.interfaceLabel(iface), original.routers[device.id].interfaces[i].name);
          labels++;
        }
      }
      const geometry = diagramGeometry(actual, actual);
      const snapshot = fixture('diagram-geometry-sha256.json').rows.find(row => row.syntax === syntax && row.task === record.displayNumber);
      assert.equal(createHash('sha256').update(JSON.stringify(geometry)).digest('hex'), snapshot.sha256, `${record.id} step 2 snapshot`);
      assert.equal(textFor(record.title, syntax), record.displayNumber === 3 && syntax === 'cisco' ? 'Тупіковий роутер — default в один бік' : original.title);
      // A2 changes task 3's title; A3/A4 only re-key task 15/16 address data.
    }
    assert.equal(labels, 128);
  });

  test(`${syntax}: scaffold order and field requirements match every frozen row; metadata identifies destinations`, () => {
    for (const record of legacyTasks) for (const variant of record.variants) {
      const task = routing.create(record, { variantId: variant.id });
      const scaffold = routing.scaffold(task, syntax);
      const expected = {};
      for (const row of grading.scaffoldLabels.filter(r => r.syntax === syntax && r.task === record.id && r.variant === variant.id)) {
        (expected[row.router] ??= [])[row.index] = { label: row.label, fields: row.fields, needDist: row.needDist };
      }
      assert.deepEqual(Object.fromEntries(Object.entries(scaffold).map(([router, list]) => [router, list.map(({ label, fields, needDist }) => ({ label, fields, needDist }))])), expected, `${record.id}/${variant.id}`);
      for (const [router, list] of Object.entries(scaffold)) for (const [index, row] of list.entries()) {
        const route = variant.referenceRoutes[router][index];
        assert.deepEqual(row.fields, [...(syntax === 'cisco' ? ['net', 'mask', 'gw'] : ['dst', 'gw']), ...(row.needDist ? ['dist'] : [])]);
        assert.ok(['lan', 'link', 'summary', 'default'].includes(row.dest.kind));
        assert.equal(row.dest.kind === 'default', route.prefix === 0);
        for (const id of row.dest.segments) {
          const segment = record.network.segments.find(s => s.id === id);
          assert.ok(segment);
          const addresses = record.network.devices.flatMap(d => d.interfaces.filter(i => i.segmentId === id && i.address).map(i => i.address));
          assert.ok(addresses.length > 0 && addresses.every(a => a.prefix >= route.prefix && contains(route.dst, route.prefix, a.ip)), 'metadata names precisely the covered segments');
          if (row.dest.kind !== 'summary') assert.equal(segment.kind, row.dest.kind);
        }
        assert.notEqual(row.dest, variant.scaffold[router][index].dest, 'scaffold copies metadata');
        if (record.displayNumber === 15) assert.equal(row.role, route.distance > 1 ? 'backup' : 'primary');
        else assert.equal(row.role, undefined);
      }
      assert.equal(routing.hints(task, null, syntax).length, 3);
    }
  });
}

test('RouterOS: bank reproduces all 108 frozen fixture commands byte for byte', () => {
  const actual = [];
  for (const record of legacyTasks) for (const variant of record.variants.filter(v => !['defaults', 'stub-defaults'].includes(v.id))) {
    for (const [router, rows] of Object.entries(variant.referenceRoutes)) for (const route of rows) actual.push({ task: record.displayNumber, variant: variant.id, router, dst: `${route.dst}/${route.prefix}`, gateway: route.via, command: mv.renderRoute(route) });
  }
  assert.deepEqual(actual, fixture('routeros-route-commands.json').rows);
});

test('Cisco: frozen commands survive A2; only task 15/16 data are re-keyed', () => {
  const actual = legacyTasks.flatMap(record => record.variants.flatMap(variant => Object.entries(variant.referenceRoutes).flatMap(([router, rows]) => rows.map(route => ({ task: record.id, variant: variant.id, router, routeId: route.id, command: cv.renderRoute(route) })))));
  const baseline = fixture('cisco-route-commands.json').rows;
  const replaced = row => row.task === 'routing.task-03' && row.variant === 'defaults' && row.router === 'R2';
  assert.deepEqual(actual.filter(row => !replaced(row)), baseline.filter(row => !replaced(row)));
  // Keep the old 3b golden byte-for-byte as a historical assertion on the
  // neutral renderer (the historical route is frozen with the grading corpus).
  assert.deepEqual(grading.historical3b.referenceRoutes.R2.map(cv.renderRoute), [baseline.find(replaced).command]);
  assert.deepEqual(actual.filter(replaced).map(row => row.command), [
    'ip route 10.1.0.0 255.255.255.0 192.168.0.1',
    'ip route 10.2.0.0 255.255.255.0 192.168.0.1',
  ]);
});

test('vendors parse without canonicalising and reject malformed addresses, masks and distances', () => {
  for (const vendor of [cv, mv]) {
    const valid = vendor === cv ? { net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.2' } : { dst: '192.168.1.0/24', gw: '10.0.0.2' };
    assert.deepEqual(vendor.parseRouteFields(valid), { ok: true, code: 'ok', route: { dst: '192.168.1.0', prefix: 24, via: '10.0.0.2', distance: 1 } });
    for (const gw of ['10.0.0.02', '256.0.0.1', '10.0.0', '10,0,0,2']) assert.equal(vendor.parseRouteFields({ ...valid, gw }).ok, false);
    const zeros = vendor === cv ? { net: '192.168.001.0' } : { dst: '192.168.001.0/24' };
    assert.equal(vendor.parseRouteFields({ ...valid, ...zeros }).ok, false);
    for (const dist of ['0', '256', '2.5', 'two']) assert.equal(vendor.parseRouteFields({ ...valid, dist }).code, 'invalid-distance');
    assert.equal(vendor.parseRouteFields({ ...valid, ...(vendor === cv ? { net: '192.168.1.2' } : { dst: '192.168.1.2/24' }) }).code, 'dst-not-network');
  }
  assert.equal(cv.parseRouteFields({ net: '1.0.0.0', mask: '/24', gw: '100.64.1.1' }).code, 'invalid-prefix');
  assert.equal(mv.parseRouteFields({ dst: '0.0.0.00.0.0.0', gw: '100.64.1.1' }).ok, false);
});

test('task identity is syntax independent and variants are isolated; solution is editable without mutating the bank', () => {
  for (const record of tasks) for (const variant of record.variants) {
    const a = routing.create(record, { variantId: variant.id }), b = routing.create(record, { variantId: variant.id });
    routing.scaffold(a, 'cisco'); routing.scaffold(b, 'routeros');
    assert.deepEqual(a.identity, b.identity);
    assert.equal(a.instanceKey, b.instanceKey);
    const reference = routing.solution(a);
    Object.values(reference)[0][0].via = '203.0.113.254';
    assert.notEqual(Object.values(a.variant.referenceRoutes)[0][0].via, '203.0.113.254');
  }
  for (const index of [2, 7]) assert.notEqual(routing.create(tasks[index], { variantId: tasks[index].variants[0].id }).instanceKey, routing.create(tasks[index], { variantId: tasks[index].variants[1].id }).instanceKey);
  assert.throws(() => routing.create(tasks[0], { variantId: 'missing' }), RangeError);
});
