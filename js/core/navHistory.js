/**
 * NATYAM ERP 2.0 — Navigation history
 *
 * A single, tiny piece of state: the full path (with query string) of the
 * route the app was on immediately before the current one. Not a full stack
 * — one entry is all a "Back" button that means "wherever I actually came
 * from" needs, and a bigger history mechanism belongs in the Router itself
 * if a second use ever asks for it, not bolted on here speculatively.
 *
 * Deliberately outside the Router class: this only ever reads route:done,
 * a router already emits and always has, so no change to that shared,
 * heavily-used core file is needed to add this.
 *
 * In-memory only. A full page reload starts this over — "Back" falls back
 * to its caller's own default in that case, which is the right behaviour:
 * there is genuinely no previous in-app screen to return to.
 */

import { bus, EVENTS } from './bus.js';

let previous = null;
let current = null;

bus.on(EVENTS.ROUTE_DONE, ({ path, query }) => {
    const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
    const full = `${path}${qs}`;
    if (full === current) return; // re-resolving the same route is not a navigation
    previous = current;
    current = full;
});

/** The full path (with query string) of the screen before this one, or null. */
export function previousPath() {
    return previous;
}
