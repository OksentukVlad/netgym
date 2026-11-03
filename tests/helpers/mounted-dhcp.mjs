// Mounted scenarios for «DHCP і NAT» (round 6): the real DhcpScreen in the
// app store, mounted with react-dom/client in tests/helpers/mini-dom.mjs.
// Run in its own process by tests/dhcp-mounted.test.mjs (tools/test.sh runs
// it first and passes the results file). Prints one JSON line: { results }.
//   - E1: a card's purpose and native line (both vendors), a wrong side that
//     stays marked and lets the learner choose again, the right side's port
//     label outlined after either answer, the lock and the action line's
//     words, the next card, the round's end with a task-scope ✓ and a new
//     round on renumbered addresses;
//   - E2: the strip's marker, band and text as the learner types; a finding
//     that marks a device's pin; step 2 opening in place with the range
//     locked; the client rows and native lines from the learner's own
//     answer; the reveal path (the reference only after the press); Cisco
//     L3's rows (their commands, «+ ще один рядок» up to three, removal, a
//     blank row left out of the strip); the MikroTik wizard in its order;
//   - E3: the website card's two choices, the replay (four captions, each
//     outlining its address, the remembered pair), the LAN server only on
//     its card; level 2 for both vendors (Cisco's inside step first);
//   - the worked example closed on every exercise; no React warnings.
import { installDom } from './mini-dom.mjs';

const { document, fire } = installDom();
let random = 0;
Math.random = () => (random = (random + 0.1234567) % 1);
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const h = await import('../../.test-bundles/harness/mounted-dhcp.mjs');
const { act, sides, server, nat, createTopology, words, answerOf } = h;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = el => act(() => { el.focus?.(); fire(el, 'click'); });
const type = (el, value) => act(() => { el.value = value; fire(el, 'input'); });
const radio = name => all('[role="radio"]').find(el => text(el).startsWith(name));
const option = words => all('.ng-dh-option').find(el => text(el).includes(words));
const button = words => all('button').find(el => text(el).includes(words));
const status = () => text(q('[data-help-current]'));
const tone = () => q('[data-help-current]')?.getAttribute('data-help-tone') ?? null;
/** A command block's lines as its text reads (the lines joined by line breaks). */
const lines = list => list.join(' ').replace(/\s+/g, ' ').trim();
const lit = () => all('[data-highlight]').map(el => el.getAttribute('data-hl'));
const labelled = name => {
  const label = all('label').find(el => text(el) === name);
  return label ? all('input').find(el => el.getAttribute('id') === label.getAttribute('for')) ?? null : null;
};

function scenario(name, fn) {
  const m = h.mountDhcp();
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}
const placeOf = m => m.store.state.places.dhcp;

