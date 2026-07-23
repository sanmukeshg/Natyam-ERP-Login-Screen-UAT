# NATYAM ERP v2.2.3 — UAT Round 3 Deliverables

Prepared against `New Bugs 3.docx`. Thirteen items, all addressed as fixes or
additive changes — no screen, button, menu item, or form field was removed
outside what the bug list and the follow-up conversation explicitly asked for.

---

## 1. Version Number

**v2.2.3** (was v2.2.2). Bumped in `js/config/app.config.js` (`APP.version`).
No IndexedDB schema version change (`SCHEMA.version` stays `6`) — nothing here
required a migration.

---

## 2. Bug Fix Report

| # | Item | Status |
|---|---|---|
| 1 | Staff multi-branch support | Fixed — added |
| 2 | Staff list Branch column | Fixed — added |
| 3 | Batch save error popup | Fixed |
| 4 | Curriculum references in Student screen | Investigated — not a bug (see §2a) |
| 5 | Batches "disappear then reappear" | Fixed |
| 6 | Timetable tile green on attendance marked | Fixed — added |
| 7 | Attendance folded into Timetable navigation | Fixed |
| 8 | Dashboard opens scrolled down | Fixed |
| 9 | Data retention / no overwrite | Verified — no change made or needed |
| 10 | Admissions Wizard step 8 / toast / Submit button | Fixed |
| 11 | Fee Collection multi-select + Print Receipt placement | Fixed — added |
| 12 | Mobile responsiveness — left navigation | Fixed |
| 13 | Students screen Branch column | Fixed — added |

### 2a. Item 4 — investigated, not fixed by removal, and why

The bug report describes the Curriculum field on the Student screen as an
orphaned leftover from a removed module. That's only half true: the
**standalone `/curriculum` screen** was removed in v2.2.0, exactly as the
report says — but the **feature itself** (a course-of-study a student can
optionally follow, managed from **Settings → Curriculum**) was deliberately
kept and is documented as intentional in `CHANGELOG.md` v2.2.0 and
`RELEASE_NOTES.md`. This was confirmed with the user mid-review, who asked
specifically to check for a **duplicate** management surface before deciding.
None exists: every curriculum CRUD call (`createCurriculum`, `updateCurriculum`,
`addStage`, etc.) traced to `js/modules/settings/settings.page.js` only — no
second screen, no leftover navigation entry, no command-palette or search
reference anywhere else in the codebase. The Student form's field is a
read-only consumer of that one source, the same way its Batch field assigns a
student to a batch without duplicating batch management. **No code change was
made for this item** — removing a working, singly-sourced feature because a
bug report assumed it was dead would itself have been the regression.

---

## 3. Root Cause Analysis

**Item 3 — Batch save error popup.** `createBatch()`/`updateBatch()` in
`js/services/batches.service.js` return `{ batch, conflicts }`, not the batch
record directly. `js/modules/batches/batches.page.js`'s `createBatch()` method
read the wrapper as if it were the batch (`created.name`, `created.id`, both
`undefined`), so it called `openBatch(undefined)` right after a fully
successful save, which threw "No batch was specified." The batch was never
actually lost — only the two toasts immediately after it were wrong.

**Item 5 — batches "disappearing."** Not a persistence bug. `batches.page.js`
mounted its `DataTable` with `rows: []` synchronously on render, which shows
the table's built-in empty state ("No batches yet") immediately; the real
rows only arrive once `load()`'s `listBatches()` call resolves. On a cold
IndexedDB open right after reopening the browser, that gap is long enough to
notice. The write path (`js/core/db.js`'s `tx()`, which resolves only on
`transaction.oncomplete`) already guarantees a write is committed before any
success toast fires, ruling out an actual commit race.

**Item 6/7 — Timetable/Attendance.** Each Timetable day column already stood
for a real calendar date (`nextDateFor(day)`, used only for the display label
before this release); Attendance records are keyed by `batchId|date|studentId`
with no separate "session" concept — so a tile's "has this been marked"
question is answerable directly from the batch id and that computed date, with
no new data model needed.

