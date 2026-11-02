export const copy = {
  'route-port-location': ({ device = '', port = '', host = null, vid = null }) => `Дивись ${device}, порт ${port}${host && vid !== null ? `: ${host} у VLAN ${vid}` : ''}.`,
  'hint-port-move': ({ device = '', port = '', host = '', vid = '', syntax = 'cisco', trunk = false, vids = [] }) => trunk
    ? syntax === 'routeros'
      ? `${device}, порт ${port}: дозволь кадри з тегами й додай цей порт до tagged для VLAN ${vids.join(', ')}; перевір обидва кінці транку.`
      : `${device}, порт ${port}: постав trunk і дозволь VLAN ${vids.join(', ')}; створи ці VLAN на комутаторі й перевір обидва кінці транку.`
    : syntax === 'routeros'
      ? `${device}, порт ${port}: для ${host} постав PVID ${vid}, приймання кадрів без тега та untagged-членство лише у VLAN ${vid}. Фільтрацію вмикай після перевірки таблиці й доступу керування.`
      : `${device}, порт ${port}: для ${host} постав access і VLAN ${vid}.`,
  ok: 'Готово: перевірка пройшла.',
  'untagged-not-admitted': 'Цей порт не приймає кадри без тега.',
  'tagged-not-admitted': 'Цей порт не приймає кадри з тегом.',
  'not-member': 'Вхідний порт не належить до цього VLAN: кадр відкинуто.',
  'vlan-not-on-switch': 'Цього VLAN немає на комутаторі. Дозволу на транку недостатньо.',
  'not-allowed-out': 'Цей VLAN не дозволено на вихідному порту.',
  'host-got-tagged': 'Кадр дійшов до лінка ПК із тегом. Цей ПК приймає лише кадри без тега.',
  unmodelled: 'Це поєднання налаштувань тут ще не змодельовано.',
  'different-network': 'Адреси не в одній мережі за префіксами обох ПК. Для зв’язку потрібен маршрутизатор.',
  'no-path': 'Кадр не дістається іншого ПК.',
  'one-way': 'Кадр проходить лише в одному напрямку. Перевір і зворотний шлях.',
  'cisco-reserved-vid': 'VLAN 1002–1005 зарезервовані на Cisco; вибери інший номер.',
  'bad-vid': 'Номер VLAN має бути цілим числом від 1 до 4094.',
  'invalid-config': 'Перевір форму налаштувань і назви портів.',
  'mode-not-set': 'Задай режим порту явно: access або trunk. Без цього порт у режимі dynamic auto і домовляється сам — так не налаштовують.',
  'port-in-two-vlans-untagged': 'Порт зазначено без тега в кількох VLAN або водночас із тегом і без нього. Для VLAN-інтерфейсу на bridge1 порт CPU має бути tagged, а не untagged. Перевір таблицю VLAN і PVID.',
  'dynamic-pvid': ({ port, vid }) => `${port} додано без тега у VLAN ${vid} через його PVID.`,
  'vlan-auto-created': ({ vid }) => `VLAN ${vid} створюється разом із призначенням порту доступу.`,
  'invalid-topology': 'Перевір схему: кожен порт має один лінк, без петель і повторних адрес.',
  'invalid-record': 'Не вдалося прочитати запис вправи.',
  'invalid-bank': 'Набір вправ має непідтримувані або суперечливі дані.',
  'invalid-selection': 'Обери ПК, які отримають кадр, або підтвердь, що його не отримає ніхто.',
  'wrong-receivers': 'Ще ні. Простеж шлях кадру через порти.',
  'must-ping': 'Перевірка зв’язку між цими ПК ще не проходить в обидва боки.',
  'must-not-reach': 'Кадр потрапляє на лінк ПК з іншої групи. Потрібна ізоляція на рівні VLAN.',
  'vlan-leaves-switch': 'Кадр локального VLAN виходить на транк SW1. За умовою він має залишитися тут.',
  'trunk-faces-access': 'На кінцях лінка різні режими: тегований кадр приходить на порт доступу й відкидається.',
  'carry-through-middle': 'Перевір, чи середній комутатор переносить потрібний VLAN через обидва транки.',
  'trunk-carries-unused': 'Транк переносить VLAN, для якого за цим лінком немає спільних користувачів. Дозволь лише потрібні VLAN.',
  'user-port-vlan-1': 'Для користувацького порту краще обрати окремий VLAN замість VLAN 1.',
  'access-frame-types': 'На порту до ПК задай admit-only-untagged-and-priority-tagged.',
  'trunk-frame-types': 'На транку задай admit-only-vlan-tagged.',
  'allowed-all': 'На транку краще явно перелічити потрібні VLAN замість all.',
  'hint-port': ({ host }) => `На якому порту ${host} і в якому VLAN він має бути?`,
  'hint-trunk': 'Що має нести цей транк? Подивись, які групи є по обидва боки.',
  'hint-evidence': ({ device, port, reason }) => `${device}, порт ${port}: ${t(reason)}`,
  'hint-example': ({ syntax }) => syntax === 'routeros'
    ? 'Окремий приклад: ether5 з PVID 300 приймає кадри без тега, ether6 переносить VLAN 300 і 400 з тегами. У таблиці VLAN для 300: untagged=ether5, tagged=ether6; для 400: tagged=ether6. Фільтрацію вмикають останньою.'
    : 'Окремий приклад: fa0/20 — access VLAN 300; fa0/21 — trunk із дозволеними VLAN 300,400. VLAN 300 і 400 створені на комутаторі, режими задані явно.',
  'reachability-abstraction': 'Це перевірка зв’язку: адреси мають бути в одній мережі для обох ПК, а широкомовний кадр — проходити в обидва боки. Це не відтворення пакетів ICMP.',
  'network-convention': 'Номер мережі як у VLAN — звична домовленість, не правило.',
  'address-other-network': ({ host }) => `${host} отримав кадр, але він з іншої мережі — пінг без маршрутизатора не пройде.`,
  'frame-source': ({ host, tagged, vid }) => `${host} надсилає широкомовний кадр ${tagged ? `з тегом ${vid}` : 'без тега'}.`,
  'frame-arrival': ({ device, port }) => `${device}: кадр надходить через ${port}.`,
  'frame-ingress': ({ device, port, vid }) => `${device}: кадр входить через ${port} і належить до VLAN ${vid}.`,
  'frame-tagged-out': ({ device, port, vid }) => `${device}: виходить із ${port} з тегом ${vid}.`,
  'frame-untagged-out': ({ device, port, vid }) => `${device}: виходить із ${port} без тега${vid === null ? '' : ` — це вихід без тега для VLAN ${vid}`}.`,
  'frame-access-out': ({ device, port, vid }) => `${device}: виходить із ${port} без тега — це порт доступу VLAN ${vid}.`,
  'frame-other-access': ({ device, ports, count = 2 }) => `${device}: не виходить на ${ports} — ${count === 1 ? 'це порт іншого VLAN' : 'це порти інших VLAN'}.`,
  'frame-transparent': ({ device, port }) => `${device}: входить через ${port}; міст передає кадр без зміни тега.`,
};
export function t(code, params = {}) {
  const value = copy[code];
  return typeof value === 'function' ? value(params) : value ?? `[${code}]`;
}
export const notes = {
  routeros: 'Увімкни VLAN filtering останнім, коли порти й таблиця VLAN уже готові. На справжньому пристрої спершу подбай про доступ, який ця зміна не обріже: консоль або окремий порт керування. Якщо на пристрої вже є bridge1 з портами, використовуй set замість add.',
  cisco: 'nonegotiate вимикає DTP: транк задано явно, без переговорів.',
};
// «Як рухається кадр»: `introduction`, after vlanTeaching at the end of this file.
export const section = { title: 'VLAN', blurb: 'порти доступу, транки й шлях широкомовного кадру' };

