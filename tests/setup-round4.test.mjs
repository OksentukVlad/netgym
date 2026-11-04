import test from 'node:test';
import assert from 'node:assert/strict';
import { decks } from '../src/banks/setup/index.js';
import { create } from '../src/sections/setup/logic/deck.js';
import { initialState, transition, boardAnswer } from '../src/sections/setup/logic/state.js';
import { check } from '../src/sections/setup/logic/rules.js';
import { checkTyped, checkRecall } from '../src/sections/setup/logic/typed.js';
import { render, recallRows, cardText, scriptForState } from '../src/sections/setup/logic/render.js';
import { hints, explanation, tips } from '../src/sections/setup/logic/hints.js';
import { text } from '../src/sections/setup/uk.js';
import { validate } from '../src/banks/setup/validate.js';
import { full, sweepSeeds } from './helpers/sweep-mode.mjs';

const id = (task, name) => task.cards.find(c => c.commandId === name).id;
const sorted = (task, order = task.referenceOrder) => {
  let state = initialState(task);
  state = transition(task, transition(task, state, { type: 'order', order }), { type: 'check' });
  for (const card of task.cards.filter(c => c.mode)) state = transition(task, state, { type: 'prompt', id: card.id, prompt: card.mode });
  return transition(task, state, { type: 'check' });
};
/** The order passed: a deck with modes on its second step (round 9, B1). */
const toModes = task => transition(task, transition(task, initialState(task), { type: 'order', order: task.referenceOrder }), { type: 'check' });
const recall = (task, order) => transition(task, sorted(task, order), { type: 'continue' });
const correct = (task, state, lineId) => transition(task,
  transition(task, state, { type: 'typed', id: lineId, text: cardText(task, lineId).replace('<пароль>', 'UniqueOwn!9') }),
  { type: 'check-typed', id: lineId });

for (const bank of decks.slice(0, 2)) test(`${bank.id}: explicit sorting/recall/done flow, locks, earning, skip and restoration`, () => {
  const task = create(bank, { seed: 9 });
  let state = initialState(task);
  assert.equal('mode' in state.answer, false);
  assert.equal(transition(task, state, { type: 'mode', mode: 'typed' }), state);
  assert.equal(transition(task, state, { type: 'continue' }), state);
  state = transition(task, state, { type: 'check' });
  assert.equal(state.phase, 'sorting'); assert.equal(state.earned, false);
  state = sorted(task); assert.equal(state.phase, 'sorted'); assert.equal(state.earned, true);
  assert.equal(transition(task, state, { type: 'order', order: task.order }), state);
  assert.equal(transition(task, state, { type: 'prompt', id: task.order[0], prompt: '>' }), state);
  state = transition(task, state, { type: 'continue' });
  assert.equal(state.phase, 'recall'); assert.equal(state.earned, true);
  assert.deepEqual(state.answer.order, task.referenceOrder);
  assert.ok(recallRows(task, state).every(row => !row.value && !row.locked && !row.shown));
  const first = task.typedIds[0];
  state = transition(task, state, { type: 'check-typed', id: first });
  assert.equal(state.typedFeedback[first].code, 'typed-missing');
  state = correct(task, state, first);
  assert.equal(state.phase, 'recall'); assert.equal(recallRows(task, state)[0].locked, true);
  assert.equal(transition(task, state, { type: 'order', order: task.order }), state);
  const snapshot = JSON.parse(JSON.stringify(state));
  assert.deepEqual(transition(task, snapshot, { type: 'restore' }), state);
  for (const next of task.typedIds.slice(1)) state = correct(task, state, next);
  assert.equal(state.phase, 'done'); assert.equal(checkRecall(task, state.answer).ok, true);
  state = transition(task, state, { type: 'typed', id: first, text: 'wrong' });
  assert.equal(state.phase, 'recall'); assert.equal(state.typedFeedback[first], undefined);
  assert.equal(recallRows(task, state)[0].locked, false);
  assert.equal(scriptForState(task, { ...state, phase: 'done' }), null, 'stale success cannot produce a copy');
  state = transition(task, state, { type: 'reveal' });
  assert.equal(state.phase, 'done-shown'); assert.equal(state.earned, true);
  assert.equal(state.revealed, false); assert.equal(state.recallRevealed, true);
  assert.ok(recallRows(task, state).every(row => row.shown && row.locked && row.result === null));
  assert.equal(transition(task, state, { type: 'next', task }), state);
  assert.equal(transition(task, state, { type: 'next', task: create(decks[2], { seed: 10 }) }), state);
  const nextTask = create(bank, { seed: 10 });
  assert.deepEqual(transition(task, state, { type: 'next', task: nextTask }), initialState(nextTask));
  assert.deepEqual(transition(task, recall(task), { type: 'next', task: nextTask }), initialState(nextTask));
  assert.deepEqual(transition(task, sorted(task), { type: 'next', task: nextTask }), initialState(nextTask));
});

