import test from 'node:test';
import assert from 'node:assert/strict';
import { decks, deckList } from '../src/banks/setup/index.js';
import { validate } from '../src/banks/setup/validate.js';
import { capabilities, initialAnswer } from '../src/sections/setup/logic/model.js';
import { create } from '../src/sections/setup/logic/deck.js';
import { check, orderFinding } from '../src/sections/setup/logic/rules.js';
import { checkTyped } from '../src/sections/setup/logic/typed.js';
import { render, cardText, acceptedScript } from '../src/sections/setup/logic/render.js';
import { solution } from '../src/sections/setup/logic/solution.js';
import { hints, tips, explanation } from '../src/sections/setup/logic/hints.js';
import { initialState, transition } from '../src/sections/setup/logic/state.js';
import { initialDeckState, selectDeck, currentDeck, transitionDeck } from '../src/sections/setup/logic/deck-state.js';
import { parse, profile, profile2960 } from '../src/engine/vendors/cisco-cli.js';
import { text, deckUi } from '../src/sections/setup/uk.js';
import { setupLeaks } from './helpers/setup-leaks.mjs';
import { full, sweepSeeds } from './helpers/sweep-mode.mjs';
import { switchReplay as oldSwitchReplay, routerosReplay as oldRouterosReplay } from './fixtures/setup/decks-replay.mjs';
import { replay as routerReplay } from './fixtures/setup/replay.mjs';

// v4 fixtures are handwritten expectations; historical replay data stays frozen.
const switchIds = ['hostname', 'ip-address', 'no-shutdown', 'default-gateway', 'write-memory'];
const switchEdges = [];
const routerosIds = ['bridge', 'bridge-port', 'list', 'list-member', 'address', 'user', 'admin-off', 'services', 'mac-server', 'discovery', 'ssh-strong', 'mac-telnet-off', 'checkpoint'];
const routerosEdges = [
  ['bridge', 'bridge-port', 'bridge-before-port'], ['bridge', 'list-member', 'bridge-before-member'],
  ['bridge', 'address', 'bridge-before-address'], ['list', 'list-member', 'list-before-member'],
  ['list', 'mac-server', 'list-before-mac'], ['list', 'discovery', 'list-before-discovery'],
  ['user', 'checkpoint', 'user-before-checkpoint'], ['address', 'checkpoint', 'address-before-checkpoint'],
  ['bridge-port', 'checkpoint', 'port-before-checkpoint'], ['checkpoint', 'admin-off', 'checkpoint-before-disable'],
];
const switchReplay = { ...oldSwitchReplay,
  initial: ['no-shutdown', 'default-gateway', 'write-memory', 'ip-address', 'hostname'],
  typed: ['interface', 'ip-address', 'default-gateway'],
  prompts: { hostname: '(config)#', 'ip-address': '(config-if)#', 'no-shutdown': '(config-if)#', 'default-gateway': '(config)#', 'write-memory': '#' },
  accepted: ['default-gateway', 'no-shutdown', 'hostname', 'ip-address', 'write-memory'],
  script: `enable
configure terminal
ip default-gateway 192.168.185.1
interface vlan 10
no shutdown
exit
hostname SW15
ip domain-name lab.example
crypto key generate rsa modulus 2048
ip ssh version 2
enable secret <пароль>
username maintainer privilege 15 secret <пароль>
line vty 0 15
transport input ssh
login local
exit
interface vlan 10
ip address 192.168.185.2 255.255.255.0
end
write memory`,
};
const routerosReplay = { ...oldRouterosReplay,
  initial: ['address', 'bridge-port', 'list', 'admin-off', 'discovery', 'list-member', 'mac-server', 'mac-telnet-off', 'bridge', 'services', 'checkpoint', 'ssh-strong', 'user'],
  accepted: ['ssh-strong', 'user', 'services', 'list', 'mac-server', 'discovery', 'bridge', 'address', 'list-member', 'bridge-port', 'checkpoint', 'mac-telnet-off', 'admin-off'],
  parts: [`/ip ssh set strong-crypto=yes
/user add name=maintainer group=full password=<пароль>
/ip service disable telnet,ftp,www,api,api-ssl
/interface list add name=LAN
/tool mac-server mac-winbox set allowed-interface-list=LAN
/ip neighbor discovery-settings set discover-interface-list=LAN
/interface bridge add name=bridge-lan
/ip address add address=192.168.77.1/25 interface=bridge-lan
/interface list member add list=LAN interface=bridge-lan
/interface bridge port add bridge=bridge-lan interface=ether2
# Тепер увійди як maintainer у новому вікні. Далі — лише після успішного входу.`,
`/tool mac-server set allowed-interface-list=none
/user disable admin`],
};
const key = (t, command) => t.cards.find(c => c.commandId === command).id;
const names = (t, ids) => ids.map(id => (t.cards.find(c => c.id === id) ?? t.recallLines.find(c => c.id === id)).commandId);
const promptMaps = { 'dr-1': routerReplay.prompts, 'dr-2': switchReplay.prompts };
const answered = (t, order) => ({
  ...initialAnswer(t), order: (order ?? names(t, t.referenceOrder)).map(c => key(t, c)),
  prompts: Object.fromEntries(Object.entries(promptMaps[t.identity.taskId] ?? {}).map(([command, prompt]) => [key(t, command), prompt])),
});
const cases = [[decks[1], switchReplay, switchIds, switchEdges], [decks[2], routerosReplay, routerosIds, routerosEdges]];
const last = bank => bank.id === 'dr-2' ? 'write-memory' : null;
function violations(order, edges, final) {
  return [...edges.filter(([a, b]) => order.indexOf(a) >= order.indexOf(b)).map(e => e[2]), ...(final && order.at(-1) !== final ? ['save-last'] : [])];
}

