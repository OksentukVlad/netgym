import { validatePolicy, validateTopology } from '../../src/sections/firewall/logic/model.js';
import { uk as shared } from '../../src/ui/uk.js';

const keys = (v, names) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const opaque = /^f-[0-9a-f]{8}$/;
const decode = text => text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
  if (dec || hex) { const n = parseInt(dec ?? hex, dec ? 10 : 16); return n <= 0x10ffff ? String.fromCodePoint(n) : m; }
  return { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' }[name?.toLowerCase()] ?? m;
});
const annotation = /^(?:reference\w*|canonical\w*|solution|answerKey|expected\w*|correct\w*|free\w*|dependencies|before|after|position|ordinal|rank|originalId|commandId|ruleId|order|script)$/i;

/** FW-2's contract permits policy goals, chain/action givens and shuffled rule
 * descriptions. It forbids reference metadata and position hints everywhere.
 * For a task, every boundary is closed; for markup/text/copy payloads inspect
 * all text (including hidden nodes) and ALL attributes, not just aria-label.
 * This is intentionally independent of the FW-1 prediction gate.
 */
export function firewallOrderLeaks(value, { task, kind = 'surface' } = {}) {
  const found = new Set();
  function prose(raw, example = false) {
    const text = decode(String(raw)).replace(/\s+/g, ' ');
    if (/\bf-[0-9a-f]{8}\b/i.test(text) || /\br\d+\b/.test(text)) found.add('rendered-rule-id');
    if (/referenceOrder|canonicalOrder|freeToMove|data-reference|data-rank|data-position|data-before|data-after|data-order|reference-position|originalId|commandId|answerKey/iu.test(text)) found.add('reference-metadata');
    if (/еталон\p{L}*|правильн\p{L}*\s+поряд\p{L}*|позиці\p{L}*\s+(?:еталон\p{L}*|[1-9])|(?:правило|rule)\s*(?:№|#)?\s*[1-9]\s*(?:має|must|повин|перед|після)|(?:FastTrack|встановлен\p{L}*)[^<>]{0,90}(?:перед|вище|нижче)|(?:перед|вище|нижче)[^<>]{0,60}FastTrack/iu.test(text)) found.add('reference-order-prose');
    if (!example && /\/ip\s+firewall\s+filter\s+add/iu.test(text)) found.add('premature-script');
  }
  function surface(text) {
    // Decode before parsing, so entity-encoded markup cannot hide attributes.
    const decoded = decode(text);
    for (const tag of decoded.matchAll(/<[^>]*>/g)) {
      for (const attr of tag[0].matchAll(/\s([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        const val = attr[2] ?? attr[3] ?? attr[4];
        const move = val.match(/^(?:Вище|Нижче): позиція ([1-9])$/u);
        // ReorderList's current-position button names are learner positions.
        // This exact exemption applies to aria-label alone, never title/data.
        const learnerMove = attr[1] === 'aria-label' && task && move && Number(move[1]) <= task.rules.length;
        prose(attr[1]); if (!learnerMove) prose(val);
        if (/^(?:id|data-[\w-]+)$/.test(attr[1]) && /\bf-[0-9a-f]{8}\b/.test(attr[0])) found.add('rendered-rule-id');
      }
    }
    prose(decoded.replace(/<[^>]*>/g, ' '), kind === 'example');
  }
  function visit(v) {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (v && typeof v === 'object') {
      for (const [key, child] of Object.entries(v)) { if (annotation.test(key)) found.add('reference-metadata'); visit(child); }
    } else if (typeof v === 'string') surface(v);
  }
  if (kind === 'task') {
    const identityKeys = ['formatVersion', 'exerciseId', 'taskId', 'recordVersion', 'variantId', 'seed', 'generatorVersion'];
    if (!keys(value, ['identity', 'instanceKey', 'title', 'text', 'topology', 'rules'])
      || !keys(value?.identity, identityKeys) || value?.identity?.exerciseId !== 'fw-order'
      || value?.identity?.taskId !== 'fw-order' || !['input', 'all'].includes(value?.identity?.variantId)
      || value.identity.formatVersion !== 1 || value.identity.generatorVersion !== 2
      || !Number.isInteger(value.identity.recordVersion) || value.identity.recordVersion < 1
      || !(typeof value.identity.seed === 'string' || (typeof value.identity.seed === 'number' && Number.isFinite(value.identity.seed)))
      || typeof value.title !== 'string' || typeof value.text !== 'string'
      || value.instanceKey !== JSON.stringify(value.identity)) found.add('task-shape');
    if (!Array.isArray(value?.rules) || value.rules.some(r => !opaque.test(r.id))
      || new Set(value?.rules?.map(r => r.id)).size !== value?.rules?.length) found.add('ordinal-rule-id');
    try {
      if (validateTopology(value.topology).length || validatePolicy({ id: 'home-basic', rules: value.rules }, value.topology).length) found.add('task-shape');
    } catch { found.add('task-shape'); }
    // Inspect extra metadata at every depth, but legitimate opaque task ids
    // and identity are data, never display surfaces.
    const scan = (v, path = []) => {
      if (Array.isArray(v)) return v.forEach((child, i) => scan(child, [...path, String(i)]));
      if (typeof v === 'string') {
        if (path[0] !== 'identity' && path[0] !== 'instanceKey' && !(path.at(-1) === 'id' && opaque.test(v))) prose(v);
        return;
      }
      if (!v || typeof v !== 'object') return;
      for (const [key, child] of Object.entries(v)) {
        if (annotation.test(key)) found.add('reference-metadata');
        scan(child, [...path, key]);
      }
    };
    scan(value);
    prose(value?.title); prose(value?.text);
  } else {
    visit(value);
    // A shuffled task may be given to make accidental id rendering explicit.
    if (task && typeof value === 'string') for (const r of task.rules) if (decode(value).includes(r.id)) found.add('rendered-rule-id');
  }
  return [...found];
}

// React's own useId values (client «:r0:», server «:Rhi:») look like rule
// numbers to the gate's id pattern. Only VERIFIED generated ids are replaced
// before a scan: an `id` of that exact shape, and `for`/`aria-*` references
// whose every token is such an id present in the same markup. Text, other
// attributes and dangling references are scanned as they are.
const REACT_ID = /^:[rR][0-9A-Za-z]+:$/;
const ID_REFS = /^(?:for|aria-(?:describedby|labelledby|controls|owns|activedescendant|details|errormessage|flowto))$/;
export function normaliseReactIds(html) {
  const ids = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map(m => m[1]).filter(v => REACT_ID.test(v)));
  return html.replace(/\s([\w-]+)="([^"]*)"/g, (all, name, value) => {
    const tokens = value.split(/\s+/).filter(Boolean);
    const generated = tokens.length > 0 && tokens.every(t => REACT_ID.test(t) && ids.has(t));
    if (!generated || !(name === 'id' || ID_REFS.test(name))) return all;
    return ` ${name}="${tokens.map(() => 'react-id').join(' ')}"`;
  });
}

/** The gate exempts ReorderList's position names («Вище: позиція N») in
 * aria-label. Here each must be its own row's CURRENT position in the DOM
 * (the handle «N. Переставити: …», ↑ and ↓), and none may appear outside
 * the list, so a reference position can't hide in that exemption. */
export function orderListFindings(html) {
  // «Увесь фільтр» has a list per chain (round 9, B4): the numbers go on from one to the next.
  const lists = [...html.matchAll(/<ol class="ng-reorder"[^>]*>[\s\S]*?<\/ol>/g)].map(m => m[0]);
  if (!lists.length) return ['no list'];
  const out = [];
  lists.flatMap(list => list.split(/<li class="ng-reorder-item/).slice(1)).forEach((item, i) => {
    const n = i + 1, labels = [...item.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1]);
    if (!labels.some(l => l.startsWith(`${n}. `) && l.includes(':'))) out.push(`handle ${n}`);
    const moves = labels.filter(l => /^(?:Вище|Нижче): позиція/u.test(l));
    if (moves.length !== 2 || moves[0] !== shared.reorder.up({ n }) || moves[1] !== shared.reorder.down({ n })) out.push(`moves ${n}`);
  });
  if (/aria-label="(?:Вище|Нижче): позиція/u.test(lists.reduce((rest, list) => rest.replace(list, ''), html))) out.push('position names outside the list');
  return out;
}
