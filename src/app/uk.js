// Ukrainian strings for the NetGym shell (start screen and top bar). Each
// section brings its own title and blurb (src/sections/<id>/uk.js).

export const uk = {
  appName: 'NetGym',
  sectionsCaption: 'Розділи',
  open: 'Відкрити',
  // Round 4 (A7): a chip on the first card, inside its button (part of its name).
  startHere: 'Почни тут',
  backToSections: '← Розділи',
  // Round 6: the same words in two parts, so a phone shows the arrow alone (its name stays «← Розділи»).
  backArrow: '←',
  backWord: ' Розділи',
  // The theme switch (Bar.jsx): each label names the theme pressing it gives.
  theme: { dark: 'Темна тема', light: 'Світла тема' },
  // The web build only (platform.js): a quiet note on the start screen, and
  // its footer link to the notices page tools/build-web.sh writes.
  webNotice: 'На телефоні працює; схеми зручніше дивитися на весь екран.',
  noticesLink: 'Ліцензії та сторонні компоненти',
  noticesHref: 'third-party-notices.html',
  // The web build only: clearing saved progress (app/saved.js).
  footerSeparator: ' · ',
  resetProgress: 'Почати спочатку',
  resetConfirm: 'Стерти всі відповіді та позначки ✓, збережені на цьому пристрої? Налаштування залишаться.',
  // A screen that failed to render (ScreenBoundary.jsx).
  screenFailed: 'Цей розділ не відкрився.',
  screenBack: 'Повернутися до розділів',
};
