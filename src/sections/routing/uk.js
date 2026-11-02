// Routing diagnosis and screen copy; legacy probe feedback remains unchanged.
export const copy = {
  'routing.static.empty': 'Заповни це поле.',
  'routing.static.invalid-ip': 'Впиши IP-адресу: чотири числа від 0 до 255 через крапку.',
  'routing.static.invalid-prefix': 'Після адреси впиши / і довжину префікса від 0 до 32.',
  'routing.static.dst-not-network': 'Це адреса пристрою, а не мережі. Адреса мережі — перша адреса блоку (для /24 закінчується на .0).',
  'routing.static.wrong-destination': 'Це інша мережа. Подивись, яку мережу названо в цьому рядку.',
  'routing.static.mask-not-dotted': 'Впиши повну маску через крапки: /24 = 255.255.255.0, /30 = 255.255.255.252.',
  'routing.static.invalid-mask': 'Це не маска мережі. У двійковому записі спочатку йдуть усі одиниці, потім усі нулі.',
  'routing.static.wrong-mask': 'Маска правильна за формою, але не для цієї мережі. Перевір її префікс на схемі.',
  'routing.static.gateway-is-self': 'Це адреса цього роутера. Потрібна адреса сусіда на спільному лінку.',
  'routing.static.gateway-off-link': 'Ця адреса не на спільному лінку. Знайди адресу сусіда на схемі.',
  'routing.static.gateway-not-host': 'Це адреса мережі або широкомовна адреса. Потрібна адреса інтерфейсу сусіда.',
  'routing.static.gateway-not-router': 'На цій адресі немає роутера. Знайди адресу інтерфейсу сусіда на схемі.',
  'routing.static.blackhole-with-gateway': 'Для blackhole поле gateway має бути порожнім.',
  'routing.static.discard-with-gateway': 'Discard-маршрут не може мати шлюз.',
  'routing.static.invalid-discard': 'Ознака discard має бути логічним значенням.',
  'routing.static.discard-mismatch': 'Перевір тип маршруту: пересилання до сусіда чи відкидання пакета.',
  'routing.static.gateway-mismatch': 'Цей маршрут у завданні має йти через іншого сусіда. Подивись на схему: за яким роутером ця мережа?',
  'routing.static.primary-distance': 'Основному маршруту distance не потрібна (або 1).',
  'routing.static.backup-needs-distance': 'Для резервного маршруту впиши distance, більшу за основну.',
  'routing.static.backup-needs-higher-distance': 'Резервному маршруту потрібна більша distance в межах від 2 до 254.',
  'routing.static.invalid-distance': 'Distance має бути цілим числом від 1 до 254.',
  'routing.static.field-wrong': 'Перевір це поле.',
  'routing.static.ok': `Усі мережі бачать одна одну в обидва боки.`,
  'routing.static.no-route': 'немає маршруту до цієї адреси',
  'routing.static.no-device': 'шлюз у маршруті — адреса, якої ні в кого немає',
  'routing.static.loop': 'пакет пішов по колу. У цьому тренажері він зупиняється; справжній роутер ганяв би його, поки не скінчиться TTL — число переходів через роутери, яке ще лишилося пакету',
  'routing.static.unsupported': 'не підтримується',
  'routing.static.legacy-hint': ({ text }) => text,
  'routing.static.ttl-exceeded': 'Ще ні',
  'routing.static.return-path-failed': 'Не всі мережі досяжні.',
  'routing.static.unsupported-ecmp': 'Два наступні шлюзи мають однаковий пріоритет. Цей тренажер не моделює розподіл трафіку між ними.',
  'routing.static.wrong-path': 'Пакет пройшов через іншого сусіда, ніж вимагає цей сценарій.',
  'routing.static.coverage-missing': 'Маршрут має охоплювати всю мережу призначення, а не лише перевірену адресу.',
  'routing.static.objective-not-met': 'Зв’язок є, але форма маршруту ще не відповідає умові завдання.',
  'routing.static.could-use-default': 'Таблицю цього роутера можна скоротити маршрутом за замовчуванням.',
  'routing.static.could-summarise': 'Ці мережі можна об’єднати одним сумарним маршрутом.',
};

export function t(code, params = {}) {
  const entry = copy[code];
  return typeof entry === 'function' ? entry(params) : entry ?? `[${code}]`;
}

// ─── The routing screen ─────────────────────────────────────────────────────
// Round 1 wording from apps/cisco-routing/App.jsx and apps/mikrotik-routing/ (tag round1)
// App.jsx, shortened in round 2 step 7 (Fable's text inventory): each fact is
// said once, captions are Ukrainian. What both syntaxes say is in `shared`;
// where they differ, each syntax keeps its own.

/** The NetGym start screen card. */
export const section = {
  title: 'Маршрутизація',
  blurb: 'статичні маршрути: Cisco або MikroTik',
};

