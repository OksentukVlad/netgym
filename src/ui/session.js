/** @typedef {{status:'working'|'solved'|'revealed',hintIndex:number,revealed:boolean,assisted:boolean,attempts:number,earned:{solved:boolean,assisted:boolean}}} Session */

/** Fresh state per task instance; earned is independent of the current result. */
export function initialSession() {
  return { status: 'working', hintIndex: 0, revealed: false, assisted: false, attempts: 0, earned: { solved: false, assisted: false } };
}

/** Pure session read: ignore old completion and clamp legacy hint indices. */
export function readSession(state = initialSession()) {
  const hintIndex = Math.max(0, Math.min(3, state.hintIndex || 0));
  if (state.earned && hintIndex === state.hintIndex) return state;
  return { ...state, hintIndex, earned: state.earned ?? { solved: false, assisted: false } };
}

/** Pure exercise transitions. Only a network/final check earns completion;
 * reveal before earning disqualifies, reveal afterwards preserves the mark.
 * Clear keeps answers/hints/reveal, resetting attempts and earned completion.
 * @param {Session} state
 * @param {{type:string,result?:{ok:boolean,complete:boolean}}} action
 * @returns {Session}
 */
export function sessionReducer(state = initialSession(), action) {
  state = readSession(state);
  switch (action.type) {
    case 'reset': return initialSession();
    case 'clear': return { ...state, attempts: 0, status: state.revealed ? 'revealed' : 'working', earned: { solved: false, assisted: false } };
    case 'check': {
      const passed = action.result?.ok && action.result?.complete;
      const earned = !state.earned.solved && !state.revealed && passed ? { solved: true, assisted: state.assisted } : state.earned;
      return { ...state, earned, attempts: state.attempts + 1, status: state.revealed && !earned.solved ? 'revealed' : passed ? 'solved' : 'working' };
    }
    case 'hint': return { ...state, hintIndex: Math.min(3, state.hintIndex + 1), assisted: true };
    // Help that isn't a hint rung: DR-1's typed commands shown in «Картки», or
    // VLAN-3's «причина була інша» after a working fix (spec v2 Z2).
    case 'assist': return state.assisted ? state : { ...state, assisted: true };
    case 'reveal': return { ...state, status: state.earned.solved ? state.status : 'revealed', revealed: true, assisted: true };
    default: return state;
  }
}

export default sessionReducer;
