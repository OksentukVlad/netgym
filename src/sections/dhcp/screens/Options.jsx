// A choice that is checked when it is made (E1's two sides, E3's addresses
// and rules), as the firewall's chain step: a radio group named by the
// action line. A tap, Enter or Space chooses (and so answers); the arrow
// keys, Home and End only move the focus, so moving never answers. A wrong
// choice stays marked ✗ and the learner chooses again; the right one is
// marked ✓ and the group locks (aria-readonly).
//
// An option: `label` (Ukrainian first), or `purpose` (Ukrainian, one line:
// Purpose) over `command` (the native line, monospace; data-term).
import { useEffect, useRef } from 'react';
import { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import { keyChoice } from '../../../ui/components/Segmented.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';

/**
 * @param {{ options: Array<{ id: string, label?: string, purpose?: string, command?: string }>,
 *   value?: string|null, marks?: Record<string, 'ok'|'no'>, onChoose: Function, locked?: boolean,
 *   labelledBy: string, evidence?: boolean, className?: string }} props
 * `value`: the last choice; `marks`: the checked choices' marks.
 */
export default function Options({ options, value = null, marks = {}, onChoose, locked = false, labelledBy, evidence = false, className = '' }) {
  const refs = useRef([]);
  const current = options.findIndex(o => o.id === value);
  const focusable = current >= 0 ? current : 0;
  function onKeyDown(event, index) {
    const next = keyChoice(event.key, index, options.length);
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-readonly={locked || undefined}
      className={`ng-dh-options ${className}`.trim()} {...(evidence ? { 'data-evidence': 'current' } : {})}>
      {options.map((o, i) => (
        <button key={o.id} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.id === value}
          tabIndex={i === focusable ? 0 : -1} className={`ng-dh-option${marks[o.id] ? ` is-${marks[o.id]}` : ''}`}
          {...(o.command ? { 'data-term': '' } : {})}
          onClick={() => { if (!locked) onChoose(o.id); }} onKeyDown={e => onKeyDown(e, i)}>
          {o.command ? <>
            <Purpose>{o.purpose}</Purpose>
            <code className="ng-dh-command">{o.command}</code>
          </> : <span className="ng-dh-option-text">{o.label}</span>}
          {marks[o.id] && <span className="ng-dh-mark" aria-hidden="true">{marks[o.id] === 'ok' ? '✓' : '✗'}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * A new card (after «Наступна картка →»): the task, the card and its choices come into
 * view from the card's top (the page may be scrolled down to the last
 * verdict), and the card takes focus. Set the returned ref's `current` to
 * true when moving on; `key` is the card's position.
 */
export function useNewCard(cardRef, key) {
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const card = cardRef.current;
    const work = card?.closest('[data-region="work"]');
    bringIntoView([work?.querySelector('[data-region="question"]') ?? card, work?.querySelector('.ng-dh-options')].filter(Boolean));
    card?.focus({ preventScroll: true });
  }, [key]);
  return pending;
}
