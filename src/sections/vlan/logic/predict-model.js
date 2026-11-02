import { flood } from '../../../engine/l2.js';
import { makeRng } from '../../../engine/rng.js';
import { generateNetwork, reference, compileAll, clone, hostPort, switches } from './model.js';

export function applySurprise(network, configurations, vendor, slot) {
  if (!['access-a', 'access-b', 'pvid-one', 'filtering-off', 'trunk-untagged', 'missing-transit', 'allowed-a', 'allowed-b'].includes(slot)) throw new RangeError('invalid-record');
  const { topology, vids } = network;
  const access = host => {
    const end = hostPort(topology, host), p = configurations[end.device].ports[end.port];
    const vid = network.goals[host] === vids[0] ? vids[1] : vids[0];
    if (vendor === 'cisco') p.vlan = vid;
    else {
      p.pvid = slot === 'pvid-one' ? 1 : vid;
      for (const row of configurations[end.device].vlans) row.untagged = row.untagged.filter(id => id !== end.port);
      let row = configurations[end.device].vlans.find(r => r.vids.includes(p.pvid));
      if (!row) { row = { vids: [p.pvid], tagged: [], untagged: [] }; configurations[end.device].vlans.push(row); }
      row.untagged.push(end.port);
    }
    return end;
  };
  if (slot === 'access-a') return access('PC1');
  if (slot === 'access-b' || slot === 'pvid-one') return access(topology.devices.filter(d => d.kind === 'switch').length === 1 ? 'PC3' : 'PC2');
  if (slot === 'filtering-off') {
    const device = switches(topology).length === 1 ? 'SW1' : 'SW2';
    configurations[device].filtering = false;
    return { device, port: 'bridge' };
  }
  if (slot === 'trunk-untagged') { configurations.SW2.ports.t1.frameTypes = 'admit-only-untagged-and-priority-tagged'; return { device: 'SW2', port: 't1' }; }
  if (slot === 'missing-transit') { configurations.SW2.vlans = configurations.SW2.vlans.filter(vid => vid !== vids[1]); return { device: 'SW2', port: 'database' }; }
  const device = slot === 'allowed-a' ? 'SW1' : 'SW2';
  const port = slot === 'allowed-a' || switches(topology).length === 2 ? 't1' : 't2';
  const vid = slot === 'allowed-a' ? vids[0] : vids[1];
  if (vendor === 'cisco') configurations[device].ports[port].allowed = configurations[device].ports[port].allowed.filter(v => v !== vid);
  else for (const row of configurations[device].vlans) if (row.vids.includes(vid)) row.tagged = row.tagged.filter(p => p !== port);
  return { device, port };
}

export function surpriseSlots(variant, vendor, seed, count) {
  const available = variant.slots?.[vendor];
  if (!Array.isArray(available)) throw new RangeError('invalid-record');
  const rng = makeRng(`${seed}:surprises`);
  // Avoid pairs that mask each other (e.g. an ignored table with filtering off).
  const pairs = variant.id === 'p1' ? [['access-a', 'access-b']]
    : variant.id === 'p2' ? [['allowed-a', 'allowed-b'], ...(vendor === 'routeros' ? [['allowed-a', 'trunk-untagged'], ['allowed-a', 'pvid-one']] : [])]
      : [[vendor === 'cisco' ? 'missing-transit' : 'filtering-off', 'allowed-a'], ['allowed-b', 'allowed-a']];
  const slots = count === 0 ? [] : count === 1 ? [rng.pick(available)] : rng.pick(pairs);
  if (!slots.every(s => available.includes(s))) throw new RangeError('invalid-record');
  return slots;
}

const reachKey = walk => [...walk.received].sort().join(',');
export function reachMap(topology, tables) {
  return Object.fromEntries(topology.hosts.map(h => [h.device, reachKey(flood(topology, tables, { from: h.device }))]));
}

/** All comparisons are computed afresh; no expected membership in records. */
export function makePredict(variant, seed, vendor, count) {
  const network = generateNetwork(variant, seed);
  // IP subnet numbering is an annotation, never an answer to an L2 task.
  // Derange all group subnets, including the introductory zero-surprise level.
  // Preserve each host suffix and every configuration/sampling RNG stream.
  for (const host of network.topology.hosts) {
    const group = network.vids.indexOf(network.goals[host.device]);
    host.ip = host.ip.replace(/^(192\.168\.)\d+(\.)/, (_, start, dot) => `${start}${network.vids[(group + 1) % network.vids.length]}${dot}`);
  }
  const configs = reference(network, vendor), baseline = clone(configs);
  const slots = surpriseSlots(variant, vendor, seed, count), active = slots.map(id => ({ id, ...applySurprise(network, configs, vendor, id) }));
  // An address from another network is an annotation, never a graded surprise.
  const addressRng = makeRng(`${seed}:address`);
  if (count > 0 && addressRng.int(0, 1)) {
    const host = addressRng.pick(network.topology.hosts);
    const subnet = addressRng.pick(network.vids.filter(vid => vid !== network.goals[host.device]));
    const occupied = new Set(network.topology.hosts.map(h => h.ip));
    let ip;
    do { ip = `192.168.${subnet}.${addressRng.int(2, 254)}`; } while (occupied.has(ip));
    host.ip = ip;
  }
  const { tables, findings } = compileAll(network.topology, configs, vendor);
  if (findings.some(f => f.severity === 'blocks')) throw new RangeError('invalid-record');
  const current = reachMap(network.topology, tables);
  const alternatives = slots.map((_, omit) => {
    const alt = clone(baseline);
    slots.forEach((slot, i) => { if (i !== omit) applySurprise(network, alt, vendor, slot); });
    return reachMap(network.topology, compileAll(network.topology, alt, vendor).tables);
  });
  const hosts = makeRng(`${seed}:sources`).shuffle(network.topology.hosts.map(h => h.device));
  const classKey = host => [host, ...current[host].split(',').filter(Boolean)].sort().join(',');
  const roundCount = new Set(hosts.map(classKey)).size <= 3 ? 3 : 4;
  let selected = null, score = -1;
  // At most C(8,4)=70 candidates; preserve seeded tie ordering.
  const choose = (start, candidate) => {
    if (candidate.length === roundCount) {
      if (!alternatives.every(alt => candidate.some(h => current[h] !== alt[h]))) return;
      const diversity = new Set(candidate.map(classKey)).size;
      if (diversity > score) { score = diversity; selected = candidate; }
      return;
    }
    for (let i = start; i <= hosts.length - (roundCount - candidate.length); i++) {
      choose(i + 1, [...candidate, hosts[i]]);
    }
  };
  choose(0, []);
  if (!selected || new Set(active.map(s => `${s.device}/${s.port}`)).size !== active.length) throw new RangeError('invalid-record');
  const rounds = [], used = new Set();
  for (const host of selected) if (!used.has(classKey(host))) { rounds.push(host); used.add(classKey(host)); }
  for (const host of selected) if (!rounds.includes(host)) rounds.push(host);
  return { topology: network.topology, configurations: configs, activeSurprises: active, rounds: rounds.map((from, i) => ({ id: `r${i + 1}`, from })) };
}
