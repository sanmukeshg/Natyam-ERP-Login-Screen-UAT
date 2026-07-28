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
