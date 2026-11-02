export const topology = {
  router: {
    interfaces: [
      { id: 'ether1', address: '100.64.0.2', prefix: 30 },
      { id: 'bridge', address: '192.168.88.1', prefix: 24 },
    ],
    gateway: '100.64.0.1',
    lists: { WAN: ['ether1'], LAN: ['bridge'] },
  },
  hosts: [
    { id: 'pc', role: 'pc', address: '192.168.88.10' },
    { id: 'server', role: 'web-server', address: '192.168.88.20' },
    { id: 'internet', role: 'internet', address: '203.0.113.50' },
  ],
};
