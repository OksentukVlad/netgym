# RF-1 frozen plantings and generator version 3

Round 4 stage 2a, 2026-11-01: level 1 now draws only from tasks 1 and 2
(two editable routers), with `missing-route` and `wrong-destination`.
Tasks 4, 5, 12 and 14 are level 2 only; level 3 is unchanged. Task 3 is
still excluded by the existing public-policy eligibility gate. The specific
routes at level 1 are all /24; task 2 retains its required default route and
its explicitly visible internet requirement.

Both frozen mirrors were regenerated with `node tools/freeze-faults.mjs`.
All seven placements and 92 candidate gates/observations are unchanged;
only the generator version, exact record inputs and source hash changed.
Generator-2 serialized RF instances are rejected on restore; start a fresh
instance. `create`, `check`, snapshot, trace and solution shapes stay compatible.

## Historical generator-2 implementation and measurements

RF-1 identities now carry `generatorVersion: 2`. The same seed intentionally
produces a different public task than version 1. RF-1 rejects version-1 saved
instances during restore; start a new task. Static routing's generator, the
screen API, and runtime answer checking are unchanged.

Version 1 renumbered a routing task, performed its full acceptance checks, and
searched competing single-edit explanations for every candidate on each fresh
`create`/`inspect`. On this host variant 9 took about four seconds. Version 2
freezes the accepted seed-0 placement and **all** candidate gate results for each
of the seven admitted variants, including the three rejected candidates. No
acceptance or competing-repair search runs during `create` or `inspect`.

For each requested seed, the generator selects a variant and site using the
existing seeded selection rules. It translates that variant's template by a
seeded XOR within each of the three private address pools. The offline tool
reserves the low bits through every subnet and every wrong-destination
increment's highest changed bit. Consequently:

- Host offsets, prefix lengths, containment, common enclosing prefixes, and
  neighbour relationships remain identical.
- Every `dst + blockSize` planting commutes with the translation, including
  carries. Candidate order, duplicate-destination exclusions, competing repair
  explanations, ambiguity, and acceptance therefore remain identical.
- The translation is a bijection over the entire address space (identity outside
  the private pools). It preserves whole-prefix coverage and unknown-space
  safety as well as sampled pings.

This retains seeded address variation; seeds do not cycle through a small
finite list of prebuilt networks. The private LAN pool for each variant is
fixed by its template; version 2 varies addresses within that pool. Generic
routing's existing renumbering algorithm and its retries are unaffected.

The injected routing bank exports `faultsFrozen` from `faults-results.js`;
`faults-results.json` is the readable mirror. Section logic imports no banks. The table contains placements, masks, exact bank inputs, gate facts,
and complete original observations. Private inspector observations and evidence
signatures are detached, enumerable, memoized getters: reading all diagnostics
still uses no live gate searches. No table, candidate, baseline, or gate metadata
is attached to a public learner task.

Runtime compares exact bank/record/optimiser inputs on every invocation and
checks the complete candidate-key sequence. Staleness throws
`stale-faults-table`; there is no live-analysis fallback. Tests additionally
verify a SHA-256 over the transitive logic sources, so code changes require
regeneration even when record versions were not updated. Both generated files
must agree. Regenerate from the repository root:

```bash
node tools/freeze-faults.mjs
```

The generator runs the original static routing placement acceptance and live
fault analysis for every template. It writes both files only after all variants
succeed. The committed generated modules remain available while regenerating.

`tests/rf1-frozen.test.mjs` checks source/input staleness, original live/template
equality (fast: task 1 and task 9; full: all seven templates), mask algebra for
all possible salts, versioned restore and isolation. The RF-1 sweep compares
**every** translated candidate's faulty routes, complete walks, signatures,
visible causes, gates and acceptance against independent live analysis (fast:
deterministic seed witnesses; full: all seven variants × seeds 0–199), then
runs the existing repair, requirement, level/cause and site checks. This
comparison materializes every inspector diagnostic.

Performance commands (no bundling or warm analysis cache):

```bash
node tools/rf1-bench.mjs --output .test-bundles/rf1-create/after.json
node tools/rf1-bench.mjs --all --output .test-bundles/rf1-create/all-seeds.json
tools/test.sh
tools/test.sh --full
```

The default benchmark measures 20 seeds per level, plus fresh inspector seeds
100–119, complete inspector materialization, faulty and repaired checks, and
cause options after a passing check. `--all` measures `create` and `inspect`
for every level × seed 0–9999 and fails if any call reaches 100 ms. These are
host wall times; Windows/classroom hardware needs separate verification.

## Measurements (2026-10-30)

Node 24.20.0, measured directly from `src` on this host. Each table cell is
median / maximum milliseconds over 20 fresh seeds. Creation uses seeds 0–19;
inspection uses 100–119. No live-analysis cache is populated by version 2.

| Level | Create v1 | Create v2 | Inspect v1 | Inspect v2 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 458.35 / 1005.31 | 1.96 / 18.40 | 518.86 / 1040.75 | 1.97 / 2.45 |
| 2 | 394.99 / 954.00 | 2.07 / 3.50 | 635.75 / 1028.43 | 1.98 / 4.49 |
| 3 | 3863.17 / 4139.18 | 3.29 / 4.77 | 3835.20 / 4243.97 | 3.07 / 4.43 |

Fully materialized inspection (all walks and evidence signatures, seeds 0–19):

| Level | Median / maximum, ms |
| --- | ---: |
| 1 | 4.42 / 11.95 |
| 2 | 4.16 / 7.36 |
| 3 | 23.24 / 37.80 |

The exhaustive performance scan completed all **60,000** calls (three levels ×
10,000 seeds × create/inspect), with **zero calls >= 100 ms**. Its overall
maximum was **27.74 ms**. Per-level maxima:

| Level | Create max, ms | Inspect max, ms |
| --- | ---: | ---: |
| 1 | 19.16 | 7.54 |
| 2 | 10.96 | 12.97 |
| 3 | 26.24 | 27.74 |

Across the 20-seed samples, the largest initial/repaired `check` was 70.88 ms
before and 91.55 ms after; cause `options` peaked at 1.45 ms before and
1.14 ms after. Neither exceeded 100 ms. Runtime checking is unchanged.

The original fresh variant-9 creation spent 136.37 ms in routing placement /
acceptance and 3,968.43 ms in fault analysis. The other six variants spent
6.01–52.06 ms in placement and 30.61–861.87 ms in fault analysis.

The runtime frozen JS is **568,227 bytes (554.9 KiB)**; the readable JSON
mirror is **1,329,389 bytes (1.27 MiB)**. Combined generated data: 1,897,616
bytes. The seven templates contain 92 candidates: 89 accepted and three
symptom-gate rejections.

Focused fast RF-1 verification: **42 passed**, no failures, 29.81 s.
Full RF-1 verification: **42 passed**, no failures/skips, **2,373.03 s**
(39m 33s). It checked all seven original templates, all seven translated
variants × 200 seeds, **18,400 sites** (17,800 accepted, 600 symptom-gate
rejections), 1,400 canonical checker calls, all 22 variant/cause combinations,
57 behaviour classes, **8,800 independent repairs**, and **3,400** sampled-only
coverage rejections. The exhaustive sweep body took 2,328.61 s; live analysis
accounted for 1,221.90 s, repairs/requirements 954.75 s, level checks 147.89 s,
and site assertions 3.99 s.
