// A button with a 44 px target and a visible focus ring.
// variant: 'secondary' (default), 'primary' (the screen's main action) or 'quiet'.
import { forwardRef } from 'react';
import '../tokens.css';
import './Button.css';

/** @param {{ variant?: 'primary'|'secondary'|'quiet', className?: string } & Record<string, any>} props */
function Button({ variant = 'secondary', className = '', type = 'button', ...rest }, ref) {
  const classes = ['ng-button', variant !== 'secondary' && `ng-button-${variant}`, className].filter(Boolean).join(' ');
  return <button ref={ref} type={type} className={classes} {...rest} />;
}

export default forwardRef(Button);
