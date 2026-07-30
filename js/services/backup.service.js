/**
 * NATYAM ERP 2.0 — Backup and restore service
 *
 * This application stores everything in one browser on one machine. There is
 * no server holding a copy. If the laptop is stolen, the profile is reset or
 * the browser decides to reclaim space, the school's entire record goes with
 * it — eighty-seven students, four years of attendance, every receipt.
 *
 * So backup is not a nice-to-have feature tucked in settings; it is the only
 * thing standing between the school and total loss, and it is written
 * accordingly: a backup file is self-describing, a restore states plainly what
 * it is about to destroy, and a partial restore is impossible.
 */

import { bus, EVENTS } from '../core/bus.js';
import { session } from '../core/session.js';
import { db } from '../core/db.js';
import { APP, SCHEMA, STORE_NAMES, CAPABILITIES } from '../config/app.config.js';
import { nowISO, localDate, formatDateTime } from '../utils/date.js';
import { downloadFile } from '../utils/dom.js';
import {
    settings$, students$, admissions$, attendance$, classSessions$, programs$, certificates$, batches$, staff$,
    feePlans$, invoices$, payments$, ledger$, expenses$, salaries$,
    documents$, drafts$, notifications$,
    branches$, academicYears$, curricula$, curriculumLevels$, holidays$,
    audit$
} from '../data/repositories.js';

const FILE_KIND = 'natyam-erp-backup';

// Sections with no IndexedDB history at all — `classSessions` (Milestone 7)
// never existed as a local store the way Students/Admissions/Attendance did
// before their own migrations, so it has no entry in SCHEMA/STORE_NAMES for
// restore()'s recognition filter to match against on its own. Named here
// explicitly so a backup's classSessions section isn't silently dropped as
// "unrecognised," without inventing a fictional IndexedDB store declaration
// purely to satisfy that filter. Future Firestore-only collections with no
// IndexedDB precedent belong here too.
const FIRESTORE_ONLY_SECTIONS = ['classSessions'];

// Store name -> the Firestore repository that now actually holds this data,
// for every section buildBackup() already overrides with a live read below.
// exportStore() (single-section export) used to skip straight to
// db.all(storeName) for every store, which was correct once and is now
// simply wrong for these 22 — they moved off IndexedDB, so db.all() returns
// whatever stale rows were last written there (seed.js's original demo data,
// for a store that has never been touched since), not what the app or a
// real backup actually shows.
const FIRESTORE_STORE_REPOS = {
    students: students$, admissions: admissions$, attendance: attendance$,
    programs: programs$, certificates: certificates$, batches: batches$, staff: staff$,
    feePlans: feePlans$, invoices: invoices$, payments: payments$,
    ledgerEntries: ledger$, expenses: expenses$, salaries: salaries$,
    documents: documents$, admissionDrafts: drafts$, notifications: notifications$,
    branches: branches$, academicYears: academicYears$, curricula: curricula$,
    curriculumLevels: curriculumLevels$, holidays: holidays$,
    auditLog: audit$, settings: settings$
};

/* ==========================================================================
   EXPORT
   ========================================================================== */

/**
 * Builds a complete backup object.
 *
 * The envelope matters as much as the data. A bare dump of object stores is
 * unreadable in two years' time; this records the app version, the schema
 * version, when it was taken and by whom, so a future restore can tell whether
 * it understands the file before it starts overwriting anything.
 */
