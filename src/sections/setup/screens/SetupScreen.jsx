// «Налаштування з нуля» (DR-1 Cisco router, DR-2 Cisco 2960, DR-3 MikroTik;
// round 4 spec S with its v2 and v3 sections, on the shared parts of spec A).
// The learner puts a deck of command cards in a working order and, on the
// Cisco decks, chooses each card's mode (prompt). Any order that keeps the
// deck's dependencies passes.
//
// The flow (logic/state.js): sorting → sorted → recall → done.
//   - sorting: the action line (round 5, R1) above the deck (ReorderList: ≡
//     and ↑ ↓, keyboard grab); each card's purpose under its command (R2,
//     the bank's data), each row's prompt as one quiet group with «режим?»
//     until chosen; on the Cisco decks one «?» at the end of the action line
//     (after «режим.») opens the modes in words (ModeHelp.jsx). «Перевірити»
//     gives one finding: missing modes first, then one rule; only its cards
//     get «• Ще ні», and the first of them is the evidence the panel names.
//     An edit keeps that verdict, dimmed («до змін»), and marks the edited
//     row, so the panel anchors right after it. «Далі →» skips (secondary).
//   - sorted (the check passed, the deck's ✓ earned unless revealed): the
//     deck is locked and becomes the script it gives (Script.jsx: prompts,
//     mode changes tagged «перехід», RouterOS split at the login check, one
//     copy button per part). The panel shows why (the rules this deck
//     exercised; the rest behind «Детальніше»), «Тепер по пам'яті →»
//     (primary; Cisco decks) and «Далі →» (new values, same deck).
//   - sorted-shown (the answer shown): the reference script on the board,
//     marked «показано»; «Моя відповідь» shows the learner's own order.
//   - recall: three lines typed from memory (Recall.jsx), each checked by its
//     own Enter as a stamped verdict in the panel (the line its evidence; the
//     last one finishing all three is the task's success), the script's
//     lines «…» until each is right; hints follow the
//     first unfinished line; «Показати відповідь» fills them; «Далі →»
//     skips. Recall is practice: no ✓ of its own, and its reveal keeps the
//     deck's ✓.
//
// What a deck offers comes from capabilities(task): DR-3 has no prompts, no
// recall and no CLI-mode example; its cards carry their Winbox paths (a third,
// muted line) and its login check is a step card (✋).
//
// State: the place (`setup`) keeps the chosen deck and a seed per deck. Each
// deck's lifecycle lives in its own instance's view (`view.setup`, keyed by
// the deck, its version and seed), so switching decks or leaving the section
// and coming back restores it; the shared session gets the sorting check, its
// hints and its reveal (useExercise), and assistance. Every edit goes through
// transition(). Card ids are keys only, never in the DOM; scripts come only
// from scriptForState (one masking path for the board and every copy).
//
// Help (spec A1): one HelpPanel for the deck, a long board (`boardRef`): in
// two columns at the top of the right column, in one column before the deck
// (after a short one); anchored after a flagged row it can't fit beside.
// First-visit asides (spec A8): the CLI modes (Cisco) and how to arrange the
// cards (keys, several valid orders), folded after the first check or «Далі».
//
// Layout by the screen's own width (setup.css): desk (≥ 1200) puts the board
// on the left and the panel with the asides on the right; narrow is one
// column. The page is the only scroll; nothing is sticky.
import { useEffect, useRef, useState } from 'react';
import drill from '../logic/deck.js';
import { capabilities } from '../logic/model.js';
import { recallRows, render, scriptForState } from '../logic/render.js';
import { initialState, transition } from '../logic/state.js';
import { explanation, hints as hintsOf, tips } from '../logic/hints.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, usePref, useStore } from '../../../ui/useStore.js';
import Segmented from '../../../ui/components/Segmented.jsx';
import ReorderList from '../../../ui/components/ReorderList.jsx';
import HelpPanel, { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import MoreMenu from '../../../ui/components/MoreMenu.jsx';
import Aside, { useAside, useAsideFold } from '../../../ui/components/Aside.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { uk as shared } from '../../../ui/uk.js';
import CardRow from './CardRow.jsx';
import ModeHelp, { ModesWords } from './ModeHelp.jsx';
import Recall, { lineSummary } from './Recall.jsx';
import Script, { OwnDeck } from './Script.jsx';
import copy, { deckUi, modesExample, text, ui } from '../uk.js';
import '../../../ui/tokens.css';
import './setup.css';

/** The screen's id for its asides (the store's places). */
export const SCREEN = 'setup';
/** The layout for a content width (the threshold in setup.css). */
export const modeFor = width => (width >= 1200 ? 'desk' : 'narrow');
/** Success tips shown open besides the rules' own (the rest go behind «Детальніше»). */
const LEAD = { 'dr-2': ['tip-default-gateway', 'tip-management-vlan'], 'dr-3': ['tip-routeros-firewall', 'tip-routeros-save'] };
const RECALL = ['recall', 'done', 'done-shown'];

function useLayout(ref) {
  const [layout, setLayout] = useState(() => modeFor(typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setLayout(modeFor(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return layout;
}

/** A first seed (random; the logic builds every seed). */
export const firstSeed = (random = Math.random) => Math.floor(random() * 1e6) + 1;
/** Another seed than `seed`. */
export function nextSeed(seed, random = Math.random) {
  let next = firstSeed(random);
  for (let i = 0; next === seed && i < 8; i++) next = firstSeed(random);
  return next === seed ? seed + 1 : next;
}

/** The place's first value: the first deck, and a first seed for every deck. */
export function firstPlace(decks, random = Math.random) {
  return { deck: decks[0].id, seeds: Object.fromEntries(decks.map(deck => [deck.id, firstSeed(random)])) };
}

/** The success explanation (spec S2): one short line per rule this deck
 * exercised and per lead point (deduplicated), open; every full tip behind
 * «Детальніше» (the security asides and the long forms of the lines above). */
export function successTips(task, result) {
  const all = tips(task, result).map(t => t.code);
  const fromRules = new Set(tips({ ...task, tipCodes: [] }, result).map(t => t.code));
  const lead = [...new Set(all.filter(code => (fromRules.has(code) || LEAD[task.identity.taskId]?.includes(code)) && ui.lead[code]).map(code => ui.lead[code]))];
  return { lead, more: all.map(code => text(code)) };
}

/** The CLI example (Cisco decks): moving between the modes, then each prompt in words. */
function ModesExample({ values }) {
  const lines = modesExample(values);
  return <>
    <pre className="ng-su-modes">{lines.map(line => `${line.device}${line.prompt}${line.command ? ` ${line.command}` : ''}`).join('\n')}</pre>
    <ModesWords />
  </>;
}

/** @param {{ bank: { decks: object[] } }} props */
export default function SetupScreen({ bank }) {
  const { decks } = bank;
  const { state: store } = useStore();
  const [themeName] = usePref('theme');
  const [place, setPlace] = usePlace('setup', () => firstPlace(decks));
  const record = decks.find(deck => deck.id === place.deck) ?? decks[0];
  const deckId = record.id;
  const seed = place.seeds?.[deckId] ?? 1;
  const ex = useExercise(drill, record, { seed });
  const { task, session } = ex;
  const caps = capabilities(task);
  const saved = ex.view.setup;
  const state = saved?.phase ? saved : initialState(task);
  const { phase, answer } = state;
  const sorting = phase === 'sorting';
  const recalling = RECALL.includes(phase);
  const prompted = caps.prompts.length > 0;
  const words = deckUi[deckId] ?? deckUi['dr-1'];
  const okCode = `ok.${deckId}` in copy ? `ok.${deckId}` : 'ok';
  const fold = useAsideFold(SCREEN);
  const modesAside = useAside(SCREEN, 'modes');
  const earned = earnedBy(store.instances, identity => (identity.exerciseId === drill.id ? identity.taskId : null));

  const root = useRef(null);
  const boardRef = useRef(null);
  const fields = useRef([]);
  const focusAfter = useRef(null);   // 'first-card', 'modes' (the CLI example), or a recall line's index
  const keepInView = useRef(false);   // an edit made the verdict stale: the panel anchors after the edited row
  const layout = useLayout(root);

  const save = (next, extra = {}) => ex.setView({ setup: next, ...extra });
  /** The section's assistance reaches the shared session (before any completion). */
  const assist = next => { if (next.assisted && !session.assisted) ex.act({ type: 'session', action: { type: 'assist' } }); };

  // ── Sorting ──
  const feedback = sorting ? state.feedback : null;
  const failed = feedback && !feedback.ok ? feedback.findings[0] : null;
  const live = failed && !state.stale ? failed : null;           // the checked board is still on screen
  const marked = new Set(live?.cards ?? []);
  const modeMark = Boolean(live && ['mode-missing', 'wrong-mode'].includes(live.code));
  const edited = ex.view.setupEdited ?? null;
  // The row the panel's message is about: the edited row once the verdict is
  // stale, else the first flagged row (the smallest board position at the check).
  const flaggedId = live?.positions?.length ? answer.order[Math.min(...live.positions) - 1] : null;
  const cardEvidence = !sorting ? null : state.stale && failed ? edited : flaggedId;
  const rows = render(task, state);

  function edit(action, id) {
    const next = transition(task, state, action);
    if (next === state) return;
    if (next.stale && !state.stale) keepInView.current = true;
    save(next, next.stale ? { setupEdited: id } : {});
  }
  function onCheck() {
    const next = transition(task, state, { type: 'check' });
    assist(next);
    ex.check(next.answer, { result: next.feedback });
    save(next, { setupEdited: null });
    fold();
  }

  // ── Recall ──
  const lines = recallRows(task, state);
  const unfinished = lines.find(line => !line.locked) ?? null;
  // Each line's Enter is a stamped verdict in the panel (`view.setupCheck`:
  // which line, its result and text then, a stamp); an edit of that line
  // makes it stale («до змін»). A hint opened after it is about the first
  // unfinished line (`view.setupHintAt` = the check it followed).
  const lineCheck = recalling ? ex.view.setupCheck ?? null : null;
  const lineStale = Boolean(lineCheck && !state.typedFeedback[lineCheck.id]);
  const hintNewer = phase === 'recall' && state.hintIndex > 0 && (ex.view.setupHintAt ?? 0) === (lineCheck?.stamp ?? 0);
  const lineEvidence = !recalling ? null : hintNewer ? unfinished?.id ?? null : lineCheck?.id ?? null;
  function onContinue() {
    focusAfter.current = 0;
    save(transition(task, state, { type: 'continue' }), { setupCheck: null, setupHintAt: 0 });
  }
  function onTyped(id, value) {
    if (lineCheck?.id === id && state.typedFeedback[id]) keepInView.current = true;
    save(transition(task, state, { type: 'typed', id, text: value }));
  }
  function onEnter(id) {
    const next = transition(task, state, { type: 'check-typed', id });
    if (next === state) return;
    if (next.typedFeedback[id]?.ok) {
      // On to the next line still to type (keyboard flow); the last one keeps the focus.
      const at = task.typedIds.findIndex(other => other !== id && !next.typedFeedback[other]?.ok);
      if (at >= 0) focusAfter.current = at;
    }
    const n = task.typedIds.indexOf(id) + 1;
    save(next, { setupCheck: { id, n, result: next.typedFeedback[id], value: next.answer.typed[id], stamp: (lineCheck?.stamp ?? 0) + 1 } });
  }

  // ── Both ──
  const hintList = sorting || phase === 'recall' ? hintsOf(task, state) : [];
  function onHint() {
    if (state.hintIndex >= hintList.length) return;
    if (sorting) ex.hint(caps.hints.length);
    // The hint is the newest message now (about the first line still to type).
    save(transition(task, state, { type: 'hint' }), recalling ? { setupHintAt: lineCheck?.stamp ?? 0 } : {});
  }
  function onReveal() {
    const next = transition(task, state, { type: 'reveal' });
    if (next === state) return;
    if (sorting) ex.reveal();
    else assist(next);
    save(next);
  }
  const onShowOwn = () => save(transition(task, state, { type: 'show-own' }));
  // «Далі →»: new values for this deck (decks change only in the picker); its first card takes the focus.
  function onNext() {
    focusAfter.current = 'first-card';
    fold();
    setPlace({ seeds: { ...place.seeds, [deckId]: nextSeed(seed) } });
  }
  const onDeck = id => { if (id !== deckId) setPlace({ deck: id }); };
  // The mode help's «Повний приклад»: the CLI example's aside, open, and the focus on it.
  function onFullExample() {
    if (!modesAside.open) { focusAfter.current = 'modes'; modesAside.toggle(); } else showModes();
  }

  // The panel anchors a newly stale verdict right after the edited row without
  // scrolling; «до змін» (and a row that changed height) can push it past the
  // view's edge, so bring that row and the message into view, only as far as needed.
  useEffect(() => {
    if (!keepInView.current) return;
    keepInView.current = false;
    const scope = root.current;
    bringIntoView([scope?.querySelector('[data-evidence="current"]'), scope?.querySelector('[data-help-panel] [data-help-current]')].filter(Boolean), 'auto');
  });
  useEffect(() => {
    const want = focusAfter.current;
    if (want === null) return;
    focusAfter.current = null;
    if (want === 'first-card') root.current?.querySelector('.ng-reorder-handle')?.focus();
    else if (want === 'modes') showModes();
    else fields.current[want]?.focus();
  });

  /** The CLI example's aside into view, the focus on its «?». */
  function showModes() {
    const aside = root.current?.querySelector('.ng-su-aside-modes');
    if (!aside) return;
    bringIntoView([aside], 'auto');
    aside.querySelector('.ng-aside-q')?.focus({ preventScroll: true });
  }

  // ── The script on the board ──
  const script = sorting ? null : scriptForState(task, state);
  const shownBoard = state.revealed && !state.showOwn;
  const pathOf = cardId => task.cards.find(c => c.id === cardId)?.secondary ?? null;
  const moreItems = script ? script.parts.map(part => ({
    id: part.id, label: script.parts.length > 1 ? ui.copyPart({ label: part.label }) : ui.copyScript, copy: part.script,
  })) : [];

  // ── The panel ──
  let verdict = null;
  if (feedback) {
    const lesson = explanation(feedback);
    // The flagged cards' positions first (spec S2); missing modes name them in their own sentence.
    const lead = failed.code === 'mode-missing' || !failed.positions?.length ? '' : `${ui.cardsAt({ positions: [...failed.positions].sort((a, b) => a - b) })} `;
    verdict = { tone: 'no', scope: 'task', stamp: ex.presses, summary: `${lead}${text(lesson.code, lesson.params)}` };
  } else if (phase === 'sorted' && state.feedback?.ok) {
    const { lead, more } = successTips(task, state.feedback);
    const advice = [...new Map(state.feedback.findings.filter(f => f.severity === 'advice').map(f => [f.code, f])).values()];
    verdict = {
      tone: 'ok', scope: 'task', stamp: ex.presses, summary: text(okCode),
      detail: (
        <div className="ng-su-why">
          <ul className="ng-su-tips">
            {advice.map(f => <li key={f.code}>{text(f.code, f)}</li>)}
            {lead.map(line => <li key={line}>{line}</li>)}
          </ul>
          <details className="ng-su-more">
            <summary>{shared.help.more}</summary>
            <ul className="ng-su-tips">{more.map(line => <li key={line}>{line}</li>)}</ul>
          </details>
        </div>
      ),
    };
  }
  // Recall: the last line checked, a part verdict; the one that finishes all three, the task's.
  if (lineCheck && phase !== 'done-shown') {
    const { n, result, value, stamp } = lineCheck;
    const finished = phase === 'done' && !lineStale;
    verdict = { tone: result.ok ? 'ok' : 'no', scope: finished ? 'task' : 'part', stamp: `line-${stamp}`,
      summary: finished ? `${lineSummary(n, value, result)} ${ui.recallDone}` : lineSummary(n, value, result) };
  }
  const reveal = sorting || phase === 'sorted-shown'
    ? { revealed: phase === 'sorted-shown', onReveal, render: () => null, applied: ui.applied }
    : phase === 'recall' || phase === 'done-shown'
      ? { revealed: phase === 'done-shown', onReveal, render: () => null, applied: ui.recallApplied }
      : null;
  const continueAction = ['sorted', 'sorted-shown'].includes(phase) && task.typedIds.length > 0 ? { label: ui.continue, onClick: onContinue } : null;

  const deckOptions = decks.map(deck => ({ value: deck.id, label: <>{deck.label}<DoneMark done={earned.has(deck.id)} /></> }));
  const taskLine = recalling ? ui.recallTask : phase === 'sorted' ? ui.sortedTask : phase === 'sorted-shown' ? ui.shownTask : ui.task;

  return (
    <div ref={root} className={`ng-su is-${phase}`} data-theme={themeName} data-layout={layout}>
      <header className="ng-su-head">
        <h1 className="ng-su-h1" tabIndex={-1}>{words.heading}</h1>
        <Segmented label={ui.decks} value={deckId} onChange={onDeck} className="ng-su-decks" options={deckOptions} />
        {moreItems.length > 0 && <MoreMenu items={moreItems} className="ng-su-more-menu" />}
      </header>
      <div className="ng-su-intro">
        <p className="ng-su-task">{taskLine}</p>
        <p className="ng-su-profile">
          <span className="ng-su-caption">{ui.device}.</span> {text(task.profileText, task.values)}
          {words.givens && <> {words.givens(task.values)}</>}
        </p>
      </div>

      <div className="ng-su-work">
        <section ref={boardRef} className="ng-su-board" aria-label={sorting ? ui.deck : recalling ? ui.recallLabel : shownBoard ? ui.answerHeading : ui.scriptHeading}>
          {sorting && (prompted ? <ModeHelp sentence={ui.action} onFull={onFullExample} /> : <ActionLine>{ui.actionOrder}</ActionLine>)}
          {sorting && (
            <ReorderList items={rows} label={ui.deck} name={row => row.text} showHelp={false}
              onReorder={(order, moved) => edit({ type: 'order', order }, moved)}
              rowClassName={row => (marked.has(row.id) ? 'is-marked' : '')}>
              {(row, index) => (
                <CardRow row={row} n={index + 1} prompts={caps.prompts} marked={marked.has(row.id)} modeInvalid={modeMark && marked.has(row.id)}
                  current={row.id === cardEvidence} onPrompt={prompt => edit({ type: 'prompt', id: row.id, prompt }, row.id)} />
              )}
            </ReorderList>
          )}
          {recalling && (
            <Recall rows={lines} readOnly={phase === 'done-shown'} current={lineEvidence}
              onChange={onTyped} onEnter={onEnter} fieldRef={i => el => { fields.current[i] = el; }} />
          )}
          {!sorting && (
            <div className="ng-su-result">
              <div className="ng-su-result-head">
                <h2 className="ng-su-caption">{state.revealed ? (state.showOwn ? ui.ownHeading : ui.answerHeading) : ui.scriptHeading}</h2>
                {shownBoard && <span className="ng-shown-chip">{shared.help.shown}</span>}
                {phase === 'sorted-shown' && (
                  <button type="button" className="ng-su-own-toggle" aria-pressed={state.showOwn} onClick={onShowOwn}>{shared.help.myAnswer}</button>
                )}
              </div>
              {phase === 'sorted-shown' && state.showOwn
                ? <OwnDeck rows={rows} prompts={caps.prompts} />
                : script && <Script script={script} prompted={prompted} pathOf={pathOf} />}
            </div>
          )}
        </section>

        <HelpPanel
          taskKey={`${task.instanceKey}:${recalling ? 'recall' : 'cards'}`}
          boardRef={boardRef}
          check={sorting ? { label: ui.check, onCheck } : null}
          verdict={verdict}
          stale={sorting ? state.stale : lineStale}
          hints={hintList.length ? { texts: hintList.map(h => text(h.code, h.params)), shown: state.hintIndex, onMore: onHint } : null}
          reveal={reveal}
          continueAction={continueAction}
          next={{ onNext, ...(continueAction ? { destination: ui.nextWhere } : {}) }}
          // Recall has no check: «Далі →» (skip) stays secondary until the lines are done.
          primary={phase === 'recall' ? 'none' : undefined}
          className="ng-su-help"
        />

        <div className="ng-su-side">
          {prompted && (
            <Aside screen={SCREEN} id="modes" title={ui.modesTitle} className="ng-su-aside ng-su-aside-modes">
              <ModesExample values={task.values} />
            </Aside>
          )}
          {sorting && (
            <Aside screen={SCREEN} id="arrange" title={ui.arrangeTitle} className="ng-su-aside">
              <p>{shared.reorder.help}</p>
              <p>{ui.orders}</p>
            </Aside>
          )}
        </div>
      </div>
    </div>
  );
}