export const ui = {
  shared: {
    heading: 'Статичні маршрути',
    syntax: 'Синтаксис',
    variant: 'Варіант',
    variants: {
      'explicit-routes': 'кожна мережа окремо',
      defaults: 'default на тупіковому',
      specific: 'кожна мережа окремо',
      'stub-defaults': 'default на тупікових',
    },
    rulesDefaultDirection: 'Тому default пишемо лише вгору — до інтернету чи до центру, ніколи назустріч.',
    rulesDiscardSummary: 'Сумарний маршрут з невикористаним простором: якщо невідомі пакети можуть повернутися назад, на роутері, що тримає конкретні маршрути, додай discard для всього блоку (Cisco Null0, MikroTik blackhole). Конкретні маршрути довші, тож вони виграють.',
    rulesExactSummary: 'Сумарний маршрут має точно охоплювати потрібні мережі.',
    rulesDefaultSafety: 'Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад.',
    solved: 'розв’язано',
    // Task list (a drawer below 1440 px of content).
    tasks: 'Задачі',
    drawer: '☰ Задачі',
    close: '✕ Закрити',
    levelsCaption: 'РІВЕНЬ',
    allLevels: 'Всі',
    level: n => `Ур.${n}`,
    levelLabels: { 1: 'Легкий', 2: 'Базовий', 3: 'Середній', 4: 'Складний', 5: 'Експерт' },
    prevTask: 'Попередня задача',
    nextTask: 'Наступна задача',
    // Diagram.
    diagramCaption: 'СХЕМА',
    // Round 4 (spec R1): the old caption's legend, in an Aside with one decoded example.
    legendTitle: 'Як читати схему',
    // Round 5 (spec 5b-1 §1, R4): the legend reads this task's own values
    // (logic/legend.js legendFacts): its first LAN with its router's port, a
    // real link with both ends and their owners, the ISP's own gateway.
    legendLan: ({ network, port, address }) => `У рамці мережі — адреса мережі (${network}); біля роутера — його порт і адреса в цій мережі (${port} .${address.split('.').pop()} = ${address}).`,
    legendLink: ({ network, ends: [a, b] }) => `На лінку між роутерами — мережа лінку (${network}) й адреси обох кінців (${a.address} — кінець ${a.router}, ${b.address} — кінець ${b.router}): адреса сусіда — кінець іншого роутера.`,
    legendIsp: (end = null) => (end
      ? `У хмарі провайдера — адреса його шлюзу (${end.address} — кінець ${end.router}): це адреса сусіда для маршруту в інтернет.`
      : 'У хмарі провайдера — адреса його шлюзу: це адреса сусіда для маршруту в інтернет.'),
    ispGateway: ip => `шлюз ${ip}`,
    diagramLabel: 'Схема завдання',
    // The frame takes focus: «+» and «−» zoom; the arrows pan once it scrolls.
    frameLabel: 'Схема завдання: «+» і «−» змінюють масштаб',
    pannable: 'Схема завдання: «+» і «−» змінюють масштаб, стрілки прокручують',
    zoom: { group: 'Масштаб схеми', out: 'Зменшити', in: 'Збільшити', all: 'Уся схема', allLabel: 'Показати всю схему' },
    textButton: 'Текстом',
    textTitle: 'Схема текстом',
    // Work panel.
    // Round 5 (spec 5b-1 §1): the same words as the firewall's R1 block; a link row names the neighbour («до R2»).
    interfaces: router => `АДРЕСИ ЦЬОГО РОУТЕРА — ${router}`,
    linkTo: routers => `до ${routers.join(', ')}`,
    // Round 5 (R1): the action line above the routes.
    action: 'Заповни маршрут #1 і натисни «Перевірити».',
    // A long board's panel comes before the routes (task 15).
    actionBelow: 'Заповни маршрут #1 нижче і натисни «Перевірити».',
    // Repair v2: a long task in a short window shows its first sentence; the rest opens here.
    detailsOpen: 'Уся умова',
    detailsShut: 'Згорнути умову',
    dhcpNote: 'WAN отримує default по DHCP: тут default не пишемо, лише маршрути до внутрішніх мереж.',
    rowsCaption: router => `МАРШРУТИ — ${router}`,
    noRoutes: 'Маршрути не потрібні: усе підключено напряму.',
    routeTo: 'Маршрут до ',
    defaultRoute: 'Маршрут за замовчуванням',
    backup: 'резервний',
    primary: 'основний',
    summary: ' одним сумарним маршрутом',
    summarySuggestion: 'Порада: можна одним сумарним маршрутом',
    check: 'Перевірити',
    wrong: '❌ Помилка.',
    rowName: (router, n) => `${router}, маршрут #${n}`,
    copy: '📋 Скопіювати команди',
    // Step 6: the two modes, free rows, the network check and its drawing.
    mode: 'Режим',
    // Round 4 (spec R1 v2): what changes between the modes is the pre-named rows.
    modes: { guided: 'Із готовими рядками', free: 'Без готових рядків' },
    addRoute: '+ Маршрут',
    deleteRoute: n => `Видалити маршрут #${n}`,
    otherRoutes: 'Інші маршрути',
    notChecked: n => `Тут буде результат. Натисни «Перевірити» (перевірок: ${n}).`,
    status: { pass: '✓', fail: '✗', advice: '•', pending: '—' },
    statusWords: { pass: 'пройшла', fail: 'не пройшла', advice: 'порада', pending: 'ще не перевіряли' },
    legendRequest: 'суцільна — запит',
    legendReply: 'пунктир — відповідь',
    legend: 'Шлях пакета на схемі',
    linkDown: '⚡ впав',
    pathTitle: 'Шлях пакета',
    pathNone: 'Натисни «Перевірити», і тут буде шлях пакета.',
    // What a check opens, at the top of the work panel (each part folds).
    demoTitle: label => `Демонстрація: ${label}`,
    demoShow: '▶ Показати на схемі',
    otherSyntax: name => `Показати мовою ${name}`,
    otherSyntaxLabel: name => `Твої маршрути мовою ${name}`,
    sameMeaning: 'Обидва записи означають те саме — один маршрут мовою різних роутерів.',
    copied: '✓ Скопійовано',
    copyFailed: 'Не вдалося скопіювати — команди виділено, натисни Ctrl+C.',
    // Round 4 (spec R1): the fields' own words (the syntax adapters keep the round 1 ones for tests of the logic).
    fieldLabels: {
      cisco: { net: 'Мережа', mask: 'Маска', gw: 'Адреса сусіда (next-hop)', dist: 'Відстань (distance)' },
      routeros: { dst: 'Мережа призначення (dst-address)', gw: 'Шлюз — адреса сусіда (gateway)', dist: 'Відстань (distance)' },
    },
    // Round 5 (R4): the placeholders are symbols, routingPlaceholders below (no example addresses).
    rowOk: 'правильно',
    // Round 4 (spec R1): the «⋯» menu and the reveal applied to the rows.
    menuRules: 'Правила',
    menuChecks: 'Усі перевірки',
    copyCode: code => `Скопіювати код ${code}`,
    applied: 'Відповідь показано в рядках маршрутів; твоя спроба — під кнопкою «Моя відповідь».',
    myAnswer: 'Моя відповідь',
    showReference: 'Відповідь',
    referenceRows: router => `ВІДПОВІДЬ — ${router}`,
    // Task 15: what the check simulates, beside the task.
    failover: title => `Перевірка також моделює випадок «${title}»: тоді трафік має піти резервним шляхом.`,
    successSummary: 'Мережа працює: усі пінги проходять в обидва боки.',
    formErrorsSummary: 'Спочатку виправ позначені поля.',
    // Polish: live conversion between syntaxes, and the success lap.
    convertNote: name => `У ${name} цей маршрут не дописано або в ньому помилка: доповни чи виправ його там — або введи тут.`,
    replay: 'Показати ще раз',
    lapFailover: scenario => `${scenario} — резерв спрацював.`,
    // OPT-1 UI: discard input, the tips after a solve, the reveal.
    blackhole: 'blackhole (відкидати)',
    noGateway: '—',
    discardTitle: 'Discard для всього сумарного блоку',
    improveTitle: 'Що можна покращити (необов’язково — мережа вже працює)',
    tipRoute: (router, n) => `${router}, маршрут №${n}`,
  },
  // Step 9: «Інші адреси» and the task's short code.
  address: {
    // One sentence per refusal code (logic/codes.js codeErrors).
    codeErrors: {
      'unknown-letter': 'Такої літери коду немає — перевір першу літеру.',
      'unknown-variant': 'Такого номера задачі немає — перевір номер.',
      'bad-seed': 'Після роздільника введи від 1 до 4 цифр.',
      infeasible: 'Для цього коду адреси не вдалося підібрати — спробуй інший.',
    },
    other: 'Інші адреси',
    otherBusy: 'Підбираю адреси…',
    base: 'Основні адреси',
    copy: 'Скопіювати код',
    copied: '✓ Скопійовано',
    copyFailed: 'Не вдалося скопіювати — код виділено, натисни Ctrl+C.',
    copyFailedCode: code => `Не вдалося скопіювати. Код: ${code} — виділи його й натисни Ctrl+C.`,
    otherNone: 'Інших адрес для цієї задачі зараз не вдалося підібрати.',
    subtitle: 'Та сама задача з іншими адресами',
    previous: 'Попередні адреси:',
    previousLabel: code => `Повернутися до адрес ${code}`,
    // Announced (the screen's status) after the addresses change.
    changedOther: code => `Та сама задача з іншими адресами: ${code}.`,
    changedBase: code => `Основні адреси: ${code}.`,
    codeLabel: 'Код задачі',
    codePlaceholder: 'напр. A3b-4821',
    codeOpen: 'Відкрити',
    codeBusy: 'Відкриваю…',
  },
  cisco: {
    right: '✅ Вірно — ',
  },
  routeros: {
    defaultAll: '(весь невідомий трафік)',
    right: '✅ Вірно!',
  },
};

