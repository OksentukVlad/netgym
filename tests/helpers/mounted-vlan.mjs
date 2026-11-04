// Mounted lifecycle scenarios for the VLAN screen (VLAN-1 spec §4, brief
// item 6): the real VlanScreen in the app store, mounted with
// react-dom/client in tests/helpers/mini-dom.mjs, with node:test's mocked
// setTimeout. Run in its own process by tests/vlan-mounted.test.mjs
// (tools/test.sh runs it first and passes the results file). Prints one
// JSON line: { results: [{ name, ok, detail }] }.
//   - «Куди дійде кадр»: a round's commit and lock (no retry), the walk on
//     the diagram and in words, «Ще ні» with no per-PC marks, the keyboard
//     path and the diagram's pointer path, the domains only after the last
//     round, «Ще одна» moving the level 0 → 1 → 2 and staying there, and
//     the syntax switch opening the other vendor's own instance and coming
//     back to the first;
//   - «Налаштуй порти»: typing, parse on blur, live commands, Enter checks;
//     a form failure's marks, a behaviour failure's walk, a success's
//     domains and tips; the three hints; the reveal (assisted, the
//     reference only then); drafts per syntax and no verdict across a
//     switch;
//   - «Між VLAN» (VLAN-2): per task, the form in both syntaxes, a failure
//     of each kind with its walk (a down parent, no route, a form finding
//     that opens the other device with focus, the management VLAN cut off
//     by the trunk with the trunk's stop first, a VLAN interface on a
//     bridge port), success with a sample trace, the request/reply toggle,
//     drafts per syntax, task 4 only in MikroTik, «Інші номери», hints and
//     the reveal;
//   - the walks in motion (VLAN-anim spec v2): no frame before a commit or
//     a check; one token per real egress, then the end frame; the words
//     after the motion at its end; any press skips; «Показати ще раз»
//     replays without a second announcement; a stale verdict never plays;
//     reduced motion shows the end at once; the ports lap one VLAN after
//     another, then the domains; a routed request, R1's new frame, then the
//     reply with the toggle following it; the words after a walk stay
//     outside the live region (it speaks once, at the commit or check);
//     a syntax switch, navigation away or a key ends a play; an edit then
//     its undo never brings the play back; a failing «Між VLAN» probe plays
//     its failing direction only; reduced motion rests on «Запит»;
//   - no React warnings.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';

const { document, fire, setReducedMotion } = installDom();
// The walks play through src/ui/motion.js's interval timer: mocked too.
mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
// Seeds come from Math.random: a fixed, never-repeating sequence here.
let random = 0;
Math.random = () => (random = (random + 0.1234567) % 1);
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const { act, mountVlan, predict, ports, route, reference, bank, ui, routeUi } = await import('../../.test-bundles/harness/mounted-vlan.mjs');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

// Count the screen's calls of the reference solutions.
const realPredictSolution = predict.solution, realPortsSolution = ports.solution, realRouteSolution = route.solution;
const calls = { predict: 0, ports: 0, route: 0 };
predict.solution = (...args) => { calls.predict += 1; return realPredictSolution(...args); };
ports.solution = (...args) => { calls.ports += 1; return realPortsSolution(...args); };
route.solution = (...args) => { calls.route += 1; return realRouteSolution(...args); };

const step = fn => { let out; act(() => { out = fn(); }); act(() => { mock.timers.tick(200); }); return out; };
const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const click = el => step(() => { el.focus(); fire(el, 'click'); });
const type = (el, value) => step(() => { el.value = value; fire(el, 'input'); });
const blur = el => step(() => { fire(el, 'focusout'); el.blur(); });
const key = (el, k) => step(() => fire(el, 'keydown', { key: k }));
const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const status = () => text(q('[role="status"]'));
/** The words a walk's end adds, under the feedback: outside its live region. */
const later = () => text(q('.ng-vl-said'));
// Round 4 (spec A1): the help panel's buttons. The primary one (check, continue or «Далі →»), and «Перевірити».
const primaryBtn = () => q('.ng-help-row .ng-button-primary') ?? q('.ng-help-check');
const checkBtn = () => q('.ng-help-check');
const nextBtn = () => q('.ng-help-next');
const contBtn = () => q('.ng-help-continue');
/** A command block's lines (one span each). */
const lines = pre => [...pre.querySelectorAll('.ng-vl-cmd-line')].map(span => span.textContent).join('\n');
const radio = (group, label) => all(`${group} [role="radio"]`).find(b => text(b) === label);
const place = m => m.store.state.places.vlan;

const SEEDS = { 'p1|cisco': 11, 'p1|routeros': 11, 'p2|cisco': 12, 'p2|routeros': 12, 'p3|cisco': 13, 'p3|routeros': 13 };
const predictPlace = shape => ({ exercise: 'predict', shape, predict: Object.fromEntries(Object.entries(SEEDS).map(([k, seed]) => [k, { seed, level: 0 }])) });
const taskOf = (m, shape = place(m).shape, vendor = m.store.state.prefs.syntax) => {
  const slot = place(m).predict[`${shape}|${vendor}`];
  return predict.create(bank.predict, { variantId: shape, seed: slot.seed, vendor, surprises: slot.level });
};
const keyOf = task => task.instanceKey;
const choice = id => all('.ng-vl-choice').find(b => text(b) === id || text(b).startsWith(`${id} `));
// Round 5 (spec 5b-1 §4 v2): the modes read «доступ (access)», «транк (trunk)».
const ACCESS = 'доступ (access)', TRUNK = 'транк (trunk)';

/** A scenario. The ones about end states run with reduced motion (the walk's
 * end at once); the motion's own scenarios pass `{ reducedMotion: false }`. */
function scenario(name, fn, { reducedMotion = true, ...options } = {}) {
  setReducedMotion(reducedMotion);
  const m = mountVlan(options);
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}

// ── «Куди дійде кадр» ────────────────────────────────────────────────────

// Round 9 (Андрій): a skip says what it drops, and stays on its level.
scenario('round 9: predict skip', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p2') }));
  check('A21: the quiet link names the network', /^Пропустити всю мережу/.test(text(nextBtn())), text(nextBtn()));
  const before = place(m).predict['p2|cisco'];
  click(nextBtn());
  const after = place(m).predict['p2|cisco'];
  check('A21: a new network at the same level', after.level === before.level && after.seed !== before.seed, { before, after });
});

scenario('predict: commit and lock', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p2') }));
  const task = taskOf(m), round = task.rounds[0];
  const answer = realPredictSolution(task)[round.id];
  check('predict: the question names the round’s source', text(q('.ng-vl-question')) === `${round.from} надсилає широкомовний кадр (як ARP-запит). Хто з ПК його отримає?`);
  check('predict: «Перевірити» is the primary; a press before a choice is not an attempt', text(primaryBtn()) === 'Перевірити' && primaryBtn() === checkBtn());
  click(primaryBtn());
  check('predict: a press before a choice says what it waits for (not only a title)', status() === 'Обери ПК або «Нікому»' && !m.store.state.instances[keyOf(task)]?.view?.commit, status());
  check('predict: no walk, path or domain before the commit', !q('.ng-vl-steps') && !q('.ng-vl-path') && !q('.ng-vl-legend') && !q('.ng-vl-drop'));
  // Round 5 (§4): the choices carry the PC's name only; its address stays on the diagram, muted.
  check('predict: the PC buttons are named by the PC only (no address)', all('button.ng-vl-choice, .ng-vl-choice[aria-pressed]').filter(b => b.getAttribute('aria-pressed') !== null && !b.className.includes('nobody')).every(b => /^PC\d+$/.test(text(b)))
    && all('.ng-vl-choices .ng-vl-mono').length === 0 && q('.ng-vl-svg').className.includes('is-quiet-ip'));
  // Round 4 (F3): every PC in host order, the sender in its place (not a choice), «Нікому» last.
  const chips = all('.ng-vl-choice');
  check('predict: every PC in host order, the sender in its place, «Нікому» last', chips.length === task.topology.hosts.length + 1 && chips.at(-1).className.includes('ng-vl-nobody')
    && chips.slice(0, -1).map(c => text(c).split(' ')[0]).join() === task.topology.hosts.map(h => h.device).join() && chips.find(c => c.className.includes('is-source')) && text(chips.find(c => c.className.includes('is-source'))).startsWith(round.from));
  // A wrong answer: everyone but the right set (or «Нікому» when the frame reaches someone).
  const wrong = answer.length ? [] : task.topology.hosts.map(h => h.device).filter(h => h !== round.from).slice(0, 1);
  if (wrong.length) click(choice(wrong[0])); else click(q('.ng-vl-nobody'));
  check('predict: a tap presses the PC’s button', wrong.length ? choice(wrong[0]).getAttribute('aria-pressed') === 'true' : q('.ng-vl-nobody').getAttribute('aria-pressed') === 'true');
  check('predict: still nothing of the walk', !q('.ng-vl-steps') && !q('.ng-vl-path'));
  const main = primaryBtn();
  click(main);
  const inst = m.store.state.instances[keyOf(task)];
  check('predict: the commit is stored and counted once', inst.view.commit && Object.keys(inst.view.commit.answer).length === 1 && inst.presses === 1);
  check('predict: a wrong commit is information (no «Ще ні»): where the frame went and the choice; the receivers under it, after the walk', status().startsWith(ui.wentElsewhere) && !/Ще ні/.test(status()) && status().includes('Твій вибір') && later().includes(`Кадр ${answer.length ? `отримали: ${answer.join(', ')}` : 'не отримав'}`), [status(), later()]);
  check('predict: no per-PC mark (no ✓/✗ on the buttons)', all('.ng-vl-choice').every(b => !/[✓✗✕]/.test(text(b))));
  check('predict: the walk shows in words', all('.ng-vl-steps li').length > 2 && text(q('.ng-vl-steps li')) === `${round.from} надсилає широкомовний кадр без тега.`);
  check('predict: and on the diagram (path, tag plates, the source)', all('.ng-vl-path').length > 0 && all('.ng-vl-tag').length > 0 && all('.ng-vl-status.is-source').length === 1,
    { path: all('.ng-vl-path').length, tag: all('.ng-vl-tag').length, source: all('.ng-vl-status.is-source').length });
  check('predict: a tagged trunk is labelled «тег N»', all('.ng-vl-tag-text').some(t => /^тег \d+$/.test(text(t))) || answer.length === 0);
  check('predict: focus stays on the main button, now «Наступний раунд →»', document.activeElement === primaryBtn() && text(primaryBtn()) === 'Наступний раунд →');
  // Locked: another tap changes nothing.
  const before = m.store.state.instances[keyOf(task)];
  click(all('.ng-vl-choice')[0]);
  click(q('.ng-vl-nobody'));
  check('predict: the round is locked (taps change nothing)', m.store.state.instances[keyOf(task)] === before && q('.ng-vl-choices').className.includes('is-locked'));
  const host = all('.ng-vl-host').find(g => !g.className.includes('is-received') && text(g).startsWith('PC'));
  if (host) click(host);
  check('predict: the diagram doesn’t take taps either', m.store.state.instances[keyOf(task)] === before);
  check('predict: the dot says the round’s state in words', q('.ng-vl-dot').getAttribute('aria-label') === 'Раунд 1: кадр пішов інакше');
  check('predict: no domains before the last round', !q('.ng-vl-legend') && all('.ng-vl-badge').length === 0);
  check('predict: the reference was never read', calls.predict === 0, calls);
});