// ── E1 «WAN чи LAN» ──
scenario('E1', m => {
  const { seed, other } = placeOf(m).sides;
  const cards = sides.createRound(seed, { otherAddresses: other });
  const card = () => cards[Number(text(q('.ng-dh-progress')).match(/картка (\d+)/)[1]) - 1];
  check('E1: the first card, «картка 1 з 6», its purpose and the Cisco line', text(q('.ng-dh-progress')) === 'картка 1 з 6'
    && text(q('.ng-dh-purpose')) === cards[0].purpose && text(q('.ng-dh-native')).includes(cards[0].native.cisco.split('\n')[0]), text(q('.ng-dh-card')));
  check('E1: two sides, nothing chosen, no verdict', all('.ng-dh-sides .ng-dh-option').length === 2 && !all('[aria-checked="true"]').some(el => el.closest('.ng-dh-sides')) && !q('[data-help-current]'));
  check('E1: the action line names the group', q('.ng-dh-sides').getAttribute('aria-labelledby') === 'ng-dh-action' && text(q('#ng-dh-action')) === words.actions.sides);
  check('E1: the worked example is folded', q('[data-worked-example] .ng-wex-toggle')?.getAttribute('aria-expanded') === 'false');
  check('E1: no «Перевірити»: a side answers at once', !q('.ng-dh .ng-help-check'));
  check('E1: no «Новий раунд» before the round is done', !q('.ng-help-next') && !button(words.labels.newRound));
  // The vendor switch: the same card in RouterOS words, the drawing's ports in ether1/bridge.
  click(radio('MikroTik'));
  check('E1: MikroTik shows the RouterOS line and ether1 · WAN', text(q('.ng-dh-native')).includes(cards[0].native.mikrotik.split('\n')[0]) && all('.ng-fw-port-name').map(text).join('|') === 'ether1 · WAN|bridge · LAN');
  click(radio('Cisco'));
  check('E1: Cisco\'s ports are g0/0 and g0/1, each label also carries the drawing\'s own port fact', all('.ng-fw-port-name').map(text).join('|') === 'g0/0 · WAN|g0/1 · LAN'
    && all('.ng-fw-port-name').map(el => el.getAttribute('data-hl')).join('|') === 'port:ether1 port:g0/0|port:bridge port:g0/1');
  // A wrong side first: marked, the right side's port outlined, the group still open.
  const c = card(), wrongSide = c.side === 'WAN' ? '(LAN)' : '(WAN)', rightSide = c.side === 'WAN' ? '(WAN)' : '(LAN)';
  click(option(wrongSide));
  const fact = c.side === 'WAN' ? 'port:ether1' : 'port:bridge';
  check('E1: a wrong side: «Ще ні» and why, marked ✗, still open', tone() === 'no' && status().includes(c.why) && option(wrongSide).className.includes('is-no') && !q('.ng-dh-sides[aria-readonly="true"]'), status());
  check('E1: after a wrong answer the right side\'s port label is outlined', lit().some(hl => hl.split(' ').includes(fact)), lit());
  check('E1: no next card before the right side', !button('Наступна картка'));
  click(option(rightSide));
  check('E1: the right side: ✓, locked, «Відповідь зафіксовано.»', tone() === 'ok' && q('.ng-dh-sides').getAttribute('aria-readonly') === 'true' && text(q('#ng-dh-action')) === words.actions.committed);
  check('E1: the right side\'s port stays outlined', lit().some(hl => hl.split(' ').includes(fact)));
  check('E1: a part verdict (not the round)', q('[data-help-current]').getAttribute('data-help-scope') === 'part');
  const locked = text(q('.ng-dh-option.is-ok'));
  click(option(wrongSide));
  check('E1: a locked card ignores another tap', text(q('.ng-dh-option.is-ok')) === locked && tone() === 'ok');
  click(button('Наступна картка'));
  check('E1: the next card: «картка 2 з 6», no verdict, no highlight', text(q('.ng-dh-progress')) === 'картка 2 з 6' && !q('[data-help-current]') && lit().length === 0);
  for (let i = 1; i < 6; i++) {
    const now = card();
    click(option(now.side === 'WAN' ? '(WAN)' : '(LAN)'));
    if (i < 5) click(button('Наступна картка'));
  }
  check('E1: the round ends: «Усі картки на своєму боці.», a task-scope ✓, no next card', status().includes(words.verdicts.sidesDone) && q('[data-help-current]').getAttribute('data-help-scope') === 'task' && !button('Наступна картка'), status());
  check('E1: «Новий раунд» is then the primary action', q('.ng-help-next')?.className.includes('primary') || q('.ng-help-next')?.getAttribute('data-variant') === 'primary' || text(q('.ng-help-next')) === words.labels.newRound, q('.ng-help-next')?.outerHTML?.slice(0, 200));
  click(q('.ng-help-next'));
  const next = placeOf(m).sides;
  check('E1: a new round has a new seed and renumbered addresses', next.seed !== seed && next.other === true && text(q('.ng-dh-progress')) === 'картка 1 з 6', next);
  const renumbered = createTopology(next.seed, { otherAddresses: true });
  check('E1: the drawing follows the round\'s addresses', all('.ng-fw-box-ip').map(text).includes(renumbered.pc) && !all('.ng-fw-box-ip').map(text).includes('192.168.88.10'));
});

