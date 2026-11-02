import { createCommitFlow } from '../../../ui/commit.js';
import { makeRng } from '../../../engine/rng.js';
import { classify } from './classify.js';
import { evaluate } from './evaluate.js';
import { only, hooks, validateCard, validatePolicy, validateTopology } from './model.js';
export { codes } from './codes.js';
import { codes } from './codes.js';

export const id = 'fw-predict';
export const version = 1;
export const generatorVersion = 4;
const clone = value => JSON.parse(JSON.stringify(value));
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const end = walk => walk.decidedBy === 'chain-end' ? `chain-end:${walk.hook}` : walk.decidedBy;
const walkFor = (task, card) => evaluate(task.policy, card, classify(task.topology, card));

const nonemptyString = value => typeof value === 'string' && value.length > 0;
const uniqueIds = values => Array.from(values).every(v => nonemptyString(v?.id))
  && new Set(values.map(v => v.id)).size === values.length;
const recordShape = record => only(record, ['id', 'version', 'variants'])
  && nonemptyString(record.id) && Number.isInteger(record.version) && record.version > 0
  && Array.isArray(record.variants) && record.variants.length > 0 && uniqueIds(record.variants);
const variantShape = variant => only(variant, ['id', 'title', 'text', 'topology', 'policy', 'cards', 'kind'])
  && nonemptyString(variant.id) && typeof variant.title === 'string' && typeof variant.text === 'string'
  && [undefined, 'chain'].includes(variant.kind)
  && Array.isArray(variant.cards) && variant.cards.length > 0 && uniqueIds(variant.cards);

function supportedVariant(variant) {
  if (!variantShape(variant) || validateTopology(variant.topology).length
    || validatePolicy(variant.policy, variant.topology).length) return false;
  if (variant.cards.some(card => validateCard(card, variant.topology).length)) return false;
  try {
    return variant.cards.every(card => walkFor(variant, card).verdict !== 'unknown')
      && (variant.kind !== 'chain' || validChainCards(variant));
  } catch { return false; }
}

/** The bank's canonical order is a router packet, an allowed request and its
 * exact transport reply. Validate before shuffling presentation order. */
function validChainCards(variant) {
  if (variant.cards.length !== 3 || variant.policy.id !== 'home-basic' || variant.policy.rules.length !== 9) return false;
  const [local, request, reply] = variant.cards, a = request.packet, b = reply.packet;
  return classify(variant.topology, local).hook === 'input'
    && local.facts.dstNat === false
    && [request, reply].every(c => classify(variant.topology, c).hook === 'forward')
    && request.facts.state === 'new' && reply.facts.state === 'established'
    && [request, reply].every(c => c.facts.dstNat === false && walkFor(variant, c).verdict === 'accept')
    && ['tcp', 'udp'].includes(a.protocol) && a.protocol === b.protocol
    && a.srcIp === b.dstIp && a.dstIp === b.srcIp
    && Number.isInteger(a.srcPort) && Number.isInteger(a.dstPort)
    && a.srcPort === b.dstPort && a.dstPort === b.srcPort
    && request.facts.ingress !== reply.facts.ingress;
}
const chainOnly = task => task?.identity?.level === 1;

/** Resolved, serialisable records only. No bank lookup is hidden inside logic.
 * Card.safety is input-only sampling metadata, not an answer annotation.
 */
export function validateRecord(record) {
  const bad = () => [{ code: 'invalid-record' }];
  if (!recordShape(record) || !record.variants.every(supportedVariant)) return bad();
  return [];
}

/** Seeded rejection sampling: each retry reshuffles the whole inventory.
 * The bound also rejects impossible rounds without an unbounded search.
 */
