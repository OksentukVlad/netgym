// The firewall screen's UI leak gate (FW-1 screen spec v2 S5), structural
// rather than a word list:
//   (a) a narrow scan: no «правило N» and no card id anywhere (text and
//       attributes alike);
//   (b) before commitment the door choice and the rule table are
//       byte-identical for every card of a variant;
//   (c) the diagram is identical for cards with the same source, ingress
//       and dst-NAT (so it can't depend on the destination or the door).
// Plus helpers to cut regions out of rendered markup (server or mini-dom).
import { cards } from '../../src/banks/firewall/cards.js';

export const cardIds = cards.map(c => c.id);

/** The outer markup of the first element whose opening tag contains `marker`. */
export function region(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.lastIndexOf('<', at);
  const name = html.slice(start + 1).match(/^[\w-]+/)[0];
  const tags = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*?(/?)>`, 'g');
  tags.lastIndex = start;
  let depth = 0, m;
  while ((m = tags.exec(html))) {
    if (m[2] === '/') { if (depth === 0) return html.slice(start, tags.lastIndex); continue; }
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  return null;
}

/** The screen's regions the gate compares (markup strings). */
export function regions(html) {
  return {
    packet: region(html, 'class="ng-fw-card"'),
    doors: region(html, 'class="ng-fw-doors"'),
    table: region(html, 'class="ng-fw-rules"'),
    svg: region(html, 'class="ng-fw-svg"'),
    dots: region(html, 'class="ng-fw-progress"'),
    help: region(html, 'class="ng-help"'),
    feedback: region(html, 'role="status"'),
  };
}

/** (a) The narrow scan: «правило N» or a card id anywhere in the markup. */
export function scanLeaks(html) {
  const found = [];
  const text = html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  if (/правил[ао]\s*№?\s*\d+/iu.test(text)) found.push('rule-number-in-words');
  for (const id of cardIds) if (text.includes(id)) found.push(`card-id:${id}`);
  return found;
}

/** The selection the student made is the only allowed pre-commit difference:
 * normalise it away (checked state, its outline, the roving tab stop, the
 * selected row's description). */
export function withoutSelection(html) {
  return html
    .replace(/aria-checked="true"/g, 'aria-checked="false"')
    .replace(/ is-selected/g, '')
    .replace(/tabindex="(?:0|-1)"/g, 'tabindex="?"')
    // Round 5: the chain's group is named by the step's action line, or by «Ланцюжок» once the rule step is open.
    .replace(/aria-labelledby="(?:ng-fw-action|ng-fw-doors-name)"/g, 'aria-labelledby="?"')
    .replace(/<span class="ng-fw-desc">[^<]*<\/span>/g, '');
}

/** (c) The diagram's pre-commit givens: cards with the same key must draw the same picture. */
export const givenKey = card => JSON.stringify([card.packet.srcIp, card.facts.ingress, card.facts.dstNat, card.facts.dstNatFrom ?? null, card.facts.dstNat === true ? [card.packet.dstIp, card.packet.dstPort] : null]);

/**
 * The structural gate over pre-commit renders of one variant.
 * @param {Array<{ card: object, doors: string, table: string, svg: string }>} renders
 * @returns {string[]} violations
 */
export function structuralGate(renders) {
  const out = [];
  const first = renders[0];
  for (const r of renders) {
    if (r.doors !== first.doors) out.push(`doors differ: ${r.card.id}`);
    if (r.table !== first.table) out.push(`table differs: ${r.card.id}`);
  }
  const groups = new Map();
  for (const r of renders) {
    const key = givenKey(r.card);
    if (!groups.has(key)) groups.set(key, r);
    else if (groups.get(key).svg !== r.svg) out.push(`diagram differs within givens: ${groups.get(key).card.id} / ${r.card.id}`);
  }
  return out;
}

/** The whole screen minus what may differ between cards before commitment:
 * the packet card, «Пакет N з M» and the dots (position, not card), and the
 * diagram (compared by givens). Root data-*, titles, the chain step and the
 * help panel all stay in (fix round 1; round 4). */
export function screenWithoutGivens(html) {
  let out = html;
  for (const marker of ['class="ng-fw-card"', 'class="ng-fw-progress"', 'class="ng-fw-svg"']) {
    const part = region(out, marker);
    if (part) out = out.replace(part, `<!--${marker}-->`);
  }
  return out;
}

/**
 * The whole-screen gate over pre-commit renders of one variant (fix round 1):
 * the screen without its givens is byte-identical for every card; the packet
 * card equals a render from the card's givens alone (walkView.cardLines);
 * «Текстом» without its «Пакет» section is identical for every card.
 * @param {Array<{ card: object, html: string, cardFromGivens: string, text: Array<{ heading: string, items: string[] }> }>} renders
 * @returns {string[]} violations
 */
export function screenGate(renders) {
  const out = [];
  const first = renders[0];
  const textWithoutCard = r => JSON.stringify(r.text.filter(s => s.heading !== 'Пакет'));
  for (const r of renders) {
    if (screenWithoutGivens(r.html) !== screenWithoutGivens(first.html)) out.push(`screen differs: ${r.card.id}`);
    if (region(r.html, 'class="ng-fw-card"') !== r.cardFromGivens) out.push(`packet card is more than its givens: ${r.card.id}`);
    if (textWithoutCard(r) !== textWithoutCard(first)) out.push(`«Текстом» differs: ${r.card.id}`);
  }
  return out;
}
