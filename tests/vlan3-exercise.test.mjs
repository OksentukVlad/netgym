import { transparentTransit } from './fixtures/vlan3/handwritten.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { record, records } from '../src/banks/vlan/faults.js';
import { validateFaultInstance, validateFaultRecord, validateBank, expectedFaultCoverage } from '../src/banks/vlan/validate.js';
import { record as predict } from '../src/banks/vlan/predict.js';
import { records as portRecords } from '../src/banks/vlan/ports.js';
import * as F from '../src/sections/vlan/logic/faults-exercise.js';
import * as P from '../src/sections/vlan/logic/ports.js';
import * as R from '../src/sections/vlan/logic/route.js';
import { plant, repair, catalogue } from '../src/sections/vlan/logic/faults.js';
import { observeVlan, vlanEvidenceKey, observableVlan } from '../src/engine/vlan-evidence.js';
import { t, causeText } from '../src/sections/vlan/uk.js';
const expectedSites = new Set(), coveredSites = new Set(), coveredCodes = new Set();
const combos = record.variants.flatMap(shape => shape.syntaxes.flatMap(vendor => shape.levels.map(level => ({ variantId: shape.id, vendor, level }))));

for (const params of combos) test(`Z1/Z3/Z4 deterministic identifiable healthy-repair property: ${Object.values(params).join('/')}`, () => {
  for (const seed of [0, 1, 41]) {
    const i = F.inspect(record, { ...params, seed }), { task } = i;
    assert.deepEqual(validateFaultInstance(i), []);
    assert.deepEqual(F.create(record, { ...params, seed }), task);
    assert.ok(observableVlan(F.grid(task)));
    assert.equal(F.check(task, F.solution(task)).ok, true);
    for (const key of expectedFaultCoverage(task, i.baseline).filter(k => k.endsWith(`/${params.vendor === 'cisco' ? 'default' : task.capabilities.dynamicBridgeTagged ? 'dynamic' : 'static'}`))) expectedSites.add(`${params.variantId}/${params.vendor}/${params.level}/${key}`);
    for (const c of i.candidates) {
      const key = `${params.variantId}/${params.vendor}/${params.level}/${c.site.key}/${c.site.capability}`;
      if (c.accepted) { coveredSites.add(key); coveredCodes.add(c.site.code); }
    }
    assert.ok(i.candidates.every(c => c.ambiguousWith.length === 0 || !c.accepted));
    for (const c of i.candidates.filter(c => c.accepted)) {
      assert.equal(F.evaluate(task, repair(c.faulty, i.baseline, c.site, task.vendor)).ok, true);
      assert.ok(!i.candidates.some(o => o.valid && o.site.code !== c.site.code && o.signature === c.signature));
    }
    const rehydrated = structuredClone(task);
    assert.equal(F.check(rehydrated, F.solution(task)).ok, true);
    assert.deepEqual(task.initialConfiguration, i.faulty);
  }
});
for (const shape of record.variants) for (const vendor of shape.syntaxes) test(`Z7 options invariant across every applicable cause: ${shape.id}/${vendor}`, () => {
  const params = { variantId: shape.id, vendor, level: 3, seed: 'invariance' }, i = F.inspect(record, params), expected = F.options(i.task, 'cause');
  assert.equal(expected.length, new Set(i.candidates.map(c => c.site.code)).size);
  for (const code of new Set(i.candidates.filter(c => c.accepted).map(c => c.site.code))) {
    const forced = F.inspect(record, { ...params, faultCode: code });
    assert.deepEqual(F.options(forced.task, 'cause'), expected);
    assert.equal(forced.task.instanceKey, i.task.instanceKey);
  }
  for (const o of expected) {
    assert.equal(o.label, causeText[vendor][o.value]);
    assert.ok(catalogue.find(c => c.code === o.value).vendors.includes(vendor));
    assert.deepEqual(Object.keys(o).sort(), ['label', 'value']);
  }
});

