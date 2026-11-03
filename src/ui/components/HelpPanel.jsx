// The help panel (round 4 spec A1, with its v2 and v3 contracts): the check
// row and one message area, in the normal flow directly under (or, for a
// long board, before) what it checks. It replaces each screen's own mix of
// Feedback, HintLadder and Reveal; their looks (Feedback.css, HintLadder.css,
// Reveal.css) are reused, and no screen imports those three directly once it
// has moved here.
//
// Row: [Перевірити] [💡 Підказка n з N] [continueAction] [Далі →], then
//      «Показати відповідь» on its own line. Round 6: before the task is
//      passed or revealed, «Далі →» is not in the row: it is the quiet
//      link «Пропустити →» on that line, after «Показати відповідь». When the hint button goes, an
//      invisible copy holds its place until the next check press or a new
//      task: no button ever slides under the pointer.
//   - exactly one primary button (the `primary` rule below);
//   - the hint button goes after the last rung (focus to that rung's text);
//   - «Показати відповідь» is a quiet link, gone once revealed or solved.
//
// Message area, newest wins (verdict stamp, hints shown, reveal):
//   check (wrong)   the verdict, whole; its `detail` behind «Детальніше»;
//                   open hints fold into «Підказки (n)»
//   hint            the new rung, whole; the verdict shrinks to one line
//                   above it (its summaryNode stays); earlier rungs fold
//                   into «Підказки (n)»
//   edit            unchanged; the verdict line says «до змін» (`stale`),
//                   dimmed; a success's detail (about the checked answer)
//                   folds behind «Детальніше», so a long one shrinks
//   reveal          render() or the `applied` line; the verdict goes,
//                   hints fold
//   check (right)   the verdict and its `detail`, open; hints fold
//   next            everything resets (a new `taskKey`)
// Folded items are a native <details>: reachable, never deleted.
//
// One announcer: the current item's words sit in the screen's only
// role="status"; the folds, the shrunk verdict and `summaryNode`/`detail`
// sit outside it. When focus moves into the new content (the last hint, a
// reveal by its link) that event is not announced as well.
//
// Scrolling: only when the verdict stamp, the hints shown or the reveal
// change (never on mount, a restore, `stale`, typing or `next`), the check
// row, the current item and the screen's `[data-evidence="current"]` come
// into view together (`block: nearest`; instant under reduced motion).
//
// Long boards (`boardRef`): the panel lives next to the board in the DOM,
// before it when the board is taller than half the viewport, else after it
// (round 6, P3: `placement="after"` keeps it after the board at any height,
// so the task and the inputs come before «Перевірити» in the DOM and on
// screen: VLAN ports, firewall order, the setup decks)
// (its "home", decided once per task and step (`layoutKey`, by default the
// `stepKey`: a new stage is a new layout) and again only when the board's width
// changes: a check that adds marks never moves «Перевірити»). When the verdict marks a row (`data-evidence="current"`
// inside the board) and the check row, the current item and that row can't
// all fit in the viewport with the panel at home, the panel moves to just
// after that row, and back home when the verdict no longer names a row or
// the task changes. An edit that makes the verdict stale anchors it right
// after the edited row (the screen marks that row), without scrolling. The move keeps the panel mounted (a portal into one
// container), so its memory and focus survive.
//
// Keys: the panel adds no key handlers. A screen calls check.onCheck on
// Enter in the inputs the panel checks (the mask's AddressField onEnter),
// except inputs with their own row check (recall lines), which check that
// row and announce in their own live line. A disabled check is
// aria-disabled (it keeps focus) and does nothing.
//
// Gate hooks (tools/shots.mjs): data-help="row" on the check row,
// data-help-tone/-scope/-stale on a current verdict,
// data-help="message" on the message area, data-help-current on the current
// item, data-help="hint" on every rung, data-help-long on a current item
// taller than 60% of the viewport or than the space left for it under the
// check row (it then starts with a cue to scroll). A `data-evidence` mark
// inside the panel itself (a summaryNode) is never used for anchoring.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button.jsx';
import { CLEAR_MS } from './Feedback.jsx';
import { uk } from '../uk.js';
import { isPhoneNow } from '../phone.js';
import '../tokens.css';
import './Feedback.css';
import './HintLadder.css';
import './Reveal.css';
import './HelpPanel.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** A current item taller than this share of the viewport is "long". */
export const LONG_SHARE = 0.6;

