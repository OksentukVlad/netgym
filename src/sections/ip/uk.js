// Mask text copied verbatim from Vlad's trainer.
import { hostCount, prefixToMask } from '../../engine/ip.js'

/** Nominative ordinal (Vlad's ordinalNom). */
function ordinalNom(octet) {
  return ['перше', 'друге', 'третє', 'четверте'][octet - 1] ?? `${octet}-е`
}

/** Vlad's maskOf: «/26 = 255.255.255.192». */
export function maskOf(prefix) {
  return `/${prefix} = ${prefixToMask(prefix)}`
}

/** Locative ordinal for the 1-based octet where block boundaries fall. */
function ordinal(octet) {
  return ['першому', 'другому', 'третьому', 'четвертому'][octet - 1] ?? `${octet}-му`
}

/** Ukrainian plural form after a number: plural(3, 'адреса', 'адреси', 'адрес'). */
export function plural(n, one, few, many) {
  const last = n % 10
  const tens = n % 100
  if (tens >= 11 && tens <= 14) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}
const places = (n) => plural(n, 'місце', 'місця', 'місць')
/** Bits one by one («0 1 0 0 1 1 0 1»), so a screen reader reads bits, not a number. */
export const spaced = (bits) => [...String(bits ?? '')].join(' ')
const devices = (n) => plural(n, 'пристрій', 'пристрої', 'пристроїв')

const binaryOctetFeedback = ({ octet, current, target } = {}) => target === undefined
  ? 'Перевір позначений октет.'
  : `Октет ${octet}: зараз ${current ?? 'неповний запис'}, треба ${target}.`
const binaryOctetEvidence = ({ octet, target } = {}, row) => target === undefined
  ? `Рядок ${row} правильний; переходь до наступного кроку.`
  : `Подивись на октет ${octet} рядка ${row}: сума ваг його одиниць має бути ${target}.`

