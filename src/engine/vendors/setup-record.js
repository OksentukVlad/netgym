import { commandsFor, profile, profile2960, parse } from './cisco-cli.js';
import { routerosSetupProfile, routerosSetupCommands } from './routeros-setup.js';
import { capabilities, ciscoPrompts } from './setup-capabilities.js';

export const SETUP_PURPOSE_MAX = 48;

/** Shared field comparison for bank references and learner commands. */
export function matchesRequirement(value, wanted, field) {
  return wanted === 'any-secret' ? typeof value === 'string' && value.length > 0
    : Array.isArray(wanted) ? wanted.includes(value)
      : field === 'domain' && typeof value === 'string' && typeof wanted === 'string'
        ? value.toLowerCase() === wanted.toLowerCase() : value === wanted;
}

/** Bank linting, including an independent graph and reference-order proof. */
export function validateSetupRecord(record) {
  const errors = [];
  const add = detail => errors.push({ code: 'invalid-record', detail });
  if (!record || !Array.isArray(record.cards) || !Array.isArray(record.rules) || !Array.isArray(record.referenceOrder)) return [{ code: 'invalid-record', detail: 'shape' }];
  if (typeof record.id !== 'string' || !record.id.length || !Number.isInteger(record.version) || record.version < 1) add('identity');
  const ids = record.cards.map(c => c?.id), known = new Set(ids);
  const count = record.profile?.id === profile2960.id ? 5 : record.profile?.id === routerosSetupProfile.id ? 13 : 12;
  if (ids.length !== count || known.size !== ids.length || ids.some(id => typeof id !== 'string')) add('ids');
  const profiles = [profile, profile2960, routerosSetupProfile];
  if (!profiles.some(p => JSON.stringify(record.profile) === JSON.stringify(p))) add('profile');
  const caps = capabilities(record);
  const routeros = record.profile?.id === routerosSetupProfile.id;
  if ((record.typed !== undefined && typeof record.typed !== 'boolean')
    || (record.prompts !== undefined && (!Array.isArray(record.prompts) || record.prompts.some(p => !ciscoPrompts.includes(p)) || new Set(record.prompts).size !== record.prompts.length))
    || (routeros && (caps.typed || caps.prompts.length))
    || (!routeros && caps.prompts.length === 0)
    || [record.hintCodes, record.tipCodes].some(codes => codes !== undefined && (!Array.isArray(codes) || codes.some(code => typeof code !== 'string')))) add('capabilities');
  for (const card of record.cards) {
    if (!card || typeof card !== 'object') { add('card'); continue; }
    if (typeof card.purpose !== 'string' || !card.purpose.trim() || [...card.purpose].length > SETUP_PURPOSE_MAX) add('purpose');
    if (routeros) {
      if (card.id === 'checkpoint') {
        if (card.kind !== 'checkpoint' || card.description !== 'checkpoint-login' || card.template !== undefined || card.mode !== undefined || card.commandId !== undefined
          || card.secondary !== 'Winbox → New Window → Connect To: LAN → Login') add('card');
        continue;
      }
      const expected = routerosSetupCommands[card.id];
      if (!expected || card.template !== expected[0] || card.secondary !== expected[1] || card.mode !== undefined || card.commandId !== undefined) add('card');
      continue;
    }
    const commandId = card.commandId ?? card.id;
    const grammar = commandsFor(record.profile ?? {}).find(c => c.id === commandId && !c.competitor && !c.unsafe);
    if (!grammar || !grammar.modes.includes(card.mode) || !caps.prompts.includes(card.mode) || typeof card.template !== 'string' || !card.requires || typeof card.requires !== 'object' || Array.isArray(card.requires)) { add('card'); continue; }
    const sample = { hostname: 'R1', domain: 'lab.example', username: 'operator', ip: '192.168.10.1', gateway: '192.168.10.2', mask: '255.255.255.0', modulus: 2048 };
    const reference = parse(card.template.replace(/\{(\w+)\}/g, (_, key) => sample[key]), { mode: card.mode, profile: record.profile });
    if (!reference.ok || reference.id !== commandId) { add('reference-command'); continue; }
    for (const [field, requirement] of Object.entries(card.requires)) {
      const wanted = typeof requirement === 'string' && requirement.startsWith('$') ? sample[requirement.slice(1)] : requirement;
      const actual = reference.values[field];
      if (!matchesRequirement(actual, wanted, field)) add('reference-value');
    }
  }
  const edges = Object.fromEntries(ids.map(id => [id, []]));
  for (const rule of record.rules) {
    if (!rule || typeof rule !== 'object') { add('rule'); continue; }
    if (!['before', 'last', 'together'].includes(rule.kind) || !known.has(rule.a) || (rule.kind !== 'last' && !known.has(rule.b)) || typeof rule.why !== 'string') { add('rule'); continue; }
    if (rule.kind === 'before') edges[rule.a].push(rule.b);
    if (rule.kind === 'last') for (const id of ids) if (id !== rule.a) edges[id].push(rule.a);
  }
  if (routeros) {
    if (!known.has('checkpoint')) add('checkpoint');
    for (const [a, b] of [['user', 'checkpoint'], ['address', 'checkpoint'], ['bridge-port', 'checkpoint'], ['checkpoint', 'admin-off']]) {
      if (!record.rules.some(r => r?.kind === 'before' && r.a === a && r.b === b)) add('checkpoint-rule');
    }
  }
  const active = new Set(), done = new Set();
  function visit(id) {
    if (active.has(id)) return false;
    if (done.has(id)) return true;
    active.add(id);
    if (!edges[id].every(visit)) return false;
    active.delete(id); done.add(id); return true;
  }
  if (!ids.every(visit)) add('cycle');
  const order = record.referenceOrder;
  if (order.length !== ids.length || new Set(order).size !== ids.length || order.some(id => !known.has(id))) add('reference-ids');
  for (const rule of record.rules) {
    if (!rule || typeof rule !== 'object') continue;
    if ((rule.kind === 'before' && order.indexOf(rule.a) >= order.indexOf(rule.b)) || (rule.kind === 'last' && order.at(-1) !== rule.a)) add('reference-rule');
  }
  return errors;
}
