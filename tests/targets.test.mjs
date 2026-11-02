import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Target manifests import .jsx, so tools/test.sh bundles them into
// .test-bundles/targets/.
const root = fileURLToPath(new URL('..', import.meta.url));
const targetDir = resolve(root, 'src/targets');
const ids = readdirSync(targetDir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
const rows = readFileSync(resolve(root, 'tools/targets.tsv'), 'utf8').split('\n')
  .filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));
const load = id => import(pathToFileURL(resolve(root, '.test-bundles/targets', `${id}.mjs`)).href);

// Every file a module reaches through relative static imports.
function importGraph(entry) {
  const seen = new Set();
  const pattern = /\b(?:import\s+(?:[^'";]*?\s+from\s*)?|export\s+[^'";]*?\s+from\s*|(?:import|require)\s*\(\s*)['"]([^'"]+)['"]/g;
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.endsWith('.css')) return;
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(pattern)) {
      if (!specifier.startsWith('.')) continue;
      const path = resolve(dirname(file), specifier);
      const found = [path, `${path}.js`, `${path}.jsx`].find(existsSync);
      assert.ok(found, `${relative(root, file)} imports a missing file: ${specifier}`);
      visit(found);
    }
  };
  visit(entry);
  return [...seen].map(file => relative(root, file));
}

test('targets: tools/targets.tsv lists every target file once, with an extensionless exe stem', () => {
  assert.deepEqual(ids, ['netgym', 'routing'], 'step 8: NetGym.exe and routing.exe only');
  assert.deepEqual(rows.map(([id]) => id).sort(), ids);
  for (const [id, stem, title, ...extra] of rows) {
    assert.deepEqual(extra, [], id);
    assert.match(stem, /^[\w-]+$/, `${id}: exe stem`);
    assert.ok(title, `${id}: window title`);
  }
  assert.deepEqual(rows.find(([id]) => id === 'netgym'), ['netgym', 'NetGym', 'NetGym']);
});

test('targets: each manifest has its id, the window title and complete sections', async () => {
  for (const [id, , title] of rows) {
    const { default: manifest, Root } = await load(id);
    assert.equal(manifest.id, id);
    assert.equal(manifest.title, title, `${id}: title matches tools/targets.tsv`);
    assert.equal(typeof Root, 'function', `${id}: Root`);
    assert.ok(Array.isArray(manifest.sections) && manifest.sections.length > 0, `${id}: sections`);
    for (const section of manifest.sections) {
      for (const key of ['id', 'title', 'blurb']) {
        assert.equal(typeof section[key], 'string', `${id}: section ${key}`);
        assert.notEqual(section[key].trim(), '', `${id}: section ${key}`);
      }
      assert.equal(typeof section.Screen, 'function', `${id}/${section.id}: Screen`);
    }
    assert.equal(new Set(manifest.sections.map(s => s.id)).size, manifest.sections.length, `${id}: unique section ids`);
  }
});

test('targets: NetGym puts the start screen in front of the three IP screens (round 4 A7: what a learner needs first), routing, the firewall, VLAN, and the setup drill last', async () => {
  const { default: manifest, Root } = await load('netgym');
  assert.equal(manifest.only, undefined);
  assert.deepEqual(manifest.sections.map(({ id, title, blurb, legacy }) => ({ id, title, blurb, legacy })), [
    { id: 'ip-calculator', title: 'IP-калькулятор', blurb: 'порахувати мережу: межі, маска, команди', legacy: undefined },
    { id: 'ip-mask', title: 'IP-адреси: маска', blurb: 'вправи з маскою і блоками адрес', legacy: undefined },
    { id: 'ip-binary', title: 'IP-адреси: у бітах', blurb: 'адреса і маска по бітах: мережа і широкомовна', legacy: undefined },
    { id: 'routing', title: 'Маршрутизація', blurb: 'статичні маршрути: Cisco або MikroTik', legacy: undefined },
    { id: 'firewall', title: 'Фаєрвол', blurb: 'як фільтр вирішує долю пакета: input і forward, порядок правил', legacy: undefined },
    { id: 'vlan', title: 'VLAN', blurb: 'порти доступу, транки й шлях широкомовного кадру', legacy: undefined },
    { id: 'setup', title: 'Налаштування з нуля', blurb: 'порядок команд: роутер і комутатор Cisco, роутер MikroTik', legacy: undefined },
  ]);
  assert.ok(!manifest.sections.some(s => s.Screen === Root));
  const graph = importGraph(resolve(targetDir, 'netgym.js'));
  for (const file of ['src/app/Shell.jsx', 'src/app/StoreProvider.jsx', 'src/sections/routing/screens/RoutingScreen.jsx',
    'src/sections/ip/screens/CalculatorScreen.jsx', 'src/sections/ip/screens/MaskScreen.jsx', 'src/sections/ip/screens/BinaryScreen.jsx',
    'src/sections/ip/logic/calc.js', 'src/sections/ip/logic/binary.js', 'src/ui/useNav.js',
    'src/sections/firewall/screens/FirewallScreen.jsx', 'src/sections/vlan/screens/VlanScreen.jsx', 'src/sections/setup/screens/SetupScreen.jsx']) {
    assert.ok(graph.includes(file), file);
  }
  // The IP screens link by these section ids (src/sections/ip/screens/links.js):
  // the first three (routing comes after them).
  const { SECTION } = await import(pathToFileURL(resolve(root, 'src/sections/ip/screens/links.js')).href);
  assert.deepEqual(Object.values(SECTION), manifest.sections.slice(0, 3).map(s => s.id));
  // The two new sections share one routing and one mask screen with routing.exe.
  const { default: routing } = await load('routing');
  assert.equal(routing.sections[0].title, manifest.sections.find(s => s.id === 'routing').title);
});

test('targets: the target chooses the routing bank; the routing screen imports none', async () => {
  const bank = await import(pathToFileURL(resolve(root, 'src/banks/routing/tasks.js')).href);
  for (const id of ['netgym', 'routing']) {
    const { default: manifest } = await load(id);
    const section = manifest.sections.find(s => s.id === 'routing');
    assert.equal(section.bank.bankId, bank.bankId, id);
    assert.equal(section.bank.bankRevision, bank.bankRevision, id);
    assert.deepEqual(section.bank.tasks.map(t => t.id), bank.tasks.map(t => t.id), id);
    assert.ok(importGraph(resolve(targetDir, `${id}.js`)).includes('src/banks/routing/tasks.js'), `${id} imports the bank`);
  }
  const screen = importGraph(resolve(root, 'src/sections/routing/screens/RoutingScreen.jsx'));
  assert.deepEqual(screen.filter(file => file.startsWith('src/banks/')), [], 'the screen gets its bank as a prop');
  // The firewall too (FW-1 screen spec §1): NetGym's manifest chooses its bank.
  const { default: netgym } = await load('netgym');
  const firewallBank = await import(pathToFileURL(resolve(root, 'src/banks/firewall/tasks.js')).href);
  const firewall = netgym.sections.find(s => s.id === 'firewall');
  assert.deepEqual(firewall.bank.records.map(r => r.id), firewallBank.records.map(r => r.id));
  assert.ok(importGraph(resolve(targetDir, 'netgym.js')).includes('src/banks/firewall/tasks.js'));
  const firewallScreen = importGraph(resolve(root, 'src/sections/firewall/screens/FirewallScreen.jsx'));
  assert.deepEqual(firewallScreen.filter(file => file.startsWith('src/banks/')), [], 'the firewall screen gets its bank as a prop');
  assert.deepEqual(firewallScreen.filter(file => file.startsWith('src/sections/routing/')), [], 'and imports nothing of routing');
  // VLAN-1: NetGym's manifest chooses the VLAN banks too.
  const vlanPredict = await import(pathToFileURL(resolve(root, 'src/banks/vlan/predict.js')).href);
  const vlanPorts = await import(pathToFileURL(resolve(root, 'src/banks/vlan/ports.js')).href);
  const vlan = netgym.sections.find(s => s.id === 'vlan');
  assert.equal(vlan.bank.predict.id, vlanPredict.record.id);
  assert.deepEqual(vlan.bank.ports.map(r => r.id), vlanPorts.records.map(r => r.id));
  const vlanScreen = importGraph(resolve(root, 'src/sections/vlan/screens/VlanScreen.jsx'));
  assert.deepEqual(vlanScreen.filter(file => file.startsWith('src/banks/')), [], 'the VLAN screen gets its banks as a prop');
  assert.deepEqual(vlanScreen.filter(file => /^src\/sections\/(?!vlan\/)/.test(file)), [], 'and imports no other section');
  // The setup decks: NetGym's manifest chooses the deck registry (DR-1 alone
  // until the round 3 decks screens; now DR-1, DR-2, DR-3); the screen imports no bank.
  const setupDecks = await import(pathToFileURL(resolve(root, 'src/banks/setup/index.js')).href);
  assert.deepEqual(netgym.sections.find(s => s.id === 'setup').bank.decks.map(d => d.id), setupDecks.decks.map(d => d.id));
  assert.deepEqual(setupDecks.decks.map(d => d.id), ['dr-1', 'dr-2', 'dr-3']);
  const setupScreen = importGraph(resolve(root, 'src/sections/setup/screens/SetupScreen.jsx'));
  assert.deepEqual(setupScreen.filter(file => file.startsWith('src/banks/')), [], 'the setup screen gets its deck as a prop');
  assert.deepEqual(setupScreen.filter(file => /^src\/sections\/(?!setup\/)/.test(file)), [], 'and imports no other section');
  // Shell and Standalone pass `section.bank` to the screen.
  for (const file of ['src/app/Shell.jsx', 'src/app/Standalone.jsx']) {
    assert.match(readFileSync(resolve(root, file), 'utf8'), /<section\.Screen [^>]*bank=\{section\.bank\}/, file);
  }
});

test('targets: routing.exe is the merged routing screen with the store, without the shell', async () => {
  const { default: manifest, Root } = await load('routing');
  assert.equal(manifest.only, true);
  assert.equal(manifest.title, 'NetGym: маршрутизація');
  assert.deepEqual(rows.find(([id]) => id === 'routing'), ['routing', 'routing', 'NetGym: маршрутизація']);
  assert.deepEqual(manifest.sections.map(({ id, title, blurb, legacy }) => ({ id, title, blurb, legacy })), [
    { id: 'routing', title: 'Маршрутизація', blurb: 'статичні маршрути: Cisco або MikroTik', legacy: undefined },
  ]);
  assert.notEqual(Root, manifest.sections[0].Screen, 'Root wraps the screen in the store');
  const graph = importGraph(resolve(targetDir, 'routing.js'));
  assert.ok(graph.includes('src/app/Standalone.jsx') && graph.includes('src/app/StoreProvider.jsx'));
  assert.ok(graph.includes('src/sections/routing/screens/RoutingScreen.jsx'));
  assert.deepEqual(graph.filter(file => file === 'src/app/Shell.jsx' || file === 'src/app/shell.css'), []);
});
