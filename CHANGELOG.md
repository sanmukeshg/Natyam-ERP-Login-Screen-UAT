# Changelog — NATYAM ERP

All notable changes to this project are recorded here. The project follows a
phase-per-release model: each approved phase increments the version and produces
a completion report, a unified diff, and an updated application package.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and the
project aims to follow [Semantic Versioning](https://semver.org/).

---

## [2.26.1] — 2026-08-01 — Fix desktop layout regressions found in local UAT testing

Two visual bugs reported against v2.26.0's Landing/Login redesign, both traced
to the same root cause: `.auth-wordmark` and `.glass-card` are percentage-width
elements nested inside `align-items: center` flex containers
(`.auth-brand-block`, `.auth-signin-inner`). Without an explicit width on
those wrapper elements, they shrink-to-fit their content instead of filling
the column — and since their children are now `background-image` divs with
no intrinsic content (converted from `<img>` in v2.26.0 to stop cross-
breakpoint image waste), "shrink to fit" resolved to nearly nothing.

### Fixed
- **The wordmark rendered far smaller than its intended ~420px** — now sizes
  and centers correctly by giving `.auth-brand-block` an explicit `width:
  100%` so the percentage width inside it has something definite to resolve
  against.
- **The login card rendered much narrower than its intended 400px** — same
  fix applied to `.auth-signin-inner`, plus explicit `margin: 0 auto` on
  `.glass-card` itself, since its parent no longer flex-centers it once
  stretched to full width.
- **Desktop/tablet no longer stretches the landing photo across the whole
  viewport.** On a large monitor this left the medallion and wordmark looking
  sparse in a sea of empty terracotta. Desktop (≥901px) now renders a
  bounded, centered `1360×660` card — rounded corners, shadow, on a neutral
  page backdrop — matching the approved artifact's own presentation. Mobile
  is unchanged (already confirmed correct).
- **Removed the animated shine/glow effect** on both "Get Started" buttons
  (a canvas-drawn highlight sweeping the button border) per direct feedback
  that it read as a visual glitch rather than a feature. Removed from both
  breakpoints for a consistent experience, along with the now-dead
  `attachSpecularGlow()` function and its canvas elements/CSS.

---

## [2.26.0] — 2026-07-31 — Landing, Login, and Boot screens redesigned to approved brand artwork

Replaces the plain login form and the minimal boot splash with the visual
design approved across three Claude Artifacts (Desktop Landing Page, Mobile
Landing Page Preview, Mobile Boot Screen, plus the Boot/Loading mockup bundled
in the Desktop artifact) — a terracotta/gold "front door" identity built from
the school's own logo artwork, kept fully separate from the indigo/neutral
system the rest of the app uses for daily work. No Firebase, Firestore,
routing, or authentication logic changed; every existing sign-in path (email
& password, Google, Mobile OTP) keeps working exactly as before, restyled in
place.

### Added
- **New Landing → Login screen** (`js/modules/auth/login.page.js`,
  `assets/css/auth.css`): a "Get Started" hero (desktop: live medallion +
  wordmark + shine-tagline composition; mobile: a single pre-baked full-bleed
  image) reveals a frosted glass sign-in card on click — same card, same
  fields, repositioned per breakpoint rather than duplicated in the DOM.
  Breakpoint switches at 900px, matching the Desktop artifact's own tested
  collapse point.
- **Remember me.** A same-device convenience, new to this screen: checking it
  saves the identifier field to `localStorage` and prefills it next visit.
  Purely local persistence — never read by `auth.service.js` or Firebase, no
  session or business-logic change.
- **New boot screen** (`#boot` in `index.html`, styled in `assets/css/auth.css`):
  pulsing medallion mark, gold progress bar, and rotating status messages,
  replacing the single static caption. Desktop uses a terracotta gradient;
  mobile reuses the login screen's own background photo.
- **Five brand images** extracted from the approved artifacts into
  `assets/img/brand/` (dancer medallion, wordmark lockup, two full-bleed
  background photos, one pre-baked mobile hero composite) — the repo had no
  brand imagery before this.
- **`--logo-gold`/`--logo-cream` tokens** in `tokens.css`, scoped to these
  front-door screens only and never reassigned by `[data-theme="dark"]` — the
  login/boot screens are deliberately theme-independent, matching the
  artwork, while the rest of the app's light/dark system is untouched.
- **`.btn-google`** added to `components.css` as a real, reusable button
  variant rather than a one-off style.

### Fixed
- Mobile OTP sign-in (dynamic identifier-mode detection, password field
  hide/show, "Send OTP"/"Login" button relabeling) is preserved and restyled
  to match the glass card, even though neither approved artifact depicted it.
- A rejection message passed back into `renderLogin()` after a failed
  provisioning check now mounts the screen directly into the sign-in state so
  the error is visible immediately, instead of being rendered behind the
  still-hidden hero.
- `login.page.js` now disposes its own delegated listeners before re-wiring
  them on a second render (`showLoginScreen()` can call it again without an
  unmount in between) — previously each re-render stacked a duplicate set of
  handlers on `#app`, firing every click/submit action once per accumulated
  render.
- The medallion, wordmark, and mobile hero images are CSS `background-image`
  rather than `<img>`, so the browser no longer downloads the other
  breakpoint's imagery on every load (~280–305KB of previously wasted
  transfer, depending on device).
- A canvas-drawn specular highlight on the "Get Started" buttons now stops
  its animation loop and removes its listeners once its canvas is no longer
  in the document, instead of continuing to run against detached nodes after
  a re-render.

### Changed
- Old `.auth-screen`/`.auth-card` rules removed from `modules.css`; old
  `.boot`/`.boot-mark`/`.boot-text`/`.boot-error` rules removed from
  `shell.css`. Both screens' styling now lives together in the new
  `assets/css/auth.css`, since they share one theme-independent system that
  the rest of the app's stylesheets don't.
- `tools/dev-server.cjs` now serves `.jpg`/`.jpeg` with the correct MIME type
  (needed for the new brand images; previously unset).

---

## [2.25.0] — 2026-07-31 — Attendance overlay UX: in-place month paging, reuse across Batch/Students/Timetable

A UX enhancement round from "New Requirements and Observation 2.23.2":
consolidating three previously-duplicated attendance overlays (a student's
month, a batch's class calendar, a batch's month grid) into one shared
module, fixing the Previous/Next Month controls that closed and reopened
their drawer on every page (read by users as the screen reloading), and
extending each overlay's reach to two more entry points. No Firestore schema
or rules change — every fix and addition is application-layer, reusing the
existing `attendance.service.js` read functions unchanged.

### Fixed
- **Previous/Next Month closed the whole drawer and reopened a fresh one**,
  on both the per-student attendance drawer (Batch → Roll → student) and the
  Class Calendar picker (reached from the Timetable register). Repainting an
  already-open drawer used to require a full `overlay()` teardown because
  nothing else repainted a drawer's body in place; both now do, sharing one
  fix in the new `js/ui/attendance-widgets.js`. The drawer never closes
  mid-navigation; a short slide plays in the direction paged.

