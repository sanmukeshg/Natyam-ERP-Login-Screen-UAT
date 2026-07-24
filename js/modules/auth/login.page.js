/**
 * NATYAM ERP 2.0 — Login screen
 *
 * Not a router `Page`: it renders before the router (and the Shell it
 * depends on) ever mounts. "Continue with Google" opens Firebase's Google
 * popup via AuthenticationService.signIn('google') — the resulting outcome
 * (success or a provisioning rejection) is handled entirely by app.js's
 * single onAuthStateChanged listener, not here. This screen only handles
 * the popup-level failures that never reach that listener at all (closed
 * by the person, blocked by the browser, a network error opening it), and
 * displays whatever rejection message app.js passes back in as
 * `initialError` once it re-renders this same screen.
 *
 * The Mobile Number / Send OTP section below the divider is inert markup —
 * Mobile+OTP sign-in is a future milestone (see mobileOtpProvider.js). No
 * validation, no submit handler; it exists only so the approved two-option
 * login layout is visible now, clearly marked "Coming soon".
 */

import { html, render, raw, on } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { signIn } from '../../services/auth.service.js';

/** Google's standard multi-colour "G" mark, per their sign-in button branding guidelines. */
const GOOGLE_G_ICON = `
<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
</svg>`;

function errorBanner(message) {
    return html`<div class="alert alert-danger"><p class="alert-body">${message}</p></div>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {string} [options.initialError] A rejection message to show immediately —
 *   set by app.js when it re-renders this screen after a provisioning failure.
 */
export function renderLogin(container, { initialError = null } = {}) {
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
                    <p class="auth-subtitle">Sign in with your NATYAM Google account to continue.</p>

                    <div data-role="banner">${initialError ? errorBanner(initialError) : ''}</div>

                    <button class="btn btn-secondary btn-block" type="button" data-role="google-btn">
                        ${raw(GOOGLE_G_ICON)}
                        <span>Continue with Google</span>
                    </button>

                    <div class="divider divider-labelled">OR</div>

                    <div class="field">
                        <label class="field-label" for="f-mobile">
                            Mobile Number
                            <span class="badge badge-neutral badge-sm">Coming soon</span>
                        </label>
                        <input class="input" type="tel" id="f-mobile" placeholder="+91 XXXXX XXXXX" disabled>
                    </div>
                    <button class="btn btn-secondary btn-block" type="button" disabled aria-disabled="true">
                        Send OTP
                    </button>
                </div>
            </div>
        </div>
    `);

    const banner = container.querySelector('[data-role="banner"]');
    const button = container.querySelector('[data-role="google-btn"]');

    on(container, 'click', '[data-role="google-btn"]', async () => {
        render(banner, '');
        button.setAttribute('data-loading', 'true');
        button.disabled = true;

        try {
            await signIn('google');
            // Left loading: the resulting auth-state change is handled by
            // app.js, which either mounts the app or re-renders this screen
            // with a rejection message.
        } catch (err) {
            // The person closed the popup, or the browser blocked it —
            // Firebase's auth state never actually changed, so app.js's
            // listener will not fire for this. Handle it here directly.
            if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
                render(banner, errorBanner('Could not open Google sign-in. Check your connection and try again.'));
            }
            button.removeAttribute('data-loading');
            button.disabled = false;
        }
    });
}
