import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as bank from '../src/banks/routing/tasks.js';
import { record } from '../src/banks/routing/faults.js';
import frozen from '../src/banks/routing/faults-results.js';
import { frozenInputs, frozenAnalysis, templateTask, generatorVersion, tableVersion } from '../src/sections/routing/logic/faults-frozen.js';
import { entryFor, sourceHash } from '../tools/freeze-faults.mjs';
import { create } from '../src/sections/routing/logic/static.js';
import { analyse } from '../src/sections/routing/logic/faults.js';
import * as F from '../src/sections/routing/logic/faults-exercise.js';
import { full } from './helpers/sweep-mode.mjs';
import { privatePools } from '../src/engine/renumber.js';
import { contains, toInt } from '../src/engine/ip.js';
import { sites } from '../src/sections/routing/logic/faults.js';

test('RF-1 frozen data matches exact bank inputs and transitive logic sources', () => {
  assert.deepEqual(frozen, JSON.parse(readFileSync(new URL('../src/banks/routing/faults-results.json', import.meta.url))));
  assert.equal(frozen.sourceHash, sourceHash(), 'stale RF-1 table: run node tools/freeze-faults.mjs');
  assert.equal(frozen.inputs, JSON.stringify(frozenInputs(record, bank)));
  assert.equal(frozen.tableVersion, tableVersion);
  assert.equal(frozen.generatorVersion, generatorVersion);
  assert.deepEqual(Object.keys(frozen.results), record.variants.map(d => `${d.taskId}/${d.variantId}`));
});

test(`RF-1 frozen templates equal original live analysis (${full ? 'all' : 'deterministic sample'})`, () => {
  for (const definition of record.variants.filter((d, i) => full || i === 0 || d.levels.includes(3))) {
    const source = bank.tasks.find(t => t.id === definition.taskId);
    const task = create(source, { bank, seed: 0, variantId: definition.variantId });
    assert.deepEqual(frozen.results[`${source.id}/${definition.variantId}`], entryFor(task, analyse(task)));
  }
});

test('RF-1 stale bank content fails before returning a task, including same-object edits', () => {
  const changed = { ...bank, tasks: structuredClone(bank.tasks) };
  F.create(record, { bank: changed });
  changed.tasks[0].variants[0].referenceRoutes.R1[0].via = '10.0.0.1';
  assert.throws(() => F.create(record, { bank: changed }), /stale-faults-table/);
  assert.throws(() => F.create(record, { bank: { ...bank, bankRevision: 999 } }), /stale-faults-table/);
  assert.throws(() => F.create(record, { bank: { ...bank, faultsFrozen: null } }), /stale-faults-table/);
  const optimiser = structuredClone(bank.frozen);
  optimiser.results['routing.task-01/main'].answer.R1 = [];
  assert.throws(() => F.create(record, { bank: { ...bank, frozen: optimiser } }), /stale-faults-table/);
});

test('RF-1 masks preserve host offsets and destination increments for every possible salt', () => {
  for (const definition of record.variants) {
    const source = bank.tasks.find(t => t.id === definition.taskId);
    const entry = frozen.results[`${source.id}/${definition.variantId}`];
    assert.ok(entry.masks.some(mask => mask !== 0), 'seeded address variation');
    for (const [i, pool] of privatePools.entries())
      assert.equal(entry.masks[i] & ~((2 ** (32 - pool.prefix)) - 1), 0, 'pool prefix cannot change');
    const { internal, translate } = templateTask(source, definition.variantId, 9999, entry);
    const poolOf = ip => privatePools.findIndex(p => contains(p.dst, p.prefix, ip));
    const preservesOffsets = (ip, prefix) => {
      const pool = poolOf(ip);
      if (pool >= 0) assert.equal(entry.masks[pool] & ((2 ** (32 - prefix)) - 1), 0);
    };
    for (const device of internal.network.devices) for (const iface of device.interfaces)
      if (iface.address) preservesOffsets(iface.address.ip, iface.address.prefix);
    for (const site of sites(internal)) {
      const row = internal.variant.referenceRoutes[site.router][site.index];
      if (row.prefix) preservesOffsets(row.dst, row.prefix);
      if (site.code === 'wrong-destination') {
        const pool = poolOf(row.dst);
        assert.ok(pool >= 0); assert.equal(poolOf(site.changed), pool);
        assert.equal((toInt(row.dst) ^ toInt(site.changed)) & entry.masks[pool], 0,
          'no salt bit may meet an increment carry');
      }
    }
    // The per-pool XOR is its own inverse on addresses and prefixes.
    for (const device of internal.network.devices) for (const iface of device.interfaces)
      if (iface.address) assert.equal(translate(translate(iface.address.ip)), iface.address.ip);
  }
});

test('RF-1 generator 3 replays deterministically, detaches private data and rejects old identities', () => {
  const params = { bank, seed: 9999, level: 3 };
  const first = F.inspect(record, params), original = JSON.stringify(first.task);
  assert.equal(first.task.identity.generatorVersion, 3);
  first.candidates[0].gates.push('tooling-mutation');
  first.candidates[0].observation.length = 0;
  first.baseline[Object.keys(first.baseline)[0]] = [];
  const second = F.inspect(record, params);
  assert.equal(JSON.stringify(second.task), original);
  assert.ok(!second.candidates.some(c => c.gates.includes('tooling-mutation')));
  const old = structuredClone(second.task); old.identity.generatorVersion = 2;
  assert.throws(() => F.restore(old, record, bank), /unsupported faults generator/);
  const source = bank.tasks.find(t => t.id === second.task.identity.taskId);
  const entry = frozen.results[`${source.id}/main`];
  const mapped = templateTask(source, 'main', 9999, entry).internal;
  assert.deepEqual(frozenAnalysis(record, bank, source, 'main', 9999).candidates, analyse(mapped).candidates);
});