test('capability defaults and safe deck picker are explicit; DR-3 hides prompt/typed controls by capability', () => {
  assert.deepEqual(capabilities({}), { prompts: [], typed: false, modes: ['cards'], hints: [], tips: [] });
  assert.deepEqual(deckList().map(d => [d.id, d.capabilities.prompts.length, d.capabilities.modes]), [
    ['dr-1', 5, ['cards']], ['dr-2', 5, ['cards']], ['dr-3', 0, ['cards']],
  ]);
  assert.deepEqual(setupLeaks(deckList()), []);
  const list = deckList(); list[0].capabilities.prompts.pop();
  assert.equal(deckList()[0].capabilities.prompts.length, 5);
});

for (const [bank, fixture, ids, edges] of cases) {
  test(`${bank.id}: validators, pinned profile, graph and command identities`, () => {
    assert.deepEqual(validate(bank), []);
    const t = create(bank);
    assert.deepEqual(names(t, t.cards.map(c => c.id)), ids);
    const mnemonic = id => bank.cards.find(c => c.id === id).commandId ?? id;
    assert.deepEqual(bank.rules.filter(r => r.kind === 'before').map(r => [mnemonic(r.a), mnemonic(r.b), r.why]), edges);
    assert.deepEqual(bank.rules.filter(r => r.kind === 'last').map(r => r.a), last(bank) ? [last(bank)] : []);
    assert.equal(check(t, answered(t)).ok, true);
    for (const mutate of [
      b => b.cards[0].template = 'invalid command', b => b.cards[0] = null,
      b => b.profile.access = 'remote', b => b.referenceOrder.reverse(),
      b => b.rules.push({ kind: 'before', a: 'missing', b: 'bridge', why: 'invalid' }),
      b => b.rules.push({ kind: 'before', a: b.rules[0].b, b: b.rules[0].a, why: 'cycle' }),
      b => b.prompts = 12, b => b.typed = 'yes', b => b.hintCodes = [null],
    ]) {
      const bad = structuredClone(bank); mutate(bad);
      assert.ok(validate(bad).length); assert.throws(() => create(bad), /invalid-record/);
    }
    if (bank.id === 'dr-2') {
      assert.deepEqual(Object.fromEntries(t.cards.map(c => [c.commandId, c.mode])), switchReplay.prompts);
      assert.equal(t.profile.family, 'Catalyst 2960-24TT-L'); assert.equal(t.profile.ipRouting, false);
      assert.equal(t.profile.image, 'K9 LAN Base'); assert.equal(t.profile.vty, '0 15');
      assert.equal(t.profile.managementVlanActive && t.profile.accessPortForwarding, true);
      assert.equal(t.cards.some(c => c.commandId === 'crypto'), false);
      assert.equal(t.values.modulus, 2048);
    } else {
      assert.equal(t.profile.access, 'serial-console'); assert.equal(t.profile.version, '7.12 or later');
      assert.equal(t.profile.defaultConfiguration, false); assert.equal(t.profile.network, 'isolated-practice-no-wan');
      const bad = structuredClone(bank); bad.typed = true; assert.ok(validate(bad).length);
    }
  });

  test(`${bank.id}: literal seeded replay and exact learner-order script with secret placeholders`, () => {
    const t = create(bank, { seed: fixture.seed }), a = answered(t, fixture.accepted);
    assert.deepEqual(t.values, fixture.values);
    assert.deepEqual(names(t, t.order), fixture.initial);
    assert.deepEqual(names(t, t.typedIds), fixture.typed);
    assert.equal(check(t, a).ok, true);
    assert.notDeepEqual(a.order, t.referenceOrder);
    if (bank.id === 'dr-2') { assert.equal(acceptedScript(t, a).script, fixture.script); assert.match(fixture.script, /<пароль>/); }
    else { assert.equal(acceptedScript(t, a).script, null); assert.deepEqual(acceptedScript(t, a).parts.map(p => p.script), fixture.parts); }
    assert.equal(acceptedScript(t, initialAnswer(t)), null);
    assert.deepEqual(t, create(bank, { seed: fixture.seed }));
    assert.equal('script' in check(t, a), false);
    const reversed = { ...a, order: [...a.order].reverse() };
    assert.equal(check(t, reversed).findings.length, 1);
    assert.deepEqual(tips(t, check(t, reversed)), []);
    assert.deepEqual(Object.keys(explanation(check(t, reversed))), ['code']);
  });

  for (const [a, b, why] of edges) test(`${bank.id}: isolated handwritten ${a} → ${b} violation`, () => {
    // Force an adjacent pair after its other prerequisites. These prefixes
    // are handwritten; the bank's graph is never used to construct witnesses.
    const block = [a, b], groups = [block, ...ids.filter(id => !block.includes(id)).map(id => [id])];
    const ordered = [];
    while (groups.length) {
      const index = groups.findIndex(group => group.every(id => edges.filter(([before, after]) => after === id && !group.includes(before)).every(([before]) => ordered.includes(before))));
      assert.ok(index >= 0, `${a} → ${b}: adjacent witness exists`);
      ordered.push(...groups.splice(index, 1)[0]);
    }
    const order = ordered;
    assert.deepEqual(violations(order, edges, last(bank)), []);
    const i = order.indexOf(a); [order[i], order[i + 1]] = [order[i + 1], order[i]];
    assert.deepEqual(violations(order, edges, last(bank)), [why]);
    const t = create(bank);
    assert.deepEqual(check(t, answered(t, order)).findings, [{ severity: 'blocks', code: 'needs-before', why, cards: [key(t, a), key(t, b)] }]);
    assert.deepEqual(setupLeaks(text(why), 'rule'), [], text(why));
  });

  test(`${bank.id}: independent topological sweep (${full ? 'all orders' : 'deterministic sample'})`, () => {
    const t = create(bank), a = answered(t), n = ids.length;
    const required = ids.map(id => edges.reduce((mask, [before, after]) => after === id ? mask | (1 << ids.indexOf(before)) : mask, 0)
      | (id === last(bank) ? ((1 << n) - 1) ^ (1 << ids.indexOf(id)) : 0));
    const memo = new Map(), complete = (1 << n) - 1;
    function count(used) {
      if (used === complete) return 1;
      if (memo.has(used)) return memo.get(used);
      let total = 0;
      for (let i = 0; i < n; i++) if (!(used & (1 << i)) && (used & required[i]) === required[i]) total += count(used | (1 << i));
      memo.set(used, total); return total;
    }
    const total = count(0);
    // Independent counts: five switch cards with save last; RouterOS with login pause.
    assert.equal(total, bank.id === 'dr-2' ? 24 : 15869568);
    let tested = 0;
    function probe(order, whole) {
      a.order = order.map(id => key(t, id));
      assert.equal(orderFinding(t, a.order), null);
      if (whole) assert.equal(check(t, a).ok, true);
      tested++;
    }
    if (full) {
      const order = Array(n), opaque = ids.map(id => key(t, id));
      a.order = Array(n);
      function walk(depth, used) {
        if (depth === n) {
          assert.equal(orderFinding(t, a.order), null);
          if (tested % 8192 === 0 || tested === total - 1) assert.equal(check(t, a).ok, true);
          tested++; return;
        }
        for (let i = 0; i < n; i++) if (!(used & (1 << i)) && (used & required[i]) === required[i]) {
          order[depth] = ids[i]; a.order[depth] = opaque[i]; walk(depth + 1, used | (1 << i));
        }
      }
      walk(0, 0); assert.equal(tested, total);
    } else {
      // Unrank evenly across the independent graph, including both ends.
      for (let sample = 0; sample < 512; sample++) {
        let rank = Math.floor(sample * (total - 1) / 511), used = 0; const order = [];
        while (used !== complete) for (let i = 0; i < n; i++) {
          if ((used & (1 << i)) || (used & required[i]) !== required[i]) continue;
          const size = count(used | (1 << i));
          if (rank >= size) { rank -= size; continue; }
          order.push(ids[i]); used |= 1 << i; break;
        }
        probe(order, true);
      }
      assert.equal(tested, 512);
    }
  });
}

