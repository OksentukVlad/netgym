import { bits8, blockSize, broadcast, fromInt, network, parseIp, parsePrefix, prefixToMask, toInt } from '../../../engine/ip.js';
import { makeRng } from '../../../engine/rng.js';
import { t } from '../uk.js';

export const id = 'ip.binary';
export const version = 2;
export const generatorVersion = 3;
export const levels = 3;
export const steps = ['address', 'mask', 'network', 'broadcast'];
export const weights = [128, 64, 32, 16, 8, 4, 2, 1];
export const prefixes = Array.from({ length: 14 }, (_, i) => i + 17).filter(p => p !== 24);
export const codes = [
  'ok', 'wrong-binary', 'wrong-mask', 'wrong-and', 'wrong-or', 'invalid-bits', 'invalid-step', 'incomplete',
  ...steps.flatMap(step => [`${step}-question`, `${step}-rule`, `${step}-example`]), 'weights',
];
const octets = address => address.split('.').map(n => bits8(Number(n)));
const validStep = step => Number.isInteger(step) && step >= 0 && step < 4;
const rowAddress = (task, step) => [task.ip, task.mask, network(task.ip, task.prefix), broadcast(task.ip, task.prefix)][step];

/** Four seeded rows. Explicit {ip,prefix} is also supported for contracts and
 * future links; generated tasks use private space and never a boundary host.
 * No answer rows are stored on the public task object.
 */
export function create(_record, { seed = 0, level = 1, ip, prefix } = {}) {
  if (!Number.isInteger(level) || level < 1 || level > levels) throw new RangeError('Invalid binary level');
  if (!(typeof seed === 'string' || (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff))) throw new RangeError('Invalid binary seed');
  if (ip === undefined && prefix === undefined) {
    const rng = makeRng(seed);
    // Keep the level-3 RNG sequence and addresses identical to generator 2.
    prefix = rng.pick(level === 1 ? prefixes.filter(p => p >= 25) : level === 2 ? [24] : prefixes);
    const address = rng.int(0, 1) === 0 ? `10.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(0, 255)}`
      : `192.168.${rng.int(0, 255)}.${rng.int(0, 255)}`;
    ip = fromInt(toInt(network(address, prefix)) + rng.int(1, blockSize(prefix) - 2));
  }
  if (typeof ip !== 'string' || typeof prefix !== 'number' || parseIp(ip) !== ip || parsePrefix(prefix) !== prefix) throw new RangeError('Invalid binary task address or prefix');
  if (level === 1 && (prefix < 25 || prefix > 30) || level === 2 && prefix !== 24) throw new RangeError('Prefix does not match binary level');
  const identity = { formatVersion: 1, exerciseId: id, version, generatorVersion, seed, level, ip, prefix };
  return { ip, prefix, level, mask: prefixToMask(prefix), identity, instanceKey: JSON.stringify(identity) };
}

/** Only level 1 exposes fixed octets; editable octets contain no answer bits.
 * Both input methods must render given octets read-only and use draft() on
 * restore/edit/submit, so a stale draft cannot replace immutable givens. */
export function row(task, step) {
  if (!validStep(step)) throw new RangeError('Invalid binary step');
  const given = task.level === 1 ? octets(rowAddress(task, step)).slice(0, 3) : [];
  return { step, octets: Array.from({ length: 4 }, (_, entity) => entity < given.length
    ? { provenance: 'given', bits: given[entity] } : { provenance: 'learner', bits: null }) };
}
export function draft(task, { step, octets: input } = {}) {
  const values = Array.isArray(input) ? input : [];
  return { step, octets: row(task, step).octets.map((octet, entity) => octet.provenance === 'given'
    ? octet.bits : values[entity] ?? '00000000') };
}

/** Legacy completeness helper. The current walk starts with zeros and checks
 * every row; do not use this to suppress its blank first check. Accepts an
 * answer, string[4], or tri-state cell[4][8].
 */
export function isIncomplete(answer) {
  const values = Array.isArray(answer) ? answer : answer?.octets;
  return !Array.isArray(values) || values.length < 4 || Array.from(values).some(value =>
    typeof value === 'string' ? value.length < 8 : Array.isArray(value)
      ? value.length < 8 || Array.from(value).some(cell => cell === '' || cell === undefined || cell === null)
      : value === undefined || value === null);
}

