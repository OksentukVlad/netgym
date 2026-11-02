// useExercise(logic, record, params): one exercise instance, for bank tasks
// (record from the target's bank) and generated tasks (record null, a seed in
// params) alike (ARCHITECTURE §3). It creates the task with the logic's
// `create`, reads the instance's state from the app store and dispatches
// through it, so the session survives leaving the section.
import { useMemo } from 'react';
import { initialInstance } from './exercise-state.js';
import { useStore } from './useStore.js';

const EMPTY = Object.freeze(initialInstance());

/** The store key of a task instance: the logic's own instanceKey (bank tasks
 * carry their identity), or the exercise, its version and the params. */
export function instanceKeyOf(logic, task, params) {
  if (task && typeof task.instanceKey === 'string') return task.instanceKey;
  return JSON.stringify({ exerciseId: logic.id, version: logic.version, ...params });
}

/**
 * @param {{ id: string, version: number, create: Function, check: Function, hints?: Function, solution: Function }} logic
 * @param {object|null} record
 * @param {object} params  variantId for bank tasks; seed, level… for generated ones
 */
export function useExercise(logic, record, params = {}) {
  const { state, dispatch } = useStore();
  const paramsKey = JSON.stringify(params);
  const task = useMemo(() => logic.create(record, params), [logic, record, paramsKey]);
  const key = instanceKeyOf(logic, task, params);
  const instance = state.instances[key] ?? EMPTY;
  const act = action => dispatch({ type: 'instance', key, action });
  const { session } = instance;
  // The reveal path: the reference solution, only once revealed, and once per
  // task (VLAN-3 fix brief item 3: a screen re-renders on every step of a walk).
  const solution = useMemo(() => (session.revealed ? logic.solution(task) : null), [logic, task, session.revealed]);

  return {
    task,
    key,
    ...instance,
    status: session.status,
    finished: session.status !== 'working',

    /** The logic's hints for the current answer (extra args go to the logic). */
    hints: (...args) => logic.hints?.(task, instance.answer, ...args) ?? [],

    /**
     * Check an answer. The result is the logic's `check(task, answer)` (the
     * screen may pass it in if it has already run it). Records the answer,
     * the result, the part's result and a press, and moves the session.
     * Transitional: `completion` ({ ok, complete }) is what the session moves
     * on when the screen decides completion itself (routing grades its rows
     * with checkRow until step 6); `supersede` says the part's text became
     * the canonical answer (see exercise-state.js).
     */
    check(answer, { result, completion, part, partResult, syntax, supersede } = {}) {
      const outcome = result ?? logic.check(task, answer);
      act({ type: 'checked', answer, result: outcome, completion, part, partResult, syntax, supersede });
      return outcome;
    },

    /** Open the next hint, up to `limit` (the number of hints there are). */
    hint(limit = Infinity) {
      if (session.hintIndex < limit) act({ type: 'session', action: { type: 'hint' } });
    },

    /** «Показати відповідь»: marks the instance revealed and assisted. */
    reveal() {
      act({ type: 'session', action: { type: 'reveal' } });
    },

    /** The reveal path: the reference solution, only once revealed (memoised above). */
    solution,

    /** Any exercise-state action for this instance (routing's row-checked,
     * route-upsert, route-deleted and mode drafts; see exercise-state.js). */
    act,

    setDraft: (syntax, part, value) => act({ type: 'draft', syntax, part, value }),
    setPart: (part, patch) => act({ type: 'part', part, patch }),
    setView: patch => act({ type: 'view', patch }),
    reset: () => act({ type: 'reset' }),
  };
}