// ── E2 «DHCP-сервер», level 1 (neutral) ──
scenario('E2 L1', m => {
  click(radio('DHCP-сервер'));
  const { seed, other } = placeOf(m).server.tasks[1];
  const task = server.generateScenario({ seed, level: 1, vendor: 'cisco', otherAddresses: other });
  const base = task.network.split('.').slice(0, 3).join('.');
  check('E2: the task names the network and the clients', text(q('.ng-dh-intro .ng-dh-task')).includes(`${task.network}/24`) && text(q('.ng-dh-intro .ng-dh-task')).includes(`до ${task.clients} ПК`));
  check('E2: «Як ПК отримує адресу» starts folded, in the task', q('.ng-dh-intro .ng-aside-q')?.getAttribute('aria-expanded') === 'false' && !q('.ng-dh-dora'));
  check('E2: step 1 is «від» and «до» only: no gateway, DNS or provider DNS yet', labelled('від') && labelled('до') && !labelled('Шлюз для ПК') && !labelled('DNS для ПК') && !text(q('.ng-dh-form')).includes('DNS провайдера'));
  check('E2: the strip: a pin per taken address, the text equivalent, no band or marker yet', all('.ng-ruler-pin-label').length === 1 + task.statics.length
    && text(q('.ng-ruler-text')) === server.stripCaption(task, {}) && !q('.ng-ruler-band') && !q('.ng-ruler-marker'), text(q('.ng-ruler-text')));
  type(labelled('від'), `${base}.100`);
  check('E2: «від» parsed: a marker, no band yet', q('.ng-ruler-marker') && !q('.ng-ruler-band'));
  type(labelled('до'), `${base}.199`);
  check('E2: both parsed: the band, and the text says the range', all('.ng-ruler-band').length === 1 && !q('.ng-ruler-marker') && text(q('.ng-ruler-text')).endsWith('твій діапазон .100–.199'));
  // A range over a device: one finding, its pin marked.
  type(labelled('від'), `${base}.2`); type(labelled('до'), `${base}.254`);
  click(q('.ng-help-check'));
  const finding = server.check(task, { ranges: [{ from: `${base}.2`, to: `${base}.254` }] }, { step: 'allocation' });
  check('E2: a finding: one line, «Ще ні»', tone() === 'no' && status().includes(finding.text), status());
  check('E2: the pin the finding names is marked', all('.ng-ruler-pin-label.is-marked').length === 1 && text(q('.ng-ruler-pin-label.is-marked')).includes(`.${finding.address.split('.')[3]}`));
  type(labelled('до'), `${base}.200`);
  check('E2: an edit leaves the verdict «до змін» and unmarks the pin', q('[data-help-stale]') !== null && !q('.ng-ruler-pin-label.is-marked'), q('[data-help-current]')?.outerHTML?.slice(0, 200));
  // The reference range (read through the logic for the test only).
  const ref = server.referenceAnswer(task);
  type(labelled('від'), ref.ranges[0].from); type(labelled('до'), ref.ranges[0].to);
  click(q('.ng-help-check'));
  check('E2: step 1 passes: ✓ (a part), the range locks, step 2 opens in place', tone() === 'ok' && q('[data-help-current]').getAttribute('data-help-scope') === 'part'
    && labelled('від').hasAttribute('readonly') && labelled('Шлюз для ПК') && labelled('DNS для ПК') && text(q('#ng-dh-action')) === words.actions.options);
  check('E2: step 2 brings «DNS провайдера: …»', text(q('.ng-dh-step2')).includes(words.labels.providerDns(task.providerDns)));
  type(labelled('Шлюз для ПК'), task.providerDns[0]); type(labelled('DNS для ПК'), task.providerDns[1]);
  click(q('.ng-help-check'));
  check('E2: a wrong gateway: its finding, no client rows', tone() === 'no' && status().includes(words.findings.gateway(task.router)) && !q('.ng-dh-client'));
  type(labelled('Шлюз для ПК'), task.router);
  click(q('.ng-help-check'));
  const answer = { ranges: ref.ranges, gateway: task.router, dns: [task.providerDns[1]] };
  check('E2: the server passes: a task-scope ✓', tone() === 'ok' && q('[data-help-current]').getAttribute('data-help-scope') === 'task' && status().includes(words.verdicts.server));
  check('E2: three client rows from the learner\'s own answer', all('.ng-dh-client-rows li').map(text).join('|') === server.clientCheck(task, answer).map(r => `✓ ${r.text}`).join('|'), all('.ng-dh-client-rows li').map(text));
  check('E2: the native lines for Cisco, read-only, labelled', text(q('.ng-dh-native-lines .ng-dh-client-title')) === words.labels.native
    && text(q('.ng-dh-native-lines pre')) === lines(server.nativeLines(task, answer, 'cisco')));
  click(radio('MikroTik'));
  check('E2: the vendor switch starts the task over in that vendor (its own instance)', !q('.ng-dh-client') && labelled('від') && !labelled('від').hasAttribute('readonly'));
  click(radio('Cisco'));
  check('E2: switching back finds the Cisco instance as it was', q('.ng-dh-client') !== null);
});