/** How each syntax writes a discard route's gateway, named in hint 2. */
const DISCARD_WORDS = 'Cisco: шлюз Null0; MikroTik: blackhole';

/** Step 6: names-only feedback, hint ladder and path text. */
export const networkUi = {
  internet: 'Інтернет', unknown: 'невідома мережа', unused: 'невикористана частина сумарної мережі',
  unknownDemo: 'пакет до невідомої адреси',
  state: {
    pass: '✓', stopped: router => `✗ зупинився на ${router}`,
    reply: router => `✗ відповідь зупинилась на ${router}`, loop: '✗ по колу',
    form: '✗ виправ маршрут', objective: '✗ мета не виконана', advice: 'Порада',
  },
  invalidDistance: 'Distance має бути цілим числом від 1 до 254.',
  normal: 'Звичайно', down: 'Якщо лінк до ISP1 недоступний', goal: 'Мета',
  label: (from, to) => `${from} → ${to}`,
  interface: (router, segment) => `${router} (${segment})`,
  objectiveLabel: (type, p) => ({
    summary: `${p.router}: ${p.lans} одним сумарним маршрутом`,
    'default-on': `${p.router}: маршрут за замовчуванням`,
    'no-default': `${p.router}: окремі маршрути до мереж`,
    'direct-neighbour': `${p.router} → ${p.to}`,
    'distance-order': `${p.router}: основний і резервний маршрути`,
  })[type] ?? p.router,
  success: '✓ Мережа працює! Усі пінги проходять в обидва боки.',
  formErrors: 'Спочатку виправ позначені маршрути',
  failed: sentence => `• Ще ні. ${sentence}`,
  probe: {
    'no-route': p => p.escapedToIsp ? `Пакет з ${p.from} до ${p.to} пішов через ${p.router} до провайдера: у ${p.router} немає маршруту до ${p.to}, тож його забрав маршрут за замовчуванням.` : `Пакет з ${p.from} до ${p.to} зупинився на ${p.router}: у ${p.router} немає маршруту до ${p.to}.`,
    discarded: p => `Пакет до ${p.to} відкинуто на ${p.router} discard-маршрутом — справжню мережу так відкидати не можна.`,
    'no-device': p => `Пакет з ${p.from} до ${p.to} зупинився на ${p.router}: шлюз у його маршруті — адреса, якої немає ні в кого на лінку.`,
    loop: p => `Пакет з ${p.from} до ${p.to} пішов по колу: ${p.router} передає його до ${p.next}, де він уже був. Хтось із них показує не в той бік.`,
    'ttl-exceeded': p => `Пакет з ${p.from} до ${p.to} пройшов забагато роутерів і не дійшов. Перевір, чи маршрути не ведуть по колу.`,
    'return-path-failed': p => `Пакет з ${p.from} дійшов до ${p.to}, а відповідь — ні: вона зупинилась на ${p.router}.`,
    'missing-return-route': p => `Класична помилка: маршрут туди є, а назад — ні. ${p.router} не знає, як відповісти ${p.from}.`,
    'unsupported-ecmp': p => p.supplied ? `${p.router} уже отримав маршрут за замовчуванням від провайдера по DHCP. Свій default тут не пишемо.` : `На ${p.router} два маршрути до одного призначення з однаковою distance. Тренажер не ділить трафік: залиш один або дай резервному більшу distance.`,
    'wrong-path': p => `${p.scenario}: пакет до ${p.to} пішов через ${p.actual}, а має — через ${p.expected}.`,
    'coverage-missing': p => `${p.allProbesPass ? 'Пінги проходять, але маршрут' : 'Маршрут'} на ${p.router} покриває не всю мережу ${p.to}: частина її адрес лишилась без маршруту.`,
    'unknown-space-loops': p => `Невідомий трафік ходить по колу ${p.cyclePath}.${p.cycleCause === 'defaults' ? `${p.cycleLength === 2 ? ' Два маршрути' : ' Маршрути'} за замовчуванням дивляться один на одного. Default веде лише вгору — до інтернету або до центру; з іншого боку пишуть конкретні маршрути.` : p.cycleCause === 'summary' ? ` Сумарний маршрут на ${p.summaryRouter} захоплює адреси, які ${p.summaryNext} повертає назад.` : ''}`,
    'internet-coverage-missing': p => `${p.router} шле в інтернет лише частину невідомих адрес: потрібен один маршрут за замовчуванням на все інше.`,
  },
  objectives: {
    summary: p => p.reason === 'too-wide' ? `Сумарний маршрут на ${p.router} ширший, ніж треба: він охоплює більше, ніж ${p.lans}${p.loops ? ' і невикористані адреси повертаються назад — це петля.' : '.'}` : `На ${p.router} ${p.lans} мають бути одним сумарним маршрутом, а не окремими.`,
    'default-on': p => `${p.router} тупіковий: завдання просить один маршрут за замовчуванням замість переліку мереж.`,
    'no-default': p => `Завдання просить на ${p.router} окремий маршрут до кожної мережі, без маршруту за замовчуванням.`,
    'direct-neighbour': p => `До ${p.to} з ${p.router} завдання просить іти через сусіда, за яким ця мережа стоїть напряму. Подивись на схему.`,
    'distance-order': () => 'Резервний маршрут має програвати основному: дай йому більшу distance, ніж основному.',
    'could-use-default': p => `Порада: таблицю ${p.router} можна скоротити маршрутом за замовчуванням. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад.`,
    'could-summarise': p => `Порада: на ${p.router} маршрути до ${p.lans} можна об'єднати в один сумарний.`,
  },
  hintsReady: 'Перевір зворотний шлях і поведінку, коли адреси немає на схемі.',
  // Rung 1: where to look (the verdict already says what happened).
  hintLook: ({ router, toward }) => `Де дивитися: маршрути ${router} (вибери ${router} на схемі). ${toward ? `Знайди рядок, що веде до ${toward}: його немає або він показує не туди.` : 'Знайди рядок, якого бракує або який показує не туди.'}`,
  hintsMove: () => 'Порівняй позначений рядок з адресами на схемі та виправ його поля.',
  distanceMove: 'Для основного маршруту вкажи меншу відстань, для резервного — більшу. Cisco: ip route <мережа> <маска> <адреса сусіда> <distance>; MikroTik: /ip route add dst-address=<мережа/префікс> gateway=<адреса сусіда> distance=<число>.',
  distanceExample: commands => `Приклад (інші числа): Cisco: ${commands.cisco.join('; ')}. MikroTik: ${commands.routeros.join('; ')}. Більша відстань лишає маршрут резервним, поки основний лінк працює.`,
  exampleLabel: example => `Приклад (інші числа): ${example}`,
  // Repair v1 (Fable/Astra, Null0): the discard placeholder is a symbol, so hint 2 names the word to type in each syntax.
  hint2: {
    'no-route': p => `На схемі знайди сусіда ${p.router} в напрямку ${p.to}. Додай маршрут через адресу цього сусіда на спільному лінку; перевір шлях відповіді.`,
    'unknown-space-loops': () => `Прибери, звузь або зміни напрямок маршруту, який повертає невідомий трафік назад. Для вільної частини сумарного блоку потрібен discard-маршрут (${DISCARD_WORDS}).`,
    'invalid-distance': () => 'Впиши цілу відстань у дозволених межах: основному маршруту меншу, резервному — більшу.',
    internet: () => 'Спрямуй невідомі адреси маршрутом за замовчуванням до виходу нагору. Перевір, що сусід не повертає їх назад.',
    'return-path-failed': p => `На ${p.router} додай або виправ маршрут у напрямку джерела запиту. Візьми адресу сусіда на спільному лінку.`,
    loop: () => 'Прибери, звузь або зміни напрямок маршруту, який повертає пакет до вже пройденого роутера.',
    'ttl-exceeded': () => 'Переглянь напрямки маршрутів уздовж показаного шляху та усунь повернення до вже пройденого роутера.',
    discarded: () => 'Залиш discard для вільних адрес сумарного блоку; до справжньої мережі додай конкретний маршрут через сусіда.',
    'no-device': p => `Заміни шлюз у рядку ${p.router} на адресу сусіда з його спільного лінку.`,
    'coverage-missing': () => 'Зістав маску маршруту з префіксом потрібної мережі на схемі: маршрут має охопити всю мережу.',
    'wrong-path': () => 'Порівняй відстані маршрутів до одного призначення. Основному дай меншу відстань, резервному — більшу.',
    'unsupported-ecmp': p => p.supplied ? 'Залиш отриманий від провайдера маршрут за замовчуванням; до внутрішніх мереж додай конкретні маршрути.' : 'Залиш один маршрут до призначення або дай резервному більшу відстань.',
    summary: () => `Порахуй спільні початкові біти потрібних мереж і запиши один сумарний маршрут. Вільну частину блоку захисти discard-маршрутом (${DISCARD_WORDS}).`,
    'summary-too-wide': () => `Маршрут охоплює зайве: звузь маску до спільного префікса потрібних мереж. Вільну частину сумарного блоку захисти discard-маршрутом (${DISCARD_WORDS}).`,
    'default-on': () => 'На тупіковому роутері спрямуй невідомі адреси до сусіда нагору; у зворотний бік залиш конкретні маршрути.',
    'no-default': () => 'Заміни маршрут за замовчуванням окремими маршрутами до чужих мереж за сусідом.',
    'direct-neighbour': () => 'Спрямуй маршрут через адресу прямого сусіда, за яким стоїть потрібна мережа.',
    'distance-order': () => 'Дай резервному маршруту більшу відстань, ніж основному.',
  },
  examples: {
    discard: commands => `на роутері з конкретними маршрутами до частин блоку 192.0.2.0/24 додай ${commands}. Довші конкретні маршрути виграють, решта адрес блоку відкидається.`,
    specific: commands => `мережа 198.51.100.0/24 стоїть за сусідом з адресою 203.0.113.2 на спільному лінку: ${commands}. Перевір зворотний шлях від сусіда.`,
    reply: commands => `сусід, щоб відповісти мережі 192.0.2.0/24, пише ${commands}.`,
    default: commands => `один рядок на все інше: ${commands}. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад.`,
    summary: commands => `192.0.2.0/25 і 192.0.2.128/25 збігаються в перших 24 бітах → один рядок: ${commands}.`,
    summaryFour: commands => `192.0.2.0/26, 192.0.2.64/26, 192.0.2.128/26, 192.0.2.192/26: чотири мережі, два біти → один рядок: ${commands}.`,
    distance: commands => `основний і резервний: ${commands}. Більше число програє, поки основний лінк живий.`,
    loop: () => 'R-A: усе → R-B, R-B: усе → R-A — пакет до невідомої адреси бігає між ними. Прибери, звузь або переглянь маршрут, що повертає трафік назад.',
    coverage: () => '/32 ловить одну адресу 198.51.100.7; /24 — усі 256 адрес мережі 198.51.100.0/24.',
  },
  demoDiscard: router => `${router} відкидає пакет до вільної частини блоку — так і має бути`,
  demoSummaryEscape: 'Пакет до вільної частини блоку вийшов до ISP: петлі немає, але власні адреси краще відкидати в себе.',
  demoLoop: (x, y) => `Пакет ходить ${x} ⇄ ${y}, доки не скінчиться TTL.`,
  demoStop: x => `${x} не знає, куди слати пакет до невідомої адреси, і відкидає його — так і має бути.`,
  demoDelivered: x => `Пакет дістався до ${x}.`,
  traceRequest: path => `Запит: ${path}`,
  traceReply: path => `Відповідь: ${path}`,
  traceStop: (path, sentence) => `${path}: ${sentence}`,
  traceArrived: path => `${path}: доставлено.`,
};

