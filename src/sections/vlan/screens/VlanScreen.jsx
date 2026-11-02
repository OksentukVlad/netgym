// The VLAN section (VLAN-1 spec §4): four exercises under one heading,
// «Куди дійде кадр» (PredictView.jsx), «Налаштуй порти» (PortsView.jsx),
// «Між VLAN» (RouteView.jsx, VLAN-2) and «Знайди несправність»
// (FaultsView.jsx, VLAN-3), switched by the segmented control beside the
// heading. The bar's switch picks Cisco or MikroTik, the same preference as
// routing's: the prediction and the fault-finding open that vendor's own
// instance; the ports and «Між VLAN» keep a form per syntax.
// There is no score: the section is calm (no counts, streaks or confetti).
//
// The bank comes from the target: { predict: record, ports: records,
// route: records, faults: records } (without `route` or `faults`, that
// exercise isn't offered). The place (`vlan`) keeps the exercise, the
// prediction's shape and its instance per shape and vendor, the ports task
// and each task's seed, the route task and each of its seeds, and the
// fault-finding's instance per vendor (seed, level, network); first seeds
// are random, chosen among those the logic can build (a route seed in every
// syntax its task offers).
//
// Layout by the screen's own width (vlan.css). Round 4 (spec A2): the page
// is the one vertical scroller.
//   - desk and wide (≥ 960): the heading, the intro and the diagram on the
//     left, sticky, one screen high; the work column on the right at its
//     natural height: the choices or the form, the help panel (HelpPanel)
//     right after what it checks, then the walk in words;
//   - narrow (< 960): one column, the diagram first (as in routing), then
//     the work; nothing sticky.
// Each exercise renders its own `.ng-vl-side` (heading, intro, diagram) and
// `.ng-vl-work`; first-visit notes are Asides (screen `vlan`), and the
// secondary actions are in one «⋯» at the end of the heading's row.
import { useEffect, useRef, useState } from 'react';
import predict from '../logic/predict.js';
import ports from '../logic/ports.js';
import route from '../logic/route.js';
import { usePlace, usePref } from '../../../ui/useStore.js';
import { BarControls } from '../../../ui/BarSlot.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import PredictView from './PredictView.jsx';
import PortsView from './PortsView.jsx';
import RouteView from './RouteView.jsx';
import FaultsView, { pickSlot } from './FaultsView.jsx';
import { SHAPES, slotKey, validSeed } from './predictState.js';
import { SHORT_SCREEN, isShort } from './panel.jsx';
import { ui } from '../uk.js';
import '../../../ui/tokens.css';
import './vlan.css';

export const SYNTAXES = ['cisco', 'routeros'];

/** The layout mode for a content width (the thresholds in vlan.css). */
export const modeFor = width => (width >= 1440 ? 'wide' : width >= 960 ? 'desk' : 'narrow');

/** The mode, and the sticky left column's measures: at least one screen
 * high (--ng-vl-screen); taller (an open aside, a narrow window), it scrolls
 * with the page until its end is in view, then stays (--ng-vl-top). The
 * column is each exercise's own, so it is looked up on every measure. */
