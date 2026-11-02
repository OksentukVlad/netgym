import test from 'node:test';
import assert from 'node:assert/strict';
import { contains, maskToPrefix } from '../src/engine/ip.js';
import { routingExample } from '../src/sections/routing/logic/examples.js';
import { maskExample } from '../src/sections/ip/logic/examples.js';
import { setupExample } from '../src/sections/setup/logic/examples.js';
import { orderExample } from '../src/sections/firewall/logic/examples.js';
import { portsExample, interVlanExample } from '../src/sections/vlan/logic/examples.js';
import * as routing from './helpers/routing.mjs';
import * as mask from '../src/sections/ip/logic/mask.js';
import * as setup from '../src/sections/setup/logic/deck.js';
import * as ports from '../src/sections/vlan/logic/ports.js';
import * as route from '../src/sections/vlan/logic/route.js';
import * as order from '../src/sections/firewall/logic/order.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { evaluate, validatePolicy } from '../src/sections/firewall/logic/evaluate.js';
import { tasks } from '../src/banks/routing/tasks.js';
import { decks } from '../src/banks/setup/index.js';
import portRecords from '../src/banks/vlan/ports.js';
import routeRecords from '../src/banks/vlan/route.js';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';

const syntaxes = ['cisco', 'routeros'];
const factories = [routingExample, maskExample, setupExample, orderExample, portsExample, interVlanExample];
const addresses = value => JSON.stringify(value).match(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.]\d)/g) ?? [];

test('R4: examples have only reserved addresses (apart from explicitly exempt masks/defaults), and factories return independent state', () => {
  for (const make of factories) for (const syntax of syntaxes) {
    const example = make({ syntax }), snapshot = structuredClone(example);
    const ips = addresses(example).filter(ip => ip !== '0.0.0.0' && maskToPrefix(ip) === null);
    if (make !== setupExample) assert.ok(ips.length, make.name);
    for (const ip of ips) assert.ok(contains('192.0.2.0', 24, ip) || contains('198.51.100.0', 24, ip), `${make.name}: ${ip}`);
    example.rows[0][0] = 'edited';
    example.answer.extra = true;
    assert.deepEqual(make({ syntax }), snapshot, `${make.name}: no shared mutable objects`);
    assert.notStrictEqual(example.task, make({ syntax }).task);
  }
  for (const syntax of syntaxes) {
    const e = routingExample({ syntax, taskNumber: 15 });
    for (const ip of addresses(e).filter(ip => ip !== '0.0.0.0' && maskToPrefix(ip) === null)) assert.ok(contains('192.0.2.0', 24, ip) || contains('198.51.100.0', 24, ip));
  }
});

test('routing: both vendors solve the independent row and full instance; task 15 has a main and companion backup route', () => {
  for (const syntax of syntaxes) for (const taskNumber of [1, 15]) {
    const e = routingExample({ syntax, taskNumber });
    assert.equal(routing.check(e.task, e.answer).ok, true);
    for (const [i, fields] of e.fields.entries()) assert.equal(routing.checkRow({ ...e.task, variant: { ...e.task.variant, referenceRoutes: e.answer } }, 'R1', i, fields, syntax).ok, true);
    const wrong = structuredClone(e.answer); wrong.R1 = [];
    assert.equal(routing.check(e.task, wrong).ok, false, 'checker exercises a real route');
    if (taskNumber === 15) {
      assert.equal(e.rows.length, 2); assert.match(e.context, /ISP1.*ISP2/);
      assert.deepEqual(e.answer.R1.map(r => r.distance), [1, 5]);
      const noBackup = { R1: e.answer.R1.slice(0, 1) };
      assert.equal(routing.check(e.task, noBackup).ok, false);
      const reversed = structuredClone(e.answer); reversed.R1[0].distance = 6;
      assert.equal(routing.check(e.task, reversed).ok, false);
    }
    // All bank tasks/variants, guided row shapes and free behavioural checking.
    for (const record of tasks) for (const variant of record.variants) {
      const task = routing.create(record, { variantId: variant.id });
      const before = structuredClone(task);
      assert.equal(routing.check(task, e.answer).ok, false, `${record.id}/${variant.id}/${syntax}/${taskNumber}`);
      for (const [router, rows] of Object.entries(task.variant.referenceRoutes)) for (let i = 0; i < rows.length; i++) {
        for (const fields of e.fields) assert.equal(routing.checkRow(task, router, i, fields, syntax).ok, false);
      }
      assert.deepEqual(task, before, 'example checks never mutate the learner instance');
    }
  }
});

