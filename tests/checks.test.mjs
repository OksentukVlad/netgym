import test from 'node:test';
import assert from 'node:assert/strict';
import { contains, fromInt, toInt } from '../src/engine/ip.js';
import { ping as forwardPing } from '../src/engine/forward.js';
import { validateNetwork } from '../src/engine/network.js';
import { routingExample } from '../src/sections/routing/logic/examples.js';
import { createScenario, createRoutingScenario, clientState, networkState, probe, dnsLookup, httpFetch, traceRoute, l1Faults, l2Faults } from '../src/sections/checks/logic/probes.js';
import * as out from '../src/sections/checks/logic/outputs.js';
import * as ladder from '../src/sections/checks/logic/ladder.js';
import * as claims from '../src/sections/checks/logic/claims.js';
import * as proofs from '../src/sections/checks/logic/proofs.js';
import { modes } from '../src/sections/checks/uk.js';
const vendors = ['cisco', 'routeros'];
const healthy = (vendor = 'cisco', options = {}) => createScenario(7, { level: 2, vendor, faultId: 'healthy', ...options });
function budget(output) {
  assert.ok(output.lines.length <= 10, `${output.command}: ${output.lines.length}`);
  assert.ok(output.lines.every(l => [...l.text].length <= 40), output.text);
  assert.equal(output.text, output.lines.map(l => l.text).join('\n'));
  assert.equal(new Set(output.lines.map(l => l.id)).size, output.lines.length);
}
function routed() {
  const ex = routingExample();
  return createRoutingScenario(ex.task.record, ex.answer, { pcId: 'pc1', destination: '198.51.100.66' });
}
const allRungs = task => ladder.fixedRungs.map(id => ladder.runRung(task, id));

