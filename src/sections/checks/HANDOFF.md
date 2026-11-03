# Checks logic handoff — spec v2.1 / build brief v1

Sol's logic (178bfb8), integrated in 5e13f70 and repaired after Astra's
review (logic-astra-1) by Opus: see «Repair after review» at the end.

## Spec coverage

| Item | Implementation / decision |
| --- | --- |
| Observable probes | `probes.js`: E4 allocation/route lookup/NAT plus the routing engine's request/reply forwarding. Host mask chooses direct versus gateway delivery before forwarding. Source address/interface and protocol are explicit. |
| Responses and services | Link down, unknown neighbor, no route, unresponsive host, independent return routes/links, ICMP Echo filtering, separately filtered/routed TTL replies. DNS forward/PTR answers, NXDOMAIN, wrong answer, timeout. SSH/HTTP/DNS only succeed after network delivery and service availability. HTTP includes DNS-created NAT state. |
| Outputs | All frozen Windows, Cisco and RouterOS command profiles; <=40 columns and <=10 lines. Three TTL slots, <=4 hops; full four-column IOS NAT semantics; RouterOS 7.16 taught flag subsets and lowercase `s` connection state/reply tuple. See FORMAT-SOURCES.md. |
| C1 L1 | Ten fault forms: all seven E4 faults, disconnected adapter, static wrong mask, static wrong gateway. Fixed four-rung order, Next always advances, final Stop only, separate stop/place verdicts, folded next output on an early healthy stop. |
| C1 L2 | Arbitrary offered rung and parsed argument, SSH/HTTP, router interfaces/addresses/routes/bindings/NAT/ping. Optional routing-bank adapter for chosen existing topologies, with actual bidirectional forwarding and observed tracert. Alternative checks are not penalized. |
| C1 ambiguity | `acceptedPlaces(collectedEvidence)` takes no scenario or fault ID. It retains address/gateway ambiguity after a failed gateway ping; exit covers route/NAT/return ambiguity. A DNS timeout retains DNS and the path to that resolver. “more” always passes the place step. This is broad investigation-place grading, not root-cause grading. |
| C2 | Ten templates: seven Windows at L1, three vendor-specific router templates at L2. Seed chooses outcome; addresses are renumbered by default. Three templates (30%) are insufficient, including a literal empty evidence set for DNS inferred from IP ping. Wrong DNS answers still count as answers. |
| C3 | Six independent requirements, one per task, 3–4 options carrying expected results. PC address includes router binding confirmation; remote response is a specific destination; authenticated LAN SSH; named page; every VTY / IP Telnet plus MAC-Telnet; fresh login before disabling the old account. |
| R4 | `ladderExample`, `claimExample`, `proofExample`: separate 192.0.2/24 and 198.51.100/24 values, graded by the same functions. No learner answer is prefilled. |
| Ukrainian | All learner-facing Ukrainian is in uk.js. Terminal excerpts remain English. No source-sheet identity or real values enter content. |
| Screens/links/codec | Unchanged, as assigned. Required order/default and link destinations are listed below. No shared-helper implementation change was necessary. |

## Integration issue: existing dependency gate

`tests/imports.test.mjs` currently forbids **every** cross-section import.
This conflicts with this brief's explicit instruction to import and reuse
DHCP logic. Required, deliberate imports are:

- `checks/logic/probes.js` -> `dhcp/logic/client.js`, `faults.js`, `nat.js`;
- `checks/logic/outputs.js` -> `dhcp/logic/client.js`.

Do not hide the failure or duplicate the allocator/NAT implementation to
satisfy the gate. Claude needs to resolve the shared contract during
integration: either a narrow documented checks-to-these-DHCP-logic exception,
or extraction of reusable allocation/lookup/NAT/scenario primitives into
`src/engine/` with unchanged DHCP behavior. The latter is a shared-helper
change outside this worktree's assigned scope. No dependency gate was weakened
in this task. Everything else in this worktree stays within the brief.

## Integration issue: complete generator range registration

