# NATYAM ERP — User Guide

**Version 2.2.2** · For the staff of NATYAM — School of Kuchipudi

This guide covers everyday work: admitting a student, taking a register,
collecting fees, and keeping the academy's own lists up to date. It assumes no
technical knowledge.

---

## 1. Getting around

The application runs in a browser and keeps its data **on the device it is used
on**. It works without internet.

- **Left sidebar** — the modules: Dashboard, Admissions, Students, Batches,
  Attendance, Fees, Finance, Programmes, Certificates, Reports, Settings.
- **Top bar** — search (or press `Ctrl K`), the **branch selector**,
  notifications, and light/dark mode.
- **Branch selector** — everything you see and create belongs to the branch
  shown here. Switch branches before adding records.

On a phone the sidebar collapses behind the ☰ button.

---

## 2. Admitting a student

Admissions is a nine-step form. Progress is saved as you go, so you can stop and
come back.

1. **Admissions → New application**.
2. Work through the steps. The strip at the top shows where you are; on a narrow
   screen the steps wrap onto two lines so the later ones stay reachable.
3. **Submit** the application.
4. **Begin review**, then **Approve** (or **Reject**, with a reason).
5. **Enrol** — choose the **batch** the student will join.

> **Every enrolled student belongs to a batch.** The batch list shows all active
> batches at the branch, with those teaching the student's own level first. If
> nothing has a free seat, the application offers to take you to **Batches** so
> you can create one or free a seat.

Enrolling creates the student, places them on the register, and raises **the
first fee invoice** — see §5.

---

## 3. Students

**Students** lists everyone on the roll. Each row carries the four everyday
actions:

| Action | What it does |
|---|---|
| **View** | Opens the full profile — fees, attendance, certificates, documents |
| **Edit** | Opens the record for changes; press **Save** to keep them |
| **Archive** | Takes the student off the roll but keeps the record. Reversible |
| **Delete** | Removes the student permanently, with their invoices and attendance. Not reversible |

Inside a profile, the **Operations** row holds everything else: place in a
batch, collect a fee, record leave, promote a level, change status, issue a
certificate.

**Archive or delete?** Archive a student who may return. Delete only a record
that should never have existed — a duplicate or a test entry. The confirmation
tells you exactly what will be removed, including fees already collected.

---

## 4. Batches and attendance

- **Batches** — a class: level, days, times, teacher, branch, capacity.
  A batch needs a **code** (for example `FND-A`) and a **branch**.
- **Attendance → open a batch** to take the register. Mark each student
  **Present** or **Absent**. The mark colours immediately: green for present,
  red for absent.

The month grid shows the whole batch at a glance.

---

## 5. Fees

### How billing works

The academy bills **one cycle at a time**.

When a student enrols, the application raises **the invoice for the cycle they
join in — and nothing else**. Future months are not created in advance. Each
later invoice appears **on the day it falls due**, raised automatically when the
application is opened.

> **Example.** A student joins on **22 July 2026** on a **₹1,500 monthly** plan.
> They receive **one invoice for ₹1,500**, and their outstanding balance is
> **₹1,500**. On 22 August the next ₹1,500 invoice appears by itself.

**Outstanding always means invoices that actually exist and are unpaid.** It is
never a projection of the year ahead.

### Fee plans

**Settings → Fee plans**. A plan has a name, the amount for one cycle, and how
often it is billed:

- Monthly · Quarterly · Half-Yearly · Annual · One-Time

Delete removes a plan entirely; students on it are simply unlinked, and invoices
already raised are untouched.

### Billing frequency for one student

On the student form, **Billing frequency** is optional. Left alone it reads
*Use fee plan default*, and the student is billed on their plan's cycle.
Choose a different frequency to change **only that student** — useful for a
family paying quarterly on an otherwise monthly plan.

### Collecting

**Fees → Collect**, choose the student, and record the payment. The amount
suggested is the balance due. Amounts are whole rupees — there are no paise
anywhere.

---

## 6. Programmes

Schedule a performance, workshop, competition, examination or rehearsal.

**Choose cast** opens the whole roll. **Any student may take part in any
programme** — there is no level restriction. Tick the students, then **Save
cast**.

---

## 7. Finance

The summary leads with the **net position** for the period, with income,
expenditure and margin beside it. Below are the monthly trend and the ledger.

Expenses are recorded against a **category** — the list you maintain in
Settings (§8).

---

## 8. Settings — the academy's own lists

**Settings is the single source of truth.** What you set here is what every
other screen offers.

### Settings → Curriculum

Four lists, each with the same controls — **Add**, **Rename**, **Activate /
Deactivate**, **Reorder** (▲▼) and **Delete**:

| List | Used by |
|---|---|
| **Courses** | Courses of study, each with a Level → Stage → Lesson structure |
| **Levels / Qualifications** | The single ladder a student sits on |
| **Programme types** | Offered when scheduling a programme |
| **Expense categories** | Offered when recording an expense |

**Deactivate or delete?** Deleting is refused while records still use a value —
the application offers to **deactivate** instead, which removes it from new use
while keeping existing records readable. Nothing you have already recorded is
ever silently changed.

The default levels are Foundation Level 1 to 8, Intermediate Certificate,
Intermediate Diploma, Advanced Masters, Advanced Theory and Advanced Practical.
These are starting values — rename, reorder or extend them freely.

### Courses and their structure

A course is a syllabus. **Structure** opens its tree: add levels from the shared
list, then stages within a level, then lessons within a stage. Everything can be
renamed, reordered and removed.

*(A course is separate from a student's Level. The Level is the qualification
they sit on; the course describes what is taught.)*

### Other settings

- **Institute** — name, address and contact, printed on receipts and
  certificates. Also holds the **current academic year**.
- **Branches**, **Fee plans**, **Users**, **Preferences**.
- **Data** — backup, restore, import, and **Erase everything**.

---

## 9. Backup, restore and starting fresh

- **Download a backup** before anything significant. It is a single file.
- **Restore** loads a backup back in.
- **Erase everything** clears the application completely. After an erase it
  stays empty — no demonstration data returns — so you can import your own.

Sample data is provided (`natyam-sample-data.json`) to practise with: restore
it, try things, then erase.

---

## 10. Reports

Reports covers collections, attendance, admissions and finance. Every report can
be exported to CSV or Excel.

---

## 11. On phones and tablets

The application adapts: the sidebar collapses, tables scroll sideways rather
than shrinking, and the admission steps wrap so none is hidden. Taking a register
and collecting a fee both work on a phone.

---

## 12. If something looks wrong

1. **Reload the page.** Nothing is lost — data is saved as you work.
2. **Check the branch selector** — you may be looking at another branch.
3. **Take a backup** before trying anything else.

Fees, attendance and payments are never altered by an update. Invoices already
raised keep their amounts and their history.
