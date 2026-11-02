// Round 5 stage 5b-1, routing and IP (spec-5b1 v2 §1, §2): the screen side of
// one address world (R4) in every task, variant, vendor and renumbered
// instance; the router's own addresses; the binary walk's level 1 band. The
// mounted behaviour (the action line, the free mode's blank row, the short
// window, level 1's words by step and mode) is in tests/helpers/
// mounted-routing.mjs and mounted-ip.mjs; the gate's essentials in
// tests/r5-must-see.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../.test-bundles/harness/round5-routing.mjs';
import routing from './helpers/routing.mjs';
import { legendFacts } from '../src/sections/routing/logic/legend.js';
import { routingPlaceholders } from '../src/sections/routing/uk.js';
import { checkRow } from '../src/sections/routing/logic/static.js';
import cisco from '../src/sections/routing/syntax/cisco.js';
import routeros from '../src/sections/routing/syntax/mikrotik.js';
import { network } from '../src/engine/ip.js';

const { tasks } = h.routingBank;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g;
/** The legend's paragraphs as rendered. */
const legendOf = html => [...(html.match(/<div class="ng-aside ng-rt-legend[^"]*">([\s\S]*?)<\/div><\/div>/)?.[1] ?? '').matchAll(/<p>([^<]*)<\/p>/g)].map(m => unescape(m[1]));

/** Who owns an address in this instance: the device whose interface has it, or null. */
const ownerOf = (net, ip) => net.devices.find(d => d.interfaces.some(i => i.address?.ip === ip))?.id ?? null;

function screenOf(record, variantId, seed, syntax) {
  const store = h.testStore();
  store.dispatch({ type: 'pref', name: 'syntax', value: syntax });
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, variants: { [record.id]: variantId }, seeds: { [record.id]: seed } } });
  return unescape(store.render(h.RoutingScreen, { bank: h.routingBank }));
}

for (const seed of [null, 51]) test(`R4 on screen: every task, variant and vendor's legend names this instance's own LAN, link ends and ISP gateway, seed=${seed}`, () => {
  let checked = 0;
  for (const record of tasks) for (const variant of record.variants) for (const syntax of ['cisco', 'routeros']) {
    const task = routing.create(record, { variantId: variant.id, seed, bank: h.routingBank });
    const net = task.network, facts = legendFacts(task, syntax), where = `${record.id}/${variant.id}/${syntax}/${seed}`;
    const html = screenOf(record, variant.id, seed, syntax);
    const legend = legendOf(html);
    assert.ok(legend.length >= 1, `${where}: the legend is open on the first visit`);
    // The LAN example: its network, its router's port in this vendor and that port's own address.
    const lan = legend.find(p => p.startsWith('У рамці мережі'));
    assert.ok(lan.includes(`(${facts.lan.network})`) && lan.includes(`(${facts.lan.port} .${facts.lan.address.split('.').pop()} = ${facts.lan.address})`), `${where}: ${lan}`);
    // The link example: each end named with the router that owns it (both vendors, renumbered too).
    const link = legend.find(p => p.startsWith('На лінку'));
    const routers = net.devices.filter(d => d.kind === 'router').map(d => d.id);
    if (facts.link.ends.every(e => routers.includes(e.router))) {
      for (const end of facts.link.ends) {
        assert.ok(link.includes(`${end.address} — кінець ${end.router}`), `${where}: ${link}`);
        assert.equal(ownerOf(net, end.address), end.router, `${where}: ${end.address} belongs to ${end.router}`);
      }
      assert.ok(link.includes(`(${facts.link.network})`));
    } else assert.equal(link, undefined, `${where}: a WAN link is said in the ISP line, not as a link between routers`);
    // The ISP line: the ISP's own address, its owner named.
    const isp = legend.find(p => p.startsWith('У хмарі'));
    const gateway = h.ispEnd(net);
    if (net.endpoints.some(e => e.kind === 'internet')) {
      assert.ok(isp, `${where}: an internet task explains the cloud`);
      if (gateway) assert.ok(isp.includes(`(${gateway.address} — кінець ${gateway.router})`) && ownerOf(net, gateway.address) === gateway.router, `${where}: ${isp}`);
    } else assert.equal(isp, undefined);
    // One address world: every address the legend prints is this instance's (an interface or a segment's network).
    const own = new Set(net.devices.flatMap(d => d.interfaces.filter(i => i.address).flatMap(i => [i.address.ip, `${network(i.address.ip, i.address.prefix)}/${i.address.prefix}`])));
    for (const ip of legend.join(' ').match(ipv4) ?? []) assert.ok(own.has(ip), `${where}: ${ip} is not this task's`);
    // The fields' placeholders on screen are symbols: no address but the default route's constant.
    // (The default route's constant: «0.0.0.0/0», in Cisco's two fields «0.0.0.0».)
    for (const [, placeholder] of html.matchAll(/<input[^>]*placeholder="([^"]*)"/g)) {
      for (const ip of placeholder.match(ipv4) ?? []) assert.ok([routingPlaceholders.defaultRoute, '0.0.0.0'].includes(ip) || (teachesDistanceTask(record) && placeholder === routingPlaceholders.distanceExample), `${where}: placeholder ${placeholder}`);
    }
    assert.ok(!/192\.0\.2\.|198\.51\.100\.|203\.0\.113\./.test(legend.join(' ')), `${where}: no documentation addresses`);
    checked++;
  }
  assert.ok(checked >= 38, checked); // every variant (19) in both vendors
});
const teachesDistanceTask = record => record.displayNumber === 15;