### Added — reused across Batch, Students, and Timetable
- **Batch → Open Batch now has "Class Calendar" and "Attendance - Month"
  buttons.** Class Calendar opens read-only (no pick-a-date-to-mark
  affordance — this is a batch overview, not a way into the register).
  Attendance - Month opens with its batch preselected and the batch picker
  hidden, since the batch is already known.
- **Students → Open Student → Attendance tab now includes the same
  month-by-month report used on the Batch roll** (attendance percentage,
  present/absent counts, day-by-day list with Previous/Next Month) below the
  existing all-time summary, reusing `mountStudentMonthReport()` rather than
  a second implementation. Its day-by-day list scrolls independently so the
  tab doesn't become one long page.

### Changed — naming and button styling
- **"Class dates" renamed to "Class Calendar"; "Month view" renamed to
  "Attendance - Month"**, consistently across every button label and drawer
  title (Timetable register, and the two new Batch buttons).
- **The white/outline toolbar buttons on the Attendance register — Class
  Calendar, Postpone, Cancel, Attendance - Month, Missing registers — now use
  the same filled action-button style as the Operations row** (Move batch,
  Collect fee, Promote, Status, Issue certificate), standardizing on one
  button treatment for primary page actions. Icon-only prev/next controls and
  `Close`/`Back` were left as secondary buttons — this was a labeling
  standardization, not a system-wide button redesign.
- **The Timetable's weekly tile now shows only the batch name** (plus its
  time slot) instead of also stacking curriculum levels, teacher, and room
  onto the card. That detail is unchanged and still one tap away — opening
  the tile still leads to the same register/batch information as before.

### New reusable module
- `js/ui/attendance-widgets.js` — `mountStudentMonthReport()`,
  `openClassCalendar()`, `openAttendanceMonth()` (plus their render
  functions and the shared `MARKS` constant, previously declared separately
  in three files). Six call sites across `batches.page.js`,
  `students.page.js`, and `attendance.page.js` now share these three
  functions instead of maintaining six copies.

### Quality
- Verified in-browser: DOM-identity checks confirm the drawer element itself
  is never removed/recreated across a month-shift (only its content
  repaints); all five affected workflows exercised (Batch → Student
  Attendance, Students → Attendance tab, Timetable → register → Class
  Calendar, Batch → Class Calendar, Batch → Attendance - Month); no console
  errors on any touched screen; dark mode and 375px mobile width checked for
  layout overflow.
- Not verified: the two new Batch-page buttons and the Students-tab widget
  against a very large roster (100+ students) for the day-by-day list's
  independent-scroll behaviour — tested against the ~23-37 student UAT
  batches only.

---

## [2.24.0] — 2026-07-30 — Erase, Attendance session-awareness, self-service profile

Five phases from a UAT observation document ("New Requirements and Observation
2.23.1"), reviewed, approved, and implemented in the agreed priority order:
critical data integrity first, then Attendance/Timetable's session model, then
batch-level attendance reporting, then permissions and self-service, then a
responsive/dark-mode pass over everything new. No `firestore.rules` change —
every fix is application-layer.

### Fixed — critical
- **"Erase everything" erased almost nothing.** `resetEverything()` iterated
  `STORE_NAMES` calling the IndexedDB-only `db.clear()` — a loop that was
  correct before Milestone 3 and had quietly done nothing to real data since
  every entity moved to Firestore. It cleared 24 already-empty local stores,
  reported success, and left all 23 Firestore collections untouched. Rewritten
  to clear each collection through its own repository's `replaceAll([])`;
  returns `{cleared, failed, preserved, ok}` instead of a bare `true`, so a
  partial failure is reported rather than hidden. Sign-in accounts (`users`)
  are deliberately preserved — the confirmation dialog now says so.
- **`resetFlow()` had no error handling.** A thrown error during erase produced
  no message at all. Now wrapped, with distinct hard-failure, partial-failure
  and success outcomes shown to the user.
- **Backups did not include sign-in accounts.** `users` was the one collection
  in `SCHEMA.stores` with no Firestore override in `buildBackup()` — every
  backup carried an empty or stale `users` section. Now included on every
  backup; restoring accounts is a separate, opt-in confirmation during
  restore, and never overwrites the administrator performing the restore
  (`users$.restoreAll()`, new).
- **The restore confirmation dialog always said "holds 0 records."**
  `inspectBackup()`'s result never had an `inspection.recordCount` or
  `inspection.summary` field — both read from `summarise()`'s actual
  `totalRecords`/`counts` now.

### Fixed — Attendance & Timetable
- **Missing registers listed postponed/cancelled classes and never listed
  replacements.** `missingRegisters()` read only a batch's recurring weekday
  pattern and attendance rows, never the `classSessions` collection — so a
  postponed class stayed on the list (and refused to save when marked), while
  a replacement class sitting on a non-recurring day could never appear at
  all. Now session-aware, mirroring `timetable()`'s existing resolution;
  replacement entries are tagged and dated.
- **Three different attendance time windows.** The page asked for 7 days, the
  service defaulted to 14, `postRegister()` allowed marking within 30 — a
  20-day-old register was markable but never listed as missing. Unified on
  `MARKING_WINDOW_DAYS` and a shared `markingWindow(date)` predicate that
  `postRegister()`, the Timetable and the register screen all read, so none
  of them can disagree about which dates are valid.
- **Timetable showed only the current week, with no date range stated.**
  `timetable(branchId, weekStartDate)` now accepts a week to show; prev/next
  controls, a stated date range, and a "This week" return button. Tiles
  outside the 30-day markable window are labelled rather than silently
  failing at Save.
- **The register opened silently on dates a batch does not meet.**
  `openRegister()` has always returned `scheduled`/`sessionStatus`; the page
  never read either. A warning banner now explains cancelled, postponed,
  future, too-old, and non-recurring dates — informational only, since a
  genuine make-up class on an unusual day is meant to remain markable. A new
  "Class dates" month-grid picker (`batchCalendar()`) shows which days a
  batch actually held class, color-coded by outcome.

### Added — batch & student attendance
- **Per-student monthly attendance, opened from a batch's roll.** Clicking a
  student on the batch roll used to navigate away to the Students module,
  losing the batch context; it now opens a drawer in place
  (`studentMonth()`), showing the current month's attendance rate,
  present/absent counts, and a day-by-day list, with month navigation. Read
  only — it never routes to the register-marking screen. Cancelled/postponed
  classes are excluded from the percentage rather than counted as absences.
- **The Attendance day board is now an internal fallback, not a destination.**
  Every dashboard shortcut, notification, command-search entry, and the
  Settings landing-screen option that used to open it directly now open the
  Timetable instead, from which a register is reached via its own tile. The
  route still resolves for anyone who reaches it directly.
- Postponing or cancelling a class from the register, and switching branch
  mid-register, now return to the Timetable (or wherever the user came from)
  instead of silently discarding the screen state onto the day board.

### Added — profile, settings & permissions
- **New `/profile` ("My account") route, reachable by every signed-in role.**
  The header's profile button used to send everyone to Settings → Users,
  which needs `settings.view` — a capability Teacher & Reception does not
  hold, so clicking their own name produced a route-denied screen, and they
  had no way to change their own password anywhere in the app. The new page
  shows the caller's own record (read by id from the session, never queried)
  and offers self-service password change via the existing `setOwnPassword()`.
- **Settings tabs are now capability-filtered.** Holding `settings.view` used
  to show all nine tabs regardless of what a role could actually open — a
  Viewer saw Users, Audit log and Data, and opening Audit log threw
  immediately. Each tab now declares what it needs; a stale `?tab=` falls
  back to the first tab the caller can open instead of rendering blank.
- **The read-only Roles matrix now explains itself.** Per a deliberate,
  reviewed decision *not* to make it editable this release: the screen states
  plainly that `firestore.rules` derives access from a role's name rather
  than a capability list, so editing this table alone would produce buttons
  the database still refuses — and points to Settings → Users, where role
  *assignment* is genuinely editable. Recorded as a future dedicated
  milestone in `docs/architecture/IAM_ROLE_MODEL.md` §6, including why it
  needs a `firestore.rules` rewrite and a rules test harness first, not a UI
  change alone.

### Fixed — presentation
- The Timetable's week-range label was blank until data finished loading (and
  stayed blank on a load failure); now set from page state immediately.
