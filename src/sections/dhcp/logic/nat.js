import { blockSize, contains, fromInt, network, parseIp, parsePrefix, prefixToMask, toInt } from '../../../engine/ip.js';
import { makeRng } from '../../../engine/rng.js';
import { actions, findings, labels, natNotes, verdicts } from '../uk.js';
import { createTopology } from './scenario.js';

export const id = 'dhcp-nat';
export const version = 1;
export const generatorVersion = 1;
const protocols = ['tcp', 'udp', 'icmp'];
const endpoint = e => e && parseIp(e.address) !== null && Number.isInteger(e.port) && e.port >= 0 && e.port <= 65535;
const packetValid = p => p && protocols.includes(p.protocol) && endpoint(p.src) && endpoint(p.dst)
  && typeof p.ingress === 'string' && typeof p.egress === 'string';
const subnetValid = n => n && parseIp(n.network) !== null && parsePrefix(n.prefix) !== null;
const aclValid = a => a && parseIp(a.network) !== null && parseIp(a.wildcard) !== null;
const sameEndpoint = (a, b) => a.address === b.address && a.port === b.port;
const copy = value => structuredClone(value);
const canonicalEndpoint = e => ({ address: parseIp(e.address), port: e.port });

/** IOS wildcard bits need not be contiguous (a mask-as-wildcard is legal but
 * selects a very different set). Compare only the bits the wildcard fixes. */
export function aclMatches(address, acl) {
  if (parseIp(address) === null || !aclValid(acl)) return false;
  const fixed = (~toInt(acl.wildcard)) >>> 0;
  return ((toInt(address) & fixed) >>> 0) === ((toInt(acl.network) & fixed) >>> 0);
}

function configValid(c) {
  return c && ['overload', 'masquerade'].includes(c.method)
    && Array.isArray(c.insideInterfaces) && Array.isArray(c.insideNetworks) && c.insideNetworks.length > 0
    && c.insideNetworks.every(subnetValid) && typeof c.outsideInterface === 'string'
    && parseIp(c.outsideAddress) !== null && c.match && typeof c.match === 'object'
    && (c.method !== 'overload' || (Array.isArray(c.match.acl) && c.match.acl.every(aclValid) && c.roles && typeof c.roles === 'object'))
    && (c.method !== 'masquerade' || (typeof c.match.outInterfaceList === 'string'
      && Array.isArray(c.interfaceLists?.[c.match.outInterfaceList]) && (!c.match.srcNetwork || subnetValid(c.match.srcNetwork))));
}

/** Bounded, collision-free source NAT. TCP/UDP ports and ICMP ids are retained;
 * this model deliberately has no port allocator and accepts no existing table.
 * Egress is supplied by routing, never inferred from the destination address.
 * The neutral packet shape is {protocol,src:{address,port},dst:{address,port},
 * ingress,egress}; a port represents the identifier for ICMP exercises. */
export function translate(packet, natConfig) {
  if (!packetValid(packet) || !configValid(natConfig)) return { translated: null, reason: 'no-match', errors: [{ code: !packetValid(packet) ? 'invalid-packet' : 'invalid-config' }] };
  const c = natConfig, p = { ...copy(packet), src: canonicalEndpoint(packet.src), dst: canonicalEndpoint(packet.dst) };
  if (p.egress !== c.outsideInterface || (c.method === 'overload' && c.roles[p.egress] !== 'outside')) return { translated: null, reason: 'not-outside' };
  if (!c.insideInterfaces.includes(p.ingress) || !c.insideNetworks.some(n => contains(n.network, n.prefix, p.src.address))
    || (c.method === 'overload' && c.roles[p.ingress] !== 'inside')) return { translated: null, reason: 'no-match' };
  const matches = c.method === 'overload'
    ? c.match.acl.some(acl => aclMatches(p.src.address, acl))
    : c.interfaceLists[c.match.outInterfaceList].includes(p.egress)
      && (!c.match.srcNetwork || contains(c.match.srcNetwork.network, c.match.srcNetwork.prefix, p.src.address));
  if (!matches) return { translated: null, reason: 'no-match' };
  const entry = {
    protocol: p.protocol, inside: { ...p.src }, outside: { address: parseIp(c.outsideAddress), port: p.src.port }, remote: { ...p.dst },
  };
  return { translated: { ...p, src: { ...entry.outside } }, entry };
}

/** A reply restores its destination only. All three tuple components must
 * match; malformed/missing entries are ignored. Inputs are never modified. */
