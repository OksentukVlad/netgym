const clone = value => JSON.parse(JSON.stringify(value));

/** One valid submission per item, including a wrong submission. Validation
 * precedes locking/evidence. Callers bind their own checker and item schema. */
export function initialCommitState(task, { check }) {
  return { instanceKey: task.instanceKey, answer: {}, result: check(task, {}) };
}

export function commit(task, state, itemId, selection, { check, validate, items }) {
  if (state.instanceKey !== task.instanceKey || !items(task).some(c => c.id === itemId) || validate(task, selection, itemId)) throw new RangeError('invalid-selection');
  if (Object.hasOwn(state.answer, itemId)) return state;
  const answer = { ...clone(state.answer), [itemId]: clone(selection) };
  return { instanceKey: task.instanceKey, answer, result: check(task, answer) };
}

export function createCommitFlow(contract) {
  return {
    initialCommitState: task => initialCommitState(task, contract),
    commit: (task, state, itemId, selection) => commit(task, state, itemId, selection, contract),
  };
}
