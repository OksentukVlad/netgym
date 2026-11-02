// Mounted lifecycle scenarios for the routing screen's success lap and its
// check view (polish repair round 1): the real RoutingScreen in the app
// store, mounted with react-dom/client in tests/helpers/mini-dom.mjs, with
// node:test's mocked setTimeout. Run in its own process by
// tests/routing-mounted.test.mjs, so this DOM never reaches the main test
// process. Prints one JSON line: { results: [{ name, ok, detail }] }.
//
// Pointer and key presses skip a lap before anything else happens, so the
// cancellation scenarios also use the paths without them: a click alone (as
// assistive technology or element.click() sends it), a navigation through
// the store (as the browser's back button does) and unmounting.
//
// Section 9 mounts the screen with RF-1's record (`faultsBank`) for «Знайди
// несправність»: the entry, each check outcome, the cause question, paths on
// demand, hints, the reveal, a syntax switch and leaks with each witnessed
// cause forced by its seed.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';

// Focus moves fire focusout/focusin: a tip's outline goes on focusout (OPT-1 UI).
const { document, fire, setReducedMotion } = installDom({ focusEvents: true });
mock.timers.enable({ apis: ['setTimeout'] });
// The timers still pending: a cancelled lap leaves none behind.
const pending = new Set();
const mockedSet = globalThis.setTimeout, mockedClear = globalThis.clearTimeout;
globalThis.setTimeout = (fn, ms, ...args) => { const handle = mockedSet(() => { pending.delete(handle); fn(...args); }, ms); pending.add(handle); return handle; };
globalThis.clearTimeout = handle => { pending.delete(handle); mockedClear(handle); };
// Frames and idle callbacks (the post-success review's, OPT-1 UI U1) run on
// the same mocked clock, counted apart from the lap's timers: a review may
// outlive a navigation, by design. `idle.calls` counts idle callbacks asked
// for; a review step runs only inside one.
const idle = { pending: new Set(), calls: 0 };
const later = (fn, ms) => { const handle = mockedSet(() => { idle.pending.delete(handle); fn(); }, ms); idle.pending.add(handle); return handle; };
const drop = handle => { idle.pending.delete(handle); mockedClear(handle); };
Object.assign(window, {
  requestAnimationFrame: fn => later(() => fn(Date.now()), 16), cancelAnimationFrame: drop,
  requestIdleCallback: fn => { idle.calls++; return later(() => fn({ didTimeout: false, timeRemaining: () => 0 }), 1); }, cancelIdleCallback: drop,
});
const copied = [];
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied.push(text); } } });
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const { act, mountRouting, routing, routingBank, syntaxes } = await import('../../.test-bundles/harness/mounted.mjs');
const { tasks } = routingBank;
// Round 4 (spec R1): the check is the help panel's «Перевірити» under the rows;
// what it says is the panel's verdict (badge «✓ Так» or «• Ще ні», then the sentence).
const SUCCESS = 'Мережа працює: усі пінги проходять в обидва боки.';
const FAILOVER = 'Якщо лінк до ISP1 недоступний — резерв спрацював.';
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

