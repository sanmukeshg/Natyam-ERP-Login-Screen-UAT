/**
 * NATYAM ERP 2.0 — AuthenticationService
 *
 * UI → AuthenticationService → AuthenticationProvider → Google Identity
 * Services → Session Service → Storage. This file is the "Authentication
 * Service" step: it knows *that* a sign-in happened and what to do about
 * it — provisioning, audit, the Firestore session record — but not *how*
 * one happens. That mechanics lives in js/services/auth/providers/, one
 * file per method, each returning the same normalised identity shape
 * (`{ email, name, provider }`). Adding Mobile+OTP later means adding a
 * provider file and a registry entry below, not touching anything else in
 * this file.
 *
 * Google Sign-In proves *identity* — Firebase Authentication verifies it
 * against a real Google account, a genuine security boundary. It does not
 * by itself prove *authorization*: whether that identity is allowed into
 * NATYAM at all is decided by `resolveProvisionedUser()` against the
 * Firestore `users` collection, matching the IAM workflow spec (§7, §19)
 * and Document 6 §22 ("only an Administrator creates users") — a
 * signed-in identity with no matching, active user record is turned away
 * with the same message whether the record doesn't exist, was archived,
 * or was deactivated, except where the spec allows a status to say more
 * (Account Disabled / Account Unavailable are statuses, not an identity
 * leak).
 */

import { session } from '../core/session.js';
import { bus, EVENTS } from '../core/bus.js';
import { users$ } from '../data/repositories.js';
import { sessions$ } from '../data/sessions.repository.firestore.js';
import { recordAuditEntry } from '../data/auditLog.repository.firestore.js';
import { googleProvider } from './auth/providers/googleProvider.js';
import { mobileOtpProvider } from './auth/providers/mobileOtpProvider.js';

/** Every AuthenticationProvider this app knows about, keyed by id. */
const PROVIDERS = {
    [googleProvider.id]: googleProvider,
    [mobileOtpProvider.id]: mobileOtpProvider
};

// The active Firestore session document and which provider opened it,
// carried in sessionStorage (not localStorage) so a same-tab refresh keeps
// pointing at the same record, but closing the tab does not leave a
// reference lying around for a later, unrelated tab to pick up.
const SESSION_RECORD_KEY = 'natyam.sessionRecordId';
const SESSION_PROVIDER_KEY = 'natyam.sessionProviderId';

/**
 * Calls into the shared auditLog writer with an explicit `actor` override —
 * sign-in runs before (or instead of) a session existing, so the row can't
 * always be attributed via `session.actorId()` the way every other
 * repository's writeAuditRow() does.
 */
async function writeAuditRow(entityId, action, detail, actor = null) {
    await recordAuditEntry('Auth', action, entityId, detail, actor);
}

/** The provider id an identity came from — our own providers set `.provider`; a restored Firebase User is asked directly. */
function providerIdOf(identity) {
    if (identity.provider) return identity.provider;
    const raw = identity.providerData?.[0]?.providerId || '';
    return raw.includes('google') ? 'google' : 'unknown';
}

/**
 * Ensures the current browser tab has a Firestore session record: reuses
 * one already tracked for this tab (a refresh), or opens a new one. Not
 * written on every idle-timeout touch — only here, at the moments a
 * session actually starts.
 */
async function ensureSessionRecord(user, providerId) {
    if (sessionStorage.getItem(SESSION_RECORD_KEY)) return;
    const id = await sessions$.create({ userId: user.id, provider: providerId });
    sessionStorage.setItem(SESSION_RECORD_KEY, id);
    sessionStorage.setItem(SESSION_PROVIDER_KEY, providerId);
}

/**
 * Clears this tab's own sessionStorage pointer and, if it held one, soft-ends
 * the Firestore session record — the bookkeeping half of ending a session.
 * Split out from endActiveSession() so acknowledgeRemoteSignOut() (below) can
 * do just this much, without also calling a provider's signOut() a second
 * time when Firebase has already reported this tab signed out.
 * @param {'logout'|'idle_timeout'|'cross_tab_signout'} reason
 * @returns {string} the providerId this tab's session was using, for callers that still need it
 */
async function endLocalSessionRecord(reason) {
    const recordId = sessionStorage.getItem(SESSION_RECORD_KEY);
    const providerId = sessionStorage.getItem(SESSION_PROVIDER_KEY) || googleProvider.id;
    sessionStorage.removeItem(SESSION_RECORD_KEY);
    sessionStorage.removeItem(SESSION_PROVIDER_KEY);

    if (recordId) {
        await sessions$.end(recordId, reason).catch((err) => console.error('Could not end session record', err));
    }
    return providerId;
}

