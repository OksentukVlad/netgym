import { compileCisco, compileRouterOS, object, validVid } from './l2.js';
import { parseIp, parsePrefix, role, overlaps } from './ip.js';

const only = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
const validAddress = a => object(a) && parseIp(a.ip) === a.ip && parsePrefix(a.prefix) === a.prefix;

function ciscoSubinterface(device, config, row) {
  const iface = `${row.parent}.${row.number}`;
  const parentLabel = device.ports.find(p => p.id === row.parent)?.label.cisco ?? row.parent;
  return {
    id: `${device.id}:${iface}`, iface, label: `${parentLabel}.${row.number}`,
    port: row.parent, vid: row.vid, ip: row.ip, prefix: row.prefix,
    up: config.interfaces[row.parent]?.up === true,
  };
}

// Physical references use internal IDs; declared VLAN names have their own
// namespace and win when an address reference happens to equal a port ID.
function routerOSAddress(device, vlanIfs, routes, address, index) {
  const vlan = vlanIfs.find(v => v?.name === address.iface);
  const physical = device.ports.find(p => p.id === address.iface);
  if (!vlan && !physical) return null;
  return {
    id: `${device.id}:${address.iface}:${index}`, iface: address.iface,
    label: vlan ? address.iface : physical.label.routeros,
    port: vlan ? vlan.on === 'bridge1' ? 'bridge' : vlan.on : physical.id,
    vid: vlan?.vid ?? null, ip: address.ip, prefix: address.prefix,
    up: true, gateway: routes[0]?.gateway ?? null,
  };
}

/** Vendor-shaped forms -> the shared L2 tables and L3 attachments. No task
 * goals/reference are available here. Wrong VLAN networks and slave VLANs
 * remain behavioural failures; only rejected/invalid forms block compilation. */