// What role="status" has said: each settled message is a new element (Feedback re-keys it per check).
const said = [], seen = new Set();
function listen() {
  // The panel's status holds its current item's words (a verdict's summary, a hint, the reveal); without a check, nothing.
  const words = document.querySelector('[role="status"]')?.querySelector('p, h2');
  if (words && !words.className.includes('is-clearing') && !seen.has(words)) {
    seen.add(words);
    said.push(words.textContent.replace(/^(?:✓ Так|• Ще ні) /, '').replace(/ · до змін$/, ''));
  }
}
/** The network check: the panel's «Перевірити». */
const checkNet = () => q('.ng-rt-help .ng-help-check');
/** What the last check says on screen: the panel's verdict sentence (its badge left out). */
const stripText = () => (q('.ng-rt-help .ng-help-summary, .ng-rt-help .ng-help-mini')?.textContent ?? '').replace(/^(?:✓ Так|• Ще ні) /, '').replace(/ · до змін$/, '');
const step = fn => { act(fn); listen(); };
const q = selector => document.querySelector(selector);
const all = selector => document.querySelectorAll(selector);
/** A pointer click: pointerdown (which skips a lap under way), focus, click. */
const click = el => { step(() => { fire(el, 'pointerdown'); }); step(() => { fire(el, 'mousedown'); el.focus(); }); step(() => { fire(el, 'click'); }); };
/** A click alone, with no pointer or key press before it. */
const clickOnly = el => step(() => { fire(el, 'click'); });
const type = (el, value) => step(() => { el.value = value; fire(el, 'input'); });
const tick = ms => { for (let t = 0; t < ms; t += 50) step(() => { mock.timers.tick(Math.min(50, ms - t)); }); };
const lap = () => q('.ng-rt')?.getAttribute('data-lap') ?? null;
const lapLayers = () => all('.ng-lap').length + all('.ng-lap-over').length;
// Round 4: the heading is the task's title only; its variant and code are on it as data (the list and «⋯» show them).
const title = () => { const h = q('.ng-rt-title'); if (!h) return ''; const code = h.getAttribute('data-code'); return `#${h.getAttribute('data-variant')}${code ? ` · ${code}` : ''} — ${h.textContent}`; };
const nextTask = () => q('button[aria-label="Наступна задача"]');
const prevTask = () => q('button[aria-label="Попередня задача"]');
const variantButton = code => q('[aria-label="Варіант"]').querySelectorAll('[role="radio"]').find(b => b.textContent.startsWith(`${code} ·`));
/** The lap's two layers as markup; the arrowheads' ids come from useId, which differs per mount. */
const lapMarkup = () => [...all('.ng-lap'), ...all('.ng-lap-over')].map(g => g.outerHTML).join('\n').replace(/url\(#[^)]*-(req|rep)\)/g, 'url(#$1)');
const state = () => ({ lap: lap(), layers: lapLayers(), pending: pending.size, title: title() });

/** Show task n (variant id) as the task list does, through the store. */
function open(m, n, variantId) {
  const record = tasks[n - 1];
  step(() => m.store.dispatch({ type: 'place', scope: 'routing', patch: { taskId: record.id, router: null, variants: { ...m.store.state.places.routing?.variants, ...(variantId ? { [record.id]: variantId } : {}) } } }));
}
/** Select a router (its button toggles, so only when it isn't selected). A one-router task (task 15) has no
 * router row (round 5 5b-2): its router is always selected, and asking for another one fails. */
function selectRouter(router) {
  const button = all('.ng-rt-router').find(b => b.textContent.trim() === router);
  if (!button && !q('.ng-rt-routers') && q('.ng-rt-work .ng-rt-card .ng-rt-caption')?.textContent.endsWith(`— ${router}`)) return;
  if (button.getAttribute('aria-pressed') !== 'true') click(button);
}
/** Tick (or untick) a MikroTik row's blackhole box, as a click does. */
const tickBox = (box, on) => step(() => { box.checked = on; fire(box, 'click'); });
/** Type values into a row's fields (`prefix`: its id prefix); `blackhole` ticks the box. */
function typeRow(prefix, values) {
  for (const [name, value] of Object.entries(values)) {
    const input = q(`#${prefix}-${name}`);
    if (!input) continue;
    if (name === 'blackhole') { if (input.checked !== (value === true)) tickBox(input, value === true); }
    else if (!input.hasAttribute('disabled')) type(input, value);
  }
}
/** Type the reference into the guided rows of every router, as a student would (Cisco by default). */
function fill(n, variantId, syntaxId = 'cisco') {
  const record = tasks[n - 1];
  fillTask(routing.create(record, { variantId: variantId ?? record.variants[0].id }), syntaxId);
}
/** The same for a given instance (step 9: its own addresses). */
function fillTask(task, syntaxId = 'cisco') {
  for (const [router, routes] of Object.entries(routing.solution(task))) {
    selectRouter(router);
    routes.forEach((route, i) => typeRow(`rt-${router}-${i}`, syntaxes[syntaxId].fromRoute(route, task.variant.scaffold[router][i]?.needDist ?? false)));
  }
}
function scenario(name, fn, { reducedMotion = false, bank, height } = {}) {
  setReducedMotion(reducedMotion);
  // `height`: the window's inner height while mounted (round 5: a short window folds the legend).
  const tall = window.innerHeight;
  if (height) window.innerHeight = height;
  const m = mountRouting({ bank });
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
  window.innerHeight = tall;
  setReducedMotion(false);
  check(`${name}: unmounting leaves no timer behind`, pending.size === 0 && idle.pending.size === 0, { pending: pending.size, frames: idle.pending.size });
}

// ── 1. A → B → A: the lap belongs to the check, not to the task ──
scenario('A → B → A after the lap', m => {
  fill(1);
  click(checkNet());
  check('A → B → A after the lap: a passing check plays the lap', lap() === 'playing', state());
  tick(3000);
  check('A → B → A after the lap: it ends', lap() === 'done', state());
  click(nextTask());
  check('A → B → A after the lap: B shows no lap', title().startsWith('#2 ') && lap() === null && lapLayers() === 0, state());
  click(prevTask());
  check('A → B → A after the lap: back on A, the lap doesn’t play again', title().startsWith('#1 ') && lap() === null && lapLayers() === 0 && pending.size === 0, state());
  check('A → B → A after the lap: «Показати ще раз» is still offered', Boolean(q('.ng-rt-replay')));
  tick(6000);
  check('A → B → A after the lap: nothing starts later', lap() === null && lapLayers() === 0, state());
  clickOnly(q('.ng-rt-replay'));
  check('A → B → A after the lap: «Показати ще раз» plays it', lap() === 'playing', state());
});

scenario('A → B → A during the lap (navigation without a press)', m => {
  fill(1);
  click(checkNet());
  tick(500);
  check('A → B → A during the lap: playing', lap() === 'playing', state());
  open(m, 2);
  check('A → B → A during the lap: navigating cancels it (no timer left)', title().startsWith('#2 ') && lap() === null && pending.size === 0, state());
  open(m, 1);
  check('A → B → A during the lap: back on A, no lap', lap() === null && lapLayers() === 0 && pending.size === 0, state());
  tick(6000);
  check('A → B → A during the lap: nothing later', lap() === null && lapLayers() === 0, state());
});

scenario('A → B → A by variant (3b → 3 → 3b)', m => {
  open(m, 3, 'defaults');
  fill(3, 'defaults');
  click(checkNet());
  check('variant A → B → A: 3b passes and plays', title().startsWith('#3b ') && lap() === 'playing', state());
  tick(5000);
  click(variantButton('3'));
  check('variant A → B → A: variant 3 shows no lap', title().startsWith('#3 ') && lap() === null && lapLayers() === 0, state());
  click(variantButton('3b'));
  check('variant A → B → A: back on 3b, the lap doesn’t play again', title().startsWith('#3b ') && lap() === null && lapLayers() === 0 && pending.size === 0, state());
  check('variant A → B → A: «Показати ще раз» is still offered', Boolean(q('.ng-rt-replay')));
  tick(6000);
  check('variant A → B → A: nothing later', lap() === null, state());
});

// ── 2. One announcement per check ──
scenario('one announcement per check', m => {
  open(m, 15);
  fill(15);
  const before = said.length;
  click(checkNet());
  tick(6000);
  const first = said.slice(before);
  check('announcements: one check, one announcement (with the ending’s words), through the whole lap', first.length === 1 && first[0] === `${SUCCESS} ${FAILOVER}`, first);
  clickOnly(q('.ng-rt-replay'));
  tick(6000);
  check('announcements: a replay says nothing new', said.length - before === 1, said.slice(before));
  click(checkNet());
  tick(6000);
  check('announcements: a second check, one more', said.length - before === 2 && said.at(-1) === `${SUCCESS} ${FAILOVER}`, said.slice(before));
});

// ── 3. Cancellation on a new check and on navigation ──
scenario('a new check cancels the lap under way', m => {
  open(m, 15);
  fill(15);
  clickOnly(checkNet());
  const timers = pending.size;
  tick(1000);
  check('new check: the first lap is still playing at 1 s', lap() === 'playing' && pending.size < timers, state());
  clickOnly(checkNet());
  check('new check: the old lap’s timers are gone; only the new lap’s (and the announcement’s) are left', pending.size === timers, { before: timers, now: pending.size });
  tick(4700);
  check('new check: the new lap runs its full 4.8 s from the new check', lap() === 'playing', state());
  tick(200);
  check('new check: then it ends', lap() === 'done' && pending.size === 0, state());
});

scenario('navigation and unmounting cancel the lap', m => {
  open(m, 15);
  fill(15);
  clickOnly(checkNet());
  tick(1000);
  open(m, 16);
  check('navigation: no lap timer left on the next task', title().startsWith('#16 ') && lap() === null && pending.size === 0, state());
  open(m, 15);
  clickOnly(q('.ng-rt-replay'));
  tick(500);
  check('unmounting mid-lap: the lap is playing before it', lap() === 'playing' && pending.size > 0, state());
});

// ── 3b. Round 4 (spec R1): one check under the rows, a router always selected, «⋯», the legend ──
scenario('round 4: the task screen', m => {
  const pick = label => { const more = q('.ng-rt-more .ng-more-button'); if (more.getAttribute('aria-expanded') !== 'true') click(more); click(all('.ng-more-item').find(b => b.textContent.startsWith(label))); };
  const pressed = () => all('.ng-rt-router').find(b => b.getAttribute('aria-pressed') === 'true')?.textContent.trim();
  check('R1: the first router is selected from the start; no «pick a router» line', pressed() === 'R1' && q('.ng-rt-rows .ng-rt-caption')?.textContent === 'МАРШРУТИ — R1' && !document.body.textContent.includes('Вибери роутер'));
  check('R1: one check, the panel\'s «Перевірити», under the rows; no per-row check', all('.ng-help-check').length === 1 && checkNet().textContent === 'Перевірити'
    && !all('button').some(b => (b.getAttribute('aria-label') ?? '').startsWith('Перевірити:')));
  check('R1: the modes are named by the pre-named rows', all('.ng-rt-modes [role="radio"]').map(b => b.textContent).join('|') === 'Із готовими рядками|Без готових рядків');
  check('R1: the heading is the task\'s title only', q('.ng-rt-title').textContent === 'Два роутери, дві LAN');
  check('R1: the legend is an Aside, open on the first visit', q('.ng-rt-legend .ng-aside-body')?.textContent.includes('адреса мережі') && q('.ng-rt-legend .ng-aside-q')?.getAttribute('aria-expanded') === 'true');
  check('R1: the field labels say what goes in', ['Мережа', 'Маска', 'Адреса сусіда (next-hop)'].every(l => all('label').some(x => x.textContent === l))
    && q('#rt-R1-0-net').getAttribute('placeholder') === 'адреса мережі');
  // Only R1's route: the reply fails at R2, so the check selects R2 and marks what it is about there.
  typeRow('rt-R1-0', { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2' });
  click(checkNet());
  check('R1: a failure on another router selects it', pressed() === 'R2' && q('.ng-rt-rows .ng-rt-caption').textContent === 'МАРШРУТИ — R2');
  check('R1: … and its row is what the verdict is about (data-evidence, one element)', all('[data-evidence="current"]').length === 1 && Boolean(q('.ng-rt-rows [data-evidence="current"]')));
  check('R1: the verdict names one thing, in the panel', q('.ng-rt-help [data-help-current]')?.getAttribute('data-help-tone') === 'no' && stripText().length > 0, stripText());
  check('R1: the legend folds after the first check, its title beside «?»', !q('.ng-rt-legend .ng-aside-body') && q('.ng-rt-legend .ng-aside-label')?.textContent === 'Як читати схему');
  check('R1: no «Далі →» before the task is done (◀ ▶ and the list move between tasks)', !q('.ng-rt-help .ng-help-next'));
  check('R1: the exercise switch and «⋯» end the task bar; an address row with nothing to say takes no room', q('.ng-rt-taskbar .ng-rt-bar-end .ng-rt-more') !== null
    && q('.ng-rt-addr')?.className.includes('is-empty'));
  // «⋯»: the rules and every check open in the work area.
  pick('Правила');
  check('«⋯» Правила: opens in the work area, under the panel, focus on its heading', q('.ng-rt-disclosures .ng-more-panel')?.getAttribute('aria-label') === 'Правила'
    && document.activeElement === q('.ng-more-panel-heading') && q('.ng-rt-disclosures').textContent.includes('Підключені напряму'));
  pick('Усі перевірки');
  const lines = all('.ng-rt-disclosures .ng-rt-checkline-body');
  check('«⋯» Усі перевірки: every check, pickable after a check', lines.length > 0 && q('.ng-rt-disclosures .ng-more-panel')?.getAttribute('aria-label') === 'Усі перевірки');
  const passing = all('.ng-rt-disclosures .ng-rt-checkline.is-pass button')[0] ?? lines[0];
  click(passing);
  check('«⋯» Усі перевірки: picking a line draws it and keeps the list open', passing.getAttribute('aria-pressed') === 'true' && Boolean(q('.ng-rt-disclosures .ng-more-panel')));
  // Both routes: success; the success box holds the other syntax\'s link (vendor-aware).
  selectRouter('R2');
  typeRow('rt-R2-0', { net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.1' });
  click(checkNet());
  tick(3000);
  check('R1: success: one success box, «Далі →» primary, «Показати мовою MikroTik» a quiet link in it', q('.ng-rt-help [data-help-tone="ok"]') && q('.ng-rt-help .ng-help-next')?.className.includes('primary')
    && q('.ng-rt-help .ng-rt-other-toggle')?.textContent.startsWith('Показати мовою MikroTik') && q('.ng-rt-help .ng-rt-other-toggle').className.includes('ng-rt-link'));
  check('R1: a passing check is about the whole network: nothing on the board is marked', all('[data-evidence="current"]').length === 0);
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' }));
  check('R1: on MikroTik the link says Cisco', q('.ng-rt-help .ng-rt-other-toggle')?.textContent.startsWith('Показати мовою Cisco'));
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' }));
  click(q('.ng-rt-help .ng-help-next'));
  check('R1: «Далі» opens the next task, focus on its first field', title().startsWith('#2 ') && document.activeElement === q('.ng-rt-rows input'), document.activeElement?.getAttribute?.('id'));
  open(m, 15);
  // Round 5 5b-2 (spec C): the failure case is part of the rest of the condition, under «Уся умова».
  check('task 15: the simulated failure is not on the first view', !q('.ng-rt-failover'));
  click(q('.ng-rt-details'));
  check('task 15: «Уся умова» says the simulated failure, beside the task', q('.ng-rt-full .ng-rt-failover')?.textContent.includes('Якщо лінк до ISP1 недоступний'));
  check('task 15: both ISP gateways on the diagram', all('.ng-dg-ep-ip').map(t => t.textContent).filter(t => t.startsWith('шлюз ')).length === 2, all('.ng-dg-ep-ip').map(t => t.textContent));
  // Round 5 5b-2 (spec C): an example per row, the main route's smaller, the backup's larger.
  check('task 15: the distance fields\' placeholders are examples, primary smaller and backup larger', q('#rt-R1-0-dist')?.getAttribute('placeholder') === 'менша, напр. 1'
    && q('#rt-R1-1-dist')?.getAttribute('placeholder') === 'більша, напр. 5');
});

// ── 4. Reduced motion renders the animated end state ──
for (const [n, variantId] of [[1], [15], [3, 'defaults'], [16]]) {
  const label = `task ${n}${variantId ? ` ${variantId}` : ''}`;
  const run = reduced => {
    setReducedMotion(reduced);
    const m = mountRouting();
    open(m, n, variantId);
    fill(n, variantId);
    click(checkNet());
    const immediate = lap();
    if (!reduced) tick(7000);
    const out = { immediate, end: lap(), markup: lapMarkup(), strip: stripText(), envelopes: all('.ng-path-envelope').length };
    m.unmount();
    return out;
  };
  const reduced = run(true), animated = run(false);
  setReducedMotion(false);
  check(`reduced motion, ${label}: the end state at once`, reduced.immediate === 'done' && reduced.envelopes === 0 && reduced.markup.length > 0, { immediate: reduced.immediate });
  check(`reduced motion, ${label}: the same drawing and strip as the animated lap’s last frame`, reduced.markup === animated.markup && reduced.strip === animated.strip && animated.end === 'done',
    reduced.markup === animated.markup ? { strip: [reduced.strip, animated.strip] } : (() => { let i = 0; while (reduced.markup[i] === animated.markup[i]) i++; return { at: i, reduced: reduced.markup.slice(i - 200, i + 200), animated: animated.markup.slice(i - 200, i + 200) }; })());
}

// ── 5. A picked demonstration in «Текстом» (step 6 wording) ──
scenario('a picked demonstration in «Текстом»', m => {
  open(m, 3, 'defaults');
  fill(3, 'defaults');
  click(checkNet());
  tick(5000);
  click(q('.ng-rt-demo-show'));
  click(q('button[aria-controls="ng-rt-text"]'));
  const items = q('#ng-rt-text').querySelectorAll('li').map(li => li.textContent);
  const demo = 'R2 не знає, куди слати пакет до невідомої адреси, і відкидає його — так і має бути.';
  check('«Текстом», picked demonstration: its calm sentence, not a failure', items.includes(demo) && !items.some(t => /невідома мережа|немає маршруту/.test(t)), items.slice(-3));
});

// ── 6. OPT-1 UI: the discard input, the review after a solve, ★, the known table ──
const keyOf = (n, variantId) => routing.create(tasks[n - 1], { variantId: variantId ?? tasks[n - 1].variants[0].id, bankId: routingBank.bankId, bankRevision: routingBank.bankRevision }).instanceKey;
const instanceOf = (m, n, variantId) => m.store.state.instances[keyOf(n, variantId)];
const pref = (m, name, value) => step(() => m.store.dispatch({ type: 'pref', name, value }));
const rowHead = (router, index) => q(`#rt-${router}-${index}-gw`)?.closest('.ng-rt-row')?.querySelector('.ng-rt-row-head')?.textContent ?? '';
const tipLinks = () => all('.ng-rt-tip-link').map(b => b.textContent);
// Round 4 (spec A5, calm): no ★, score or «↺» anywhere on the screen.
const noStar = () => !q('.ng-rt-star') && !document.body.textContent.includes('★');
/** «↺» is gone from the screen; its store action (clear-results) still clears instances. */
const clearResults = (m, keys) => step(() => m.store.dispatch({ type: 'instances', keys, action: { type: 'clear-results' } }));
const SEC = 1000;
/** In free mode: add a route on `router` and type it (Cisco fields unless MikroTik's are given). */
function freeAdd(router, values) {
  selectRouter(router);
  click(q('.ng-rt-add'));
  const row = all('.ng-rt-free-row').at(-1);
  const prefix = row.querySelector('input').getAttribute('id').replace(/-[a-z]+$/, '');
  typeRow(prefix, values);
}
const lanB = { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.2' }, lanA = { net: '192.168.1.0', mask: '255.255.255.0', gw: '10.0.0.1' };
/** Task 1 in free mode: R1 → LAN-B (twice if `duplicate`), R2 → LAN-A. */
function freeTask1(m, { duplicate = false } = {}) {
  pref(m, 'mode', 'free');
  freeAdd('R1', lanB);
  if (duplicate) freeAdd('R1', lanB);
  freeAdd('R2', lanA);
}

// ── 3c. Round 5 (spec 5b-1 §1, R1 and R4): this task's own legend, the router's own addresses, the action line ──
scenario('round 5: one address world on the task screen', m => {
  const task = routing.create(tasks[0]);
  const paras = () => all('.ng-rt-legend .ng-aside-body p').map(p => p.textContent);
  check('R5 legend: this task\'s LAN with its router\'s port and the link\'s two ends, each named with its router (Cisco)', JSON.stringify(paras()) === JSON.stringify(['Як читати схему',
    'У рамці мережі — адреса мережі (192.168.1.0/24); біля роутера — його порт і адреса в цій мережі (g0/0 .1 = 192.168.1.1).',
    'На лінку між роутерами — мережа лінку (10.0.0.0/30) й адреси обох кінців (10.0.0.1 — кінець R1, 10.0.0.2 — кінець R2): адреса сусіда — кінець іншого роутера.']), paras());
  const left = q('.ng-rt-left');
  check('R5 legend: the legend and the task head the diagram\'s column (the work column starts under the task bar)', left?.parentNode === q('.ng-rt-cols') && q('.ng-rt-work').parentNode === q('.ng-rt-cols')
    && [q('.ng-rt-desc'), q('.ng-rt-asides'), q('.ng-rt-stage')].every(el => el?.parentNode === left) && q('.ng-rt-legend').parentNode === q('.ng-rt-asides')
    && !q('.ng-rt-details'));  // a tall window: the whole task, no «Уся умова»
  check('R5 addresses: «адреси цього роутера», a link names the router at its other end', q('.ng-rt-card h3')?.textContent === 'АДРЕСИ ЦЬОГО РОУТЕРА — R1'
    && all('.ng-rt-ifaces li').map(li => li.textContent).join('|') === 'g0/0 · LAN-A · 192.168.1.1/24|g0/1 · до R2 · 10.0.0.1/30' && q('.ng-rt-ifaces').getAttribute('data-count') === '2');
  const actionLine = () => q('.ng-rt-work .ng-action-line');
  // Round 5 5b-2 (A): the folded worked example sits between the action line and the routes.
  check('R5 action line: one, under the router\'s addresses, right above the routes (the folded example between)', all('.ng-action-line').length === 1 && actionLine()?.textContent === 'Заповни маршрут #1 і натисни «Перевірити».'
    && actionLine().previousSibling === q('.ng-rt-card') && actionLine().nextSibling === q('[data-worked-example]') && q('[data-worked-example]').nextSibling === q('.ng-rt-rows'));
  check('R5 placeholders: symbols, never an address', ['net', 'mask', 'gw'].map(n => q(`#rt-R1-0-${n}`).getAttribute('placeholder')).join('|') === 'адреса мережі|маска|адреса сусіда');
  pref(m, 'syntax', 'routeros');
  check('R5 legend (MikroTik): the same LAN in its port name', paras()[1] === `У рамці мережі — адреса мережі (192.168.1.0/24); біля роутера — його порт і адреса в цій мережі (${task.network.devices[0].interfaces[0].labels.routeros} .1 = 192.168.1.1).`, paras()[1]);
  // Round 5 5b-2 (spec C): the destination shows the shape of its answer, never an address that could pass.
  check('R5 placeholders (MikroTik): symbols', ['dst', 'gw'].map(n => q(`#rt-R1-0-${n}`).getAttribute('placeholder')).join('|') === 'мережа/префікс, напр. x.x.x.0/24|адреса сусіда');
  // Free mode: a blank row #1 to fill (no «Маршрутів ще немає»), stored only once typed in.
  pref(m, 'syntax', 'cisco');
  pref(m, 'mode', 'free');
  const free = () => all('.ng-rt-rows .ng-rt-free-row');
  check('R5 free mode: a blank row #1 under the action line, without «✕»; nothing stored yet', free().length === 1 && free()[0].querySelector('.ng-rt-row-n')?.textContent === '#1'
    && !free()[0].querySelector('.ng-rt-delete') && actionLine()?.textContent === 'Заповни маршрут #1 і натисни «Перевірити».'
    && !document.body.textContent.includes('Маршрутів ще немає') && !Object.keys(m.store.state.instances).length);
  const first = free()[0].querySelector('input');
  first.focus();
  type(first, '192.168.2.0');
  const answer = Object.values(m.store.state.instances)[0]?.answer?.R1 ?? [];
  check('R5 free mode: typing in it makes it route #1 (its element and focus kept, «✕» now there)', free().length === 1 && answer.length === 1 && free()[0].querySelector('input') === first
    && document.activeElement === first && first.value === '192.168.2.0' && Boolean(free()[0].querySelector('.ng-rt-delete')), answer);
  click(q('.ng-rt-rows .ng-rt-add'));
  check('R5 free mode: «+ ще один маршрут (якщо потрібен)» adds #2 after it', free().length === 2 && free()[1].querySelector('.ng-rt-row-n')?.textContent === '#2');
  click(free()[0].querySelector('.ng-rt-delete'));
  click(free()[0].querySelector('.ng-rt-delete'));
  check('R5 free mode: with every route deleted, the blank row is back', free().length === 1 && !free()[0].querySelector('.ng-rt-delete') && free()[0].querySelector('input').value === '');
});
scenario('round 5: a short window starts with the legend folded', m => {
  check('R5 short window: the legend folded, its «?» and title there; the screen says it is short', !q('.ng-rt-legend .ng-aside-body') && q('.ng-rt-legend .ng-aside-label')?.textContent === 'Як читати схему'
    && q('.ng-rt').hasAttribute('data-short'));
  click(q('.ng-rt-legend .ng-aside-q'));
  check('R5 short window: «?» opens it, and the choice holds', Boolean(q('.ng-rt-legend .ng-aside-body')) && m.store.state.places['routing.tasks']?.asides?.legend === true);
}, { height: 700 });

// ── 3d. Round 5 5b-2 (spec A, C): the worked example, task 15's condition, the one-router diagram ──
const { comprehension: rt5 } = await import('../../src/sections/routing/uk.js');
const { expectWorkedExample } = await import('./worked-example.mjs');
const passes = fn => { try { fn(); return true; } catch (e) { return e.message; } };
const exToggle = () => q('[data-worked-example] .ng-wex-toggle');
const exText = () => (q('[data-worked-example] .ng-wex-card')?.textContent ?? '').replace(/\s+/g, ' ');
const exRows = () => all('[data-worked-example] tbody tr').map(tr => tr.querySelectorAll('td.ng-wex-value').map(td => td.textContent));
scenario('round 5b-2: the worked example opens only by its toggle, closes on navigation, and never touches the answer', m => {
  check('5b-2 example: folded on the first view, right under the action line', passes(() => expectWorkedExample(document.body)) === true
    && q('.ng-rt-work .ng-action-line').nextSibling === q('[data-worked-example]'), passes(() => expectWorkedExample(document.body)));
  const before = JSON.stringify(m.store.state.instances);
  click(exToggle());
  check('5b-2 example (Cisco): opened, one finished route of another network, in the form\'s field names', passes(() => expectWorkedExample(document.body, { open: true, rows: 1 })) === true
    && JSON.stringify(exRows()) === JSON.stringify([['198.51.100.64', '255.255.255.192', '192.0.2.254']])
    && all('[data-worked-example] thead th').map(th => th.textContent).join('|') === 'Мережа|Маска|Адреса сусіда' && exText().includes('LAN-C 198.51.100.64/26'), [exRows(), exText()]);
  check('5b-2 example: opening it writes nothing into the answer or the store, and the rows stay empty', JSON.stringify(m.store.state.instances) === before
    && all('.ng-rt-rows input').every(input => input.value === ''), JSON.stringify(m.store.state.instances).slice(0, 200));
  pref(m, 'syntax', 'routeros');
  check('5b-2 example: a vendor switch closes it', exToggle().getAttribute('aria-expanded') === 'false' && !q('.ng-wex-card'));
  click(exToggle());
  check('5b-2 example (MikroTik): the destination with its prefix, then the gateway', JSON.stringify(exRows()) === JSON.stringify([['198.51.100.64/26', '192.0.2.254']])
    && all('[data-worked-example] thead th').map(th => th.textContent).join('|') === 'Мережа (dst-address)|Шлюз (gateway)', exRows());
  open(m, 2);
  check('5b-2 example: another task closes it', exToggle()?.getAttribute('aria-expanded') === 'false' && !q('.ng-wex-card'));
  open(m, 1);
  check('5b-2 example: back on the first task, it is still closed', exToggle()?.getAttribute('aria-expanded') === 'false');
  pref(m, 'syntax', 'cisco');
  pref(m, 'mode', 'free');
  check('5b-2 example (free mode): there too, under the action line, folded', passes(() => expectWorkedExample(document.body)) === true
    && q('.ng-rt-work .ng-action-line').nextSibling === q('[data-worked-example]'));
  check('5b-2 free mode: the quiet add link reads «+ ще один маршрут (якщо потрібен)»', q('.ng-rt-rows .ng-rt-add')?.textContent === rt5.addRoute && q('.ng-rt-rows .ng-rt-add').className.includes('ng-rt-link'));
});
scenario('round 5b-2: task 15 — two sentences, «Уся умова», two example routes, no router row', m => {
  open(m, 15);
  const task = routing.create(tasks[14]);
  check('5b-2 task 15: its two sentences whole, «Уся умова» closed', q('.ng-rt-desc')?.textContent === task.variant.text && q('.ng-rt-details')?.textContent === rt5.fullCondition
    && q('.ng-rt-details').getAttribute('aria-expanded') === 'false' && q('.ng-rt-full').hasAttribute('hidden'), q('.ng-rt-desc')?.textContent);
  click(q('.ng-rt-details'));
  check('5b-2 task 15: «Уся умова» opens the rest and the failure case, under the two sentences', q('.ng-rt-details').getAttribute('aria-expanded') === 'true' && !q('.ng-rt-full').hasAttribute('hidden')
    && q('.ng-rt-full').textContent.includes(task.variant.details.cisco) && Boolean(q('.ng-rt-full .ng-rt-failover')) && q('.ng-rt-details').textContent === 'Згорнути умову');
  pref(m, 'syntax', 'routeros');
  check('5b-2 task 15: in MikroTik, its own rest', q('.ng-rt-full').textContent.includes(task.variant.details.routeros));
  click(q('.ng-rt-details'));
  check('5b-2 task 15: and closed again', q('.ng-rt-full').hasAttribute('hidden') && !q('.ng-rt-full').textContent);
  check('5b-2 task 15: distance placeholders per row', q('#rt-R1-0-dist')?.getAttribute('placeholder') === rt5.distancePrimaryPlaceholder && q('#rt-R1-1-dist')?.getAttribute('placeholder') === rt5.distanceBackupPlaceholder);
  click(exToggle());
  check('5b-2 task 15 example: the main and the backup default route, the backup with the larger distance', passes(() => expectWorkedExample(document.body, { open: true, rows: 2 })) === true
    && JSON.stringify(exRows()) === JSON.stringify([['0.0.0.0/0', '192.0.2.1', '1'], ['0.0.0.0/0', '192.0.2.5', '5']]) && exText().includes('ISP2'), exRows());
  check('5b-2 one router: no router row; «Текстом» starts the diagram\'s tool row', !q('.ng-rt-routers') && Boolean(q('.ng-dg-tools .ng-te-button')));
  open(m, 1);
  check('5b-2 two routers: the router row is back, with «Текстом» at its end', all('.ng-rt-routers .ng-rt-router').length === 2 && Boolean(q('.ng-rt-routers .ng-te-button')) && !q('.ng-dg-tools .ng-te-button'));
});

scenario('blackhole checkbox', m => {
  pref(m, 'syntax', 'routeros');
  open(m, 17);
  selectRouter('R-CORE');
  const head = rowHead('R-CORE', 7);
  check('discard row: its own title, without «Маршрут до»', head.includes('Discard для всього сумарного блоку') && !head.includes('Маршрут до'), head);
  const gw = () => q('#rt-R-CORE-7-gw'), box = () => q('#rt-R-CORE-7-blackhole');
  check('blackhole: a real, labelled checkbox in the row', box()?.getAttribute('type') === 'checkbox' && box().closest('label')?.textContent.includes('blackhole (відкидати)'));
  type(gw(), '10.0.0.9');
  tickBox(box(), true);
  check('blackhole ticked: the gateway is cleared, disabled, «—»', gw().value === '' && gw().hasAttribute('disabled') && gw().getAttribute('placeholder') === '—', { value: gw().value, disabled: gw().hasAttribute('disabled') });
  tickBox(box(), false);
  check('blackhole unticked: the gateway is back, still empty', gw().value === '' && !gw().hasAttribute('disabled'));
  tickBox(box(), true);
  type(q('#rt-R-CORE-7-dst'), '172.16.0.0/22');
  pref(m, 'syntax', 'cisco');
  const cisco = ['net', 'mask', 'gw'].map(n => q(`#rt-R-CORE-7-${n}`).value);
  check('MikroTik blackhole → Cisco Null0', JSON.stringify(cisco) === JSON.stringify(['172.16.0.0', '255.255.252.0', 'Null0']), cisco);
  check('Cisco: the guided discard row has its own placeholder (round 5: a symbol, not Null0), elsewhere the neighbour\'s', q('#rt-R-CORE-7-gw').getAttribute('placeholder') === 'інтерфейс відкидання' && q('#rt-R-CORE-1-gw').getAttribute('placeholder') === 'адреса сусіда');
  type(q('#rt-R-CORE-7-gw'), '10.0.0.1');
  pref(m, 'syntax', 'routeros');
  check('Cisco next hop → MikroTik: the box unticked, the gateway typed', !box().checked && gw().value === '10.0.0.1', { checked: box().checked, gw: gw().value });
  pref(m, 'syntax', 'cisco');
  type(q('#rt-R-CORE-7-gw'), 'Null0');
  pref(m, 'syntax', 'routeros');
  check('Cisco Null0 → MikroTik: the box ticked', box().checked && gw().value === '' && gw().hasAttribute('disabled'));
  open(m, 16);
  open(m, 17);
  selectRouter('R-CORE');
  check('blackhole survives A → B → A', box()?.checked === true);
  check('blackhole: editing is not checking (no attempt)', (instanceOf(m, 17).presses ?? 0) === 0);
  step(() => { fire(box(), 'keydown', { key: 'Enter' }); });
  // Round 4 (spec R1): Enter in any field (the box too) runs the network check: one attempt.
  check('blackhole: Enter in the box runs the network check, as in the fields', (instanceOf(m, 17).session.attempts ?? 0) === 1 && Boolean(q('.ng-rt-help [data-help-current]')),
    instanceOf(m, 17).session);
});

// Polish-2 P2: the box only where discard routes are taught, always when
// ticked; unticking one the row doesn't offer moves focus to its gateway (V6).
/** Space on a checkbox, as the keyboard does: keydown (not prevented), then the browser's click. */
function spaceOn(box) {
  let down;
  step(() => { down = fire(box, 'keydown', { key: ' ' }); });
  if (!down.defaultPrevented) tickBox(box, !box.checked);
}
const boxIds = () => all('.ng-rt-checkbox').map(b => b.getAttribute('id'));
scenario('blackhole box where discard routes are taught', m => {
  pref(m, 'syntax', 'routeros');
  open(m, 17);
  selectRouter('R-CORE');
  check('P2 guided task 17: the box on the discard row only', JSON.stringify(boxIds()) === '["rt-R-CORE-7-blackhole"]', boxIds());
  const discardBox = () => q('#rt-R-CORE-7-blackhole');
  step(() => { discardBox().focus(); });
  spaceOn(discardBox());
  spaceOn(discardBox());
  check('P2 the discard row offers its box: unticked, it stays, with focus', discardBox()?.checked === false && document.activeElement === discardBox());
  // A Cisco Null0 typed into a non-discard row, then MikroTik: that row's box, ticked.
  pref(m, 'syntax', 'cisco');
  typeRow('rt-R-CORE-1', { net: '172.16.1.0', mask: '255.255.255.0', gw: 'Null0' });
  pref(m, 'syntax', 'routeros');
  const box = () => q('#rt-R-CORE-1-blackhole'), gw = () => q('#rt-R-CORE-1-gw');
  check('P2 Cisco Null0 → MikroTik on a non-discard guided row: its box shows, ticked', box()?.checked === true && gw().hasAttribute('disabled'), boxIds());
  step(() => { box().focus(); });
  spaceOn(box());
  check('V6 guided task 17, keyboard: unticked, the box goes and focus is on the row’s gateway, enabled', !box() && document.activeElement === gw() && !gw().hasAttribute('disabled'),
    { active: document.activeElement?.getAttribute('id'), boxes: boxIds() });
  // Switching modes: in free mode every row of task 17 has one; back in guided, the discard row only.
  pref(m, 'mode', 'free');
  click(q('.ng-rt-add'));
  click(q('.ng-rt-add'));
  const freeRows = () => all('.ng-rt-free-row');
  check('P2 free task 17: a box on every row', freeRows().length === 2 && freeRows().every(r => r.querySelectorAll('.ng-rt-checkbox').length === 1), boxIds());
  pref(m, 'mode', 'guided');
  check('P2 back to guided task 17: the discard row’s box only', boxIds().join() === 'rt-R-CORE-7-blackhole', boxIds());
  // Task 3 (3a, pinned: a syntax switch would otherwise open Cisco's 3b): none,
  // in either mode, until a Cisco Null0 is converted.
  open(m, 3, 'explicit-routes');
  selectRouter('R1');
  check('P2 guided task 3: no box', all('.ng-rt-row').length > 0 && boxIds().length === 0, boxIds());
  pref(m, 'mode', 'free');
  click(q('.ng-rt-add'));
  check('P2 free task 3: no box', freeRows().length === 1 && boxIds().length === 0, boxIds());
  pref(m, 'syntax', 'cisco');
  freeAdd('R1', { net: '10.3.0.0', mask: '255.255.255.0', gw: 'Null0' });
  pref(m, 'syntax', 'routeros');
  const row = () => freeRows().at(-1);
  const freeBox = () => row().querySelector('.ng-rt-checkbox'), freeGw = () => row().querySelector('.ng-rt-f-gw input');
  check('P2 free task 3: a converted Null0 shows its box, ticked; the empty row none', freeBox()?.checked === true && boxIds().length === 1, boxIds());
  step(() => { freeBox().focus(); });
  spaceOn(freeBox());
  check('V6 free task 3, keyboard: unticked, the box goes and focus is on the row’s gateway, enabled', !freeBox() && document.activeElement === freeGw() && !freeGw().hasAttribute('disabled'),
    { active: document.activeElement?.getAttribute('id') });
  pref(m, 'mode', 'guided');
  pref(m, 'syntax', 'cisco');
});

for (const syntaxId of ['routeros', 'cisco']) scenario(`task 17 solved in ${syntaxId}`, m => {
  pref(m, 'syntax', syntaxId);
  open(m, 17);
  fill(17, 'main', syntaxId);
  click(checkNet());
  check(`task 17 in ${syntaxId === 'cisco' ? 'Cisco with Null0' : 'MikroTik with blackhole'}: the network check passes`, stripText().startsWith(SUCCESS), stripText());
  tick(7 * SEC);
  check(`task 17 in ${syntaxId}: the lap’s ending names R-CORE`, stripText().includes('R-CORE відкидає пакет'), stripText());
});

scenario('the review waits for the lap', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  const calls = idle.calls;
  tick(2 * SEC);
  check('review: nothing runs while the lap plays', lap() === 'playing' && idle.calls === calls && !instanceOf(m, 1).view.review, { lap: lap(), calls: idle.calls - calls });
  tick(1500);
  tick(SEC);
  const review = instanceOf(m, 1).view.review;
  check('review: after the lap it runs, and its tip shows under «Що можна покращити…»', lap() === 'done' && review?.tips.length === 1 && review.tips[0].code === 'duplicate-route'
    && q('.ng-rt-improve-head')?.textContent.startsWith('Що можна покращити') && tipLinks()[0]?.startsWith('R1, маршрут №2: '), { review, links: tipLinks() });
  click(q('button[aria-controls="ng-rt-text"]'));
  check('review: late tips are not announced; «Текстом» has them', said.at(-1) === SUCCESS && all('#ng-rt-text li').some(li => li.textContent.startsWith('R1, маршрут №2: ')), said.at(-1));
  click(q('button[aria-controls="ng-rt-text"]'));
  // A skip: the review starts at once after it.
  clickOnly(checkNet());
  check('review: a new check drops the old review at once', !instanceOf(m, 1).view.review);
  tick(300);
  step(() => { fire(q('.ng-rt-desc'), 'keydown', { key: 'Shift' }); });
  check('review: a key press skips the lap', lap() === 'done');
  tick(SEC);
  check('review: after a skip it runs', instanceOf(m, 1).view.review?.tips[0]?.code === 'duplicate-route');
});

scenario('the review with reduced motion', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  check('reduced motion: the lap’s end at once, no review step yet', lap() === 'done' && !instanceOf(m, 1).view.review);
  tick(SEC);
  check('reduced motion: the review after a frame', instanceOf(m, 1).view.review?.tips[0]?.code === 'duplicate-route');
}, { reducedMotion: true });

scenario('the review is cancelled by an edit and a new check, not by navigation', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  tick(2800);
  const calls = idle.calls;
  tick(30);
  check('cancel: the review has started', idle.calls > calls && !instanceOf(m, 1).view.review, { calls: idle.calls - calls });
  selectRouter('R1');
  const net = () => all('.ng-rt-free-row')[0].querySelector('.ng-rt-f-net input');
  type(net(), '192.168.2.0 ');
  tick(2 * SEC);
  check('cancel: an edit drops it (no review written)', !instanceOf(m, 1).view.review && idle.pending.size === 0, { pending: idle.pending.size });
  type(net(), '192.168.2.0');
  click(checkNet());
  tick(2800);
  tick(30);
  open(m, 2);
  tick(2 * SEC);
  check('navigation: the review finishes in the background on its own instance', instanceOf(m, 1).view.review?.tips[0]?.code === 'duplicate-route' && title().startsWith('#2 '));
  open(m, 1);
  check('navigation: back on the task, its tip shows', tipLinks()[0]?.startsWith('R1, маршрут №2: '), tipLinks());
  // A stale write (an older check's) is ignored by the instance.
  const generation = instanceOf(m, 1).generation;
  step(() => m.store.dispatch({ type: 'instance', key: keyOf(1), action: { type: 'review', generation: generation - 1, edits: instanceOf(m, 1).edits, tips: [], star: true } }));
  check('stale guard: an older generation’s review is not stored', instanceOf(m, 1).view.review.generation === generation && instanceOf(m, 1).view.review.star === false);
});

scenario('a syntax or mode switch doesn’t cancel the review', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  tick(2800);
  tick(30);
  check('switch: the review has started, not finished', !instanceOf(m, 1).view.review && idle.pending.size > 0);
  pref(m, 'syntax', 'routeros');
  tick(20);
  pref(m, 'mode', 'guided');
  tick(2 * SEC);
  check('switch: it finishes; its tip shows in the guided view, where the route is', instanceOf(m, 1).view.review?.tips[0]?.code === 'duplicate-route' && tipLinks()[0]?.startsWith('R1, маршрут №2: '), tipLinks());
});

scenario('the final review, without ★ (round 4: calm)', m => {
  freeTask1(m);
  click(checkNet());
  check('no ★: no room held in the strip either', noStar() && !instanceOf(m, 1).view.review);
  tick(2700);
  tick(17);
  check('review: not from an unfinished review', noStar() && !instanceOf(m, 1).view.review);
  tick(SEC);
  check('review: the final review still runs (its star stays in the logic), nothing shows a ★', instanceOf(m, 1).view.review?.star === true && noStar());
  pref(m, 'mode', 'guided');
  check('no ★ in guided mode', noStar());
  pref(m, 'mode', 'free');
  check('no ★ back in free mode', noStar());
  check('no ★ limits line either (the known table keeps its own limits line)', !q('#ng-rt-star-limits'));
  selectRouter('R1');
  const gw = all('.ng-rt-free-row')[0].querySelector('.ng-rt-f-gw input');
  type(gw, '10.0.0.3');
  // Round 4: after a success the panel is done (no hint button); an edit dims the success («до змін»), marks the edited row, and «Перевірити» stays.
  // Repair 9: after an edit the success is «до змін» and help is available again (hints); «Далі →» stays primary.
  check('an edit: the success is «до змін», the edited row is the evidence; hints are back; «Далі →» stays primary', q('.ng-rt-help [data-help-current]')?.hasAttribute('data-help-stale')
    && gw.closest('.ng-rt-row').getAttribute('data-evidence') === 'current' && Boolean(checkNet()) && Boolean(q('.ng-rt-help .ng-help-hint-button'))
    && (!q('.ng-rt-help .ng-help-next') || q('.ng-rt-help .ng-help-next').className.includes('primary')));
  type(gw, '10.0.0.2');
  check('typing the old text back doesn’t bring the review back (the edits moved on)', instanceOf(m, 1).view.review && instanceOf(m, 1).view.review.edits !== instanceOf(m, 1).edits && !q('.ng-rt-tip-link'),
    { review: instanceOf(m, 1).view.review?.edits, edits: instanceOf(m, 1).edits });
  check('no ★ in the task list or the bar', noStar() && !q('.ng-rt-score') && !q('button[aria-label="Скинути рахунок"]'));
});

scenario('a tip shows its row', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  tick(4 * SEC);
  selectRouter('R2');
  const before = instanceOf(m, 1);
  const link = all('.ng-rt-tip-link')[0];
  click(link);
  const row = q('#rt-head-R1-f2')?.closest('.ng-rt-row');
  check('tip: selects the router, focuses and outlines the row', all('.ng-rt-router').find(b => b.getAttribute('aria-pressed') === 'true')?.textContent === 'R1'
    && document.activeElement?.getAttribute('id') === 'rt-head-R1-f2' && row?.className.includes('is-target'), { active: document.activeElement?.getAttribute('id'), row: row?.className });
  check('tip: never edits', instanceOf(m, 1) === before);
  step(() => { q('#rt-R1-f2-net').focus(); });
  check('tip: the outline goes when focus leaves the row’s header (one ring at a time)', !q('#rt-head-R1-f2').closest('.ng-rt-row').className.includes('is-target'));
  click(all('.ng-rt-tip-link')[0]);
  check('tip: a second click outlines and focuses it again', document.activeElement?.getAttribute('id') === 'rt-head-R1-f2' && q('#rt-head-R1-f2').closest('.ng-rt-row').className.includes('is-target'));
  pref(m, 'mode', 'guided');
  check('tip: after a mode switch, the same route by its new place («Інші маршрути»)', tipLinks()[0]?.startsWith('R1, маршрут №2: ') && Boolean(q('.ng-rt-extras #rt-head-R1-f2')), tipLinks());
});

const { shortest } = await import('./routing-review.mjs');
/** The reveal's copy payload, written out: every router of the known table, in a syntax. */
function payloadOf(n, syntaxId, task = routing.create(tasks[n - 1])) {
  const syntax = syntaxes[syntaxId], comment = syntaxId === 'cisco' ? '!' : '#';
  const commandOf = r => syntax.command({ dst: r.dst, prefix: r.prefix, ...(r.discard === true ? { discard: true } : { via: r.via }), ...(r.distance > 1 ? { distance: r.distance } : {}) });
  return Object.entries(shortest(task)).filter(([, rows]) => rows.length).map(([router, rows]) => `${comment} ${router}\n${rows.map(commandOf).join('\n')}`).join('\n\n');
}
/** Free mode: the reference typed, router by router (MikroTik's discard as the box). */
function freeReference(m, n, syntaxId) {
  pref(m, 'mode', 'free');
  pref(m, 'syntax', syntaxId);
  open(m, n);
  const task = routing.create(tasks[n - 1]);
  for (const [router, routes] of Object.entries(routing.solution(task))) for (const route of routes) freeAdd(router, syntaxes[syntaxId].fromRoute(route, true));
}

scenario('«Показати найкоротший відомий варіант»', m => {
  freeTask1(m);
  check('reveal: not before the task is earned', !q('#ng-rt-best'));
  click(checkNet());
  tick(4 * SEC);
  check('reveal: offered once earned (free mode), its commands not in the page yet', q('#ng-rt-best')?.textContent.startsWith('Показати найкоротший відомий варіант') && !q('.ng-rt-best-commands') && q('#ng-rt-best').getAttribute('aria-expanded') === 'false');
  pref(m, 'mode', 'guided');
  check('reveal: not in guided mode, which follows its scaffold', !q('#ng-rt-best'));
  pref(m, 'mode', 'free');
  click(q('#ng-rt-best'));
  check('reveal: the honest line', q('.ng-rt-best-line')?.textContent === 'Відомий варіант, що проходить усі змодельовані перевірки: 2 маршрути. Перевірено два кандидати на кожному роутері за один прохід; коротший варіант може існувати.');
  check('reveal: its region is named', q('#ng-rt-best-body')?.getAttribute('role') === 'region' && q('#ng-rt-best-body').getAttribute('aria-label') === 'Найкоротший відомий варіант');
  for (const syntaxId of ['cisco', 'routeros']) {
    pref(m, 'syntax', syntaxId);
    click(q('.ng-rt-best .ng-rt-copy'));
    check(`reveal: the copy payload is the whole table, every router, in ${syntaxId}`, copied.at(-1) === payloadOf(1, syntaxId), copied.at(-1));
  }
  pref(m, 'syntax', 'cisco');
  const session = instanceOf(m, 1).session;
  check('reveal: nothing is marked (no assistance; earned stays)', session.assisted === false && session.earned.solved === true && session.revealed === false, session);
  open(m, 2);
  check('reveal: not on an unearned task', !q('#ng-rt-best'));
  open(m, 1);
  check('reveal: closed again after an instance change', q('#ng-rt-best')?.getAttribute('aria-expanded') === 'false' && !q('.ng-rt-best-commands'));
  click(q('#ng-rt-best'));
  clearResults(m, [keyOf(1)]);
  check('reveal: clearing the results (the store\'s clear-results) takes it away, open or not', !q('#ng-rt-best') && !q('.ng-rt-best-commands'));
});

scenario('the reveal’s payload for task 17 (discard)', m => {
  freeReference(m, 17, 'routeros');
  click(checkNet());
  tick(7 * SEC);
  click(q('#ng-rt-best'));
  for (const syntaxId of ['routeros', 'cisco']) {
    pref(m, 'syntax', syntaxId);
    click(q('.ng-rt-best .ng-rt-copy'));
    check(`reveal, task 17: the whole table in ${syntaxId} (the discard as ${syntaxId === 'cisco' ? 'Null0' : 'blackhole'})`, copied.at(-1) === payloadOf(17, syntaxId)
      && copied.at(-1).includes(syntaxId === 'cisco' ? 'Null0' : 'blackhole'), copied.at(-1));
  }
});

scenario('clear-results mid-review', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  tick(2800);
  tick(30);
  check('↺: the review has started, not finished', !instanceOf(m, 1).view.review && idle.pending.size > 0);
  clearResults(m, [keyOf(1)]);
  const calls = idle.calls;
  tick(3 * SEC);
  check('↺: the unfinished review stops: at most the one step that finds it gone, nothing stored, nothing pending', idle.calls - calls <= 1 && !instanceOf(m, 1).view.review && idle.pending.size === 0,
    { calls: idle.calls - calls, pending: idle.pending.size });
});

// Round 4 (spec R1 v2): a guided row is checked when a field the learner touched
// loses focus; only touched fields are marked; untouched fields only by the
// network check. Leaving an untouched field checks nothing and keeps the review.
scenario('blur checks: only touched fields; an untouched blur keeps the review', m => {
  freeTask1(m);
  click(checkNet());
  tick(4 * SEC);
  check('blur: the free-mode review is stored (no ★ shown)', instanceOf(m, 1).view.review?.star === true && noStar());
  const generation = instanceOf(m, 1).view.review.generation;
  const edits = instanceOf(m, 1).edits;
  pref(m, 'mode', 'guided');
  selectRouter('R1');
  step(() => { q('#rt-R1-0-gw').focus(); });
  step(() => { fire(q('#rt-R1-0-gw'), 'blur'); fire(q('#rt-R1-0-gw'), 'focusout'); });
  check('blur: an untouched field\'s blur checks nothing (no row verdict, no edit)', !q('#rt-R1-0-gw').closest('.ng-rt-row').className.match(/is-(ok|wrong)/) && instanceOf(m, 1).edits === edits, { edits: [edits, instanceOf(m, 1).edits] });
  pref(m, 'mode', 'free');
  check('blur: the review stays in free mode', instanceOf(m, 1).view.review?.generation === generation && noStar());
});

// Repair 1: the latest network check wins over a blur's scope, in either syntax; blank rows are marked by a check.
scenario('blur scope vs the network check, across syntaxes', m => {
  selectRouter('R1');
  typeRow('rt-R1-0', { net: '192.168.9.0', mask: '255.255.255.0', gw: '10.0.0.2' });
  step(() => { fire(q('#rt-R1-0-net'), 'blur'); fire(q('#rt-R1-0-net'), 'focusout'); });
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'routeros' }));
  click(checkNet());
  selectRouter('R1');
  check('network check after a Cisco blur: MikroTik\'s destination marked (the check wins; scopes translate)', q('#rt-R1-0-dst')?.getAttribute('aria-invalid') === 'true', q('#rt-R1-0-dst')?.getAttribute('aria-invalid'));
  selectRouter('R2');
  check('network check: an entirely blank guided row gets its fields marked', q('#rt-R2-0-dst')?.getAttribute('aria-invalid') === 'true' && q('#rt-R2-0-gw')?.getAttribute('aria-invalid') === 'true');
  step(() => m.store.dispatch({ type: 'pref', name: 'syntax', value: 'cisco' }));
});

