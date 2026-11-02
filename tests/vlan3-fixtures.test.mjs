import test from 'node:test';
import assert from 'node:assert/strict';
import { flood, ping3 } from '../src/engine/l2.js';
import { walkStop, probeStops } from '../src/engine/vlan-evidence.js';
import { compile, evaluate } from '../src/sections/vlan/logic/faults-exercise.js';
import { plant, repair, catalogue } from '../src/sections/vlan/logic/faults.js';
import { cases } from './fixtures/vlan3/handwritten.mjs';
const tuple = stop => stop ? [stop.device, stop.port, stop.code] : null;
for (const c of cases) test(`hand-written planter + directional stops: ${c.code}/${c.vendor ?? 'cisco'}`, () => {
  const { task, baseline } = c.fixture(), vendor = c.vendor ?? 'cisco';
  const original = structuredClone(baseline), expected = structuredClone(baseline); c.expected(expected);
  const site = { code: c.code, ...c.site }, faulty = plant(baseline, site, vendor);
  assert.deepEqual(faulty, expected); assert.deepEqual(baseline, original);
  assert.deepEqual(repair(faulty, baseline, site, vendor), baseline);
  assert.equal(evaluate(task, baseline).ok, true);
  const state = compile(task, faulty);
  assert.ok(!state.findings.some(f => f.severity === 'blocks'));
  const [a, b] = c.pair;
  const observed = [a, b].map((from, i) => {
    const to = i === 0 ? b : a;
    if (task.taskNumber) {
      const p = { from, to, ...ping3(state.topology, state.tables, from, to) };
      return tuple(probeStops(state.topology, p, state.tables).flat(Infinity).find(Boolean));
    }
    const w = flood(state.topology, state.tables, { from });
    return w.received.has(to) ? null : tuple(walkStop(state.topology, w, to));
  });
  assert.deepEqual(observed, c.stops);
  if (c.leak) for (const [from, to] of [c.leak, [...c.leak].reverse()]) {
    assert.ok(flood(state.topology, state.tables, { from }).arrivals.some(a => a.host === to));
  }
});
test('fixture map covers every catalogue planter', () => {
  assert.deepEqual([...new Set(cases.map(c => c.code))].sort(), catalogue.map(c => c.code).sort());
});
test('one VLAN changes in grouped RouterOS rows; Cisco all retains every other effective VLAN', () => {
  const routeros = { R1: { vlans: [{ vids: [10, 20], tagged: ['r', 'bridge1'], untagged: [] }] } };
  const a = plant(routeros, { code: 'bridge-not-tagged', device: 'R1', port: 'bridge1', vid: 10 }, 'routeros');
  assert.deepEqual(a.R1.vlans, [
    { vids: [10], tagged: ['r'], untagged: [] }, { vids: [20], tagged: ['r', 'bridge1'], untagged: [] },
  ]);
  const cisco = { SW1: { vlans: [10, 20], ports: { a: { mode: 'access', vlan: 30 }, t: { mode: 'trunk', allowed: 'all' } } } };
  assert.deepEqual(plant(cisco, { code: 'trunk-missing-vlan', device: 'SW1', port: 't', vid: 10 }, 'cisco').SW1.ports.t.allowed, [1, 20, 30]);
});

import * as F from '../src/sections/vlan/logic/faults-exercise.js';
import { changes, sites } from '../src/sections/vlan/logic/faults.js';
import { two, stick } from './fixtures/vlan3/handwritten.mjs';
import { observeVlan, vlanEvidenceKey } from '../src/engine/vlan-evidence.js';
import { expectedFaultCoverage } from '../src/banks/vlan/validate.js';
import { t } from '../src/sections/vlan/uk.js';
import * as ports from '../src/sections/vlan/logic/ports.js';

test('Astra: trunk-faces-access diagnosis is suppressed only by the VLAN-3 adapter', () => {
  const { task, baseline } = two();
  const faulty = plant(baseline, { code: 'trunk-is-access', device: 'SW2', port: 't', changed: 1 }, 'cisco');
  const configured = ports.check(task, faulty), diagnosed = F.evaluate(task, faulty);
  assert.equal(configured.evidence.probes.find(p => p.diagnosis).diagnosis, 'trunk-faces-access');
  assert.equal(configured.findings.find(f => f.params?.diagnosis).params.diagnosis, 'trunk-faces-access');
  assert.deepEqual(diagnosed.evidence.probes[0].walks, configured.evidence.probes[0].walks);
  assert.equal(diagnosed.findings[0].code, configured.findings[0].code);
  assert.ok(!JSON.stringify(diagnosed).includes('diagnosis'));
});

