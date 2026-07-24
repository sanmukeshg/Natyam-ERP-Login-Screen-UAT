/**
 * NATYAM ERP 2.0 — Users repository (Firestore)
 *
 * The first store to move off IndexedDB. Deliberately keeps the exact
 * external shape the old IndexedDB-backed UserRepository had
 * (find/findOrFail/all/create/update/remove/findByEmail) so every existing
 * caller — settings.service.js, audit.service.js, auth.service.js, app.js —
 * needed no changes beyond what was already planned.
 *
 * Documents are keyed by the person's normalised email address, not an
 * opaque id and not the Firebase Auth uid. Two reasons:
 *   - An administrator provisions a user by email before that person has
 *     ever signed in, so their future Firebase uid can't be known yet.
 *   - firestore.rules needs a *direct path* to "the caller's own document"
 *     to decide read/write access efficiently — Firestore rules can't run
 *     an arbitrary "find where email = X" query the way client code can.
 *     Keying by email (available on every request via
 *     request.auth.token.email) makes that path always `users/{their email}`.
 */

import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, runTransaction
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firestore } from '../core/firebase.js';
import { session } from '../core/session.js';
import { nowISO } from '../utils/date.js';
import { nextCode } from './sequenceGenerator.firestore.js';

const COLLECTION_NAME = 'users';
const usersCollection = collection(firestore, COLLECTION_NAME);

/** Soft-delete convention, same as the IndexedDB Repository base class. */
function visible(record) {
    return record && !record.deletedAt;
}

/** The doc-id form of an email: trimmed and lowercased, matching firestore.rules' `.lower()`. */
function emailId(email) {
    return String(email || '').trim().toLowerCase();
}

class FirestoreUserRepository {
    /* ---------------------------------------------------------------- READS */

    async find(id) {
        if (!id) return null;
        const snap = await getDoc(doc(firestore, COLLECTION_NAME, id));
        if (!snap.exists()) return null;
        const record = { id: snap.id, ...snap.data() };
        return visible(record) ? record : null;
    }

    async findOrFail(id) {
        if (!id) throw new Error('No user was specified.');
        const record = await this.find(id);
        if (!record) throw new Error(`User ${id} no longer exists.`);
        return record;
    }

    async all({ includeDeleted = false } = {}) {
        const snap = await getDocs(usersCollection);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return includeDeleted ? rows : rows.filter(visible);
    }

    async activeUsers() {
        return (await this.all()).filter((u) => u.status === 'active');
    }

    /** Direct doc lookup — the id *is* the (lowercased) email. */
    async findByEmail(email) {
        return this.find(emailId(email));
    }

    async findByCode(code) {
        const q = String(code || '').trim().toUpperCase();
        if (!q) return null;
        const snap = await getDocs(query(usersCollection, where('userCode', '==', q)));
        if (snap.empty) return null;
        const row = { id: snap.docs[0].id, ...snap.docs[0].data() };
        return visible(row) ? row : null;
    }

    /* --------------------------------------------------------------- WRITES */

    validate(record) {
        if (!record.name?.trim()) throw new Error('A user needs a name.');
        if (!record.email?.trim()) throw new Error('A user needs an email address.');
        if (!record.role) throw new Error('Choose a role.');
    }

    async create(data) {
        this.validate(data);
        const id = emailId(data.email);
        const at = nowISO();
        const actor = session.actorId();

        const record = {
            ...data,
            email: id,
            status: data.status || 'active',
            mobile: data.mobile ?? null,
            loginType: data.loginType || 'Google',
            createdAt: at, createdBy: actor,
            updatedAt: at, updatedBy: actor,
            deletedAt: null
        };
        delete record.id;

        await setDoc(doc(firestore, COLLECTION_NAME, id), record);
        return { id, ...record };
    }

    /**
     * A user's email is their document id, so it cannot be changed in
     * place — Firestore has no document rename. `changes.email` is ignored
     * here rather than silently accepted and then not actually applied.
     */
    async update(id, changes) {
        const existing = await this.findOrFail(id);
        const patch = { ...changes, updatedAt: nowISO(), updatedBy: session.actorId() };
        delete patch.id;
        delete patch.email;

        await updateDoc(doc(firestore, COLLECTION_NAME, id), patch);
        return { ...existing, ...patch, id };
    }

    /** Soft delete, same convention as every other module. */
    async remove(id) {
        await this.findOrFail(id);
        await updateDoc(doc(firestore, COLLECTION_NAME, id), {
            deletedAt: nowISO(),
            deletedBy: session.actorId()
        });
        return true;
    }

    /**
     * One-time exception: if nobody has ever been provisioned, the first
     * person to sign in becomes Administrator — the sole full-access role
     * in the combined role model (Doc 10 §8), not Owner & Accountant, which
     * is deliberately scoped to business/finance only. `meta/bootstrapped`
     * is what firestore.rules checks for the same exception — written
     * inside the same transaction as the user record so two people signing
     * in at the same instant cannot both become Administrator.
     *
     * @throws if a school already has an administrator account (someone
     *   else's sign-in already claimed the bootstrap slot). auth.service.js
     *   treats that exactly like "no matching user record" — the standard
     *   "contact your administrator" rejection.
     */
    async bootstrapAdministrator(data) {
        this.validate(data);
        const id = emailId(data.email);
        const at = nowISO();
        const flagRef = doc(firestore, 'meta', 'bootstrapped');
        const userRef = doc(firestore, COLLECTION_NAME, id);

        const record = {
            ...data,
            email: id,
            role: 'administrator',
            status: 'active',
            mobile: data.mobile ?? null,
            loginType: data.loginType || 'Google',
            createdAt: at, createdBy: id,
            updatedAt: at, updatedBy: id,
            deletedAt: null
        };
        delete record.id;

        await runTransaction(firestore, async (tx) => {
            const flagSnap = await tx.get(flagRef);
            if (flagSnap.exists()) {
                throw new Error('This school already has an administrator account.');
            }
            tx.set(userRef, record);
            tx.set(flagRef, { at, by: id });
        });

        return { id, ...record };
    }

    /** `USR000001`-style code, via the centralized sequence generator (see sequenceGenerator.firestore.js). */
    async nextUserCode() {
        return nextCode('userCode', 'USR');
    }
}

export const users$ = new FirestoreUserRepository();
