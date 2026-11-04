// «Куди дійде кадр» (VLAN-1 spec §2, §4 with v2 W1, W6, W7, W9): a small
// switched network, every switch's configuration given in the chosen
// syntax, and three or four rounds. Each round names a source PC: «PC1
// надсилає широкомовний кадр… Хто з ПК його отримає?» The student taps the
// PCs (on the diagram, or the buttons in the work panel: the keyboard path)
// or «Нікому», then «Перевірити» commits the round through predict.js
// commit(): it locks, right or wrong, with no retry. Then the walk shows, on
// the diagram and in words under the choices: where the frame enters a VLAN, the
// tags it gets on trunks, the untag on the way out of an access port, the
// drops with their reasons, who received it, and a PC that received it from
// another network. A wrong commit marks nothing per PC: «Ще ні» and the
// walk. After the last round the broadcast domains are coloured and
// numbered on the diagram, with a legend.
//
// Round 4 (spec F3): the work column is the round's question, the PCs as
// checkboxes (an empty box before a choice; every PC in host order, the
// round's sender in its place, «Нікому» last, so nothing moves between
// rounds), the help panel right under them (the verdict; «Наступний раунд →»
// after a commit; «Далі →» after the last round, a quiet skip before it),
// then the path in words, then the whole given configuration, which stays
// as it is after a commit (it is the path's evidence). The primer «Як
// рухається кадр» is a first-visit aside. The shapes carry a quiet ✓ once a
// round of theirs was all right.
//
// State (predictState.js): the place keeps each shape's instance per vendor
// (seed and level), so the syntax switch opens or returns to that vendor's
// own instance; «Далі →» moves the shape's level 0 → 1 → 2 there. The
// instance's view keeps the drafts, the round on screen and the commit
// state. Each commit is one check in the session; nothing is counted on
// screen.
//
// Motion (VLAN-anim spec v2): after each commit the round's broadcast plays
// on the diagram (walkSteps.js floodMotion: one frame per real egress, by
// causal depth), then the end frame is today's static walk. «Кадр
// отримали: …» and, after the last round, the domains come at the walk's end
// (Y6); «Показати ще раз» replays it, any press skips it, and another round
// on screen shows its static result (Y5, Y7).
//
// Leaks: before a round is committed, nothing on screen depends on who will
// receive its frame. The diagram shows the network, the round's source and
// the student's own taps; the buttons' names are a PC; the given
// configuration is the same before and after. The walk, the received set
// and the domains come only from commit()'s evidence, after commitment.
//
// Round 5 (spec 5b-1 §4 v2): under the question, the port evidence
// (EvidenceTable.jsx: «комутатор · порт · ПК · налаштований VLAN / PVID»,
// from the given configuration only), each port a FactLink to its label on
// the diagram; then the action line «Познач ПК, які отримають кадр.» naming
// the choices (after the commit it says so, in place); the choices carry
// the PC's name only (the addresses stay on the diagram, muted). The intro
// holds the broadcast and trunk definitions.
import { useEffect, useMemo, useRef, useState } from 'react';
import predict, { commit as commitRound } from '../logic/predict.js';
import { useExercise } from '../../../ui/useExercise.js';
import { useStore } from '../../../ui/useStore.js';
import Segmented from '../../../ui/components/Segmented.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import Aside, { useAsideFold } from '../../../ui/components/Aside.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import DiagramExpand, { ExpandButton, useDiagramExpand, useTextOpen } from '../../../ui/topology/DiagramExpand.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import { predictExample } from '../logic/examples.js';
import VlanDiagram from './VlanDiagram.jsx';
import GivenConfig from './GivenConfig.jsx';
import EvidenceTable from './EvidenceTable.jsx';
import { useFactHighlight } from './factHighlight.js';
import { SCREEN, WalkWords, taskCounts, useShortAside } from './panel.jsx';
import { compactPcWidth, domainGroups, layout } from './diagram.js';
import { chipsAt, floodMotion, sceneAt, sequence, tokensAt } from './walkSteps.js';
import { useSkipper, useWalkPlayer } from './walkPlayer.js';
import {
  SHAPES, allCommitted, commitOf, dotsOf, isCommitted, nextOpen, nextSlot, paramsOf, roundView, slotKey, slotOf, toggle, validSeed,
} from './predictState.js';
import { comprehension, introduction, t, ui } from '../uk.js';

const DOT = { ok: '✓', no: '•' };

/** Whether the logic can build an instance (a seed «Далі →» may use). */
function buildable(record, params) {
  try { predict.create(record, params); return true; } catch { return false; }
}

/** The walk's words: describe() after the givens it repeats. */
export function walkLines(task, syntax, walk) {
  if (!walk) return [];
  const givens = predict.describe(task, { syntax }).length;
  return predict.describe(task, { syntax, walks: [walk] }).slice(givens);
}