test('Astra: independent capability matrix demands static and dynamic CPU paths', () => {
  const { task, baseline } = stick('routeros', true);
  const expected = expectedFaultCoverage(task, baseline);
  assert.ok(expected.includes('bridge-not-tagged/R1/bridge1/0/static'));
  assert.ok(!expected.some(k => k.startsWith('bridge-not-tagged/') && k.endsWith('/dynamic')));
  for (const capability of ['static', 'dynamic']) {
    assert.ok(expected.includes(`wrong-encapsulation/R1/bridge1/0/${capability}`));
  }
  const covered = new Set();
  for (const dynamic of [false, true]) {
    for (const d of task.topology.devices.filter(d => d.kind !== 'host')) d.dynamicBridgeTagged = dynamic;
    for (const c of F.analyse(task, baseline).filter(c => c.accepted)) covered.add(`${c.site.key}/${c.site.capability}`);
  }
  const cpu = key => key.startsWith('bridge-not-tagged/') || key.startsWith('wrong-encapsulation/R1/');
  assert.deepEqual([...covered].filter(cpu).sort(), expected.filter(cpu));
  assert.deepEqual(expectedFaultCoverage(task, baseline), expected, 'expectations do not inherit the selected capability');
});

test('Fable: rung 2 uses vendor physical labels, including isolation arrivals', () => {
  for (const vendor of ['cisco', 'routeros']) {
    const { task, baseline } = two(vendor);
    const device = task.topology.devices.find(d => d.id === 'SW2');
    device.ports.find(p => p.id === 't').label = { cisco: 'gi0/9', routeros: 'ether9' };
    task.initialConfiguration = plant(baseline, { code: 'trunk-missing-vlan', device: 'SW2', port: 't', vid: 10 }, vendor);
    const result = F.check(task), hint = F.hints(task, F.initialAnswer(task), { result })[1];
    assert.equal(hint.params.stop.port, vendor === 'cisco' ? 'gi0/9' : 'ether9');
    assert.match(t(hint.code, hint.params), vendor === 'cisco' ? /порт gi0\/9/ : /порт ether9/);
    const leakGrid = { invalid: false, reachability: [], isolation: [{ observed: false, unexpected: [{ from: 'PC1', host: 'PC4', device: 'SW2', port: 't' }] }] };
    assert.equal(F.hints(task, {}, { result: { evidence: { grid: leakGrid } } })[1].params.stop.port, vendor === 'cisco' ? 'gi0/9' : 'ether9');
  }
});

test('Fable: rung 2 resolves compiled attachment labels and retains special ports', () => {
  for (const vendor of ['cisco', 'routeros']) {
    const { task, baseline } = stick(vendor);
    task.topology.devices.find(d => d.id === 'R1').ports[0].label = { cisco: 'gi0/9', routeros: 'ether9' };
    task.initialConfiguration = baseline;
    const attachments = F.compile(task, baseline).topology.attachments;
    const a = attachments.find(a => a.device === 'R1');
    for (const port of ['r', 'svi', 'bridge', 'nic']) {
      const result = { evidence: { attachments, grid: { invalid: false, isolation: [], reachability: [
        { observed: false, from: a.id, to: a.id, stops: [{ device: 'R1', port, code: 'interface-down' }], probe: { code: 'interface-down' } },
      ] } } };
      const { params } = F.hints(task, {}, { result })[1];
      assert.equal(params.from, `R1 ${a.label}`); assert.equal(params.to, `R1 ${a.label}`);
      assert.equal(params.stop.port, port === 'r' ? vendor === 'cisco' ? 'gi0/9' : 'ether9' : port);
      assert.ok(!t('fault-hint-evidence', params).includes(a.id));
    }
  }
});

