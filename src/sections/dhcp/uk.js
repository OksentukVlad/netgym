// All learner-facing Ukrainian for DHCP and NAT, including generated captions.
export const section = {
  title: 'DHCP і NAT',
  blurb: 'як ПК отримує адресу і як виходить в Інтернет',
  advice: 'радимо спершу: IP-адреси',
};
export const modes = { sides: 'WAN чи LAN', server: 'DHCP-сервер', nat: 'Що бачить сайт' };
export const actions = {
  sides: 'Обери, якого боку стосується налаштування.',
  range: 'Впиши діапазон, який роутер може роздавати.',
  options: 'Впиши шлюз і DNS для ПК.',
  exclusions: 'Виключи адреси, які роутер не має роздавати.',
  wizard: 'Заповни шлюз, діапазон і DNS у порядку майстра.',
  source: target => `Яку адресу відправника побачить ${target}?`,
  reply: 'Куди роутер віддасть відповідь?',
  inside: 'На якому інтерфейсі має бути ip nat inside?',
  acl: 'Обери ACL, який вибирає точно ці мережі.',
  masquerade: 'Обери правило для виходу ПК через WAN.',
  committed: 'Відповідь зафіксовано.',
};
export const labels = {
  wan: 'бік провайдера (WAN)', lan: 'локальна мережа (LAN)',
  from: 'від', to: 'до', gateway: 'Шлюз для ПК', dns: 'DNS для ПК',
  addExclusion: '+ ще один рядок', native: 'так це виглядає в налаштуваннях',
  replay: 'По кроках', dora: 'Як ПК отримує адресу',
  newRound: 'Новий раунд', check: 'Перевірити', next: 'Далі',
  otherAddresses: 'Інші адреси', levels: ['Рівень 1', 'Рівень 2', 'Рівень 3'],
  card: (n, total) => `картка ${n} з ${total}`,
  clients: n => `у мережі до ${n} ПК і телефонів`,
  providerDns: dns => `DNS провайдера: ${dns.join(', ')}`,
  forwardsDns: 'роутер відповідає на DNS-запити ПК з LAN',
  automaticExclusion: 'адресу інтерфейсу Cisco виключено автоматично',
  network: 'мережа', router: 'роутер', yourRange: 'твій діапазон', yourPool: 'твій пул',
  noRange: 'ще не задано',
  devices: ['принтер', 'сервер', 'камера'],
  deviceGenitives: ['принтера', 'сервера', 'камери'],
  website: 'сайт', lanServer: 'сервер у LAN', routerTarget: 'роутер',
  pcAddress: ip => `${ip} — адресу ПК`,
  wanAddress: ip => `${ip} — WAN-адресу роутера`,
  lanAddress: ip => `${ip} — LAN-адресу роутера`,
  toPc: ip => `на ПК ${ip}`, keepReply: 'залишить собі', noReply: 'нікуди — адреса приватна',
  trainingPublic: '203.0.113.x — публічні адреси для навчання',
  viaIsp: '.53 і .80 розташовані поза WAN /30; шлях до них — через шлюз провайдера.',
};
export const verdicts = {
  correct: 'Правильно.', incorrect: 'Перевір ще раз.',
  sidesDone: 'Усі картки на своєму боці.',
  allocation: 'Діапазону вистачає, зайняті адреси не роздаються.',
  server: 'ПК отримує адресу, шлюз і DNS із твоїх налаштувань.',
  lease: (ip, prefix) => `ПК отримав ${ip}/${prefix}`,
  gateway: ip => `шлюз ${ip}`, dns: ips => `DNS ${ips.join(', ')}`,
  natWebsite: ip => `Сайт бачить WAN-адресу R1 (${ip}): R1 замінив адресу відправника.`,
  natLan: ip => `У LAN адреса відправника лишається ${ip}; NAT тут не застосовується.`,
  natRouter: ip => `Сам роутер бачить адресу ПК ${ip}; пакет не виходить через WAN.`,
  natReply: ip => `За збереженою парою R1 повертає відповідь на ПК ${ip}.`,
  inside: 'LAN-інтерфейс — inside; WAN-інтерфейс — outside.',
  acl: 'ACL вибирає точно задані LAN для перекладу.',
  wrongAcl: 'Цей ACL не вибирає точно задані LAN.',
  masquerade: 'Правило змінює відправника на WAN (ether1).',
  wrongInterface: 'Правило вибирає LAN, а цей пакет виходить через WAN.',
  wrongSource: 'Правило вибирає іншу мережу, а не мережу цього ПК.',
};
export const findings = {
  syntax: 'Впиши коректні IPv4-адреси в кожному рядку.',
  order: 'Адреса «від» має бути не більшою за адресу «до».',
  outside: (ip, net, prefix) => `Адреса ${ip} поза мережею ${net}/${prefix}.`,
  boundary: (ip, broadcast) => `Діапазон містить ${broadcast ? 'широкомовну адресу' : 'адресу мережі'} (${ip}).`,
  static: (name, ip) => `Діапазон містить адресу ${name} (${ip}).`,
  router: ip => `Діапазон містить адресу роутера (${ip}).`,
  capacity: (count, needed) => `Доступно ${count} адрес, а потрібно ${needed}.`,
  gateway: ip => `Шлюз для ПК — LAN-адреса роутера (${ip}).`,
  dns: 'Вкажи один або кілька DNS із наведених у задачі.',
  dnsWithRouter: 'Вкажи DNS із задачі або LAN-адресу роутера: він відповідає на DNS-запити ПК.',
  invalidChoice: 'Спочатку обери відповідь.',
};
export const dora = [
  'Discover → Offer → Request → ACK: ПК шукає сервер, отримує пропозицію, запитує адресу й отримує підтвердження.',
  'Разом з адресою сервер передає маску, шлюз, DNS і час оренди; відповіді можуть бути широкомовними або адресними.',
  'Адреса надається на час оренди. Для продовження ПК надсилає REQUEST, а сервер підтверджує ACK.',
  'Якщо оренду не продовжено, після її завершення адресу можна видати іншому клієнту.',
];
export const natNotes = {
  assumptions: 'У R1 одна публічна адреса на WAN; маршрути й фаєрвол дозволяють цей трафік. NAT увімкнено лише на R1; провайдер адрес не перекладає.',
  acl: 'ACL для NAT лише вибирає, що перекладати; він не дозволяє трафік.',
  overload: 'overload — багато ПК за однією адресою',
  masquerade: 'masquerade бере поточну адресу WAN — зручно, коли провайдер видає її по DHCP.',
  collisionFree: 'У цих потоках немає конфліктів портів, тому NAT зберігає номер порту.',
  wanMembership: 'WAN = ether1; LAN = bridge.',
  replay: ({ pc, wan, remote, port, remotePort }) => [
    `пакет ${pc}:${port} → ${remote}:${remotePort} виходить з ПК`,
    `роутер замінює відправника: ${wan}:${port} → ${remote}:${remotePort} і запам’ятовує пару`,
    `відповідь ${remote}:${remotePort} → ${wan}:${port}`,
    `роутер міняє адресу отримувача назад: ${remote}:${remotePort} → ${pc}:${port}`,
  ],
  remembered: (inside, outside) => `роутер запам’ятав: ${inside.address}:${inside.port} ↔ ${outside.address}:${outside.port}`,
  opens: ip => `ПК відкриває сайт ${ip}.`,
  contacts: (target, ip) => `Ціль ПК — ${target} (${ip}).`,
  purposes: {
    exact: 'перекладати точно задані LAN', mask: 'маска підмережі замість wildcard',
    other: 'перекладати іншу мережу', first: 'перекладати лише першу LAN', wan: 'змінити відправника на WAN',
    lan: 'змінити відправника на LAN', source: 'перекладати лише іншу LAN',
    insideLan: 'внутрішній бік на LAN', insideWan: 'внутрішній бік на WAN',
  },
};
export const sideCards = {
  'wan-client': { purpose: 'отримує WAN-адресу від провайдера', why: 'DHCP-клієнт працює на боці провайдера — WAN.' },
  'wan-route': {
    purpose: 'отримує шлях назовні від провайдера',
    why: 'Маршрут через WAN з’явиться, якщо провайдер його дає (опція router) і клієнту дозволено його додати. У Cisco вивчений маршрут має distance 254, тому статичний маршрут за замовчуванням виграє.',
    cisco: 'приходить разом з ip address dhcp, якщо провайдер його дає (опція router)',
    mikrotik: 'add-default-route=yes — якщо провайдер його дає',
  },
  'wan-dns': {
    purpose: 'власний DNS роутера через WAN',
    detail: ip => `роутер сам шукає імена через DNS провайдера ${ip} — через WAN`,
    why: 'Це DNS самого роутера. У цій задачі DNS належить провайдеру, і шлях до нього проходить через WAN.',
  },
  'lan-address': { purpose: 'задає адресу роутера в LAN', why: 'Це адреса LAN-порту роутера, до якого звертаються ПК.' },
  'lan-server': { purpose: 'видає адреси пристроям у LAN', why: 'DHCP-сервер обслуговує ПК у локальній мережі — LAN.' },
  'lan-range': { purpose: 'визначає адреси для видачі в LAN', why: 'Цей діапазон призначений для клієнтів локальної мережі — LAN.' },
  'lan-gateway': { purpose: 'повідомляє ПК шлюз у LAN', why: 'DHCP-сервер передає ПК LAN-адресу роутера як шлюз.' },
  'lan-dns': { purpose: 'роутер каже ПК, де шукати імена', why: 'Це DNS-опція для ПК у LAN, навіть якщо сам DNS розташований у провайдера.' },
};
export const wizard = {
  interface: 'де видавати адреси', addressSpace: 'яка мережа для клієнтів',
  gateway: 'куди ПК надсилає пакети за межі LAN', ranges: 'які адреси видавати ПК',
  dns: 'де ПК шукає імена', lease: 'на який час видавати адресу',
};
export const examples = {
  sidesContext: 'Окремий роутер: опис його локального порту позначає бік LAN.',
  sidesPurpose: 'опис порту LAN', sidesWhy: 'Опис стосується локального порту — LAN.',
  serverContext: (net, prefix, router) => `Інша мережа ${net}/${prefix}: роутер ${router}, статичні пристрої поза діапазоном видачі.`,
  serverNote: 'Зайняті адреси не роздаються; шлюз — адреса роутера в цій мережі.',
  exclusionNote: 'Cisco автоматично виключає адресу інтерфейсу; решту зайнятих адрес виключено цими рядками.',
  natContext: (pc, wan) => `Інший ПК ${pc} виходить через WAN ${wan}.`,
  natNote: 'Відповідь зберігає адресу сайту як джерело; NAT відновлює лише отримувача.',
  natRuleNote: 'Це правило вибирає мережу прикладу й перекладає її адреси на WAN.',
  natCiscoNote: 'ACL вибирає, чиї адреси перекладати; перекладає рядок ip nat inside source … overload.',
  columns: { purpose: 'Призначення', side: 'Бік', range: 'Діапазон', gateway: 'Шлюз', dns: 'DNS', exclusions: 'Виключення', command: 'Команда', inside: 'До NAT', outside: 'Після NAT' },
};

