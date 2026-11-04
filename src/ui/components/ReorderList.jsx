// A list the learner puts in order (DR-1 spec v2 Q6): an ordinary ordered
// list, one row per item, each with a named handle (≡ and the row's current
// position), the caller's content, and «↑» «↓» buttons (44 px). First user:
// the router setup drill; the firewall order exercise (FW-2) is next.
//
// - The DOM order is the order given (`items`); the numbers are positions,
//   computed here, never carried by the items.
// - «↑» is unavailable only on the first row and «↓» only on the last: the
//   limits depend on the list's ends alone (aria-disabled, so a button that
//   reaches an end keeps its focus). Round 9 (B5): on a phone a row also has
//   «↑↑», to the top of the list (a deck took 49 taps of ↑ ↓).
// - `start`: the first row's number, for a list that goes on from another
//   (the firewall's two chains): numbers and names only, the moves stay its own.
// - Keyboard, on the handle only (events from the content's own controls,
//   such as a Segmented or a field, never reach it): Space or Enter grabs;
//   while grabbed, the arrows, Home and End move the item, Space or Enter
//   drops it, Esc puts it back where the grab started. Not grabbed, the
//   arrows, Home and End move the focus between handles. Moving focus
//   elsewhere drops the item where it is. A click (pointer, screen reader)
//   grabs and drops as Space does.
// - Round 10: the handle also drags, by Pointer Events (mouse, touch, pen; the
//   HTML5 drag API does nothing on touch). Only the handle has `touch-action:
//   none`, so a phone's page still scrolls from anywhere else, and only the
//   handle starts a drag, so the content's controls never do. Past a few px
//   of movement the card follows the pointer up and down inside its own list
//   (its centre stays between the list's ends, so a drag can't leave the list
//   or widen the page); the other rows move aside as the drop would leave them
//   and a dashed slot shows where it will land. Nearer than that it is a
//   click. Near the edge of the scroll area (scrollAreaOf: the page on
//   a phone, .ng-screen on a desktop) the area scrolls, until the list's end
//   is in view. The DOM order doesn't change during a drag: the drop commits
//   once through `onReorder`. Esc, `pointercancel` or the window losing focus
//   put the card back; a list that changes under a drag ends it quietly.
// - Every move is committed at once through `onReorder` (so the DOM order is
//   always the caller's order); the grab's start order is this component's
//   own state, kept only for Esc.
// - Focus follows the item, not the position: after a move the moved item's
//   handle (or the button pressed) has the focus again.
// - Grab, each position, drop and cancel are announced in a polite live line.
//   An announcement is kept as what happened (kind, item, position), not as
//   words: it is put into words with the item's name as shown now, and only
//   while that name is the one it was made with, so a name the caller has
//   since hidden (a command that became a typed card) never stays in the
//   page; another list (another task) clears it. Each announcement has its
//   own stamp: the line is cleared for a moment and filled again (as
//   Feedback does), so the same words twice are announced twice.
//   Item ids are React keys only; they never reach the DOM.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CLEAR_MS } from './Feedback.jsx';
import { uk } from '../uk.js';
import { scrollAreaOf, usePhone, visibleHeightOf } from '../phone.js';
import { edgeSpeed, keyTarget, landing, moveTo } from '../reorder.js';
import '../tokens.css';
import './ReorderList.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const sameItems = (a, b) => a.length === b.length && a.every(id => b.includes(id));

// How far a press moves before it is a drag: a finger shakes more than a mouse.
const LIFT_MOUSE = 4;
const LIFT_TOUCH = 8;
// Auto-scroll stops once the list's end is this far inside the scroll area.
const END_MARGIN = 16;

/**
 * Dragging a row by its handle. The card's position and the scrolling are
 * written per frame, outside React; React hears only where the card would
 * land. `on`: lifted(id), landed(id, to), cancelled(id), read at the moment
 * they are called, so a drop reaches the caller's current `onReorder`.
 */
