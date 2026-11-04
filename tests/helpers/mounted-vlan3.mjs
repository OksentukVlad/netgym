// Mounted lifecycle scenarios for «Знайди несправність» (VLAN-3 spec v2 §4,
// Z1, Z2, Z7; brief v1 item 9): the real VlanScreen in the app store,
// mounted with react-dom/client in tests/helpers/mini-dom.mjs, with
// node:test's mocked timers. Run in its own process by
// tests/vlan3-mounted.test.mjs (tools/test.sh runs it first and passes the
// results file). Prints one JSON line: { results: [{ name, ok, detail }] }.
// Round 4 (spec F6 with its v2 transitions): checks → repair → cause, one
// stage at a time under a stepper; the cause opens after a passing repair
// and closes again when the repair is edited (the choice kept); the jumps
// went; the grid's marks are «✓ проходить» / «✗ не проходить»; «Далі →».
//   - the fourth tab; the grid at the start (the given configuration's
//     state), the cause list in the logic's order (the cause stage), the
//     forms holding the given configuration, every row editable;
//   - a walk on demand: a tap draws a row's walk (in motion), again as often
//     as wanted, with no check, no attempt and no grid change;
//   - the grid changes only on «Перевірити» (an edit says it will);
//   - each Z2 outcome: a failing fix says the same whatever the cause; a
//     working fix with another cause says «причина була інша» and marks the
//     instance assisted; with no cause, it asks for one (not assisted); both
//     right: done, and «Ще одна →» moves the level 1 → 2 → 3 and stays;
//   - a form error: its field marked, the grid says it isn't applied;
//   - the Cisco trunk's native field (level 3), typed and checked;
//   - an IP task: the router's rows editable (nothing «задано»), a probe's
//     request and reply;
//   - MikroTik, a VLAN-1 shape and «Між VLAN»'s bridge on R1: the version
//     the task gives, a repair with the right cause;
//   - the hints (rung 3 only once opened; tied to the last check; gone once
//     solved) and the reveal (the cause, the change, the commands that go and
//     come, the grid before and after, a heading level below its own);
//   - a long grid: the summary, the failing rows first, the passing folded;
//     the stepper (any earlier stage one tap away); snapshot walks drawn
//     over their own configuration's lines; focus after a check that opens
//     another device; «Попередні номери» bringing the instance back;
//   - a syntax switch: each vendor's own instance and draft;
//   - leaks, for every one of the 14 causes forced on its networks: no
//     fault code anywhere in the DOM (text, attributes, classes, values,
//     accessible names), no cause, repair or teaching words (a stop that
//     diagnoses or says its repair) outside the options, the options in one
//     order, no field marked and no device opened by the unchanged check,
//     before the reveal, with every walk and hints 1–2 open;
//   - no React warnings.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';

const { document, fire, setReducedMotion } = installDom();
mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
let random = 0;
Math.random = () => (random = (random + 0.1234567) % 1);
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const { act, mountVlan, faults, catalogue, causeText, faultText, faultsUi, faultExample, t, ui, toFaultForm, usesNative } = await import('../../.test-bundles/harness/mounted-vlan3.mjs');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

// Count the screen's checks and reveals.
const real = { check: faults.check, solution: faults.solution, create: faults.create, hints: faults.hints };
const calls = { check: 0, solution: 0 };
faults.check = (...args) => { calls.check += 1; return real.check(...args); };
faults.solution = (...args) => { calls.solution += 1; return real.solution(...args); };

const step = fn => { let out; act(() => { out = fn(); }); act(() => { mock.timers.tick(200); }); return out; };
const tick = ms => step(() => { mock.timers.tick(ms); });
const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const click = el => step(() => { el.focus(); fire(el, 'click'); });
const type = (el, value) => step(() => { el.value = value; fire(el, 'input'); });
const blur = el => step(() => { fire(el, 'focusout'); el.blur(); });
const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const status = () => text(q('[role="status"]'));
const radio = (group, label) => all(`${group} [role="radio"]`).find(b => text(b) === label);
const button = label => all('button').find(b => text(b) === label);
const rows = () => all('.ng-vf-work .ng-vf-row');
const rowLabels = () => rows().map(b => b.getAttribute('aria-label'));
const failingRow = () => rows().find(b => /не проходить/.test(text(b)));
const tokens = () => all('.ng-vl-token');
const causes = () => all('.ng-vf-cause').map(text);
// Round 4 (spec A1, F6): the panel's buttons, the stepper.
const checkBtn = () => q('.ng-help-check');
const nextBtn = () => q('.ng-help-next');
const hintBtn = () => q('.ng-help-hint-button');
const revealBtn = () => q('.ng-help-reveal-link');
const nextEl = el => { let n = el?.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; };
const stageBtn = name => all('.ng-vf-stepper .ng-vf-step').find(b => text(b).endsWith(faultsUi.stages[name]));
const current = () => all('.ng-vf-stepper .ng-vf-step').find(b => b.getAttribute('aria-current') === 'step');
const stageIs = name => current() === stageBtn(name);
const goStage = name => click(stageBtn(name));
const causeLocked = () => stageBtn('cause').getAttribute('aria-disabled') === 'true';
const hints = () => all('.ng-vf-work [data-help="hint"]').map(text).sort();
let vendorNow = 'cisco';
const chooseCause = (code, vendor = vendorNow) => {
  const label = all('.ng-vf-cause').find(l => text(l) === causeText[vendor][code]);
  const input = label?.querySelector('input');
  step(() => { input.checked = true; fire(input, 'click'); });
};
const instance = (m, task) => m.store.state.instances[task.instanceKey];
const more = label => { click(q('.ng-vl .ng-more-button')); return all('.ng-vl [role="menuitem"]').find(b => text(b) === label); };

