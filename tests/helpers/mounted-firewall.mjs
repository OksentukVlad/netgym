// Mounted lifecycle scenarios for the firewall screen (FW-1 screen spec §8,
// v2 S2, S3, S5 e, g): the real FirewallScreen in the app store, mounted
// with react-dom/client in tests/helpers/mini-dom.mjs, with node:test's
// mocked setTimeout and setInterval. Run in its own process by
// tests/firewall-mounted.test.mjs. Prints one JSON line: { results }.
import { mock } from 'node:test';
import { installDom } from './mini-dom.mjs';

const { document, fire, setReducedMotion } = installDom();
mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
// The timers still pending (timeouts and intervals): a walk that ends or is
// cancelled leaves none behind.
const pending = new Set();
const mocked = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
globalThis.setTimeout = (fn, ms, ...args) => { const handle = mocked.setTimeout(() => { pending.delete(handle); fn(...args); }, ms); pending.add(handle); return handle; };
globalThis.clearTimeout = handle => { pending.delete(handle); mocked.clearTimeout(handle); };
globalThis.setInterval = (fn, ms, ...args) => { const handle = mocked.setInterval(fn, ms, ...args); pending.add(handle); return handle; };
globalThis.clearInterval = handle => { pending.delete(handle); mocked.clearInterval(handle); };
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const { act, mountFirewall, fw, record, combined } = await import('../../.test-bundles/harness/mounted-firewall.mjs');
const { ui: fwUi, t: fwT, predictStep: fwStep } = await import('../../src/sections/firewall/uk.js');
const { region } = await import('./firewall-screen.mjs');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

// Count every call of the reference solution (the reveal path's and useExercise's).
const realSolution = fw.solution;
let solutionCalls = 0;
fw.solution = (...args) => { solutionCalls += 1; return realSolution(...args); };

const step = fn => act(fn);
const q = selector => document.querySelector(selector);
const all = selector => document.querySelectorAll(selector);
const click = el => { step(() => { fire(el, 'pointerdown'); }); step(() => { fire(el, 'mousedown'); el.focus(); }); step(() => { fire(el, 'click'); }); };
/** A click alone, with no pointer or key press before it (as assistive technology sends it). */
const clickOnly = el => step(() => { fire(el, 'click'); });
/** Show a card through the store, as navigation without a press would. */
const showCard = (m, position) => step(() => m.store.dispatch({ type: 'instance', key: m.probe.key, action: { type: 'view', patch: { position } } }));
const key = (el, k) => { let event; step(() => { event = fire(el, 'keydown', { key: k }); }); return event; };
const tick = ms => { for (let t = 0; t < ms; t += 50) step(() => { mock.timers.tick(Math.min(50, ms - t)); }); };
const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const walk = () => q('.ng-fw')?.getAttribute('data-walk') ?? null;
// Round 4 (spec A1, F1): the help panel's buttons.
const check2 = () => q('.ng-fw .ng-help-check');
const cont = () => q('.ng-fw .ng-help-continue');
const nextB = () => q('.ng-fw .ng-help-next');
const revealLink = () => q('.ng-fw .ng-help-reveal-link');
const hintB = () => q('.ng-fw .ng-help-hint-button');
// Level 2: «input — до самого роутера»; level 1 (round 5): «самому роутеру → input».
const door = hook => all('.ng-fw-door-option').find(b => text(b).startsWith(`${hook} `) || text(b).endsWith(`→ ${hook}`));
const row = i => all('.ng-fw-row')[i];
/** The words a walk's end adds with the verdict (outside its live region). */
const after = () => text(q('.ng-fw-after'));
const status = () => text(q('.ng-fw [role="status"]'));
/** The round's end line, in the progress area (round 5 repair). */
const roundLine = () => text(q('.ng-fw-progress .ng-fw-round'));
const placeOf = m => m.store.state.places.firewall;
const instance = m => m.store.state.instances[m.probe.key];
const viewOf = m => instance(m)?.view ?? {};
/** A label carries the quiet ✓ (DoneMark: «розв’язано»). */
const done = el => /розв’язано/.test(el?.textContent ?? '');
const ruleSets = () => all('.ng-fw-variants').find(g => !g.className.includes('ng-fw-levels')) ?? null;
const variantDone = () => done(ruleSets()?.querySelectorAll('[role="radio"]')[0]);
const levelDone = n => done(q('.ng-fw-levels').querySelectorAll('[role="radio"]')[n - 1]);
const SEEDS = { basic: 7, disabled: 3, 'drop-above': 5, chain: 1 };
/** The table rows of a chain as the rule step shows them (its rules, then its end). */
const chainIds = (task, hook) => [...task.policy.rules.filter(r => r.chain === hook).map(r => r.id), `chain-end:${hook}`];

/** Mount with a known round at level 2 (or 1): the variant and every variant's seed. */
function mount(variantId = 'basic', level = 2) {
  const m = mountFirewall();
  step(() => m.store.dispatch({ type: 'place', scope: 'firewall', patch: { level, variantId, seeds: { ...SEEDS } } }));
  return m;
}
/** The round on screen, as the logic creates it. */
const taskOf = m => { const p = placeOf(m); const v = p.level === 1 ? 'chain' : p.variantId; return fw.create(combined, { variantId: v, seed: p.seeds[v], level: p.level === 1 ? 1 : 2 }); };
/** Choose the chain and a row like a student, then «Перевірити» (level 2: the chain is checked at once). */
function answer(m, selection) {
  click(door(selection.hook));
  if (selection.decidedBy !== undefined) click(row(chainIds(taskOf(m), selection.hook).indexOf(selection.decidedBy)));
  click(check2());
}
const rightAnswer = (m, position) => { const task = taskOf(m); const calls = solutionCalls; const s = realSolution(task)[task.cards[position].id]; solutionCalls = calls; return s; };
/** A wrong answer the UI allows: the right chain, a rule that can't decide (input: its end, after «drop the rest»; forward: FastTrack). */
const wrongAnswer = (m, position) => {
  const s = rightAnswer(m, position);
  return { hook: s.hook, decidedBy: s.hook === 'input' ? 'chain-end:input' : taskOf(m).policy.rules.find(r => r.action === 'fasttrack-connection').id };
};
/** Level 1's owner line and FactLink words for a card view, as the screen builds them (uk.js predictStep). */
const roleOf = (task, ip) => task.topology.hosts.find(h => h.address === ip)?.role;
const ifaceOf = (task, ip) => task.topology.router.interfaces.find(i => i.address === ip)?.id;
const ownerLine = (task, v) => fwStep.owner({ ip: v.to.ip, kind: v.owner.kind, role: roleOf(task, v.to.ip), iface: ifaceOf(task, v.to.ip) });
const saidLine = (task, v) => fwStep.said({ ip: v.to.ip, kind: v.owner.kind, role: roleOf(task, v.to.ip), iface: ifaceOf(task, v.to.ip) });
/** The parts that must not change for a card before its commitment (S5 e). */
function surfaces() {
  const html = q('.ng-fw').outerHTML;
  return ['class="ng-fw-card"', 'class="ng-fw-doors"', 'class="ng-fw-rules"', 'class="ng-fw-svg"', 'class="ng-help"'].map(marker => region(html, marker));
}
function scenario(name, fn, { reduced = false, level = 2, variantId = 'basic' } = {}) {
  setReducedMotion(reduced);
  const m = mount(variantId, level);
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
  check(`${name}: unmounting leaves no timer behind`, pending.size === 0, { pending: pending.size });
  setReducedMotion(false);
}

// ── 1. The commit flow at level 2: the chain at once, then the rule ──
scenario('commit flow', m => {
  check('commit flow: step 1 has no «Перевірити»: the two chain buttons are the action', check2() === null && all('.ng-fw-door-option').length === 2 && q('.ng-fw-rules') === null);
  const s = rightAnswer(m, 0), id = taskOf(m).cards[0].id;
  const other = s.hook === 'input' ? 'forward' : 'input';
  click(door(other));
  check('commit flow: a wrong chain is not committed', !viewOf(m).commit && walk() === null);
  check('commit flow: it says why in one sentence, in the panel', status() === `• Ще ні ${fwT(`hook-retry-${s.hook}`)}`, status());
  check('commit flow: it is help: the session is assisted, no check and no hint counted', instance(m).session.assisted && instance(m).presses === 0 && instance(m).session.hintIndex === 0);
  check('commit flow: the chain stays open to pick again, no rule step yet', !q('.ng-fw-doors [role="radiogroup"]').hasAttribute('aria-readonly') && q('.ng-fw-rules') === null);
  click(door(s.hook));
  check('commit flow: the right chain opens the rule step, the chain locked', q('.ng-fw-rules') !== null && q('.ng-fw-doors [role="radiogroup"]').getAttribute('aria-readonly') === 'true');
  check('commit flow: focus moves to the rule step\'s first choice', document.activeElement === row(0), document.activeElement?.className);
  check('commit flow: only that chain\'s rows, the other folded into one line', all('.ng-fw-row').length === chainIds(taskOf(m), s.hook).length && /цей пакет їх не бачить/.test(text(q('.ng-fw-folded'))));
  check('commit flow: the chain\'s words', status() === `✓ Так ${fwT('hook-ok')}`, status());
  check('commit flow: the accepted chain is in the store', viewOf(m).drafts?.[id]?.hook === s.hook);
  check('commit flow: «Перевірити» disabled until a rule', check2()?.getAttribute('aria-disabled') === 'true');
  click(check2());
  check('commit flow: pressing it then commits nothing', !viewOf(m).commit && walk() === null);
  click(row(chainIds(taskOf(m), s.hook).indexOf(s.decidedBy)));
  check('commit flow: enabled with a rule', !check2().hasAttribute('aria-disabled'));
  click(check2());
  check('commit flow: the card is committed in the store', Boolean(viewOf(m).commit?.answer?.[id]));
  check('commit flow: the walk plays', walk() === 'playing', walk());
  check('commit flow: «Перевірити» goes; «Наступний пакет →» is primary and has the focus', check2() === null && text(cont()) === 'Наступний пакет →' && cont().className.includes('ng-button-primary') && document.activeElement === cont(), document.activeElement?.className);
  check('commit flow: «Далі →» beside it is a quiet skip that says where it goes', nextB() !== null && !nextB().className.includes('ng-button-primary') && /новий раунд/.test(nextB().textContent));
  check('commit flow: the session records one check', instance(m).presses === 1 && instance(m).session.attempts === 1);
  check('commit flow: the choices lock (aria-readonly)', all('[role="radiogroup"][aria-readonly="true"]').filter(g => g.closest('.ng-fw-work')).length === 2);
  tick(300);
  check('commit flow: the feedback says ✓', /✓ Так/.test(status()), status());
  tick(4500);
  check('commit flow: the walk ends', walk() === 'done', walk());
  check('commit flow: no timer runs after the walk', pending.size === 0, { pending: pending.size });
  check('commit flow: the dot shows ✓', all('.ng-fw-dot')[0].getAttribute('aria-label') === 'Пакет 1: правильно');
  check('commit flow: the deciding row is the panel\'s evidence', q('.ng-fw-row[data-evidence="current"]') !== null && q('.ng-fw-row[data-evidence="current"]').className.includes('is-match') || q('.ng-fw-row[data-evidence="current"]')?.className.includes('is-end'));
});

