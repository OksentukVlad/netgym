import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCisco, compileRouterOS, flood, validateTopology } from '../src/engine/l2.js';
import * as predict from '../src/sections/vlan/logic/predict.js';
import * as ports from '../src/sections/vlan/logic/ports.js';
import { describe } from '../src/sections/vlan/logic/describe.js';
import { render } from '../src/sections/vlan/logic/render.js';
import { hostPort } from '../src/sections/vlan/logic/model.js';
import { record } from '../src/banks/vlan/predict.js';
import { records } from '../src/banks/vlan/ports.js';
import { validatePredictInstance } from '../src/banks/vlan/validate.js';
import { t } from '../src/sections/vlan/uk.js';
import { clone, simple, cisco, routeros, transit, transitCisco, hop } from './helpers/vlan.mjs';

// Review regressions: supplied configurations and expectations are handwritten.
for (const vid of [1002, 1003, 1004, 1005]) test(`R1: Cisco reserved VLAN ${vid} blocks creation, access and allowed lists`, () => {
  const cases = [
    [{ vlans: [vid], ports: {} }, 'vlans'],
    [{ vlans: [], ports: { a: { mode: 'access', vlan: vid } } }, 'ports.a.vlan'],
    [{ vlans: [], ports: { t: { mode: 'trunk', allowed: [10, vid] } } }, 'ports.t.allowed'],
  ];
  for (const [config, field] of cases) {
    const { table, findings } = compileCisco(config);
    assert.deepEqual(findings, [{ code: 'cisco-reserved-vid', severity: 'blocks', field, params: {} }]);
    assert.equal(table.vlans.has(vid), false);
  }
  assert.match(t('cisco-reserved-vid'), /1002–1005.*Cisco/);
});

test('R1: adjacent Cisco VLANs and RouterOS 1002–1005 remain valid', () => {
  for (const vid of [1001, 1006]) {
    const config = { vlans: [vid], ports: { a: { mode: 'access', vlan: vid }, t: { mode: 'trunk', allowed: [vid] } } };
    assert.deepEqual(compileCisco(config).findings, []);
  }
  for (const vid of [1002, 1003, 1004, 1005]) {
    const config = { filtering: true, ports: { a: { pvid: vid } }, vlans: [{ vids: [vid], tagged: [], untagged: ['a'] }] };
    assert.deepEqual(compileRouterOS(config).findings, []);
  }
});

test('R2: split RouterOS rows pass as an answer and emit one unioned command per VID', () => {
  const task = {
    topology: simple(), syntax: 'routeros', goals: { PC1: 10, PC2: 10, PC3: 20 }, vids: [10, 20, 30],
  };
  const config = clone(routeros);
  config.vlans = [
    { vids: [10], tagged: [], untagged: ['a'] },
    { vids: [10], tagged: [], untagged: ['b', 'a'] },
    { vids: [20], tagged: [], untagged: ['c'] },
  ];
  const answer = { SW1: config };
  assert.deepEqual(ports.check(task, answer).findings, []);
  assert.equal(ports.check(task, answer).ok, true);
  assert.deepEqual(render(answer, 'routeros').SW1.split('\n').filter(l => l.startsWith('/interface bridge vlan add')), [
    '/interface bridge vlan add bridge=bridge1 vlan-ids=10 untagged=a,b',
    '/interface bridge vlan add bridge=bridge1 vlan-ids=20 untagged=c',
  ]);
});

test('R2: overlapping multi-VID rows union tagged and untagged memberships independently', () => {
  const config = { S: { filtering: true, ports: {}, vlans: [
    { vids: [10, 20], tagged: ['t1'], untagged: ['a'] },
    { vids: [20, 30], tagged: ['t2', 't1'], untagged: ['b'] },
  ] } };
  assert.deepEqual(render(config, 'routeros').S.split('\n').slice(1, -1), [
    '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=t1 untagged=a',
    '/interface bridge vlan add bridge=bridge1 vlan-ids=20 tagged=t1,t2 untagged=a,b',
    '/interface bridge vlan add bridge=bridge1 vlan-ids=30 tagged=t1,t2 untagged=b',
  ]);
});

for (const tagged of [null, 20]) test(`R3: admission rejection narrates arrival without classifying ${tagged === null ? 'untagged' : 'tagged'} input`, () => {
  const config = clone(routeros);
  config.ports.a.frameTypes = tagged === null ? 'admit-only-vlan-tagged' : 'admit-only-untagged-and-priority-tagged';
  const walk = flood(simple(), { SW1: compileRouterOS(config).table }, { from: 'PC1', tagged });
  const lines = describe({ topology: simple(), vendor: 'routeros' }, { walks: [walk] });
  assert.deepEqual(lines.filter(l => l.startsWith('SW1')), [
    'SW1: кадр надходить через a.',
    `SW1 a: ${t(tagged === null ? 'untagged-not-admitted' : 'tagged-not-admitted')}`,
  ]);
  assert.doesNotMatch(lines.join('\n'), /VLAN null|належить до VLAN/);
  assert.equal(lines.find(l => l.startsWith('PC1 надсилає')),
    tagged === null ? 'PC1 надсилає широкомовний кадр без тега.' : 'PC1 надсилає широкомовний кадр з тегом 20.');
});