// ── E2: the reveal path ──
scenario('E2 reveal', m => {
  click(radio('DHCP-сервер'));
  const { seed, other } = placeOf(m).server.tasks[1];
  const task = server.generateScenario({ seed, level: 1, vendor: 'cisco', otherAddresses: other });
  const realReference = server.referenceAnswer;
  check('E2 reveal: the reference is not on the first view', !text(q('.ng-dh-form')).includes(realReference(task).ranges[0].from) && labelled('від').value === '');
  click(q('.ng-help-reveal-link'));
  const ref = realReference(task);
  check('E2 reveal: the form is filled with the reference and read-only', labelled('від').value === ref.ranges[0].from && labelled('до').value === ref.ranges[0].to && labelled('Шлюз для ПК').value === task.router && labelled('від').hasAttribute('readonly'));
  check('E2 reveal: the client rows and native lines show, marked «показано», no check button', q('.ng-dh-client') && q('.ng-dh-shown') && !q('.ng-help-check'));
});

// ── E2 level 3, Cisco: exclusion rows ──
scenario('E2 L3 Cisco', m => {
  click(radio('DHCP-сервер')); click(radio('Рівень 3'));
  const { seed, other } = placeOf(m).server.tasks[3];
  const task = server.generateScenario({ seed, level: 3, vendor: 'cisco', otherAddresses: other });
  check('E2 L3 Cisco: the given pool and network lines', text(q('.ng-dh-given pre')).includes(`network ${task.network}`));
  check('E2 L3 Cisco: one row, its command waiting, the whole pool on the strip (a blank row is left out of the drawing)', all('.ng-dh-row').length === 1
    && text(q('.ng-dh-row-command')) === 'ip dhcp excluded-address …' && all('.ng-ruler-band').length >= 1);
  check('E2 L3 Cisco: the router\'s pin is dashed (excluded automatically) and the text says so', q('.ng-ruler-pin-line.is-auto') && text(q('.ng-ruler-text')).includes('виключено автоматично'));
  const row = i => all('.ng-dh-row')[i];
  const field = (i, name) => all('input', row(i))[name === 'від' ? 0 : 1];
  type(field(0, 'від'), task.statics[0].address);
  check('E2 L3 Cisco: a row without «до» renders the one-address command', text(q('.ng-dh-row-command')) === `ip dhcp excluded-address ${task.statics[0].address}`);
  click(button('+ ще один рядок')); click(button('+ ще один рядок'));
  check('E2 L3 Cisco: up to three rows, then no more «+»', all('.ng-dh-row').length === 3 && !button('+ ще один рядок'));
  click(q('.ng-dh-remove'));
  check('E2 L3 Cisco: a row can be removed', all('.ng-dh-row').length === 2 && button('+ ще один рядок'));
  click(q('.ng-help-check'));
  check('E2 L3 Cisco: a blank visible row is incomplete: an info note', tone() === 'info' && status().includes(words.findings.syntax), status());
  click(q('.ng-dh-remove'));
  const ref = server.referenceAnswer(task);
  ref.exclusions.forEach((r, i) => {
    if (i >= all('.ng-dh-row').length) click(button('+ ще один рядок'));
    type(field(i, 'від'), r.from); type(field(i, 'до'), r.to);
  });
  click(q('.ng-help-check'));
  check('E2 L3 Cisco: the exclusions pass; step 2 asks default-router and dns-server', tone() === 'ok' && labelled('Шлюз для ПК (default-router)') && labelled('DNS для ПК (dns-server)'));
  type(labelled('Шлюз для ПК (default-router)'), task.router); type(labelled('DNS для ПК (dns-server)'), task.providerDns[0]);
  click(q('.ng-help-check'));
  const answer = answerOf(task, { rows: ref.exclusions, gateway: task.router, dns: task.providerDns[0] });
  check('E2 L3 Cisco: passes; the native lines keep the learner\'s rows', tone() === 'ok' && text(q('.ng-dh-native-lines pre')) === lines(server.nativeLines(task, answer, 'cisco')));
});

