import test from 'node:test';
import assert from 'node:assert/strict';
import { chainRecords, chainCards, records, resolveRecord } from '../src/banks/firewall/tasks.js';
import { create, cardView, levelFields, hints, generatorVersion } from '../src/sections/firewall/logic/predict.js';
import { chainText } from '../src/sections/firewall/uk.js';
import { earnedLevels, earnedVariants } from '../src/sections/firewall/screens/round.js';
import { makeRng } from '../src/engine/rng.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { evaluate } from '../src/sections/firewall/logic/evaluate.js';

const chain = resolveRecord(chainRecords[0]), rules = resolveRecord(records[0]);
const allowed = [
  ['lan-winbox', 'chain-web-request', 'reply-to-pc'],
  ['chain-web-request', 'reply-to-pc', 'lan-winbox'],
  ['chain-web-request', 'lan-winbox', 'reply-to-pc'],
];

test('R5 L1: seeded order replay, all and only three orders, exact pairing after validation', () => {
  const before = structuredClone(chain), orders = new Set();
  for (const seed of [...Array(200).keys(), 'next', 'round']) {
    const task = create(chain, { seed, level: 1 }), ids = task.cards.map(c => c.id);
    assert.deepEqual(task, create(chain, { seed, level: 1 }));
    assert.equal(task.identity.generatorVersion, generatorVersion);
    assert.ok(allowed.some(order => JSON.stringify(order) === JSON.stringify(ids)));
    orders.add(JSON.stringify(ids));
    const reply = task.cards.find(c => c.id === 'reply-to-pc');
    const requestId = cardView(task, reply.id, 1).requestOf;
    assert.equal(requestId, 'chain-web-request');
    assert.ok(ids.indexOf(requestId) < ids.indexOf(reply.id));
    const request = task.cards.find(c => c.id === requestId);
    assert.deepEqual([request.packet.srcIp, request.packet.srcPort, request.packet.dstIp, request.packet.dstPort],
      [reply.packet.dstIp, reply.packet.dstPort, reply.packet.srcIp, reply.packet.srcPort]);
    assert.deepEqual(ids.slice().sort(), chainCards.map(c => c.id).sort());
  }
  assert.deepEqual([...orders].sort(), allowed.map(order => JSON.stringify(order)).sort());
  for (const seed of [0, 1, 2]) assert.deepEqual(create(chain, { seed, level: 1 }).cards.map(c => c.id), allowed[seed]);
  assert.deepEqual(chain, before);
  const invalid = structuredClone(chain); invalid.variants[0].cards.reverse();
  assert.throws(() => create(invalid, { level: 1 }), /invalid-record/);
  const nat = structuredClone(chain); nat.variants[0].cards[0].facts.dstNat = true;
  assert.throws(() => create(nat, { level: 1 }), /invalid-record/);
});

test('R5 cardView: exact detached shapes, topology device names, owners, fields and pair metadata at both levels', () => {
  assert.deepEqual(levelFields(1), ['from', 'to']);
  assert.deepEqual(levelFields(2), ['from', 'to', 'ports', 'state', 'nat']);
  assert.throws(() => levelFields(3), /invalid-record/);
  const task = create(chain, { seed: 1, level: 1 });
  assert.deepEqual(cardView(task, 'lan-winbox', 1), {
    from: { ip: '192.168.88.10', device: 'ПК' }, to: { ip: '192.168.88.1' },
    owner: { kind: 'router', name: 'R1', labelId: 'fw-label-router-addresses' }, requestOf: null, fields: ['from', 'to'],
  });
  assert.deepEqual(cardView(task, 'reply-to-pc').owner, { kind: 'host', name: 'ПК', labelId: 'fw-label-pc-address' });
  assert.deepEqual(cardView(task, 'chain-web-request').owner, { kind: 'internet', name: 'інтернет', labelId: 'fw-label-internet-address' });
  assert.equal(cardView(task, 'reply-to-pc').from.device, 'інтернет');
  assert.equal(cardView(task, 'chain-web-request').requestOf, null);
  assert.throws(() => cardView(task, 'missing'), /invalid-selection/);
  const view = cardView(task, 'lan-winbox'); view.fields.push('state'); view.from.ip = 'changed'; view.owner.name = 'changed';
  assert.equal(task.cards.find(c => c.id === 'lan-winbox').packet.srcIp, '192.168.88.10');
  assert.equal(cardView(task, 'lan-winbox').owner.name, 'R1');
  assert.deepEqual(levelFields(1), ['from', 'to']);
  const l2 = create(rules, { seed: 1, level: 2 });
  for (const c of l2.cards) {
    const v = cardView(l2, c.id, 2);
    assert.deepEqual(Object.keys(v), ['from', 'to', 'owner', 'requestOf', 'fields']);
    assert.deepEqual(v.fields, levelFields(2));
    assert.equal(v.to.ip, c.packet.dstIp);
  }
  assert.deepEqual(cardView(l2, 'port-forward').owner, { kind: 'host', name: 'сервер', labelId: 'fw-label-server-address' });
  // A server can also be the sender. Follow topology addresses and IDs, not
  // packet IDs, hardcoded addresses or the bank array's positions.
  const mapped = structuredClone(task);
  mapped.topology.hosts.find(h => h.role === 'pc').address = '10.0.0.10';
  mapped.topology.hosts.find(h => h.role === 'pc').id = 'workstation';
  mapped.cards.find(c => c.id === 'reply-to-pc').packet.dstIp = '10.0.0.10';
  mapped.cards.find(c => c.id === 'lan-winbox').packet.srcIp = mapped.topology.hosts.find(h => h.role === 'web-server').address;
  assert.equal(cardView(mapped, 'lan-winbox').from.device, 'сервер');
  assert.equal(cardView(mapped, 'reply-to-pc').owner.labelId, 'fw-label-workstation-address');
});

