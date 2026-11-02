import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import binary, { generatorVersion, isIncomplete } from '../src/sections/ip/logic/binary.js';
import { toInt, network, broadcast, bits8, prefixToMask } from '../src/engine/ip.js';
import { copy, t } from '../src/sections/ip/uk.js';
import { leaks } from './helpers/binary-leaks.mjs';

const fixed = binary.create(null, { ip: '192.168.10.77', prefix: 26, level: 3 });
const rows = [
  ['11000000', '10101000', '00001010', '01001101'],
  ['11111111', '11111111', '11111111', '11000000'],
  ['11000000', '10101000', '00001010', '01000000'],
  ['11000000', '10101000', '00001010', '01111111'],
];
const wrongCodes = ['wrong-binary', 'wrong-mask', 'wrong-and', 'wrong-or'];
for (let step = 0; step < 4; step++) test(`binary step ${step}: hand-written answer, completion and first-wrong-octet findings`, () => {
  assert.deepEqual(binary.check(fixed, { step, octets: rows[step] }), { ok: true, complete: step === 3, code: 'ok', findings: [] });
  const wrong = [...rows[step]];
  wrong[1] = wrong[1][0] === '1' ? `0${wrong[1].slice(1)}` : `1${wrong[1].slice(1)}`;
  wrong[3] = wrong[3][0] === '1' ? `0${wrong[3].slice(1)}` : `1${wrong[3].slice(1)}`;
  assert.deepEqual(binary.check(fixed, { step, octets: wrong }), {
    ok: false, complete: false, code: wrongCodes[step], findings: [{ code: wrongCodes[step], severity: 'blocks', field: 'octet', entity: 1, params: { octet: 2, current: parseInt(wrong[1], 2), target: parseInt(rows[step][1], 2) } }],
  });
  wrong[1] = rows[step][1];
  assert.deepEqual(binary.check(fixed, { step, octets: wrong }).findings, [{ code: wrongCodes[step], severity: 'blocks', field: 'octet', entity: 3,
    params: { octet: 4, current: parseInt(wrong[3], 2), target: parseInt(rows[step][3], 2) } }], 'repairing the first exposes the later wrong octet');
  const invalid = [...rows[step]]; invalid[2] = '22222222';
  assert.deepEqual(binary.check(fixed, { step, octets: invalid }).findings, [{ code: 'invalid-bits', severity: 'blocks', field: 'octet', entity: 2, params: { octet: 3, current: null, target: parseInt(rows[step][2], 2) } }]);
});

test('binary: invalid steps and invalid bit shapes carry no reference answers', () => {
  for (const step of [-1, 4, 1.5, '2', undefined, null]) assert.equal(binary.check(fixed, { step }).code, 'invalid-step');
  for (const octets of [[], ['0', '0', '0', '0'], [...rows[0], '00000000'], 'wrong', null]) {
    const result = binary.check(fixed, { step: 0, octets });
    assert.equal(result.code, 'invalid-bits');
    assert.equal(result.complete, false);
    assert.equal(leaks(fixed, JSON.stringify(result), 'rule').length, 0);
  }
  for (const params of [{ ip: 'bad', prefix: 26 }, { ip: null, prefix: 26 }, { ip: '192.168.10.77', prefix: null }, { ip: '192.168.10.77' }, { prefix: 26 }, { seed: NaN }, { seed: -1 }, { seed: {} }]) assert.throws(() => binary.create(null, params), RangeError);
});

test('binary: completeness supports text and tri-state cells, without treating malformed complete text as incomplete', () => {
  assert.equal(isIncomplete({ octets: rows[0] }), false);
  assert.equal(isIncomplete(rows[0].map(octet => [...octet])), false);
  for (const octets of [undefined, [], Array(4), Array.from({ length: 4 }, () => Array(8)), rows[0].slice(0, 3), ['', ...rows[0].slice(1)], ['0000000', ...rows[0].slice(1)], rows[0].map(octet => [...octet].map((bit, i) => i === 3 ? '' : bit))]) assert.equal(isIncomplete(octets), true);
  assert.equal(isIncomplete(['22222222', ...rows[0].slice(1)]), false);
});

test('binary: all 200 seeds are deterministic, private, non-boundary and cover the allowed prefixes', () => {
  const seen = new Set(), ranges = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const task = binary.create(null, { seed, level: 3 });
    assert.deepEqual(task, binary.create(null, { seed, level: 3 }));
    assert.ok(task.prefix >= 17 && task.prefix <= 30 && task.prefix !== 24);
    assert.ok(task.ip.startsWith('10.') || task.ip.startsWith('192.168.'));
    assert.ok(toInt(task.ip) > toInt(network(task.ip, task.prefix)));
    assert.ok(toInt(task.ip) < toInt(broadcast(task.ip, task.prefix)));
    assert.equal(task.mask, prefixToMask(task.prefix));
    assert.equal(task.identity.generatorVersion, generatorVersion);
    assert.equal(task.identity.seed, seed);
    assert.equal(task.instanceKey, JSON.stringify(task.identity));
    assert.equal('steps' in task, false, 'public task never carries answer rows');
    seen.add(task.prefix); ranges.add(task.ip.startsWith('10.') ? '10' : '192.168');
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), binary.prefixes);
  assert.equal(ranges.size, 2);
  assert.notEqual(binary.create(null, { seed: 1 }).instanceKey, binary.create(null, { seed: '1' }).instanceKey);
  assert.notEqual(fixed.instanceKey, binary.create(null, { ip: '192.168.10.78', prefix: 26 }).instanceKey);
});