function useRowDrag({ ids, wrap, rowOf, on }) {
  const [drag, setDrag] = useState(null); // { id, top, height }: the slot it would land in
  const session = useRef(null);
  const skipClick = useRef(false);
  const now = useRef(null);

  useIsoLayoutEffect(() => {
    now.current = { ids, on };
    const s = session.current;
    if (s && s.order !== ids.join('\n')) s.end('quiet');
  });
  useEffect(() => () => session.current?.end('quiet'), []);

  /** The rows where the layout has them (in the wrap, so scrolling changes nothing; the transforms don't count). */
  const measure = () => now.current.ids.map(id => {
    const row = rowOf(id);
    return { top: row.offsetTop, bottom: row.offsetTop + row.offsetHeight };
  });
  /** Brings the card to the pointer; the other rows make room where it would land. */
  function follow(s) {
    const { ids: order } = now.current, rows = measure(), from = order.indexOf(s.id);
    const home = (rows[from].top + rows[from].bottom) / 2;
    const y = s.pointerY - wrap.current.getBoundingClientRect().top - s.grip;
    const centre = Math.max(rows[0].top, Math.min(rows[rows.length - 1].bottom, y));
    rowOf(s.id).style.transform = `translate3d(0, ${centre - home}px, 0)`;
    const { to, top, height, step } = landing(rows, from, centre);
    if (to === s.to && top === s.top) return;
    s.to = to;
    s.top = top;
    order.forEach((id, i) => {
      if (i === from) return;
      const by = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
      rowOf(id).style.transform = by ? `translate3d(0, ${by}px, 0)` : '';
    });
    setDrag({ id: s.id, top, height });
  }
  function autoScroll(s, time) {
    const area = scrollAreaOf(wrap.current);
    if (!area) return;
    const page = area === document.scrollingElement || area === document.documentElement;
    const top = page ? 0 : area.getBoundingClientRect().top;
    const bottom = top + visibleHeightOf(wrap.current);
    const speed = edgeSpeed(s.pointerY, top, bottom);
    const elapsed = Math.min(48, time - (s.time ?? time - 16));
    s.time = time;
    if (!speed) return;
    const rows = measure(), at = wrap.current.getBoundingClientRect().top;
    const more = speed < 0 ? at + rows[0].top < top + END_MARGIN : at + rows[rows.length - 1].bottom > bottom - END_MARGIN;
    if (more) area.scrollTop += Math.sign(speed) * Math.max(1, Math.round(Math.abs(speed) * elapsed / 1000));
  }

  function press(event, id) {
    if (session.current || !event.isPrimary || event.button !== 0) return;
    skipClick.current = false;
    const handle = event.currentTarget;
    const s = {
      id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, pointerY: event.clientY,
      lift: event.pointerType === 'mouse' ? LIFT_MOUSE : LIFT_TOUCH,
      ids: now.current.ids, order: now.current.ids.join('\n'), lifted: false, grip: 0, to: -1, top: -1, frame: 0, time: null,
    };
    const frame = time => {
      s.frame = requestAnimationFrame(frame);
      autoScroll(s, time);
      follow(s);
    };
    const onMove = e => {
      if (e.pointerId !== s.pointerId) return;
      s.pointerY = e.clientY;
      if (s.lifted || Math.hypot(e.clientX - s.x, e.clientY - s.y) < s.lift) return;
      s.lifted = true;
      try { handle.setPointerCapture(s.pointerId); } catch { /* the pointer has already gone: its up or cancel ends this */ }
      const home = rowOf(id);
      s.grip = s.y - wrap.current.getBoundingClientRect().top - (home.offsetTop + home.offsetHeight / 2);
      now.current.on.lifted(id);
      follow(s);
      s.frame = requestAnimationFrame(frame);
    };
    const onUp = e => { if (e.pointerId === s.pointerId) s.end('drop'); };
    const onCancel = e => { if (e.pointerId === s.pointerId) s.end('cancel'); };
    const onBlur = () => s.end('cancel');
    // Capture: while a card is carried the keys are the drag's, so the handle's own (a grab, a move) stay out of it.
    const onKey = e => {
      if (!s.lifted) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') s.end('escape');
    };
    s.end = how => {
      if (session.current !== s) return;
      session.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      cancelAnimationFrame(s.frame);
      if (!s.lifted) return;
      if (how === 'drop') follow(s); // where the pointer was let go, not the last frame
      for (const row of s.ids.map(rowOf)) if (row) row.style.transform = '';
      setDrag(null);
      // A mouse's press and release on the handle are also a click; after a drop or Esc it means nothing.
      skipClick.current = how === 'drop' || how === 'escape';
      if (how === 'drop') now.current.on.landed(id, s.to);
      else if (how !== 'quiet') now.current.on.cancelled(id);
    };
    session.current = s;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
  }
  /** Whether a click on a handle is one (not the end of a drag). */
  function clicked() {
    const skip = skipClick.current;
    skipClick.current = false;
    return !skip;
  }
  return { drag, press, clicked };
}