export const hintQuestions = {
  '1': 'Що має знати R1, щоб пакет з LAN-A дістався до LAN-B, і що має знати R2, щоб відповідь повернулась?',
  '2': 'Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад. А що має знати R1 про мережу за R2, щоб відповідь дійшла?',
  '3': 'За кожним роутером дві мережі. Які мережі для R1 чужі, і через кого до них іти? Те саме для R2 — у зворотний бік.',
  '3b': 'У R1 лише один сусід — чи вистачить йому одного правила «все інше — туди»? А що тоді має знати R2, щоб відповідь дійшла — і чому йому не можна відповісти тим самим правилом?',
  '4': 'R1 і R3 не сусіди. Через кого пакет з LAN1 потрапить до LAN3, і хто посередині має знати обидві крайні мережі?',
  '5': 'Куди йде невідомий трафік, а які мережі лежать у протилежному напрямку?',
  '6': 'Дві мережі за R2 стоять поруч. Чи можна описати їх одним рядком на R1, і якою має бути маска, щоб він охопив обидві, але не більше?',
  '7': 'Крайні роутери бачать лише R-HUB. Що їм писати? А R-HUB — як йому знати, за яким краєм яка LAN?',
  '8': 'R1 бачить тільки R2. Які мережі для R1 чужі — не лише LAN, а й лінки далі по ланцюжку — і через кого всі вони?',
  '8b': 'Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад. Що мають знати транзитні R2 і R3 про мережі в обидва боки?',
  '9': 'R1 уже отримує default від провайдера. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад. Що мають знати R2 і R3 про мережі далі від інтернету, а R1 — про всі внутрішні?',
  '10': 'Кожна LAN має власника — твого прямого сусіда. Навіщо пакету до неї йти в обхід через третього? А лінк між двома іншими — через кого?',
  '11': 'Філії бачать лише R-GW. Що їм писати? А R-GW: звідки йому знати, яка LAN за якою філією, щоб відповісти?',
  '12': "Офіс А і офіс Б не з'єднані напряму. Куди R-A і R-B слати все, чого не знають? Що має знати R-CORE, щоб відповіді з серверів повернулись в офіси?",
  '13': 'Чотири мережі за R2 стоять поруч і вирівняні на межу /22. Скільки біт треба «відкусити» від /24, щоб один рядок на R1 охопив усі чотири? А що R2 знає у зворотний бік?',
  '14': 'Дві мережі Філії-1 — сусідні. Чи можна дати R-HQ один рядок на обидві? Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад.',
  '15': 'Два маршрути за замовчуванням на одному R1 — як роутер обере головний? Яке число робить ISP1 основним, а ISP2 — резервним?',
  '16': 'Пакет з LAN1 іде вгору чи вниз? Хто на кожному рівні має знати, що під ним, а кому вистачить «усе інше — вгору»? Починай з ACC.',
  '17': 'Куди піде пакет до вільної частини блоку: хто прийме його за сумарним маршрутом і куди відправить далі?',
};
Object.assign(copy, {
  'routing.static.discarded': networkUi.probe.discarded,
  'routing.static.unknown-space-loops': networkUi.probe['unknown-space-loops'],
  'routing.static.internet-coverage-missing': networkUi.probe['internet-coverage-missing'],
  'routing.static.distance-order': networkUi.objectives['distance-order'],
  'routing.static.hint-question': ({ text }) => text,
  'routing.static.hint-evidence': ({ text }) => text,
  'routing.static.hint-example': ({ text }) => text,
  'routing.static.form-errors': networkUi.formErrors,
  'routing.static.missing-return-route': networkUi.probe['missing-return-route'],
});