test('binary: fixed-seed v2 replay goldens protect generation and all four answer rows', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/binary-v2.json', import.meta.url)));
  assert.equal(fixture.generatorVersion, 2, 'historical answers remain an independent oracle');
  assert.equal(generatorVersion, 3);
  for (const row of fixture.rows) {
    const task = binary.create(null, { seed: row.seed, level: 3 });
    const { ip, prefix, ...base } = row.task.identity;
    const identity = { ...base, generatorVersion, level: 3, ip, prefix };
    assert.deepEqual(task, { ...row.task, level: 3, identity, instanceKey: JSON.stringify(identity) });
    assert.deepEqual(binary.solution(task), row.solution);
  }
  assert.deepEqual(binary.solution(fixed).steps, rows.map((octets, step) => ({ step, octets })));
});

test('binary: 200-seed provenance gate covers all rungs, feedback, accessible descriptions and copy payloads', () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = binary.create(null, { seed, level: 3 });
    for (let step = 0; step < 4; step++) {
      const hints = binary.hints(task, null, { step });
      assert.equal(hints.length, 3);
      assert.deepEqual(hints.map(h => h.rung), [1, 2, 3]);
      for (const hint of hints) {
        const surface = t(`binary.${hint.code}`, hint.params);
        const context = { step, example: hint.params };
        assert.deepEqual(leaks(task, surface, hint.provenance, context), [], `${seed}/${step}/${hint.code}: ${surface}`);
        assert.deepEqual(leaks(task, JSON.stringify(hint), hint.provenance, context), [], 'copy/data payload');
      }
      const current = binary.solution(task).steps[step].octets;
      const exampleBits = Object.entries(hints[2].params).filter(([k]) => k.endsWith('Bits')).map(([, v]) => v);
      assert.notEqual(hints[2].params.prefix, task.prefix);
      assert.ok(exampleBits.every(value => !current.includes(value)));
      const wrong = binary.check(task, { step, octets: Array(4).fill('01010101') });
      assert.deepEqual(leaks(task, JSON.stringify(wrong), 'rule', { step }), []);
      for (const finding of wrong.findings) assert.deepEqual(leaks(task, t(`binary.${finding.code}`), 'rule', { step }), []);
      assert.deepEqual(leaks(task, binary.describe(task), 'rule', { step }), []);
    }
  }
});

test('binary leak gate: rejects planted reference leaks and permits matching given/learner/example provenance', () => {
  const mask = rows[1].join(' ');
  assert.ok(leaks(fixed, mask, 'reference', { step: 0, sourceStep: 1 }).length);
  assert.ok(leaks(fixed, `<button aria-label="${rows[2][3]}">?</button>`, 'unattributed', { step: 2 }).length);
  assert.ok(leaks(fixed, JSON.stringify({ copy: rows[3] }), 'unattributed', { step: 0 }).length);
  assert.deepEqual(leaks(fixed, mask, 'learner', { step: 1, octets: rows[1] }), [], 'repeated 11111111 is allowed when learner-entered');
  assert.deepEqual(leaks(fixed, rows[2].join(' '), 'accepted', { step: 3, octets: rows[2] }), []);
  assert.deepEqual(leaks(fixed, `${fixed.ip} /${fixed.prefix} ${fixed.mask}`, 'given'), []);
  assert.deepEqual(leaks(fixed, mask, 'reference', { revealed: true }), []);
  assert.ok(leaks(fixed, rows[2][3], 'learner', { octets: rows[0] }).length);
  const hint = binary.hints(fixed, null, { step: 2 })[2];
  assert.ok(leaks(fixed, t(`binary.${hint.code}`, hint.params), 'independent-example', { step: 2, example: { ...hint.params, prefix: fixed.prefix } }).length);
  assert.ok(leaks(fixed, '192.168.10.64', 'given').length);
});

test('binary: every code has rendered Ukrainian copy, every step has three hints, invalid step has none', () => {
  for (const code of binary.codes) assert.ok(`binary.${code}` in copy);
  assert.match(binary.describe(fixed), /128, 64, 32, 16, 8, 4, 2, 1/);
  for (let step = 0; step < 4; step++) for (const hint of binary.hints(fixed, {}, { step })) assert.ok(t(`binary.${hint.code}`, hint.params).length);
  assert.deepEqual(binary.hints(fixed, null, { step: 9 }), []);
});
