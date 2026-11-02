import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { minimiseTable } from '../src/engine/min-table.js';
import { fromInt, toInt } from '../src/engine/ip.js';

const A = { kind: 'hop', egressId: 'a', via: '1.0.0.1' }, B = { kind: 'hop', egressId: 'b', via: '2.0.0.1' };
const N = { kind: 'none' }, D = { kind: 'discard' }, C = { kind: 'connected', egressId: 'c' };
const key = a => JSON.stringify(a);
const U = 2 ** 32;
const intervals = leaves => leaves.map((action, i) => ({ start: i * U / leaves.length, end: (i + 1) * U / leaves.length, action }));
// Independent oracle: direct arithmetic prefix membership and longest-prefix
// evaluation. No DP internals, forwardingMap, lookup or engine membership used.
function direct(rows, address, inherited, fixed = []) {
  let action = inherited, longest = -1;
  for (const row of [...rows, ...fixed]) {
    const size = 2 ** (32 - row.prefix), start = toInt(row.dst);
    if (address >= start && address < start + size && row.prefix > longest) { action = row.action; longest = row.prefix; }
  }
  return action;
}
function nodes(depth) {
  const out = [];
  for (let prefix = 0; prefix <= depth; prefix++) for (let i = 0; i < 2 ** prefix; i++) out.push({ dst: fromInt(i * U / 2 ** prefix), prefix });
  return out;
}
function reproduce(result, required, inherited, fixed = []) {
  if (result.infeasible) return;
  for (let i = 0; i < required.length; i++) if (required[i] !== 'dontCare') assert.deepEqual(direct(result.routes, i * U / required.length, inherited, fixed), required[i]);
}

test('exact DP: exhaustive four-leaf oracle (4^7 assignments per context)', () => {
  const start = performance.now();
  let cases = 0;
  for (const rootAction of [N, A]) for (const forbidDefault of [false, true]) for (const fixed of [[], [{ dst: '0.0.0.0', prefix: 1, action: C }]]) {
    const allNodes = nodes(2), outcomes = new Map();
    // Every assignment at all seven nodes: absent/A/B/discard. Invalid fixed
    // descendants and forbidden roots are excluded before evaluation.
    for (let assignment = 0; assignment < 4 ** 7; assignment++) {
      let value = assignment, valid = true;
      const rows = [];
      for (const node of allNodes) {
        const choice = value % 4; value = Math.floor(value / 4);
        if (!choice) continue;
        if ((forbidDefault && node.prefix === 0) || fixed.some(f => node.prefix >= f.prefix && toInt(node.dst) < U / 2)) { valid = false; break; }
        rows.push({ ...node, action: [null, A, B, D][choice] });
      }
      if (!valid) continue;
      const output = Array.from({ length: 4 }, (_, i) => key(direct(rows, i * U / 4, rootAction, fixed))).join('|');
      outcomes.set(output, Math.min(outcomes.get(output) ?? Infinity, rows.length));
    }
    const outputs = [...outcomes].map(([output, cost]) => ({ values: output.split('|'), cost }));
    // All 5^4 required maps. Fixed contexts additionally include their own
    // connected action, testing both feasible and infeasible requirements.
    const choices = fixed.length ? [A, B, N, D, 'dontCare', C] : [A, B, N, D, 'dontCare'];
    for (let assignment = 0; assignment < choices.length ** 4; assignment++) {
      let value = assignment;
      const required = Array.from({ length: 4 }, () => { const a = choices[value % choices.length]; value = Math.floor(value / choices.length); return a; });
      const expected = outputs.filter(o => required.every((a, i) => a === 'dontCare' || key(a) === o.values[i])).reduce((m, o) => Math.min(m, o.cost), Infinity);
      const result = minimiseTable({ intervals: intervals(required), fixed, rootAction, forbidDefault });
      assert.equal(result.infeasible ? Infinity : result.count, expected, JSON.stringify({ required, rootAction, forbidDefault, fixed }));
      reproduce(result, required, rootAction, fixed); cases++;
    }
  }
  console.log(`Four-leaf exhaustive oracle: ${cases} cases, ${((performance.now() - start) / 1000).toFixed(3)} s`);
});