export const copy = {
  'binary.ok': 'Так',
  'binary.wrong-binary': p => binaryOctetFeedback(p),
  'binary.wrong-mask': p => binaryOctetFeedback(p),
  'binary.wrong-and': p => binaryOctetFeedback(p),
  'binary.wrong-or': p => binaryOctetFeedback(p),
  'binary.invalid-bits': p => p.target === undefined ? 'В октеті мають бути вісім цифр: лише 0 та 1.' : `Октет ${p.octet}: запиши вісім бітів, сума ваг має бути ${p.target}.`,
  'binary.invalid-step': 'Обери крок від адреси до широкомовної адреси.',
  'binary.incomplete': 'Заповни всі вісім бітів кожного октету.',
  'binary.weights': ({ weights = [] }) => `Ваги бітів зліва направо: ${weights.join(', ')}. Сума ваг одиниць дає число октету.`,
  'binary.address-question': p => binaryOctetEvidence(p, 'адреси'),
  'binary.address-rule': ({ weights = [] }) => `Йди зліва направо за вагами ${weights.join(', ')}. Якщо вага вміщається в залишок, постав 1 і відніми її; інакше постав 0.`,
  'binary.address-example': ({ ip, prefix, addressBits }) => `Приклад (інші числа): ${ip}/${prefix}. Четвертий октет ${ip.split('.').at(-1)} у бітах: ${spaced(addressBits)}.`,
  'binary.mask-question': p => binaryOctetEvidence(p, 'маски'),
  'binary.mask-rule': () => 'Відрахуй від початку рядка стільки одиниць, скільки задає префікс; решту бітів заповни нулями.',
  'binary.mask-example': ({ ip, prefix, maskBits }) => `Приклад (інші числа): ${ip}/${prefix}. Четвертий октет маски у бітах: ${spaced(maskBits)}.`,
  'binary.network-question': p => binaryOctetEvidence(p, 'мережі'),
  'binary.network-rule': 'Де в масці 1 — біт адреси, де 0 — нуль.',
  'binary.network-example': ({ ip, prefix, addressBits, maskBits, networkBits }) => `Приклад (інші числа): ${ip}/${prefix}, четвертий октет: ${spaced(addressBits)} І ${spaced(maskBits)} = ${spaced(networkBits)}.`,
  'binary.broadcast-question': p => binaryOctetEvidence(p, 'широкомовної адреси'),
  'binary.broadcast-rule': 'Зліва від лінії — біти мережі, справа постав 1.',
  'binary.broadcast-example': ({ ip, prefix, networkBits, maskBits, broadcastBits }) => `Приклад (інші числа): ${ip}/${prefix}, четвертий октет мережі ${spaced(networkBits)}, маски ${spaced(maskBits)}. Заміни біти пристрою одиницями: ${spaced(broadcastBits)}.`,
  'calc.default-route': '/0 — так записують маршрут за замовчуванням',
  'calc.conventional-count': 'Це проста арифметика: деякі діапазони адрес мають особливе призначення.',
  'calc.p2p': 'Дві адреси для двох кінців лінку точка-точка; широкомовної адреси немає, окрему адресу під шлюз за замовчуванням не відводять. Адреса іншого кінця може бути наступним переходом (RFC 3021).',
  'calc.host': 'Одна адреса (наприклад loopback або маршрут до одного хоста).',
  'calc.gateway': 'Шлюз — адреса інтерфейсу роутера в цій мережі; перша чи остання — лише поширена домовленість.',
  'calc.no-commands': 'Для цієї адреси приклад конфігурації не показуємо.',
  'calc.p2p-local': ({ other }) => `У прикладі — введена адреса; інший кінець пари — ${other}.`,
  'calc.example-interface': 'Інтерфейс — для прикладу.',
  // Mask exercise copy.
  'mask.ok': ({ kind, hosts }) => kind === 'fit'
    ? `Це найменший блок адрес, у який ще ${hosts === 1 ? 'вміщається' : 'вміщаються'} ${hosts} ${devices(hosts)}.`
    : `Перша адреса блоку — мережа, остання — широкомовна.`,
  'mask.wrong-network': ({ ip, usedPrefix }) => usedPrefix !== null && usedPrefix !== undefined
    ? `Схоже, це розрахунок для /${usedPrefix}, а маска в завданні інша. Подивись на лінійку: де починається блок з адресою ${ip ?? 'завдання'}?`
    : `Адреса мережі — це перша адреса блоку, у якому лежить ${ip ?? 'ця адреса'}. Подивись на лінійку: де починається її блок?`,
  'mask.wrong-broadcast': ({ nextNetwork, usedPrefix, givenBroadcast }) => nextNetwork
    ? `Мережа правильна, але ${givenBroadcast ?? 'ця адреса'} — уже перша адреса наступного блоку. Широкомовна — на одну менша.`
    : usedPrefix !== null && usedPrefix !== undefined
      ? `Мережа правильна, а широкомовна — ніби для /${usedPrefix}. Маска тут інша, тож блок закінчується в іншому місці.`
      : `Мережа правильна, а широкомовна адреса — ні. Це остання адреса блоку, перед початком наступного.`,
  'mask.invalid-prefix': 'Маску записують як /26 або 255.255.255.192.',
  'mask.too-small': ({ given, capacity, hosts }) => `У /${given} лише ${capacity} ${places(capacity)} для пристроїв, а треба ${hosts}. Потрібен більший блок.`,
  'mask.not-smallest': ({ given, capacity, hosts }) => `/${given} підходить (${capacity} ${places(capacity)} для ${hosts} ${devices(hosts)}), але є менший блок, де місць усе ще вистачає. Що більше число після «/», то менший блок.`,
  'mask.mask-block-question': ({ octet, value, step }) => `На лінійці позначено ${value} у ${ordinal(octet)} числі адреси; поділки через ${step}. Знайди проміжок між поділками, де стоїть позначка.`,
  'mask.mask-block-size': () => 'Візьми початок блоку з позначкою як адресу мережі. Для широкомовної візьми адресу перед початком наступного блоку; числа праворуч від змінного октету заповни відповідно нулями або найбільшим значенням октету.',
  'mask.mask-block-example': ({ ip, prefix, network, broadcast }) => `Приклад (інші числа): ${ip} з маскою /${prefix} → мережа ${network}, широкомовна ${broadcast}. Зроби так само зі своєю адресою.`,
  'mask.mask-fit-question': ({ hosts }) => `Умова просить ${hosts} ${places(hosts)} для пристроїв. У звичайній підмережі адреса мережі та широкомовна для них недоступні.`,
  'mask.mask-fit-capacities': () => 'Від кількості адрес блоку відніми адресу мережі та широкомовну. Обери найбільший префікс, де місць ще вистачає; наступний, вужчий блок має бути замалим.',
  'mask.mask-fit-example': ({ hosts, prefix = 28 }) => `Приклад (інші числа): для ${hosts} ${devices(hosts)} найменший блок — /${prefix}: у ньому ${hostCount(prefix)} ${places(hostCount(prefix))}, а в /${prefix + 1} лише ${hostCount(prefix + 1)} — замало.`,

}
/** Text for a code, with params for the few entries that are functions. */
export function t(code, params = {}) {
  const entry = copy[code]
  if (entry === undefined) return `[${code}]`
  return typeof entry === 'function' ? entry(params ?? {}) : entry
}

