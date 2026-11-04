// Keeping progress on this device (spec save v2), in Node: the adapter with a
// storage double. Every exercise's instance through the blob and back; a bad
// blob, bad nested state and stale identities; the boot order; the size cap
// and eviction order; the flush rules; a reset, in one tab and across two. The
// real page, its reloads and its events are tests/saved-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { topologyRepair } from './helpers/rf1-repairs.mjs';

const root = resolve(import.meta.dirname, '..');
const h = await import(pathToFileURL(resolve(root, '.test-bundles/harness/saved.mjs')));
const { target, KEY, GEN_KEY, VERSION, CAP, MAX_READ, MAX_DONE, DEBOUNCE_MS } = h;
const section = id => target.sections.find(s => s.id === id);
const routingBank = section('routing').bank, vlanBank = section('vlan').bank, setupBank = section('setup').bank;
const firewallBank = section('firewall').bank;

/** A storage double. `failing`: names of the methods that throw. */
function storage(initial = {}, failing = []) {
  const data = new Map(Object.entries(initial));
  const guard = name => { if (failing.includes(name)) throw new Error(`${name} failed`); };
  return {
    data, failing,
    getItem(key) { guard('getItem'); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { guard('setItem'); data.set(key, String(value)); },
    removeItem(key) { guard('removeItem'); data.delete(key); },
  };
}

const ok = { ok: true, complete: true, code: 'ok', findings: [] };
const solved = (instance = h.initialInstance()) => h.instanceReducer(instance, { type: 'checked', answer: {}, result: ok });
const withView = (view, base = h.initialInstance()) => ({ ...base, view });
const blobOf = (instances, extra = {}) => JSON.stringify({
  version: VERSION, gen: 0, prefs: {}, places: {}, done: {},
  instances: Object.fromEntries(Object.entries(instances).map(([key, state], i) => [key, { at: i + 1, state }])), ...extra,
}, (_, value) => (value instanceof Set ? { $set: [...value] } : value));
const read = (text, gen) => h.readSaved(target, storage({ [KEY]: text, ...(gen === undefined ? {} : { [GEN_KEY]: String(gen) }) }));

// ── One real instance per exercise, as its screen builds it ─────────────────

const keyOf = (logic, record, params) => h.instanceKeyOf(logic, logic.create(record, params), params);
/** A result as a JSON round trip without our Set handling would leave it. */
const setsLost = value => {
  if (value instanceof Set) return {};
  if (Array.isArray(value)) return value.map(setsLost);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, setsLost(v)]));
  return value;
};