/**
 * @param {{
 *   items: Array<{ id: string }>,              // in the current order; ids are keys, never shown
 *   onReorder: (ids: string[], moved: string) => void,   // the whole new order, and the item moved
 *   label: string,                             // the list's accessible name
 *   name: (item: object) => string,            // an item in words, for its handle and announcements
 *   children: (item: object, index: number) => any,   // a row's content
 *   rowClassName?: (item: object, index: number) => string,
 *   showHelp?: boolean,                        // the keyboard line above the list (it describes the handles either way)
 *   start?: number,                            // the first row's number
 *   className?: string,
 * }} props
 */
export default function ReorderList({ items, onReorder, label, name, children, rowClassName, showHelp = true, start = 1, className = '' }) {
  const phone = usePhone();
  const ids = items.map(item => item.id);
  const total = ids.length;
  const [grab, setGrab] = useState(null); // { id, start: ids at the grab }
  // The last announcement: { kind, id, n, name, stamp }; `settled` is the stamp shown.
  const [said, setSaid] = useState(null);
  const [settled, setSettled] = useState(0);
  const els = useRef({ row: new Map(), handle: new Map(), top: new Map(), up: new Map(), down: new Map() });
  const wrap = useRef(null);
  const focusAfter = useRef(null);
  const helpId = useId();
  // A grab belongs to this list of items; another list (another task) ends it.
  const held = grab && ids.includes(grab.id) && sameItems(grab.start, ids) ? grab : null;

  // Focus by identity: React may move the focused row's node, which loses
  // focus; and a moved row may leave the scrolled view (1000 × 520, zoom), so
  // it is brought back, as near as the scroll area's padding allows.
  useIsoLayoutEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    focusAfter.current = null;
    const el = els.current[want.part].get(want.id);
    if (!el) return;
    if (el.ownerDocument.activeElement !== el) el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest' });
  });

  const nameOf = id => name(items.find(item => item.id === id));
  const say = (kind, id, n) => setSaid(last => ({ kind, id, n, name: nameOf(id), stamp: (last?.stamp ?? 0) + 1 }));
  useEffect(() => {
    if (!said || said.stamp === settled) return undefined;
    const timer = setTimeout(() => setSettled(said.stamp), CLEAR_MS);
    return () => clearTimeout(timer);
  }, [said, settled]);
  const subject = said && items.find(i => i.id === said.id);
  const spoken = said && said.stamp === settled && subject && name(subject) === said.name
    ? uk.reorder[said.kind]({ name: said.name, n: said.n, total }) : '';
  function commit(next, id, part) {
    focusAfter.current = { id, part };
    onReorder(next, id);
  }
  function toggle(id) {
    const n = ids.indexOf(id) + 1;
    if (held?.id === id) {
      setGrab(null);
      say('dropped', id, n);
    } else {
      setGrab({ id, start: ids });
      say('grabbed', id, n);
    }
  }
  function cancel(id) {
    const n = held.start.indexOf(id) + 1;
    setGrab(null);
    say('cancelled', id, n);
    if (held.start.some((x, i) => x !== ids[i])) commit([...held.start], id, 'handle');
  }

  function onHandleKey(event, id, index) {
    if (event.target !== event.currentTarget) return; // only the handle's own keys
    if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
      event.preventDefault();
      toggle(id);
      return;
    }
    const to = keyTarget(event.key, index, total);
    if (held?.id === id) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel(id);
        return;
      }
      if (to === null) return;
      event.preventDefault();
      const next = moveTo(ids, id, to);
      if (next) commit(next, id, 'handle');
      say('moved', id, to + 1);
      return;
    }
    if (to === null) return;
    event.preventDefault();
    els.current.handle.get(ids[to])?.focus();
  }
  function onHandleBlur(event, id) {
    // Focus going to another element drops the item where it is; a node React
    // moved (no related target) keeps the grab.
    if (held?.id !== id || !event.relatedTarget || event.relatedTarget === event.currentTarget) return;
    setGrab(null);
    say('dropped', id, ids.indexOf(id) + 1);
  }
  function step(id, index, delta, part) {
    const next = moveTo(ids, id, index + delta);
    if (!next) return;
    commit(next, id, part);
    say('placed', id, index + delta + 1);
  }
  /** «↑↑» (a phone): to the top of the list. */
  function toTop(id, index) {
    const next = moveTo(ids, id, 0);
    if (!next) return;
    commit(next, id, 'top');
    say('placed', id, 1);
  }
  const keep = (part, id) => el => { if (el) els.current[part].set(id, el); else els.current[part].delete(id); };
  const { drag, press, clicked } = useRowDrag({
    ids, wrap, rowOf: id => els.current.row.get(id),
    on: {
      lifted(id) {
        setGrab(null);
        say('grabbed', id, ids.indexOf(id) + 1);
      },
      landed(id, to) {
        focusAfter.current = { id, part: 'handle' };
        const next = moveTo(ids, id, to);
        if (next) commit(next, id, 'handle');
        say('dropped', id, to + 1);
      },
      cancelled(id) {
        focusAfter.current = { id, part: 'handle' };
        say('cancelled', id, ids.indexOf(id) + 1);
      },
    },
  });

  return (
    <div ref={wrap} className={`ng-reorder-wrap${drag ? ' is-carrying' : ''} ${className}`.trim()}>
      <p id={helpId} className={showHelp ? 'ng-reorder-help' : 'ng-sr-only'}>{uk.reorder.help}</p>
      <ol className="ng-reorder" aria-label={label}>
        {items.map((item, index) => {
          const n = index + start, dragged = drag?.id === item.id, grabbed = dragged || held?.id === item.id, first = index === 0, last = index === total - 1;
          return (
            <li key={item.id} ref={keep('row', item.id)} className={`ng-reorder-item${grabbed ? ' is-grabbed' : ''}${dragged ? ' is-dragging' : ''}${rowClassName ? ` ${rowClassName(item, index)}` : ''}`.trimEnd()}>
              <div ref={keep('handle', item.id)} role="button" tabIndex={0} className="ng-reorder-handle" aria-pressed={grabbed}
                aria-label={uk.reorder.handle({ n, name: name(item) })} aria-describedby={helpId}
                onPointerDown={event => press(event, item.id)} onKeyDown={event => onHandleKey(event, item.id, index)}
                onClick={() => { if (clicked()) toggle(item.id); }} onBlur={event => onHandleBlur(event, item.id)}>
                <span className="ng-reorder-grip" aria-hidden="true">≡</span>
                <span className="ng-reorder-n" aria-hidden="true">{n}</span>
              </div>
              <div className="ng-reorder-body">{children(item, index)}</div>
              <div className="ng-reorder-moves">
                {phone && (
                  <button ref={keep('top', item.id)} type="button" className="ng-reorder-move ng-reorder-top" aria-label={uk.reorder.top({ n })} aria-disabled={first}
                    onClick={() => { if (!first) toTop(item.id, index); }}><span aria-hidden="true">↑↑</span></button>
                )}
                <button ref={keep('up', item.id)} type="button" className="ng-reorder-move" aria-label={uk.reorder.up({ n })} aria-disabled={first}
                  onClick={() => { if (!first) step(item.id, index, -1, 'up'); }}><span aria-hidden="true">↑</span></button>
                <button ref={keep('down', item.id)} type="button" className="ng-reorder-move" aria-label={uk.reorder.down({ n })} aria-disabled={last}
                  onClick={() => { if (!last) step(item.id, index, 1, 'down'); }}><span aria-hidden="true">↓</span></button>
              </div>
            </li>
          );
        })}
      </ol>
      {drag && <div className="ng-reorder-slot" style={{ top: `${drag.top}px`, height: `${drag.height}px` }} aria-hidden="true" />}
      <p className="ng-sr-only ng-reorder-live" aria-live="polite">{spoken}</p>
    </div>
  );
}
