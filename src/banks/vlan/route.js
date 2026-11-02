const task = (n, title, syntaxes = ['cisco', 'routeros']) => ({
  id: `vlan.route-${n}`, version: 1,
  variants: [{ id: 'main', title, task: n, syntaxes }],
});
export const records = [
  task(1, 'Маршрутизатор на паличці'),
  task(2, 'Транк до маршрутизатора — теж твій'),
  task(3, 'Керування комутатором'),
  task(4, 'Маршрутизатор із мостом', ['routeros']),
];
export const availableRecords = syntax => records.filter(r => r.variants[0].syntaxes.includes(syntax));
export default records;
