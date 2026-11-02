export const copy = {
  ok: 'Усе готово. Порядок і режими підходять.',
  'invalid-record': 'Не вдалося прочитати набір карток.',
  'invalid-answer': 'Поверни кожну картку до списку рівно один раз.',
  'needs-before': 'Для цієї дії ще не готова потрібна умова.',
  'not-last': 'Збережи налаштування, коли всі зміни вже внесено.',
  'mode-missing': ({ positions = [] } = {}) => modeMissing(positions),
  'wrong-mode': 'Перевір режим позначеної картки.',
  'typed-missing': 'Рядок порожній: введи команду й натисни Enter.',
  'unknown-command': 'Не впізнаю початок команди в цьому наборі.',
  'ambiguous-keyword': 'Скорочення має кілька значень. Допиши слово.',
  'missing-part': 'Команда ще не завершена. Додай потрібну частину.',
  'wrong-part': 'Перевір позначене слово. Тут потрібна інша частина команди або повніший запис.',
  'extra-part': 'Введи одну команду без зайвих частин, розділювачів і керівних символів.',
  'wrong-value': ({ field } = {}) => `Перевір значення: ${fieldNames[field] ?? 'позначена частина'}. Воно має відповідати завданню.`,
  'other-command': 'Ця команда виконує іншу дію. Зістав її з описом картки.',
  'unsafe-command': ({ reason } = {}) => unsafe[reason] ?? 'Цей спосіб не підходить для безпечного початкового налаштування.',
  'weak-key': 'У цій вправі мінімальний безпечний розмір ключа — 2048 біт. Обери 2048 або 4096.',
  'weak-secret': 'Короткий або передбачуваний пароль легко вгадати. Для роботи обери довгий унікальний пароль. У скрипті цей пароль замінено заповнювачем.',
  'keep-together': 'Пов’язані зміни зручніше читати поруч. На правильність це не впливає.',
  'hostname-before-key': 'Спершу задай ім’я пристрою, а потім створи ключ: назва ключа будується з імені пристрою та домену.',
  'domain-before-key': 'Спершу задай домен, а потім створи ключ: назва ключа будується з імені пристрою та домену.',
  'user-before-login': 'Спершу створи користувача, а потім вмикай на лініях vty вхід за локальними користувачами — інакше зайти через vty не буде з чим. Це безпечний порядок роботи через консоль.',
  // Sorting explanations describe the dependency; recall has per-line syntax feedback.
  'save-last': 'Збереження конфігурації фіксує поточний стан. Збережи її після всіх змін, щоб після перезапуску налаштування були повними.',
  'hint-question': 'Якій дії спершу потрібні інші налаштування?',
  'hint-evidence': 'Порівняй призначення дій: що вони створюють і що вже має бути готове? Для кожної також потрібен свій режим.',
  'hint-example': 'Приклад на інших значеннях: hostname Demo, потім ip domain-name demo.example, а тоді створення ключа.',
  // After success, one tip about saving (the rule's words and why saving early fails).
  'tip-save': 'Збереження конфігурації фіксує поточний стан. Збережи її після всіх змін, щоб після перезапуску налаштування були повними. Команда — write memory (або copy running-config startup-config). Збереження до завершення змін збереже лише проміжний стан.',
  'tip-key': '2048 біт — межа безпеки цієї вправи; 4096 теж підходить. У документації IOS 15S для другої версії вказано старий мінімум сумісності 768 біт.',
  'tip-passwords': 'Загальне правило безпеки: старі паролі можуть бути відкритим текстом або мати оборотне кодування. Тип 7 — маскування, а не захист; service password-encryption не робить його стійким.',
  'tip-admin': 'privilege 15 дає повне адміністрування. Ця вправа показує початкову основу, а не повний захист пристрою.',
  'tip-modes': 'Режим визначає, до якої частини налаштувань належить команда. Переходи між режимами додано у скрипт.',
  'reference-label': 'Один із правильних порядків. Заміни заповнювачі власними довгими унікальними паролями.',
  'accepted-label': 'Твій прийнятий порядок. Заміни заповнювачі власними довгими унікальними паролями перед використанням.',
  'copy-secret': 'Паролі з символами, які консоль може обробити інакше, замінено на <пароль>; введи їх окремо на пристрої.',
  'profile': 'Маршрутизатор ISR, IOS 15.1(1)T або новіша 15.x, початкові налаштування. Працюємо через консоль в ізольованій навчальній мережі; усі лінії віддаленого доступу — 0–15.',
  'typed.hostname': ({ hostname }) => `Задай пристрою ім’я ${hostname}.`,
  'typed.domain': ({ domain }) => `Задай доменне ім’я: ${domain}.`,
  'typed.crypto': ({ modulus }) => `Створи ключ захищеного доступу розміром ${modulus} біт.`,
  'typed.ssh-version': 'Вимагай другу версію захищеного віддаленого доступу.',
  'typed.enable-secret': 'Задай власний пароль підвищення прав із незворотним зберіганням.',
  'typed.username': ({ username }) => `Створи користувача ${username}: повні права (15), власний пароль із незворотним зберіганням.`,
  'typed.password-encryption': 'Увімкни маскування старих паролів у конфігурації.',
  'typed.transport-ssh': 'Дозволь лише захищений протокол для вхідного віддаленого доступу.',
  'typed.login-local': 'Для віддаленого входу використовуй локальні облікові записи.',
  'typed.ip-address': ({ ip, mask }) => `Задай інтерфейсу адресу ${ip} з маскою ${mask}.`,
  'typed.no-shutdown': 'Адміністративно ввімкни інтерфейс.',
  'typed.write-memory': 'Збережи поточні налаштування для наступного запуску.',
  // Profile includes the generated SVI prerequisites (the old deckUi givens leave in 2b).
  'profile.dr-2': ({ ip, mask, gateway, mgmt }) => `Catalyst 2960-24TT-L, K9 LAN Base, IOS 15.0(2)SE або новіша 15.x. Початкове налаштування через консоль в ізольованій навчальній мережі. Адреса керування: ${ip}, маска ${mask}, шлюз ${gateway}; віддалені лінії — 0–15. VLAN ${mgmt} уже є, і порт доступу в ньому піднятий та пересилає кадри. IP-маршрутизацію вимкнено.`,
  // The device; the C1 givens (reset, serial console, no WAN) are the line under the task (deckUi).
  'profile.dr-3': ({ ip, prefix }) => `RouterOS 7.12 або новіша. Локальна мережа на ether2 через міст; адреса ${ip}/${prefix}.`,
  'typed.dr-2.crypto': 'Створи ключ захищеного доступу: 2048 біт.',
  'typed.svi-address': ({ mgmt, ip, mask }) => `Задай інтерфейсу VLAN ${mgmt} адресу ${ip} з маскою ${mask}.`,
  'typed.svi-up': ({ mgmt }) => `Адміністративно ввімкни інтерфейс VLAN ${mgmt}.`,
  'typed.default-gateway': ({ gateway }) => `Задай шлюз керування ${gateway}.`,
  'weak-key.dr-2': 'У цій вправі потрібен ключ розміром 2048 біт.',
  'bridge-before-port': 'Міст, до якого додаєш порт, має вже існувати.',
  'bridge-before-member': 'Міст, який додаєш до списку інтерфейсів, має вже існувати.',
  'bridge-before-address': 'Міст, якому задаєш адресу, має вже існувати.',
  'list-before-member': 'Список, до якого додаєш інтерфейс, має вже існувати.',
  'list-before-mac': 'Список, яким обмежуєш доступ за апаратною адресою, має вже існувати.',
  'list-before-discovery': 'Список, яким обмежуєш виявлення сусідів, має вже існувати.',
  'user-before-disable': 'Спершу створи власного користувача з повними правами. Вимкнення типового облікового запису забороняє подальші входи з ним.',
  'hint-objects': 'Які дії посилаються на об’єкти, що створює інша картка?',
  'hint-routeros-example': 'Приклад на інших значеннях: спершу створи міст bridge-demo, потім додай до нього порт ether3.',
  'tip-2960-key': 'Для цього профілю використовуємо ключ 2048 біт. Підтримку 4096 для нього тут не припускаємо.',
  'tip-management-vlan': 'Окрема VLAN керування відділяє керування від типового сегмента VLAN 1. Сама зміна номера VLAN не замінює обмеження доступу.',
  'tip-routeros-objects': 'Команда, що називає міст або список інтерфейсів, працює лише з тим, що вже створено, тому спершу створюй міст і список, а потім посилайся на них.',
  'tip-routeros-admin': 'Перед тим як вимкнути admin, увійди новим користувачем і переконайся, що він працює. Вимкнення забороняє подальші входи з типовим обліковим записом; це не обіцянка завершення вже відкритої сесії. Група full дає повне адміністрування.',
  'tip-routeros-mac': 'Якщо налаштовуєш через MAC-Winbox, спершу додай порт у міст і міст у список LAN, а тоді обмежуй доступ списком — інакше відріжеш себе. У цій вправі працюємо через серійну консоль.',
  'tip-routeros-firewall': 'Це налаштування керування в ізольованій мережі, а не повний захист. WAN не підключено. Перед підключенням потрібні правила, що забороняють керування з WAN. Потренуватися з правилами можна в розділі «Фаєрвол».',
  'tip-routeros-save': 'У звичайному режимі RouterOS зберігає змінені налаштування сам; окремої команди збереження не потрібно. Безпечний режим має окремі правила відкату змін при втраті сесії.',
  'typed.svi-enter': ({ mgmt }) => `Перейди до налаштувань інтерфейсу VLAN ${mgmt}.`,
  'checkpoint-login': ({ username, ip }) => `Перевір вхід: увійди як ${username} через Winbox (або SSH) на адресу LAN ${ip} у новому вікні.`,
  'checkpoint-comment': ({ username }) => `# Тепер увійди як ${username} у новому вікні. Далі — лише після успішного входу.`,
  'user-before-checkpoint': 'Спершу створи користувача, під яким перевірятимеш вхід.',
  'address-before-checkpoint': 'Спершу задай адресу LAN, на яку підключатимешся в новому вікні.',
  'port-before-checkpoint': 'Спершу додай порт доступу до мосту: через нього перевіряють вхід на адресу LAN.',
  'checkpoint-before-disable': 'Спершу успішно увійди новим користувачем у новому вікні, і лише тоді вимикай admin.',
  'tip-default-gateway': 'Комутатор рівня 2 не маршрутизує: IP-маршрутизацію вимкнено. ip default-gateway потрібен для власного трафіку керування до інших мереж.',
  'script-part-1': 'Частина 1',
  'script-part-2': 'Частина 2',
  'script-setup': 'Налаштування',
  'script-as-router': 'як у роутері',
  'hint-cards': ({ positions = [] } = {}) => `Подивись на ${positions.length === 1 ? 'картку' : 'картки'} ${cardList(positions)}.`,
  // Rung 1 after a missing-mode verdict: where to look and what to ask of each card (the verdict already counts them).
  'hint-mode-missing': ({ positions = [] } = {}) => `${positions.length && positions.length <= 4 ? `Почни з ${positions.length === 1 ? 'картки' : 'карток'} ${cardList(positions)}` : 'Пройди позначені картки по черзі'}: де вводять кожну команду — у налаштуваннях усього пристрою, інтерфейсу, ліній входу чи просто в привілейованому режимі?`,
  'hint-mode-rule': ({ prompt } = {}) => ({
    '(config-if)#': 'Команду для інтерфейсу вводять у (config-if)#.',
    '(config-line)#': 'Параметри ліній віддаленого входу задають у (config-line)#.',
    '#': 'Зберігають конфігурацію з привілейованого режиму #.',
  }[prompt] ?? 'Загальні параметри пристрою задають у (config)#.'),
  'hint-bridge-shape': 'спершу створи міст bridge-demo, потім додай до нього порт ether3.',
  'hint-start-router': 'Почни з того, без чого не працюють інші команди: ім’я та домен.',
  'hint-start-switch': 'Зістав адресу керування з інтерфейсом VLAN, а шлюз — з налаштуваннями всього комутатора.',
  'hint-start-routeros': 'Почни зі створення об’єктів, на які посилаються інші дії: міст і список інтерфейсів.',
  'hint-shape': ({ example } = {}) => `Приклад на інших значеннях: ${example ?? 'hostname Demo'}`,
  'hint-recall-mode': ({ mode, count } = {}) => `Цю команду вводять у режимі ${mode ?? ''}; у ній ${count ?? ''} ${count >= 2 && count <= 4 ? 'слова' : 'слів'}.`,
  'hint-recall-almost': ({ start } = {}) => `Початок команди: ${start ?? ''} … — допиши останнє слово.`,
  'hint-recall-first': ({ word } = {}) => `Перше слово команди: ${word ?? ''}.`,
  'ok.dr-3': 'Усе готово. Порядок підходить.',
};

