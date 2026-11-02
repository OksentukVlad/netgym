// The VLAN walks in motion (VLAN-anim spec v2, Y1–Y11): the pure step list
// (src/sections/vlan/screens/walkSteps.js), tested in Node on hand-written
// walks and on the logic's own evidence. The mounted lifecycle (no frame
// before a commit or check, skip, replay, the stale verdict, reduced motion,
// the laps) is in tests/helpers/mounted-vlan.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, traceScene, walkScene } from '../src/sections/vlan/screens/diagram.js';
import * as M from '../src/sections/vlan/screens/walkSteps.js';
import * as R from '../src/sections/vlan/screens/routeState.js';
import predict, { commit, initialCommitState } from '../src/sections/vlan/logic/predict.js';
import route from '../src/sections/vlan/logic/route.js';
import { switchReference, routerReference } from '../src/sections/vlan/logic/route-model.js';
import { record as predictRecord } from '../src/banks/vlan/predict.js';
import { records as routeRecords } from '../src/banks/vlan/route.js';
import { hop, out, transit, transitCisco } from './helpers/vlan.mjs';
import { compileAll } from '../src/sections/vlan/logic/model.js';
import { flood } from '../src/engine/l2.js';

/** Two switches, a trunk; hand-written. PC1 (SW1 a) sends; SW1 classifies into VLAN 20 and floods. */
function twoSwitches() {
  const topology = {
    devices: [
      { id: 'SW1', kind: 'switch', ports: ['a', 'b', 'c', 't'].map(id => ({ id, label: { cisco: id, routeros: id } })) },
      { id: 'SW2', kind: 'switch', ports: ['t', 'd'].map(id => ({ id, label: { cisco: id, routeros: id } })) },
      ...['PC1', 'PC2', 'PC3', 'PC4'].map(id => ({ id, kind: 'host', ports: [{ id: 'nic', label: { cisco: 'nic', routeros: 'nic' } }] })),
    ],
    links: [
      { a: { device: 'PC1', port: 'nic' }, b: { device: 'SW1', port: 'a' } },
      { a: { device: 'PC2', port: 'nic' }, b: { device: 'SW1', port: 'b' } },
      { a: { device: 'PC3', port: 'nic' }, b: { device: 'SW1', port: 'c' } },
      { a: { device: 'SW1', port: 't' }, b: { device: 'SW2', port: 't' } },
      { a: { device: 'PC4', port: 'nic' }, b: { device: 'SW2', port: 'd' } },
    ],
    hosts: ['PC1', 'PC2', 'PC3', 'PC4'].map((device, i) => ({ device, ip: `192.168.20.${i + 2}`, prefix: 24 })),
  };
  const walk = {
    from: 'PC1', received: new Set(['PC2', 'PC4']), arrivals: [], attachmentArrivals: [],
    hops: [
      hop('PC1', null, false, null, [out('nic', false, null)]),
      // Classified into VLAN 20: out untagged to PC2, tagged 20 on the trunk; PC3's port is another VLAN (quiet).
      hop('SW1', 'a', false, 20, [out('b', false, 20), out('t', true, 20)], [{ port: 'c', code: 'not-allowed-out' }], false),
      hop('PC2', 'nic', false, null),
      hop('SW2', 't', true, 20, [out('d', false, 20)], [], false),
      hop('PC4', 'nic', false, null),
    ],
  };
  return { topology, walk, geo: layout(topology, 'cisco') };
}
const linkOf = (topology, a, b) => topology.links.findIndex(l => [l.a.device, l.b.device].sort().join() === [a, b].sort().join());

test('flood motion: one token per real egress, by causal depth; the wire form on links; «VLAN N» only where a bridge classified', () => {
  const { topology, walk, geo } = twoSwitches();
  const m = M.floodMotion(geo, walk);
  assert.equal(m.total, 3, 'PC1 → SW1, then SW1 fans out (one step), then SW2 → PC4');
  const at = s => m.moves.filter(x => x.step === s).map(x => `${x.from}>${x.to}:${x.tagged ? `T${x.vid}` : 'u'}`).sort();
  assert.deepEqual(at(0), ['PC1|nic>SW1|a:u']);
  assert.deepEqual(at(1), ['SW1|b>PC2|nic:u', 'SW1|t>SW2|t:T20'], 'a broadcast fans out in parallel: one step per depth, not per port');
  assert.deepEqual(at(2), ['SW2|d>PC4|nic:u']);
  assert.ok(!m.moves.some(x => x.to === 'PC3|nic'), 'a blocked egress has no token (Y4)');
  // Y1: «VLAN 20» inside SW1 and SW2 while the frame leaves them; never on a link.
  assert.deepEqual(m.chips.map(c => `${c.step}:${c.device}|${c.port}:${c.vid}`), ['1:SW1|a:20', '2:SW2|t:20']);
  // What shows when: the quiet mark once the frame is at SW1; PC2 when its token arrives.
  assert.deepEqual(m.reveal.drops, { 0: [0] });
  assert.deepEqual(m.reveal.hosts, { PC2: [1], PC4: [2] });
  assert.deepEqual(m.reveal.carried[linkOf(topology, 'SW1', 'SW2')], [1]);
  // The steps in the spec's form.
  const steps = M.walkSteps(geo, { walk });
  assert.deepEqual(steps.map(s => s.tokens.length), [1, 2, 1]);
  assert.deepEqual(steps[1].marks.sort(), ['host:PC2', 'vlan:SW1|20']);
});

