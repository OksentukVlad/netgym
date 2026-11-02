import { renumber as place, addressMapper, mapAddresses, placementIssues, generatorVersion } from '../../../engine/renumber.js';
import { validateBank } from '../../../engine/validate-routing-bank.js';
import { check, solution } from './static.js';
import { fullySafe, hasSafeShape, routeCounts } from './table-tools.js';

export { generatorVersion };
const baseResult = (bank, record, variant) => bank?.frozen?.results[`${record.id}/${variant.id}`];

/** No seedless fallback for a generated or unsupported identity. */
export function frozenFor(task, bank) {
  if (!bank) return null;
  const { bankId, bankRevision } = bank;
  const i = task.identity;
  if (i.formatVersion !== 1 || i.exerciseId !== 'routing.static' || i.bankId !== bankId || i.bankRevision !== bankRevision
    || i.taskId !== task.record.id || i.variantId !== task.variant.id || task.instanceKey !== JSON.stringify(i)) return null;
  const result = baseResult(bank, task.record, task.variant);
  if (!result) return null;
  if (i.seed === null && i.generatorVersion === null && !task.record.generation) return result;
  const g = task.record.generation;
  if (!g || i.generatorVersion !== generatorVersion || g.generatorVersion !== i.generatorVersion || g.seed !== i.seed) return null;
  return { ...result, answer: mapAddresses(result.answer, addressMapper(g.units)) };
}

const taskOf = (record, variant) => ({ record, variant, network: record.network, identity: { taskId: record.id } });
const demoVerdicts = result => result.evidence.demonstrations.map(d => ({ id: d.id, ok: d.ok, code: d.code,
  request: d.request?.stop?.code, requestDevice: d.request?.stop?.deviceId, reply: d.reply?.stop?.code }));

/** Full acceptance, including advice, safe shape, counts and demonstration
 * outcomes. Kept outside the engine so dependency boundaries stay intact. */
export function acceptanceIssues(original, mapped, answers, bank) {
  const issues = [...validateBank([mapped]).map(i => i.code), ...placementIssues(original, mapped)];
  for (const [index, variant] of mapped.variants.entries()) {
    const task = taskOf(mapped, variant), reference = solution(task), result = baseResult(bank, original, original.variants[index]);
    if (!result || !answers[index]) { issues.push('missing-frozen-answer'); continue; }
    const expectedDemos = original.demonstrations?.length
      ? demoVerdicts(check(taskOf(original, original.variants[index]), solution(taskOf(original, original.variants[index])))) : [];
    for (const [label, answer] of [['reference', reference], ['frozen', answers[index]]]) {
      const assessment = check(task, answer);
      if (!fullySafe(assessment)) issues.push(`${variant.code}/${label}/unsafe`);
      for (const router of Object.keys(variant.scaffold)) if (!hasSafeShape(task, answer, router)) issues.push(`${variant.code}/${label}/${router}/shape`);
      if (JSON.stringify(demoVerdicts(assessment)) !== JSON.stringify(expectedDemos)) issues.push(`${variant.code}/${label}/demonstration`);
      for (const demo of mapped.demonstrations ?? []) if (demo.kind === 'summary-hole') {
        const result = assessment.evidence.demonstrations.find(d => d.id === demo.id);
        if (result?.code !== 'discarded' || result.request?.stop?.code !== 'discarded') issues.push(`${variant.code}/${label}/hole-not-discarded`);
      }
    }
    if (JSON.stringify(routeCounts(task, answers[index])) !== JSON.stringify({ counts: result.counts, total: result.total })
      || routeCounts(task, reference).total !== result.referenceTotal) issues.push(`${variant.code}/counts`);
  }
  return issues;
}

/** Checked section adapter: every variant is accepted together, so retries and
 * networks never depend on whether the student opened 3 or 3b (8 or 8b). */
export function renumber(record, variantId, seed, bank) {
  const frozenAnswers = record.variants.map(v => baseResult(bank, record, v)?.answer ?? {});
  return place(record, variantId, seed, { frozenAnswers,
    accept: (mapped, answers) => acceptanceIssues(record, mapped, answers, bank).length === 0 });
}
