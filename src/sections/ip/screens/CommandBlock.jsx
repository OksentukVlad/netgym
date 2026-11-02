// Command examples with a copy button each (design §2, spec S3): local to
// the IP section until a second user needs it (routing copies inline; S3
// says promote it when routing migrates). The calculator passes one block
// per syntax, rendered by engine/vendors/*.renderAddress, side by side when
// there is room. A block's copy payload is exactly its text.
//
// «Скопійовано» appears only once the clipboard has taken the text (step 8
// fix). If it can't (no clipboard API, permission refused), the block's
// commands are selected instead and a line says to press Ctrl+C; that line
// is a polite live region, so it is announced.
//
// Round 4 (spec R3): the calculator folds the block by default (`open`,
// `onToggle`: its heading is then a disclosure button), and while its inputs
// are empty or malformed (the result is the last valid one, stale) the copy
// buttons are disabled with the reason in words (`disabled`).
//
// Round 5 5b-2 (spec D): `caption`, one line above the blocks, says which
// address the commands set.
import { useId, useRef, useState } from 'react';
import { calcUi } from '../uk.js';
import '../../../ui/tokens.css';
import './CommandBlock.css';
import { copyText, selectText } from '../../../ui/clipboard.js';


/**
 * @param {{
 *   heading: string,
 *   blocks: Array<{ id: string, label: string, text: string }>,
 *   caption?: string|null,                      // one line above the blocks: what the commands set
 *   note?: string,                              // a muted line under the blocks
 *   onCopy?: (text: string) => Promise<void>,   // tests: where the payload goes
 *   open?: boolean, onToggle?: Function,        // folded behind its heading (a disclosure) when onToggle is given
 *   disabled?: string|null,                     // why copying is off now (shown as text), or null
 * }} props
 */
export default function CommandBlock({ heading, blocks, caption = null, note, onCopy = copyText, open = true, onToggle = null, disabled = null }) {
  const bodyId = useId();
  const reasonId = useId();
  // { key, ok }: the last copy that finished, for the block and text it was.
  const [copied, setCopied] = useState(null);
  const pres = useRef({});
  const keyOf = block => `${block.id}\n${block.text}`;

  function copy(block) {
    if (disabled) return;
    const key = keyOf(block);
    setCopied(null);
    Promise.resolve()
      .then(() => onCopy(block.text))
      .then(() => setCopied({ key, ok: true }), () => {
        selectText(pres.current[block.id]);
        setCopied({ key, ok: false });
      });
  }

  return (
    <section className="ng-commands" aria-label={heading}>
      {onToggle
        ? <h2 className="ng-caption ng-commands-heading">
            <button type="button" className="ng-commands-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
              {heading} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>
          </h2>
        : <h2 className="ng-caption ng-commands-heading">{heading}</h2>}
      {open && <div id={bodyId} className="ng-commands-body">
      {caption && blocks.length > 0 && <p className="ng-commands-caption">{caption}</p>}
      {disabled && blocks.length > 0 && <p id={reasonId} className="ng-commands-off">{disabled}</p>}
      {blocks.length > 0 && (
        <div className="ng-commands-blocks">
          {blocks.map(block => {
            const done = copied?.key === keyOf(block) ? copied : null;
            return (
              <div key={block.id} className="ng-commands-block">
                <h3 className="ng-commands-vendor">{block.label}</h3>
                <pre className="ng-commands-pre" data-copy={block.id} ref={el => { pres.current[block.id] = el; }}>
                  {block.text.split('\n').map((line, i) => <span key={i} className="ng-commands-line">{line}</span>)}
                </pre>
                <button type="button" className="ng-commands-copy" onClick={() => copy(block)}
                  aria-disabled={disabled ? true : undefined} aria-describedby={disabled ? reasonId : undefined}>
                  {done?.ok ? calcUi.copied : calcUi.copy}
                  <span className="ng-sr-only">{calcUi.copyWhat({ vendor: block.label })}</span>
                </button>
                <p className="ng-commands-failed" aria-live="polite">{done && !done.ok ? calcUi.copyFailed : ''}</p>
              </div>
            );
          })}
        </div>
      )}
      {note && <p className="ng-commands-note">{note}</p>}
      </div>}
    </section>
  );
}
