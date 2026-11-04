// Round 9 usage review: one regression per wrong verdict (A9–A22; findings v1).
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { create, checkRow } from './helpers/routing.mjs';
import { rowReasons, rowVerdict } from '../src/sections/routing/logic/rowReasons.js';
import { fieldOfCode, rowCheck, rowFormCode } from '../src/sections/routing/screens/rowCheck.js';
import { syntaxes } from '../src/sections/routing/syntax/index.js';
import { copy, ui, t } from '../src/sections/routing/uk.js';
import ports from '../src/sections/vlan/logic/ports.js';
import portRecords from '../src/banks/vlan/ports.js';
import { isTrunk, switches } from '../src/sections/vlan/logic/model.js';
import { ui as vlanUi } from '../src/sections/vlan/uk.js';
import * as route from '../src/sections/vlan/logic/route.js';
import { t as vlanT } from '../src/sections/vlan/uk.js';
import routeRecords from '../src/banks/vlan/route.js';
import { parse } from '../src/engine/vendors/cisco-cli.js';
import * as proofs from '../src/sections/checks/logic/proofs.js';
import { screen as checksScreen } from '../src/sections/checks/uk.js';
import { comprehension as ipCopy } from '../src/sections/ip/uk.js';

const first = create(tasks[0]);

test('A12: a wrong mask on the row\'s own network blames the mask, never the address (Cisco and MikroTik)', () => {
  const cisco = { net: '192.168.2.0', mask: '255.255.0.0', gw: '10.0.0.2' };
  const { detail, override } = rowCheck(first, 'R1', 0, cisco, syntaxes.cisco);
  assert.equal(detail.netOk, true); assert.equal(detail.maskOk, false); assert.equal(override, null);
  assert.equal(rowFormCode(first, 'R1', 0, cisco, syntaxes.cisco), 'wrong-mask');
  assert.equal(fieldOfCode('wrong-mask', 'cisco'), 'mask');
  assert.deepEqual(rowReasons(first, 'R1', 0, cisco, 'cisco', rowVerdict(checkRow(first, 'R1', 0, cisco, 'cisco'))), { mask: 'wrong-mask' });
  const ros = { dst: '192.168.2.0/16', gw: '10.0.0.2' };
  assert.equal(rowFormCode(first, 'R1', 0, ros, syntaxes.routeros), 'wrong-mask');
  assert.deepEqual(rowReasons(first, 'R1', 0, ros, 'routeros', rowVerdict(checkRow(first, 'R1', 0, ros, 'routeros'))), { dst: 'wrong-mask' });
  assert.equal(fieldOfCode('wrong-mask', 'routeros'), 'dst');
});

test('A12: a real host address stays diagnosed; its words name no prefix of their own', () => {
  const host = { net: '192.168.2.1', mask: '255.255.255.0', gw: '10.0.0.2' };
  assert.equal(rowFormCode(first, 'R1', 0, host, syntaxes.cisco), 'dst-not-network');
  assert.doesNotMatch(t('routing.static.dst-not-network'), /\/24|\.0\b/, 'the /24 text appeared on a /23 task');
});

test('A10: success words say «model»; the note names what it assumes, NAT only where there is an internet', () => {
  assert.match(ui.shared.successSummary, /перевірки моделі/);
  assert.doesNotMatch(ui.shared.successSummary, /Мережа працює/);
  assert.match(ui.shared.modelNote(true), /NAT.*провайдера.*не вивід tracert/);
  assert.doesNotMatch(ui.shared.modelNote(false), /NAT/);
  assert.match(ui.shared.pathTitle, /модель/);
});

test('C: «Рівень», «лінка» after «до»; a LAN keeps its name', () => {
  assert.equal(ui.shared.level(1), 'Рівень 1');
  assert.equal(ui.shared.routeLabel('лінк R2–R3'), 'лінка R2–R3');
  assert.equal(ui.shared.routeLabel('LAN2'), 'LAN2');
  assert.ok(copy['routing.static.redundant-default']);
});