function samples() {
  const list = {};
  const add = (id, key, instance, bad) => { list[id] = { key, instance, bad }; };

  const mask = { seed: 7, level: 2 };
  const maskResult = h.maskLogic.check(h.maskLogic.create(null, mask), { network: '10.0.0.0', broadcast: '10.0.0.1', prefix: '/8' });
  add('ip.mask', keyOf(h.maskLogic, null, mask), { ...h.instanceReducer(withView({ submits: 2, notice: null, invalid: { network: true }, choices: { network: true } }),
    { type: 'draft', syntax: 'text', part: 'answer', value: { network: '10.0.0.0', broadcast: '' } }), result: maskResult },
  [i => ({ ...i, view: { ...i.view, invalid: 'yes' } }), i => ({ ...i, drafts: { text: { answer: { network: {} } } } }),
    i => ({ ...i, result: { ok: false } }), i => ({ ...i, result: { ...i.result, evidence: { given: 'x' } } }), i => ({ ...i, result: { ...i.result, evidence: { fields: 'x' } } })]);

  const binary = { seed: 5, level: 3 };
  const binaryTask = h.binaryLogic.create(null, binary);
  add('ip.binary', binaryTask.instanceKey, { ...withView({ step: 1, submits: 3, drafts: { 1: [['1', '0'], ['1']] }, hintCounts: { 1: 1 }, marks: { 0: [null, { current: 'a', target: 'b' }] } }), parts: { 0: { octets: ['1', '0'] } }, result: h.binaryLogic.check(binaryTask, { step: 0, octets: ['1', '2', '3', '4'] }) },
    [i => ({ ...i, view: { ...i.view, step: 9 } }), i => ({ ...i, view: { ...i.view, drafts: { 1: 'x' } } }), i => ({ ...i, parts: { 0: { octets: 'nope' } } }),
      i => ({ ...i, result: { ok: false, code: 'x' } }), i => ({ ...i, result: { ...i.result, findings: [3] } })]);

  const sides = { seed: 3, other: false };
  add('dhcp-sides', keyOf(h.sidesExercise, null, sides), withView({ position: 2, tries: { a: ['wan', 'lan'] }, checks: 2, zoom: 'all' }),
    [i => ({ ...i, view: { ...i.view, position: -1 } }), i => ({ ...i, view: { ...i.view, tries: { a: 'wan' } } })]);

  const server = { seed: 4, level: 2, vendor: 'mikrotik', other: false };
  add('dhcp-server', keyOf(h.serverExercise, null, server), withView({ draft: { from: '1', to: '2', rows: [{ from: '1', to: '' }], ranges: '1-2', gateway: '1', dns: '8.8.8.8' }, step: 'options', checks: 1, checkedKey: '{}', result: { ok: false, final: false, text: 'Ні', field: 'from', address: '10.0.0.9' } }),
    [i => ({ ...i, view: { ...i.view, step: 'wizard' } }), i => ({ ...i, view: { ...i.view, result: { final: true } } }), i => ({ ...i, view: { ...i.view, result: { ok: false } } }),
      i => ({ ...i, view: { ...i.view, draft: { rows: {} } } }), i => ({ ...i, view: { ...i.view, draft: { rows: [3] } } }), i => ({ ...i, view: { ...i.view, draft: { rows: [{ from: 1 }] } } }),
      i => ({ ...i, view: { ...i.view, draft: { gateway: {} } } }), i => ({ ...i, view: { ...i.view, draft: { ranges: [] } } })]);

  const nat = { seed: 4, vendor: 'cisco', other: true };
  add('dhcp-nat', keyOf(h.natRound, null, nat), withView({ position: 1, picks: { c1: { source: ['a'], reply: [] } }, stepping: 'c1', stepAt: 2, checks: 1 }),
    [i => ({ ...i, view: { ...i.view, picks: { c1: { source: 'a' } } } })]);
  const natL2 = { seed: 4, vendor: 'cisco', other: false, twoLans: true };
  add('dhcp-nat-l2', keyOf(h.natRules, null, natL2), withView({ picks: { inside: ['x'], rule: [] }, checks: 1 }),
    [i => ({ ...i, view: { ...i.view, picks: { inside: 3 } } })]);

  const faultParams = { seed: 4, level: 1, vendor: 'cisco', other: false };
  const faultTask = h.faultExercise.create(null, faultParams);
  const typedDns = { ...faultTask.config, dhcp: { ...faultTask.config.dhcp, dns: '8.8.8.8 1.' } };
  add('dhcp-fault', h.instanceKeyOf(h.faultExercise, faultTask, faultParams), withView({ draft: typedDns, checked: faultTask.config, checkedKey: 'k', checks: 1, passed: false, stage: 'repair', causes: ['dns'], causeChecks: 1, picked: null }),
    [i => ({ ...i, view: { ...i.view, draft: {} } }), i => ({ ...i, view: { ...i.view, stage: 'nowhere' } }), i => ({ ...i, view: { ...i.view, draft: { ...i.view.draft, dhcp: { ...i.view.draft.dhcp, ranges: 'x' } } } }),
      i => ({ ...i, view: { ...i.view, draft: { ...i.view.draft, dhcp: { ...i.view.draft.dhcp, ranges: [{ from: 1 }] } } } }), i => ({ ...i, view: { ...i.view, checked: { ...i.view.draft, nat: {} } } })]);

  const proof = { seed: 9, vendor: 'cisco' };
  add('checks-proof', keyOf(h.proofExercise, null, proof), withView({ position: 1, tries: { r: ['a'] }, checks: 1 }), [i => ({ ...i, view: { ...i.view, checks: '1' } })]);
  const ladder = { seed: 9, level: 2, vendor: 'cisco' };
  add('checks-ladder', keyOf(h.ladderExercise, null, ladder), withView({ index: 1, rows: [{ id: 'ping', arg: '1.1.1.1' }], places: ['x'], stopped: false, healthy: 0, checks: 1, attempt: 1 }),
    [i => ({ ...i, view: { ...i.view, rows: [{ arg: 1 }] } })]);
  const claims = { seed: 9, level: 1, vendor: 'cisco' };
  add('checks-claims', keyOf(h.claimsExercise, null, claims), withView({ selected: ['0.a'], none: false, linesOk: true, checkedLines: ['0.a'], linesChecks: 1, verdicts: ['v'], checks: 2 }),
    [i => ({ ...i, view: { ...i.view, selected: 'x' } })]);

  const { predict: fwRecord, order: orderRecord } = h.firewallRecords(firewallBank);
  const fwTask = h.fwLogic.create(fwRecord, { variantId: fwRecord.variants.find(v => v.kind !== 'chain').id, seed: 11, level: 2 });
  const fwAnswer = h.fwLogic.solution(fwTask);
  const fwCard = Object.keys(fwAnswer)[0];
  add('fw-predict', fwTask.instanceKey, withView({
    drafts: { c1: { hook: 'input', said: { code: 'x', n: 1 } } }, position: 1, revealed: ['c0'], played: ['c0'], hookChecks: 1,
    commit: { instanceKey: fwTask.instanceKey, answer: fwAnswer, result: h.fwLogic.check(fwTask, fwAnswer) },
  }), [i => ({ ...i, view: { ...i.view, commit: { instanceKey: 'k', answer: {} } } }), i => ({ ...i, view: { ...i.view, revealed: 'c0' } }),
    i => ({ ...i, view: { ...i.view, commit: { ...i.view.commit, result: { ok: true } } } }),
    i => ({ ...i, view: { ...i.view, commit: { ...i.view.commit, result: { ...i.view.commit.result, evidence: { ...i.view.commit.result.evidence, [fwCard]: { hook: 'input' } } } } } }),
    i => ({ ...i, view: { ...i.view, commit: { ...i.view.commit, result: { ...i.view.commit.result, evidence: {} } } } })]);

  const order = h.orderLogic(orderRecord);
  const orderTask = order.create(orderRecord, { variantId: orderRecord.variants[0].id, seed: 11 });
  let orderState = h.orderInitial(orderTask);
  orderState = h.orderTransition(order, orderTask, orderState, { type: 'check' });
  add('fw-order', orderTask.instanceKey, withView({ orderState, orderRevealedAt: { instanceKey: orderTask.instanceKey, presses: 1 }, orderHint2: null }),
    [i => ({ ...i, view: { ...i.view, orderState: { ...i.view.orderState, answer: {} } } }),
      i => ({ ...i, view: { ...i.view, orderState: { ...i.view.orderState, result: { feedback: {} } } } }),
      i => ({ ...i, view: { ...i.view, orderState: { ...i.view.orderState, result: { ok: false, feedback: { code: 'x', card: { id: 'c' } } } } } }),
      i => ({ ...i, view: { ...i.view, orderState: { ...i.view.orderState, lastCheck: { order: [], result: { ok: false, feedback: 'x' } } } } }),
      i => ({ ...i, view: { ...i.view, orderStale: { instanceKey: 'k', result: {} } } })]);

  const predictTask = h.vlanPredict.create(vlanBank.predict, { variantId: 'p1', seed: 3, vendor: 'routeros', surprises: 1 });
  const predictAnswer = h.vlanPredict.solution(predictTask);
  add('vlan-predict', predictTask.instanceKey, withView({
    drafts: { r1: { hosts: ['PC1'], nobody: false } }, position: 1, switchId: 'SW1',
    commit: { instanceKey: predictTask.instanceKey, answer: predictAnswer, result: h.vlanPredict.check(predictTask, predictAnswer) },
  }), [i => ({ ...i, view: { ...i.view, drafts: { r1: { nobody: true } } } }),
    i => ({ ...i, view: { ...i.view, commit: { ...i.view.commit, result: { ok: false, findings: [] } } } }),
    i => ({ ...i, view: { ...i.view, commit: { ...i.view.commit, result: setsLost(i.view.commit.result) } } }),
    i => ({ ...i, view: { ...i.view, commit: { ...i.view.commit, result: { ...i.view.commit.result, evidence: { r1: 'x' } } } } })]);

  const portsRecord = vlanBank.ports[0];
  const portsTask = h.vlanPorts.create(portsRecord, { variantId: portsRecord.variants[0].id, seed: 3, syntax: 'cisco' });
  const portsResult = h.vlanPorts.check(portsTask, h.vlanPorts.solution(portsTask));
  add('vlan-ports', portsTask.instanceKey, { ...withView({ forms: { cisco: h.blankForm(portsTask, 'cisco'), routeros: h.blankForm(portsTask, 'routeros') }, raw: { cisco: { 'SW1|vlans': '10,' } }, verdict: { syntax: 'cisco', answer: '{}' }, switchId: 'SW1' }), result: portsResult },
    [i => ({ ...i, view: { ...i.view, verdict: { syntax: 'cisco', answer: 'not json' } } }), i => ({ ...i, view: { ...i.view, verdict: { syntax: 'cisco', answer: '3' } } }),
      i => ({ ...i, view: { ...i.view, forms: { cisco: { SW1: { vlans: [] } } } } }),
      i => ({ ...i, result: { ok: true } }), i => ({ ...i, result: setsLost(i.result) }), i => ({ ...i, result: { ...i.result, evidence: { domains: 'x' } } }),
      i => ({ ...i, result: { ...i.result, evidence: { probes: [{ id: 'p', walks: [{ from: 'PC1' }] }] } } })]);

  const routeRecord = vlanBank.route[0];
  const routeTask = h.vlanRoute.create(routeRecord, { variantId: 'main', seed: 3, syntax: 'cisco' });
  add('vlan-route', routeTask.instanceKey, { ...withView({ forms: { cisco: h.vlanRoute.initialAnswer(routeTask, 'cisco') }, deviceId: 'R1', direction: 'reply', edited: { syntax: 'cisco', device: 'R1', field: 'x' }, revealedAt: 2 }), result: h.vlanRoute.check(routeTask, h.vlanRoute.solution(routeTask)) },
    [i => ({ ...i, view: { ...i.view, direction: 'sideways' } }), i => ({ ...i, view: { ...i.view, forms: { cisco: { SW1: { ports: 'x' } } } } }),
      i => ({ ...i, result: { ok: true } }), i => ({ ...i, result: setsLost(i.result) }), i => ({ ...i, result: { ...i.result, evidence: { probes: [{ id: 'p' }] } } }),
      i => ({ ...i, result: { ...i.result, evidence: { probes: [{ id: 'p', request: { ok: true } }] } } }), i => ({ ...i, result: { ...i.result, evidence: { objectives: [{ ok: false }] } } })]);

  const vlanFaultRecord = vlanBank.faults[0];
  const vlanFaultTask = h.vlanFaults.create(vlanFaultRecord, { vendor: 'cisco', level: 1, seed: 3 });
  add('vlan-faults', vlanFaultTask.instanceKey, { ...withView({ form: h.vlanFaults.initialAnswer(vlanFaultTask).configuration, raw: {}, cause: null, checked: JSON.stringify(h.vlanFaults.initialAnswer(vlanFaultTask)), stage: 'repair', walk: { source: 'grid', id: 'row', n: 1 }, side: 'after' }), result: h.vlanFaults.check(vlanFaultTask, h.vlanFaults.initialAnswer(vlanFaultTask)) },
    [i => ({ ...i, view: { ...i.view, checked: '{' } }), i => ({ ...i, view: { ...i.view, checked: '{}' } }), i => ({ ...i, view: { ...i.view, walk: { n: 1 } } }),
      i => ({ ...i, view: { ...i.view, form: { SW1: { vlans: 'x' } } } }),
      i => ({ ...i, result: { ok: false } }), i => ({ ...i, result: setsLost(i.result) }),
      i => ({ ...i, result: { ...i.result, evidence: { ...i.result.evidence, grid: { reachability: 'x', isolation: [] } } } }),
      i => ({ ...i, result: { ...i.result, evidence: { ...i.result.evidence, grid: { reachability: [], isolation: [{ id: 'x' }] } } } })]);

  const routingRecord = routingBank.tasks[0];
  const routingTask = h.routingLogic.create(routingRecord, { variantId: routingRecord.variants[0].id, seed: null, bank: routingBank, bankId: routingBank.bankId, bankRevision: routingBank.bankRevision });
  let routing = h.instanceReducer(h.initialInstance(), { type: 'draft', mode: 'free', syntax: 'cisco', routeId: 'R1.f1', value: { net: '10.0.0.0' }, canonical: null });
  routing = h.instanceReducer(routing, { type: 'route-upsert', routerId: 'R1', route: { dst: '10.0.0.0', prefix: 24, via: '10.1.1.2', distance: 1 } });
  add('routing.static', routingTask.instanceKey, { ...routing, view: { checks: 1, checkedEdits: 2, proven: '{}' }, result: h.routingLogic.check(routingTask, h.routingLogic.solution(routingTask)) },
    [i => ({ ...i, answer: { R1: 'route' } }), i => ({ ...i, answer: { R1: [{ prefix: 24 }] } }), i => ({ ...i, drafts: { free: { revs: 'x' } } }), i => ({ ...i, view: { ...i.view, proven: 'not json' } }),
      i => ({ ...i, view: { ...i.view, proven: '{"R1":"x"}' } }), i => ({ ...i, result: { ok: true, evidence: { probes: [{ id: 'p' }] } } }),
      i => ({ ...i, result: { ...i.result, evidence: { safety: [{ params: {} }] } } }), i => ({ ...i, result: { ...i.result, evidence: { objectives: [{ id: 'o' }] } } }),
      i => ({ ...i, result: { ...i.result, evidence: { demonstrations: [{ id: 'd' }] } } }), i => ({ ...i, result: { ...i.result, formErrors: 'x' } })]);

  const faultsTask = h.routingFaults.create(routingBank.faults, { bank: routingBank, level: 1, seed: 5 });
  const faultsChecked = h.routingFaultSubmit(faultsTask, h.routingFaultState(faultsTask), { syntax: 'cisco' });
  add('routing-faults', faultsTask.instanceKey, withView({ rf: faultsChecked, rows: { R1: [{ id: 'route-1', route: { dst: '1.1.1.0' } }] }, drafts: { 'route-1': { syntax: 'cisco', values: { net: '1' } } }, marks: {}, router: 'R1', checks: 1, verdict: { tone: 'no', words: ['x'], done: false }, checkedRows: '{}', solved: false, serial: 2, hintSnap: 'checked' }),
    [i => ({ ...i, view: { ...i.view, rf: { ...i.view.rf, original: [] } } }), i => ({ ...i, view: { ...i.view, rows: { R1: 'x' } } }),
      i => ({ ...i, view: { ...i.view, rf: { ...i.view.rf, result: { ok: false } } } }),
      i => ({ ...i, view: { ...i.view, rf: { ...i.view.rf, result: { ...i.view.rf.result, evidence: { snapshot: { rows: [{ id: 'p' }] } } } } } }),
      i => ({ ...i, view: { ...i.view, rf: { ...i.view.rf, snapshot: { rows: [{}] } } } }), i => ({ ...i, view: { ...i.view, rf: { ...i.view.rf, answer: { routes: { R1: 'x' } } } } }),
      i => ({ ...i, view: { ...i.view, rf: { ...i.view.rf, reveal: { before: {}, after: {} } } } }), i => ({ ...i, view: { ...i.view, marks: { r: { values: 'x' } } } })]);

  const deck = setupBank.decks[0];
  const drillTask = h.drillLogic.create(deck, { seed: 12 });
  const drillState = h.drillTransition(drillTask, h.drillInitial(drillTask), { type: 'check' });
  assert.equal(drillState.feedback.ok, false, 'the sample holds a failing check');
  add('setup-drill', drillTask.instanceKey, withView({ setup: { ...drillState, typedFeedback: { l1: { ok: false, code: 'x', findings: [{ code: 'x', cards: ['l1'] }] } } }, setupEdited: null, setupHintAt: 0, setupCheck: { id: 'l1', n: 1, result: { ok: true, code: 'ok', findings: [] }, value: 'x', stamp: 1 } }),
    [i => ({ ...i, view: { ...i.view, setup: { ...i.view.setup, phase: 'somewhere' } } }), i => ({ ...i, view: { ...i.view, setup: { ...i.view.setup, answer: {} } } }),
      i => ({ ...i, view: { ...i.view, setup: { ...i.view.setup, feedback: { ok: false } } } }), i => ({ ...i, view: { ...i.view, setup: { ...i.view.setup, feedback: { ok: false, findings: [{ cards: 'x' }] } } } }),
      i => ({ ...i, view: { ...i.view, setup: { ...i.view.setup, typedFeedback: { l1: { ok: false } } } } }), i => ({ ...i, view: { ...i.view, setupCheck: { id: 'l1', stamp: 1, result: { ok: false } } } })]);

  return list;
}

