import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { create } from './helpers/routing.mjs';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { createLeakInspector, leaks, instanceAddresses } from './helpers/routing-leaks.mjs';
import { leaks as original } from './fixtures/routing-leaks-v1.mjs';

const kinds = ['text', 'feedback', 'placeholder', 'given', 'rules', 'text-equivalent',
  'ping', 'strip', 'path', 'demonstration', 'hint-question', 'hint-evidence', 'network-feedback', 'example', 'submitted'];

test('prepared leak inspector agrees with the frozen matcher for every variant, base/generated and surface kind', () => {
  let cases = 0;
  for (const record of tasks) for (const variant of record.variants) for (const seed of [null, 42]) {
    const task = create(record, { variantId: variant.id, ...(seed === null ? {} : { seed }) });
    const inspect = createLeakInspector(task);
    const routes = Object.values(task.variant.referenceRoutes).flat();
    const texts = ['safe text', 'R1.if1 → g0/0', 'напр. 10.0.0.25',
      '/24 = 255.255.255.0, /30 = 255.255.255.252; від 2 до 254',
      '/ip route add dst-address=0.0.0.0/0 gateway=[GATEWAY аплінку]',
      ...syntaxList.map(s => routes.map(r => s.command(r)).join(' ')),
      [...instanceAddresses(task)].join(' '),
      routes.map(r => `distance <b>${r.distance ?? 1}</b>. ${r.dst} / ${r.prefix} ${r.via ?? ''}`).join(' '),
    ];
    for (const kind of kinds) for (const text of texts) {
      assert.deepEqual(inspect(text, kind), original(task, text, kind), `${variant.code}/${seed}/${kind}`);
      cases++;
    }
    for (const syntax of syntaxList) {
      const answer = task.variant.referenceRoutes;
      const context = { syntax: syntax.id, answer };
      const text = Object.values(answer).flat().map(r => syntax.command(r)).join(' ');
      assert.deepEqual(inspect(text, 'submitted', context), original(task, text, 'submitted', context));
      assert.deepEqual(inspect(text + ' leaked', 'submitted', context), ['unproven-submission']);
      cases += 2;
    }
  }
  assert.equal(cases, 5282);
});

test('one-shot leak checks still read changed task facts', () => {
  const task = structuredClone(create(tasks[0]));
  const surface = 'напр. 203.0.113.77';
  assert.deepEqual(leaks(task, surface, 'placeholder'), []);
  task.network.endpoints[0].ip = '203.0.113.77';
  assert.deepEqual(leaks(task, surface, 'placeholder'), ['bank-address-in-placeholder']);
});
