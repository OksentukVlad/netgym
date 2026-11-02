import test from 'node:test';
import assert from 'node:assert/strict';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
import { analyse, explanations, visibleCauses, publicPolicy, requirements, plainRoutes, classify, plant, levelCodes } from '../src/sections/routing/logic/faults.js';
import { create, check as checkRouting } from '../src/sections/routing/logic/static.js';
import { topologyRepair, splitRepair, sampledInternetOnly } from './helpers/rf1-repairs.mjs';
import { network } from '../src/engine/ip.js';
import { full } from './helpers/sweep-mode.mjs';
import { templateTask } from '../src/sections/routing/logic/faults-templates.js';
import frozen from '../src/banks/routing/faults-results.js';

// Reused by the witness, level and row-order tests. These fixtures are read-only;
// adversarial fixtures below still construct their own mutable task.
const fixtures = new Map();
function fixture(d) {
  if (!fixtures.has(d.taskId)) {
    const source = bank.tasks.find(t => t.id === d.taskId);
    const { internal: task } = templateTask(source, d.variantId, 0, frozen.results[`${d.taskId}/${d.variantId}`]);
    fixtures.set(d.taskId, { task, analysis: analyse(task) });
  }
  return fixtures.get(d.taskId);
}

const expectedCauses = {
  '01': ['missing-route', 'wrong-destination'],
  '02': ['missing-route', 'wrong-destination', 'wrong-next-hop'],
  '04': ['missing-route', 'wrong-destination', 'wrong-next-hop'],
  '05': ['missing-route', 'wrong-destination', 'wrong-next-hop', 'default-wrong-way'],
  '09': ['missing-route', 'wrong-destination', 'wrong-next-hop', 'default-wrong-way'],
  '12': ['missing-route', 'wrong-destination', 'wrong-next-hop'],
  '14': ['missing-route', 'wrong-destination', 'wrong-next-hop'],
};

for (const d of record.variants) test(`witnesses: ${d.taskId} every admitted cause, independent repairs and requirements`, () => {
  const { analysis } = fixture(d), codes = [...new Set(analysis.candidates.filter(c => c.accepted).map(c => c.site.code))];
  assert.deepEqual([...codes].sort(), [...expectedCauses[d.taskId.slice(-2)]].sort(), 'frozen advertised variant/cause matrix');
  for (const faultCode of codes) {
    const level = d.levels.find(l => levelCodes[l].includes(faultCode));
    assert.ok(level, faultCode);
    const i = F.inspect(record, { bank, seed: 0, level, taskId: d.taskId, faultCode }), task = i.task;
    assert.deepEqual(classify(analysis.baseline, i.candidates.find(c => c.site.key === i.site.key).faulty), [faultCode]);
    assert.ok(F.pingList(task).rows.some(p => !p.ok), 'normal observation fails');
    assert.equal(F.parseAnswer(task).findings.length, 0, 'single mutation remains valid');
    const canonical = { routes: i.baseline, cause: faultCode };
    assert.equal(F.check(task, canonical, { step: 'cause' }).ok, true);
    // These constructors receive only public topology and requirements. They
    // do not copy, reorder, add redundant rows to, or derive from a solution.
    // Both repair shapes and the sampled-only rejection are independent of the
    // planted cause. Fast witnesses them once per topology; full crosses causes.
    for (const construct of full || faultCode === codes[0] ? [topologyRepair, splitRepair] : []) {
      const routes = construct(task);
      assert.notDeepEqual(routes, canonical.routes);
      assert.equal(F.check(task, { routes, cause: faultCode }, { step: 'cause' }).ok, true, `${faultCode}/${construct.name}`);
    }
    if (task.requirements.length && (full || faultCode === codes[0])) {
      assert.equal(task.requirements.length, 1);
      assert.ok(task.probes.some(p => p.to === 'internet'), 'internet rows are public');
      const result = F.check(task, { routes: sampledInternetOnly(task) });
      assert.ok(result.evidence.snapshot.rows.every(p => p.ok), 'every displayed ping passes');
      assert.equal(result.fixOk, false);
      assert.equal(result.code, 'internet-coverage-missing');
      assert.match(F.feedback(task, result), /поза мережами на схемі.*інтернет/);
      assert.ok(F.describe(task).includes(task.requirements[0]), 'copy includes the visible condition');
    } else if (!task.requirements.length) assert.deepEqual(task.requirements, []);
  }
});

test('missing specific route may loop through a correct default; default traversal does not identify the cause', () => {
  const task = create(bank.tasks[4], { bank, seed: 0 }), a = analyse(task), policy = publicPolicy(task.record, task.variant);
  const c = a.candidates.find(c => c.site.code === 'missing-route' && c.observation.some(p => [p.request, p.reply]
    .filter(Boolean).some(leg => leg.stop?.code === 'loop' && leg.hops.some(h => c.faulty[h.deviceId]?.some(r => r.id === h.routeId && r.prefix === 0)))));
  assert.ok(c); assert.equal(c.accepted, true);
  assert.deepEqual(visibleCauses(task.network, c.faulty, c.observation, policy), ['missing-route']);
  const trial = a.candidates.find(c => c.accepted && c.site.code === 'default-wrong-way');
  assert.ok(trial); assert.deepEqual(trial.visible, ['default-wrong-way']);
  assert.equal(a.baseline[trial.site.router][trial.site.index].prefix, 0);
  assert.throws(() => plant(a.baseline, { ...trial.site, code: 'wrong-next-hop' }), /invalid-fault/);
  const nonDefault = a.candidates.find(c => c.site.code === 'wrong-next-hop');
  assert.throws(() => plant(a.baseline, { ...nonDefault.site, code: 'default-wrong-way' }), /invalid-fault/);
});

