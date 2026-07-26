/**
 * NATYAM ERP 2.0 — Admission data migration: IndexedDB → Cloud Firestore
 *
 * A ONE-TIME MIGRATION UTILITY. This is deliberately not part of normal
 * application operation — no route, no menu entry, no button anywhere in
 * the UI calls this. It exists to move a school's real, pre-Milestone-5
 * admission records out of this browser's local IndexedDB and into the
 * Cloud Firestore collection the live app now reads, once, by hand, from
 * the browser that actually holds that data.
 *
 * See docs/migrations/ADMISSIONS_DATA_MIGRATION.md for how to run this,
 * what it does and doesn't do, and its known limitations — read that
 * before running it, not just this file.
 *
 * Design notes (mirrors js/migrations/studentDataMigration.js exactly):
 *   - Reads IndexedDB through the archived AdmissionRepository
 *     (js/data/archive/admissions.repository.indexeddb.js) — the exact
 *     implementation `admissions$` pointed to before Milestone 5, not a
 *     re-derivation of it.
 *   - Writes Firestore through admissions$.importLegacyRecord() /
 *     admissions$.update() — never touches the Firestore SDK directly
 *     here, keeping "no Firestore SDK usage outside Repository classes"
 *     true even for this migration tool.
 *   - Existing Firestore admissions are read once, up front, into an
 *     in-memory map keyed by `applicationNo` — not re-queried per record —
 *     so a run against a thousand legacy applications is a small, fixed
 *     number of Firestore reads, not a thousand duplicate-check queries.
 *   - Every record is isolated: a validation failure or a write failure
 *     on one application is logged and the run continues, never aborts.
 */

import { AdmissionRepository } from '../data/archive/admissions.repository.indexeddb.js';
import { admissions$ } from '../data/repositories.js';
import { recordAuditEntry } from '../data/auditLog.repository.firestore.js';

const legacyRepo = new AdmissionRepository();

/**
 * @param {object} [options]
 * @param {boolean} [options.overwrite=false]  When a legacy record's
 *   applicationNo matches an existing Firestore admission, update that
 *   existing document instead of skipping it. Off by default — never
 *   overwrites unless explicitly asked.
 * @param {boolean} [options.dryRun=false]  Validate and report what
 *   *would* happen without writing anything to Firestore. Strongly
 *   recommended as the first run — see the documentation.
 * @returns {Promise<object>} the migration report (see docs/migrations/ADMISSIONS_DATA_MIGRATION.md)
 */
export async function migrateAdmissionsToFirestore({ overwrite = false, dryRun = false } = {}) {
    const startedAt = Date.now();

    const report = {
        totalIndexedDb: 0,
        migrated: 0,
        overwritten: 0,
        skippedDuplicates: 0,
        validationFailures: [],
        writeFailures: [],
        durationMs: 0,
        dryRun,
        overwrite
    };

    // 1. Everything currently in IndexedDB, including rejected/archived
    // applications — "all existing admission records" means all of them.
    const legacyRecords = await legacyRepo.all({ includeDeleted: true });
    report.totalIndexedDb = legacyRecords.length;

    // 2. One snapshot of what Firestore already has, used for every
    // duplicate check below instead of querying per record.
    const existing = await admissions$.all({ includeDeleted: true });
    const byApplicationNo = new Map(existing.filter((a) => a.applicationNo).map((a) => [a.applicationNo, a]));

    for (const record of legacyRecords) {
        const duplicate = record.applicationNo ? byApplicationNo.get(record.applicationNo) : null;

        if (duplicate && !overwrite) {
            report.skippedDuplicates += 1;
            continue;
        }

        try {
            admissions$.validate(record);
        } catch (err) {
            report.validationFailures.push({
                id: record.id, applicationNo: record.applicationNo, name: record.name, reason: err.message
            });
            continue;
        }

        if (dryRun) {
            if (duplicate) report.overwritten += 1; else report.migrated += 1;
            continue;
        }

        try {
            if (duplicate) {
                await admissions$.update(duplicate.id, record);
                report.overwritten += 1;
            } else {
                const written = await admissions$.importLegacyRecord(record);
                byApplicationNo.set(written.applicationNo, written);
                report.migrated += 1;
            }
        } catch (err) {
            report.writeFailures.push({
                id: record.id, applicationNo: record.applicationNo, name: record.name, reason: err.message
            });
        }
    }

    report.durationMs = Date.now() - startedAt;

    if (!dryRun) {
        await recordAuditEntry('Admission', 'migrateFromIndexedDB', null, {
            totalIndexedDb: report.totalIndexedDb,
            migrated: report.migrated,
            overwritten: report.overwritten,
            skippedDuplicates: report.skippedDuplicates,
            validationFailures: report.validationFailures.length,
            writeFailures: report.writeFailures.length,
            durationMs: report.durationMs
        });
    }

    return report;
}
