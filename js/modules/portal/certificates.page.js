/**
 * NATYAM ERP 2.0 — Parent/Student Portal: Certificates (Milestone P1)
 *
 * certificates$.forStudent(studentId) already existed as a clean,
 * single-studentId-scoped read (js/data/certificates.repository.firestore.js)
 * — reused unchanged, guarded server-side by firestore.rules'
 * isGuardianOfStudentId() on the certificates collection.
 */

import { Page } from '../../core/router.js';
import { html, render } from '../../utils/dom.js';
import { EVENTS } from '../../core/bus.js';
import { formatDate } from '../../utils/date.js';
import { certificates$ } from '../../data/repositories.js';
import { guardianSession } from '../../services/portal/guardianAuth.service.js';

export default class PortalCertificatesPage extends Page {
    constructor(context) {
        super(context);
        this.title = 'Certificates';
    }

    async render(container) {
        this.container = container;
        await this.load();
        this.events.on(EVENTS.PORTAL_CHILD_CHANGED, () => this.load());
    }

    async load() {
        const student = guardianSession.activeChild();
        if (!student) { render(this.container, this.shell(null, [])); return; }

        const certificates = await certificates$.forStudent(student.id);
        if (this.disposed) return;
        render(this.container, this.shell(student, certificates));
    }

    shell(student, certificates) {
        return html`
            <header class="page-header">
                <div class="page-header-text">
                    <h1 class="page-title">Certificates</h1>
                    <p class="page-subtitle">${student?.name || ''}</p>
                </div>
            </header>
            <div class="page-body">
                ${certificates.length ? html`
                    <div class="card"><div class="card-body">
                        <ul>
                            ${certificates.map((c) => html`
                                <li class="mt-1">
                                    <span class="type-strong">${c.title}</span>
                                    <span class="type-caption type-muted"> — ${c.serial} · issued ${formatDate(c.issuedOn)}</span>
                                    ${c.status === 'revoked' ? html`<span class="badge badge-neutral">Revoked</span>` : ''}
                                </li>
                            `)}
                        </ul>
                    </div></div>
                ` : html`
                    <div class="card"><div class="card-body">
                        No certificates issued to ${student?.name || 'this child'} yet.
                    </div></div>
                `}
            </div>
        `;
    }
}
