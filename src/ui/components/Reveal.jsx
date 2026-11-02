// «Показати відповідь»: the only way the reference solution reaches the page
// (ARCHITECTURE §6). `children` is a function, called only once revealed, so
// the answer is not in the DOM before the button is pressed.
import { useEffect, useRef } from 'react';
import Button from './Button.jsx';
import { uk } from '../uk.js';
import '../tokens.css';
import './Reveal.css';

/**
 * @param {{
 *   revealed: boolean,
 *   onReveal: () => void,
 *   children: () => any,
 *   label?: string,
 *   heading?: string,
 *   disabled?: boolean,     // hide the button (the task is solved), keep any shown answer
 * }} props
 */
export default function Reveal({ revealed, onReveal, children, label = uk.showAnswer, heading = uk.answer, disabled = false }) {
  // The pressed button disappears; keyboard focus moves to the answer.
  const pressed = useRef(false);
  const headingRef = useRef(null);
  useEffect(() => {
    if (revealed && pressed.current) {
      pressed.current = false;
      headingRef.current?.focus();
    }
  }, [revealed]);

  if (revealed) {
    return (
      <section className="ng-reveal" aria-label={heading}>
        <h2 className="ng-caption ng-reveal-heading" tabIndex={-1} ref={headingRef}>{heading}</h2>
        {children()}
      </section>
    );
  }
  if (disabled) return null;
  return <Button variant="quiet" onClick={() => { pressed.current = true; onReveal(); }}>{label}</Button>;
}
