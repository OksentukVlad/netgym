// «Між VLAN» (VLAN-2 spec §3 with v2 X1, X5–X7): routing between VLANs and
// the switch's management, configured and checked by behaviour, in
// «Налаштуй порти»'s frame (PortsView.jsx): the same header, intro, «Інші
// номери», work panel and stage.
//
// Four tasks; the fourth («Маршрутизатор із мостом») only with MikroTik,
// and with Cisco one line where its tab would be says why. Task 3's givens
// (VLAN M, its network, R1's address in it, the admin PC) are a line of
// their own under the task's words. Per device (SW1, R1: the tabs, or a
// press on the diagram), a form in the chosen syntax (RouteForm.jsx); under
// it the device's commands, live from the form with the givens restored
// (route.configuration), with copy and the fixed notes (the RouterOS safety
// note where the bridge is configured, nonegotiate, the router's parent in
// task 1, the SVI and the management note in task 3).
//
// The diagram shows a router box above the switch, each PC's «шлюз …», and
// in the router and switch boxes their interfaces from the submitted
// configuration (never the reference). «Перевірити» (or Enter) checks the
// active syntax's answer (route.check):
//   - a form finding marks its fields and opens its device, focus moving to
//     the first marked control when Enter was pressed in a field;
//   - a failing probe draws its trace: each segment on its path, the
//     router's hop, the drop where it stopped; request and reply each have
//     their own trace (the toggle above the words). Its words are under the
//     diagram: first what is checked (a broadcast per segment for L2
//     reachability, not the ICMP packet), then a sub-heading per segment and
//     router hop. In task 3, a management address cut off by the trunk says
//     the trunk's stop first and the SVI's inactivity second (X7), with the
//     management note under the walk;
//   - an isolation failure draws VLAN-1's walk, the PCs it must not reach
//     marked as such;
//   - a success draws a sample trace and gives up to two tips.
// After an edit the verdict stays as «Попередня перевірка» (the interface
// markers go: they belong to the checked rows). A syntax switch clears it.
// Hints are route.hints' three rungs for the current form; the reveal shows
// the reference commands (useExercise, once revealed).
//
// Round 4 (spec F5): the diagram with every PC and both gateways fits at
// 1280 × 800: the task is one sentence, the rest of its words (and the
// goal) a first-visit aside; Cisco no longer shows the line about task 4.
// The help panel sits right under the selected device's form (in one column
// too, «Перевірити» comes after the form it checks); the commands under it
// fold to one line while a verdict is open. In task 2 the verdict names the
// device and port to look at; that device's tab gets the mark (•) and
// opens. «Далі →» moves to the next task (a quiet skip before a success);
// «Інші номери VLAN» and «Попередні номери» are in «⋯». The walk in words
// follows the panel in the work column.
import { useEffect, useMemo, useRef, useState } from 'react';
import route from '../logic/route.js';
import { useExercise } from '../../../ui/useExercise.js';
import { useStore } from '../../../ui/useStore.js';
import Segmented from '../../../ui/components/Segmented.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import { isPhoneNow } from '../../../ui/phone.js';
import MoreMenu from '../../../ui/components/MoreMenu.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import Aside, { useAsideFold } from '../../../ui/components/Aside.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import DiagramExpand, { ExpandButton, useDiagramExpand, useTextOpen } from '../../../ui/topology/DiagramExpand.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import { interVlanExample } from '../logic/examples.js';
import VlanDiagram from './VlanDiagram.jsx';
import RouteForm from './RouteForm.jsx';
import Commands from './Commands.jsx';
import { CommandsFold, exampleLines, failingStep, hostLines, isShort, portIdOf, taskCounts, useHelpInView, useShortAside, EvidenceMark, SCREEN, WalkPointer } from './panel.jsx';
import { compactPcWidth, layout, traceScene, walkScene } from './diagram.js';
import { interVlanAction } from '../logic/route-action.js';

const TALL_ASIDE = 760;
import { captionAt, chipsAt, runAt, sceneAt, sequence, stepMsFor, tokensAt, traceMotion } from './walkSteps.js';
import { useSkipper, useWalkPlayer } from './walkPlayer.js';
import { fieldKey, freshMarks, toggleMember, verdictOf, writeField } from './portsState.js';
import {
  addRow, blankRouteForm, deviceLines, devicesOf, endpointName, firstDevice, flushRoute, forCommands, objectiveLines, objectiveWalk,
  recordsFor, removeRow, routeFailure, routeFailureWords, routeHintTexts, routeMarks, routeTips, shownProbe, shownRecord, toRouteAnswer,
  traceLines, traceSteps, trunkPort, writeRouteText,
} from './routeState.js';
import { firstValidSeed, validSeed } from './predictState.js';
import { comprehension, notes, routeNotes, routeText, routeUi, t, ui } from '../uk.js';

