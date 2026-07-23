# NATYAM ERP v2.2.5 — UAT Round 5 Deliverables

Prepared against `New Bugs 5.docx`. The document's own "UAT Bugs" section was
a literal placeholder; the real defects were embedded as captions paired with
12 screenshots, extracted and matched to their exact screenshot via the
document's own image relationship IDs. Three parallel research passes then
traced every candidate item to its exact root cause in code before any fix
was written, per the round's explicit "reproduce and classify before
implementing" rule.

---

## 1. Bug Fix Report

| ID | Item | Status |
|---|---|---|
| BUG-501 | Admissions detail view crash / duplicate banner | Fixed |
| BUG-502 | Finance → Expenses → By category Count always 0 | Fixed |
| BUG-503 | Payroll can double-post a Salaries ledger entry | Confirmed bug — fix deferred per explicit instruction (Payroll scoped for exclusion from Phase-1) |
| BUG-504 | Stale branch selection can survive a Restore | Fixed |
| — | Curriculum Levels reorder buttons | By Design — traced and confirmed working correctly |
| — | Expenses "disappear until refresh" | Cannot Reproduce as a data-loss defect |
| — | Attendance "doesn't meet today" banner, duplicate Search UI, Academic Year Edit/Delete, Version & Build Info page, Payroll redesign/removal | Enhancement Backlog — explicitly out of scope this round |

---

## 2. Root Cause Analysis

**BUG-501 — Admissions detail view crash.** `applicationDetail()`
(`js/services/admissions.service.js`) called `admissions$.findLikeness()` —
a repository method designed for the submission-time duplicate guard, which
returns a single match-or-`null` — and then ran `.filter()` on the result as
if it were an array. Since `findLikeness` has no self-exclusion, it matched
almost every non-rejected application against itself, making the crash occur
on nearly every detail-view open. Confirmed via direct trace of both call
sites (`admissions.service.js:171` for the correct submit-time usage,
`:547-556` for the broken reuse) and reproduced live in a browser session
before and after the fix.

**BUG-502 — Expenses category count.** `ExpenseRepository.byCategory()`
(`js/data/repositories.js`, exported as `ExpenseMath`) accumulated summed
`amount` per category but never counted rows. `finance.page.js` was already
correctly rendering `category.count`; there was simply never a real value
behind it.

**BUG-503 — Payroll double-posting (confirmed, not fixed this round).**
`postEntry()` (`js/services/finance.service.js`) allows a manual ledger
entry on account `Salaries` with no relationship to the `salaries` store or
any period. `paySalaries()` only guards against re-paying the same
`salaries` record twice — it never checks `ledgerEntries` for an existing
manual `Salaries` posting for the same staff/period before posting its own.
The two paths can co-exist and double-count. Investigated and root-caused in
full; left entirely unchanged per explicit instruction, since Payroll is
scoped for exclusion from Phase-1 and no further engineering effort is
warranted there.

**BUG-504 — Stale branch selection after Restore.** `session.hydrate()`
(`js/core/session.js`) already correctly re-validates a remembered
`activeBranchId` against the current branch list — but `restore()`
(`js/services/backup.service.js`) never invalidated a now-stale id in
`localStorage` after replacing the branch data, so a leftover id from before
the restore stayed in storage. (`hydrate()`'s own startup fallback behaviour
for a *missing* preference — falling back to `branches[0]?.id` rather than
`null` — is unrelated to this bug and was explicitly left unchanged, per
instruction not to alter normal startup behaviour.)

**Curriculum Levels reorder buttons.** Traced `moveMasterEntry()`
(`js/services/settings.service.js`) end to end — a correct, symmetric array
swap with correct boundary guards, persisted and re-painted correctly. No
defect found; the reported "wrong order" is the correctly-persisted result
of a legitimate prior click.

**Expenses "disappear until refresh".** Traced the Expenses tab's render
path in `finance.page.js` — it builds full content, including real rows,
before painting; there is no empty-state paint that could read as "data
gone." The only related artifact is a harmless double-repaint from
`recordExpense()` firing two events in a row. No data-loss defect found.

---

## 3. Files Changed

