/**
 * v2.2.2 final stabilization — Sections A, B and C.
 *
 * Section C is verified behaviourally rather than by reading source: a billing
 * engine that "looks right" but bills a future month is exactly the failure
 * this release exists to remove, so the scheduler is actually run, twice, and
 * the resulting invoices are counted.
 */
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const app = (rel) => path.join(HERE, '..', rel);

const dom = new JSDOM('<!doctype html><html data-theme="light"><body><div id="app"></div></body></html>',
    { url: 'https://example.org/natyam/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node,
    Element: window.Element, Event: window.Event, CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent, localStorage: window.localStorage, location: window.location
});
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
window.matchMedia = globalThis.matchMedia;
Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: { estimate: async () => ({ usage: 0, quota: 1 }), persisted: async () => false, persist: async () => true }
});
globalThis.CSS = window.CSS || {};
if (!globalThis.CSS.escape) globalThis.CSS.escape = (v) => String(v).replace(/[^\w-]/g, (c) => `\\${c}`);
window.CSS = globalThis.CSS;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log('  ok  ', name); }
    else { fail++; console.log('  FAIL', name, extra ? `\n         ${extra}` : ''); }
};
const settle = () => new Promise((r) => setTimeout(r, 25));

const BASE = '../js';
const { db } = await import(`${BASE}/core/db.js`);
const { session } = await import(`${BASE}/core/session.js`);
const { seedIfEmpty } = await import(`${BASE}/data/seed.js`);
const { branches$, batches$, students$, invoices$, payments$, attendance$, programs$ } =
    await import(`${BASE}/data/repositories.js`);
const { exposedFeeFrequencies, NAVIGATION } = await import(`${BASE}/config/app.config.js`);
const { createFeePlan, listMasterSet, addMasterEntry, updateMasterEntry,
    setMasterEntryStatus, deleteMasterEntry, moveMasterEntry } = await import(`${BASE}/services/settings.service.js`);
const { enrol, updateStudent } = await import(`${BASE}/services/students.service.js`);
const F = await import(`${BASE}/services/fees.service.js`);
const A = await import(`${BASE}/services/admissions.service.js`);

await db.open();
await seedIfEmpty();
const branches = await branches$.active();
session.hydrate({ user: { id: 'owner', name: 'Principal', role: 'owner' }, branches, activeBranchId: branches[0].id });
const branch = branches[0];
const openBatch = (await batches$.all()).find((b) => b.status === 'active');
const JOIN = '2026-07-22';

