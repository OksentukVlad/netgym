// A single-section build of a new screen (for example routing.exe): the store
// and one screen-high scrolling area, as under the NetGym bar, without the
// shell.
// The area carries the theme preference, so every screen in it follows it.
// With a `title` (routing.exe: «NetGym: маршрутизація») the build has the
// top bar too, with the theme switch, and the screen puts its controls into
// the bar's slot. Without one there is no theme switch.
import { useState } from 'react';
import StoreProvider from './StoreProvider.jsx';
import Bar from './Bar.jsx';
import { BarSlotContext, SheetAreaContext } from '../ui/BarSlot.jsx';
import { usePref } from '../ui/useStore.js';
import '../ui/tokens.css';

/** @param {{ section: { Screen: Function, bank?: object }, prefs?: object, title?: string }} props */
export default function Standalone({ section, prefs, title }) {
  return (
    <StoreProvider prefs={prefs}>
      {title ? <WithBar section={section} title={title} /> : <StandaloneArea section={section} />}
    </StoreProvider>
  );
}

function StandaloneArea({ section }) {
  const [theme] = usePref('theme');
  return (
    <div className="ng-standalone" data-theme={theme}>
      <section.Screen route={null} bank={section.bank} />
    </div>
  );
}

function WithBar({ section, title }) {
  const [slot, setSlot] = useState(null);
  const [sheetArea, setSheetArea] = useState(null);
  return (
    <BarSlotContext.Provider value={slot}>
      <SheetAreaContext.Provider value={sheetArea}>
        <div className="ng-standalone-frame">
          <Bar title={title} slotRef={setSlot} sheetRef={setSheetArea} />
          <StandaloneArea section={section} />
        </div>
      </SheetAreaContext.Provider>
    </BarSlotContext.Provider>
  );
}