- The per-student attendance drawer used three stacked KPI cards that pushed
  the day-by-day list nearly 350px down a phone screen; replaced with a
  compact three-across stat row.
- A register warning banner interpolated a batch name into its title;
  `.alert` does not shrink its title column, so a long name squeezed the
  explanation into an overflowing one-word-per-line column. Titles are now
  short and fixed; specifics moved into the body text.
- The profile page's "How you sign in" card header wrapped to three lines on
  a phone; shortened and restructured.

### Known, not fixed this release
- Three call sites pass a full ISO timestamp to `formatDate()`, which parses
  by splitting on `-` and silently renders the 1st of the month for anything
  but a bare `YYYY-MM-DD` (`students.page.js`'s student timeline,
  `admissions.page.js`'s draft "saved at", the guardian portal's fee
  timeline). Found while building the new profile page; the same call there
  was fixed. The other three are pre-existing and outside this round's
  approved scope.

---

## [2.23.1] — 2026-07-30 — Remove IndexedDB-era claims from the UI

The Settings → Data tab and the shell footer still described the pre-Firestore architecture, where the school's entire record set lived in one browser profile. Every collection has been on Firestore since v2.15.0 (and `settings` since v2.23.0), so this copy had been telling the user something untrue for some time. Raised from a UAT observation document.

### Changed
- **Settings → Data — the "Take a backup" banner** no longer says "This school's records live in this browser, on this computer. There is no server holding a copy. A backup file is the only thing standing between a cleared browser and losing everything." It now states where the records actually are, and gives the real reason a backup is still worth taking (an offline copy for an audit, a hand-over, or undoing a bad bulk change).
- **"Start again" and both typed-confirmation dialogs** (Restore, Erase everything) no longer describe the data as being "in this browser".
- **`backupStatus()`'s never-backed-up message** dropped "from this browser" — it was implying backups were per-machine.

### Removed
- **The "Storage" card** from Settings → Data (Used / Available / Protected from clearing, and the "Ask the browser to keep this data" button). It reported local IndexedDB quota and a browser eviction promise — neither of which has anything to do with where the school's records are held.
- **The shell footer's "Stored in this browser, protected/unprotected" indicator.** The footer's backup-age reminder stays; only the storage claim went.
- `storageStatus()` / `requestPersistence()` (`settings.service.js`) and the `db.usage()` / `db.requestPersistence()` helpers behind them (`core/db.js`), each of which had exactly one caller — all removed together, plus the now-unused `.storage-pill` / `.storage-dot` CSS.

### Deliberately left alone
- **`app.js`'s fatal boot-error screen** ("The school's database could not be opened in this browser") — that is a genuine local IndexedDB open failure. IndexedDB is still used locally for session and installation state, so this message remains accurate.

---

## [2.23.0] — 2026-07-30 — IAM: Owner role upgrade

An intentional business-rule change, not a fix. `owner_accountant` was a narrow,
largely read-only finance role; at NATYAM the owner is also the accountant, teaches
classes, runs admissions and staffs reception, and a role that made her switch
accounts to do her own job described the software rather than the business. The Owner
is now the highest **business** authority — 33 of 39 capabilities — and Administrator
remains the highest **system** authority.