// Repair 6: one error per field: a form check's words, not the row's reasons as well.
scenario('one error per field', m => {
  selectRouter('R1');
  typeRow('rt-R1-0', { net: '192.168.2.0', mask: '255.255.255.0', gw: '10.0.0.9.9' });
  click(checkNet());
  selectRouter('R1');
  const row = q('#rt-R1-0-gw').closest('.ng-rt-row');
  check('a form error shows its words once (no reasons line beside it)', Boolean(row.querySelector('.ng-rt-form-mark')) && !row.querySelector('.ng-rt-reasons'));
});

scenario('blur checks: a touched field\'s blur marks only the touched fields', m => {
  selectRouter('R1');
  type(q('#rt-R1-0-net'), '192.168.2.5');
  step(() => { fire(q('#rt-R1-0-net'), 'blur'); fire(q('#rt-R1-0-net'), 'focusout'); });
  const row = () => q('#rt-R1-0-net').closest('.ng-rt-row');
  check('blur: the touched field is checked and marked (host bits: not a network)', q('#rt-R1-0-net').getAttribute('aria-invalid') === 'true' && row().className.includes('is-wrong'));
  check('blur: the untouched, empty fields are not marked', q('#rt-R1-0-mask').getAttribute('aria-invalid') !== 'true' && q('#rt-R1-0-gw').getAttribute('aria-invalid') !== 'true');
  check('blur: a row check is no attempt', (instanceOf(m, 1).session.attempts ?? 0) === 0);
  click(checkNet());
  check('network check: every field of the row is graded now (the empty ones marked too)', q('#rt-R1-0-mask').getAttribute('aria-invalid') === 'true' && q('#rt-R1-0-gw').getAttribute('aria-invalid') === 'true'
    && (instanceOf(m, 1).session.attempts ?? 0) === 1);
  check('network check: no per-row «Перевірити» anywhere; the one check is the panel\'s', !all('button').some(b => (b.getAttribute('aria-label') ?? '').startsWith('Перевірити:')) && all('.ng-help-check').length === 1);
});

