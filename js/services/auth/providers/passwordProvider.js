/**
 * NATYAM ERP 2.0 — Email/Password AuthenticationProvider
 *
 * The one file that touches Firebase's Email/Password sign-in mechanics —
 * same role for this provider that googleProvider.js has for Google.
 * Firebase's own servers verify the credential; this app never sees,
 * stores, hashes, or compares a password. This is deliberately not a
 * repeat of ADR-014's removed local-password design (PBKDF2, verified
 * client-side against IndexedDB) — that was "a UI gate, not a real
 * security boundary"; this one has the same server-side trust model
 * Google Sign-In already does.
 */

import { auth } from '../../../core/firebase.js';
import { firebaseConfig } from '../../../config/firebase.config.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
    getAuth, signInWithEmailAndPassword, signOut,
    sendPasswordResetEmail, createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

export const passwordProvider = {
    id: 'password',

    /**
     * @param {{email: string, password: string}} credentials
     * @returns {Promise<{email: string, name: string, providerUid: string, provider: 'password'}>}
     */
    async signIn({ email, password } = {}) {
        if (!email || !password) throw new Error('Enter your email and password.');
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        return {
            email: user.email,
            name: user.displayName || user.email,
            providerUid: user.uid,
            provider: 'password'
        };
    },

    async signOut() {
        await signOut(auth);
    },

    /** "Forgot password?" — Firebase emails a reset link; the new password is never seen by this app. */
    async sendReset(email) {
        await sendPasswordResetEmail(auth, email);
    },

    /**
     * Administrator-side account creation. createUserWithEmailAndPassword()
     * signs in as the newly created user in whatever Auth instance it's
     * called against — calling it against the app's own shared `auth`
     * would hijack the Administrator's own active session. A second,
     * throwaway Firebase App instance isolates that side effect entirely:
     * it shares the same project/config but has its own independent Auth
     * state, and is discarded the moment this function returns. This is
     * the standard client-SDK-only pattern for "an admin creates another
     * user" without a backend (no Cloud Functions/Admin SDK exist in this
     * project — see ADR-014 §5).
     *
     * Sends a password-reset email immediately after creation so the new
     * person's first real action is choosing their own password, rather
     * than using an administrator-assigned one indefinitely.
     *
     * @param {{email: string, password: string}} account
     */
    async provisionAccount({ email, password }) {
        const provisioningApp = initializeApp(firebaseConfig, `provisioning-${Date.now()}`);
        const provisioningAuth = getAuth(provisioningApp);
        try {
            await createUserWithEmailAndPassword(provisioningAuth, email, password);
            await sendPasswordResetEmail(provisioningAuth, email);
        } finally {
            await deleteApp(provisioningApp);
        }
    }
};