### Changed
- **Owner & Accountant now holds every capability except six**, defined as an exclusion list (`ADMINISTRATOR_ONLY_CAPABILITIES`) rather than a second hand-maintained grant list. Newly gained: `student.edit`, `student.delete`, `admission.edit`, `attendance.view`, `attendance.mark`, `staff.edit`, `program.edit`, `certificate.issue`, `settings.edit`, `audit.view`, `backup.create`, `data.export`, and all seven `user.*` permissions. This reaches the existing account with **no data migration** — a user document stores a role key, never a capability list.
- **Reserved to Administrator alone:** `system.configure` (Firebase/API/environment/app config, system constants), `system.maintain` (database maintenance, migrations, developer/debug/performance tools), `role.manage` (permission matrix, role definitions), `security.manage` (security/password/MFA/session policies), `data.restore` (restore and erase), `audit.purge` (deleting audit history). The Owner reads the audit log and can never delete from it.
- **`backup.manage` split into `backup.create`, `data.export` and `data.restore`.** One capability had bundled "take a backup" with "replace the database", which is exactly the line the upgrade had to draw. The old string still resolves, via a new alias table, for any role matrix stored in the database or carried inside an older backup file.
- **Teacher & Reception and Viewer are untouched** — 14 and 9 capabilities, identical to v2.22.0, asserted by the regression check below.
- **`firestore.rules`: the server-side half of the same change.** New `canAdminister()` ("Administrator or Owner") replaces a bare `isAdministrator()` wherever that gate stood in for an operational capability the Owner now holds; `isAdministrator()` now means one thing only in that file — a reserved capability. Without this the upgrade would have produced "Missing or insufficient permissions" instead of working screens.
- **Escalation guardrail — account-scoped, confirmed by review:** the Owner may create, edit and deactivate other Owner (and Teacher & Reception, Viewer) accounts exactly as an Administrator could. The one thing closed off is anything where an *Administrator account* is on the other end — creating one, promoting anyone into the role, or editing/deactivating an existing one. Every check tests the **account's** role (`data.role` / `existing.role` / `resource.data.role`), never the actor's own role beyond establishing she holds `user.*` at all — a broader, actor-scoped guard would have (incorrectly) also blocked Owner-to-Owner account management. Enforced in `settings.service.js` and again in `firestore.rules`; both patterns now asserted by a static regression check (§ below) so a future "simplification" can't quietly narrow the guard.
- The Users tab's buttons are now gated by the `user.*` capabilities that had been declared since Doc 6 §22 and never wired to anything (they resolve identically for all four roles — Administrator and Owner hold them, Teacher and Viewer hold neither these nor `settings.edit`).
- Settings → Roles marks reserved capabilities with a "system" badge.
- **`settings.edit` formally split into Business Settings and System Settings.** `settings.edit` is now documented and named (`SETTINGS_GROUPS` in `app.config.js`) as specifically the **Business Settings** capability — institute, branches, academic years, fee plans, curriculum, master data, announcements — Owner and Administrator alike. **System Settings** — Firebase, API and environment configuration — is the already-declared, already-reserved `system.configure`, reused rather than duplicated (no screen exercises it today; the split exists so a future Firebase/environment screen has somewhere correct to attach without re-auditing `settings.edit`'s call sites). Settings → Roles now states the split in its own subtitle.
- **`system.maintain`'s scope made explicit: application maintenance.** The capability already existed and was already reserved; its documented scope now explicitly names version updates, deployment operations and system upgrades alongside the database maintenance/migration/developer-tooling it already covered, per the review's specific concern that these stay Administrator-only as the application grows. No new capability — the same "reuse, don't duplicate" rule applied to `system.configure` above.

### Fixed
- **Settings → Roles showed every capability as *not allowed*, for every role including Administrator.** `roleMatrix()` tested `role.capabilities.includes('STUDENT_VIEW')` — the constant's *name* — against arrays that hold `'student.view'`, the constant's *value*. Every cell in the matrix was a dash. Found while verifying this change on that very screen.
- The command palette's "Take a backup" opened Settings on the Institute tab: it linked to `?tab=backup`, and the tab is named `data`, so it fell through to the default panel.
- Settings → Data no longer offers buttons that always failed. Backup/import/export were rendered for every role and refused at the service layer on click; they are now gated by `backup.create` / `student.edit` / `data.export`. No role gained or lost a permission — a Viewer simply no longer sees three buttons that never worked.
- Added a `settings` collection rule to `firestore.rules`. The key/value settings store had just moved to Firestore (institute details, document-numbering sequences, `lastBackupAt`) with no rule of any kind, and the catch-all at the bottom of that file denies what it does not name — every role, including Administrator, would have failed to read the school's own name. Writes need `settings.edit`, with one exception: `sequences`, which anyone raising an invoice or receipt must be able to increment.

### Documentation
- New `docs/architecture/IAM_ROLE_MODEL.md` — the authoritative role model: hierarchy, the full 39 × 4 matrix, what each reserved capability covers, where enforcement actually happens, how to change the model, and how the hierarchy extends to multiple academies (Administrator global, Owner per-academy via the existing branch scoping — no fifth role).
- `README.md`'s Roles section rewritten: it still described five roles (owner, administrator, registrar, teacher, accountant) from before the v2.15.0 consolidation, and still said roles were "not a security boundary" with "no server to enforce them", which stopped being true when `firestore.rules` shipped.
- `STUDENT_MODULE_MIGRATION.md` §6 and `ADMISSIONS_MODULE_MIGRATION.md` §6 note that their rule tables are point-in-time records and point at the new document.

---

## [2.22.0] — 2026-07-29 — Bug fixes from "New Bugs 2.21.0"

Seven fixes found in real use of v2.21.0's changes, from a new document with six screenshots. All verified by code tracing (no interactive browser session available this round).

### Fixed
- **Admissions — "Parent or guardian" now has a real heading**, equal in weight to "Applicant", instead of the thin divider label it had after the two steps were merged.
- **Admissions — resumed drafts (and Back navigation) no longer show blank fields.** Root cause: the wizard framework passes the in-progress `data` into each step's `fields(data)` function specifically so fields can be pre-filled, but the Applicant/Experience/Fees steps never used it — a pre-existing gap, not something the step-merge introduced, just not noticed until now. Fixed by wiring `value: data.<field>` through on all three steps (Placement and Review already did this correctly).
- **Admissions — "Previous teacher" and "Notes" removed from the Experience step.**
- **Students — the Operations row no longer crowds the tabs below it.** `.profile-ops`'s spacing was still set up for when it sat *below* the tabs (its old position); swapped to bottom spacing now that it sits above them. Its buttons now match the Edit button's color exactly (switched to the same `.btn-primary` class, removing the separate orange `.btn-warning` style added last round).
- **Attendance — "Back" is now a real smart-back**, not a fixed destination: it returns to whichever screen you actually came from (a new, small `js/core/navHistory.js` tracks the one previous route), falling back to Timetable only when there's nothing to return to (e.g. after a page reload).
- **Timetable — postponed/cancelled sessions now behave and look right:**
  - A postponed class's original slot no longer lingers on its old day — it only ever appears on the date it was actually moved to.
  - That new slot now shows yellow until its register is marked (green, as before, once it is) — previously it looked like any other untouched class, with no way to tell it was a reschedule.
  - Cancelled classes now render with a red-tinted card (the tone existed in the code already but had no matching CSS, so it never actually showed).
  - Opening a rescheduled class's register now says which date it was postponed from.
- **Settings — app version is now shown** on the Institute tab (name, version, organisation) — confirmed nothing like this existed anywhere in Settings before.

### Technical
- `batches.service.js#timetable()`: postponed originals are filtered out of their day's slot list entirely; every entry now carries `isReplacement`.
- `session.service.js#sessionStatusOf()`: now also resolves `postponedFrom` (the original session's date) alongside status, for the one caller (`attendance.service.js#openRegister()`) that needed it.
- New `js/core/navHistory.js`: a minimal, in-memory, one-entry "previous route" tracker fed by the router's existing `route:done` event — no change to the shared `Router` class itself.

---

## [2.21.0] — 2026-07-29 — Enhancement Round: Timetable/Attendance, Students, Admissions, Parents

Approved changes from the "New Updates in all the modules" document, implemented in four phases (Timetable/Attendance → Students → Admissions → Parents), each verified before the next began. Two pre-existing bugs, found while cross-checking the document's screenshots against the Attendance screen shipped in Milestone B2, were fixed as part of Phase 1.

### Fixed
- **"Thursday, Thursday" date duplication** on the register screen — `attendance.page.js` was prefixing `reg.dayName` onto `formatDateLong(this.date)`, which already includes the weekday name. Dropped the redundant prefix.
- **"Mark" (from the Missing Registers list) opened the wrong date** — the day board's unmarked-registers list only carried a batch id, not the entry's own date, so it always opened whatever date the board currently displayed. The new Missing Registers panel (below) carries and uses each entry's actual date.

### Changed — Timetable & Attendance (Phase 1)
- **Clicking a Timetable tile now opens that class's Attendance register directly**, instead of navigating to Batches.
- **Take register / Postpone / Cancel removed from the Timetable tile.** Postpone and Cancel now live inside the Attendance register screen itself (next to the date navigator), gated the same way they were on Timetable (`student.edit`, and hidden once a session is already Postponed or Cancelled — a new `sessionStatusOf()` read-only helper in `session.service.js` exposes this to `attendance.service.js#openRegister()` without breaking the existing rule that Attendance never reads the `classSessions` collection directly).
- **The "N registers unmarked this week" panel is no longer shown inline on the day board.** A dedicated "Missing registers" header button (with a live count badge) opens it in a drawer instead; each entry now correctly navigates to its own date.
- **The "does not normally meet on a —" make-up-class banner is removed** from the register screen, per this round's approval (a deliberate reversal of Milestone B2's own design).

### Changed — Students (Phase 2)
- **All list filters (quick chips, Status, Level, Batch) are consolidated into a single "Filter" button** that opens a panel with every filter in one place, instead of a permanently-visible filter bar. The button highlights when any filter is active.
- **Level, Branch, Guardian, and Status columns removed from the students table**, along with the "Contact sheet" export button (and its now-unused `contactSheet()` service function).
- **Row-level View/Edit/Archive/Delete buttons removed from the table** — the row itself already opens the profile.
- **The profile drawer's Operations row** (Move batch/Place in batch, Collect fee, Promote, Status, Issue certificate) **moved to directly under the header**, above the tabs, and recoloured orange (new `.btn-warning` style in `components.css`).
- **Archive moved out of the Operations row into the drawer's footer**, alongside Close/Edit, with Delete added beside it. Archive automatically becomes "Restore Student" for an already-archived student (and back to Archive once restored, on next open).

### Changed — Admissions (Phase 3)
- **The wizard is now 5 steps instead of 9**: Applicant and Parent are merged into one "Applicant" step; Placement and Batch are merged into one "Placement" step (the batch list now reacts live if level or branch is changed on this same combined step, not just once on entry); Medical and Documents steps are removed outright, with no replacement — NATYAM does not collect either.
- `ADMISSION_STEPS` (`admissions.service.js`) updated to match; its per-step validation moved with the merged fields.
- The Drafts list's "step X of N" caption is clamped so an older, in-flight draft saved under the previous 9-step numbering never displays a step count past the new total. (The wizard itself always resumes from step 1 with prior answers pre-filled — it never used the stored step index to jump to a position — so no functional resume behaviour needed migrating, only this display.)

### Changed — Parents (Phase 4)
- **Removed**: the "Export directory" button (and its now-unused `exportDirectory()` method), the "No phone number" quick filter, and the "With siblings" / "Unreachable" KPI tiles. Households and Owing remain.

---

## [2.20.0] — 2026-07-28 — Milestone B2: Restore the Old Attendance Screen

At the user's direct request: Attendance is removed from the sidebar again (reached only from Timetable's "Take register" and the existing Dashboard/Batches/search shortcuts), and the page itself is restored to its pre-grid design — a day board of batch cards, and a single-day roll call with Present/Absent toggles and one Save button, rather than the Week/Month/Custom-Range grid it had become.

