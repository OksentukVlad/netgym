// The routing screen: one screen for both syntaxes, ported from the round 1
// Cisco trainer (apps/cisco-routing/App.jsx, retired; tag round1) in its look, both themes. Tasks
// come from the bank the target chose (the `bank` prop: { bankId,
// bankRevision, tasks }); the diagram from the bank's network through
// logic/topology.js and the shared geometry.js; checking from check() by
// simulated pings, shown through presentCheck (round 2 step 6); the session
// (answers, results, hints, reveal) from useExercise and the app store.
//
// The bar's switch picks Cisco or MikroTik. The syntax is a presentation
// setting: switching keeps the task, the variant, the router, the answers,
// and the marks. The mode switch («Із готовими рядками» / «Без готових рядків»)
// is a global preference too, so it sits beside it in the top bar. Tasks 3
// and 8 get a variant switch on the task bar.
//
// Layout by the screen's own width (round 2 step 7, routing.css):
//   - wide (≥ 1440): task list | diagram | work panel;
//   - desk (960–1439, the class PCs): the task list is a drawer; a task bar,
//     then the diagram's column (round 5: the description, the legend and
//     the diagram) beside the work panel; the page scrolls and the diagram's
//     column sticks (round 4, spec A2);
//   - narrow (< 960): one column, diagram first; the page scrolls.
// The syntax and mode switches go into the top bar's slot
// (the bar adds the theme switch after them).
//
// Round 4 (spec R1 with its v2 overrides): one check. The help panel
// (HelpPanel) sits under the selected router's rows: «Перевірити» runs the
// network check (Enter in any field does too), and the panel holds its
// verdict (the first failure in words, or the success box), the hint ladder
// (from the current rows), «Показати відповідь» and «Далі →». A guided row is
// checked when a field the learner touched loses focus (RouteRows.jsx); its
// marks stay on its fields. A router is always selected (the first one at
// first); a failing check selects the router the fix belongs on and marks
// what the verdict is about there (data-evidence: a marked row, else the
// first empty one, else the rows' heading); after an edit, the edited row.
// The reveal is applied to the rows: the selected router's reference
// commands take their place («показано»), «Моя відповідь» switches back;
// the diagram keeps the last check's path. The success box's detail holds
// the advice and tips, the demonstrations, «Показати ще раз» and the quiet
// links «Показати мовою MikroTik/Cisco» and «Показати найкоротший варіант».
// The secondary actions are in «⋯» (MoreMenu, at the end of the task bar):
// copy the code, other or base or previous addresses, «Правила» and «Усі
// перевірки» (both open in the work area, under the panel). The diagram's
// legend is an Aside («Як читати схему»), open until the first check or
// «Далі»; round 5 (R4): it reads this instance's own values (legendFacts:
// its first LAN, a link with both ends and their owners, the ISP's own
// gateway). Only «Текстом» opens over the diagram (checkView.js). Round 5
// (R1): the action line names the first thing to do, above the routes; round 5
// 5b-2 (spec A, C): the folded worked example sits right under it (another
// network's finished route, task 15's main and backup), and task 15's two
// sentences come with «Уся умова» for the rest (at both sizes). The page is
// the only scroller: in two columns the diagram's column sticks
// (useStageHeight). The packet's path is drawn on the diagram (PathLayer),
// with motion: a probe's path, a safety rule's cycle router by router, or a
// ring on the repair router.
//
// Polish: a passing network check says so at once (the panel's verdict,
// with the ending's words) and plays the success lap alongside (lapPlan.js,
// LapLayer.jsx): every ping at once, then the task's ending, if its evidence
// has one. «Показати ще раз» replays it; a pointer or key press anywhere in
// the screen skips to its end state. While it plays, a pannable diagram
// shows «Уся схема»; zoom and scroll come back after.
//
// OPT-1 UI: after a passing check, once nothing plays, the check's answer is
// reviewed a step at a time (reviewQueue.js); the result is stored on its
// own instance (view.review) and shown while that check's answer is
// unedited: tips under «Що можна покращити…» in the success notes (each a
// link to its row or router), in «Текстом» too, never announced (round 4:
// no ★ in the strip). Once the exact instance is
// earned, «Показати найкоротший варіант» shows the known safe table.
//
// Step 9, «Інші адреси» (spec step 9 §3, R6, R7): a task is shown on one
// instance, its base addresses or a seeded instance with other addresses
// (instances.js). Everything on the screen comes from that instance's own
// record (ex.task): the diagram, «Текстом», the texts, rows, checks, hints,
// the lap and demonstrations, the tips and the known table; nothing from
// the bank record but its place in the list. Round 4: the heading is the
// task's title only; «⋯» copies the code, picks other addresses or the base
// ones, and keeps the previous code until another task is opened. «Код задачі» at the
// top of the task list opens a code's instance. The place keeps the
// instance last used per task (`seeds`), so the list reopens it; the store
// keeps an instance only once it is worked on (a zoom or an opened panel
// before that stays on the screen), and the list's ✓ (DoneMark) counts a
// task once from any instance. Round 4 (spec A5): no score and no «↺».
//
// Round 3 RF-1: where the target gives RF-1's record (`bank.faults`), the
// address row ends with a switch between this screen («Налаштуй маршрути»)
// and «Знайди несправність» (FaultsView.jsx); the default export below
// chooses between them. Without it the screen is as before.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import routing, { describeTrace, presentCheck, textFor } from '../logic/static.js';
import { formatCode, parseCode } from '../logic/codes.js';
import { syntaxList, syntaxes } from '../syntax/index.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, usePref, useStore } from '../../../ui/useStore.js';
import { BarControls, SheetCaption, SheetChoice, SheetControls } from '../../../ui/BarSlot.jsx';
import { usePhone } from '../../../ui/phone.js';
import DiagramExpand, { ExpandButton, useDiagramExpand } from '../../../ui/topology/DiagramExpand.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import MoreMenu from '../../../ui/components/MoreMenu.jsx';
import { AsideButton, useAsideFold } from '../../../ui/components/Aside.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import { describeNetwork } from '../../../ui/topology/describe.js';
import { comprehension, faultsUi, t, ui } from '../uk.js';
import { levelClass, routerClass } from './theme.js';
import { routableAnswer, sameRouteSet, useRouteAnswers } from './useRouteAnswers.js';
import TaskList from './TaskList.jsx';
import RulesPanel from './RulesPanel.jsx';
import TopologyMap from './TopologyMap.jsx';
import RouteRows, { rowHeadId, rowsHeadId } from './RouteRows.jsx';
import { InterfacesCard, ReferenceRows } from './RouterCard.jsx';
import { BEST_ID, ChecksList, SuccessDetail, verdictSummary } from './CheckPanel.jsx';
import { diagramTopology } from './diagramTopology.js';
import { hasText } from './rowCheck.js';
import { PathLegend, PathOver, PathUnder, usePathStep } from './PathLayer.jsx';
import { useReducedMotion } from '../../../ui/motion.js';
import { diagramGeometry, NETGYM_DIAGRAM_FONT } from '../../../ui/topology/geometry.js';
import { cycleTrace, planPath, solvedMarks } from './pathPlan.js';
import { checkViewReducer, initialCheckView, shownOf } from './checkView.js';
import { lapEnding, lapFrame, lapOf } from './lapPlan.js';
import { LapOver, LapUnder, useLap } from './LapLayer.jsx';
import { reviewSteps } from '../logic/review.js';
import { createReviewQueue } from './reviewQueue.js';
import { currentReview, tipItems, tipsFor } from './reviewView.js';
import { useShortestReveal } from './useShortestReveal.js';
import { cachedRouting, earnedTasks, instanceOf, otherSeed, ownInstances } from './instances.js';
import { copyText } from '../../../ui/clipboard.js';
import { AddressRow, CodeField } from './Addresses.jsx';
import { modeFor, useLayoutMode, useStageHeight } from './layoutMode.js';
import FaultsView from './FaultsView.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import { legendFacts } from '../logic/legend.js';
import { routingExample } from '../logic/examples.js';
import '../../../ui/tokens.css';
import './routing.css';