test('selected eight-leaf cases: enumerate every smaller set up to two routes', () => {
  const start = performance.now(), allNodes = nodes(3);
  // Each requirement comes from <=3 routes, hence the independent exhaustive
  // lower-bound search only needs sizes 0,1,2: 1+45+945 assignments at most.
  for (let seed = 0; seed < 24; seed++) {
    const rootAction = seed % 2 ? A : N, forbidDefault = seed % 3 === 0;
    const source = [{ ...allNodes[3 + seed % 4], action: B }, { ...allNodes[7 + seed % 8], action: D }, { ...allNodes[7 + (seed + 3) % 8], action: A }];
    const required = Array.from({ length: 8 }, (_, i) => direct(source, i * U / 8, rootAction));
    const result = minimiseTable({ intervals: intervals(required), rootAction, forbidDefault });
    reproduce(result, required, rootAction);
    assert.ok(result.count <= 3);
    const allowed = allNodes.filter(n => !forbidDefault || n.prefix !== 0);
    let smallerWorks = false;
    function search(rows, next) {
      if (required.every((a, i) => key(direct(rows, i * U / 8, rootAction)) === key(a))) smallerWorks = true;
      if (rows.length >= result.count - 1) return;
      for (let i = next; i < allowed.length; i++) for (const action of [A, B, D]) search([...rows, { ...allowed[i], action }], i + 1);
    }
    if (result.count) search([], 0);
    assert.equal(smallerWorks, false);
  }
  console.log(`Eight-leaf bounded oracle: ${((performance.now() - start) / 1000).toFixed(3)} s`);
});

test('DP random /16 maps reproduce boundaries and deterministic output', () => {
  let seed = 0x5329a;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let trial = 0; trial < 100; trial++) {
    const pieces = Array.from({ length: 64 }, (_, i) => ({ start: i * 1024, end: (i + 1) * 1024, action: [A, B, D, N, 'dontCare'][random() % 5] }));
    pieces.push({ start: 65536, end: U, action: N });
    const args = { intervals: pieces, rootAction: N };
    const result = minimiseTable(args);
    assert.ok(!result.infeasible);
    for (const p of pieces) if (p.action !== 'dontCare') for (const address of [p.start, p.end - 1]) assert.deepEqual(direct(result.routes, address, N), p.action);
    assert.deepEqual(minimiseTable(args), result);
  }
});

test('DP amended base cases, fixed validation, constraints and discard default', () => {
  assert.equal(minimiseTable({ intervals: intervals([A]), rootAction: N }).count, 1);
  const tied = minimiseTable({ intervals: intervals(['dontCare', A, 'dontCare', 'dontCare']), rootAction: N });
  assert.deepEqual(tied.routes, [{ dst: '64.0.0.0', prefix: 2, action: A }], 'prefer no ancestor emission on a dont-care tie');
  assert.equal(minimiseTable({ intervals: intervals([A]), rootAction: N, forbidDefault: true }).count, 2);
  assert.deepEqual(minimiseTable({ intervals: intervals([N]), rootAction: A }), { infeasible: true });
  assert.equal(minimiseTable({ intervals: intervals([D, D, D, A]), rootAction: N }).count, 2);
  assert.equal(minimiseTable({ intervals: intervals([D, D, D, A]), rootAction: N, forbidDefault: true }).count, 3);
  const fixed = [{ dst: '0.0.0.0', prefix: 1, action: C }];
  assert.deepEqual(minimiseTable({ intervals: intervals([N, N]), fixed, rootAction: N }), { infeasible: true });
  assert.equal(minimiseTable({ intervals: intervals(['dontCare', A]), fixed, rootAction: N }).count, 1);
  assert.throws(() => minimiseTable({ intervals: intervals([N]), fixed: [...fixed, ...fixed] }), /Overlapping/);
  assert.throws(() => minimiseTable({ intervals: [] }), /Incomplete/);
});

