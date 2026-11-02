import { makeRng } from '../../../engine/rng.js';
import { prefixToMask } from '../../../engine/ip.js';
import { addressExampleAllowed } from '../../../engine/vendors/address.js';
import { clone, validRecord, validSeed, capabilities } from './model.js';
import { orderFinding, check } from './rules.js';
import { hints } from './hints.js';
import { solution } from './solution.js';
import { codes } from './codes.js';
export { check, hints, solution, codes };
export { initialAnswer } from './model.js';
export { render, acceptedScript, recallRows, scriptForState } from './render.js';
export const id = 'setup-drill', version = 3;

export function create(record, { seed = 0 } = {}) {
  if (!validRecord(record) || !validSeed(seed)) throw new RangeError('invalid-record');
  const legacy = record.profile.id === 'isr-ios15-console';
  const rng = makeRng(legacy ? seed : JSON.stringify([record.id, seed, 'setup-v1']));
  const prefix = rng.pick([24, 25, 26]);
  // Preserve DR-1's RNG draws, values and opaque ids exactly (C5).
  const values = legacy ? {
    hostname: `R${rng.int(1, 99)}`, domain: rng.pick(['lab.example', 'workshop.example', 'practice.example']),
    username: rng.pick(['operator', 'netadmin', 'maintainer']), interface: rng.pick(record.profile.interfaces),
    ip: `192.168.${rng.int(10, 240)}.1`, mask: prefixToMask(prefix), modulus: rng.pick([2048, 4096]),
  } : record.profile.id === 'c2960-ios15-k9-console' ? {
    hostname: `SW${rng.int(1, 99)}`, domain: rng.pick(['lab.example', 'workshop.example', 'practice.example']),
    username: rng.pick(['operator', 'netadmin', 'maintainer']), mgmt: rng.pick([10, 20, 99]),
    ip: `192.168.${rng.int(10, 240)}.2`, mask: prefixToMask(prefix), modulus: 2048,
  } : {
    username: rng.pick(['operator', 'netadmin', 'maintainer']),
    ip: `192.168.${rng.int(10, 240)}.1`, prefix,
  };
  if (record.profile.id === 'c2960-ios15-k9-console') {
    values.interface = `vlan ${values.mgmt}`;
    values.gateway = values.ip.replace(/\.2$/, '.1');
  }
  if (!addressExampleAllowed({ ip: values.ip, prefix })) throw new RangeError('invalid-record');
  const caps = capabilities(record);
  const task = clone({ profile: record.profile, title: record.title, label: record.label, profileText: record.profileText,
    prompts: caps.prompts, typed: caps.typed, hintCodes: caps.hints, tipCodes: caps.tips,
    scriptPurposes: record.scriptPurposes, cards: record.cards, rules: record.rules, referenceOrder: record.referenceOrder, values });
  const ids = task.cards.map(c => c.id);
  let order;
  for (let attempt = 0; attempt < 128; attempt++) {
    const candidate = rng.shuffle(ids);
    if (orderFinding(task, candidate)) { order = candidate; break; }
  }
  if (!order) { order = [...record.referenceOrder]; [order[0], order[order.length - 1]] = [order.at(-1), order[0]]; }
  // Recall has its own stream: changing practice selection must not perturb the board.
  const recallRng = makeRng(JSON.stringify([record.id, seed, 'recall-v3']));
  const pool = ['domain', 'ssh-version', 'username', 'password-encryption', 'transport-ssh', 'login-local', 'ip-address'];
  const typedIds = !caps.typed ? [] : legacy ? ['crypto', ...recallRng.shuffle(pool).slice(0, 2)]
    : ['recall:svi-enter', 'svi-address', 'default-gateway'];
  const identity = { formatVersion: 1, exerciseId: id, taskId: record.id, recordVersion: record.version, seed, generatorVersion: version };
  // Separate stream preserves exercise randomness. Assignment is shuffled so
  // ids carry neither command identity nor reference position. No mnemonic id
  // belongs in a rendered id/data attribute; commandId is internal logic data.
  const opaqueRng = makeRng(JSON.stringify(legacy ? [seed, 'card-ids-v2'] : [record.id, seed, 'card-ids-v2']));
  const opaqueIds = new Set();
  while (opaqueIds.size < ids.length) opaqueIds.add(`c-${opaqueRng.int(0, 0xffffffff).toString(16).padStart(8, '0')}`);
  const shuffledIds = opaqueRng.shuffle([...opaqueIds]);
  const opaque = Object.fromEntries(ids.map((id, index) => [id, shuffledIds[index]]));
  task.cards = task.cards.map(card => ({ ...card, commandId: card.commandId ?? card.id, id: opaque[card.id] }));
  task.rules = task.rules.map(rule => ({ ...rule, a: opaque[rule.a], ...(rule.b ? { b: opaque[rule.b] } : {}) }));
  task.referenceOrder = task.referenceOrder.map(id => opaque[id]);
  const recallLines = typedIds.map(id => id === 'recall:svi-enter'
    ? { id, commandId: 'interface', mode: '(config)#', template: 'interface vlan {mgmt}', requires: { interface: `Vlan${values.mgmt}` }, description: 'typed.svi-enter' }
    : { ...task.cards.find(c => c.id === opaque[id]) });
  return { ...task, identity, instanceKey: JSON.stringify(identity), order: order.map(id => opaque[id]), recallLines, typedIds: recallLines.map(line => line.id) };
}
export default { id, version, create, check, hints, solution, codes };
