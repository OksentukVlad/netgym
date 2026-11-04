// «Налаштуй порти» (VLAN-1 spec §3–§4 with v2 W2–W6, W8): four tasks, each
// a seeded network whose PCs carry their VLAN on the diagram (a given). Per
// switch, a form in the chosen syntax (PortsForm.jsx); under it the
// switch's commands, rendered live from the form, with copy, and the fixed
// note (the RouterOS safety note, or the `nonegotiate` line).
//
// «Перевірити» (or Enter in a field) checks the active syntax's answer by
// behaviour (ports.js check):
//   - a failure draws its failing probe's walk on the diagram (or the
//     objective's), says one sentence, its diagnosis if there is one, and
//     marks the fields a form finding names; the walk in words is under the
//     diagram, with the reachability line;
//   - a success colours and numbers the broadcast domains, each with the
//     VLAN the answer actually uses («Домен 1 — VLAN 300: PC1, PC3»; an
//     equivalent renumbering passes, so the PCs' «мета: VLAN 10» is the
//     task's goal), and gives up to two tips.
// After an edit the last verdict stays, labelled «Попередня перевірка», and
// fields edited since lose their marks. «Інші номери» reseeds the task; the
// old instance keeps its drafts and «Попередні номери» goes back to it.
// The hints are the three rungs of ports.hints for the current form; the
// reveal shows the reference commands (useExercise's solution, once
// revealed) and marks the task assisted.
//
// State (portsState.js): one instance per task and seed, shared by both
// syntaxes (the identity has no syntax). Its view keeps a form per syntax,
// never converted, and the verdict's syntax: a result is shown only in the
// syntax it was checked in, and a switch clears it, so a verdict never
// carries across. The place keeps the task and each task's seed.
//
// Motion (VLAN-anim spec v2): a failure's walk plays on the diagram
// (walkSteps.js floodMotion), its end frame today's static walk; a success
// plays a short lap, one broadcast per VLAN one after another in its
// domain's colour (Y9), then the domains and «Кожен VLAN тримає свої кадри
// при собі». The play belongs to the check: an edit (a stale verdict), a
// syntax switch or a new check ends it; any press skips it; «Показати ще
// раз» replays it (Y5, Y7).
//
// Round 4 (spec F4): the help panel (check, hints, reveal) sits right under
// the form, its verdict whole (no clipped two lines), the failing walk in
// words with it; the live commands under it fold to one line while a
// verdict is open (openable by hand). A form taller than half the window is
// a long board (spec A v3): the panel goes before it and, when the row a
// verdict names can't be seen with it, right after that row. The
// DTP explanation is said once, in the verdict's «Детальніше»; the
// nonegotiate note is an aside, only in tasks with a trunk; the RouterOS
// safety note likewise. «Далі →» moves to the next task (a quiet skip before
// a success), «Інші номери VLAN» and «Попередні номери» are in «⋯». The
// tasks carry a quiet ✓ once solved without a reveal. The walk in words, the
// domains and the lap line follow the panel in the work column.
//
// Leaks: before «Показати відповідь» nothing on screen comes from the
// reference: the forms start blank (ports.initialAnswer), the hints carry
// only the submitted answer's facts, and the commands are the student's own.
import { useEffect, useMemo, useRef, useState } from 'react';
import ports from '../logic/ports.js';
import { isTrunk, switches as switchesOf } from '../logic/model.js';
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
import { portsExample } from '../logic/examples.js';
import VlanDiagram from './VlanDiagram.jsx';
import PortsForm from './PortsForm.jsx';
import { useFactHighlight } from './factHighlight.js';
import Commands from './Commands.jsx';
import { CommandsFold, exampleLines, failingStep, hostLines, hostPort, portIdOf, taskCounts, SCREEN, WalkPointer, WalkWords } from './panel.jsx';
import { compactPcWidth, layout } from './diagram.js';
import { chipsAt, floodMotion, runAt, sceneAt, sequence, stepMsFor, tokensAt } from './walkSteps.js';
import { useSkipper, useWalkPlayer } from './walkPlayer.js';
import {
  blankForm, blankRow, domainLegend, failureOf, fieldKey, flush, freshMarks, marksOf, parseField, tipsOf, toAnswer, toggleMember, verdictOf, writeField,
} from './portsState.js';
import { firstValidSeed, validSeed } from './predictState.js';
import { notes, t, ui } from '../uk.js';

