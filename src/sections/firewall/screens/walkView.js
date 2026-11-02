// What the firewall screen shows, in words and states (FW-1 screen spec §4,
// §5, v2 S1–S2). Pure: no React, DOM or clock; tested in Node.
//
//   - tableRows(policy): the rule table as givens, the same for every card:
//     RouterOS print numbers from 0, chain, action word, condition chips,
//     the description, the command; then the two chain-end rows.
//   - cardLines(task, card): the packet card's givens.
//   - walkOutcomes(task, card, walk): each row's outcome after commitment,
//     in table order. The evaluator stops at the deciding rule and emits no
//     step for a chain end, so the screen marks the chain-end row itself and
//     every row after the deciding one as not reached.
//   - walkPlan / walkFrame: the animation's frames (§5 timing).
//   - feedbackOf, textSections: the feedback (now and at the walk's end)
//     and «Текстом» (givens, the rule list, then each rule's outcome).
//
// Nothing here reads a solution: a walk is the committed card's evidence.
import { classify } from '../logic/classify.js';
import { renderPolicy } from '../logic/render.js';
import { fields } from '../logic/model.js';
import { meanings, predictStep, services, states, t, ui, walkText } from '../uk.js';
import { uk } from '../../../ui/uk.js';

/** Per-row animation step and the whole walk's cap (§5). */
export const ROW_MS = 350;
export const WALK_CAP_MS = 4000;

const tokenOf = value => (typeof value === 'object' ? `${value.from}-${value.to}` : String(value));
const valuesText = predicate => predicate.values.map(tokenOf).join(', ');

/** A rule's conditions as short chips (§4), in the evaluator's field order. */
function chipsOf(rule) {
  const chips = Object.keys(fields).filter(field => rule.match[field]).map(field => {
    const predicate = rule.match[field];
    const text = `${ui.chipField[field] ?? ui.field[field]}: ${predicate.not ? '!' : ''}${valuesText(predicate)}`;
    // States carry their meaning on hover (S1); «Текстом» and «Правила» say
    // it too. A shortened field name carries its RouterOS name.
    const title = field === 'connectionState' ? predicate.values.map(v => meanings[v]).join('; ')
      : ui.chipField[field] ? `${ui.field[field]}=${predicate.not ? '!' : ''}${valuesText(predicate)}` : undefined;
    return { field, text, title };
  });
  return chips.length ? chips : [{ field: null, text: ui.anyPacket }];
}

/** The action as a word chip: «accept», «drop», «fasttrack». */
export const actionWord = action => (action === 'fasttrack-connection' ? 'fasttrack' : action);

/**
 * The rule table, one numbered list as RouterOS prints it (S1: numbers from
 * 0, the screen shows position − 1), then the chain-end rows. Givens only.
 * @returns {Array<{ id: string, end: boolean, n: number|null, chain: string, action?: string,
 *   disabled?: boolean, chips?: object[], description?: string|null, command?: string, label?: string }>}
 */
export function tableRows(policy) {
  const rules = new Map(policy.rules.map(r => [r.id, r]));
  return renderPolicy(policy).map(row => {
    if (row.code === 'chain-end-row') return { id: row.id, end: true, n: null, chain: row.chain, label: ui.chainEndShort };
    const rule = rules.get(row.id);
    return {
      id: row.id, end: false, n: row.position - 1, chain: row.chain, action: actionWord(row.action), disabled: row.disabled,
      chips: chipsOf(rule), description: rule.descriptionCode ? t(rule.descriptionCode) : null, command: row.command,
      // Round 5 (R2): the short purpose shown under the row, always.
      purpose: rule.descriptionCode ? ui.purpose[rule.descriptionCode] ?? null : null,
      // The states' meanings, for keyboard focus (fix round 1); hover has the chip's title.
      meaning: rule.match.connectionState ? rule.match.connectionState.values.map(v => meanings[v]).join('; ') : null,
    };
  });
}

/** The row's number or chain end in words: «3», «кінець списку forward». */
export const rowName = row => (row.end ? ui.chainEnd(row.chain) : String(row.n));

