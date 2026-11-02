// «Текстом» (round 2 step 7): the diagram's text equivalent is generated
// from the network's givens in the active syntax (src/ui/topology/describe.js)
// and rendered by the generic TextEquivalent. It must name every router,
// provider, interface (with its address or DHCP) and segment (with its
// network), and nothing the diagram doesn't show.
import test from 'node:test';
import assert from 'node:assert/strict';
import tasks from '../src/banks/routing/tasks.js';
import { network } from '../src/engine/ip.js';
import { describeLines, describeNetwork } from '../src/ui/topology/describe.js';
import routing from './helpers/routing.mjs';
import { syntaxList } from '../src/sections/routing/syntax/index.js';
import { normalise } from './helpers/routing-leaks.mjs';
import * as surfaces from '../.test-bundles/harness/routing-leaks.mjs';
import * as h from '../.test-bundles/harness/contract.mjs';

test('text equivalent: every router, provider, interface and segment of all 17 tasks, in both syntaxes', () => {
  let interfaces = 0, segments = 0;
  for (const record of tasks) for (const syntax of syntaxList) {
    const net = record.network;
    const text = describeLines(net, syntax.id).join('\n');
    const label = `#${record.displayNumber} ${syntax.id}`;
    for (const device of net.devices) {
      assert.ok(text.includes(device.id), `${label}: ${device.id}`);
      if (device.kind !== 'router') continue;
      for (const iface of device.interfaces) {
        interfaces++;
        const address = iface.address ? `${iface.address.ip}/${iface.address.prefix}` : 'адреса по DHCP';
        assert.ok(text.includes(`${device.id} ${iface.labels[syntax.id]} ${address}`), `${label}: ${device.id} ${iface.labels[syntax.id]}`);
      }
    }
    for (const segment of net.segments) {
      segments++;
      const members = net.devices.flatMap(d => d.interfaces.filter(i => i.segmentId === segment.id && i.address));
      const routerMembers = net.devices.filter(d => d.kind === 'router').flatMap(d => d.interfaces.filter(i => i.segmentId === segment.id && i.address));
      if (routerMembers.length) {
        const a = routerMembers[0].address;
        assert.ok(text.includes(`${network(a.ip, a.prefix)}/${a.prefix}`), `${label}: network of ${segment.name}`);
      }
      if (segment.kind !== 'link') assert.ok(text.includes(segment.name), `${label}: ${segment.name}`);
      // A provider's own address is not drawn on the diagram, so it isn't said either.
      for (const iface of members.filter(i => !routerMembers.includes(i))) assert.ok(!text.includes(iface.address.ip + '/'), `${label}: no provider address`);
    }
    // In the active syntax's interface names only.
    const other = syntaxList.find(s => s.id !== syntax.id).id;
    for (const iface of net.devices.flatMap(d => d.interfaces)) {
      if (iface.labels[other] && iface.labels[other] !== iface.labels[syntax.id]) assert.ok(!text.includes(` ${iface.labels[other]} `), `${label}: no ${other} names`);
    }
  }
  assert.equal(interfaces, 288);
  assert.equal(segments, 2 * tasks.reduce((n, r) => n + r.network.segments.length, 0));
});

test('text equivalent: the rendered panel says the same, and nothing when closed', () => {
  for (const record of tasks) for (const syntax of syntaxList) {
    const task = routing.create(record);
    const raw = surfaces.renderTextEquivalent(task, syntax);
    assert.ok(raw.includes('class="ng-overlay-close"') && raw.includes('Закрити'), 'a visible close button');
    const html = normalise(raw);
    for (const section of describeNetwork(record.network, syntax.id)) {
      assert.ok(html.includes(section.heading));
      for (const item of section.items) assert.ok(html.includes(normalise(item)), item);
    }
  }
  // On the screen: a real button under the diagram, its panel (an overlay on
  // the diagram frame, step 7 fix) empty until opened; the old ASCII string
  // is gone (it missed LANs on task 8 and the ISPs on 15).
  const store = h.testStore();
  store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: tasks[7].id, router: null, filterLevel: 0, variants: {} } });
  const screen = store.render(h.RoutingScreen, { bank: h.routingBank });
  assert.match(screen, /<button type="button" class="ng-te-button is-link" aria-expanded="false" aria-controls="ng-rt-text">Текстом/);
  assert.match(screen, /<section id="ng-rt-text" class="ng-overlay ng-te-panel" aria-label="Схема текстом" hidden=""><\/section>/);
  // «Текстом» sits in the drawing's area, after the frame, not in the page flow
  // (round 4: «Правила» moved to the «⋯» menu, opening in the work area).
  const view = screen.slice(screen.indexOf('class="ng-dg-view"'), screen.indexOf('class="ng-rt-routers"'));
  assert.ok(view.includes('id="ng-rt-text"') && !screen.includes('id="ng-rt-rules-panel"'), 'the text overlay inside .ng-dg-view');
  assert.ok(!screen.includes('ASCII') && !screen.includes(tasks[7].topology.routeros ?? tasks[7].topology));
});
