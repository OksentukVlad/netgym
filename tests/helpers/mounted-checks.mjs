// Mounted scenarios for «Перевірка мережі» (round 7): the real ChecksScreen in
// the app store, mounted with react-dom/client in tests/helpers/mini-dom.mjs.
// Run in its own process by tests/checks-mounted.test.mjs (tools/test.sh runs
// it first and passes the results file). Prints one JSON line: { results }.
//   - C3 «Що це доводить» (the default): «Вимога 1 з 6», the requirement, its
//     3–4 options with place, check and result; a wrong option stays marked
//     and open; the right one locks with the note and offers the next; the
//     round's end with a task-scope ✓ and «Новий раунд»; MikroTik's commands;
//   - C1 level 1: what must be, before any output; one output open, earlier
//     rungs folded without ✓/✗; «Далі ↓» / «Стоп: тут» (the last rung only
//     «Стоп: тут»); the places after a stop; a stop on the first unexpected
//     result with a place the evidence points to passes; a place it doesn't
//     point to stays marked; a stop elsewhere locks and offers «Спробувати ще
//     раз»;
//   - C1 level 2: the rungs on the PC and the router; a rung with an argument
//     types only its argument (an error names it); «Стоп: тут» on a missing
//     default route; «Усе працює» on a healthy network, refused until every
//     requirement is checked;
//   - C2: the claim, tappable lines and «жоден рядок»; wrong lines, then the
//     right ones, lock; the three verdicts; level 2's router output;
//   - a link's route opens its exercise; DHCP E4's «як це перевіряють на ПК →»
//     goes to «Де зламалось»; the worked example closed; no React warnings.
import { installDom } from './mini-dom.mjs';

const { document, fire } = installDom();
let random = 0;
Math.random = () => (random = (random + 0.1234567) % 1);
const warnings = [];
console.error = (...args) => warnings.push(args.map(String).join(' ').slice(0, 400));
console.warn = console.error;

const h = await import('../../.test-bundles/harness/mounted-checks.mjs');
const { act, proofs, ladder, claims, words } = h;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => root.querySelectorAll(selector);
const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = el => act(() => { el.focus?.(); fire(el, 'click'); });
const type = (el, value) => act(() => { el.value = value; fire(el, 'input'); });
const key = (el, k) => act(() => { fire(el, 'keydown', { key: k }); });
const radio = name => all('[role="radio"]').find(el => text(el).startsWith(name));
const option = words => all('.ng-ck-option').find(el => text(el).includes(words));
const button = words => all('button').find(el => text(el).includes(words));
const status = () => text(q('[data-help-current]'));
const tone = () => q('[data-help-current]')?.getAttribute('data-help-tone') ?? null;
const scope = () => q('[data-help-current]')?.getAttribute('data-help-scope') ?? null;
const action = () => text(q('#ng-ck-action'));
const placeOf = m => m.store.state.places.checks;
const setPlace = (m, patch) => act(() => m.store.dispatch({ type: 'place', scope: 'checks', patch }));