for (const bank of decks) test(`${bank.id}: sorting reveal applies reference, preserves own answer and never earns`, () => {
  const task = create(bank, { seed: 'reveal' });
  let state = transition(task, initialState(task), { type: 'check' });
  const own = structuredClone(state.answer), finding = structuredClone(state.lastFinding);
  state = transition(task, state, { type: 'reveal' });
  assert.equal(state.phase, 'sorted-shown'); assert.equal(state.feedback, null);
  assert.equal(state.earned, false); assert.deepEqual(state.answer, own);
  assert.deepEqual(state.lastFinding, finding, 'original diagnostic remains available');
  assert.deepEqual(render(task, state).map(row => row.id), task.referenceOrder);
  for (const row of render(task, state)) assert.equal(row.prompt, task.cards.find(c => c.id === row.id).mode ?? null);
  state = transition(task, state, { type: 'show-own' });
  assert.deepEqual(render(task, state).map(row => row.id), own.order);
  assert.equal(scriptForState(task, state), null, 'invalid own order has no accepted copy');
  if (task.typedIds.length) {
    state = transition(task, state, { type: 'continue' });
    assert.deepEqual(boardAnswer(task, state).order, task.referenceOrder);
    assert.equal(state.showOwn, false);
    assert.ok(scriptForState(task, state).lines.some(line => line.masked));
    state = transition(task, state, { type: 'reveal' });
    assert.equal(state.phase, 'done-shown'); assert.equal(state.earned, false);
  }
});

