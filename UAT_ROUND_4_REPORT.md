# NATYAM ERP v2.2.4 — UAT Round 4 Deliverables

Prepared against `New Bugs 4.docx`, which included 6 screenshots read
directly from the deployed v2.2.3 build (confirmed via `origin/main` commit
`de7dd98` — these are real regressions in shipped code, not stale
pre-fix behaviour, and one screenshot contained a literal JavaScript error
message that made root-causing precise rather than speculative).

---

## 1. Bug Fix Report

| # | Item | Status |
|---|---|---|
| 1 | Hidden Batch Conflict | Investigated — not hidden/archived data (already correctly excluded); reframed and fixed as a message-clarity issue |
| 2 | Timetable Green Status | Fixed |
| 3 | Attendance Pending Register Logic | Fixed |
| 4 | Admissions Wizard Regression | Fixed — one root cause explaining all three symptoms, plus a second, previously-masked bug found during full step-by-step verification |

Additionally, per explicit instruction: consolidated duplicated "is this
session's register marked" logic into one shared function, after confirming
three other candidate areas (batch availability, batch conflict detection,
week-date resolution) were already correctly single-sourced or too
narrow-scoped to warrant a new abstraction.

---

## 2. Root Cause Analysis

**Bug 1 — Hidden Batch Conflict.** `findConflicts()` (`js/services/batches.service.js`)
already excludes closed, archived, and soft-deleted batches — confirmed by
reading `batches$.active()` (filters `status === 'active'`) and the base
`Repository.all()`/`_visible()` (excludes `deletedAt` rows) directly; nothing
here was actually broken. The real mechanism: teacher-clash checks
intentionally run against every branch's active batches, not just the
candidate's own (unlike the room-clash check, which correctly stays within
one branch), because a teacher now assigned to more than one branch (v2.2.3)
genuinely cannot teach two overlapping sessions regardless of which branch
each is nominally at. The visible Batches list is scoped to one branch at a
time, so a same-teacher batch at another branch is real, active data that
simply isn't in the current view — not a ghost record. Confirmed with the
user before implementing: keep the check exactly as it is (narrowing it would
reopen the double-booking risk it exists to prevent), and clarify the
message instead.

**Bug 2 — Timetable Green Status.** `timetable()` (`js/services/batches.service.js`)
computed each day-column's date via a `nextDateFor(dayCode)` helper that
always searches *forward* from today for the next matching weekday. For any
weekday already passed earlier in the current calendar week, this produced
*next* week's date instead of this week's already-passed one. Since
attendance can never be marked for a future date (`postRegister` explicitly
rejects `date > localDate()`), the register-marked check could essentially
never be true except for the single column matching today — and the same
wrong date would have made the Take Register button (added in Round 3) throw
a "future date" error if clicked on any of those days. Confirmed with the
user before implementing, since the fix changes which calendar date each
day-of-week column displays when viewed partway through the week.

**Bug 3 — Attendance Pending Register Logic.** The Pending list's "Mark"
button (`js/modules/attendance/attendance.page.js`) carried only the
batch id, not the specific date `missingRegisters()` had already computed for
that entry. The shared click handler always opened the register for the
page's *currently displayed* date (defaulting to today), so clicking "Mark"
on an entry from several days ago instead opened today's register — which
could show "does not normally meet on [today]" and/or "already marked" for a
completely unrelated day. Investigated whether Pending / Timetable /
Attendance Records used different completion logic, per the request: they
didn't, really — all three already derive "done" the same way (an attendance
row exists for this batch+date). The defect was the wrong *date* reaching one
click path, not inconsistent completion logic.

**Bug 4 — Admissions Wizard Regression (one root cause, three symptoms).**
`js/ui/wizard.js`'s `paint()` function declared a local variable named
`current` (a DOM element lookup) that shadowed an outer function also named
`current` (the step accessor) for the rest of `paint()`'s scope. The later
call `current().onMount?.(...)` therefore tried to call a DOM element as a
function, throwing `"current is not a function"` on **every** step
transition — reproducing the exact error visible in one of the screenshots.
This single bug explains all three reported symptoms: the popup between
steps (the throw, caught and shown as a toast by the overlay's action
handler); the Batch step never finishing its load (its `onMount`, which
fetches real batch options, never ran because the crash happened first); and
the final button staying on "Continue" forever (the code that relabels it to
"Submit application" runs immediately after `paint()` in the same function,
and never got the chance to once `paint()` started throwing).