function scenario(name, fn, options) {
  const m = h.mountChecks(options);
  try { fn(m); } catch (e) { check(`${name}: ran`, false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}
/** The first seed from `from` whose task satisfies `ok`. */
function seedWhere(make, ok, from = 0) {
  for (let seed = from; seed < from + 2000; seed++) if (ok(make(seed))) return seed;
  throw new Error('no seed found');
}

// ── C3 «Що це доводить» ──
scenario('C3', m => {
  const seed = placeOf(m).proof.seed;
  const cards = proofs.proofSet(seed, { vendor: 'cisco' });
  check('C3 is the default exercise', placeOf(m).exercise === 'proof' && radio(words.modes.proof)?.getAttribute('aria-checked') === 'true');
  check('C3: «Вимога 1 з 6» and the first requirement', text(q('.ng-ck-progress')) === words.ui.requirement(1, 6) && text(q('.ng-ck-requirement')) === cards[0].requirement, text(q('.ng-ck-card')));
  check('C3: the action line names the options', action() === words.ui.proofAction && q('.ng-ck-proof').getAttribute('aria-labelledby') === 'ng-ck-action');
  check('C3: 3–4 options, each with its place, check and result', all('.ng-ck-proof .ng-ck-option').length === cards[0].options.length
    && cards[0].options.every(o => all('.ng-ck-option').some(el => text(el) === o.label)) && all('.ng-ck-option').every(el => text(el).includes('→')));
  check('C3: nothing chosen, no verdict, no «Перевірити»', !q('[data-help-current]') && !q('.ng-ck .ng-help-check') && !all('.ng-ck-option').some(el => el.getAttribute('aria-checked') === 'true'));
  check('C3: the worked example is folded', q('[data-worked-example] .ng-wex-toggle')?.getAttribute('aria-expanded') === 'false');
  check('C3: no option is marked in the DOM before a choice', !all('.ng-ck-option').some(el => /is-(ok|no)/.test(el.className)));
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i], wrong = card.options.find(o => !proofs.checkProof(card, o.id).ok), right = card.options.find(o => o.id === card.correctOptionId);
    if (i === 0) {
      click(all('.ng-ck-option').find(el => text(el) === wrong.label));
      check('C3: a wrong option: «Ще ні», a check needs its result, marked ✗, still open', tone() === 'no' && status().includes(wrong.reason)
        && all('.ng-ck-option').find(el => text(el).startsWith(wrong.label)).className.includes('is-no') && !q('.ng-ck-proof[aria-readonly="true"]'), status());
      check('C3: no next requirement before the right option', !button('Наступна вимога'));
    }
    click(all('.ng-ck-option').find(el => text(el).startsWith(right.label)));
    if (i === 0) {
      check('C3: the right option: ✓, the note, locked, «Відповідь зафіксовано.»', tone() === 'ok' && status().includes(right.reason)
        && q('.ng-ck-proof').getAttribute('aria-readonly') === 'true' && action() === words.screen.committed, status());
      check('C3: a part verdict (not the round)', scope() === 'part');
    }
    if (i < cards.length - 1) {
      click(button('Наступна вимога'));
      if (i === 0) check('C3: «Вимога 2 з 6», no verdict', text(q('.ng-ck-progress')) === words.ui.requirement(2, 6) && !q('[data-help-current]'));
    }
  }
  check('C3: the round ends with a task-scope ✓', status().includes(words.screen.proofDone) && scope() === 'task', status());
  click(q('.ng-help-next'));
  check('C3: «Новий раунд» moves to the next seed, «Вимога 1 з 6»', placeOf(m).proof.seed === seed + 1 && text(q('.ng-ck-progress')) === words.ui.requirement(1, 6));
  click(radio('MikroTik'));
  const ros = proofs.proofSet(seed + 1, { vendor: 'mikrotik' });
  check('C3 MikroTik: the router checks in RouterOS words', all('.ng-ck-option').some(el => text(el).includes('/ip dhcp-server lease print')) && ros[0].vendor === 'mikrotik', all('.ng-ck-option').map(text));
});

