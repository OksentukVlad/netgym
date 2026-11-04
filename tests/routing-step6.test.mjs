import { withReadOnlyLogic } from './helpers/read-only-logic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { hints, presentCheck, describeTrace } from './helpers/routing.mjs';
import { guidedView, putRoute, slotDestination } from '../src/sections/routing/logic/routes.js';
import { validateRoute } from '../src/engine/route-validation.js';
import { unknownSpace, coverSpace } from '../src/engine/coverage.js';
import { lookup, addressOf } from '../src/engine/forward.js';
import { overlaps } from '../src/engine/ip.js';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { t, hintQuestions } from '../src/sections/routing/uk.js';
import { initialInstance, instanceReducer, readInstance, scoreOf } from '../src/ui/exercise-state.js';
import { initialSession, sessionReducer } from '../src/ui/session.js';
import { createLeakSweep, leaks } from './helpers/routing-leaks.mjs';

const inspectLeaks = createLeakSweep();


const setup = (n, variantId) => { const task = routing.create(structuredClone(tasks[n - 1]), { variantId }); return { task, answer: routing.solution(task) }; };
const fail = (result, type) => result.evidence.objectives.find(o => o.params.type === type && !o.ok);

test('collective /25 halves cover a /24 without requiring a host at the sample', () => {
  const { task, answer } = setup(1);
  answer.R1 = [0, 128].map(n => ({ dst: `192.168.2.${n}`, prefix: 25, via: answer.R1[0].via }));
  answer.R2 = [0, 128].map(n => ({ dst: `192.168.1.${n}`, prefix: 25, via: answer.R2[0].via }));
  assert.equal(routing.check(task, answer).ok, true);
  answer.R1 = [{ dst: '192.168.2.2', prefix: 32, via: answer.R1[0].via }];
  const missing = fail(routing.check(task, answer), 'coverage').params.missing;
  assert.equal(missing.reduce((sum, m) => sum + m.size, 0), 255);
  assert.ok(missing.every(m => !('dst' in m)));
});

test('coverage partitions recursively at a later router, in both directions', () => {
  const { task, answer } = setup(4);
  const route = answer.R2.find(r => r.dst === '192.168.3.0');
  answer.R2 = answer.R2.filter(r => r !== route).concat([0, 128].map(n => ({ ...route, id: `half-${n}`, dst: `192.168.3.${n}`, prefix: 25 })));
  assert.equal(routing.check(task, answer).ok, true);
  answer.R2.find(r => r.id === 'half-128').via = answer.R2.find(r => r.dst === '192.168.1.0').via;
  const result = routing.check(task, answer);
  assert.ok(result.evidence.probes.every(p => p.ok));
  const missing = fail(result, 'coverage').params.missing;
  assert.ok(missing.some(m => m.deviceId === 'R2' && m.size === 128));
});

test('internet coverage rejects /32 and accepts a pair of /1 routes', () => {
  const { task, answer } = setup(2);
  const route = answer.R2[0];
  answer.R2 = [{ ...route, dst: '198.19.255.254', prefix: 32 }, { ...route, id: 'lan', dst: '10.20.0.0', prefix: 24 }];
  const result = routing.check(task, answer);
  assert.ok(result.evidence.probes.every(p => p.ok));
  assert.equal(result.code, 'internet-coverage-missing');
  assert.equal(presentCheck(task, result).repairRouter, 'R2');
  answer.R2 = [{ ...route, dst: '0.0.0.0', prefix: 1 }, { ...route, id: 'half', dst: '128.0.0.0', prefix: 1 }];
  assert.equal(routing.check(task, answer).ok, true);
  assert.ok(unknownSpace(task.network).every(([a, b]) => a < b));
});

test('internet coverage follows later-hop exceptions and ignores provider routing', () => {
  const { task, answer } = setup(5);
  answer.R2.push({ dst: '8.0.0.0', prefix: 8, via: answer.R2.find(r => r.prefix === 24).via });
  assert.ok(fail(routing.check(task, answer), 'internet-coverage'));
  const { task: t2, answer: a2 } = setup(2);
  assert.deepEqual(coverSpace(t2.network, a2, 'ISP', [[0, 2 ** 32]], { internet: true }), []);
});

