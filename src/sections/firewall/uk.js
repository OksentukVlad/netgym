// Every public evaluator/exercise/display code, including walk assumptions.
export const copy = {
  'hook-ok': 'Ланцюжок обрано. Тепер знайди правило, яке вирішує долю пакета.',
  'hook-retry-input': 'Пакет адресовано самому роутеру → input; обери ланцюжок ще раз.',
  'hook-retry-forward': 'Пакет проходить крізь роутер до іншого вузла → forward; обери ланцюжок ще раз.',
  'hint-chain-look': 'Порівняй адресу призначення пакета з адресами інтерфейсів роутера на схемі.',
  'hint-chain-move': 'Якщо адреса належить роутеру, обери input; якщо іншому вузлу — forward. Для відповіді теж дивись адресу призначення.',
  'hint-chain-example': 'Окремий приклад: роутер має 192.0.2.1. Пакет до 192.0.2.1 потрапляє в input, а до вузла 198.51.100.20 через роутер — у forward.',
  ok: 'Відповіді на зафіксовані пакети правильні.',
  'invalid-selection': 'Обери ланцюжок і правило або кінець списку.',
  'wrong-door': 'Перевір, кому належить адреса призначення.',
  'rule-disabled': 'Це правило вимкнене — фільтр його минає.',
  'rule-other-chain': 'Це правило належить іншому ланцюжку.',
  'fasttrack-not-final': 'FastTrack позначає з’єднання: наступні його пакети переважно оминатимуть фільтр. А цей пакет іде списком далі — вирішує наступне правило, що збіглося.',
  'right-verdict-wrong-rule': 'Дія та сама, але вирішує інше правило — перше, де збіглися всі умови.',
  'wrong-verdict': 'Обране правило дає інший результат. Зістав усі його умови з пакетом.',
  'rule-accepted': 'Фільтр пропускає цей пакет за правилом.',
  'rule-dropped': 'Фільтр відкидає цей пакет за правилом.',
  'chain-end-accepted': 'Кінець вбудованого ланцюжка RouterOS: фільтр пропускає цей пакет.',
  'missing-fact': 'Для рішення бракує відомого факту про пакет.',
  'fasttrack-slow-path': 'Розглядаємо один пакет, який бачить фільтр (повільний шлях). FastTrack позначає з’єднання: наступні його пакети переважно оминатимуть фільтр, але цей пакет іде списком далі.',
  'invalid-rule': 'Правило має непідтримувану форму або поєднання полів.',
  'invalid-policy': 'Неправильна форма набору правил.',
  'invalid-topology': 'Неправильна форма схеми мережі.',
  'unsupported-packet': 'Цей пакет поза підтримуваним маршрутизованим шляхом IPv4 unicast.',
  'invalid-record': 'Неправильна форма запису вправи.',
  'invalid-bank': 'Неправильна форма банку вправ.',
  'other-chain': 'Інший ланцюжок.', disabled: 'Вимкнено.', mismatch: 'Умова не збігається.',
  match: 'Усі умови збіглися.', marked: 'З’єднання позначено FastTrack; цей пакет іде далі.', unknown: 'Факт невідомий.',
  'hint-door': 'Чия це адреса призначення — самого роутера чи когось за ним? Подивись на схему.',
  'hint-order': 'Правила читаються згори вниз. Які з них взагалі дивляться на стан цього пакета?',
  'hint-example': 'Окремий приклад: UDP-пакет 192.0.2.10:34567 → 198.51.100.20:23456. Правило A: protocol=tcp dst-port=12345 action=drop; правило B: protocol=udp dst-port=23456 action=accept. У A протокол не збігається; у B збігаються і протокол, і порт — на ньому розгляд зупиняється. Так само порівнюй кожне поле свого пакета згори вниз. FastTrack лише позначає з’єднання, а цей пакет іде далі.',
  'chain-end-row': 'кінець списку → пропустити',
  'hook.input': 'input — до самого роутера', 'hook.forward': 'forward — крізь роутер',
  'safety-suite': 'Перевірка захисту та дозволеного трафіку.',
  'safety-exceptions': 'Відомі відхилення у навчальному наборі з помилкою.',
  'card-from': ({ address, ingress }) => `Звідки: ${address} → ${ingress}`,
  'card-to': ({ address }) => `Куди: ${address}`,
  'dstnat.yes': ({ address, port } = {}) => address ? `прокинуто з ${address}:${port}` : 'так — порт прокинуто',
  'dstnat.no': 'ні', 'dstnat.unknown': 'невідомо',
  'state.new': 'нове', 'state.established': 'встановлене', 'state.related': 'пов’язане',
  'state.invalid': 'некоректне', 'state.untracked': 'без відстеження', 'state.unknown': 'невідомо',
  'mismatch.connectionState': 'Не збігається стан з’єднання.',
  'mismatch.connectionNatState': 'Не збігається факт dst-NAT.',
  'mismatch.protocol': 'Не збігається протокол.',
  'mismatch.srcAddress': 'Не збігається адреса джерела.',
  'mismatch.dstAddress': 'Не збігається адреса призначення.',
  'mismatch.srcPort': 'Не збігається порт джерела.',
  'mismatch.dstPort': 'Не збігається порт призначення.',
  'mismatch.inInterface': 'Не збігається вхідний інтерфейс.',
  'mismatch.inInterfaceList': 'Вхідний інтерфейс не відповідає умові списку.',
  'mismatch.outInterface': 'Не збігається вихідний інтерфейс.',
  'mismatch.outInterfaceList': 'Вихідний інтерфейс не відповідає умові списку.',
  'rule.input-replies': 'Приймає відповіді на вже відкриті з’єднання, пов’язані пакети та пакети без відстеження.',
  'rule.input-invalid': 'Відкидає некоректні пакети до роутера.',
  'rule.input-icmp': 'Приймає ICMP до роутера.',
  'rule.input-lan': 'Дозволяє доступ до роутера з LAN.',
  'rule.input-rest': 'Відкидає решту пакетів до роутера.',
  'rule.forward-fasttrack': 'Позначає встановлені та пов’язані з’єднання для FastTrack.',
  'rule.forward-replies': 'Пропускає встановлені, пов’язані пакети та пакети без відстеження крізь роутер.',
  'rule.forward-invalid': 'Відкидає некоректні пакети крізь роутер.',
  'rule.forward-wan-new': 'Відкидає нові з’єднання з WAN, для яких немає dst-NAT.',
};