// ── C1 «Де зламалось», level 1 ──
scenario('C1 L1', m => {
  click(radio(words.modes.ladder));
  const seed = placeOf(m).ladder.tasks[1].seed;
  const task = ladder.createLadder(1, 'cisco', seed, { otherAddresses: true });
  const full = ladder.fixedRungs.map(id => ladder.runRung(task, id));
  const earliest = full.findIndex(e => !e.expected);
  check('C1 L1: the task and what must be, before any output', text(q('.ng-ck-task')) === words.ladder.task
    && all('.ng-ck-given-lines li').map(text).join('|') === ladder.requirementLines(task).join('|'), all('.ng-ck-given-lines li').map(text));
  check('C1 L1: one output open (ipconfig /all), nothing folded', text(q('.ng-ck-latest .ng-ck-command code')) === 'ipconfig /all' && !q('.ng-ck-folded')
    && text(q('.ng-ck-latest .ng-ck-pre')) === text({ textContent: full[0].output.text }));
  check('C1 L1: «Далі ↓» and «Стоп: тут», named by the action line', all('.ng-ck-turn .ng-ck-decide').map(text).join('|') === `${words.ui.next}|${words.ui.stop}`
    && q('.ng-ck-turn').getAttribute('aria-labelledby') === 'ng-ck-action' && action() === words.screen.turn);
  check('C1 L1: no ✓/✗ anywhere in the collected evidence', !/[✓✗]/.test(text(q('.ng-ck-collected'))));
  check('C1 L1: what «Стоп: тут» means, as its caption under it', text(q('.ng-ck-turn .ng-ck-stop-meaning')) === words.ui.stopMeaning
    && button(words.ui.stop).getAttribute('aria-describedby') === 'ng-ck-stop-meaning');
  click(q('[data-worked-example] .ng-wex-toggle'));
  check('C1 L1: the worked example is a numbered ladder without ✓ (it stops on a failed output)', q('.ng-wex-lines.is-numbered') && !/✓/.test(text(q('.ng-wex-card')))
    && all('.ng-wex-lines li').length === 4, text(q('.ng-wex-card')));
  click(q('[data-worked-example] .ng-wex-toggle'));
  click(button(words.ui.next));
  check('C1 L1: «Далі ↓» folds ipconfig to its command and one word; the gateway ping is open', all('.ng-ck-folded li summary').map(text).join('|') === full[0].folded
    && text(q('.ng-ck-latest .ng-ck-command code')) === full[1].command && !/[✓✗]/.test(text(q('.ng-ck-folded'))));
  click(button(words.ui.next)); click(button(words.ui.next));
  check('C1 L1: the last rung offers only «Стоп: тут»', all('.ng-ck-turn .ng-ck-decide').map(text).join('|') === words.ui.stop && action() === words.screen.turnLast);
  check('C1 L1: three folded rungs, one open', all('.ng-ck-folded li').length === 3 && all('.ng-ck-latest').length === 1);
  check('C1 L1: the earliest unexpected result exists in this task', earliest >= 0, earliest);
});

scenario('C1 L1 stop', m => {
  click(radio(words.modes.ladder));
  // A task whose first unexpected result is the gateway ping or later, so a stop can be early.
  const make = s => ladder.createLadder(1, 'cisco', s, { otherAddresses: true });
  const firstOf = t => ladder.fixedRungs.map(id => ladder.runRung(t, id)).findIndex(e => !e.expected);
  const seed = seedWhere(make, t => firstOf(t) >= 2);
  setPlace(m, { ladder: { level: 1, tasks: { 1: { seed }, 2: { seed: 1 } } } });
  const task = make(seed), earliest = firstOf(task);
  click(button(words.ui.stop));
  const evidence = [ladder.runRung(task, 'config')];
  check('C1 L1 stop: «Що перевіриш далі?» right above the six places', action() === words.ui.nextPlace && !q('.ng-ck-stop .ng-ck-stop-meaning')
    && all('.ng-ck-places .ng-ck-option').map(text).join('|') === ladder.placeChoices(evidence, 1).map(p => p.text).join('|'));
  click(option(words.places.more));
  check('C1 L1 stop: a stop on an expected result names the earliest, and the next output folded', tone() === 'no'
    && status().includes(words.ladder.earliest(ladder.runRung(task, ladder.fixedRungs[earliest]).command)) && status().includes(words.ladder.stoppedElsewhere)
    && text(q('.ng-ck-next-folded')) === ladder.runRung(task, 'gateway').folded, status());
  check('C1 L1 stop: a stop elsewhere marks no place and adds no place sentence', !all('.ng-ck-places .ng-ck-option').some(el => /is-(ok|no)/.test(el.className))
    && !status().includes(words.ladder.more) && !status().includes(words.ladder.consistent), status());
  check('C1 L1 stop: the places lock, «Спробувати ще раз» is offered', q('.ng-ck-places').getAttribute('aria-readonly') === 'true' && text(q('.ng-help-continue')) === words.screen.again);
  click(q('.ng-help-continue'));
  check('C1 L1 again: back to ipconfig, no verdict', text(q('.ng-ck-latest .ng-ck-command code')) === 'ipconfig /all' && !q('[data-help-current]') && !q('.ng-ck-places'));
  for (let i = 0; i < earliest; i++) click(button(words.ui.next));
  click(button(words.ui.stop));
  const rows = ladder.fixedRungs.slice(0, earliest + 1).map(id => ladder.runRung(task, id));
  const accepted = ladder.acceptedPlaces(rows), wrong = ladder.placeChoices(rows, 1).find(p => !accepted.includes(p.id));
  if (wrong) {
    click(option(wrong.text));
    check('C1 L1: a place the evidence doesn\'t point to: ✗, still open', tone() === 'no' && option(wrong.text).className.includes('is-no') && !q('.ng-ck-places[aria-readonly="true"]'), status());
  }
  const right = ladder.placeChoices(rows, 1).find(p => accepted.includes(p.id) && p.id !== 'more');
  click(option(right.text));
  check('C1 L1: the stop at the first unexpected result with a place it points to passes', tone() === 'ok' && scope() === 'task' && status().includes(words.ladder.stoppedThere)
    && q('.ng-ck-places').getAttribute('aria-readonly') === 'true', status());
  check('C1 L1: the level earns its ✓', all('.ng-ck-levels [role="radio"]')[0] && text(all('.ng-ck-levels [role="radio"]')[0]).includes('✓'));
  click(q('.ng-help-next'));
  check('C1 L1: «Далі →» moves to the next seed', placeOf(m).ladder.tasks[1].seed === seed + 1 && text(q('.ng-ck-latest .ng-ck-command code')) === 'ipconfig /all');
});