The existing R4 gate in `tests/example-reservation.test.mjs` inventories every
module importing `makeRng`; new generators must appear in the shared
`tests/helpers/example-range-proofs.mjs` registry. This task does not edit
shared helpers. Ready-to-register, SHA-256-pinned entries for `probes.js`,
`claims.js`, `proofs.js` are in `range-proofs.json`, with complete interval
reasoning. Claude should append those three records to the shared registry
(or import/spread the JSON there). Their learner ranges exclude both R4
blocks; explicit `example=true` branches are separate demonstrations, as in
the existing DHCP fault proof. A routing adapter only consumes a caller's
already-validated bank record; it does not allocate a new range.

Until registration, the existing reservation test correctly fails with
“new generator needs a complete range proof”. Do not infer that registration
has passed from the new focused tests.

## Screen contract

All functions are named exports. No React, DOM, state store or URL code lives
in these files. Vendor input accepts `cisco`, `routeros`, `mikrotik`; generated
tasks normalize RouterOS to `vendor: 'mikrotik'` (as E4 does).

Required exercise order is `proof`, `ladder`, `claims`, with `proof` the
default. URL codec keys assigned to the screen writer are `ex`, `level`,
`seed`; `ex` values are those three strings. Fault links open
`#/checks?ex=ladder`; setup checkpoint links open `#/checks?ex=proof`.

### probes.js

Exports: `version`, `l1Faults`, `l2Faults`, `createScenario`, `clientState`,
`networkState`, `probe`, `dnsLookup`, `httpFetch`, `traceRoute`,
`createRoutingScenario`.

- `createScenario(seed=0, {level=1, vendor='cisco', faultId,
  otherAddresses=false, example=false}={})`.
- `clientState(s)` -> address, prefix, gateway, dns, acquired/reason,
  linkUp, dhcpEnabled, dhcpServer, interface, leaseObtained.
- `networkState(s)` -> `{net,routes,client,pcId}`.
- `probe(s, {source='pc',destination=s.remoteIp,service,protocol,ttl=64,
  slot=0}={})`. Source can be `'router'` (WAN) or `{address,interface}`.
  Protocol defaults to TCP for SSH/HTTP, UDP for DNS, ICMP otherwise.
  It returns `{source:{address,interface},destination,protocol,service,
  onLink,nextHop,delivery:{request,reply,ok,restored?,lastLeg?},natState,
  outcome,ok,reporter,ttlReply?}`. `delivery.ok` is network delivery;
  service outcomes remain separate (`denied`, `refused`, `timeout`,
  `host-key`, `http-error`). A NAT entry is `{protocol,inside,outside,remote}`;
  each endpoint is `{address,port}` (ICMP uses an identifier).
- `dnsLookup(s,name=s.websiteName)` -> source/protocol/delivery/NAT plus
  resolver, resolverName, name, address, optional answerName for PTR,
  outcome `answer|wrong-answer|nxdomain|timeout`, ok. `wrong-answer` is a
  successful DNS transaction whose answer differs from the trusted record.
- `httpFetch(s,name=s.websiteName)` -> probe shape plus name/dns, aggregated
  DNS/HTTP NAT entries (a literal IP skips DNS); outcome `ok|http-error|dns-failure|refused|timeout`.
- `traceRoute(s,destination=s.remoteIp,{maxHops=4}={})` ->
  `{destination,hops:[{ttl,address,slots:[probe,probe,probe]}],ok,outcome}`.
  A slot may be `ttl-expired`; TTL replies have their own return route and
  filtering, independent of forwarding. Earlier responders remain visible when
  a later hop cannot forward. More than four requested hops errors.
- `createRoutingScenario(recordOrNetwork,routes,{seed=0,vendor='cisco',
  pcId,destination}={})` -> a routed scenario for an existing topology.
  `routes` are configured rows; `network.supplied` preserves supplied return
  routes. Choose a topology with at most four observed hops for this profile.
  Custom routed LANs do not invent NAT or DNS. The standard router-WAN ping,
  bindings, NAT and address rungs are omitted on this adapter; interfaces and
  routes refer to the source PC's actual attached router.

