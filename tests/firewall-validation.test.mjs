import test from 'node:test';
import assert from 'node:assert/strict';
import { bank, clone, classify, evaluate, outcomes } from './helpers/firewall.mjs';
import { badFirewallMutations } from './helpers/firewall-invalid.mjs';
import { validateBank } from '../src/banks/firewall/validate.js';
import { create, validateRecord } from '../src/sections/firewall/logic/predict.js';
import { validatePolicy } from '../src/sections/firewall/logic/model.js';

// Resolve from THIS bank, so mutations never disappear behind the stock resolver.
const resolve = bank => ({
  id: bank.records[0].id, version: bank.records[0].version,
  variants: bank.records[0].variants.map(({ id, title, text, policyId, cardIds }) => ({
    id, title, text, topology: bank.topology,
    policy: bank.policies.find(policy => policy.id === policyId),
    cards: cardIds.map(id => bank.cards.find(card => card.id === id)),
  })),
});

for (const collection of ['variants', 'cards', 'rules']) test(`firewall rejects sparse ${collection} at validation boundaries`, () => {
  const record = resolve(clone(bank));
  const values = collection === 'variants' ? record.variants
    : collection === 'cards' ? record.variants[0].cards : record.variants[0].policy.rules;
  for (let slot = 0; slot < values.length; slot++) {
    const broken = clone(record);
    const target = collection === 'variants' ? broken.variants
      : collection === 'cards' ? broken.variants[0].cards : broken.variants[0].policy.rules;
    delete target[slot];
    assert.deepEqual(validateRecord(broken), [{ code: 'invalid-record' }]);
    assert.throws(() => create(broken), /invalid-record/);
    if (collection === 'rules') assert.ok(validatePolicy(broken.variants[0].policy, broken.variants[0].topology).length);
  }
});

for (const [name, mutate] of badFirewallMutations) test(`firewall validator parity rejects: ${name}`, () => {
  const changed = clone(bank);
  mutate({ topology: changed.topology, policy: changed.policies[0], cards: changed.cards });
  assert.ok(validateBank(changed).length, `bank accepted ${name}`);
  assert.ok(validateRecord(resolve(changed)).length, `logic accepted ${name}`);
});

for (const [policyId, cardId] of [
  ['home-basic', 'wan-winbox'], ['home-basic', 'lan-winbox'],
  ['home-basic', 'reply-to-pc'], ['home-basic', 'port-forward'],
  ['home-disabled', 'lan-winbox'], ['home-drop-above', 'lan-winbox'],
]) test(`firewall validated pipeline: ${policyId} / ${cardId}`, () => {
  const input = clone(bank);
  assert.deepEqual(validateBank(input), []);
  const resolved = resolve(input);
  assert.deepEqual(validateRecord(resolved), []);
  const variant = resolved.variants.find(variant => variant.policy.id === policyId);
  const card = variant.cards.find(card => card.id === cardId);
  const context = classify(variant.topology, card);
  const walk = evaluate(variant.policy, card, context);
  const { hook, decidedBy, verdict } = walk;
  assert.deepEqual({ hook, decidedBy, verdict }, outcomes[policyId][cardId]);
  if (cardId === 'reply-to-pc') assert.ok(walk.steps.some(step => step.outcome === 'marked'));
});
