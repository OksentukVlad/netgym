import test from 'node:test';
import assert from 'node:assert/strict';
import { bankId, bankRevision, tasks } from '../src/banks/routing/tasks.js';
import { create } from './helpers/routing.mjs';
import { generatorVersion } from '../src/engine/renumber.js';
import { parseCode, formatCode, letters, variants, codeErrors } from '../src/sections/routing/logic/codes.js';
import { ui } from '../src/sections/routing/uk.js';

test('code registry is permanent, frozen and agrees with the bank and generator', () => {
  assert.deepEqual(letters.A, { exerciseId: 'routing.static', bankId, bankRevision, formatVersion: 1, generatorVersion });
  assert.equal(Object.keys(variants).length, 19);
  assert.ok(Object.isFrozen(letters)); assert.ok(Object.isFrozen(letters.A)); assert.ok(Object.isFrozen(variants));
  for (const record of tasks) for (const v of record.variants) assert.deepEqual(variants[v.code], { taskId: record.id, variantId: v.id });
});

test('the four refusal codes are logic; their four distinct sentences are the section’s strings', () => {
  assert.deepEqual([...codeErrors], ['unknown-letter', 'unknown-variant', 'bad-seed', 'infeasible']);
  assert.ok(Object.isFrozen(codeErrors));
  assert.deepEqual(Object.keys(ui.address.codeErrors).sort(), [...codeErrors].sort(), 'one sentence per code, none extra');
  assert.equal(new Set(Object.values(ui.address.codeErrors)).size, 4, 'four distinct sentences');
  for (const sentence of Object.values(ui.address.codeErrors)) assert.ok(typeof sentence === 'string' && sentence.length > 10);
});

test('every variant round trips base and generated descriptors including seed zero', () => {
  for (const record of tasks) for (const v of record.variants) {
    const identity = create(record, { variantId: v.id }).identity;
    assert.deepEqual(parseCode(formatCode(identity)), identity);
    for (const seed of [0, 42, 9999]) {
      const generated = { ...identity, seed, generatorVersion };
      assert.equal(formatCode(generated), `A${v.code}-${String(seed).padStart(4, '0')}`);
      assert.deepEqual(parseCode(formatCode(generated)), generated);
    }
  }
});

test('codes accept outer whitespace, letter case, Cyrillic A and bounded ASCII seeds', () => {
  const expected = parseCode('A3b-0042');
  for (const text of [' A3B-42 ', 'a3b–42', 'А3b 0042', 'а3B-042', '\na3b-0042\t']) assert.deepEqual(parseCode(text), expected);
  assert.equal(parseCode('A17-0').seed, 0); assert.equal(parseCode('A17-9999').seed, 9999);
  assert.equal(parseCode('А3b').generatorVersion, null); assert.equal(parseCode('А3b').seed, null);
});

test('codes typed on a Ukrainian keyboard: Cyrillic в is b, an em dash separates; other letters are an unknown variant', () => {
  const expected = parseCode('A3b-0042');
  for (const text of ['А3в-42', 'а3В-0042', 'A3в 42', 'A3b—42', 'А3в—0042']) assert.deepEqual(parseCode(text), expected, text);
  assert.deepEqual(parseCode('А8в'), parseCode('A8b'));
  assert.equal(parseCode('А8в').seed, null);
  for (const value of ['А3вв-42', 'A17ж-1', 'A3bв', 'A3б-42', 'A3ии', 'Ф3иb']) assert.deepEqual(parseCode(value), { code: 'unknown-variant' }, value);
  for (const value of ['A3b——42', 'A3b—', 'A3b —42']) assert.deepEqual(parseCode(value), { code: 'bad-seed' }, value);
});

test('the Ukrainian layout left on: the keys A and b give Ф and и, read as A and b', () => {
  assert.deepEqual(parseCode('Ф3и-4821'), parseCode('A3b-4821'));
  assert.deepEqual(parseCode('ф8И'), parseCode('A8b'));
  assert.deepEqual(parseCode('Ф17-0042'), parseCode('A17-0042'));
  assert.deepEqual(parseCode('A3и'), parseCode('A3b'));
});

test('codes reject every error path and never reinterpret an unknown task number', () => {
  for (const value of [null, '', 'B3-0042', 'Б3', '1A3']) assert.deepEqual(parseCode(value), { code: 'unknown-letter' });
  for (const value of ['A', 'A0', 'A18', 'A3c', 'A03', 'A18-12', 'A30042', 'A1b', 'A-3']) assert.deepEqual(parseCode(value), { code: 'unknown-variant' }, value);
  for (const value of ['A3-', 'A3--42', 'A3-+42', 'A3-1.2', 'A3-10000', 'A3-１２', 'A3-٤٢', 'A3-42x', 'A3 -42', 'A3  42', 'A3\t42', 'A3-42-1']) assert.deepEqual(parseCode(value), { code: 'bad-seed' }, value);
});

test('format rejects non-executable or inconsistent identities', () => {
  const identity = parseCode('A3b-42');
  for (const patch of [{ bankRevision: 2 }, { bankId: 'other' }, { exerciseId: 'other' }, { formatVersion: 2 }, { generatorVersion: 2 }, { taskId: 'other' }, { variantId: 'other' }, { seed: -1 }, { seed: 10000 }, { seed: 0.5 }, { seed: '42' }, { seed: null }]) assert.throws(() => formatCode({ ...identity, ...patch }), RangeError);
  assert.throws(() => formatCode(null), RangeError);
});
