// E1 «WAN чи LAN» (spec v1 E1 with v2, v2.1): one card at a time, «картка
// N з 6», each a setting of R1: its purpose in Ukrainian, then its native
// line for the chosen vendor. Two buttons, «бік провайдера (WAN)» and
// «локальна мережа (LAN)»; a tap answers (logic/sides.js check). The verdict
// is ✓ or ✗ with one line of why, and the drawing outlines the port label
// of the right side after either answer (the check's `highlight`). A wrong
// answer stays marked and the learner chooses again; the right one locks
// the card and offers the next. After the sixth: «Усі картки на своєму
// боці.» with a ✓ (no score) and «Новий раунд» (shown only then): a new round (another seed, «Інші адреси»: the round after the first uses
// renumbered LAN addresses, logic's otherAddresses).
//
// The round is vendor-neutral; the vendor switch changes only the native
// lines. The worked example is the categorical exception card (logic
// examples.sidesExample: never a bank card).
import { useMemo, useRef } from 'react';
import { createRound, check, id as sidesId, version as sidesVersion } from '../logic/sides.js';
import { createTopology, generatorVersion } from '../logic/scenario.js';
import { sidesExample } from '../logic/examples.js';
import { useExercise } from '../../../ui/useExercise.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import { actions, labels, modes, screen, verdicts } from '../uk.js';
import { uk as shared } from '../../../ui/uk.js';
import Options, { useNewCard } from './Options.jsx';
import Picture from './Picture.jsx';
import { nextSeed } from './seeds.js';

/** The exercise for useExercise: a round of six cards on its own topology. */
export const sidesExercise = {
  id: sidesId, version: sidesVersion, generatorVersion,
  create: (_, { seed, other }) => ({ seed, cards: createRound(seed, { otherAddresses: other }), topology: createTopology(seed, { otherAddresses: other }) }),
  check: () => ({ ok: false, complete: false }),
  solution: () => null,
};

const EXAMPLE = sidesExample();
const SIDES = ['WAN', 'LAN'];

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function SidesView({ vendor, place, setPlace }) {
  const { seed, other } = place.sides;
  const ex = useExercise(sidesExercise, null, { seed, other });
  const { task, view } = ex;
  const total = task.cards.length;
  const position = Math.min(view.position ?? 0, total - 1);
  const card = task.cards[position];
  const tries = view.tries ?? {};          // card id → the sides chosen, in order
  const chosen = tries[card.id] ?? [];
  const last = chosen.at(-1) ?? null;
  const result = useMemo(() => (last ? check(card, last, vendor) : null), [card, last, vendor]);
  const right = Boolean(result?.ok);
  const done = task.cards.every(c => (tries[c.id] ?? []).includes(c.side));
  const cardRef = useRef(null);
  const cardFocus = useNewCard(cardRef, position);
  const marks = Object.fromEntries(chosen.map(side => [side, side === card.side ? 'ok' : 'no']));

  function choose(side) {
    if (right) return;
    const next = { ...tries, [card.id]: [...chosen, side] };
    const complete = task.cards.every(c => (next[c.id] ?? []).includes(c.side));
    const outcome = check(card, side, vendor);
    ex.check({ cards: next }, { result: { ok: outcome.ok, complete: complete && outcome.ok } });
    ex.setView({ tries: next, checks: (view.checks ?? 0) + 1 });
  }
  const onNext = () => { cardFocus.current = true; ex.setView({ position: position + 1 }); };
  const newRound = () => setPlace({ sides: { seed: nextSeed(seed), other: true } });

  const verdict = result ? {
    tone: result.ok ? 'ok' : 'no',
    scope: done ? 'task' : 'part',
    stamp: view.checks ?? 0,
    summary: done ? verdicts.sidesDone : result.why,
    summaryNode: done ? <p className="ng-dh-after">{result.why}</p> : null,
  } : null;

  const options = SIDES.map(side => ({ id: side, label: side === 'WAN' ? labels.wan : labels.lan }));
  return (
    <ExerciseLayout
      heading={modes.sides}
      wide="stage"
      first="work"
      stage={<Picture topology={task.topology} vendor={vendor} highlight={result?.highlight ?? null} viewKey={ex.key}
        zoom={view.zoom} onZoom={zoom => ex.setView({ zoom })} />}
      question={<>
        <p className="ng-dh-task">{screen.sidesTask}</p>
        <section ref={cardRef} tabIndex={-1} className="ng-dh-card" aria-label={labels.card(position + 1, total)}>
          <p className="ng-dh-progress">{labels.card(position + 1, total)}</p>
          <p className="ng-dh-purpose">{card.purpose}</p>
          {card.detail && <p className="ng-dh-detail">{card.detail}</p>}
          <p className="ng-dh-native"><span className="ng-dh-vendor">{screen.nativeOf[vendor]}:</span> <code>{card.native[vendor]}</code></p>
        </section>
      </>}
      action={right ? actions.committed : actions.sides}
      actionId="ng-dh-action"
      example={<WorkedExample taskKey={ex.key} context={EXAMPLE.context} head={EXAMPLE.columns} rows={EXAMPLE.rows} note={EXAMPLE.note} tag={shared.example.tagCards} />}
      answer={<Options key={card.id} options={options} value={last} marks={marks} onChoose={choose} locked={right} labelledBy="ng-dh-action" evidence={Boolean(result)} className="ng-dh-sides" />}
      help={<HelpPanel
        taskKey={`${ex.key}|${card.id}`}
        check={null}
        primary={done ? 'next' : right ? 'continue' : 'none'}
        verdict={verdict}
        continueAction={right && !done ? { label: screen.nextCard, onClick: onNext } : null}
        next={done ? { onNext: newRound, label: labels.newRound, ready: true } : null}
      />}
    />
  );
}