test('Fable: hints use the last checked grid and ignore unchecked draft changes', () => {
  const { task, baseline } = two();
  task.initialConfiguration = plant(baseline, { code: 'trunk-missing-vlan', device: 'SW2', port: 't', vid: 10 }, 'cisco');
  const faulty = F.initialAnswer(task), fixed = { configuration: baseline };
  const result = F.check(task, faulty), expected = F.hints(task, faulty, { result });
  for (const draft of [faulty, fixed, { configuration: {} }, null]) {
    assert.deepEqual(F.hints(task, draft, { result }), expected);
    assert.deepEqual(F.hints(task, draft), F.hints(task));
  }
  // A hand-checked passing grid updates only after the caller supplies it.
  const checked = { evidence: { grid: F.grid(task, fixed) } };
  assert.equal(F.hints(task, faulty, { result: checked })[1].params.gridPass, true);
});

test('native A to default 1 is planted and has literal directional stops', () => {
  const { task, baseline } = two();
  baseline.SW1.ports.t.native = 10; baseline.SW2.ports.t.native = 10;
  const site = sites(task, baseline).find(s => s.code === 'native-mismatch' && s.device === 'SW2' && s.changed === 1);
  assert.ok(site); assert.equal(site.slot, 'default');
  const faulty = plant(baseline, site, 'cisco');
  assert.equal(faulty.SW2.ports.t.native, 1);
  assert.deepEqual(F.grid({ ...task, initialConfiguration: faulty }).reachability[0].stops.map(tuple), [['SW2', 't', 'not-member'], null]);
  assert.deepEqual(repair(faulty, baseline, site, 'cisco'), baseline);
});

test('RouterOS reveal diff addresses VLAN row fields by index and repairs appended rows', () => {
  const { baseline } = two('routeros');
  const site = { code: 'trunk-missing-vlan', device: 'SW2', port: 't', vid: 10 };
  const faulty = plant(baseline, site, 'routeros');
  assert.deepEqual(changes(baseline, faulty), [{ path: ['SW2', 'vlans', '0', 'tagged'], before: ['t'], after: [] }]);
  const appended = { code: 'access-wrong-vlan', device: 'SW1', port: 'a', changed: 30 };
  assert.deepEqual(repair(plant(baseline, appended, 'routeros'), baseline, appended, 'routeros'), baseline);
});

test('visible evidence key ignores segment nesting but retains direction and probe code', () => {
  const stop = { device: 'SW2', port: 't', code: 'not-member' };
  const observation = stops => ({ invalid: false, isolation: [], reachability: [{ id: 'PC1:PC3', expected: true, observed: false, stops, probe: { code: 'no-path' } }] });
  const flat = observation([stop, null]), nested = observation([[[stop]], [null]]);
  assert.equal(vlanEvidenceKey(flat), vlanEvidenceKey(nested));
  assert.notEqual(vlanEvidenceKey(flat), vlanEvidenceKey(observation([null, stop])));
  const otherProbe = structuredClone(flat); otherProbe.reachability[0].probe.code = 'gateway-unreachable';
  assert.notEqual(vlanEvidenceKey(flat), vlanEvidenceKey(otherProbe));
});

test('level-1 allowed-list variants are ambiguous, but PC-facing trunk is a fourth identifiable cause', () => {
  const { task, baseline } = two(); task.level = 1;
  const missing = plant(baseline, { code: 'trunk-missing-vlan', device: 'SW2', port: 't', vid: 10 }, 'cisco');
  const wrongAllowed = structuredClone(baseline); wrongAllowed.SW2.ports.t.allowed = [20, 30];
  assert.equal(vlanEvidenceKey(observeVlan(task, F.compile(task, missing))), vlanEvidenceKey(observeVlan(task, F.compile(task, wrongAllowed))));
  const accepted = F.analyse(task, baseline).filter(c => c.accepted);
  assert.deepEqual([...new Set(accepted.map(c => c.site.code))].sort(), ['access-is-trunk', 'access-wrong-vlan', 'trunk-is-access', 'trunk-missing-vlan']);
  assert.deepEqual([...new Set(accepted.filter(c => c.site.code === 'access-wrong-vlan').map(c => c.site.device))].sort(), ['SW1', 'SW2']);
});

test('literal fixture sites use the fixture address family and ordinary VID pool', () => {
  for (const vendor of ['cisco', 'routeros']) {
    const { task, baseline } = stick(vendor), found = sites(task, baseline);
    assert.deepEqual(found.filter(s => s.code === 'router-address-wrong-network').map(s => s.changed), ['10.10.11.1', '10.10.12.1']);
    assert.deepEqual(found.filter(s => s.code === 'wrong-encapsulation').map(s => s.changed), [30, 30]);
  }
});