// ─── The VLAN screens (VLAN-1 spec §4, v2 W1–W9) ───────────────────────────
// Screen words live apart from `copy`, which holds exactly the logic's codes.
export const ui = {
  heading: 'VLAN',
  exercise: 'Вправа',
  exercises: { predict: 'Куди дійде кадр', ports: 'Налаштуй порти' },
  syntax: 'Синтаксис',
  syntaxes: { cisco: 'Cisco', routeros: 'MikroTik' },
  // «Куди дійде кадр».
  shape: 'Мережа',
  intro: 'Як рухається кадр',
  question: ({ host }) => `${host} надсилає широкомовний кадр (як ARP-запит). Хто з ПК його отримає?`,
  choices: 'ПК, які отримають кадр',
  // Round 5 (R1): after the commit the action line's words say so (same place); before it, comprehension.frameAction.
  predictDone: 'Вибір зафіксовано.',
  choicesLocked: 'ПК, які отримають кадр: вибір зафіксовано',
  // Round 5 (§4 v2): the port evidence under the question, from the given configuration only.
  evidenceTitle: 'Порти за налаштуванням',
  evidenceVlan: ({ vid }) => `VLAN ${vid}`,
  evidencePvid: ({ vid }) => `PVID ${vid}`,
  evidenceTrunk: ({ vids }) => `транк: ${vids.length ? vids.join(', ') : '—'}`,
  evidenceCreated: ({ vids }) => `створено: ${vids.length ? vids.join(', ') : '—'}`,
  evidenceTo: ({ to }) => (to ? `до ${to}` : '—'),
  // MikroTik: which frames the port admits (its Frame Types), in the value cell.
  evidenceFrames: {
    'admit-all': 'усі кадри',
    'admit-only-untagged-and-priority-tagged': 'без тега',
    'admit-only-vlan-tagged': 'з тегом',
  },
  evidenceSender: 'надсилає',
  // A FactLink's words when tapped: whose port it is (the diagram shows where).
  portOwner: ({ device, port, to }) => `${device} ${port} — порт до ${to}`,
  nobody: 'Нікому',
  check: 'Перевірити',
  checkNeeds: 'Обери ПК або «Нікому»',
  next: 'Наступний раунд →',
  // «Далі →» beside «Наступний раунд →»: where it goes (A1 v2).
  newRounds: 'нова мережа',
  progressLabel: 'Раунди',
  progress: ({ n, total }) => `Раунд ${n} з ${total}`,
  dot: ({ n, status }) => `Раунд ${n}${status ? `: ${status}` : ''}`,
  dotStatus: { ok: 'так', no: 'кадр пішов інакше', current: 'поточний' },
  // A line under a port row the help panel's message is about (round 4 repair, Astra 2).
  editedNote: 'Змінено після перевірки.',
  hintNote: 'Підказка — про цей порт.',
  wentElsewhere: 'Кадр пішов інакше. Простеж його шлях через порти.',
  received: ({ hosts }) => (hosts.length ? `Кадр отримали: ${hosts.join(', ')}.` : 'Кадр не отримав жоден інший ПК.'),
  yourChoice: ({ hosts }) => `Твій вибір: ${hosts.length ? hosts.join(', ') : 'нікому'}.`,
  roundsDone: 'Усі раунди позаду. Номер біля кожного ПК на схемі — його широкомовний домен.',
  // The given configuration.
  given: 'Налаштування комутаторів',
  switchTabs: 'Комутатор',
  commands: 'Команди',
  bridgePorts: 'Bridge → Ports',
  bridgeVlans: 'Bridge → VLANs',
  col: { interface: 'Interface', pvid: 'PVID', frameTypes: 'Frame Types', vlanIds: 'VLAN IDs', tagged: 'Tagged', untagged: 'Untagged' },
  filtering: ({ on }) => `bridge1 · VLAN Filtering: ${on ? 'увімкнено' : 'вимкнено'}`,
  frameTypes: {
    'admit-all': 'admit all',
    'admit-only-untagged-and-priority-tagged': 'admit only untagged and priority tagged',
    'admit-only-vlan-tagged': 'admit only VLAN tagged',
  },
  frameShort: { 'admit-all': 'all', 'admit-only-untagged-and-priority-tagged': 'untagged', 'admit-only-vlan-tagged': 'tagged' },
  frameLegend: 'all = admit-all; untagged = admit-only-untagged-and-priority-tagged; tagged = admit-only-vlan-tagged',
  empty: '—',
  // The diagram, the walk and «Текстом».
  diagramLabel: 'Схема мережі',
  frameLabel: 'Схема: «+» і «−» змінюють масштаб',
  zoom: { group: 'Масштаб схеми', out: 'Зменшити', in: 'Збільшити', all: 'Уся схема', allLabel: 'Показати всю схему' },
  tag: vid => `тег ${vid}`,
  untagged: 'без тега',
  status: { source: 'надсилає', received: '✓ отримав', tagged: '✕ з тегом', leaked: '✕ отримав, а не мав' },
  chosen: '☑ обрано',
  walkTitle: 'Шлях кадру',
  domainsTitle: 'Широкомовні домени',
  domain: ({ n, hosts }) => `Домен ${n}: ${hosts.join(', ')}`,
  textButton: 'Текстом',
  textTitle: 'Схема текстом',
  scheme: 'Схема',
  // «Налаштуй порти».
  task: 'Задача',
  taskText: {
    'vlan.ports-1': ({ a, b }) => `ПК у VLAN ${a} і VLAN ${b} — на одному комутаторі. Налаштуй порти доступу.`,
    'vlan.ports-2': ({ a, b }) => `VLAN ${a} і VLAN ${b} є на обох комутаторах. Налаштуй порти доступу й транк між SW1 і SW2.`,
    'vlan.ports-3': ({ a, b, c }) => `VLAN ${c} є лише на SW1: його кадри не мають виходити на транк. VLAN ${a} і ${b} — на обох комутаторах.`,
    'vlan.ports-4': ({ a, b }) => `VLAN ${b} є на SW1 і SW3: SW2 має перенести його через обидва транки. VLAN ${a} — на всіх трьох.`,
  },
  taskShort: { 'vlan.ports-1': 'Два відділи', 'vlan.ports-2': 'Транк', 'vlan.ports-3': 'Де потрібно', 'vlan.ports-4': 'Транзит' },
  taskGoal: 'На схемі в кожного ПК — його мета: VLAN за задачею. ПК одного VLAN мають обмінюватися кадрами, а кадри іншого VLAN не мають доходити до їхніх лінків.',
  goal: vid => `мета: VLAN ${vid}`,
  schemeGoals: 'Схема і мета кожного ПК (VLAN за задачею)',
  otherNumbersMenu: 'Інші номери VLAN',
  previousNumbers: '← Попередні номери',
  // With a failing check's verdict: where its walk is (round 4: the verdict stays short).
  walkPointer: ({ what }) => `${what} — на схемі, а кроками — нижче.`,
  goalTitle: 'Мета на схемі',
  dtpTitle: 'Транк без DTP',
  safetyTitle: 'Як безпечно ввімкнути VLAN filtering',
  linesFolded: ({ n }) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'рядок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'рядки' : 'рядків'}`,
  portsDomain: ({ n, vids, hosts }) => `Домен ${n}${vids.length ? ` — VLAN ${vids.join(', ')}` : ''}: ${hosts.join(', ')}`,
  noCommands: 'Команд ще немає: обери режими портів.',
  previous: 'Попередня перевірка',
  form: ({ device }) => `Налаштування ${device}`,
  ciscoVlans: 'VLAN, які створити',
  portCol: 'Порт',
  modeCol: 'Режим',
  valueCol: 'VLAN цього порту',
  // Round 5 (§4 v2): two-line options, the Ukrainian word over the term; named «доступ (access)».
  modes: { access: 'access', trunk: 'trunk', none: 'не задано' },
  modeWords: { access: 'доступ', trunk: 'транк' },
  // Round 5 (R1): the action line above the first port row.
  portsAction: {
    cisco: 'Для кожного порту обери режим, потім VLAN.',
    routeros: 'Задай портам PVID і Frame Types, заповни Bridge → VLANs; filtering — останнім.',
  },
  // A port with no mode, under its row (the DTP explanation is the verdict's, once).
  modeNotSet: 'Режим не задано: обери access або trunk.',
  mode: ({ port }) => `${port}: режим`,
  accessVlan: ({ port }) => `${port}: VLAN доступу`,
  allowed: ({ port }) => `${port}: дозволені VLAN (або all)`,
  // Its visible label on the trunk's own line under the port row (repair v1).
  allowedShort: ({ port }) => `${port}: дозволені VLAN`,
  native: ({ port }) => `${port}: native VLAN (порожньо — 1)`,
  nativeShort: 'native',
  pvid: ({ port }) => `${port}: PVID`,
  frameTypesOf: ({ port }) => `${port}: Frame Types`,
  vlanIds: ({ n }) => `VLAN IDs, рядок ${n}`,
  members: ({ kind, n }) => `${kind}, рядок ${n}`,
  noRows: 'Рядків ще немає.',
  addRow: '+ VLAN',
  removeRow: ({ n }) => `Видалити рядок ${n}`,
  filteringBox: 'VLAN Filtering',
  commandsOf: ({ device }) => `Команди ${device}`,
  copy: 'Скопіювати',
  copied: 'Скопійовано',
  copyWhat: ({ device }) => ` команди ${device}`,
  copyFailed: 'Не вдалося скопіювати: команди виділено, натисни Ctrl+C.',
  pair: ({ from, to }) => `${from} і ${to}`,
  at: ({ device, port }) => (port ? `${device} ${port}` : device),
  line: ({ where, text }) => `${where}: ${text}`,
  oneWay: ({ from, to }) => `Від ${to} до ${from} кадр доходить; на схемі — напрямок, у якому він губиться.`,
  marks: ({ n }) => `Позначено полів: ${n}.`,
  tipsTitle: 'Що можна покращити',
  // The walks in motion (VLAN-anim spec v2).
  replay: 'Показати ще раз',
  inVlan: ({ vid }) => `VLAN ${vid}`,
  portsLap: 'Кожен VLAN тримає свої кадри при собі.',
  activeTag: 'налаштовуєш',
  shownTag: 'показано',
  answer: 'Відповідь',
};

