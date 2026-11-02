// The screen's only role="status": the result of the last check, in words
// plus an icon. It is always rendered (empty until there is something to
// say), so screen readers announce what appears in it.
//
// A repeated check can produce the same words, and an unchanged live region
// is not announced. So a new `stamp` (one per check) first clears the
// message for a moment, then puts it back as new text. While cleared, the
// words keep their place on screen (hidden, not removed), so nothing jumps.
import { useEffect, useState } from 'react';
import { uk } from '../uk.js';
import '../tokens.css';
import './Feedback.css';

/** How long the message stays cleared before it is announced again. */
export const CLEAR_MS = 150;

/**
 * @param {{
 *   tone?: 'ok'|'no'|'info'|null,   // ✓ Так, • Ще ні (amber, not red), or plain text
 *   children?: any,                  // the explanation
 *   actions?: any,                   // buttons under the text («Ще одна»…)
 *   hidden?: boolean,                // announce only (the round 1 routing rows show their own text)
 *   stamp?: any,                     // changes with every check, so the same words are announced again
 * }} props
 */
export default function Feedback({ tone = null, children = null, actions = null, hidden = false, stamp }) {
  const [settled, setSettled] = useState(stamp);
  const clearing = stamp !== settled;
  useEffect(() => {
    if (!clearing) return undefined;
    const timer = setTimeout(() => setSettled(stamp), CLEAR_MS);
    return () => clearTimeout(timer);
  }, [stamp, clearing]);

  const empty = !tone && !children;
  const badge = tone === 'ok' ? `✓ ${uk.yes}` : tone === 'no' ? `• ${uk.notYet}` : null;
  // A new key once settled: the words are inserted again, not just shown.
  const words = clearing ? ' is-clearing' : '';
  return (
    <div role="status" aria-live="polite" className={`ng-feedback${empty ? ' is-empty' : ''}${tone ? ` is-${tone}` : ''}${hidden ? ' ng-sr-only' : ''}`}>
      {badge && <span key={`badge-${settled}`} className={`ng-feedback-badge${words}`}>{badge}</span>}
      {children && <div key={`text-${settled}`} className={`ng-feedback-text${words}`}>{children}</div>}
      {actions && <div className="ng-feedback-actions">{actions}</div>}
    </div>
  );
}
