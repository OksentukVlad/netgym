// The top bar, the screen's only header (ARCHITECTURE §6, round 2 step 7):
// «← Розділи» (in NetGym), the title, the slot where the open screen puts
// its controls, and the theme switch at the far right. The owner (Shell or
// Standalone) keeps the slot element in state and provides it as
// BarSlotContext around the bar and the screens, so a screen's tree never
// moves when the bar comes and goes. The bar is always dark, so whatever
// goes into the slot uses the dark tokens.
import Button from '../ui/components/Button.jsx';
import { usePref } from '../ui/useStore.js';
import { uk } from './uk.js';
import '../ui/tokens.css';
import './bar.css';

/**
 * @param {{
 *   onBack?: () => void,     // «← Розділи»; absent in single-section builds
 *   caption?: string,        // «NetGym» before the section title
 *   title: string,
 *   headingRef?: object,     // the shell focuses the heading after navigation
 *   slotRef: (el: HTMLElement|null) => void,
 * }} props
 */
export default function Bar({ onBack, caption, title, headingRef, slotRef }) {
  return (
    <nav className="ng-bar" aria-label={uk.appName}>
      {onBack && <Button onClick={onBack}>{uk.backToSections}</Button>}
      <h2 className="ng-bar-title" tabIndex={-1} ref={headingRef}>
        {caption && <><span className="ng-caption">{caption}</span>{' '}</>}
        <span className="ng-bar-section">{title}</span>
      </h2>
      <div className="ng-bar-end">
        <div className="ng-bar-slot" ref={slotRef} />
        <ThemeButton />
      </div>
    </nav>
  );
}

/**
 * The light/dark switch. The theme is an app-wide preference, so the shell
 * owns the one button: in the bar on every section screen, and on the start
 * screen (Shell.jsx). Its label names what pressing it does.
 */
export function ThemeButton() {
  const [theme, setTheme] = usePref('theme');
  const isDark = theme !== 'light';
  return (
    <button type="button" className="ng-theme-switch" onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? uk.theme.light : uk.theme.dark}>{isDark ? '☀️' : '🌙'}</button>
  );
}
