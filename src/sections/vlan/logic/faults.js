import { faultCatalogue } from '../../../engine/faults.js';
import { peer, compileCisco } from '../../../engine/l2.js';
import { clone, pool } from './model.js';
import { causeText } from '../uk.js';

export const catalogue = faultCatalogue([
  { code: 'trunk-missing-vlan', vendors: ['cisco', 'routeros'], layer: 2 },
  { code: 'access-is-trunk', vendors: ['cisco'], layer: 2 },
  { code: 'access-wrong-vlan', vendors: ['cisco', 'routeros'], layer: 2 },
  { code: 'transit-vlan-missing', vendors: ['cisco'], layer: 2 },
  { code: 'filtering-off', vendors: ['routeros'], layer: 2 },
  { code: 'trunk-frame-types', vendors: ['routeros'], layer: 2 },
  { code: 'native-mismatch', vendors: ['cisco'], layer: 2 },
  { code: 'trunk-is-access', vendors: ['cisco'], layer: 2 },
  { code: 'access-frame-types', vendors: ['routeros'], layer: 2 },
  { code: 'parent-shutdown', vendors: ['cisco'], layer: 3 },
  { code: 'wrong-encapsulation', vendors: ['cisco', 'routeros'], layer: 3 },
  { code: 'router-address-wrong-network', vendors: ['cisco', 'routeros'], layer: 3 },
  { code: 'vlan-if-on-bridge-port', vendors: ['routeros'], layer: 3 },
  { code: 'bridge-not-tagged', vendors: ['routeros'], layer: 3 },
], entry => ({ text: Object.fromEntries(entry.vendors.map(vendor => [vendor, causeText[vendor][entry.code]])),
  sites: (task, baseline, vendor = task.vendor) => sites(task, baseline, vendor).filter(s => s.code === entry.code),
  plant: (baseline, site, vendor) => plant(baseline, { ...site, code: entry.code }, vendor),
  repair: (answer, baseline, site, vendor) => repair(answer, baseline, { ...site, code: entry.code }, vendor),
}));

/** Every site, not just the first failing probe's site. slot is independent
 * of generated VID/port numbers and can be used for bounded coverage reports. */
export function sites(task, baseline, vendor = task.vendor) {
  const found = [];
  const add = (code, device, port, extra = {}) => found.push({ code, device, port, ...extra,
    key: `${code}/${device}/${port}/${extra.slot ?? ''}`, capability: task.topology.devices.find(d => d.id === device)?.dynamicBridgeTagged === false ? 'static' : task.vendor === 'routeros' ? 'dynamic' : 'default' });
  for (const d of task.topology.devices.filter(d => d.kind !== 'host')) {
    const c = baseline[d.id];
    for (const [port, p] of Object.entries(c.ports ?? {})) {
      const other = peer(task.topology, d.id, port), vid = task.goals[other?.device];
      if (vid !== undefined) {
        // Include the VLAN-1 alias as a site of the same cause.
        for (const changed of [...new Set([1, ...Object.values(task.goals)])].filter(v => v !== vid))
          add('access-wrong-vlan', d.id, port, { vid, changed, slot: `host:${other.device}:to:${changed === 1 ? 'default' : task.vids.indexOf(changed)}` });
        if (vendor === 'cisco') add('access-is-trunk', d.id, port);
        else add('access-frame-types', d.id, port);
      } else {
        const carried = vendor === 'cisco' ? (p.allowed === 'all' ? c.vlans : p.allowed) : c.vlans.filter(r => r.tagged.includes(port)).flatMap(r => r.vids);
        for (const v of carried) add('trunk-missing-vlan', d.id, port, { vid: v, slot: task.vids.indexOf(v) });
        if (vendor === 'cisco') {
          add('trunk-is-access', d.id, port, { changed: p.native ?? 1 });
          if (task.level === 3 && task.topology.devices.find(x => x.id === other?.device)?.kind === 'switch') {
            for (const changed of [1, ...carried].filter(v => v !== (p.native ?? 1))) add('native-mismatch', d.id, port, { changed, slot: changed === 1 ? 'default' : task.vids.indexOf(changed) });
          }
        } else add('trunk-frame-types', d.id, port);
      }
    }
    if (c.ports && vendor === 'routeros') add('filtering-off', d.id, 'bridge');
    if (vendor === 'cisco' && d.kind === 'switch') {
      const neighbours = d.ports.filter(p => task.topology.devices.find(x => x.id === peer(task.topology, d.id, p.id)?.device)?.kind === 'switch');
      if (neighbours.length >= 2) for (const vid of c.vlans.filter(v => !Object.values(c.ports).some(p => p.mode === 'access' && p.vlan === v)))
        add('transit-vlan-missing', d.id, 'database', { vid, slot: task.vids.indexOf(vid) });
    }
    if (vendor === 'cisco' && d.kind === 'router') {
      for (const port of Object.keys(c.interfaces)) add('parent-shutdown', d.id, port);
    }
    const rows = vendor === 'cisco' ? c.subifs ?? [] : c.vlanIfs ?? [];
    rows.forEach((row, index) => {
      const unused = pool.find(v => !rows.some(r => r.vid === v));
      add('wrong-encapsulation', d.id, vendor === 'cisco' ? row.parent : row.on, { index, changed: unused, slot: index });
      if (vendor === 'routeros' && c.ports) {
        for (const port of Object.keys(c.ports)) add('vlan-if-on-bridge-port', d.id, port, { index, slot: index });
        if (d.dynamicBridgeTagged === false && row.on === 'bridge1') add('bridge-not-tagged', d.id, 'bridge1', { index, vid: row.vid, slot: index });
      }
    });
    if (d.kind === 'router') (vendor === 'cisco' ? c.subifs : c.addresses).forEach((row, index) => {
      // Same address family and /24 style as the task, outside its networks.
      const family = task.networks[0].network.split('.').slice(0, 2).join('.');
      const third = Array.from({ length: 220 }, (_, i) => i + 10).filter(n => !task.networks.some(net => Number(net.network.split('.')[2]) === n))[index];
      add('router-address-wrong-network', d.id, vendor === 'cisco' ? row.parent : row.iface, { index, changed: `${family}.${third}.1`, slot: index });
    });
  }
  return found;
}