/** True when a code has text. */
export function has(code) {
  return code in copy
}

// ─── The mask screen (sections/ip/screens/MaskScreen.jsx) ───────────────────
// Vlad's `ui.ex.*`, `ui.field.*` and `ui.mask.*` copy, verbatim, plus the few
// NetGym lines marked new.

/** The NetGym start screen card. */
export const section = {
  title: 'IP-адреси: маска',
  blurb: 'вправи з маскою і блоками адрес',
}

// Round 2 step 7 (Fable's text inventory §3): no caption under the bar, no
// stage intro, no recap line and no repeated field hint; shorter fit wording
// and revealed message.
export const ui = {
  heading: 'Маска і блок адрес', // new
  level: 'Рівень', // new
  check: 'Перевірити',
  revealed: 'Розв’язок показано.', // round 4: no penalty wording (spec A5)
  incomplete: 'Спочатку заповни відповідь.',
  incompleteChoose: 'Спочатку обери відповідь.', // round 4: an empty chip group
  showChoices: 'Показати варіанти', // round 4: the panel's offer after a wrong check
  // Round 4 (spec R4): each level by its skill (mask-core.js generate).
  levels: ['1 · /25–/27', '2 · /28–/30 і розмір мережі', '3 · /17–/23'],
  'bad-ip': 'Адресу записують чотирма числами від 0 до 255 через крапку, наприклад 192.168.1.1.',
  taskBlock: ({ ip, mask }) => `Адреса ${ip}, маска ${mask}. Знайди адресу мережі та широкомовну адресу.`,
  taskFit: ({ hosts }) => `Потрібна мережа на ${hosts} ${devices(hosts)} (разом із роутером). Яка найменша мережа (блок адрес) підходить?`,
  network: 'Адреса мережі',
  broadcast: 'Широкомовна адреса',
  prefix: 'Маска',
  prefixHint: '/26 або 255.255.255.192',
  // A block of the whole octet (step 256) has no ticks to mention (step 8 fix).
  // The network-size task's ruler: no address, the block's size (round 4 repair).
  rulerSizeText: ({ octet, step, block }) => `Лінійка: ${ordinalNom(octet)} число адреси від 0 до 255${step < 256 ? `, поділки через ${step}` : ''}. Блок цієї маски — ${block.size} ${plural(block.size, 'адреса', 'адреси', 'адрес')}: від ${block.start} до ${block.end}.`,
  rulerText: ({ octet, value, step, block, subject = 'task' }) => `Лінійка: ${ordinalNom(octet)} число адреси від 0 до 255${step < 256 ? `, поділки через ${step}` : ''}. ${subject === 'input' ? 'Адреса' : 'Адреса завдання'}: ${value}.${block ? ` Виділений блок: від ${block.start} до ${block.end}.` : ''}`,
  whyBlock: ({ prefix, step, octet, start, end }) => `Маска /${prefix} ділить ${ordinalNom(octet)} число на блоки по ${step}: адреса завдання потрапляє в блок від ${start} до ${end}. Перша адреса блоку — мережа, остання — широкомовна.`,
  answerBlock: ({ network, broadcast }) => `Мережа ${network}, широкомовна ${broadcast}.`,
  answerFit: ({ mask, hosts, next, nextHosts }) => `Найменший блок: ${mask}. У ньому ${hosts} ${places(hosts)} для пристроїв${next ? `, а в /${next} лише ${nextHosts} — замало` : ''}.`,
  openCalculator: 'Відкрити в калькуляторі', // step 8
  // Round 4 (spec A8, the reference screen): the block rule in an Aside.
  asideBlockTitle: 'Як знайти блок',
  asideBlock: 'Перша адреса блоку — мережа, остання — широкомовна.',
}