### Changed
- **`app.config.js`**: the `/attendance` NAVIGATION entry gets `hidden: true` — reusing an already-existing, previously-unused mechanism in `shell.js`'s `paintNav()` (`!item.hidden`) that keeps a route registered (`ROUTES` is derived from `NAVIGATION`) without rendering it as a sidebar item. No change needed anywhere else — Timetable's "Take register" already passed `?batch=&date=`, and Postpone/Cancel (Milestone 7) are a fully separate, untouched code path.
- **`js/modules/attendance/attendance.page.js`**: rebuilt on the exact structure of the pre-grid version (recovered from git history, commit `c0c94d3`), re-wired to the current service layer — `openRegister()`'s `scheduled` field (renamed from `meetsToday`), and a direct `holidays$.on()` call for the holiday banner (mirroring `dashboard.service.js`'s own pattern), since holiday-checking was deliberately moved out of `attendance.service.js` itself back in Milestone 6.
- **`attendance.service.js#openRegister()`** now includes `medicalNotes` on each entry, restoring the roll-call row's "· medical note" indicator using data that was already tracked on the student record but not previously exposed here.
- **`weeklyGrid()`/`customRangeGrid()` removed** from `attendance.service.js` — they existed only to serve the grid page's Week/Custom-Range tabs, which no longer exist; confirmed no other caller anywhere in the codebase before deleting.

### Not restored (deliberately)
- **"Declare holiday"** — no live write path exists anywhere in the app; holidays are read-only, populated only by a historical migration.
- **The Leave workflow** — NATYAM has no Leave concept, stated outright in this service's own header comment; confirmed nothing in the current codebase references the old Leave helpers.

---

## [2.19.0] — 2026-07-28 — Milestone B1: Multi-Level Batches

A batch used to teach exactly one level, enforced hard everywhere a student was placed into one — but a single class often genuinely mixes students across two or three adjacent levels. A batch now teaches a *set* of levels.

### Added
- **`batches.page.js`'s Level field is now a multi-select checkbox-group** (reusing the exact field type already proven on this same form's Days field), so a batch can be created or edited with any combination of levels.
- **`levelsOf(batch)` and `levelsLabel(levels)`** (`app.config.js`) — a batch document saved before this release still only carries the old single `level` field and keeps working as a one-level batch until it's next edited and saved (which writes the new `levels` array going forward). No forced data migration.

### Changed
- **Student placement is now set-membership, not equality.** `students.service.js#assignToBatch()`/`bulkAssign()` now check whether a student's level is *any one* of a batch's configured levels, not whether it equals the batch's single level — this is the restriction lifted.
- **`batches.service.js#updateBatch()`'s level-change guard is now removal-aware.** Adding a level to an already-populated batch is always safe and never blocked; only *removing* a level that a currently-enrolled student is still at is blocked, naming that level and those students specifically.
- **`batches.service.js#closeBatch()`'s roster-move check is now per-student.** Moving a closing batch's roster to another batch checks each actual student's own level against the target's levels, not a batch-to-batch level comparison — more correct for a multi-level source batch whose roster may only occupy a subset of its configured levels.
- **`admissions.service.js#eligibleBatches()`** now correctly recognises a multi-level batch as matching an applicant's level — this was already a soft sort/label hint, not a hard filter, so it only gets more accurate.
- Every display site (Batches table/detail, Timetable, Students/Admissions batch pickers, header search) shows a comma-joined multi-level label instead of a single one.

### Manual steps before this works
- None — pure application-layer change, no `firestore.rules` change, no forced migration.

---

## [2.18.0] — 2026-07-28 — Milestone P2: Guardian Read Access to Attendance, Certificates, Fees

With the guardian portal now genuinely reachable (v2.17.3–v2.17.6), the three pages that could never work — Attendance, Certificates, Fees — are built out, closing the gap `firestore.rules`' own header comment flagged as follow-up work back on 2026-07-27.

