import test from 'node:test';
import assert from 'node:assert/strict';
import { contains } from '../src/engine/ip.js';
import { bank, cards, policies, records, topology, safetyCardIds, safetyExceptions, outcomes, clone, resolveRecord, classify, evaluate } from './helpers/firewall.mjs';
import { validateBank } from '../src/banks/firewall/validate.js';
import { validateRecord } from '../src/sections/firewall/logic/predict.js';
import { validatePolicy } from '../src/sections/firewall/logic/model.js';
import { codes } from '../src/sections/firewall/logic/codes.js';

test('firewall bank validates shape and resolved executable records independently', () => {
  assert.deepEqual(validateBank(bank), []);
  for (const r of records) assert.deepEqual(validateRecord(resolveRecord(r)), []);
  for (const p of policies) assert.deepEqual(validatePolicy(p, topology), []);
  assert.equal(cards.length, 17); assert.equal(safetyCardIds.length, 9);
});

test('firewall safety suite passes basic; broken variants declare exactly their safety exceptions', () => {
  for (const p of policies) {
    const exceptions = [];
    for (const id of safetyCardIds) {
      const c = cards.find(c => c.id === id), result = evaluate(p, c, classify(topology, c));
      if (result.verdict !== outcomes['home-basic'][id].verdict) exceptions.push(id);
    }
    assert.deepEqual(exceptions.sort(), [...safetyExceptions[p.id]].sort());
  }
  const invalid = cards.find(c => c.id === 'invalid-fwd');
  assert.equal(invalid.packet.dstIp, '192.168.88.20'); assert.equal(invalid.facts.dstNat, true);
});

test('firewall reference has no dead rules: every rule decides or marks a bank card', () => {
  const used = new Set();
  for (const c of cards) {
    const result = evaluate(policies[0], c, classify(topology, c));
    if (result.decidedBy !== 'chain-end') used.add(result.decidedBy);
    result.steps.filter(s => s.outcome === 'marked').forEach(s => used.add(s.ruleId));
  }
  assert.deepEqual([...used].sort(), policies[0].rules.map(r => r.id).sort());
});

test('firewall address hygiene: only RFC1918, shared WAN and TEST-NET-3', () => {
  const allowed = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['203.0.113.0', 24]];
  const addresses = JSON.stringify(bank).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  assert.ok(addresses.length > 0);
  for (const address of addresses) assert.ok(allowed.some(([net, bits]) => contains(net, bits, address)), address);
});

test('firewall broken variants sample both doors and chain end without naming the fault', () => {
  for (const v of records[0].variants.slice(1)) {
    assert.ok(v.cardIds.length >= 4 && v.cardIds.length <= 5);
    for (const id of ['lan-winbox', 'reply-to-pc']) assert.ok(v.cardIds.includes(id));
    assert.match(v.text.toLowerCase(), /у цьому наборі є помилка/);
    assert.doesNotMatch(v.text, /\br[1-9]\b|правил[ао]\s*[1-9]|вимкнен|вище|нижче/iu);
  }
});

for (const [name, mutate] of [
  ['bank', b => b.expected = {}], ['topology', b => b.topology.expected = {}],
  ['router', b => b.topology.router.expected = {}], ['interface', b => b.topology.router.interfaces[0].expected = {}],
  ['host', b => b.topology.hosts[0].expected = {}], ['policy', b => b.policies[0].expected = {}],
  ['rule', b => b.policies[0].rules[0].expected = {}], ['match', b => b.policies[0].rules[0].match.expected = {}],
  ['predicate', b => b.policies[0].rules[0].match.connectionState.expected = {}],
  ['card', b => b.cards[0].expected = {}], ['packet', b => b.cards[0].packet.expected = {}],
  ['fact', b => b.cards[0].facts.expected = {}], ['NAT origin', b => b.cards[0].facts.dstNatFrom.expected = {}],
  ['record', b => b.records[0].expected = {}], ['variant', b => b.records[0].variants[0].expected = {}],
]) test(`firewall bank rejects unknown fields at ${name}`, () => {
  const b = clone(bank); mutate(b); assert.ok(validateBank(b).length);
});

for (const [name, mutate] of [
  ['unknown list', b => b.policies[0].rules[3].match.inInterfaceList.values = ['DMZ']],
  ['unknown interface', b => b.topology.router.lists.WAN = ['unknown']],
  ['srcnat', b => b.policies[0].rules[8].match.connectionNatState.values = ['srcnat']],
  ['duplicate rule id', b => b.policies[0].rules[1].id = 'r1'],
  ['ports without tcp or udp', b => b.policies[0].rules[4].match.dstPort = { values: [80], not: false }],
  ['input egress matcher', b => b.policies[0].rules[4].match.outInterfaceList = { values: ['LAN'], not: false }],
  ['duplicate card id', b => b.cards[1].id = b.cards[0].id],
  ['unknown card reference', b => b.records[0].variants[0].cardIds.push('missing')],
  ['unknown policy reference', b => b.records[0].variants[0].policyId = 'missing'],
  ['incorrect safety membership', b => b.cards[0].safety = false],
  ['malformed packet', b => b.cards[0].packet = null],
  ['malformed rule', b => b.policies[0].rules[0] = null],
]) test(`firewall bank rejects ${name}`, () => {
  const b = clone(bank); mutate(b); assert.ok(validateBank(b).length);
});

test('firewall rule description codes are registered and bank has no expected answers', () => {
  for (const p of policies) for (const rule of p.rules) assert.ok(codes.includes(rule.descriptionCode));
  assert.doesNotMatch(JSON.stringify(bank), /"(?:verdict|decidedBy|hook|expected|solution)"/);
  for (const b of [null, [], {}, { ...bank, cards: [null] }]) assert.ok(validateBank(b).length);
});
