# Release Notes — NATYAM ERP v2.26.2

**Release:** Fix iOS keyboard auto-opening on Get Started tap
**Date:** 1 August 2026
**Baseline:** v2.26.1
**Type:** Bug-fix patch — one mobile UX regression reported on iPhone; no functional or architectural change.

## What changed for the academy

- **Tapping "Get Started" on a phone no longer pops the keyboard open immediately.** The sign-in screen now slides in the way you'd expect from a native app, and the keyboard appears only once you actually tap into the Email or Mobile Number field.
- **The page no longer sometimes zooms in when the sign-in screen appears.**
- Continuing with Google is unaffected and still works the moment you tap it.

## For administrators / IT

- Root cause: the app was calling `.focus()` on the email field the instant "Get Started" was tapped, inside the same touch event — which iOS treats as permission to open the keyboard right away, before the screen had even finished sliding in. Fixed by focusing the newly revealed card instead of the field, matching the same focus-management pattern already used everywhere else in the app when navigating between screens. Also increased the sign-in input text size on phones only (13px → 16px) since iOS auto-zooms any focused input below 16px — this was a second, independent contributor to the reported zoom. Desktop is untouched.
- No Firebase, Firestore, routing, or authentication logic touched.

## Quality

- Verified: tapping "Get Started" no longer focuses any input (confirmed via the browser's own active-element state, not just visually); tapping the Email or Mobile Number field directly still focuses it correctly; desktop's focus and text-size behavior is unchanged; no scroll/viewport jump after either transition; no console errors.

---

# Release Notes — NATYAM ERP v2.26.1

**Release:** Fix desktop layout regressions found in local UAT testing
**Date:** 1 August 2026
**Baseline:** v2.26.0
**Type:** Bug-fix patch — two visual regressions reported from local testing of the new Landing/Login screens, both fixed at the root cause; no functional or architectural change.

## What changed for the academy

- **The "Natyam / School of Kuchipudi" wordmark on the desktop landing screen now displays at its full intended size**, instead of appearing much smaller than the artwork it's built from.
- **The sign-in card is back to its proper width** instead of the narrow, thin panel seen in local testing.
- **On larger monitors, the landing/login screen now appears as a centered, framed panel** with the surrounding area shown in a plain neutral background, matching the approved design, instead of the artwork stretching edge-to-edge and leaving the medallion and text looking sparse and disconnected on a big screen. Phones are unaffected — already confirmed correct.
- **The animated glow around the "Get Started" button has been removed**, on both desktop and phone, based on direct feedback that it looked like a glitch rather than a polish detail.

## For administrators / IT

- Root cause of the two sizing bugs: a CSS side effect of the bandwidth-saving change in v2.26.0 (converting two images to background styling instead of `<img>` tags) interacting with a centering layout rule — the browser had nothing definite to measure the percentage-based image widths against, so they collapsed. Fixed by giving their containers an explicit width; no images or markup structure changed.
- No Firebase, Firestore, routing, or authentication logic touched.

## Quality

- Verified by exact on-screen measurement (not just visual inspection): the wordmark now renders at precisely 420px and the sign-in card at precisely 400px, both correctly centered, at both a 1440px and a 1920px browser width.
- Re-confirmed the phone layout is unaffected by any of these changes.
- No console errors; CSS coverage check clean.

---

# Release Notes — NATYAM ERP v2.26.0

**Release:** Landing, Login, and Boot screens redesigned to approved brand artwork
**Date:** 31 July 2026
**Baseline:** v2.25.0
**Type:** Visual redesign of the app's entry screens, implementing three approved Claude Artifacts (Desktop Landing Page, Mobile Landing Page Preview, Mobile Boot Screen) plus the Boot/Loading mockup bundled in the Desktop artifact. No Firebase, Firestore, routing, or authentication logic changed.

## What changed for the academy

- **The sign-in screen has a new look**, built from the school's own logo artwork: a warm terracotta-and-gold "front door" identity, separate from the calm indigo look used inside the app once you're signed in. On a desktop or tablet, a "Get Started" screen with the school medallion and wordmark opens into a frosted glass sign-in card. On a phone, a full-screen photo of the medallion opens the same card, sliding in from the side.
- **Every existing way of signing in still works exactly as before** — email and password, Google, and Mobile OTP (including the code-verification step) — just restyled to match the new card. Nothing about what information is needed or how it's checked has changed.
- **A new "Remember me" option** on the sign-in card saves your email or phone number on this device so it's already filled in next time. It only remembers what you typed — it doesn't keep you signed in or skip your password.
- **The loading screen you see for a moment while the app opens** now shows the school medallion with a soft pulse, a progress bar, and a few rotating status lines, instead of a plain "NATYAM – School of Kuchipudi" caption.

## For administrators / IT

- **No `firestore.rules` change, no schema change, no migration, no change to any sign-in provider's configuration.** This release only touches how the entry screens look and are built; the underlying Firebase Authentication flows are untouched.
- Five new image assets live under `assets/img/brand/` (extracted from the approved artifacts) — nothing else changed in how the app is deployed or served; it remains build-free, dependency-free static files.
- The old plain sign-in form and boot caption were removed along with the styles that were unique to them — nothing was left half-migrated.

## Quality

- Verified in-browser at both desktop (1280px) and mobile (375px) widths: hero-to-sign-in reveal and back navigation, all three sign-in methods' UI wiring, the new Remember-me persistence (save/prefill/clear), a simulated provisioning-rejection message, dark-mode independence (pixel-identical to light mode, by design), and reduced-motion behavior. No console errors on any of the above.
- A pre-existing framework limitation was found and fixed during review: repeated calls to the login screen's render function (which can happen after a failed sign-in attempt) were stacking duplicate event handlers rather than replacing them. Verified fixed with an isolated test — three re-renders now leave exactly one render's worth of active handlers, not three.
- Confirmed the new images don't get downloaded on the "wrong" device — a phone no longer fetches the desktop background and wordmark, and a desktop no longer fetches the phone's full-screen hero image.

---

# Release Notes — NATYAM ERP v2.25.0

**Release:** Attendance overlay UX — in-place month paging, reused across Batch/Students/Timetable
**Date:** 31 July 2026
**Baseline:** v2.24.0
**Type:** UX enhancement round — approved observations from "New Requirements and Observation 2.23.2", reviewed and implemented in place; no new architecture, no Firestore schema or rules change.

## What changed for the academy

- **Paging between months no longer closes the screen you were looking at.** The per-student attendance drawer (opened from a batch's roll) and the Class Calendar picker (opened from a register) used to close and reopen every time you clicked Previous or Next Month — which looked like the screen reloading. Both now stay open and simply update in place, with a short slide in the direction you paged.
- **Batch pages now have their own "Class Calendar" and "Attendance - Month" buttons**, so you no longer need to go through the register to see which days a batch met, or its whole-batch monthly attendance grid. Class Calendar here is view-only; Attendance - Month already knows which batch you're looking at, so it skips straight to picking a month.
- **A student's own page now shows their month-by-month attendance** — the same report you'd see from a batch's roll (percentage, present/absent, day-by-day, Previous/Next Month) — right on their Attendance tab, not just a lifetime summary.
- **"Class dates" is now called "Class Calendar", and "Month view" is now called "Attendance - Month"**, everywhere those buttons and drawers appear.
- **The main toolbar buttons on the Attendance register now match the look of the Operations buttons** elsewhere in the app (Move batch, Collect fee, etc.) instead of standing out as plain white buttons.
- **Timetable tiles are simpler** — just the batch name and its time, not also the curriculum levels, teacher, and room crowded onto one card. Opening a tile still shows everything it always did.

## For administrators / IT

- **No `firestore.rules` change, no schema change, no migration.** Every change in this release reads the same attendance data the same way as before; only how and where it's displayed changed.
- Three previously-separate implementations of these attendance overlays were consolidated into one shared module (`js/ui/attendance-widgets.js`) as part of adding the new Batch-page buttons and Students-tab widget — this is an internal code-organization change with no visible effect beyond fixing the month-paging behaviour described above.
- Not verified against a very large batch roster (100+ students) — tested against this UAT dataset's batches (23–37 students each).

## Quality

- Verified in-browser: confirmed (via DOM inspection, not just visual) that the drawer element itself is never torn down and rebuilt during month navigation — only its contents repaint. All five affected workflows exercised end to end. No console errors on any touched screen. Dark mode and 375px mobile width both checked for layout overflow.

---

# Release Notes — NATYAM ERP v2.24.0

**Release:** Erase, Attendance session-awareness, self-service profile
**Date:** 30 July 2026
**Baseline:** v2.23.1
**Type:** Bugfix and enhancement round — five phases from a UAT observation document, reviewed and approved before implementation.

## What changed for the academy

- **"Erase everything" now actually erases everything.** It had been clearing local browser storage only — every real record in the cloud database survived an erase while the app reported success. Fixed at the root: each collection is now cleared through its own data layer. Sign-in accounts are deliberately kept, so nobody gets locked out of an emptied system, and the confirmation dialog says so plainly.
- **Backups now include who has an account**, not just the school's records. Restoring accounts from a backup is a separate choice offered during restore, and your own account is never touched by it.
- **The Missing Registers list now agrees with what can actually be marked.** A postponed or cancelled class no longer appears (it can never be marked again); a rescheduled class now does appear on its new date, which it never did before — that unmarked register was previously invisible.
- **The Timetable shows which week you're looking at, and lets you move between weeks.** Tiles for a week too far in the future or too far in the past are labelled as such, rather than failing only when you try to save.
- **Opening a student from a batch's roll now stays in the batch** and shows that student's attendance for the month — present/absent counts, a percentage, and month-by-month navigation — instead of leaving for the Students screen.
- **Every signed-in person can now open "My account"** from the profile button, whatever their role, and change their own password there. Previously the button sent Teacher & Reception staff to a screen they were not permitted to open at all, with no way back to fix a forgotten password except signing out.
- **Settings only shows the tabs a role can actually use.** A Viewer no longer sees Users, Audit log or Data tabs they cannot open.
- **The read-only Roles screen now explains why it's read-only**, and points to Settings → Users, where who holds each role is genuinely editable.

## For administrators / IT

- **No `firestore.rules` change.** Every fix in this release is application-layer; the rules published for v2.23.0 still govern the database unchanged.
- **The erase fix changes real behaviour** — verify it against a disposable project or a restorable backup before relying on it, not against live data you cannot rebuild.
- Making the Roles matrix genuinely editable was considered and explicitly deferred: `firestore.rules` decides access by role name, not by a capability list, so an editor here alone would show permissions the database still refuses. Recorded as a future milestone requiring a rules rewrite and a test harness first (`docs/architecture/IAM_ROLE_MODEL.md` §6).
- One pre-existing issue found and left alone, outside this round's approved scope: three screens pass a full timestamp to a date formatter that expects a bare date, and silently show the 1st of the month instead of the real day.

## Quality

- Static analysis clean across 130 modules: no import cycles, all imports resolve, no undefined identifiers, no undefined CSS classes.
- Verified in-browser at every phase: all four roles' capability sets, all 18 staff pages and 6 guardian-portal pages load with zero console errors, dark mode and mobile-width (375px) rendering for every new screen and drawer.
- Not verified: behaviour against live Firestore data (the erase, the restore, a real password change, Mobile OTP). A UAT plan with 60 numbered test cases and explicit pass/fail criteria was provided separately for that pass.

---

# Release Notes — NATYAM ERP v2.23.1

**Release:** Remove IndexedDB-era claims from the UI
**Date:** 30 July 2026
**Baseline:** v2.23.0
**Type:** Copy and UI correction — the app was describing an architecture it no longer has.

## What changed for the academy

- **Settings → Data no longer says the school's records live in this browser on this computer.** They live in Natyam's cloud database, and have since the Firestore migration. The backup reminder now gives the real reason to keep taking backups — your own offline copy for an audit, a hand-over, or undoing a bulk change that went wrong.
- **The "Storage" box is gone** from that same tab (Used / Available / Protected from clearing, and the "Ask the browser to keep this data" button). It was measuring space inside the browser, which is not where the records are.
- **The bar along the bottom of every screen no longer claims "Stored in this browser".** It still tells you when the last backup was taken.
- The "Erase everything" and "Restore" confirmation dialogs, and the "Start again" description, were reworded for the same reason.

## For administrators / IT

- **No `firestore.rules` change, no data migration, no manual step.** Nothing about how data is stored or read changed in this release — only what the screens claim about it, plus the removal of the dead code behind those claims.
- One message that deliberately still mentions the browser: the start-up failure screen ("The school's database could not be opened in this browser"). That one is accurate — the app does still use local browser storage for session and installation state, and that is genuinely what has failed when you see it.

## Quality

- Static analysis clean: all imports resolve, no import cycles, no undefined identifiers across 129 modules.
- Removed code was verified to have exactly one caller each before removal, and the CSS for the deleted footer indicator was removed in the same pass so nothing is left orphaned.
- Not verified interactively: this session had no way to sign in. Worth a glance at Settings → Data and the footer after deploy.

---

# Release Notes — NATYAM ERP v2.23.0

**Release:** IAM — Owner role upgrade
**Date:** 30 July 2026
**Baseline:** v2.22.0
**Type:** Business-rule change (intentional), plus three bugs found while verifying it, refined once after review.

## What changed for the academy

- **Surekha's account can now do her whole job without switching to the Administrator login.** The Owner & Accountant role went from 13 permissions to 33 of the system's 39: students (including delete), admissions, attendance and registers, batches and timetable, curriculum, programmes, certificates, staff, fee structure, fee collection, refunds and waivers, finance, reports and exports, calendar, notifications and announcements, documents, academy settings, and full user management — creating users, editing them, disabling them, and assigning the Teacher & Reception or Viewer roles.
- **Six things stay with the Administrator**, and they are all system-level rather than academy-level: Firebase/API/environment/application configuration and system constants; role definitions and the permission matrix; security, password, MFA and session policies; database maintenance, migrations and developer tools; restoring or erasing the database; and deleting audit history.
- **The Owner can read the whole audit log and can never delete from it.** That is deliberate — an audit trail only means something if the person with the most authority cannot edit it.
- **One limit worth knowing about, and it is narrower than it might sound:** the Owner cannot create an Administrator, promote anyone to Administrator, or change an existing Administrator's account. That is the *only* restriction — she can create, edit and disable as many Owner, Teacher & Reception or Viewer accounts as the academy needs, no differently from an Administrator. Confirmed by review and now covered by an automated check: the restriction is tied to the account being touched, never to who is doing the touching, so it can never accidentally widen into "the Owner can't manage other Owner accounts."
- **Settings is now explicitly two things: Business Settings and System Settings.** Business Settings — institute details, branches, fee plans, curriculum and the rest of what already lived under the Settings tab — is Owner and Administrator alike, exactly as before. System Settings — Firebase, API and environment configuration — was already Administrator-only; it's now named and documented as its own thing rather than folded into the same sentence as Business Settings, so it's unambiguous which is which as the application grows. No screen changes today.
- **Application maintenance — version updates, database migrations, deployment operations, system upgrades — is confirmed Administrator-only**, spelled out explicitly rather than left to be inferred from "database maintenance." No screen exercises this today; it is a standing reservation for when one exists.
- **Nothing changed for Teacher & Reception or Viewer.** Future teachers get exactly the role they would have got last week.
- Settings → Roles now actually works. It has been showing a dash in every single cell — for every role, including Administrator — because of a name-vs-value mix-up in the code behind it. It now shows the real matrix, with reserved permissions badged "system", and its subtitle states the Business/System Settings split plainly.

## For administrators / IT

- **`firestore.rules` must be redeployed with this release.** This is the half of the change that matters: the rules file is the real boundary, and an upgraded role in the app with an un-upgraded rules file means "Missing or insufficient permissions" errors instead of working screens. Paste the updated file into Firebase Console → Firestore Database → Rules, or `firebase deploy --only firestore:rules`.
- **No data migration.** A user document stores a role *key* (`owner_accountant`), never a list of permissions, so the existing Owner account picks up the new grant the next time she signs in. Nothing to run, nothing to backfill.
- The `backup.manage` permission was split into `backup.create`, `data.export` and `data.restore`. Old backups and any stored role matrix naming the retired string still resolve correctly.
- The rules file gained a `settings` collection block. The key/value settings store (institute details, document-numbering sequences) had just moved to Firestore with no rule covering it, which the file's catch-all denies — this would have broken reads of the school's own name for everyone, unrelated to roles.
- To change the model later: add a capability to `CAPABILITIES` and the Owner gets it automatically; add it to `ADMINISTRATOR_ONLY_CAPABILITIES` as well to reserve it. `docs/architecture/IAM_ROLE_MODEL.md` documents this.

## Quality

- 20 automated assertions over the resolved role matrix, all passing: the Administrator/Owner difference is exactly the reserved list; all 33 granted permissions present and all 6 reserved ones absent for the Owner; Teacher & Reception and Viewer byte-for-byte unchanged; every one of the 29 capability strings used anywhere in `js/` is a defined capability (this is what catches a rename left half-finished); every navigation entry reachable by the Owner; the retired `backup.manage` string still expands correctly; the Business/System Settings split resolves as intended; and — new this round — a static check on both `settings.service.js` and `firestore.rules` confirming the escalation guard tests the *account's* role, not the actor's, in every one of `createUser()`/`updateUser()`/`deactivateUser()` and the `/users` `create`/`update` rules.
- `firestore.rules` reviewed line by line against the capability table: every remaining `isAdministrator()` was confirmed to be a reserved-capability gate or a restore-only `delete`.
- Not verified interactively: signing in as the Owner requires real Firebase credentials, which this session had no way to use. Recommended before sign-off — sign in as Surekha and confirm Settings → Users (add/edit/remove **another Owner account specifically**, not just her own), Settings → Data (backup present, Restore and Erase absent), Settings → Audit log (readable), and marking a register.

---

# Release Notes — NATYAM ERP v2.22.0

**Release:** Bug fixes from "New Bugs 2.21.0"
**Date:** 29 July 2026
**Baseline:** v2.21.0
**Type:** Bug fixes — seven issues found in real use of the previous release.

## What changed for the academy

- **Admissions**: the "Parent or guardian" section now has a proper heading; resuming a saved application (or clicking Back mid-form) no longer shows blank fields; "Previous teacher" and "Notes" are gone from the Experience step.
- **Students**: the row of action buttons at the top of a student's profile no longer overlaps the tabs below it, and now matches the Edit button's color.
- **Attendance**: the "Back" button now genuinely goes back to wherever you came from (Timetable, Dashboard, wherever) instead of always landing on the day board.
- **Timetable**: a postponed class no longer shows twice — only on its new date, in yellow until marked, green once it is. Cancelled classes now show clearly in red. Opening a rescheduled class's register tells you which date it was moved from.
- **Settings**: the app version is now shown on the Institute tab.

## For administrators / IT

- No `firestore.rules` change and no data migration — all seven are application-layer fixes.
- No manual step required.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no undefined identifiers, no new dead code.
- Verified by direct code tracing (interactive browser testing wasn't available this round) — recommend a real click-through of Admissions (new + resumed application), a student profile, and a postpone/cancel on Timetable before considering this fully signed off.

---

# Release Notes — NATYAM ERP v2.21.0

**Release:** Enhancement Round — Timetable/Attendance, Students, Admissions, Parents
**Date:** 29 July 2026
**Baseline:** v2.20.0
**Type:** UI/workflow changes across four modules, from an approved change-request document, plus two bug fixes found while implementing it.

## What changed for the academy

**Timetable & Attendance**
- Tapping a class on the Timetable now opens straight into that day's Attendance register — no more landing on the Batches page by mistake.
- Take register / Postpone / Cancel are no longer separate buttons on the Timetable tile. Postpone and Cancel now live inside the Attendance register itself, next to the date.
- The big "registers unmarked this week" panel is gone from the day board. In its place is a "Missing registers" button — click it to see every unmarked register and jump straight to the correct one (previously, this list could open the wrong date; that's fixed).
- Fixed: the register's date line used to show the weekday twice ("Thursday, Thursday, 30 Jul 2026") — now shows it once.
- The "does not normally meet on this day" note has been removed from the register screen, as requested.

**Students**
- All the filters (Everyone/Not in a batch/Fees overdue/At risk, Status, Level, Batch) are now behind one "Filter" button instead of spread across the top of the page — nothing was removed, it's just tidier. The button highlights when a filter is active.
- The student list itself is simpler: just Student, Batch, and Fees columns, plus the Contact sheet export button is gone.
- Opening a student now shows the everyday actions (Move batch, Collect fee, Promote, Status, Issue certificate) right under their name in orange, instead of at the bottom of the page.
- Archive and Delete now sit next to Edit at the bottom of the profile. Archiving a student changes that button to "Restore Student" the next time you open their profile; restoring changes it back.

**Admissions**
- The New Application form is shorter: 5 steps instead of 9. Applicant and Parent details are now one step; Placement and Batch are now one step. Medical and Documents steps have been removed — NATYAM doesn't collect either.
- Any application saved partway through, before this update, still opens and resumes correctly under the new, shorter form.

**Parents**
- Removed the "Export directory" button, the "No phone number" filter, and the "With siblings" / "Unreachable" tiles at the top of the page. Households and Owing remain.

## For administrators / IT

- No `firestore.rules` change and no data migration for any of the four modules — this is entirely an application-layer/UI change.
- Nothing was removed from the database — Admissions' Medical/Documents fields simply stop being collected going forward; any historical data on older applications is untouched, just no longer shown on the application's own summary screens.

## Quality

- Static analysis clean after each of the four phases: no import cycles, all imports resolve, no undefined identifiers, no new dead code introduced.
- Verified by direct code tracing rather than an interactive browser session this round (by agreement, since a live login wasn't available in this environment) — see the milestone report for the full manual UAT checklist to run through once, in a real browser, before this is considered fully signed off.

---

# Release Notes — NATYAM ERP v2.20.0

**Release:** Milestone B2 — Restore the Old Attendance Screen
**Date:** 28 July 2026
**Baseline:** v2.19.0
**Type:** UI change, at direct request. Attendance is out of the sidebar again; the register screen is back to its simpler, one-day-at-a-time design.

## What changed for the academy

- **Attendance no longer has its own item in the side menu.** It's still exactly where it's always been from Timetable — click "Take register" on any class and it opens straight to that day's roll call.
- **The register itself is back to the simple design**: a day board of batch cards (Marked/Pending), and for one batch on one day, a plain list of students with a Present/Absent button each, an "All present"/"All absent" shortcut, and one "Save register" button. Month view is still there for a full month's grid, per batch.

## For administrators / IT

- No manual step needed — no `firestore.rules` change, no migration.
- "Declare holiday" and any Leave-request actions are not part of this restored screen — neither has had a live path anywhere in the app for some time (holidays are read-only; NATYAM has no Leave concept). A holiday is still shown as an informational banner when one falls on the day being viewed.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no undefined identifiers. The rebuilt page was loaded directly in a real browser (dynamic import) to confirm it parses and every import resolves at runtime, not just statically.

---

# Release Notes — NATYAM ERP v2.19.0

**Release:** Milestone B1 — Multi-Level Batches
**Date:** 28 July 2026
**Baseline:** v2.18.0
**Type:** Feature change. A batch can now be set up to teach more than one level at once, and the "students at a different level cannot join" restriction only applies when none of a batch's levels match.

## What changed for the academy

A batch used to be locked to exactly one level — useful for most classes, but wrong for the ones that genuinely mix levels together in one session. The Batches "Level" field is now a multi-select: tick every level a class actually teaches, and any student at one of those levels can be placed into it without the old rejection.

## For administrators / IT

- No manual step needed — no `firestore.rules` change, no forced migration.
- Existing batches keep working exactly as before (still effectively one-level) until you next open and save them — at that point they pick up the new multi-select shape automatically.
- If you remove a level from a batch that still has students enrolled at exactly that level, you'll be asked to move them first — the same protection as before, now scoped to the specific level being removed rather than any edit at all.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no undefined identifiers.

---

# Release Notes — NATYAM ERP v2.18.0

**Release:** Milestone P2 — Guardian Read Access to Attendance, Certificates, Fees
**Date:** 28 July 2026
**Baseline:** v2.17.6
**Type:** Feature completion. The Parent/Student Portal's Attendance, Certificates, and Fees pages — previously blocked by a documented, deliberate gap — now work for any guardian sign-in.

## What changed for the academy

A parent or student signed into the portal can now see their child's actual attendance rate, issued certificates, and fee history — not just their batch, timetable, and programmes as before. This is the last piece of the portal originally scoped in Milestone P1.

## For administrators / IT

- **`firestore.rules` must be republished again** — four collections' read rules gained one additional, additive branch each.
- **New records work immediately** after republishing — attendance marked, a certificate issued, or a fee raised/collected from now on will show up in the portal right away.
- **Older records need one optional, one-time step** to become visible to guardians: see `docs/migrations/GUARDIAN_FIELDS_BACKFILL.md` for how to run it from the browser console. This is not required for the release to work — it only affects whether history predating today is visible in the portal.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no undefined identifiers.
- Every new guardian-facing query was deliberately designed to query by `guardianPhone`/`guardianEmail` directly (never by `studentId`) — the lesson learned twice already this week from a Firestore query being denied outright when its filter didn't match what the security rule checks.

---

# Release Notes — NATYAM ERP v2.17.6

**Release:** Patch — Portal Router Authentication Check Fix
**Date:** 28 July 2026
**Baseline:** v2.17.5
**Type:** Bug fix, found while live-testing a guardian sign-in that finally got past identity resolution — and then bounced straight back to the login screen. Pure client-side JavaScript — no `firestore.rules` change, no republish needed.

## For administrators / IT

- No manual step needed.
- Retry a guardian sign-in (any method) — it should now actually land on the portal instead of flashing and returning to the login screen.

## What changed

- Every guardian navigation was being silently treated as "not signed in," because the router's authentication check was still hard-wired to the staff sign-in system rather than the guardian one. This is why every guardian sign-in attempt tonight — regardless of which fix had already landed — still bounced back to the login screen. Fixed.

---

# Release Notes — NATYAM ERP v2.17.5

**Release:** Patch — Mobile OTP Identity Lookup Fix
**Date:** 28 July 2026
**Baseline:** v2.17.4
**Type:** Bug fix, found while live-testing a real guardian Mobile OTP sign-in — OTP received and entered correctly, then rejected with "Missing or insufficient permissions."

## For administrators / IT

- **`firestore.rules` must be republished again** — only the `/users/{userId}` read rule changed.
- Retry the guardian Mobile OTP sign-in (and staff Mobile OTP, while you're at it) after republishing.

## What changed

- Signing in with a mobile number (OTP) failed immediately after entering the correct code — for staff and guardians alike. The very first step of resolving who's signing in couldn't run under the previous rules at all. Fixed.

---

# Release Notes — NATYAM ERP v2.17.4

**Release:** Patch — Unified Email/Mobile Login Field
**Date:** 28 July 2026
**Baseline:** v2.17.3
**Type:** UI/UX change to the login screen only — no provider, backend, or `firestore.rules` change. No manual step, no republish needed.

## What changed for the academy

The login screen now has a single "Email or Mobile Number" field instead of two separate boxes. Type either one — the screen figures out which, and shows the right next step (password, or Send OTP) automatically.

## For administrators / IT

- No manual step needed — this is a client-side-only change.
- Confirm: typing an email still shows Password/Login/Forgot-password; typing a 10-digit number switches to "Send OTP"; Google sign-in is unaffected.

---

# Release Notes — NATYAM ERP v2.17.3

**Release:** Patch — Auth Rejection Masking + Mobile OTP Fixes
**Date:** 28 July 2026
**Baseline:** v2.17.2
**Type:** Bug fix, found while live-testing guardian Google sign-in and staff Mobile OTP sign-in back to back. Three separate bugs: a masked rejection error, a single-use reCAPTCHA widget being reused, and a `firestore.rules` write rule that crashed for any phone-only session.

## For administrators / IT

- **`firestore.rules` must be republished again** (fourth time this cycle) — only the `sessions` collection's rule changed.
- Retry both a guardian sign-in and a staff Mobile OTP sign-in after republishing — both should now reach past sign-in cleanly.

## What changed

- A rejected or failed sign-in (wrong account, archived account, or a genuinely unrecognised identity) was showing a raw "Missing or insufficient permissions" instead of its real, specific message — because the code that logs the rejection to the audit log wasn't itself allowed to, and that failure was overriding the real one. Fixed — audit logging can no longer interfere with the actual sign-in outcome.
- Retrying "Send OTP" (a wrong number, a network blip, or just trying again) broke every attempt after the first with a reCAPTCHA error. Fixed — a fresh verifier is used every time.
- Signing in via Mobile OTP could never create its own session record, for anyone, regardless of account status — a `firestore.rules` rule was written in a way that assumed every sign-in carries an email, which Mobile OTP never does. Fixed.

---

# Release Notes — NATYAM ERP v2.17.2

**Release:** Patch — Guardian Sign-In Fix
**Date:** 28 July 2026
**Baseline:** v2.17.1
**Type:** Bug fix, found during the first real guardian sign-in attempt against live Firebase. Every guardian sign-in (Google, Mobile OTP, Email & Password) failed with "Missing or insufficient permissions" — a client-side query bug, not a rules bug. No `firestore.rules` change and nothing to republish this time.

## For administrators / IT

- No manual step needed — this is a code-only fix, no rules republish, no Firestore index to create.
- Retry a guardian sign-in now (Google/Mobile OTP/Email & Password, using a phone or email already on file as a student's `guardianPhone`/`guardianEmail`) — it should now reach the portal instead of showing a permissions error.

## What changed

- The guardian portal's own lookup query only checked the guardian's phone/email, then checked "is this student active" afterward in JavaScript — but Firestore requires a query's own filters to prove the security rule holds *before* it runs the query at all, and the rule also requires the student to be active. Fixed by including that check directly in the query.

---

# Release Notes — NATYAM ERP v2.17.1

**Release:** Patch — Restore-from-Backup Fix + Login Screen Cleanup
**Date:** 27 July 2026
**Baseline:** v2.17.0
**Type:** Bug fix, found during live UAT restore testing. A second restore-from-backup attempt silently stopped partway through — Students came back but Batches, Staff, Invoices and several others didn't, because `firestore.rules` denied the hard-delete step `replaceAll()` needs once a collection already has documents. Also: a cosmetic chart bug, and the two redundant "OR" dividers removed from the login screen.

## For administrators / IT

- **`firestore.rules` must be republished again** — Firebase Console → Firestore Database → Rules → Publish. This is the third rules update this cycle; each one is additive/narrowing on top of the last, nothing else changes.
- **Redo the restore once more** after republishing. It should now run the full sequence (students → admissions → attendance → batches → staff → fees → …) without stopping partway, and Batches/Branch assignment should show correctly afterward.
- No other manual step.

## What changed

- Restoring from a backup a second time (once Firestore already has data from an earlier restore or normal use) used to silently stop partway through, leaving some collections restored and others untouched — this is why Batches looked wiped after a Students-only restore appeared to succeed. Now fixed: a full restore completes end to end.
- A monthly chart (e.g. Finance's collection chart) could show a harmless console error and flat/invisible bars when every value in view was zero. Fixed.
- The login screen no longer shows a stray "OR" divider line between "Forgot password?" and "Continue with Google", or between "Continue with Google" and the Mobile Number field.

---

# Release Notes — NATYAM ERP v2.17.0

**Release:** Phase 2 / Milestone P1 — Parent/Student Portal
**Date:** 26 July 2026
**Baseline:** v2.16.1
**Type:** A new, read-only guardian-facing portal — no new role, no new Firestore collection, no change to any existing staff-facing behaviour. Additive `firestore.rules` (new `allow read` branches only), two new denormalized fields on `students`, and one bug fix to phone-number normalisation.

---

## What changed for the academy

### Parents and students can now sign in and see their own records

A new sign-in destination — the same login screen everyone already uses — now recognises a parent or student, not just staff. Once signed in, they see a small, separate view of exactly their own child's:

- **Batch and timetable** — which batch they're in, and its weekly schedule.
- **Attendance** — this week's and this month's attendance rate.
- **Programmes** — any performances, workshops, competitions, or exams they're taking part in.
- **Certificates** — everything issued to them.
- **Fees** — what's billed, collected, outstanding and overdue, and a plain history of invoices and payments.

There is **no payment button anywhere in this view** — fees are shown, never collected, refunded, or waived from here.

A household with more than one child enrolled gets a simple switcher to move between them; everything else works exactly the same.

### Nobody had to be specially "added" as a parent

There's no new account type to create, no new Settings screen, and no separate approval step. The moment a guardian's phone number or email is on file for a student — which staff already enter when enrolling that student — that guardian can sign in immediately using the same Mobile OTP, Google, or Email & Password methods already built. Staff accounts and their access are completely unaffected; this is a second, independent way a *different* kind of person is recognised at sign-in.

---

## For administrators / IT

- **`firestore.rules` must be republished** (Firebase Console → Firestore Database → Rules, or `firebase deploy --only firestore:rules`) — this release adds new, additive read permissions for a guardian. Every existing rule is unchanged; nothing was loosened for staff.
- **Strongly recommended: exercise the new rules in the Firebase Rules Emulator before publishing** — this file is hand-written and has no automated test suite. See the Manual UAT checklist below for exactly what to verify.
- **A one-time backfill is needed for any mobile number already saved without `+91`.** This release fixes a normalisation bug in the student record (mirroring the same fix already made for staff accounts in v2.16.1) — until existing bare-digit `guardianPhone` values are corrected, Mobile OTP won't resolve a guardian identity for those families. Re-open each affected student's record in Settings/Students and re-save the mobile number field once to normalise it — the same remedy v2.16.1 already documented for staff.
- **No change to Users, Roles, or any existing screen.** A guardian never appears in Settings → Users — there's nothing to manage there for this feature.
- **Could not be tested end-to-end in the development environment** — a real guardian sign-in requires a live Firebase project, a real phone number, and real student records with guardian contacts on file. Built and statically verified; needs one real pass before relying on it.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no undefined identifiers.
- Every existing staff sign-in path, route guard, and capability check confirmed unchanged by direct code trace — the guardian fallback only ever runs after the staff resolution path has already rejected an identity as genuinely unrecognised, and only continues if that specific identity also matches no guardian contact.
- `firestore.rules` changes are additive `||` branches only, on five collections' `allow read` — no write rule, and no other collection's rules, were touched.

**Not verifiable from this environment:** a real guardian sign-in, and the Firebase Rules Emulator tests below, both require a live Firebase project. The manual checklist is what needs a real pass.

## Manual UAT checklist

- [ ] Republish `firestore.rules`.
- [ ] **Rules Emulator (do this before relying on the release):** a phone-only guardian token (no `email` claim) reading their own linked student succeeds; the same token reading a different family's student is denied; the same pattern holds for `attendance`/`certificates`/`invoices`/`payments`. Every existing staff-token rule test still passes unchanged.
- [ ] Pick a real student with a guardian phone number on file; if it was saved without `+91`, re-save it once to normalise.
- [ ] Sign in as that guardian via Mobile OTP (or Google/Email if a `guardianEmail` is on file) — confirm the portal opens, not the staff app.
- [ ] Confirm the portal shows exactly that child's own batch, timetable, attendance % (week and month), programmes, certificates, and fee dues — and nothing else (no other student, no staff screens, no Settings, no Finance).
- [ ] Confirm there is no button anywhere in the portal that collects, refunds, or waives a fee.
- [ ] For a household with two or more children, confirm the switcher shows all of them and each one's own data is correct.
- [ ] Reschedule an existing batch's day/time (as an Administrator) while students remain enrolled — confirm every affected family's portal timetable updates without them doing anything.
- [ ] Add or remove a student from a programme's participant list — confirm only that student's own Programmes view changes.
- [ ] Sign in as each of the four existing staff roles — confirm nothing changed: same navigation, same route guards, same behaviour as before this release.
- [ ] On a genuinely empty `users` collection, confirm the very first sign-in still becomes bootstrap Administrator (must never be intercepted by the guardian fallback).
- [ ] Confirm a sign-in with no matching `users` record and no matching guardian contact still shows the existing "not set up yet" message.

## Known issues

None introduced by this release. See earlier release notes for trade-offs carried forward from prior work. Not yet built (unchanged from before): displaying `authMethods`/sign-in history in the Users table (cosmetic).

## Upgrade

Replace the application files, **and republish `firestore.rules`** — this release does not work without the new rules. Recommend backfilling any un-normalised `guardianPhone` values before relying on Mobile OTP for guardians. No other manual step and no IndexedDB migration is required.
