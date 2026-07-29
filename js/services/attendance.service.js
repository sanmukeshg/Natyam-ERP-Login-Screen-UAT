/**
 * NATYAM ERP 2.0 — Attendance service
 *
 * Roll call is the operation this product performs most often. Two faults
 * from 1.0 are fixed here:
 *
 *  1. Saving the same roll call twice created a second set of rows. The
 *     Firestore repository's postMany() queries the existing rows for a
 *     batch+date once and updates them, so a re-save is an update by
 *     construction rather than by remembering to check.
 *  2. Rows were written one at a time in a loop of separate writes. A
 *     failure halfway left a class half-marked. The whole roll call is one
 *     atomic Firestore batch write (see attendance.repository.firestore.js).
 *
 * Milestone 6: NATYAM has no Leave concept, Attendance supports only
 * Present/Absent, and Holiday handling is out of this module's scope
 * (moved to Dashboard, which reads the Holidays calendar directly for its
 * own informational display — see dashboard.service.js's today()).
 *
 * Milestone 7: Attendance now belongs to a Timetable Session rather than a
 * raw batchId+date pair. Attendance does not own Sessions — it never reads
 * or writes the `classSessions` collection itself, only calling into
 * session.service.js (which does) exactly the way the Milestone 6 seam
 * (`isScheduledClassDay`, now living there) was always meant to be
 * upgraded: without restructuring anything in this file.
 */

import { bus, EVENTS } from '../core/bus.js';
import { session } from '../core/session.js';
import { localDate, nowISO, addDays, daysBetween, monthKey, dayName, startOfMonth, endOfMonth, lastMonths } from '../utils/date.js';
import { ATTENDANCE_STATUS } from '../config/app.config.js';
import { attendance$, students$, batches$, staff$, AttendanceMath } from '../data/repositories.js';
import { isScheduledClassDay, resolveSession, completeSession, sessionStatusOf } from './session.service.js';

/* ==========================================================================
   PREPARING A REGISTER
   ========================================================================== */

/**
 * Builds the register a teacher sees: the roster and whatever was marked
 * before. Returns rather than throws when the batch does not meet on the
 * given date — teachers do reach the wrong day, and a thrown error would
 * put an exception screen where a sentence is wanted.
 */
export async function openRegister(batchId, date = localDate()) {
    const batch = await batches$.findOrFail(batchId);

    const [roster, existing, sessionStatus] = await Promise.all([
        students$.byBatch(batchId),
        attendance$.forBatchOn(batchId, date),
        sessionStatusOf(batchId, date)
    ]);

    const marked = new Map(existing.map((row) => [row.studentId, row]));

    const entries = roster.map((student) => {
        const prior = marked.get(student.id);
        return {
            studentId: student.id,
            name: student.name,
            admissionNo: student.admissionNo,
            photo: student.photo || null,
            medicalNotes: student.medicalNotes || null,
            status: prior?.status || ATTENDANCE_STATUS.PRESENT,
            previouslyMarked: Boolean(prior)
        };
    });

    return {
        batch,
        date,
        dayName: dayName(date),
        scheduled: isScheduledClassDay(batch, date),
        sessionStatus,
        alreadyMarked: existing.length > 0,
        markedAt: existing[0]?.updatedAt || null,
        entries,
        empty: roster.length === 0
    };
}

/** Every batch meeting on a date, with whether its register is done. Used by this page and by the Dashboard's own panels. */
export async function dayBoard(date = localDate(), branchId = null) {
    const [meeting, marked, teachers] = await Promise.all([
        batches$.meetingOn(date, branchId),
        attendance$.onDate(date, branchId),
        staff$.teachers()
    ]);

    const byBatch = new Map();
    for (const row of marked) {
        if (!byBatch.has(row.batchId)) byBatch.set(row.batchId, []);
        byBatch.get(row.batchId).push(row);
    }

    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
    const rosterCounts = await Promise.all(meeting.map((b) => students$.byBatch(b.id)));

    return {
        date,
        batches: meeting.map((batch, index) => {
            const rows = byBatch.get(batch.id) || [];
            return {
                ...batch,
                teacherName: teacherName.get(batch.teacherId) || 'Unassigned',
                expected: rosterCounts[index].length,
                marked: rows.length,
                done: rows.length > 0,
                rate: AttendanceMath.rateOf(rows),
                breakdown: AttendanceMath.breakdownOf(rows)
            };
        })
    };
}

