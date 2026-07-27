/**
 * NATYAM ERP 2.0 — Login screen
 *
 * Not a router `Page`: it renders before the router (and the Shell it
 * depends on) ever mounts. Three sign-in methods, one screen, matching
 * the approved unified layout: Email & Password (primary), Google, and
 * Mobile OTP — desktop and mobile both, using the same responsive card
 * every other layout on this screen already uses.
 *
 * Every method funnels into the same outcome handling: a successful
 * `signIn()`/`confirmMobileCode()` call leaves this screen in its loading
 * state and does nothing else — the resulting Firebase auth-state change
 * is handled entirely by app.js's single `onAuthStateChanged` listener,
 * which either mounts the app or re-renders this screen with a rejection
 * message (`initialError`). A thrown error that never reaches that
 * listener at all (a closed Google popup, a wrong password, a bad OTP
 * code, an account not permitted to use this method) is handled directly
 * here.
 *
 * Two different kinds of error reach these catch blocks, and they are not
 * shown the same way. Errors `resolveProvisionedUser()` throws (archived,
 * disabled, method not permitted, not provisioned) are our own `Error`
 * objects with no `.code` — every one of them is written specifically to
 * be safe to show as-is. Anything with a `.code` is a raw Firebase SDK
 * error (`auth/wrong-password`, `auth/invalid-verification-code`, …) —
 * `friendlyAuthError()` below translates the ones this screen can produce
 * into plain, non-technical messages; nothing with a `.code` is ever
 * shown to a person untranslated.
 */

import { html, render, raw, on, formData } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import {
    signIn, sendMobileCode, confirmMobileCode, requestPasswordReset
} from '../../services/auth.service.js';

/** Google's standard multi-colour "G" mark, per their sign-in button branding guidelines. */
const GOOGLE_G_ICON = `
<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
</svg>`;

/** Must match mobileOtpProvider.js's RECAPTCHA_CONTAINER_ID exactly. */
const RECAPTCHA_CONTAINER_ID = 'mobile-otp-recaptcha';

function errorBanner(message) {
    return html`<div class="alert alert-danger"><p class="alert-body">${message}</p></div>`;
}

function successBanner(message) {
    return html`<div class="alert alert-success"><p class="alert-body">${message}</p></div>`;
}

/**
 * NATYAM's users are all Indian today, and Firebase's `signInWithPhoneNumber`
 * requires full E.164 (a leading `+` and country code) — asking every person
 * to type `+91` themselves on every sign-in is friction with only one
 * possible answer. A number that already has a `+` (someone deliberately
 * entering a different country code) is left exactly as typed; anything
 * else gets `+91` prepended, after stripping spaces/dashes and a leading
 * trunk `0` some people habitually type before a 10-digit mobile number.
 */
function toIndianE164(raw) {
    const digits = String(raw || '').replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    return `+91${digits.replace(/^0+/, '')}`;
}

/**
 * Turns a thrown sign-in error into something safe to show. An error with
 * no `.code` is already one of our own — resolveProvisionedUser()'s
 * rejections are documented as safe to display verbatim. An error *with*
 * a `.code` is a raw Firebase SDK error and is never shown as-is; the
 * known codes this screen can actually produce are translated here, and
 * anything unrecognised falls back to a generic, still non-technical
 * message rather than leaking the code or Firebase's own wording.
 */
function friendlyAuthError(err, fallback) {
    if (!err) return fallback;
    if (!err.code) return err.message || fallback;

    switch (err.code) {
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
            return 'Incorrect email or password.';
        case 'auth/invalid-email':
            return 'Enter a valid email address.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a moment and try again.';
        case 'auth/invalid-phone-number':
            return 'Enter a valid mobile number, including the country code.';
        case 'auth/invalid-verification-code':
            return 'That code did not match. Check it and try again.';
        case 'auth/code-expired':
            return 'That code has expired. Request a new one.';
        case 'auth/network-request-failed':
            return 'Network error. Check your connection and try again.';
        case 'auth/operation-not-allowed':
            return 'This sign-in method is not available right now. Try a different method or contact an administrator.';
        default:
            return fallback;
    }
}

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {string} [options.initialError] A rejection message to show immediately —
 *   set by app.js when it re-renders this screen after a provisioning failure.
 */