// Logic vocabulary has a separate entry point so screen wording (`ui`,
// `predictStep`) can evolve independently. Pass the params returned by hints.
const chainCopy = {
  'hint-chain-look': ({ to, routerAddresses }) => `Подивись на «Куди»${to ? `: ${to}` : ''} і знайди на схемі «адреси цього роутера»${routerAddresses ? `: ${routerAddresses}` : ''}.`,
  'hint-chain-move': () => 'Порівняй «Куди» з «адреси цього роутера»: збігається — input; належить іншому пристрою — forward. Для відповіді порівнюй так само.',
  'hint-chain-example': ({ routerIp, otherIp }) => routerIp && otherIp
    ? `У цьому завданні «Куди: ${routerIp}» — адреса самого роутера → input; «Куди: ${otherIp}» — адреса іншого пристрою → forward.`
    : 'У цьому завданні порівняй «Куди» з «адреси цього роутера»: збіг означає input, адреса іншого пристрою — forward.',
  'hint-door': ({ to, routerAddresses, dstNat, natFrom }) => to
    ? `${dstNat ? `Після dst-NAT${natFrom ? ` з ${natFrom}` : ''} адреса «Куди» — ${to}. Порівняй саме цю адресу` : `Порівняй «Куди»: ${to}`} з «адреси цього роутера»: ${routerAddresses}. Самому роутеру — input; іншому пристрою — forward.`
    : 'Порівняй адресу «Куди», яку бачить фільтр (після dst-NAT, якщо він є), з «адреси цього роутера» на схемі.',
};

export function chainText(code, params = {}) {
  const entry = chainCopy[code] ?? copy[code];
  return typeof entry === 'function' ? entry(params) : entry ?? `[${code}]`;
}