/** The placeholders of the rendered inputs whose id starts with `prefix`: { [row]: { [field]: placeholder } }. */
function placeholders(html, prefix) {
  const out = {};
  for (const [, row, field, placeholder] of html.matchAll(new RegExp(`<input[^>]*id="${prefix.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(\\w+)-(\\w+)"[^>]*placeholder="([^"]*)"`, 'g'))) (out[row] ??= {})[field] = placeholder;
  return out;
}
/** Every rendered placeholder fails its field's check in an otherwise valid route; the allowed constants and
 * task 15's distance example are the only exemptions. `of(router, index)`: the placeholders that route's row shows. */
function expectRenderedFail(task, adapter, of, where) {
  let checked = 0;
  for (const [router, routes] of Object.entries(task.variant.referenceRoutes)) for (const [index, route] of routes.entries()) {
    const valid = adapter.fromRoute(route, route.distance != null);
    assert.equal(checkRow(task, router, index, valid, adapter.id).ok, true);
    const shown = of(router, index) ?? {};
    for (const field of adapter.fields) {
      if (field.distance && (route.distance == null || task.record.displayNumber === 15)) continue;
      if (adapter.id === 'routeros' && field.name === 'gw' && route.discard) continue; // disabled
      const placeholder = shown[field.name];
      assert.equal(typeof placeholder, 'string', `${where} ${router}#${index}: no rendered ${field.name} placeholder`);
      if (route.prefix === 0 && (placeholder === routingPlaceholders.defaultRoute || (adapter.id === 'cisco' && placeholder === '0.0.0.0'))) continue; // the allowed constant
      assert.equal(checkRow(task, router, index, { ...valid, [field.name]: placeholder }, adapter.id)[field.okKey], false, `${where} ${router}#${index} ${field.name}: «${placeholder}» passes`);
      checked++;
    }
  }
  return checked;
}

