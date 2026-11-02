import { maskToPrefix } from '../ip.js';
import { strictIp } from './fields.js';

// A teaching grammar, not a terminal or a complete IOS command registry.
// The abbreviation policy is conservative and deliberately bounded. Never
// resolve against a target card.
export const profile = Object.freeze({
  id: 'isr-ios15-console', family: 'ISR', ios: '15.1(1)T or later 15.x',
  fresh: true, access: 'console', network: 'isolated-practice',
  vty: '0 15', interfaces: ['GigabitEthernet0/0', 'GigabitEthernet0/1'],
});

export const profile2960 = Object.freeze({
  id: 'c2960-ios15-k9-console', family: 'Catalyst 2960-24TT-L',
  ios: '15.0(2)SE or later 15.x', image: 'K9 LAN Base',
  fresh: true, access: 'console', network: 'isolated-practice', vty: '0 15',
  ipRouting: false, managementVlanActive: true, accessPortForwarding: true,
  interfaces: [...Array.from({ length: 24 }, (_, i) => `FastEthernet0/${i + 1}`), 'GigabitEthernet0/1', 'GigabitEthernet0/2'],
  sviRange: [1, 4094], moduli: [2048],
});

// Full keywords always work. Only these shorter spellings are admitted;
// ambiguity is tested against competitors BEFORE consulting this allow-list.
export const abbreviations = Object.freeze({
  hostname: ['ho', 'hos', 'host', 'hostn', 'hostna', 'hostnam'],
  ip: [], domain: [], name: [], 'domain-name': ['domain-n', 'domain-na', 'domain-nam'],
  crypto: ['cry', 'cryp', 'crypt'], key: [], generate: ['gen', 'gene', 'gener', 'genera', 'generat'],
  rsa: [], 'general-keys': ['general-k', 'general-ke', 'general-key'], 'usage-keys': ['usage-k', 'usage-ke', 'usage-key'], modulus: ['mod', 'modu', 'modul', 'modulu'], ssh: [], version: ['ver', 'vers', 'versi', 'versio'],
  enable: ['ena', 'enab', 'enabl'], secret: ['sec', 'secr', 'secre'],
  username: ['user', 'usern', 'userna', 'usernam'], privilege: ['priv', 'privi', 'privil', 'privile', 'privileg'],
  service: ['serv', 'servi', 'servic'], 'password-encryption': ['password-e', 'password-en', 'password-enc', 'password-encr', 'password-encry', 'password-encryp', 'password-encrypt', 'password-encrypti', 'password-encryptio'],
  transport: ['trans', 'transp', 'transpo', 'transpor'], input: ['in', 'inp', 'inpu'],
  login: ['logi'], local: ['loc', 'loca'], address: ['add', 'addr', 'addre', 'addres'],
  no: [], shutdown: ['shut', 'shutd', 'shutdo', 'shutdow'], write: ['wr', 'wri', 'writ'], memory: ['mem', 'memo', 'memor'],
  copy: [], 'running-config': ['run', 'runn', 'runni', 'runnin', 'running', 'running-', 'running-c', 'running-co', 'running-con', 'running-conf', 'running-confi'],
  'startup-config': ['start', 'startu', 'startup', 'startup-', 'startup-c', 'startup-co', 'startup-con', 'startup-conf', 'startup-confi'],
  password: ['pass', 'passw', 'passwo', 'passwor'], all: ['al'], telnet: ['tel', 'teln', 'telne'],
  interface: ['int', 'inte', 'inter', 'interf', 'interfa', 'interfac'],
  line: ['lin'], vty: ['vt'], end: [], configure: ['conf', 'confi', 'config', 'configu', 'configur'], terminal: ['t', 'te', 'ter', 'term', 'termi', 'termin', 'termina'],
});

export const abbreviations2960 = Object.freeze({ ...abbreviations,
  'default-gateway': ['default-g', 'default-ga', 'default-gat', 'default-gate', 'default-gatew', 'default-gatewa'],
});

