# NetGym

NetGym is a networking trainer in Ukrainian: one app with sections for IP
addressing, static routing (Cisco IOS and MikroTik RouterOS), DHCP and NAT,
network checks, firewall filtering, VLANs and device setup. Every exercise checks by behaviour (any
working answer passes), explains with hints, and shows the reference answer
only when asked. It runs offline as a Windows `.exe` (Wails) and in a browser.

**Web version:** <https://oksentukvlad.github.io/netgym/>. Under 640 px of
width it has a phone layout (one scrolling page, one-row bars with a «⋯»
sheet, a full-screen diagram); until it has been tried on a real phone the
start screen still says the web version is meant for a computer.

## Sections

| Section | What you practise |
| --- | --- |
| IP-калькулятор | a network's boundaries, mask and commands |
| IP-адреси: маска | exercises with masks and address blocks |
| IP-адреси: у бітах | address and mask bit by bit: network and broadcast |
| Маршрутизація | static routes on Cisco or MikroTik; «Знайди несправність» (find the fault) |
| DHCP і NAT | which side of the router a setting is on; what a DHCP server gives out (range, gateway, DNS; Cisco exclusions, MikroTik's DHCP Setup); what NAT changes and the rule that does it |
| Перевірка мережі | how to prove a network works and find where it breaks: which check proves a requirement, the ladder from the PC outward (ipconfig, ping, nslookup, then the router's tables), reading an output for what it does and doesn't prove |
| Фаєрвол | how a filter decides a packet's fate: input and forward, rule order |
| VLAN | access ports, trunks and a broadcast frame's path; routing between VLANs; finding faults |
| Налаштування з нуля | the order of setup commands: Cisco router and switch, MikroTik router |

Tasks can be shared by short codes such as `A3b-4821` (a task, its variant
and its addresses).

## Where you are, in the address

The web version keeps where you are in the address after `#`, for example
`…/netgym/#/dhcp?ex=server&level=2&seed=4821&syntax=routeros` or
`…/netgym/#/routing?code=A3b-4821&syntax=cisco`. So a bookmark or a link
opens that section, exercise, level, task and vendor, and Back and Forward
move between the start screen and the sections you opened.

**A refresh keeps** the section, the exercise, its level, the task (its seed
or share code) and the vendor (Cisco or MikroTik): those are in the address.
Your work is kept separately, on the device (next section). The Windows app
keeps it only until it closes.

A link's vendor becomes the vendor for the whole session. A link with
values NetGym doesn't know (`#/dhcp?ex=zzz&level=99`) opens the section at
its start, with your own vendor; an unknown section opens the start screen.
Opening a link puts the start screen behind it, so Back (or «← Розділи»)
reaches the start screen. The Windows app runs the same code: it has no
address bar or refresh, and «←» and the mouse back button work as before.
Each section's keys are listed in its `src/sections/<id>/screens/url.js`.

## What is saved, and where

The web version keeps your progress in this browser's `localStorage`, on this
device only. Nothing leaves the browser: there are no accounts and no sync,
and another browser or phone starts empty.

- **Saved:** answers, typed text not yet checked, checks and verdicts, hints
  used, reveals and ✓ marks, per task; the theme, the vendor, the routing mode
  and the input mode; where each section was, so it opens at your last task.
- **Not saved:** the command lines you type in «Налаштування з нуля», because
  they can hold a password. After a refresh those lines come back empty.
  The exercise asks for an invented training password: never type a real one.
- **What comes back:** the same screen, including a wrong verdict. A task you
  revealed comes back revealed and earns nothing; a ✓ earned before the reveal
  stays. Folds and open menus are not saved.
- **The first view:** the plain address still opens the start screen. A link
  wins over what's saved: it opens its own task, and a link without a vendor
  keeps yours.
- **Limits:** about 1 MB. Past that, unfinished tasks you touched longest ago
  go first, then finished tasks shrink to their ✓ (at most 5,000 kept). The
  task you're on is spared until then; it goes only if that still isn't
  enough, and after it the oldest ✓. A checked VLAN task can take up to
  200 KB, so only a handful of those are kept whole. Private mode or a full
  storage means no saving, silently; the app works as it would without it.
- **When:** about half a second after a change, and when the page is hidden
  or closed. A browser that kills a tab without warning can lose the last
  half second.
- **«Почати спочатку»:** at the bottom of the start screen, once there is
  something to clear. After a confirmation it erases answers, marks and places
  on this device, in every open tab; settings stay.
- **If a section fails to open:** it says so in one line, with a way back to
  the sections and, on the web, «Почати спочатку». The bar above stays usable.
- **Windows app:** saves nothing. Its storage in WebView2 is a separate
  decision; if it ever saves, the clear control moves with it.

The keys are `netgym.v2` (the data) and `netgym.gen` (the reset generation).
A load removes the older `netgym.v1`, which could hold typed passwords, and
the progress in it with them.
A saved task comes back only if its identity still matches the current bank
revision, record and generator version and its contents pass its section's
check (`src/sections/<id>/screens/saved.js`). Anything else is dropped alone
and that task starts fresh. Change `VERSION` and `KEY` in `src/app/saved.js`
whenever what's saved changes meaning, and add the old key to `OLD_KEYS`.
A section's `redact` (setup's) runs on every write, before anything is
serialised. A bumped generator version, bank
revision or record version already retires its saved tasks by itself.

## Layout

- `src/targets/<id>.js`: one manifest per build (`netgym`, and `routing` for
  routing alone). `tools/targets.tsv` maps each target to its `.exe` name and
  window title.
- `src/app/`: the shell (start screen, top bar, in-memory navigation), saving
  (`saved.js`, web only), the
  app store and its provider.
- `src/ui/`: generic components, design tokens, `useExercise`, session state.
- `src/engine/`: pure logic (IP maths, forwarding, vendor syntax, VLANs,
  firewall evaluation).
- `src/sections/<id>/`: `logic/`, `screens/`, `syntax/` and `uk.js` per section.
- `src/banks/`: task records, chosen by the targets.
- `shell/`: the Wails v2 project every target is built in.
- `tests/`: Node's built-in test runner; `tools/`: build, test and export scripts.

[`ARCHITECTURE.md`](ARCHITECTURE.md) describes the design: the exercise
contract, engines, dependency rules, the no-answer-leak rule and share codes.

## Build

The frontend needs Node 24 and `npm ci` in `shell/frontend`.

**Web version** (no Go or Wails needed):

```bash
(cd shell/frontend && npm ci)
tools/build-web.sh            # → dist/pages/ (or: tools/build-web.sh <dir>)
```

The output uses relative paths, so it can be served from any subpath. It
also contains `LICENSE.txt`, `THIRD_PARTY_NOTICES.md`, `OFL.txt` and
`third-party-notices.html`, linked from the start screen.

**Windows `.exe`** (cross-built on Linux with the Go and Wails versions the
project pins):

```bash
tools/setup.sh                # once: Go 1.23.4 and Wails v2.12.0 into .tools/
tools/build.sh                # every target → dist/*.exe
tools/build.sh netgym         # or one target
```

The builds are unsigned, so Windows shows "Windows protected your PC" →
More info → Run anyway.

## Tests

```bash
(cd shell/frontend && npm ci && npx playwright install chromium)
tools/test.sh                 # fast: logic, screens, contracts, browser checks
tools/test.sh --full          # before merging: adds the historical cases and the 200-seed sweeps
```

- Fast mode keeps every task, variant, vendor and level combination, all
  fixtures and one live optimiser pass over every variant; it samples
  repeated seed sweeps with fixed witnesses. `NETGYM_TEST_SEEDS=N` widens the
  samples. Full mode also runs `tools/step9-sweep.mjs` and
  `tools/vlan-sweep.mjs`.
- Target manifests and `tests/harness/*.jsx` are bundled with esbuild into
  `.test-bundles/`. Test files run in up to three Node processes
  (`NETGYM_TEST_JOBS=1` runs them one by one); the mounted helpers in
  `tests/helpers/mounted-*.mjs` run alongside, each with a timeout.
- A worktree runs one suite at a time (a lock in `tools/.test.lock`; a second
  run exits 75). After changing the runner, run
  `python3 tools/test-runner-checks.py`.
- Browser checks use Playwright as pinned in `shell/frontend` and its
  Chromium (`tools/browser.mjs`). A missing browser fails them; locally,
  `NETGYM_ALLOW_NO_BROWSER=1` skips them instead. CI never skips.
- Only top-level `tests/*.test.mjs` files are discovered. A new sweep script
  or mounted helper must be registered in `tools/test.sh` (and given a fixture
  in `tools/test-runner-checks.py`).
- Some routing fixtures (`tests/fixtures/routing-*-34ee9ac.json` and the
  route-command fixtures) freeze the grading and output of the earlier
  routing trainers; they are replayed, never regenerated from current code.

## Publishing

This repository is published from a private working repository by
`tools/export-public.sh`: it exports an explicit allowlist of tracked files
from one commit, removes stale files, and runs the leak scan
(`tools/leak-scan.mjs`, reviewed exceptions in
`tools/leak-scan-exceptions.tsv`) over the files and the built site.
`.github/workflows/pages.yml` tests, builds and deploys the web version on
every push to `main`.

## Credit

NetGym розвиває навчальні застосунки попереднього автора, зберігаючи частину
коду, маршрутних задач і схем.

(NetGym develops the training apps of an earlier author, keeping part of
their code, routing tasks and diagrams.)

## Licence

NetGym's own code is under the [MIT licence](LICENSE), © 2026 Vlad Oksentiuk.
Third-party parts keep their own licences, listed with their full texts in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md):

- the Nunito font (`shell/frontend/src/assets/fonts/`): SIL Open Font
  License 1.1, with its `OFL.txt`; it is not under the MIT licence;
- React, React DOM and scheduler, bundled into the builds: MIT;
- the Wails v2 template parts and Windows packaging assets (`shell/`): MIT;
- the Go modules compiled into the `.exe` and the build and test tools, each
  under its own licence.

## Roadmap

- Worked examples and clearer wording in routing, VLAN and firewall tasks.
- A better first-run experience for the setup decks.
- Phone layouts for the web version: built (round 6); a hand run on a real
  phone comes before the start screen's note changes.
- A checker for RouterOS `/export` files, once real exports are available
  for its fixtures.
- Windows `.exe` releases are a separate, later decision.