export function renderLogin(container, { initialError = null } = {}) {
    // Holds the Mobile OTP flow's in-progress confirmation handle between
    // "Send OTP" and "Verify" — this screen has exactly one instance at a
    // time, so a plain closure variable is enough; no component state
    // machine needed for a two-step form.
    let confirmation = null;

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
                    <p class="auth-subtitle">Sign in to continue to NATYAM ERP.</p>

                    <div data-role="banner">${initialError ? errorBanner(initialError) : ''}</div>

                    <form data-role="password-form">
                        <div class="field">
                            <label class="field-label" for="f-email">Email</label>
                            <input class="input" type="email" id="f-email" name="email"
                                   placeholder="you@natyam.example" autocomplete="username" required>
                        </div>
                        <div class="field">
                            <label class="field-label" for="f-password">Password</label>
                            <input class="input" type="password" id="f-password" name="password"
                                   placeholder="••••••••" autocomplete="current-password" required>
                        </div>
                        <button class="btn btn-primary btn-block" type="submit" data-role="password-btn">
                            Login
                        </button>
                        <button class="btn-link" type="button" data-role="forgot-btn">Forgot password?</button>
                    </form>

                    <button class="btn btn-secondary btn-block" type="button" data-role="google-btn">
                        ${raw(GOOGLE_G_ICON)}
                        <span>Continue with Google</span>
                    </button>

                    <div data-role="otp-request">
                        <div class="field">
                            <label class="field-label" for="f-mobile">Mobile Number</label>
                            <input class="input" type="tel" id="f-mobile" placeholder="98765 43210" autocomplete="tel">
                        </div>
                        <button class="btn btn-secondary btn-block" type="button" data-role="send-otp-btn">
                            Send OTP
                        </button>
                    </div>

                    <div data-role="otp-verify" hidden>
                        <div class="field">
                            <label class="field-label" for="f-otp-code">Enter the code you received</label>
                            <input class="input" type="text" id="f-otp-code" inputmode="numeric"
                                   placeholder="6-digit code" autocomplete="one-time-code">
                        </div>
                        <button class="btn btn-secondary btn-block" type="button" data-role="verify-otp-btn">
                            Verify
                        </button>
                        <button class="btn-link" type="button" data-role="change-number-btn">Use a different number</button>
                    </div>

                    <div id="${RECAPTCHA_CONTAINER_ID}"></div>
                </div>
            </div>
        </div>
    `);

    const banner = container.querySelector('[data-role="banner"]');
    const googleButton = container.querySelector('[data-role="google-btn"]');
    const passwordForm = container.querySelector('[data-role="password-form"]');
    const passwordButton = container.querySelector('[data-role="password-btn"]');
    const otpRequest = container.querySelector('[data-role="otp-request"]');
    const otpVerify = container.querySelector('[data-role="otp-verify"]');
    const sendOtpButton = container.querySelector('[data-role="send-otp-btn"]');
    const verifyOtpButton = container.querySelector('[data-role="verify-otp-btn"]');

    /* ------------------------------------------------------ EMAIL & PASSWORD */

    on(container, 'submit', '[data-role="password-form"]', async (event) => {
        event.preventDefault();
        render(banner, '');
        passwordButton.setAttribute('data-loading', 'true');
        passwordButton.disabled = true;

        try {
            const { email, password } = formData(passwordForm);
            await signIn('password', { email, password });
            // Left loading: app.js's onAuthStateChanged listener takes it from here.
        } catch (err) {
            render(banner, errorBanner(friendlyAuthError(err, 'Could not sign in. Check your email and password.')));
            passwordButton.removeAttribute('data-loading');
            passwordButton.disabled = false;
        }
    });

    on(container, 'click', '[data-role="forgot-btn"]', async () => {
        const email = container.querySelector('#f-email').value.trim();
        if (!email) {
            render(banner, errorBanner('Enter your email above first, then click "Forgot password?" again.'));
            return;
        }
        render(banner, '');
        try {
            await requestPasswordReset(email);
            render(banner, successBanner('If that email is registered, a password reset link is on its way.'));
        } catch {
            // Firebase's own error messages for this call can leak whether an
            // email is registered — show the same reassuring message either way.
            render(banner, successBanner('If that email is registered, a password reset link is on its way.'));
        }
    });

    /* -------------------------------------------------------------- GOOGLE */

    on(container, 'click', '[data-role="google-btn"]', async () => {
        render(banner, '');
        googleButton.setAttribute('data-loading', 'true');
        googleButton.disabled = true;

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
            googleButton.removeAttribute('data-loading');
            googleButton.disabled = false;
        }
    });

    /* ---------------------------------------------------------- MOBILE OTP */

    on(container, 'click', '[data-role="send-otp-btn"]', async () => {
        render(banner, '');
        const phoneNumber = toIndianE164(container.querySelector('#f-mobile').value.trim());
        sendOtpButton.setAttribute('data-loading', 'true');
        sendOtpButton.disabled = true;

        try {
            confirmation = await sendMobileCode(phoneNumber);
            otpRequest.hidden = true;
            otpVerify.hidden = false;
            container.querySelector('#f-otp-code').focus();
        } catch (err) {
            console.error('[mobile-otp] sendCode failed', err?.code, err?.message, err);
            render(banner, errorBanner(friendlyAuthError(err, 'Could not send a code. Check the number and try again.')));
        } finally {
            sendOtpButton.removeAttribute('data-loading');
            sendOtpButton.disabled = false;
        }
    });

    on(container, 'click', '[data-role="verify-otp-btn"]', async () => {
        render(banner, '');
        const code = container.querySelector('#f-otp-code').value.trim();
        verifyOtpButton.setAttribute('data-loading', 'true');
        verifyOtpButton.disabled = true;

        try {
            await confirmMobileCode(confirmation, code);
            // Left loading: same app.js hand-off as every other method.
        } catch (err) {
            console.error('[mobile-otp] confirmCode failed', err?.code, err?.message, err);
            render(banner, errorBanner(friendlyAuthError(err, 'That code did not match. Check it and try again.')));
            verifyOtpButton.removeAttribute('data-loading');
            verifyOtpButton.disabled = false;
        }
    });

    on(container, 'click', '[data-role="change-number-btn"]', () => {
        render(banner, '');
        confirmation = null;
        otpVerify.hidden = true;
        otpRequest.hidden = false;
        container.querySelector('#f-otp-code').value = '';
    });
}