/* ==========================================================================
   POSTING
   ========================================================================== */

/**
 * Writes a roll call. One atomic write, and a read-before-write so that
 * re-marking preserves the original `createdAt` — the difference between
 * "marked at 6:35 this morning" and "corrected at 4pm" is the sort of thing
 * a parent dispute turns on.
 *
 * @param {object} params
 * @param {string} params.batchId
 * @param {string} params.date
 * @param {Array<{studentId: string, status: string, note?: string}>} params.entries
 */
export async function postRegister({ batchId, date, entries }) {
    session.require('attendance.mark', 'mark attendance');

    const batch = await batches$.findOrFail(batchId);
    if (!date) throw new Error('Choose the date being marked.');
    if (date > localDate()) throw new Error('Attendance cannot be marked for a future date.');
    if (!Array.isArray(entries) || !entries.length) throw new Error('There is nobody in this batch to mark.');

    // Attendance belongs to a Timetable Session, not a raw date (Milestone
    // 7) — Attendance never resolves or creates one itself beyond calling
    // out to session.service.js, which owns that collection entirely.
    // resolveSession() lazily schedules one if this date is one of the
    // batch's recurring days and nothing has been recorded here yet; a
    // null result means genuinely nothing is scheduled here at all.
    const classSession = await resolveSession(batchId, date);
    if (!classSession) {
        throw new Error(`${batch.name} has no scheduled class on ${date}.`);
    }
    if (classSession.status === 'postponed') {
        throw new Error('This class was postponed. Mark attendance against its replacement session instead.');
    }
    if (classSession.status === 'cancelled') {
        throw new Error('This class was cancelled. Attendance cannot be recorded for it.');
    }

    const valid = new Set(Object.values(ATTENDANCE_STATUS));
    for (const entry of entries) {
        if (!entry.studentId) throw new Error('An attendance row is missing its student.');
        if (!valid.has(entry.status)) throw new Error(`"${entry.status}" is not a valid attendance status.`);
    }

    // Backdating beyond a fortnight is almost always a mistyped date rather
    // than a genuine correction, so it is refused rather than absorbed.
    const age = daysBetween(date, localDate());
    if (age > 30) {
        throw new Error(`That date is ${age} days ago. Attendance can only be marked or corrected within 30 days.`);
    }

    // Milestone P2 (Parent/Student Portal): a guardian reads attendance by
    // querying guardianPhone/guardianEmail directly on the attendance
    // document itself (no per-document lookup back to `students` — see
    // firestore.rules' own history of why that breaks). One roster read
    // (already made by openRegister() for the same reason) gives every
    // entry's guardian contact at no extra cost per row.
    const roster = await students$.byBatch(batchId);
    const guardianByStudent = new Map(roster.map((s) => [s.id, { guardianPhone: s.guardianPhone || null, guardianEmail: s.guardianEmail || null }]));

    const { records, corrections, wasUpdate } = await attendance$.postMany(batchId, date, batch.branchId, entries, classSession.id, guardianByStudent);

    // A Scheduled session becomes Completed the moment its register is
    // actually posted — a no-op if it's already Completed (a correction),
    // and never reached at all for Postponed/Cancelled, which were already
    // rejected above.
    if (classSession.status === 'scheduled') await completeSession(classSession.id);

    const summary = {
        batchId, date,
        sessionId: classSession.id,
        total: records.length,
        breakdown: AttendanceMath.breakdownOf(records),
        rate: AttendanceMath.rateOf(records),
        corrected: corrections,
        wasUpdate
    };

    bus.emit(EVENTS.ATTENDANCE_SAVED, summary);
    return summary;
}

/* ==========================================================================
   MONTH GRID
   ========================================================================== */

/** Attendance for one month, shaped as a calendar grid — unchanged from before this migration. */
export async function monthlyGrid({ batchId, month = monthKey() }) {
    const [year, mon] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = endOfMonth(new Date(year, mon - 1, 1));

    const [roster, rows, batch] = await Promise.all([
        students$.byBatch(batchId),
        attendance$.between(from, to),
        batches$.findOrFail(batchId)
    ]);

    const mine = rows.filter((r) => r.batchId === batchId);
    const byKey = new Map(mine.map((r) => [`${r.studentId}|${r.date}`, r]));

    // Only days the batch actually meets become columns. Showing all 31 days
    // makes a grid that is 80% empty and unreadable on a laptop.
    const days = [];
    for (let d = new Date(year, mon - 1, 1); d.getMonth() === mon - 1; d.setDate(d.getDate() + 1)) {
        const date = localDate(d);
        if (date > localDate()) break;
        if (!isScheduledClassDay(batch, date)) continue;
        days.push({ date, day: d.getDate() });
    }

    return {
        batch,
        month,
        days,
        rows: roster.map((student) => {
            const cells = days.map((d) => byKey.get(`${student.id}|${d.date}`)?.status || null);
            const present = cells.filter((c) => c === ATTENDANCE_STATUS.PRESENT).length;
            const counted = cells.filter((c) => c !== null).length;
            return {
                student,
                cells,
                present,
                counted,
                rate: counted ? Math.round((present / counted) * 100) : null
            };
        })
    };
}

