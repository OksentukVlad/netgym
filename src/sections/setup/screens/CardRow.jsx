// One card's content in the deck (between ReorderList's handle and its
// «↑» «↓», or in the read-only list of the learner's own order after a
// reveal). Round 5 (spec 5b-2 F, v2): the purpose comes first, in
// Ukrainian (R2: what the command achieves, always visible; the bank's
// data), and is the row's name in words (purposeOf: the handle and the
// list's announcements); the command is the second line, bold monospace at
// its usual size; on DR-3 a third, muted line gives the same step in
// Winbox's menus. The prompt group sits on the right of the command's line,
// in one band with the command (setup.css: the purpose keeps the whole
// row's width, so it stays one line). Round 4, spec S2: one quiet group,
// «режим?» until the learner picks, the chosen prompt standing out, the
// others plain text in the group; after a failed check «• Ще ні» takes the
// place of its «режим?», so a mark never widens the row. On a deck without
// prompts (DR-3) the mark takes that place on its own.
// Nothing here depends on the card's required mode or place: the options are
// the deck's prompts, the same for every card, and the names say only the
// row's position.
//
// DR-3's login check (`kind: 'checkpoint'`) is a step, not a command: its
// first line says so (comprehension.checkpointPurpose), and its words (✋)
// are in the body font, no monospace.
//
// `current` marks the row as the evidence the help panel's current message
// is about (data-evidence="current": the first flagged row, or the row
// edited since that check).
import { useId } from 'react';
import Segmented from '../../../ui/components/Segmented.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';
import { uk as shared } from '../../../ui/uk.js';
import { comprehension, ui } from '../uk.js';

/** A row's purpose as shown (its first line and its name in words): the bank's,
 * and for DR-3's login check the words that say it is a step, not a command. */
export const purposeOf = row => (row.kind === 'checkpoint' ? comprehension.checkpointPurpose : row.purpose);

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
  } else if (mark) {
    choice = <span className="ng-su-flag">{mark}</span>;
  }
  return (
    <div className={`ng-su-row${checkpoint ? ' is-step' : ''}`} data-term="" {...(current ? { 'data-evidence': 'current' } : {})}>
      <Purpose stacked className="ng-su-purpose">{purposeOf(row)}</Purpose>
      <span className="ng-su-term">{main}</span>
      {choice}
      {row.secondary && <span className="ng-su-path">{`${ui.winbox} ${row.secondary}`}</span>}
    </div>
  );
}
