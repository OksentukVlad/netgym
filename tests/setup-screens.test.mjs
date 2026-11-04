// «Налаштування з нуля» rendered on the server (round 4, spec S): the
// screen's words, the generic ReorderList's limits, the shared session's
// `assist`, and the string leak gate over whole markup (text and
// attributes) for many seeds on every deck: the sorting first view, recall
// (its three lines hidden everywhere), the passing deck's script (2960's
// complete setup, RouterOS's two parts) and the success explanation. The
// mounted gate (tests/setup-mounted.test.mjs) covers lifecycle and keys.
// tools/test.sh bundles tests/harness/setup.jsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardText, render, scriptForState } from '../src/sections/setup/logic/render.js';
import { tips } from '../src/sections/setup/logic/hints.js';
import { section, ui, copy, deckUi, modesExample, text, comprehension } from '../src/sections/setup/uk.js';
import { setupExample } from '../src/sections/setup/logic/examples.js';
import { expectWorkedExample } from './helpers/worked-example.mjs';
import { expectPurposes } from './helpers/purposes.mjs';
import { uk as shared } from '../src/ui/uk.js';
import { section as firewallSection } from '../src/sections/firewall/uk.js';
import { keyTarget, moveTo } from '../src/ui/reorder.js';
import { sessionReducer, initialSession } from '../src/ui/session.js';
import { setupLeaks } from './helpers/setup-leaks.mjs';

const h = await import('../.test-bundles/harness/setup.mjs');
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Whole-word starts ("покласти" is not a class).
const CALM = /рахун|(?<!\p{L})бал[іиа]|серія|іспит|екзамен|квиток|(?<!\p{L})клас|(?<!\p{L})урок|оцінк|✅|🎉|🏆/iu;
const PROMPTS = ['>', '#', '(config)#', '(config-line)#', '(config-if)#'];
const recordOf = id => h.bank.decks.find(d => d.id === id);