export function reverse(reply, table) {
  if (!packetValid(reply) || !Array.isArray(table)) return null;
  const src = canonicalEndpoint(reply.src), dst = canonicalEndpoint(reply.dst);
  const entry = table.find(e => e && e.protocol === reply.protocol && endpoint(e.inside) && endpoint(e.outside)
    && endpoint(e.remote) && sameEndpoint(e.outside, dst) && sameEndpoint(e.remote, src));
  return entry ? { ...copy(reply), src: { ...reply.src }, dst: { ...entry.inside } } : null;
}

function parserError(code) { return { ok: false, errors: [{ code }] }; }

/** These are exercise parsers, not full IOS/RouterOS interpreters. They fail
 * closed on unsupported syntax and return data errors instead of throwing. */
export function parseCiscoAcl(input, baseConfig) {
  const lines = typeof input === 'string' ? input.trim().split(/\n+/) : input;
  if (!Array.isArray(lines) || !lines.length) return parserError('acl-syntax');
  const acl = [];
  for (const line of lines) {
    const match = typeof line === 'string' && /^access-list\s+1\s+permit\s+(\S+)\s+(\S+)\s*$/.exec(line.trim());
    if (!match || !aclValid({ network: match[1], wildcard: match[2] })) return parserError('acl-syntax');
    acl.push({ network: parseIp(match[1]), wildcard: parseIp(match[2]) });
  }
  if (!baseConfig || !configValid({ ...baseConfig, match: { acl } })) return parserError('invalid-config');
  return { ok: true, config: { ...copy(baseConfig), match: { acl } } };
}

export function parseCiscoInside(input, baseConfig) {
  const match = typeof input === 'string' && /^interface\s+(g0\/[01])\s*\nip nat inside\s*$/.exec(input.trim());
  if (!match || !baseConfig) return parserError('inside-syntax');
  const inside = match[1], outside = inside === 'g0/1' ? 'g0/0' : 'g0/1';
  const config = { ...copy(baseConfig), insideInterfaces: [inside], roles: { [inside]: 'inside', [outside]: 'outside' } };
  return configValid(config) ? { ok: true, config } : parserError('invalid-config');
}

export function parseMikrotikRule(input, baseConfig) {
  if (typeof input !== 'string' || !input.trim().startsWith('/ip firewall nat add ')) return parserError('rule-syntax');
  const tokens = input.trim().slice('/ip firewall nat add '.length).split(/\s+/), fields = {};
  for (const token of tokens) {
    const match = /^([a-z-]+)=([^=\s]+)$/.exec(token);
    if (!match || !['chain', 'action', 'out-interface-list', 'src-address'].includes(match[1]) || Object.hasOwn(fields, match[1])) return parserError('rule-syntax');
    fields[match[1]] = match[2];
  }
  if (fields.chain !== 'srcnat' || fields.action !== 'masquerade' || !fields['out-interface-list']) return parserError('unsupported-rule');
  const src = fields['src-address']?.split('/'), prefix = src && parsePrefix(src[1]);
  if (src && (src.length !== 2 || parseIp(src[0]) === null || prefix === null)) return parserError('source-syntax');
  const match = { outInterfaceList: fields['out-interface-list'], ...(src ? { srcNetwork: { network: network(src[0], prefix), prefix } } : {}) };
  const config = { ...copy(baseConfig ?? {}), method: 'masquerade', match };
  return configValid(config) ? { ok: true, config } : parserError('invalid-config');
}

export function natConfig(topology = createTopology(), vendor = 'cisco', networks = [{ network: topology.network, prefix: topology.prefix }]) {
  const cisco = vendor === 'cisco', ports = cisco ? topology.ports.cisco : topology.ports.mikrotik;
  return {
    insideInterfaces: [ports.lan], insideNetworks: copy(networks), outsideInterface: ports.wan, outsideAddress: topology.wan,
    method: cisco ? 'overload' : 'masquerade',
    roles: { [ports.lan]: 'inside', [ports.wan]: 'outside' },
    interfaceLists: { WAN: [ports.wan], LAN: [ports.lan] },
    match: cisco ? { acl: networks.map(n => ({ network: n.network, wildcard: fromInt(0xffffffff - toInt(prefixToMask(n.prefix))) })) } : { outInterfaceList: 'WAN' },
  };
}

export function nativeLines(topology = createTopology()) {
  return {
    cisco: [
      'interface g0/1', 'ip nat inside', 'interface g0/0', 'ip nat outside',
      `access-list 1 permit ${topology.network} ${fromInt(blockSize(topology.prefix) - 1)}`,
      'ip nat inside source list 1 interface g0/0 overload',
    ],
    mikrotik: ['/ip firewall nat add chain=srcnat action=masquerade out-interface-list=WAN'],
  };
}

const packetFor = (t, vendor, destination = t.website, egress) => {
  const ports = t.ports[vendor === 'cisco' ? 'cisco' : 'mikrotik'];
  return { protocol: 'tcp', src: { address: t.pc, port: 51000 }, dst: { address: destination, port: 443 }, ingress: ports.lan, egress: egress ?? ports.wan };
};

