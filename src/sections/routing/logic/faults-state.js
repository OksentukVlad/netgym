// RF-1's section-owned disclosure transitions. Screens persist the answer and
// assistance, and recompute checks after reload; never persist private metadata.
import { initialAnswer, check, options, hints, solution, pingList } from './faults-exercise.js';
export function initialState(task) {
  const original = pingList(task);
  return { answer: initialAnswer(task), step: 'fix', result: null, assisted: false, hintRung: 0, reveal: null,
    original, snapshot: original };
}
export function edit(state, answer) {
  return { ...state, answer: { ...answer, cause: null }, step: 'fix', result: null };
}
export function submit(task, state, { syntax = 'cisco' } = {}) {
  const result = check(task, state.answer, { step: state.step === 'cause' ? 'cause' : 'fix', syntax });
  return { ...state, result, step: result.step, snapshot: result.evidence.snapshot,
    assisted: state.assisted || result.assisted === true };
}
export function chooseCause(task, state, cause, { syntax = 'cisco' } = {}) {
  if (state.step !== 'cause' || !options(task, 'cause', { result: state.result, answer: state.answer, syntax }).some(o => o.value === cause)) return state;
  return { ...state, answer: { ...state.answer, cause } };
}
export function showHint(task, state, rung) {
  const assisted = state.assisted || rung >= 3;
  return { ...state, assisted, hintRung: Math.max(state.hintRung, rung),
    hints: hints(task, state.answer, { result: state.result, snapshot: state.snapshot, rung, assisted }) };
}
export function reveal(task, state) { return { ...state, assisted: true, reveal: solution(task) }; }
