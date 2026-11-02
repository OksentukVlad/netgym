import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { toInt, blockSize, network } from '../src/engine/ip.js';
import { tasks, frozen } from '../src/banks/routing/tasks.js';
import { pool as vlanPool } from '../src/sections/vlan/logic/model.js';
import { rangeProofs } from './helpers/example-range-proofs.mjs';
const require = createRequire(new URL('../shell/frontend/package.json', import.meta.url));
const { parse } = require('@babel/parser');
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function files(path) {
  return readdirSync(new URL(path, root), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
const reserved = ['192.0.2.0/24', '198.51.100.0/24'];
const interval = cidr => {
  const [ip, prefix] = cidr.split('/'), start = toInt(network(ip, Number(prefix)));
  assert.notEqual(start, null, cidr);
  return [start, start + blockSize(Number(prefix))];
};
const overlap = (a, b) => a[0] < b[1] && b[0] < a[1];
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (visit(node) === false) return;
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(n => walk(n, visit)); else if (value && typeof value === 'object') walk(value, visit);
}
const addresses = text => [...text.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\d|\.\d)/g)].map(m => m[0]).filter(ip => toInt(ip) !== null);
const reservedAddress = ip => reserved.some(cidr => overlap([toInt(ip), toInt(ip) + 1], interval(cidr)));

// Exclude declarations by owner AND binding name, never entire fixture files,
// IP prefixes, arbitrary example-looking strings or line-number allowlists.
// Hint-3 prose lives in section uk.js/hints functions, outside the learner-bank
// and fixture inventory below. Production examples.js is likewise not a bank.
const exclusions = [{ file: 'tests/fixtures/routing-leaks-v1.mjs', binding: 'DOCUMENTATION', reason: 'Matcher documentation-range declaration, not learner-task addresses.' }];
function learnerLiterals(path, source, used = new Set()) {
  if (path.endsWith('.json')) return JSON.stringify(JSON.parse(source));
  const ast = parse(source, { sourceType: 'module' }), strings = [];
  walk(ast, node => {
    const exclusion = exclusions.find(e => e.file === path && node.type === 'VariableDeclarator' && node.id?.name === e.binding);
    if (exclusion) { used.add(`${path}:${exclusion.binding}`); return false; }
    if (path.startsWith('src/banks/') && node.type === 'ObjectProperty'
      && ['vid', 'vlan', 'pvid', 'mgmt', 'vids', 'vlans'].includes(node.key.name ?? node.key.value)) {
      const values = node.value.type === 'ArrayExpression' ? node.value.elements : [node.value];
      for (const value of values) if (value?.type === 'NumericLiteral') assert.ok(value.value < 300 || value.value >= 400, `${path}: example VLAN numbers are reserved`);
    }
    if (node.type === 'StringLiteral') strings.push(node.value);
    if (node.type === 'TemplateElement') strings.push(node.value.cooked ?? node.value.raw);
  });
  return strings.join('\n');
}

