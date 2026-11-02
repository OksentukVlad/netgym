// A panel laid over another area (round 2 step 7 fix: «Правила» and
// «Текстом» over the diagram frame), so opening it doesn't push or squash
// the page. The caller positions it: Overlay.css makes it fill its nearest
// positioned ancestor.
//
// - A heading and a visible close button; the body scrolls on its own.
// - Opening it (a change from closed to open) brings the whole panel into
//   view (in one column the page scrolls) and moves focus to the body, so
//   the arrow keys and Page Up/Down scroll it at once; the body stays in the
//   Tab order while it is open.
// - Escape inside it, or the close button, calls `onClose`. The caller
//   closes it and returns focus to its toggle.
// - Closed, it renders its empty section with `hidden`, so a toggle's
//   aria-controls always points at it.
import { useEffect, useRef } from 'react';
import { uk } from '../uk.js';
import '../tokens.css';
import './Overlay.css';

/** Scrolls the nearest scrolling ancestor just enough to show `el` whole
 * (its top first, if it is taller). Chrome's scrollIntoView({ block:
 * 'nearest' }) left a panel half under the top edge at 200 % text. */
function reveal(el) {
  let box = el.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (!box) return;
  const r = el.getBoundingClientRect(), top = box.getBoundingClientRect().top + box.clientTop, bottom = top + box.clientHeight;
  if (r.top < top) box.scrollTop -= top - r.top;
  else if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top);
}

/**
 * @param {{
 *   id: string,            // the section's id (the toggle's aria-controls)
 *   title: string,         // the heading and the section's accessible name
 *   open: boolean,
 *   onClose: () => void,
 *   className?: string,
 *   children: any,
 * }} props
 */
export default function Overlay({ id, title, open, onClose, className = '', children }) {
  const panel = useRef(null);
  const body = useRef(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      body.current?.focus({ preventScroll: true });
      if (panel.current) reveal(panel.current);
    }
    wasOpen.current = open;
  }, [open]);

  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }

  return (
    <section ref={panel} id={id} className={`ng-overlay${className ? ` ${className}` : ''}`} aria-label={title} hidden={!open} onKeyDown={open ? onKeyDown : undefined}>
      {open && <>
        <div className="ng-overlay-head">
          <h3 className="ng-overlay-title">{title}</h3>
          <button type="button" className="ng-overlay-close" onClick={onClose}><span aria-hidden="true">✕</span> {uk.close}</button>
        </div>
        <div ref={body} className="ng-overlay-body" tabIndex={0}>{children}</div>
      </>}
    </section>
  );
}
