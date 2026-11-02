// Independent constructions from public topology only: no reference, planted
// site, static solution, optimiser output or canonical repair is an input.
import { network, fromInt, toInt } from '../../src/engine/ip.js';

export function topologyRepair(task) {
  const net = task.network, routers = net.devices.filter(d => d.kind === 'router');
  const neighbours = device => net.devices.filter(d => d.id !== device.id).flatMap(d => d.interfaces
    .filter(f => f.address && device.interfaces.some(own => own.segmentId === f.segmentId))
    .map(f => ({ device: d, via: f.address.ip })));
  const toward = (start, target) => {
    const queue = [{ device: start, via: null }], seen = new Set([start.id]);
    while (queue.length) {
      const entry = queue.shift();
      if (target(entry.device)) return entry.via;
      // An ISP terminates forwarding; never use it as transit to another LAN.
      if (entry.device.kind === 'isp') continue;
      for (const next of neighbours(entry.device)) if (!seen.has(next.device.id)) {
        seen.add(next.device.id); queue.push({ device: next.device, via: entry.via ?? next.via });
      }
    }
    return null;
  };
  const routes = {};
  for (const router of routers) {
    const rows = new Map();
    for (const owner of routers) for (const iface of owner.interfaces) if (iface.address) {
      const { ip, prefix } = iface.address, dst = network(ip, prefix);
      if (router.interfaces.some(f => f.address?.prefix === prefix && network(f.address.ip, prefix) === dst)) continue;
      const via = toward(router, d => d.interfaces.some(f => f.segmentId === iface.segmentId));
      if (via) rows.set(`${dst}/${prefix}`, { dst, prefix, via });
    }
    if (task.requirements.length && !(net.supplied?.[router.id] ?? []).some(r => r.prefix === 0)) {
      const via = toward(router, d => d.kind === 'isp');
      if (via) rows.set('default', { dst: '0.0.0.0', prefix: 0, via });
    }
    routes[router.id] = [...rows.values()].map((r, i) => ({ id: `independent-${router.id}-${i}`, ...r }));
  }
  return routes;
}

export function splitRepair(task) {
  return Object.fromEntries(Object.entries(topologyRepair(task)).map(([router, rows]) => [router, rows.flatMap(row => {
    const prefix = row.prefix + 1;
    return [row.dst, fromInt(toInt(row.dst) + 2 ** (32 - prefix))].map((dst, i) => ({ ...row, id: `${row.id}-${i}`, dst, prefix }));
  })]));
}

// Break unknown-space coverage while retaining the sampled internet address:
// replace every configurable default by a route to that one sample. LAN routes
// are independently reconstructed, so their normal pings still pass.
export function sampledInternetOnly(task) {
  const endpoint = task.network.endpoints.find(e => e.kind === 'internet');
  return Object.fromEntries(Object.entries(topologyRepair(task)).map(([router, rows]) => [router,
    rows.map(r => r.prefix === 0 ? { ...r, dst: endpoint.ip ?? '198.19.255.254', prefix: 32 } : r)]));
}
