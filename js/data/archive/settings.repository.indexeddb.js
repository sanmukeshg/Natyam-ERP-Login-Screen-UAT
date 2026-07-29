/**
 * ARCHIVED — IndexedDB-backed settings$ key-value store.
 *
 * Replaced by js/data/settings.repository.firestore.js. This was the last
 * IndexedDB holdout after the 24-entity Firestore migration — institute
 * details and every document-numbering sequence (admission/application/
 * invoice/receipt/certificate) were being read and written locally, per
 * browser, meaning two devices used by the same school could silently
 * issue the same admission number or show two different addresses on a
 * receipt. Kept here for reference only; not imported anywhere.
 */

import { db, request } from '../../core/db.js';

export const settings$ = {
    async get(key, fallback = null) {
        const row = await db.get('settings', key);
        return row ? row.value : fallback;
    },

    async set(key, value) {
        await db.put('settings', { key, value, updatedAt: new Date().toISOString() });
        return value;
    },

    async all() {
        const rows = await db.all('settings');
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    /**
     * Atomic counter for human-facing numbers (NAT/INV/2026/0417). Read and
     * increment happen inside one transaction so two receipts written in the
     * same tick cannot collide — 1.0 read the count of existing rows, which
     * reused a number as soon as anything was deleted.
     */
    async nextSequence(name, count = 1) {
        let allocated = 0;
        await db.unit(['settings'], async (s) => {
            const row = await request(s.settings.get('sequences'));
            const map = { ...(row?.value || {}) };
            const current = Number(map[name]) || 0;
            allocated = current + 1;
            map[name] = current + count;
            await request(s.settings.put({ key: 'sequences', value: map, updatedAt: new Date().toISOString() }));
        }, 'settings:sequence');
        return allocated;
    }
};
