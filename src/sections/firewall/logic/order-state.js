import { exactPermutation } from './universe.js';
import { initialAnswer } from './order.js';

export function initialState(task) {
  return { instanceKey: task.instanceKey, answer: initialAnswer(task), result: null, walkOpen: false, hintIndex: 0, assisted: false, revealed: false };
}

/** Pass the forRecord adapter. Every reorder clears evidence and marks in the
 * same transition. Hint 2 opens the current feedback walk, never a duplicate.
 */
export function transition(logic, task, state, action) {
  if (state.instanceKey !== task.instanceKey) throw new RangeError('invalid-task');
  switch (action.type) {
    case 'order':
      if (!exactPermutation(task.rules.map(r => r.id), action.order)) return state;
      return { ...state, answer: { order: [...action.order] }, result: null, walkOpen: false };
    case 'check': return { ...state, result: logic.check(task, state.answer), walkOpen: false };
    case 'walk': return state.result?.feedback?.code === 'order-verdict' ? { ...state, walkOpen: !state.walkOpen } : state;
    case 'hint': {
      const hintIndex = Math.min(3, state.hintIndex + 1);
      const result = hintIndex === 2 ? state.result ?? logic.check(task, state.answer) : state.result;
      return { ...state, hintIndex, result, assisted: true, walkOpen: state.walkOpen || (hintIndex === 2 && result?.feedback?.code === 'order-verdict') };
    }
    case 'reveal': return { ...state, assisted: true, revealed: true };
    default: return state;
  }
}