// VLAN-2: request and reply have independent routing decisions.
Object.assign(copy, {
  'no-gateway': 'Для адреси поза своєю мережею потрібен шлюз. У відправника його не задано.',
  'gateway-off-link': 'Шлюз не в мережі відправника за його префіксом.',
  'gateway-unreachable': 'Не вдається дістатися адресата чи наступного вузла на рівні VLAN в обидва боки. Перевір шлях кадру.',
  'gateway-not-a-router': 'За адресою шлюзу відповідає вузол, який тут не маршрутизує пакети.',
  'no-l3-interface': 'Кадр без тега надійшов на порт маршрутизатора, де немає IP-адреси.',
  'no-subinterface': 'Для цього тега на порту маршрутизатора немає підінтерфейсу Cisco чи VLAN-інтерфейсу RouterOS з відповідним VLAN ID.',
  'interface-down': 'Інтерфейс неактивний: перевір фізичний порт маршрутизатора або наявність порту в таблиці VLAN для SVI.',
  'no-route': 'Маршрутизатор не має підключеної мережі для адреси призначення.',
  'vlan-on-bridge-port': 'VLAN-інтерфейс або адреса на порту, який входить до мосту, не отримує кадри. Використай VLAN-інтерфейс на bridge1.',
  'bridge-cpu-not-tagged': 'Порт CPU bridge1 не є tagged-учасником цього VLAN. Кадр не доходить до VLAN-інтерфейсу мосту або не виходить із нього.',
  'router-gateway-missing': ({ gateway } = {}) => `Немає інтерфейсу з адресою шлюзу${gateway ? ` ${gateway}` : ''}, заданою в умові.`,
  'management-missing': 'Ще немає адреси керування.',
  'internal-interface-down': 'Інтерфейс неактивний: у таблиці VLAN немає жодного порту з цим VLAN.',
  'missing-encapsulation': 'Cisco не приймає IP-адресу на підінтерфейсі без encapsulation dot1Q.',
  'duplicate-encapsulation': 'На одному фізичному порту не можна задати однакову інкапсуляцію VLAN двічі.',
  'duplicate-interface': 'Назва або номер інтерфейсу повторюється.',
  'unknown-interface': 'Налаштування посилається на інтерфейс, якого немає на цьому пристрої.',
  'invalid-address': 'Введи коректну IPv4-адресу та префікс.',
  'missing-prefix': 'Бракує маски: допиши її після адреси — /24 у MikroTik або 255.255.255.0 у Cisco (маску мережі цього VLAN). Без маски RouterOS візьме /32, а Cisco не прийме команду.',
  'unusable-address': 'Адресу мережі або широкомовну адресу не призначають вузлу.',
  'address-collision': 'Ця адреса вже належить іншому інтерфейсу, ПК або заданому шлюзу.',
  'overlapping-networks': 'На одному маршрутизаторі мережі різних інтерфейсів не мають перекриватися.',
  'router-prefix-mismatch': 'Адреса шлюзу має покривати всю мережу VLAN. Перевір заданий у задачі префікс.',
  'management-vlan-mismatch': 'Адреса керування комутатором має бути в окремому VLAN керування та бути адресою вузла за префіксом його мережі в умові.',
  'subif-number-differs': 'Номер підінтерфейсу може відрізнятися від VLAN. Якщо вони збігаються, так легше читати налаштування.',
  'bridge-tag-implicit': 'Додай bridge1 у tagged явно — так працює на всіх версіях RouterOS 7.',
  'route-hint-question': 'Куди відправник надсилає пакет: прямо до адресата чи до шлюзу? Чи є шлях назад?',
  'route-hint-evidence': ({ from = '', to = '', device = '', port = '', reason }) => {
    const where = [from ? `${from}${to ? ` → ${to}` : ''}` : '', device ? `${device}${port ? ` ${port}` : ''}` : ''].filter(Boolean).join('; ');
    return `${where ? `${where}: ` : ''}${t(reason)}`;
  },
  'route-hint-example': ({ syntax }) => syntax === 'routeros'
    ? 'Окремий приклад: VLAN 300 на ether9, назва office300; адреса 10.77.30.254/24 на office300. Якщо ether9 входить до мосту, VLAN-інтерфейс створюють на bridge1, а bridge1 додають у tagged. Фільтрацію вмикають останньою.'
    : 'Окремий приклад: interface gi0/9, no shutdown; interface gi0/9.300, encapsulation dot1Q 300, ip address 10.77.30.254 255.255.255.0. На транку дозволено VLAN 300.',
  'route-hop': ({ router, in: incoming, out }) => `${router}: маршрутизація ${incoming} → ${out}. Це новий кадр для наступного VLAN.`,
  // `both`: a part about the way back follows (otherwise the words don't promise it).
  'route-segment': ({ from, to, nextHopIp, both = false }) => `Шлях на рівні VLAN: ${from} → ${to ?? nextHopIp ?? 'наступний вузол'}${both ? '; перевірка в обидва боки' : ''}.`,
  'links-up-stp-forwarding': 'У цій моделі фізичні лінки працюють, а STP дозволяє передавання.',
  'connected-only': 'Тут один маршрутизатор і лише безпосередньо підключені мережі.',
  'no-proxy-arp': 'Proxy ARP вимкнено: маршрутизатор не відповідає на ARP замість вузлів інших мереж.',
});
for (const code of ['different-network', 'no-gateway', 'gateway-off-link', 'gateway-unreachable', 'gateway-not-a-router', 'no-l3-interface', 'no-subinterface', 'interface-down', 'no-route', 'vlan-on-bridge-port', 'bridge-cpu-not-tagged', 'internal-interface-down']) {
  copy[`reply-${code}`] = params => `Зворотний шлях: ${t(code, params)}`;
}
export const routeNotes = {
  routerParent: 'Підінтерфейс не працює, поки фізичний інтерфейс вимкнено (shutdown).',
  svi: 'Якщо show ip interface brief покаже Vlan… як administratively down — no shutdown.',
  assumptions: 'У моделі лінки працюють, STP дозволяє передавання.',
  sviActive: 'SVI активний, коли VLAN існує й має порт у таблиці VLAN.',
  management: 'Переносячи керування: залиш доступ через консоль, налаштуй і перевір увесь новий шлях (транк, VLAN, адресу, шлюз і зворотний шлях), і лише тоді прибирай старий доступ.',
  managementLimits: 'Окремий VLAN упорядковує керування, але сам по собі не захищає його: за повної маршрутизації користувачі теж можуть дістатися цієї адреси. Обмеження доступу — тема для подальшої вправи з міжмережевого екрана. Пінг доводить IP-зв’язність, а не доступ через SSH чи Winbox.',
};
export const routeText = {
  1: 'Комутатор уже налаштовано. Налаштуй маршрутизатор, щоб ПК у різних VLAN могли обмінюватися пакетами. Шлюзи ПК задані на схемі.',
  2: 'Налаштуй порти доступу, транк до маршрутизатора та його VLAN-інтерфейси. Усі ПК мають досягати своїх шлюзів і один одного.',
  3: `Додай окремий VLAN керування на комутаторі, дозволь його на транку, вибери адресу комутатора в заданій мережі та вкажи шлюз. Додай інтерфейс маршрутизатора в цьому VLAN. Перевір пінг від адміністративного ПК до вибраної адреси комутатора. ${routeNotes.managementLimits}`,
  4: 'Налаштуй VLAN filtering на мосту маршрутизатора MikroTik, його порти доступу та транк до SW1. Створи VLAN-інтерфейси на bridge1 і додай bridge1 у tagged. SW1 теж налаштуй: його порти доступу й транк до R1. Усі ПК мають досягати своїх шлюзів і один одного.',
};
ui.exercises.route = 'Між VLAN';