test('A16: a trunkless MikroTik task passes without Bridge → VLANs rows, and the screen doesn\'t ask for them', () => {
  const record = portRecords[0];
  const task = ports.create(record, { seed: 775239, syntax: 'routeros' });
  assert.equal(switches(task.topology).some(d => d.ports.some(p => isTrunk(task.topology, d.id, p.id))), false);
  const answer = ports.solution(task, 'routeros');
  for (const sw of Object.values(answer)) sw.vlans = [];
  assert.equal(ports.check(task, answer, { syntax: 'routeros' }).ok, true, 'RouterOS adds an access port to its PVID\'s VLAN itself');
  assert.doesNotMatch(vlanUi.portsAction.routerosAccess, /Bridge → VLANs/);
  assert.match(vlanUi.portsAction.routeros, /Bridge → VLANs/);
  assert.match(vlanUi.accessRowsOptional, /необов’язкові.*PVID/);
});

test('A16: with a trunk the rows still count: an empty table fails', () => {
  const task = ports.create(portRecords[1], { seed: 5, syntax: 'routeros' });
  const answer = ports.solution(task, 'routeros');
  for (const sw of Object.values(answer)) sw.vlans = [];
  assert.equal(ports.check(task, answer, { syntax: 'routeros' }).ok, false);
});

test('A17: a wrong R1 gateway is blamed on R1 at every VLAN of task 2, in both syntaxes; a wrong access port stays SW1\'s', () => {
  const record = routeRecords.find(r => r.id === 'vlan.route-2');
  for (const syntax of ['cisco', 'routeros']) for (const seed of [867152, 1, 2]) {
    const task = route.create(record, { seed, syntax }), reference = route.solution(task, syntax);
    for (let i = 0; i < task.networks.length; i++) {
      const answer = structuredClone(reference);
      const row = (syntax === 'cisco' ? answer.R1.subifs : answer.R1.addresses)[i];
      const parts = row.ip.split('.');
      parts[3] = String((Number(parts[3]) + 7) % 250 + 1);
      row.ip = parts.join('.');
      const found = route.check(task, answer, { syntax }).findings.find(f => f.severity === 'blocks');
      assert.equal(found.params.location.device, 'R1', `${syntax} ${seed} ${i}`);
      assert.match(vlanT('route-port-location', found.params.location), /не належить жодному його інтерфейсу/);
    }
  }
  const task = route.create(record, { seed: 867152, syntax: 'cisco' }), answer = route.solution(task, 'cisco');
  const host = task.topology.hosts[0].device;
  const end = task.topology.links.flatMap(l => [[l.a, l.b], [l.b, l.a]]).find(([a]) => a.device === host)[1];
  answer.SW1.ports[end.port].vlan = task.goals[task.topology.hosts.at(-1).device];
  const found = route.check(task, answer, { syntax: 'cisco' }).findings.find(f => f.severity === 'blocks');
  assert.equal(found.params.location.device, 'SW1');
});

test('A22: `crypto key generate rsa` marks the missing end, not the word «crypto»', () => {
  const text = 'crypto key generate rsa';
  const { finding } = parse(text, { mode: null });
  assert.equal(finding.reason, 'modulus-required');
  assert.deepEqual([finding.start, finding.end, finding.token], [text.length, text.length, '']);
});

test('A19: a setup deck\'s round holds only what the deck configured, in device words', () => {
  const round = proofs.proofSet(7, { vendor: 'cisco', scope: 'access' });
  assert.deepEqual(round.map(c => c.requirementId), ['ssh', 'telnet', 'login']);
  assert.doesNotMatch(JSON.stringify(round), /dhcp|на роутері/i);
  assert.match(JSON.stringify(round), /на пристрої/);
  assert.equal(proofs.proofSet(7, { vendor: 'cisco' }).length, 6, 'the section\'s own round keeps all six');
  assert.doesNotMatch(checksScreen.proofTaskAccess, /Роутер/);
});

test('C: the mask ruler says both spacings where they differ, and agrees in number', () => {
  assert.equal(ipCopy.maskRulerCaption({ k: 3, labelStep: 32, tick: 4, prefix: 22, blockSize: 1024, value: 81 }),
    'Лінійка: 3-те число адреси, від 0 до 255; числа підписано через 32, поділки — через 4, блок для /22 — 1024 адреси (у цьому числі це 4). Твоя адреса: 81.');
});
