const tcp = (id, srcIp, dstIp, srcPort, dstPort, ingress, state = 'new', dstNat = false) => ({
  id, packet: { srcIp, dstIp, protocol: 'tcp', srcPort, dstPort }, facts: { ingress, state, dstNat },
});
const internet = '203.0.113.50', pc = '192.168.88.10', server = '192.168.88.20', wan = '100.64.0.2', lan = '192.168.88.1';
export const cards = [
  tcp('invalid-fwd', internet, server, 50001, 443, 'ether1', 'invalid', true),
  tcp('wan-winbox', internet, wan, 50002, 8291, 'ether1'),
  tcp('wan-to-router-lan-ip', internet, lan, 50003, 8291, 'ether1'),
  tcp('wan-invalid-router', internet, wan, 50004, 8291, 'ether1', 'invalid'),
  tcp('wan-to-pc-new', internet, pc, 50005, 445, 'ether1'),
  tcp('reply-to-pc', internet, pc, 443, 50000, 'ether1', 'established'),
  tcp('port-forward', internet, server, 50006, 443, 'ether1', 'new', true),
  tcp('lan-winbox', pc, lan, 50007, 8291, 'bridge'),
  tcp('lan-web-out', pc, internet, 50008, 443, 'bridge'),
  tcp('wan-ssh', internet, wan, 50009, 22, 'ether1'),
  tcp('wan-webfig', internet, wan, 50010, 80, 'ether1'),
  { id: 'wan-ping-router', packet: { srcIp: internet, dstIp: wan, protocol: 'icmp', icmpType: 8 }, facts: { ingress: 'ether1', state: 'new', dstNat: false } },
  { id: 'router-dns-reply', packet: { srcIp: internet, dstIp: wan, protocol: 'udp', srcPort: 53, dstPort: 50011 }, facts: { ingress: 'ether1', state: 'established', dstNat: false } },
  { id: 'lan-dns-router', packet: { srcIp: pc, dstIp: lan, protocol: 'udp', srcPort: 50012, dstPort: 53 }, facts: { ingress: 'bridge', state: 'new', dstNat: false } },
  tcp('lan-dns-tcp-out', pc, internet, 50013, 53, 'bridge'),
  tcp('lan-to-router-wan-ip', pc, wan, 50014, 8291, 'bridge'),
  { id: 'related-icmp-to-pc', packet: { srcIp: internet, dstIp: pc, protocol: 'icmp', icmpType: 3 }, facts: { ingress: 'ether1', state: 'related', dstNat: false } },
].map(card => card.facts.dstNat ? { ...card, facts: { ...card.facts, dstNatFrom: { address: wan, port: 443 } } } : card);

export const safetyCardIds = [
  'invalid-fwd', 'wan-winbox', 'wan-to-router-lan-ip', 'wan-invalid-router',
  'wan-to-pc-new', 'reply-to-pc', 'port-forward', 'lan-winbox', 'lan-web-out',
];
for (const card of cards) card.safety = safetyCardIds.includes(card.id);

// FW-2 witnesses are not added to FW-1's frozen sampling inventory.
export const orderWitnessCards = [
  { id: 'wan-invalid-icmp', packet: { srcIp: internet, dstIp: wan, protocol: 'icmp', icmpType: 8 }, facts: { ingress: 'ether1', state: 'invalid', dstNat: false }, safety: false },
  { ...tcp('lan-invalid-tcp', pc, lan, 50015, 8291, 'bridge', 'invalid'), safety: false },
];
