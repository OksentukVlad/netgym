import { practiceTask, practiceState } from './helpers/setup-recall.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import bank from '../src/banks/setup/cisco-router.js';
import { validate } from '../src/banks/setup/validate.js';
import { profile, parse } from '../src/engine/vendors/cisco-cli.js';
import { addressExampleAllowed } from '../src/engine/vendors/address.js';
import { maskToPrefix } from '../src/engine/ip.js';
import { create } from '../src/sections/setup/logic/deck.js';
import { initialAnswer } from '../src/sections/setup/logic/model.js';
import { check, orderFinding } from '../src/sections/setup/logic/rules.js';
import { checkTyped, checkRecall } from '../src/sections/setup/logic/typed.js';
import { acceptedScript, cardText, render } from '../src/sections/setup/logic/render.js';
import { solution } from '../src/sections/setup/logic/solution.js';
import { codes } from '../src/sections/setup/logic/codes.js';
import { hints, tips, explanation } from '../src/sections/setup/logic/hints.js';
import { initialState, transition } from '../src/sections/setup/logic/state.js';
import { text } from '../src/sections/setup/uk.js';
import { replay as mnemonicReplay } from './fixtures/setup/replay.mjs';

const clone = value => structuredClone(value);
const task = create(bank, { seed: mnemonicReplay.seed });
// Translate handwritten fixture identities only; expected commands/verdicts are
// independent of production parsing and checking. Mnemonics stay in tests.
const key = commandId => task.cards.find(card => card.commandId === commandId).id;
const keyed = object => Object.fromEntries(Object.entries(object).map(([id, value]) => [key(id), value]));
const replay = { ...mnemonicReplay,
  order: mnemonicReplay.order.map(key), initialOrder: mnemonicReplay.initialOrder.map(key),
  typedIds: mnemonicReplay.typedIds.map(key), prompts: keyed(mnemonicReplay.prompts),
  outcomes: mnemonicReplay.outcomes.map(outcome => ({ ...outcome, ...(outcome.cards ? { cards: outcome.cards.map(key) } : {}) })),
};
const answer = () => ({ ...initialAnswer(task), order: [...replay.order], prompts: { ...replay.prompts } });

test('DR-1 bank graph, ids, modes and reference are valid; deliberate corruption is caught', () => {
  assert.deepEqual(validate(bank), []);
  for (const change of [
    b => b.cards.push(clone(b.cards[0])), b => b.cards[0].mode = '>',
    b => b.rules.push({ kind: 'before', a: 'absent', b: 'crypto', why: 'x' }),
    b => b.rules.push({ kind: 'before', a: 'crypto', b: 'hostname', why: 'x' }),
    b => b.rules[0].kind = 'arbitrary', b => b.referenceOrder.reverse(),
    b => b.referenceOrder[0] = 'absent', b => b.profile.vty = '0 4',
    b => b.cards[0] = null, b => b.rules[0] = null,
    b => b.cards[0].template = 'ip ssh version 2', b => b.cards[2].requires.modulus = [4096],
  ]) { const broken = clone(bank); change(broken); assert.ok(validate(broken).length); }
  assert.deepEqual(task.profile, profile);
  assert.equal(profile.vty, '0 15');
  assert.equal(profile.access, 'console'); assert.equal(profile.fresh, true);
});

test('DR-1 seeded replay locks givens, initial shuffle, typed selection and handwritten verdicts', () => {
  assert.deepEqual(task.values, replay.values);
  assert.deepEqual(task.order, replay.initialOrder);
  assert.deepEqual(task.recallLines.map(c => c.commandId), ['crypto', 'username', 'login-local']);
  for (const expected of replay.outcomes) {
    const a = answer();
    if (expected.edit === 'crypto-first' || expected.edit === 'save-first') {
      const id = key(expected.edit === 'crypto-first' ? 'crypto' : 'write-memory');
      a.order = [id, ...a.order.filter(c => c !== id)];
    }
    if (expected.edit === 'address-mode') a.prompts[key('ip-address')] = '>';
    if (expected.edit === 'missing-mode') a.prompts[key('ip-address')] = null;
    const result = check(task, a);
    assert.equal(result.code, expected.code);
    assert.equal(result.complete, expected.complete ?? false);
    if (expected.why) assert.equal(result.findings[0].why, expected.why);
    if (expected.cards) assert.deepEqual(result.findings[0].cards, expected.cards);
    assert.ok(result.findings.length <= 1);
  }
  assert.equal(acceptedScript(task, answer()).script, replay.script);
});

