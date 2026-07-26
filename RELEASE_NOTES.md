# Release Notes — NATYAM ERP v2.16.1

**Release:** Phase 1 / Milestone A1 — Unified Authentication Platform (Email/Password + Google + Mobile OTP), plus a same-day follow-up (v2.16.1) adding self-service account linking and an India phone default
**Date:** 26 July 2026
**Baseline:** v2.15.0
**Type:** New authentication providers plus one new, Administrator-configurable permission layer (`authMethods`, the single source of truth — the older `loginType` field is now deprecated), a mobile-number-uniqueness rule, a one-time migration for existing accounts, self-service account linking, and a default country code for mobile numbers. No change to IAM, roles, session management, or the Firestore data model beyond these additive fields.

---

## What changed for the academy

### Three ways to sign in, not one

The login screen now offers Email & Password (front and centre), Google Sign-In (unchanged, one step down), and Mobile OTP (a phone number and a text-message code). Nobody who signs in with Google today needs to do anything differently — that path is completely untouched.

### Who can use which method is now something you control

Every Administrator-created account already had a Role. It now also has a set of allowed **sign-in methods** — Email & Password, Google, and/or Mobile OTP — configured on the same Add/Edit User screen. A person's Role still decides what they can do once they're in; this new setting decides how they're allowed to get in at all, and the two are kept completely separate on purpose. Every account that existed before this release keeps working exactly as it does today (Google), with nothing to reconfigure unless you want to add a method for someone.

### Creating a new Email & Password user

Adding a user with Email & Password now includes one more step: set an initial password. The new person gets a password-reset email right away, so their very first action is choosing their own password rather than using the one you typed in.

### Forgot password

A "Forgot password?" link on the login screen sends a reset email through Firebase — nobody, including this application, ever sees or handles the new password itself.

### A few safety rules that are now enforced automatically

- An account can never be saved with **zero** sign-in methods enabled — the option simply isn't allowed.
- **You cannot lock yourself out.** If you're editing your own Administrator account, you can't remove every method from it — the system will stop you and explain why.
- **Mobile numbers are unique.** The same mobile number can't be assigned to two active accounts, since Mobile OTP looks a person up by their number alone.
- If someone tries to sign in with a method their account isn't permitted to use, they see a clear, plain-English message telling them so — never a raw technical error.

### Already using Google? You can now add a password to that same account

If your account only ever signed in with Google, you can now add Email & Password to it yourself — no need to create a second account. Go to **Settings → Users**, find your own row, and click **Set a password**. This only works on your *own* account, signed in as yourself — an Administrator cannot set a password for someone else's existing account this way (that's a deliberate Firebase security boundary, not a missing feature — see the Administrator note below for how to add Email & Password when creating a brand-new user instead).

### No more typing +91

The Mobile Number field, both at sign-in and in Settings → Users, now assumes an Indian number if you don't type a country code. Enter your 10-digit number as-is — `+91` is added automatically.

---

## For administrators / IT

