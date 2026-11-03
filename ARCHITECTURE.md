# NetGym architecture

NetGym is a networking trainer: one app with sections, built from one code
base, as a Windows `.exe` (Wails) and as a web build. New tools, exercises
and checkers should plug in without rework, while nothing is built before
something needs it.

This is the design the code follows. It started as a reviewed design
document (v2.1, October 2026); the sections below describe what is built,
with the parts still planned marked as such.

## 1. Principles

0. **A general trainer, teaching what is correct.** NetGym is useful for
   anyone learning networking. Its UI and task texts stay general: no scores
   to chase and no references to any particular course. It teaches correct
   practice, and it checks by behaviour: any working answer passes, and form
   is required only where the form is the point of the task.
0b. **Best practice, never risk.** NetGym knows good practice and ingrains
   it. Reference answers, hints, tips and generated solutions must never
   model something risky or bad for a real network: reciprocal defaults
   that loop unknown traffic, summaries that capture unused space without a
   discard route, host-route hacks, firewall rules in an order that silently
   disables protection. Where a shorter answer is risky, the tip explains
   why, and the optimiser picks the shortest **safe** table.
1. **Pure logic, thin screens.** Everything that decides something (address
   maths, forwarding, checking, generation, parsing, session state) is plain
   JavaScript with no React, DOM, storage or clock. Screens show results and
   pass on input.
2. **Codes, not sentences.** Logic returns result and reason codes with
   parameters, and lists every code it can return. Ukrainian text lives in
   string files, and a test fails if a code has no string.
3. **No answer leaks** (precise rule in §6). The reference solution reaches
   the page only through an explicit «Показати відповідь», and revealing
   marks the task as assisted.
4. **Nothing depends on saved state or the URL.** Navigation is in memory,
   and persistence is optional and best effort. Every task can be reached by
   a short code. (Round 6: the shell mirrors where you are into the URL's
   hash and reads it back on load; with no hash the app starts as before.)
5. **Explicit over clever.** Registration is by plain imports in target
   manifests: no plugin loader, no discovery. Task data says what it means;
   nothing is inferred from interface notes or names.
6. **Build only what a real tool needs.** Roadmap tools are test cases for
   this design, not commitments. An extension point is added when its first
   user is built; until there are two users it stays local to that tool.

## 2. Concepts

| Concept | What it is | Example |
| --- | --- | --- |
| **Section** | A navigation unit on the start screen, with its own screens and strings | Маршрутизація, IP-адреси, Перевірка налаштувань |
| **Screen** | A React component a section shows | the routing task screen, the calculator |
| **Exercise** | Pure logic following the exercise contract (§3) | routing tasks, the binary walk, the mask lesson |
| **Task bank** | Versioned, serialisable task records, validated by tests, chosen by the target | the 16 routing tasks |
| **Variant** | A named alternative inside one task record; variants share the record's network | task 3 `explicit-routes` / `defaults` |
| **Syntax** | A presentation setting, never part of a task's identity | Cisco IOS / MikroTik RouterOS |
| **Checker** | Pure logic that evaluates supplied evidence against requirements | the RB941 `/export` checker (§4.3) |
| **Target** | A build: which sections, banks and defaults | the full NetGym `.exe`, routing only, HTML |

A tool without assessment, such as the calculator, is simply a screen; it
doesn't need the exercise contract.

## 3. The exercise contract

```js
// sections/<section>/logic/<exercise>.js: pure, no React, no bank imports
export default {
  id: 'routing.static', version: 1,
  codes: ['dst-not-network', 'gateway-off-link', /* every code check/hints can return */],
  create(record, { variantId, seed, generatorVersion }) {}, // record is null for generated exercises
  check(task, answer) {},     // → Result (below)
  hints(task, answer) {},     // → [{ code, params }]: question → evidence → example with other numbers
  solution(task) {},          // → answer; called only by the reveal path (§6)
  options(task, field) {},    // optional: choose-mode values, including classic-mistake distractors
  describe(task) {},          // optional: lines for the text equivalent of a picture
  scaffold(task) {},          // optional: guided rows; check() never requires them
};

Result = {
  ok, complete, code,
  findings: [{ code, severity: 'blocks' | 'advice', field?, entity?, params? }],
  evidence?,                  // exercise-specific, e.g. routing's probe results (§4.2)
}
```

