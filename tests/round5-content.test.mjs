import test from 'node:test';
import assert from 'node:assert/strict';
import { decks, setupPurpose } from '../src/banks/setup/index.js';
import { validateSetupRecord, SETUP_PURPOSE_MAX } from '../src/engine/vendors/setup-record.js';
import * as setup from '../src/sections/setup/logic/deck.js';
import { buildScript, cardText } from '../src/sections/setup/logic/render.js';
import tasks from '../src/banks/routing/tasks.js';
import routing from './helpers/routing.mjs';
import { legendFacts } from '../src/sections/routing/logic/legend.js';
import { network } from '../src/engine/ip.js';
import { routingPlaceholders } from '../src/sections/routing/uk.js';
import { expectPlaceholdersFail } from './helpers/routing-placeholders.mjs';
import { record } from '../src/banks/vlan/predict.js';
import * as predict from '../src/sections/vlan/logic/predict.js';
import { applySurprise } from '../src/sections/vlan/logic/predict-model.js';
import { hostPort } from '../src/sections/vlan/logic/model.js';
import { portEvidence, portEvidenceFacts, portFact, vlanFact } from '../src/sections/vlan/logic/facts.js';
import { records } from '../src/banks/vlan/route.js';
import * as route from '../src/sections/vlan/logic/route.js';
import { interVlanAction } from '../src/sections/vlan/logic/route-action.js';
import { vlanTeaching } from '../src/sections/vlan/uk.js';
import { binaryLevel1Text } from '../src/sections/ip/uk.js';
import * as binary from '../src/sections/ip/logic/binary.js';

// Independent approved inventory; guards edits to a command's meaning as well
// as missing data. The checkpoint is a first-class row in the total of 30.
const purposes = [
  ['назва пристрою (і частина назви ключа)', 'домен — потрібен, щоб створити ключ SSH', 'створює RSA-ключі пристрою для SSH', 'дозволяє лише SSH версії 2', 'пароль до привілейованого режиму #', 'локальний користувач для входу', 'маскує паролі в конфігурації (слабко)', 'вхід на вибрані лінії VTY лише через SSH', 'вхід за локальними користувачами', 'адреса інтерфейсу', 'вмикає інтерфейс', 'зберігає поточні налаштування для запуску'],
  ['назва комутатора', 'адреса керування на інтерфейсі VLAN', 'вмикає інтерфейс VLAN керування', 'шлюз для керування з інших мереж', 'зберігає поточні налаштування для запуску'],
  ['створює міст для LAN', 'порт ether2 у міст — міст має вже бути', 'створює список інтерфейсів LAN', 'міст у список LAN — потрібні обидва', 'адреса LAN на мосту — міст має вже бути', 'створює нового адміністратора', 'вимикає типовий обліковий запис admin', 'вимикає непотрібні служби керування', 'MAC-Winbox лише з LAN — потрібен список', 'виявлення сусідів у LAN — потрібен список', 'посилює криптографічні налаштування SSH', 'вимикає MAC-Telnet на всіх інтерфейсах', 'перевір, що новий вхід працює'],
];
test('setup: all 30 purposes match approved texts, survive rendering, and validate at 48 characters', () => {
  assert.equal(decks.flatMap(d => d.cards).length, 30);
  assert.equal(Object.values(setupPurpose).flatMap(Object.values).length, 30);
  for (const [i, deck] of decks.entries()) {
    assert.deepEqual(deck.cards.map(c => c.purpose), purposes[i]);
    assert.deepEqual(validateSetupRecord(deck), []);
    const task = setup.create(deck);
    const rows = setup.render(task, setup.initialAnswer(task));
    for (const row of rows) assert.equal(row.purpose, task.cards.find(c => c.id === row.id).purpose);
    for (const purpose of [undefined, '', '   ', 'а'.repeat(SETUP_PURPOSE_MAX + 1), 42]) {
      const bad = structuredClone(deck); bad.cards[0].purpose = purpose;
      assert.ok(validateSetupRecord(bad).some(f => f.detail === 'purpose'));
      assert.throws(() => setup.create(bad), /invalid-record/);
    }
    const limit = structuredClone(deck); limit.cards[0].purpose = 'а'.repeat(48);
    assert.deepEqual(validateSetupRecord(limit), []);
  }
});
test('2960 learned script commands reuse router purposes without changing paste text', () => {
  const task = setup.create(decks[1]);
  const commands = Object.fromEntries(task.cards.map(c => [c.id, cardText(task, c.id)]));
  const script = buildScript(task, task.referenceOrder, commands);
  const lines = script.lines.filter(l => l.kind === 'learned');
  assert.equal(lines.length, 7);
  assert.deepEqual(lines.map(l => l.purpose), ['domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'transport-ssh', 'login-local'].map(id => setupPurpose['dr-1'][id]));
  assert.equal(script.script, script.lines.map(l => l.text).join('\n'));
  assert.ok(lines.every(l => l.note === 'script-as-router'));
});

function assertLegend(task, syntax) {
  const before = structuredClone(task), facts = legendFacts(task, syntax), net = task.network;
  const lan = net.segments.find(s => s.kind === 'lan');
  const owner = net.devices.find(d => d.kind === 'router' && d.interfaces.some(i => i.segmentId === lan.id));
  const iface = owner.interfaces.find(i => i.segmentId === lan.id);
  assert.deepEqual(facts.lan, { network: `${network(iface.address.ip, iface.address.prefix)}/${iface.address.prefix}`, port: iface.labels[syntax], address: iface.address.ip });
  assert.ok(facts.link.ends.length >= 2);
  let segment;
  for (const end of facts.link.ends) {
    const owner = net.devices.find(d => d.id === end.router);
    const iface = owner.interfaces.find(i => i.address?.ip === end.address);
    assert.ok(iface, `${end.address} belongs to ${end.router}`);
    segment ??= iface.segmentId;
    assert.equal(iface.segmentId, segment);
    assert.equal(facts.link.network, `${network(end.address, iface.address.prefix)}/${iface.address.prefix}`);
  }
  assert.deepEqual(task, before);
  return facts;
}
for (const seed of [null, 51]) test(`routing R4: every variant/vendor owns its legend and placeholders fail field verdicts, seed=${seed}`, () => {
  let fields = 0;
  for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id, seed });
    assert.ok(!task.infeasible);
    for (const syntax of ['cisco', 'routeros']) {
      const facts = assertLegend(task, syntax);
      if (seed !== null) assert.notEqual(facts.lan.network, legendFacts(routing.create(record, { variantId: variant.id }), syntax).lan.network);
      fields += expectPlaceholdersFail(task, syntax, routingPlaceholders[syntax]);
    }
  }
  assert.ok(fields > 500);
});
test('R4 helper rejects an answer-valued mask example in otherwise valid rows', () => {
  const task = routing.create(tasks[0]);
  assert.throws(() => expectPlaceholdersFail(task, 'cisco', { ...routingPlaceholders.cisco, mask: 'напр. 255.255.255.0' }), /placeholder .* passes/);
  assert.equal(routingPlaceholders.defaultRoute, '0.0.0.0/0');
  assert.equal(routingPlaceholders.distanceExample, '1 — основний, 5 — резервний'); // repair v1 (Fable 3): no «напр.», fits 1000 px
});

