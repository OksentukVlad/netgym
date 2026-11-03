// «DHCP і NAT» (round 6, spec v1 with v2, v2.1): three exercises, switched in
// the top bar with the vendor (on a phone both are in the bar's «⋯» sheet):
//   - «WAN чи LAN» (E1, SidesView.jsx): which side of R1 a setting is on;
//   - «DHCP-сервер» (E2, ServerView.jsx): the range, gateway and DNS R1 gives out;
//   - «Що бачить сайт» (E3, NatView.jsx): what NAT changes, and the rule that does it.
// The logic (logic/*.js) decides every verdict; the screens render its data.
// The place `dhcp` keeps the exercise, the levels and each task's seed (a
// first task on the base addresses, later ones on renumbered ones: the
// logic's otherAddresses), so coming back restores where the learner was.
import { usePlace, usePref } from '../../../ui/useStore.js';
import { BarControls, SheetCaption } from '../../../ui/BarSlot.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import { modes, screen } from '../uk.js';
import SidesView from './SidesView.jsx';
import ServerView from './ServerView.jsx';
import NatView from './NatView.jsx';
import '../../../ui/tokens.css';
import './dhcp.css';

const EXERCISES = ['sides', 'server', 'nat'];
const SYNTAXES = ['cisco', 'routeros'];
const newSeed = () => Math.floor(Math.random() * 100000);
const fresh = () => ({ seed: newSeed(), other: false });

/** The section's first place: the first exercise, level 1 everywhere, a seed per task. */
export function firstPlace() {
  return {
    exercise: 'sides',
    sides: fresh(),
    server: { level: 1, tasks: { 1: fresh(), 2: fresh(), 3: fresh() } },
    nat: { level: 1, tasks: { 1: fresh(), 2: fresh() } },
  };
}

export default function DhcpScreen() {
  const [syntaxPref, setSyntax] = usePref('syntax');
  const [themeName] = usePref('theme');
  const [place, setPlace] = usePlace('dhcp', firstPlace);
  const syntax = SYNTAXES.includes(syntaxPref) ? syntaxPref : 'cisco';
  const vendor = syntax === 'routeros' ? 'mikrotik' : 'cisco';
  const exercise = EXERCISES.includes(place.exercise) ? place.exercise : 'sides';
  const props = { vendor, place, setPlace };
  return (
    <div className="ng-dh" data-theme={themeName} data-exercise={exercise}>
      <BarControls>
        <div className="ng-dh-controls">
          <SheetCaption label={screen.exercise} />
          <Segmented label={screen.exercise} value={exercise} onChange={id => setPlace({ exercise: id })} className="ng-dh-exercises"
            options={EXERCISES.map(id => ({ value: id, label: modes[id] }))} />
          <SheetCaption label={screen.syntax} />
          <Segmented label={screen.syntax} value={syntax} onChange={setSyntax} options={SYNTAXES.map(id => ({ value: id, label: screen.syntaxes[id] }))} />
        </div>
      </BarControls>
      {exercise === 'sides' && <SidesView {...props} />}
      {exercise === 'server' && <ServerView {...props} />}
      {exercise === 'nat' && <NatView {...props} />}
    </div>
  );
}