const exercises = samples();
const exerciseIds = () => target.sections.flatMap(s => Object.keys(s.saved?.exercises ?? {}));
/** What JSON keeps of a value, Sets aside: `undefined` fields go. */
const stripped = value => {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return value.map(stripped);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripped(v)]));
  return value;
};

// ── Round trips ─────────────────────────────────────────────────────────────

test('saved: every exercise of the target has a table and a sample here', () => {
  assert.deepEqual(exerciseIds().sort(), Object.keys(exercises).sort());
});

test('saved: every section\'s instance survives the blob unchanged, its key as the app built it', () => {
  const instances = Object.fromEntries(Object.values(exercises).map(({ key, instance }) => [key, instance]));
  const state = h.initialStore({}, {}, instances);
  const text = h.fitted(state, {}, 0);
  assert.ok(text.length <= CAP, `${text.length}`);
  const back = read(text);
  assert.deepEqual(Object.keys(back.instances).sort(), Object.keys(instances).sort());
  for (const [id, { key, instance }] of Object.entries(exercises)) assert.deepEqual(back.instances[key], stripped(instance), id);
});

test('saved: a VLAN result keeps its Sets (the screens call .has on them after a refresh)', () => {
  const { key, instance } = exercises['vlan-faults'];
  const back = read(h.fitted(h.initialStore({}, {}, { [key]: instance }), {}, 0)).instances[key];
  const walks = [];
  JSON.stringify(back.result, (_, v) => { if (v instanceof Set) walks.push(v); return v instanceof Set ? [...v] : v; });
  assert.ok(walks.length > 0, 'the result holds Sets');
});

