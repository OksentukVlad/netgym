// A guided row's check (round 2 step 6, spec §2.3 and appendix 4): the
// reference-free form check first (the syntax's validateFields, then
// validateRoute on the network), then the frozen checkRow for the row's
// step 5 verdict and reasons. checkRow alone still accepts a backup distance
// of 255; the form check rejects it, so the row says so. Pure: no React.
import { checkRow, slotDestination, validateRoute } from '../logic/static.js';
import { rowReasons, rowVerdict } from '../logic/rowReasons.js';

const OK_KEY = { net: 'netOk', mask: 'maskOk', dst: 'dstOk', gw: 'gwOk', dist: 'distOk' };

/** The field a form code is about in a syntax, or null («empty» and
 * «invalid-ip» can be any field; checkRow marks those itself). */
export function fieldOfCode(code, syntaxId) {
  const cisco = syntaxId === 'cisco';
  switch (code) {
    case 'invalid-distance': return 'dist';
    case 'mask-not-dotted': case 'invalid-mask': case 'invalid-prefix': case 'wrong-mask': return cisco ? 'mask' : 'dst';
    case 'dst-not-network': return cisco ? 'net' : 'dst';
    case 'blackhole-with-gateway': case 'discard-with-gateway': case 'discard-mismatch':
    case 'gateway-is-self': case 'gateway-off-link': case 'gateway-not-host': case 'gateway-not-router': return 'gw';
    default: return null;
  }
}

/** Reference-free form check of a row's text: the first code, or null. */
export function formCode(syntax, network, routerId, values) {
  return syntax.validateFields(values) ?? validateRoute(network, routerId, syntax.toRoute(values));
}

/** A guided row's form check: the row's own network under a wrong mask is the
 * mask's fault, never the address's (Олена 2). Its network comes from the row's
 * scaffold, which the row's label already shows; a free row has none, so the
 * code stays «dst-not-network», which names both fields. */
export function rowFormCode(task, routerId, index, values, syntax) {
  const code = formCode(syntax, task.network, routerId, values);
  if (code !== 'dst-not-network') return code;
  const row = task.variant.scaffold[routerId]?.[index];
  const destination = row ? slotDestination(task, row) : null;
  return destination && syntax.toRoute(values)?.dst === destination.dst ? 'wrong-mask' : code;
}

/** True when a row has any text at all (untouched empty rows are ignored). */
export const hasText = values => Object.values(values ?? {}).some(v => v !== false && String(v ?? '').trim() !== '');

/**
 * The verdict of «Перевірити» on guided row `index` of `routerId`.
 * @returns {{ detail: object, override: Object<string,string>|null }}
 *   detail: checkRow's grading booleans, with the form check's field marked
 *   wrong where checkRow let it through; override: that field's reason code.
 */
export function rowCheck(task, routerId, index, values, syntax) {
  const detail = rowVerdict(checkRow(task, routerId, index, values, syntax.id));
  const code = rowFormCode(task, routerId, index, values, syntax);
  const field = code && fieldOfCode(code, syntax.id);
  const key = field && OK_KEY[field];
  if (!key || !(key in detail) || detail[key] === false) return { detail, override: null };
  return { detail: { ...detail, ok: false, [key]: false }, override: { [field]: code } };
}

/** The row's reasons: checkRow's (step 5), with the form check's override. */
export function rowCheckReasons(task, routerId, index, values, syntax, detail, override) {
  return { ...rowReasons(task, routerId, index, values, syntax.id, detail), ...(override ?? {}) };
}
