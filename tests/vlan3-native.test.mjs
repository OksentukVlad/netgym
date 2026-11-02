import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCisco, flood } from '../src/engine/l2.js';
import { compile } from '../src/sections/vlan/logic/faults-exercise.js';
import { render } from '../src/sections/vlan/logic/render.js';
import { two } from './fixtures/vlan3/handwritten.mjs';

test('Z5 default native 1 preserves the prior compiler and render output', () => {
  const { task, baseline } = two(), c = baseline.SW1;
  const explicit = structuredClone(c); explicit.ports.t.native = 1;
  assert.deepEqual(compileCisco(c), compileCisco(explicit));
  assert.equal(render({ SW1: c }, 'cisco', task.topology).SW1, render({ SW1: explicit }, 'cisco', task.topology).SW1);
  assert.doesNotMatch(render({ SW1: c }, 'cisco', task.topology).SW1, /native vlan/);
});
test('Z5 native is the PVID and untagged membership only when allowed and created', () => {
  const c = { vlans: [10], ports: { t: { mode: 'trunk', allowed: [10, 20], native: 10 } } };
  let r = compileCisco(c); assert.equal(r.table.ports.t.pvid, 10); assert.ok(r.table.members[10].untagged.has('t'));
  c.ports.t.allowed = [20]; r = compileCisco(c); assert.equal(r.table.members[10], undefined);
  c.ports.t.allowed = [10, 20]; c.vlans = []; r = compileCisco(c); assert.equal(r.table.members[10], undefined);
});
for (const invalid of [0, 4095, 1002, '10', null]) test(`Z5 invalid native VLAN is a form finding: ${JSON.stringify(invalid)}`, () => {
  const r = compileCisco({ vlans: [10], ports: { t: { mode: 'trunk', allowed: [10], native: invalid } } });
  assert.ok(r.findings.some(f => f.severity === 'blocks' && f.field === 'ports.t.native'));
});
for (const [from, to, sender, receiver, sourceVid, receivedVid] of [
  ['PC1', 'PC4', 'SW1', 'SW2', 10, 20], ['PC4', 'PC1', 'SW2', 'SW1', 20, 10],
]) test(`Z5 native mismatch leaks on the wire: ${from} → ${to}`, () => {
  const { task, baseline } = two(); baseline.SW1.ports.t.native = 10; baseline.SW2.ports.t.native = 20;
  const { topology, tables } = compile(task, baseline), w = flood(topology, tables, { from });
  const out = w.hops.find(h => h.device === sender).out.find(o => o.port === 't');
  assert.deepEqual(out, { port: 't', tagged: false, vid: sourceVid });
  const input = w.hops.find(h => h.device === receiver); assert.equal(input.tagged, false); assert.equal(input.vid, receivedVid);
  assert.ok(w.arrivals.some(a => a.host === to && !a.tagged));
  assert.match(render(baseline, 'cisco', topology)[sender], new RegExp(`switchport trunk native vlan ${sourceVid}`));
  baseline[receiver].ports.t.allowed = [sourceVid];
  const restricted = compile(task, baseline);
  assert.ok(!flood(restricted.topology, restricted.tables, { from }).arrivals.some(a => a.host === to));
});