// ── 1b. A chain draft survives navigation (restore) ──
scenario('chain restore', m => {
  const s = rightAnswer(m, 0);
  click(door(s.hook === 'input' ? 'forward' : 'input'));
  m.remount();
  check('chain restore: after a wrong chain and a remount, still uncommitted, the chain open, its words there', !viewOf(m).commit && q('.ng-fw-rules') === null && status().endsWith(fwT(`hook-retry-${s.hook}`)) && !q('.ng-fw-doors [role="radiogroup"]').hasAttribute('aria-readonly'), status());
  click(door(s.hook));
  click(row(0));
  m.remount();
  check('chain restore: an accepted chain and a rule survive a remount', q('.ng-fw-rules') !== null && row(0).getAttribute('aria-checked') === 'true' && q('.ng-fw-doors [role="radiogroup"]').getAttribute('aria-readonly') === 'true');
});

// ── 2. Keyboard: arrows move the choice in each group ──
scenario('keyboard', m => {
  const doors = all('.ng-fw-door-option');
  doors[0].focus();
  key(doors[0], 'ArrowRight');
  check('keyboard: level 1: the arrow chooses the other chain and moves focus', doors[1].getAttribute('aria-checked') === 'true' && document.activeElement === doors[1]);
}, { level: 1 });
scenario('keyboard rules', m => {
  const s = rightAnswer(m, 0);
  click(door(s.hook));
  row(0).focus();
  key(row(0), 'ArrowDown');
  key(row(1), 'ArrowDown');
  check('keyboard: arrows move the rule choice down the chain\'s rows', row(2).getAttribute('aria-checked') === 'true' && document.activeElement === row(2));
  const last = all('.ng-fw-row').length - 1;
  key(row(2), 'End');
  check('keyboard: End reaches the chain\'s end row', row(last).getAttribute('aria-checked') === 'true' && /кінець списку/.test(text(row(last))));
});

// ── 3. A press skips the walk without blocking the press ──
scenario('skip', m => {
  answer(m, wrongAnswer(m, 0));
  tick(400);
  check('skip: playing', walk() === 'playing');
  const event = key(q('.ng-fw-dot'), 'Tab');
  check('skip: a key press ends the walk at once', walk() === 'done' && pending.size <= 1, { walk: walk(), pending: pending.size });
  check('skip: the press itself goes on (not prevented)', event.defaultPrevented === false);
  tick(300);
  check('skip: the wrong commit is information, not «Ще ні»', /✗ Фільтр вирішив інакше\./.test(status()) && !/Ще ні/.test(status()), status());
  check('skip: the dot shows ✗', all('.ng-fw-dot')[0].getAttribute('aria-label') === 'Пакет 1: фільтр вирішив інакше');
});

// ── 4. A walk plays only on a fresh commit ──
scenario('no replay', m => {
  answer(m, rightAnswer(m, 0));
  tick(5000);
  click(cont());
  check('no replay: «Наступний пакет →» shows card 2 without a walk, focus on the card', viewOf(m).position === 1 && walk() === null && document.activeElement === q('.ng-fw-card'));
  check('no replay: card 2 starts at the chain step, its panel empty', q('.ng-fw-rules') === null && status() === '' && check2() === null);
  click(all('.ng-fw-dot')[0]);
  check('no replay: back on card 1 by its dot, the end frame, no walk', viewOf(m).position === 0 && walk() === 'done' && pending.size === 0, { walk: walk(), pending: pending.size });
  m.remount();
  check('no replay: after a remount, still the end frame', walk() === 'done' && pending.size === 0 && viewOf(m).position === 0);
  tick(6000);
  check('no replay: nothing starts later', walk() === 'done');
  clickOnly(q('.ng-fw-replay'));
  tick(300);
  check('no replay: «Показати ще раз» plays it', walk() === 'playing');
  showCard(m, 1);
  check('no replay: navigation during a walk cancels it (no timer left)', walk() === null && pending.size === 0, { walk: walk(), pending: pending.size });
  showCard(m, 0);
  check('no replay: and coming back shows the end frame', walk() === 'done' && pending.size === 0, { walk: walk(), pending: pending.size });
  showCard(m, 1);
  answer(m, wrongAnswer(m, 1));
  tick(500);
  check('no replay: card 2 plays', walk() === 'playing');
  m.remount();
  check('no replay: a remount mid-walk shows the end frame, with no timer left', walk() === 'done' && pending.size === 0, { walk: walk(), pending: pending.size });
});

// ── 5. Reveal: per card, marks assistance, the reference read only here ──
scenario('reveal', m => {
  const before = solutionCalls;
  answer(m, wrongAnswer(m, 0));
  tick(5000);
  check('reveal: a committed card offers no reveal', revealLink() === null);
  click(cont());
  check('reveal: before it, useExercise\'s solution is null and no solution() was called', m.probe.solution === null && solutionCalls === before, { calls: solutionCalls - before });
  click(revealLink());
  check('reveal: it marks the session revealed and assisted', instance(m).session.revealed && instance(m).session.assisted);
  check('reveal: only this card is in the revealed list', JSON.stringify(viewOf(m).revealed) === JSON.stringify([taskOf(m).cards[1].id]));
  check('reveal: the card locks and its walk plays', Boolean(viewOf(m).commit.answer[taskOf(m).cards[1].id]) && walk() === 'playing');
  check('reveal: focus goes to the applied line (A1)', document.activeElement === q('.ng-help-applied-text'), document.activeElement?.className);
  check('reveal: the board is marked «показано», not a solve', q('.ng-fw-work[data-revealed]') !== null && /показано/.test(text(q('.ng-fw-shown'))) && !/твій вибір/.test(text(q('.ng-fw-rules'))));
  tick(5000);
  check('reveal: the dot shows 👁', all('.ng-fw-dot')[1].getAttribute('aria-label') === 'Пакет 2: показано відповідь' && text(all('.ng-fw-dot')[1]) === '👁');
  check('reveal: the panel says so, in one line', status() === fwUi.appliedPlain, status());
  check('reveal: the other cards are not committed', Object.keys(viewOf(m).commit.answer).length === 2);
  const task = taskOf(m);
  for (let i = 2; i < task.cards.length; i++) { click(cont()); answer(m, rightAnswer(m, i)); tick(5000); }
  // Round 5 repair: the round's end is in the progress area, apart from the verdict.
  check('reveal: the round ends with «Раунд завершено» and «Далі →» primary', /Раунд завершено\./.test(roundLine()) && !/Раунд завершено/.test(after()) && cont() === null && nextB().className.includes('ng-button-primary'), [roundLine(), after()]);
  check('reveal: the variant is not earned (no ✓ on its label, no score anywhere)', !variantDone() && !q('.ng-fw-score') && !instance(m).session.earned.solved);
});

// ── 5b. «Моя відповідь» after a reveal shows the learner's draft ──
scenario('my answer', m => {
  const s = rightAnswer(m, 0);
  click(door(s.hook));
  const mine = chainIds(taskOf(m), s.hook).find(idr => idr !== s.decidedBy);
  click(row(chainIds(taskOf(m), s.hook).indexOf(mine)));
  click(revealLink());
  tick(5000);
  const toggle = q('.ng-fw-mine');
  check('my answer: «Моя відповідь» is offered after a reveal with a draft', toggle !== null && toggle.getAttribute('aria-pressed') === 'false');
  click(toggle);
  const at = chainIds(taskOf(m), s.hook).indexOf(mine);
  check('my answer: it shows the learner\'s own row, marked as theirs', row(at).getAttribute('aria-checked') === 'true' && /твій вибір/.test(text(row(at))));
  click(q('.ng-fw-mine'));
  check('my answer: and back to the answer', row(chainIds(taskOf(m), s.hook).indexOf(s.decidedBy)).getAttribute('aria-checked') === 'true');
});

// ── 6. A full round earns the variant and the level; «Далі →» gives a new seed ──
scenario('full round', m => {
  const task = taskOf(m);
  for (let i = 0; i < task.cards.length; i++) {
    if (i > 0) click(cont());
    answer(m, rightAnswer(m, i));
    tick(5000);
  }
  check('full round: earned (a quiet ✓ on the rule set and on level 2, no score)', variantDone() && levelDone(2) && !levelDone(1) && !q('.ng-fw-score') && instance(m).session.earned.solved);
  check('full round: the calm success line', roundLine() === fwUi.roundOk && !after().includes(fwUi.roundOk), roundLine());
  check('full round: «Далі →» is the primary, no «Наступний пакет →»', nextB().className.includes('ng-button-primary') && cont() === null);
  const seed = placeOf(m).seeds.basic, key2 = m.probe.key;
  click(nextB());
  check('full round: «Далі →» gives a new seed and a new instance', placeOf(m).seeds.basic !== seed && m.probe.key !== key2);
  check('full round: the new round starts at card 1, uncommitted, the card focused', !viewOf(m).commit && q('.ng-fw-rules') === null && document.activeElement === q('.ng-fw-card'));
  check('full round: the ✓ stays with the new round', variantDone());
  check('full round: no «↺ Скинути рахунок» any more', !q('button[aria-label="Скинути рахунок"]'));
  step(() => m.store.dispatch({ type: 'instances', keys: Object.keys(m.store.state.instances), action: { type: 'clear-results' } }));
  check('full round: clearing the results (the store\'s clear-results) takes the ✓ away', !variantDone() && !levelDone(2));
});

// ── 7. «Далі →» on a broken variant reshuffles its five ──
scenario('broken variant', m => {
  const sets = () => all('.ng-fw-variants').find(g => !g.className.includes('ng-fw-levels')).querySelectorAll('[role="radio"]');
  click(sets()[1]);
  check('broken variant: five cards', all('.ng-fw-dot').length === 5 && placeOf(m).variantId === 'disabled');
  const task = taskOf(m);
  const s0 = rightAnswer(m, 0);
  click(door(s0.hook));
  const disabledRule = task.policy.rules.find(r => !r.enabled);
  if (disabledRule && disabledRule.chain === s0.hook) {
    const at = chainIds(task, s0.hook).indexOf(disabledRule.id);
    check('broken variant: the disabled rule is struck through and marked', /вимкнено/.test(text(row(at))) && row(at).className.includes('is-disabled'));
  } else check('broken variant: the disabled rule is struck through and marked (in the other chain: folded)', /цей пакет їх не бачить/.test(text(q('.ng-fw-folded'))));
  click(row(chainIds(task, s0.hook).indexOf(wrongAnswer(m, 0).decidedBy)));
  click(check2());
  tick(5000);
  for (let i = 1; i < 5; i++) { click(cont()); answer(m, wrongAnswer(m, i)); tick(5000); }
  check('broken variant: «Раунд завершено», then «Далі →»', /Раунд завершено/.test(roundLine()) && nextB().className.includes('ng-button-primary'));
  click(nextB());
  const next = taskOf(m);
  check('broken variant: the same five cards, a new seed', next.instanceKey !== task.instanceKey && JSON.stringify(next.cards.map(c => c.id).sort()) === JSON.stringify(task.cards.map(c => c.id).sort()));
  click(sets()[0]);
  check('broken variant: back on the first variant, its round is as it was', placeOf(m).variantId === 'basic' && all('.ng-fw-dot').length === 6);
});

