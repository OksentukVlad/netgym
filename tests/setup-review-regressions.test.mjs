import { practiceTask, practiceState } from './helpers/setup-recall.mjs';
// Handwritten cases from the Astra/Fable DR-1 code reviews and fix brief v1.
import test from 'node:test';
import assert from 'node:assert/strict';
import bank from '../src/banks/setup/cisco-router.js';
import { validate } from '../src/banks/setup/validate.js';
import { parse, matchKeyword } from '../src/engine/vendors/cisco-cli.js';
import { create } from '../src/sections/setup/logic/deck.js';
import { initialAnswer, validRecord, validate as runtimeValidate } from '../src/sections/setup/logic/model.js';
import { checkTyped, checkRecall } from '../src/sections/setup/logic/typed.js';
import { check } from '../src/sections/setup/logic/rules.js';
import { render, acceptedScript, cardText } from '../src/sections/setup/logic/render.js';
import { initialState, transition } from '../src/sections/setup/logic/state.js';
import { solution } from '../src/sections/setup/logic/solution.js';
import { hints, tips } from '../src/sections/setup/logic/hints.js';
import { text } from '../src/sections/setup/uk.js';
import { setupLeaks } from './helpers/setup-leaks.mjs';
import { replay } from './fixtures/setup/replay.mjs';

const generated = create(bank, { seed: replay.seed });
const task = practiceTask(generated, replay.typedIds.map(name => generated.cards.find(c => c.commandId === name).id));
const id = (name, t = task) => t.cards.find(c => c.commandId === name).id;
const keyed = object => Object.fromEntries(Object.entries(object).map(([name, value]) => [id(name), value]));
const answer = (enable = 'enable secret StrongOwn!9', username = 'username maintainer privilege 15 secret tiny') => ({
  ...initialAnswer(task, 'typed'), order: replay.order.map(name => id(name)), prompts: keyed(replay.prompts),
  typed: keyed({ 'enable-secret': enable, username, 'password-encryption': 'service password-encryption' }),
});
// The exact expected copy payload comes from the independent handwritten
// replay, changing only the explicitly specified accepted command line.
const scriptWith = enable => replay.script.replace('enable secret <пароль>', enable);

test('Astra 1: enable secret 😀😀😀😀 is four characters, advises and copies a placeholder', () => {
  const input = 'enable secret 😀😀😀😀';
  assert.deepEqual(checkTyped(task, id('enable-secret'), input), {
    ok: true, code: 'ok', findings: [{ code: 'weak-secret', severity: 'advice', entity: id('enable-secret') }],
  });
  assert.equal(acceptedScript(task, practiceState(task, answer(input))).script, replay.script);
  // Eight supplementary characters are eight characters, not automatically weak.
  assert.deepEqual(checkTyped(task, id('enable-secret'), 'enable secret 😀😀😀😀😀😀😀😀').findings, []);
});

for (const secret of ['Strong?9', 'Quote"Secret9', "Quote'Secret9", 'Back\\Slash9', 'Back`Tick9', 'Pipe|Secret9', 'Semi;Secret9', 'Angle<Secret9', 'Angle>Secret9', 'Tilde~Secret9', 'ДовгийПароль9']) {
  test(`Astra 2: accepts ${JSON.stringify(secret)} but copies a placeholder and console explanation`, () => {
    const input = `enable secret ${secret}`;
    assert.equal(checkTyped(task, id('enable-secret'), input).ok, true);
    const copy = acceptedScript(task, practiceState(task, answer(input)));
    assert.equal(copy.script, replay.script);
    assert.equal(copy.label, `${text('accepted-label')} ${text('copy-secret')}`);
    assert.equal(copy.label.includes('\n'), false);
    assert.equal(JSON.stringify(copy).includes(secret), false);
  });
}

test('Astra 2 pattern: username secrets use the same console copy protection', () => {
  const a = answer('enable secret StrongOwn!9', 'username maintainer privilege 15 secret Own?Secret9');
  assert.equal(check(task, a).ok, true);
  assert.equal(acceptedScript(task, practiceState(task, a)).script, scriptWith('enable secret StrongOwn!9'));
  assert.match(acceptedScript(task, practiceState(task, a)).label, /консоль/);
});

test('Astra 2 pattern: console editing/completion controls are rejected, never copied', () => {
  for (const control of ['\u0016', '\u001b', '\t', '\b', '\u007f']) {
    const a = answer(`enable secret Strong${control}?9`);
    assert.equal(checkRecall(task, a).code, 'extra-part');
    assert.equal(acceptedScript(task, practiceState(task, a)), null);
  }
});

