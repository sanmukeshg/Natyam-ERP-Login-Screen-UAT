/**
 * NATYAM ERP 2.0 — authMethods migration: backfill for pre-Milestone-A1 accounts
 *
 * A ONE-TIME MIGRATION UTILITY. Deliberately not part of normal application
 * operation — no route, no menu entry, no button anywhere in the UI calls
 * this. It exists to give every `users` document an explicit `authMethods`
 * array before that field becomes the single source of truth for
 * authentication permission (see `authMethodsOf()` in
 * js/data/users.repository.firestore.js and `resolveProvisionedUser()` in
 * js/services/auth.service.js).
 *
 * Why this exists instead of a runtime fallback: the alternative — treating
 * a missing `authMethods` as `['google']` at sign-in time — was explicitly
 * rejected. Runtime fallback logic hides a data gap behind an assumption
 * that has to be trusted forever; a one-time migration closes the gap once,
 * for real, and after it the application code never has to guess. Once this
 * has been run, `authMethodsOf()` returns an empty array for anything it
 * genuinely doesn't recognise — failing closed (no method permitted), never
 * open (some method assumed permitted).
 *
 * What it does: every `users` document with no `authMethods` array (or an
 * empty one) gets `authMethods: ['google']` — Google was the only provider
 * that existed before this milestone, so every pre-existing account only
 * ever signed in that way. A record that already has a non-empty array
 * (created after Milestone A1) is left untouched.
 *
 * How to run it, once, from a signed-in Administrator's browser console:
 * load this module by its path (js/migrations/authMethodsMigration.js),
 * the same way the other two migration utilities are run, call
 * migrateAuthMethods() with dryRun set true first and inspect the
 * returned report, then call it again with dryRun false (the default)
 * to actually write.
 */

import { users$, authMethodsOf } from '../data/repositories.js';
import { recordAuditEntry } from '../data/auditLog.repository.firestore.js';

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] Report what *would* change
 *   without writing anything to Firestore. Recommended as the first run.
 * @returns {Promise<object>} { total, migrated, alreadyMigrated, failures, dryRun }
 */
export async function migrateAuthMethods({ dryRun = false } = {}) {
    const report = { total: 0, migrated: 0, alreadyMigrated: 0, failures: [], dryRun };

    const allUsers = await users$.all({ includeDeleted: true });
    report.total = allUsers.length;

    for (const user of allUsers) {
        if (authMethodsOf(user).length) {
            report.alreadyMigrated += 1;
            continue;
        }

        if (dryRun) {
            report.migrated += 1;
            continue;
        }

        try {
            await users$.update(user.id, { authMethods: ['google'] });
            report.migrated += 1;
        } catch (err) {
            report.failures.push({ id: user.id, email: user.email, name: user.name, reason: err.message });
        }
    }

    if (!dryRun) {
        await recordAuditEntry('User', 'migrateAuthMethods', null, {
            total: report.total,
            migrated: report.migrated,
            alreadyMigrated: report.alreadyMigrated,
            failures: report.failures.length
        });
    }

    return report;
}
