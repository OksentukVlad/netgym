// «Знайди несправність» (VLAN-3 spec v2 §4 with Z1, Z2, Z7): one planted
// fault in a configured network of «Налаштуй порти» or «Між VLAN», found
// from the evidence, named and fixed. In those exercises' frame (the header,
// the intro, the work panel and the stage, vlan.css).
//
// Round 4 (spec F6 with its v2 transitions; plan v2 M4): the order is
// routing's, checks → repair → cause, one stage at a time in the work
// column under a small stepper (any earlier stage is one tap away; «Причина»
// opens after a passing repair):
//   - «Перевірки»: the symptom grid (marks «✓ проходить» / «✗ не
//     проходить»); a tap on a check draws its path; a tap on a failing one
//     also opens «Ремонт»;
//   - «Ремонт»: the selected device's form, the help panel under it (its
//     check is the repair check), the given configuration with the lines the
//     repair changed struck, and the live commands (folded while a verdict
//     is open);
//   - «Причина»: the causes, in the panel's place, the panel's check checking
//     the cause; editing the repair afterwards makes the verdict stale and
//     closes «Причина» until the repair passes again (the choice is kept).
// Hints and «Показати відповідь» stay in the panel throughout; the reveal
// clears «Ще ні», shows the cause, where and what to change and the grid
// before and after in the panel's place, and marks the board «показано».
// The selected path stays on the diagram and its words follow the panel.
// «Далі →» goes a level up (a quiet skip before a solve); «Інші номери VLAN»
// and «Попередні номери» are in «⋯».
//
// Before round 4, the work panel was, in the order of the work, under a bar
// of jumps to each part:
//   - «Перевірки» (SymptomGrid.jsx): reachability, expected ✓ against what
//     is observed, and each VLAN's isolation, in words; a summary of how many
//     fail, the failing ones first, the passing ones folded. It shows the
//     given configuration's state at the start and changes only on
//     «Перевірити» (Z1: a live grid would be a free oracle); after an edit it
//     says so. A tap on a row draws its walk on the diagram, as often as
//     wanted: no attempt, no check, no count anywhere;
//   - «Причина»: a radio list of the logic's options, in their order (the
//     same whatever the fault; their values never reach the DOM);
//   - «Виправ»: the given configuration in «Налаштуй порти»'s or «Між
//     VLAN»'s forms, every device and row editable (no givens restored), the
//     Cisco trunk's native VLAN where the task uses one (level 3); the
//     device's live commands under it;
//   - «Перевірити» and the feedback at the foot (Z2): the fix is judged
//     first; a failing fix says what the configure exercises say and draws
//     its walk, whatever the cause; a working fix with another cause says
//     «Мережа працює, але причина була інша» and marks the instance assisted
//     (the session's `assist`); both right: done, and «Ще одна →» moves the
//     level 1 → 2 → 3 (and stays at 3).
// The stage: the diagram (the device being edited is the one marked
// «налаштовуєш»), the walk in words, the hints (faults.hints with the last
// check's result: rungs 1–2; rung 3, the worked example, built only once it
// is opened) and «Показати відповідь»: the cause, where and what to change
// (the commands that go and come), and the grid before and after it, each
// row's walk on the diagram.
//
// Motion as in the other exercises (walkPlayer.js): a VLAN-1 walk plays as a
// broadcast, an IP probe as its request then its reply (or its failing
// direction); an isolation walk of an IP task stays still (VLAN-anim fix
// item 4). A play belongs to its row tap or check and the configuration: an
// edit ends it for good; any press skips it; a check's walk after an edit
// stays still. A walk of another configuration than the form's (the grid
// before an edit, the reveal's before and after) is drawn over that
// configuration's interface lines and says which it is.
//
// Leaks (Z7): before hint 3 and the reveal, nothing names the fault. The
// stops say what they show (uk.js `observed`), not the setting behind them
// or its repair; a check marks form errors only (never an objective's
// address, which would point at the fault); the causes' values stay out of
// the DOM.
import { useEffect, useMemo, useRef, useState } from 'react';
import faults from '../logic/faults-exercise.js';
import { useExercise } from '../../../ui/useExercise.js';
import { useStore } from '../../../ui/useStore.js';
import Segmented from '../../../ui/components/Segmented.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import MoreMenu from '../../../ui/components/MoreMenu.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import Aside, { useAsideFold } from '../../../ui/components/Aside.jsx';
import TextEquivalent, { TextEquivalentButton } from '../../../ui/components/TextEquivalent.jsx';
import { uk } from '../../../ui/uk.js';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import VlanDiagram from './VlanDiagram.jsx';
import PortsForm from './PortsForm.jsx';
import RouteForm from './RouteForm.jsx';
import SymptomGrid from './SymptomGrid.jsx';
import { CommandsFold, failingStep, hostLines, hostPort, taskCounts, useHelpInView, useShortAside, EvidenceMark, SCREEN, WalkPointer } from './panel.jsx';
import { commandNotes } from './RouteView.jsx';
import { failureWords } from './PortsView.jsx';
import { compactPcWidth, layout, traceScene, walkScene } from './diagram.js';
import { captionAt, chipsAt, floodMotion, runAt, sceneAt, sequence, stepMsFor, tokensAt, traceMotion } from './walkSteps.js';
import { useSkipper, useWalkPlayer } from './walkPlayer.js';
import { failureOf, fieldKey, freshMarks, toggleMember, writeField } from './portsState.js';
import {
  addRow, deviceLines, endpointName, flushRoute, forCommands, objectiveLines, objectiveWalk, removeRow, routeFailure, routeFailureWords,
  traceSteps, writeRouteText,
} from './routeState.js';
import {
  STAGES, changeWhere, commandDiff, diffLines, faultMarks, floodLines, gridLines, gridRows, isCauseVerdict, isRouted, nextLevel, originalLines, paramsOf,
  repairWorks, rowEvidence, slotOf, stageOf, toFaultConfig, toFaultForm, toneOf, usesNative,
} from './faultsState.js';
import { firstValidSeed, validSeed } from './predictState.js';
import { comprehension, faultText, faultsUi, notes, observeText, observedWords, routeNotes, routeUi, t, ui } from '../uk.js';