test('R3: Cisco tagged access rejection also avoids accepted VLAN wording', () => {
  const walk = flood(simple(), { SW1: compileCisco(cisco).table }, { from: 'PC1', tagged: 10 });
  const lines = describe({ topology: simple() }, { walks: [walk] });
  assert.ok(lines.includes('SW1: кадр надходить через a.'));
  assert.ok(lines.includes(`SW1 a: ${t('tagged-not-admitted')}`));
  assert.doesNotMatch(lines.join('\n'), /належить до VLAN/);
});

test('R4: ports descriptions default to task syntax, with vendor precedence and explicit override', () => {
  const task = ports.create(records[1], { syntax: 'routeros', seed: 0 });
  assert.match(ports.describe(task).join('\n'), /SW1 ether1 ↔ SW2 ether1/);
  assert.doesNotMatch(ports.describe(task).join('\n'), /fa0|gi0/);
  assert.match(ports.describe(task, { syntax: 'cisco' }).join('\n'), /SW1 gi0\/1 ↔ SW2 gi0\/1/);
  assert.match(describe({ ...task, vendor: 'cisco' }).join('\n'), /gi0\/1/);
  const { syntax, ...withoutSyntax } = task;
  assert.match(describe(withoutSyntax).join('\n'), /gi0\/1/);
});

test('R5/R13: tagged delivery hint identifies destination egress port and asks about its host', () => {
  const task = ports.create(records[1], { syntax: 'routeros', seed: 0 }), answer = ports.solution(task);
  const end = hostPort(task.topology, 'PC3');
  answer[end.device].ports[end.port].frameTypes = 'admit-only-vlan-tagged';
  const row = answer[end.device].vlans.find(r => r.untagged.includes(end.port));
  row.untagged = row.untagged.filter(p => p !== end.port);
  row.tagged.push(end.port);
  const hints = ports.hints(task, answer);
  assert.equal(hints[0].code, 'hint-port');
  assert.deepEqual(hints[0].params, { host: 'PC3' });
  assert.deepEqual(hints[1].params, { device: 'SW2', port: 'ether2', reason: 'host-got-tagged', host: 'PC3', vid: task.goals.PC3, syntax: 'routeros', trunk: false, vids: [task.goals.PC3] });
});

test('R13: reverse-direction admission hint asks about the host attached to the evidence port', () => {
  const task = ports.create(records[1], { syntax: 'routeros', seed: 0 }), answer = ports.solution(task);
  const end = hostPort(task.topology, 'PC3');
  answer[end.device].ports[end.port].frameTypes = 'admit-only-vlan-tagged';
  const hints = ports.hints(task, answer);
  assert.deepEqual(hints[0].params, { host: 'PC3' });
  assert.deepEqual(hints[1].params, { device: 'SW2', port: 'ether2', reason: 'untagged-not-admitted', host: 'PC3', vid: task.goals.PC3, syntax: 'routeros', trunk: false, vids: [task.goals.PC3] });
});

for (const failure of ['address', 'source-port', 'destination-port']) test(`R6: task 4 ${failure} failure does not blame SW2`, () => {
  const task = ports.create(records[3], { seed: 0 }), answer = ports.solution(task);
  if (failure === 'address') task.topology.hosts.find(h => h.device === 'PC2').prefix = 32;
  else {
    const end = hostPort(task.topology, failure === 'source-port' ? 'PC2' : 'PC6');
    answer[end.device].ports[end.port] = failure === 'source-port'
      ? { mode: 'trunk', allowed: [task.vids[1]] } : { mode: 'access', vlan: task.vids[0] };
  }
  const probe = ports.check(task, answer).evidence.probes.find(p => p.id === 'PC2:PC6');
  assert.equal(probe.ok, false);
  assert.equal(probe.diagnosis, undefined);
});

test('R6: a real SW2 egress allow-list drop still gets carry-through-middle', () => {
  const task = ports.create(records[3], { seed: 0 }), answer = ports.solution(task);
  answer.SW2.ports.t2.allowed = answer.SW2.ports.t2.allowed.filter(v => v !== task.vids[1]);
  const probe = ports.check(task, answer).evidence.probes.find(p => p.id === 'PC2:PC6');
  assert.equal(probe.ok, false);
  assert.equal(probe.diagnosis, 'carry-through-middle');
});

test('R7: public predict tasks omit fault metadata; inspect is detached tooling-only metadata', () => {
  const options = { variantId: 'p1', seed: 0, vendor: 'cisco', surprises: 1 };
  const task = predict.create(record, options), inspected = predict.inspect(record, options);
  assert.equal(Object.hasOwn(task, 'activeSurprises'), false);
  const { activeSurprises, ...publicFields } = inspected;
  assert.deepEqual(activeSurprises, [{ id: 'access-b', device: 'SW1', port: 'a5' }]);
  assert.deepEqual(publicFields, task);
  assert.deepEqual(validatePredictInstance(inspected), []);
  inspected.configurations.SW1.vlans.length = 0;
  assert.notDeepEqual(inspected.configurations, task.configurations);
});