| File | Change |
|---|---|
| `js/data/repositories.js` | Added `findAllLikeness()` (multi-match, self-excluded) alongside the untouched `findLikeness()`; added `count` tallying to `ExpenseMath.byCategory()` |
| `js/services/admissions.service.js` | `applicationDetail()` now calls `findAllLikeness()` instead of misusing `findLikeness()` |
| `js/services/backup.service.js` | `restore()` now clears a persisted `activeBranchId` only when it no longer matches any restored branch |
| `js/config/app.config.js` | Version bump `2.2.4` → `2.2.5` |
| `CHANGELOG.md`, `RELEASE_NOTES.md` | Documented all three fixes and the confirmed-but-deferred Payroll item |

No other files were modified. No schema change. No UI markup, CSS, or
workflow changed.

---

## 4. Business Impact

- **BUG-501:** Admissions staff can now reliably open any application's
  detail drawer — a daily-use workflow that was previously broken for
  almost every application.
- **BUG-502:** The Expenses category breakdown is now trustworthy for
  "how many," not just "how much."
- **BUG-504:** After restoring a backup, other screens (Batches, Students,
  etc.) no longer appear to be missing data because the branch selector was
  silently stuck on a branch that no longer exists.
- **BUG-503 (deferred):** A real double-counting risk remains in Payroll
  until a future release addresses it — flagged clearly, not silently
  accepted.

---

## 5. Regression Analysis

Verified live, not just by static review: the working copy was served
locally and driven with a real browser session against the actual
application code.

- **BUG-501 fix:** opened a non-rejected application's detail view directly
  post-fix — clean render, zero console errors (previously would have
  thrown on this exact action).
- **BUG-502 fix:** Finance → Expenses → By category now shows real counts
  (Rent: 1, Musicians: 2) matching the underlying expense entries exactly;
  Amount totals unchanged.
- **BUG-504 fix:** called the real `restore()` function twice via the live
  module (not a simulation) — once from a branch id absent in the restored
  data (confirmed cleared, `userId` preserved untouched), once from a branch
  id present in the restored data (confirmed preserved exactly).
- **Payroll (unchanged):** the Payroll tab was exercised post-fix and
  behaves identically to before — confirms leaving BUG-503 untouched had no
  side effects from the other changes.
- **Full-application sweep with all three fixes applied:** Dashboard,
  Admissions (list + detail), Students, Timetable, Finance (Position,
  Ledger, Expenses, Payroll), and Settings all loaded and rendered
  correctly with **zero console errors** at any point.
- No other repository, service, or UI code was touched, so no other surface
  is in scope for regression beyond what was exercised above; the sweep
  above additionally covers navigation, branch scoping, and IndexedDB reads
  across every touched and adjacent module.

---

## 6. Manual UAT Checklist

- [ ] Admissions: open several applications across every stage (awaiting
      review, under review, approved, rejected) — detail drawer opens with
      no error every time.
- [ ] Admissions: two applications sharing a name and guardian phone —
      opening either shows the other as a possible duplicate; an
      application with no real duplicate shows none.
- [ ] Finance → Expenses → By category: Count matches the actual number of
      expenses per category; Amount totals unchanged.
- [ ] Settings → Data → Restore a backup with a different branch set than
      currently selected, reload — branch selector no longer silently
      points at a branch absent from the restored data.
- [ ] Settings → Data → Restore a backup that still contains the currently
      selected branch — selection is preserved.
- [ ] Payroll: prepare and pay a period — behaviour unchanged from v2.2.4.
- [ ] Full regression pass per the v2.2.4 checklist (Admissions Wizard,
      Timetable green status, Attendance follow-up list, cross-branch clash
      message) — all still behave as before.

---

## 7. Final Verification Checklist

- ✅ Root cause fixed for all three implemented bugs (not symptom patches)
- ✅ No existing functionality changed or removed
- ✅ Backward compatibility maintained (no schema change, no signature
  changes to any existing, still-used function)
- ✅ Architecture preserved (UI → Modules → Services → Repositories →
  IndexedDB; all three fixes live entirely in the Repository/Service layers,
  with only `applicationDetail()`'s existing consumer inheriting a correctly
  shaped array — no UI file was changed)
- ✅ Mandatory regression review completed, live in a real browser
- ✅ No console errors, no runtime exceptions, across every module exercised
- ✅ Patch ready for the next UAT cycle

---

## 8. Release Readiness

**✅ Ready for UAT Retest.**

Outstanding: BUG-503 (Payroll double-posting) remains confirmed and
documented but intentionally unfixed, per explicit instruction. No git
operation (commit/push/merge) has been performed — awaiting approval.
