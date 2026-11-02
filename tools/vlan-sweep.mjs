import assert from 'node:assert/strict';
import { sweepSeeds } from '../tests/helpers/sweep-mode.mjs';
import witnesses from '../tests/fixtures/speed-witnesses-v1.json' with { type: 'json' };
import { performance } from 'node:perf_hooks';
import { record } from '../src/banks/vlan/predict.js';
import { records } from '../src/banks/vlan/ports.js';
import { record as faultRecord } from '../src/banks/vlan/faults.js';
import * as faults from '../src/sections/vlan/logic/faults-exercise.js';
import { validateFaultInstance, expectedFaultCoverage } from '../src/banks/vlan/validate.js';
import { repair } from '../src/sections/vlan/logic/faults.js';
import { records as routeRecords } from '../src/banks/vlan/route.js';
import * as route from '../src/sections/vlan/logic/route.js';
import * as predict from '../src/sections/vlan/logic/predict.js';
import * as ports from '../src/sections/vlan/logic/ports.js';
import { validatePredictInstance, validatePortsInstance, validateRouteInstance } from '../src/banks/vlan/validate.js';
import { compileAll } from '../src/sections/vlan/logic/model.js';
import { flood } from '../src/engine/l2.js';
import { applySurprise, reachMap } from '../src/sections/vlan/logic/predict-model.js';
import { generateNetwork, reference } from '../src/sections/vlan/logic/model.js';

export function sweep(seeds = 200, { sample = false, includeFaults = false } = {}) {
  assert.ok(Number.isInteger(seeds) && seeds > 0, 'seeds must be a positive integer');
  const all = Array.from({ length: seeds }, (_, i) => i);
  const select = required => sample ? sweepSeeds(all, required) : all;
  const start = performance.now(), rows = [];
  for (const variant of record.variants) for (const vendor of ['cisco', 'routeros']) for (const surprises of [0, 1, 2]) {
    const rowStart = performance.now(), seenSlots = new Set();
    const key = `${variant.id}/${vendor}`;
    const selected = sample ? select(surprises === 1 ? Object.values(witnesses.slots[key])
      : surprises === 2 ? Object.values(witnesses.pairs[key]) : [0, 1]) : all;
    for (const seed of selected) {
      const task = predict.inspect(record, { variantId: variant.id, seed, vendor, surprises });
      assert.deepEqual(validatePredictInstance(task, variant), []);
      const { tables } = compileAll(task.topology, task.configurations, vendor);
      const current = reachMap(task.topology, tables), answers = predict.solution(task);
      for (const round of task.rounds) assert.deepEqual(new Set(answers[round.id]), flood(task.topology, tables, { from: round.from }).received);
      const checked = predict.check(task, answers);
      assert.equal(checked.ok, true); assert.equal(checked.complete, true); assert.deepEqual(checked.findings, []);
      for (const slot of task.activeSurprises) seenSlots.add(slot.id);
      assert.equal(task.activeSurprises.length, surprises);
      assert.equal(new Set(task.activeSurprises.map(s => `${s.device}/${s.port}`)).size, surprises);
      // Every active slot must matter even with the other slot present.
      const network = generateNetwork(variant, seed), baseline = reference(network, vendor);
      for (const omitted of task.activeSurprises) {
        const alt = structuredClone(baseline);
        for (const slot of task.activeSurprises) if (slot.id !== omitted.id) applySurprise(network, alt, vendor, slot.id);
        const alternative = reachMap(task.topology, compileAll(task.topology, alt, vendor).tables);
        assert.ok(task.rounds.some(r => current[r.from] !== alternative[r.from]));
      }
      const key = host => [host, ...current[host].split(',').filter(Boolean)].sort().join(',');
      const available = new Set(task.topology.hosts.map(h => key(h.device))).size;
      assert.equal(task.rounds.length, available <= 3 ? 3 : 4);
      assert.equal(new Set(task.rounds.map(r => key(r.from))).size, Math.min(task.rounds.length, available));
    }
    if (surprises === 1 && seeds >= 200) assert.deepEqual([...seenSlots].sort(), [...variant.slots[vendor]].sort());
    rows.push({ shape: variant.id, vendor, surprises, instances: selected.length, seeds: selected, observedSlots: [...seenSlots].sort(), ms: Math.round(performance.now() - rowStart) });
  }
  for (const record of records) for (const syntax of ['cisco', 'routeros']) {
    const rowStart = performance.now(), selected = select([0, 1]);
    for (const seed of selected) {
      const task = ports.create(record, { seed, syntax }), reference = ports.solution(task);
      assert.deepEqual(validatePortsInstance(task, reference), []);
      const result = ports.check(task, reference);
      assert.equal(result.ok, true); assert.equal(result.complete, true); assert.deepEqual(result.findings, []);
    }
    rows.push({ task: record.id, syntax, instances: selected.length, seeds: selected, ms: Math.round(performance.now() - rowStart) });
  }
  const gateways = { one: 0, last: 0, other: 0 };
  for (const record of routeRecords) for (const syntax of record.variants[0].syntaxes) {
    const rowStart = performance.now(), selected = sample ? select(Object.values(witnesses.gateways[`${record.id}/${syntax}`])) : all;
    for (const seed of selected) {
      const task = route.create(record, { seed, syntax }), answer = route.solution(task);
      assert.deepEqual(validateRouteInstance(task, answer), []);
      const result = route.check(task, answer);
      assert.equal(result.ok, true); assert.equal(result.complete, true); assert.deepEqual(result.findings, []);
      for (const n of task.networks) {
        const last = Number(n.gateway.split('.').at(-1));
        gateways[last === 1 ? 'one' : last === 254 ? 'last' : 'other']++;
        assert.ok(!task.topology.hosts.some(h => h.ip === n.gateway));
      }
      // Alternate chosen management addresses and the effective CPU path are
      // larger sweeps, intentionally kept outside the ordinary test suite.
      if (task.management) {
        const chosen = task.management.network.replace(/\.0$/, '.75');
        if (syntax === 'cisco') answer.SW1.svi.ip = chosen;
        else {
          answer.SW1.addresses[0].ip = chosen;
          answer.SW1.vlans.forEach(row => { row.tagged = row.tagged.filter(p => p !== 'bridge1'); });
        }
        const changed = route.check(task, answer);
        assert.equal(changed.ok, true);
        assert.deepEqual(changed.findings.map(f => f.code), syntax === 'routeros' ? ['bridge-tag-implicit'] : []);
      }
    }
    rows.push({ task: record.id, syntax, instances: selected.length, seeds: selected, ms: Math.round(performance.now() - rowStart) });
  }
  if (seeds >= 200) {
    assert.ok(gateways.one > gateways.last && gateways.one > gateways.other);
    assert.ok(gateways.last > 0 && gateways.other > 0);
  }
  const faultResults = includeFaults ? sweepFaults(seeds) : undefined;
  return { seeds, ...(faultResults ? { faults: faultResults } : {}),
    predictInstances: rows.filter(r => r.shape).reduce((n, r) => n + r.instances, 0),
    portsInstances: rows.filter(r => r.task?.startsWith('vlan.ports')).reduce((n, r) => n + r.instances, 0),
    routeInstances: rows.filter(r => r.task?.startsWith('vlan.route')).reduce((n, r) => n + r.instances, 0),
    routeGatewayCounts: gateways, ms: Math.round(performance.now() - start), rows };
}
/** Full evidence/coverage sweep is opt-in for imported callers: VLAN-1's
 * existing smoke suite keeps its historical size and runtime. The CLI runs
 * every VLAN round by default. One process, no concurrent suites. */
