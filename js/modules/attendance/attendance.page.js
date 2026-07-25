/**
 * NATYAM ERP 2.0 — Attendance
 *
 * One batch at a time: pick a batch, then view and mark its attendance in
 * Week (default), Custom Range, or Month. Week and Custom Range are marked
 * directly in the grid — click a cell to toggle Present/Absent, then save;
 * Month stays read-only, exactly as it was before this migration.
 *
 * Built for one-handed speed on a phone at the edge of a hall: everybody
 * starts Present, marking is one tap per exception, and saving posts one
 * whole day's roster at a time — postRegister() refuses to leave a class
 * half-marked, whatever this page sends it.
 */

import { Page } from '../../core/router.js';
import { html, render, raw, on } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { session } from '../../core/session.js';
import { EVENTS } from '../../core/bus.js';
import { formatDate, localDate, addDays, monthKey, formatMonth } from '../../utils/date.js';
import { ATTENDANCE_STATUS } from '../../config/app.config.js';

import {
    postRegister, weeklyGrid, customRangeGrid, monthlyGrid
} from '../../services/attendance.service.js';
import { listBatches } from '../../services/batches.service.js';

const MARKS = [
    { value: ATTENDANCE_STATUS.PRESENT, label: 'Present', short: 'P', tone: 'positive' },
    { value: ATTENDANCE_STATUS.ABSENT, label: 'Absent', short: 'A', tone: 'negative' }
];

const TABS = [
    { key: 'week', label: 'Week' },
    { key: 'range', label: 'Custom Range' },
    { key: 'month', label: 'Month' }
];

export default class AttendancePage extends Page {
    constructor(context) {
        super(context);
        this.title = 'Attendance';
        this.batchId = this.query.batch || null;
        // A batch named in the URL (?batch=X, with or without &date=) is
        // trusted and loads immediately. Arriving with no batch at all
        // (a bare #/attendance link, e.g. from Notifications or Search) no
        // longer silently opens whichever batch happens to be first — the
        // Batch selector is shown empty and attendance only loads once the
        // person actually picks one.
        this.batchExplicit = Boolean(this.query.batch);
        this.tab = 'week';
        // A batch+date deep link (Dashboard's "Mark", Timetable/Batches'
        // "Take register") lands on the week containing that date rather
        // than the current week.
        this.weekAnchor = this.query.date || localDate();
        this.rangeFrom = this.query.date || localDate();
        this.rangeTo = this.query.date || localDate();
        this.grid = null;
        this.dirty = new Map(); // date -> Map(studentId -> status), staged edits not yet saved
        this.batchesLoadFailed = false;
    }

    async render(container) {
        this.container = container;

        // Not wrapping this used to crash the whole page to the router's
        // fatal error boundary on any failure here (e.g. Firestore rules
        // not yet republished for a new collection) — every other page in
        // this app degrades to a toast and an empty state instead, and
        // this one now does too.
        try {
            this.batches = await listBatches(session.branch());
        } catch (err) {
            console.error('Could not load batches for Attendance', err);
            toast.error(`Could not load batches — ${err.message}`);
            this.batches = [];
            this.batchesLoadFailed = true;
        }

        if (this.batchExplicit) {
            // Keep the requested batch only if it's actually one of this
            // branch's — otherwise fall back the same way this deep link
            // already did before this adjustment (unchanged behaviour for
            // ?batch=X and ?batch=X&date=Y, per instruction).
            if (!this.batches.some((b) => b.id === this.batchId)) {
                this.batchId = this.batches[0]?.id || null;
            }
        } else {
            this.batchId = null;
        }

        render(container, this.shell());
        this.bind();
        await this.load();
    }

    shell() {
        return html`
            <header class="page-header">
                <div class="page-header-text">
                    <h1 class="page-title">Attendance</h1>
                    <p class="page-subtitle">Weekly by default — switch to a custom range or the month view.</p>
                </div>
                <div class="page-actions">
                    <label class="filter-control">
                        <span class="sr-only">Batch</span>
                        <select class="select select-sm" data-role="batch">
                            ${!this.batchId ? html`<option value="" disabled selected>Choose a batch…</option>` : ''}
                            ${this.batches.map((b) => html`
                                <option value="${b.id}" ${b.id === this.batchId ? 'selected' : ''}>${b.name}</option>
                            `)}
                        </select>
                    </label>
                </div>
            </header>
            <div class="page-body">
                <div class="tabs" role="tablist">
                    ${TABS.map((t) => html`
                        <button class="tab ${t.key === this.tab ? 'is-active' : ''}" role="tab"
                                aria-selected="${t.key === this.tab}" data-tab="${t.key}">${t.label}</button>
                    `)}
                </div>
                <div data-role="panel"></div>
            </div>
        `;
    }

