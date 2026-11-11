# CHANGES

## Phase 0 — Baseline (no behaviour change)

Baseline of the untouched code (`npm test`, Node 22, 81 tests): run 1 passed 81/81 in 182 s.

Flakiness found while recording the baseline (the plan expected this, see B9). Run 2 ran while other CPU-heavy work was active and failed 2 old tests: `S9: plans count, budget presets, flex default, seed lock and digits` (plan sets differ between runs with a locked seed) and `exactness: capacity equals brute-force oracle on 500 random instances` (`exact:false` under load). Both passed in the clean runs. Both are wall-clock dependent in the current solver; they should be run on an otherwise idle machine until Phase 3 removes the time dependence.

The first version of the B6 repro was itself flaky (seed 20 sometimes gets solved within budget). It now loops planted medium seeds 1..40 at 800 ms and stops at the first failure.

Repros added in `tests/repro.test.mjs`, wrapped in `knownFailing(...)` (they pass only while the bug still reproduces):

- B1 four default locations should give four distinct visits (current solver returns 5 rows with repeats)
- B2 a single contracted location should be visited exactly once (ratio split breaks this)
- B4 the engine has no derived `totalRequested()`
- B7 a repeat wins over an unvisited location on some seeds (1 of 40 seeds, instance in the test)
- B6 planted medium instances, seeds 1..40 (added in Phase 1 once the generator existed): seed 20 gave `search_exhausted` with 0 of 12 visits placed in most runs, although a full plan is known to exist

Fixture SHA-256 (hard-coded in the guard): `c432725086ca25b63e1437a355efca0de597b4f2e30532c68f972b4ce296526a`

## Phase 1 — Judge, planted generator, guard

Added:

- `tests/judge.mjs`: independent validator written from the spec. It imports only `createFromSaved` and `DAYS` from `engine.js`. It already understands the v3 model (`visits`, `repeat`, `maxExtra`, `extraVisits`, `oneVisitPerMember`) with the spec defaults for saves that lack those fields.
- `tests/planted.mjs`: `planted(seed,'small'|'medium')`, builds a valid plan first, then adds constraints that plan satisfies. Exports `SMALL_N=300`, `MEDIUM_N=150`.
- `tests/judge.test.mjs`: T-JUDGE-0 (all 300 small and 150 medium planted plans pass the judge, 60 also pass the current engine checker), T-JUDGE-1 (8 mutation kinds rejected by both judge and engine checker, each applied at least 10 times), T-JUDGE-2 (500 valid and mutated plans, judge and engine checker agree).
- `tests/guard.test.mjs`, `tests/MIN_TESTS`, `tests/PHASE`.

Deliberate phase split for T-JUDGE-1: the two mutations that depend on the new data model (a location visited beyond its `visits`, and a violated `repeat.people`) are checked against the judge only in Phase 1, because the current engine checker has no per-location `visits`. They must be added to the engine-checker assertion when Phase 2/3 introduces the model.

The judge tests were verified to fail when the judge is weakened (rest check disabled, pair rule disabled).

The engine checker was not changed: it missed none of the tested violations.

The guard gates three checks by `tests/PHASE` so the suite stays green: removed-UI-control check (phase 5), B4 repro allowance (phase 2), all repros (phase 3).

## Phase 2 — Data model, migration, totals (engine only)

Engine: per-location `visits` (0..7), `repeat {people, days}`, `maxExtra` (0..6); `extraVisits` (0..10), `oneVisitPerMember`, `migrationNote`. New functions `totalRequested()`, `setTypeVisits(type,n)` (accepts `main`, `contracted`, `cont`), `normalizeVisits()` (returns `{key:'visitsRaisedForGoals',locId,n}` entries; also applied on load). Saves are written as `v:3`. The storage key `visitplan.v2` is unchanged.

Migration of a pre-v3 save: `visits = max(1,minWeek)`, capped at 1 when the effective dup mode is `banned`; `repeat.days='same'` when the effective dup mode is `merged` (location setting first, then the global one); `repeat.people='different'` only when the global people policy was `different`, otherwise `any` (keeps old behaviour); `oneVisitPerMember = (dup.people==='all')`; `extraVisits=0`; `migrationNote={oldVisits,newTotal}` only when the old total differs from the new one.

The old fields (`visits`, `visitsWanted`, `ratioIdx`, `dup.mode`, `maxWeek`, `minWeek`, per-location `dup`) are still read and written because the old solver and UI use them. They are removed together with the old solver in Phase 3 and the UI in Phase 5.

Tests added: T-LOC-4 (x2), T-LOC-5, T-LOC-6 (x2), T-MIG-1 (x2), T-MIG-2, T-MIG-3 (x3), T-MIG-4. The B4 repro was promoted to T-LOC-4 and removed from `repro.test.mjs`. `tests/PHASE` is now 2. T-LOC-7 (visits=0 is never planned) needs the new solver and is added in Phase 3.

