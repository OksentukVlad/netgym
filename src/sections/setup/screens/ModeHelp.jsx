// The Cisco decks' action line with its mode help (round 5, spec 5b-1 §3 v2;
// repair v1): one «?» right after «режим» and its punctuation (the last
// thing on the line, the full stop before it) opens a compact popover under
// the line, from its start, with the five prompts in words and «Повний
// приклад», which opens the «Режими CLI» aside (the CLI example) and moves
// there. One «?» for the deck, never one per card; the words name no card and
// no order. Without the word «режим» the «?» goes at the end, never inside a
// word.
//
// Round 5 (spec 5b-2 A): the worked example (`children`) is the action
// line's next sibling, between the line and the popover; the popover is
// placed at the line's bottom edge when it opens, so it still opens right
// under the line, over the folded example and the deck.
//
// The popover is a non-modal dialog: opening it moves focus into it; Escape
// (anywhere in it or on «?») closes it and focus returns to «?»; a press
// outside or focus leaving both closes it without moving focus.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import { ui } from '../uk.js';

/** Where the «?» goes in `sentence`: after the word «режим» and the punctuation
 * that follows it, else at the end (a whole word only: not inside «режими»). */
export function helpAt(sentence) {
  const anchor = /(?<!\p{L})режим(?!\p{L})\p{P}*/u.exec(sentence);
  return anchor ? anchor.index + anchor[0].length : sentence.length;
}

/** The five prompts in words (the popover and the aside's CLI example). */
export function ModesWords() {
  return (
    <dl className="ng-su-modes-words">
      {Object.entries(ui.modes).map(([prompt, words]) => <div key={prompt}><dt>{prompt}</dt><dd>{words}</dd></div>)}
    </dl>
  );
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * @param {{ sentence: string, onFull: () => void, children?: any }} props
 * `sentence`: the action line; `onFull`: open the full example (the aside)
 * and move focus there; `children`: what goes right under the line (the
 * worked example).
 */
export default function ModeHelp({ sentence, onFull, children = null }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const panel = useRef(null);
  const panelId = useId();
  const titleId = useId();
  const at = helpAt(sentence);

  // Under the line itself (not under the whole block): its bottom edge, before the paint.
  useIsoLayoutEffect(() => {
    const line = button.current?.closest?.('[data-action-line]');
    if (open && panel.current && line?.offsetHeight) panel.current.style.top = `${line.offsetTop + line.offsetHeight + 2}px`;
  });
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  // A resize can re-wrap the action line: close rather than leave the popover stale.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const onResize = () => setOpen(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const outside = e => {
      const t = e.target;
      if (t && !panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() { setOpen(false); button.current?.focus(); }
  function onKeyDown(e) {
    if (e.key !== 'Escape' || !open) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }
  function onBlur(e) {
    const next = e.relatedTarget;
    if (next && !panel.current?.contains(next) && !button.current?.contains(next)) setOpen(false);
  }

  return (
    <div className="ng-su-action">
      <ActionLine>
        {sentence.slice(0, at)}{' '}
        <button ref={button} type="button" className="ng-su-modes-q" aria-label={ui.modesTitle} title={ui.modesTitle}
          aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} onKeyDown={onKeyDown} onBlur={onBlur}>
          <span className="ng-su-modes-dot" aria-hidden="true">?</span>
        </button>
        {at < sentence.length && <>{' '}{sentence.slice(at).trimStart()}</>}
      </ActionLine>
      {children}
      <div ref={panel} id={panelId} role="dialog" aria-labelledby={titleId} tabIndex={-1} hidden={!open}
        className="ng-su-modes-pop" onKeyDown={onKeyDown} onBlur={onBlur}>
        {open && <>
          <p id={titleId} className="ng-su-caption">{ui.modesTitle}</p>
          <ModesWords />
          <button type="button" className="ng-su-modes-full" onClick={() => { setOpen(false); onFull(); }}>{ui.modesFull}</button>
        </>}
      </div>
    </div>
  );
}
