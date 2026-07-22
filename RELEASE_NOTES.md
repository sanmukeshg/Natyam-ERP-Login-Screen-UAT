# Release Notes — NATYAM ERP v2.2.2

**Release:** Final Stabilization (Manual UAT Round 2)
**Date:** 23 July 2026
**Baseline:** v2.2.2 (previous build)
**Type:** Bug fixes + two approved business changes · no schema change · all records preserved

---

## What changed for the academy

### Fees are billed one cycle at a time

This is the biggest change. Previously, enrolling a student created **the whole
year's invoices at once**, so a new student appeared to owe ₹18,000 on their
first day.

Now enrolment raises **only the invoice for the cycle they join in**. Each later
invoice appears **on the day it falls due**.

> A student joins on **22 July** on a **₹1,500 monthly** plan → **one invoice,
> ₹1,500**, outstanding **₹1,500**. On 22 August the next ₹1,500 appears by
> itself.

**Outstanding now means what it says** — invoices that exist and are unpaid.

Fee plans support **Monthly, Quarterly, Half-Yearly, Annual and One-Time**, and
a single student can be put on a different cycle from their plan using the
optional **Billing frequency** field on their record (left alone, it follows the
plan).

**Nothing already invoiced or collected is changed.** Past invoices keep their
amounts, their payments and their history.

### Settings holds the academy's lists

The separate **Curriculum** screen is gone. Everything it did — and more — is in
**Settings → Curriculum**, which now manages four lists:

- **Courses** (with their Level → Stage → Lesson structure)
- **Levels / Qualifications**
- **Programme types**
- **Expense categories**

Each supports **add, rename, activate, deactivate, reorder and delete**, and
what you set is what every other screen offers. If you try to delete something
still in use, the application says so and offers to deactivate it instead — so
existing records stay readable.

### Fixes from your testing

| You reported | Now |
|---|---|
| Student **Action** button threw an error | Replaced with **Close** and **Edit**; Edit saves. Other operations are listed in the profile |
| Error on **Begin Review** and **Enroll** | Fixed. Every student still belongs to a batch, but the batch list is never empty |
| **Step 8** hidden in the application form | All nine steps reachable; they wrap on small screens |
| **Dashboard** opened scrolled down | Opens at the top |
| **Branch selector** missing | Back on every screen |
| **Annual amount** shown | Removed |
| **Choose cast** not working | Fixed — the whole roll is selectable, any level |
| Attendance had L and E | **Present** and **Absent** only |

---

## For administrators / IT

- **No schema change.** New invoices carry a billing period, new students may
  carry a frequency override; existing rows have neither and work unchanged.
- **The scheduler starts from a recorded changeover date**, so it never
  back-fills history. It runs at start-up, only ever raises invoices already
  due, and is safe to run repeatedly.
- **Every enrolled student belongs to a batch** — enforced, and the workflow now
  always allows a valid choice.

## Quality

| Check | Result |
|---|---|
| Undefined identifiers | pass (new gate) |
| Import / cycle validation | pass — 58 modules |
| Static (css / dead code) | no new findings |
| Smoke | 31 / 31 |
| Render QA | 48 / 48 |
| Phase 0.5 / 1 / 2 | 6 / 6 · 21 / 21 · 39 / 39 |
| Stabilization | 60 / 60 |
| v2.2.2 | 48 / 48 |
| v2.2.2 final (Sections A, B, C) | 69 / 69 |
| Navigation QA | 26 / 26 apart from one pre-existing flake |

## Known issues

- **Navigation-QA `/settings` flake — pre-existing, unchanged.** A deferred
  render in the Reports module can touch a container the test harness has
  already discarded. It has no effect on the running application.

## Upgrade

Replace the application files. No data steps are required.
