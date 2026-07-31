/**
 * NATYAM ERP 2.0 — Timetable
 *
 * The week, laid out so a double-booking is visible without anyone running a
 * check. The service already refuses to create clashing batches; this exists
 * because the batches created *before* that rule, or deliberately overridden
 * past it, still need to be seen by a human.
 *
 * Two layouts, same data: a day-column grid on a wide screen, and a stacked
 * day-by-day list on a narrow one. The stacked version is not a degraded
 * fallback — on a phone in a corridor it is the better of the two.
 */

import { Page } from '../../core/router.js';
import { html, render, raw, on } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { session } from '../../core/session.js';
import { EVENTS } from '../../core/bus.js';
import { router } from '../../core/router.js';
import { formatNumber } from '../../utils/money.js';
import { startOfWeek, addDays, formatDate } from '../../utils/date.js';
import { timetable } from '../../services/batches.service.js';
import { markingWindow } from '../../services/attendance.service.js';
import { listStaff } from '../../services/staff.service.js';

const STATUS_LABEL = { cancelled: 'Cancelled' };

export default class TimetablePage extends Page {
    constructor(context) {
        super(context);
        this.title = 'Timetable';
        this.teacherId = this.query.teacher || '';
        // Monday of the week on show. Navigation moves this a whole week at
        // a time, so it stays Monday-anchored the way the service expects.
        this.weekStart = this.query.week || startOfWeek();
    }

    async render(container) {
        this.container = container;
        render(container, this.shell());
        this.bind();
        await this.load();
    }

    /** "27 Jul – 2 Aug 2026" — the week on show, stated rather than implied. */
    weekRangeLabel() {
        return `${formatDate(this.weekStart, { withYear: false })} – ${formatDate(addDays(this.weekStart, 6))}`;
    }

    shell() {
        return html`
            <header class="page-header">
                <div class="page-header-text">
                    <h1 class="page-title">Timetable</h1>
                    <p class="page-subtitle" data-role="subtitle">The teaching week.</p>
                </div>
                <div class="page-actions">
                    <div class="row row-tight">
                        <button class="btn btn-secondary btn-icon btn-sm" data-week="-1"
                                aria-label="Previous week">${raw(icon('chevron-left', { size: 15 }))}</button>
                        <!-- Rendered here, not only in paint(): the week being shown is
                             known the moment the page is constructed, and leaving this
                             to the data load meant two unlabelled arrows during every
                             load — and permanently, if the load threw, since paint()
                             never runs in that case. -->
                        <span class="type-caption" data-role="week-range">${this.weekRangeLabel()}</span>
                        <button class="btn btn-secondary btn-icon btn-sm" data-week="1"
                                aria-label="Next week">${raw(icon('chevron-right', { size: 15 }))}</button>
                    </div>
                    <button class="btn btn-secondary btn-sm" data-action="this-week"
                            ${this.weekStart === startOfWeek() ? 'hidden' : ''}>This week</button>
                    <label class="filter-control">
                        <span class="sr-only">Teacher</span>
                        <select class="select select-sm" data-role="teacher">
                            <option value="">All teachers</option>
                        </select>
                    </label>
                    <button class="btn btn-secondary btn-sm" data-action="print">
                        ${raw(icon('printer', { size: 15 }))} Print
                    </button>
                </div>
            </header>
            <div class="page-body" data-role="body"></div>
        `;
    }

    bind() {
        this.onDispose(on(this.container, 'change', '[data-role="teacher"]', (_e, target) => {
            this.teacherId = target.value;
            this.paint();
        }));
        this.onDispose(on(this.container, 'click', '[data-action="print"]', () => window.print()));
        this.onDispose(on(this.container, 'click', '[data-batch]', (_e, target) =>
            router.go(`/attendance?batch=${target.dataset.batch}&date=${target.dataset.date}`)));

        // Whole weeks at a time, so weekStart stays Monday-anchored.
        this.onDispose(on(this.container, 'click', '[data-week]', (_e, target) => {
            this.weekStart = addDays(this.weekStart, Number(target.dataset.week) * 7);
            this.load();
        }));
        this.onDispose(on(this.container, 'click', '[data-action="this-week"]', () => {
            this.weekStart = startOfWeek();
            this.load();
        }));

        this.events.on(EVENTS.BRANCH_CHANGED, () => this.load());
    }

    async load() {
        const body = this.container.querySelector('[data-role="body"]');
        render(body, html`<div class="skeleton skeleton-row"></div>`);

        try {
            const [week, staff] = await Promise.all([
                timetable(session.branch(), this.weekStart),
                listStaff(session.branch())
            ]);

            this.week = week;

            const select = this.container.querySelector('[data-role="teacher"]');
            render(select, html`
                <option value="">All teachers</option>
                ${staff.filter((person) => person.role === 'teacher').map((person) => html`
                    <option value="${person.id}" ${person.id === this.teacherId ? 'selected' : ''}>
                        ${person.name}
                    </option>
                `)}
            `);

            this.paint();
        } catch (err) {
            console.error(err);
            toast.error(err.message);
        }
    }

