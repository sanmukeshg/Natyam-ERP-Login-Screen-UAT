/**
 * NATYAM ERP 2.0 — Authentication service
 *
 * Verifies credentials and starts or ends a session. This is a client-only
 * app with no server, so "verifying credentials" means comparing a hash
 * held in this browser's own IndexedDB — a UI gate, not a security
 * boundary. See js/core/session.js for the fuller note.
 *
 * Failure messages follow the IAM Authentication & Authorization Workflow
 * spec (§7, §19): an unknown email and a wrong password return the exact
 * same generic message, so a login screen can never be used to find out
 * whether an account exists. A recognised-but-disabled account is the one
 * case allowed to say more, because that is a status, not an identity leak.
 */

import { session } from '../core/session.js';
import { db } from '../core/db.js';
import { bus, EVENTS } from '../core/bus.js';
import { uid } from '../utils/id.js';
import { nowISO } from '../utils/date.js';
import { verifyPassword } from '../utils/crypto.js';
import { users$ } from '../data/repositories.js';

const GENERIC_FAILURE = 'Authentication failed. Check your email and password and try again.';

/**
 * Writes directly to the auditLog store rather than through a Repository's
 * `_audit()` (there is no "Auth" entity to attach one to) or through
 * audit.service.js's `auditRow()` helper, which always attributes the
 * current session — wrong here, since a login attempt runs before (or
 * instead of) that session existing. The row shape matches both exactly.
 */
async function writeAuditRow(entityId, action, detail, actor = null) {
    await db.put('auditLog', {
        id: uid('AUD'),
        entity: 'Auth',
        entityId,
        action,
        detail: detail || null,
        actorId: actor?.id || session.actorId(),
        actorName: actor?.name || session.actorName(),
        at: nowISO()
    });
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} the signed-in user record
 * @throws {Error} with a message safe to show on the login form
 */
export async function login(email, password) {
    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail || !password) throw new Error(GENERIC_FAILURE);

    const user = await users$.findByEmail(trimmedEmail);
    const passwordOk = user && await verifyPassword(password, user.passwordHash, user.passwordSalt);

    if (!passwordOk) {
        await writeAuditRow(trimmedEmail, 'login_failed', { email: trimmedEmail });
        bus.emit(EVENTS.LOGIN_FAILED, { email: trimmedEmail });
        throw new Error(GENERIC_FAILURE);
    }

    if (user.deletedAt) {
        await writeAuditRow(user.id, 'login_failed', { reason: 'archived' }, user);
        bus.emit(EVENTS.LOGIN_FAILED, { email: trimmedEmail, reason: 'archived' });
        throw new Error('Account unavailable. This account has been archived.');
    }

    if (user.status !== 'active') {
        await writeAuditRow(user.id, 'login_failed', { reason: 'inactive' }, user);
        bus.emit(EVENTS.LOGIN_FAILED, { email: trimmedEmail, reason: 'inactive' });
        throw new Error('Account disabled. Ask an administrator to reactivate your account.');
    }

    session.createSession(user);
    await writeAuditRow(user.id, 'login_succeeded', null, user);
    bus.emit(EVENTS.LOGIN_SUCCEEDED, { userId: user.id });

    return user;
}

/** Ends the current session. Safe to call even if nothing is signed in. */
export async function logout() {
    const actor = session.user ? { id: session.actorId(), name: session.actorName() } : null;
    session.destroySession();
    if (actor) await writeAuditRow(actor.id, 'logout_completed', null, actor);
    bus.emit(EVENTS.LOGOUT_COMPLETED, {});
}

/**
 * Ends the session because it lapsed (idle timeout, or found expired mid-
 * navigation) rather than because the person chose to sign out — a
 * distinct security event per the IAM workflow spec (§18).
 */
export async function expireSession() {
    const actor = session.user ? { id: session.actorId(), name: session.actorName() } : null;
    session.destroySession();
    if (actor) await writeAuditRow(actor.id, 'session_expired', null, actor);
    bus.emit(EVENTS.SESSION_EXPIRED, {});
}
