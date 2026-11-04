// «Перевірка мережі» (round 7, spec v1 with v2, v2.1): three exercises,
// switched in the top bar with the vendor (on a phone both are in the bar's
// «⋯» sheet), in the learner's order:
//   - «Що це доводить» (C3, ProofView.jsx): which check proves a requirement,
//     and what it must show (the default and the card's first view);
//   - «Де зламалось» (C1, LadderView.jsx): check from the nearest point and
//     stop at the first unexpected result;
//   - «Прочитай вивід» (C2, ClaimsView.jsx): which lines bear on a claim, and
//     what they prove.
// The logic (logic/*.js) decides every output and verdict; the screens render
// its data. The place `checks` keeps the exercise and each task's seed (and
// the levels of C1 and C2). A link from another section («як це перевіряють
// на ПК →») opens an exercise by its route params (`ex`), once per navigation.
import { useEffect, useRef } from 'react';
import { scrollAreaOf } from '../../../ui/phone.js';
import { usePlace, usePref } from '../../../ui/useStore.js';
import { useRouteParams } from '../../../ui/useNav.js';
import { BarControls, SheetCaption } from '../../../ui/BarSlot.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import { modes, screen } from '../uk.js';
import ProofView from './ProofView.jsx';
import LadderView from './LadderView.jsx';
import ClaimsView from './ClaimsView.jsx';
import { newSeed } from './seeds.js';
import '../../../ui/tokens.css';
import './checks.css';

export const EXERCISES = ['proof', 'ladder', 'claims'];
const SYNTAXES = ['cisco', 'routeros'];

/** The section's first place: C3 first, level 1 for C1 and C2, a seed per task. */
export function firstPlace(random = Math.random) {
  return {
    exercise: 'proof',
    proof: { seed: newSeed(random) },
    ladder: { level: 1, tasks: { 1: { seed: newSeed(random) }, 2: { seed: newSeed(random) } } },
    claims: { level: 1, tasks: { 1: { seed: newSeed(random) }, 2: { seed: newSeed(random) } } },
  };
}

/** @param {{ route?: { params?: object } | null }} props */
export default function ChecksScreen({ route = null }) {
  const [syntaxPref, setSyntax] = usePref('syntax');
  const [themeName] = usePref('theme');
  const [place, setPlace] = usePlace('checks', firstPlace);
  // A link from another section names the exercise (`ex`): applied once per navigation.
  useRouteParams(route, params => {
    if (!EXERCISES.includes(params.ex)) return;
    // A setup deck: its own vendor, and only what it configured.
    if (SYNTAXES.includes(params.syntax)) setSyntax(params.syntax);
    setPlace({ exercise: params.ex, ...(params.ex === 'proof' ? { proof: { seed: place.proof?.seed ?? newSeed(), ...(params.scope ? { scope: params.scope } : {}) } } : {}) });
  });
  const syntax = SYNTAXES.includes(syntaxPref) ? syntaxPref : 'cisco';
  const vendor = syntax === 'routeros' ? 'mikrotik' : 'cisco';
  const exercise = EXERCISES.includes(place.exercise) ? place.exercise : 'proof';
  const sectionRef = useRef(null);
  const current = place[exercise];
  const navigationKey = `${exercise}:${current?.level ?? ''}:${JSON.stringify(current?.tasks?.[current?.level] ?? current)}`;
  const previous = useRef(navigationKey);
  useEffect(() => {
    if (previous.current !== navigationKey) {
      const area = scrollAreaOf(sectionRef.current);
      if (area) area.scrollTop = 0;
      previous.current = navigationKey;
    }
  }, [navigationKey]);
  const props = { vendor, place, setPlace };
  return (
    <div ref={sectionRef} className="ng-ck" data-theme={themeName} data-exercise={exercise}>
      <BarControls>
        <div className="ng-ck-controls">
          <SheetCaption label={screen.exercise} />
          <Segmented label={screen.exercise} value={exercise} onChange={id => setPlace({ exercise: id })} className="ng-ck-exercises"
            options={EXERCISES.map(id => ({ value: id, label: modes[id] }))} />
          <SheetCaption label={screen.syntax} />
          <Segmented label={screen.syntax} value={syntax} onChange={setSyntax} options={SYNTAXES.map(id => ({ value: id, label: screen.syntaxes[id] }))} />
        </div>
      </BarControls>
      {exercise === 'proof' && <ProofView {...props} />}
      {exercise === 'ladder' && <LadderView {...props} />}
      {exercise === 'claims' && <ClaimsView {...props} />}
    </div>
  );
}
