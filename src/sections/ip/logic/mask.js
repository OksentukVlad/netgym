import { makeRng } from '../../../engine/rng.js';
import * as core from './mask-core.js';

export const id = 'ip.mask';
export const version = 1;
export const codes = core.codes;
export const levels = core.levels;

/** Bankless generator; the original task shape passes through unchanged. */
export function create(_record, { seed, level = 1 } = {}) {
  return core.generate(makeRng(seed), level);
}

/** Preserve the core's field evidence in finding params for its exact copy. */
export function check(task, answer) {
  const result = core.check(task, answer);
  const { ok, code, ...params } = result;
  return { ok, complete: ok, code, findings: ok ? [] : [{ code, severity: 'blocks', params }], evidence: result };
}

/** Return just the requested field's choices. */
export const options = (task, field) => core.options(task)[field];
export const hints = core.hints;
export const solution = core.solution;
export default { id, version, codes, create, check, options, hints, solution };
