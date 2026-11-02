import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, records, policies, clone, resolveRecord, fullTask } from './helpers/firewall.mjs';
import { create, check, hints, commit, initialCommitState } from '../src/sections/firewall/logic/predict.js';
import { displayCard, renderPolicy } from '../src/sections/firewall/logic/render.js';
import { t } from '../src/sections/firewall/uk.js';
import { firewallLeaks } from './helpers/firewall-leaks.mjs';

for (const v of records[0].variants) test(`firewall leak gate: create, variant, cards, hints / ${v.id}`, () => {
  const task = create(resolveRecord(records[0]), { variantId: v.id, seed: 'leaks' });
  assert.deepEqual(firewallLeaks(task), []);
  assert.deepEqual(firewallLeaks({ title: task.title, text: task.text }, 'variant'), []);
  for (const card of task.cards) {
    assert.equal('safety' in card, false);
    const display = displayCard(card);
    assert.deepEqual(firewallLeaks(display, 'card'), []);
    const { from, to, state, dstNat } = display;
    const text = [t(from.code, from.params), t(to.code, to.params), display.protocol, t(state.code), t(dstNat.code, dstNat.params)].join('\n');
    assert.deepEqual(firewallLeaks(text, 'card'), []);
    assert.deepEqual(to, { code: 'card-to', params: { address: card.packet.dstIp } });
    assert.equal(t(to.code, to.params), `Куди: ${card.packet.dstIp}`);
  }
  for (const hint of hints(task)) {
    assert.deepEqual(hint.params, {});
    assert.deepEqual(firewallLeaks(t(hint.code), hint.rung === 3 ? 'example' : 'hint'), []);
  }
  // Unmarked choices are allowed and have no per-card annotation.
  const choices = renderPolicy(task.policy);
  assert.ok(choices.some(c => c.action === 'accept'));
  assert.ok(choices.some(c => c.action === 'drop'));
  assert.ok(choices.some(c => c.chain === 'input'));
});

test('firewall leak gate: display checks EVERY destination address before commitment', () => {
  for (const card of cards) {
    const display = displayCard(card);
    assert.deepEqual(firewallLeaks(display, 'card'), []);
    assert.equal(display.to.params.address, card.packet.dstIp);
    assert.deepEqual(Object.keys(display.to.params), ['address']);
    assert.ok(display.dstNat.code);
  }
});

test('firewall task-value-in-example: worked hint uses unrelated addresses and ports', () => {
  const taskAddresses = new Set(cards.flatMap(c => [c.packet.srcIp, c.packet.dstIp]));
  const taskPorts = new Set(cards.flatMap(c => [c.packet.srcPort, c.packet.dstPort]).filter(p => p !== undefined));
  const example = t('hint-example');
  assert.deepEqual(example.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g), ['192.0.2.10', '198.51.100.20']);
  for (const address of taskAddresses) assert.ok(!example.includes(address), address);
  for (const port of taskPorts) assert.doesNotMatch(example, new RegExp(`(?<![\\d.])${port}(?![\\d.])`), String(port));
  assert.match(example, /У A протокол не збігається/); assert.match(example, /у B збігаються/);
});

test('firewall leak gate: every possible committed selection reveals that card alone', () => {
  for (const p of policies) {
    const task = fullTask(p.id);
    assert.deepEqual(check(task, {}).evidence, {});
    for (const card of task.cards) for (const hook of ['input', 'forward']) for (const decidedBy of [...p.rules.map(r => r.id), 'chain-end:input', 'chain-end:forward', 'missing']) {
      const result = check(task, { [card.id]: { hook, decidedBy } });
      assert.deepEqual(Object.keys(result.evidence), decidedBy === 'missing' ? [] : [card.id]);
      assert.ok(result.findings.length <= 1);
    }
  }
});

test('firewall leak gate: first commitment never reveals unsampled or uncommitted cards', () => {
  const task = create(resolveRecord(records[0]), { seed: 'commit-leak' });
  const first = task.cards[0];
  const state = commit(task, initialCommitState(task), first.id, { hook: 'input', decidedBy: 'r1' });
  assert.deepEqual(Object.keys(state.result.evidence), [first.id]);
  assert.deepEqual(firewallLeaks(task), []);
  const unsampled = cards.find(c => !task.cards.some(x => x.id === c.id));
  assert.throws(() => commit(task, state, unsampled.id, {}), /invalid-selection/);
});

