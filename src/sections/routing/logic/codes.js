// Permanent registry. Never edit an existing letter to mean a new bank or
// generator; add a letter and keep the old implementation executable.
export const letters = Object.freeze({
  A: Object.freeze({ exerciseId: 'routing.static', bankId: 'routing.class-16', bankRevision: 1, formatVersion: 1, generatorVersion: 1 }),
});
const variant = (number, id = 'main') => Object.freeze({ taskId: `routing.task-${String(number).padStart(2, '0')}`, variantId: id });
export const variants = Object.freeze({
  '1': variant(1), '2': variant(2), '3': variant(3, 'explicit-routes'), '3b': variant(3, 'defaults'),
  '4': variant(4), '5': variant(5), '6': variant(6), '7': variant(7), '8': variant(8, 'specific'),
  '8b': variant(8, 'stub-defaults'), '9': variant(9), '10': variant(10), '11': variant(11),
  '12': variant(12), '13': variant(13), '14': variant(14), '15': variant(15), '16': variant(16), '17': variant(17),
});
/** Every refusal a code can get: parseCode's three, and create()'s
 * `infeasible` for a seed whose addresses can't be built. Their sentences
 * are the section's strings (uk.js ui.address.codeErrors). */
export const codeErrors = Object.freeze(['unknown-letter', 'unknown-variant', 'bad-seed', 'infeasible']);

/** Anchored and bounded. The optional seed suffix has one separator (`-`, an
 * en or em dash, or a space); bare numeric suffixes are never guessed as a
 * different task plus a seed. Two Ukrainian-keyboard slips are read back:
 * retyping the code by its look gives «А3в-4821» (Cyrillic А and в), and
 * typing «A3b» with the Ukrainian layout on gives «Ф3и-4821» (the same keys).
 * So А and Ф are read as A, and в and и as b. Any other letters after the
 * number belong to the variant token, so they are an unknown variant. */
export function parseCode(input) {
  if (typeof input !== 'string') return { code: 'unknown-letter' };
  const text = input.trim().replace(/^[АаФф]/u, 'A');
  const letter = text[0]?.toUpperCase(), entry = letters[letter];
  if (!entry) return { code: 'unknown-letter' };
  const match = /^([0-9]+[a-zа-яіїєґ]*)(.*)$/iu.exec(text.slice(1));
  const v = match && variants[match[1].toLowerCase().replace(/[ви]/gu, 'b')];
  if (!v) return { code: 'unknown-variant' };
  let seed = null;
  if (match[2]) {
    const suffix = /^[-–— ]([0-9]{1,4})$/u.exec(match[2]);
    if (!suffix) return { code: 'bad-seed' };
    seed = Number(suffix[1]);
  }
  return { formatVersion: entry.formatVersion, exerciseId: entry.exerciseId, bankId: entry.bankId, bankRevision: entry.bankRevision,
    taskId: v.taskId, variantId: v.variantId, generatorVersion: seed === null ? null : entry.generatorVersion, seed };
}

export function formatCode(descriptor) {
  const i = descriptor ?? {};
  const letter = Object.keys(letters).find(l => {
    const e = letters[l];
    return ['formatVersion', 'exerciseId', 'bankId', 'bankRevision'].every(k => i[k] === e[k])
      && (i.seed === null ? i.generatorVersion === null : i.generatorVersion === e.generatorVersion);
  });
  if (!letter) throw new RangeError('Unknown share-code identity');
  const code = Object.keys(variants).find(c => variants[c].taskId === i.taskId && variants[c].variantId === i.variantId);
  if (!code) throw new RangeError('Unknown share-code variant');
  if (i.seed !== null && (!Number.isInteger(i.seed) || i.seed < 0 || i.seed > 9999)) throw new RangeError('Invalid share-code seed');
  return `${letter}${code}${i.seed === null ? '' : `-${String(i.seed).padStart(4, '0')}`}`;
}