/** Card positions in words: «3», «3 і 7», «3, 5 і 7». */
function cardList(positions) {
  return positions.length < 2 ? String(positions[0] ?? '') : `${positions.slice(0, -1).join(', ')} і ${positions.at(-1)}`;
}
/** Missing modes, naming up to four cards; more are counted (the rows say «Ще ні»). */
function modeMissing(positions) {
  if (!positions.length) return 'Обери режим для позначених карток.';
  if (positions.length === 1) return `У картці ${positions[0]} ще не вибрано режим.`;
  if (positions.length <= 4) return `У картках ${cardList(positions)} ще не вибрано режим.`;
  return `У ${positions.length} картках ще не вибрано режим: їх позначено «Ще ні».`;
}

const fieldNames = { hostname: 'ім’я пристрою', domain: 'домен', username: 'ім’я користувача', privilege: 'рівень прав',
  secret: 'пароль', encoding: 'формат пароля (потрібен власний відкритий текст, можна з позначкою 0)',
  ip: 'адреса', mask: 'маска', modulus: 'розмір ключа', version: 'версія', transport: 'протокол', interface: 'інтерфейс' };
const unsafe = {
  'legacy-password': 'Старі паролі можуть бути відкритим текстом або мати оборотне кодування. Використовуй secret замість password.',
  'line-login': 'Перевірку спільного пароля лінії заміни входом через локального користувача.',
  'ssh-v1': 'Перша версія застаріла. У цій вправі потрібна друга.',
  'insecure-transport': 'Дозволь лише захищений віддалений доступ; незахищений протокол передає дані відкрито.',
  'modulus-required': 'Задай розмір ключа явно: щонайменше 2048 біт.',
};
export function text(code, params = {}) {
  const value = copy[code];
  return typeof value === 'function' ? value(params) : value ?? code;
}
export default copy;

