/**
 * Shared attendance overlay widgets.
 *
 * Three views — a student's month, a batch's class calendar, and a batch's
 * month grid — are each opened from more than one screen (Batches, Students,
 * Timetable's register). They used to be defined once per caller, and the
 * Previous/Next Month control on two of them closed the whole drawer and
 * opened a fresh one to page between months, which reads as the screen
 * reloading. Consolidated here so every caller shares one implementation and
 * one fix: paging a month repaints the open drawer in place and never closes
 * it.
 */

import { html, render, raw, on } from '../utils/dom.js';
import { icon } from './icons.js';
import { drawer } from './overlay.js';
import { toast } from './toast.js';
import { session } from '../core/session.js';
import { formatNumber } from '../utils/money.js';
import { formatMonth, formatDate, monthKey } from '../utils/date.js';
import { ATTENDANCE_STATUS } from '../config/app.config.js';
import { studentMonth, batchCalendar, monthlyGrid } from '../services/attendance.service.js';
import { listBatches } from '../services/batches.service.js';

export const MARKS = [
    { value: ATTENDANCE_STATUS.PRESENT, label: 'Present', short: 'P', tone: 'positive' },
    { value: ATTENDANCE_STATUS.ABSENT, label: 'Absent', short: 'A', tone: 'negative' }
];

/** Wraps repainted content so a fresh month plays a short slide instead of just popping in. */
function slideWrap(dir, content) {
    const dirAttr = dir > 0 ? 'next' : dir < 0 ? 'prev' : '';
    return html`<div class="month-nav-slide" data-dir="${dirAttr}">${content}</div>`;
}

function setDescription(body, text) {
    const node = body.closest('.drawer, .modal')?.querySelector('.modal-description');
    if (node) node.textContent = text;
}

/* ==========================================================================
   ONE STUDENT'S MONTH
   ========================================================================== */

export function dayMark(day) {
    if (day.status === 'cancelled') return html`<span class="type-caption type-muted">Cancelled</span>`;
    if (day.status === 'postponed') return html`<span class="type-caption type-muted">Postponed</span>`;
    if (day.mark === ATTENDANCE_STATUS.PRESENT) return html`<span class="badge badge-success">Present</span>`;
    if (day.mark === ATTENDANCE_STATUS.ABSENT) return html`<span class="badge badge-danger">Absent</span>`;
    return html`<span class="type-caption type-muted">Not marked</span>`;
}

/**
 * @param {object} report  Result of studentMonth().
 * @param {object} [opts]
 * @param {boolean} [opts.scrollableList=false]  When embedded inline (not in
 *   its own scrolling drawer), only the day-by-day list should scroll, not
 *   the whole panel it sits in.
 */
export function studentMonthReport(report, { scrollableList = false } = {}) {
    const thisMonth = monthKey();
    const marks = report.days.filter((d) => d.mark);

    return html`
        <div class="spread mb-4">
            <button class="btn btn-sm btn-secondary btn-icon" data-month-shift="-1" aria-label="Previous month">
                ${raw(icon('chevron-left', { size: 15 }))}
            </button>
            <span class="type-strong">${formatMonth(report.month)}</span>
            <button class="btn btn-sm btn-secondary btn-icon" data-month-shift="1"
                    aria-label="Next month" ${report.month >= thisMonth ? 'disabled' : ''}>
                ${raw(icon('chevron-right', { size: 15 }))}
            </button>
        </div>

        <div class="card"><div class="card-body">
            <div class="stat-row">
                <div class="stat">
                    <span class="stat-value">${report.rate === null ? '—' : `${report.rate}%`}</span>
                    <span class="stat-label">Attendance</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${formatNumber(report.present)}</span>
                    <span class="stat-label">Present</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${formatNumber(report.absent)}</span>
                    <span class="stat-label">Absent</span>
                </div>
            </div>
            <p class="type-caption type-muted text-center">
                ${marks.length
                    ? `${marks.length} class${marks.length === 1 ? '' : 'es'} recorded this month`
                    : 'Nothing recorded this month'}
            </p>
        </div></div>

        ${report.unmarked ? html`
            <div class="alert alert-warning">
                <p class="alert-body">
                    ${formatNumber(report.unmarked)} class${report.unmarked === 1 ? '' : 'es'} this month
                    ${report.unmarked === 1 ? 'has' : 'have'} no register yet, so ${report.unmarked === 1 ? 'it is' : 'they are'}
                    not counted above.
                </p>
            </div>
        ` : ''}

        <div class="card">
            <div class="card-header"><h3 class="card-title">Day by day</h3></div>
            <div class="card-body card-body-tight ${scrollableList ? 'attendance-day-list-scroll' : ''}">
                ${report.days.length ? html`
                    <ul class="stack stack-sm">
                        ${report.days.map((day) => html`
                            <li class="spread">
                                <div>
                                    <span class="type-strong">${formatDate(day.date, { withYear: false })}</span>
                                    ${day.isReplacement ? html`
                                        <span class="badge badge-warning badge-sm">Rescheduled</span>
                                    ` : ''}
                                </div>
                                ${dayMark(day)}
                            </li>
                        `)}
                    </ul>
                ` : html`
                    <div class="empty empty-compact">
                        <p class="empty-text">
                            ${report.batch
                                ? 'This batch held no classes this month.'
                                : 'This student is not in a batch, so there is no schedule to report against.'}
                        </p>
                    </div>
                `}
            </div>
        </div>
    `;
}