scenario('predict: all rounds, domains, «Ще одна» levels', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p1') }));
  let task = taskOf(m);
  const right = realPredictSolution(task);
  task.rounds.forEach((round, i) => {
    if (i > 0) click(primaryBtn()); // «Наступний раунд →»
    check(`predict rounds: round ${i + 1}’s question`, text(q('.ng-vl-question')).startsWith(`${round.from} `));
    check(`predict rounds: focus on the question for round ${i + 1}`, i === 0 || document.activeElement === q('.ng-vl-question'));
    // The diagram's pointer path for the first PC, the buttons for the rest.
    const [first, ...rest] = right[round.id];
    if (first) click(all('.ng-vl-host').find(g => text(g.querySelector('.ng-vl-host-name')) === first));
    for (const id of rest) click(choice(id));
    if (!first) click(q('.ng-vl-nobody'));
    click(primaryBtn());
    check(`predict rounds: round ${i + 1} right: «✓ Так»`, /^✓ Так/.test(status()), status());
    if (i < task.rounds.length - 1) check(`predict rounds: no domains after round ${i + 1}`, !q('.ng-vl-legend'));
  });
  check('predict rounds: after the last round, the domains: legend and numbered badges', all('.ng-vl-legend li').length > 0 && all('.ng-vl-badge').length === task.topology.hosts.length);
  check('predict rounds: the legend in words', all('.ng-vl-legend li').every(li => /Домен \d+: PC\d+/.test(text(li))));
  check('predict rounds: the main button is «Далі →»', text(primaryBtn()) === 'Далі →' && primaryBtn() === nextBtn());
  check('predict rounds: the instance earned it', m.store.state.instances[keyOf(task)].session.earned.solved === true);
  check('predict rounds: a quiet ✓ (DoneMark) on its network, none on the others', /розв’язано/.test(all('.ng-vl-variants [role="radio"]')[0].textContent) && !/розв’язано/.test(all('.ng-vl-variants [role="radio"]')[1].textContent));
  const levels = [];
  for (let n = 0; n < 3; n++) {
    const before = place(m).predict['p1|cisco'];
    click(primaryBtn());
    const after = place(m).predict['p1|cisco'];
    levels.push(after.level);
    check(`predict levels: «Ще одна» #${n + 1} gives a new seed`, after.seed !== before.seed);
    task = taskOf(m);
    check(`predict levels: a fresh round 1 (${task.rounds.length} rounds)`, text(q('.ng-vl-progress-text')) === `Раунд 1 з ${task.rounds.length}` && !q('.ng-vl-steps') && all('.ng-vl-dot').length === task.rounds.length);
    // Finish this instance with any answers, so «Ще одна» shows again.
    task.rounds.forEach((round, i) => {
      if (i > 0) click(primaryBtn());
      click(q('.ng-vl-nobody'));
      click(primaryBtn());
    });
  }
  check('predict levels: 0 → 1 → 2, then stays at 2', JSON.stringify(levels) === '[1,2,2]', levels);
  check('predict levels: the other vendor and shapes keep level 0', place(m).predict['p1|routeros'].level === 0 && place(m).predict['p2|cisco'].level === 0);
});

scenario('predict: the syntax switch opens the other vendor’s instance', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p3') }));
  const cisco = taskOf(m, 'p3', 'cisco');
  click(q('.ng-vl-nobody'));
  click(primaryBtn());
  click(primaryBtn()); // to round 2
  click(choice(cisco.rounds[1].from === 'PC1' ? 'PC2' : 'PC1'));
  check('syntax: Cisco shows its commands', /switchport mode access/.test(text(q('.ng-vl-pre'))));
  click(radio('.ng-vl-controls', 'MikroTik'));
  const mikrotik = taskOf(m, 'p3', 'routeros');
  check('syntax: MikroTik is another instance (key with its vendor)', mikrotik.instanceKey !== cisco.instanceKey && JSON.parse(mikrotik.instanceKey).vendor === 'routeros');
  check('syntax: it starts at its own round 1, nothing committed or tapped', text(q('.ng-vl-progress-text')).startsWith('Раунд 1 з') && !q('.ng-vl-steps') && all('.ng-vl-choice[aria-pressed="true"]').length === 0);
  check('syntax: the given configuration is the Winbox tables', all('.ng-vl-table').length === 2 && /VLAN Filtering/.test(text(q('.ng-vl-filtering'))) && /^Bridge → Ports/.test(text(q('.ng-vl-table caption'))));
  check('syntax: port labels in RouterOS names', all('.ng-vl-port-name').every(t => /^ether\d$/.test(text(t))));
  click(q('.ng-vl-show-commands'));
  check('syntax: «Команди» shows the commands, filtering set last', /\/interface bridge set bridge1 vlan-filtering=(yes|no)$/.test(q('.ng-vl-pre').textContent.trim()));
  click(radio('.ng-vl-controls', 'Cisco'));
  check('syntax: back on Cisco: round 2 with its draft and round 1’s commit', text(q('.ng-vl-progress-text')).startsWith('Раунд 2 з') && all('.ng-vl-choice[aria-pressed="true"]').length === 1
    && q('.ng-vl-dot').getAttribute('aria-label').startsWith('Раунд 1: '));
  check('syntax: port labels in Cisco names', all('.ng-vl-port-name').every(t => /^(fa0\/\d|gi0\/\d)$/.test(text(t))));
  check('syntax: both instances stored apart', Boolean(m.store.state.instances[cisco.instanceKey]) && !m.store.state.instances[mikrotik.instanceKey]?.view?.commit);
});

scenario('predict: the intro folds; the switch tabs and the diagram pick a switch', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p2') }));
  // Round 4 (F3, A8): the primer is a first-visit aside behind «?».
  const toggle = () => q('.ng-vl-intro .ng-aside-q');
  check('intro: open at first, four lines, named «Як рухається кадр»', toggle().getAttribute('aria-expanded') === 'true' && toggle().getAttribute('aria-label') === ui.intro && all('.ng-vl-intro .ng-aside-body li').length === 4);
  click(toggle());
  check('intro: folds behind «?» (its title beside it)', toggle().getAttribute('aria-expanded') === 'false' && q('.ng-vl-intro .ng-aside-body') === null && text(toggle()).includes(ui.intro));
  // Round 9 (Fable 9): the listing starts folded; a press on another switch asks for it, so it opens.
  check('given: the configuration starts folded, under its heading', !q('.ng-vl-given details').hasAttribute('open') && text(q('.ng-vl-given summary')) === ui.given);
  click(all('.ng-vl-switch')[1]);
  check('given: a press on another switch in the drawing opens it', q('.ng-vl-given details').hasAttribute('open'));
  click(all('.ng-vl-switch')[0]);
  click(radio('.ng-vl-switches', 'SW2'));
  const sw2 = /interface/.test(text(q('.ng-vl-pre')));
  check('switch tabs: SW2’s configuration', sw2 && radio('.ng-vl-switches', 'SW2').getAttribute('aria-checked') === 'true');
  click(all('.ng-vl-switch')[0]);
  check('diagram: a press on SW1 opens its configuration', radio('.ng-vl-switches', 'SW1').getAttribute('aria-checked') === 'true');
  click(radio('.ng-vl-exercises', 'Налаштуй порти'));
  click(radio('.ng-vl-exercises', 'Куди дійде кадр'));
  check('exercise switch: back to the same round, intro still folded', toggle().getAttribute('aria-expanded') === 'false');
});

// ── «Налаштуй порти» ─────────────────────────────────────────────────────

const PORT_SEEDS = { 'vlan.ports-1': 21, 'vlan.ports-2': 22, 'vlan.ports-3': 23, 'vlan.ports-4': 24 };
const portsPlace = taskId => ({ exercise: 'ports', portsTask: taskId, portsSeeds: { ...PORT_SEEDS } });
const portsTask = (m, syntax = m.store.state.prefs.syntax) => {
  const p = place(m), record = bank.ports.find(r => r.id === p.portsTask);
  return ports.create(record, { variantId: 'main', seed: p.portsSeeds[record.id], syntax });
};
/** A port's row by its port name (the cell also names the port's PC: «fa0/3 — PC1», round 4 F4). */
const row = label => all('.ng-vl-form-table tr').find(tr => text(tr.querySelector('th')).split(' — ')[0] === label);
/** A Cisco trunk's list: on the line under its port's row (round 5 repair v1). */
const listOf = label => { const next = row(label)?.nextSibling; return next?.className?.includes('ng-vl-allowed-row') ? next.querySelector('input') : null; };
const labelOf = (task, device, port, syntax) => task.topology.devices.find(d => d.id === device).ports.find(p => p.id === port).label[syntax];
/** Fill a Cisco switch's form from an answer, like a student: VLANs, modes, values. */
function fillCisco(task, sw, config) {
  const vlans = q(`#vl-${sw}-vlans`);
  type(vlans, config.vlans.join(', '));
  blur(vlans);
  for (const [port, p] of Object.entries(config.ports)) {
    const r = row(labelOf(task, sw, port, 'cisco'));
    click([...r.querySelectorAll('[role="radio"]')].find(b => text(b) === { access: ACCESS, trunk: TRUNK }[p.mode]));
    // A trunk's list is on the line under its row (round 5 repair v1).
    const input = p.mode === 'access' ? row(labelOf(task, sw, port, 'cisco')).querySelector('input') : q(`#vl-${sw}-ports-${port}-allowed`);
    type(input, p.mode === 'access' ? String(p.vlan) : p.allowed.join(','));
    blur(input);
  }
}

// Round 9 (Андрій 1): a task with no trunk doesn't ask for rows it doesn't need, and says why.
scenario('round 9: MikroTik ports without a trunk', m => {
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' }));
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace(bank.ports[0].id) }));
  check('A16: the action line leaves out Bridge → VLANs', text(q('#ng-vl-ports-action')) === ui.portsAction.routerosAccess, text(q('#ng-vl-ports-action')));
  check('A16: the table says the rows are optional here, and why', text(q('.ng-vl-vlans')).includes(ui.accessRowsOptional));
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace(bank.ports[1].id) }));
  check('A16: with a trunk it asks for them', text(q('#ng-vl-ports-action')) === ui.portsAction.routeros, text(q('#ng-vl-ports-action')));
});

scenario('ports: Cisco form, failure, success', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-2') }));
  const task = portsTask(m), ref = reference(task, 'cisco');
  check('ports: the task text names its VLANs', text(q('.ng-vl-task-text')) === `Транк між комутаторами. VLAN ${task.vids[0]} і VLAN ${task.vids[1]} є на обох комутаторах. Налаштуй порти доступу й транк між SW1 і SW2.`);
  check('ports: each PC shows its goal VLAN, marked as the goal', all('.ng-vl-host-third.is-goal').map(text).join(',') === task.topology.hosts.map(h => `мета: VLAN ${task.goals[h.device]}`).join(','));
  // Round 4 (F4, repair item 1): each PC port names its PC; a trunk only its port.
  const pcPorts = task.topology.links.flatMap(l => [[l.a, l.b], [l.b, l.a]]).filter(([pc, sw]) => pc.device.startsWith('PC') && sw.device === 'SW1');
  check('ports: each PC port names its PC («fa0/3 — PC1»), a trunk only its port', pcPorts.every(([pc, sw]) => text(row(labelOf(task, 'SW1', sw.port, 'cisco')).querySelector('th')) === `${labelOf(task, 'SW1', sw.port, 'cisco')} — ${pc.device}`)
    && Boolean(row('gi0/1')) && text(row('gi0/1').querySelector('th')) === 'gi0/1', all('.ng-vl-form-table th.ng-vl-port').map(text));
  check('ports: the form starts blank (modes «не задано», no values)', all('.ng-vl-modes [aria-checked="true"]').every(b => text(b) === 'не задано') && q('#vl-SW1-vlans').value === '');
  check('ports: no commands yet: a line says so, no empty block, nothing to copy', !q('.ng-vl-cmds .ng-vl-pre') && text(q('.ng-vl-no-commands')) === 'Команд ще немає: обери режими портів.' && !all('.ng-vl-cmds button').length);
  click(q('.ng-vl .ng-more-button'));
  check('ports: «Інші номери VLAN» is in «⋯»; «Попередні номери» not yet', all('.ng-vl [role="menuitem"]').map(text).join('|') === 'Інші номери VLAN' && q('.ng-vl-numbers') === null);
  key(all('.ng-vl [role="menuitem"]')[0], 'Escape');
  check('ports: the nonegotiate note once, an aside in this trunk task', all('.ng-aside-body .ng-vl-note').filter(n => text(n) === 'nonegotiate вимикає DTP: транк задано явно, без переговорів.').length === 1 && !all('.ng-vl-commands .ng-vl-note').length);
  // Typing: the text stays as typed until blur; the commands follow live.
  const vlans = q('#vl-SW1-vlans');
  type(vlans, `${task.vids[0]} ,  ${task.vids[1]}`);
  check('ports: typed text stays as typed', vlans.value === `${task.vids[0]} ,  ${task.vids[1]}`);
  check('ports: the commands follow at once', lines(q('.ng-vl-pre')).startsWith(`vlan ${task.vids[0]}\nvlan ${task.vids[1]}`));
  blur(vlans);
  check('ports: on blur the field is parsed and tidied', vlans.value === `${task.vids[0]},${task.vids[1]}`);
  // Enter checks: the blank ports fail as a form finding, marked.
  key(vlans, 'Enter');
  check('ports: Enter checks; «Ще ні» and one short sentence; the DTP explanation once, in «Детальніше»', /^• Ще ні/.test(status()) && status().includes(ui.modeNotSet) && !status().includes('Задай режим порту явно')
    && all('.ng-vl .ng-help-more').length === 1 && /Задай режим порту явно.*dynamic auto/.test(text(q('.ng-vl .ng-help-more'))) && all('.ng-vl').map(el => text(el).split('dynamic auto').length - 1)[0] === 1, status());
  const groups = all('.ng-vl-modes [role="radiogroup"]');
  check('ports: the unset modes are marked: aria-invalid on each mode group', groups.length > 0 && groups.every(g => g.getAttribute('aria-invalid') === 'true'), groups.map(g => g.getAttribute('aria-invalid')));
  check('ports: each mode group is described by its row’s short words', groups.every(g => text(document.getElementById(g.getAttribute('aria-describedby'))) === ui.modeNotSet));
  check('ports: the switch tab with marks says so', /•$/.test(text(radio('.ng-vl-switches', 'SW1 •') ?? radio('.ng-vl-switches', 'SW2 •'))));
  // Right on both switches except one access VLAN: a behaviour failure with a walk.
  fillCisco(task, 'SW1', ref.SW1);
  click(radio('.ng-vl-switches', 'SW2') ?? radio('.ng-vl-switches', 'SW2 •'));
  const broken = structuredClone(ref.SW2);
  const [accessPort] = Object.entries(broken.ports).find(([, p]) => p.mode === 'access');
  broken.ports[accessPort].vlan = task.vids.find(v => v !== broken.ports[accessPort].vlan);
  fillCisco(task, 'SW2', broken);
  click(checkBtn());
  check('ports: a behaviour failure names the pair and their goal VLANs', /^• Ще ні\s*PC\d+ \(мета: VLAN \d+\) і PC\d+ \(мета: VLAN \d+\): /.test(status()), status());
  check('ports: its walk is on the diagram and in words; the reachability note above the steps', all('.ng-vl-path').length > 0
    && text(q('.ng-vl-abstraction')).startsWith('Це перевірка зв’язку') && /^PC\d+ надсилає/.test(text(q('.ng-vl-steps li'))));
  check('ports: no domain colours on a failure', !q('.ng-vl-legend') && all('.ng-vl-badge').length === 0);
  // Fix it: success.
  const fixed = row(labelOf(task, 'SW2', accessPort, 'cisco')).querySelector('input');
  type(fixed, String(ref.SW2.ports[accessPort].vlan));
  check('ports: an edit after a check: the verdict stays, dimmed «до змін»; the walk is the previous check\'s', /^• Ще ні/.test(status()) && /до змін$/.test(status())
    && text(q('.ng-vl-previous')) === 'Попередня перевірка' && /Попередня перевірка/.test(text(q('.ng-vl-walk-text h3'))), status());
  key(fixed, 'Enter');
  check('ports: success: «✓ Так» and the domains numbered, with the answer’s VLANs', /^✓ Так\s*Готово: перевірка пройшла\./.test(status())
    && all('.ng-vl-legend li').map(text).every(t => /^(\d) Домен \1 — VLAN \d+: PC\d+, PC\d+$/.test(t)), [status(), all('.ng-vl-legend li').map(text)]);
  check('ports: the reference answer passes with no tips', !q('.ng-vl-tips'));
  check('ports: no hint button and no «Показати відповідь» once solved', !all('button').some(b => /Підказка|Показати відповідь/.test(text(b))));
  check('ports: the reference was never read', calls.ports === 0, calls);
  // Tips: allowed all on a trunk.
  const trunk = listOf('gi0/1');
  type(trunk, 'all');
  key(trunk, 'Enter');
  check('ports: a tip after success (allowed all)', /^✓ Так/.test(status()) && all('.ng-vl-tips li').some(li => /на транку краще явно перелічити/i.test(text(li))), status());
});

