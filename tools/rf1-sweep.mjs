// Invoked by tests/rf1-sweep.test.mjs; not a separate runner stage.
import assert from 'node:assert/strict';
import { check as checkRouting } from '../src/sections/routing/logic/static.js';
import { analyse, classify, levelCodes, repair, routeKey } from '../src/sections/routing/logic/faults.js';
import { topologyRepair, splitRepair, sampledInternetOnly } from '../tests/helpers/rf1-repairs.mjs';
import { validateRoute } from '../src/engine/route-validation.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
import { templateTask } from '../src/sections/routing/logic/faults-frozen.js';
import frozen from '../src/banks/routing/faults-results.js';

export function sweep(record, bank, seeds, { exhaustive = true, onSeed = () => {} } = {}) {
  const matrix = new Map(), rejected = {}, witnesses = new Set(), combinations = new Map(), behaviours = new Map();
  const timingMs = { analysis: 0, repairs: 0, levels: 0, sites: 0 }, started = performance.now();
  let candidates = 0, accepted = 0, checkedSites = 0, canonicalChecks = 0;
  for (const seed of seeds) for (const definition of record.variants) {
    let stage = performance.now();
    const source = bank.tasks.find(r => r.id === definition.taskId);
    const { internal: task } = templateTask(source, definition.variantId, seed,
      frozen.results[`${source.id}/${definition.variantId}`]);
    const analysis = analyse(task);
    // Full verifies every frozen choice, including rejected gates, translated
    // walks and evidence signatures on every seed. Fast keeps seed witnesses.
    const replay = F.inspect(record, { bank, seed, level: definition.levels[0],
      taskId: definition.taskId, variantId: definition.variantId });
    assert.deepEqual(replay.candidates, analysis.candidates, `live/frozen ${seed}/${source.id}`);
    timingMs.analysis += performance.now() - stage;
    stage = performance.now();
    // All canonical repairs reconstruct the same healthy table. Cache only the
    // pure boolean, scoped to this exact task/policy, by forwarding content.
    const checked = new Map();
    const passes = routes => {
      const key = routeKey(routes);
      if (!checked.has(key)) { checked.set(key, checkRouting(task, routes).ok); canonicalChecks++; }
      return checked.get(key);
    };
    assert.ok(passes(analysis.baseline), 'healthy baseline');
    for (const code of new Set(analysis.candidates.filter(c => c.accepted).map(c => c.site.code))) {
      const levels = definition.levels.filter(l => levelCodes[l].includes(code));
      assert.ok(levels.length, `unadvertised cause ${definition.taskId}/${code}`);
      // Fast's independent repair/requirement witnesses live in rf1-internet;
      // full crosses both constructors and the violation with every cause/seed.
      const m = exhaustive ? F.inspect(record, { bank, seed, level: levels[0], taskId: definition.taskId, variantId: definition.variantId, faultCode: code }) : null;
      const publicTask = m?.task;
      for (const construct of exhaustive ? [topologyRepair, splitRepair] : []) {
        const routes = construct(publicTask);
        assert.notDeepEqual(routes, m.baseline, 'independent alternative differs from canonical table');
        assert.ok(F.check(publicTask, { routes, cause: code }, { step: 'cause' }).ok, `${seed}/${definition.taskId}/${code}/${construct.name}`);
      }
      if (publicTask?.requirements.length) {
        const rejected = F.check(publicTask, { routes: sampledInternetOnly(publicTask) });
        assert.ok(rejected.evidence.snapshot.rows.every(p => p.ok));
        assert.equal(rejected.code, 'internet-coverage-missing');
        assert.match(F.feedback(publicTask, rejected), /поза мережами на схемі.*інтернет/);
      }
      const key = `${definition.taskId}/${definition.variantId}/${code}`;
      const combination = combinations.get(key) ?? { taskId: definition.taskId, variantId: definition.variantId, code, levels,
        seeds: 0, independentRepairs: 0, requirementFailures: 0 };
      combination.seeds++; combination.independentRepairs += exhaustive ? 2 : 0;
      if (publicTask?.requirements.length) combination.requirementFailures++;
      combinations.set(key, combination);
    }
    timingMs.repairs += performance.now() - stage;
    stage = performance.now();
    for (const level of definition.levels) {
      const m = F.inspect(record, { bank, seed, level, taskId: definition.taskId, variantId: definition.variantId });
      const canonical = exhaustive ? F.solution(m.task) : { routes: m.baseline, cause: m.site.code };
      assert.ok(F.check(m.task, canonical, { step: 'cause' }).ok);
    }
    timingMs.levels += performance.now() - stage;
    stage = performance.now();
    const classes = new Set();
    for (const candidate of analysis.candidates) {
      candidates++;
      const { site } = candidate, key = `${definition.taskId}/${definition.variantId}/${site.key}`;
      const row = matrix.get(key) ?? { taskId: definition.taskId, variantId: definition.variantId, code: site.code,
        router: site.router, index: site.index, siteKey: site.key, accepted: 0, rejected: 0, reasons: {} };
      if (candidate.accepted) {
        row.accepted++; accepted++;
        for (const level of definition.levels.filter(l => levelCodes[l].includes(site.code))) witnesses.add(`${level}/${site.code}`);
      } else {
        row.rejected++;
        for (const reason of candidate.gates) {
          row.reasons[reason] = (row.reasons[reason] ?? 0) + 1;
          rejected[reason] = (rejected[reason] ?? 0) + 1;
        }
      }
      // Keep every cause, gate and request/reply stop class per variant. Router
      // identities and row positions are repetition; full verifies every site.
      const behaviour = JSON.stringify([site.code, candidate.accepted, candidate.gates,
        [...new Set(candidate.observation.flatMap(p => ['request', 'reply'].flatMap(direction =>
          p[direction] && !p[direction].ok ? [`${direction}/${p[direction].stop.code}`] : [])))].sort()]);
      const behaviourKey = `${definition.taskId}/${definition.variantId}/${behaviour}`;
      if (!behaviours.has(behaviourKey)) behaviours.set(behaviourKey, { taskId: definition.taskId, variantId: definition.variantId,
        seed, siteKey: site.key, behaviour: JSON.parse(behaviour) });
      if (exhaustive || !classes.has(behaviour)) {
        classes.add(behaviour); checkedSites++;
        if (candidate.accepted) {
          assert.deepEqual(classify(analysis.baseline, candidate.faulty), [site.code]);
          assert.ok(candidate.observation.some(p => !p.ok));
          assert.ok(Object.entries(candidate.faulty).every(([r, rows]) => rows.every(row => !validateRoute(task.network, r, row))));
          assert.ok(!analysis.candidates.some(c => c.valid && c.site.code !== site.code && c.signature === candidate.signature));
          assert.ok(passes(repair(candidate.faulty, analysis.baseline, site)), `${seed}/${key}`);
        } else {
          assert.ok(candidate.gates.length, 'rejected planting has an explicit gate');
        }
      }
      matrix.set(key, row);
    }
    assert.ok(classes.size, 'at least one behaviour witness per variant');
    timingMs.sites += performance.now() - stage;
    if (definition === record.variants.at(-1)) onSeed({ seed, candidates, accepted, checkedSites, timingMs, elapsedMs: performance.now() - started });
  }
  for (const [level, codes] of Object.entries(levelCodes)) for (const code of codes) assert.ok(witnesses.has(`${level}/${code}`), `missing advertised witness ${level}/${code}`);
  return { seeds, exhaustive, candidates, accepted, rejected, checkedSites, canonicalChecks, timingMs,
    elapsedMs: performance.now() - started, behaviours: [...behaviours.values()], witnesses: [...witnesses].sort(),
    combinations: [...combinations.values()], matrix: [...matrix.values()] };
}