test('saved: a revealed task comes back revealed, earning nothing; a ✓ earned before the reveal stays', () => {
  const key = exercises['dhcp-sides'].key;
  const reveal = instance => h.instanceReducer(instance, { type: 'session', action: { type: 'reveal' } });
  const revealed = reveal(h.initialInstance());
  const back = read(h.fitted(h.initialStore({}, {}, { [key]: revealed }), {}, 0)).instances[key];
  assert.deepEqual([back.session.status, back.session.revealed, back.session.earned.solved], ['revealed', true, false]);
  const after = reveal(solved());
  const kept = read(h.fitted(h.initialStore({}, {}, { [key]: after }), {}, 0)).instances[key];
  assert.deepEqual([kept.session.revealed, kept.session.earned.solved], [true, true]);
});

test('saved: routing faults: the proof of a passed fix is never saved; after a refresh the cause question comes back by a recheck', () => {
  const params = seed => ({ bank: routingBank, level: 1, seed });
  const cause = { syntax: 'cisco' };
  const passed = seed => {
    const task = h.routingFaults.create(routingBank.faults, params(seed));
    const rf = h.routingFaultState(task);
    return h.routingFaultSubmit(task, { ...rf, answer: { routes: topologyRepair(task), cause: null }, step: 'fix' }, cause);
  };
  const seed = [0, 1, 2, 3, 4, 5, 6, 7].find(s => passed(s).step === 'cause');
  assert.notEqual(seed, undefined, 'a seed the repair passes');
  const rf = JSON.parse(JSON.stringify(passed(seed)));
  // FaultsView's liveResult, on the task a reload builds: no proof, so it checks the same routes once.
  const task = h.routingFaults.create(routingBank.faults, params(seed));
  assert.deepEqual(h.routingFaults.options(task, 'cause', { result: rf.result, answer: rf.answer, ...cause }), []);
  const again = h.routingFaults.check(task, { ...rf.answer, cause: null }, { step: 'fix', ...cause });
  assert.equal(again.fixOk, true);
  assert.ok(h.routingFaults.options(task, 'cause', { result: again, answer: rf.answer, ...cause }).length > 0);
});

// ── Secrets: a typed password is never written ──────────────────────────────

const PASSWORD = 'Abc12345!';
const TYPED_LINES = [`enable secret ${PASSWORD}`, `/user add name=maintainer group=full password=${PASSWORD}`, `ena sec ${PASSWORD}`,
  `username maintainer privilege 15 secret ${PASSWORD}`, `password ${PASSWORD}`, PASSWORD];
const legacyDeck = () => setupBank.decks.find(d => d.id === 'dr-1');

/** A real recall instance at `phase`, holding a typed line in every place one lands. */
function recallInstance(line, phase = 'recall') {
  const task = h.drillLogic.create(legacyDeck(), { seed: 12 });
  let state = h.drillTransition(task, h.drillInitial(task), { type: 'reveal' });
  state = h.drillTransition(task, state, { type: 'continue' });
  const id = task.typedIds[0];
  state = h.drillTransition(task, state, { type: 'typed', id, text: line });
  state = h.drillTransition(task, state, { type: 'check-typed', id });
  const setupCheck = { id, n: 1, result: state.typedFeedback[id], value: line, stamp: 1 };
  return { task, id, instance: { ...withView({ setup: { ...state, phase }, setupCheck, setupHintAt: 1 }), answer: state.answer, result: { ok: false, code: 'x', findings: [{ code: 'x', token: line }] } } };
}

test('secrets: a typed line reaches the state where the brief says (a rejected line\'s finding quotes its token)', () => {
  const task = h.drillLogic.create(legacyDeck(), { seed: 12 });
  const id = task.typedIds[0];
  assert.ok(JSON.stringify(h.checkTyped(task, id, `hostname R1 ${PASSWORD}`)).includes(PASSWORD), 'the leak the redaction has to stop');
  assert.ok(JSON.stringify(recallInstance(`enable secret ${PASSWORD}`).instance).includes(PASSWORD));
});

test('secrets: no typed line is in the written blob, in any phase, and the instance stays valid', () => {
  for (const line of TYPED_LINES) for (const phase of ['recall', 'done']) {
    const { task, instance, id } = recallInstance(line, phase);
    const text = h.fitted(h.initialStore({}, {}, { [task.instanceKey]: instance }), {}, 0, h.redactorOf(target));
    assert.ok(!text.includes(PASSWORD), `${line}, ${phase}`);
    const back = read(text).instances[task.instanceKey];
    assert.ok(back, `${line}, ${phase}: still restores`);
    assert.equal(back.view.setup.phase, 'recall', 'a finished recall reopens');
    assert.equal(back.view.setup.answer.typed[id], '', 'the line comes back empty');
    assert.deepEqual(back.view.setup.typedFeedback, {});
    assert.equal(back.view.setupCheck, undefined);
  }
});

test('secrets: on every write: after the debounce, after a flush, after a check, under eviction', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = storage();
  const writes = [];
  const setItem = store.setItem;
  store.setItem = (key, value) => { writes.push(value); setItem(key, value); };
  const { saver } = h.restoreSaved(target, { storage: store, web: true });
  let s = h.initialStore();
  saver.note(s);
  const { task, instance } = recallInstance(`enable secret ${PASSWORD}`);
  s = { ...s, instances: { [task.instanceKey]: instance } };
  saver.note(s);
  t.mock.timers.tick(DEBOUNCE_MS);
  s = { ...s, instances: { ...s.instances, [task.instanceKey]: { ...instance, presses: 1 } } };
  saver.note(s);
  saver.flush();
  // Over the cap the eviction path serialises entries on its own.
  s = { ...s, instances: { ...s.instances, [maskKey(1)]: big(CAP + 10, false), [maskKey(2)]: big(CAP, true) } };
  saver.note(s);
  saver.flush();
  assert.ok(writes.length >= 3, `${writes.length}`);
  for (const text of writes) assert.ok(!text.includes(PASSWORD));
});

test('secrets: an instance that can\'t be cleaned isn\'t written at all', () => {
  const { task, instance } = recallInstance(`enable secret ${PASSWORD}`);
  const text = h.fitted(h.initialStore({}, {}, { [task.instanceKey]: instance }), {}, 0, () => { throw new Error('broken'); });
  assert.ok(!text.includes(PASSWORD));
  assert.deepEqual(JSON.parse(text).instances, {});
});

test('secrets: the backstop drops command strings anywhere in the instance; ids and the placeholder survive', () => {
  const { task } = recallInstance('x');
  const redact = h.redactorOf(target);
  const instance = withView({ other: { deep: [`enable secret ${PASSWORD}`, `password=${PASSWORD}`, `SECRET ${PASSWORD}`, `user m priv 15 sec ${PASSWORD}`, `pass ${PASSWORD}`] }, ids: ['enable-secret', 'password-encryption', 'service password-encryption', 'c-0a1b2c3d'], kept: 'enable secret <пароль>' });
  const { view } = redact(task.instanceKey, instance);
  assert.deepEqual(view.other.deep, ['', '', '', '', '']);
  assert.deepEqual(view.ids, instance.view.ids);
  assert.equal(view.kept, 'enable secret <пароль>');
});

test('saved: the setup decks\' modes step comes back as it was (round 9, B1); a first visit stays used', () => {
  const { key, instance } = exercises['setup-drill'];
  const modes = { ...instance, view: { ...instance.view, setup: { ...instance.view.setup, phase: 'modes', feedback: null, typedFeedback: {}, answer: { ...instance.view.setup.answer, typed: {} } }, setupCheck: null } };
  assert.equal(read(blobOf({ [key]: modes })).instances[key].view.setup.phase, 'modes');
  assert.equal(h.redactorOf(target)(key, modes).view.setup.phase, 'modes');
  const blob = places => JSON.stringify({ version: VERSION, gen: 0, instances: {}, prefs: {}, places });
  assert.deepEqual(read(blob({ examples: { setup: true, 'routing-15': true } })).places.examples, { setup: true, 'routing-15': true }, 'the example never opens by itself again after a refresh');
  assert.equal(read(blob({ examples: { setup: 'yes' } })).places.examples, undefined);
});

