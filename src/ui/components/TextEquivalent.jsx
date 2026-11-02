// A diagram's text equivalent (ARCHITECTURE §6): a real button, «Текстом»,
// that opens the description over the diagram it stands for (step 7 fix: an
// Overlay, so the frame keeps its size). The description comes from the
// caller as sections of lines (for a network, topology/describe.js), so it
// says what the diagram shows, in words.
//
// Two parts, because they live in different places: TextEquivalentButton in
// the caller's row of buttons, and TextEquivalent (the panel) wherever the
// caller lays its overlays. Closing returns focus to the button (the caller
// passes the button's ref back to it).
import Overlay from './Overlay.jsx';
import '../tokens.css';
import './TextEquivalent.css';

/**
 * @param {{ id: string, label: string, open: boolean, onToggle: () => void, buttonRef?: object, variant?: 'link'|'button' }} props
 * `id`: the panel's id. `variant`: round 4 (spec A3) makes «Текстом» a small
 * text link in the same place by default; 'button' keeps the old look.
 */
export function TextEquivalentButton({ id, label, open, onToggle, buttonRef, variant = 'link' }) {
  return (
    <button ref={buttonRef} type="button" className={`ng-te-button${variant === 'link' ? ' is-link' : ''}`} aria-expanded={open} aria-controls={id} onClick={onToggle}>
      {label} <span aria-hidden="true">{open ? '▲' : '▼'}</span>
    </button>
  );
}

/**
 * @param {{
 *   id: string,                                     // the panel's id
 *   title: string,                                  // the panel's heading and accessible name
 *   sections: Array<{ heading: string, items: string[] }>,
 *   open: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function TextEquivalent({ id, title, sections, open, onClose }) {
  return (
    <Overlay id={id} title={title} open={open} onClose={onClose} className="ng-te-panel">
      {sections.map(section => (
        <div key={section.heading} className="ng-te-section">
          <h4 className="ng-te-heading">{section.heading}</h4>
          <ul className="ng-te-list">
            {section.items.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ))}
    </Overlay>
  );
}