const HINTS = 3;
const DIRECTIONS = ['request', 'reply'];

/** The fixed notes under a device's commands. */
export function commandNotes(task, device, syntax) {
  const n = task.taskNumber, out = [];
  if (device === 'SW1' && syntax === 'cisco') out.push(notes.cisco);
  // The RouterOS safety note where the student configures a bridge.
  if (syntax === 'routeros' && ((device === 'SW1' && n !== 1) || (device === 'R1' && n === 4))) out.push(notes.routeros);
  if (device === 'R1' && syntax === 'cisco' && n === 1) out.push(routeNotes.routerParent);
  if (device === task.management?.device) {
    if (syntax === 'cisco') out.push(routeNotes.svi);
    out.push(routeNotes.management);
  }
  return out;
}

/** The given links in words («SW1 gi0/1 ↔ R1 gi0/2»), for «Текстом». */
const linkLines = (task, syntax) => task.topology.links.map(l => {
  const name = end => `${end.device} ${task.topology.devices.find(d => d.id === end.device)?.ports.find(p => p.id === end.port)?.label[syntax] ?? end.port}`;
  return `${name(l.a)} ↔ ${name(l.b)}`;
});

/**
 * @param {{ records: object[], syntax: 'cisco'|'routeros', place: object, setPlace: Function, head: any }} props
 */