export function t(code, params = {}) {
  const entry = copy[code];
  return typeof entry === 'function' ? entry(params) : entry ?? `[${code}]`;
}

/** Walks must render this too, so the slow-path assumption is never a hidden flag. */
export function walkText(walk) {
  return {
    hook: t(`hook.${walk.hook}`),
    assumptions: walk.assumptions.map(code => t(code)),
    conclusion: t(walk.code),
  };
}

// ─── The firewall screen (FW-1 screen spec v1 + v2) ─────────────────────────
// Screen words live apart from `copy`, which holds exactly the logic's codes.

/** The NetGym start screen card. */
export const section = {
  title: 'Фаєрвол',
  blurb: 'як фільтр вирішує долю пакета: input і forward, порядок правил',
};

/** Connection states: Ukrainian, then the RouterOS token; and a one-clause meaning (S1). */
export const states = {
  new: 'нове (new)',
  established: 'встановлене (established)',
  related: 'пов’язане (related)',
  invalid: 'некоректне (invalid)',
  untracked: 'без відстеження (untracked)',
  unknown: 'невідомо',
};
// As RouterOS's connection tracking means them (principle 0: correct, even
// where a shorter wording was taught): `new` can hold several packets, and
// `established` covers both directions, not only replies.
export const meanings = {
  new: 'нове (new) — з’єднання, у якому ще не було трафіку в обидва боки',
  established: 'встановлене (established) — з’єднання, де трафік уже йшов в обидва боки',
  related: 'пов’язане (related) — пакет, пов’язаний з наявним з’єднанням, але не його частина, напр. ICMP-помилка',
  invalid: 'некоректне (invalid) — пакет, якого не можна віднести до жодного відомого з’єднання',
  untracked: 'без відстеження (untracked) — пакет, для якого відстеження з’єднань вимкнено (правилом у raw)',
};

/** Well-known services by port (S1): «на порт 8291 (Winbox)». */
export const services = { 8291: 'Winbox', 22: 'SSH', 80: 'web', 443: 'web', 53: 'DNS', 445: 'SMB' };

