// A choice that is checked when it is made (C3's options, C1's places, C2's
// verdicts), as DHCP's Options: a radio group named by the action line. A
// tap, Enter or Space chooses (and so answers); the arrow keys, Home and End
// only move the focus. A wrong choice stays marked ✗ and the learner chooses
// again; the right one is marked ✓ and the group locks (aria-readonly).
import { useRef } from 'react';
import { keyChoice } from '../../../ui/components/Segmented.jsx';

/**
 * @param {{ options: Array<{ id: string, label: any, mono?: boolean }>, value?: string|null,
 *   marks?: Record<string, 'ok'|'no'>, onChoose: Function, locked?: boolean, labelledBy: string,
 *   evidence?: boolean, className?: string }} props
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
    <div role="radiogroup" aria-labelledby={labelledBy} aria-readonly={locked || undefined} data-options={options.length}
      className={`ng-ck-options ${className}`.trim()} {...(evidence ? { 'data-evidence': 'current' } : {})}>
      {options.map((o, i) => (
        <button key={o.id} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.id === value}
          tabIndex={i === focusable ? 0 : -1} className={`ng-ck-option${marks[o.id] ? ` is-${marks[o.id]}` : ''}`}
          onClick={() => { if (!locked) onChoose(o.id); }} onKeyDown={e => onKeyDown(e, i)}>
          <span className={o.mono ? 'ng-ck-option-text is-mono' : 'ng-ck-option-text'}>{o.label}</span>
          {marks[o.id] && <span className="ng-ck-mark" aria-hidden="true">{marks[o.id] === 'ok' ? '✓' : '✗'}</span>}
        </button>
      ))}
    </div>
  );
}
