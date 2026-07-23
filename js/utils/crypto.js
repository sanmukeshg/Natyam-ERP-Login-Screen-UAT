/**
 * Password hashing.
 *
 * PBKDF2-SHA256 via Web Crypto, salted per user. This is a client-only app
 * with no server to hold a secret, so this gates the login screen rather
 * than providing real security — anyone with the device can read the
 * database or the JS. See js/core/session.js for the fuller note. Hashing
 * still beats a plain-text password field: it stops a casual glance at
 * IndexedDB from handing over a password the person may reuse elsewhere.
 */

import { SESSION } from '../config/app.config.js';

function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function derive(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: SESSION.hashIterations, hash: 'SHA-256' },
        keyMaterial, 256
    );
    return bytesToBase64(new Uint8Array(bits));
}

/** Hashes `password` against a fresh random salt (or a supplied one, for verification). */
export async function hashPassword(password, saltB64 = null) {
    const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt);
    return { hash, salt: bytesToBase64(salt) };
}

/** Recomputes the hash with the stored salt and compares. */
export async function verifyPassword(password, hash, salt) {
    if (!hash || !salt) return false;
    const computed = await derive(password, base64ToBytes(salt));
    return computed === hash;
}
