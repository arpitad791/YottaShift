# YottaShift — Fair & Feasible Workforce Scheduling

> Candidate project for the YottaFlex AI recruitment drive. Not an official YottaFlex product.

A seeded, reproducible synthetic dataset and a working scheduling
workflow that combine **leave requests, shift coverage, skills and labour constraints** into fair
and feasible schedules, expose every key decision and exception, keep full history, and produce
measurable outputs.

> **Status:** Phases 0–9 complete: setup, domain design and schema, master data, the
> transaction workflow (leave, scheduling, swaps, attendance), derived values with metrics,
> labelled anomalies with a separate ground truth, file-level validation with evaluation
> against that ground truth, CSV / JSON / SQL / SQLite exports with a checksummed manifest and a
> two-run reproducibility check, a local Express API and a React dashboard. Phase-by-phase progress lives in
> [tracking.md](tracking.md). Sections marked _(Phase N)_ are filled in as that phase lands.

---

## 1. Problem

Build an end-to-end workflow for a workforce of 2,000 employees in 100 teams over 90 days:
create teams, skills and shift templates; define minimum staffing per shift and skill; generate
leave requests and approval outcomes; create attendance events; assign shifts; handle swaps with
manager approval; compute overtime and coverage gaps — with labelled anomalies, a separate ground
truth, validation, and fixed-seed reproducibility.

**Actors:** employee, manager, HR partner, IT/operations partner, system administrator.

## 2. What it produces

- ✅ Master and transaction tables: Employee, Team, Skill, ShiftTemplate, ShiftAssignment,
  LeaveRequest, HolidayCalendar, AttendanceEvent, CoverageRequirement, SwapRequest (plus bridge
  and event-history tables)
- ✅ Derived tables recomputed from them: weekly hours and overtime, coverage status (gaps),
  leave balances, attendance reconciliation
- ✅ Metrics M-01 … M-08 (`reports/metrics.json` + readable `reports/metrics.md`)
- ✅ `ground_truth/ground_truth.csv` / `.json` for the injected anomalies and boundary cases,
  kept apart from the input tables
- ✅ Validation summary (`reports/validation_summary.json` + `.md`): integrity, decision replay,
  detection precision/recall against the ground truth (M-09), acceptance criteria
- ✅ Every table as CSV and JSON, a SQL seed (`sql/seed.sql`) and a ready SQLite database
  (`sqlite/yottashift.db`) — all four hold identical data
- ✅ `manifest.json`: command, seed, generator version, config hash, environment, provenance,
  policy, and rows / bytes / SHA-256 of every file
- ✅ Reproducibility report (`reports/reproducibility.json` + `.md`): two fresh runs compared
  file by file, and against the published manifest

## 3. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 24 (ES modules) | One language across generator, API and UI |
| Storage | SQLite via built-in `node:sqlite` | PK/FK and join validation, SQL seed export, no server to install |
| API | Express 5.2.1 (the only runtime dependency) | Small, familiar; Express 5 forwards thrown errors to one handler |
| UI | React 19.3.1 + Vite 8.3.4, hand-built SVG charts | Dashboard for decisions and exceptions; no UI or chart library |
| Tests | `node:test` | Built in, no extra dependency |
| Quality | ESLint 10, Prettier 3 | Lint + consistent formatting |

