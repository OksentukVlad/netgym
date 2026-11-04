// Round 5 stage 5b-2, routing, IP and the start screen (spec-5b2 v2 with
// v2.1/v2.2: A, C, D, G), on the server: the folded worked example under
// the action line on every routing task, vendor and mode and on the mask's
// block tasks; task 15's two sentences and «Уся умова»; its distance
// placeholders per row; MikroTik's destination shape; the free mode's quiet
// add link; the task list's advice; a one-router task without a router row;
// the calculator's command caption; the mask's ruler line; the start
// screen's advice. The mounted behaviour (opening, closing on navigation,
// isolation from the learner's answer, the faults' «Інтернет (ISP)») is in
// tests/helpers/mounted-routing.mjs and mounted-ip.mjs; the gate's rows in
// tools/shots.mjs (exampleRecipes).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../.test-bundles/harness/round5b2.mjs';
import { expectWorkedExample } from './helpers/worked-example.mjs';
import routing from './helpers/routing.mjs';
import mask from '../src/sections/ip/logic/mask.js';
import { describe } from '../src/sections/ip/logic/calc.js';
import { blockSize } from '../src/engine/ip.js';
import { comprehension as rt, ui as rtUi } from '../src/sections/routing/uk.js';
import { comprehension as ip, calcUi, ui as maskUi } from '../src/sections/ip/uk.js';
import { comprehension as fw } from '../src/sections/firewall/uk.js';
import { comprehension as vlan } from '../src/sections/vlan/uk.js';
import { comprehension as setup } from '../src/sections/setup/uk.js';

const { tasks } = h.routingBank;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const textOf = html => unescape(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const task15 = tasks.find(r => r.displayNumber === 15);

function routingScreen(record, { syntax = 'cisco', mode = 'guided', variantId = record.variants[0].id } = {}) {
  const store = h.testStore();
  store.dispatch({ type: 'pref', name: 'syntax', value: syntax });
  store.dispatch({ type: 'pref', name: 'mode', value: mode });
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, filterLevel: 0, variants: { [record.id]: variantId } } });
  return unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
}
/** The placeholder of the input with this id. */
const placeholderOf = (html, id) => new RegExp(`<input[^>]*id="${id}"[^>]*placeholder="([^"]*)"`).exec(html)?.[1] ?? null;

test('A: every routing task, variant, vendor and mode: one folded worked example, the action line\'s next sibling, never open', () => {
  let shown = 0;
  for (const record of tasks) for (const variant of record.variants) for (const syntax of ['cisco', 'routeros']) for (const mode of ['guided', 'free']) {
    const html = routingScreen(record, { syntax, mode, variantId: variant.id });
    const where = `${record.id}/${variant.id}/${syntax}/${mode}`;
    const line = /<p[^>]*data-action-line[^>]*>[^<]*<\/p>/.exec(html);
    if (!line) { assert.ok(!html.includes('data-worked-example'), `${where}: no action line, no example`); continue; }
    expectWorkedExample(html);
    assert.ok(html.slice(line.index + line[0].length).startsWith('<div class="ng-wex" data-worked-example="">'), `${where}: the example comes right after the action line`);
    shown++;
  }
  assert.ok(shown >= 70, shown);
});

test('C, task 15: its two sentences whole, «Уся умова» closed (the rest and the failure case not rendered), its legend folded; other tasks keep the height rule', () => {
  for (const syntax of ['cisco', 'routeros']) {
    const html = routingScreen(task15, { syntax });
    assert.equal(textOf(/<p class="ng-rt-desc">([\s\S]*?)<\/p>/.exec(html)[1]), task15.variants[0].text);
    const toggle = /<button[^>]*class="ng-rt-link ng-rt-details"[^>]*>([^<]*)<\/button>/.exec(html);
    assert.ok(toggle && toggle[1] === rt.fullCondition && toggle[0].includes('aria-expanded="false"'), toggle?.[0]);
    const controls = /aria-controls="([^"]*)"/.exec(toggle[0])[1];
    assert.ok(html.includes(`<div id="${controls}" class="ng-rt-full" hidden=""></div>`), 'the controlled region is there, empty and hidden');
    const details = typeof task15.variants[0].details === 'string' ? task15.variants[0].details : task15.variants[0].details[syntax];
    assert.ok(!html.includes(details.slice(0, 40)) && !html.includes('ng-rt-failover'), `${syntax}: the rest only after «Уся умова»`);
    assert.ok(!html.includes('ng-aside-body'), `${syntax}: the legend starts folded, like the rest of the condition`);
  }
  for (const record of tasks.filter(r => r !== task15)) assert.ok(!routingScreen(record).includes('ng-rt-full'), `${record.id}: no details region`);
});