// ── 7b. Level 1: the chain only, three packets, no retry ──
scenario('level 1', m => {
  const task = taskOf(m);
  check('level 1: three packets, the chain step only, no rule sets', all('.ng-fw-dot').length === 3 && q('.ng-fw-rules') === null && all('.ng-fw-variants').length === 1);
  check('level 1: «Перевірити» is disabled until a chain', check2()?.getAttribute('aria-disabled') === 'true');
  // Round 5 (spec §3, v2 A, E): the rule sentence, the action line naming the group, the two-line card.
  const group = q('.ng-fw-door-options');
  check('level 1 (R1): the action line names the choice group; no «Який ланцюжок?» caption',
    text(q('.ng-fw-work .ng-action-line')) === fwStep.action.l1 && group.getAttribute('aria-labelledby') === q('.ng-fw-work .ng-action-line').id && !text(q('.ng-fw-work')).includes(fwStep.hook));
  check('level 1: options lead with Ukrainian, the chain second', JSON.stringify(all('.ng-fw-door-option').map(text)) === JSON.stringify(['самому роутеру → input', 'іншому пристрою → forward']));
  check('level 1: the rule sentence under the task', text(q('.ng-fw-rule-sentence')) === fwStep.rule && q('.ng-fw-rule-sentence').previousSibling === q('.ng-fw-variant-text'));
  const v0 = fw.cardView(task, task.cards[0].id, 1);
  check('level 1: the card is two lines, «Звідки» with the device and «Куди» as a fact link',
    all('.ng-fw-card .ng-fw-card-line').length === 2 && text(all('.ng-fw-card-line')[0]) === `Звідки: ${v0.from.ip} (${v0.from.device})` && text(q('.ng-fw-card .ng-fact-link')) === v0.to.ip,
    all('.ng-fw-card .ng-fw-card-line').map(text));
  check('level 1: before a check nothing names the owner', !/адреса (самого роутера|ПК|R1|вузла)/.test(text(q('.ng-fw'))) && q('[data-highlight]') === null);
  const s0 = rightAnswer(m, 0);
  const other = s0.hook === 'input' ? 'forward' : 'input';
  click(door(other));
  check('level 1: choosing is not checking', !viewOf(m).commit && status() === '');
  click(check2());
  const ownerOf = i => { const v = fw.cardView(task, task.cards[i].id, 1); return { v, line: ownerLine(task, v) }; };
  check('level 1 (v2 F): a wrong chain is committed, the verdict is two lines: ✗, then whose address it is',
    Boolean(viewOf(m).commit?.answer?.[task.cards[0].id]) && status().includes(fwUi.wrong) && !status().includes(fwT('wrong-door'))
      && all('.ng-fw-after p').length === 1 && text(q('.ng-fw-after .ng-fw-owner')) === ownerOf(0).line, [status(), after()]);
  check('level 1 (v2 F): after a wrong check the owner\'s address label is highlighted, a label only',
    all('.ng-fw-svg [data-highlight]').length === 1 && q('.ng-fw-svg [data-highlight]').getAttribute('data-hl').split(' ').includes(`label:${ownerOf(0).v.owner.labelId}`) && ['text', 'g'].includes(q('.ng-fw-svg [data-highlight]').tagName.toLowerCase()));
  check('level 1: no walk, the door the filter took on the diagram', walk() === null && q('.ng-fw-svg .ng-fw-door.is-chosen') !== null);
  check('level 1 (v2 F): the marks are one line under the pair, not inside the buttons',
    text(q('.ng-fw-marks')) === `твій вибір: ${other} ✗ · фільтр: ${s0.hook} ✓` && !all('.ng-fw-door-option').some(b => /твій вибір|так вирішив/.test(text(b))), text(q('.ng-fw-marks')));
  check('level 1 (repair 7): after the commit the action line says so, in the same place; the locked group keeps its own name',
    text(q('.ng-fw-work .ng-action-line')) === fwStep.action.l1Done && q('.ng-fw-door-options').getAttribute('aria-labelledby') === 'ng-fw-doors-name' && text(q('#ng-fw-doors-name')) === fwUi.doors);
  check('level 1 (repair 8): no interface-list chip on the diagram', q('.ng-fw-svg .ng-fw-chip') === null);
  check('level 1: focus on «Наступний пакет →»', document.activeElement === cont());
  click(cont());
  check('level 1: a new card clears the highlight', q('[data-highlight]') === null);
  click(door(rightAnswer(m, 1).hook));
  click(check2());
  check('level 1: a right chain, with its owner line and no automatic highlight', /✓ Так/.test(status()) && status().includes(fwStep.chainRight) && text(q('.ng-fw-owner')) === ownerOf(1).line && q('[data-highlight]') === null, status());
  click(cont());
  check('level 1 (v2): no reply line at level 1', q('.ng-fw-reply') === null);
  click(door(rightAnswer(m, 2).hook));
  click(check2());
  check('level 1: the round ends; «Далі →» goes to level 2', nextB().className.includes('ng-button-primary') && cont() === null);
  click(nextB());
  check('level 1: «Далі →» opened level 2', placeOf(m).level === 2 && all('.ng-fw-dot').length === 6);
  check('level 1: not all right: no ✓ on level 1', !levelDone(1));
}, { level: 1 });

// ── 7c. The «Куди» fact link (round 5, R3) ──
scenario('fact link', m => {
  const task = taskOf(m);
  const v = fw.cardView(task, task.cards[0].id, 1);
  const link = () => q('.ng-fw-card .ng-fact-link');
  const live = () => text(link().nextSibling);
  const lit = () => all('.ng-fw-svg [data-highlight]').map(el => el.getAttribute('data-hl'));
  check('fact link: a button named «… — показати на схемі», its live region empty before a tap',
    link().tagName === 'BUTTON' && link().getAttribute('type') === 'button' && link().getAttribute('aria-label') === `${v.to.ip} — показати на схемі` && link().nextSibling.getAttribute('aria-live') === 'polite' && live() === '');
  step(() => { link().focus(); });
  check('fact link: focus alone reveals nothing', live() === '' && lit().length === 0);
  clickOnly(link());
  check('fact link: a tap highlights the owner\'s address label only and says whose it is',
    lit().length === 1 && lit()[0].split(' ').includes(`label:${v.owner.labelId}`) && live() === saidLine(task, v), [lit(), live()]);
  clickOnly(link());
  check('fact link: a second tap keeps it on and says it again', lit().length === 1 && live() === saidLine(task, v));
  click(door('input'));
  check('fact link: a choice clears the highlight', lit().length === 0);
  clickOnly(link());
  check('fact link: tapping again after a choice brings it back', lit().length === 1);
  click(check2());
  click(cont());
  const v1 = fw.cardView(task, task.cards[1].id, 1);
  check('fact link: the next card starts without a highlight or an announcement', lit().length === 0 && live() === '' && text(link()) === v1.to.ip);
  clickOnly(link());
  check('fact link: the next card\'s fact replaces it with its own owner', lit().length === 1 && lit()[0].split(' ').includes(`label:${v1.owner.labelId}`));
  click(all('.ng-fw-levels [role="radio"]')[1]);
  check('fact link: a level change clears it', lit().length === 0);
  // Repair v1 (Astra 5): A → B → A, for levels and for cards: coming back shows no highlight until a new tap.
  click(all('.ng-fw-levels [role="radio"]')[0]);
  check('fact link: back on level 1, the earlier tap is not restored', lit().length === 0 && live() === '');
  clickOnly(link());
  check('fact link: a new tap on that card highlights again', lit().length === 1);
  click(all('.ng-fw-dot')[0]);
  check('fact link: another card (dot 1) shows none', lit().length === 0 || viewOf(m).commit?.answer?.[task.cards[0].id]?.hook !== realSolution(task)[task.cards[0].id].hook);
  click(cont());
  check('fact link: back on card 2 («Наступний пакет →»), the earlier tap is not restored', lit().length === 0 && text(link()) === v1.to.ip);
}, { level: 1 });

// ── 8. Reduced motion shows the animated walk's last frame at once ──
function endFrame(reduced, position, selection) {
  setReducedMotion(reduced);
  const m = mount();
  for (let i = 0; i < position; i++) { answer(m, rightAnswer(m, i)); tick(5000); click(cont()); }
  answer(m, selection(m, position));
  const immediate = walk();
  if (!reduced) tick(6000);
  const html = q('.ng-fw').outerHTML;
  const out = { immediate, end: walk(), table: region(html, 'class="ng-fw-rules"'), svg: region(html, 'class="ng-fw-svg"'), status: status() };
  m.unmount();
  setReducedMotion(false);
  return out;
}
for (const position of [0, 1, 2, 3, 4, 5]) for (const [label, selection] of [['right', rightAnswer], ['wrong', wrongAnswer]]) {
  const reduced = endFrame(true, position, selection), animated = endFrame(false, position, selection);
  check(`reduced motion, card ${position + 1} ${label}: the end at once`, reduced.immediate === 'done', reduced.immediate);
  check(`reduced motion, card ${position + 1} ${label}: the same table, diagram and words as the animated end`,
    reduced.table === animated.table && reduced.svg === animated.svg && reduced.status === animated.status && animated.end === 'done',
    reduced.svg === animated.svg ? { table: reduced.table === animated.table, status: [reduced.status, animated.status] } : (() => { let i = 0; while (reduced.svg[i] === animated.svg[i]) i++; return { at: i, reduced: reduced.svg.slice(i - 80, i + 80), animated: animated.svg.slice(i - 80, i + 80) }; })());
}