const HINTS = 3;
/** «Ремонт»: the last steps of a walk shown, the earlier ones folded. */
const SHORT_WALK = 4;
const DIRECTIONS = ['request', 'reply'];
/** «Між VLAN»'s form with nothing given: every row of the configuration is the student's. */
const NOTHING_FIXED = Object.freeze({ switchWhole: false, switchPorts: [], routerUp: [], rows: { subifs: 0, vlanIfs: 0, addresses: 0 } });

const can = fn => { try { fn(); return true; } catch { return false; } };

/** A slot the logic can build for a vendor at a level: a new seed (not `previous`), the network it draws (or `shape`). */
export function pickSlot(record, vendor, level, { previous, shape = null, random = Math.random } = {}) {
  let built = null;
  const seed = validSeed(s => can(() => { built = faults.create(record, { vendor, level, seed: s, ...(shape ? { variantId: shape } : {}) }); }), previous, random);
  if (!built || built.identity.seed !== seed) built = faults.create(record, { vendor, level, seed, ...(shape ? { variantId: shape } : {}) });
  return { seed, level, shape: built.identity.shape };
}

/** A place without a slot (written before this exercise): the first seed the logic builds at level 1. */
function fallbackSlot(record, vendor) {
  const seed = firstValidSeed(s => can(() => faults.create(record, { vendor, level: 1, seed: s })));
  return { seed, level: 1, shape: null };
}

/**
 * @param {{ records: object[], syntax: 'cisco'|'routeros', place: object, setPlace: Function, head: any, skipper?: object }} props
 */