test('C: task 15\'s distance placeholders per row (main smaller, backup larger), guided and free; MikroTik\'s destination shows its shape', () => {
  for (const syntax of ['cisco', 'routeros']) {
    const guided = routingScreen(task15, { syntax });
    assert.equal(placeholderOf(guided, 'rt-R1-0-dist'), rt.distancePrimaryPlaceholder);
    assert.equal(placeholderOf(guided, 'rt-R1-1-dist'), rt.distanceBackupPlaceholder);
    const free = routingScreen(task15, { syntax, mode: 'free' });
    assert.equal(/<input[^>]*id="rt-R1-f1-dist"[^>]*placeholder="([^"]*)"/.exec(free)?.[1], rt.distancePrimaryPlaceholder, `${syntax}: the blank row #1 is the smaller`);
    for (const p of [rt.distancePrimaryPlaceholder, rt.distanceBackupPlaceholder]) assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(p), 'no address in a distance placeholder');
  }
  // MikroTik: every non-default destination shows «мережа/префікс, напр. x.x.x.0/24»; default rows keep 0.0.0.0/0.
  let rows = 0;
  for (const record of tasks) {
    const task = routing.create(record);
    const routers = task.network.devices.filter(d => d.kind === 'router').map(d => d.id);
    const html = routingScreen(record, { syntax: 'routeros' });
    task.variant.scaffold[routers[0]].forEach((row, i) => {
      assert.equal(placeholderOf(html, `rt-${routers[0]}-${i}-dst`), row.dest.kind === 'default' ? '0.0.0.0/0' : rt.dstPlaceholder, `${record.id} #${i + 1}`);
      rows++;
    });
  }
  assert.ok(rows >= 19, rows);
});

test('C: free mode adds a route by one quiet link, «+ ще один маршрут (якщо потрібен)», under the blank row', () => {
  for (const syntax of ['cisco', 'routeros']) {
    const html = routingScreen(tasks[0], { syntax, mode: 'free' });
    const add = /<button[^>]*class="([^"]*ng-rt-add[^"]*)"[^>]*>([^<]*)<\/button>/.exec(html);
    assert.ok(add && ['ng-rt-link', 'is-quiet'].every(c => add[1].split(' ').includes(c)) && add[2] === rt.addRoute, add?.[0]);
    assert.ok(html.indexOf('ng-rt-free-row') < add.index && !html.includes(`>${rtUi.shared.addRoute}<`), 'under the blank row; no «+ Маршрут» button');
  }
});

test('C: the task list says «спершу задачі 1–3» under task 15 only, and its «Експерт» badge stays', () => {
  const html = routingScreen(task15);
  const advice = [...html.matchAll(/<span class="ng-rt-task-advice">([^<]*)<\/span>/g)];
  assert.equal(advice.length, 1);
  assert.equal(advice[0][1], rt.task15First);
  const button = html.slice(html.lastIndexOf('<button', advice[0].index), html.indexOf('</button>', advice[0].index));
  // Repair v1 (Fable 2): a space between the title and the advice, so the accessible name reads as two phrases.
  assert.ok(textOf(button).includes('#15 Подвійний аплінк — два провайдери спершу задачі 1–3'), textOf(button));
  assert.ok(html.includes(`>${rtUi.shared.levelLabels[5]}</span>`), 'the badge');
});

test('C: a one-router task has no router row; «Текстом» starts the diagram\'s tool row; two routers keep their row', () => {
  const lone = routingScreen(task15);
  assert.ok(!lone.includes('ng-rt-routers'), 'no router row');
  const tools = /<div class="ng-dg-tools">([\s\S]*?)<\/div><div class="ng-dg-view/.exec(lone)?.[1] ?? '';
  assert.ok(tools.includes('ng-te-button') && tools.includes(rtUi.shared.textButton), tools);
  const two = routingScreen(tasks[0]);
  assert.ok(/<div class="ng-rt-routers"><button[^>]*>R1<\/button><button[^>]*>R2<\/button><button[^>]*ng-te-button/.test(two), 'R1, R2, then «Текстом»');
});

test('D: the calculator\'s command caption names the address the commands set; a gateway only where it is the example gateway', () => {
  const caption = (cidr, gateway = 'first') => h.commandCaptionOf(describe(...cidr.split(/(?=\/)/), { gateway }));
  assert.equal(caption('192.168.1.10/24'), `Команди задають інтерфейсу адресу 192.168.1.1/24 — ${calcUi.commandGateway}.`);
  assert.equal(caption('192.168.1.10/24', 'last'), `Команди задають інтерфейсу адресу 192.168.1.254/24 — ${calcUi.commandGateway}.`);
  assert.equal(caption('10.0.0.1/31'), 'Команди задають інтерфейсу адресу 10.0.0.1/31.');
  assert.equal(caption('10.0.0.0/31'), 'Команди задають інтерфейсу адресу 10.0.0.0/31.');
  assert.equal(caption('10.0.0.1/32'), 'Команди задають інтерфейсу адресу 10.0.0.1/32.');
  // No commands, no caption (the note says so); and the caption is always the model's own commandAddress.
  let unavailable = 0;
  for (const cidr of ['127.0.0.1/8', '224.0.0.1/24', '169.254.1.1/16', '0.0.0.0/0', '10.0.0.1/4', '192.168.1.10/24', '10.1.2.3/30', '172.16.5.5/12']) {
    const model = describe(...cidr.split(/(?=\/)/));
    const text = h.commandCaptionOf(model);
    if (!model.commandAddress) { assert.equal(text, null, cidr); unavailable++; continue; }
    assert.ok(text.startsWith(ip.commandCaption(model.commandAddress)), cidr);
    assert.equal(text.includes('шлюз'), model.commandAddress.ip === model.gateway && model.prefix <= 30, cidr);
  }
  assert.ok(unavailable >= 2, unavailable);
});