test('secrets: a sorted deck keeps its order, ids and verdict; the reveal stays honest, its reference lines shown', () => {
  const { key, instance } = exercises['setup-drill'];
  const clean = h.redactorOf(target)(key, instance);
  assert.deepEqual(clean.view.setup.answer.order, instance.view.setup.answer.order);
  assert.deepEqual(clean.view.setup.feedback, instance.view.setup.feedback, 'the sorting verdict is no typed line');
  assert.equal(clean.view.setupEdited, null);
  const task = h.drillLogic.create(legacyDeck(), { seed: 12 });
  let state = h.drillTransition(task, h.drillInitial(task), { type: 'reveal' });
  state = h.drillTransition(task, state, { type: 'continue' });
  state = h.drillTransition(task, state, { type: 'reveal' });
  assert.equal(state.phase, 'done-shown');
  const shown = h.redactorOf(target)(task.instanceKey, withView({ setup: state })).view.setup;
  assert.equal(shown.phase, 'done-shown');
  assert.deepEqual(shown.answer.typed, state.answer.typed, 'the reference, placeholders and all');
});

test('secrets: only setup has a redaction: other sections\' instances are written as they are', () => {
  const { key, instance } = exercises['dhcp-sides'];
  assert.equal(h.redactorOf(target)(key, instance), instance);
  assert.deepEqual(target.sections.flatMap(s => Object.entries(s.saved?.exercises ?? {}).filter(([, rule]) => rule.redact).map(([id]) => id)), ['setup-drill']);
});

test('secrets: every load removes the old blob, passwords and all, before reading; only on the web', () => {
  const old = JSON.stringify({ version: 1, gen: 0, prefs: { theme: 'light' }, places: {}, done: {}, instances: { x: { at: 1, state: { typed: `enable secret ${PASSWORD}` } } } });
  assert.deepEqual([...h.OLD_KEYS], ['netgym.v1']);
  const store = storage({ 'netgym.v1': old, [GEN_KEY]: '4' });
  const back = h.restoreSaved(target, { storage: store, web: true });
  assert.equal(store.data.has('netgym.v1'), false);
  assert.deepEqual([back.prefs, back.instances, back.gen], [{}, {}, 4], 'nothing of it is read; the generation stands');
  const failing = storage({ 'netgym.v1': old }, ['removeItem']);
  assert.doesNotThrow(() => h.restoreSaved(target, { storage: failing, web: true }));
  const app = storage({ 'netgym.v1': old });
  h.restoreSaved(target, { storage: app, web: false });
  assert.equal(app.data.has('netgym.v1'), true, 'the Windows app touches nothing');
});

// ── Bad blobs ───────────────────────────────────────────────────────────────

test('saved: a corrupted, an old-version and an oversized blob each start clean', () => {
  const good = blobOf({ [exercises['dhcp-sides'].key]: exercises['dhcp-sides'].instance });
  assert.equal(Object.keys(read(good).instances).length, 1, 'the control reads');
  const clean = { prefs: {}, places: {}, instances: {}, touched: {}, gen: 0 };
  assert.deepEqual(read('{"version":1,'), clean);
  assert.deepEqual(read('null'), clean);
  assert.deepEqual(read('[]'), clean);
  assert.deepEqual(read(good.replace(`"version":${VERSION}`, '"version":0')), clean);
  assert.deepEqual(read(good.replace(`"version":${VERSION}`, `"version":${VERSION + 1}`)), clean);
  // Over the limit: rejected before parsing, so a broken tail makes no difference.
  const huge = `${good.slice(0, -1)},"pad":"${'x'.repeat(MAX_READ)}"}`;
  const parse = JSON.parse;
  let parsed = 0;
  JSON.parse = (...args) => { parsed += 1; return parse(...args); };
  try { assert.deepEqual(read(huge), clean); } finally { JSON.parse = parse; }
  assert.equal(parsed, 0, 'not parsed');
});

test('saved: malformed nested state drops that instance alone, in every section', () => {
  const other = exercises['dhcp-sides'];
  for (const [id, { key, instance, bad }] of Object.entries(exercises)) {
    assert.ok(bad.length > 0, id);
    assert.ok(key in read(blobOf({ [key]: instance })).instances, `${id}: the sample itself is valid`);
    for (const [i, breakIt] of bad.entries()) {
      const keys = read(blobOf({ [key]: breakIt(instance), ...(id === 'dhcp-sides' ? { [exercises['ip.mask'].key]: exercises['ip.mask'].instance } : { [other.key]: other.instance }) })).instances;
      assert.equal(key in keys, false, `${id} #${i} is dropped`);
      assert.equal(Object.keys(keys).length, 1, `${id} #${i}: the other instance stays`);
    }
  }
});

test('saved: firewall level 1 keeps its chain-only walks; the rule walks are asked of level 2 alone', () => {
  const { predict: record } = h.firewallRecords(firewallBank);
  const task = h.fwLogic.create(record, { variantId: record.variants.find(v => v.kind === 'chain').id, seed: 11, level: 1 });
  const answer = h.fwLogic.solution(task);
  const commit = { instanceKey: task.instanceKey, answer, result: h.fwLogic.check(task, answer) };
  assert.ok(task.instanceKey in read(blobOf({ [task.instanceKey]: withView({ commit }) })).instances);
});

test('saved: the screens that never read `result` don\'t need one: their check stores only the verdict', () => {
  for (const id of ['dhcp-sides', 'dhcp-nat', 'dhcp-nat-l2', 'dhcp-server', 'dhcp-fault', 'checks-proof', 'checks-ladder', 'checks-claims']) {
    const { key, instance } = exercises[id];
    const stored = { ...instance, answer: {}, result: { ok: true, complete: false } };
    assert.ok(key in read(blobOf({ [key]: stored })).instances, id);
  }
});

test('saved: the shared parts of an instance are checked for every exercise', () => {
  const { key, instance } = exercises['checks-proof'];
  for (const broken of [
    { ...instance, session: { ...instance.session, status: 'passed' } }, { ...instance, session: { ...instance.session, earned: null } },
    { ...instance, session: { ...instance.session, hintIndex: 7 } }, { ...instance, presses: -1 }, { ...instance, presses: 1.5 }, { ...instance, generation: '2' },
    { ...instance, view: [] }, { ...instance, drafts: null }, { ...instance, parts: 'x' }, { ...instance, result: { findings: [] } }, null, 'text', 3,
  ]) assert.equal(key in read(blobOf({ [key]: broken })).instances, false, JSON.stringify(broken)?.slice(0, 80));
});

