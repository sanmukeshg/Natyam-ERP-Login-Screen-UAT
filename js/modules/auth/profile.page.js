/**
 * NATYAM ERP 2.0 — My account
 *
 * The one screen every signed-in person can open, whatever their role.
 *
 * Until now there wasn't one. The profile button in the header sent everybody
 * to Settings → Users, which needs `settings.view` — a capability Teacher &
 * Reception does not hold — so a teacher clicking their own name got the
 * route-denied screen. And because "Set a password" lived only inside that
 * Administrator-gated Users table, a teacher had no way to change their own
 * password from inside the application at all; the only route back in was the
 * login screen's Forgot-password email.
 *
 * Scope is deliberately narrow: this shows the caller their own record and
 * lets them set their own password. It is not a cut-down Users tab. There is
 * no user picker, no role editing, no way to reach anybody else's account —
 * the record is read by id from the live session, never by querying the
 * collection, so there is no shape of this page that could show someone
 * else's details even if the caller went looking for one. Changing a role, a
 * branch or another person's access stays in Settings → Users, where the
 * capability checks and firestore.rules that govern it already live.
 */

import { Page } from '../../core/router.js';
import { html, render, raw, on } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { formOverlay, summaryList } from '../../ui/form.js';
import { session } from '../../core/session.js';
import { formatDate } from '../../utils/date.js';
import { roleLabel, roleTable } from '../../config/app.config.js';
import { users$, authMethodsOf } from '../../data/repositories.js';
import { setOwnPassword } from '../../services/auth.service.js';

/** How each stored `authMethods` value is described to a person. */
const METHOD_LABELS = {
    password: 'Email & password',
    google: 'Google sign-in',
    mobile: 'Mobile OTP'
};

export default class ProfilePage extends Page {
    constructor(context) {
        super(context);
        this.title = 'My account';
    }

    async render(container) {
        this.container = container;
        render(container, this.shell());
        this.bind();
        await this.load();
    }

    shell() {
        return html`
            <header class="page-header">
                <div class="page-header-text">
                    <h1 class="page-title">My account</h1>
                    <p class="page-subtitle">Your own details and how you sign in.</p>
                </div>
            </header>
            <div class="page-body" data-role="body"></div>
        `;
    }

    bind() {
        this.onDispose(on(this.container, 'click', '[data-action="password"]', () => this.passwordFlow()));
    }

    /**
     * Reads the caller's own document rather than trusting the copy hydrated
     * at sign-in: `authMethods` changes the moment they set a password here,
     * and a stale session object would keep saying otherwise until the next
     * reload. One document, by id — `firestore.rules` permits this through
     * `isOwnDoc(userId)` without any role at all, which is exactly why this
     * page can be capability-free.
     */
    async load() {
        const body = this.container.querySelector('[data-role="body"]');
        render(body, html`<div class="skeleton skeleton-row"></div>`);

        try {
            this.account = await users$.find(session.actorId());
        } catch (err) {
            console.error(err);
            this.account = null;
        }

        if (this.disposed) return;
        render(body, this.view());
    }

    view() {
        // Falling back to the session copy keeps this screen useful even if
        // the read failed — the details shown are then whatever signed the
        // person in, which is still their own and still accurate enough to
        // answer "who am I logged in as".
        const account = this.account || session.user || {};
        const methods = authMethodsOf(account);
        const hasPassword = methods.includes('password');
        const branches = session.branches || [];
        const role = session.role();

        return html`
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${session.actorName()}</h2>
                    <p class="card-subtitle">${roleLabel(role) || 'User'}</p>
                </div>
                <div class="card-body">
                    ${summaryList([
                        ['Email', account.email || '—'],
                        ['Mobile', account.mobile || 'Not set'],
                        ['Role', roleLabel(role) || '—'],
                        ['Staff code', account.userCode || '—'],
                        // `createdAt` is a full ISO timestamp, not a YYYY-MM-DD
                        // date. formatDate() parses by splitting on "-", so the
                        // day part arrives as "11T09:00:00.000Z", becomes NaN,
                        // and its `day || 1` fallback silently renders the 1st
                        // of the month — a wrong date that looks entirely
                        // plausible. Hand it a real Date, which parseDate()
                        // passes straight through.
                        ['Account created', account.createdAt ? formatDate(new Date(account.createdAt)) : '—']
                    ])}
                    ${roleTable()[role]?.description ? html`
                        <p class="type-caption type-muted">${roleTable()[role].description}</p>
                    ` : ''}
                </div>
            </div>

            <div class="card">
                ${/* "Sign-in methods" rather than "How you sign in": .card-header
                      lays the title and subtitle out side by side, so on a phone a
                      four-word title is squeezed into a narrow column and wraps to
                      three lines. Short title, explanation moved into the body. */''}
                <div class="card-header">
                    <h3 class="card-title">Sign-in methods</h3>
                </div>
                <div class="card-body">
                    <p class="type-caption type-muted">
                        Only these will let you in. An administrator decides which are enabled
                        for your account.
                    </p>
                    ${methods.length ? html`
                        <ul class="stack stack-sm">
                            ${methods.map((method) => html`
                                <li class="row row-tight">
                                    ${raw(icon('check', { size: 15 }))}
                                    <span>${METHOD_LABELS[method] || method}</span>
                                </li>
                            `)}
                        </ul>
                    ` : html`
                        <p class="type-body">
                            No sign-in method is recorded on your account. Ask an administrator to set one
                            before you next sign out.
                        </p>
                    `}

                    <div class="divider"></div>

                    <button class="btn btn-secondary" data-action="password">
                        ${raw(icon('lock', { size: 15 }))}
                        ${hasPassword ? 'Change my password' : 'Set a password'}
                    </button>
                    <p class="type-caption type-muted">
                        ${hasPassword
                            ? 'Replaces the password you use to sign in. Your other sign-in methods are unaffected.'
                            : 'Adds email & password as a way to sign in, alongside whatever you already use.'}
                    </p>
                </div>
            </div>

            ${branches.length ? html`
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Branches you can see</h3>
                    </div>
                    <div class="card-body card-body-tight">
                        <ul class="stack stack-sm">
                            ${branches.map((branch) => html`
                                <li class="spread">
                                    <span class="type-strong">${branch.name}</span>
                                    <span class="type-caption type-muted">${branch.code || ''}</span>
                                </li>
                            `)}
                        </ul>
                    </div>
                </div>
            ` : ''}
        `;
    }

    /**
     * Same underlying call the Settings → Users tab makes, and for the same
     * reason it can never take a user id: setOwnPassword() targets whoever is
     * signed in right now and nobody else, so there is nothing here for a
     * caller to point at another account.
     */
    async passwordFlow() {
        const saved = await formOverlay({
            title: this.account && authMethodsOf(this.account).includes('password')
                ? 'Change my password'
                : 'Set a password',
            intro: 'This applies to your own account only.',
            fields: [
                { name: 'password', label: 'New password', type: 'password', required: true },
                { name: 'confirm', label: 'Confirm password', type: 'password', required: true }
            ],
            onSubmit: async (values) => {
                if (values.password !== values.confirm) throw new Error('Passwords do not match.');
                await setOwnPassword(values.password);
            }
        });

        if (saved) {
            toast.success('Password updated. Use it the next time you sign in.');
            await this.load();
        }
    }
}
