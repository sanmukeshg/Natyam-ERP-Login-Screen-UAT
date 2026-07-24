/**
 * NATYAM ERP 2.0 — Mobile+OTP AuthenticationProvider (placeholder)
 *
 * Not implemented in this milestone — no SMS gateway, no Twilio, no
 * Firebase Phone Authentication. This file exists so AuthenticationService
 * and the login screen have a real second provider to route to now, and so
 * a future milestone can replace just this file's signIn()/signOut() with
 * working OTP logic without touching AuthenticationService, the provider
 * registry, or the login screen above it.
 */

export const mobileOtpProvider = {
    id: 'mobile',

    async signIn() {
        throw new Error('Mobile sign-in is not available yet. Please continue with Google.');
    },

    async signOut() {
        // Nothing to sign out of — signIn() can never have succeeded.
    }
};