export default function RouteView({ records, syntax, place, setPlace, head, skipper = null, short = false, height = 0 }) {
  const { state, dispatch } = useStore();
  const offered = recordsFor(records, syntax);
  const record = shownRecord(records, place.routeTask, syntax);
  const buildable = (r, s) => r.variants[0].syntaxes.every(x => { try { route.create(r, { variantId: 'main', seed: s, syntax: x }); return true; } catch { return false; } });
  const seedOf = r => place.routeSeeds?.[r.id] ?? firstValidSeed(s => buildable(r, s));
  const seed = seedOf(record);
  const previousSeed = place.routePrevious?.[record.id] ?? null;
  const ex = useExercise(route, record, { variantId: 'main', seed, syntax });
  const { task } = ex;

  // A task this syntax doesn't offer (MikroTik's task 4, then Cisco): the
  // place moves to the one shown; that task keeps its MikroTik draft, and
  // loses its verdict, as a syntax switch does.
  useEffect(() => {
    if (!place.routeTask || record.id === place.routeTask) return;
    const hidden = records.find(r => r.id === place.routeTask);
    if (hidden) {
      try {
        const key = route.create(hidden, { variantId: 'main', seed: seedOf(hidden), syntax: hidden.variants[0].syntaxes[0] }).instanceKey;
        if (state.instances[key]?.view?.verdict) dispatch({ type: 'instance', key, action: { type: 'view', patch: { verdict: null } } });
      } catch { /* a seed the logic can't build has no instance */ }
    }
    setPlace({ routeTask: record.id });
  }, [record.id, place.routeTask]);

  const devices = devicesOf(task);
  const forms = ex.view.forms ?? {};
  const rawAll = ex.view.raw ?? {};
  const form = useMemo(() => forms[syntax] ?? blankRouteForm(task, syntax), [forms[syntax], task, syntax]);
  const raw = rawAll[syntax] ?? {};
  // What the student has now, typed text included: the live commands, the diagram and the check.
  const live = useMemo(() => flushRoute(form, raw), [form, raw]);
  const answer = useMemo(() => toRouteAnswer(live, syntax), [live, syntax]);
  const answerKey = JSON.stringify(answer);
  const effective = useMemo(() => route.configuration(task, answer, syntax), [answerKey, task, syntax]);
  const commands = useMemo(() => route.render(forCommands(effective), syntax, task.topology), [effective, syntax, task]);

  // The verdict, only in the syntax it was checked in; a switch clears it.
  useEffect(() => {
    if (ex.view.verdict && ex.view.verdict.syntax !== syntax) ex.setView({ verdict: null });
  }, [syntax, ex.key]);
  const shown = verdictOf(ex.result, ex.view.verdict, syntax, answerKey);
  const result = shown?.result ?? null;
  const stale = Boolean(shown?.stale);
  const checked = useMemo(() => (ex.view.verdict?.answer ? JSON.parse(ex.view.verdict.answer) : null), [ex.view.verdict?.answer]);
  const failure = useMemo(() => (result && !result.ok ? routeFailure(result) : null), [result]);
  // A field edited since the check loses its mark (it may be right now).
  // A reveal is current until a later check: then nothing on the board is the message's evidence,
  // and the checked answer's field marks go (stage-1 decision 6, Fable 2).
  const revealCurrent = ex.session.revealed && ex.presses <= (ex.view.revealedAt ?? Infinity);
  const marks = useMemo(() => (failure && checked && !revealCurrent ? freshMarks(routeMarks(task, result, checked, syntax), checked, answer) : {}), [result, answerKey, checked, revealCurrent]);
  const attachments = useMemo(() => result?.evidence?.attachments ?? [], [result]);
  const checkedConfig = useMemo(() => (checked ? route.configuration(task, checked, syntax) : null), [checked, task, syntax]);
  const words = routeFailureWords(task, failure, { syntax, attachments, config: checkedConfig });
  const markCount = Object.values(marks).reduce((n, list) => n + list.length, 0);
  const tips = result?.ok ? routeTips(result) : [];

  // The trace on the diagram: the failing probe (its failing direction
  // first), or a sample after a success; the toggle picks the other one.
  const probe = useMemo(() => (result ? shownProbe(task, result, failure) : null), [task, result, failure]);
  const objective = failure?.kind === 'objective' ? objectiveWalk(task, failure.objective) : null;
  const lines = useMemo(() => deviceLines(task, effective, syntax), [effective, task, syntax]);
  // Round 5 (§4 v2, narrow): one compact drawing at every size: every PC with its gateway, the switch and the router at 12 px.
  const { third, fourth } = useMemo(() => hostLines(task, { gateways: true }), [task]);
  const geo = useMemo(() => layout(task.topology, syntax, { lines, compact: true, hostLines: 5, pcWidth: compactPcWidth(task.topology, third, fourth) }), [task, syntax, lines, third, fourth]);

  // The motion (VLAN-anim Y2, Y3, Y9, Y10): only journeys a trace backs. A
  // failing probe's failing direction; after a success, the sample probe's
  // request, then its reply. An isolation leak keeps its static scene and
  // words (fix brief item 4). Owned by the check (Y5).
  const runs = useMemo(() => {
    if (stale || !result) return null;
    const trace = d => (probe?.[d] ? { direction: d, motion: traceMotion(geo, task.topology, probe[d], attachments) } : null);
    if (failure?.kind === 'probe') return [trace(failure.direction)].filter(Boolean);
    if (result.ok && probe) return DIRECTIONS.map(trace).filter(Boolean);
    return null;
  }, [stale, result, failure, probe, geo, task, attachments]);
  const seq = useMemo(() => (runs?.length ? sequence(runs.map(r => r.motion)) : null), [runs]);
  const lap = Boolean(result?.ok);
  const stepMs = stepMsFor(seq?.total ?? 0, lap);
  // The play belongs to this check of this configuration and the direction
  // chosen (none until a toggle): an edit, even undone, never brings it back (Y5).
  const player = useWalkPlayer(`${ex.key}|${syntax}|${ex.presses}|${answerKey}|${ex.view.direction ?? ''}`, seq, { stepMs });
  useSkipper(skipper, player);
  const playing = player.playing;
  // The words after the motion: at its end, and kept through a replay (Y6).
  const after = !playing || player.replaying;
  const run = playing ? runAt(seq, player.step) : null;
  const liveRun = run ? runs[run.index] : null;

  // The toggle follows the run under way, then rests on the last one shown (Y10).
  // Under reduced motion nothing played: it rests on the request (fix brief item 7).
  const lastRun = player.reduced ? null : runs?.at(-1)?.direction ?? null;
  const wanted = liveRun?.direction ?? ex.view.direction ?? failure?.direction ?? lastRun ?? 'request';
  const direction = probe?.reply && wanted === 'reply' ? 'reply' : 'request';
  const trace = probe?.[direction] ?? null;
  const staticScene = useMemo(() => {
    if (trace) {
      const s = traceScene(geo, task.topology, trace, attachments);
      // The checked rows may have changed: their markers go with them.
      return stale ? { ...s, ifaces: {}, deviceDrops: {} } : s;
    }
    if (objective?.walk) {
      const s = walkScene(geo, objective.walk, { leaked: objective.leaked });
      return { ...s, ifaces: objective.iface && !stale ? { [objective.iface.id]: objective.iface.status } : {}, deviceDrops: {} };
    }
    return null;
  }, [trace, objective, geo, stale]);
  const scene = run ? sceneAt(liveRun.motion, run.local) : staticScene;
  const tokens = run ? tokensAt(geo, liveRun.motion, run.local) : [];
  const chips = run ? chipsAt(geo, liveRun.motion, run.local) : [];
  const routing = run ? captionAt(liveRun.motion, run.local) : null;
  // A trace in sub-headings (segments, router hops) and lines; an objective's L2 walk in VLAN-1's lines.
  const walkSteps = useMemo(() => (trace ? traceSteps(task, syntax, trace, attachments) : null), [trace, task, syntax]);
  const walkText = useMemo(() => (!trace && objective?.walk ? objectiveLines(task, syntax, objective.walk, attachments) : []), [trace, objective, task, syntax]);
  const walkShown = Boolean(walkSteps) || walkText.length > 0;
  const name = id => endpointName(task, attachments, id);
  // The probe's ends keep their case (RouterOS names are case-sensitive): outside the caption's capitals.
  const walkProbe = probe ? `${routeUi.probe({ from: name(trace.from), to: name(trace.to) })}${result.ok ? ` · ${routeUi.sample}` : ''}` : null;
  const lesson = failure?.kind === 'probe' && probe?.kind === 'management';
  const assumptions = (result?.evidence?.assumptions ?? []).map(code => t(code));
  // One model note: the evidence's under the walk, else the permanent one.
  const modelShown = walkShown && assumptions.length > 0;

  const deviceId = devices.some(d => d.id === ex.view.deviceId) ? ex.view.deviceId : firstDevice(task);
  const device = devices.find(d => d.id === deviceId) ?? devices[0];

  const workRef = useRef(null);
  useHelpInView(workRef, `${ex.key}|${device.id}`);
  const formRef = useRef(null);
  const formHeading = useRef(null);
  const textButton = useRef(null);
  const moreHost = useRef(null);
  const earned = earnedBy(state.instances, identity => (identity.exerciseId === route.id ? identity.taskId : null));
  const foldAsides = useAsideFold(SCREEN);
  // Task 3's aside is long (its limits): it folds on a 1280 × 800 window too, so the whole drawing is in view.
  useShortAside(`route-goal-${task.taskNumber}`, short || (task.taskNumber === 3 && isShort(height, TALL_ASIDE)));
  // Round 5 (R1): what to do first, from the task's own givens (its parent interface, what is left to the learner).
  const action = useMemo(() => interVlanAction(task, syntax), [task, syntax]);
  // The worked example (5b-2 A): its own instance on reserved addresses, in this syntax; never this task's values.
  const example = useMemo(() => interVlanExample({ syntax }), [syntax]);
  // Task 1 is named «Маршрутизатор на паличці»: one line under it says what that means (5b-2 E).
  const onStick = task.taskNumber === 1;
  // After Enter in a field moves the form to another device's marks, focus goes
  // to the first marked control there (else the form's heading), not the page.
  const focusMark = useRef(false);
  useEffect(() => {
    if (!focusMark.current) return;
    focusMark.current = false;
    const bad = workRef.current?.querySelector('.ng-vl-form [aria-invalid="true"], .ng-vl-device-form [aria-invalid="true"]');
    const target = bad?.getAttribute('role') === 'radiogroup' ? bad.querySelector('[tabindex="0"]') : bad;
    (target ?? formHeading.current)?.focus();
  });
  // «Далі →» (another task): focus on the form's heading.
  const focusForm = useRef(false);
  useEffect(() => {
    if (!focusForm.current) return;
    focusForm.current = false;
    // Round 6 repair: on a phone the new task starts at its top; focus doesn't scroll past it.
    formHeading.current?.focus(isPhoneNow() ? { preventScroll: true } : undefined);
  }, [ex.key]);
  // Round 6 (P2): «Текстом» starts open on a phone; the full-screen diagram has a zoom of its own.
  const [textOpen, setTextOpen] = useTextOpen(false);   // closed on a phone (round 6 repair: open, its first view didn't hold the device tabs)
  const expand = useDiagramExpand({ zoom: ex.view.zoom, onZoom: zoom => ex.setView({ zoom }) });
  const hintIndex = ex.session.hintIndex;
  const hintTexts = hintIndex > 0
    ? routeHintTexts(task, route.hints(task, answer, { syntax }), route.compile(task, answer, { syntax }).topology.attachments)
    : Array.from({ length: HINTS }, () => '');

  const save = (nextForm, nextRaw = raw, extra = {}) => ex.setView({ forms: { ...forms, [syntax]: nextForm }, raw: { ...rawAll, [syntax]: nextRaw }, ...extra });
  // The field edited last: a stale verdict's evidence.
  const touched = (dev, field) => ({ edited: { syntax, device: dev, field } });
  const edit = {
    text: (dev, field, text) => ex.setView({ raw: { ...rawAll, [syntax]: { ...raw, [fieldKey(dev, field)]: text } }, ...touched(dev, field) }),
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

  /** The device a failed check names: a form finding's, else task 2's location (round 4). */
  const namedDevice = outcome => {
    const located = outcome.findings?.find(f => f.severity === 'blocks')?.params?.location?.device;
    return devices.some(d => d.id === located) ? located : null;
  };
  /** «Перевірити» (or Enter): typed text parsed, the active syntax checked. */
  function onCheck() {
    const flushed = flushRoute(form, raw);
    const submitted = toRouteAnswer(flushed, syntax);
    const outcome = route.check(task, submitted, { syntax });
    foldAsides();
    ex.check(submitted, { result: outcome });
    // A finding marked on another device's form opens that form; so does the device a verdict names.
    const marked = Object.keys(routeMarks(task, outcome, submitted, syntax));
    const target = marked.find(id => devices.some(d => d.id === id)) ?? (outcome.ok ? null : namedDevice(outcome));
    const goTo = target ? { deviceId: target } : {};
    if (target && target !== deviceId && workRef.current?.querySelector('.ng-vl-device-form')?.contains(document.activeElement)) focusMark.current = true;
    save(flushed, {}, { verdict: { syntax, answer: JSON.stringify(submitted) }, direction: null, ...goTo });
    player.start(`${ex.key}|${syntax}|${ex.presses + 1}|${JSON.stringify(submitted)}|`);
  }
  /** «Інші номери VLAN»: this task with a new seed; the old instance keeps its drafts, and «Попередні номери» goes back to it. */
  function otherNumbers() {
    const next = validSeed(s => buildable(record, s), seed);
    setPlace({ routeSeeds: { ...place.routeSeeds, [record.id]: next }, routePrevious: { ...place.routePrevious, [record.id]: seed } });
  }
  function previousNumbers() {
    if (previousSeed === null) return;
    setPlace({ routeSeeds: { ...place.routeSeeds, [record.id]: previousSeed }, routePrevious: { ...place.routePrevious, [record.id]: seed } });
  }
  /** «Далі →»: the next task this syntax offers (after the last, the first with other numbers). */
  function onNext() {
    const i = offered.indexOf(record);
    focusForm.current = true;
    foldAsides();
    if (i >= 0 && i < offered.length - 1) { setPlace({ routeTask: offered[i + 1].id }); return; }
    const first = offered[0];
    const from = seedOf(first);
    setPlace({ routeTask: first.id, routeSeeds: { ...place.routeSeeds, [first.id]: validSeed(s => buildable(first, s), from) }, routePrevious: { ...place.routePrevious, [first.id]: from } });
  }
  const chooseTask = id => setPlace({ routeTask: id });
  const chooseDevice = id => ex.setView({ deviceId: id });
  const reference = ex.solution ? route.render(ex.solution, syntax, task.topology) : null;

  const previous = stale ? ` · ${ui.previous}` : '';
  // Round 6 repair (Fable 1): «Текстом» says what the drawing shows; route.describe starts with the
  // task's title and its condition, already on the screen (and in «Умова повністю»): left out here.
  const givens = useMemo(() => {
    const lines = route.describe(task, { syntax });
    return [...lines.slice(lines[0] === task.title ? 2 : 0), ...linkLines(task, syntax)];
  }, [task, syntax]);
  const traceText = dir => (probe?.[dir] ? [...(dir === 'request' ? [routeUi.walkAbstraction] : []), ...traceLines(task, syntax, probe[dir], attachments)] : []);
  const sections = [
    { heading: ui.schemeGoals, items: givens },
    { heading: routeUi.devicesTitle, items: devices.map(d => (lines[d.id] ? `${d.id}: ${lines[d.id].map(l => l.text.trim()).join('; ')}` : routeUi.noInterfaces({ device: d.id }))) },
    ...(probe ? DIRECTIONS.filter(dir => probe[dir]).map(dir => ({ heading: `${routeUi.directions[dir]}: ${routeUi.probe({ from: name(probe[dir].from), to: name(probe[dir].to) })}${previous}`, items: traceText(dir) })) : []),
    ...(!probe && walkText.length ? [{ heading: `${ui.walkTitle}${previous}`, items: walkText }] : []),
  ];

  // What the message is about (data-evidence; the panel may sit right after
  // it): a form finding's own row (its words; on another device, its tab);
  // a walk's stop (the step it breaks at); after an edit, the field or the
  // port row edited; a hint before any check, the row, the interface, the
  // block or the device it names.
  const formFailure = failure?.kind === 'form';
  const markedElsewhere = formFailure && !(marks[device.id]?.length) && devices.some(d => marks[d.id]?.length);
  // Repair v1: a failure with no walk whose marks are on another device (task 3: SW1's management) points at that tab.
  const marksElsewhere = !(marks[device.id]?.length) && devices.some(d => marks[d.id]?.length);
  const failing = !stale && !revealCurrent && Boolean(result) && !result.ok;
  const walkEvidence = failing && !formFailure;
  const tabMark = id => marks[id]?.length || (!stale && located === id);
  const edited = stale && ex.view.edited?.syntax === syntax && ex.view.edited.device === device.id ? ex.view.edited.field : null;
  const editedSelector = edited && !edited.startsWith('ports.') ? `[id="vl-${device.id}-${edited.replace(/\./g, '-')}"]` : null;
  /** The named finding's words: its field's row, trimmed to the row whose mark it is. */
  const namedMark = (() => {
    if (!(failing && formFailure && !markedElsewhere)) return null;
    const parts = String(failure.field ?? '').split('.').filter(Boolean);
    const ids = [];
    for (let n = parts.length; n >= 1; n--) ids.push(`[id="vl-${device.id}-mark-${parts.slice(0, n).join('-')}"]`);
    return [...ids, '.ng-vl-mark'].join(', ');
  })();
  const hintNote = (() => {
    if (result || revealCurrent || hintIndex === 0) return null;
    const h = route.hints(task, answer, { syntax }).slice(0, hintIndex).reverse().find(x => x.params && 'device' in x.params);
    if (!h) return null;
    const { device: named = '', port = '', reason } = h.params;
    const at = !named ? 'device'
      : reason === 'management-missing' ? (syntax === 'cisco' ? 'svi' : 'vlanIfs')
      : portIdOf(task.topology, named, port, syntax) && task.topology.devices.find(d => d.id === named)?.kind === 'switch' ? `ports.${portIdOf(task.topology, named, port, syntax)}`
      : syntax === 'cisco' && port === task.topology.devices.find(d => d.id === named)?.ports.find(p => p.id === trunkPort(task, named))?.label.cisco ? 'physical' : 'vlanIfs';
    return { device: named || device.id, at, text: at.startsWith('ports.') || at === 'physical' ? ui.hintNote : routeUi.hintBlock };
  })();
  const note = edited && !editedSelector ? { at: edited.split('.').slice(0, 2).join('.'), text: ui.editedNote }
    : hintNote && hintNote.device === device.id ? { at: hintNote.at, text: hintNote.text } : null;
  const hintTab = hintNote && hintNote.device !== device.id ? hintNote.device : null;
  const walkMark = walkEvidence && !walkSteps && walkText.length ? failingStep(walkText) : -1;

  // The walk in words, after the panel (a failing check's verdict points at it).
  const walkSection = walkShown ? (

          <section className="ng-vl-walk-text" aria-label={probe ? routeUi.walkTitle : ui.walkTitle}>
            <div className="ng-vl-walk-head">
              <h3 className="ng-vl-caption">{probe ? <>{`${routeUi.walkTitle}: `}<span className="ng-vl-probe">{walkProbe}</span>{previous}</> : `${ui.walkTitle}${previous}`}</h3>
              {probe?.reply && (
                <Segmented label={routeUi.direction} value={direction} onChange={value => { player.cancel(); ex.setView({ direction: value }); }} className="ng-vl-directions"
                  options={DIRECTIONS.map(value => ({ value, label: routeUi.directions[value] }))} />
              )}
            </div>
            {walkSteps ? <>
              <p className="ng-vl-abstraction">{routeUi.walkAbstraction}</p>
              {walkSteps.groups.map((group, i) => (
                <div key={i} className={`ng-vl-walk-group is-${group.kind}`}>
                  <h4 className="ng-vl-subhead">{group.heading}</h4>
                  {group.lines.length > 0 && <ol className="ng-vl-steps">{group.lines.map((line, k) => <li key={k}>{line}</li>)}</ol>}
                </div>
              ))}
              <p className="ng-vl-outcome" {...(walkEvidence ? { 'data-evidence': 'current' } : {})}>{walkSteps.outcome}</p>
            </> : <ol className="ng-vl-steps">{walkText.map((line, i) => <li key={i} {...(i === walkMark ? { 'data-evidence': 'current' } : {})}>{line}</li>)}</ol>}
            {lesson && <p className="ng-vl-lesson">{routeNotes.management}</p>}
            {modelShown && <p className="ng-vl-note">{`${routeUi.model}: ${assumptions.join(' ')}`}</p>}
          </section>
  ) : null;

  // The panel's verdict: the check's words whole (the device and port to
  // look at in task 2), a line pointing at the failing walk; after a success, the tips
  // (open) and the lap line.
  const located = failure?.params?.location?.device ?? null;
  const verdict = result ? {
    tone: result.ok ? 'ok' : 'no',
    scope: 'task',
    stamp: ex.presses,
    summary: result.ok ? t('ok') : [...words, ...(markCount > 1 ? [ui.marks({ n: markCount })] : [])].join(' '),
    summaryNode: result.ok ? (after ? <div className="ng-vl-said"><p>{routeUi.lap}</p></div> : null)
      : walkShown ? <WalkPointer what={probe ? `${routeUi.walkTitle}: ${walkProbe}` : ui.walkTitle} /> : null,
    detail: result.ok && tips.length > 0 ? <>
      <p className="ng-vl-tips-head">{ui.tipsTitle}</p>
      <ul className="ng-vl-tips">
        {tips.map(tip => <li key={tip.code}>{tip.device ? ui.line({ where: tip.device, text: t(tip.code, tip.params) }) : t(tip.code, tip.params)}</li>)}
      </ul>
    </> : null,
  } : null;
  return (
    <>
      <div className="ng-vl-side">
        <header className="ng-vl-head">
          {head}
          <SheetChoice stepper label={ui.task} value={record.id} onChange={chooseTask} className="ng-vl-variants"
            options={offered.map(r => ({ value: r.id, label: <>{`${r.variants[0].task} · ${routeUi.taskShort[r.id] ?? r.variants[0].title}`}<DoneMark done={earned.has(r.id)} /></>, title: r.variants[0].title, step: routeUi.taskShort[r.id] ?? r.variants[0].title }))} />
          <MoreMenu disclosureHost={moreHost} items={[
            { id: 'other', label: ui.otherNumbersMenu, onSelect: otherNumbers },
            previousSeed !== null && { id: 'previous', label: ui.previousNumbers, onSelect: previousNumbers },
          ]} />
        </header>
        <div className="ng-vl-intro">
          <p className="ng-vl-task-text"><b>{task.title}.</b> {routeUi.taskOne[task.taskNumber] ?? routeText[task.taskNumber]}</p>
          {task.management && <p className="ng-vl-givens">{routeUi.managementGivens(task.management)}</p>}
          {/* Round 5 (5b-2 E): what «на паличці» means, under the task that is named so. */}
          {onStick && <p className="ng-vl-stick">{comprehension.routerOnStick}</p>}
          <Aside screen={SCREEN} id={`route-goal-${task.taskNumber}`} title={routeUi.goalTitle}>
            {/* The task's own words are its line above; task 3 adds its limits (Fable 3: the diagram fits with this open). */}
            {task.taskNumber === 3 && <p className="ng-vl-note">{routeNotes.managementLimits}</p>}
            <p className="ng-vl-lesson">{routeUi.taskGoal}</p>
            {task.taskNumber === 4 && <p className="ng-vl-note">{routeUi.ciscoNoBridge}</p>}
            {/* One model note: the evidence's under the walk, else this one. */}
            {!modelShown && <p className="ng-vl-note">{routeNotes.assumptions}</p>}
            {syntax === 'cisco' && task.management && <p className="ng-vl-note">{routeNotes.sviActive}</p>}
          </Aside>
        </div>
        <section className="ng-vl-stage" aria-label={ui.diagramLabel}>
          {stale && scene && <p className="ng-vl-previous">{ui.previous}</p>}
          <DiagramExpand expand={expand}>
          <VlanDiagram geo={geo} topology={task.topology} zoom={expand.zoom} onZoom={expand.onZoom} viewKey={ex.key}
            covered={expand.covered(textOpen)} scene={scene} third={third} fourth={fourth} activeSwitch={device.id} onSwitch={chooseDevice}
            tokens={tokens} chips={chips} stepMs={stepMs} caption={routing ? routeUi.newFrame(routing) : null}
            tools={<>
              <TextEquivalentButton buttonRef={textButton} id="ng-vl-text" label={ui.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(sections)} />
              <ExpandButton expand={expand} />
              {seq && !player.reduced && <button type="button" className="ng-vl-btn ng-vl-replay" onClick={player.replay}>{ui.replay}</button>}
            </>}
            overlays={<TextEquivalent id="ng-vl-text" title={ui.textTitle} sections={sections} open={expand.covered(textOpen)} onClose={() => { setTextOpen(false); textButton.current?.focus(); }} />} />
          </DiagramExpand>
        </section>
      </div>

      <section ref={workRef} className="ng-vl-work" aria-label={ui.exercises.route} {...taskCounts({
        hosts: task.topology.hosts.length, devices: task.topology.devices.filter(d => d.kind !== 'host').length, gateways: task.topology.hosts.filter(h => h.gateway).length })}>
        <ActionLine id="ng-vl-route-action">{action}</ActionLine>
        <WorkedExample taskKey={`${task.instanceKey}:${syntax}`} context={example.context} rows={exampleLines(example)} />
        <div className="ng-vl-form-head">
          <h2 ref={formHeading} tabIndex={-1} className="ng-vl-caption">{ui.form({ device: device.id })}</h2>
          <Segmented label={routeUi.deviceTabs} value={device.id} onChange={chooseDevice} className="ng-vl-switches"
            options={devices.map(d => ({ value: d.id, label: <span {...((failing && (markedElsewhere || (!walkShown && marksElsewhere)) && marks[d.id]?.length) || hintTab === d.id ? { 'data-evidence': 'current' } : {})}>{`${d.id}${tabMark(d.id) ? ' •' : ''}`}</span> }))} />
        </div>
        {/* The board: the form and the walk in words (a failing walk's stop can carry the panel beside it). */}
        <div ref={formRef} className="ng-vl-board">
          <RouteForm key={`${ex.key}|${syntax}|${device.id}`} task={task} device={device} syntax={syntax} form={form} raw={raw}
            marks={marks[device.id] ?? []} edit={edit} onCheck={onCheck} config={effective} note={note} />
          {walkSection}
        </div>
        <EvidenceMark within={editedSelector ? workRef : formRef} selector={editedSelector ?? namedMark ?? '.ng-vl-mark'} active={Boolean(editedSelector) || Boolean(namedMark) || (failing && !walkShown && Boolean(marks[device.id]?.length))} />
        <HelpPanel
          taskKey={task.instanceKey}
          boardRef={formRef}
          check={{ label: ui.check, onCheck }}
          verdict={verdict}
          stale={stale}
          hints={{ texts: hintTexts, shown: hintIndex, onMore: () => ex.hint(HINTS) }}
          reveal={{
            revealed: ex.session.revealed, onReveal: () => { ex.reveal(); ex.setView({ revealedAt: ex.presses }); },
            render: () => (
              <div className="ng-vl-reference">
                {devices.map(d => (
                  <div key={d.id}>
                    <h3 className="ng-vl-caption">{ui.commandsOf({ device: d.id })}</h3>
                    <Commands device={d.id} text={reference?.[d.id] ?? ''} copy={false} />
                  </div>
                ))}
              </div>
            ),
          }}
          next={{ onNext }}
        />
        <CommandsFold device={device.id} text={commands[device.id] ?? ''} note={commandNotes(task, device.id, syntax)} empty={routeUi.noCommands}
          fold={result && !stale ? `v${ex.presses}` : null} />
        <div ref={moreHost} className="ng-vl-more-host" />
      </section>
    </>
  );
}