// ── E2 level 3, MikroTik: the wizard ──
scenario('E2 L3 MikroTik', m => {
  click(radio('DHCP-сервер')); click(radio('Рівень 3')); click(radio('MikroTik'));
  const { seed, other } = placeOf(m).server.tasks[3];
  const task = server.generateScenario({ seed, level: 3, vendor: 'mikrotik', otherAddresses: other });
  const rows = all('.ng-dh-wrow');
  check('E2 wizard: six rows in DHCP Setup\'s order, the Ukrainian purpose before the Winbox name', rows.length === 6
    && rows.every((r, i) => text(r.firstChild) === server.wizardFields(task)[i].purpose && text(r).includes(server.wizardFields(task)[i].native)), rows.map(text));
  check('E2 wizard: three given (interface, address space, lease), three fields', all('.ng-dh-wrow.is-given').length === 3 && all('.ng-dh-wizard input').length === 3);
  check('E2 wizard: the provider\'s DNS is there from the start, one check', text(q('.ng-dh-form')).includes('DNS провайдера') && text(q('#ng-dh-action')) === words.actions.wizard);
  const ref = server.referenceAnswer(task);
  type(labelled('Gateway for DHCP Network'), task.router);
  type(labelled('Addresses to Give Out'), ref.ranges.map(r => `${r.from}-${r.to}`).join(','));
  type(labelled('DNS Servers'), `${task.providerDns[0]}, ${task.providerDns[1]}`);
  check('E2 wizard: commas stay commas (a list of ranges, a list of DNS)', labelled('DNS Servers').value.includes(','));
  click(q('.ng-help-check'));
  check('E2 wizard: one check passes, RouterOS lines with the lease', tone() === 'ok' && text(q('.ng-dh-native-lines pre')).includes(`lease-time=${task.lease}`), status());
});