export async function buildBackup({ note = null } = {}) {
    // db.exportAll() returns an envelope — { format, schemaVersion, exportedAt,
    // counts, data } — and the store map is the `data` property inside it.
    // Taking the envelope whole put the records one level too deep, so every
    // backup file carried five sections named after envelope fields and no
    // store data that restore could recognise. Restore then filtered all five
    // out, cleared the database and wrote nothing back.
    const exported = await db.exportAll();
    const data = exported.data;

    // Students (Milestone 3), Admissions (Milestone 5), Attendance
    // (Milestone 6), Class Sessions (Milestone 7), Programmes (Milestone 17),
    // Certificates (Milestone 18), Batches (Milestone 19), Staff
    // (Milestone 20), Fee Collection + Finance (Milestone 21),
    // Documents + Admission Drafts + Notifications (Milestone 22),
    // Settings reference data (Milestone 23) and the Audit Log
    // (Milestone 24, the last store off IndexedDB) all moved to Cloud
    // Firestore — db.exportAll() only sees IndexedDB, which no longer
    // holds the real records for any of these. Overwrite those sections
    // with live Firestore data so a backup taken today actually reflects
    // today's records, not a stale or empty local copy.
    data.students = await students$.all({ includeDeleted: true });
    data.admissions = await admissions$.all({ includeDeleted: true });
    data.attendance = await attendance$.all();
    data.classSessions = await classSessions$.all();
    data.programs = await programs$.all({ includeDeleted: true });
    data.certificates = await certificates$.all({ includeDeleted: true });
    data.batches = await batches$.all({ includeDeleted: true });
    data.staff = await staff$.all({ includeDeleted: true });
    data.feePlans = await feePlans$.all({ includeDeleted: true });
    data.invoices = await invoices$.all({ includeDeleted: true });
    data.payments = await payments$.all({ includeDeleted: true });
    data.ledgerEntries = await ledger$.all();
    data.expenses = await expenses$.all({ includeDeleted: true });
    data.salaries = await salaries$.all({ includeDeleted: true });
    data.documents = await documents$.all({ includeDeleted: true });
    data.admissionDrafts = await drafts$.all();
    data.notifications = await notifications$.all();
    data.branches = await branches$.all({ includeDeleted: true });
    data.academicYears = await academicYears$.all({ includeDeleted: true });
    data.curricula = await curricula$.all({ includeDeleted: true });
    data.curriculumLevels = await curriculumLevels$.all({ includeDeleted: true });
    data.holidays = await holidays$.all({ includeDeleted: true });
    data.auditLog = await audit$.all();
    // The last IndexedDB holdout (settings$'s own header comment explains
    // why it matters) — same override pattern as every entity above.
    data.settings = await settings$.all();

    const counts = Object.fromEntries(Object.entries(data).map(([store, rows]) => [store, rows.length]));

    return {
        kind: FILE_KIND,
        app: APP.name,
        appVersion: APP.version,
        schemaVersion: SCHEMA.version,
        takenAt: nowISO(),
        takenBy: session.actorName(),
        note: note?.trim() || null,
        counts,
        totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
        data
    };
}

/** Builds a backup and hands it to the browser as a download. */
export async function downloadBackup({ note = null } = {}) {
    session.require(CAPABILITIES.BACKUP_CREATE, 'take a backup');

    const backup = await buildBackup({ note });
    const filename = `natyam-backup-${localDate()}.json`;

    downloadFile(filename, JSON.stringify(backup, null, 2), 'application/json');
    await settings$.set('lastBackupAt', backup.takenAt);

    return { filename, ...summarise(backup) };
}

/** When the school last took a backup, and whether that is long enough ago to worry. */
export async function backupStatus() {
    const last = await settings$.get('lastBackupAt', null);
    if (!last) {
        return { everBackedUp: false, lastAt: null, ageDays: null, stale: true, message: 'No backup has ever been taken.' };
    }

    const ageDays = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    return {
        everBackedUp: true,
        lastAt: last,
        ageDays,
        stale: ageDays > 7,
        message: ageDays === 0
            ? `Last backup taken today at ${formatDateTime(last).split(', ').pop()}.`
            : `Last backup was ${ageDays} day${ageDays === 1 ? '' : 's'} ago.`
    };
}

/* ==========================================================================
   INSPECTION
   ========================================================================== */

/**
 * Reads and validates a backup file without writing anything.
 *
 * Always called before a restore so the confirmation dialog can say "this file
 * holds 87 students from 3 July" rather than asking the user to accept an
 * irreversible action on faith.
 */