/**
 * Which item is current, and which event (if any) made it so. Pure; the
 * panel keeps the result between renders.
 *   - a new `taskKey` (or no memory: a mount, a navigation back) starts
 *     over with the fallback reveal > verdict > newest hint, and no event;
 *   - a new `stepKey` forgets the verdict (it was about the previous step):
 *     that stamp stays void, on every later render, until a new check;
 *   - changes in one render: reveal > hint > verdict (hint 2 may check too),
 *     except that a verdict finishing the task (`done`) wins over a hint.
 * @param {object|null} prev the previous memory
 * @param {{ taskKey: any, stepKey?: any, stamp?: any, shown?: number, revealed?: boolean, done?: boolean }} now
 *   `stamp`: the verdict's stamp, null/undefined without a verdict; `done`:
 *   that verdict finishes the task
 * @returns {{ taskKey, stepKey, stamp, voidStamp, shown, revealed, last: 'verdict'|'hint'|'reveal'|null, event: 'verdict'|'hint'|'reveal'|null, seq: number }}
 */
export function helpMemory(prev, { taskKey, stepKey = null, stamp = null, shown = 0, revealed = false, done = false }) {
  const fresh = !prev || prev.taskKey !== taskKey;
  // A verdict a step change made void stays void (on every later render)
  // until a new check gives a new stamp.
  let voidStamp = fresh ? null : prev.voidStamp ?? null;
  if (!fresh && prev.stepKey !== stepKey && stamp != null && stamp === prev.stamp) voidStamp = stamp;
  if (voidStamp != null && stamp != null && stamp !== voidStamp) voidStamp = null;
  const live = stamp != null && stamp !== voidStamp ? stamp : null;
  const fallback = () => (revealed ? 'reveal' : live != null ? 'verdict' : shown > 0 ? 'hint' : null);
  if (fresh) return { taskKey, stepKey, stamp, voidStamp, shown, revealed, last: fallback(), event: null, seq: prev?.seq ?? 0 };
  let last = prev.last, event = null;
  const checked = live != null && live !== prev.stamp;
  if (revealed && !prev.revealed) event = 'reveal';
  else if (shown > prev.shown && !(checked && done)) event = 'hint';
  else if (checked) event = 'verdict';
  if (event) last = event;
  // What the current item was may be gone (a reset, a cleared or void verdict).
  if ((last === 'reveal' && !revealed) || (last === 'verdict' && live == null) || (last === 'hint' && shown === 0) || last === null) last = fallback();
  const same = !event && last === prev.last && stamp === prev.stamp && voidStamp === prev.voidStamp && shown === prev.shown && revealed === prev.revealed && stepKey === prev.stepKey;
  return same ? { ...prev, event: null } : { taskKey, stepKey, stamp, voidStamp, shown, revealed, last, event, seq: event ? prev.seq + 1 : prev.seq };
}

/**
 * The one primary button (v3): `check` while a check is live and the task
 * isn't done (solved, or its answer revealed); else `continue` if there is a
 * continueAction; else `next`. An explicit `primary` wins; 'none' means no
 * primary button at all.
 */
export function primaryOf({ primary, check, verdict, reveal, next, continueAction }) {
  if (primary === 'none') return null;   // no primary button (a recall step's «Далі →» stays secondary)
  if (primary) return primary;
  const live = Boolean(check) && !check.disabled;
  const done = isSuccess(verdict) || Boolean(reveal?.revealed);
  if (live && !done) return 'check';
  if (continueAction) return 'continue';
  // A skip («Пропустити →», before the task is done) is a quiet link, never the primary button.
  if (next && (done || next.ready)) return 'next';
  return check ? 'check' : null;   // a disabled check (nothing chosen yet) still looks like the next step
}