test('supplied DHCP plus a student default reports supplied ECMP', () => {
  const { task, answer } = setup(2);
  answer.R1.push({ dst: '0.0.0.0', prefix: 0, via: answer.R1[0].via });
  // Different valid next hop competes with the DHCP default at the same prefix/distance.
  const result = routing.check(task, answer);
  assert.equal(result.code, 'unsupported-ecmp');
  const view = presentCheck(task, result);
  assert.equal(view.firstFailure.params.supplied, true);
  assert.match(view.strip, /DHCP/);
});

test('task 15 primary 5 and backup 10 pass; equal, reversed and missing legs fail', () => {
  const { task, answer } = setup(15);
  answer.R1[0].distance = 5; answer.R1[1].distance = 10;
  assert.equal(routing.check(task, answer).ok, true);
  answer.R1[1].distance = 5;
  assert.equal(routing.check(task, answer).code, 'unsupported-ecmp');
  answer.R1[1].distance = 2;
  const reversed = routing.check(task, answer);
  assert.equal(fail(reversed, 'distance-order').code, 'distance-order');
  assert.equal(presentCheck(task, reversed).repairRouter, 'R1');
  answer.R1 = [answer.R1[1]];
  assert.equal(routing.check(task, answer).code, 'wrong-path');
  answer.R1 = [{ dst: '0.0.0.0', prefix: 0, via: '1.1.1.1' }];
  assert.equal(routing.check(task, answer).code, 'no-route');
});

test('summary distinguishes separate and too-wide; task 14 stays advice', () => {
  for (const n of [6, 13, 16]) {
    const { task, answer } = setup(n);
    const objective = task.variant.objectives.find(o => o.type === 'summary');
    const router = objective.routerId, route = answer[router].find(r => r.dst === objective.dst && r.prefix === objective.prefix);
    answer[router] = answer[router].filter(r => r !== route).concat(objective.destinations.map((p, i) => ({ ...route, ...p, id: `specific-${i}` })));
    assert.equal(fail(routing.check(task, answer), 'summary').params.reason, 'separate');
    answer[router] = answer[router].filter(r => !r.id.startsWith('specific-')).concat({ ...route, dst: '0.0.0.0', prefix: 0 });
    assert.equal(fail(routing.check(task, answer), 'summary').params.reason, 'too-wide');
  }
  const { task, answer } = setup(14), objective = task.variant.objectives.find(o => o.type === 'summary');
  const route = answer['R-HQ'][0];
  answer['R-HQ'] = objective.destinations.map((p, i) => ({ ...route, ...p, id: `specific-${i}` })).concat(answer['R-HQ'].slice(1));
  assert.equal(routing.check(task, answer).ok, true);
  assert.ok(routing.check(task, answer).evidence.advice.some(a => a.code === 'could-summarise'));
});

test('generic default advice counts all neighbours and suppresses no-default/defaults', () => {
  for (const [n, expected] of [[4, ['R1', 'R3']], [9, []], [16, []]]) {
    const { task, answer } = setup(n);
    const advice = routing.check(task, answer).evidence.advice.filter(a => a.code === 'could-use-default');
    assert.deepEqual(advice.map(a => a.params.routerId), expected);
  }
  const { task, answer } = setup(8, 'specific');
  assert.ok(!routing.check(task, answer).evidence.advice.some(a => a.code === 'could-use-default'));
});

test('each guided destination is a probe obligation, including summary members and both default roles', () => {
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id }), answer = routing.solution(task), result = routing.check(task, answer);
    for (const [router, rows] of Object.entries(variant.scaffold)) for (const [index, row] of rows.entries()) {
      if (row.discard === true) {
        assert.ok(result.evidence.demonstrations.some(p => p.request.stop?.code === 'discarded' && p.request.stop.routeId === variant.referenceRoutes[router][index].id), 'discard row teaches the demonstrated safe drop');
        continue;
      }
      const destinations = row.dest.kind === 'summary' ? row.dest.segments.map(id => slotDestination(task, { dest: { kind: 'lan', segments: [id] } })) : [slotDestination(task, row)];
      for (const dst of destinations) {
        const found = result.evidence.probes.some(probe => ['request', 'reply'].some(direction => probe[direction]?.hops.some(hop => {
          if (hop.deviceId !== router || !hop.routeId) return false;
          const definition = record.probes.find(p => p.id === probe.id), target = definition.coverage[direction === 'request' ? 'to' : 'from'];
          const selected = lookup(task.network, answer, router, addressOf(task.network, direction === 'request' ? definition.to : definition.from), { downLinks: record.scenarios.find(s => s.id === probe.scenarioId)?.downLinks });
          if (row.dest.kind === 'default') return selected?.prefix === 0 && (!row.role || selected.id === variant.referenceRoutes[router][index].id);
          return selected && target && overlaps(target.dst, target.prefix, dst.dst, dst.prefix) && overlaps(selected.dst, selected.prefix, dst.dst, dst.prefix);
        })));
        assert.ok(found, `${variant.code}/${router}/${index}/${dst.dst}`);
      }
    }
  }
});

