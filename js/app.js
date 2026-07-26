/**
 * NATYAM ERP 2.0 — Bootstrap
 *
 * Start-up in a fixed order, because each step depends on the last:
 *
 *   1. Paint the theme before anything else. Reading the preference from
 *      localStorage is synchronous, so the first frame is already correct;
 *      waiting for IndexedDB here produces a white flash then a dark app.
 *   2. Open the (still-IndexedDB) database and run migrations, seed if
 *      empty, apply structural overrides — every module except Auth and
 *      Users is on IndexedDB in this phase.
 *   3. Subscribe once to Firebase's onAuthStateChanged. Its callback,
 *      handleAuthStateChange(), is the single place that decides what a
 *      signed-in (or signed-out) Firebase user means for this app — it
 *      runs identically whether the user just restored an existing session
 *      on reload or just finished a fresh Google sign-in, so there is
 *      exactly one path instead of two that could drift apart.
 *   4. Once a Firebase user is both authenticated *and* provisioned
 *      (resolveProvisionedUser, in auth.service.js), hydrate the session
 *      and mount the Shell and router.
 *   5. *Then* run maintenance: sweeping overdue invoices and recomputing
 *      alerts. Deliberately last and not awaited by the render path — the
 *      school should see its dashboard immediately, not wait on a sweep of
 *      last term's invoices.
 *
 * Anything that fails while opening the local database is fatal and gets an
 * honest screen with the actual error, because "something went wrong" in an
 * app with no telemetry leaves the user with nothing to tell anyone.
 */

import { db } from './core/db.js';
import { session } from './core/session.js';
import { router, Router } from './core/router.js';
import { bus, EVENTS } from './core/bus.js';
import { ROUTES, SESSION } from './config/app.config.js';
import { Shell, applyTheme, applyDensity } from './ui/shell.js';
import { PortalShell, PORTAL_NAVIGATION } from './ui/portalShell.js';
import { commandPalette } from './ui/palette.js';
import { toast } from './ui/toast.js';
import { seedIfEmpty } from './data/seed.js';
import { applyStructuralOverrides } from './services/settings.service.js';
import { branches$, drafts$, notifications$ } from './data/repositories.js';
import { sweepOverdue, runBillingScheduler } from './services/fees.service.js';
import { refreshAlerts } from './services/notifications.service.js';
import { renderLogin } from './modules/auth/login.page.js';
import { watchAuthState } from './core/firebase.js';
import { resolveProvisionedUser, expireSession, acknowledgeRemoteSignOut } from './services/auth.service.js';
import { resolveGuardianIdentity, guardianSession } from './services/portal/guardianAuth.service.js';

/**
 * Milestone P1's Parent/Student Portal — the six read-only pages, each a
 * default export matching every staff page's shape (Page subclass with
 * render()). Lazy-imported the same way ROUTES' staff pages are, so a
 * guardian's tab never downloads a single staff module and vice versa.
 */
const PORTAL_PAGES = {
    '/portal': () => import('./modules/portal/overview.page.js'),
    '/portal/timetable': () => import('./modules/portal/timetable.page.js'),
    '/portal/attendance': () => import('./modules/portal/attendance.page.js'),
    '/portal/programmes': () => import('./modules/portal/programmes.page.js'),
    '/portal/certificates': () => import('./modules/portal/certificates.page.js'),
    '/portal/fees': () => import('./modules/portal/fees.page.js')
};

// A one-shot flag carried across the reload that follows an idle sign-out,
// so the login screen can explain why the person is looking at it. Session
// storage rather than a query string: it must not survive a deliberate
// close-and-reopen the way Firebase's own session is allowed to.
const LOGOUT_REASON_KEY = 'natyam.logoutReason';

/** Set once the Shell/router/idle-timer are actually running — see handleAuthStateChange(). */
let appEntered = false;

/** A provisioning rejection's message, threaded through to the next showLoginScreen() call. */
let pendingLoginMessage = null;

async function boot() {
    const prefs = session.prefs();
    applyTheme(prefs.theme);
    applyDensity(prefs.density);

    try {
        await db.open();
        await seedIfEmpty();
        await applyStructuralOverrides();   // installs any edited curriculum/roles; a no-op until one exists
    } catch (err) {
        console.error('Start-up failed', err);
        showFatal(err);
        return;
    }

    watchAuthState(handleAuthStateChange);
}

/**
 * Fires once at boot (with any Firebase session restored from a previous
 * visit, or null) and again on every sign-in and sign-out after that.
 */