// ─── «Між VLAN» screens (VLAN-2 spec §3, v2 X1, X5–X7) ─────────────────────
// Screen words, apart from `copy` (the logic's codes) and `routeNotes`;
// apart from `ui` too, whose strings test samples VLAN-1's parameters.
export const routeUi = {
  taskShort: { 'vlan.route-1': 'На паличці', 'vlan.route-2': 'Транк теж твій', 'vlan.route-3': 'Керування', 'vlan.route-4': 'Із мостом' },
  ciscoNoBridge: '4 · Із мостом — лише MikroTik: у Cisco це модуль комутатора з SVI, інша тема.',
  // Round 4 (spec F5): each task in one sentence; the rest is the aside «Умова повністю».
  taskOne: {
    1: 'Налаштуй R1, щоб ПК різних VLAN обмінювалися пакетами; SW1 уже налаштовано.',
    2: 'Налаштуй порти SW1, транк до R1 і його інтерфейси, щоб усі ПК досягали шлюзів і один одного.',
    3: 'Додай на SW1 окремий VLAN керування з адресою й шлюзом, а на R1 — інтерфейс у ньому.',
    4: 'Налаштуй міст R1 (VLAN filtering, VLAN-інтерфейси) і SW1, щоб усі ПК досягали шлюзів і один одного.',
  },
  goalTitle: 'Умова повністю',
  managementGivens: ({ vid, network, prefix, gateway, admin }) => `Дано: VLAN керування ${vid}, мережа ${network}/${prefix}, адреса R1 у ній (шлюз для SW1) ${gateway}, адміністративний ПК — ${admin}.`,
  taskGoal: 'Шлюз кожного ПК заданий на схемі. ПК різних VLAN мають обмінюватися пакетами через маршрутизатор, а кадри одного VLAN не мають доходити до лінків іншого.',
  deviceTabs: 'Пристрій',
  givenSwitch: 'SW1 уже налаштовано за умовою. Нижче його команди.',
  fixedPorts: 'Порти доступу задано умовою.',
  fixedRow: 'задано',
  // Cisco router: the physical interface's administrative state (round 5, 5b-2 E: comprehension.adminState*).
  physicalState: ({ port }) => `${port}: адміністративний стан`,
  subifs: 'Підінтерфейси',
  col: { name: 'Name', vlanId: 'VLAN ID', on: 'Interface', rosAddress: 'Address' },
  cli: { interface: ({ parent }) => `interface ${parent}.`, encap: 'encapsulation dot1Q', address: 'ip address' },
  number: ({ parent, n }) => `${parent}: номер підінтерфейсу, рядок ${n}`,
  encap: ({ n }) => `VLAN для encapsulation dot1Q, рядок ${n}`,
  addressOf: ({ n }) => `IP-адреса й маска, рядок ${n}`,
  addSubif: '+ підінтерфейс',
  removeSubif: ({ n }) => `Видалити підінтерфейс, рядок ${n}`,
  noSubifs: 'Підінтерфейсів ще немає.',
  // MikroTik VLAN interfaces, addresses, the route.
  vlanIfs: 'Interfaces → VLAN',
  vlanIfName: ({ n }) => `Name, рядок ${n}`,
  vlanIfVid: ({ n }) => `VLAN ID, рядок ${n}`,
  vlanIfOn: ({ n }) => `Interface VLAN-інтерфейсу, рядок ${n}`,
  addVlanIf: '+ VLAN-інтерфейс',
  removeVlanIf: ({ n }) => `Видалити VLAN-інтерфейс, рядок ${n}`,
  noVlanIfs: 'VLAN-інтерфейсів ще немає.',
  addresses: 'IP → Addresses',
  rosAddress: ({ n }) => `Address, рядок ${n}`,
  ifaceOf: ({ n }) => `Interface адреси, рядок ${n}`,
  addAddress: '+ адреса',
  removeAddress: ({ n }) => `Видалити адресу, рядок ${n}`,
  noAddresses: 'Адрес ще немає.',
  noNames: 'Спершу назви VLAN-інтерфейс.',
  routes: 'IP → Routes',
  routeDst: 'dst-address=0.0.0.0/0',
  routeGateway: 'Gateway маршруту за замовчуванням',
  // Cisco switch management.
  management: 'Керування комутатором',
  sviVlan: 'interface vlan',
  sviVlanLabel: 'SVI: номер VLAN',
  sviAddress: 'ip address',
  sviAddressLabel: 'SVI: IP-адреса й маска',
  defaultGateway: 'ip default-gateway',
  defaultGatewayLabel: 'ip default-gateway: адреса шлюзу',
  addressHint: { cisco: 'напр. 10.0.0.1 255.255.255.0', routeros: 'напр. 10.0.0.1/24' },
  ipHint: 'напр. 10.0.0.1',
  // The diagram's lines.
  gatewayLine: ({ ip }) => `шлюз ${ip}`,
  physicalLine: ({ port, on }) => `${port} · ${on ? 'no shutdown' : 'shutdown'}`,
  subifLine: ({ name, vid }) => `${name} · dot1Q ${vid}`,
  vlanIfLine: ({ name, vid }) => `${name} · VLAN ${vid}`,
  onLine: ({ on }) => `  на ${on}`,
  addressLine: ({ ip, prefix }) => `  ${ip}/${prefix}`,
  none: '—',
  // The walk.
  walkTitle: 'Шлях пакета',
  // A hint's note on a block, not a port (repair v1).
  hintBlock: 'Підказка — про цей блок.',
  newFrame: ({ router }) => `${router}: той самий IP-пакет, новий Ethernet-кадр`,
  lap: 'R1 передає IP-пакет між VLAN у новому Ethernet-кадрі; кадри між VLAN не переходять.',
  walkAbstraction: 'Кожен відрізок шляху перевіряється широкомовним кадром (як ARP-запит): чи досяжний наступний вузол на рівні VLAN, туди й назад, якщо так сказано. Це не запис пакета ICMP.',
  probe: ({ from, to }) => `${from} → ${to}`,
  direction: 'Напрямок',
  directions: { request: 'Запит', reply: 'Відповідь' },
  sample: 'Для прикладу',
  reached: ({ name }) => `${name}: кадр отримано.`,
  notReached: ({ name }) => `${name}: кадр не отримано.`,
  nobody: ({ ip }) => `Адреса ${ip} не належить жодному інтерфейсу: на цей запит ніхто не відповідає.`,
  back: ({ from, to }) => `Назад, від ${from} до ${to}:`,
  arrived: ({ to }) => `Шлях до ${to} є: кожен відрізок досяжний.`,
  result: ({ text }) => `Тут шлях обривається. ${text}`,
  stops: 'Тут шлях обривається.',
  also: ({ where, text }) => `Також ${where}: ${text}`,
  model: 'Модель',
  devicesTitle: 'Інтерфейси за налаштуванням',
  noCommands: 'Команд ще немає: заповни форму.',
  noInterfaces: ({ device }) => `${device}: інтерфейсів ще немає.`,
};

