// «Знайди несправність» (RF-1, spec v1 §1 and §7 with v2 A1–A5): a routing
// task whose every route is filled in, with exactly one thing broken. The
// student reads the pings, traces them on the diagram, fixes the routes,
// then names what was wrong. Logic: logic/faults-exercise.js and its
// section-owned transitions, logic/faults-state.js; this file only shows
// them.
//
// One decision at a time (round 3 simplicity rule). The diagram on the left
// (it sticks while the page scrolls, in two columns); the work panel on the
// right, in the order of the work (round 4 spec R2 with v2):
//   - the routes: the selected router's rows with the free mode's controls
//     (RouteRows' FreeRow: fields, «✕», «+ Маршрут»), one router at a time,
//     chosen on the diagram or with the buttons under it. A row the learner
//     changed says what it «було», an added one «новий рядок», a removed
//     one is listed «видалено» (differences against the original table;
//     nothing points at the planted fault). «Початкова таблиця» opens the
//     original read-only. Solved, the rows are read-only;
//   - the pings: one line per failing ping («LAN1 → LAN3 ✗ не проходить,
//     зупинився на R2»), the working ones folded («ще N проходять»). After a
//     check a small «на початку / зараз» switch in the block shows either
//     snapshot. A tap draws a ping's request and reply on the diagram
//     (PathLayer) and shows its walk in words under it, as often as wanted:
//     no attempt, nothing counted. Editing never recomputes it (A5);
//   - the cause question («Що було не так?»), once a fix passes, in the
//     help panel's place: the logic's options in their order. It stands only
//     while the fields show the routes that passed: an edit, or a syntax
//     switch showing other or unfinished text, closes it;
//   - the help panel (HelpPanel, stepKey fix → cause): «Перевірити» judges
//     the fix first (form errors marked on their rows, else the first
//     failing ping's stop, else one blocking safety finding), then the
//     cause; the hints (rung 1 reads the stop on screen, rung 3 the worked
//     example marks the instance assisted), «Показати відповідь» (the
//     cause, the one changed route before → after, the pings before and
//     after it, each traceable), and «Далі →» (the next level the logic
//     offers, staying at the last), primary once solved. A wrong cause after
//     a passing repair: «Ремонт правильний — залиш його. Причина була
//     інша.» The verdict stays, «до змін», after an edit.
//   - what the message is about carries data-evidence: the cause question
//     in its step, a marked row after a form error, else the first failing
//     ping on screen.
// Round 5 (R1): one action line above the current step's first control:
// the table while fixing, the cause question in the cause step; none once
// solved. Placeholders are symbols (RouteRows placeholderOf).
// The level switch shows a quiet ✓ (DoneMark) on a level solved without a
// reveal before it (view.earned).
//
// The instance is the logic's (level, seed) in the store's 'routing-faults'
// place; its work (the table, its text per syntax, the section state) is the
// instance's view in the store, so it survives leaving the section. The
// bank is bound in a stable logic adapter, so useExercise's params stay
// small. The syntax is the bar's preference: switching keeps the table, its
// marks and an open cause question.
//
// Leaks (spec §6, A4): before the reveal nothing names the fault. The rows
// are the public task's, with its neutral ids; the cause options appear only
// after a passing fix and carry no value in the DOM; the ping list follows
// the probes' order; hints 1–2 come from the logic.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import faults, { eligibleVariants, parseAnswer } from '../logic/faults-exercise.js';
import * as S from '../logic/faults-state.js';
import { levelCodes, routeKey } from '../logic/faults.js';
import { diagramTopology } from './diagramTopology.js';
import { probeLabel } from '../syntax/presentation.js';
import { syntaxList, syntaxes } from '../syntax/index.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePref, useStore } from '../../../ui/useStore.js';
import { useNav } from '../../../ui/useNav.js';
import Button from '../../../ui/components/Button.jsx';
import { BarControls, SheetCaption, SheetChoice } from '../../../ui/BarSlot.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import DoneMark from '../../../ui/components/DoneMark.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import DiagramExpand, { ExpandButton, useDiagramExpand, useTextOpen } from '../../../ui/topology/DiagramExpand.jsx';
import { isPhoneNow } from '../../../ui/phone.js';
import { describeNetwork } from '../../../ui/topology/describe.js';
import { uk as generic } from '../../../ui/uk.js';
import { useReducedMotion } from '../../../ui/motion.js';
import { diagramGeometry, NETGYM_DIAGRAM_FONT } from '../../../ui/topology/geometry.js';
import TopologyMap from './TopologyMap.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import { FreeRow } from './RouteRows.jsx';
import { PathLegend, PathOver, PathUnder, usePathStep } from './PathLayer.jsx';
import { planPath } from './pathPlan.js';
import { routerClass } from './theme.js';
import { fieldsOfCode } from './useRouteAnswers.js';
import { hasText } from './rowCheck.js';
import { useLayoutMode, useStageHeight } from './layoutMode.js';
import { fieldsAnswer, initialRows, marksOf, nextLevel, routeAfterEdit, rowValues, sameValues, usesDistance } from './faultsRows.js';
import { comprehension, faultText, faultsUi, ui } from '../uk.js';
import '../../../ui/tokens.css';
import './routing.css';
import './faults.css';

const SCOPE = 'routing-faults';
const HINTS = 3;
const TEXT_ID = 'ng-rf-text';
const can = fn => { try { fn(); return true; } catch { return false; } };