test('saved: stale identities are dropped: a new bank revision, record or generator, or an unknown task or exercise', () => {
  const swap = (key, patch) => JSON.stringify({ ...JSON.parse(key), ...patch });
  const { key: routing, instance } = exercises['routing.static'];
  const cases = [
    swap(routing, { bankRevision: 0 }), swap(routing, { bankId: 'routing.other' }), swap(routing, { taskId: 'nope' }), swap(routing, { variantId: 'nope' }),
    swap(routing, { seed: 7, generatorVersion: 0 }), swap(routing, { seed: 7, generatorVersion: null }),
    swap(exercises['routing-faults'].key, { generatorVersion: 0 }), swap(exercises['routing-faults'].key, { recordVersion: 0 }),
    swap(exercises['ip.binary'].key, { generatorVersion: 0 }), swap(exercises['ip.mask'].key, { version: 0 }),
    swap(exercises['dhcp-server'].key, { generatorVersion: 0 }), swap(exercises['dhcp-sides'].key, { generatorVersion: 0 }), swap(exercises['dhcp-fault'].key, { version: 9 }),
    swap(exercises['checks-claims'].key, { generatorVersion: 0 }), swap(exercises['fw-predict'].key, { generatorVersion: 0 }), swap(exercises['fw-order'].key, { recordVersion: 0 }),
    swap(exercises['vlan-predict'].key, { generatorVersion: 1 }), swap(exercises['vlan-ports'].key, { recordVersion: 0 }), swap(exercises['vlan-faults'].key, { shape: 'nope' }),
    swap(exercises['setup-drill'].key, { taskId: 'dr-9' }), swap(exercises['setup-drill'].key, { generatorVersion: 0 }),
    swap(routing, { exerciseId: 'gone' }), 'not json', '{"exerciseId":"ip.mask"}', ` ${exercises['ip.mask'].key}`,
    exercises['ip.mask'].key.replace(/:/, ': '),
  ];
  for (const key of cases) assert.deepEqual(Object.keys(read(blobOf({ [key]: instance })).instances), [], key);
  // A ✓ alone is checked the same way.
  const done = key => read(JSON.stringify({ version: VERSION, gen: 0, done: { [key]: [1, 1, 0, 0] } })).instances;
  assert.deepEqual(Object.keys(done(cases[0])), []);
  assert.deepEqual(Object.keys(done(routing)), [routing]);
});

test('saved: VLAN keys keep their vendor exactly: each vendor\'s instance comes back under its own key', () => {
  const record = vlanBank.faults[0];
  const task = vendor => h.vlanFaults.create(record, { vendor, level: 1, seed: 3 });
  const [a, b] = [task('cisco').instanceKey, task('routeros').instanceKey];
  assert.notEqual(a, b);
  const earned = { ...solved(), answer: null, result: null };
  const back = read(h.fitted(h.initialStore({}, {}, { [a]: earned, [b]: h.initialInstance() }), {}, 0)).instances;
  assert.deepEqual([back[a].session.earned.solved, back[b].session.earned.solved], [true, false]);
});

test('saved: prefs: each known key with an allowed value is kept, anything else dropped alone', () => {
  const back = read(JSON.stringify({ version: VERSION, gen: 0, instances: {}, places: {}, prefs: { syntax: 'routeros', theme: 'sepia', inputMode: 3, mode: 'free', extra: 'x' } }));
  assert.deepEqual(back.prefs, { syntax: 'routeros', mode: 'free' });
});

test('saved: places pass their section\'s shape, then the same codec as a URL', () => {
  const dhcp = section('dhcp');
  const first = (scope, s) => s.url.decode({}, { bank: s.bank, syntax: 'cisco', places: {}, random: () => 0.25 })[scope];
  const good = first('dhcp', dhcp);
  const blob = places => JSON.stringify({ version: VERSION, gen: 0, instances: {}, prefs: {}, places });
  assert.deepEqual(read(blob({ dhcp: { ...good, exercise: 'server' } })).places.dhcp.exercise, 'server');
  // A broken scope goes alone; an unknown one too.
  const back = read(blob({ dhcp: { ...good, server: { level: 9, tasks: {} } }, setup: { deck: 'dr-1', seeds: { 'dr-1': 5 } }, nonsense: { a: 1 } }));
  assert.deepEqual(Object.keys(back.places), ['setup']);
  assert.equal(key(read(blob({ dhcp: 'x' })).places), '');
  // The codec's say: a share code for a task the bank doesn't have falls back to its first task.
  const routing = read(blob({ routing: { taskId: 'gone', router: 'R9', filterLevel: 0, variants: {}, seeds: {} } })).places.routing;
  assert.equal(routing.taskId, routingBank.tasks[0].id);
  assert.equal(routing.router, null);
  // VLAN: a seed the logic can't build at this slot is replaced as a bad link's is.
  const vlan = section('vlan');
  const place = vlan.url.decode({}, { bank: vlan.bank, syntax: 'cisco', places: {}, random: () => 0.5 }).vlan;
  const kept = read(blob({ vlan: place })).places.vlan;
  assert.deepEqual(kept.predict['p1|cisco'], place.predict['p1|cisco'], 'a good place is unchanged');
});
const key = object => Object.keys(object).join();

// ── The boot order ──────────────────────────────────────────────────────────

const at = hash => ({ hash });
const lcg = () => { let v = 1; return () => ((v = (Math.imul(1664525, v) + 1013904223) >>> 0) / 4294967296); };
const savedPlace = (over = {}) => {
  const dhcp = section('dhcp');
  return { ...dhcp.url.decode({}, { bank: dhcp.bank, syntax: 'cisco', places: {}, random: lcg() }).dhcp, ...over };
};

test('boot: saved state comes first; a shared link wins over a saved place; other saved scopes and instances stay', () => {
  const setup = { deck: 'dr-1', seeds: { 'dr-1': 5 } };
  const places = { dhcp: savedPlace({ exercise: 'sides' }), setup };
  const { key: k, instance } = exercises['checks-proof'];
  const saved = { prefs: { syntax: 'routeros', theme: 'light' }, places, instances: { [k]: instance }, saver: null };
  const boot = h.bootOf(target, at('#/dhcp?ex=server&level=2&seed=11'), { state: null }, lcg(), saved);
  assert.equal(boot.places.dhcp.exercise, 'server', 'the link names the exercise');
  assert.deepEqual([boot.places.dhcp.server.level, boot.places.dhcp.server.tasks[2].seed], [2, 11]);
  assert.deepEqual(boot.places.dhcp.sides, places.dhcp.sides, 'the rest of the scope is the saved one');
  assert.deepEqual(boot.places.setup, setup, 'other scopes stay');
  assert.deepEqual(boot.instances, saved.instances);
  assert.deepEqual([boot.prefs.syntax, boot.prefs.theme], ['routeros', 'light'], 'a link without a vendor keeps the saved vendor');
  assert.equal(boot.link, true);
  const named = h.bootOf(target, at('#/dhcp?ex=server&level=2&seed=11&syntax=cisco'), { state: null }, lcg(), saved);
  assert.equal(named.prefs.syntax, 'cisco', 'a link\'s vendor wins');
  // VLAN's vendor slots: a link without a vendor decodes into the saved vendor's slot.
  const vlan = section('vlan');
  const vlanPlace = vlan.url.decode({}, { bank: vlan.bank, syntax: 'cisco', places: {}, random: lcg() }).vlan;
  const slot = h.bootOf(target, at('#/vlan?ex=predict&shape=p1&level=0'), { state: null }, lcg(), { ...saved, places: { vlan: vlanPlace } });
  assert.deepEqual(slot.places.vlan.predict['p1|cisco'], vlanPlace.predict['p1|cisco'], 'the other vendor\'s slot is untouched');
});

test('boot: the plain address opens the start screen, with everything saved in the store for the section to find', () => {
  const places = { dhcp: savedPlace({ exercise: 'nat' }) };
  const boot = h.bootOf(target, at(''), { state: null }, lcg(), { prefs: {}, places, instances: {}, saver: null });
  assert.equal(boot.nav.stack.length, 1);
  assert.deepEqual(boot.places, places);
  assert.equal(boot.link, false);
});

test('boot: only the web version reads or writes: the Windows app gets nothing and no saver', () => {
  const store = storage({ [KEY]: blobOf({}), [GEN_KEY]: '3' }, ['getItem', 'setItem', 'removeItem']);
  const off = h.restoreSaved(target, { storage: store, web: false });
  assert.equal(off.saver, null);
  assert.deepEqual([off.prefs, off.places, off.instances], [{}, {}, {}]);
  assert.equal(h.bootOf(target, at(''), { state: null }, lcg()).saver, null, 'a page outside the web build');
});

