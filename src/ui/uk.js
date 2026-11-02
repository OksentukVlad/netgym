// Ukrainian strings of the generic components (src/ui/components). Wording is
// Vlad's trainer copy (copy/uk.js `ui.ex.*` and `ui.field.*`) where it exists.

export const uk = {
  yes: 'Так',
  notYet: 'Ще ні',
  hint: 'Підказка',
  hintN: ({ n, total }) => `Підказка ${n} з ${total}`,
  noHints: 'Підказок більше немає',
  showAnswer: 'Показати відповідь',
  answer: 'Відповідь',
  chooseInstead: 'Обрати з варіантів',
  typeInstead: 'Ввести самому',
  options: ({ label }) => `${label}: варіанти`,
  close: 'Закрити',
  // Round 4 (spec A6): one set of words for every exercise.
  check: 'Перевірити',
  next: 'Далі →',           // the primary action after success or reveal, everywhere
  nextName: 'Далі',          // its accessible name (the arrow is aria-hidden)
  fails: '✗ не проходить',   // the mark for a check, ping or packet that fails
  passes: '✓ проходить',     // … and one that passes
  remove: 'Видалити',        // the «×» delete control's name (× never marks a failure)
  revealed: 'Розв’язок показано.', // no penalty wording (A5)
  // HelpPanel (spec A1): the check row and its one message area.
  help: {
    more: 'Детальніше',
    hintsFolded: ({ n }) => `Підказки (${n})`,
    stale: 'до змін',
    applied: 'Відповідь показано на схемі; твоя спроба — під кнопкою «Моя відповідь».',
    myAnswer: 'Моя відповідь',
    shown: 'показано',
    longCue: 'Решта — нижче, прокрути сторінку.',
  },
  // DoneMark (A5): a quiet ✓ on a task, variant or level solved without a reveal.
  solved: 'розв’язано',
  // MoreMenu (A4): the «⋯» button.
  moreActions: 'Інші дії',
  // ReorderList: a list put in order with a handle (≡ and the position) and ↑ ↓.
  // `name` is the caller's words for an item (a command, a rule).
  reorder: {
    help: '≡ з клавіатури: пробіл — узяти, стрілки, Home і End — нести, пробіл — покласти, Esc — скасувати.',
    handle: ({ n, name }) => `${n}. Переставити: ${name}`,
    up: ({ n }) => `Вище: позиція ${n}`,
    down: ({ n }) => `Нижче: позиція ${n}`,
    grabbed: ({ name, n, total }) => `${name}: узято, позиція ${n} з ${total}.`,
    moved: ({ n, total }) => `Позиція ${n} з ${total}.`,
    dropped: ({ name, n, total }) => `${name}: покладено на позицію ${n} з ${total}.`,
    cancelled: ({ name, n, total }) => `Скасовано: ${name} знову на позиції ${n} з ${total}.`,
    placed: ({ name, n, total }) => `${name}: позиція ${n} з ${total}.`,
  },
  // CopyBlock: a command script with «Скопіювати».
  copy: 'Скопіювати',
  copied: '✓ Скопійовано',
  copiedSaid: 'Скопійовано.',
  copyFailed: 'Не вдалося скопіювати — виділено, натисни Ctrl+C.',
  // A network diagram in words (topology/describe.js, TextEquivalent).
  network: {
    routers: 'Роутери',
    isps: 'Провайдери',
    links: 'Лінки між роутерами',
    lans: 'Мережі за роутерами',
    wans: 'Вихід в інтернет',
    network: 'мережа',
    dhcp: 'адреса по DHCP',
    provider: 'провайдер',
  },
  // FactLink (round 5, R3): a fact that shows where it is on the diagram.
  fact: {
    show: ({ value }) => `${value} — показати на схемі`,
  },
  // WorkedExample (round 5, spec 5b-2 A): one finished answer on other values, folded.
  example: {
    toggle: 'Приклад',                          // «Приклад ▸ готова відповідь (інші числа)»
    toggleRest: 'готова відповідь (інші числа)',
    tag: 'приклад · інші числа',
  },
};
