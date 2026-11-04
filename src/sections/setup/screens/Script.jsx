// The script on the board (round 4, spec S2 and S5): once the cards pass or
// the answer is shown, the deck becomes the script it gives. Each line in
// the order the console takes it, the prompt it is typed at beside it
// (Cisco), the mode changes («перехід») and the 2960's lines learned in the
// router deck («як у роутері», each with the router card's purpose as a muted
// note, and the key-size note) dimmed and tagged,
// RouterOS's Winbox paths under their commands, and recall's lines «…»
// until they are typed. RouterOS splits at the login check: «Частина 1»
// ends with the pause comment, «Частина 2» comes after it, each with its own
// copy button, so nothing can be pasted across the check in one go.
//
// The copy payload is the logic's part script (scriptForState: one masking
// path for the board and every copy); the gutter, tags and paths are not
// part of it and can't be selected with it (user-select: none).
//
// Also here: the learner's own order after a reveal («Моя відповідь»), as a
// read-only list with the prompts they chose.
import { useRef, useState } from 'react';
import { copyText, selectText } from '../../../ui/clipboard.js';
import { uk as shared } from '../../../ui/uk.js';
import CardRow from './CardRow.jsx';
import { text, ui } from '../uk.js';

/** The prompt each line is typed at, from the mode changes before it
 * (a masked mode change is recall's interface line). */
export function linePrompts(lines) {
  let mode = '>';
  return lines.map(line => {
    const at = mode;
    if (line.kind === 'transition') {
      const t = line.text;
      if (t === 'enable' || t === 'end') mode = '#';
      else if (t === 'configure terminal' || t === 'exit') mode = '(config)#';
      else if (t.startsWith('line ')) mode = '(config-line)#';
      else mode = '(config-if)#';
    }
    return at;
  });
}

/** A copy button for one part: «✓ Скопійовано» once the clipboard took this
 * very text; refused, it selects the lines and asks for Ctrl+C (as CopyBlock). */
function CopyPart({ value, what, target }) {
  const [copied, setCopied] = useState(null);
  const done = copied?.text === value ? copied : null;
  function onClick() {
    setCopied(null);
    Promise.resolve().then(() => copyText(value))
      .then(() => setCopied({ text: value, ok: true }), () => { selectText(target.current); setCopied({ text: value, ok: false }); });
  }
  return (
    <div className="ng-copy-row">
      <button type="button" className="ng-copy-button" onClick={onClick}>
        {done?.ok ? shared.copied : shared.copy}<span className="ng-sr-only"> {what}</span>
      </button>
      <p className="ng-copy-said" aria-live="polite">
        {done && (done.ok ? <span className="ng-sr-only">{shared.copiedSaid}</span> : shared.copyFailed)}
      </p>
    </div>
  );
}

function Part({ part, label, prompted, pathOf }) {
  const box = useRef(null);
  const prompts = prompted ? linePrompts(part.lines) : [];
  return (
    <div className="ng-su-part">
      {label && <h3 className="ng-su-caption ng-su-part-label">{part.label}</h3>}
      <div ref={box} className={`ng-su-script${prompted ? ' is-prompted' : ''}`}>
        {part.lines.map((line, i) => {
          const tag = line.kind === 'transition' ? (line.note ? text(line.note) : ui.transition)
            : line.kind === 'learned' ? text(line.note) : line.shown ? shared.help.shown : null;
          const path = line.cardId ? pathOf(line.cardId) : null;
          return (
            // RouterOS's login-check comment is a pause (class names never carry a card's identity).
            <div key={i} className={`ng-su-line is-${line.kind === 'checkpoint' ? 'pause' : line.kind}${line.note ? ' is-learned' : ''}${line.masked ? ' is-masked' : ''}`}>
              {prompted && <span className="ng-su-gutter" aria-hidden="true">{prompts[i]}</span>}
              <span className="ng-su-text">{line.text}</span>
              {tag && <span className="ng-su-line-tag">{tag}</span>}
              {path && <span className="ng-su-line-path">{ui.winbox} {path}</span>}
              {line.purpose && <span className="ng-su-line-note">{line.purpose}</span>}
              {line.detail && <span className="ng-su-line-note">{text(line.detail)}</span>}
            </div>
          );
        })}
      </div>
      <CopyPart value={part.script} what={label ? part.label : ui.copyWhat} target={box} />
    </div>
  );
}

/**
 * @param {{
 *   script: { label: string, parts: Array<{ id: string, label: string, lines: object[], script: string }> },
 *   prompted: boolean,                 // Cisco: the prompt gutter
 *   pathOf: (cardId: string) => string|null,
 * }} props
 */
export default function Script({ script, prompted, pathOf }) {
  const split = script.parts.length > 1;
  return (
    <div className="ng-su-scripts">
      <p className="ng-su-note">{script.label}</p>
      {script.parts.map(part => <Part key={part.id} part={part} label={split} prompted={prompted} pathOf={pathOf} />)}
    </div>
  );
}

/** The learner's own order and prompts after a reveal, read-only. */
export function OwnDeck({ rows, prompts }) {
  return (
    <ol className="ng-su-own" aria-label={ui.ownHeading}>
      {rows.map((row, i) => (
        <li key={row.id} className="ng-su-own-item">
          <span className="ng-su-own-n" aria-hidden="true">{i + 1}</span>
          <CardRow row={row} n={i + 1} prompts={prompts} />
        </li>
      ))}
    </ol>
  );
}

/** The Cisco decks' second step (round 9, B1): the order passed and is locked; each card takes its mode. */
export function ModesDeck({ rows, prompts, marked, modeInvalid, current, onPrompt }) {
  return (
    <ol className="ng-su-own ng-su-modes-deck" aria-label={ui.deck}>
      {rows.map((row, i) => (
        <li key={row.id} className={`ng-su-own-item${marked.has(row.id) ? ' is-marked' : ''}`}>
          <span className="ng-su-own-n" aria-hidden="true">{i + 1}</span>
          <CardRow row={row} n={i + 1} prompts={prompts} marked={marked.has(row.id)} modeInvalid={modeInvalid && marked.has(row.id)}
            current={row.id === current} onPrompt={prompt => onPrompt(row.id, prompt)} />
        </li>
      ))}
    </ol>
  );
}
