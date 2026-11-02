// In-memory navigation for the shell (ARCHITECTURE §6): a stack of routes
// `{ section, screen, params }`. Pure: no React, DOM, storage or URL.
//
// Actions:
//   { type: 'go', route }       push a section route (no-op if already there)
//   { type: 'back' }            pop one route (no-op on the start screen)
//   { type: 'home' }            back to the start screen
//   { type: 'restore', route }  popstate: the route the browser history now
//                               shows. Truncates the stack to its last copy of
//                               that route (back), or pushes it (forward).

/** @typedef {{ section: string | null, screen: string | null, params: object }} Route */
/** @typedef {{ stack: Route[] }} NavState */

/** The start screen. */
export const HOME = Object.freeze({ section: null, screen: null, params: Object.freeze({}) });

/** @returns {NavState} */
export function initialNav() {
  return { stack: [HOME] };
}

/** @param {NavState} nav @returns {Route} */
export function currentRoute(nav) {
  return nav.stack[nav.stack.length - 1];
}

/** @param {Route} route */
export function isHome(route) {
  return route.section === null;
}

/** Fills in defaults: screen `main` and empty params for a section route. */
export function toRoute({ section, screen, params } = {}) {
  if (typeof section !== 'string' || section === '') throw new TypeError('route needs a section id');
  return { section, screen: screen ?? 'main', params: params ?? {} };
}

/** Routes are equal when section, screen and (plain, serialisable) params are. */
export function sameRoute(a, b) {
  return a.section === b.section && a.screen === b.screen
    && JSON.stringify(a.params ?? {}) === JSON.stringify(b.params ?? {});
}

/** @param {NavState} nav @returns {NavState} */
export function navReducer(nav, action) {
  const { stack } = nav;
  switch (action.type) {
    case 'go': {
      const route = toRoute(action.route);
      return sameRoute(route, currentRoute(nav)) ? nav : { stack: [...stack, route] };
    }
    case 'back':
      return stack.length > 1 ? { stack: stack.slice(0, -1) } : nav;
    case 'home':
      return stack.length > 1 ? { stack: [stack[0]] } : nav;
    case 'restore': {
      const raw = action.route;
      if (!raw || typeof raw.section !== 'string' || raw.section === '') return navReducer(nav, { type: 'home' });
      const route = toRoute(raw);
      let index = stack.length - 1;
      while (index >= 0 && !sameRoute(stack[index], route)) index -= 1;
      if (index === stack.length - 1) return nav;
      return index >= 0 ? { stack: stack.slice(0, index + 1) } : { stack: [...stack, route] };
    }
    default:
      throw new Error(`unknown navigation action: ${action.type}`);
  }
}
