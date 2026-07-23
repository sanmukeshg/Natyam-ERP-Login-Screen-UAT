# Release Notes — NATYAM ERP v2.2.4

**Release:** UAT Round 4
**Date:** 23 July 2026
**Baseline:** v2.2.3 (previous build, confirmed deployed and tested live)
**Type:** Bug fixes only · no schema change · all records preserved

---

## What changed for the academy

### Admissions Wizard — the error, the stuck Batch step, and the stuck button were one bug

All three turned out to share a single cause: a step in the wizard's own code
was calling the wrong thing by accident, which threw an error every time you
moved between steps. That one throw is why:

- a popup appeared while moving between steps,
- the Batch step's "Checking which batches have room…" message never
  finished loading, and
- the final step kept saying "Continue" instead of "Submit application" —
  because the code that relabels it never got the chance to run.

Fixing the one underlying mistake fixes all three. While checking every step
by hand afterwards (rather than assuming that was the only problem), a
second, previously-invisible issue turned up: the Batch step's "preferred
batch" dropdown displayed correctly but the choice was never actually saved —
now it is. And separately, the row of step numbers at the top (1 through 9)
could run off the edge of the panel with no way to scroll to the later ones;
it now wraps onto a second row instead, the same fix already used on phones.

### Timetable tiles can now actually turn green

The date used to decide "has this day's register been marked" was being
computed as "the next time this weekday comes around" — which, for a day
already passed earlier in the week, pointed at a date still in the future.
Attendance can never be marked for a date that hasn't happened yet, so the
tile could never show as done. Each day on the Timetable now shows its date
within the *current* week, so a Monday that's already gone by is checked
against itself, not next week's Monday.

### The Attendance follow-up list now opens the right day

Clicking "Mark" on an item in "registers unmarked this week" now opens
*that* register — before, it always opened today's, which could wrongly say
the register was already marked (because today's own register may well have
been).

### The batch-clash warning names the branch, instead of looking mysterious

If a new batch clashes with a same-teacher class at a *different* branch —
possible now that a teacher can be based at more than one branch (2.2.3) —
the warning now says which branch that class is at, rather than naming a
batch that doesn't appear to exist anywhere. It always was a real, active
batch; it just wasn't in the branch you were currently viewing. The check
itself is unchanged — a teacher genuinely can't teach two overlapping classes
even at different branches, and narrowing the check to hide that would
reopen exactly the double-booking risk it exists to prevent.

---

## For administrators / IT

- **No schema change, no migration.**
- The Attendance follow-up list and the Timetable's green status now share
  one underlying check for "is this register marked," instead of each
  computing it separately — so that answer can't quietly drift between the
  two screens in the future.
- Every fix is scoped to the file(s) that owned the bug. Nothing was
  redesigned; no button, screen, or workflow was removed.

## Quality

Same constraint as the last release: this environment has no Node.js,
Python, or other runtime installed, so neither the `tools/*.mjs` checks nor a
live browser click-through could run here. What was done instead:

- Every one of the 6 screenshots in the UAT document was read directly
  (including one literal JavaScript error message), and each fix was traced
  back to the exact line that produced what the screenshot showed, rather
  than guessed at.
- A full manual re-read of every changed file for syntax, import correctness,
  and no newly-introduced circular imports.
- Every wizard step (all 9) was individually traced against how the wizard
  reads its values, not just the one step the bug report named — which is
  how the second, previously-masked Batch-step bug was found.

**This is not a substitute for running the app.** Please step through the
Manual UAT Checklist below in a real browser before this goes out —
especially the Admissions Wizard end to end, since that's the area with the
most moving parts this round.

## Manual UAT checklist

- [ ] Admissions: step through all 9 steps with no popup appearing between any of them; the Batch step finishes loading and shows real batch options (not stuck on "Checking…"); picking a preferred batch and continuing, then going back, still shows it selected; the final step says "Submit application" and submitting works.
- [ ] Admissions: on a normal desktop-width window, all 9 step numbers are visible (wrapping onto a second row if needed) — none clipped off the edge.
- [ ] Timetable: mark a register for a batch meeting earlier this week (not just today) — that day's tile turns green, and stays green after a refresh. A day later in the week that hasn't happened yet stays its normal colour.
- [ ] Attendance: from "registers unmarked this week," click Mark on an entry from a few days ago — it opens that day's register, not today's, and doesn't say "already marked" unless it actually was.
- [ ] Batches: create a batch that clashes with a same-teacher batch at a *different* branch (for a teacher assigned to more than one) — the warning names which branch the conflicting batch is at.
- [ ] Regression check: everything verified in the v2.2.3 checklist (Staff multi-branch, Students/Staff Branch columns, batch save/loading fixes, Fee Collection bulk-select, mobile navigation) still behaves as it did.

## Known issues

- Automated checks and live browser testing were not run for this release
  (see Quality, above) — an action item, not a defect in the code.
- Navigation-QA `/settings` flake — pre-existing, unrelated, unchanged.

## Upgrade

Replace the application files. No data steps are required.