export const ui = {
  heading: 'Фаєрвол',
  // The section's two exercises (the switch beside the heading).
  exercise: 'Вправа',
  // Short enough that FW-1's bar (its syntax and theme) stays one row at 1000 px.
  exercises: { predict: 'Передбач', order: 'Порядок правил' },
  syntaxLabel: 'MikroTik RouterOS',
  variant: 'Набір правил',
  level: 'Рівень',
  lesson: 'Правила перевіряються згори вниз у своєму ланцюжку. Перше правило accept чи drop, де збіглися всі умови, завершує перевірку; FastTrack лише позначає з’єднання, і пакет іде далі. Умови правила діють разом (і); значення через кому — будь-яке з них (або).',
  // Progress dots.
  progressLabel: 'Пакети раунду',
  progress: ({ n, total }) => `Пакет ${n} з ${total}`,
  dot: ({ n, status }) => `Пакет ${n}${status ? `: ${status}` : ''}`,
  dotStatus: { ok: 'правильно', no: 'фільтр вирішив інакше', revealed: 'показано відповідь', current: 'поточний' },
  // The packet card.
  cardLabel: 'Пакет',
  from: 'Звідки',
  to: 'Куди',
  toNat: 'Адреса, яку бачить фільтр — вже після dst-NAT',
  stateGiven: 'Стан задано',
  dstNat: 'dst-NAT',
  via: ingress => `→ ${ingress}`,
  ports: ({ protocol, dst, src }) => [protocol, ...(dst ? [`на порт ${dst}`] : []), ...(src ? [`з порту ${src}`] : [])].join(', '),
  port: (port, service) => (service ? `${port} (${service})` : String(port)),
  icmp: type => ({ 8: 'ICMP echo (ping)', 3: 'ICMP: недосяжно' })[type] ?? (type === undefined ? 'ICMP' : `ICMP, тип ${type}`),
  natYes: ({ address, port, to, toPort }) => `прокинуто з ${address}:${port} на ${to}:${toPort}`,
  // The two choices.
  doors: 'Ланцюжок',
  rules: 'Правило, що вирішує',
  hook: { input: 'input — до самого роутера', forward: 'forward — крізь роутер' },
  chainEnd: chain => `${chain}: кінець списку (RouterOS) → пропустити`,
  chainEndShort: 'кінець списку (RouterOS) → пропустити',
  disabled: 'вимкнено',
  anyPacket: 'будь-який пакет',
  check: 'Перевірити',
  next: 'Наступний пакет →',
  // «Далі →» beside «Наступний пакет →»: where it goes (A1 v2).
  toLevel2: 'рівень 2 · Яке правило',
  newRound: 'новий раунд',
  yours: 'твій вибір',
  filterChose: 'так вирішив фільтр',
  // Condition chips and their field names.
  field: {
    connectionState: 'стан', connectionNatState: 'connection-nat-state', protocol: 'protocol',
    srcAddress: 'src-address', dstAddress: 'dst-address', srcPort: 'src-port', dstPort: 'dst-port',
    inInterface: 'in-interface', inInterfaceList: 'in-interface-list',
    outInterface: 'out-interface', outInterfaceList: 'out-interface-list',
  },
  // A chip's shorter name, so each rule stays one row of 44 px (S4); the
  // chip's title, «Команда» and the walk's words keep the RouterOS name.
  chipField: { connectionNatState: 'NAT' },
  not: value => `не ${value}`,
  // The walk, row by row (§5, S1).
  walk: {
    'other-chain': 'інший ланцюжок',
    disabled: 'вимкнено',
    mismatch: text => `не збігається: ${text}`,
    match: 'збіглося — вирішує',
    end: 'кінець списку — вирішує',
    marked: 'позначено FastTrack — пакет іде далі',
    unknown: 'невідомо — бракує факту',
    'not-reached': 'не дійшло',
  },
  predicate: ({ field, rule, packet }) => `${field}: правило — ${rule}; пакет — ${packet}`,
  unknownFact: 'невідомо',
  natNone: 'ні (без dst-NAT)',
  natDone: 'dstnat (прокинуто)',
  fromIface: (iface, lists) => `з ${iface}${lists.length ? ` (${lists.join(', ')})` : ''}`,
  toIface: (iface, lists) => `до ${iface}${lists.length ? ` (${lists.join(', ')})` : ''}`,
  // Feedback (S1: a wrong commit is information, not «Ще ні»).
  wrong: '✗ Фільтр вирішив інакше.',
  right: 'Фільтр вирішив так само.',
  appliedPlain: 'Відповідь показано в списку правил і на схемі.',
  decidedRow: (chain, n) => `Вирішує ${chain}, рядок ${n}.`,
  decidedEnd: chain => `Вирішує кінець списку ${chain}.`,
  roundOk: 'Усі пакети раунду передбачено правильно.',
  roundEnd: 'Раунд завершено. «Далі» — новий набір пакетів.',
  // Walk controls.
  replay: 'Показати ще раз',
  steps: 'По кроках',
  stepsGroup: 'Крок перевірки',
  stepBack: 'Крок назад',
  stepForward: 'Крок уперед',
  stepOf: ({ n, total }) => `крок ${n} з ${total}`,
  // The diagram.
  diagramLabel: 'Схема: Інтернет, роутер R1 і локальна мережа',
  diagramCaption: 'СХЕМА',
  internet: 'Інтернет',
  isp: 'шлюз ISP',
  pc: 'ПК',
  server: 'Сервер',
  core: 'сам роутер',
  ingressChip: (iface, lists) => `${iface} ∈ ${lists.join(', ')}`,
  natLabel: ({ address, port, to, toPort }) => `dst-NAT: ${address}:${port} → ${to}:${toPort}`,
  // Round 5: the same rule in three short lines under the bridge's label.
  natLines: ({ address, port, to, toPort }) => ['dst-NAT на R1:', `${address}:${port} →`, `${to}:${toPort}`],
  // Round 5 (spec G): the block of the router's own addresses inside R1 (routing's words too).
  routerAddresses: 'адреси цього роутера',
  illustration: 'далі — ілюстрація: фільтр пропустив; чи відповість сервіс, тут не перевіряється',
  zoom: { group: 'Масштаб схеми', out: 'Зменшити', in: 'Збільшити', all: 'Уся схема', allLabel: 'Показати всю схему' },
  frameLabel: 'Схема: «+» і «−» змінюють масштаб',
  // «Текстом» and «Правила».
  textButton: 'Текстом',
  textTitle: 'Схема і пакет текстом',
  rulesTitle: 'Як фільтр читає правила',
  // «⋯» (round 4, spec F1): what the bar's «Правила» and «Команда» were.
  statesMenu: 'Що означають стани',
  commandsMenu: 'Команда RouterOS',
  text: {
    router: 'Роутер R1',
    port: ({ name, address, prefix, lists }) => `${name} — ${address}/${prefix}${lists.length ? `, список ${lists.join(', ')}` : ''}`,
    gateway: address => `Шлюз провайдера за ether1: ${address}`,
    hosts: 'Вузли',
    host: (label, address) => `${label}: ${address}`,
    nat: 'dst-NAT на R1',
    natRule: ({ address, port, to, toPort }) => `R1 прокидає ${address}:${port} на сервер ${to}:${toPort}.`,
    packet: 'Пакет',
    door: 'Ланцюжок',
    rules: 'Список правил (згори вниз)',
    rule: ({ n, chain, action, conditions, disabled, description }) => `${n} · ${chain} · ${action} · ${conditions}${disabled ? ' · вимкнено' : ''}${description ? `. ${description}` : ''}`,
    anyPacket: 'будь-який пакет',
    outcome: (line, text) => `${line} — для цього пакета: ${text}`,
    conclusion: 'Висновок',
    choice: 'Твій вибір',
  },
  rulesList: [
    'Правила перевіряються згори вниз у своєму ланцюжку. Перше правило accept чи drop, де збіглися всі умови, завершує перевірку.',
    'input — пакети до однієї з адрес самого роутера; forward — пакети, які роутер передає далі, крізь себе.',
    'Вхідний інтерфейс задає, які списки (WAN, LAN) може зловити правило. Input чи forward він не вирішує — це вирішує лише адреса призначення.',
    'Умови правила діють разом (і); значення через кому — будь-яке з них (або). «!» перед значенням означає «не».',
    'Стан з’єднання задано на картці пакета: тут фільтр його не обчислює.',
    'Вимкнене правило фільтр минає.',
    'FastTrack позначає з’єднання: наступні його пакети переважно оминатимуть фільтр. А цей пакет іде списком далі.',
    'Якщо жодне правило не вирішило, у кінці вбудованого ланцюжка RouterOS пакет пропускається.',
    'Номери правил — як у print і Winbox: з 0.',
  ],
  statesTitle: 'Стани з’єднання',
  // Round 5 (rule R2): each rule's purpose, always visible under it; one
  // line at a 420 px panel (Purpose.jsx PURPOSE_MAX). Keyed by the rule's
  // description code; the full description stays in «Текстом» and FW-2.
  purpose: {
    'rule.input-replies': 'пропускає відповіді та пов’язані пакети',
    'rule.input-invalid': 'відкидає некоректні пакети',
    'rule.input-icmp': 'пропускає ICMP (ping) до роутера',
    'rule.input-lan': 'пускає до роутера з LAN',
    'rule.input-rest': 'відкидає решту пакетів до роутера',
    'rule.forward-fasttrack': 'лише позначає з’єднання для FastTrack',
    'rule.forward-replies': 'пропускає відповіді та пов’язані пакети',
    'rule.forward-invalid': 'відкидає некоректні пакети',
    'rule.forward-wan-new': 'відкидає нові з WAN, якщо немає dst-NAT',
  },
  endPurpose: 'жодне правило не вирішило — пакет проходить',
};

