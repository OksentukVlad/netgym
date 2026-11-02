import { makeRng } from '../../../engine/rng.js';
import { peer } from '../../../engine/l2.js';
import { clone, label } from './model.js';
export { clone, label } from './model.js';
export const syntaxes = ['cisco', 'routeros'];
export const validRouteRecord = r => r && typeof r.id === 'string' && r.version === 1
  && Object.keys(r).every(k => ['id', 'version', 'variants'].includes(k))
  && Array.isArray(r.variants) && r.variants.length === 1 && r.variants.every(v => v && v.id === 'main' && typeof v.title === 'string'
    && Object.keys(v).every(k => ['id', 'title', 'task', 'syntaxes'].includes(k))
    && [1, 2, 3, 4].includes(v.task) && r.id === `vlan.route-${v.task}` && Array.isArray(v.syntaxes)
    && JSON.stringify(v.syntaxes) === JSON.stringify(v.task === 4 ? ['routeros'] : syntaxes));
const port = (id, cisco, routeros) => ({ id, label: { cisco, routeros } });

/** Only public givens. No generated reference rows/mappings in the instance. */
export function generateRoute(variant, seed) {
  const rng = makeRng(seed), n = variant.task, count = n === 2 ? 3 : 2;
  const vids = rng.shuffle([10, 20, 30, 40, 50, 100, 200]).slice(0, count + (n === 3 ? 1 : 0));
  const third = rng.shuffle(Array.from({ length: 220 }, (_, i) => i + 10)).slice(0, vids.length);
  const networks = vids.map((vid, i) => {
    const roll = rng.int(0, 9), host = roll < 6 ? 1 : roll < 8 ? 254 : rng.int(100, 199);
    return { vid, network: `172.16.${third[i]}.0`, prefix: 24, gateway: `172.16.${third[i]}.${host}` };
  });
  const rLabel = rng.int(1, 3), used = rng.shuffle([2, 3, 4, 5, 6, 7]);
  const swPorts = [port('t', 'gi0/1', 'ether1')], rPorts = [port('r', `gi0/${rLabel}`, `ether${rLabel}`)];
  const topology = { devices: [], links: [{ a: { device: 'SW1', port: 't' }, b: { device: 'R1', port: 'r' } }], hosts: [] }, goals = {};
  let number = 0;
  for (let group = 0; group < count; group++) for (let j = 0; j < 2; j++) {
    const device = `PC${++number}`, onRouter = n === 4 && j === 0, id = `a${number}`, sw = onRouter ? 'R1' : 'SW1';
    (onRouter ? rPorts : swPorts).push(port(id, `fa0/${used[number - 1]}`, `ether${onRouter ? 4 + group : used[number - 1]}`));
    topology.devices.push({ id: device, kind: 'host', ports: [port('nic', 'nic', 'nic')] });
    topology.hosts.push({ device, ip: `172.16.${third[group]}.${20 + j}`, prefix: 24, gateway: networks[group].gateway });
    topology.links.push({ a: { device, port: 'nic' }, b: { device: sw, port: id } });
    goals[device] = vids[group];
  }
  topology.devices.unshift({ id: 'SW1', kind: 'switch', ports: swPorts, dynamicBridgeTagged: true }, { id: 'R1', kind: 'router', ports: rPorts, dynamicBridgeTagged: true });
  return { taskNumber: n, topology, goals, vids, networks, management: n === 3 ? { ...networks[2], device: 'SW1', admin: 'PC1' } : null,
    assumptions: ['links-up-stp-forwarding', 'connected-only', 'no-proxy-arp'] };
}

export function switchReference(task, device, syntax, includeManagement = true) {
  const d = task.topology.devices.find(d => d.id === device), ports = {}, rows = {};
  const vids = task.networks.filter(net => includeManagement || net.vid !== task.management?.vid).map(net => net.vid);
  for (const p of d.ports) {
    const other = peer(task.topology, device, p.id), hostVid = task.goals[other?.device], trunk = hostVid === undefined;
    if (syntax === 'cisco') ports[p.id] = trunk ? { mode: 'trunk', allowed: [...vids] } : { mode: 'access', vlan: hostVid };
    else ports[p.id] = { pvid: trunk ? 1 : hostVid, frameTypes: trunk ? 'admit-only-vlan-tagged' : 'admit-only-untagged-and-priority-tagged' };
    for (const vid of trunk ? vids : [hostVid]) (rows[vid] ??= { vids: [vid], tagged: [], untagged: [] })[trunk ? 'tagged' : 'untagged'].push(p.id);
  }
  return syntax === 'cisco' ? { ports, vlans: vids } : { filtering: true, ports, vlans: Object.values(rows), vlanIfs: [], addresses: [] };
}
export function routerReference(task, syntax, networks = task.networks) {
  if (syntax === 'cisco') return { interfaces: { r: { up: true } }, subifs: networks.map(net => ({ parent: 'r', number: net.vid, vid: net.vid, ip: net.gateway, prefix: net.prefix })) };
  const c = task.taskNumber === 4 ? switchReference(task, 'R1', syntax) : {};
  c.vlanIfs = networks.map(net => ({ name: `vlan${net.vid}`, vid: net.vid, on: task.taskNumber === 4 ? 'bridge1' : 'r' }));
  c.addresses = networks.map(net => ({ ip: net.gateway, prefix: net.prefix, iface: `vlan${net.vid}` }));
  if (task.taskNumber === 4) for (const row of c.vlans) row.tagged.push('bridge1');
  return c;
}

/** These are explicitly fixed parts, not editable answer suggestions. Task 3
 * gives access ports and A/B routing; the student extends the trunk/router. */
export function givens(task, syntax) {
  if (!syntaxes.includes(syntax) || (task.taskNumber === 4 && syntax !== 'routeros')) throw new RangeError('invalid-config');
  if (task.taskNumber === 1) return { SW1: switchReference(task, 'SW1', syntax) };
  if (task.taskNumber === 3) {
    const sw = switchReference(task, 'SW1', syntax, false);
    return { SW1: { ports: Object.fromEntries(Object.entries(sw.ports).filter(([p]) => p !== 't')) }, R1: routerReference(task, syntax, task.networks.slice(0, 2)) };
  }
  return {};
}

export function blankAnswer(task, syntax) {
  const fixed = givens(task, syntax), sw = task.topology.devices.find(d => d.id === 'SW1');
  const answer = {
    SW1: syntax === 'cisco' ? { vlans: [], ports: Object.fromEntries(sw.ports.map(p => [p.id, { mode: null }])) }
      : { filtering: false, ports: Object.fromEntries(sw.ports.map(p => [p.id, { pvid: 1, frameTypes: 'admit-all' }])), vlans: [], vlanIfs: [], addresses: [] },
    R1: syntax === 'cisco' ? { interfaces: { r: { up: false } }, subifs: [] } : { vlanIfs: [], addresses: [] },
  };
  if (task.taskNumber === 1) answer.SW1 = clone(fixed.SW1);
  if (task.taskNumber === 3) {
    answer.SW1 = switchReference(task, 'SW1', syntax, false);
    answer.R1 = clone(fixed.R1);
    if (syntax === 'cisco') { answer.SW1.svi = null; answer.SW1.defaultGateway = ''; }
    else answer.SW1.routes = [];
  }
  if (task.taskNumber === 4) {
    const r = task.topology.devices.find(d => d.id === 'R1');
    Object.assign(answer.R1, { filtering: false, ports: Object.fromEntries(r.ports.map(p => [p.id, { pvid: 1, frameTypes: 'admit-all' }])), vlans: [] });
  }
  return answer;
}