// ── A failing storage ───────────────────────────────────────────────────────

test('saved: a storage that throws on every call breaks nothing, and nothing is thrown at the page', () => {
  const store = storage({}, ['getItem', 'setItem', 'removeItem']);
  const start = h.restoreSaved(target, { storage: store, web: true });
  assert.deepEqual([start.prefs, start.places, start.instances, start.gen], [{}, {}, {}, 0]);
  const s = h.initialStore();
  start.saver.note(s);
  start.saver.note(h.storeReducer(s, { type: 'pref', name: 'theme', value: 'light' }));
  start.saver.flush();
  start.saver.clear(s.prefs);
  const none = h.restoreSaved(target, { storage: null, web: true });
  none.saver.note(s);
  none.saver.note(h.storeReducer(s, { type: 'pref', name: 'theme', value: 'light' }));
  none.saver.flush();
  none.saver.clear(s.prefs);
});

test('saved: a failed write keeps the older snapshot and saving stops quietly for the session', () => {
  const store = storage();
  const saver = h.createSaver(store);
  let s = h.initialStore();
  saver.note(s);
  s = h.storeReducer(s, { type: 'pref', name: 'theme', value: 'light' });
  saver.note(s);
  saver.flush();
  const older = store.data.get(KEY);
  assert.ok(older.includes('light'));
  store.failing.push('setItem');
  s = h.storeReducer(s, { type: 'pref', name: 'mode', value: 'free' });
  saver.note(s);
  saver.flush();
  assert.equal(store.data.get(KEY), older);
  store.failing.length = 0;
  s = h.storeReducer(s, { type: 'pref', name: 'inputMode', value: 'choose' });
  saver.note(s);
  saver.flush();
  assert.equal(store.data.get(KEY), older, 'stopped, though the storage would work again');
});

// ── Size and eviction ───────────────────────────────────────────────────────

const pad = n => ({ note: 'x'.repeat(n) });
const big = (n, finished) => withView(pad(n), finished ? solved() : h.initialInstance());
const maskKey = seed => JSON.stringify({ exerciseId: 'ip.mask', version: 1, seed, level: 1 });

test('saved: under the cap the blob is written whole; over it the least recently touched unfinished instances go first', () => {
  const instances = { [maskKey(1)]: big(400000), [maskKey(2)]: big(400000), [maskKey(3)]: big(400000), [maskKey(4)]: big(10000, true) };
  const touched = { [maskKey(1)]: 5, [maskKey(2)]: 2, [maskKey(3)]: 9, [maskKey(4)]: 1 };
  const text = h.fitted(h.initialStore({}, {}, instances), touched, 0);
  assert.ok(text.length <= CAP);
  const blob = JSON.parse(text);
  assert.deepEqual(Object.keys(blob.instances).sort(), [maskKey(1), maskKey(3), maskKey(4)].sort(), 'the oldest unfinished went; the older finished stayed');
  assert.deepEqual(blob.done, {});
});

test('saved: then finished instances shrink to their ✓, oldest first, and the ✓ still shows', () => {
  const instances = { [maskKey(1)]: big(600000, true), [maskKey(2)]: big(600000, true), [maskKey(3)]: big(100, false), [maskKey(4)]: big(100, false) };
  const touched = { [maskKey(1)]: 1, [maskKey(2)]: 2, [maskKey(3)]: 0, [maskKey(4)]: 3 };
  const text = h.fitted(h.initialStore({}, {}, instances), touched, 0);
  const blob = JSON.parse(text);
  assert.deepEqual(Object.keys(blob.instances).sort(), [maskKey(2), maskKey(4)], 'the older unfinished one went first, then the older finished shrank');
  assert.deepEqual(blob.done, { [maskKey(1)]: [1, 1, 0, 0] });
  const back = read(text).instances[maskKey(1)];
  assert.deepEqual([back.session.earned.solved, back.session.status, back.answer, back.view], [true, 'working', null, {}], 'a ✓ on an empty task');
});

test('saved: the task in hand outlasts finished work: finished tasks filling the cap can\'t cost the answer being typed', () => {
  const instances = { [maskKey(1)]: big(500000, true), [maskKey(2)]: big(500000, true), [maskKey(3)]: big(100, false) };
  const touched = { [maskKey(1)]: 1, [maskKey(2)]: 2, [maskKey(3)]: 3 };
  const blob = JSON.parse(h.fitted(h.initialStore({}, {}, instances), touched, 0));
  assert.ok(maskKey(3) in blob.instances, 'the only unfinished task is kept whole');
  assert.ok(maskKey(1) in blob.done, 'the oldest finished one shrank instead');
  // Only when it can't fit at all does it go, and the ✓ stay.
  const huge = { [maskKey(1)]: big(100, true), [maskKey(3)]: big(CAP + 10, false) };
  const left = JSON.parse(h.fitted(h.initialStore({}, {}, huge), { [maskKey(1)]: 1, [maskKey(3)]: 3 }, 0));
  assert.deepEqual([Object.keys(left.instances), Object.keys(left.done)], [[], [maskKey(1)]]);
});

test('saved: routing faults\' own ✓ (view.earned) counts as finished and survives the shrinking', () => {
  const { key: k, instance } = exercises['routing-faults'];
  const finished = { ...instance, view: { ...instance.view, earned: true, filler: 'x'.repeat(CAP) } };
  const blob = JSON.parse(h.fitted(h.initialStore({}, {}, { [k]: finished }), {}, 0));
  assert.deepEqual(blob.done[k].slice(1), [0, 0, 1]);
  const back = read(JSON.stringify(blob)).instances[k];
  assert.equal(back.view.earned, true);
});

test('saved: the oldest ✓ go last, and at most 5,000 are kept', () => {
  const many = 14000;
  const instances = {}, touched = {};
  for (let n = 0; n < many; n += 1) { instances[maskKey(n)] = solved(); touched[maskKey(n)] = n + 1; }
  const blob = JSON.parse(h.fitted(h.initialStore({}, {}, instances), touched, 0));
  const done = Object.keys(blob.done);
  assert.equal(done.length, MAX_DONE);
  assert.ok(!(maskKey(0) in blob.done), 'the oldest went');
  assert.ok(maskKey(many - 1) in blob.instances || maskKey(many - 1) in blob.done, 'the newest stayed');
  assert.equal(done.map(k => blob.done[k][0]).sort((a, b) => a - b)[0] > many - Object.keys(blob.instances).length - MAX_DONE - 1, true, 'what stayed is the most recent');
});

test('saved: long keys: the ✓ stop at the cap, whatever their number', () => {
  const key = n => JSON.stringify({ exerciseId: 'ip.mask', version: 1, seed: n, level: 1, padding: 'p'.repeat(400) });
  const instances = {}, touched = {};
  for (let n = 0; n < 4000; n += 1) { instances[key(n)] = solved(); touched[key(n)] = n + 1; }
  const text = h.fitted(h.initialStore({}, {}, instances), touched, 0);
  assert.ok(text.length <= CAP, `${text.length}`);
  const blob = JSON.parse(text);
  assert.ok(!(key(0) in blob.done) && key(3999) in blob.done);
});

test('saved: a blob that can\'t fit even without instances isn\'t written at all', () => {
  const places = { 'ip.calc': { ip: 'x'.repeat(CAP) } };
  assert.equal(h.fitted(h.initialStore({}, places), {}, 0), null);
  const store = storage({ [KEY]: 'older' });
  const saver = h.createSaver(store);
  const s = h.initialStore();
  saver.note(s);
  saver.note(h.initialStore({}, places));
  saver.flush();
  assert.equal(store.data.get(KEY), 'older');
});

// ── When it writes ──────────────────────────────────────────────────────────

