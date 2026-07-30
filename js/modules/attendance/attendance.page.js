/**
 * NATYAM ERP 2.0 — Attendance
 *
 * Milestone B2: restored to its pre-grid design (see git history —
 * `js/modules/attendance/attendance.page.js` as of commit c0c94d3, before a
 * Week/Month/Custom-Range grid replaced it) at the user's direct request.
 * No longer in the sidebar (app.config.js's NAVIGATION marks this route
 * `hidden: true`) — reached only via Timetable's "Take register" button
 * (which already passes `?batch=&date=`) and the handful of other existing
 * shortcuts (Dashboard, Batches' detail drawer, command search).
 *
 * Two screens in one route: the day board (which registers are done, which
 * are not) and the register itself.
 *
 * The register is the most-used screen in the whole ERP — a teacher opens it
 * on a phone, at the edge of a hall, with thirty children waiting. So it is
 * built for one-handed speed: everybody starts present, marking is one tap
 * per exception, and the save is a single atomic post rather than a write
 * per child. Nothing here decides what a valid mark is; postRegister does,
 * and it refuses backdating beyond thirty days, and refuses marking a
 * postponed or cancelled session, whatever this page sends it — surfaced
 * here as a plain error toast on Save, not pre-empted with its own banner.
 *
 * Holiday-checking is deliberately not part of attendance.service.js (see
 * its own header comment) — this page calls `holidays$.on()` directly,
 * mirroring dashboard.service.js's own `today()`. There is no "Declare
 * holiday" action here any more: holidays are read-only, populated only by
 * a historical migration (no live write path exists anywhere in the app).
 * Likewise no Leave workflow — NATYAM has no Leave concept (Milestone 6).
 */

import { Page, router } from '../../core/router.js';
import { previousPath } from '../../core/navHistory.js';
import { html, render, raw, on } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { drawer } from '../../ui/overlay.js';
import { formOverlay } from '../../ui/form.js';
import { session } from '../../core/session.js';
import { EVENTS } from '../../core/bus.js';
import { formatNumber } from '../../utils/money.js';
import { formatDate, formatDateLong, localDate, addDays, monthKey, formatMonth, parseDate } from '../../utils/date.js';
import { ATTENDANCE_STATUS } from '../../config/app.config.js';
import { holidays$ } from '../../data/repositories.js';

import {
    openRegister, dayBoard, postRegister, monthlyGrid, missingRegisters,
    batchCalendar, MARKING_WINDOW_DAYS, markingWindow
} from '../../services/attendance.service.js';
import { listBatches } from '../../services/batches.service.js';
import { postponeSession, cancelSession } from '../../services/session.service.js';

const MARKS = [
    { value: ATTENDANCE_STATUS.PRESENT, label: 'Present', short: 'P', tone: 'positive' },
    { value: ATTENDANCE_STATUS.ABSENT, label: 'Absent', short: 'A', tone: 'negative' },
];

export default class AttendancePage extends Page {
    constructor(context) {
        super(context);
        this.title = 'Attendance';
        this.date = this.query.date || localDate();
        this.batchId = this.query.batch || null;
        this.register = null;
        this.holiday = null;
    }

    async render(container) {
        this.container = container;
        render(container, this.shell());
        this.bind();

        if (this.batchId) await this.openBatchRegister(this.batchId);
        else await this.loadBoard();
    }

    shell() {
        return html`
            <header class="page-header">
                <div class="page-header-text">
                    <h1 class="page-title" data-role="title">Attendance</h1>
                    <p class="page-subtitle" data-role="subtitle">${formatDateLong(this.date)}</p>
                </div>
                <div class="page-actions">
                    <div class="row row-tight" data-role="register-actions"></div>
                    <div class="row row-tight">
                        <button class="btn btn-secondary btn-icon btn-sm" data-shift="-1"
                                aria-label="Previous day">${raw(icon('chevron-left', { size: 15 }))}</button>
                        <input class="input input-sm" type="date" value="${this.date}" data-role="date"
                               aria-label="Date">
                        <button class="btn btn-secondary btn-icon btn-sm" data-shift="1"
                                aria-label="Next day">${raw(icon('chevron-right', { size: 15 }))}</button>
                    </div>
                    <button class="btn btn-secondary btn-sm" data-action="month">
                        ${raw(icon('calendar', { size: 15 }))} Month view
                    </button>
                    <button class="btn btn-secondary btn-sm" data-action="missing">
                        ${raw(icon('alert-circle', { size: 15 }))} Missing registers
                    </button>
                </div>
            </header>
            <div class="page-body" data-role="body"></div>
        `;
    }

