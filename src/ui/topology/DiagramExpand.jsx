// The full-screen diagram (round 6, the phone layer, plan-mobile v2 P2). The
// three diagrams (routing's TopologyMap, the firewall's and VLAN's) keep
// MIN_TEXT_PX = 12 and their zoom ladder; on a phone, where the drawing
// pans, a named button «Розгорнути схему» (tapping the drawing does nothing
// new) opens the same diagram as a modal dialog over the whole window, where
// its frame is the window's size: it is drawn at its readable default scale,
// pans, and is wider when the phone is turned.
//
// Shared API (frozen in round 6, the phone layer):
//
//   const expand = useDiagramExpand({ zoom, onZoom });
//   <DiagramExpand expand={expand}>
//     <VlanDiagram zoom={expand.zoom} onZoom={expand.onZoom}
//       covered={expand.covered(textOpen)}
//       tools={<>…<ExpandButton expand={expand} /></>}
//       overlays={<TextEquivalent open={expand.covered(textOpen)} … />} />
//   </DiagramExpand>
//
// - `DiagramExpand` is a wrapper that takes no box (display: contents) until
//   opened; open, the same element is the dialog (role="dialog",
//   aria-modal, named «Схема»), with «Закрити» at its top. Its children are
//   never moved or remounted: the drawing keeps its selection, highlight,
//   packet path and focus targets.
// - Open: the rest of the page is inert and aria-hidden (reversibly),
//   focus moves to «Закрити» and stays in the dialog (Tab wraps); Escape or
//   «Закрити» close it and focus returns to «Розгорнути схему» (closed in
//   landscape, where that button is gone: «Текстом», else the drawing's
//   frame). The page behind doesn't scroll.
// - In portrait it opens at the whole drawing («Уся схема»); in landscape
//   at the readable default.
// - Zoom: the dialog has a zoom of its own; the stored zoom (`zoom`, the task
//   instance's view) is never changed by it, so it is the same after
//   closing, and a resize never resets it.
// - The text equivalent: while the dialog is open the drawing is shown
//   whatever «Текстом» says (`covered(textOpen)` is false), and the text
//   comes back on closing.
// - `useTextOpen()`: the initial state for a screen's «Текстом»: open on a
//   phone (the text carries the task where the drawing pans), closed above.
// - `ExpandButton` renders only on a phone (null above 640 px); an open
//   dialog stays open when the window widens (a phone turned to landscape).
import { useEffect, useId, useRef, useState } from 'react';
import { isolate, isPhoneNow, trapTab, usePhone } from '../phone.js';
import { uk } from '../uk.js';
import '../tokens.css';
import './DiagramExpand.css';

/**
 * @param {{ zoom?: any, onZoom?: Function }} stored the task instance's stored zoom and its setter
 * @returns {{ expanded: boolean, open: Function, close: Function, zoom: any, onZoom: Function,
 *   covered: (textOpen: boolean) => boolean, buttonRef: object }}
 */
export function useDiagramExpand({ zoom, onZoom = () => {} } = {}) {
  const [expanded, setExpanded] = useState(false);
  const [own, setOwn] = useState(undefined);
  // Vlad (2 Nov): on a phone the page shows the whole drawing from the start (an overview; its text may
  // be smaller than 12 px), with no zoom bar there; «Розгорнути схему» gives the readable, zoomable view.
  const phone = usePhone();
  const buttonRef = useRef(null);
  const boxRef = useRef(null);
  // Round 6 repair (Fable 3): in portrait it opens at the whole drawing («Уся схема»); «+» or a turn gives detail.
  const open = () => { setOwn(typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 'all' : undefined); setExpanded(true); };
  const close = () => {
    setExpanded(false);
    // After the render that shows the button again (it is out of sight while the dialog is open). Closed
    // in landscape the button is gone (wider than 640 px): «Текстом», else the drawing's frame, takes the focus.
    const later = typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : fn => fn();
    later(() => {
      const shown = el => el?.isConnected && el.getClientRects?.().length > 0;
      const box = boxRef.current;
      const target = [buttonRef.current, box?.querySelector('.ng-te-button'), box?.querySelector('[role="region"][tabindex="0"]')].find(shown);
      target?.focus();
    });
  };
  // Turning a phone to landscape (wider than 640 px) keeps the dialog open: the button may go, the
  // dialog stays until it is closed (then focus returns to the button if it is still there).
  return {
    expanded,
    open,
    close,
    zoom: expanded ? own : (phone && (zoom === undefined || zoom === null) ? 'all' : zoom),
    onZoom: expanded ? setOwn : onZoom,
    covered: textOpen => Boolean(textOpen) && !expanded,
    // The page's short overview on a phone (a screen may ask its drawing to keep to it); never the dialog.
    preview: phone && !expanded,
    buttonRef,
    boxRef,
  };
}

/** The initial state of a screen's «Текстом» (read once, at mount): on a phone the screen's choice
 * (`phoneOpen`: open where the text is what the first action needs), closed above 640 px. */
export function useTextOpen(phoneOpen = true) {
  return useState(() => phoneOpen && isPhoneNow());
}

/** «Розгорнути схему»: on a phone only. @param {{ expand: ReturnType<typeof useDiagramExpand>, className?: string }} props */
export function ExpandButton({ expand, className = '' }) {
  const phone = usePhone();
  if (!phone) return null;
  return (
    <button ref={expand.buttonRef} type="button" className={`ng-dx-button ${className}`.trim()} data-diagram-expand=""
      aria-haspopup="dialog" aria-expanded={expand.expanded} onClick={expand.open}>
      <span aria-hidden="true">⤢ </span>{uk.expand.button}
    </button>
  );
}

/** The wrapper that becomes the dialog. @param {{ expand: ReturnType<typeof useDiagramExpand>, label?: string, children: any }} props */
export default function DiagramExpand({ expand, label = uk.expand.title, children }) {
  const box = expand.boxRef;
  const closeRef = useRef(null);
  const titleId = useId();
  const { expanded } = expand;
  // Open: a modal (round 6 repair, Astra): the rest of the page is inert and hidden from assistive
  // technology until it closes, focus starts on «Закрити» and stays inside, the page doesn't scroll.
  useEffect(() => {
    if (!expanded) return undefined;
    const release = isolate(box.current);
    closeRef.current?.focus();
    const root = document.documentElement;
    root.classList.add('ng-dx-open');
    return () => { release(); root.classList.remove('ng-dx-open'); };
  }, [expanded]);
  function onKeyDown(event) {
    if (!expanded) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); expand.close(); return; }
    trapTab(event, box.current);
  }
  const dialog = expanded ? { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } : {};
  return (
    <div ref={box} className={`ng-dx${expanded ? ' is-open' : ''}`} {...dialog} onKeyDown={onKeyDown}>
      {expanded && (
        <div className="ng-dx-head">
          <p id={titleId} className="ng-dx-title">{label}</p>
          <p className="ng-dx-hint">{uk.expand.hint}</p>
          <button ref={closeRef} type="button" className="ng-dx-close" onClick={expand.close}><span aria-hidden="true">✕ </span>{uk.expand.close}</button>
        </div>
      )}
      {children}
    </div>
  );
}
