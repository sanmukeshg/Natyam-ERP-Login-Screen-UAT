/**
 * Catches identifiers a module uses but never imports or defines.
 *
 * check-imports verifies that every import path resolves; it says nothing
 * about whether the names a file actually calls exist. A helper used without
 * being imported therefore passed every gate and only failed when the code ran
 * — which is how a broken "Choose cast" shipped twice.
 *
 * This is deliberately narrow: it looks for calls to bare identifiers that
 * match a name exported somewhere in js/ but never imported or declared in the
 * calling file. That catches the real mistake without pretending to be a type
 * checker.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'js');
const files = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
    }
})(ROOT);

// Every name exported anywhere — the vocabulary a file might legitimately call.
const exported = new Set();
for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) exported.add(m[1]);
    for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) exported.add(m[1]);
}

const problems = [];
for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    // Comments carry JSDoc signatures that read like calls.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    const imported = new Set();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
        for (const part of m[1].split(',')) {
            const name = part.split(/\s+as\s+/).pop().trim();
            if (name) imported.add(name);
        }
    }
    for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) imported.add(m[1]);
    // Names pulled in by a dynamic import are bound the same way.
    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+import/g)) {
        for (const part of m[1].split(',')) {
            const name = part.split(':').pop().trim();
            if (name) imported.add(name);
        }
    }

    const declared = new Set();
    for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
    for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
    for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
    // Class methods are defined as `name(args) {` and called as `this.name()`;
    // both look like a bare call to a naive scan, so record the definitions.
    for (const m of src.matchAll(/(?:^|\n)\s{2,}(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) declared.add(m[1]);
    // Object-literal shorthand methods, e.g. `{ verify() { … } }`.
    for (const m of src.matchAll(/(?:^|[,{\n])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) declared.add(m[1]);

    // Anything bound by destructuring or as a parameter is in scope.
    // `for (const [a, b] of …)` binds names too.
    for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s*[[{]([^\]}]*)[\]}]/g)) {
        for (const part of m[1].split(',')) {
            const name = part.split(':').pop().trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
        }
    }
    for (const m of src.matchAll(/(?:const|let|var)\s*[[{]([^\]}]*)[\]}]\s*=/g)) {
        for (const part of m[1].split(',')) {
            const name = part.split(':').pop().replace(/\.\.\./, '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
        }
    }
    for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) {
        for (const part of m[1].split(',')) {
            const name = part.split('=')[0].replace(/[{}[\].]/g, '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
        }
    }
    for (const m of src.matchAll(/function\s*\*?\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
        for (const part of m[1].split(',')) {
            const name = part.split('=')[0].replace(/[{}[\].]/g, '').trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
        }
    }

    const called = new Set();
    for (const m of src.matchAll(/(?<![.\w$])([a-z][\w$]*)\s*\(/g)) called.add(m[1]);

    for (const name of called) {
        if (!exported.has(name)) continue;         // not one of ours — skip
        if (imported.has(name) || declared.has(name)) continue;
        problems.push(`${path.relative(path.join(__dirname, '..'), file)}: calls ${name}() but never imports or defines it`);
    }
}

if (problems.length) {
    console.log('Undefined identifiers:');
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
}
console.log(`No undefined identifiers across ${files.length} modules.`);
