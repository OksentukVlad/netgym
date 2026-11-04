// The firewall screen (FW-1 screen spec v1 + v2): its pure view
// (walkView.js, round.js, diagram.js), the screen rendered on the server
// from a given store (tests/harness/firewall.jsx), and the UI leak gate
// (S5 a–g). The mounted lifecycle checks are tests/firewall-mounted.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { records, resolveRecord, cards, topology } from './helpers/firewall.mjs';
import fw, { cardView, create, check, commit, generatorVersion, initialCommitState, solution } from '../src/sections/firewall/logic/predict.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { initialInstance } from '../src/ui/exercise-state.js';
import { chainText, comprehension, predictLevels, predictStep, t, ui } from '../src/sections/firewall/uk.js';
import { uk } from '../src/ui/uk.js';
import {
  tableRows, cardLines, walkOutcomes, walkPlan, walkFrame, feedbackOf, textSections, natRuleOf, predicateText, ruleListItems, ROW_MS, WALK_CAP_MS,
} from '../src/sections/firewall/screens/walkView.js';
import { meanings } from '../src/sections/firewall/uk.js';
import { sceneOf } from '../src/sections/firewall/screens/diagram.js';
import { dotsOf, earnedLevels, earnedVariants, nextOpen, nextSeed, roundOf } from '../src/sections/firewall/screens/round.js';
import { chainRows, walkNotes } from '../src/sections/firewall/screens/walkView.js';
import { region, regions, scanLeaks, structuralGate, screenGate, screenWithoutGivens, withoutSelection, givenKey, cardIds } from './helpers/firewall-screen.mjs';

const h = await import('../.test-bundles/harness/firewall.mjs');
const record = resolveRecord(records[0]);
const variants = record.variants.map(v => v.id);
const SEEDS = { basic: 1, disabled: 1, 'drop-above': 1 };

/** A store with a firewall round in place: the variant, its seed and the instance's view and session. */
function storeFor({ variantId = 'basic', seed = 1, view = {}, session = null }) {
  const state = h.initialStore();
  state.places.firewall = { variantId, seeds: { ...SEEDS, [variantId]: seed } };
  const task = create(record, { variantId, seed });
  state.instances[task.instanceKey] = { ...initialInstance(), view, ...(session ? { session: { ...initialInstance().session, ...session } } : {}) };
  return { state, task };
}
const render = args => { const { state, task } = storeFor(args); return { html: h.renderScreen(state), task }; };
const fullInventory = variantId => record.variants.find(v => v.id === variantId).cards;

/** Seeds and positions that put every card of a variant on screen (S5 d: the full inventory, not one seed). */
function coverage(variantId) {
  const want = new Set(fullInventory(variantId).map(c => c.id)), out = [];
  for (let seed = 1; want.size && seed < 400; seed++) {
    const task = create(record, { variantId, seed });
    task.cards.forEach((card, position) => { if (want.delete(card.id)) out.push({ seed, position, card }); });
  }
  assert.equal(want.size, 0, `uncovered: ${[...want]}`);
  return out;
}