const HINTS = 3;

/** The task's words, with its VLAN numbers (A, B, C in order). */
export function taskText(task) {
  const [a, b, c] = task.vids;
  const text = ui.taskText[task.identity.taskId];
  return text ? text({ a, b, c }) : '';
}

/** The walk's words for ports: describe() after the givens it repeats. */
export function portsWalkLines(task, syntax, walk) {
  if (!walk) return [];
  const givens = ports.describe(task, { syntax }).length;
  return ports.describe(task, { syntax, walks: [walk] }).slice(givens);
}

/** Whether a task's network has a trunk (a link between two switches or to a router): the nonegotiate note's tasks. */
export const hasTrunk = task => task.topology.links.some(l => [l.a, l.b].every(end => task.topology.devices.find(d => d.id === end.device)?.kind !== 'host'));

/** A port's label in a syntax. */
const labelOf = (task, device, port, syntax) => task.topology.devices.find(d => d.id === device)?.ports.find(p => p.id === port)?.label[syntax] ?? port;

/** The one sentence a failure says, with its where: a field, a pair of PCs or a PC. */
export function failureWords(task, failure, syntax) {
  if (!failure) return [];
  // The task's VLANs are its goals: the answer may number them otherwise.
  const goal = host => `${host} (${ui.goal(task.goals[host])})`;
  if (failure.kind === 'form') {
    const where = failure.device ? ui.at({ device: failure.device, port: failure.port ? labelOf(task, failure.device, failure.port, syntax) : null }) : null;
    return [where ? ui.line({ where, text: t(failure.code) }) : t(failure.code)];
  }
  if (failure.kind === 'objective') return [ui.line({ where: goal(failure.from), text: t(failure.code) })];
  if (failure.kind === 'probe') {
    const lines = [ui.line({ where: ui.pair({ from: goal(failure.from), to: goal(failure.to) }), text: t(failure.code) })];
    if (failure.diagnosis) lines.push(t(failure.diagnosis));
    if (failure.reverse && failure.walk) {
      const to = failure.walk.from === failure.from ? failure.to : failure.from;
      lines.push(ui.oneWay({ from: failure.walk.from, to }));
    }
    return lines;
  }
  return [t(failure.code)];
}

/**
 * @param {{ records: object[], syntax: 'cisco'|'routeros', place: object, setPlace: Function, head: any }} props
 */
