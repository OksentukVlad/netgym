// String gate only. Q5's mounted structural/lifecycle gate must separately
// inspect order, numbering, unchecked controls, moves and disclosure lifecycle.
// Never apply this gate to secret-bearing input values intentionally typed by
// the learner. Scan generated text, accessible names, attributes and copy data.
const decode = value => value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (all, dec, hex, name) => {
  if (dec || hex) {
    const point = parseInt(dec ?? hex, dec ? 10 : 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : all;
  }
  return { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ' }[name.toLowerCase()] ?? all;
});
const keywords = /\b(?:svi-enter|interface|checkpoint|hostname|domain|domain-name|crypto|modulus|ssh|enable|secret|username|privilege|service|password-encryption|transport|input|login|local|ip|address|shutdown|write|memory|bridge|list-member|list|user|admin-off|services|mac-server|mac-winbox|discovery|discovery-settings|mac-telnet-off|default-gateway|svi-up|strong-crypto|allowed-interface-list|discover-interface-list)\b/i;
const annotations = /^(?:referenceOrder|requiredMode|expectedMode|correctPrompt|commandId|rules|solution|answerKey|why|before|after|rank|correctPosition)$/i;
const identityAttribute = /^(?:id|for|class|name|aria-controls|aria-describedby|aria-labelledby|data-[\w-]+)$/i;
const markup = /<\/?[a-z](?:"[^"]*"|'[^']*'|[^'">])*>/gi;

export function setupLeaks(value, kind = 'render') {
  const found = new Set();
  function inspect(raw) {
    // Scan attributes and text separately: a command in an accessible label
    // beside a Winbox path must not become a synthetic dependency sentence.
    const tags = [...raw.matchAll(markup)];
    if (tags.length) {
      for (const [tag] of tags) for (const attribute of tag.matchAll(/\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
        const [, name, double, single, unquoted] = attribute;
        const value = double ?? single ?? unquoted;
        if (identityAttribute.test(name) && keywords.test(decode(value))) found.add('typed-keyword');
        inspect(name);
        inspect(value);
      }
      inspect(raw.replace(markup, ' '));
      return;
    }
    const value = decode(raw).replace(/\s+/g, ' ');
    if (/referenceOrder|requiredMode|expectedMode|correctPrompt|commandId|answerKey|correctPosition|data-(?:rank|correct|mode|before|after)/i.test(value)) found.add('answer-annotation');
    if (/(?:hostname|ім[’']я пристрою).{0,90}(?:→|перед|спершу|потім).{0,90}(?:crypto|ключ)|(?:domain|домен).{0,90}(?:→|перед|спершу|потім).{0,90}(?:crypto|ключ)|(?:username|користувач).{0,90}(?:→|перед|спершу|потім).{0,90}(?:login|вхід)/iu.test(value)) found.add('rule-pair');
    if (/(?:bridge|міст).{0,90}(?:→|before|перед|спершу|потім).{0,90}(?:bridge-port|list-member|address|порт|спис|адрес)|(?:list|список).{0,90}(?:→|before|перед|спершу|потім).{0,90}(?:list-member|mac-server|discovery|інтерфейс|доступ|сусід)|(?:user|користувач).{0,90}(?:→|before|перед|спершу|потім).{0,90}(?:admin-off|disable|вимк)/iu.test(value)) found.add('rule-pair');
    if (/спершу.{0,60}(?:створи користувача|задай адресу LAN|додай порт доступу|успішно увійди)/iu.test(value)) found.add('rule-pair');
    if (/(?:міст|список).{0,140}має вже існувати|спершу.{0,40}створи.{0,40}користувач.{0,90}вимкнення|збереж(?:и|ення).{0,110}після всіх змін/iu.test(value)) found.add('rule-pair');
    // Winbox paths belong on DR-3 cards, but command/path spellings in a
    // failed-check explanation expose more than its plain-language finding.
    if (kind === 'rule' && (/\/(?:interface|ip|user|tool|system)\b|(?:Bridge|Interfaces|System|IP|Tools)\s*→/i.test(value) || keywords.test(value))) found.add('rule-command');
    if (/configure terminal|line vty 0 15|один із правильних порядків|write memory\s*(?:last|останн)/iu.test(value)) found.add('reference-script');
    // Prompt choices alone are allowed, but card-to-required-prompt links aren't.
    if (/\b(?:hostname|crypto|username|login|transport|address)\b.{0,45}(?:→|режим\s*[:=]).{0,20}(?:\(config(?:-line|-if)?\)#|#)/iu.test(value)) found.add('required-mode');
    if (kind === 'typed' && keywords.test(value)) found.add('typed-keyword');
  }
  function visit(value, key = '') {
    if (Array.isArray(value)) { value.forEach(v => visit(v)); return; }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (annotations.test(key)) found.add('answer-annotation');
        if (key === 'mode' && ['>', '#', '(config)#', '(config-line)#', '(config-if)#'].includes(child)) found.add('required-mode');
        // Opaque ids need no exemption; semantic ids must fail the typed gate.
        if (key === 'kind' && ['card', 'typed'].includes(child)) continue;
        visit(child, key);
      }
    } else if (typeof value === 'string') {
      if (identityAttribute.test(key) && keywords.test(decode(value))) found.add('typed-keyword');
      inspect(value);
    }
  }
  visit(value);
  // A selected failed finding is allowed to explain its one dependency.
  // Command/path spellings remain forbidden on that surface.
  if (kind === 'rule') found.delete('rule-pair');
  return [...found];
}