test('Z2 failing fix is identical for every cause choice, absent or malformed', () => {
  for (const vendor of ['cisco', 'routeros']) {
    const i = F.inspect(record, { variantId: 'two-switch', vendor, level: 3 }), answer = F.initialAnswer(i.task), expected = F.check(i.task, answer);
    for (const cause of [...F.options(i.task, 'cause').map(o => o.value), 'invented-cause', {}, null]) assert.deepEqual(F.check(i.task, { ...answer, cause }), expected);
  }
});
test('Z2 working fix judges cause second, wrong cause explicitly marks assisted', () => {
  const task = F.create(record), answer = F.solution(task);
  assert.equal(F.check(task, answer).ok, true);
  const result = F.check(task, answer);
  const initialHints = F.hints(task);
  assert.deepEqual(F.hints(task, answer), initialHints, 'unchecked fixed draft must not update hints');
  const hint = F.hints(task, answer, { result })[1];
  assert.match(t(hint.code, hint.params), /Порівняй зміни/);
  const invalid = F.check(task, { ...answer, cause: 'invented-cause' });
  assert.equal(invalid.code, 'invalid-cause'); assert.ok(!invalid.assisted);
  const wrong = F.check(task, { ...answer, cause: F.options(task, 'cause').find(o => o.value !== answer.cause).value });
  assert.equal(wrong.ok, false); assert.equal(wrong.assisted, true); assert.equal(wrong.code, 'fault-cause-other');
  assert.match(t(wrong.code), /Ремонт правильний — залиш його\. Причина була інша/);
  const missing = F.check(task, { ...answer, cause: null });
  assert.equal(missing.ok, false); assert.equal(missing.code, 'fault-cause-required');
});
test('Z2 alternative working fix and full rewrite pass by behaviour', () => {
  for (const vendor of ['cisco', 'routeros']) {
    const task = F.create(record, { variantId: 'two-switch', vendor }), answer = F.solution(task);
    if (vendor === 'cisco') for (const c of Object.values(answer.configuration)) { c.vlans = [300, 400]; for (const p of Object.values(c.ports)) {
      if (p.mode === 'access') p.vlan = p.vlan === task.vids[0] ? 300 : 400;
      else { p.allowed = [300, 400]; p.native = 1; }
    } } else for (const c of Object.values(answer.configuration)) c.vlans.forEach(row => { row.untagged = []; }); // dynamic PVID membership
    assert.equal(F.check(task, answer).ok, true);
  }
});
test('Z6 fixed-given restoration stays in route.check, VLAN-3 uses the edited configuration', () => {
  for (const n of [1, 3]) {
    const task = F.create(record, { variantId: `route-${n}`, level: 2 }), answer = F.solution(task);
    const port = Object.keys(answer.configuration.SW1.ports).find(p => p !== 't');
    answer.configuration.SW1.ports[port].vlan = 999;
    assert.equal(R.check(task, answer.configuration).ok, true);
    assert.equal(F.check(task, answer).ok, false);
  }
  const task = P.create(portRecords[1]), answer = P.solution(task), compiled = F.compile({ ...task, vendor: 'cisco' }, answer);
  assert.deepEqual(P.check(task, answer), P.evaluate(task, compiled, { answer }));
});
test('Z1 raw isolation catches a filtering-off leak even when expected reachability still works', () => {
  const { task, baseline } = transparentTransit();
  assert.equal(F.evaluate(task, baseline).ok, true);
  const faulty = plant(baseline, { code: 'filtering-off', device: 'MID', port: 'bridge' }, 'routeros');
  const observation = observeVlan(task, F.compile(task, faulty));
  assert.ok(observation.reachability.every(r => r.observed));
  const vlan10 = observation.isolation.find(r => r.vid === 10);
  assert.equal(vlan10.observed, false);
  assert.ok(vlan10.unexpected.some(a => a.host === 'PC5' && a.tagged));
  assert.ok(vlan10.unexpected.some(a => a.from === 'PC3' && a.host === 'PC6' && a.tagged));
  assert.equal(F.evaluate(task, faulty).ok, false);
});
test('Z4 bank validation rejects extra edits, broken baseline/repair, blocked forms, invalid capability and ambiguous evidence', () => {
  const i = F.inspect(record, { variantId: 'route-4', vendor: 'routeros', level: 3 });
  for (const mutate of [
    x => { x.candidates = x.candidates.filter(c => c.site.key === x.site.key); },
    x => { x.baseline.R1.addresses[0].ip = 'broken'; },
    x => { x.repaired.R1.addresses[0].ip = 'broken'; },
    x => { x.faulty.SW1.filtering = !x.faulty.SW1.filtering; x.task.initialConfiguration = x.faulty; },
    x => { x.faulty.R1.vlanIfs[0].vid = 0; x.task.initialConfiguration = x.faulty; },
    x => { const d = x.task.topology.devices.find(d => d.id === 'R1'); d.dynamicBridgeTagged = !d.dynamicBridgeTagged; },
    x => { x.candidates.push({ ...x.candidates.find(c => c.site.key === x.site.key), site: { ...x.site, code: 'filtering-off' } }); },
  ]) { const copy = structuredClone(i); mutate(copy); assert.ok(validateFaultInstance(copy).length); }
});
test('Z3 full directional evidence distinguishes missing management trunk and wrong encapsulation', () => {
  const i = F.inspect(record, { variantId: 'route-3', vendor: 'routeros', level: 3 });
  const trunk = i.candidates.find(c => c.site.code === 'trunk-missing-vlan' && c.site.vid === i.task.management.vid);
  const encap = i.candidates.find(c => c.site.code === 'wrong-encapsulation' && c.site.device === 'R1' && c.site.index === 2);
  assert.equal(trunk.observation.reachability.find(r => r.kind === 'management').observed, false);
  assert.notEqual(trunk.signature, encap.signature);
  assert.notDeepEqual(trunk.observation.reachability.find(r => r.kind === 'management').stops, encap.observation.reachability.find(r => r.kind === 'management').stops);
});
test('Z8 levels are bounded and native-mismatch is available only in mixed L2', () => {
  for (const params of combos) {
    const i = F.inspect(record, params);
    const entry = catalogue.find(c => c.code === i.site.code);
    if (params.level === 1) { assert.equal(entry.layer, 2); assert.equal(i.task.topology.devices.filter(d => d.kind === 'switch').length, 2); }
    if (params.level === 2) assert.equal(entry.layer, 3);
    if (params.level !== 3) assert.ok(!i.candidates.some(c => c.site.code === 'native-mismatch'));
    if (i.task.taskNumber) assert.ok(!i.candidates.some(c => c.site.code === 'native-mismatch'));
  }
});
test('record guards and integration validation keep faults optional for previous banks', () => {
  assert.deepEqual(validateFaultRecord(record), []);
  assert.deepEqual(validateBank({ predict: [predict], ports: portRecords, faults: records }), []);
  for (const mutate of [r => { r.version = 2; }, r => { r.variants[0].levels = [5]; }, r => { r.variants[0].placements = [[0]]; }]) {
    const bad = structuredClone(record); mutate(bad); assert.ok(validateFaultRecord(bad).length); assert.throws(() => F.create(bad));
  }
  for (const params of [{ level: 0 }, { vendor: 'other' }, { seed: null }, { variantId: 'transit', level: 1 }, { variantId: 'route-4', level: 2, vendor: 'cisco' }]) assert.throws(() => F.create(record, params));
});

