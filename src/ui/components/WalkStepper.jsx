// «По кроках» (the firewall's walk stepper, shared in round 6 for «DHCP і
// NAT»'s NAT replay): a toggle, and while it is on, «◀ крок n з N ▶» and the
// step's caption under it (a polite live region). The arrow keys step too.
// The caller owns the frame (`at`, 0-based) and what each step shows (its
// own drawing, its highlight); `before` puts the caller's buttons first in
// the row (the firewall's «Показати ще раз»).
import '../tokens.css';
import '../topology/RouterDiagram.css';
import './WalkStepper.css';

/**
 * @param {{
 *   words: { steps: string, stepsGroup: string, stepBack: string, stepForward: string, stepOf: Function },
 *   stepping: boolean, at: number, last: number,      // on or off; the step shown (0-based) and the last one
 *   onToggle: Function, onStep: (delta: number) => void,
 *   caption?: string, captionId: string,             // the step's words, under the row
 *   before?: any,
 * }} props
 */
export default function WalkStepper({ words, stepping, at, last, onToggle, onStep, caption = '', captionId, before = null }) {
  function onKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onStep(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onStep(-1); }
  }
  return <>
    <div className="ng-fw-walkbar">
      {before}
      <button type="button" className="ng-fw-btn" aria-pressed={stepping} onClick={onToggle}>{words.steps}</button>
      {stepping && (
        <span className="ng-fw-stepper" role="group" aria-label={words.stepsGroup} aria-describedby={captionId} onKeyDown={onKeyDown}>
          <button type="button" className="ng-fw-icon" aria-label={words.stepBack} aria-disabled={at <= 0} onClick={() => onStep(-1)}>◀</button>
          <span className="ng-fw-step-text">{words.stepOf({ n: at + 1, total: last + 1 })}</span>
          <button type="button" className="ng-fw-icon" aria-label={words.stepForward} aria-disabled={at >= last} onClick={() => onStep(1)}>▶</button>
        </span>
      )}
    </div>
    {stepping && <p id={captionId} className="ng-fw-step-caption" aria-live="polite">{caption}</p>}
  </>;
}
