// The routing screen's transient check view (round 2 step 6): which overlay
// is open over the diagram, which check's path is drawn, and a play counter
// that replays the motion. Component state, not the store: none of it is a
// check, a hint or an answer. Pure, tested in Node.
//
//   - One overlay at a time: «Правила», «Текстом» or «Усі перевірки»;
//     opening one closes another; toggling the open one closes it. The
//     screen returns focus to the closed overlay's toggle.
//   - A new network check draws its first failure (shown: null) and plays;
//     a passing one (`ok`) plays the success lap ({ kind: 'lap' }, polish
//     spec v2 §2), so the lap belongs to the check event, not to a result
//     that stays passing.
//   - «Показати ще раз» (replay) closes an overlay and plays the lap again.
//   - Picking a line of «Усі перевірки», or a demonstration, closes the
//     list, draws that path and plays it again (a lap under way yields).
//   - Another task instance starts with nothing picked.

export const OVERLAYS = ['rules', 'text', 'checks'];
const LAP = Object.freeze({ kind: 'lap', id: 'lap' });

/** @returns {{ overlay: null|'rules'|'text'|'checks', shown: null|{ kind: 'line'|'demo'|'lap', id: string }, play: number, key: any }} */
export function initialCheckView(key = null) {
  return { overlay: null, shown: null, play: 0, key };
}

export function checkViewReducer(state, action) {
  switch (action.type) {
    case 'toggle':
      if (!OVERLAYS.includes(action.overlay)) throw new RangeError(`unknown overlay: ${action.overlay}`);
      return { ...state, overlay: state.overlay === action.overlay ? null : action.overlay };
    case 'close':
      return state.overlay === null ? state : { ...state, overlay: null };
    case 'checked':
      return { ...state, shown: action.ok ? LAP : null, play: state.play + 1 };
    case 'replay':
      return { ...state, overlay: null, shown: LAP, play: state.play + 1 };
    case 'pick':
      return { ...state, overlay: null, shown: { kind: action.kind ?? 'line', id: action.id }, play: state.play + 1 };
    case 'instance':
      return state.key === action.key ? state : { ...initialCheckView(action.key), overlay: state.overlay };
    default:
      throw new Error(`unknown check view action: ${action.type}`);
  }
}

/** The line, demonstration or lap to draw: the picked one (the lap only
 * while the check passes), else the first failure. */
export function shownOf(state, presented) {
  if (!presented) return null;
  if (state.shown?.kind === 'lap' && presented.ok) return LAP;
  if (state.shown?.kind === 'demo') {
    const demo = presented.demonstrations.find(d => d.id === state.shown.id);
    if (demo) return { kind: 'demo', id: demo.id, trace: demo.trace, label: demo.label, text: demo.text, failed: false };
  }
  const line = (state.shown?.kind === 'line' && presented.lines.find(l => l.id === state.shown.id)) || presented.firstFailure;
  return line ? { kind: 'line', id: line.id, line, trace: line.trace, label: line.label, text: line.text, failed: line.status === 'fail', picked: state.shown?.id === line.id } : null;
}
