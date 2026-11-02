import { label, vendors } from './model.js';

/** Commands per switch. Answers use stable port IDs; topology supplies labels.
 * No parsing of command text: the forms edit structured vendor-shaped values. */
export function render(answer, syntax, topology) {
  if (!vendors.includes(syntax)) throw new RangeError('invalid-config');
  return Object.fromEntries(Object.entries(answer ?? {}).map(([device, config]) => {
    const name = port => topology ? label(topology, device, port, syntax) : port;
    const lines = [];
    const portEntries = Object.entries(config.ports ?? {}).sort(([a], [b]) => name(a).localeCompare(name(b), 'en', { numeric: true }));
    if (syntax === 'cisco') {
      for (const vid of config.vlans ?? []) lines.push(`vlan ${vid}`);
      // A port with no mode yet has nothing to configure: no bare `interface` stanza.
      for (const [port, p] of portEntries) {
        if (p.mode === 'access') lines.push(`interface ${name(port)}`, ' switchport mode access', ` switchport access vlan ${p.vlan}`);
        if (p.mode === 'trunk') {
          lines.push(`interface ${name(port)}`, ' switchport mode trunk', ' switchport nonegotiate', ` switchport trunk allowed vlan ${p.allowed === 'all' ? 'all' : p.allowed?.length ? p.allowed.join(',') : 'none'}`);
          if (p.native != null && p.native !== 1) lines.push(` switchport trunk native vlan ${p.native}`);
        }
      }
    } else {
      lines.push('/interface bridge add name=bridge1 frame-types=admit-only-vlan-tagged vlan-filtering=no');
      for (const [port, p] of portEntries) lines.push(`/interface bridge port add bridge=bridge1 interface=${name(port)} pvid=${p.pvid ?? 1} frame-types=${p.frameTypes ?? 'admit-all'}`);
      // Rows may overlap, including multi-VID rows. Union explicit membership
      // per VID before emitting commands; dynamic PVID entries remain dynamic.
      const rows = new Map();
      for (const row of config.vlans ?? []) for (const vid of row.vids ?? []) {
        if (!rows.has(vid)) rows.set(vid, { tagged: new Set(), untagged: new Set() });
        for (const kind of ['tagged', 'untagged']) {
          for (const port of row[kind] ?? []) rows.get(vid)[kind].add(port);
        }
      }
      for (const [vid, row] of rows) {
        const tagged = [...row.tagged].map(name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(',');
        const untagged = [...row.untagged].map(name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(',');
        lines.push(`/interface bridge vlan add bridge=bridge1 vlan-ids=${vid}`
          + (tagged ? ` tagged=${tagged}` : '') + (untagged ? ` untagged=${untagged}` : ''));
      }
      lines.push(`/interface bridge set bridge1 vlan-filtering=${config.filtering ? 'yes' : 'no'}`);
    }
    return [device, lines.join('\n')];
  }));
}