test('pinned DP: exhaustive four-leaf oracle keeps pins while allowing descendant forwarding', () => {
  const allNodes = nodes(2), choices = [A, B, N, D, 'dontCare'];
  const contexts = [
    { pinned: [{ ...allNodes[1], action: D }], rootAction: N },
    { pinned: [{ ...allNodes[0], action: D }], rootAction: N },
    { pinned: [{ ...allNodes[0], action: D }, { ...allNodes[2], action: A }], rootAction: A },
    { pinned: [{ ...allNodes[1], action: D }], rootAction: A, forbidDefault: true },
  ];
  for (const context of contexts) {
    const outcomes = new Map();
    for (let assignment = 0; assignment < 4 ** 7; assignment++) {
      let value = assignment;
      const rows = [];
      for (const node of allNodes) {
        const choice = value % 4; value = Math.floor(value / 4);
        if (choice) rows.push({ ...node, action: [null, A, B, D][choice] });
      }
      if (context.forbidDefault && rows.some(r => r.prefix === 0)) continue;
      if (!context.pinned.every(p => rows.some(r => r.dst === p.dst && r.prefix === p.prefix && key(r.action) === key(p.action)))) continue;
      const output = Array.from({ length: 4 }, (_, i) => key(direct(rows, i * U / 4, context.rootAction))).join('|');
      outcomes.set(output, Math.min(outcomes.get(output) ?? Infinity, rows.length));
    }
    const outputs = [...outcomes].map(([output, cost]) => ({ values: output.split('|'), cost }));
    for (let assignment = 0; assignment < choices.length ** 4; assignment++) {
      let value = assignment;
      const required = Array.from({ length: 4 }, () => { const a = choices[value % choices.length]; value = Math.floor(value / choices.length); return a; });
      const expected = outputs.filter(o => required.every((a, i) => a === 'dontCare' || key(a) === o.values[i])).reduce((m, o) => Math.min(m, o.cost), Infinity);
      const result = minimiseTable({ intervals: intervals(required), ...context });
      assert.equal(result.infeasible ? Infinity : result.count, expected, JSON.stringify({ required, ...context }));
      reproduce(result, required, context.rootAction);
      if (!result.infeasible) for (const pin of context.pinned) assert.ok(result.routes.some(r => key(r) === key(pin)));
    }
  }
});

test('pinned DP: redundant, nested, host and connected constraints', () => {
  const pin = { dst: '0.0.0.0', prefix: 1, action: D };
  const redundant = minimiseTable({ intervals: intervals([A, A, A, A]), pinned: [pin, pin], rootAction: A });
  assert.equal(redundant.count, 3, 'pin plus two forwarding exceptions');
  assert.deepEqual(redundant.routes, [pin, { dst: '0.0.0.0', prefix: 2, action: A }, { dst: '64.0.0.0', prefix: 2, action: A }]);
  const host = { dst: '0.0.0.0', prefix: 32, action: D };
  assert.deepEqual(minimiseTable({ intervals: intervals(['dontCare']), pinned: [host] }).routes, [host]);
  assert.deepEqual(minimiseTable({ intervals: intervals([N]), pinned: [host] }), { infeasible: true });
  assert.deepEqual(minimiseTable({ intervals: intervals(['dontCare']), pinned: [{ ...pin, prefix: 0 }], forbidDefault: true }), { infeasible: true });
  const fixed = [{ dst: '0.0.0.0', prefix: 2, action: C }];
  const withConnected = minimiseTable({ intervals: intervals([C, A, D, D]), fixed, pinned: [{ ...pin, prefix: 0 }] });
  reproduce(withConnected, [C, A, D, D], N, fixed);
  assert.ok(withConnected.routes.some(r => r.prefix === 0 && r.action.kind === 'discard'));
  assert.throws(() => minimiseTable({ intervals: intervals([N]), pinned: [{ ...pin, action: N }] }), /Pinned rows/);
  assert.throws(() => minimiseTable({ intervals: intervals([N]), pinned: [pin, { ...pin, action: A }] }), /Conflicting/);
  assert.throws(() => minimiseTable({ intervals: intervals([C]), fixed: [{ ...pin, action: C }], pinned: [pin] }), /inside connected/);
});