test('checks entry content has frozen C3/C1/C2 order', () => {
  assert.deepEqual(Object.keys(modes), ['proof', 'ladder', 'claims']);
});
test('same subnet works without a default gateway; off-link does not', () => {
  for (const vendor of vendors) {
    const s = healthy(vendor); s.config.dhcp.gateway = '';
    const local = probe(s, { destination: s.topology.router });
    assert.equal(local.onLink, true); assert.equal(local.ok, true); assert.equal(local.nextHop, s.topology.router);
    assert.equal(local.source.address, clientState(s).address); assert.equal(local.source.interface, 'Ethernet');
    assert.equal(local.destination, s.topology.router); assert.equal(local.protocol, 'icmp');
    assert.equal(probe(s, { destination: s.topology.server }).ok, true);
    assert.equal(probe(s).outcome, 'unreachable'); assert.deepEqual(local.natState, []);
  }
});
test('a wrong default does not prevent a ping to the actual on-link router', () => {
  const s = healthy(); s.config.dhcp.gateway = fromInt(toInt(s.topology.network) + 254);
  assert.equal(probe(s, { destination: s.topology.router }).ok, true);
  assert.equal(probe(s).outcome, 'unreachable');
});
test('host mask decides on-link delivery before the routing engine', () => {
  const s = healthy(); s.staticClient = { ...clientState(s), prefix: 8, gateway: null };
  // A public target accidentally classified on-link cannot be reached by
  // letting the routing engine silently use the attached gateway.
  s.staticClient.address = '8.1.1.50';
  const r = probe(s); assert.equal(r.onLink, true); assert.equal(r.outcome, 'unreachable');
  assert.equal(r.delivery.request, null);
  const bad = createScenario(0, { faultId: 'static-mask' });
  assert.equal(probe(bad, { destination: bad.topology.router }).ok, false);
});
test('remote delivery creates correct reversible NAT tuples, without mutation', () => {
  for (const vendor of vendors) {
    const s = healthy(vendor), before = structuredClone(s), r = probe(s);
    assert.equal(r.ok, true); assert.equal(r.delivery.request.ok, true); assert.equal(r.delivery.reply.ok, true);
    assert.equal(r.delivery.ok, true); assert.equal(r.natState.length, 1);
    assert.equal(r.natState[0].inside.address, clientState(s).address);
    assert.equal(r.natState[0].outside.address, s.topology.wan);
    assert.equal(r.delivery.restored.dst.address, clientState(s).address);
    assert.deepEqual(s, before);
    const n = createScenario(0, { level: 2, vendor, faultId: 'nat' });
    assert.equal(probe(n).ok, false); assert.equal(probe(n, { source: 'router' }).ok, true);
    const noRoute = createScenario(0, { level: 2, vendor, faultId: 'route' });
    assert.equal(probe(noRoute, { source: 'router' }).ok, false);
  }
});
test('routing topology adapter retains bidirectional forwarding and return-route failure', () => {
  const s = routed(), { net, routes, pcId } = networkState(s);
  assert.equal(probe(s).ok, forwardPing(net, routes, pcId, s.remoteIp).ok);
  assert.equal(probe(s).ok, true);
  s.networkModel.supplied.R2 = [];
  const r = probe(s); assert.equal(r.delivery.request.ok, true); assert.equal(r.delivery.reply.ok, false); assert.equal(r.ok, false);
  // Independently configured response route table also applies.
  const x = routed(); x.returnRoutes = { R1: [] };
  x.networkModel.supplied.R2 = [];
  assert.equal(probe(x).ok, false);
});
test('healthy one-router scenario is a valid engine network', () => {
  assert.deepEqual(validateNetwork(networkState(healthy()).net), []);
});
test('ICMP can be filtered while delivered SSH succeeds on the same destination', () => {
  for (const vendor of vendors) {
    const s = createScenario(0, { level: 2, vendor, faultId: 'icmp-blocked' });
    assert.equal(probe(s, { destination: s.topology.router }).outcome, 'timeout');
    const ssh = probe(s, { destination: s.topology.router, protocol: 'tcp', service: 'ssh' });
    assert.equal(ssh.delivery.ok, true); assert.equal(ssh.outcome, 'authenticated'); assert.equal(ssh.ok, true);
    s.linkUp = false; assert.equal(probe(s, { destination: s.topology.router, protocol: 'tcp', service: 'ssh' }).ok, false);
    s.linkUp = true; s.config.routing.staticDefault = ''; s.config.routing.dhcpDefault = false;
    assert.equal(probe(s, { destination: s.topology.router, protocol: 'tcp', service: 'ssh' }).ok, true);
  }
});
test('unresponsive hosts and broken return paths prevent services despite success configuration', () => {
  const s = healthy(); s.hosts[s.topology.website] = { responds: false };
  assert.equal(httpFetch(s).ok, false);
  const r = createScenario(0, { level: 2, faultId: 'return-path' });
  const result = probe(r); assert.equal(result.delivery.request.ok, true); assert.equal(result.delivery.ok, false);
  assert.equal(probe(r, { destination: r.topology.router }).ok, true);
  assert.equal(httpFetch(r).ok, false);
});
test('TTL replies have their own filters, slots, and response paths', () => {
  const s = routed(); s.ttlSilent = ['R1'];
  const t = traceRoute(s); assert.equal(t.ok, true); assert.equal(t.hops.length, 3);
  assert.ok(t.hops[0].slots.every(r => r.outcome === 'timeout'));
  assert.ok(t.hops[1].slots.every(r => r.outcome === 'ttl-expired'));
  assert.ok(t.hops[2].slots.every(r => r.outcome === 'reply'));
  assert.equal(probe(s).ok, true);
  s.ttlSilent = []; s.ttlSilentSlots.R1 = [1];
  assert.deepEqual(traceRoute(s).hops[0].slots.map(r => r.outcome), ['ttl-expired', 'timeout', 'ttl-expired']);
  s.ttlReturnBlocked = ['R2']; assert.equal(traceRoute(s).hops[1].slots[0].outcome, 'timeout');
  assert.equal(probe(s).ok, true);
  s.ttlReturnBlocked = []; s.networkModel.supplied.R2 = [];
  assert.equal(probe(s, { ttl: 2 }).outcome, 'timeout');
  assert.throws(() => traceRoute(s, s.remoteIp, { maxHops: 5 }), /budget/);
});
test('expected NXDOMAIN, wrong answer, resolver identity and timeout remain distinct', () => {
  const s = healthy();
  assert.equal(dnsLookup(s).outcome, 'answer'); assert.equal(dnsLookup(s, s.missingName).outcome, 'nxdomain');
  assert.equal(dnsLookup(s, s.missingName).delivery.ok, true);
  s.dnsRecords[s.websiteName] = s.topology.providerDns[1];
  assert.equal(dnsLookup(s).outcome, 'wrong-answer'); assert.equal(dnsLookup(s).ok, true);
  assert.equal(httpFetch(s).outcome, 'refused');
  s.dnsMode = 'timeout'; assert.equal(dnsLookup(s).outcome, 'timeout');
  assert.equal(httpFetch(s).outcome, 'dns-failure');
  const task = ladder.createLadder(2, 'cisco', 0, { faultId: 'healthy' });
  assert.equal(ladder.runRung(task, 'dns', task.scenario.missingName).expected, true);
});
test('every Windows terminal outcome and vendor ping fits the phone budget', () => {
  for (const vendor of vendors) for (const otherAddresses of [false, true]) for (const faultId of l2Faults) {
    const s = createScenario(913, { level: 2, vendor, faultId, otherAddresses });
    budget(out.ipconfig(s)); budget(out.nslookup(dnsLookup(s))); budget(out.ssh(probe(s, { destination: s.topology.router, protocol: 'tcp', service: 'ssh' })));
    budget(out.http(httpFetch(s))); budget(out.tracert(traceRoute(s)));
    for (const format of ['windows', 'cisco', 'routeros']) for (const outcome of ['reply', 'timeout', 'unreachable']) budget(out.ping({ destination: '255.255.255.254', reporter: '192.168.255.254', outcome }, format));
  }
  for (const outcome of ['authenticated', 'denied', 'refused', 'timeout', 'host-key']) {
    const o = out.ssh({ destination: '192.168.255.254', outcome }); budget(o);
    assert.match(o.text, { authenticated: /Authenticated/, denied: /Access denied/, refused: /Connection refused/, timeout: /timed out/, 'host-key': /fingerprint/ }[outcome]);
  }
  for (const outcome of ['ok', 'http-error', 'dns-failure', 'refused', 'timeout']) budget(out.http({ name: 'www.example.com', outcome }));
});
test('Windows profiles preserve fields, reporter and three tracert slots per hop', () => {
  const s = healthy(), config = out.ipconfig(s);
  for (const field of ['IPv4 Address :', 'Subnet Mask :', 'Default Gateway :', 'DHCP Enabled : Yes', 'DHCP Server :', 'DNS Servers :', 'Lease Obtained : 2026-11-03']) assert.ok(config.text.includes(field), field);
  assert.ok(!config.text.includes('. . .'));
  s.linkUp = false; assert.match(out.ipconfig(s).text, /Media disconnected/);
  const u = out.ping({ destination: '8.8.8.8', outcome: 'unreachable', reporter: '192.168.88.1' });
  assert.match(u.text, /Reply from 192.168.88.1/); assert.match(u.text, /Destination\s+host\s+unreachable/);
  const max = { destination: '255.255.255.254', ok: true, hops: Array.from({ length: 4 }, (_, i) => ({ ttl: i + 1, address: '192.168.255.254', slots: [{ outcome: 'ttl-expired' }, { outcome: 'timeout' }, { outcome: 'reply' }] })) };
  const o = out.tracert(max); budget(o); assert.equal(o.lines.length, 10);
  for (const h of max.hops) assert.equal(o.lines.find(l => l.id === `hop-${h.ttl}-slots`).text, `${h.ttl}  <1 ms  *  <1 ms`);
  assert.throws(() => out.terminal('bad', Array.from({ length: 11 }, (_, i) => [String(i), 'x'])), /budget/);
});
test('every router profile: interface states, flags, routes, leases and NAT evidence', () => {
  for (const vendor of vendors) {
    const s = healthy(vendor);
    for (const fn of [out.interfaces, out.routes, out.bindings, out.addresses]) budget(fn(s));
    s.interfaceStates = [{ name: 'g0/1', address: '192.168.255.254', up: false, protocol: false, disabled: true }, { name: 'g0/0', address: '203.0.113.2', up: true, protocol: false }];
    budget(out.interfaces(s));
    assert.match(out.interfaces(s).text, vendor === 'cisco' ? /administratively\s+down/ : /X g0\/1/);
    const entry = probe(s).natState[0];
    for (const entries of [[], [entry], [{ ...entry, srcnat: false }]]) budget(out.nat(entries, vendor));
    const o = out.nat([entry], vendor);
    if (vendor === 'cisco') {
      for (const key of ['inside-global', 'inside-local', 'outside-local', 'outside-global']) assert.ok(o.lines.some(l => l.key === key));
      assert.match(out.routes(s).text, /\nC /); assert.match(out.routes(s).text, /\nL /); assert.match(out.routes(s).text, /\nS\* /);
    } else {
      assert.match(out.routes(s).text, /DAc /); assert.ok(!out.routes(s).text.includes('S - static'));
      assert.match(o.text, /0 s protocol=/); assert.match(o.text, /reply-src-address=/); assert.match(o.text, /reply-dst-address=203.0.113.2/);
      assert.ok(!out.nat([{ ...entry, srcnat: false }], vendor).text.includes('0 s '));
      s.config.routing.dhcpDefault = false; s.config.routing.staticDefault = s.topology.ispGateway;
      assert.match(out.routes(s).text, /As 0.0.0.0\/0/);
      assert.match(out.addresses(s).text, /Flags: X - disabled; D - dynamic/);
      s.addressStates = [{ address: '192.0.2.1', prefix: 24, interface: 'bridge', disabled: true }];
      assert.match(out.addresses(s).text, /0 X 192.0.2.1\/24/);
    }
    s.config.dhcp.enabled = false; budget(out.bindings(s));
    assert.ok(!out.bindings(s).lines.some(l => l.id === 'binding'));
    if (vendor !== 'cisco') {
      s.leaseStates = [{ clientId: 'reserved', address: '192.0.2.50', status: 'waiting' }];
      assert.match(out.bindings(s).text, /status=waiting/);
    }
    s.config.routing.staticDefault = ''; s.config.routing.dhcpDefault = false;
    const noDefault = out.routes(s); budget(noDefault); assert.ok(!noDefault.lines.some(l => l.key === 'default'));
  }
});
test('Cisco outside local/global remain separately represented', () => {
  const e = probe(healthy()).natState[0]; e.outsideLocal = { address: '192.0.2.200', port: 7 };
  const output = out.nat([e]); assert.equal(output.lines.find(l => l.id === 'outside-local').text, '192.0.2.200:7');
  // ICMP keeps its Echo identifier in every column (Cisco's own example).
  assert.equal(output.lines.find(l => l.id === 'outside-global').text, `8.8.8.8:${e.inside.port}`);
});
test('L1 only planted faults; every command/vendor/renumbered combination has bounded outputs', () => {
  for (const vendor of vendors) for (const faultId of l1Faults) for (const otherAddresses of [false, true]) {
    const task = ladder.createLadder(1, vendor, 927, { faultId, otherAddresses });
    assert.deepEqual(ladder.rungs(task).map(r => r.id), ladder.fixedRungs);
    const rows = allRungs(task); rows.forEach(e => { assert.equal(e.ok, true); budget(e.output); assert.ok(!/[✓✗]/.test(e.folded)); });
    assert.ok(rows.some(e => !e.expected), `${vendor}/${faultId}`);
  }
  assert.throws(() => ladder.createLadder(1, 'cisco', 0, { faultId: 'icmp-blocked' }), /fault/);
});
test('L1 Next always advances, last offers Stop only, early/late stop names earliest result', () => {
  const task = ladder.createLadder(1, 'cisco', 0, { faultId: 'link' });
  let state = ladder.startLadder(task);
  const early = ladder.gradeStop(task, state.evidence, 'link'); assert.equal(early.ok, true);
  for (let i = 1; i < 4; i++) { assert.equal(ladder.canAdvance(task, state), true); state = ladder.advance(task, state); assert.equal(state.index, i); }
  assert.equal(ladder.canAdvance(task, state), false); assert.equal(ladder.advance(task, state), state);
  const late = ladder.gradeStop(task, state.evidence, 'link'); assert.equal(late.earliest.id, 'config'); assert.equal(late.stoppedAtEarliest, false); assert.equal(late.placeAccepted, true);
  state = ladder.stopLadder(state); assert.equal(ladder.advance(task, state), state);
  const dns = ladder.createLadder(1, 'cisco', 0, { faultId: 'dns' });
  const one = ladder.startLadder(dns); const result = ladder.gradeStop(dns, one.evidence, 'more');
  assert.equal(result.earliest.id, 'dns'); assert.equal(result.stoppedAtEarliest, false); assert.match(result.foldedNext, /^ping /);
});
test('C1 accepted places use collected evidence, including address/gateway ambiguity', () => {
  const task = ladder.createLadder(1, 'cisco', 0, { faultId: 'static-gateway' });
  const rows = allRungs(task);
  assert.deepEqual(ladder.acceptedPlaces([]), ['link', 'address', 'gateway', 'exit', 'dns', 'more']);
  assert.deepEqual(ladder.acceptedPlaces(rows.slice(0, 2)), ['address', 'gateway', 'more']);
  for (const place of ['address', 'gateway', 'more']) assert.equal(ladder.gradeStop(task, rows.slice(0, 2), place).placeAccepted, true);
  assert.equal(ladder.gradeStop(task, rows.slice(0, 2), 'dns').placeAccepted, false);
  const nat = ladder.createLadder(1, 'cisco', 0, { faultId: 'nat' }), route = ladder.createLadder(1, 'cisco', 0, { faultId: 'route' });
  assert.deepEqual(ladder.acceptedPlaces(allRungs(nat).slice(0, 3)), ['exit']);
  assert.deepEqual(ladder.acceptedPlaces(allRungs(nat).slice(0, 3)), ladder.acceptedPlaces(allRungs(route).slice(0, 3)));
  // Hidden truth and future uncollected evidence must not affect accepted places.
  nat.scenario.faultId = 'dns'; nat.scenario.services.ssh = 'denied';
  assert.deepEqual(ladder.acceptedPlaces(allRungs(nat).slice(0, 3)), ['exit']);
  const link = ladder.createLadder(1, 'cisco', 0, { faultId: 'link' }); assert.deepEqual(ladder.acceptedPlaces(allRungs(link)), ['link']);
});
test('L2 accepts alternative rungs, arguments, service and router evidence', () => {
  for (const vendor of vendors) {
    const task = ladder.createLadder(2, vendor, 0, { faultId: 'icmp-blocked' });
    let state = ladder.startLadder(task);
    state = ladder.chooseRung(task, state, 'ssh', task.scenario.topology.router);
    assert.equal(state.evidence[0].result.outcome, 'authenticated');
    state = ladder.chooseRung(task, state, 'gateway'); assert.equal(state.evidence[1].result.outcome, 'timeout');
    assert.ok(ladder.placeChoices(state.evidence, 2).some(p => p.id === 'service'));
    let traffic = [];
    assert.ok(!ladder.runRung(task, 'nat', undefined, traffic).output.text.includes('51000'));
    traffic.push(ladder.runRung(task, 'remote')); traffic.push(ladder.runRung(task, 'dns'));
    const nat = ladder.runRung(task, 'nat', undefined, traffic); assert.ok(nat.result.entries.length > 0); budget(nat.output);
    for (const r of ladder.rungs(task)) budget(ladder.runRung(task, r.id, undefined, traffic).output);
  }
  for (const [input, kind, value] of [[' 192,0,2,1 ', 'ip', '192.0.2.1'], ['WWW.Example.COM.', 'name', 'www.example.com'], ['gateway', 'name', 'gateway']]) assert.deepEqual(ladder.parseArgument(input), { ok: true, kind, value });
  for (const input of ['', '999.0.0.1', 'ping 8.8.8.8', 'https://example.com', '-bad.example', 'a..b', 'a;id', 'x'.repeat(64)]) assert.equal(ladder.parseArgument(input).ok, false, input);
  const task = ladder.createLadder(2); assert.equal(ladder.runRung(task, 'remote', 'ping 8.8.8.8').code, 'argument');
  assert.equal(ladder.runRung(task, 'unknown').code, 'rung');
});
test('routing topologies expose actual router interfaces/routes and a real observed tracert', () => {
  const ex = routingExample(), task = ladder.createLadder(2, 'cisco', 0, { routing: { record: ex.task.record, routes: ex.answer, pcId: 'pc1', destination: '198.51.100.66' } });
  assert.equal(ladder.runRung(task, 'remote').result.ok, true);
  const o = ladder.runRung(task, 'routes').output; budget(o); assert.match(o.text, /S 198.51.100.64\/26/); assert.ok(!o.text.includes('203.0.113'));
  const i = ladder.runRung(task, 'interfaces').output; budget(i); assert.match(i.text, /192.0.2.1/);
  const t = ladder.runRung(task, 'trace').output; budget(t); assert.equal(t.lines.filter(l => l.id.endsWith('-slots')).length, 3);
});