scenario('«Показати ще раз» mid-review', m => {
  freeTask1(m, { duplicate: true });
  click(checkNet());
  tick(2800);
  tick(30);
  check('replay: the review has started, not finished', !instanceOf(m, 1).view.review);
  click(q('.ng-rt-replay'));
  const calls = idle.calls;
  tick(2 * SEC);
  check('replay: no review step while it plays', lap() === 'playing' && idle.calls === calls, { lap: lap(), calls: idle.calls - calls });
  tick(1500);
  tick(SEC);
  check('replay: after it, the review finishes', lap() === 'done' && instanceOf(m, 1).view.review?.tips[0]?.code === 'duplicate-route');
});

scenario('a shorter-known tip goes to the reveal', m => {
  freeTask1(m);
  click(checkNet());
  tick(4 * SEC);
  const inst = instanceOf(m, 1);
  step(() => m.store.dispatch({ type: 'instance', key: keyOf(1), action: { type: 'review', generation: inst.generation, edits: inst.edits ?? 0, tips: [{ code: 'shorter-known', scope: 'task', params: { total: 2, count: 3 } }], star: false } }));
  const link = all('.ng-rt-tip-link').find(b => b.textContent.startsWith('Відомий безпечний варіант має 2 маршрути, у тебе — 3.'));
  check('shorter-known: a link', Boolean(link));
  click(link);
  check('shorter-known: it focuses «Показати найкоротший відомий варіант»', document.activeElement?.getAttribute('id') === 'ng-rt-best', document.activeElement?.getAttribute('id'));
});

scenario('the review only while the rows are the proven routes', m => {
  freeTask1(m);
  click(checkNet());
  tick(4 * SEC);
  check('proven: no hint button after the success (and no ★)', !q('.ng-rt-help .ng-help-hint-button') && noStar());
  const inst = instanceOf(m, 1);
  step(() => m.store.dispatch({ type: 'instance', key: keyOf(1), action: { type: 'view', patch: { proven: JSON.stringify({ R1: [], R2: [] }) } } }));
  const now = instanceOf(m, 1);
  check('proven: rows that differ from the proven routes hide the review\'s tips and the other-syntax block, though the counters match', !q('.ng-rt-tip-link') && !q('.ng-rt-other-toggle')
    && now.generation === inst.generation && now.edits === inst.edits);
});

// ── 7. Step 9: «Інші адреси», «Код задачі», copying the code, instance isolation ──
// A generated instance comes from create() with a seed (logic/static.js); the
// screen keeps the one last used per task in its place (`seeds`), and the
// store an instance only once it is worked on.
const { leaks, instanceAddresses, normalise } = await import('./routing-leaks.mjs');
const { ui: { address: { codeErrors: codeSentences } } } = await import('../../src/sections/routing/uk.js');
const bankOf = { bankId: routingBank.bankId, bankRevision: routingBank.bankRevision };
const generatedTask = (n, seed, variantId) => routing.create(tasks[n - 1], { variantId: variantId ?? tasks[n - 1].variants[0].id, seed, ...bankOf });
const baseTask = (n, variantId) => routing.create(tasks[n - 1], { variantId: variantId ?? tasks[n - 1].variants[0].id, ...bankOf });
const seedOf = (m, n) => m.store.state.places.routing?.seeds?.[tasks[n - 1].id] ?? null;
const codeFor = (code, seed) => `A${code}-${String(seed).padStart(4, '0')}`;
// Round 4 (spec R1, A4): the address actions are items of the screen's «⋯» menu.
const moreButton = () => q('.ng-rt-more .ng-more-button');
const openMenu = () => { if (moreButton()?.getAttribute('aria-expanded') !== 'true') click(moreButton()); };
const closeMenu = () => { if (moreButton()?.getAttribute('aria-expanded') === 'true') step(() => { fire(q('.ng-more-menu'), 'keydown', { key: 'Escape' }); }); };
/** A menu item by the start of its label (the menu opened for it), or null. */
const menuItem = label => { openMenu(); return all('.ng-more-item').find(b => b.textContent.startsWith(label)) ?? null; };
/** Whether the menu offers an item (it is closed again after looking). */
const offers = label => { const found = Boolean(menuItem(label)); closeMenu(); return found; };
/** Choose a menu item. */
const choose = label => click(menuItem(label));
const previousCode = () => { const item = menuItem('Попередні адреси:'); const code = item?.textContent.replace('Попередні адреси: ', '') ?? null; closeMenu(); return code; };
const addressLine = () => q('.ng-rt-addr-failed')?.textContent ?? '';
const codeInput = () => q('#ng-rt-codefield-input');
const codeError = () => q('#ng-rt-codefield-error');
const codeShown = () => q('.ng-rt-title')?.getAttribute('data-code') ?? null;
const stepAsync = async fn => { await act(async () => { fn(); for (let i = 0; i < 5; i++) await Promise.resolve(); }); listen(); };
/** «Інші адреси»: the menu item, then the build after its paint. */
function otherAddresses() { choose('Інші адреси'); tick(300); }
/** «Код задачі»: typed, then Enter (or «Відкрити»), then the build ('enter-only': no wait for it). */
function openCode(text, how = 'enter') {
  type(codeInput(), text);
  if (how === 'button') click(q('.ng-rt-codefield-open'));
  else step(() => { fire(codeInput(), 'keydown', { key: 'Enter' }); });
  if (how !== 'enter-only') tick(100);
}
/** The page's text, and its attributes' values, as the leak gate reads them. */
const pageText = () => normalise(q('.ng-rt').outerHTML);
const pageAttributes = () => [...q('.ng-rt').outerHTML.matchAll(/(?:placeholder|title|aria-label|aria-description)="([^"]*)"/g)].map(m => m[1]);
const dottedIn = text => text.match(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d]|\.\d)/g) ?? [];
/** Addresses of `other` that `task` doesn't have: none may show on `task`'s screen. */
const foreign = (task, other) => [...instanceAddresses(other)].filter(ip => ip !== '0.0.0.0' && !instanceAddresses(task).has(ip));

scenario('step 9: «Інші адреси» starts another instance and keeps the old one’s work', m => {
  const baseKey = keyOf(1);
  check('step 9 base: the heading is the title (its code A1 in «⋯»); no «Основні адреси», no subtitle', title().startsWith('#1 · A1 — ') && codeShown() === 'A1' && offers('Скопіювати код A1') && !offers('Основні адреси') && !q('.ng-rt-addr-sub'), title());
  selectRouter('R1');
  type(q('#rt-R1-0-net'), '192.168.2.0');
  const before = m.store.state.instances[baseKey];
  check('step 9 base: typing stores the base instance', before?.drafts?.guided?.cisco?.['R1.row1']?.net === '192.168.2.0', before?.drafts);
  choose('Інші адреси');
  check('«Інші адреси»: the address line says it is building, and nothing changes yet', addressLine() === 'Підбираю адреси…' && codeShown() === 'A1', addressLine());
  tick(300);
  const seed = seedOf(m, 1), task = generatedTask(1, seed), code = codeFor('1', seed);
  check('«Інші адреси»: a generated instance (its code in «⋯»)', Number.isInteger(seed) && title().startsWith(`#1 · ${code} — `) && codeShown() === code && offers(`Скопіювати код ${code}`), { seed, title: title() });
  check('«Інші адреси»: «Та сама задача з іншими адресами»; «⋯» offers «Основні адреси» and «Попередні адреси: A1»',
    q('.ng-rt-addr-sub')?.textContent === 'Та сама задача з іншими адресами' && offers('Основні адреси') && previousCode() === 'A1');
  check('«Інші адреси»: focus back on «⋯» (a menu action)', document.activeElement === moreButton());
  check('«Інші адреси»: said in the address row\'s polite line', addressLine() === `Та сама задача з іншими адресами: ${code}.` && q('.ng-rt-addr-failed').getAttribute('aria-live') === 'polite', addressLine());
  check('«Інші адреси»: nothing stored for the new instance before its first edit', !m.store.state.instances[task.instanceKey], Object.keys(m.store.state.instances));
  check('«Інші адреси»: the old instance untouched', m.store.state.instances[baseKey] === before);
  const shown = new Set(dottedIn(pageText()));
  const ownIp = task.network.devices.find(d => d.id === 'R1').interfaces.map(f => f.address.ip);
  check('isolation: the diagram and the work panel show the instance’s addresses, none of the base’s', ownIp.every(ip => shown.has(ip)) && foreign(task, baseTask(1)).every(ip => !shown.has(ip)),
    { own: ownIp, base: foreign(task, baseTask(1)).filter(ip => shown.has(ip)) });
  check('isolation: the rows are the instance’s own (empty)', q('#rt-R1-0-net').value === '');
  type(q('#rt-R1-0-net'), '10.');
  check('first edit: now the instance is stored', m.store.state.instances[task.instanceKey]?.drafts?.guided?.cisco?.['R1.row1']?.net === '10.');
  choose('Попередні адреси:');
  check('«Попередні адреси»: back on A1 with its own typed row; the generated code is now the previous', codeShown() === 'A1' && q('#rt-R1-0-net').value === '192.168.2.0' && previousCode() === code && !q('.ng-rt-addr-sub'));
  choose('Попередні адреси:');
  check('A → B → A: the generated instance keeps its own text', codeShown() === code && q('#rt-R1-0-net').value === '10.');
  choose('Основні адреси');
  tick(200);
  check('«Основні адреси»: the base; the item goes; focus back on «⋯»', codeShown() === 'A1' && !offers('Основні адреси') && document.activeElement === moreButton() && previousCode() === code);
  check('«Основні адреси»: said in the address line', addressLine() === 'Основні адреси: A1.', addressLine());
  choose('Попередні адреси:');
  click(nextTask());
  check('navigation: another task clears «Попередні адреси»', title().startsWith('#2 · A2 — ') && previousCode() === null, title());
  click(prevTask());
  selectRouter('R1');
  check('the list reopens the instance last used for the task', codeShown() === code && previousCode() === null && q('#rt-R1-0-net').value === '10.', title());
  check('nothing earned: no ✓ in the list, no score anywhere', !all('.ng-rt-task').some(b => b.querySelector('.ng-done')) && !q('.ng-rt-score'));
});

scenario('step 9: «Код задачі» opens on Enter or «Відкрити», never while typing', m => {
  click(q('.ng-rt-drawer-button'));
  check('code field: labelled «Код задачі», at the top of the task list', q('label[for="ng-rt-codefield-input"]')?.textContent === 'Код задачі' && Boolean(codeInput().closest('#ng-rt-tasks')) && Boolean(q('.ng-rt-tasks.is-open')));
  type(codeInput(), 'a3');
  type(codeInput(), 'a3b 42');
  check('typing opens nothing (A3 on the way to A3b 42)', title().startsWith('#1 · A1 — ') && seedOf(m, 3) === null && Boolean(q('.ng-rt-tasks.is-open')));
  step(() => { fire(codeInput(), 'keydown', { key: 'Enter' }); });
  check('Enter: «Відкриваю…» while the instance is built', q('.ng-rt-codefield-open').textContent === 'Відкриваю…' && title().startsWith('#1 '));
  tick(100);
  check('Enter: task 3b with seed 42; the drawer closes and focus goes to the heading', title().startsWith('#3b · A3b-0042 — ') && seedOf(m, 3) === 42
    && m.store.state.places.routing.variants['routing.task-03'] === 'defaults' && !q('.ng-rt-tasks.is-open') && document.activeElement === q('.ng-rt-title'), title());
  check('the field is empty again, with no message', codeInput().value === '' && codeError().textContent === '');
  click(variantButton('3'));
  check('the variant switch keeps the addresses (one network per task): A3-0042', title().startsWith('#3 · A3-0042 — '), title());
  click(q('.ng-rt-drawer-button'));
  type(codeInput(), ' А8 ');
  click(q('.ng-rt-codefield-open'));
  check('«Відкрити», Cyrillic А, base addresses: task 8 at once', title().startsWith('#8 · A8 — ') && seedOf(m, 8) === null && !q('.ng-rt-addr-sub') && !q('.ng-rt-tasks.is-open'), title());
  check('opening a code is navigation: no «Попередні адреси»', previousCode() === null);
  check('opening and looking store nothing', Object.keys(m.store.state.instances).length === 0, Object.keys(m.store.state.instances));
});