test('slot binding preserves lifetime IDs, duplicate default slots, edits and extras', () => {
  const { task, answer } = setup(15);
  const second = { ...answer.R1[1], id: 'R1.f8', slot: 'R1.row2' };
  const first = { ...answer.R1[0], id: 'R1.f4', slot: 'R1.row1' };
  let rows = { R1: [second, first, { ...second, id: 'R1.f9', slot: undefined }] };
  let view = guidedView(task, rows).R1;
  assert.deepEqual(view.slots.map(s => s.route.id), ['R1.f4', 'R1.f8']);
  assert.equal(view.extras[0].id, 'R1.f9');
  rows = putRoute(task, rows, 'R1', { ...second, dst: '198.51.100.0', prefix: 24 });
  assert.equal(rows.R1[0].id, 'R1.f8'); assert.equal(rows.R1[0].slot, undefined);
  assert.equal(guidedView(task, rows).R1.extras[0].id, 'R1.f8');
  const back = putRoute(task, rows, 'R1', { ...second }, { slot: 'R1.row2' });
  assert.equal(guidedView(task, back).R1.slots[1].route.id, 'R1.f8');
  const { task: t1, answer: a1 } = setup(1);
  assert.equal(guidedView(t1, { R1: [{ ...a1.R1[0], id: undefined }], R2: [null] }).R1.slots[0].route.dst, a1.R1[0].dst);
});

test('row-checked records canonical route and verdict without attempts or completion; deletion drops every draft', () => {
  let s = initialInstance();
  for (const mode of ['guided', 'free']) for (const syntax of ['cisco', 'routeros']) s = instanceReducer(s, { type: 'draft', mode, syntax, routeId: 'R1.f1', value: { gw: 'unfinished' } });
  s = instanceReducer(s, { type: 'row-checked', routerId: 'R1', route: { id: 'R1.f1', dst: '0.0.0.0', prefix: 0, via: '1.1.1.1' }, slot: 'R1.row2', part: 'R1.row2', partResult: { ok: true } });
  assert.deepEqual(s.session, initialSession()); assert.equal(s.presses, 0); assert.equal(s.result, null);
  assert.deepEqual(s.parts['R1.row2'], { ok: true, routeId: 'R1.f1' });
  assert.ok(!JSON.stringify(s.drafts).includes('unfinished'));
  s = instanceReducer(s, { type: 'draft', mode: 'free', syntax: 'cisco', routeId: 'R1.f1', value: { net: 'x' } });
  s = instanceReducer(s, { type: 'route-deleted', routeId: 'R1.f1' });
  assert.deepEqual(s.answer.R1, []); assert.equal(s.parts['R1.row2'], undefined); assert.ok(!JSON.stringify(s.drafts).includes('R1.f1'));
  s = instanceReducer(s, { type: 'route-upsert', routerId: 'R1', route: {} });
  assert.equal(s.answer.R1[0].id, 'R1.f2');
});

test('earned survives failure and reveal; reveal before success disqualifies; score groups variants', () => {
  const yes = { ok: true, complete: true }, no = { ok: false, complete: false };
  let s = sessionReducer(initialSession(), { type: 'hint' });
  s = sessionReducer(s, { type: 'check', result: yes });
  assert.deepEqual(s.earned, { solved: true, assisted: true });
  s = sessionReducer(s, { type: 'check', result: no });
  assert.equal(s.status, 'working'); assert.equal(s.earned.solved, true);
  s = sessionReducer(s, { type: 'reveal' }); assert.equal(s.earned.solved, true);
  let revealed = sessionReducer(initialSession(), { type: 'reveal' });
  revealed = sessionReducer(revealed, { type: 'check', result: yes });
  assert.equal(revealed.earned.solved, false);
  assert.deepEqual(scoreOf([{ taskId: '3', session: s, presses: 2 }, { taskId: '3', session: s, presses: 1 }]), { correct: 1, total: 16, presses: 3 });
  assert.equal(sessionReducer(s, { type: 'clear' }).earned.solved, false);
});