/**
 * @param {{ record: object, syntax: 'cisco'|'routeros', place: object, setPlace: Function, head: any }} props
 */
export default function PredictView({ record, syntax, place, setPlace, head, skipper = null, short = false }) {
  const shape = SHAPES.includes(place.shape) ? place.shape : SHAPES[0];
  const slot = slotOf(place, shape, syntax);
  const ex = useExercise(predict, record, paramsOf(shape, syntax, slot));
  const { task } = ex;
  const { state } = useStore();
  const foldAsides = useAsideFold(SCREEN);
  // Repair v1 (Fable 1): on a short window the primer starts folded, so the whole network is on the first view.
  useShortAside('primer', short);
  const round = roundView(ex.view, task);
  const commitState = useMemo(() => commitOf(round, task), [round.commit, task]);
  const position = round.position;
  const current = task.rounds[position];
  const committed = isCommitted(commitState, current.id);
  const walk = committed ? commitState.result.evidence[current.id]?.walk ?? null : null;
  const draft = round.drafts[current.id] ?? { hosts: [], nobody: false };
  const selection = committed ? commitState.answer[current.id] : draft.hosts;
  const ready = !committed && (draft.nobody || draft.hosts.length > 0);
  const complete = allCommitted(task, commitState);
  const earned = earnedBy(state.instances, identity => (identity.exerciseId === predict.id ? identity.variantId : null));

  // Repair v1 (Fable 1): the compact drawing, as the other three exercises: the sender, its port and every
  // switch and PC in view at both sizes, so a tapped port always outlines a visible label. Each PC box has
  // room for «☑ обрано» beside its name.
  const geo = useMemo(() => layout(task.topology, syntax, {
    compact: true, pcWidth: compactPcWidth(task.topology, Object.fromEntries(task.topology.hosts.map(h => [h.device, { text: ui.chosen }]))),
  }), [task, syntax]);
  // The round's walk in motion, owned by the round on screen (Y5).
  const motion = useMemo(() => (walk ? floodMotion(geo, walk) : null), [geo, walk]);
  const seq = useMemo(() => (motion ? sequence([motion]) : null), [motion]);
  const player = useWalkPlayer(`${ex.key}|${position}`, seq);
  const playing = player.playing;
  useSkipper(skipper, player);
  // The words after the motion: at its end, and kept through a replay (Y6).
  const after = !playing || player.replaying;
  const scene = motion ? (playing ? sceneAt(motion, player.step) : motion.scene) : null;
  const tokens = playing ? tokensAt(geo, motion, player.step) : [];
  const chips = playing ? chipsAt(geo, motion, player.step) : [];
  // The domains: all rounds committed (Y5) and the last walk shown (Y6).
  const domains = complete && after && commitState.result.evidence.domains ? domainGroups(task.topology, commitState.result.evidence.domains) : null;
  const commands = useMemo(() => predict.render(task), [task]);
  const givens = useMemo(() => predict.describe(task, { syntax }), [task, syntax]);
  const steps = useMemo(() => walkLines(task, syntax, walk), [task, syntax, walk]);
  const received = motion ? motion.scene.received.filter(h => h !== current.from) : [];
  const right = committed && !commitState.result.findings.some(f => f.entity === current.id);
  const dots = dotsOf(task, commitState, position);
  const allRight = complete && commitState.result.ok;

  const questionRef = useRef(null);
  const textButton = useRef(null);
  // Round 6 (P2): «Текстом» starts open on a phone; the full-screen diagram has a zoom of its own.
  const [textOpen, setTextOpen] = useTextOpen(false);   // closed on a phone (round 6 repair: the first action's facts are on the screen)
  const expand = useDiagramExpand({ zoom: ex.view.zoom, onZoom: zoom => setView({ zoom }) });
  const focusQuestion = useRef(false);
  useEffect(() => {
    if (!focusQuestion.current) return;
    focusQuestion.current = false;
    questionRef.current?.focus();
  }, [ex.key, position]);

  const setView = patch => ex.setView(patch);
  // A tapped port's label on the diagram: this round's, until the next tap or a choice.
  const stageRef = useRef(null);
  const facts = useFactHighlight(`${ex.key}|${position}|${committed ? 'done' : 'open'}`, stageRef);
  const setDraft = next => { if (!committed) { facts.clear(); setView({ drafts: { ...round.drafts, [current.id]: next } }); } };
  const tap = host => { if (host !== current.from) setDraft({ hosts: toggle(task, draft.hosts, host), nobody: false }); };
  const nobody = () => setDraft({ hosts: [], nobody: !draft.nobody });
  const switchId = task.topology.devices.some(d => d.id === ex.view.switchId) ? ex.view.switchId : 'SW1';

  // A press on «Перевірити» before a choice says what it waits for (an
  // information verdict, not an attempt).
  const roundKey = `${ex.key}|${position}`;
  const [nudge, setNudge] = useState({ at: null, n: 0 });
  const nudged = nudge.at === roundKey && !committed && !ready;

  /** «Перевірити»: commit this round's choice; it locks, right or wrong. */
  function onCheck() {
    if (!ready) { setNudge(v => ({ at: roundKey, n: v.n + 1 })); return; }
    let next;
    try { next = commitRound(task, commitState, current.id, draft.hosts); } catch { return; }
    foldAsides();
    ex.check(next.answer, { result: next.result });
    setView({ commit: next });
    player.start();
  }
  function show(i) { setView({ position: i }); }
  /** «Наступний раунд →». */
  function onNext() {
    const i = nextOpen(task, commitState, position);
    if (i === null) return;
    focusQuestion.current = true;
    show(i);
  }
  /** «Далі →»: this shape in this vendor, one level up (to 2), a new seed. A skip stays on its level (Андрій). */
  function onAgain() {
    const { level } = complete ? nextSlot(slot, slot.seed) : slot;
    const seed = validSeed(s => buildable(record, paramsOf(shape, syntax, { seed: s, level })), slot.seed);
    focusQuestion.current = true;
    foldAsides();
    setPlace({ predict: { ...place.predict, [slotKey(shape, syntax)]: { seed, level } } });
  }
  const chooseShape = id => setPlace({ shape: id });

  const third = Object.fromEntries((selection ?? []).map(h => [h, { text: ui.chosen, className: 'is-chosen' }]));
  const legend = domains?.map(d => ({ ...d, text: ui.domain(d) })) ?? [];
  const sections = [
    { heading: ui.scheme, items: givens },
    // The walk's words stay readable; who received the frame only once the motion has shown it (fix brief item 2).
    ...(steps.length ? [{ heading: ui.walkTitle, items: after ? [...steps, ui.received({ hosts: received })] : steps }] : []),
    ...(legend.length ? [{ heading: ui.domainsTitle, items: legend.map(d => d.text) }] : []),
  ];

  // The panel's verdict: the commit's (the choice, then who received the
  // frame once the motion has shown it), or the nudge.
  const verdict = committed ? {
    tone: right ? 'ok' : 'info',
    scope: complete && allRight ? 'task' : 'part',
    stamp: `c${ex.presses}`,
    // A wrong commit is information (tone info), so no «Ще ні» in its words (S1).
    summary: right ? ui.yourChoice({ hosts: selection }) : `${ui.wentElsewhere} ${ui.yourChoice({ hosts: selection })}`,
    summaryNode: after ? (
      <div className="ng-vl-said">
        <p>{ui.received({ hosts: received })}</p>
        {complete && <p className="ng-vl-done">{ui.roundsDone}</p>}
      </div>
    ) : null,
  } : nudged ? { tone: 'info', scope: 'part', stamp: `n${nudge.n}`, summary: ui.checkNeeds } : null;

  const hosts = task.topology.hosts;
  const example = useMemo(() => predictExample({ syntax }), [syntax]);
  // A commit's evidence: the learner's own answer (its first PC, or «Нікому»); before it, the whole choice.
  const firstChosen = committed ? (hosts.map(h => h.device).find(id => selection.includes(id)) ?? null) : null;
  return (
    <>
      <div className="ng-vl-side">
        <header className="ng-vl-head">
          {head}
          <SheetChoice stepper label={ui.shape} value={shape} onChange={chooseShape} className="ng-vl-variants"
            options={record.variants.map(v => ({ value: v.id, label: <>{v.title}<DoneMark done={earned.has(v.id)} /></>, step: v.title }))} />
        </header>
        <div className="ng-vl-intro">
          <Aside screen={SCREEN} id="primer" title={ui.intro}>
            <ol className="ng-vl-intro-list">
              {introduction.map(line => <li key={line}>{line}</li>)}
            </ol>
            <p className="ng-vl-note">{t('network-convention')}</p>
          </Aside>
        </div>
        <section ref={stageRef} className="ng-vl-stage" aria-label={ui.diagramLabel}>
          <DiagramExpand expand={expand}>
          <VlanDiagram geo={geo} topology={task.topology} zoom={expand.zoom} onZoom={expand.onZoom} viewKey={ex.key}
            covered={expand.covered(textOpen)} scene={scene} domains={domains} third={third} selected={selection} source={current.from} tokens={tokens} chips={chips} quietIps
            highlight={facts.highlight}
            onHost={committed ? null : tap} activeSwitch={switchId} activeTag={ui.shownTag} onSwitch={id => setView({ switchId: id })}
            tools={<>
              <TextEquivalentButton buttonRef={textButton} id="ng-vl-text" label={ui.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(sections)} />
              <ExpandButton expand={expand} />
              {motion && motion.total > 0 && !player.reduced && <button type="button" className="ng-vl-btn ng-vl-replay" onClick={player.replay}>{ui.replay}</button>}
            </>}
            overlays={<TextEquivalent id="ng-vl-text" title={ui.textTitle} sections={sections} open={expand.covered(textOpen)} onClose={() => { setTextOpen(false); textButton.current?.focus(); }} />} />
          </DiagramExpand>
        </section>
      </div>

      <section className="ng-vl-work" aria-label={ui.exercises.predict} {...taskCounts({
        hosts: hosts.length, ports: Object.values(task.configurations).reduce((n, c) => n + Object.keys(c.ports).length, 0) })}>
        <nav className="ng-vl-progress" aria-label={ui.progressLabel}>
          <span className="ng-vl-progress-text">{ui.progress({ n: position + 1, total: task.rounds.length })}</span>
          <ol className="ng-vl-dots">
            {dots.map((d, i) => (
              <li key={i}>
                <button type="button" className={`ng-vl-dot${d.status ? ` is-${d.status}` : ''}${d.current ? ' is-current' : ''}`}
                  aria-label={ui.dot({ n: d.n, status: d.status ? ui.dotStatus[d.status] : d.current ? ui.dotStatus.current : null })}
                  aria-current={d.current ? 'step' : undefined} disabled={!d.clickable} onClick={() => { if (d.clickable && !d.current) show(i); }}>
                  <span aria-hidden="true">{d.status ? DOT[d.status] : d.current ? '●' : '○'}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <h2 ref={questionRef} tabIndex={-1} className="ng-vl-question">{ui.question({ host: current.from })}</h2>
        <EvidenceTable task={task} source={current.from} highlight={facts.highlight} onFact={facts.onFact} />
        <ActionLine id="ng-vl-predict-action">{committed ? ui.predictDone : comprehension.frameAction}</ActionLine>
        {/* The worked example (round 9, B3): one switch of its own, who gets the frame and why. */}
        <WorkedExample taskKey={ex.key} context={example.context} head={example.columns} rows={example.rows} note={example.note} />
        {committed && <span id="ng-vl-choices-locked" className="ng-sr-only">{ui.choicesLocked}</span>}
        <div className={`ng-vl-choices${committed ? ' is-locked' : ''}`} role="group" aria-labelledby={committed ? 'ng-vl-choices-locked' : 'ng-vl-predict-action'}
          {...(verdict && !committed ? { 'data-evidence': 'current' } : {})}>
          {hosts.map(h => {
            const id = h.device;
            if (id === current.from) {
              return (
                <span key={id} className="ng-vl-choice is-source">
                  <b>{id}</b> <span className="ng-vl-muted">{ui.status.source}</span>
                </span>
              );
            }
            const on = selection.includes(id);
            return (
              <button key={id} type="button" className="ng-vl-choice" aria-pressed={on} aria-disabled={committed || undefined}
                {...(committed && id === firstChosen ? { 'data-evidence': 'current' } : {})}
                onClick={() => { if (!committed) tap(id); }}>
                <b>{id}</b>
              </button>
            );
          })}
          <button type="button" className="ng-vl-choice ng-vl-nobody" aria-pressed={committed ? selection.length === 0 : draft.nobody} aria-disabled={committed || undefined}
            {...(committed && firstChosen === null ? { 'data-evidence': 'current' } : {})}
            onClick={() => { if (!committed) nobody(); }}>{ui.nobody}</button>
        </div>
        <HelpPanel
          taskKey={task.instanceKey}
          stepKey={`${current.id}|${committed ? 'done' : 'open'}`}
          check={committed ? null : { label: ui.check, onCheck }}
          primary={committed ? undefined : 'check'}
          verdict={verdict}
          continueAction={committed && !complete ? { label: ui.next, onClick: onNext } : null}
          next={{ onNext: onAgain, ready: complete, skipLabel: ui.skipNetwork, ...(committed && !complete ? { destination: ui.newRounds } : {}) }}
        />
        {steps.length > 0 && <WalkWords title={ui.walkTitle} steps={after ? [...steps, ui.received({ hosts: received })] : steps} />}
        {legend.length > 0 && (
          <section className="ng-vl-legend" aria-label={ui.domainsTitle}>
            <h3 className="ng-vl-caption">{ui.domainsTitle}</h3>
            <ul className="ng-vl-legend-list">
              {legend.map(d => <li key={d.n} className={`ng-vl-d${d.colour}`}><span className="ng-vl-swatch" aria-hidden="true">{d.n}</span> {d.text}</li>)}
            </ul>
          </section>
        )}
        <GivenConfig task={task} syntax={syntax} commands={commands} switchId={switchId} onSwitch={id => setView({ switchId: id })} />
      </section>
    </>
  );
}