test('DR-2: save-last witness satisfies every other independent dependency', () => {
  const t = create(decks[1]);
  const order = ['hostname', 'ip-address', 'no-shutdown', 'write-memory', 'default-gateway'];
  assert.deepEqual(violations(order, switchEdges, 'write-memory'), ['save-last']);
  assert.deepEqual(check(t, answered(t, order)).findings, [{ severity: 'blocks', code: 'not-last', why: 'save-last', cards: [key(t, 'write-memory')] }]);
});

test('same-seed decks isolate opaque ids, instances, answers and detached bank data', () => {
  const tasks = decks.map(b => create(b, { seed: 17 }));
  assert.equal(new Set(tasks.map(t => t.instanceKey)).size, 3);
  assert.equal(new Set(tasks.flatMap(t => t.order)).size, 30);
  for (const t of tasks) for (const other of tasks.filter(x => x !== t)) assert.equal(check(t, answered(other)).code, 'invalid-answer');
  const changed = create(decks[1]); changed.profile.interfaces.pop(); changed.cards[0].requires.hostname = 'broken';
  assert.equal(create(decks[1]).profile.interfaces.length, 26);
  assert.equal(create(decks[0]).cards[0].requires.hostname, '$hostname');
});

test('deck switching and JSON restoration preserve each lifecycle independently', () => {
  let state = initialDeckState(decks, { seed: 7 });
  state = transitionDeck(decks, state, { type: 'check' });
  state = transitionDeck(decks, state, { type: 'hint' });
  state = transitionDeck(decks, state, { type: 'reveal' });
  state = transitionDeck(decks, state, { type: 'continue' });
  const { task } = currentDeck(decks, state), typedId = task.typedIds[0];
  state = transitionDeck(decks, state, { type: 'typed', id: typedId, text: 'my unfinished answer' });
  state = transitionDeck(decks, state, { type: 'check-typed', id: typedId });
  const saved1 = structuredClone(state.entries['dr-1']);
  assert.equal(saved1.state.typedFeedback[typedId].code, 'unknown-command');
  state = selectDeck(decks, state, 'dr-3', { seed: 7 });
  const active = currentDeck(decks, state);
  assert.deepEqual(active.state, initialState(active.task));
  assert.deepEqual(active.state.answer.prompts, {}); assert.deepEqual(active.task.typedIds, []);
  for (const action of [{ type: 'mode', mode: 'typed' }, { type: 'prompt', id: active.task.order[0], prompt: '#' }, { type: 'prompt', id: active.task.order[0], prompt: null }, { type: 'typed', id: active.task.order[0], text: 'x' }]) {
    assert.equal(transition(active.task, active.state, action), active.state);
  }
  state = transitionDeck(decks, state, { type: 'order', order: active.task.referenceOrder });
  state = transitionDeck(decks, state, { type: 'check' });
  assert.equal(currentDeck(decks, state).state.phase, 'sorted');
  const saved3 = structuredClone(state.entries['dr-3']);
  state = selectDeck(decks, state, 'dr-2', { seed: 7 });
  assert.equal(currentDeck(decks, state).state.revealed, false);
  const saved2 = structuredClone(state.entries['dr-2']);
  state = selectDeck(decks, JSON.parse(JSON.stringify(state)), 'dr-1');
  assert.deepEqual(state.entries['dr-1'], saved1);
  state = selectDeck(decks, state, 'dr-3'); assert.deepEqual(state.entries['dr-3'], saved3);
  state = selectDeck(decks, state, 'dr-2'); assert.deepEqual(state.entries['dr-2'], saved2);
  assert.throws(() => selectDeck(decks, state, 'absent'), /invalid-record/);
  assert.equal(transitionDeck(decks, state, { type: 'next', seed: 7 }), state);
  const next = transitionDeck(decks, state, { type: 'next', seed: 8 });
  const fresh = currentDeck(decks, next);
  assert.equal(next.selected, 'dr-2'); assert.equal(fresh.task.identity.seed, 8);
  assert.deepEqual(fresh.state, initialState(fresh.task));
  assert.deepEqual(next.entries['dr-1'], saved1); assert.deepEqual(next.entries['dr-3'], saved3);
});

