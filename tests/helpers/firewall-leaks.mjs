import { cards } from '../../src/banks/firewall/cards.js';
import { chainCards } from '../../src/banks/firewall/chain.js';
import { codes } from '../../src/sections/firewall/logic/codes.js';

const cardIds = new Set([...cards, ...chainCards].map(card => card.id));
const descriptionCodes = new Set(codes.filter(code => code.startsWith('rule.')));
const variants = ['basic', 'disabled', 'drop-above', 'chain'];
const identityFields = {
  formatVersion: Number.isInteger, exerciseId: value => value === 'fw-predict', taskId: value => value === 'fw-predict',
  recordVersion: Number.isInteger, variantId: value => variants.includes(value),
  level: value => [1, 2].includes(value),
  seed: value => ['string', 'number'].includes(typeof value), generatorVersion: Number.isInteger,
};
function instanceKey(value) {
  try {
    const identity = JSON.parse(value);
    return identity && Object.keys(identity).length === Object.keys(identityFields).length
      && Object.entries(identity).every(([key, value]) => identityFields[key]?.(value));
  } catch { return false; }
}
const annotation = /^(?:hook|decidedBy|verdict|expected|correct|solution|answer|evidence|walk|context|position|ruleId|matchedRuleId|isCorrect|answerKey)$/i;

// Exempt only explicit machine fields with their expected value grammar. A
// policy/topology description, title or extra field still goes through the gate.
function given(value, path, kind) {
  const key = path.join('.');
  if (kind === 'card' && key === 'id') return cardIds.has(value);
  if (kind !== 'create') return false;
  if (key === 'instanceKey') return instanceKey(value);
  if (path[0] === 'identity' && path.length === 2) return identityFields[path[1]]?.(value) ?? false;
  if (key === 'policy.id') return variants.some(variant => value === `home-${variant}`);
  if (/^cards\.\d+\.id$/.test(key)) return cardIds.has(value);
  if (/^policy\.rules\.\d+\.id$/.test(key)) return /^r\d+$/.test(value);
  if (/^policy\.rules\.\d+\.chain$/.test(key)) return ['input', 'forward'].includes(value);
  if (/^policy\.rules\.\d+\.action$/.test(key)) return ['accept', 'drop', 'fasttrack-connection'].includes(value);
  if (/^policy\.rules\.\d+\.descriptionCode$/.test(key)) return descriptionCodes.has(value);
  return false;
}

const decodeEntities = text => text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, dec, hex, name) => {
  if (dec || hex) {
    const point = parseInt(dec ?? hex, dec ? 10 : 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }
  return { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' }[name.toLowerCase()] ?? match;
});

// Firewall's gate distinguishes unmarked policy choices from card-answer
// associations. Visible text AND accessible/data attributes are display surfaces.
export function firewallLeaks(value, kind = 'create') {
  const found = new Set();
  function inspect(text, example = false) {
    text = decodeEntities(text).replace(/\s+/g, ' ');
    if (/\b(?:input|forward)\b|сам\s+роутер|крізь\s+роутер|до\s+самого\s+роутера/iu.test(text)) found.add('door-on-precommit-surface');
    if (/\br\d+\b|правил[ао]\s*№?\s*\d+|chain-end:|кінець списку\s*(?:→|—|:)/iu.test(text)) found.add('deciding-rule-on-precommit-surface');
    if ([...cardIds].some(id => text.includes(id))) found.add('card-id-on-precommit-surface');
    // Only visible prose in the unrelated worked example may demonstrate actions.
    if (!example && /\b(?:accept|drop|verdict)\b|(?:відкин|відкид|пропуст|пропущ|пропуска|заборон|дозвол)\p{L}*/iu.test(text)) found.add('verdict-on-precommit-surface');
  }
  function inspectMarkup(value) {
    const visible = decodeEntities(value).replace(/<[^>]*>/g, tag => {
      const attributes = /\s([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
      for (const match of tag.matchAll(attributes)) inspect(match[2] ?? match[3] ?? match[4]);
      return ' ';
    });
    inspect(visible, kind === 'example');
  }
  function visit(value, path = []) {
    if (Array.isArray(value)) { value.forEach((v, i) => visit(v, [...path, String(i)])); return; }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (annotation.test(key)) found.add('answer-annotation');
        visit(child, [...path, key]);
      }
      return;
    }
    if (typeof value === 'string' && !given(value, path, kind)) inspectMarkup(value);
  }
  visit(value);
  return [...found];
}