Scenario controls for fixtures are explicit: `linkUp`, `staticClient`,
`icmpFilters` (Echo), `ttlSilent`, `ttlSilentSlots` (zero-based slot indices),
`ttlReturnBlocked`, `returnPath` (upstream replies), `returnRoutes`,
`returnDownLinks`, `downLinks`, `dnsMode`, `dnsRecords`, `reverseRecords`,
`hosts[address]` (responds/ssh/http/dns), `services`. Optional `leaseStates`,
`interfaceStates`, `addressStates` feed explicit teaching table states;
failed allocation never fabricates a waiting lease. No method mutates input.

### outputs.js

Exports: `profile`, `terminal`, `lineIds`, `ipconfig`, `ping`, `tracert`,
`nslookup`, `ssh`, `http`, `interfaces`, `addresses`, `routes`, `bindings`, `nat`.

`ipconfig(scenarioOrClientState)`, `ping(probe,vendor='windows')`,
`tracert(traceRouteResult)`, `nslookup(dnsResult)`, `ssh(probe,user='netadmin')`,
`http(httpResult)`, `interfaces(s,vendor=s.vendor)`, `addresses(s)` (RouterOS),
`routes(s,vendor=s.vendor)`, `bindings(s,vendor=s.vendor)`,
`nat(entries=[],vendor='cisco')` return:

```
{ command, lines: [{id,key,text}], text }
```

`command` is a caption. Every output is at most ten lines of forty characters.
Each `key` is semantic; wrapped lines have distinct IDs (`result`, `result:2`).
`terminal(command,[[semanticId,text],...])` wraps and errors on overflow or
duplicate IDs, without silently clipping text. `lineIds(output,[keys...])`
returns every matching physical line ID. NAT displays the most recent flow;
`runRung(...,'nat',...)` keeps all collected entries in `result.entries`.
Tappable lines need >=44px height and monospace `pre-wrap` in the screens.

### ladder.js

Exports: `id`, `version`, `generatorVersion`, `fixedRungs`, `placeIds`,
`createLadder`, `parseArgument`, `rungs`, `runRung`, `acceptedPlaces`,
`startLadder`, `advance`, `chooseRung`, `stopLadder`, `canAdvance`,
`gradeStop`, `placeChoices`, `ladderExample`.

- `createLadder(level=1,vendor='cisco',seed=0,options={})` ->
  `{id,version,generatorVersion,level,vendor,seed,scenario,task}`. Options are
  scenario options above or `routing:{record,routes,pcId,destination}` at L2.
- `rungs(task)` -> `{id,command,target,label,argument,place}` descriptors.
  IDs: `config,gateway,remote,dns`; L2 adds `trace,ssh,http,interfaces,
  addresses` (ROS only), `routes,bindings,nat,routerPing` (standard topology).
  `place` is `pc|router`; `argument` says whether to show the one argument field.
- `parseArgument(text)` -> `{ok:true,kind:'ip'|'name',value}` or
  `{ok:false,code:'argument',text}`. No whole-command typing. A valid name that
  cannot resolve produces collected DNS-failure output, not a syntax error.
- `runRung(task,id,argument?,collectedEvidence=[])` -> executed row
  `{ok:true,id,target,command,output,result,facts,expected,folded}` or an error
  `{ok:false,code,text}`. `ok` here means execution/argument success, **not** a
  successful network result. Render `output` and `folded`; do not render
  private `result`, `facts`, `expected` as diagnostic answer rows.
- `startLadder(task)` -> `{index,stopped,evidence}`. L1 starts with config;
  L2 starts empty. `advance(task,state)` returns the next L1 state even after
  an unexpected result, unless stopped/final. `canAdvance` controls Next.
  `chooseRung(task,state,id,argument?)` appends an L2 observation, or returns
  an error without altering the original state. `stopLadder(state)` stops.
- `acceptedPlaces(evidence)` -> place IDs from **only collected** observations.
  Fixed IDs: `link,address,gateway,exit,dns,more`; `service` becomes available
  at L2 after a service observation. `placeChoices(evidence,level=1)` returns
  `{id,text}` labels; it deliberately does not reveal accepted answers.
