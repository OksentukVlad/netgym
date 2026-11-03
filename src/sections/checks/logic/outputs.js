import { network, prefixToMask } from '../../../engine/ip.js';
import { portsFor, routingTable } from '../../dhcp/logic/client.js';
import { routingTable as forwardTable } from '../../../engine/forward.js';
import { clientState, networkState } from './probes.js';

export const profile = Object.freeze({ windows: 'Windows 11 (en)', routeros: '7.16', width: 40, lines: 10,
  // Teaching profile: one adapter; dot leaders replaced with " : "; lease
  // date only; repeated ping requests omitted; table columns reflowed into
  // panels/continuations. No semantic field or tracert probe slot is dropped.
  sources: {
    windows: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/',
    routes: 'https://help.mikrotik.com/docs/spaces/ROS/pages/328084/IP+Routing#IPRouting-HardwareOffloadedRoute',
    addresses: 'https://manual.mikrotik.com/docs/cli-reference/ip/address/',
    interfaces: 'https://help.mikrotik.com/docs/spaces/ROS/pages/139526175/Interface+stats+and+monitor-traffic',
    connections: 'https://manual.mikrotik.com/docs/cli-reference/ip/firewall/connection/',
    nat: 'https://www.cisco.com/c/en/us/support/docs/ip/network-address-translation-nat/4606-8.html',
  },
});

/** Stable semantic IDs survive wrapping; continuation IDs use :2, :3.
 * No ellipsis or silent truncation. Unsupported large inputs fail the budget
 * rather than silently removing evidence. Commands are captions, not lines. */
export function terminal(command, rows) {
  const lines = [];
  for (const [id, raw] of rows) {
    let rest = String(raw), part = 1;
    do {
      let cut = Math.min(profile.width, rest.length);
      if (rest.length > profile.width) {
        const space = rest.lastIndexOf(' ', profile.width);
        if (space > 0) cut = space;
      }
      lines.push({ id: part === 1 ? id : `${id}:${part}`, key: id, text: rest.slice(0, cut) });
      rest = rest.slice(cut).trimStart(); part++;
    } while (rest.length);
  }
  if (lines.length > profile.lines) throw new RangeError(`checks-output-budget:${command}:${lines.length}`);
  if (new Set(lines.map(l => l.id)).size !== lines.length) throw new RangeError('duplicate-checks-line-id');
  return { command, lines, text: lines.map(l => l.text).join('\n') };
}
export const lineIds = (output, keys) => output.lines.filter(l => keys.includes(l.key)).map(l => l.id);

