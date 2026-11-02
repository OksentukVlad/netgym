import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { record } from '../src/banks/vlan/faults.js';
import * as F from '../src/sections/vlan/logic/faults-exercise.js';
const before = JSON.parse(readFileSync(new URL('./fixtures/rf1/vlan3-before.json', import.meta.url)));
test('A6 VLAN-3: 72 fixed instances and all public payloads serialize byte-identically to the pre-extraction capture', () => {
  for (const { params, sha256 } of before) {
    const task = F.create(record, params), answer = F.solution(task);
    const bytes = JSON.stringify([task, F.initialAnswer(task), F.options(task, 'cause'), F.grid(task),
      F.check(task, F.initialAnswer(task)), F.check(task, answer), F.hints(task),
      F.hints(task, answer, { rung: 3, assisted: true }), answer, F.describe(task)]);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, JSON.stringify(params));
  }
});