test('DR-1 generator: deterministic, isolated, varied, never initially passing, no secrets generated', () => {
  const generated = new Set(), typedIds = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const t = create(bank, { seed }), a = initialAnswer(t);
    assert.deepEqual(t, create(bank, { seed }));
    assert.ok(orderFinding(t, a.order));
    assert.ok(Object.values(a.prompts).every(v => v === null));
    assert.equal(t.typedIds.length, 3); assert.equal(new Set(t.typedIds).size, 3);
    t.typedIds.forEach(id => typedIds.add(t.cards.find(c => c.id === id).commandId));
    assert.ok(addressExampleAllowed({ ip: t.values.ip, prefix: maskToPrefix(t.values.mask) }));
    assert.match(t.values.domain, /\.example$/);
    assert.equal(Object.keys(t.values).some(k => /secret|password/i.test(k)), false);
    assert.equal(solution(t).script.includes('line vty 0 4'), false);
    generated.add(JSON.stringify(t.values));
  }
  assert.equal(typedIds.size, 8); assert.ok(generated.size > 200);
  const detached = create(bank); detached.cards[0].requires.hostname = 'changed';
  assert.equal(bank.cards[0].requires.hostname, '$hostname');
  for (const seed of [null, NaN, Infinity, {}, []]) assert.throws(() => create(bank, { seed }), /invalid-record/);
});