- **Records come from the caller.** The screen, via the target's bank,
  resolves a task ID to its record and passes it in. Logic never imports a
  bank, so a target can swap banks.
- **Findings and completion.** `advice` findings never block success (for
  example `could-use-default` or `could-summarise`), and only `blocks`
  findings make `ok` false. `complete` lets multi-step exercises, such as the
  binary walk, accept a right intermediate step without finishing the task.
- **Session state** (status, hint index, revealed, assisted, attempts) is a
  pure reducer in `ui/session.js`, tested in Node. The `useExercise(logic,
  record, params)` hook in `ui/` only wraps it, and bank tasks and generated
  tasks use the same hook.
- **Fault exercises:** `engine/faults.js` supplies immutable catalogue plumbing,
  catalogue entries `{code,text,sites,plant,repair}`, gate fact collection,
  comparison of section-defined evidence signatures and
  `fixThenCause(result, policy)`. A failing repair is independent of the cause;
  only a passing repair invokes the cause policy. Routing exposes two separate
  checks (repair, then cause); VLAN retains its combined call with identical
  identities, reconstruction, seeded choices and assisted results. Planters,
  eligibility, signatures/ambiguity policy, plausible options and disclosure
  transitions remain section-owned. Hint 3 and reveal are assistance actions;
  each section preserves its established assistance semantics.
- **Not in the contract yet:** `predict` (predict then reveal) and
  timing. Each starts inside its first tool and moves into the contract when a
  second tool needs it.

## 4. Engines (`src/engine/`)

Plain ES modules with JSDoc types. The engine started from an earlier IP
trainer's engine by the same author. **Its names and helpers stay**
(`parseIp`, `blockSize`, `hostCount`, `firstHost`, `lastHost`, `sameNetwork`,
`role`, `isNetworkAddress`, `smallestPrefixFor`, `withRoutes`, …), so that its
tests carry over.

