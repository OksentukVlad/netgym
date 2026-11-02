import { check, solution } from './static.js';
import { compressedRows, fullySafe, hasSafeShape, routeCounts } from './table-tools.js';

export const optimiserVersion = 'opt1bc-v2.1-dp-2';
export { routeCounts } from './table-tools.js';

/** One deterministic pass over exact (c), then unknown-dont-care (a) minima.
 * This finds a shortest known safe variant, not a global network minimum. */
export function optimise(task) {
  let answer = solution(task);
  if (!fullySafe(check(task, answer))) throw new Error(`Unsafe reference: ${task.identity.taskId}/${task.identity.variantId}`);
  const referenceTotal = routeCounts(task, answer).total;
  for (const device of task.network.devices.filter(d => Object.hasOwn(task.variant.scaffold, d.id))) {
    const candidates = [false, true].map((dontCare, order) => ({ rows: compressedRows(task, answer, device.id, dontCare), order }))
      .filter(c => c.rows && c.rows.length < (answer[device.id] ?? []).length)
      .sort((a, b) => a.rows.length - b.rows.length || a.order - b.order);
    for (const { rows, order } of candidates) {
      const candidate = { ...answer, [device.id]: rows };
      if (order === 1 && !hasSafeShape(task, candidate, device.id)) continue;
      if (fullySafe(check(task, candidate))) { answer = candidate; break; }
    }
  }
  if (!fullySafe(check(task, answer))) throw new Error('Unsafe final optimiser assembly');
  return { answer, ...routeCounts(task, answer), referenceTotal, method: optimiserVersion };
}
