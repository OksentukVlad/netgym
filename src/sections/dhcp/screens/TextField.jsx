// A text field in AddressField's look (its classes) for what AddressField
// would change: it turns commas into dots, and a DNS list or MikroTik's
// «Addresses to Give Out» (`A-B,C-D`) may have commas. Enter checks.
import { useId } from 'react';
import '../../../ui/components/AddressField.css';

/**
 * @param {{ label: string, value: string, onChange: Function, onEnter?: Function, hint?: string,
 *   invalid?: boolean, readOnly?: boolean, mono?: boolean }} props
 */
export default function TextField({ label, value, onChange, onEnter, hint, invalid = false, readOnly = false, mono = false }) {
  const id = useId();
  return (
    <div className={`ng-field${invalid ? ' is-invalid' : ''}`}>
      <div className="ng-field-head"><label className={`ng-field-label${mono ? ' ng-dh-wname' : ''}`} htmlFor={id}>{label}</label></div>
      {hint && <p className="ng-field-hint" id={`${id}-hint`}>{hint}</p>}
      <input id={id} className="ng-field-input" type="text" inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
        readOnly={readOnly} aria-invalid={invalid} aria-describedby={hint ? `${id}-hint` : undefined} value={value ?? ''}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && onEnter) { event.preventDefault(); onEnter(); } }} />
    </div>
  );
}
