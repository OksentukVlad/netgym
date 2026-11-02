// The top bar's control slot (ARCHITECTURE §6, round 2 step 7). Shell and
// Standalone provide BarSlotContext: the element in the bar that holds a
// screen's controls. A screen wraps its controls in <BarControls>, which
// renders them into that element with a portal. They stay in the screen's
// React tree, so its hooks and session work as before.
//
//   - no provider (a screen rendered on its own, as in the tests): the
//     controls render in place;
//   - a provider whose element isn't mounted yet: nothing until it is.
//
// Round 6 (the phone layer, plan-mobile v2 P1): under 640 px the bar is one
// row and its slot, the theme switch and a screen's own secondary choices
// sit in the bar's «⋯» sheet (src/app/Bar.jsx). The slot is the same element
// at every width (the sheet is the bar's end, restyled), so nothing in it
// remounts when the sheet opens or the window crosses 640 px.
//
// <SheetControls> is for a screen's own choices that stay in the screen on a
// desktop (an exercise or level switch in the screen's header) and go into
// the sheet on a phone. Its children render, through a portal, into one
// host element made once; the host is moved between its place in the screen
// and the sheet's area (SheetAreaContext), so the children never remount
// either. <SheetChoice> is a Segmented inside SheetControls, with, on a
// phone, a one-row stepper «‹ 1/4 · Два відділи ›» left in the screen.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Segmented from './components/Segmented.jsx';
import { usePhone, useIsoLayoutEffect } from './phone.js';
import { uk } from './uk.js';
import './tokens.css';
import './components/Sheet.css';

/** The bar's slot element; `undefined` outside a bar, `null` until mounted. */
export const BarSlotContext = createContext(undefined);

/** The sheet's area for screen choices; `undefined` outside a shell, `null` until mounted. */
export const SheetAreaContext = createContext(undefined);

/** @param {{ children: any }} props */
export function BarControls({ children }) {
  const slot = useContext(BarSlotContext);
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}

/**
 * A screen's own choices: in place on a desktop, in the bar's sheet on a
 * phone, never remounted (see the top of this file).
 * @param {{ label?: string, children: any }} props `label`: a caption shown above them in the sheet
 */
export function SheetControls({ label = null, children }) {
  const area = useContext(SheetAreaContext);
  const phone = usePhone();
  const place = useRef(null);
  const [host] = useState(() => {
    if (area === undefined || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'ng-sheet-host';
    return el;
  });
  useIsoLayoutEffect(() => {
    if (!host) return;
    const target = phone && area ? area : place.current;
    if (!target || host.parentNode === target) return;
    const active = document.activeElement;
    const hadFocus = active && host.contains(active);
    target.appendChild(host);
    if (hadFocus && document.activeElement !== active) active.focus?.({ preventScroll: true });
  });
  useEffect(() => () => { host?.parentNode?.removeChild(host); }, []);
  const content = <>{label && <p className="ng-sheet-caption" aria-hidden="true">{label}</p>}{children}</>;
  if (!host) return children;
  return <><span ref={place} className="ng-sheet-place" />{createPortal(content, host)}</>;
}

/** A choice's caption in the «⋯» sheet only (round 6 repair, Fable): put it before a Segmented inside BarControls. */
export function SheetCaption({ label }) {
  return <p className="ng-sheet-caption" aria-hidden="true">{label}</p>;
}

/** An option's words in the stepper: its `step`, else its label (a string), else its title; without a leading «1 · ». */
export function stepText(option) {
  const words = option.step ?? (typeof option.label === 'string' ? option.label : option.title ?? String(option.value));
  return String(words).replace(/^\d+\s*·\s*/u, '');
}

/**
 * «‹ 1/4 · Два відділи ›»: the previous and next option, and where the
 * choice is. «‹» and «›» are unavailable at the ends (aria-disabled, so a
 * button at an end keeps its focus).
 * @param {{ label: string, options: Array<object>, value: any, onChange: Function, className?: string }} props
 */
export function Stepper({ label, options, value, onChange, className = '' }) {
  const i = Math.max(0, options.findIndex(o => o.value === value));
  const first = i === 0, last = i === options.length - 1;
  const prev = options[i - 1], next = options[i + 1];
  return (
    <div className={`ng-stepper ${className}`.trim()} role="group" aria-label={label}>
      <button type="button" className="ng-stepper-move" aria-disabled={first}
        aria-label={prev ? uk.stepper.prev({ label, name: stepText(prev) }) : uk.stepper.none({ label })}
        onClick={() => { if (prev) onChange(prev.value); }}><span aria-hidden="true">‹</span></button>
      <p className="ng-stepper-now">
        <span className="ng-stepper-n">{`${i + 1}/${options.length}`}</span>
        <span aria-hidden="true"> · </span>
        <span className="ng-stepper-name">{stepText(options[i])}</span>
      </p>
      <button type="button" className="ng-stepper-move" aria-disabled={last}
        aria-label={next ? uk.stepper.next({ label, name: stepText(next) }) : uk.stepper.none({ label })}
        onClick={() => { if (next) onChange(next.value); }}><span aria-hidden="true">›</span></button>
    </div>
  );
}

/**
 * A Segmented choice that goes into the sheet on a phone; with `stepper`,
 * the screen keeps a Stepper over the same options in its place.
 * @param {{ stepper?: boolean } & object} props the rest are Segmented's
 */
export function SheetChoice({ stepper = false, ...props }) {
  const phone = usePhone();
  const area = useContext(SheetAreaContext);
  return <>
    {stepper && phone && area !== undefined && props.options.length > 1 && (
      <Stepper label={props.label} options={props.options} value={props.value} onChange={props.onChange} className="ng-phone-only" />
    )}
    <SheetControls label={props.label}><Segmented {...props} /></SheetControls>
  </>;
}
