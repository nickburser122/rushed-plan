# مُخطِّط الزيارات الأسبوعية

A single-file planner for one week of visits. It builds visit schedules for clinical and admin teams.

## What it does
- Builds several valid plans for the week. It respects team makeup (2 clinical + 2 admin at main sites, 2 + 1 at contracted sites by default, overridable per location), days off, the rest rule, mixed-gender rules, near/far preferences, pairing rules, place-conflict rules and each location's repeat settings.
- Shows real dates for the week, with previous/next week buttons. Clicking the label jumps back to the current week. Today is highlighted.
- Has two views: by day, or a grid by member showing where each person is each day, their days off and their total.
- Lets you copy the plan as dated text, copy it per member, share it (native share sheet or WhatsApp) and print a clean layout.
- Lets you undo deleting a member or location from the toast.
- Keyboard shortcuts: `G` generates, `←/→` switch plans, `C` copies, `Esc` clears the highlight, `Enter` confirms a name.
- On mobile, the tab bar sits at the bottom of the screen.

## Architecture
`index.html` is the UI. All planning logic lives in `engine.js`, a classic script with no dependencies. It runs in the page, in a Web Worker (`new Worker('engine.js')`), and under Node for tests. If a Worker cannot start (for example a `file://` page in Chrome) the same engine runs in the page instead.

### Data model: what a visit is
The week's workload is the sum of per-location `visits` (0 to 7, default 1) plus `extraVisits` (0 to 10). `totalRequested()` returns that sum, and the UI total is always read from it, so it cannot drift from the locations. A location with `visits:0` is skipped this week. A location with `visits >= 2` repeats, and its `repeat` setting says how: `repeat.people` (`different` or `any`: may the same member come back) and `repeat.days` (`separate` or `same`). `maxExtra` lets a location absorb part of the `extraVisits` pool. The old global visit count, main:contracted ratio, weekly cap, minimum, and the global repeat policy are gone; old saves are migrated on load (see CHANGES.md for the exact mapping and the one-time note that explains a changed total).