test('Astra 3: NBSP, em space and narrow NBSP serialize to ASCII spaces with secret case intact', () => {
  const a = answer(' \u00a0ENA\u00a0SEC\u20030\u202fMiXeD!Secret9\u00a0 ');
  const copy = acceptedScript(task, practiceState(task, a));
  assert.equal(copy.script, scriptWith('ENA SEC 0 MiXeD!Secret9'));
  assert.equal(copy.label, text('accepted-label'));
  assert.doesNotMatch(copy.script, /[\u00a0\u2003\u202f]/u);
});

test('Fable 4: username X secret Y is username, then wrong-value privilege at end of input', () => {
  const input = 'username X secret Y';
  assert.equal(parse(input).id, 'username');
  const t = { ...task, values: { ...task.values, username: 'X' } };
  assert.deepEqual(checkTyped(t, id('username'), input), {
    ok: false, code: 'wrong-value', findings: [{ code: 'wrong-value', severity: 'blocks', entity: id('username'),
      field: 'privilege', position: 4, token: '', start: 19, end: 19 }],
  });
  const finding = checkTyped(t, id('username'), input + '  ').findings[0];
  assert.equal(finding.start, 21); assert.equal(finding.end, 21);
});

for (const [input, code] of [
  ['crypto key generate rsa general-keys modulus 2048', 'ok'],
  ['crypto key generate rsa usage-keys modulus 4096', 'ok'],
  ['cry key gen rsa general-k mod 2048', 'ok'],
  ['cry key gen rsa usage-k mod 4096', 'ok'],
  ['crypto key generate rsa general-keys modulus 1024', 'weak-key'],
  ['crypto key generate rsa usage-keys modulus 768', 'weak-key'],
  ['crypto key generate rsa general-keys modulus 3072', 'wrong-value'],
  ['crypto key generate rsa general-keys modulus', 'missing-part'],
  ['cry key gen rsa general-k', 'unsafe-command'],
  ['cry key gen rsa usage-k', 'unsafe-command'],
  ['cry key gen rsa general', 'wrong-part'],
  ['cry key gen rsa usage', 'wrong-part'],
]) test(`Fable 5: ${input} → ${code}`, () => {
  assert.equal(checkTyped(task, id('crypto'), input).code, code);
});

for (const input of ['copy running-config startup-config', 'copy run start']) {
  test(`Fable 6: ${input} satisfies write-memory`, () => {
    assert.equal(parse(input, { mode: '#' }).id, 'write-memory');
    assert.equal(checkTyped(task, id('write-memory'), input).code, 'ok');
    const t = practiceTask(task, ['write-memory', 'enable-secret', 'username'].map(name => id(name)));
    const a = answer(); a.typed[id('write-memory')] = input;
    assert.equal(acceptedScript(t, practiceState(t, a)).script, scriptWith('enable secret StrongOwn!9').replace(/write memory$/, input));
  });
}

test('Fable 7: missing/wrong parts disclose no expected keyword, ambiguity retains IOS options', () => {
  for (const input of ['ip ssh', 'ip ssh orange 2', 'enable secret 0', 'crypto key generate rsa modulus']) {
    const parsed = parse(input);
    assert.equal(parsed.ok, false);
    assert.equal('expected' in parsed.finding, false);
    assert.equal('options' in parsed.finding, false);
    const result = checkTyped(task, id('ssh-version'), input);
    assert.equal(JSON.stringify(result).includes('expected'), false);
    assert.equal(JSON.stringify(result).includes('options'), false);
  }
  assert.deepEqual(matchKeyword('orange', ['version']), { ok: false, code: 'wrong-part' });
  assert.deepEqual(parse('cry ke').finding.options, ['key', 'keyring']);
  const t = practiceTask(task, ['ssh-version', 'username', 'enable-secret'].map(name => id(name)));
  const a = answer(); a.typed[id('ssh-version')] = 'ip ssh orange 2';
  const whole = checkRecall(t, a);
  assert.equal(whole.code, 'wrong-part');
  assert.equal('expected' in whole.findings[0], false);
  assert.equal('options' in whole.findings[0], false);
});

test('Small 8: IOS 15 spaced domain spelling has the same semantic identity', () => {
  assert.equal(parse('ip domain name practice.example').id, 'domain');
  assert.equal(checkTyped(task, id('domain'), 'ip domain name practice.example').code, 'ok');
});