/** Ukrainian cardinal forms, including 11–14. */
export function routePlural(count) {
  const n = Math.abs(count) % 100, last = n % 10;
  return n >= 11 && n <= 14 ? 'маршрутів' : last === 1 ? 'маршрут' : last >= 2 && last <= 4 ? 'маршрути' : 'маршрутів';
}

export const optimiserUi = {
  // The search's limits in one line (spec OPT-1 UI U7), under the ★ and the reveal.
  searchLimits: 'Перевірено два кандидати на кожному роутері за один прохід; коротший варіант може існувати.',
  // «Показати найкоротший варіант» (after the exact instance is earned).
  bestShow: 'Показати найкоротший відомий варіант',
  bestHide: 'Сховати найкоротший відомий варіант',
  bestTitle: 'Найкоротший відомий варіант',
  bestLine: total => `Відомий варіант, що проходить усі змодельовані перевірки: ${total} ${routePlural(total)}. ${optimiserUi.searchLimits}`,
  tips: {
    'duplicate-route': p => `На ${p.routerId} цей маршрут повторює інший — один можна прибрати.`,
    'route-to-connected': p => `На ${p.routerId} цей маршрут веде до мережі, яка вже підключена до ${p.routerId} напряму, — він не потрібен.`,
    'same-in-fewer': p => `На ${p.routerId} та сама поведінка вміщується в ${p.could} ${routePlural(p.could)} замість ${p.now}.`,
    'no-destination-route': p => `Маршрут на ${p.routerId} веде лише в адреси, яких у цій моделі мережі немає, — його можна прибрати.`,
    'shorter-known': p => `Відомий безпечний варіант має ${p.total} ${routePlural(p.total)}, у тебе — ${p.count}.`,
  },
  // The same tips on the screen, after «R1, маршрут №2: » or «R1: », so the
  // router isn't named twice; a count with no place keeps its sentence.
  tipsAfterPlace: {
    'duplicate-route': () => 'повторює інший — один можна прибрати.',
    'route-to-connected': () => 'веде до мережі, підключеної до роутера напряму, — він не потрібен.',
    'same-in-fewer': p => `та сама поведінка вміщується в ${p.could} ${routePlural(p.could)} замість ${p.now}.`,
    'no-destination-route': () => 'веде лише в адреси, яких у цій моделі мережі немає, — його можна прибрати.',
  },
};
for (const [code, text] of Object.entries(optimiserUi.tips)) copy[`routing.static.${code}`] = text;