test('R4: the placeholders rendered in guided, free and fault rows fail their field\'s check in every task, variant, vendor and renumbered instance', () => {
  let fields = 0;
  for (const seed of [null, 51]) for (const record of tasks) for (const variant of record.variants) {
    const task = routing.create(record, { variantId: variant.id, seed, bank: h.routingBank });
    const routers = task.network.devices.filter(d => d.kind === 'router').map(d => d.id);
    for (const adapter of [cisco, routeros]) {
      const where = `${record.id}/${variant.id}/${adapter.id}/${seed}`;
      // Guided: each router's rows as the screen renders them (the default route's constant included).
      const guided = Object.fromEntries(routers.map(router => {
        const store = h.testStore();
        store.dispatch({ type: 'pref', name: 'syntax', value: adapter.id });
        store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router, variants: { [record.id]: variant.id }, seeds: { [record.id]: seed } } });
        return [router, placeholders(unescape(store.render(h.RoutingScreen, { bank: h.routingBank })), `rt-${router}-`)];
      }));
      fields += expectRenderedFail(task, adapter, (router, index) => guided[router][index], `${where} guided`);
      // Free mode's blank row #1 (the same words on every free row) and the fault table's row.
      const store = h.testStore();
      store.dispatch({ type: 'pref', name: 'syntax', value: adapter.id });
      store.dispatch({ type: 'pref', name: 'mode', value: 'free' });
      store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, variants: { [record.id]: variant.id }, seeds: { [record.id]: seed } } });
      const free = Object.values(placeholders(unescape(store.render(h.RoutingScreen, { bank: h.routingBank })), `rt-${routers[0]}-`))[0];
      fields += expectRenderedFail(task, adapter, () => free, `${where} free`);
      const fault = placeholders(unescape(h.renderFaultRow(adapter.id, true)), 'rt-R1-')['f1'];
      fields += expectRenderedFail(task, adapter, () => fault, `${where} fault`);
    }
  }
  assert.ok(fields > 1500, fields);
  // The screen's own words for the default route and task 15 (repair v1, Fable 2 and 3).
  const field = (adapter, name) => adapter.fields.find(f => f.name === name);
  assert.deepEqual(['net', 'mask'].map(n => h.placeholderOf(cisco, field(cisco, n), { isDefault: true })), ['0.0.0.0', '0.0.0.0']);
  assert.equal(h.placeholderOf(routeros, field(routeros, 'dst'), { isDefault: true }), '0.0.0.0/0');
  assert.equal(h.placeholderOf(cisco, field(cisco, 'gw'), { isDefault: true }), 'адреса сусіда');
  assert.equal(h.teachesDistance(routing.create(tasks.find(r => r.displayNumber === 15))), true);
  assert.equal(h.placeholderOf(cisco, field(cisco, 'dist'), { distanceExample: true }), '1 — основний, 5 — резервний');
  assert.equal(h.placeholderOf(cisco, field(cisco, 'dist'), { distanceExample: false }), 'distance');
});

test('«адреси цього роутера»: the heading in the firewall\'s words; a link names the router at its other end, the address is this router\'s own', () => {
  const task = routing.create(tasks[0]);
  assert.deepEqual(h.interfacesOf(task.network, 'R1', cisco).map(i => `${i.name} · ${i.note} · ${i.ip}`), ['g0/0 · LAN-A · 192.168.1.1/24', 'g0/1 · до R2 · 10.0.0.1/30']);
  assert.deepEqual(h.interfacesOf(task.network, 'R2', routeros).map(i => i.note), ['до R1', 'LAN-B']);
  const html = screenOf(tasks[0], tasks[0].variants[0].id, null, 'cisco');
  assert.ok(html.includes('>АДРЕСИ ЦЬОГО РОУТЕРА — R1</h3>') && html.includes('<ul class="ng-rt-ifaces" data-count="2">') && !html.includes('→R2'));
  // Every task: no arrow left in any router's list; a link always names its peers.
  for (const record of tasks) for (const variant of record.variants) {
    const t = routing.create(record, { variantId: variant.id });
    for (const router of t.network.devices.filter(d => d.kind === 'router')) for (const row of h.interfacesOf(t.network, router.id, cisco)) assert.ok(!String(row.note).includes('→'), `${record.id}: ${row.note}`);
  }
});

test('binary level 1 row: one band captioned over the given octets, octet 4 outside it with the input look; without a band, as before', () => {
  const given = [true, true, true, false];
  const html = h.renderRow({ given, band: 'Октети 1–3 · задано' });
  const band = html.match(/<div class="ng-bitband" role="group" aria-labelledby="([^"]+)"><p class="ng-bitband-caption" id="([^"]+)">Октети 1–3 · задано<\/p><div class="ng-bitband-octets">([\s\S]*?)<\/div><\/div><div class="ng-bitoctet"/);
  assert.ok(band, html.slice(0, 400));
  assert.equal(band[1], band[2], 'the band is named by its caption');
  assert.equal((band[3].match(/class="ng-bitoctet is-given"/g) ?? []).length, 3);
  assert.ok(html.includes('class="ng-bitrow has-band"'));
  assert.equal((html.match(/class="ng-bitoctet"/g) ?? []).length, 1, 'octet 4 alone outside the band');
  const text = h.renderRow({ given, band: 'Октети 1–3 · задано', text: true });
  assert.ok(text.includes('class="ng-bitrow is-text has-band"') && (text.match(/class="ng-bittext is-given"/g) ?? []).length === 3);
  const plain = h.renderRow({ given });
  assert.ok(!plain.includes('ng-bitband') && plain.includes('class="ng-bitrow"'));
});

