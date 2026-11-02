// Routing semantics on the current bank, ported from the round 1 apps'
// self-tests when the apps were retired (step 8). The apps' own data and
// grader tests went with them; their grading is replayed in full by
// routing-grading-replay.test.mjs (10,708 frozen verdicts), and their labels,
// topology and commands by routing-bank and routing-syntax. What stays here
// are the hand-written expectations: task 10's verified alternatives, task
// 15's distances, row names without addresses, summary and link names, task
// 4's row order, a wrong mask on every row and where the DHCP explanation
// appears.
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import routing, { checkRow } from './helpers/routing.mjs';
import { topology } from '../src/sections/routing/logic/topology.js';
import { syntaxes, syntaxList } from '../src/sections/routing/syntax/index.js';
import { hasDhcpWan } from '../src/sections/routing/screens/facts.js';
import { prefixToMask } from '../src/engine/ip.js';

const alternatives = {
  'R1:10.3.0.0/30': ['10.2.0.2'],
  'R2:10.2.0.0/30': ['10.3.0.2'],
  'R3:10.1.0.0/30': ['10.3.0.1'],
};
const byNumber = n => tasks.find(t => t.displayNumber === n);
const create = (n, variantId) => routing.create(byNumber(n), { variantId: variantId ?? byNumber(n).variants[0].id });
const answerFor = (syntax, route, dist = route.distance > 1 ? String(route.distance) : '') => ({ ...syntaxes[syntax].fromRoute(route, false), dist });
function* rows() {
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id });
    for (const [router, list] of Object.entries(variant.referenceRoutes)) for (const [index, route] of list.entries()) yield { record, task, router, index, route };
  }
}

test('every row accepts only its gateway and the three verified task 10 alternatives', () => {
  for (const { record, task, router, index, route } of rows()) {
    const label = `${task.variant.code} ${router} row ${index + 1}`;
    const expected = record.displayNumber === 10 ? alternatives[`${router}:${route.dst}/${route.prefix}`] ?? [] : [];
    assert.deepEqual(route.alternatives ?? [], expected, label);
    const own = record.network.devices.find(d => d.id === router).interfaces.filter(i => i.address).map(i => i.address.ip);
    const all = record.network.devices.flatMap(d => d.interfaces.filter(i => i.address).map(i => i.address.ip));
    for (const syntax of syntaxList) {
      const answer = answerFor(syntax.id, route);
      // A discard row (task 17's R-CORE, OPT-1a) has no gateway: Cisco's
      // answer says Null0 there, RouterOS's leaves it empty (blackhole).
      const accepted = new Set(route.discard ? [answer.gw] : [route.via, ...expected]);
      for (const gw of new Set([...all, ...accepted, '203.0.113.254', ''])) {
        assert.equal(checkRow(task, router, index, { ...answer, gw }, syntax.id).ok, accepted.has(gw), `${label} ${syntax.id}: gateway ${gw}`);
      }
      for (const gw of own) assert.equal(checkRow(task, router, index, { ...answer, gw }, syntax.id).gwOk, false, `${label}: own IP`);
    }
  }
});

test('every row rejects a valid but wrong mask or prefix, in both syntaxes (step 8 fix)', () => {
  // Restores what the round 1 grader self-tests covered row by row: the right
  // network and gateway with any other contiguous mask is never accepted.
  let checked = 0;
  for (const { task, router, index, route } of rows()) {
    for (const syntax of syntaxList) {
      const answer = answerFor(syntax.id, route);
      for (let prefix = 0; prefix <= 32; prefix++) {
        if (prefix === route.prefix) continue;
        const wrong = syntax.id === 'cisco' ? { ...answer, mask: prefixToMask(prefix) } : { ...answer, dst: `${route.dst}/${prefix}` };
        const result = checkRow(task, router, index, wrong, syntax.id);
        const label = `${task.variant.code} ${router} row ${index + 1} ${syntax.id} /${prefix}`;
        assert.equal(result.ok, false, label);
        assert.equal(syntax.id === 'cisco' ? result.maskOk : result.dstOk, false, label);
        checked++;
      }
      // The right mask is still accepted (the corpus's control case).
      assert.equal(checkRow(task, router, index, answer, syntax.id).ok, true, `${task.variant.code} ${router} row ${index + 1} ${syntax.id}`);
    }
  }
  assert.ok(checked > 7000, String(checked));
});

test('task 15 requires a backup distance of 2–255 and permits an implicit primary distance 1', () => {
  const task = create(15);
  for (const syntax of syntaxList) {
    const [primary, backup] = task.variant.referenceRoutes.R1;
    assert.equal(primary.distance ?? 1, 1);
    assert.equal(backup.distance, 2);
    const check = (route, index, dist) => checkRow(task, 'R1', index, { ...answerFor(syntax.id, route), dist }, syntax.id);
    for (const dist of ['', undefined, '1']) assert.equal(check(primary, 0, dist).ok, true, `primary ${dist}`);
    for (const dist of ['0', '2', '3', '1.5']) assert.equal(check(primary, 0, dist).ok, false, `primary ${dist}`);
    for (const dist of ['', undefined, '0', '1', '256', '2.5', '-2', 'два']) assert.equal(check(backup, 1, dist).ok, false, `backup ${dist}`);
    for (const dist of ['2', '3', '10', '255']) assert.equal(check(backup, 1, dist).ok, true, `backup ${dist}`);
  }
});

test('every row names its destination without giving away the address', () => {
  for (const { task, router, index, route } of rows()) for (const syntax of syntaxList) {
    const { label } = routing.scaffold(task, syntax.id)[router][index];
    assert.ok(label && label !== 'віддалена підмережа', `${task.variant.code} ${router} ${route.dst}: no name`);
    assert.ok(!label.includes(route.dst), `${task.variant.code} ${router}: label shows ${route.dst}`);
    assert.ok(!label.startsWith('→'), `${task.variant.code} ${router}: a link named by a port note`);
  }
});

test('task 4 rows name the destination graded at that index', () => {
  const task = create(4);
  for (const syntax of syntaxList) {
    const [a, b] = routing.scaffold(task, syntax.id).R2;
    assert.deepEqual([a.label, b.label], ['LAN1', 'LAN3']);
    const [ra, rb] = task.variant.referenceRoutes.R2;
    assert.equal(checkRow(task, 'R2', 0, answerFor(syntax.id, ra), syntax.id).ok, true);
    assert.equal(checkRow(task, 'R2', 0, answerFor(syntax.id, rb), syntax.id).ok, false);
  }
});

test('summary rows name the LANs they cover; link rows are named as links', () => {
  for (const syntax of syntaxList) {
    const t16 = routing.scaffold(create(16), syntax.id)['R-INET'];
    assert.equal(t16[0].label, 'LAN1, LAN2, LAN3 одним сумарним маршрутом');
    assert.equal(t16[1].label, 'лінк R-CORE–R-AGG1');
    const t8 = create(8);
    const index = t8.variant.referenceRoutes.R3.findIndex(r => r.dst === '10.0.0.0' && r.prefix === 30);
    assert.equal(routing.scaffold(t8, syntax.id).R3[index].label, 'лінк R1–R2');
  }
});

test('the DHCP explanation is limited to dynamically addressed WAN routers', () => {
  const dhcp = (n, router) => hasDhcpWan(topology(byNumber(n).network, 'cisco'), router);
  assert.equal(dhcp(2, 'R1'), true);
  assert.equal(dhcp(15, 'R1'), false);
  assert.equal(dhcp(16, 'R-INET'), true);
  assert.equal(dhcp(1, 'R1'), false);
});