test('DR-3 has no recall or prompts; no mode action remains', () => {
  const t = create(decks[2]), a = answered(t);
  delete a.prompts; assert.equal(check(t, a).ok, true);
  assert.deepEqual(solution(t).prompts, {});
  const sorted = transition(t, { ...initialState(t), answer: a }, { type: 'check' });
  assert.equal(transition(t, sorted, { type: 'continue' }), sorted);
  assert.equal(checkTyped(t, t.order[0], '/interface bridge add name=bridge-lan').code, 'invalid-answer');
});

test('DR-2 generated SVI entry, command-id mapping and complete script mode walker', () => {
  const t = create(decks[1], { seed: switchReplay.seed });
  const a = answered(t, switchReplay.accepted);
  for (const line of ['interface vlan 10', 'int vlan 10', 'int Vlan10']) assert.equal(checkTyped(t, 'recall:svi-enter', line).ok, true);
  assert.equal(checkTyped(t, 'recall:svi-enter', 'int vlan 99').code, 'wrong-value');
  assert.equal(checkTyped(t, key(t, 'default-gateway'), `ip default-gateway ${t.values.ip}`).code, 'wrong-value');
  for (const script of [solution(t).script, acceptedScript(t, a).script]) {
    let mode = '>', seen = 0;
    for (const line of script.split('\n')) {
      if (line === 'enable') { assert.equal(mode, '>'); mode = '#'; }
      else if (line === 'configure terminal') { assert.equal(mode, '#'); mode = '(config)#'; }
      else if (line === 'end') { assert.notEqual(mode, '#'); mode = '#'; }
      else if (line === 'exit') { assert.ok(['(config-if)#', '(config-line)#'].includes(mode)); mode = '(config)#'; }
      else if (line === 'line vty 0 15') { assert.equal(mode, '(config)#'); mode = '(config-line)#'; }
      else if (line.startsWith('interface ')) { assert.equal(mode, '(config)#'); assert.equal(line, 'interface vlan 10'); mode = '(config-if)#'; }
      else { assert.equal(parse(line, { mode, profile: profile2960 }).ok, true, line); seen++; }
    }
    assert.equal(seen, 12); assert.equal(mode, '#');
  }
});