scenario('ports: Enter jumps to another switch’s marks with focus; reserved VLANs; stale marks; ranges', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-2') }));
  const task = portsTask(m), ref = reference(task, 'cisco');
  fillCisco(task, 'SW1', ref.SW1);
  const sw1Vlans = q('#vl-SW1-vlans');
  step(() => sw1Vlans.focus());
  key(sw1Vlans, 'Enter');
  const active = document.activeElement;
  check('focus: Enter on SW1 opens SW2, whose ports are unset', radio('.ng-vl-switches', 'SW2 •')?.getAttribute('aria-checked') === 'true' && text(q('.ng-vl-form-head h2')) === 'Налаштування SW2');
  check('focus: lands on SW2’s first marked control (its mode group’s radio), not the page', active?.getAttribute('role') === 'radio'
    && active.closest('[role="radiogroup"]')?.getAttribute('aria-invalid') === 'true' && q('.ng-vl-form').contains(active), active?.outerHTML?.slice(0, 120));
  // Cisco's reserved VLANs: a mark on the field, on the right switch.
  const reserved = structuredClone(ref.SW2);
  const [accessPort] = Object.entries(reserved.ports).find(([, p]) => p.mode === 'access');
  reserved.ports[accessPort].vlan = 1003;
  fillCisco(task, 'SW2', reserved);
  click(radio('.ng-vl-switches', 'SW1') ?? radio('.ng-vl-switches', 'SW1 •'));
  step(() => q('#vl-SW1-vlans').focus());
  key(q('#vl-SW1-vlans'), 'Enter');
  const field = document.activeElement;
  check('reserved: «Ще ні» with the reserved range named', /^• Ще ні\s*SW2 fa0\/\d+: VLAN 1002–1005 зарезервовані на Cisco/.test(status()), status());
  check('reserved: the jump to SW2 focuses the marked field (aria-invalid, described by its words)', field?.getAttribute('id') === `vl-SW2-ports-${accessPort}-vlan`
    && field.getAttribute('aria-invalid') === 'true' && /1002–1005/.test(text(document.getElementById(field.getAttribute('aria-describedby')))), field?.outerHTML?.slice(0, 160));
  // Edited since: the mark goes from the field; the verdict is the previous one.
  type(field, String(ref.SW2.ports[accessPort].vlan));
  check('stale: the edited field is no longer aria-invalid, its words gone', !q(`#vl-SW2-ports-${accessPort}-vlan`).hasAttribute('aria-invalid') && !all('.ng-vl-mark').some(p => /1002–1005/.test(text(p))));
  check('stale: the verdict says «до змін»', /до змін$/.test(status()), status());
  blur(q(`#vl-SW2-ports-${accessPort}-vlan`));
  // Ranges: any span of VLAN numbers expands; an unsafe one stays as typed and is marked, at once.
  const trunk = listOf('gi0/1');
  type(trunk, '10-200');
  blur(trunk);
  check('ranges: 10-200 expands (191 VLANs in the command)', /allowed vlan 10,11,12,.*,199,200$/.test(lines(q('.ng-vl-pre'))) && lines(q('.ng-vl-pre')).split('allowed vlan ')[1].split(',').length === 191);
  type(trunk, '9007199254740992-9007199254740992');
  blur(trunk);
  key(listOf('gi0/1'), 'Enter');
  const marked = listOf('gi0/1');
  check('ranges: a huge range stays as typed and is marked bad-vid', marked.value === '9007199254740992-9007199254740992' && marked.getAttribute('aria-invalid') === 'true'
    && /Номер VLAN має бути цілим числом від 1 до 4094/.test(status()), status());
});

scenario('ports: «Інші номери» reseeds; «Попередні номери» returns to the old drafts', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-1') }));
  const before = portsTask(m);
  click(all('.ng-vl-modes [role="radio"]').find(b => text(b) === ACCESS));
  /** An item of «⋯». */
  const more = label => { click(q('.ng-vl .ng-more-button')); return all('.ng-vl [role="menuitem"]').find(b => text(b) === label); };
  click(more('Інші номери VLAN'));
  const after = portsTask(m);
  check('numbers: a new seed for this task; the old one kept as previous', after.instanceKey !== before.instanceKey && place(m).portsPrevious['vlan.ports-1'] === PORT_SEEDS['vlan.ports-1']);
  check('numbers: the new instance starts blank', all('.ng-vl-modes [aria-checked="true"]').every(b => text(b) === 'не задано'));
  check('numbers: the old instance keeps its draft in the store', m.store.state.instances[before.instanceKey]?.view?.forms?.cisco !== undefined);
  click(more('← Попередні номери'));
  check('numbers: «Попередні номери» returns to the old drafts', portsTask(m).instanceKey === before.instanceKey && all('.ng-vl-modes [aria-checked="true"]').filter(b => text(b) === ACCESS).length === 1);
  check('numbers: and offers the other one back', place(m).portsPrevious['vlan.ports-1'] === place(m).portsSeeds['vlan.ports-1'] ? false : Boolean(more('← Попередні номери')));
});

scenario('ports: MikroTik form, drafts per syntax, no verdict across a switch', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-1') }));
  const task = portsTask(m, 'cisco');
  const first = row(labelOf(task, 'SW1', Object.keys(reference(task, 'cisco').SW1.ports)[0], 'cisco'));
  click([...first.querySelectorAll('[role="radio"]')].find(b => text(b) === ACCESS));
  click(checkBtn());
  check('switch: a Cisco verdict is shown', /Ще ні/.test(status()));
  click(radio('.ng-vl-controls', 'MikroTik'));
  check('switch: MikroTik has its own blank form (filtering off, no rows)', q('.ng-vl-filter input').checked === false && all('.ng-vl-row').length === 0 && all('.ng-vl-form-table tbody tr').length === task.topology.hosts.length);
  check('switch: no verdict carries across (empty status, no marks)', status() === '' && all('.ng-vl-mark').length === 0);
  // After the first check the asides are folded behind «?»; the RouterOS note is one (round 4, A8).
  const safety = q(`.ng-vl .ng-aside-q[aria-label="${ui.safetyTitle}"]`);
  if (safety?.getAttribute('aria-expanded') === 'false') click(safety);
  check('switch: the RouterOS note, an aside under the commands', all('.ng-aside-body .ng-vl-note').some(n => /VLAN filtering останнім.*консоль або окремий порт керування.*set замість add/.test(text(n))));
  // Fill RouterOS right.
  const ref = reference(task, 'routeros').SW1;
  for (const [port, p] of Object.entries(ref.ports)) {
    const r = row(labelOf(task, 'SW1', port, 'routeros'));
    const input = r.querySelector('input');
    type(input, String(p.pvid));
    blur(input);
    click([...row(labelOf(task, 'SW1', port, 'routeros')).querySelectorAll('[role="radio"]')].find(b => b.getAttribute('title') === p.frameTypes));
  }
  check('switch: frame types say their token (title) and show short words', all('.ng-vl-frames [role="radio"]').slice(0, 3).map(b => `${text(b)}=${b.getAttribute('title')}`).join(';') === 'all=admit-all;untagged=admit-only-untagged-and-priority-tagged;tagged=admit-only-vlan-tagged');
  ref.vlans.forEach((r, i) => {
    click(q('.ng-vl-add'));
    const ids = q(`#vl-SW1-vlans-${i}-vids`);
    type(ids, r.vids.join(','));
    blur(ids);
    for (const port of r.untagged) click([...all('.ng-vl-row')[i].querySelectorAll('[role="group"]')[1].querySelectorAll('button')].find(b => text(b) === labelOf(task, 'SW1', port, 'routeros')));
  });
  check('switch: members are toggles with words (aria-pressed)', all('.ng-vl-chip[aria-pressed="true"]').length === ref.vlans.reduce((n, r) => n + r.untagged.length, 0));
  // Filtering still off: everything leaks — the isolation failure.
  click(checkBtn());
  check('switch: filtering off fails isolation', /Кадр потрапляє на лінк ПК з іншої групи/.test(status()), status());
  const leakedPc = all('.ng-vl-host').find(g => g.className.includes('is-leaked'));
  check('switch: the PC the frame must not reach says so, not «✓ отримав»', leakedPc && text(leakedPc.querySelector('.ng-vl-status')) === '✕ отримав, а не мав'
    && status().includes(text(leakedPc.querySelector('.ng-vl-host-name'))), leakedPc && text(leakedPc));
  check('switch: the commands end with filtering, set last', /\/interface bridge set bridge1 vlan-filtering=no$/.test(q('.ng-vl-pre').textContent.trim()));
  const box = q('.ng-vl-filter input');
  step(() => { box.checked = true; fire(box, 'click'); });
  check('switch: VLAN Filtering ticked: the commands set it last', /\/interface bridge set bridge1 vlan-filtering=yes$/.test(q('.ng-vl-pre').textContent.trim()));
  click(checkBtn());
  check('switch: success in MikroTik', /^✓ Так/.test(status()), status());
  click(radio('.ng-vl-controls', 'Cisco'));
  check('switch: back on Cisco: its own draft (one access port), no verdict', all('.ng-vl-modes [aria-checked="true"]').filter(b => text(b) === ACCESS).length === 1 && status() === '');
  click(radio('.ng-vl-controls', 'MikroTik'));
  check('switch: back on MikroTik: its form kept, its verdict not brought back', q('.ng-vl-filter input').checked === true && all('.ng-vl-row').length === ref.vlans.length && status() === '');
  // Remove a row: the rows renumber.
  click(all('.ng-vl-remove')[0]);
  check('switch: «✕» removes a VLAN row', all('.ng-vl-row').length === ref.vlans.length - 1);
});