/** Website first; the server is visible only on its own card. Choice ids are
 * semantic and stable across seeds, while each value comes from this task. */
export function createRound(seed = 0, { vendor = 'cisco', otherAddresses = false } = {}) {
  const t = createTopology(seed, { otherAddresses }), rng = makeRng(`dhcp:nat:l1:${seed}`), ports = t.ports[vendor === 'cisco' ? 'cisco' : 'mikrotik'];
  return ['website', ...rng.shuffle(['server', 'router'])].map(cardId => {
    const target = cardId === 'website' ? labels.website : cardId === 'server' ? labels.lanServer : labels.routerTarget;
    const packet = packetFor(t, vendor, cardId === 'website' ? t.website : cardId === 'server' ? t.server : t.router,
      cardId === 'website' ? ports.wan : cardId === 'server' ? ports.lan : 'local');
    return {
      id: cardId, topology: { ...copy(t), showServer: cardId === 'server' }, vendor,
      task: `${cardId === 'website' ? natNotes.opens(t.website) : natNotes.contacts(cardId === 'server' ? labels.lanServer : labels.routerTarget, packet.dst.address)} ${natNotes.assumptions}`, question: actions.source(target),
      packet, config: natConfig(t, vendor), native: nativeLines(t),
      choices: rng.shuffle([
        { id: 'pc', value: t.pc, text: labels.pcAddress(t.pc) },
        { id: 'wan', value: t.wan, text: labels.wanAddress(t.wan) },
        { id: 'router', value: t.router, text: labels.lanAddress(t.router) },
      ]),
      replyChoices: cardId === 'website' ? [
        { id: 'pc', value: t.pc, text: labels.toPc(t.pc) },
        { id: 'router', value: t.router, text: labels.keepReply },
        { id: 'none', value: null, text: labels.noReply },
      ] : [],
    };
  });
}

export function checkCard(card, choiceId, { step = 'source' } = {}) {
  const forward = translate(card.packet, card.config), source = forward.translated?.src.address ?? card.packet.src.address;
  const choices = step === 'reply' ? card.replyChoices : card.choices;
  const chosen = choices.find(c => c.id === choiceId || c.value === choiceId)
    ?? (parseIp(choiceId) !== null ? { value: parseIp(choiceId) } : null);
  if (!chosen) return { ok: false, kind: 'info', code: 'invalid-choice', text: findings.invalidChoice };
  if (step === 'reply') {
    if (!forward.entry) return { ok: false, kind: 'info', code: 'no-reply-step' };
    const reply = replyPacket(forward.translated), restored = reverse(reply, [forward.entry]);
    return { ok: chosen.value === restored.dst.address, kind: 'verdict', text: verdicts.natReply(restored.dst.address), highlight: { kind: 'address', value: restored.dst.address } };
  }
  return {
    ok: chosen.value === source, kind: 'verdict',
    text: card.id === 'website' ? verdicts.natWebsite(source) : card.id === 'server' ? verdicts.natLan(source) : verdicts.natRouter(source),
    highlight: { kind: 'address', value: source },
  };
}

export function replyPacket(translated) {
  return { protocol: translated.protocol, src: { ...translated.dst }, dst: { ...translated.src }, ingress: translated.egress, egress: translated.ingress };
}
export function replay(card) {
  const forward = translate(card.packet, card.config);
  if (!forward.entry) return null;
  const p = card.packet, reply = replyPacket(forward.translated), restored = reverse(reply, [forward.entry]);
  const captions = natNotes.replay({ pc: p.src.address, wan: forward.entry.outside.address, remote: p.dst.address, port: p.src.port, remotePort: p.dst.port });
  const packets = [p, forward.translated, reply, restored];
  return {
    steps: captions.map((caption, i) => ({ caption, packet: copy(packets[i]), highlight: { kind: 'address', value: [p.src.address, forward.entry.outside.address, p.dst.address, p.src.address][i] } })),
    caption: natNotes.remembered(forward.entry.inside, forward.entry.outside), entry: copy(forward.entry),
  };
}

