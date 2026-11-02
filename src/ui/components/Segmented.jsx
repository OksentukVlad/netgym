// A segmented switch: one choice out of a few, as a radio group.
// Tab reaches the chosen option; the arrow keys, Home and End move the choice.
// Read-only, it shows the choice but no click or key changes it.
import { useRef } from 'react';
import '../tokens.css';
import './Segmented.css';

/** The option a key moves the choice to (wrapping), or null: another key, or read-only. */
export function keyChoice(key, index, count, readOnly = false) {
  if (readOnly) return null;
  const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: count - 1 }[key];
  return next === undefined ? null : (next + count) % count;
}

/**
 * @param {{
 *   label: string,                // accessible name; shown as a caption when `showLabel`
 *   showLabel?: boolean,
 *   options: Array<{ value: any, label: string, title?: string }>,
 *   value: any,
 *   onChange: (value: any) => void,
 *   className?: string,
 *   invalid?: boolean,            // a check found it wrong: aria-invalid on the group, the chosen option marked
 *   describedBy?: string,         // the id of words about it (a mark's message)
 *   readOnly?: boolean,           // the choice is fixed (a solved answer)
 * }} props
 */
export default function Segmented({ label, showLabel = false, options, value, onChange, className = '', invalid = false, describedBy, readOnly = false }) {
  const refs = useRef([]);
  const current = options.findIndex(o => o.value === value);
  const focusable = current >= 0 ? current : 0;

  function move(event, index) {
    const next = keyChoice(event.key, index, options.length, readOnly);
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={`ng-segmented${readOnly ? ' is-readonly' : ''} ${className}`.trim()}>
      {showLabel && <span className="ng-caption ng-segmented-label" aria-hidden="true">{label}</span>}
      <div role="radiogroup" aria-label={label} aria-readonly={readOnly || undefined} aria-invalid={invalid || undefined}
        aria-describedby={describedBy} className="ng-segmented-options">
        {options.map((option, i) => {
          const checked = i === current;
          return (
            <button
              key={String(option.value)}
              ref={el => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === focusable ? 0 : -1}
              title={option.title}
              className={`ng-segmented-option${checked && invalid ? ' is-invalid' : ''}`}
              onClick={() => { if (!readOnly) onChange(option.value); }}
              onKeyDown={event => move(event, i)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