export function ipconfig(state) {
  const c = state.topology ? clientState(state) : state;
  if (!c.linkUp) return terminal('ipconfig /all', [['adapter', `Ethernet adapter ${c.interface}:`], ['media', 'Media State : Media disconnected']]);
  const rows = [['adapter', `Ethernet adapter ${c.interface}:`], ['address', `IPv4 Address : ${c.address}`],
    ['mask', `Subnet Mask : ${prefixToMask(c.prefix) ?? ''}`], ['gateway', `Default Gateway : ${c.gateway ?? ''}`],
    ['dhcp-enabled', `DHCP Enabled : ${c.dhcpEnabled ? 'Yes' : 'No'}`]];
  if (c.dhcpServer) rows.push(['dhcp-server', `DHCP Server : ${c.dhcpServer}`]);
  rows.push(['dns', `DNS Servers : ${c.dns[0] ?? ''}`]);
  if (c.dns[1]) rows.push(['dns-2', `              ${c.dns[1]}`]);
  if (c.leaseObtained) rows.push(['lease', `Lease Obtained : ${c.leaseObtained}`]);
  return terminal('ipconfig /all', rows);
}
export function ping(result, vendor = 'windows') {
  const { destination: ip, outcome, reporter } = result;
  if (vendor === 'routeros' || vendor === 'mikrotik') {
    const status = outcome === 'reply' ? `${ip} 56 64 1ms` : `${ip} ${outcome === 'unreachable' ? 'host unreachable' : 'timeout'}`;
    return terminal(`/ping ${ip} count=1`, [['columns', 'SEQ HOST SIZE TTL TIME STATUS'], ['result', `0 ${status}`],
      ['summary', `sent=1 received=${outcome === 'reply' ? 1 : 0} packet-loss=${outcome === 'reply' ? 0 : 100}%`]]);
  }
  if (vendor === 'cisco') return terminal(`ping ${ip}`, [['request', 'Sending 5, 100-byte ICMP Echos to'], ['target', `${ip}, timeout is 2 seconds:`],
    ['result', outcome === 'reply' ? '!!!!!' : outcome === 'unreachable' ? 'UUUUU' : '.....'],
    ['summary', `Success rate is ${outcome === 'reply' ? '100 percent (5/5)' : '0 percent (0/5)'}`]]);
  if (vendor !== 'windows') throw new RangeError('invalid-checks-vendor');
  // Windows counts ICMP unreachable messages as received packets; they still
  // do not establish an Echo Reply. Claims select the result, not summary.
  const received = ['reply', 'unreachable'].includes(outcome) ? 4 : 0;
  return terminal(`ping ${ip}`, [['request', `Pinging ${ip} with 32 bytes of data:`],
    ['result', outcome === 'reply' ? `Reply from ${ip}: bytes=32 time<1ms TTL=64`
      : outcome === 'unreachable' ? `Reply from ${reporter}: Destination host unreachable.` : 'Request timed out.'],
    ['summary', `Packets: Sent = 4, Received = ${received},`], ['loss', `Lost = ${4 - received} (${received ? 0 : 100}% loss)`]]);
}
export function tracert(result) {
  if (result.hops.length > 4 || result.hops.some(h => h.slots.length !== 3)) throw new RangeError('invalid-checks-tracert');
  const rows = [['target', `Tracing route to ${result.destination}`]];
  for (const h of result.hops) {
    rows.push([`hop-${h.ttl}-slots`, `${h.ttl}  ${h.slots.map(r => ['reply', 'ttl-expired'].includes(r.outcome) ? '<1 ms' : '*').join('  ')}`],
      [`hop-${h.ttl}-address`, h.slots.some(r => r.outcome === 'unreachable')
        ? `${h.address} reports: Destination host unreachable.` : `   ${h.address ?? 'Request timed out.'}`]);
  }
  if (result.ok) rows.push(['complete', 'Trace complete.']);
  return terminal(`tracert -d ${result.destination}`, rows);
}
export function nslookup(result) {
  const rows = [['server', `Server: ${result.resolverName}`], ...(result.resolver ? [['resolver', `Address: ${result.resolver}`]] : [])];
  if (result.outcome === 'timeout') rows.push(['result', 'DNS request timed out.'], ['name', `Query: ${result.name}`]);
  else if (result.outcome === 'nxdomain') rows.push(['name', `*** ${result.name}:`], ['result', 'Non-existent domain']);
  else rows.push(['name', `Name: ${result.answerName ?? result.name}`], ['answer', `Address: ${result.address}`]);
  return terminal(`nslookup ${result.name}`, rows);
}
export function ssh(result, user = 'netadmin') {
  const rows = [['target', `Connecting to ${result.destination}:22`]];
  if (result.outcome === 'host-key') rows.push(['key', 'The authenticity of host'], ['host', `${result.destination} cannot be established.`],
    ['fingerprint', 'ED25519 key fingerprint is SHA256:...'], ['result', 'Continue connecting (yes/no)?']);
  else rows.push(['result', result.outcome === 'authenticated' ? 'Authenticated using "password".'
    : ['denied', 'ssh-denied'].includes(result.outcome) ? 'Access denied'
      : result.outcome === 'refused' ? 'Connection refused' : 'Connection timed out']);
  return terminal(`ssh ${user}@${result.destination}`, rows);
}
export function http(result) {
  const rows = [['request', `GET http://${result.name}/`]];
  if (result.outcome === 'ok') rows.push(['status', 'HTTP/1.1 200 OK'], ['body', '<html>Example page</html>']);
  else if (result.outcome === 'http-error') rows.push(['status', 'HTTP/1.1 503 Service Unavailable']);
  else rows.push(['result', result.outcome === 'dns-failure' ? 'curl: (6) Could not resolve host' : result.outcome === 'refused' ? 'curl: (7) Failed to connect' : 'curl: (28) Connection timed out']);
  return terminal(`curl -i http://${result.name}/`, rows);
}

/** RouterOS 7.16 TAUGHT subsets, per spec v2.1. These are not complete
 * release flag dictionaries. Routes D/A/c/s (lowercase c,s), address X/D
 * (I invalid/S slave exist but never occur here), interface R/X, connection
 * lowercase s=srcnat (uppercase S means seen-reply, not source NAT).
 * Sources are profile.sources.routes/addresses/interfaces/connections.
 * Current CLI reference identifies itself as 7.26; it corroborates field
 * semantics, not a captured 7.16 session. See ../FORMAT-SOURCES.md. */
