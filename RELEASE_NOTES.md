# Release Notes — NATYAM ERP v2.2.5

**Release:** UAT Round 5
**Date:** 23 July 2026
**Baseline:** v2.2.4 (previous build, confirmed deployed and tested live)
**Type:** Bug fixes only · no schema change · all records preserved

---

## What changed for the academy

### Admissions — opening an application no longer errors out

Every application detail view runs a check for possible duplicate
applications. The check itself (used when someone submits a new application)
is designed to answer "is there already one of these?" with a single
yes-or-no — but the detail view was using that same answer as if it were a
list of every possible duplicate, which broke the moment there was any match
at all. Because the check had no way to tell an application apart from
itself, that was true almost every time. Opening an application now uses a
dedicated check built to return a list — every *other* matching application,
never the one currently open — so the detail view opens cleanly and the
"possible duplicate" note only appears when there's a genuine second
application to look at. The original submission-time check is untouched.

### Finance — Expenses "By category" now shows how many, not just how much

The amount next to each expense category was always correct; the count
beside it was never actually being counted, only ever showing zero. It now
reflects the real number of expenses in each category.

### A restored backup can no longer leave the branch selector pointing at nothing

Restoring a backup that has a different set of branches used to leave the
previously-selected branch id sitting in the browser's memory even after it
no longer matched anything real — which could make other screens (Batches,
Students, and others) look like they'd lost data, when they were really just
filtered to a branch that no longer existed. A restore now clears that
memory *only* when it no longer points at a real branch; a selection that's
still valid after the restore is left exactly as it was. Ordinary startup —
no restore involved — behaves exactly as before.

### Investigated, confirmed, and deliberately left alone this round

- **Payroll can double-count a staff member's salary** if a manual ledger
  entry is posted for "Salaries" before a real payroll run for the same
  staff and month — the two are never cross-checked. This is a real
  data-integrity defect, but Payroll is scoped for exclusion from Phase-1, so
  no further engineering time is going into it in this patch. Left
  completely unchanged.
- The Attendance "doesn't normally meet on this day" notice, the duplicate
  Search control in the sidebar and header, Academic Year edit/delete, and a
  Version/Build-Info screen were all raised this round and are genuine,
  reasonable requests — none are defects, so none were touched here. They're
  tracked for a future minor release.
- "Expenses seem to disappear until refreshed" could not be reproduced as a
  data-loss defect after a full trace of the Expenses screen's rendering
  path. The only related behaviour found was a harmless double-repaint
  (recording an expense fires two events, so the screen redraws twice in
  quick succession) — left as is pending sharper reproduction steps.

---

## For administrators / IT

- **No schema change, no migration.**
- Every fix is scoped to the file(s) that owned the bug. Nothing was
  redesigned; no button, screen, or workflow was removed.
- Payroll's ledger-posting behaviour is unchanged in this release — see
  above.

## Quality

Unlike the previous two rounds, a live verification pass *was* possible this
time: the working copy was served locally and driven with a real browser
session against the actual application code (not a simulation).

- Admissions: opened a non-rejected application's detail view directly — no
  console error, drawer renders correctly.
- Finance: recorded expenses now show correct per-category counts (Rent: 1,
  Musicians: 2) matching the underlying entries.
- Backup/Restore: called the real `restore()` service function twice against
  the actual UAT demo dataset — once from a branch id absent in the restored
  data (confirmed cleared), once from a branch id present in the restored
  data (confirmed preserved).
- Regression sweep with the fixes applied: Dashboard, Admissions, Students,
  Timetable, Finance (Position, Ledger, Expenses, Payroll) and Settings all
  loaded and rendered correctly with zero console errors throughout.

## Manual UAT checklist

- [ ] Admissions: open several applications in different stages (awaiting
      review, under review, approved, rejected) — the detail drawer opens
      with no error for every one.
- [ ] Admissions: create two applications with the same applicant name and
      guardian phone — opening either one's detail view shows the other as a
      possible duplicate; opening an application with no real duplicate
      shows none.
- [ ] Finance → Expenses → By category: the Count column matches the actual
      number of expenses in each category; Amount totals are unchanged from
      before this release.
- [ ] Settings → Data → Restore a backup with a different branch set than
      currently selected, then reload — the branch selector no longer
      silently points at a branch that isn't in the restored data.
- [ ] Settings → Data → Restore a backup that still contains the currently
      selected branch — the selection is preserved, not reset.
- [ ] Payroll: prepare and pay a period as before — behaviour is unchanged.
- [ ] Regression check: everything verified in the v2.2.4 checklist
      (Admissions Wizard, Timetable green status, Attendance follow-up list,
      cross-branch clash message) still behaves as it did.

## Known issues

- Payroll's manual-entry vs. payroll-run double-posting risk (see above) is
  confirmed and understood but intentionally not fixed this round.
- Navigation-QA `/settings` flake — pre-existing, unrelated, unchanged.

## Upgrade

Replace the application files. No data steps are required.
