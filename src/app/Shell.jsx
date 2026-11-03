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
//
// Round 6 (spec URL v2.1): where you are is kept in the URL's hash (app/url.js
// and each section's codec, the target's `url`), so a refresh, a bookmark or
// a link opens the same section, exercise, level, task and vendor; answers,
// drafts, hints and ✓ marks stay in memory only.
//   - Before the first render the hash is decoded (bootOf): the route, and
//     the section's complete places and vendor, hydrated into the store, so
//     the screen mounts on them.
//   - A link opened (a hash without our history state): the entry becomes the
//     start screen («#/») and the section is pushed after it, so Back reaches
//     the start screen. A refresh keeps its entry as it is.
//   - Section navigation pushes an entry with its hash; a place change (task,
//     level, exercise, vendor, a generated seed) replaces the current entry's
//     hash, so it adds no history.
//   - popstate (Back, Forward) and a hash typed or pasted (hashchange) are
//     applied once each: the URL's place over the remembered one (its other
//     URL-owned fields reset to defaults, other places and instances kept),
//     then the route.
//   - Each entry's state is { ng: route, depth }, `depth` its distance from the
//     start screen's entry; «← Розділи» goes back that far (history.go), so it
//     lands on the start screen without adding an entry, else (no such entry)
//     navigates home. The depth is the history's own, kept apart from the
//     route stack (a typed hash for the section on screen is one entry more,
//     though the stack doesn't grow).
//   - An entry's route keeps only the params its URL doesn't carry (a link's
//     calculator address, not a mask seed): on Back or Forward the URL's
//     place wins, and a link's seed is never applied again over it.
// Outside a browser with a URL (a server render, the mini DOM) the history is
// mirrored as before, without a URL, and «←» navigates home.
import { useEffect, useMemo, useRef, useState } from 'react';
import { HOME, currentRoute, isHome, navReducer, sameRoute } from './nav.js';
import { HOME_HASH, decodeLocation, encodeLocation, isHomeHash } from './url.js';
import { initialStore } from './store.js';
import StoreProvider from './StoreProvider.jsx';
import Bar, { ThemeButton } from './Bar.jsx';
import { BarSlotContext, SheetAreaContext } from '../ui/BarSlot.jsx';
import { NavContext } from '../ui/useNav.js';
import { usePref, useStore } from '../ui/useStore.js';
import { uk } from './uk.js';
import { webPreview } from './platform.js';
import '../ui/tokens.css';
import './shell.css';

/** A page whose history entries can carry a URL (not a server render or the mini DOM). */
const urlHistory = () => typeof location !== 'undefined' && typeof location.href === 'string'
  && typeof history !== 'undefined' && typeof history.pushState === 'function' && typeof history.replaceState === 'function';

/**
 * The first render's navigation, prefs and places, from the page's hash
 * (app/url.js): { nav, prefs, places, link }. `link` is true for a section
 * hash opened anew (no history state of ours for that section on the entry):
 * the start screen's entry is synthesized before it; a refresh keeps its entry.
 */
export function bootOf(target, loc = globalThis.location, hist = globalThis.history, random = Math.random) {
  const store = initialStore(target.prefs);
  const hash = typeof loc?.hash === 'string' ? loc.hash : '';
  const decoded = decodeLocation(target, hash, store, random);
  if (!decoded.route) return { nav: { stack: [HOME] }, prefs: target.prefs, places: {}, link: false };
  const saved = hist?.state?.ng;
  const refresh = saved?.section === decoded.route.section;
  return { nav: { stack: [HOME, decoded.route] }, prefs: { ...target.prefs, ...decoded.prefs }, places: decoded.places, link: !refresh };
}

/** @param {{ target: { id: string, title: string, prefs?: object, sections: Array<{ id: string, title: string, blurb: string, advice?: string, Screen: Function, bank?: object, url?: object }> } }} props */
export default function Shell({ target }) {
  // Read once: the hash's place is in the store before any screen mounts.
  const [boot] = useState(() => bootOf(target));
  return (
    <StoreProvider prefs={boot.prefs} places={boot.places}>
      <ShellFrame target={target} boot={boot} />
    </StoreProvider>
  );
}

