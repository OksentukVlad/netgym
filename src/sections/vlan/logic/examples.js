import { solution as portsSolution } from './ports.js';
import { solution as routeSolution } from './route.js';

const port = (id, cisco, routeros) => ({ id, label: { cisco, routeros } });
const host = (device, ip, gateway) => ({ device, ip, prefix: 26, ...(gateway ? { gateway } : {}) });
const link = (device, p, other, q) => ({ a: { device, port: p }, b: { device: other, port: q } });
const syntaxCheck = syntax => { if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError('invalid-syntax'); };

export function portsExample({ syntax = 'cisco' } = {}) {
  syntaxCheck(syntax);
  const task = {
    syntax, vids: [310], goals: { PC1: 310, PC2: 310 }, objective: null,
    topology: {
      devices: [{ id: 'SW1', kind: 'switch', ports: [port('a1', 'fa0/1', 'ether2'), port('a2', 'fa0/2', 'ether3')] },
        ...['PC1', 'PC2'].map(id => ({ id, kind: 'host', ports: [port('nic', 'nic', 'nic')] }))],
      links: [link('SW1', 'a1', 'PC1', 'nic'), link('SW1', 'a2', 'PC2', 'nic')],
      hosts: [host('PC1', '192.0.2.10'), host('PC2', '192.0.2.11')],
    },
  };
  return {
    // Each vendor's own steps (repair v1, Astra 2): VLAN filtering is RouterOS's alone.
    context: syntax === 'cisco'
      ? 'PC1 і PC2 належать VLAN 310; порт до PC2 уже налаштовано так само. Створи VLAN і налаштуй порт до PC1.'
      : 'PC1 і PC2 належать VLAN 310; порт до PC2 уже налаштовано так само. Створи VLAN і налаштуй порт до PC1; фільтрацію увімкни після перевірки таблиці й доступу керування.',
    columns: syntax === 'cisco' ? ['Порт', 'Режим', 'VLAN'] : ['Порт', 'PVID', 'Кадри', 'Таблиця VLAN', 'Фільтрація'],
    rows: [syntax === 'cisco' ? ['fa0/1', 'access', '310'] : ['ether2', '310', 'admit-only-untagged-and-priority-tagged', '310: untagged ether2, ether3', 'увімкнено після перевірки']],
    task, answer: portsSolution(task, syntax),
  };
}

export function interVlanExample({ syntax = 'cisco' } = {}) {
  syntaxCheck(syntax);
  const networks = [{ vid: 310, network: '192.0.2.0', prefix: 26, gateway: '192.0.2.1' }, { vid: 320, network: '198.51.100.0', prefix: 26, gateway: '198.51.100.1' }];
  const task = {
    syntax, taskNumber: 1, vids: [310, 320], goals: { PC1: 310, PC2: 320 }, networks, management: null,
    assumptions: ['links-up-stp-forwarding', 'connected-only', 'no-proxy-arp'],
    topology: {
      devices: [
        { id: 'SW1', kind: 'switch', ports: [port('t', 'gi0/1', 'ether1'), port('a1', 'fa0/1', 'ether2'), port('a2', 'fa0/2', 'ether3')], dynamicBridgeTagged: true },
        { id: 'R1', kind: 'router', ports: [port('r', 'gi0/1', 'ether1')], dynamicBridgeTagged: true },
        ...['PC1', 'PC2'].map(id => ({ id, kind: 'host', ports: [port('nic', 'nic', 'nic')] })),
      ],
      links: [link('SW1', 't', 'R1', 'r'), link('SW1', 'a1', 'PC1', 'nic'), link('SW1', 'a2', 'PC2', 'nic')],
      hosts: [host('PC1', '192.0.2.10', '192.0.2.1'), host('PC2', '198.51.100.10', '198.51.100.1')],
    },
  };
  return {
    context: 'Один транк до SW1; для VLAN 310 шлюз 192.0.2.1/26. SW1 і логічний інтерфейс VLAN 320 зі шлюзом 198.51.100.1/26 уже налаштовано; фізичний інтерфейс увімкнено.',
    columns: syntax === 'cisco' ? ['Батьківський інтерфейс', 'Підінтерфейс', 'dot1Q', 'Адреса', 'Маска'] : ['VLAN-інтерфейс', 'Батьківський інтерфейс', 'VLAN ID', 'Адреса'],
    rows: [syntax === 'cisco' ? ['gi0/1', 'gi0/1.310', '310', '192.0.2.1', '255.255.255.192'] : ['vlan310', 'ether1', '310', '192.0.2.1/26']],
    task, answer: routeSolution(task, syntax),
  };
}
