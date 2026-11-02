import test from 'node:test';
import assert from 'node:assert/strict';
import { topology, policies, cards, outcomes, clone, pred, rule, card, run, classify, evaluate } from './helpers/firewall.mjs';
import { validateRule, validatePolicy, fields } from '../src/sections/firewall/logic/model.js';
import { codes } from '../src/sections/firewall/logic/codes.js';
import { copy, t, walkText } from '../src/sections/firewall/uk.js';

for (const policy of policies) for (const c of cards) test(`firewall hand oracle: ${policy.id} / ${c.id}`, () => {
  const { hook, decidedBy, verdict } = evaluate(policy, c, classify(topology, c));
  assert.deepEqual({ hook, decidedBy, verdict }, outcomes[policy.id][c.id]);
});

test('firewall oracle covers exactly every card on every policy', () => {
  assert.deepEqual(Object.keys(outcomes).sort(), policies.map(p => p.id).sort());
  for (const policy of policies) assert.deepEqual(Object.keys(outcomes[policy.id]).sort(), cards.map(c => c.id).sort());
});

test('firewall first terminal match stops; disabled and other chain remain in trace', () => {
  const result = run([
    rule({}, 'drop', { id: 'off', enabled: false }), rule({}, 'drop', { id: 'other', chain: 'input' }),
    rule({}, 'accept', { id: 'first' }), rule({}, 'drop', { id: 'unreached' }),
  ]);
  assert.equal(result.decidedBy, 'first');
  assert.deepEqual(result.steps.map(s => [s.ruleId, s.position, s.outcome]), [['off', 1, 'disabled'], ['other', 2, 'other-chain'], ['first', 3, 'match']]);
});

test('firewall mismatch uses first render-order failure even if match object order differs', () => {
  const result = run([rule({ dstPort: pred(80), protocol: pred('udp'), connectionState: pred('invalid') })]);
  assert.deepEqual(result.steps[0], { ruleId: 'test-rule', position: 1, outcome: 'mismatch', code: 'mismatch.connectionState', field: 'connectionState', expected: pred('invalid'), actual: 'new' });
});

test('firewall OR within state, AND across fields and negation of whole OR set', () => {
  const match = { connectionState: pred('new', 'invalid'), dstPort: pred(443), protocol: pred('tcp') };
  assert.equal(run([rule(match)]).verdict, 'drop');
  assert.equal(run([rule({ ...match, dstPort: pred(80) })]).decidedBy, 'chain-end');
  assert.equal(run([rule({ connectionState: { values: ['new', 'invalid'], not: true } })]).decidedBy, 'chain-end');
  assert.equal(run([rule({ connectionState: { values: ['established', 'related'], not: true } })]).verdict, 'drop');
});

test('firewall negated lists and !dstnat use complements, including empty memberships', () => {
  const notLan = rule({ inInterfaceList: { values: ['LAN'], not: true } });
  assert.equal(run([notLan]).decidedBy, 'chain-end');
  assert.equal(run([notLan], card('wan-to-pc-new')).verdict, 'drop');
  const notNat = rule({ connectionNatState: { values: ['dstnat'], not: true } });
  assert.equal(run([notNat], card('port-forward')).decidedBy, 'chain-end');
  assert.equal(run([notNat], card('wan-to-pc-new')).verdict, 'drop');
  const c = card('lan-web-out'), ctx = classify(topology, c);
  assert.equal(evaluate({ rules: [notLan] }, c, { ...ctx, ingressLists: [] }).verdict, 'drop');
});

for (const [field, value, mismatch] of [
  ['connectionState', 'new', 'invalid'], ['connectionNatState', 'dstnat', 'dstnat'],
  ['protocol', 'tcp', 'udp'], ['srcAddress', '192.168.88.0/24', '203.0.113.0/24'],
  ['dstAddress', '203.0.113.0/24', '192.168.88.0/24'], ['srcPort', 50008, 9999], ['dstPort', 443, 80],
  ['inInterface', 'bridge', 'ether1'], ['inInterfaceList', 'LAN', 'WAN'],
  ['outInterface', 'ether1', 'bridge'], ['outInterfaceList', 'WAN', 'LAN'],
]) test(`firewall match and mismatch evidence: ${field}`, () => {
  const c = field === 'connectionNatState' ? card('port-forward') : card('lan-web-out');
  const r = rule({ [field]: pred(value) });
  assert.equal(run([r], c).verdict, 'drop');
  const other = field === 'connectionNatState' ? { values: [mismatch], not: true } : pred(mismatch);
  const result = run([rule({ [field]: other })], c);
  assert.equal(result.steps[0].code, `mismatch.${field}`);
  assert.deepEqual(result.steps[0].expected, other);
});