// Diagnosis choices describe configuration, separately from walk/drop wording.
export const causeText = {
  cisco: {
    'trunk-missing-vlan': 'На транку не дозволено потрібний VLAN.',
    'access-is-trunk': 'Порт до ПК налаштовано як транк.',
    'access-wrong-vlan': 'Порт до ПК віднесено до іншого VLAN доступу.',
    'transit-vlan-missing': 'Потрібний VLAN не створено на проміжному комутаторі.',
    'native-mismatch': 'На кінцях транку між комутаторами задано різні native VLAN.',
    'trunk-is-access': 'Порт транку налаштовано як порт доступу.',
    'parent-shutdown': 'Фізичний інтерфейс маршрутизатора вимкнено.',
    'wrong-encapsulation': 'На підінтерфейсі маршрутизатора задано інший VLAN ID.',
    'router-address-wrong-network': 'IP-адреса маршрутизатора належить до іншої мережі.',
  },
  routeros: {
    'trunk-missing-vlan': 'Порт транку не додано до tagged потрібного VLAN.',
    'access-wrong-vlan': 'На порту до ПК задано інший PVID і членство без тега.',
    'filtering-off': 'На мосту вимкнено фільтрацію VLAN.',
    'trunk-frame-types': 'Порт транку приймає лише кадри без тега.',
    'access-frame-types': 'Порт до ПК приймає лише кадри з тегом.',
    'wrong-encapsulation': 'На VLAN-інтерфейсі задано інший VLAN ID.',
    'router-address-wrong-network': 'IP-адреса маршрутизатора належить до іншої мережі.',
    'vlan-if-on-bridge-port': 'VLAN-інтерфейс прив’язано до фізичного порту, який уже входить у міст.',
    'bridge-not-tagged': 'Міст bridge1 не додано до tagged у VLAN його VLAN-інтерфейсу.',
  },
};
export const repairText = {
  cisco: {
    'trunk-missing-vlan': 'Додай потрібний VLAN до списку дозволених VLAN транку.',
    'access-is-trunk': 'Задай порту режим access і VLAN цього ПК.',
    'access-wrong-vlan': 'Поверни порт до VLAN доступу його ПК.',
    'transit-vlan-missing': 'Створи потрібний VLAN на проміжному комутаторі.',
    'native-mismatch': 'Узгодь native VLAN на обох кінцях транку.',
    'trunk-is-access': 'Задай порту режим trunk і список дозволених VLAN.',
    'parent-shutdown': 'Увімкни фізичний інтерфейс командою no shutdown.',
    'wrong-encapsulation': 'Задай підінтерфейсу VLAN ID його мережі в encapsulation dot1Q.',
    'router-address-wrong-network': 'Поверни адресу шлюзу з мережі відповідного VLAN.',
  },
  routeros: {
    'trunk-missing-vlan': 'Додай порт транку до tagged потрібного VLAN.',
    'access-wrong-vlan': 'Узгодь PVID та untagged-членство порту з VLAN його ПК.',
    'filtering-off': 'Перевір таблицю VLAN і доступ через консоль або окремий порт керування, потім увімкни vlan-filtering на мосту.',
    'trunk-frame-types': 'Задай на транку admit-only-vlan-tagged.',
    'access-frame-types': 'Задай на порту до ПК admit-only-untagged-and-priority-tagged.',
    'wrong-encapsulation': 'Задай VLAN-інтерфейсу VLAN ID його мережі.',
    'router-address-wrong-network': 'Поверни адресу шлюзу з мережі відповідного VLAN.',
    'vlan-if-on-bridge-port': 'Прив’яжи VLAN-інтерфейс до bridge1.',
    'bridge-not-tagged': 'Додай bridge1 до tagged у потрібному VLAN.',
  },
};
export const faultText = {
  title: 'Знайди несправність',
  instructions: 'У мережі одна несправність. Подивись на перевірки зв’язку й ізоляції, простеж потрібні шляхи, обери причину та виправ налаштування.',
  cause: 'Причина', fix: 'Виправ', reachability: 'Зв’язок', isolation: 'Ізоляція VLAN',
  expected: 'Очікується', observed: 'Спостерігається', pass: 'так', fail: 'ні',
  isolationRow: ({ vid }) => `Кадри VLAN ${vid} лишаються у VLAN ${vid}`,
  unexpected: ({ host, vlan }) => `Доходять до ${host} (VLAN ${vlan})`,
  repair: (code, vendor) => repairText[vendor]?.[code],
};
export function faultExample(code, vendor) {
  const examples = {
    'trunk-missing-vlan': vendor === 'cisco'
      ? 'На іншій схемі fa0/20 — транк для VLAN 300 і 400. З allowed 400 кадри VLAN 300 не проходять; allowed 300,400 відновлює шлях.'
      : 'На іншій схемі VLAN 300 має tagged=ether8. Якщо ether8 прибрати з цього рядка, транк не переносить VLAN 300. Поверни ether8 до tagged.',
    'access-is-trunk': 'На іншій схемі ПК VLAN 300 під’єднаний до fa0/20 з mode trunk та allowed 300,400. Кадри до ПК приходять із тегом. Задай mode access та access vlan 300.',
    'access-wrong-vlan': vendor === 'cisco'
      ? 'ПК мережі VLAN 300 під’єднаний до fa0/20, але задано access vlan 400. З access vlan 300 він повертається до своєї групи.'
      : 'ПК мережі VLAN 300 під’єднаний до ether8 з PVID 1. Задай PVID 300, прибери ether8 з untagged VLAN 1 і додай до untagged VLAN 300.',
    'transit-vlan-missing': 'На іншій схемі крайні комутатори мають VLAN 300. На середньому allowed 300,400 недостатньо: команда vlan 300 створює VLAN для транзиту.',
    'filtering-off': 'На іншій схемі ether8 має PVID 300, ether9 — 400. З vlan-filtering=no їхні кадри потрапляють на чужі порти. Після перевірки таблиці VLAN увімкни vlan-filtering=yes.',
    'trunk-frame-types': 'На іншій схемі транк ether8 переносить VLAN 300 і 400 з тегами. admit-only-untagged-and-priority-tagged їх відкидає; потрібне admit-only-vlan-tagged.',
    'native-mismatch': 'На іншій схемі native VLAN 300 на одному кінці й 400 на іншому. Якщо обидва VLAN існують і дозволені, кадр VLAN 300 виходить без тега та приймається як VLAN 400. Узгодь native VLAN; перевір обидва напрямки.',
    'trunk-is-access': 'На іншій схемі fa0/20 з mode access відкидає теговані кадри VLAN 300. Задай mode trunk і allowed 300,400.',
    'access-frame-types': 'На іншій схемі ПК на ether8 надсилає кадри без тега. З admit-only-vlan-tagged вони відкидаються. Задай admit-only-untagged-and-priority-tagged і PVID 300.',
    'parent-shutdown': 'На іншій схемі gi0/4.300 має encapsulation dot1Q 300 та адресу 10.30.0.1/24. Поки gi0/4 у shutdown, підінтерфейс не працює. На gi0/4 задай no shutdown.',
    'wrong-encapsulation': 'На іншій схемі шлюз 10.30.0.1/24 належить VLAN 300, але VLAN ID інтерфейсу — 400. Заміни VLAN ID на 300; інші інтерфейси лишаються у своїх VLAN.',
    'router-address-wrong-network': 'На іншій схемі ПК 10.30.0.20/24 очікує шлюз 10.30.0.1. Адреса 10.40.0.1/24 на інтерфейсі VLAN 300 належить іншій мережі. Задай 10.30.0.1/24.',
    'vlan-if-on-bridge-port': 'На іншій схемі ether8 входить у bridge1. VLAN-інтерфейс vlan300 на ether8 не отримує трафік. Прив’яжи його до bridge1 і перевір tagged-членство CPU.',
    'bridge-not-tagged': 'На іншій схемі RouterOS до 7.16 VLAN-інтерфейс vlan300 працює на bridge1. У рядку VLAN 300 потрібні tagged=ether8,bridge1: без bridge1 трафік до CPU не проходить.',
  };
  return examples[code];
}
// VLAN-3: what a stop shows, in words that neither diagnose the setting
// behind it nor say how to repair it (fix brief v1 item 1). The configure
// exercises keep their teaching words (`copy`); «Знайди несправність» says
// these until hint 3 or the reveal. Each replaces its `copy` sentence whole,
// also inside «Зворотний шлях: …».
export const observed = {
  'vlan-not-on-switch': 'Цього VLAN немає на комутаторі: кадр відкинуто.',
  'no-subinterface': 'Кадр із цим тегом не приймає жоден інтерфейс маршрутизатора.',
  'interface-down': 'Інтерфейс неактивний: кадр через нього не проходить.',
  'internal-interface-down': 'Інтерфейс неактивний: кадр через нього не проходить.',
  'vlan-on-bridge-port': 'Кадр не доходить до цього VLAN-інтерфейсу.',
  'bridge-cpu-not-tagged': 'Кадр не доходить до VLAN-інтерфейсу мосту або не виходить із нього.',
};
/** A stop's words for «Знайди несправність»: the observation where `copy` teaches. */
export const observedWords = (code, params) => {
  const base = String(code ?? '').replace(/^reply-/, '');
  if (!observed[base]) return t(code, params);
  return base === code ? observed[base] : `Зворотний шлях: ${observed[base]}`;
};
/** Any text built from `copy`'s stop sentences (a walk, a failure's words), told as observations. */
export function observeText(text) {
  let out = String(text ?? '');
  for (const [code, words] of Object.entries(observed)) out = out.split(copy[code]).join(words);
  return out;
}