scenario('C1 L1 one place', m => {
  click(radio(words.modes.ladder));
  const make = s => ladder.createLadder(1, 'cisco', s, { otherAddresses: true });
  const seed = seedWhere(make, t => t.scenario.faultId === 'link');
  setPlace(m, { ladder: { level: 1, tasks: { 1: { seed }, 2: { seed: 1 } } } });
  click(button(words.ui.stop));
  click(option(words.places.more));
  check('C1 L1: «Media disconnected» points to one place: «потрібно більше даних» is not accepted, calmly', tone() === 'no'
    && status().includes(words.ladder.moreNotNeeded(words.places.link)) && option(words.places.more).className.includes('is-no') && !q('.ng-ck-places[aria-readonly="true"]'), status());
  click(option(words.places.link));
  check('C1 L1: then «кабель / адаптер» passes', tone() === 'ok' && scope() === 'task', status());
});

// ── C1 level 2 ──
scenario('C1 L2', m => {
  click(radio(words.modes.ladder));
  const make = s => ladder.createLadder(2, 'cisco', s, { otherAddresses: true });
  const seed = seedWhere(make, t => t.scenario.faultId === 'route');
  setPlace(m, { ladder: { level: 2, tasks: { 1: { seed: 1 }, 2: { seed } } } });
  const task = make(seed);
  check('C1 L2: the level 2 task, what must work', text(q('.ng-ck-task')) === words.ladder.chosenTask && all('.ng-ck-given-lines li').length === 4);
  check('C1 L2: no output yet, «Обери першу перевірку.»', !q('.ng-ck-latest') && action() === words.screen.chooseRung && !button(words.ui.stop));
  const rungs = ladder.rungs(task);
  check('C1 L2: every rung, on the PC and on the router', all('.ng-ck-rung').length === rungs.length
    && all('.ng-ck-rung-group').map(g => g.getAttribute('aria-label')).join('|') === `${words.screen.onPc}|${words.screen.onRouter}`);
  click(q('.ng-ck-rung[data-rung="gateway"]'));
  const field = q('.ng-ck-argument input');
  check('C1 L2: a rung with an argument opens its field (only the argument is typed)', field && text(q('.ng-ck-argument .ng-ck-verb')) === 'ping' && field.value === ladder.requirements(task).gateway);
  type(field, 'ping 8.8.8.8'); key(q('.ng-ck-argument input'), 'Enter');
  check('C1 L2: the whole command typed: «без «ping»», nothing runs', text(q('.ng-ck-argument-error')) === words.screen.withoutVerb('ping') && !q('.ng-ck-latest'), text(q('.ng-ck-argument-error')));
  type(q('.ng-ck-argument input'), '999.1.1.1'); key(q('.ng-ck-argument input'), 'Enter');
  check('C1 L2: a wrong argument is named', text(q('.ng-ck-argument-error')) === words.ladder.argument('999.1.1.1') && !q('.ng-ck-latest'), text(q('.ng-ck-argument-error')));
  const gateway = ladder.requirements(task).gateway;
  type(q('.ng-ck-argument input'), gateway); click(button(words.screen.run));
  check('C1 L2: the argument runs: the gateway ping open, the field closed', text(q('.ng-ck-latest .ng-ck-command code')) === `ping ${gateway}` && !q('.ng-ck-argument'));
  check('C1 L2: «Стоп: тут» and «Усе працює» after an output', button(words.ui.stop) && button(words.ladder.healthy) && action() === words.screen.chooseMore);
  click(q('.ng-ck-rung[data-rung="routes"]'));
  check('C1: earlier output can be reopened without losing the latest rung', q('.ng-ck-folded details summary') && q('.ng-ck-folded details .ng-ck-terminal'));
  check('C1 L2: a router rung runs at once: show ip route, the ping folded', text(q('.ng-ck-latest .ng-ck-command code')) === 'show ip route' && all('.ng-ck-folded li').length === 1);
  click(button(words.ui.stop));
  click(option(words.places.exit));
  check('C1 L2: a stop on the missing default route with «вихід в Інтернет» passes', tone() === 'ok' && status().includes('show ip route') && status().includes(words.ladder.stoppedThere), status());
});