test('old null slots and completion are ignored on read; hint index clamps at three', () => {
  const s = readInstance({ ...initialInstance(), answer: { R1: [null, { id: 'a' }, null] }, completion: { ok: true }, session: { ...initialSession(), hintIndex: 100 } });
  assert.deepEqual(s.answer.R1, [{ id: 'a' }]); assert.equal(s.completion, null); assert.equal(s.session.hintIndex, 3);
  assert.equal(sessionReducer(s.session, { type: 'hint' }).hintIndex, 3);
});

test('two-layer validation accepts any form-valid route and rejects field/topology errors', () => {
  const { task } = setup(1);
  for (const syntax of syntaxList) {
    const fields = syntax.fromRoute({ dst: '192.168.2.1', prefix: 24, via: '10.0.0.2' });
    assert.equal(syntax.validateFields(fields), null);
    assert.equal(validateRoute(task.network, 'R1', syntax.toRoute(fields)), 'dst-not-network');
    assert.equal(syntax.validateFields({}), 'empty');
    assert.equal(syntax.validateFields({ ...fields, gw: 'oops' }), 'invalid-ip');
    for (const dist of ['0', '256', '1.5', 'x']) assert.equal(syntax.validateFields({ ...fields, dist }), 'invalid-distance');
  }
  const c = syntaxList[0];
  assert.equal(c.validateFields({ net: '1.2.3.0', mask: '/24', gw: '1.2.3.1' }), 'mask-not-dotted');
  assert.equal(c.validateFields({ net: '1.2.3.0', mask: '255.0.255.0', gw: '1.2.3.1' }), 'invalid-mask');
  assert.equal(syntaxList[1].validateFields({ dst: '1.2.3.0/33', gw: '1.2.3.1' }), 'invalid-prefix');
  for (const [via, code] of [['10.0.0.1', 'gateway-is-self'], ['203.0.113.2', 'gateway-off-link'], ['10.0.0.0', 'gateway-not-host'], ['192.168.1.50', 'gateway-not-router'], ['10.0.0.2', null]]) assert.equal(validateRoute(task.network, 'R1', { dst: '192.168.2.0', prefix: 24, via }), code);
});

test('presentation attaches coverage/path objectives, uses reply trace, and never shows all pass on failure', () => {
  for (const n of [1, 2, 6, 13, 15, 16]) {
    const { task, answer } = setup(n);
    const before = structuredClone(task);
    for (const a of [{}, answer]) for (const syntax of syntaxList) {
      const result = routing.check(task, a), view = presentCheck(task, result, syntax.id);
      if (!result.ok) assert.ok(view.lines.some(l => l.status === 'fail'));
      assert.equal(view.ok, result.ok);
      assert.ok(!JSON.stringify(view.trace).includes('nextHop'));
    }
    assert.deepEqual(task, before);
  }
  const { task, answer } = setup(1); answer.R2 = [];
  const view = presentCheck(task, routing.check(task, answer));
  assert.equal(view.trace.direction, 'reply'); assert.equal(view.repairRouter, 'R2');
  answer.R2 = routing.solution(task).R2; answer.R1[0].prefix = 32; answer.R1[0].dst = '192.168.2.2';
  const coverage = presentCheck(task, routing.check(task, answer));
  assert.equal(coverage.firstFailure.code, 'coverage-missing'); assert.equal(coverage.trace.direction, 'both');
  assert.equal(coverage.firstFailure.probe.ok, true); assert.equal(coverage.firstFailure.ok, false);
  assert.equal(coverage.repairRouter, 'R1');
});

test('demonstrations show safe drops for 3/3b and are absent for exact-summary 16', () => {
  for (const [variant, pattern] of [['explicit-routes', /R1.*відкидає/], ['defaults', /R2.*відкидає/]]) {
    const { task, answer } = setup(3, variant);
    assert.match(presentCheck(task, routing.check(task, answer)).demonstrations[0].text, pattern);
  }
  const { task, answer } = setup(16);
  assert.deepEqual(presentCheck(task, routing.check(task, answer)).demonstrations, []);
});