export default function FaultsView({ records, syntax, place, setPlace, head, skipper = null, short = false }) {
  const record = records[0];
  const placed = slotOf(place, syntax);
  const fallback = useMemo(() => (placed ? null : fallbackSlot(record, syntax)), [Boolean(placed), record, syntax]);
  const slot = placed ?? fallback;
  const previousSlot = place.faultsPrevious?.[syntax] ?? null;
  const ex = useExercise(faults, record, paramsOf(syntax, slot));
  const { task } = ex;
  const { state } = useStore();
  const foldAsides = useAsideFold(SCREEN);
  useShortAside('faults-goal', short);
  const [walkOpen, setWalkOpen] = useState(null);
  const routed = isRouted(task);
  const devices = task.topology.devices.filter(d => d.kind !== 'host');
  const earnedLevels = earnedBy(state.instances, identity => (identity.exerciseId === faults.id && identity.vendor === syntax ? identity.level : null));

  // The form: the given configuration until the student edits it.
  const native = syntax === 'cisco' && !routed && usesNative(task.initialConfiguration);
  const form = useMemo(() => ex.view.form ?? toFaultForm(task.initialConfiguration, syntax, { native }), [ex.view.form, task, syntax, native]);
  const raw = ex.view.raw ?? {};
  const live = useMemo(() => flushRoute(form, raw), [form, raw]);
  const configuration = useMemo(() => toFaultConfig(live, syntax), [live, syntax]);
  const configKey = JSON.stringify(configuration);
  const cause = ex.view.cause ?? null;
  const answer = useMemo(() => ({ cause, configuration }), [cause, configKey]);
  const answerKey = JSON.stringify(answer);
  const commands = useMemo(() => faults.render(forCommands(configuration), syntax, task.topology), [configKey, syntax, task]);
  const original = useMemo(() => faults.render(forCommands(task.initialConfiguration), syntax, task.topology), [task, syntax]);
  const options = useMemo(() => faults.options(task, 'cause'), [task]);

  // The last check: its verdict, and the grid it observed (Z1: only a check changes the grid).
  const checked = useMemo(() => (ex.view.checked && ex.result ? JSON.parse(ex.view.checked) : null), [ex.view.checked, ex.result]);
  const result = checked ? ex.result : null;
  const stale = Boolean(checked) && ex.view.checked !== answerKey;
  const checkedConfigKey = checked ? JSON.stringify(checked.configuration) : null;
  // An edit of the repair since the last check keeps «Причина» closed until another passing check (Astra 3), even when undone.
  const { stage, causeOpen } = stageOf(ex.view.stage, { result, checkedConfig: checkedConfigKey, config: configKey, edited: Boolean(ex.view.repairEdited) });
  const initialGrid = useMemo(() => faults.grid(task), [task]);
  const grid = result?.evidence?.grid ?? initialGrid;
  const gridConfig = checked?.configuration ?? task.initialConfiguration;
  const gridConfigKey = JSON.stringify(gridConfig);
  const gridEdited = gridConfigKey !== configKey;
  const attachmentsOf = config => (routed ? faults.compile(task, config).topology.attachments ?? [] : []);
  const gridAttachments = useMemo(() => attachmentsOf(gridConfig), [task, gridConfigKey]);
  const rows = useMemo(() => gridRows(task, grid, gridAttachments), [task, grid, gridAttachments]);
  const gridState = gridEdited ? faultsUi.gridState.stale : checked ? faultsUi.gridState.checked : faultsUi.gridState.initial;

  // The check's own words and walk (a failing fix), the same whatever the cause (Z2).
  const causeOnly = isCauseVerdict(result);
  const behaviour = result && !result.ok && !causeOnly ? result : null;
  const checkedAttachments = useMemo(() => (behaviour ? behaviour.evidence?.attachments ?? attachmentsOf(checked.configuration) : []), [behaviour]);
  const l2Failure = useMemo(() => (behaviour && !routed ? failureOf(task, behaviour) : null), [behaviour, task]);
  const l3Failure = useMemo(() => (behaviour && routed ? routeFailure(behaviour) : null), [behaviour]);
  // A stop's words are observations here, never the setting behind it or its repair (fix brief item 1).
  const words = (!result ? [] : result.ok ? [t('ok')] : causeOnly ? [t(result.code)]
    : routed ? routeFailureWords(task, l3Failure, { syntax, attachments: checkedAttachments, config: checked.configuration })
      : failureWords(task, l2Failure, syntax)).map(observeText);
  // A reveal is current until a later check: then its own lines are the evidence, and the checked
  // configuration's field marks go (stage-1 decision 6, Fable 2).
  const revealCurrent = ex.session.revealed && ex.presses <= (ex.view.revealedAt ?? Infinity);
  const marks = useMemo(() => (behaviour && !revealCurrent ? freshMarks(faultMarks(task, behaviour, checked.configuration, syntax), checked.configuration, configuration) : {}),
    [behaviour, configKey, revealCurrent]);
  const markCount = Object.values(marks).reduce((n, list) => n + list.length, 0);
  const formFailure = Object.keys(marks).length > 0;

  // The walk on the diagram: a tapped row's (the grid's, or the reveal's
  // before and after), else a failing fix's. With the configuration it is of.
  const pick = ex.view.walk ?? null;
  // Memoised by useExercise on the task and the reveal (fix brief item 3).
  const solution = ex.solution;
  const sources = {
    grid: { grid, config: gridConfig, attachments: gridAttachments, where: checked ? faultsUi.walkWhere.checked : faultsUi.walkWhere.initial },
    ...(solution ? {
      before: { grid: solution.before.grid, config: solution.before.configuration, where: faultsUi.walkWhere.before },
      after: { grid: solution.after.grid, config: solution.after.configuration, where: faultsUi.walkWhere.after },
    } : {}),
  };
  const picked = pick && sources[pick.source] ? sources[pick.source] : null;
  const pickedAttachments = useMemo(() => (picked && pick.source !== 'grid' ? attachmentsOf(picked.config) : picked?.attachments ?? []),
    [pick?.source, pick?.id, Boolean(solution), gridAttachments]);
  const evidence = useMemo(() => {
    if (picked) {
      const ev = rowEvidence(task, picked.grid, pick.id);
      return ev ? { ...ev, config: picked.config, attachments: pickedAttachments, where: picked.where, source: pick.source } : null;
    }
    if (!behaviour) return null;
    const base = { config: checked.configuration, attachments: checkedAttachments, where: faultsUi.walkWhere.checked, source: 'check' };
    if (l2Failure?.walk) {
      const leaked = [l2Failure.leaked, ...[...l2Failure.walk.received].filter(h => task.goals[h] !== task.goals[l2Failure.walk.from])].filter(Boolean);
      return { ...base, kind: 'flood', walk: l2Failure.walk, leaked: [...new Set(leaked)], ifaces: {} };
    }
    if (l3Failure?.kind === 'probe') return { ...base, kind: 'trace', probe: l3Failure.probe, direction: l3Failure.direction };
    if (l3Failure?.kind === 'objective') {
      const o = objectiveWalk(task, l3Failure.objective);
      if (o?.walk) return { ...base, kind: 'flood', walk: o.walk, leaked: o.leaked, ifaces: o.iface ? { [o.iface.id]: o.iface.status } : {}, isolation: true };
    }
    return null;
  }, [picked?.grid, pick?.id, pickedAttachments, behaviour, l2Failure, l3Failure, checkedAttachments, task]);
  // A walk of another configuration than the form's (the grid before an edit,
  // the reveal's before and after) is drawn over that configuration's
  // interface lines and says which it is (fix brief item 2); otherwise the
  // diagram shows the form's.
  const evidenceKey = evidence ? JSON.stringify(evidence.config) : null;
  const elsewhere = Boolean(evidence) && evidenceKey !== configKey;
  const drawn = elsewhere ? evidence.config : configuration;
  const drawnKey = elsewhere ? evidenceKey : configKey;
  const lines = useMemo(() => (routed ? deviceLines(task, drawn, syntax) : {}), [routed, task, drawnKey, syntax]);
  // Round 5 (§4 v2, narrow): one compact drawing at every size: every PC (with its gateway where routed), every switch and the router at 12 px.
  const { third, fourth } = useMemo(() => hostLines(task, { gateways: routed }), [task, routed]);
  const geo = useMemo(() => layout(task.topology, syntax, { lines, compact: true, hostLines: routed ? 5 : 4, pcWidth: compactPcWidth(task.topology, third, fourth) }), [task, syntax, lines, third, fourth, routed]);

  // A check's walk after an edit (a stale verdict) stays still (Y5); a tapped row plays, whichever configuration it is of.
  const runs = useMemo(() => {
    if (!evidence || (evidence.source === 'check' && stale)) return null;
    if (evidence.kind === 'flood') return routed ? null : [{ direction: null, motion: floodMotion(geo, evidence.walk, { leaked: evidence.leaked }) }];
    if (evidence.kind !== 'trace') return null;
    const dirs = evidence.direction ? [evidence.direction] : DIRECTIONS.filter(d => evidence.probe[d]);
    return dirs.map(d => ({ direction: d, motion: traceMotion(geo, task.topology, evidence.probe[d], evidence.attachments) }));
  }, [evidence, stale, geo, routed, task]);
  const seq = useMemo(() => (runs?.length ? sequence(runs.map(r => r.motion)) : null), [runs]);
  const stepMs = stepMsFor(seq?.total ?? 0, false);
  // The play belongs to the tap or the check, the configuration and the direction chosen.
  const ownerOf = (walk, presses, key, direction) => (walk ? `${ex.key}|walk|${walk.source}|${walk.id}|${walk.n}|${configKey}|${direction}` : `${ex.key}|check|${presses}|${key}|${direction}`);
  const player = useWalkPlayer(ownerOf(pick, ex.presses, answerKey, ex.view.direction ?? ''), seq, { stepMs });
  useSkipper(skipper, player);
  const playing = player.playing;
  const run = playing ? runAt(seq, player.step) : null;
  const liveRun = run ? runs[run.index] : null;
  const lastRun = player.reduced ? null : runs?.at(-1)?.direction ?? null;
  const trace = evidence?.kind === 'trace';
  const wanted = liveRun?.direction ?? ex.view.direction ?? evidence?.direction ?? lastRun ?? 'request';
  const direction = trace && evidence.probe.reply && wanted === 'reply' ? 'reply' : 'request';
  const staticScene = useMemo(() => {
    if (!evidence) return null;
    if (evidence.kind === 'trace') {
      return traceScene(geo, task.topology, evidence.probe[direction], evidence.attachments);
    }
    if (evidence.kind === 'flood') {
      const s = walkScene(geo, evidence.walk, { leaked: evidence.leaked });
      return { ...s, ifaces: evidence.ifaces ?? {}, deviceDrops: {} };
    }
    return null;
  }, [evidence, direction, geo]);
  const scene = run ? sceneAt(liveRun.motion, run.local) : staticScene;
  const tokens = run ? tokensAt(geo, liveRun.motion, run.local) : [];
  const chips = run ? chipsAt(geo, liveRun.motion, run.local) : [];
  const routing = run ? captionAt(liveRun.motion, run.local) : null;

  // The walk in words.
  const name = id => endpointName(task, evidence?.attachments ?? [], id);
  const walkWords = useMemo(() => {
    if (!evidence) return null;
    if (evidence.kind === 'trace') {
      const steps = traceSteps(task, syntax, evidence.probe[direction], evidence.attachments);
      return { trace: { groups: steps.groups.map(g => ({ ...g, heading: observeText(g.heading), lines: g.lines.map(observeText) })), outcome: observeText(steps.outcome) } };
    }
    if (evidence.kind === 'flood') {
      if (routed) return { note: null, steps: objectiveLines(task, syntax, evidence.walk, evidence.attachments).map(observeText) };
      const f = floodLines(task, syntax, evidence.walk);
      return { note: evidence.isolation ? null : f.note, steps: f.steps.map(observeText) };
    }
    return { note: null, steps: [evidence.code ? observedWords(evidence.code) : faultsUi.noWalk] };
  }, [evidence, direction, task, syntax, routed]);
  const walkHead = (() => {
    if (!evidence) return '';
    const title = trace ? routeUi.walkTitle : ui.walkTitle;
    const probe = trace ? evidence.probe[direction] : null;
    const what = probe ? routeUi.probe({ from: name(probe.from), to: name(probe.to) })
      : evidence.walk ? faultsUi.walkFrom({ from: name(evidence.walk.from) }) : rows.find(r => r.id === evidence.id)?.what ?? '';
    return `${title}: ${what}${elsewhere || evidence.source === 'before' || evidence.source === 'after' ? ` · ${evidence.where}` : ''}`;
  })();

  const deviceId = devices.some(d => d.id === ex.view.deviceId) ? ex.view.deviceId : devices[0].id;
  const device = devices.find(d => d.id === deviceId) ?? devices[0];

  const workRef = useRef(null);
  // A device tab or a stage opened by a tap (a failing check opens «Ремонт») brings the panel and its evidence back into view.
  useHelpInView(workRef, `${ex.key}|${device.id}|${ex.view.stage ?? 'checks'}`);
  const boardRef = useRef(null);
  const formHeading = useRef(null);
  const stageHeading = useRef(null);
  const causesRef = useRef(null);
  const moreHost = useRef(null);
  // Another instance («Далі →», «Інші номери», the other syntax) starts at the checks.
  const focusStage = useRef(false);
  useEffect(() => {
    if (!focusStage.current) return;
    focusStage.current = false;
    (stage === 'repair' ? formHeading.current : stageHeading.current)?.focus();
  }, [stage, ex.key]);
  const textButton = useRef(null);
  const focusMark = useRef(false);
  useEffect(() => {
    if (!focusMark.current) return;
    focusMark.current = false;
    const bad = workRef.current?.querySelector('.ng-vl-form [aria-invalid="true"], .ng-vl-device-form [aria-invalid="true"]');
    const target = bad?.getAttribute('role') === 'radiogroup' ? bad.querySelector('[tabindex="0"]') : bad;
    (target ?? formHeading.current)?.focus();
  });
  const [textOpen, setTextOpen] = useState(false);
  const hintIndex = ex.session.hintIndex;
  // Rungs 1–2 from the last check (or the start's grid); rung 3 only once opened (Z7).
  const hintTexts = useMemo(() => {
    if (hintIndex === 0) return Array.from({ length: HINTS }, () => '');
    const list = faults.hints(task, answer, { result: ex.result ?? undefined, rung: hintIndex >= 3 ? 3 : 2, assisted: hintIndex >= 3 });
    return Array.from({ length: HINTS }, (_, i) => (list[i] ? t(list[i].code, list[i].params) : ''));
  }, [hintIndex, task, ex.result]);

  const edited = ex.view.edited?.device === device.id ? ex.view.edited.field : null;
  const save = (nextForm, nextRaw = raw, extra = {}) => ex.setView({ form: nextForm, raw: nextRaw, ...extra });
  const touched = (dev, field) => ({ edited: { device: dev, field }, repairEdited: true });
  const edit = {
    text: (dev, field, text) => ex.setView({ raw: { ...raw, [fieldKey(dev, field)]: text }, ...touched(dev, field) }),
    blur(dev, field) {
      const key = fieldKey(dev, field);
      if (typeof raw[key] !== 'string') return;
      const { [key]: text, ...rest } = raw;
      save(writeRouteText(form, dev, field, text), rest);
    },
    set: (dev, field, value) => save(writeField(form, dev, field, value), raw, touched(dev, field)),
    addRow: (dev, list) => save(addRow(task, form, dev, list), raw, touched(dev, list)),
    removeRow(dev, list, index) {
      const next = removeRow(form, raw, dev, list, index);
      save(next.form, next.raw, touched(dev, list));
    },
    member: (dev, index, kind, port) => save(toggleMember(form, dev, index, kind, port), raw, touched(dev, `vlans.${index}.${kind}`)),
  };
  // PortsForm's own calls (a VLAN-1 switch): its rows are the bridge's VLAN table.
  const portsEdit = { ...edit, addRow: dev => edit.addRow(dev, 'vlans'), removeRow: (dev, i) => edit.removeRow(dev, 'vlans', i) };

  /** «Перевірити» (or Enter): the typed text parsed, the repair and then the cause checked (Z2). */
  function onCheck() {
    const flushed = flushRoute(form, raw);
    const submitted = { cause, configuration: toFaultConfig(flushed, syntax) };
    const outcome = faults.check(task, submitted);
    foldAsides();
    ex.check(submitted, { result: outcome });
    // A working fix with another listed cause is help, as a hint is.
    if (outcome.assisted === true) ex.act({ type: 'session', action: { type: 'assist' } });
    const marked = Object.keys(faultMarks(task, outcome, submitted.configuration, syntax));
    const target = marked.find(id => devices.some(d => d.id === id));
    const goTo = target ? { deviceId: target } : {};
    if (target && target !== deviceId && workRef.current?.querySelector('.ng-vl-device-form, .ng-vl-form')?.contains(document.activeElement)) focusMark.current = true;
    // A passing repair opens «Причина»; form errors open «Ремонт».
    const nextStage = repairWorks(outcome) ? { stage: 'cause' } : target ? { stage: 'repair' } : {};
    const submittedKey = JSON.stringify(submitted);
    save(flushed, {}, { checked: submittedKey, walk: null, direction: null, repairEdited: false, ...goTo, ...nextStage });
    player.start(ownerOf(null, ex.presses + 1, submittedKey, ''));
  }
  /** A row's walk on the diagram: no check, no attempt; a tap again replays it. A failing check opens «Ремонт». */
  function onPick(source, id, failing = false) {
    const walk = { source, id, n: (pick?.n ?? 0) + 1 };
    ex.setView({ walk, direction: null, ...(failing ? { stage: 'repair' } : {}) });
    player.start(ownerOf(walk, ex.presses, answerKey, ''));
  }
  const goStage = value => { if (value !== 'cause' || causeOpen) ex.setView({ stage: value }); };
  const setSlot = (next, previous = null) => setPlace({ faults: { ...place.faults, [syntax]: next }, faultsPrevious: { ...place.faultsPrevious, [syntax]: previous } });
  /** «Інші номери VLAN»: the same network and level, a new seed; «Попередні номери» goes back. */
  const otherNumbers = () => { focusStage.current = true; setSlot(pickSlot(record, syntax, slot.level, { previous: slot.seed, shape: task.identity.shape }), { ...slot, shape: task.identity.shape }); };
  const previousNumbers = () => { if (previousSlot) { focusStage.current = true; setSlot(previousSlot, { ...slot, shape: task.identity.shape }); } };
  /** «Далі →»: the next level (to 3), a new seed and the network it draws. */
  const onAgain = () => { focusStage.current = true; foldAsides(); setSlot(pickSlot(record, syntax, nextLevel(slot.level), { previous: slot.seed })); };
  const chooseDevice = id => ex.setView({ deviceId: id });
  const chooseCause = value => ex.setView({ cause: value });

  const previous = stale ? ` · ${ui.previous}` : '';
  const shapeTitle = task.shapeSpec?.title ?? '';
  const givens = useMemo(() => faults.describe(task).slice(2), [task]);
  const walkTextLines = walkWords ? (walkWords.trace ? [...walkWords.trace.groups.flatMap(g => [g.heading, ...g.lines]), walkWords.trace.outcome] : [...(walkWords.note ? [walkWords.note] : []), ...walkWords.steps]) : [];
  const sections = [
    { heading: ui.scheme, items: givens },
    { heading: `${faultsUi.textGrid} (${gridState})`, items: gridLines(rows) },
    ...(walkTextLines.length ? [{ heading: walkHead, items: walkTextLines }] : []),
  ];
  const notesOf = id => (routed ? commandNotes(task, id, syntax) : notes[syntax]);
  const level = slot.level;
  const revealed = ex.session.revealed;

  // The panel's verdict, and what it is about (data-evidence): a failing
  // repair's marked field or its walk on the diagram; a cause verdict, the
  // causes; after an edit, the field edited; a hint before any check, the
  // failing checks.
  const causeEvidence = !revealCurrent && causeOnly && stage === 'cause';
  const walkEvidence = !stale && !revealCurrent && Boolean(behaviour) && !formFailure;
  // A walk (not one field): the first failing check in the checks stage; in «Ремонт», the step the walk stops at.
  const gridEvidence = !stale && !revealCurrent && stage === 'checks' && ((!result && hintIndex > 0) || walkEvidence);
  // After an edit: the field edited (outside the port tables), else a line under the port row edited.
  const editedSelector = stale && edited && stage === 'repair' && !edited.startsWith('ports.') ? `[id="vl-${device.id}-${edited.replace(/\./g, '-')}"]` : null;
  const editedNote = stale && edited && stage === 'repair' && edited.startsWith('ports.') ? edited.split('.').slice(0, 2).join('.') : null;
  // A form finding's own row (its words), trimmed to the row whose mark it is.
  const namedMark = (() => {
    if (!(stage === 'repair' && !stale && !revealCurrent && formFailure)) return null;
    const first = behaviour.findings?.find(f => f.severity === 'blocks');
    const parts = String(first?.field ?? '').split('.').filter(Boolean), ids = [];
    for (let n = parts.length; n >= 1; n--) ids.push(`.ng-vf-repair [id="vl-${first.entity}-mark-${parts.slice(0, n).join('-')}"]`);
    return [...ids, '.ng-vf-repair .ng-vl-mark'].join(', ');
  })();
  // The step the walk on screen stops at (the check's, or a tapped failing row's).
  const walkMark = (() => {
    if (!walkEvidence || stage !== 'repair' || !walkWords || walkWords.trace) return -1;
    const w = evidence?.walk, target = w && l2Failure ? hostPort(task.topology, w.from === l2Failure.from ? l2Failure.to : l2Failure.from) : null;
    const label = target ? task.topology.devices.find(d => d.id === target.device)?.ports.find(p => p.id === target.port)?.label[syntax] : null;
    return failingStep(walkWords.steps, target && label ? { device: target.device, port: label, host: w.from === l2Failure.from ? l2Failure.to : l2Failure.from } : {});
  })();
  // Repair v1 (Fable suggestion 5): on a short window «Ремонт» starts with the walk folded to its heading,
  // so the first port row is on the first view; the heading is then the panel's evidence, and it opens on a press.
  const walkFoldKey = `${ex.key}|${ex.presses}|${pick?.id ?? ''}`;
  const walkFolded = short && stage === 'repair' && walkOpen !== walkFoldKey;
  const walkEvidenceOn = (walkEvidence && stage === 'repair') || walkMark >= 0;
  const faultWalk = evidence && walkWords && walkFolded ? (
    <section className="ng-vl-walk-text is-folded" aria-label={trace ? routeUi.walkTitle : ui.walkTitle}>
      <button type="button" className="ng-vf-walk-open" aria-expanded="false" onClick={() => setWalkOpen(walkFoldKey)}
        {...(walkEvidenceOn ? { 'data-evidence': 'current' } : {})}>
        <span aria-hidden="true">▸ </span>{walkHead}
      </button>
    </section>
  ) : evidence && walkWords ? (

          <section className="ng-vl-walk-text" aria-label={trace ? routeUi.walkTitle : ui.walkTitle}>
            <div className="ng-vl-walk-head">
              <h3 className="ng-vl-caption">{walkHead}</h3>
              {trace && evidence.probe.reply && (
                <Segmented label={routeUi.direction} value={direction} onChange={value => { player.cancel(); ex.setView({ direction: value }); }} className="ng-vl-directions"
                  options={DIRECTIONS.map(value => ({ value, label: routeUi.directions[value] }))} />
              )}
            </div>
            {walkWords.trace ? <>
              <p className="ng-vl-abstraction">{routeUi.walkAbstraction}</p>
              {walkWords.trace.groups.map((group, i) => (
                <div key={i} className={`ng-vl-walk-group is-${group.kind}`}>
                  <h4 className="ng-vl-subhead">{group.heading}</h4>
                  {group.lines.length > 0 && <ol className="ng-vl-steps">{group.lines.map((line, k) => <li key={k}>{line}</li>)}</ol>}
                </div>
              ))}
              <p className="ng-vl-outcome" {...(walkEvidence && stage === 'repair' ? { 'data-evidence': 'current' } : {})}>{walkWords.trace.outcome}</p>
            </> : <>
              {/* «Ремонт» keeps the walk short beside the form: the general note is the checks' (and «Текстом»'s),
                  and the steps before the last few fold (still one press away). */}
              {walkWords.note && stage !== 'repair' && <p className="ng-vl-abstraction">{walkWords.note}</p>}
              {stage === 'repair' && walkWords.steps.length > SHORT_WALK ? <>
                <details className="ng-vf-early">
                  <summary>{faultsUi.earlySteps({ n: walkWords.steps.length - SHORT_WALK })}</summary>
                  <ol className="ng-vl-steps">{walkWords.steps.slice(0, -SHORT_WALK).map((line, i) => <li key={i}>{line}</li>)}</ol>
                </details>
                <ol className="ng-vl-steps" start={walkWords.steps.length - SHORT_WALK + 1}>
                  {walkWords.steps.slice(-SHORT_WALK).map((line, k) => { const i = walkWords.steps.length - SHORT_WALK + k; return <li key={i} {...(i === walkMark ? { 'data-evidence': 'current' } : {})}>{line}</li>; })}
                </ol>
              </> : <ol className="ng-vl-steps">{walkWords.steps.map((line, i) => <li key={i} {...(i === walkMark ? { 'data-evidence': 'current' } : {})}>{line}</li>)}</ol>}
            </>}
          </section>
        
  ) : null;

  const walkInVerdict = evidence?.source === 'check';
  const verdict = result ? {
    tone: toneOf(result) ?? 'info',
    scope: 'task',
    stamp: ex.presses,
    summary: [...words, ...(!result.ok && markCount > 1 ? [ui.marks({ n: markCount })] : [])].join(' '),
    summaryNode: walkInVerdict && walkWords ? <WalkPointer what={walkHead} /> : null,
  } : null;
  const original1 = useMemo(() => originalLines(original[device.id] ?? '', commands[device.id] ?? ''), [original, commands, device.id]);


  const originalBlock = (
    <section className="ng-vf-original" aria-label={faultsUi.originalTitle({ device: device.id })}>
      <h3 className="ng-vl-caption">{faultsUi.originalTitle({ device: device.id })}</h3>
      <pre className="ng-vl-pre">
        {original1.map((l, i) => l.changed
          ? <del key={i} className="ng-vl-cmd-line is-changed">{l.text}<span className="ng-sr-only"> {faultsUi.changedLine}</span></del>
          : <span key={i} className="ng-vl-cmd-line">{l.text}</span>)}
      </pre>
    </section>
  );

  const stepper = (
    <nav className="ng-vf-stepper" aria-label={faultsUi.stagesLabel}>
      <ol>
        {STAGES.map((id, i) => {
          const locked = id === 'cause' && !causeOpen;
          return (
            <li key={id}>
              <button type="button" className={`ng-vf-step${stage === id ? ' is-current' : ''}`} aria-current={stage === id ? 'step' : undefined}
                aria-disabled={locked || undefined} title={locked ? faultsUi.causeLocked : undefined} onClick={() => goStage(id)}>
                <span className="ng-vf-step-n" aria-hidden="true">{i + 1}</span> {faultsUi.stages[id]}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  return (
    <>
      <div className="ng-vl-side">
        <header className="ng-vl-head">
          {head}
          <p className="ng-vf-level"><b>{faultsUi.level({ n: level })}</b><DoneMark done={earnedLevels.has(level)} />{` · ${faultsUi.levelWhat[level]} · ${shapeTitle}`}</p>
          <MoreMenu disclosureHost={moreHost} items={[
            { id: 'other', label: ui.otherNumbersMenu, onSelect: otherNumbers },
            previousSlot && { id: 'previous', label: ui.previousNumbers, onSelect: previousNumbers },
          ]} />
        </header>
        <div className="ng-vl-intro">
          <p className="ng-vl-task-text"><b>{faultText.title}.</b> {faultsUi.instructions}</p>
          {task.management && <p className="ng-vl-givens">{routeUi.managementGivens(task.management)}</p>}
          {task.capabilities?.label && <p className="ng-vl-givens">{faultsUi.version(task.capabilities)}</p>}
          <Aside screen={SCREEN} id="faults-goal" title={ui.goalTitle}>
            <p className="ng-vl-lesson">{routed ? routeUi.taskGoal : ui.taskGoal}</p>
            {routed && <p className="ng-vl-note">{routeNotes.assumptions}</p>}
            <p className="ng-vl-note">{t('network-convention')}</p>
          </Aside>
        </div>
        <section className="ng-vl-stage" aria-label={ui.diagramLabel}>
          {evidence && (elsewhere || stale) && <p className="ng-vl-previous">{evidence.where}</p>}
          <VlanDiagram geo={geo} topology={task.topology} zoom={ex.view.zoom} onZoom={zoom => ex.setView({ zoom })} viewKey={ex.key}
            covered={textOpen} scene={scene} third={third} fourth={fourth} activeSwitch={stage === 'repair' ? device.id : null} onSwitch={id => { chooseDevice(id); goStage('repair'); }}
            tokens={tokens} chips={chips} stepMs={stepMs} caption={routing ? routeUi.newFrame(routing) : null}
            tools={<>
              <TextEquivalentButton buttonRef={textButton} id="ng-vl-text" label={ui.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} />
              {seq && !player.reduced && <button type="button" className="ng-vl-btn ng-vl-replay" onClick={player.replay}>{ui.replay}</button>}
            </>}
            overlays={<TextEquivalent id="ng-vl-text" title={ui.textTitle} sections={sections} open={textOpen} onClose={() => { setTextOpen(false); textButton.current?.focus(); }} />} />
        </section>
      </div>

      <section ref={workRef} className={`ng-vl-work ng-vf-work${revealed ? ' is-revealed' : ''}`} aria-label={faultText.title} {...(revealed ? { 'data-revealed': '' } : {})}
        {...taskCounts({ hosts: task.topology.hosts.length, devices: devices.length, gateways: routed ? task.topology.hosts.filter(h => h.gateway).length : 0,
          failing: grid.invalid ? 0 : rows.filter(r => !r.ok).length })}>
        {stepper}
        <h2 ref={stageHeading} tabIndex={-1} className="ng-sr-only">{faultsUi.stages[stage]}</h2>
        {stage === 'repair' && <ActionLine id="ng-vf-action">{faultsUi.action.repair}</ActionLine>}
        {stage === 'repair' && (
          <div className="ng-vl-form-head">
            <h2 ref={formHeading} tabIndex={-1} className="ng-vl-caption">{comprehension.inspecting(device.id)}</h2>
            {devices.length > 1 && (
              <Segmented label={faultsUi.devices} value={device.id} onChange={chooseDevice} className="ng-vl-switches"
                options={devices.map(d => ({ value: d.id, label: `${d.id}${marks[d.id]?.length ? ' •' : ''}` }))} />
            )}
          </div>
        )}
        {/* The board marked shown (never a solve's look): the reveal's evidence, beside the panel. */}
        {revealed && <p className="ng-vf-shown" {...(revealCurrent ? { 'data-evidence': 'current' } : {})}><span className="ng-vf-shown-chip">{uk.help.shown}</span></p>}
        <div ref={boardRef} className="ng-vl-board">
        {stage === 'checks' && (
          <div>
            <SymptomGrid rows={rows} invalid={grid.invalid} state={gridState} stale={gridEdited} evidence={gridEvidence}
              action={<ActionLine id="ng-vf-action">{faultsUi.action.checks}</ActionLine>}
              picked={pick?.source === 'grid' ? pick.id : null} onPick={(id, failing) => onPick('grid', id, failing)} />
          </div>
        )}
        {/* «Ремонт» (F6; repair reviews): the walk in words first (the step it stops at, beside the
            panel), then the form and the given configuration right after it, struck where changed. */}
        {stage === 'repair' && faultWalk}
        {stage === 'repair' && (
          <div className="ng-vf-repair">
            {routed
              ? <RouteForm key={`${ex.key}|${device.id}`} task={task} device={device} syntax={syntax} form={form} raw={raw}
                marks={marks[device.id] ?? []} edit={edit} onCheck={onCheck} config={configuration} fixed={NOTHING_FIXED}
                note={editedNote ? { at: editedNote, text: ui.editedNote } : null} />
              : (
                <div className="ng-vl-device-form">
                  <PortsForm key={`${ex.key}|${device.id}`} device={device} syntax={syntax} form={form} raw={raw} marks={marks[device.id] ?? []}
                    edit={portsEdit} onCheck={onCheck} native={native} topology={task.topology}
                    note={editedNote ? { row: editedNote, text: ui.editedNote } : null} />
                </div>
              )}
          </div>
        )}
        {stage === 'repair' && originalBlock}
        {stage === 'cause' && (
          <fieldset ref={causesRef} className="ng-vf-causes" {...(causeEvidence ? { 'data-evidence': 'current' } : {})}>
            <legend className="ng-vl-caption">{faultText.cause}</legend>
            <p className="ng-vl-muted">{faultsUi.causeLead}</p>
            <ActionLine id="ng-vf-action">{faultsUi.action.cause}</ActionLine>
            {options.map((o, i) => (
              <label key={i} className={`ng-vf-cause${cause === o.value ? ' is-chosen' : ''}`}>
                <input type="radio" name={`ng-vf-cause-${syntax}`} className="ng-vf-radio" checked={cause === o.value} onChange={() => chooseCause(o.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCheck(); } }} />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        </div>
        <EvidenceMark within={workRef} selector={editedSelector ?? namedMark ?? '.ng-vf-repair .ng-vl-mark'} active={Boolean(editedSelector) || Boolean(namedMark)} />
        <HelpPanel
          taskKey={task.instanceKey}
          // Each stage is its own layout (the panel's home is decided again),
          // but not a new step: a verdict carries across stages (a failing
          // check opens «Ремонт» with it; an edit back from «Причина» keeps it stale).
          layoutKey={stage}
          boardRef={boardRef}
          check={{ label: ui.check, onCheck }}
          verdict={verdict}
          stale={stale}
          hints={{ texts: hintTexts, shown: hintIndex, onMore: () => ex.hint(HINTS) }}
          reveal={{
            revealed, onReveal: () => { ex.reveal(); ex.setView({ revealedAt: ex.presses }); },
            render: () => solution && <FaultReveal task={task} syntax={syntax} solution={solution} side={ex.view.side === 'after' ? 'after' : 'before'}
              onSide={side => ex.setView({ side })} picked={pick && pick.source !== 'grid' ? pick : null} onPick={onPick} attachmentsOf={attachmentsOf} />,
          }}
          next={{ onNext: onAgain }}
        />
        {stage !== 'repair' && faultWalk}
        {stage === 'repair' && <>
          <CommandsFold device={device.id} text={commands[device.id] ?? ''} note={notesOf(device.id)} empty={routeUi.noCommands}
            fold={result && !stale ? `v${ex.presses}` : null} />
        </>}
        <div ref={moreHost} className="ng-vl-more-host" />
      </section>
    </>
  );
}

/** «Показати відповідь»: the cause, where and what to change, the commands
 * that go and come, and the grid before or after the change (each row's
 * walk on the diagram). */
function FaultReveal({ task, syntax, solution, side, onSide, picked, onPick, attachmentsOf }) {
  const { change } = solution;
  const diff = useMemo(() => {
    const before = faults.render(solution.before.configuration, syntax, task.topology)[change.device] ?? '';
    const after = faults.render(solution.after.configuration, syntax, task.topology)[change.device] ?? '';
    return commandDiff(before, after);
  }, [solution.cause, change.device, syntax, task]);
  const shown = solution[side];
  const attachments = useMemo(() => attachmentsOf(shown.configuration), [side, task]);
  const rows = useMemo(() => gridRows(task, shown.grid, attachments), [shown.grid, attachments, task]);
  const block = (title, entries, kind) => entries.length > 0 && (
    <div className={`ng-vf-diff is-${kind}`}>
      <h4 className="ng-vl-subhead">{title}</h4>
      <pre className="ng-vl-pre">{diffLines(entries).map((l, i) => <span key={i} className={`ng-vl-cmd-line${l.head ? ' is-head' : ''}`}>{l.text}</span>)}</pre>
    </div>
  );
  return (
    <div className="ng-vf-reveal">
      <p><b>{faultsUi.revealCause}:</b> {solution.causeText}</p>
      <p><b>{faultsUi.revealChange}</b> ({changeWhere(task, change, syntax)}): {change.text}</p>
      {block(faultsUi.was, diff.removed, 'was')}
      {block(faultsUi.now, diff.added, 'now')}
      <Segmented label={faultsUi.sidesLabel} value={side} onChange={onSide} className="ng-vf-sides"
        options={['before', 'after'].map(value => ({ value, label: faultsUi.sides[value] }))} />
      <SymptomGrid rows={rows} invalid={shown.grid.invalid} state={faultsUi.sides[side]} compact level={3} fold={false}
        picked={picked?.source === side ? picked.id : null} onPick={id => onPick(side, id)} />
    </div>
  );
}
