// «Знайди несправність» screens (VLAN-3 spec v2 §4, Z1, Z2, Z7; brief v1):
// the pure view (faultsState.js), the screen rendered on the server from a
// given store (tests/harness/vlan.jsx), and the strings. The mounted
// lifecycle checks and the leak rounds over forced faults are in
// tests/helpers/mounted-vlan3.mjs (run by tests/vlan3-mounted.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { record } from '../src/banks/vlan/faults.js';
import faults from '../src/sections/vlan/logic/faults-exercise.js';
import { catalogue } from '../src/sections/vlan/logic/faults.js';
import * as S from '../src/sections/vlan/screens/faultsState.js';
import { causeText, copy, faultText, faultsUi, observed, observeText, observedWords, t, ui } from '../src/sections/vlan/uk.js';
import { sessionReducer } from '../src/ui/session.js';

const h = await import('../.test-bundles/harness/vlan.mjs');
const levelsOf = shape => shape.levels;
const instances = [];
for (const shape of record.variants) for (const vendor of shape.syntaxes) for (const level of levelsOf(shape)) {
  instances.push(faults.inspect(record, { variantId: shape.id, vendor, level, seed: 3 }));
}

// ── Forms and answers ────────────────────────────────────────────────────

test('faults forms: the given configuration comes back from its form unchanged, every shape, vendor and level', () => {
  for (const i of instances) {
    const { task } = i, native = task.vendor === 'cisco' && S.usesNative(task.initialConfiguration);
    for (const config of [task.initialConfiguration, i.repaired]) {
      assert.deepEqual(S.toFaultConfig(S.toFaultForm(config, task.vendor, { native }), task.vendor), config, `${task.identity.shape}/${task.vendor}/${task.level}`);
    }
  }
});

test('faults forms: Cisco ports keep both fields; native shown where the task uses one, \'\' for the default', () => {
  const config = { SW1: { vlans: [10, 20], ports: { a1: { mode: 'access', vlan: 10 }, t1: { mode: 'trunk', allowed: [10, 20], native: 10 }, t2: { mode: 'trunk', allowed: 'all' } } } };
  assert.equal(S.usesNative(config), true);
  assert.equal(S.usesNative({ SW1: { vlans: [], ports: { a1: { mode: 'access', vlan: 10 } } } }), false);
  const form = S.toFaultForm(config, 'cisco', { native: true });
  assert.deepEqual(form.SW1.ports, { a1: { mode: 'access', vlan: 10, allowed: [], native: '' }, t1: { mode: 'trunk', vlan: '', allowed: [10, 20], native: 10 }, t2: { mode: 'trunk', vlan: '', allowed: 'all', native: '' } });
  // A trunk turned access and back keeps its list; an emptied native is the default (omitted).
  form.SW1.ports.t1.mode = 'access';
  form.SW1.ports.t1.vlan = 30;
  assert.deepEqual(S.toFaultConfig(form, 'cisco').SW1.ports.t1, { mode: 'access', vlan: 30 });
  form.SW1.ports.t1.mode = 'trunk';
  form.SW1.ports.t1.native = '';
  assert.deepEqual(S.toFaultConfig(form, 'cisco').SW1.ports.t1, { mode: 'trunk', allowed: [10, 20] });
  // A typo stays as typed (the check marks it).
  form.SW1.ports.t1.native = '1x';
  assert.equal(S.toFaultConfig(form, 'cisco').SW1.ports.t1.native, '1x');
  // Without the field, no native key.
  assert.equal('native' in S.toFaultForm(config, 'cisco').SW1.ports.t1, false);
});