    bind() {
        this.onDispose(on(this.container, 'change', '[data-role="batch"]', (_e, target) => {
            this.batchId = target.value;
            this.dirty.clear();
            this.load();
        }));
        this.onDispose(on(this.container, 'click', '[data-tab]', (_e, target) => {
            if (target.dataset.tab === this.tab) return;
            this.tab = target.dataset.tab;
            this.dirty.clear();
            this.load();
        }));
        this.onDispose(on(this.container, 'click', '[data-week-shift]', (_e, target) => {
            this.weekAnchor = addDays(this.weekAnchor, Number(target.dataset.weekShift));
            this.dirty.clear();
            this.load();
        }));
        this.events.on(EVENTS.BRANCH_CHANGED, async () => {
            try {
                this.batches = await listBatches(session.branch());
                this.batchesLoadFailed = false;
            } catch (err) {
                console.error('Could not load batches for Attendance', err);
                toast.error(`Could not load batches — ${err.message}`);
                this.batches = [];
                this.batchesLoadFailed = true;
            }
            // A different branch means a different set of batches — the
            // previous selection (or lack of one) no longer means anything,
            // so this asks again rather than silently picking one.
            this.batchId = null;
            this.batchExplicit = false;
            this.dirty.clear();
            // Re-renders the header (so the Batch selector reflects the new
            // branch's list) without re-binding — bind()'s listeners are
            // delegated to this.container, which this render() call doesn't
            // replace, only its children, so they remain valid as-is.
            render(this.container, this.shell());
            this.load();
        });
    }