for (const [line, ok, id] of [
  ['ip default-gateway 192.168.5.1', true, 'default-gateway'], ['ip default-gateway 999.2.3.4', false],
  ['ip default-gateway 1.2.3.4 extra', false], ['ip default-gateway 1.2.3.4\n', false],
  ['interface vlan 99', true, 'interface'], ['int Vlan4094', true, 'interface'],
  ['interface vlan 0', false], ['interface vlan 4095', false], ['interface vlan 1 extra', false],
  ['int fa0/24', true, 'interface'], ['int f 0/1', true, 'interface'], ['int gi0/2', true, 'interface'],
  ['int fa0/25', false], ['int gi0/0', false], ['int gi0/3', false],
  ['i', false], ['s', false], ['ena pass weak', false], ['ip ssh ver 1', false],
]) test(`2960 profile parser: ${JSON.stringify(line)}`, () => {
  const r = parse(line, { profile: profile2960 }); assert.equal(r.ok, ok);
  if (id) assert.equal(r.id, id);
});

test('2960 abbreviations are profile-local; ISR replay grammar remains unchanged', () => {
  for (const word of ['default-g', 'default-ga', 'default-gat', 'default-gate', 'default-gatew', 'default-gatewa']) {
    assert.equal(parse(`ip ${word} 1.2.3.4`, { profile: profile2960 }).id, 'default-gateway');
    assert.equal(parse(`ip ${word} 1.2.3.4`, { profile }).ok, false);
  }
  for (const p of ['d', 'default', 'default-']) assert.equal(parse(`ip ${p} 1.2.3.4`, { profile: profile2960 }).ok, false);
  assert.equal(parse('ip default-gateway 1.2.3.4', { profile }).ok, false);
  assert.equal(parse('interface vlan 10', { profile }).ok, false);
  assert.equal(parse('interface gi0/2', { profile }).ok, false);
  assert.equal(parse('i', { mode: '(config-if)#', profile: profile2960 }).finding.code, 'ambiguous-keyword');
});