export async function inspectBackup(file) {
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        throw new Error('That file is not readable as a backup. It should be the .json file this app produced.');
    }

    if (parsed.kind !== FILE_KIND) {
        throw new Error('That file was not produced by NATYAM ERP. Restoring it could corrupt the school’s records.');
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
        throw new Error('That backup file is missing its data section and cannot be restored.');
    }

    const unknownStores = Object.keys(parsed.data).filter((store) => !STORE_NAMES.includes(store));
    const newerSchema = (parsed.schemaVersion || 0) > SCHEMA.version;

    return {
        backup: parsed,
        ...summarise(parsed),
        unknownStores,
        newerSchema,
        warnings: [
            newerSchema && 'This backup came from a newer version of the app. Some data may not be understood.',
            unknownStores.length && `${unknownStores.length} unrecognised section${unknownStores.length === 1 ? '' : 's'} will be ignored.`
        ].filter(Boolean)
    };
}

/* ==========================================================================
   RESTORE
   ========================================================================== */

/**
 * Replaces the entire database with the contents of a backup.
 *
 * Destructive and deliberately so — a "merge" restore sounds safer and is not:
 * it silently produces two copies of every student whose id changed, and the
 * school discovers this months later. What actually protects the user is a
 * safety copy of the current state, taken and offered for download before
 * anything is overwritten.
 *
 * @param {object} backup            A backup object from inspectBackup.
 * @param {boolean} [options.safetyCopy=true]  Download current data first.
 */
