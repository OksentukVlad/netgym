// The walk's answer row (design §3, spec S4): four octets of eight bits.
//
// Every cell is '0' or '1' and starts at '0' (polish-2 P1): deciding where
// the 1s go decides the octet, so there is no empty state, and an all-zero
// row is checked like any other.
//
// Toggles (BitOctet):
//   - A click or Space flips the cell (0 ↔ 1). 0 or 1 sets it and moves
//     right (across octets). Backspace zeroes the cell before the focus and
//     moves there, as it deletes the character before a caret (on the first
//     cell, it zeroes that one); after a digit typed into the row's last
//     cell (focus can't move on: `pastEnd`), it zeroes that cell and stays,
//     so repeated Backspace undoes typed digits one by one from the end.
//     Delete zeroes the focused cell. ←/→ move a cell, ↑/↓ the same bit of
//     the octet above or below, Home/End the octet's first or last bit;
//     Enter checks the row.
//   - One cell per octet is in the Tab order (roving tabindex); Tab moves
//     between octets. Keys with Ctrl, Cmd or Alt are never handled, so
//     Ctrl+A, Ctrl+V and the browser's own shortcuts keep working.
//   - Paste: eight digits fill the octet, thirty-two the row; spaces, dots
//     and dashes are ignored. Anything else is a notice, not an answer.
//   - aria-pressed is true for a 1; the name ends with the value:
//     «Мережа, октет 3, біт 64: 0».
// Text («Ввести текстом»): one native text field per octet that always
// shows its eight digits (selection, Home/End and Backspace are the
// browser's). Typing overwrites the digit after the caret and a deleted
// digit becomes 0 in its place, so positions never shift (editText). Focus
// selects the whole field, and a later click past the digits selects the
// last one, so the caret never rests at the end, where typing is dropped;
// while an IME composes, its text is left alone. Eight or thirty-two pasted
// bits fill the octet or the row.
// Round 5 (spec 5b-1 §2): with `band` (level 1) the given octets sit in one
// group under one caption («Октети 1–3 · задано»), drawn as given; the open
// octet follows it with the input look.
// Both modes read and write the same cells. The screen's help line
// (`describedBy`) describes each octet's group of toggles (heard once, not
// on every arrow key) or each text field; an octet marked after a check
// («Перевір цей октет») has its cells or field described by its message.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { binaryUi } from '../uk.js';
import '../../../ui/tokens.css';
import './BitOctet.css';

export const WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];

/** Four octets of eight zero cells. */
export const zeroCells = () => Array.from({ length: 4 }, () => Array(8).fill('0'));

/** A click or Space: 0 ↔ 1. */
export const flip = value => (value === '1' ? '0' : '1');

/** Pasted text → eight or thirty-two bits, or null (anything else). */
export function pastedBits(text) {
  const bits = String(text ?? '').replace(/[\s.:_\-–,|/]/g, '');
  return /^[01]+$/.test(bits) && (bits.length === 8 || bits.length === 32) ? bits : null;
}

/** An octet's cells as its text field shows them: eight digits. */
export const textOf = cells => cells.map(c => (c === '1' ? '1' : '0')).join('');

/**
 * The text field's new value → its cells, without moving any digit
 * (polish-2 V2). Only 0 and 1 are kept: `head` is the digits before the
 * caret (eight at most), `tail` the digits after it.
 *   - Longer than eight: the extra digits go from the start of `tail`, so
 *     what was typed or inserted overwrites the digits after the caret.
 *   - Shorter: 0s go between `head` and `tail`, so deleted positions
 *     become 0 and nothing after them moves.
 * One rule for typing, Backspace, Delete, a replaced selection, select-all,
 * cut, a pasted or inserted run, and characters that aren't bits.
 * The value is split at the caret first: `selectionStart` counts UTF-16
 * code units, so an emoji (two units) before it must not shift the split.
 * @param {string} text  the field's new value
 * @param {number|null} [caret]  where the caret is in it, in UTF-16 units (null: the end)
 * @returns {{ cells: string[], caret: number }} the cells, and where the caret goes
 */