/** A verdict that finishes the task (scope defaults to 'task'). */
export const isSuccess = verdict => verdict?.tone === 'ok' && (verdict.scope ?? 'task') === 'task';

function reducedMotion() {
  try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

/** The pressed button went away (its node left the page): focus is nowhere useful. */
function focusLost() {
  const active = document.activeElement;
  return !active || active === document.body || !document.documentElement.contains(active);
}

/** The ancestors that scroll vertically, innermost first. Round 6: on a
 * phone the page itself scrolls (the document's scrolling element, last). */
function scrollers(el) {
  const out = [];
  for (let a = el?.parentElement; a; a = a.parentElement) {
    const style = window.getComputedStyle(a);
    if (/(auto|scroll)/.test(style.overflowY ?? '') && a.scrollHeight > a.clientHeight + 1) out.push(a);
  }
  const page = typeof document !== 'undefined' ? document.scrollingElement : null;
  if (page && el && page.contains?.(el) && !out.includes(page) && page.scrollHeight > page.clientHeight + 1) out.push(page);
  return out;
}

/** A scroller's visible band in client px, inside the window, less its scroll padding. */
function band(scroller) {
  const page = scroller && typeof document !== 'undefined' && scroller === document.scrollingElement;
  const top = scroller && !page ? Math.max(scroller.getBoundingClientRect().top + (scroller.clientTop ?? 0), 0) : 0;
  const bottom = scroller ? Math.min(top + scroller.clientHeight, window.innerHeight) : window.innerHeight;
  const style = scroller ? window.getComputedStyle(scroller) : null;
  const pad = name => parseFloat(style?.[name]) || 0;
  return { top: top + pad('scrollPaddingTop'), bottom: bottom - pad('scrollPaddingBottom') };
}

const boxOf = els => {
  const rects = els.filter(el => el?.isConnected !== false && el?.getBoundingClientRect).map(el => el.getBoundingClientRect()).filter(r => r.width > 0 || r.height > 0);
  return rects.length ? { top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) } : null;
};

/** Whether the elements fit, together, in the visible band of their scroller. */
export function fitsTogether(els) {
  const box = boxOf(els);
  if (!box) return true;
  const b = band(scrollers(els.find(Boolean))[0]);
  return box.bottom - box.top <= b.bottom - b.top;
}

/**
 * Bring the elements into view together (block: nearest): every scrolling
 * ancestor moves just enough; if they are taller than the view, their top
 * goes to the top. `behavior`: 'auto' (instant) or 'smooth'.
 */
export function bringIntoView(els, behavior = 'auto') {
  let box = boxOf(els);
  if (!box) return;
  for (const scroller of scrollers(els.find(Boolean))) {
    const b = band(scroller);
    let delta = 0;
    if (box.bottom - box.top > b.bottom - b.top || box.top < b.top) delta = box.top - b.top;
    else if (box.bottom > b.bottom) delta = box.bottom - b.bottom;
    if (Math.abs(delta) < 1) continue;
    const before = scroller.scrollTop;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: before + delta, behavior });
    else scroller.scrollTop = before + delta;
    const moved = behavior === 'smooth' ? delta : scroller.scrollTop - before;
    box = { top: box.top - moved, bottom: box.bottom - moved };
  }
}

/**
 * The check row, the current item and its evidence into view together; round 6: under 640 px, when
 * the three can't fit, the check row and the current item come first if they fit (a hint: always,
 * its evidence is reachable above); a long verdict or reveal keeps the three's top first. At 640 px
 * and wider, all three as one group, always (the panel anchors next to its evidence so they fit).
 */
export function bringPanelIntoView(row, current, evidence, behavior = 'auto', { hint = false } = {}) {
  const all = [row, current, evidence];
  // Round 6 repair: at 640 px and wider the evidence is never dropped (the panel anchors next to it
  // instead); under 640 px a short panel comes first and its evidence is reachable above it.
  bringIntoView(isPhoneNow() && !fitsTogether(all) && (hint || fitsTogether([row, current])) ? [row, current] : all, behavior);
}

