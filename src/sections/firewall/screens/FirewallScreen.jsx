// The firewall section: two exercises, switched in the top bar
// (FirewallScreen, at the end of this file): «Передбач» (FW-1, PredictView
// below) and «Упорядкуй правила» (FW-2, OrderView.jsx). The place
// `firewall-tab` keeps which one is open. The switch is in the bar, not
// beside the heading, so «Передбач» keeps its height budget (S4: the whole
// diagram at 12 px text at 1280 × 800).
//
// «Передбач» (FW-1 screen spec v1 with its v2 must-fixes; round 4 spec F1
// with its v2 and v3 contracts): predict how RouterOS's filter decides a
// packet's fate, then watch the walk. Two levels:
//   - «1 · Куди йде пакет»: three packets (to the router, through it, and the
//     reply to the second), one decision each: input or forward. The chain is
//     chosen, then «Перевірити» commits it (no retry: it is the whole
//     decision); the diagram shows the door the filter took;
//   - «2 · Яке правило»: today's rounds (six packets, the nine rules, the
//     three rule sets), in two steps per packet: «Який ланцюжок?» is checked
//     at once (logic checkHook): a wrong chain gets one sentence why and the
//     learner picks again (not committed; the session records `assist`, as
//     a hint does); the right one opens the rule step, where only that
//     chain's rows and its end-of-chain row are selectable and the other
//     chain folds into one grey line. «Перевірити» then commits the card
//     through predict.js commit(): it locks, right or wrong, and its walk
//     plays: the envelope goes from the source to the ingress port, into the
//     door the filter took (the other dims), waits there while the rows
//     light one by one (0.35 s a row, about 4 s at most), then goes on to
//     the router's core or out to the destination, or stops with a calm ✕.
//     The walk plays only on a fresh commit (or «Показати ще раз»); coming
//     back to a card, or to the screen, shows its end frame. Any key or
//     pointer press skips to the end; reduced motion shows the end at once;
//     «По кроках» steps through it.
//
// Help (round 4, spec A1): one HelpPanel in the work column, under the step
// it checks: «Перевірити» (none while the chain step of level 2 is open:
// its two buttons are the action), the hints, «Показати відповідь» (this
// card, applied on the table and the diagram, the board marked «показано»,
// the learner's draft under «Моя відповідь»), and after a commit «Наступний
// пакет →» (continueAction). At the round's end «Далі →» (a new round; from
// level 1, level 2); before it «Далі →» is a quiet skip (stage-1 decision
// Q6). Which chain and row decided shows with the verdict once the walk has
// shown it. «Що означають стани» and «Команда RouterOS» are in «⋯»; the rule
// reading is a first-visit aside.
//
// State (ARCHITECTURE §6, spec S3): the store owns the drafts, the position,
// the commit state, the revealed and played cards (the instance's `view`,
// round.js), and the hint ladder (the session); the section place keeps
// the level, the level-2 rule set and each variant's seed, so coming back
// restores the round. Each fresh commit records one check in the session
// with commit()'s cumulative result, so a round earns its variant only when
// every card is right and none was revealed (a quiet ✓, DoneMark, on that
// variant and on its level; no score).
//
// Leaks (§7, S5): before a card is committed nothing on screen depends on
// its door, deciding rule or verdict beyond what the learner chose. The
// chain step and the diagram are the same for every card (the source, the
// ingress port and a dst-NAT label); the rule step follows the learner's
// accepted chain; card ids never reach the DOM. The reference solution is
// read only by «Показати відповідь» (reveal.js), for the current card.
//
// Round 5 (spec 5a §3, v2 A–G; firewall level 1 is the reference screen):
//   - the action line (ActionLine) sits above the current step's choices and
//     names its group: «Обери, кому адресовано пакет.» (level 1); level 2's
//     chain step, then «Тепер обери правило, що вирішить долю пакета.»;
//   - level 1 shows the rule sentence under the task, a two-line card
//     (logic's cardView fields) whose «Куди» is a FactLink, and options
//     that lead with Ukrainian; its verdict is two lines, the ✗/✓ line and
//     whose address «Куди» is (from cardView's owner, only after the check);
//   - the diagram highlight (label only) follows a FactLink tap until the
//     next tap, a choice, or another card or level; after a wrong level 1
//     check the screen sets it to the owner's address label itself;
//   - the router's own addresses are inside R1 (FirewallDiagram), at every level;
//   - (5b-2 B) «По кроках» names each step under the stepper, in the trace's
//     words (logic/trace.js: the packet's arrival and dst-NAT, its chain,
//     each rule by its RouterOS number, the chain's end); the walk's
//     FastTrack line says the packet shown is on the slow path.
//
// Layout by the screen's own width (firewall.css). The page is the one
// vertical scroller (spec A2):
//   - desk and wide (≥ 960): the heading, the task, the dots and the
//     diagram on the left (the diagram sticky while the page scrolls); the
//     work column (card, chain, rules, the help panel) on the right, at its
//     natural height;
//   - narrow (< 960): one column: the card, the steps and the panel, then
//     the diagram (neutral before commitment).
import { useEffect, useMemo, useRef, useState } from 'react';
import fw, { cardView, checkHook, commit as commitCard } from '../logic/predict.js';
import { classify } from '../logic/classify.js';
import { traceCaptions } from '../logic/trace.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, usePref, useStore } from '../../../ui/useStore.js';
import { useReducedMotion, useStepTimer } from '../../../ui/motion.js';
import { BarControls, SheetCaption, SheetChoice } from '../../../ui/BarSlot.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import HelpPanel, { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import MoreMenu from '../../../ui/components/MoreMenu.jsx';
import DoneMark from '../../../ui/components/DoneMark.jsx';
import Aside, { useAsideFold } from '../../../ui/components/Aside.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import DiagramExpand, { ExpandButton, useDiagramExpand, useTextOpen } from '../../../ui/topology/DiagramExpand.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import FactLink, { scrollToLabel } from '../../../ui/components/FactLink.jsx';
import { uk } from '../../../ui/uk.js';
import { chainText, meanings, predictLevels, predictStep, t, ui } from '../uk.js';
import { cardLines, chainRows, decidingId, feedbackOf, natRuleOf, stepCaptions, tableRows, textSections, walkFrame, walkNotes, walkOutcomes, walkPlan } from './walkView.js';
import { sceneOf } from './diagram.js';
import { commitOf, dotsOf, earnedLevels, earnedVariants, hookAccepted, isCommitted, nextOpen, nextSeed, roundOf, roundView } from './round.js';
import { revealCard } from './reveal.js';
import FirewallDiagram from './FirewallDiagram.jsx';
import { DoorChoice, RuleTable } from './Choices.jsx';
import PacketCard from './PacketCard.jsx';
import OrderView from './OrderView.jsx';
import '../../../ui/tokens.css';
import './firewall.css';

