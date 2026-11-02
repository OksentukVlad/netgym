// Step 9, «Інші адреси»: the task bar's address row and the task list's code
// field (spec step 9 §3 with R6, R7).
//
// AddressRow, under the task bar (round 4: the actions are in «⋯»): the
// variant switch (tasks 3 and 8), on a generated instance «Та сама задача з
// іншими адресами», the section's exercise switch (RF-1, `end`) and one
// polite line: «Підбираю адреси…» while «Інші адреси» builds (the screen
// does the work after a paint), or what an address action did.
//
// CodeField, at the top of the task list: «Код задачі», submitted with Enter
// or «Відкрити», never while typing. Each refusal has its own message
// (uk.js ui.address.codeErrors, one per logic/codes.js codeErrors code:
// unknown-letter, unknown-variant, bad-seed, infeasible), in a polite line
// tied to the field. Typing clears it.
import { useState } from 'react';
import { ui } from '../uk.js';

const a = ui.address;


/**
 * Round 4 (spec R1, A4): «Скопіювати код», «Інші адреси», «Основні адреси»
 * and the previous code moved into the screen's «⋯» menu. The row keeps the
 * variant switch, a line saying where the addresses are from (and «Підбираю
 * адреси…» while one builds, or what a menu action did), and the section's
 * exercise switch at its end.
 * @param {{
 *   generated: boolean,           // other addresses than the base task's
 *   busy: boolean,                // «Інші адреси» is building an instance
 *   notice?: string|null,         // a polite line (an address change, a copy that failed, none found)
 *   variants?: any,               // the variant switch, if the task has one
 *   end?: any,                    // the row's end: the section's exercise switch (RF-1)
 * }} props
 */
export function AddressRow({ generated, busy, notice = null, variants = null, end = null }) {
  const line = busy ? a.otherBusy : notice;
  const empty = !variants && !generated && !end && !line;
  return (
    <div className={`ng-rt-addr${empty ? ' is-empty' : ''}`}>
      {variants}
      {generated && <p className="ng-rt-addr-note"><span className="ng-rt-addr-sub">{a.subtitle}</span></p>}
      {end}
      <p className="ng-rt-addr-failed" aria-live="polite">{line ?? ''}</p>
    </div>
  );
}

/**
 * @param {{ onOpen: (text: string, report: (code: string|null) => void) => void, busy?: boolean }} props
 * `onOpen` opens the code's instance and reports null, or reports the
 * refusal's code; at once, or once the instance is built.
 */
export function CodeField({ onOpen, busy = false }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const id = 'ng-rt-codefield';

  // Enter in the field or «Відкрити»; an empty field does nothing. The screen
  // reports the outcome, at once or once the instance is built.
  function submit() {
    if (busy || !text.trim()) return;
    onOpen(text, code => {
      setError(code ?? null);
      if (!code) setText('');
    });
  }

  return (
    <div className="ng-rt-codefield">
      <label className="ng-rt-caption ng-rt-codefield-label" htmlFor={`${id}-input`}>{a.codeLabel}</label>
      <div className="ng-rt-codefield-row">
        <input id={`${id}-input`} className="ng-rt-codefield-input" type="text" value={text} autoComplete="off" spellCheck={false}
          placeholder={a.codePlaceholder} aria-invalid={error ? 'true' : undefined} aria-describedby={`${id}-error`}
          onChange={e => { setText(e.target.value); if (error) setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        <button type="button" className="ng-rt-btn ng-rt-codefield-open" aria-disabled={busy || undefined} onClick={submit}>{busy ? a.codeBusy : a.codeOpen}</button>
      </div>
      <p id={`${id}-error`} className="ng-rt-codefield-error" aria-live="polite">{error ? a.codeErrors[error] : ''}</p>
    </div>
  );
}
