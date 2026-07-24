/**
 * NATYAM ERP 2.0 — Student data migration: IndexedDB → Cloud Firestore
 *
 * A ONE-TIME MIGRATION UTILITY. This is deliberately not part of normal
 * application operation — no route, no menu entry, no button anywhere in
 * the UI calls this. It exists to move a school's real, pre-Milestone-3
 * student records out of this browser's local IndexedDB and into the
 * Cloud Firestore collection the live app now reads, once, by hand, from
 * the browser that actually holds that data.
 *
 * See docs/migrations/STUDENT_DATA_MIGRATION.md for how to run this,
 * what it does and doesn't do, and its known limitations — read that
 * before running it, not just this file.
 *
 * Design notes:
 *   - Reads IndexedDB through the archived StudentRepository
 *     (js/data/archive/students.repository.indexeddb.js) — the exact
 *     implementation `students$` pointed to before Milestone 3, not a
 *     re-derivation of it.
 *   - Writes Firestore through students$.importLegacyRecord() /
 *     students$.update() — never touches the Firestore SDK directly here,
 *     keeping "no Firestore SDK usage outside Repository classes" true
 *     even for this migration tool.
 *   - Existing Firestore students are read once, up front, into an
 *     in-memory map — not re-queried per record — so a run against a
 *     thousand legacy students is a small, fixed number of Firestore
 *     reads, not a thousand duplicate-check queries.
 *   - Every record is isolated: a validation failure or a write failure
 *     on one student is logged and the run continues, never aborts.
 */

import { StudentRepository } from '../data/archive/students.repository.indexeddb.js';
import { students$ } from '../data/repositories.js';
import { db } from '../core/db.js';
import { session } from '../core/session.js';
import { nowISO } from '../utils/date.js';
import { uid } from '../utils/id.js';

const legacyRepo = new StudentRepository();

/**
 * @param {object} [options]
 * @param {boolean} [options.overwrite=false]  When a legacy record's
 *   admissionNo matches an existing Firestore student, update that
 *   existing document instead of skipping it. Off by default — never
 *   overwrites unless explicitly asked.
 * @param {boolean} [options.dryRun=false]  Validate and report what
 *   *would* happen without writing anything to Firestore. Strongly
 *   recommended as the first run — see the documentation.
 * @returns {Promise<object>} the migration report (see docs/migrations/STUDENT_DATA_MIGRATION.md)
 */
export async function migrateStudentsToFirestore({ overwrite = false, dryRun = false } = {}) {
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

    // 1. Everything currently in IndexedDB, including archived students —
    // "all existing Student records" means all of them, not just active ones.
    const legacyRecords = await legacyRepo.all({ includeDeleted: true });
    report.totalIndexedDb = legacyRecords.length;

    // 2. One snapshot of what Firestore already has, used for every
    // duplicate check below instead of querying per record.
    const existing = await students$.all({ includeDeleted: true });
    const byAdmissionNo = new Map(existing.filter((s) => s.admissionNo).map((s) => [s.admissionNo, s]));
    const codesInUse = new Set(existing.filter((s) => s.studentCode).map((s) => s.studentCode));

    for (const record of legacyRecords) {
        const duplicate = record.admissionNo ? byAdmissionNo.get(record.admissionNo) : null;

        if (duplicate && !overwrite) {
            report.skippedDuplicates += 1;
            continue;
        }

        // A source record carrying a studentCode already (a retry of a
        // partial prior run) must not collide with a code some *other*
        // student already has in Firestore.
        if (record.studentCode && codesInUse.has(record.studentCode)
            && byAdmissionNo.get(record.admissionNo)?.studentCode !== record.studentCode) {
            report.validationFailures.push({
                id: record.id, admissionNo: record.admissionNo, name: record.name,
                reason: `studentCode ${record.studentCode} is already in use by a different student.`
            });
            continue;
        }

        try {
            students$.validate(record);
        } catch (err) {
            report.validationFailures.push({
                id: record.id, admissionNo: record.admissionNo, name: record.name, reason: err.message
            });
            continue;
        }

        if (dryRun) {
            if (duplicate) report.overwritten += 1; else report.migrated += 1;
            continue;
        }

        try {
            if (duplicate) {
                await students$.update(duplicate.id, record);
                report.overwritten += 1;
            } else {
                const written = await students$.importLegacyRecord(record);
                byAdmissionNo.set(written.admissionNo, written);
                if (written.studentCode) codesInUse.add(written.studentCode);
                report.migrated += 1;
            }
        } catch (err) {
            report.writeFailures.push({
                id: record.id, admissionNo: record.admissionNo, name: record.name, reason: err.message
            });
        }
    }

    report.durationMs = Date.now() - startedAt;

    if (!dryRun) {
        await db.put('auditLog', {
            id: uid('AUD'),
            entity: 'Student',
            entityId: null,
            action: 'migrateFromIndexedDB',
            detail: {
                totalIndexedDb: report.totalIndexedDb,
                migrated: report.migrated,
                overwritten: report.overwritten,
                skippedDuplicates: report.skippedDuplicates,
                validationFailures: report.validationFailures.length,
                writeFailures: report.writeFailures.length,
                durationMs: report.durationMs
            },
            actorId: session.actorId(),
            actorName: session.actorName(),
            at: nowISO()
        });
    }

    return report;
}
