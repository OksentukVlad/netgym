// The VLAN screens' fact links (round 5, R3; spec 5a v2 C): a tapped port
// outlines its label on the diagram, label only. The screen keeps one
// highlight, for the scope it was tapped in (a round, a task and device, a
// syntax): it goes with the next tap, a choice (`clear`) or a change of
// scope. No timer. In one column (narrow) the label is brought into view
// with `block: 'nearest'`, the only movement allowed.
import { useEffect, useState } from 'react';
import { scrollToLabel } from '../../../ui/components/FactLink.jsx';

/**
 * @param {string} scope the key the highlight belongs to (another scope shows none)
 * @param {{ current: Element|null }} stageRef the diagram's stage (its labels)
 * @returns {{ highlight: object|null, onFact: (fact: object, words: string) => string, clear: () => void }}
 */
export function useFactHighlight(scope, stageRef) {
  const [held, setHeld] = useState(null);
  // Another scope drops the highlight for good (coming back shows none).
  if (held && held.scope !== scope) setHeld(null);
  const highlight = held && held.scope === scope ? held.fact : null;
  const [tap, setTap] = useState(0);
  useEffect(() => {
    if (!highlight || !tap) return;
    const stage = stageRef.current;
    scrollToLabel(stage, stage?.closest('.ng-vl')?.getAttribute('data-mode') === 'narrow');
  }, [tap]);
  return {
    highlight,
    onFact(fact, words) {
      setHeld({ scope, fact });
      setTap(n => n + 1);
      return words;
    },
    clear() { if (held) setHeld(null); },
  };
}