test('saved: a change writes once, about 500 ms later; the state a page boots with is not a change', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = storage();
  const saver = h.createSaver(store);
  let s = h.initialStore();
  saver.note(s);
  t.mock.timers.tick(DEBOUNCE_MS * 2);
  assert.equal(store.data.has(KEY), false, 'nothing changed');
  s = h.storeReducer(s, { type: 'pref', name: 'theme', value: 'light' });
  saver.note(s);
  t.mock.timers.tick(DEBOUNCE_MS - 1);
  assert.equal(store.data.has(KEY), false);
  s = h.storeReducer(s, { type: 'pref', name: 'mode', value: 'free' });
  saver.note(s);
  t.mock.timers.tick(DEBOUNCE_MS - 1);
  assert.equal(store.data.has(KEY), false, 'a new change starts the wait again');
  t.mock.timers.tick(1);
  assert.deepEqual(JSON.parse(store.data.get(KEY)).prefs, s.prefs);
});

test('saved: a flush writes the latest state at once and leaves nothing scheduled', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = storage();
  let writes = 0;
  const setItem = store.setItem;
  store.setItem = (...args) => { writes += 1; setItem(...args); };
  const saver = h.createSaver(store);
  let s = h.initialStore();
  saver.note(s);
  s = h.storeReducer(s, { type: 'pref', name: 'theme', value: 'light' });
  saver.note(s);
  saver.flush();
  assert.equal(writes, 1);
  t.mock.timers.tick(DEBOUNCE_MS * 3);
  saver.flush();
  assert.equal(writes, 1, 'no second write');
});

test('saved: instances are stamped when they change, and the stamps come back for the next eviction', () => {
  const store = storage();
  const a = maskKey(1), b = maskKey(2);
  const saver = h.createSaver(store);
  let s = h.initialStore();
  saver.note(s);
  const action = { type: 'view', patch: { submits: 1 } };
  s = h.storeReducer(s, { type: 'instance', key: a, action });
  saver.note(s);
  s = h.storeReducer(s, { type: 'instance', key: b, action });
  saver.note(s);
  s = h.storeReducer(s, { type: 'instance', key: a, action: { type: 'view', patch: { submits: 2 } } });
  saver.note(s);
  saver.flush();
  const back = h.readSaved(target, store);
  assert.ok(back.touched[a] > back.touched[b], 'a was touched last');
  const next = h.createSaver(store, back);
  let t = h.initialStore({}, {}, back.instances);
  next.note(t);
  t = h.storeReducer(t, { type: 'instance', key: b, action: { type: 'view', patch: { submits: 9 } } });
  next.note(t);
  next.flush();
  const again = h.readSaved(target, store);
  assert.ok(again.touched[b] > again.touched[a], 'the clock goes on from the saved stamps');
});

// ── Clearing ────────────────────────────────────────────────────────────────

test('store: «clear» empties instances and places, keeps prefs, and is a no-op on nothing', () => {
  const s = h.initialStore({ theme: 'light' }, { a: { x: 1 } }, { k: h.initialInstance() });
  const cleared = h.storeReducer(s, { type: 'clear' });
  assert.deepEqual(cleared, { prefs: s.prefs, instances: {}, places: {} });
  assert.equal(h.storeReducer(cleared, { type: 'clear' }), cleared);
});

test('reset: a pending write can\'t bring it back; the key goes; a new generation is set', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = storage();
  const saver = h.createSaver(store);
  let s = h.initialStore();
  saver.note(s);
  s = h.storeReducer(s, { type: 'instance', key: maskKey(1), action: { type: 'view', patch: { submits: 1 } } });
  saver.note(s);
  saver.flush();
  assert.ok(store.data.has(KEY));
  s = h.storeReducer(s, { type: 'instance', key: maskKey(2), action: { type: 'view', patch: { submits: 1 } } });
  saver.note(s);
  saver.clear(s.prefs);
  assert.equal(store.data.has(KEY), false, 'default prefs: nothing left to keep');
  assert.equal(store.data.get(GEN_KEY), '1');
  t.mock.timers.tick(DEBOUNCE_MS * 2);
  saver.flush();
  assert.equal(store.data.has(KEY), false, 'the pending write was cancelled');
  saver.note(h.storeReducer(s, { type: 'clear' }));
  t.mock.timers.tick(DEBOUNCE_MS * 2);
  assert.equal(store.data.has(KEY), false, 'the store\'s own change writes nothing back');
});

test('reset: the preferences stay across a reload', () => {
  const store = storage();
  const saver = h.createSaver(store);
  let s = h.initialStore();
  saver.note(s);
  s = h.storeReducer(s, { type: 'pref', name: 'theme', value: 'light' });
  s = h.storeReducer(s, { type: 'instance', key: maskKey(1), action: { type: 'view', patch: { submits: 1 } } });
  saver.note(s);
  saver.flush();
  saver.clear(s.prefs);
  const back = h.readSaved(target, store);
  assert.deepEqual([back.prefs.theme, Object.keys(back.instances).length, Object.keys(back.places).length, back.gen], ['light', 0, 0, 1]);
});

test('reset: another tab\'s write afterwards is refused, and that tab\'s memory is cleared', () => {
  const store = storage();
  const older = h.createSaver(store, h.readSaved(target, store));
  const clearing = h.createSaver(store, h.readSaved(target, store));
  let cleared = 0;
  // attach() needs a page; adopting through a refused write doesn't.
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  let s = h.initialStore();
  let detach;
  try {
    detach = older.attach(() => s, () => { cleared += 1; });
    older.note(s);
    s = h.storeReducer(s, { type: 'instance', key: maskKey(1), action: { type: 'view', patch: { submits: 1 } } });
    older.note(s);
    older.flush();
    assert.ok(store.data.has(KEY), 'written before the reset');
    clearing.note(h.initialStore());
    clearing.clear(h.initialStore().prefs);
    assert.equal(store.data.has(KEY), false);
    s = h.storeReducer(s, { type: 'instance', key: maskKey(1), action: { type: 'view', patch: { submits: 2 } } });
    older.note(s);
    older.flush();
    assert.equal(store.data.has(KEY), false, 'the older generation\'s write is refused');
    assert.equal(cleared, 1, 'and it learns of the reset');
  } finally {
    detach?.();
    delete globalThis.document;
    delete globalThis.window;
  }
});

test('reset: a `storage` event with a newer generation clears that tab; other keys and older numbers don\'t', () => {
  const store = storage();
  const saver = h.createSaver(store, { gen: 2 });
  const listeners = {};
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = { addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {} };
  let cleared = 0;
  const s = h.initialStore();
  let detach;
  try {
    detach = saver.attach(() => s, () => { cleared += 1; });
    listeners.storage({ key: KEY, newValue: 'x' });
    listeners.storage({ key: GEN_KEY, newValue: '2' });
    listeners.storage({ key: GEN_KEY, newValue: 'junk' });
    listeners.storage({ key: null, newValue: null });
    assert.equal(cleared, 0);
    listeners.storage({ key: GEN_KEY, newValue: '3' });
    assert.equal(cleared, 1);
    listeners.storage({ key: GEN_KEY, newValue: '3' });
    assert.equal(cleared, 1, 'once');
  } finally {
    detach?.();
    delete globalThis.document;
    delete globalThis.window;
  }
});

test('reset: a blob older than the generation is ignored (a write that slipped past the reset)', () => {
  const { key: k, instance } = exercises['dhcp-sides'];
  assert.equal(key(read(blobOf({ [k]: instance }, { gen: 2 }), 3).instances), '');
  const newer = read(blobOf({ [k]: instance }, { gen: 3 }), 3);
  assert.equal(key(newer.instances), k);
  assert.equal(newer.gen, 3);
});