## Phase 3a — New solver, additive (old solver still serves `solve()`)

Added `E.solveV3(opts)` (private to the engine, behind a model flag) while the old solver and UI keep working. Phase 3b switches `solve()` over and deletes the old code.

Search: units are the requested visits (one per `visits`, goal-bound visits first), plus optional extra units up to each location's `maxExtra`. Depth-first search over (unit, day, team) with exact per-unit day domains (a domain is empty only if no valid team exists), forward checking, symmetry reduction among interchangeable members and interchangeable repeat visits, and a sound max-flow supply bound per pool (members' remaining capacity under the rest rule). Unit choice is smallest-domain first with failure weights shared across restarts (dom/wdeg); restarts use a Luby schedule with randomised team order. First run is deterministic.

Shortage mode: when the full set cannot be placed, a branch-and-bound over place/skip decisions maximises (coverage, goals, placed visits, location priority) in that order, with the structural rule that a repeat or extra visit is never placed while a standalone-feasible first visit is unplaced. It reports `partial_proven` with `exact:true` when the search finished.

Measured: all 300 small planted instances solve in under 300 ms each, all 150 medium ones in under 1.5 s. Early versions failed 3 of 150 medium instances; failure-weighted ordering plus shorter restarts fixed that. Brute-force oracle (`tests/oracle3.mjs`) agrees with the solver's maximum on 120 tiny random instances, including shortage cases.

Tests added in `tests/solver.test.mjs`: T-SOLV-1/2 (small and medium planted sweeps, every plan judged), T-SOLV-1 (engine checker agrees), T-SOLV-4 (oracle), T-SOLV-5 (shortage proven), T-SOLV-8 (determinism), B1, B2, B7 against the new solver, and the removed `visitsWanted` input.

Also fixed: the legacy `dupPeople` fix did not clear `oneVisitPerMember` after Phase 2.

Added afterwards in Phase 3a:

