import test from 'node:test';
import assert from 'node:assert/strict';
import bank from '../src/banks/setup/cisco-router.js';
import { decks } from '../src/banks/setup/index.js';
import { create } from '../src/sections/setup/logic/deck.js';
import { initialAnswer } from '../src/sections/setup/logic/model.js';
import { render, acceptedScript } from '../src/sections/setup/logic/render.js';
import { check } from '../src/sections/setup/logic/rules.js';
import { hints, explanation, tips } from '../src/sections/setup/logic/hints.js';
import { solution } from '../src/sections/setup/logic/solution.js';
import { text } from '../src/sections/setup/uk.js';
import { initialState, transition } from '../src/sections/setup/logic/state.js';
import { recallRows, cardText, scriptForState } from '../src/sections/setup/logic/render.js';
import { setupLeaks } from './helpers/setup-leaks.mjs';

test('DR-1 setupLeaks scans seeded generated surfaces, including all typed descriptions and hints', () => {
  const seen = new Set();
  for (let seed = 0; seed < 128; seed++) {
    const task = create(bank, { seed }), answer = initialAnswer(task);
    assert.deepEqual(setupLeaks(render(task, answer)), []);
    assert.deepEqual(setupLeaks(task.values), []);
    assert.deepEqual(setupLeaks(text('profile')), []);
    assert.equal(acceptedScript(task, answer), null);
    assert.deepEqual(tips(task, check(task, answer)), []);
    let state = transition(task, initialState(task), { type: 'reveal' });
    state = transition(task, state, { type: 'continue' });
    for (const row of recallRows(task, state)) {
      seen.add(task.recallLines.find(c => c.id === row.id).commandId);
      assert.deepEqual(setupLeaks(row.description, 'typed'), []);
      assert.equal(JSON.stringify(scriptForState(task, state)).includes(cardText(task, row.id)), false);
    }
    // Rungs 1/2 are conceptual; rung 3 explicitly discloses a shape on other values.
    for (const hint of hints(task).slice(0, 2)) assert.deepEqual(setupLeaks(text(hint.code, hint.params), 'hint'), []);
    assert.match(text(hints(task)[2].code, hints(task)[2].params), /Приклад на інших значеннях/);

  }
  assert.equal(seen.size, 8);
});

const leaks = [
  [{ referenceOrder: ['hostname', 'domain'] }, 'render', 'answer-annotation'],
  [{ requiredMode: '(config)#' }, 'render', 'answer-annotation'],
  [{ id: 'hostname', mode: '(config)#' }, 'render', 'required-mode'],
  [{ id: 'configure terminal' }, 'render', 'reference-script'],
  ['<li data-mode="(config)#">x</li>', 'render', 'answer-annotation'],
  ['<input aria-label="expectedMode (config)#">', 'render', 'answer-annotation'],
  ['<li title="hostname → crypto">x</li>', 'render', 'rule-pair'],
  ['<li aria-label="hostname &#x2192; crypto">x</li>', 'render', 'rule-pair'],
  ['<li data-tip="domain → crypto">x</li>', 'render', 'rule-pair'],
  ['hostname → (config)#', 'render', 'required-mode'],
  ['<li title="configure terminal">x</li>', 'render', 'reference-script'],
  ['hostname R1', 'typed', 'typed-keyword'],
  ['<li aria-label="host&#110;ame">x</li>', 'typed', 'typed-keyword'],
  ['<input data-command="username">', 'typed', 'typed-keyword'],
];
for (const [value, kind, expected] of leaks) test(`DR-1 setupLeaks catches injected ${expected}: ${JSON.stringify(value)}`, () => {
  assert.ok(setupLeaks(value, kind).includes(expected));
});

test('DR-1 string gate permits learner-selected prompts; initial unchecked state needs the structural gate', () => {
  assert.deepEqual(setupLeaks('<input aria-checked="true" value="(config)#">'), []);
  assert.deepEqual(setupLeaks({ id: 'c-12345678', kind: 'card', prompt: '(config)#' }), []);
});

test('DR-1 failed checks disclose only the selected finding and marks; reference is reveal-only', () => {
  const task = create(bank, { seed: 0 }), answer = initialAnswer(task);
  const result = check(task, answer);
  assert.equal(result.findings.length, 1);
  assert.equal('evidence' in result, false);
  assert.equal('referenceOrder' in result, false);
  assert.equal('prompts' in result.findings[0], false);
  assert.deepEqual(Object.keys(result.findings[0]).sort(), ['cards', 'code', 'severity']);
  assert.deepEqual(explanation(result), { code: result.findings[0].code });
  // Intentionally fail the pre-disclosure gate on a reveal payload/raw task.
  assert.ok(setupLeaks(task).length);
  assert.ok(setupLeaks(solution(task)).length);
});

