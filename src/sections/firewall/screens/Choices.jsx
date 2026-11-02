// The two choices of a card (FW-1 screen spec §4, v2 S2, S4): the door
// («Який ланцюжок?») and the deciding rule («Правило, що вирішує»), each a
// radio group with arrow-key navigation (keyChoice, as Segmented).
//
// Round 4 (spec F1): two steps, one decision at a time. The chain is two big
// buttons; in level 2 the rule step shows only the chosen chain's rows (with
// their RouterOS numbers) and one grey line for the other chain, so nothing
// is hidden silently. The row or group the current message is about carries
// data-evidence="current" (the visibility gate's evidence).
//
// Before commitment they are the same for every card: no option is checked
// until the student picks (aria-checked="false" everywhere), and the only
// difference a draft makes is the student's own selection (aria-checked,
// its outline, and the selected row's description). After commitment the
// choice is locked (aria-readonly): arrows move focus only; the table shows
// the walk row by row up to `lit`, then every row's outcome.
//
// Round 5 (rules R1, R2): the action line above the current step names its
// group (`labelledBy`); level 1's options lead with Ukrainian («самому
// роутеру → input»), and its committed marks are one line under the pair;
// every rule row carries its purpose under it, always visible (data-term).
import { useRef, useState } from 'react';
import { keyChoice } from '../../../ui/components/Segmented.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';
import { predictStep, ui } from '../uk.js';

/** Keyboard focus (not a click): where :focus-visible can't be asked, assume it is. */
export function keyboardFocus(el) {
  try { return el.matches(':focus-visible'); } catch { return true; }
}

/** Arrow keys, Home and End over a radio group: choose (or, locked, only move focus). */
function useRoving(count, current, onChoose, locked) {
  const refs = useRef([]);
  const focusable = current >= 0 ? current : 0;
  function onKeyDown(event, index) {
    const next = keyChoice(event.key, index, count);
    if (next === null) return;
    event.preventDefault();
    if (!locked) onChoose(next);
    refs.current[next]?.focus();
  }
  return { refs, focusable, onKeyDown };
}

/**
 * @param {{ value: 'input'|'forward'|null, onChange: Function, locked?: boolean, decided?: 'input'|'forward'|null,
 *   evidence?: boolean, groupRef?: object, level?: 1|2, labelledBy?: string|null, mine?: boolean }} props
 * `decided`: after commitment, the door the filter took (its style; level 2
 * also says so in words inside it). `evidence`: the current message is
 * about this choice. `mine`: the locked choice is the learner's committed
 * one. `labelledBy`: the action line naming this step (else «Ланцюжок»).
 * Level 1 (round 5): «самому роутеру → input», «іншому пристрою → forward»,
 * and after commitment one line under the pair: «твій вибір: … · фільтр: …».
 */
export function DoorChoice({ value, onChange, locked = false, decided = null, evidence = false, groupRef = null, mine = false, level = 2, labelledBy = null }) {
  const hooks = ['input', 'forward'];
  const current = hooks.indexOf(value);
  const roving = useRoving(hooks.length, current, i => onChange(hooks[i]), locked);
  // Always aria-labelledby (the action line, else the hidden «Ланцюжок»), so the attribute never swaps.
  return (
    <div className="ng-fw-doors" {...(evidence ? { 'data-evidence': 'current' } : {})}>
      <span id="ng-fw-doors-name" hidden>{ui.doors}</span>
      <div ref={groupRef} role="radiogroup" aria-labelledby={labelledBy ?? 'ng-fw-doors-name'} aria-readonly={locked || undefined} className="ng-fw-door-options">
        {hooks.map((hook, i) => (
          <button key={hook} ref={el => { roving.refs.current[i] = el; }} type="button" role="radio" aria-checked={i === current}
            tabIndex={i === roving.focusable ? 0 : -1} className={`ng-fw-door-option${decided === hook ? ' is-decided' : ''}`}
            onClick={() => { if (!locked) onChange(hook); }} onKeyDown={e => roving.onKeyDown(e, i)}>
            {level === 1
              ? <>{predictStep.l1Options[hook]} → <b>{hook}</b></>
              : <><b>{ui.hook[hook].split(' — ')[0]}</b> — {ui.hook[hook].split(' — ')[1]}</>}
            {level !== 1 && mine && i === current && <> <span className="ng-fw-yours">{ui.yours}</span></>}
            {level !== 1 && decided === hook && <span className="ng-fw-decided"> · ✓ {ui.filterChose}</span>}
          </button>
        ))}
      </div>
      {level === 1 && decided && <p className="ng-fw-marks">{predictStep.marks({ mine: mine ? value : null, filter: decided })}</p>}
    </div>
  );
}

