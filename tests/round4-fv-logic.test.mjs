import test from 'node:test';
import assert from 'node:assert/strict';
import { chainRecords, chainCards, validateChainBank, records, resolveRecord, topology } from '../src/banks/firewall/tasks.js';
import * as FW from '../src/sections/firewall/logic/predict.js';
import { classify } from '../src/sections/firewall/logic/classify.js';
import { evaluate as evaluateFW } from '../src/sections/firewall/logic/evaluate.js';
import { firewallLeaks } from './helpers/firewall-leaks.mjs';
import { prepareAnalysis } from '../src/sections/firewall/logic/universe.js';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';
import { create as createOrder, prepareOrder } from '../src/sections/firewall/logic/order.js';
import { t as fwText, chainText, comprehension, orderText } from '../src/sections/firewall/uk.js';
import { record as predictRecord } from '../src/banks/vlan/predict.js';
import { records as portsRecords } from '../src/banks/vlan/ports.js';
import { records as routeRecords } from '../src/banks/vlan/route.js';
import { record as faultsRecord } from '../src/banks/vlan/faults.js';
import * as VP from '../src/sections/vlan/logic/predict.js';
import * as Ports from '../src/sections/vlan/logic/ports.js';
import * as Route from '../src/sections/vlan/logic/route.js';
import * as Faults from '../src/sections/vlan/logic/faults-exercise.js';
import { catalogue } from '../src/sections/vlan/logic/faults.js';
import { compileAll, hostPort, label } from '../src/sections/vlan/logic/model.js';
import { causeText, repairText, faultText, t } from '../src/sections/vlan/uk.js';
import { sessionReducer, initialSession } from '../src/ui/session.js';

const chainRecord = resolveRecord(chainRecords[0]);
const combined = { ...resolveRecord(records[0]), variants: [...chainRecord.variants, ...resolveRecord(records[0]).variants] };
const clone = structuredClone;

test('F1: independently validated chain bank, exact request/reply pairing and full safe policy over 200 seeds', () => {
  assert.deepEqual(validateChainBank(), []);
  assert.deepEqual(FW.validateRecord(chainRecord), []);
  for (let seed = 0; seed < 200; seed++) {
    const task = FW.create(combined, { variantId: 'chain', level: 1, seed });
    assert.deepEqual(task, FW.create(combined, { level: 1, seed }));
    assert.equal(task.identity.level, 1);
    assert.equal(task.policy.rules.length, 9);
    const [local, request, reply] = chainCards.map(c => task.cards.find(card => card.id === c.id));
    assert.equal(classify(task.topology, local).hook, 'input');
    assert.deepEqual(request.packet, { srcIp: '192.168.88.10', dstIp: '203.0.113.50', protocol: 'tcp', srcPort: 50000, dstPort: 443 });
    assert.deepEqual(reply.packet, { srcIp: '203.0.113.50', dstIp: '192.168.88.10', protocol: 'tcp', srcPort: 443, dstPort: 50000 });
    assert.equal(request.facts.state, 'new'); assert.equal(reply.facts.state, 'established');
    for (const c of [request, reply]) {
      const context = classify(task.topology, c);
      assert.equal(context.hook, 'forward'); assert.equal(evaluateFW(task.policy, c, context).verdict, 'accept');
    }
    assert.deepEqual(FW.solution(task), Object.fromEntries(task.cards.map(c => [c.id, { hook: c.id === local.id ? 'input' : 'forward' }])));
    assert.deepEqual(firewallLeaks(task), []);
  }
  for (const mutate of [
    r => r.variants[0].cards.pop(),
    r => r.variants[0].cards[2].packet.dstPort++,
    r => r.variants[0].cards[2].packet.srcIp = '203.0.113.60',
    r => r.variants[0].cards[2].facts.state = 'new',
    r => r.variants[0].policy.rules.splice(0, 6),
  ]) {
    const bad = clone(chainRecord); mutate(bad);
    assert.ok(FW.validateRecord(bad).length); assert.throws(() => FW.create(bad, { level: 1 }), /invalid-record/);
  }
  const badCards = clone(chainCards); badCards[1].unexpected = true;
  assert.ok(validateChainBank(chainRecords, badCards).length);
  assert.ok(validateChainBank(null).length);
  assert.ok(validateChainBank(chainRecords, [null]).length);
  for (const opts of [{ level: 3 }, { level: 1, variantId: 'basic' }, { level: 2, variantId: 'chain' }]) assert.throws(() => FW.create(combined, opts), /invalid-record/);
});

