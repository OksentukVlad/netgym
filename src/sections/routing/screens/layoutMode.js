// The routing section's layout mode by its screen's own width (routing.css):
// wide ≥ 1440, desk 960–1439 (the class PCs), narrow < 960. Shared by the
// task screen (RoutingScreen.jsx) and «Знайди несправність» (FaultsView.jsx).
import { useEffect, useState } from 'react';

/** The layout mode for a content width (the thresholds in routing.css). */
export const modeFor = width => (width >= 1440 ? 'wide' : width >= 960 ? 'desk' : 'narrow');

/** The screen's own width, as a layout mode. */
export function useLayoutMode(ref) {
  const [mode, setMode] = useState(() => modeFor(typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setMode(modeFor(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return mode;
}

/**
 * Round 4 (spec A2): the page is the only scroller. In two columns the
 * diagram's column sticks (routing.css) and is as tall as the screen's
 * visible height below where the columns start, so the whole diagram is in
 * view at the top of the page and stays in view while the work column
 * scrolls with the page. This sets `--ng-rt-stage-h` (px) on `colsRef`.
 */
export function useStageHeight(colsRef, mode) {
  useEffect(() => {
    const cols = colsRef.current;
    if (!cols || typeof window === 'undefined') return undefined;
    const screen = cols.closest('.ng-screen, .ng-standalone') ?? document.scrollingElement;
    const measure = () => {
      if (mode === 'narrow') { cols.style.removeProperty('--ng-rt-stage-h'); return; }
      const top = cols.getBoundingClientRect().top - (screen?.getBoundingClientRect?.().top ?? 0) + (screen?.scrollTop ?? 0);
      const visible = screen?.clientHeight || window.innerHeight;
      cols.style.setProperty('--ng-rt-stage-h', `${Math.max(Math.min(480, visible - 12), Math.round(visible - top - 12))}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    if (screen?.nodeType === 1) observer.observe(screen);
    observer.observe(cols.parentElement ?? cols);
    return () => observer.disconnect();
  }, [mode]);
}
