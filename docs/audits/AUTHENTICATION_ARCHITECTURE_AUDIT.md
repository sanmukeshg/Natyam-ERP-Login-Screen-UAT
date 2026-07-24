# Milestone 4 — Authentication & Session Management Architecture Audit

**Date:** 2026-07-24
**Type:** Review and hardening exercise — no feature work, no new authentication methods
**Result:** Two minor findings, both low-severity. **Both fixed as of v2.4.1** — see Resolution notes under each finding below.
**Related:** [ADR-014](architecture/adr/ADR-014-Firebase-Authentication-and-Firestore.md), [firestore-data-model.md](architecture/firestore-data-model.md)

---

## 1. Firebase Authentication Isolation

**Confirmed compliant.** Every file importing the Firebase SDK (`gstatic.com/firebasejs`) is one of the three approved layers:

| File | Layer |
|---|---|
| `js/core/firebase.js` | Bootstrap (the one file allowed to call `initializeApp`) |
| `js/services/auth/providers/googleProvider.js` | Authentication Provider |
| `js/data/users.repository.firestore.js` | Repository |
| `js/data/students.repository.firestore.js` | Repository |
| `js/data/sessions.repository.firestore.js` | Repository |
| `js/data/sequenceGenerator.firestore.js` | Repository-adjacent infrastructure (shared counter) |

`js/services/auth/providers/mobileOtpProvider.js` correctly imports nothing — it's a pure placeholder. `js/app.js` uses `firebase.js`'s `watchAuthState()` wrapper rather than calling `onAuthStateChanged` itself, closing the one gap found in the Milestone 2/3 validation round.

## 2. Authentication Flow Validation

Traced end to end against the 9-step lifecycle in the brief:

1. **Google Sign-In selected** → `login.page.js` calls `signIn('google')`.
2. **Firebase authenticates** → `auth.service.js`'s `signIn()` delegates to `googleProvider.signIn()` (`signInWithPopup`).
3. **Profile resolved** → the provider returns a normalised `{email, name, provider}` identity.
4. **User record located or created** → `resolveProvisionedUser()` calls `users$.findByEmail()`; on no match, the one-time `bootstrapAdministrator()` exception (empty-collection only).
5. **IAM role resolved** → the found/created `users` document's `role` field.
6. **Permissions loaded** → `session.hydrate()` populates `_capabilities` from `roleCapabilities(user.role)` (`app.config.js`).
7. **Session established** → `session.hydrate()` (in-memory + prefs persistence) and a Firestore `sessions` document (`ensureSessionRecord`).
8. **App initialization completes** → `enterApp()` mounts the Shell and router.
9. **Protected modules accessible** → router's per-navigation guard (§6 below).

Every step traces to exactly one function; there is no second code path that reimplements any of them. Restoring an existing session on reload runs through the *same* `resolveProvisionedUser()` as a fresh sign-in (`app.js`'s `handleAuthStateChange`), so the two cases can't drift apart from each other.

## 3. Session Management Architecture

- **One source of truth for *application* session state:** `js/core/session.js`'s `Session` singleton (`user`, `_capabilities`, `activeBranchId`). Firebase Authentication is a separate, complementary source of truth for *identity/credential* state — the two aren't competing for the same responsibility, they answer different questions ("is there a valid Google credential" vs. "who does that map to in NATYAM, with what role").
- **Session creation/restoration/destruction, logout, browser refresh:** all verified working via the single `handleAuthStateChange` path (§2).
- **Expired/invalid session:** router's per-navigation guard (`session.isAuthenticated()`, then a live Firestore user-status re-check) catches both a lapsed idle timeout and a deactivated/archived account, ending the session and reloading to login either way.
- **Multiple tab behavior — finding, not a security gap:** Firebase's own auth persistence is shared across tabs on one origin, so signing out in one tab correctly signs out every other open tab (each tab's `onAuthStateChanged` fires and reloads). However, the Firestore `sessions` *record* each tab created for itself (tracked in that tab's own `sessionStorage`, deliberately not shared across tabs) is never explicitly ended when the sign-out is *observed* via cross-tab propagation rather than initiated locally — only `logout()`/`expireSession()` end a session record, and neither runs on that code path. **Effect:** functionally the person is correctly signed out everywhere; only the audit-quality session record for the *other* tab is left without an `endedAt`, which would understate accuracy if a future "active sessions" admin view is built on this data. See Finding A below.

## 4. IAM Integration

- Role resolution is centralized in exactly one place: `roleCapabilities()`/`roleTable()` in `app.config.js`, read by `session.hydrate()`. No file resolves capabilities independently.
- The four approved roles are confirmed unchanged: `administrator`, `owner_accountant`, `teacher_reception`, `viewer` — verified directly against `app.config.js`'s `ROLES` export.
- **Finding, not currently exploitable:** `session.js`'s `role()` falls back to `'administrator'` — the *most* privileged role — if called before a user is hydrated. `session.can()` (the actual authorization check) does not depend on `role()` and fails closed correctly (an empty, un-hydrated `_capabilities` Set grants nothing) — and the router already blocks any protected page from rendering before a user is hydrated, so this fallback is not reachable from a real navigation today. It's still the wrong default under Document 10 §4's own "Fail Secure" principle, and any future code that trusts `role()` directly (rather than going through `can()`) would inherit a fail-open bug for free. See Finding B below.

## 5. Firestore Security Rules Alignment

Checked every rule in `firestore.rules` against `app.config.js`'s actual capability grants, role by role:

| Collection | Rule | Matches capability grant? |
|---|---|---|
| `users` | read: own doc or Administrator; create: Administrator (+ one-time bootstrap); update: Administrator; delete: never | ✅ — only Administrator holds `user.*` |
| `students` | read: any provisioned active user; create/edit: Administrator + Teacher & Reception; archive/restore (field-level): Administrator only; hard delete: Administrator only | ✅ — matches `student.view` (all 4 roles), `student.edit` (Administrator + Teacher & Reception), `student.delete` (Administrator only) exactly |
| `sessions` | create/read/end: own records only; Administrator reads all | ✅ — no capability governs this collection; the caller-owns-their-record model is the correct default |
| `meta/counters` | Administrator + Teacher & Reception | ✅ — matches who can create a code-bearing entity (users, students) |
| everything else | denied by default | ✅ — correct; no other module has a Firestore collection yet |

No client-side-only authorization gaps found: every write capability enforced in the UI/Service layer has a matching, independently-enforced rule server-side.

## 6. Route Protection & Authorization

`router.js`'s `resolve()` runs, in order, on every navigation: (1) `session.isAuthenticated()`, (2) a live re-read of the signed-in user's Firestore status, (3) `session.touch()`, (4) the matched route's required capability via `session.can()`. A failure at any of the first two ends the session and reloads to login; a failure at the fourth renders an in-app "not available to your role" screen rather than the page. This is the same sequence documented in Milestone 2/3 and is unchanged.

## 7. Logout & Session Cleanup

`logout()` (`auth.service.js`) writes an audit row, ends the Firestore session record, and signs out of whichever provider is active — all before the reload that `handleAuthStateChange`'s null-branch performs. Confirmed this is the *only* code path with a "Log out" affordance (`shell.js`'s header button); no other UI element ends a session.