test('hints use current parsed rows, bank questions and adapter-rendered examples', () => {
  const { task, answer } = setup(1);
  const empty = hints(task, {});
  assert.equal(empty.length, 3); assert.ok(empty[0].params.text.startsWith(`Де дивитися: маршрути ${presentCheck(task, routing.check(task, {})).firstFailure.params.router}`));
  assert.match(empty[1].params.text, /R1/);
  const current = hints(task, { R1: answer.R1, R2: [null, { dst: 'unfinished' }] });
  assert.match(current[0].params.text, /маршрути R2.*LAN-A/);
  assert.match(current[1].params.text, /На R2.*маршрут/);
  assert.equal(current[2].params.kind, 'reply');
  for (const syntax of syntaxList) {
    const rung = hints(task, {}, syntax.id)[2];
    assert.ok(rung.params.commands.every(c => c.startsWith(syntax.id === 'cisco' ? 'ip route ' : '/ip route add ')));
    for (const hint of hints(task, {}, syntax.id)) assert.ok(t(`routing.static.${hint.code}`, hint.params).length);
  }
  assert.throws(() => presentCheck(task, routing.check(task, {}), 'missing'), RangeError);
});

test('new leak surfaces cover every variant, current failures, both syntaxes and demonstrations', ctx => withReadOnlyLogic(routing, () => {
  let count = 0;
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    const submitted = routing.solution(task);
    const cases = [{}, submitted, ...Object.keys(submitted).map(router => ({ ...submitted, [router]: [] }))];
    for (const objective of variant.objectives.filter(o => o.type === 'summary')) {
      const original = submitted[objective.routerId].find(r => r.dst === objective.dst && r.prefix === objective.prefix);
      const retained = submitted[objective.routerId].filter(r => r !== original);
      cases.push({ ...submitted, [objective.routerId]: [...retained, ...objective.destinations.map((p, i) => ({ ...original, ...p, id: `split-${i}` }))] });
      cases.push({ ...submitted, [objective.routerId]: [...retained, { ...original, dst: '0.0.0.0', prefix: 0 }] });
    }
    if (record.displayNumber === 15) {
      for (const distance of [1, 0, 10]) cases.push({ R1: submitted.R1.map(r => ({ ...r, distance })) });
      cases.push({ R1: [submitted.R1[0]] }, { R1: [submitted.R1[1]] });
    }
    if (record.displayNumber === 1) cases.push({ ...submitted, R1: [{ ...submitted.R1[0], dst: '192.168.2.2', prefix: 32 }] });
    if (record.displayNumber === 2) cases.push({ ...submitted, R2: [{ ...submitted.R2[0], dst: '198.19.255.254', prefix: 32 }, { ...submitted.R2[0], dst: '10.20.0.0', prefix: 24 }] });
    for (const answer of cases) for (const syntax of syntaxList) {
      const result = routing.check(task, answer), view = presentCheck(task, result, syntax.id);
      const inspect = (value, kind) => { count++; assert.deepEqual(inspectLeaks(task, value, kind), [], `${variant.code}/${kind}: ${value}`); };
      inspect(view.strip, 'strip');
      for (const line of view.lines) { inspect(line.label, 'ping'); inspect(line.text, 'network-feedback'); }
      for (const advice of view.advice) inspect(advice.text, 'network-feedback');
      for (const line of describeTrace(result.evidence, task.network, syntax.id)) inspect(line, 'path');
      for (const demo of view.demonstrations) inspect(demo.text, 'demonstration');
      for (const hint of hints(task, answer, syntax.id)) inspect(t(`routing.static.${hint.code}`, hint.params), hint.rung === 3 ? 'example' : hint.code);
      for (const field of syntax.fields) inspect(field.placeholder({ isDefault: false }), 'placeholder');
      if (result.ok) {
        const commands = Object.values(answer).flat().map(r => syntax.command(r)).join('\n');
        assert.deepEqual(inspectLeaks(task, commands, 'submitted', { answer, syntax: syntax.id }), []);
      }
    }
  }
  assert.ok(count > 2000);
  ctx.diagnostic(`${count} generated presentation/hint/path surfaces checked`);
}));