| Module | Change from the earlier engine | Round |
| --- | --- | --- |
| `ip.js` | Add `contains`, `overlaps`, `bits8`. Parsing is strict, with errors as codes; comma→dot lives in `AddressField`. It covers /0–/32; teaching limits belong to screens (the calculator's choose mode offers /8–/30; free entry takes /0–/32, with counts labelled as conventional subnet arithmetic) | 2 |
| `rng.js` | Unchanged, golden sequences kept | 2 |
| `network.js` | Several LANs per router, explicit segments, ISP devices, an internet endpoint and supplied routes; `validateNetwork` | 2 |
| `forward.js` | Keep backup routes (the earlier engine kept only the first per prefix); distance; link-down scenarios; `ping` = request and reply | 2 |
| `vendors/cisco.js`, `vendors/routeros.js` | `interfaceLabel`, `renderRoute` (with distance), `parseRouteFields` | 2 |
| `renumber.js` (engine) and `sections/routing/logic/codes.js` | Renumber existing task shapes with alignment and summaries kept; versioned short codes (§7). Built in step 9 under these names | 2, late |
| `routeros-export.js` | §4.3 | after real exports |
| Cisco `show running-config`, an L2/VLAN frame walk, NAT, firewall evaluation | only when a roadmap tool needs them | later |

### 4.1 Network model

```js
Network = {
  devices:   [{ id, kind: 'router' | 'isp', interfaces: [{ id, segmentId, address: { ip, prefix } | null }] }],
  segments:  [{ id, kind: 'link' | 'lan' | 'wan' | 'server', name }],   // name is the display label; interfaces keep their own `note`
  endpoints: [{ id, kind: 'host', segmentId, ip, gateway }
            | { id, kind: 'internet', viaPeers: ['isp1', 'isp2'] }],
  supplied:  { [deviceId]: [Route] },     // e.g. the default a DHCP WAN provides
}
Route  = { id, dst, prefix, via, distance = 1 }
Routes = { [deviceId]: [Route] }          // a submission, reference routes and supplied routes all use this shape

TaskRecord = {
  id: 'routing.task-03', displayNumber: 3, revision, title, text, network,
  probes, scenarios,                       // shared by all variants
  variants: [{ id: 'explicit-routes', code: '3', title, text, referenceRoutes: Routes, objectives, scaffold }],
}
// Task 3: 'explicit-routes' (code 3) and 'defaults' (3b). Task 8: 'specific' (8) and 'stub-defaults' (8b).
// Variant codes are permanent; they appear in share codes (§7).
```

- **The internet boundary.** An ISP device answers pings to the internet
  endpoint, standing in for "the rest of the internet". The reply is traced
  back from the ISP through the student's routes, so a missing return route
  still fails. NAT is assumed to be configured and is not simulated.

### 4.2 Forwarding, probes and what passing proves

- **Route selection:**
  - Drop routes whose egress link is down.
  - For each prefix, connected routes beat static ones, then the lowest
    distance wins. Packets use the longest prefix.
  - Two equal-distance next hops for one prefix report `unsupported-ecmp`.
  - A hop limit ends every walk, and loop detection returns the closing edge
    for the drawing.
- **Each task declares its acceptance scope, explicitly:**
  - **Probes:** named endpoint pairs (LAN host to LAN host, to a transit
    interface, to the internet). Each is a ping, so its reply must arrive too.
  - **Coverage objectives** wherever the task promises that a *network* is
    reachable, not just one host: the routes must cover the whole destination
    prefix. So two /32 routes that happen to make the sampled hosts work do
    not pass a task about a /24.
  - **Scenarios:** each with an assertion about the path taken. Task 15:
    normally, internet traffic leaves via ISP1; with ISP1's link down, via
    ISP2. An ISP2-only setup fails the first scenario.
  - **Form objectives**, where a task requires a form ("a default route on
    this stub", "LAN1–LAN3 as one summary"). Elsewhere these are advice, not
    blocking.
  - **Demonstrations** are shown, not required: task 3's reciprocal-default
    loop and task 16's unused /22 space. A working alternative doesn't have to
    reproduce them.
- **The routing result** carries the evidence the screen draws, so screens
  never re-run assessment:

  ```js
  evidence = {
    probes: [{ id, scenarioId, ok, code,
               request: { hops: [{ deviceId, ingressId, egressId, routeId, nextHop }], stop },
               reply:   { hops: [...], stop } | null }],
    objectives: [{ id, ok, code, params }],
  }
  ```

- **Codes:** `invalid-ip`, `invalid-prefix`, `dst-not-network`,
  `gateway-is-self`, `gateway-off-link`, `gateway-not-host`,
  `invalid-distance`, `no-route`, `no-device`, `loop`, `ttl-exceeded`,
  `return-path-failed`, `unsupported-ecmp`, `wrong-path`, `coverage-missing`,
  `objective-not-met`, plus the advice codes `could-use-default` and
  `could-summarise`, and the classic-mistake codes from the mistake catalogue
  (`missing-return-route`, `gateway-other-network`, …).

### 4.3 The RouterOS export checker (gated on real exports)

```js
parseExport(text)                       → { statements, diagnostics }        // sections, add/set, quoting, continuations, comments; source locations
resolveConfig(statements, diagnostics)  → { config, unknowns, provenance }   // selectors, disabled objects, references; diagnostics become unknowns
checkConfig(requirements, { config, unknowns, provenance })
                                        → [{ id, state: 'found' | 'wrong' | 'manual' | 'unsupported', evidence: [source lines from provenance] }]
```

- **Unsupported syntax isn't a verdict.** If relevant syntax wasn't
  understood, the item becomes `unsupported` or `manual`, never a pass or a
  fail.
- **Missing values aren't wrong.** Values an export hides, such as passwords
  without `show-sensitive`, are never treated as wrong.
- **No grades.** There are no percentages.
- **Acceptance:** fixtures from real exports, including disabled objects,
  hidden secrets and unknown syntax.

## 5. Structure and dependency rules

```text
src/
  engine/        pure: ip, rng, network, forward, vendors/, generate, share-code, routeros-export
  ui/            generic components, tokens.css, topology/ (geometry.js pure),
                 hooks (useExercise, useNav, useT) and session.js (pure reducer)
  app/           shell, memory navigation, store, preferences, uk.js
  sections/
    routing/     section.js, uk.js, logic/, screens/, syntax/
    ip/          calculator, binary walk, mask/strip lessons
    firewall/    uk.js, logic/ (evaluator, predict), screens/ (FW-1 packet walk)
    checker/     later
  banks/         routing/*.js, firewall/*.js: task records, validated (separate from logic)
  targets/       netgym.js, routing.js (manifests; later web.js)
shell/           Wails host (Go)
tests/           node --test
tools/           setup, build, test, browser checks
```

- **Imports:**
  - `engine` imports only `engine`.
  - Section `logic/` imports `engine` and its own section, never React, storage,
    browser APIs or banks. One exception: the «Перевірка мережі» section's
    logic (`checks`) reads three DHCP logic modules (`client.js`, `faults.js`,
    `nat.js`), because it diagnoses those scenarios. Nothing else crosses
    sections, and never in the other direction (`tests/imports.test.mjs`).
  - `ui` imports `engine`, never sections or banks.
  - Screens import their section's logic, `ui` (components and hooks) and
    `banks`, but never another section.
  - `app` imports sections and banks only through target manifests.
  - Targets own persistence, clipboard and navigation adapters.
- **Enforcement:** a test scans imports and fails on a forbidden direction.
  The same test checks that `solution(` is called only from the reveal path.
  Files are split by role (data, logic, session, screen).
- **Language:** JavaScript with JSDoc contracts and runtime validation of
  bank data; TypeScript is not a prerequisite.

## 6. UI composition

### Shell

- **Start screen:** one card per section in the target, with a title, one
  line of description and «Відкрити». («Продовжити: #10» for the last place
  is planned, not built.)
- **Navigation:** `{section, screen, params}` on an in-memory stack with
  `go`, `back` and `home`.
  - It is mirrored into the browser history. Round 6 (spec URL v2.1): each
    entry carries a hash, `#/<section>?<key>=<value>&…` (`src/app/url.js`
    and each section's codec, `src/sections/<id>/screens/url.js`), with the
    section's current task identity only (never answers or marks). The hash
    is decoded and hydrated into the store before the first render; section
    navigation pushes, place changes replace, and `popstate` or a typed hash
    restores both the place and the route. Where there is no URL (a server
    render, the tests' mini DOM) entries are pushed without one, as before.
  - The in-app «←» is the main way back.
  - After every navigation, focus moves to the new screen's heading.
- **Header:** «← Розділи», the app's caption, the
  section title, a slot for section controls (the syntax switch, the score)
  and the theme switch.
- **Single-section builds:** the target's `only` setting hides the start
  screen.

### Generic components (`src/ui/`)

- **Controls:**
  - `Panel`, `Caption`, `Button`, `Segmented`.
  - `AddressField`: kind `ip | mask | prefix | cidr | int`. It always has a
    visible label, commas become dots, Enter submits, and it offers choose mode
    when `options` exist.
  - `Choices`.
- **Feedback:**
  - `Feedback`: the screen's only `role="status"`, words plus an icon.
  - `HintLadder`: «Підказка 1 з 3», then «Показати відповідь».
  - `Reveal`: the answer isn't in the DOM until it's pressed.
- **Content:**
  - `CommandBlock`, with a copy button.
  - `TaskPicker`, `Score`, `TextEquivalent`.
  - `Checklist`, with states in words: знайдено / не так / перевір сам /
    не підтримується.
- **Layout:** `ExerciseLayout` arranges the stage, question, answer, help
  and tools. No sticky bar; `HelpPanel` (the check row and one
  message area) goes in the help slot under the answer.
- **Topology** (`ui/topology/`):
  - `TopologyDiagram({geometry, selected, onSelect, marks, trace})` draws the
    packet path as a layer of the same SVG.
  - `RouterButtons` is the keyboard path.
  - `RouterCard`.
  - A `TextEquivalent` always sits next to a `TopologyDiagram`.
  - `RouterDiagram` (round 6): the PC / R1 / Інтернет drawing shared by the
    firewall (its `firewall` view: doors, lanes, the walk) and «DHCP і NAT»
    (its `dhcp` view); the layout is `router-layout.js`.
- **Shared in round 6 for «DHCP і NAT»:** `AddressRuler` (the IP screens'
  ruler, plus a span, bands and pins for DHCP's address strip) and
  `WalkStepper` (the firewall's «По кроках»).

**Section-specific components:**
- routing's `RouteRow`, built from a syntax adapter
  (`sections/routing/syntax/cisco.js` and `mikrotik.js`: fields, `toRoute`,
  `command`);
- the calculator's subnet picture;
- the binary octet field;
- the checker's paste box.

### No-answer-leak rule (testable form)

- **Five kinds of content:**
  1. **Givens:** anything the diagram or its text equivalent shows. Free to
     appear anywhere.
  1b. **Examples with other numbers:** worked examples whose addresses don't
     come from the task (the hint ladder's last rung).
  2. **Unmarked choices:** choose-mode options, with nothing marking which is
     right.
  3. **The student's own submitted answer:** may be echoed back, including in
     the success line.
  4. **Reference solutions:** a complete reference answer (for routing, a
     route as destination plus next hop, or a command string), only through
     the reveal path.
- **Where it applies:** feedback, hints, scaffolds, text equivalents,
  accessible names and descriptions, and copy actions may contain only kinds
  1, 1b, 2 and 3.
- **Prediction lessons** (the strip): once the student commits a prediction,
  showing the outcome is allowed. The task stays unassisted, and the
  prediction counts as one attempt.
- **Gate:** a golden test renders, for every bank task and variant (strings
  filled in), every hint, scaffold, wrong-answer feedback, text-equivalent
  line, accessible name or description, and copy payload available before the
  reveal. It fails if any of them contains a reference route or command.

**What the rule protects against.** It keeps answers out of what the
app renders or hands to screen code: the DOM, accessible names, copy
payloads, the public task object and check results. It doesn't
promise secrecy against someone who reads NetGym's code and replays
its seeded generator; NetGym runs offline with its banks inside, so
that isn't achievable, and seeds exist for reproducible instances
and share codes. Cheap protections are still preferred: ids and
initial orders aren't derived from reference positions.

### Design tokens (`src/ui/tokens.css`)

- **Type:** captions 14 px at minimum, small text 16, body and inputs 18,
  titles 22 and 26. Prose uses the system sans font; addresses, commands,
  inputs and captions stay monospace. No web fonts.
- **Colour:**
  - the familiar hues as semantic CSS variables per theme (`data-theme` on
    `<html>`);
  - darker router and level shades in the light theme;
  - «Ще ні» is amber, not red.
- **Targets and focus:**
  - 44 px targets, 48 px on coarse pointers;
  - a 3 px `:focus-visible` outline, never removed and never hidden under
    sticky bars;
  - reduced motion draws the packet path without animation.
- **Styling:** plain CSS per component with an `ng-` prefix; no inline
  colours.
- **Pure tests:** contrast (text ≥ 4.5:1, lines and focus ≥ 3:1) and
  estimated diagram text size as supporting evidence. Rendered checks decide
  (§9).

### Layout (chosen by the content area's width, so it adapts to desktop zoom)

- **Three columns** (content ≥ 1440 px): task list | diagram | work panel.
- **Two columns** (960–1439 px, a typical desktop at 1280):
  - the task list is a drawer, «☰ Задачі»; it takes focus when opened,
    traps Tab, closes on Escape and returns focus to its button;
  - a task bar holds the level, the title and ◀ ▶, with the description
    below it (never clamped);
  - the diagram and the work panel share the width (work panel 420–540 px,
    scrolling on its own). Each row keeps its own «Перевірити» and inline
    feedback; there is no sticky check area.
- **One column** (< 960 px: zoom, half-width windows).
- **Phone** (under 640 px of window, round 6): the page itself scrolls and
  the bar scrolls with it; the bar is one row («←», the section, «⋯») and
  «⋯» opens a sheet with the vendor, mode, exercise, level and theme
  choices; a screen's header keeps a stepper «‹ 1/4 · Name ›»; asides start
  folded; «Текстом» starts open where the first action needs it (VLAN
  ports, firewall) and closed elsewhere, and «Розгорнути схему» shows the
  diagram full-screen; forms and lists stack. The parts and their API are in
  `src/ui/phone.js`, `src/ui/BarSlot.jsx` and `src/ui/topology/DiagramExpand.jsx`.
- **Diagram:** the default view is the whole diagram if its text stays at
  12 px or more, otherwise a readable scale inside a pannable frame. Zoom
  controls («−», «+», «Уся схема», Ctrl+wheel, +/-) are kept per task
  instance, and `centreOn()` pans without changing the selection (for the
  packet path). «Правила» and «Текстом» open as overlays on the frame.

### State

- **Component state:** open panels and transient UI only.
- **App store** (one `useReducer` context): the route stack, theme, syntax,
  input mode, and per **task instance** (below):
  - the canonical answer (vendor-neutral routes);
  - the last result;
  - the solved and assisted marks.
  - Raw text is kept per instance, mode and syntax; text that parses also
    sets a canonical draft, so complete routes convert live; only unfinished
    text stays in its syntax.
- **Owner of editable values:** the store owns them; fields are controlled.
- **Instance key:** from the share descriptor (§7), meaning bank revision,
  task, variant, generator version and seed. So «Інші адреси» never reuses
  answers or marks from other addresses, and switching syntax keeps the same
  task identity.
- **Persistence:** none yet: every launch starts fresh. If it's added, it
  stays optional (one key `netgym-v1`, read once and written inside `try`,
  nothing locks). Each `.exe` may have its own storage, so nothing may
  assume shared progress between builds.

## 7. Identity, banks and share codes

- **IDs:** stable task IDs such as `routing.task-03`, with `displayNumber: 3`
  kept separately, and variant IDs such as `explicit-routes`.
- **The descriptor** has `formatVersion`, `exerciseId`, `bankId`,
  `bankRevision`, `taskId`, `variantId`, `generatorVersion` and `seed`. It
  exists in code and fixtures and keys the session.
- **Learners type a short code**, `<letter><variant code>[-<seed>]`, for
  example `A3b-4821`, or `A3b` for the task with its own addresses.
  - The letter maps, through a permanent in-code table, to the exercise,
    bank, bank revision, format and generator version.
  - The variant code (§4.1) names the task and variant.
  - The seed, if present, picks «Інші адреси».
  - So the code reconstructs every descriptor field. Unknown letters or
    variant codes are rejected, never reinterpreted.
  - Codes like `A3b-4821` stay easy to share and to type on a phone.
- **Generator version:** bumped whenever the output changes, including the
  order in which random numbers are drawn. Replay fixtures guard this.
  A bank revision or generator change adds a new share-code letter; existing
  letters keep their meaning and their generator remains executable.
- **Bank validation:** banks are data files checked by tests for IDs,
  references, address ranges, no overlaps, objectives, and reference
  solutions passing their own probes and scenarios.
- **Provenance:** real device exports and course documents stay out of the
  source tree. The public repository is an allowlisted export of tracked
  files (`tools/export-public.sh`), checked by a leak scan
  (`tools/leak-scan.mjs`) over the files and the built site. The routing
  bank's internal id `routing.class-16` is kept on purpose: renaming it
  would change permanent share codes, and it is never shown.

  Banks are separate files that a build can swap.

## 8. Targets and toolchain

- **Targets:** `targets/*.js` choose the sections, banks, start screen and
  defaults. Each target has its own entry point and staging directory, so
  builds don't overwrite each other's assets. `tools/targets.tsv` names each
  build's `.exe` and window (`NetGym.exe` and `routing.exe`).
- **Toolchain:** React 18 and Wails v2.12 stay. The old Vite 3 gets upgraded
  later, in a separate change, after checking official compatibility. No
  combined major-version jumps.
- **Web:** `tools/build-web.sh` builds the normal bundle with relative
  asset paths for GitHub Pages; it uses memory navigation like the app. The
  start screen there says it is meant for a computer and links the
  third-party notices. A single-file HTML build (everything inlined, no
  runtime requests) is later work; the phone layout is built (§6).
- **CI:** `.github/workflows/pages.yml` runs the fast tests (with the browser
  checks), builds the web version and deploys it to Pages, in that order.
  Windows `.exe` releases are a separate, later decision.

## 9. Testing and acceptance

- `tools/test.sh` stays Node's built-in runner.
- **Imports:** tests import `.js`, and esbuild bundles of the target
  manifests and test harnesses (`tests/harness/*.jsx`). The earlier routing
  trainers' grading, labels, topology and commands were frozen into fixtures
  before those trainers were retired, and are replayed without them.
- **Engine units:** parsing, longest prefix, distance, link down, return
  path, loops and coverage.
- **Golden fixtures:**
  - the 108 MikroTik command strings, re-keyed by task, variant, router,
    destination and gateway (task 15 has two routes to `0.0.0.0/0`);
  - Cisco golden strings per variant;
  - every task variant's reference routes passing their own probes and
    scenarios;
  - share-code replay;
  - bounded seed checks.
- **Rule tests:**
  - every code has a string;
  - the leak gate (§6);
  - the import-rule and `solution(` check (§5);
  - the session reducer;
  - contrast;
  - diagram geometry.
- **Browser checks** per section, rendered at 1280 × 800, at
  the two-column lower bound (960 px content) and at 200% text:
  - keyboard only, with Enter checking a row;
  - focus moves to the heading after navigation and back from the drawer,
    and is never hidden;
  - exactly one `[role=status]`;
  - targets ≥ 44 px;
  - a `TextEquivalent` beside each diagram;
  - answers absent from the DOM before reveal;
  - syntax switching keeps the task;
  - reduced motion;
  - storage unavailable.
- **Acceptance:** on Windows, the `.exe` launches offline, each section
  works, the clipboard works, and the layout holds at 125% scaling (about
  1280×760).

## 10. Not now, and risks

**Not now:** a universal lesson language; dynamic plugins; a visual task
editor; a router or CLI emulator; a workflow engine; accounts, a backend,
leaderboards, level locks or percentages; `predict` and timing in
the contract until a second tool needs them; shared fault mechanisms are now
in the contract (§3), with section policy kept local.

**Risks:**
- accidental grading changes during the migration (fixtures);
- answer leaks (the leak gate);
- seed drift (replay fixtures);
- third-party data in the code (provenance rules and the export's leak scan);
- abstractions shaped only around routing (a second, generated consumer of the contract);
- separate storage per `.exe`;
- the look changing too much for people who already use the app
  (before/after screenshots);
- `pushState` without a URL being untested in phone viewers (the in-app «←»
  doesn't depend on it). Round 6: entries carry a hash now; «←» goes back
  through the history to the start screen's entry where there is one, and
  navigates home otherwise.