- **No `firestore.rules` republish required for this release** — verified directly; the new field this release adds to a user's record is already covered by the existing rule that lets an Administrator edit any user.
- **Two Firebase Console settings must be turned on before this release works**, under Authentication → Sign-in method: **Email/Password** and **Phone**. Neither is a `firestore.rules` change, so this is a different tab than the one this project has republished rules to before — easy to miss if you're only thinking about rules.
- **One migration step to run once, by hand**, from a signed-in Administrator's browser console — see `js/migrations/authMethodsMigration.js`'s own instructions. It gives every existing account an explicit list of allowed sign-in methods (Google, since that's the only one anyone has used so far) instead of leaving that unset. Nothing breaks if you don't run it right away, but it should be run before this release has been live very long — it's the one thing in this release that's a real data change, not just new code.
- **Existing Google accounts are completely unaffected** by the release itself. No forced re-authentication, nothing to do for anyone already using Google — once the migration step above has run.
- **A field called `loginType` on user records is now retired.** Nothing reads it anymore; it's left in place purely so nothing breaks that still expects it to exist. No action needed.
- **Mobile OTP sign-in and SMS delivery could not be tested end-to-end in the development environment** — no real phone, no live SMS. It has been built and statically verified, but needs one real pass, on a real device, before you rely on it.
- **If you already saved a mobile number in Settings before this update**, re-open that user's Edit panel and re-save the mobile number field once — this normalises it to the `+91...` form Mobile OTP actually matches against. Numbers saved before v2.16.1 may have been stored without the country code, which would silently fail to match at sign-in.

## Quality

- Static analysis clean: no import cycles, all imports resolve, no undefined identifiers.
- Every existing Google sign-in path, session restore, and route guard confirmed unchanged by direct code trace — the new providers are additive, not a rewrite of anything that already worked.
- The login screen renders correctly and responsively at both desktop and mobile widths in this environment's browser preview; the three-method layout, the divider structure, and the two-step Mobile OTP form (phone number → send → code entry → verify) were all visually confirmed.
- Confirmed in a live browser session (not just static reading of the code) that a real sign-in attempt against Firebase, before Email/Password and Phone are enabled in Console, now shows a plain, friendly message rather than the raw `Firebase: Error (auth/operation-not-allowed)` text an earlier version of this screen displayed.

**Not verifiable from this environment:** actually signing in with a real Google account, a real email/password credential, or a real phone number/SMS code all require a live, signed-in browser session against the real Firebase project. The manual checklist below is what needs a real pass.

## Manual UAT checklist

- [ ] Turn on Email/Password and Phone sign-in methods in Firebase Console (Authentication → Sign-in method) before testing anything else below.
- [ ] Run the one-time `authMethods` migration (`js/migrations/authMethodsMigration.js`) with `dryRun: true` first, inspect the report, then re-run with `dryRun: false`. Confirm every existing user record now has `authMethods: ["google"]`.
- [ ] Sign in with an existing (now-migrated) Google account — confirm it behaves exactly as before.
- [ ] As an Administrator, add a new user with Email & Password enabled and an initial password — confirm the new person can sign in, and confirm your own Administrator session was completely undisturbed by the creation.
- [ ] Confirm the newly created person receives a password-reset email and can set their own password.
- [ ] Sign in with Email & Password using a configured account.
- [ ] Click "Forgot password?", confirm the reset email arrives and works.
- [ ] Enable Mobile OTP for a test account with a real phone number; sign in with it end to end (send code, receive SMS, verify).
- [ ] Try creating or editing a user with a mobile number already in use by another active account — confirm it's rejected with a clear message.
- [ ] Try saving a user with every sign-in method unchecked — confirm it's rejected.
- [ ] As the signed-in Administrator, try removing every sign-in method from your own account — confirm it's specifically rejected with a message about your own account, not the generic message.
- [ ] As an Administrator, uncheck a method for a *different* test account and confirm signing in with that method now shows: *"This authentication method is not enabled for your account. Please use one of your permitted sign-in methods or contact your Administrator"* — not a raw Firebase error — while the account's other allowed methods still work.
- [ ] Attempt a sign-in with a wrong password / bad OTP code and confirm the message shown is plain language, not a raw `Firebase: Error (auth/...)` string.
- [ ] Confirm session persistence across a page reload for all three methods, and that logout works for all three.
- [ ] Confirm route guards still redirect an unauthenticated visit to the login screen.
- [ ] As a signed-in Google-only user, go to Settings → Users → your own row → **Set a password**; confirm it succeeds and that Email & Password now works to sign in as that same account.
- [ ] Confirm the **Set a password** button does *not* appear on any row except your own.
- [ ] On the login screen, type a bare 10-digit mobile number (no `+91`) into Mobile Number and confirm **Send OTP** works without needing a country code.
- [ ] In Settings → Users, save a mobile number without a `+91` prefix, then confirm Mobile OTP sign-in with that number succeeds (proves the storage-side and sign-in-side normalisation match).

## Known issues

None introduced by this release. See v2.4.0's through v2.15.0's release notes for trade-offs carried forward from earlier work.

## Upgrade

Replace the application files, **and turn on Email/Password + Phone sign-in methods in Firebase Console** — this release does not work without both enabled. No `firestore.rules` republish is required this time. No IndexedDB migration is required for any other module.
