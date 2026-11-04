// «Налаштування з нуля»'s saved state (spec save v2; app/saved.js runs these).
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

export const saved = Object.freeze({
  places: { setup: shape({ deck: text, seeds: mapOf(seed), ...asides }, ['deck', 'seeds']) },
  exercises: {
    [drill.id]: {
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
