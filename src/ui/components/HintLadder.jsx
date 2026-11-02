// Hints one at a time: «Підказка 1 з 3», «Підказка 2 з 3»… The caller owns
// how many are open (the session's hintIndex) and passes the texts in order.
import Button from './Button.jsx';
import { uk } from '../uk.js';
import '../tokens.css';
import './HintLadder.css';

/**
 * @param {{
 *   hints: string[],          // every rung's text, in order
 *   shown: number,            // how many are open
 *   onMore: () => void,       // open the next one
 *   disabled?: boolean,       // the task is finished
 * }} props
 */
export default function HintLadder({ hints, shown, onMore, disabled = false }) {
  const total = hints.length;
  const open = hints.slice(0, Math.min(shown, total));
  const left = shown < total;
  return (
    <div className="ng-hints">
      {open.length > 0 && (
        <ol className="ng-hints-list">
          {open.map((text, i) => (
            <li key={i}><b>{uk.hintN({ n: i + 1, total })}.</b> {text}</li>
          ))}
        </ol>
      )}
      {!disabled && total > 0 && (
        // aria-disabled, not disabled: the button keeps keyboard focus when the
        // last hint opens.
        <Button onClick={left ? onMore : undefined} aria-disabled={!left}>
          {left ? `💡 ${uk.hintN({ n: shown + 1, total })}` : uk.noHints}
        </Button>
      )}
    </div>
  );
}