test('legitimate summary is not an orphan; equally explanatory causes are retained and planting rejected', () => {
  const summary = create(bank.tasks[13], { bank, seed: 0 });
  const a = analyse(summary);
  assert.ok(a.candidates.some(c => c.accepted && c.site.code === 'missing-route'));
  assert.ok(a.candidates.filter(c => c.accepted).every(c => c.visible.length === 1));
  const task = create(bank.tasks[0], { bank });
  // A real spare LAN makes the apparently wrong destination legitimate public
  // configuration. Adding the missing route and repurposing that row both
  // explain the same required pings with no leftover unexplained row.
  task.network = structuredClone(task.network);
  const row = task.variant.referenceRoutes.R1[0], dst = network('192.168.3.1', 24);
  task.network.devices.find(d => d.id === 'R2').interfaces.push({ id: 'spare-if', segmentId: 'spare', address: { ip: '192.168.3.1', prefix: 24 }, labels: { cisco: 'g0/9', routeros: 'ether9' } });
  task.network.segments.push({ id: 'spare', kind: 'lan', name: 'Spare' });
  const ambiguous = analyse(task).candidates.find(c => c.site.code === 'wrong-destination' && c.site.router === 'R1');
  assert.equal(ambiguous.site.changed, dst);
  const causes = visibleCauses(task.network, ambiguous.faulty, ambiguous.observation, publicPolicy(task.record, task.variant));
  assert.deepEqual(causes, ['missing-route', 'wrong-destination']);
  assert.ok(explanations(task.network, ambiguous.faulty, ambiguous.observation, publicPolicy(task.record, task.variant)).every(e => e.unexplained === 0));
  assert.equal(ambiguous.accepted, false); assert.ok(ambiguous.gates.includes('visibleCause'));
  assert.ok(row.prefix > 0);
});

test('internet projection states exact source prefixes and exclusions, rejects unseen probes/scenarios/objectives', () => {
  const task = create(bank.tasks[1], { bank, seed: 0 }), variant = structuredClone(task.variant);
  variant.objectives.find(o => o.type === 'internet-coverage').exclude = [{ dst: '203.0.113.0', prefix: 24 }];
  const policy = publicPolicy(task.record, variant), lines = requirements(policy);
  assert.equal(lines.length, 1); assert.match(lines[0], /крім 203\.0\.113\.0\/24/);
  for (const p of policy.probes.filter(p => p.to === 'internet')) assert.ok(lines[0].includes(`${p.coverage.from.dst}/${p.coverage.from.prefix}`));
  const routes = topologyRepair({ network: task.network, requirements: lines });
  const router = task.network.devices.find(d => d.kind === 'router' && !(task.network.supplied?.[d.id]?.length));
  // A single exempt /24 may stop locally without violating internet coverage.
  routes[router.id].push({ id: 'exempt', dst: '203.0.113.0', prefix: 24, discard: true });
  const projected = { ...task, variant: { objectives: policy.objectives } };
  assert.equal(checkRouting(projected, routes).ok, true);
  const noExemption = { ...task, variant: { objectives: policy.objectives.map(o => ({ ...o, exclude: [] })) } };
  assert.equal(checkRouting(noExemption, routes).code, 'internet-coverage-missing');
  for (const mutate of [
    v => v.objectives.push({ type: 'summary', severity: 'blocks' }),
    v => v.objectives[0].probeIds.push('unshown'),
    v => v.objectives[0].scenarioId = 'down',
  ]) {
    const bad = structuredClone(task.variant); mutate(bad); assert.equal(publicPolicy(task.record, bad), null);
  }
  assert.equal(publicPolicy({ ...task.record, scenarios: [...task.record.scenarios, { id: 'extra', downLinks: [], probeIds: [] }] }, task.variant), null);
});

test('levels use small networks at 1–2; level 3 adds four-router walks and two default fault locations', () => {
  for (const d of record.variants) {
    const { task, analysis } = fixture(d);
    const routerIds = new Set(task.network.devices.filter(d => d.kind === 'router').map(d => d.id));
    assert.ok(d.levels.every(l => l === 3 ? routerIds.size === 4 : routerIds.size >= 2 && routerIds.size <= 3));
    if (!d.levels.includes(3)) continue;
    const accepted = analysis.candidates.filter(c => c.accepted);
    assert.equal(new Set(accepted.filter(c => c.site.code === 'default-wrong-way').map(c => c.site.router)).size, 2);
    assert.ok(accepted.some(c => c.observation.some(p => [p.request, p.reply].filter(Boolean)
      .some(leg => new Set(leg.hops.filter(h => routerIds.has(h.deviceId)).map(h => h.deviceId)).size === 4))));
  }
});

test('D-P1 ids and initial order depend only on faulty content, with no deletion gaps or reference positions', () => {
  for (const d of record.variants) {
    const { analysis: a } = fixture(d);
    for (const c of a.candidates.filter(c => c.accepted)) {
      const visible = plainRoutes(c.faulty);
      const permuted = Object.fromEntries(Object.entries(c.faulty).reverse().map(([r, rows]) => [r, [...rows].reverse().map((row, i) => ({ ...row, id: `reference-position-${i + 19}` }))]));
      assert.deepEqual(plainRoutes(permuted), visible);
      for (const [ri, rows] of Object.values(visible).entries()) assert.deepEqual(rows.map(r => r.id), rows.map((_, n) => `route-${ri + 1}-${n + 1}`));
    }
  }
});
