import { labels, examples as words } from '../uk.js';
import { check as checkServer, nativeLines, referenceAnswer, wizardFields } from './server.js';
import { checkCard, checkL2Command, natConfig, replay } from './nat.js';

/** R4 categorical exception: this description card is never a learner card.
 * Numeric examples below use only the two reserved documentation /24s. */
export function sidesExample() {
  const card = {
    id: 'example-lan-description', side: 'LAN', purpose: words.sidesPurpose,
    native: { cisco: 'description LAN', mikrotik: '/interface bridge set bridge-example comment=LAN' }, why: words.sidesWhy,
  };
  return {
    context: words.sidesContext, columns: [words.columns.purpose, words.columns.side],
    rows: [[card.purpose, labels.lan]], note: words.sidesWhy,
    task: card, answer: 'LAN',
  };
}

export function serverExample({ level = 1, vendor = 'cisco' } = {}) {
  const high = level === 2, prefix = level === 1 ? 24 : 26;
  const task = {
    id: 'example-dhcp-server', level, vendor: vendor === 'routeros' ? 'mikrotik' : vendor,
    network: high ? '192.0.2.64' : '192.0.2.0', prefix,
    router: high ? '192.0.2.66' : level === 1 ? '192.0.2.1' : '192.0.2.3',
    statics: [{ id: 'printer', name: labels.devices[0], genitive: labels.deviceGenitives[0], address: high ? '192.0.2.96' : level === 1 ? '192.0.2.250' : '192.0.2.32' }],
    clients: 12, providerDns: ['198.51.100.53', '198.51.100.54'], routerForwardsDns: false,
    interface: 'bridge1', lease: '10m',
  };
  const answer = referenceAnswer(task), result = checkServer(task, answer), commands = nativeLines(task, answer);
  return {
    context: words.serverContext(task.network, prefix, task.router),
    columns: [task.level === 3 && task.vendor === 'cisco' ? words.columns.exclusions : words.columns.range, words.columns.gateway, words.columns.dns],
    rows: [[(answer.exclusions ?? result.ranges).map(r => r.from === r.to ? r.from : `${r.from}–${r.to}`).join(', '), answer.gateway, answer.dns.join(', ')]],
    note: task.level === 3 && task.vendor === 'cisco' ? words.exclusionNote : words.serverNote,
    commands, fields: task.vendor === 'mikrotik' && level === 3 ? wizardFields(task) : [], task, answer,
  };
}

const exampleTopology = () => ({
  network: '192.0.2.0', prefix: 24, pc: '192.0.2.10', router: '192.0.2.1', server: '192.0.2.20',
  wan: '198.51.100.2', wanPrefix: 30, ispGateway: '198.51.100.1', website: '198.51.100.80', providerDns: ['198.51.100.53', '198.51.100.54'],
  ports: { cisco: { lan: 'g0/1', wan: 'g0/0' }, mikrotik: { lan: 'bridge', wan: 'ether1' } },
});

export function natExample({ level = 1, vendor = 'cisco' } = {}) {
  const t = exampleTopology(), cisco = vendor === 'cisco', config = natConfig(t, vendor);
  const ports = t.ports[cisco ? 'cisco' : 'mikrotik'];
  const packet = { protocol: 'tcp', src: { address: t.pc, port: 51000 }, dst: { address: t.website, port: 443 }, ingress: ports.lan, egress: ports.wan };
  if (level === 2) {
    // Include source selection even on MikroTik, so the complete numeric
    // example rule cannot solve a generated learner network.
    const command = cisco ? 'access-list 1 permit 192.0.2.0 0.0.0.255'
      : '/ip firewall nat add chain=srcnat action=masquerade src-address=192.0.2.0/24 out-interface-list=WAN';
    const task = { vendor: cisco ? 'cisco' : 'mikrotik', topology: t, networks: config.insideNetworks, config, packets: [packet] };
    return {
      context: words.natContext(t.pc, t.wan), columns: [words.columns.command],
      rows: [[command]], note: words.natRuleNote,
      given: cisco ? 'interface g0/1\nip nat inside\ninterface g0/0\nip nat outside\nip nat inside source list 1 interface g0/0 overload' : '',
      task, answer: command,
    };
  }
  const task = {
    id: 'website', topology: t, config, packet,
    choices: [{ id: 'wan', value: t.wan }], replyChoices: [{ id: 'pc', value: t.pc }],
  };
  const walk = replay(task);
  return {
    context: words.natContext(t.pc, t.wan), columns: [words.columns.inside, words.columns.outside],
    rows: [[`${t.pc}:51000`, `${t.wan}:51000`]], note: words.natNote,
    replay: walk, task, answer: { source: t.wan, reply: t.pc },
  };
}

// Examples deliberately use the production checkers; no parallel answer key.
export function checkNatExample(example) {
  return typeof example.answer === 'string'
    ? checkL2Command(example.task, example.answer)
    : { ok: checkCard(example.task, example.answer.source).ok && checkCard(example.task, example.answer.reply, { step: 'reply' }).ok };
}
