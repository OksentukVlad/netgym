import { topology } from './topology.js';
import { policies } from './policies.js';
import { cards } from './cards.js';
import { validateBank } from './validate.js';

const reply = cards.find(c => c.id === 'reply-to-pc');
export const chainCards = [
  cards.find(c => c.id === 'lan-winbox'),
  { id: 'chain-web-request', packet: { srcIp: reply.packet.dstIp, dstIp: reply.packet.srcIp,
    protocol: 'tcp', srcPort: reply.packet.dstPort, dstPort: reply.packet.srcPort },
    facts: { ingress: 'bridge', state: 'new', dstNat: false }, safety: false },
  reply,
];
export const chainRecords = [{ id: 'fw-predict', version: 1, variants: [
  { id: 'chain', kind: 'chain', policyId: 'home-basic', cardIds: chainCards.map(c => c.id),
    title: 'Куди йде пакет', text: 'Для кожного пакета визнач, кому його адресовано: самому роутеру чи іншому пристрою.' },
] }];
export function validateChainBank(records = chainRecords, inventory = chainCards) {
  if (!Array.isArray(records) || !Array.isArray(inventory)) return [{ code: 'invalid-bank', field: 'chain' }];
  return validateBank({ topology, policies: [policies[0]], cards: inventory, records,
    safetyCardIds: inventory.filter(c => c?.safety).map(c => c.id), safetyExceptions: { 'home-basic': [] } });
}
