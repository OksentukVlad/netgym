// A purpose line (round 5, rule R2): beside a native term the learner acts
// on (a command, a rule, a mode, a state, a chain), a short Ukrainian
// purpose, always visible: no hover, no selection needed.
//
// Contract (spec 5a §2B and v2 B):
//   - the row carrying the term is marked `data-term`; its purpose is this
//     element (`data-purpose`), non-empty;
//   - a row with chips (conditions) puts the purpose on a second line under
//     the term (`stacked`); a bare term takes it inline, after the term;
//   - one line at a 420 px panel: at most PURPOSE_MAX characters (tested per
//     string), at least 12 px, in the normal text colour (never the muted
//     caption colour);
//   - segmented options (VLAN modes) use the label pattern «доступ (access)»
//     instead of a purpose line.
import '../tokens.css';
import './Purpose.css';

/** The longest purpose that stays one line at a 420 px panel (12–14 px sans). */
export const PURPOSE_MAX = 48;

/** Purposes longer than PURPOSE_MAX (a check for each string set's tests). */
export const tooLong = texts => texts.filter(text => typeof text !== 'string' || !text.trim() || text.length > PURPOSE_MAX);

/**
 * @param {{ children: string, stacked?: boolean, className?: string }} props
 */
export default function Purpose({ children, stacked = false, className = '' }) {
  return <span className={`ng-purpose${stacked ? ' is-stacked' : ''}${className ? ` ${className}` : ''}`} data-purpose="">{children}</span>;
}
