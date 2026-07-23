# Release Notes — NATYAM ERP v2.2.3

**Release:** UAT Round 3
**Date:** 23 July 2026
**Baseline:** v2.2.2 (previous build)
**Type:** Bug fixes + two additive features · no schema change · all records preserved

---

## What changed for the academy

### Staff can now belong to more than one branch

A teacher who takes classes at both Hyderabad and Vizag is selected onto both
from one multi-select field, instead of being forced to pick a single "home"
branch. The Staff list shows every branch someone is based at (e.g.
"Hyderabad, Vizag"), and the Students list now shows its Branch column too —
both matter most when viewing "All branches" rather than one at a time.

Nothing was migrated. Existing staff records, which only ever had one branch,
keep working exactly as before.

### Fee Collection can now take several students' payments at once

Tick the students who owe money, choose "Collect selected," and record each
one's payment — with its own editable amount — in a single sitting. Every
payment is still its own separate transaction with its own receipt number: if
one amount is wrong and gets rejected, it doesn't touch the payments either
side of it, and a summary at the end says exactly what went through and what
didn't.

Print Receipt now lives only in the student's Receipts list, reached after a
payment settles — not as a pop-up the moment a payment is taken. Collecting
money and printing the receipt for it are two separate, deliberate steps.

### Timetable shows attendance status, and is where registers are taken from

A class's tile on the Timetable turns green once that day's register has been
marked, so the state is visible without opening anything. Each tile also has
its own "Take register" button. The separate "Attendance" entry in the left
sidebar is gone — attendance is reached from Timetable (or still from the
Batches screen's own "Take register" button, exactly as before). Nothing
about how attendance itself works has changed; this only moves how you get
there.

### Fixes from this round of testing

| You reported | Root cause | Now |
|---|---|---|
| Saving a batch showed an error popup | The success handler read the service's `{ batch, conflicts }` wrapper as if it were the batch record itself, so it tried to open "undefined" right after the real save succeeded | Single success toast with the batch's real name; the batch was actually saving correctly all along |
| Batches "disappeared" after closing and reopening the browser | Not data loss — a slow cold database open let the list's empty state ("No batches yet") render before the real rows arrived | A loading placeholder shows instead, until the real data is in hand |
| Step 8 hides in the Admissions form; Submit Application seemed to disappear | A step that defines both an empty field list and its own custom content had that content silently skipped — this actually hit the wizard's batch-picker step and its final "Confirm" step (where Submit Application lives), not literally step 8 | Both steps render their content again; Submit Application was never replaced with Continue — it was just sitting above a blank panel |
| Dashboard opens scrolled down | Restoring keyboard focus after navigating nudged the page a few pixels right after the scroll position had just been reset | Every page, including Dashboard, now opens at the very top |
| Left navigation broken on tablets | A leftover CSS rule from an earlier version of the sidebar was fighting the current one at a different screen width, and the dimming overlay was stacking on top of the open menu instead of behind it | The mobile/tablet drawer opens and closes correctly across the full range, with the dimming layer sitting behind it |

### Checked and found already correct

The optional **Course of Study** field on a student's record, and **Settings →
Curriculum** where courses are managed, were reported as leftover — they
aren't. They're intentional functionality added in 2.2.0. We checked
specifically for a second, duplicate place curricula might be managed, and
found none: Settings → Curriculum is the only one. Nothing here changed.

---

## For administrators / IT

- **No schema change** and **no migration.** Staff's new multi-branch field is
  read defensively alongside the old single-branch field — a record saved
  under the old form and never touched again keeps working, with no upgrade
  step required.
- **The `/attendance` route is unchanged** — only its sidebar link was
  removed. Anyone with a bookmark, or a link from Batches, still reaches it.
- Every fix above is scoped to the file(s) that owned the bug; no shared
  component, page, or business rule outside what's described was touched.

## Quality

This is a static, no-build-step application (see `README.md`) normally
checked with the scripts in `tools/` and a live click-through in a browser.
**Neither was possible for this release**: this environment has no Node.js,
Python, or other runtime installed, so the `tools/*.mjs` checks couldn't run
and no local server could be started to exercise the app live. What was done
instead:

- A full manual read-through of every changed file (diffed against the
  previous commit) checking syntax, import/export correctness, and logic —
  no circular imports introduced, no unresolved references, no unbalanced
  braces.
- Every new code path was traced against the actual call sites it affects
  (e.g. every place that filtered staff by branch was found by direct search
  and updated, not assumed).

**This is not a substitute for running the app.** Before this reaches
students and staff, someone should open it in a browser (`python3 -m http.server 8000`
from this folder, or any static file server) and step through the Manual UAT
Checklist below — ideally the same person who filed the original bug report,
since they'll recognise immediately whether each item is actually fixed.

## Manual UAT checklist

- [ ] Staff: add/edit a staff member with 2+ branches ticked; list shows all of them; switch between a single branch and "All branches" and confirm the roster changes correctly.
- [ ] Students list shows a Branch column; Curriculum field still present and working on the student form.
- [ ] Create a batch: one success toast with its real name, drawer opens on it, no error popup.
- [ ] Create a batch, close and reopen the browser, open Batches immediately: loading placeholder, then correct data — nothing missing.
- [ ] Mark a register for a batch meeting today: that day's Timetable tile turns green; "Take register" button on the tile opens the right batch and date.
- [ ] Attendance is gone from the left sidebar; reaching it from Timetable and from the Batches drawer both still work; marking/correcting attendance is unchanged.
- [ ] Dashboard, and every other page, opens at the very top when navigated to.
- [ ] Admissions: step through all 9 steps; the batch-picker step and the final review step show their content; the last step says "Submit application" and submitting works end to end.
- [ ] Fee Collection: single "Collect" still works with no print pop-up after; select 3+ students, "Collect selected," submit with one deliberately wrong amount — the others still go through; print each receipt from the student's Receipts list.
- [ ] On a tablet-width window (roughly 900–1024px) and on a phone width: the hamburger opens/closes the drawer, the dimming layer sits behind the open drawer, not on top of it.

## Known issues

- **Automated checks and live browser testing were not run for this release**
  (see Quality, above) — carried forward as an action item, not a defect in
  the code itself.
- Navigation-QA `/settings` flake — pre-existing, unchanged, last noted in
  v2.2.2; unrelated to anything in this release.

## Upgrade

Replace the application files. No data steps are required.