// ── The gate's essentials for routing and the binary walk (spec 5b-1 v2.1 matrix, v2.2) ──
import { allOf, declaredEssentials, essentialRecipes, essentialsOf, expectedTargets, gateStates, measureEssentials, MIN_FONT_PX } from '../tools/shots.mjs';
import { browserSkip, launchChromium } from '../tools/browser.mjs';

const entry = (list, part) => list.find(e => (typeof e === 'string' ? e : e.sel).includes(part));
const countOf = (list, part) => entry(list, part)?.count;
test('R5 recipe: routing and the binary walk declare their first views\' essentials with the matrix counts', () => {
  for (const id of ['rt-guided', 'rt-hard', 'rt-free', 'rt-mikrotik', 'rt-fault', 'binary']) {
    assert.ok(essentialRecipes.has(id), id);
    assert.deepEqual(declaredEssentials(id, 'first').failures, [], id);
  }
  for (const id of ['rt-guided', 'rt-free', 'rt-mikrotik', 'rt-hard']) {
    const list = essentialsOf(id, 'first');
    assert.equal(countOf(list, '.ng-rt-desc'), 1);
    assert.equal(countOf(list, '.ng-rt-work .ng-action-line'), 1);
    assert.deepEqual(countOf(list, '.ng-rt-ifaces > li'), { from: '.ng-rt-ifaces', attr: 'data-count', times: 1 }, 'every one of the router\'s own addresses');
    assert.equal(countOf(list, '.ng-rt-field:not(.ng-rt-f-dist)'), id === 'rt-mikrotik' ? 2 : 3, 'the first route\'s fields');
    assert.equal(countOf(list, '.ng-rt-help .ng-help-check'), 1);
  }
  for (const id of ['rt-guided', 'rt-free', 'rt-mikrotik']) {
    const list = essentialsOf(id, 'first');
    assert.equal(countOf(list, 'data-ep="lan"'), 2, 'the destination LAN\'s network box (task 1: both LANs)');
    assert.equal(countOf(list, '.ng-dg-end'), 2, 'both ends of the link');
  }
  const hard = essentialsOf('rt-hard', 'first');
  assert.equal(countOf(hard, '> g.ng-dg-ep.is-gw .ng-dg-ep-ip'), 2, 'both ISP gateways');
  // Repair v1 (Astra 1): both distances, two distinct fields, at both sizes (no short-window exception).
  const distances = hard.filter(e => typeof e !== 'string' && e.sel.endsWith('.ng-rt-f-dist'));
  assert.deepEqual(distances.map(e => [e.sel, e.count]), [['.ng-rt-rows .ng-rt-rowlist > .ng-rt-row:first-child .ng-rt-f-dist', 1], ['.ng-rt-rows .ng-rt-rowlist > .ng-rt-row:nth-child(2) .ng-rt-f-dist', 1]]);
  assert.ok(!distances.some(e => e.sel.includes('data-short')));
  // Repair v1 (Fable 1): its LAN's network label, so a cut diagram fails the gate.
  assert.ok(entry(hard, 'data-ep="lan"'), 'the LAN network label');
  const fault = essentialsOf('rt-fault', 'first');
  for (const part of ['.ng-rf-task', '.ng-rf-work .ng-action-line', '.ng-rf-rowlist > .ng-rt-row:first-child', '.ng-rf-help .ng-help-check']) assert.equal(countOf(fault, part), 1, part);
  // Repair v1 (Astra 2): the labels themselves, as many as the task has (two ends per link).
  assert.deepEqual(['.ng-dg-name', '.ng-dg-end', '.is-gw .ng-dg-ep-ip', 'li.is-fail'].map(part => countOf(fault, part)), [
    { from: '.ng-rf-stage .ng-dg-svg', attr: 'data-routers', times: 1 }, { from: '.ng-rf-stage .ng-dg-svg', attr: 'data-links', times: 2 },
    { from: '.ng-rf-stage .ng-dg-svg', attr: 'data-gateways', times: 1 }, { from: '.ng-rf-pinglist', attr: 'data-failing', times: 1 }]);
  const l1 = essentialsOf('binary', 'l1-first'), text = essentialsOf('binary', 'l1-text'), l3 = essentialsOf('binary', 'first');
  for (const list of [l1, text]) for (const part of ['.ng-bin-question', '.ng-bin-now .ng-action-line', '.ng-bitband-caption', '.ng-help-check']) assert.equal(countOf(list, part), 1, part);
  assert.equal(countOf(l1, '.ng-bitoctet:not(.is-given) .ng-bit'), 8, 'octet 4\'s toggles');
  assert.equal(countOf(text, '.ng-bittext:not(.is-given)'), 1, 'octet 4\'s field');
  assert.equal(countOf(l3, '.ng-bitrow .ng-bit'), 32);
  assert.ok(gateStates({ id: 'binary', states: ['first', 'l1-first', 'l1-text'] }).includes('l1-text'));
  assert.equal(expectedTargets('binary', 'l1-text').kind, null, 'text mode\'s first view: nothing may scroll there');
});