export const faultCauseText = Object.freeze({
  'missing-route': 'Одного маршруту немає',
  'wrong-destination': 'У маршруті вказана інша мережа призначення',
  'wrong-next-hop': 'У маршруті до мережі вказаний інший сусід',
  'default-wrong-way': 'Маршрут за замовчуванням веде не до того сусіда',
});
export const faultRequirements = Object.freeze({
  internet: (sources, exclusions) => `З мереж ${sources.join(', ')} всі адреси поза мережами на схемі${exclusions.length ? `, крім ${exclusions.join(', ')},` : ''} мають бути доступні через інтернет.`,
});
export const faultText = Object.freeze({
  title: 'Знайди несправність',
  instructions: 'Одна річ у налаштуваннях зламана. Знайди й виправ.',
  fix: 'Виправ', cause: 'Що було не так?',
  internetFailure: router => `${router}: не всі адреси поза мережами на схемі доступні через інтернет. Перевір умову та її винятки.`,
  initial: 'на початку', checked: 'після перевірки',
  question: 'Знайди перший пінг, що не проходить, і подивись, де зупинився запит або відповідь.',
  move: 'На роутері, де зупинився пакет, зістав мережу призначення з таблицею. Додай або виправ маршрут через сусіда в потрібному напрямку та перевір зворотний шлях.',
  causeMove: 'Залиш правильний ремонт. Зістав початкову таблицю зі своїми змінами та обери, що саме заважало пакету пройти.',
  scopeMove: 'Пінги перевіряють окремі адреси. Перевір маршрути до всього потрібного блоку та шлях невідомих адрес: вони не мають ходити по колу. Після змін перевір мережу ще раз.',
  wrongDestination: ({ router, dst, prefix, destination }) => `${router}: маршрут до ${dst}/${prefix} не охоплює ${destination}.`,
  otherCause: 'Ремонт правильний — залиш його. Причина була інша.',
  chooseCause: 'Мережа працює. Що було не так?',
  complete: 'Мережа працює, причину знайдено.',
  compare: 'Пінги проходять. Порівняй зміни з налаштуваннями на початку.',
  stopped: ({ direction, router, destination, code, next }) => {
    const packet = direction === 'reply' ? 'Відповідь' : 'Пакет';
    if (code === 'no-route') return `${packet} зупиняється на ${router}: немає маршруту, що підходить до адреси ${destination}.`;
    if (code === 'loop') return `${packet} ходить по колу: ${router} передає його до ${next}, де він уже був.`;
    if (code === 'ttl-exceeded') return `${packet} пройшов забагато роутерів і не дійшов до адреси ${destination}.`;
    if (code === 'no-device') return `${packet} зупиняється на ${router}: наступний пристрій недоступний.`;
    return `${packet} зупиняється на ${router}.`;
  },
});
export function faultExample(code) {
  const example = {
    'missing-route': 'R-A не має маршруту до 198.51.100.0/24. Додай його через сусіда 203.0.113.2 на спільному лінку та перевір відповідь.',
    'wrong-destination': 'Рядок до 192.0.2.0/24 не охоплює 198.51.100.7. Заміни призначення на потрібну мережу 198.51.100.0/24 через сусіда 203.0.113.2.',
    'default-wrong-way': 'Вихід нагору — через R-C. Спрямуй default до його адреси 203.0.113.2 на спільному лінку; у зворотний бік залиш конкретні маршрути.',
    'wrong-next-hop': 'Мережа 198.51.100.0/24 стоїть за R-C. Заміни шлюз рядка на адресу R-C на спільному лінку — 203.0.113.2.',
  }[code];
  return example ? `Приклад (інші числа): ${example}` : undefined;
}

