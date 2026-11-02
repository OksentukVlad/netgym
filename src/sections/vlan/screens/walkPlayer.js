// Playing a VLAN walk (VLAN-anim spec v2 Y5–Y8), the firewall's walkUi
// pattern: one state object keyed by what owns the play (the task, the
// committed round, or the check with the configuration it checked, the
// syntax and the chosen direction: undoing an edit must not bring a play
// back). `play` is the run a fresh
// commit or check (or «Показати ще раз») started; `n` only grows, so every
// run has its own key. Anything else on screen (another round, an edit that
// makes the verdict stale, a syntax change, a new check) gets a cleared copy,
// adjusted during render as React documents for state that follows a prop:
// idempotent, so StrictMode's double render is safe. Coming back shows the
// static end frame and never plays again; replay is explicit.
//
// The timer and prefers-reduced-motion are src/ui/motion.js's (shared with
// routing and the firewall): under reduced motion, or without a browser,
// the end frame shows at once.
import { useEffect, useState } from 'react';
import { useReducedMotion, useStepTimer } from '../../../ui/motion.js';
import { STEP_MS } from './walkSteps.js';

/**
 * @param {string} owner what the play belongs to
 * @param {{ total: number }|null} seq the motion (walkSteps.js sequence), null: nothing to play
 * @param {{ stepMs?: number }} [options]
 * @returns {{ reduced: boolean, step: number, playing: boolean, replaying: boolean, skip: () => void, start: (owner?: string) => void, replay: () => void, cancel: () => void }}
 *   `reduced`: prefers-reduced-motion (no replay to offer: the end shows at once)
 *   `replaying`: a «Показати ще раз» run (the words after the motion stay, Y6)
 */
export function useWalkPlayer(owner, seq, { stepMs = STEP_MS } = {}) {
  const reduced = useReducedMotion();
  const [walkUi, setWalkUi] = useState({ at: owner, n: 0, play: null, replay: false });
  const shown = walkUi.at === owner ? walkUi : { at: owner, n: walkUi.n, play: null, replay: false };
  if (shown !== walkUi) setWalkUi(shown);
  const total = seq?.total ?? 0;
  const playKey = seq && total > 0 && shown.play ? `${owner}|${shown.play}` : null;
  const timer = useStepTimer(total, playKey, reduced, { stepMs });
  return {
    reduced,
    step: playKey ? timer.step : total,
    playing: Boolean(playKey) && timer.playing,
    replaying: Boolean(playKey) && shown.replay,
    skip: timer.skip,
    // A check's play belongs to the check about to be stored: its owner, given here.
    start: (next = owner) => setWalkUi(w => ({ at: next, n: w.n + 1, play: w.n + 1, replay: false })),
    replay: () => setWalkUi(w => ({ at: owner, n: w.n + 1, play: w.n + 1, replay: true })),
    // An explicit choice of what to view (Запит/Відповідь) ends the play for good.
    cancel: () => setWalkUi(w => ({ ...w, play: null, replay: false })),
  };
}

/** While a walk plays, the screen's «any press skips» (VlanScreen) calls its skip (Y7). */
export function useSkipper(skipper, player) {
  useEffect(() => {
    if (!skipper) return undefined;
    skipper.current = player.playing ? player.skip : null;
    return () => { skipper.current = null; };
  });
}
