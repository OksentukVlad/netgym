import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenise, parse, abbreviations, commandTable } from '../src/engine/vendors/cisco-cli.js';

const G = '(config)#', I = '(config-if)#', L = '(config-line)#';
// Each expected identity/code/position is hand-written, not obtained from a
// second parse or the expected card's grammar.
const cases = [
  ['hostname R1', G, 'hostname'], ['  Ho R1  ', G, 'hostname'],
  ['ip domain-n lab.example', G, 'domain'],
  ['cry key gen rsa mod 2048', G, 'crypto'],
  ['ip ssh ver 2', G, 'ssh-version'], ['ena sec CaseMatters!9', G, 'enable-secret'],
  ['user operator priv 15 sec OwnPass!9', G, 'username'],
  ['serv password-e', G, 'password-encryption'],
  ['trans in ssh', L, 'transport-ssh'], ['logi loc', L, 'login-local'],
  ['ip add 192.168.10.1 255.255.255.0', I, 'ip-address'],
  ['no shut', I, 'no-shutdown'], ['wr mem', '#', 'write-memory'],
  ['interface g0/0', G, 'interface'], ['int gi 0/1', G, 'interface'],
  ['interface GigabitEthernet0/0', G, 'interface'],
  ['i address 192.168.10.1 255.255.255.0', I, 'ambiguous-keyword', 0],
  ['i domain-name lab.example', G, 'ambiguous-keyword', 0],
  ['s password-encryption', G, 'ambiguous-keyword', 0],
  ['en secret ownpass', G, 'ambiguous-keyword', 0],
  ['ip domain lab.example', G, 'wrong-part', 2],
  ['ip rout', G, 'ambiguous-keyword', 1],
  ['cry ke gen rsa mod 2048', G, 'ambiguous-keyword', 1],
  ['log loc', L, 'ambiguous-keyword', 0],
  ['n shut', I, 'unknown-command', 0], // Deliberately outside allow-list.
  ['wat x', G, 'unknown-command', 0], ['', G, 'missing-part', 0],
  ['hostname', G, 'missing-part', 1], ['hostname R1 another', G, 'extra-part', 2],
  ['ip orange', G, 'wrong-part', 1],
  ['ip address 192.168.10.01 255.255.255.0', I, 'wrong-value', 2],
  ['ip address 192.168.10.1 255.0.255.0', I, 'wrong-value', 3],
  ['ip ssh version two', G, 'wrong-value', 3],
  ['interface gi 0/5', G, 'wrong-value', 1],
  ['enable secret 5', G, 'missing-part', 3],
  ['ena pass oldpass', G, 'unsafe-command', 0],
  ['user admin pass oldpass', G, 'unsafe-command', 0],
  ['user admin priv 15 pass oldpass', G, 'unsafe-command', 0],
  ['pass oldpass', L, 'unsafe-command', 0], ['logi', L, 'unsafe-command', 0],
  ['trans in tel', L, 'unsafe-command', 2], ['trans in al', L, 'unsafe-command', 2],
  ['ip ssh ver 1', G, 'unsafe-command', 3],
  ['cry key gen rsa', G, 'unsafe-command', 0],
  ['cry key gen rsa mod', G, 'missing-part', 5],
  ['hostname R1;write memory', G, 'extra-part', 1],
  ['hostname R1\nwrite memory', G, 'extra-part', 2],
  ['hostname\tR1', G, 'extra-part', 1],
  ['enable secret abc\u0000xyz', G, 'extra-part', 3],
  ['enable secret abc\u202Exyz', G, 'extra-part', 3],
];
for (const [input, mode, expected, position] of cases) test(`DR-1 parser: ${JSON.stringify(input)} / ${mode}`, () => {
  const result = parse(input, { mode });
  if (position === undefined) { assert.equal(result.ok, true); assert.equal(result.id, expected); }
  else { assert.equal(result.ok, false); assert.equal(result.finding.code, expected); assert.equal(result.finding.position, position); }
});

test('DR-1 tokenizer retains case and exact spans; keyword matching alone folds case', () => {
  assert.deepEqual(tokenise('  ena sec MiXeD!9 ').tokens, [
    { text: 'ena', start: 2, end: 5 }, { text: 'sec', start: 6, end: 9 }, { text: 'MiXeD!9', start: 10, end: 17 },
  ]);
  assert.equal(parse('ENABLE SECRET MiXeD!9').values.secret, 'MiXeD!9');
  const failure = parse('  ip ssh orange 2');
  assert.deepEqual({ start: failure.finding.start, end: failure.finding.end, token: failure.finding.token }, { start: 9, end: 15, token: 'orange' });
});

test('DR-1 numeric encoding selectors are not plaintext tokens', () => {
  for (const encoding of [0, 4, 5, 6, 7, 8, 9]) {
    const result = parse(`enable secret ${encoding} MiXeD!9`);
    assert.equal(result.ok, true); assert.equal(result.values.encoding, encoding); assert.equal(result.values.secret, 'MiXeD!9');
  }
  assert.equal(parse('enable secret 12345678').values.secret, '12345678');
  assert.equal(parse('enable secret 12345678').values.encoding, 0);
});

test('DR-1 every allow-listed keyword spelling resolves on a full profile path', () => {
  const values = { hostname: 'R1', domain: 'lab.example', modulus: '2048', version: '2', username: 'operator', privilege: '15', secret: 'OwnPass!9', transport: 'ssh', ip: '192.168.10.1', mask: '255.255.255.0', interface: 'g0/0', first: '0', last: '15' };
  for (const [keyword, forms] of Object.entries(abbreviations)) {
    // all/telnet are value keywords; test them through their unsafe path.
    if (['all', 'telnet'].includes(keyword)) {
      for (const form of forms) assert.equal(parse(`transport input ${form}`, { mode: L }).finding.code, 'unsafe-command');
      continue;
    }
    const entry = commandTable.find(c => c.words.includes(keyword));
    assert.ok(entry, keyword);
    for (const form of forms) {
      const input = entry.words.map(w => w === keyword ? form : w.startsWith('$') ? values[w.slice(1)] : w).join(' ');
      const result = parse(input, { mode: entry.modes[0] });
      if (entry.unsafe) assert.equal(result.finding?.code, 'unsafe-command', input);
      else { assert.equal(result.ok, true, input); assert.equal(result.id, entry.id, input); }
    }
  }
});