scenario('ports: hints and the reveal', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-3') }));
  const task = portsTask(m), key = task.instanceKey;
  const hintButton = () => all('button').find(b => /Підказка|Підказок/.test(text(b)));
  check('hints: «💡 Підказка 1 з 3»', text(hintButton()) === '💡 Підказка 1 з 3');
  click(hintButton());
  check('hints: rung 1 asks a question (where to look)', all('.ng-vl [data-help="hint"]').length === 1 && /\?/.test(text(q('.ng-vl [data-help="hint"]'))), text(q('.ng-vl [data-help="hint"]')));
  click(hintButton());
  click(hintButton());
  // Folded rungs first, then the current one (HelpPanel); by their numbers.
  const rungs = all('.ng-vl [data-help="hint"]').map(text).sort();
  check('hints: three rungs: where to look, the move (not the verdict), an example with other numbers', rungs.length === 3 && /^Підказка 2 з 3\. SW\d, порт [^:]+: для PC\d+ постав /.test(rungs[1]) && /300.*400/.test(rungs[2]), rungs);
  check('hints: the session counts them (assisted)', m.store.state.instances[key].session.hintIndex === 3 && m.store.state.instances[key].session.assisted === true);
  check('hints: after the last rung the hint button goes (no «Підказок більше немає»)', hintButton() === undefined && document.activeElement === q('.ng-vl .ng-help-current [data-help="hint"]'));
  check('reveal: nothing of the reference before the reveal', calls.ports === 0 && !q('.ng-vl-reference'));
  const before = calls.ports;
  click(all('button').find(b => text(b) === 'Показати відповідь'));
  const ref = realPortsSolution(task, 'cisco');
  const refCommands = ports.render(ref, 'cisco', task.topology);
  check('reveal: the reference commands, per switch (copy stays with the learner\'s own commands)', all('.ng-vl-reference .ng-vl-pre').map(lines).join('|') === Object.values(refCommands).join('|') && all('.ng-vl-reference h3').length === Object.keys(refCommands).length);
  check('reveal: marked revealed and assisted', m.store.state.instances[key].session.revealed === true && m.store.state.instances[key].session.assisted === true);
  check('reveal: read through useExercise only after the press', calls.ports > before);
  check('reveal: focus moves to the answer’s heading', document.activeElement === q('.ng-reveal-heading'));
  click(radio('.ng-vl-controls', 'MikroTik'));
  check('reveal: in MikroTik, the MikroTik reference', /\/interface bridge set bridge1 vlan-filtering=yes/.test(q('.ng-vl-reference .ng-vl-pre').textContent));
});

// ── «Між VLAN» (VLAN-2) ──────────────────────────────────────────────────

const ROUTE_SEEDS = { 'vlan.route-1': 31, 'vlan.route-2': 32, 'vlan.route-3': 33, 'vlan.route-4': 34 };
const routePlace = taskId => ({ exercise: 'route', routeTask: taskId, routeSeeds: { ...ROUTE_SEEDS } });
const routeTaskOf = (m, syntax = m.store.state.prefs.syntax) => {
  const p = place(m), record = bank.route.find(r => r.id === p.routeTask);
  return route.create(record, { variantId: 'main', seed: p.routeSeeds[record.id], syntax });
};
const button = label => all('button').find(b => text(b) === label);
/** A device tab, with or without its «•» (marks). */
const tab = id => all('.ng-vl-switches [role="radio"]').find(b => text(b).split(' ')[0] === id);
const radioIn = (group, label) => all(`${group} [role="radio"]`).find(b => text(b) === label);
/** Type a field's text and leave it (parse on blur), as a student does. */
const fill = (id, value) => { type(q(`#${id}`), value); blur(q(`#${id}`)); };
const deviceBox = id => all('.ng-vl-switch').find(g => text(g.querySelector('.ng-vl-switch-name')).split(' ')[0] === id);
const boxLines = id => all('.ng-vl-iface-text', deviceBox(id)).map(text);
const received = () => all('.ng-vl-status').filter(s => text(s) === '✓ отримав').map(s => text(s.parentNode.querySelector('.ng-vl-host-name')));
const plates = () => all('.ng-vl-tag-text').map(text);
const labelIn = (task, device, port, syntax) => task.topology.devices.find(d => d.id === device).ports.find(p => p.id === port).label[syntax];
const netOf = (task, vid) => task.networks.find(n => n.vid === vid);
const ciscoAddress = ip => `${ip} 255.255.255.0`;
function addSubif(i, number, vid, address, { enter = false } = {}) {
  click(button('+ підінтерфейс'));
  fill(`vl-R1-subifs-${i}-number`, String(number));
  fill(`vl-R1-subifs-${i}-vid`, String(vid));
  if (enter) { type(q(`#vl-R1-subifs-${i}-address`), address); key(q(`#vl-R1-subifs-${i}-address`), 'Enter'); } else fill(`vl-R1-subifs-${i}-address`, address);
}
function addVlanIf(dev, i, name, vid, on) {
  click(button('+ VLAN-інтерфейс'));
  fill(`vl-${dev}-vlanIfs-${i}-name`, name);
  fill(`vl-${dev}-vlanIfs-${i}-vid`, String(vid));
  click(radioIn(`[aria-label="Interface VLAN-інтерфейсу, рядок ${i + 1}"]`, on));
}
function addAddress(dev, i, address, iface) {
  click(button('+ адреса'));
  fill(`vl-${dev}-addresses-${i}-address`, address);
  click(radioIn(`[aria-label="Interface адреси, рядок ${i + 1}"]`, iface));
}

scenario('route 1: Cisco, a down parent, no route, success; MikroTik its own form', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-1') }));
  const task = routeTaskOf(m), parent = labelIn(task, 'R1', 'r', 'cisco');
  const [a, b] = task.vids, netA = netOf(task, a), netB = netOf(task, b);
  check('route: the third exercise «Між VLAN» is chosen', radio('.ng-vl-exercises', 'Між VLAN')?.getAttribute('aria-checked') === 'true');
  check('route: Cisco offers tasks 1–3; no line about task 4 in the header (F5: the diagram fits)', all('.ng-vl-variants [role="radio"]').map(text).join('|') === '1 · На паличці|2 · Транк теж твій|3 · Керування'
    && q('.ng-vl-head .ng-vl-why') === null, all('.ng-vl-variants [role="radio"]').map(text));
  check('route 1: R1’s form opens first; the parent starts shut down; no subinterface rows', text(q('.ng-vl-form-head h2')) === 'Налаштування R1'
    && radioIn('.ng-vl-states', 'вимкнено (shutdown)').getAttribute('aria-checked') === 'true' && text(q('.ng-vl-device-form')).includes('Підінтерфейсів ще немає.'));
  check('route 1: no router commands before its first subinterface (Fable 8)', !q('.ng-vl-cmds'));
  check('route 1: the diagram: a router box listing only its parent’s state; each PC’s gateway', JSON.stringify(boxLines('R1')) === JSON.stringify([`${parent} · shutdown`])
    && all('.ng-vl-host-fourth').map(text).join(',') === task.topology.hosts.map(h => `шлюз ${h.gateway}`).join(','), [boxLines('R1'), all('.ng-vl-host-fourth').map(text)]);
  // A down parent: the frame reaches R1's port and stops there.
  click(checkBtn());
  check('route 1: a down parent: «Ще ні», a pair and the reason', /^• Ще ні\s*PC\d → PC\d: Інтерфейс неактивний/.test(status()), status());
  check('route 1: its walk drawn: the path, «↑ тег A» on the trunk, a ✕ at R1’s port', all('.ng-vl-path').length === 2 && plates().includes(`↑ тег ${a}`) && all('.ng-vl-drop').length === 1, [all('.ng-vl-path').length, plates(), all('.ng-vl-drop').length]);
  check('route 1: and in words, ending at R1’s port', all('.ng-vl-steps li').some(li => text(li) === `R1 ${parent}: Інтерфейс неактивний: перевір фізичний порт маршрутизатора або наявність порту в таблиці VLAN для SVI.`), all('.ng-vl-steps li').map(text));
  check('route 1: no PC says «✓ отримав» on that failing walk', received().length === 0, received());
  // no shutdown and one subinterface: no route to the other VLAN.
  click(radioIn('.ng-vl-states', 'увімкнено (no shutdown)'));
  addSubif(0, a, a, ciscoAddress(netA.gateway));
  check('route 1: the commands follow the form', lines(q('.ng-vl-pre')) === `interface ${parent}\n no shutdown\ninterface ${parent}.${a}\n encapsulation dot1Q ${a}\n ip address ${netA.gateway} 255.255.255.0`, lines(q('.ng-vl-pre')));
  // Repair v1: the compact router joins a subinterface and its address on one line.
  check('route 1: the router box lists the subinterface and its address', JSON.stringify(boxLines('R1')) === JSON.stringify([`${parent} · no shutdown`, `${parent}.${a} · dot1Q ${a} · ${netA.gateway}/24`]), boxLines('R1'));
  check('route 1: after an edit, the verdict stays, dimmed «до змін»; the diagram says it is the previous check', /^• Ще ні/.test(status()) && /до змін$/.test(status()) && text(q('.ng-vl-previous')) === 'Попередня перевірка', status());
  click(checkBtn());
  check('route 1: no route: the words say so', /Маршрутизатор не має підключеної мережі/.test(status()), status());
  const r1Box = deviceBox('R1');
  check('route 1: R1’s box: its subinterface got the frame (✓), the router stops it (✕ by its name)', r1Box.getAttribute('class').includes('is-dropped')
    && all('.ng-vl-iface.is-received', r1Box).length === 1 && text(r1Box.querySelector('.ng-vl-iface.is-received .ng-vl-iface-mark')) === '✓', r1Box.getAttribute('class'));
  check('route 1: still no PC «✓ отримав»', received().length === 0, received());
  // The second subinterface, checked with Enter in its last field: success.
  addSubif(1, b, b, ciscoAddress(netB.gateway), { enter: true });
  check('route 1: success: «✓ Так»', /^✓ Так\s*Готово: перевірка пройшла\./.test(status()), status());
  check('route 1: a sample trace, both directions offered; with reduced motion nothing played, so it rests on «Запит»', /^Шлях пакета: PC\d → PC\d · Для прикладу$/.test(text(q('.ng-vl-walk-head h3'))) && radio('.ng-vl-directions', 'Запит').getAttribute('aria-checked') === 'true' && Boolean(radio('.ng-vl-directions', 'Відповідь')), text(q('.ng-vl-walk-head h3')));
  click(radio('.ng-vl-directions', 'Запит'));
  check('route 1: up in one VLAN, down in the other, routed by R1 (a sub-heading of the walk)', plates().includes(`↑ тег ${a}`) && plates().includes(`↓ тег ${b}`) && all('.ng-vl-walk-text .ng-vl-subhead').some(h => text(h).startsWith(`R1: маршрутизація R1 ${parent}.${a} → R1 ${parent}.${b}.`)), plates());
  check('route 1: the walk says first what it checks (reachability by broadcast, not the ICMP packet)', /не запис пакета ICMP/.test(text(q('.ng-vl-walk-text .ng-vl-abstraction'))));
  check('route 1: only the trace’s destination says «✓ отримав»', received().length === 1 && task.goals[received()[0]] === b, received());
  click(radio('.ng-vl-directions', 'Відповідь'));
  check('route 1: the reply: the other way round', plates().includes(`↑ тег ${b}`) && plates().includes(`↓ тег ${a}`) && received().length === 1 && task.goals[received()[0]] === a, [plates(), received()]);
  check('route 1: solved: no hint button or reveal', !all('button').some(b => /Підказка|Показати відповідь/.test(text(b))));
  check('route 1: the reference was never read', calls.route === 0, calls);
  // MikroTik: its own blank form; no verdict across.
  click(radio('.ng-vl-controls', 'MikroTik'));
  const ros = routeTaskOf(m, 'routeros'), port = labelIn(ros, 'R1', 'r', 'routeros');
  check('route 1 MikroTik: its own blank form, no verdict, no walk', all('.ng-vl-rows li').length === 0 && status() === '' && !q('.ng-vl-steps') && !q('.ng-vl-cmds'), status());
  check('route 1 MikroTik: task 4 offered; no Cisco-only line', all('.ng-vl-variants [role="radio"]').length === 4 && !q('.ng-vl-why'));
  addVlanIf('R1', 0, `office${a}`, a, port);
  addVlanIf('R1', 1, `office${b}`, b, port);
  addAddress('R1', 0, `${netA.gateway}/24`, `office${a}`);
  addAddress('R1', 1, `${netB.gateway}/24`, `office${b}`);
  check('route 1 MikroTik: the commands: VLAN interfaces, then addresses', lines(q('.ng-vl-pre')) === [
    `/interface vlan add name=office${a} vlan-id=${a} interface=${port}`, `/interface vlan add name=office${b} vlan-id=${b} interface=${port}`,
    `/ip address add address=${netA.gateway}/24 interface=office${a}`, `/ip address add address=${netB.gateway}/24 interface=office${b}`].join('\n'), lines(q('.ng-vl-pre')));
  // Renaming an interface: its address follows (as in Winbox).
  fill('vl-R1-vlanIfs-0-name', `vlan${a}x`);
  check('route 1 MikroTik: a renamed interface takes its address along', lines(q('.ng-vl-pre')).includes(`/ip address add address=${netA.gateway}/24 interface=vlan${a}x`), lines(q('.ng-vl-pre')));
  click(checkBtn());
  check('route 1 MikroTik: success (any names pass)', /^✓ Так/.test(status()), status());
  click(radio('.ng-vl-controls', 'Cisco'));
  check('route 1: back on Cisco: its draft (two subinterfaces), no verdict', all('.ng-vl-subifs li').length === 2 && status() === '', status());
});