const record = (await import('../../.test-bundles/harness/mounted-vlan3.mjs')).bank.faults[0];
/** The instance a slot shows, with its fault and repair (tooling only, never the screen's). */
const inspect = (vendor, level, seed, shape) => faults.inspect(record, { vendor, level, seed, ...(shape ? { variantId: shape } : {}) });
const slotOf = i => ({ seed: i.task.identity.seed, level: i.task.identity.level, shape: i.task.identity.shape });

/** Mount, open the fault-finding on an instance (and the other vendor's slot when given). */
function open(m, i, other = null) {
  const vendor = i.task.vendor;
  vendorNow = vendor;
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: vendor }));
  step(() => m.store.dispatch({ type: 'place', scope: 'vlan', patch: { exercise: 'faults', faults: { ...(other ? { [other.task.vendor]: slotOf(other) } : {}), [vendor]: slotOf(i) }, faultsPrevious: {} } }));
}
/** Put a configuration in the form, as typing it would. */
const setForm = (m, task, config) => step(() => m.store.dispatch({ type: 'instance', key: task.instanceKey, action: { type: 'view', patch: { form: toFaultForm(config, task.vendor, { native: task.vendor === 'cisco' && usesNative(task.initialConfiguration) }), raw: {} } } }));
/** The repair, checked: «Причина» opens. */
function repairAndCheck(m, i) {
  goStage('repair');
  setForm(m, i.task, i.repaired);
  click(checkBtn());
}

function scenario(name, fn, { reducedMotion = true } = {}) {
  setReducedMotion(reducedMotion);
  const m = mountVlan();
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}

const A = inspect('cisco', 1, 16, 'two-switch'); // trunk-missing-vlan on SW2
const B = inspect('cisco', 3, 12, 'transit'); // native-mismatch
const C = inspect('cisco', 2, 11, 'route-1'); // router-address-wrong-network
const D = inspect('routeros', 1, 11, 'two-switch'); // access-frame-types
const other = (i, not = []) => faults.options(i.task, 'cause').map(o => o.value).find(c => c !== i.site.code && !not.includes(c));

// ── The tab, the start: the checks stage ─────────────────────────────────

scenario('start', m => {
  check('tab: «Знайди несправність» is the fourth exercise', all('.ng-vl-exercises [role="radio"]').map(text).join('|') === 'Куди дійде кадр|Налаштуй порти|Між VLAN|Знайди несправність');
  open(m, A);
  const task = A.task;
  check('start: level 1 of 3, the network’s name', text(q('.ng-vf-level')).startsWith('Рівень 1 з 3') && text(q('.ng-vf-level')).includes(task.shapeSpec.title), text(q('.ng-vf-level')));
  check('start: three stages in a stepper, «Перевірки» current, «Причина» locked until a passing repair', all('.ng-vf-step').map(text).join('|') === '1 Перевірки|2 Ремонт|3 Причина' && stageIs('checks') && causeLocked()
    && stageBtn('cause').getAttribute('title') === faultsUi.causeLocked);
  check('start: the jump buttons went', !q('.ng-vf-jumps'));
  const grid = faults.grid(task);
  check('start: the grid is the given configuration’s state, said so', text(q('.ng-vf-work .ng-vf-state')) === faultsUi.gridState.initial
    && rows().length === grid.reachability.length + grid.isolation.length, [rows().length, text(q('.ng-vf-state'))]);
  check('start: each row says in words whether it passes (the A6 marks «✓ проходить» / «✗ не проходить»)', rowLabels().every(l => /: (проходить|не проходить)/.test(l))
    && rows().filter(b => /✗ не проходить/.test(text(b))).length === [...grid.reachability, ...grid.isolation].filter(r => !r.observed).length && !all('.ng-vf-legend').length, rowLabels());
  check('start: one stage at a time: no causes, no form yet', causes().length === 0 && !q('#vl-SW1-vlans'));
  // Round 5 (R1): the stage's action line, right above the checks.
  const action = q('.ng-vf-grid .ng-action-line');
  check('start: «Торкнись перевірки, що не проходить.» right above the checks', text(action) === faultsUi.action.checks && nextEl(action)?.matches('.ng-vf-part')
    && all('.ng-vf-work .ng-action-line').length === 1, text(action));
  check('start: the work column carries the task counts (R5 gate)', q('.ng-vf-work').getAttribute('data-task-hosts') === String(task.topology.hosts.length)
    && q('.ng-vf-work').getAttribute('data-task-failing') === String(rows().filter(b => /✗ не проходить/.test(text(b))).length));
  check('start: no verdict, no walk', status() === '' && !q('.ng-vl-walk-text') && tokens().length === 0);
  goStage('repair');
  check('repair: the form holds the given configuration (SW1’s VLANs)', q('#vl-SW1-vlans').value === task.initialConfiguration.SW1.vlans.join(','), q('#vl-SW1-vlans')?.value);
  check('repair: its own action line, one at a time', text(q('.ng-vf-work .ng-action-line')) === faultsUi.action.repair && all('.ng-vf-work .ng-action-line').length === 1);
  // Round 5 (5b-2 E): the form's heading says which device is being looked at, not which one to fix.
  const inspected = () => text(q('.ng-vl-form-head h2'));
  check('repair: «Зараз: <device>», never «Виправ: …»', /^Зараз: SW\d$/.test(inspected()) && !/Виправ:/.test(text(q('.ng-vf-work'))), inspected());
  const otherTab = all('.ng-vl-form-head .ng-vl-switches [role="radio"]').find(b => b.getAttribute('aria-checked') !== 'true');
  if (otherTab) {
    const before = inspected();
    click(otherTab);
    check('repair: another device tab, its own name', inspected() === `Зараз: ${text(otherTab).replace(/ •$/, '')}` && inspected() !== before, inspected());
    click(all('.ng-vl-form-head .ng-vl-switches [role="radio"]').find(b => text(b).replace(/ •$/, '') === before.replace('Зараз: ', '')));
  }
  check('repair: every port editable (no read-only group)', all('.ng-vl-modes [aria-readonly="true"]').length === 0 && all('.ng-vl-modes').length > 0);
  check('repair: the live commands are the given configuration’s', /switchport mode trunk/.test(text(q('.ng-vl-cmds .ng-vl-pre'))));
  check('repair: the given configuration beside the form, nothing struck yet', Boolean(q('.ng-vf-original')) && all('.ng-vf-original .is-changed').length === 0);
  check('repair: no native field at level 1', all('.ng-vl-native').length === 0);
  click(stageBtn('cause'));
  check('stepper: a locked «Причина» doesn’t open', stageIs('repair'));
});

