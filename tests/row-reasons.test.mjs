import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { create, checkRow } from './helpers/routing.mjs';
import { rowReasons, rowVerdict, reasonCodes } from '../src/sections/routing/logic/rowReasons.js';
import { syntaxList, syntaxes } from '../src/sections/routing/syntax/index.js';
import { t } from '../src/sections/routing/uk.js';

const task = create(tasks[0]);
const right = { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2' };
const reasons = (patch, syntax = 'cisco', exercise = task, router = 'R1', index = 0) => {
  const fields = { ...(syntax === 'cisco' ? right : { dst: '192.168.2.0/24', gw: right.gw }), ...patch };
  return rowReasons(exercise, router, index, fields, syntax, rowVerdict(checkRow(exercise, router, index, fields, syntax)));
};

test('row reasons: destination and mask precedence use strict vendor spelling', () => {
  for (const [patch, expected] of [
    [{ net: '' }, { net: 'empty' }],
    [{ net: '192.168.002.0' }, { net: 'invalid-ip' }],
    [{ net: '192,168,2,0' }, { net: 'invalid-ip' }],
    [{ net: '192.168.2.1' }, { net: 'dst-not-network' }],
    [{ net: '192.168.2.1', mask: '/24' }, { net: 'wrong-destination', mask: 'mask-not-dotted' }],
    [{ net: '192.168.2.1', mask: '255.255.0.0' }, { net: 'wrong-destination', mask: 'wrong-mask' }],
    [{ net: '203.0.113.0' }, { net: 'wrong-destination' }],
    [{ mask: '' }, { mask: 'empty' }],
    [{ mask: '/24' }, { mask: 'mask-not-dotted' }],
    [{ mask: '255.0.255.0' }, { mask: 'invalid-mask' }],
    [{ mask: '255.255.255.000' }, { mask: 'invalid-mask' }],
    [{ mask: '255.255.0.0' }, { mask: 'wrong-mask' }],
  ]) assert.deepEqual(reasons(patch), expected, JSON.stringify(patch));
  for (const [dst, code] of [
    ['', 'empty'], ['garbage/33', 'invalid-ip'], ['192.168.002.0/24', 'invalid-ip'],
    ['192.168.2.0', 'invalid-prefix'], ['192.168.2.0/33', 'invalid-prefix'],
    ['192.168.2.1/024', 'invalid-prefix'], ['192.168.2.0/24/1', 'invalid-prefix'],
    ['192.168.2.1/24', 'dst-not-network'], ['203.0.113.0/24', 'wrong-destination'],
  ]) assert.deepEqual(reasons({ dst }, 'routeros'), { dst: code }, dst);
  assert.deepEqual(reasons({ net: ' 192.168. 2.0 ', mask: '255.255. 255.0', gw: '10.0. 0.2' }), {});
  assert.deepEqual(reasons({ dst: '192.168.2.0 /24', gw: ' 10.0.0.2 ' }, 'routeros'), {});
  const defaults = create(tasks[2], { variantId: 'defaults' });
  assert.deepEqual(reasons({ dst: '0.0.0.00.0.0.0', gw: '192.168.0.2' }, 'routeros', defaults), {});
});

test('row reasons: gateway precedence, unused hosts, neighbours and unknown DHCP networks', () => {
  for (const [gw, code] of [
    ['', 'empty'], ['10.0.0.02', 'invalid-ip'], ['garbage', 'invalid-ip'],
    ['10.0.0.1', 'gateway-is-self'], ['192.168.1.1', 'gateway-is-self'],
    ['203.0.113.1', 'gateway-off-link'], ['10.0.0.0', 'gateway-not-host'],
    ['10.0.0.3', 'gateway-not-host'], ['192.168.1.0', 'gateway-not-host'],
    ['192.168.1.255', 'gateway-not-host'], ['192.168.1.50', 'gateway-not-router'],
    ['192.168.1.2', 'gateway-not-router'],
  ]) assert.deepEqual(reasons({ gw }), { gw: code }, gw);
  const dhcp = create(tasks[1]);
  const verdict = { gwOk: false };
  assert.deepEqual(rowReasons(dhcp, 'R1', 0, { gw: '203.0.113.1' }, 'cisco', verdict), { gw: 'gateway-mismatch' });
  assert.deepEqual(rowReasons(dhcp, 'R1', 0, { gw: '172.16.0.0' }, 'cisco', verdict), { gw: 'gateway-not-host' });
  for (const [number, router, index, gateway] of [
    [10, 'R2', 2, '10.1.0.1'], [15, 'R1', 0, '100.64.2.1'], [15, 'R1', 1, '100.64.1.1'],
  ]) {
    const exercise = create(tasks[number - 1]);
    // Diagnose a neighbour mismatch independently of a reference path policy.
    const result = rowReasons(exercise, router, index, { gw: gateway }, 'cisco', verdict);
    assert.deepEqual(result, { gw: 'gateway-mismatch' });
  }
});

test('row reasons: task 10 direct-neighbour policy and a summary use neutral mismatch wording', () => {
  for (const [number, router, index, wrongIndex] of [[10, 'R1', 0, 2], [14, 'R-HQ', 0, 1]]) {
    const exercise = create(tasks[number - 1]);
    for (const syntax of syntaxList) {
      const fields = syntax.fromRoute(exercise.variant.referenceRoutes[router][index], false);
      fields.gw = exercise.variant.referenceRoutes[router][wrongIndex].via;
      const verdict = rowVerdict(checkRow(exercise, router, index, fields, syntax.id));
      assert.equal(verdict.gwOk, false);
      assert.deepEqual(rowReasons(exercise, router, index, fields, syntax.id, verdict), { gw: 'gateway-mismatch' });
    }
  }
});

test('row reasons: task 15 distance policy is role based and has no cross-row comparison', () => {
  const exercise = create(tasks[14]);
  for (const syntax of syntaxList) for (const index of [0, 1]) {
    const base = syntax.fromRoute(exercise.variant.referenceRoutes.R1[index], true);
    for (const dist of ['', '1', '2', '255', '256', '0', '-1', '2.5', 'two', '01']) {
      const fields = { ...base, dist };
      const verdict = rowVerdict(checkRow(exercise, 'R1', index, fields, syntax.id));
      const result = rowReasons(exercise, 'R1', index, fields, syntax.id, verdict);
      const expected = index === 0 ? ['', '1'].includes(dist) ? undefined : 'primary-distance'
        : ['2', '255'].includes(dist) ? undefined : dist === '' ? 'backup-needs-distance'
          : ['2.5', 'two'].includes(dist) ? 'invalid-distance' : 'backup-needs-higher-distance';
      assert.equal(result.dist, expected, `${syntax.id} ${index} ${dist}`);
    }
  }
});

test('row reasons and feedback: one code per wrong field, booleans only, neutral fallback', () => {
  const exercise = create(tasks[14]);
  const fields = { net: '', mask: '', gw: '', dist: 'two' };
  const verdict = rowVerdict(checkRow(exercise, 'R1', 1, fields, 'cisco'));
  assert.ok(Object.values(verdict).every(value => typeof value === 'boolean'));
  const result = rowReasons(exercise, 'R1', 1, fields, 'cisco', verdict);
  assert.deepEqual(result, { net: 'empty', mask: 'empty', gw: 'empty', dist: 'invalid-distance' });
  assert.equal(syntaxes.cisco.feedback(verdict, result).parts.join('').split('\n').length, 5);
  assert.deepEqual(rowReasons(task, 'R1', 0, { dist: 'two' }, 'cisco', { distOk: false }), { dist: 'field-wrong' });
  assert.deepEqual(rowReasons(task, 'absent', 0, { gw: '203.0.113.1' }, 'cisco', { gwOk: false }), { gw: 'field-wrong' });
  assert.deepEqual(syntaxes.routeros.feedback({ ok: false, gwOk: false }, {}).parts, ['❌ Помилка.', '\n', 'Перевір це поле.']);
  for (const code of reasonCodes) assert.ok(!t(`routing.static.${code}`).startsWith('['), code);
  assert.deepEqual(rowReasons(exercise, 'R1', 0, { dist: '1' }, 'cisco', { distOk: false }), { dist: 'field-wrong' });
  assert.deepEqual(rowReasons(exercise, 'R1', 1, { dist: '2' }, 'routeros', { distOk: false }), { dist: 'field-wrong' });
  assert.throws(() => rowReasons(task, 'R1', 0, {}, 'missing', {}), RangeError);
  // Removing reference values has no effect on diagnosis.
  const noReferences = { ...task, variant: { scaffold: task.variant.scaffold } };
  assert.deepEqual(rowReasons(noReferences, 'R1', 0, { gw: '10.0.0.1' }, 'cisco', { gwOk: false }), { gw: 'gateway-is-self' });
});