const noBrowser = browserSkip();
test('R5 «all» counts labels: as many as the task\'s count pass; a label lost from a kept group, an extra one or a hidden one fails; 0 needs none', { skip: noBrowser }, async () => {
  const browser = await launchChromium();
  // A drawing like the fault diagram: each router a group with its name, each link a group with its two ends.
  const router = (name, label = true) => `<g class="r"><circle cx="20" cy="20" r="8" fill="#123"/>${label ? `<text class="name" x="10" y="45" font-size="14" fill="#fff">${name}</text>` : ''}</g>`;
  const link = (a, b) => `<g class="l"><text x="80" y="30" font-size="14" fill="#fff"><tspan class="end">${a}</tspan> ↔ ${b === null ? '' : `<tspan class="end">${b}</tspan>`}</text></g>`;
  const svg = (routers, links, body) => `<svg class="d" width="600" height="200" data-routers="${routers}" data-links="${links}">${body}</svg>`;
  const names = allOf('.d .name', '.d', 'routers'), ends = allOf('.d .end', '.d', 'links', 2);
  const cases = {
    'every name and both ends of every link': { html: svg(2, 1, router('R1') + `<g transform="translate(200)">${router('R2')}</g>` + link('10.0.0.1', '10.0.0.2')), pass: true },
    'a router\'s name deleted, its group kept': { html: svg(2, 1, router('R1') + `<g transform="translate(200)">${router('R2', false)}</g>` + link('10.0.0.1', '10.0.0.2')), fail: /expected 2, found 1/ },
    'a link end deleted, its group kept': { html: svg(2, 1, router('R1') + `<g transform="translate(200)">${router('R2')}</g>` + link('10.0.0.1', null)), fail: /expected 2, found 1/ },
    'an extra name': { html: svg(1, 1, router('R1') + `<g transform="translate(200)">${router('R2')}</g>` + link('10.0.0.1', '10.0.0.2')), fail: /expected 1, found 2/ },
    'a name hidden': { html: svg(2, 1, router('R1') + `<g transform="translate(200)" style="visibility:hidden">${router('R2')}</g>` + link('10.0.0.1', '10.0.0.2')), fail: /not rendered/ },
    'no links, no ends: nothing required': { html: svg(1, 0, router('R1')), pass: true },
    'no count on the drawing': { html: `<svg class="d" width="600" height="200">${router('R1')}</svg>`, fail: /no count on \.d/ },
    // Repair v2 (Astra): a blank, spaced or malformed count is no count (Number('') would be 0, a false pass).
    'a blank count, no labels': { html: '<svg class="d" width="600" height="200" data-routers="" data-links=""></svg>', fail: /no count on \.d/ },
    'a whitespace count, no labels': { html: '<svg class="d" width="600" height="200" data-routers=" " data-links="  "></svg>', fail: /no count on \.d/ },
    'a malformed count': { html: svg('2x', 0, router('R1')), fail: /no count on \.d/ },
    'a negative count': { html: svg('-1', 0, router('R1')), fail: /no count on \.d/ },
    'an explicit 0, no labels': { html: '<svg class="d" width="600" height="200" data-routers="0" data-links="0"></svg>', pass: true },
  };
  try {
    const p = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    for (const [name, c] of Object.entries(cases)) {
      await p.setContent(`<!doctype html><body style="font:16px sans-serif; background:#000">${c.html}</body>`);
      const reasons = (await p.evaluate(measureEssentials, { essentials: [names, ends], minFont: MIN_FONT_PX })).failures.map(f => f.reason);
      if (c.pass) assert.deepEqual(reasons, [], name);
      else assert.ok(reasons.some(r => c.fail.test(r)), `${name}: ${JSON.stringify(reasons)}`);
    }
  } finally { await browser.close(); }
});