Per the explicit instruction not to assume this was the only issue, every one
of the 9 wizard steps was individually traced against how the wizard reads
values back out of the form (`absorb()`/`readForm()`) and against
`validateStep()`. This surfaced a second, previously-invisible bug: the Batch
step declared `fields: () => []` while separately rendering a real,
interactive `preferredBatchId` select via its own `onMount` — meaning the
wizard's value-reading mechanism was looking in the wrong place and would
silently discard whatever the user picked, even after the crash above is
fixed and the select renders correctly. This one had no visible symptom
before now, because the shadowing bug prevented the select from ever
rendering at all — nobody could have chosen anything to lose. All 8 other
steps were traced and found to already be internally consistent (plain field
lists with no custom render, or — for the final "Confirm" step — a read-only
summary with nothing for `absorb()` to miss).

A separate, unrelated root cause explains "Step 8 partially hidden": the
step rail's CSS was a single-row, horizontally-scrolling strip with its
scrollbar deliberately hidden; a wrap-instead-of-scroll fix already existed
in the codebase for narrow screens only (comment: *"so a late step is never
unreachable"*), never extended to normal desktop widths, where 9 steps
genuinely don't fit in one row.

---

## 3. Files Changed

| File | Bug(s) |
|---|---|
| `js/services/batches.service.js` | 1, 2 (also: removes now-dead `nextDateFor`/`DAY_CODES`) |
| `js/services/attendance.service.js` | 2, 3 (new shared `markedSessions()` helper) |
| `js/modules/attendance/attendance.page.js` | 3 |
| `js/ui/wizard.js` | 4 (shadowing fix) |
| `js/modules/admissions/admissions.page.js` | 4 (batch-step absorb fix) |
| `assets/css/components.css` | 4 (step-rail wrap fix) |
| `js/config/app.config.js` | version bump only |
| `CHANGELOG.md`, `RELEASE_NOTES.md` | documentation |

8 files changed this round (a 9th, `UAT_ROUND_4_REPORT.md`, is new).

---

## 4. Regression Report

- **Bug 1:** clash-check logic itself is byte-identical for the common
  same-branch case (the message text only gains a branch-name suffix, and
  only when the conflicting batch is at a different branch). No batch that
  previously participated in clash detection was removed from it.
- **Bug 2:** `timetable()`'s return shape is unchanged (`day`, `label`,
  `sessions[].date`/`registerMarked`, etc.) — only the *values* of `date` are
  now correct. `js/modules/batches/timetable.page.js` (the Round-3 tile
  rendering and Take Register button) needed no changes — it already
  consumed this data correctly.
- **Bug 3:** the day board's own per-batch cards (`data-open-batch` without
  `data-date`) are explicitly unaffected — the fallback path preserves their
  exact previous behaviour (open the currently-viewed date).
- **Bug 4:** the shadowing fix is a variable rename with no other logic
  change. The batch-step fix adds one field descriptor; `markup()` still
  renders via `step.render` exactly as before (unaffected by what `fields()`
  returns), so nothing about what's visually shown changed. The CSS fix
  removes a media-query gate; the narrow-screen behaviour (which already
  wrapped) is unchanged, only now the same treatment also applies above
  720px, where it previously didn't apply at all.
- No IndexedDB schema or version change. No button, screen, menu item, or
  workflow was removed. No file outside the 8 listed above was touched.
- Consolidation (`markedSessions()`): confirmed the query and key shape used
  by `missingRegisters()` before and after are identical — the same
  `attendance$.between(...)` call, the same `${batchId}|${date}` key — this
  is a code-location change only, not a behaviour change.

---

## 5. Desktop Test Report / 6. Mobile Test Report

**Not executed against a running instance** — this environment has no
Node.js, Python, or other runtime (confirmed by direct attempts: `node`,
`npm`, `python`, `python3`, `php`, `ruby`, `deno`, `bun` all absent or
Windows Store stubs only), so neither the `tools/*.mjs` checks nor a live
browser session could run here, on desktop or mobile viewport. In place of
that:

