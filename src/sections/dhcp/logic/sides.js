import { prefixToMask } from '../../../engine/ip.js';
import { makeRng } from '../../../engine/rng.js';
import { findings, sideCards, verdicts } from '../uk.js';
import { createTopology } from './scenario.js';

export const id = 'dhcp-sides';
export const version = 1;

export function cardBank(topology = createTopology()) {
  const t = topology, mask = prefixToMask(t.prefix), base = t.network.slice(0, t.network.lastIndexOf('.') + 1);
  const native = {
    'wan-client': { cisco: 'ip address dhcp', mikrotik: '/ip dhcp-client add interface=ether1 disabled=no' },
    'wan-route': { cisco: sideCards['wan-route'].cisco, mikrotik: sideCards['wan-route'].mikrotik },
    'wan-dns': { cisco: `ip name-server ${t.providerDns[0]}`, mikrotik: `/ip dns set servers=${t.providerDns[0]}` },
    'lan-address': { cisco: `interface g0/1\nip address ${t.router} ${mask}`, mikrotik: `/ip address add address=${t.router}/${t.prefix} interface=bridge` },
    'lan-server': { cisco: 'ip dhcp pool LAN', mikrotik: '/ip dhcp-server add interface=bridge address-pool=LAN disabled=no' },
    'lan-range': { cisco: `ip dhcp excluded-address ${base}1 ${base}99\nip dhcp excluded-address ${base}200 ${base}254\nip dhcp pool LAN\nnetwork ${t.network} ${mask}`, mikrotik: `/ip pool add name=LAN ranges=${base}100-${base}199` },
    'lan-gateway': { cisco: `default-router ${t.router}`, mikrotik: `gateway=${t.router}` },
    'lan-dns': { cisco: `dns-server ${t.providerDns[0]}`, mikrotik: `dns-server=${t.providerDns[0]}` },
  };
  return Object.entries(sideCards).map(([cardId, words]) => ({
    id: cardId, side: cardId.startsWith('wan-') ? 'WAN' : 'LAN',
    purpose: typeof words.purpose === 'function' ? words.purpose(t.providerDns[0]) : words.purpose,
    ...(words.detail ? { detail: words.detail(t.providerDns[0]) } : {}),
    native: native[cardId], why: words.why,
  }));
}

// Fresh cards on every call; neither shuffling nor checking mutates the bank.
export const cards = Object.freeze(cardBank().map(card => Object.freeze({ ...card, native: Object.freeze(card.native) })));

export function createRound(seed = 0, options = {}) {
  const bank = cardBank(createTopology(seed, options)), rng = makeRng(`dhcp:sides:${seed}`);
  const required = bank.filter(c => c.side === 'WAN' || c.id === 'lan-dns');
  return rng.shuffle([...required, ...rng.shuffle(bank.filter(c => c.side === 'LAN' && c.id !== 'lan-dns')).slice(0, 2)]);
}

export function check(card, side) {
  if (!card || !['WAN', 'LAN'].includes(card.side) || !['WAN', 'LAN'].includes(side)) {
    return { ok: false, kind: 'info', code: 'invalid-choice', text: findings.invalidChoice };
  }
  return {
    ok: card.side === side, kind: 'verdict', side: card.side, why: card.why,
    text: `${card.side === side ? verdicts.correct : verdicts.incorrect} ${card.why}`,
    highlight: { kind: 'port', value: card.side === 'WAN' ? 'ether1' : 'bridge' },
  };
}
