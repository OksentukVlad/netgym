import { checkTyped } from '../../src/sections/setup/logic/typed.js';

// Explicit practice state for handwritten legacy parser/copy regressions.
// These fixtures still exercise the original commands, regardless of selection
// in the new seeded practice pool. No production result supplies expectations.
export const practiceTask = (task, ids) => ({ ...task, typedIds: ids,
  recallLines: ids.map(id => task.cards.find(c => c.id === id) ?? task.recallLines.find(c => c.id === id)) });
export const practiceState = (task, answer) => ({ phase: 'done', answer, revealed: false,
  typedFeedback: Object.fromEntries(task.typedIds.map(id => [id, checkTyped(task, id, answer.typed[id])])) });