for (const bank of decks.slice(0, 2)) test(`${bank.id}: the order first, then missing prompts; finding-position snapshots and contextual hint rungs`, () => {
  const task = create(bank, { seed: 11 });
  // Round 9 (B1, Fable 1): a wrong order is answered with no mode chosen at all, and no mode can be chosen yet.
  const first = transition(task, initialState(task), { type: 'check' });
  assert.equal(first.phase, 'sorting');
  assert.ok(['needs-before', 'not-last'].includes(first.feedback.code), 'the order is answered at once');
  assert.equal(first.earned, false);
  assert.equal(transition(task, first, { type: 'prompt', id: task.order[0], prompt: '#' }), first, 'no mode before the order passes');
  let state = toModes(task);
  assert.equal(state.phase, 'modes');
  assert.equal(state.earned, false, 'a passed order is a step, not the task');
  assert.equal(state.feedback, null);
  assert.equal(transition(task, state, { type: 'order', order: task.order }), state, 'the order is locked');
  assert.equal(hints(task, state)[0].code, task.values.mgmt ? 'hint-modes-switch' : 'hint-modes-router');
  assert.match(text(hints(task, state)[0].code), /\(config\)#.*\(config-(?:if|line)\)#/, 'hint 1 names two real modes');
  const missing = [task.referenceOrder[2], task.referenceOrder.at(-1)];
  for (const card of task.cards.filter(c => !missing.includes(c.id))) state = transition(task, state, { type: 'prompt', id: card.id, prompt: '>' });
  state = transition(task, state, { type: 'check' });
  assert.equal(state.phase, 'modes');
  assert.equal(state.feedback.code, 'mode-missing', 'wrong modes wait for the missing ones');
  assert.deepEqual(state.feedback.findings[0].cards, missing);
  assert.deepEqual(state.lastFinding.positions, [3, task.cards.length]);
  const lesson = explanation(state.feedback);
  assert.match(text(lesson.code, lesson.params), new RegExp(`3 і ${task.cards.length}`));
  const before = hints(task, state);
  assert.equal(before[0].code, 'hint-mode-missing');
  assert.deepEqual(before[0].params.positions, [3, task.cards.length]);
  assert.equal(before[0].params.prompt, task.cards.find(c => c.id === missing[0]).mode);
  assert.equal(before[1].code, 'hint-modes-where');
  state = transition(task, state, { type: 'prompt', id: missing[0], prompt: '#' });
  assert.equal(state.stale, true); assert.deepEqual(hints(task, state), before);
  assert.ok(state.feedback, 'stale verdict stays reachable');
  state = transition(task, state, { type: 'check' });
  assert.deepEqual(state.lastFinding.cards, [missing[1]]);
  // Wrong mode and save-last each get the specific second rung.
  state = { ...initialState(task), phase: 'modes', answer: sorted(task).answer };
  state = transition(task, state, { type: 'prompt', id: task.referenceOrder[0], prompt: '>' });
  state = transition(task, state, { type: 'check' });
  assert.equal(hints(task, state)[0].code, 'hint-cards');
  assert.equal(hints(task, state)[1].code, 'hint-mode-rule');
  state = { ...initialState(task), answer: sorted(task).answer };
  state = transition(task, state, { type: 'order', order: [task.referenceOrder.at(-1), ...task.referenceOrder.slice(0, -1)] });
  state = transition(task, state, { type: 'check' });
  assert.equal(hints(task, state)[1].code, 'save-last');
});

test('router: pair hints name checked positions; recall follows the first unfinished line', () => {
  const task = create(decks[0], { seed: 4 });
  let state = { ...initialState(task), answer: sorted(task).answer };
  state = transition(task, state, { type: 'order', order: [id(task, 'crypto'), ...task.referenceOrder.filter(key => key !== id(task, 'crypto'))] });
  state = transition(task, state, { type: 'check' });
  assert.equal(hints(task, state)[1].code, 'hostname-before-key');
  assert.deepEqual(hints(task, state)[0].params.positions, [2, 1]);
  assert.match(text('hostname-before-key'), /імені пристрою та домену/);
  assert.match(text('domain-before-key'), /імені пристрою та домену/);
  assert.ok(tips(task, sorted(task).feedback).some(tip => text(tip.code).includes('імені пристрою та домену')));
  state = recall(task);
  assert.deepEqual(hints(task, state)[0].params, { mode: '(config)#', count: 6 }); // where it's typed, not the description again
  assert.equal(hints(task, state)[1].params.word, 'crypto');
  assert.ok(!text(hints(task, state)[2].code, hints(task, state)[2].params).includes(String(task.values.modulus)));
  state = transition(task, state, { type: 'hint' }); assert.equal(state.hintIndex, 1);
  state = correct(task, state, task.typedIds[0]);
  assert.equal(state.hintIndex, 0, 'a new recall line starts its own ladder');
  assert.equal(hints(task, state)[1].params.word, task.recallLines[1].template.split(' ')[0]);
});

test('2960: every valid card order keeps the learned block after hostname and masks every SVI entry', () => {
  const task = create(decks[1], { seed: 'dr-2-replay' });
  const prefix = ['hostname', 'ip-address', 'no-shutdown', 'default-gateway'];
  function permutations(ids) { return ids.length ? ids.flatMap((id, i) => permutations(ids.filter((_, j) => i !== j)).map(rest => [id, ...rest])) : [[]]; }
  let repeated = false;
  for (const names of permutations(prefix)) {
    const order = [...names, 'write-memory'].map(name => id(task, name));
    let state = sorted(task, order); assert.equal(state.feedback.ok, true);
    const script = scriptForState(task, state);
    assert.deepEqual(script.lines.filter(l => l.kind === 'command').map(l => l.cardId), order);
    const hostname = script.lines.findIndex(l => l.cardId === id(task, 'hostname'));
    assert.deepEqual(script.lines.slice(hostname + 1).filter(l => l.kind === 'learned').map(l => l.text), [
      'ip domain-name lab.example', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'enable secret <пароль>',
      'username maintainer privilege 15 secret <пароль>', 'transport input ssh', 'login local',
    ]);
    assert.equal(script.lines[hostname + 1].kind, 'learned');
    assert.ok(script.lines.filter(l => l.kind === 'learned').every(l => l.note === 'script-as-router'));
    assert.equal(script.lines.at(-1).text, 'write memory');
    const entries = script.lines.filter(l => l.text === 'interface vlan 10');
    repeated ||= entries.length > 1;
    state = transition(task, state, { type: 'continue' });
    for (const line of task.recallLines) assert.equal(JSON.stringify(scriptForState(task, state)).includes(cardText(task, line.id)), false);
    const masked = scriptForState(task, state).lines.filter(l => l.recallId === 'recall:svi-enter');
    assert.equal(masked.length, entries.length); assert.ok(masked.every(l => l.text === '…'));
    state = correct(task, state, 'recall:svi-enter');
    assert.equal(scriptForState(task, state).lines.filter(l => l.text === 'interface vlan 10').length, entries.length);
  }
  assert.equal(repeated, true);
});

test('MikroTik: checkpoint has no command; bridge port must precede it, unrelated commands may follow', () => {
  const bank = decks[2], task = create(bank, { seed: 'dr-3-replay' });
  const order = ['bridge', 'bridge-port', 'list', 'list-member', 'address', 'user', 'checkpoint', 'services', 'admin-off', 'mac-telnet-off', 'mac-server', 'discovery', 'ssh-strong'].map(name => id(task, name));
  const state = sorted(task, order), copy = scriptForState(task, state);
  assert.equal(state.feedback.ok, true);
  for (const line of [initialState(task), { ...initialState(task), lastFinding: { code: 'needs-before', why: 'bridge-before-port', cards: [id(task, 'bridge'), id(task, 'bridge-port')], positions: [8, 2] } }]) {
    const third = hints(task, line)[2];
    assert.match(text(third.code, third.params), /міст bridge-demo.*порт ether3/);
    assert.doesNotMatch(text(third.code, third.params), /bridge-lan|створи профіль/);
  }
  const checkpoint = task.cards.find(c => c.kind === 'checkpoint');
  assert.equal('template' in checkpoint, false);
  assert.match(render(task, state).find(row => row.id === checkpoint.id).text, /maintainer.*Winbox.*SSH.*192\.168\.77\.1/);
  assert.equal(copy.script, null); assert.equal(copy.parts.length, 2);
  assert.ok(copy.parts[0].script.endsWith('# Тепер увійди як maintainer у новому вікні. Далі — лише після успішного входу.'));
  assert.ok(copy.parts[1].script.startsWith('/ip service disable'));
  assert.ok(copy.parts[1].script.includes('/user disable admin'));
  const bad = order.filter(key => key !== id(task, 'bridge-port'));
  bad.splice(bad.indexOf(checkpoint.id) + 1, 0, id(task, 'bridge-port'));
  assert.equal(check(task, { ...state.answer, order: bad }).findings[0].why, 'port-before-checkpoint');
  for (const [a, b] of [['user', 'checkpoint'], ['address', 'checkpoint'], ['bridge-port', 'checkpoint'], ['checkpoint', 'admin-off']]) {
    const broken = structuredClone(bank); broken.rules = broken.rules.filter(r => !(r.a === a && r.b === b));
    assert.ok(validate(broken).some(error => error.detail === 'checkpoint-rule'));
  }
  assert.match(text('tip-routeros-firewall'), /WAN не підключено.*забороняють керування з WAN/);
  assert.match(text('tip-routeros-save'), /окремої команди збереження не потрібно/);
});

test(`recall generation and masking sweep (${full ? '200' : 'sampled'} seeds, both Cisco decks)`, () => {
  const seen = new Set(), vlans = new Set();
  for (const seed of sweepSeeds(Array.from({ length: 200 }, (_, i) => i), [0, 1, 3, 7, 10, 42, 99, 199])) for (const bank of decks.slice(0, 2)) {
    const task = create(bank, { seed });
    assert.deepEqual(task, create(bank, { seed }));
    assert.equal(task.typedIds.length, 3); assert.equal(new Set(task.typedIds).size, 3);
    if (bank.id === 'dr-1') {
      assert.equal(task.recallLines[0].commandId, 'crypto');
      for (const line of task.recallLines) { seen.add(line.commandId); assert.equal(checkTyped(task, line.id, cardText(task, line.id)).ok, true); }
      assert.match(text('typed.crypto', task.values), new RegExp(String(task.values.modulus)));
    } else {
      vlans.add(task.values.mgmt);
      assert.deepEqual(task.recallLines.map(c => c.commandId), ['interface', 'ip-address', 'default-gateway']);
      assert.equal(task.recallLines[0].id, 'recall:svi-enter');
      assert.equal(task.recallLines[0].mode, '(config)#');
      assert.equal(checkTyped(task, 'recall:svi-enter', `int vlan ${task.values.mgmt}`).ok, true);
      assert.ok(text(task.profileText, task.values).includes(`VLAN ${task.values.mgmt}`));
      assert.match(text('tip-default-gateway'), /IP-маршрутизацію вимкнено/);
    }
    let state = recall(task);
    for (const line of task.recallLines) {
      for (const part of scriptForState(task, state).parts) {
        assert.equal(part.script.includes(cardText(task, line.id)), false, `${bank.id}/${seed}: hidden copy line`);
        assert.equal(JSON.stringify(part.lines).includes(cardText(task, line.id)), false);
      }
      assert.equal(JSON.stringify(render(task, state)).includes(cardText(task, line.id)), false);
    }
    for (const line of task.recallLines) state = correct(task, state, line.id);
    assert.equal(state.phase, 'done');
    assert.ok(scriptForState(task, state).lines.every(l => !l.masked));
  }
  assert.deepEqual([...seen].sort(), ['crypto', 'domain', 'ip-address', 'login-local', 'password-encryption', 'ssh-version', 'transport-ssh', 'username']);
  assert.deepEqual([...vlans].sort((a, b) => a - b), [10, 20, 99]);
  assert.match(text('tip-passwords'), /Тип 7 — маскування/);
  assert.match(text('tip-2960-key'), /2048/);
});

// Round 4 review: a recall hint never prints the line's own command (a line
// without values has no "other values" example), nor any command the
// checker accepts for it (the key size is a placeholder: 2048 and 4096 pass).
for (const bank of decks.slice(0, 2)) test(`${bank.id}: recall hints never contain the answer line`, () => {
  for (let seed = 0; seed < 40; seed++) {
    const task = create(bank, { seed });
    for (const line of task.recallLines) {
      const typedFeedback = Object.fromEntries(task.recallLines.filter(l => l !== line).map(l => [l.id, { ok: true }]));
      const ladder = hints(task, { phase: 'recall', typedFeedback });
      assert.equal(ladder.length, 3);
      const answer = cardText(task, line.id);
      for (const h of ladder) {
        const words = text(h.code, h.params);
        assert.equal(words.includes(answer), false, `${bank.id} ${seed} ${line.id}: ${words}`);
        // Nothing a hint prints passes the recall check for that line: the
        // whole text, what follows its colon, each «;» part, without «…» or a final full stop.
        const tail = words.slice(words.indexOf(': ') + 2);
        const candidates = [words, tail, ...tail.split(';')].map(c => c.replace(/\s*….*$/u, '').replace(/\.$/, '').trim()).filter(Boolean);
        for (const candidate of candidates) assert.equal(checkTyped(task, line.id, candidate).ok, false, `${bank.id} ${seed} ${line.id}: «${candidate}» is accepted`);
      }
    }
  }
});