/** The rows of a rendered table: class and text. */
const rowsOf = html => [...region(html, 'class="ng-fw-rules"').matchAll(/<button[^>]*class="(ng-fw-row[^"]*)"[^>]*>(.*?)<\/button>/g)]
  .map(([, cls, inner]) => ({ cls, text: inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));

// ── Pure view ────────────────────────────────────────────────────────────

test('firewall view: the table numbers rules from 0 as RouterOS print does, then the two chain ends', () => {
  const task = create(record, { variantId: 'basic', seed: 1 });
  const rows = tableRows(task.policy);
  assert.deepEqual(rows.map(r => r.n), [0, 1, 2, 3, 4, 5, 6, 7, 8, null, null]);
  assert.deepEqual(rows.slice(-2).map(r => [r.chain, r.end, r.label]), [['input', true, ui.chainEndShort], ['forward', true, ui.chainEndShort]]);
  assert.equal(ui.chainEnd('input'), 'input: кінець списку (RouterOS) → пропустити');
  assert.deepEqual(rows.map(r => r.action ?? null).slice(0, 9), ['accept', 'drop', 'accept', 'accept', 'drop', 'fasttrack', 'accept', 'drop', 'drop']);
  assert.deepEqual(rows[0].chips.map(c => c.text), ['стан: established, related, untracked']);
  assert.match(rows[0].chips[0].title, /встановлене \(established\) — з’єднання, де трафік уже йшов в обидва боки/);
  assert.equal(rows[0].meaning, rows[0].chips[0].title);
  assert.deepEqual(rows[8].chips.map(c => c.text), ['стан: new', 'NAT: !dstnat', 'in-interface-list: WAN']);
  assert.equal(rows[8].chips[1].title, 'connection-nat-state=!dstnat');
  assert.deepEqual(rows[4].chips.map(c => c.text), [ui.anyPacket]);
  const disabled = tableRows(create(record, { variantId: 'disabled', seed: 1 }).policy);
  assert.deepEqual(disabled.filter(r => r.disabled).map(r => r.n), [3]);
});

test('firewall view: the card says the givens (S1): ports with services, the given state, dst-NAT always', () => {
  const task = create(record, { variantId: 'basic', seed: 1 });
  const lines = id => cardLines(task, cards.find(c => c.id === id));
  assert.equal(lines('wan-winbox').ports, 'tcp, на порт 8291 (Winbox), з порту 50002');
  assert.equal(lines('wan-ssh').ports, 'tcp, на порт 22 (SSH), з порту 50009');
  assert.equal(lines('reply-to-pc').ports, 'tcp, на порт 50000, з порту 443 (web)');
  // Round 5 (5b-2 B): echo traffic is «ICMP echo — ping»; other ICMP isn't called ping.
  assert.equal(lines('wan-ping-router').ports, comprehension.icmpEchoGloss);
  assert.equal(comprehension.icmpEchoGloss, 'ICMP echo — ping');
  assert.equal(lines('related-icmp-to-pc').ports, 'ICMP: недосяжно');
  assert.deepEqual(lines('wan-winbox').from, { label: 'Звідки', value: '203.0.113.50 → ether1 (WAN)' });
  assert.deepEqual(lines('wan-winbox').to, { label: 'Куди', value: '100.64.0.2' });
  assert.deepEqual(lines('wan-winbox').state, { label: 'Стан задано', value: 'нове (new)', meaning: 'нове (new) — з’єднання, у якому ще не було трафіку в обидва боки' });
  assert.equal(lines('wan-winbox').nat.value, 'ні');
  assert.equal(lines('reply-to-pc').state.value, 'встановлене (established)');
  const nat = lines('port-forward');
  assert.equal(nat.to.label, 'Адреса, яку бачить фільтр — вже після dst-NAT');
  assert.equal(nat.to.value, '192.168.88.20');
  assert.equal(nat.nat.value, 'прокинуто з 100.64.0.2:443 на 192.168.88.20:443');
});

test('firewall view: mismatches are explained by predicate (S1), never as a generic ≠', () => {
  const card = id => cards.find(c => c.id === id);
  const text = (field, expected, actual, id = 'wan-winbox') => predicateText({ field, expected, actual }, card(id), classify(topology, card(id)));
  assert.equal(text('inInterfaceList', { values: ['LAN'], not: false }, ['WAN']), 'in-interface-list: правило — LAN; пакет — з ether1 (WAN)');
  assert.equal(text('connectionNatState', { values: ['dstnat'], not: true }, ['dstnat'], 'port-forward'), 'connection-nat-state: правило — не dstnat; пакет — dstnat (прокинуто)');
  assert.equal(text('connectionNatState', { values: ['dstnat'], not: false }, []), 'connection-nat-state: правило — dstnat; пакет — ні (без dst-NAT)');
  assert.equal(text('connectionState', { values: ['established', 'related', 'untracked'], not: false }, 'new'), 'стан: правило — established, related, untracked; пакет — нове (new)');
  assert.equal(text('dstPort', { values: [22, { from: 80, to: 90 }], not: false }, 8291), 'dst-port: правило — 22, 80-90; пакет — 8291');
  assert.equal(text('dstPort', { values: [22], not: false }, 'unknown'), 'dst-port: правило — 22; пакет — невідомо');
  assert.equal(text('protocol', { values: ['icmp'], not: false }, 'tcp'), 'protocol: правило — icmp; пакет — tcp');
  assert.equal(text('outInterfaceList', { values: ['WAN'], not: false }, ['LAN'], 'wan-to-pc-new'), 'out-interface-list: правило — WAN; пакет — до bridge (LAN)');
  for (const c of cards) {
    const walk = fw.check(fullTaskOf('basic'), { [c.id]: { hook: 'input', decidedBy: 'r1' } }).evidence[c.id];
    for (const o of walkOutcomes(fullTaskOf('basic'), c, walk)) assert.doesNotMatch(o.text, /≠/);
  }
});

/** The variant's task with its whole inventory (as tests/helpers/firewall.mjs fullTask). */
function fullTaskOf(variantId) {
  const task = create(record, { variantId, seed: 'view' });
  task.cards = fullInventory(variantId).map(({ safety, ...c }) => c);
  return task;
}
const walkOf = (task, id) => check(task, { [id]: solution(task)[id] }).evidence[id];

test('firewall view: walk outcomes for mismatch, disabled, other chain, FastTrack and a chain end (§5, S1)', () => {
  const basic = fullTaskOf('basic');
  const states = (task, id) => walkOutcomes(task, cards.find(c => c.id === id), walkOf(task, id)).map(o => o.state);
  // wan-to-pc-new: forward; input rows other chain, FastTrack/accept/invalid mismatch, rule 8 decides; the rest not reached.
  assert.deepEqual(states(basic, 'wan-to-pc-new'), ['other-chain', 'other-chain', 'other-chain', 'other-chain', 'other-chain', 'mismatch', 'mismatch', 'mismatch', 'match', 'not-reached', 'not-reached']);
  // reply-to-pc: FastTrack marks it, the packet goes on, rule 6 decides.
  assert.deepEqual(states(basic, 'reply-to-pc').slice(5, 8), ['marked', 'match', 'not-reached']);
  // lan-web-out: the evaluator emits no chain-end step; the screen marks the forward chain end itself.
  assert.deepEqual(states(basic, 'lan-web-out').slice(-2), ['other-chain', 'end']);
  // lan-winbox in the disabled variant: rule 3 is passed by.
  const disabled = fullTaskOf('disabled');
  assert.deepEqual(states(disabled, 'lan-winbox').slice(0, 6), ['mismatch', 'mismatch', 'mismatch', 'disabled', 'match', 'not-reached']);
  const texts = walkOutcomes(disabled, cards.find(c => c.id === 'lan-winbox'), walkOf(disabled, 'lan-winbox')).map(o => o.text);
  assert.deepEqual(texts.slice(3, 6), ['вимкнено', 'збіглося — вирішує', 'не дійшло']);
  assert.equal(walkOutcomes(basic, cards.find(c => c.id === 'reply-to-pc'), walkOf(basic, 'reply-to-pc'))[5].text, 'позначено FastTrack — пакет іде далі');
});

test('firewall view: the walk is 0.35 s a row, capped at about 4 s; frames go source → port → door → rows', () => {
  const basic = fullTaskOf('basic');
  for (const c of basic.cards) {
    const plan = walkPlan(basic, walkOf(basic, c.id));
    assert.ok(plan.stepMs <= ROW_MS && plan.stepMs * plan.last <= WALK_CAP_MS, c.id);
    assert.equal(walkFrame(plan, 0).phase, 'source');
    assert.equal(walkFrame(plan, 1).phase, 'ingress');
    assert.equal(walkFrame(plan, 2).phase, plan.last === 2 ? 'end' : 'door');
    assert.deepEqual(walkFrame(plan, plan.last), { frame: plan.last, lit: plan.rowsLit, phase: 'end', waiting: false, end: true });
  }
  const plan = walkPlan(basic, walkOf(basic, 'wan-winbox'));
  assert.equal(walkFrame(plan, 3).lit, 1);
  assert.equal(walkFrame(plan, 3).waiting, true);
});

test('firewall view: «Текстом» lists the givens before commitment and every row\'s outcome after (S2)', () => {
  const basic = fullTaskOf('basic');
  const card = cards.find(c => c.id === 'wan-winbox');
  const nat = natRuleOf(basic.topology, fullInventory('basic'));
  const before = textSections(basic, card, { nat });
  assert.deepEqual(before.map(s => s.heading), ['Роутер R1', 'Вузли', 'dst-NAT на R1', 'Пакет', 'Список правил (згори вниз)']);
  assert.deepEqual(before[0].items, ['ether1 — 100.64.0.2/30, список WAN', 'bridge — 192.168.88.1/24, список LAN', 'Шлюз провайдера за ether1: 100.64.0.1']);
  assert.deepEqual(before[2].items, ['R1 прокидає 100.64.0.2:443 на сервер 192.168.88.20:443.']);
  assert.ok(before[3].items.includes('Стан задано: нове (new) — з’єднання, у якому ще не було трафіку в обидва боки'));
  // The rule list (fix round 1): number, chain, action, every condition by its RouterOS name, the description; no outcome yet.
  assert.equal(before[4].items.length, 11);
  assert.equal(before[4].items[0], '0 · input · accept · стан: established, related, untracked. Приймає відповіді на вже відкриті з’єднання, пов’язані пакети та пакети без відстеження.');
  assert.equal(before[4].items[8], '8 · forward · drop · стан: new, connection-nat-state: !dstnat, in-interface-list: WAN. Відкидає нові з’єднання з WAN, для яких немає dst-NAT.');
  assert.equal(before[4].items[4], '4 · input · drop · будь-який пакет. Відкидає решту пакетів до роутера.');
  assert.deepEqual(before[4].items.slice(9), ['input: кінець списку (RouterOS) → пропустити', 'forward: кінець списку (RouterOS) → пропустити']);
  assert.ok(!before[4].items.some(item => /для цього пакета/.test(item)));
  const walk = walkOf(basic, 'wan-winbox');
  const after = textSections(basic, card, { nat, walk, selection: { hook: 'input', decidedBy: 'r1' } });
  assert.deepEqual(after.map(s => s.heading), ['Роутер R1', 'Вузли', 'dst-NAT на R1', 'Пакет', 'Список правил (згори вниз)', 'Ланцюжок', 'Висновок', 'Твій вибір']);
  assert.equal(after[4].items.length, 11);
  assert.equal(after[4].items[4], '4 · input · drop · будь-який пакет. Відкидає решту пакетів до роутера. — для цього пакета: збіглося — вирішує');
  // Chain-end rows say what they are (fix round 1), not just the chain.
  assert.equal(after[4].items[9], 'input: кінець списку (RouterOS) → пропустити — для цього пакета: не дійшло');
  assert.equal(after[4].items[10], 'forward: кінець списку (RouterOS) → пропустити — для цього пакета: не дійшло');
  assert.deepEqual(after[7].items, ['input — до самого роутера · 0']);
  // After an accept the onward travel is an illustration (S1).
  const pc = textSections(basic, cards.find(c => c.id === 'lan-web-out'), { nat, walk: walkOf(basic, 'lan-web-out') });
  assert.ok(pc.at(-1).items.includes(ui.illustration));
});

test('firewall view: the dst-NAT rule is a given of the variant, the same on every seed', () => {
  for (const v of variants) {
    const lines = new Set();
    for (let seed = 1; seed < 30; seed++) {
      const task = create(record, { variantId: v, seed });
      lines.add(JSON.stringify(natRuleOf(task.topology, fullInventory(v))));
    }
    assert.equal(lines.size, 1, v);
  }
});

test('firewall round: dots, round end, the next open card, a new seed, earned variants', () => {
  const task = create(record, { variantId: 'basic', seed: 3 });
  const sol = solution(task);
  let st = initialCommitState(task);
  assert.deepEqual(dotsOf(task, st, [], 0).map(d => [d.status, d.clickable]), [[null, true], [null, false], [null, false], [null, false], [null, false], [null, false]]);
  const [a, b] = task.cards;
  st = commit(task, st, a.id, sol[a.id]);
  st = commit(task, st, b.id, { hook: sol[b.id].hook === 'input' ? 'forward' : 'input', decidedBy: sol[b.id].decidedBy });
  assert.deepEqual(dotsOf(task, st, [], 2).map(d => d.status), ['ok', 'no', null, null, null, null]);
  assert.deepEqual(dotsOf(task, st, [b.id], 2).map(d => d.status).slice(0, 2), ['ok', 'revealed']);
  assert.equal(nextOpen(task, st, 0), 2);
  assert.deepEqual(roundOf(task, st, []), { complete: false, allRight: false });
  for (const c of task.cards.slice(2)) st = commit(task, st, c.id, sol[c.id]);
  assert.deepEqual(roundOf(task, st, []), { complete: true, allRight: false });
  assert.equal(nextOpen(task, st, 3), null);
  assert.notEqual(nextSeed(5, () => 4 / 999999), 5);
  const key = id => JSON.stringify({ formatVersion: 1, exerciseId: 'fw-predict', taskId: 'fw-predict', recordVersion: 1, variantId: id, seed: 1, generatorVersion });
  const earned = earnedVariants({
    [key('basic')]: { session: { earned: { solved: true } } },
    [key('basic').replace('"seed":1', '"seed":2')]: { session: { earned: { solved: true } } },
    [key('disabled')]: { session: { earned: { solved: false } } },
    routing: { session: { earned: { solved: true } } },
  });
  assert.deepEqual([...earned], ['basic']);
});

test('firewall diagram: before commitment the scene reads only the source, ingress and dst-NAT (§3, S5 c)', () => {
  for (const card of cards) {
    const scene = sceneOf({ topology, card });
    assert.deepEqual(scene.doors, { input: 'neutral', forward: 'neutral' });
    assert.deepEqual([scene.path, scene.envelope, scene.stop, scene.arrived], [[], null, null, null]);
    // Change everything the student must work out; the scene stays the same.
    const other = { ...card, id: 'x', packet: { ...card.packet, dstIp: card.facts.dstNat === true ? card.packet.dstIp : '198.51.100.7', dstPort: card.facts.dstNat === true ? card.packet.dstPort : 1 }, facts: { ...card.facts, state: 'invalid' } };
    assert.deepEqual(sceneOf({ topology, card: other }), scene, card.id);
  }
});

test('firewall diagram: after commitment the envelope enters the door the filter took, then exits or stops (§3)', () => {
  const basic = fullTaskOf('basic');
  const scene = (id, f) => {
    const card = cards.find(c => c.id === id), walk = walkOf(basic, id), plan = walkPlan(basic, walk);
    return sceneOf({ topology, card, walk, frame: walkFrame(plan, f ?? plan.last), context: classify(topology, card) });
  };
  assert.deepEqual(scene('wan-winbox', 2).doors, { input: 'chosen', forward: 'dim' });
  assert.equal(scene('wan-winbox', 3).envelope.waiting, true);
  assert.ok(scene('wan-winbox').stop, 'a drop: ✕ at the door');
  assert.equal(scene('lan-winbox').arrived, 'core');
  assert.equal(scene('lan-web-out').arrived, 'internet');
  assert.equal(scene('reply-to-pc').arrived, 'pc');
  assert.equal(scene('wan-to-pc-new').stop !== null, true);
});

// ── The screen on the server ─────────────────────────────────────────────

test('firewall screen: one role="status", the lesson line, the section label, no assessment words', () => {
  const { html } = render({});
  assert.equal(html.match(/role="status"/g).length, 1);
  assert.ok(html.includes(ui.lesson));
  assert.ok(html.includes('MikroTik RouterOS'));
  assert.doesNotMatch(html, /Cisco/);
  assert.doesNotMatch(html, /іспит|екзамен|квит|білет|ВОС|exam|ticket/i);
  assert.ok(!/✅|Скинути рахунок|ng-fw-score/.test(html), 'calm: no score and no «↺» (round 4); a variant carries a quiet ✓ once earned');
  assert.ok(html.includes('Набір зі зміною 1') && html.includes('Набір зі зміною 2'));
});

test('firewall screen: level 2 in two steps: the chain is its own action, «Перевірити» comes with the rule step (§4, round 4 F1)', () => {
  const main = html => region(html, 'ng-help-check');
  const { task } = render({});
  const id = task.cards[0].id;
  assert.equal(main(render({}).html), null, 'step 1: the two chain buttons are the action, no «Перевірити»');
  assert.equal(main(render({ view: { drafts: { [id]: { decidedBy: 'r1' } } } }).html), null, 'a rule without an accepted chain is no step 2');
  assert.match(main(render({ view: { drafts: { [id]: { hook: 'input' } } } }).html), /aria-disabled="true"/, 'step 2 without a rule: disabled');
  assert.doesNotMatch(main(render({ view: { drafts: { [id]: { hook: 'input', decidedBy: 'r1' } } } }).html), /aria-disabled/);
  assert.match(main(render({ view: { drafts: { [id]: { hook: 'input', decidedBy: 'r1' } } } }).html), />Перевірити</);
});

test('firewall screen: radios start unchecked, in named groups (S2); the rule step shows one chain, the other folded (F1)', () => {
  const { html, task } = render({});
  // Round 5 (R1): the chain step's group is named by the action line above it.
  const chain = region(html, 'aria-labelledby="ng-fw-action"');
  assert.ok(html.includes(`<p id="ng-fw-action" class="ng-action-line" data-action-line="">${predictStep.action.hook}</p>`));
  assert.ok(chain && !chain.includes('aria-checked="true"'));
  assert.equal(chain.match(/tabindex="0"/g).length, 1, 'one tab stop');
  assert.equal(region(html, 'aria-label="Правило, що вирішує"'), null, 'no rule step before the chain');
  const id = task.cards[0].id;
  for (const [hook, n, other] of [['input', 6, 4], ['forward', 5, 5]]) {
    const step = render({ view: { drafts: { [id]: { hook } } } }).html;
    const group = region(step, 'class="ng-fw-table"');
    assert.ok(!group.includes('aria-checked="true"'), hook);
    assert.equal(group.match(/tabindex="0"/g).length, 1, `${hook}: one tab stop`);
    assert.equal(group.match(/role="radio"/g).length, n, `${hook}: its rules and its chain end`);
    assert.ok(!group.includes(`>${hook === 'input' ? 'forward' : 'input'}<`), `${hook}: no row of the other chain`);
    assert.ok(region(step, 'class="ng-fw-folded"').includes(chainRows(task, hook).folded), hook);
    assert.match(chainRows(task, hook).folded, new RegExp(`^${hook === 'input' ? 'forward' : 'input'}: ${other} правил`));
    assert.match(region(step, 'class="ng-fw-door-options"'), /aria-readonly="true"/, `${hook}: the accepted chain is locked`);
    assert.match(region(step, 'class="ng-fw-door-options"'), /aria-labelledby="ng-fw-doors-name"/, `${hook}: the locked chain keeps its own name`);
    assert.ok(step.includes(`<p id="ng-fw-action" class="ng-action-line" data-action-line="">${predictStep.action.rule}</p>`), `${hook}: the action line names the rule step`);
    assert.match(group, /^<div role="radiogroup" aria-labelledby="ng-fw-action"/, `${hook}: the rule group is named by it`);
    assert.equal((group.match(/data-term=""/g) ?? []).length, n - 1, `${hook}: every rule row carries a purpose (R2), the chain end is no term`);
    assert.equal((group.match(/class="ng-purpose is-stacked ng-fw-purpose" data-purpose="">[^<]+</g) ?? []).length, n - 1, `${hook}: …non-empty, under the row`);
  }
});

/** Every finding code, on some card of some round: [variant, seed, position, selection]. */
function findingCases() {
  const found = new Map();
  for (const variantId of ['basic', 'disabled']) for (let seed = 1; seed < 12; seed++) {
    const task = create(record, { variantId, seed });
    const ids = [...task.policy.rules.map(r => r.id), 'chain-end:input', 'chain-end:forward'];
    task.cards.forEach((card, position) => {
      for (const hook of ['input', 'forward']) for (const decidedBy of ids) {
        const code = check(task, { [card.id]: { hook, decidedBy } }).findings[0]?.code ?? 'ok';
        if (!found.has(code)) found.set(code, { variantId, seed, position, selection: { hook, decidedBy } });
      }
    });
  }
  return found;
}

test('firewall screen: feedback per finding code, for the current card only (§5, S1, S3)', () => {
  const cases = findingCases();
  assert.deepEqual([...cases.keys()].sort(), ['fasttrack-not-final', 'ok', 'right-verdict-wrong-rule', 'rule-disabled', 'rule-other-chain', 'wrong-door', 'wrong-verdict']);
  for (const [code, c] of cases) {
    const task = create(record, { variantId: c.variantId, seed: c.seed });
    const card = task.cards[c.position];
    const st = commit(task, initialCommitState(task), card.id, c.selection);
    const { html } = render({ variantId: c.variantId, seed: c.seed, view: { commit: st, position: c.position, played: [card.id] } });
    const fb = region(html, 'role="status"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (code === 'ok') {
      assert.match(fb, /✓ Так/, code);
      assert.doesNotMatch(fb, /Фільтр вирішив інакше/, code);
    } else {
      assert.match(fb, /✗ Фільтр вирішив інакше\./, code);
      assert.ok(fb.includes(t(code)), `${code}: ${fb}`);
      assert.doesNotMatch(fb, /Ще ні/, `${code}: a locked card promises no retry`);
    }
    // A dot's end frame: the deciding chain and row, and the conclusion, are there too:
    // under the feedback as plain text, outside its live region (announced once at the commit).
    const later = region(html, 'class="ng-fw-after"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(later.includes(feedbackOf(task, st, card, false).later[0]), code);
    assert.match(later, /Вирішує (?:input|forward), рядок \d\.|Вирішує кінець списку (?:input|forward)\./, code);
    assert.doesNotMatch(fb, /Вирішує/, `${code}: not in the live region`);
    assert.match(region(html, 'ng-help-continue'), /Наступний пакет →/, code);
    assert.equal(region(html, 'ng-help-check'), null, `${code}: a committed card has no check`);
    // Another card of the same round shows no feedback and no walk.
    const other = (c.position + 1) % task.cards.length;
    const next = render({ variantId: c.variantId, seed: c.seed, view: { commit: st, position: other } }).html;
    assert.equal(region(next, 'role="status"').replace(/<[^>]+>/g, '').trim(), '', code);
  }
});

test('firewall screen: walk row states at the end frame, after navigation (no replay on the server)', () => {
  const pick = (variantId, id) => {
    for (let seed = 1; seed < 200; seed++) {
      const task = create(record, { variantId, seed });
      const position = task.cards.findIndex(c => c.id === id);
      if (position >= 0) return { task, seed, position };
    }
    throw new Error(id);
  };
  const rowsAfter = (variantId, id) => {
    const { task, seed, position } = pick(variantId, id);
    const st = commit(task, initialCommitState(task), id, solution(task)[id]);
    const { html } = render({ variantId, seed, view: { commit: st, position, played: [id] } });
    assert.match(html, /data-walk="done"/);
    // Repair 7: the rule step's action line says it is done; the locked table keeps its own name.
    assert.ok(html.includes(`<p id="ng-fw-action" class="ng-action-line" data-action-line="">${predictStep.action.ruleDone}</p>`));
    assert.match(region(html, 'class="ng-fw-table"'), /^<div role="radiogroup" aria-labelledby="ng-fw-rules-name"/);
    return rowsOf(html);
  };
  const states = rows => rows.map(r => r.cls.match(/is-(other-chain|disabled|mismatch|match|end|marked|not-reached|unknown)\b/g)?.at(-1) ?? null);
  // Round 4 (F1): only the packet's chain is on screen, its numbers kept; the other chain is one folded line.
  const mismatch = rowsAfter('basic', 'wan-to-pc-new');
  assert.deepEqual(states(mismatch), ['is-mismatch', 'is-mismatch', 'is-mismatch', 'is-match', 'is-not-reached']);
  assert.match(mismatch[0].text, /^5 forward/, 'RouterOS numbers stay');
  assert.match(mismatch[0].text, /не збігається: стан: правило — established, related; пакет — нове \(new\)/);
  assert.ok(mismatch[3].text.includes(ui.purpose['rule.forward-wan-new']), 'the deciding row shows its purpose (round 5: every row does)');
  const marked = rowsAfter('basic', 'reply-to-pc');
  assert.equal(states(marked)[0], 'is-marked');
  assert.match(marked[0].text, /позначено FastTrack — пакет іде далі/);
  const end = rowsAfter('basic', 'lan-web-out');
  assert.equal(states(end).at(-1), 'is-end');
  assert.match(end.at(-1).text, /forward кінець списку \(RouterOS\) → пропустити .*кінець списку — вирішує/);
  const disabled = rowsAfter('disabled', 'lan-winbox');
  assert.equal(states(disabled)[3], 'is-disabled');
  assert.match(disabled[3].text, /вимкнено/);
  assert.match(disabled[3].cls, /is-disabled/);
});

test('firewall screen: the assumption line is under the table after a FastTrack walk (V1, fix round 1), not in the feedback or a tooltip', () => {
  for (let seed = 1; seed < 200; seed++) {
    const task = create(record, { variantId: 'basic', seed });
    const position = task.cards.findIndex(c => c.id === 'reply-to-pc');
    if (position < 0) continue;
    const st = commit(task, initialCommitState(task), 'reply-to-pc', solution(task)['reply-to-pc']);
    const { html } = render({ seed, view: { commit: st, position } });
    // Round 4 (F1 v2): the corrected slow-path words; round 5 (5b-2 B): they name the packet shown as the slow path's.
    assert.ok(region(html, 'class="ng-fw-rules"').includes(`<p class="ng-fw-note">${comprehension.fasttrackIntro}</p>`));
    assert.ok(!region(html, 'role="status"').includes(comprehension.fasttrackIntro));
    assert.ok(!html.includes(t('fasttrack-slow-path')), 'the older assumption words are gone from the screen');
    assert.ok(!/title="[^"]*повільний шлях/.test(html));
    return;
  }
  assert.fail('no round with reply-to-pc');
});

test('firewall screen: a revealed card shows 👁, says so, and the round can\'t be all right (S3)', () => {
  const task = create(record, { variantId: 'disabled', seed: 4 });
  const sol = solution(task);
  let st = initialCommitState(task);
  for (const c of task.cards) st = commit(task, st, c.id, sol[c.id]);
  const revealed = [task.cards[1].id];
  const { html } = render({ variantId: 'disabled', seed: 4, view: { commit: st, position: 1, revealed }, session: { revealed: true, assisted: true, status: 'revealed' } });
  assert.match(region(html, 'class="ng-fw-progress"'), /aria-label="Пакет 2: показано відповідь"[^>]*><span aria-hidden="true">👁/);
  // Round 4 (A1): the reveal is applied on the board: one line, the board marked «показано», never a solve's look.
  const fb = region(html, 'role="status"');
  assert.ok(fb.includes(ui.appliedPlain) && fb.includes(ui.roundEnd), fb);
  assert.match(html, /data-revealed=""/);
  assert.ok(region(html, 'class="ng-fw-shown"').includes(uk.help.shown));
  assert.doesNotMatch(html, /твій вибір/, 'a revealed answer is not the learner\'s choice');
  assert.match(region(html, 'ng-help-next'), /Далі/);
  assert.match(region(html, 'ng-help-next'), /ng-button-primary|is-primary|primary/);
  const clean = render({ variantId: 'disabled', seed: 4, view: { commit: st, position: 1 } }).html;
  // Round 5 repair: the round's end is in the progress area, apart from the verdict.
  assert.ok(region(clean, 'class="ng-fw-progress"').includes(`<p class="ng-fw-round">${ui.roundOk}</p>`));
  assert.ok(!(region(clean, 'class="ng-fw-after"') ?? '').includes(ui.roundOk));
  assert.doesNotMatch(region(clean, 'role="status"'), /Усі пакети раунду/, 'the round line is outside the live region');
  assert.match(region(clean, 'ng-help-next'), /Далі/);
});

test('firewall screen: hints belong to the card on screen; the next card starts its own ladder (Андрій)', () => {
  const { html, task } = render({ session: { hintIndex: 2, assisted: true } });
  const help = region(html, 'class="ng-help"');
  // Round 5: hint 1 compares this card's «Куди» (logic's chainText with the card's params).
  const hint1 = chainText('hint-door', fw.hints(task, {}, { cardId: task.cards[0].id })[0].params);
  assert.ok(help.includes(hint1) && hint1.includes(task.cards[0].packet.dstIp) && help.includes(t('hint-order')) && !help.includes(t('hint-example')));
  assert.match(help, /Підказка 3 з 3/);
  const st = commit(task, initialCommitState(task), task.cards[0].id, { hook: 'input', decidedBy: 'r1' });
  const committed = region(render({ view: { commit: st }, session: { hintIndex: 2 } }).html, 'class="ng-help"');
  assert.ok(!committed.includes(t('hint-order')) && !/Підказка 3 з 3/.test(committed), 'no ladder on a committed card');
  const next = region(render({ view: { commit: st, position: 1, cardHints: { [task.cards[0].id]: 2 } }, session: { hintIndex: 2 } }).html, 'class="ng-help"');
  assert.ok(!next.includes(t('hint-order')) && /Підказка 1 з 3/.test(next), 'a new card: nothing carried over, the counter at 1');
  assert.equal(region(html, 'class="ng-fw-help"'), null, 'no hint block under the diagram (round 4)');
});

// ── The UI leak gate (S5) ────────────────────────────────────────────────

for (const variantId of variants) test(`firewall UI leak gate (S5 a–d): every card of ${variantId}, drafts, every hint, overlays`, () => {
  const renders = [], drafts = {};
  const rules = h.renderRules();
  assert.deepEqual(scanLeaks(rules), []);
  for (const { seed, position, card } of coverage(variantId)) {
    const fresh = render({ variantId, seed, view: { position } });
    const r = regions(fresh.html);
    // (a) the narrow scan, over the whole screen, «Текстом» and the hints.
    assert.deepEqual(scanLeaks(fresh.html), [], card.id);
    const nat = natRuleOf(topology, fullInventory(variantId));
    assert.deepEqual(scanLeaks(h.renderText(textSections(fresh.task, card, { nat }))), [], card.id);
    for (const hintIndex of [1, 2, 3]) {
      const hinted = render({ variantId, seed, view: { position }, session: { hintIndex } }).html;
      assert.deepEqual(scanLeaks(hinted), [], `${card.id} hint ${hintIndex}`);
      assert.equal(region(hinted, 'class="ng-fw-rules"'), r.table, 'hints change nothing else');
    }
    // A draft (an accepted chain and a row): only the student's own selection differs, the
    // rule step depends on the chain alone (compared across cards below).
    for (const draft of [{ hook: 'input', decidedBy: 'r1' }, { hook: 'forward', decidedBy: 'chain-end:forward' }]) {
      const drafted = regions(render({ variantId, seed, view: { position, drafts: { [card.id]: draft } } }).html);
      assert.equal(withoutSelection(drafted.doors).replace(/ aria-readonly="true"/, ''), withoutSelection(r.doors), card.id);
      assert.equal(drafted.svg, r.svg, `${card.id}: a draft never touches the diagram`);
      assert.match(drafted.table, /is-selected/);
      (drafts[draft.hook] ??= new Set()).add(withoutSelection(drafted.table));
    }
    // Nothing on a pre-commit card is highlighted but the givens.
    assert.equal(r.table, null, 'no rule step before the chain (round 4)');
    const step2 = regions(render({ variantId, seed, view: { position, drafts: { [card.id]: { hook: 'forward' } } } }).html).table;
    assert.doesNotMatch(step2, /is-(?:match|end|mismatch|marked|other-chain|not-reached|selected)\b/);
    assert.doesNotMatch(r.svg, /is-(?:chosen|dim|reached|arrived)\b|ng-fw-(?:stop|envelope|path-line)/);
    renders.push({ card, ...r });
  }
  // (b) and (c): byte-identical choices for every card; the diagram by givens only.
  assert.deepEqual(structuralGate(renders), []);
  assert.equal(new Set(renders.map(r => r.help)).size, 1, 'the hint ladder is the same for every card');
  for (const [hook, tables] of Object.entries(drafts)) assert.equal(tables.size, 1, `${hook}: the rule step is the same for every card`);
  assert.deepEqual(scanLeaks(h.renderCommands(record.variants.find(v => v.id === variantId).policy)), []);
});

test('firewall UI leak gate (S5 c): the named pairs draw identical diagrams in the screen', () => {
  const svgOf = (variantId, id) => {
    for (let seed = 1; seed < 400; seed++) {
      const task = create(record, { variantId, seed });
      const position = task.cards.findIndex(c => c.id === id);
      if (position >= 0) return regions(render({ variantId, seed, view: { position } }).html).svg;
    }
    throw new Error(id);
  };
  assert.equal(svgOf('basic', 'wan-winbox'), svgOf('basic', 'wan-to-pc-new'));
  assert.equal(svgOf('basic', 'lan-winbox'), svgOf('basic', 'lan-web-out'));
  assert.equal(svgOf('disabled', 'lan-winbox'), svgOf('disabled', 'lan-web-out'));
  assert.notEqual(svgOf('basic', 'wan-winbox'), svgOf('basic', 'lan-winbox'), 'the source and ingress are givens');
});

test('firewall UI leak gate (S5 e): committing or revealing card k leaves card k+1 as a fresh render', () => {
  for (const variantId of variants) for (const seed of [1, 2, 3]) {
    const task = create(record, { variantId, seed });
    const sol = solution(task);
    for (let k = 0; k < task.cards.length - 1; k++) {
      const fresh = regions(render({ variantId, seed, view: { position: k + 1 } }).html);
      const id = task.cards[k].id;
      for (const selection of [sol[id], { hook: sol[id].hook === 'input' ? 'forward' : 'input', decidedBy: 'r1' }]) {
        const st = commit(task, initialCommitState(task), id, selection);
        for (const revealed of [[], [id]]) {
          const after = regions(render({ variantId, seed, view: { commit: st, position: k + 1, revealed, played: [id] } }).html);
          for (const part of ['packet', 'doors', 'table', 'svg', 'help', 'feedback']) assert.equal(after[part], fresh[part], `${variantId}/${seed} k=${k} ${part}`);
        }
      }
    }
  }
});

test('firewall UI leak gate (S5 f): deliberately leaking fixtures fail it', () => {
  // The rule step as every card shows it once forward is the accepted chain (the table depends on the chain alone).
  const coverageRenders = coverage('basic').slice(0, 17).map(({ seed, position, card }) => ({ card, ...regions(render({ seed, view: { position, drafts: { [card.id]: { hook: 'forward' } } } }).html) }));
  assert.deepEqual(structuralGate(coverageRenders), []);
  const leak = (fn, why) => {
    const fixtures = coverageRenders.map(r => (fn(r) ? { ...r, ...fn(r) } : r));
    assert.ok(structuralGate(fixtures).length > 0, why);
  };
  const doorOf = id => walkOf(fullTaskOf('basic'), id).hook;
  // A class or a stroke on the right door, in the diagram.
  leak(r => (r.card.id === 'wan-winbox' ? { svg: r.svg.replace('ng-fw-door is-neutral', `ng-fw-door is-neutral correct-${doorOf('wan-winbox')}`) } : null), 'a class on the right door');
  leak(r => (r.card.id === 'lan-web-out' ? { svg: r.svg.replace('<rect x="141" y="142"', '<rect stroke="green" x="141" y="142"') } : null), 'a stroke on the right door');
  // An aria label on the deciding row, in the table.
  leak(r => (r.card.id === 'reply-to-pc' ? { table: r.table.replace(/(<button[^>]*?)(>[^]*?<\/button>)/g, (m, open, rest) => (/<span class="ng-fw-n">7</.test(m) ? `${open} aria-label="вирішує"${rest}` : m)) } : null), 'an aria label on the deciding row');
  // A data attribute on the door choice.
  leak(r => (r.card.id === 'lan-winbox' ? { doors: r.doors.replace('role="radiogroup"', 'role="radiogroup" data-door="input"') } : null), 'a data attribute on the doors');
  // The narrow scan.
  assert.deepEqual(scanLeaks('<p>Вирішує правило 3</p>'), ['rule-number-in-words']);
  assert.deepEqual(scanLeaks('<li data-card="wan-winbox">x</li>'), ['card-id:wan-winbox']);
  assert.deepEqual(scanLeaks('<li title="правила №4">x</li>'), ['rule-number-in-words']);
});

test('firewall UI leak gate: no card id anywhere on a committed screen either, and rows show bare numbers', () => {
  const task = create(record, { variantId: 'basic', seed: 2 });
  const sol = solution(task);
  let st = initialCommitState(task);
  for (const c of task.cards) st = commit(task, st, c.id, sol[c.id]);
  for (let position = 0; position < task.cards.length; position++) {
    const { html } = render({ seed: 2, view: { commit: st, position, played: task.cards.map(c => c.id) } });
    assert.deepEqual(scanLeaks(html), []);
  }
  assert.ok(cardIds.length === 17);
});

// ── S5 (g): solution( only from the reveal path ──────────────────────────

const screens = fileURLToPath(new URL('../src/sections/firewall/screens/', import.meta.url));
test('firewall S5 g: solution( is called only in reveal.js\'s revealCard, and nothing copies to the clipboard', () => {
  const calls = [];
  for (const file of readdirSync(screens)) {
    const source = readFileSync(screens + file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    if (/navigator\.clipboard/.test(source)) calls.push(`${file}: clipboard`);
    for (const m of source.matchAll(/\bsolution\s*\(/g)) calls.push(file === 'reveal.js' && /export function revealCard[^]*$/.test(source.slice(0, m.index)) ? 'reveal.js:revealCard' : `${file}@${m.index}`);
  }
  assert.deepEqual(calls, ['reveal.js:revealCard']);
  const reveal = readFileSync(screens + 'reveal.js', 'utf8');
  assert.match(reveal, /logic\.solution\(task\)\[cardId\]/, 'only the current card\'s selection is taken');
});

test('firewall S5 g: before a reveal the screen never calls solution(), and useExercise\'s solution is null', () => {
  const spy = h.fw.solution, calls = [];
  h.fw.solution = (...args) => { calls.push(args); return spy(...args); };
  try {
    for (const variantId of variants) for (const { seed, position, card } of coverage(variantId).slice(0, 6)) {
      const task = create(record, { variantId, seed });
      const st = commit(task, initialCommitState(task), card.id, { hook: 'input', decidedBy: 'r1' });
      render({ variantId, seed, view: { position }, session: { hintIndex: 3 } });
      render({ variantId, seed, view: { position: (position + 1) % task.cards.length, commit: st } });
      const { state } = storeFor({ variantId, seed, view: { position } });
      assert.equal(h.exerciseSolution(state, record, { variantId, seed }), null);
    }
    assert.equal(calls.length, 0);
    const { state } = storeFor({ variantId: 'basic', seed: 1, session: { revealed: true, assisted: true } });
    assert.notEqual(h.exerciseSolution(state, record, { variantId: 'basic', seed: 1 }), null, 'after a reveal it is the reveal path\'s');
  } finally {
    h.fw.solution = spy;
  }
});

test('firewall bank: the two broken variants have distinct titles that never name the rule', () => {
  const titles = records[0].variants.map(v => v.title);
  assert.deepEqual(titles, ['Домашній роутер', 'Набір зі зміною 1', 'Набір зі зміною 2']);
  for (const title of titles) assert.doesNotMatch(title, /\d\s*(?:правил|rule)|вимкн|disabled|drop|accept|r\d|LAN|WAN/i);
});

test('firewall card givens key: the diagram pairs of S5 c share their givens', () => {
  const key = id => givenKey(cards.find(c => c.id === id));
  assert.equal(key('wan-winbox'), key('wan-to-pc-new'));
  assert.equal(key('lan-winbox'), key('lan-web-out'));
});

// ── Fix round 1 (the Astra and Fable code reviews) ───────────────────────

test('fix 1: the feedback\'s verdict is now; which chain and row decided waits for the walk\'s end', () => {
  const basic = fullTaskOf('basic');
  const st = sel => commit(basic, initialCommitState(basic), 'wan-winbox', sel);
  const right = feedbackOf(basic, st({ hook: 'input', decidedBy: 'r5' }), cards.find(c => c.id === 'wan-winbox'), false);
  assert.deepEqual(right, { tone: 'ok', lead: null, now: [], later: ['Вирішує input, рядок 4. Фільтр відкидає цей пакет за правилом.'] });
  const wrong = feedbackOf(basic, st({ hook: 'forward', decidedBy: 'r5' }), cards.find(c => c.id === 'wan-winbox'), false);
  assert.deepEqual(wrong, { tone: 'info', lead: '✗ Фільтр вирішив інакше.', now: [t('wrong-door')], later: right.later });
  assert.equal(feedbackOf(basic, st({ hook: 'input', decidedBy: 'r5' }), cards.find(c => c.id === 'wan-winbox'), true).lead, uk.revealed);
  for (const fb of [right, wrong]) assert.ok(!fb.now.some(line => /Вирішує|Фільтр (?:пропускає|відкидає)/.test(line)), 'nothing in `now` tells the walk');
  // Chain ends name their chain too; the slow-path assumption is no longer feedback.
  const lan = commit(basic, initialCommitState(basic), 'lan-web-out', { hook: 'forward', decidedBy: 'chain-end:forward' });
  assert.deepEqual(feedbackOf(basic, lan, cards.find(c => c.id === 'lan-web-out'), false).later, ['Вирішує кінець списку forward. Кінець вбудованого ланцюжка RouterOS: фільтр пропускає цей пакет.']);
  const reply = commit(basic, initialCommitState(basic), 'reply-to-pc', { hook: 'forward', decidedBy: 'r7' });
  assert.ok(!JSON.stringify(feedbackOf(basic, reply, cards.find(c => c.id === 'reply-to-pc'), false)).includes(t('fasttrack-slow-path')));
});

test('fix 5: «Текстом» renders every rule\'s description before commitment, the same for every card', () => {
  for (const variantId of variants) {
    const task = create(record, { variantId, seed: 1 });
    const html = h.renderText(textSections(task, task.cards[0], { nat: natRuleOf(topology, fullInventory(variantId)) }));
    for (const rule of task.policy.rules) assert.ok(html.includes(t(rule.descriptionCode)), `${variantId}: ${rule.id}`);
    assert.ok(html.includes('connection-nat-state: !dstnat'), 'the RouterOS field name, not the chip\'s short one');
    assert.deepEqual(scanLeaks(html), []);
    const lists = new Set(fullInventory(variantId).map(card => JSON.stringify(textSections(task, card, {}).find(s => s.heading === ui.text.rules))));
    assert.equal(lists.size, 1, `${variantId}: one rule list for every card`);
  }
  assert.ok(ruleListItems(create(record, { variantId: 'disabled', seed: 1 }))[3].includes('· вимкнено'));
});

test('fix 6: rule rows and the packet card are described by the states\' meanings (aria-describedby), with no extra tab stops', () => {
  const { task } = render({});
  const id = task.cards[0].id;
  const forward = region(render({ view: { drafts: { [id]: { hook: 'forward' } } } }).html, 'class="ng-fw-rules"');
  assert.deepEqual([...forward.matchAll(/<button[^>]*>/g)].map(m => /aria-describedby=/.test(m[0])), [true, true, true, true, false]);
  const { html } = render({ view: { drafts: { [id]: { hook: 'input' } } } });
  const table = region(html, 'class="ng-fw-rules"');
  const rows = [...table.matchAll(/<button[^>]*>/g)].map(m => m[0]);
  const described = rows.map(r => r.match(/aria-describedby="([^"]+)"/)?.[1] ?? null);
  assert.deepEqual(described.map(Boolean), [true, true, false, false, false, false]);
  for (const id of described.filter(Boolean)) {
    const target = table.match(new RegExp(`<span id="${id}" hidden="">([^<]*)</span>`));
    assert.ok(target, id);
    assert.ok(Object.values(meanings).some(m => target[1].includes(m)), id);
  }
  assert.equal(table.match(/tabindex="0"/g).length, 1, 'still one tab stop in the table');
  assert.ok(!table.includes('class="ng-fw-meaning"'), 'nothing extra shows without focus');
  const card = region(html, 'class="ng-fw-card"');
  assert.match(card, /aria-describedby="ng-fw-card-meaning"/);
  assert.ok(card.includes(`<span id="ng-fw-card-meaning" hidden="">${cardLines(task, task.cards[0]).state.meaning}</span>`));
});

test('fix 7: the state meanings say what RouterOS means (new is not «the first packet»; established is both directions)', () => {
  assert.equal(meanings.new, 'нове (new) — з’єднання, у якому ще не було трафіку в обидва боки');
  assert.equal(meanings.established, 'встановлене (established) — з’єднання, де трафік уже йшов в обидва боки');
  for (const line of Object.values(meanings)) assert.doesNotMatch(line, /перший пакет|відповідь у/);
  assert.match(meanings.untracked, /raw/);
  assert.match(meanings.related, /не його частина/);
});

test('fix 9: after commitment the filter\'s door has the chosen style when the student picked the other one', () => {
  const task = create(record, { variantId: 'basic', seed: 1 });
  const id = task.cards[0].id, filter = solution(task)[id].hook, other = filter === 'input' ? 'forward' : 'input';
  const st = commit(task, initialCommitState(task), id, { hook: other, decidedBy: 'r1' });
  const doors = region(render({ view: { commit: st } }).html, 'class="ng-fw-doors"');
  const option = hook => doors.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*?<b>${hook}</b>`))[0];
  assert.match(option(filter), /class="ng-fw-door-option is-decided"/);
  assert.match(option(filter), /aria-checked="false"/);
  assert.match(option(other), /aria-checked="true"/);
  assert.doesNotMatch(option(other), /is-decided/);
});

test('round 4: the help panel is in the work column under the steps (no sticky foot, no inner scroll); «⋯» holds the states and the commands', () => {
  const { html, task } = render({ view: { drafts: {} } });
  const at = marker => html.indexOf(marker);
  const work = region(html, 'class="ng-fw-work');
  assert.ok(work.includes('data-help="row"') && work.includes('data-help="message"'), 'the panel is in the work column');
  const id = task.cards[0].id;
  const step2 = render({ view: { drafts: { [id]: { hook: 'input' } } } }).html;
  assert.ok(step2.indexOf('class="ng-fw-rules"') < step2.indexOf('data-help="row"'), 'under the rule step it checks');
  assert.ok(at('class="ng-fw-card"') < at('data-help="row"'));
  assert.ok(!html.includes('ng-fw-footer') && !html.includes('ng-feedback'), 'no sticky foot, no old feedback block');
  assert.match(html, /aria-label="Інші дії"/);
  assert.ok(!/>Правила<\/button>|>Команда<\/button>/.test(html), '«Правила» and «Команда» moved into «⋯»');
  const css = readFileSync(new URL('../src/sections/firewall/screens/firewall.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-areas: "side" "work" "stage";/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /overflow-y: auto/, 'no inner scroll box');
  assert.ok(h.renderRules().includes(meanings.established) && h.renderCommands(task.policy).includes('/ip firewall filter'));
});

for (const variantId of variants) test(`fix 8: the whole screen before commitment is the same for every card of ${variantId}, but for its givens`, () => {
  const renders = coverage(variantId).map(({ seed, position, card }) => {
    const { html, task } = render({ variantId, seed, view: { position } });
    return {
      card, html, cardFromGivens: h.renderCard(cardLines(task, card), position + 1, task.cards.length),
      text: textSections(task, card, { nat: natRuleOf(topology, fullInventory(variantId)) }),
    };
  });
  assert.deepEqual(screenGate(renders), []);
  // The stripped parts are what they should be: the card (its givens), the dots (the position), the diagram (by givens, S5 c).
  assert.ok(screenWithoutGivens(renders[0].html).includes('data-mode="desk"'), 'the root and its data-* stay compared');
  assert.ok(screenWithoutGivens(renders[0].html).includes('data-help="row"') && screenWithoutGivens(renders[0].html).includes('ng-fw-doors'));
  const leak = (change, why) => assert.ok(screenGate(renders.map((r, i) => (i === 1 ? { ...r, ...change(r) } : r))).length > 0, why);
  leak(r => ({ html: r.html.replace('class="ng-fw-card"', 'class="ng-fw-card" data-door="input"') }), 'an annotation on the packet card');
  leak(r => ({ html: r.html.replace('<div class="ng-fw" ', '<div class="ng-fw" data-answer="forward" ') }), 'an annotation on the outer wrapper');
  leak(r => ({ html: r.html.replace('data-help="row"', 'data-help="row" title="input"') }), 'a title on the help row');
  leak(r => ({ text: [...r.text, { heading: 'Висновок', items: ['Вирішує input, рядок 4.'] }] }), 'a line in «Текстом»');
  leak(r => ({ text: r.text.map(s => (s.heading === ui.text.rules ? { ...s, items: s.items.map((it, i) => (i === 4 ? `${it} ✓` : it)) } : s)) }), 'a mark on a rule in «Текстом»');
});

// ── Round 4 (spec F1): level 1, the chain step, the quiet ✓ ──────────────

const combined = h.predictRecord(h.firewallBank);
test('round 5: level 1 asks whose address «Куди» is; the card is two lines; the verdict says whose it is', () => {
  assert.deepEqual(predictLevels.map(l => l.label), ['1 · Куди йде пакет', '2 · Яке правило']);
  const task = create(combined, { variantId: 'chain', seed: 1, level: 1 });
  const state = h.initialStore();
  state.places.firewall = { level: 1, variantId: 'basic', seeds: { chain: 1, basic: 1 } };
  const at = view => ({ ...state, instances: { [task.instanceKey]: { ...initialInstance(), view } } });
  const html = h.renderScreen(at({ position: 0, drafts: { [task.cards[0].id]: { hook: 'forward' } } }));
  assert.equal(region(html, 'class="ng-fw-rules"'), null, 'no rule step in level 1');
  assert.doesNotMatch(region(html, 'ng-help-check'), /aria-disabled/, 'a chain chosen: «Перевірити» is live');
  assert.equal(region(html, 'aria-label="Набір правил"'), null, 'no rule sets in level 1');
  assert.ok(html.includes(`<p class="ng-fw-rule-sentence">${predictStep.rule}</p>`), 'the rule sentence, under the task');
  assert.ok(html.includes(`<p id="ng-fw-action" class="ng-action-line" data-action-line="">${predictStep.action.l1}</p>`));
  assert.match(region(html, 'class="ng-fw-door-options"'), /aria-labelledby="ng-fw-action"/);
  assert.ok(!html.includes(predictStep.hook) && !html.includes('ng-fw-reply'), 'no «Який ланцюжок?» caption, no reply line (v2)');
  // The card: exactly logic's level 1 fields, two lines.
  for (const [i, card] of task.cards.entries()) {
    const v = cardView(task, card.id, 1);
    const cardHtml = region(h.renderScreen(at({ position: i })), 'class="ng-fw-card is-short"');
    const lines = [...cardHtml.matchAll(/<p class="ng-fw-card-line">([^]*?)<\/p>/g)].map(m => m[1].replace(/<span class="ng-sr-only"[^]*?<\/span>/, '').replace(/<[^>]+>/g, ''));
    assert.deepEqual(v.fields, ['from', 'to']);
    assert.deepEqual(lines, [`Звідки: ${v.from.ip} (${v.from.device})`, `Куди: ${v.to.ip}`], card.id);
    assert.match(cardHtml, new RegExp(`<button type="button" class="ng-fact-link" aria-label="${v.to.ip.replace(/\./g, '\\.')} — показати на схемі" title="[^"]*">`));
    assert.doesNotMatch(cardHtml, /tcp|udp|порт|Стан|dst-NAT/, 'no protocol, ports, state or dst-NAT at level 1');
  }
  // Committed wrong: two lines (✗, then the owner), the owner's label highlighted; right: the owner line, no highlight.
  for (const [i, card] of task.cards.entries()) {
    const v = cardView(task, card.id, 1);
    const right = solution(task)[card.id].hook, wrong = right === 'input' ? 'forward' : 'input';
    for (const hook of [wrong, right]) {
      const st = commit(task, initialCommitState(task), card.id, { hook });
      const done = h.renderScreen(at({ commit: st, position: i }));
      const role = task.topology.hosts.find(x => x.address === v.to.ip)?.role;
      const iface = task.topology.router.interfaces.find(x => x.address === v.to.ip)?.id;
      const owner = predictStep.owner({ ip: v.to.ip, kind: v.owner.kind, role, iface });
      assert.ok(region(done, 'role="status"').includes(hook === right ? predictStep.chainRight : ui.wrong), `${card.id} ${hook}`);
      assert.ok(!region(done, 'role="status"').includes(t('wrong-door')) && !done.includes(predictStep.chainWhy.input) && !done.includes(predictStep.chainWhy.forward));
      assert.equal(region(done, 'class="ng-fw-after"'), `<div class="ng-fw-after"><p class="ng-fw-owner">${owner}</p></div>`);
      const lit = [...done.matchAll(/<(\w+)[^>]*data-hl="([^"]*)"[^>]*data-highlight=""/g)];
      if (hook === wrong) assert.deepEqual(lit.map(m => m[2].split(' ').includes(`label:${v.owner.labelId}`)), [true], `${card.id}: the owner's label, alone`);
      else assert.equal(lit.length, 0, `${card.id}: no highlight after a right check`);
      assert.ok(region(done, 'class="ng-fw-marks"').includes(predictStep.marks({ mine: hook, filter: right })));
      assert.ok(done.includes(`<p id="ng-fw-action" class="ng-action-line" data-action-line="">${predictStep.action.l1Done}</p>`), 'the action line after the commit');
      assert.doesNotMatch(region(done, 'class="ng-fw-svg"'), /ng-fw-chip/, 'no interface-list chip at level 1');
      assert.doesNotMatch(region(done, 'class="ng-fw-door-options"'), /твій вибір|так вирішив/, 'marks are not inside the buttons');
      assert.match(region(done, 'class="ng-fw-doors"'), /data-evidence="current"/);
      assert.doesNotMatch(done, /data-walk=/, 'level 1 has no walk');
    }
  }
  // The owner lines (v2 F, v2.1): exact wording.
  assert.equal(predictStep.owner({ ip: '192.168.88.1', kind: 'router' }), '192.168.88.1 — адреса самого роутера → input.');
  assert.equal(predictStep.owner({ ip: '192.168.88.10', kind: 'host', role: 'pc' }), '192.168.88.10 — адреса ПК, не роутера → forward.');
  assert.equal(predictStep.owner({ ip: '203.0.113.50', kind: 'internet', role: 'internet' }), '203.0.113.50 — адреса вузла в інтернеті, не роутера → forward.');
  assert.equal(predictStep.owner({ ip: '192.168.88.20', kind: 'host', role: 'web-server' }), '192.168.88.20 — адреса сервера, не роутера → forward.');
  assert.equal(predictStep.said({ ip: '192.168.88.1', kind: 'router', iface: 'bridge' }), '192.168.88.1 — адреса R1 у LAN');
});

test('round 5: level 1 order is shuffled per seed (logic), the screen shows the logic\'s order, each reply after its request', () => {
  const orders = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const task = create(combined, { variantId: 'chain', seed, level: 1 });
    const ids = task.cards.map(c => c.id);
    orders.add(ids.join(','));
    assert.ok(ids.indexOf('reply-to-pc') > ids.indexOf('chain-web-request'), `seed ${seed}`);
    const state = h.initialStore();
    state.places.firewall = { level: 1, variantId: 'basic', seeds: { chain: seed, basic: 1 } };
    const shown = region(h.renderScreen(state), 'class="ng-fact-link"');
    assert.ok(shown.includes(`>${task.cards[0].packet.dstIp}</button>`), `seed ${seed}: the first card on screen is the logic's first`);
  }
  assert.equal(orders.size, 3, 'all three allowed orders appear');
});

