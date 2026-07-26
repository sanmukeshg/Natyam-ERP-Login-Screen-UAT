# Release Notes — NATYAM ERP v2.15.0

**Release:** Audit Log Migration & Completion — the final Firestore migration
**Date:** 26 July 2026
**Baseline:** v2.14.0
**Type:** Data-layer migration for the last remaining module, plus removal
of one confirmed-dead helper function found during review. No redesign of
what gets audited or how it's displayed.

---

## What changed for the academy

### The audit trail now lives in the cloud

Every action the app records — who created a student, collected a fee,
marked attendance, edited a batch — now writes its audit entry to Cloud
Firestore instead of just this browser's local storage. Nothing about
what you see on the Audit Log screen, how filtering works, or how an
activity is described has changed; only where the record is actually
stored.

**This completes the migration.** As of this release, every module in
NATYAM ERP — Students, Admissions, Attendance, Timetable, Programmes,
Certificates, Batches, Staff, Fee Collection, Finance, Documents,
Admission Drafts, Notifications, Branches, Academic Years, Curricula,
Curriculum Levels, Holidays, and now the Audit Log — lives in Cloud
Firestore. Nothing in the application's own data still depends on this
browser's local storage.

### A few extra spots found and fixed along the way

While retargeting the audit trail, four places were found writing audit
entries by a slightly different path than the rest of the app: enrolling
an applicant, moving a group of students between batches, signing in, and
the two one-time data-migration tools used earlier in this project. All
four now write through the same route as everything else, so no audit
entry is left behind on the old local storage after this release.

---

## For administrators / IT

- **`firestore.rules` must be republished** — it now also covers
  `auditLog`. Firebase Console → Firestore Database → Rules → paste the
  current file → Publish.
- **Who can see the audit trail is unchanged** — Administrator only,
  exactly as before; the new Firestore rule enforces server-side what the
  app already enforced in the interface. Every signed-in, active person
  can still *write* an audit entry as a side effect of their own normal
  work (collecting a fee, marking attendance, and so on), the same as
  today.
- **No data migrated automatically.** The `auditLog` collection starts
  empty unless already populated by an earlier restore. Existing audit
  history on this browser's local storage is untouched and still
  readable there if needed, but new activity from this release onward
  writes to Firestore only.
- **No other module changed.** Every previously migrated screen continues
  exactly as before.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no
  undefined identifiers.
- Every one of the 20 files with a private audit-row writer (19
  repositories plus the sign-in service), plus the 4 additional call
  sites found during review, confirmed retargeted with no remaining
  direct writes to the old local audit store.
- The Audit Log screen, its filters, the dashboard's recent-activity
  feed, and the CSV export all confirmed to call the same repository
  methods with the same signatures as before — no logic changes needed
  on the reading side.

**Not verifiable from this environment:** actually performing an action
and watching its audit entry appear requires being signed in with a real
Google account in a real browser. The manual checklist below is what
needs a real pass.

## Manual UAT checklist

- [ ] Publish the current `firestore.rules` (now including `auditLog`)
      before testing anything else below.
- [ ] Edit a record in at least three different modules (e.g. a student,
      a fee payment, an attendance register) and confirm each produces a
      correctly worded, correctly attributed entry on the Audit Log
      screen.
- [ ] Confirm the Audit Log's entity/action/date-range filters still
      work, and the CSV export still downloads correctly.
- [ ] Confirm the Dashboard's recent-activity feed still populates.
- [ ] Enrol an applicant from Admissions and confirm an "enrolled" audit
      entry appears.
- [ ] Move a group of students to another batch (bulk reassign) and
      confirm a "reassigned" audit entry appears.
- [ ] Sign in and sign out, and confirm both produce audit entries.
- [ ] As a non-Administrator account, confirm the Audit Log screen is not
      reachable (this was already true client-side; confirm it holds
      server-side too).
- [ ] Take a backup and confirm it includes an `auditLog` section;
      restore it and confirm the entries come back with their original
      ids and timestamps intact.

## Known issues

None introduced by this release. See v2.4.0's through v2.14.0's release
notes for trade-offs carried forward from earlier migrations.
`backup.service.js`'s `resetEverything()` still only clears IndexedDB
stores, not their Firestore equivalents — a pre-existing gap across all
24 collections, not something this release introduces or worsens.

## Upgrade

Replace the application files, **and publish the updated
`firestore.rules`** — this release does not work without it. No
IndexedDB migration is required for any other module; only the audit
trail's data source changes. This is the last data-layer migration
planned for this project.
