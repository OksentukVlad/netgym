// The top bar's control slot (ARCHITECTURE §6, round 2 step 7). Shell and
// Standalone provide BarSlotContext: the element in the bar that holds a
// screen's controls. A screen wraps its controls in <BarControls>, which
// renders them into that element with a portal. They stay in the screen's
// React tree, so its hooks and session work as before.
//
//   - no provider (a screen rendered on its own, as in the tests): the
//     controls render in place;
//   - a provider whose element isn't mounted yet: nothing until it is.
import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/** The bar's slot element; `undefined` outside a bar, `null` until mounted. */
export const BarSlotContext = createContext(undefined);

/** @param {{ children: any }} props */
export function BarControls({ children }) {
  const slot = useContext(BarSlotContext);
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}