test('mask: /26 ruler agrees with its own checker, and complete answer fails every task level including fit tasks', () => {
  const e = maskExample();
  assert.equal(mask.check(e.task, e.answer).ok, true);
  assert.deepEqual(e.ruler, { min: 0, max: 255, value: 77, start: 64, end: 127, blockSize: 64, labelStep: 32, prefix: 26 });
  const kinds = new Set();
  for (const level of [1, 2, 3]) for (let seed = 0; seed < 50; seed++) {
    const task = mask.create(null, { seed, level }); kinds.add(task.kind);
    assert.equal(mask.check(task, e.answer).ok, false);
  }
  assert.deepEqual([...kinds].sort(), ['block', 'fit']);
});

test('setup: Cisco show running-config is in no deck and requires #; MikroTik is create-before-use without a mode selector', () => {
  for (const syntax of syntaxes) {
    const e = setupExample({ syntax });
    assert.equal(setup.check(e.task, e.answer).ok, true);
    if (syntax === 'cisco') {
      assert.deepEqual(e.rows[0].slice(1), ['show running-config', '#']);
      const wrong = structuredClone(e.answer); wrong.prompts['example-show'] = '(config)#';
      assert.equal(setup.check(e.task, wrong).ok, false);
      for (const deck of decks) assert.ok(deck.cards.every(c => !c.template?.includes('show running-config')));
    } else {
      assert.match(e.rows[0][1], /bridge add name=bridge-example/);
      assert.match(e.rows[1][1], /bridge port add bridge=bridge-example/);
      assert.deepEqual(e.task.prompts, []);
      assert.equal(setup.check(e.task, { ...e.answer, order: [...e.answer.order].reverse() }).ok, false);
    }
    for (const deck of decks) {
      const task = setup.create(deck, { seed: 19 }), before = structuredClone(task);
      assert.equal(setup.check(task, e.answer).ok, false); assert.deepEqual(task, before);
    }
  }
});

test('firewall: two-rule example evaluates correctly through the screen checker engine; reversing it loses the service', () => {
  const e = orderExample(), policy = { id: 'example', rules: e.task.rules };
  assert.deepEqual(validatePolicy(policy, e.task.topology), []);
  const context = classify(e.task.topology, e.card);
  assert.equal(evaluate(policy, e.card, context).verdict, 'accept');
  assert.equal(evaluate({ ...policy, rules: [...policy.rules].reverse() }, e.card, context).verdict, 'drop');
  const other = structuredClone(e.card); other.packet.dstPort = 8444;
  assert.equal(evaluate(policy, other, classify(e.task.topology, other)).verdict, 'drop');
  const record = resolveOrderRecord();
  for (const variant of record.variants) {
    const task = order.create(record, { variantId: variant.id });
    assert.equal(order.check(task, e.answer, record).ok, false);
  }
});

test('VLAN ports and inter-VLAN examples solve their own instances for each vendor, and fail every corresponding learner task', () => {
  for (const syntax of syntaxes) for (const [make, logic, records] of [[portsExample, ports, portRecords], [interVlanExample, route, routeRecords]]) {
    const e = make({ syntax });
    assert.equal(logic.check(e.task, e.answer).ok, true, `${make.name}/${syntax}`);
    const wrong = structuredClone(e.answer);
    if (make === portsExample) wrong.SW1.ports.a1[syntax === 'cisco' ? 'vlan' : 'pvid'] = 320;
    else if (syntax === 'cisco') wrong.R1.subifs[0].vid = 320;
    else wrong.R1.vlanIfs[0].vid = 320;
    assert.equal(logic.check(e.task, wrong).ok, false, 'example has a nonvacuous behavioural check');
    assert.equal(e.rows.length, 1);
    for (const record of records) for (const variant of record.variants) {
      if (variant.syntaxes && !variant.syntaxes.includes(syntax)) continue;
      const task = logic.create(record, { syntax, variantId: variant.id, seed: 19 }), before = structuredClone(task);
      assert.equal(logic.check(task, e.answer).ok, false, `${make.name}/${record.id}/${syntax}`);
      assert.deepEqual(task, before);
    }
  }
});