**Item 8 — Dashboard scroll.** The router's scroll-to-top on navigation
(`js/core/router.js`) was correct, but the very next line called
`this.viewport.focus?.()` with no `preventScroll`, which invokes the browser's
default scroll-into-view and can reintroduce a few pixels of scroll immediately
after the reset. This runs on every navigation, not just Dashboard's.

**Item 10 — Admissions Wizard.** `js/ui/wizard.js`'s step renderer used
`Array.isArray(list) ? renderFields(list) : (step.render ? step.render(data) : '')`.
Any step defining both an empty `fields: () => []` and a custom `render(data)`
had `render()` silently skipped, because an empty array still satisfies
`Array.isArray`. Two steps in `admissions.page.js` did exactly this: the
batch-picker step and the final review step — the one holding the "Submit
application" button's content. The button's label logic itself was already
correct; it just sat above a blank panel.

**Item 12 — Mobile navigation.** Two responsive blocks governed the same
sidebar drawer at different breakpoints (1024px in `shell.css`, an older,
superseded version; 900px in `modules.css`, the current one), and the older
block referenced an attribute (`data-sidebar="open"`) the app no longer sets
(it sets `data-nav="open"`). Between 901–1024px, only the dead block applied,
so the hamburger button showed but did nothing. Separately, the dimming scrim
and the sidebar shared the same z-index, and the scrim came later in the DOM,
so it painted on top of the open drawer instead of behind it.

---

## 4. Files Changed

| File | Item(s) |
|---|---|
| `js/config/app.config.js` | 1, 7, version bump |
| `js/data/repositories.js` | 1 (`branchIdsOf` helper, StaffRepository) |
| `js/services/staff.service.js` | 1 |
| `js/services/dashboard.service.js` | 1 |
| `js/services/settings.service.js` | 1 |
| `js/services/reports.service.js` | 1 |
| `js/services/students.service.js` | 13 |
| `js/modules/staff/staff.page.js` | 1, 2 |
| `js/modules/students/students.page.js` | 13 |
| `js/modules/batches/batches.page.js` | 3, 5 |
| `js/services/batches.service.js` | 6 |
| `js/modules/batches/timetable.page.js` | 6, 7 |
| `js/ui/shell.js` | 7 |
| `js/core/router.js` | 8 |
| `js/ui/wizard.js` | 10 |
| `js/modules/fees/fees.page.js` | 11 |
| `assets/css/shell.css` | 12 |
| `assets/css/modules.css` | 6, 12 |
| `CHANGELOG.md`, `RELEASE_NOTES.md` | documentation |

19 files changed. No files were deleted; no files were newly created except
this report and the two documentation files, which already existed and were
updated in place.

---

## 5. Regression Report

Nothing in this release removes, renames, hides, relocates, or redesigns
working functionality outside what items 7 and 11 explicitly asked for
(moving the Attendance nav entry, moving the Print Receipt button) — both
confirmed with the user before implementation. Specifically checked:

- **Admissions, Students, Parents, Staff, Batches, Timetable, Fee Collection,
  Finance, Settings, Reports, Analytics, Notifications** — no changes outside
  the files listed above; every other page's imports and behaviour are
  untouched.
- **Attendance module/service** — zero changes. Only its sidebar link moved;
  the route, the marking logic, and the Batches drawer's own "Take register"
  button are all exactly as before.
- **Curriculum** — confirmed untouched and confirmed not duplicated (§2a).
  Batch, Fee Plan, and every other Student-form field: unchanged.
  Fee Collection's existing single-student "Collect" button and flow: still
  present, unchanged in behaviour apart from the print-prompt removal.
  Staff's existing single-branch records: read defensively, no migration, no
  behaviour change for records nobody edits again.
- **Backup/restore, "Erase everything," and all other Settings → Data
  behaviour**: not touched by any file in this release.
