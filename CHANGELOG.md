# Changelog — NATYAM ERP

All notable changes to this project are recorded here. The project follows a
phase-per-release model: each approved phase increments the version and produces
a completion report, a unified diff, and an updated application package.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and the
project aims to follow [Semantic Versioning](https://semver.org/).

---

## [2.15.0] — 2026-07-26 — Audit Log Migration & Completion (final migration)

The last entity off IndexedDB. All 24 entities in NATYAM ERP are now on
Cloud Firestore. Structurally different from every prior migration: there
was never one repository writing to this collection — 19 repository files
each had their own private `writeAuditRow(action, id, detail)` wrapper
writing `db.put('auditLog', ...)` directly, and four more direct write
sites turned up during implementation (`admissions.service.js`'s
`enrolApplicant()`, `students.service.js`'s `bulkAssign()`,
`auth.service.js`'s own Auth-entity writer, and the two one-time
IndexedDB→Firestore migration utilities). Every one of them now calls a
single shared writer instead — the row shape and every call site's
behaviour are unchanged, only where the row lands has moved.

### Added
- **`js/data/auditLog.repository.firestore.js`** — the `auditLog`
  collection. Unlike every other (small, bounded) collection's
  repository, `recent()` is a real Firestore `orderBy`+`limit` query
  rather than "fetch everything, sort, slice" — this is the one
  collection that grows on every write in the entire app, without bound.
  Exports `recordAuditEntry(entity, action, entityId, detail, actor?)`,
  the new single writer every other file's `writeAuditRow` calls into.
- **`firestore.rules`**: `auditLog` — read gated to `isAdministrator()`
  (matching `audit.view`, Administrator-only in `app.config.js`'s `ROLES`
  table); create open to any `isProvisionedActiveUser()`, since an audit
  row is a side effect of normal actions across every role, not just
  Administrators — the same asymmetry already accepted for
  `ledgerEntries` (Milestone 21). No update/delete path — append-only.

### Changed
- **20 files' private `writeAuditRow` wrappers** (the 19 repositories
  plus `auth.service.js`) now call `recordAuditEntry()` instead of
  `db.put('auditLog', ...)` directly — every call site unchanged, only
  the function body. `auth.service.js`'s wrapper needed an optional
  `actor` override (sign-in runs before a session exists to attribute a
  row to via `session.actorId()`), so `recordAuditEntry()` grew a 5th,
  optional parameter for it.
- **Four additional repository-bypass sites, found during
  implementation, not part of the original 19**: `admissions.service.js`'s
  `enrolApplicant()`, `students.service.js`'s `bulkAssign()`, and the
  one-time `admissionDataMigration.js`/`studentDataMigration.js`
  utilities each had their own direct `db.put('auditLog', ...)` call.
  All four now call `recordAuditEntry()` too.
