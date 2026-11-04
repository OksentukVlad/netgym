// A list the learner puts in order (DR-1 spec v2 Q6): an ordinary ordered
// list, one row per item, each with a named handle (≡ and the row's current
// position), the caller's content, and «↑» «↓» buttons (44 px). First user:
// the router setup drill; the firewall order exercise (FW-2) is next.
//
// - The DOM order is the order given (`items`); the numbers are positions,
//   computed here, never carried by the items.
// - «↑» is unavailable only on the first row and «↓» only on the last: the
//   limits depend on the list's ends alone (aria-disabled, so a button that
//   reaches an end keeps its focus). There is no pointer drag, so the action
//   lines say «кнопками ↑ ↓». Round 9 (B5): on a phone a row also has «↑↑»,
//   to the top of the list (a deck took 49 taps of ↑ ↓).
// - `start`: the first row's number, for a list that goes on from another
//   (the firewall's two chains): numbers and names only, the moves stay its own.
// - Keyboard, on the handle only (events from the content's own controls,
//   such as a Segmented or a field, never reach it): Space or Enter grabs;
//   while grabbed, the arrows, Home and End move the item, Space or Enter
//   drops it, Esc puts it back where the grab started. Not grabbed, the
//   arrows, Home and End move the focus between handles. Moving focus
//   elsewhere drops the item where it is. A click (pointer, screen reader)
//   grabs and drops as Space does.
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
import { usePhone } from '../phone.js';
import { keyTarget, moveTo } from '../reorder.js';
import '../tokens.css';
import './ReorderList.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const sameItems = (a, b) => a.length === b.length && a.every(id => b.includes(id));

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
  const els = useRef({ handle: new Map(), top: new Map(), up: new Map(), down: new Map() });
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

  return (
    <div className={`ng-reorder-wrap ${className}`.trim()}>
      <p id={helpId} className={showHelp ? 'ng-reorder-help' : 'ng-sr-only'}>{uk.reorder.help}</p>
      <ol className="ng-reorder" aria-label={label}>
        {items.map((item, index) => {
          const n = index + start, grabbed = held?.id === item.id, first = index === 0, last = index === total - 1;
          return (
            <li key={item.id} className={`ng-reorder-item${grabbed ? ' is-grabbed' : ''}${rowClassName ? ` ${rowClassName(item, index)}` : ''}`.trimEnd()}>
              <div ref={keep('handle', item.id)} role="button" tabIndex={0} className="ng-reorder-handle" aria-pressed={grabbed}
                aria-label={uk.reorder.handle({ n, name: name(item) })} aria-describedby={helpId}
                onKeyDown={event => onHandleKey(event, item.id, index)} onClick={() => toggle(item.id)} onBlur={event => onHandleBlur(event, item.id)}>
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
      <p className="ng-sr-only ng-reorder-live" aria-live="polite">{spoken}</p>
    </div>
  );
}