/** Deck-specific words: the heading, and the givens line where the profile
 * doesn't hold them (DR-3; DR-2's givens are in its profile now, spec S3).
 * The task sentence is one for every deck (ui.task). */
export const deckUi = {
  'dr-1': { heading: 'Маршрутизатор Cisco: основа й захищений доступ' },
  'dr-2': { heading: 'Cisco 2960: налаштування керування' },
  'dr-3': {
    heading: 'MikroTik: налаштування керування',
    // C1: a reset router, the serial console, an isolated practice network (the device itself is profile.dr-3).
    givens: () => 'Дано: роутер після скидання без типової конфігурації, серійна консоль, ізольована навчальна мережа без WAN.',
  },
};

// ─── The setup screens (DR-1–DR-3, round 4) ────────────────────────────────
// Screen words live apart from `copy`, which holds the logic's codes.
// Calm: no scores or counts. Before a check nothing here names an order or
// a card's prompt (tests/setup-screens.test.mjs scans them); the CLI example
// (`modes`) teaches the prompts on a generic device and names no card.
export const section = { title: 'Налаштування з нуля', blurb: 'порядок команд: роутер і комутатор Cisco, роутер MikroTik' };

export const ui = {
  // The deck picker's name (its options are the decks' own labels).
  decks: 'Пристрій',
  // One task sentence for every deck: the goal only (round 5 repair v1); the how is the action line's.
  task: 'Збери базове налаштування в робочому порядку.',
  // The action line above the deck (round 5, R1), on the Cisco decks with the mode «?» after it; MikroTik has no prompts.
  action: 'Перетягни картки (або ↑ ↓) у робочий порядок; у кожній обери режим.',
  actionOrder: 'Перетягни картки (або ↑ ↓) у робочий порядок.',
  // Recall (spec S1): the order stays; three lines are typed from memory.
  recallTask: 'Порядок уже правильний. Тепер введи три команди по пам’яті: Enter перевіряє рядок.',
  // After the cards pass, or the answer is shown: the board is a script now.
  sortedTask: 'Порядок прийнято: нижче твій скрипт.',
  shownTask: 'Нижче один із правильних порядків, як скрипт.',
  // A sorting verdict names the flagged cards' positions first (spec S2).
  cardsAt: ({ positions }) => (positions.length === 1 ? `Картка ${positions[0]}:` : `Картки ${positions.slice(0, -1).join(', ')} і ${positions.at(-1)}:`),
  continue: 'Тепер по пам’яті →',
  nextWhere: 'нові значення',
  deck: 'Команди',
  promptOf: ({ n }) => `Режим для картки ${n}`,
  // The quiet prompt group's empty state, before anything is chosen.
  noPrompt: 'режим?',
  // The learner's own order after a reveal: a card left without a prompt.
  noChoice: '—',
  // Before a DR-3 card's third line: the same step in Winbox's menus.
  winbox: 'Winbox:',
  check: 'Перевірити',
  // Recall lines: the field, its verdict, the token named.
  recallLabel: 'По пам’яті',
  recallPlaceholder: 'введи команду й натисни Enter',
  lineOf: ({ n }) => `Рядок ${n}`,
  lineRight: ({ n }) => `Рядок ${n} правильний.`,
  marked: ({ token }) => `Позначене слово: «${token}».`,
  markedControl: 'Позначено керівний символ (табуляцію чи інший невидимий знак).',
  missingEnd: 'Бракує частини в кінці.',
  safety: 'Безпека:',
  recallDone: 'Усі три команди правильні.',
  // A reveal applied on the board (sorting) or in the lines (recall).
  applied: 'Відповідь показано замість твоїх карток; твій порядок — під кнопкою «Моя відповідь».',
  recallApplied: 'Команди показано в рядках.',
  // After success, in the panel (spec S2): one short line per rule the deck
  // exercised (and the deck's lead points); the full tips behind «Детальніше».
  lead: {
    'hostname-before-key': 'Ім’я пристрою й домен задають до ключа: з них будується назва ключа.',
    'domain-before-key': 'Ім’я пристрою й домен задають до ключа: з них будується назва ключа.',
    'user-before-login': 'Користувача створюють до login local, щоб на лініях vty було з чим увійти.',
    'tip-save': 'Зберігають останнім: збереження фіксує лише те, що вже зроблено.',
    'tip-default-gateway': 'Комутатор рівня 2 не маршрутизує: ip default-gateway веде його власне керування до інших мереж.',
    'tip-management-vlan': 'Окрема VLAN керування відділяє керування від типової VLAN 1.',
    'tip-routeros-objects': 'Міст і список створюють раніше за команди, що на них посилаються.',
    'tip-routeros-admin': 'admin вимикають лише після входу новим користувачем у новому вікні.',
    'tip-routeros-firewall': 'Це керування лише для LAN: WAN не підключено, а перед підключенням потрібні правила, що забороняють керування з WAN.',
    'tip-routeros-save': 'RouterOS зберігає зміни сам: окремої команди збереження немає.',
  },
  // After success: the explanation in the panel, the script on the board.
  scriptHeading: 'Твій скрипт',
  answerHeading: 'Відповідь',
  ownHeading: 'Твій порядок',
  copyWhat: 'скрипт',
  copyPart: ({ label }) => `Скопіювати: ${label.toLowerCase()}`,
  copyScript: 'Скопіювати скрипт',
  transition: 'перехід',
  device: 'Профіль',
  // First-visit asides (spec A8): open until the first check or «Далі».
  modesTitle: 'Режими CLI',
  // The mode help's popover (the «?» after «режим» in the task): its way to the aside's CLI example.
  modesFull: 'Повний приклад',
  arrangeTitle: 'Як розставляти картки',
  orders: 'Правильних порядків кілька: підходить кожен, що дає робочий результат.',
  // The CLI example (spec S2 v2): moving between the modes on a generic device.
  modes: {
    '>': 'режим користувача',
    '#': 'привілейований режим',
    '(config)#': 'глобальні налаштування',
    '(config-if)#': 'інтерфейс',
    '(config-line)#': 'лінії (vty — лінії віддаленого входу)',
  },
};

/** The CLI example's lines: [prompt, command] on a generic device. The
 * router's uses its own interface (spec S2 v2); the switch's uses another
 * VLAN than the task's, because `interface vlan N` is a recall line there
 * and recall lines are never shown before they are typed. */
export function modesExample({ interface: name = 'g0/0', mgmt } = {}) {
  const device = mgmt ? 'Switch' : 'Router';
  return [
    ['>', 'enable'], ['#', 'configure terminal'], ['(config)#', `interface ${mgmt ? 'vlan 88' : name}`],
    ['(config-if)#', 'exit'], ['(config)#', 'line vty 0 15'], ['(config-line)#', 'end'], ['#', ''],
  ].map(([prompt, command]) => ({ prompt, device, command }));
}