test('flood motion: the scene builds up and ends as the static walk; nothing reached before its token got there', () => {
  const { walk, geo } = twoSwitches();
  const m = M.floodMotion(geo, walk);
  const start = M.sceneAt(m, 0);
  assert.deepEqual([start.received, start.drops, Object.keys(start.carried)], [[], [], []], 'step 0: nothing yet');
  assert.equal(start.source, 'PC1');
  const mid = M.sceneAt(m, 2);
  assert.deepEqual(mid.received, ['PC2'], 'PC2 after its token; PC4 not yet');
  assert.equal(mid.drops.length, 1, 'the quiet mark at SW1');
  assert.deepEqual(M.sceneAt(m, m.total), walkScene(geo, walk), 'the end frame is the static scene (Y11)');
});

test('flood motion: a transparent hop and an ingress drop keep the wire form; the dropped token stops at the port (Y1, Y4)', () => {
  const { walk, geo } = twoSwitches();
  const transparent = structuredClone({ ...walk, received: [] });
  transparent.received = new Set(['PC2']);
  transparent.hops[1] = hop('SW1', 'a', false, null, [out('b', false, null), out('t', false, null)], [], true);
  transparent.hops[3] = hop('SW2', 't', false, null, [], [{ port: 't', code: 'untagged-not-admitted' }], false);
  transparent.hops.splice(4, 1);
  const m = M.floodMotion(geo, transparent);
  assert.deepEqual(m.chips, [], 'no «VLAN N»: the bridge passed the frame unchanged; SW2 rejected it at ingress');
  assert.ok(m.moves.filter(x => x.step === 1).every(x => !x.tagged), 'without a tag on the trunk too: the wire form, never an inserted 802.1Q header');
  assert.deepEqual(m.reveal.drops, { 0: [1] }, 'SW2’s ✕ once the token reached it');
  assert.equal(m.total, 2, 'nothing travels on from a rejected frame');
  // A native VLAN leaves a Cisco trunk untagged: the badge says «без тега».
  const native = structuredClone(twoSwitches().walk);
  native.received = new Set(['PC2', 'PC4']);
  native.hops[1] = hop('SW1', 'a', false, 1, [out('b', false, 1), out('t', false, 1)], [], false);
  native.hops[3] = hop('SW2', 't', false, 1, [out('d', false, 1)], [], false);
  const n = M.floodMotion(geo, native);
  assert.ok(n.moves.every(x => !x.tagged && x.vid === null));
  assert.deepEqual(n.chips.map(c => c.vid), [1, 1], 'inside, the VLAN the walk says');
});

test('flood motion on the engine’s own walks: every shape, the timing check (about 1.8 s at most)', () => {
  const topology = transit();
  const tables = compileAll(topology, transitCisco, 'cisco').tables;
  const walk = flood(topology, tables, { from: 'PC1' });
  const geo = layout(topology, 'cisco');
  const m = M.floodMotion(geo, walk);
  assert.deepEqual(M.sceneAt(m, m.total), walkScene(geo, walk));
  assert.equal(m.moves.length, walk.hops.reduce((n, h) => n + h.out.length, 0), 'one token per real hop.out');
  let longest = 0;
  for (const variantId of ['p1', 'p2', 'p3']) for (const vendor of ['cisco', 'routeros']) for (const seed of [1, 2, 3, 4, 5]) for (const surprises of [0, 1, 2]) {
    const task = predict.create(predictRecord, { variantId, seed, vendor, surprises });
    const right = predict.solution(task);
    let state = initialCommitState(task);
    for (const round of task.rounds) {
      state = commit(task, state, round.id, right[round.id]);
      const walkOf = state.result.evidence[round.id].walk;
      const g = layout(task.topology, vendor);
      const motion = M.floodMotion(g, walkOf);
      longest = Math.max(longest, motion.total);
      assert.deepEqual(M.sceneAt(motion, motion.total), walkScene(g, walkOf), `${variantId}/${vendor}/${seed}`);
    }
  }
  assert.ok(longest * M.STEP_MS <= 2000, `the largest VLAN-1 walk takes ${longest * M.STEP_MS} ms`);
});