/** Every base instance of the bank (one per variant). */
export function instanceKeys(bank) {
  const { bankId, bankRevision, tasks } = bank;
  return tasks.flatMap(record => record.variants.map(v => routing.create(record, { variantId: v.id, bank, bankId, bankRevision }).instanceKey));
}
// The variant each round 1 app showed as task 3 and 8: opening the task picks
// it for the active syntax, and the choice then stays with the task.
const ROUND1_VARIANT = { cisco: { 'routing.task-03': 'defaults', 'routing.task-08': 'stub-defaults' } };
export const round1Variant = (record, syntax) => ROUND1_VARIANT[syntax]?.[record.id] ?? record.variants[0].id;

/** A task's short code, or null where the bank has no letter (logic/codes.js). */
export function codeOf(task) {
  try { return formatCode(task.identity); } catch { return null; }
}
/** How long «Інші адреси» waits before building, so its «Підбираю адреси…» is painted first. */
export const BUILD_DELAY = 40;

// The layout mode for a content width (the thresholds in routing.css) is in
// layoutMode.js now, shared with «Знайди несправність»; still exported here.
export { modeFor };

/** A line the list can pick: one with a packet trace or a safety cycle to
 * draw, or a sentence to put in the strip. */
const pickable = line => Boolean(line.trace) || Boolean(line.cycle) || Boolean(line.text);
/** A failure with nothing to draw: only the ring on its repair router. */
const RING_ONLY = Object.freeze({ direction: 'request', request: null, reply: null, downLinks: [] });
/** What the diagram draws for the shown line or demonstration: its path; a
 * safety cycle, router by router; else, for a failure, its repair router's ring. */
function traceOf(shown) {
  if (!shown) return null;
  if (shown.trace) return shown.trace;
  if (shown.line?.cycle) return cycleTrace(shown.line.cycle);
  return shown.failed && shown.line?.repairRouter ? RING_ONLY : null;
}

/** A task text's first sentence and the rest (the rest empty for one sentence). */
export function firstSentence(text) {
  const at = String(text).search(/[.!?»](?=\s+[«A-ZА-ЯІЇЄҐ])/u);
  return at < 0 ? { first: text, rest: '' } : { first: text.slice(0, at + 1), rest: text.slice(at + 1).trim() };
}