export function compileL3(topology, answer, syntax, { gateways = [] } = {}) {
  const tables = {}, findings = [], attachments = [];
  const add = (code, entity, field = '', params = {}, severity = 'blocks') => findings.push({ code, severity, entity, field, params });
  if (!['cisco', 'routeros'].includes(syntax) || !object(answer)) return { topology: { ...topology, attachments }, tables, findings: [{ code: 'invalid-config', severity: 'blocks' }] };
  const devices = topology.devices.filter(d => d.kind !== 'host');
  for (const id of Object.keys(answer)) if (!devices.some(d => d.id === id)) add('unknown-interface', id);
  for (const d of devices) {
    const c = answer[d.id], physical = p => d.ports.some(port => port.id === p);
    const attach = (a, field) => {
      // An address typed without its mask: say so, rather than calling it unusable.
      if (object(a) && parseIp(a.ip) === a.ip && (a.prefix === null || a.prefix === undefined)) { add('missing-prefix', d.id, field); return; }
      if (!validAddress(a)) { add('invalid-address', d.id, field); return; }
      // /31 (RFC 3021) and /32 have no network or broadcast address to avoid.
      if (a.prefix < 31 && role(a.ip, a.ip, a.prefix) !== 'host') add('unusable-address', d.id, field);
      attachments.push({ ...a, device: d.id });
    };
    if (!object(c)) { add('invalid-config', d.id); continue; }
    if (syntax === 'cisco') {
      if (d.kind === 'router') {
        if (!only(c, ['interfaces', 'subifs']) || !object(c.interfaces) || !Array.isArray(c.subifs)) { add('invalid-config', d.id); continue; }
        for (const [p, v] of Object.entries(c.interfaces)) {
          if (!physical(p)) add('unknown-interface', d.id, `interfaces.${p}`);
          if (!only(v, ['up', 'ip', 'prefix']) || typeof v.up !== 'boolean') { add('invalid-config', d.id, `interfaces.${p}`); continue; }
          if (v.ip) attach({ id: `${d.id}:${p}`, port: p, iface: p, label: d.ports.find(port => port.id === p)?.label.cisco ?? p, vid: null, ...v }, `interfaces.${p}`);
        }
        const encap = new Set(), names = new Set();
        c.subifs.forEach((v, i) => {
          const field = `subifs.${i}`;
          if (!only(v, ['parent', 'number', 'vid', 'ip', 'prefix'])) { add('invalid-config', d.id, field); return; }
          if (!physical(v.parent)) add('unknown-interface', d.id, `${field}.parent`);
          if (!Number.isInteger(v.number) || v.number < 1 || v.number > 4294967295) add('invalid-config', d.id, `${field}.number`);
          const name = `${v.parent}.${v.number}`, key = `${v.parent}:${v.vid}`;
          if (names.has(name)) add('duplicate-interface', d.id, field); names.add(name);
          if (!validVid(v.vid)) { add(v.ip && v.vid == null ? 'missing-encapsulation' : 'bad-vid', d.id, `${field}.vid`); return; }
          if (encap.has(key)) add('duplicate-encapsulation', d.id, `${field}.vid`); encap.add(key);
          attach(ciscoSubinterface(d, c, v), field);
        });
      } else {
        if (!only(c, ['vlans', 'ports', 'svi', 'defaultGateway'])) { add('invalid-config', d.id); continue; }
        const result = compileCisco({ vlans: c.vlans, ports: c.ports });
        tables[d.id] = result.table;
        findings.push(...result.findings.map(f => ({ ...f, entity: d.id })));
        for (const p of Object.keys(c.ports ?? {})) if (!physical(p)) add('unknown-interface', d.id, `ports.${p}`);
        if (c.svi) {
          if (!only(c.svi, ['vid', 'ip', 'prefix']) || !validVid(c.svi.vid)) add('invalid-config', d.id, 'svi');
          else attach({ ...c.svi, id: `${d.id}:svi`, iface: `vlan${c.svi.vid}`, label: `Vlan${c.svi.vid}`, port: 'svi', gateway: c.defaultGateway || null, up: true }, 'svi');
        }
        if (c.defaultGateway && parseIp(c.defaultGateway) !== c.defaultGateway) add('invalid-address', d.id, 'defaultGateway');
      }
    } else {
      if (!only(c, ['filtering', 'ports', 'vlans', 'vlanIfs', 'addresses', 'routes'])
        || !Array.isArray(c.vlanIfs) || !Array.isArray(c.addresses) || (c.routes !== undefined && !Array.isArray(c.routes))) { add('invalid-config', d.id); continue; }
      if (c.ports !== undefined || d.kind === 'switch') {
        const result = compileRouterOS({ filtering: c.filtering, ports: c.ports, vlans: c.vlans }, {
          bridge: true, vlanIfs: c.vlanIfs, dynamicBridgeTagged: d.dynamicBridgeTagged === true,
        });
        tables[d.id] = result.table;
        findings.push(...result.findings.map(f => ({ ...f, entity: d.id })));
        for (const p of Object.keys(c.ports ?? {})) if (!physical(p)) add('unknown-interface', d.id, `ports.${p}`);
      }
      const names = new Set(), physicalNames = new Set(d.ports.map(p => p.label.routeros));
      c.vlanIfs.forEach((v, i) => {
        if (!only(v, ['name', 'vid', 'on']) || typeof v.name !== 'string' || !v.name.trim() || /[\x00-\x1f\x7f]/.test(v.name)) { add('invalid-config', d.id, `vlanIfs.${i}`); return; }
        if (names.has(v.name) || physicalNames.has(v.name) || v.name === 'bridge1') add('duplicate-interface', d.id, `vlanIfs.${i}.name`);
        names.add(v.name);
        if (!validVid(v.vid)) add('bad-vid', d.id, `vlanIfs.${i}.vid`);
        if (!(physical(v.on) || (v.on === 'bridge1' && tables[d.id]))) add('unknown-interface', d.id, `vlanIfs.${i}.on`);
      });
      const routes = c.routes ?? [];
      for (const [i, r] of routes.entries()) if (!only(r, ['dst', 'gateway']) || r.dst !== '0.0.0.0/0' || parseIp(r.gateway) !== r.gateway) add('invalid-config', d.id, `routes.${i}`);
      c.addresses.forEach((a, i) => {
        if (!only(a, ['ip', 'prefix', 'iface'])) { add('invalid-config', d.id, `addresses.${i}`); return; }
        const attachment = routerOSAddress(d, c.vlanIfs, routes, a, i);
        if (!attachment) { add('unknown-interface', d.id, `addresses.${i}.iface`); return; }
        attach(attachment, `addresses.${i}`);
      });
    }
  }
  const seen = new Set(topology.hosts.map(h => h.ip));
  for (const a of attachments) {
    if (seen.has(a.ip)) add('address-collision', a.device, a.id, { ip: a.ip });
    seen.add(a.ip);
    // A management host cannot take a gateway disclosed in the task, even if
    // the student has not configured the router interface yet.
    if (topology.devices.find(d => d.id === a.device)?.kind !== 'router'
      && (gateways.includes(a.ip) || topology.hosts.some(h => h.gateway === a.ip))) add('address-collision', a.device, a.id, { ip: a.ip });
  }
  for (const d of devices.filter(d => d.kind === 'router')) {
    const own = attachments.filter(a => a.device === d.id);
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) if (overlaps(own[i].ip, own[i].prefix, own[j].ip, own[j].prefix)) add('overlapping-networks', d.id, own[j].id);
  }
  const devicesWithState = topology.devices.map(d => syntax === 'cisco' && d.kind === 'router'
    ? { ...d, ports: d.ports.map(p => ({ ...p, up: answer[d.id]?.interfaces?.[p.id]?.up === true })) } : d);
  return { topology: { ...topology, devices: devicesWithState, attachments }, tables, findings };
}
