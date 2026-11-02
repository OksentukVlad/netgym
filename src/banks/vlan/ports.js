const task = (n, title, placements, objective = null) => ({
  id: `vlan.ports-${n}`, version: 1,
  variants: [{ id: 'main', title, placements, objective }],
});
export const records = [
  task(1, 'Два відділи на одному комутаторі', [[0, 0, 1, 1]]),
  task(2, 'Транк між комутаторами', [[0, 1], [0, 1]]),
  task(3, 'Тільки де потрібно', [[0, 1, 2, 2], [0, 1]], 'local-c'),
  task(4, 'Через середній комутатор', [[0, 1], [0, 0], [0, 1]], 'transit-b'),
];
export default records;
