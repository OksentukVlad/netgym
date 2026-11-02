// One answer field (ARCHITECTURE §6): a visible label, commas become dots,
// Enter submits. With `options` it offers choose mode: the same answer picked
// from unmarked choices instead of typed. The mode is the caller's (a
// preference in the app store), so every field switches at once.
import { useId } from 'react';
import Segmented from './Segmented.jsx';
import { uk } from '../uk.js';
import '../tokens.css';
import './AddressField.css';

/**
 * @param {{
 *   label: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   onEnter?: () => void,
 *   hint?: string,                  // a short line under the label while typing
 *   kind?: 'ip'|'mask'|'prefix'|'cidr'|'int',
 *   invalid?: boolean,
 *   options?: Array<{ value: string|number, label?: string }> | null,
 *   mode?: 'type'|'choose',
 *   onModeChange?: (mode: 'type'|'choose') => void,
 *   placeholder?: string,
 *   readOnly?: boolean,
 * }} props
 */
export default function AddressField({ label, value, onChange, onEnter, hint, kind = 'ip', invalid = false, options = null, mode = 'type', onModeChange, placeholder, readOnly = false }) {
  const id = useId();
  const choosing = Boolean(options?.length) && mode === 'choose';
  // A prefix may be typed as /26 or as a dotted mask, and a CIDR has a slash:
  // neither fits a numeric or decimal keypad.
  const inputMode = kind === 'int' ? 'numeric' : kind === 'prefix' || kind === 'cidr' ? 'text' : 'decimal';
  const toggle = options?.length && onModeChange
    ? <button type="button" className="ng-field-mode" onClick={() => onModeChange(choosing ? 'type' : 'choose')}>{choosing ? uk.typeInstead : uk.chooseInstead}</button>
    : null;

  return (
    <div className={`ng-field${invalid ? ' is-invalid' : ''}`}>
      <div className="ng-field-head">
        {choosing
          ? <span className="ng-field-label" id={`${id}-label`}>{label}</span>
          : <label className="ng-field-label" htmlFor={id}>{label}</label>}
        {toggle}
      </div>
      {choosing ? (
        <Segmented
          label={uk.options({ label })}
          options={options.map(o => ({ value: String(o.value), label: o.label ?? String(o.value) }))}
          value={String(value ?? '')}
          onChange={onChange}
          invalid={invalid}
          readOnly={readOnly}
          className="ng-field-choices"
        />
      ) : (
        <>
          {hint && <p className="ng-field-hint" id={`${id}-hint`}>{hint}</p>}
          <input
            id={id}
            className="ng-field-input"
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={placeholder}
            readOnly={readOnly}
            aria-invalid={invalid}
            aria-describedby={hint ? `${id}-hint` : undefined}
            value={value ?? ''}
            onChange={event => onChange(event.target.value.replace(/,/g, '.'))}
            onKeyDown={event => {
              if (event.key === 'Enter' && onEnter) {
                event.preventDefault();
                onEnter();
              }
            }}
          />
        </>
      )}
    </div>
  );
}
