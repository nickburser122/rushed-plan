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
- **Day**: "يختار المُخطِّط" lets the solver pick the day, or you fix it to one day.
- **People**: optional. Pin up to 2 clinical and 2 admin members (1 admin at contracted sites). The solver fills any empty seats.
- An on/off switch, delete with undo.

Rules:
- Pinned people are reserved for that visit. They are not used anywhere else that day, or on the days around it (unless flex mode is on).
- The visit count rises automatically to cover the goals, and can't go below the goal count.
- Goals that can't work are flagged in red and skipped until fixed. This covers a non-working day, a pinned person on leave, too many people, a gender-mix conflict, a hard "ليس مع" conflict, a person double-booked or on back-to-back days across goals, or a day over its cap.
- In the plan, goal visits show a purple "هدف" badge and pinned people show a lock. The member grid and copied text mark them with ◎. Plan stats show how many goals were met.
- Goals are saved in `localStorage` under the `goals` key: `{id,on,loc,day(-1=auto),people[]}`.
- Saves everything in `localStorage` (`visitplan.v1`), including the chosen week and view.

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