test('new leak fixtures reject endpoint/ISP addresses, interface ids, forged examples and success provenance', () => {
  const { task } = setup(1);
  for (const kind of ['ping', 'strip', 'path', 'demonstration']) for (const value of ['203.0.113.1', '198.18.0.1', '198.19.255.254', 'R1.if1', 'g0/0']) assert.notDeepEqual(inspectLeaks(task, value, kind), [], `${kind}/${value}`);
  const { task: altered } = setup(1);
  altered.variant.referenceRoutes.R1[0].dst = '198.51.100.0';
  assert.ok(leaks(altered, hints(altered, {})[2].params.text, 'example').includes('task-value-in-example'));
  assert.ok(inspectLeaks(task, 'ip route 198.51.100.0 255.255.255.0 203.0.113.2', 'network-feedback').includes('address-in-names-only'));
  assert.ok(inspectLeaks(task, '198.18.0.1', 'example').includes('non-documentation-address'));
  assert.ok(inspectLeaks(task, 'ip route 192.168.2.0 255.255.255.0 10.0.0.2', 'submitted').includes('unproven-submission'));
});

test('final form-objective table exactly matches v2.1, with bank rung-one keys', () => {
  const expected = {
    '1': [], '2': [], '3': ['no-default:R1', 'no-default:R2'],
    '3b': ['default-on:R1', 'no-default:R2'], '4': [], '5': [], '6': ['summary:R1'],
    '7': ['default-on:R1', 'default-on:R2', 'default-on:R3'],
    '8': ['no-default:R1', 'no-default:R2', 'no-default:R3', 'no-default:R4'],
    '8b': ['default-on:R1', 'default-on:R4'], '9': [],
    '10': ['direct-neighbour:R1', 'direct-neighbour:R2', 'direct-neighbour:R3'],
    '11': ['default-on:R-A', 'default-on:R-B', 'default-on:R-C'], '12': [],
    '13': ['summary:R1'], '14': ['summary:R-HQ:advice'],
    '15': ['path-via:ISP1', 'path-via:ISP2', 'distance-order:R1'], '16': ['summary:R-INET'], '17': ['summary:R-INET'],
  };
  for (const record of tasks) for (const variant of record.variants) {
    assert.ok(hintQuestions[variant.hintQuestionId]);
    assert.deepEqual(variant.objectives.filter(o => !['coverage', 'internet-coverage'].includes(o.type)).map(o => `${o.type}:${o.routerId ?? o.deviceId}${o.severity === 'advice' ? ':advice' : ''}`).sort(), expected[variant.code].sort());
  }
});

test('form objectives allow working specifics alongside a default, and direct-neighbour /25 halves', () => {
  const { task, answer } = setup(3, 'defaults');
  answer.R1.push({ dst: '198.19.255.254', prefix: 32, via: answer.R1[0].via });
  assert.equal(routing.check(task, answer).ok, true);
  const { task: t10, answer: a10 } = setup(10);
  const route = a10.R1.find(r => r.dst === '192.168.2.0');
  a10.R1 = a10.R1.filter(r => r !== route).concat([0, 128].map(n => ({ ...route, id: `half-${n}`, dst: `192.168.2.${n}`, prefix: 25 })));
  assert.equal(routing.check(t10, a10).ok, true);
});

test('form-error presentation precedes network failures and exposes only names', () => {
  const { task } = setup(1);
  const result = { ...routing.check(task, {}), code: 'form-errors', formErrors: [{ routerId: 'R2', code: 'invalid-ip' }] };
  const view = presentCheck(task, result);
  assert.equal(view.firstFailure.code, 'invalid-ip'); assert.equal(view.repairRouter, 'R2');
  assert.equal(view.strip, 'Спочатку виправ позначені маршрути');
  assert.deepEqual(inspectLeaks(task, view.strip, 'strip'), []);
});

test('delivered demonstration and path text name the actual endpoint segment', () => {
  const { task, answer } = setup(3, 'explicit-routes');
  task.record.demonstrations[0].to = 'segment-4.host';
  const result = routing.check(task, answer);
  assert.match(presentCheck(task, result).demonstrations[0].text, /LAN-B1/);
  const path = describeTrace(result.evidence.probes[0], task.network);
  assert.match(path[0], /LAN-A1.*R1.*LAN-A2/);
  assert.match(path[1], /Відповідь: LAN-A2.*LAN-A1/);
});

test('checking a wrong destination stays in its bound slot until a free-mode edit drops it', () => {
  const { task, answer } = setup(3, 'explicit-routes');
  const route = { ...answer.R1[0], id: 'R1.f6' };
  const checked = putRoute(task, {}, 'R1', route, { slot: 'R1.row2' });
  assert.equal(guidedView(task, checked).R1.slots[1].route.id, 'R1.f6');
  assert.equal(guidedView(task, checked).R1.slots[0].route, null);
  const edited = putRoute(task, checked, 'R1', { ...checked.R1[0], via: checked.R1[0].via });
  assert.equal(edited.R1[0].slot, undefined);
  assert.equal(guidedView(task, edited).R1.slots[0].route.id, 'R1.f6');
});

