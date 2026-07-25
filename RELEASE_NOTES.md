# Release Notes — NATYAM ERP v2.14.0

**Release:** Settings Reference Data Migration & Completion
**Date:** 25 July 2026
**Baseline:** v2.13.0
**Type:** Data-layer migration for five modules, plus two correctness
fixes and one boot-time reliability fix found during review. No redesign
of branch, academic year, curriculum, level, or holiday management.

---

## What changed for the academy

### Branches, academic years, curriculum and holidays now live in the cloud

Branches, academic years, the curriculum structure, curriculum levels,
and holidays now live in Cloud Firestore instead of just this browser's
local storage. Nothing about how you create or edit a branch, set the
current academic year, or manage the curriculum has changed; only where
the record is actually stored. This is the module every other screen in
the app leans on — branch names, the branch switcher, and academic-year
context appear almost everywhere — so this release closes out the last
IndexedDB dependency across nearly the whole application.

### Two duplicate-code protections that were quietly relying on this browser

Two branches — or two curricula — could never share the same code before,
but that protection lived only in this browser's local database, not in
the application itself. It now checks explicitly and tells you clearly if
a code is already in use, the same protection your team already relies on
for Batches and Staff.

### A sign-in reliability improvement

If your branch list ever failed to load for a moment — a slow connection,
for instance — the app used to sign you back out and show a confusing
"not able to sign in" message, even though your account was perfectly
fine. It now shows the app with a clear note that branches couldn't load,
rather than locking you out.

---

## For administrators / IT

- **`firestore.rules` must be republished** — it now also covers
  `branches`, `academicYears`, `curricula`, `curriculumLevels`, and
  `holidays`. Firebase Console → Firestore Database → Rules → paste the
  current file → Publish.
- **No other module changed.** Students, Admissions, Attendance, Class
  Sessions, Programmes, Certificates, Batches, Staff, Fee Collection,
  Finance, Documents, Admission Drafts, Notifications, Reports, Dashboard
  all continue exactly as before.
- **No data migrated automatically.** These five Firestore collections
  start empty unless already populated by an earlier restore — including
  your branch list. **Publish the rules and restore your data before
  relying on this release**, or the branch switcher and academic-year
  context will be empty.
- **Who can manage these settings is unchanged** — Administrator only,
  exactly as before; the new Firestore rules enforce server-side what the
  app already enforced in the interface. Every role can still read branch,
  year, curriculum, and holiday data.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no
  undefined identifiers (113 modules).
- Every existing caller of these five repositories (the sign-in path,
  Settings, the branch switcher, Reports, Dashboard, Batches, Programmes,
  Finance, Admissions, Students) confirmed unchanged and loads cleanly.
- All 22 repository files (including all five new ones) load and execute
  in the browser with zero console errors, and the sign-in boot sequence
  — which now includes the reliability fix — runs cleanly end to end.

**Not verifiable from this environment:** actually creating a branch,
changing the current academic year, or editing the curriculum against
Firestore requires being signed in with a real Google account in a real
browser. The manual checklist below is what needs a real pass.

## Manual UAT checklist

- [ ] Publish the current `firestore.rules` (now including `branches`,
      `academicYears`, `curricula`, `curriculumLevels`, `holidays`) before
      testing anything else below.
- [ ] Confirm the branch switcher in the top navigation still shows your
      branches correctly, and sign-in still works normally.
- [ ] Create a new branch, then attempt to create another with the same
      code — confirm a clear "already exists" error.
- [ ] Edit a branch's code to clash with another branch's — confirm the
      same clear error (this path had no protection at all before).
- [ ] Close a branch.
- [ ] Add a new academic year, then set it as the current year — confirm
      only one year shows as current afterward.
- [ ] Add a curriculum, then attempt a duplicate code — confirm the error.
      Edit an existing curriculum's structure.
- [ ] Confirm the Dashboard's holiday banner (if any holidays are on
      record) still displays correctly.
- [ ] As a non-Administrator account, confirm you can see branches,
      academic years, and curriculum but cannot create or edit any of
      them.

## Known issues

None introduced by this release. See v2.4.0's through v2.13.0's release
notes for trade-offs carried forward from earlier migrations.

## Upgrade

Replace the application files, **and publish the updated
`firestore.rules`** — this release does not work without it, and sign-in
itself depends on it. No IndexedDB migration is required for any other
module; only these five screens' data source changes.