test('Z4 bounded site/capability coverage includes every applicable planter and all fourteen causes', () => {
  assert.deepEqual([...expectedSites].sort(), [...coveredSites].sort());
  assert.deepEqual([...coveredCodes].sort(), catalogue.map(c => c.code).sort());
});

test('Astra: force every cause and scan complete findings/evidence plus diagnosis translations', () => {
  const covered = new Set();
  // Synonyms and translations of both inherited configure diagnoses are
  // literal review inputs, independent of the adapter's filtering logic.
  const namedDiagnosis = /trunk-faces-access|carry-through-middle|На кінцях лінка різні режими|тегований кадр приходить на порт доступу|середній комутатор переносить потрібний VLAN|транк.{0,15}access|access.{0,15}транк/iu;
  const scan = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      assert.notEqual(key, 'diagnosis');
      if (typeof v === 'string') {
        assert.doesNotMatch(v, namedDiagnosis);
        if (key === 'code') assert.doesNotMatch(t(v, value.params ?? {}), namedDiagnosis);
      }
      scan(v);
    }
  };
  for (const shape of record.variants) for (const vendor of shape.syntaxes) {
    const params = { variantId: shape.id, vendor, level: 3, seed: 1 };
    const i = F.inspect(record, params);
    for (const cause of new Set(i.candidates.filter(c => c.accepted).map(c => c.site.code))) {
      const forced = F.inspect(record, { ...params, faultCode: cause });
      assert.equal(forced.site.code, cause); covered.add(cause);
      const result = F.check(forced.task, F.initialAnswer(forced.task));
      assert.equal(result.ok, false); scan(result.findings); scan(result.evidence);
      assert.doesNotMatch(JSON.stringify([result.findings, result.evidence]), namedDiagnosis);
    }
  }
  assert.deepEqual([...covered].sort(), catalogue.map(c => c.code).sort());
});