export function editText(text, caret = null) {
  const value = String(text ?? '');
  const at = caret ?? value.length;
  const digits = part => [...part].filter(c => c === '0' || c === '1');
  const head = digits(value.slice(0, at)).slice(0, 8);
  let tail = digits(value.slice(at));
  tail = tail.slice(Math.max(0, head.length + tail.length - 8));
  return { cells: [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail], caret: head.length };
}

/** The ids that describe an element: its octet's message (marked octets
 * only), then the screen's help line (if given). */
const describedIds = (marked, messageId, help) => [marked ? messageId : null, help].filter(Boolean).join(' ') || undefined;

/**
 * One octet as eight toggle buttons.
 * @param {{
 *   row: string, n: number, caption: string, cells: string[], line: number | null,
 *   active: number, refs: object, mark: string | null, messageId: string, help?: string,
 *   readOnly: boolean, onKey: Function, onCell: Function, onPaste: Function, onFocusCell: Function,
 * }} props
 */
export function BitOctet({ row, n, caption, cells, line, active, refs, mark, message, messageId, help, readOnly, given = false, evidence = false, onKey, onCell, onPaste, onFocusCell }) {
  const captionId = useId();
  const wrong = mark === 'wrong';
  return (
    <div className={`ng-bitoctet${wrong ? ' is-wrong' : ''}${given ? ' is-given' : ''}`} role="group" aria-labelledby={captionId} aria-describedby={help}
      data-provenance={given ? 'given' : undefined} {...(evidence ? { 'data-evidence': 'current' } : {})}>
      <p className="ng-bitoctet-caption" id={captionId}>{caption}</p>
      <div className="ng-bitoctet-weights" aria-hidden="true">
        {WEIGHTS.map((w, b) => <span key={w} className={b === line ? 'is-line' : undefined}>{w}</span>)}
      </div>
      <div className="ng-bitoctet-cells">
        {cells.map((value, b) => (
          <button
            key={b}
            ref={el => { refs.current[(n - 1) * 8 + b] = el; }}
            type="button"
            className={`ng-bit${value === '1' ? ' is-one' : ' is-zero'}${b === line ? ' is-line' : ''}`}
            // A given octet (level 1) is read, not edited: out of the Tab order.
            tabIndex={!given && b === active ? 0 : -1}
            aria-pressed={value === '1'}
            aria-label={binaryUi.cell({ row, n, weight: WEIGHTS[b], value })}
            aria-describedby={describedIds(wrong, messageId)}
            aria-disabled={readOnly || given || undefined}
            onFocus={() => onFocusCell(n - 1, b)}
            onKeyDown={event => onKey(event, n - 1, b)}
            onClick={() => onCell(n - 1, b)}
            onPaste={event => onPaste(event, n - 1)}
          >
            {value}
          </button>
        ))}
      </div>
      {wrong && <p className="ng-bitoctet-msg" id={messageId}>{message ?? binaryUi.wrongOctet()}</p>}
    </div>
  );
}

/**
 * The row being answered: four BitOctets, or four text fields.
 * @param {{
 *   row: string,                       // the row's name («Мережа»)
 *   cells: string[][],                 // [4][8] of '0' | '1'
 *   onChange: (cells: string[][]) => void,
 *   onEnter: () => void,               // Enter: check the row
 *   onNotice?: (code: string) => void, // 'paste': pasted text that isn't 8 or 32 bits
 *   marks?: Array<'wrong'|null>,       // per octet, after a check
 *   messages?: Array<string|null>,     // per marked octet: «зараз 64, треба 192»
 *   given?: boolean[],                 // per octet: given (level 1), shown read-only in both modes
 *   band?: string | null,              // the given octets' one caption (level 1): they sit in one group under it
 *   evidence?: number|null,            // the octet the current message is about (data-evidence)
 *   line?: number | null,              // the prefix line (after the mask step)
 *   decimals?: Array<number> | null,   // the given numbers per octet (address and mask steps)
 *   text?: boolean,                    // «Ввести текстом»
 *   readOnly?: boolean,
 *   describedBy?: string,              // the screen's help line: each octet's group, or each field
 *   focusRef?: object,                 // set to a function that focuses the first cell
 * }} props
 */