scenario('step 9: each refused code has its own message, tied to the field', m => {
  const task = baseTask(1);
  for (const [text, code] of [['B1', 'unknown-letter'], ['A18', 'unknown-variant'], ['A3-12345', 'bad-seed'], ['A3b-', 'bad-seed'], ['A30042', 'unknown-variant']]) {
    openCode(text);
    check(`code «${text}» refused: ${code}`, codeError().textContent === codeSentences[code] && codeInput().getAttribute('aria-invalid') === 'true'
      && codeInput().getAttribute('aria-describedby') === 'ng-rt-codefield-error' && codeError().getAttribute('aria-live') === 'polite' && title().startsWith('#1 · A1 — '), codeError().textContent);
    for (const kind of ['text', 'placeholder']) check(`code «${text}»: its message gives nothing away (${kind})`, leaks(task, codeError().textContent, kind).length === 0);
  }
  type(codeInput(), 'A1');
  check('typing clears the message', codeError().textContent === '' && !codeInput().hasAttribute('aria-invalid'));
  type(codeInput(), '   ');
  step(() => { fire(codeInput(), 'keydown', { key: 'Enter' }); });
  check('an empty field opens nothing and says nothing', codeError().textContent === '' && title().startsWith('#1 · A1 — '));
  check('the code field’s accessible text gives nothing away', pageAttributes().every(a => leaks(task, a, 'placeholder').length === 0));
});

// A record the generator can't renumber: its reference no longer passes, so every attempt fails acceptance.
const broken = structuredClone(tasks[1]);
for (const v of broken.variants) v.referenceRoutes = Object.fromEntries(Object.keys(v.referenceRoutes).map(r => [r, []]));
const brokenBank = { ...bankOf, tasks: tasks.map((r, i) => (i === 1 ? broken : r)) };
scenario('step 9: a code whose addresses can’t be built; «Інші адреси» that finds none', m => {
  openCode('A2-0042');
  check('infeasible code: its own message; nothing opens', codeError().textContent === codeSentences.infeasible && title().startsWith('#1 · A1 — ') && seedOf(m, 2) === null, codeError().textContent);
  check('the four messages are distinct', new Set(Object.values(codeSentences)).size === 4 && Object.keys(codeSentences).length === 4);
  click(nextTask());
  otherAddresses();
  check('«Інші адреси» with no buildable seed: stays on the base, says so calmly, stores nothing', title().startsWith('#2 · A2 — ') && seedOf(m, 2) === null
    && addressLine() === 'Інших адрес для цієї задачі зараз не вдалося підібрати.' && Object.keys(m.store.state.instances).length === 0, addressLine());
  click(prevTask());
  check('the notice belongs to that instance', q('.ng-rt-addr-failed').textContent === '');
}, { bank: brokenBank });