Object.assign(copy, {
  'invalid-cause': 'Обери причину зі списку.',
  'fault-cause-other': 'Ремонт правильний — залиш його. Причина була інша.',
  'fault-cause-required': 'Мережа працює. Залиш ці зміни й обери, що було зламано.',
  'fault-hint-question': 'Які перевірки зв’язку чи ізоляції не проходять? Що в них спільного?',
  'fault-hint-evidence': ({ from, to, stop, reason, gridPass }) => gridPass
    ? 'На сітці всі перевірки проходять. Порівняй зміни з початковими налаштуваннями.'
    : stop ? `${from} → ${to}: ${stop.device}, порт ${stop.port}: ${observedWords(stop.code)}`
      : reason ? `${from} → ${to}: ${observedWords(reason)}` : 'Перевір форму налаштувань.',
  'fault-hint-example': ({ example }) => example,
});

// ─── «Знайди несправність» screens (VLAN-3 spec v2 §4, Z1, Z2, Z7) ─────────
// Screen words, apart from `copy` (the logic's codes), `causeText` and
// `faultText` (the logic's own wording for causes, repairs and grid rows).
ui.exercises.faults = faultText.title;
export const faultsUi = {
  level: ({ n }) => `Рівень ${n} з 3`,
  levelWhat: { 1: 'комутатори', 2: 'маршрутизація між VLAN', 3: 'будь-що з вивченого' },
  version: ({ label }) => `Версія RouterOS на пристроях: ${label}.`,
  // The symptom grid.
  evidence: 'Перевірки',
  evidenceLead: 'Торкнута перевірка покаже шлях на схемі. Це не спроба.',
  // Round 5 (R1): each stage's action line, above its first control.
  action: {
    checks: 'Торкнись перевірки, що не проходить.',
    repair: 'Виправ налаштування й натисни «Перевірити».',
    cause: 'Обери, що було зламано, і натисни «Перевірити».',
  },
  gridState: {
    initial: 'задані налаштування',
    checked: 'після «Перевірити»',
    stale: 'форму змінено: оновиться після «Перевірити»',
  },
  gridInvalid: 'Налаштування з помилками у формі не застосовуються: перевірок немає. Виправ позначені поля.',
  pair: ({ from, to }) => `${from} ↔ ${to}`,
  toward: ({ from, to }) => `${from} → ${to}`,
  rowLabel: ({ what, ok }) => `${what}: ${ok ? 'проходить' : 'не проходить'}`,
  summary: ({ failing, total }) => (failing ? `✗ Не проходять ${failing} з ${total}.` : `✓ Проходять усі ${total}.`),
  passing: ({ n }) => `ще ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'перевірка проходить' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'перевірки проходять' : 'перевірок проходять'} ✓`,
  passingAll: ({ n }) => `Показати всі ${n} ✓`,
  // Round 4 (spec F6): the stages, one at a time.
  stagesLabel: 'Етапи',
  stages: { checks: 'Перевірки', repair: 'Ремонт', cause: 'Причина' },
  causeLocked: 'Причина відкриється, коли ремонт пройде перевірку.',
  instructions: 'Одна несправність: подивись перевірки, виправ налаштування, тоді обери, що було зламано.',
  earlySteps: ({ n }) => `Перші кроки (${n})`,
  originalTitle: ({ device }) => `Початкові налаштування ${device}`,
  changedLine: '(змінено)',
  rowWords: ({ what, ok, detail = [] }) => `${what}: ${ok ? 'проходить' : 'не проходить'}${detail.length ? ` (${detail.join('; ')})` : ''}.`,
  // The answer's two parts.
  causeLead: 'Яка зміна в налаштуваннях зламала мережу?',
  devices: 'Пристрій',
  // The walk on demand.
  walkWhere: {
    initial: 'задані налаштування',
    checked: 'Попередня перевірка',
    before: 'до виправлення',
    after: 'після виправлення',
  },
  walkFrom: ({ from }) => `від ${from}`,
  noWalk: 'Для цієї перевірки шляху кадру немає.',
  // The reveal.
  revealCause: 'Причина',
  revealChange: 'Що змінити',
  where: ({ device, port }) => (port ? `${device}, ${port}` : device),
  was: 'Було',
  now: 'Стало',
  sides: { before: 'До виправлення', after: 'Після виправлення' },
  sidesLabel: 'Перевірки до чи після виправлення',
  textGrid: 'Перевірки',
};

