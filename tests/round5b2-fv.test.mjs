// Round 5, stage 5b-2, firewall and VLAN screens (spec 5b-2 B, E and the
// worked examples of A): the screen side, rendered on the server.
//   - «Передбач» level 2: the stepper's words for each frame come from the
//     trace (logic/trace.js), RouterOS numbers from 0 as the table shows;
//   - «Порядок правил»: the router's addresses as a line where the diagram
//     is after the list (narrow);
//   - «Налаштуй порти», «Між VLAN»: one folded worked example right under
//     the action line, of the example's own instance and syntax; the ports
//     form starts with its rows (the VLANs to create after them), the list
//     fields' placeholders are symbolic; «Між VLAN»'s administrative state
//     and task 1's «на паличці» line;
//   - «Куди дійде кадр»: the action line says to go by the table's VLAN;
//   - «Знайди несправність», «Ремонт»: the device tab says which one is
//     being looked at, never «Виправ».
// The mounted lifecycle (opening, closing on a new task, the hints, the
// shadow walk) is in tests/helpers/mounted-firewall.mjs and mounted-vlan.mjs;
// the R5 and example rows in the gate (tools/shots.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { expectWorkedExample } from './helpers/worked-example.mjs';
import fw, { commit, initialCommitState, solution } from '../src/sections/firewall/logic/predict.js';
import { traceCaptions } from '../src/sections/firewall/logic/trace.js';
import { records, resolveRecord } from './helpers/firewall.mjs';
import { chainRows, stepCaptions, walkPlan } from '../src/sections/firewall/screens/walkView.js';
import { orderUi } from '../src/sections/firewall/uk.js';
import { comprehension as words, routeUi, ui } from '../src/sections/vlan/uk.js';
import { interVlanExample, portsExample } from '../src/sections/vlan/logic/examples.js';
import { interVlanAction } from '../src/sections/vlan/logic/route-action.js';
import { paramsOf } from '../src/sections/vlan/screens/faultsState.js';

const h = await import('../.test-bundles/harness/vlan.mjs');
const { bank, ports, route } = h;
const unescape = html => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const storeFor = ({ place, prefs = {}, key, view }) => {
  const state = h.initialStore(prefs);
  state.places.vlan = place;
  if (key) state.instances[key] = { ...h.initialInstance(), view };
  return state;
};

// ── Firewall ─────────────────────────────────────────────────────────────

test('5b-2 firewall: the stepper names every frame from the trace: the start, the arrival, the chain, each lit row', () => {
  const record = resolveRecord(records[0]);
  let seen = 0;
  for (let seed = 1; seed < 40 && seen < 12; seed++) {
    const task = fw.create(record, { variantId: 'basic', seed, level: 2 });
    for (const card of task.cards) {
      const answer = solution(task)[card.id];
      const walk = commit(task, initialCommitState(task), card.id, answer).result.evidence[card.id];
      const { rows } = chainRows(task, walk.hook);
      const plan = walkPlan(task, walk, rows);
      const captions = stepCaptions(traceCaptions({ policy: task.policy, card, walk }), card, rows, plan);
      assert.equal(captions.length, plan.last + 1, 'one caption per frame');
      assert.ok(captions.every(c => typeof c === 'string' && c.length > 0), captions.join(' | '));
      assert.match(captions[0], new RegExp(`^Пакет ${card.packet.srcIp.replace(/\./g, '\\.')} → \\S+ вирушає$`));
      assert.match(captions[1], new RegExp(`^Пакет приходить на ${card.facts.ingress}`));
      if (card.facts.dstNat === true) assert.match(captions[1], /dst-NAT/);
      assert.equal(captions[2], `Ланцюжок ${walk.hook}`);
      // Each lit row by its number as the table shows it (RouterOS, from 0), or the chain's end.
      rows.slice(0, plan.rowsLit).forEach((row, i) => assert.ok(row.end ? captions[3 + i].startsWith(`Кінець ланцюжка ${walk.hook}`)
        : captions[3 + i].startsWith(`Правило ${row.n} · ${walk.hook}: `), `${row.end ? 'end' : row.n}: ${captions[3 + i]}`));
      seen++;
    }
  }
  assert.ok(seen >= 12);
});

