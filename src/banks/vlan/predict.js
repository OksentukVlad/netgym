// Shape data only; logic receives this resolved record from its caller.
export const shapes = [
  { id: 'p1', title: 'Один комутатор', placements: [[0, 0, 1, 1, 0, 1]],
    slots: { cisco: ['access-a', 'access-b'], routeros: ['access-a', 'access-b', 'filtering-off'] } },
  { id: 'p2', title: 'Два комутатори і транк', placements: [[0, 1, 0], [0, 1, 1]],
    slots: { cisco: ['allowed-a', 'allowed-b'], routeros: ['allowed-a', 'allowed-b', 'trunk-untagged', 'pvid-one'] } },
  { id: 'p3', title: 'Три в ряд', placements: [[0, 1], [0, 2, 2, 0], [0, 1]],
    slots: { cisco: ['allowed-a', 'allowed-b', 'missing-transit'], routeros: ['allowed-a', 'allowed-b', 'filtering-off'] } },
];
export const record = { id: 'vlan.predict', version: 1, variants: shapes };
export const records = [record];
export default records;
