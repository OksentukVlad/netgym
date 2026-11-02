// «⋯» (round 4 spec A4 with its v2 rules): one quiet button per screen, at
// the end of the screen's header controls, holding the secondary actions
// (copy code, other numbers, previous code, rules, copy script).
//
// - «⋯» has aria-label «Інші дії», aria-haspopup="menu" and aria-expanded.
// - Open: focus on the first item. ↑ ↓ (wrapping), Home and End move;
//   Enter and Space activate (they are buttons); Esc and an outside click
//   close with focus back on «⋯» (a click on another control then focuses
//   that control, as the browser does); Tab closes and moves on.
// - An action item closes the menu and returns focus to «⋯».
// - A copy item keeps the menu open: its label says «✓ Скопійовано» for
//   1.5 s (no other feedback channel).
// - A disclosure item closes the menu and opens its content in the page,
//   focus on its heading (every time, also when it was open already);
//   «Закрити» there folds it and returns focus to «⋯». The content goes into
//   `disclosureHost` (a ref to an element in the work area) when given, so
//   a long «Правила» never widens the header row; without it, under «⋯».
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyText } from '../clipboard.js';
import { uk } from '../uk.js';
import '../tokens.css';
import './MoreMenu.css';

/** How long a copy item says «✓ Скопійовано». */
export const COPIED_MS = 1500;

/**
 * @param {{
 *   items: Array<
 *     { id: string, label: string, onSelect: Function }                         // an action
 *   | { id: string, label: string, copy: string | (() => string), onCopy?: Function }  // a copy
 *   | { id: string, label: string, render: Function }                           // a disclosure
 *   | null | false>,
 *   label?: string,
 *   className?: string,
 *   disclosureHost?: { current: Element|null },   // where a disclosure's content opens (the work area)
 * }} props
 */
export default function MoreMenu({ items, label = uk.moreActions, className = '', disclosureHost = null }) {
  const list = items.filter(Boolean);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(null);     // the open disclosure's id
  const [opened, setOpened] = useState(0);      // counts disclosure activations (focus its heading each time)
  const [copied, setCopied] = useState(null);   // the copy item saying «✓ Скопійовано»
  const button = useRef(null);
  const menu = useRef(null);
  const heading = useRef(null);
  const root = useRef(null);
  const focusFirst = useRef(false);
  const focusHeading = useRef(false);
  const menuId = useId();

  const itemEls = () => [...(menu.current?.querySelectorAll('[role="menuitem"]') ?? [])];
  function close(refocus = true) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }
  useEffect(() => {
    if (open && focusFirst.current) { focusFirst.current = false; itemEls()[0]?.focus(); }
  }, [open]);
  useEffect(() => {
    if (shown && focusHeading.current) { focusHeading.current = false; heading.current?.focus(); }
  }, [shown, opened]);
  // An outside click closes, focus back on «⋯» (the click's own control
  // then takes it, as the browser does after pointerdown).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (root.current?.contains(event.target)) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mousedown', onDown, true);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('mousedown', onDown, true); };
  }, [open]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  function toggle() {
    if (open) { close(); return; }
    focusFirst.current = true;
    setOpen(true);
  }
  function onButtonKey(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusFirst.current = true;
      setOpen(true);
    }
  }
  function activate(item) {
    if (item.copy !== undefined) {
      const text = typeof item.copy === 'function' ? item.copy() : item.copy;
      Promise.resolve().then(() => (item.onCopy ?? copyText)(text)).then(() => setCopied(item.id), () => {});
      return;
    }
    if (item.render) {
      focusHeading.current = true;
      setShown(item.id);
      setOpened(n => n + 1);
      close(false);
      return;
    }
    close();
    item.onSelect?.();
  }
  function onMenuKey(event) {
    const els = itemEls();
    const at = els.indexOf(document.activeElement);
    const go = i => { event.preventDefault(); els[(i + els.length) % els.length]?.focus(); };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(els.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    // Tab moves on from «⋯» (focus there first, so the browser's Tab starts from it).
    else if (event.key === 'Tab') close(true);
  }
  function fold() {
    setShown(null);
    button.current?.focus();
  }

  const disclosure = list.find(item => item.id === shown && item.render);
  const panel = disclosure && (
    <section className="ng-more-panel" aria-label={disclosure.label}>
      <div className="ng-more-panel-head">
        <h2 ref={heading} tabIndex={-1} className="ng-caption ng-more-panel-heading">{disclosure.label}</h2>
        <button type="button" className="ng-more-close" onClick={fold}>{uk.close}</button>
      </div>
      {disclosure.render()}
    </section>
  );
  return (
    <div ref={root} className={`ng-more${className ? ` ${className}` : ''}`}>
      <button ref={button} type="button" className="ng-more-button" aria-label={label} title={label} aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={toggle} onKeyDown={onButtonKey}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <ul ref={menu} id={menuId} role="menu" aria-label={label} className="ng-more-menu" onKeyDown={onMenuKey}>
          {list.map(item => (
            <li key={item.id} role="none">
              <button type="button" role="menuitem" tabIndex={-1} className="ng-more-item"
                aria-expanded={item.render ? item.id === shown : undefined} onClick={() => activate(item)}>
                {copied === item.id ? uk.copied : item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {disclosure && (disclosureHost?.current ? createPortal(panel, disclosureHost.current) : panel)}
    </div>
  );
}
