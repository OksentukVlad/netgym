import { create } from './deck.js';
import { validSeed } from './model.js';
import { initialState, transition } from './state.js';

/** Persist this section DTO. Each deck owns its seed and complete lifecycle;
 * switching selects an entry, never converts the previous deck's answer. */
export function initialDeckState(records, { deckId = records[0]?.id, seed = 0 } = {}) {
  return selectDeck(records, { selected: null, entries: {} }, deckId, { seed });
}

export function selectDeck(records, state, deckId, { seed = 0 } = {}) {
  const record = records.find(deck => deck.id === deckId);
  if (!record) throw new RangeError('invalid-record');
  const existing = state.entries[deckId];
  if (existing) return { ...state, selected: deckId };
  const task = create(record, { seed });
  return { selected: deckId, entries: { ...state.entries, [deckId]: { seed, instanceKey: task.instanceKey, state: initialState(task) } } };
}

export function currentDeck(records, state) {
  const record = records.find(deck => deck.id === state.selected), entry = state.entries[state.selected];
  if (!record || !entry) throw new RangeError('invalid-record');
  const task = create(record, { seed: entry.seed });
  if (task.instanceKey !== entry.instanceKey) throw new RangeError('invalid-record');
  return { record, task, state: entry.state };
}

export function transitionDeck(records, state, action) {
  const current = currentDeck(records, state);
  if (action.type === 'next') {
    if (!validSeed(action.seed) || action.seed === current.task.identity.seed) return state;
    const task = create(current.record, { seed: action.seed });
    return { ...state, entries: { ...state.entries, [state.selected]: { seed: action.seed, instanceKey: task.instanceKey, state: initialState(task) } } };
  }
  return { ...state, entries: { ...state.entries, [state.selected]: {
    ...state.entries[state.selected], state: transition(current.task, current.state, action),
  } } };
}
