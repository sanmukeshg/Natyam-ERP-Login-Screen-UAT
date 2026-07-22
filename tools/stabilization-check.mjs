/**
 * v2.2.1 stabilization verification.
 *
 * Why this file exists
 * --------------------
 * Every suite passed on v2.2.0 while manual testing found eight defects. The
 * reason is that jsdom implements no CSS cascade: loading the real stylesheets
 * and asking for a computed style returns the browser default for everything.
 * A test could therefore confirm an element existed and learn nothing about
 * whether it was visible, styled or usable.
 *
 * So the control checks below parse the stylesheet as text and assert that a
 * rule actually exists for the class each control emits — in particular that a
 * checked state is reachable. That is the class of failure that let invisible
 * radio buttons ship twice.
 *
 * The remaining checks exercise the service and form layers for the eight
 * approved issues.
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
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
window.matchMedia = globalThis.matchMedia;
globalThis.localStorage = window.localStorage;
globalThis.location = window.location;
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
const settle = () => new Promise((r) => setTimeout(r, 20));

const CSS_DIR = app('assets/css');
const styles = fs.readdirSync(CSS_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8'))
    .join('\n');

/** Does a selector matching all of these class fragments exist in the CSS? */
const hasRule = (...fragments) => styles
    .split('}')
    .some((block) => {
        const selector = block.split('{')[0];
        return fragments.every((f) => selector.includes(f));
    });

const BASE = '../js';
const { db } = await import(`${BASE}/core/db.js`);
const { session } = await import(`${BASE}/core/session.js`);
const { seedIfEmpty } = await import(`${BASE}/data/seed.js`);
const { branches$, curriculumLevels$, feePlans$, students$ } = await import(`${BASE}/data/repositories.js`);
const { field } = await import(`${BASE}/ui/form.js`);
const { render } = await import(`${BASE}/utils/dom.js`);
const { enrol, profile } = await import(`${BASE}/services/students.service.js`);
const { listFeePlans, createFeePlan } = await import(`${BASE}/services/settings.service.js`);
const { raiseSchedule } = await import(`${BASE}/services/fees.service.js`);
const { createBatch } = await import(`${BASE}/services/batches.service.js`);

await db.open();
await seedIfEmpty();
const branches = await branches$.active();
session.hydrate({ user: { id: 'owner', name: 'Principal', role: 'owner' }, branches, activeBranchId: null });

/* ============================================================ CONTROL STYLING
   Issue 4 — the decorative element a control emits must be reachable by a rule
   that gives it a box AND a rule that shows a checked state. */
