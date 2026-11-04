// What the «Упорядкуй правила» screen shows (FW-2 spec §1, §3, v2 B2–B4),
// in words and states. Pure: no React, DOM or clock; tested in Node.
//
//   - taskLines(task): the task's sentence and its goal lines (B3).
//   - hint2Text(kind): hint 2 in the words of the finding it was opened for.
//   - orderRows(task, order): the learner's list as rows, in the order
//     given, with FW-1's chips (tableRows) and the rule's description. No
//     row carries a number or an id beyond the React key: ReorderList
//     numbers the positions it shows.
//   - byChain(task, order): that order chain by chain, for two lists.
//   - walkRows(walkIn): the learner walk (logic.walkInput) as each rule's
//     outcome by id, plus the chain end when it decided; FW-1's words.
//   - orderScene / orderTextSections: the diagram and «Текстом» for the
//     network alone, a feedback packet, or that packet's walk.
//
// Nothing here reads a reference: the walk is the learner's own list.
import { classify } from '../logic/classify.js';
import { orderText, orderUi, walkText, ui } from '../uk.js';
import { givenSections, networkSections, tableRows, walkFrame, walkNotes, walkOutcomes, walkPlan } from './walkView.js';
import { neutralScene, sceneOf } from './diagram.js';

/** The chains in «Увесь фільтр»'s two lists (round 9, B4). */
export const CHAINS = ['input', 'forward'];
/** The same order read chain by chain: input's rules, then forward's, each in its own order.
 * A packet walks one chain only, so this changes no verdict. */
export const byChain = (task, order) => CHAINS.flatMap(chain => order.filter(id => task.rules.find(rule => rule.id === id)?.chain === chain));

/** The tips after success, by level (B2: FastTrack and forward only in «Увесь фільтр»). */
export const TIPS = { input: ['replies', 'input'], all: ['fasttrack', 'replies', 'input', 'forward'] };

/**
 * The task's text in its parts: the logic joins the level's sentence («Упорядкуй
 * правила…») and the policy's goal lines (uk.js orderGoals, B3) with line
 * breaks; the screen shows the sentence in bold and the goals under it.
 * @returns {{ sentence: string, goals: string[] }}
 */
export function taskLines(task) {
  const [sentence, ...goals] = task.text.split('\n');
  return { sentence, goals };
}

/**
 * Hint 2's words, from the finding its check found (`kind`, the screen keeps
 * it with the instance so the words don't change under a later reorder): a
 * packet's walk (order-verdict, or not known), a rule that never fires
 * (order-dead: no packet, so the two marked rules), or a list that passed.
 */
export function hint2Text(kind) {
  if (kind === 'order-dead') return orderUi.hintDead;
  if (kind === 'order-ok') return orderUi.hintDone;
  return orderText('order-hint-walk');
}

/** A sentence quoted inside another: without its final full stop. */
export const quoted = text => String(text).replace(/\.$/, '');

/**
 * The list's rows in `order` (rule ids of `task.rules`).
 * @returns {Array<{ id: string, chain: string, action: string, chips: object[], description: string }>}
 */
export function orderRows(task, order) {
  const byId = new Map(task.rules.map(r => [r.id, r]));
  const rules = order.map(id => byId.get(id)).filter(Boolean);
  return tableRows({ id: 'home-basic', rules }).filter(row => !row.end)
    .map(({ id, chain, action, chips, description }) => ({ id, chain, action, chips, description }));
}

/**
 * The learner walk on the list: each rule's outcome for the packet (FW-1's
 * walkOutcomes: «не збігається: …», «збіглося — вирішує», «не дійшло»…),
 * the chain end if it decided, and the slow-path assumption once a
 * FastTrack row marked the connection.
 * @param {{ topology: object, policy: object, card: object, walk: object }} walkIn  logic.walkInput
 */
export function walkRows(walkIn) {
  const rows = tableRows(walkIn.policy);
  const outcomes = walkOutcomes({ topology: walkIn.topology, policy: walkIn.policy }, walkIn.card, walkIn.walk);
  const byId = {};
  let end = null;
  rows.forEach((row, i) => {
    if (!row.end) byId[row.id] = outcomes[i];
    else if (outcomes[i].state === 'end') end = { chain: row.chain, text: outcomes[i].text };
  });
  // The corrected slow-path line (round 4, spec F1 v2), as FW-1's walk says it.
  const assumptions = walkNotes(walkIn.walk);
  return { byId, end, assumptions };
}

/**
 * The diagram: the network alone (with its dst-NAT label when `nat` is
 * given); a feedback packet's source and ingress; or, with its walk open,
 * the walk's last frame (the door, then the exit or ✕).
 */
export function orderScene({ topology, nat = null, card = null, walkIn = null }) {
  if (!card) return neutralScene(nat);
  if (!walkIn) {
    const scene = sceneOf({ topology, card });
    return { ...scene, nat: scene.nat ?? nat };
  }
  const plan = walkPlan({ topology, policy: walkIn.policy }, walkIn.walk);
  const scene = sceneOf({ topology, card, walk: walkIn.walk, frame: walkFrame(plan, plan.last), context: classify(topology, card) });
  return { ...scene, nat: scene.nat ?? nat };
}

/** «Текстом»: the network; with a packet, its givens; with its walk, the door and the conclusion. */
export function orderTextSections({ topology, nat = null, card = null, walkIn = null }) {
  const task = { topology };
  const sections = card ? givenSections(task, card, nat) : networkSections(task, nat);
  if (!walkIn) return sections;
  const words = walkText(walkIn.walk);
  return [
    ...sections,
    { heading: ui.text.door, items: [ui.hook[walkIn.walk.hook]] },
    { heading: ui.text.conclusion, items: [words.conclusion, ...walkNotes(walkIn.walk)] },
  ];
}