export function create(record, { variantId, seed = 0, level = 2 } = {}) {
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed)) || validateRecord(record).length) throw new RangeError('invalid-record');
  if (![1, 2].includes(level)) throw new RangeError('invalid-record');
  const eligible = record.variants.filter(v => (v.kind === 'chain') === (level === 1));
  const v = eligible.find(v => v.id === (variantId ?? eligible[0]?.id));
  if (!v) throw new RangeError('invalid-record');
  const rng = makeRng(seed);
  const walks = new Map(v.cards.map(c => [c.id, evaluate(v.policy, c, classify(v.topology, c))]));
  const size = Math.min(6, v.cards.length);
  const suitable = cards => hooks.every(h => cards.some(c => walks.get(c.id).hook === h))
    && cards.some(c => walks.get(c.id).decidedBy === 'chain-end') && cards.filter(c => c.safety).length >= 2;
  let selected;
  for (let attempt = 0; level === 2 && attempt < 1024; attempt++) {
    const candidate = rng.shuffle(v.cards).slice(0, size);
    if (suitable(candidate)) { selected = candidate; break; }
  }
  if (level === 1) {
    const [local, request, reply] = v.cards;
    // Pick uniformly among the three orders with the reply after its request.
    // This consumes no RNG draws in level 2: its sampling stays unchanged.
    selected = rng.pick([[local, request, reply], [request, reply, local], [request, local, reply]]);
  }
  if (!selected) throw new RangeError('invalid-record');
  const identity = { formatVersion: 1, exerciseId: id, taskId: record.id, recordVersion: record.version, variantId: v.id, level, seed, generatorVersion };
  return clone({
    identity, instanceKey: JSON.stringify(identity), title: v.title, text: v.text,
    topology: v.topology, policy: v.policy,
    cards: selected.map(({ safety, ...card }) => card),
  });
}

function selectionCode(task, selection) {
  if (chainOnly(task)) return only(selection, ['hook']) && hooks.includes(selection.hook) ? null : 'invalid-selection';
  if (!only(selection, ['hook', 'decidedBy']) || !hooks.includes(selection.hook) || typeof selection.decidedBy !== 'string'
    || ![...task.policy.rules.map(r => r.id), ...hooks.map(h => `chain-end:${h}`)].includes(selection.decidedBy)) return 'invalid-selection';
  return null;
}

/** Valid answer keys are commitments. Omitted or invalid selections have no
 * evidence. The screen uses commit() to enforce one attempt per card.
 */
export function check(task, answer = {}) {
  const findings = [], evidence = {};
  const submitted = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
  const add = (entity, code) => findings.push({ code, severity: 'blocks', entity });
  if (submitted !== answer) add(task.identity.taskId, 'invalid-selection');
  for (const key of Object.keys(submitted)) if (!task.cards.some(c => c.id === key)) add(key, 'invalid-selection');
  for (const card of task.cards) {
    if (!has(submitted, card.id)) continue;
    const selection = submitted[card.id];
    const invalid = selectionCode(task, selection);
    if (invalid) { add(card.id, invalid); continue; }
    if (chainOnly(task)) {
      const { hook } = classify(task.topology, card);
      evidence[card.id] = { hook };
      if (selection.hook !== hook) add(card.id, 'wrong-door');
      continue;
    }
    const walk = walkFor(task, card);
    evidence[card.id] = walk;
    const rule = task.policy.rules.find(r => r.id === selection.decidedBy);
    let code;
    if (!code && selection.hook !== walk.hook) code = 'wrong-door';
    if (!code && rule && !rule.enabled) code = 'rule-disabled';
    if (!code && ((rule && rule.chain !== walk.hook) || (!rule && selection.decidedBy !== `chain-end:${walk.hook}`))) code = 'rule-other-chain';
    // Round 4 repair (Fable 4): «FastTrack only marks» is said only when the
    // walk shows that rule matched (marked); a FastTrack rule that didn't
    // match is an ordinary wrong choice.
    if (!code && rule?.action === 'fasttrack-connection' && walk.steps.some(s => s.ruleId === rule.id && s.outcome === 'marked')) code = 'fasttrack-not-final';
    if (!code && selection.decidedBy !== end(walk)) code = (rule?.action ?? 'accept') === walk.verdict ? 'right-verdict-wrong-rule' : 'wrong-verdict';
    if (code) add(card.id, code);
  }
  const ok = findings.length === 0, complete = task.cards.every(c => has(evidence, c.id));
  return { ok, complete, code: findings[0]?.code ?? 'ok', findings, evidence };
}

/** Givens for PacketCard. `owner` is for explicit assistance or checked feedback
 * only: never render it (including hidden DOM) before either event. Names come
 * from topology roles; no display or answer metadata is stored on cards. */