### Pipeline
1. `compileModel()` snapshots the state into a model `M`: working days, locations with seat shapes, compiled goals, pairs, conflicts, day rules and caps.
2. `solveNow(opts)` (exposed as `solve(input, opts)`) builds one unit per requested visit (goal visits first, then plain visits, then optional extra visits) and searches over (unit, day, team):
   - Each unit's candidate days are filtered by closed days, goal days, day caps, day rules, repeat rules and the minimum gap. The unit with the smallest domain is placed next, with failure weights learned across restarts (dom/wdeg).
   - A team is built from the least-loaded eligible members, with symmetry breaking between interchangeable members and interchangeable repeat visits.
   - A max-flow supply bound per pool (members' remaining capacity under the rest rule) prunes branches that cannot be staffed.
   - Restarts follow a Luby schedule; the first run is deterministic, later runs randomise team order and sometimes drop the failure weights.
3. If every visit cannot be placed, a branch-and-bound over place/skip decisions finds the largest plan. It maximises, in this order, location coverage, goals met, visits placed and location priority, and it never places a repeat or extra visit while a feasible first visit is left out. `exact:true` means the search finished, so the result is proven best.
4. `checkPlan(rows)` / `evaluatePlan` re-reads the rows and counts hard and soft violations per rule family. Ranking and every test use only this checker; `tests/judge.mjs` is a second, independent implementation used to test it.
5. `improvePlan` is a local search over five move types (swap same-pool members, replace a member with an idle eligible one, move a row, swap two rows' days, swap teams inside a merged trip). Each candidate is checked with the engine checker, and only plans with a lower quality score are kept.
6. `capacityInfo()` / `capacity()` run the same search and return `{requested, capacity, exact, ub}`.

### Result
`solve` returns `{status, requested, achieved, coverage, exact, plans, unplaced, message, firstPlanMs}`.

| status | meaning |
|---|---|
| `optimal`, `feasible` | every requested visit is placed |
| `partial_proven` | not everything fits; `achieved` is the proven maximum |
| `partial` | not everything fits; the search ran out of time, so `achieved` is at least this |
| `infeasible_proven` | nothing can be placed (or the input is empty; `message` says why) |

`unplaced` lists each visit that could not be placed: `{locId, idx, goal, reasons:[{family,text,fixes}]}`. A reason is listed only if relaxing that rule family would let the visit be placed together with the visits already placed, and a fix only if applying it to a copy of the engine and solving again completes the plan or places more visits. A visit blocked by two rules at once gets a generic `capacity` reason without fixes. `solve` accepts `timeBudgetMs`, `seed`, `plans`, `explain:false`, `explainMs` and `ref` (the previous plan, for the stable priority). Passing `visitsWanted` throws.

Every suggestion is a plain fix object `{op,...}` in the `FIX` registry, so one function (`applyFix`) applies it from any card or banner, and each application is undoable from the toast. `withRelax(families, fn)` re-runs the model with rule families removed (`dupPeople`, `repPeople`, `members`, `rest`, `daycap`, `seats`, `gender`, `pairs`, `conflicts`, `elig`, `types`, `closed`, `offdays`, `goals`, `tags`, `dayRules`, `fair`).

## Locations
- **Visits**: each location card has a visits stepper (0 to 7). A bulk bar sets the same number for all main or all contracted locations and adds several locations at once. The total shown in the header, the plan tab and the bulk bar is always `totalRequested()`.
- **Seats**: each location has clinical and admin seat counts. Defaults come from its type (main 2+2, contracted 2+1). Change them on the location card; reset restores the defaults.
- **Eligible members**: an "only" list and an "exclude" list work together; members whose type setting rules out the location are disabled.
- **Repeat** (shown when visits is 2 or more): `people` (different people on each visit, or the same people may return) and `days` (on separate days, or all on one day as several teams). The global option "one visit per member per week" is in Settings.
- **Mixed gender** works on any location. Teams of 4 need 1 or 3 men, other sizes need at least one of each, unless the gender mode says otherwise.

## Days
- Global "up to" limit per day (default 3) plus the existing main/contracted per-day limits, and an optional limit per day card.
- "توزيع متساوٍ" (on by default) fills the least-loaded day first, so a day only gets a second visit when the visit count needs it.

## Conflict rules (تعارض المواقع)
Settings → each rule has a set of places A and a set of places B. Anyone who visits a place in A is kept off every place in B in the same plan. Scope: everyone, clinical, admin, or named members. Strict rules are hard, flexible rules only count against the plan.

## Special visits
In Goals, switch a goal to "فريق مخصص". Set a team size and the candidate members (empty means everyone). Pinned members are always on the team and the rest is filled from the candidates, whatever their group. The pool seat shape and the mixed-gender rule do not apply.

## Reasons and fixes
- When some visits cannot be placed, an "unplaced" card lists each missing visit with the rule that blocks it and one-tap verified fixes (for example allowing the same member to return, skipping the location this week, or widening a day cap). Applying a fix regenerates the plan.
- Member cards warn when days off plus the rest rule cost that person visits and offer to exempt them from the rest rule.
- A one-time banner appears after loading an old save whose total changed ("was 5, now 6"), so the new per-location totals are never a surprise.

Saved data stays under `visitplan.v2`. Old saves migrate on load; the save format version is 3.

## Goals (الأهداف)
A goal is a visit that must be in every plan. Each goal has:
- **Location**: required.
- **Days**: empty means the solver picks any working day. One or more days limits the solver to those days.
- **People**: optional. Pin up to 2 clinical and 2 admin members (1 admin at contracted sites). The solver fills any empty seats.
- **Exclude**: optional. Members who must not be on that visit.
- An on/off switch, delete with undo.

Rules:
- Pinned people are reserved for that visit. They are not used anywhere else that day, or on the days around it (unless flex mode is on).
- The visit count rises automatically to cover the goals, and can't go below the goal count.
- Goals that can't work are flagged in red and skipped until fixed. This covers a non-working day, a pinned person on leave, too many people, a gender-mix conflict, a hard "ليس مع" conflict, a person double-booked or on back-to-back days across goals, or a day over its cap.
- In the plan, goal visits show a purple "هدف" badge and pinned people show a lock. The member grid and copied text mark them with ◎. Plan stats show how many goals were met.
- Goals are saved as part of the state: `{id,on,loc,days[],people[],exclude[]}`.
- Saves everything in `localStorage` under `visitplan.v2`, including the chosen week and view. Data saved under `visitplan.v1` is migrated on load.
- A pinned member never goes over their maximum visit count: the solver keeps room for their later goal visits when it gives them other visits.

## Plan ranking
Every plan is checked by `evaluatePlan()`, which re-reads the plan rows and does not trust the solver's flags. The result is stored as `p.eval`: `hard` counts (rest rule, hard avoid pairs, member visit targets, goals, location caps and closed days, days off and member types, double booking, team shape, gender rule, repeat rules, visits beyond a location's allowance) and `soft` counts (soft avoid breaks, missed preferences, missed pairs, missed day preferences). All hard counts must be 0 for a complete plan.

Plans are ranked by `[hard violations, -visits placed, quality, hash of the rows]`. The quality score (lower is better) is a weighted sum of eleven terms: load spread, load variance, back-to-back days, day imbalance, missed preferences, missed day preferences, missed pairs, soft avoid breaks, soft conflict breaks, the same person at the same location twice, and (only in the "stable" priority) changes against the previous plan. The priority setting (balance, preferences, stable) changes the weights; the weights are in `QW` in `engine.js`. Plan 1 is the best plan in the pool; the other slots are filled by a diversity pick.

## Settings reference (v3 data model)

Every setting below defaults to the previous behaviour, saves with the plan, and has a relax family so `explain` can offer a verified one-tap fix when it blocks visits.

| Setting | State key | Relax family | One-tap fix |
|---|---|---|---|
| Wider limits: per-day caps 1–6, day total 0–10, per-day max 0–10, weekly cap 0–7, seats 0–8, custom team 1–10 | `cap`, `days[].max`, `locations[].seats` | `daycap`, `seats` | `capMain`, `capCon`, `dayMax` |
| Per-week exceptions: holiday, member leave, location closure for one `weekStart` | `weekOverrides[weekStart]` (`holidays`, `memberOff`, `locClosed`), pruned after 12 weeks | `offdays`, `closed` | `weekOffClear`, `weekOpenDay` |
| Gender mix mode: `legacy4` (default 3:1 for teams of exactly a+b, otherwise both genders), `mixed`, `minF`, `minM`, `off`; ratio a:b adjustable; per-location override `genderMode` | `gender {mode,ratio:{a,b},min}`, `locations[].genderMode` | `gender` | `genderMode` (to mixed), `locGenderOff` |
| Member tags and location needs | `members[].tags`, `locations[].needs [{tag,min}]` | `tags` | `locNeedOff` |
| Pair rules: `with`, `avoid`, `must` (always together); per-rule `hard` overrides the global mode | `pairs.rules[].kind/hard` | `pairs` | `pairSoft` |
| Location days: `allowedDays`, `minGap`; day rules `notSameDay` and `sameDay` between location sets | `locations[].allowedDays/minGap`, `dayRules` | `dayRules`, `closed` | `dayRuleOff`, `locGapOff` |
| Fairness: `maxSpread`, `minEach`, soft or hard | `fair` | `fair` | `fairSoft` |
| Visits and repeats: per-location `visits`, `repeat {people,days}`, `maxExtra`; global `extraVisits`, `oneVisitPerMember` | `locations[].visits/repeat/maxExtra`, `extraVisits`, `oneVisitPerMember` | `dupPeople`, `repPeople` | `dupPeople`, `locRepeatPeople`, `locRepeatDays`, `locVisits`, `extraVisits` |
| Location priority (used when not everything fits) | `locations[].priority` | none | none |
| Solver and output: budget, plan count, flex default, seed lock, digits | `solver`, `digits` | none (never blocks) | none |

Notes:

- `sameDay` rules and hard fairness make feasibility non-monotone in the visit count. Capacity is the largest feasible count, and the explain probes test the exact requested count.
- Capacity ignores soft rules entirely; only hard rules change what can be built.
- `applySaved` is atomic: a bad file leaves the current state untouched. Members, pair rules and ids are validated, duplicate ids are re-issued, and an unreadable save is copied to `visitplan.v2.corrupt-<timestamp>`.
- Settings-only export, import and reset keep members, locations, goals and history. Section open state lives in `localStorage` key `visitplan.ui`, not in the plan.

## Property tests cover the new rules

`tests/gen.mjs` randomly adds custom goals, week overrides, gender configs, tags and needs, must pairs, location days and gaps, day rules, fairness and priority. `tests/oracle3.mjs` brute-forces the largest placeable set of visits, with `tests/judge.mjs` as the checker. The oracle checks only rules that are monotone in a partial plan while it searches, and the full set of rules at the end (same-day rules and fairness spread are not monotone).

## Tests
`npm test` runs `node --test --test-concurrency=1` (sequential, because several tests measure time) and needs no dependencies. On Node 22 the directory form `node --test tests/` does not work. The suite takes about two minutes.
- `judge.mjs`: an independent validator written from the rules, not from the engine's checker. It imports only `createFromSaved` and `DAYS`. `judge.test.mjs` proves it: planted plans pass, eight kinds of mutation are rejected, and it agrees with the engine checker on 500 valid and mutated plans.
- `planted.mjs`: generates an instance by building a valid plan first and then adding constraints that plan satisfies, so a solution is known to exist. `solver.test.mjs` requires all 300 small and 150 medium instances to be solved within 500 ms and 1.5 s and every returned plan to pass the judge.
- `property.test.mjs`: 500 seeded random instances against the brute-force oracle: exactness, soundness, monotonicity, explanation correctness (every listed fix is checked with the oracle), determinism. `PROP_N=...` changes the count.
- `reasons.test.mjs` (the real user fixture, repeat reasons, verified fixes), `model.test.mjs` (visits, repeats, extras, goals, week overrides), `locations.test.mjs` and `migrate.test.mjs` (totals and old saves), `quality.test.mjs`, `engine.test.mjs`, `perf.test.mjs`.
- `guard.test.mjs` fails if the engine special-cases the fixture's ids or seeds, if a test is skipped, if the number of tests drops below `tests/MIN_TESTS`, if the judge starts importing the engine's checker, or if the fixture file changes.
- `tests/ui/ui.py` is a Playwright script (Python) for the browser flows U-1 to U-7 at 1100 px and 390 px: bulk add and total, repeat controls, per-type stepper, delete and undo, the unplaced card with a one-tap fix, no old controls, no console errors and no total drift in debug mode. Serve the folder (for example `python3 -m http.server 8765`) and run `python3 tests/ui/ui.py`.

## Debugging
- `?seed=123` makes the random choices repeatable. Without it, the seed comes from the clock.
- `?debug=1` logs every pooled plan with its `evaluatePlan()` result to the console, logs an error for any plan with a hard violation (that means a solver bug), and checks after every render that each visible total equals `totalRequested()` (`TOTAL_DESYNC` in the console otherwise).

## UI polish
- Every dropdown (goal location, pair-rule members) is a custom pill dropdown that matches the app style. It has grouped headers (clinical/admin, main/contracted), gender dots, distance badges and a check on the selected option. It opens up or down depending on the space available. Keyboard: `↑/↓`, `Home/End`, `Enter`, `Esc`.
- The browser's `confirm()` is replaced by a styled dialog (blurred backdrop, focus trap, `Esc` to cancel).
- No full DOM refresh: all views update through a small keyed morph (`morph()`) that patches only what changed. Cards, scroll position, open focus and typed text stay in place. Removed cards fade out.
- While regenerating, the current plan stays on screen, dims slightly and shows a spinner on the button, instead of being swapped for a loader.
- Entry animations run once on first load. Later updates use a short, subtle fade.
- Steppers disable at their limits, and focus rings are consistent.
- Deleting a pair rule can now be undone.

## Fixes
- Visit capacity now comes from the real team size. Before, it used hard-coded pair caps that didn't match the team rules. Removing members now updates the maximum correctly.
- If there are too few clinical/admin members, the app now says so clearly instead of spinning through a pointless search.
- Auto-regeneration no longer shows a toast each time.
- The visits stepper disables at its limits.
- Changing a member's pool updates the counts and capacity.
- The "all days" switch now matches the saved state after a reload.
- Saved data is checked more safely when loading.

## Entry
- `index.html`. No backend and no tables.

## Next steps
- Export to image or PDF.
- Create a goal straight from a visit in the plan ("pin this visit").
- Recurring goals across weeks (goals are not tied to the week right now).