scenario('C1 L2 healthy', m => {
  click(radio(words.modes.ladder));
  const make = s => ladder.createLadder(2, 'cisco', s, { otherAddresses: true });
  const seed = seedWhere(make, t => t.scenario.faultId === 'healthy');
  setPlace(m, { ladder: { level: 2, tasks: { 1: { seed: 1 }, 2: { seed } } } });
  const task = make(seed), r = ladder.requirements(task);
  const runArg = (id, value) => { click(q(`.ng-ck-rung[data-rung="${id}"]`)); type(q('.ng-ck-argument input'), value); click(button(words.screen.run)); };
  runArg('remote', r.remote);
  click(button(words.ladder.healthy));
  check('C1 L2 healthy: «Усе працює» before every requirement is checked names what is missing', tone() === 'no' && status().includes('Ще не перевірено') && status().includes(r.record.name), status());
  check('C1 L2 healthy: the learner can go on collecting', Boolean(q('.ng-ck-rung')));
  runArg('http', r.record.name); runArg('ssh', r.gateway);
  click(button(words.ladder.healthy));
  check('C1 L2 healthy: every requirement checked, nothing unexpected: «Усе працює» passes', tone() === 'ok' && scope() === 'task' && status().includes(words.ladder.healthyOk), status());
  check('C1 L2 healthy: done, the rungs go', !q('.ng-ck-rung') && action() === words.screen.committed);
});