test('a canonical network check invalidates every mode/syntax draft for its route ids', () => {
  let s = initialInstance();
  for (const mode of ['guided', 'free']) s = instanceReducer(s, { type: 'draft', mode, syntax: 'cisco', routeId: 'R1.f3', value: { net: 'draft' } });
  s = instanceReducer(s, { type: 'checked', answer: { R1: [{ id: 'R1.f3' }] }, result: { ok: false, complete: false } });
  assert.ok(!JSON.stringify(s.drafts).includes('draft'));
});

test('restored route ids cannot be reused after deletion; task identity survives a form failure', () => {
  let s = instanceReducer(initialInstance(), { type: 'checked', answer: { R1: [{ id: 'R1.f9' }] }, result: { ok: true, complete: true, evidence: { taskId: 'routing.task-03' } } });
  s = instanceReducer(s, { type: 'route-deleted', routeId: 'R1.f9' });
  s = instanceReducer(s, { type: 'route-upsert', routerId: 'R1', route: {} });
  assert.equal(s.answer.R1[0].id, 'R1.f10');
  s = instanceReducer(s, { type: 'checked', answer: s.answer, result: { ok: false, complete: false, code: 'form-errors' } });
  assert.equal(s.taskId, 'routing.task-03'); assert.equal(s.session.earned.solved, true);
});

test('a default on the DHCP default\'s own gateway passes with vendor-worded advice (Astra 2)', () => {
  const { task, answer } = setup(2);
  answer.R1.push({ ...task.network.supplied.R1[0], id: 'student' });
  const result = routing.check(task, answer);
  assert.equal(result.ok, true, 'IOS prefers it (DHCP is 254), RouterOS ties (1): the same gateway either way');
  assert.deepEqual(result.findings.filter(f => f.code === 'redundant-default').map(f => f.entity), ['R1']);
  assert.match(presentCheck(task, result, 'cisco').advice.find(a => a.code === 'redundant-default').text, /Cisco.*254/);
  assert.match(presentCheck(task, result, 'routeros').advice.find(a => a.code === 'redundant-default').text, /MikroTik.*distance 1/);
  // A second default through another neighbour stays a stated exercise limit, not a claim about devices.
  const other = setup(2);
  other.answer.R1.push({ dst: '0.0.0.0', prefix: 0, via: other.answer.R1[0].via, id: 'other' });
  const view = presentCheck(other.task, routing.check(other.task, other.answer));
  assert.equal(view.firstFailure.code, 'unsupported-ecmp');
  assert.match(view.firstFailure.text, /У цій вправі/);
});

test('hints do not read references or scaffold; too-wide summaries explain the overreach', () => {
  const { task, answer } = setup(6);
  answer.R1[0] = { ...answer.R1[0], dst: '0.0.0.0', prefix: 0 };
  Object.defineProperty(task.variant, 'referenceRoutes', { get() { throw Error('reference read'); } });
  Object.defineProperty(task.variant, 'scaffold', { get() { throw Error('scaffold read'); } });
  assert.match(hints(task, answer)[1].params.text, /охоплює зайве/);
  assert.equal(hints(task, {}).length, 3);
});

test('explicit slots precede legacy id inference, and rebinding preserves displaced routes as extras', () => {
  const { task, answer } = setup(15);
  const original = { ...answer.R1[0], id: 'R1.row1' };
  const bound = { ...original, id: 'R1.f3', slot: 'R1.row1' };
  const other = { ...original, id: 'R1.f4', slot: 'R1.row2' };
  const input = { R1: [original, bound, other] };
  assert.equal(guidedView(task, input).R1.slots[0].route.id, 'R1.f3');
  const changed = putRoute(task, input, 'R1', { ...original, id: 'R1.f5' }, { slot: 'R1.row1' });
  assert.equal(changed.R1.length, 4);
  const view = guidedView(task, changed).R1;
  assert.deepEqual(view.slots.map(s => s.route.id), ['R1.f5', 'R1.f4']);
  assert.deepEqual(view.extras.map(r => r.id), ['R1.row1', 'R1.f3']);
});
