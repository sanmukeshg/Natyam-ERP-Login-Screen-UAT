/**
 * NATYAM ERP 2.0 — Guardian fields backfill: Attendance, Certificates,
 * Invoices, Payments (Milestone P2)
 *
 * A ONE-TIME MIGRATION UTILITY. This is deliberately not part of normal
 * application operation — no route, no menu entry, no button anywhere in
 * the UI calls this. It exists to add `guardianPhone`/`guardianEmail` onto
 * every existing attendance/certificate/invoice/payment document that
 * predates Milestone P2 — new records already carry these fields
 * automatically (see attendance.service.js#postRegister(),
 * certificates.service.js#issue(), fees.service.js#createInvoice(), and
 * ledger.repository.firestore.js#postPayment()), but a guardian cannot
 * read their child's *older* history in the portal until this has been
 * run once, by hand, against the school's real data.
 *
 * See docs/migrations/GUARDIAN_FIELDS_BACKFILL.md for how to run this and
 * what it does and doesn't do — read that before running it, not just
 * this file.
 *
 * Design notes:
 *   - One read of every student (including archived ones — a student who
 *     later became inactive can still have real history a guardian should
 *     see) builds a single studentId -> {guardianPhone, guardianEmail} map,
 *     used for all four collections rather than re-queried per record.
 *   - Writes go through each repository's own bulkSetGuardianFields() —
 *     chunked writeBatch field updates, not one update() call per record.
 *     A per-record update() (with its own audit-row write) across
 *     thousands of documents would repeat the exact Firestore-quota
 *     exhaustion a restore's per-record writes already caused once this
 *     session — this keeps "no Firestore SDK usage outside Repository
 *     classes" true while still being cheap to run.
 *   - Every collection is isolated: a failure on one does not stop the
 *     others, and is reported, not thrown.
 *   - A record whose guardian fields already match the current student
 *     record is skipped — safe to run more than once, and a re-run after
 *     correcting a family's phone/email number picks up the correction.
 */

import { students$, attendance$, certificates$, invoices$, payments$ } from '../data/repositories.js';
import { recordAuditEntry } from '../data/auditLog.repository.firestore.js';

const COLLECTIONS = [
    { name: 'attendance', repo: attendance$, all: () => attendance$.all() },
    { name: 'certificates', repo: certificates$, all: () => certificates$.all({ includeDeleted: true }) },
    { name: 'invoices', repo: invoices$, all: () => invoices$.all({ includeDeleted: true }) },
    { name: 'payments', repo: payments$, all: () => payments$.all({ includeDeleted: true }) }
];

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]  Report what *would* change
 *   without writing anything to Firestore. Strongly recommended as the
 *   first run.
 * @returns {Promise<object>} one report per collection, plus a total.
 */
export async function backfillGuardianFields({ dryRun = false } = {}) {
    const startedAt = Date.now();

    // One snapshot of every student, active or not — used for every
    // collection below instead of querying per record.
    const students = await students$.all({ includeDeleted: true });
    const guardianOf = new Map(students.map((s) => [s.id, {
        guardianPhone: s.guardianPhone || null,
        guardianEmail: s.guardianEmail || null
    }]));

    const report = { dryRun, collections: {}, totalUpdated: 0, durationMs: 0 };

    for (const { name, repo, all } of COLLECTIONS) {
        const summary = { totalRecords: 0, needingUpdate: 0, updated: 0, skippedNoStudent: 0, failures: [] };

        try {
            const records = await all();
            summary.totalRecords = records.length;

            const updates = [];
            for (const record of records) {
                const guardian = guardianOf.get(record.studentId);
                if (!guardian) { summary.skippedNoStudent += 1; continue; }

                const alreadyCorrect = record.guardianPhone === guardian.guardianPhone
                    && record.guardianEmail === guardian.guardianEmail;
                if (alreadyCorrect) continue;

                summary.needingUpdate += 1;
                updates.push({ id: record.id, ...guardian });
            }

            if (!dryRun && updates.length) {
                summary.updated = await repo.bulkSetGuardianFields(updates);
            } else {
                summary.updated = dryRun ? 0 : 0;
            }
        } catch (err) {
            summary.failures.push({ reason: err.message });
        }

        report.collections[name] = summary;
        report.totalUpdated += summary.updated;
    }

    report.durationMs = Date.now() - startedAt;

    if (!dryRun) {
        await recordAuditEntry('GuardianFieldsBackfill', 'run', null, {
            totalStudents: students.length,
            collections: Object.fromEntries(
                Object.entries(report.collections).map(([name, s]) => [name, {
                    totalRecords: s.totalRecords, needingUpdate: s.needingUpdate,
                    updated: s.updated, failures: s.failures.length
                }])
            ),
            totalUpdated: report.totalUpdated,
            durationMs: report.durationMs
        });
    }

    return report;
}