- **IndexedDB schema**: unchanged (`SCHEMA.version` stays 6); `branchIds` is a
  plain field, not a new index, so no store or index was added, renamed, or
  removed.

---

## 6. Desktop Test Report

**Not executed against a running instance.** This environment has no Node.js,
Python, or other runtime available to serve the static app or run the
`tools/*.mjs` checks (`smoke.mjs`, `render-qa.mjs`, `navigation-qa.mjs`,
`phase*-check.mjs`, `stabilization-check.mjs`, `v222*-check.mjs`) — confirmed
by direct attempts (`node`, `npm`, `python`, `python3`, `php`, `ruby`, `deno`,
`bun` all absent or store stubs only). In place of a live run, every changed
file was read in full against its diff and checked for: balanced
braces/syntax, correct import/export paths (including a check for newly
introduced circular imports — none found), and that every call site touching
a changed function signature was located and updated (e.g. every place
filtering staff by branch, confirmed by direct search rather than assumption).

**This does not substitute for opening the app.** See the Manual UAT Checklist
below, which should be run in a real browser before this ships.

## 7. Mobile Test Report

Same constraint as above — no live viewport testing was possible in this
environment. The mobile-nav fix (item 12) was verified by re-reading the
resulting CSS cascade by hand: at ≤900px, `modules.css` supplies
`position/transform` and the correct `data-nav="open"` selector, and the
reconciled `shell.css` block (now also at 900px) supplies the box-shadow and
the `data-sidebar="collapsed"` overrides — confirming the two blocks now agree
on breakpoint and no longer produce the 901–1024px dead zone. The scrim's
z-index was changed to sit below the sidebar's. Manual confirmation in an
actual mobile/tablet viewport is still needed (checklist below).

---

## 8. Manual UAT Checklist

- [ ] Staff: add/edit a staff member with 2+ branches ticked; list shows all of them; switch between a single branch and "All branches" and confirm the roster changes correctly; payroll/reports staff counts still tally per branch.
- [ ] Students list shows a Branch column; Curriculum field still present and working on the student form.
- [ ] Create a batch: one success toast with its real name, drawer opens on it, no error popup.
- [ ] Create a batch, close and reopen the browser, open Batches immediately: loading placeholder shown, then correct data — nothing missing.
- [ ] Mark a register for a batch meeting today: that day's Timetable tile turns green; other days for the same batch unaffected; "Take register" button on the tile opens the right batch and date.
- [ ] Attendance is gone from the left sidebar; reaching it from Timetable and from the Batches drawer both still work; marking/correcting attendance is unchanged.
- [ ] Dashboard, and every other page, opens at the very top when navigated to; keyboard focus still lands sensibly.
- [ ] Admissions: step through all 9 steps; the batch-picker step (4th) and the final review step (9th) show their content; the last step says "Submit application" and submitting a real application works end to end.
- [ ] Fee Collection: single "Collect" still works with no print pop-up after; select 3+ students, "Collect selected," submit with one deliberately wrong amount — the others still go through, and the summary reports the failure; print each receipt from the student's Receipts list only.
- [ ] On a tablet-width window (roughly 900–1024px) and on a phone width: the hamburger opens/closes the drawer, the dimming layer sits behind the open drawer (not on top of it), and closing via the scrim or a nav link works.

---

## 9. Deployment Package

Per `README.md`, this application has **no build step and no separate
packaging process** — the deployment artifact is the file tree itself, served
statically (see `DEPLOY.md` for the GitHub Pages flow). Nothing about that
changed in this release: no new dependencies, no new files that need
including or excluding, no config beyond the version bump already in
`js/config/app.config.js`. Deploying this release is the same as any other:
push the folder contents to the hosting branch.

---

## 10. Patch Notes

See `CHANGELOG.md` (`## [2.2.3] — 2026-07-23 — UAT Round 3`) for the
developer-facing changelog and `RELEASE_NOTES.md` for the user-facing version,
both updated in place following the existing format from the v2.2.2 entry.