async function handleAuthStateChange(firebaseUser) {
    if (!firebaseUser) {
        if (appEntered) {
            // Another tab signed out (or this one hit an idle timeout that
            // already ran expireSession() itself) — either way, Firebase now
            // reports signed-out here too. If it was a different tab, this
            // tab's own Firestore session record (tracked only in its own
            // sessionStorage) was never told to close; best-effort close it
            // before the reload that's about to tear everything else down.
            acknowledgeRemoteSignOut().catch(() => {});

            // The Shell, router and idle-timer are already running — a
            // reload is what actually tears all of that down cleanly, the
            // same "just reload" pattern router.js's own fatal/error views
            // already use, rather than hand-rolled teardown here.
            location.reload();
            return;
        }
        session.destroySession();
        guardianSession.destroySession();
        showLoginScreen();
        return;
    }

    try {
        const user = await resolveProvisionedUser(firebaseUser);
        await hydrateSession(user);
        appEntered = true;
        await enterApp();
    } catch (err) {
        // Milestone P1 — Parent/Student Portal: tried only for a genuinely
        // unrecognised identity (err.code === 'not_provisioned', set by
        // auth.service.js), never for an archived/inactive/method-not-
        // permitted rejection above — those are real staff accounts being
        // correctly turned away, not "maybe a guardian." Also never reached
        // for the one-time bootstrap-Administrator path, since that
        // succeeds (no error) on a genuinely empty `users` collection.
        if (err.code === 'not_provisioned') {
            const guardian = await resolveGuardianIdentity(firebaseUser).catch(() => null);
            if (guardian) {
                guardianSession.hydrate(guardian);
                appEntered = true;
                await enterPortal();
                return;
            }
        }

        // Not provisioned, inactive, or archived, and not a guardian either.
        // Sign the Firebase user back out — that re-fires this function
        // with null, which shows the login screen again; this is what it
        // reads to explain why.
        pendingLoginMessage = err.message;
        await expireSession().catch(() => {});
    }
}

/**
 * Every protected page requires a signed-in, provisioned user (Milestone 1
 * + Phase A). Rendered standalone, outside the Shell and router — there is
 * nothing to protect yet, so there is nothing for the router to gate.
 */
function showLoginScreen() {
    document.querySelector('#boot')?.remove();

    const message = pendingLoginMessage;
    pendingLoginMessage = null;
    renderLogin(document.querySelector('#app'), { initialError: message });

    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) {
        sessionStorage.removeItem(LOGOUT_REASON_KEY);
        if (reason === 'idle') toast.info('Signed out', 'You were signed out after a period of inactivity.');
    }
}

async function enterApp() {
    const root = document.querySelector('#app');
    const shell = new Shell(root);
    const viewport = shell.mount();

    commandPalette();               // registers Ctrl-K for the life of the app
    registerRoutes();
    router.mount(viewport).start();

    document.querySelector('#boot')?.remove();
    bus.emit(EVENTS.APP_READY);

    // Preferences can change on any screen; the shell is the only thing that
    // needs to react, so it is handled once here rather than in every page.
    bus.on(EVENTS.PREFS_CHANGED, ({ key, value }) => {
        if (key === 'theme') applyTheme(value);
        if (key === 'density') applyDensity(value);
    });

    watchIdleSession();
    maintenance();
}

/**
 * Milestone P1 — Parent/Student Portal. Mirrors enterApp()'s structure but
 * mounts PortalShell on a fresh Router instance instead of the shared staff
 * `router` singleton — a guardian session has no `users` doc, so the staff
 * router's own live-status re-check (users$.find(...)) would fail every
 * navigation; this Router supplies guardianSession.stillValid() instead
 * (see js/core/router.js's pluggable `revalidate`). No command palette, no
 * idle-timer, no maintenance sweep — those are staff/ops concerns the
 * portal has no need of.
 */
async function enterPortal() {
    const root = document.querySelector('#app');
    const portalRouter = new Router({ revalidate: () => guardianSession.stillValid() });
    const shell = new PortalShell(root, { router: portalRouter });
    const viewport = shell.mount();

    for (const item of PORTAL_NAVIGATION) {
        portalRouter.register(item.path, { load: PORTAL_PAGES[item.path], title: item.label });
    }

    portalRouter.mount(viewport).start();

    document.querySelector('#boot')?.remove();
    bus.emit(EVENTS.APP_READY);
}