export async function restore(backup, { safetyCopy = true } = {}) {
    session.require(CAPABILITIES.DATA_RESTORE, 'restore from a backup');

    if (backup.kind !== FILE_KIND) throw new Error('That is not a NATYAM ERP backup file.');

    let safety = null;
    if (safetyCopy) {
        const current = await buildBackup({ note: 'Automatic safety copy taken before a restore' });
        if (current.totalRecords > 0) {
            downloadFile(`natyam-before-restore-${localDate()}.json`, JSON.stringify(current), 'application/json');
            safety = summarise(current);
        }
    }

    const known = Object.fromEntries(
        Object.entries(backup.data).filter(([store]) => STORE_NAMES.includes(store) || FIRESTORE_ONLY_SECTIONS.includes(store))
    );

    // A restore that recognises nothing must not proceed. `importAll` with
    // `clear` would empty every store and write nothing back, which is the
    // worst possible outcome of an operation the user reached for precisely
    // because they wanted their data returned to them.
    if (!Object.keys(known).length) {
        throw new Error(
            'This backup contains no recognisable data, so nothing was changed. '
            + 'The file may be from a different application or an incompatible version.'
        );
    }

    // Students, Admissions, Attendance, Class Sessions, Programmes,
    // Certificates, Batches, Staff, Fee Plans, Invoices, Payments, Ledger
    // Entries, Expenses, Salaries, Documents, Admission Drafts,
    // Notifications, Branches, Academic Years, Curricula, Curriculum
    // Levels, Holidays and the Audit Log moved to Cloud Firestore —
    // restored separately from every other store. Left inside `known`,
    // db.importAll() would either silently write these sections to their
    // now-orphaned local IndexedDB stores, or (for classSessions, which
    // never had one) throw trying to write to a store that doesn't exist.
    const {
        students: studentRows, admissions: admissionRows, attendance: attendanceRows,
        classSessions: classSessionRows, programs: programRows, certificates: certificateRows,
        batches: batchRows, staff: staffRows,
        feePlans: feePlanRows, invoices: invoiceRows, payments: paymentRows,
        ledgerEntries: ledgerRows, expenses: expenseRows, salaries: salaryRows,
        documents: documentRows, admissionDrafts: draftRows, notifications: notificationRows,
        branches: branchRows, academicYears: academicYearRows, curricula: curriculumRows,
        curriculumLevels: curriculumLevelRows, holidays: holidayRows,
        auditLog: auditLogRows, settings: settingsRows,
        ...indexedDbStores
    } = known;

    // A backup made up entirely of already-Firestore-migrated sections (every
    // key above gets destructured out by name) legitimately leaves nothing
    // for IndexedDB to import — importAll() throws on an empty store map,
    // which must not abort the Firestore restores below.
    if (Object.keys(indexedDbStores).length) {
        await db.importAll(indexedDbStores, { mode: 'replace' });
    }
    if (studentRows) await students$.replaceAll(studentRows);
    if (admissionRows) await admissions$.replaceAll(admissionRows);
    if (attendanceRows) await attendance$.replaceAll(attendanceRows);
    if (classSessionRows) await classSessions$.replaceAll(classSessionRows);
    if (programRows) await programs$.replaceAll(programRows);
    if (certificateRows) await certificates$.replaceAll(certificateRows);
    if (batchRows) await batches$.replaceAll(batchRows);
    if (staffRows) await staff$.replaceAll(staffRows);
    if (feePlanRows) await feePlans$.replaceAll(feePlanRows);
    if (invoiceRows) await invoices$.replaceAll(invoiceRows);
    if (paymentRows) await payments$.replaceAll(paymentRows);
    if (ledgerRows) await ledger$.replaceAll(ledgerRows);
    if (expenseRows) await expenses$.replaceAll(expenseRows);
    if (salaryRows) await salaries$.replaceAll(salaryRows);
    if (documentRows) await documents$.replaceAll(documentRows);
    if (draftRows) await drafts$.replaceAll(draftRows);
    if (notificationRows) await notifications$.replaceAll(notificationRows);
    if (branchRows) await branches$.replaceAll(branchRows);
    if (academicYearRows) await academicYears$.replaceAll(academicYearRows);
    if (curriculumRows) await curricula$.replaceAll(curriculumRows);
    if (curriculumLevelRows) await curriculumLevels$.replaceAll(curriculumLevelRows);
    if (holidayRows) await holidays$.replaceAll(holidayRows);
    if (auditLogRows) await audit$.replaceAll(auditLogRows);
    // Settings last of the replaceAll calls, so the lastRestoreAt stamp
    // written immediately below survives — replacing settings *after*
    // stamping it would silently discard the stamp.
    if (settingsRows) await settings$.replaceAll(settingsRows);

    await settings$.set('lastRestoreAt', nowISO());

    // A restore can bring in a different set of branches. The previously
    // selected branch id is meaningless if it no longer exists in the
    // restored data — left in storage, the next hydrate() would silently
    // land on an unrelated branch rather than "All branches". A selection
    // that is still valid after the restore is left untouched. Branches
    // moved to Firestore (Milestone 23) and are destructured out of
    // `known` above as `branchRows`, not left inside it — read from there.
    try {
        const restoredBranchIds = new Set((branchRows || []).map((b) => b.id));
        const stored = JSON.parse(localStorage.getItem('natyam.session') || '{}');
        if (stored.activeBranchId && !restoredBranchIds.has(stored.activeBranchId)) {
            delete stored.activeBranchId;
            localStorage.setItem('natyam.session', JSON.stringify(stored));
        }
    } catch { /* private mode or storage disabled — nothing to clear */ }

    const result = { ...summarise(backup), safety };
    bus.emit(EVENTS.BACKUP_RESTORED, result);
    bus.emit(EVENTS.DATA_IMPORTED, result);

    return result;
}

/* ==========================================================================
   PARTIAL EXPORT
   ========================================================================== */

/**
 * Exports one store as JSON — the answer to "send me the student list" that
 * does not involve handing over the whole ledger. Not a backup, and labelled
 * so nobody mistakes it for one.
 */