// Round 5 data keys, separate from screen-owned ui/routeUi.
// Repair v1 (Astra 2, Fable suggestion 2): the inter-VLAN action lines name
// the first step and the order, at most two lines at 1000 × 700.
export const vlanTeaching = {
  broadcast: 'Комутатор розсилає широкомовний кадр дозволеними портами його VLAN, крім порту, з якого кадр прийшов.',
  trunk: 'Транк — порт, що може переносити кілька VLAN; кадри native VLAN можуть передаватися без тега.',
  createVlans: 'створити на комутаторі (один раз)',
  portVlan: 'VLAN цього порту',
  filteringOff: 'vlan-filtering вимкнено',
  evidenceColumns: ['комутатор', 'порт', 'ПК', 'налаштований VLAN / PVID'],
};

export const interVlanActions = {
  cisco: {
    router: ({ iface }) => `Спочатку ввімкни ${iface}, потім додай підінтерфейс на кожен VLAN.`,
    switchAndRouter: ({ iface }) => `Почни з SW1: VLAN, порти доступу, транк; потім R1: увімкни ${iface}, додай підінтерфейси.`,
    management: 'SW1: VLAN керування на транку, інтерфейс і шлюз; R1: лише відсутній підінтерфейс.',
  },
  routeros: {
    router: 'На R1 додай VLAN-інтерфейс для кожного VLAN і дай йому адресу шлюзу.',
    switchAndRouter: 'Почни з SW1: PVID портів, таблиця VLAN, filtering; потім R1: VLAN-інтерфейси й шлюзи.',
    management: 'SW1: VLAN керування на транку, інтерфейс і шлюз; R1: лише відсутній VLAN-інтерфейс.',
    bridgesAndRouter: 'Почни з SW1: міст, порти, таблиця VLAN; потім R1 і VLAN-інтерфейси; filtering — останнім.',
  },
};