/** The levels the logic offers for this record and bank, in order. */
export function levelsOf(record, bank) {
  return Object.keys(levelCodes).map(Number).sort((a, b) => a - b)
    .filter(level => eligibleVariants(record, bank, level).length > 0);
}

/** A seed the logic builds at `level`, other than `previous`: random first, then the first that works. */
export function pickSeed(record, bank, level, previous = null, random = Math.random) {
  const builds = seed => seed !== previous && can(() => faults.create(record, { bank, level, seed }));
  for (let i = 0; i < 20; i++) {
    const seed = Math.floor(random() * 10000);
    if (builds(seed)) return seed;
  }
  for (let seed = 0; seed < 10000; seed++) if (builds(seed)) return seed;
  throw new RangeError('no-seed');
}

/** True when a place names an instance. */
export const hasSlot = place => Number.isInteger(place?.level) && Number.isInteger(place?.seed);

/** How long a new instance waits before it is built, so «Готую задачу…» is
 * painted first (as the task screen's «Інші адреси», BUILD_DELAY there). */
export const BUILD_DELAY = 40;

/** The router a whole-network finding names (coverage, the internet, a
 * loop), from the logic's public finding params, or null. */
export function findingRouter(result, routers) {
  const params = result?.findings?.[0]?.params ?? {};
  const named = [params.router, params.repairRouter, ...(params.missing ?? []).map(m => m.deviceId), ...(params.cycle ?? [])];
  return named.find(id => routers.includes(id)) ?? null;
}

/** A value kept for one instance: another instance starts from `initial`. */
function useInstanceState(key, initial) {
  const [box, setBox] = useState({ key, value: initial });
  const value = box.key === key ? box.value : initial;
  const set = next => setBox(b => ({ key, value: typeof next === 'function' ? next(b.key === key ? b.value : initial) : next }));
  return [value, set];
}

/** A verdict's tone: «Так» for a fix that passes (asking or answering the cause), else «Ще ні». */
const toneOf = result => (result.fixOk && !['fault-cause-other', 'invalid-cause'].includes(result.code) ? 'ok' : 'no');

/** A route as the student would type it (distance 1 left out). */
const commandOf = (syntax, route) => syntax.command({ dst: route.dst, prefix: route.prefix,
  ...(route.discard === true ? { discard: true } : { via: route.via }), ...(route.distance > 1 ? { distance: route.distance } : {}) });

/**
 * The exercise's frame: the bar's controls, the heading with the levels, the
 * task sentence with the exercise switch, and the instance's work (below).
 * A new instance can take seconds to build (the four-router network): the
 * frame says «Готую задачу…» and builds it after a paint; the old instance
 * stays meanwhile. Another request replaces one under way; leaving the
 * exercise cancels it. The switch stays mounted throughout, so focus on it
 * survives the first build.
 * @param {{ bank: { bankId: string, bankRevision: number, tasks: object[], faults: object }, exerciseSwitch?: any }} props
 */
export default function FaultsView({ bank, exerciseSwitch = null }) {
  const record = bank.faults;
  const { state, dispatch } = useStore();
  const [syntaxId, setSyntax] = usePref('syntax');
  const [themeName] = usePref('theme');
  const syntax = syntaxes[syntaxId] ?? syntaxes.cisco;
  const root = useRef(null);
  const layout = useLayoutMode(root);
  const levels = useMemo(() => levelsOf(record, bank), [record, bank]);
  const stored = state.places[SCOPE];
  const slot = hasSlot(stored) ? stored : null;

  const [building, setBuilding] = useState(null);
  const timer = useRef(null);
  // «Ще одна» moves focus to the new instance's pings once it is shown.
  const focusNew = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  function build(level, { focus = false } = {}) {
    clearTimeout(timer.current);
    const previous = slot?.seed ?? null;
    setBuilding({ level });
    timer.current = setTimeout(() => {
      timer.current = null;
      let seed = null;
      try { seed = pickSeed(record, bank, level, previous); } catch { /* nothing the logic builds there: stay */ }
      if (seed !== null) {
        focusNew.current = focus;
        dispatch({ type: 'place', scope: SCOPE, patch: { level, seed } });
      }
      setBuilding(null);
    }, BUILD_DELAY);
  }
  // The first opening: the first level the logic offers.
  useEffect(() => { if (!slot && levels.length) build(levels[0]); }, [Boolean(slot)]);
  const shownLevel = building?.level ?? slot?.level ?? levels[0];
  // A level's quiet ✓ (A5): any of its instances solved without a reveal before it.
  const earnedLevels = new Set(Object.entries(state.instances).flatMap(([key, instance]) => {
    if (instance?.view?.earned !== true) return [];
    try { const id = JSON.parse(key); return id?.exerciseId === faults.id && Number.isInteger(id.level) ? [id.level] : []; } catch { return []; }
  }));
  // «Ще одна»: the next level the logic offers, staying at the last. A level
  // is picked on its switch, which keeps focus (arrow keys move on).
  const onAgain = () => { if (slot && !building) build(nextLevel(slot.level, levels), { focus: true }); };
  const chooseLevel = level => { if (level !== shownLevel) build(level); };

  return (
    <div ref={root} className="ng-rt ng-rf" data-theme={themeName} data-mode={layout}>
      <BarControls>
        <div className="ng-rt-controls">
          <SheetCaption label={ui.shared.syntax} />
          <Segmented label={ui.shared.syntax} options={syntaxList.map(x => ({ value: x.id, label: x.label }))} value={syntax.id} onChange={setSyntax} />
        </div>
      </BarControls>

      <main className="ng-rt-main">
        <div className="ng-rt-taskbar">
          <h1 className="ng-rt-h1">{ui.shared.heading}</h1>
          {levels.length > 1 && (
            <SheetChoice stepper label={faultsUi.level} value={shownLevel} onChange={chooseLevel} className="ng-rf-levels"
              options={levels.map(level => ({ value: level, label: <>{faultsUi.levelN(level)}<DoneMark done={earnedLevels.has(level)} /></>, step: faultsUi.levelN(level) }))} />
          )}
          <p className="ng-rf-busy" aria-live="polite">{building ? faultsUi.preparing : ''}</p>
          {/* Round 5: the exercise switch ends the task bar, as on «Налаштуй маршрути». */}
          <span className="ng-rt-bar-end">{exerciseSwitch}</span>
        </div>
        {slot && (
          <FaultsWork bank={bank} record={record} slot={slot} syntax={syntax} layout={layout} root={root}
            building={Boolean(building)} onAgain={onAgain} focusNew={focusNew} />
        )}
      </main>
    </div>
  );
}