const claimOutcomes = {
  'dhcp-used': ['bound', 'link-local'], 'gateway-dhcp': [undefined], reply: ['reply', 'timeout', 'unreachable'],
  'dns-from-ping': ['reply', 'timeout', 'unreachable'], 'dns-answer': ['answer', 'wrong-answer', 'timeout', 'nxdomain'],
  'ssh-login': ['authenticated', 'denied', 'refused', 'timeout', 'host-key'], 'icmp-service': ['authenticated', 'denied'],
  'binding-options': [undefined], 'route-choice': ['present', 'absent'], 'nat-state': ['srcnat', 'empty', 'bare'],
};
const expectedClaimVerdict = (id, outcome) => {
  if (['gateway-dhcp', 'dns-from-ping', 'binding-options'].includes(id)) return 'insufficient';
  const yes = {
    'dhcp-used': ['bound'], reply: ['reply'], 'dns-answer': ['answer', 'wrong-answer'],
    'ssh-login': ['authenticated'], 'icmp-service': ['authenticated'], 'route-choice': ['present'], 'nat-state': ['srcnat'],
  };
  return yes[id].includes(outcome) ? 'yes' : 'no';
};
function expectedClaimKeys(templateId, outcome, vendor) {
  const ros = vendor === 'routeros';
  const keys = {
    'dhcp-used': ['address', 'dhcp-enabled', ...(outcome === 'bound' ? ['dhcp-server'] : [])],
    'gateway-dhcp': ['gateway', 'dhcp-enabled', 'dhcp-server'], reply: ['result'], 'dns-from-ping': [],
    'dns-answer': ['name', ...(['answer', 'wrong-answer'].includes(outcome) ? ['answer'] : ['result'])],
    'ssh-login': ['result'], 'icmp-service': ['0.result', '1.result'],
    'binding-options': ros ? ['binding', 'status'] : ['binding'],
    'route-choice': outcome === 'present' ? ['default', 'default-next'] : ros ? ['route-0', 'route-1'] : ['last-resort'],
    'nat-state': ros ? outcome === 'empty' ? ['flags'] : ['entry', 'src', 'reply-dst']
      : outcome === 'srcnat' ? ['inside-global', 'inside-local'] : ['inside-columns', 'outside-columns'],
  };
  return keys[templateId].sort();
}
test('C2 complete three-valued truth table for all template outcomes and vendors', () => {
  let cases = 0;
  for (const template of claims.templates) for (const outcome of claimOutcomes[template.id]) for (const vendor of vendors) {
    const task = claims.createClaim(template.level, vendor, 14, { templateId: template.id, outcome, otherAddresses: true });
    task.outputs.forEach(budget); assert.equal(task.verdict, expectedClaimVerdict(template.id, outcome), `${template.id}/${outcome}`);
    const keys = [...new Set(task.lines.filter(l => task.expectedLineIds.includes(l.id)).map(l => task.outputs.length > 1 ? `${l.outputIndex}.${l.key}` : l.key))].sort();
    assert.deepEqual(keys, expectedClaimKeys(template.id, outcome, vendor), `${template.id}/${outcome}/${vendor} lines`);
    for (const verdict of claims.verdictIds) assert.equal(claims.checkVerdict(task, verdict, task.expectedLineIds).ok, verdict === task.verdict);
    assert.equal(claims.checkLines(task, [...task.expectedLineIds].reverse()).ok, true);
    assert.equal(claims.checkLines(task, ['nonexistent']).ok, false);
    if (task.expectedLineIds.length) {
      assert.equal(claims.checkLines(task, []).ok, false);
      assert.equal(claims.checkLines(task, [...task.expectedLineIds, task.expectedLineIds[0]]).ok, false);
      assert.equal(claims.checkVerdict(task, task.verdict, []).ok, false);
    } else assert.equal(claims.checkLines(task, []).ok, true);
    cases++;
  }
  assert.equal(cases, 52);
});
test('C2 expected line sets are frozen semantic evidence, including no lines', () => {
  const cases = [
    [1, 'gateway-dhcp', undefined, ['gateway', 'dhcp-enabled', 'dhcp-server']],
    [1, 'dns-from-ping', 'reply', []], [1, 'dns-answer', 'answer', ['name', 'answer']],
    [1, 'ssh-login', 'authenticated', ['result']], [1, 'dhcp-used', 'bound', ['address', 'dhcp-enabled', 'dhcp-server']],
  ];
  for (const [level, templateId, outcome, ids] of cases) assert.deepEqual(claims.createClaim(level, 'cisco', 1, { templateId, outcome }).expectedLineIds, ids);
  const a = claims.createClaim(1, 'cisco', 0, { templateId: 'reply', outcome: 'unreachable' });
  assert.ok(a.expectedLineIds.includes('result:2'), 'both wrapped lines are evidence');
  const noLines = claims.createClaim(1, 'cisco', 0, { templateId: 'dns-from-ping' });
  assert.equal(claims.checkVerdict(noLines, 'insufficient', []).ok, true);
  assert.equal(claims.checkVerdict(noLines, 'yes', []).ok, false);
  assert.equal(claims.templates.filter(t => ['gateway-dhcp', 'dns-from-ping', 'binding-options'].includes(t.id)).length / claims.templates.length, 0.3);
});
test('C2 seeded draws reproduce and respect Windows/router levels', () => {
  for (const vendor of vendors) for (const level of [1, 2]) for (let seed = 0; seed < 30; seed++) {
    const a = claims.createClaim(level, vendor, seed); assert.deepEqual(a, claims.createClaim(level, vendor, seed));
    assert.ok(claims.templates.some(t => t.id === a.templateId && t.level === level));
    assert.equal(a.outputs.some(o => o.command.startsWith('show ') || o.command.startsWith('/ip')), level === 2);
  }
});
test('C3 each independent requirement has one correct outcome among 3–4 explicit options', () => {
  for (const vendor of vendors) {
    const set = proofs.proofSet(17, { vendor, otherAddresses: true }); assert.equal(set.length, 6);
    for (const task of set) {
      assert.ok(task.options.length >= 3 && task.options.length <= 4);
      assert.equal(task.options.filter(o => proofs.checkProof(task, o.id).ok).length, 1);
      for (const o of task.options) { assert.ok(o.place); assert.ok(o.command); assert.ok(o.expected); assert.ok(o.label.includes('→')); }
      assert.equal(proofs.checkProof(task, 'unknown').ok, false);
    }
    const telnet = set.find(t => t.requirementId === 'telnet').options.find(o => o.id === 'configuration');
    if (vendor === 'cisco') assert.equal(telnet.evidence[0].scope, 'all-vty-ranges');
    else { assert.equal(telnet.evidence.length, 2); assert.match(telnet.expected, /allowed-interface-list=none/); }
    const address = set.find(t => t.requirementId === 'address').options.find(o => o.id === 'address'); assert.equal(address.evidence.length, 1);
  }
});
test('renumbering preserves all probe outcomes and grading, with no stale LAN literals', () => {
  for (const vendor of vendors) for (const faultId of l1Faults) {
    const a = ladder.createLadder(1, vendor, 971, { faultId }), b = ladder.createLadder(1, vendor, 971, { faultId, otherAddresses: true });
    assert.notEqual(a.scenario.topology.network, b.scenario.topology.network);
    const ea = allRungs(a), eb = allRungs(b);
    assert.deepEqual(ea.map(e => e.expected), eb.map(e => e.expected));
    assert.deepEqual(ladder.acceptedPlaces(ea), ladder.acceptedPlaces(eb));
    assert.ok(!eb.map(e => e.output.text).join('\n').includes('192.168.88.'));
  }
});
test('R4 worked examples are detached, solve their own tasks, and use only two documentation blocks', () => {
  for (const vendor of vendors) {
    const l = ladder.ladderExample({ vendor }), c = claims.claimExample({ vendor }), p = proofs.proofExample({ vendor });
    assert.equal(l.result.ok, true); assert.equal(c.result.ok, true); assert.equal(p.result.ok, true);
    assert.equal(l.rows.length, 4); assert.equal(l.rows.filter(r => r.stopped).length, 1);
    const learner = ladder.createLadder(1, vendor, 1, { faultId: 'dns' }); assert.notEqual(l.task.scenario.topology.network, learner.scenario.topology.network);
    // Inspect data used by commands and displayed content, including the
    // example's correct option and the whole numeric scenario, not raw uk.js.
    const text = JSON.stringify([l.evidence.map(e => e.output), c.task.outputs, p.task.options, l.task.scenario.topology, l.context]);
    const ips = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
    assert.ok(ips.length > 10);
    for (const ip of ips) assert.ok(contains('192.0.2.0', 24, ip) || contains('198.51.100.0', 24, ip) || ip === '255.255.255.0', ip);
    l.rows.forEach(r => budget(r.output));
  }
});


