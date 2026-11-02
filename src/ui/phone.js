// The phone layout (round 6, plan-mobile v2 P1–P5): under 640 CSS px of
// window width the page itself scrolls, the bars are one row and the
// secondary choices live in the bar's «⋯» sheet. Above it nothing changes.
//
// The switch is the window's width (a media query), not a screen's own
// width: the shell's bar spans the window. Outside a browser (server
// markup, Node tests) and where matchMedia is missing it is never a phone.
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

/** Under this many CSS px the phone layout applies (the CSS uses the same query). */
export const PHONE_WIDTH = 640;
export const PHONE_QUERY = '(max-width: 639.98px)';

function query() {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null; } catch { return null; }
}

/** Whether the phone layout applies now (no subscription). */
export function isPhoneNow() {
  return Boolean(query()?.matches);
}

function subscribe(onChange) {
  const q = query();
  if (!q) return () => {};
  if (q.addEventListener) { q.addEventListener('change', onChange); return () => q.removeEventListener('change', onChange); }
  q.addListener?.(onChange);
  return () => q.removeListener?.(onChange);
}

/** The phone layout, kept current across resizes. Server markup: false. */
export function usePhone() {
  return useSyncExternalStore(subscribe, isPhoneNow, () => false);
}

export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The element that scrolls an element's page: the screen area on a desktop, the document on a phone. */
export function scrollAreaOf(el) {
  const screen = el?.closest?.('.ng-screen, .ng-standalone') ?? null;
  // Without computed styles (a test DOM) the screen area is the scroller, as before round 6.
  const overflow = screen && typeof getComputedStyle === 'function' ? getComputedStyle(screen).overflowY ?? '' : '';
  if (screen && (!overflow || /(auto|scroll)/.test(overflow))) return screen;
  return typeof document !== 'undefined' ? document.scrollingElement ?? document.documentElement : null;
}

/** The visible height of that area (the window's on a phone). */
export function visibleHeightOf(el) {
  const area = scrollAreaOf(el);
  if (!area || typeof document === 'undefined') return 0;
  return area === document.scrollingElement || area === document.documentElement ? window.innerHeight : area.clientHeight;
}

/**
 * Keeps Tab and Shift+Tab inside `container` (a modal sheet or dialog):
 * the keydown handler to put on it. Focusable: enabled buttons, fields,
 * links and [tabindex] ≥ 0 that are rendered.
 */
export function trapTab(event, container) {
  if (event.key !== 'Tab' || !container) return;
  const els = [...container.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects?.().length);
  if (!els.length) { event.preventDefault(); return; }
  const first = els[0], last = els[els.length - 1];
  const active = container.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (active === last || !container.contains(active))) { event.preventDefault(); first.focus(); }
}

/**
 * A modal's isolation (round 6 repair, Astra): everything outside `el` is made
 * inert and hidden from assistive technology — every sibling of `el` and of
 * each of its ancestors up to <body>, except elements marked
 * `data-isolate-keep` (a backdrop that closes on a tap). Returns the undo,
 * which puts back exactly what it changed.
 */
export function isolate(el) {
  const changed = [];
  for (let node = el; node && node.parentElement && node !== document.body; node = node.parentElement) {
    for (const sibling of [...(node.parentElement.children ?? [])]) {
      if (sibling === node || sibling.inert || sibling.hasAttribute?.('data-isolate-keep') || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) continue;
      changed.push([sibling, sibling.getAttribute('aria-hidden')]);
      sibling.inert = true;
      sibling.setAttribute('aria-hidden', 'true');
    }
  }
  return () => {
    for (const [sibling, hidden] of changed.reverse()) {
      sibling.inert = false;
      if (hidden === null) sibling.removeAttribute('aria-hidden'); else sibling.setAttribute('aria-hidden', hidden);
    }
    changed.length = 0;
  };
}