### Added
- **`guardianPhone`/`guardianEmail` are now denormalized directly onto every new `attendance`, `certificates`, and `invoices` document**, and copied onto every new `payments` document from its parent invoice — the same trick already used for `batchSchedule`/`programmes` on `students`. Written from data already in scope at creation time (`attendance.service.js#postRegister()`, `certificates.service.js#issue()`, `fees.service.js#createInvoice()`, `ledger.repository.firestore.js#postPayment()`), no extra reads.
- **A new `forGuardian(phone, email)` query method on `attendance$`/`certificates$`/`invoices$`/`payments$`**, querying by `guardianPhone`/`guardianEmail` directly rather than by `studentId` — required, not optional: Firestore only authorizes a *query* when its own `where()` filter can prove the security rule holds for every possible match, and a `studentId`-filtered query cannot prove a `guardianPhone`-based rule, the exact failure already hit twice this week (the guardian's own students query, and `users$.findByMobile()`). The three portal pages (`attendance.page.js`, `certificates.page.js`, a new `guardianFeeSummary()` in `fees.service.js` used by `fees.page.js`) now query this way and narrow to the active child client-side.
- **`firestore.rules`**: a new `isGuardianOfRecord(recordData)` helper (a direct field comparison, no `get()`, mirroring `isGuardianOfStudent()`) added as an additional `allow read` branch on `attendance`, `certificates`, `invoices`, and `payments` — every other rule on these four collections is untouched.
- **`js/migrations/guardianFieldsBackfillMigration.js`** (+ `docs/migrations/GUARDIAN_FIELDS_BACKFILL.md`) — an optional, by-hand, one-time utility to add these fields to records that predate this release. Not run automatically; new records already carry the fields without it.

### Manual steps before this works
- **`firestore.rules` must be republished again** — only the four `allow read` branches and the new helper changed.
- **Optional**: run the guardian fields backfill (see the doc above) to make pre-existing Attendance/Certificate/Invoice/Payment history visible to guardians in the portal — new records work without it.

---

## [2.17.6] — 2026-07-28 — Portal Router Authentication Check Fix

Direct follow-up to v2.17.5, found while live-testing a guardian sign-in that now got all the way past identity resolution — and then bounced straight back to the login screen.

### Fixed
- **Every guardian navigation, including the very first one, was silently treated as "not signed in."** `js/core/router.js`'s `Router.resolve()` checks authentication at the top of every navigation — but only its *second* check (`revalidate`) was ever made pluggable when Milestone P1 added a second `Router` instance for the portal. The *first* check, `session.isAuthenticated()`, stayed hard-wired to the shared staff `session` singleton. A guardian's identity lives entirely in `guardianSession` (a separate object) — `session.user` is never set for one — so `session.isAuthenticated()` was permanently `false` for every guardian, and `enterPortal()`'s very first navigation immediately signed them back out and reloaded to the login screen. This affected every guardian sign-in method identically (Google, Mobile OTP, Email & Password) and every fix made earlier tonight (the query mismatch, the audit-log masking, the `/users` phone lookup) — none of them could have been observed working end-to-end until this one was also fixed. Fixed by making the initial authentication check pluggable too (`isAuthenticated`, defaulting to the exact existing `session.isAuthenticated()` check so the staff `router` singleton is unchanged), with `enterPortal()` supplying `guardianSession.isAuthenticated()` for the portal's own `Router` instance.

### Manual steps before this works
- No `firestore.rules` change, no republish — this is a pure client-side JavaScript fix.

---

## [2.17.5] — 2026-07-28 — Mobile OTP Identity Lookup Fix

Direct follow-up to v2.17.3, found while live-testing a real guardian Mobile OTP sign-in end to end (OTP received and entered correctly, then rejected).

### Fixed
- **Every Mobile OTP sign-in — staff or guardian — failed at the very first lookup**, before ever reaching `resolveProvisionedUser()`'s own status/method checks or the guardian portal fallback. `users$.findByMobile()` (the first thing any phone-only sign-in resolves through) is a Firestore *query* (`where('mobile','==',...)`), not a `get()` by the doc's own id — a phone-only caller doesn't know their own email yet, so `isOwnDoc(userId)` can never match, and `isAdministrator()` needs an email claim too. Firestore only permits a query when its own filter can prove the rule holds for every possible match, and neither existing branch could be proven from a `mobile==X` filter alone — the whole query was denied outright. Fixed by adding a third branch to `/users/{userId}`'s read rule: a phone-authenticated caller may read a user doc whose `mobile` field matches their own verified phone claim — safe, since the query is only ever run with the caller's own phone number, so it can only ever match the one document that's genuinely theirs.

### Manual steps before this works
- **`firestore.rules` must be republished again** — only the `/users/{userId}` read rule changed.

---

## [2.17.4] — 2026-07-28 — Unified Email/Mobile Login Field

### Changed
- **The login screen's separate "Email" and "Mobile Number" fields are now one merged "Email or Mobile Number" field.** `login.page.js`'s new `detectMode()` decides live, as the person types, which of the two applies — a value containing `@` is unambiguously email; a value that reduces to `/^\+?\d{8,15}$/` is unambiguously a phone number; anything else (empty or partial) stays in email mode. The Password field, "Login" label, and "Forgot password?" link show only in email mode; the same button becomes "Send OTP" in mobile mode. No change to any provider, `resolveProvisionedUser()`, or `firestore.rules` — purely which of the two already-existing, unchanged flows a single field routes into. See `docs/architecture/AUTHENTICATION_PROVIDERS.md` §5b.

---

## [2.17.3] — 2026-07-28 — Auth Rejection Masking + Mobile OTP Fixes

Direct follow-up to v2.17.2, found while live-testing both a guardian Google sign-in and a staff Mobile OTP sign-in against the republished rules.

### Fixed
- **Every rejected or failed sign-in masked its own real error with a raw Firestore permission error.** `resolveProvisionedUser()` writes an audit-log entry on every rejection path (archived/inactive/method-not-permitted/not-provisioned) before throwing its real message — but `auditLog`'s create rule requires `isProvisionedActiveUser()`, false by definition for every caller these paths exist to handle. The audit write itself was denied, and that raw error surfaced instead of the intended one — for the not-provisioned case specifically, it also meant `err.code` never reached `'not_provisioned'`, so the guardian portal fallback in `app.js` never ran at all. Fixed with a `safeAuditRow()` wrapper in `auth.service.js`: an audit-log failure is now logged to console, never thrown.
- **The reCAPTCHA widget broke after the first "Send OTP" attempt.** `mobileOtpProvider.js` cached one invisible `RecaptchaVerifier` for the whole page load, but Firebase's invisible reCAPTCHA is single-use — any retry reused the exhausted widget and failed identically (`reCAPTCHA client element has been removed`) on every attempt after. Fixed: a fresh verifier is created on every `sendCode()` call.
- **`sessions/{sessionId}`'s write rule crashed for any phone-only (Mobile OTP) session.** It called `myEmail()` unconditionally, which throws for a token with no email claim — meaning no Mobile OTP sign-in, staff or guardian, could ever create its own session record, regardless of account status. Fixed with a new `ownsUserId()` rule helper: an email-based caller still matches by `myEmail()` directly; a phone-based caller is verified by reading the claimed `/users/{id}` doc (a single, already-budget-safe document read, not a query) and checking its `mobile` field against the caller's phone claim.

### Manual steps before this works
- **`firestore.rules` must be republished again** (fourth time this cycle) — only the `sessions` rule and the new `ownsUserId()` helper changed; every other rule is untouched.

---

## [2.17.2] — 2026-07-28 — Guardian Sign-In Fix

Direct follow-up after the first real guardian sign-in attempt against live Firebase surfaced a bug the milestone report had flagged as untested: the guardian portal's own lookup query didn't match what `firestore.rules` requires it to prove, so every guardian sign-in (Google, Mobile OTP, or Email/Password) failed with "Missing or insufficient permissions" before ever reaching the portal.

### Fixed
- **Guardian sign-in always failed with a permissions error.** Firestore only allows a *query* (as opposed to a single-document read) when its own `where()` filters can prove the security rule holds for every possible match — it does not run the query and filter the results afterward. `firestore.rules`' `isGuardianOfStudent()` checks both `status == 'active'` and the guardian's phone/email, but `guardianAuth.service.js`'s lookup query only filtered on phone/email, checking `status` in JavaScript after the fact. Firestore rejected the whole query outright. Fixed with a new `students$.whereActive()` repository method that includes `status == 'active'` directly in the query, matching the rule exactly. No `firestore.rules` change and no manual Firestore index needed — this was a client-side query bug, not a rules bug.

---

## [2.17.1] — 2026-07-27 — Restore-from-Backup Fix + Login Screen Cleanup

Direct follow-up after live UAT restore testing surfaced a real, previously-undiscovered bug: a second restore attempt (once a collection already had documents from an earlier one) silently aborted partway through, leaving Students restored but Batches/Staff/Invoices/etc. untouched.

### Fixed
- **`restore()` aborted mid-sequence on any collection that already had documents.** Every repository's `replaceAll()` (restore's only caller) hard-deletes every existing document in a collection before recreating it — but `admissions`/`classSessions`/`programs`/`batches`/`staff`/`invoices`/`payments`/`branches`/`academicYears`/`curricula`/`salaries`/`expenses`/`auditLog` all had `allow delete: if false` in `firestore.rules` (a deliberate "no hard delete in the normal app UI" policy, unrelated to restore). Fine on a first-ever restore with nothing to delete; on any later one, the delete step was denied outright and the whole restore stopped there, silently leaving everything after that point in the write sequence untouched — the exact cause of students showing "Not placed" with correctly-restored branches but no batches at all. Fixed by opening `delete` to Administrator alone on those thirteen collections — the same role already required to reach `restore()` in the first place. `update` stays denied wherever it already was (`auditLog` stays append-only).
- **Bar charts rendered `NaN`-height bars** (`js/ui/chart.js`'s `barChart()`) whenever every value in a series was zero (e.g. a month with no fee collections) — a division by a zero "ceiling" produced `NaN`, logged by the browser as repeated `<rect>` attribute errors. Bars now render at zero height instead.
- **Removed the redundant "OR" dividers** on the login screen — one between "Forgot password?" and "Continue with Google", one between "Continue with Google" and the Mobile Number field.

### Manual steps before this works
- **The updated `firestore.rules` must be republished again** (third time this milestone) — Firebase Console → Firestore Database → Rules → Publish.
- **Redo the restore once more** after republishing; it should now complete the full sequence without stopping partway.

---

## [2.17.0] — 2026-07-26 — Parent/Student Portal (Milestone P1)

A guardian can now sign in and see, read-only, exactly their own child's own batch, timetable, attendance rate (week/month), programmes, certificates, and fee dues — never another family's data, never a staff/finance/admin screen, and no payment-collection UI anywhere in it. This is the milestone `mobileOtpProvider.js`'s own header comment anticipated when it was built for Milestone A1.

### Added
- **A guardian identity needs no new role, `users` document, or top-level collection** — it's simply an authenticated Firebase user (Mobile OTP, Google, or Email/Password) whose phone/email token claim matches an existing `guardianPhone`/`guardianEmail` on one or more active `students` records. Matches this project's own long-standing design stance (`students.service.js`'s header comment: "there is no parent portal, no parent login, no parent record that outlives the child's enrolment").
- **`js/services/portal/guardianAuth.service.js`** — `resolveGuardianIdentity()` (tried in `app.js` only as a fallback after the staff `resolveProvisionedUser()` path rejects an identity as genuinely unrecognised — `err.code === 'not_provisioned'`, never for an archived/inactive/method-not-permitted staff account), built on a from-scratch, permission-scoped query — deliberately not `students.service.js`'s existing `households()`, which is a whole-school, unscoped scan.
- **`js/ui/portalShell.js` + six new portal pages** (`js/modules/portal/*.page.js`) — Overview, Timetable, Attendance, Programmes, Certificates, Fees. No branch switcher, no capability-filtered nav, no admin footer, no search palette, no notification bell — access is already fully scoped by `firestore.rules`, not by capability strings.
- **`firestore.rules`**: `isGuardianOfStudent()`/`isGuardianOfStudentId()`, additive `||` branches on `students`/`attendance`/`certificates`/`invoices`/`payments`' existing `allow read` — every write rule and every other collection is untouched. A `hasEmailClaim()` guard was also added ahead of `isProvisionedActiveUser()`, since a phone-only guardian token has no `email` claim at all and the existing `myEmail()` throws (not `false`) without it.
- **`js/core/router.js`**: the `Router` class is now exported (previously only the `router` singleton), and its per-navigation live-status re-check is pluggable (`revalidate`, defaulting to the exact existing `users$.find(...)` check) — a guardian session has no `users` doc, so the portal runs its own `Router` instance with `guardianSession.stillValid()` instead.
- **Denormalized, read-only snapshots on the student document** — `batchSchedule` and `programmes` — since `batches`/`programs` have no reverse index back to a student and Firestore rules can't express that lookup. Kept in sync by `students.service.js`'s `assignToBatch()`/`enrol()`, `batches.service.js`'s `updateBatch()` (refreshing every current roster member, not just newly-assigned ones), and `programs.service.js`'s `setParticipants()`.

### Fixed
- **`students.repository.firestore.js`'s `normalisePhone()`** didn't default to `+91` the way `users.repository.firestore.js`'s version does — a guardian phone entered as bare digits would never match Firebase Phone Auth's E.164 claim. Same class of bug already found and fixed once for staff Mobile OTP (v2.16.1), now fixed here too, before this milestone could depend on it.

### Manual steps before this works
- **A one-time backfill** is needed for any `guardianPhone` already stored without `+91` — see `docs/migrations/PARENT_STUDENT_PORTAL_MILESTONE.md`.
- **The updated `firestore.rules` must be republished** (Firebase Console → Firestore Database → Rules, or `firebase deploy --only firestore:rules`) and should be exercised in the Firebase Rules Emulator first — this file is hand-written and not yet under automated test.

---

## [2.16.1] — 2026-07-26 — Self-Service Account Linking + India Phone Default

Direct follow-up to v2.16.0, prompted by real usage during rollout: the existing (Google-only) Administrator account had no way to add Email & Password, and typing `+91` on every Mobile OTP sign-in was unnecessary friction for an all-Indian user base.

### Added
- **Self-service account linking** — `passwordProvider.js`'s `linkPassword()` (Firebase `linkWithCredential()` against `auth.currentUser`) and `auth.service.js`'s `setOwnPassword()`, reachable from Settings → Users → **Set a password**, visible only on the signed-in person's own row. Lets an existing Google-only account add Email & Password without creating a second, disconnected identity.
- **India phone default** — `login.page.js`'s `toIndianE164()` prepends `+91` to a Mobile Number field entry that doesn't already start with `+`, so nobody has to type a country code to sign in.

### Fixed
- **A real consistency bug caught before it could cause a silent failure**: `users.repository.firestore.js`'s `normalisePhone()` didn't apply the same `+91` default as the login screen — a mobile number entered in Settings → Users as bare digits (e.g. `9618007074`) would never match the fully-qualified `+91...` number Firebase always returns for a verified sign-in, silently breaking Mobile OTP for that account. Both now share the identical normalisation rule.

### Why this wasn't in v2.16.0
Account linking was explicitly scoped out of the original milestone (see `AUTHENTICATION_PROVIDERS.md`'s original §5/§6) — `createUserWithEmailAndPassword()`, the mechanism the admin-provisioning flow uses for brand-new accounts, fails with `auth/email-already-in-use` for an email that already has a Firebase identity from another provider. Confirmed live during rollout when the existing Administrator account tried Email/Password and was correctly, safely rejected. `linkWithCredential()` is the actual correct mechanism for an *existing* identity, and it can only run self-service — never admin-on-behalf-of-another — which is why it's shaped the way it is.

---

## [2.16.0] — 2026-07-26 — Unified Authentication Platform (Email/Password + Google + Mobile OTP)

Phase 1 / Milestone A1. Three authentication providers now share the login screen — Google Sign-In (unchanged), Email & Password, and Mobile OTP — with per-account, Administrator-configurable permissions deciding which methods a given user may actually sign in with. IAM, roles, session management, and the Firestore data model are unchanged; this is additive.

### Added
- **`js/services/auth/providers/passwordProvider.js`** — Firebase `signInWithEmailAndPassword`. Passwords are verified by Firebase's servers, never this app's own code — the same trust model Google Sign-In already had, and deliberately not a repeat of the client-verified password design ADR-014 removed. Also provides `sendReset()` (Forgot Password) and `provisionAccount()` (Administrator-side account creation via a throwaway secondary Firebase App instance, so creating another user's credential never disturbs the Administrator's own signed-in session).
- **`js/services/auth/providers/mobileOtpProvider.js`** — rebuilt from a stub into a real Firebase Phone Authentication implementation: `sendCode(phoneNumber)` (invisible reCAPTCHA + SMS) and `confirmCode(confirmation, code)`, a deliberate two-step extension of the one-shot provider contract Google/Password use.
- **`users.authMethods`** (new Firestore field, array) — **the single source of truth** for which sign-in methods a specific account may use, Administrator-configured in Settings → Users (reusing the existing `checkbox-group` field type — no new UI component). No runtime default is ever assumed for a missing array (see Changed, below) — every account is expected to carry a real one, backfilled once by a new migration utility.
- **`js/migrations/authMethodsMigration.js`** — one-time, by-hand migration (same category as this project's two existing data-migration tools, no route or UI button) that backfills `authMethods: ['google']` onto every `users` document that predates this field. Replaces an earlier runtime-fallback approach that was reconsidered before shipping: a missing array is now a data gap closed once, for real, not something the sign-in path silently guesses around forever.
- **`js/data/users.repository.firestore.js`**: `authMethodsOf(user)` (returns `[]`, not a default, for a record with no array — see Changed) and `findByMobile(mobile)` (a phone-keyed lookup for Mobile OTP identities, which carry no email; also the basis of the new mobile-uniqueness check below).
- Unified, responsive login screen (`js/modules/auth/login.page.js`): Email/Password + Login (primary) → Continue with Google → Mobile Number + Send OTP/Verify, plus a "Forgot password?" link. All three funnel into the same outcome handling app.js's `onAuthStateChanged` listener already provides. Raw Firebase SDK error codes are never shown to a person — a new `friendlyAuthError()` translates every code this screen can produce into plain, non-technical language.

### Changed
- **`resolveProvisionedUser()`** (`auth.service.js`) gains one new gate, run after the existing status/archived checks: the signed-in identity's provider must appear in `authMethodsOf(existing)`, or the sign-in is rejected with the fixed message *"This authentication method is not enabled for your account. Please use one of your permitted sign-in methods or contact your Administrator,"* and an audited `method_not_permitted` reason — authentication (Firebase proved who they are) and authorization (role — what they may do) stay strictly separate; this is a third, independent check, not a blend of the two. Also branches on identity shape: an email resolves against the existing email-keyed lookup; a phone-only identity (Mobile OTP) resolves via the new `findByMobile()`.
- **`loginType` is now deprecated.** It remains on every document for shape/backward-compatibility only — no code reads it for any decision. The bootstrap path (first-ever sign-in on a brand-new project) no longer derives it from the signing-in provider at all (an earlier version of this milestone did; reconsidered as exactly the kind of new logic the deprecation is meant to prevent). `authMethods` is the only field anything checks.
- **`authMethodsOf()` no longer defaults a missing array to `['google']`.** It returns an empty array instead — failing closed (no method permitted) rather than open (a default method assumed permitted). `createUser()`/`updateUser()` mirror this: neither ever injects a default: an Administrator must explicitly choose at least one method for every account, with no fallback to fall back to.
- `settings.service.js`'s `createUser()`/`updateUser()` validate `authMethods` against the three known values and now enforce `authMethods.length >= 1` explicitly (an account can never be saved with zero enabled methods) — with a distinct message when the signed-in Administrator is editing their own account down to zero, preventing self-lockout specifically. `createUser()` calls the secondary-App provisioning flow before writing the Firestore document whenever Email & Password is selected for a brand-new account, so a failed Auth-account creation never leaves an orphaned authorization record.
- **Mobile numbers are now unique across the system**, enforced in both `createUser()` and `updateUser()` via `findByMobile()` — required because Mobile OTP resolves an incoming identity by phone number alone, so two active accounts sharing one number would make that resolution ambiguous.

### Notes
- **No `firestore.rules` change required** — confirmed directly: `authMethods` is just another field on `/users/{userId}`, already covered by the existing Administrator-only update rule.
- **Firebase Console manual steps needed** (separate from any rules republish): enable the Email/Password and Phone sign-in methods under Authentication → Sign-in method.
- **The one-time `authMethods` migration has not been run against any live data from this environment** — no write access to a real Firestore project here. `js/migrations/authMethodsMigration.js`'s own header documents exactly how to run it, once, from a signed-in Administrator's browser.
- **Account linking (Google ↔ Password) is explicitly out of scope** — existing Google-only accounts are completely unaffected; a future milestone may add self-service linking.
- **Mobile OTP could not be end-to-end verified in the development environment** (no real phone/SMS delivery, reCAPTCHA needs a live browser session) — static/code-level verification only; a real-device pass is required before relying on it in production.

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