for (const [name, value, kind, expected] of [
  ['card expected answer', { id: 'wan-winbox', expected: { hook: 'input', decidedBy: 'r5' } }, 'card', 'answer-annotation'],
  ['card classified in advance', { id: 'wan-winbox', hook: 'input' }, 'card', 'answer-annotation'],
  ['card verdict annotation', { verdict: 'drop' }, 'card', 'answer-annotation'],
  ['card door prose', 'Куди: сам роутер', 'card', 'door-on-precommit-surface'],
  ['hint rule number', 'Обери правило 5', 'hint', 'deciding-rule-on-precommit-surface'],
  ['variant names broken rule', 'У цьому наборі помилка: r4', 'variant', 'deciding-rule-on-precommit-surface'],
  ['hint verdict prose', 'Фільтр пропускає пакет', 'hint', 'verdict-on-precommit-surface'],
  ['ordinary Ukrainian dropped packet', 'Пакет буде відкинуто.', 'card', 'verdict-on-precommit-surface'],
  ['ordinary Ukrainian allowed packet', 'Цей пакет пропустять.', 'hint', 'verdict-on-precommit-surface'],
  ['ordinary Ukrainian passed packet', 'Пакет буде пропущено.', 'variant', 'verdict-on-precommit-surface'],
  ['ordinary Ukrainian denied packet', 'Цей пакет заборонено.', 'card', 'verdict-on-precommit-surface'],
  ['ordinary Ukrainian permitted packet', 'Цей пакет дозволено.', 'hint', 'verdict-on-precommit-surface'],
  ['door through router', 'Куди: крізь роутер', 'card', 'door-on-precommit-surface'],
  ['input door', 'Ланцюжок input', 'hint', 'door-on-precommit-surface'],
  ['forward door', 'Ланцюжок forward', 'hint', 'door-on-precommit-surface'],
  ['title attribute', '<span title="input">192.168.88.1</span>', 'card', 'door-on-precommit-surface'],
  ['id attribute', '<span id="r6">x</span>', 'surface', 'deciding-rule-on-precommit-surface'],
  ['single quoted id attribute', "<span id='r6'>x</span>", 'surface', 'deciding-rule-on-precommit-surface'],
  ['unquoted id attribute', '<span id=r6>x</span>', 'surface', 'deciding-rule-on-precommit-surface'],
  ['encoded id markup', '&lt;span id=&quot;r6&quot;&gt;x&lt;/span&gt;', 'surface', 'deciding-rule-on-precommit-surface'],
  ['custom attribute', '<span custom="r6">x</span>', 'surface', 'deciding-rule-on-precommit-surface'],
  ['aria attribute', '<span aria-label="forward">192.168.88.1</span>', 'card', 'door-on-precommit-surface'],
  ['alt attribute', '<img alt="сам роутер">', 'card', 'door-on-precommit-surface'],
  ['data attribute', '<span data-result="відкинуто">192.168.88.1</span>', 'card', 'verdict-on-precommit-surface'],
  ['single quoted attribute', "<span title='пропущено'>192.168.88.1</span>", 'card', 'verdict-on-precommit-surface'],
  ['unquoted attribute', '<span data-door=input>192.168.88.1</span>', 'card', 'door-on-precommit-surface'],
  ['entity in attribute', '<span title="&#105;np&#117;t">192.168.88.1</span>', 'card', 'door-on-precommit-surface'],
  ['structured accessible attribute', { 'aria-label': 'input' }, 'card', 'door-on-precommit-surface'],
  ['card id in display', 'Пакет wan-winbox', 'card', 'card-id-on-precommit-surface'],
  ['card id in attribute', '<span data-card-id="lan-winbox">192.168.88.1</span>', 'card', 'card-id-on-precommit-surface'],
  ['card id under display key', { label: 'reply-to-pc' }, 'card', 'card-id-on-precommit-surface'],
  ['policy prose', { policy: { text: 'Пакет буде відкинуто.' } }, 'create', 'verdict-on-precommit-surface'],
  ['topology prose', { topology: { title: 'сам роутер' } }, 'create', 'door-on-precommit-surface'],
  ['policy non-given attribute', { policy: { rules: [{ title: 'input' }] } }, 'create', 'door-on-precommit-surface'],
  ['policy chain prose', { policy: { rules: [{ chain: 'input — правильна відповідь' }] } }, 'create', 'door-on-precommit-surface'],
  ['attribute in worked example', '<span title="drop">Окремий приклад</span>', 'example', 'verdict-on-precommit-surface'],
]) test(`firewall leak negative fixture: ${name}`, () => {
  assert.ok(firewallLeaks(value, kind).includes(expected));
  assert.throws(() => assert.deepEqual(firewallLeaks(value, kind), []), assert.AssertionError);
});

test('firewall leak gate allows policy givens but rejects nested card annotations in create', () => {
  const task = create(resolveRecord(records[0]), { seed: 3 });
  assert.deepEqual(firewallLeaks(task), []);
  const leaked = clone(task); leaked.cards[0].walk = { decidedBy: 'r5', verdict: 'drop' };
  assert.ok(firewallLeaks(leaked).includes('answer-annotation'));
});
