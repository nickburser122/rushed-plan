# مُخطِّط الزيارات الأسبوعية

A single-file planner for one week of visits. It builds visit schedules for clinical and admin teams.

## What it does
- Builds several valid plans for the week. It respects team makeup (2 clinical + 2 admin at main sites, 2 + 1 at contracted sites by default, overridable per location), days off, the rest rule, mixed-gender rules, near/far preferences, pairing rules, place-conflict rules and the repeat policy.
- Shows real dates for the week, with previous/next week buttons. Clicking the label jumps back to the current week. Today is highlighted.
- Has two views: by day, or a grid by member showing where each person is each day, their days off and their total.
- Lets you copy the plan as dated text, copy it per member, share it (native share sheet or WhatsApp) and print a clean layout.
- Lets you undo deleting a member or location from the toast.
- Keyboard shortcuts: `G` generates, `←/→` switch plans, `C` copies, `Esc` clears the highlight, `Enter` confirms a name.
- On mobile, the tab bar sits at the bottom of the screen.

## Architecture
One pipeline, each stage reading only the stage before it:
1. `compileModel()` snapshots the state into a model `M`: working days, locations with their seat shape, repeat mode and eligible members, compiled goals, pairs and conflicts, window capacity caps, and the candidate main/contracted splits.
2. `makeBoard(M)` is the single slot board. `fits()` is the only place that decides whether a visit may go on a day (closed days, per-location cap, repeat policy, per-day limits, available and eligible people, window capacity under the rest rule). Both the slot builder and the replay of a previous plan use it.
3. `solveTeams(M, slots)` assigns people with a depth-first search over seat shapes. Pool visits fill the location's clinical/admin seats. Custom visits fill a size from named candidates.
4. `evaluatePlan(p, M)` re-reads the rows and counts hard and soft violations per rule family. Ranking uses only this result.
5. `advise(M)` and `runDiagnosis()` explain problems. Every suggestion is a plain fix object `{op,...}` in the `FIX` registry, so one function (`applyFix`) applies it from any card, panel or failure message.

Relaxation context: `withRelax(families, fn, {skip, exempt})` re-runs the same model with rule families removed, individual rules skipped, or members exempted from the rest rule. It powers both the capacity explanation and the failure diagnosis. Flex mode is different: it keeps the rules but lets the solver break `rest`, `pairs` and `conflicts` with a penalty, and marks the breaks.

## Locations
- **Seats**: each location has clinical and admin seat counts. Defaults come from its type (main 2+2, contracted 2+1). Change them on the location card; "الافتراضي" resets.
- **Eligible members**: tap a member once to restrict the location to the chosen members, tap again to exclude them.
- **Repeat**: use the global policy or override per location. `ممنوع` allows one visit a week. `منفصل` allows repeats on different days, each its own visit. `مدموج` allows repeats on the same day only and shows them as one visit with several teams. Setting «المكرَّر بأعضاء مختلفين» (on by default) keeps repeat visits to different people.
- **Mixed gender** works on any location. Teams of 4 need 1 or 3 men, other sizes need at least one of each.

## Days
- Global "up to" limit per day (default 3) plus the existing main/contracted per-day limits, and an optional limit per day card.
- "توزيع متساوٍ" (on by default) fills the least-loaded day first, so a day only gets a second visit when the visit count needs it.

## Conflict rules (تعارض المواقع)
Settings → each rule has a set of places A and a set of places B. Anyone who visits a place in A is kept off every place in B in the same plan. Scope: everyone, clinical, admin, or named members. Strict rules are hard, flexible rules only count against the plan.

## Special visits
In Goals, switch a goal to "فريق مخصص". Set a team size and the candidate members (empty means everyone). Pinned members are always on the team and the rest is filled from the candidates, whatever their group. The pool seat shape and the mixed-gender rule do not apply.

## Advisor
- The panel on the plan tab lists problems with one-tap fixes.
- Member cards warn when days off plus the rest rule cost that person visits (for example available only on two consecutive days) and offer "استثناء من قاعدة الراحة".
- When visits are cut to fit capacity, the panel names the limiting rule and offers the matching fix.
- When no plan exists, the failure card probes which rule family blocks the plan, tries each rule or member separately, and offers the smallest fix.

Saved data stays under `visitplan.v2`. Old saves migrate on load: the old repeat setting maps to the new repeat policy, and contracted locations keep their old unrestricted gender behaviour.

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
Every plan is checked by `evaluatePlan()`, which re-reads the plan rows and does not trust the solver's flags. The result is stored as `p.eval`:
- `hard`: rest rule, hard "ليس مع" pairs, member visit targets, goals, location caps and closed days, days off and member types, double booking, team shape, mixed-gender rule. All of these must be 0 in normal mode.
- `soft`: soft "ليس مع" breaks, missed preferences, missed "مع" pairs, missed day preferences.
- `clean`: no hard violations, no "ليس مع" breaks and no missed preferences.

Plans are sorted in tiers, and a later tier only breaks ties inside the earlier one:
1. Fewer hard violations.
2. Clean plans before the rest.
3. Fewer rule breaks ("ليس مع" breaks plus target misses).
4. Fewer missed preferences and day preferences, only when the priority is set to preferences.
5. Higher score: fairness, days, preferences, pairing and similarity to the previous plan.

Plan 1 is always the best plan in the pool. When any pooled plan is clean, plan 1 is clean. The diversity pick fills the other slots with clean plans first, then the rest, and the final list is sorted again. "الأمثل" shows only on a clean plan 1. Otherwise plan 1 shows "الأفضل المتاح" with a warning.

The search keeps running past 560ms until the pool has a clean plan, up to the 1500ms limit (2000ms in flex mode) or 9000 attempts.

History for carry-over is saved when a plan is picked or after a manual generation. Auto-regeneration after a settings change does not overwrite it.

## Debugging
- `?seed=123` makes the random choices repeatable. Without it, the seed comes from the clock.
- `?debug=1` logs every pooled plan with its `evaluatePlan()` result and rank key to the console. In normal mode it logs an error for any plan with a hard violation, since that means a solver bug.

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