/**
 * Mounts a self-paging student month report into `container`, which is never
 * removed or replaced wholesale — Previous/Next Month repaints its contents
 * in place. Works equally inside a drawer body or a plain inline panel.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {string} opts.studentId
 * @param {string} [opts.month]
 * @param {boolean} [opts.scrollableList]
 * @param {object} [opts.initialReport]  Already-fetched report for `month`,
 *   to skip a duplicate read (the caller typically fetched one already to
 *   know the student's name for a drawer title).
 * @param {(report: object) => void} [opts.onReport]  Called with each report
 *   as it loads, so the caller can keep a title/description in sync.
 */
export async function mountStudentMonthReport(container, {
    studentId, month = monthKey(), scrollableList = false, initialReport = null, onReport = null
} = {}) {
    let current = month;

    const paint = (report, dir = 0) => {
        current = report.month;
        render(container, slideWrap(dir, studentMonthReport(report, { scrollableList })));
        onReport?.(report);
    };

    const load = async (target, dir = 0) => {
        let report;
        try {
            report = await studentMonth({ studentId, month: target });
        } catch (err) {
            render(container, html`<div class="alert alert-danger"><p class="alert-body">${err.message}</p></div>`);
            return;
        }
        paint(report, dir);
    };

    on(container, 'click', '[data-month-shift]', (_e, target) => {
        const [y, m] = current.split('-').map(Number);
        const shift = Number(target.dataset.monthShift);
        load(monthKey(new Date(y, m - 1 + shift, 1)), shift);
    });

    if (initialReport) paint(initialReport);
    else await load(current);
}

/* ==========================================================================
   CLASS CALENDAR (formerly "Class dates")
   ========================================================================== */