// Literal witnesses: don't derive the scanner's positive cases from its own
// patterns or the current copy. Cover the shared DR-1/DR-2 rules as well.
const prerequisites = {
  'hostname-before-key': 'Спершу задай ім’я пристрою, а потім створи ключ: назва ключа будується з імені пристрою та домену.',
  'domain-before-key': 'Спершу задай домен, а потім створи ключ: назва ключа будується з імені пристрою та домену.',
  'user-before-login': 'Спершу створи користувача, а потім вмикай на лініях vty вхід за локальними користувачами — інакше зайти через vty не буде з чим. Це безпечний порядок роботи через консоль.',
  'save-last': 'Збереження конфігурації фіксує поточний стан. Збережи її після всіх змін, щоб після перезапуску налаштування були повними.',
  'bridge-before-port': 'Міст, до якого додаєш порт, має вже існувати.',
  'bridge-before-member': 'Міст, який додаєш до списку інтерфейсів, має вже існувати.',
  'bridge-before-address': 'Міст, якому задаєш адресу, має вже існувати.',
  'list-before-member': 'Список, до якого додаєш інтерфейс, має вже існувати.',
  'list-before-mac': 'Список, яким обмежуєш доступ за апаратною адресою, має вже існувати.',
  'list-before-discovery': 'Список, яким обмежуєш виявлення сусідів, має вже існувати.',
  'user-before-checkpoint': 'Спершу створи користувача, під яким перевірятимеш вхід.',
  'address-before-checkpoint': 'Спершу задай адресу LAN, на яку підключатимешся в новому вікні.',
  'port-before-checkpoint': 'Спершу додай порт доступу до мосту: через нього перевіряють вхід на адресу LAN.',
  'checkpoint-before-disable': 'Спершу успішно увійди новим користувачем у новому вікні, і лише тоді вимикай admin.',
};
for (const [code, literal] of Object.entries(prerequisites)) test(`prerequisite injection: ${code} is disclosure-only`, () => {
  assert.equal(text(code), literal);
  for (const value of [literal, { text: literal }, `<li title="${literal}"></li>`, `<li aria-label="${literal.replaceAll(' ', '&#32;')}"></li>`]) {
    for (const kind of ['render', 'hint', 'typed']) assert.ok(setupLeaks(value, kind).includes('rule-pair'), `${kind}: ${JSON.stringify(value)}`);
    assert.deepEqual(setupLeaks(value, 'rule'), [], JSON.stringify(value));
  }
});

const semanticIds = [
  'hostname', 'domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'password-encryption',
  'transport-ssh', 'login-local', 'ip-address', 'no-shutdown', 'write-memory',
  'svi-address', 'svi-up', 'default-gateway',
  'bridge', 'bridge-port', 'list', 'list-member', 'address', 'user', 'admin-off', 'services',
  'mac-server', 'discovery', 'ssh-strong', 'mac-telnet-off', 'checkpoint',
];
test('literal leak witnesses cover every bank card identity, command identity and prerequisite', () => {
  assert.deepEqual([...new Set(decks.flatMap(b => b.cards.flatMap(c => [c.id, c.commandId ?? c.id])))].sort(), [...semanticIds].sort());
  assert.deepEqual([...new Set(decks.flatMap(b => b.rules.map(r => r.why)))].sort(), Object.keys(prerequisites).sort());
});

const identityAttributes = ['id', 'for', 'class', 'name', 'aria-controls', 'aria-describedby', 'aria-labelledby', 'data-command', 'data-card'];
for (const id of [...semanticIds, 'interface', 'recall:svi-enter']) test(`semantic identity injection: ${id}`, () => {
  for (const attribute of identityAttributes) for (const value of [
    { [attribute]: id }, `<li ${attribute}="${id}"></li>`, `<li ${attribute}='${id}'></li>`, `<li ${attribute}=${id}></li>`,
    `<input value=">" ${attribute}="${id}">`,
    `<li ${attribute}="row-${id}-field"></li>`, `<li ${attribute}="${id.replaceAll('-', '&#45;')}"></li>`,
  ]) for (const kind of ['render', 'typed']) {
    assert.ok(setupLeaks(value, kind).includes('typed-keyword'), `${kind}: ${JSON.stringify(value)}`);
  }
});

test('internal commandId properties are rejected explicitly, regardless of their value', () => {
  for (const commandId of [...semanticIds, 'c-12345678', '', null, 7]) {
    assert.ok(setupLeaks({ row: { commandId } }).includes('answer-annotation'), JSON.stringify(commandId));
  }
});

test('card rows permit CLI text, Winbox paths and accessible command labels', () => {
  for (const b of decks) {
    const task = create(b, { seed: 0 });
    for (const row of render(task, initialAnswer(task))) {
      assert.deepEqual(setupLeaks(row), [], JSON.stringify(row));
      assert.deepEqual(setupLeaks(`<li aria-label="${row.text}" title="${row.secondary ?? row.text}"></li>`), []);
    }
  }
});