## 8. Documentation Completeness

`ADR-014`, `docs/architecture/firestore-data-model.md`, `docs/migrations/STUDENT_MODULE_MIGRATION.md`, `CHANGELOG.md`, and `RELEASE_NOTES.md` are internally consistent with each other and with the code as it stands today (version 2.4.0 throughout). This audit itself is the first dedicated "Authentication documentation" artifact beyond those — filed here rather than folded into an existing doc, matching this project's existing per-milestone report convention (`UAT_ROUND_3/4/5_REPORT.md`).

## 9. Regression Analysis

No code changed as part of this audit. Static checks re-run clean (70 modules, no cycles, all imports resolve, no undefined identifiers) to confirm the codebase's baseline state is exactly what the last approved milestone left it in.

---

## Findings

### Finding A — Orphaned session records on cross-tab sign-out (Low severity)
- **Root cause:** `sessions$` records are tracked per-tab via `sessionStorage`; only `logout()`/`expireSession()` end one, and neither runs when a *different* tab observes a sign-out via Firebase's cross-tab auth propagation.
- **Business impact:** None today (nothing reads the `sessions` collection yet). Would understate accuracy for a future "active sessions" admin view.
- **Files affected:** `js/app.js` (`handleAuthStateChange`'s `if (appEntered)` branch).
- **Recommended solution:** before reloading in that branch, best-effort end whatever session record this tab holds (same call `expireSession()`/`logout()` already make), tagged with a reason like `cross_tab_signout`.
- **Regression risk:** Very low — additive, best-effort (already-established `.catch(() => {})` pattern used elsewhere in this file).
- **Resolution (AUTH-001, v2.4.1):** `endActiveSession()`'s record-closing half was extracted into a private `endLocalSessionRecord(reason)` helper (`js/services/auth.service.js`), reused by a new exported `acknowledgeRemoteSignOut()` that ends the local session record with reason `'cross_tab_signout'` — deliberately skipping a second provider `signOut()` call, since Firebase has already reported this tab signed out by the time it fires. Wired into `js/app.js`'s `handleAuthStateChange`'s `if (appEntered)` branch, immediately before its existing `location.reload()`. `logout()`/`expireSession()`'s own behaviour is unchanged.

### Finding B — `session.role()`'s fallback defaults to the most-privileged role (Low severity, not currently exploitable)
- **Root cause:** `role() { return this.user?.role || 'administrator'; }` in `js/core/session.js` — a leftover default from when `owner` (a single, always-full-access role) was the fallback in the old five-role model; never revisited when the role model consolidated to four.
- **Business impact:** None currently — `session.can()` (the real authorization check) doesn't call `role()` and fails closed on its own; the router blocks any page from rendering before hydration completes. Risk is latent: any *future* code that branches on `session.role()` directly, the way `dashboard.page.js` already does for its teacher-mode display, would silently fail open if ever reached before hydration.
- **Files affected:** `js/core/session.js` (one line).
- **Recommended solution:** change the fallback to `null` (or `'viewer'`, the least-privileged role) — fail secure, per Document 10 §4's own stated principle.
- **Regression risk:** Very low — `roleLabel()` already has its own `|| 'User'` fallback for a null role, so display code is unaffected either way.
- **Resolution (AUTH-002, v2.4.1):** `role()` in `js/core/session.js` now returns `this.user?.role || null`. Verified the only direct caller (`dashboard.page.js`'s teacher-mode check) and every `roleLabel()` caller (`shell.js`, `session.js`'s own `require()`, `router.js`'s denied-route screen) are unaffected — `null` cannot equal a real role name, and `roleLabel()`'s existing `|| 'User'` fallback already covers a null role gracefully.

Both findings were reviewed and approved for a follow-up patch-hardening task (separate from this audit itself, per its own "review, not refactor" framing), then implemented, validated, and released as v2.4.1.