// ── C2 «Прочитай вивід» ──
scenario('C2', m => {
  click(radio(words.modes.claims));
  const make = s => claims.createClaim(1, 'cisco', s);
  const seed = seedWhere(make, t => t.expectedLineIds.length > 0 && t.verdict !== 'insufficient');
  setPlace(m, { claims: { level: 1, tasks: { 1: { seed }, 2: { seed: 1 } } } });
  const task = make(seed);
  check('C2: the claim, the action line', text(q('.ng-ck-claim')) === task.claim && action() === words.ui.lines);
  click(q('[data-worked-example] .ng-wex-toggle'));
  check('C2: the worked example\'s lines carry no ✓', q('.ng-wex-lines.is-plain') && !/✓/.test(text(q('.ng-wex-card'))), text(q('.ng-wex-card')));
  click(q('[data-worked-example] .ng-wex-toggle'));
  check('C2: every line is a tappable button, plus «жоден рядок»', all('.ng-ck-terminal .ng-ck-line').length === task.lines.length && text(q('.ng-ck-none')) === words.ui.none);
  check('C2: no line is marked as evidence in the DOM', !all('.ng-ck-line').some(el => el.className.includes('is-on') || el.hasAttribute('data-evidence')));
  check('C2: «Перевірити рядки» waits for a choice', q('.ng-help-check')?.getAttribute('aria-disabled') === 'true' && text(q('.ng-help-check')) === words.screen.checkLines);
  click(q('.ng-ck-none')); click(q('.ng-help-check'));
  check('C2: «жоден рядок» when lines matter: «Ще ні», lines stay open', tone() === 'no' && status().includes(words.screen.linesWrong) && !q('.ng-ck-verdicts'), status());
  for (const id of task.expectedLineIds) click(q(`.ng-ck-line[data-line="${id}"]`));
  check('C2: a line tap unselects «жоден рядок»', q('.ng-ck-none').getAttribute('aria-pressed') === 'false' && all('.ng-ck-line.is-on').length === task.expectedLineIds.length);
  click(q('.ng-help-check'));
  check('C2: the right lines lock and step 2 asks «Що випливає з цих рядків?»', tone() === 'ok' && status().includes(words.screen.linesOk) && action() === words.screen.verdictAction
    && q('.ng-ck-line').getAttribute('aria-disabled') === 'true' && all('.ng-ck-verdicts .ng-ck-option').length === 3, status());
  const wrong = claims.verdictIds.find(v => v !== task.verdict);
  click(option(words.verdicts[wrong]));
  check('C2: a wrong verdict: ✗, still open', tone() === 'no' && option(words.verdicts[wrong]).className.includes('is-no') && !q('.ng-ck-verdicts[aria-readonly="true"]'), status());
  click(all('.ng-ck-verdicts .ng-ck-option').find(el => text(el).startsWith(words.verdicts[task.verdict])));
  check('C2: the right verdict: task-scope ✓ with the note', tone() === 'ok' && scope() === 'task' && status().includes(task.explanation), status());
  click(q('.ng-help-next'));
  check('C2: «Далі →» moves to the next seed', placeOf(m).claims.tasks[1].seed === seed + 1 && !q('[data-help-current]'));
});

scenario('C2 no line', m => {
  click(radio(words.modes.claims));
  const make = s => claims.createClaim(1, 'cisco', s);
  const seed = seedWhere(make, t => t.templateId === 'dns-from-ping');
  setPlace(m, { claims: { level: 1, tasks: { 1: { seed }, 2: { seed: 1 } } } });
  click(q('.ng-ck-none')); click(q('.ng-help-check'));
  check('C2 «DNS працює.» from a ping by IP: «жоден рядок» is right', text(q('.ng-ck-claim')) === 'DNS працює.' && tone() === 'ok', status());
  click(all('.ng-ck-verdicts .ng-ck-option').find(el => text(el).startsWith(words.verdicts.insufficient)));
  check('C2: «недостатньо даних» passes', tone() === 'ok' && scope() === 'task', status());
});

scenario('C2 L2', m => {
  click(radio(words.modes.claims));
  click(radio('2 · роутер'));
  const seed = placeOf(m).claims.tasks[2].seed, task = claims.createClaim(2, 'cisco', seed);
  check('C2 L2: a router output', all('.ng-ck-terminal .ng-ck-command code').some(el => /^(show |\/ip )/.test(text(el))) && text(q('.ng-ck-claim')) === task.claim, all('.ng-ck-command').map(text));
  click(radio('MikroTik'));
  check('C2 L2 MikroTik: RouterOS output', all('.ng-ck-terminal .ng-ck-command code').some(el => text(el).startsWith('/')), all('.ng-ck-command').map(text));
});