test('faults place: slots, params, levels', () => {
  assert.equal(S.slotOf({}, 'cisco'), null);
  assert.deepEqual(S.slotOf({ faults: { cisco: { seed: 4, level: 9, shape: 'local' } } }, 'cisco'), { seed: 4, level: 3, shape: 'local' });
  assert.deepEqual(S.paramsOf('cisco', { seed: 4, level: 1, shape: 'local' }), { vendor: 'cisco', level: 1, seed: 4, variantId: 'local' });
  assert.deepEqual(S.paramsOf('routeros', { seed: 4, level: 2, shape: null }), { vendor: 'routeros', level: 2, seed: 4 });
  assert.deepEqual([1, 2, 3].map(S.nextLevel), [2, 3, 3]);
  const place = h.firstPlace(h.bank);
  for (const vendor of ['cisco', 'routeros']) {
    const slot = place.faults[vendor];
    assert.equal(slot.level, 1);
    const task = faults.create(record, S.paramsOf(vendor, slot));
    assert.equal(task.identity.shape, slot.shape, 'the slot names the network its seed draws');
    assert.ok(record.variants.find(v => v.id === slot.shape).levels.includes(1));
  }
});

// ── The grid, the walks, the verdicts ────────────────────────────────────

test('faults grid: rows in words, expected against observed; isolation says where frames got to, once per PC', () => {
  for (const i of instances) {
    const grid = faults.grid(i.task);
    const attachments = faults.compile(i.task, i.task.initialConfiguration).topology.attachments ?? [];
    const rows = S.gridRows(i.task, grid, attachments);
    assert.equal(rows.length, grid.reachability.length + grid.isolation.length);
    for (const r of rows) {
      assert.match(r.label, /^[^:]+: (проходить|не проходить)/);
      assert.ok(r.what && !/undefined|null|\[object/.test(r.label + r.what), r.label);
      if (r.kind === 'isolation' && !r.ok) assert.ok(r.detail.length > 0 && new Set(r.detail).size === r.detail.length, r.label);
    }
    assert.ok(rows.some(r => !r.ok), 'the fault shows');
    for (const line of S.gridLines(rows)) assert.match(line, /: (проходить|не проходить)/);
  }
  const isolation = { reachability: [], isolation: [{ id: 'vlan:10', vid: 10, observed: false, walks: [], unexpected: [{ from: 'PC1', host: 'PC3', vlan: 20 }, { from: 'PC2', host: 'PC3', vlan: 20 }] }] };
  const [row] = S.gridRows({ topology: { hosts: [] } }, isolation);
  assert.deepEqual([row.what, row.detail], [faultText.isolationRow({ vid: 10 }), [faultText.unexpected({ host: 'PC3', vlan: 20 })]]);
});

test('faults walks: a row draws a flood (VLAN-1) or an IP probe (VLAN-2), the failing direction first', () => {
  for (const i of instances) {
    const grid = faults.grid(i.task);
    for (const r of [...grid.reachability, ...grid.isolation]) {
      const ev = S.rowEvidence(i.task, grid, r.id);
      assert.ok(ev, r.id);
      if (ev.kind === 'flood') assert.ok(ev.walk.hops.length > 0 && Array.isArray(ev.leaked));
      if (ev.kind === 'trace') {
        assert.ok(S.isRouted(i.task) && ev.probe.request);
        if (!r.observed) assert.equal(ev.direction, ev.probe.request.ok ? 'reply' : 'request');
        else assert.equal(ev.direction, null);
      }
      if (ev.kind === 'none') assert.equal(r.probe ?? null, null);
    }
  }
  assert.equal(S.rowEvidence(instances[0].task, faults.grid(instances[0].task), 'no-such-row'), null);
  // A VLAN-1 walk in words: the reachability note apart, then the frame's steps.
  const l2 = instances.find(i => !S.isRouted(i.task));
  const grid = faults.grid(l2.task), ev = S.rowEvidence(l2.task, grid, grid.reachability[0].id);
  const words = S.floodLines(l2.task, l2.task.vendor, ev.walk);
  assert.equal(words.note, t('reachability-abstraction'));
  assert.match(words.steps[0], /надсилає широкомовний кадр/);
});

test('faults verdicts: tone; the cause-only verdicts mark nothing; a failing fix marks its fields', () => {
  assert.equal(S.toneOf(null), null);
  assert.equal(S.toneOf({ ok: true }), 'ok');
  assert.equal(S.toneOf({ ok: false, code: 'fault-cause-other' }), 'no');
  assert.equal(S.toneOf({ ok: false, code: 'fault-cause-required' }), 'info');
  assert.equal(S.toneOf({ ok: false, code: 'invalid-cause' }), 'info');
  assert.equal(S.toneOf({ ok: false, code: 'must-ping' }), 'no');
  const i = instances.find(x => x.task.vendor === 'cisco' && !S.isRouted(x.task));
  const repaired = { cause: 'trunk-missing-vlan', configuration: i.repaired };
  const other = faults.check(i.task, { ...repaired, cause: faults.options(i.task, 'cause').map(o => o.value).find(c => c !== i.site.code) });
  assert.equal(S.isCauseVerdict(other), true);
  assert.deepEqual(S.faultMarks(i.task, other, i.repaired, 'cisco'), {});
  const bad = structuredClone(i.task.initialConfiguration);
  bad.SW1.vlans = [10, 'abc'];
  const failed = faults.check(i.task, { cause: null, configuration: bad });
  assert.deepEqual(S.faultMarks(i.task, failed, bad, 'cisco'), { SW1: [{ field: 'vlans', code: 'bad-vid' }] });
  // An IP task's marks read the submitted configuration itself (no givens restored).
  const ip = instances.find(x => S.isRouted(x.task) && x.task.vendor === 'cisco');
  const typo = structuredClone(ip.task.initialConfiguration);
  typo.R1.subifs[0].vid = 'x';
  const marks = S.faultMarks(ip.task, faults.check(ip.task, { cause: null, configuration: typo }), typo, 'cisco');
  assert.ok(marks.R1?.some(m => m.field.startsWith('subifs.0')), JSON.stringify(marks));
});

test('faults words: stops told as observations; hint 2 never diagnoses or repairs (fix brief item 1)', () => {
  const teaching = Object.keys(observed).map(code => copy[code]);
  for (const [code, words] of Object.entries(observed)) {
    assert.equal(observedWords(code), words);
    assert.equal(observedWords(`reply-${code}`), `Зворотний шлях: ${words}`);
    assert.equal(observeText(`SW1 ether2: ${t(code)}`), `SW1 ether2: ${words}`);
    if (copy[`reply-${code}`]) assert.equal(observeText(t(`reply-${code}`)), `Зворотний шлях: ${words}`);
    assert.doesNotMatch(words, /Використай|Додай|Задай|Увімкни|Поверни|Прив’яжи|Створи|перевір|tagged-учасником|недостатньо/i, code);
  }
  assert.equal(observedWords('not-member'), t('not-member'), 'other stops keep their words');
  // Hint 2 over every cause of the bridge router and the transit network.
  const forced = [['routeros', 2, 15, 'route-4'], ['cisco', 3, 12, 'transit'], ['routeros', 2, 3, 'route-3'], ['cisco', 3, 13, 'route-2']];
  for (const [vendor, level, seed, variantId] of forced) {
    const base = faults.inspect(record, { vendor, level, seed, variantId });
    for (const code of [...new Set(base.candidates.filter(c => c.accepted).map(c => c.site.code))]) {
      const i = faults.inspect(record, { vendor, level, seed, variantId, faultCode: code });
      for (const result of [undefined, faults.check(i.task, faults.initialAnswer(i.task))]) {
        const words = faults.hints(i.task, faults.initialAnswer(i.task), { result }).map(h => t(h.code, h.params)).join(' ');
        for (const sentence of teaching) assert.ok(!words.includes(sentence), `${variantId}/${code}: ${words}`);
        // Round 4 (2a): the vendor's own words; a missing pair has none to leak.
        for (const c of catalogue) {
          const cause = causeText[vendor]?.[c.code], repair = faultText.repair(c.code, vendor);
          assert.ok((!cause || !words.includes(cause)) && (!repair || !words.includes(repair)), `${variantId}/${code}`);
        }
      }
    }
  }
});

test('faults marks: on an IP task, only form findings (an objective would point at the fault, item 4)', () => {
  const i = faults.inspect(record, { vendor: 'routeros', level: 2, seed: 3, variantId: 'route-3', faultCode: 'wrong-encapsulation' });
  const result = faults.check(i.task, faults.initialAnswer(i.task));
  assert.equal(result.ok, false);
  assert.deepEqual(S.faultMarks(i.task, result, i.task.initialConfiguration, 'routeros'), {});
});

test('faults grid: the summary counts', () => {
  assert.deepEqual(S.gridCount([{ ok: true }, { ok: false }, { ok: false }]), { failing: 2, total: 3 });
  assert.equal(faultsUi.summary({ failing: 2, total: 3 }), '✗ Не проходять 2 з 3.');
  assert.equal(faultsUi.summary({ failing: 0, total: 3 }), '✓ Проходять усі 3.');
  assert.deepEqual([1, 2, 5, 11, 21, 24].map(n => faultsUi.passing({ n })), ['ще 1 перевірка проходить ✓', 'ще 2 перевірки проходять ✓', 'ще 5 перевірок проходять ✓', 'ще 11 перевірок проходять ✓', 'ще 21 перевірка проходить ✓', 'ще 24 перевірки проходять ✓']);
});

test('faults: a wrong listed cause is help: the session is marked assisted without a hint', () => {
  const s = sessionReducer(undefined, { type: 'assist' });
  assert.deepEqual([s.assisted, s.hintIndex], [true, 0]);
});

// ── The reveal ───────────────────────────────────────────────────────────

test('faults reveal: the commands a change takes away and adds, each indented line under its interface', () => {
  const before = 'vlan 10\nvlan 20\ninterface fa0/24\n switchport mode trunk\n switchport trunk allowed vlan 10\ninterface fa0/1\n switchport mode access';
  const after = 'vlan 10\nvlan 20\ninterface fa0/24\n switchport mode trunk\n switchport trunk allowed vlan 10,20\ninterface fa0/1\n switchport mode access';
  const diff = S.commandDiff(before, after);
  assert.deepEqual(diff, {
    removed: [{ head: 'interface fa0/24', line: ' switchport trunk allowed vlan 10' }],
    added: [{ head: 'interface fa0/24', line: ' switchport trunk allowed vlan 10,20' }],
  });
  assert.deepEqual(S.diffLines(diff.added), [{ text: 'interface fa0/24', head: true }, { text: ' switchport trunk allowed vlan 10,20', head: false }]);
  // The same line under another interface is another line; repeats count.
  assert.deepEqual(S.commandDiff('interface a\n x\ninterface b\n x', 'interface a\n x').removed, [{ head: null, line: 'interface b' }, { head: 'interface b', line: ' x' }]);
  for (const i of instances) {
    const sol = faults.solution(i.task);
    const render = config => faults.render(config, i.task.vendor, i.task.topology)[sol.change.device] ?? '';
    const d = S.commandDiff(render(sol.before.configuration), render(sol.after.configuration));
    assert.ok(d.removed.length + d.added.length > 0, `${i.task.identity.shape}/${i.task.vendor}: ${sol.cause}`);
    assert.ok(S.changeWhere(i.task, sol.change, i.task.vendor).startsWith(sol.change.device));
  }
});

// ── The screen on the server ─────────────────────────────────────────────

function state(vendor, slot) {
  let s = h.initialStore({ syntax: vendor });
  s = h.storeReducer(s, { type: 'place', scope: 'vlan', patch: { ...h.firstPlace(h.bank), exercise: 'faults', faults: { [vendor]: slot } } });
  return s;
}
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

/** A store at the cause stage (round 4, F6): the given configuration repaired in the form and checked, no cause yet. */
function causeStage(task, i) {
  const slot = { seed: task.identity.seed, level: task.level, shape: task.identity.shape };
  const s = state(task.vendor, slot);
  const native = task.vendor === 'cisco' && S.usesNative(task.initialConfiguration);
  const form = S.toFaultForm(i.repaired, task.vendor, { native });
  const answer = { cause: null, configuration: S.toFaultConfig(form, task.vendor) };
  const result = faults.check(task, answer);
  assert.ok(S.repairWorks(result) && result.code === 'fault-cause-required', `${task.identity.shape}: ${result.code}`);
  s.instances[task.instanceKey] = { ...h.initialInstance(), result, presses: 1, view: { form, checked: JSON.stringify(answer), stage: 'cause' } };
  return s;
}

test('faults screen: the fourth tab, three stages one at a time; the grid first; no fault code, cause or repair outside the options', () => {
  const vendorWords = vendor => catalogue.flatMap(c => [causeText[vendor]?.[c.code], faultText.repair(c.code, vendor)]).filter(Boolean);
  for (const i of instances.filter((_, k) => k % 2 === 0)) {
    const { task } = i;
    const html = unescape(h.renderScreen(state(task.vendor, { seed: task.identity.seed, level: task.level, shape: task.identity.shape })));
    assert.match(html, /Знайди несправність/);
    assert.match(html, new RegExp(`Рівень ${task.level} з 3`));
    for (const c of catalogue) assert.ok(!html.includes(c.code), `${task.identity.shape}: ${c.code}`);
    // The checks stage: the stepper, the grid; no causes, no form yet; «Причина» locked.
    assert.match(html, /class="ng-vf-step is-current"[^>]*>.*Перевірки/);
    assert.match(html, /aria-disabled="true"[^>]*>(?:<[^>]+>)*3<\/span> Причина/);
    assert.ok(!html.includes('class="ng-vf-causes"') && !html.includes('class="ng-vl-form"'), 'one stage at a time');
    assert.ok(!html.includes('ng-vf-jumps'), 'the jump buttons went');
    for (const words of vendorWords(task.vendor)) assert.ok(!html.includes(words), `cause or repair words before a reveal: ${words}`);
    assert.equal((html.match(/class="ng-vf-row /g) ?? []).length, faults.grid(task).reachability.length + faults.grid(task).isolation.length);
    assert.match(html, /✗ не проходить/, 'the A6 marks');
    // The repair stage: the form, every row editable; the given configuration under the panel.
    const repair = h.storeReducer(state(task.vendor, { seed: task.identity.seed, level: task.level, shape: task.identity.shape }), { type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { stage: 'repair' } } });
    const repairHtml = unescape(h.renderScreen(repair));
    assert.ok(repairHtml.includes('class="ng-vf-repair"') && repairHtml.includes('class="ng-vf-original"'));
    // Round 4 repair (F4, Astra 1): a PC port names its PC in the repair form too.
    if (!task.taskNumber) assert.match(repairHtml, /class="ng-vl-port">[^<]+<span class="ng-vl-port-pc"> —\u00a0PC\d+<\/span>/);
    assert.doesNotMatch(repairHtml, /ng-vl-fixed|aria-readonly="true"[^>]*class="ng-segmented-options"/, 'nothing given read-only');
    assert.ok(repairHtml.indexOf('class="ng-vf-repair"') < repairHtml.indexOf('data-help="row"') || repairHtml.indexOf('class="ng-help-host"') >= 0, 'the panel checks the repair');
    // The cause stage after a passing repair: the options in order, no value, «Мережа працює…».
    const cause = unescape(h.renderScreen(causeStage(task, i)));
    const fieldset = cause.match(/<fieldset class="ng-vf-causes"[^>]*>[\s\S]*?<\/fieldset>/)[0];
    const labels = [...fieldset.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]);
    assert.deepEqual(labels, faults.options(task, 'cause').map(o => o.label));
    assert.doesNotMatch(fieldset, /checked=""|value=/, 'no cause chosen; no values');
    assert.ok(cause.includes(t('fault-cause-required')));
    const outside = cause.replace(fieldset, '');
    for (const words of vendorWords(task.vendor)) assert.ok(!outside.includes(words), `cause or repair words outside the options: ${words}`);
  }
});

test('faults screen: without faults in the bank the tab isn’t offered', () => {
  const { faults: _, ...bank } = h.bank;
  const s = h.storeReducer(h.initialStore({}), { type: 'place', scope: 'vlan', patch: { ...h.firstPlace(bank), exercise: 'faults' } });
  const html = h.renderScreen(s, bank);
  assert.doesNotMatch(html, /Знайди несправність/);
});

// ── Strings ──────────────────────────────────────────────────────────────

test('faults strings: every screen word is there, functions take their parameters', () => {
  const sample = { n: 2, label: 'RouterOS до 7.16', from: 'PC1', to: 'PC2', what: 'PC1 ↔ PC2', ok: false, detail: ['x'], device: 'SW1', port: 'fa0/1', failing: 2, total: 5 };
  const walk = (value, path) => {
    if (typeof value === 'function') { const out = value(sample); assert.ok(typeof out === 'string' && out.length > 0 && !/undefined|\[object/.test(out), path); return; }
    if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`); return; }
    assert.ok(typeof value === 'string' && value.length > 0, path);
  };
  walk(faultsUi, 'faultsUi');
  assert.equal(ui.exercises.faults, faultText.title);
  assert.match(ui.native({ port: 'gi0/1' }), /^gi0\/1: native VLAN/);
  for (const level of [1, 2, 3]) assert.ok(faultsUi.levelWhat[level]);
  for (const code of ['fault-cause-other', 'fault-cause-required', 'invalid-cause']) assert.ok(!t(code).startsWith('['), code);
});

test('round 4 F6: cause and repair words never mix vendor terms (Cisco: no tagged/PVID/bridge; RouterOS: no switchport/allowed)', () => {
  for (const c of catalogue) {
    for (const words of [causeText.cisco?.[c.code], faultText.repair(c.code, 'cisco')].filter(Boolean)) assert.doesNotMatch(words, /tagged|PVID|bridge/i, `cisco ${c.code}: ${words}`);
    for (const words of [causeText.routeros?.[c.code], faultText.repair(c.code, 'routeros')].filter(Boolean)) assert.doesNotMatch(words, /switchport|allowed/i, `routeros ${c.code}: ${words}`);
  }
  for (const i of instances) for (const o of faults.options(i.task, 'cause')) assert.ok(o.label === causeText[i.task.vendor][o.value], `${i.task.vendor}: ${o.value}`);
});

test('round 4 F6: the stage on screen: «Причина» only after a passing repair of the configuration shown; an edit closes it', () => {
  const ok = { ok: false, code: 'fault-cause-required' }, fail = { ok: false, code: 'must-ping' };
  assert.deepEqual(S.stageOf(undefined, { result: null, checkedConfig: null, config: 'a' }), { stage: 'checks', causeOpen: false });
  assert.deepEqual(S.stageOf('cause', { result: fail, checkedConfig: 'a', config: 'a' }), { stage: 'repair', causeOpen: false });
  assert.deepEqual(S.stageOf('cause', { result: ok, checkedConfig: 'a', config: 'a' }), { stage: 'cause', causeOpen: true });
  assert.deepEqual(S.stageOf('cause', { result: ok, checkedConfig: 'a', config: 'b' }), { stage: 'repair', causeOpen: false }, 'an edit of the repair closes it');
  assert.deepEqual(S.stageOf('checks', { result: { ok: true }, checkedConfig: 'a', config: 'a' }), { stage: 'checks', causeOpen: true }, 'earlier stages stay reachable');
  assert.deepEqual(S.originalLines('interface a\n x\n y\nvlan 1', 'interface a\n y\nvlan 1').map(l => l.changed), [false, true, false, false]);
});

test('round 4 repair (Astra 3): an edit since the last check keeps «Причина» closed, even when the configuration is back to the checked one', () => {
  const ok = { ok: false, code: 'fault-cause-required' };
  assert.deepEqual(S.stageOf('cause', { result: ok, checkedConfig: 'a', config: 'a', edited: true }), { stage: 'repair', causeOpen: false });
  assert.deepEqual(S.stageOf('cause', { result: ok, checkedConfig: 'a', config: 'a', edited: false }), { stage: 'cause', causeOpen: true });
});
