import { makeRng } from '../../../engine/rng.js';
import { createScenario, clientState } from './probes.js';
import { proofs as words, examples } from '../uk.js';

export const id = 'checks-proof';
export const version = 2;
export const generatorVersion = 1;
export const requirementIds = Object.freeze(['address', 'remote', 'ssh', 'http', 'telnet', 'login']);
/** What a setup deck configures (the `access` scope): no DHCP, internet or website. */
export const accessRequirementIds = Object.freeze(['ssh', 'telnet', 'login']);
/** The setup decks' new account names (setup/logic/deck.js) other than the
 * SSH requirement's netadmin; the account being retired is the default admin. */
const newAccounts = Object.freeze(['operator', 'maintainer']);
const oldAccount = 'admin';

/** Each option carries both the check/place and its expected outcome.
 * No live network is contacted. Choosing a check without the successful
 * outcome is intentionally insufficient. Requirements are independent. */
export function createProof(seed = 0, { vendor = 'cisco', requirementId, example = false, otherAddresses = false, scope = null } = {}) {
  requirementId ??= makeRng(`checks:proof:${seed}`).pick(requirementIds);
  // Each requirement shuffles with its own stream: one stream for the whole
  // round put the right option at the same position on every card.
  const rng = makeRng(`checks:proof:${seed}:${requirementId}`);
  if (!requirementIds.includes(requirementId)) throw new RangeError('invalid-checks-requirement');
  const s = createScenario(seed, { level: 2, vendor, faultId: 'healthy', example, otherAddresses });
  const ros = s.vendor !== 'cisco', gateway = s.topology.router;
  const remote = s.remoteIp, binding = ros ? '/ip dhcp-server lease print' : 'show ip dhcp binding';
  // One place, one command, one short result per option; every requirement
  // has a distractor with the same command and a wrong result, so the result
  // has to be read (Fable 4). Local commands run «на ПК», probes «з ПК».
  const account = rng.pick(newAccounts);
  const option = (id, place, command, expected, evidence = []) => ({ id, place, command, expected,
    label: `${words.where[scope === 'access' && place === 'router' ? 'device' : place](command)} → ${expected}`, evidence });
  const vty = ros ? null : 'show run | section vty';
  const options = {
    address: [option('address', 'pc', 'ipconfig /all', words.address(gateway), [
      { place: 'pc', command: 'ipconfig /all', expected: { address: clientState(s).address, prefix: s.topology.prefix, dhcpServer: gateway, dhcpEnabled: true } },
    ]), option('apipa', 'pc', 'ipconfig /all', words.apipa), option('binding-only', 'router', binding, words.binding)],
    remote: [option('reply', 'probe', `ping ${remote}`, words.reply), option('unreachable', 'probe', `ping ${remote}`, words.unreachable),
      option('router-reply', 'router', `ping ${remote}`, words.reply), option('gateway-reply', 'probe', `ping ${gateway}`, words.reply)],
    ssh: [option('login', 'probe', `ssh netadmin@${gateway}`, words.login), option('key', 'probe', `ssh netadmin@${gateway}`, words.key),
      option('echo', 'probe', `ping ${gateway}`, words.reply)],
    http: [option('page', 'probe', `curl -i http://${s.websiteName}/`, words.page), option('http-error', 'probe', `curl -i http://${s.websiteName}/`, words.httpError),
      option('echo', 'probe', `ping ${s.topology.website}`, words.reply), option('dns', 'probe', `nslookup ${s.websiteName}`, `Address: ${s.topology.website}`)],
    telnet: ros
      ? [option('configuration', 'router', '/ip service print; /tool mac-server print', words.telnetRos,
        [{ command: '/ip service print', expected: 'telnet disabled=yes' }, { command: '/tool mac-server print', expected: 'allowed-interface-list=none' }]),
      option('mac-on', 'router', '/ip service print; /tool mac-server print', words.telnetMacOn),
      option('ip-only', 'router', '/ip service print', words.telnetIpOnly), option('failed', 'probe', `telnet ${gateway}`, words.denied)]
      : [option('configuration', 'router', vty, words.telnetCisco, [{ command: vty, expected: 'transport input ssh', scope: 'all-vty-ranges' }]),
        option('telnet-ssh', 'router', vty, words.telnetBoth), option('failed', 'probe', `telnet ${gateway}`, words.denied)],
    login: [option('fresh-login', 'fresh', `ssh ${account}@${gateway}`, words.login), option('denied', 'fresh', `ssh ${account}@${gateway}`, words.accessDenied),
      option('old-session', 'old', `ssh ${oldAccount}@${gateway}`, words.existing(oldAccount))],
  }[requirementId];
  const correctOptionId = options[0].id;
  const correctOptionIds = requirementId === 'address' ? ['address', 'binding-only'] : [correctOptionId];
  for (const o of options) o.reason = requirementId === 'telnet' && o.id === 'configuration' && !ros
    ? words.telnetCiscoNote : words.reasons[requirementId][o.id];
  if (example && requirementId === 'remote') options[0].reason = options[0].reason.replace('8.8.8.8', remote);
  const requirement = requirementId === 'remote' && example ? words.requirements.remote.replace('8.8.8.8', remote) : words.requirements[requirementId];
  return { id, version, generatorVersion, seed, vendor: s.vendor, requirementId, requirement,
    options: rng.shuffle(options), correctOptionId, correctOptionIds,
    explanation: options[0].reason };
}
export function checkProof(task, optionId) {
  const option = task.options.find(o => o.id === optionId);
  return { ok: Boolean(option && task.correctOptionIds.includes(optionId)), code: 'proof', text: option?.reason ?? words.feedback };
}
export function proofSet(seed = 0, options = {}) { return (options.scope === 'access' ? accessRequirementIds : requirementIds).map(requirementId => createProof(seed, { ...options, requirementId })); }
export function proofExample({ vendor = 'cisco' } = {}) {
  const task = createProof('example', { vendor, requirementId: 'ssh', example: true });
  return { context: examples.proofContext, task, answer: task.correctOptionId, result: checkProof(task, task.correctOptionId) };
}