/** @param {'logout'|'idle_timeout'} reason */
async function endActiveSession(reason) {
    const providerId = await endLocalSessionRecord(reason);
    await (PROVIDERS[providerId] || googleProvider).signOut();
}

/**
 * Signs in through the named provider and runs the resulting identity
 * through the same provisioning check every provider shares.
 * @param {'google'|'mobile'} providerId
 * @returns {Promise<object>} the app's own provisioned user record
 */
export async function signIn(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) throw new Error(`Unknown sign-in method "${providerId}".`);

    const identity = await provider.signIn();
    return resolveProvisionedUser(identity);
}

/**
 * Decides whether a verified identity is actually let into NATYAM. Called
 * both by signIn() (a fresh sign-in) and by app.js's onAuthStateChanged
 * (restoring an existing Firebase session on reload) — the same decision
 * either way, so there is exactly one place that makes it.
 *
 * @param {{email: string, name?: string, displayName?: string, provider?: string}} identity
 *   Either a provider's normalised identity or a raw Firebase User (both
 *   shapes carry `email`; the name field differs, so both are checked).
 * @returns {Promise<object>} the app's own user record (Firestore `users` doc)
 * @throws {Error} with a message safe to show on the login screen — the
 *   caller must sign back out of the underlying provider when this throws,
 *   since it now considers this identity authenticated even though this
 *   app does not consider it authorized. (signIn()'s provider does this on
 *   its own popup-level errors; app.js's restore path calls expireSession().)
 */
export async function resolveProvisionedUser(identity) {
    const email = identity.email;
    const name = identity.name || identity.displayName || email;
    const providerId = providerIdOf(identity);

    const existing = await users$.findByEmail(email);

    if (existing) {
        if (existing.deletedAt) {
            await writeAuditRow(existing.id, 'login_failed', { reason: 'archived' }, existing);
            bus.emit(EVENTS.LOGIN_FAILED, { email, reason: 'archived' });
            throw new Error('Account unavailable. This account has been archived.');
        }
        if (existing.status !== 'active') {
            await writeAuditRow(existing.id, 'login_failed', { reason: 'inactive' }, existing);
            bus.emit(EVENTS.LOGIN_FAILED, { email, reason: 'inactive' });
            throw new Error('Account disabled. Ask an administrator to reactivate your account.');
        }

        await writeAuditRow(existing.id, 'login_succeeded', null, existing);
        bus.emit(EVENTS.LOGIN_SUCCEEDED, { userId: existing.id });
        await ensureSessionRecord(existing, providerId);
        return existing;
    }

    // No record at all. The only way in is the one-time bootstrap: the
    // very first sign-in this school ever makes becomes Administrator.
    // Every sign-in after that fails the same way an unknown email always
    // would.
    try {
        const admin = await users$.bootstrapAdministrator({ name, email, loginType: 'Google' });
        await writeAuditRow(admin.id, 'login_succeeded', { bootstrap: true }, admin);
        bus.emit(EVENTS.LOGIN_SUCCEEDED, { userId: admin.id, bootstrap: true });
        await ensureSessionRecord(admin, providerId);
        return admin;
    } catch {
        await writeAuditRow(email, 'login_failed', { email, reason: 'not_provisioned' });
        bus.emit(EVENTS.LOGIN_FAILED, { email, reason: 'not_provisioned' });
        throw new Error('Your account is not set up yet. Ask an administrator to add you as a user.');
    }
}

/** Ends the current session. Safe to call even if nothing is signed in. */
export async function logout() {
    const actor = session.user ? { id: session.actorId(), name: session.actorName() } : null;
    if (actor) await writeAuditRow(actor.id, 'logout_completed', null, actor);
    bus.emit(EVENTS.LOGOUT_COMPLETED, {});
    await endActiveSession('logout');
}

/**
 * Ends the session because it lapsed (idle timeout, or a provisioning
 * rejection during restore) rather than because the person chose to sign
 * out — a distinct security event per the IAM workflow spec (§18).
 */
export async function expireSession() {
    const actor = session.user ? { id: session.actorId(), name: session.actorName() } : null;
    if (actor) await writeAuditRow(actor.id, 'session_expired', null, actor);
    bus.emit(EVENTS.SESSION_EXPIRED, {});
    await endActiveSession('idle_timeout');
}

/**
 * Called when this tab observes a sign-out it did not initiate itself — a
 * different tab called logout(), so Firebase's shared auth persistence has
 * already fired onAuthStateChanged(null) here too. That other tab already
 * signed the provider out; doing it again here would be redundant. All that's
 * left is this tab's own bookkeeping: its Firestore session record (tracked
 * only in this tab's sessionStorage) would otherwise sit open forever.
 */
export async function acknowledgeRemoteSignOut() {
    await endLocalSessionRecord('cross_tab_signout');
}