export function classCalendarView(calendar, { readOnly = false } = {}) {
    // Monday-first, matching the timetable and the Indian school week.
    const lead = (calendar.days[0].weekday + 6) % 7;

    return html`
        <div class="spread mb-4">
            <button class="btn btn-sm btn-secondary btn-icon" data-month-shift="-1" aria-label="Previous month">
                ${raw(icon('chevron-left', { size: 15 }))}
            </button>
            <span class="type-strong">${formatMonth(calendar.month)}</span>
            <button class="btn btn-sm btn-secondary btn-icon" data-month-shift="1" aria-label="Next month">
                ${raw(icon('chevron-right', { size: 15 }))}
            </button>
        </div>

        <div class="calendar-grid">
            ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`
                <span class="calendar-heading">${d}</span>
            `)}
            ${Array.from({ length: lead }, () => html`<span></span>`)}
            ${calendar.days.map((day) => {
                if (!day.hasClass) {
                    return html`<span class="calendar-day" data-state="none">${day.dayOfMonth}</span>`;
                }
                const state = day.status === 'cancelled' ? 'cancelled'
                    : day.status === 'postponed' ? 'postponed'
                    : day.marked ? 'marked'
                    : day.markable ? 'pending' : 'locked';
                const title = `${formatDate(day.date)} — ${
                    state === 'cancelled' ? 'cancelled'
                    : state === 'postponed' ? 'postponed to another date'
                    : state === 'marked' ? 'register marked'
                    : state === 'pending' ? 'not marked yet'
                    : 'outside the correction window'}`;

                return readOnly
                    ? html`<span class="calendar-day" data-state="${state}" title="${title}" aria-label="${title}">
                            ${day.dayOfMonth}${day.isReplacement ? html`<span class="calendar-dot"></span>` : ''}
                        </span>`
                    : html`<button class="calendar-day" data-state="${state}" data-pick-date="${day.date}"
                                title="${title}" aria-label="${title}">
                            ${day.dayOfMonth}${day.isReplacement ? html`<span class="calendar-dot"></span>` : ''}
                        </button>`;
            })}
        </div>

        <ul class="stack stack-xs mt-4 type-caption type-muted">
            <li><span class="calendar-key" data-state="marked"></span> Register marked</li>
            <li><span class="calendar-key" data-state="pending"></span> Class held, not yet marked</li>
            <li><span class="calendar-key" data-state="cancelled"></span> Cancelled</li>
            <li><span class="calendar-key" data-state="postponed"></span> Postponed — mark its replacement</li>
            <li><span class="calendar-key" data-state="none"></span> No class</li>
        </ul>
    `;
}

/**
 * Opens the Class Calendar drawer for a batch. Stays open across Previous/
 * Next Month — only the calendar grid inside is repainted.
 *
 * @param {object} opts
 * @param {string} opts.batchId
 * @param {string} [opts.month]
 * @param {boolean} [opts.readOnly]  True from the Batch page's own "Class
 *   Calendar" button (Obs 4B): a view, not a way to jump into marking.
 * @param {(date: string) => void} [opts.onPickDate]  Ignored when readOnly.
 */
export async function openClassCalendar({ batchId, month = monthKey(), readOnly = false, onPickDate = null } = {}) {
    let calendar;
    try {
        calendar = await batchCalendar({ batchId, month });
    } catch (err) {
        toast.error(err.message);
        return;
    }

    const describe = (cal) => `${cal.batch.name} — days this batch met.${readOnly ? '' : ' Pick one to open its register.'}`;

    await drawer({
        title: 'Class Calendar',
        description: describe(calendar),
        size: 'sm',
        content: classCalendarView(calendar, { readOnly }),
        actions: [{ label: 'Close', variant: 'secondary', value: null }],
        onMount: (body, api) => {
            let current = calendar;

            on(body, 'click', '[data-month-shift]', async (_e, target) => {
                const shift = Number(target.dataset.monthShift);
                const [y, m] = current.month.split('-').map(Number);
                const nextMonth = monthKey(new Date(y, m - 1 + shift, 1));

                let next;
                try {
                    next = await batchCalendar({ batchId, month: nextMonth });
                } catch (err) {
                    toast.error(err.message);
                    return;
                }
                current = next;
                render(body, slideWrap(shift, classCalendarView(current, { readOnly })));
                setDescription(body, describe(current));
            });

            if (!readOnly) {
                on(body, 'click', '[data-pick-date]', (_e, target) => {
                    api.close(null);
                    onPickDate?.(target.dataset.pickDate);
                });
            }
        }
    });
}

/* ==========================================================================
   ATTENDANCE - MONTH (formerly "Month view")
   ========================================================================== */