    async load() {
        this.container.querySelectorAll('[data-tab]').forEach((btn) => {
            const active = btn.dataset.tab === this.tab;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
        });

        const panel = this.container.querySelector('[data-role="panel"]');

        if (!this.batches.length) {
            render(panel, this.batchesLoadFailed ? html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('alert-triangle'))}</div>
                        <h2 class="empty-title">Could not load batches</h2>
                        <p class="empty-text">Something went wrong fetching your batches. Reload the page to try again.</p>
                    </div>
                </div></div>
            ` : html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('grid'))}</div>
                        <h2 class="empty-title">No batches to show</h2>
                        <p class="empty-text">Create a batch before attendance can be recorded.</p>
                    </div>
                </div></div>
            `);
            return;
        }

        if (!this.batchId) {
            render(panel, html`
                <div class="card"><div class="card-body">
                    <div class="empty">
                        <div class="empty-glyph">${raw(icon('check-square'))}</div>
                        <h2 class="empty-title">Choose a batch</h2>
                        <p class="empty-text">Pick a batch above to view and mark its attendance.</p>
                    </div>
                </div></div>
            `);
            return;
        }

        render(panel, html`<div class="skeleton skeleton-row"></div>`);

        try {
            if (this.tab === 'week') await this.loadWeek(panel);
            else if (this.tab === 'range') await this.loadRange(panel);
            else await this.loadMonth(panel);
        } catch (err) {
            render(panel, html`<div class="alert alert-danger"><p class="alert-body">${err.message}</p></div>`);
        }
    }

    /* ---------------------------------------------------------------- WEEK */

    async loadWeek(panel) {
        this.grid = await weeklyGrid({ batchId: this.batchId, weekStart: this.weekAnchor });
        render(panel, this.weekShell());
        this.paintGrid();
    }

    weekShell() {
        return html`
            <div class="row row-wrap mb-3">
                <button class="btn btn-secondary btn-icon btn-sm" data-week-shift="-7" aria-label="Previous week">
                    ${raw(icon('chevron-left', { size: 15 }))}
                </button>
                <span class="type-strong">${formatDate(this.grid.weekStart)} – ${formatDate(this.grid.weekEnd)}</span>
                <button class="btn btn-secondary btn-icon btn-sm" data-week-shift="7" aria-label="Next week">
                    ${raw(icon('chevron-right', { size: 15 }))}
                </button>
            </div>
            <div data-role="grid"></div>
        `;
    }

    /* --------------------------------------------------------------- RANGE */

    async loadRange(panel) {
        render(panel, html`
            <div class="filter-bar mb-3">
                <div class="row row-wrap">
                    <label class="filter-control">
                        <span class="sr-only">From</span>
                        <input class="input input-sm" type="date" value="${this.rangeFrom}" data-role="from">
                    </label>
                    <label class="filter-control">
                        <span class="sr-only">To</span>
                        <input class="input input-sm" type="date" value="${this.rangeTo}" data-role="to">
                    </label>
                    <button class="btn btn-secondary btn-sm" data-action="show-range">Show</button>
                </div>
            </div>
            <div data-role="grid"><p class="type-muted">Choose a range and select Show.</p></div>
        `);

        // Re-entered every time this tab loads (switching away and back
        // re-runs loadRange against the same, persistent panel node) — the
        // previous round's delegated listeners must be disposed first, or
        // each visit binds another copy on top of the last.
        this.rangeDisposers?.forEach((fn) => fn());
        this.rangeDisposers = [
            on(panel, 'change', '[data-role="from"]', (_e, target) => { this.rangeFrom = target.value; }),
            on(panel, 'change', '[data-role="to"]', (_e, target) => { this.rangeTo = target.value; }),
            on(panel, 'click', '[data-action="show-range"]', async () => {
                try {
                    this.grid = await customRangeGrid({ batchId: this.batchId, from: this.rangeFrom, to: this.rangeTo });
                    this.dirty.clear();
                    this.paintGrid();
                } catch (err) {
                    toast.error(err.message);
                }
            })
        ];
        this.onDispose(() => this.rangeDisposers.forEach((fn) => fn()));

        this.grid = await customRangeGrid({ batchId: this.batchId, from: this.rangeFrom, to: this.rangeTo });
        this.paintGrid();
    }

    /* --------------------------------------------------------- MARKABLE GRID */

    paintGrid() {
        const panel = this.container.querySelector('[data-role="panel"]');
        const slot = panel.querySelector('[data-role="grid"]') || panel;
        const grid = this.grid;
        const canEdit = session.can('attendance.mark');

        if (!grid.days.length) {
            render(slot, html`<div class="empty empty-compact">
                <p class="empty-text">${grid.batch.name} has no scheduled classes in this period.</p>
            </div>`);
            return;
        }

        render(slot, html`
            <div class="table-wrap">
                <table class="table table-pin-first table-compact">
                    <caption class="sr-only">Attendance for ${grid.batch.name}</caption>
                    <thead>
                        <tr>
                            <th scope="col">Student</th>
                            ${grid.days.map((d) => html`<th scope="col" class="text-center" title="${formatDate(d.date)}">${d.label}</th>`)}
                            <th scope="col" class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${grid.rows.map((row) => html`
                            <tr data-student="${row.student.id}">
                                <th scope="row">${row.student.name}</th>
                                ${grid.days.map((d, i) => {
                                    const staged = this.dirty.get(d.date)?.get(row.student.id);
                                    const status = staged || row.cells[i];
                                    const mark = MARKS.find((m) => m.value === status);
                                    return html`<td class="text-center">
                                        ${canEdit ? html`
                                            <button type="button" class="mark-btn ${mark ? 'is-active' : ''}"
                                                    data-tone="${mark?.tone || 'neutral'}"
                                                    data-cell-date="${d.date}" data-cell-student="${row.student.id}"
                                                    data-cell-status="${status || ''}"
                                                    aria-label="${row.student.name}, ${d.label}, ${mark?.label || 'not marked'}">
                                                ${mark ? mark.short : '·'}
                                            </button>
                                        ` : html`
                                            <span class="type-muted">${mark ? mark.short : '·'}</span>
                                        `}
                                    </td>`;
                                })}
                                <td class="text-right">
                                    ${row.total === 0 ? html`<span class="type-muted">—</span>` : html`
                                        <span class="badge ${row.rate >= 80 ? 'badge-success' : row.rate >= 65 ? 'badge-warning' : 'badge-danger'}">
                                            ${row.present}/${row.total}
                                        </span>
                                    `}
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
            ${canEdit ? html`
                <div class="row spread mt-3">
                    <span class="type-caption type-muted">Only the days this batch actually meets are shown.</span>
                    <button class="btn btn-primary" data-action="save-grid" ${this.dirty.size ? '' : 'disabled'}>
                        Save changes
                    </button>
                </div>
            ` : ''}
        `);

        this.bindGrid(slot);
    }

    bindGrid(slot) {
        this.gridDisposers?.forEach((fn) => fn());
        this.gridDisposers = [
            on(slot, 'click', '[data-cell-date]', (_e, target) => {
                const { cellDate: date, cellStudent: studentId, cellStatus: current } = target.dataset;
                const next = current === ATTENDANCE_STATUS.PRESENT ? ATTENDANCE_STATUS.ABSENT : ATTENDANCE_STATUS.PRESENT;

                if (!this.dirty.has(date)) this.dirty.set(date, new Map());
                this.dirty.get(date).set(studentId, next);
                this.paintGrid();
            }),
            on(this.container, 'click', '[data-action="save-grid"]', () => this.saveGrid())
        ];
        this.onDispose(() => this.gridDisposers.forEach((fn) => fn()));
    }

    /** Posts one postRegister() call per dirty date — each call carries that date's complete roster, matching the one-atomic-write-per-day contract. */
    async saveGrid() {
        const grid = this.grid;
        let saved = 0;

        try {
            for (const [date, changes] of this.dirty) {
                const entries = grid.rows.map((row) => {
                    const dayIndex = grid.days.findIndex((d) => d.date === date);
                    const loaded = dayIndex >= 0 ? row.cells[dayIndex] : null;
                    const status = changes.get(row.student.id) || loaded || ATTENDANCE_STATUS.PRESENT;
                    return { studentId: row.student.id, status };
                });
                await postRegister({ batchId: this.batchId, date, entries });
                saved += 1;
            }

            toast.success(`Saved attendance for ${saved} day${saved === 1 ? '' : 's'}.`);
            this.dirty.clear();
            await this.load();
        } catch (err) {
            toast.error(err.message);
        }
    }

    /* --------------------------------------------------------------- MONTH */

    async loadMonth(panel) {
        const month = monthKey(this.weekAnchor);
        render(panel, html`
            <div class="filter-bar mb-3">
                <label class="filter-control">
                    <span class="sr-only">Month</span>
                    <input class="input input-sm" type="month" value="${month}" data-role="month">
                </label>
            </div>
            <div data-role="grid"></div>
        `);

        let current = month;
        const paint = async () => {
            const grid = await monthlyGrid({ batchId: this.batchId, month: current });
            render(panel.querySelector('[data-role="grid"]'), this.monthGridView(grid));
        };

        // Same re-entrant panel as loadRange() — dispose the previous
        // round's listener before adding another.
        this.monthDisposer?.();
        this.monthDisposer = on(panel, 'change', '[data-role="month"]', (_e, target) => { current = target.value; paint(); });
        this.onDispose(() => this.monthDisposer?.());
        await paint();
    }

    monthGridView(grid) {
        if (!grid.days.length) {
            return html`<div class="empty empty-compact">
                <p class="empty-text">${grid.batch.name} has no meeting days yet in ${formatMonth(grid.month)}.</p>
            </div>`;
        }

        return html`
            <div class="table-wrap">
                <table class="table table-pin-first table-compact">
                    <caption class="sr-only">Attendance for ${grid.batch.name}, ${formatMonth(grid.month)}</caption>
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
                                            ? html`<span class="mark-dot" data-tone="${meta.tone}" title="${meta.label}">${meta.short}</span>`
                                            : html`<span class="type-muted" aria-label="not marked">·</span>`}
                                    </td>`;
                                })}
                                <td class="text-right">
                                    ${row.rate === null
                                        ? html`<span class="type-muted">—</span>`
                                        : html`<span class="badge ${row.rate >= 80 ? 'badge-success' : row.rate >= 65 ? 'badge-warning' : 'badge-danger'}">${row.rate}%</span>`}
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
            <p class="type-caption type-muted mt-2">Only days this batch meets appear as columns.</p>
        `;
    }
}
