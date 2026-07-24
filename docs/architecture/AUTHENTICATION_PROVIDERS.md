# Authentication Providers — NATYAM ERP

**Status:** Living reference (updated as providers are added; unlike an ADR,
this document is expected to change as the roadmap below is delivered)
**Last updated:** 2026-07-24
**Related:** [ADR-014](adr/ADR-014-Firebase-Authentication-and-Firestore.md) (the decision that introduced this architecture), [firestore-data-model.md](firestore-data-model.md), [AUTHENTICATION_ARCHITECTURE_AUDIT.md](../audits/AUTHENTICATION_ARCHITECTURE_AUDIT.md)

This document exists to answer one question precisely: **which sign-in
methods actually work today, which are planned, and why adding one never
requires touching the rest of the system.** ADR-014 records the decision
to adopt Firebase Authentication; this document tracks the provider
roster itself, which is expected to grow.

---

## 1. Implemented Providers

**Google Authentication, via Firebase Authentication, is the only
production authentication provider today.**

| | |
|---|---|
| Provider file | `js/services/auth/providers/googleProvider.js` |
| Provider id | `'google'` |
| Mechanism | Firebase `signInWithPopup` against Google OAuth |
| Status | Implemented, in production use |

Every person who signs into NATYAM ERP today — Administrator, Owner &
Accountant, Teacher & Reception, or Viewer — does so through this one
provider. It is the sole entry point `js/modules/auth/login.page.js`
currently offers as a working option ("Continue with Google").

## 2. Planned Providers

**Mobile OTP Authentication is intentionally deferred to a future
milestone. It is not implemented, and this is a deliberate architectural
placeholder, not a gap.**

| | |
|---|---|
| Provider file | `js/services/auth/providers/mobileOtpProvider.js` |
| Provider id | `'mobile'` |
| Status | Placeholder — registered, not implemented |

To be specific about what "placeholder" means in this codebase:

- `mobileOtpProvider.js` **exists today** as a real file, registered in
  `auth.service.js`'s `PROVIDERS` map exactly like `googleProvider.js` is.
  It is not a TODO comment or a design note — it is working code that
  participates in the real provider registry.
- Both of its methods, `signIn()` and `signOut()`, are **intentionally
  not implemented**: `signIn()` throws a user-facing message ("Mobile
  sign-in is not available yet. Please continue with Google.") and
  `signOut()` is a no-op, since `signIn()` can never have succeeded.
- **No authentication functionality is currently missing** as a result.
  Every role that needs to sign in today can do so, fully, through
  Google. The Mobile section of the login screen is visibly present and
  clearly labelled "Coming soon" (`js/modules/auth/login.page.js`) —
  disclosed to the person looking at it, not hidden.
- **The authentication architecture already supports multiple
  providers** — this is proven by the fact that a second provider file
  already exists, is already wired into the same registry, service, and
  login screen as the first, and required no change to any of them to be
  added. Implementing OTP for real, in a future milestone, means
  replacing the contents of this one file's `signIn()`/`signOut()` —
  nothing else in the system needs to change to accommodate it.

## 3. Architecture

**Confirmed: the `AuthenticationProvider` abstraction supports adding a
new provider without requiring changes to Session Service, IAM, Route
Guards, User Service, or Firestore Security Rules.** This is not an
aspiration — it is verified against the actual code below, and it is the
same guarantee that let `mobileOtpProvider.js` be added alongside
`googleProvider.js` with zero changes to any of the five.

| Layer | File | Why it doesn't need to change per provider |
|---|---|---|
| **Session Service** | `js/core/session.js` | `hydrate({ user, ... })` takes the app's own provisioned user record — `{ id, name, role, ... }` — the same shape regardless of which provider produced the identity behind it. Nothing in this file reads a provider id. |
| **IAM** | `js/config/app.config.js` (`ROLES`/`CAPABILITIES`), `session.can()` | Capability grants are keyed by the user's `role` field, resolved once at hydration. A role is a property of a `users` document, not of how its owner happened to sign in. |
| **Route Guards** | `js/core/router.js` | Every navigation checks `session.isAuthenticated()`, a live Firestore user-status re-read, and `session.can(...)`. None of these three checks reads or branches on a provider id. |
| **User Service** | `js/data/users.repository.firestore.js`, `resolveProvisionedUser()` in `auth.service.js` | Users are found by email (`findByEmail`) and provisioned/validated the same way no matter which provider's identity produced that email. `resolveProvisionedUser()` accepts any provider's normalised `{email, name, provider}` shape uniformly — the `provider` field is recorded (for the session record's own audit trail) but never changes which branch of provisioning logic runs. |
| **Firestore Security Rules** | `firestore.rules` | Every rule keys off `request.auth.uid` and the caller's `users` document (role, status) — confirmed by inspection that no rule references a provider, sign-in method, or anything Google-specific. A rule that trusts a signed-in, provisioned user trusts them the same way whichever provider verified them. |

The one place a provider id is *ever* threaded through deliberately is the
`sessions` collection (`js/data/sessions.repository.firestore.js`), which
records which provider opened a given session record — an audit detail,
not a decision point for any of the five layers above.

## 4. Roadmap — Future Mobile Authentication Milestone

Not scheduled yet; recorded here so the shape of the work is clear when it
is taken up. This milestone will replace `mobileOtpProvider.js`'s two
methods with real logic — no other file listed in §3 is expected to
change.

- **Firebase Phone Authentication** as the underlying mechanism —
  consistent with this project's existing Google-ecosystem direction
  (ADR-014), rather than a separate SMS gateway or Twilio integration
  (both already explicitly excluded from this project's roadmap).
- **OTP verification** — a one-time code sent to and confirmed from the
  phone number entered on the login screen's already-built (currently
  disabled) Mobile Number field.
- **Phone number verification** as part of that same flow, so a `mobile`
  number recorded against a `users` document (already part of the user
  model since v2.3.0) is confirmed to actually belong to its owner before
  being trusted for sign-in.
- **Optional account linking (Google ↔ Mobile)** — allowing one person
  to sign in through either method into the same `users` record, rather
  than two providers ever being able to create two separate identities
  for what is really one person. Exact linking mechanism (matched by
  email vs. an explicit link action) is a decision for that milestone,
  not this document.
- **Parent/Student Portal authentication** — the roadmap item this
  provider primarily exists for. ADR-014 already scopes Google Sign-In to
  staff-facing roles (Administrator, Owner & Accountant, Teacher &
  Reception, Viewer); the Parent Portal and Student Portal are planned to
  authenticate via Mobile+OTP only, since a parent or student is not
  expected to hold a Google account NATYAM ERP can provision against the
  same way staff do.

---

## Summary

| Question | Answer |
|---|---|
| What works today? | Google Authentication (Firebase Authentication), for all four staff roles. |
| What's missing? | Nothing, for any role or workflow in production use today. |
| What's planned but not built? | Mobile OTP sign-in — deliberately deferred, with its extension point already in place. |
| Does adding it require a redesign? | No — by construction, and verified in §3 above. |