const listsOf = (topology, iface) => Object.keys(topology.router.lists).filter(name => topology.router.lists[name].includes(iface));
const portText = port => ui.port(port, services[port]);

/** The packet card's givens (§4, S1): three lines on most cards. */
export function cardLines(task, card) {
  const { packet, facts } = card;
  const nat = facts.dstNat === true;
  const ports = packet.protocol === 'icmp'
    ? ui.icmp(packet.icmpType)
    : ui.ports({ protocol: packet.protocol, dst: packet.dstPort === undefined ? null : portText(packet.dstPort), src: packet.srcPort === undefined ? null : portText(packet.srcPort) });
  const natValue = facts.dstNat === 'unknown' ? t('dstnat.unknown')
    : !nat ? t('dstnat.no')
      : facts.dstNatFrom ? ui.natYes({ address: facts.dstNatFrom.address, port: facts.dstNatFrom.port, to: packet.dstIp, toPort: packet.dstPort })
        : t('dstnat.yes');
  const lists = listsOf(task.topology, facts.ingress);
  return {
    from: { label: ui.from, value: `${packet.srcIp} ${ui.via(facts.ingress)}${lists.length ? ` (${lists.join(', ')})` : ''}` },
    to: { label: nat ? ui.toNat : ui.to, value: packet.dstIp },
    ports,
    state: { label: ui.stateGiven, value: states[facts.state] ?? facts.state, meaning: meanings[facts.state] ?? null },
    nat: { label: ui.dstNat, value: natValue },
    natShown: nat,
  };
}

/** One failing condition in words, by predicate (S1): never a generic «≠». */
export function predicateText(step, card, context) {
  const { field, expected, actual } = step;
  const rule = expected.not ? ui.not(valuesText(expected)) : valuesText(expected);
  let packet;
  if (actual === 'unknown' || actual === undefined || actual === null) packet = ui.unknownFact;
  else if (field === 'connectionState') packet = states[actual] ?? String(actual);
  else if (field === 'connectionNatState') packet = actual.length ? ui.natDone : ui.natNone;
  else if (field === 'inInterfaceList') packet = ui.fromIface(context.ingress, actual);
  else if (field === 'outInterfaceList') packet = ui.toIface(context.egress, actual);
  else packet = Array.isArray(actual) ? (actual.length ? actual.join(', ') : 'ні') : String(actual);
  return ui.predicate({ field: ui.field[field], rule, packet });
}

/** The table row id that decided: a rule id or the qualified chain end. */
export const decidingId = walk => (walk.decidedBy === 'chain-end' ? `chain-end:${walk.hook}` : walk.decidedBy);

/**
 * Every row's outcome after commitment, in table order (§5, S1).
 * state: other-chain | disabled | mismatch | match | end | marked | unknown | not-reached
 */
export function walkOutcomes(task, card, walk) {
  const rows = tableRows(task.policy);
  const context = classify(task.topology, card);
  const steps = new Map(walk.steps.map(s => [s.ruleId, s]));
  const decider = rows.findIndex(r => r.id === decidingId(walk));
  return rows.map((row, i) => {
    if (i > decider) return { state: 'not-reached', text: ui.walk['not-reached'] };
    if (row.end) return i === decider ? { state: 'end', text: ui.walk.end } : { state: 'other-chain', text: ui.walk['other-chain'] };
    const step = steps.get(row.id);
    switch (step?.outcome) {
      case 'other-chain': return { state: 'other-chain', text: ui.walk['other-chain'] };
      case 'disabled': return { state: 'disabled', text: ui.walk.disabled };
      case 'mismatch': return { state: 'mismatch', text: ui.walk.mismatch(predicateText(step, card, context)) };
      case 'marked': return { state: 'marked', text: ui.walk.marked };
      case 'match': return { state: 'match', text: ui.walk.match };
      default: return { state: 'unknown', text: ui.walk.unknown };
    }
  });
}

/**
 * The walk's frames (§3, §5): 0 the envelope at the source, 1 at the
 * ingress port, 2 inside the door, then one row per frame; the last frame
 * lights the deciding row and shows the exit or ✕ at once.
 * `rows`: the rows on screen (round 4: only the packet's chain, chainRows),
 * so no frame is spent on a folded row; default the whole table.
 */