test('trace motion («Між VLAN»): no fan-out; the frame ends at R1, a routing pause, a new frame leaves; the end frame is the static trace (Y2, Y3)', () => {
  const task = route.create(routeRecords[0], { seed: 5, syntax: 'cisco' });
  const ref = { SW1: switchReference(task, 'SW1', 'cisco'), R1: routerReference(task, 'cisco') };
  const result = route.check(task, ref, { syntax: 'cisco' });
  const probe = R.shownProbe(task, result, null), atts = result.evidence.attachments;
  const lines = R.deviceLines(task, route.configuration(task, ref, 'cisco'), 'cisco');
  const geo = layout(task.topology, 'cisco', { lines, hostLines: 5 });
  const m = M.traceMotion(geo, task.topology, probe.request, atts);
  assert.deepEqual(m.moves.map(x => `${x.step}:${x.from}>${x.to}:${x.tagged ? `T${x.vid}` : 'u'}:f${x.frame}`), [
    `0:${probe.request.from}|nic>SW1|${task.topology.links.find(l => l.a.device === probe.request.from).b.port}:u:f1`,
    `1:SW1|t>R1|r:T${task.goals[probe.from]}:f1`,
    `3:R1|r>SW1|t:T${task.goals[probe.to]}:f2`,
    `4:SW1|${task.topology.links.find(l => l.a.device === probe.to).b.port}>${probe.to}|nic:u:f2`,
  ], 'one token per segment hop; step 2 is the routing pause; the routed one is a new frame');
  assert.deepEqual(m.captions, [{ step: 2, router: 'R1' }]);
  assert.equal(m.total, 5);
  // Only the segment's own target is received; R1's incoming interface lights first.
  const atRouter = M.sceneAt(m, 2);
  assert.deepEqual(atRouter.received, []);
  assert.equal(Object.values(atRouter.ifaces).filter(v => v === 'received').length, 1);
  assert.deepEqual(M.sceneAt(m, m.total), traceScene(geo, task.topology, probe.request, atts), 'the timeline doesn’t change the static scene');
  // Request then reply (Y9, Y10): within the lap's cap.
  const reply = M.traceMotion(geo, task.topology, probe.reply, atts);
  const seq = M.sequence([m, reply]);
  assert.equal(seq.total, 10);
  assert.deepEqual([M.runAt(seq, 4).index, M.runAt(seq, 5).index, M.runAt(seq, 5).local], [0, 1, 0]);
  assert.ok(seq.total * M.stepMsFor(seq.total, true) <= M.LAP_MS, 'the lap within routing’s cap');
  assert.equal(M.stepMsFor(10, false), M.STEP_MS);
});

test('trace motion: a failure never invents a journey; its stop shows when the token gets there; tokens on the link geometry', () => {
  const task = route.create(routeRecords[0], { seed: 5, syntax: 'cisco' });
  const blank = route.initialAnswer(task, 'cisco');
  const result = route.check(task, blank, { syntax: 'cisco' });
  const failure = R.routeFailure(result);
  const trace = failure.probe[failure.direction];
  const geo = layout(task.topology, 'cisco', { hostLines: 5 });
  const m = M.traceMotion(geo, task.topology, trace, result.evidence.attachments);
  assert.equal(m.moves.length, 2, 'PC → SW1 → R1’s port, where the shut parent drops it; nothing beyond');
  assert.deepEqual(m.reveal.drops, { 0: [1] });
  assert.equal(M.sceneAt(m, 1).drops.length, 0);
  assert.equal(M.sceneAt(m, 2).drops.length, 1);
  const [token] = M.tokensAt(geo, m, 1);
  const trunk = geo.links.find(l => l.kind === 'trunk');
  assert.ok(token.trunk && token.tagged && token.from.x === trunk.line.x1 && [trunk.line.y1, trunk.line.y2].includes(token.from.y) && [trunk.line.y1, trunk.line.y2].includes(token.to.y));
  assert.equal(M.tokensAt(geo, m, 5).length, 0);
});
