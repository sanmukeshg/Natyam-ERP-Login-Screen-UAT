# Deploying NATYAM ERP to GitHub Pages (UAT)

**This folder is the site root.** Its contents go at the **top level of the
repository** — `index.html` beside `js/`, `assets/` and `tools/`.

---

## Why the last deployment broke

Two things went wrong, and both are avoidable:

1. **The folder structure was flattened.** Files from `js/` and `assets/` ended
   up loose in the repository root. `index.html` asks for `js/app.js` and
   `assets/css/tokens.css` — when those folders don't exist, every one of those
   nine requests returns 404 and the application cannot start, even if
   `index.html` itself is perfect.
2. **`index.html` was replaced with the contents of `CHANGELOG.md`.**

Both happen when files are selected from *inside* subfolders and dragged into
GitHub's web uploader. **Use git instead — it preserves paths exactly.**

---

## Deploy with git (recommended)

From inside this folder:

```bash
git init
git add -A
git commit -m "NATYAM ERP v2.2.2 — UAT"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -f origin main
```

`git add -A` from this directory captures `js/`, `assets/` and `tools/` as
folders. `push -f` replaces whatever is in the repository now — which matters,
because the current repository holds the flattened files and they must go.

Then in the repository: **Settings → Pages → Source: `main`, folder `/ (root)`**.

---

## If you must use the web uploader

Drag the **folders themselves** (`js`, `assets`, `tools`) and the loose files —
never files selected from inside a subfolder. After uploading, confirm the
repository shows `js`, `assets` and `tools` as **folders**, not a long flat list
of `.js` files.

---

## Verify after uploading — before testing

In the repository, check:

- [ ] `js`, `assets` and `tools` appear as **folders**
- [ ] `index.html` is about **2.6 KB** and its first line is `<!doctype html>`
      (if it is ~13 KB, it is the changelog again)
- [ ] `.nojekyll` is present — without it GitHub processes the site with Jekyll
- [ ] `js/app.js` exists at that path

Or run the checker in this folder against the live site:

```bash
node verify-deployment.mjs https://<you>.github.io/<repo>/
```

It fetches the site and reports whether the entry point and all nine assets are
being served correctly.

---

## First run

The application opens with demonstration data. For UAT:

1. **Settings → Data → Erase everything** — it stays empty, nothing regenerates.
2. **Settings → Data → Restore** and load `natyam-sample-data.json`
   (10 students across 3 batches with parents, staff, attendance, fees, one
   programme).
3. Test, then erase and repeat.

Data lives in the browser on the device it is used on, per browser and per
domain. Testing on a phone starts from a separate, empty copy.
