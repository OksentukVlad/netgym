// Navigation for screens (ARCHITECTURE §6, step 8 spec S7). The NetGym shell
// (src/app/Shell.jsx) provides NavContext; a screen reads it with useNav().
//
//   - Inside the shell: { go({ section, params }), has(section) }. `go`
//     pushes a route, as a start-screen card does (focus moves to the new
//     screen's heading); `has` says whether the target has that section.
//   - Outside a shell (a single-section build, the tests): `undefined`, like
//     BarSlotContext. A screen then renders no links to other sections.
//
// useRouteParams(route, apply) hands a route's params to the screen once per
// navigation: a link («Відкрити в калькуляторі», «Потренуватися → Маска»)
// sets the destination's place, while coming back to the same route later
// (← in the browser, or the screen remounting) keeps what the student has
// changed there since. Browser → (forward) is a new navigation: the stack was
// cut back, so the shell restores the route as a new object, and its params
// apply again (the calculator shows the link's numbers once more).
import { createContext, useContext, useEffect } from 'react';

/** @type {import('react').Context<{ go: (route: { section: string, params?: object }) => void, has: (section: string) => boolean } | undefined>} */
export const NavContext = createContext(undefined);

/** The shell's navigation, or `undefined` outside a shell. */
export function useNav() {
  return useContext(NavContext);
}

/** Route objects whose params a screen has already applied. A route object is
 * one navigation: the shell's stack keeps it until it is popped, so going
 * back to it finds it here, and a new link makes a new one. */
const applied = new WeakSet();

/** Calls `apply(params)` after the first render of a route with params, once. */
export function useRouteParams(route, apply) {
  useEffect(() => {
    if (!route || typeof route !== 'object' || applied.has(route)) return;
    const params = route.params ?? {};
    if (!Object.keys(params).length) return;
    applied.add(route);
    apply(params);
  }, [route]);
}
