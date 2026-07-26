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
