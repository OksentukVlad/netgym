// A worked example (round 5, spec 5b-2 A with v2 and v2.1): one finished
// answer of the same task shape, on other values, folded behind a quiet
// link. The learner opens it when they want to see what a finished answer
// looks like; it never opens by itself.
//
// Contract:
//   - its own state: closed on mount, closed again whenever `taskKey`
//     changes (task, level, vendor: anything that changes the example). Not
//     in the store, not part of first-visit folding (Aside), never opened by
//     a check, a hint or a reveal;
//   - the slot: directly under the screen's action line (its next sibling),
//     above the first control, in the work column. ExerciseLayout has an
//     `example` slot for this; other layouts render it right after
//     <ActionLine>. One per screen. Never an essential (tools/shots.mjs
//     checks the folded row, its place, and that it is closed on every state
//     but the gate-only `example-open`);
//   - the toggle is a <button> with aria-expanded: «Приклад ▸ готова
//     відповідь (інші числа)» (the arrow is aria-hidden);
//   - the content is plain read-only text: muted, a ✓ per row, the tag
//     «приклад · інші числа», one sentence of context, the rows (or the
//     screen's own static drawing as `children`) and an optional reason.
//     Nothing in it is focusable: no inputs, buttons, links or tabindex.
//     It sits in a polite live region that is always there, so opening it
//     is meant to be announced once and closing silent (the DOM is tested;
//     the spoken result still needs a screen-reader check);
//   - the values are the example's own (Sol's examples.js: reserved
//     addresses), never the learner's task or answer, and never written into
//     answers or drafts.
import { useEffect, useId, useRef, useState } from 'react';
import { uk } from '../uk.js';
import { usePhone } from '../phone.js';
import '../tokens.css';
import './WorkedExample.css';

/** The rows: arrays of cells as a table (with `head` as column labels), strings as lines.
 * `marks: false` (round 7, Fable 3): lines without a ✓ each, for an answer whose rows are
 * evidence, not checked steps (a ladder that stops on a failed output, a claim's lines);
 * `numbered`: those lines as a numbered list (the ladder's order). */
function Rows({ head, rows, marks = true, numbered = false }) {
  // Round 6: under 640 px the table stacks and each value carries its column's name (data-label), so the
  // header row isn't rendered there (out of the tree rather than hidden: nothing in the example is hidden).
  const phone = usePhone();
  if (head || rows.some(Array.isArray)) {
    return (
      <table className="ng-wex-table">
        {head && !phone && (
          <thead>
            <tr><td className="ng-wex-mark" />{head.map((label, i) => <th key={i} scope="col">{label}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="ng-wex-mark" aria-hidden="true">✓</td>
              {/* data-label: the column's name, written before the value when the table stacks (round 6, under 640 px). */}
              {[].concat(row).map((cell, j) => <td key={j} className="ng-wex-value" data-label={head?.[j]}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (!marks) {
    const List = numbered ? 'ol' : 'ul';
    return (
      <List className={`ng-wex-lines is-plain${numbered ? ' is-numbered' : ''}`}>
        {rows.map((line, i) => <li key={i}><span className="ng-wex-value">{line}</span></li>)}
      </List>
    );
  }
  return (
    <ul className="ng-wex-lines">
      {rows.map((line, i) => (
        <li key={i}><span className="ng-wex-mark" aria-hidden="true">✓</span><span className="ng-wex-value">{line}</span></li>
      ))}
    </ul>
  );
}

/**
 * @param {{
 *   taskKey: string|number,           // closes the example when it changes (task, level, vendor)
 *   context?: string,                 // one sentence: the example's own instance («R1 → LAN-C 192.0.2.0/24, сусід 198.51.100.2»)
 *   rows?: Array<string|string[]>,    // the finished answer: lines, or rows of cells (a table)
 *   head?: string[],                  // column labels for rows of cells (the form's field names)
 *   note?: string,                    // optional, one sentence: why (the order, the mode)
 *   marks?: boolean,                  // false: lines without a ✓ each (evidence rows, not checked steps)
 *   numbered?: boolean,               // with marks false: the lines as a numbered list
 *   children?: any,                   // instead of rows: a static, read-only drawing (the mask's ruler)
 *   className?: string,
 * }} props
 */
export default function WorkedExample({ taskKey, context, rows, head, note, children, marks = true, numbered = false, className = '' }) {
  // A new taskKey closes it during render (no effect, no flash), so going back to an earlier task finds it closed too.
  const [state, setState] = useState({ key: taskKey, open: false });
  if (!Object.is(state.key, taskKey)) setState({ key: taskKey, open: false });
  const open = state.open && Object.is(state.key, taskKey);
  const bodyId = useId();
  // Round 6: opened by its toggle, the card comes into view whole where it can (`nearest`: no move when it
  // already is; on a phone it would open below the window's edge). Never on mount or a task change.
  const card = useRef(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!open || !asked.current) return;
    asked.current = false;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Once the fonts are in and two frames have laid the opened card out at its final height (round 6
    // repair: it was sometimes scrolled while still short); nothing if it closes or unmounts first.
    const show = () => card.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    show();   // at once (the card is laid out by now), and again once fonts and layout have settled
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return undefined;
    let cancelled = false, frame = 0;
    const twoFrames = () => { if (!cancelled) frame = window.requestAnimationFrame(() => { if (!cancelled) frame = window.requestAnimationFrame(() => { if (!cancelled) show(); }); }); };
    const fonts = typeof document !== 'undefined' ? document.fonts?.ready : null;
    if (fonts) fonts.then(twoFrames, twoFrames); else twoFrames();
    return () => { cancelled = true; window.cancelAnimationFrame?.(frame); };
  }, [open]);
  return (
    <div className={`ng-wex${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`} data-worked-example="">
      <button type="button" className="ng-wex-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => { asked.current = !open; setState({ key: taskKey, open: !open }); }}>
        <span className="ng-wex-label"><span className="ng-wex-words">{uk.example.toggle}</span> <span aria-hidden="true">{open ? '▾' : '▸'}</span> <span className="ng-wex-words">{uk.example.toggleRest}</span></span>
      </button>
      <div id={bodyId} className="ng-wex-body" aria-live="polite">
        {open && (
          <div ref={card} className="ng-wex-card">
            <p className="ng-wex-tag">{uk.example.tag}</p>
            {context && <p className="ng-wex-context">{context}</p>}
            {rows ? <Rows head={head} rows={rows} marks={marks} numbered={numbered} /> : children}
            {note && <p className="ng-wex-note">{note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