test('round 4 F1: a wrong chain at level 2 is help, not a commitment: its words, and the chain is still open', () => {
  const { task } = render({});
  const id = task.cards[0].id;
  const html = render({ view: { drafts: { [id]: { retry: { code: 'hook-retry-input', n: 1 } } } } }).html;
  assert.ok(region(html, 'role="status"').includes(t('hook-retry-input')));
  assert.doesNotMatch(region(html, 'class="ng-fw-doors"'), /aria-readonly/, 'the learner picks again');
  assert.match(region(html, 'class="ng-fw-doors"'), /data-evidence="current"/);
  assert.equal(region(html, 'class="ng-fw-rules"'), null);
  const ok = render({ view: { drafts: { [id]: { hook: 'input', said: { code: 'hook-ok', n: 2 } } } } }).html;
  assert.ok(region(ok, 'role="status"').includes(t('hook-ok')));
});

test('round 4 A5: a quiet ✓ (DoneMark) on an earned rule set and level; none after a reveal-only round', () => {
  const task = create(record, { variantId: 'basic', seed: 1 });
  const instances = { [task.instanceKey]: { ...initialInstance(), session: { ...initialInstance().session, earned: { solved: true, assisted: false } } } };
  assert.deepEqual([...earnedVariants(instances)], ['basic']);
  assert.deepEqual([...earnedLevels(instances)], [2]);
  const state = h.initialStore();
  state.places.firewall = { level: 2, variantId: 'disabled', seeds: { ...SEEDS } };
  state.instances = instances;
  const html = h.renderScreen(state);
  const sets = region(html, 'aria-label="Набір правил"');
  assert.equal((sets.match(/розв’язано/g) ?? []).length, 1);
  assert.equal((region(html, 'aria-label="Рівень"').match(/розв’язано/g) ?? []).length, 1);
  assert.deepEqual([...earnedVariants({ [task.instanceKey]: { ...initialInstance() } })], []);
  assert.deepEqual(walkNotes({ steps: [{ outcome: 'marked' }] }), [comprehension.fasttrackIntro]);
});