- `js/data/repositories.js` — the old IndexedDB `AuditRepository` class
  removed; `audit$` re-exported from the new Firestore module, same name,
  zero changes needed in `audit.service.js`. The now-fully-unused
  `Repository` base-class import dropped from this file (nothing left in
  it extends the IndexedDB base class — every archived snapshot still
  does, for rollback fidelity, but nothing live).
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` extended
  for `auditLog`, the same fix already made for every prior migration.

### Removed
- **`audit.service.js`'s `auditRow()`** — a confirmed-dead export (zero
  real callers; its own doc comment described a design that stopped
  applying once Fee Collection/Finance centralized their audit writes
  into `ledger.repository.firestore.js`, Milestone 21). Removed rather
  than left beside the new canonical writer it was superseded by.

---

## [2.14.0] — 2026-07-25 — Settings Reference Data Migration & Completion

Branches, Academic Years, Curricula, Curriculum Levels, and Holidays — the
last data-shape migration before the Audit Log. The highest-blast-radius
migration by reach (branchId appears on nearly every record in the app)
but a small one by write volume: only `settings.service.js` and
`curriculum.service.js` ever write to any of these five, and no
repository-bypass bug exists in either. Two uniqueness gaps closed and one
genuine, pre-existing boot-time fragility fixed — not a redesign of
settings management.

### Added
- **Five Firestore collections** (`branches`, `academicYears`, `curricula`,
  `curriculumLevels`, `holidays`), same field shapes as the IndexedDB
  models. `branches.code` and `curricula.code` remain their human-facing
  identifiers exactly as before. `firestore.rules` extended: read open to
  every provisioned active user (branch/year/curriculum data is used
  across nearly every screen); write gated to Administrator only via a
  new `canManageSettings()` helper, matching `settings.edit`'s actual
  grant. Curriculum Levels and Holidays — which have no write path
  anywhere in the app today — are denied create/update/delete outright
  rather than granted speculatively.

### Fixed
- **`branches.code` and `curricula.code` uniqueness were enforced only by
  IndexedDB's native unique index**, not by application code — Firestore
  has no equivalent constraint. Both repositories' `create()`/`update()`
  now check explicitly for a clashing code, the same fix Batches got in
  Milestone 19. `createBranch()` had a partial manual check that missed
  `updateBranch()`; `curriculum.service.js`'s create/update had no check
  at all.
- **A genuine boot-time fragility**: `js/app.js`'s `hydrateSession()` —
  called on every sign-in and every reload — read `branches$.active()`
  with no try/catch of its own. Any failure there was caught by the outer
  handler around `resolveProvisionedUser()` and misdiagnosed as "not
  provisioned, inactive, or archived," signing the person back out with a
  misleading message. Harmless while branches was IndexedDB (a read
  essentially never failed); dangerous now that it's a Firestore read that
  can genuinely fail (permission-denied during rules propagation, a
  dropped connection). Fixed to degrade gracefully instead — a signed-in,
  provisioned person now sees the app with an explanatory toast rather
  than being bounced to the login screen.

### Changed
- **`academicYears$.makeCurrent(id)`** — the one genuine multi-document
  atomic write among these five, keeping "exactly one current year" true
  — now uses a Firestore `writeBatch()` in place of the original's raw
  IndexedDB transaction, preserving the same read-outside/write-inside
  shape.
- The five IndexedDB repository classes are archived, not deleted, at
  `js/data/archive/*.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route all five sections through Firestore, the same fix already made
  for every prior migration; the branch-selection cleanup on restore now
  reads from the Firestore-sourced rows instead of the generic backup
  bucket it used to.

---

## [2.13.0] — 2026-07-25 — Documents + Admission Drafts + Notifications Migration & Completion

Three small, independent modules — Documents, Admission Drafts, and
Notifications — migrated together in one milestone rather than three,
since each has exactly one consuming service file and none is atomically
coupled to any other store. One genuine repository-bypass bug was found
and fixed. No redesign of drafts, documents, or the notification feed —
notifications remain global (not per-user), exactly as before.

### Added
- **Three Firestore collections** (`documents`, `admissionDrafts`,
  `notifications`), same field shapes as the IndexedDB models. None had a
  human-facing business code before — nothing new introduced.
- `firestore.rules` extended with three new collection blocks. None of the
  three has its own capability in the app — rules faithfully mirror that:
  Documents' only real check is the student-deletion cascade
  (Administrator only); Admission Drafts have no capability check beyond
  being signed in, matching `saveDraft()`/`discardDraft()`'s actual
  behaviour exactly; Notifications are read/mark-read by anyone signed in
  (matching the global bell badge), with one precise exception —
  posting or removing an **announcement** requires Administrator,
  translated directly from `announce()`/`removeAnnouncement()`'s existing
  `settings.edit` check via a field-level rule on the `announcement` flag.

### Fixed
- **`saveDraft()` and `discardDraft()` bypassed the drafts repository**,
  writing directly via `db.put()`/`db.remove()` instead of
  `drafts$.create()`/`.update()`/`.remove()` — the same class of defect
  fixed for Certificates' `issue()` (Milestone 18) and Fee Collection's
  `createInvoice()`/`sweepOverdue()` (Milestone 21). Once the store moved
  to Firestore this would have failed outright — saving a draft mid-
  application is core to how the admissions wizard survives an interrupted
  session. Rewritten to preserve the exact same id-reuse and timestamp
  behaviour the raw writes had.

### Changed
- The three IndexedDB repository classes are archived, not deleted, at
  `js/data/archive/*.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route all three sections through Firestore, the same fix already made
  for every prior migration.

---

## [2.12.0] — 2026-07-25 — Fee Collection + Finance Module Migration & Completion

Fee Collection (`feePlans`, `invoices`, `payments`) and Finance
(`ledgerEntries`, `expenses`, `salaries`) — six stores, migrated together
in one milestone because they were atomically coupled: recording a
payment, refunding one, recording an expense, editing one, removing one,
and disbursing payroll all wrote across multiple stores (including the
ledger) in a single IndexedDB transaction, specifically to prevent a
payment landing with no ledger income behind it, or vice versa. This is
the ninth through fourteenth stores moved to Cloud Firestore, and the
first migration requiring a genuine multi-collection atomic transaction —
Firestore's own `runTransaction()`/`writeBatch()` now provide the same
guarantee IndexedDB's `db.unit()` used to. Two repository-bypasses and one
real correctness bug were found and fixed during the review; no other
module's business logic changed.

### Added
- **Six Firestore collections** (`feePlans`, `invoices`, `payments`,
  `ledgerEntries`, `expenses`, `salaries`), same field shapes as the
  IndexedDB models. Invoice numbers and receipt numbers keep working
  exactly as before — allocated from the settings counter
  (`settings$.nextSequence()`, still IndexedDB), which was always the real
  uniqueness guarantee; the IndexedDB unique index was a secondary guard
  that didn't need replacing, unlike Batches' `code` field.
- **The atomic cross-collection postings** — `postPayment()`,
  `postRefund()`, `postExpenseCreate()`, `postExpenseUpdate()`,
  `postExpenseRemove()`, `postPayroll()` — now live in
  `js/data/ledger.repository.firestore.js`, since Firestore SDK access is
  reserved to the repository layer. `fees.service.js`/`finance.service.js`
  still own every validation decision; the repository layer performs the
  atomic write and re-verifies an invoice's live balance/status with a
  fresh read where a concurrent payment could have changed it.
- `firestore.rules` extended with six new collection blocks. One real,
  pre-existing asymmetry in the app's own capability model is now also
  enforced server-side: Teacher & Reception can create a ledger entry (by
  collecting a fee payment) but cannot read the ledger — they hold
  `fee.collect` but not `finance.view`.

### Fixed
- **`createInvoice()` and `sweepOverdue()` bypassed the invoice
  repository**, writing directly via `db.put()`/`db.putMany()` instead of
  `invoices$.create()`/`.update()` — the same class of defect fixed for
  Certificates' `issue()` in Milestone 18. Once the store moved to
  Firestore this would have failed outright.
- **Salary adjustments involving allowances persisted an understated
  `net`.** `SalaryRepository.beforeSave()` unconditionally recomputed
  `net: gross - deductions`, silently dropping `allowances` — even though
  `adjustSalary()` always computed the correct `gross + allowances -
  deductions` and handed it in. Fixed in the new repository; the archived
  IndexedDB snapshot keeps the original formula unchanged, per the archive
  convention.
- `waiveInvoice()`/`cancelInvoice()` no longer need a multi-store
  transaction — they only ever touched `invoices`, so they now call
  `invoices$.update()` directly, which is simpler and writes its own audit
  row the same way every other Firestore repository does.

### Changed
- The six IndexedDB repository classes are archived, not deleted, at
  `js/data/archive/*.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route all six sections through Firestore, the same fix already made for
  every prior migration.

---

## [2.11.0] — 2026-07-25 — Staff Module Migration & Completion

Staff is the eighth module migrated to Cloud Firestore, following the
exact pattern already established for Students/Admissions/Attendance/Class
Sessions/Programmes/Certificates/Batches. Chosen specifically because it
carries no atomic multi-store transaction coupling to any remaining
IndexedDB store (verified by auditing every `db.unit([...])` call in the
codebase) — unlike Fee Collection and Finance, which turned out to be
atomically coupled via a shared transaction and must be migrated together,
later, as their own milestone. No repository-bypass and no uniqueness gap
were found this time; this is a clean lift-and-shift plus one internal
relocation. No redesign of hiring, deactivation, or payroll-prep logic.

### Added
- **`staff` Firestore collection**, same field shape as the IndexedDB
  model. `employeeNo` remains the staff member's human-facing identifier
  exactly as before — its uniqueness was already enforced at the service
  layer (`hire()`), not by a storage constraint, so nothing changes there.
  `firestore.rules` extended: read open to every provisioned active user
  (all four roles hold `staff.view`); create/update gated to Administrator
  only via a new `canManageStaff()` helper (`staff.edit` is held by no
  other role).

### Changed
- **`branchIdsOf()`** — the helper that resolves a staff member's branch
  memberships — moved from `js/data/repositories.js` into the new
  `js/data/staff.repository.firestore.js` (it was Staff-domain logic with
  no store dependency of its own) and is re-exported from
  `repositories.js` unchanged, the same pattern already used for
  `AttendanceMath`. Every existing caller keeps importing it from the same
  place with no code changes.
- The IndexedDB `StaffRepository` is archived, not deleted, at
  `js/data/archive/staff.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route the `staff` section through Firestore, the same fix already made
  for Students, Admissions, Attendance, Class Sessions, Programmes,
  Certificates, and Batches.

---

## [2.10.0] — 2026-07-25 — Batches Module Migration & Completion

Batches is the seventh module migrated to Cloud Firestore, following the
exact pattern already established for Students/Admissions/Attendance/Class
Sessions/Programmes/Certificates — and the most load-bearing one yet:
`batches$` is read directly by eleven other services, all of which now
run entirely on Firestore with no remaining IndexedDB dependency. One
application-level fix was required — a uniqueness guarantee that was only
ever enforced by IndexedDB's storage layer. No redesign of scheduling
rules, conflict detection, or the UI.

### Added
- **`batches` Firestore collection**, same field shape as the IndexedDB
  model. `code` (e.g. HYD-PRA-A) remains the batch's human-facing
  identifier exactly as before — no new business-identifier field was
  introduced. `firestore.rules` extended: read open to every provisioned
  active user (all four roles hold `student.view`, which gates the
  Batches/Timetable nav entries); create/update reuses the existing
  `canManageStudents()` helper directly rather than introducing a new
  one — batch lifecycle actions have always piggybacked on `student.edit`
  (there is no separate `batch.edit` capability), the same situation
  Class Sessions is already in.

### Fixed
- **Batch code uniqueness was enforced only by IndexedDB's native unique
  index**, not by any application code — Firestore has no equivalent
  constraint. `create()`/`update()` on the new repository now check
  explicitly for a clashing code and raise a clear error, replacing the
  guarantee the index used to provide. This is the one behavioural
  addition in an otherwise lift-and-shift migration.

### Changed
- The IndexedDB `BatchRepository` is archived, not deleted, at
  `js/data/archive/batches.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route the `batches` section through Firestore, the same fix already
  made for Students, Admissions, Attendance, Class Sessions, Programmes,
  and Certificates.

---

## [2.9.0] — 2026-07-25 — Certificates Module Migration & Completion

Certificates (level completions, participation, merit awards, performance
diplomas) is the sixth module migrated to Cloud Firestore, following the
exact pattern already established for Students/Admissions/Attendance/Class
Sessions/Programmes. A repository-bypass in certificate issuance and a
pre-existing display bug found during the migration review were also
fixed. No new features, no redesigned eligibility rules, no other module
changed.

### Added
- **`certificates` Firestore collection**, same field shape as the
  IndexedDB model. `serial` (NAT/CRT/YY/0000, allocated from the settings
  counter) remains the certificate's human-facing identifier exactly as
  before — no new business-identifier field was introduced.
  `firestore.rules` extended: read open to every provisioned active user
  (all four roles hold `program.view`, which also gates the Certificates
  page); create/update gated to Administrator only (`certificate.issue` is
  not held by any other role); the one hard-delete path (a student's
  certificates, cascade-deleted along with the rest of their record when
  the student itself is deleted) gated to Administrator, mirroring
  Attendance's precedent.

### Fixed
- **`issue()` wrote directly to IndexedDB, bypassing the repository
  entirely.** `certificates.service.js`'s `issue()` used a raw
  `db.unit(['certificates', 'auditLog'], ...)` transaction instead of
  going through `certificates$`, the same class of defect fixed for
  Admissions' `enrolApplicant()` in Milestone 5. Once the store moved to
  Firestore this would have failed outright — issuing a certificate is the
  module's core function. Now routes through `certificates$.create()`.
- **A revoked certificate's reason never displayed.** `revoke()` writes
  `revokeReason`; the certificate detail drawer and the public verify
  banner both read `certificate.revocationReason` — a field that was never
  set. Always showed "No reason recorded," even when one had been given.
- **The verify-a-serial dialog showed garbled results.** It treated
  `verify()`'s return value (`{ found, valid, certificate, message }`) as
  if it were the certificate itself, reading `found.studentName` /
  `found.templateName` / `found.issuedOn` — none of which exist at that
  level — and an `if (!found)` check that could never be true. The service
  already builds the correct human-readable message for every outcome;
  the dialog now just displays it.

### Changed
- The IndexedDB `CertificateRepository` is archived, not deleted, at
  `js/data/archive/certificates.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route the `certificates` section through Firestore, the same fix already
  made for Students, Admissions, Attendance, Class Sessions, and
  Programmes.

---

## [2.8.0] — 2026-07-25 — Programmes Module Migration & Completion

Programmes (performances, workshops, competitions, examinations) is the
fifth module migrated to Cloud Firestore, following the exact pattern
already established for Students/Admissions/Attendance. Two pre-existing
display bugs found during the migration review were also fixed. No new
features, no integrations with Batches/Timetable/Sessions/Attendance were
added — none were already intended, so none were introduced. No other
module changed.

### Added
- **`programs` Firestore collection**, same field shape as the IndexedDB
  model, no new business-identifier field (a Programme was never addressed
  by one — people reference it by name and date, and none was invented
  here). `firestore.rules` extended: read open to every provisioned active
  user (all four roles hold `program.view`), write gated to Administrator
  and Teacher & Reception (`program.edit`).

### Fixed
- **The cancellation reason never displayed.** `cancel()` writes
  `cancelReason`; the cancelled-programme banner read
  `program.cancellationReason` — a field that was never set. Always showed
  "No reason recorded," even when one had been given. Fixed to read the
  field the service actually writes.
- **Completion notes never displayed.** `complete()` writes `notes`; the
  detail view read `program.completionNotes` — again, never set. Fixed the
  same way.

### Changed
- The IndexedDB `ProgramRepository` is archived, not deleted, at
  `js/data/archive/programs.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route the `programs` section through Firestore, the same fix already
  made for Students, Admissions, Attendance, and Class Sessions.

---

## [2.7.0] — 2026-07-25 — Timetable Session Management & Session Lifecycle

Introduces a first-class Timetable Session entity — an individual
occurrence of a batch's recurring class, with its own lifecycle (Scheduled
→ Completed / Postponed / Cancelled) and history. Attendance now records
against a Session rather than a raw batch+date pair, using the upgrade
seam Milestone 6 was deliberately built around. No other module changed.

### Added
- **`classSessions` Firestore collection** — Timetable owns this entirely;
  Attendance references a session by id but never reads or writes the
  collection itself (enforced by architecture: only `session.service.js`
  touches it). Sessions are scheduled lazily — the first time a register is
  opened/marked for a batch+date, or an explicit postpone/cancel action —
  not pre-created for the whole future calendar.
- **Session Postpone**, from the Timetable page: captures a reason,
  optional remarks, and a new date/time/teacher. The original session is
  marked Postponed and kept permanently in history — never deleted — and
  a linked Replacement session is created atomically alongside it
  (`originalSessionId`/`replacementSessionId` point at each other).
  Attendance can only ever be recorded against the Replacement.
- **Session Cancel**, from the Timetable page: captures a reason and
  remarks; the session is marked Cancelled, kept in history, and can never
  have attendance recorded against it. No replacement is created.
- **Session Code** (`TS-20260714-JUNIOR`-style) — a human-readable
  identifier derived directly from the batch's code and the date, not the
  shared atomic sequence counter (a batch+date pairing is already
  guaranteed unique on its own).
- Timetable's week view now shows each day's real session status
  (Postponed/Cancelled badges) and surfaces a Replacement session on its
  actual date, even when that date isn't one of the batch's normal
  recurring days. Clash detection now ignores Postponed/Cancelled slots,
  since they no longer occupy their time.
- `firestore.rules` extended for `classSessions` — read open to every
  provisioned active user (matching Timetable's own visibility), write
  gated the same way batch management already is.

### Changed
- **Attendance's `postRegister()` now resolves and checks a Session before
  writing.** A Postponed original or a Cancelled session can never be
  marked; a Scheduled session becomes Completed automatically the moment
  its register is successfully posted. Attendance rows carry a new
  `sessionId` field, added alongside the existing `batchId`/`date` fields
  — every existing read path (Week/Range/Month grids, reports, dashboard)
  is unchanged.
- The `isScheduledClassDay()` helper Milestone 6 built specifically for
  this future upgrade has moved from `attendance.service.js` to
  `session.service.js` — its rightful home now that a real Session concept
  exists — and is imported back into `attendance.service.js` and
  `batches.service.js` from there rather than duplicated.
- `js/services/backup.service.js` extended for `classSessions` — the first
  Firestore collection with no prior IndexedDB history at all, so
  `restore()`'s recognition filter was widened (`FIRESTORE_ONLY_SECTIONS`)
  rather than inventing a fictional unused IndexedDB store declaration.

### Known limitations
- No historical backfill: sessions only exist from this release forward;
  a register marked before this milestone has no session behind it.
- `originalSessionId`/`replacementSessionId` (and Attendance's own
  `sessionId`) are not remapped across a full backup restore — restoring
  reassigns every document a fresh Firestore id, so these cross-references
  would point at ids that no longer exist after a restore. Disclosed, not
  fixed, matching the same class of limitation already accepted for
  Admissions' `studentId` reference in Milestone 5.
- Timetable's teacher-schedule view (`teacherSchedule()`, used by the
  Dashboard's teacher panel) and Attendance's `missingRegisters()`/
  `teacherCompliance()` are not session-status-aware — a Postponed or
  Cancelled date can still appear there as an ordinary day. Not extended,
  per this milestone's explicit scope (do not redesign Attendance or
  Reports unless required).

---

## [2.6.0] — 2026-07-25 — Attendance Migration to Cloud Firestore

Attendance is the fourth module migrated to Cloud Firestore, alongside
three approved business simplifications: NATYAM has no Leave concept,
Attendance records only Present/Absent, and Holiday handling is no longer
part of Attendance's scope. Every other module (Fees, Finance, Batches,
Timetable's own scheduling, Reports, Dashboard) is otherwise unaffected.

### Added
- **`attendance` Firestore collection**, same field shape as the IndexedDB
  model. The old unique composite index (`batchId|date|studentId`) is
  replaced by a query-then-upsert against the plain `batchId`/`date`
  fields — Firestore has no equivalent index type — while keeping the same
  guarantee: re-marking a register updates it, never duplicates it.
- **Week View (default), Custom Date Range, and Month View** replace the
  previous single-date register screen. Week and Custom Range are marked
  directly in the grid; Month is unchanged, promoted from a drawer button
  to an equal-standing tab. All three show only the days a batch actually
  meets, and Week/Range totals are computed automatically.
- **Attendance restored to the main navigation**, positioned immediately
  after Timetable — previously hidden (still reachable only via
  Timetable's "Take register" link).
- **`firestore.rules`** extended for the `attendance` collection:
  `attendance.view` (Administrator, Teacher & Reception, Viewer — Owner &
  Accountant does not hold this capability) for reads, `attendance.mark`
  (Administrator, Teacher & Reception) for writes.

### Changed
- **Attendance now records only Present or Absent.** Late, Excused, and
  Holiday statuses are removed from `ATTENDANCE_STATUS` and from every
  calculation that read them (`AttendanceMath.rateOf()`/`breakdownOf()`,
  the Attendance Register report, `seed.js`'s demo data generator).
- **Attendance can only be marked for a scheduled class.** `postRegister()`
  now hard-rejects a date the batch doesn't meet on, enforced through one
  function (`isScheduledClassDay()`) backed by the batch's own weekly
  schedule for now — deliberately isolated behind this one seam so a
  future Timetable-based session concept can become the real source of
  truth later without any other part of Attendance changing.
- The IndexedDB `AttendanceRepository` is archived, not deleted, at
  `js/data/archive/attendance.repository.indexeddb.js` for rollback.
- `js/services/backup.service.js`'s `buildBackup()`/`restore()` updated to
  route the `attendance` section through Firestore, the same fix already
  made for Students and Admissions.

### Removed
- **The Leave Request feature, entirely** — NATYAM has no Leave concept.
  `LeaveRequestRepository`, the `leaveRequests` IndexedDB store,
  `requestLeave()`/`decideLeave()`, the Attendance page's leave approval
  UI, and the Students page's "Record leave" action are all removed; no
  other module referenced any of it.
- **Holiday handling removed from Attendance's scope** —
  `declareHoliday()`/`removeHoliday()` and the "Declare holiday" action are
  removed from the Attendance module. The Holidays calendar itself
  (`holidays$`) is kept, unreferenced by Attendance, for a separate future
  Holiday module; the Dashboard's own "no classes today" panel now reads
  it directly rather than through Attendance.

---

## [2.5.1] — 2026-07-24 — Post-Deployment UAT Fixes

First real end-to-end UAT of the Google Authentication and Firestore
migration work (Milestones 2–5), performed against a live, empty Firestore
project. Found and fixed two genuine runtime defects that no prior static
analysis or automated check could reach, since both only manifest with a
real signed-in session against real Firestore.

### Fixed
- **`bootstrapAdministrator()` always failed with "Choose a role."** —
  validated the caller's raw input before assigning the `administrator`
  role internally, so the check for a role always failed. Reordered to
  validate the fully-assembled record instead. This is the function that
  lets the first sign-in on a new school's Firestore project become
  Administrator — it had never succeeded until this fix.
- **`students$ is not defined` — a `ReferenceError` breaking the Dashboard's
  roll panel, Batches' occupancy column, Admissions' eligible-batch picker,
  and Fee Plans' usage-count check.** `js/data/repositories.js` re-exported
  `students$` without also importing it locally; two of its own methods
  referenced it as a bare identifier. Added the missing local import
  alongside the existing re-export — no duplicate repository instance,
  since both resolve to the same singleton.

### Operational
- The live Firestore project's published Security Rules were a stale,
  pre-role-consolidation draft and have been republished to match this
  repository's current `firestore.rules` — a Firebase Console action, not
  a code change, but required for any of the above to work at all.

### Removed
- The temporary diagnostic logging added to `auth.service.js` during this
  UAT round to find the bootstrap root cause has been removed; the
  original production error handling is restored unchanged.

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