const evidenceTask = (variantId, vendor) => predict.create(record, { variantId, vendor, seed: 0, surprises: 0 });
const surpriseNetwork = task => ({ topology: task.topology, vids: [...new Set(Object.values(predictGoals(task)))], goals: predictGoals(task) });
// Build fixture goals from the baseline *configuration* solely to drive the
// existing mutation helper; evidence itself is exercised with poisonous goals.
function predictGoals(task) {
  return Object.fromEntries(task.topology.hosts.map(h => { const end = hostPort(task.topology, h.device), p = task.configurations[end.device].ports[end.port]; return [h.device, p.vlan ?? p.pvid]; }));
}
function forbidAnswers(task) {
  Object.defineProperty(task, 'goals', { get() { throw Error('evidence read goals'); } });
  Object.defineProperty(task, 'receivers', { get() { throw Error('evidence read receivers'); } });
}
for (const vendor of ['cisco', 'routeros']) test(`VLAN evidence: ${vendor} access reassignment follows configuration and emits qualified facts`, () => {
  const task = evidenceTask('p1', vendor), before = portEvidence(task), network = surpriseNetwork(task);
  const end = applySurprise(network, task.configurations, vendor, 'access-a');
  forbidAnswers(task);
  const rows = portEvidence(task), row = rows.find(r => r.host === 'PC1'), field = vendor === 'cisco' ? 'vlan' : 'pvid';
  assert.equal(row[field], task.configurations[end.device].ports[end.port][field]);
  assert.notEqual(row[field], before.find(r => r.host === 'PC1')[field]);
  assert.deepEqual(portEvidenceFacts(row), [portFact(row.device, row.port), vlanFact(row[field])]);
  assert.equal(rows.length, Object.values(task.configurations).reduce((n, c) => n + Object.keys(c.ports).length, 0));
  assert.ok(rows.every(r => r.filtering === true));
});
test('VLAN evidence: missing transit VLAN stays distinct from trunk allowed VLANs', () => {
  const task = evidenceTask('p3', 'cisco'), network = surpriseNetwork(task);
  applySurprise(network, task.configurations, 'cisco', 'missing-transit');
  forbidAnswers(task);
  const rows = portEvidence(task).filter(r => r.device === 'SW2' && r.allowed);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => !r.created.includes(network.vids[1])));
  assert.ok(rows.some(r => r.allowed.includes(network.vids[1])));
  rows[0].allowed.push(999); rows[0].created.push(998);
  assert.ok(!JSON.stringify(task.configurations).includes('999'));
  assert.ok(!JSON.stringify(task.configurations).includes('998'));
});
test('VLAN evidence: filtering off preserves configured PVID and tagged memberships', () => {
  const task = evidenceTask('p3', 'routeros'), before = portEvidence(task);
  applySurprise(surpriseNetwork(task), task.configurations, 'routeros', 'filtering-off');
  forbidAnswers(task);
  const rows = portEvidence(task);
  assert.deepEqual(rows, before.map(r => ({ ...r, filtering: r.device !== 'SW2' })));
  assert.deepEqual(portFact('SW1', 'fa0/1'), { kind: 'port', value: 'SW1:fa0/1' });
  assert.notDeepEqual(portFact('SW1', 'fa0/1'), portFact('SW2', 'fa0/1'));
  assert.equal(vlanTeaching.trunk, 'Транк — порт, що може переносити кілька VLAN; кадри native VLAN можуть передаватися без тега.');
  assert.equal(vlanTeaching.broadcast, 'Комутатор розсилає широкомовний кадр дозволеними портами його VLAN, крім порту, з якого кадр прийшов.');
});