// RF-1 reuses the existing routing form and safety findings. Observation text
// is supplied by faults-exercise.feedback; hints never use guided row advice.
for (const [key, value] of Object.entries(copy)) if (key.startsWith('routing.static.'))
  copy[key.replace('routing.static.', 'routing-faults.')] = value;
Object.assign(copy, {
  'routing-faults.internet-coverage-missing': p => faultText.internetFailure(p.router),
  'routing-faults.invalid-config': 'Перевір поля маршруту.',
  'routing-faults.fault-cause-required': faultText.chooseCause,
  'routing-faults.fault-cause-other': faultText.otherCause,
  'routing-faults.invalid-cause': 'Обери причину зі списку.',
  'routing-faults.fault-hint-question': p => p.code ? faultText.stopped(p) : faultText.compare,
  'routing-faults.fault-hint-evidence': p => p.fixed ? faultText.causeMove : p.noStop ? faultText.scopeMove : faultText.move,
  'routing-faults.fault-hint-example': p => p.example,
});

/** RF-1 screens («Знайди несправність» in the routing section,
 * screens/FaultsView.jsx). The task sentence, snapshot labels, check
 * feedback, hints and cause labels come from the logic (faultText,
 * faultCauseText); these are the screen's own words. */
export const faultsUi = {
  // The routing section's two exercises (the switch on the address row).
  exercise: 'Вправа',
  exercises: { tasks: 'Налаштуй маршрути', faults: 'Знайди несправність' },
  level: 'Рівень',
  levelN: n => `Рівень ${n}`,
  again: 'Далі',
  // A new instance is built after a paint (the four-router network takes seconds).
  preparing: 'Готую задачу…',
  // task.requirements (the logic's sentences), one compact line under the task sentence; none, no line.
  requirementsLead: 'Умови:',
  // The ping list: a snapshot, never live.
  pings: 'ПІНГИ',
  snapshots: 'Пінги: які показати',
  pick: 'Торкнись пінгу — його шлях з’явиться на схемі.',
  // Hint 2 says which pings it read: «Пінги на початку: Пакет зупиняється…».
  hintFrom: where => `Пінги ${where}: `,
  works: 'працює',
  fails: 'не працює',
  notApplied: 'Рядки з помилками в цю перевірку не ввійшли.',
  passing: n => (n === 1 ? 'ще 1 працює' : `ще ${n} працюють`),
  allPassing: n => (n === 1 ? '1 працює' : `усі ${n} працюють`),
  // The drawn path, above the diagram.
  pathOf: (label, where) => `Шлях: ${label} · ${where}`,
  // The work panel.
  routes: router => `МАРШРУТИ — ${router}`,
  otherRouters: 'Інший роутер — на схемі або кнопкою під нею.',
  noRows: 'Маршрутів немає. Додай кнопкою «+ Маршрут».',
  check: 'Перевірити',
  // «Показати відповідь»: the cause and the one changed route, before → after.
  revealCause: 'Причина',
  revealChange: router => `Змінений рядок на ${router}`,
  was: 'було',
  now: 'стало',
  noRow: 'рядка немає',
  sides: { before: 'до виправлення', after: 'після виправлення' },
  // Round 4 (spec R2 with v2): one line per failing ping, the start or now.
  pingStop: (router, reply) => `${reply ? 'назад зупинився' : 'зупинився'} на ${router}`,
  pingFails: '✗ не проходить',
  pingFailsWords: 'не проходить',
  passingFold: n => (n === 1 ? 'ще 1 проходить' : `ще ${n} проходять`),
  allPassingFold: n => (n === 1 ? '1 проходить' : `усі ${n} проходять`),
  snapsNow: 'зараз',
  wasFailing: n => `на початку не проходило: ${n}`,
  // The learner's edits against the original table (no row points at the fault).
  diffWas: 'було',
  diffNew: 'новий рядок',
  diffRemoved: 'видалено',
  original: 'Початкова таблиця',
  originalHide: 'Сховати початкову таблицю',
  originalOf: router => `Початкова таблиця — ${router}`,
  levelsLabel: 'Рівень',
  // Round 5 (R1): the action line, above the table while fixing, above the cause question after a passing fix.
  // Repair (Astra 3): the device where a ping stops isn't necessarily the faulty router.
  action: 'Простеж шлях пінгу, знайди помилку в таблицях маршрутів і виправ її.',
  actionCause: 'Обери причину й натисни «Перевірити».',
};

// Round 5 data contract; screen writers replace ui.shared.placeholders with
// these words in guided, free and fault editors. No answer-valued examples.
export const routingPlaceholders = {
  // Repair (Fable 3): short enough for a 1000 px window's fields.
  cisco: { net: 'адреса мережі', mask: 'маска', gw: 'адреса сусіда', gwDiscard: 'інтерфейс відкидання', dist: 'distance' },
  routeros: { dst: 'адреса мережі/префікс', gw: 'адреса сусіда', dist: 'distance' },
  // Task 15 keeps its distance teaching example (R4 exempt).
  distanceExample: '1 — основний, 5 — резервний',
  defaultRoute: '0.0.0.0/0',
};
