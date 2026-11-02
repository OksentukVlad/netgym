// A different policy and packet, never an answer to the home-basic inventory.
export function orderExample() {
  const rules = [
    { id: 'example-service', enabled: true, chain: 'input', action: 'accept', match: { protocol: { values: ['tcp'], not: false }, dstPort: { values: [8443], not: false }, srcAddress: { values: ['198.51.100.64/26'], not: false } } },
    { id: 'example-rest', enabled: true, chain: 'input', action: 'drop', match: {} },
  ];
  return {
    context: 'До роутера 192.0.2.2 приходить TCP з 198.51.100.77 на порт 8443: дозвіл для цього джерела й сервісу перевіряємо перед відкиданням решти.',
    columns: ['Ланцюжок', 'Дія й умови'],
    rows: [['input', 'accept · protocol=tcp · src-address=198.51.100.64/26 · dst-port=8443'], ['input', 'drop · решта']],
    task: { topology: { router: { interfaces: [{ id: 'ether1', address: '192.0.2.2', prefix: 30 }, { id: 'bridge', address: '198.51.100.1', prefix: 26 }], gateway: '192.0.2.1', lists: { WAN: ['ether1'], LAN: ['bridge'] } }, hosts: [] }, rules },
    answer: { order: rules.map(r => r.id) },
    card: { id: 'example-packet', packet: { srcIp: '198.51.100.77', dstIp: '192.0.2.2', protocol: 'tcp', srcPort: 50000, dstPort: 8443 }, facts: { ingress: 'ether1', state: 'new', dstNat: false } },
  };
}