/** The first ISP's own address (its gateway, shown in the cloud) and its name, or null. */
export function ispEnd(network) {
  for (const device of network.devices) {
    const iface = device.kind === 'isp' ? device.interfaces.find(i => i.address) : null;
    if (iface) return { router: device.id, address: iface.address.ip };
  }
  return null;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** A viewport this short or shorter (the 1000×700 class window) starts with the legend folded. */
export const SHORT_VIEW = 760;
/** The share of the diagram column's visible height the task and an open legend may take (more: the legend starts folded). */
export const CROWDED = 0.4;
export function useShortView() {
  const measure = () => typeof window !== 'undefined' && window.innerHeight <= SHORT_VIEW;
  const [short, setShort] = useState(measure);
  useEffect(() => {
    const update = () => setShort(measure());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return short;
}

/** «Як читати схему» (round 5, R4): this instance's own values, each
 * paragraph only where the task has it. An Aside (open until the first check
 * or «Далі»), except that `short` starts it folded (a short window, or a
 * diagram column too full for it), so the task, the action line, the first
 * route, «Перевірити» and the diagram fit the first view (round 5, R5); its
 * «?» opens it, and that choice holds as the Aside's does. */
export function Legend({ task, syntax, routers, short = false }) {
  const { state, dispatch } = useStore();
  const place = state.places[ASIDE_SCREEN] ?? {};
  const choice = place.asides?.legend;
  // Round 6: folded at first on a phone too, as every aside is (Aside.jsx).
  const phone = usePhone();
  const open = typeof choice === 'boolean' ? choice : !place.started && !short && !phone;
  const toggle = () => dispatch({ type: 'place', scope: ASIDE_SCREEN, patch: { asides: { ...place.asides, legend: !open } } });
  const bodyId = useId();
  const facts = legendFacts(task, syntax);
  const link = facts.link && facts.link.ends.length === 2 && facts.link.ends.every(end => routers.includes(end.router)) ? facts.link : null;
  const internet = task.network.endpoints.some(e => e.kind === 'internet');
  return (
    <div className={`ng-aside ng-rt-legend${open ? ' is-open' : ''}`}>
      <AsideButton title={ui.shared.legendTitle} open={open} onToggle={toggle} controls={bodyId} />
      {open && (
        <div id={bodyId} className="ng-aside-body">
          <p className="ng-aside-title">{ui.shared.legendTitle}</p>
          {facts.lan && <p>{ui.shared.legendLan(facts.lan)}</p>}
          {link && <p>{ui.shared.legendLink(link)}</p>}
          {internet && <p>{ui.shared.legendIsp(ispEnd(task.network))}</p>}
        </div>
      )}
    </div>
  );
}

/** «☰ Задачі» in two parts: a phone shows «☰» alone (its name stays «☰ Задачі»). */
const [drawerIcon, ...drawerRest] = ui.shared.drawer.split(' ');
const drawerWord = ` ${drawerRest.join(' ')}`;

/** The screen's id for its asides (the legend): places[ASIDE_SCREEN].asides. */
export const ASIDE_SCREEN = 'routing.tasks';

/** The scope of «Знайди несправність»'s place in the store: whether it is
 * open, and its instance (level, seed). */
export const FAULTS_SCOPE = 'routing-faults';

/**
 * The routing section: «Налаштуй маршрути» (the task list, below) or, where
 * the target gives RF-1's record (`bank.faults`), «Знайди несправність»
 * (FaultsView.jsx). The switch between them ends the address row in both,
 * so it stays in one place; a switch keeps focus on it. Without
 * `bank.faults` there is no switch and the task screen is as before.
 * @param {{ bank: { bankId: string, bankRevision: number, tasks: object[], faults?: object } }} props
 */
export default function RoutingScreen({ bank }) {
  const { state, dispatch } = useStore();
  const offered = Boolean(bank.faults);
  const place = state.places[FAULTS_SCOPE];
  const exercise = offered && place?.open === true ? 'faults' : 'tasks';
  // The switch is drawn by whichever view is open; its box (by ref) holds the
  // choice to focus after a switch.
  const switchBox = useRef(null);
  const focusSwitch = useRef(false);
  useEffect(() => {
    if (!focusSwitch.current) return;
    focusSwitch.current = false;
    switchBox.current?.querySelector('[aria-checked="true"]')?.focus();
  }, [exercise]);
  function choose(id) {
    if (id === exercise) return;
    focusSwitch.current = true;
    // The first opening builds its instance after a paint (FaultsView.jsx).
    dispatch({ type: 'place', scope: FAULTS_SCOPE, patch: { open: id === 'faults' } });
  }
  // Round 6: on a phone the switch is in the bar's «⋯» sheet (SheetControls; the same element, never remounted).
  const exerciseSwitch = offered ? (
    <SheetControls label={faultsUi.exercise}>
      <div ref={switchBox} className="ng-rt-exercises-box">
        <Segmented label={faultsUi.exercise} value={exercise} onChange={choose} className="ng-rt-exercises"
          options={['tasks', 'faults'].map(value => ({ value, label: faultsUi.exercises[value] }))} />
      </div>
    </SheetControls>
  ) : null;
  return exercise === 'faults'
    ? <FaultsView bank={bank} exerciseSwitch={exerciseSwitch} />
    : <TasksView bank={bank} exerciseSwitch={exerciseSwitch} />;
}

/** «Налаштуй маршрути»: the task list's tasks, as before RF-1.
 * @param {{ bank: { bankId: string, bankRevision: number, tasks: object[] }, exerciseSwitch?: any }} props */
function TasksView({ bank, exerciseSwitch = null }) {
  const { tasks } = bank;
  const bankParams = { bank, bankId: bank.bankId, bankRevision: bank.bankRevision };
  // useExercise serializes params for its memo key: bind large bank data in
  // the logic adapter, leaving only the small identity in those params.
  const bankRouting = useMemo(() => ({ ...cachedRouting,
    create: (record, params) => cachedRouting.create(record, { ...params, bank }),
  }), [bank]);
  const { state, dispatch } = useStore();
  const [syntaxId, setSyntax] = usePref('syntax');
  const [themeName] = usePref('theme');
  const [modePref, setModePref] = usePref('mode');
  const [place, setPlace] = usePlace('routing', { taskId: tasks[0].id, router: null, filterLevel: 0, variants: {}, seeds: {} });
  const root = useRef(null);
  const colsRef = useRef(null);
  const boardRef = useRef(null);
  const disclosureHost = useRef(null);
  const drawerButton = useRef(null);
  const layout = useLayoutMode(root);
  useStageHeight(colsRef, layout);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const textButton = useRef(null);
  const mapRef = useRef(null);
  const titleRef = useRef(null);
  // A request to focus the task's heading («Далі», an opened code), as a counter.
  const [titleFocus, setTitleFocus] = useState(0);
  const reduced = useReducedMotion();
  const markerIds = useId().replace(/:/g, '');
  const foldAsides = useAsideFold(ASIDE_SCREEN);
  // A short window (≤ SHORT_VIEW): the legend starts folded (data-short; the gate's task 15 essentials read it).
  const short = useShortView();
  // So does a diagram column too full for it (a long task, task 15's failure case): measured before the
  // first paint of each instance, once (the learner's own «?» choice always wins).
  const [crowded, setCrowded] = useState(null);

  const syntax = syntaxes[syntaxId] ?? syntaxes.cisco;
  const other = syntaxList.find(x => x.id !== syntax.id);
  const mode = modePref === 'free' ? 'free' : 'guided';
  const record = tasks.find(r => r.id === place.taskId) ?? tasks[0];
  const position = tasks.indexOf(record);
  const variantOf = r => place.variants?.[r.id] ?? round1Variant(r, syntax.id);
  const variantId = variantOf(record);
  // The instance last used for this task: its seed (null: the base addresses).
  // One the logic can't build (never stored by this screen) shows the base.
  const wantedSeed = place.seeds?.[record.id] ?? null;
  const seed = wantedSeed !== null && instanceOf(record, { variantId, seed: wantedSeed, ...bankParams }).infeasible ? null : wantedSeed;
  const ex = useExercise(bankRouting, record, { variantId, seed, bankId: bank.bankId, bankRevision: bank.bankRevision });
  const { task } = ex;
  const { variant } = task;
  const code = useMemo(() => codeOf(task), [task]);
  const generated = task.identity.seed !== null;
  // The instance's own network, never the bank record's; labelled for the
  // learner (diagramTopology.js: a LAN's network, a port's address, both ends of a link).
  const topo = useMemo(() => diagramTopology(task.network, syntax.id), [task, syntax.id]);
  const described = useMemo(() => describeNetwork(task.network, syntax.id), [task, syntax.id]);
  const routeAnswers = useRouteAnswers(ex, syntax, mode);
  // The row last edited (this instance): a stale verdict's evidence, so the
  // panel stays right after the row the learner is changing.
  const [edited, setEdited] = useState(null);
  // Nothing moves while the learner types (repair 3): an edit dims the
  // verdict, and the panel folds its detail and brings back hints, usually
  // shrinking. Its height is held from the first edit until the next check
  // (or another task), so neither a board under it nor a page scrolled to
  // its end moves the field being typed in.
  const checkStamp = ex.view.checks ?? ex.presses ?? 0;
  const [helpHold, setHelpHold] = useState(null);
  const holding = helpHold && helpHold.instance === ex.key && helpHold.stamp === checkStamp ? helpHold.height : null;
  const answers = { ...routeAnswers, edit: (item, name, value) => {
    if (holding === null) {
      const height = root.current?.querySelector('.ng-rt-help')?.getBoundingClientRect().height ?? 0;
      if (height > 0) setHelpHold({ instance: ex.key, stamp: checkStamp, height: Math.ceil(height) });
    }
    setEdited({ key: item.key, instance: ex.key });
    routeAnswers.edit(item, name, value);
  } };
  const routerNames = Object.keys(topo.routers);
  // Round 4 (spec R1): a router is always selected, the first one at first.
  const router = routerNames.includes(place.router) ? place.router : routerNames[0];
  // The bank's instances in the store, base and generated: a task is ✓ in
  // the list once any of them was earned (round 4: no score, no «↺»).
  const own = useMemo(() => ownInstances(state.instances, bank), [state.instances, bank]);
  const earned = useMemo(() => earnedTasks(own), [own]);
  const solved = r => earned.has(r.id);
  const titleOf = r => textFor(r.variants.find(v => v.id === variantOf(r)).title, syntax.id);
  const drawer = layout !== 'wide';
  // The task's simulated failure (task 15), said beside the task.
  const failover = (task.record.scenarios ?? []).find(sc => sc.downLinks?.length && sc.title);

  // The check view: «Текстом» over the diagram, the drawn path, replays (checkView.js).
  // Another task instance starts with nothing picked: derived at once for
  // this render, and stored, so coming back to an instance (A → B → A, a
  // task or a variant) doesn't bring back what it showed before, such as a
  // lap that would play again without a check.
  // Round 6 repair: «Текстом» starts closed here on a phone too («Адреси цього роутера» carries the
  // first route's facts; the full-screen diagram shows the rest).
  const [checkView, setCheckView] = useState(() => initialCheckView(ex.key));
  const cv = checkView.key === ex.key ? checkView : checkViewReducer(checkView, { type: 'instance', key: ex.key });
  if (cv !== checkView) setCheckView(cv);
  const act = action => setCheckView(current => checkViewReducer(checkViewReducer(current, { type: 'instance', key: ex.key }), action));

  // What the verdict, «Усі перевірки» and the drawing show: presentCheck of
  // the last network check; before one, the list's labels from an empty answer.
  const pending = useMemo(() => presentCheck(task, routing.check(task, {}), syntax.id), [task, syntax.id]);
  const presented = useMemo(() => (ex.result ? presentCheck(task, ex.result, syntax.id) : null), [task, ex.result, syntax.id]);
  const shown = shownOf(cv, presented);
  const trace = traceOf(shown);
  const ends = shown?.kind === 'demo' ? task.record.demonstrations?.find(d => d.id === shown.id) : shown?.line?.probe ? task.record.probes.find(p => p.id === shown.line.probe.id) : null;
  const playKey = trace ? `${ex.key}|${shown.kind}|${shown.id}|${cv.play}` : null;

  // The hint ladder, from the current rows (not only the last checked answer).
  const hintIndex = ex.session.hintIndex;
  const currentRows = answers.currentAnswer();
  const currentKey = JSON.stringify(currentRows);
  const hintTexts = useMemo(() => routing.hints(task, currentRows, syntax.id).map(h => t(`routing.static.${h.code}`, h.params)),
    [task, currentKey, syntax.id]);

  // The other syntax's commands only for routes the passing check checked (kind 3).
  const submitted = presented?.ok && ex.view.proven && ex.view.proven === JSON.stringify(routableAnswer(ex.answer)) ? routableAnswer(ex.answer) : null;
  // The rows are the routes the passing check proved.
  const provenRows = Boolean(presented?.ok && ex.view.proven) && sameRouteSet(JSON.parse(ex.view.proven), currentRows);
  const nextRecord = tasks[position + 1] ?? null;

  // «Шлях пакета» in «Текстом»: the drawn path in words.
  const evidenceTrace = ex.result?.evidence;
  const pathItems = useMemo(() => {
    if (!presented || !evidenceTrace) return [ui.shared.pathNone];
    // A picked demonstration: its own sentence (a safe drop is the right
    // outcome, not a failure to describe).
    if (shown?.kind === 'demo') return [shown.text];
    const line = shown?.line;
    const leg = line?.kind === 'probe' ? evidenceTrace.probes?.find(p => p.id === line.probe.id && (p.scenarioId ?? null) === (line.scenarioId ?? null)) : null;
    if (leg) return describeTrace(leg, task.network, syntax.id);
    if (line) return [line.text || line.label];
    if (!presented.ok) return [presented.strip];
    const all = [...new Set(describeTrace(evidenceTrace, task.network, syntax.id))];
    // The lap's ending in words too: the failover, or the safe drop.
    const ending = shown?.kind === 'lap' ? lapEnding(presented, task.network, task.record) : null;
    return ending ? [...all, ending.words] : all;
  }, [presented, shown?.kind, shown?.id, evidenceTrace, task, syntax.id]);
  // The post-success review on display (reviewView.js): its tips, in the
  // rows the active mode lists, only while the rows are the routes the check proved (U4).
  const review = provenRows ? currentReview(ex) : null;
  const best = useShortestReveal(ex, mode, bank);
  const rowsOf = r => (mode === 'free' ? answers.freeItems(r) : [...(answers.rows[r] ?? []).map((_, i) => answers.slotItem(r, i)), ...answers.extraItems(r)]);
  const tips = review ? tipItems(tipsFor(review, mode, task), { rowsOf, bestAvailable: best.available }) : [];
  const improveItems = presented?.ok ? [...presented.advice.map(a => a.text), ...tips.map(tip => tip.plain)] : [];
  const textSections = useMemo(() => [...described, { heading: ui.shared.pathTitle, items: [...new Set(pathItems)] },
    ...(improveItems.length ? [{ heading: ui.shared.improveTitle, items: improveItems }] : [])], [described, pathItems, improveItems.join('\n')]);

  // A task's variant is fixed when it is opened, so a later syntax switch
  // can't swap it for the other syntax's round 1 variant.
  const pinned = r => (r.variants.length > 1 && !place.variants?.[r.id] ? { ...place.variants, [r.id]: round1Variant(r, syntax.id) } : place.variants);
  /** Another task, on the instance last used for it. */
  function openTask(id) {
    const next = tasks.find(r => r.id === id);
    cancelWork();
    setPlace({ taskId: id, router: null, variants: pinned(next) });
    setPrevious(null);
    setNotice(null);
    if (drawerOpen) closeDrawer();
  }
  function closeDrawer() {
    setDrawerOpen(false);
    drawerButton.current?.focus();
  }
  function switchSyntax(id) {
    if (id === syntax.id) return;
    const variants = pinned(record);
    if (variants !== place.variants) setPlace({ variants });
    setSyntax(id);
  }
  function chooseVariant(id) {
    cancelWork();
    setPlace({ variants: { ...place.variants, [record.id]: id } });
  }
  const selectRouter = name => { if (name && routerNames.includes(name)) setPlace({ router: name }); };
  const toggleText = () => act({ type: 'toggle', overlay: 'text' });
  function closeOverlay() {
    act({ type: 'close' });
    textButton.current?.focus();
  }
  /** A touched field of a guided row lost focus: check that row (its touched fields marked). */
  const blurCheck = (item, fields) => answers.check(item, { fields });
  /** «Перевірити» (or Enter in a field): the network check. A pass plays the
   * lap. A failure selects the router the fix belongs on; the panel brings
   * its row into view. */
  function runNetworkCheck() {
    const { result, answer } = answers.checkNetwork();
    const view = presentCheck(task, result, syntax.id);
    foldAsides();
    ex.setView({ checks: (ex.view.checks ?? 0) + 1, checkedEdits: ex.edits ?? 0, ...(result.ok ? { proven: JSON.stringify(answer) } : {}) });
    // Its review waits until nothing plays; this check is the instance's next generation.
    if (result.ok) reviews.add({ key: ex.key, generation: (ex.generation ?? 0) + 1, edits: ex.edits ?? 0, steps: reviewSteps(task, answer, { assessment: result, bank }) });
    act({ type: 'checked', ok: result.ok });
    const formRouter = result.formErrors?.find(e => routerNames.includes(e.routerId))?.routerId ?? null;
    const repair = formRouter ?? (!result.ok && routerNames.includes(view.repairRouter) ? view.repairRouter : null);
    if (repair && repair !== router) setPlace({ router: repair });
  }
  function pickLine(id) {
    act({ type: 'pick', kind: 'line', id });
  }
  const pickDemo = id => act({ type: 'pick', kind: 'demo', id });
  const replayLap = () => act({ type: 'replay' });
  /** A tip's link: its row (or router) selected, outlined and focused;
   * «shorter-known» focuses «Показати найкоротший варіант». Never an edit. */
  const [tipTarget, setTipTarget] = useState(null);
  const focusNext = useRef(null);
  function goToTip(tip) {
    if (tip.kind === 'best') { document.getElementById(BEST_ID)?.focus(); return; }
    setPlace({ router: tip.target.router });
    setTipTarget({ ...tip.target, instance: ex.key, generation: review?.generation });
    focusNext.current = tip.target.kind === 'row' ? rowHeadId(tip.target.key) : rowsHeadId(tip.target.router);
  }
  const shownTarget = review && tipTarget?.instance === ex.key && tipTarget.generation === review.generation ? tipTarget : null;
  // Focus goes to the tip's row (or router) once it is mounted; the outline
  // means «focus is here», so it goes when focus leaves it. A target that
  // went (another instance, an edit) takes its pending focus with it.
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    if (!shownTarget) { focusNext.current = null; return; }
    const el = document.getElementById(id);
    if (!el) return;
    focusNext.current = null;
    el.scrollIntoView?.({ block: 'nearest' });
    el.focus({ preventScroll: true });
    el.addEventListener('focusout', () => setTipTarget(null), { once: true });
  });
  useEffect(() => { if (!tipTarget) focusNext.current = null; }, [tipTarget]);
  function moreHint() {
    ex.hint(hintTexts.length);
  }
  // «Далі» focuses the new task's first input (its first row's first field,
  // or «+ Маршрут» when a free list is empty); an opened code, the heading.
  const [firstFocus, setFirstFocus] = useState(0);
  function goNext() {
    foldAsides();
    setFirstFocus(n => n + 1);
    openTask(nextRecord.id);
  }
  useEffect(() => { if (titleFocus) titleRef.current?.focus(); }, [titleFocus]);
  useEffect(() => {
    if (firstFocus) root.current?.querySelector('.ng-rt-rows input, .ng-rt-rows .ng-rt-add')?.focus();
  }, [firstFocus]);

  // ── Step 9: other addresses and codes (round 4: in the «⋯» menu) ──
  // The latest place, for work that finishes after a paint.
  const placeRef = useRef(place);
  placeRef.current = place;
  // «Попередні адреси»: the instance before the last address change in this
  // task, until another task is opened.
  const [previous, setPrevious] = useState(null);
  useEffect(() => { setPrevious(p => (p && p.taskId !== record.id ? null : p)); }, [record.id]);
  const shownPrevious = previous?.taskId === record.id && previous.code ? previous : null;
  const here = () => ({ taskId: record.id, variantId, seed, code, key: ex.key });
  // What an address action did, said in the address row's polite line (for this instance).
  const [notice, setNotice] = useState(null);
  const say = text => setNotice({ text, key: null });
  // Building an instance can take a moment: the row says so, then the work
  // runs after a paint. The work belongs to the instance on screen when it was
  // asked for: any navigation (task, variant, base or previous addresses, a
  // submitted code) cancels it, and it applies only if its token is still the
  // latest and the screen still shows that instance.
  const [building, setBuilding] = useState(null);
  const work = useRef({ timer: null, token: 0 });
  const shownKey = useRef(ex.key);
  shownKey.current = ex.key;
  useEffect(() => () => clearTimeout(work.current.timer), []);
  function cancelWork() {
    clearTimeout(work.current.timer);
    work.current = { timer: null, token: work.current.token + 1 };
    setBuilding(null);
  }
  function later(kind, fn) {
    cancelWork();
    const { token } = work.current, from = ex.key;
    setBuilding(kind);
    work.current.timer = setTimeout(() => {
      const still = work.current.token === token && shownKey.current === from;
      work.current.timer = null;
      setBuilding(null);
      if (still) fn();
    }, BUILD_DELAY);
  }
  const build = (r, id, s) => instanceOf(r, { variantId: id, seed: s, ...bankParams });
  /** «Інші адреси»: a new seed for this task (infeasible ones skipped). */
  function otherAddresses() {
    if (building) return;
    const from = here();
    later('other', () => {
      const next = otherSeed(s => !build(record, from.variantId, s).infeasible, { current: from.seed });
      if (next === null) { setNotice({ text: ui.address.otherNone, key: from.key }); return; }
      setPlace({ seeds: { ...placeRef.current.seeds, [from.taskId]: next } });
      setPrevious(from);
      say(ui.address.changedOther(codeOf(build(record, from.variantId, next)) ?? ''));
    });
  }
  /** «Основні адреси». */
  function baseAddresses() {
    cancelWork();
    setPlace({ seeds: { ...place.seeds, [record.id]: null } });
    setPrevious(here());
    say(ui.address.changedBase(codeOf(build(record, variantId, null)) ?? ''));
  }
  /** «Попередні адреси: …»: back to them; the ones left become the previous. */
  function previousAddresses() {
    const back = shownPrevious;
    if (!back) return;
    cancelWork();
    setPlace({ variants: { ...place.variants, [record.id]: back.variantId }, seeds: { ...place.seeds, [record.id]: back.seed } });
    setPrevious(here());
    say(back.seed === null ? ui.address.changedBase(back.code ?? '') : ui.address.changedOther(back.code ?? ''));
  }
  /** «Код задачі», submitted: the code's task, variant and addresses, or the refusal's code. */
  function openCode(text, report) {
    cancelWork();
    const d = parseCode(text);
    if (d.code) { report(d.code); return; }
    // A code names its bank through its letter (logic/codes.js letters). While
    // there is one letter, a code for another bank than this screen's has a
    // letter this screen doesn't know: «unknown-letter».
    if (d.exerciseId !== routing.id || d.bankId !== bank.bankId || d.bankRevision !== bank.bankRevision) { report('unknown-letter'); return; }
    const target = tasks.find(r => r.id === d.taskId);
    if (!target?.variants.some(v => v.id === d.variantId)) { report('unknown-variant'); return; }
    const open = () => {
      if (d.seed !== null && build(target, d.variantId, d.seed).infeasible) { report('infeasible'); return; }
      const now = placeRef.current;
      setPlace({ taskId: target.id, router: null, variants: { ...now.variants, [target.id]: d.variantId }, seeds: { ...now.seeds, [target.id]: d.seed } });
      setPrevious(null);
      setDrawerOpen(false);
      setTitleFocus(n => n + 1);
      report(null);
    };
    if (d.seed === null) open();
    else later('code', open);
  }

  // The view of an instance not stored yet (nothing worked on): its zoom,
  // kept here per instance, so looking stores nothing (spec step 9 R7).
  // Once the instance is stored, the store's view wins.
  const stored = Boolean(state.instances[ex.key]);
  const [fresh, setFresh] = useState({});
  const shownView = { ...fresh[ex.key], ...ex.view };
  const setShownView = patch => (stored ? ex.setView(patch) : setFresh(f => ({ ...f, [ex.key]: { ...f[ex.key], ...patch } })));
  const onZoom = value => setShownView({ zoom: value });
  // Round 6 (P2): the full-screen diagram on a phone; it has a zoom of its own, the stored one stays.
  const expand = useDiagramExpand({ zoom: shownView.zoom, onZoom });
  // The drawer closes when the layout gets room for the list.
  useEffect(() => { if (!drawer) setDrawerOpen(false); }, [drawer]);

  useIsoLayoutEffect(() => {
    if (crowded === ex.key || layout === 'narrow') return;
    const left = root.current?.querySelector('.ng-rt-left'), legend = left?.querySelector('.ng-rt-legend .ng-aside-body');
    if (!legend) return;
    // The words above the diagram may take at most CROWDED of the column's visible height.
    const top = left.getBoundingClientRect().top;
    if (legend.getBoundingClientRect().bottom - top > CROWDED * (window.innerHeight - top)) setCrowded(ex.key);
  }, [ex.key, layout]);
  // Repair v2 (Astra): a short window whose task text alone still takes more than CROWDED of the column
  // (task 15: nine lines at 1000×700) shows its first sentence and «Уся умова», so the diagram has room
  // for every address at 12 px; the rest and the failure case open under it. Measured before the first
  // paint of each instance; the learner's own choice holds for the instance.
  const [details, setDetails] = useState({});
  // Round 5 5b-2 (spec C): a task with its own `details` (task 15) shows its short `text` whole and the
  // rest behind «Уся умова», closed, at both sizes: the height rule is for the other tasks.
  const full = variant.details ? textFor(variant.details, syntax.id) : null;
  const [fullOpen, setFullOpen] = useState({});
  const fullShown = Boolean(full && fullOpen[ex.key]);
  const fullId = `${markerIds}-full`;
  useIsoLayoutEffect(() => {
    if (full || !short || layout === 'narrow' || details[ex.key] !== undefined) return;
    const left = root.current?.querySelector('.ng-rt-left'), text = left?.querySelector('.ng-rt-legend');
    if (!text || !firstSentence(textFor(variant.text, syntax.id)).rest) return;
    const top = left.getBoundingClientRect().top;
    if (text.getBoundingClientRect().top - top > CROWDED * (window.innerHeight - top)) setDetails(d => ({ ...d, [ex.key]: false }));
  }, [ex.key, layout, short]);
  const detailsShut = details[ex.key] === false;
  const taskText = textFor(variant.text, syntax.id);
  const taskParts = firstSentence(taskText);
  // The worked example (spec 5b-2 A, C): another network's finished route in this syntax (task 15: its main
  // and backup default routes); display data only, never the learner's rows.
  const backupExample = record.displayNumber === 15;
  const example = useMemo(() => routingExample({ syntax: syntax.id, taskNumber: backupExample ? 15 : 1 }), [syntax.id, backupExample]);

  // The packet path: the diagram's own geometry (as TopologyMap draws it), one motion for both parts.
  const geo = useMemo(() => diagramGeometry(topo, topo, undefined, NETGYM_DIAGRAM_FONT), [topo]);
  const plan = trace ? planPath(geo, task.network, syntax.id, trace, { from: ends?.from, to: ends?.to, repairRouter: shown.line?.repairRouter, failed: shown.failed, expected: shown.kind === 'demo' }) : null;
  const centre = point => { if (point) mapRef.current?.centreOn(point, { ifHidden: true }); };
  const step = usePathStep(plan, playKey, reduced, move => centre(move.target), centre);
  const markers = { request: `${markerIds}-req`, reply: `${markerIds}-rep` };

  // The success lap: its plan, where its schedule is, and that frame.
  const lapShown = shown?.kind === 'lap';
  const lap = useMemo(() => (lapShown ? lapOf(geo, task.network, syntax.id, presented, task.record) : null), [lapShown, geo, task, syntax.id, presented]);
  const lapPlay = useLap(lap, lapShown ? `${ex.key}|lap|${cv.play}` : null, reduced);
  const lapNow = lap && lapPlay.tick ? lapFrame(lap, lapPlay.tick) : null;
  /** Any pointer or key press in the screen (the bar's controls too) skips the lap to its end state. */
  const skipLap = () => { if (lapPlay.playing) lapPlay.skip(); };
  const drawnPath = plan?.moves.length > 0 || Boolean(lapNow && (lapNow.lines.length || lapNow.moving.length));

  // Post-success reviews (OPT-1 UI U1): one queue for the screen's lifetime.
  // It steps only while nothing plays (a lap, a replay, a picked path), reads
  // the store afresh before each step, and stops when the screen goes.
  const busy = lapPlay.playing || (Boolean(plan) && !reduced && step < plan.moves.length);
  const reviewLive = useRef({ state, busy });
  reviewLive.current = { state, busy };
  const [reviews] = useState(() => createReviewQueue({
    instanceOf: key => reviewLive.current.state.instances[key],
    write: (key, result) => dispatch({ type: 'instance', key, action: { type: 'review', ...result } }),
    isBusy: () => reviewLive.current.busy,
  }));
  useEffect(() => () => reviews.dispose(), [reviews]);
  useEffect(() => { if (!busy) reviews.kick(); });

  // ── The help panel (round 4 spec R1): one check, under the rows ──
  const revealed = Boolean(ex.session.revealed);
  const mine = !revealed || shownView.mine === true;
  const checkedEdits = ex.view.checkedEdits ?? null;
  // Edited since the last network check: the verdict is «до змін».
  const stale = Boolean(presented) && checkedEdits !== null && (ex.edits ?? 0) !== checkedEdits;
  const [staleSeen, setStaleSeen] = useState(false);
  useEffect(() => { if (stale !== staleSeen) setStaleSeen(stale); }, [stale]);
  let verdict = null;
  if (presented) {
    const ending = presented.ok ? lapEnding(presented, task.network, task.record) : null;
    const summary = verdictSummary(presented, ending?.words ?? null);
    verdict = {
      tone: presented.ok ? 'ok' : 'no', scope: 'task', summary, stamp: checkStamp,
      detail: presented.ok ? <SuccessDetail presented={presented} submitted={submitted} other={other} onDemo={pickDemo}
        onReplay={lapShown || presented.ok ? replayLap : null} tips={tips} onTip={goToTip} best={best} syntax={syntax} /> : null,
    };
  }
  // What the verdict is about (data-evidence="current"), on the router it
  // selected: the first marked row there, else its first row still empty,
  // else its rows' heading. After an edit (a stale verdict) nothing on the
  // board is marked: the learner is looking at the row they edited.
  const evidence = (() => {
    // A hint before any check is about the rows too (rung 1 reads the network as the rows make it).
    if (!mine || (!presented && hintIndex === 0)) return null;
    const items = rowsOf(router);
    // The edited row is the evidence from the render after the verdict went stale: marked at that very
    // render, HelpPanel would anchor the panel after it, and a panel placed before a long board would
    // jump below the row, moving the field being typed in (repair 3: nothing moves while typing).
    if (stale) return staleSeen && edited?.instance === ex.key && items.some(item => item.key === edited.key) ? { key: edited.key } : null;
    if (presented?.ok) return null;
    const marked = items.find(item => answers.formErrorOf(item) || (answers.networkResultOf(item) ?? answers.resultOf(item))?.ok === false);
    if (marked) return { key: marked.key };
    const empty = items.find(item => !hasText(answers.valuesOf(item)));
    return empty ? { key: empty.key } : { head: true };
  })();
  // An edit after a success dims it and opens help again (hints, reveal):
  // the panel treats it as a part, and «Далі →» stays primary.
  const editedSuccess = stale && verdict?.tone === 'ok';
  // A long board (task 15's two routes) has the panel before the routes (HelpPanel's home, round 4):
  // then the action line says route #1 is below it (repair v1, Fable suggestion 1, its second option;
  // moving the panel after the routes broke the hint and edit states' visibility, see the handoff).
  const [panelFirst, setPanelFirst] = useState(false);
  useIsoLayoutEffect(() => {
    const rows = boardRef.current, host = root.current?.querySelector('.ng-help-host');
    // The panel at home before the routes (not anchored after a row inside them).
    const siblings = rows?.parentNode ? [...rows.parentNode.childNodes] : [];
    const first = Boolean(host && rows && siblings.includes(host) && siblings.indexOf(host) < siblings.indexOf(rows));
    if (first !== panelFirst) setPanelFirst(first);
  });
  const help = (
    <HelpPanel
      taskKey={ex.key}
      boardRef={boardRef}
      primary={editedSuccess && nextRecord ? 'next' : undefined}
      className="ng-rt-help"
      check={{ onCheck: runNetworkCheck }}
      verdict={editedSuccess ? { ...verdict, scope: 'part' } : verdict}
      stale={stale}
      hints={{ texts: hintTexts, shown: Math.min(hintIndex, hintTexts.length), onMore: moreHint }}
      reveal={{ revealed, onReveal: () => { ex.reveal(); setShownView({ mine: false }); }, render: () => null, applied: ui.shared.applied }}
      // «Далі →» once the task is done (solved or revealed); before that ◀ ▶ and the list move between tasks.
      next={nextRecord && (presented?.ok || revealed) ? { onNext: goNext, ready: true } : null}
    />
  );
  // The action line (and the worked example under it): while the learner's own rows are shown and there is a route to fill.
  const acting = mine && (mode === 'free' || (answers.rows[router] ?? []).length > 0);
  // An edit after a check dims its verdict; the panel anchors next to the
  // edited row (HelpPanel), and nothing scrolls while the learner types.
  const mineToggle = revealed ? (
    <button type="button" className="ng-rt-btn ng-rt-mine" aria-pressed={mine} onClick={() => setShownView({ mine: !mine })}>
      {mine ? ui.shared.showReference : ui.shared.myAnswer}
    </button>
  ) : null;

  // ── «⋯» (round 4 spec A4): code, addresses, rules, every check ──
  const menu = [
    // A copy the clipboard refuses: the code in the address line, to select by hand.
    code && { id: 'code', label: ui.shared.copyCode(code), copy: code, onCopy: text => copyText(text).catch(error => { say(ui.address.copyFailedCode(text)); throw error; }) },
    { id: 'other', label: ui.address.other, onSelect: otherAddresses },
    generated && { id: 'base', label: ui.address.base, onSelect: baseAddresses },
    shownPrevious && { id: 'previous', label: `${ui.address.previous} ${shownPrevious.code}`, onSelect: previousAddresses },
    { id: 'rules', label: ui.shared.menuRules, render: () => <RulesPanel syntax={syntax} /> },
    { id: 'checks', label: ui.shared.menuChecks, render: () => (
      <ChecksList presented={presented} pending={pending} shownId={shown?.kind === 'line' ? shown.id : null} onPick={pickLine} pickable={pickable} />
    ) },
  ];
  const addressNotice = notice && (notice.key === null || notice.key === ex.key) ? notice.text : null;

  return (
    <div ref={root} className="ng-rt" style={holding ? { '--ng-rt-help-hold': `${holding}px` } : undefined} data-theme={themeName} data-mode={layout} data-short={short ? '' : undefined} data-lap={lapShown ? (lapPlay.playing ? 'playing' : 'done') : undefined}
      onPointerDownCapture={skipLap} onKeyDownCapture={skipLap}>
      <BarControls>
        <div className="ng-rt-controls">
          <SheetCaption label={ui.shared.syntax} />
          <Segmented label={ui.shared.syntax} options={syntaxList.map(x => ({ value: x.id, label: x.label }))} value={syntax.id} onChange={switchSyntax} />
          <SheetCaption label={ui.shared.mode} />
          <Segmented label={ui.shared.mode} value={mode} onChange={setModePref} className="ng-rt-modes"
            options={['guided', 'free'].map(value => ({ value, label: ui.shared.modes[value] }))} />
        </div>
      </BarControls>

      <div className="ng-rt-layout">
        <TaskList tasks={tasks} titleOf={titleOf} current={record.id} filterLevel={place.filterLevel} setFilterLevel={level => setPlace({ filterLevel: level })}
          onOpen={openTask} solved={solved} drawer={drawer} open={drawerOpen} onClose={closeDrawer}
          codeField={<CodeField onOpen={openCode} busy={building === 'code'} />} />
        {drawer && drawerOpen && <div className="ng-rt-scrim" onClick={closeDrawer} />}

        <main className="ng-rt-main">
          <div className="ng-rt-taskbar">
            <button ref={drawerButton} type="button" className="ng-rt-btn ng-rt-drawer-button" aria-label={ui.shared.drawer} aria-expanded={drawerOpen} aria-controls="ng-rt-tasks" onClick={() => setDrawerOpen(true)}>
              <span aria-hidden="true">{drawerIcon}</span><span className="ng-rt-drawer-word" aria-hidden="true">{drawerWord}</span>
            </button>
            <h1 className="ng-rt-h1">{ui.shared.heading}</h1>
            <span className={`ng-rt-level ${levelClass(record.level)}`}>{ui.shared.levelLabels[record.level]}</span>
            {/* Round 4: the task's title only (the list keeps the codes). */}
            <h2 ref={titleRef} tabIndex={-1} className="ng-rt-title" data-variant={variant.code} data-code={code ?? undefined}>{textFor(variant.title, syntax.id)}</h2>
            <span className="ng-rt-step">
              <button type="button" className="ng-rt-icon" aria-label={ui.shared.prevTask} disabled={position <= 0} onClick={() => openTask(tasks[position - 1].id)}>◀</button>
              <button type="button" className="ng-rt-icon" aria-label={ui.shared.nextTask} disabled={position >= tasks.length - 1} onClick={() => openTask(tasks[position + 1].id)}>▶</button>
            </span>
            {/* The exercise switch and «⋯» end the task bar (repair: Fable). */}
            <span className="ng-rt-bar-end">
              {exerciseSwitch}
              <MoreMenu items={menu} disclosureHost={disclosureHost} className="ng-rt-more" />
            </span>
          </div>
          {/* The address row takes room only when it has something to say (its polite line stays mounted). */}
          <AddressRow generated={generated} busy={building === 'other'} notice={addressNotice}
            variants={task.record.variants.length > 1 ? (
              <Segmented label={ui.shared.variant} value={variantId} onChange={chooseVariant} className="ng-rt-variants"
                options={task.record.variants.map(v => ({ value: v.id, label: `${v.code} · ${ui.shared.variants[v.id] ?? v.id}`, title: textFor(v.title, syntax.id) }))} />
            ) : null} />
          <div ref={colsRef} className="ng-rt-cols">
            {/* Round 5 (R5): the task, its failure case and the legend head the diagram's column, so the
                work column starts under the task bar and its first route and «Перевірити» fit the first view;
                in one column the order is as before (task, legend, diagram, work). */}
            <div className="ng-rt-left">
              <p className="ng-rt-desc">{detailsShut ? taskParts.first : taskText}</p>
              {full ? (
                <div id={fullId} className="ng-rt-full" hidden={!fullShown}>
                  {fullShown && <><p>{full}</p>{failover && <p className="ng-rt-failover">{ui.shared.failover(failover.title)}</p>}</>}
                </div>
              ) : failover && !detailsShut && <p className="ng-rt-desc ng-rt-failover">{ui.shared.failover(failover.title)}</p>}
              <div className="ng-rt-asides">
                {/* A task with `details` starts its legend folded too, like the rest of its condition: the diagram keeps its room. */}
                <Legend task={task} syntax={syntax.id} routers={routerNames} short={short || crowded === ex.key || Boolean(full)} />
                {full && (
                  <button type="button" className="ng-rt-link ng-rt-details" aria-expanded={fullShown} aria-controls={fullId}
                    onClick={() => setFullOpen(o => ({ ...o, [ex.key]: !fullShown }))}>
                    {fullShown ? ui.shared.detailsShut : comprehension.fullCondition}
                  </button>
                )}
                {!full && details[ex.key] !== undefined && (
                  <button type="button" className="ng-rt-link ng-rt-details" aria-expanded={!detailsShut} onClick={() => setDetails(d => ({ ...d, [ex.key]: !detailsShut }))}>
                    {detailsShut ? ui.shared.detailsOpen : ui.shared.detailsShut}
                  </button>
                )}
              </div>
              <section className="ng-rt-stage" aria-label={ui.shared.diagramLabel}>
                <div className="ng-rt-stage-head">
                  <p className="ng-rt-caption">{ui.shared.diagramCaption}</p>
                  {drawnPath && cv.overlay === null && <PathLegend />}
                  {/* Round 6 (P2): «Розгорнути схему» on a phone, at the stage's head (no row of its own). */}
                  <ExpandButton expand={expand} className="ng-rt-expand" />
                </div>
                <DiagramExpand expand={expand}>
                <TopologyMap
                  ref={mapRef}
                  topo={topo} activeRouter={router} setActiveRouter={selectRouter} fitHeight={layout !== 'narrow'}
                  viewKey={ex.key} zoom={expand.zoom} onZoom={expand.onZoom}
                  covered={expand.covered(cv.overlay === 'text')} fit={lapPlay.playing}
                  underlay={<><PathUnder plan={plan} step={step} ids={markers} /><LapUnder frame={lapNow} ids={markers} /></>}
                  overlay={<><PathOver plan={plan} step={step} solved={presented?.ok && !lapShown ? solvedMarks(geo) : null} /><LapOver frame={lapNow} /></>}
                  overlays={<TextEquivalent id="ng-rt-text" title={ui.shared.textTitle} sections={textSections} open={expand.covered(cv.overlay === 'text')} onClose={closeOverlay} />}
                >
                  <TextEquivalentButton buttonRef={textButton} id="ng-rt-text" label={ui.shared.textButton} open={cv.overlay === 'text'} onToggle={toggleText} count={lineCount(textSections)} />
                </TopologyMap>
                </DiagramExpand>
              </section>
            </div>

            <section className="ng-rt-work" aria-label={ui.shared.rowsCaption(router)}>
              <InterfacesCard task={task} syntax={syntax} router={router} colour={routerClass(routerNames, router)} />
              {/* Round 5 (R1): the action line, under the router's addresses and above the routes (or the panel, when a long board puts it first). */}
              {acting && <ActionLine>{panelFirst ? ui.shared.actionBelow : ui.shared.action}</ActionLine>}
              {/* Round 5 5b-2 (A): the folded worked example, directly under the action line (same condition). */}
              {acting && (
                <WorkedExample taskKey={`${ex.key}|${syntax.id}`} context={example.context} rows={example.rows} note={example.note ?? undefined}
                  head={[...ui.shared.exampleHead[syntax.id], ...(backupExample ? [ui.shared.exampleDistance] : [])]} />
              )}
              {mine
                ? <RouteRows ex={ex} answers={answers} syntax={syntax} router={router} onNetwork={runNetworkCheck} onBlurCheck={blurCheck}
                    target={shownTarget} evidenceKey={evidence?.key ?? null} headEvidence={Boolean(evidence?.head)}
                    boardRef={boardRef} head={mineToggle} />
                : <div ref={boardRef}><ReferenceRows ex={ex} syntax={syntax} router={router} colour={routerClass(routerNames, router)} head={mineToggle} /></div>}
              {help}
              <div ref={disclosureHost} className="ng-rt-disclosures" />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