- Verified reasons and fixes for unplaced visits (`unplaced[i].reasons = [{family,text,fixes}]`). A reason is listed only if relaxing that rule family lets the visit be placed together with the already placed visits; a fix is listed only if applying it to a copy of the engine and solving again either completes the plan or places more visits. Visits with no single-rule explanation get a `capacity` reason with no fixes. New fixes: `locRepeatPeople`, `locRepeatDays`, `locVisits`, `extraVisits`; new family `repPeople`. `solveV3` takes `explain:false` and `explainMs`.
- `tests/reasons.test.mjs`: T-REAL-1 (the user's fixture: six requested, five proven in about 0.9 s including reasons, the `dupPeople` fix gives six), T-REP, T-FIX.
- `tests/model.test.mjs`: T-LOC-7 (zero visits never planned), visits above one, `repeat.days`/`repeat.people`, extra visits (placed, and unplaced without a location), `oneVisitPerMember`, goals (pinned, two goals on one location, custom size), week overrides.

Test infrastructure changes:

- `npm test` now runs `node --test --test-concurrency=1`. The sandbox has one CPU, and running test files in parallel made the old wall-clock-dependent tests fail (this is the B9 flakiness). Sequential run: 135 tests, about 212 s.
- The B6 repro now uses a 300 ms budget so the old solver reliably fails on at least one of 40 medium instances.
- `S9: plans count, budget presets, flex default, seed lock and digits` is flaky on the old solver even when run alone (about 2 of 3 runs fail: the old solver's plans depend on wall-clock time, so a locked seed does not give identical plans). It is removed together with the old solver. It is the only known red test at this commit.

Not done yet in Phase 3: the new capacity API, making `solve()` the new solver, removal of the old solver, and rewriting the old tests that depend on `visitsWanted`.

Resolved (the old solver was removed and the UI is rebuilt in Phase 5): blocking decision for the remaining Phase 3: `index.html` calls `Engine.solve` with `visitsWanted`, reads `capacity`/`explain`, and keeps `visitsWanted`, `vcap` and the ratio in its own state. Switching `solve()` (which must reject `visitsWanted`) breaks the shipped UI until Phase 5. Options: (a) switch now and accept a broken UI between phases, (b) do the UI rework (Phase 5) before deleting the old solver, keeping `solveV3` side by side until then. This commit keeps the old path working, i.e. option (b) so far.

## Phase 3b — `solve()` is the new solver, old solver deleted

`Engine.solve(saved, opts)` and `E.solveNow(opts)` now run the new search; `visitsWanted` and `visits` throw. Result: `{status, requested, achieved, coverage, exact, plans, unplaced[{locId,idx,goal,reasons[{family,text,fixes}]}], message, firstPlanMs}` with status `optimal | feasible | partial_proven | partial | infeasible_proven`. `E.capacityInfo(opts)` returns `{requested, capacity, exact, ub}` from the same search; `E.capacity(opts)` returns the number. New options: `explain:false`, `explainMs`, `plans`. The time budget defaults to the saved solver preset.

Removed from `engine.js` (about 1,100 lines, found by a structural reachability analysis, not by hand): the old slot/board search, split candidates, window budgets, flow bound, `probeV`, old `capacityInfo`/`explain`/`advise`/`diagnosePairs`, the minWeek auto-goals and the `banned`/`maxWeek` handling in goal compilation. `compileModel` lost its old-solver-only fields. The old state fields (`visits`, `visitsWanted`, `ratioIdx`, `maxWeek`, `minWeek`, per-location `dup`) are still read when loading old saves and still written; they are dropped together with the UI in Phase 5.

Tuning of the search that mattered (measured on the planted sets): cheap day domains for ranking with the exact team-existence check only for the chosen unit (about 3x faster per node), failure-weighted unit order shared across restarts, short Luby restarts, and every third restart dropping the weights and jittering the ranks (heavy-tailed instances such as medium seeds 22 and 67 went from 1.5–2.5 s to under 0.7 s). Result: all 150 medium planted instances in under 0.9 s each, all 300 small ones in under 150 ms.

Bugs found by the new property tests while porting them, both fixed: shortage mode could return a plan that broke a `sameDay` rule or a hard fairness spread (a skipped visit is a decision the rule must be re-checked after), and the first version of the brute-force oracle pruned on rules that are not monotone in a partial plan (`dayRuleSame`, `fairSpread`).

Tests: `property.test.mjs` is rewritten on the new oracle and judge (exactness on 500 random instances, soundness with judge plus engine checker, monotonicity, explanation correctness with the oracle, determinism); `engine.test.mjs` keeps the 50 tests that are still meaningful (the rest tested deleted internals such as `createSearch`, `flowBound`, `advise`, `minWeek` auto-goals, banned repeat mode, or are covered by new tests); `perf.test.mjs` is ported (the S3-size and wide-seat tests now pass `explain:false`). Deleted: `golden.test.mjs`, `legacy.mjs`, the old `oracle.mjs`, `repro.test.mjs` and `known_failing.mjs` (B1, B2, B7 live on as real tests in `solver.test.mjs`, B6 as the planted sweeps). `tests/PHASE` is 3. Full suite: 112/112, about 90 s.

Known weak spots, not hidden: shortage mode proves optimality by exhausting a branch-and-bound with a simple supply bound, so on large shortage instances `exact` can be false and the result is `partial`; the exactness tests only cover instances the oracle can enumerate. Reasons use single-rule relaxations, so a visit blocked by two rules at once gets the generic `capacity` reason without fixes.

Still to do: Phase 4 (quality score), Phase 5 (UI rework on the new contract, plus removing the old state fields), Phase 6 (docs).

## Phase 4 — Quality

`qualityScore(plan, ref)` (lower is better) replaces `scorePlan`, `WEIGHTS` and the `clean`/`prefMiss===0` ranking tiers. Eleven terms with the weights from the plan (balance / prefs / stable): loadSpread, loadVar, backToBack, dayImbalance, prefMiss, dayPrefMiss, pairWithMiss, pairAvoidHit, conflictSoft, sameLocSamePerson, changeFromPrev (stable only, measured against the `ref` plan passed to `solve`). Every plan carries `terms` and `quality`. Ranking is `[hardCount, -rows, quality]`, then a deterministic hash of the sorted rows. `pickPlans` no longer splits plans into clean and not clean.

`improvePlan` has the five moves from the plan (swap same-pool members, replace with an idle eligible member, move a row, swap the days of two rows, swap teams inside a merged trip), checks every candidate with the engine checker, and stops at a time budget (default 250 ms) or an iteration cap, whichever comes first. `solve` improves the best three plans and then applies the diversity filter. Every returned plan has the same number of visits.

Bug found by the quality tests: the engine checker did not enforce the `allowed` list of a custom-size goal, so `improvePlan` could move a member outside it. The checker now rejects that. Legacy relaxation families (`dup`, `loc`, `minWeek`) and fixes (`dupMode`, `visits`, `locMinWeekOff`, `locCapClear`) are removed. The T-JUDGE-1 model mutations (visit beyond `visits`, repeated people) are now also rejected by the engine checker, as planned in Phase 1.

Tests (`tests/quality.test.mjs`): T-QUAL-1 (50 instances with spare staff: counts differ by at most one in each pool), T-QUAL-2 (60 planted plans: `improvePlan` never raises quality, never breaks a rule, and improves at least 10 of them), term and tie-break determinism, and the stable-priority reference plan.

Honest note on T-QUAL-1: it also passes with `improvePlan` switched off, because the search already prefers the least-loaded members; the test guards the outcome, T-QUAL-2 is the one that proves the local search does something.

## Phase 5 — UI on the new model

The UI no longer has its own visit count. The header total, the plan-tab total and the bulk bar read `totalRequested()` and are refreshed synchronously from one function after every location, goal or visit change (`syncTotals`). With `?debug=1` a render-time assertion logs `TOTAL_DESYNC` if any visible total differs.

Added: per-location visits stepper (0–7), repeat controls (`people`, `days`) shown from two visits up, a bulk bar (add several main/contracted locations, set visits for all locations of one type), a global "one visit per member" switch and extra-visits stepper in Settings, a one-time migration banner ("was N, now M"), and an "unplaced" card that lists each missing visit with its reasons and verified one-tap fixes. The worker messages carry the new result contract.

Removed from the UI: the global visits stepper and banner, the main:contracted ratio control, the weekly cap and minimum, the global repeat policy and the advisor panel (its job is done by the unplaced card and reasons). Leftover call found and removed during verification: `refreshAdvisor()` threw on load in debug mode.

Removed from the engine state and saves: `visits`, `visitsWanted`, `ratioIdx`, `vcap`, `dup.mode`, `dup.people`, per-location `maxWeek`, `minWeek` and `dup`, and the `RATIOS`, `dupModeOf`, `dupPeopleEff` helpers. Old saves are still read through `legacyDup`; `dup` is now `{spread}`. The one thing worth knowing about the data: a pre-v3 save that is loaded and saved again no longer carries the old fields, so it cannot be opened by the previous version of the app.

UI tests: `tests/ui/ui.py` (Playwright) implements U-1 to U-7 and passes at 1100 px and 390 px: 4 locations added in bulk give a total of 4 within 100 ms and 4 distinct rows; a second visit gives two rows on two days with different people; the per-type stepper changes all mains and the total; delete and undo restore the total; the fixture shows "1 of 6 not scheduled" with reasons and a fix that yields 6 of 6; no old controls in the page; no console errors and no total drift in debug mode; no horizontal overflow at 390 px.

## Phase 6 — Documentation and final checks

`README.md` is rewritten for the new data model, pipeline, result contract, ranking, tests and debugging. `T-REAL-2` and `T-REAL-3` (the fixture with one-visit-per-member off: six distinct locations on seeds 1–10, and the structural facts of the old R5/R6) were added. The final full run: `npm test` three runs in a row, each 118/118 passing in about 126 s on the one-CPU sandbox; `tests/ui/ui.py` passes at 1100 px and 390 px.

### Old test to new test mapping

| Old | New |
|---|---|
| R1 (fixture, five visits) | R1 rewritten: skip the location the solver cannot place, five valid rows |
| R2 (infeasible six proven) | T-REAL-1 (`partial_proven`, 5 achieved, verified `dupPeople` fix gives 6) |
| R3 (dup any gives six) | T-REAL-2 |
| R4 (explain seats/gender) | covered by T-FIX and the oracle-checked explanation test in `property.test.mjs` |
| R5/R6 | T-REAL-3 and the rewritten R6 |
| S1, S2, S4, S7 (oracle capacity) | rewritten on `oracle3.mjs` and `capacityInfo` |
| S4 (one member, three visits) | a location with visits=3 and `repeat.people:'any'` |
| S4 need | unsatisfiable need gives `infeasible_proven` with a `tags` reason and a verified `locNeedOff` fix |
| S8 minWeek x2, B5 banned mode, B6 daycap fixes, B14 diagnosePairs, B19 explain deadline | removed with the features; B19 replaced by the `explainMs:0` test |
| S9 | rewritten without wall-clock dependence (it was flaky on the old solver) |
| property tests (6) | five new property tests on the judge and the new oracle |
| golden, legacy engine | removed (they pinned the old random generator plan for plan) |

### Definition of done

- Fresh app, N locations: total N, N rows, N distinct locations: T-LOC-*, B1, U-1.
- The total updates synchronously: T-LOC-4, U-1 to U-4, U-6.
- Repeats exist only through per-location visits of 2 or more or through `extraVisits`: model tests, T-REP.
- 300/300 small and 150/150 medium planted instances: `solver.test.mjs`.
- Shortage invariant and verified reasons: T-SOLV-4/5, T-REP, T-REAL-1, the oracle-checked explanation test.
- Judge agrees with the engine checker, all mutations rejected: `judge.test.mjs`.
- Real fixture: T-REAL-1..3.
- Migration keeps all records and explains a changed total: T-MIG-*.
- Guard passes, `MIN_TESTS` only increased, no skipped tests, fixture hash unchanged: `guard.test.mjs`.
- `npm test` green three runs in a row and the UI checks green at two widths: see the final run below.
- README and CHANGES updated: this file.

## Open questions

None yet.