test('Small 9: save-last sentence is success-only, absent from all hint rungs', () => {
  const sentence = 'Збереження до завершення змін збереже лише проміжний стан.';
  assert.doesNotMatch(text('hint-example'), /список доступу/);
  for (const hint of hints()) assert.equal(text(hint.code).includes(sentence), false);
  assert.deepEqual(tips(task, { ok: false, complete: false }), []);
  assert.equal(text('save-last').includes(sentence), false);
  // Screens fix round (small 7): one success tip about saving, not two.
  assert.ok(text('tip-save').startsWith(text('save-last')) && text('tip-save').endsWith(sentence));
  const codes = tips(task, check(task, answer())).map(tip => tip.code);
  assert.ok(codes.includes('tip-save') && !codes.includes('save-last'), codes.join(' '));
  assert.equal(codes.filter(code => /write memory|Збереж/.test(text(code))).length, 1);
});

test('Small 10: per-seed opaque ids cover every screen-facing identity and lifecycle path', () => {
  const other = create(bank, { seed: 'other-seed' });
  const ids = new Set(task.cards.map(c => c.id));
  for (const card of task.cards) {
    assert.match(card.id, /^c-[a-f0-9]{8}$/);
    assert.notEqual(card.id, id(card.commandId, other));
  }
  assert.equal(ids.size, 12);
  const a = answer();
  for (const mode of ['cards', 'typed']) for (const row of render(task, { ...a, mode })) {
    assert.ok(ids.has(row.id));
    assert.deepEqual(Object.keys(row).sort(), ['id', 'kind', 'prompt', 'purpose', 'text']);
    assert.deepEqual(setupLeaks(`<li id="${row.id}" data-card="${row.id}"></li>`, 'typed'), []);
  }
  // A semantic machine id is a leak too: no string-gate exemption remains.
  for (const name of ['login-local', 'enable-secret', 'write-memory']) {
    assert.ok(setupLeaks({ id: name }, 'typed').includes('typed-keyword'));
    assert.ok(setupLeaks({ id: name }).includes('typed-keyword'));
    assert.ok(setupLeaks(`<li data-card="${name}"></li>`, 'typed').includes('typed-keyword'));
  }
  for (const collection of [task.order, task.typedIds, task.referenceOrder, solution(task).order,
    Object.keys(a.prompts), Object.keys(a.typed), ...task.rules.map(r => [r.a, ...(r.b ? [r.b] : [])])]) {
    assert.ok(collection.every(key => ids.has(key)));
  }
  const failure = check(task, { ...a, order: [id('crypto'), ...a.order.filter(key => key !== id('crypto'))] });
  assert.ok(failure.findings[0].cards.every(key => ids.has(key)));
  assert.deepEqual(checkTyped(task, 'enable-secret', 'enable secret StrongOwn!9').code, 'invalid-answer');
  let state = { ...initialState(task), answer: { ...a, typed: {} } };
  state = transition(task, state, { type: 'check' });
  state = transition(task, state, { type: 'continue' });
  state = transition(task, state, { type: 'typed', id: id('enable-secret'), text: 'enable secret tiny' });
  state = transition(task, state, { type: 'check-typed', id: id('enable-secret') });
  assert.equal(state.typedFeedback[id('enable-secret')].findings[0].entity, id('enable-secret'));
  state = transition(task, state, { type: 'reveal' });
  assert.ok(state.answer.assisted.every(key => ids.has(key)));
  assert.equal(task.identity.generatorVersion, 3);
  assert.notEqual(task.instanceKey, JSON.stringify({ ...task.identity, generatorVersion: 1 }));
});

for (const secret of ['password', 'Password1', '12345678', 'cisco', 'admin', 'PASSWORD1']) {
  test(`Small 11: deny-listed ${secret} remains accepted, advised and replaced in copy`, () => {
    const a = answer(`enable secret ${secret}`);
    assert.equal(checkTyped(task, id('enable-secret'), a.typed[id('enable-secret')]).findings[0].code, 'weak-secret');
    assert.equal(acceptedScript(task, practiceState(task, a)).script, replay.script);
  });
}