for (const value of [1000, 1001, 1999, 2000, 53]) test(`firewall port ranges inclusive and OR: ${value}`, () => {
  const c = card('lan-web-out'); c.packet.dstPort = value;
  assert.equal(run([rule({ protocol: pred('tcp'), dstPort: pred({ from: 1000, to: 2000 }, 53) })], c).verdict, 'drop');
});
test('firewall port range misses and negation', () => {
  const r = rule({ protocol: pred('tcp'), dstPort: pred({ from: 1000, to: 2000 }) });
  for (const value of [999, 2001]) { const c = card('lan-web-out'); c.packet.dstPort = value; assert.equal(run([r], c).decidedBy, 'chain-end'); }
  r.match.dstPort.not = true;
  assert.equal(run([r]).verdict, 'drop');
});

for (const field of ['connectionState', 'connectionNatState']) for (const not of [false, true]) test(`firewall unknown fact cannot match or skip: ${field}, not=${not}`, () => {
  const c = card('lan-web-out'); c.facts[field === 'connectionState' ? 'state' : 'dstNat'] = 'unknown';
  const result = run([rule({ [field]: { values: [field === 'connectionState' ? 'new' : 'dstnat'], not } })], c);
  assert.equal(result.verdict, 'unknown'); assert.equal(result.code, 'missing-fact');
  assert.equal(result.decidedBy, 'test-rule'); assert.equal(result.steps[0].field, field);
});

test('firewall unknown before known mismatch is a plain mismatch; disabled unknown is skipped', () => {
  const c = card('lan-web-out'); c.facts.state = 'unknown'; c.facts.dstNat = 'unknown';
  const result = run([
    rule({ connectionState: pred('new') }, 'drop', { id: 'off', enabled: false }),
    rule({ connectionState: pred('new'), connectionNatState: pred('dstnat'), dstPort: pred(80) }),
  ], c);
  assert.equal(result.verdict, 'accept'); assert.equal(result.steps[1].field, 'dstPort');
  assert.equal(result.steps[1].outcome, 'mismatch');
});

test('firewall absent port is unknown only when protocol has not already ruled rule out', () => {
  const c = card('lan-web-out'); delete c.packet.dstPort;
  assert.equal(run([rule({ protocol: pred('tcp'), dstPort: pred(443) })], c).verdict, 'unknown');
  c.packet.protocol = 'icmp'; delete c.packet.srcPort;
  assert.equal(run([rule({ protocol: pred('tcp'), dstPort: pred(443) })], c).steps[0].field, 'protocol');
});

test('firewall FastTrack marks, continues, and carries a visible slow-path assumption', () => {
  const walk = evaluate(policies[0], card('reply-to-pc'), classify(topology, card('reply-to-pc')));
  assert.equal(walk.decidedBy, 'r7'); assert.equal(walk.verdict, 'accept');
  assert.deepEqual(walk.steps.filter(s => s.outcome === 'marked').map(s => s.ruleId), ['r6']);
  assert.deepEqual(walk.assumptions, ['fasttrack-slow-path']);
  const text = walkText(walk);
  assert.match(text.assumptions[0], /один пакет/); assert.match(text.assumptions[0], /наступні/);
  assert.match(text.conclusion, /Фільтр пропускає/); assert.doesNotMatch(text.conclusion, /працює/);
  const r = rule({}, 'fasttrack-connection');
  assert.equal(run([r]).decidedBy, 'chain-end');
  assert.equal(run([r, rule({}, 'drop', { id: 'drop' })]).verdict, 'drop');
});

test('firewall FastTrack copy describes mostly bypassing later packets without promising a following accept', () => {
  for (const code of ['fasttrack-not-final', 'fasttrack-slow-path']) {
    const text = t(code);
    assert.match(text, /позначає з’єднання/);
    assert.match(text, /наступні його пакети переважно оминатимуть фільтр/);
    assert.match(text, /цей пакет іде списком далі/);
    assert.doesNotMatch(text, /прискор|accept/iu);
  }
});

