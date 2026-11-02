import { contains, blockSize, toInt, fromInt, overlaps } from '../../../engine/ip.js';
import { lookup, routingTable } from '../../../engine/forward.js';
import { coverPrefix, coverSpace, unknownSpace, excludePrefixes } from '../../../engine/coverage.js';

/** Generic form/path objectives. Requirements come only from bank data, never
 * from a task number, scaffold, reference solution or translated task text.
 */
export function assessObjective(net, answer, objective, probes, definitions, scenarios) {
  const scenario = scenarios.find(s => s.id === objective.scenarioId);
  const options = { downLinks: scenario?.downLinks ?? [] };
  const params = { type: objective.type, ...(objective.routerId ? { routerId: objective.routerId } : {}) };
  const table = () => routingTable(net, answer, objective.routerId, options);
  const selected = dst => lookup(net, answer, objective.routerId, dst, options);
  let ok = false, code = objective.code ?? 'objective-not-met';
  switch (objective.type) {
    case 'coverage':
    case 'internet-coverage': {
      const missing = [];
      for (const result of probes.filter(p => (objective.probeIds ?? []).includes(p.id) && p.scenarioId === (objective.scenarioId ?? null))) {
        const definition = definitions.find(p => p.id === result.id);
        for (const direction of objective.type === 'internet-coverage' ? ['request'] : ['request', 'reply']) {
          const prefix = definition.coverage?.[direction === 'request' ? 'to' : 'from'];
          if (objective.type === 'coverage' && !prefix) continue;
          const leg = result[direction];
          const start = leg?.hops.find(h => net.devices.some(d => d.id === h.deviceId && d.kind === 'router'))?.deviceId
            ?? leg?.stop?.deviceId;
          if (!start) continue; // A failed request has no reply; the probe itself blocks.
          const pieces = objective.type === 'internet-coverage'
            ? coverSpace(net, answer, start, excludePrefixes(unknownSpace(net), objective.exclude), { ...options, internet: true })
            : coverPrefix(net, answer, start, prefix, options);
          missing.push(...pieces.map(piece => ({ probeId: result.id, direction, ...piece })));
        }
      }
      params.missing = missing;
      ok = !missing.length && objective.probeIds.every(id => probes.some(p => p.id === id && p.scenarioId === (objective.scenarioId ?? null)));
      code = objective.type === 'coverage' ? 'coverage-missing' : 'internet-coverage-missing';
      break;
    }
    case 'summary': {
      const rows = objective.destinations.map(dst => selected(dst.dst));
      ok = rows.length > 0 && rows.every((row, i) => row && !row.code && row.discard !== true && row.type === 'static' && row.dst === objective.dst && row.prefix === objective.prefix && row.prefix <= objective.destinations[i].prefix && row.id === rows[0].id);
      params.reason = rows.some(row => row && row.prefix < objective.prefix && contains(row.dst, row.prefix, objective.dst)) ? 'too-wide' : 'separate';
      break;
    }
    case 'default-on': {
      ok = table().some(row => row.type === 'static' && row.discard !== true && row.prefix === 0);
      break;
    }
    case 'no-default':
      ok = !(answer?.[objective.routerId] ?? []).some(r => r?.prefix === 0);
      break;
    case 'specific-to':
      ok = objective.destinations.every(dst => {
        const row = selected(dst.dst);
        return row && !row.code && row.discard !== true && row.prefix > 0 && row.prefix <= dst.prefix && contains(row.dst, row.prefix, dst.dst);
      });
      break;
    case 'direct-neighbour':
      ok = objective.destinations.every(dst => {
        const start = toInt(dst.dst), end = start + blockSize(dst.prefix);
        const bounds = new Set([start]);
        for (const route of table().filter(r => overlaps(r.dst, r.prefix, dst.dst, dst.prefix))) {
          const lo = toInt(route.dst), hi = lo + blockSize(route.prefix);
          if (lo > start && lo < end) bounds.add(lo);
          if (hi > start && hi < end) bounds.add(hi);
        }
        return [...bounds].every(sample => {
          const row = selected(fromInt(sample));
          return row && !row.code && net.devices.some(d => d.id === dst.deviceId && d.interfaces.some(f => f.segmentId === row.segmentId && f.address?.ip === row.via));
        });
      });
      break;
    case 'distance-order': {
      const rows = table().filter(r => r.type === 'static' && r.dst === objective.dst && r.prefix === objective.prefix);
      const primary = rows.find(r => r.via === objective.primaryVia), backup = rows.find(r => r.via === objective.backupVia);
      ok = !!primary && !!backup && (backup.distance ?? 1) > (primary.distance ?? 1);
      break;
    }
    case 'path-via': {
      const probe = probes.find(p => p.id === objective.probeId && p.scenarioId === (objective.scenarioId ?? null));
      params.probeId = objective.probeId;
      params.scenarioId = objective.scenarioId ?? null;
      params.deviceId = objective.deviceId;
      ok = !!probe?.ok && probe[objective.direction ?? 'request'].hops.some(h => h.deviceId === objective.deviceId);
      const leg = probe?.[objective.direction ?? 'request'];
      const expected = net.devices.find(d => d.id === objective.deviceId);
      const decision = leg?.hops.find(h => expected?.interfaces.some(f => net.devices.find(d => d.id === h.deviceId)?.interfaces.some(i => i.segmentId === f.segmentId)));
      params.repairRouter = decision?.deviceId ?? leg?.hops[0]?.deviceId;
      params.actual = leg?.hops.find(h => net.devices.find(d => d.id === h.deviceId)?.kind === 'isp')?.deviceId;
      code = 'wrong-path';
      break;
    }
  }
  return { id: objective.id, scenarioId: objective.scenarioId ?? null, severity: objective.severity, ok, code: ok ? 'ok' : code, params };
}

/** Every configurable router, including those outside the probe paths, must
 * terminate unknown traffic in every scenario. ISP tables are boundary data.
 * Keep only topology IDs and sizes: safety evidence never reveals addresses.
 */
export function assessUnknownSpace(net, answer, scenarios) {
  const pieces = unknownSpace(net);
  return (scenarios.length ? scenarios : [{ id: null, downLinks: [] }]).flatMap(scenario =>
    net.devices.filter(d => d.kind === 'router').map(device => {
      const missing = coverSpace(net, answer, device.id, pieces, { internet: true, downLinks: scenario.downLinks })
        .filter(piece => ['loop', 'ttl-exceeded', 'unsupported-ecmp'].includes(piece.code));
      return { id: `unknown-space:${scenario.id ?? 'normal'}:${device.id}`, type: 'unknown-space',
        scenarioId: scenario.id, severity: 'blocks', ok: !missing.length,
        code: !missing.length ? 'ok' : missing[0].code === 'unsupported-ecmp' ? 'unsupported-ecmp' : 'unknown-space-loops',
        params: { routerId: device.id, missing, repairRouter: missing[0]?.cycle?.[0] ?? missing[0]?.deviceId,
          nextDeviceId: missing[0]?.cycle?.[1] ?? missing[0]?.nextDeviceId } };
    }));
}
