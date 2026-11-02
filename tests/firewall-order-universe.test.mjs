import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';
import { buildUniverse, predicateVector, prepareAnalysis } from '../src/sections/firewall/logic/universe.js';
import { evaluate } from '../src/sections/firewall/logic/evaluate.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { validateCard } from '../src/sections/firewall/logic/model.js';
import { permutations } from './helpers/firewall-order.mjs';

const variant = resolveOrderRecord().variants[1], { policy, topology } = variant;
const raw = buildUniverse(policy, topology);
const run = (p, c) => evaluate(p, c, classify(topology, c));
// Independent truth predicates, including every field in home-basic. This
// intentionally does not call the builder or copy its compiled match table.
const truth = c => [classify(topology, c).hook,
  ['established', 'related', 'untracked'].includes(c.facts.state),
  c.facts.state === 'invalid', c.packet.protocol === 'icmp',
  topology.router.lists.LAN.includes(c.facts.ingress),
  ['established', 'related'].includes(c.facts.state), c.facts.state === 'new',
  c.facts.dstNat === false, topology.router.lists.WAN.includes(c.facts.ingress)];

test('FW-2 B1 finite domain: all 120 representatives validate/classify, with only real interface memberships and known facts', () => {
  assert.equal(raw.length, 120);
  const products = new Set();
  for (const c of raw) {
    assert.deepEqual(validateCard(c, topology), []);
    const ctx = classify(topology, c);
    assert.deepEqual(ctx.ingressLists, [c.facts.ingress === 'ether1' ? 'WAN' : 'LAN']);
    assert.notEqual(c.facts.state, 'unknown'); assert.notEqual(c.facts.dstNat, 'unknown');
    products.add([ctx.hook, c.facts.state, c.packet.protocol, c.facts.ingress, c.facts.dstNat].join());
  }
  assert.equal(products.size, 120);
  for (const hook of ['input', 'forward']) assert.equal(raw.filter(c => classify(topology, c).hook === hook).length, 60);
});

test('FW-2 B1 exactness: equal independent predicate truth vectors imply equal rule matches for expanded valid packets', () => {
  const vectorFor = new Map(raw.map(c => [truth(c).join(), predicateVector(policy, topology, c)]));
  // Unread addresses, either router address, transport ports and ICMP types
  // vary without changing truth classes. TCP and UDP share a non-ICMP class;
  // new/untracked are the remaining state representatives beyond named sets.
  for (const c of raw) for (const port of [0, 22, 53, 8291, 65535]) {
    const expanded = structuredClone(c);
    expanded.packet.srcIp = c.facts.ingress === 'ether1' ? '203.0.113.77' : '192.168.88.42';
    if (classify(topology, c).hook === 'input') expanded.packet.dstIp = '192.168.88.1';
    else expanded.packet.dstIp = c.facts.ingress === 'ether1' ? '192.168.88.99' : '203.0.113.99';
    if (c.packet.protocol === 'icmp') expanded.packet.icmpType = port % 256;
    else { expanded.packet.srcPort = port; expanded.packet.dstPort = port; }
    assert.deepEqual(validateCard(expanded, topology), []);
    assert.deepEqual(predicateVector(policy, topology, expanded), vectorFor.get(truth(expanded).join()));
  }
});

test('FW-2 B1 evaluator proof: compiled classes agree with all raw packets for every local-chain permutation', () => {
  for (const chain of ['input', 'forward']) {
    const p = { ...policy, rules: policy.rules.filter(r => r.chain === chain) }, compiled = prepareAnalysis(p, topology);
    for (const order of permutations(p.rules.map(r => r.id))) {
      const learner = { ...p, rules: order.map(id => p.rules.find(r => r.id === id)) };
      const fired = new Set(); let sameVerdicts = true;
      for (const c of raw) {
        const actual = run(learner, c), expected = run(p, c);
        sameVerdicts &&= actual.verdict === expected.verdict;
        for (const s of actual.steps) if (s.outcome === 'match' || s.outcome === 'marked') fired.add(s.ruleId);
      }
      const result = compiled.analyze(order);
      assert.equal(result.sameVerdicts, sameVerdicts);
      assert.deepEqual(result.deadRuleIds, order.filter(id => !fired.has(id)));
    }
  }
});

for (const [name, field, values, extras = {}] of [
  ['CIDR', 'srcAddress', ['203.0.113.0/24']],
  ['destination CIDR', 'dstAddress', ['192.168.88.0/24']],
  ['overlapping port ranges', 'dstPort', [{ from: 20, to: 30 }, { from: 25, to: 40 }], { protocol: { values: ['tcp'], not: false } }],
  ['scalar port without a partition proof', 'dstPort', [80], { protocol: { values: ['tcp'], not: false } }],
  ['egress', 'outInterfaceList', ['LAN']],
  ['interface predicate without a partition proof', 'inInterface', ['ether1']],
]) test(`FW-2 B1 rejects unsupported partition: ${name}`, () => {
  const p = structuredClone(policy);
  p.rules[8].match = { ...extras, [field]: { values, not: false } };
  assert.throws(() => buildUniverse(p, topology), /unsupported-universe/);
});

test('FW-2 B1 rejects other topologies/unknown facts; unknown is not silently treated as accept or drop', () => {
  const t = structuredClone(topology); t.router.lists.LAN = ['ether1', 'bridge'];
  assert.throws(() => buildUniverse(policy, t), /unsupported-universe/);
  const c = structuredClone(raw.find(c => classify(topology, c).hook === 'input'));
  c.facts.state = 'unknown';
  assert.equal(run(policy, c).verdict, 'unknown');
  const dropFirst = { ...policy, rules: [policy.rules[4], ...policy.rules.filter(r => r.id !== 'r5')] };
  const acceptFirst = { ...policy, rules: [policy.rules[2], ...policy.rules.filter(r => r.id !== 'r3')] };
  c.packet = { srcIp: c.packet.srcIp, dstIp: c.packet.dstIp, protocol: 'icmp', icmpType: 8 };
  assert.equal(run(dropFirst, c).verdict, 'drop'); assert.equal(run(acceptFirst, c).verdict, 'accept');
  assert.notEqual(run(policy, c).verdict, run(dropFirst, c).verdict);
  assert.notEqual(run(policy, c).verdict, run(acceptFirst, c).verdict);
  assert.throws(() => prepareAnalysis(policy, topology, [c]), /unsupported-universe-facts/);
});