test('DR-1 all 6,652,800 orders pass orderFinding; sampled orders pass check', () => {
  // Independent enumeration from the three hand-specified dependencies, with
  // save fixed last. No production rule data drives the enumerator.
  const ids = ['hostname', 'domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'password-encryption', 'transport-ssh', 'login-local', 'ip-address', 'no-shutdown'].map(key);
  const required = [0, 0, 3, 0, 0, 0, 0, 0, 32, 0, 0];
  const a = answer(); a.order = Array(12); a.order[11] = key('write-memory');
  let count = 0, sampled = 0;
  function walk(depth, used) {
    if (depth === 11) {
      const finding = orderFinding(task, a.order);
      if (finding) assert.fail(JSON.stringify({ order: a.order, finding }));
      // Check the complete pipeline on a deterministic spread, including ends.
      if (count % 8192 === 0 || count === 6652799) {
        const result = check(task, a);
        assert.equal(result.ok && result.complete, true);
        sampled++;
      }
      count++;
      return;
    }
    for (let i = 0; i < 11; i++) {
      const bit = 1 << i;
      if ((used & bit) || (used & required[i]) !== required[i]) continue;
      a.order[depth] = ids[i]; walk(depth + 1, used | bit);
    }
  }
  walk(0, 0);
  assert.equal(count, 6652800);
  assert.equal(sampled, 814);
});

for (const [a, b, order, why] of [
  ['hostname', 'crypto', ['domain', 'hostname', 'crypto', 'username', 'login-local', 'ssh-version', 'enable-secret', 'password-encryption', 'transport-ssh', 'ip-address', 'no-shutdown', 'write-memory'], 'hostname-before-key'],
  ['domain', 'crypto', ['hostname', 'domain', 'crypto', 'username', 'login-local', 'ssh-version', 'enable-secret', 'password-encryption', 'transport-ssh', 'ip-address', 'no-shutdown', 'write-memory'], 'domain-before-key'],
  ['username', 'login-local', ['hostname', 'domain', 'crypto', 'username', 'login-local', 'ssh-version', 'enable-secret', 'password-encryption', 'transport-ssh', 'ip-address', 'no-shutdown', 'write-memory'], 'user-before-login'],
]) test(`DR-1 swapping only ${a} → ${b} fails exactly its code`, () => {
  const good = { ...answer(), order: order.map(key) };
  assert.equal(check(task, good).ok, true);
  const left = good.order.indexOf(key(a)), right = good.order.indexOf(key(b));
  [good.order[left], good.order[right]] = [good.order[right], good.order[left]];
  assert.deepEqual(check(task, good).findings, [{ severity: 'blocks', code: 'needs-before', why, cards: [key(a), key(b)] }]);
});

test('DR-1 every prompt is checked without revealing its required mode', () => {
  for (const card of task.cards) {
    const a = answer(); a.prompts[card.id] = null;
    assert.deepEqual(check(task, a).findings, [{ severity: 'blocks', code: 'mode-missing', cards: [card.id] }]);
    a.prompts[card.id] = '>';
    assert.deepEqual(check(task, a).findings, [{ severity: 'blocks', code: 'wrong-mode', cards: [card.id] }]);
  }
  for (const broken of [null, {}, { ...answer(), order: [] }, { ...answer(), order: task.order.map(() => 'hostname') }]) assert.equal(check(task, broken).code, 'invalid-answer');
});

const semanticCases = [
  ['hostname', 'hostname R87', 'ok'], ['hostname', 'hostname Wrong', 'wrong-value', 'hostname'],
  ['domain', 'ip domain-name practice.example', 'ok'], ['domain', 'ip domain-name other.example', 'wrong-value', 'domain'],
  ['username', 'username maintainer privilege 15 secret StrongOwn!9', 'ok'],
  ['username', 'username wrong privilege 15 secret StrongOwn!9', 'wrong-value', 'username'],
  ['username', 'username maintainer privilege 1 secret StrongOwn!9', 'wrong-value', 'privilege'],
  ['ssh-version', 'ip ssh version 3', 'wrong-value', 'version'],
  ['ip-address', 'ip address 192.168.235.1 255.255.255.0', 'wrong-value', 'ip'],
  ['ip-address', 'ip address 192.168.234.1 255.255.255.128', 'wrong-value', 'mask'],
  ['crypto', 'crypto key generate rsa modulus 2048', 'ok'], ['crypto', 'crypto key generate rsa modulus 4096', 'ok'],
  ['crypto', 'crypto key generate rsa modulus 512', 'weak-key', 'modulus'],
  ['crypto', 'crypto key generate rsa modulus 768', 'weak-key', 'modulus'],
  ['crypto', 'crypto key generate rsa modulus 1024', 'weak-key', 'modulus'],
  ['crypto', 'crypto key generate rsa modulus 3072', 'wrong-value', 'modulus'],
  ['enable-secret', 'enable secret 0 StrongOwn!9', 'ok'],
  ['enable-secret', 'enable secret 5 $1$hash', 'wrong-value', 'encoding'],
  ['hostname', 'ip ssh version 2', 'other-command'],
];
for (const [id, input, code, field] of semanticCases) test(`DR-1 semantics: ${id} / ${input}`, () => {
  const result = checkTyped(task, key(id), input);
  assert.equal(result.code, code); assert.equal(result.ok, code === 'ok');
  if (field) assert.equal(result.findings[0].field, field);
});

test('DR-1 secrets: any nonempty token, weakness advice, preserved case and no secret evidence', () => {
  for (const secret of ['a', 'R87', 'maintainer', 'MiXeDCase!9', '12345678', 'пароль', 'Punctuation;|&!9', '0 5']) {
    const result = checkTyped(task, key('enable-secret'), `enable secret ${secret}`);
    assert.equal(result.ok, true);
    assert.equal(result.findings.some(f => f.code === 'weak-secret'), ['a', 'R87', 'maintainer', '12345678', 'пароль', '0 5'].includes(secret));
    const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
    assert.equal(strings(result).includes(secret), false);
  }
});

test('DR-1 every selected typed input is required and reparsed after an accepted input changes', () => {
  const t = practiceTask(task, replay.typedIds);
  const a = answer();
  const commands = keyed({ 'enable-secret': 'enable secret StrongOwn!9', username: 'username maintainer privilege 15 secret UniqueOwn!9', 'password-encryption': 'service password-encryption' });
  assert.equal(checkRecall(t, a).code, 'typed-missing');
  for (const id of t.typedIds) {
    a.typed[id] = commands[id];
    if (id !== t.typedIds.at(-1)) assert.equal(checkRecall(t, a).ok, false);
  }
  assert.equal(checkRecall(t, a).ok, true);
  a.typed[key('username')] = 'username wrong privilege 15 secret UniqueOwn!9';
  assert.equal(checkRecall(t, a).code, 'wrong-value');
  assert.equal(acceptedScript(t, practiceState(t, a)), null);
});

test('DR-1 accepted scripts keep learner order, abbreviations, alternative key size and strong secret case', () => {
  const t = practiceTask(task, ['crypto', 'username', 'enable-secret'].map(key));
  const a = { ...answer(), mode: 'typed', typed: keyed({
    crypto: 'cry key gen rsa mod 2048', username: 'user maintainer priv 15 sec StrongOwn!9', 'enable-secret': 'ena sec UniqueOwn!9',
  }) };
  const result = acceptedScript(t, practiceState(t, a));
  assert.ok(result.script.includes('cry key gen rsa mod 2048'));
  assert.ok(result.script.includes('sec StrongOwn!9'));
  assert.ok(result.script.indexOf('ip address') < result.script.indexOf('hostname'));
  assert.equal(result.script.includes('modulus 4096'), false);
  a.typed[key('username')] = 'user maintainer priv 15 sec tiny';
  a.typed[key('enable-secret')] = 'ena sec R87';
  const weak = acceptedScript(t, practiceState(t, a)).script;
  assert.equal(weak.includes('tiny'), false); assert.equal(weak.includes('sec R87'), false);
  assert.ok(weak.includes('secret <пароль>'));
  assert.equal(solution(t).script.includes('StrongOwn!9'), false);
});

test('DR-1 lifecycle: sorting locks, recall editing rechecks, reveal and restore are explicit', () => {
  let state = { ...initialState(task), answer: answer() };
  state = transition(task, state, { type: 'check' });
  assert.equal(state.phase, 'sorted'); assert.equal(state.earned, true);
  assert.equal(transition(task, state, { type: 'prompt', id: key('hostname'), prompt: '>' }), state);
  state = transition(task, state, { type: 'continue' });
  for (const id of task.typedIds) {
    state = transition(task, state, { type: 'typed', id, text: cardText(task, id).replace('<пароль>', 'StrongOwn!9') });
    state = transition(task, state, { type: 'check-typed', id });
  }
  assert.equal(state.phase, 'done');
  const id = task.typedIds[0];
  state = transition(task, state, { type: 'typed', id, text: 'wrong' });
  assert.equal(state.phase, 'recall'); assert.equal(state.typedFeedback[id], undefined);
  state = transition(task, state, { type: 'check-typed', id });
  assert.equal(state.typedFeedback[id].ok, false);
  state = transition(task, state, { type: 'hint' }); assert.equal(state.hintIndex, 1);
  const saved = JSON.parse(JSON.stringify(state));
  assert.deepEqual(transition(task, saved, { type: 'restore' }), state);
  state = transition(task, state, { type: 'reveal' });
  assert.equal(state.phase, 'done-shown'); assert.equal(state.earned, true);
  assert.equal(state.revealed, false); assert.equal(state.recallRevealed, true);
  assert.deepEqual(state.answer.assisted, task.typedIds);
});

test('DR-1 display follows current order; strings, rule tips and hint codes are complete', () => {
  assert.deepEqual(render(task, answer()).map(c => c.id), replay.order);
  assert.equal(tips(task, check(task, initialAnswer(task))).length, 0);
  const after = tips(task, check(task, answer()));
  // Every rule's lesson is in a tip (save-last's inside the one saving tip).
  for (const r of task.rules) assert.ok(after.some(t => text(t.code).includes(text(r.why))), r.why);
  assert.deepEqual(hints().map(h => h.rung), [1, 2, 3]);
  for (const code of codes) { const value = text(code, { ...task.values, mgmt: 20, gateway: '192.0.2.1', prefix: 24 }); assert.equal(typeof value, 'string'); assert.notEqual(value, code); assert.ok(value.length); assert.doesNotMatch(value, /undefined/); }
  assert.match(text('tip-admin'), /повне адміністрування/);
  assert.match(text('tip-passwords'), /Тип 7/);
});

test('DR-1 reference and accepted scripts walk the declared profile modes (including all VTY lines)', () => {
  // An independent mode walker checks entry/exit syntax and table parsing;
  // this is not a real IOS execution test.
  for (const script of [solution(task).script, acceptedScript(task, answer()).script]) {
    let mode = '>', commands = 0;
    for (const line of script.split('\n')) {
      if (line === 'enable') { assert.equal(mode, '>'); mode = '#'; }
      else if (line === 'configure terminal') { assert.equal(mode, '#'); mode = '(config)#'; }
      else if (line === 'line vty 0 15') { assert.equal(mode, '(config)#'); mode = '(config-line)#'; }
      else if (line.startsWith('interface ')) { assert.equal(mode, '(config)#'); assert.ok(profile.interfaces.includes(line.slice(10))); mode = '(config-if)#'; }
      else if (line === 'exit') { assert.ok(['(config-line)#', '(config-if)#'].includes(mode)); mode = '(config)#'; }
      else if (line === 'end') { assert.notEqual(mode, '#'); mode = '#'; }
      else { assert.equal(parse(line, { mode }).ok, true, line); commands++; }
    }
    assert.equal(commands, 12); assert.equal(mode, '#');
  }
});