for (const state of ['related', 'untracked']) for (const hook of ['input', 'forward']) test(`firewall ${state} in ${hook}`, () => {
  const c = card(hook === 'input' ? 'wan-winbox' : 'wan-to-pc-new'); c.facts.state = state;
  const walk = evaluate(policies[0], c, classify(topology, c));
  assert.equal(walk.decidedBy, hook === 'input' ? 'r1' : 'r7'); assert.equal(walk.verdict, 'accept');
  assert.equal(walk.steps.some(s => s.outcome === 'marked'), state === 'related' && hook === 'forward');
});

test('firewall chain-end accept is adapter-specific in either built-in chain', () => {
  for (const c of [card('lan-web-out'), card('wan-winbox')]) {
    const result = run([], c);
    assert.equal(result.decidedBy, 'chain-end'); assert.equal(result.code, 'chain-end-accepted'); assert.equal(result.verdict, 'accept');
  }
});

for (const [name, mutate] of [
  ['ports without protocol', r => r.match.dstPort = pred(80)],
  ['ports with icmp', r => { r.match.dstPort = pred(80); r.match.protocol = pred('icmp'); }],
  ['ports with negated tcp', r => { r.match.dstPort = pred(80); r.match.protocol = { values: ['tcp'], not: true }; }],
  ['srcnat', r => r.match.connectionNatState = pred('srcnat')],
  ['unknown interface', r => r.match.inInterface = pred('ether9')],
  ['unknown list', r => r.match.inInterfaceList = pred('DMZ')],
  ['outInterface in input', r => { r.chain = 'input'; r.match.outInterface = pred('bridge'); }],
  ['outInterfaceList in input', r => { r.chain = 'input'; r.match.outInterfaceList = pred('LAN'); }],
  ['unknown match field', r => r.match.comment = pred('guess')],
  ['unknown rule key', r => r.expected = 'drop'],
  ['unknown predicate key', r => r.match.protocol = { ...pred('tcp'), answer: true }],
  ['malformed range', r => { r.match.protocol = pred('tcp'); r.match.dstPort = pred({ from: 200, to: 100 }); }],
  ['bad address', r => r.match.srcAddress = pred('999.0.0.0/24')],
  ['unknown state', r => r.match.connectionState = pred('tracked')],
  ['nonboolean not', r => r.match.protocol = { values: ['tcp'], not: 'no' }],
  ['empty values', r => r.match.protocol = pred()],
  ['multiple protocols in one RouterOS parameter', r => r.match.protocol = pred('tcp', 'udp')],
  ['negated multiple states', r => r.match.connectionState = { values: ['new', 'invalid'], not: true }],
  ['negated multiple ports', r => { r.match.protocol = pred('tcp'); r.match.dstPort = { values: [80, 443], not: true }; }],
]) test(`firewall rule validation rejects ${name}`, () => {
  const r = rule(); mutate(r); assert.ok(validateRule(r, topology).length);
});

test('firewall duplicate rule ids and malformed policy/rule rejected; valid rules accepted', () => {
  const r = rule({ protocol: pred('tcp'), srcPort: pred(0, { from: 100, to: 200 }), dstPort: pred(65535) });
  assert.deepEqual(validateRule(r, topology), []);
  assert.deepEqual(validateRule(rule({ connectionState: { values: ['new'], not: true } }), topology), []);
  assert.deepEqual(validateRule(rule({ protocol: pred('tcp'), dstPort: { values: [{ from: 100, to: 200 }], not: true } }), topology), []);
  assert.ok(validatePolicy({ id: 'duplicate', rules: [r, clone(r)] }, topology).length);
  assert.ok(validateRule(r, topology, [r, clone(r)]).length);
  assert.ok(validatePolicy({ id: 'null', rules: [null, r] }, topology).length);
  for (const p of policies) assert.deepEqual(validatePolicy(p, topology), []);
});

test('firewall every public code has Ukrainian copy, including every defined predicate', () => {
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(Object.keys(copy).sort(), [...codes].sort());
  for (const code of codes) assert.ok(t(code).length && !t(code).startsWith('['), code);
  assert.deepEqual(codes.filter(c => c.startsWith('mismatch.')).sort(), Object.keys(fields).map(f => `mismatch.${f}`).sort());
});