export async function exportStore(storeName, { pretty = true } = {}) {
    session.require(CAPABILITIES.DATA_EXPORT, 'export data');

    if (!STORE_NAMES.includes(storeName)) throw new Error(`There is no "${storeName}" data to export.`);

    const repo = FIRESTORE_STORE_REPOS[storeName];
    const rows = repo ? await repo.all({ includeDeleted: true }) : await db.all(storeName);
    const payload = {
        kind: 'natyam-erp-extract',
        store: storeName,
        app: APP.name,
        takenAt: nowISO(),
        count: rows.length,
        rows
    };

    downloadFile(`natyam-${storeName}-${localDate()}.json`, JSON.stringify(payload, null, pretty ? 2 : 0), 'application/json');
    return { store: storeName, count: rows.length };
}

/**
 * Wipes everything and leaves a genuinely empty installation.
 *
 * The previous behaviour cleared every store and then, on the next boot,
 * `seedIfEmpty` saw an empty database and rebuilt the entire demonstration
 * dataset — so an erase appeared to succeed and the sample students, staff and
 * batches were back a second later. The clear now records that the database
 * was emptied deliberately, and the seeder honours that mark. Browser storage
 * is cleared too, or the previously selected branch and preferences would
 * outlive the data they refer to.
 */
export async function resetEverything({ safetyCopy = true, keepInstitute = true } = {}) {
    session.require(CAPABILITIES.DATA_RESTORE, 'erase all data');

    if (safetyCopy) {
        const current = await buildBackup({ note: 'Automatic safety copy taken before a full reset' });
        if (current.totalRecords > 0) {
            downloadFile(`natyam-before-reset-${localDate()}.json`, JSON.stringify(current), 'application/json');
        }
    }

    // Keep the school's own identity if asked — it is configuration, not data.
    const institute = keepInstitute ? await settings$.get('institute', null) : null;

    for (const store of STORE_NAMES) {
        await db.clear(store);
    }

    // Settings live in Firestore now, so the loop above (IndexedDB only)
    // does not touch them — clear them explicitly, or every sequence
    // counter and the school's own details would outlive the erase.
    await settings$.replaceAll([]);

    // Written after the clear so it survives it. `seedIfEmpty` checks this
    // before deciding whether an empty database is a fresh install or a
    // deliberate erase — and it reads IndexedDB directly (seed.js), so this
    // marker deliberately stays local: it is a fact about *this browser's*
    // local database, not about the school's shared records.
    await db.put('settings', {
        key: 'installation',
        value: { erasedAt: nowISO(), demoData: false }
    });
    // Sequences, by contrast, must go through settings$ — they are read
    // from Firestore by nextSequence(), so writing them to IndexedDB here
    // would leave every counter running on from its pre-erase value.
    await settings$.set('sequences', { admission: 0, application: 0, invoice: 0, receipt: 0, certificate: 0 });
    if (institute) await settings$.set('institute', institute);

    try {
        localStorage.removeItem('natyam.session');
    } catch { /* private mode or storage disabled — nothing to clear */ }

    bus.emit(EVENTS.DATA_IMPORTED, { reset: true });
    return true;
}

/* ------------------------------------------------------------------ HELPERS */

/** The human summary of a backup: what a person needs to decide about it. */
function summarise(backup) {
    const counts = backup.counts || Object.fromEntries(
        Object.entries(backup.data || {}).map(([store, rows]) => [store, rows.length])
    );

    return {
        takenAt: backup.takenAt,
        takenBy: backup.takenBy,
        note: backup.note,
        appVersion: backup.appVersion,
        schemaVersion: backup.schemaVersion,
        totalRecords: backup.totalRecords ?? Object.values(counts).reduce((a, b) => a + b, 0),
        highlights: [
            { label: 'Students', count: counts.students || 0 },
            { label: 'Attendance records', count: counts.attendance || 0 },
            { label: 'Invoices', count: counts.invoices || 0 },
            { label: 'Payments', count: counts.payments || 0 },
            { label: 'Ledger entries', count: counts.ledgerEntries || 0 },
            { label: 'Certificates', count: counts.certificates || 0 }
        ],
        counts
    };
}
