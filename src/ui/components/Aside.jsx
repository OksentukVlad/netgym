// First-visit chrome (round 4 spec A8): a note shown open on the first visit
// to a screen in this app run, folded behind a small «?» once the learner has
// started (the first check or «Далі» on that screen). «?» opens and folds it
// again, and that choice holds across navigation in this app run.
//
// Only chrome the current decision doesn't depend on goes here: keyboard
// lines, «Правильних порядків кілька», convention footnotes, model notes,
// legends. A given fact, a requirement or an assumption the decision needs
// stays visible on the screen (specs R, F, S name each screen's asides).
//
// State, in the store's places: `places[screen].asides[id]` is the
// learner's explicit choice (true open, false folded); `places[screen].started`
// is set by useAsideFold's `fold()` on the first check or «Далі». Open =
// the explicit choice, else not started (round 6: and not a phone, where
// every aside starts folded).
//
// <Aside screen="ip.mask" id="block" title="Як знайти блок">…</Aside> renders
// «?» and, when open, the note under it. For a «?» in a header and the note
// elsewhere, use useAside() and render AsideButton and the note yourself.
import { useId } from 'react';
import { useStore } from '../useStore.js';
import { usePhone } from '../phone.js';
import '../tokens.css';
import './Aside.css';

/** The aside's state and its toggle. */
export function useAside(screen, id) {
  const { state, dispatch } = useStore();
  // Round 6 (the phone layer, P2): under 640 px every aside starts folded, so
  // the task, the picture and the first control come first; «?» opens it.
  const phone = usePhone();
  const place = state.places[screen] ?? {};
  const choice = place.asides?.[id];
  const open = typeof choice === 'boolean' ? choice : !place.started && !phone;
  const toggle = () => dispatch({ type: 'place', scope: screen, patch: { asides: { ...(state.places[screen]?.asides ?? {}), [id]: !open } } });
  return { open, toggle };
}

/** `fold()`: the learner has started on this screen (the first check or «Далі»); asides fold. */
export function useAsideFold(screen) {
  const { state, dispatch } = useStore();
  return () => { if (!state.places[screen]?.started) dispatch({ type: 'place', scope: screen, patch: { started: true } }); };
}

/** «?»: a small toggle named by the aside's title; folded, the title shows
 * beside it (muted), so a lone «?» never hides what it holds. */
export function AsideButton({ title, open, onToggle, controls }) {
  return (
    <button type="button" className="ng-aside-q" aria-label={title} title={title} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <span className="ng-aside-dot" aria-hidden="true">?</span>
      {!open && <span className="ng-aside-label" aria-hidden="true">{title}</span>}
    </button>
  );
}

/**
 * @param {{ screen: string, id: string, title: string, children: any, className?: string }} props
 */
export default function Aside({ screen, id, title, children, className = '' }) {
  const { open, toggle } = useAside(screen, id);
  const bodyId = useId();
  return (
    <div className={`ng-aside${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <AsideButton title={title} open={open} onToggle={toggle} controls={bodyId} />
      {open && (
        <div id={bodyId} className="ng-aside-body">
          <p className="ng-aside-title">{title}</p>
          {children}
        </div>
      )}
    </div>
  );
}
