// A fact link (round 5, rule R3): a deciding fact on the card (an address,
// a port, a VLAN) that shows where it is on the diagram.
//
//   - a <button type="button"> (Enter and Space work natively), its visible
//     text the value, named «<value> — показати на схемі» (its title too);
//   - activating it calls `onActivate()`: the screen highlights the matching
//     label on its diagram (label only, ui/topology/highlight.js) and returns
//     the owner in words («192.168.88.1 — адреса R1 у LAN»), which is
//     announced politely. Before that nothing about the owner is in the DOM:
//     focus alone reveals nothing;
//   - no timer: the highlight stays until the next activation, a choice, or
//     a card or level change (the screen owns it). Activating the same fact
//     again keeps it on and says it again;
//   - in a one-column layout the screen may scroll the label into view with
//     `block: 'nearest'` (scrollToLabel); nothing else moves.
import { useState } from 'react';
import { uk } from '../uk.js';
import '../tokens.css';
import './FactLink.css';

/**
 * @param {{ value: string, onActivate: () => string|null|undefined, active?: boolean, className?: string }} props
 * `active`: its label is highlighted now (a quiet pressed look, no words).
 */
export default function FactLink({ value, onActivate, active = false, className = '' }) {
  // Each activation gets its own text node (n), so the same words are said again.
  const [said, setSaid] = useState({ text: '', n: 0 });
  function activate() {
    const text = onActivate?.() ?? '';
    setSaid(s => ({ text, n: s.n + 1 }));
  }
  return (
    <>
      <button type="button" className={`ng-fact-link${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
        aria-label={uk.fact.show({ value })} title={uk.fact.show({ value })} onClick={activate}>{value}</button>
      <span className="ng-sr-only" aria-live="polite">{said.text ? <span key={said.n}>{said.text}</span> : null}</span>
    </>
  );
}

/** Bring a highlighted label into view when the layout is one column (content < 960 px): `block: 'nearest'` only. */
export function scrollToLabel(root, oneColumn) {
  if (!oneColumn || !root) return;
  root.querySelector('[data-highlight]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}
