/**
 * NATYAM ERP 2.0 — Login screen
 *
 * Not a router `Page`: it renders before the router (and the Shell it
 * depends on) ever mounts, and after logout or an idle timeout the app
 * simply reloads and lands back here — see js/app.js. Reuses the existing
 * field/validation helpers from ui/form.js rather than hand-rolling markup,
 * and the same .card/.field/.btn classes every other screen uses.
 */

import { html, render, raw, on } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { field, readForm, validateShape, showErrors, clearErrors } from '../../ui/form.js';
import { login } from '../../services/auth.service.js';

const FIELDS = [
    { name: 'email', label: 'Email', type: 'email', required: true, autofocus: true, autocomplete: 'username', placeholder: 'you@natyam.example' },
    { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' }
];

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {(user: object) => void} options.onSuccess  Called once login succeeds.
 */
export function renderLogin(container, { onSuccess } = {}) {
    render(container, html`
        <div class="auth-screen">
            <div class="auth-card card">
                <div class="auth-brand">
                    <span class="brand-mark" aria-hidden="true">${raw(icon('feather', { size: 22 }))}</span>
                    <span class="brand-text">
                        <span class="brand-name">NATYAM</span>
                        <span class="brand-sub">School of Kuchipudi</span>
                    </span>
                </div>

                <div class="card-body">
                    <h1 class="auth-title">Sign in</h1>
                    <p class="auth-subtitle">Enter your NATYAM ERP credentials to continue.</p>

                    <div data-role="banner"></div>

                    <form data-role="login-form" novalidate>
                        ${field(FIELDS[0])}
                        ${field(FIELDS[1])}
                        <button class="btn btn-primary btn-block" type="submit" data-role="submit">
                            ${raw(icon('lock', { size: 15 }))}
                            <span>Sign in</span>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `);

    const form = container.querySelector('[data-role="login-form"]');
    const banner = container.querySelector('[data-role="banner"]');
    const submitBtn = container.querySelector('[data-role="submit"]');

    on(container, 'submit', '[data-role="login-form"]', async (event) => {
        event.preventDefault();

        const values = readForm(form, FIELDS);
        const shape = validateShape(values, FIELDS);
        if (!shape.ok) { showErrors(form, shape.errors); return; }
        clearErrors(form);
        render(banner, '');

        submitBtn.setAttribute('data-loading', 'true');
        submitBtn.disabled = true;

        try {
            const user = await login(values.email, values.password);
            onSuccess?.(user);
        } catch (err) {
            render(banner, html`
                <div class="alert alert-danger">
                    <p class="alert-body">${err.message}</p>
                </div>
            `);
        } finally {
            submitBtn.removeAttribute('data-loading');
            submitBtn.disabled = false;
        }
    });
}