function ShellFrame({ target, boot }) {
  const { state, dispatch } = useStore();
  const [theme] = usePref('theme');
  const [nav, setNav] = useState(boot.nav);
  // The bar's control slot (null on the start screen, which has no bar).
  const [slot, setSlot] = useState(null);
  // Round 6: the phone sheet's area for a screen's own choices (ui/BarSlot.jsx SheetControls).
  const [sheetArea, setSheetArea] = useState(null);
  const navRef = useRef(nav);
  const stateRef = useRef(state);
  stateRef.current = state;
  const focusPending = useRef(false);
  const homeHeading = useRef(null);
  const barHeading = useRef(null);
  const screenBox = useRef(null);
  // The URL (round 6): whether entries carry it, the history's first writes
  // done (once, StrictMode too), the last URL applied or written (popstate and
  // hashchange both arrive for one change), and «←» under way.
  const live = useRef(false);
  const booted = useRef(false);
  const lastHref = useRef(null);
  const backPending = useRef(false);
  // The current entry's distance from the start screen's entry (the history's, not the stack's).
  const depth = useRef(0);

  const route = currentRoute(nav);
  const section = isHome(route) ? null : target.sections.find(s => s.id === route.section) ?? null;
  // The current entry's hash: the route and its section's place (app/url.js).
  const hash = useMemo(() => encodeLocation(target, route, state), [target, route, state.places, state.prefs.syntax]);

  /** A route as an entry keeps it: without the params its section's URL carries
   * (they are the URL's to restore); unchanged where entries have no URL. */
  function entryRoute(r) {
    if (!live.current || isHome(r) || !r.params) return r;
    const keys = target.sections.find(s => s.id === r.section)?.url?.keys ?? [];
    return { ...r, params: Object.fromEntries(Object.entries(r.params).filter(([k]) => !keys.includes(k))) };
  }
  /** One history write; with a URL only where entries carry one. */
  function write(kind, entry, url) {
    const state = entry.ng ? { ...entry, ng: entryRoute(entry.ng) } : entry;
    try {
      if (live.current && url !== undefined) history[kind](state, '', url);
      else history[kind](state, '');
    } catch { return; }
    if (!live.current) return;
    lastHref.current = location.href;
    if (Number.isInteger(entry.depth)) depth.current = entry.depth;
  }
  /** The current entry's distance from the start screen's (0 when unknown). */
  const depthHere = () => (live.current && depth.current > 0 ? depth.current : 0);

  // Every navigation goes through here. `mirror` pushes the new route onto the
  // browser history (with its hash); popstate-driven changes don't push.
  function apply(action, mirror) {
    const next = navReducer(navRef.current, action);
    if (next === navRef.current) return;
    navRef.current = next;
    focusPending.current = true;
    setNav(next);
    if (mirror) {
      const to = currentRoute(next);
      const depth = isHome(to) ? 0 : depthHere() + 1;
      write('pushState', { ng: to, depth }, encodeLocation(target, to, stateRef.current));
    }
  }

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      live.current = urlHistory();
      const saved = live.current ? history.state?.depth : undefined;
      if (Number.isInteger(saved) && saved > 0) depth.current = saved;
      const here = currentRoute(navRef.current);
      if (!live.current) write('replaceState', { ng: here });
      else if (boot.link) {
        // A link opened: the start screen first, so Back (and «←») reaches it.
        write('replaceState', { ng: HOME, depth: 0 }, HOME_HASH);
        write('pushState', { ng: here, depth: 1 }, encodeLocation(target, here, stateRef.current));
      } else if (isHome(here)) {
        // A plain address stays plain; a hash that names no section becomes «#/».
        write('replaceState', { ng: HOME, depth: 0 }, isHomeHash(location.hash) ? undefined : HOME_HASH);
      } else {
        // A refresh: the entry keeps its depth.
        write('replaceState', { ng: here, depth: depthHere() || 1 }, encodeLocation(target, here, stateRef.current));
      }
    }
    // Back, Forward, or a hash typed or pasted: the URL's place, then its route.
    const onLocation = event => {
      backPending.current = false;
      if (!live.current) {
        if (event.type !== 'popstate') return;
        const saved = event.state?.ng;
        const known = saved && target.sections.some(s => s.id === saved.section);
        apply({ type: 'restore', route: known ? saved : HOME }, false);
        return;
      }
      if (location.href === lastHref.current) return;
      lastHref.current = location.href;
      // The entry we were on, before this one.
      const from = depth.current;
      const entryDepth = history.state?.depth;
      if (Number.isInteger(entryDepth)) depth.current = entryDepth;
      const decoded = decodeLocation(target, location.hash, stateRef.current);
      // Our entry's route keeps its params (a link's), so the stack finds it again.
      const saved = event.type === 'popstate' ? event.state?.ng : null;
      const same = saved && decoded.route && saved.section === decoded.route.section && (saved.screen ?? 'main') === decoded.route.screen;
      let to = same ? entryRoute(saved) : decoded.route ?? HOME;
      // A route still on the stack is that same navigation (its link's params applied once already).
      to = [...navRef.current.stack].reverse().find(r => sameRoute(entryRoute(r), to)) ?? to;
      if (Object.keys(decoded.places).length || Object.keys(decoded.prefs).length) dispatch({ type: 'hydrate', places: decoded.places, prefs: decoded.prefs });
      apply({ type: 'restore', route: to }, false);
      // An entry without our state (a typed hash): one entry after the one we were on.
      if (!Number.isInteger(entryDepth)) write('replaceState', { ng: to, depth: isHome(to) ? 0 : from + 1 });
    };
    window.addEventListener('popstate', onLocation);
    window.addEventListener('hashchange', onLocation);
    return () => {
      window.removeEventListener('popstate', onLocation);
      window.removeEventListener('hashchange', onLocation);
    };
  }, []);

  // A place change (or a first place stored) replaces the current entry's hash.
  useEffect(() => {
    if (!live.current) return;
    if (location.hash === hash || (isHome(route) && isHomeHash(location.hash))) return;
    write('replaceState', { ng: route, depth: isHome(route) ? 0 : depthHere() || 1 }, hash);
  }, [hash]);

  /** «← Розділи»: back to the start screen's entry where there is one, else home. */
  function back() {
    const depth = depthHere();
    if (!depth) { apply({ type: 'home' }, true); return; }
    if (backPending.current) return;
    backPending.current = true;
    history.go(-depth);
    // Should the history not move (a host that ignores it), go home after all.
    setTimeout(() => { if (backPending.current) { backPending.current = false; apply({ type: 'home' }, true); } }, 500);
  }

  // After a navigation (not on first load): the start screen's heading, or
  // the screen's own h1 (the top bar's heading if it has none).
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    // Round 6: on a phone the page itself scrolls; a new screen starts at its top, as the
    // desktop's new screen area does (no-op where the document doesn't scroll).
    const page = document.scrollingElement;
    if (page && page.scrollTop) page.scrollTop = 0;
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
        <SheetAreaContext.Provider value={sheetArea}>
        <div className="ng-shell">
          {section ? (
            <Bar onBack={back} caption={uk.appName} title={section.title} headingRef={barHeading} slotRef={setSlot} sheetRef={setSheetArea} />
          ) : (
            <StartScreen sections={target.sections} theme={theme} headingRef={homeHeading} onOpen={openSection} />
          )}
          {section && (
            <div className="ng-screen" data-theme={theme} ref={screenBox}>
              <section.Screen route={route} bank={section.bank} />
            </div>
          )}
        </div>
        </SheetAreaContext.Provider>
      </BarSlotContext.Provider>
    </NavContext.Provider>
  );
}

// Round 4 (spec A7): the cards in the target's order (the IP screens first),
// «Почни тут» on the first; each card is one button, its arrow a corner mark;
// seven cards fit at 1280 × 800 and 1000 × 700 without scrolling. Round 5
// 5b-2 (spec G): a section's `advice` («радимо спершу: …») is a quiet last
// line of its card, part of the button's name; nothing is locked. The web
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
                {s.advice && <>{' '}<span className="ng-card-advice">{s.advice}</span></>}
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
