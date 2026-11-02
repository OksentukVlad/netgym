import test from 'node:test';
import assert from 'node:assert/strict';
import witnesses from './fixtures/speed-witnesses-v1.json' with { type: 'json' };
import { sweepSeeds, full } from './helpers/sweep-mode.mjs';
import { suiteSeeds, goldenSeeds } from './helpers/step9.mjs';
import * as binary from '../src/sections/ip/logic/binary.js';
import { record } from '../src/banks/vlan/predict.js';
import { records } from '../src/banks/vlan/route.js';
import * as predict from '../src/sections/vlan/logic/predict.js';
import * as route from '../src/sections/vlan/logic/route.js';
import { sweep } from '../tools/vlan-sweep.mjs';

const all = Array.from({ length: 200 }, (_, i) => i);

test('speed coverage: binary witnesses cover every prefix in each input parity', () => {
  const expected = binary.prefixes.flatMap(p => [`${p}/0`, `${p}/1`]).sort();
  assert.deepEqual(Object.keys(witnesses.binary).sort(), expected);
  const selected = sweepSeeds(all, Object.values(witnesses.binary));
  for (const [key, seed] of Object.entries(witnesses.binary)) {
    assert.ok(selected.includes(seed), key);
    assert.equal(`${binary.create(null, { seed, level: 3 }).prefix}/${seed % 2}`, key);
  }
});

for (const variant of record.variants) for (const vendor of ['cisco', 'routeros']) {
  const key = `${variant.id}/${vendor}`;
  test(`speed coverage: every surprise slot and paired interaction ${key}`, () => {
    assert.deepEqual(Object.keys(witnesses.slots[key]).sort(), [...variant.slots[vendor]].sort());
    for (const [surprises, required] of [[1, witnesses.slots[key]], [2, witnesses.pairs[key]]]) {
      const selected = sweepSeeds(all, Object.values(required));
      for (const [signature, seed] of Object.entries(required)) {
        assert.ok(selected.includes(seed));
        const task = predict.inspect(record, { variantId: variant.id, vendor, surprises, seed });
        assert.equal(task.activeSurprises.map(s => s.id).sort().join('+'), signature);
      }
    }
  });
}

for (const record of records) for (const syntax of record.variants[0].syntaxes) {
  const key = `${record.id}/${syntax}`;
  test(`speed coverage: .1, .254 and other gateways ${key}`, () => {
    assert.deepEqual(Object.keys(witnesses.gateways[key]).sort(), ['last', 'one', 'other']);
    const selected = sweepSeeds(all, Object.values(witnesses.gateways[key]));
    for (const [category, seed] of Object.entries(witnesses.gateways[key])) {
      assert.ok(selected.includes(seed));
      const task = route.create(record, { syntax, seed });
      const categories = task.networks.map(n => {
        const end = Number(n.gateway.split('.').at(-1));
        return end === 1 ? 'one' : end === 254 ? 'last' : 'other';
      });
      assert.ok(categories.includes(category));
    }
  });
}

test('speed coverage: witnesses survive the size knob; full ignores it', () => {
  const original = process.env.NETGYM_TEST_SEEDS;
  try {
    delete process.env.NETGYM_TEST_SEEDS;
    assert.deepEqual(sweepSeeds(all, [3], 1), full ? all : [0, 3], 'RF-1 default keeps its deterministic witnesses');
    process.env.NETGYM_TEST_SEEDS = '2';
    assert.deepEqual(sweepSeeds(all, [3], 1), full ? all : [0, 1, 3], 'RF-1 one-seed default still expands and retains witnesses');
    assert.deepEqual(sweepSeeds([0, 1, 2, 3], [3]), full ? [0, 1, 2, 3] : [0, 1, 3]);
    process.env.NETGYM_TEST_SEEDS = 'bad';
    if (full) assert.deepEqual(sweepSeeds(all, [3], 1), all);
    else assert.throws(() => sweepSeeds(all, [3], 1), /integer >= 2/);
    if (full) assert.deepEqual(sweepSeeds(all), all);
    else assert.throws(() => sweepSeeds(all), /integer >= 2/);
  } finally {
    if (original === undefined) delete process.env.NETGYM_TEST_SEEDS;
    else process.env.NETGYM_TEST_SEEDS = original;
  }
  assert.equal(suiteSeeds.length >= (full ? 10 : 2), true);
  assert.deepEqual(goldenSeeds, [0, 42, 9999]);
});

// A full sweep must continue to work before new bank combinations have fast
// witnesses. The dedicated witness gates above still validate the fixture.
test('speed coverage: unsampled VLAN sweep does not look up fast witnesses', () => {
  const saved = { slots: witnesses.slots, pairs: witnesses.pairs, gateways: witnesses.gateways };
  try {
    witnesses.slots = {};
    witnesses.pairs = {};
    witnesses.gateways = {};
    const result = sweep(1);
    assert.deepEqual([result.predictInstances, result.portsInstances, result.routeInstances], [18, 8, 7]);
    for (const row of result.rows) assert.deepEqual(row.seeds, [0]);
  } finally {
    Object.assign(witnesses, saved);
  }
});
