// Usage-review regressions: observable evidence, never hidden fault labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as claims from '../src/sections/checks/logic/claims.js';
import * as proofs from '../src/sections/checks/logic/proofs.js';
import * as ladder from '../src/sections/checks/logic/ladder.js';
import * as outputs from '../src/sections/checks/logic/outputs.js';
import { createScenario, probe } from '../src/sections/checks/logic/probes.js';
import { createFault, repairFields } from '../src/sections/dhcp/logic/faults.js';
import { check as checkSide, cards } from '../src/sections/dhcp/logic/sides.js';
import { labels, screen, findings, fault } from '../src/sections/dhcp/uk.js';
const vendors = ['cisco', 'routeros'];
const claim = (templateId, outcome, vendor = 'cisco') => claims.createClaim(['binding-options', 'route-choice', 'nat-state'].includes(templateId) ? 2 : 1, vendor, 14, { templateId, outcome });

test('A1: both client settings and a lease prove address issuance; each option explains its actual limit', () => {
  for (const vendor of vendors) {
    const task = proofs.createProof(90758, { vendor, requirementId: 'address' });
    assert.equal(proofs.checkProof(task, 'binding-only').ok, true);
    assert.match(proofs.checkProof(task, 'binding-only').text, /видачу адреси/);
    assert.equal(proofs.checkProof(task, 'address').ok, true);
    assert.equal(proofs.checkProof(task, 'apipa').ok, false);
    for (const card of proofs.proofSet(5, { vendor })) {
      assert.equal(new Set(card.options.map(o => proofs.checkProof(card, o.id).text)).size, card.options.length);
      for (const option of card.options) assert.ok(option.reason, `${card.requirementId}/${option.id}`);
    }
    if (vendor === 'routeros') {
      const telnet = proofs.createProof(3, { vendor, requirementId: 'telnet' });
      assert.match(proofs.checkProof(telnet, 'ip-only').text, /MAC-Telnet/);
      assert.ok(!proofs.checkProof(telnet, 'configuration').text.includes('VTY'));
    }
  }
});

test('A2: any failed-ping observation and all equivalent relevant lines pass; each evidence group is needed', () => {
  for (const outcome of ['authenticated', 'denied']) {
    const task = claim('icmp-service', outcome);
    for (const ping of ['result', 'summary', 'loss']) assert.equal(claims.checkLines(task, [`0.${ping}`, '1.result']).ok, true);
    assert.equal(claims.checkLines(task, ['0.result', '0.summary', '0.loss', '1.result']).ok, true);
    assert.equal(claims.checkLines(task, ['1.result']).ok, false);
    assert.equal(claims.checkLines(task, ['0.result']).ok, false);
    assert.equal(claims.checkLines(task, ['0.request', '1.result']).ok, false);
    assert.equal(claims.checkVerdict(task, task.verdict, ['0.loss', '1.result']).ok, true);
  }
  assert.equal(claims.checkLines(claim('reply', 'timeout'), ['summary']).ok, true);
  // Windows counts an unreachable response as received; this is not Echo Reply.
  assert.equal(claims.checkLines(claim('reply', 'unreachable'), ['summary']).ok, false);
});

test('A2: wrapped ping and complete split table entries are single selectable observations', () => {
  const ping = claim('reply', 'unreachable');
  assert.deepEqual(ping.expectedLineIds, ['result']);
  assert.ok(ping.lines.find(l => l.id === 'result').physicalIds.includes('result:2'));
  for (const vendor of vendors) {
    const nat = claim('nat-state', 'srcnat', vendor);
    const key = vendor === 'cisco' ? 'translation' : 'connection';
    const row = nat.lines.find(l => l.id === key);
    assert.ok(row.physicalIds.length >= 4);
    assert.equal(claims.checkVerdict(nat, 'yes', [key]).ok, true);
    const lease = claim('binding-options', undefined, vendor);
    assert.ok(lease.lines.find(l => l.id === 'binding').text.includes(vendor === 'cisco' ? 'Automatic' : 'bound'));
    assert.equal(claims.checkVerdict(lease, 'insufficient', ['binding']).ok, true);
  }
});

test('A2: empty NAT tables accept no lines or headers, without claiming NAT is unconfigured', () => {
  for (const vendor of vendors) {
    const task = claim('nat-state', 'empty', vendor);
    assert.deepEqual(task.expectedLineIds, []);
    assert.equal(claims.checkVerdict(task, 'no', []).ok, true);
    assert.equal(claims.checkLines(task, task.lines.map(l => l.id)).ok, true);
    assert.match(task.explanation, /не доводить відсутність налаштованого NAT/);
  }
});

test('A3: explanations distinguish SSH denial, success and the key prompt, and each DNS outcome', () => {
  const denial = claim('icmp-service', 'denied');
  assert.equal(denial.verdict, 'no'); assert.match(denial.explanation, /Access denied.*не виконано/);
  const success = claim('icmp-service', 'authenticated');
  assert.match(success.explanation, /сеанс SSH відкрито/); assert.ok(!success.explanation.includes('Access denied'));
  for (const [outcome, expected] of [['authenticated', /сеанс/], ['denied', /не виконано/], ['host-key', /автентифікації ще не було/]]) assert.match(claim('ssh-login', outcome).explanation, expected);
  for (const [outcome, expected] of [['answer', /є адреса/], ['wrong-answer', /довіреним записом/], ['timeout', /timed out/], ['nxdomain', /імені немає/]]) assert.match(claim('dns-answer', outcome).explanation, expected);
});

