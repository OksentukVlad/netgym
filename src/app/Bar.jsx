// The top bar, the screen's only header (ARCHITECTURE §6, round 2 step 7):
// «← Розділи» (in NetGym), the title, the slot where the open screen puts
// its controls, and the theme switch at the far right. The owner (Shell or
// Standalone) keeps the slot element in state and provides it as
// BarSlotContext around the bar and the screens, so a screen's tree never
// moves when the bar comes and goes. The bar is always dark, so whatever
// goes into the slot uses the dark tokens.
//
// Round 6 (the phone layer, plan-mobile v2 P1): under 640 px the bar is one
// row, «←», the section's name and «⋯». «⋯» opens a sheet that holds the
// slot (vendor, the section's mode), the screen's own choices
// (`sheetRef`: SheetControls in ui/BarSlot.jsx; exercise, level, task) and
// the theme switch. The sheet is the bar's end restyled, the same elements
// at every width, so nothing in it remounts when it opens or the window
// crosses 640 px. Open, it is a modal dialog: focus moves into it and stays
// there (Tab wraps), Escape, «Готово» or a tap outside close it, and focus
// returns to «⋯»; everything else (the page, the bar's own controls) is inert
// and aria-hidden meanwhile (ui/phone.js isolate). Widening past 640 px closes it.
import { useEffect, useId, useRef, useState } from 'react';
import Button from '../ui/components/Button.jsx';
import { usePref } from '../ui/useStore.js';
import { isolate, trapTab, usePhone } from '../ui/phone.js';
import { uk as shared } from '../ui/uk.js';
import { uk } from './uk.js';
import '../ui/tokens.css';
import './bar.css';

/**
 * @param {{
 *   onBack?: () => void,     // «← Розділи»; absent in single-section builds
 *   caption?: string,        // «NetGym» before the section title
 *   title: string,
 *   headingRef?: object,     // the shell focuses the heading after navigation
 *   slotRef: (el: HTMLElement|null) => void,
 *   sheetRef?: (el: HTMLElement|null) => void,   // the sheet's area for the screen's own choices
 * }} props
 */
export default function Bar({ onBack, caption, title, headingRef, slotRef, sheetRef }) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const titleId = useId();
  const nav = useRef(null);
  const end = useRef(null);
  const button = useRef(null);
  const shown = phone && open;

  const release = useRef(null);
  function close(refocus = true) {
    setOpen(false);
    // The page comes back first (an inert «⋯» can't take the focus); «⋯» is at the page's top:
    // taking the focus back must not scroll the page there.
    release.current?.();
    release.current = null;
    if (refocus) button.current?.focus({ preventScroll: true });
  }
  // Wider than a phone: no sheet (the controls are back in the bar's row).
  useEffect(() => { if (!phone && open) setOpen(false); }, [phone]);
  // Open: focus the first choice, the page behind is inert and doesn't scroll.
  useEffect(() => {
    if (!shown) return undefined;
    const sheet = end.current;
    const first = [...sheet.querySelectorAll('.ng-bar-sheet-body button, .ng-bar-sheet-body [tabindex="0"]')]
      .find(el => el.tabIndex >= 0 && el.getClientRects().length);
    // Opening never moves the page behind (round 6 repair): focus without scrolling, the scroll position kept.
    const page = document.scrollingElement, top = page?.scrollTop ?? 0;
    (first ?? sheet.querySelector('.ng-bar-sheet-done'))?.focus({ preventScroll: true });
    // Round 6 repair (Astra): everything outside the sheet (the page, and the bar's own «←», title and «⋯»)
    // is inert and aria-hidden while it is open; the backdrop stays, to close it on a tap.
    release.current = isolate(sheet);
    const root = document.documentElement;
    root.classList.add('ng-sheet-open');
    if (page && page.scrollTop !== top) page.scrollTop = top;
    // Native listeners on the document: the choices in the sheet are portals from the screen's React
    // tree (their key events bubble to the screen in React), and a choice can replace the screen's
    // part that holds it (an exercise switch), which drops the focus to the page's body.
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      trapTab(event, sheet);
    };
    // Focus dropped that way goes back to the choice made: the checked option of the group it was in.
    let group = null;
    const onFocusIn = event => { group = event.target.closest?.('[role="radiogroup"]')?.getAttribute('aria-label') ?? group; };
    const keep = new MutationObserver(() => {
      if (sheet.contains(document.activeElement)) return;
      const groups = [...sheet.querySelectorAll('[role="radiogroup"]')];
      const same = groups.find(g => g.getAttribute('aria-label') === group);
      (same?.querySelector('[aria-checked="true"]') ?? sheet.querySelector('.ng-bar-sheet-done'))?.focus();
    });
    keep.observe(sheet, { childList: true, subtree: true });
    document.addEventListener('keydown', onKey);
    sheet.addEventListener('focusin', onFocusIn);
    return () => {
      keep.disconnect();
      document.removeEventListener('keydown', onKey);
      sheet.removeEventListener('focusin', onFocusIn);
      release.current?.();
      release.current = null;
      root.classList.remove('ng-sheet-open');
    };
  }, [shown]);

  const sheet = phone ? { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-sheet': open ? 'open' : 'closed' } : {};
  return (
    <nav ref={nav} className="ng-bar" aria-label={uk.appName}>
      {onBack && (
        <Button className="ng-bar-back" onClick={onBack} aria-label={phone ? uk.backToSections : undefined}>
          <span aria-hidden={phone || undefined}>{uk.backArrow}</span><span className="ng-bar-back-word">{uk.backWord}</span>
        </Button>
      )}
      <h2 className="ng-bar-title" tabIndex={-1} ref={headingRef}>
        {caption && <><span className="ng-caption">{caption}</span>{' '}</>}
        <span className="ng-bar-section">{title}</span>
      </h2>
      {phone && (
        <button ref={button} type="button" className="ng-bar-sheet-button" aria-label={shared.sheet.button} title={shared.sheet.button}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={sheetId} onClick={() => (open ? close() : setOpen(true))}>
          <span aria-hidden="true">⋯</span>
        </button>
      )}
      {shown && <div className="ng-bar-backdrop" aria-hidden="true" data-isolate-keep="" onClick={() => close()} />}
      <div ref={end} id={sheetId} className="ng-bar-end" {...sheet}>
        {phone && (
          <div className="ng-bar-sheet-head">
            <p id={titleId} className="ng-bar-sheet-title">{shared.sheet.title}</p>
            <button type="button" className="ng-bar-sheet-done" onClick={() => close()}>{shared.sheet.done}</button>
          </div>
        )}
        <div className="ng-bar-sheet-body">
          <div className="ng-bar-sheet-screen" ref={sheetRef} />
          <div className="ng-bar-slot" ref={slotRef} />
          <ThemeButton />
        </div>
      </div>
    </nav>
  );
}

/**
 * The light/dark switch. The theme is an app-wide preference, so the shell
 * owns the one button: in the bar on every section screen, and on the start
 * screen (Shell.jsx). Its label names what pressing it does; in the phone
 * sheet the label is written out beside the icon.
 */
export function ThemeButton() {
  const [theme, setTheme] = usePref('theme');
  const isDark = theme !== 'light';
  const label = isDark ? uk.theme.light : uk.theme.dark;
  // The words beside the icon in the phone sheet only (the start screen's switch hides them by CSS).
  const phone = usePhone();
  return (
    <button type="button" className="ng-theme-switch" onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}>{isDark ? '☀️' : '🌙'}{phone && <span className="ng-theme-word" aria-hidden="true">{label}</span>}</button>
  );
}
