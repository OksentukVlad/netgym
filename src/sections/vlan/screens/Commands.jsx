// A switch's commands with a copy button, and fixed notes under them (VLAN-1
// spec §3.4, v2 W2, W3): the RouterOS safety note, or the `nonegotiate`
// line; «Між VLAN» gives a device several (the SVI and management notes).
// The IP section's CommandBlock does the same; sections don't import
// each other, so this is the VLAN section's own until the two move into
// src/ui together. Copying itself is the shared src/ui/clipboard.js.
//
// «Скопійовано» appears only once the clipboard has taken the text. If it
// can't, the commands are selected instead and a polite line says to press
// Ctrl+C. The copy payload is exactly the commands shown: the student's own
// (live, from the form) or, after «Показати відповідь», the reference. With
// no commands yet, a line says so and there is nothing to copy.
import { useRef, useState } from 'react';
import { copyText, selectText } from '../../../ui/clipboard.js';
import { ui } from '../uk.js';

/**
 * @param {{ device: string, text: string, note?: string|string[]|null, copy?: boolean,
 *   onCopy?: (text: string) => Promise<void>, className?: string, empty?: string }} props
 *   `empty`: the line shown with no commands yet
 */
export default function Commands({ device, text, note = null, copy = true, onCopy = copyText, className = '', empty: emptyLine = ui.noCommands }) {
  const [copied, setCopied] = useState(null);
  const pre = useRef(null);
  const done = copied?.text === text ? copied : null;
  function onClick() {
    setCopied(null);
    Promise.resolve()
      .then(() => onCopy(text))
      .then(() => setCopied({ text, ok: true }), () => { selectText(pre.current); setCopied({ text, ok: false }); });
  }
  // Nothing configured yet (a Cisco form with no modes): a line instead of an empty block.
  const empty = text.trim() === '';
  return (
    <div className={`ng-vl-commands ${className}`.trim()}>
      {empty ? <p className="ng-vl-muted ng-vl-no-commands">{emptyLine}</p> : (
        <pre ref={pre} className="ng-vl-pre">
          {text.split('\n').map((line, i) => <span key={i} className="ng-vl-cmd-line">{line}</span>)}
        </pre>
      )}
      {copy && !empty && (
        <div className="ng-vl-copy-row">
          <button type="button" className="ng-vl-btn" onClick={onClick}>
            {done?.ok ? ui.copied : ui.copy}<span className="ng-sr-only">{ui.copyWhat({ device })}</span>
          </button>
          <p className="ng-vl-copy-failed" aria-live="polite">{done && !done.ok ? ui.copyFailed : ''}</p>
        </div>
      )}
      {[].concat(note ?? []).filter(Boolean).map(line => <p key={line} className="ng-vl-note">{line}</p>)}
    </div>
  );
}
