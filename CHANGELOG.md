# Changelog — NATYAM ERP

All notable changes to this project are recorded here. The project follows a
phase-per-release model: each approved phase increments the version and produces
a completion report, a unified diff, and an updated application package.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and the
project aims to follow [Semantic Versioning](https://semver.org/).

---

## [2.5.0] — 2026-07-24 — Admissions Migration to Cloud Firestore

Admissions is the third module migrated to Cloud Firestore (see ADR-014 and
`docs/migrations/ADMISSIONS_MODULE_MIGRATION.md` for the full record).
Every other module — Attendance, Fees, Finance, Expenses, Batches,
Timetable, Reports, Dashboard — is unaffected and continues to run on
IndexedDB exactly as before.

### Added
- **`admissions` Firestore collection**, with the same field names the
  IndexedDB model used — no field renamed, and no new business-identifier
  field introduced: `applicationNo` already served that role and is kept
  unchanged, generated exactly as before (`settings$.nextSequence
  ('application')`, still IndexedDB — see the migration doc for why this
  wasn't moved to the centralized Firestore sequence generator).
- **`firestore.rules`** extended for the `admissions` collection: read for
  all four roles, create for Administrator and Teacher & Reception
  (`admission.edit`), update for Administrator, Owner & Accountant and
  Teacher & Reception (`admission.edit` or `admission.approve`), hard
  delete denied outright (no code path uses it today).
- **One-time data migration utility** (`js/migrations/
  admissionDataMigration.js`) to carry a school's existing IndexedDB
  admission records into the new Firestore collection — not part of
  normal application operation, no UI entry point, run manually from the
  browser DevTools console. See `docs/migrations/ADMISSIONS_DATA_MIGRATION.md`.

### Fixed
- **One call site that bypassed the Admissions repository entirely** —
  `admissions.service.js`'s `enrolApplicant()` closed an enrolled
  application via a raw IndexedDB transaction, not through `admissions$`.
  Left as it was, it would have silently kept targeting the now-orphaned
  IndexedDB store after this migration. Fixed to persist through the
  repository; the function's batch/capacity checks, fee-plan lookup, and
  student creation are otherwise unchanged.

### Changed
- The IndexedDB `AdmissionRepository` is archived, not deleted, at
  `js/data/archive/admissions.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route the `admissions` section through Firestore, the same fix already
  made for Students in Milestone 3.

### Known trade-offs
- `enrolApplicant()`'s student-creation and admission-closing writes now
  both target Firestore (previously split across Firestore and
  IndexedDB), but remain two sequential calls, not one atomic transaction
  — a true cross-collection transaction is technically possible now that
  both collections share one database, but wasn't implemented in this
  pass (see the migration doc's Future Enhancements). The pre-existing
  double-click risk this creates is unchanged from Milestone 3, not newly
  introduced.
- `firestore.rules`' `admissions` update rule does not replicate the full
  client-side approval/status state machine field-by-field — disclosed
  as a deliberate simplification in the migration doc §6.

---

## [2.4.1] — 2026-07-24 — Authentication Architecture Audit & Hardening

A review-only audit of the Google Authentication / Firestore Sessions /
IAM subsystem introduced in v2.3.0, followed by two low-severity hardening
fixes it identified. No new authentication method, no redesign, no change
to any other module. See `docs/audits/AUTHENTICATION_ARCHITECTURE_AUDIT.md`
for the full audit record.

### Fixed
- **AUTH-001 — Orphaned Firestore session records on cross-tab sign-out.**
  Signing out in one browser tab correctly signed every other open tab of
  the same origin out too (Firebase's own cross-tab auth propagation
  already handled that), but each tab's own audit-quality `sessions`
  record — tracked per-tab, not shared — was never told to close when the
  sign-out was *observed* from another tab rather than initiated locally.
  `js/app.js`'s `handleAuthStateChange` now best-effort closes this tab's
  session record (reason `cross_tab_signout`) before its existing reload.
  No user-visible behaviour changed; this only corrects bookkeeping in a
  collection nothing reads yet.
- **AUTH-002 — `session.role()`'s fallback defaulted to the most-privileged
  role.** A leftover default from the old five-role model returned
  `'administrator'` if `role()` were ever called before a user was
  hydrated. Not exploitable in practice — `session.can()`, the actual
  authorization check, never depended on `role()` and already fails
  closed — but the wrong default under a fail-secure standard. Now returns
  `null`. Verified against every caller; no behaviour change for any
  properly-hydrated session.

### Changed
- `js/data/sessions.repository.firestore.js`'s `end()` now documents a
  third valid `reason` value, `'cross_tab_signout'`, alongside the existing
  `'logout'` and `'idle_timeout'`.

---

## [2.4.0] — 2026-07-24 — Student Management Migration to Cloud Firestore

Student Management is the second module migrated to Cloud Firestore (see
ADR-014 and `docs/migrations/STUDENT_MODULE_MIGRATION.md` for the full
record). Every other module — Admissions, Attendance, Fees, Finance,
Expenses, Batches, Timetable, Reports, Dashboard — is unaffected and
continues to run on IndexedDB exactly as before.

### Added
- **`students` Firestore collection**, with the same field names the
  IndexedDB model used (`name`, `guardianPhone`, `level`, `admissionNo`, …
  — none renamed to match a generic example schema, since a dozen other
  files depend on these exact names).
- **`studentCode`** (`STU000001`) — the new, permanent, ERP-wide student
  identifier, generated automatically on every student creation. Kept
  alongside the existing `admissionNo`, which remains the Admissions
  module's own reference number and is not repurposed as a master
  identifier. See the Data Model doc for the distinction.
- **Centralized sequence generator** (`js/data/sequenceGenerator.firestore.js`)
  — one reusable, transaction-safe counter mechanism for every business
  code going forward. `users.repository.firestore.js`'s `nextUserCode()`
  now calls this instead of its own duplicate counter transaction.
- **Document Identifier Standard** adopted project-wide: a Firestore
  document ID is always a purely technical value, never a business
  identifier and never shown to a user. Documented in
  `docs/architecture/firestore-data-model.md`, along with a documented
  (not implemented) future subcollection hierarchy for student-scoped data.
- **`firestore.rules`** extended for the `students` collection, mapped
  directly from the existing role/capability model — read for all four
  roles, create/edit for Administrator and Teacher & Reception, archive/
  restore/hard-delete for Administrator only (enforced at the field level,
  so an editor without delete rights can't archive a student by editing one).
- **One-time data migration utility** (`js/migrations/studentDataMigration.js`)
  to carry a school's existing IndexedDB student records into the new
  Firestore collection — not part of normal application operation, no UI
  entry point, run manually from the browser DevTools console. Preserves
  `admissionNo` and original audit metadata, generates `studentCode` only
  where missing, skips (or optionally updates) records that already exist
  in Firestore, and never stops a batch on a single record's failure. See
  `docs/migrations/STUDENT_DATA_MIGRATION.md`.

### Fixed
- **Two call sites that bypassed the Students repository entirely** —
  `admissions.service.js`'s `enrolApplicant()` and `students.service.js`'s
  `bulkAssign()` both wrote directly to the IndexedDB `students` store via
  a raw transaction, not through `students$`. Left as they were, both would
  have silently kept targeting the now-orphaned IndexedDB store after this
  migration. Fixed to persist through the repository; each function's own
  business logic and validation are otherwise unchanged.

### Changed
- The IndexedDB `StudentRepository` is archived, not deleted, at
  `js/data/archive/students.repository.indexeddb.js` for rollback.

### Known trade-offs
- The atomic, single-transaction guarantee `enrolApplicant()` and
  `bulkAssign()` previously had (student write + audit/admissions write, one
  IndexedDB transaction) no longer holds now that the student write lands
  in a different database (Firestore) than its audit/admissions follow-up
  (IndexedDB). Both now write in a fixed, fail-safe order rather than
  atomically together — see the migration record's Risks section for the
  specific failure mode this accepts.

---

## [2.3.0] — 2026-07-24 — Google Identity & Session Foundation

Authentication moves from a local, offline-first login to Google Sign-In
backed by Firebase Authentication and Cloud Firestore — the first modules
migrated off IndexedDB under the project's Google-platform architecture
direction. Every other module (students, fees, attendance, finance, …) is
unaffected and continues to run on IndexedDB exactly as before.

### Added
- **Google Sign-In**, replacing the temporary local email/password login.
  Identity is verified by a real Google account; access still requires an
  administrator-provisioned, active record in Firestore's `users`
  collection — an unrecognised Google account is turned away with the same
  message whether it doesn't exist, was archived, or was deactivated.
- **AuthenticationProvider architecture.** AuthenticationService
  (`js/services/auth.service.js`) now delegates the actual sign-in
  mechanics to a provider (`js/services/auth/providers/`) — `GoogleProvider`
  today, and a `MobileOTPProvider` placeholder that makes adding Mobile+OTP
  sign-in later a matter of adding one file, not a redesign.
- **Firestore Sessions.** Every sign-in now creates an audit-quality
  session record (who, which provider, when it started and ended, and
  why) — the foundation for a future "active sessions" admin view.
- **Extended user profile.** Users now carry a `mobile` field and a
  `loginType` (`Google` today; `Mobile`/`Both` once phone sign-in exists).
- **Bootstrap Administrator.** The very first person to sign in on a
  brand-new Firestore project is automatically provisioned as Administrator,
  so there is always a way in on a fresh install.
- **Combined role model.** Replaces the previous five roles (Owner,
  Administrator, Registrar, Teacher, Accountant) with the four approved
  roles: Administrator (full system access), Owner & Accountant (business
  and finance), Teacher & Reception (academic operations), and Viewer
  (read-only) — matching Document 10 §8.
- **Firestore Security Rules** (`firestore.rules`) — the first real,
  server-enforced security boundary this application has ever had, for the
  `users`, `sessions`, and supporting `meta` collections.

### Changed
- The login screen now reads "Continue with Google", with a visibly
  disabled Mobile Number / Send OTP section marked "Coming soon" beneath
  it, matching the approved multi-login layout ahead of that feature
  actually existing.

### Removed
- The temporary local password login (`js/utils/crypto.js`, seeded
  passwords) is retired — Google Sign-In is now the only way in.

---

## [2.2.5] — 2026-07-23 — UAT Round 5

Three confirmed defects fixed after root-cause investigation; Payroll's
double-posting risk was investigated and confirmed but is deliberately left
unfixed this round (Payroll is scoped for exclusion from Phase-1, so no
further engineering effort is going into it here).

### Fixed
- **Opening an application's detail view no longer throws an error.** The
  duplicate-application check used at submission time returns a single
  match-or-nothing, by design. The detail view reused that same function as
  if it returned a list, which broke as soon as a match was found — and
  since the check has no way to exclude the application from matching
  itself, that was true for almost every non-rejected application. A
  dedicated lookup that returns every other matching application (never
  including the one being viewed) now backs the detail view; the
  submission-time check is untouched.
- **Finance → Expenses → "By category" now shows a real count.** The
  category totals were always correct; the count next to each one was never
  actually calculated, only defaulted to zero every time.
- **A branch selection can no longer point at a branch that no longer
  exists after restoring a backup.** Restoring a backup with a different set
  of branches left the previously remembered branch id in place even though
  it no longer matched anything, which could make other screens look like
  they were missing data. A restore now drops that memory only when it no
  longer refers to a real branch; a selection that is still valid survives
  the restore unchanged. Ordinary startup behaviour (no restore involved) is
  unchanged.

## [2.2.4] — 2026-07-23 — UAT Round 4

Four issues found testing the deployed 2.2.3 build, all traced to a specific
root cause rather than patched where they were seen — two of them turned out
to each explain more than one reported symptom.

### Fixed
- **The Admissions Wizard's step transitions no longer throw an error, the
  Batch step now fully loads, and the final step correctly reads "Submit
  application."** All three were one bug: a local variable inside the
  wizard's paint routine was named the same as an outer helper function it
  needed to call afterwards, so calling it called the wrong thing and threw
  on every step change. That single throw explains the popup between steps
  (it surfaced as a toast), the Batch step never finishing its load (the code
  that fetches available batches never got to run), and the last step's
  button never relabelling itself (a later step in the same function never
  ran either). Fixed by renaming the variable — nothing else about the wizard
  changed. Separately, a second, previously-invisible bug was found and fixed
  while verifying every step by hand: the Batch step's chosen preferred batch
  was rendered correctly but never actually saved, because the wizard looked
  for it in the wrong place. And separately again — the step rail (1 through
  9) could clip its later steps with no way to scroll to them on a normal
  desktop width; it now wraps onto more than one row instead, the same fix
  already used on phones, just no longer limited to them.
- **Timetable tiles can now actually turn green.** The date behind each day
  column was computed as "the next time this weekday comes around," which
  for any day already past this week meant a date still in the future —
  and attendance can never be marked for a date that hasn't happened yet, so
  the tile could never reflect it. Each day now shows its date within the
  current calendar week instead, so a Monday already gone by is shown (and
  checked) as itself, not pushed into next week.
- **Marking a register from the Attendance "unmarked this week" list opens
  the right day.** The list already knew the correct date for each entry; the
  button just wasn't passing it along, so every entry opened today's
  register instead of its own — which could show as "already marked" for a
  day that was never touched.
- **A batch-clash warning that named batches not in the current list has been
  clarified, not narrowed.** Investigation found the flagged batches were
  real, active, and correctly excluded nothing — a teacher assigned to more
  than one branch (2.2.3) genuinely cannot teach two overlapping classes even
  at different branches, and the check already looks across all of them. The
  visible list only shows one branch at a time, which is why the conflicting
  batch looked hidden. The message now names which branch it's at.

### Changed
- The two places that separately checked "is this session's register marked"
  (the Attendance follow-up list and the Timetable) now share one function,
  so that answer can't drift between them again.

---

## [2.2.3] — 2026-07-23 — UAT Round 3

Thirteen items from the third manual UAT pass. All are fixes or additive
changes to existing screens — nothing was redesigned, renamed or removed
outside what's listed below.

### Added
- **Staff can belong to more than one branch.** A teacher who works at both
  Hyderabad and Vizag is now selected onto both from one multi-select field,
  and the Staff list shows every branch they're based at (e.g. "Hyderabad,
  Vizag"). Existing single-branch records keep working unchanged — nothing
  was migrated, the new field is read defensively alongside the old one.
- **Students and Staff lists show a Branch column**, most useful in the "All
  branches" view.
- **Fee Collection supports collecting from several students in one sitting.**
  Select students with a balance due, "Collect selected," and record each
  payment with its own editable amount. Every payment still posts as its own
  independent receipt and audit entry — one student's payment failing (an
  amount that overshoots their balance, say) never touches the others, and a
  summary reports what succeeded and what didn't.
- **Timetable tiles turn green once that session's register has been taken**,
  and each tile now has its own "Take register" button.

### Changed
- **Attendance is reached from Timetable, not its own sidebar entry.** The
  separate "Attendance" link is gone from the left navigation; the `/attendance`
  route, and everything the module does, is unchanged — it's still reachable
  from a Timetable tile's "Take register" button or the Batches drawer's, exactly
  as before.
- **Print Receipt only appears in the student's Receipts list**, not as a
  prompt immediately after collecting a payment. Collecting money and printing
  its receipt are now two separate, deliberate steps.

### Fixed
- **Saving a new batch no longer shows a spurious error toast.** The service
  returns `{ batch, conflicts }`; the page was reading the wrapper as the
  batch itself, so a successful save still flashed "No batch was specified."
  right after the real success toast.
- **Batches no longer flash "No batches yet" after reopening the browser.**
  This was never a data-loss bug — a cold IndexedDB open is slow enough that
  the list's empty state rendered before the real rows arrived. It now shows
  a loading placeholder instead, and a stray earlier request can no longer
  overwrite a newer one's results.
- **The Admissions Wizard's batch-picker and final review step render their
  content again.** A step defining both an (empty) field list and custom
  content had the custom content silently skipped; this affected the wizard's
  4th step and its final "Confirm" step, which is also where "Submit
  application" lives — the button itself was never mislabelled, it just sat
  above a blank panel.
- **The Dashboard, and every other page, opens at the very top.** Restoring
  focus after navigation was nudging the scroll position by a few pixels
  right after it had just been reset to zero.
- **The mobile navigation drawer works across the whole tablet range.** A
  superseded responsive rule (from an earlier version of the sidebar) was
  fighting the current one at a different breakpoint, leaving a dead zone
  between 901–1024px where the menu button did nothing; and the dimming
  scrim was stacking on top of the open drawer instead of behind it.

### Verified, not changed
- The optional Course-of-Study field on Student, and Settings → Curriculum,
  are working as designed (added in 2.2.0) — confirmed to be the only place
  curricula are managed, with no duplicate or orphaned screen anywhere else in
  the app.

---

## [2.2.2] — 2026-07-22 — Final Stabilization

Resolves every item in the manual UAT report. Money moves to whole rupees, the
Level / Qualification ladder is replaced, and "Erase everything" now leaves a
genuinely empty installation. Three automatic migrations run on first open;
existing records are converted, not discarded.

### Fixed
- **Amounts no longer multiply themselves.** A monthly fee of ₹1,500 stayed
  ₹1,500 on the form but was stored scaled, so re-saving turned it into
  ₹1,50,000 and then ₹15,00,000, and the fee-collection screen offered 637500
  where 6375 was due. Amounts are now stored, entered and displayed as the same
  whole number, so there is no factor left to apply twice. Existing amounts are
  converted once on upgrade.
- **Students can be deleted from the list.** View, Edit and Delete sit on each
  row, alongside Archive for a pupil who may return. Deleting also removes that
  student's invoices, payments, attendance, certificates and documents, so
  nothing is left pointing at a record that no longer exists, and the
  confirmation says exactly what will go.
- **"Erase everything" really empties the application.** The erase cleared every
  table, and the next page load rebuilt the entire demonstration dataset —
  which is why staff, batches and registers appeared to survive it. An erase is
  now recorded, the seeder honours it, browser storage is cleared and the
  invoice and receipt counters are reset.
- **Every student can be cast in a programme.** The picker's tick boxes were
  invisible because the control was missing the element the stylesheet draws,
  and examinations were restricted to a single level so most of the roll arrived
  marked ineligible. Programmes are open to the whole school.
- **The "confirm before anything destructive" setting is visible again** — the
  same missing control element.
- **Form attributes are written correctly.** `step`, `inputmode`, `min`, `max`
  and `autocomplete` were being escaped into the markup as literal text, so a
  number field never had its step or keypad hint.

### Changed
- **Level / Qualification is the approved ladder:** Foundation Level 1 to 8,
  Intermediate Certificate, Intermediate Diploma, Advanced Masters, Advanced
  Theory, Advanced Practical. It is one flat, editable list — "Foundation",
  "Intermediate" and "Advanced" are part of each name, not separate fields.
  Existing students, batches, admissions and certificates are mapped onto the
  equivalent rung.
- **Fee plans are simpler.** Level, one-off registration fee and costume fee are
  gone. "Retire" is replaced by **Delete**, which removes the plan outright and
  unlinks any student still pointing at it.
- **The finance summary leads with the net position**, with income, expenditure
  and margin beside it and the period stated, instead of four competing cards.

### Added
- Sample data for testing: a full dataset (10 students across 3 batches, 3
  staff, attendance, fee plans and invoices, one programme) that loads through
  Settings → Data → Restore, plus student and staff CSVs for the importer.
- `tools/v222-check.mjs` — 48 assertions covering every issue above.

### Database / schema
- Schema version `4 → 6`. One migration converts stored amounts from scaled
  paise to whole rupees (marked per record so it cannot run twice), one maps the
  old dance grades onto the new ladder. Both are additive; no store is reshaped.

## [2.2.1] — 2026-07-22 — Stabilization Release

Fixes eight defects found in manual acceptance testing of v2.2.0 and replaces
the yearly fee model with monthly collection. No feature work. Two additive
schema migrations run automatically; existing records are preserved.

### Fixed
- **Student records can be managed from the list again.** View, Edit and
  Archive (or Restore) now sit on each row. Previously every action was behind a
  row click followed by a second "Actions" button, so the list appeared to offer
  no way to manage a student.
- **Radio buttons are visible and show what is selected.** The control emitted a
  decorative element carrying only a modifier class, so it had no size, no
  border and — because every checked-state rule targets the base class — no way
  to show a selection. Affects "Change status" on a student and "Kind" on a
  finance entry.
- **A student can be enrolled without first choosing a batch.** Every student
  must belong to a branch, but the form offered no Branch field and only
  inherited one from a batch, so enrolling without a batch failed with an error
  the form gave no way to satisfy. The form now has a required Branch selector,
  defaulted to the branch in view or the only branch.
- **Batch days read correctly and a batch saves first time.** The day labels
  were looked up with the wrong casing, and Code was enforced when saving but
  not marked as required on the form, so a save failed pointing at a field
  nothing had flagged.
- **Selection controls are properly contained.** The visually hidden input
  inside a checkbox, radio or switch had no positioning context and was placed
  against a distant ancestor.

### Changed
- **Fees are collected monthly.** A fee plan now stores what is due each month
  rather than a yearly total split into instalments, and yearly wording has been
  removed from the interface. Existing plans convert automatically by dividing
  the annual figure by twelve; the original figure is kept on the record.
  Frequency is stored on the plan and read from a registry that already declares
  quarterly, half-yearly, annual, workshop and one-time, so a future cadence is a
  configuration change rather than a redesign. Only Monthly is offered today.
- **The Level / Qualification list now carries the approved defaults** —
  Foundation Level 1 to 8, Intermediate Certificate and Diploma, Advanced
  Masters, Theory and Practical. These are a single flat, editable list; the
  prefixes are part of each name, not separate fields. They remain seed values
  only and are fully editable from the Curriculum module.
- Sequence counters are derived from the data actually seeded rather than fixed
  numbers, so invoice and receipt numbering cannot collide.

### Verified, no change required
- **Attendance colours.** Present, Absent, Late and Excused each have a colour
  rule for both the register button and the month grid, the tokens exist, and the
  active state is applied on click without a reload. No defect was reproducible.
- **Admission form controls.** These are switches, which were correctly styled.
  The reported fault matched the radio defect fixed above.
- **Settings editability.** Institute (all ten fields), branches, fee plans,
  users and preferences are all editable, and nothing was locked by Phase 2.
  Dance levels and role capabilities remain read-only by design, as they are
  referenced by existing records.

### Tests
- Added `tools/stabilization-check.mjs` — 62 assertions. Control styling is now
  verified by reading the stylesheet and asserting a rule exists for the class
  each control actually emits, including a reachable checked state. This closes
  the gap that let invisible controls pass a full green test run twice.

### Database / schema
- Schema version `2 → 4`. Migration 3 installs the approved Level / Qualification
  defaults and removes the untouched placeholders. Migration 4 converts fee plans
  to a monthly amount. Both are additive and idempotent; no store is reshaped.

## [2.2.0] — 2026-07-21 — Phase 2: Curriculum & Academic Structure

Adds a Curriculum module — courses of study with a configurable
Level → Stage → Lesson structure — and folds academic-year handling into
Settings. Curriculum is deliberately independent of batches. Backward
compatible: existing data is preserved and one additive schema migration runs
automatically.

### Added
- **Curriculum module** (new *Curriculum* item under Teaching). Create and edit
  curricula with a code, name, description, duration, sort order and
  active/inactive status.
- **Curriculum levels** — a reusable, editable vocabulary seeded with Beginner,
  Intermediate and Advanced. Levels can be renamed, reordered, retired and added
  without any code change.
- **Configurable structure** — each curriculum owns a Level → Stage → Lesson
  tree. Levels are drawn from the vocabulary; stages and lessons are added,
  renamed, reordered and removed in place. The tree is saved atomically on the
  curriculum record.
- **Student ↔ curriculum assignment** — an optional Curriculum field on the
  student form, shown on the student’s Overview. Assignment is independent of the
  batch: a student can follow any curriculum regardless of their class, and
  neither references the other.
- A worked example curriculum (*Kuchipudi Foundation*) is seeded on fresh
  installs and assigned to a slice of students to demonstrate the module.
- `tools/phase2-check.mjs` — 39-assertion Phase 2 regression suite.

### Changed
- **Academic year in Settings.** The standalone *Academic years* management tab
  is removed; a compact **Current academic year** control now lives in the
  *Institute* tab (shows the current year, switches between existing years, and
  can add a year). Past years remain stored for reporting.
- Application version bumped to `2.2.0`.

### Database / schema
- Schema version `1 → 2` (additive). New stores `curricula` and
  `curriculumLevels`; a new `curriculumId` index on `students`. A migration
  seeds the three default curriculum levels for both fresh and upgrading
  installs. No existing store or record is reshaped; no out-of-scope module is
  affected (fees, attendance, certificates, promotions, finance and roles are
  untouched, and reporting continues to derive the academic year from the date).

---

## [2.1.0] — 2026-07-21 — Phase 1 (RC1): Critical UI & Functional Bug Fixes

Six approved bug fixes across attendance, forms, batches, start-up and
notifications. No database, schema, or migration changes. Fully backward
compatible; existing data is untouched.

### Fixed
- **Attendance marking now shows colour.** Present displays green, Absent red,
  Late yellow, and Excused a neutral tone, on both the roll-call buttons and the
  month grid. The register buttons were emitting tone names (`success`,
  `danger`, `warning`, `info`) that did not match the stylesheet's
  (`positive`, `negative`, `caution`, `neutral`), so no colour was ever applied.
- **Selection controls in forms are visible and selectable again.** Checkboxes,
  radio buttons, switches, and checkbox groups (including the batch "Days"
  picker and the admission application's document/experience options) now render
  a visible control and a clear selected state. The markup was missing the
  decorative element the stylesheet styles; the underlying value binding was
  never affected.
- **Batches can be created.** The batch form now has a **Branch** field, so a
  batch is always attached to a branch. Previously the form offered no way to
  set a branch and every save was rejected with "Choose which branch this batch
  runs at." The field defaults to the active or only branch, so single-branch
  schools submit without extra steps, while multiple branches present a required
  choice.
- **Batch day selection is robust.** Selected days save and reload correctly
  when editing, and the scheduling-conflict check no longer risks a runtime
  error against a legacy batch whose days were stored in an older shape.
- **Start-up screen branding.** The loading screen now reads
  "NATYAM – School of Kuchipudi".
- **Notifications no longer overlap the header on phones.** On small screens the
  toast stack is anchored below the sticky header instead of on top of it, and
  is height-bounded. Stacking and spacing are unchanged on desktop and tablet.

### Changed
- Application version bumped to `2.1.0`. (This is app metadata; the IndexedDB
  schema version is unchanged, so no migration runs.)

### Tests
- Added `tools/phase1-check.mjs` — 21 assertions covering all six fixes
  (control markup + accessibility, attendance tone/stylesheet consistency, the
  batch branch field and create path, the day-conflict guard, the start-up text,
  and the mobile toast rule).

---

## [2.0.0] — 2026-07 — V2 baseline + Phase 0.5 (Architecture Preparation)

- Baseline NATYAM ERP V2 application: offline-first PWA, layered
  pages → services → repositories, versioned IndexedDB migrations, capability-
  gated navigation, and three automated suites (smoke, render-QA, navigation-QA).
- **Phase 0.5 — Architecture Preparation** (behaviour-identical, no schema
  change): introduced the reference-data resolution seam in `app.config.js`
  (`curriculum()`, `roleTable()`, `roleCapabilities()`, `roleLabel()`) and a
  boot-time override loader, so later phases can make the curriculum and role
  matrix editable without touching every reader. Added `tools/phase05-check.mjs`.

[2.1.0]: releases/phase-1
[2.0.0]: releases/baseline
