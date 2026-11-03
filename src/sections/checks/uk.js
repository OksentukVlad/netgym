// All Ukrainian learner-facing copy for the checks section.
export const section = {
  title: 'Перевірка мережі',
  blurb: 'ipconfig, ping, tracert, nslookup: як довести, що мережа працює, і де зламалось',
  advice: 'радимо спершу: DHCP і NAT',
};
export const modes = { proof: 'Що це доводить', ladder: 'Де зламалось', claims: 'Прочитай вивід' };
export const ui = {
  method: 'Перевіряй від найближчого і розбирайся з першим несподіваним результатом.',
  order: ['З’єднання', 'Адреса ПК', 'Шлюз', 'Віддалена адреса', 'Імена (DNS)', 'Потрібний сервіс'],
  next: 'Далі ↓', stop: 'Стоп: тут', nextPlace: 'Що перевіриш далі?',
  stopMeaning: 'Це перший несподіваний результат — розбираюсь тут. Це ще не діагноз.',
  lines: 'Обери рядки, що стосуються твердження.', none: 'жоден рядок',
  verdict: 'Що випливає з цих рядків?', skip: 'Пропустити', example: 'Приклад',
  cheaper: 'Перевірка шлюзу часто швидша. Інша перевірка теж корисна, якщо звужує коло причин.',
  pingLimit: 'Невдалий ping сам не розрізняє маршрутизацію, фільтрацію, NAT, зворотний шлях і мовчання вузла.',
  traceLimit: 'Зірочка означає, що відповіді цього вузла немає. Передавання пакетів може працювати.',
  dnsLimit: 'NXDOMAIN може бути очікуваним для відсутнього імені. Відповідь, інша адреса і тайм-аут — різні результати.',
  requirement: (n, total) => `Вимога ${n} з ${total}`,
  faultLink: 'як це перевіряють на ПК →', checkpointLink: 'далі: перевір, що працює →',
  proofAction: 'Яка перевірка це доведе, і що вона має показати?',
};
export const places = {
  link: 'кабель / адаптер', address: 'адреса ПК', gateway: 'шлюз', exit: 'вихід в Інтернет',
  dns: 'імена (DNS)', more: 'потрібно більше даних', service: 'потрібний сервіс',
};
export const verdicts = { yes: 'так', no: 'ні', insufficient: 'недостатньо даних' };
export const ladder = {
  task: 'Збери свідчення й зупинись на першому несподіваному результаті.',
  chosenTask: 'Обирай перевірки самостійно. Зупинись на першому несподіваному результаті або підтверди, що все працює.',
  rung: { config: 'адреса ПК', gateway: 'шлюз', remote: 'віддалена адреса', dns: 'ім’я', trace: 'шлях', ssh: 'вхід SSH', http: 'вебсторінка', interfaces: 'інтерфейси', addresses: 'адреси роутера', routes: 'маршрути', bindings: 'оренди DHCP', nat: 'стан NAT', routerPing: 'з роутера' },
  folded: { reply: 'відповідає', timeout: 'timed out', unreachable: 'unreachable', up: 'IPv4', down: 'Media disconnected', answer: 'Address', nxdomain: 'Non-existent domain', authenticated: 'Authenticated', denied: 'Access denied', refused: 'Connection refused', 'host-key': 'fingerprint', ok: '200 OK', 'dns-failure': 'Could not resolve host', 'wrong-answer': 'Address', 'http-error': '503', trace: 'Trace', table: 'вивід' },
  earliest: command => `Перший несподіваний результат був на «${command}».`,
  noneUnexpected: 'У зібраній послідовності несподіваного результату немає.',
  stoppedThere: 'Стоп був саме тут.', stoppedElsewhere: 'Стоп був на іншій перевірці.',
  consistent: 'Це місце узгоджується зі зібраними свідченнями. Перевір його далі.',
  inconsistent: 'Зібрані свідчення не вказують на це місце. Порівняй їх ще раз.',
  more: 'Потрібні додаткові свідчення: один результат не завжди визначає причину.',
  moreNotNeeded: place => `Свідчення вже вказують на одне місце: ${place}.`,
  argument: value => `Перевір аргумент «${value}»: потрібна IPv4-адреса або коректне ім’я вузла.`,
  argumentLong: max => `Ім’я задовге для цієї вправи: до ${max} символів.`,
  lan: (network, gateway) => `LAN: ${network}, шлюз ${gateway}`,
  record: (name, address) => `Довірений запис DNS: ${name} → ${address}`,
  mustWork: list => `Має працювати: ${list.join(', ')}`,
  must: { remote: ip => `відповідь від ${ip}`, http: name => `сайт ${name}`, ssh: ip => `вхід SSH на ${ip}` },
  healthy: 'Усе працює',
  healthyOk: 'Так: кожну вимогу перевірено, і жоден результат не був несподіваним. Перевірки підтверджують і справну мережу.',
  healthyUnexpected: command => `Результат «${command}» був несподіваним: зупинись і розберись із ним.`,
  healthyMissing: list => `Ще не перевірено: ${list.join(', ')}. Без цього «усе працює» — лише припущення.`,
  unknownRung: 'Обери одну із запропонованих перевірок.',
};
export const claims = {
  'dhcp-used': 'ПК має адресу LAN та показує ввімкнений DHCP і DHCP-сервер.',
  'gateway-dhcp': 'Саме DHCP надав показаний шлюз.',
  reply: 'ПК отримав ICMP-відповідь від цієї адреси.',
  'dns-from-ping': 'DNS працює.',
  'dns-answer': 'DNS повернув адресу для запитаного імені.',
  'ssh-login': 'Автентифікований вхід SSH виконано.',
  'icmp-service': 'Попри невдалий ping, автентифікований вхід SSH працює.',
  'binding-options': 'ПК зараз використовує правильні шлюз і DNS.',
  'route-choice': 'У таблиці є активний маршрут за замовчуванням.',
  'nat-state': 'Вивід містить стан source NAT для цього потоку.',
};
export const claimNotes = {
  'dhcp-used': 'Це ефективні налаштування ПК. Окремо звір адресу й оренду на роутері.',
  'gateway-dhcp': 'ipconfig не показує походження кожної опції. Потрібні дані пулу default-router разом з орендою.',
  reply: ui.pingLimit, 'dns-from-ping': 'ping за IP не звертається до DNS: жоден рядок не доводить і не спростовує роботу DNS.',
  'dns-answer': ui.dnsLimit,
  'ssh-login': 'Успішний вхід доводить лише рядок «Authenticated…»; будь-який інший результат — ще не вхід.',
  'icmp-service': 'ICMP може фільтруватися, а SSH — працювати. Успішний вхід підтверджує саме SSH.',
  'binding-options': 'Оренда на сервері не показує поточні ефективні опції клієнта: потрібен ipconfig /all на ПК.',
  'route-choice': 'Маршрут описує вибір передавання, але ще не доставку й відповідь.',
  'nat-state': 'Стан трансляції не доводить успіх сервісу. Порожня таблиця до трафіку не доводить відсутність налаштованого NAT.',
};
export const proofs = {
  requirements: { address: 'ПК отримує адресу', remote: 'ПК отримує відповідь від 8.8.8.8', ssh: 'SSH з LAN працює', http: 'сайт відкривається', telnet: 'telnet вимкнено', login: 'Новий обліковий запис перевірено перед вимкненням старого' },
  // Where an option runs: a local command «на ПК», a probe «з ПК», the router, and the two windows of the login check.
  where: {
    pc: command => `на ПК: ${command}`, probe: command => `з ПК: ${command}`, router: command => `на роутері: ${command}`,
    fresh: command => `з ПК, нове вікно: ${command}`, old: command => `у старому вікні: ${command}`,
  },
  // Results: one short result each (≤ about 45 characters after «→»).
  address: gateway => `IPv4 з LAN, DHCP Server: ${gateway}`,
  apipa: 'IPv4 169.254.x.x, DHCP Enabled: Yes',
  binding: 'сервер показує видану оренду',
  reply: 'отримано ICMP-відповідь', unreachable: 'Destination host unreachable',
  login: 'вхід виконано', key: 'показано запит ключа вузла', accessDenied: 'Access denied',
  page: '200 OK, сторінку отримано', httpError: 'HTTP/1.1 503 Service Unavailable',
  denied: 'з’єднання не вдалося',
  telnetCisco: 'transport input ssh на всіх VTY', telnetBoth: 'transport input telnet ssh',
  telnetRos: 'telnet disabled=yes; allowed-interface-list=none', telnetIpOnly: 'telnet disabled=yes',
  telnetMacOn: 'telnet disabled=yes; allowed-interface-list=all',
  existing: account => `сеанс ${account} ще відкритий`,
  feedback: 'Потрібні і перевірка, і її успішний результат.',
  addressNote: 'Адресу з LAN і DHCP-сервер видно на ПК; 169.254.x.x означає, що оренди немає. Запис оренди на роутері підтверджує видачу.',
  sshNote: 'SSH у LAN незалежний від доступу до віддалених адрес. Перед першим входом звір відбиток ключа з довіреним джерелом.',
  telnetNote: 'Невдале з’єднання не доводить вимкнення. Перевір усі VTY (лише ssh), а на MikroTik — і IP Telnet, і MAC-Telnet.',
  loginNote: 'Перед вимкненням старого облікового запису виконай новий вхід, не закриваючи чинний сеанс.',
};
export const examples = {
  context: 'Окрема мережа прикладу: ПК 192.0.2.50/24, шлюз 192.0.2.1, віддалений вузол 198.51.100.80.',
  note: 'Тут адреса й обидві перевірки ping очікувані. На nslookup немає відповіді: зупинись і збери більше даних про DNS та шлях до нього.',
  claimsContext: 'Приклад читання виводу в окремій мережі документації.',
  proofContext: 'Приклад доказу в окремій мережі документації.',
};