// ── E3 level 1: the round, the reply and the replay ──
scenario('E3 L1', m => {
  click(radio('Що бачить сайт'));
  const { seed, other } = placeOf(m).nat.tasks[1];
  const cards = nat.createRound(seed, { vendor: 'cisco', otherAddresses: other });
  check('E3: the website\'s card first: its task, the question as the action line, three addresses', text(q('.ng-dh-card .ng-dh-task')) === cards[0].task && text(q('#ng-dh-action')) === cards[0].question && all('.ng-dh-option').length === 3);
  check('E3: no LAN server on the website\'s card', !all('.ng-fw-box-name').map(text).includes('Сервер'));
  click(option('адресу ПК'));
  check('E3: the PC\'s own address is wrong; why names the WAN address', tone() === 'no' && status().includes(cards[0].topology.wan));
  click(option('WAN-адресу роутера'));
  check('E3: the WAN address: ✓ (a part), then «Куди роутер віддасть відповідь?»', tone() === 'ok' && text(q('#ng-dh-action')) === words.actions.reply && all('.ng-dh-option').length === 3 && option('залишить собі'));
  check('E3: no replay before the card is done', !button('По кроках'));
  click(option('нікуди'));
  check('E3: a wrong reply choice', tone() === 'no');
  click(option('на ПК'));
  const walk = nat.replay(cards[0]);
  check('E3: the reply: ✓, and «По кроках» is offered', tone() === 'ok' && button('По кроках'));
  click(button('По кроках'));
  const captions = [];
  for (let i = 0; i < 4; i++) {
    captions.push(text(q('#ng-dh-step-caption')));
    check(`E3 replay: step ${i + 1} outlines its address`, lit().some(hl => hl.split(' ').includes(`address:${walk.steps[i].highlight.value}`)), lit());
    if (i < 3) click(q('.ng-fw-stepper button[aria-label="Крок уперед"]'));
  }
  check('E3 replay: four captions in the logic\'s words', captions.join('|') === walk.steps.map(s => s.caption).join('|'), captions);
  check('E3 replay: the remembered pair under it', text(q('.ng-dh-remembered')) === walk.caption);
  check('E3 replay: no envelope, no timer (nothing animates)', !q('.ng-fw-envelope') && !q('.ng-fw-path-line'));
  click(button('Наступна картка'));
  const second = cards[1];
  check('E3: the second card', text(q('.ng-dh-progress')) === 'картка 2 з 3' && text(q('.ng-dh-card .ng-dh-task')) === second.task && !button('По кроках'));
  check('E3: the LAN server shows on its own card only', all('.ng-fw-box-name').map(text).includes('Сервер') === (second.id === 'server'));
  click(option('адресу ПК'));
  check('E3: inside the LAN (or to R1) the source stays the PC\'s', tone() === 'ok');
  click(button('Наступна картка')); click(option('адресу ПК'));
  check('E3: the round ends with a task-scope ✓', tone() === 'ok' && q('[data-help-current]').getAttribute('data-help-scope') === 'task' && status().includes(words.screen.natDone));
  check('E3: then, and only then, «Новий раунд» and «До рівня 2» (in words)', text(q('.ng-help-continue')) === words.screen.newRound && text(q('.ng-help-next')) === words.screen.nextLevel);
  click(q('.ng-help-next'));
  check('E3: «До рівня 2» goes to level 2', placeOf(m).nat.level === 2 && all('.ng-dh-option').length === 2);
  // Back to level 1: the finished round as it was, and a new round from it.
  click(radio('Рівень 1'));
  check('E3: level 1 again restores the finished round', text(q('.ng-help-continue')) === words.screen.newRound);
  click(q('.ng-help-continue'));
  const again = placeOf(m).nat.tasks[1];
  const renumbered = nat.createRound(again.seed, { vendor: 'cisco', otherAddresses: true });
  check('E3: «Новий раунд» gives the next seed on renumbered addresses', again.seed === seed + 1 && again.other === true, again);
  check('E3: the new round starts at its website card, no verdict, no next-level button', text(q('.ng-dh-progress')) === 'картка 1 з 3'
    && text(q('.ng-dh-card .ng-dh-task')) === renumbered[0].task && !q('[data-help-current]') && !q('.ng-help-next'));
  check('E3: its drawing and choices use the new addresses', all('.ng-fw-box-ip').map(text).includes(renumbered[0].topology.pc)
    && option(renumbered[0].topology.pc) && renumbered[0].topology.pc !== cards[0].topology.pc);
  check('E3: before the round is done there is no «Далі» / «До рівня 2»', !q('.ng-help-next') && !q('.ng-help-continue'));
});

