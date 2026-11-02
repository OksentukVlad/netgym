// Resolved shapes only. Plantings and their answers belong to the logic.
const l2 = (id, title, placements, objective, levels) => ({ id, title, placements, objective, levels, syntaxes: ['cisco', 'routeros'] });
const l3 = (n, title) => ({ id: `route-${n}`, title, task: n, levels: [2, 3], syntaxes: n === 4 ? ['routeros'] : ['cisco', 'routeros'] });
export const record = { id: 'vlan.faults', version: 1, variants: [
  l2('two-switch', 'Транк між комутаторами', [[0, 1], [0, 1]], null, [1, 3]),
  l2('local', 'Тільки де потрібно', [[0, 1, 2, 2], [0, 1]], 'local-c', [1, 3]),
  l2('transit', 'Через середній комутатор', [[0, 1], [0, 0], [0, 1]], 'transit-b', [3]),
  l3(1, 'Маршрутизатор на паличці'), l3(2, 'Транк до маршрутизатора'),
  l3(3, 'Керування комутатором'), l3(4, 'Маршрутизатор із мостом'),
] };
export const records = [record];
export default records;