async function scenarioAsync(name, fn) {
  const m = mountRouting();
  try { await fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
  check(`${name}: unmounting leaves no timer behind`, pending.size === 0 && idle.pending.size === 0, { pending: pending.size, frames: idle.pending.size });
}

await scenarioAsync('step 9: «Скопіювати код»', async () => {
  otherAddresses();
  const code = codeShown(), task = generatedTask(1, Number(code.slice(3)));
  const real = navigator.clipboard.writeText;
  let release = null;
  navigator.clipboard.writeText = text => new Promise(resolve => { release = () => { copied.push(text); resolve(); }; });
  const copyItem = () => menuItem('Скопіювати код') ?? menuItem('✓ Скопійовано');
  { const item = copyItem(); await stepAsync(() => fire(item, 'click')); }
  check('copy: nothing claimed before the clipboard answers; the menu stays open', copyItem().textContent === `Скопіювати код ${code}` && typeof release === 'function' && moreButton().getAttribute('aria-expanded') === 'true', copyItem().textContent);
  await stepAsync(() => release());
  check('copy: «✓ Скопійовано» once the clipboard took it; the payload is the code alone', copyItem().textContent === '✓ Скопійовано' && copied.at(-1) === code, { label: copyItem().textContent, copied: copied.at(-1) });
  for (const kind of ['text', 'placeholder']) check(`copy: the payload gives nothing away (${kind})`, leaks(task, copied.at(-1), kind).length === 0);
  tick(1600);
  navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  { const item = copyItem(); await stepAsync(() => fire(item, 'click')); }
  check('copy refused: no «Скопійовано»; the polite address line gives the code to select by hand', copyItem().textContent === `Скопіювати код ${code}`
    && addressLine() === `Не вдалося скопіювати. Код: ${code} — виділи його й натисни Ctrl+C.` && q('.ng-rt-addr-failed').getAttribute('aria-live') === 'polite', addressLine());
  navigator.clipboard.writeText = real;
  { const item = copyItem(); await stepAsync(() => fire(item, 'click')); }
  check('copy again: confirmed', copyItem().textContent === '✓ Скопійовано' && copied.at(-1) === code);
  tick(1600);
  closeMenu();
  otherAddresses();
  check('another instance: its own code to copy', offers(`Скопіювати код ${codeShown()}`) && codeShown() !== code);
});

scenario('step 9: a generated instance checks on its own addresses, with the lap; A → B → A between seeds', m => {
  openCode('A1-0042');
  const task = generatedTask(1, 42);
  fillTask(task);
  click(checkNet());
  check('generated task 1: the network check passes with its own addresses, and the lap plays', stripText().startsWith(SUCCESS) && lap() === 'playing', stripText());
  tick(3000);
  check('generated task 1: the lap ends', lap() === 'done');
  check('generated task 1: earned on its own instance only', m.store.state.instances[task.instanceKey]?.session.earned.solved === true && !m.store.state.instances[keyOf(1)]);
  click(q('button[aria-controls="ng-rt-text"]'));
  const items = q('#ng-rt-text').textContent;
  check('«Текстом»: the instance’s addresses, none of the base’s', dottedIn(items).length > 0 && foreign(task, baseTask(1)).every(ip => !dottedIn(items).includes(ip)) && leaks(task, normalise(q('#ng-rt-text').outerHTML), 'text-equivalent').length === 0);
  click(q('button[aria-controls="ng-rt-text"]'));
  otherAddresses();
  check('seed B: no lap, no success', lap() === null && lapLayers() === 0 && !q('.ng-rt-success'));
  choose('Попередні адреси:');
  tick(200);
  check('back on A1-0042: the lap doesn’t play again; «Показати ще раз» is offered', codeShown() === 'A1-0042' && lap() === null && Boolean(q('.ng-rt-replay')) && pending.size === 0, state());
  clickOnly(q('.ng-rt-replay'));
  check('«Показати ще раз» plays it', lap() === 'playing');
  tick(3000);
});

for (const syntaxId of ['cisco', 'routeros']) scenario(`step 9: generated task 17 solved in ${syntaxId}`, m => {
  pref(m, 'syntax', syntaxId);
  openCode('A17-0042');
  fillTask(generatedTask(17, 42), syntaxId);
  click(checkNet());
  check(`generated task 17 in ${syntaxId}: the network check passes`, title().startsWith('#17 · A17-0042') && stripText().startsWith(SUCCESS), stripText());
  tick(7 * SEC);
  check(`generated task 17 in ${syntaxId}: the lap’s ending names R-CORE`, stripText().includes('R-CORE відкидає пакет'), stripText());
});

scenario('step 9: the tips on a generated instance', m => {
  pref(m, 'mode', 'free');
  openCode('A1-0042');
  const task = generatedTask(1, 42), cisco = r => syntaxes.cisco.fromRoute(r, true);
  freeAdd('R1', cisco(task.variant.referenceRoutes.R1[0]));
  freeAdd('R1', cisco(task.variant.referenceRoutes.R1[0]));
  freeAdd('R2', cisco(task.variant.referenceRoutes.R2[0]));
  click(checkNet());
  tick(4 * SEC);
  check('generated: the duplicate-route tip, on its own instance', tipLinks()[0]?.startsWith('R1, маршрут №2: ') && m.store.state.instances[task.instanceKey]?.view.review?.tips[0]?.code === 'duplicate-route', tipLinks());
  check('generated: no ★ with a duplicate', noStar());
});

scenario('step 9: solved on one address set → another: no known table; the ✓ stays; clearing every instance clears it', m => {
  pref(m, 'mode', 'free');
  otherAddresses();
  const seedA = seedOf(m, 1), taskA = generatedTask(1, seedA), cisco = r => syntaxes.cisco.fromRoute(r, true);
  freeAdd('R1', cisco(taskA.variant.referenceRoutes.R1[0]));
  freeAdd('R2', cisco(taskA.variant.referenceRoutes.R2[0]));
  click(checkNet());
  tick(4 * SEC);
  check('seed A: the review from its own frozen total (no ★ shown), and the known table offered', m.store.state.instances[taskA.instanceKey]?.view.review?.star === true && noStar() && Boolean(q('#ng-rt-best')));
  click(q('#ng-rt-best'));
  click(q('.ng-rt-best .ng-rt-copy'));
  check('seed A: the known table in its own addresses, not the base’s', copied.at(-1) === payloadOf(1, 'cisco', taskA) && copied.at(-1) !== payloadOf(1, 'cisco'), copied.at(-1));
  otherAddresses();
  const seedB = seedOf(m, 1);
  check('seed B: no ★, no table, no success; nothing stored', seedB !== seedA && noStar() && !q('#ng-rt-best') && !q('.ng-rt-success') && !m.store.state.instances[generatedTask(1, seedB).instanceKey]);
  const mark = all('.ng-rt-task')[0].querySelector('.ng-done');
  check('the list: task 1 ✓ (DoneMark) from seed A, «розв’язано» in the button’s name', mark?.textContent === '✓ розв’язано' && mark.querySelector('[aria-hidden="true"]')?.textContent === '✓'
    && Boolean(mark.closest('button.ng-rt-task')) && all('.ng-done').length === 1);
  check('no score in the bar', !q('.ng-rt-score') && !q('button[aria-label="Скинути рахунок"]'));
  choose('Основні адреси');
  check('the base: no ★ or table either', noStar() && !q('#ng-rt-best'));
  clearResults(m, Object.keys(m.store.state.instances));
  check('clear-results on every instance: the ✓ and seed A’s mark go', !all('.ng-rt-task')[0].querySelector('.ng-done')
    && m.store.state.instances[taskA.instanceKey].session.earned.solved === false);
});

// Round 4 (spec R1): one reveal, the help panel's, applied to the rows («показано»), per instance.
const revealLink = () => q('.ng-rt-help .ng-help-reveal-link');
scenario('step 9: the base revealed → other addresses unrevealed', m => {
  click(revealLink());
  check('base: revealed, the selected router\'s commands in the rows\' place, marked «показано»', Boolean(q('.ng-rt-commands')) && q('.ng-rt-reveal')?.hasAttribute('data-revealed')
    && q('.ng-rt-reveal .ng-shown-chip')?.textContent === 'показано' && m.store.state.instances[keyOf(1)]?.session.revealed === true);
  check('base: the panel says where the answer is; focus on that line', q('.ng-rt-help .ng-help-applied-text')?.textContent.startsWith('Відповідь показано в рядках маршрутів') && document.activeElement === q('.ng-help-applied-text'));
  selectRouter('R2');
  check('another router: its own reference', q('.ng-rt-reveal')?.getAttribute('aria-label') === 'ВІДПОВІДЬ — R2');
  click(all('.ng-rt-mine').find(b => b.textContent === 'Моя відповідь'));
  check('«Моя відповідь»: the learner\'s rows again; «Відповідь» switches back', !q('.ng-rt-commands') && Boolean(q('.ng-rt-rows')) && q('.ng-rt-mine')?.textContent === 'Відповідь');
  click(q('.ng-rt-mine'));
  otherAddresses();
  const task = generatedTask(1, seedOf(m, 1));
  check('generated: nothing revealed or stored; the reveal link offered', !q('.ng-rt-commands') && Boolean(revealLink()) && !m.store.state.instances[task.instanceKey]);
  pref(m, 'syntax', 'routeros');
  choose('Попередні адреси:');
  check('MikroTik: back on the base, its reveal still applied (in MikroTik words)', Boolean(q('.ng-rt-commands')) && q('.ng-rt-commands').textContent.startsWith('/ip route add'));
});

// ── 8. Step 9 repair round 1: pending builds never override newer navigation; Ukrainian-keyboard codes; ──
// ── a passing answer that isn't the reference, shown and copied in the other syntax; the reveal panel's state ──
scenario('step 9 race: «Інші адреси», then «Основні адреси» before it builds', m => {
  openCode('A1-0042');
  choose('Інші адреси');
  check('race: «Інші адреси» is building', addressLine() === 'Підбираю адреси…');
  choose('Основні адреси');
  check('race: «Основні адреси» stops it at once', codeShown() === 'A1' && addressLine() !== 'Підбираю адреси…');
  tick(500);
  check('race: nothing jumps afterwards; the base stays, A1-0042 is the previous', codeShown() === 'A1' && seedOf(m, 1) === null && previousCode() === 'A1-0042', { code: codeShown(), seed: seedOf(m, 1) });
});

scenario('step 9 race: a submitted code, then another task before it builds', m => {
  click(q('.ng-rt-drawer-button'));
  openCode('A17-0042', 'enter-only');
  check('race: the code is building', q('.ng-rt-codefield-open').textContent === 'Відкриваю…');
  click(all('.ng-rt-task').find(b => b.textContent.includes('#2 ')));
  check('race: task 2 opens, the code stops', title().startsWith('#2 · A2 — ') && q('.ng-rt-codefield-open').textContent === 'Відкрити', title());
  tick(500);
  check('race: no jump back to task 17', title().startsWith('#2 · A2 — ') && seedOf(m, 17) === null && m.store.state.places.routing.taskId === tasks[1].id, title());
  check('race: the field keeps the code and says nothing', codeInput().value === 'A17-0042' && codeError().textContent === '');
  // The same through the store (the browser's back button, another screen): the result belongs to the instance it was asked from.
  openCode('A17-0042', 'enter-only');
  open(m, 3);
  tick(500);
  check('race: a navigation from outside the screen also wins', title().startsWith('#3') && seedOf(m, 17) === null, title());
  otherAddresses();
  const seed3 = seedOf(m, 3);
  choose('Інші адреси');
  click(variantButton('3'));
  tick(500);
  check('race: a variant switch stops «Інші адреси»', title().startsWith(`#3 · ${codeFor('3', seed3)} — `) && seedOf(m, 3) === seed3, { title: title(), seed: seedOf(m, 3), seed3 });
  choose('Інші адреси');
  choose('Попередні адреси:');
  tick(500);
  check('race: «Попередні адреси» stops it too', seedOf(m, 3) === null && codeShown() === 'A3b', { code: codeShown() });
  choose('Інші адреси');
  openCode('B1', 'enter-only');
  tick(500);
  check('race: a submitted code stops it, even a refused one', seedOf(m, 3) === null && codeError().textContent === codeSentences['unknown-letter']);
});

scenario('step 9: codes from a Ukrainian keyboard', m => {
  openCode('А3в—42');
  check('«А3в—42» (Cyrillic А and в, an em dash) opens A3b-0042', title().startsWith('#3b · A3b-0042 — ') && codeError().textContent === '', title());
  openCode('A3ж-42');
  check('«A3ж-42»: an unknown variant, not a bad seed', codeError().textContent === codeSentences['unknown-variant'], codeError().textContent);
});

scenario('step 9: a passing answer that isn’t the reference, shown and copied in the other syntax as submitted', m => {
  pref(m, 'mode', 'free');
  openCode('A1-0042');
  const task = generatedTask(1, 42), cisco = r => syntaxes.cisco.fromRoute(r, true);
  const [toB] = task.variant.referenceRoutes.R1, [toA] = task.variant.referenceRoutes.R2;
  const submission = { R1: [{ dst: '0.0.0.0', prefix: 0, via: toB.via }], R2: [{ dst: toA.dst, prefix: toA.prefix, via: toA.via }] };
  freeAdd('R1', cisco(submission.R1[0]));
  freeAdd('R2', cisco(submission.R2[0]));
  click(checkNet());
  tick(4 * SEC);
  check('non-reference: R1 by a default route passes', stripText().startsWith(SUCCESS), stripText());
  click(q('.ng-rt-other-toggle'));
  const command = r => syntaxes.routeros.command(r);
  const shown = all('.ng-rt-other-commands').map(pre => pre.textContent);
  check('non-reference: the MikroTik block shows the submitted routes', JSON.stringify(shown) === JSON.stringify([command(submission.R1[0]), command(submission.R2[0])]), shown);
  click(q('.ng-rt-other .ng-rt-copy'));
  check('non-reference: the copy payload is the submission, not the reference', copied.at(-1) === `# R1\n${command(submission.R1[0])}\n\n# R2\n${command(submission.R2[0])}` && !copied.at(-1).includes(command(toB)), copied.at(-1));
  check('non-reference: the reference’s own R1 route is nowhere in the block', !q('.ng-rt-other').textContent.includes(command(toB)));
});

scenario('step 9: the reveal on an instance nothing was done on', m => {
  pref(m, 'syntax', 'routeros');
  otherAddresses();
  const task = generatedTask(1, seedOf(m, 1));
  click(revealLink());
  const stored = m.store.state.instances[task.instanceKey];
  check('reveal: applied, and the reveal (assisted) is stored', Boolean(q('.ng-rt-commands')) && stored?.session.revealed === true && stored.session.assisted === true);
  choose('Попередні адреси:');
  choose('Попередні адреси:');
  check('reveal: A → B → A, still applied', Boolean(q('.ng-rt-commands')));
  click(q('.ng-rt-mine'));
  check('reveal: «Моя відповідь» is kept on the stored instance', !q('.ng-rt-commands') && m.store.state.instances[task.instanceKey].view.mine === true);
});

// ── 9. RF-1 «Знайди несправність» (round 3 brief v1 item 6; adapt and fix briefs v1) ──
// The entry, each check outcome, the cause question only after a passing fix
// (closed by an edit, or by a syntax switch showing a leftover draft), paths
// on demand and their announcement (internet pings too), hints (rung 2 from
// the pings on screen), the reveal, a syntax switch, read-only rows once
// solved, focus on another router's form error, drafts and marks across
// leaving and coming back, the «Умови» line, levels 1–3, and leaks with
// every witnessed combination forced (fast: one round each; --full: every
// level and both syntaxes). Instances come from the logic's own eligibility:
// every eligible variant at seed 0, its witnessed causes per level. A
// scenario forces one (variant, cause) by routing the screen's `create`
// through the tooling-only `inspect` (as VLAN-3's leak rounds do); the
// screen itself never sees a site or a code.
const { eligibleVariants, faults, inspectFault, levelCodes, faultsRecord, faultsBank } = await import('../../.test-bundles/harness/mounted.mjs');
const { faultsUi, faultText, faultCauseText, networkUi, t: copyOf, ui: routingUi } = await import('../../src/sections/routing/uk.js');
const { probeLabel } = await import('../../src/sections/routing/syntax/presentation.js');
const { network: ipNetwork } = await import('../../src/engine/ip.js');
const RF = 'routing-faults';
const BUILD = 100; // FaultsView builds a new instance after a 40 ms paint
const rfText = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const causeCodes = [...new Set(Object.values(levelCodes).flat())];
const rfLevels = Object.keys(levelCodes).map(Number).sort((a, b) => a - b).filter(level => eligibleVariants(faultsRecord, faultsBank, level).length);
const { full: rfFull } = await import('./sweep-mode.mjs');
// Instances per (level, seed, variant, cause), built once: the tests and the
// screen's forced `create` share them (each build analyses its network).
const rfInstances = new Map();
const rfInstance = params => {
  const key = JSON.stringify([params.level, params.seed, params.taskId, params.variantId, params.faultCode ?? null]);
  if (!rfInstances.has(key)) rfInstances.set(key, inspectFault(faultsRecord, { ...params, bank: faultsBank }));
  return rfInstances.get(key);
};
/** The witnessed combinations: every eligible variant at every level it
 * offers, with the causes accepted there. One analysis per variant (seed 0),
 * at its top level: the candidates are the same at its lower levels. */
const rfWitnesses = [...new Set(rfLevels.flatMap(level => eligibleVariants(faultsRecord, faultsBank, level).map(v => v.taskId)))].flatMap(taskId => {
  const v = rfLevels.flatMap(level => eligibleVariants(faultsRecord, faultsBank, level)).find(x => x.taskId === taskId);
  const top = Math.max(...v.levels.filter(l => rfLevels.includes(l)));
  const accepted = rfInstance({ level: top, seed: 0, taskId, variantId: v.variantId }).candidates.filter(c => c.accepted).map(c => c.site.code);
  return v.levels.filter(l => rfLevels.includes(l)).map(level => ({ level, taskId, variantId: v.variantId, top: level === top,
    codes: [...new Set(accepted.filter(code => levelCodes[level].includes(code)))] }));
}).filter(w => w.codes.length);
const rfInspect = (w, faultCode) => rfInstance({ level: w.level, seed: 0, taskId: w.taskId, variantId: w.variantId, faultCode });
/** The first witnessed (variant, cause) that `test` accepts, inspected. */
function rfFind(test) {
  for (const w of rfWitnesses) for (const code of w.codes) {
    const i = rfInspect(w, code);
    if (test(w, code, i)) return { w, code, i };
  }
  return null;
}
// The screen's create, forced to one (variant, cause) while `rfForce.current` says so.
const rfForce = { current: null };
const rfCreate = faults.create;
faults.create = (record, params) => (rfForce.current ? rfInstance({ ...params, ...rfForce.current }).task : rfCreate(record, params));
const seenRf = [];
const remember = () => { seenRf.push(document.body.textContent, ...all('[aria-label]').map(el => el.getAttribute('aria-label'))); };
/** Open «Знайди несправність» on a forced (variant, cause), as the switch and «Ще одна» store an instance. */
function openFaults(m, w, code) {
  rfForce.current = { taskId: w.taskId, variantId: w.variantId, faultCode: code };
  step(() => m.store.dispatch({ type: 'place', scope: RF, patch: { open: true, level: w.level, seed: 0 } }));
}
/** A scenario on the faults bank, unforced again afterwards. */
const rfScenario = (name, fn, options = {}) => { try { scenario(name, fn, { bank: faultsBank, reducedMotion: true, ...options }); } finally { rfForce.current = null; } };
const rfView = (m, task) => m.store.state.instances[task.instanceKey]?.view ?? {};
const settle = () => tick(200);
/** The verdict on screen: its badge and its words. */
// Round 4 (spec R2): the help panel's verdict (badge and words; «до змін» after an edit left out).
const statusText = () => rfText(q('.ng-rf-help .ng-help-summary') ?? q('.ng-rf-help .ng-help-mini')).replace(/ · до змін$/, '');
/** What the screen's one status (the panel's) holds now. */
const announced = () => rfText(q('[role="status"]'));
const againButton = () => q('.ng-rf-help .ng-help-next');
const pingsOf = (list = q('.ng-rf-pings')) => list?.querySelectorAll('.ng-rf-ping') ?? [];
const pingLabel = li => rfText(li.querySelector('.ng-rt-checkline-label'));
// Round 5 5b-2 (spec C): the pings name the internet «Інтернет (ISP)», the word of where they stop.
const labelsOf = (task, rows) => rows.map(r => probeLabel(task.network, r.from, r.to, { internet: rt5.internet }));
const rfCheckButton = () => q('.ng-rf-help .ng-help-check');
const rfCheck = () => { click(rfCheckButton()); settle(); };
const causeLabels = () => all('.ng-rf-cause').map(rfText);
const chooseCauseLabel = label => {
  const input = all('.ng-rf-cause').find(l => rfText(l) === label)?.querySelector('input');
  step(() => { input.checked = true; fire(input, 'click'); });
};
const drawn = () => all('.ng-path-line').length;
const routerButton = name => all('.ng-rt-router').find(b => b.textContent.trim() === name);
const showRouter = name => { if (routerButton(name).getAttribute('aria-pressed') !== 'true') click(routerButton(name)); };
const rowInputs = () => all('.ng-rf-rowlist li').map(li => li.querySelectorAll('input').map(i => i.value));
const hintButton = () => all('button').find(b => /^💡 Підказка/.test(rfText(b)));
const rowPrefix = li => li.querySelector('input').id.replace(/-(net|dst)$/, '');
/** Type a route into a row (by its field id prefix). */
function typeRoute(prefix, route, syntaxId = 'cisco') {
  for (const [name, value] of Object.entries(syntaxes[syntaxId].fromRoute(route, false))) { const input = q(`#${prefix}-${name}`); if (input) type(input, value); }
}
/** The fix the reveal would show, typed as a student would (tooling: the logic's solution of the same instance). */
function typeFix(i, syntaxId = 'cisco') {
  const { change } = faults.solution(i.task);
  showRouter(change.router);
  if (change.before === null) {
    click(q('.ng-rf-rows .ng-rt-add'));
    typeRoute(rowPrefix(all('.ng-rf-rowlist li').at(-1)), change.after, syntaxId);
  } else typeRoute(`rt-${change.before.id}`, change.after, syntaxId);
  return change;
}

scenario('RF: without the record', m => {
  check('RF: a bank without `faults` shows the task screen with no exercise switch', title().startsWith('#1 ') && !q('.ng-rt-exercises') && !q('.ng-rf'));
});

rfScenario('RF: the entry', m => {
  const radios = () => all('.ng-rt-exercises [role="radio"]');
  check('RF entry: the task screen ends its address row with the switch', radios().map(rfText).join('|') === `${faultsUi.exercises.tasks}|${faultsUi.exercises.faults}`
    && q('.ng-rt-taskbar').contains(q('.ng-rt-exercises')) && radios()[0].getAttribute('aria-checked') === 'true' && title().startsWith('#1 '), radios().map(rfText));
  remember();
  // The first seed is random; here seed 1 (an internet network), unforced.
  const random = Math.random;
  // Round 4 (2a): level 1 has two-router tasks only; seed 2 is task 2 (the internet), seed 1 task 1 (no internet).
  Math.random = () => 0.0002;
  try {
    click(radios()[1]);
    check('RF entry: the switch opens the exercise at once and says it is preparing; focus stays on the switch', Boolean(q('.ng-rf')) && !q('.ng-rf-cols')
      && rfText(q('.ng-rf-busy')) === faultsUi.preparing && document.activeElement === all('.ng-rt-exercises [role="radio"]')[1]);
    remember();
    tick(BUILD);
  } finally { Math.random = random; }
  const place = m.store.state.places[RF];
  const i = inspectFault(faultsRecord, { bank: faultsBank, level: place.level, seed: place.seed });
  const initial = faults.pingList(i.task);
  check('RF entry: then the instance, at the first level, on a seed the logic builds; focus still on the switch', Boolean(q('.ng-rf-cols')) && rfText(q('.ng-rf-busy')) === ''
    && place.open === true && place.level === rfLevels[0] && place.seed === 2 && document.activeElement?.getAttribute('aria-checked') === 'true', place);
  check('RF entry: the levels the logic offers (1–3), then one sentence', all('.ng-rf-levels [role="radio"]').map(rfText).join('|') === rfLevels.map(faultsUi.levelN).join('|')
    && rfLevels.join() === '1,2,3' && rfText(q('.ng-rf-task')) === faultText.instructions, all('.ng-rf-levels [role="radio"]').map(rfText));
  check('RF entry: an internet network\'s conditions on one «Умови» line, in the logic\'s words', i.task.requirements.length > 0 && i.task.probes.some(p => p.to === 'internet')
    && rfText(q('.ng-rf-req')) === `${faultsUi.requirementsLead} ${i.task.requirements.join(' ')}` && q('.ng-rf-req').previousSibling === q('.ng-rf-task')
    && !rfText(q('.ng-rf-req')).includes('..'), rfText(q('.ng-rf-req')));
  const failing = initial.rows.filter(r => !r.ok), passing = initial.rows.filter(r => r.ok);
  click(q('.ng-rf-fold'));
  check('RF entry: the pings are the start, labelled so: failing open, then the working ones folded, each in probe order, the internet named', rfText(q('.ng-rf-pings-caption')) === `${faultsUi.pings} · ${faultText.initial}`
    && pingsOf().map(pingLabel).join('|') === labelsOf(i.task, [...failing, ...passing]).join('|') && failing.length > 0 && passing.length > 0
    && pingsOf().filter(li => li.className.includes('is-fail')).every(li => rfText(li).includes(faultsUi.pingFailsWords) && (rfText(li).includes('зупинився на') || rfText(li).includes(`пішов не туди — в ${rt5.internet}`)))
    && pingsOf().every(li => !/зупинився на ISP|→ Інтернет$/.test(rfText(li)))
    && pingsOf().map(pingLabel).some(l => l.endsWith(`→ ${rt5.internet}`)), pingsOf().map(rfText));
  const first = i.task.network.devices.find(d => d.kind === 'router').id;
  check('RF entry: the first router\'s routes in the free mode\'s rows, as given', rfText(q('.ng-rf-rows-caption')) === faultsUi.routes(first)
    && JSON.stringify(rowInputs()) === JSON.stringify(i.task.initialRoutes[first].map(r => Object.values(syntaxes.cisco.fromRoute(r, false)).filter(v => v !== ''))), rowInputs());
  check('RF entry: nothing checked, drawn or asked yet; «Далі →» offered, secondary', !q('.ng-rf-causes') && statusText() === '' && drawn() === 0 && Boolean(againButton()) && !againButton().className.includes('primary'));
  remember();
  click(all('.ng-rt-exercises [role="radio"]')[0]);
  check('RF entry: back to the tasks, as they were; the instance is kept', title().startsWith('#1 ') && !q('.ng-rf') && m.store.state.places[RF].open === false
    && m.store.state.places[RF].seed === place.seed && document.activeElement?.getAttribute('aria-checked') === 'true');
  click(all('.ng-rt-exercises [role="radio"]')[1]);
  check('RF entry: and again the same instance, with nothing to build', m.store.state.places[RF].seed === place.seed && Boolean(q('.ng-rf-cols')) && rfText(q('.ng-rf-busy')) === '');
  // Level 3 on its switch: seed 0 is the analysed four-router network.
  Math.random = () => 0;
  try {
    click(all('.ng-rf-levels [role="radio"]').at(-1));
    check('RF entry: a level on its switch says it is preparing while the old instance stays', rfText(q('.ng-rf-busy')) === faultsUi.preparing && Boolean(q('.ng-rf-cols'))
      && q('.ng-rf-levels [aria-checked="true"]').textContent === faultsUi.levelN(rfLevels.at(-1)));
    tick(BUILD);
  } finally { Math.random = random; }
  const top = m.store.state.places[RF], nine = inspectFault(faultsRecord, { bank: faultsBank, level: top.level, seed: top.seed });
  check('RF entry: level 3 is the four-router network; focus stays on the level switch', top.level === rfLevels.at(-1) && top.seed === 0 && all('.ng-rt-router').length === 4
    && nine.task.network.devices.filter(d => d.kind === 'router').length === 4 && rfText(q('.ng-rf-req')).startsWith(faultsUi.requirementsLead)
    && document.activeElement?.closest('.ng-rf-levels') !== null && rfText(q('.ng-rf-busy')) === '', top);
});

const rfInternetPing = rfFind((w, code, i) => faults.pingList(i.task).rows.some(r => !r.ok && r.to === 'internet'));
check('RF paths: some witness fails a ping to the internet', Boolean(rfInternetPing), rfWitnesses.map(w => `${w.level}/${w.taskId}`));
// Round 5 5b-2 (spec C): a ping lost at the provider says so in the cloud's word, «Інтернет (ISP)».
{
  const ispStop = (task, r) => { const leg = r.request?.ok ? r.reply : r.request; return task.network.devices.find(d => d.id === leg?.stop?.deviceId)?.kind === 'isp'; };
  const found = rfFind((w, code, i) => faults.pingList(i.task).rows.some(r => !r.ok && ispStop(i.task, r)));
  check('5b-2 RF: a witnessed fault loses a ping at the provider', Boolean(found));
  if (found) rfScenario('5b-2 RF: a ping lost at the provider', m => {
    openFaults(m, found.w, found.code);
    tick(BUILD);
    const rows = faults.pingList(found.i.task).rows.filter(r => !r.ok);
    const lost = pingsOf().filter((li, n) => n < rows.length && ispStop(found.i.task, rows[n]));
    check('5b-2 RF: «✗ пішов не туди — в Інтернет (ISP)», never «зупинився на ISP»', lost.length > 0 && lost.every(li => rfText(li.querySelector('.ng-rt-checkline-state')).endsWith(`пішов не туди — в ${rt5.internet}`))
      && !rfText(q('.ng-rf-pings')).includes('зупинився на ISP'), pingsOf().map(rfText));
    // Repair v1 (Astra 1): the cloud, the walk and the hints use the same name.
    check('5b-2 RF: the cloud says «Інтернет (ISP)», never «Internet»', all('.ng-rf-stage svg text').some(t => t.textContent === rt5.internet)
      && !all('.ng-rf-stage svg text').some(t => /Internet/.test(t.textContent)), all('.ng-rf-stage svg text').map(t => t.textContent).slice(0, 8));
    click(lost[0].querySelector('button'));
    settle();
    const walk = rfText(q('.ng-rf-walk'));
    check('5b-2 RF: the walk names it «Інтернет (ISP)» too', walk.includes(rt5.internet) && !/\bISP\b(?! ?\))/.test(walk.replaceAll(rt5.internet, '')), walk);
    const hint = faults.hints(found.i.task, null, { snapshot: faults.pingList(found.i.task), rung: 1 })[0].text;
    const firstLost = ispStop(found.i.task, rows[0]);
    check('5b-2 RF: hint 1 names it «Інтернет (ISP)» where the first failing ping is lost there', !firstLost || (hint.includes(`не туди — в ${rt5.internet}`) && !/на ISP\b/.test(hint)), hint);
  });
}
rfScenario('RF: paths on demand', m => {
  const { w, code, i } = rfInternetPing;
  openFaults(m, w, code);
  const initial = faults.pingList(i.task);
  const rows = [...initial.rows.filter(r => !r.ok), ...initial.rows.filter(r => r.ok)];
  const at = rows.findIndex(r => !r.ok && r.to === 'internet'), row = rows[at];
  if (q('.ng-rf-fold')) click(q('.ng-rf-fold'));
  const before = said.length;
  click(pingsOf()[at].querySelector('button'));
  settle();
  // Round 4: the screen's one status is the help panel's; a tap is no check: its walk shows (in words) under the ping, focus stays on it.
  check('RF paths: a tap is not announced as a check; one status (the panel\'s); the walk in words under the ping, focus on the ping', said.length === before
    && all('[role="status"]').length === 1 && document.activeElement === pingsOf()[at].querySelector('button') && rfText(pingsOf()[at].querySelector('.ng-rf-walk')).length > 0, { said: said.slice(before) });
  click(pingsOf()[at].querySelector('button'));
  settle();
  check('RF paths: the same tap again draws it again (still pressed)', pingsOf()[at].querySelector('button').getAttribute('aria-pressed') === 'true' && drawn() > 0);
  check('RF paths: a tap draws a ping to the internet, its words under it, labelled with its snapshot', drawn() > 0
    && pingsOf()[at].querySelector('button').getAttribute('aria-pressed') === 'true' && pingLabel(pingsOf()[at]).endsWith(`→ ${rt5.internet}`)
    && rfText(q('.ng-rf-walk')) === faults.describeTrace(i.task, row, 'cisco').join('')
    && rfText(q('.ng-rf-stage .ng-rt-stage-head .ng-rt-caption')) === faultsUi.pathOf(labelsOf(i.task, [row])[0], faultText.initial)
    && Boolean(q('.ng-path-legend')) && !q('.ng-rf-note'), { drawn: drawn(), caption: rfText(q('.ng-rf-stage .ng-rt-caption')), walk: rfText(q('.ng-rf-walk')) });
  const working = pingsOf().find(li => li.className.includes('is-pass'));
  click(working.querySelector('button'));
  check('RF paths: another tap draws another ping (a working one arrives)', all('.ng-path-mark.is-ok').length > 0 && all('.ng-path-stop').length === 0
    && working.querySelector('button').getAttribute('aria-pressed') === 'true' && pingsOf()[at].querySelector('button').getAttribute('aria-pressed') === 'false');
  for (let n = 0; n < 3; n++) click(pingsOf()[at].querySelector('button'));
  const view = rfView(m, i.task);
  check('RF paths: as often as wanted: no check, no attempt, nothing stored by looking', drawn() > 0 && !view.rf && !view.checks && !m.store.state.instances[i.task.instanceKey]?.presses, view);
  remember();
});

