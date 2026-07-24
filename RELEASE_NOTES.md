# Release Notes — NATYAM ERP v2.5.0

**Release:** Admissions Migration to Cloud Firestore
**Date:** 24 July 2026
**Baseline:** v2.4.1
**Type:** Data-layer migration for one module only. Every screen, workflow
and field you already know stays exactly as it is — only where application
records live underneath changed. Every other module (Attendance, Fees,
Finance, Batches, Reports, Dashboard) is untouched, still on this browser's
local database.

---

## What changed for the academy

### Applications now live in the cloud, not just this browser

Until now, every admission application lived only in the local database of
whichever browser created it. That's now moved to Cloud Firestore — the
same cloud service Sign-In and Students already use — so application
records are no longer tied to one device. Nothing about how you take an
application, review it, approve it, or enrol it has changed; only where
the record is actually stored.

### Application numbers are unchanged

Every application still gets the same `NAT/APP/26/0007`-style application
number, generated exactly the same way as before. Nothing about this
numbering changed.

### Existing applications don't have to be typed back in

Cloud Firestore starts empty — it isn't a copy of whatever applications
already existed locally. A one-time migration tool now exists to carry
real, existing application records across instead of re-entering them by
hand. It's deliberately not part of the normal app — no button, no menu —
it's run once, by hand, from the browser DevTools console on the device
that holds the real data. See `docs/migrations/ADMISSIONS_DATA_MIGRATION.md`
for exactly how, including a safe "preview first, write nothing" mode.

### One thing that quietly wrote around the system is now fixed

Enrolling an approved application used to close it out in a way that
skipped some of the app's own bookkeeping. It never caused a visible
problem — but it needed a real fix as part of this move, since otherwise
it would have kept writing to the *old*, now-disconnected local storage
instead of the application records everyone can actually see. It's fixed;
it didn't change what it does, only how it saves it.

---

## For administrators / IT

- **`firestore.rules` must be republished** before this release works —
  it now also covers the `admissions` collection. Firebase Console →
  Firestore Database → Rules → paste the current file → Publish.
- **No other module changed.** Attendance, Fees, Finance, Batches,
  Timetable, Reports, Dashboard all continue to read and write this
  browser's local database exactly as before.
- **No data migrated automatically.** Cloud Firestore's admissions
  collection starts empty on its own — this release does not copy
  anything by itself. If real application records exist locally from
  before this release, run the one-time migration utility
  (`docs/migrations/ADMISSIONS_DATA_MIGRATION.md`) from the device that
  holds them, rather than re-entering them by hand.
- **If you're also migrating Students' historical data**, run the
  Students migration first — a handful of enrolled applications carry a
  reference to the student they became, which is only meaningful once
  that student already exists in Firestore. Nothing in the app currently
  reads that reference back, so this only matters if you're relying on
  it for your own records.
- **A trade-off worth knowing about:** enrolling an application used to
  involve a database write that could partially fail in a specific,
  narrow way (the same trade-off already disclosed in the v2.4.0 release
  notes for Students). That hasn't gotten better or worse in this
  release — see `docs/migrations/ADMISSIONS_MODULE_MIGRATION.md` for the
  specifics.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no
  undefined identifiers.
- Every existing caller of the Admissions repository (`admissions.
  service.js`, and the reports/dashboard/analytics/notifications/search
  screens that read from it) confirmed unchanged — the repository swap
  underneath is invisible to all of them, apart from the one repository-
  bypass fix described above.
- Login and the rest of the app still load with no console errors.

**Not verifiable from this environment:** actually submitting, reviewing,
approving, rejecting, reopening, or enrolling a real application against
Firestore requires being signed in with a real Google account in a real
browser — this automated environment can load and inspect the code, but
cannot complete that sign-in. The manual checklist below is what's
actually unverified and needs a real pass.

## Manual UAT checklist

- [ ] Publish the current `firestore.rules` (now including `admissions`)
      before testing anything else below.
- [ ] If real local admission data exists, run the migration utility's
      dry run (`docs/migrations/ADMISSIONS_DATA_MIGRATION.md`) and confirm
      the report's numbers look right before running it for real.
- [ ] Submit a new application through the wizard — gets an
      `applicationNo`, appears in the pipeline as "Awaiting review".
- [ ] Begin review, approve it, then enrol it into a batch — a student is
      created, the application shows as "Enrolled", both are correct.
- [ ] Reject an application, then reopen it — both work.
- [ ] Submit a second application with the same name and guardian phone as
      an existing one — the duplicate warning appears.
- [ ] Filter the applications list by branch and by stage — each filters
      correctly.
- [ ] As a Viewer-role account, confirm you can see the applications list
      but cannot submit, approve, or enrol.
- [ ] As an Owner & Accountant account, confirm you can approve/reject/
      reopen but cannot submit a new application (no `admission.edit`).
- [ ] Confirm the Dashboard's admissions panel, Reports' admissions
      breakdown, and global Search still show application data correctly.
- [ ] Confirm every other module (Students, Attendance, Fees, Batches)
      still loads and behaves exactly as before.

## Known issues

- No data migration: any real application data entered before this
  release stays in the old local-only storage and will not appear after
  upgrading (see "For administrators / IT" above).
- The atomicity trade-off for `enrolApplicant()` described above —
  accepted, not hidden, documented in full in
  `docs/migrations/ADMISSIONS_MODULE_MIGRATION.md` §9.

## Upgrade

Replace the application files, **and publish the updated `firestore.rules`**
— this release does not work without it. No IndexedDB migration is
required for any other module; only the Admissions screen's data source
changes.
