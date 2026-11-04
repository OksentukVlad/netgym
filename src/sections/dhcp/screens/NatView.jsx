// E3 «Що бачить сайт» (spec v1 E3 with v2, v2.1; logic/nat.js). Two levels:
//   - 1: a round of three cards on the drawing, the website first: «Яку
//     адресу відправника побачить …?» (three addresses), and on the website's
//     card, once that is right, «Куди роутер віддасть відповідь?». The LAN
//     server shows on the drawing on its own card only. Then the replay is
//     there to open, «По кроках» (the firewall's stepper, shared): four
//     captions, each outlining the address it is about on the drawing; no
//     animation and no timer; the remembered pair under it;
//   - 2, for the chosen vendor, one line among three (each with its purpose):
//     Cisco, the inside interface, then the ACL that selects exactly the
//     LANs (the given `ip nat inside source … overload` shown whole; every
//     other task has two LANs); MikroTik, the srcnat rule (WAN = ether1
//     given). The note after the right one says what the line does.
// A choice answers at once (Options): ✓ or ✗ with one line of why; a wrong
// one stays marked and the learner chooses again. Level 1's round ends with
// «Новий раунд» (another round, renumbered) and «До рівня 2», shown only
// then; at level 2 «Далі →» gives another task (renumbered after the first).
// Cisco's worked example is the whole configuration, not the ACL alone.
import { useEffect, useMemo, useRef } from 'react';
import { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import { checkCard, checkL2, createL2, createRound, generatorVersion as natGenerator, id as natId, replay as replayOf, version as natVersion } from '../logic/nat.js';
import { natExample } from '../logic/examples.js';
import { useExercise } from '../../../ui/useExercise.js';
import { useStore } from '../../../ui/useStore.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import WalkStepper from '../../../ui/components/WalkStepper.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import { actions, examples, labels, modes, natNotes, screen } from '../uk.js';
import Options, { useNewCard } from './Options.jsx';
import Picture from './Picture.jsx';
import { nextSeed } from './seeds.js';

/** The exercises for useExercise: level 1's round, level 2's task. */
export const natRound = {
  id: natId, version: natVersion, generatorVersion: natGenerator,
  create: (_, { seed, vendor, other }) => ({ level: 1, cards: createRound(seed, { vendor, otherAddresses: other }) }),
  check: () => ({ ok: false, complete: false }),
  solution: () => null,
};
export const natRules = {
  id: `${natId}-l2`, version: natVersion, generatorVersion: natGenerator,
  create: (_, { seed, vendor, other, twoLans }) => ({ level: 2, ...createL2(seed, { vendor, otherAddresses: other, twoLans }) }),
  check: () => ({ ok: false, complete: false }),
  solution: () => null,
};

const markOf = (picks, ok) => Object.fromEntries(picks.map(id => [id, id === ok ? 'ok' : 'no']));

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function NatView({ vendor, place, setPlace }) {
  const { state } = useStore();
  const level = place.nat.level;
  const earned = earnedBy(state.instances, id => (id.exerciseId === natId ? 1 : id.exerciseId === natRules.id ? 2 : null));
  const controls = <SheetChoice stepper label={screen.level} value={level} onChange={next => setPlace({ nat: { ...place.nat, level: next } })} className="ng-dh-levels"
    options={[1, 2].map(n => ({ value: n, label: <>{screen.natLevels[n - 1]}<DoneMark done={earned.has(n)} /></>, step: screen.natLevels[n - 1] }))} />;
  return level === 1
    ? <NatRound vendor={vendor} place={place} setPlace={setPlace} controls={controls} />
    : <NatRules vendor={vendor} place={place} setPlace={setPlace} controls={controls} />;
}

/** Level 1: three cards, the website's with its reply and replay. */
function NatRound({ vendor, place, setPlace, controls }) {
  const { seed, other } = place.nat.tasks[1];
  const ex = useExercise(natRound, null, { seed, vendor, other });
  const { task, view } = ex;
  const total = task.cards.length;
  const position = Math.min(view.position ?? 0, total - 1);
  const card = task.cards[position];
  const picks = view.picks ?? {};                 // card id → { source: [ids], reply: [ids] }
  const mine = picks[card.id] ?? {};
  const rightOf = (c, stepId) => c[stepId === 'reply' ? 'replyChoices' : 'choices'].find(o => checkCard(c, o.id, { step: stepId }).ok)?.id;
  const solved = c => {
    const p = picks[c.id] ?? {};
    return (p.source ?? []).includes(rightOf(c, 'source')) && (!c.replyChoices.length || (p.reply ?? []).includes(rightOf(c, 'reply')));
  };
  const sourceDone = (mine.source ?? []).includes(rightOf(card, 'source'));
  const step = !sourceDone ? 'source' : card.replyChoices.length && !(mine.reply ?? []).includes(rightOf(card, 'reply')) ? 'reply' : 'done';
  // The verdict is the last choice's: the source's (kept while the reply is still to choose), then the reply's.
  const lastStep = (mine.reply ?? []).length ? 'reply' : 'source';
  const lastPick = (mine[lastStep] ?? []).at(-1) ?? null;
  const result = useMemo(() => (lastPick ? checkCard(card, lastPick, { step: lastStep }) : null), [card, lastPick, lastStep]);
  const done = task.cards.every(solved);
  const walk = useMemo(() => (step === 'done' ? replayOf(card) : null), [card, step]);
  const stepping = Boolean(walk) && view.stepping === card.id;
  const at = Math.min(view.stepAt ?? 0, (walk?.steps.length ?? 1) - 1);

  function choose(id) {
    if (step === 'done') return;
    const list = [...(mine[step] ?? []), id];
    const next = { ...picks, [card.id]: { ...mine, [step]: list } };
    const r = checkCard(card, id, { step });
    const complete = task.cards.every(c => {
      const p = next[c.id] ?? {};
      return (p.source ?? []).includes(rightOf(c, 'source')) && (!c.replyChoices.length || (p.reply ?? []).includes(rightOf(c, 'reply')));
    });
    ex.check({ picks: next }, { result: { ok: r.ok, complete: complete && r.ok } });
    ex.setView({ picks: next, checks: (view.checks ?? 0) + 1 });
  }
  const cardRef = useRef(null);
  const cardFocus = useNewCard(cardRef, position);
  const onNext = () => { cardFocus.current = true; ex.setView({ position: position + 1, stepping: null, stepAt: 0 }); };
  // A step of the replay: its row and its words come into view together (the caption is under the stepper).
  const replayRef = useRef(null);
  useEffect(() => { if (stepping) bringIntoView([replayRef.current]); }, [stepping, at]);
  const toLevel2 = () => setPlace({ nat: { ...place.nat, level: 2 } });
  // Another round (renumbered after the first), from the round's end.
  const newRound = () => setPlace({ nat: { ...place.nat, tasks: { ...place.nat.tasks, 1: { seed: nextSeed(seed), other: true } } } });

  const highlight = stepping ? walk.steps[at].highlight : result?.highlight ?? null;
  const verdict = result ? {
    tone: result.ok ? 'ok' : 'no', scope: done ? 'task' : 'part', stamp: view.checks ?? 0,
    summary: result.text,
    summaryNode: done ? <p className="ng-dh-after">{screen.natDone}</p> : null,
  } : null;
  const shown = step === 'done' ? lastStep : step;
  const options = (shown === 'reply' ? card.replyChoices : card.choices).map(o => ({ id: o.id, label: o.text }));
  const example = useMemo(() => natExample({ level: 1, vendor }), [vendor]);
  const stepper = walk ? (
    <div ref={replayRef} className="ng-dh-replay">
      <WalkStepper words={screen.steps} stepping={stepping} at={at} last={walk.steps.length - 1} captionId="ng-dh-step-caption"
        onToggle={() => ex.setView({ stepping: stepping ? null : card.id, stepAt: 0 })}
        onStep={d => ex.setView({ stepAt: Math.max(0, Math.min(walk.steps.length - 1, at + d)) })}
        caption={walk.steps[at].caption} />
      {stepping && at >= 1 && <p className="ng-dh-remembered">{walk.caption}</p>}
    </div>
  ) : null;

  return (
    <ExerciseLayout
      heading={modes.nat}
      controls={controls}
      wide="stage"
      first="work"
      stage={<Picture topology={card.topology} vendor={vendor} server={card.topology.showServer} highlight={highlight} viewKey={`${ex.key}|${card.id}`}
        zoom={view.zoom} onZoom={zoom => ex.setView({ zoom })} below={stepper} />}
      question={
        <section ref={cardRef} tabIndex={-1} className="ng-dh-card" aria-label={labels.card(position + 1, total)}>
          <p className="ng-dh-progress">{labels.card(position + 1, total)}</p>
          <p className="ng-dh-task">{card.task}</p>
        </section>}
      action={step === 'done' ? actions.committed : step === 'reply' ? actions.reply : card.question}
      actionId="ng-dh-action"
      example={<WorkedExample taskKey={ex.key} context={example.context} head={example.columns} rows={example.rows} note={example.note} />}
      answer={<Options key={`${card.id}|${shown}`} options={options} value={(mine[shown] ?? []).at(-1) ?? null}
        marks={markOf(mine[shown] ?? [], rightOf(card, shown))} onChoose={choose} locked={step === 'done'} labelledBy="ng-dh-action" evidence={Boolean(result)} />}
      help={<HelpPanel
        taskKey={`${ex.key}|${card.id}`}
        stepKey={step === 'reply' ? 'reply' : 'source'}
        check={null}
        primary={done ? 'next' : step === 'done' ? 'continue' : 'none'}
        verdict={verdict}
        continueAction={step === 'done' && !done ? { label: screen.nextCard, onClick: onNext } : done ? { label: screen.newRound, onClick: newRound } : null}
        next={done ? { onNext: toLevel2, label: screen.nextLevel, ready: true } : null}
      />}
    />
  );
}

/** Level 2: the vendor's line among three (Cisco: the inside interface first). */
function NatRules({ vendor, place, setPlace, controls }) {
  const { seed, other, n = 0 } = place.nat.tasks[2];
  const cisco = vendor === 'cisco';
  const ex = useExercise(natRules, null, { seed, vendor, other, twoLans: cisco && n % 2 === 1 });
  const { task, view } = ex;
  const picks = view.picks ?? {};               // 'inside' | 'rule' → [ids]
  const rightOf = stepId => (stepId === 'inside' ? task.insideOptions : task.options).find(o => checkL2(task, o.id, { step: stepId }).ok)?.id;
  const insideDone = !cisco || (picks.inside ?? []).includes(rightOf('inside'));
  const ruleDone = (picks.rule ?? []).includes(rightOf('rule'));
  const step = !insideDone ? 'inside' : !ruleDone ? 'rule' : 'done';
  const shown = step === 'done' ? 'rule' : step;
  // The verdict is the last choice's: the inside step's (kept until a rule is chosen), then the rule's.
  const said = (picks.rule ?? []).length || !cisco ? 'rule' : 'inside';
  const lastPick = (picks[said] ?? []).at(-1) ?? null;
  const result = useMemo(() => (lastPick ? checkL2(task, lastPick, { step: said }) : null), [task, lastPick, said]);
  const example = useMemo(() => natExample({ level: 2, vendor }), [vendor]);
  // Cisco's example is the whole configuration (its roles, the ACL, the overload line), not the ACL alone:
  // the ACL only selects whose addresses are translated; the overload line translates them.
  const exampleRows = cisco ? (lines => [...lines.slice(0, -1), ...example.rows.map(r => r[0]), lines.at(-1)].map(line => [line]))(example.given.split('\n')) : example.rows;

  function choose(id) {
    if (step === 'done') return;
    const next = { ...picks, [step]: [...(picks[step] ?? []), id] };
    const r = checkL2(task, id, { step });
    ex.check({ picks: next }, { result: { ok: r.ok, complete: r.ok && step === 'rule' } });
    ex.setView({ picks: next, checks: (view.checks ?? 0) + 1 });
  }
  const another = () => setPlace({ nat: { ...place.nat, tasks: { ...place.nat.tasks, 2: { seed: nextSeed(seed), other: true, n: nextSeed(n) } } } });

  const note = step === 'done' ? (cisco ? natNotes.acl : natNotes.masquerade) : null;
  const verdict = result ? {
    tone: result.ok ? 'ok' : 'no', scope: step === 'done' ? 'task' : 'part', stamp: view.checks ?? 0,
    summary: result.text,
    summaryNode: note ? <p className="ng-dh-after">{note}</p> : null,
  } : null;
  const list = shown === 'inside' ? task.insideOptions : task.options;
  const networks = task.networks.map(net => `${net.network}/${net.prefix}`);

  return (
    <ExerciseLayout
      heading={modes.nat}
      controls={controls}
      wide="stage"
      first="work"
      stage={<Picture topology={task.topology} vendor={vendor} viewKey={ex.key} zoom={view.zoom} onZoom={zoom => ex.setView({ zoom })} />}
      question={
        <section className="ng-dh-card">
          <p className="ng-dh-task">{task.task}</p>
          <p className="ng-dh-given-line">{screen.natNetworks(networks)}</p>
          {cisco
            ? <><pre className="ng-dh-pre">{task.given}</pre><p className="ng-dh-given-line">{natNotes.overload}</p></>
            : <p className="ng-dh-given-line">{task.given}</p>}
        </section>}
      action={step === 'done' ? actions.committed : step === 'inside' ? task.insideQuestion : task.question}
      actionId="ng-dh-action"
      example={<WorkedExample taskKey={ex.key} context={example.context} head={example.columns} rows={exampleRows} note={cisco ? examples.natCiscoNote : example.note} />}
      answer={<Options key={shown} options={list} value={(picks[shown] ?? []).at(-1) ?? null} marks={markOf(picks[shown] ?? [], rightOf(shown))} onChoose={choose}
        locked={step === 'done'} labelledBy="ng-dh-action" evidence={Boolean(result)} className="ng-dh-rules" />}
      help={<HelpPanel
        taskKey={ex.key}
        stepKey={step === 'inside' ? 'inside' : 'rule'}
        check={null}
        primary={step === 'done' ? 'next' : 'none'}
        verdict={verdict}
        next={{ onNext: another }}
      />}
    />
  );
}
