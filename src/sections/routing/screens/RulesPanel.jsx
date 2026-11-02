// «📐 Правила: як рахувати статичні маршрути», the round 1 Cisco trainer's
// rules, for both syntaxes (round 2 step 7): the syntax line and the
// mask/prefix rule follow the active syntax. It is the one home of the rules
// the rows no longer repeat. Unassessed: opening it is not a hint.
//
// Every example uses documentation addresses (203.0.113.0/24,
// 198.51.100.0/24, 192.0.2.0/24), outside every bank network; the leak gate
// checks that (tests/routing-leaks.test.mjs).
//
// Step 6 (best-practice amendment A6): a default leads only upward, and a
// summary covers exactly its networks (ui.shared.rules* in uk.js).
//
// Round 4 (spec R1, A4): «Правила» is an item of the screen's «⋯» menu; it
// opens this content in the work area (MoreMenu's disclosure, with its own
// heading and «Закрити»).
import { ui } from '../uk.js';

const RULES = {
  cisco: {
    syntax: 'Синтаксис Cisco IOS (повна маска, не /24):',
    example: 'ip route [МЕРЕЖА] [МАСКА] [NEXT-HOP]\nip route 203.0.113.0 255.255.255.0 198.51.100.1',
    mask: <><b>МАСКА</b> = повна десяткова маска цієї мережі: /24 → 255.255.255.0, /30 → 255.255.255.252, /23 → 255.255.254.0, /22 → 255.255.252.0.</>,
    gateway: 'NEXT-HOP',
    stub: 'ip route 0.0.0.0 0.0.0.0 [NEXT-HOP аплінку]',
    summary: '198.51.100.0/25 + 198.51.100.128/25 = 198.51.100.0/24 (маска 255.255.255.0)',
    backup: <code>ip route … 2</code>,
  },
  routeros: {
    syntax: 'Синтаксис RouterOS (мережа з префіксом):',
    example: '/ip route add dst-address=[МЕРЕЖА/ПРЕФІКС] gateway=[GATEWAY]\n/ip route add dst-address=203.0.113.0/24 gateway=198.51.100.1',
    mask: <><b>ПРЕФІКС</b> = довжина маски після «/»: 203.0.113.0/24.</>,
    gateway: 'GATEWAY',
    stub: '/ip route add dst-address=0.0.0.0/0 gateway=[GATEWAY аплінку]',
    summary: '198.51.100.0/25 + 198.51.100.128/25 = 198.51.100.0/24',
    backup: <code>distance=2</code>,
  },
};

/** @param {{ syntax: object }} props */
export default function RulesPanel({ syntax }) {
  const r = RULES[syntax.id] ?? RULES.cisco;
  return (
    <div className="ng-rt-rules-panel">
      <p className="ng-rt-rules-syntax"><b>{r.syntax}</b></p>
      <pre className="ng-rt-pre">{r.example}</pre>
      <ol className="ng-rt-rules-list">
        <li><b>Підключені напряму</b> — мережі на власних інтерфейсах роутер знає сам. Маршрут <u>не пишемо</u>.</li>
        <li><b>МЕРЕЖА</b> = адреса мережі призначення (не адреса хоста!). Напр. для <code>203.0.113.10/24</code> → <code>203.0.113.0</code>.</li>
        <li>{r.mask}</li>
        <li><b>{r.gateway}</b> = IP <u>сусіднього</u> роутера на спільному лінку (інтерфейс, що дивиться у твій бік). Не свій IP, не IP призначення.</li>
        <li><b>Тупіковий роутер</b> — має лише один аплінк. Замість переліку всіх чужих мереж пишемо <b>маршрут за замовчуванням</b>:
          <pre className="ng-rt-pre">{r.stub}</pre>
          {ui.shared.rulesDefaultSafety}
        </li>
        <li><b>Сумаризація</b> — суміжні мережі об’єднуємо в одну: {r.summary}. {ui.shared.rulesExactSummary}</li>
        <li>{ui.shared.rulesDiscardSummary}</li>
        <li><b>Резервний маршрут</b> — той самий dst через інший gw з більшою distance: {r.backup} (за замовчуванням 1).</li>
        <li><b>Петля</b>: надто широкий сумарний маршрут або два default, що вказують один на одного, <i>можуть</i> зациклити пакет — якщо наступний роутер відсилає цей трафік назад (наприклад, своїм default). Тоді пакет ходить по колу, доки не скінчиться TTL. {ui.shared.rulesDefaultDirection}</li>
      </ol>
    </div>
  );
}
