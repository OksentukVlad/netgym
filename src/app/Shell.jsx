// The NetGym shell (ARCHITECTURE §6): the start screen, the top bar and
// in-memory navigation mirrored into the browser history, so the mouse back
// button works. Only multi-section targets import it; `only` targets use
// Standalone.jsx. The app store wraps everything, so a screen's session
// survives going back to the start screen. A screen gets its
// section's `bank` (the target chose it), and its area carries the theme
// preference, as does the start screen; the bar stays dark. The theme switch
// is the shell's: at the end of the bar and in the start screen's header.
// The bar is the only header: a screen puts its controls into the bar's slot
// (Bar.jsx). Screens reach other sections through NavContext (ui/useNav.js):
// `go` is the same navigation a start-screen card does, with the
// destination's params.
import { useEffect, useMemo, useRef, useState } from 'react';
import { HOME, currentRoute, initialNav, isHome, navReducer } from './nav.js';
import StoreProvider from './StoreProvider.jsx';
import Bar, { ThemeButton } from './Bar.jsx';
import { BarSlotContext } from '../ui/BarSlot.jsx';
import { NavContext } from '../ui/useNav.js';
import { usePref } from '../ui/useStore.js';
import { uk } from './uk.js';
import { webPreview } from './platform.js';
import '../ui/tokens.css';
import './shell.css';

/** @param {{ target: { id: string, title: string, prefs?: object, sections: Array<{ id: string, title: string, blurb: string, Screen: Function, bank?: object }> } }} props */
export default function Shell({ target }) {
  return (
    <StoreProvider prefs={target.prefs}>
      <ShellFrame target={target} />
    </StoreProvider>
  );
}

function ShellFrame({ target }) {
  const [theme] = usePref('theme');
  const [nav, setNav] = useState(initialNav);
  // The bar's control slot (null on the start screen, which has no bar).
  const [slot, setSlot] = useState(null);
  const navRef = useRef(nav);
  const focusPending = useRef(false);
  const homeHeading = useRef(null);
  const barHeading = useRef(null);
  const screenBox = useRef(null);

  const route = currentRoute(nav);
  const section = isHome(route) ? null : target.sections.find(s => s.id === route.section) ?? null;

  // Every navigation goes through here. `mirror` pushes the new route onto the
  // browser history; popstate-driven changes don't push.
  function apply(action, mirror) {
    const next = navReducer(navRef.current, action);
    if (next === navRef.current) return;
    navRef.current = next;
    focusPending.current = true;
    setNav(next);
    if (mirror) {
      try { history.pushState({ ng: currentRoute(next) }, ''); } catch {}
    }
  }

  useEffect(() => {
    try { history.replaceState({ ng: currentRoute(navRef.current) }, ''); } catch {}
    const onPopState = event => {
      const saved = event.state?.ng;
      const known = saved && target.sections.some(s => s.id === saved.section);
      apply({ type: 'restore', route: known ? saved : HOME }, false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // After a navigation (not on first load): the start screen's heading, or
  // the screen's own h1 (the top bar's heading if it has none).
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    let heading = barHeading.current;
    if (!section) heading = homeHeading.current;
    else heading = screenBox.current?.querySelector('h1') ?? heading;
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus();
  }, [nav]);

  const openSection = id => apply({ type: 'go', route: { section: id } }, true);
  // Links between screens: a section of this target, with its params.
  const navValue = useMemo(() => ({
    go: ({ section: id, params }) => {
      if (target.sections.some(s => s.id === id)) apply({ type: 'go', route: { section: id, params } }, true);
    },
    has: id => target.sections.some(s => s.id === id),
  }), [target]);

  return (
    <NavContext.Provider value={navValue}>
      <BarSlotContext.Provider value={slot}>
        <div className="ng-shell">
          {section ? (
            <Bar onBack={() => apply({ type: 'home' }, true)} caption={uk.appName} title={section.title} headingRef={barHeading} slotRef={setSlot} />
          ) : (
            <StartScreen sections={target.sections} theme={theme} headingRef={homeHeading} onOpen={openSection} />
          )}
          {section && (
            <div className="ng-screen" data-theme={theme} ref={screenBox}>
              <section.Screen route={route} bank={section.bank} />
            </div>
          )}
        </div>
      </BarSlotContext.Provider>
    </NavContext.Provider>
  );
}

// Round 4 (spec A7): the cards in the target's order (the IP screens first),
// «Почни тут» on the first; each card is one button, its arrow a corner mark;
// seven cards fit at 1280 × 800 and 1000 × 700 without scrolling. The web
// build adds a note above the cards and a footer link to the notices page;
// the Windows app shows neither (platform.js).
function StartScreen({ sections, theme, headingRef, onOpen }) {
  const web = webPreview();
  return (
    <div className="ng-home" data-theme={theme}>
      <header className="ng-home-header">
        <div className="ng-home-column ng-home-head">
          <h1 className="ng-home-title" tabIndex={-1} ref={headingRef}>{uk.appName}</h1>
          <ThemeButton />
        </div>
      </header>
      <main className="ng-home-column ng-home-main">
        {web && <p className="ng-home-note" role="note">{uk.webNotice}</p>}
        <h2 className="ng-caption ng-home-caption">{uk.sectionsCaption}</h2>
        <ul className="ng-cards">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button type="button" className="ng-card" onClick={() => onOpen(s.id)}>
                <span className="ng-card-head">
                  <span className="ng-card-title">{s.title}</span>
                  {i === 0 && <>{' '}<span className="ng-card-start">{uk.startHere}</span></>}
                </span>{' '}
                <span className="ng-card-blurb">{s.blurb}</span>
                <span className="ng-card-arrow" aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
      {web && (
        <footer className="ng-home-column ng-home-footer">
          <a href={uk.noticesHref}>{uk.noticesLink}</a>
        </footer>
      )}
    </div>
  );
}