test('capability seed states are deterministic and bridge-not-tagged is static-only', () => {
  for (const [seed, dynamic] of [[0, true], [1, false]]) {
    const params = { variantId: 'route-4', vendor: 'routeros', level: 3, seed };
    const i = F.inspect(record, params);
    assert.equal(i.task.capabilities.dynamicBridgeTagged, dynamic);
    assert.ok(i.task.topology.devices.filter(d => d.kind !== 'host').every(d => d.dynamicBridgeTagged === dynamic));
    assert.equal(i.candidates.some(c => c.site.code === 'bridge-not-tagged'), !dynamic);
    assert.deepEqual(F.inspect(record, params).task, i.task);
    assert.equal(F.check(structuredClone(i.task), F.solution(i.task)).ok, true);
    const pruned = structuredClone(i); pruned.candidates = pruned.candidates.filter(c => c.site.code !== 'wrong-encapsulation');
    assert.ok(validateFaultInstance(pruned).length, 'omitted candidate domain cannot shrink coverage expectations');
    assert.ok(expectedFaultCoverage(pruned.task, pruned.baseline).some(k => k.endsWith('/static')));
    assert.ok(expectedFaultCoverage(pruned.task, pruned.baseline).some(k => k.endsWith('/dynamic')));
  }
});

test('level-1 Cisco baselines omit custom native VLAN; only mixed L2 sets it', () => {
  for (const level of [1, 3]) {
    const { task, baseline } = F.inspect(record, { variantId: 'two-switch', vendor: 'cisco', level });
    for (const c of Object.values(baseline)) for (const p of Object.values(c.ports)) if (p.mode === 'trunk') {
      assert.equal(p.native, level === 3 ? task.vids[0] : undefined);
    }
  }
  const { baseline } = F.inspect(record, { variantId: 'route-1', vendor: 'cisco', level: 2 });
  assert.equal(baseline.SW1.ports.t.native, undefined);
});

test('planted addresses and encapsulation VIDs stay in task families without collisions', () => {
  for (const vendor of ['cisco', 'routeros']) {
    const i = F.inspect(record, { variantId: 'route-2', vendor, level: 3, seed: 17 });
    for (const c of i.candidates) {
      if (c.site.code === 'router-address-wrong-network') {
        assert.match(c.site.changed, /^172\.16\.(?:\d+)\.1$/);
        assert.ok(!i.task.networks.some(n => n.network.split('.').slice(0, 3).join('.') === c.site.changed.split('.').slice(0, 3).join('.')));
      }
      if (c.site.code === 'wrong-encapsulation') {
        assert.ok([10, 20, 30, 40, 50, 100, 200].includes(c.site.changed));
        assert.ok(!i.task.vids.includes(c.site.changed));
      }
    }
    assert.deepEqual(validateFaultInstance(i), []);
  }
});

test('inspect rejects unavailable forced causes/sites in the original seed pool', () => {
  const params = { variantId: 'route-4', vendor: 'routeros', level: 3, seed: 0 };
  assert.throws(() => F.inspect(record, { ...params, faultCode: 'bridge-not-tagged' }), /fault-not-in-pool/);
  assert.throws(() => F.inspect(record, { ...params, faultCode: 'invented-cause' }), /fault-not-in-pool/);
  assert.throws(() => F.inspect(record, { ...params, faultCode: '' }), /fault-not-in-pool/);
  assert.throws(() => F.inspect(record, { ...params, siteKey: 'missing-site' }), /fault-not-in-pool/);
});

test('unknown repaired cause strings and malformed values are invalid and never assisted', () => {
  const task = F.create(record), solution = F.solution(task);
  for (const cause of ['invented-cause', '', {}, [], false, 1]) {
    const result = F.check(task, { ...solution, cause });
    assert.equal(result.code, 'invalid-cause'); assert.equal(result.ok, false); assert.ok(!result.assisted);
    assert.deepEqual(result.evidence.grid, F.grid(task, solution));
  }
});