// «Як рухається кадр» (round 5, spec 5b-1 §4 v2, v2.1): the definitions live
// in this intro, no second aside. Line 1 is the broadcast rule, the trunk
// line the trunk definition (vlanTeaching's data keys); «Широкомовний кадр
// залишається у своєму VLAN» went: line 1 says it, with the ports that carry it.
export const introduction = [
  vlanTeaching.broadcast,
  'Порт доступу відносить кадр до свого VLAN.',
  vlanTeaching.trunk,
  'З порту доступу кадр виходить без тега.',
];

export const comprehension = {
  vlansPlaceholder: 'номери VLAN через кому',
  frameAction: 'Познач ПК, яким комутатор віддасть цей кадр — за VLAN у таблиці, не за IP-адресами.',
  routerOnStick: '„На паличці": у цій схемі один транк до комутатора; на роутері — логічний інтерфейс з адресою шлюзу для кожного VLAN, між якими маршрутизуємо.',
  adminStateLabel: 'Адміністративний стан інтерфейсу',
  adminStateOptions: [{ value: false, label: 'вимкнено', command: 'shutdown' }, { value: true, label: 'увімкнено', command: 'no shutdown' }],
  adminStateNote: '(лінк ще має бути фізично піднятий)',
  inspecting: device => `Зараз: ${device}`,
  recommendedFirst: 'радимо спершу: IP-адреси',
};
