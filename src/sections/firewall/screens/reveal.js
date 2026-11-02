// The reveal path (ARCHITECTURE §6, FW-1 screen spec v2 S3, S5 g): the only
// place the firewall screen reads the reference solution. «Показати
// відповідь» commits the current card with the filter's own choice, through
// the same commit() as a student's answer, so the card locks and its walk
// plays. Only that card's selection is kept; the rest of the solution object
// is dropped here and never stored or rendered.
import { commit } from '../logic/predict.js';

/**
 * @param {{ solution: Function }} logic  the exercise (predict.js)
 * @returns {object} the new CommitState
 */
export function revealCard(logic, task, commitState, cardId) {
  const selection = logic.solution(task)[cardId];
  return commit(task, commitState, cardId, selection);
}