    paint() {
        const week = this.teacherId
            ? this.week.map((day) => ({
                ...day,
                sessions: day.sessions.filter((s) => s.teacherId === this.teacherId)
            }))
            : this.week;

        const total = week.reduce((sum, day) => sum + day.sessions.length, 0);
        const clashes = findClashes(week);

        const isCurrentWeek = this.weekStart === startOfWeek();

        // The week on show was never stated anywhere — "15 classes a week"
        // reads identically whichever week you are looking at, which was
        // fine only while the page could show exactly one.
        render(this.container.querySelector('[data-role="week-range"]'), this.weekRangeLabel());

        const thisWeekBtn = this.container.querySelector('[data-action="this-week"]');
        if (thisWeekBtn) thisWeekBtn.hidden = isCurrentWeek;

        render(this.container.querySelector('[data-role="subtitle"]'), html`
            ${isCurrentWeek ? 'This week' : 'Week of ' + formatDate(this.weekStart)} ·
            ${formatNumber(total)} class${total === 1 ? '' : 'es'}
            ${clashes.length ? `· ${clashes.length} clash${clashes.length === 1 ? '' : 'es'}` : '· no clashes'}
        `);

        render(this.container.querySelector('[data-role="body"]'), html`
            ${clashes.length ? html`
                <div class="alert alert-warning">
                    <div class="alert-title">Two classes share a teacher or a room</div>
                    <ul class="stack stack-xs">
                        ${clashes.map((clash) => html`<li>${clash}</li>`)}
                    </ul>
                </div>
            ` : ''}

            ${total ? html`
                <div class="timetable">
                    ${week.map((day) => html`
                        <section class="timetable-day">
                            <h2 class="timetable-day-label">${day.label}</h2>
                            ${day.sessions.length ? html`
                                <ul class="stack stack-sm">
                                    ${day.sessions.map((entry) => {
                                        const cancelled = entry.sessionStatus === 'cancelled';
                                        const pending = entry.isReplacement && !entry.registerMarked;
                                        const tone = cancelled ? 'negative'
                                            : entry.registerMarked ? 'positive'
                                            : pending ? 'caution' : '';
                                        // Free navigation means tiles for weeks nobody can mark
                                        // are now reachable. Say so on the tile rather than
                                        // letting someone open a register and find out at Save.
                                        // The rule comes from attendance.service.js so this can
                                        // never disagree with what postRegister() will allow.
                                        const mark = markingWindow(entry.date);
                                        const unmarkable = !cancelled && !entry.registerMarked && !mark.markable;
                                        return html`
                                        <li>
                                            <div class="timetable-slot" data-tone="${tone}">
                                                <button class="timetable-slot-main" data-batch="${entry.id}" data-date="${entry.date}">
                                                    <span class="timetable-time">
                                                        ${entry.startTime}–${entry.endTime}
                                                    </span>
                                                    <span class="type-strong">${entry.name}</span>
                                                    ${cancelled ? html`
                                                        <span class="badge badge-danger">${STATUS_LABEL.cancelled}</span>
                                                    ` : pending ? html`
                                                        <span class="badge badge-warning">Rescheduled</span>
                                                    ` : ''}
                                                    ${unmarkable ? html`
                                                        <span class="type-caption type-muted">
                                                            ${mark.reason === 'future' ? 'Not yet — future class' : 'Too old to mark'}
                                                        </span>
                                                    ` : ''}
                                                </button>
                                            </div>
                                        </li>
                                        `;
                                    })}
                                </ul>
                            ` : html`<p class="type-caption type-muted">No classes.</p>`}
                        </section>
                    `)}
                </div>
            ` : html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('calendar'))}</div>
                        <h2 class="empty-title">Nothing scheduled</h2>
                        <p class="empty-text">
                            ${this.teacherId ? 'This teacher has no batches.' : 'Create a batch to fill the week.'}
                        </p>
                        <div class="empty-actions">
                            <a class="btn btn-primary" href="#/batches?new=1">New batch</a>
                        </div>
                    </div>
                </div></div>
            `}
        `);
    }

}

/**
 * Overlap detection for display only. The authoritative check is
 * batches.service.findConflicts, which runs before a batch is written; this
 * catches what is already in the database. A Postponed or Cancelled slot no
 * longer actually occupies its time, so it can't clash with anything.
 */
function findClashes(week) {
    const messages = [];

    for (const rawDay of week) {
        const day = { ...rawDay, sessions: rawDay.sessions.filter((s) => s.sessionStatus !== 'postponed' && s.sessionStatus !== 'cancelled') };
        for (let i = 0; i < day.sessions.length; i += 1) {
            for (let j = i + 1; j < day.sessions.length; j += 1) {
                const a = day.sessions[i];
                const b = day.sessions[j];
                if (!overlaps(a, b)) continue;

                if (a.teacherId && a.teacherId === b.teacherId) {
                    messages.push(`${a.teacherName} teaches ${a.name} and ${b.name} at the same time on ${day.label}.`);
                } else if (a.room && a.room === b.room) {
                    messages.push(`${a.room} holds ${a.name} and ${b.name} at the same time on ${day.label}.`);
                }
            }
        }
    }

    return messages;
}

function overlaps(a, b) {
    return (a.startTime || '') < (b.endTime || '') && (b.startTime || '') < (a.endTime || '');
}
