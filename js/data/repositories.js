/**
 * NATYAM ERP 2.0 — Entity repositories
 *
 * One module, one export per entity. Each repository declares its store and
 * searchable fields and then adds only the queries that are genuinely specific
 * to it; everything else — id minting, stamping, soft delete, audit, search,
 * pagination — comes from the base class.
 *
 * The rule that keeps this layer honest: repositories answer questions about
 * *one* store. Anything that has to touch two stores atomically (a payment
 * updating an invoice and posting to the ledger) belongs in a service, not
 * here. 1.0 blurred that line and ended up with a payment path that could
 * leave the books unbalanced if the second write failed.
 */

import { db, request } from '../core/db.js';

/* ==========================================================================
   BRANCHES
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 23) — see branches.repository.firestore.js.
   The old IndexedDB implementation is archived, not deleted, at
   js/data/archive/branches.repository.indexeddb.js. `branches$` is
   re-exported from the Firestore module below so every existing caller
   (app.js, students/settings/reports/batches/programs/finance/dashboard/
   admissions.service.js) keeps importing from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   ACADEMIC YEARS
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 23) — see
   academicYears.repository.firestore.js. The old IndexedDB implementation
   is archived, not deleted, at
   js/data/archive/academicYears.repository.indexeddb.js. `academicYears$`
   is re-exported from the Firestore module below so its one caller
   (settings.service.js) keeps importing from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   STUDENTS
   ========================================================================== */

// StudentRepository moved to Firestore (Milestone 3) — see
// students.repository.firestore.js. The old IndexedDB implementation is
// archived, not deleted, at js/data/archive/students.repository.indexeddb.js.
// `students$` is re-exported from the Firestore module below so every
// existing caller (students.service.js, admissions.service.js, and every
// module that reads it) keeps importing it from this same file, unchanged.

/* ==========================================================================
   ADMISSIONS
   ========================================================================== */

// AdmissionRepository moved to Firestore (Milestone 5) — see
// admissions.repository.firestore.js. The old IndexedDB implementation is
// archived, not deleted, at js/data/archive/admissions.repository.indexeddb.js.
// `admissions$` is re-exported from the Firestore module below so every
// existing caller (admissions.service.js, reports/dashboard/analytics/
// notifications/search.service.js) keeps importing it from this same file,
// unchanged.

/* ==========================================================================
   ADMISSION DRAFTS
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 22) — see drafts.repository.firestore.js.
   The old IndexedDB implementation is archived, not deleted, at
   js/data/archive/drafts.repository.indexeddb.js. `drafts$` is re-exported
   from the Firestore module below so every existing caller
   (admissions.service.js, app.js's maintenance sweep) keeps importing
   from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   BATCHES
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 19) — see batches.repository.firestore.js.
   The old IndexedDB implementation is archived, not deleted, at
   js/data/archive/batches.repository.indexeddb.js. `batches$` is
   re-exported from the Firestore module below so every existing caller
   (batches.service.js, attendance/session/students/admissions/staff/
   dashboard/reports/analytics/settings/search.service.js) keeps
   importing from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   STAFF
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 20) — see staff.repository.firestore.js.
   The old IndexedDB implementation is archived, not deleted, at
   js/data/archive/staff.repository.indexeddb.js. `staff$` and
   `branchIdsOf` are re-exported from the Firestore module below so every
   existing caller (staff.service.js, attendance/reports/dashboard/
   settings.service.js) keeps importing from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   ATTENDANCE
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 6) — see attendance.repository.firestore.js.
   The old IndexedDB implementation is archived, not deleted, at
   js/data/archive/attendance.repository.indexeddb.js. `attendance$` and
   `AttendanceMath` are re-exported from the Firestore module below so every
   existing caller (attendance.service.js, reports/dashboard/students/staff/
   certificates.service.js) keeps importing from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   HOLIDAYS
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 23) — see holidays.repository.firestore.js.
   The old IndexedDB implementation is archived, not deleted, at
   js/data/archive/holidays.repository.indexeddb.js. `holidays$` is
   re-exported from the Firestore module below so its one caller
   (dashboard.service.js) keeps importing from this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   FEE PLANS, INVOICES, PAYMENTS, FINANCE
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 21) — Fee Collection and Finance migrated
   together because they were atomically coupled (a payment/refund/expense/
   payroll write always touched ledgerEntries in the same IndexedDB
   transaction). See js/data/feePlans.repository.firestore.js,
   invoices.repository.firestore.js, payments.repository.firestore.js,
   ledger.repository.firestore.js, expenses.repository.firestore.js and
   salaries.repository.firestore.js. The old IndexedDB implementations are
   archived, not deleted, at js/data/archive/*.repository.indexeddb.js.
   The cross-collection postings that used to be `db.unit()` calls inside
   fees.service.js/finance.service.js now live as exported functions in
   ledger.repository.firestore.js (postPayment, postRefund,
   postExpenseCreate, postExpenseUpdate, postExpenseRemove, postPayroll) —
   Firestore SDK access is reserved to the repository layer, per
   js/core/firebase.js's own stated architecture.
   ========================================================================== */

/* ==========================================================================
   PROGRAMMES, CERTIFICATES, DOCUMENTS
   --------------------------------------------------------------------------
   Programmes moved to Firestore (Milestone 17) — see
   programs.repository.firestore.js. Certificates moved to Firestore
   (Milestone 18) — see certificates.repository.firestore.js. Documents
   moved to Firestore (Milestone 22) — see
   documents.repository.firestore.js. All three old IndexedDB
   implementations are archived, not deleted, at
   js/data/archive/programs.repository.indexeddb.js,
   js/data/archive/certificates.repository.indexeddb.js and
   js/data/archive/documents.repository.indexeddb.js. `programs$`,
   `certificates$` and `documents$` are re-exported from their Firestore
   modules below so every existing caller (programs.service.js,
   certificates.service.js, students.service.js) keeps importing from
   this same file, unchanged.
   ========================================================================== */