const rosVendor = vendor => vendor === 'cisco' ? 'cisco' : 'routeros';
/** The rows each router table prints; grading reads these same rows. */
export function interfaceRows(s, vendor = s.vendor) {
  const t = s.topology, p = portsFor(s.dhcp);
  const bankInterfaces = s.networkModel?.devices.find(d => d.interfaces.some(f => f.address?.ip === s.pc.gateway))?.interfaces;
  return s.interfaceStates ?? bankInterfaces?.map(f => ({ name: f.labels?.[rosVendor(vendor)] ?? f.id, address: f.address?.ip, up: !s.downLinks.includes(f.segmentId), protocol: !s.downLinks.includes(f.segmentId) })) ?? [{ name: p.lan, address: t.router, up: true, protocol: true }, { name: p.wan, address: t.wan, up: true, protocol: true }];
}
export function interfaces(s, vendor = s.vendor) {
  const rows = [], states = interfaceRows(s, vendor);
  const ros = vendor === 'routeros' || vendor === 'mikrotik';
  if (ros) {
    rows.push(['flags', 'Flags: R - running; X - disabled'], ['columns', '# NAME TYPE']);
    for (const [i, f] of states.entries()) rows.push([`interface-${i}`, `${i} ${f.disabled ? 'X' : f.up ? 'R' : ' '} ${f.name} ${f.name.startsWith('bridge') ? 'bridge' : 'ether'}`]);
  } else {
    rows.push(['columns', 'Interface IP-Address Status Protocol']);
    for (const [i, f] of states.entries()) rows.push([`interface-${i}`, `${f.name} ${f.address ?? 'unassigned'} ${f.disabled ? 'administratively down' : f.up ? 'up' : 'down'} ${f.protocol ? 'up' : 'down'}`]);
  }
  return terminal(ros ? '/interface print' : 'show ip interface brief', rows);
}
export function addresses(s) {
  const p = portsFor(s.dhcp), t = s.topology;
  const data = s.addressStates ?? [{ address: t.router, prefix: t.prefix, interface: p.lan }, { address: t.wan, prefix: t.wanPrefix, interface: p.wan, dynamic: true }];
  return terminal('/ip address print', [['flags', 'Flags: X - disabled; D - dynamic'], ['columns', '# ADDRESS NETWORK INTERFACE'],
    ...data.flatMap((f, i) => [[`address-${i}`, `${i} ${f.disabled ? 'X' : f.dynamic ? 'D' : ' '} ${f.address}/${f.prefix}`], [`network-${i}`, `  ${network(f.address, f.prefix)} ${f.interface}`]])]);
}
const attachedRouter = s => s.networkModel ? networkState(s).net.devices.find(d => d.interfaces.some(f => f.address?.ip === s.pc.gateway)) : null;
export function routeRows(s) {
  const state = s.networkModel ? networkState(s) : null, router = attachedRouter(s);
  return state ? forwardTable(state.net, state.routes, router.id, { downLinks: s.downLinks }).map(r => ({ network: r.dst, prefix: r.prefix,
    source: r.type === 'connected' ? 'connected' : 'static', gateway: r.via, interface: r.egressId, distance: r.distance ?? (r.type === 'connected' ? 0 : 1) })) : routingTable(s.config, s.dhcp);
}
export function routes(s, vendor = s.vendor) {
  const ros = vendor === 'routeros' || vendor === 'mikrotik', rows = [];
  const router = attachedRouter(s), table = routeRows(s);
  const def = table.find(r => r.prefix === 0);
  if (ros) {
    rows.push(['flags', 'Flags: D - dynamic; A - active;'], ['flags-types', 'c - connect; s - static'], ['columns', 'DST-ADDRESS GATEWAY DISTANCE']);
    for (const [i, r] of table.entries()) rows.push([r.prefix === 0 ? 'default' : `route-${i}`,
      `${r.source === 'connected' ? 'DAc' : r.source === 'dhcp' ? 'DA' : 'As'} ${r.network}/${r.prefix}`],
    [r.prefix === 0 ? 'default-next' : `next-${i}`, `  ${r.gateway ?? r.interface} ${r.distance ?? 1}`]);
  } else {
    rows.push(['last-resort', def ? `Gateway of last resort is ${def.gateway}` : 'Gateway of last resort is not set']);
    for (const [i, r] of table.entries()) {
      rows.push([r.prefix === 0 ? 'default' : `route-${i}`, `${r.source === 'connected' ? 'C' : r.prefix === 0 ? 'S*' : 'S'} ${r.network}/${r.prefix}`],
        [r.prefix === 0 ? 'default-next' : `next-${i}`, r.source === 'connected' ? `  directly connected, ${r.interface}` : `  [${r.distance ?? 1}/0] via ${r.gateway}`]);
      if (r.source === 'connected') rows.push([`local-${i}`, `L ${router ? router.interfaces.find(f => f.id === r.interface)?.address?.ip : r.interface === portsFor(s.dhcp).lan ? s.topology.router : s.topology.wan}/32`]);
    }
  }
  return terminal(ros ? '/ip route print' : 'show ip route', rows);
}
export function bindingRows(s) {
  const c = clientState(s);
  // A failed allocation creates no bound row. Waiting is shown only for an
  // explicitly configured unused/static lease, never invented from failure.
  const leases = s.leaseStates ?? [...s.dhcp.leases.map(l => ({ ...l, status: 'bound' })),
    ...(c.acquired ? [{ address: c.address, clientId: s.dhcp.failingPc, status: 'bound' }] : [])];
  return [...new Map(leases.map(l => [l.clientId ?? l.address, l])).values()];
}
export function bindings(s, vendor = s.vendor) {
  const ros = vendor === 'routeros' || vendor === 'mikrotik', unique = bindingRows(s);
  const rows = [["columns", ros ? 'ADDRESS MAC-ADDRESS STATUS' : 'IP address Client-ID / Lease / Type']];
  for (const [i, lease] of unique.entries()) {
    const suffix = i === 0 ? '' : `-${i}`;
    rows.push([`binding${suffix}`, `${lease.address} ${ros ? `02:00:00:00:00:${String(i + 1).padStart(2, '0')}` : `0102.0000.0000.${String(i + 1).padStart(2, '0')}`}`],
      [ros ? `status${suffix}` : `lease${suffix}`, ros ? `status=${lease.status}` : 'Nov 04 2026 09:00 AM Automatic']);
  }
  return terminal(ros ? '/ip dhcp-server lease print' : 'show ip dhcp binding', rows);
}
export function nat(entries = [], vendor = 'cisco') {
  const ros = vendor === 'routeros' || vendor === 'mikrotik', e = entries.filter(e => ros || e.srcnat !== false).at(-1);
  // One most-recent flow per teaching panel; callers keep cumulative state
  // separately and choose a flow. Entries with srcnat:false model a bare
  // connection and deliberately do not print the s flag.
  if (ros) {
    // 7.16 prints TCP/UDP endpoints as address:port tuples (separate port
    // fields arrived in 7.20). ICMP has no ports: bare addresses plus the
    // Echo identifier (icmp-id), never a fabricated port.
    const rows = [['flags', 'Flags: s - srcnat']];
    const at = x => e.protocol === 'icmp' ? x.address : `${x.address}:${x.port}`;
    if (e) rows.push(['entry', `0 ${e.srcnat === false ? ' ' : 's'} protocol=${e.protocol}`], ['src', `src-address=${at(e.inside)}`],
      ['dst', `dst-address=${at(e.remote)}`], ['reply-src', `reply-src-address=${at(e.remote)}`],
      ['reply-dst', `reply-dst-address=${at(e.srcnat === false ? e.inside : e.outside)}`],
      ...(e.protocol === 'icmp' ? [['icmp-id', `icmp-id=${e.inside.port}`]] : []));
    return terminal('/ip firewall connection print detail', rows);
  }
  // IOS's four columns retained in two narrow panels, not collapsed into
  // an ambiguous "outside" address. Continuations preserve full tuples.
  const ep = x => `${x.address}:${x.port}`;
  return terminal('show ip nat translations', [['inside-columns', 'Pro Inside global / Inside local'],
    ...(e ? [['inside-global', `${e.protocol} ${ep(e.outside)}`], ['inside-local', `    ${ep(e.inside)}`]] : []),
    ['outside-columns', 'Outside local / Outside global'],
    ...(e ? [['outside-local', ep(e.outsideLocal ?? e.remote)], ['outside-global', ep(e.remote)]] : [])]);
}
