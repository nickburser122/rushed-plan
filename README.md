# مُخطِّط الزيارات الأسبوعية

A single-file planner for one week of visits. It builds visit schedules for clinical and admin teams.

## What it does
- Builds several valid plans for the week. It respects team makeup (2 clinical + 2 admin at main sites, 2 + 1 at contracted sites), days off, the no-consecutive-days rule, mixed-gender rules, near/far preferences and pairing rules.
- Shows real dates for the week, with previous/next week buttons. Clicking the label jumps back to the current week. Today is highlighted.
- Has two views: by day, or a grid by member showing where each person is each day, their days off and their total.
- Lets you copy the plan as dated text, copy it per member, share it (native share sheet or WhatsApp) and print a clean layout.
- Lets you undo deleting a member or location from the toast.
- Keyboard shortcuts: `G` generates, `←/→` switch plans, `C` copies, `Esc` clears the highlight, `Enter` confirms a name.
- On mobile, the tab bar sits at the bottom of the screen.

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