- `gradeStop(task,evidence,placeId)` ->
  `{ok,stoppedAtEarliest,placeAccepted,acceptedPlaces,
  earliest:{id,command,index}|null,foldedNext,text}`. Feedback independently
  names the earliest unexpected output and whether the stop was there.
  L1 computes the full fixed sequence only for feedback after Stop; unrun
  results never change accepted place choices.
- `ladderExample({vendor='cisco'}={})` -> `{context,note,task,evidence,
  rows:[{id,folded,output,stopped}],answer:{stop,place},result}`.

### claims.js

Exports: `id`, `version`, `generatorVersion`, `templates`, `verdictIds`,
`createClaim`, `checkLines`, `checkVerdict`, `verdictChoices`, `claimExample`.

`createClaim(level=1,vendor='cisco',seed=0,{templateId,outcome,
otherAddresses=true,example=false}={})` ->
`{id,version,generatorVersion,level,vendor,seed,templateId,claim,outputs,
lines,expectedLineIds,verdict,explanation}`. `outputs` supports the dual
ping/SSH observation. Flat `lines` have globally unique IDs (`0.result`,
`1.result` for dual outputs) and `outputIndex` for grouping.

Template IDs: L1 `dhcp-used,gateway-dhcp,reply,dns-from-ping,dns-answer,
ssh-login,icmp-service`; L2 `binding-options,route-choice,nat-state`.
Verdict keys: `yes,no,insufficient`.

`checkLines(task,selectedIds)` checks exactly the expected set, order-free.
**“жоден рядок” submits `[]`**, not a special line ID. Duplicate/unknown IDs
fail. `checkVerdict(task,verdictId,selectedIds)` requires step one to pass,
and returns `{ok,linesOk,code,text}`. `verdictChoices()` supplies labels.
`claimExample({vendor})` -> `{context,task,answer:{lines,verdict},result}`.

### proofs.js

Exports: `id`, `version`, `generatorVersion`, `requirementIds`, `createProof`,
`checkProof`, `proofSet`, `proofExample`.

`createProof(seed=0,{vendor='cisco',requirementId,example=false,
otherAddresses=false}={})` ->
`{id,version,generatorVersion,seed,vendor,requirementId,requirement,
options,correctOptionId,explanation}`. IDs are `address,remote,ssh,http,
telnet,login`. Options are shuffled `{id,place,command,expected,label,evidence}`.
Evidence is structured where multiple results/config scopes are necessary.
The `address` label includes binding confirmation; `telnet` includes every
VTY range or both IP Telnet and MAC-Telnet. The label is the complete tap
choice, including place and outcome.

`proofSet(seed,options)` returns six independent requirement tasks in fixed
order. `checkProof(task,optionId)` -> `{ok,code,text}`.
`proofExample({vendor})` -> `{context,task,answer:optionId,result}`.

### uk.js

Exports: `section`, `modes`, `ui`, `places`, `verdicts`, `ladder`, `claims`,
`claimNotes`, `proofs`, `examples`. `modes` insertion order is the required
segmented control order. UI, guidance, task, argument error, verdict, folded
rung, requirement and worked-example text is centralized here.

## Verification and remaining work

Measured final runs (3 November 2026):

- `node --test --test-isolation=none tests/checks.test.mjs`: **32/32 pass**,
  **0.52 s** wall time (474.85 ms Node test duration). Includes all 52
  template/outcome/vendor truth-table combinations.
- `tools/test.sh` (fast, no full run): **exit 1, 125.94 s** wall time.
  All eight mounted helpers pass (**2,275 assertions**). The checks tests
  also pass in the runner. There are eight observed failures before the
  runner stops its remaining shard: the shared-import gate, the unregistered
  generator-range proof, and six existing browser/localhost checks blocked
  by the restricted execution environment. This is not a green full fast run.
- Proposed range-registration dry check: 20 RNG users covered; all 24 combined
  source hashes and documentation-block interval exclusions pass. The shared
  registry remains unchanged.
- `node --check` for every new JS module and the test file: pass. Source
  review/whitespace checks and all three proposed range-proof hashes: pass.