// FW-2 has a separate vocabulary: FW-1's closed code/copy contract stays exact.
export const orderGoals = {
  input: 'Відповіді проходять. Некоректні пакети відкидаються, навіть із LAN або як ICMP.\nРоутер відповідає на ping і дозволяє доступ із LAN.\nКожне правило має отримувати пакети, для яких воно призначене.',
  all: 'Відповіді проходять. Некоректні пакети відкидаються, навіть із LAN або як ICMP.\nРоутер відповідає на ping і дозволяє доступ із LAN. Нові з’єднання з WAN не проходять крізь роутер без прокидання порту.\nПроброс порту: 100.64.0.2:443 → Сервер:443.\nКожне правило має отримувати пакети, для яких воно призначене.',
};
export const orderCopy = {
  'order-shadowed': ({ ruleNumber, blockerNumber, rule, blocker, action }) => `Правило ${blockerNumber} (${blocker}) ${action === 'drop' ? 'відкинуло' : 'пропустило'} пакет раніше, тому правило ${ruleNumber} (${rule}) його не побачило.`,
  'order-ok': 'Порядок працює: пакети отримують потрібний результат, і кожне правило спрацьовує.',
  'order-invalid': 'У списку має бути кожне правило рівно один раз.',
  'order-verdict': 'Цей пакет отримав інший результат.',
  // «раніше», not a direction word: the FW-2 leak gate reads «вище»/«нижче»
  // near FastTrack as ordering prose, and the feedback names one blocker.
  'order-dead': ({ rule, blocker }) => `Правило «${rule}» ніколи не спрацює: усі його пакети раніше забирає правило «${blocker}».`,
  'order-hint-question': 'Що станеться з пакетом, який дійшов до правила «Відкидає решту пакетів до роутера»?',
  'order-hint-walk': 'Подивись шлях пакета у своєму списку: яке правило забирає його першим?',
  'order-hint-example': 'Окремий приклад для SMTP: A — пропустити TCP на порт 2525; B — відкинути TCP на порт 2526; C — відкинути решту. Пакет на порт 2525 проходить у списку A, B, C. У списку C, A, B він зупиниться на C. Порівняй умови пакета з кожним правилом згори вниз.',
  'order-reveal-label': 'Один із правильних порядків',
  'order-accepted-label': 'Твій робочий порядок — RouterOS',
};
export function orderText(code, params = {}) {
  const entry = orderCopy[code];
  return typeof entry === 'function' ? entry(params) : entry ?? `[${code}]`;
}
export const orderUi = {
  title: 'Упорядкуй правила',
  policy: 'Спрощений домашній набір за практикою MikroTik.',
  // After a reveal, beside the reference list (stage-1 decisions).
  yours: 'Твій порядок',
  // The screen (OrderView.jsx): the level switch, the list, the walk toggle.
  level: 'Рівень',
  list: 'Правила фільтра',
  packet: 'Пакет',
  walkShow: 'Показати шлях пакета',
  walkHide: 'Сховати шлях пакета',
  check: 'Перевірити',
  revealButton: 'Показати відповідь',
  tipsHeading: 'Чому так',
  resultLabel: 'Результат',
  copyWhat: 'правила RouterOS',
  textTitle: 'Схема текстом',
  // Hint 2 in the words of the finding it was opened for (OrderView.jsx): a
  // packet's walk is orderCopy['order-hint-walk']; a rule that never fires
  // has no packet, so it points at the two marked rules; a list that already
  // passed gets the rule that decides any packet. No order words (FW-2 gate).
  hintDead: 'Подивись на два позначені правила («перехопило» і «не отримує»): які пакети підходять під умови обох?',
  hintDone: 'Яке правило у твоєму списку першим забирає пакет? Воно й вирішує його долю.',
  mark: '• Ще ні',
  // A shadowing (spec F2, Fable 1): the earlier rule caught the packets, the later one never gets them.
  markBlocker: '• перехопило',
  markHidden: '• не отримує',
  fate: ({ expected, actual }) => `має: ${orderUi.verdict[expected]} · у тебе: ${orderUi.verdict[actual]}`,
  verdict: { accept: 'пропустити', drop: 'відкинути', unknown: 'невідомо' },
  tips: {
    fasttrack: 'FastTrack — перед правилом, що пропускає встановлені/пов’язані з’єднання. Позначене з’єднання може передавати наступні TCP/UDP-пакети в обхід фільтра. Деякі пакети все одно йдуть повільним шляхом і потребують правила accept нижче.',
    replies: 'Правило для встановлених з’єднань зручно тримати ближче до початку: більшість таких пакетів швидко завершить перевірку.',
    input: 'У input правило «відкинути решту» закриває доступ до роутера для інших пакетів.',
    forward: 'У forward окреме правило відкидає нові з’єднання з WAN без dst-NAT. Решта, зокрема дозволений трафік із LAN, проходить у кінці ланцюжка.',
  },
};