Full reasoning and rejected alternatives: [tracking.md §8](tracking.md#8-decision-log).

## 4. Repository layout

```
config/          generator settings: seed + starter/full scale profiles
sql/             schema.sql
docs/            data dictionary, ERD, business rules, design notes
src/lib/         seeded RNG, ID, date, CSV and allocation helpers
src/domain/      enums and rule constants
src/generator/   master data → transactions → events → anomalies
src/scheduler/   roster state (hard rules, fairness key) and the weekly scheduler
src/derive/      derived tables (overtime, coverage, balances, reconciliation) and metrics
src/validation/  file reader, integrity checks, decision replay, detectors, evaluation, summary
src/export/      CSV, JSON, SQL seed, SQLite DB, manifest, reports
src/db/          schema loading, table I/O, load order
src/api/         Express app: dataset store, routes, HTTP helpers
src/cli/         generate / validate / reproduce entry points
client/          React dashboard (npm workspace): views/, components/ (ui, charts)
test/            unit and integration tests
data/            generated datasets per profile
ai-disclosure/   prompt history and AI-usage notes
```

## 5. Setup

Requirements: **Node.js 24+** and npm. No database server or external service is needed.

```bash
npm install
```

## 6. Run

```bash
npm run generate -- --profile starter
```

```bash
npm run generate -- --profile full
```

Both profiles use the same generator and seed (`20261022`); only the scale differs
(`config/generator.config.json`). Options: `--out <dir>` (default `data`), `--config <file>`.
Everything goes to `data/<profile>/` (layout: [data dictionary §12](docs/data-dictionary.md#12-export-files)):

```
data/<profile>/
├── sqlite/yottashift.db      schema + every row, ready to query (built first: the integrity gate)
├── csv/<table>.csv           21 tables
├── json/<table>.json         the same rows as JSON
├── sql/seed.sql              data-only INSERTs; load after sql/schema.sql
├── ground_truth/             labels, kept apart from the inputs
├── reports/                  metrics, validation summary, reproducibility report
└── manifest.json             rows, bytes and SHA-256 of every file + seed, config, provenance
```

The SQLite database is written first: loading it enforces every type, CHECK and foreign key of
`sql/schema.sql`, so a bad row stops the run before any other file is written.

**What is in git:** `data/starter/` is committed in full as the sample (12 MB). The full profile
is 391 MB (the SQLite file alone is above GitHub's 100 MB limit), so only its `manifest.json`,
`reports/` and `ground_truth/` are committed; regenerate the data with the command above and
check it against the published checksums with `npm run reproduce -- --profile full`.

| Profile | Teams | Employees | Days | Leave requests | Swap requests |
| --- | --- | --- | --- | --- | --- |
| `starter` | 10 | 200 | 28 | 160 | 60 |
| `full` | 100 | 2,000 | 90 | 5,000 | 1,500 |

Full profile, as published (including the labelled anomalies of §9):

| Master data | Rows | Transactions and events | Rows | Derived | Rows |
| --- | --- | --- | --- | --- | --- |
| labour policies | 2 | leave requests | 5,000 | employee week summary | 25,948 |
| skills | 30 | leave request events | 10,089 | coverage status | 46,320 |
| teams | 100 | shift assignments | 95,970 | leave balance | 5,658 |
| employees | 2,000 | shift assignment events | 98,812 | attendance reconciliation | 93,128 |
| employee skills | 3,179 | swap requests | 1,500 | | |
| leave entitlements | 5,658 | swap request events | 3,502 | | |
| shift templates / holidays / shifts | 4 / 5 / 360 | attendance events | 184,575 | | |
| coverage requirements | 1,490 | | | | |

A full run takes about 21 s and writes 391 MB (CSV 60 MB, JSON 152 MB, SQL seed 77 MB,
SQLite 103 MB). The starter profile takes about 1 s.

Then validate what was written and prove it is reproducible (see [§7](#7-verify)):

```bash
npm run validate -- --profile full
```

```bash
npm run reproduce -- --profile full
```

### API

```bash
npm run api -- --profile full
```

Serves `data/<profile>/` at `http://localhost:3001/api` (options: `--port`, `--data`). It opens
the dataset's SQLite file **read-only**, so the published files and their checksums never
change; at full scale the exception list is warmed in the background a few seconds after
start-up. All errors use one shape: `{ "error": { "code", "message" } }` (400 bad parameter or
ID format, 403 wrong reviewer, 404 unknown ID or route, 422 not applicable). Lists take
`limit` (1–500, default 50) and `offset`, and return `{ data, page: { limit, offset, total } }`.

| Method & path | Returns | For |
| --- | --- | --- |
| `GET /health` | Profile, seed, window, row counts, ground-truth counts | admin |
| `GET /metrics`, `GET /validation`, `GET /reproducibility` | `metrics.json`, `validation_summary.json`, `reproducibility.json` (404 with the command to create it) | admin, HR |
| `GET /skills`, `GET /teams`, `GET /teams/:teamId` | Teams with manager, HR partner, members, requirements, coverage totals | manager, HR |
| `GET /employees?teamId&role&employmentType&q`, `GET /employees/:employeeId` | Employee with skills, leave balances, weekly hours and overtime | manager, HR, employee |
| `GET /employees/:employeeId/schedule?from&to` | Every assignment with shift times, status, history links and attendance outcome | employee, manager |
| `GET /coverage?date&teamId&skillId&status`, `GET /coverage/daily?teamId` | Coverage per shift × team × skill (gaps), and per-day totals for charts | manager, ops |
| `GET /assignments/:assignmentId` | Assignment with its events, punches, reconciliation, and what it replaced / was replaced by | manager, ops |
| `GET /leave?status&type&reason&teamId&employeeId`, `GET /leave/:id` | Leave with decision rule, full event history and the roster changes it caused | employee, manager, HR |
| `POST /leave/evaluate` | **What-if:** the decision the rules would give a new request (status, rule, reason, decider, balance); nothing is stored | employee, HR |
| `GET /swaps?status&type&reason&teamId`, `GET /swaps/:id` | Swap with decision rule, events, and the assignments it moved and created | employee, manager |
| `GET /exceptions?ruleId&issueType&kind&teamId&employeeId&reviewStatus`, `GET /exceptions/summary`, `GET /exceptions/:findingId` | Business-rule findings with stable IDs, ground-truth match and review trail | manager, HR, ops |
| `POST /exceptions/:findingId/reviews` | Append a review (`ACKNOWLEDGED` / `RESOLVED` / `DISMISSED`, note) by the team's manager or HR partner, or an ops partner for attendance / overtime findings | manager, HR, ops |
| `GET /ground-truth?labelClass` | The labels, for comparing detections | admin |

Reviews are the only write. They are appended (never edited) to a separate database,
`data/<profile>/api/reviews.db`, which is git-ignored and is not part of the dataset. Leave
and swap requests cannot be approved through the API, because the dataset is a closed
snapshot: every request is already resolved by its documented rule, and changing one would
rewrite history and break the published checksums.

### Dashboard

Start the API first (above), then in a second terminal:

```bash
npm run client
```

Open `http://localhost:5173`. Vite forwards `/api` to `http://localhost:3001` (set
`YOTTASHIFT_API` to use another address). `npm run client:build` writes a static build to
`client/dist/`.

| View | For | Shows |
| --- | --- | --- |
| Overview | HR partner, system administrator | Coverage fill (planned vs clocked in), short slots, overtime breaches, leave and swap approval rates, punctuality, complete records, night-shift fairness, anomalies detected; per-day charts; teams with the most missing hours |
| Coverage | Manager, IT / ops partner | Per-team daily fill and missing headcount, and every short slot (shift × team × skill) by date |
| Exceptions | Manager, HR partner, ops partner | Findings by rule, filters, each finding's records, ground-truth label and review trail; adding a review (only the reviewers the API allows are offered) |
| People | Employee, manager | Search; a person's policy, skills, leave balances and requests, weekly hours against the overtime cap, and full schedule with attendance |
| Assignment | Manager, ops partner | One assignment's status history, punches, reconciled outcome, and what it replaced or was replaced by |
| Leave & swaps | Employee, manager, HR partner | Leave and swap requests with the deciding rule, full history and roster changes; the leave what-if form |
| Validation | System administrator | Status, acceptance criteria, detection per anomaly type, boundary cases, integrity and replay checks, reproducibility |

Every ID in the dashboard links to the view that explains it, and every view has its own URL
(`#/people/EMP-000101`, `#/requests/swaps/SWP-2026-000002`), so a finding can be shared as a
link. Charts follow one palette checked for colour-blind separation in light and dark mode,
and each has a "Show data as table" view.

### How the master data is generated

- **Parents first:** labour policies → skills → teams and employees → employee skills → leave
  entitlements → shift templates → holidays → shifts → coverage requirements.
- **Seeded randomness only:** one seeded generator (sfc32), with a separate named stream per
  step, so changing one step never shifts another step's numbers. ESLint bans `Math.random`.
- **Realistic variation:** six team functions with their own skill pools; 24×7, extended-hours
  and business-hours teams (10–33 people); about 15% part-time members; joiners and leavers
  inside the window; certifications that lapse mid-window; a mid-window demand revision for
  some teams.
- **Demand from supply:** each team's minimum staffing is sized from the real weekly hours of
  its members, multiplied by a demand ratio. Most teams can cover their demand, some are at
  the limit and a few are short, so coverage gaps will come from the data rather than being
  injected.

### How the workflow is simulated

Everything runs on one timeline in time order, so every decision only sees what had happened
before it. Behaviour (who asks for leave, how late someone is, how fast a manager answers) is
seeded input; every **outcome** comes from a numbered rule in
[docs/business-rules.md](docs/business-rules.md) and is stored with that rule's ID.

1. **Leave** — 5,000 requests (annual, casual, sick, unpaid) are decided in decision-time order:
   employment, overlap, balance, sick auto-approval, notice, team leave cap. Managers decide up to
   5 days, the team's HR partner decides longer and unpaid leave, the system auto-approves sick
   call-ins. Some requests are withdrawn or cancelled later; history is kept as events.
   *Full profile:* 3,696 approved, 1,122 rejected (5 different reasons), 93 withdrawn,
   89 cancelled.
2. **Roster** — each ISO week is published 7 days ahead. For every team, date and shift the
   scheduler fills the required headcount per skill with eligible people only (skill valid,
   employed, not on approved leave, one shift a day, 11 h rest, ≤ 6 days in a row, weekly hour
   limit), choosing by a fairness key (weekly load, then nights/weekends/holidays so far, then
   total load). Unfillable demand stays a **gap**. *Full profile:* 99.1% of required headcount
   filled, 669 short slots, never staffed above the requirement.
3. **Late leave** — leave approved after publication cancels the affected shifts (as events) and
   backfills them with the best eligible colleague when one exists. *Full profile:*
   1,590 backfills.
4. **Swaps** — 1,500 requests (exchange or cover) made against the live roster, decided by the
   team manager with the roster as it is at decision time, or expired after 48 h, or cancelled.
   Approved swaps create new assignments linked to the ones they replace. *Full profile:*
   522 applied, 750 rejected (9 different reasons), 158 expired, 70 cancelled.
5. **Attendance** — clock-in/out per worked shift (badge or mobile), late arrivals, early leaves,
   extensions, no-shows, and missing clock-outs corrected by an ops partner. Clock-outs never
   push a week past contract + overtime cap. *Full profile:* 184,535 events, 1,481 no-shows,
   927 manual corrections.

### Derived tables and metrics

The four derived tables are computed only from the source tables (no randomness), and the
schema itself re-checks their arithmetic (`gap = max(0, required − qualified)`,
`remaining = entitled − approved`, overtime flag vs cap):

- **employee_week_summary** — per person and ISO week: contracted hours (prorated to employed
  days), scheduled, worked, overtime, cap flag.
- **coverage_status** — per shift × team × skill: required, assigned, qualified, attended,
  planned gap and gap after absences.
- **leave_balance** — entitlement − approved days.
- **attendance_reconciliation** — per worked shift: punches, worked/late/early/extension
  minutes, outcome (present, no-show, missing punch, no record).

Key metrics for the full profile (`data/full/reports/metrics.md`). The published dataset
includes the labelled anomalies of §9; the clean-baseline value is in brackets where they move
it:

| Metric | Value |
| --- | --- |
| M-01 Coverage filled by qualified staff / by staff who clocked in | 99.08 % / 97.50 % (baseline 99.10 % / 97.52 %) |
| M-02 Short slots · missing headcount-hours | 686 · 6,896 h (baseline 669 · 6,752 h) |
| M-03 Employee-weeks with overtime · max weekly overtime · cap breaches | 7,371 · 13.48 h · 20 (baseline max 12 h, 0 breaches) |
| M-04 Leave approval rate: annual / casual / sick / unpaid | 63 % / 79 % / 91 % / 81 % |
| M-05 Swap approval of manager decisions · expiry rate | 40 % · 10.5 % (baseline 41 %) |
| M-06 Punctuality · no-shows · extensions | 93.1 % · 1.6 % · 9.4 % |
| M-07 Due shifts with a complete record · worked ÷ scheduled (present) | 99.83 % · 101.4 % |
| M-08 Fairness (Jain's index, mean across teams): nights / weekends / holidays / hours per contract | 0.977 / 0.948 / 0.907 / 0.994 |

The 20 cap breaches are exactly the 20 labelled `OVERTIME_CAP_EXCEEDED` cases; the extra short
slots come from the `SKILL_ABSENT` cases (the switched assignment no longer counts as qualified
for its original skill).

## 7. Verify

### Validate a generated dataset

```bash
npm run validate -- --profile full
```

The validator reads **only the exported files** (`data/<profile>/csv/` and `ground_truth/`),
writes `data/<profile>/reports/validation_summary.json` and `.md`, prints a summary and exits
with code 1 if anything is wrong. Full profile: about 29 s, **PASS**.

| Section | What it proves | Full profile |
| --- | --- | --- |
| I-01 … I-12 structural integrity | Files and headers; load into the schema (types, CHECKs, FKs); PK and unique keys; all 47 FK columns; enums; ID formats; date order; duplicates and overlapping ranges; event-chain structure; cross-table consistency; derived tables recompute exactly | 0 failures over 583,330 rows (1.4 M FK lookups, 1.8 M ID checks) |
| I-13 export formats | JSON, SQL seed and SQLite database hold exactly the CSV rows (same order, same values) | 63 / 63 table comparisons identical |
| D-01 leave replay | Every leave decision re-run through R-LVE-01 … R-LVE-07 from the exported data | 5,000 / 5,000 identical |
| D-02 swap decisions | Team, skill, notice, deadline, apply window and links consistent with each outcome | 7,075 checks, 0 failures |
| Detection (M-09) | Detector findings vs ground truth: precision and recall per type, boundary cases, confusion table, unexplained findings | 100 / 100 detected, precision 100 %, 0 / 40 boundary flagged, 0 unexplained |
| Acceptance A-01 … A-04 | Gaps reported; working-hour rules hold outside labels; attendance reconciles; swap history preserved | all met |

How to read it: **Status** is PASS only when every structural check and decision replay is
clean, every labelled anomaly is detected by its own detector, no finding falls outside the
labels, no boundary case is flagged, and every acceptance criterion is met. Otherwise the
summary lists each problem with sample records. The only expected side effect is that
unapproved swaps also break their event chain (R-SWP-08); those findings are counted as
"secondary findings on labelled records".

### Tests and code quality

```bash
npm test
npm run lint
npm run format:check
```

`npm test` (223 tests, about 40 s, most of it generating and loading the full profile) covers:

- **Schema:** loads into SQLite and accepts a fully consistent fixture touching all 21 tables;
  enum, rule and lifecycle lists match between code, schema and docs; 17 kinds of broken rows
  are each rejected by the constraint that should catch them; labelled anomalies stay loadable.
- **Helpers:** seeded RNG determinism and stream independence, ISO weeks and timestamps across
  midnight and year ends, ID formats and overflow, exact allocation, CSV quoting.
- **Config:** the shipped config is valid; typos, missing keys, bad shares, bad enums and
  impossible dates are rejected.
- **Master data (both profiles):** volumes from the brief; loads with every FK resolved;
  identical on regeneration and different with another seed; one manager per team; HR and ops
  partners only in the Workforce Office; policies match employment types; skill validity and
  certification expiry; day types; requirements only for each team's pattern, with no
  overlapping effective ranges, only for skills the team holds, and within what the team could
  staff at maximum hours.
- **Leave rules:** each decision rule on a hand-built team (balance, notice, sick auto-approval,
  team cap, decision-time order, cancellation freeing the cap, overlap with approved and pending
  requests, employment, HR vs manager).
- **Scheduler:** each hard rule (double booking, rest, consecutive days, weekly hours, leave from
  its decision time, expired certification), swap give-and-take on the same day, fairness
  choice, and a gap instead of an unqualified fill.
- **Transactions (both profiles):** exact leave and swap volumes; FK-clean load; **zero
  business-rule violations** in the baseline (only uncorrected missing punches reported as
  exceptions); byte-identical regeneration; every leave reason and decider; every swap outcome;
  swap and backfill history links; rosters published before their week; attendance sources and
  ops-partner corrections; gaps reported, never over-staffed.
- **Rule checks catch problems:** double booking, leave overlap, missing skill, overtime cap,
  unapproved swap, rest / consecutive-day / weekly-hour breaches, history without events, and
  attendance on an unworked shift are each injected into a copy of the data and detected.
- **Derived values:** a hand-built fixture with every expected number worked out by hand —
  overtime (incl. cap breach, partial week, joiner), worked time from punch pairs only,
  late/early/extension minutes, all reconciliation outcomes, qualified vs attended coverage,
  gaps, leave balances; Jain's index and percentiles. At full scale: no cap breaches, every due
  shift reconciled, short slots equal an independent count, no negative balances, metrics add up
  to the source tables and are reproducible.
- **Anomalies and ground truth (both profiles):** exact anomaly counts per type; boundary counts
  (full: all reachable types complete); layout, IDs, rules and classes; every label points at
  existing records; every anomaly detected by its own detector; no boundary flagged; no
  finding outside the labels; overtime breaches and at-cap weeks visible in the derived
  tables; untouched tables identical to the baseline and changed rows only on labelled records;
  no label-like table or column in the inputs; FK-clean load; same labels on every run.
- **Validation:** CSV parsing (quotes, commas, newlines, CRLF); the CSV round trip returns exactly
  the generated data; the starter dataset passes every check; **each check (I-01 … I-12, D-01,
  D-02) fails on a purpose-built broken copy**; evaluation fails when a label is missing (finding
  outside the labels), when a label points at a clean record (recall < 1) and when a boundary
  sits on a violating record; the CLI exits 1 after a team row is removed from `team.csv`.
- **Exports and reproducibility:** every table written as CSV and JSON plus seed, database,
  ground truth and metrics; the manifest's rows and SHA-256 match every file and it carries no
  run timestamp; the database passes `PRAGMA integrity_check` and FK checks with the right row
  counts; the seed loads into a fresh schema with FKs on; validation passes with I-13 and fails
  when one JSON value is changed; manifest comparison reports changed checksums, missing files
  and a different seed; `npm run reproduce` reports IDENTICAL and exits 1 when the published
  manifest disagrees.
- **API (22 tests, against a freshly generated starter dataset):** health, metrics, the
  reproducibility report (404 until it exists), teams and team detail with manager and HR partner names, employee paging / filters / search and detail; schedules in time order with
  attendance; coverage gaps equal to the derived table and daily totals; assignment, leave and
  swap histories with their links; what-if outcomes (approval, balance and notice rejections,
  input validation, managers refused, malformed JSON); 15 labelled findings listed with
  ground-truth IDs; reviews by the team manager and an ops partner accepted and kept in order,
  other managers and wrong roles refused; the dataset file's SHA-256 unchanged after reviews;
  404 / 400 error shapes.
- **CLI:** writes one CSV per table with schema-ordered headers, `metrics.json` / `metrics.md`,
  and the ground truth in its own folder (never next to the CSVs); fails cleanly on an unknown
  profile.

### Reproducibility

```bash
npm run reproduce -- --profile full
```

Generates the profile twice from scratch into temporary folders with seed `20261022`, compares
the row count, size and SHA-256 of all 48 output files, and compares them with the published
`data/<profile>/manifest.json`. Writes `reports/reproducibility.{json,md}`; exits 1 on any
difference. Result for the full profile: **48 / 48 files identical** across the two runs and
with the published manifest (391 MB, including the SQLite binary). No output file contains the
time it was generated, which is what makes this possible. The database file's header records the
SQLite version, so if Node/SQLite differ from the manifest's `environment`, that one file is
reported separately and every other file must still match.

## 8. Data model

| Document | Contents |
| --- | --- |
| [docs/data-dictionary.md](docs/data-dictionary.md) | Every field of all 21 tables: type, required/optional, allowed values, units, uniqueness, validation rule; ID conventions; ground-truth file layout |
| [docs/erd.md](docs/erd.md) | ER diagram, every FK with cardinality and optionality, N:M bridges, effective dates, lifecycle states |
| [docs/business-rules.md](docs/business-rules.md) | Actors, the 42 numbered rules (R-xx) behind every outcome, state machines, labelled anomalies, metrics, policy defaults |
| [sql/schema.sql](sql/schema.sql) | The executable schema (SQLite `STRICT` tables, PK/FK/UNIQUE/CHECK) |

**Tables.** The 10 core entities from the brief (Employee, Team, Skill, ShiftTemplate,
ShiftAssignment, LeaveRequest, HolidayCalendar, AttendanceEvent, CoverageRequirement,
SwapRequest), plus `labor_policy`, the `employee_skill` bridge, `leave_entitlement`, a `shift`
table (date × template), three append-only event tables and four derived tables.

**IDs.** From the brief: `EMP-000001`, `SHIFT-2026-01-01-A`, `LVE-2026-000001`,
`ATT-<employee-id>-<timestamp>` (e.g. `ATT-EMP-000001-20260101T055800`), `SWP-2026-000001`.
Added by this project: `TEAM-001`, `SKL-001`, `POL-FT-2026`, `HOL-2026-01-26`, `COV-000001`,
`ASG-2026-000001`, events `<parent-id>-E01`, labels `GT-000001`. Counters are zero-padded,
immutable and identical in every export.

**History.** Leave requests, swap requests and shift assignments keep their current status plus
an append-only event table. A swap or backfill creates a new assignment that points to the one
it replaces; nothing is overwritten.

**Integrity split.** The schema rejects structurally broken rows (bad IDs, impossible dates,
unknown enums, broken FKs, inconsistent derived columns). Cross-row business rules
(double booking, rest, overtime cap, swap approval) are checked by the validator, so the
deliberately injected anomalies can be loaded and then detected.

## 9. Edge cases and ground truth

After the clean baseline is built (and shown to break no rule), labelled cases are injected and
the derived tables are recomputed from the final records. Labels are written only to
`data/<profile>/ground_truth/ground_truth.csv` and `.json`; no input table or column marks a row
as injected.

| Case | Rule | How it is made | Full profile |
| --- | --- | --- | --- |
| Employee double-booked | R-SCH-01 | A second booking of a shift they already work, with a no-show on it | 20 |
| Approved leave overlaps an assigned shift | R-SCH-02 | A shift added inside an existing approved leave, with a no-show | 20 |
| Required skill absent | R-SCH-03 | A worked assignment switched to a team skill the person does not hold | 20 |
| Overtime cap exceeded | R-OVT-02 | A week's last clock-out moved past the remaining overtime budget | 20 |
| Swap applied without approval | R-SWP-06 | The `APPROVED` event removed from an applied swap | 20 |
| *Boundary:* overtime exactly at the cap | R-OVT-02 | Last clock-out set so overtime = cap | 10 |
| *Boundary:* leave ends the day before a shift | R-SCH-02 | Found in the data | 10 |
| *Boundary:* exactly 6 consecutive days | R-SCH-07 | Found in the data | 10 |
| *Boundary:* swap requested exactly 24 h ahead | R-SWP-04 | `requested_at` set to shift start − 24 h | 10 |

Each anomaly breaks only its own rule (the one expected side effect: an unapproved swap also
breaks its event chain, R-SWP-08), touches only the rows it names, and uses a different
employee from every other label. The exact-11-hour rest boundary cannot occur with the
configured templates, so a unit test covers it instead. Details:
[business rules §4](docs/business-rules.md#4-labelled-anomalies-and-boundary-cases).

`npm run validate` grades the detectors against this file: on the full dataset all 100
anomalies are found (recall and precision 100 % for every type), none of the 40 boundary cases
is flagged, and no finding falls outside the labels.

## 10. Assumptions

- The 90-day window is 2026-01-01 → 2026-03-31, single time zone (Asia/Kolkata, `+05:30`).
- The published roster (ShiftAssignment) is treated as master data; leave, swaps and attendance
  change it only through appended events.
- One of the 100 teams is a non-operational Workforce Office holding the HR and operations
  partners, so every HR decision and manual punch correction traces to a person.
- Managers, HR partners and ops partners are not rostered; employees stay in one team for the
  whole window.
- All data is synthetic. No real people, no external datasets. Names are random combinations
  of common given names and surnames.
- The holiday calendar is a synthetic company calendar modelled on common Indian holidays
  (New Year's Day, Makar Sankranti / Pongal, Republic Day, Holi, Eid al-Fitr). Dates of
  moveable festivals are approximate and not an authoritative list.

Full list: [tracking.md §9](tracking.md#9-open-questions--assumptions).

## 11. Key decisions & trade-offs _(Phase 10)_

## 12. Testing approach _(Phase 10)_

## 13. Known limitations & next steps _(Phase 10)_

Recorded so far:

- Injected assignments take the next free `ASG-` numbers, so their IDs sit after the creation
  order of their neighbours. The detectors never use ID order, but a model that did could tell
  injected rows apart. Renumbering would change baseline IDs, which must stay immutable.
- The starter profile is too small to place a swap exactly at the notice limit; the full profile
  has all reachable boundary types.
- Full-scale data files are not in git (391 MB); they are regenerated in about 21 s and checked
  against the committed manifest. The SQLite file's checksum only matches on the same SQLite
  version (recorded in the manifest).
- The dashboard has no sign-in: the reviewer is picked from the people the API allows for that
  finding. That suits a local demo; a real deployment would take the reviewer from the session.

## 14. Data provenance

Every record is generated by this repository's code from seed `20261022`. No external or personal
data is used: names are random combinations of common given names and surnames, and the holiday
calendar is a synthetic company calendar modelled on common Indian holidays (not an
authoritative list). Each profile's `manifest.json` records this provenance together with the
generator version, the SHA-256 of the configuration, the Node and SQLite versions, and the
checksum of every output file. If a public reference were ever used, its URL, version,
retrieval date, licence, attribution, transformations and discarded fields would be listed here
and in the manifest.

## 15. AI usage

See [ai-disclosure/](ai-disclosure/) for the prompt history and notes on where AI was used and
what was reviewed and validated by hand.
