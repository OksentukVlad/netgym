// Where you are, in the URL (round 6, spec URL v2.1), in Node: the hash's
// parsing and its caps (app/url.js), every section's codec (its round trip,
// its defaults for garbage, the remembered place kept or reset), the store's
// `hydrate`, and the shell's first render (bootOf: a cold load, a refresh, a
// garbage link). The history itself (Back, Forward, a typed hash, «←», the
// /netgym/ subpath) is tests/url-browser.test.mjs, in Chromium.
// The codecs import their screens (.jsx), so they come through a bundled
// harness (tests/harness/url.jsx → .test-bundles/harness, by tools/test.sh).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_HASH, MAX_PARAMS, decodeLocation, encodeLocation, formatHash, parseHash } from '../src/app/url.js';
import { initialStore, storeReducer } from '../src/app/store.js';
import { HOME } from '../src/app/nav.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const { target, bootOf, setupNextSeed, setupFirstSeed, setupMaxSeed: setupMax } = await import(pathToFileURL(resolve(root, '.test-bundles/harness/url.mjs')).href);

/** A fixed random sequence (an LCG), so defaults are repeatable. */
const lcg = (seed = 600) => () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
const sectionOf = id => target.sections.find(s => s.id === id);
/** A hash decoded over a store, then hydrated into it: { store, decoded }. */
function open(hash, store = initialStore(), random = lcg()) {
  const decoded = decodeLocation(target, hash, store, random);
  return { decoded, store: storeReducer(store, { type: 'hydrate', places: decoded.places, prefs: decoded.prefs }) };
}
const encoded = (store, section) => encodeLocation(target, { section, screen: 'main', params: {} }, store);
const params = hash => (hash.includes('?') ? Object.fromEntries(new URLSearchParams(hash.slice(hash.indexOf('?') + 1))) : {});

// ── The hash ──

test('URL: parseHash reads #/<section>[/main]?k=v, and nothing else is a section route', () => {
  assert.deepEqual({ ...parseHash('#/dhcp?ex=server&level=2') }, { section: 'dhcp', screen: 'main', params: parseHash('#/dhcp?ex=server&level=2').params });
  assert.deepEqual({ ...parseHash('#/dhcp?ex=server&level=2').params }, { ex: 'server', level: '2' });
  assert.equal(parseHash('#/dhcp/main?ex=nat').section, 'dhcp');
  assert.equal(parseHash('#/dhcp/').section, 'dhcp');
  for (const hash of ['', '#', '#/', '#dhcp', '#/dhcp/other', '#/DHCP', '#/../x', '#//dhcp', '#/dhcp/main/x', '#/a b', '#/' + 'a'.repeat(33), 7, null]) {
    assert.equal(parseHash(hash), null, String(hash));
  }
});

test('URL: the caps (Astra 4): length, parameter count, the first duplicate, malformed percent-encoding, odd keys and values', () => {
  const long = `#/dhcp?ex=nat&x=${'a'.repeat(MAX_HASH)}`;
  assert.equal(parseHash(long), null, 'an overlong hash is the start screen');
  assert.equal(parseHash(`#/dhcp?ex=nat&x=${'a'.repeat(MAX_HASH - 18)}`).section, 'dhcp', 'just under the cap');
  const many = `#/dhcp?${Array.from({ length: MAX_PARAMS + 3 }, (_, i) => `k${'abcdefghijklmnop'[i]}=${i}`).join('&')}`;
  assert.equal(Object.keys(parseHash(many).params).length, MAX_PARAMS, 'at most 12 parameters are read');
  assert.equal(parseHash('#/dhcp?ex=nat&ex=server').params.ex, 'nat', 'the first duplicate wins');
  assert.equal(parseHash('#/dhcp?ex=%E0%A4%A&level=2').params.ex, undefined, 'malformed percent-encoding drops the parameter');
  assert.equal(parseHash('#/dhcp?ex=%E0%A4%A&level=2').params.level, '2', '…and only it');
  assert.equal(parseHash('#/dhcp?ex=s%65rver').params.ex, 'server', 'well-formed percent-encoding decodes');
  const odd = parseHash(`#/dhcp?Ex=1&e x=1&=1&ex&level=&seed=${'9'.repeat(65)}&__proto__=1&k2=1`).params;
  assert.deepEqual(Object.keys(odd), [], 'uppercase, spaces, empty keys or values, overlong values, non-letter keys');
  assert.equal(Object.getPrototypeOf(odd), null, 'params have no prototype');
  assert.equal(parseHash('#/dhcp?constructor=1').params.toString, undefined, 'so a key never meets an inherited one');
  assert.equal(formatHash('dhcp', [['ex', 'nat'], ['x', 'a b&c']]), '#/dhcp?ex=nat&x=a%20b%26c');
});

