import { validateSetupRecord } from '../../../engine/vendors/setup-record.js';
import { ciscoPrompts, capabilities } from '../../../engine/vendors/setup-capabilities.js';
export { capabilities };

export const prompts = ciscoPrompts;
export const validSeed = seed => typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed));
export const clone = value => JSON.parse(JSON.stringify(value));

// The bank lint entry point re-exports this same shared implementation.
export const validate = validateSetupRecord;
export const validRecord = record => validateSetupRecord(record).length === 0;

/** Answer contains only learner input. Phase and earning belong to state.js. */
export function initialAnswer(task) {
  return { order: [...task.order], prompts: Object.fromEntries((capabilities(task).prompts.length ? task.order : []).map(id => [id, null])),
    typed: Object.fromEntries(task.typedIds.map(id => [id, ''])), assisted: [] };
}