test('R5 L1: task and hint ladder use screen words and the task addresses, including a remapped network', () => {
  for (const remap of [false, true]) {
    const record = structuredClone(chain);
    if (remap) {
      const addresses = new Map([
        ['100.64.0.2', '100.65.0.2'], ['192.168.88.1', '10.20.30.1'], ['192.168.88.10', '10.20.30.10'],
        ['192.168.88.20', '10.20.30.20'], ['203.0.113.50', '8.8.8.8'],
      ]);
      const v = record.variants[0];
      v.topology.router.interfaces.forEach(i => { i.address = addresses.get(i.address); });
      v.topology.router.gateway = '100.65.0.1';
      v.topology.hosts.forEach(h => { h.address = addresses.get(h.address); });
      v.cards.forEach(c => { c.packet.srcIp = addresses.get(c.packet.srcIp); c.packet.dstIp = addresses.get(c.packet.dstIp); });
    }
    const task = create(record, { level: 1, seed: 1 });
    assert.equal(task.text, 'Для кожного пакета визнач, кому його адресовано: самому роутеру чи іншому пристрою.');
    for (const c of task.cards) {
      const ladder = hints(task, {}, { cardId: c.id });
      assert.deepEqual(ladder.map(h => h.rung), [1, 2, 3]);
      const known = [...task.topology.router.interfaces.map(i => i.address), ...task.topology.hosts.map(h => h.address)];
      for (const h of ladder.slice(0, 2)) {
        const text = chainText(h.code, h.params);
        assert.match(text, /Куди/); assert.match(text, /адреси цього роутера/);
        assert.doesNotMatch(text, /Третій|Окремий приклад|192\.0\.2\.|198\.51\.100\.|undefined/);
        for (const address of text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []) assert.ok(known.includes(address));
      }
      // Hint 3 is an example of its own: it can't answer this card or the next (Андрій).
      const example = chainText(ladder[2].code, ladder[2].params);
      assert.match(example, /Окремий приклад/);
      for (const address of known) assert.ok(!example.includes(address));
      assert.ok(chainText(ladder[0].code, ladder[0].params).includes(c.packet.dstIp));
      for (const i of task.topology.router.interfaces) assert.ok(chainText(ladder[0].code, ladder[0].params).includes(i.address));
    }
  }
});

test('R5 L2: first hint compares the destination after dst-NAT; ordinary packets keep their destination', () => {
  const task = create(rules, { level: 2, seed: 1 });
  for (const c of task.cards) {
    const hint = hints(task, {}, { cardId: c.id })[0], text = chainText(hint.code, hint.params);
    assert.equal(hint.code, 'hint-door');
    assert.equal(hint.params.to, c.packet.dstIp);
    assert.ok(text.includes(c.packet.dstIp));
    if (c.facts.dstNat) {
      assert.match(text, /Після dst-NAT.*адреса «Куди» — 192\.168\.88\.20.*Порівняй саме цю адресу/);
      assert.equal(hint.params.natFrom, '100.64.0.2');
    } else assert.doesNotMatch(text, /Після dst-NAT/);
  }
  assert.match(chainText('hint-door'), /після dst-NAT/);
});

test('R5 L2: rejection sampling matches the historical algorithm on all variants and 200 seeds', () => {
  for (const variant of rules.variants) for (let seed = 0; seed < 200; seed++) {
    const rng = makeRng(seed);
    let expected;
    for (let attempt = 0; attempt < 1024; attempt++) {
      const candidate = rng.shuffle(variant.cards).slice(0, Math.min(6, variant.cards.length));
      const walks = candidate.map(c => evaluate(variant.policy, c, classify(variant.topology, c)));
      if (['input', 'forward'].every(h => walks.some(w => w.hook === h))
        && walks.some(w => w.decidedBy === 'chain-end') && candidate.filter(c => c.safety).length >= 2) { expected = candidate; break; }
    }
    const task = create(rules, { variantId: variant.id, level: 2, seed });
    assert.deepEqual(task.cards.map(c => c.id), expected.map(c => c.id));
    assert.deepEqual(task, create(rules, { variantId: variant.id, level: 2, seed }));
  }
});

test('R5 version filtering: only the current generator can earn level and variant marks', () => {
  const instances = {};
  for (const level of [1, 2]) {
    const task = create(level === 1 ? chain : rules, { level, seed: 1 });
    for (const gen of [undefined, 1, 2, 3, generatorVersion + 1]) {
      const identity = { ...task.identity, generatorVersion: gen };
      instances[JSON.stringify(identity)] = { session: { earned: { solved: true } } };
    }
  }
  assert.deepEqual([...earnedLevels(instances)], []);
  assert.deepEqual([...earnedVariants(instances)], []);
  for (const level of [1, 2]) {
    const task = create(level === 1 ? chain : rules, { level, seed: 1 });
    instances[task.instanceKey] = { session: { earned: { solved: true } } };
  }
  assert.deepEqual([...earnedLevels(instances)], [1, 2]);
  assert.deepEqual([...earnedVariants(instances)], ['chain', 'basic']);
  assert.deepEqual([...earnedLevels(null)], []);
});