/* ========================================================== SECTION A */
console.log('\n== Section A: UAT fixes ==');
{
    const overlaySrc = fs.readFileSync(app('js/ui/overlay.js'), 'utf8');
    const studentsSrc = fs.readFileSync(app('js/modules/students/students.page.js'), 'utf8');
    ok('overlay actions receive a destructured close handler',
        /onClick\(\{[^)]*close/.test(overlaySrc));
    ok('the student drawer no longer hides operations behind an Actions menu',
        !/label: 'Actions'/.test(studentsSrc));
    ok('the drawer offers Edit', /label: 'Edit'/.test(studentsSrc));
    ok('every student operation is reachable directly', /data-profile-action="promote"/.test(studentsSrc));

    const wizardSrc = fs.readFileSync(app('js/ui/wizard.js'), 'utf8');
    ok('wizard steps carry the state the stylesheet keys off', /data-state="\$\{/.test(wizardSrc));
    ok('the current wizard step is scrolled into view', /scrollIntoView/.test(wizardSrc));

    const routerSrc = fs.readFileSync(app('js/core/router.js'), 'utf8');
    ok('a screen opened from the navigation starts at the top', /returningToList/.test(routerSrc));

    const shellSrc = fs.readFileSync(app('js/ui/shell.js'), 'utf8');
    ok('the branch selector is shown whenever a branch exists', /if \(!branches\.length\)/.test(shellSrc));

    const attendanceSrc = fs.readFileSync(app('js/modules/attendance/attendance.page.js'), 'utf8');
    const marks = [...attendanceSrc.slice(attendanceSrc.indexOf('const MARKS'), attendanceSrc.indexOf('const MARKS') + 300)
        .matchAll(/short: '([A-Z])'/g)].map((m) => m[1]);
    ok('attendance offers Present and Absent only', marks.join('') === 'PA', marks.join(','));

    const settingsSrc = fs.readFileSync(app('js/modules/settings/settings.page.js'), 'utf8');
    ok('no annual total is shown beside the monthly fee', !/Year total/.test(settingsSrc));

    const programsSrc = fs.readFileSync(app('js/modules/programs/programs.page.js'), 'utf8');
    ok('the cast picker resolves level labels it imports',
        /levelLabel/.test(programsSrc) && /import \{[^}]*levelLabel/.test(programsSrc));
}

/* ================================================ Section A: batch rule */
console.log('\n== Section A: every enrolled student belongs to a batch ==');
{
    const noClassLevel = 'advanced-theory';
    const offered = await A.eligibleBatches(noClassLevel, branch.id);
    ok('the picker is never empty when a batch is running', offered.length > 0, `${offered.length} offered`);
    ok('at least one offered batch is selectable', offered.some((b) => b.selectable));

    const applicant = await A.submit({
        name: 'Batch Rule', dateOfBirth: '2014-01-01', gender: 'female',
        guardianName: 'G', guardianRelation: 'mother', guardianPhone: '9700000010',
        branchId: branch.id, level: noClassLevel,
        feePlanId: (await createFeePlan({ name: 'QA Batch Rule', amount: 1200 })).id
    });
    await A.beginReview(applicant.id);
    await A.approve(applicant.id);

    let refused = false;
    try { await A.enrolApplicant(applicant.id, {}); } catch { refused = true; }
    ok('enrolling without a batch is refused', refused);

    const enrolled = await A.enrolApplicant(applicant.id, { batchId: offered.find((b) => b.selectable).id });
    ok('enrolling with a chosen batch succeeds', !!enrolled.student.batchId);
}

/* ========================================================== SECTION B */
console.log('\n== Section B: master data lives in Settings ==');
{
    ok('the standalone Curriculum module is gone', !fs.existsSync(app('js/modules/curriculum')));
    const paths = NAVIGATION.flatMap((g) => g.items).map((i) => i.path);
    ok('no Curriculum route remains in the navigation', !paths.includes('/curriculum'), paths.join(','));

    const settingsSrc = fs.readFileSync(app('js/modules/settings/settings.page.js'), 'utf8');
    for (const control of ['master-add', 'master-edit', 'master-toggle', 'master-delete', 'master-move']) {
        ok(`Settings offers ${control.replace('master-', '')}`, settingsSrc.includes(`data-do="${control}"`));
    }
    ok('courses can be created and structured from Settings',
        settingsSrc.includes('data-do="new-course"') && settingsSrc.includes('data-do="structure-course"'));

    // Every set is genuinely editable, end to end.
    for (const set of ['levels', 'programTypes', 'expenseCategories']) {
        const before = await listMasterSet(set);
        await addMasterEntry(set, { label: `QA ${set}` });
        let entries = await listMasterSet(set);
        ok(`${set}: an entry can be added`, entries.length === before.length + 1);

        const added = entries[entries.length - 1];
        await updateMasterEntry(set, added.value, { label: `QA ${set} renamed` });
        entries = await listMasterSet(set);
        ok(`${set}: an entry can be renamed`, entries.some((e) => e.label === `QA ${set} renamed`));

        await setMasterEntryStatus(set, added.value, 'inactive');
        entries = await listMasterSet(set, { includeInactive: false });
        ok(`${set}: an entry can be deactivated`, !entries.some((e) => e.value === added.value));

        await setMasterEntryStatus(set, added.value, 'active');
        await moveMasterEntry(set, added.value, -1);
        entries = await listMasterSet(set);
        ok(`${set}: an entry can be reordered`, entries.findIndex((e) => e.value === added.value) < entries.length - 1);

        await deleteMasterEntry(set, added.value);
        entries = await listMasterSet(set);
        ok(`${set}: an unused entry can be deleted`, !entries.some((e) => e.value === added.value));
    }

    // Nothing reads the frozen constants directly any more.
    const readers = ['js/services/programs.service.js', 'js/modules/programs/programs.page.js',
        'js/services/finance.service.js', 'js/modules/finance/finance.page.js'];
    const hardcoded = readers.filter((f) => /\b(PROGRAM_TYPES|EXPENSE_CATEGORIES)\b/.test(fs.readFileSync(app(f), 'utf8')));
    ok('no module reads hardcoded master data', hardcoded.length === 0, hardcoded.join(', '));
}

/* ========================================================== SECTION C */
console.log('\n== Section C: billing engine ==');
{
    ok('all five approved frequencies are offered',
        ['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time']
            .every((v) => exposedFeeFrequencies().some((f) => f.value === v)),
        exposedFeeFrequencies().map((f) => f.value).join(','));

    // Enrolment raises exactly one cycle, whatever the cadence.
    for (const freq of ['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time']) {
        const plan = await createFeePlan({ name: `QA ${freq}`, amount: 1500, frequency: freq });
        const { student } = await enrol({
            name: `QA ${freq}`, level: openBatch.level, batchId: openBatch.id, branchId: branch.id,
            feePlanId: plan.id, guardianName: 'G', guardianPhone: '9700000011', joinedOn: JOIN
        }, { raiseFees: true });
        const invoices = await invoices$.forStudent(student.id);
        ok(`${freq}: enrolment raises exactly one invoice`, invoices.length === 1, `got ${invoices.length}`);
        ok(`${freq}: the invoice is the plan amount`, invoices[0]?.amount === 1500);
        ok(`${freq}: the invoice carries a period key`, !!invoices[0]?.periodKey, invoices[0]?.periodKey);
    }

    // "Use Fee Plan Default" versus an explicit override.
    const quarterly = await createFeePlan({ name: 'QA Default Check', amount: 3000, frequency: 'quarterly' });
    const { student: defaulted } = await enrol({
        name: 'QA Plan Default', level: openBatch.level, batchId: openBatch.id, branchId: branch.id,
        feePlanId: quarterly.id, guardianName: 'G', guardianPhone: '9700000012', joinedOn: JOIN
    }, { raiseFees: false });
    // Verified through what the school actually sees, not an internal helper.
    let summary = await F.studentFeeSummary(defaulted.id);
    ok('with no override the plan frequency is used',
        summary.billingCycle?.frequency === 'Quarterly', summary.billingCycle?.frequency);

    await updateStudent(defaulted.id, { billingFrequency: 'monthly' });
    summary = await F.studentFeeSummary(defaulted.id);
    ok('an override changes only that student',
        summary.billingCycle?.frequency === 'Monthly', summary.billingCycle?.frequency);

    await updateStudent(defaulted.id, { billingFrequency: '' });
    const cleared = await students$.find(defaulted.id);
    ok('clearing the override stores null, not a blank', cleared.billingFrequency === null);
    summary = await F.studentFeeSummary(defaulted.id);
    ok('clearing the override returns to the plan default',
        summary.billingCycle?.frequency === 'Quarterly', summary.billingCycle?.frequency);

    // Outstanding, future invoices, idempotence.
    const monthly = await createFeePlan({ name: 'QA Outstanding', amount: 1500, frequency: 'monthly' });
    const { student: billed } = await enrol({
        name: 'QA Outstanding', level: openBatch.level, batchId: openBatch.id, branchId: branch.id,
        feePlanId: monthly.id, guardianName: 'G', guardianPhone: '9700000013', joinedOn: JOIN
    }, { raiseFees: true });

    let rows = await invoices$.forStudent(billed.id);
    ok('outstanding equals the one generated invoice',
        rows.reduce((t, i) => t + (i.balance || 0), 0) === 1500,
        String(rows.reduce((t, i) => t + (i.balance || 0), 0)));

    const AS_OF = '2026-10-15';
    await F.runBillingScheduler({ asOf: AS_OF });
    rows = await invoices$.forStudent(billed.id);
    const count = rows.length;
    ok('the scheduler raises the cycles that have fallen due', count === 3, `got ${count}`);
    ok('no invoice is dated in the future', rows.every((i) => i.dueDate <= AS_OF));
    ok('outstanding is the sum of generated unpaid invoices only',
        rows.reduce((t, i) => t + (i.balance || 0), 0) === 1500 * count);

    await F.runBillingScheduler({ asOf: AS_OF });
    ok('running the scheduler again raises nothing',
        (await invoices$.forStudent(billed.id)).length === count);
}

/* ============================================ history and migration safety */
console.log('\n== History is preserved ==');
{
    const invoicesBefore = await invoices$.all();
    const paymentsBefore = await payments$.all();
    const paidBefore = invoicesBefore.filter((i) => i.paidAmount > 0)
        .map((i) => ({ id: i.id, amount: i.amount, paidAmount: i.paidAmount, status: i.status }));
    const studentsBefore = (await students$.all()).length;
    const attendanceBefore = (await attendance$.all()).length;

    await F.runBillingScheduler({ asOf: '2026-12-31' });

    const paymentsAfter = await payments$.all();
    ok('no payment is added, removed or altered',
        paymentsAfter.length === paymentsBefore.length
        && paymentsAfter.reduce((t, p) => t + p.amount, 0) === paymentsBefore.reduce((t, p) => t + p.amount, 0));

    const invoicesAfter = await invoices$.all();
    const altered = paidBefore.filter((old) => {
        const now = invoicesAfter.find((i) => i.id === old.id);
        return !now || now.amount !== old.amount || now.paidAmount !== old.paidAmount || now.status !== old.status;
    });
    ok('settled invoices are left exactly as they were', altered.length === 0, `${altered.length} altered`);
    ok('legacy invoices without a period key are still recognised',
        invoicesAfter.some((i) => !i.periodKey));
    ok('no student record is lost', (await students$.all()).length >= studentsBefore);
    ok('no attendance record is lost', (await attendance$.all()).length === attendanceBefore);
}

console.log(`\nv2.2.2 final: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