test('F1: wrong level-1 choice locks exactly once; evidence has only the checked chain', () => {
  const task = FW.create(chainRecord, { level: 1, seed: 'commit' }), first = task.cards[0];
  const initial = FW.initialCommitState(task);
  const wrong = FW.commit(task, initial, first.id, { hook: 'forward' });
  assert.equal(wrong.result.code, 'wrong-door'); assert.equal(wrong.result.complete, false);
  assert.deepEqual(wrong.result.evidence, { [first.id]: { hook: 'input' } });
  assert.equal(FW.commit(task, wrong, first.id, { hook: 'input' }), wrong);
  assert.throws(() => FW.commit(task, initial, first.id, { hook: 'input', decidedBy: 'r4' }), /invalid-selection/);
  let state = wrong;
  for (const c of task.cards.slice(1)) state = FW.commit(task, state, c.id, { hook: 'forward' });
  assert.equal(state.result.complete, true); assert.equal(state.result.ok, false);
  assert.deepEqual(FW.check(task, FW.solution(task)).findings, []);
  assert.deepEqual(FW.hints(task).map(h => h.rung), [1, 2, 3]);
  const hint = FW.hints(task)[2];
  assert.match(chainText(hint.code, hint.params), /У цьому завданні.*192\.168\.88\.1.*203\.0\.113\.50/);
});

test('F1: level-2 hook retries disclose no rule evidence, consume no attempt/hint, survive JSON drafts, and retain earning', () => {
  const task = FW.create(combined, { level: 2, variantId: 'basic', seed: 1 });
  assert.equal(task.identity.level, 2);
  const card = task.cards.find(c => classify(task.topology, c).hook === 'input');
  const initial = FW.initialCommitState(task), before = clone(initial);
  const retry = FW.checkHook(task, card.id, { hook: 'forward' });
  assert.deepEqual(retry, { ok: false, code: 'hook-retry-input', assisted: true, params: {} });
  assert.match(fwText(retry.code), /самому роутеру → input/);
  assert.deepEqual(initial, before);
  let session = sessionReducer(initialSession(), { type: 'assist' });
  assert.equal(session.attempts, 0); assert.equal(session.hintIndex, 0);
  const draft = JSON.parse(JSON.stringify({ [card.id]: { hook: 'input' } }));
  assert.deepEqual(FW.checkHook(task, card.id, draft[card.id]), { ok: true, code: 'hook-ok', assisted: false, params: {} });
  assert.deepEqual(initial.answer, {});
  const answer = FW.solution(task), result = FW.check(task, answer);
  session = sessionReducer(session, { type: 'check', result });
  assert.equal(session.earned.solved, true); assert.equal(session.assisted, true);
  assert.ok(Object.values(answer).some(a => a.decidedBy === 'chain-end:forward'));
  for (const a of Object.values(answer)) assert.deepEqual(Object.keys(a), ['hook', 'decidedBy']);
  for (const selection of [null, { hook: 'output' }, { hook: 'input', decidedBy: 'r4' }]) {
    assert.deepEqual(FW.checkHook(task, card.id, selection), { ok: false, code: 'invalid-selection', assisted: false, params: {} });
  }
  assert.equal(FW.checkHook(task, 'missing', { hook: 'input' }).code, 'invalid-selection');
  // Round 5 (5b-2 B): the walk's slow-path words (comprehension.fasttrackIntro) keep the qualification.
  assert.match(comprehension.fasttrackIntro, /повільному шляху.*деякі пакети.*повільним шляхом.*accept/);
});