// ── 9. Independence: committing or revealing card k leaves card k+1 fresh, after a remount too (S5 e) ──
const fresh = mount();
showCard(fresh, 1);
const want = surfaces();
fresh.unmount();
scenario('independence', m => {
  answer(m, wrongAnswer(m, 0));
  tick(5000);
  click(cont());
  const got = surfaces();
  check('independence: card 2 after committing card 1 equals a fresh render', got.every((part, i) => part === want[i]), got.map((part, i) => part === want[i]));
  m.remount();
  const again = surfaces();
  check('independence: and after a remount', again.every((part, i) => part === want[i]), again.map((part, i) => part === want[i]));
  click(revealLink());
  tick(5000);
  click(cont());
  const third = surfaces();
  check('independence: card 3 after revealing card 2 has no walk, feedback or highlight', !/is-(?:match|end|mismatch|marked|chosen|dim)\b/.test(third.join('')) && status() === '' && walk() === null);
});

// ── 10. «Текстом», «⋯» and «По кроках» ──
scenario('overlays and steps', m => {
  const textButton = q('button[aria-controls="ng-fw-text"]');
  click(textButton);
  const headings = () => q('#ng-fw-text').querySelectorAll('h4').map(h => text(h));
  check('«Текстом» before commitment: the givens and the unmarked rule list', JSON.stringify(headings()) === JSON.stringify(['Роутер R1', 'Вузли', 'dst-NAT на R1', 'Пакет', 'Список правил (згори вниз)']) && !/для цього пакета/.test(text(q('#ng-fw-text'))), headings());
  key(q('#ng-fw-text'), 'Escape');
  check('«Текстом»: Escape closes it and focus returns to its button', q('#ng-fw-text').hasAttribute('hidden') && document.activeElement === textButton);
  answer(m, rightAnswer(m, 0));
  tick(5000);
  click(textButton);
  check('«Текстом» after commitment: each rule\'s outcome, the door and the conclusion', ['Список правил (згори вниз)', 'Ланцюжок', 'Висновок'].every(h => headings().includes(h)) && (text(q('#ng-fw-text')).match(/для цього пакета/g) ?? []).length === 11, headings());
  key(q('#ng-fw-text'), 'Escape');
  const more = q('.ng-fw .ng-more-button');
  check('«⋯»: one, at the end of the heading row, named «Інші дії»', all('.ng-fw .ng-more-button').length === 1 && more.getAttribute('aria-label') === 'Інші дії' && more.closest('.ng-fw-head') !== null);
  click(more);
  const items = all('.ng-fw [role="menuitem"]').map(b => text(b));
  check('«⋯»: «Що означають стани» and «Команда RouterOS»', JSON.stringify(items) === JSON.stringify([fwUi.statesMenu, fwUi.commandsMenu]), items);
  click(all('.ng-fw [role="menuitem"]')[0]);
  const panel = q('.ng-fw .ng-more-panel');
  check('«⋯» «Що означають стани»: opens in the work column, focus on its heading; the ingress line is there', panel !== null && panel.closest('.ng-fw-work') !== null && document.activeElement === panel.querySelector('h2') && /Input чи forward він не вирішує/.test(text(panel)));
  click(more);
  click(all('.ng-fw [role="menuitem"]')[1]);
  check('«⋯» «Команда RouterOS»: the rule set as commands', /\/ip firewall filter add chain=input/.test(text(q('.ng-fw .ng-more-panel'))));
  click(q('.ng-fw .ng-more-close'));
  click(q('.ng-fw-walkbar').querySelectorAll('button').find(b => text(b) === 'По кроках'));
  const counter = () => text(q('.ng-fw-step-text'));
  check('«По кроках»: starts at step 1', /^крок 1 з \d+$/.test(counter()) && walk() === 'stepping', counter());
  key(q('.ng-fw-stepper').querySelector('button'), 'ArrowRight');
  key(q('.ng-fw-stepper').querySelector('button'), 'ArrowRight');
  check('«По кроках»: arrows step', /^крок 3 з/.test(counter()), counter());
  click(q('.ng-fw-stepper').querySelectorAll('button')[0]);
  check('«По кроках»: ◀ steps back', /^крок 2 з/.test(counter()), counter());
  check('«По кроках»: no timer runs while stepping', pending.size === 0);
});

// ── Fix round 1 ──
/** Mount with seed 195: wan-winbox, reply-to-pc (FastTrack), invalid-fwd, port-forward, lan-web-out, related-icmp-to-pc. */
function scenario195(name, fn) {
  const m = mountFirewall();
  step(() => m.store.dispatch({ type: 'place', scope: 'firewall', patch: { level: 2, variantId: 'basic', seeds: { ...SEEDS, basic: 195 } } }));
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
  check(`${name}: unmounting leaves no timer behind`, pending.size === 0, { pending: pending.size });
}

scenario195('fix 1: verdict now, the deciding row at the walk\'s end', m => {
  answer(m, { hook: 'input', decidedBy: 'chain-end:input' }); // wan-winbox: dropped by «drop the rest» before the chain's end
  tick(200);
  check('fix 1: at once, ✗ and the finding are announced', /✗ Фільтр вирішив інакше\./.test(status()) && walk() === 'playing', status());
  check('fix 1: but not which chain and row decided, while the walk plays', !/Вирішує|Фільтр відкидає/.test(status() + after()), status());
  const announced = status();
  tick(5000);
  check('fix 1: at the walk\'s end the chain and the row, with the verdict', /Вирішує input, рядок 4\. Фільтр відкидає цей пакет за правилом\./.test(after()), after());
  check('fix 1: the live region says nothing more (announced once, at the commit)', status() === announced, [announced, status()]);
  click(cont());
  answer(m, rightAnswer(m, 1));
  tick(200);
  check('fix 1: a right commit: ✓ at once, nothing more yet', /✓ Так/.test(status()) && !/Вирішує/.test(status() + after()), status());
  key(cont(), 'Shift');
  check('fix 1: a press skips to the end, and the rest of the words come with it', walk() === 'done' && /Вирішує forward, рядок 6\./.test(after()), after());
});

scenario195('fix 2: the slow-path line under the table', m => {
  answer(m, rightAnswer(m, 0));
  tick(5000);
  check('fix 2: no slow-path line without FastTrack', q('.ng-fw-note') === null);
  click(cont());
  answer(m, rightAnswer(m, 1)); // reply-to-pc: the FastTrack row marks it, the next accept decides
  tick(1000);
  check('fix 2: not before the FastTrack row is lit', q('.ng-fw-note') === null && walk() === 'playing');
  tick(400);
  const note = q('.ng-fw-note');
  check('fix 2: once it is lit, under the table, in the corrected words (F1 v2)', note !== null && note.parentNode === q('.ng-fw-rules') && text(note) === fwStep.slowPath, text(note));
  tick(3000);
  check('fix 2: and not in the feedback', !/повільному шляху/.test(status() + after()) && /Вирішує forward, рядок 6/.test(after()), after());
  click(cont());
  check('fix 2: the next card has none', q('.ng-fw-note') === null);
});

scenario('fix 6: state meanings on keyboard focus', m => {
  // Seed 7's first card is a DNS reply (established): input or forward, its chain's rows.
  click(door(rightAnswer(m, 0).hook));
  const r0 = row(0);
  check('fix 6: before focus, no meaning shows', r0.querySelectorAll('.ng-fw-meaning').length === 0);
  step(() => { r0.focus(); fire(r0, 'focusin'); });
  const shown = r0.querySelector('.ng-fw-meaning');
  const described = document.getElementById(r0.getAttribute('aria-describedby'));
  check('fix 6: a focused row with a state shows its meaning', shown !== null && /встановлене \(established\) — з’єднання, де трафік уже йшов в обидва боки/.test(text(shown)), text(shown));
  check('fix 6: the row is described by it (aria-describedby), and the visible copy is aria-hidden', described !== null && text(described) === text(shown) && shown.getAttribute('aria-hidden') === 'true');
  key(r0, 'ArrowDown');
  step(() => { fire(r0, 'focusout'); fire(row(1), 'focusin'); });
  check('fix 6: focus moves on: the meaning moves with it', r0.querySelectorAll('.ng-fw-meaning').length === 0 && row(1).querySelector('.ng-fw-meaning') !== null);
  const plain = all('.ng-fw-row').findIndex(r => !r.hasAttribute('aria-describedby'));
  step(() => { fire(row(1), 'focusout'); fire(row(plain), 'focusin'); });
  check('fix 6: a row without a state condition shows nothing and isn\'t described', all('.ng-fw-meaning').length === 0 && plain > 0);
  const card = q('.ng-fw-card');
  step(() => { card.focus(); fire(card, 'focusin'); });
  check('fix 6: the packet card with focus shows its state\'s meaning', text(card.querySelector('.ng-fw-meaning')) === 'встановлене (established) — з’єднання, де трафік уже йшов в обидва боки'
    && card.getAttribute('aria-describedby') === 'ng-fw-card-meaning' && text(document.getElementById('ng-fw-card-meaning')) === text(card.querySelector('.ng-fw-meaning')), text(card.querySelector('.ng-fw-meaning')));
  step(() => { fire(card, 'focusout'); });
  check('fix 6: and hides it on blur', card.querySelectorAll('.ng-fw-meaning').length === 0);
  check('fix 6: still one tab stop in the table', all('.ng-fw-row').filter(r => r.getAttribute('tabindex') === '0').length === 1);
});

// FW-2's logic adapter/reducer with the existing ReorderList and useExercise.
// These supplement every unchanged FW-1 scenario above. The production FW-2
// screen has its own scenarios after this block.
{
  const { mountOrderContract, act: orderAct } = await import('../../.test-bundles/harness/firewall-order-lifecycle.mjs');
  const m = mountOrderContract(), probe = m.into;
  const send = action => orderAct(() => probe.send(action));
  const orderClick = el => orderAct(() => { fire(el, 'click'); });
  check('FW-2 contract: initial DOM follows shuffled task', JSON.stringify(probe.state.answer.order) === JSON.stringify(probe.task.rules.map(r => r.id)));
  check('FW-2 contract: reference is not read or rendered initially', probe.solutionCalls === 0 && !m.container.querySelector('.order-reveal'));
  orderClick(m.container.querySelector('.order-check'));
  check('FW-2 contract: one feedback item and only its named marks', probe.state.result.findings.length === 1 && m.container.querySelectorAll('b').length === probe.state.result.feedback.ruleIds.length);
  send({ type: 'hint' }); send({ type: 'hint' });
  check('FW-2 contract: second hint opens one learner-order walk', probe.state.walkOpen && m.container.querySelectorAll('.order-walk').length === 1);
  check('FW-2 contract: check and hints have not read the reference', probe.solutionCalls === 0);
  // Reorder through the real component's arrow button.
  orderClick(m.container.querySelectorAll('.ng-reorder-move')[1]);
  check('FW-2 contract: reorder immediately clears feedback, marks and walk', probe.state.result === null && !probe.state.walkOpen && !m.container.querySelector('.order-feedback') && !m.container.querySelector('b') && !m.container.querySelector('.order-walk'));
  const moved = JSON.stringify(probe.state.answer.order);
  m.remount();
  check('FW-2 contract: navigation restores learner order without stale evidence', JSON.stringify(probe.state.answer.order) === moved && probe.state.result === null && probe.solutionCalls === 0);
  send({ type: 'reveal' });
  check('FW-2 contract: explicit reveal reads the reference once and marks assistance', probe.solutionCalls === 1 && probe.state.assisted && probe.state.revealed && probe.session.assisted);
  check('FW-2 contract: reveal renders the script without silently replacing learner order', Boolean(m.container.querySelector('.order-reveal')) && JSON.stringify(probe.state.answer.order) === moved);
  send({ type: 'order', order: probe.solution.order }); send({ type: 'check' });
  check('FW-2 contract: correct order passes after reveal with assistance retained', probe.state.result.ok && probe.state.assisted);
  send({ type: 'order', order: [...probe.state.answer.order].reverse() });
  check('FW-2 contract: edit clears success too', probe.state.result === null && probe.state.assisted);
  m.unmount();
  check('FW-2 contract: unmount leaves no timer', pending.size === 0);
}