/** One instance's work: the conditions, the diagram, the pings, the routes,
 * the help and the check. */
function FaultsWork({ bank, record, slot, syntax, layout, root, building, onAgain, focusNew }) {
  const nav = useNav();
  // The bank stays out of useExercise's params (it serialises them): a stable
  // adapter binds it. Only `create` is used: checks, hints and the reveal go
  // through the section's own transitions (logic/faults-state.js), and the
  // shared session is never marked revealed.
  const logic = useMemo(() => ({
    id: faults.id, version: faults.version,
    create: (rec, params) => faults.create(rec, { ...params, bank }),
  }), [bank]);
  const ex = useExercise(logic, record, { level: slot.level, seed: slot.seed });
  const { task, view } = ex;

  // The section state (logic/faults-state.js) and the table, from the instance's view.
  const initial = useMemo(() => S.initialState(task), [task]);
  const rf = view.rf ?? initial;
  const rows = useMemo(() => view.rows ?? initialRows(task), [view.rows, task]);
  const drafts = view.drafts ?? {};
  const marks = view.marks ?? {};
  const routers = useMemo(() => task.network.devices.filter(d => d.kind === 'router').map(d => d.id), [task]);
  const router = routers.includes(view.router) ? view.router : routers[0];
  const needDist = useMemo(() => usesDistance(task), [task]);
  const requirements = Array.isArray(task.requirements) ? task.requirements.filter(Boolean) : [];
  const done = rf.step === 'done';
  const finished = done || Boolean(rf.reveal) || view.solved === true;
  // The fields on screen, in the active syntax: what a check takes. Solved,
  // the rows are read-only and show the routes that passed.
  const displayed = useMemo(() => fieldsAnswer(rows, done ? {} : drafts, syntax), [rows, drafts, done, syntax]);

  // A passing fix's proof lives only in memory (handoff: never restored from
  // the store): a cause question shown again after leaving the section
  // rechecks the same routes once.
  const causeStep = rf.step === 'cause' || done;
  const liveResult = useMemo(() => {
    if (!causeStep || !rf.result) return rf.result;
    if (faults.options(task, 'cause', { result: rf.result, answer: rf.answer, syntax: syntax.id }).length) return rf.result;
    const again = faults.check(task, { ...rf.answer, cause: null }, { step: 'fix', syntax: syntax.id });
    return again.fixOk ? again : rf.result;
  }, [task, causeStep, rf.result, rf.answer, syntax.id]);
  const options = useMemo(() => (causeStep ? faults.options(task, 'cause', { result: liveResult, answer: rf.answer, syntax: syntax.id }) : []),
    [causeStep, task, liveResult, rf.answer, syntax.id]);
  // The cause question stands only on the routes the passing fix proved, as
  // the fields show them now: a syntax switch that shows other or unfinished
  // text (a draft left in that syntax) closes it, as an edit does.
  const shownProven = useMemo(() => {
    if (rf.step !== 'cause' || !rf.answer?.routes) return true;
    const parsed = parseAnswer(task, displayed.answer, syntax.id);
    return !parsed.findings.length && routeKey(parsed.routes) === routeKey(rf.answer.routes);
  }, [task, rf.step, rf.answer, displayed, syntax.id]);
  useEffect(() => { if (!shownProven) ex.setView({ rf: S.edit(rf, displayed.answer) }); }, [shownProven]);

  // The snapshots: the start, the last check, and the reveal's before and after.
  const checkedOnce = (view.checks ?? 0) > 0;
  const [listChoice, setListChoice] = useInstanceState(ex.key, 'checked');
  // The pings block shows the start, the last check («зараз») or, once revealed, the network after the fix.
  const snapChoices = ['original', ...(checkedOnce ? ['checked'] : []), ...(rf.reveal ? ['after'] : [])];
  const listSnap = snapChoices.includes(listChoice) ? listChoice : checkedOnce ? 'checked' : 'original';
  const snaps = { original: rf.original, checked: rf.snapshot, ...(rf.reveal ? { before: rf.reveal.before.snapshot, after: rf.reveal.after.snapshot } : {}) };
  const where = { original: faultText.initial, checked: faultText.checked, before: faultsUi.sides.before, after: faultsUi.sides.after };
  // Round 5 5b-2 (spec C): the pings name the internet as «Інтернет (ISP)», where they go and where they stop.
  const labelOf = row => probeLabel(task.network, row.from, row.to, { internet: comprehension.internet });

  const colsRef = useRef(null);
  // The help panel's board (HelpPanel `boardRef`): the element it sits right
  // after, by what the verdict is about. The table for a row's form error or
  // the table's heading, so in a long table the panel anchors right after
  // the flagged row; the pings when a failing ping is the evidence (the panel
  // after them, as before); the cause question in the cause step. A getter,
  // so HelpPanel reads the element committed with this render's evidence.
  const tableRef = useRef(null);
  const pingsRef = useRef(null);
  const boardPick = useRef('ping');
  const boardRef = useMemo(() => ({
    get current() {
      const k = boardPick.current;
      return (k === 'causes' ? causeRef.current : k === 'ping' ? pingsRef.current : tableRef.current) ?? tableRef.current;
    },
  }), []);
  useStageHeight(colsRef, layout);

  // A ping's path on demand: { snap, id, n } (n replays it).
  const [pick, setPick] = useInstanceState(ex.key, null);
  const pickedRow = pick ? snaps[pick.snap]?.rows.find(r => r.id === pick.id) ?? null : null;
  // The cloud says «Інтернет (ISP)», the word of the pings and the walk (round 5 5b-2).
  const topo = useMemo(() => diagramTopology(task.network, syntax.id, { internet: comprehension.internet }), [task, syntax.id]);
  const geo = useMemo(() => diagramGeometry(topo, topo, undefined, NETGYM_DIAGRAM_FONT), [topo]);
  const trace = useMemo(() => (pickedRow ? faults.traceFor(task, pickedRow, syntax.id) : null), [task, pickedRow, syntax.id]);
  const walk = useMemo(() => (pickedRow ? faults.describeTrace(task, pickedRow, syntax.id) : []), [task, pickedRow, syntax.id]);
  const plan = useMemo(() => (trace ? planPath(geo, task.network, syntax.id, trace,
    { from: pickedRow.from, to: pickedRow.to, repairRouter: trace.ringAt ?? null, failed: !pickedRow.ok }) : null), [geo, task, syntax.id, trace, pickedRow]);
  const reduced = useReducedMotion();
  const mapRef = useRef(null);
  const centre = point => { if (point) mapRef.current?.centreOn(point, { ifHidden: true }); };
  const playKey = pick ? `${ex.key}|${pick.snap}|${pick.id}|${pick.n}` : null;
  const step = usePathStep(plan, playKey, reduced, move => centre(move.target), centre);
  const markerIds = useId().replace(/:/g, '');
  const markers = { request: `${markerIds}-req`, reply: `${markerIds}-rep` };
  // A tap draws the path (its walk in words under the ping); in one column
  // the diagram comes into view if it isn't.
  const showPath = (snap, id) => {
    setPick(p => ({ snap, id, n: (p?.n ?? 0) + 1 }));
    // Round 6: on a phone «Текстом» takes the drawing's place; a path asked for shows on the drawing.
    if (isPhoneNow()) setTextOpen(false);
    if (layout === 'narrow') root.current?.querySelector('.ng-dg-view')?.scrollIntoView?.({ block: 'nearest' });
  };

  // Round 6 (P2): «Текстом» starts open on a phone; the full-screen diagram has a zoom of its own.
  const [textOpen, setTextOpen] = useTextOpen(false);   // closed on a phone (round 6 repair: the first action's facts are on the screen)
  const expand = useDiagramExpand({ zoom: view.zoom, onZoom: zoom => ex.setView({ zoom }) });
  const textButton = useRef(null);
  const described = useMemo(() => describeNetwork(task.network, syntax.id), [task, syntax.id]);
  const textSections = [...described,
    { heading: `${faultsUi.pings} · ${where[listSnap]}`, items: snaps[listSnap].rows.map(r => `${labelOf(r)}: ${r.ok ? faultsUi.works : faultsUi.fails}`) },
    ...(pickedRow ? [{ heading: faultsUi.pathOf(labelOf(pickedRow), where[pick.snap]), items: walk }] : [])];

  // ── The table, edited with the free mode's rows ──
  const items = (rows[router] ?? []).map((row, i) => ({ kind: 'route', router, n: i + 1, key: row.id, route: row.route, needDist }));
  const rowOf = item => (rows[item.router] ?? []).find(r => r.id === item.key) ?? { route: null };
  /** Every change to the table: the section's edit transition (closes the cause question). */
  function changeTable(nextRows, nextDrafts = drafts, nextMarks = marks, extra = {}) {
    const next = S.edit(rf, fieldsAnswer(nextRows, nextDrafts, syntax).answer);
    ex.setView({ rows: nextRows, drafts: nextDrafts, marks: nextMarks, rf: next, ...extra });
  }
  const answers = {
    valuesOf: item => rowValues(rowOf(item), done ? undefined : drafts[item.key], syntax),
    noteOf(item) {
      const draft = done ? null : drafts[item.key];
      if (!draft || draft.syntax === syntax.id || !hasText(draft.values)) return null;
      const theirs = syntaxes[draft.syntax];
      return theirs && !theirs.toRoute(draft.values) ? theirs.label : null;
    },
    formErrorOf(item) {
      const mark = marks[item.key];
      if (done || !mark || mark.syntax !== syntax.id) return null;
      const values = answers.valuesOf(item);
      return sameValues(values, mark.values) ? { code: mark.code, fields: fieldsOfCode(mark.code, syntax, values) } : null;
    },
    edit(item, name, value) {
      if (done) return;
      const values = { ...answers.valuesOf(item), [name]: name === 'blackhole' ? value === true : syntax.filterInput(value) };
      const nextRows = { ...rows, [item.router]: rows[item.router].map(r => (r.id === item.key ? { ...r, route: routeAfterEdit(r, syntax, values) } : r)) };
      changeTable(nextRows, { ...drafts, [item.key]: { syntax: syntax.id, values } });
    },
    removeRoute(item) {
      if (done) return;
      const { [item.key]: _draft, ...restDrafts } = drafts;
      const { [item.key]: _mark, ...restMarks } = marks;
      changeTable({ ...rows, [item.router]: rows[item.router].filter(r => r.id !== item.key) }, restDrafts, restMarks);
    },
  };
  // «+ Маршрут»: a new empty row (a neutral id), its first field focused.
  const lastInput = useRef(null);
  const added = useRef(false);
  useEffect(() => {
    if (!added.current) return;
    added.current = false;
    lastInput.current?.focus();
  });
  function addRow() {
    const serial = (view.serial ?? 0) + 1;
    added.current = true;
    changeTable({ ...rows, [router]: [...(rows[router] ?? []), { id: `new-${serial}`, route: null }] }, drafts, marks, { serial });
  }
  const selectRouter = name => { if (name && routers.includes(name) && name !== router) ex.setView({ router: name }); };

  // ── «Перевірити»: the fix first, then the cause ──
  const causeRef = useRef(null);
  const focusCause = useRef(false);
  useEffect(() => {
    if (!focusCause.current) return;
    focusCause.current = false;
    causeRef.current?.querySelector('input')?.focus();
  });
  // After a check that opens another router for its form error, focus goes
  // to the first marked field there (its error is in its description).
  const focusInvalid = useRef(false);
  useEffect(() => {
    if (!focusInvalid.current) return;
    focusInvalid.current = false;
    root.current?.querySelector('.ng-rf-rowlist [aria-invalid="true"]')?.focus();
  });
  function onCheck() {
    if (done) return;
    const checks = (view.checks ?? 0) + 1;
    let next, nextMarks = marks;
    // The cause is judged only on the proven routes as shown; anything else checks the fix again.
    if (rf.step === 'cause' && shownProven) next = S.submit(task, { ...rf, result: liveResult }, { syntax: syntax.id });
    else {
      const built = displayed;
      next = S.submit(task, { ...rf, answer: built.answer, step: 'fix' }, { syntax: syntax.id });
      // A passing fix's routes, neutral: the cause question then works in either syntax.
      if (next.result.fixOk) next = { ...next, answer: { routes: parseAnswer(task, built.answer, syntax.id).routes, cause: null } };
      nextMarks = marksOf(next.result, built.used, syntax.id);
      if (next.step === 'cause') focusCause.current = true;
    }
    // A form error on another router opens it (the fix belongs there).
    const marked = routers.find(r => (rows[r] ?? []).some(row => nextMarks[row.id]));
    const elsewhere = marked && !(rows[router] ?? []).some(row => nextMarks[row.id]);
    if (elsewhere) focusInvalid.current = true;
    const failing = !next.result.fixOk && next.result.code !== 'form-errors' ? next.snapshot.rows.find(r => !r.ok) : null;
    // Every ping passes but a whole-network finding blocks (coverage, the
    // internet, a loop): the table of the router it names is the evidence.
    const implicated = !next.result.fixOk && next.result.code !== 'form-errors' && !failing ? findingRouter(next.result, routers) : null;
    const solvedNow = next.step === 'done' && view.solved !== true;
    // The verdict stays (dimmed, «до змін») after an edit, which clears the logic's result.
    const told = { tone: toneOf(next.result), words: faults.feedback(task, next.result, syntax.id), done: next.step === 'done' };
    ex.setView({ rf: next, marks: nextMarks, checks, verdict: told, checkedRows: JSON.stringify(displayed.answer), solved: view.solved === true || next.step === 'done',
      // A level's ✓ (A5): solved without a reveal before it.
      ...(solvedNow ? { earned: !rf.reveal } : {}), ...(elsewhere ? { router: marked } : implicated && implicated !== router ? { router: implicated } : {}) });
    setListChoice('checked');
    setPick(p => (failing ? { snap: 'checked', id: failing.id, n: (p?.n ?? 0) + 1 } : null));
  }
  function chooseCause(value) {
    if (rf.step !== 'cause') return;
    ex.setView({ rf: S.chooseCause(task, { ...rf, result: liveResult }, value, { syntax: syntax.id }) });
  }
  const result = rf.result;
  const words = result ? faults.feedback(task, result, syntax.id) : null;
  const tone = result ? toneOf(result) : null;

  // ── Hints, the reveal, the next instance ──
  // Hint 2 reads the pings on screen and says which snapshot it read; rung 3
  // keeps that evidence. The stored last-check snapshot is never replaced.
  // Round 4 2a: rung 1 holds the stop evidence, so its snapshot prefix goes there.
  const fullHints = Array.from({ length: HINTS }, (_, i) => {
    const text = rf.hints?.[i]?.text ?? '';
    return i === 0 && text && view.hintSnap ? `${faultsUi.hintFrom(where[view.hintSnap])}${text}` : text;
  });
  function moreHint() {
    if (rf.hintRung >= HINTS) return;
    const rung = rf.hintRung + 1, from = rung === 1 ? listSnap : view.hintSnap ?? listSnap;
    const next = S.showHint(task, { ...rf, snapshot: snaps[from] }, rung);
    ex.setView({ rf: { ...next, snapshot: rf.snapshot }, ...(rung === 1 ? { hintSnap: from } : {}) });
  }
  const onReveal = () => { ex.setView({ rf: S.reveal(task, rf) }); };
  const pingsHead = useRef(null);
  // «Ще одна» goes with the instance it ends: focus moves to the new pings.
  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    // «Далі»: the new table's first field.
    root.current?.querySelector('.ng-rf-rowlist input')?.focus();
  }, [ex.key]);

  const radioName = `ng-rf-cause-${useId().replace(/:/g, '')}`;
  const pathWhere = pickedRow ? faultsUi.pathOf(labelOf(pickedRow), where[pick.snap]) : null;
  // Where a failing ping stops, in words: «зупинився на R2»; at the provider, «пішов в Інтернет (ISP)», the cloud's word.
  const stopWords = (id, reply) => {
    const device = task.network.devices.find(d => d.id === id);
    return device?.kind === 'isp' ? faultsUi.pingToInternet(comprehension.internet, reply) : faultsUi.pingStop(device?.name ?? id, reply);
  };

  // ── The help panel (round 4 spec R2): the repair check, then the cause in
  // the same place (stepKey); «Далі →» once solved ──
  const told = view.verdict ?? (result && words ? { tone, words, done } : null);
  const verdict = told ? {
    tone: told.tone === 'ok' ? 'ok' : 'no',
    // A passing repair that asks the cause is a part; the cause answered, the task.
    scope: told.done ? 'task' : 'part',
    summary: String(told.words),
    stamp: view.checks ?? 0,
  } : null;
  // Edited since that check: the cause question closes, the verdict is «до змін».
  const stale = Boolean(verdict) && !done && view.checkedRows !== undefined && JSON.stringify(displayed.answer) !== view.checkedRows;
  const hintTexts = fullHints;
  // What the message is about (data-evidence): the cause question in the
  // cause step and after; a marked row after a form error; else the first
  // failing ping in the list on screen (the evidence the hints read).
  const formRow = Object.keys(marks).find(id => (rows[router] ?? []).some(r => r.id === id)) ?? null;
  const shownSnapEarly = snaps[listSnap];
  const evidenceOf = causeStep && options.length ? 'causes' : formRow && result?.code === 'form-errors' ? 'row'
    : result && !result.fixOk && result.code !== 'form-errors' && !shownSnapEarly.rows.some(r => !r.ok) && listSnap === 'checked' ? 'table' : 'ping';
  const shownSnap = snaps[listSnap];
  const failingPing = shownSnap.rows.find(r => !r.ok) ?? null;

  // The learner's edits against the original table (spec R2 v2): «було» on
  // a changed row, «новий рядок» on an added one, «видалено» for a removed one.
  const originalRows = useMemo(() => initialRows(task), [task]);
  const originalOf = id => (originalRows[router] ?? []).find(r => r.id === id) ?? null;
  const diffOf = item => {
    const before = originalOf(item.key);
    if (!before) return <p className="ng-rf-diff is-new">{faultsUi.diffNew}</p>;
    const now = syntax.toRoute(answers.valuesOf(item));
    if (!before.route || (now && commandOf(syntax, now) === commandOf(syntax, before.route))) return null;
    if (!now && !hasText(answers.valuesOf(item))) return null;
    return <p className="ng-rf-diff is-was"><span className="ng-rf-diff-tag">{faultsUi.diffWas}</span> <code>{commandOf(syntax, before.route)}</code></p>;
  };
  const removed = (originalRows[router] ?? []).filter(r => r.route && !(rows[router] ?? []).some(x => x.id === r.id));
  const [originalOpen, setOriginalOpen] = useInstanceState(ex.key, false);
  const originalId = `ng-rf-original-${useId().replace(/:/g, '')}`;
  const originalRef = useRef(null);
  useEffect(() => { if (originalOpen) originalRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [originalOpen]);

  const help = (
    <HelpPanel
      taskKey={ex.key}
      stepKey={causeStep ? 'cause' : 'fix'}
      className="ng-rf-help"
      boardRef={boardRef}
      check={done ? null : { onCheck }}
      verdict={verdict}
      stale={stale}
      hints={{ texts: hintTexts, shown: Math.min(rf.hintRung, hintTexts.length), onMore: moreHint }}
      reveal={{ revealed: Boolean(rf.reveal), onReveal, render: () => <FaultReveal reveal={rf.reveal} syntax={syntax} /> }}
      next={{ onNext: onAgain, ready: done, label: building ? faultsUi.preparing : undefined }}
    />
  );

  // The pings: before the panel while fixing (the failing ping is the
  // evidence); after it in the cause step (the cause question is).
  boardPick.current = evidenceOf;
  // Round 7: how a fault is checked from a PC, in «Перевірка мережі» («Де зламалось»), when the target has it.
  const checksLink = nav?.has('checks')
    ? <p className="ng-rf-checks-link"><Button variant="quiet" onClick={() => nav.go({ section: 'checks', params: { ex: 'ladder' } })}>{faultsUi.checksLink}</Button></p> : null;
  const pings = (
          <PingList key={`${ex.key}|${listSnap}`} snapshot={shownSnap} labelOf={labelOf} stopWords={stopWords} headRef={pingsHead}
            heading={checkedOnce ? faultsUi.pings : `${faultsUi.pings} · ${where[listSnap]}`}
            choice={snapChoices.length > 1 ? (
              <Segmented label={faultsUi.snapshots} value={listSnap} onChange={setListChoice} className="ng-rf-snaps"
                options={snapChoices.map(value => ({ value, label: value === 'checked' ? faultsUi.snapsNow : where[value] }))} />
            ) : null}
            note={listSnap === 'checked' && rf.snapshot.invalid ? faultsUi.notApplied : !pick ? faultsUi.pick : null}
            evidence={evidenceOf === 'ping' ? failingPing?.id ?? null : null} sectionRef={pingsRef}
            picked={pick?.snap === listSnap ? pick.id : null} walk={walk} onPick={id => showPath(listSnap, id)} />
  );

  return (
    <>
      <div ref={colsRef} className="ng-rt-cols ng-rf-cols">
        {/* Round 5 (R5): the task and its conditions head the diagram's column (as on the task screen),
            so the work column starts under the task bar and «Перевірити» fits the first view. */}
        <div className="ng-rt-left">
          <p className="ng-rt-desc ng-rf-task">{faultText.instructions}</p>
          {requirements.length > 0 && <p className="ng-rf-req"><b>{faultsUi.requirementsLead}</b> {requirements.join(' ')}</p>}
          <section className="ng-rt-stage ng-rf-stage" aria-label={ui.shared.diagramLabel}>
            <div className="ng-rt-stage-head">
              <p className="ng-rt-caption">{pathWhere ?? ui.shared.diagramCaption}</p>
              {plan?.moves.length > 0 && !textOpen && <PathLegend />}
              {/* Round 6 (P2): «Розгорнути схему» on a phone, at the stage's head (no row of its own). */}
              <ExpandButton expand={expand} className="ng-rt-expand" />
            </div>
            <DiagramExpand expand={expand}>
            <TopologyMap
              ref={mapRef}
              topo={topo} activeRouter={router} setActiveRouter={selectRouter} fitHeight={layout !== 'narrow'}
              viewKey={ex.key} zoom={expand.zoom} onZoom={expand.onZoom}
              covered={expand.covered(textOpen)}
              underlay={<PathUnder plan={plan} step={step} ids={markers} />}
              overlay={<PathOver plan={plan} step={step} />}
              overlays={<TextEquivalent id={TEXT_ID} title={ui.shared.textTitle} sections={textSections} open={expand.covered(textOpen)} onClose={() => { setTextOpen(false); textButton.current?.focus(); }} />}
            >
              <TextEquivalentButton buttonRef={textButton} id={TEXT_ID} label={ui.shared.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(textSections)} />
            </TopologyMap>
            </DiagramExpand>
          </section>
        </div>

        <section className="ng-rt-work ng-rf-work" aria-label={faultText.title}>
          {!causeStep && <ActionLine>{faultsUi.action}</ActionLine>}
          <div ref={tableRef} className={`ng-rf-rows ${routerClass(routers, router)}`}>
            {/* A whole-network finding (coverage, the internet) is about this router's table: its heading is the evidence. */}
            <div className="ng-rf-rows-head" {...(evidenceOf === 'table' ? { 'data-evidence': 'current' } : {})}>
              <h2 id="ng-rf-rows-head" className="ng-rt-caption ng-rf-rows-caption">{faultsUi.routes(router)}</h2>
              {routers.length > 1 && <p className="ng-rf-aside">{faultsUi.otherRouters}</p>}
            </div>
            {items.length > 0
              ? (
                <ol className="ng-rt-rowlist ng-rf-rowlist">
                  {items.map((item, i) => (
                    <FreeRow key={item.key} syntax={syntax} answers={answers} item={item} onNetwork={onCheck} readOnly={done} quietHead quietLabels={i > 0}
                      inputRef={i === items.length - 1 ? lastInput : undefined} evidence={evidenceOf === 'row' && item.key === formRow}>
                      {diffOf(item)}
                    </FreeRow>
                  ))}
                </ol>
              )
              : <p className="ng-rt-note">{faultsUi.noRows}</p>}
            {removed.map(r => (
              <p key={r.id} className="ng-rf-diff is-removed"><span className="ng-rf-diff-tag">{faultsUi.diffRemoved}</span> <code>{commandOf(syntax, r.route)}</code></p>
            ))}
            <div className="ng-rf-table-actions">
              {!done && <button type="button" className="ng-rt-btn ng-rt-add" onClick={addRow}>{ui.shared.addRoute}</button>}
              <button type="button" className="ng-rt-link ng-rf-original-toggle" aria-expanded={originalOpen} aria-controls={originalId} onClick={() => setOriginalOpen(o => !o)}>
                {originalOpen ? faultsUi.originalHide : faultsUi.original}
              </button>
            </div>
            {originalOpen && (
              <section ref={originalRef} id={originalId} className="ng-rf-original" aria-label={faultsUi.originalOf(router)}>
                <h3 className="ng-rt-caption">{faultsUi.originalOf(router)}</h3>
                <pre className="ng-rt-pre">{(originalRows[router] ?? []).filter(r => r.route).map(r => commandOf(syntax, r.route)).join('\n') || faultsUi.noRows}</pre>
              </section>
            )}
          </div>
          {/* The pings sit before the panel when a failing ping is what the verdict is about; after it otherwise (the cause step, a row's form error, the table's heading). */}
          {evidenceOf === 'ping' && pings}
          {rf.step === 'cause' && options.length > 0 && <ActionLine>{faultsUi.actionCause}</ActionLine>}
          {causeStep && options.length > 0 && (
            <fieldset ref={causeRef} className="ng-rf-causes" {...(evidenceOf === 'causes' ? { 'data-evidence': 'current' } : {})}>
              <legend className="ng-rf-cause-q">{faultText.cause}</legend>
              {options.map((o, i) => {
                const chosen = rf.answer.cause === o.value;
                return (
                  <label key={i} className={`ng-rf-cause${chosen ? ' is-chosen' : ''}`}>
                    <input type="radio" name={radioName} className="ng-rf-radio" checked={chosen} disabled={done || undefined}
                      onChange={() => chooseCause(o.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCheck(); } }} />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {help}
          {evidenceOf !== 'ping' && pings}
          {/* Last in the column, so it never pushes «Перевірити» out of the first view. */}
          {checksLink}
        </section>
      </div>
    </>
  );
}

/**
 * A ping snapshot: each failing ping one line («LAN-HQ → F2 ✗ не проходить,
 * зупинився на R2»; lost at the provider «пішов в Інтернет (ISP)», round 5 5b-2), working ones folded into «ще N проходять». Each is a
 * button that draws its path; the drawn one says its walk in words under
 * it. `evidence`: the ping the panel's message is about (data-evidence).
 * @param {{ snapshot: { rows: object[] }, labelOf: Function, stopWords: Function, heading?: string|null, choice?: any, note?: string|null,
 *   picked: string|null, walk: string[], onPick: Function, headRef?: object, evidence?: string|null }} props
 */
function PingList({ snapshot, labelOf, stopWords, heading = null, choice = null, note = null, picked, walk, onPick, headRef, evidence = null, sectionRef = null }) {
  const [open, setOpen] = useState(false);
  const foldId = `ng-rf-passing-${useId().replace(/:/g, '')}`;
  const failing = snapshot.rows.filter(r => !r.ok);
  const passing = snapshot.rows.filter(r => r.ok);
  const row = r => <PingRow key={r.id} row={r} label={labelOf(r)} stopWords={stopWords} picked={picked === r.id} walk={walk} onPick={onPick} evidence={evidence === r.id} />;
  return (
    <section ref={sectionRef} className="ng-rf-pings" aria-label={heading ? undefined : faultsUi.pings}>
      {(heading || choice) && (
        <div className="ng-rf-pings-head">
          {heading && <h2 ref={headRef} tabIndex={-1} className="ng-rt-caption ng-rf-pings-caption">{heading}</h2>}
          {choice}
        </div>
      )}
      {note && <p className="ng-rf-note">{note}</p>}
      {/* data-failing: the snapshot's failing pings, the gate's «all» (tools/shots.mjs allOf). */}
      {failing.length > 0 && <ul className="ng-rt-checks-list ng-rf-pinglist" data-failing={snapshot.rows.filter(r => !r.ok).length}>{failing.map(row)}</ul>}
      {passing.length > 0 && (
        <>
          <button type="button" className="ng-rt-btn ng-rf-fold" aria-expanded={open} aria-controls={foldId} onClick={() => setOpen(o => !o)}>
            <span aria-hidden="true">{open ? '▾' : '▸'} </span>{failing.length ? faultsUi.passingFold(passing.length) : faultsUi.allPassingFold(passing.length)}
          </button>
          <ul id={foldId} className="ng-rt-checks-list ng-rf-pinglist" hidden={!open}>{open && passing.map(row)}</ul>
        </>
      )}
    </section>
  );
}

/** One ping, one line: «LAN1 → LAN3 ✗ не проходить, зупинився на R2» (or
 * «✓ проходить»), a button that draws its path; drawn, its walk in words. */
function PingRow({ row, label, stopWords, picked, walk, onPick, evidence = false }) {
  const leg = row.ok ? null : row.request?.ok ? row.reply : row.request;
  const stop = leg?.stop?.deviceId ? stopWords(leg.stop.deviceId, Boolean(row.request?.ok)) : null;
  // One line (repair: Fable): «✗ зупинився на R2», «✗ назад зупинився на R1»; «не проходить» for screen readers.
  return (
    <li className={`ng-rt-checkline ng-rf-ping is-${row.ok ? 'pass' : 'fail'}${picked ? ' is-shown' : ''}`} {...(evidence ? { 'data-evidence': 'current' } : {})}>
      <button type="button" className="ng-rt-checkline-body" aria-pressed={picked} onClick={() => onPick(row.id)}>
        <span className="ng-rt-checkline-label">{label}</span>
        <span className="ng-rt-checkline-state">{row.ok ? generic.passes : stop ? <><span className="ng-sr-only">{faultsUi.pingFailsWords}, </span><span aria-hidden="true">✗ </span>{stop}</> : faultsUi.pingFails}</span>
      </button>
      {picked && walk.length > 0 && (
        <p className="ng-rf-walk">{walk.map((line, i) => <span key={i} className="ng-rf-walk-line">{line}</span>)}</p>
      )}
    </li>
  );
}

/** «Показати відповідь»: the cause and the one changed route (before →
 * after, in the active syntax). The pings after the fix are a choice of the
 * pings block («після виправлення»), each traceable there. */
function FaultReveal({ reveal, syntax }) {
  const { change } = reveal;
  return (
    <div className="ng-rf-reveal">
      <p className="ng-rf-reveal-cause"><b>{faultsUi.revealCause}:</b> {reveal.causeText}.</p>
      <p className="ng-rf-reveal-head"><b>{faultsUi.revealChange(change.router)}</b></p>
      <dl className="ng-rf-change">
        <div className="ng-rf-change-row is-was">
          <dt>{faultsUi.was}</dt>
          <dd>{change.before ? <code>{commandOf(syntax, change.before)}</code> : faultsUi.noRow}</dd>
        </div>
        <div className="ng-rf-change-row is-now">
          <dt>{faultsUi.now}</dt>
          <dd><code>{commandOf(syntax, change.after)}</code></dd>
        </div>
      </dl>
    </div>
  );
}