test('new deck seed sweep: generation, displays, hints, tips, no early reference, accepted-order scripts', () => {
  const seeds = sweepSeeds(Array.from({ length: 128 }, (_, i) => i), [0, 1, 3, 7, 10, 42, 127]);
  const vlans = new Set(), prefixes = new Set(), commands = new Set();
  for (const [bank] of cases) for (const seed of seeds) {
    const t = create(bank, { seed }), a = initialAnswer(t);
    assert.ok(orderFinding(t, a.order)); assert.equal(acceptedScript(t, a), null);
    assert.deepEqual(tips(t, check(t, a)), []);
    for (const words of [render(t, a), t.values, text(t.profileText, t.values), deckUi[bank.id]]) assert.deepEqual(setupLeaks(words), []);
    assert.deepEqual(render(t, a).map(row => row.id), a.order);
    assert.ok(render(t, a).every(row => row.prompt === null));
    for (const h of hints(t)) assert.deepEqual(setupLeaks(text(h.code)), []);
    const good = answered(t);
    assert.equal(check(t, good).ok, true);
    for (const tip of tips(t, check(t, good))) {
      assert.notEqual(text(tip.code), tip.code);
      if (bank.id === 'dr-3') assert.doesNotMatch(text(tip.code), /write memory|configure terminal|privilege 15|4096|vty|\(config/);
    }
    if (bank.id === 'dr-2') {
      vlans.add(t.values.mgmt); prefixes.add(t.values.mask);
      assert.notEqual(t.values.ip, t.values.gateway);
      assert.equal(t.values.ip.split('.').slice(0, 3).join('.'), t.values.gateway.split('.').slice(0, 3).join('.'));
      assert.equal(t.values.modulus, 2048); assert.ok([10, 20, 99].includes(t.values.mgmt));
      assert.match(solution(t).script, new RegExp(`interface vlan ${t.values.mgmt}\\n`));
      for (const line of t.recallLines) { assert.deepEqual(setupLeaks(text(line.description ?? `typed.${line.commandId}`, t.values), 'typed'), []); commands.add(line.commandId); }
    } else {
      assert.equal(t.typedIds.length, 0); assert.equal(Object.keys(a.prompts).length, 0);
      assert.ok(render(t, a).every(row => row.secondary && !('mode' in row)));
      for (const dto of [solution(t), acceptedScript(t, good)]) {
        assert.equal(dto.script, null);
        const lines = dto.parts.flatMap(p => p.script.split('\n'));
        assert.equal(lines.length, 13);
        assert.equal(lines.filter(line => /^\/(?:interface|ip|user|tool) /.test(line)).length, 12);
        assert.equal(lines.filter(line => line.startsWith('# ')).length, 1);
        assert.doesNotMatch(lines.join('\n'), /identity|write memory|configure terminal|^enable/m);
      }
    }
    assert.equal(check(t, a).findings.length, 1);
    assert.ok(setupLeaks(solution(t)).length);
  }
  assert.deepEqual([...vlans].sort((a, b) => a - b), [10, 20, 99]);
  assert.equal(prefixes.size, 3);
  assert.equal(commands.size, 3);
});

for (const [value, kind, expected] of [
  ['bridge → bridge-port', 'render', 'rule-pair'], ['list → mac-server', 'render', 'rule-pair'],
  ['user → admin-off', 'render', 'rule-pair'], ['<li aria-label="bridge &#x2192; address">x</li>', 'render', 'rule-pair'],
  ['Міст → порт', 'render', 'rule-pair'], ['Список → сусіди', 'render', 'rule-pair'],
  ['/interface bridge add name=bridge-lan', 'rule', 'rule-command'], ['Tools → MAC Server → MAC Winbox Server', 'rule', 'rule-command'],
  ['bridge', 'typed', 'typed-keyword'], ['<li data-command="mac-server">x</li>', 'render', 'typed-keyword'],
]) test(`MikroTik leak injection: ${JSON.stringify(value)}`, () => assert.ok(setupLeaks(value, kind).includes(expected)));

test('Winbox second lines are permitted on cards, never dependency attributes or failure paths', () => {
  assert.deepEqual(setupLeaks({ id: 'c-12345678', secondary: 'Tools → MAC Server → MAC Winbox Server' }), []);
  for (const [, , , edges] of cases) for (const [, , code] of edges) assert.deepEqual(setupLeaks(text(code), 'rule'), []);
});