console.log('\n== Form controls have real, reachable styling ==');
{
    const markup = (config) => {
        const holder = window.document.createElement('div');
        render(holder, field(config));
        return holder;
    };

    const radio = markup({ name: 'r', label: 'R', type: 'radio', value: 'a',
        options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    const radioSpan = radio.querySelector('label.check > span[aria-hidden]');
    const radioClasses = radioSpan ? radioSpan.className.split(/\s+/) : [];

    ok('radio emits a decorative element', !!radioSpan);
    ok('radio carries the styled base class (.check-box)',
        radioClasses.includes('check-box'),
        `emitted "${radioClasses.join(' ')}" — without .check-box it has no size, border or checked state`);
    ok('a checked rule exists for the radio class it emits',
        radioClasses.some((c) => hasRule(':checked', `.${c}`)),
        'no ":checked + .<class>" rule matches — selection can never be shown');

    const checkbox = markup({ name: 'c', label: 'C', type: 'checkbox', value: true });
    const checkboxSpan = checkbox.querySelector('label.check > span[aria-hidden]');
    ok('checkbox carries the styled base class',
        checkboxSpan?.className.includes('check-box'), checkboxSpan?.className);
    ok('a checked rule exists for the checkbox class',
        hasRule(':checked', '.check-box'));

    const group = markup({ name: 'g', label: 'G', type: 'checkbox-group', value: ['Mon'],
        options: [{ value: 'Mon', label: 'Monday' }, { value: 'Tue', label: 'Tuesday' }] });
    const groupSpans = [...group.querySelectorAll('span[aria-hidden]')];
    ok('checkbox-group emits one styled control per option',
        groupSpans.length === 2 && groupSpans.every((s) => s.className.includes('check-box')));
    ok('checkbox-group reflects the pre-selected value',
        group.querySelector('input[value="Mon"]')?.hasAttribute('checked'));

    const toggle = markup({ name: 's', label: 'S', type: 'switch', value: true });
    const track = toggle.querySelector('span.switch-track');
    ok('switch emits a track element', !!track);
    ok('a checked rule exists for the switch track', hasRule(':checked', '.switch-track'));

    // The visually-hidden input must be contained by its label, or it is
    // positioned against some distant ancestor.
    ok('.check establishes a positioning context for its hidden input',
        hasRule('.check') && /\.check\s*\{[^}]*position:\s*relative/.test(styles));
    ok('.switch establishes a positioning context for its hidden input',
        /\.switch\s*\{[^}]*position:\s*relative/.test(styles));
}

/* ================================================================= ISSUE 7
   Attendance tones must each have a visible active rule on both renderings. */
console.log('\n== Issue 7: attendance marks have colour rules ==');
{
    const src = fs.readFileSync(app('js/modules/attendance/attendance.page.js'), 'utf8');
    const tones = [...src.matchAll(/tone:\s*'([a-z]+)'/g)].map((m) => m[1]);
    // Late and Excused were retired at the academy's request; P and A remain.
    ok('attendance declares the two marks the academy uses',
        tones.length === 2 && tones.includes('positive') && tones.includes('negative'), tones.join(','));
    tones.forEach((tone) => {
        ok(`tone "${tone}" has an active button rule`,
            hasRule('.mark-btn', 'is-active', `"${tone}"`));
        ok(`tone "${tone}" has a month-grid dot rule`,
            hasRule('.mark-dot', `"${tone}"`));
    });
    ok('marking applies the active class immediately (no reload)',
        /classList\.toggle\('is-active'/.test(src));
}

/* ================================================================= ISSUE 1 */
console.log('\n== Issue 1: student CRUD is reachable from the list ==');
{
    const StudentsPage = (await import(`${BASE}/modules/students/students.page.js`)).default;
    const container = window.document.createElement('div');
    const page = new StudentsPage({ params: {}, query: {}, container });
    await page.render(container);
    await settle();

    const acts = [...container.querySelectorAll('[data-student-act]')].map((b) => b.dataset.studentAct);
    ok('rows expose a View action', acts.includes('view'), acts.join(','));
    ok('rows expose an Edit action', acts.includes('edit'), acts.join(','));
    ok('rows expose an Archive (or Restore) action',
        acts.includes('archive') || acts.includes('restore'), acts.join(','));
    ok('the profile drawer remains available', typeof page.openProfile === 'function');
}

/* ================================================================= ISSUE 6 */
console.log('\n== Issue 6: branch is selectable wherever it is required ==');
{
    const StudentsPage = (await import(`${BASE}/modules/students/students.page.js`)).default;
    const page = new StudentsPage({ params: {}, query: {}, container: window.document.createElement('div') });
    const fields = await page.studentFields();
    const branch = fields.find((f) => f.name === 'branchId');
    ok('student form offers a Branch field', !!branch);
    ok('Branch is required in the student form', branch?.required === true);
    ok('Branch defaults so a single-branch school need not choose', !!branch?.value);

    // The repository requires a branch; enrolling without a batch must work.
    const created = await enrol({
        name: 'Branch Field Check', level: 'foundation-1', branchId: branches[0].id,
        guardianName: 'G', guardianPhone: '9000000001'
    }, { raiseFees: false });
    ok('a student can be enrolled with no batch when a branch is given',
        !!created.student.id && created.student.branchId === branches[0].id);

    const BatchesPage = (await import(`${BASE}/modules/batches/batches.page.js`)).default;
    const bp = new BatchesPage({ params: {}, query: {}, container: window.document.createElement('div') });
    const batchFields = await bp.batchFields();
    ok('batch form offers a Branch field', !!batchFields.find((f) => f.name === 'branchId'));
}

/* ================================================================= ISSUE 5 */
console.log('\n== Issue 5: batch days select, validate, save and edit ==');
{
    const BatchesPage = (await import(`${BASE}/modules/batches/batches.page.js`)).default;
    const bp = new BatchesPage({ params: {}, query: {}, container: window.document.createElement('div') });
    const fields = await bp.batchFields();
    const days = fields.find((f) => f.name === 'days');
    const code = fields.find((f) => f.name === 'code');

    ok('days is a checkbox-group with seven options',
        days?.type === 'checkbox-group' && days.options.length === 7);
    ok('every day option has a readable label',
        days.options.every((o) => o.label && o.label !== o.value),
        JSON.stringify(days.options.map((o) => o.label)));
    ok('code is required in the form, matching the service rule', code?.required === true);

    const { batch } = await createBatch({
        name: 'Stabilisation Batch', code: 'STB-1', branchId: branches[0].id, level: 'foundation-1',
        days: ['Mon', 'Wed'], startTime: '17:00', endTime: '18:00', startsOn: '2026-06-01'
    }, { allowConflicts: true });
    ok('a batch saves with the days chosen', JSON.stringify(batch.days) === JSON.stringify(['Mon', 'Wed']));

    // Edit path: the stored values must match the option values, or nothing
    // appears ticked when the form reopens.
    const editFields = await bp.batchFields(batch);
    const editDays = editFields.find((f) => f.name === 'days');
    const optionValues = editDays.options.map((o) => String(o.value));
    ok('stored days match the option values on edit',
        batch.days.every((d) => optionValues.includes(String(d))),
        `stored ${JSON.stringify(batch.days)} vs options ${JSON.stringify(optionValues)}`);
}

/* ================================================================= ISSUE 3 */
console.log('\n== Issue 3: Level / Qualification defaults ==');
{
    const levels = await curriculumLevels$.ordered();
    const names = levels.map((l) => l.name);
    const expected = [
        'Foundation - Level 1', 'Foundation - Level 2', 'Foundation - Level 3', 'Foundation - Level 4',
        'Foundation - Level 5', 'Foundation - Level 6', 'Foundation - Level 7', 'Foundation - Level 8',
        'Intermediate - Certificate', 'Intermediate - Diploma',
        'Advanced - Masters', 'Advanced - Theory', 'Advanced - Practical'
    ];
    ok('all thirteen approved levels are seeded',
        expected.every((n) => names.includes(n)),
        expected.filter((n) => !names.includes(n)).join(', ') || '');
    ok('they form a single flat list (no grouping field on the record)',
        levels.every((l) => !('group' in l) && !('prefix' in l)));
    ok('placeholder levels are gone', !names.includes('Beginner'));
    ok('the list is ordered as approved',
        names.indexOf('Foundation - Level 1') < names.indexOf('Intermediate - Certificate') &&
        names.indexOf('Intermediate - Certificate') < names.indexOf('Advanced - Masters'));

    // Levels are maintained as Settings master data — one list, editable.
    const { listMasterSet, addMasterEntry, updateMasterEntry, deleteMasterEntry } =
        await import(`${BASE}/services/settings.service.js`);
    const set = await listMasterSet('levels');
    const first = set[0];
    await updateMasterEntry('levels', first.value, { label: 'Renamed For QA' });
    ok('a level can be renamed from Settings',
        (await listMasterSet('levels')).some((e) => e.label === 'Renamed For QA'));
    await updateMasterEntry('levels', first.value, { label: first.label });
    await addMasterEntry('levels', { label: 'Advanced - Research' });
    ok('a level can be added without a code change',
        (await listMasterSet('levels')).some((e) => e.label === 'Advanced - Research'));
    await deleteMasterEntry('levels', 'advanced-research');
}

/* ================================================================= ISSUE 2 */
console.log('\n== Issue 2: monthly fee structure ==');
{
    const plans = await listFeePlans();
    ok('fee plans expose a monthly amount', plans.every((p) => typeof p.amount === 'number' && p.amount > 0));
    ok('fee plans carry a frequency', plans.every((p) => !!p.frequency));
    ok('seeded plans are monthly', plans.every((p) => p.frequency === 'monthly'));
    // A projected yearly figure was being read as money owed, so it is gone.
    ok('no yearly total is presented alongside the monthly fee',
        plans.every((p) => p.yearlyTotal === undefined));

    const created = await createFeePlan({ name: 'Stabilisation Plan', level: 'foundation-1', amount: 150000 });
    ok('a plan can be created with a monthly amount', created.amount === 150000 && created.frequency === 'monthly');

    // Legacy plan (yearly, pre-migration shape) must still resolve.
    const legacy = await feePlans$.create({ name: 'Legacy Yearly', level: 'foundation-5', annualAmount: 1200000 });
    ok('a legacy yearly plan converts to a monthly amount', legacy.amount === 100000, `got ${legacy.amount}`);

    // Schedule generation is monthly and driven by the frequency table.
    const student = await enrol({
        name: 'Monthly Fee Check', level: 'foundation-1', branchId: branches[0].id,
        guardianName: 'G', guardianPhone: '9000000002', feePlanId: created.id
    }, { raiseFees: false });
    // The billing engine now raises only the cycle a student is in; the rest
    // are raised by the scheduler as they fall due.
    const schedule = await raiseSchedule(student.student.id, { feePlanId: created.id });
    ok('enrolment raises exactly one billing cycle', schedule.invoices.length === 1, `got ${schedule.invoices.length}`);
    ok('the invoice is the plan amount',
        schedule.invoices.every((i) => i.amount === 150000));
    ok('the invoice names the period it covers',
        schedule.invoices.every((i) => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|Quarter|Half-year|Year|One-time/.test(i.description)),
        schedule.invoices[0]?.description);

    // No yearly terminology remains in what a user reads.
    const uiFiles = ['js/modules/settings/settings.page.js', 'js/modules/students/students.page.js',
        'js/modules/admissions/admissions.page.js'];
    const uiText = uiFiles.map((f) => fs.readFileSync(app(f), 'utf8')).join('\n');
    ok('no "instalment" wording remains in fee UI', !/instalment/i.test(uiText));
    ok('no "Fee for the year" wording remains', !/Fee for the year/i.test(uiText));

    // Extensibility: a future frequency is a config change, not a redesign.
    const config = fs.readFileSync(app('js/config/app.config.js'), 'utf8');
    ok('a frequency registry exists with future cadences declared',
        /quarterly/.test(config) && /half_yearly/.test(config) && /periodsPerYear/.test(config));
    const { exposedFeeFrequencies } = await import(`${BASE}/config/app.config.js`);
    // All five approved cadences are now offered on a fee plan.
    const exposed = exposedFeeFrequencies().map((f) => f.value);
    ok('all five approved billing frequencies are offered',
        ['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time'].every((v) => exposed.includes(v)),
        exposed.join(','));
}

/* ================================================================= ISSUE 8 */
console.log('\n== Issue 8: settings editability ==');
{
    const src = fs.readFileSync(app('js/modules/settings/settings.page.js'), 'utf8');
    const panel = (name) => {
        // Match the method definition, not the reference in the builders map.
        const match = new RegExp(`(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`, 'g');
        let start = -1, hit;
        while ((hit = match.exec(src)) !== null) start = hit.index;
        return start === -1 ? '' : src.slice(start, start + 6000);
    };
    ok('institute details are editable', /data-do="edit-institute"/.test(panel('institutePanel')));
    ok('the current academic year is settable', /data-do="set-year"/.test(panel('institutePanel')));
    ok('a year can be added', /data-do="new-year"/.test(panel('institutePanel')));
    ok('branches are editable', /data-do="(new|edit)-branch"/.test(panel('branchesPanel')));
    ok('fee plans are editable', /data-do="(new|edit)-plan"/.test(panel('feesPanel')));
    ok('users are editable', /data-do="(new|edit)-user"/.test(panel('usersPanel')));
    ok('preferences are editable', /data-pref=/.test(src));
    // Master data became editable by approved business requirement; role
    // capabilities remain protected because records are granted through them.
    ok('master data is editable from Settings',
        /data-do="master-add"/.test(src) && /data-do="master-delete"/.test(src));
    ok('courses are editable from Settings',
        /data-do="new-course"/.test(src) && /data-do="structure-course"/.test(src));
    ok('role capabilities remain read-only', !/data-do="edit-role"/.test(src));
}

/* ------------------------------------------------------------------- DONE */
console.log(`\nStabilization: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