test('URL: an unknown section, screen or overlong hash opens the start screen with nothing decoded', () => {
  for (const hash of ['#/nope?ex=1', '#/dhcp/other', `#/dhcp?x=${'a'.repeat(600)}`, '#/']) {
    const { decoded } = open(hash);
    assert.deepEqual(decoded, { route: null, places: {}, prefs: {} }, hash);
  }
  assert.equal(encodeLocation(target, HOME, initialStore()), '#/');
});

// ── The codecs: one round trip per section ──

const canonical = {
  'ip-calculator': ['#/ip-calculator'],
  'ip-mask': ['#/ip-mask?level=1&seed=0', '#/ip-mask?level=3&seed=9999'],
  'ip-binary': ['#/ip-binary?level=2&seed=17', '#/ip-binary?level=3&seed=4821'],
  routing: ['#/routing?code=A1&syntax=cisco', '#/routing?code=A3b-0042&syntax=cisco', '#/routing?code=A8&syntax=routeros', '#/routing?code=A15-0007&syntax=routeros',
    '#/routing?view=fault&level=2&seed=77&syntax=cisco', '#/routing?view=fault&level=3&seed=4000&syntax=routeros'],
  dhcp: ['#/dhcp?ex=sides&seed=5&syntax=cisco', '#/dhcp?ex=sides&seed=6&other=1&syntax=routeros', '#/dhcp?ex=server&level=3&seed=42&other=1&syntax=routeros',
    '#/dhcp?ex=server&level=1&seed=0&syntax=cisco', '#/dhcp?ex=nat&level=1&seed=99999&syntax=cisco', '#/dhcp?ex=nat&level=2&seed=10&other=1&n=3&syntax=cisco'],
  firewall: ['#/firewall?ex=predict&level=1&seed=1', '#/firewall?ex=predict&level=2&variant=drop-above&seed=999999', '#/firewall?ex=order&variant=all&seed=5', '#/firewall?ex=order&variant=input&seed=77'],
  vlan: ['#/vlan?ex=predict&shape=p2&level=1&seed=12&syntax=cisco', '#/vlan?ex=ports&task=3&seed=7&syntax=routeros', '#/vlan?ex=route&task=4&seed=3&syntax=routeros',
    '#/vlan?ex=route&task=2&seed=9&syntax=cisco', '#/vlan?ex=faults&net=transit&level=3&seed=12&syntax=cisco', '#/vlan?ex=faults&net=two-switch&level=1&seed=5&syntax=routeros'],
  setup: ['#/setup?deck=router&seed=1', '#/setup?deck=switch&seed=1000000', '#/setup?deck=mikrotik&seed=5'],
};

test('URL codecs: every section of the target has one, with its keys, scopes and vendor flag', () => {
  assert.deepEqual(target.sections.map(s => s.id).sort(), Object.keys(canonical).sort());
  for (const s of target.sections) {
    assert.ok(s.url && Array.isArray(s.url.keys) && Array.isArray(s.url.scopes), s.id);
    assert.ok(!s.url.keys.includes('syntax'), `${s.id}: syntax is the shell's key`);
    assert.equal(Boolean(s.url.syntax), ['routing', 'dhcp', 'vlan'].includes(s.id), `${s.id}: a vendor switch`);
  }
});

