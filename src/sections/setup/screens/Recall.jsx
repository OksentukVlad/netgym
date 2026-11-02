// Recall (round 4, spec S1): after the cards pass, three lines are typed
// from memory. Each line is its description (the paraphrase with the exact
// values: the exercise), its prompt, and a field across the whole width (a
// long command is never clipped). Enter checks that line alone (no attempt
// counted, the help panel has no check here): «✓» and the line locks
// (editing it again unlocks it), or the wrong part underlined under the
// field. After «Показати відповідь» the fields hold the commands, marked
// «показано», read-only.
//
// The words of a line's check go through the help panel (repair v1 item 2):
// each Enter is a stamped verdict there (lineSummary), so it is the one
// current message, announced once, an open hint folds under it, and the
// panel's placement and scrolling follow the shared rules. The line itself
// keeps only what can't be said elsewhere: the underline on the typed text
// (not announced). The line the current message is about is
// data-evidence="current". The logic's identities (the recall-only SVI line
// included) never reach the DOM: ids are positional.
import { useId, useRef } from 'react';
import { useIsoLayoutEffect } from '../../../ui/phone.js';
import { uk as shared } from '../../../ui/uk.js';
import { text, ui } from '../uk.js';

// Control and invisible format characters, shown as a dot when echoed.
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const visible = value => value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '·');

/** The typed line with the finding's part underlined (an empty part: a gap at the end). */
function Echo({ value, finding }) {
  const start = Math.max(0, Math.min(value.length, finding.start));
  const end = Math.max(start, Math.min(value.length, finding.end ?? start));
  const part = value.slice(start, end);
  return (
    <p className="ng-su-echo">
      <code>{visible(value.slice(0, start))}<mark className={`ng-su-bad${part ? '' : ' is-gap'}`}>{part ? visible(part) : '  '}</mark>{visible(value.slice(end))}</code>
    </p>
  );
}

/** What the marked part is, in words. */
function named(value, finding) {
  if (finding.start >= value.length || finding.start === finding.end) return ui.missingEnd;
  if (CONTROL.test(finding.token ?? '')) return ui.markedControl;
  return ui.marked({ token: finding.token });
}

/** A line's check in words, for the help panel (its badge says «✓ Так» or «• Ще ні»). */
export function lineSummary(n, value, result) {
  if (result.ok) {
    const advice = result.findings.filter(f => f.severity === 'advice');
    return [ui.lineRight({ n }), ...advice.map(f => text(f.code, f))].join(' ');
  }
  const finding = result.findings[0];
  const located = typeof finding.start === 'number';
  return [`${ui.lineOf({ n })}:`, located && named(value ?? '', finding), finding.code === 'unsafe-command' && ui.safety, text(finding.code, finding)].filter(Boolean).join(' ');
}

/**
 * @param {{
 *   rows: Array<{ id: string, description: string, prompt: string, value: string, result: object|null, locked: boolean, shown: boolean }>,
 *   readOnly: boolean,                       // the answer was shown: the fields hold it
 *   current: string|null,                    // the line the current message (verdict or hint) is about
 *   onChange: (id: string, value: string) => void,
 *   onEnter: (id: string) => void,
 *   fieldRef: (index: number) => (el: HTMLInputElement|null) => void,
 * }} props
 */
/** The recall line's field: a text area of one line that grows with its command (height = its content). */
function CommandField({ fieldRef, id, readOnly, placeholder, value, invalid, onChange, onEnter }) {
  const own = useRef(null);
  useIsoLayoutEffect(() => {
    const el = own.current;
    if (!el?.style || typeof el.scrollHeight !== 'number') return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  });
  return (
    <textarea ref={el => { own.current = el; fieldRef(el); }} id={id} className="ng-su-field" rows={1} autoComplete="off" autoCapitalize="off" spellCheck={false}
      enterKeyHint="done" readOnly={readOnly} placeholder={placeholder} value={value} aria-invalid={invalid || undefined}
      onChange={event => onChange(event.target.value.replace(/\r?\n/g, ' '))}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onEnter(); } }} />
  );
}

export default function Recall({ rows, readOnly, current, onChange, onEnter, fieldRef }) {
  const base = useId();
  return (
    <ol className="ng-su-recall" aria-label={ui.recallLabel}>
      {rows.map((row, i) => {
        const fieldId = `${base}-${i}`;
        const result = row.result;
        const finding = result && !result.ok ? result.findings[0] : null;
        return (
          <li key={i} className={`ng-su-recall-line${row.locked ? ' is-right' : ''}${result && !result.ok ? ' is-no' : ''}`}
            {...(current === row.id ? { 'data-evidence': 'current' } : {})}>
            <label className="ng-su-recall-desc" htmlFor={fieldId}>
              <span className="ng-su-recall-n">{i + 1}.</span> {row.description}
              {row.shown && <> <span className="ng-shown-chip">{shared.help.shown}</span></>}
            </label>
            <div className="ng-su-recall-field">
              <span className="ng-su-recall-prompt" aria-hidden="true">{row.prompt}</span>
              {/* Round 6 repair: a one-line text area that wraps and grows, so a long command is shown whole on a
                  phone (no inner scroll hides part of it); Enter still checks the line and never adds one. */}
              <CommandField fieldRef={fieldRef(i)} id={fieldId} readOnly={readOnly} placeholder={readOnly ? undefined : ui.recallPlaceholder}
                value={row.value ?? ''} invalid={Boolean(result && !result.ok)}
                onChange={value => onChange(row.id, value)} onEnter={() => { if (!readOnly) onEnter(row.id); }} />
              {row.locked && !row.shown && <span className="ng-su-recall-ok" aria-hidden="true">✓</span>}
            </div>
            {finding && typeof finding.start === 'number' && (
              <div className="ng-su-verdict is-no" aria-hidden="true"><Echo value={row.value ?? ''} finding={finding} /></div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