test('reservation: every complete generator range is interval-disjoint, including benchmark, carrier and fixed output', () => {
  const proofFiles = rangeProofs.map(p => p.file);
  const rngUsers = [...files('src/engine'), ...files('src/sections')].filter(path => path.endsWith('.js') && /import .*makeRng/.test(read(path)));
  for (const file of rngUsers) assert.ok(proofFiles.includes(file), `new generator needs a complete range proof: ${file}`);
  const observed = new Set();
  for (const proof of rangeProofs) {
    // Freeze the reviewed transformations, not sampled outputs. A changed
    // expression, new pool or generator cannot silently inherit an old proof.
    assert.equal(createHash('sha256').update(read(proof.file)).digest('hex'), proof.sha256, `review full output ranges after changing ${proof.file}`);
    assert.ok(proof.reason.length > 20);
    for (const range of proof.ranges) {
      observed.add(range);
      for (const block of reserved) assert.equal(overlap(interval(range), interval(block)), false, `${proof.file}: ${range} vs ${block}`);
    }
  }
  for (const range of ['198.18.0.0/15', '100.64.0.0/10', '203.0.113.0/24']) assert.ok(observed.has(range), `must cover ${range}`);
  // The routing fault generator can advance a destination across a pool
  // boundary. Cover that arithmetic too, not just the healthy address pools.
  const tables = [...tasks.flatMap(t => t.variants.map(v => v.referenceRoutes)), ...Object.values(frozen.results).map(r => r.answer)];
  for (const row of tables.flatMap(t => Object.values(t)).flat()) if (row.prefix > 0) assert.ok(row.prefix >= 22, 'review fault envelopes for larger destination blocks');
  const expanded = ['10.0.0.0/7', '172.0.0.0/10', '192.168.0.0/15', '100.0.0.0/8', '198.16.0.0/13'].map(interval);
  for (const pool of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '198.18.0.0/15']) {
    const [start, end] = interval(pool), shiftedEnd = end + blockSize(22);
    assert.ok(expanded.some(([a, b]) => a <= start && b >= shiftedEnd), `fault envelope covers ${pool} plus one /22`);
    for (const block of reserved) assert.equal(overlap([start, shiftedEnd], interval(block)), false);
  }
  // Read ALL renumber pool declarations, including inline link choices, rather
  // than relying on privatePools alone (which used to miss benchmark/carrier).
  const ast = parse(read('src/engine/renumber.js'), { sourceType: 'module' }), pools = [];
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return;
    const prop = key => node.properties.find(p => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === key)?.value;
    const dst = prop('dst'), prefix = prop('prefix');
    if (dst?.type === 'StringLiteral' && prefix?.type === 'NumericLiteral' && toInt(dst.value) !== null) pools.push(`${dst.value}/${prefix.value}`);
  });
  assert.deepEqual(new Set(pools), new Set(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '198.18.0.0/15', '100.64.0.0/10', '172.31.0.0/16', '10.255.0.0/16']));
  for (const pool of pools) for (const block of reserved) assert.equal(overlap(interval(pool), interval(block)), false, `${pool} overlaps ${block}`);
});

test('reservation: bank and fixture learner-address membership, with one named matcher exclusion', () => {
  const used = new Set(); let count = 0;
  for (const path of [...files('src/banks'), ...files('tests/fixtures')].filter(p => /\.(js|mjs|json)$/.test(p))) {
    for (const ip of addresses(learnerLiterals(path, read(path), used))) { count++; assert.equal(reservedAddress(ip), false, `${path}: learner address ${ip} is reserved`); }
  }
  assert.ok(count > 10000, `checked the actual banks and fixtures (${count} address occurrences)`);
  assert.deepEqual([...used], exclusions.map(e => `${e.file}:${e.binding}`), 'remove stale exclusions');
  assert.ok(!vlanPool.some(vid => vid >= 300 && vid < 400));
  // Inter-VLAN uses its own VLAN pool rather than model.pool; check the
  // complete literal pool, not just a few generated seeds.
  const routeAst = parse(read('src/sections/vlan/logic/route-model.js'), { sourceType: 'module' });
  let foundVids = false;
  walk(routeAst, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.name !== 'vids') return;
    walk(node.init, child => {
      if (child.type !== 'ArrayExpression') return;
      foundVids = true;
      for (const value of child.elements) {
        assert.equal(value.type, 'NumericLiteral', 'review nonliteral VLAN pool');
        assert.ok(value.value < 300 || value.value >= 400, 'inter-VLAN generator must reserve the 3xx example IDs');
      }
    });
  });
  assert.ok(foundVids, 'the complete inter-VLAN VLAN pool was checked');
  for (const path of files('src/banks').filter(p => p.endsWith('.js'))) assert.ok(!learnerLiterals(path, read(path)).includes('bridge-example'), `${path}: example bridge name is reserved`);
  // Range membership has teeth on non-.0 hosts and both interval endpoints.
  for (const cidr of reserved) {
    const [start, end] = interval(cidr);
    for (const offset of [0, 1, 77, 255]) assert.ok(overlap([start + offset, start + offset + 1], [start, end]));
    assert.equal(overlap([end, end + 1], [start, end]), false);
  }
  const file = exclusions[0].file;
  const injected = `${read(file)}\nconst learnerTask = { ip: '192.0.2.77' };`;
  assert.ok(addresses(learnerLiterals(file, injected)).some(reservedAddress), 'named exclusion must not hide learner data in the same file');
});