export function walkPlan(task, walk, rows = tableRows(task.policy)) {
  const rowsLit = rows.findIndex(r => r.id === decidingId(walk)) + 1;
  const last = 2 + rowsLit;
  return { rowsLit, last, stepMs: Math.min(ROW_MS, Math.floor(WALK_CAP_MS / last)) };
}

/** The state of the walk at a frame: rows lit, where the envelope is. */
export function walkFrame(plan, frame) {
  const f = Math.max(0, Math.min(plan.last, frame));
  return {
    frame: f,
    lit: Math.max(0, Math.min(plan.rowsLit, f - 2)),
    phase: f === 0 ? 'source' : f === 1 ? 'ingress' : f < plan.last ? 'door' : 'end',
    waiting: f >= 3 && f < plan.last,
    end: f === plan.last,
  };
}

/**
 * Round 4 (spec F1, level 2): the rule step shows only the chosen chain's
 * rows, its own chain end last, each keeping its RouterOS number and its
 * index in the whole table (`at`, for walkOutcomes); the other chain folds
 * into one line («forward: 4 правила — цей пакет їх не бачить»), so nothing
 * is hidden silently.
 * @returns {{ rows: object[], folded: string }}
 */
export function chainRows(task, hook) {
  const all = tableRows(task.policy).map((row, at) => ({ ...row, at }));
  const other = hook === 'input' ? 'forward' : 'input';
  const rows = all.filter(row => row.chain === hook);
  const count = all.filter(row => row.chain === other && !row.end).length;
  return { rows, folded: predictStep.folded({ hook: other, count }) };
}

/** The walk's notes under the table: the corrected slow-path line (round 4,
 * spec F1 v2) wherever the walk marks FastTrack, instead of the logic's
 * older assumption words. */
export const walkNotes = walk => (walk?.steps?.some(s => s.outcome === 'marked') ? [predictStep.slowPath] : []);

/** The current card's findings only (S3), not the round's aggregate code. */
export function findingOf(result, cardId) {
  return result.findings.find(f => f.entity === cardId) ?? null;
}

/**
 * The feedback for a committed card (§5, S1), in two parts, so the walk
 * isn't told before it is shown (fix round 1):
 *   - `now`, at the commit: ✓, or ✗ in the info tone with the finding (or
 *     «👁 Показано відповідь»); the live region announces it;
 *   - `later`, at the walk's end: which chain and row decided, and the
 *     conclusion.
 * The slow-path assumption isn't feedback: the screen shows it under the
 * table (walkText(walk).assumptions), and «Текстом» keeps it.
 * @returns {{ tone: 'ok'|'info', lead: string|null, now: string[], later: string[] } | null}
 */
export function feedbackOf(task, commitState, card, revealed) {
  const walk = commitState.result.evidence[card.id];
  if (!walk) return null;
  const finding = findingOf(commitState.result, card.id);
  const row = tableRows(task.policy).find(r => r.id === decidingId(walk));
  const where = row.end ? ui.decidedEnd(row.chain) : ui.decidedRow(row.chain, row.n);
  const later = [`${where} ${walkText(walk).conclusion}`];
  if (revealed) return { tone: 'info', lead: uk.revealed, now: [], later };
  if (!finding) return { tone: 'ok', lead: null, now: [], later };
  return { tone: 'info', lead: ui.wrong, now: [t(finding.code)], later };
}

/** A rule's conditions in words for «Текстом»: every field by its RouterOS
 * name (no shortened chips), values as RouterOS prints them. */
function conditionsText(rule) {
  const parts = Object.keys(fields).filter(field => rule.match[field]).map(field => {
    const predicate = rule.match[field];
    return `${ui.field[field]}: ${predicate.not ? '!' : ''}${valuesText(predicate)}`;
  });
  return parts.length ? parts.join(', ') : ui.text.anyPacket;
}

/** «Список правил» (fix round 1, S4): every row with its number, chain,
 * action, conditions and description, unmarked, the same for every card.
 * After commitment each line gets this packet's outcome appended. */