- Every one of the 6 screenshots supplied in the UAT document was read
  directly and matched line-for-line against the code that produced what it
  showed (the exact error text, the exact mismatched date, the exact clipped
  step).
- A full manual diff re-read of every changed file for syntax, import
  correctness (including an explicit circular-import check between
  `batches.service.js` and `attendance.service.js` for the new cross-file
  call), and no stale references to the removed `nextDateFor`/`DAY_CODES`
  (confirmed via direct search — zero remaining references).
- Every wizard step's `fields()`/`render`/`onMount`/`validate` was traced by
  hand against `wizard.js`'s `absorb()` and `go()`, not just the step the
  screenshot named.

**This is not a substitute for opening the app.** The Manual UAT Checklist
below (also in `RELEASE_NOTES.md`) is what still needs running by hand,
ideally by whoever filed the original report, before this ships.

---

## 7. Manual UAT Checklist

- [ ] Admissions: all 9 steps, no popup between any of them; Batch step
      finishes loading real options; a chosen preferred batch is still
      selected after navigating back and forward; final step reads "Submit
      application"; submitting works end to end.
- [ ] Admissions: on a normal desktop window width, all 9 step numbers are
      visible (wrapped onto a second row if needed), none clipped.
- [ ] Timetable: mark a register for a batch meeting earlier this week (not
      only today) — that tile turns green and stays green after a refresh; a
      day later in the week that hasn't happened yet is unaffected.
- [ ] Attendance: click "Mark" on a pending entry from a few days ago — it
      opens that day's register, not today's.
- [ ] Batches: trigger a teacher clash against a batch at a different branch
      (for a multi-branch teacher) — the message names that branch.
- [ ] Regression sweep: re-confirm the v2.2.3 checklist items still hold
      (Staff multi-branch, Branch columns, batch save/loading fixes, bulk fee
      collection, mobile navigation) — see `RELEASE_NOTES.md` for that list.

---

## Before Final Completion

**1. Total files changed:** 8 modified this round (plus this new report and
the docx it responds to).

**2. Complete file list:**
`js/services/batches.service.js`, `js/services/attendance.service.js`,
`js/modules/attendance/attendance.page.js`, `js/ui/wizard.js`,
`js/modules/admissions/admissions.page.js`, `assets/css/components.css`,
`js/config/app.config.js`, `CHANGELOG.md`, `RELEASE_NOTES.md`.

**3. Summary of every file changed:** see §3 (Files Changed) above.

**4. Confirmation no unrelated functionality was modified:** confirmed by
direct diff review (§4, Regression Report) — every change is scoped to the
exact function or component that owned the reported bug; no shared component
outside those was touched, and no file changed that isn't listed above.

**5. Confirmation all requested functionality from previous UAT rounds
remains intact:** Round 3's features (Staff multi-branch, Branch columns on
Staff/Students, batch save-error fix, batch loading-state fix, Timetable
Take-Register button, Attendance nav relocation, dashboard scroll fix,
bulk fee collection, mobile nav CSS) were not touched by any file in this
round except `batches.service.js`, `attendance.service.js`, and `wizard.js` —
and in each of those, the Round 3 additions (the `registerMarked`/`date`
wiring, the `attendance.service.js` exports, the render-priority fix) are
either reused as-is or extended, never reverted. Traced explicitly in §4.

**6. Remaining risks or assumptions:**
- No live browser or automated-check verification was possible in this
  environment (stated plainly above, not glossed over) — the Manual UAT
  Checklist must be run by hand before release.
- Local git history (`main`) is currently behind `origin/main` (which holds
  the actual deployed v2.2.3 commit); this round's edits were made directly
  on the working tree, whose content was verified byte-for-byte identical to
  `origin/main` before starting. Git history reconciliation (fast-forward,
  then a new commit for these changes) is a deliberate pending step, held
  for when you're ready to commit, rather than performed unilaterally with a
  destructive reset.
- Bug 1's fix is a message clarification, not a narrower check — this was
  confirmed with you directly before implementing, since the alternative
  (restricting clash detection to one branch) would reopen a real
  double-booking risk.