/** One semantic change, possibly several consistent form fields (PVID and
 * static untagged membership). The input and site are never mutated. */
export function plant(baseline, site, vendor) {
  const answer = clone(baseline), { code, device, port, vid, changed, index } = site, c = answer[device];
  if (code === 'trunk-missing-vlan') {
    if (vendor === 'cisco') c.ports[port].allowed = (c.ports[port].allowed === 'all' ? [...compileCisco(c).table.vlans] : c.ports[port].allowed).filter(v => v !== vid);
    else for (const row of c.vlans.filter(r => r.vids.includes(vid))) {
      // Generated baselines have one row per VID; grouped rows from callers
      // are split so other VLANs keep their membership.
      if (row.vids.length > 1) { c.vlans.push({ ...clone(row), vids: row.vids.filter(v => v !== vid) }); row.vids = [vid]; }
      row.tagged = row.tagged.filter(p => p !== port);
    }
  } else if (code === 'access-is-trunk') c.ports[port] = { mode: 'trunk', allowed: [...c.vlans] };
  else if (code === 'access-wrong-vlan') {
    if (vendor === 'cisco') c.ports[port].vlan = changed;
    else {
      c.ports[port].pvid = changed;
      for (const row of c.vlans) row.untagged = row.untagged.filter(p => p !== port);
      if (changed !== 1) {
        let row = c.vlans.find(r => r.vids.length === 1 && r.vids[0] === changed);
        if (!row) { row = { vids: [changed], tagged: [], untagged: [] }; c.vlans.push(row); }
        row.untagged.push(port);
      }
    }
  } else if (code === 'transit-vlan-missing') c.vlans = c.vlans.filter(v => v !== vid);
  else if (code === 'filtering-off') c.filtering = false;
  else if (code === 'trunk-frame-types') c.ports[port].frameTypes = 'admit-only-untagged-and-priority-tagged';
  else if (code === 'access-frame-types') c.ports[port].frameTypes = 'admit-only-vlan-tagged';
  else if (code === 'trunk-is-access') c.ports[port] = { mode: 'access', vlan: changed };
  else if (code === 'native-mismatch') c.ports[port].native = changed;
  else if (code === 'parent-shutdown') c.interfaces[port].up = false;
  else if (code === 'wrong-encapsulation') (vendor === 'cisco' ? c.subifs : c.vlanIfs)[index].vid = changed;
  else if (code === 'router-address-wrong-network') (vendor === 'cisco' ? c.subifs : c.addresses)[index].ip = changed;
  else if (code === 'vlan-if-on-bridge-port') c.vlanIfs[index].on = port;
  else if (code === 'bridge-not-tagged') for (const row of c.vlans.filter(r => r.vids.includes(vid))) {
    if (row.vids.length > 1) { c.vlans.push({ ...clone(row), vids: row.vids.filter(v => v !== vid) }); row.vids = [vid]; }
    row.tagged = row.tagged.filter(p => p !== 'bridge1');
  }
  else throw new RangeError('invalid-fault');
  return answer;
}

/** Restore the fields changed by one planting; used on the saved faulty
 * snapshot for the canonical reveal, never to grade learner edits. */
export function changes(before, after, path = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object'
    && ((!Array.isArray(before) && !Array.isArray(after))
      || (path.at(-1) === 'vlans' && Array.isArray(before) && Array.isArray(after) && [...before, ...after].every(row => row && typeof row === 'object'))))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(k => changes(before[k], after[k], [...path, k]));
  return [{ path, before, after }];
}
export function repair(answer, baseline, site, vendor) {
  const result = clone(answer);
  for (const change of changes(baseline, plant(baseline, site, vendor))) {
    let own = result;
    for (const key of change.path.slice(0, -1)) own = own[key];
    const key = change.path.at(-1);
    if (change.before === undefined) {
      if (Array.isArray(own)) own.splice(Number(key), 1); else delete own[key];
    } else own[key] = clone(change.before);
  }
  return result;
}