// The screens' own words (round 6, the screen stage): the section's choices,
// the drawing, the cards' frames, the forms and the round's end.
export const screen = {
  exercise: 'Вправа', syntax: 'Синтаксис', syntaxes: { cisco: 'Cisco', routeros: 'MikroTik' },
  level: 'Рівень', natLevels: ['Рівень 1', 'Рівень 2'],
  // E1: the card's frame and the round.
  sidesTask: 'Кожна картка — одне налаштування R1. На схемі видно обидва боки роутера.',
  nativeOf: { cisco: 'Cisco', mikrotik: 'MikroTik' },
  nextCard: 'Наступна картка →',
  // E2: the task, the strip, the forms and the result.
  serverTask: (network, prefix) => `Мережа ${network}/${prefix}. Роутер роздає адреси ПК і телефонам, крім зайнятих.`,
  stripTitle: 'Адреси мережі',
  given: 'Дано',
  ciscoGiven: 'вже налаштовано',
  fromTo: n => `Рядок ${n}`,
  removeRow: n => `Прибрати рядок ${n}`,
  rangeHint: base => `повна адреса: ${base}.…`,
  dnsHint: 'одна адреса або кілька через пробіл',
  rangesHint: base => `від-до: ${base}.…-${base}.…`,
  gatewayTerm: 'default-router', dnsTerm: 'dns-server',
  clientTitle: 'Що отримав ПК',
  revealApplied: 'Відповідь вписано у форму; нижче — що отримав ПК.',
  // E3: the round, the replay and the rules.
  natDone: 'Усі картки розібрано.',
  nextLevel: 'До рівня 2',
  newRound: 'Новий раунд',
  natNetworks: nets => `Мережі для NAT: ${nets.join(', ')}.`,
  // The drawing (ui/topology/RouterDiagram.jsx, DHCP view) and its words.
  drawing: {
    internet: 'Інтернет', isp: 'шлюз ISP', pc: 'ПК', server: 'Сервер', routerAddresses: 'адреси цього роутера',
    zoom: { group: 'Масштаб схеми', out: 'Зменшити', in: 'Збільшити', all: 'Уся схема', allLabel: 'Показати всю схему' },
    frameLabel: 'Схема: «+» і «−» змінюють масштаб',
    label: 'Схема мережі',
  },
  text: {
    button: 'Текстом', title: 'Схема текстом',
    heading: 'На схемі',
    pc: (ip, port) => `ПК ${ip} — у LAN, за портом ${port} роутера R1`,
    server: (ip, port) => `Сервер у LAN ${ip} — теж за портом ${port}`,
    wan: (port, ip, prefix) => `R1, бік провайдера (WAN): ${port} · ${ip}/${prefix}`,
    lan: (port, ip, prefix) => `R1, локальна мережа (LAN): ${port} · ${ip}/${prefix}`,
    isp: ip => `шлюз провайдера ${ip}, за ним Інтернет`,
    website: ip => `сайт ${ip} в Інтернеті`,
  },
  // «По кроках» (ui/components/WalkStepper.jsx) for the NAT replay.
  steps: { steps: 'По кроках', stepsGroup: 'Крок перекладу', stepBack: 'Крок назад', stepForward: 'Крок уперед', stepOf: ({ n, total }) => `крок ${n} з ${total}` },
};