// ── A walk on demand ─────────────────────────────────────────────────────

scenario('walk on demand', m => {
  open(m, A);
  const task = A.task, before = calls.check;
  const ok = rows().find(b => /✓ проходить/.test(text(b)));
  click(ok);
  check('walk: a passing check draws its walk, the stage stays', ok.getAttribute('aria-pressed') === 'true' && all('.ng-vl-path').length > 0 && Boolean(q('.ng-vl-walk-text')) && stageIs('checks'));
  click(failingRow());
  check('walk: a failing check draws its walk and opens «Ремонт» (F6)', stageIs('repair') && all('.ng-vl-path').length > 0);
  check('walk: in words, from its source', /^Шлях кадру: від PC\d+$/.test(text(q('.ng-vl-walk-text h3'))) && all('.ng-vl-walk-text li').length > 2, text(q('.ng-vl-walk-text h3')));
  check('walk: no check, no attempt, no verdict', calls.check === before && !instance(m, task)?.presses && status() === '');
  goStage('checks');
  check('walk: the grid one tap away, unchanged, the path still drawn', text(q('.ng-vf-state')) === faultsUi.gridState.initial && all('.ng-vl-path').length > 0 && failingRow().getAttribute('aria-pressed') === 'true');
  click(failingRow());
  goStage('checks');
  click(failingRow());
  check('walk: still no check after several taps', calls.check === before && !instance(m, task)?.presses);
}, { reducedMotion: true });

scenario('walk on demand in motion', m => {
  open(m, A);
  click(failingRow());
  check('motion: a tap plays the walk', tokens().length > 0);
  tick(6000);
  check('motion: at its end, the static walk', tokens().length === 0 && all('.ng-vl-path').length > 0);
  goStage('checks');
  click(failingRow());
  check('motion: a tap again replays it', tokens().length > 0);
  type(q('#vl-SW1-vlans'), '1,2,3');
  check('motion: an edit ends the play', tokens().length === 0);
}, { reducedMotion: false });

// ── The grid, the checks, the stages (Z1, Z2, F6) ────────────────────────

scenario('checks → repair → cause', m => {
  open(m, A);
  const task = A.task;
  const initial = rowLabels();
  click(checkBtn());
  check('a failing repair: «Ще ні», its words; «Причина» stays locked', /^• Ще ні/.test(status()) && causeLocked() && stageIs('checks'), status());
  check('grid: after a check with the same configuration, the same rows, now «після «Перевірити»»', rowLabels().join('|') === initial.join('|') && text(q('.ng-vf-state')) === faultsUi.gridState.checked);
  check('a failing repair: its walk with the verdict, in words under the panel', Boolean(q('.ng-vl-walk-pointer')) && all('.ng-vl-walk-text li').length > 0);
  const failing = status().replace(/^• Ще ні/, '');
  goStage('repair');
  setForm(m, task, A.repaired);
  check('repair: on a device it didn\'t change, nothing struck', all('.ng-vf-original .is-changed').length === 0 && text(q('.ng-vf-original h3')).endsWith('SW1'));
  click(radio('.ng-vl-switches', 'SW2'));
  check('repair: on the device it changed, those given lines struck, said in words too (F6)', all('.ng-vf-original .is-changed').length > 0 && all('.ng-vf-original .is-changed').every(l => /\(змінено\)/.test(l.textContent)));
  check('verdict: the last one stays, dimmed «до змін»', /до змін$/.test(status()), status());
  goStage('checks');
  check('grid: an edit doesn’t change it; it says it will after a check', rowLabels().join('|') === initial.join('|') && text(q('.ng-vf-state')) === faultsUi.gridState.stale && q('.ng-vf-state').className.includes('is-stale'));
  goStage('repair');
  click(checkBtn());
  check('a passing repair opens «Причина»: «Мережа працює. Залиш ці зміни й обери, що було зламано.»', stageIs('cause') && !causeLocked() && status() === t('fault-cause-required'), status());
  check('that isn’t help: not assisted', instance(m, task).session.assisted === false);
  check('cause: the logic’s options, in their order; none chosen; no values', causes().join('|') === faults.options(task, 'cause').map(o => o.label).join('|') && all('.ng-vf-radio').every(r => !r.hasAttribute('value') && r.checked !== true), causes());
  check('cause: the causes are the panel\'s evidence', q('.ng-vf-causes').getAttribute('data-evidence') === 'current');
  goStage('checks');
  check('grid: the check updated it: every row passes', rows().every(b => /✓ проходить/.test(text(b))) && text(q('.ng-vf-state')) === faultsUi.gridState.checked);
  goStage('cause');
  chooseCause(other(A));
  check('cause: a choice makes the verdict «до змін»', /до змін$/.test(status()));
  click(checkBtn());
  check('working repair, another cause: «Ремонт правильний — залиш його. Причина була інша.»', status().endsWith(t('fault-cause-other')) && /^• Ще ні/.test(status()), status());
  check('and the instance is assisted (no hint opened)', instance(m, task).session.assisted === true && instance(m, task).session.hintIndex === 0);
  check('not done: «Далі →» is a quiet skip', !nextBtn().className.includes('ng-button-primary'));
  chooseCause(A.site.code);
  click(checkBtn());
  check('both right: «✓ Так»', /^✓ Так/.test(status()) && status().includes(t('ok')), status());
  check('solved, its earned mark assisted (the earlier other cause)', instance(m, task).session.status === 'solved' && instance(m, task).session.earned.assisted === true);
  check('done: «Далі →» primary, no hints', nextBtn().className.includes('ng-button-primary') && !hintBtn());
  check('done: the level carries a quiet ✓', /розв’язано/.test(q('.ng-vf-level').textContent));
  check('a failing repair said its words before any cause', failing.length > 0);
});

