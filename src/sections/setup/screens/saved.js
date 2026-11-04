// «Налаштування з нуля»'s saved state (spec save v2; app/saved.js runs these).
//
// A recall line is typed by hand and can hold a password, so none is ever
// saved (`redact`, on every write). Everything a typed line reaches goes:
// `answer.typed`, `typedFeedback` and `setupCheck` (a rejected line's finding
// quotes its token, the bare password among them). A refresh brings the lines
// back empty: `done` reopens as `recall`, the ✓ staying in the session. After
// «Показати відповідь» the lines are the reference's, with `<пароль>`: no
// learner text, so they stay and the task stays revealed.
import drill from '../logic/deck.js';
import { asides, bool, count, listOf, mapOf, matches, nullable, oneOf, resultOf, shape, text } from '../../../ui/saved-shape.js';
import { MAX_SEED } from './url.js';

const seed = value => count(value) && value <= MAX_SEED;
const ids = listOf(text);
const sorted = shape({ code: text, cards: ids, positions: listOf(count), why: text });
const feedback = resultOf({ findings: listOf(sorted) }, ['findings']);
const typed = resultOf({ findings: listOf(shape({ code: text, cards: ids })) }, ['findings']);

/** The deck's lifecycle (logic/state.js), kept whole in `view.setup`. */
const lifecycle = shape({
  phase: oneOf('sorting', 'sorted', 'sorted-shown', 'recall', 'done', 'done-shown'),
  answer: shape({ order: ids, prompts: mapOf(nullable(text)), typed: mapOf(text), assisted: ids }, ['order']),
  feedback: nullable(feedback), lastFinding: nullable(sorted), stale: bool, typedFeedback: mapOf(typed),
  revealed: bool, recallRevealed: bool, showOwn: bool, hintIndex: count, assisted: bool, earned: bool,
}, ['phase', 'answer', 'typedFeedback']);

// The backstop: a string that reads as a command carrying a secret, abbreviated
// too (the parser takes `ena sec …`), and any finding's `token`, which can be a
// bare password. Ids (`enable-secret`) have no value after them.
const SECRET_LINE = /\b(?:sec(?:r|re|ret)?|pass(?:w|wo|wor|word)?)(?:\s+|=)(?!<пароль>)\S/i;
function scrub(value) {
  if (typeof value === 'string') return SECRET_LINE.test(value) ? '' : value;
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === 'token' ? '' : scrub(entry)]));
  return value;
}

const blank = typed => (typed ? Object.fromEntries(Object.keys(typed).map(id => [id, ''])) : typed);
const withoutTyped = answer => (answer?.typed ? { ...answer, typed: blank(answer.typed) } : answer);

/** The lifecycle without anything typed. */
function withoutLines(setup) {
  if (setup.phase === 'done-shown') return { ...setup, typedFeedback: {} };
  return { ...setup, phase: setup.phase === 'done' ? 'recall' : setup.phase, typedFeedback: {}, answer: withoutTyped(setup.answer) };
}

/** What may be written of an instance. */
export function redact(instance) {
  const { setup, setupCheck, setupHintAt, ...view } = instance.view;
  // The screens here keep nothing in `drafts` or `parts`, so nothing there is worth a typed line's risk.
  return scrub({ ...instance, answer: withoutTyped(instance.answer), drafts: {}, parts: {}, view: { ...view, ...(setup ? { setup: withoutLines(setup) } : {}) } });
}

export const saved = Object.freeze({
  places: { setup: shape({ deck: text, seeds: mapOf(seed), ...asides }, ['deck', 'seeds']) },
  exercises: {
    [drill.id]: {
      redact,
      identity: (id, bank) => {
        const record = bank.decks.find(deck => deck.id === id.taskId);
        return Boolean(record) && matches(id, { formatVersion: 1, recordVersion: record.version, generatorVersion: drill.version }) && seed(id.seed);
      },
      view: shape({
        setup: lifecycle, setupEdited: nullable(text), setupHintAt: count,
        setupCheck: nullable(shape({ id: text, n: count, result: typed, value: text, stamp: count }, ['id', 'result', 'stamp'])),
      }),
    },
  },
});