/** A deck put in `order` with every card's own prompt, then checked. */
function sorted(task, order = task.referenceOrder) {
  let state = h.initialState(task);
  state = h.transition(task, h.transition(task, state, { type: 'order', order }), { type: 'check' });
  for (const card of task.cards.filter(c => c.mode)) state = h.transition(task, state, { type: 'prompt', id: card.id, prompt: card.mode });
  return h.transition(task, state, { type: 'check' });
}
/** A valid order other than the reference: one free adjacent pair swapped. */
function otherOrder(task) {
  const ref = task.referenceOrder;
  for (let i = 0; i + 1 < ref.length; i++) {
    const order = [...ref];
    [order[i], order[i + 1]] = [order[i + 1], order[i]];
    if (sorted(task, order).phase === 'sorted') return order;
  }
  throw new Error('no other valid order');
}
/** The markup without the CLI example (it teaches the mode changes on another device, by design). */
const withoutExample = html => html.replace(/<pre class="ng-su-modes">[^]*?<\/pre>/g, '').replace(/<dl class="ng-su-modes-words">[^]*?<\/dl>/g, '');
/** Card identities (the opaque id or the command's own id) in machine attributes of rendered markup. */
function identityLeaks(html, task) {
  return task.cards.flatMap(card => [card.id, card.commandId]).filter(name =>
    new RegExp(`\\s(?:id|for|class|name|title|aria-controls|aria-describedby|aria-labelledby)="[^"]*(?<!\\w)${name}(?!\\w)[^"]*"`).test(html.replace(/class="ng-hints-list[^"]*"/g, '')));
}
/** The deck's rows (the sortable list) as markup. */
const deckOf = html => html.slice(html.indexOf('<ol class="ng-reorder"'), html.indexOf('</ol>', html.indexOf('<ol class="ng-reorder"')));

test('setup strings: every screen word is non-empty with its parameters, and calm', () => {
  const sample = { n: 3, total: 12, name: 'hostname R12', token: 'hostnme', label: 'Частина 1', positions: [2, 6] };
  const walk = (value, path) => {
    if (typeof value === 'function') {
      const out = value(sample);
      assert.equal(typeof out, 'string', path);
      assert.ok(out.trim().length > 0 && !/undefined|null|NaN|\[object/.test(out), `${path}: ${out}`);
    } else if (typeof value === 'string') assert.ok(value.trim().length > 0, path);
    else for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
  };
  walk(ui, 'ui');
  walk(section, 'section');
  walk(shared.reorder, 'shared.reorder');
  for (const words of [ui, section, shared.reorder]) assert.doesNotMatch(JSON.stringify(words), CALM);
  assert.equal(section.title, 'Налаштування з нуля');
  // One task sentence for every deck (spec S2); MikroTik's without the modes part.
  // Round 5 repair v1: the task sentence is the goal only; the how (and the modes) is the action line's.
  assert.equal(ui.task, 'Збери базове налаштування в робочому порядку.');
  assert.equal(ui.actionOrder, 'Перетягни картки за ≡ або натискай ↑ ↓.');
  assert.equal(ui.actionModes, 'У кожній картці обери режим.');
  // The mode «?» goes after «режим» and its full stop (the end of the line), never inside a word; without the word, at the end.
  assert.equal(h.helpAt(ui.actionModes), ui.actionModes.length);
  assert.equal(h.helpAt('Обери режим, потім рядок.'), 'Обери режим,'.length);
  assert.equal(h.helpAt('Обери режими.'), 'Обери режими.'.length);
  assert.equal(h.helpAt('Без потрібного слова'), 'Без потрібного слова'.length);
  assert.equal(ui.continue, 'Тепер по пам’яті →');
  // Words around the cards before any check never name an order or a card's prompt.
  const own = [ui.task, ui.actionModes, ui.actionOrder, ui.modesTitle, ui.modesFull, ui.orders, ui.noPrompt, ui.promptOf(sample), ui.recallPlaceholder, ui.recallTask, shared.reorder.help];
  for (const words of [...own, ...Object.values(shared.reorder).filter(v => typeof v === 'function').map(f => f(sample))]) assert.doesNotMatch(words, /→|перед |спершу|потім|\(config|#/, words);
  for (const words of own) assert.deepEqual(setupLeaks(words, 'typed'), [], words);
  // The modes in words: all five prompts; none names a card's command.
  assert.deepEqual(Object.keys(ui.modes).sort(), [...PROMPTS].sort());
  for (const words of Object.values(ui.modes)) assert.deepEqual(setupLeaks(words, 'typed'), [], words);
  // The screen's words live apart from the logic's codes; the old way switch is gone.
  assert.ok(!Object.keys(copy).some(code => code in ui));
  for (const gone of ['ways', 'wayNames', 'typedTask', 'another', 'legend', 'legendTitle', 'resultBelow']) assert.equal(ui[gone], undefined, gone);
});

test('setup CLI example: moving between the five modes on a generic device, naming no card of the deck', () => {
  for (const record of [h.ciscoRouter, h.cisco2960]) for (let seed = 0; seed < 32; seed++) {
    const task = h.drill.create(record, { seed });
    const lines = modesExample(task.values);
    assert.deepEqual(lines.map(l => l.prompt), ['>', '#', '(config)#', '(config-if)#', '(config)#', '(config-line)#', '#']);
    assert.deepEqual(lines.map(l => l.command.split(' ')[0]), ['enable', 'configure', 'interface', 'exit', 'line', 'end', '']);
    const all = lines.map(l => `${l.device}${l.prompt} ${l.command}`).join('\n');
    for (const card of task.cards) assert.ok(!all.includes(cardText(task, card.id)), `${record.id} seed ${seed}: a card's command in the example`);
    // The 2960's interface line is a recall line: the example uses another VLAN.
    for (const id of task.typedIds) assert.ok(!all.includes(cardText(task, id)), `${record.id} seed ${seed}: a recall line in the example`);
    if (record === h.ciscoRouter) assert.ok(all.includes(`interface ${task.values.interface}`) && lines[0].device === 'Router');
    else assert.ok(all.includes('interface vlan 88') && !all.includes(`vlan ${task.values.mgmt}`) && lines[0].device === 'Switch');
  }
});

test('setup deck words: a heading per deck; the 2960 givens live in its profile with the generated VLAN; MikroTik keeps its givens line', () => {
  assert.deepEqual(Object.keys(deckUi), h.bank.decks.map(d => d.id));
  assert.deepEqual(h.bank.decks.map(d => d.label), ['Роутер Cisco', 'Комутатор Cisco 2960', 'Роутер MikroTik']);
  assert.equal(deckUi['dr-1'].heading, 'Маршрутизатор Cisco: основа й захищений доступ');
  assert.equal(deckUi['dr-1'].givens, undefined);
  assert.equal(deckUi['dr-2'].givens, undefined, 'the 2960 givens moved into its profile (spec S3)');
  for (const [id, words] of Object.entries(deckUi)) {
    const values = h.drill.create(recordOf(id), { seed: 3 }).values;
    for (const line of [words.heading, ...(words.givens ? [words.givens(values)] : [])]) {
      assert.ok(line.trim().length > 0 && !/undefined|null|NaN|\[object/.test(line), `${id}: ${line}`);
      assert.doesNotMatch(line, CALM, `${id}: ${line}`);
      assert.doesNotMatch(line, /→|перед |спершу|потім|\(config|#/, `${id}: ${line}`);
      assert.deepEqual(setupLeaks(line), [], `${id}: ${line}`);
    }
  }
  assert.match(deckUi['dr-3'].givens(), /^Дано: [^.]*серійна консоль.*без WAN\.$/, 'C1: the serial console on an isolated network');
  // The 2960's context (the VLAN exists and its port forwards, routing off) on the generated management VLAN, on screen.
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const task = h.drill.create(h.cisco2960, { seed });
    const html = unescape(h.renderScreen(h.storeFor({ seed, deck: 'dr-2' })));
    const profile = text(task.profileText, task.values);
    assert.ok(html.includes(profile), `seed ${seed}: the profile is on screen`);
    assert.ok(profile.includes(`VLAN ${task.values.mgmt} уже є`) && /порт доступу[^.]*пересилає кадри/.test(profile) && /IP-маршрутизацію вимкнено/.test(profile), profile);
    assert.equal((html.match(/VLAN \d+ уже є/g) ?? []).length, 1, 'said once (no separate givens line)');
  }
  assert.equal(text('ok.dr-3'), 'Усе готово. Порядок підходить.');
  assert.ok(text('tip-routeros-firewall').includes(`«${firewallSection.title}»`) && /WAN не підключено/.test(text('tip-routeros-firewall')));
});

test('ReorderList: a move goes where asked, clamped to the list; the keys’ limits are only the ends', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveTo(ids, 'b', 0), ['b', 'a', 'c', 'd']);
  assert.deepEqual(moveTo(ids, 'b', 3), ['a', 'c', 'd', 'b']);
  assert.deepEqual(moveTo(ids, 'a', -5), null);
  assert.deepEqual(moveTo(ids, 'd', 9), null);
  assert.deepEqual(moveTo(ids, 'x', 1), null);
  assert.equal(keyTarget('ArrowUp', 0, 4), 0);
  assert.equal(keyTarget('ArrowDown', 3, 4), 3);
  assert.equal(keyTarget('ArrowDown', 1, 4), 2);
  assert.equal(keyTarget('Home', 2, 4), 0);
  assert.equal(keyTarget('End', 0, 4), 3);
  assert.equal(keyTarget(' ', 1, 4), null);
  assert.equal(keyTarget('ArrowLeft', 1, 4), null);
});

test('session: `assist` marks the instance assisted (once), opens no hint, and counts toward earned.assisted', () => {
  const s = sessionReducer(initialSession(), { type: 'assist' });
  assert.equal(s.assisted, true);
  assert.equal(s.hintIndex, 0);
  assert.equal(sessionReducer(s, { type: 'assist' }), s);
  const done = sessionReducer(s, { type: 'check', result: { ok: true, complete: true } });
  assert.deepEqual(done.earned, { solved: true, assisted: true });
});

test('setup identity scan: injected opaque ids and command ids in attributes are caught', () => {
  const task = h.drill.create(h.ciscoRouter, { seed: 3 });
  const html = unescape(h.renderScreen(h.storeFor({ seed: 3 })));
  assert.deepEqual(identityLeaks(html, task), []);
  const [first, second] = task.cards;
  for (const injected of [`<li id="row-${first.id}">`, `<li class="ng-reorder-item ${first.commandId}">`, `<input aria-describedby="v-${second.commandId}">`, `<label for="${second.id}">`]) {
    assert.ok(identityLeaks(html + injected, task).length > 0, injected);
  }
});

test('setup purposes (round 5, R2): every card and the login check has one, within the one-line cap, calm, naming no prompt', () => {
  for (const record of h.bank.decks) {
    const purposes = record.cards.map(card => card.purpose);
    assert.equal(purposes.length, { 'dr-1': 12, 'dr-2': 5, 'dr-3': 13 }[record.id], record.id);
    assert.deepEqual(h.tooLong(purposes), [], `${record.id}: a purpose missing or over the cap`);
    for (const purpose of purposes) {
      assert.doesNotMatch(purpose, CALM, purpose);
      assert.doesNotMatch(purpose, /\(config|→|спершу|потім/, `${record.id}: «${purpose}» names a prompt or an order`);
    }
  }
});

/** The rows' purposes and DR-3's Winbox paths, in DOM order, and the markup without them (round 5: the
 * purposes may name what a command needs, «потрібен …»; that is the point, not a leak of the order). */
const PURPOSE = /<span class="ng-purpose is-stacked ng-su-purpose" data-purpose="">([^<]*)<\/span>/g;
function seconds(html) {
  const purposes = [...html.matchAll(PURPOSE)].map(m => m[1]);
  const found = [...html.matchAll(/<span class="ng-su-path">([^<]*)<\/span>/g)].map(m => m[1]);
  return { purposes, found, rest: html.replace(PURPOSE, '').replace(/<span class="ng-su-path">[^<]*<\/span>/g, '') };
}
/** The task sentence without the mode help's «?» (a button inside it on the Cisco decks). */
const withoutModeQ = html => html.replace(/<button[^>]*class="ng-su-modes-q"[^>]*>.*?<\/button>/, '');

test('setup first view (server), every deck: no leaks in text or attributes, learner order, nothing chosen, only what the deck offers, for 64 seeds', () => {
  for (const record of h.bank.decks) {
    const dr3 = record.id === 'dr-3';
    for (let seed = 0; seed < 64; seed++) {
      const task = h.drill.create(record, { seed });
      const raw = unescape(h.renderScreen(h.storeFor({ seed, deck: record.id })));
      const shown = render(task, h.initialState(task));
      const { purposes, found, rest } = seconds(raw);
      assert.deepEqual(purposes, shown.map(r => (r.kind === 'checkpoint' ? comprehension.checkpointPurpose : r.purpose)), `${record.id} seed ${seed}: each row's own purpose (the login check: a step), in the learner's order`);
      assert.deepEqual(found, shown.filter(r => r.secondary).map(r => `${ui.winbox} ${r.secondary}`), `${record.id} seed ${seed}: Winbox paths`);
      expectPurposes(raw, { expected: task.cards.length });
      const html = withoutModeQ(withoutExample(rest));
      const label = `${record.id} seed ${seed}`;
      assert.deepEqual(setupLeaks(html), [], label);
      assert.doesNotMatch(html, /\sdata-(?!theme=|layout=|help(?:-[\w]+)?=|term=""|purpose=""|action-line=""|worked-example="")[\w-]+=/, `${label}: a data attribute (only the panel's hooks and round 5's empty markers)`);
      assert.doesNotMatch(html, /data-evidence|data-help-current/, `${label}: nothing is current before a check`);
      assert.deepEqual(identityLeaks(html, task), [], `${label}: card identity in an attribute`);
      const deck = deckOf(html);
      assert.doesNotMatch(deck, /aria-checked="true"/, `${label}: a prompt chosen`);
      assert.equal((deck.match(/role="radiogroup"/g) ?? []).length, 0, `${label}: no mode asked for before the order passes`);
      assert.equal((deck.match(/<li class="ng-reorder-item/g) ?? []).length, { 'dr-1': 12, 'dr-2': 5, 'dr-3': 13 }[record.id]);
      // 5b-2 F: each row starts with its purpose, its command (or the step) after it.
      for (const item of deck.split('<li class="ng-reorder-item').slice(1)) {
        assert.ok(item.indexOf('data-purpose=""') < item.search(/class="ng-su-(?:cmd|step)"/), `${label}: the purpose before the command`);
      }
      // 5b-2 A: one worked example, folded, right after the action line and before the deck; nothing of it in the markup yet.
      expectWorkedExample(raw, { open: false });
      assert.match(raw, /data-action-line="">(?:(?!<\/p>).)*<\/p><div class="ng-wex" data-worked-example="">/, `${label}: the example is the action line's next sibling`);
      assert.ok(raw.indexOf('data-worked-example') < raw.indexOf('<ol class="ng-reorder"'), `${label}: the example above the deck`);
      const ex = setupExample({ syntax: dr3 ? 'routeros' : 'cisco' });
      for (const words of [ex.context, ex.rows.at(-1)[1]]) assert.ok(!raw.includes(words), `${label}: the folded example shows nothing: «${words}»`);
      let at = 0;
      for (const row of shown) {
        const next = deck.indexOf(row.text, at);
        assert.ok(next >= at, `${label}: «${row.text}» after the row before it`);
        at = next;
      }
      assert.ok(!/ng-su-field|ng-su-script|ng-copy|ng-su-recall/.test(html), `${label}: no recall line or script before the check passes`);
      assert.ok(html.includes(`>${deckUi[record.id].heading}<`) && html.includes(`<p class="ng-su-task">${ui.task}</p>`));
      // The action line: the order alone on every deck; the mode «?» and the CLI example wait for the modes step.
      assert.ok(raw.includes(`data-action-line="">${ui.actionOrder}</p>`), `${label}: the action line`);
      assert.equal((raw.match(/class="ng-su-modes-q"/g) ?? []).length, 0, `${label}: no mode «?» on the order step`);
      assert.match(html, new RegExp(`aria-checked="true"[^>]*>${record.label}<`));
      // DR-3's login check is a step, not a command.
      assert.equal(raw.includes('class="ng-su-modes"'), false);
      assert.equal((deck.match(/class="ng-su-step"/g) ?? []).length, dr3 ? 1 : 0);
      if (dr3) {
        const step = shown.find(r => r.kind === 'checkpoint');
        assert.ok(deck.includes(`✋</span> ${step.text}`) && !deck.includes(`<code class="ng-su-cmd">${step.text}`), `${label}: the step in words, not monospace`);
        assert.ok(!deck.includes('ng-su-tag'), `${label}: no «міст» chip (the purposes say «міст»)`);
      }
    }
  }
});

test('setup first view (server): positions number the handles and groups; ↑ first and ↓ last only unavailable', () => {
  const html = unescape(h.renderScreen(h.storeFor({ seed: 5 })));
  const handles = [...html.matchAll(/class="ng-reorder-handle"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]);
  assert.equal(handles.length, 12);
  handles.forEach((label, i) => assert.ok(label.startsWith(`${i + 1}. `), label));
  const ups = [...html.matchAll(/aria-label="Вище: позиція (\d+)" aria-disabled="(true|false)"/g)];
  const downs = [...html.matchAll(/aria-label="Нижче: позиція (\d+)" aria-disabled="(true|false)"/g)];
  assert.deepEqual(ups.map(m => m[2] === 'true'), Array.from({ length: 12 }, (_, i) => i === 0));
  assert.deepEqual(downs.map(m => m[2] === 'true'), Array.from({ length: 12 }, (_, i) => i === 11));
  // The keyboard line is an aside now (open on the first visit), still describing the handles.
  assert.ok(html.includes(`>${shared.reorder.help}<`) && html.includes(`>${ui.orders}<`));
  assert.match(html, /class="ng-su is-sorting" data-theme="dark" data-layout="desk"/);
  // One help panel: the check primary, «Далі →» secondary (skip, decision Q6), the reveal a link.
  assert.equal((html.match(/data-help-panel=""/g) ?? []).length, 1);
  assert.match(html, /ng-button-primary[^"]*ng-help-check|ng-help-check[^"]*ng-button-primary/);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
});

test('setup recall (server): the three lines are hidden everywhere until typed, on both Cisco decks, for 48 seeds, in learner orders', () => {
  for (const record of [h.ciscoRouter, h.cisco2960]) for (let seed = 0; seed < 48; seed++) {
    const task = h.drill.create(record, { seed });
    const order = seed % 2 ? otherOrder(task) : task.referenceOrder;
    const state = h.transition(task, sorted(task, order), { type: 'continue' });
    assert.equal(state.phase, 'recall');
    const html = unescape(h.renderScreen(h.storeFor({ seed, deck: record.id, setup: state, session: { earned: { solved: true, assisted: false }, status: 'solved' } })));
    const label = `${record.id} seed ${seed}`;
    assert.equal((html.match(/class="ng-su-field"/g) ?? []).length, 3, label);
    // Round 6 repair: a recall line is a one-line text area (it wraps a long command on a phone): empty, it has no text.
    assert.equal((html.match(/<textarea [^>]*class="ng-su-field"[^>]*><\/textarea>/g) ?? []).length, 3, `${label}: empty lines`);
    for (const id of task.typedIds) assert.ok(!html.includes(cardText(task, id)), `${label}: «${cardText(task, id)}» shown before it is typed`);
    // Every occurrence is «…» in the script (the 2960's SVI entry may come twice in other orders).
    const script = scriptForState(task, state);
    const masked = script.lines.filter(l => l.masked).length;
    assert.ok(masked >= 3, `${label}: ${masked} masked lines`);
    assert.equal((html.match(/<span class="ng-su-text">…<\/span>/g) ?? []).length, masked, label);
    assert.ok(html.includes(`>${ui.recallTask}<`));
    // Recall's descriptions name no command; the deck's ✓ stays on its picker option.
    for (const line of task.recallLines) assert.ok(html.includes(text(line.description ?? `typed.${line.commandId}`, task.values)));
    assert.match(html, new RegExp(`>${record.label}<span class="ng-done">`));
    if (record === h.cisco2960) assert.ok(!html.includes(`interface vlan ${task.values.mgmt}`), `${label}: the recall-only SVI line`);
  }
});

test('setup after the check passes (server): the learner’s script on the board, the 2960’s complete setup, RouterOS in two parts', () => {
  for (const record of h.bank.decks) for (const seed of [1, 7, 21]) {
    const task = h.drill.create(record, { seed });
    const order = otherOrder(task);
    const state = sorted(task, order);
    assert.equal(state.phase, 'sorted');
    const raw = h.renderScreen(h.storeFor({ seed, deck: record.id, setup: state, session: { earned: { solved: true, assisted: false }, status: 'solved' } }));
    const html = unescape(raw);
    const label = `${record.id} seed ${seed}`;
    const script = scriptForState(task, state);
    const texts = [...raw.matchAll(/<span class="ng-su-text">([^<]*)<\/span>/g)].map(m => unescape(m[1]));
    assert.deepEqual(texts, script.lines.map(l => l.text), `${label}: the board is the accepted script, line by line`);
    assert.ok(!html.includes('ng-reorder-handle'), `${label}: the deck is locked`);
    assert.equal((html.match(/class="ng-copy-button"/g) ?? []).length, script.parts.length);
    if (record.id === 'dr-3') {
      assert.equal(script.parts.length, 2);
      assert.equal(script.script, null, 'no single paste across the login check');
      assert.ok(html.includes(`>${text('script-part-1')}<`) && html.includes(`>${text('script-part-2')}<`));
      assert.equal(script.parts[0].lines.at(-1).text, text('checkpoint-comment', task.values));
      // The parts follow the learner's order: part 1 is everything before the check.
      const at = order.findIndex(id => task.cards.find(c => c.id === id).kind === 'checkpoint');
      assert.deepEqual(script.parts[0].lines.slice(0, -1).map(l => l.text), order.slice(0, at).map(id => cardText(task, id)));
      assert.ok(texts.every(t => !/^(?:enable|configure terminal|end)$/.test(t)), 'no Cisco transitions in RouterOS');
    } else {
      assert.equal(script.parts.length, 1);
      // The prompt each line is typed at, from the mode changes before it.
      const gutters = [...raw.matchAll(/<span class="ng-su-gutter" aria-hidden="true">([^<]*)<\/span>/g)].map(m => unescape(m[1]));
      assert.deepEqual(gutters, h.linePrompts(script.lines));
      script.lines.forEach((line, i) => { if (line.kind === 'command') assert.equal(gutters[i], task.cards.find(c => c.id === line.cardId).mode, `${label}: ${line.text}`); });
      assert.equal((html.match(new RegExp(`class="ng-su-line-tag">${ui.transition}<`, 'g')) ?? []).length, script.lines.filter(l => l.kind === 'transition' && !l.note).length);
    }
    if (record.id === 'dr-2') {
      // The learned block right after the learner's hostname; save last; the key-size note.
      const hostAt = texts.indexOf(`hostname ${task.values.hostname}`);
      assert.equal(texts[hostAt + 1], `ip domain-name ${task.values.domain}`, label);
      for (const line of ['crypto key generate rsa modulus 2048', 'ip ssh version 2', 'enable secret <пароль>', `username ${task.values.username} privilege 15 secret <пароль>`, 'transport input ssh', 'login local']) assert.ok(texts.includes(line), `${label}: ${line}`);
      assert.equal(texts.at(-1), 'write memory');
      assert.ok((html.match(new RegExp(`class="ng-su-line-tag">${text('script-as-router')}<`, 'g')) ?? []).length >= 7);
      assert.ok(html.includes(`>${text('tip-2960-key')}<`), `${label}: the key-size note on the learned key line`);
    }
  }
});

test('setup success explanation: three or four short lines open, every full tip (the must-stay points) behind «Детальніше»', () => {
  for (const record of h.bank.decks) {
    const task = h.drill.create(record, { seed: 4 });
    const state = sorted(task);
    const { lead, more } = h.successTips(task, state.feedback);
    assert.ok(lead.length >= 3 && lead.length <= 4, `${record.id}: ${lead.length} lines`);
    assert.deepEqual(more, tips(task, state.feedback).map(t => text(t.code)));
    const html = unescape(h.renderScreen(h.storeFor({ seed: 4, deck: record.id, setup: state, session: { earned: { solved: true, assisted: false }, status: 'solved' } })));
    for (const line of lead) assert.ok(html.includes(`<li>${line}</li>`), line);
    assert.ok(html.includes(`<summary>${shared.help.more}</summary>`));
    for (const line of more) assert.ok(html.includes(`<li>${line}</li>`), `${record.id}: «${line}» reachable`);
    // Primary «Тепер по пам'яті →» on the Cisco decks, «Далі →» secondary named by its destination.
    assert.equal(html.includes(ui.continue), record.id !== 'dr-3');
    if (record.id !== 'dr-3') assert.ok(html.includes(`<span class="ng-sr-only">, ${ui.nextWhere}</span>`));
  }
  const must = { 'dr-1': ['tip-passwords'], 'dr-2': ['tip-default-gateway', 'tip-passwords'], 'dr-3': ['tip-routeros-save', 'tip-routeros-firewall'] };
  for (const [id, codes] of Object.entries(must)) {
    const task = h.drill.create(recordOf(id), { seed: 4 });
    const { more } = h.successTips(task, sorted(task).feedback);
    for (const code of codes) assert.ok(more.includes(text(code)), `${id}: ${code}`);
  }
});

test('setup target: NetGym gets the section last with its decks; the screens import no bank and no other section', async () => {
  const { default: netgym } = await import('../.test-bundles/targets/netgym.mjs');
  const ids = netgym.sections.map(s => s.id);
  assert.equal(ids.at(-1), 'setup');
  const setup = netgym.sections.at(-1);
  assert.equal(setup.title, section.title);
  assert.equal(setup.blurb, section.blurb);
  assert.deepEqual(setup.bank.decks.map(d => d.id), ['dr-1', 'dr-2', 'dr-3']);
  for (const file of ['SetupScreen.jsx', 'CardRow.jsx', 'Recall.jsx', 'Script.jsx']) {
    const source = readFileSync(new URL(`../src/sections/setup/screens/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from '\.\.\/\.\.\/\.\.\/banks|sections\/(?!setup)/, file);
    assert.doesNotMatch(source, /\bsolution\s*\(|\.solution\b/, `${file}: scripts only through scriptForState`);
    assert.doesNotMatch(source, /\.expected\b/, `${file}: parser findings only through their codes`);
    assert.doesNotMatch(source, /import \{[^}]*\b(?:prompts|modes)\b[^}]*\} from '\.\.\/logic\/model\.js'/, `${file}: legacy model.prompts/modes`);
    assert.doesNotMatch(source, /acceptedScript|recall:svi-enter/, `${file}: one masking path; logic identities stay logic`);
  }
});

test('setup repair: the 2960’s interface cards say so in their purposes, positions in sorting verdicts, the task line after the check, «—» for an unset prompt', () => {
  // The 2960's interface cards: their purposes name the VLAN interface (round 5 replaces the short
  // notes); the long paraphrase with numbers is recall's only.
  for (const seed of [1, 2, 3]) {
    const task = h.drill.create(h.cisco2960, { seed });
    const html = unescape(h.renderScreen(h.storeFor({ seed, deck: 'dr-2' })));
    const { purposes } = seconds(html);
    assert.equal(purposes.filter(p => /інтерфейс[іу]? VLAN/.test(p)).length, 2, purposes.join(' | '));
    assert.ok(!html.includes('ng-su-desc'), 'one explanation line per card: the purpose');
    assert.ok(!html.includes(text('typed.svi-address', task.values)), 'no recall paraphrase on the cards');
  }
  // A failed order check names the flagged cards' positions first.
  const task = h.drill.create(h.ciscoRouter, { seed: 5 });
  let state = h.initialState(task);
  for (const card of task.cards) state = h.transition(task, state, { type: 'prompt', id: card.id, prompt: card.mode });
  state = h.transition(task, state, { type: 'check' });
  const finding = state.feedback.findings[0];
  assert.ok(finding.positions.length >= 1 && finding.code !== 'mode-missing');
  let html = unescape(h.renderScreen(h.storeFor({ seed: 5, setup: state })));
  const at = [...finding.positions].sort((a, b) => a - b);
  assert.ok(html.includes(`${ui.cardsAt({ positions: at })} ${text(finding.why ?? finding.code)}`), 'the verdict starts with the cards’ positions');
  assert.equal(ui.cardsAt({ positions: [3] }), 'Картка 3:');
  assert.equal(ui.cardsAt({ positions: [2, 6] }), 'Картки 2 і 6:');
  // After a reveal: the task line, the learner's own list with «—» for a card left without a prompt.
  const shown = h.transition(task, h.transition(task, h.initialState(task), { type: 'reveal' }), { type: 'show-own' });
  html = unescape(h.renderScreen(h.storeFor({ seed: 5, setup: shown })));
  assert.ok(html.includes(`>${ui.shownTask}<`));
  assert.equal((html.match(new RegExp(`class="ng-su-chosen">${ui.noChoice}<`, 'g')) ?? []).length, 12);
  assert.ok(!html.includes(`>${ui.noPrompt}<`));
  html = unescape(h.renderScreen(h.storeFor({ seed: 5, setup: sorted(task) })));
  assert.ok(html.includes(`>${ui.sortedTask}<`));
});