export function createL2(seed = 0, { vendor = 'cisco', otherAddresses = false, twoLans = false } = {}) {
  const t = createTopology(seed, { otherAddresses }), cisco = vendor === 'cisco', rng = makeRng(`dhcp:nat:l2:${seed}`);
  // The adjacent /24 remains in the same private pool, including its last /24.
  const other = fromInt((toInt(t.network) ^ 256) >>> 0);
  const networks = [{ network: t.network, prefix: 24 }, ...(twoLans ? [{ network: other, prefix: 24 }] : [])];
  const config = natConfig(t, vendor, networks);
  const packets = networks.map(n => packetFor({ ...t, pc: fromInt(toInt(n.network) + 10) }, vendor));
  const unrelated = fromInt((toInt(t.network) ^ 512) >>> 0);
  const acl = (nets, wildcard = '0.0.0.255') => nets.map(n => `access-list 1 permit ${n.network} ${wildcard}`).join('\n');
  const options = cisco ? [
    { id: 'exact', purpose: natNotes.purposes.exact, command: acl(networks) },
    { id: 'mask', purpose: natNotes.purposes.mask, command: acl(networks, '255.255.255.0') },
    { id: 'other', purpose: twoLans ? natNotes.purposes.first : natNotes.purposes.other, command: acl(twoLans ? [networks[0]] : [{ network: unrelated }]) },
  ] : [
    { id: 'wan', purpose: natNotes.purposes.wan, command: '/ip firewall nat add chain=srcnat action=masquerade out-interface-list=WAN' },
    { id: 'lan', purpose: natNotes.purposes.lan, command: '/ip firewall nat add chain=srcnat action=masquerade out-interface-list=LAN' },
    { id: 'source', purpose: natNotes.purposes.source, command: `/ip firewall nat add chain=srcnat action=masquerade src-address=${unrelated}/24 out-interface-list=WAN` },
  ];
  return {
    id: 'dhcp-nat-l2', vendor: cisco ? 'cisco' : 'mikrotik', seed, topology: t, networks, config, packets,
    task: natNotes.assumptions,
    given: cisco ? 'ip nat inside source list 1 interface g0/0 overload' : natNotes.wanMembership,
    question: cisco ? actions.acl : actions.masquerade, options: rng.shuffle(options),
    insideQuestion: cisco ? actions.inside : null,
    insideOptions: cisco ? [
      { id: 'lan', purpose: natNotes.purposes.insideLan, command: 'interface g0/1\nip nat inside' },
      { id: 'wan', purpose: natNotes.purposes.insideWan, command: 'interface g0/0\nip nat inside' },
    ] : [],
  };
}

/** Exact ACL-set equality: each permit must stay inside an intended LAN;
 * each LAN must be covered. ACL patterns in this exercise are /24s or the
 * noncontiguous mask distractor. Fixed-bit cube cardinality proves that a
 * broad pattern cannot sneak through just because the sample PCs match. */
export function aclExactlyMatches(acl, networks) {
  if (!Array.isArray(acl) || !acl.length || !acl.every(aclValid) || !networks.every(subnetValid)) return false;
  const cardinality = a => 2 ** toInt(a.wildcard).toString(2).replaceAll('0', '').length;
  // Exercise LANs are disjoint /24s, and permit rows must describe a complete
  // intended LAN. Broader, narrower and noncontiguous wildcards are rejected.
  return acl.every(a => networks.some(n => cardinality(a) === blockSize(n.prefix)
    && toInt(a.wildcard) === blockSize(n.prefix) - 1 && network(a.network, n.prefix) === n.network))
    && networks.every(n => acl.some(a => cardinality(a) === blockSize(n.prefix)
      && toInt(a.wildcard) === blockSize(n.prefix) - 1 && aclMatches(n.network, a)));
}

/** Every option goes through a vendor parser and translate; Cisco additionally
 * proves exact selection of the LANs, rather than merely covering sample PCs. */
export function checkL2(task, choiceId, { step = 'rule' } = {}) {
  const option = (step === 'inside' ? task.insideOptions : task.options).find(o => o.id === choiceId);
  if (!option) return { ok: false, kind: 'info', code: 'invalid-choice', text: findings.invalidChoice };
  return checkL2Command(task, option.command, { step, optionId: option.id });
}

// Also exposed for checker-based worked-example non-transfer tests. Screens
// normally pass the selected option id to checkL2, rather than command text.
export function checkL2Command(task, command, { step = 'rule', optionId } = {}) {
  const parsed = step === 'inside' ? parseCiscoInside(command, task.config)
    : task.vendor === 'cisco' ? parseCiscoAcl(command, task.config) : parseMikrotikRule(command, task.config);
  if (!parsed.ok) return { ...parsed, kind: 'info' };
  const outcomes = task.packets.map(p => translate(p, parsed.config));
  const ok = outcomes.every(o => o.translated !== null)
    && (task.vendor !== 'cisco' || step === 'inside' || aclExactlyMatches(parsed.config.match.acl, task.networks));
  return {
    ok, kind: 'verdict', outcomes,
    text: step === 'inside' ? verdicts.inside : task.vendor === 'cisco' ? ok ? verdicts.acl : verdicts.wrongAcl
      : ok ? verdicts.masquerade : optionId === 'lan' ? verdicts.wrongInterface : verdicts.wrongSource,
  };
}