scenario('route 2: a form finding on the other device opens it, with focus; marks go once edited', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-2') }));
  const task = routeTaskOf(m), [a] = task.vids, netA = netOf(task, a);
  check('route 2: SW1’s form first, every port editable', text(q('.ng-vl-form-head h2')) === 'Налаштування SW1' && !q('[aria-readonly="true"]'));
  fill('vl-SW1-vlans', '5000');
  click(tab('R1'));
  click(radioIn('.ng-vl-states', 'увімкнено (no shutdown)'));
  click(button('+ підінтерфейс'));
  fill('vl-R1-subifs-0-number', String(a));
  type(q('#vl-R1-subifs-0-address'), ciscoAddress(netA.gateway));
  step(() => q('#vl-R1-subifs-0-address').focus());
  key(q('#vl-R1-subifs-0-address'), 'Enter');
  const active = document.activeElement;
  check('route 2: a bad VLAN number on SW1: «Ще ні», SW1’s form opened', /^• Ще ні\s*SW1: Номер VLAN має бути цілим числом/.test(status()) && text(q('.ng-vl-form-head h2')) === 'Налаштування SW1', status());
  check('route 2: focus on the marked field, described by its words', active?.getAttribute('id') === 'vl-SW1-vlans' && active.getAttribute('aria-invalid') === 'true'
    // Round 5: also described by what the list is for («створити на комутаторі (один раз)»).
    && /1 до 4094/.test(text(document.getElementById(active.getAttribute('aria-describedby').split(' ')[0])))
    && text(document.getElementById(active.getAttribute('aria-describedby').split(' ')[1])) === 'створити на комутаторі (один раз)', active?.outerHTML?.slice(0, 160));
  check('route 2: the tabs say which devices have marks (R1 too: no encapsulation)', tab('SW1') && text(tab('SW1')) === 'SW1 •' && tab('SW1').getAttribute('aria-checked') === 'true' && text(tab('R1')) === 'R1 •', [text(tab('SW1')), text(tab('R1'))]);
  fill('vl-SW1-vlans', task.vids.join(','));
  check('route 2: the edited field loses its mark', !q('#vl-SW1-vlans').hasAttribute('aria-invalid') && /до змін/.test(status()));
  // R1: an address with no encapsulation: Cisco refuses it.
  click(tab('R1'));
  click(checkBtn());
  const vid = q('#vl-R1-subifs-0-vid');
  check('route 2: no encapsulation: the VLAN field marked, the row’s fields described by its words', vid.getAttribute('aria-invalid') === 'true'
    && /encapsulation dot1Q/.test(text(document.getElementById(q('#vl-R1-subifs-0-address').getAttribute('aria-describedby')))) && /^• Ще ні\s*R1 gi0\/\d\.\d+: Cisco не приймає/.test(status()), status());
  // The rest, as a student does it: SW1's access ports and trunk, R1's three subinterfaces.
  fill('vl-R1-subifs-0-vid', String(a));
  for (const [i, vid] of task.vids.slice(1).entries()) addSubif(i + 1, vid, vid, ciscoAddress(netOf(task, vid).gateway));
  click(tab('SW1'));
  for (const link of task.topology.links) {
    const [pc, sw] = link.a.device.startsWith('PC') ? [link.a, link.b] : [link.b, link.a];
    if (!pc.device.startsWith('PC')) continue;
    click([...row(labelIn(task, 'SW1', sw.port, 'cisco')).querySelectorAll('[role="radio"]')].find(b => text(b) === ACCESS));
    fill(`vl-SW1-ports-${sw.port}-vlan`, String(task.goals[pc.device]));
  }
  click([...row(labelIn(task, 'SW1', 't', 'cisco')).querySelectorAll('[role="radio"]')].find(b => text(b) === TRUNK));
  fill('vl-SW1-ports-t-allowed', task.vids.join(','));
  click(checkBtn());
  check('route 2: the switch and the router done: success', /^✓ Так/.test(status()) && lines(q('.ng-vl-pre')).includes(`switchport trunk allowed vlan ${task.vids.join(',')}`), status());
  check('route 2: the sample trace crosses the trunk both ways', plates().filter(p => /^[↑↓] тег \d+$/.test(p)).length === 2, plates());
  check('route 2: the reference was never read', calls.route === 0, calls);
  // Round 4 (F5): a PC's access port in another VLAN: the verdict names the device and the port to look at; that device's tab is marked and opens.
  const pcLink = task.topology.links.find(l => [l.a, l.b].some(e => e.device.startsWith('PC')));
  const [pc, sw] = pcLink.a.device.startsWith('PC') ? [pcLink.a, pcLink.b] : [pcLink.b, pcLink.a];
  const other = task.vids.find(v => v !== task.goals[pc.device]);
  fill(`vl-SW1-ports-${sw.port}-vlan`, String(other));
  check('route 2 (F4/F5): an edit opens the live commands again', q('details.ng-vl-cmds').hasAttribute('open'));
  click(tab('R1'));
  click(checkBtn());
  check('route 2 (F5): the verdict names the device and the port to look at', status().includes(`Дивись SW1, порт ${labelIn(task, 'SW1', sw.port, 'cisco')}: ${pc.device} у VLAN ${other}.`), status());
  check('route 2 (F5): that device\'s tab is marked (•) and open', text(q('.ng-vl-form-head h2')) === 'Налаштування SW1' && text(tab('SW1')) === 'SW1 •' && tab('SW1').getAttribute('aria-checked') === 'true', text(tab('SW1')));
  check('route 2 (F4/F5): the live commands fold to one line while the verdict is open', !q('details.ng-vl-cmds').hasAttribute('open') && /рядк/.test(text(q('details.ng-vl-cmds summary'))));
});

scenario('round 4: ports «Далі →», the quiet ✓, the asides fold after the first check', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-1') }));
  const task = portsTask(m), ref = reference(task, 'cisco');
  check('ports next: «Далі →» is offered before a solve as a quiet skip; «Перевірити» is the primary', nextBtn() !== null && !nextBtn().className.includes('ng-button-primary') && primaryBtn() === checkBtn());
  check('ports asides: the goal is open on the first visit', q('.ng-vl-intro .ng-aside-q').getAttribute('aria-expanded') === 'true');
  fillCisco(task, 'SW1', ref.SW1);
  click(checkBtn());
  check('ports next: a solve: «✓ Так», «Далі →» primary, «Перевірити» still there for further edits', /^✓ Так/.test(status()) && primaryBtn() === nextBtn() && checkBtn() !== null, status());
  check('ports asides: folded after the first check, «?» beside their titles', q('.ng-vl-intro .ng-aside-q').getAttribute('aria-expanded') === 'false');
  check('ports ✓: a quiet ✓ (DoneMark) on the solved task', /розв’язано/.test(all('.ng-vl-variants [role="radio"]')[0].textContent) && !/розв’язано/.test(all('.ng-vl-variants [role="radio"]')[1].textContent));
  click(nextBtn());
  check('ports next: «Далі →» opens the next task, focus on its form\'s heading', place(m).portsTask === 'vlan.ports-2' && document.activeElement === q('.ng-vl-form-head h2') && status() === '');
});

scenario('route 3: Cisco management cut off by the trunk (X7), then success', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-3') }));
  const task = routeTaskOf(m), mg = task.management, trunk = labelIn(task, 'SW1', 't', 'cisco'), parent = labelIn(task, 'R1', 'r', 'cisco');
  const mgmtIp = mg.network.replace(/\.0$/, '.77');
  check('route 3: the given access ports are read-only; the trunk is the student’s', all('.ng-vl-modes [aria-readonly="true"]').length === task.topology.hosts.length
    && text(q('.ng-vl-device-form')).includes('Порти доступу задано умовою.') && Boolean(q('#vl-SW1-ports-t-allowed')));
  check('route 3: the notes under SW1’s commands: nonegotiate, the SVI, moving management', all('.ng-vl-cmds .ng-vl-note').map(text).join('|').includes('Якщо show ip interface brief покаже Vlan… як administratively down — no shutdown.')
    && all('.ng-vl-cmds .ng-vl-note').some(n => text(n).startsWith('Переносячи керування: залиш доступ через консоль')), all('.ng-vl-cmds .ng-vl-note').map(text));
  click(q('.ng-vl-intro .ng-aside-q'));
  check('route 3: the task in one sentence; its full words (both limits) in the aside «Умова повністю»', text(q('.ng-vl-task-text')).includes(routeUi.taskOne[3]) && /не захищає його/.test(text(q('.ng-vl-intro .ng-aside-body'))) && /не доступ через SSH чи Winbox/.test(text(q('.ng-vl-intro .ng-aside-body'))));
  fill('vl-SW1-svi-vid', String(mg.vid));
  fill('vl-SW1-svi-address', ciscoAddress(mgmtIp));
  fill('vl-SW1-defaultGateway', mg.gateway);
  // Repair v1: a switch with PCs shows its lines on a tray under its PC rows, an address joined to its interface.
  check('route 3: SW1’s management address on the diagram, once set', JSON.stringify(boxLines('SW1')) === JSON.stringify([`Vlan${mg.vid} · ${mgmtIp}/24`, `шлюз ${mg.gateway}`]) && Boolean(q('.ng-vl-tray', deviceBox('SW1'))), boxLines('SW1'));
  click(tab('R1'));
  check('route 3: R1’s given rows say so; its parent is read-only', all('.ng-vl-subifs li.is-fixed').length === 2 && q('.ng-vl-states [role="radiogroup"]').getAttribute('aria-readonly') === 'true');
  addSubif(2, mg.vid, mg.vid, ciscoAddress(mg.gateway));
  click(checkBtn());
  const said = status(), first = said.indexOf(`PC1 → SW1 Vlan${mg.vid}: Не вдається дістатися`), second = said.indexOf(`Також SW1 Vlan${mg.vid}: Інтерфейс неактивний`);
  check('route 3: the trunk’s stop first, the SVI second (X7)', first > 0 && second > first, said);
  check('route 3: the walk stops at SW1’s trunk port, in words and with a ✕', all('.ng-vl-steps li').some(li => text(li) === `SW1 ${trunk}: Вхідний порт не належить до цього VLAN: кадр відкинуто.`) && all('.ng-vl-drop').length === 1, all('.ng-vl-steps li').map(text));
  check('route 3: the moving-management note under the walk', text(q('.ng-vl-walk-text .ng-vl-lesson')).startsWith('Переносячи керування'));
  check('route 3: R1 routed it: its interfaces marked', all('.ng-vl-iface.is-received', deviceBox('R1')).length > 0 && all('.ng-vl-iface.is-hop', deviceBox('R1')).length > 0);
  // Carry M: create it and allow it on the trunk.
  click(tab('SW1'));
  fill('vl-SW1-vlans', task.vids.join(','));
  fill('vl-SW1-ports-t-allowed', task.vids.join(','));
  click(checkBtn());
  click(radio('.ng-vl-directions', 'Запит'));
  check('route 3: success; the sample trace is the admin PC to SW1’s address (its request)', /^✓ Так/.test(status()) && text(q('.ng-vl-walk-head h3')) === `Шлях пакета: PC1 → SW1 Vlan${mg.vid} · Для прикладу`, [status(), text(q('.ng-vl-walk-head h3'))]);
  check('route 3: SW1’s management line got it (✓)', all('.ng-vl-iface.is-received', deviceBox('SW1')).length === 1, boxLines('SW1'));
  check('route 3: the commands render the SVI without no shutdown (X1)', lines(q('.ng-vl-pre')).includes(`interface vlan ${mg.vid}\n ip address ${mgmtIp} 255.255.255.0\nip default-gateway ${mg.gateway}`)
    && !/interface vlan \d+\n( ip address [^\n]+\n)? no shutdown/.test(lines(q('.ng-vl-pre'))), lines(q('.ng-vl-pre')));
  check('route 3: the reference was never read', calls.route === 0, calls);
});