const orderTask = () => {
  const record = resolveOrderRecord(), task = createOrder(record, { variantId: 'all', seed: 'f2' });
  const prepared = prepareOrder(task, record);
  const ruleId = code => task.rules.find(r => r.descriptionCode === `rule.${code}`).id;
  return { task, prepared, ruleId };
};
const before = (order, a, b) => { order.splice(order.indexOf(a), 1); order.splice(order.indexOf(b), 0, a); };

test('F2: full filter prioritises a forward failure and preserves the original finding when forward works', () => {
  const { task, prepared: p, ruleId: r } = orderTask();
  const fallback = p.solution().order;
  before(fallback, r('input-icmp'), r('input-invalid'));
  const result = p.check({ order: fallback });
  assert.equal(result.feedback.card.id, 'wan-invalid-icmp');
  assert.equal(classify(task.topology, result.feedback.card).hook, 'input');
  const both = [...fallback]; before(both, r('forward-replies'), r('forward-fasttrack'));
  const forward = p.check({ order: both }).feedback;
  assert.equal(forward.code, 'order-dead');
  assert.equal(task.rules.find(r => r.id === forward.ruleId).chain, 'forward');
  assert.equal(forward.ruleId, r('forward-fasttrack'));
  assert.equal(forward.blockerId, r('forward-replies'));
  assert.match(task.text, /Проброс порту: 100\.64\.0\.2:443 → Сервер:443/);
});

test('F2: analyzer can prefer a forward outcome difference without changing its legacy default/fallback', () => {
  const rule = (id, chain, action, match) => ({ id, chain, action, match, enabled: true });
  const rules = ['input', 'forward'].flatMap(hook => [
    rule(`${hook}-rest`, hook, 'drop', {}),
    rule(`${hook}-icmp`, hook, 'accept', { protocol: { values: ['icmp'], not: false } }),
  ]);
  const policy = { id: 'home-basic', rules }, order = [rules[1].id, rules[0].id, rules[3].id, rules[2].id];
  const legacy = prepareAnalysis(policy, topology), preferred = prepareAnalysis(policy, topology, [], { preferForward: true });
  assert.equal(classify(topology, legacy.analyze(order).difference.card).hook, 'input');
  const difference = preferred.analyze(order).difference;
  assert.equal(classify(topology, difference.card).hook, 'forward');
  assert.deepEqual([difference.expected, difference.actual], ['drop', 'accept']);
  const inputOnly = [rules[1].id, rules[0].id, rules[2].id, rules[3].id];
  assert.deepEqual(preferred.analyze(inputOnly).difference, legacy.analyze(inputOnly).difference);
});

test('F2: shadowing names and marks both rules with current list positions, separate from wrong outcome', () => {
  const { prepared: p, ruleId: r } = orderTask(), order = p.solution().order;
  before(order, r('forward-replies'), r('forward-fasttrack'));
  const feedback = p.check({ order }).feedback;
  assert.equal(feedback.code, 'order-dead');
  assert.deepEqual(feedback.ruleIds, [r('forward-fasttrack'), r('forward-replies')]);
  assert.equal(feedback.shadow.ruleNumber, order.indexOf(r('forward-fasttrack')) + 1);
  assert.equal(feedback.shadow.blockerNumber, order.indexOf(r('forward-replies')) + 1);
  assert.equal(feedback.shadow.ruleDescriptionCode, 'rule.forward-fasttrack');
  assert.match(orderText('order-shadowed', { ...feedback.shadow, rule: 'FastTrack', blocker: 'Відповіді' }), /Відповіді.*пропустило пакет раніше.*FastTrack.*не побачило/);
  assert.equal('expected' in feedback, false); assert.equal('actual' in feedback, false);
});