// ─── Step 8: the start-screen cards of the three IP screens (design §1) ─────
export const sections = {
  calculator: { title: 'IP-калькулятор', blurb: 'порахувати мережу: межі, маска, команди' },
  mask: section,
  binary: { title: 'IP-адреси: у бітах', blurb: 'адреса і маска по бітах: мережа і широкомовна' },
}

/** Row names shared by the calculator, the walk and BitRows (design §1). */
export const rowNames = {
  address: 'Адреса',
  mask: 'Маска',
  network: 'Мережа',
  broadcast: 'Широкомовна',
}

/** Ordinal for the bit line: «після 26-го біта». */
const prefixLine = (prefix) => prefix === 0
  ? '/0: усі 32 біти — біти пристрою.'
  : prefix === 32
    ? '/32: усі 32 біти — біти мережі.'
    : `Лінія після ${prefix}-го біта: зліва — біти мережі, справа — біти пристрою.`

/** Thousands with a narrow no-break space: 16 777 214. */
export const count = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')

/** The calculator's count, saying what it counts (round 4 spec R3):
 * «254 вузли (без адреси мережі та широкомовної)». */
export const hostWords = (n) => [`${count(n)} ${plural(n, 'вузол', 'вузли', 'вузлів')}`, '(без адреси мережі та широкомовної)']

// ─── The calculator (sections/ip/screens/CalculatorScreen.jsx) ──────────────
export const calcUi = {
  heading: 'Мережа за адресою і маскою',
  address: 'IP-адреса',
  prefix: 'Маска',
  prefixHint: '/26 або 255.255.255.192',
  badIp: ui['bad-ip'],
  badPrefix: copy['mask.invalid-prefix'],
  stale: ({ cidr }) => `Показано останній правильний запис, ${cidr}. Виправ поле — і результат оновиться.`,
  result: 'Результат',
  network: 'Адреса мережі',
  mask: 'Маска',
  broadcast: 'Широкомовна адреса',
  range: 'Адреси для пристроїв',
  count: 'Місць для пристроїв',
  gateway: 'Шлюз',
  gatewayChoice: 'Шлюз у прикладі',
  first: 'перша адреса',
  last: 'остання адреса',
  block: 'Блок',
  pair: 'Дві адреси',
  pairValue: ({ first, last }) => `${first} і ${last}`,
  single: 'Адреса',
  bits: 'У бітах',
  bitsCaption: 'Адреса, маска, мережа і широкомовна в бітах',
  prefixLine,
  commands: 'Приклад конфігурації',
  vendors: { cisco: 'Cisco IOS', routeros: 'MikroTik RouterOS' },
  copy: 'Скопіювати',
  copied: '✓ Скопійовано',
  copyFailed: 'Не вдалося скопіювати — виділено, натисни Ctrl+C.',
  copyWhat: ({ vendor }) => ` (команди ${vendor})`,
  // Round 4 (spec R3): copying is off while an input is empty or malformed.
  copyOff: ({ cidr }) => `Копіювання вимкнено: поле заповнене не повністю або з помилкою. Приклад — для останнього правильного запису, ${cidr}.`,
  practise: 'Потренуватися → Маска',
}

