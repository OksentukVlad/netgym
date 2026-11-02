import { exactPermutation } from './universe.js';
import { initialAnswer, hints } from './order.js';

export function initialState(task) {
  return { instanceKey: task.instanceKey, answer: initialAnswer(task), result: null, lastCheck: null, walkOpen: false, hintIndex: 0, assisted: false, revealed: false };
}

/** Pass the forRecord adapter. Every reorder clears evidence and marks in the
 * same transition. Hint 2 opens the current feedback walk, never a duplicate.
 */
const hasWalk = result => ['order-verdict', 'order-dead', 'order-shadowed'].includes(result?.feedback?.code);

export function transition(logic, task, state, action) {
  if (state.instanceKey !== task.instanceKey) throw new RangeError('invalid-task');
  switch (action.type) {
    case 'order':
      if (!exactPermutation(task.rules.map(r => r.id), action.order)) return state;
      return { ...state, answer: { order: [...action.order] }, result: null,
        lastCheck: state.lastCheck ?? (state.result ? { order: [...state.answer.order], result: state.result } : null), walkOpen: false };
    case 'check': {
      const result = logic.check(task, state.answer);
      return { ...state, result, lastCheck: { order: [...state.answer.order], result }, walkOpen: false };
    }
    case 'walk': return hasWalk(state.result) ? { ...state, walkOpen: !state.walkOpen } : state;
    case 'hint': {
      if (!hintsForState(task, state).length) return state;
      const hintIndex = Math.min(3, state.hintIndex + 1);
      const result = hintIndex === 2 ? state.result ?? logic.check(task, state.answer) : state.result;
      return { ...state, hintIndex, result,
        lastCheck: result && result !== state.result ? { order: [...state.answer.order], result } : state.lastCheck, assisted: true, walkOpen: state.walkOpen || (hintIndex === 2 && hasWalk(result)) };
    }
    case 'reveal': return { ...state, assisted: true, revealed: true };
    default: return state;
  }
}

/** Historical feedback is paired with its checked order even after a reorder.
 * Old persisted state without lastCheck can still use its current result.
 */
export function hintsForState(task, state) {
  const checked = state.lastCheck ?? (state.result ? { order: state.answer.order, result: state.result } : null);
  return hints(task, checked ? { order: checked.order } : state.answer,
    { finding: checked ? checked.result.feedback ?? { code: checked.result.code } : undefined });
}