// Round 4 screen vocabulary (2b adopts the level selector and chain step).
export const predictLevels = [
  { value: 1, label: '1 · Куди йде пакет' },
  { value: 2, label: '2 · Яке правило' },
];
export const predictStep = {
  hook: 'Який ланцюжок?',
  // Round 5 (rule R1, spec v2 A): the action line above the step's choices,
  // which is also the choice group's name.
  action: {
    l1: 'Обери, кому адресовано пакет.',
    hook: 'Обери ланцюжок для цього пакета.',
    rule: 'Тепер обери правило, що вирішить долю пакета.',
    // After the commit, in the same place (round 5 repair): the step is done.
    l1Done: 'Відповідь зафіксовано.',
    ruleDone: 'Правило зафіксовано — нижче видно, де зупинився фільтр.',
  },
  // Level 1's choices: Ukrainian first, the chain second (spec §3).
  l1Options: { input: 'самому роутеру', forward: 'іншому пристрою' },
  // Level 1's rule sentence, under the task (spec v2 E, v2.1), the same size.
  rule: 'Адреса «Куди» належить самому роутеру — це input. Іншому пристрою — це forward: пакет іде крізь роутер, а пропустити його чи ні, вирішують правила. Тут усі пакети приходять на роутер, і адресу «Куди» ніхто не змінює (без dst-NAT).',
  // Level 1's verdict, its second line (spec v2 F, v2.1): whose address «Куди» is.
  owner: ({ ip, kind, role }) => kind === 'router' ? `${ip} — адреса самого роутера → input.`
    : `${ip} — ${{ pc: 'адреса ПК', 'web-server': 'адреса сервера', internet: 'адреса вузла в інтернеті' }[role] ?? 'адреса іншого пристрою'}, не роутера → forward.`,
  // FactLink's polite announcement (spec v2 C): the owner, on the learner's tap.
  said: ({ ip, kind, iface, role }) => kind === 'router' ? `${ip} — адреса R1 у ${iface === 'ether1' ? 'WAN' : 'LAN'}`
    : `${ip} — ${{ pc: 'адреса ПК у LAN', 'web-server': 'адреса сервера', internet: 'адреса вузла в інтернеті' }[role] ?? 'адреса іншого пристрою'}`,
  // The committed marks, on one line under the pair (spec v2 F).
  // With glyphs (round 5 repair): «твій вибір: input ✗ · фільтр: forward ✓»; one ✓ when they agree.
  marks: ({ mine, filter }) => (!mine ? `фільтр: ${filter}` : mine === filter ? `твій вибір: ${mine} ✓ · фільтр: ${filter}` : `твій вибір: ${mine} ✗ · фільтр: ${filter} ✓`),
  folded: ({ hook, count }) => `${hook}: ${count} ${count === 1 ? 'правило' : count >= 2 && count <= 4 ? 'правила' : 'правил'} — цей пакет їх не бачить`,
  reply: 'Це відповідь на дозволене з’єднання.',
  // Level 1's verdict: the chain and why, from the packet's destination.
  chainRight: 'Ланцюжок правильний.',
  chainWhy: {
    input: 'Пакет адресовано самому роутеру → input.',
    forward: 'Пакет іде крізь роутер до іншого вузла → forward.',
  },
  slowPath: 'Ця прогулянка показує пакет на повільному шляху. Пакети, що пройшли FastTrack, оминають фільтр; деякі пакети все одно йдуть повільним шляхом, тому наступне правило accept потрібне.',
};