// ── E3 level 2 ──
scenario('E3 L2', m => {
  click(radio('Що бачить сайт')); click(radio('Рівень 2'));
  const { seed, other } = placeOf(m).nat.tasks[2];
  const task = nat.createL2(seed, { vendor: 'cisco', otherAddresses: other });
  // The worked example: Cisco's whole configuration (roles, ACL, overload), and what each part does.
  click(q('[data-worked-example] .ng-wex-toggle'));
  const example = all('[data-worked-example] .ng-wex-value').map(text);
  const index = line => example.findIndex(l => l.startsWith(line));
  check('E3 L2 Cisco example: inside and outside interfaces, the ACL, then the overload line', example.length === 6
    && index('interface g0/1') === 0 && index('ip nat inside') === 1 && index('ip nat outside') === 3 && index('access-list 1 permit 192.0.2.0') === 4
    && example[5] === 'ip nat inside source list 1 interface g0/0 overload', example);
  check('E3 L2 Cisco example: the ACL selects, the overload line translates', text(q('[data-worked-example]')).includes(words.examples.natCiscoNote));
  check('E3 L2 Cisco example: on reserved documentation addresses only', example.every(l => !/192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(l)));
  click(q('[data-worked-example] .ng-wex-toggle'));
  check('E3 L2 Cisco: the given overload line whole, the networks, the inside question first', text(q('.ng-dh-card .ng-dh-pre')) === task.given && text(q('.ng-dh-card')).includes(`${task.networks[0].network}/24`) && text(q('#ng-dh-action')) === task.insideQuestion);
  check('E3 L2 Cisco: each option has its purpose (one line) and its command', all('.ng-dh-option').every(el => q('[data-purpose]', el) && q('.ng-dh-command', el)) && all('[data-purpose]').every(el => text(el).length <= 48));
  click(option('внутрішній бік на WAN'));
  check('E3 L2 Cisco: the WAN side as inside is wrong', tone() === 'no');
  click(option('внутрішній бік на LAN'));
  check('E3 L2 Cisco: then the ACL, three options', tone() === 'ok' && text(q('#ng-dh-action')) === task.question && all('.ng-dh-option').length === 3, [tone(), text(q('#ng-dh-action')), all('.ng-dh-option').length]);
  click(option('маска підмережі замість wildcard'));
  check('E3 L2 Cisco: a mask written as a wildcard is wrong', tone() === 'no' && status().includes(words.verdicts.wrongAcl));
  click(option('перекладати точно задані LAN'));
  check('E3 L2 Cisco: the exact ACL: a task-scope ✓ and the note that ACL only selects', tone() === 'ok' && q('[data-help-current]').getAttribute('data-help-scope') === 'task' && text(q('.ng-dh-after')) === words.natNotes.acl);
  click(q('.ng-help-next'));
  const next = placeOf(m).nat.tasks[2];
  const twoLans = nat.createL2(next.seed, { vendor: 'cisco', otherAddresses: true, twoLans: true });
  check('E3 L2 Cisco: the next task has two LANs, renumbered', next.n === 1 && next.other === true && text(q('.ng-dh-card')).includes(`${twoLans.networks[1].network}/24`), text(q('.ng-dh-card')));
  click(radio('MikroTik'));
  check('E3 L2 MikroTik: WAN membership given, three complete rules, no inside step', text(q('.ng-dh-card')).includes(words.natNotes.wanMembership) && all('.ng-dh-option').length === 3 && all('.ng-dh-command').every(el => text(el).startsWith('/ip firewall nat add chain=srcnat action=masquerade')));
  click(option('змінити відправника на WAN'));
  check('E3 L2 MikroTik: masquerade out of WAN: ✓ and the masquerade note', tone() === 'ok' && text(q('.ng-dh-after')) === words.natNotes.masquerade);
});

check('no React warnings', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