// Round 9 (Андрій): a setup deck's link keeps its vendor and what it configured.
scenario('a setup deck\'s link', m => {
  check('A19: three requirements, «Вимога 1 з 3», and no DHCP', /з 3/.test(text(q('.ng-ck-progress'))) && !/dhcp/i.test(text(q('.ng-ck'))), text(q('.ng-ck-progress')));
  check('A19: the task is about access, not a router', /^Доступ до пристрою налаштовано/.test(text(q('.ng-ck-task'))), text(q('.ng-ck-task')));
  check('A19: the deck\'s vendor wins over a remembered one', m.store.state.prefs.syntax === 'routeros' && /\/ip service|\/tool mac-server|\bssh /.test(text(q('.ng-ck'))));
}, { route: { section: 'checks', params: { ex: 'proof', scope: 'access', syntax: 'routeros' } } });

// ── Links ──
scenario('a link opens «Де зламалось»', m => {
  check('a link\'s route (ex=ladder) opens «Де зламалось»', placeOf(m).exercise === 'ladder' && q('.ng-ck[data-exercise="ladder"]'));
}, { route: { section: 'checks', params: { ex: 'ladder' } } });

{
  const m = h.mountDhcpWithNav();
  try {
    click(radio('ПК без мережі'));
    const link = button('як це перевіряють на ПК');
    check('DHCP E4: «як це перевіряють на ПК →» right under the four rows', link && link.closest('.ng-dh-checks') && !link.closest('.ng-dh-evidence'));
    click(link);
    check('DHCP E4: the link goes to «Де зламалось»', m.went.length === 1 && m.went[0].section === 'checks' && m.went[0].params.ex === 'ladder', m.went);
  } catch (e) { check('DHCP link: ran', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  m.unmount();
}

scenario('R9 C3 lease completes the requirement', m => {
  const seed = placeOf(m).proof.seed;
  const card = proofs.proofSet(seed, { vendor: 'cisco' })[0];
  const lease = card.options.find(o => o.id === 'binding-only');
  click(option(lease.label));
  check('A1: choosing the lease passes and offers the next requirement', tone() === 'ok' && button(words.screen.nextRequirement) && status().includes(lease.reason), status());
});

scenario('R9 C2 reveal', m => {
  click(radio(words.modes.claims));
  const seed = placeOf(m).claims.tasks[1].seed;
  const task = claims.createClaim(1, 'cisco', seed);
  click(q('.ng-help-reveal-link'));
  check('A2: reveal opens step 2 and marks a sufficient evidence set', all('.ng-ck-line.is-on').length === (task.expectedLineIds.length || 1)
    && q('.ng-ck-verdicts[aria-readonly="true"]') && status().includes(words.screen.revealedClaim), status());
  const instance = Object.entries(m.store.state.instances).find(([key]) => JSON.parse(key).exerciseId === claims.id)?.[1];
  check('A2: a revealed claim is assisted and never earns completion', instance?.session.revealed && !instance?.session.earned.solved, instance?.session);
});

scenario('R9 SSH first login', m => {
  click(radio(words.modes.ladder));
  const make = seed => ladder.createLadder(2, 'cisco', seed, { otherAddresses: true });
  const seed = seedWhere(make, t => t.scenario.faultId === 'host-key');
  setPlace(m, { ladder: { level: 2, tasks: { 1: { seed: 1 }, 2: { seed } } } });
  click(q('.ng-ck-rung[data-rung="ssh"]')); click(button(words.screen.run));
  check('A5: the normal key prompt offers explicit continuation', text(q('.ng-ck-key')).includes(words.screen.keyNormal) && button(words.screen.trustKey), text(q('.ng-ck-key')));
  click(button(words.screen.trustKey));
  check('A5: continuation shows the remote prompt and command response', text(q('.ng-ck-latest')).includes('R1> show clock') && !q('.ng-ck-key'), text(q('.ng-ck-latest')));
});

check('no React warnings', warnings.length === 0, warnings.slice(0, 3));
console.log(JSON.stringify({ results }));