test('5b-2 firewall: a port-forwarded packet sets off to the router\'s public address; the translation shows at arrival (repair v1, Astra 1)', () => {
  const record = resolveRecord(records[0]);
  for (let seed = 1; seed < 400; seed++) {
    const task = fw.create(record, { variantId: 'basic', seed, level: 2 });
    const card = task.cards.find(c => c.id === 'port-forward');
    if (!card) continue;
    const walk = commit(task, initialCommitState(task), card.id, solution(task)[card.id]).result.evidence[card.id];
    const { rows } = chainRows(task, walk.hook);
    const captions = stepCaptions(traceCaptions({ policy: task.policy, card, walk }), card, rows, walkPlan(task, walk, rows));
    // The bank's port-forward: 203.0.113.50 → 100.64.0.2:443, forwarded to the server 192.168.88.20.
    assert.equal(captions[0], 'Пакет 203.0.113.50 → 100.64.0.2 вирушає');
    assert.doesNotMatch(captions[0], /192\.168\.88\.20/);
    assert.equal(captions[1], 'Пакет приходить на ether1. dst-NAT: 100.64.0.2:443 → 192.168.88.20:443; фільтр бачить змінену адресу призначення');
    return;
  }
  assert.fail('no round with the port-forward card');
});

test('5b-2 firewall: the order screen\'s action line, and its words once the list passes', () => {
  assert.equal(orderUi.action, 'Постав правила в робочий порядок кнопками ↑ ↓.');
  assert.equal(orderUi.actionDone, 'Порядок прийнято.');
});

// ── VLAN: «Налаштуй порти» ───────────────────────────────────────────────

const portsHtml = (taskIndex, syntax) => {
  const place = { exercise: 'ports', portsTask: bank.ports[taskIndex].id, portsSeeds: { [bank.ports[taskIndex].id]: 3 } };
  return unescape(h.renderScreen(storeFor({ place, prefs: { syntax } })));
};

test('5b-2 VLAN ports: the folded worked example sits right under the action line, before the first port row', () => {
  for (const syntax of ['cisco', 'routeros']) for (const index of [0, 1, 3]) {
    const html = portsHtml(index, syntax);
    expectWorkedExample(html);
    assert.match(html, /id="ng-vl-ports-action" class="ng-action-line" data-action-line="">[^<]*<\/p><div class="ng-wex" data-worked-example="">/, `${syntax} task ${index + 1}`);
    assert.ok(html.indexOf('data-worked-example') < html.indexOf('<table class="ng-vl-form-table">'), 'above the first control');
  }
});

test('5b-2 VLAN ports: Cisco starts with the ports; the VLANs to create come after them, symbolic, as the allowed lists', () => {
  const html = portsHtml(1, 'cisco');
  assert.ok(html.indexOf('<table class="ng-vl-form-table">') < html.indexOf('id="vl-SW1-vlans"'), 'the VLANs to create after the port table');
  assert.match(html, /id="vl-SW1-vlans"[^>]*placeholder="номери VLAN через кому"/);
  assert.equal(words.vlansPlaceholder, 'номери VLAN через кому');
  assert.doesNotMatch(html, /placeholder="[^"]*\d+,\s?\d+/, 'no list placeholder shows numbers');
  assert.doesNotMatch(ui.portsAction.cisco + JSON.stringify(ui), /напр\. 10,20/);
});

test('5b-2 VLAN ports: the example is its own instance (VLAN 3xx on reserved addresses), never the task\'s values', () => {
  for (const syntax of ['cisco', 'routeros']) {
    const ex = portsExample({ syntax });
    for (const record of bank.ports) {
      const task = ports.create(record, { variantId: record.variants[0].id, seed: 3, syntax });
      for (const vid of task.vids) assert.ok(!ex.rows.flat().includes(String(vid)), `${record.id}: ${vid}`);
    }
    assert.ok(ex.rows.every(r => r.length === ex.columns.length));
  }
  // Each vendor's own steps (repair v1, Astra 2): no MikroTik wording in the Cisco example; RouterOS keeps its filtering step.
  const cisco = portsExample({ syntax: 'cisco' }), mt = portsExample({ syntax: 'routeros' });
  assert.doesNotMatch(`${cisco.context} ${cisco.columns.join(' ')} ${cisco.rows.flat().join(' ')}`, /MikroTik|RouterOS|фільтрац|PVID|bridge|ether\d/i);
  assert.match(mt.context, /фільтрацію увімкни після перевірки таблиці/);
});

// ── VLAN: «Між VLAN» ─────────────────────────────────────────────────────

const routeHtml = (record, syntax, seed = 5) => {
  const place = { exercise: 'route', routeTask: record.id, routeSeeds: { [record.id]: seed } };
  return unescape(h.renderScreen(storeFor({ place, prefs: { syntax } })));
};