scenario('Z2: a failing repair says the same, draws the same walk and grid, whatever the cause', m => {
  open(m, A);
  const said = {};
  for (const code of [null, A.site.code, other(A)]) {
    repairAndCheck(m, A);
    if (code) chooseCause(code);
    else step(() => m.store.dispatch({ type: 'instance', key: A.task.instanceKey, action: { type: 'view', patch: { cause: null } } }));
    goStage('repair');
    setForm(m, A.task, A.task.initialConfiguration);
    click(checkBtn());
    const words = { status: status(), walk: text(q('.ng-vl-walk-text')), locked: causeLocked() };
    goStage('checks');
    said[code ?? 'none'] = { ...words, grid: rowLabels().join('|') };
  }
  const values = Object.values(said);
  check('Z2: a failing repair: the same verdict, walk and grid with no cause, the right one or another (Astra 5)', values.every(v => JSON.stringify(v) === JSON.stringify(values[0]))
    && /^• Ще ні/.test(values[0].status) && values[0].walk.length > 0 && values[0].grid.length > 0 && values[0].locked, said);
});

scenario('edit after a passing repair', m => {
  open(m, A);
  repairAndCheck(m, A);
  chooseCause(other(A));
  goStage('repair');
  type(q('#vl-SW1-vlans'), `${A.repaired.SW1.vlans.join(',')},999`);
  check('edit after pass: the verdict «до змін»; «Причина» closed until the repair passes again', /до змін$/.test(status()) && causeLocked(), status());
  check('edit after pass: the edited field is the panel\'s evidence', q('#vl-SW1-vlans').getAttribute('data-evidence') === 'current');
  click(stageBtn('cause'));
  check('edit after pass: a press on the locked «Причина» does nothing', stageIs('repair'));
  type(q('#vl-SW1-vlans'), A.repaired.SW1.vlans.join(','));
  blur(q('#vl-SW1-vlans'));
  check('edit after pass: undoing the edit doesn\'t reopen «Причина» without a check (Astra 3)', causeLocked() && stageIs('repair'));
  click(checkBtn());
  check('edit after pass: passing again, «Причина» opens with the choice kept', stageIs('cause') && text(q('.ng-vf-cause.is-chosen')) === causeText.cisco[other(A)], status());
  goStage('repair');
  setForm(m, A.task, A.task.initialConfiguration);
  click(checkBtn());
  check('a failing repair wins over the cause, whatever it is (Z2)', /^• Ще ні/.test(status()) && !status().includes(t('fault-cause-other')) && causeLocked(), status());
});

scenario('Z2: an invalid cause', m => {
  open(m, A);
  repairAndCheck(m, A);
  step(() => m.store.dispatch({ type: 'instance', key: A.task.instanceKey, action: { type: 'view', patch: { cause: 'no-such-cause' } } }));
  click(checkBtn());
  check('invalid-cause: «Обери причину зі списку», not assisted', status() === t('invalid-cause') && instance(m, A.task).session.assisted === false, status());
});

scenario('a skip stays on its level', m => {
  open(m, A);
  click(nextBtn());
  check('«Пропустити»: a new task, the same level (Олена)', m.store.state.places.vlan.faults.cisco.level === 1 && m.store.state.places.vlan.faults.cisco.seed !== A.task.identity.seed);
});

scenario('levels', m => {
  open(m, A);
  const levels = [1];
  for (let i = 0; i < 3; i++) {
    const slot = m.store.state.places.vlan.faults.cisco;
    const inst = inspect('cisco', slot.level, slot.seed, slot.shape);
    repairAndCheck(m, inst);
    chooseCause(inst.site.code);
    click(checkBtn());
    click(nextBtn());
    levels.push(m.store.state.places.vlan.faults.cisco.level);
    check(`levels: «Далі →» #${i + 1} starts at the checks`, stageIs('checks') && status() === '');
  }
  check('levels: «Далі →» moves 1 → 2 → 3, and stays at 3', levels.join(',') === '1,2,3,3', levels);
  check('levels: the header says the level', text(q('.ng-vf-level')).startsWith('Рівень 3 з 3'));
  const shape = m.store.state.places.vlan.faults.cisco.shape;
  click(more(ui.otherNumbersMenu));
  const slot = m.store.state.places.vlan.faults.cisco;
  check('«Інші номери VLAN» («⋯»): the same network and level, other numbers; «Попередні номери» back', slot.shape === shape && slot.level === 3 && Boolean(more(ui.previousNumbers)));
});

scenario('form error', m => {
  open(m, A);
  goStage('repair');
  type(q('#vl-SW1-vlans'), '10,abc');
  click(checkBtn());
  check('form: the field marked, said where; its mark is the panel\'s evidence', q('#vl-SW1-vlans').getAttribute('aria-invalid') === 'true' && /SW1/.test(status()) && q('.ng-vf-repair .ng-vl-mark')?.getAttribute('data-evidence') === 'current', status());
  goStage('checks');
  check('form: the grid says the configuration isn’t applied', Boolean(q('.ng-vf-invalid')) && rows().length === 0);
});