// Repair v1: task 3's management block comes first on SW1; a missing management address marks it and is the
// evidence; on R1's tab the evidence is SW1's tab.
scenario('route 3: no management address: SW1\'s block is marked first; another tab points back at SW1', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-3') }));
  const form = q('.ng-vl-device-form');
  check('route 3: on SW1 the management block comes before the ports', form.querySelector('.ng-vl-mgmt') && all('section, table', form)[0].className.includes('ng-vl-mgmt'));
  click(checkBtn());
  const mark = q('.ng-vl-mgmt .ng-vl-mark');
  check('route 3: the verdict marks SW1\'s management block, its evidence', Boolean(mark) && mark.getAttribute('data-evidence') === 'current', status());
  click(tab('R1'));
  const evid = all('.ng-vl-switches [data-evidence="current"]').map(text);
  check('route 3: on R1, SW1\'s tab is the evidence', evid.length === 1 && evid[0].startsWith('SW1'), evid);
});

scenario('route 3: MikroTik management on bridge1 (bridge1 a member), default route', m => {
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' }));
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-3') }));
  const task = routeTaskOf(m, 'routeros'), mg = task.management, port = labelIn(task, 'R1', 'r', 'routeros'), trunk = labelIn(task, 'SW1', 't', 'routeros');
  check('route 3 MikroTik: bridge1 is offered as a member', all('.ng-vl-chip.is-cpu').length > 0 && all('.ng-vl-chip.is-cpu').every(c => text(c) === 'bridge1'));
  click(button('+ VLAN'));
  // Repair v1: the management block (VLAN interfaces) now comes first; the bridge's VLAN rows are the list with the VLAN IDs fields.
  const bridgeRows = all('.ng-vl-rows').find(ol => all('input', ol).some(i => /^vl-SW1-vlans-\d+-vids$/.test(i.getAttribute('id') ?? '')));
  const row = bridgeRows.querySelectorAll('li').length - 1;
  fill(`vl-SW1-vlans-${row}-vids`, String(mg.vid));
  const chips = kind => [...bridgeRows.querySelectorAll('li')][row].querySelectorAll('[role="group"]')[kind === 'tagged' ? 0 : 1].querySelectorAll('button');
  click([...chips('tagged')].find(b => text(b) === trunk));
  click([...chips('tagged')].find(b => text(b) === 'bridge1'));
  addVlanIf('SW1', 0, 'mgmt', mg.vid, 'bridge1');
  addAddress('SW1', 0, `${mg.network.replace(/\.0$/, '.60')}/24`, 'mgmt');
  fill('vl-SW1-routes-0-gateway', mg.gateway);
  const cmds = lines(q('.ng-vl-pre')).split('\n');
  check('route 3 MikroTik: bridge1 tagged, the interface on bridge1, the route; filtering last', cmds.some(c => c.startsWith(`/interface bridge vlan add bridge=bridge1 vlan-ids=${mg.vid} tagged=`) && c.split('tagged=')[1].split(',').sort().join() === [trunk, 'bridge1'].sort().join())
    && cmds.includes(`/interface vlan add name=mgmt vlan-id=${mg.vid} interface=bridge1`) && cmds.includes(`/ip route add dst-address=0.0.0.0/0 gateway=${mg.gateway}`) && cmds.at(-1) === '/interface bridge set bridge1 vlan-filtering=yes', cmds);
  check('route 3 MikroTik: the RouterOS safety note and the management note', all('.ng-vl-cmds .ng-vl-note').some(n => /VLAN filtering останнім/.test(text(n))) && all('.ng-vl-cmds .ng-vl-note').some(n => /^Переносячи керування/.test(text(n))));
  click(tab('R1'));
  check('route 3 MikroTik: R1’s given rows say so', all('.ng-vl-row.is-fixed').length === 4);
  addVlanIf('R1', 2, `vlan${mg.vid}`, mg.vid, port);
  addAddress('R1', 2, `${mg.gateway}/24`, `vlan${mg.vid}`);
  click(checkBtn());
  check('route 3 MikroTik: success', /^✓ Так/.test(status()), status());
  // Without the default route the reply has no way back.
  click(tab('SW1'));
  fill('vl-SW1-routes-0-gateway', '');
  click(checkBtn());
  check('route 3 MikroTik: no route back: the reply fails, shown first', /Зворотний шлях: Для адреси поза своєю мережею потрібен шлюз/.test(status()) && radio('.ng-vl-directions', 'Відповідь')?.getAttribute('aria-checked') === 'true', status());
  check('route 3 MikroTik: the sender’s line says it stops there', all('.ng-vl-iface.is-dropped', deviceBox('SW1')).length > 0);
});

scenario('route 4: MikroTik only; a VLAN interface on a bridge port; Cisco moves to task 3', m => {
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' }));
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-4') }));
  const task = routeTaskOf(m, 'routeros');
  check('route 4: R1’s form first: its bridge (bridge1 a member), VLAN interfaces, addresses', text(q('.ng-vl-form-head h2')) === 'Налаштування R1' && /Bridge → Ports/.test(text(q('.ng-vl-device-form')))
    && all('.ng-vl-chip.is-cpu').length === 0 && /Interfaces → VLAN/.test(text(q('.ng-vl-device-form'))));
  // A draft put in place as a student would end it: right but for one VLAN interface on a bridge port.
  const draft = structuredClone(realRouteSolution(task, 'routeros'));
  const access = task.topology.devices.find(d => d.id === 'R1').ports.find(p => p.id !== 'r');
  draft.R1.vlanIfs[0].on = access.id;
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { routeros: draft } } } }));
  click(checkBtn());
  check('route 4: the bridge-port mistake: «Ще ні», in words', /VLAN-інтерфейс або адреса на порту, який входить до мосту/.test(status()), status());
  check('route 4: a ✕ at that port; R1’s interface line says ✕; no PC «✓ отримав»', all('.ng-vl-drop').length >= 1 && all('.ng-vl-iface.is-dropped', deviceBox('R1')).length >= 1 && received().length === 0, [all('.ng-vl-drop').length, received()]);
  check('route 4: the walk says the way back stops at the port', all('.ng-vl-steps li').some(li => text(li) === `R1 ${access.label.routeros}: ${'VLAN-інтерфейс або адреса на порту, який входить до мосту, не отримує кадри. Використай VLAN-інтерфейс на bridge1.'}`), all('.ng-vl-steps li').map(text));
  click(radioIn('[aria-label="Interface VLAN-інтерфейсу, рядок 1"]', 'bridge1'));
  click(checkBtn());
  check('route 4: on bridge1: success', /^✓ Так/.test(status()), status());
  click(radio('.ng-vl-controls', 'Cisco'));
  check('route 4: in Cisco, task 3 is shown and kept in the place', place(m).routeTask === 'vlan.route-3' && radio('.ng-vl-variants', '3 · Керування')?.getAttribute('aria-checked') === 'true');
  check('route 4: task 4 keeps its MikroTik draft, without its verdict', Boolean(m.store.state.instances[task.instanceKey]?.view?.forms?.routeros) && !m.store.state.instances[task.instanceKey]?.view?.verdict);
});

scenario('route: deleting a row keeps focus in its list (keyboard)', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-2') }));
  const task = routeTaskOf(m);
  // Cisco subinterfaces: three rows; ✕ on the last moves focus to the one before it.
  click(tab('R1'));
  for (let i = 0; i < 3; i++) click(button('+ підінтерфейс'));
  const press = el => step(() => { el.focus(); fire(el, 'click'); }); // Enter or Space on a focused button
  press(q('#vl-R1-subifs-2-remove'));
  check('route rows: ✕ on the last row: focus on the row before', document.activeElement === q('#vl-R1-subifs-1-remove') && all('.ng-vl-subifs li').length === 2, document.activeElement?.outerHTML?.slice(0, 80));
  press(q('#vl-R1-subifs-0-remove'));
  check('route rows: ✕ on the first: focus on the row now in its place', document.activeElement === q('#vl-R1-subifs-0-remove') && all('.ng-vl-subifs li').length === 1);
  press(q('#vl-R1-subifs-0-remove'));
  check('route rows: ✕ on the only row: focus on the list’s add button', document.activeElement === q('#vl-R1-subifs-add') && text(document.activeElement) === '+ підінтерфейс');
  // MikroTik: VLAN interfaces, addresses and the bridge's VLAN rows (VLAN-1's form) the same way.
  click(radio('.ng-vl-controls', 'MikroTik'));
  click(tab('R1'));
  click(button('+ VLAN-інтерфейс'));
  press(q('#vl-R1-vlanIfs-0-remove'));
  check('route rows: a VLAN interface: focus on its add button', document.activeElement === q('#vl-R1-vlanIfs-add'));
  click(button('+ адреса')); click(button('+ адреса'));
  press(q('#vl-R1-addresses-1-remove'));
  check('route rows: an address: focus on the row before', document.activeElement === q('#vl-R1-addresses-0-remove'));
  click(tab('SW1'));
  click(button('+ VLAN')); click(button('+ VLAN'));
  press(q('#vl-SW1-vlans-1-remove'));
  check('route rows: a bridge VLAN row (VLAN-1’s form): focus on the row before', document.activeElement === q('#vl-SW1-vlans-0-remove'));
  press(q('#vl-SW1-vlans-0-remove'));
  check('route rows: the only bridge VLAN row: focus on «+ VLAN»', document.activeElement === q('#vl-SW1-vlans-add') && task.vids.length > 0);
});

scenario('route: «Інші номери», hints and the reveal', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-1') }));
  const before = routeTaskOf(m);
  click(radioIn('.ng-vl-states', 'увімкнено (no shutdown)'));
  const more = label => { click(q('.ng-vl .ng-more-button')); return all('.ng-vl [role="menuitem"]').find(b => text(b) === label); };
  click(more('Інші номери VLAN'));
  const after = routeTaskOf(m);
  check('route numbers: a new seed; the old kept as previous; the new instance blank', after.instanceKey !== before.instanceKey && place(m).routePrevious['vlan.route-1'] === ROUTE_SEEDS['vlan.route-1']
    && radioIn('.ng-vl-states', 'вимкнено (shutdown)').getAttribute('aria-checked') === 'true');
  click(more('← Попередні номери'));
  check('route numbers: «Попередні номери» returns to the old draft', routeTaskOf(m).instanceKey === before.instanceKey && radioIn('.ng-vl-states', 'увімкнено (no shutdown)').getAttribute('aria-checked') === 'true');
  const hintButton = () => all('button').find(b => /Підказка|Підказок/.test(text(b)));
  click(hintButton()); click(hintButton()); click(hintButton());
  const rungs = all('.ng-vl [data-help="hint"]').map(text).sort();
  check('route hints: three rungs: a question, the failing hop, an example with other numbers', rungs.length === 3 && /\?/.test(rungs[0]) && /^Підказка 2 з 3\. PC\d → PC\d[:;] /.test(rungs[1]) && /300/.test(rungs[2]), rungs);
  check('route hints: no internal ids in their words', !rungs.some(r => /pc-pair:|gateway:|management:|R1:r|:svi/.test(r)), rungs);
  check('route reveal: nothing of the reference before the press', calls.route === 0 && !q('.ng-vl-reference'));
  click(button('Показати відповідь'));
  const task = routeTaskOf(m);
  const ref = route.render(realRouteSolution(task, 'cisco'), 'cisco', task.topology);
  check('route reveal: the reference commands, per device (copy stays with the learner\'s own)', all('.ng-vl-reference .ng-vl-pre').map(lines).join('|') === [ref.SW1, ref.R1].join('|') && all('.ng-vl-reference h3').length === 2);
  check('route reveal: read through useExercise only after the press; marked assisted', calls.route > 0 && m.store.state.instances[task.instanceKey].session.revealed === true && m.store.state.instances[task.instanceKey].session.assisted === true);
  click(radio('.ng-vl-controls', 'MikroTik'));
  check('route reveal: in MikroTik, the MikroTik reference', /\/interface vlan add name=vlan\d+ vlan-id=\d+ interface=ether\d/.test(all('.ng-vl-reference .ng-vl-pre').map(lines).join('\n')), all('.ng-vl-reference .ng-vl-pre').map(lines));
});