/** The place of the asides (first-visit chrome, spec A8). */
export const SCREEN = 'firewall';

/** The layout mode for a content width (the thresholds in firewall.css). */
export const modeFor = width => (width >= 1440 ? 'wide' : width >= 960 ? 'desk' : 'narrow');

/** The mode, and the sticky left column's measures: at least one screen
 * high (--ng-fw-screen); taller (an open aside, a narrow window), it scrolls
 * with the page until its end is in view, then stays (--ng-fw-top). */
function useMode(ref) {
  const [mode, setMode] = useState(() => modeFor(typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const screen = el.closest('.ng-screen, .ng-standalone');
    const side = el.querySelector('.ng-fw-side');
    const measure = () => {
      setMode(modeFor(el.clientWidth));
      if (!screen) return;
      el.style.setProperty('--ng-fw-screen', `${screen.clientHeight}px`);
      if (side) el.style.setProperty('--ng-fw-top', `${Math.min(6, screen.clientHeight - side.offsetHeight - 6)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (screen) observer.observe(screen);
    if (side) observer.observe(side);
    return () => observer.disconnect();
  }, []);
  return mode;
}

/** «Що означають стани» («⋯»): the states' meanings, then how the filter reads its rules. */
export function StatesPanel() {
  return <>
    <ul className="ng-fw-rules-list">
      {Object.values(meanings).map(line => <li key={line}>{line}</li>)}
    </ul>
    <h3 className="ng-fw-caption">{ui.rulesTitle}</h3>
    <ul className="ng-fw-rules-list">
      {ui.rulesList.map(line => <li key={line}>{line}</li>)}
    </ul>
  </>;
}

/** «Команда RouterOS» («⋯»): the rule set as RouterOS commands, in order. */
export function CommandsPanel({ rows }) {
  return (
    <pre className="ng-fw-script">
      {rows.filter(row => row.command).map(row => <span key={row.id} className="ng-fw-script-line">{row.command}</span>)}
    </pre>
  );
}

const DOT = { ok: '✓', no: '✗', revealed: '👁' };

/** Scroll the page just enough to show `row` whole (a walk lights rows one by one). */
function keepInView(row) {
  row?.scrollIntoView?.({ block: 'nearest' });
}

/** The combined record: level 1's chain variant, then level 2's three rule sets (logic handoff). */
export function predictRecord(bank) {
  const level2 = bank.resolveRecord(bank.records[0]);
  if (!bank.chainRecords?.length) return level2;
  const level1 = bank.resolveRecord(bank.chainRecords[0]);
  return { ...level2, variants: [...level1.variants, ...level2.variants] };
}

/**
 * «Передбач» (FW-1).
 * @param {{ bank: { records: object[], resolveRecord: Function, chainRecords?: object[] } }} props
 */
function PredictView({ bank }) {
  const record = useMemo(() => predictRecord(bank), [bank]);
  const ruleSets = record.variants.filter(v => v.kind !== 'chain');
  const chainSet = record.variants.find(v => v.kind === 'chain') ?? null;
  const { state } = useStore();
  const [themeName] = usePref('theme');
  const [place, setPlace] = usePlace('firewall', () => ({
    level: chainSet ? 1 : 2,
    variantId: ruleSets[0].id,
    seeds: Object.fromEntries(record.variants.map(v => [v.id, nextSeed()])),
  }));
  const level = place.level === 1 && chainSet ? 1 : 2;
  const ruleSet = ruleSets.find(v => v.id === place.variantId) ?? ruleSets[0];
  const variant = level === 1 ? chainSet : ruleSet;
  const seed = place.seeds?.[variant.id] ?? 1;
  const ex = useExercise(fw, record, { variantId: variant.id, seed, level });
  const { task } = ex;
  const round = roundView(ex.view, task);
  const commitState = useMemo(() => commitOf(round, task), [round.commit, task]);
  const foldAsides = useAsideFold(SCREEN);

  const root = useRef(null);
  const layout = useMode(root);
  const reduced = useReducedMotion();
  const cardRef = useRef(null);
  const tableRef = useRef(null);
  const textButton = useRef(null);
  const moreHost = useRef(null);
  const rowEls = useRef([]);
  const focusCard = useRef(false);
  const focusRules = useRef(false);
  // Round 6 (P2): «Текстом» starts open on a phone; the full-screen diagram has a zoom of its own.
  const [textOpen, setTextOpen] = useTextOpen();
  const expand = useDiagramExpand({ zoom: ex.view.zoom, onZoom: zoom => setView({ zoom }) });
  const [mine, setMine] = useState(null);   // the card whose «Моя відповідь» is shown

  const allRows = useMemo(() => tableRows(task.policy), [task]);
  const nat = useMemo(() => natRuleOf(task.topology, variant.cards), [task, variant]);
  const total = task.cards.length;
  const position = round.position;
  const card = task.cards[position];
  const committed = isCommitted(commitState, card.id);
  const evidenceOf = committed ? commitState.result.evidence[card.id] : null;
  const walk = level === 2 ? evidenceOf : null;
  const draft = round.drafts[card.id] ?? {};
  const selection = committed ? commitState.answer[card.id] : draft;
  const revealedCard = round.revealed.includes(card.id);
  const accepted = hookAccepted(level, draft);
  const step = committed ? 'done' : level === 2 && accepted ? 'rule' : 'hook';
  // The rule step: the chosen chain's rows only (the walk's chain after a commit).
  const chain = useMemo(() => (level === 2 && (walk || accepted) ? chainRows(task, walk?.hook ?? draft.hook) : null), [level, task, walk, accepted, draft.hook]);
  const rows = chain?.rows ?? null;
  const lines = useMemo(() => cardLines(task, card), [task, card]);
  // The card's givens per level (logic's cardView). `owner` is read only
  // after a check, or when the learner taps the «Куди» fact (R3).
  const view = useMemo(() => cardView(task, card.id, level), [task, card, level]);
  const shortLines = useMemo(() => (level === 1 ? {
    ...lines, from: { label: ui.from, value: `${view.from.ip} (${view.from.device})` }, to: { label: ui.to, value: view.to.ip },
  } : lines), [level, lines, view]);
  const outcomes = useMemo(() => (walk ? walkOutcomes(task, card, walk) : null), [task, card, walk]);
  const plan = useMemo(() => (walk && rows ? walkPlan(task, walk, rows) : null), [task, walk, rows]);
  const context = useMemo(() => (walk ? classify(task.topology, card) : null), [task, card, walk]);
  // «По кроках» names each step (round 5, 5b-2 B): the trace's captions of this committed walk.
  const captions = useMemo(() => (walk && plan ? stepCaptions(traceCaptions({ policy: task.policy, card, walk }), card, rows, plan) : null), [task, card, walk, rows, plan]);

  // The walk's frame: the stepper's, the timer's, or (navigation) the end.
  // One state object, keyed by the card on screen: `play` is the run a fresh
  // commit (or «Показати ще раз») started here, `stepper` the «По кроках»
  // frame; `n` only grows, so every run has its own key. Any other card on
  // screen (a dot, the store, another round or variant) gets a cleared copy,
  // adjusted during render as React documents for state that follows a
  // prop: idempotent, so StrictMode's double render is safe. Coming back
  // (A → B → A) shows the end frame and never plays it again (spec §6).
  const cardKey = `${ex.key}|${position}`;
  const [walkUi, setWalkUi] = useState({ at: cardKey, n: 0, play: null, stepper: null });
  const shownUi = walkUi.at === cardKey ? walkUi : { ...walkUi, at: cardKey, play: null, stepper: null };
  if (shownUi !== walkUi) setWalkUi(shownUi);
  const playKey = plan && shownUi.play ? `${cardKey}|${shownUi.play}` : null;
  // The diagram highlight a FactLink tap set: kept for this card only, until
  // the next tap or a choice (spec v2 C; no timer).
  // Another card or level clears it (adjusted during render, as walkUi), so coming back shows none.
  const [tapped, setTapped] = useState({ at: null, highlight: null, n: 0 });
  if (tapped.at !== cardKey && tapped.highlight) setTapped(x => ({ ...x, at: cardKey, highlight: null }));
  const factHighlight = tapped.at === cardKey ? tapped.highlight : null;
  const timer = useStepTimer(plan?.last ?? 0, playKey, reduced, { stepMs: plan?.stepMs ?? 350 });
  const stepping = Boolean(plan && shownUi.stepper !== null);
  const frame = plan ? walkFrame(plan, stepping ? shownUi.stepper : timer.step) : null;
  // The slow-path line shows under the table once the FastTrack row is lit (round 4: the corrected words).
  const marked = rows && outcomes ? rows.findIndex(row => outcomes[row.at]?.state === 'marked') : -1;
  const notes = walk && marked >= 0 && (frame.end || marked < frame.lit) ? walkNotes(walk) : [];
  const level1Hook = level === 1 && committed ? evidenceOf.hook : null;
  // After a wrong level 1 check the owner's address label is the explanation (label only, spec v2 F).
  const wrongL1 = level === 1 && committed && !revealedCard && commitState.answer[card.id]?.hook !== evidenceOf.hook;
  const ownerHighlight = { kind: 'label', value: view.owner.labelId };
  const highlight = factHighlight ?? (wrongL1 ? ownerHighlight : null);
  const drawn = level1Hook
    ? sceneOf({ topology: task.topology, card, walk: { hook: level1Hook, verdict: 'unknown' }, frame: { frame: 2, phase: 'door', waiting: false, end: false } })
    : sceneOf({ topology: task.topology, card, walk, frame, context });
  // Level 1 has no interface lists (L2 vocabulary): no «ether1 ∈ WAN» chip (round 5 repair).
  const scene = level === 1 ? { ...drawn, ingressLists: [] } : drawn;
  const firstAccept = round.played.find(id => commitState.result.evidence[id]?.verdict === 'accept');
  const illustrate = Boolean(frame?.end && walk?.verdict === 'accept' && firstAccept === card.id);

  const roundState = roundOf(task, commitState, round.revealed);
  const dots = dotsOf(task, commitState, round.revealed, position);
  const earned = earnedVariants(state.instances);
  const earnedLevel = earnedLevels(state.instances);
  const sections = useMemo(() => textSections(task, card, level === 1
    ? { nat, rules: false, hook: level1Hook }
    : { nat, walk, selection: committed ? selection : null }), [task, card, nat, walk, committed, selection, level, level1Hook]);

  // One column: a tapped fact's label comes into view, `block: 'nearest'` (the only movement).
  useEffect(() => {
    if (tapped.at === cardKey && tapped.highlight) scrollToLabel(root.current?.querySelector('.ng-fw-svg'), layout === 'narrow');
  }, [tapped.n]);
  // A new card takes focus where it is shown (after «Наступний пакет →» or «Далі →»).
  useEffect(() => {
    if (!focusCard.current) return;
    focusCard.current = false;
    cardRef.current?.focus();
  }, [ex.key, position]);
  // The chain accepted: focus moves to the rule step's first choice (the new step).
  useEffect(() => {
    if (!focusRules.current || step !== 'rule') return;
    focusRules.current = false;
    tableRef.current?.querySelector('[role="radio"][tabindex="0"]')?.focus();
  }, [step, cardKey]);
  // While a walk plays (and at its end), the row being checked stays in
  // view. Stepping through it («По кроках», pressed in the left column), the
  // row it lights (or the rule step) and the verdict under it come into
  // view together, so each step's row and the words about it are seen side by side.
  useEffect(() => {
    if (!playKey && !stepping) return;
    if (!frame) return;
    if (stepping) {
      // The row this step lights (before any, the rule step) and the verdict under it (5b-2: a long
      // table and a long verdict needn't fit together, the step's own row does).
      const current = root.current?.querySelector('.ng-fw-work [data-help-current]');
      const row = frame.lit >= 1 ? rowEls.current[frame.lit - 1] : tableRef.current;
      bringIntoView([row, current].filter(Boolean), reduced ? 'auto' : 'smooth');
      return;
    }
    if (frame.lit >= 1) keepInView(rowEls.current[frame.lit - 1]);
  }, [playKey, stepping, frame?.lit, frame?.end, frame?.frame]);

  const setView = patch => ex.setView(patch);
  const saveDraft = next => setView({ drafts: { ...round.drafts, [card.id]: next } });
  /** A walk starts on the card on screen (a fresh commit or «Показати ще раз»). */
  const started = () => setWalkUi(w => ({ at: cardKey, n: w.n + 1, play: w.n + 1, stepper: null }));
  const clearWalk = () => setWalkUi(w => ({ ...w, play: null, stepper: null }));
  /** Owner words for «Куди» (after a check, or the learner's tap): ui words from cardView's owner. */
  function ownerWords(said) {
    const { router, hosts } = task.topology;
    const ip = view.to.ip;
    return said({ ip, kind: view.owner.kind, iface: router.interfaces.find(i => i.address === ip)?.id, role: hosts.find(h => h.address === ip)?.role });
  }
  function tapFact() {
    setTapped(x => ({ at: cardKey, highlight: ownerHighlight, n: x.n + 1 }));
    return ownerWords(predictStep.said);
  }
  const clearFact = () => setTapped(x => (x.highlight ? { ...x, highlight: null } : x));
  /** The chain: level 1 drafts it; level 2 checks it at once (a wrong one is help, never a commitment). */
  function chooseHook(hook) {
    if (committed) return;
    clearFact();
    if (level === 1) { saveDraft({ hook }); return; }
    if (accepted) return;
    const result = checkHook(task, card.id, { hook });
    const n = (ex.view.hookChecks ?? 0) + 1;
    if (result.ok) {
      focusRules.current = true;
      setView({ drafts: { ...round.drafts, [card.id]: { hook, said: { code: result.code, n } } }, hookChecks: n });
    } else if (result.assisted) {
      ex.act({ type: 'session', action: { type: 'assist' } });
      setView({ drafts: { ...round.drafts, [card.id]: { retry: { code: result.code, n } } }, hookChecks: n });
    }
  }
  const chooseRule = decidedBy => { if (!committed && accepted) { clearFact(); saveDraft({ ...draft, decidedBy }); } };
  const ready = !committed && (level === 1 ? Boolean(draft.hook) : Boolean(accepted && draft.decidedBy));
  /** «Перевірити»: commit this card's choice; it locks, right or wrong. */
  function onCheck() {
    if (!ready) return;
    const chosen = level === 1 ? { hook: draft.hook } : { hook: draft.hook, decidedBy: draft.decidedBy };
    let next;
    try { next = commitCard(task, commitState, card.id, chosen); } catch { return; }
    foldAsides();
    ex.check(next.answer, { result: next.result });
    setView({ commit: next, played: [...round.played, card.id] });
    started();
  }
  /** «Показати відповідь»: the reveal path, for this card only (spec S3), applied on the board. */
  function onReveal() {
    if (committed) return;
    const next = revealCard(fw, task, commitState, card.id);
    ex.reveal();
    ex.check(next.answer, { result: next.result });
    setView({ commit: next, revealed: [...round.revealed, card.id], played: [...round.played, card.id] });
    started();
  }
  function show(i) {
    setView({ position: i });
    clearWalk();
  }
  /** «Наступний пакет →». */
  function onNext() {
    const i = nextOpen(task, commitState, position);
    if (i === null) return;
    focusCard.current = true;
    show(i);
  }
  /** «Далі →»: a new round (a new seed); from level 1, level 2. */
  function onAgain() {
    focusCard.current = true;
    foldAsides();
    if (level === 1) setPlace({ level: 2 });
    else setPlace({ seeds: { ...place.seeds, [variant.id]: nextSeed(seed) } });
    clearWalk();
  }
  const chooseVariant = id => { setPlace({ variantId: id }); clearWalk(); };
  const chooseLevel = value => { setPlace({ level: value }); clearWalk(); };
  const replay = () => { if (walk) started(); };
  const toggleSteps = () => setWalkUi(w => ({ ...w, at: cardKey, play: null, stepper: w.at === cardKey && w.stepper !== null ? null : 0 }));
  const stepBy = d => setWalkUi(w => (w.at === cardKey && w.stepper !== null ? { ...w, stepper: Math.max(0, Math.min(plan.last, w.stepper + d)) } : w));
  function onStepKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stepBy(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stepBy(-1); }
  }
  function closeText() {
    setTextOpen(false);
    textButton.current?.focus();
  }
  /** Any pointer or key press skips a walk under way to its end; the press still happens. */
  const skip = () => { if (timer.playing) timer.skip(); };

  // ── The help panel's verdict: the commit's, else the chain step's ──
  const finding = committed ? commitState.result.findings.find(f => f.entity === card.id) ?? null : null;
  const fb = committed && level === 2 ? feedbackOf(task, commitState, card, revealedCard) : null;
  const right = committed && !finding && !revealedCard;
  const hookSaid = !committed && level === 2 ? (draft.retry ?? draft.said ?? null) : null;
  const shownWalk = !walk || frame?.end;
  const later = fb && level === 2 && shownWalk ? fb.later : [];
  const roundEnd = roundState.complete && shownWalk ? (roundState.allRight ? ui.roundOk : ui.roundEnd) : null;
  // Level 1's verdict: two lines, the ✗ or ✓ line, then whose address «Куди» is (spec v2 F).
  const ownerLine = level1Hook ? ownerWords(predictStep.owner) : null;
  const verdict = committed ? {
    tone: right ? 'ok' : 'info',
    scope: roundState.complete && roundState.allRight ? 'task' : 'part',
    stamp: `c${ex.presses}`,
    summary: revealedCard ? uk.revealed : right ? (level === 1 ? predictStep.chainRight : ui.right) : level === 1 ? ui.wrong : `${ui.wrong} ${finding ? t(finding.code) : ''}`.trim(),
    summaryNode: (later.length || ownerLine) ? (
      <div className="ng-fw-after">
        {ownerLine && <p className="ng-fw-owner">{ownerLine}</p>}
        {later.map(line => <p key={line} className="ng-fw-later">{line}</p>)}
      </div>
    ) : null,
  } : hookSaid ? {
    tone: hookSaid.code === 'hook-ok' ? 'ok' : 'no', scope: 'part', stamp: `h${hookSaid.n}`, summary: t(hookSaid.code),
  } : null;
  // What the current message is about (data-evidence): after a commit, the
  // deciding row (the walk lights it; it is next to the panel); level
  // 1, the chain; a wrong chain, the chain; in the rule step (the chain's
  // words, a hint), the chosen row, else the first; a hint before any
  // verdict, the packet card for rung 1 and the chain after it.
  const evidenceRow = committed && level === 2 ? decidingId(walk)
    : step === 'rule' ? draft.decidedBy ?? rows?.[0]?.id ?? null : null;
  const chainEvidence = (committed && level === 1) || (!committed && Boolean(draft.retry)) || (step === 'hook' && !hookSaid && ex.session.hintIndex > 1);
  const cardEvidence = step === 'hook' && !hookSaid && ex.session.hintIndex === 1;
  const draftShown = mine === cardKey && revealedCard && (draft.hook || draft.decidedBy);
  const tableValue = draftShown ? draft.decidedBy ?? null : selection.decidedBy ?? null;

  const variantLabel = v => <>{v.title}<DoneMark done={earned.has(v.id)} /></>;
  const levelLabel = l => <>{l.label}<DoneMark done={earnedLevel.has(l.value)} /></>;
  const walkState = !walk ? undefined : stepping ? 'stepping' : timer.playing ? 'playing' : 'done';

  const stage = (
      <section className="ng-fw-stage" aria-label={ui.diagramLabel}>
        <DiagramExpand expand={expand}>
        <FirewallDiagram scene={scene} topology={task.topology} highlight={highlight} zoom={expand.zoom} onZoom={expand.onZoom} viewKey={ex.key}
          covered={expand.covered(textOpen)}
          tools={<><TextEquivalentButton buttonRef={textButton} id="ng-fw-text" label={ui.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(sections)} /><ExpandButton expand={expand} /></>}
          overlays={<TextEquivalent id="ng-fw-text" title={ui.textTitle} sections={sections} open={expand.covered(textOpen)} onClose={closeText} />} />
        </DiagramExpand>
        {illustrate && <p className="ng-fw-illustration">{ui.illustration}</p>}
        {walk && (
          <div className="ng-fw-walkbar">
            <button type="button" className="ng-fw-btn ng-fw-replay" onClick={replay}>{ui.replay}</button>
            <button type="button" className="ng-fw-btn" aria-pressed={stepping} onClick={toggleSteps}>{ui.steps}</button>
            {stepping && (
              <span className="ng-fw-stepper" role="group" aria-label={ui.stepsGroup} aria-describedby="ng-fw-step-caption" onKeyDown={onStepKey}>
                <button type="button" className="ng-fw-icon" aria-label={ui.stepBack} aria-disabled={frame.frame <= 0} onClick={() => stepBy(-1)}>◀</button>
                <span className="ng-fw-step-text">{ui.stepOf({ n: frame.frame + 1, total: plan.last + 1 })}</span>
                <button type="button" className="ng-fw-icon" aria-label={ui.stepForward} aria-disabled={frame.frame >= plan.last} onClick={() => stepBy(1)}>▶</button>
              </span>
            )}
          </div>
        )}
        {stepping && <p id="ng-fw-step-caption" className="ng-fw-step-caption" aria-live="polite">{captions?.[frame.frame] ?? ''}</p>}
      </section>
  );

  return (
    <div ref={root} className="ng-fw" data-theme={themeName} data-mode={layout} data-walk={walkState} data-level={level}
      onPointerDownCapture={skip} onKeyDownCapture={skip}>
      <BarControls>
        <div className="ng-fw-controls">
          <span className="ng-fw-syntax">{ui.syntaxLabel}</span>
        </div>
      </BarControls>

      <div className="ng-fw-side">
      <header className="ng-fw-head">
        <h1 className="ng-fw-h1">{ui.heading}</h1>
        {/* Round 6: on a phone both go into the bar's «⋯» sheet; the row keeps a stepper over the rule sets (level 2) or the levels. */}
        {chainSet && <SheetChoice stepper={level !== 2} label={ui.level} value={level} onChange={chooseLevel} className="ng-fw-variants ng-fw-levels"
          options={predictLevels.map(l => ({ value: l.value, label: levelLabel(l), step: l.label }))} />}
        {level === 2 && <SheetChoice stepper label={ui.variant} value={ruleSet.id} onChange={chooseVariant} className="ng-fw-variants"
          options={ruleSets.map(v => ({ value: v.id, label: variantLabel(v), step: v.title }))} />}
        <MoreMenu disclosureHost={moreHost} items={[
          { id: 'states', label: ui.statesMenu, render: () => <StatesPanel /> },
          level === 2 && { id: 'commands', label: ui.commandsMenu, render: () => <CommandsPanel rows={allRows} /> },
        ]} />
      </header>
      <div className="ng-fw-intro">
        <p className="ng-fw-variant-text">{variant.text}</p>
        {level === 1 && <p className="ng-fw-rule-sentence">{predictStep.rule}</p>}
        {level === 2 && <Aside screen={SCREEN} id="lesson" title={ui.rulesTitle}><p className="ng-fw-lesson">{ui.lesson}</p></Aside>}
      </div>
      <nav className="ng-fw-progress" aria-label={ui.progressLabel}>
        <span className="ng-fw-progress-text">{ui.progress({ n: position + 1, total })}</span>
        <ol className="ng-fw-dots">
          {dots.map((d, i) => (
            <li key={i}>
              <button type="button" className={`ng-fw-dot${d.status ? ` is-${d.status}` : ''}${d.current ? ' is-current' : ''}`}
                aria-label={ui.dot({ n: d.n, status: d.status ? ui.dotStatus[d.status] : d.current ? ui.dotStatus.current : null })}
                aria-current={d.current ? 'step' : undefined} disabled={!d.clickable} onClick={() => { if (d.clickable && !d.current) show(i); }}>
                <span aria-hidden="true">{d.status ? DOT[d.status] : d.current ? '●' : '○'}</span>
              </button>
            </li>
          ))}
        </ol>
        {/* The round's end, apart from the verdict (round 5 repair: the verdict stays two lines). */}
        {roundEnd && <p className="ng-fw-round">{roundEnd}</p>}
      </nav>
      {layout !== 'narrow' && stage}
      </div>

      <section className={`ng-fw-work${revealedCard ? ' is-revealed' : ''}`} aria-label={ui.cardLabel} {...(revealedCard ? { 'data-revealed': '' } : {})}>
        <div {...(cardEvidence ? { 'data-evidence': 'current' } : {})}>
          <PacketCard ref={cardRef} lines={shortLines} n={position + 1} total={total} fields={view.fields}
            toNode={<FactLink key={cardKey} value={view.to.ip} onActivate={tapFact} active={Boolean(factHighlight)} />} />
        </div>
        {level === 2 && view.requestOf && <p className="ng-fw-reply">{predictStep.reply}</p>}
        {!rows && <ActionLine id="ng-fw-action">{committed ? predictStep.action.l1Done : level === 1 ? predictStep.action.l1 : predictStep.action.hook}</ActionLine>}
        <DoorChoice value={(draftShown ? draft.hook : selection.hook) ?? null} onChange={chooseHook} locked={committed || accepted}
          decided={committed && (level === 1 || frame?.frame >= 2) ? evidenceOf.hook : null} evidence={chainEvidence}
          mine={committed && level === 1 && !revealedCard} level={level} labelledBy={rows || committed ? null : 'ng-fw-action'} />
        {rows && (
          <div ref={tableRef}>
            <ActionLine id="ng-fw-action">{committed ? predictStep.action.ruleDone : predictStep.action.rule}</ActionLine>
            <RuleTable rows={rows} value={tableValue} onChange={chooseRule} locked={committed} labelledBy={committed ? null : 'ng-fw-action'}
              outcomes={draftShown ? null : outcomes} lit={frame?.lit ?? 0} end={Boolean(frame?.end)} deciding={walk ? decidingId(walk) : null}
              rowRef={(i, el) => { rowEls.current[i] = el; }} notes={notes} folded={chain.folded} evidence={evidenceRow} mine={!revealedCard || Boolean(draftShown)} />
          </div>
        )}
        {revealedCard && (
          <p className="ng-fw-shown">
            <span className="ng-fw-shown-chip">{uk.help.shown}</span>
            {(draft.hook || draft.decidedBy) && (
              <button type="button" className="ng-fw-btn ng-fw-mine" aria-pressed={Boolean(draftShown)} onClick={() => setMine(m => (m === cardKey ? null : cardKey))}>{uk.help.myAnswer}</button>
            )}
          </p>
        )}
        {/* One card is one task for the panel: moving between cards starts it
            over (no re-announced verdict, no scroll); its steps clear the verdict. */}
        <HelpPanel
          taskKey={`${task.instanceKey}|${card.id}`}
          stepKey={step}
          check={committed || step === 'hook' && level === 2 ? null : { label: ui.check, onCheck, disabled: !ready }}
          primary={committed ? undefined : 'check'}
          verdict={verdict}
          hints={committed ? null : { texts: ex.hints({ cardId: card.id }).map(h => chainText(h.code, h.params)), shown: ex.session.hintIndex, onMore: () => ex.hint(3) }}
          reveal={committed && !revealedCard ? null : { revealed: revealedCard, onReveal, render: () => null,
            // The round's end is said with the applied line when the last card was revealed.
            applied: `${(draft.hook || draft.decidedBy) ? uk.help.applied : ui.appliedPlain}${roundState.complete ? ` ${ui.roundEnd}` : ''}` }}
          continueAction={committed && !roundState.complete ? { label: ui.next, onClick: onNext } : null}
          next={{ onNext: onAgain, ...(committed && !roundState.complete ? { destination: level === 1 ? ui.toLevel2 : ui.newRound } : {}) }}
        />
        <div ref={moreHost} className="ng-fw-more-host" />
      </section>

      {layout === 'narrow' && stage}
    </div>
  );
}

/**
 * The firewall section: «Передбач» and, when the target's bank has its
 * records, «Упорядкуй правила», switched in the top bar (before each
 * exercise's own controls there). Switching keeps each exercise's place and
 * instances; the switch itself stays mounted, so it keeps the focus.
 * @param {{ bank: { records: object[], resolveRecord: Function, orderRecords?: object[], resolveOrderRecord?: Function } }} props
 */
export default function FirewallScreen({ bank }) {
  const [tab, setTab] = usePlace('firewall-tab', { exercise: 'predict' });
  const exercises = ['predict', ...(bank.orderRecords?.length && bank.resolveOrderRecord ? ['order'] : [])];
  const exercise = exercises.includes(tab.exercise) ? tab.exercise : 'predict';
  return <>
    {exercises.length > 1 && (
      <BarControls>
        <SheetCaption label={ui.exercise} />
        <Segmented label={ui.exercise} value={exercise} onChange={id => setTab({ exercise: id })} className="ng-fw-exercises"
          options={exercises.map(id => ({ value: id, label: ui.exercises[id] }))} />
      </BarControls>
    )}
    {exercise === 'order' ? <OrderView bank={bank} /> : <PredictView bank={bank} />}
  </>;
}
