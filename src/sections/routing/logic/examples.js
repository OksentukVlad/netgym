import { prefixToMask } from '../../../engine/ip.js';

// Fixed, detached examples. Never seed an editable answer with these objects.
const iface = (id, segmentId, ip, prefix) => ({ id, segmentId, address: { ip, prefix } });
const route = (dst, prefix, via, distance) => ({ dst, prefix, via, ...(distance ? { distance } : {}) });

export function routingExample({ syntax = 'cisco', taskNumber = 1 } = {}) {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError('invalid-syntax');
  const backup = taskNumber === 15;
  const network = backup ? {
    devices: [
      { id: 'R1', kind: 'router', interfaces: [iface('wan1', 'wan1', '192.0.2.2', 30), iface('wan2', 'wan2', '192.0.2.6', 30), iface('lan', 'lan', '198.51.100.1', 26)] },
      { id: 'ISP1', kind: 'isp', interfaces: [iface('isp1', 'wan1', '192.0.2.1', 30)] },
      { id: 'ISP2', kind: 'isp', interfaces: [iface('isp2', 'wan2', '192.0.2.5', 30)] },
    ],
    segments: [{ id: 'wan1', kind: 'wan' }, { id: 'wan2', kind: 'wan' }, { id: 'lan', kind: 'lan' }],
    endpoints: [{ id: 'pc', kind: 'host', segmentId: 'lan', ip: '198.51.100.2', gateway: '198.51.100.1' }, { id: 'internet', kind: 'internet', viaPeers: ['ISP1', 'ISP2'] }], supplied: {},
  } : {
    devices: [
      { id: 'R1', kind: 'router', interfaces: [iface('lan1', 'lan1', '192.0.2.1', 26), iface('link1', 'link', '192.0.2.253', 30)] },
      { id: 'R2', kind: 'router', interfaces: [iface('lan2', 'lan2', '198.51.100.65', 26), iface('link2', 'link', '192.0.2.254', 30)] },
    ],
    segments: [{ id: 'lan1', kind: 'lan' }, { id: 'link', kind: 'link' }, { id: 'lan2', kind: 'lan' }],
    endpoints: [{ id: 'pc1', kind: 'host', segmentId: 'lan1', ip: '192.0.2.2', gateway: '192.0.2.1' }, { id: 'pc2', kind: 'host', segmentId: 'lan2', ip: '198.51.100.66', gateway: '198.51.100.65' }],
    supplied: { R2: [route('192.0.2.0', 26, '192.0.2.253')] },
  };
  const routes = backup ? [route('0.0.0.0', 0, '192.0.2.1', 1), route('0.0.0.0', 0, '192.0.2.5', 5)] : [route('198.51.100.64', 26, '192.0.2.254')];
  const probes = backup ? [{ id: 'internet', from: 'pc', to: 'internet', coverage: { from: { dst: '198.51.100.0', prefix: 26 }, to: null } }]
    : [{ id: 'lan', from: 'pc1', to: 'pc2', coverage: { from: { dst: '192.0.2.0', prefix: 26 }, to: { dst: '198.51.100.64', prefix: 26 } } }];
  const scenarios = backup ? [{ id: 'normal', downLinks: [], probeIds: ['internet'] }, { id: 'backup', downLinks: ['wan1'], probeIds: ['internet'] }] : [];
  const objectives = backup ? [
    { id: 'main', type: 'path-via', severity: 'blocks', scenarioId: 'normal', probeId: 'internet', deviceId: 'ISP1' },
    { id: 'backup', type: 'path-via', severity: 'blocks', scenarioId: 'backup', probeId: 'internet', deviceId: 'ISP2' },
  ] : [];
  const variant = { id: 'example', objectives, scaffold: { R1: routes.map(() => ({})) } };
  const record = { id: 'example-routing', network, probes, scenarios, variants: [variant] };
  const fields = routes.map(r => syntax === 'cisco'
    ? { net: r.dst, mask: prefixToMask(r.prefix), gw: r.via, ...(backup ? { dist: String(r.distance) } : {}) }
    : { dst: `${r.dst}/${r.prefix}`, gw: r.via, ...(backup ? { dist: String(r.distance) } : {}) });
  return {
    context: backup ? 'R1: основний через ISP1 (сусід 192.0.2.1), резервний через ISP2 (сусід 192.0.2.5).'
      : 'R1 → LAN-C 198.51.100.64/26 через сусіда R2 192.0.2.254; зворотний маршрут на R2 уже задано.',
    // The reason, one sentence (WorkedExample `note`), task 15 only.
    note: backup ? 'Більша відстань резервного дає йому спрацювати, коли лінк до ISP1 зникне.' : null,
    columns: syntax === 'cisco' ? ['Мережа', 'Маска', 'Шлюз', ...(backup ? ['Відстань'] : [])] : ['dst-address', 'gateway', ...(backup ? ['distance'] : [])],
    rows: fields.map(f => Object.values(f)), fields,
    task: { record, variant, network, identity: { taskId: record.id, variantId: variant.id } }, answer: { R1: routes },
  };
}