rfScenario('RF: a path in motion', m => {
  const { w, code } = rfInternetPing;
  openFaults(m, w, code);
  const button = () => pingsOf()[0].querySelector('button');
  click(button());
  check('RF motion: a tap plays the ping (the envelope under way)', all('.ng-path-envelope').length === 1 && drawn() >= 1);
  click(button());
  check('RF motion: a tap again plays it again', all('.ng-path-envelope').length === 1 && button().getAttribute('aria-pressed') === 'true');
}, { reducedMotion: false });

// A destination fault whose network has a host: a /32 to it passes the ping but not the whole-prefix check.
const rfHostRoute = rfFind((w, code, i) => code === 'wrong-destination' && (() => {
  const { change } = faults.solution(i.task);
  return change.before && i.task.network.endpoints.some(e => e.kind === 'host' && ipNetwork(e.ip, change.after.prefix) === change.after.dst);
})());
check('RF check: some witness changes the destination of a LAN route', Boolean(rfHostRoute));
rfScenario('RF: each check outcome, and the cause after a passing fix', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  const { change } = faults.solution(i.task);
  showRouter(change.router);
  // A form error: its field marked, its words; the pings say the rows weren't applied.
  const net = q(`#rt-${change.before.id}-net`), was = net.value;
  type(net, '10.1');
  rfCheck();
  check('RF check: a form error is marked on its row, as in «Самостійно»', statusText() === `• Ще ні ${networkUi.formErrors}` && net.getAttribute('aria-invalid') === 'true'
    && rfText(q('.ng-rt-form-mark')) === copyOf('routing.static.invalid-ip'), statusText());
  check('RF check: the pings are the check\'s now («зараз»), and say what wasn\'t applied; the start is a tap away', all('.ng-rf-snaps [role="radio"]').map(rfText).join('|') === `${faultText.initial}|${faultsUi.snapsNow}`
    && q('.ng-rf-snaps [aria-checked="true"]').textContent === faultsUi.snapsNow && rfText(q('.ng-rf-note')) === faultsUi.notApplied && drawn() === 0);
  check('RF check: the form error\'s row is what the verdict is about (data-evidence)', all('[data-evidence="current"]').length === 1 && q('[data-evidence="current"]').contains(net));
  remember();
  type(net, was);
  check('RF check: an edit dims the verdict («до змін»); the mark goes with its text', q('.ng-rf-help [data-help-current]')?.hasAttribute('data-help-stale') && !q('.ng-rt-form-mark') && net.getAttribute('aria-invalid') !== 'true');
  // A failing fix (the table as given): the engine's stop, its path drawn.
  rfCheck();
  const given = faults.check(i.task, faults.initialAnswer(i.task));
  const stopRow = given.evidence.snapshot.rows.find(r => !r.ok);
  check('RF check: a failing fix says where the ping stops, in the engine\'s words', statusText() === `• Ще ні ${faults.feedback(i.task, given, 'cisco')}` && !q('.ng-rf-causes'), statusText());
  check('RF check: the status says the verdict once; the path the check draws isn\'t said again', announced() === `• Ще ні ${faults.feedback(i.task, given, 'cisco')}`, announced());
  check('RF check: the first failing ping is what the verdict is about (data-evidence)', all('[data-evidence="current"]').length === 1 && q('[data-evidence="current"]').className.includes('ng-rf-ping') && q('[data-evidence="current"]').className.includes('is-fail'));
  const pressed = pingsOf().find(li => li.querySelector('button').getAttribute('aria-pressed') === 'true');
  check('RF check: and draws that ping', drawn() > 0 && Boolean(pressed) && pingLabel(pressed) === probeLabel(i.task.network, stopRow.from, stopRow.to));
  // Every ping passes, but a whole-prefix check blocks (spec v2 A1): that one finding, in its existing words.
  const host = i.task.network.endpoints.find(e => e.kind === 'host' && ipNetwork(e.ip, change.after.prefix) === change.after.dst).ip;
  const hostRoutes = structuredClone(i.task.initialRoutes);
  hostRoutes[change.router] = hostRoutes[change.router].map(r => (r.id === change.before.id ? { ...r, dst: host, prefix: 32 } : r));
  const blocked = faults.check(i.task, { routes: hostRoutes, cause: null });
  type(net, host);
  type(q(`#rt-${change.before.id}-mask`), '255.255.255.255');
  rfCheck();
  check('RF check: pings pass but coverage blocks: that one finding, no cause question', blocked.evidence.snapshot.rows.every(r => r.ok) && !blocked.fixOk
    && statusText() === `• Ще ні ${faults.feedback(i.task, blocked, 'cisco')}` && pingsOf().length === 0 && !q('.ng-rf-causes') && drawn() === 0, statusText());
  check('RF check: a coverage-only failure has evidence: the implicated router\'s table (its heading)', all('[data-evidence="current"]').length === 1 && q('[data-evidence="current"]').className.includes('ng-rf-rows-head'));
  remember();
  typeRoute(`rt-${change.before.id}`, change.before);
  click(q('.ng-rf-snaps [role="radio"]'));
  check('RF check: «на початку» shows the start again', q('.ng-rf-snaps [aria-checked="true"]').textContent === faultText.initial
    && pingsOf().length === faults.pingList(i.task).rows.filter(r => !r.ok).length);
  // The fix: the cause question opens, in the logic's order, focused.
  typeFix(i);
  rfCheck();
  const fixed = { routes: faults.solution(i.task).routes, cause: null };
  const expected = faults.options(i.task, 'cause', { result: faults.check(i.task, fixed), answer: fixed }).map(o => o.label);
  check('RF cause: only a passing fix asks «Що було не так?», with the logic\'s options in order', rfText(q('.ng-rf-cause-q')) === faultText.cause
    && causeLabels().join('|') === expected.join('|') && expected.length >= 2 && expected.length <= 4 && statusText() === `✓ Так ${faultText.chooseCause}`, { causes: causeLabels(), expected });
  check('RF cause: focus moves to the question', document.activeElement?.className === 'ng-rf-radio');
  check('RF cause: the options carry no value in the DOM', all('.ng-rf-radio').every(r => !r.hasAttribute('value') && !causeCodes.some(c => r.outerHTML.includes(c))));
  remember();
  const row = all('.ng-rf-rowlist input')[0];
  type(row, `${row.value} `);
  check('RF cause: an edit after the passing fix closes the question', !q('.ng-rf-causes') && statusText() === '' && rfView(m, i.task).rf.step === 'fix');
  rfCheck();
  check('RF cause: the next passing check opens it again', causeLabels().join('|') === expected.join('|'));
  const right = faultCauseText[code], wrong = expected.find(l => l !== right);
  chooseCauseLabel(wrong);
  check('RF cause: a pick is shown chosen (a bar, not only the dot)', rfText(q('.ng-rf-cause.is-chosen')) === wrong);
  rfCheck();
  check('RF cause: another cause says so calmly and marks the instance assisted', statusText() === `• Ще ні ${faultText.otherCause}` && rfView(m, i.task).rf.assisted === true && Boolean(q('.ng-rf-causes')), statusText());
  remember();
  chooseCauseLabel(right);
  rfCheck();
  check('RF cause: the right one: done', statusText() === `✓ Так ${faultText.complete}` && rfView(m, i.task).rf.step === 'done' && rfView(m, i.task).solved === true
    && all('.ng-rf-radio').every(r => r.hasAttribute('disabled')), statusText());
  const solvedRows = rowInputs();
  type(all('.ng-rf-rowlist input')[0], '10.9');
  check('RF cause: solved, the rows are read-only: no «✕», no «+ Маршрут», an edit changes nothing', all('.ng-rf-rowlist input').every(el => el.hasAttribute('readonly'))
    && !q('.ng-rf-rowlist .ng-rt-delete') && !q('.ng-rf-rows .ng-rt-add') && rfView(m, i.task).rf.step === 'done' && statusText() === `✓ Так ${faultText.complete}`
    && JSON.stringify(rowInputs().map((r, n) => (n === 0 ? r.slice(1) : r))) === JSON.stringify(solvedRows.map((r, n) => (n === 0 ? r.slice(1) : r))), rfView(m, i.task).rf.step);
  check('RF cause: solved, the next action is «Ще одна»; no hints or reveal left', rfText(q('.ng-rf-help .ng-help-next.ng-button-primary')).startsWith(faultsUi.again) && !rfCheckButton()
    && !q('.ng-hints') && !all('button').some(b => rfText(b) === 'Показати відповідь') && rfView(m, i.task).rf.assisted === true);
  check('RF levels: the solved level shows the quiet ✓ (DoneMark: solved with no reveal before it); the others don\'t',
    Boolean(q('.ng-rf-levels [aria-checked="true"] .ng-done')) && all('.ng-rf-levels .ng-done').length === 1 && rfView(m, i.task).earned === true);
  remember();
  const before = m.store.state.places[RF];
  rfForce.current = null;
  click(againButton());
  check('RF «Далі»: it says it is preparing, on itself and beside the levels', rfText(againButton()) === faultsUi.preparing && rfText(q('.ng-rf-busy')) === faultsUi.preparing);
  const random = Math.random;
  Math.random = () => 0.0002;
  try { tick(BUILD); } finally { Math.random = random; }
  const after = m.store.state.places[RF];
  check('RF «Далі»: the next level the logic offers, a new instance, focus on its table\'s first field', after.level === rfLevels.find(l => l > before.level) && after.seed === 2
    && document.activeElement === q('.ng-rf-rowlist input') && !q('.ng-rf-causes') && statusText() === '' && !againButton().className.includes('primary') && Boolean(rfCheckButton()), { before, after });
});

// Astra 1: the cause is judged only on the proven routes as the fields show
// them. A draft left unfinished in one syntax reappears there: the question
// closes, and a check is the fix's again (both directions).
for (const [left, fixIn] of [['routeros', 'cisco'], ['cisco', 'routeros']]) {
  rfScenario(`RF cause: a draft left in ${syntaxes[left].label} closes the question there`, m => {
    const { w, code, i } = rfHostRoute;
    openFaults(m, w, code);
    const { change } = faults.solution(i.task);
    const [router, healthy] = Object.entries(i.task.initialRoutes).flatMap(([r, rows]) => rows.filter(x => x.id !== change.before.id).map(x => [r, x]))[0];
    pref(m, 'syntax', left);
    showRouter(router);
    type(q(`#rt-${healthy.id}-${left === 'cisco' ? 'net' : 'dst'}`), '10.9');
    pref(m, 'syntax', fixIn);
    typeFix(i, fixIn);
    rfCheck();
    check(`RF cause: fixed in ${syntaxes[fixIn].label}, the question opens`, causeLabels().length >= 2 && statusText() === `✓ Так ${faultText.chooseCause}`);
    pref(m, 'syntax', left);
    showRouter(router);
    check(`RF cause: in ${syntaxes[left].label} the unfinished draft is back, and the question is closed`, !q('.ng-rf-causes') && statusText() === ''
      && q(`#rt-${healthy.id}-${left === 'cisco' ? 'net' : 'dst'}`).value === '10.9' && rfView(m, i.task).rf.step === 'fix');
    rfCheck();
    check(`RF cause: a check there is the fix's again: the form error, never the cause`, statusText() === `• Ще ні ${networkUi.formErrors}` && !q('.ng-rf-causes')
      && rfView(m, i.task).rf.step === 'fix', statusText());
  });
}

rfScenario('RF: hint 2 reads the pings on screen and names them', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  typeFix(i);
  rfCheck();
  click(q('.ng-rf-snaps [role="radio"]'));
  click(hintButton());
  click(hintButton());
  const original = faults.pingList(i.task);
  const expected = faults.hints(i.task, faults.initialAnswer(i.task), { snapshot: original, rung: 2 })[1].text;
  const view = rfView(m, i.task);
  // Round 4 (2a): the stop evidence is rung 1, so the snapshot it read prefixes rung 1; rung 2 is the move.
  const rung1 = faults.hints(i.task, faults.initialAnswer(i.task), { snapshot: original, rung: 2 })[0].text;
  const rungs = all('[data-help="hint"]').map(rfText);
  check('RF hints: after a passing fix, with «на початку» shown, hint 1 reads those pings and says so; hint 2 is the move', rungs.includes(`Підказка 1 з 3. ${faultsUi.hintFrom(faultText.initial)}${rung1}`)
    && rungs.includes(`Підказка 2 з 3. ${expected}`) && original.rows.some(r => !r.ok), rungs);
  check('RF hints: the stored last check is still the check\'s', view.rf.snapshot.rows.every(r => r.ok) && view.rf.snapshot.label === faultText.checked && view.hintSnap === 'original');
  remember();
});

rfScenario('RF: a form error on another router takes focus (keyboard)', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  const [a, b] = Object.entries(i.task.initialRoutes).filter(([, rows]) => rows.length).map(([r]) => r);
  showRouter(a);
  const bad = q(`#rt-${i.task.initialRoutes[a][0].id}-net`);
  type(bad, '10.1');
  showRouter(b);
  const field = q(`#rt-${i.task.initialRoutes[b][0].id}-net`);
  step(() => { field.focus(); });
  step(() => { fire(field, 'keydown', { key: 'Enter' }); });
  settle();
  const focused = document.activeElement;
  const describedBy = focused?.getAttribute('aria-describedby') ?? '';
  check('RF keyboard: Enter in another router\'s field opens the router with the error and focuses its marked field', rfText(q('.ng-rf-rows-caption')) === faultsUi.routes(a)
    && focused?.id === `rt-${i.task.initialRoutes[a][0].id}-net` && focused.getAttribute('aria-invalid') === 'true', { focused: focused?.id, caption: rfText(q('.ng-rf-rows-caption')) });
  check('RF keyboard: its error is in its accessible description', describedBy.split(' ').some(id => id.endsWith('-mark') && rfText(document.getElementById(id)) === copyOf('routing.static.invalid-ip')), describedBy);  check('RF keyboard: the distant marked row is the one evidence', all('[data-evidence="current"]').length === 1 && q('[data-evidence="current"]').contains(focused));
});

// Astra recheck 2: a long table (rows added) with an early invalid row: the
// panel's board is the table, so it can anchor right after the flagged row;
// the pings follow the panel. (Mini-DOM has no layout: the gate checks the
// anchoring itself, state «form-long», at both sizes.)
rfScenario('RF: an early form error in a long table', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  const router = Object.entries(i.task.initialRoutes).find(([, rows]) => rows.length)[0];
  showRouter(router);
  for (let n = 0; n < 6; n++) click(q('.ng-rf-rows .ng-rt-add'));
  const first = q(`#rt-${i.task.initialRoutes[router][0].id}-net`);
  type(first, '10.1');
  rfCheck();
  const rows = all('.ng-rf-rowlist li');
  check('RF long table: rows added, the first one flagged; it alone is the evidence', rows.length >= 7 && all('[data-evidence="current"]').length === 1
    && rows[0].getAttribute('data-evidence') === 'current' && first.getAttribute('aria-invalid') === 'true', rows.length);
  const host = q('.ng-rf-help')?.parentNode;
  check('RF long table: the panel\'s board is the table (the panel sits right after it, or after the flagged row), the pings after the panel',
    host?.className?.startsWith('ng-help-host') && (q('.ng-rf-rows').nextSibling === host || rows[0].nextSibling === host)
    && (() => { const kids = [...host.parentNode.childNodes]; return kids.indexOf(host) < kids.indexOf(q('.ng-rf-pings')); })());
});

rfScenario('RF: drafts and marks survive leaving and coming back', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  // A form error on one row; an unfinished MikroTik draft on another.
  const [[router, marked], [otherRouter, drafted]] = Object.entries(i.task.initialRoutes).flatMap(([r, rows]) => rows.map(row => [r, row]));
  const markId = `rt-${marked.id}`, draftId = `rt-${drafted.id}`;
  showRouter(router);
  type(q(`#${markId}-net`), '10.1');
  rfCheck();
  pref(m, 'syntax', 'routeros');
  showRouter(otherRouter);
  type(q(`#${draftId}-gw`), '10.8');
  pref(m, 'syntax', 'cisco');
  click(all('.ng-rt-exercises [role="radio"]')[0]);
  click(all('.ng-rt-exercises [role="radio"]')[1]);
  showRouter(router);
  check('RF return: the marked text and its mark are as they were; the pings are still the check\'s', q(`#${markId}-net`).value === '10.1' && q(`#${markId}-net`).getAttribute('aria-invalid') === 'true'
    && rfText(q('.ng-rt-form-mark')) === copyOf('routing.static.invalid-ip') && q('.ng-rf-snaps [aria-checked="true"]').textContent === faultsUi.snapsNow);
  showRouter(otherRouter);
  check('RF return: the other syntax\'s unfinished draft is noted in Cisco', rfText(q('.ng-rt-convert-note')) === routingUi.shared.convertNote('MikroTik'));
  pref(m, 'syntax', 'routeros');
  check('RF return: and is there in MikroTik', q(`#${draftId}-gw`).value === '10.8');
});

