import { objectiveTypes, validateNetwork } from './network.js';
import { validateRoute } from './route-validation.js';
import { isNetworkAddress, parseIp } from './ip.js';
import * as cisco from './vendors/cisco.js';
import * as routeros from './vendors/routeros.js';

/** Validate records and both vendor representations; return issues, never mutate. */
export function validateBank(records) {
  const issues = [], ids = new Set(), codes = new Set();
  for (const record of records) {
    const add = (code, entity = record.id) => issues.push({ code, entity });
    if (!record.id || ids.has(record.id)) add('duplicate-task-id');
    ids.add(record.id);
    issues.push(...validateNetwork(record.network).map(issue => ({ ...issue, taskId: record.id })));
    const net = record.network;
    const devices = new Set(net.devices.map(d => d.id));
    const segments = new Set(net.segments.map(s => s.id));
    const locations = new Set([...net.endpoints.map(e => e.id), ...net.endpoints.map(e => e.ip), ...net.devices.flatMap(d => d.interfaces.flatMap(f => [f.id, f.address?.ip]))].filter(Boolean));
    const prefix = p => p && isNetworkAddress(p.dst, p.prefix) && parseIp(p.dst) === p.dst;
    const probeIds = new Set(), scenarioIds = new Set();
    for (const probe of record.probes ?? []) {
      if (!probe.id || probeIds.has(probe.id) || !locations.has(probe.from) || !locations.has(probe.to)) add('invalid-probe', probe.id);
      probeIds.add(probe.id);
      if (!probe.coverage || !['from', 'to'].every(key => probe.coverage[key] === null || prefix(probe.coverage[key]))) add('invalid-probe-coverage', probe.id);
    }
    if (!probeIds.size) add('missing-probes');
    for (const scenario of record.scenarios ?? []) {
      if (!scenario.id || scenarioIds.has(scenario.id) || !Array.isArray(scenario.downLinks) || scenario.downLinks.some(id => !segments.has(id))
        || !Array.isArray(scenario.probeIds) || !scenario.probeIds.length || new Set(scenario.probeIds).size !== scenario.probeIds.length || scenario.probeIds.some(id => !probeIds.has(id))) add('invalid-scenario', scenario.id);
      scenarioIds.add(scenario.id);
    }
    if (!scenarioIds.size || [...probeIds].some(id => !record.scenarios.some(s => s.probeIds?.includes(id)))) add('missing-scenario-probes');
    const demoIds = new Set();
    for (const demo of record.demonstrations ?? []) {
      if (!demo.id || demoIds.has(demo.id) || probeIds.has(demo.id) || !locations.has(demo.from) || !(locations.has(demo.to) || parseIp(demo.to) === demo.to)) add('invalid-demonstration', demo.id);
      demoIds.add(demo.id);
    }
    const variants = new Set();
    for (const variant of record.variants) {
      if (!variant.id || variants.has(variant.id)) add('duplicate-variant-id');
      variants.add(variant.id);
      if (!variant.code || codes.has(variant.code)) add('duplicate-variant-code');
      codes.add(variant.code);
      const objectives = new Set();
      for (const o of variant.objectives ?? []) {
        if (!o.id || objectives.has(o.id) || !objectiveTypes.includes(o.type) || !['blocks', 'advice'].includes(o.severity)
          || 'draft' in o || typeof o.justification !== 'string' || !o.justification || (o.scenarioId !== null && !scenarioIds.has(o.scenarioId))) add('invalid-objective', o.id);
        objectives.add(o.id);
        if (o.exclude !== undefined && (o.type !== 'internet-coverage' || !Array.isArray(o.exclude) || o.exclude.some(p => !prefix(p)))) add('invalid-objective-exclude', o.id);
        if (['coverage', 'internet-coverage'].includes(o.type)) {
          const scenario = record.scenarios.find(s => s.id === o.scenarioId);
          if (!Array.isArray(o.probeIds) || !o.probeIds.length || o.probeIds.some(id => !scenario?.probeIds?.includes(id))) add('invalid-coverage-objective', o.id);
        } else if (o.type === 'path-via') {
          if (!devices.has(o.deviceId) || !record.scenarios.find(s => s.id === o.scenarioId)?.probeIds?.includes(o.probeId)
            || (o.direction !== undefined && !['request', 'reply'].includes(o.direction))) add('invalid-path-objective', o.id);
        } else {
          if (!net.devices.some(d => d.id === o.routerId && d.kind === 'router')) add('invalid-objective-router', o.id);
          if (['summary', 'specific-to', 'direct-neighbour'].includes(o.type) && (!Array.isArray(o.destinations) || !o.destinations.length
            || o.destinations.some(p => !prefix(p) || (o.type === 'direct-neighbour' && !devices.has(p.deviceId))))) add('invalid-objective-destinations', o.id);
          if (['summary', 'distance-order'].includes(o.type) && !prefix(o)) add('invalid-objective-prefix', o.id);
          if (o.type === 'default-on' && parseIp(o.destination) !== o.destination) add('invalid-objective-destination', o.id);
          if (o.type === 'distance-order' && [o.primaryVia, o.backupVia].some(ip => parseIp(ip) !== ip)) add('invalid-objective-gateway', o.id);
        }
      }
      for (const scenario of record.scenarios ?? []) if (scenario.probeIds.some(id => !(variant.objectives ?? []).some(o => o.type === 'coverage' && o.severity === 'blocks' && o.scenarioId === scenario.id && o.probeIds?.includes(id)))) add('missing-coverage-objective', scenario.id);
      for (const router of new Set([...Object.keys(variant.scaffold ?? {}), ...Object.keys(variant.referenceRoutes)])) {
        const scaffold = variant.scaffold?.[router] ?? [], reference = variant.referenceRoutes[router] ?? [];
        for (let index = 0; index < Math.max(scaffold.length, reference.length); index++) {
          if ((scaffold[index]?.discard === true) !== (reference[index]?.discard === true)) add('scaffold-discard-mismatch', `${router}/${index}`);
        }
      }
      for (const [router, rows] of Object.entries(variant.scaffold ?? {})) {
        if (rows.length !== variant.referenceRoutes[router]?.length) add('scaffold-row-count', router);
        for (const [index, row] of rows.entries()) {
          if (row.discard !== undefined && typeof row.discard !== 'boolean') add('invalid-row-discard', `${router}/${index}`);
          const dest = row.dest;
          if (!dest || !['lan', 'link', 'summary', 'default'].includes(dest.kind) || !Array.isArray(dest.segments)) {
            add('invalid-row-destination', `${router}/${index}`);
            continue;
          }
          if ((dest.kind === 'default' ? dest.segments.length !== 0 : dest.segments.length === 0)
            || new Set(dest.segments).size !== dest.segments.length
            || dest.segments.some(id => !record.network.segments.some(s => s.id === id))) add('invalid-row-segments', `${router}/${index}`);
          if (record.displayNumber === 15 ? !['primary', 'backup'].includes(row.role) : row.role !== undefined) add('invalid-row-role', `${router}/${index}`);
        }
      }
      const routeIds = new Set();
      for (const [deviceId, rows] of Object.entries(variant.referenceRoutes)) {
        if (!record.network.devices.some(d => d.id === deviceId && d.kind === 'router')) add('unknown-router', deviceId);
        for (const route of rows) {
          if (!route.id || routeIds.has(route.id)) add('duplicate-route-id', route.id);
          routeIds.add(route.id);
          for (const vendor of [cisco, routeros]) for (const candidate of [route, ...(route.alternatives ?? []).map(via => ({ ...route, via }))]) {
            // Parse the rendered command's fields, so rendering is validated too.
            const command = vendor.renderRoute(candidate);
            const parts = command.split(' ');
            const fields = vendor === cisco ? { net: parts[2], mask: parts[3], gw: parts[4], dist: parts[5] }
              : { dst: parts[3]?.split('=')[1], ...(parts[4] === 'blackhole' ? { blackhole: true } : { gw: parts[4]?.split('=')[1] }), dist: parts[5]?.split('=')[1] };
            if (validateRoute(net, deviceId, candidate) || !vendor.parseRouteFields(fields).ok) add('invalid-reference-route', route.id);
          }
        }
      }
    }
  }
  return issues;
}