export function levelFields(level) {
  if (![1, 2].includes(level)) throw new RangeError('invalid-record');
  return level === 1 ? ['from', 'to'] : ['from', 'to', 'ports', 'state', 'nat'];
}

const deviceNames = { pc: 'ПК', 'web-server': 'сервер', internet: 'інтернет' };
function addressOwner(topology, ip) {
  if (topology.router.interfaces.some(i => i.address === ip)) {
    return { kind: 'router', name: 'R1', labelId: 'fw-label-router-addresses' };
  }
  const host = topology.hosts.find(h => h.address === ip);
  if (!host || !deviceNames[host.role]) throw new RangeError('unsupported-packet');
  return { kind: host.role === 'internet' ? 'internet' : 'host', name: deviceNames[host.role], labelId: `fw-label-${host.id}-address` };
}

function isReplyTo(reply, request) {
  const a = request.packet, b = reply.packet;
  return reply.facts.state === 'established' && request.facts.state === 'new'
    && ['tcp', 'udp'].includes(a.protocol) && a.protocol === b.protocol
    && a.srcIp === b.dstIp && a.dstIp === b.srcIp
    && a.srcPort === b.dstPort && a.dstPort === b.srcPort;
}

export function cardView(task, cardId, level = task.identity.level ?? 2) {
  const card = task.cards.find(c => c.id === cardId);
  if (!card) throw new RangeError('invalid-selection');
  const source = addressOwner(task.topology, card.packet.srcIp);
  return {
    from: { ip: card.packet.srcIp, device: source.name },
    to: { ip: card.packet.dstIp }, // Packet addresses are already post-dst-NAT.
    owner: addressOwner(task.topology, card.packet.dstIp),
    requestOf: task.cards.find(request => request.id !== card.id && isReplyTo(card, request))?.id ?? null,
    fields: levelFields(level),
  };
}

export function hints(task, answer, { cardId } = {}) {
  const card = task.cards.find(c => c.id === cardId) ?? task.cards[0];
  const routerAddresses = task.topology.router.interfaces.map(i => i.address).join(' · ');
  if (chainOnly(task)) {
    const params = {
      to: card.packet.dstIp, routerAddresses,
      routerIp: task.cards.find(c => classify(task.topology, c).hook === 'input').packet.dstIp,
      otherIp: task.cards.find(c => classify(task.topology, c).hook === 'forward').packet.dstIp,
    };
    return ['hint-chain-look', 'hint-chain-move', 'hint-chain-example'].map((code, i) => ({ code, params: { ...params }, rung: i + 1 }));
  }
  return ['hint-door', 'hint-order', 'hint-example'].map((code, i) => ({ code, params: i === 0 && cardId ? {
    to: card.packet.dstIp, routerAddresses, dstNat: card.facts.dstNat === true,
    ...(card.facts.dstNatFrom ? { natFrom: card.facts.dstNatFrom.address } : {}),
  } : {}, rung: i + 1 }));
}

/** Explicit reveal path only. Walks belong to check evidence, not this answer. */
export function solution(task) {
  return Object.fromEntries(task.cards.map(card => { const walk = walkFor(task, card); return [card.id, { hook: walk.hook, ...(chainOnly(task) ? {} : { decidedBy: end(walk) }) }]; }));
}

/** Level 2 hook retry: this is assistance, never a commitment or rule walk.
 * The screen persists the submitted hook in its draft and dispatches assist
 * when assisted is true. A successful result unlocks the rule choice only. */
export function checkHook(task, cardId, selection) {
  const card = task.cards.find(c => c.id === cardId);
  if (chainOnly(task) || !card || !only(selection, ['hook']) || !hooks.includes(selection.hook)) {
    return { ok: false, code: 'invalid-selection', assisted: false, params: {} };
  }
  const hook = classify(task.topology, card).hook;
  const ok = selection.hook === hook;
  return { ok, code: ok ? 'hook-ok' : `hook-retry-${hook}`, assisted: !ok, params: {} };
}

// Shared commitment lifecycle, with this exercise's selection validation.
export const { initialCommitState, commit } = createCommitFlow({
  check, validate: selectionCode, items: task => task.cards,
});

export default { id, version, generatorVersion, codes, create, check, hints, solution, checkHook, cardView, levelFields };