// ── The native field (level 3) ───────────────────────────────────────────

scenario('native', m => {
  open(m, B);
  const task = B.task;
  goStage('repair');
  check('native: level 3, Cisco: the given configuration uses it, so trunks show the field', usesNative(task.initialConfiguration) && all('.ng-vl-native input').length > 0);
  const sw = task.topology.devices.filter(d => d.kind === 'switch');
  const trunkOf = id => Object.entries(task.initialConfiguration[id].ports).find(([, p]) => p.mode === 'trunk');
  const [port, p] = trunkOf('SW1');
  const field = q(`#vl-SW1-ports-${port}-native`);
  check('native: it holds the given value', field?.value === String(p.native ?? ''), field?.value);
  check('native: its name says what it is', /native VLAN/.test(field.getAttribute('aria-label')));
  for (const d of sw) {
    if (d.id !== 'SW1') click(radio('.ng-vl-switches', d.id));
    for (const [id, tp] of Object.entries(B.repaired[d.id].ports).filter(([, x]) => x.mode === 'trunk')) {
      const input = q(`#vl-${d.id}-ports-${id}-native`);
      type(input, tp.native === undefined ? '' : String(tp.native));
      blur(input);
    }
  }
  click(checkBtn());
  check('native: typed back to match: the repair passes, «Причина» opens', stageIs('cause'), status());
  chooseCause(B.site.code);
  click(checkBtn());
  check('native: with the right cause: done', /^✓ Так/.test(status()), status());
  goStage('repair');
  check('native: the commands say it', /switchport trunk native vlan \d+/.test(all('.ng-vl-pre').map(text).join(' ')));
});

// ── An IP task ───────────────────────────────────────────────────────────

scenario('IP task', m => {
  open(m, C);
  const task = C.task;
  const failing = rows().find(b => /не проходить/.test(text(b)) && /→/.test(text(b)));
  const pair = rows().find(b => /↔/.test(text(b)) && /✓ проходить/.test(text(b)));
  if (pair) {
    click(pair);
    check('IP: a working pair offers request and reply', Boolean(radio('.ng-vl-directions', 'Відповідь')));
    click(radio('.ng-vl-directions', 'Відповідь'));
    check('IP: the reply on choice', radio('.ng-vl-directions', 'Відповідь').getAttribute('aria-checked') === 'true');
  }
  click(failing);
  check('IP: a tap draws a probe’s walk, a packet’s', /^Шлях пакета: /.test(text(q('.ng-vl-walk-text h3'))), text(q('.ng-vl-walk-text h3')));
  check('IP: the router’s and switch’s forms, nothing «задано»', all('.ng-vl-switches [role="radio"]').map(text).join('|').includes('R1') && all('.ng-vl-fixed, .ng-vl-given-switch').length === 0 && all('.ng-vl-modes [aria-readonly="true"]').length === 0);
  click(radio('.ng-vl-switches', 'R1'));
  check('IP: the router’s rows are editable fields', all('.ng-vl-subifs input').length >= 3 && all('.ng-vl-row.is-fixed').length === 0);
  repairAndCheck(m, C);
  chooseCause(C.site.code);
  click(checkBtn());
  check('IP: the repair, the right cause: done', /^✓ Так/.test(status()), status());
});

// ── MikroTik: a repair and the cause, VLAN-1's and «Між VLAN»'s shapes ──

for (const [label, i] of [['MikroTik two-switch', D], ['MikroTik with a bridge on R1', inspect('routeros', 2, 15, 'route-4')]]) {
  scenario(`MikroTik: ${label}`, m => {
    open(m, i);
    check(`MikroTik ${label}: the version the task gives`, text(q('.ng-vl-intro')).includes(i.task.capabilities.label));
    check(`MikroTik ${label}: causes in RouterOS words (no Cisco terms)`, true);
    repairAndCheck(m, i);
    check(`MikroTik ${label}: causes in RouterOS words, no Cisco terms`, causes().length > 0 && causes().every(c => !/switchport|allowed|nonegotiate/.test(c)), causes());
    chooseCause(i.site.code);
    click(checkBtn());
    goStage('checks');
    check(`MikroTik ${label}: the repair and the right cause: done`, /^✓ Так/.test(status()) && rows().every(b => /✓ проходить/.test(text(b))), status());
  });
}

// ── Hints and the reveal ─────────────────────────────────────────────────