export function gridView(grid) {
    if (!grid.days.length) {
        return html`<div class="empty empty-compact">
            <p class="empty-text">${grid.batch.name} has no meeting days yet in ${formatMonth(grid.month)}.</p>
        </div>`;
    }

    return html`
        <div class="table-wrap">
            <table class="table table-pin-first table-compact">
                <caption class="sr-only">
                    Attendance for ${grid.batch.name}, ${formatMonth(grid.month)}
                </caption>
                <thead>
                    <tr>
                        <th scope="col">Student</th>
                        ${grid.days.map((day) => html`
                            <th scope="col" class="text-center" title="${formatDate(day.date)}">${day.day}</th>
                        `)}
                        <th scope="col" class="text-right">Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${grid.rows.map((row) => html`
                        <tr>
                            <th scope="row">${row.student.name}</th>
                            ${row.cells.map((cell) => {
                                const meta = MARKS.find((m) => m.value === cell);
                                return html`<td class="text-center">
                                    ${meta
                                        ? html`<span class="mark-dot" data-tone="${meta.tone}"
                                                     title="${meta.label}">${meta.short}</span>`
                                        : html`<span class="type-muted" aria-label="not marked">·</span>`}
                                </td>`;
                            })}
                            <td class="text-right">
                                ${row.rate === null
                                    ? html`<span class="type-muted">—</span>`
                                    : html`<span class="badge ${row.rate >= 80 ? 'badge-success'
                                        : row.rate >= 65 ? 'badge-warning' : 'badge-danger'}">${row.rate}%</span>`}
                            </td>
                        </tr>
                    `)}
                </tbody>
            </table>
        </div>
        <p class="type-caption type-muted mt-2">
            Only days this batch meets appear as columns.
        </p>
    `;
}

/**
 * Opens the "Attendance - Month" drawer: every meeting day in a month, per
 * student. Already repaints in place (no drawer close/reopen) since the
 * batch and month controls only ever update a closured value and repaint
 * the grid slot — nothing here routes through overlay's close().
 *
 * @param {object} opts
 * @param {string} [opts.batchId]  Preselected batch. Required when
 *   showBatchPicker is false.
 * @param {string} [opts.month]
 * @param {boolean} [opts.showBatchPicker=true]  False from the Batch page's
 *   own "Attendance - Month" button (Obs 4B): the batch is already known, so
 *   only the month control is shown.
 */
export async function openAttendanceMonth({ batchId = null, month = monthKey(), showBatchPicker = true } = {}) {
    let batches = null;
    let currentBatchId = batchId;

    if (showBatchPicker) {
        batches = await listBatches(session.branch());
        if (!batches.length) {
            toast.info('There are no batches to show.');
            return;
        }
        currentBatchId = currentBatchId || batches[0].id;
    }

    let currentMonth = month;

    await drawer({
        title: 'Attendance - Month',
        description: 'Every meeting day in the month, per student.',
        size: 'wide',
        content: html`
            <div class="filter-bar">
                <div class="row row-wrap">
                    ${showBatchPicker ? html`
                        <label class="filter-control">
                            <span class="sr-only">Batch</span>
                            <select class="select select-sm" data-role="batch">
                                ${batches.map((batch) => html`
                                    <option value="${batch.id}" ${batch.id === currentBatchId ? 'selected' : ''}>
                                        ${batch.name}
                                    </option>
                                `)}
                            </select>
                        </label>
                    ` : ''}
                    <label class="filter-control">
                        <span class="sr-only">Month</span>
                        <input class="input input-sm" type="month" value="${currentMonth}" data-role="month">
                    </label>
                </div>
            </div>
            <div data-role="grid"><p class="type-muted">Loading…</p></div>
        `,
        actions: [{ label: 'Close', variant: 'secondary', value: null }],
        onMount: (body) => {
            const paint = async () => {
                const slot = body.querySelector('[data-role="grid"]');
                render(slot, html`<div class="skeleton skeleton-row"></div>`);
                try {
                    const grid = await monthlyGrid({ batchId: currentBatchId, month: currentMonth });
                    render(slot, gridView(grid));
                } catch (err) {
                    render(slot, html`<div class="alert alert-danger"><p class="alert-body">${err.message}</p></div>`);
                }
            };

            if (showBatchPicker) {
                on(body, 'change', '[data-role="batch"]', (_e, target) => { currentBatchId = target.value; paint(); });
            }
            on(body, 'change', '[data-role="month"]', (_e, target) => { currentMonth = target.value; paint(); });
            paint();
        }
    });
}