/**
 * Idle timeout. Real activity renews the session (`session.touch()`); a
 * periodic check notices once it has lapsed and ends it via Firebase
 * sign-out — handleAuthStateChange() picks that up and reloads.
 */
function watchIdleSession() {
    let lastTouch = 0;
    const markActivity = () => {
        const now = Date.now();
        if (now - lastTouch < 15000) return;   // at most one write per ~15s
        lastTouch = now;
        session.touch();
    };
    ['click', 'keydown', 'mousemove', 'scroll'].forEach((type) =>
        window.addEventListener(type, markActivity, { passive: true }));

    setInterval(() => {
        if (session.isIdleFor(SESSION.idleTimeoutMs)) {
            sessionStorage.setItem(LOGOUT_REASON_KEY, 'idle');
            expireSession().catch((err) => console.error('Idle sign-out failed', err));
        }
    }, 60000);
}

function registerRoutes() {
    for (const route of ROUTES) {
        router.register(route.path, {
            load: route.load,
            cap: route.cap,
            title: route.label
        });

        // Detail routes are registered alongside their list route so a page can
        // own both /students and /students/:id without a second config entry.
        //
        // The root route is excluded deliberately. Appending '/:id' to '/' does
        // not produce '//:id' — it produces '/:id', a single-segment catch-all
        // that matches /students, /fees and every other top-level path. Because
        // the dashboard is registered first and the matcher takes the first
        // hit, that one pattern silently routed fifteen of sixteen screens to
        // the dashboard: the URL changed, the sidebar highlighted, nothing
        // errored, and the content never moved. The dashboard has no detail
        // view, so there is nothing to register.
        if (route.detail !== false && route.path !== '/') {
            router.register(`${route.path}/:id`, {
                load: route.load,
                cap: route.cap,
                title: route.label
            });
        }
    }
}

/**
 * @param {object} user  The provisioned Firestore user record (see auth.service.js).
 */
async function hydrateSession(user) {
    // Isolated from resolveProvisionedUser()'s own failure mode on purpose.
    // handleAuthStateChange()'s outer catch treats any error here as "not
    // provisioned, inactive, or archived" and signs the person back out —
    // correct for a real provisioning rejection, wrong for a branches read
    // that merely failed (a permission-denied mid-rules-propagation, a
    // dropped connection). `user` is already known-good at this point; the
    // person should see the app, degraded, and be told what happened —
    // not be bounced to the login screen with a misleading message.
    let branches = [];
    try {
        branches = await branches$.active();
    } catch (err) {
        console.error('Could not load branches at sign-in', err);
        toast.error(`Could not load your branches — ${err.message}. Reload to try again.`);
    }

    // session.hydrate remembers the previously selected branch itself, so no
    // branch id is passed here — passing one would override the user's choice
    // on every reload.
    session.hydrate({ user, branches, activeBranchId: null });
}

/**
 * Housekeeping that must happen but must not delay the first paint. Each step
 * is isolated: a failure to prune drafts should not stop overdue invoices from
 * being marked.
 */
async function maintenance() {
    const tasks = [
        // Raise any billing cycle that has fallen due since the app was last
        // opened. It only ever creates invoices that are already payable, and
        // is safe to run on every start.
        ['raising due invoices', () => runBillingScheduler()],
        ['sweeping overdue invoices', () => sweepOverdue()],
        ['recomputing alerts', () => refreshAlerts({ branchId: session.branch() })],
        ['pruning old drafts', () => drafts$.prune?.(30)],
        ['pruning notifications', () => notifications$.prune?.(200)]
    ];

    for (const [what, run] of tasks) {
        try {
            await run();
        } catch (err) {
            console.warn(`Maintenance step failed while ${what}`, err);
        }
    }
}

function showFatal(err) {
    const root = document.querySelector('#app') || document.body;
    root.innerHTML = `
        <div class="fatal">
            <h1>NATYAM could not start</h1>
            <p>The school's database could not be opened in this browser.</p>
            <pre>${String(err?.message || err)}</pre>
            <p class="type-caption">
                This usually means the browser is in private mode, storage is
                full, or the site is open in another tab performing an upgrade.
                Close other tabs and reload. If you have a backup file, a fresh
                browser profile can be restored from it.
            </p>
            <button onclick="location.reload()">Reload</button>
        </div>
    `;
}

/* Unhandled failures anywhere in the app surface as a toast rather than a
   silent console entry nobody in a dance school will ever open. */
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection', event.reason);
    toast?.error?.(event.reason?.message || 'Something failed unexpectedly.');
});

boot();