// The screens' own words (screens/*.jsx).
export const screen = {
  exercise: 'Вправа', syntax: 'Синтаксис', syntaxes: { cisco: 'Cisco', routeros: 'MikroTik' },
  level: 'Рівень', levels: ['Рівень 1', 'Рівень 2'],
  levelNames: { ladder: ['1 · по драбині', '2 · обираєш сам'], claims: ['1 · ПК', '2 · роутер'] },
  committed: 'Відповідь зафіксовано.',
  correct: 'Правильно.',
  newRound: 'Новий раунд', again: 'Спробувати ще раз',
  // C3 «Що це доводить»
  proofTask: 'Роутер налаштовано. Для кожної вимоги обери перевірку і результат, що її доводять.',
  nextRequirement: 'Наступна вимога →',
  proofDone: 'Усі вимоги має що довести.',
  // C1 «Де зламалось»
  given: 'Що має бути',
  turn: 'Цей результат очікуваний? Якщо ні — «Стоп: тут».',
  turnLast: 'Остання перевірка. Зупинись на першому несподіваному результаті.',
  chooseRung: 'Обери першу перевірку.',
  chooseMore: 'Результат очікуваний? Обери наступну перевірку. Якщо ні — «Стоп: тут».',
  decide: 'Рішення щодо останнього виводу',
  onPc: 'На ПК', onRouter: 'На роутері',
  argument: command => `Аргумент для «${command}»`,
  run: 'Виконати',
  withoutVerb: verb => `Введи лише адресу або ім’я — без «${verb}».`,
  latest: 'Останній вивід',
  collected: 'Зібрано',
  // C2 «Прочитай вивід»
  claimLead: 'Твердження',
  checkLines: 'Перевірити рядки',
  linesWrong: 'Не ті рядки. Обери саме ті, що стосуються твердження, або «жоден рядок».',
  linesOk: 'Рядки обрано правильно.',
  verdictAction: 'Що випливає з цих рядків?',
  verdictWrong: 'Ще ні. Звір твердження саме з цими рядками: що вони показують, а чого — ні.',
  outputOf: n => `Вивід ${n}`,
  // Links in from other sections live in their own uk.js.
};