for (const [variantId, surprises, count] of [['p1', 0, 3], ['p2', 0, 3], ['p2', 2, 4]]) {
  test(`R8: ${variantId}/level${surprises}/seed0 uses ${count} rounds with final evidence at that count`, () => {
    const task = predict.create(record, { variantId, surprises, seed: 0 });
    assert.equal(task.rounds.length, count);
    const solution = predict.solution(task), partial = { ...solution };
    delete partial[task.rounds.at(-1).id];
    assert.equal(predict.check(task, partial).complete, false);
    assert.equal(predict.check(task, partial).evidence.domains, undefined);
    assert.equal(predict.check(task, solution).complete, true);
    assert.ok(predict.check(task, solution).evidence.domains);
    assert.deepEqual(validatePredictInstance(predict.inspect(record, { variantId, surprises, seed: 0 })), []);
  });
}

for (const [seed, host, ip] of [[0, 'PC3', '192.168.40.165'], [1, 'PC1', '192.168.100.117']]) {
  test(`R9: odd-address host and address are seeded (${seed})`, () => {
    const options = { variantId: 'p1', seed, surprises: 1 };
    const base = predict.create(record, { ...options, surprises: 0 });
    const task = predict.create(record, options);
    assert.deepEqual(task.topology.hosts.filter((h, i) => h.ip !== base.topology.hosts[i].ip), [
      { device: host, ip, prefix: 24 },
    ]);
    assert.deepEqual(task, predict.create(record, options));
    assert.deepEqual(validateTopology(task.topology), []);
    const restored = clone(task); restored.topology.hosts = base.topology.hosts;
    assert.deepEqual(predict.solution(task), predict.solution(restored));
  });
}

for (const syntax of ['cisco', 'routeros']) test(`R10: task 3 SW2 carrying C earns unused-VLAN advice (${syntax})`, () => {
  const task = ports.create(records[2], { syntax, seed: 0 }), answer = ports.solution(task);
  if (syntax === 'cisco') {
    answer.SW2.vlans.push(task.vids[2]);
    answer.SW2.ports.t1.allowed.push(task.vids[2]);
  } else answer.SW2.vlans.push({ vids: [task.vids[2]], tagged: ['t1'], untagged: [] });
  const result = ports.check(task, answer);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, [{ code: 'trunk-carries-unused', severity: 'advice', entity: 'SW2', field: 'ports.t1' }]);
});

test('R10: task 3 SW1 carrying an unrelated unused VLAN still earns advice', () => {
  const task = ports.create(records[2], { seed: 0 }), answer = ports.solution(task);
  answer.SW1.vlans.push(777); answer.SW1.ports.t1.allowed.push(777);
  const result = ports.check(task, answer);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings.map(f => f.code), ['trunk-carries-unused']);
});

test('R11: Cisco ingress disallow takes precedence over a missing VLAN; allowed-but-missing stays distinct', () => {
  const configs = clone(transitCisco); configs.SW2.vlans = []; configs.SW2.ports.l.allowed = [];
  const tables = Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, compileCisco(config).table]));
  assert.deepEqual(flood(transit(), tables, { from: 'PC1' }).hops[2],
    hop('SW2', 'l', true, 20, [], [{ port: 'l', code: 'not-member' }], false));
  assert.deepEqual(flood(transit(), tables, { from: 'PC2' }).hops[2].dropped,
    [{ port: 'r', code: 'vlan-not-on-switch' }]);
  configs.SW2.vlans = [20]; configs.SW2.ports.l.allowed = [20]; configs.SW2.ports.r.allowed = [];
  tables.SW2 = compileCisco(configs.SW2).table;
  assert.deepEqual(flood(transit(), tables, { from: 'PC1' }).hops[2].dropped,
    [{ port: 'r', code: 'not-allowed-out' }]);
});

test('R12: RouterOS dynamic VLAN 1 on admit-all trunk does not earn unused-VLAN advice', () => {
  const task = ports.create(records[1], { syntax: 'routeros', seed: 0 }), answer = ports.solution(task);
  answer.SW1.ports.t1.frameTypes = 'admit-all';
  const result = ports.check(task, answer);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings.map(f => f.code), ['trunk-frame-types']);
  // An explicitly configured VLAN 1 membership still counts as unused.
  answer.SW1.vlans.push({ vids: [1], tagged: [], untagged: ['t1'] });
  assert.deepEqual(ports.check(task, answer).findings.map(f => f.code), ['trunk-frame-types', 'trunk-carries-unused']);
});

test('R14: untagged Cisco trunk input drops when its native VLAN 1 is not allowed', () => {
  const net = simple(), table = compileCisco({ vlans: [10], ports: {
    a: { mode: 'trunk', allowed: [10] }, b: { mode: 'access', vlan: 10 }, c: { mode: 'access', vlan: 10 },
  } }).table;
  const walk = flood(net, { SW1: table }, { from: 'PC1' });
  assert.deepEqual(walk.hops[1], hop('SW1', 'a', false, 1, [], [{ port: 'a', code: 'not-member' }], false));
  assert.deepEqual(walk.received, new Set());
});
