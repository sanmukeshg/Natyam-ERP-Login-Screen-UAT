# UAT Baseline Dataset

**Status:** Adopted 2026-07-24
**File:** `UAT_Data_Set_1.json` (kept outside version control — see `.gitignore` — held on each developer/tester's own machine, not committed to this repo)

## What this is

`UAT_Data_Set_1.json` is a NATYAM ERP backup file (`kind: "natyam-erp-backup"`, schema version 6) originally produced by this project's UAT Data Generator: 3,588 records across branches, academic years, staff, batches, fee plans, students, admissions, leave requests, invoices, payments, ledger entries, attendance, holidays, expenses, programs and settings — a "healthy academy" scenario (56 active students, mostly-paid fees, ~90% attendance).

It has been formally adopted as **the official UAT baseline dataset** for this project — the standard dataset used for development, regression testing, demonstrations, and future UAT cycles, going forward.

**It is explicitly not production data.** A school's real records, once deployed, are either entered directly by the school or restored from that school's own real backup — never from this file. This dataset exists purely to give development and testing a consistent, realistic, repeatable starting point.

## How it's used

There is no special loader for this file and none should be added. It's loaded exactly the way any other NATYAM backup is: **Settings → Data → Restore**, using the file picker to select `UAT_Data_Set_1.json`. That screen already validates the file, shows what it contains, takes an automatic safety copy of whatever's currently loaded, and replaces the database with the file's contents — see `js/services/backup.service.js`.

As of 2026-07-24, that restore path correctly handles Students (migrated to Cloud Firestore in Milestone 3) as well as every other still-IndexedDB entity — see `docs/migrations/STUDENT_MODULE_MIGRATION.md` and the backup/restore fix recorded there. Restoring this file now actually repopulates Students, not just the entities still on IndexedDB.

## What replaced

- **`natyam-sample-data.json`** — the old ad hoc sample file that used to sit in the repo root. Confirmed unreferenced by any code path and removed. Do not reintroduce it.
- Any other one-off sample/demo/placeholder JSON a previous UAT round may have produced. This file is now *the* baseline; treat anything else as superseded unless a future decision says otherwise here.

## What this does not change

- **`js/data/seed.js`** — the synthetic random-data generator that seeds a brand-new, empty local install — is untouched and still runs automatically on first boot, independent of this file. A fresh install still gets generated demo data; a tester who wants *this specific* baseline instead restores `UAT_Data_Set_1.json` deliberately, the same manual action as any other restore.
- No new "auto-load this JSON" mechanism exists or was added — restoring is, and remains, an explicit action a signed-in Administrator (or Teacher & Reception, for whatever that role can already reach in Settings) takes on purpose.
