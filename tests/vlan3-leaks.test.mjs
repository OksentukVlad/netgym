import test from 'node:test';
import assert from 'node:assert/strict';
import { record } from '../src/banks/vlan/faults.js';
import * as F from '../src/sections/vlan/logic/faults-exercise.js';
import { catalogue } from '../src/sections/vlan/logic/faults.js';
import { t } from '../src/sections/vlan/uk.js';
const { renderFaultContract } = await import('../.test-bundles/harness/vlan3.mjs');
const forbidden = /^(?:faultCode|fault|site|baseline|canonical|canonicalFix|correct|accepted|answer|solution|candidates|signature|repaired)$/i;
function scan(value, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) { assert.ok(!forbidden.test(key), `${path}.${key}`); scan(v, `${path}.${key}`); }
}
for (const shape of record.variants) for (const vendor of shape.syntaxes) test(`Z7 pre-assistance data and rendered contract have no fault metadata: ${shape.id}/${vendor}`, () => {
  const i = F.inspect(record, { variantId: shape.id, vendor, level: 3, seed: 'leaks' }), task = i.task, answer = F.initialAnswer(task);
  const snapshot = structuredClone(task.initialConfiguration), initialGrid = F.grid(task);
  const payloads = { task, key: task.instanceKey, description: F.describe(task), grid: initialGrid, hints: F.hints(task, answer) };
  scan(task); assert.equal(Object.getOwnPropertySymbols(task).length, 0);
  const values = JSON.stringify(payloads, (_, v) => v instanceof Set ? [...v] : v);
  for (const c of catalogue) assert.ok(!values.includes(c.code), `${shape.id}/${vendor}: ${c.code}`);
  assert.equal(payloads.hints.length, 2);
  assert.deepEqual(F.hints(task, answer, { rung: 3 }), payloads.hints, 'asking for eagerly built hints without assistance stays safe');
  const failed = F.check(task, answer);
  const html = renderFaultContract(task, answer) + renderFaultContract(task, answer, failed);
  const noChoiceValues = html.replace(/value="[^"]*"/g, '');
  for (const c of catalogue) assert.ok(!noChoiceValues.includes(c.code));
  assert.doesNotMatch(html, /data-(?:correct|answer)|checked=""|canonical|Окремий приклад/);
  // Every option is exposed equally; there is no hidden correct flag or
  // checked radio. The symptom grid's observed booleans are intentional.
  assert.equal((html.match(/type="radio"/g) ?? []).length, F.options(task, 'cause').length * 2);
  const edited = structuredClone(answer); edited.configuration = {};
  F.check(task, edited);
  assert.deepEqual(task.initialConfiguration, snapshot); assert.deepEqual(F.grid(task), initialGrid);
  const assisted = F.hints(task, answer, { rung: 3, assisted: true });
  assert.equal(assisted.length, 3); assert.equal(assisted[2].assisted, true); assert.ok(t(assisted[2].code, assisted[2].params));
  assert.deepEqual(F.solution(task).before.configuration, snapshot);
});