for (const [id, hashes] of Object.entries(canonical)) {
  test(`URL codec round trip: ${id} (a link → its place → the same link; the place → a link → the same place)`, () => {
    for (const hash of hashes) {
      const { store, decoded } = open(hash);
      assert.equal(decoded.route?.section, id, hash);
      assert.equal(encoded(store, id), hash, `${hash}: decoded and encoded again`);
      // From the place's side: its link opened on a fresh store gives the same place for the codec's scopes.
      const again = open(encoded(store, id), initialStore(), lcg(1)).store;
      for (const scope of sectionOf(id).url.scopes) {
        if (store.places[scope] === undefined) continue;
        assert.deepEqual(identity(id, again.places[scope], again), identity(id, store.places[scope], store), `${hash}: ${scope}`);
      }
      assert.equal(encoded(again, id), hash);
    }
  });
}

/** What a place's link carries (the rest of a place is the screen's own, or defaults). */
function identity(id, place, store) {
  if (!place) return place;
  const syntax = store.prefs.syntax;
  switch (id) {
    case 'routing': return place.open !== undefined ? { open: place.open, level: place.level, seed: place.seed }
      : { taskId: place.taskId, variant: place.variants?.[place.taskId] ?? null, seed: place.seeds?.[place.taskId] ?? null };
    case 'dhcp': return { exercise: place.exercise, sides: place.exercise === 'sides' ? place.sides : null,
      level: place[place.exercise]?.level ?? null, task: place[place.exercise]?.tasks?.[place[place.exercise]?.level] ?? null };
    case 'vlan': return {
      predict: { shape: place.shape, slot: place.predict?.[`${place.shape}|${syntax}`] },
      ports: { task: place.portsTask, seed: place.portsSeeds?.[place.portsTask] },
      route: { task: place.routeTask, seed: place.routeSeeds?.[place.routeTask] },
      faults: place.faults?.[syntax],
    }[place.exercise];
    case 'firewall': return place.exercise ? place : { level: place.level, variantId: place.level === 2 ? place.variantId : null,
      seed: place.seeds?.[place.level === 1 ? 'chain' : place.variantId] };
    case 'setup': return { deck: place.deck, seed: place.seeds[place.deck] };
    default: return { level: place.level, seed: place.seeds?.[place.level] };
  }
}

test('URL codecs: encode writes only its own keys and `syntax`, short values, never answers, drafts, hints, marks, theme or mode', () => {
  let store = initialStore({ theme: 'light', mode: 'free', inputMode: 'choose' });
  for (const [id, hashes] of Object.entries(canonical)) for (const hash of hashes) {
    store = open(hash, store).store;
    // Work in an instance and a draft: none of it reaches the URL.
    store = storeReducer(store, { type: 'instance', key: 'k', action: { type: 'draft', syntax: 'cisco', part: 'p', value: { secret: 'ANSWER' } } });
    store = storeReducer(store, { type: 'place', scope: 'ip.calc', patch: { ip: '10.9.8.7', prefix: '/27' } });
    const hashNow = encoded(store, id);
    const keys = Object.keys(params(hashNow));
    const allowed = [...sectionOf(id).url.keys, ...(sectionOf(id).url.syntax ? ['syntax'] : [])];
    assert.ok(hashNow.length <= 120 && keys.every(k => allowed.includes(k)), `${id}: ${hashNow}`);
    assert.ok(!/ANSWER|10\.9\.8\.7|theme|mode|light|free|choose|hint|draft/.test(hashNow), hashNow);
  }
});

// ── Garbage, defaults and the learner's vendor ──