function Chips({ chips }) {
  return (
    <span className="ng-fw-conds">
      {chips.map((chip, i) => <span key={i} className="ng-fw-cond" title={chip.title}>{chip.text}</span>)}
    </span>
  );
}

/**
 * @param {{ rows: object[], value: string|null, onChange: Function, locked?: boolean,
 *   outcomes?: Array<{ state: string, text: string }>|null, lit?: number, end?: boolean,
 *   deciding?: string|null, commands?: boolean, rowRef?: Function, notes?: string[],
 *   folded?: string|null, evidence?: string|null }} props
 * `outcomes`: walkOutcomes after commitment, in whole-table order (a row's
 * `at`, else its place here); rows on screen below `lit` show theirs, and at
 * the `end` every row does. `deciding`: the deciding row's id, whose
 * description shows once it is lit. `notes`: lines under the table (the
 * slow-path line once the FastTrack row is lit). `folded`: the other
 * chain's grey line (chainRows). `evidence`: the row the message is about.
 * `mine`: the locked choice is the learner's («твій вибір»; not a revealed answer).
 * A row not lit yet keeps its outcome line's height (blank), so the walk
 * (its frames, «По кроках») never moves the panel under the table.
 *
 * A row with a state condition is described (aria-describedby) by its
 * states' meanings, kept hidden; while the row has keyboard focus they float
 * beside it too (aria-hidden there, so they aren't read twice; nothing
 * moves when focus leaves). No extra tab stops: hover keeps the chip's title.
 */
export function RuleTable({ rows, value, onChange, locked = false, outcomes = null, lit = 0, end = false, deciding = null, commands = false, rowRef, notes = [], folded = null, evidence = null, mine = true, labelledBy = null }) {
  const current = rows.findIndex(r => r.id === value);
  const roving = useRoving(rows.length, current, i => onChange(rows[i].id), locked);
  const [focused, setFocused] = useState(null);
  return (
    <div className="ng-fw-rules">
      <span id="ng-fw-rules-name" hidden>{ui.rules}</span>
      <div role="radiogroup" aria-labelledby={labelledBy ?? 'ng-fw-rules-name'} aria-readonly={locked || undefined} className="ng-fw-table">
        {rows.map((row, i) => {
          const selected = i === current;
          const shown = outcomes && (i < lit || end) ? outcomes[row.at ?? i] : null;
          // The lower half floats its meaning above the row, clear of the sticky foot.
          const classes = ['ng-fw-row', row.end && 'is-chain-end', row.disabled && 'is-disabled', i >= rows.length / 2 && 'is-lower', selected && 'is-selected', shown && `is-${shown.state}`].filter(Boolean).join(' ');
          return (
            <button key={row.id} ref={el => { roving.refs.current[i] = el; rowRef?.(i, el); }} type="button" role="radio" aria-checked={selected}
              {...(evidence === row.id ? { 'data-evidence': 'current' } : {})} {...(row.purpose ? { 'data-term': '' } : {})}
              tabIndex={i === roving.focusable ? 0 : -1} className={classes} aria-describedby={row.meaning ? `ng-fw-meaning-${i}` : undefined}
              onFocus={e => setFocused(keyboardFocus(e.currentTarget) ? i : null)} onBlur={() => setFocused(f => (f === i ? null : f))}
              onClick={() => { if (!locked) onChange(row.id); }} onKeyDown={e => roving.onKeyDown(e, i)}>
              <span className="ng-fw-row-line">
                <span className="ng-fw-n">{row.end ? '' : row.n}</span>
                <span className="ng-fw-chain">{row.chain}</span>
                {row.end
                  ? <span className="ng-fw-end-label">{row.label}</span>
                  : <>
                    <span className="ng-fw-action">{row.action}</span>
                    <Chips chips={row.chips} />
                    {row.disabled && <span className="ng-fw-off">{ui.disabled}</span>}
                  </>}
              </span>
              {row.meaning && <span id={`ng-fw-meaning-${i}`} hidden>{row.meaning}</span>}
              {row.meaning && focused === i && <span className="ng-fw-meaning" aria-hidden="true">{row.meaning}</span>}
              {row.purpose && <Purpose stacked className="ng-fw-purpose">{row.purpose}</Purpose>}
              {commands && row.command && <code className="ng-fw-cmd">{row.command}</code>}
              {(shown || (locked && selected && mine)) ? (
                <span className="ng-fw-walk">
                  {locked && selected && mine && <span className="ng-fw-yours">{ui.yours}</span>}
                  {shown?.text}
                </span>
              ) : outcomes && <span className="ng-fw-walk is-pending" aria-hidden="true">{'\u00a0'}</span>}
            </button>
          );
        })}
      </div>
      {folded && <p className="ng-fw-folded">{folded}</p>}
      {notes.map(line => <p key={line} className="ng-fw-note">{line}</p>)}
    </div>
  );
}