for (const record of records) for (const syntax of record.variants[0].syntaxes) test(`inter-VLAN action from givens: ${record.id}/${syntax}`, () => {
  const task = route.create(record, { syntax, seed: 17 }), line = interVlanAction(task);
  assert.equal(typeof line, 'string'); assert.ok(line.length);
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(line));
  if (syntax === 'cisco' && task.taskNumber < 3) {
    const port = task.topology.devices.find(d => d.id === 'R1').ports.find(p => p.id === 'r').label.cisco;
    assert.ok(line.includes(port));
    if (task.taskNumber === 1) assert.ok(!line.includes('SW1'));
    // Repair v1 (Astra 2): task 2 starts on SW1 with its VLANs and access ports, then the trunk.
    else assert.ok(line.startsWith('Почни з SW1: VLAN, порти доступу, транк; потім R1:'));
  }
  if (syntax === 'routeros' && task.taskNumber === 2) assert.ok(/^Почни з SW1: PVID портів, таблиця VLAN, filtering; потім R1:/.test(line), 'access ports, the table, filtering last on SW1, then R1');
  if (task.management) {
    assert.ok(line.startsWith('SW1: VLAN керування на транку, інтерфейс і шлюз; R1:'));
    assert.ok(line.endsWith(syntax === 'cisco' ? 'лише відсутній підінтерфейс.' : 'лише відсутній VLAN-інтерфейс.'));
  }
  if (task.taskNumber === 4) assert.ok(line.includes('SW1') && line.includes('R1') && line.includes('VLAN-інтерфейси') && line.endsWith('filtering — останнім.'));
});

test('binary L1: all step/input-mode texts use only given operands and exact final corrections', () => {
  for (const prefix of [25, 26, 27, 28, 29, 30]) {
    const task = binary.create(null, { level: 1, ip: '192.168.73.173', prefix });
    for (let step = 0; step < 4; step++) for (const mode of ['toggles', 'text']) {
      const text = binaryLevel1Text({ ...task, n: 222, target: 223, network: 'LEAK', broadcast: 'LEAK' }, { step, mode });
      assert.equal(text.givenBand, 'Октети 1–3 · задано');
      assert.ok(!JSON.stringify(text).includes('LEAK'));
      if (step === 0) assert.ok(text.question.includes('173') && text.action.includes('173'));
      else assert.ok(!text.question.includes('173') && !text.action.includes('173'));
      const numbers = `${text.question} ${text.action}`.match(/\d+/g).map(Number);
      assert.deepEqual([...new Set(numbers)].sort((a, b) => a - b), [...new Set(step === 0 ? [173, 4] : step === 1 ? [4, prefix - 24] : [4, 0, 1])].sort((a, b) => a - b));
    }
  }
  const task = { ip: '192.168.73.173', prefix: 27 };
  assert.equal(binaryLevel1Text(task, { step: 2 }).action, 'Де в масці 1 — постав той самий біт, що в IP-адресі (0 або 1); де 0 — постав 0.');
  assert.equal(binaryLevel1Text(task, { mode: 'text' }).action, 'Надрукуй вісім бітів октета 4 цього рядка: сума ваг позицій з одиницями має дорівнювати 173.');
  assert.throws(() => binaryLevel1Text(task, { step: 4 }), /invalid-step-or-mode/);
  assert.throws(() => binaryLevel1Text(task, { mode: 'other' }), /invalid-step-or-mode/);
});
