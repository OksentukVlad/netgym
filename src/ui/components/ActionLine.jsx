// The action line (round 5, rule R1): one plain sentence naming the next
// action, directly above the first control of the work area. The screen
// gives the sentence and changes it with the step (level 2 of the firewall:
// the chain, then the rule). Normal text and weight, never a caption.
//
// It is not a live region: the help panel announces results. A choice group
// that this sentence introduces names itself by it (`aria-labelledby` the
// line's `id`), so the visible words and the group's name are the same.
import '../tokens.css';
import './ActionLine.css';

/**
 * @param {{ id?: string, children: any }} props
 * `id`: for the group it names (aria-labelledby).
 */
export default function ActionLine({ id, children }) {
  if (!children) return null;
  return <p id={id} className="ng-action-line" data-action-line="">{children}</p>;
}