// The internet condition (adapt brief item 1): with routes built from the
// public topology alone (tests/helpers/rf1-repairs.mjs, as the logic's own
// witness), every default narrowed to the sampled internet address keeps
// every ping but breaks the condition. The smallest such network is typed in.
const { sampledInternetOnly } = await import('./rf1-repairs.mjs');
const rfInternetCoverage = rfWitnesses.filter(w => w.codes.length).map(w => {
  const code = w.codes[0], i = rfInspect(w, code);
  if (!i.task.requirements.length) return null;
  const routes = sampledInternetOnly(i.task), result = faults.check(i.task, { routes, cause: null });
  return result.code === 'internet-coverage-missing' && result.evidence.snapshot.rows.every(r => r.ok) ? { w, code, i, routes, result } : null;
}).filter(Boolean).sort((a, b) => Object.values(a.routes).flat().length - Object.values(b.routes).flat().length)[0] ?? null;
check('RF internet: an internet network where narrowed defaults keep every ping but break the condition', Boolean(rfInternetCoverage));
rfScenario('RF: the internet condition, as one finding', m => {
  const { w, code, i, routes, result } = rfInternetCoverage;
  openFaults(m, w, code);
  for (const [router, rows] of Object.entries(routes)) {
    showRouter(router);
    while (all('.ng-rf-rowlist .ng-rt-delete').length) click(all('.ng-rf-rowlist .ng-rt-delete')[0]);
    for (const route of rows) {
      click(q('.ng-rf-rows .ng-rt-add'));
      typeRoute(rowPrefix(all('.ng-rf-rowlist li').at(-1)), route);
    }
  }
  rfCheck();
  const words = faults.feedback(i.task, result, 'cisco');
  check('RF internet: every ping passes; the condition fails: one finding, in the logic\'s words, no cause question', statusText() === `• Ще ні ${words}`
    && Object.keys(routes).some(router => words === faultText.internetFailure(router))
    && pingsOf().length === 0 && !q('.ng-rf-causes') && drawn() === 0 && rfText(q('.ng-rf-req')) === `${faultsUi.requirementsLead} ${i.task.requirements.join(' ')}`, { status: statusText(), words });
  remember();
});

rfScenario('RF: hints', m => {
  const found = rfFind((w, code) => code === 'default-wrong-way') ?? rfFind(() => true);
  const { w, code, i } = found;
  openFaults(m, w, code);
  // Round 4: the panel's rungs (the current one and the folded ones), in ladder order.
  const hintTexts = () => all('[data-help="hint"]').map(rfText).sort((a, b) => Number(a.match(/Підказка (\d)/)[1]) - Number(b.match(/Підказка (\d)/)[1]));
  click(hintButton());
  click(hintButton());
  const ladder = faults.hints(i.task, faults.initialAnswer(i.task), { rung: 2 });
  check('RF hints: rungs 1–2 in the logic\'s words: a question, then the observed stop; not assisted', code === 'default-wrong-way'
    && hintTexts().join('|') === ladder.map((h, n) => `Підказка ${n + 1} з 3. ${n === 0 ? faultsUi.hintFrom(faultText.initial) : ''}${h.text}`).join('|')
    && rfView(m, i.task).rf.assisted === false && !causeCodes.some(c => hintTexts().join(' ').includes(faultCauseText[c])), hintTexts());
  remember();
  click(hintButton());
  const example = faults.hints(i.task, faults.initialAnswer(i.task), { rung: 3, assisted: true })[2];
  check('RF hints: rung 3, the worked example, marks the instance assisted', hintTexts()[2] === `Підказка 3 з 3. ${example.text}` && rfView(m, i.task).rf.assisted === true, hintTexts());
});

rfScenario('RF: the reveal', m => {
  const { w, code, i } = rfFind((w, code) => code === 'missing-route');
  openFaults(m, w, code);
  check('RF reveal: nothing of it before the press', !q('.ng-rf-reveal') && !q('.ng-rf-change'));
  click(all('button').find(b => rfText(b) === 'Показати відповідь'));
  const reveal = () => q('.ng-rf-reveal');
  const solution = faults.solution(i.task), { change } = solution;
  check('RF reveal: the cause and the one changed route, before → after', rfText(q('.ng-rf-reveal-cause')) === `${faultsUi.revealCause}: ${faultCauseText[code]}.`
    && rfText(q('.ng-rf-reveal-head')) === faultsUi.revealChange(change.router)
    && rfText(q('.ng-rf-change-row.is-was dd')) === faultsUi.noRow
    && rfText(q('.ng-rf-change-row.is-now dd')) === syntaxes.cisco.command({ dst: change.after.dst, prefix: change.after.prefix, via: change.after.via }), rfText(reveal()));
  check('RF reveal: it marks the instance assisted; the hints go; «Ще одна» joins the check', rfView(m, i.task).rf.assisted === true && Boolean(rfView(m, i.task).rf.reveal)
    && !q('.ng-hints') && Boolean(rfCheckButton()) && Boolean(againButton()));
  // Round 4: the reveal is the cause and the change; the pings after the fix are the pings block's third choice.
  const snapRadio = label => all('.ng-rf-snaps [role="radio"]').find(b => rfText(b) === label);
  check('RF reveal: the original evidence stays: the start\'s failing pings, the first one the evidence', rfText(q('.ng-rf-snaps [aria-checked="true"]')) === faultText.initial
    && pingsOf().filter(li => li.className.includes('is-fail')).map(pingLabel).join('|') === labelsOf(i.task, solution.before.snapshot.rows.filter(r => !r.ok)).join('|')
    && q('[data-evidence="current"]')?.className.includes('ng-rf-ping'));
  click(pingsOf()[0].querySelector('button'));
  const failing = solution.before.snapshot.rows.find(r => !r.ok);
  check('RF reveal: a ping before the fix, drawn and labelled so', drawn() > 0
    && rfText(q('.ng-rf-stage .ng-rt-caption')) === faultsUi.pathOf(probeLabel(i.task.network, failing.from, failing.to), faultText.initial));
  click(snapRadio(faultsUi.sides.after));
  if (q('.ng-rf-pings .ng-rf-fold')?.getAttribute('aria-expanded') === 'false') click(q('.ng-rf-pings .ng-rf-fold'));
  click(pingsOf()[0].querySelector('button'));
  check('RF reveal: after the fix every ping works; its path arrives', rfText(q('.ng-rf-pings .ng-rf-fold')).endsWith(faultsUi.allPassingFold(solution.after.snapshot.rows.length))
    && all('.ng-path-stop').length === 0 && all('.ng-path-mark.is-ok').length > 0
    && rfText(q('.ng-rf-stage .ng-rt-caption')).endsWith(`· ${faultsUi.sides.after}`), rfText(q('.ng-rf-stage .ng-rt-caption')));
  remember();
});

rfScenario('RF: the reveal of a default', m => {
  const { w, code, i } = rfFind((w, code) => code === 'default-wrong-way');
  openFaults(m, w, code);
  click(all('button').find(b => rfText(b) === 'Показати відповідь'));
  const { change } = faults.solution(i.task);
  const command = r => syntaxes.cisco.command({ dst: r.dst, prefix: r.prefix, via: r.via });
  check('RF reveal: a default sent the wrong way: its route before → after', change.before?.prefix === 0 && rfText(q('.ng-rf-reveal-cause')) === `${faultsUi.revealCause}: ${faultCauseText[code]}.`
    && rfText(q('.ng-rf-change-row.is-was dd')) === command(change.before) && rfText(q('.ng-rf-change-row.is-now dd')) === command(change.after), rfText(q('.ng-rf-reveal')));
});

rfScenario('RF: a syntax switch', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  const first = i.task.network.devices.find(d => d.kind === 'router').id, row = i.task.initialRoutes[first][0], id = `rt-${row.id}`;
  pref(m, 'syntax', 'routeros');
  check('RF syntax: MikroTik shows the same routes in its own fields', q(`#${id}-dst`)?.value === `${row.dst}/${row.prefix}` && q(`#${id}-gw`).value === row.via && !q(`#${id}-net`));
  type(q(`#${id}-dst`), '10.9');
  pref(m, 'syntax', 'cisco');
  check('RF syntax: unfinished MikroTik text: Cisco keeps the route and says so', q(`#${id}-net`).value === row.dst && rfText(q('.ng-rt-convert-note')) === routingUi.shared.convertNote('MikroTik'));
  type(q(`#${id}-net`), '10.1');
  rfCheck();
  pref(m, 'syntax', 'routeros');
  check('RF syntax: a form mark belongs to the syntax it was made in', !all('.ng-rf-rowlist [aria-invalid="true"]').length && !q('.ng-rt-form-mark'));
  pref(m, 'syntax', 'cisco');
  type(q(`#${id}-net`), row.dst);
  typeFix(i);
  rfCheck();
  const causes = causeLabels();
  // Leaving and coming back rebuilds the task: the passing fix's proof is rechecked, never restored.
  click(all('.ng-rt-exercises [role="radio"]')[0]);
  click(all('.ng-rt-exercises [role="radio"]')[1]);
  check('RF cause: back from the tasks, the question is still open on the same routes', causeLabels().join('|') === causes.join('|') && causes.length >= 2);
  pref(m, 'syntax', 'routeros');
  check('RF syntax: the cause question stays open across a switch', causeLabels().join('|') === causes.join('|') && causes.length >= 2);
  chooseCauseLabel(faultCauseText[code]);
  rfCheck();
  check('RF syntax: and is answered in MikroTik', statusText() === `✓ Так ${faultText.complete}`, statusText());
});

rfScenario('RF: rows added and deleted; no conditions, no line', m => {
  const plain = rfWitnesses.find(w => w.codes.length && !rfInspect(w, w.codes[0]).task.requirements.length);
  openFaults(m, plain, plain.codes[0]);
  check('RF requirements: a network without conditions has no «Умови» line', !q('.ng-rf-req'));
  const rows = () => all('.ng-rf-rowlist li').length;
  const count = rows();
  click(q('.ng-rf-rows .ng-rt-add'));
  check('RF rows: «+ Маршрут» adds an empty row with a neutral id, focused', rows() === count + 1 && document.activeElement?.id === 'rt-new-1-net' && document.activeElement.value === '');
  while (all('.ng-rf-rowlist .ng-rt-delete').length) click(all('.ng-rf-rowlist .ng-rt-delete')[0]);
  check('RF rows: with none left, the panel says how to add one', rfText(q('.ng-rf-rows .ng-rt-note')) === faultsUi.noRows);
  remember();
});

// Leaks (spec §6, A4): with each witnessed cause forced, nothing names the
// fault before the reveal: not the code (text, attributes, classes, values,
// accessible names), not a cause (outside a passing fix's question), not the
// original route (as a command or a row), not a reference field; the faulty
// row looks like the others.
const FORBIDDEN = ['referenceRoutes', 'scaffold', 'baseline', 'faultCode', 'siteKey', 'canonicalFix', 'originalRoute'];
/** `parts`: the elements to scan (a ping tap changes only its row, the
 * diagram's caption and the status); the whole screen by default. */
function rfLeaks(m, original, parts = [m.container]) {
  const roots = parts.filter(Boolean), found = [];
  const html = roots.map(el => el.outerHTML).join('\n'), text = roots.map(el => el.textContent).join('\n');
  const inside = selector => roots.flatMap(el => [...(el.matches?.(selector) ? [el] : []), ...el.querySelectorAll(selector)]);
  const values = inside('input').map(el => String(el.value ?? '')).join('\n');
  const aria = inside('[aria-label]').map(el => el.getAttribute('aria-label')).join('\n');
  for (const code of causeCodes) {
    if (html.includes(code) || values.includes(code) || aria.includes(code)) found.push(`code ${code}`);
    if (html.includes(faultCauseText[code]) || aria.includes(faultCauseText[code])) found.push(`cause «${faultCauseText[code]}»`);
  }
  for (const key of FORBIDDEN) if (html.includes(key)) found.push(`field ${key}`);
  for (const syntax of Object.values(syntaxes)) {
    const command = syntax.command({ dst: original.dst, prefix: original.prefix, via: original.via });
    if (text.includes(command) || values.includes(command)) found.push(`command ${command}`);
  }
  if (parts[0] !== m.container) return found;
  for (const li of all('.ng-rf-rowlist li')) {
    const typed = Object.fromEntries(li.querySelectorAll('input').map(el => [el.id.split('-').at(-1), el.value]));
    const route = syntaxes.cisco.toRoute(typed) ?? syntaxes.routeros.toRoute(typed);
    if (route && route.dst === original.dst && route.prefix === original.prefix && route.via === original.via) found.push('the original route as a row');
  }
  const rowClasses = new Set(all('.ng-rf-rowlist li').map(li => li.className));
  if (rowClasses.size > 1) found.push(`rows differ: ${[...rowClasses].join(' / ')}`);
  if (all('.ng-rf-rowlist input').some(el => !/^rt-route-\d+-\d+-(net|mask|gw|dst|dist)$/.test(el.id))) found.push('a row id that isn\'t neutral');
  return found;
}
rfScenario('RF leaks: the gate finds what it looks for', m => {
  const { w, code, i } = rfHostRoute;
  openFaults(m, w, code);
  const original = faults.solution(i.task).change.after;
  const clean = rfLeaks(m, original).length;
  const planted = [
    el => el.setAttribute('data-fault', 'default-wrong-way'),
    el => el.setAttribute('aria-label', faultCauseText['missing-route']),
    el => { el.textContent = syntaxes.routeros.command(original); },
    el => el.setAttribute('class', 'is-baseline-row'),
  ];
  const caught = planted.map(plant => {
    const el = document.createElement('span');
    m.container.appendChild(el);
    plant(el);
    const found = rfLeaks(m, original).length > clean;
    el.parentNode.removeChild(el);
    return found;
  });
  check('RF leaks: positive controls (a code in an attribute, a cause in a name, the original route as text, a reference field in a class)', clean === 0 && caught.every(Boolean), { clean, caught });
});
// Fast: one round per witnessed combination, each variant at its top level
// with each cause witnessed there (then any (level, cause) still unforced, on
// the first variant witnessing it). Full (--full): every witnessed level of
// every variant, and the rows in MikroTik too.
const rfRounds = rfWitnesses.filter(w => rfFull || w.top).flatMap(w => w.codes.map(code => ({ w, code })));
for (const w of rfWitnesses) for (const code of w.codes) if (!rfRounds.some(r => r.w.level === w.level && r.code === code)) rfRounds.push({ w, code });
for (const { w, code } of rfRounds) {
  rfScenario(`RF leaks: level ${w.level}, ${w.taskId}, ${code}`, m => {
    const i = rfInspect(w, code), original = faults.solution(i.task).change.after;
    openFaults(m, w, code);
    const found = [];
    const routers = i.task.network.devices.filter(d => d.kind === 'router').map(d => d.id);
    const everyRouter = () => { for (const r of routers) { clickOnly(routerButton(r)); found.push(...rfLeaks(m, original)); } };
    everyRouter();
    // The ping order is the probes' order, failing first, whatever the fault.
    if (q('.ng-rf-fold')) clickOnly(q('.ng-rf-fold'));
    const rows = faults.pingList(i.task).rows;
    if (pingsOf().map(pingLabel).join('|') !== labelsOf(i.task, [...rows.filter(r => !r.ok), ...rows.filter(r => r.ok)]).join('|')) found.push('ping order');
    // Each tap changes its row, the diagram's caption and the status (it says the path): those are scanned.
    for (const li of pingsOf()) {
      clickOnly(li.querySelector('button'));
      found.push(...rfLeaks(m, original, [li, q('.ng-rf-stage .ng-rt-stage-head'), q('[role="status"]')]));
    }
    clickOnly(hintButton()); clickOnly(hintButton());
    found.push(...rfLeaks(m, original));
    rfCheck();
    everyRouter();
    if (rfFull) { pref(m, 'syntax', 'routeros'); everyRouter(); pref(m, 'syntax', 'cisco'); }
    clickOnly(q('.ng-te-button'));
    found.push(...rfLeaks(m, original));
    clickOnly(q('.ng-te-button'));
    const view = rfView(m, i.task);
    if (view.rf?.reveal || view.rf?.hintRung !== 2 || view.rf?.assisted) found.push('assisted or revealed');
    check(`RF leaks level ${w.level}, ${w.taskId}, ${code}: nothing names the fault before the reveal (every router, every ping, hints 1–2, a failing check, «Текстом»)`, found.length === 0, [...new Set(found)].slice(0, 6));
  });
}
check('RF leaks: every cause the logic witnesses was forced at every level, every variant at its top level, default-wrong-way included',
  rfWitnesses.every(w => w.codes.every(code => rfRounds.some(r => r.w.level === w.level && r.code === code)))
  && rfWitnesses.filter(w => w.top).every(w => w.codes.every(code => rfRounds.some(r => r.w === w && r.code === code)))
  && rfRounds.some(r => r.code === 'default-wrong-way') && new Set(rfRounds.map(r => r.w.taskId)).size === new Set(rfWitnesses.map(w => w.taskId)).size,
  rfRounds.map(r => `${r.w.level}/${r.w.taskId}/${r.code}`));
faults.create = rfCreate;

// The screen's own words were all on screen somewhere above (the ones built
// from values, such as «ще N працюють» or «Шлях: …», are checked exactly in
// their scenarios).
{
  const seen = seenRf.join('\n');
  const words = [faultsUi.exercises.tasks, faultsUi.exercises.faults, faultsUi.exercise, faultsUi.level, ...rfLevels.map(faultsUi.levelN), faultsUi.again, faultsUi.pings,
    faultsUi.snapshots, faultsUi.pick, faultsUi.pingFailsWords, faultsUi.snapsNow, faultsUi.original, faultsUi.notApplied, faultsUi.otherRouters, faultsUi.noRows, faultsUi.check,
    faultsUi.revealCause, faultsUi.was, faultsUi.sides.after,
    faultsUi.routes('R1'), faultsUi.preparing, faultsUi.requirementsLead];
  const missing = words.filter(w => !seen.includes(w));
  check('RF strings: every screen string was shown', missing.length === 0, missing);
}

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