/** Pure per-row grading: only the first wrong octet is flagged, with decimal
 * current/target sums, never reference bits. `entity` is zero-based.
 * Only the broadcast row can complete.
 */
export function check(task, answer) {
  if (!validStep(answer?.step)) return { ok: false, complete: false, code: 'invalid-step', findings: [{ code: 'invalid-step', severity: 'blocks' }] };
  const expected = octets(rowAddress(task, answer.step));
  const wrongCode = ['wrong-binary', 'wrong-mask', 'wrong-and', 'wrong-or'][answer.step];
  const input = Array.isArray(answer.octets) ? answer.octets : [];
  const values = row(task, answer.step).octets.map((octet, entity) => octet.provenance === 'given' ? octet.bits : input[entity]);
  const findings = [];
  for (const [entity, bits] of expected.entries()) {
    const code = typeof values[entity] !== 'string' || !/^[01]{8}$/.test(values[entity]) ? 'invalid-bits'
      : values[entity] !== bits ? wrongCode : null;
    if (code) {
      findings.push({ code, severity: 'blocks', field: 'octet', entity, params: {
        octet: entity + 1, current: /^[01]{8}$/.test(values[entity]) ? parseInt(values[entity], 2) : null, target: parseInt(bits, 2),
      } });
      break;
    }
  }
  if (!findings.length && answer.octets?.length > 4) findings.push({ code: 'invalid-bits', severity: 'blocks', field: 'octets' });
  const ok = findings.length === 0;
  return { ok, complete: ok && answer.step === 3, code: ok ? 'ok' : findings.some(f => f.code === 'invalid-bits') ? 'invalid-bits' : wrongCode, findings };
}

/** One independent worked octet, not a full mask row (whose 0/255 octets
 * would necessarily overlap the task). Use a different /25–/30 and choose
 * all displayed binary operands/results disjoint from the current answer.
 * Decimal 198.51.100.x context is a documentation example, not a task value.
 */
function example(task, step) {
  const forbidden = new Set(octets(rowAddress(task, step)));
  for (let prefix = 25; prefix <= 30; prefix++) {
    if (prefix === task.prefix) continue;
    for (let x = 1; x < 255; x++) {
      const ip = `198.51.100.${x}`;
      if (ip === network(ip, prefix) || ip === broadcast(ip, prefix)) continue;
      const addressBits = bits8(x), maskBits = octets(prefixToMask(prefix))[3];
      const networkBits = octets(network(ip, prefix))[3], broadcastBits = octets(broadcast(ip, prefix))[3];
      const shown = step === 0 ? { addressBits } : step === 1 ? { maskBits }
        : step === 2 ? { addressBits, maskBits, networkBits } : { networkBits, maskBits, broadcastBits };
      if (Object.values(shown).some(value => forbidden.has(value))) continue;
      return { ip, prefix, octet: 4, ...shown };
    }
  }
  throw new RangeError('No disjoint binary example');
}

/** Signature shared with useExercise: ex.hints({step}). Three rungs per row;
 * opening a rung calls ex.hint() once to mark the instance assisted.
 */
export function hints(task, answer, { step = 0 } = {}) {
  if (!validStep(step)) return [];
  const name = steps[step];
  const params = step === 0 ? { weights: [...weights] } : step === 1 ? { prefix: task.prefix } : {};
  const first = check(task, draft(task, { step, octets: answer?.step === step ? answer.octets : [] })).findings[0];
  return [
    { code: `${name}-question`, params: first?.params ?? {}, rung: 1, provenance: 'evidence' },
    { code: `${name}-rule`, params, rung: 2, provenance: 'given' },
    { code: `${name}-example`, params: example(task, step), rung: 3, provenance: 'independent-example' },
  ];
}

/** Reveal path only: caller uses ex.solution, which is null until revealed. */
export function solution(task) {
  return { steps: steps.map((_, step) => ({ step, octets: octets(rowAddress(task, step)) })) };
}

/** Accessible text for the static weight strip; no answer or mask bits. */
export function describe(_task) {
  return t('binary.weights', { weights });
}

export default { id, version, generatorVersion, levels, codes, steps, weights, prefixes, create, row, draft, check, isIncomplete, hints, solution, describe };