test('source interface and service protocol are validated; DNS is a delivered service', () => {
  const s = healthy();
  assert.equal(probe(s, { source: { address: clientState(s).address, interface: 'wrong' } }).outcome, 'invalid');
  assert.equal(probe(s, { source: { address: s.topology.wan, interface: 'g0/0' } }).ok, true);
  assert.equal(probe(s, { destination: s.topology.router, service: 'ssh' }).outcome, 'authenticated');
  assert.equal(probe(s, { destination: s.topology.router, service: 'ssh', protocol: 'icmp' }).outcome, 'invalid');
  assert.equal(probe(s, { destination: s.remoteIp, service: 'ssh' }).outcome, 'refused');
  s.config.dhcp.dns = [s.topology.router];
  assert.equal(dnsLookup(s).outcome, 'timeout', 'a router without DNS forwarding is not a resolver');
  s.config.dhcp.dns = [...s.topology.providerDns];
  const ptr = dnsLookup(s, s.topology.website);
  assert.equal(ptr.answerName, s.websiteName); assert.equal(ptr.outcome, 'answer'); budget(out.nslookup(ptr));
  assert.equal(httpFetch(s).natState.length, 2, 'the named HTTP transaction also creates DNS state');
});
test('L2 named targets resolve or collect a DNS failure; syntax success is separate', () => {
  const task = ladder.createLadder(2, 'cisco', 1, { faultId: 'healthy' });
  const ping = ladder.runRung(task, 'remote', task.scenario.websiteName);
  assert.equal(ping.ok, true); assert.equal(ping.result.destination, task.scenario.topology.website); assert.equal(ping.expected, true);
  const trace = ladder.runRung(task, 'trace', task.scenario.websiteName); assert.equal(trace.result.destination, task.scenario.topology.website);
  const missing = ladder.runRung(task, 'remote', task.scenario.missingName);
  assert.equal(missing.ok, true); assert.equal(missing.expected, false); assert.equal(missing.facts.scope, 'dns'); budget(missing.output);
});
test('all router fault states fit; failed allocation is not a fabricated waiting lease', () => {
  for (const vendor of vendors) for (const faultId of l2Faults) {
    const s = createScenario(913, { level: 2, vendor, faultId, otherAddresses: true });
    for (const fn of [out.interfaces, out.addresses, out.routes, out.bindings]) budget(fn(s));
  }
  const s = createScenario(0, { faultId: 'no-server' }); assert.equal(out.bindings(s).lines.length, 1);
});