const G = '(config)#', L = '(config-line)#', I = '(config-if)#';
const command = (id, modes, words, extra = {}) => ({ id, modes, words: words.split(' '), ...extra });
export const commandTable = [
  command('hostname', [G], 'hostname $hostname'),
  command('domain', [G], 'ip domain-name $domain'),
  command('domain', [G], 'ip domain name $domain'),
  command('crypto', [G], 'crypto key generate rsa modulus $modulus'),
  command('crypto', [G], 'crypto key generate rsa general-keys modulus $modulus'),
  command('crypto', [G], 'crypto key generate rsa usage-keys modulus $modulus'),
  command('ssh-version', [G], 'ip ssh version $version'),
  command('enable-secret', [G], 'enable secret $secret'),
  command('username', [G], 'username $username privilege $privilege secret $secret'),
  command('username', [G], 'username $username secret $secret'),
  command('password-encryption', [G], 'service password-encryption'),
  command('transport-ssh', [L], 'transport input $transport'),
  command('login-local', [L], 'login local'),
  command('ip-address', [I], 'ip address $ip $mask'),
  command('no-shutdown', [I], 'no shutdown'),
  command('write-memory', ['#'], 'write memory'),
  command('write-memory', ['#'], 'copy running-config startup-config'),
  command('enable-password', [G], 'enable password $secret', { unsafe: 'legacy-password' }),
  command('username-password', [G], 'username $username password $secret', { unsafe: 'legacy-password' }),
  command('username-priv-password', [G], 'username $username privilege $privilege password $secret', { unsafe: 'legacy-password' }),
  command('line-password', [L], 'password $secret', { unsafe: 'legacy-password' }),
  command('line-login', [L], 'login', { unsafe: 'line-login' }),
  command('interface', [G, I], 'interface $interface', { competitor: true }),
  command('line-vty', [G], 'line vty $first $last', { competitor: true }),
  command('end', [G, L, I], 'end', { competitor: true }),
  command('exit', [G, L, I], 'exit', { competitor: true }),
  command('enable', ['>'], 'enable', { competitor: true }),
  command('configure', ['#'], 'configure terminal', { competitor: true }),
  // Prefix competitors are intentionally not implemented as runnable commands.
  ...['snmp-server', 'scheduler'].map(word => command(word, [G], word, { competitor: true })),
  command('logging', [L], 'logging', { competitor: true }),
  command('shutdown', [I], 'shutdown', { competitor: true }),
  command('ip-route', [G], 'ip route', { competitor: true }),
  command('ip-routing', [G], 'ip routing', { competitor: true }),
  command('ip-domain-list', [G], 'ip domain-list', { competitor: true }),
  command('service-timestamps', [G], 'service timestamps', { competitor: true }),
  command('crypto-pki', [G], 'crypto pki', { competitor: true }),
  command('crypto-keyring', [G], 'crypto keyring', { competitor: true }),
];

export const commandTable2960 = [
  ...commandTable,
  command('default-gateway', [G], 'ip default-gateway $ip'),
];
export function commandsFor(selected = profile) {
  return selected.id === profile2960.id ? commandTable2960 : selected.id === profile.id ? commandTable : [];
}

const finding = (code, token, position, params = {}) => ({
  ok: false, finding: { ...params, code, position, token: token?.text ?? '', start: token?.start ?? 0, end: token?.end ?? 0 },
});

/** Zero-based token position and UTF-16 [start,end) offsets for underlining.
 * One command only; controls (including newlines/tabs) fail. Printable secret
 * tokens preserve punctuation; separators elsewhere are rejected by parse.
 */
export function tokenise(text) {
  if (typeof text !== 'string') return finding('unknown-command', null, 0);
  const bad = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.exec(text);
  if (bad) return finding('extra-part', { text: bad[0], start: bad.index, end: bad.index + 1 }, (text.slice(0, bad.index).match(/\S+/g) ?? []).length);
  return { ok: true, tokens: [...text.matchAll(/\S+/gu)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length })) };
}
export const tokenize = tokenise;

export function matchKeyword(text, options, allowed = abbreviations) {
  const lower = text.toLowerCase();
  if (options.includes(lower)) return { ok: true, keyword: lower };
  const matches = options.filter(word => word.startsWith(lower));
  if (matches.length > 1) return { ok: false, code: 'ambiguous-keyword', options: matches };
  if (matches.length === 1 && allowed[matches[0]]?.includes(lower)) return { ok: true, keyword: matches[0] };
  return { ok: false, code: 'wrong-part' };
}

/** Profile table resolution is independent of expected identity and values.
 * `mode` limits the table to one prompt's commands; `mode: null` resolves
 * against every command in the profile, so a verdict never depends on (or
 * reveals) the mode an expected card belongs to.
 */