/* ==========================================================================
   NOTIFICATIONS, AUDIT, SETTINGS, USERS
   --------------------------------------------------------------------------
   Notifications moved to Firestore (Milestone 22) — see
   notifications.repository.firestore.js. The old IndexedDB implementation
   is archived, not deleted, at
   js/data/archive/notifications.repository.indexeddb.js. `notifications$`
   is re-exported from the Firestore module below so every existing caller
   (notifications.service.js, app.js's maintenance sweep) keeps importing
   from this same file, unchanged.
   ========================================================================== */

// AuditRepository moved to Firestore (Milestone 24 - the final store off
// IndexedDB). The old implementation is archived, not deleted, at
// js/data/archive/auditLog.repository.indexeddb.js. `audit$` is re-exported
// from the Firestore module below so audit.service.js keeps importing it
// from this same file, unchanged.

// UserRepository moved to Firestore — see users.repository.firestore.js.
// `users$` is re-exported from there below so every existing caller
// (settings.service.js, audit.service.js, auth.service.js, app.js) keeps
// importing it from this same module, unchanged.

/* ==========================================================================
   CURRICULUM & ACADEMIC STRUCTURE (Phase 2)
   --------------------------------------------------------------------------
   Moved to Firestore (Milestone 23) — see curricula.repository.firestore.js
   and curriculumLevels.repository.firestore.js. The old IndexedDB
   implementations are archived, not deleted, at
   js/data/archive/curricula.repository.indexeddb.js and
   js/data/archive/curriculumLevels.repository.indexeddb.js. `curricula$`
   and `curriculumLevels$` are re-exported from their Firestore modules
   below so every existing caller (curriculum.service.js,
   students.service.js) keeps importing from this same file, unchanged.
   ========================================================================== */

/**
 * Settings are key/value, not entities: no ids, no audit noise, no soft
 * delete. A thin wrapper rather than a Repository subclass, because none of
 * the base class's machinery applies.
 */
export const settings$ = {
    async get(key, fallback = null) {
        const row = await db.get('settings', key);
        return row ? row.value : fallback;
    },

    async set(key, value) {
        await db.put('settings', { key, value, updatedAt: new Date().toISOString() });
        return value;
    },

    async all() {
        const rows = await db.all('settings');
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    /**
     * Atomic counter for human-facing numbers (NAT/INV/2026/0417). Read and
     * increment happen inside one transaction so two receipts written in the
     * same tick cannot collide — 1.0 read the count of existing rows, which
     * reused a number as soon as anything was deleted.
     */
    async nextSequence(name, count = 1) {
        let allocated = 0;
        await db.unit(['settings'], async (s) => {
            const row = await request(s.settings.get('sequences'));
            const map = { ...(row?.value || {}) };
            const current = Number(map[name]) || 0;
            allocated = current + 1;
            map[name] = current + count;
            await request(s.settings.put({ key: 'sequences', value: map, updatedAt: new Date().toISOString() }));
        }, 'settings:sequence');
        return allocated;
    }
};

/* ==========================================================================
   SINGLETONS
   One instance each. The `$` suffix marks a repository at the call site so a
   page never confuses `students$` (data access) with `students` (a local array).
   ========================================================================== */

export { branches$ } from './branches.repository.firestore.js';
export { academicYears$ } from './academicYears.repository.firestore.js';
export { students$ } from './students.repository.firestore.js';
export { admissions$ } from './admissions.repository.firestore.js';
export { drafts$ } from './drafts.repository.firestore.js';
export { batches$ } from './batches.repository.firestore.js';
export { staff$, branchIdsOf } from './staff.repository.firestore.js';
export { attendance$ } from './attendance.repository.firestore.js';
export { classSessions$ } from './classSessions.repository.firestore.js';
export { holidays$ } from './holidays.repository.firestore.js';
export { feePlans$ } from './feePlans.repository.firestore.js';
export { invoices$ } from './invoices.repository.firestore.js';
export { payments$ } from './payments.repository.firestore.js';
export { ledger$ } from './ledger.repository.firestore.js';
export { expenses$ } from './expenses.repository.firestore.js';
export { salaries$ } from './salaries.repository.firestore.js';
export { programs$ } from './programs.repository.firestore.js';
export { certificates$ } from './certificates.repository.firestore.js';
export { documents$ } from './documents.repository.firestore.js';
export { notifications$ } from './notifications.repository.firestore.js';
export { audit$ } from './auditLog.repository.firestore.js';
export { users$, authMethodsOf } from './users.repository.firestore.js';
export { curricula$ } from './curricula.repository.firestore.js';
export { curriculumLevels$ } from './curriculumLevels.repository.firestore.js';

/** Static analysis helpers re-exported so pages import from one place. */
export { AttendanceMath } from './attendance.repository.firestore.js';
export { deriveInvoiceStatus, reconcile } from './invoices.repository.firestore.js';
export { InvoiceMath } from './invoices.repository.firestore.js';
export { PaymentMath } from './payments.repository.firestore.js';
export { LedgerMath } from './ledger.repository.firestore.js';
export { ExpenseMath } from './expenses.repository.firestore.js';

/** Cross-collection ledger postings — see ledger.repository.firestore.js's header for why these live here. */
export {
    postPayment, postRefund, postExpenseCreate, postExpenseUpdate, postExpenseRemove, postPayroll
} from './ledger.repository.firestore.js';