export default function PortsView({ records, syntax, place, setPlace, head, skipper = null }) {
  const record = records.find(r => r.id === place.portsTask) ?? records[0];
  const buildable = s => ['cisco', 'routeros'].every(x => { try { ports.create(record, { variantId: record.variants[0].id, seed: s, syntax: x }); return true; } catch { return false; } });
  const seed = place.portsSeeds?.[record.id] ?? firstValidSeed(buildable);
  const previousSeed = place.portsPrevious?.[record.id] ?? null;
  const ex = useExercise(ports, record, { variantId: record.variants[0].id, seed, syntax });
  const { task } = ex;
  // Without a trunk Bridge → VLANs adds nothing the PVIDs don't: the action line doesn't ask for it (Андрій 1).
  const trunked = switchesOf(task.topology).some(d => d.ports.some(p => isTrunk(task.topology, d.id, p.id)));
  const { state } = useStore();
  const foldAsides = useAsideFold(SCREEN);
  const earned = earnedBy(state.instances, identity => (identity.exerciseId === ports.id ? identity.taskId : null));
  const switches = task.topology.devices.filter(d => d.kind === 'switch');
  const forms = ex.view.forms ?? {};
  const rawAll = ex.view.raw ?? {};
  const form = useMemo(() => forms[syntax] ?? blankForm(task, syntax), [forms[syntax], task, syntax]);
  const raw = rawAll[syntax] ?? {};
  // What the student has now, typed text included: the live commands and the check.
  const live = useMemo(() => flush(form, raw), [form, raw]);
  const answer = useMemo(() => toAnswer(live, syntax), [live, syntax]);
  const answerKey = JSON.stringify(answer);
  const commands = useMemo(() => ports.render(answer, syntax, task.topology), [answerKey, syntax, task]);

  // The verdict, only in the syntax it was checked in; a switch clears it.
  useEffect(() => {
    if (ex.view.verdict && ex.view.verdict.syntax !== syntax) ex.setView({ verdict: null });
  }, [syntax, ex.key]);
  const shown = verdictOf(ex.result, ex.view.verdict, syntax, answerKey);
  const result = shown?.result ?? null;
  const stale = Boolean(shown?.stale);
  const failure = result && !result.ok ? failureOf(task, result) : null;
  // A field edited since the check loses its mark (it may be right now).
  // A reveal is current until a later check: then nothing on the board is the message's evidence,
  // and the checked answer's field marks go (stage-1 decision 6, Fable 2).
  const revealCurrent = ex.session.revealed && ex.presses <= (ex.view.revealedAt ?? Infinity);
  const marks = useMemo(() => (result && !result.ok && !revealCurrent ? freshMarks(marksOf(result), JSON.parse(ex.view.verdict.answer), answer) : {}), [result, answerKey, revealCurrent]);
  const legend = result?.ok ? domainLegend(task, result.evidence.domains, result.evidence) : null;
  const tips = result?.ok ? tipsOf(result) : [];

  // Round 5: the compact drawing of «Між VLAN» and «Знайди несправність» too, so every PC's goal is on the first view at 1000 × 700.
  const { third } = useMemo(() => hostLines(task), [task]);
  const geo = useMemo(() => layout(task.topology, syntax, { compact: true, pcWidth: compactPcWidth(task.topology, third) }), [task, syntax, third]);
  // Leaked: every PC the failing walk reached whose goal differs from the
  // sender's, not only the probe's partner (so no other-VLAN PC shows «✓»).
  const leaked = failure?.walk ? [failure.leaked, ...[...failure.walk.received].filter(h => task.goals[h] !== task.goals[failure.walk.from])] : [];
  const leakedKey = JSON.stringify([...new Set(leaked)]);
  const failureMotion = useMemo(() => (failure?.walk ? floodMotion(geo, failure.walk, { leaked: JSON.parse(leakedKey) }) : null), [geo, failure?.walk, leakedKey]);
  // The success lap (Y9): each domain's first PC's broadcast, from the checked evidence, in legend order.
  const lap = useMemo(() => {
    if (!result?.ok || !legend) return null;
    const walks = (result.evidence.probes ?? []).flatMap(p => p.walks ?? []);
    const runs = legend.map(d => ({ walk: walks.find(w => w.from === d.hosts[0]), tone: d.colour })).filter(r => r.walk);
    return runs.map(r => ({ motion: floodMotion(geo, r.walk), tone: r.tone }));
  }, [result, geo]);
  const seq = useMemo(() => (stale ? null : failureMotion ? sequence([failureMotion]) : lap?.length ? sequence(lap.map(r => r.motion)) : null), [stale, failureMotion, lap]);
  // The play belongs to this check of this configuration: an edit, even undone, never brings it back (Y5).
  const player = useWalkPlayer(`${ex.key}|${syntax}|${ex.presses}|${answerKey}`, seq, { stepMs: stepMsFor(seq?.total ?? 0, Boolean(lap)) });
  useSkipper(skipper, player);
  const playing = player.playing;
  // The words after the motion: at its end, and kept through a replay (Y6).
  const after = !playing || player.replaying;
  const run = playing ? runAt(seq, player.step) : null;
  const lapTone = run && lap ? lap[run.index].tone : null;
  const scene = run ? sceneAt(run.run.motion, run.local) : failureMotion?.scene ?? null;
  const tokens = run ? tokensAt(geo, run.run.motion, run.local, lapTone) : [];
  const chips = run ? chipsAt(geo, run.run.motion, run.local) : [];
  const givens = useMemo(() => ports.describe(task, { syntax }), [task, syntax]);
  const example = useMemo(() => portsExample({ syntax }), [syntax]);
  const walkText = useMemo(() => portsWalkLines(task, syntax, failure?.walk ?? null), [task, syntax, failure?.walk]);
  // The reachability note goes above the numbered steps, not as step 1.
  const abstraction = walkText[0] === t('reachability-abstraction') ? walkText[0] : null;
  const steps = abstraction ? walkText.slice(1) : walkText;
  // A port with no mode: the short words here, the DTP explanation once, in «Детальніше».
  const words = failureWords(task, failure, syntax).map(line => (failure?.code === 'mode-not-set' ? line.replace(t('mode-not-set'), ui.modeNotSet) : line));
  const markCount = Object.values(marks).reduce((n, list) => n + list.length, 0);

  const switchId = switches.some(d => d.id === ex.view.switchId) ? ex.view.switchId : switches[0].id;
  const device = switches.find(d => d.id === switchId);
  // Round 5 (R3): a port tapped in the form outlines its label on the diagram, for this task, syntax and switch.
  const stageRef = useRef(null);
  const facts = useFactHighlight(`${ex.key}|${syntax}|${device.id}`, stageRef);
  const domains = after ? legend?.map(d => ({ n: d.n, hosts: d.hosts, colour: d.colour })) ?? null : null;

  const workRef = useRef(null);
  // Round 6 repair: a device tab change re-anchors the help panel (HelpPanel viewKey) and scrolls it with its evidence.
  const boardRef = useRef(null);
  const formHeading = useRef(null);
  const textButton = useRef(null);
  const moreHost = useRef(null);
  // After Enter in a field moves the form to another switch's marks, focus goes
  // to the first marked control there (else the form's heading), not the page.
  const focusMark = useRef(false);
  useEffect(() => {
    if (!focusMark.current) return;
    focusMark.current = false;
    const bad = workRef.current?.querySelector('.ng-vl-form [aria-invalid="true"]');
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
  const [textOpen, setTextOpen] = useTextOpen();
  const expand = useDiagramExpand({ zoom: ex.view.zoom, onZoom: zoom => ex.setView({ zoom }) });
  const hintIndex = ex.session.hintIndex;
  const hintTexts = hintIndex > 0
    ? ports.hints(task, answer, { syntax }).map(h => t(h.code, h.params))
    : Array.from({ length: HINTS }, () => '');

  const edited = ex.view.edited?.syntax === syntax && ex.view.edited.device === device.id ? ex.view.edited.field : null;
  const save = (nextForm, nextRaw = raw, extra = {}) => ex.setView({ forms: { ...forms, [syntax]: nextForm }, raw: { ...rawAll, [syntax]: nextRaw }, ...extra });
  const touched = (sw, field) => ({ edited: { syntax, device: sw, field } });
  const edit = {
    text: (sw, field, text) => ex.setView({ raw: { ...rawAll, [syntax]: { ...raw, [fieldKey(sw, field)]: text } }, ...touched(sw, field) }),
    blur(sw, field) {
      const key = fieldKey(sw, field);
      if (typeof raw[key] !== 'string') return;
      const { [key]: text, ...rest } = raw;
      save(writeField(form, sw, field, parseField(field, text)), rest);
    },
    set: (sw, field, value) => save(writeField(form, sw, field, value), raw, touched(sw, field)),
    addRow: sw => save(writeField(form, sw, 'vlans', [...form[sw].vlans, blankRow()]), raw, touched(sw, `vlans.${form[sw].vlans.length}.vids`)),
    removeRow(sw, index) {
      // Typed texts of this switch's rows go into the form first; row indices then shift.
      const flushed = flush(form, raw);
      const rest = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith(`${sw}|vlans.`)));
      save(writeField(flushed, sw, 'vlans', flushed[sw].vlans.filter((_, i) => i !== index)), rest, touched(sw, 'vlans'));
    },
    member: (sw, index, kind, port) => save(toggleMember(form, sw, index, kind, port), raw, touched(sw, `vlans.${index}.${kind}`)),
  };

  /** «Перевірити» (or Enter): typed text parsed, the active syntax checked. */
  function onCheck() {
    const flushed = flush(form, raw);
    const submitted = toAnswer(flushed, syntax);
    const outcome = ports.check(task, submitted, { syntax });
    foldAsides();
    ex.check(submitted, { result: outcome });
    const first = outcome.ok ? null : failureOf(task, outcome);
    const goTo = first?.kind === 'form' && switches.some(d => d.id === first.device) ? { switchId: first.device } : {};
    if (goTo.switchId && goTo.switchId !== switchId && workRef.current?.querySelector('.ng-vl-form')?.contains(document.activeElement)) focusMark.current = true;
    save(flushed, {}, { verdict: { syntax, answer: JSON.stringify(submitted) }, ...goTo });
    player.start(`${ex.key}|${syntax}|${ex.presses + 1}|${JSON.stringify(submitted)}`);
  }
  /** «Інші номери VLAN»: this task with a new seed; the old instance keeps its drafts, and «Попередні номери» goes back to it. */
  function otherNumbers() {
    const next = validSeed(buildable, seed);
    setPlace({ portsSeeds: { ...place.portsSeeds, [record.id]: next }, portsPrevious: { ...place.portsPrevious, [record.id]: seed } });
  }
  function previousNumbers() {
    if (previousSeed === null) return;
    setPlace({ portsSeeds: { ...place.portsSeeds, [record.id]: previousSeed }, portsPrevious: { ...place.portsPrevious, [record.id]: seed } });
  }
  /** «Далі →»: the next task (after the last, the first with other numbers). */
  function onNext() {
    const i = records.indexOf(record);
    focusForm.current = true;
    foldAsides();
    if (i < records.length - 1) { setPlace({ portsTask: records[i + 1].id }); return; }
    const first = records[0];
    const ok = s => ['cisco', 'routeros'].every(x => { try { ports.create(first, { variantId: first.variants[0].id, seed: s, syntax: x }); return true; } catch { return false; } });
    const from = place.portsSeeds?.[first.id] ?? null;
    setPlace({ portsTask: first.id, portsSeeds: { ...place.portsSeeds, [first.id]: validSeed(ok, from) }, portsPrevious: { ...place.portsPrevious, [first.id]: from } });
  }
  const chooseTask = id => setPlace({ portsTask: id });
  const chooseSwitch = id => ex.setView({ switchId: id });
  const reference = ex.solution ? ports.render(ex.solution, syntax, task.topology) : null;

  const previous = stale ? ` · ${ui.previous}` : '';
  const sections = [
    { heading: ui.schemeGoals, items: givens },
    ...(walkText.length ? [{ heading: `${ui.walkTitle}${previous}`, items: walkText }] : []),
    ...(legend ? [{ heading: `${ui.domainsTitle}${previous}`, items: legend.map(d => ui.portsDomain(d)) }] : []),
  ];

  // What the message is about (data-evidence, the panel may sit right after
  // it): a form finding's row (its words; on another switch, its tab); a
  // walk's failing step; after an edit, the field or the port row edited; a
  // hint before any check, the port it names (its PC's port, or the move's).
  const formFailure = failure?.kind === 'form';
  const markedElsewhere = formFailure && failure.device && failure.device !== device.id && !(marks[device.id]?.length);
  const walkEvidence = !stale && !revealCurrent && Boolean(result) && !result.ok && !formFailure;
  const editedOut = stale && edited && !edited.startsWith('ports.');
  const editedRow = stale && edited && edited.startsWith('ports.') ? edited.split('.').slice(0, 2).join('.') : null;
  const target = failure?.walk ? hostPort(task.topology, failure.walk.from === failure.from ? failure.to : failure.from) : null;
  const failMark = walkEvidence && walkText.length ? failingStep(steps, target ? { device: target.device, port: labelOf(task, target.device, target.port, syntax), host: failure.walk.from === failure.from ? failure.to : failure.from } : {}) : -1;
  const hinted = (() => {
    if (result || revealCurrent || hintIndex === 0) return null;
    const list = ports.hints(task, answer, { syntax }).slice(0, hintIndex).reverse();
    for (const h of list) {
      if (h.params?.device && h.params?.port) {
        const id = portIdOf(task.topology, h.params.device, h.params.port, syntax);
        if (id) return { device: h.params.device, row: `ports.${id}` };
      }
      if (h.params?.host) { const hp = hostPort(task.topology, h.params.host); if (hp) return { device: hp.device, row: `ports.${hp.port}` }; }
    }
    return null;
  })();
  const tabEvidence = !stale && !revealCurrent && markedElsewhere ? failure.device
    : hinted && hinted.device !== device.id ? hinted.device : null;
  const note = editedRow ? { row: editedRow, text: ui.editedNote }
    : hinted && hinted.device === device.id ? { row: hinted.row, text: ui.hintNote } : null;

  // The panel's verdict: the check's words whole; the DTP explanation once,
  // in «Детальніше»; after a success, the tips (open) and the lap line.
  const dtp = failure?.code === 'mode-not-set';
  const verdict = result ? {
    tone: result.ok ? 'ok' : 'no',
    scope: 'task',
    stamp: ex.presses,
    summary: result.ok ? t('ok') : [...words, ...(markCount > 1 ? [ui.marks({ n: markCount })] : [])].join(' '),
    summaryNode: result.ok ? (after ? <div className="ng-vl-said"><p>{ui.portsLap}</p></div> : null)
      : walkText.length > 0 ? <WalkPointer what={failure?.walk ? `${ui.walkTitle}: ${failure.walk.from}` : ui.walkTitle} /> : null,
    detail: result.ok ? (tips.length > 0 ? <>
      <p className="ng-vl-tips-head">{ui.tipsTitle}</p>
      <ul className="ng-vl-tips">
        {tips.map(tip => <li key={`${tip.code}|${tip.device}`}>{ui.line({ where: ui.at({ device: tip.device, port: tip.port ? labelOf(task, tip.device, tip.port, syntax) : null }), text: t(tip.code) })}</li>)}
      </ul>
    </> : null) : dtp ? <p>{t('mode-not-set')}</p> : null,
  } : null;
  return (
    <>
      <div className="ng-vl-side">
        <header className="ng-vl-head">
          {head}
          <SheetChoice stepper label={ui.task} value={record.id} onChange={chooseTask} className="ng-vl-variants"
            options={records.map((r, i) => ({ value: r.id, label: <>{`${i + 1} · ${ui.taskShort[r.id] ?? r.variants[0].title}`}<DoneMark done={earned.has(r.id)} /></>, title: r.variants[0].title, step: ui.taskShort[r.id] ?? r.variants[0].title }))} />
          <MoreMenu disclosureHost={moreHost} items={[
            { id: 'other', label: ui.otherNumbersMenu, onSelect: otherNumbers },
            previousSeed !== null && { id: 'previous', label: ui.previousNumbers, onSelect: previousNumbers },
          ]} />
        </header>
        <div className="ng-vl-intro">
          <p className="ng-vl-task-text"><b>{task.title}.</b> {taskText(task)}</p>
          <Aside screen={SCREEN} id="ports-goal" title={ui.goalTitle}>
            <p className="ng-vl-lesson">{ui.taskGoal}</p>
            <p className="ng-vl-note">{t('network-convention')}</p>
          </Aside>
        </div>
        <section ref={stageRef} className="ng-vl-stage" aria-label={ui.diagramLabel}>
          {stale && (scene || legend) && <p className="ng-vl-previous">{ui.previous}</p>}
          <DiagramExpand expand={expand}>
          <VlanDiagram geo={geo} topology={task.topology} zoom={expand.zoom} onZoom={expand.onZoom} viewKey={ex.key}
            covered={expand.covered(textOpen)} scene={scene} domains={domains} third={third} activeSwitch={device.id} onSwitch={chooseSwitch} tokens={tokens} chips={chips}
            highlight={facts.highlight}
            stepMs={stepMsFor(seq?.total ?? 0, Boolean(lap))}
            tools={<>
              <TextEquivalentButton buttonRef={textButton} id="ng-vl-text" label={ui.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(sections)} />
              <ExpandButton expand={expand} />
              {seq && !player.reduced && <button type="button" className="ng-vl-btn ng-vl-replay" onClick={player.replay}>{ui.replay}</button>}
            </>}
            overlays={<TextEquivalent id="ng-vl-text" title={ui.textTitle} sections={sections} open={expand.covered(textOpen)} onClose={() => { setTextOpen(false); textButton.current?.focus(); }} />} />
          </DiagramExpand>
        </section>
      </div>

      <section ref={workRef} className="ng-vl-work" aria-label={ui.exercises.ports} {...taskCounts({ hosts: task.topology.hosts.length, ports: device.ports.length,
          hostports: task.topology.links.filter(l => [[l.a, l.b], [l.b, l.a]].some(([own, other]) => own.device === device.id && task.topology.hosts.some(h => h.device === other.device))).length })}>
        <div className="ng-vl-form-head">
          <h2 ref={formHeading} tabIndex={-1} className="ng-vl-caption">{ui.form({ device: device.id })}</h2>
          {switches.length > 1 && (
            <Segmented label={ui.switchTabs} value={device.id} onChange={chooseSwitch} className="ng-vl-switches"
              options={switches.map(d => ({ value: d.id, label: <span {...(tabEvidence === d.id ? { 'data-evidence': 'current' } : {})}>{`${d.id}${marks[d.id]?.length ? ' •' : ''}`}</span> }))} />
          )}
        </div>
        {/* The board: the form and, after a failing check, the walk in words (its failing step can carry the panel beside it). */}
        <div ref={boardRef} className="ng-vl-board">
          <PortsForm key={`${ex.key}|${syntax}|${device.id}`} device={device} syntax={syntax} form={form} raw={raw} marks={marks[device.id] ?? []} edit={edit} onCheck={onCheck}
            topology={task.topology} note={note} highlight={facts.highlight} onFact={facts.onFact}
            action={<>
              <ActionLine id="ng-vl-ports-action">{ui.portsAction[syntax === 'routeros' && !trunked ? 'routerosAccess' : syntax]}</ActionLine>
              {/* The worked example (5b-2 A): one configured port of its own instance, in this syntax. */}
              <WorkedExample taskKey={`${task.instanceKey}:${syntax}`} context={example.context} rows={exampleLines(example)} />
            </>}
            evidence={Boolean(result) && !stale && !revealCurrent && formFailure ? (failure.port ? `ports.${failure.port}` : true) : false} edited={editedOut ? edited : null} />
          {walkText.length > 0 && <WalkWords title={`${ui.walkTitle}${previous}`} note={abstraction} steps={steps} mark={failMark} />}
        </div>
        <HelpPanel
          taskKey={task.instanceKey}
          boardRef={boardRef}
          placement="after"
          viewKey={device.id}
          check={{ label: ui.check, onCheck }}
          verdict={verdict}
          stale={stale}
          hints={{ texts: hintTexts, shown: hintIndex, onMore: () => ex.hint(HINTS) }}
          reveal={{
            revealed: ex.session.revealed, onReveal: () => { ex.reveal(); ex.setView({ revealedAt: ex.presses }); },
            render: () => (
              <div className="ng-vl-reference">
                {switches.map(d => (
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
        <CommandsFold device={device.id} text={commands[device.id] ?? ''} fold={result && !stale ? `v${ex.presses}` : null} />
        {syntax === 'cisco' && hasTrunk(task) && <Aside screen={SCREEN} id="nonegotiate" title={ui.dtpTitle}><p className="ng-vl-note">{notes.cisco}</p></Aside>}
        {syntax === 'routeros' && <Aside screen={SCREEN} id="routeros-safety" title={ui.safetyTitle}><p className="ng-vl-note">{notes.routeros}</p></Aside>}
        {legend && after && (
          <section className="ng-vl-legend" aria-label={ui.domainsTitle}>
            <h3 className="ng-vl-caption">{`${ui.domainsTitle}${previous}`}</h3>
            <ul className="ng-vl-legend-list">
              {legend.map(d => <li key={d.n} className={`ng-vl-d${d.colour}`}><span className="ng-vl-swatch" aria-hidden="true">{d.n}</span> {ui.portsDomain(d)}</li>)}
            </ul>
          </section>
        )}
        <div ref={moreHost} className="ng-vl-more-host" />
      </section>
    </>
  );
}