test('5b-2 VLAN route: the folded worked example under the action line in every task and syntax, in that syntax', () => {
  for (const record of bank.route) for (const syntax of record.variants[0].syntaxes) {
    const html = routeHtml(record, syntax);
    const task = route.create(record, { variantId: 'main', seed: 5, syntax });
    expectWorkedExample(html);
    assert.ok(html.includes(`<p id="ng-vl-route-action" class="ng-action-line" data-action-line="">${interVlanAction(task, syntax)}</p><div class="ng-wex" data-worked-example="">`), `${record.id}/${syntax}`);
    assert.ok(html.indexOf('data-worked-example') < html.indexOf('ng-vl-form-head'), 'above the first control');
    // «На паличці» is said under the task named so (task 1), only there.
    assert.equal(html.includes(`<p class="ng-vl-stick">${words.routerOnStick}</p>`), task.taskNumber === 1, `${record.id}/${syntax}`);
  }
  assert.deepEqual(interVlanExample({ syntax: 'cisco' }).columns.length, interVlanExample({ syntax: 'cisco' }).rows[0].length);
});

test('5b-2 VLAN route: the administrative state reads «вимкнено» over shutdown, «увімкнено» over no shutdown, with its note', () => {
  const record = bank.route.find(r => r.id === 'vlan.route-1');
  const html = routeHtml(record, 'cisco');
  const task = route.create(record, { variantId: 'main', seed: 5, syntax: 'cisco' });
  const parent = task.topology.devices.find(d => d.id === 'R1').ports.find(p => task.topology.links.some(l => [l.a, l.b].some(e => e.device === 'R1' && e.port === p.id))).label.cisco;
  assert.match(html, new RegExp(`<span class="ng-vl-caption ng-vl-admin-label">${words.adminStateLabel} <span class="ng-vl-port">${parent}</span></span>`));
  assert.match(html, new RegExp(`role="radiogroup" aria-label="${parent}: адміністративний стан"`));
  const options = [...html.matchAll(/<button[^>]*role="radio"[^>]*>(<span class="ng-vl-mode"><span class="ng-vl-mode-word">[^<]*<\/span> <span class="ng-vl-mode-term">[^<]*<\/span><\/span>)<\/button>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '')).filter(t => /shutdown/.test(t));
  assert.deepEqual(options, ['вимкнено (shutdown)', 'увімкнено (no shutdown)']);
  assert.ok(html.includes(`<span class="ng-vl-muted ng-vl-admin-note">${words.adminStateNote}</span>`));
  assert.ok(!('physical' in routeUi) && !('states' in routeUi), 'the old «Фізичний інтерфейс» words are gone');
});

// ── VLAN: «Куди дійде кадр», «Знайди несправність» ───────────────────────

test('5b-2 VLAN predict: the action line says to go by the table\'s VLAN, not the addresses', () => {
  const task = h.predict.create(bank.predict, { variantId: 'p1', seed: 7, vendor: 'cisco', surprises: 0 });
  const place = { exercise: 'predict', shape: 'p1', predict: { 'p1|cisco': { seed: 7, level: 0 } } };
  const html = unescape(h.renderScreen(storeFor({ place, prefs: { syntax: 'cisco' }, key: task.instanceKey, view: {} })));
  assert.ok(html.includes(`<p id="ng-vl-predict-action" class="ng-action-line" data-action-line="">${words.frameAction}</p>`));
  assert.ok(!('predictAction' in ui));
});

test('5b-2 VLAN faults: «Ремонт» heads its form «Зараз: <device>», never «Виправ»', () => {
  assert.equal(words.inspecting('SW2'), 'Зараз: SW2');
  for (const vendor of ['cisco', 'routeros']) {
    const place = { ...h.firstPlace(bank), exercise: 'faults' };
    const task = h.faults.create(bank.faults[0], paramsOf(vendor, place.faults[vendor]));
    const state = storeFor({ place, prefs: { syntax: vendor }, key: task.instanceKey, view: { stage: 'repair' } });
    const html = unescape(h.renderScreen(state));
    const devices = task.topology.devices.filter(d => d.kind !== 'host').map(d => d.id);
    assert.match(html, new RegExp(`<h2 tabindex="-1" class="ng-vl-caption">Зараз: (${devices.join('|')})</h2>`), vendor);
    assert.doesNotMatch(html, /Виправ:/);
  }
});