test('A4: a stop without unexpected evidence never approves the chosen investigation place', () => {
  for (const vendor of vendors) {
    const task = ladder.createLadder(2, vendor, 4, { faultId: 'healthy' });
    const config = ladder.runRung(task, 'config');
    for (const place of ['dns', 'gateway', 'more']) {
      const result = ladder.gradeStop(task, [config], place);
      assert.equal(result.ok, false); assert.equal(result.stoppedAtEarliest, false);
      assert.match(result.text, /несподіваного результату немає/);
      assert.ok(!/узгоджується|Перевір його далі|Потрібні додаткові/.test(result.text));
    }
    const dns = ladder.createLadder(2, vendor, 4, { faultId: 'dns' });
    const lines = ladder.requirementLines(dns);
    for (const ip of dns.scenario.topology.providerDns) assert.ok(lines.some(line => line.includes(ip)));
    const row = ladder.runRung(dns, 'config');
    assert.equal(row.expected, false);
    assert.equal(ladder.gradeStop(dns, [row], 'dns').ok, true);
  }
});

test('A5: first-login key prompt is normal but does not authenticate; explicit continuation can complete login', () => {
  for (const vendor of vendors) {
    const task = ladder.createLadder(2, vendor, 23552, { faultId: 'host-key' });
    const rows = ['remote', 'http', 'ssh'].map(id => ladder.runRung(task, id));
    assert.equal(rows[2].result.outcome, 'host-key'); assert.equal(rows[2].expected, true);
    assert.equal(ladder.gradeStop(task, rows, 'service').ok, false);
    assert.equal(ladder.gradeHealthy(task, rows).ok, false);
    assert.deepEqual(ladder.gradeHealthy(task, rows).missing, ['ssh']);
    assert.equal(ladder.runRung(task, 'ssh', undefined, rows).result.outcome, 'host-key');
    const login = ladder.runRung(task, 'ssh', undefined, rows, { trustHostKey: true });
    assert.equal(login.result.outcome, 'authenticated');
    assert.equal(ladder.gradeHealthy(task, [...rows, login]).ok, true);
    assert.equal(ladder.runRung(task, 'ssh', undefined, [], { trustHostKey: true }).result.outcome, 'host-key');
  }
});

test('A6: a disconnected adapter fails locally; wrong on-link masks still show unreachable', () => {
  const task = ladder.createLadder(2, 'cisco', 23527, { faultId: 'link' });
  assert.match(ladder.runRung(task, 'config').output.text, /Media disconnected/);
  for (const id of ['gateway', 'remote']) {
    const row = ladder.runRung(task, id);
    assert.equal(row.result.outcome, 'general-failure');
    assert.match(row.output.text, /transmit failed. General failure/);
    assert.ok(!row.output.text.includes('Reply from'));
  }
  const mask = createScenario(3, { faultId: 'static-mask' });
  assert.equal(probe(mask, { destination: mask.topology.router }).outcome, 'unreachable');
});

test('A7: plain SSH success shows a remote session and command response, within the phone budget', () => {
  for (const vendor of vendors) {
    const output = outputs.ssh({ destination: '192.168.255.254', outcome: 'authenticated' }, 'netadmin', vendor);
    assert.ok(!output.text.includes('Authenticated using'));
    assert.match(output.text, vendor === 'cisco' ? /R1> show clock/ : /\[netadmin@R1\] > \/system clock print/);
    assert.match(output.text, /09:00:00/);
    assert.ok(output.lines.length <= 10 && output.lines.every(l => l.text.length <= 40));
  }
});

test('A8: deterministic level-2 draws include about a quarter healthy tasks, across small seed windows', () => {
  let count = 0;
  for (let seed = 0; seed < 1000; seed++) count += createScenario(seed, { level: 2 }).faultId === 'healthy';
  assert.ok(count >= 200 && count <= 300, String(count));
  const originalWindow = Array.from({ length: 25 }, (_, i) => createScenario(23526 + i, { level: 2 }).faultId);
  assert.ok(originalWindow.includes('healthy'));
});

test('A23: native disabled question has the correct polarity; RouterOS never gets the Cisco distance note', () => {
  const task = createFault(3, 'routeros', 51041, { faultId: 'no-server' });
  const field = repairFields(task).find(f => f.id === 'enabled');
  assert.equal(field.native, 'disabled'); assert.equal(field.label, 'Сервер вимкнено');
  assert.equal(fault.disabledYes, 'yes — вимкнено'); assert.equal(fault.disabledNo, 'no — увімкнено');
  assert.match(fault.evidence.dnsNone, /лише з цього поля/);
  const card = cards.find(c => c.id === 'wan-route');
  assert.ok(!checkSide(card, 'WAN', 'mikrotik').why.includes('254'));
  assert.match(checkSide(card, 'WAN', 'cisco').why, /254/);
});

test('A24 and Group C: documentation addresses, whole-address hint and count grammar are explicit', () => {
  assert.match(labels.trainingPublic, /адреси для документації.*у цій моделі/);
  assert.match(screen.rangeHint('192.168.88'), /всю IPv4-адресу.*192.168.88.10.*не лише 10/);
  assert.equal(findings.capacity(21, 22), 'Доступно адрес: 21, потрібно: 22.');
});

test('A2: equivalent router default-route and first-login evidence lines also pass', () => {
  const route = claim('route-choice', 'present');
  for (const id of ['default', 'last-resort']) assert.equal(claims.checkVerdict(route, 'yes', [id]).ok, true);
  const key = claim('ssh-login', 'host-key');
  for (const id of ['key', 'host', 'fingerprint', 'result']) assert.equal(claims.checkVerdict(key, 'no', [id]).ok, true);
});