for (const vendor of ['cisco', 'routeros']) for (const surprises of [0, 1, 2]) test(`F3: each shape has misleading IP numbering at level ${surprises}/${vendor}, broadcast answers stay independent`, () => {
  for (const variantId of ['p1', 'p2', 'p3']) {
    const task = VP.create(predictRecord, { vendor, surprises, variantId, seed: 0 });
    assert.equal(task.identity.generatorVersion, 2);
    const { tables } = compileAll(task.topology, task.configurations, vendor);
    assert.ok(task.topology.hosts.some(h => {
      const p = hostPort(task.topology, h.device);
      return Number(h.ip.split('.')[2]) !== tables[p.device].ports[p.port].pvid;
    }));
    const altered = clone(task); altered.topology.hosts.forEach((h, i) => { h.ip = `10.0.${i}.2`; });
    assert.deepEqual(VP.solution(task), VP.solution(altered));
    if (variantId === 'p2') {
      const device = task.topology.devices.find(d => d.id === 'SW1');
      assert.deepEqual(VP.orderedPorts(device, vendor).map(p => p.label[vendor]), vendor === 'cisco'
        ? ['fa0/1', 'fa0/3', 'fa0/5', 'gi0/1'] : ['ether1', 'ether2', 'ether4', 'ether6']);
    }
    for (const commands of Object.values(VP.render(task))) {
      const names = [...commands.matchAll(vendor === 'cisco' ? /^interface (\S+)$/gm : /^\/interface bridge port add .*?interface=(\S+)/gm)].map(m => m[1]);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    }
  }
});

for (const syntax of ['cisco', 'routeros']) test(`F4: port captions name their PC and hint 2 gives the move from public goals/${syntax}`, () => {
  const task = Ports.create(portsRecords[1], { syntax, seed: 0 }), end = hostPort(task.topology, 'PC1');
  assert.equal(Ports.portCaption(task.topology, end.device, end.port, syntax), `${label(task.topology, end.device, end.port, syntax)} — PC1`);
  assert.equal(Ports.portCaption(task.topology, 'SW1', 't1', syntax), syntax === 'cisco' ? 'gi0/1' : 'ether1');
  const hint = Ports.hints(task, Ports.initialAnswer(task))[1];
  assert.equal(hint.code, 'hint-port-move');
  assert.equal(hint.params.vid, task.goals[hint.params.host]);
  assert.match(t(hint.code, hint.params), syntax === 'cisco' ? /постав access і VLAN/ : /постав PVID.*untagged-членство/);
  assert.notEqual(t(hint.code, hint.params), t(hint.params.reason));
});

for (const syntax of ['cisco', 'routeros']) test(`F5: task 2 verdict location names the actual access port and submitted VLAN/${syntax}`, () => {
  const task = Route.create(routeRecords[1], { syntax, seed: 0 }), answer = Route.solution(task);
  const end = hostPort(task.topology, 'PC1');
  if (syntax === 'cisco') answer[end.device].ports[end.port].vlan = task.vids[1];
  else {
    answer[end.device].ports[end.port].pvid = task.vids[1];
    for (const row of answer[end.device].vlans) row.untagged = row.untagged.filter(p => p !== end.port);
    answer[end.device].vlans.find(row => row.vids.includes(task.vids[1])).untagged.push(end.port);
  }
  const result = Route.check(task, answer), location = result.findings[0].params.location;
  assert.equal(result.ok, false);
  assert.deepEqual(location, { device: end.device, portId: end.port, port: label(task.topology, end.device, end.port, syntax), host: 'PC1', vid: task.vids[1] });
  assert.equal(t('route-port-location', location), `Дивись ${end.device}, порт ${location.port}: PC1 у VLAN ${task.vids[1]}.`);
  const compiled = Route.compile(task, answer), snapshot = clone(compiled);
  Route.evaluate(task, compiled, { answer, syntax });
  assert.deepEqual(compiled, snapshot, 'adding verdict location must not mutate compiled evidence');
  const badForm = Route.solution(task);
  if (syntax === 'cisco') badForm.R1.subifs[0].vid = null;
  else badForm.R1.vlanIfs[0].vid = null;
  const formResult = Route.check(task, badForm);
  assert.equal(formResult.ok, false);
  assert.equal(formResult.findings[0].params.location.device, 'R1');
  assert.equal(formResult.findings[0].params.location.portId, 'r');
});

