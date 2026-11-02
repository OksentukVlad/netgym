// Motion helpers shared by the screens that animate a packet (round 2 FW-1
// screen spec S6): routing's packet path (PathLayer.jsx) and the firewall's
// walk. Moved here from routing's PathLayer.jsx when the firewall became
// their second user; the behaviour is unchanged.
//
//   - useReducedMotion(): prefers-reduced-motion, kept up to date; true
//     without a browser, so server rendering shows the static end state.
//   - useStepTimer(total, playKey, reduced, options): a step counter for
//     `playKey`, 0 → total, one step per `stepMs`; at once (total) with
//     reduced motion or without a browser. A new key restarts it; a null key
//     stops it. `skip()` ends a run under way at its last step.
import { useEffect, useRef, useState } from 'react';

/** prefers-reduced-motion, kept up to date; true without a browser (static). */
export function useReducedMotion() {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduced, setReduced] = useState(() => (query ? query.matches : true));
  useEffect(() => {
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/**
 * The step of a motion for `playKey`: 0 → total, one step per `stepMs`; at
 * once (total) with reduced motion or without a browser. `onStep(i)` runs as
 * step i starts (not for the last), `onStill()` when the end is shown at
 * once. Only `playKey` and `reduced` restart it; `total` and the callbacks
 * are read when it starts.
 * @param {number} total
 * @param {any} playKey  null: nothing plays
 * @param {boolean} reduced
 * @param {{ stepMs: number, onStep?: (i: number) => void, onStill?: () => void }} options
 * @returns {{ step: number, playing: boolean, skip: () => void }}
 */
export function useStepTimer(total, playKey, reduced, { stepMs, onStep, onStill } = {}) {
  const [state, setState] = useState({ key: null, step: 0 });
  const live = useRef({});
  live.current = { total, stepMs, onStep, onStill };
  const timer = useRef(null);
  useEffect(() => {
    if (playKey == null) return undefined;
    const { total: count, stepMs: ms } = live.current;
    if (reduced || count === 0) {
      setState({ key: playKey, step: count });
      live.current.onStill?.();
      return undefined;
    }
    let step = 0;
    setState({ key: playKey, step });
    live.current.onStep?.(0);
    const id = setInterval(() => {
      step += 1;
      setState({ key: playKey, step });
      if (step >= count) { clearInterval(id); timer.current = null; }
      else live.current.onStep?.(step);
    }, ms);
    timer.current = id;
    return () => { clearInterval(id); if (timer.current === id) timer.current = null; };
  }, [playKey, reduced]);
  if (playKey == null) return { step: total, playing: false, skip: () => {} };
  const step = state.key === playKey ? state.step : reduced ? total : 0;
  return {
    step,
    playing: step < total,
    skip: () => {
      if (timer.current !== null) { clearInterval(timer.current); timer.current = null; }
      setState({ key: playKey, step: live.current.total });
    },
  };
}