function useMode(ref) {
  const [mode, setMode] = useState(() => modeFor(typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const screen = el.closest('.ng-screen, .ng-standalone');
    let side = null;
    const measure = () => {
      setMode(modeFor(el.clientWidth));
      if (!screen) return;
      if (screen.clientHeight > 0) setHeight(screen.clientHeight);
      el.style.setProperty('--ng-vl-screen', `${screen.clientHeight}px`);
      const now = el.querySelector('.ng-vl-side');
      if (now && now !== side) { if (side) observer.unobserve?.(side); side = now; observer.observe(side); }
      if (side) el.style.setProperty('--ng-vl-top', `${Math.min(6, screen.clientHeight - side.offsetHeight - 6)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (screen) observer.observe(screen);
    return () => observer.disconnect();
  }, []);
  return { mode, height, short: isShort(height) };
}

/** Round 5: a short screen area (a 1000 × 700 window; 1280 × 800 is not):
 * the intro asides that would push the drawing off the first view start folded. */
export { SHORT_SCREEN, isShort };

const can = fn => { try { fn(); return true; } catch { return false; } };

/** The place's first value: random seeds the logic can build, every shape at level 0. */
export function firstPlace(bank, random = Math.random) {
  const predictSlots = {};
  for (const shape of SHAPES) for (const vendor of SYNTAXES) {
    const seed = validSeed(s => can(() => predict.create(bank.predict, { variantId: shape, seed: s, vendor, surprises: 0 })), undefined, random);
    predictSlots[slotKey(shape, vendor)] = { seed, level: 0 };
  }
  const portsSeeds = Object.fromEntries(bank.ports.map(r => [r.id,
    validSeed(s => SYNTAXES.every(syntax => can(() => ports.create(r, { variantId: r.variants[0].id, seed: s, syntax }))), undefined, random)]));
  const routeRecords = bank.route ?? [];
  const routeSeeds = Object.fromEntries(routeRecords.map(r => [r.id,
    validSeed(s => r.variants[0].syntaxes.every(syntax => can(() => route.create(r, { variantId: 'main', seed: s, syntax }))), undefined, random)]));
  const faultRecords = bank.faults ?? [];
  const faultSlots = faultRecords.length ? Object.fromEntries(SYNTAXES.map(vendor => [vendor, pickSlot(faultRecords[0], vendor, 1, { random })])) : null;
  return {
    exercise: 'predict', shape: SHAPES[0], predict: predictSlots, portsTask: bank.ports[0].id, portsSeeds,
    ...(routeRecords.length ? { routeTask: routeRecords[0].id, routeSeeds } : {}),
    ...(faultSlots ? { faults: faultSlots } : {}),
  };
}

/** @param {{ bank: { predict: object, ports: object[], route?: object[], faults?: object[] } }} props */
export default function VlanScreen({ bank }) {
  const [syntaxPref, setSyntax] = usePref('syntax');
  const [themeName] = usePref('theme');
  const [place, setPlace] = usePlace('vlan', () => firstPlace(bank));
  const syntax = SYNTAXES.includes(syntaxPref) ? syntaxPref : 'cisco';
  const root = useRef(null);
  const { mode: layout, height, short } = useMode(root);
  // A walk under way ends at once on any press (VLAN-anim Y7), and the press
  // still happens: the exercise on screen puts its skip here while it plays.
  const skipper = useRef(null);
  const skip = () => skipper.current?.();
  const exercises = ['predict', 'ports', ...(bank.route?.length ? ['route'] : []), ...(bank.faults?.length ? ['faults'] : [])];
  const exercise = exercises.includes(place.exercise) ? place.exercise : 'predict';

  const head = <>
    <h1 className="ng-vl-h1">{ui.heading}</h1>
    <Segmented label={ui.exercise} value={exercise} onChange={id => setPlace({ exercise: id })} className="ng-vl-exercises"
      options={exercises.map(id => ({ value: id, label: ui.exercises[id] }))} />
  </>;

  return (
    <div ref={root} className="ng-vl" data-theme={themeName} data-mode={layout} data-exercise={exercise}
      onPointerDownCapture={skip} onKeyDownCapture={skip}>
      <BarControls>
        <div className="ng-vl-controls">
          <Segmented label={ui.syntax} value={syntax} onChange={setSyntax} options={SYNTAXES.map(id => ({ value: id, label: ui.syntaxes[id] }))} />
        </div>
      </BarControls>
      {exercise === 'predict' && <PredictView record={bank.predict} syntax={syntax} place={place} setPlace={setPlace} head={head} skipper={skipper} short={short} />}
      {exercise === 'ports' && <PortsView records={bank.ports} syntax={syntax} place={place} setPlace={setPlace} head={head} skipper={skipper} />}
      {exercise === 'route' && <RouteView records={bank.route} syntax={syntax} place={place} setPlace={setPlace} head={head} skipper={skipper} short={short} height={height} />}
      {exercise === 'faults' && <FaultsView records={bank.faults} syntax={syntax} place={place} setPlace={setPlace} head={head} skipper={skipper} short={short} />}
    </div>
  );
}