// ── The walks in motion (VLAN-anim spec v2) ──────────────────────────────

const tick = ms => step(() => { mock.timers.tick(ms); });
const tokens = () => all('.ng-vl-token');

scenario('motion: predict: no frame before the commit; the walk plays; words after it; any press skips; replay', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p2') }));
  const task = taskOf(m), round = task.rounds[0];
  const right = realPredictSolution(task)[round.id];
  check('motion predict: no token before the commit', tokens().length === 0 && !q('.ng-vl-replay'));
  if (right.length) for (const id of right) click(choice(id)); else click(q('.ng-vl-nobody'));
  click(primaryBtn());
  const sourceOuts = 1; // a PC has one link
  check('motion predict: at the commit, the verdict now; the frame leaves its PC (one token per real egress)', /^✓ Так/.test(status()) && tokens().length === sourceOuts && !/Кадр (отримали|не отримав)/.test(status() + later()), [status(), tokens().length]);
  check('motion predict: the walk in words is readable, without who received it yet', all('.ng-vl-steps li').length > 0 && !all('.ng-vl-steps li').some(li => /Кадр (отримали|не отримав)/.test(text(li))));
  const announced = status();
  // Repair v1 (Astra 5): a compact PC link carries no plate (it would cross a box); the walk's words say the wire form.
  check('motion predict: no plate on a PC link (compact); the words say the frame leaves without a tag', all('.ng-vl-token-word').length === 0 && /без тега/.test(text(q('.ng-vl-steps li'))), all('.ng-vl-token-word').map(text));
  check('motion predict: nothing reached yet: no PC says «✓ отримав»', !all('.ng-vl-status').some(s => text(s) === '✓ отримав'));
  tick(5000);
  check('motion predict: at the walk’s end, the static walk and «Кадр отримали» (the words after the motion)', tokens().length === 0 && /Кадр (отримали|не отримав)/.test(later()) && all('.ng-vl-path').length > 0, later());
  check('motion predict: the live region said its words once: nothing added at the end', status() === announced, [announced, status()]);
  const presses = m.store.state.instances[task.instanceKey].presses;
  click(q('.ng-vl-replay'));
  check('motion predict: «Показати ще раз» plays it again', tokens().length > 0);
  check('motion predict: a replay keeps the words and the live region as they were, and counts no press', /Кадр (отримали|не отримав)/.test(later()) && status() === announced && m.store.state.instances[task.instanceKey].presses === presses, status());
  step(() => fire(q('.ng-vl-question'), 'pointerdown'));
  check('motion predict: any press skips to the end', tokens().length === 0 && all('.ng-vl-path').length > 0);
  click(primaryBtn()); // «Наступний раунд →»
  check('motion predict: the next round shows no frame until its commit', tokens().length === 0 && !q('.ng-vl-replay'));
  click(all('.ng-vl-dot')[0]);
  check('motion predict: back on round 1: its static result, no motion', tokens().length === 0 && all('.ng-vl-path').length > 0);
}, { reducedMotion: false });

scenario('motion: reduced motion shows the end at once', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p1') }));
  click(q('.ng-vl-nobody'));
  click(primaryBtn());
  check('motion reduced: no token, the whole walk, the words at once', tokens().length === 0 && all('.ng-vl-path').length > 0 && /Кадр (отримали|не отримав)/.test(later()));
});

scenario('motion: ports: a failure plays its walk; an edit ends it for good; the success lap one VLAN after another', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-1') }));
  const task = portsTask(m), ref = reference(task, 'cisco');
  check('motion ports: no frame before a check', tokens().length === 0);
  // Every port in one VLAN: the isolation failure, with its walk.
  const wrong = structuredClone(ref);
  for (const p of Object.values(wrong.SW1.ports)) if (p.mode === 'access') p.vlan = task.vids[0];
  const form = sw => ({ vlans: sw.vlans, ports: Object.fromEntries(Object.entries(sw.ports).map(([id, p]) => [id, { mode: p.mode, vlan: p.vlan ?? '', allowed: p.allowed ?? [] }])) });
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: { SW1: form(wrong.SW1) } } } } }));
  click(checkBtn());
  check('motion ports: the failure’s walk plays', /^• Ще ні/.test(status()) && tokens().length > 0);
  // An edit: the verdict is the previous one; the motion stops at its end frame and never replays.
  const first = all('.ng-vl-form-table input')[0];
  type(first, '4000');
  check('motion ports: an edit ends the motion: the static end frame, no replay', tokens().length === 0 && !q('.ng-vl-replay') && /до змін/.test(status()));
  // Right: the lap.
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: { SW1: form(ref.SW1) } }, raw: {} } } }));
  click(checkBtn());
  const tones = () => [...new Set(tokens().map(t => t.getAttribute('class').match(/ng-vl-d(\d)/)?.[1]))];
  check('motion ports lap: success now; a broadcast of the first VLAN only, in its colour', /^✓ Так/.test(status()) && tokens().length > 0 && tones().length === 1 && tones()[0] === '0', tones());
  check('motion ports lap: no domains or line before the lap ends', !q('.ng-vl-legend') && !later().includes(ui.portsLap));
  const lapAnnounced = status();
  const seen = new Set();
  for (let i = 0; i < 40 && tokens().length; i++) { tones().forEach(t => seen.add(t)); tick(100); }
  check('motion ports lap: then the second VLAN (one after another)', seen.has('0') && seen.has('1'), [...seen]);
  check('motion ports lap: at its end, the domains and «Кожен VLAN тримає свої кадри при собі», under the feedback', q('.ng-vl-legend') && later() === ui.portsLap && !status().includes(ui.portsLap), [later(), status()]);
  check('motion ports lap: the live region said its words once', status() === lapAnnounced, [lapAnnounced, status()]);
}, { reducedMotion: false });

scenario('motion: route: a routed request, R1’s new frame, then the reply; the toggle follows', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-1') }));
  const task = routeTaskOf(m), readBefore = calls.route;
  check('motion route: no frame before a check', tokens().length === 0);
  const ref = realRouteSolution(task, 'cisco');
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: { ...route.initialAnswer(task, 'cisco'), R1: ref.R1 } } } } }));
  click(checkBtn());
  check('motion route: success now; the request plays, the toggle on «Запит»', /^✓ Так/.test(status()) && tokens().length === 1 && radio('.ng-vl-directions', 'Запит')?.getAttribute('aria-checked') === 'true');
  let caption = null, newFrame = false, reply = false;
  for (let i = 0; i < 60 && (tokens().length || q('.ng-vl-motion-caption')); i++) {
    caption ??= q('.ng-vl-motion-caption') ? text(q('.ng-vl-motion-caption')) : null;
    newFrame ||= tokens().some(t => t.getAttribute('class').includes('is-new-frame'));
    reply ||= radio('.ng-vl-directions', 'Відповідь')?.getAttribute('aria-checked') === 'true' && tokens().length > 0;
    tick(100);
  }
  check('motion route: R1’s hop says it: the same IP packet, a new Ethernet frame', caption === 'R1: той самий IP-пакет, новий Ethernet-кадр', caption);
  check('motion route: then a new frame leaves R1', newFrame);
  check('motion route: then the reply plays, the toggle following it', reply);
  check('motion route: at the end, the line after the lap (under the feedback), the toggle resting on «Відповідь»', later() === routeUi.lap && !status().includes(routeUi.lap) && radio('.ng-vl-directions', 'Відповідь')?.getAttribute('aria-checked') === 'true', [later(), status()]);
  check('motion route: «Запит» shows the request’s static scene (no replay on a toggle)', (() => { click(radio('.ng-vl-directions', 'Запит')); return tokens().length === 0; })());
  check('motion route: the reference was never read by the screen', calls.route === readBefore, calls);
}, { reducedMotion: false });


scenario('motion: a syntax switch, navigation and a key end a play; edit then undo stays static', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-1') }));
  const task = portsTask(m), ref = reference(task, 'cisco');
  const wrong = structuredClone(ref);
  for (const p of Object.values(wrong.SW1.ports)) if (p.mode === 'access') p.vlan = task.vids[0];
  const form = sw => ({ vlans: sw.vlans, ports: Object.fromEntries(Object.entries(sw.ports).map(([id, p]) => [id, { mode: p.mode, vlan: p.vlan ?? '', allowed: p.allowed ?? [] }])) });
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: { SW1: form(wrong.SW1) } } } } }));
  // Edit, then undo: the play never comes back.
  click(checkBtn());
  check('motion owner: a check plays', tokens().length > 0);
  const field = all('.ng-vl-form-table input')[0], was = field.value;
  type(field, '4000');
  check('motion owner: an edit ends it (a stale verdict)', tokens().length === 0);
  type(q(`#${field.getAttribute('id')}`), was);
  tick(100);
  check('motion owner: undoing the edit brings no play back', tokens().length === 0 && !/Попередня перевірка/.test(status()) && Boolean(q('.ng-vl-replay')), status());
  // A key press skips.
  click(q('.ng-vl-replay'));
  check('motion skip: a replay plays', tokens().length > 0);
  key(checkBtn(), 'Shift');
  check('motion skip: a key press ends it at once', tokens().length === 0 && all('.ng-vl-path').length > 0);
  // A syntax switch mid-play.
  click(q('.ng-vl-replay'));
  click(radio('.ng-vl-controls', 'MikroTik'));
  check('motion syntax: a switch mid-play leaves no frame (and no verdict) in the other syntax', tokens().length === 0 && status() === '');
  click(radio('.ng-vl-controls', 'Cisco'));
  tick(100);
  check('motion syntax: back: no frame, and no play comes back', tokens().length === 0);
  // Navigation mid-play: another exercise, then back.
  click(checkBtn());
  check('motion navigation: a check plays', tokens().length > 0);
  click(radio('.ng-vl-exercises', 'Куди дійде кадр'));
  click(radio('.ng-vl-exercises', 'Налаштуй порти'));
  tick(100);
  check('motion navigation: back: the static result, no play', tokens().length === 0 && all('.ng-vl-path').length > 0 && /Ще ні/.test(status()));
}, { reducedMotion: false });

scenario('motion: a failing «Між VLAN» probe plays its failing direction', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-3') }));
  const task = routeTaskOf(m);
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: realRouteSolution(task, 'cisco') } } } }));
  fill('vl-SW1-defaultGateway', task.management.network.replace(/\.0$/, '.99')); // nobody has it: the reply has no way back
  click(checkBtn());
  check('motion route failure: the reply fails', /Зворотний шлях/.test(status()), status());
  check('motion route failure: it plays the failing reply, the toggle on «Відповідь»', tokens().length > 0 && radio('.ng-vl-directions', 'Відповідь')?.getAttribute('aria-checked') === 'true');
  let request = false;
  for (let i = 0; i < 60 && tokens().length; i++) { request ||= radio('.ng-vl-directions', 'Запит')?.getAttribute('aria-checked') === 'true'; tick(100); }
  check('motion route failure: only the reply plays (the toggle never moves to «Запит»)', !request);
  check('motion route failure: it ends on the reply’s static walk, still on «Відповідь»', tokens().length === 0 && all('.ng-vl-path').length > 0 && radio('.ng-vl-directions', 'Відповідь')?.getAttribute('aria-checked') === 'true');
  click(radio('.ng-vl-directions', 'Запит'));
  check('motion route failure: choosing «Запит» shows its static request, no play', tokens().length === 0 && radio('.ng-vl-directions', 'Запит')?.getAttribute('aria-checked') === 'true');
}, { reducedMotion: false });

scenario('motion: reduced motion: a «Між VLAN» success rests on «Запит»', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace('vlan.route-1') }));
  const task = routeTaskOf(m), ref = realRouteSolution(task, 'cisco');
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: { ...route.initialAnswer(task, 'cisco'), R1: ref.R1 } } } } }));
  click(checkBtn());
  check('motion reduced route: success, no frame, the toggle resting on «Запит», the line under the feedback', /^✓ Так/.test(status()) && tokens().length === 0 && radio('.ng-vl-directions', 'Запит')?.getAttribute('aria-checked') === 'true' && later() === routeUi.lap, [status(), later()]);
});