// ── Repair v1 (Astra 3, 4; Fable 2, 5) ──
import { faultsUi } from '../src/sections/routing/uk.js';
import { binaryLevel1Text } from '../src/sections/ip/uk.js';

test('a long task in a short window: its first sentence, the rest behind «Уся умова»', () => {
  const task15 = tasks.find(r => r.displayNumber === 15).variants[0].text;
  const text = typeof task15 === 'string' ? task15 : task15.cisco ?? Object.values(task15)[0];
  const parts = h.firstSentence(text);
  assert.equal(parts.first, 'Два аплінки: ISP1 основний, ISP2 резервний.');
  assert.ok(parts.rest.startsWith('Обидва — маршрути за замовчуванням') && `${parts.first} ${parts.rest}` === text);
  assert.deepEqual(h.firstSentence('Одне речення без продовження.'), { first: 'Одне речення без продовження.', rest: '' });
  assert.deepEqual(h.firstSentence('Відстань 1.5 не буває. Друге.'), { first: 'Відстань 1.5 не буває.', rest: 'Друге.' });
});

test('fault action line: trace the ping and find the error in the tables (the device where it stops is not necessarily the faulty router)', () => {
  assert.equal(faultsUi.action, 'Простеж шлях пінгу, знайди помилку в таблицях маршрутів і виправ її.');
  assert.ok(!/на тому роутері|де зупиняється/.test(faultsUi.action));
  assert.equal(faultsUi.actionCause, 'Обери причину й натисни «Перевірити».');
});

test('binary level 1, step 2: no plural to agree with the count, /25–/30, both input modes', () => {
  for (let prefix = 25; prefix <= 30; prefix++) {
    const task = { ip: '192.168.70.117', prefix };
    const toggles = binaryLevel1Text(task, { step: 1, mode: 'toggles' }).action, text = binaryLevel1Text(task, { step: 1, mode: 'text' }).action;
    assert.equal(toggles, `Одиниць зліва: ${prefix - 24}. Увімкни їх, решту залиш нулями.`);
    assert.equal(text, `Одиниць зліва: ${prefix - 24}, далі — нулі.`);
    for (const line of [toggles, text]) assert.ok(!/\d+ (бітів|біти|біт|одиниць|одиниці|одиницю)\b/.test(line), line);
  }
});

test('a router with no routes in guided mode: one line says so (the rows\' note), no action line pointing at a route #1', () => {
  const record = structuredClone(tasks[0]);
  for (const variant of record.variants) { variant.scaffold.R2 = []; variant.referenceRoutes.R2 = []; }
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router: 'R2' } });
  let html;
  try { html = unescape(store.render(h.RoutingScreen, { bank: { ...h.routingBank, tasks: [record, ...tasks.slice(1)] } })); } catch (error) { return assert.match(String(error), /invalid|record/i); }
  assert.ok(html.includes('Маршрути не потрібні: усе підключено напряму.') && !html.includes('ng-action-line'), 'the note alone');
  store.dispatch({ type: 'place', scope: 'routing', patch: { router: 'R1' } });
  assert.ok(unescape(store.render(h.RoutingScreen, { bank: { ...h.routingBank, tasks: [record, ...tasks.slice(1)] } })).includes('Заповни маршрут #1 і натисни «Перевірити».'));
});
