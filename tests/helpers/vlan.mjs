// Hand-authored fixtures. No fixture values are obtained from an evaluator.
export const clone = v => structuredClone(v);
export function topology(switchPorts, hostAttachments, trunks = []) {
  return {
    devices: [
      ...Object.entries(switchPorts).map(([id, ports]) => ({ id, kind: 'switch', ports: ports.map(id => ({ id, label: { cisco: id, routeros: id } })) })),
      ...Object.keys(hostAttachments).map(id => ({ id, kind: 'host', ports: [{ id: 'nic', label: { cisco: 'nic', routeros: 'nic' } }] })),
    ],
    links: [
      ...Object.entries(hostAttachments).map(([device, [sw, port]]) => ({ a: { device, port: 'nic' }, b: { device: sw, port } })),
      ...trunks.map(([a, ap, b, bp]) => ({ a: { device: a, port: ap }, b: { device: b, port: bp } })),
    ],
    hosts: Object.entries(hostAttachments).map(([device, [, , ip = '192.168.10.2', prefix = 24]], i) => ({ device, ip: ip === 'auto' ? `192.168.10.${i + 2}` : ip, prefix })),
  };
}
export const simple = () => topology({ SW1: ['a', 'b', 'c'] }, { PC1: ['SW1', 'a', '192.168.10.2'], PC2: ['SW1', 'b', '192.168.10.3'], PC3: ['SW1', 'c', '192.168.20.2'] });
export const cisco = {
  vlans: [10, 20],
  ports: { a: { mode: 'access', vlan: 10 }, b: { mode: 'access', vlan: 10 }, c: { mode: 'access', vlan: 20 } },
};
export const routeros = {
  filtering: true,
  ports: { a: { pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' }, b: { pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' }, c: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' } },
  vlans: [{ vids: [10], tagged: [], untagged: ['a', 'b'] }, { vids: [20], tagged: [], untagged: ['c'] }],
};
export const transit = () => topology({ SW1: ['a', 't'], SW2: ['l', 'r'], SW3: ['b', 't'] }, { PC1: ['SW1', 'a', '192.168.20.2'], PC2: ['SW3', 'b', '192.168.20.3'] }, [['SW1', 't', 'SW2', 'l'], ['SW2', 'r', 'SW3', 't']]);
export const transitCisco = {
  SW1: { vlans: [20], ports: { a: { mode: 'access', vlan: 20 }, t: { mode: 'trunk', allowed: [20] } } },
  SW2: { vlans: [20], ports: { l: { mode: 'trunk', allowed: [20] }, r: { mode: 'trunk', allowed: [20] } } },
  SW3: { vlans: [20], ports: { b: { mode: 'access', vlan: 20 }, t: { mode: 'trunk', allowed: [20] } } },
};
export const hop = (device, inPort, tagged, vid, out = [], dropped = [], transparent) => ({ device, inPort, tagged, vid, out, dropped, ...(transparent === undefined ? {} : { transparent }) });
export const out = (port, tagged, vid) => ({ port, tagged, vid });