/**
 * @param {{
 *   taskKey: any,                       // instance identity: a change resets the panel's memory
 *   stepKey?: any,                      // a step inside the task: a change forgets the verdict
 *   layoutKey?: any,                    // the board's layout (default stepKey): a change re-decides the home, keeping the verdict
 *   check?: { label?: string, onCheck: Function, disabled?: boolean } | null,   // null: no check button
 *   verdict?: { tone: 'ok'|'no'|'info', scope?: 'part'|'task', summary: string, summaryNode?: any,
 *               detail?: any, stamp: any } | null,
 *   stale?: boolean,                    // the answer changed since that verdict
 *   hints?: { texts: string[], shown: number, onMore: Function } | null,
 *   reveal?: { revealed: boolean, onReveal: Function, render: Function, applied?: string,
 *              label?: string, heading?: string } | null,
 *   next?: { label?: string, onNext: Function, destination?: string, ready?: boolean } | null,
 *                                       // before a pass or reveal a quiet «Пропустити →» link; `ready`: the screen's own round is over
 *   continueAction?: { label: string, onClick: Function } | null,
 *   primary?: 'check'|'continue'|'next'|'none',
 *   evidence?: Function,                // brings the referenced input/evidence into view first
 *   boardRef?: { current: Element|null },  // a long board: see the top of this file
 *   placement?: 'auto'|'after',         // round 6 (P3): 'after' keeps the panel's home after the board at every height
 *   viewKey?: any,                      // round 6 repair: a view change the learner made (a device tab): re-anchor and scroll as after an event
 *   className?: string,
 * }} props
 */
