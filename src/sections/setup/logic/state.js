import { clone, initialAnswer, capabilities } from './model.js';
import { check } from './rules.js';
import { checkTyped } from './typed.js';

export function initialState(task) {
  return { phase: 'sorting', answer: initialAnswer(task), feedback: null, lastFinding: null, stale: false,
    typedFeedback: {}, revealed: false, recallRevealed: false, showOwn: false, hintIndex: 0, assisted: false, earned: false };
}

/** Kept under instanceKey; the web version saves it without the typed lines
 * (screens/saved.js). `revealed` means sorting reveal only:
 * recall assistance must never revoke a sorting completion in the shared session.
 * `lastFinding` is a snapshot with board positions; edits retain it for hints.
 */
export function transition(task, state, action) {
  const unfinished = feedback => task.typedIds.find(id => !feedback[id]?.ok);
  const edit = answer => ({ ...state, answer, stale: state.stale || Boolean(state.feedback) });
  switch (action.type) {
    case 'order':
      if (state.phase !== 'sorting' || !Array.isArray(action.order) || action.order.length !== task.cards.length || new Set(action.order).size !== task.cards.length || action.order.some(id => !task.cards.some(c => c.id === id))) return state;
      return edit({ ...state.answer, order: [...action.order] });
    case 'prompt':
      if (state.phase !== 'sorting' || !capabilities(task).prompts.length || !task.cards.some(c => c.id === action.id) || (action.prompt !== null && !capabilities(task).prompts.includes(action.prompt))) return state;
      return edit({ ...state.answer, prompts: { ...state.answer.prompts, [action.id]: action.prompt } });
    case 'check': {
      if (state.phase !== 'sorting') return state;
      const result = check(task, state.answer);
      const finding = result.ok ? null : { ...result.findings[0], positions: result.findings[0].cards.map(id => state.answer.order.indexOf(id) + 1) };
      const feedback = finding ? { ...result, findings: [finding] } : result;
      return { ...state, feedback, stale: false, lastFinding: finding,
        phase: feedback.ok ? 'sorted' : 'sorting', earned: state.earned || (feedback.ok && !state.revealed) };
    }
    case 'continue':
      if (!['sorted', 'sorted-shown'].includes(state.phase) || !task.typedIds.length) return state;
      return { ...state, phase: 'recall', feedback: null, stale: false, lastFinding: null, hintIndex: 0, showOwn: false,
        typedFeedback: {}, answer: { ...state.answer, typed: Object.fromEntries(task.typedIds.map(id => [id, ''])) } };
    case 'typed': {
      if (!['recall', 'done'].includes(state.phase) || !task.typedIds.includes(action.id) || typeof action.text !== 'string') return state;
      const typedFeedback = { ...state.typedFeedback }; delete typedFeedback[action.id];
      return { ...state, phase: 'recall', answer: { ...state.answer, typed: { ...state.answer.typed, [action.id]: action.text } }, typedFeedback,
        hintIndex: unfinished(state.typedFeedback) === unfinished(typedFeedback) ? state.hintIndex : 0 };
    }
    case 'check-typed': {
      if (state.phase !== 'recall' || !task.typedIds.includes(action.id)) return state;
      const result = checkTyped(task, action.id, state.answer.typed[action.id]);
      const typedFeedback = { ...state.typedFeedback, [action.id]: result };
      const complete = task.typedIds.every(id => typedFeedback[id]?.ok && checkTyped(task, id, state.answer.typed[id]).ok);
      return { ...state, typedFeedback, phase: complete ? 'done' : 'recall', hintIndex: unfinished(state.typedFeedback) === unfinished(typedFeedback) ? state.hintIndex : 0 };
    }
    case 'hint': return { ...state, hintIndex: Math.min(capabilities(task).hints.length, state.hintIndex + 1), assisted: true };
    case 'reveal':
      if (state.phase === 'recall') {
        const typed = Object.fromEntries(task.recallLines.map(line => [line.id, line.template.replace(/\{(\w+)\}/g, (_, key) => task.values[key])]));
        return { ...state, phase: 'done-shown', recallRevealed: true, assisted: true,
          typedFeedback: {}, answer: { ...state.answer, typed, assisted: [...task.typedIds] } };
      }
      if (state.phase !== 'sorting') return state;
      return { ...state, phase: 'sorted-shown', revealed: true, assisted: true, feedback: null, stale: false, showOwn: false };
    case 'show-own':
      return state.phase === 'sorted-shown' ? { ...state, showOwn: !state.showOwn } : state;
    // The screen supplies the next seed/task. No clock or randomness in lifecycle.
    case 'next':
      return action.task?.identity?.taskId === task.identity.taskId && action.task.identity.seed !== task.identity.seed
        ? initialState(action.task) : state;
    case 'restore': return clone(state);
    default: return state;
  }
}

/** Accepted learner order stays intact. Only an explicit sorting reveal uses
 * the reference; toggling “my answer” never mutates the saved learner input. */
export function boardAnswer(task, state) {
  if (state.revealed && !state.showOwn) return { ...state.answer, order: [...task.referenceOrder],
    prompts: Object.fromEntries(task.cards.filter(c => c.mode).map(c => [c.id, c.mode])) };
  return state.answer;
}