export function parse(text, { mode = G, profile: selected = profile } = {}) {
  const lex = tokenise(text);
  if (!lex.ok) return lex;
  const tokens = lex.tokens;
  const table = commandsFor(selected);
  const allowed = selected.id === profile2960.id ? abbreviations2960 : abbreviations;
  let candidates = mode === null ? [...table] : table.filter(c => c.modes.includes(mode)), depth = 0, index = 0;
  const values = {}, positions = {};
  const absent = () => finding('missing-part', { text: '', start: text.length, end: text.length }, index);
  while (true) {
    const ended = candidates.find(c => depth === c.words.length);
    if (index === tokens.length) {
      if (ended) {
        if (ended.unsafe) return finding('unsafe-command', tokens[0], 0, { reason: ended.unsafe });
        if (ended.id === 'ssh-version' && values.version === 1) return finding('unsafe-command', tokens[positions.version], positions.version, { reason: 'ssh-v1' });
        if (ended.id === 'transport-ssh' && values.transport !== 'ssh') return finding('unsafe-command', tokens[positions.transport], positions.transport, { reason: 'insecure-transport' });
        return { ok: true, id: ended.id, values, positions, tokens };
      }
      if (candidates.some(c => c.id === 'crypto') && (depth === 4 || (depth === 5 && candidates.every(c => c.words[depth] === 'modulus')))) return finding('unsafe-command', tokens[0], 0, { reason: 'modulus-required' });
      return absent();
    }
    const live = candidates.filter(c => depth < c.words.length);
    if (!live.length) return finding('extra-part', tokens[index], index);
    const options = [...new Set(live.map(c => c.words[depth]).filter(w => !w.startsWith('$')))];
    const fields = [...new Set(live.map(c => c.words[depth]).filter(w => w.startsWith('$')))];
    const token = tokens[index];
    if (!fields.includes('$secret') && /[;|&]/.test(token.text)) return finding('extra-part', token, index);
    if (options.length) {
      const matched = matchKeyword(token.text, options, allowed);
      if (!matched.ok) {
        const { ok, code, ...params } = matched;
        return finding(depth === 0 && code !== 'ambiguous-keyword' ? 'unknown-command' : code, token, index, params);
      }
      candidates = live.filter(c => c.words[depth] === matched.keyword);
    } else if (fields.length === 1) {
      const field = fields[0].slice(1);
      let value = token.text;
      positions[field] = index;
      if (field === 'secret') {
        // Encoding selectors are grammar, never mistaken for plaintext secrets.
        if (/^[0456789]$/.test(value)) {
          positions.encoding = index;
          values.encoding = Number(value);
          index++;
          if (!tokens[index]) return absent();
          value = tokens[index].text;
          positions.secret = index;
        } else values.encoding = 0;
      } else if (['modulus', 'version', 'privilege', 'first', 'last'].includes(field)) {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return finding('wrong-value', token, index, { field });
        value = Number(value);
      } else if (field === 'ip' || field === 'mask') {
        if (!strictIp(value) || (field === 'mask' && maskToPrefix(value) === null)) return finding('wrong-value', token, index, { field });
      } else if (field === 'transport') {
        const matched = matchKeyword(value, ['ssh', 'all', 'telnet'], allowed);
        if (!matched.ok) {
          const { ok, code, ...params } = matched;
          return finding(code, token, index, params);
        }
        value = matched.keyword;
      } else if (field === 'interface') {
        let label = value;
        if (selected.id === profile2960.id) {
          if (/^(?:f|fa|fastethernet|g|gi|gigabitethernet|vlan)$/i.test(label) && tokens[index + 1]) label += tokens[++index].text;
          const vlan = /^vlan(\d+)$/i.exec(label);
          const physical = /^(f|fa|fastethernet|g|gi|gigabitethernet)(0\/\d+)$/i.exec(label);
          value = vlan ? `Vlan${Number(vlan[1])}` : physical ? `${/^f/i.test(physical[1]) ? 'FastEthernet' : 'GigabitEthernet'}${physical[2]}` : '';
          if (vlan ? Number(vlan[1]) < 1 || Number(vlan[1]) > 4094 : !selected.interfaces.includes(value)) return finding('wrong-value', token, positions[field], { field });
        } else {
          if (/^(?:g|gi|gigabitethernet)$/i.test(label) && tokens[index + 1]) label += tokens[++index].text;
          const match = /^(?:g|gi|gigabitethernet)(0\/[01])$/i.exec(label);
          if (!match) return finding('wrong-value', token, positions[field], { field });
          value = `GigabitEthernet${match[1]}`;
        }
      } else if (!/^[A-Za-z][A-Za-z0-9.-]*$/.test(value)) return finding('wrong-value', token, index, { field });
      values[field] = value;
      candidates = live.filter(c => c.words[depth] === fields[0]);
    } else return finding('wrong-part', token, index);
    index++;
    depth++;
  }
}