test('Small 12: domain folds case; hostname remains case-sensitive', () => {
  assert.equal(checkTyped(task, id('domain'), 'ip domain-name PrAcTiCe.ExAmPlE').code, 'ok');
  assert.equal(checkTyped(task, id('domain'), 'ip domain name PRACTICE.EXAMPLE').code, 'ok');
  assert.equal(checkTyped(task, id('hostname'), 'hostname r87').code, 'wrong-value');
  assert.equal(checkTyped(task, id('hostname'), 'hostname R87').code, 'ok');
});

test('Small 14: bank lint and runtime share validation, including deck-supplied identity', () => {
  assert.equal(validate, runtimeValidate);
  const renamed = { ...bank, id: 'custom-deck', version: 2 };
  assert.equal(validRecord(renamed), true);
  assert.equal(create(renamed).identity.taskId, 'custom-deck');
  assert.equal(create(renamed).identity.recordVersion, 2);
  const mixedDomain = { ...bank, cards: bank.cards.map(card => card.id === 'domain' ? { ...card, template: 'ip domain name LAB.EXAMPLE' } : card) };
  assert.deepEqual(validate(mixedDomain), []);
  assert.equal(validRecord(mixedDomain), true);
  for (const broken of [
    { ...bank, id: '' }, { ...bank, version: 0 },
    { ...bank, cards: bank.cards.map((card, i) => i ? card : { ...card, template: 'ip ssh version 2' }) },
    { ...bank, rules: [...bank.rules, { kind: 'before', a: 'crypto', b: 'hostname', why: 'cycle' }] },
  ]) {
    assert.ok(validate(broken).length);
    assert.equal(validRecord(broken), false);
    assert.throws(() => create(broken), /invalid-record/);
  }
});

// Screens fix round (Astra and Fable, must-fix 1): a typed verdict must not
// depend on the hidden card's mode. Every card whose identity doesn't match a
// probe gets the very same finding (only `entity` names the card), across
// global, line, interface and privileged cards, in several seeds.
const sameExceptEntity = result => JSON.stringify({ ...result, findings: result.findings.map(({ entity, ...rest }) => rest) });
for (const probe of ['i', 'transport', 'hostname R1', 'enable password abc', 'login', 'transport input telnet', 'no shutdown', 'write memory', 'ip address 10.1.1.1 255.255.255.0', 'line vty 0 15', 'conf t', 'hostnme R1', 'ip ssh version 1', 'crypto key generate rsa']) {
  test(`fix 1: the typed verdict for «${probe}» is the same on every card it isn't, whatever the card's mode`, () => {
    for (const seed of [replay.seed, 2, 3, 'another']) {
      const t = create(bank, { seed });
      const parsed = parse(probe, { mode: null });
      const others = t.cards.filter(card => !parsed.ok || card.commandId !== parsed.id);
      assert.ok(new Set(others.map(card => card.mode)).size >= 3, `${probe}: the cards compared cover several modes`);
      const verdicts = new Set(others.map(card => sameExceptEntity(checkTyped(t, card.id, probe))));
      assert.equal(verdicts.size, 1, `${probe} (seed ${seed}): ${[...verdicts].join(' | ')}`);
      // The whole-deck check names the same finding for a typed card, whatever its mode.
      const typedVerdicts = new Set(t.typedIds.filter(cardId => others.some(card => card.id === cardId)).map(cardId => {
        const a = { ...initialAnswer(t, 'typed'), order: [...t.referenceOrder], prompts: Object.fromEntries(t.cards.map(card => [card.id, card.mode])) };
        for (const other of t.typedIds) a.typed[other] = other === cardId ? probe : cardText(t, other).replace('<пароль>', 'StrongOwn!9');
        const { findings } = checkRecall(t, a);
        return JSON.stringify(findings.map(({ cards, entity, ...rest }) => rest));
      }));
      assert.ok(typedVerdicts.size <= 1, `${probe} (seed ${seed}) deck check: ${[...typedVerdicts].join(' | ')}`);
    }
  });
}

test('fix 1: unsafe forms and ambiguous prefixes are taught on every card, never «not in this set» for a wrong-mode card', () => {
  for (const card of task.cards) {
    assert.equal(checkTyped(task, card.id, 'enable password abc').code, 'unsafe-command', card.commandId);
    assert.equal(checkTyped(task, card.id, 'transport input telnet').code, 'unsafe-command', card.commandId);
    assert.equal(checkTyped(task, card.id, 'i').code, 'ambiguous-keyword', card.commandId);
    if (card.commandId !== 'hostname') assert.equal(checkTyped(task, card.id, 'hostname R1').code, 'other-command', card.commandId);
  }
});