    bind() {
        this.onDispose(on(this.container, 'change', '[data-role="date"]', (_e, target) => {
            this.date = target.value;
            this.batchId ? this.openBatchRegister(this.batchId) : this.loadBoard();
        }));
        this.onDispose(on(this.container, 'click', '[data-shift]', (_e, target) => {
            this.date = addDays(this.date, Number(target.dataset.shift));
            const input = this.container.querySelector('[data-role="date"]');
            if (input) input.value = this.date;
            this.batchId ? this.openBatchRegister(this.batchId) : this.loadBoard();
        }));
        this.onDispose(on(this.container, 'click', '[data-action="month"]', () => this.monthView()));
        this.onDispose(on(this.container, 'click', '[data-action="class-dates"]', () => this.openClassDates()));
        this.onDispose(on(this.container, 'click', '[data-action="missing"]', () => this.openMissingRegisters()));
        this.onDispose(on(this.container, 'click', '[data-open-batch]', (_e, target) =>
            this.openBatchRegister(target.dataset.openBatch)));
        this.onDispose(on(this.container, 'click', '[data-action="back"]', () => this.leaveRegister()));
        this.onDispose(on(this.container, 'click', '[data-postpone]', (event, target) => {
            event.stopPropagation();
            this.postponeSlot(target.dataset.postpone, target.dataset.date);
        }));
        this.onDispose(on(this.container, 'click', '[data-cancel-session]', (event, target) => {
            event.stopPropagation();
            this.cancelSlot(target.dataset.cancelSession, target.dataset.date);
        }));

        this.events.on(EVENTS.BRANCH_CHANGED, () => {
            // A different branch has an entirely different outstanding list.
            this.invalidateMissing();

            // A register belongs to one batch in one branch. Switching branch
            // while marking one used to silently drop any unsaved marks and
            // land the user on the day board — the screen this workflow is
            // supposed to keep out of the way. Leaving the way the Back
            // button does is both honest about what happened and consistent
            // with every other exit from this page.
            if (this.batchId) {
                this.leaveRegister();
                return;
            }
            this.loadBoard();
        });
    }

    /**
     * The single exit from a register: back where the user came from, or the
     * Timetable, which is the only screen that is *meant* to lead here.
     *
     * The day board is still reachable (a bare `/attendance` renders it, and
     * the handful of legacy shortcuts still land on it) but nothing in this
     * page routes to it deliberately any more. It is a fallback, not a
     * destination.
     */
    leaveRegister() {
        const back = previousPath();
        // Never bounce from one register into another: after postponing a
        // class, "back" landing on a different roll call would read as the
        // postpone having done something to *that* class instead.
        router.go(back && !back.startsWith('/attendance') ? back : '/timetable');
    }

    /* ------------------------------------------------------------- DAY BOARD */

    async loadBoard() {
        const body = this.container.querySelector('[data-role="body"]');
        render(body, html`<div class="skeleton skeleton-row"></div>`);
        this.clearRegisterActions();

        try {
            const [board, holiday] = await Promise.all([
                dayBoard(this.date, session.branch()),
                holidays$.on(this.date, session.branch())
            ]);

            render(this.container.querySelector('[data-role="title"]'), 'Attendance');
            render(this.container.querySelector('[data-role="subtitle"]'),
                `${formatDateLong(this.date)} · ${board.batches.filter((b) => b.done).length} of ${board.batches.length} registers marked`);

            render(body, this.boardView(board, holiday));
            this.refreshMissingBadge();
        } catch (err) {
            console.error(err);
            toast.error(err.message);
        }
    }