/* ==========================================================================
   ANALYTICS
   ========================================================================== */

/** Headline attendance figures for a range — used by dashboard and reports. */
export async function summary({ from, to, branchId = null, batchId = null }) {
    let rows = await attendance$.between(from, to, branchId);
    if (batchId) rows = rows.filter((r) => r.batchId === batchId);

    const breakdown = AttendanceMath.breakdownOf(rows);
    const sessions = new Set(rows.map((r) => `${r.batchId}|${r.date}`)).size;

    return {
        from, to,
        marks: rows.length,
        sessions,
        rate: AttendanceMath.rateOf(rows),
        breakdown,
        byDate: groupRate(rows, (r) => r.date),
        byBatch: groupRate(rows, (r) => r.batchId)
    };
}

/** Monthly attendance rate over the last n months, for the trend chart. */
export async function trend(months = 6, branchId = null) {
    const keys = lastMonths(months);
    const from = `${keys[0]}-01`;
    const rows = await attendance$.between(from, localDate(), branchId);

    return keys.map((key) => {
        const slice = rows.filter((r) => r.date.startsWith(key));
        return { period: key, rate: AttendanceMath.rateOf(slice), marks: slice.length };
    });
}

/** Per-teacher marking discipline — how many of their registers are done. */
export async function teacherCompliance({ from, to, branchId = null }) {
    const [teachers, batches, rows] = await Promise.all([
        staff$.teachers(branchId),
        batches$.active(branchId),
        attendance$.between(from, to, branchId)
    ]);

    const done = new Set(rows.map((r) => `${r.batchId}|${r.date}`));

    return teachers.map((teacher) => {
        const own = batches.filter((b) => b.teacherId === teacher.id);
        let expected = 0;
        let marked = 0;

        for (const batch of own) {
            for (let d = new Date(`${from}T00:00:00`); localDate(d) <= to; d.setDate(d.getDate() + 1)) {
                const date = localDate(d);
                if (!isScheduledClassDay(batch, date)) continue;
                expected += 1;
                if (done.has(`${batch.id}|${date}`)) marked += 1;
            }
        }

        return {
            teacher,
            batches: own.length,
            expected,
            marked,
            compliance: expected ? Math.round((marked / expected) * 100) : null
        };
    }).sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101));
}

/**
 * batchId|date keys that already have a register on file in [from, to] — the
 * one completion check every screen that asks "is this session done" shares
 * (the Pending list here, and the Timetable's green status), so that answer
 * can't drift between them.
 */
export async function markedSessions(from, to, branchId = null) {
    const rows = await attendance$.between(from, to, branchId);
    return new Set(rows.map((r) => `${r.batchId}|${r.date}`));
}

/** Registers that were never filled in — the follow-up list. */
export async function missingRegisters({ days = 14, branchId = null } = {}) {
    const from = addDays(localDate(), -days);
    const [batches, done] = await Promise.all([
        batches$.active(branchId),
        markedSessions(from, localDate(), branchId)
    ]);

    const missing = [];

    for (const batch of batches) {
        for (let d = new Date(`${from}T00:00:00`); localDate(d) <= localDate(); d.setDate(d.getDate() + 1)) {
            const date = localDate(d);
            if (!isScheduledClassDay(batch, date)) continue;
            if (done.has(`${batch.id}|${date}`)) continue;
            missing.push({ batch, date, age: daysBetween(date, localDate()) });
        }
    }

    return missing.sort((a, b) => b.age - a.age);
}

/* ------------------------------------------------------------------ HELPERS */

function groupRate(rows, keyOf) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyOf(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()]
        .map(([key, group]) => ({ key, rate: AttendanceMath.rateOf(group), marks: group.length }))
        .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

export { startOfMonth, endOfMonth };