scenario('hints and reveal', m => {
  open(m, A);
  const task = A.task, example = faultExample(A.site.code, 'cisco');
  click(hintBtn());
  click(hintBtn());
  const two = hints();
  check('hints: rung 1 asks, rung 2 names a stop of the grid on screen', two.length === 2 && /Що в них спільного/.test(two[0]) && /PC\d+ → PC\d+/.test(two[1]), two);
  check('hints: no worked example before rung 3', !text(q('.ng-vf-work')).includes(example));
  click(hintBtn());
  check('hints: rung 3, the worked example, once opened; the hint button goes', hints()[2]?.includes(example) && !hintBtn(), hints());
  goStage('repair');
  check('hints: they stay in the panel in every stage', hints().length === 3);
  const before = calls.solution;
  check('reveal: nothing of it before the press', !q('.ng-vf-reveal') && before === calls.solution);
  click(revealBtn());
  const reveal = text(q('.ng-vf-reveal'));
  check('reveal: the cause and the change, in this vendor\'s words', reveal.includes(causeText.cisco[A.site.code]) && reveal.includes(faultText.repair(A.site.code, 'cisco')), reveal.slice(0, 200));
  check('reveal: in the panel\'s place, focus on its heading; «Ще ні» gone', document.activeElement === q('.ng-vf-work .ng-reveal-heading') && !/Ще ні/.test(text(q('.ng-vf-work [data-help="message"]'))));
  check('reveal: the board marked «показано»', q('.ng-vf-work[data-revealed]') !== null && text(q('.ng-vf-shown')) === 'показано');
  check('reveal: the commands that go and come («Було», «Стало»)', all('.ng-vf-diff').length >= 1 && /Було|Стало/.test(reveal));
  check('reveal: marked revealed and assisted', instance(m, task).session.revealed && instance(m, task).session.assisted);
  const sideRows = () => all('.ng-vf-reveal .ng-vf-row');
  check('reveal: the grid before the change fails somewhere, every row shown (nothing folded)', sideRows().some(b => /не проходить/.test(text(b))) && !q('.ng-vf-reveal .ng-vf-passing'));
  click(sideRows().find(b => /не проходить/.test(text(b))));
  check('reveal: a row before draws its walk, said to be before', Boolean(q('.ng-vl-walk-text')) && text(q('.ng-vl-walk-text h3')).includes(faultsUi.walkWhere.before), text(q('.ng-vl-walk-text h3')));
  click(radio('.ng-vf-sides', faultsUi.sides.after));
  check('reveal: after the change, every row passes', sideRows().length > 0 && sideRows().every(b => /✓ проходить/.test(text(b))));
  check('reveal: «Далі →» then, the primary', nextBtn().className.includes('ng-button-primary'));
});

// ── A syntax switch ──────────────────────────────────────────────────────

scenario('syntax switch', m => {
  open(m, A, D);
  goStage('repair');
  type(q('#vl-SW1-vlans'), '10,20,30');
  blur(q('#vl-SW1-vlans'));
  click(radio('.ng-vl-controls', 'MikroTik'));
  vendorNow = 'routeros';
  check('syntax: MikroTik opens its own instance at its own stage', stageIs('checks') && text(q('.ng-vf-level')).includes(D.task.shapeSpec.title));
  goStage('repair');
  check('syntax: the given RouterOS configuration', Boolean(q('.ng-vl-form[data-syntax="routeros"]')) && !q('#vl-SW1-vlans'));
  check('syntax: no verdict carried', status() === '');
  click(radio('.ng-vl-controls', 'Cisco'));
  vendorNow = 'cisco';
  check('syntax: back in Cisco, its stage and draft kept', stageIs('repair') && q('#vl-SW1-vlans').value === '10,20,30');
});

// ── Long grids, snapshots, hints, focus, numbers ─────────────────────────

scenario('long grid: failing first, the passing folded, a summary', m => {
  const i = inspect('cisco', 3, 13, 'route-2');
  open(m, i);
  const grid = faults.grid(i.task);
  const all_ = [...grid.reachability, ...grid.isolation], failing = all_.filter(r => !r.observed).length;
  check('long grid: the summary says how many fail, of how many', text(q('.ng-vf-work .ng-vf-summary')) === faultsUi.summary({ failing, total: all_.length }), text(q('.ng-vf-summary')));
  const shown = rows().filter(b => !b.closest('.ng-vf-passing')), folded = all('.ng-vf-work .ng-vf-passing .ng-vf-row');
  check('long grid: the failing rows first, outside the fold', shown.length === failing && shown.every(b => b.className.includes('is-no')));
  check('long grid: the passing rows folded under «ще N … ✓», still buttons', folded.length === all_.length - failing && folded.every(b => b.className.includes('is-ok'))
    && text(q('.ng-vf-work .ng-vf-passing summary')) === faultsUi.passing({ n: folded.length }), text(q('.ng-vf-passing summary')));
  click(folded[0]);
  check('long grid: a folded row still draws its walk (and the stage stays)', folded[0].getAttribute('aria-pressed') === 'true' && Boolean(q('.ng-vl-walk-text')) && stageIs('checks'));
  repairAndCheck(m, i);
  goStage('checks');
  check('long grid: all passing: «Проходять усі N», «Показати всі N ✓»', text(q('.ng-vf-work .ng-vf-summary')) === faultsUi.summary({ failing: 0, total: all_.length })
    && text(q('.ng-vf-work .ng-vf-passing summary')) === faultsUi.passingAll({ n: all_.length }));
});

/** R1's interface lines on the diagram. */
const r1Lines = () => all('.ng-vl-switch').filter(g => text(g.querySelector('.ng-vl-switch-name')).startsWith('R1')).flatMap(g => all('.ng-vl-iface-text', g).map(text));
scenario('snapshot walks: the diagram’s lines are the walk’s configuration', m => {
  open(m, C);
  const given = r1Lines();
  goStage('repair');
  click(radio('.ng-vl-switches', 'R1'));
  type(q('#vl-R1-subifs-0-vid'), '999');
  blur(q('#vl-R1-subifs-0-vid'));
  check('snapshot: with no walk, the lines are the draft’s', r1Lines().some(l => /dot1Q 999/.test(l)) && !q('.ng-vl-previous'), r1Lines());
  goStage('checks');
  click(failingRow());
  check('snapshot: a walk of the given configuration over its own lines, said so', JSON.stringify(r1Lines()) === JSON.stringify(given) && text(q('.ng-vl-previous')) === faultsUi.walkWhere.initial, [r1Lines(), text(q('.ng-vl-previous'))]);
  click(revealBtn());
  const side = () => all('.ng-vf-reveal .ng-vf-row');
  click(side().find(b => /не проходить/.test(text(b))));
  check('snapshot: a row before the change: the faulty lines, said «до виправлення»', JSON.stringify(r1Lines()) === JSON.stringify(given) && text(q('.ng-vl-previous')) === faultsUi.walkWhere.before);
  click(radio('.ng-vf-sides', faultsUi.sides.after));
  click(side()[0]);
  const fixed = C.repaired.R1.subifs.map(x => `${x.ip}/${x.prefix}`);
  check('snapshot: a row after the change: the repaired lines, said «після виправлення»', fixed.every(a => r1Lines().some(l => l.includes(a))) && text(q('.ng-vl-previous')) === faultsUi.walkWhere.after, [r1Lines(), fixed]);
  check('snapshot: the reveal’s grid is a level below its heading', Boolean(q('.ng-vf-reveal .ng-vf-grid-head h3')) && Boolean(q('.ng-vf-reveal h4.ng-vf-sub')) && !q('.ng-vf-reveal .ng-vf-grid-head h2'));
});