    boardView(board, holiday) {
        if (holiday) {
            return html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('sun'))}</div>
                        <h2 class="empty-title">${holiday.name}</h2>
                        <p class="empty-text">No classes run on ${formatDateLong(this.date)}.</p>
                    </div>
                </div></div>
            `;
        }

        return html`
            ${board.batches.length ? html`
                <div class="grid grid-3">
                    ${board.batches.map((batch) => html`
                        <button class="card card-interactive" data-open-batch="${batch.id}">
                            <div class="card-body">
                                <div class="spread">
                                    <h3 class="card-title">${batch.name}</h3>
                                    <span class="badge ${batch.done ? 'badge-success' : 'badge-warning'}">
                                        ${batch.done ? 'Marked' : 'Pending'}
                                    </span>
                                </div>
                                <p class="card-subtitle">
                                    ${batch.startTime}–${batch.endTime} · ${batch.teacherName}
                                    ${batch.room ? `· ${batch.room}` : ''}
                                </p>
                                <div class="divider"></div>
                                <div class="spread">
                                    <span class="type-caption type-muted">
                                        ${formatNumber(batch.expected)} on the roll
                                    </span>
                                    <span class="type-strong">
                                        ${batch.done ? `${batch.rate}% present` : 'Not marked'}
                                    </span>
                                </div>
                            </div>
                        </button>
                    `)}
                </div>
            ` : html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('calendar'))}</div>
                        <h2 class="empty-title">No batches meet on ${formatDate(this.date)}</h2>
                        <p class="empty-text">Pick another date, or check the timetable.</p>
                        <div class="empty-actions">
                            <a class="btn btn-secondary" href="#/timetable">Open timetable</a>
                        </div>
                    </div>
                </div></div>
            `}
        `;
    }

    /* -------------------------------------------------------------- REGISTER */

    async openBatchRegister(batchId) {
        this.batchId = batchId;
        const body = this.container.querySelector('[data-role="body"]');
        render(body, html`<div class="skeleton skeleton-row"></div>`);

        try {
            [this.register, this.holiday] = await Promise.all([
                openRegister(batchId, this.date),
                holidays$.on(this.date, session.branch())
            ]);
        } catch (err) {
            toast.error(err.message);
            this.batchId = null;
            return this.loadBoard();
        }

        render(this.container.querySelector('[data-role="title"]'), this.register.batch.name);
        render(this.container.querySelector('[data-role="subtitle"]'),
            `${formatDateLong(this.date)} · ${this.register.entries.length} students`);

        this.renderRegisterActions();
        this.refreshMissingBadge();
        this.paintRegister();
        return undefined;
    }

    /* ------------------------------------------------------- POSTPONE / CANCEL */

    clearRegisterActions() {
        const slot = this.container.querySelector('[data-role="register-actions"]');
        if (slot) render(slot, '');
    }

    renderRegisterActions() {
        const slot = this.container.querySelector('[data-role="register-actions"]');
        if (!slot) return;

        const reg = this.register;
        const inactive = reg.sessionStatus === 'postponed' || reg.sessionStatus === 'cancelled';
        // Class dates stays available whatever the session's status — it is
        // how you get *away* from a cancelled or postponed date to a real
        // one, so hiding it exactly when the date is wrong would be backwards.
        const showPostponeCancel = session.can('student.edit') && !inactive;

        render(slot, html`
            <button class="btn btn-sm btn-secondary" data-action="class-dates">
                ${raw(icon('calendar', { size: 15 }))} Class dates
            </button>
            ${showPostponeCancel ? html`
                <button class="btn btn-sm btn-secondary" data-postpone="${reg.batch.id}" data-date="${this.date}">
                    Postpone
                </button>
                <button class="btn btn-sm btn-secondary" data-cancel-session="${reg.batch.id}" data-date="${this.date}">
                    Cancel
                </button>
            ` : ''}
        `);
    }

    /* ------------------------------------------------------- CLASS-DATE PICKER */

    /**
     * A month grid of this batch's real class days.
     *
     * The native date input stays exactly where it is — on a phone its OS
     * picker is the better control, and this screen is used one-handed at the
     * edge of a hall. This sits alongside it for the question the native
     * input cannot answer: which of these days did this batch actually meet?
     */
    async openClassDates(month = monthKey(parseDate(this.date))) {
        let calendar;
        try {
            calendar = await batchCalendar({ batchId: this.batchId, month });
        } catch (err) {
            toast.error(err.message);
            return;
        }

        await drawer({
            title: 'Class dates',
            description: `${calendar.batch.name} — days this batch met. Pick one to open its register.`,
            size: 'sm',
            content: this.calendarView(calendar),
            actions: [{ label: 'Close', variant: 'secondary', value: null }],
            onMount: (body, api) => {
                on(body, 'click', '[data-month-shift]', async (_e, target) => {
                    const shift = Number(target.dataset.monthShift);
                    const [y, m] = calendar.month.split('-').map(Number);
                    const next = monthKey(new Date(y, m - 1 + shift, 1));
                    api.close(null);
                    await this.openClassDates(next);
                });
                on(body, 'click', '[data-pick-date]', (_e, target) => {
                    api.close(null);
                    this.goToRegister(this.batchId, target.dataset.pickDate);
                });
            }
        });
    }

    calendarView(calendar) {
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
                    return html`
                        <button class="calendar-day" data-state="${state}" data-pick-date="${day.date}"
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

    async postponeSlot(batchId, date) {
        const done = await formOverlay({
            title: 'Postpone this class',
            variant: 'modal',
            size: 'sm',
            submitLabel: 'Postpone',
            intro: 'The original class stays in history as Postponed. A replacement class is scheduled at the new date and time you choose here — attendance is recorded against the replacement, never the original.',
            fields: [
                { name: 'newDate', label: 'New date', type: 'date', required: true, width: 'half', value: date },
                { name: 'newStartTime', label: 'Start time', type: 'time', required: true, width: 'half' },
                { name: 'newEndTime', label: 'End time', type: 'time', required: true, width: 'half' },
                { name: 'reason', label: 'Reason', required: true, width: 'half',
                  hint: 'Teacher unavailable, exams, venue unavailable, academy event…' },
                { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2 }
            ],
            onSubmit: async (values) => postponeSession(batchId, date, values)
        });
        if (done) {
            toast.success('Class postponed — a replacement has been scheduled.');
            // The original drops off the outstanding list and the replacement
            // joins it, both only visible after a refetch.
            this.invalidateMissing();
            // Back to the Timetable, where the replacement is now visible on
            // its new date. This used to drop the user on the day board with
            // the toast still showing and no sign of where the class went.
            this.leaveRegister();
        }
    }

    async cancelSlot(batchId, date) {
        const done = await formOverlay({
            title: 'Cancel this class',
            variant: 'modal',
            size: 'sm',
            submitLabel: 'Cancel class',
            danger: true,
            intro: `This class on ${formatDate(date)} will not run. It stays in history as Cancelled — no replacement is created, and attendance can never be recorded against it.`,
            fields: [
                { name: 'reason', label: 'Reason', required: true },
                { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2 }
            ],
            onSubmit: async (values) => cancelSession(batchId, date, values)
        });
        if (done) {
            toast.success('Class cancelled.');
            this.invalidateMissing();
            this.leaveRegister();
        }
    }

    /* ------------------------------------------------------------ MISSING REGISTERS */

    /**
     * Cached, because this is not a cheap question any more and it is asked
     * on every board load and every register open.
     *
     * Widening the window from 7 days to the full 30 the service actually
     * allows marking within — necessary, since a 20-day-old register was
     * markable and listed nowhere — multiplied the attendance rows this
     * reads by roughly four, and added a second range query for sessions on
     * top. Firestore bills every one of those documents, and this project
     * has already run a free tier dry once. The answer only changes when
     * something on this page changes it, so it is fetched once and
     * invalidated deliberately (see invalidateMissing()).
     */
    refreshMissingBadge() {
        if (this.missing) {
            this.paintMissingBadge(this.missing);
            return;
        }

        missingRegisters({ branchId: session.branch() })
            .then((missing) => {
                if (this.disposed) return;
                this.missing = missing;
                this.paintMissingBadge(missing);
            })
            .catch((err) => console.error(err));
    }

    paintMissingBadge(missing) {
        const btn = this.container.querySelector('[data-action="missing"]');
        if (!btn) return;
        render(btn, html`
            ${raw(icon('alert-circle', { size: 15 }))} Missing registers
            ${missing.length ? html`<span class="badge badge-warning ml-1">${missing.length}</span>` : ''}
        `);
    }

    /** Anything that could add to or clear the outstanding list calls this. */
    invalidateMissing() {
        this.missing = null;
    }

    async openMissingRegisters() {
        let missing = this.missing;
        if (!missing) {
            try {
                missing = await missingRegisters({ branchId: session.branch() });
            } catch (err) {
                toast.error(err.message);
                return;
            }
        }

        await drawer({
            title: 'Missing registers',
            description: `Registers still unmarked, within the ${MARKING_WINDOW_DAYS}-day correction window. `
                + 'Postponed and cancelled classes are not listed — there is nothing to mark against them.',
            size: 'sm',
            content: missing.length ? html`
                <ul class="stack stack-sm">
                    ${missing.map((entry) => html`
                        <li class="spread">
                            <div>
                                <span class="type-strong">${entry.batch.name}</span>
                                ${entry.isReplacement ? html`
                                    <span class="badge badge-warning badge-sm">Rescheduled</span>
                                ` : ''}
                                <div class="type-caption type-muted">
                                    ${formatDate(entry.date)} ·
                                    ${entry.age === 0 ? 'today' : `${entry.age} day${entry.age === 1 ? '' : 's'} ago`}
                                </div>
                            </div>
                            <button class="btn btn-sm btn-secondary" data-mark="${entry.batch.id}" data-date="${entry.date}">
                                Mark
                            </button>
                        </li>
                    `)}
                </ul>
            ` : html`
                <div class="empty empty-compact">
                    <p class="empty-text">
                        Nothing outstanding — every register in the last ${MARKING_WINDOW_DAYS} days is marked.
                    </p>
                </div>
            `,
            actions: [{ label: 'Close', variant: 'secondary', value: null }],
            onMount: (body, api) => {
                on(body, 'click', '[data-mark]', (_e, target) => {
                    api.close(null);
                    this.goToRegister(target.dataset.mark, target.dataset.date);
                });
            }
        });
    }

    goToRegister(batchId, date) {
        this.date = date;
        const input = this.container.querySelector('[data-role="date"]');
        if (input) input.value = date;
        this.openBatchRegister(batchId);
    }

    /**
     * The one banner that explains why this particular date may not accept a
     * save. Ordered most-final first: a cancelled or postponed session can
     * never be marked here no matter what, so those outrank "outside the
     * correction window", which in turn outranks "the batch doesn't normally
     * meet today" — the only one of the four that is merely unusual rather
     * than actually refused.
     */
    registerWarning(reg) {
        const mark = markingWindow(this.date);

        if (reg.sessionStatus === 'cancelled') {
            return html`
                <div class="alert alert-danger">
                    <div class="alert-title">This class was cancelled</div>
                    <p class="alert-body">
                        Attendance can never be recorded against a cancelled class. Nothing saved here will be kept.
                    </p>
                </div>`;
        }

        if (reg.sessionStatus === 'postponed') {
            return html`
                <div class="alert alert-danger">
                    <div class="alert-title">This class was postponed</div>
                    <p class="alert-body">
                        Mark the replacement class instead — it carries this class's register.
                        Saving here will be refused.
                    </p>
                </div>`;
        }

        if (!mark.markable) {
            return html`
                <div class="alert alert-warning">
                    <div class="alert-title">${mark.reason === 'future' ? 'Not yet' : 'Too old to mark'}</div>
                    <p class="alert-body">${mark.message}</p>
                </div>`;
        }

        // Scheduled comes from the batch's recurring weekly pattern; a
        // replacement legitimately lands on a day it does not cover, and
        // `postponedFrom` already explains that case in its own banner
        // above, so this would only repeat it.
        if (!reg.scheduled && !reg.postponedFrom) {
            // Short, fixed title. `.alert` lays title and body out side by
            // side and the title does not shrink, so interpolating a batch
            // name here squeezed the explanation into a one-word-per-line
            // column that ran off the side of a phone. The specifics belong
            // in the sentence anyway.
            return html`
                <div class="alert alert-warning">
                    <div class="alert-title">No class scheduled</div>
                    <p class="alert-body">
                        ${reg.batch.name} does not normally meet on a ${reg.dayName}. Marking is still
                        allowed for a make-up class that genuinely went ahead — check the date first if
                        that is not what you meant to do.
                    </p>
                </div>`;
        }

        return '';
    }

    paintRegister() {
        const body = this.container.querySelector('[data-role="body"]');
        const reg = this.register;
        const canEdit = session.can('attendance.mark');

        render(body, html`
            <div class="row row-wrap">
                <button class="btn btn-sm btn-ghost" data-action="back">
                    ${raw(icon('arrow-left', { size: 15 }))} Back
                </button>
            </div>

            ${this.holiday ? html`
                <div class="alert alert-info">
                    <p class="alert-body">${formatDate(this.date)} is a holiday — ${this.holiday.name}.
                    Marking is still possible if the class went ahead.</p>
                </div>
            ` : ''}

            ${reg.postponedFrom ? html`
                <div class="alert alert-info">
                    <p class="alert-body">This class was postponed from ${formatDate(reg.postponedFrom)}.</p>
                </div>
            ` : ''}

            ${/* The register used to open silently on any date at all: a
                  Sunday for a Mon/Wed batch, a class that was cancelled a
                  fortnight ago, a date six months back. openRegister() has
                  always returned `scheduled` and `sessionStatus` saying
                  exactly that, and this page simply never read either one —
                  so the first anyone heard of it was postRegister() refusing
                  the save. Warned, never blocked: marking a make-up class on
                  a day the batch does not normally meet is legitimate and
                  the whole reason the roll call stays available below. */''}
            ${this.registerWarning(reg)}

            ${reg.alreadyMarked ? html`
                <div class="alert alert-info">
                    <p class="alert-body">This register was already marked. Saving again records a correction.</p>
                </div>
            ` : ''}

            ${reg.empty ? html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('users'))}</div>
                        <h2 class="empty-title">Nobody is in this batch</h2>
                        <p class="empty-text">Students must be placed in the batch before a register exists.</p>
                        <div class="empty-actions">
                            <a class="btn btn-primary" href="#/students?filter=unplaced">Place students</a>
                        </div>
                    </div>
                </div></div>
            ` : html`
                <section class="card">
                    <div class="card-header">
                        <div>
                            <h2 class="card-title">Roll call</h2>
                            <p class="card-subtitle" data-role="tally"></p>
                        </div>
                        ${canEdit ? html`
                            <div class="card-actions">
                                <button class="btn btn-sm btn-secondary" data-all="present">All present</button>
                                <button class="btn btn-sm btn-secondary" data-all="absent">All absent</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="card-body card-body-flush">
                        <ul class="register">
                            ${reg.entries.map((entry, index) => html`
                                <li class="register-row" data-student="${entry.studentId}">
                                    <div class="register-who">
                                        <span class="type-caption type-muted">${index + 1}</span>
                                        <div>
                                            <span class="type-strong">${entry.name}</span>
                                            <div class="type-caption type-muted">
                                                ${entry.admissionNo || ''}
                                                ${entry.medicalNotes ? '· medical note' : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="register-marks" role="group" aria-label="Mark ${entry.name}">
                                        ${MARKS.map((mark) => html`
                                            <button type="button"
                                                    class="mark-btn ${entry.status === mark.value ? 'is-active' : ''}"
                                                    data-tone="${mark.tone}"
                                                    data-mark="${mark.value}"
                                                    ${canEdit ? '' : 'disabled'}
                                                    aria-pressed="${entry.status === mark.value}"
                                                    title="${mark.label}">
                                                <span aria-hidden="true">${mark.short}</span>
                                                <span class="sr-only">${mark.label}</span>
                                            </button>
                                        `)}
                                    </div>
                                </li>
                            `)}
                        </ul>
                    </div>
                    ${canEdit ? html`
                        <div class="card-footer spread">
                            <span class="type-caption type-muted">
                                Saved in one go — a half-written register is never left behind.
                            </span>
                            <button class="btn btn-primary" data-action="save">
                                ${reg.alreadyMarked ? 'Save correction' : 'Save register'}
                            </button>
                        </div>
                    ` : ''}
                </section>
            `}
        `);

        this.updateTally();
        this.bindRegister();
    }

    bindRegister() {
        const body = this.container.querySelector('[data-role="body"]');

        this.registerDisposers?.forEach((fn) => fn());
        this.registerDisposers = [
            on(body, 'click', '[data-mark]', (_e, target) => {
                const row = target.closest('[data-student]');
                const entry = this.register.entries.find((e) => e.studentId === row.dataset.student);
                entry.status = target.dataset.mark;

                row.querySelectorAll('[data-mark]').forEach((button) => {
                    const active = button.dataset.mark === entry.status;
                    button.classList.toggle('is-active', active);
                    button.setAttribute('aria-pressed', String(active));
                });
                this.updateTally();
            }),
            on(body, 'click', '[data-all]', (_e, target) => {
                const status = target.dataset.all === 'present'
                    ? ATTENDANCE_STATUS.PRESENT : ATTENDANCE_STATUS.ABSENT;
                this.register.entries.forEach((entry) => { entry.status = status; });
                this.paintRegister();
            }),
            on(body, 'click', '[data-action="save"]', () => this.save())
        ];

        this.onDispose(() => this.registerDisposers.forEach((fn) => fn()));
    }

    updateTally() {
        const slot = this.container.querySelector('[data-role="tally"]');
        if (!slot || !this.register) return;

        const counts = MARKS.map((mark) => ({
            ...mark,
            count: this.register.entries.filter((entry) => entry.status === mark.value).length
        }));

        render(slot, html`${counts.filter((c) => c.count).map((c) => `${c.count} ${c.label.toLowerCase()}`).join(' · ')}`);
    }

    async save() {
        try {
            const result = await postRegister({
                batchId: this.register.batch.id,
                date: this.date,
                entries: this.register.entries.map((entry) => ({
                    studentId: entry.studentId,
                    status: entry.status
                }))
            });

            toast.success(result?.corrections
                ? `Register corrected — ${result.corrections} mark${result.corrections === 1 ? '' : 's'} changed.`
                : 'Register saved.');

            // This register just stopped being missing.
            this.invalidateMissing();
            await this.openBatchRegister(this.register.batch.id);
        } catch (err) {
            toast.error(err.message);
        }
    }

    /* ------------------------------------------------------------- MONTH VIEW */

    async monthView() {
        const batches = await listBatches(session.branch());
        if (!batches.length) {
            toast.info('There are no batches to show.');
            return;
        }

        let batchId = this.batchId || batches[0].id;
        let month = monthKey(this.date);

        await drawer({
            title: 'Month view',
            description: 'Every meeting day in the month, per student.',
            size: 'wide',
            content: html`
                <div class="filter-bar">
                    <div class="row row-wrap">
                        <label class="filter-control">
                            <span class="sr-only">Batch</span>
                            <select class="select select-sm" data-role="batch">
                                ${batches.map((batch) => html`
                                    <option value="${batch.id}" ${batch.id === batchId ? 'selected' : ''}>
                                        ${batch.name}
                                    </option>
                                `)}
                            </select>
                        </label>
                        <label class="filter-control">
                            <span class="sr-only">Month</span>
                            <input class="input input-sm" type="month" value="${month}" data-role="month">
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
                        const grid = await monthlyGrid({ batchId, month });
                        render(slot, this.gridView(grid));
                    } catch (err) {
                        render(slot, html`<div class="alert alert-danger"><p class="alert-body">${err.message}</p></div>`);
                    }
                };

                on(body, 'change', '[data-role="batch"]', (_e, target) => { batchId = target.value; paint(); });
                on(body, 'change', '[data-role="month"]', (_e, target) => { month = target.value; paint(); });
                paint();
            }
        });
    }

    gridView(grid) {
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
}