export default function BitRowInput({ row, cells, onChange, onEnter, onNotice, marks = [], messages = [], given = [], band = null, evidence = null, line = null, decimals = null, text = false, readOnly = false, describedBy: help, focusRef }) {
  const refs = useRef([]);
  const fields = useRef([]);
  // A 0 or 1 typed into the row's last cell, where focus can't move on: the
  // next Backspace zeroes that cell (V1). Any other key, a click, a paste or
  // a focus move clears it.
  const pastEnd = useRef(false);
  // Text mode: the field an IME is composing in, with its raw text (shown
  // as it is until the composition ends, then rewritten).
  const [composing, setComposing] = useState(null);
  // Where the caret goes after an edit in text mode (the field's value is
  // rewritten, which would otherwise send it to the end).
  const caretAfter = useRef(null);
  useLayoutEffect(() => {
    const want = caretAfter.current;
    if (!want) return;
    caretAfter.current = null;
    const field = fields.current[want.o];
    if (field && field === document.activeElement && field.setSelectionRange) {
      const pos = Math.min(want.pos, field.value.length);
      field.setSelectionRange(pos, pos);
    }
  });
  const [active, setActive] = useState([0, 0, 0, 0]);
  const id = useId();
  const messageId = o => `${id}-m${o}`;
  const caption = o => binaryUi.octet({ n: o + 1, value: decimals?.[o] });

  // The first octet the learner works in (level 1: the fourth).
  const firstOpen = Math.max(0, [0, 1, 2, 3].findIndex(o => !given[o]));
  const isGiven = o => Boolean(given[o]);
  useEffect(() => {
    if (!focusRef) return undefined;
    focusRef.current = () => (text ? fields.current[firstOpen] : refs.current[firstOpen * 8])?.focus();
    return () => { focusRef.current = null; };
  });

  const set = (o, b, value) => {
    if (readOnly || isGiven(o)) return;
    onChange(cells.map((octet, i) => (i === o ? octet.map((v, j) => (j === b ? value : v)) : octet)));
  };
  // Focus never lands in a given octet (its cells are out of the Tab order).
  const focus = g => {
    if (g < 0 || g > 31 || isGiven(Math.floor(g / 8))) return;
    refs.current[g]?.focus();
  };
  // Pasted bits never change a given octet (the screen normalises with the logic's draft() too).
  const fill = (bits, o) => {
    if (bits.length === 32) onChange([0, 1, 2, 3].map(i => (isGiven(i) ? cells[i] : [...bits.slice(i * 8, i * 8 + 8)])));
    else if (!isGiven(o)) onChange(cells.map((octet, i) => (i === o ? [...bits] : octet)));
  };

  const toggle = (o, b) => {
    pastEnd.current = false;
    set(o, b, flip(cells[o][b]));
  };

  function onKey(event, o, b) {
    const wasPastEnd = pastEnd.current;
    pastEnd.current = false;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const g = o * 8 + b;
    const key = event.key;
    if (key === 'Enter') { event.preventDefault(); onEnter(); return; }
    if (readOnly) return;
    if (key === '0' || key === '1') {
      event.preventDefault();
      set(o, b, key);
      focus(g + 1);
      pastEnd.current = g === 31;
      return;
    }
    if (key === ' ' || key === 'Spacebar') { event.preventDefault(); toggle(o, b); return; }
    if (key === 'Backspace') {
      // The cell before the focus, as a caret deletes; the focused one on
      // the first cell, or after a digit typed into the last.
      event.preventDefault();
      const p = wasPastEnd || g === 0 || isGiven(Math.floor((g - 1) / 8)) ? g : g - 1;
      set(Math.floor(p / 8), p % 8, '0');
      focus(p);
      return;
    }
    if (key === 'Delete') { event.preventDefault(); set(o, b, '0'); return; }
    const to = { ArrowLeft: g - 1, ArrowRight: g + 1, ArrowUp: g - 8, ArrowDown: g + 8, Home: o * 8, End: o * 8 + 7 }[key];
    if (to !== undefined) { event.preventDefault(); focus(to); }
  }

  function onPaste(event, o) {
    pastEnd.current = false;
    if (readOnly) return;
    event.preventDefault();
    const bits = pastedBits(event.clipboardData?.getData('text'));
    if (bits) fill(bits, o);
    else onNotice?.('paste');
  }

  /** Text mode: the field's value and caret → its octet (editText). */
  function rewrite(o, field) {
    const caret = typeof field.selectionStart === 'number' ? field.selectionStart : null;
    const edit = editText(field.value, caret);
    caretAfter.current = { o, pos: edit.caret };
    onChange(cells.map((c, i) => (i === o ? edit.cells : c)));
  }

  // Level 1: the given octets in one captioned group, then the open one(s).
  const banded = Boolean(band) && given.some(Boolean);
  const layout = octet => (banded ? <>
    <div className="ng-bitband" role="group" aria-labelledby={`${id}-band`}>
      <p className="ng-bitband-caption" id={`${id}-band`}>{band}</p>
      <div className="ng-bitband-octets">{[0, 1, 2, 3].filter(isGiven).map(octet)}</div>
    </div>
    {[0, 1, 2, 3].filter(o => !isGiven(o)).map(octet)}
  </> : [0, 1, 2, 3].map(octet));
  const rowClass = `ng-bitrow${text ? ' is-text' : ''}${banded ? ' has-band' : ''}`;

  if (text) {
    return (
      <div className={rowClass} data-provenance="learner">
        {layout(o => {
          const octet = cells[o];
          const wrong = marks[o] === 'wrong';
          const fixed = readOnly || isGiven(o);
          return (
            <div key={o} className={`ng-bittext${wrong ? ' is-wrong' : ''}${isGiven(o) ? ' is-given' : ''}`}
              data-provenance={isGiven(o) ? 'given' : undefined} {...(evidence === o ? { 'data-evidence': 'current' } : {})}>
              <label className="ng-bitoctet-caption" htmlFor={`${id}-t${o}`}><span className="ng-sr-only">{row}, </span>{caption(o)}</label>
              <input
                id={`${id}-t${o}`}
                ref={el => { fields.current[o] = el; }}
                className="ng-bittext-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={wrong}
                aria-describedby={describedIds(wrong, messageId(o), help)}
                readOnly={fixed}
                tabIndex={isGiven(o) ? -1 : undefined}
                value={composing?.o === o ? composing.value : textOf(octet)}
                onFocus={event => {
                  // The whole field, so a click right of the digits doesn't
                  // leave the caret at the end, where typing is dropped.
                  event.target.select?.();
                }}
                onClick={event => {
                  // A click past the digits in a focused field: the last
                  // digit, so typing replaces it and Backspace zeroes it.
                  const el = event.target, end = el.value.length;
                  if (composing?.o !== o && end > 0 && el.selectionStart === end && el.selectionEnd === end) el.setSelectionRange?.(end - 1, end);
                }}
                onChange={event => {
                  if (fixed) return;
                  if (event.nativeEvent?.isComposing) { setComposing({ o, value: event.target.value }); return; }
                  setComposing(null);
                  rewrite(o, event.target);
                }}
                onCompositionEnd={event => {
                  setComposing(null);
                  if (!fixed) rewrite(o, event.target);
                }}
                onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); onEnter(); } }}
                onPaste={event => {
                  // Eight bits fill this octet, thirty-two the row; other text is typed as it is.
                  const bits = pastedBits(event.clipboardData?.getData('text'));
                  if (bits && !fixed) { event.preventDefault(); fill(bits, o); }
                }}
              />
              {wrong && <p className="ng-bitoctet-msg" id={messageId(o)}>{messages[o] ?? binaryUi.wrongOctet()}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={rowClass} data-provenance="learner">
      {layout(o => (
        <BitOctet
          key={o} row={row} n={o + 1} caption={caption(o)} cells={cells[o]}
          line={line !== null && line !== undefined && Math.floor(line / 8) === o && line % 8 !== 0 ? line % 8 : null}
          active={active[o]} refs={refs} mark={marks[o] ?? null} message={messages[o] ?? null} messageId={messageId(o)} help={help} readOnly={readOnly}
          given={isGiven(o)} evidence={evidence === o}
          onKey={onKey} onCell={toggle} onPaste={onPaste}
          onFocusCell={(oi, b) => {
            pastEnd.current = false;
            setActive(list => (list[oi] === b ? list : list.map((v, i) => (i === oi ? b : v))));
          }}
        />
      ))}
    </div>
  );
}
