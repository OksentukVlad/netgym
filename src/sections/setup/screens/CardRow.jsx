// One card's content in the deck (between ReorderList's handle and its
// «↑» «↓», or in the read-only list of the learner's own order after a
// reveal): the command, its purpose on the second line (round 5, R2: what
// the command achieves, in Ukrainian, always visible; the bank's data), and
// on DR-3 a third, muted line with the same step in Winbox's menus. Then the
// «• Ще ні» mark after a failed check (beside the prompt group where there
// is one, in the place of its «режим?», so it never widens the row), and the
// prompt as one quiet group (round 4, spec S2): «режим?» until the learner
// picks, the chosen prompt standing out, the others plain text in the group.
// Nothing here depends on the card's required mode or place: the options are
// the deck's prompts, the same for every card, and the names say only the
// row's position. A deck without prompts (DR-3) has no prompt choice at all.
//
// DR-3's login check (`kind: 'checkpoint'`) is a step, not a command: ✋ and
// its words in the body font, no monospace; it carries a purpose too.
//
// `current` marks the row as the evidence the help panel's current message
// is about (data-evidence="current": the first flagged row, or the row
// edited since that check).
import { useId } from 'react';
import Segmented from '../../../ui/components/Segmented.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';
import { uk as shared } from '../../../ui/uk.js';
import { ui } from '../uk.js';

/**
 * @param {{
 *   row: { id: string, kind: 'card'|'checkpoint', text: string, purpose: string, prompt: string|null, secondary?: string },
 *   n: number, prompts: string[], marked?: boolean, modeInvalid?: boolean, current?: boolean,
 *   onPrompt?: ((prompt: string) => void) | null,   // null: read-only (the chosen prompt shown as text)
 * }} props
 */
export default function CardRow({ row, n, prompts, marked = false, modeInvalid = false, current = false, onPrompt = null }) {
  const markId = useId();
  const mark = marked && <span id={markId} className="ng-su-mark">• {shared.notYet}</span>;
  const checkpoint = row.kind === 'checkpoint';
  const main = checkpoint
    ? <span className="ng-su-step"><span className="ng-su-hand" aria-hidden="true">✋</span> {row.text}</span>
    : <code className="ng-su-cmd">{row.text}</code>;
  let choice = null;
  if (prompts.length > 0 && onPrompt) {
    choice = (
      <span className={`ng-su-choice${row.prompt ? ' is-chosen' : ''}`}>
        {/* «• Ще ні» takes the empty state's place, so a mark never widens the row. */}
        {mark || (!row.prompt && <span className="ng-su-empty" aria-hidden="true">{ui.noPrompt}</span>)}
        <Segmented label={ui.promptOf({ n })} options={prompts.map(p => ({ value: p, label: p }))} value={row.prompt}
          onChange={onPrompt} invalid={modeInvalid} describedBy={modeInvalid ? markId : undefined} className="ng-su-prompts" />
      </span>
    );
  } else if (prompts.length > 0) {
    choice = <span className="ng-su-chosen">{row.prompt ?? ui.noChoice}</span>;
  }
  return (
    <div className={`ng-su-row${checkpoint ? ' is-step' : ''}`} data-term="" {...(current ? { 'data-evidence': 'current' } : {})}>
      <span className="ng-su-first">
        {main}
        {!(prompts.length > 0 && onPrompt) && mark}
      </span>
      {choice}
      <Purpose stacked className="ng-su-purpose">{row.purpose}</Purpose>
      {row.secondary && <span className="ng-su-path">{`${ui.winbox} ${row.secondary}`}</span>}
    </div>
  );
}