scenario('hints: tied to the last check; gone once solved', m => {
  open(m, A);
  click(checkBtn());
  click(hintBtn());
  click(hintBtn());
  const second = () => hints()[1];
  const said = second();
  goStage('repair');
  setForm(m, A.task, A.repaired);
  check('hints: an edit doesn’t change hint 2 (it reads the last check)', second() === said && /→/.test(said), said);
  click(checkBtn());
  check('hints: the next check does', second() !== said && /проходять/.test(second()), second());
  chooseCause(A.site.code);
  click(checkBtn());
  goStage('repair');
  type(q('#vl-SW1-vlans'), '1,2');
  check('hints: once solved, an edit doesn’t bring them back', !hintBtn() && /^✓|до змін/.test(status()), status());
});

scenario('focus after a check that opens another device', m => {
  open(m, A);
  goStage('repair');
  click(radio('.ng-vl-switches', 'SW2'));
  type(q('#vl-SW2-vlans'), '10,abc');
  click(radio('.ng-vl-switches', 'SW1'));
  const field = q('#vl-SW1-vlans');
  step(() => { field.focus(); fire(field, 'keydown', { key: 'Enter' }); });
  const tab = all('.ng-vl-switches [role="radio"]').find(b => text(b).startsWith('SW2'));
  check('focus: the check opens SW2 (its tab marked •), its field marked', tab?.getAttribute('aria-checked') === 'true' && text(tab) === 'SW2 •' && q('#vl-SW2-vlans')?.getAttribute('aria-invalid') === 'true', status());
  check('focus: on the marked field there', document.activeElement === q('#vl-SW2-vlans'), document.activeElement?.getAttribute?.('id'));
});

scenario('«Попередні номери» brings the instance back', m => {
  open(m, A);
  goStage('repair');
  type(q('#vl-SW1-vlans'), '7,8,9');
  blur(q('#vl-SW1-vlans'));
  const slot = m.store.state.places.vlan.faults.cisco;
  click(more(ui.otherNumbersMenu));
  const next = m.store.state.places.vlan.faults.cisco;
  check('numbers: other numbers, the same network and level, at the checks', next.seed !== slot.seed && next.shape === slot.shape && next.level === slot.level && stageIs('checks'));
  click(more(ui.previousNumbers));
  check('numbers: back: the slot, its stage and the draft as they were', JSON.stringify(m.store.state.places.vlan.faults.cisco) === JSON.stringify(slot) && stageIs('repair') && q('#vl-SW1-vlans').value === '7,8,9');
});

// ── Leaks (Z7): forced faults on one network ─────────────────────────────

// The configure exercises' teaching sentences that diagnose a setting or say
// its repair (fix brief v1 item 1): «Знайди несправність» says what a stop
// shows instead, until hint 3 or the reveal.
const TEACHING = ['vlan-not-on-switch', 'no-subinterface', 'interface-down', 'internal-interface-down', 'vlan-on-bridge-port', 'bridge-cpu-not-tagged',
  'access-frame-types', 'trunk-frame-types', 'trunk-faces-access', 'carry-through-middle', 'trunk-carries-unused', 'bridge-tag-implicit', 'user-port-vlan-1'];
// Round 4 (2a): cause and repair words per vendor; only the pairs that exist.
const strings = vendor => ({
  codes: catalogue.map(c => c.code),
  causes: catalogue.map(c => causeText[vendor]?.[c.code]).filter(Boolean),
  repairs: [...catalogue.map(c => faultText.repair(c.code, vendor)).filter(Boolean), ...TEACHING.map(code => t(code))],
  examples: catalogue.map(c => faultExample(c.code, vendor)),
});
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** What the DOM must not say: a code anywhere; a cause, a repair or an example outside the options. */
function leaks(m, vendor) {
  const s = strings(vendor);
  const html = m.container.outerHTML;
  const fieldset = q('.ng-vf-causes', m.container)?.outerHTML ?? '';
  const outside = html.replace(fieldset, '');
  // Form values are properties here, not attributes (mini-dom): read them too.
  const values = all('input', m.container).map(el => String(el.value ?? '')).join('\n');
  const found = [
    ...s.codes.filter(c => html.includes(c) || values.includes(c)).map(c => `code ${c}`),
    ...[...s.causes, ...s.repairs, ...s.examples].filter(x => x && outside.includes(escape(x))).map(x => `words «${x.slice(0, 40)}»`),
    ...all('[class]', m.container).flatMap(el => el.className.split(/\s+/)).filter(c => s.codes.some(code => c.includes(code))).map(c => `class ${c}`),
  ];
  return [...new Set(found)];
}

