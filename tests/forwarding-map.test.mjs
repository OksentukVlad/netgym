import test from 'node:test';
import assert from 'node:assert/strict';
import { tasks } from '../src/banks/routing/tasks.js';
import { create, solution } from './helpers/routing.mjs';
import { forwardingMap, forwardingAction, actionKey, equalForwarding } from '../src/engine/forwarding-map.js';
import { lookup, routingTable } from '../src/engine/forward.js';
import { blockSize, fromInt, toInt } from '../src/engine/ip.js';

test('forwarding maps match lookup at every route boundary and seeded random addresses in every scenario', () => {
  let seed = 0x97315;
  for (const record of tasks) for (const variant of record.variants) {
    const task = create(record, { variantId: variant.id }), answer = solution(task);
    for (const options of [{}, ...record.scenarios.map(s => ({ downLinks: s.downLinks }))]) for (const device of record.network.devices) {
      const map = forwardingMap(task.network, answer, device.id, options);
      assert.equal(map[0].start, 0); assert.equal(map.at(-1).end, 2 ** 32);
      map.forEach((p, i) => { assert.ok(p.start < p.end); if (i) assert.equal(p.start, map[i - 1].end); });
      const edges = routingTable(task.network, answer, device.id, options).flatMap(r => [toInt(r.dst), toInt(r.dst) + blockSize(r.prefix)]);
      const addresses = edges.flatMap(n => [n - 1, n, n + 1]).filter(n => n >= 0 && n < 2 ** 32);
      for (let i = 0; i < 20; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; addresses.push(seed); }
      for (const n of addresses) assert.deepEqual(map.find(p => p.start <= n && n < p.end).action, forwardingAction(lookup(task.network, answer, device.id, fromInt(n), options)));
    }
  }
});

test('map canonical identity includes egress/via and represents discard, none and ECMP', () => {
  assert.equal(actionKey({ via: 'x', kind: 'hop', egressId: 'a' }), actionKey({ kind: 'hop', egressId: 'a', via: 'x' }));
  const net = tasks[0].network, base = { dst: '203.0.113.0', prefix: 24 };
  const rows = { R1: [{ ...base, via: '10.0.0.2' }, { ...base, discard: true }] };
  assert.ok(forwardingMap(net, rows, 'R1').some(p => p.action.kind === 'ecmp'));
  assert.ok(forwardingMap(net, { R1: [{ ...base, discard: true }] }, 'R1').some(p => p.action.kind === 'discard'));
  assert.ok(forwardingMap(net, {}, 'R1').some(p => p.action.kind === 'none'));
});

test('union-boundary equivalence respects partial unknown intervals', () => {
  const a = [{ start: 0, end: 100, action: { kind: 'none' } }];
  const b = [{ start: 0, end: 50, action: { kind: 'none' } }, { start: 50, end: 100, action: { kind: 'discard' } }];
  assert.equal(equalForwarding(a, b), false);
  assert.equal(equalForwarding(a, b, [[50, 100]]), true);
  assert.equal(equalForwarding(a, b, [[50, 75]]), false);
  assert.equal(equalForwarding(a, b, [[50, 75], [75, 100]]), true);
});