for (const vendor of ['cisco', 'routeros']) test(`F6: exact vendor coverage and platform-specific cause and repair text/${vendor}`, () => {
  const supported = catalogue.filter(c => c.vendors.includes(vendor)).map(c => c.code).sort();
  assert.deepEqual(Object.keys(causeText[vendor]).sort(), supported);
  assert.deepEqual(Object.keys(repairText[vendor]).sort(), supported);
  for (const code of supported) {
    for (const words of [causeText[vendor][code], repairText[vendor][code]]) {
      assert.equal(typeof words, 'string'); assert.ok(words.length > 15);
      assert.doesNotMatch(words, vendor === 'cisco' ? /tagged|PVID|bridge/i : /switchport|allowed/i);
    }
    assert.equal(faultText.repair(code, vendor), repairText[vendor][code]);
    assert.equal(catalogue.find(c => c.code === code).text[vendor], causeText[vendor][code]);
  }
  assert.match(causeText[vendor]['wrong-encapsulation'], vendor === 'cisco' ? /підінтерфейсі/ : /VLAN-інтерфейсі/);
  assert.match(repairText[vendor]['trunk-missing-vlan'], vendor === 'cisco' ? /списку дозволених VLAN/ : /tagged/);
  assert.match(repairText[vendor]['access-wrong-vlan'], vendor === 'cisco' ? /VLAN доступу/ : /PVID.*untagged/);
});

for (const vendor of ['cisco', 'routeros']) test(`F6: JSON restore retains repairs, cause, evidence and repair-before-cause checks/${vendor}`, () => {
  const task = Faults.create(faultsRecord, { vendor, level: 1, seed: 'restore-r4' });
  const restoredTask = JSON.parse(JSON.stringify(task)), initial = Faults.initialAnswer(task);
  const solution = Faults.solution(task);
  assert.deepEqual(Faults.solution(restoredTask), solution);
  const answer = JSON.parse(JSON.stringify({ cause: null, configuration: solution.configuration }));
  const missing = Faults.check(restoredTask, answer);
  assert.equal(missing.code, 'fault-cause-required');
  assert.equal(t(missing.code), 'Мережа працює. Залиш ці зміни й обери, що було зламано.');
  const cause = Faults.options(task, 'cause').find(o => o.value !== solution.cause).value;
  const wrong = Faults.check(restoredTask, { ...answer, cause });
  assert.equal(wrong.code, 'fault-cause-other');
  assert.equal(t(wrong.code), 'Ремонт правильний — залиш його. Причина була інша.');
  assert.deepEqual(wrong.evidence.grid, missing.evidence.grid);
  assert.equal(Faults.check(restoredTask, { ...answer, cause: solution.cause }).ok, true);
  // Editing after a pass: a failing repair takes precedence over even a correct saved cause.
  const edited = { cause: solution.cause, configuration: initial.configuration };
  assert.deepEqual(Faults.check(task, edited), Faults.check(restoredTask, edited));
  assert.equal(Faults.check(restoredTask, edited).ok, false);
  assert.notEqual(Faults.check(restoredTask, edited).code, 'fault-cause-other');
  assert.ok(missing.evidence.grid.isolation.length > 0);
});

test('round 4 repair (Fable 4): «FastTrack only marks» only when the chosen FastTrack rule matched; otherwise an ordinary wrong verdict', () => {
  const record = resolveRecord(records[0]);
  const seen = { marked: 0, unmatched: 0 };
  for (let seed = 1; seed < 40; seed++) {
    const task = FW.create(record, { variantId: 'basic', seed });
    const ft = task.policy.rules.find(r => r.action === 'fasttrack-connection');
    for (const card of task.cards) {
      const walk = evaluateFW(task.policy, card, classify(task.topology, card));
      if (walk.hook !== ft.chain) continue;
      const code = FW.check(task, { [card.id]: { hook: walk.hook, decidedBy: ft.id } }).findings[0]?.code;
      const marked = walk.steps.some(s => s.ruleId === ft.id && s.outcome === 'marked');
      if (marked) { seen.marked++; assert.equal(code, 'fasttrack-not-final', card.id); }
      else { seen.unmatched++; assert.equal(code, 'wrong-verdict', card.id); }
    }
  }
  assert.ok(seen.marked > 0 && seen.unmatched > 0, JSON.stringify(seen));
});