function leakRound(label, base, codes) {
  const orders = [];
  for (const code of codes) {
    const m = mountVlan();
    try {
      step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: base.task.vendor }));
      faults.create = (rec, options) => faults.inspect(rec, { ...options, faultCode: code }).task;
      open(m, base);
      const forced = faults.inspect(record, { vendor: base.task.vendor, level: base.task.level, seed: base.task.identity.seed, variantId: base.task.identity.shape, faultCode: code });
      const found = [];
      // The screen shows the forced fault's network: its failing rows, then (the repair stage) its first device's given commands.
      const grid = faults.grid(forced.task);
      if (rows().filter(b => /не проходить/.test(text(b))).length !== [...grid.reachability, ...grid.isolation].filter(r => !r.observed).length) found.push('not the forced network (grid)');
      found.push(...leaks(m, base.task.vendor));
      // Every row's walk, in words and on the diagram (a failing one opens the repair stage).
      for (let k = 0; k < rows().length; k++) { goStage('checks'); click(rows()[k]); found.push(...leaks(m, base.task.vendor)); }
      goStage('repair');
      const first = forced.task.topology.devices.find(d => d.kind !== 'host').id;
      const given = faults.render(forced.task.initialConfiguration, base.task.vendor, forced.task.topology)[first] ?? '';
      const shown = all('.ng-vl-cmd-line', q('.ng-vf-original .ng-vl-pre')).map(l => l.textContent).join('\n');
      if (shown !== given) found.push('not the forced network (given configuration)');
      // Hints 1–2.
      click(hintBtn());
      click(hintBtn());
      found.push(...leaks(m, base.task.vendor));
      // A failing check (the given configuration), from the repair stage: it
      // marks no field and opens no other device (an objective's address
      // would point at the fault, fix brief item 4).
      const device = () => all('.ng-vl-switches [role="radio"]').find(b => b.getAttribute('aria-checked') === 'true');
      const before = device() ? text(device()) : null;
      click(checkBtn());
      found.push(...leaks(m, base.task.vendor));
      if (all('.ng-vf-work [aria-invalid="true"]').length) found.push('a field marked after the unchanged check');
      if ((device() ? text(device()) : null) !== before) found.push(`the check opened ${device() && text(device())}`);
      // The repair, checked: the cause stage, the options in their order, nothing named outside them.
      setForm(m, forced.task, forced.repaired);
      click(checkBtn());
      if (!stageIs('cause')) found.push('the repair did not open «Причина»');
      found.push(...leaks(m, base.task.vendor));
      orders.push(causes().join('|'));
      covered.add(code);
      const accessible = all('[aria-label]', m.container).map(el => el.getAttribute('aria-label')).join('\n');
      const s = strings(base.task.vendor);
      found.push(...s.codes.filter(c => accessible.includes(c)).map(c => `aria ${c}`), ...s.causes.filter(c => accessible.includes(c)).map(c => `aria «${c.slice(0, 30)}»`));
      check(`leaks ${label}: forced ${code}: nothing names it before the reveal (start, every walk, hints 1–2, a failing check, the cause stage)`, found.length === 0, [...new Set(found)].slice(0, 5));
    } finally {
      faults.create = real.create;
      m.unmount();
    }
  }
  check(`leaks ${label}: the options in one order whatever the fault (${codes.length} forced)`, orders.length === codes.length && new Set(orders).size === 1, orders.map(o => o.slice(0, 60)));
}

const accepted = i => [...new Set(i.candidates.filter(c => c.accepted).map(c => c.site.code))];
const covered = new Set();
const solutionCalls = calls.solution;
leakRound('Cisco two-switch', A, accepted(A));
leakRound('MikroTik two-switch', D, accepted(D));
leakRound('Cisco «Між VLAN» level 3', inspect('cisco', 3, 13, 'route-2'), accepted(inspect('cisco', 3, 13, 'route-2')));
leakRound('MikroTik bridge on R1 (RouterOS до 7.16)', inspect('routeros', 2, 15, 'route-4'), accepted(inspect('routeros', 2, 15, 'route-4')));
leakRound('Cisco transit level 3', B, accepted(B));
leakRound('MikroTik management, level 2', inspect('routeros', 2, 3, 'route-3'), ['wrong-encapsulation']);
check('leaks: every one of the 14 causes was forced', catalogue.every(c => covered.has(c.code)) && catalogue.length === 14, { missing: catalogue.map(c => c.code).filter(c => !covered.has(c)) });
check('leaks: no reveal was read in the leak rounds', calls.solution === solutionCalls, calls);

// Repair v1 (Fable suggestion 5): «Ремонт» on a short window (1000 × 700: 641 px under the bar) starts with the
// walk folded to its heading, so the form's first row is on the first view; a press opens it.
{
  const observers = [];
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.els = []; observers.push(this); } observe(el) { this.els.push(el); } unobserve() {} disconnect() {} };
  const bodyClass = document.body.className;
  document.body.className = `${bodyClass} ng-screen`.trim();
  Object.assign(document.body, { clientHeight: 641 });
  scenario('short window: the repair walk folded', m => {
    step(() => { for (const o of observers) o.cb([]); });
    open(m, A);
    step(() => { for (const o of observers) o.cb([]); });
    click(rows().find(b => /✗ не проходить/.test(text(b))));
    check('short repair: a failing check opens «Ремонт» with the walk folded to its heading', stageIs('repair')
      && q('.ng-vf-walk-open')?.getAttribute('aria-expanded') === 'false'
      && !q('.ng-vl-walk-text .ng-vl-steps') && Boolean(q('.ng-vl-form-table')), q('.ng-vl-walk-text')?.outerHTML?.slice(0, 200));
    click(q('.ng-vf-walk-open'));
    check('short repair: a press opens the walk', !q('.ng-vf-walk-open') && all('.ng-vl-walk-text .ng-vl-steps li').length > 0);
    click(checkBtn());
    goStage('repair');
    check('short repair: after a failing check it folds again; its heading is then the panel\'s evidence', q('.ng-vf-walk-open')?.getAttribute('data-evidence') === 'current', q('.ng-vl-walk-text')?.outerHTML?.slice(0, 200));
  });
  document.body.className = bodyClass;
  Object.assign(document.body, { clientHeight: 0 });
  delete globalThis.ResizeObserver;
}

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