// ─── The binary walk (sections/ip/screens/BinaryScreen.jsx) ─────────────────
export const binaryUi = {
  heading: 'Адреса і маска в бітах',
  level: 'Рівень',
  levels: ['1 · Один октет', '2 · /24', '3 · Будь-яка маска'],
  task: ({ ip, prefix, mask }) => `Адреса ${ip}, маска /${prefix} (${mask}).`,
  goal: 'Знайди в бітах адресу мережі та широкомовну адресу.',
  weights: 'Ваги бітів',
  steps: ['Адреса в бітах', 'Маска в бітах', 'Мережа: адреса І маска', 'Широкомовна адреса'],
  stepsLabel: 'Кроки',
  stepDone: 'готово',
  stepNow: 'зараз',
  questions: [
    () => 'Переведи кожне число адреси у вісім бітів.',
    ({ prefix }) => `Запиши маску /${prefix} у бітах.`,
    () => 'Адреса мережі в бітах: побітове І адреси та маски.',
    () => 'Широкомовна адреса в бітах.',
  ],
  rows: ['Адреса', 'Маска', 'Мережа', 'Широкомовна'],
  sheet: 'Твої рядки',
  prefixLine,
  octet: ({ n, value }) => value === undefined ? `Октет ${n}` : `Октет ${n} · ${value}`,
  band: ({ first, last }) => first === last ? `Октет ${first}` : `Октети ${first}–${last}`,
  group: ({ row, n }) => `${row}, октет ${n}`,
  cell: ({ row, n, weight, value }) => `${row}, октет ${n}, біт ${weight}: ${value}`,
  textMode: 'Ввести текстом',
  toggleMode: 'Перемикачами',
  // The help line under the step's question, per input mode (polish-2 V4).
  helpToggle: 'Натисни на біт, щоб змінити 0 на 1 чи назад, або друкуй 0 і 1.',
  helpText: 'Друкуй 0 і 1 поверх цифр: кожна лишається на своєму місці.',
  // A flagged octet's own line (round 4: the first wrong octet only, with its sums).
  wrongOctet: ({ current, target } = {}) => (target === undefined || target === null ? 'Перевір цей октет.'
    : current === null || current === undefined ? `Треба ${target}.` : `Зараз ${current}, треба ${target}.`),
  paste: 'Встав вісім цифр 0 і 1 для октету або тридцять дві для всього рядка.',
  accepted: [
    () => 'Адресу переведено в біти. Далі — маска.',
    () => 'Маску записано. Лінія в рядках тепер показує межу: зліва біти мережі, справа — біти пристрою.',
    () => 'Адресу мережі знайдено. Лишилась широкомовна.',
    ({ network, broadcast }) => `Готово: мережа ${network}, широкомовна ${broadcast}.`,
  ],
  result: ({ network, broadcast }) => `Мережа ${network}, широкомовна ${broadcast}.`,
  // Round 4: the panel's success line; the addresses are in the result above it.
  finished: 'Готово: мережу та широкомовну адресу знайдено — вони над рядками кроків.',
  check: ui.check,
  revealed: ui.revealed,
  openCalculator: ui.openCalculator,
}

// Round 5 level 1 only. Steps are zero-based, as in BinaryScreen/binary.js.
// The sole decimal operand is derived from the given IP, never a row result.
export const binaryLevel1 = {
  givenBand: 'Октети 1–3 · задано',
  questions: [
    ({ ip }) => `Перші три октети вже задано. Переведи в біти четвертий — ${Number(ip.split('.')[3])}.`,
    () => 'Маска, октет 4 цього рядка.',
    () => 'Мережа, октет 4 цього рядка.',
    () => 'Широкомовна адреса, октет 4 цього рядка.',
  ],
  actions: {
    toggles: [
      ({ ip }) => `Натискай біти октета 4 цього рядка, щоб увімкнені ваги в сумі дали ${Number(ip.split('.')[3])}.`,
      // Repair v1 (Fable 2, Astra 4): no plural to agree with {p}.
      ({ prefix }) => `Одиниць зліва: ${prefix - 24}. Увімкни їх, решту залиш нулями.`,
      () => 'Де в масці 1 — встанови відповідний біт прийнятої IP-адреси (0 або 1); де 0 — встанови 0.',
      () => 'Де в масці 1 — біт прийнятої адреси мережі, де 0 — увімкни 1.',
    ],
    text: [
      ({ ip }) => `Надрукуй вісім бітів октета 4 цього рядка: сума ваг позицій з одиницями має дорівнювати ${Number(ip.split('.')[3])}.`,
      ({ prefix }) => `Одиниць зліва: ${prefix - 24}, далі — нулі.`,
      () => 'Де в масці 1 — перепиши біт адреси, де 0 — пиши 0.',
      () => 'Де в масці 1 — біт прийнятої адреси мережі, де 0 — пиши 1.',
    ],
  },
};

export function binaryLevel1Text(task, { step = 0, mode = 'toggles' } = {}) {
  if (!Number.isInteger(step) || step < 0 || step > 3 || !Object.hasOwn(binaryLevel1.actions, mode)) throw new RangeError('invalid-step-or-mode');
  return { question: binaryLevel1.questions[step](task), action: binaryLevel1.actions[mode][step](task), givenBand: binaryLevel1.givenBand };
}