export default function HelpPanel(props) {
  const { taskKey, stepKey = null, layoutKey = stepKey, check = null, verdict: given = null, stale = false, hints = null, reveal = null,
    next = null, continueAction = null, evidence, boardRef = null, placement = 'auto', viewKey = null, className = '' } = props;
  const shown = hints ? Math.min(hints.shown, hints.texts.length) : 0;
  const revealed = Boolean(reveal?.revealed);
  const memRef = useRef(null);
  const mem = helpMemory(memRef.current, { taskKey, stepKey, stamp: given ? given.stamp ?? 0 : null, shown, revealed, done: isSuccess(given) });
  // A verdict a step change made void is not shown, not a success, not anchored.
  const verdict = given && (given.stamp ?? 0) !== mem.voidStamp ? given : null;
  const pressed = useRef(null);       // which of our buttons caused the coming event
  const rowRef = useRef(null);
  const currentRef = useRef(null);
  const focusRef = useRef(null);      // the new hint's text, the answer heading or the applied line
  const buttons = useRef({});
  const handled = useRef(mem.seq);
  const silentSeq = useRef(null);     // the event whose item focus reads (the status stays off for it)
  const anchored = useRef(false);
  const [settled, setSettled] = useState(mem.seq);
  const [long, setLong] = useState(false);
  const hintHold = useRef(false);      // the hint button's place is held (see holdHint)
  const hintWasOpen = useRef(false);
  const [container] = useState(() => (boardRef && typeof document !== 'undefined' ? document.createElement('div') : null));

  const success = isSuccess(verdict);
  const done = success || revealed;
  const total = hints?.texts.length ?? 0;
  const primary = primaryOf({ ...props, verdict });
  const current = mem.last;
  const lastHint = mem.event === 'hint' && shown >= total;
  // Focus moves into the new content: that event stays out of the status region.
  // It stays silent for that item (a later render, the clearing timer, must not re-arm it).
  const silent = (mem.event === 'reveal' && pressed.current === 'reveal') || (lastHint && pressed.current === 'hint') || (!mem.event && silentSeq.current === mem.seq);
  // A repeated check may give the same words: clear them for a moment so they are announced again.
  const clearing = current === 'verdict' && settled !== mem.seq;

  useIsoLayoutEffect(() => { memRef.current = mem; });
  useIsoLayoutEffect(() => { hintHold.current = holdHint; hintWasOpen.current = Boolean(hintOpen); });
  // A new task: nothing pressed carries over (focus there is the screen's: its first input).
  // Round 6: on a phone, where the page itself scrolls, a new task opened by «Далі» starts at the
  // page's top, as a new screen does (the screen's focus may then bring its first input into view).
  const firstTask = useRef(true);
  useIsoLayoutEffect(() => {
    if (!firstTask.current && pressed.current === 'next' && isPhoneNow()) {
      const page = document.scrollingElement;
      if (page && page.scrollTop) page.scrollTop = 0;
    }
    firstTask.current = false;
    pressed.current = null; anchored.current = false; hintHold.current = false; hintWasOpen.current = false;
  }, [taskKey]);
  useEffect(() => {
    if (settled === mem.seq) return undefined;
    const timer = setTimeout(() => setSettled(mem.seq), CLEAR_MS);
    return () => clearTimeout(timer);
  }, [mem.seq, settled]);

  // ── Placement next to a long board, and anchoring after the flagged row ──
  const scope = () => container?.closest?.('.ng-screen, .ng-standalone') ?? currentRef.current?.closest?.('.ng-screen, .ng-standalone') ?? document;
  /** The current evidence: in the board first, else on the screen; never inside the panel itself
   * (a summaryNode may carry the mark: anchoring after it would insert the panel into itself). */
  function evidenceEl() {
    const own = el => container?.contains(el) || rowRef.current?.closest?.('.ng-help')?.contains(el);
    const first = root => [...(root?.querySelectorAll?.('[data-evidence="current"]') ?? [])].find(el => !own(el)) ?? null;
    return first(boardRef?.current) ?? first(scope());
  }
  function place(where) {
    const board = boardRef?.current;
    if (!container || !board?.parentNode) return;
    let parent, before;
    if (where?.row) { parent = where.row.parentNode; before = where.row.nextSibling; }
    else if (where === 'before') { parent = board.parentNode; before = board; }
    else { parent = board.parentNode; before = board.nextSibling; }
    container.setAttribute('class', `ng-help-host${where?.row ? ' is-anchored' : ''}`);
    if (container.parentNode === parent && (container.nextSibling === before || container === before)) return;
    const active = document.activeElement;
    const hadFocus = active && container.contains(active);
    parent.insertBefore(container, before === container ? container.nextSibling : before);
    if (hadFocus && document.activeElement !== active) active.focus?.({ preventScroll: true });
  }
  /** Before the board when it is taller than half the visible band, else after it.
   * Decided once per task and layout (a new step or stage) and again only when the
   * board's width changes (like the zoom bar), never because a check added
   * content: «Перевірити» never jumps. */
  const homeMemo = useRef(null);
  const home = () => {
    const board = boardRef?.current;
    if (!board || placement === 'after') return 'after';
    const width = Math.round(board.getBoundingClientRect().width);
    const memo = homeMemo.current;
    if (memo && memo.taskKey === taskKey && memo.layoutKey === layoutKey && memo.width === width) return memo.where;
    const where = measureHome(board);
    homeMemo.current = { taskKey, layoutKey, width, where };
    return where;
  };
  const measureHome = board => {
    const b = band(scrollers(board)[0]);
    // The board's own height: without the panel, when it is anchored inside it.
    const own = board.getBoundingClientRect().height - (board.contains(container) ? container.getBoundingClientRect().height : 0);
    return own > (b.bottom - b.top) / 2 ? 'before' : 'after';
  };
  /** The flagged element's row: its list item inside the board, or itself. */
  const rowOf = el => {
    const board = boardRef?.current;
    if (!el || !board?.contains(el) || container?.contains(el)) return null;
    const li = el.closest?.('li');
    return li && board.contains(li) ? li : el;
  };
  // An edit makes the verdict stale: the screen marks the edited row as the
  // evidence and the panel anchors right after it, without scrolling (the
  // learner is looking at that row). It follows that row while it stays the
  // evidence, and returns home on «Далі» or a new task.
  const wasStale = useRef(stale);
  const latest = useRef(null);
  latest.current = { verdict, current };
  // Round 6 repair: a hint that names a row anchors as a verdict does, at 640 px and wider (under
  // 640 px its evidence is reachable above the panel). With `placement="after"` and more than one
  // marked row, nothing anchors: the deck stays whole, the panel at home, the first marked row in view.
  const anchorable = () => Boolean(latest.current.verdict) || (latest.current.current === 'hint' && !isPhoneNow());
  const manyMarked = () => placement === 'after' && isPhoneNow() && (boardRef?.current?.querySelectorAll('.is-marked').length ?? 0) > 1;
  /** Evidence above the board, outside it (a device tab in the form's head): the panel can anchor just before the board. */
  const aboveBoard = el => {
    const board = boardRef?.current;
    return Boolean(el && board && !board.contains(el) && !container?.contains(el) && (el.compareDocumentPosition(board) & 4));
  };
  useIsoLayoutEffect(() => {
    if (!container) return;
    if (stale && !wasStale.current && verdict && rowOf(evidenceEl())) anchored.current = true;
    wasStale.current = stale;
    if (anchored.current === 'before') {
      if (anchorable() && aboveBoard(evidenceEl())) { place('before'); return; }
      anchored.current = false;
    }
    const row = anchored.current && anchorable() && !manyMarked() ? rowOf(evidenceEl()) : null;
    if (!row) anchored.current = false;
    place(row ? { row } : home());
  });
  useEffect(() => () => { container?.parentNode?.removeChild(container); }, []);

  /** Anchoring (the current verdict's, or a hint's at 640 px and wider) and scrolling. */
  function settleNow() {
    const behavior = reducedMotion() ? 'auto' : 'smooth';
    if (container && latest.current.current === 'verdict' && manyMarked()) {
      place(home());
      const first = boardRef.current.querySelector('.is-marked');
      bringIntoView([first], behavior);
      return;
    }
    if (container && anchorable()) {
      const ev = evidenceEl();
      const row = rowOf(ev);
      if (row && !anchored.current) {
        place(home());
        if (!fitsTogether([rowRef.current, currentRef.current, row])) { anchored.current = true; place({ row }); }
      } else if (!row && !anchored.current && aboveBoard(ev)) {
        // Round 6 repair: evidence above the board (a device tab): the panel comes up to just before the board.
        place(home());
        if (!fitsTogether([rowRef.current, currentRef.current, ev])) { anchored.current = 'before'; place('before'); }
      }
    }
    bringPanelIntoView(rowRef.current, currentRef.current, evidenceEl(), behavior, { hint: latest.current.current === 'hint' });
  }

  // ── After an event: focus, then (after `evidence()` has committed its
  // update) anchoring and scrolling ──
  useIsoLayoutEffect(() => {
    if (!mem.event || handled.current === mem.seq) return;
    handled.current = mem.seq;
    const by = pressed.current;
    pressed.current = null;
    silentSeq.current = silent ? mem.seq : null;
    if (mem.event === 'reveal' && by === 'reveal') focusRef.current?.focus();
    else if (mem.event === 'hint' && by === 'hint' && shown >= total) focusRef.current?.focus();
    else if (by && focusLost()) buttons.current[primary]?.focus();
    const settle = settleNow;
    if (evidence) {
      evidence();
      (window.requestAnimationFrame ?? (fn => setTimeout(fn, 0)))(settle);
    } else settle();
  });

  // Round 6 repair: a view change (a device tab) settles as an event does: anchoring, then scrolling.
  const lastView = useRef(viewKey);
  useIsoLayoutEffect(() => {
    if (Object.is(lastView.current, viewKey)) return;
    lastView.current = viewKey;
    if (!current) return;
    anchored.current = false;
    settleNow();
  });

  // ── A current item is long when it is taller than 60% of the viewport or
  // than the space actually left for it: the scrolling area's visible band
  // (under the bar, less its scroll padding) less the check row and the
  // gap above the item. Measured after every render; 40 px of hysteresis,
  // so the cue can't flip it. ──
  useIsoLayoutEffect(() => {
    const el = currentRef.current;
    const height = el && current ? el.getBoundingClientRect().height : 0;
    if (!el || !current) { if (long) setLong(false); return; }
    const b = band(scrollers(el)[0]);
    const rowBox = rowRef.current?.getBoundingClientRect();
    const itemTop = el.getBoundingClientRect().top;
    const above = rowBox ? Math.max(0, itemTop - rowBox.top) : 0;   // the check row, folds and gaps above the item
    const limit = Math.min(LONG_SHARE * window.innerHeight, b.bottom - b.top - above);
    if (!long && height > limit) setLong(true);
    else if (long && height < limit - 40) setLong(false);
  });

  const press = (kind, fn) => () => { pressed.current = kind; fn(); };
  const keep = kind => el => { if (el) buttons.current[kind] = el; else delete buttons.current[kind]; };
  const variant = kind => (primary === kind ? 'primary' : 'secondary');
  const hintOpen = hints && shown < total && !done;
  // When the hint button goes (the last rung, or a hint that solved), its
  // place is held by an invisible copy until the next check (not one a hint
  // ran) or a new task, so no button slides under the pointer. One rule, every screen.
  const holdHint = !hintOpen && total > 0 && (hintHold.current || hintWasOpen.current) && !(mem.event === 'verdict' && pressed.current !== 'hint');
  const revealOpen = reveal && !revealed && !success;
  // Round 6 (Vlad lost an answer to «Далі →» beside «Перевірити»): before the task is passed or
  // revealed, «next» is a skip: a quiet link «Пропустити →» on the secondary line, after «Показати
  // відповідь», never in the check row. After a pass or a reveal (or when the screen says its own
  // round is over: `next.ready`) it is the «Далі →» button.
  const skip = Boolean(next) && !done && !next.ready;
  // With no «Перевірити» and no «Показати відповідь» (a committed card: «Наступний пакет →»), the skip
  // shares the row, after the continue button, rather than taking a line of its own.
  const skipInRow = skip && !check && !revealOpen;
  const nextWords = <>
    {next?.label ? next.label : <>{skip ? uk.help.skip : uk.nextName}<span aria-hidden="true"> →</span></>}
    {next?.destination && <span className="ng-sr-only">, {next.destination}</span>}
  </>;

  const row = (
    <div className="ng-help-row" data-help="row" ref={rowRef}>
      {check && (
        <Button ref={keep('check')} variant={variant('check')} className="ng-help-check" aria-disabled={check.disabled || undefined}
          onClick={check.disabled ? undefined : press('check', check.onCheck)}>{check.label ?? uk.check}</Button>
      )}
      {hintOpen && (
        <Button ref={keep('hint')} className="ng-help-hint-button" onClick={press('hint', hints.onMore)}>
          <span aria-hidden="true">💡 </span>{uk.hintN({ n: shown + 1, total })}
        </Button>
      )}
      {holdHint && <span className="ng-button ng-help-placeholder" aria-hidden="true">💡 {uk.hintN({ n: total, total })}</span>}
      {continueAction && (
        <Button ref={keep('continue')} variant={variant('continue')} className="ng-help-continue" onClick={press('continue', continueAction.onClick)}>{continueAction.label}</Button>
      )}
      {next && !skip && (
        <Button ref={keep('next')} variant={variant('next')} className="ng-help-next" onClick={press('next', next.onNext)}>{nextWords}</Button>
      )}
      {skipInRow && <Button ref={keep('next')} variant="quiet" className="ng-help-next is-skip" onClick={press('next', next.onNext)}>{nextWords}</Button>}
      {/* Its own line, so it never slides under the pointer when the hint button goes; a skip after it. */}
      {(revealOpen || (skip && !skipInRow)) && (
        <div className="ng-help-row-link">
          {revealOpen && <Button ref={keep('reveal')} variant="quiet" className="ng-help-reveal-link" onClick={press('reveal', reveal.onReveal)}>{reveal.label ?? uk.showAnswer}</Button>}
          {skip && !skipInRow && <Button ref={keep('next')} variant="quiet" className="ng-help-next is-skip" onClick={press('next', next.onNext)}>{nextWords}</Button>}
        </div>
      )}
    </div>
  );

  // The message area.
  const opened = hints ? hints.texts.slice(0, shown) : [];
  const currentHint = current === 'hint' ? shown - 1 : -1;
  const folded = opened.map((text, i) => ({ text, i })).filter(h => h.i !== currentHint);
  const badge = verdict?.tone === 'ok' ? `✓ ${uk.yes}` : verdict?.tone === 'no' ? `• ${uk.notYet}` : null;
  const staleMark = stale && <span className="ng-help-stale"> · {uk.help.stale}</span>;
  const said = clearing ? ' is-clearing' : '';
  let kind = '', words = null, extra = null;
  if (current === 'verdict' && verdict) {
    kind = `ng-help-verdict is-${verdict.tone}${stale ? ' is-stale' : ''}`;
    words = <p key={`v-${settled}`} className={`ng-help-summary${said}`}>{badge && <span className="ng-help-badge">{badge}</span>}{badge && ' '}{verdict.summary}{staleMark}</p>;
    extra = <>
      {verdict.summaryNode && <div className="ng-help-node">{verdict.summaryNode}</div>}
      {verdict.detail && (success && !stale
        ? <div className="ng-help-detail">{verdict.detail}</div>
        : <details key={`d-${verdict.stamp}`} className="ng-help-more"><summary>{uk.help.more}</summary><div className="ng-help-detail">{verdict.detail}</div></details>)}
    </>;
  } else if (current === 'hint' && currentHint >= 0) {
    kind = 'ng-help-hint';
    words = <p key={`h-${currentHint}`} className="ng-help-hint-text" data-help="hint" tabIndex={-1} ref={focusRef}><b>{uk.hintN({ n: currentHint + 1, total })}.</b> {opened[currentHint]}</p>;
  } else if (current === 'reveal' && reveal) {
    kind = reveal.applied ? 'ng-help-applied' : 'ng-reveal ng-help-reveal';
    words = reveal.applied
      ? <p key="applied" className="ng-help-applied-text" tabIndex={-1} ref={focusRef}>{reveal.applied}</p>
      : <><h2 key="heading" className="ng-caption ng-reveal-heading" tabIndex={-1} ref={focusRef}>{reveal.heading ?? uk.answer}</h2>{reveal.render()}</>;
  }
  // Under a hint the verdict shrinks to one line, but the evidence it showed
  // (summaryNode: the failing packet…) stays visible, outside the status region.
  const mini = current === 'hint' && verdict && !revealed && (
    <div className={`ng-help-mini-box${stale ? ' is-stale' : ''}`}>
      <p className={`ng-help-mini is-${verdict.tone}${stale ? ' is-stale' : ''}`}>{badge && <span className="ng-help-badge">{badge}</span>}{badge && ' '}{verdict.summary}{staleMark}</p>
      {verdict.summaryNode && <div className="ng-help-node">{verdict.summaryNode}</div>}
    </div>
  );
  const message = (
    <div className="ng-help-message" data-help="message">
      {folded.length > 0 && (
        <details className="ng-help-fold">
          <summary>{uk.help.hintsFolded({ n: folded.length })}</summary>
          <ol className="ng-hints-list ng-help-folded">
            {folded.map(h => <li key={h.i} data-help="hint"><b>{uk.hintN({ n: h.i + 1, total })}.</b> {h.text}</li>)}
          </ol>
        </details>
      )}
      {mini}
      <div ref={currentRef} className={`ng-help-current ${kind}`.trim()} {...(words ? { 'data-help-current': '' } : {})}
        {...(long && words ? { 'data-help-long': '' } : {})} {...(words && stale && current === 'verdict' ? { 'data-help-stale': '' } : {})}
        {...(words && current === 'verdict' ? { 'data-help-tone': verdict.tone, 'data-help-scope': verdict.scope ?? 'task' } : {})}>
        {long && words && <p className="ng-help-cue" data-help-more="">{uk.help.longCue}</p>}
        <div role="status" aria-live={silent ? 'off' : 'polite'} className="ng-help-said">{words}</div>
        {extra}
      </div>
    </div>
  );

  const panel = (
    <div className={`ng-help${className ? ` ${className}` : ''}`} data-help-panel="">
      {row}
      {message}
    </div>
  );
  return container ? createPortal(panel, container) : panel;
}
