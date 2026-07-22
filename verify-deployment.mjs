/**
 * Checks a deployed NATYAM ERP site.
 *
 * The last deployment failed in two ways that a glance at the page could not
 * distinguish: the entry point had been replaced with a markdown file, and the
 * folder structure had been flattened so every asset 404'd. This fetches the
 * site and reports on both.
 *
 *   node verify-deployment.mjs https://<user>.github.io/<repo>/
 */
const base = (process.argv[2] || '').replace(/\/?$/, '/');
if (!base.startsWith('http')) {
    console.error('Usage: node verify-deployment.mjs https://<user>.github.io/<repo>/');
    process.exit(1);
}

let failures = 0;
const ok = (name, cond, extra = '') => {
    if (cond) console.log(`  ok    ${name}`);
    else { failures++; console.log(`  FAIL  ${name}${extra ? `\n          ${extra}` : ''}`); }
};

console.log(`\nChecking ${base}\n`);

let html = '';
try {
    const res = await fetch(base, { redirect: 'follow' });
    ok('the site responds', res.ok, `HTTP ${res.status}`);
    html = await res.text();
} catch (err) {
    console.log(`  FAIL  could not reach the site\n          ${err.message}`);
    process.exit(1);
}

const first = html.trimStart().split('\n')[0].trim();
ok('the entry point is HTML, not markdown',
    /^<!doctype html>/i.test(first), `first line was: ${first.slice(0, 60)}`);
ok('the document is closed', /<\/html>/i.test(html));
ok('it is the application, not a rendered README',
    /id="app"|natyam/i.test(html) && !/^#\s/m.test(html));

// The nine paths index.html depends on. A flattened upload fails all but one.
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith('http') && !p.startsWith('#'));

console.log('');
let missing = 0;
for (const path of assets) {
    try {
        const res = await fetch(new URL(path, base));
        const good = res.ok && !/text\/html/.test(res.headers.get('content-type') || '');
        if (!good) missing++;
        ok(`serves ${path}`, good, res.ok ? 'returned an HTML error page' : `HTTP ${res.status}`);
    } catch {
        missing++;
        ok(`serves ${path}`, false, 'request failed');
    }
}

if (missing > 1) {
    console.log('\n  Several assets are missing at their folder paths.');
    console.log('  This is the signature of a flattened upload: the files are in the');
    console.log('  repository, but at the root rather than inside js/ and assets/.');
    console.log('  Re-deploy with git from the deployment folder — see DEPLOY.md.');
}

console.log(`\n${failures ? `${failures} check(s) failed.` : 'All checks passed — the deployment is serving correctly.'}\n`);
process.exit(failures ? 1 : 0);