test('D: the mask\'s address tasks say what the ruler shows; fit tasks keep their size line', () => {
  for (const level of [1, 2, 3]) for (let seed = 0; seed < 30; seed++) {
    const task = mask.create(null, { seed, level });
    if (task.kind === 'fit') continue;
    const ruler = h.rulerFor(task.ip, task.prefix, false);
    const expected = ip.maskRulerCaption({ k: ruler.octet, labelStep: Math.max(ruler.unit, 32), tick: Math.max(ruler.unit, 4), prefix: task.prefix, blockSize: blockSize(task.prefix), value: ruler.value });
    assert.equal(h.maskRulerCaption(task, ruler), expected);
    assert.ok(expected.includes(`блок для /${task.prefix} — ${2 ** (32 - task.prefix)} адрес`) && expected.endsWith(`Твоя адреса: ${task.ip.split('.')[ruler.octet - 1]}.`), expected);
    const shown = h.rulerFor(task.ip, task.prefix, true);
    assert.equal(h.maskRulerCaption(task, shown), `${expected} ${maskUi.rulerBlock(shown.block)}`);
  }
});

/** The mask exercise at a level and seed, rendered. */
function maskScreen(level, seed) {
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'ip.mask', patch: { level, seeds: { [level]: seed } } });
  return unescape(store.render(h.MaskScreen));
}
test('A, D: the mask\'s action line over the fields; on block tasks the folded example right under it, the ruler\'s new line; none on fit tasks', () => {
  const block = maskScreen(1, 11);
  const task = mask.create(null, { seed: 11, level: 1 });
  const line = /<p[^>]*data-action-line[^>]*>([^<]*)<\/p>/.exec(block);
  assert.equal(line?.[1], maskUi.action.block);
  expectWorkedExample(block);
  assert.ok(block.slice(line.index + line[0].length).startsWith('<div class="ng-wex" data-worked-example="">'), 'right under the action line');
  assert.equal(textOf(/<figcaption class="ng-ruler-text">([\s\S]*?)<\/figcaption>/.exec(block)[1]), h.maskRulerCaption(task, h.rulerFor(task.ip, task.prefix, false)));
  let fits = 0;
  for (let seed = 0; seed < 40 && !fits; seed++) {
    if (mask.create(null, { seed, level: 2 }).kind !== 'fit') continue;
    const fit = maskScreen(2, seed);
    assert.equal(/<p[^>]*data-action-line[^>]*>([^<]*)<\/p>/.exec(fit)?.[1], maskUi.action.fit);
    assert.ok(!fit.includes('data-worked-example'), 'no example on a fit task (another task shape)');
    fits++;
  }
  assert.equal(fits, 1);
});

test('G: the start screen advises, never locks: «радимо спершу: …» on routing, «DHCP і NAT» (round 6), «Перевірка мережі» (round 7), firewall, VLAN and setup, nothing on the IP cards', () => {
  const html = unescape(h.renderStart());
  const cards = [...html.matchAll(/<button type="button" class="ng-card">([\s\S]*?)<\/button>/g)].map(m => m[1]);
  assert.equal(cards.length, 9);
  const advice = cards.map(card => /<span class="ng-card-advice">([^<]*)<\/span>/.exec(card)?.[1] ?? null);
  // Round 7: «Перевірка мережі» after «DHCP і NAT», advising it first.
  assert.deepEqual(advice, [null, null, null, rt.recommendedFirst, 'радимо спершу: IP-адреси', 'радимо спершу: DHCP і NAT', fw.recommendedFirst, vlan.recommendedFirst, setup.recommendedFirst]);
  assert.deepEqual(advice.slice(3), ['радимо спершу: IP-адреси', 'радимо спершу: IP-адреси', 'радимо спершу: DHCP і NAT', 'радимо спершу: IP-адреси й маршрутизацію', 'радимо спершу: IP-адреси', 'радимо спершу: маршрутизацію й VLAN']);
  assert.ok(!/disabled|aria-disabled/.test(html), 'no card is locked');
});