// ── FW-2 «Упорядкуй правила»: the production screen ─────────────────────
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
    let plain, zoom;
    step(() => { plain = fire(frame, 'wheel', { deltaY: -100, deltaMode: 0 }); });
    check(`${label}: a plain wheel is the page's (not prevented, no bar)`, !plain.defaultPrevented && q(barSelector) === null);
    step(() => { zoom = fire(frame, 'wheel', { ctrlKey: true, deltaY: -100, deltaMode: 0 }); });
    check(`${label}: Ctrl + wheel zooms the diagram, never the page, and the bar appears`, zoom.defaultPrevented && q(barSelector) !== null, { prevented: zoom.defaultPrevented, scale: q(frameSelector)?.getAttribute('data-scale') });
  } catch (e) { check(`${label}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  try { m?.unmount(); } catch {}
  delete globalThis.ResizeObserver;
}

// The real FirewallScreen's second exercise (OrderView.jsx), in the same
// store, after FW-1's scenarios and Sol's logic-contract fixture above:
// the switch, both levels, a pass, a verdict failure and its walk, the dead
// FastTrack, clearing on reorder, keyboard reordering, hints, the reveal,
// the script, and the dedicated FW-2 leak gate (firewall-order-leaks.mjs)
// over every rendered surface for several seeds, with injected leaks.
{
  const { orderRecord, orderCreate, prepareOrder, orderInitialState } = await import('../../.test-bundles/harness/mounted-firewall.mjs');
  const { firewallOrderLeaks, normaliseReactIds, orderListFindings } = await import('./firewall-order-leaks.mjs');
  const { uk: shared } = await import('../../src/ui/uk.js');
  const { orderUi, orderText, orderCopy, ui: fwUi, t: fwT } = await import('../../src/sections/firewall/uk.js');
  const OSEEDS = { input: 11, all: 23 };
  const seen = new Set();
  const quoted = s => String(s).replace(/\.$/, '');
  const fwo = () => q('.ng-fwo');
  const place2 = m => m.store.state.places['firewall-order'];
  const task2 = m => orderCreate(orderRecord, { variantId: place2(m).variantId, seed: place2(m).seeds[place2(m).variantId] });
  const inst2 = m => m.store.state.instances[task2(m).instanceKey];
  const state2 = m => inst2(m)?.view?.orderState ?? orderInitialState(task2(m));
  const prep2 = m => prepareOrder(task2(m), orderRecord);
  const reference = m => prep2(m).solution().order;
  const descOf = (task, id) => fwT(task.rules.find(r => r.id === id).descriptionCode);
  const items = () => all('.ng-fwo .ng-reorder-item');
  const handle2 = i => items()[i].querySelector('.ng-reorder-handle');
  const up2 = i => items()[i].querySelectorAll('.ng-reorder-move')[0];
  const main2 = () => q('.ng-fwo .ng-help-check');
  const status2 = () => text(q('.ng-fwo [role="status"]'));
  const rowNames = () => items().map(li => li.querySelector('.ng-reorder-handle').getAttribute('aria-label').replace(/^\d+\. Переставити: /, ''));
  const button2 = words => all('.ng-fwo button').find(b => text(b).startsWith(words));
  const tab = label => all('.ng-fw-exercises [role="radio"]').find(b => text(b) === label);
  const level = label => all('.ng-fwo .ng-fw-variants [role="radio"]').find(b => text(b) === label);
  const note = () => { const html = q('.ng-fwo')?.outerHTML ?? ''; for (const s of [html.replace(/<[^>]*>/g, ' ')]) seen.add(s.replace(/\s+/g, ' ')); };
  /** Put an order in place as navigation restoring it would (no list announcement). */
  const putOrder = (m, order) => step(() => m.store.dispatch({ type: 'instance', key: task2(m).instanceKey, action: { type: 'view', patch: { orderState: { ...orderInitialState(task2(m)), answer: { order: [...order] } } } } }));
  /** Arrange the list like a student, with ↑ only. */
  function arrange(m, target) {
    for (let i = 0; i < target.length; i++) {
      let j = state2(m).answer.order.indexOf(target[i]);
      for (; j > i; j--) click(up2(j));
    }
  }
  /** The FW-2 leak gate over the whole mounted surface (only verified React-generated ids normalised). */
  const gateOf = (m, html) => firewallOrderLeaks(normaliseReactIds(html), { task: task2(m) });
  const gate = m => gateOf(m, m.container.outerHTML);
  // Round 4 (spec A1): the check row, the verdict, the hints and the reveal are HelpPanel's.
  const hintButton = () => q('.ng-fwo .ng-help-hint-button');
  /** Rung n's words: the current one or one folded under «Підказки (n)», in order. */
  const hintWords = n => text(all('.ng-fwo [data-help="hint"]')[n - 1]);
  const nextButton = () => q('.ng-fwo .ng-help-next');
  const current = () => q('.ng-fwo [data-help-current]');
  /** Structure: DOM order and numbers are the learner's, only the ends limit ↑ ↓, each description is shown once (plus where a finding or hint names it). */
  function structure(m) {
    const task = task2(m), st = state2(m), out = [];
    const want = st.answer.order.map(id => quoted(descOf(task, id)));
    if (JSON.stringify(rowNames()) !== JSON.stringify(want)) out.push('order');
    if (items().some((li, i) => text(li.querySelector('.ng-reorder-n')) !== String(i + 1))) out.push('numbering');
    if (items().some((li, i) => { const [u, d] = li.querySelectorAll('.ng-reorder-move').map(b => b.getAttribute('aria-disabled')); return (u === 'true') !== (i === 0) || (d === 'true') !== (i === items().length - 1); })) out.push('move limits');
    for (const f of orderListFindings(m.container.outerHTML)) out.push(`names:${f}`);
    if (!st.walkOpen) {
      const body = text(fwo()), named = text(q('.ng-fwo [data-help="message"]'));
      for (const d of want) if (body.split(d).length - 1 !== 1 + (named.split(d).length - 1)) out.push(`mirror:${d.slice(0, 20)}`);
    }
    return out;
  }
  function mountOrder(variantId = 'input', seeds = OSEEDS) {
    const m = mountFirewall();
    step(() => m.store.dispatch({ type: 'place', scope: 'firewall-order', patch: { variantId, seeds: { ...seeds } } }));
    step(() => m.store.dispatch({ type: 'place', scope: 'firewall-tab', patch: { exercise: 'order' } }));
    return m;
  }
  function orderScenario(name, fn, { variantId = 'input', seeds = OSEEDS } = {}) {
    const m = mountOrder(variantId, seeds);
    try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
    m.unmount();
    check(`${name}: unmounting leaves no timer behind`, pending.size === 0, { pending: pending.size });
  }

  orderScenario('FW-2 switch', m => {
    const firewallPlace = JSON.stringify(m.store.state.places.firewall);
    check('FW-2 switch: «Порядок правил» beside «Передбач», chosen, its screen shown', tab(fwUi.exercises.order)?.getAttribute('aria-checked') === 'true' && Boolean(tab('Передбач')) && fwo() !== null && q('.ng-fw-progress') === null);
    check('FW-2 switch: one heading, «Фаєрвол»', all('h1').length === 1 && text(q('h1')) === fwUi.heading);
    tab(fwUi.exercises.order).focus();
    key(tab(fwUi.exercises.order), 'ArrowLeft');
    check('FW-2 switch: an arrow brings «Передбач» back, its round as it was, focus on the switch', fwo() === null && q('.ng-fw-progress') !== null && JSON.stringify(m.store.state.places.firewall) === firewallPlace && document.activeElement === tab('Передбач'));
    click(tab(fwUi.exercises.order));
    check('FW-2 switch: a click comes back, focus on the switch', fwo() !== null && m.store.state.places['firewall-tab'].exercise === 'order' && document.activeElement === tab(fwUi.exercises.order));
  });

  orderScenario('FW-2 levels', m => {
    note();
    const task = task2(m);
    check('FW-2 levels: «Лише до роутера» shows the five input rules in the task\'s shuffled order', items().length === 5 && JSON.stringify(rowNames()) === JSON.stringify(task.rules.map(r => quoted(descOf(task, r.id)))) && task.rules.every(r => r.chain === 'input'));
    check('FW-2 levels: each row says its chain, action, conditions and meaning', items().every((li, i) => text(li.querySelector('.ng-fwo-chain')) === task.rules[i].chain && li.querySelector('.ng-fw-action') && li.querySelector('.ng-fw-cond') && text(li.querySelector('.ng-fwo-desc')) === descOf(task, task.rules[i].id)));
    check('FW-2 levels: the task and its goal in a few lines, the policy named as a simplified home set', text(q('.ng-fwo-task')) === task.text.split('\n')[0] && all('.ng-fwo-goal p').length === 3 && text(q('.ng-fwo-policy')) === quoted(orderUi.policy));
    check('FW-2 levels: the diagram shows the network alone (no packet, no ingress chip)', q('.ng-fwo .ng-fw-svg') && q('.ng-fwo .ng-fw-envelope') === null && q('.ng-fwo .ng-fw-chip') === null && q('.ng-fwo .ng-fw-place.is-given') === null);
    check('FW-2 levels: no zoom bar on a diagram that fits (A3); «Текстом» is there', q('.ng-fwo .ng-fw-zoom') === null && q('.ng-fwo button[aria-controls="ng-fwo-text"]') !== null);
    check('FW-2 levels: the work region is named by the list\'s own label', q('.ng-fwo-work').getAttribute('aria-label') === orderUi.list && q('.ng-fwo ol.ng-reorder').getAttribute('aria-label') === orderUi.list && !q('.ng-fwo-work').hasAttribute('aria-labelledby'));
    check('FW-2 levels: «Перевірити» (primary), the hints, the reveal and a quiet «Далі →» (skip, stage-1 decision Q6); no feedback, no script', text(main2()) === orderUi.check && main2().className.includes('ng-button-primary') && nextButton() !== null && !nextButton().className.includes('ng-button-primary')
      && all('.ng-fwo [data-help="row"] button').length === 4 && status2() === '' && current() === null && q('.ng-copy') === null && q('.ng-fwo-answer') === null);
    check('FW-2 levels: the first structure is the learner\'s (order, numbers, move limits, no mirror)', structure(m).length === 0, structure(m));
    click(level('Увесь фільтр'));
    const all9 = task2(m);
    note();
    check('FW-2 levels: «Увесь фільтр» shows all nine, input and forward in one list', items().length === 9 && new Set(all9.rules.map(r => r.chain)).size === 2 && JSON.stringify(rowNames()) === JSON.stringify(all9.rules.map(r => quoted(descOf(all9, r.id)))));
    check('FW-2 levels: its goal adds the WAN line and the port-forward fact (F2), the diagram its dst-NAT label', all('.ng-fwo-goal p').length === 4 && /прокидання порту/.test(text(q('.ng-fwo-goal'))) && /Проброс порту: 100\.64\.0\.2:443 → Сервер:443/.test(text(q('.ng-fwo-goal'))) && q('.ng-fwo .ng-fw-nat') !== null);
    check('FW-2 levels: the chains grouped inside the one list: an edge per chain, a divider where it changes (F2)', items().every(li => /is-chain-(input|forward)/.test(li.className)) && items().filter(li => li.className.includes('is-chain-change')).length === items().filter((li, i) => i > 0 && (li.className.match(/is-chain-(\w+)/)?.[1] !== items()[i - 1].className.match(/is-chain-(\w+)/)?.[1])).length && all('.ng-fwo ol').length >= 1);
    click(main2());
    click(level('Лише до роутера'));
    check('FW-2 levels: back on the first level, its own list as it was, unchecked', items().length === 5 && status2() === '' && place2(m).variantId === 'input');
    click(level('Увесь фільтр'));
    check('FW-2 levels: and the second keeps its check', /Ще ні/.test(status2()) && Boolean(state2(m).result));
  });

  orderScenario('FW-2 verdict', m => {
    const task = task2(m);
    const expected = prep2(m).check({ order: task.rules.map(r => r.id) }).feedback;
    click(main2());
    note();
    const st = state2(m), fb = st.result.feedback;
    check('FW-2 verdict: one finding, a packet whose fate changed', fb.code === 'order-verdict' && st.result.findings.length === 1 && JSON.stringify(fb) === JSON.stringify(expected));
    check('FW-2 verdict: «• Ще ні» and the words announced; the packet card and «має: … · у тебе: …» open beside them, not announced', status2() === `• Ще ні ${orderText('order-verdict')}`
      && q('.ng-fwo [data-help-current] .ng-fw-card')?.getAttribute('aria-label') === orderUi.packet && q('.ng-fwo [role="status"] .ng-fw-card') === null
      && text(q('.ng-fwo-fate')) === orderUi.fate({ expected: fb.expected, actual: fb.actual }), status2());
    check('FW-2 verdict: the rule that decided carries data-evidence="current", and only it', all('.ng-fwo [data-evidence="current"]').length === 1
      && items()[st.answer.order.indexOf(fb.ruleIds[0])].querySelector('[data-evidence="current"]') !== null);
    check('FW-2 verdict: only the rule that decided is marked', all('.ng-fwo .ng-reorder-item.is-marked').length === fb.ruleIds.length && all('.ng-fwo-mark').length === fb.ruleIds.length
      && items()[st.answer.order.indexOf(fb.ruleIds[0])].className.includes('is-marked'));
    check('FW-2 verdict: the session has one check', inst2(m).presses === 1 && inst2(m).session.attempts === 1 && !inst2(m).session.assisted);
    check('FW-2 verdict: a packet on the diagram brings no zoom bar (A3: never because of a check)', q('.ng-fwo .ng-fw-zoom') === null);
    check('FW-2 verdict: the diagram shows where the packet comes from, no path yet', q('.ng-fwo .ng-fw-port.is-given') !== null && q('.ng-fwo .ng-fw-chip') !== null && q('.ng-fwo .ng-fw-path-line') === null);
    const walkButton = button2(orderUi.walkShow);
    check('FW-2 verdict: «Показати шлях пакета» is a closed toggle for the list', walkButton?.getAttribute('aria-expanded') === 'false' && walkButton.getAttribute('aria-controls') === 'ng-fwo-list' && q('#ng-fwo-list') !== null);
    click(walkButton);
    note();
    const walkIn = prep2(m).walkInput(st.answer.order, fb.card);
    const decider = st.answer.order.indexOf(walkIn.walk.decidedBy);
    check('FW-2 verdict: the walk lays each rule\'s outcome on the learner\'s own rows', items().every(li => li.className.includes('is-walk')) && text(items()[decider].querySelector('.ng-fwo-out')) === fwUi.walk.match
      && items().slice(decider + 1).every(li => li.className.includes('is-walk-not-reached')), items().map(li => li.className));
    check('FW-2 verdict: rows before the decider say why they did not catch it', items().slice(0, decider).every(li => /is-walk-(?:mismatch|other-chain|marked)/.test(li.className) && text(li.querySelector('.ng-fwo-out')).length > 0));
    check('FW-2 verdict: the toggle says it is open; focus stays on it', button2(orderUi.walkHide)?.getAttribute('aria-expanded') === 'true' && document.activeElement === button2(orderUi.walkHide));
    check('FW-2 verdict: the diagram shows the walk\'s end (path, the door taken)', all('.ng-fwo .ng-fw-path-line').length > 0 && q(`.ng-fwo .ng-fw-door.is-chosen`) !== null);
    click(q('.ng-fwo button[aria-controls="ng-fwo-text"]'));
    const headings = all('#ng-fwo-text h4').map(h => text(h));
    check('FW-2 verdict: «Текстом» says the network, the packet, the door and the conclusion', ['Роутер R1', 'Вузли', 'Пакет', 'Ланцюжок', 'Висновок'].every(h => headings.includes(h)), headings);
    key(q('#ng-fwo-text'), 'Escape');
    check('FW-2 verdict: Escape closes it, focus back on «Текстом»', q('#ng-fwo-text').hasAttribute('hidden') && document.activeElement === q('.ng-fwo button[aria-controls="ng-fwo-text"]'));
    m.remount();
    check('FW-2 verdict: leaving and coming back restores the order, the finding and the walk', JSON.stringify(state2(m).answer.order) === JSON.stringify(st.answer.order) && /Ще ні/.test(status2()) && items().every(li => li.className.includes('is-walk')));
    // Any reorder clears the finding, the marks and the walk.
    click(up2(items().length - 1));
    check('FW-2 clearing: a reorder (↑) clears the finding, the marks and the walk at once', state2(m).result === null && !state2(m).walkOpen && all('.ng-fwo .is-marked').length === 0 && all('.ng-fwo .is-walk').length === 0 && q('.ng-fwo .ng-fw-path-line') === null);
    check('FW-2 clearing: the verdict stays, dimmed «до змін», with no walk toggle; the moved row is the current row, the panel right after it', current()?.hasAttribute('data-help-stale') && /до змін/.test(status2()) && !button2(orderUi.walkShow)
      && all('.ng-fwo [data-evidence="current"]').length === 1 && items()[items().length - 2].querySelector('[data-evidence="current"]') !== null
      && q('.ng-fwo .ng-help-host')?.previousSibling === items()[items().length - 2], status2());
    check('FW-2 clearing: the moved row keeps the focus on its ↑', document.activeElement === up2(items().length - 2));
  });

  orderScenario('FW-2 witness', m => {
    // An order that lets an invalid ICMP packet from WAN in: ICMP above «drop invalid» (the bank's witness card).
    const task = task2(m), ref = reference(m), id = code => task.rules.find(r => r.descriptionCode === code).id;
    const order = ref.filter(x => x !== id('rule.input-invalid'));
    order.splice(order.indexOf(id('rule.input-icmp')) + 1, 0, id('rule.input-invalid'));
    putOrder(m, order);
    click(main2());
    const fb = state2(m).result.feedback;
    check('FW-2 witness: an invalid ICMP packet from WAN shows the change', fb.code === 'order-verdict' && fb.expected === 'drop' && fb.actual === 'accept' && /ICMP/.test(text(q('.ng-fwo [data-help-current] .ng-fw-card'))) && /некоректне/.test(text(q('.ng-fwo [data-help-current] .ng-fw-card'))));
    check('FW-2 witness: the ICMP rule is the one marked', all('.ng-fwo-mark').length === 1 && items()[order.indexOf(id('rule.input-icmp'))].className.includes('is-marked'));
    note();
  });

  orderScenario('FW-2 dead FastTrack', m => {
    const task = task2(m), ref = reference(m), id = code => task.rules.find(r => r.descriptionCode === code).id;
    const ft = id('rule.forward-fasttrack'), acc = id('rule.forward-replies');
    const order = ref.filter(x => x !== ft);
    order.splice(order.indexOf(acc) + 1, 0, ft);
    putOrder(m, order);
    click(main2());
    note();
    const fb = state2(m).result.feedback;
    check('FW-2 dead FastTrack: verdicts unchanged, one dead rule found', fb.code === 'order-dead' && fb.ruleId === ft && fb.blockerId === acc && state2(m).result.findings.length === 1);
    // Round 4 (F2): the rule that hid it, by position and meaning, distinct from a wrong outcome.
    const shadow = fb.shadow;
    check('FW-2 dead FastTrack: it says which rule hid it (positions and meanings), both marked', status2() === `• Ще ні ${orderText('order-shadowed', { ...shadow, rule: quoted(descOf(task, ft)), blocker: quoted(descOf(task, acc)) })}`
      && shadow.ruleNumber === order.indexOf(ft) + 1 && shadow.blockerNumber === order.indexOf(acc) + 1 && all('.ng-fwo .ng-reorder-item.is-marked').length === 2 && !/має:/.test(text(q('.ng-fwo [data-help="message"]'))), status2());
    const markOf = i => text(items()[i].querySelector('.ng-fwo-mark'));
    check('FW-2 dead FastTrack: the earlier rule «перехопило», the hidden one «не отримує» (Fable 1)', markOf(order.indexOf(acc)) === orderUi.markBlocker && markOf(order.indexOf(ft)) === orderUi.markHidden, [markOf(order.indexOf(acc)), markOf(order.indexOf(ft))]);
    check('FW-2 dead FastTrack: exactly those two rows are marked', all('.ng-fwo .ng-reorder-item.is-marked').length === 2 && [ft, acc].every(x => items()[order.indexOf(x)].className.includes('is-marked')));
    check('FW-2 dead FastTrack: no packet, so no walk to open and no zoom tools', q('.ng-fwo [data-help-current] .ng-fw-card') === null && !button2(orderUi.walkShow) && q('.ng-fwo .ng-fw-path-line') === null && q('.ng-fwo .ng-fw-zoom') === null);
    check('FW-2 dead FastTrack: after the check the hint button stays in the panel\'s row; the dead rule is the current evidence', hintButton()?.closest('[data-help="row"]') !== null
      && items()[order.indexOf(ft)].querySelector('[data-evidence="current"]') !== null && all('.ng-fwo [data-evidence="current"]').length === 1);
    check('FW-2 dead FastTrack: the leak gate passes with the finding shown', gate(m).length === 0, gate(m));
    click(hintButton());
    click(hintButton());
    check('FW-2 dead FastTrack: hint 2 opens no walk (there is no packet)', !state2(m).walkOpen && all('.ng-fwo .is-walk').length === 0 && all('.ng-fwo [data-help="hint"]').length === 2 && !button2(orderUi.walkShow));
    check('FW-2 dead FastTrack: hint 2\'s words point at the two marked rules, not at a walk', hintWords(2) === `Підказка 2 з 3. ${orderUi.hintDead}` && !/шлях/.test(hintWords(2)) && m.store.state.instances[task2(m).instanceKey].view.orderHint2 === 'order-dead', hintWords(2));
    check('FW-2 dead FastTrack: the gate passes with those words', gate(m).length === 0, gate(m));
    note();
  }, { variantId: 'all' });

  orderScenario('FW-2 keyboard', m => {
    const before = [...state2(m).answer.order];
    handle2(1).focus();
    key(handle2(1), ' ');
    check('FW-2 keyboard: Space grabs the row (aria-pressed, a dashed row)', handle2(1).getAttribute('aria-pressed') === 'true' && items()[1].className.includes('is-grabbed'));
    key(handle2(1), 'ArrowDown');
    key(handle2(2), 'ArrowDown');
    key(handle2(3), ' ');
    const after = state2(m).answer.order;
    check('FW-2 keyboard: arrows carry it, Space drops it two rows down, focus on its handle', after[3] === before[1] && handle2(3).getAttribute('aria-pressed') === 'false' && document.activeElement === handle2(3));
    check('FW-2 keyboard: every move is the learner\'s list in the store and in the DOM', JSON.stringify(rowNames()) === JSON.stringify(after.map(x => quoted(descOf(task2(m), x)))));
    key(handle2(3), 'Home');
    check('FW-2 keyboard: not grabbed, Home moves the focus only', document.activeElement === handle2(0) && JSON.stringify(state2(m).answer.order) === JSON.stringify(after));
    tick(400);
    const liveEl = q('.ng-fwo .ng-reorder-live');
    check('FW-2 keyboard: the drop is announced with the learner\'s position, exactly', liveEl.textContent === shared.reorder.dropped({ name: rowNames()[3], n: 4, total: 5 }), liveEl.textContent);
    // Only that text (learner positions) leaves the scan; the element and its attributes stay in it.
    const withoutWords = () => { const html = liveEl.outerHTML; return m.container.outerHTML.replace(html, html.slice(0, html.indexOf('>') + 1) + '</p>'); };
    check('FW-2 keyboard: without the announcement\'s words (its element and attributes kept), the gate and the names pass', gateOf(m, withoutWords()).length === 0 && orderListFindings(m.container.outerHTML).length === 0 && /<p class="ng-sr-only ng-reorder-live" aria-live="polite"><\/p>/.test(withoutWords()), gateOf(m, withoutWords()));
    liveEl.setAttribute('data-position', '6');
    check('FW-2 keyboard: an attribute on the announcement is still scanned', gateOf(m, withoutWords()).length > 0);
  });

  orderScenario('FW-2 hints', m => {
    check('FW-2 hints: the hint button sits in the panel\'s row, beside «Перевірити»', hintButton()?.closest('[data-help="row"]') !== null && hintButton().parentNode === main2().parentNode && text(hintButton()) === `💡 ${shared.hintN({ n: 1, total: 3 })}`);
    click(hintButton());
    note();
    check('FW-2 hints: the first is the question, current and announced; nothing checked', text(current()).includes(orderText('order-hint-question')) && status2().includes(orderText('order-hint-question'))
      && state2(m).result === null && inst2(m).session.hintIndex === 1 && inst2(m).session.assisted);
    check('FW-2 hints: hint 1 makes the rule it names the current evidence', all('.ng-fwo [data-evidence="current"]').length === 1
      && text(q('.ng-fwo [data-evidence="current"] .ng-fwo-desc')) === fwT('rule.input-rest'));
    check('FW-2 hints: the gate passes with hint 1', gate(m).length === 0, gate(m));
    click(hintButton());
    note();
    const decided = state2(m).result?.feedback?.ruleIds?.[0];
    check('FW-2 hints: hint 2 makes the rule that decided the current evidence (the panel brings it into view); focus stays on the hint button',
      all('.ng-fwo [data-evidence="current"]').length === 1 && (!decided || items()[state2(m).answer.order.indexOf(decided)].querySelector('[data-evidence="current"]') !== null) && document.activeElement === hintButton(),
      { evidence: all('.ng-fwo [data-evidence="current"]').length, decided, active: document.activeElement?.className });
    check('FW-2 hints: hint 2 is current; the verdict it checked shrinks to one line above it; hint 1 folds into «Підказки (1)»', current()?.querySelector('[data-help="hint"]') !== null
      && Boolean(q('.ng-fwo .ng-help-mini')) && text(q('.ng-fwo .ng-help-fold summary')) === 'Підказки (1)');
    check('FW-2 hints: the hint doesn\'t hide the evidence: the packet card and «має · у тебе» stay beside the shrunk verdict, outside the status region',
      q('.ng-fwo .ng-help-mini-box .ng-fw-card') !== null && Boolean(q('.ng-fwo .ng-help-mini-box .ng-fwo-fate')) && q('.ng-fwo [role="status"] .ng-fw-card') === null);
    check('FW-2 hints: its words are about the packet\'s walk', hintWords(2) === `Підказка 2 з 3. ${orderText('order-hint-walk')}`, hintWords(2));
    check('FW-2 hints: the second checks the list and opens that packet\'s walk (its «Ще ні» on the shrunk verdict line)', state2(m).result?.feedback?.code === 'order-verdict' && state2(m).walkOpen && all('.ng-fwo .is-walk').length === 5 && inst2(m).session.attempts === 1 && /Ще ні/.test(text(q('.ng-fwo .ng-help-mini'))));
    check('FW-2 hints: the gate passes with the walk open', gate(m).length === 0, gate(m));
    click(hintButton());
    note();
    check('FW-2 hints: the third is the SMTP example; then the hint button goes and focus moves to its words', text(current()).includes(orderText('order-hint-example')) && hintButton() === null
      && document.activeElement === q('.ng-fwo [data-help-current] [data-help="hint"]') && text(q('.ng-fwo .ng-help-fold summary')) === 'Підказки (2)');
    check('FW-2 hints: the gate passes with every hint open', gate(m).length === 0, gate(m));
    check('FW-2 hints: hints never revealed the answer', !inst2(m).session.revealed && q('.ng-fwo-answer') === null);
  });

  orderScenario('FW-2 pass', m => {
    const task = task2(m), ref = reference(m);
    arrange(m, ref);
    check('FW-2 pass: arranged with ↑ like a student', JSON.stringify(state2(m).answer.order) === JSON.stringify(ref));
    click(main2());
    note();
    check('FW-2 pass: «✓ Так» and the words', status2() === `✓ Так ${orderText('order-ok')}`, status2());
    check('FW-2 pass: no marks, no walk toggle; the session is solved, not assisted', all('.ng-fwo .is-marked').length === 0 && !button2(orderUi.walkShow) && inst2(m).session.status === 'solved' && inst2(m).session.earned.solved && !inst2(m).session.assisted);
    check('FW-2 pass: «Чому так» with the input tips only on this level', text(q('.ng-fwo-result .ng-fw-caption')) === orderUi.tipsHeading && all('.ng-fwo-tips li').map(li => text(li)).join('|') === [orderUi.tips.replies, orderUi.tips.input].join('|'));
    check('FW-2 pass: the script is open in the success detail, under its label', all('.ng-fwo-result .ng-fw-caption').map(h => text(h)).includes(orderText('order-accepted-label')) && Boolean(q('.ng-fwo-result .ng-copy-pre')));
    const script = q('.ng-fwo-result .ng-copy-pre').textContent;
    check('FW-2 pass: the script is the learner\'s order, one RouterOS line per rule, through CopyBlock', script === prep2(m).acceptedScript({ order: ref }).script && script.split('\n').length === 5
      && script.split('\n').every((line, i) => line.startsWith(`/ip firewall filter add chain=${task.rules.find(r => r.id === ref[i]).chain} `)), script);
    check('FW-2 pass: the copy payload carries no ids', !task.rules.some(r => script.includes(r.id)) && /Скопіювати/.test(text(q('.ng-fwo-result .ng-copy-button'))) && text(q('.ng-fwo-result .ng-copy-button')).includes(orderUi.copyWhat));
    check('FW-2 pass: the hints and the reveal step aside; «Далі →» is the primary button, «Перевірити» stays (secondary), focus stays on it', hintButton() === null && !button2(orderUi.revealButton)
      && text(nextButton()) === shared.next && nextButton().className.includes('ng-button-primary') && !main2().className.includes('ng-button-primary') && document.activeElement === main2(),
      { next: text(nextButton()), nextClass: nextButton()?.className, main: main2()?.className, active: document.activeElement?.className });
    click(up2(4));
    check('FW-2 pass: the edited row is the stale verdict\'s evidence; the panel anchors right after it', all('.ng-fwo [data-evidence="current"]').length === 1
      && items()[3].querySelector('[data-evidence="current"]') !== null && q('.ng-fwo .ng-help-host')?.previousSibling === items()[3]);
    check('FW-2 pass: a reorder after success clears the result; the verdict stays, dimmed («до змін»), its tips and the checked order\'s script folded behind «Детальніше»; «Далі →» stays primary',
      state2(m).result === null && current()?.hasAttribute('data-help-stale') && q('.ng-fwo .ng-help-more .ng-fwo-result .ng-copy-pre')?.textContent === script && !q('.ng-fwo .ng-help-more').hasAttribute('open')
      && /до змін/.test(status2()) && nextButton()?.className.includes('ng-button-primary'));
    click(main2());
    arrange(m, ref);
    click(main2());
    const key0 = task2(m).instanceKey, seed0 = place2(m).seeds.input;
    click(nextButton());
    check('FW-2 pass: «Далі →» gives a new shuffle of this level, unchecked, the list heading focused', place2(m).seeds.input !== seed0 && task2(m).instanceKey !== key0 && status2() === '' && current() === null && document.activeElement === q('.ng-fwo-policy') && items().length === 5);
  });

  orderScenario('FW-2 pass by hint 2', m => {
    // A working order, not yet checked: hint 2's own check finds the pass.
    putOrder(m, reference(m));
    click(hintButton());
    click(hintButton());
    check('FW-2 pass by hint 2: the check it runs passes («✓ Так»), recorded once, solved with assistance', state2(m).result?.ok && /✓ Так/.test(status2()) && inst2(m).session.attempts === 1 && inst2(m).session.status === 'solved' && inst2(m).session.earned.solved && inst2(m).session.earned.assisted);
    check('FW-2 pass by hint 2: the hint button is gone, so the focus moves to «Далі →» (the primary)', hintButton() === null && document.activeElement === nextButton(), document.activeElement?.className);
    check('FW-2 pass by hint 2: the success is current (it wins over the hint), the tips and the script follow, as after «Перевірити»', current()?.getAttribute('data-help-tone') === 'ok'
      && q('.ng-fwo-result .ng-copy-pre') !== null && all('.ng-fwo-tips li').length === 2 && text(q('.ng-fwo .ng-help-fold summary')) === 'Підказки (2)');
    check('FW-2 pass by hint 2: its words are true for a list that passed, and pass the gate', hintWords(2) === `Підказка 2 з 3. ${orderUi.hintDone}` && firewallOrderLeaks(orderUi.hintDone).length === 0, hintWords(2));
  });

  orderScenario('FW-2 one hint counter', m => {
    click(hintButton());
    // A view restored without the hint (the lifecycle's own count behind the session's).
    step(() => m.store.dispatch({ type: 'instance', key: task2(m).instanceKey, action: { type: 'view', patch: { orderState: { ...state2(m), hintIndex: 0 } } } }));
    click(hintButton());
    check('FW-2 one hint counter: the session\'s count drives the transition (its second hint opens the walk)', inst2(m).session.hintIndex === 2 && state2(m).hintIndex === 2 && state2(m).walkOpen && all('.ng-fwo .is-walk').length === 5);
  });

  orderScenario('FW-2 pass, nine rules', m => {
    const task = task2(m), ref = reference(m);
    // A free interleaving: forward first, then input (verdicts and firing are the same).
    const order = [...ref.filter(x => task.rules.find(r => r.id === x).chain === 'forward'), ...ref.filter(x => task.rules.find(r => r.id === x).chain === 'input')];
    putOrder(m, order);
    click(main2());
    note();
    check('FW-2 pass, nine rules: another correct order passes too (checked by behaviour)', state2(m).result.ok && /✓ Так/.test(status2()));
    check('FW-2 pass, nine rules: all four tips, FastTrack first', all('.ng-fwo-tips li').map(li => text(li)).join('|') === ['fasttrack', 'replies', 'input', 'forward'].map(k => orderUi.tips[k]).join('|'));
    const lines = q('.ng-fwo-result .ng-copy-pre').textContent.split('\n');
    check('FW-2 pass, nine rules: the script follows that interleaving', lines.length === 9 && lines.slice(0, 4).every(l => l.includes('chain=forward')) && lines.slice(4).every(l => l.includes('chain=input')));
  }, { variantId: 'all' });

  orderScenario('FW-2 reveal', m => {
    click(main2());
    const learner = [...state2(m).answer.order];
    check('FW-2 reveal: before it, no reference anywhere', q('.ng-fwo-answer') === null && !text(fwo()).includes(orderText('order-reveal-label')) && gate(m).length === 0, gate(m));
    click(button2(orderUi.revealButton));
    note();
    const ref = reference(m);
    check('FW-2 reveal: one correct order, labelled so, focus on its heading', text(q('.ng-fwo .ng-reveal-heading')) === orderText('order-reveal-label') && document.activeElement === q('.ng-fwo .ng-reveal-heading')
      && all('.ng-fwo-answer li').map(li => text(li)).join('|') === ref.map(x => { const r = task2(m).rules.find(y => y.id === x); return `${r.chain} ${r.action === 'fasttrack-connection' ? 'fasttrack' : r.action} ${descOf(task2(m), x)}`; }).join('|'));
    check('FW-2 reveal: the session is revealed and assisted; the learner\'s list is untouched', inst2(m).session.revealed && inst2(m).session.assisted && state2(m).revealed && JSON.stringify(state2(m).answer.order) === JSON.stringify(learner));
    check('FW-2 reveal: «Далі →» is offered (primary) beside «Перевірити»', text(main2()) === orderUi.check && text(nextButton()) === shared.next && nextButton().className.includes('ng-button-primary'));
    check('FW-2 reveal: the answer is current; the earlier verdict goes; the reveal link is gone', current()?.querySelector('.ng-fwo-answer') !== null && !button2(orderUi.revealButton) && !/Ще ні/.test(text(q('.ng-fwo [data-help="message"]'))));
    check('FW-2 reveal: no row mark, «• Ще ні», current row or packet from the check before it', all('.ng-fwo .is-marked').length === 0 && all('.ng-fwo-mark').length === 0
      && all('.ng-fwo [data-evidence="current"]').length === 0 && q('.ng-fwo .ng-fw-chip') === null);
    click(main2());
    check('FW-2 reveal: a check after it shows as usual (its finding marked, the verdict current, never earned)', all('.ng-fwo .is-marked').length > 0 && current()?.getAttribute('data-help-tone') === 'no'
      && all('.ng-fwo [data-evidence="current"]').length === 1 && !inst2(m).session.earned.solved);
    arrange(m, ref);
    click(main2());
    check('FW-2 reveal: following it passes, still assisted and not earned', state2(m).result.ok && inst2(m).session.assisted && !inst2(m).session.earned.solved && /✓ Так/.test(status2()));
  }, { variantId: 'all' });

  wheelZoom('FW-2 wheel', () => mountOrder('input'), '.ng-fwo .ng-fw-frame', '.ng-fwo .ng-fw-zoom');

  // The dedicated FW-2 gate over every seeded surface before the reveal:
  // the first view, the check, the walk, «Текстом», for several seeds of both levels.
  for (const [variantId, seeds] of [['input', [1, 7, 11, 42]], ['all', [2, 5, 23, 99]]]) for (const seed of seeds) {
    orderScenario(`FW-2 gate ${variantId} ${seed}`, m => {
      const found = [];
      const look = label => { for (const f of gate(m)) found.push(`${label}:${f}`); for (const f of structure(m)) found.push(`${label}:structure:${f}`); };
      look('start');
      const ids = task2(m).rules.map(r => r.id);
      click(q('.ng-fwo button[aria-controls="ng-fwo-text"]'));
      look('text');
      key(q('#ng-fwo-text'), 'Escape');
      click(main2());
      look('checked');
      if (button2(orderUi.walkShow)) { click(button2(orderUi.walkShow)); look('walk'); click(q('.ng-fwo button[aria-controls="ng-fwo-text"]')); look('walk text'); }
      check(`FW-2 gate ${variantId} seed ${seed}: no reference, positions, ids or ordering prose before the reveal`, found.length === 0 && !ids.some(id => m.container.outerHTML.includes(id)), found.slice(0, 4));
    }, { variantId, seeds: { input: seed, all: seed } });
  }

  // The gate catches leaks injected into the production screen's DOM.
  function injected(name, breakIt) {
    orderScenario(`FW-2 inject ${name}`, m => {
      click(main2());
      const clean = [...gate(m), ...structure(m)];
      breakIt(m);
      const found = [...gate(m), ...structure(m)];
      check(`FW-2 gate catches ${name}`, clean.length === 0 && found.length > 0, { clean, found });
    }, { variantId: 'all' });
  }
  injected('a position in a data attribute', () => items()[0].setAttribute('data-position', '6'));
  injected('a rule id in a DOM id', m => items()[0].setAttribute('id', `row-${state2(m).answer.order[0]}`));
  injected('reference numbers on the handles', m => { const ref = reference(m); items().forEach((li, i) => { li.querySelector('.ng-reorder-n').textContent = String(ref.indexOf(state2(m).answer.order[i]) + 1); }); });
  injected('rows put in the reference order', m => { const ol = q('.ng-fwo ol.ng-reorder'), ref = reference(m), byId = Object.fromEntries(items().map((li, i) => [state2(m).answer.order[i], li])); for (const x of ref) ol.appendChild(byId[x]); });
  injected('a hidden mirror list in the reference order', m => { const ol = document.createElement('ol'); ol.setAttribute('class', 'ng-sr-only'); for (const x of reference(m)) { const li = document.createElement('li'); li.textContent = descOf(task2(m), x); ol.appendChild(li); } fwo().appendChild(ol); });
  injected('the script in a hidden node', m => { const p = document.createElement('p'); p.setAttribute('hidden', ''); p.textContent = prep2(m).solution().script.split('\n')[0]; fwo().appendChild(p); });
  injected('the reveal label in an accessible name', () => q('.ng-fwo-work').setAttribute('aria-label', orderText('order-reveal-label')));
  /** A row whose reference position differs from its current one. */
  const offRow = m => { const ref = reference(m), order = state2(m).answer.order; const i = order.findIndex((x, k) => ref.indexOf(x) !== k); return { i, n: ref.indexOf(order[i]) + 1 }; };
  injected('a reference position in a ↑ button\'s name', m => { const { i, n } = offRow(m); up2(i).setAttribute('aria-label', shared.reorder.up({ n })); });
  injected('a reference position in a handle\'s name', m => { const { i, n } = offRow(m); handle2(i).setAttribute('aria-label', handle2(i).getAttribute('aria-label').replace(/^\d+\./, `${n}.`)); });
  injected('a position name outside the list', () => q('.ng-fwo [data-help="row"]').setAttribute('aria-label', shared.reorder.down({ n: 3 })));
  injected('a React-shaped token in visible text', m => { const p = document.createElement('p'); p.textContent = `:r${reference(m).indexOf(state2(m).answer.order[0]) + 1}:`; fwo().appendChild(p); });
  injected('a React-shaped id with no element', () => items()[0].setAttribute('aria-describedby', ':r6:'));

  // Every FW-2 word the screen uses was on screen in some scenario above.
  const shown = [...seen].join(' ');
  const words = [orderUi.title, quoted(orderUi.policy), orderUi.check, shared.next, orderUi.revealButton, orderUi.tipsHeading, orderUi.mark, orderUi.walkShow, orderUi.walkHide,
    ...Object.values(orderUi.tips), orderText('order-ok'), orderText('order-verdict'), orderText('order-reveal-label'), orderText('order-accepted-label'),
    orderText('order-hint-question'), orderText('order-hint-walk'), orderText('order-hint-example'), ...orderRecord.variants.map(v => v.title), 'має: ', ' · у тебе: '];
  const missing = words.filter(w => !shown.includes(w.replace(/\s+/g, ' ')));
  check('FW-2 strings: every screen word and code was shown in a scenario', missing.length === 0 && Object.keys(orderCopy).length === 10, missing);
}

check('no React warnings or errors', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
process.exit(0);