Logs are preserved in ignored project storage:
`.test-bundles/checks-focused.log`, `.test-bundles/checks-fast.log`, and the
runner's `.test-bundles/shard-*.stdout` / `stderr` files.

`tests/checks.test.mjs` is
self-contained and discovered automatically by `tools/test.sh`. It covers
all outputs and vendor outcomes, source/interface/protocol, no-gateway local
delivery, routing return failure, ICMP/SSH, TTL silence, DNS and service
outcomes, all claim truth-table outcomes/lines, evidence-derived places,
progression/arguments, renumbering, and all three R4 examples.

The fast suite's shared-import and generator-proof gates need the integration steps above.
In this task's restricted execution environment, existing browser tests also
fail because localhost listen is denied (EPERM) and Chromium aborts with
sandbox_host_linux.cc “Operation not permitted”. Browser checks need a run
in the normal project runtime. Screens, mounted checks for those new screens,
and real Windows/RouterOS session validation remain for the assigned next
stages. No full suite, commit, push, build distribution or publish was run.

## Repair after review (Opus, round 7 brief v1)

- **Observation scope.** `facts.scope` comes from the probe's source,
  destination and protocol, not the rung: a PC ICMP probe is `gateway` (the
  PC's own gateway), `local` (another on-link address) or `remote`; a
  router-originated one is `router` or `router-lan`. SSH and tracert carry
  the same `reach`. Router tables have facts too (`routes`: a route covers
  the remote address; `interfaces`: all up; `bindings`: a bound lease in the
  LAN; `nat`: empty only matters after the LAN answered and traffic went
  out), with their own `places`.
- **Requirements.** `requirements(task)` and `requirementLines(task)` are what
  the screen shows before the first output: LAN network/prefix and gateway,
  the trusted DNS record, and at L2 what must work (`checks`: remote, http,
  ssh; routed topologies: remote). `ipconfig` is compared with network,
  prefix and gateway; `nslookup` with the record only (a name without a
  record expects any answer, NXDOMAIN included).
- **«Усе працює».** `gradeHealthy(task, evidence)` → `{ok, missing,
  earliest, text}`; L2 only; ok when nothing collected is unexpected and every
  listed requirement has its own successful observation.
- **NAT.** ICMP keeps one identifier on every endpoint (no port 0). RouterOS
  prints `address:port` for TCP/UDP and `icmp-id=` for ICMP. The NAT rung
  collects tracert slots' entries and the DNS queries of named targets.
- **Names.** `parseArgument` returns `code: 'argument-length'` above
  `maxName` (63) characters instead of overflowing an output.
- **Imports.** The checks → DHCP exception names `client.js`, `faults.js`,
  `nat.js` only, tested both ways in `tests/imports.test.mjs`.
- Fixtures: `tests/checks-repair.test.mjs`.

## Screens (Opus, round 7 brief v1, part 2)

`screens/ChecksScreen.jsx` (the bar's exercise and vendor switches; a link's
route `ex` opens its exercise once), `ProofView.jsx` (C3), `LadderView.jsx`
(C1), `ClaimsView.jsx` (C2), `Options.jsx`, `Terminal.jsx`, `url.js`
(`ex`, `level`, `seed`, `syntax`), `seeds.js`, `focus.js`, `checks.css`.
Links in: DHCP E4 and routing «Знайди несправність» («як це перевіряють на
ПК →», `ex=ladder`), the setup decks' script after a pass («далі: перевір, що
працює →», `ex=proof`). Tests: `tests/checks-mounted.test.mjs` with
`tests/helpers/mounted-checks.mjs`, codec cases in `tests/url.test.mjs`; gate
recipes `checks-*` in `tools/shots.mjs`.

## Deferred

- **C1 level 2 on the routing topologies** (spec v1 «Topologies: the routing
  topologies, with tracert»). The logic supports it (`createRoutingScenario`,
  `createLadder(2, …, { routing })`), but the screen would need a routing bank
  wired through the target. Level 2 uses the standard one-router network only;
  `tracert -d 8.8.8.8` there is harmless but low-value. Fable accepted the
  deferral for round 7 (screens-fable-1).