test('URL: a garbage link opens the section at its defaults with the learner\'s own vendor (Fable, Astra 4)', () => {
  const mine = initialStore({ syntax: 'routeros' });
  const { store, decoded } = open('#/dhcp?ex=zzz&level=99&syntax=x', mine);
  assert.deepEqual(decoded.prefs, {}, 'an unknown vendor is not a preference');
  assert.equal(store.prefs.syntax, 'routeros');
  assert.equal(store.places.dhcp.exercise, 'sides');
  assert.equal(store.places.dhcp.server.level, 1);
  assert.match(encoded(store, 'dhcp'), /^#\/dhcp\?ex=sides&seed=\d+&syntax=routeros$/);
  // A link's known vendor becomes the session's.
  assert.equal(open('#/dhcp?ex=nat&syntax=cisco', mine).store.prefs.syntax, 'cisco');
});

test('URL codecs: invalid values for each key fall back to the defaults', () => {
  const cases = [
    ['#/ip-mask?level=4&seed=10000', s => s.places['ip.mask'].level === 1 && s.places['ip.mask'].seeds[1] <= 9999],
    ['#/ip-mask?level=02&seed=-1', s => s.places['ip.mask'].level === 1],
    ['#/ip-binary?level=1.5&seed=1e3', s => s.places['ip.binary'].level === 1 && s.places['ip.binary'].seeds[1] !== 1000],
    ['#/routing?code=Z9-0001', s => s.places.routing.taskId === 'routing.task-01' && s.places.routing.seeds['routing.task-01'] === null],
    ['#/routing?code=A99', s => s.places.routing.taskId === 'routing.task-01'],
    ['#/routing?code=A3b-99999', s => s.places.routing.taskId === 'routing.task-01'],
    ['#/routing?view=fault&level=7&seed=x', s => s.places['routing-faults'].open === true && s.places['routing-faults'].level === 1 && Number.isInteger(s.places['routing-faults'].seed)],
    ['#/routing?view=other', s => s.places['routing-faults'] === undefined && s.places.routing.taskId === 'routing.task-01'],
    ['#/firewall?ex=nope&level=3&variant=x&seed=0', s => s.places['firewall-tab'].exercise === 'predict' && s.places.firewall.level === 1 && s.places.firewall.seeds.chain >= 1],
    ['#/firewall?ex=predict&level=2&variant=chain', s => s.places.firewall.level === 2 && s.places.firewall.variantId === 'basic'],
    ['#/firewall?ex=order&variant=basic&seed=1000000', s => s.places['firewall-order'].variantId === 'input' && s.places['firewall-order'].seeds.input <= 999999],
    ['#/vlan?ex=x&shape=p9&level=3', s => s.places.vlan.exercise === 'predict' && s.places.vlan.shape === 'p1' && s.places.vlan.predict['p1|cisco'].level === 0],
    ['#/vlan?ex=ports&task=9', s => s.places.vlan.portsTask === 'vlan.ports-1'],
    ['#/vlan?ex=route&task=4&syntax=cisco', s => s.places.vlan.routeTask === 'vlan.route-1', 'MikroTik\'s task 4 is not Cisco\'s'],
    ['#/vlan?ex=faults&level=0&net=nowhere&seed=0', s => s.places.vlan.faults.cisco.level === 1 && s.places.vlan.faults.cisco.seed >= 1],
    ['#/setup?deck=dr-2&seed=0', s => s.places.setup.deck === 'dr-1' && s.places.setup.seeds['dr-1'] >= 1],
    ['#/dhcp?ex=nat&level=3&seed=1000000&other=yes&n=-2', s => s.places.dhcp.nat.level === 1 && s.places.dhcp.nat.tasks[1].other === false && s.places.dhcp.nat.tasks[1].seed < 100000],
  ];
  for (const [hash, ok, why = ''] of cases) assert.ok(ok(open(hash).store), `${hash} ${why}`);
});

test('URL codecs: a task the logic can\'t build from the link is replaced by one it builds, never passed to the screen', async () => {
  const faults = (await import('../src/sections/routing/logic/faults-exercise.js')).default;
  const bank = sectionOf('routing').bank;
  // Out of the generator's range: a new seed, built at the link's level.
  const place = open('#/routing?view=fault&level=3&seed=10000').store.places['routing-faults'];
  assert.ok(place.level === 3 && place.seed !== 10000 && place.seed <= 9999);
  assert.doesNotThrow(() => faults.create(bank.faults, { bank, level: 3, seed: place.seed }));
  const vlanFaults = (await import('../src/sections/vlan/logic/faults-exercise.js')).default;
  const record = sectionOf('vlan').bank.faults[0];
  // `transit` has only level 3: at level 1 that network can't be built; the logic's own network is used.
  assert.throws(() => vlanFaults.create(record, { vendor: 'cisco', level: 1, seed: 5, variantId: 'transit' }));
  const slot = open('#/vlan?ex=faults&net=transit&level=1&seed=5').store.places.vlan.faults.cisco;
  assert.equal(slot.level, 1);
  assert.notEqual(slot.shape, 'transit');
  assert.doesNotThrow(() => vlanFaults.create(record, { vendor: 'cisco', level: 1, seed: slot.seed, ...(slot.shape ? { variantId: slot.shape } : {}) }));
  // MikroTik's «Маршрутизатор із мостом» (route-4) is not Cisco's: a Cisco link to it gets another network.
  const cisco = open('#/vlan?ex=faults&net=route-4&level=2&seed=5&syntax=cisco').store.places.vlan.faults.cisco;
  assert.ok(cisco.level === 2 && cisco.shape !== 'route-4');
});

test('URL routing: `code` names the task; separate level/seed are the fault exercise\'s only (precedence)', () => {
  let s = open('#/routing?code=A3b-0042&level=2&seed=5').store;
  assert.equal(s.places.routing.taskId, 'routing.task-03');
  assert.equal(s.places.routing.variants['routing.task-03'], 'defaults');
  assert.equal(s.places.routing.seeds['routing.task-03'], 42);
  assert.equal(s.places['routing-faults'], undefined, 'no fault exercise without view=fault');
  s = open('#/routing?view=fault&level=2&seed=77&code=A5').store;
  assert.deepEqual([s.places['routing-faults'].open, s.places['routing-faults'].level, s.places['routing-faults'].seed], [true, 2, 77]);
  assert.equal(s.places.routing.taskId, 'routing.task-05', 'the code still names the task list\'s task');
  assert.equal(encoded(s, 'routing'), '#/routing?view=fault&level=2&seed=77&syntax=cisco', 'the open exercise is what the link says');
  // The Ukrainian-keyboard slips the code box reads are read here too, and written back canonically.
  assert.equal(encoded(open('#/routing?code=%D0%903%D0%B2-42').store, 'routing'), '#/routing?code=A3b-0042&syntax=cisco');
});

// ── Warm restore: the URL over the remembered place ──

test('URL warm restore: the link\'s keys override, other URL-owned fields reset to defaults, the rest is kept', () => {
  let store = initialStore();
  store = open('#/dhcp?ex=server&level=3&seed=42&other=1').store;
  store = storeReducer(store, { type: 'place', scope: 'dhcp', patch: { nat: { level: 2, tasks: { 1: { seed: 1, other: false }, 2: { seed: 8, other: true, n: 5 } } } } });
  store = storeReducer(store, { type: 'place', scope: 'routing.tasks', patch: { asides: { legend: false } } });
  store = storeReducer(store, { type: 'instance', key: 'work', action: { type: 'view', patch: { drafts: { x: 1 } } } });
  // Back to an entry that names the server exercise without a level: level resets to 1 (its seed the link's).
  const next = open('#/dhcp?ex=server&seed=7', store).store;
  assert.equal(next.places.dhcp.server.level, 1, 'an omitted URL-owned field resets to its default');
  assert.deepEqual(next.places.dhcp.server.tasks[1], { seed: 7, other: false });
  assert.deepEqual(next.places.dhcp.server.tasks[3], { seed: 42, other: true }, 'another level\'s task is kept');
  assert.deepEqual(next.places.dhcp.nat, store.places.dhcp.nat, 'another exercise is kept');
  assert.deepEqual(next.places['routing.tasks'], { asides: { legend: false } }, 'unrelated places are kept');
  assert.equal(next.instances.work, store.instances.work, 'instances are kept');
  // Routing: the router selection survives a link to the same task, not to another.
  let rt = open('#/routing?code=A4').store;
  rt = storeReducer(rt, { type: 'place', scope: 'routing', patch: { router: 'R2', filterLevel: 3 } });
  assert.equal(open('#/routing?code=A4', rt).store.places.routing.router, 'R2');
  assert.equal(open('#/routing?code=A5', rt).store.places.routing.router, null);
  assert.equal(open('#/routing?code=A5', rt).store.places.routing.filterLevel, 3, 'the list\'s filter is kept');
  // A link to the task list closes «Знайди несправність» but keeps its instance.
  rt = open('#/routing?view=fault&level=2&seed=77', rt).store;
  const closed = open('#/routing?code=A5', rt).store.places['routing-faults'];
  assert.deepEqual([closed.open, closed.level, closed.seed], [false, 2, 77]);
  // VLAN: the URL's slot is the current vendor's; the other vendor's is kept.
  let vl = open('#/vlan?ex=faults&level=2&seed=9&syntax=routeros').store;
  const cisco = vl.places.vlan.faults.cisco;
  vl = open('#/vlan?ex=faults&level=3&seed=12&syntax=routeros', vl).store;
  assert.equal(vl.places.vlan.faults.routeros.level, 3);
  assert.deepEqual(vl.places.vlan.faults.cisco, cisco);
});

// ── The store and the shell's first render ──

test('store hydrate: replaces whole scopes and known prefs, keeps the rest; nothing to do keeps the state', () => {
  let s = initialStore({}, { a: { x: 1, y: 2 }, b: { z: 1 } });
  assert.deepEqual(s.places, { a: { x: 1, y: 2 }, b: { z: 1 } });
  const t = storeReducer(s, { type: 'hydrate', places: { a: { x: 3 } }, prefs: { syntax: 'routeros', bogus: 1 } });
  assert.deepEqual(t.places, { a: { x: 3 }, b: { z: 1 } }, 'a whole place, not merged');
  assert.equal(t.prefs.syntax, 'routeros');
  assert.ok(!('bogus' in t.prefs));
  assert.equal(storeReducer(s, { type: 'hydrate', places: {}, prefs: {} }), s);
});

test('bootOf: a cold load hydrates the section before mount; a link synthesizes the start screen, a refresh does not; garbage is the start screen', () => {
  const at = hash => ({ hash, href: `https://x.test/netgym/${hash}` });
  const cold = bootOf(target, at('#/dhcp?ex=server&level=2&seed=11&syntax=routeros'), { state: null }, lcg());
  assert.deepEqual(cold.nav.stack.map(r => r.section), [null, 'dhcp']);
  assert.equal(cold.link, true, 'a link opened: the start screen goes first');
  assert.equal(cold.prefs.syntax, 'routeros');
  assert.deepEqual(cold.places.dhcp.server.tasks[2], { seed: 11, other: false });
  assert.equal(cold.places.dhcp.server.level, 2);
  const refresh = bootOf(target, at('#/dhcp?ex=server&level=2&seed=11'), { state: { ng: { section: 'dhcp', screen: 'main', params: {} }, depth: 1 } }, lcg());
  assert.equal(refresh.link, false, 'a refresh keeps its entry');
  assert.deepEqual(refresh.places.dhcp.server.tasks[2], { seed: 11, other: false }, 'the same task after a refresh');
  for (const hash of ['', '#/', '#/nope', `#/dhcp?x=${'a'.repeat(600)}`]) {
    const b = bootOf(target, at(hash), { state: null }, lcg());
    assert.deepEqual(b.nav.stack, [HOME], hash);
    assert.deepEqual(b.places, {});
    assert.equal(b.link, false);
  }
  // Outside a browser (a server render): the start screen.
  assert.deepEqual(bootOf(target, undefined, undefined).nav.stack, [HOME]);
});

// ── Repair (Astra 3): every task a screen makes stays within its codec's range ──

test('URL DHCP: «Новий раунд» and «Ще одна» wrap after 999 999, so the next task is still written; n keeps its parity', async () => {
  const { MAX_SEED, nextSeed } = await import('../src/sections/dhcp/screens/seeds.js');
  assert.equal(MAX_SEED, 999999);
  assert.equal(nextSeed(41), 42);
  assert.equal(nextSeed(MAX_SEED), 0, 'wraps to 0, inside the URL\'s range');
  for (const n of [MAX_SEED - 2, MAX_SEED - 1, MAX_SEED]) assert.notEqual(nextSeed(n) % 2, n % 2, `n's parity alternates at ${n}`);
  // The successor of a link's last seed round-trips, with the round count across the wrap.
  for (const [seed, n] of [[MAX_SEED, MAX_SEED], [MAX_SEED, 4]]) {
    const store = open(`#/dhcp?ex=nat&level=2&seed=${seed}&other=1&n=${n}`).store;
    const task = store.places.dhcp.nat.tasks[2];
    assert.deepEqual(task, { seed, other: true, n });
    const next = storeReducer(store, { type: 'place', scope: 'dhcp', patch: { nat: { ...store.places.dhcp.nat, tasks: { ...store.places.dhcp.nat.tasks, 2: { seed: nextSeed(seed), other: true, n: nextSeed(n) } } } } });
    const again = open(encoded(next, 'dhcp')).store.places.dhcp.nat.tasks[2];
    assert.deepEqual(again, { seed: nextSeed(seed), other: true, n: nextSeed(n) }, 'a refresh after the round keeps it');
  }
  // Every successor in the screens goes through nextSeed (no bare `+ 1` on a seed or a round count).
  const { readFileSync } = await import('node:fs');
  for (const file of ['SidesView.jsx', 'ServerView.jsx', 'NatView.jsx']) {
    const source = readFileSync(resolve(root, 'src/sections/dhcp/screens', file), 'utf8');
    assert.ok(!/\b(?:seed|n)\s*\+\s*1\b/.test(source), `${file}: a successor outside nextSeed`);
    assert.match(source, /nextSeed\(seed\)/, file);
  }
});

test('URL: the other sections\' new and next seeds stay within their codecs\' ranges', async () => {
  const { nextSeed: firewallNext } = await import('../src/sections/firewall/screens/round.js');
  const { nextSeed: vlanNext } = await import('../src/sections/vlan/screens/predictState.js');
  const { newSeed: ipNew } = await import('../src/sections/ip/screens/links.js');
  const edges = [() => 0, () => 0.9999999999];
  for (const random of edges) {
    for (const [name, seed, min, max] of [['firewall', firewallNext(undefined, random), 1, 999999], ['vlan', vlanNext(undefined, random), 1, 999999],
      ['setup', setupFirstSeed(random), 1, setupMax]]) {
      assert.ok(Number.isInteger(seed) && seed >= min && seed <= max, `${name}: ${seed}`);
    }
  }
  for (let i = 0; i < 50; i++) assert.ok(ipNew() >= 0 && ipNew() <= 9999, 'IP: links.js newSeed');
  // Setup's successor: a different random seed, or seed + 1 after repeated draws of the same one (at most 1 000 001).
  const stuck = () => 0.9999999999;
  assert.equal(setupNextSeed(setupFirstSeed(stuck), stuck), 1000001);
  assert.ok(1000001 <= setupMax);
});