export function sweepFaults(seeds = 200) {
  const start = performance.now(), rows = [];
  let instances = 0, plantings = 0, rejected = 0, retries = 0;
  const allCodes = new Set();
  for (const shape of faultRecord.variants) for (const vendor of shape.syntaxes) for (const level of shape.levels) {
    const rowStart = performance.now(), applicable = new Set(), covered = new Set(), selected = new Set(), causes = new Set();
    let count = 0, maxRetry = 0;
    const capabilityInstances = {};
    for (let seed = 0; seed < seeds; seed++) {
      const inspection = faults.inspect(faultRecord, { variantId: shape.id, vendor, level, seed });
      const { task, candidates } = inspection;
      assert.deepEqual(validateFaultInstance(inspection), [], `${shape.id}/${vendor}/${level}/${seed}`);
      assert.equal(faults.check(task, faults.solution(task)).ok, true);
      assert.deepEqual(task.initialConfiguration, inspection.faulty);
      retries += inspection.retry; maxRetry = Math.max(maxRetry, inspection.retry);
      selected.add(inspection.site.code); instances++;
      const capability = vendor === 'cisco' ? 'default' : task.capabilities.dynamicBridgeTagged ? 'dynamic' : 'static';
      capabilityInstances[capability] = (capabilityInstances[capability] ?? 0) + 1;
      for (const key of expectedFaultCoverage(task, inspection.baseline)) applicable.add(key);
      for (const c of candidates) {
        // Site IDs retain physical ports and classify generated VIDs by slot.
        // Capabilities are part of the coverage tuple.
        const key = `${c.site.key}/${c.site.capability}`;
        if (!c.accepted) { rejected++; continue; }
        covered.add(key); causes.add(c.site.code); allCodes.add(c.site.code);
        assert.equal(faults.evaluate(task, repair(c.faulty, inspection.baseline, c.site, vendor)).ok, true);
        assert.ok(!candidates.some(other => other.valid && other.site.code !== c.site.code && other.signature === c.signature));
        count++; plantings++;
      }
    }
    assert.deepEqual([...applicable].sort(), [...covered].sort(), `uncovered sites: ${shape.id}/${vendor}/${level}`);
    if (seeds >= 200) assert.deepEqual([...selected].sort(), [...causes].sort(), `unselected cause: ${shape.id}/${vendor}/${level}`);
    rows.push({ shape: shape.id, vendor, level, seeds, plantings: count, applicableSites: applicable.size, coveredSites: covered.size,
      capabilityInstances, selectedCauses: [...selected].sort(), coveredCauses: [...causes].sort(), maxRetry, ms: Math.round(performance.now() - rowStart) });
    if (process.env.VLAN_SWEEP_PROGRESS) console.error(`VLAN-3 ${shape.id}/${vendor}/L${level}: ${seeds} seeds, ${count} plantings`);
  }
  assert.equal(allCodes.size, 14);
  return { seeds, instances, plantings, rejected, retries, causes: [...allCodes].sort(), ms: Math.round(performance.now() - start), rows };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2), faultsOnly = args.includes('--faults-only');
  const rest = args.filter(a => a !== '--faults-only');
  assert.ok(rest.length <= 1, 'Usage: node tools/vlan-sweep.mjs [seeds] [--faults-only]');
  const seeds = Number(rest[0] ?? 200);
  console.log(JSON.stringify(faultsOnly ? sweepFaults(seeds) : sweep(seeds, { includeFaults: true }), null, 2));
}