export function ruleListItems(task, outcomes = null) {
  const rules = new Map(task.policy.rules.map(r => [r.id, r]));
  return tableRows(task.policy).map((row, i) => {
    const line = row.end ? ui.chainEnd(row.chain) : ui.text.rule({
      n: row.n, chain: row.chain, action: row.action, conditions: conditionsText(rules.get(row.id)), disabled: row.disabled, description: row.description,
    });
    return outcomes ? ui.text.outcome(line, outcomes[i].text) : line;
  });
}

/** The network's givens in words: R1's ports, the hosts, the dst-NAT rule
 * (natRuleOf). FW-2 shows these alone until a check names a packet. */
export function networkSections(task, nat = null) {
  const { router, hosts } = task.topology;
  const label = { pc: ui.pc, 'web-server': ui.server, internet: ui.internet };
  return [
    { heading: ui.text.router, items: [
      ...router.interfaces.map(i => ui.text.port({ name: i.id, address: i.address, prefix: i.prefix, lists: listsOf(task.topology, i.id) })),
      ui.text.gateway(router.gateway),
    ] },
    { heading: ui.text.hosts, items: hosts.map(h => ui.text.host(label[h.role] ?? h.role, h.address)) },
    ...(nat ? [{ heading: ui.text.nat, items: [ui.text.natRule(nat)] }] : []),
  ];
}

/** The givens in words (S2): the network (networkSections), then the card. */
export function givenSections(task, card, nat = null) {
  const lines = cardLines(task, card);
  return [
    ...networkSections(task, nat),
    { heading: ui.text.packet, items: [
      `${lines.from.label}: ${lines.from.value}`,
      `${lines.to.label}: ${lines.to.value}`,
      lines.ports,
      `${lines.state.label}: ${lines.state.meaning ?? lines.state.value}`,
      `${lines.nat.label}: ${lines.nat.value}`,
    ] },
  ];
}

/** The network's dst-NAT rule for the server, a given: the port-forward the
 * variant's NAT cards carry (`cards`: the variant's whole inventory, from
 * the resolved record, not the round), so every card and seed shows the
 * same line. Null when no card supplies it. */
export function natRuleOf(topology, cards) {
  const server = topology.hosts.find(h => h.role === 'web-server');
  const nat = cards.find(c => c.facts.dstNat === true && c.facts.dstNatFrom && c.packet.dstIp === server?.address);
  return nat ? { address: nat.facts.dstNatFrom.address, port: nat.facts.dstNatFrom.port, to: nat.packet.dstIp, toPort: nat.packet.dstPort } : null;
}

/**
 * «Текстом» (S2): before commitment the givens and the rule list; after
 * it, also each rule's outcome, the door, the conclusion with its
 * assumptions (and the illustration note after an accept, S1), and the
 * student's choice.
 */
export function textSections(task, card, { nat = null, walk = null, selection = null, hook = null, rules = true } = {}) {
  const sections = givenSections(task, card, nat);
  // Level 1 (round 4): the chain only, no rule list; after the commit, the chain the filter took.
  if (!rules) return [...sections, ...(hook ? [{ heading: ui.text.door, items: [ui.hook[hook]] }] : [])];
  if (!walk) return [...sections, { heading: ui.text.rules, items: ruleListItems(task) }];
  const rows = tableRows(task.policy);
  const words = walkText(walk);
  const choice = selection ? `${ui.hook[selection.hook]} · ${rowName(rows.find(r => r.id === selection.decidedBy) ?? { end: true, chain: selection.hook })}` : null;
  return [
    ...sections,
    { heading: ui.text.rules, items: ruleListItems(task, walkOutcomes(task, card, walk)) },
    { heading: ui.text.door, items: [ui.hook[walk.hook]] },
    { heading: ui.text.conclusion, items: [words.conclusion, ...walkNotes(walk), ...(walk.verdict === 'accept' ? [ui.illustration] : [])] },
    ...(choice ? [{ heading: ui.text.choice, items: [choice] }] : []),
  ];
}