test('investigation places respect returned service/DNS evidence and observation order', () => {
  const task = ladder.createLadder(2, 'cisco', 1, { faultId: 'ssh-denied' });
  const ssh = ladder.runRung(task, 'ssh');
  assert.deepEqual(ladder.acceptedPlaces([ssh]), ['service']);
  const nxdomain = ladder.createLadder(2, 'cisco', 1, { faultId: 'nxdomain' });
  assert.deepEqual(ladder.acceptedPlaces([ladder.runRung(nxdomain, 'dns')]), ['dns']);
  const timeout = ladder.createLadder(2, 'cisco', 1, { faultId: 'static-gateway' });
  const rows = [ladder.runRung(timeout, 'config'), ladder.runRung(timeout, 'gateway'), ladder.runRung(timeout, 'ssh')];
  assert.deepEqual(ladder.acceptedPlaces(rows), ladder.acceptedPlaces([...rows].reverse()));
});

test('numeric HTTP arguments use that host directly, without a reverse DNS prerequisite', () => {
  const s = healthy(); s.dnsMode = 'timeout';
  const result = httpFetch(s, s.topology.website);
  assert.equal(result.ok, true); assert.equal(result.dns, null); assert.equal(result.natState.length, 1);
});

test('TTL observations preserve earlier responders when forwarding fails farther along the path', () => {
  const s = routed(); s.downLinks = ['lan2'];
  const trace = traceRoute(s);
  assert.equal(trace.ok, false); assert.equal(trace.hops.length, 2);
  assert.ok(trace.hops[0].slots.every(r => r.outcome === 'ttl-expired'));
  assert.ok(trace.hops[1].slots.every(r => r.outcome === 'unreachable'));
  assert.equal(trace.hops[1].address, '192.0.2.254');
  const output = out.tracert(trace); budget(output); assert.match(output.text, /Destination\s+host\s+unreachable/);
});