scenario('ports: solved, an edit doesn’t bring the hints back (VLAN-3 fix brief item 7, where else)', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-1') }));
  const task = portsTask(m), ref = reference(task, 'cisco');
  const form = sw => ({ vlans: sw.vlans, ports: Object.fromEntries(Object.entries(sw.ports).map(([id, p]) => [id, { mode: p.mode, vlan: p.vlan ?? '', allowed: p.allowed ?? [] }])) });
  step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { forms: { cisco: { SW1: form(ref.SW1) } } } } }));
  click(checkBtn());
  check('hints after solving: none', /^✓ Так/.test(status()) && !q('.ng-help-hint-button'));
  type(all('.ng-vl-form-table input')[0], '4000');
  check('hints after solving: an edit (a previous verdict) still none', /до змін/.test(status()) && !q('.ng-help-hint-button'), status());
});

/** Ctrl + wheel on a diagram frame (round 4 A3): a ResizeObserver stub gives
 * the frame a size the drawing fits in (no bar); the wheel zooms, never the
 * page, and the stored zoom shows the bar. A plain wheel does nothing. */
function wheelZoom(label, mountIt, frameSelector, barSelector) {
  const observers = [];
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.els = []; observers.push(this); } observe(el) { this.els.push(el); } disconnect() {} };
  let m;
  try {
    m = mountIt();
    const frame = q(frameSelector);
    Object.assign(frame, { clientWidth: 1400, clientHeight: 900 });
    step(() => { for (const o of observers) if (o.els.includes(frame)) o.cb([]); });
    check(`${label}: a frame the drawing fits in: no zoom bar`, Boolean(frame.getAttribute('data-scale')) && q(barSelector) === null, frame.getAttribute('data-scale'));
    const plain = step(() => fire(frame, 'wheel', { deltaY: -100, deltaMode: 0 }));
    check(`${label}: a plain wheel is the page's (not prevented, no bar)`, !plain.defaultPrevented && q(barSelector) === null);
    const zoom = step(() => fire(frame, 'wheel', { ctrlKey: true, deltaY: -100, deltaMode: 0 }));
    check(`${label}: Ctrl + wheel zooms the diagram, never the page, and the bar appears`, zoom.defaultPrevented && q(barSelector) !== null);
  } catch (e) { check(`${label}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  delete globalThis.ResizeObserver;
}

wheelZoom('VLAN wheel', () => mountVlan(), '.ng-vl-frame', '.ng-vl-zoom');

// ── Round 5 (spec 5b-1 §4 v2): fact links, action lines, the short window ─

const { interVlanAction } = await import('../../src/sections/vlan/logic/route-action.js');
const highlighted = () => all('.ng-vl-svg [data-highlight]');
const nextEl = el => { let n = el?.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; };
const said = link => text(nextEl(link));

scenario('round 5: predict — a port in the evidence outlines its own label only (device-qualified); a choice, a commit clear it', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: predictPlace('p2') }));
  const task = taskOf(m), round = task.rounds[0];
  const configured = Object.values(task.configurations).reduce((n, c) => n + Object.keys(c.ports).length, 0);
  const rows = all('.ng-vl-evidence tr[data-evidence-row]');
  check('predict: a row per configured port, each port a fact link', rows.length === configured && rows.every(r => r.querySelector('.ng-fact-link')), rows.length);
  check('predict: nothing outlined before a tap', highlighted().length === 0);
  // A port label both switches have (the trunk's gi0/1 or ether1): tap SW2's.
  const sw2Start = rows.findIndex(r => text(r.querySelector('.ng-vl-ev-name')) === 'SW2');
  const sw1Labels = rows.slice(0, sw2Start).map(r => text(r.querySelector('.ng-fact-link')));
  const shared = rows.slice(sw2Start).find(r => sw1Labels.includes(text(r.querySelector('.ng-fact-link'))));
  const link = shared.querySelector('.ng-fact-link'), label = text(link);
  click(link);
  check('predict: the tap outlines exactly SW2’s label, never SW1’s of the same name', highlighted().length === 1 && highlighted()[0].getAttribute('data-hl') === `port:SW2:${label}`
    && text(highlighted()[0]) === label && all(`.ng-vl-svg [data-hl="port:SW1:${label}"]`).length === 1, highlighted().map(e => e.getAttribute('data-hl')));
  check('predict: the link looks pressed and says whose port it is (polite, on the tap only)', link.className.includes('is-active') && said(link).startsWith(`SW2 ${label} — порт до `), said(link));
  check('predict: nothing but a label is outlined (no box, path or button)', highlighted().every(e => ['text', 'tspan'].includes(e.tagName.toLowerCase())));
  const other = task.topology.hosts.map(h => h.device).find(id => id !== round.from);
  click(choice(other));
  check('predict: a choice clears the outline', highlighted().length === 0 && !link.className.includes('is-active'));
  click(all('.ng-vl-evidence .ng-fact-link')[0]);
  check('predict: a tap again outlines again', highlighted().length === 1);
  click(checkBtn());
  check('predict: the commit clears it (the round on screen changed)', highlighted().length === 0);
  check('predict: after the commit the action line says so, in its place', text(q('.ng-vl-work .ng-action-line')) === ui.predictDone
    && q('.ng-vl-choices').getAttribute('aria-labelledby') === 'ng-vl-choices-locked');
});

scenario('round 5: ports — a port cell outlines its label on the diagram; another switch clears it', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-2') }));
  // Round 5 (5b-2 A): only the folded worked example between them.
  check('ports: the action line above the port rows', text(q('#ng-vl-ports-action')) === ui.portsAction.cisco && nextEl(q('#ng-vl-ports-action'))?.matches('[data-worked-example]')
    && nextEl(nextEl(q('#ng-vl-ports-action')))?.matches('.ng-vl-form-table'));
  const link = q('.ng-vl-form-table th .ng-fact-link'), label = text(link);
  click(link);
  check('ports: the tap outlines SW1’s port label', highlighted().length === 1 && highlighted()[0].getAttribute('data-hl') === `port:SW1:${label}`, highlighted().map(e => e.getAttribute('data-hl')));
  click(radio('.ng-vl-form-head .ng-vl-switches', 'SW2'));
  check('ports: on SW2 nothing is outlined', highlighted().length === 0);
  click(radio('.ng-vl-form-head .ng-vl-switches', 'SW1'));
  check('ports: back on SW1, still nothing (a tap belongs to its scope)', highlighted().length === 0);
  const modes = all('.ng-vl-modes [role="radio"]').slice(0, 3);
  check('ports: the modes read «доступ (access)», «транк (trunk)», «не задано», the word over the term', modes.map(text).join('|') === `${ACCESS}|${TRUNK}|не задано`
    && nextEl(modes[0].querySelector('.ng-vl-mode-word'))?.className === 'ng-vl-mode-term');
});

// Repair v1 (Astra 4): the gate's PC-label count on port rows comes from the topology, so losing one label fails.
const { essentialsOf, vlanCounts } = await import('../../tools/shots.mjs');
scenario('round 5: ports — the gate counts each port row\'s PC label from the topology (deletion fails)', m => {
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: portsPlace('vlan.ports-2') }));
  const entry = essentialsOf('vl-ports', 'first').filter(e => e.sel.includes('ng-vl-port-pc'));
  const task = portsTask(m);
  const hostLinks = task.topology.links.filter(l => [[l.a, l.b], [l.b, l.a]].some(([own, other]) => own.device === 'SW1' && other.device.startsWith('PC'))).length;
  check('ports gate: the count is the switch\'s PC links, and every one is on screen', entry.length === 1 && q('.ng-vl-work').getAttribute('data-task-hostports') === String(hostLinks)
    && all('.ng-vl-form-table th.ng-vl-port .ng-vl-port-pc').length === hostLinks && vlanCounts(entry).length === 0, vlanCounts(entry));
  const label = q('.ng-vl-form-table th.ng-vl-port .ng-vl-port-pc');
  label.parentNode.removeChild(label);
  const wrong = vlanCounts(entry);
  check('ports gate: one PC label deleted: the count fails', wrong.length === 1 && /expected \d+ from the task \(hostports\), found \d+/.test(wrong[0].reason), wrong);
});

scenario('round 5: «Між VLAN» — the action line follows the task and the syntax', m => {
  for (const id of ['vlan.route-1', 'vlan.route-2', 'vlan.route-3']) {
    step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: routePlace(id) }));
    for (const syntax of ['cisco', 'routeros']) {
      step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: syntax }));
      const record = bank.route.find(r => r.id === id);
      const task = route.create(record, { variantId: 'main', seed: ROUTE_SEEDS[id], syntax });
      check(`route: ${id}/${syntax}: the action line`, text(q('#ng-vl-route-action')) === interVlanAction(task, syntax), text(q('#ng-vl-route-action')));
    }
  }
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' }));
});

// Round 5 (5b-2 A): the worked example on «Налаштуй порти» and «Між VLAN»: folded on every first view,
// opened only by its toggle, its own instance in the current syntax, closed again by a new task or syntax;
// nothing of it reaches the learner's form.
scenario('5b-2: the worked examples open by their toggle only and close on a new task or syntax', m => {
  const wex = () => all('[data-worked-example]');
  const toggle = () => q('[data-worked-example] .ng-wex-toggle');
  const card = () => q('[data-worked-example] .ng-wex-card');
  for (const [exercise, place, action] of [['ports', portsPlace('vlan.ports-1'), '#ng-vl-ports-action'], ['route', routePlace('vlan.route-1'), '#ng-vl-route-action']]) {
    step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: place }));
    check(`5b-2 ${exercise}: one folded example, the action line's next sibling`, wex().length === 1 && toggle().getAttribute('aria-expanded') === 'false' && card() === null
      && q(action).nextSibling === wex()[0]);
    const before = JSON.stringify(m.store.state.instances);
    click(toggle());
    check(`5b-2 ${exercise}: opened, the example in Cisco words, on its own VLAN 310; the store untouched`, toggle().getAttribute('aria-expanded') === 'true' && card() !== null
      && /приклад · інші числа/.test(text(card())) && /\b310\b/.test(text(card())) && /fa0\/1|gi0\/1/.test(text(card())) && JSON.stringify(m.store.state.instances) === before,
      { card: text(card()), store: JSON.stringify(m.store.state.instances) === before });
    step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' }));
    check(`5b-2 ${exercise}: another syntax closes it; opened again, its MikroTik form`, toggle().getAttribute('aria-expanded') === 'false' && card() === null);
    click(toggle());
    check(`5b-2 ${exercise}: MikroTik words`, /ether2|vlan310/.test(text(card())), text(card()));
    step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' }));
    click(all('.ng-vl-variants [role="radio"]')[1]);
    check(`5b-2 ${exercise}: another task finds it closed`, wex().length === 1 && toggle().getAttribute('aria-expanded') === 'false' && card() === null);
  }
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' }));
});

/** A short window (1000 × 700: the screen area under the bar is 641 px): the route and faults intro asides start folded. */
{
  const observers = [];
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.els = []; observers.push(this); } observe(el) { this.els.push(el); } unobserve() {} disconnect() {} };
  const bodyClass = document.body.className;
  document.body.className = `${bodyClass} ng-screen`.trim();
  Object.assign(document.body, { clientHeight: 641 });
  let m;
  try {
    m = mountVlan({ place: routePlace('vlan.route-1') });
    step(() => { for (const o of observers) o.cb([]); });
    const aside = q('.ng-vl-intro .ng-aside');
    check('short window: «Умова повністю» starts folded to its line', aside && !aside.className.includes('is-open') && text(aside).includes(routeUi.goalTitle), aside?.className);
    click(aside.querySelector('.ng-aside-q'));
    check('short window: «?» opens it, and it stays open (the learner’s choice)', q('.ng-vl-intro .ng-aside').className.includes('is-open'));
    step(() => { for (const o of observers) o.cb([]); });
    check('short window: a later measure keeps the learner’s choice', q('.ng-vl-intro .ng-aside').className.includes('is-open'));
  } catch (e) { check('short window: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  document.body.className = bodyClass;
  Object.assign(document.body, { clientHeight: 0 });
  delete globalThis.ResizeObserver;
  // Round 9 (Fable 8): a tall window too: the task, the drawing and the first action come first.
  const tall = mountVlan({ place: routePlace('vlan.route-1') });
  check('tall window (or unmeasured): «Умова повністю» starts folded too', !q('.ng-vl-intro .ng-aside').className.includes('is-open'));
  tall.unmount();
}

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
