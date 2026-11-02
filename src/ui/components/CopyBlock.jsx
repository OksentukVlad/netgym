// A command script with «Скопіювати» (the shared clipboard helper,
// src/ui/clipboard.js). The IP section's CommandBlock and VLAN's Commands
// do the same within their sections; this is the shared one, first used by
// the router setup drill, for them to move to.
//
// The copy payload is exactly the text shown, and the block's text is that
// text (its lines are separated by real line breaks), so selecting it for a
// manual copy gives the same lines. «✓ Скопійовано» appears only once the
// clipboard has taken this very text: a copy that finishes after the text
// changed claims nothing. A polite line says «Скопійовано» (to screen
// readers), or, if the clipboard refused, selects the script and asks for
// Ctrl+C (to everyone).
import { Fragment, useRef, useState } from 'react';
import { copyText, selectText } from '../clipboard.js';
import { uk } from '../uk.js';
import '../tokens.css';
import './CopyBlock.css';

/**
 * @param {{
 *   text: string,                                // the script, lines joined by \n
 *   what: string,                                // what is copied, for the button's accessible name
 *   onCopy?: (text: string) => Promise<void>,
 *   className?: string,
 * }} props
 */
export default function CopyBlock({ text, what, onCopy = copyText, className = '' }) {
  const [copied, setCopied] = useState(null);
  const pre = useRef(null);
  const done = copied?.text === text ? copied : null;
  function onClick() {
    setCopied(null);
    Promise.resolve()
      .then(() => onCopy(text))
      .then(() => setCopied({ text, ok: true }), () => { selectText(pre.current); setCopied({ text, ok: false }); });
  }
  return (
    <div className={`ng-copy ${className}`.trim()}>
      <pre ref={pre} className="ng-copy-pre">
        {text.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && '\n'}<span className="ng-copy-line">{line}</span></Fragment>)}
      </pre>
      <div className="ng-copy-row">
        <button type="button" className="ng-copy-button" onClick={onClick}>
          {done?.ok ? uk.copied : uk.copy}<span className="ng-sr-only"> {what}</span>
        </button>
        <p className="ng-copy-said" aria-live="polite">
          {done && (done.ok ? <span className="ng-sr-only">{uk.copiedSaid}</span> : uk.copyFailed)}
        </p>
      </div>
    </div>
  );
}
