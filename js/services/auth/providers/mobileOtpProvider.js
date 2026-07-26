/**
 * NATYAM ERP 2.0 — Mobile+OTP AuthenticationProvider
 *
 * Firebase Phone Authentication. Two-step, unlike the one-shot `signIn()`
 * shape Google and Password use: `sendCode()` triggers the SMS and returns
 * a confirmation handle; `confirmCode()` verifies what the person typed
 * back. js/services/auth.service.js exposes both steps
 * (sendMobileCode()/confirmMobileCode()) for the login screen to drive —
 * a deliberate, disclosed extension of the provider contract, not a break;
 * `signIn()` still exists below so the `{id, signIn, signOut}` shape every
 * other provider has still resolves if something generic ever calls it.
 *
 * Phone Auth identifies a person by phone number only — there is no email
 * anywhere in this flow. Built so a future Parent/Student portal (genuinely
 * phone-only identities, no email at all) can reuse this file unchanged;
 * for NATYAM's own staff/admin roles today, a phone number is only ever a
 * *second* way into an account that already has an email on file — see
 * js/data/users.repository.firestore.js's findByMobile() and
 * auth.service.js's resolveProvisionedUser().
 */

import { auth } from '../../../core/firebase.js';
import {
    RecaptchaVerifier, signInWithPhoneNumber, signOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

/** Must match the fixed, always-present container id in js/modules/auth/login.page.js. */
const RECAPTCHA_CONTAINER_ID = 'mobile-otp-recaptcha';

let verifier = null;

/** One shared invisible reCAPTCHA, created lazily against the login screen's fixed container. */
function recaptcha() {
    if (!verifier) {
        verifier = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, { size: 'invisible' });
    }
    return verifier;
}

export const mobileOtpProvider = {
    id: 'mobile',

    /**
     * @param {string} phoneNumber E.164 format (e.g. +919876543210).
     * @returns {Promise<import('firebase/auth').ConfirmationResult>}
     */
    async sendCode(phoneNumber) {
        if (!phoneNumber) throw new Error('Enter your mobile number.');
        return signInWithPhoneNumber(auth, phoneNumber, recaptcha());
    },

    /**
     * @param {import('firebase/auth').ConfirmationResult} confirmation
     * @param {string} code
     * @returns {Promise<{phoneNumber: string, name: string, provider: 'mobile'}>}
     */
    async confirmCode(confirmation, code) {
        if (!code) throw new Error('Enter the code you received.');
        const { user } = await confirmation.confirm(code);
        return { phoneNumber: user.phoneNumber, name: user.phoneNumber, provider: 'mobile' };
    },

    // OTP is two-step (sendCode()/confirmCode() above), not a single
    // signIn() call — this only exists so the shape every other provider
    // has still resolves if something generic ever reaches for it.
    async signIn() {
        throw new Error('Mobile sign-in uses sendCode()/confirmCode(), not signIn().');
    },

    async signOut() {
        await signOut(auth);
    }
};
