# YottaShift — Fair & Feasible Workforce Scheduling

> Candidate project for the YottaFlex AI recruitment drive. Not an official YottaFlex product.

YottaShift generates a seeded, reproducible synthetic dataset for a 2,000-person workforce and
runs the full scheduling workflow on it: leave requests and decisions, skill-based rostering,
shift swaps with manager approval, attendance, overtime and coverage gaps. Every decision is
stored with the rule that made it, history is never overwritten, labelled anomalies are graded
against a separate ground truth, and two runs with the same seed are byte-identical. An API and
a dashboard expose the decisions and exceptions.

**Live demo:** dashboard at **https://yotta-shift.netlify.app** · API at
**https://yotta-shift-api.vercel.app/api/health** (full profile). Everything below also runs
locally.

## Setup

### Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | **24 or newer** (the project uses the built-in `node:sqlite`) | `node -v` |
| npm | comes with Node.js | `npm -v` |
| Git | any recent version | `git --version` |

No database server, Docker or external service is needed. Allow about 500 MB of disk space for
the dependencies and the full dataset.

### 1. Clone and install

```bash
git clone https://github.com/arpitad791/YottaShift.git
```

```bash
cd YottaShift
```

```bash
npm install
```

This installs the generator, validator and API, and the dashboard (an npm workspace) in one go.

### 2. Validate the committed sample

The small `starter` dataset (200 employees, 28 days) is committed, so it can be checked without
generating anything:

```bash
npm run validate -- --profile starter
```

The last line should read `Status PASS — report in data/starter/reports`.

### 3. Generate the full dataset

```bash
npm run generate -- --profile full
```

Takes about 20–25 s and writes 48 files (about 391 MB) to `data/full/`. The run ends with:

```
Ground truth: 100 anomalies, 40 boundary cases
Coverage filled 99.08 %, 686 short slots, 20 overtime cap breaches
Wrote 48 files (390.9 MB) + manifest.json to data/full
```

The full data is too large for git, so only its manifest, reports and ground truth are
committed; this step recreates the rest.

### 4. Validate the full dataset

```bash
npm run validate -- --profile full
```

Takes about 30 s and reads only the exported files. Expected result:

```
Detection: 100/100 anomalies (recall 1, precision 1); boundary flagged 0/40; unexplained findings 0
Acceptance: A-01 met, A-02 met, A-03 met, A-04 met
Status PASS — report in data/full/reports
```

### 5. Check reproducibility

```bash
npm run reproduce -- --profile full
```

Generates the dataset twice more from scratch and compares every file with the other run and with
the committed manifest. Takes about 40–50 s. Expected result:

```
Run A vs run B: 0 difference(s)
Run A vs published manifest: 0 difference(s)
IDENTICAL — report in data/full/reports
```

### 6. Run the tests

```bash
npm test
```

Takes about 30–40 s. Expected: `tests 225`, `pass 225`, `fail 0`. Code quality checks:
`npm run lint` and `npm run format:check`.

### 7. Open the dashboard

```bash
npm run client
```

Open `http://localhost:5173`. The dashboard calls the hosted API at
`https://yotta-shift-api.vercel.app` directly, so nothing else needs to run.

To use your own local API instead, start it in a first terminal:

```bash
npm run api -- --profile full
```

Wait for `Exceptions ready: 280 findings` (the API is then at `http://localhost:3001/api`, e.g.
`http://localhost:3001/api/health`), and start the dashboard in a second terminal with:

```bash
npm run client:local
```

### Commands at a glance

| Command | What it does |
| --- | --- |
| `npm run generate -- --profile <starter\|full>` | Builds the dataset from seed `20261022` into `data/<profile>/` (options: `--out <dir>`, `--config <file>`) |
| `npm run validate -- --profile <name>` | Checks the exported files: integrity, decision replay, anomaly detection vs ground truth, acceptance criteria (exit code 1 on failure) |
| `npm run reproduce -- --profile <name>` | Two fresh runs compared file by file and with the committed manifest (exit code 1 on any difference) |
| `npm test` | 225 unit and integration tests |
| `npm run lint` · `npm run format:check` | ESLint and Prettier |
| `npm run api -- --profile <name>` | Local API on port 3001 (options: `--port`, `--data`) |
| `npm run client` · `npm run client:build` | Dashboard on port 5173 using the hosted API · static build to `client/dist/` |
| `npm run client:local` | Dashboard on port 5173 using the local API from `npm run api` |

### Troubleshooting

- **`No such built-in module: node:sqlite`** — Node.js is older than 24; install Node.js 24 or
  newer.
- **Port 3001 already in use** — start the API on another port with
  `npm run api -- --profile full --port 3002`, and point the dashboard at it by setting
  `YOTTASHIFT_API=http://localhost:3002` before `npm run client` (PowerShell:
  `$env:YOTTASHIFT_API="http://localhost:3002"; npm run client`).
- **Dashboard header says "API not reachable at …"** — the address shown is the API it tried.
  For `localhost:3001`, start `npm run api -- --profile full` first; for the hosted URL, check
  the internet connection.
- **`reproduce` reports a different environment** — the SQLite file's bytes depend on the
  Node.js / SQLite versions (the manifest records Node 24.15.0, SQLite 3.51.3). That one file is
  reported separately; every other file must still match.

---

## 1. Problem

Build an end-to-end workflow for a workforce of 2,000 employees in 100 teams over 90 days:
create teams, skills and shift templates; define minimum staffing per shift and skill; generate
leave requests and approval outcomes; create attendance events; assign shifts; handle swaps with
manager approval; compute overtime and coverage gaps — with labelled anomalies, a separate ground
truth, validation, and fixed-seed reproducibility.

**Actors:** employee, manager, HR partner, IT/operations partner, system administrator.

## 2. What it produces

- Master and transaction tables for the 10 entities of the brief (Employee, Team, Skill,
  ShiftTemplate, ShiftAssignment, LeaveRequest, HolidayCalendar, AttendanceEvent,
  CoverageRequirement, SwapRequest), plus bridge and event-history tables
- Derived tables recomputed from them: weekly hours and overtime, coverage status (gaps), leave
  balances, attendance reconciliation
- Metrics M-01 … M-08, a validation summary with detection precision / recall (M-09), and a
  reproducibility report
- A separate ground truth for the injected anomalies and boundary cases
- Every table as CSV and JSON, a SQL seed and a ready SQLite database — all four hold identical
  data — and a manifest with the row count, size and SHA-256 of every file

```
data/<profile>/
├── sqlite/yottashift.db      schema + every row, ready to query
├── csv/<table>.csv           21 tables
├── json/<table>.json         the same rows as JSON
├── sql/seed.sql              data-only INSERTs; load after sql/schema.sql
├── ground_truth/             labels, kept apart from the inputs
├── reports/                  metrics, validation summary, reproducibility report (JSON + Markdown)
└── manifest.json             rows, bytes and SHA-256 of every file + seed, config, environment, provenance
```

| Profile | Teams | Employees | Days | Leave requests | Swap requests | In git |
| --- | --- | --- | --- | --- | --- | --- |
| `starter` | 10 | 200 | 28 | 160 | 60 | everything (12 MB) |
| `full` | 100 | 2,000 | 90 | 5,000 | 1,500 | manifest, reports and ground truth (data is 391 MB) |

Both profiles use the same generator and seed; only the scale differs
(`config/generator.config.json`). The full profile holds 583,330 rows, including 95,970 shift
assignments, 184,575 attendance events and 46,320 coverage cells. File layout:
[data dictionary §12](docs/data-dictionary.md#12-export-files).

**Key metrics, full profile** (`data/full/reports/metrics.md`; in brackets the clean baseline,
where the labelled anomalies move it):

| Metric | Value |
| --- | --- |
| M-01 Coverage filled by qualified staff / by staff who clocked in | 99.08 % / 97.50 % (99.10 % / 97.52 %) |
| M-02 Short slots · missing headcount-hours | 686 · 6,896 h (669 · 6,752 h) |
| M-03 Employee-weeks with overtime · max weekly overtime · cap breaches | 7,371 · 13.48 h · 20 (max 12 h, 0 breaches) |
| M-04 Leave approval rate: annual / casual / sick / unpaid | 63 % / 79 % / 91 % / 81 % |
| M-05 Swap approval of manager decisions · expiry rate | 40 % · 10.5 % (41 %) |
| M-06 Punctuality · no-shows · extensions | 93.1 % · 1.6 % · 9.4 % |
| M-07 Due shifts with a complete record · worked ÷ scheduled (present) | 99.83 % · 101.4 % |
| M-08 Fairness (Jain's index, mean across teams): nights / weekends / holidays / hours per contract | 0.977 / 0.948 / 0.907 / 0.994 |

The 20 cap breaches are exactly the 20 labelled `OVERTIME_CAP_EXCEEDED` cases; the extra short
slots come from the `SKILL_ABSENT` cases.

## 3. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 24 (ES modules) | One language across generator, API and UI |
| Storage | SQLite via built-in `node:sqlite` | PK/FK and join validation, SQL seed export, no server to install |
| API | Express 5.2.1 | Small and familiar; Express 5 forwards thrown errors to one handler |
| UI | React 19.3.1 + Vite 8.3.4, hand-built SVG charts | Dashboard without a UI or chart library |
| Tests | `node:test` | Built in, no extra dependency |
| Quality | ESLint 10, Prettier 3 | Lint and consistent formatting |

**Dependencies and licences.** All direct dependencies are pinned to exact versions and are
MIT-licensed. The generator, validator and exports use only Node's standard library. Two small
public-domain algorithms are re-implemented in [src/lib/rng.js](src/lib/rng.js) and attributed
there: the sfc32 generator (Chris Doty-Humphrey, PractRand) and the cyrb128 string hash (bryc).
No data or other code is taken from elsewhere.

| Package | Version | Licence | Used for |
| --- | --- | --- | --- |
| express | 5.2.1 | MIT | API |
| react, react-dom | 19.3.1 | MIT | Dashboard |
| vite, @vitejs/plugin-react | 8.3.4, 6.1.2 | MIT | Dashboard build and dev server |
| eslint, @eslint/js, globals | 10.13.0, 10.0.1, 17.13.0 | MIT | Linting |
| prettier | 3.9.10 | MIT | Formatting |

Transitive packages are MIT, ISC, Apache-2.0, BSD-2/3-Clause and BlueOak-1.0.0, plus MPL-2.0
for `lightningcss`, a build-time tool inside Vite that is not shipped in the app.

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
src/cli/         generate / validate / reproduce / api entry points
client/          React dashboard (npm workspace)
test/            unit and integration tests
data/            generated datasets per profile
ai-disclosure/   prompt history and AI-usage notes
```

## 5. API and dashboard

### API

`npm run api -- --profile full` serves `data/<profile>/` at `http://localhost:3001/api`. It opens
the dataset's SQLite file **read-only**, so the published files and their checksums never
change. Errors use one shape, `{ "error": { "code", "message" } }` (400 bad parameter or ID
format, 403 wrong reviewer, 404 unknown ID or route, 422 not applicable). Lists take `limit`
(1–500, default 50) and `offset`, and return `{ data, page: { limit, offset, total } }`.

| Method & path | Returns | For |
| --- | --- | --- |
| `GET /health` | Profile, seed, window, row counts, ground-truth counts | admin |
| `GET /metrics`, `GET /validation`, `GET /reproducibility` | The three reports (404 with the command to create a missing one) | admin, HR |
| `GET /skills`, `GET /teams`, `GET /teams/:teamId` | Teams with manager, HR partner, members, requirements, coverage totals | manager, HR |
| `GET /employees?teamId&role&employmentType&q`, `GET /employees/:employeeId` | Employee with skills, leave balances, weekly hours and overtime | manager, HR, employee |
| `GET /employees/:employeeId/schedule?from&to` | Every assignment with shift times, status, history links and attendance outcome | employee, manager |
| `GET /coverage?date&teamId&skillId&status`, `GET /coverage/daily?teamId` | Coverage per shift × team × skill, and per-day totals | manager, ops |
| `GET /assignments/:assignmentId` | Assignment with its events, punches, reconciliation, and what it replaced / was replaced by | manager, ops |
| `GET /leave?status&type&reason&teamId&employeeId`, `GET /leave/:id` | Leave with decision rule, event history and the roster changes it caused | employee, manager, HR |
| `POST /leave/evaluate` | **What-if:** the decision the rules would give a new request; nothing is stored | employee, HR |
| `GET /swaps?status&type&reason&teamId`, `GET /swaps/:id` | Swap with decision rule, events, and the assignments it moved and created | employee, manager |
| `GET /exceptions?ruleId&issueType&kind&teamId&employeeId&reviewStatus`, `GET /exceptions/summary`, `GET /exceptions/:findingId` | Business-rule findings with stable IDs, ground-truth match and review trail | manager, HR, ops |
| `POST /exceptions/:findingId/reviews` | Append a review (`ACKNOWLEDGED` / `RESOLVED` / `DISMISSED`) by the team's manager or HR partner, or an ops partner for attendance / overtime findings | manager, HR, ops |
| `GET /ground-truth?labelClass` | The labels, for comparing detections | admin |

Reviews are the only write. They are appended to a separate, git-ignored database
(`data/<profile>/api/reviews.db`) that is not part of the dataset. Leave and swap requests
cannot be approved through the API: the dataset is a closed snapshot in which every request is
already resolved by its documented rule, and changing one would break the published checksums.

### Dashboard

`npm run client` opens the dashboard at `http://localhost:5173`, using the hosted API
(`npm run client:local` uses the local one). The dashboard calls the API directly; the API sends
CORS headers so the dashboard can be served from any address.

| View | For | Shows |
| --- | --- | --- |
| Overview | HR partner, system administrator | Coverage fill (planned vs clocked in), short slots, overtime breaches, leave and swap approval rates, punctuality, fairness, anomalies detected; per-day charts; teams with the most missing hours |
| Coverage | Manager, IT / ops partner | Per-team daily fill and missing headcount, and every short slot by date |
| Exceptions | Manager, HR partner, ops partner | Findings by rule with filters, each finding's records, ground-truth label and review trail; adding a review |
| People | Employee, manager | A person's policy, skills, leave balances and requests, weekly hours against the overtime cap, and full schedule |
| Assignment | Manager, ops partner | One assignment's status history, punches, reconciled outcome and replacement links |
| Leave & swaps | Employee, manager, HR partner | Requests with the deciding rule, full history and roster changes; the leave what-if form |
| Validation | System administrator | Acceptance criteria, detection per anomaly type, boundary cases, integrity and replay checks, reproducibility |

Every ID links to the view that explains it, and every view has its own URL
(`#/people/EMP-000101`), so a finding can be shared as a link.

### Hosted deployment (optional)

The local setup above is the reference way to run the project. The hosted copy runs the full
profile: the dashboard at **https://yotta-shift.netlify.app** and the API at
**https://yotta-shift-api.vercel.app/api** (for example
[`/api/health`](https://yotta-shift-api.vercel.app/api/health)). After an idle period the first
Exceptions page can take several seconds while the API computes the findings.

- **API on Vercel** — import the repository with the root as the project folder. `vercel.json`
  generates the full dataset during the build and bundles the SQLite file (read-only) with the
  function in [`api/index.js`](api/index.js). No separate database is needed. Reviews are kept
  in `/tmp`, so on the hosted demo they last only as long as the function instance.
- **Dashboard on Netlify** — import the same repository with the root as the base directory.
  `netlify.toml` builds `client/dist`; the built dashboard calls the Vercel API URL directly.

## 6. How it works

**Master data, parents first:** labour policies → skills → teams and employees → employee
skills → leave entitlements → shift templates → holidays → shifts → coverage requirements.
Randomness comes only from one seeded generator with a separate named stream per step, so
changing one step never shifts another step's numbers. Teams differ in function, skill pool,
operating pattern (24×7, extended hours, business hours) and size; about 15 % of members are
part-time; there are joiners, leavers and certifications that lapse mid-window. Each team's
minimum staffing is sized from the real weekly hours of its members, so coverage gaps come from
the data rather than being injected.

**The workflow** runs on one timeline in time order, so every decision only sees what happened
before it. Behaviour (who asks for leave, how late someone is) is seeded input; every
**outcome** comes from a numbered rule in [docs/business-rules.md](docs/business-rules.md) and is
stored with that rule's ID.

1. **Leave** — 5,000 requests decided in decision-time order: employment, overlap, balance, sick
   auto-approval, notice, team leave cap. Managers decide up to 5 days, the HR partner longer and
   unpaid leave, the system sick call-ins. *Full profile:* 3,696 approved, 1,122 rejected,
   93 withdrawn, 89 cancelled.
2. **Roster** — each ISO week is published 7 days ahead. The scheduler fills the required
   headcount per skill with eligible people only (skill valid, employed, not on leave, one shift
   a day, 11 h rest, ≤ 6 days in a row, weekly hour limit), choosing by a fairness key.
   Unfillable demand stays a **gap**, never an unqualified fill.
3. **Late leave** — leave approved after publication cancels the affected shifts (as events) and
   backfills them when someone eligible exists. *Full profile:* 1,590 backfills.
4. **Swaps** — 1,500 requests, decided by the team manager against the roster at decision time,
   expired after 48 h, or cancelled. Approved swaps create new assignments linked to the ones they
   replace. *Full profile:* 522 applied, 750 rejected, 158 expired, 70 cancelled.
5. **Attendance** — clock-in / out per worked shift, late arrivals, early leaves, extensions,
   no-shows, and missing clock-outs corrected by an ops partner. *Full profile:* 184,575 events.

**Derived tables** are computed only from the source tables, and the schema re-checks their
arithmetic: `employee_week_summary` (contracted, scheduled, worked and overtime hours per ISO
week), `coverage_status` (required, assigned, qualified and attended headcount per shift × team ×
skill), `leave_balance` (entitlement − approved days) and `attendance_reconciliation` (worked,
late, early and extension minutes and the outcome per shift).

## 7. Verify

### Validation

`npm run validate` reads **only the exported files**, writes
`data/<profile>/reports/validation_summary.json` and `.md`, and exits with code 1 if anything is
wrong.

| Section | What it proves | Full profile |
| --- | --- | --- |
| I-01 … I-12 structural integrity | Headers; schema load (types, CHECKs, FKs); primary and unique keys; all 47 FK columns; enums; ID formats; date order; duplicates; event chains; cross-table consistency; derived tables recompute exactly | 0 failures over 583,330 rows |
| I-13 export formats | JSON, SQL seed and SQLite database hold exactly the CSV rows | 63 / 63 tables identical |
| D-01 leave replay | Every leave decision re-run through the rules from the exported data | 5,000 / 5,000 identical |
| D-02 swap decisions | Team, skill, notice, deadline, apply window and links consistent with each outcome | 7,075 checks, 0 failures |
| Detection (M-09) | Detector findings vs ground truth: precision, recall, boundary cases, unexplained findings | 100 / 100 detected, precision 100 %, 0 / 40 boundary flagged |
| Acceptance A-01 … A-04 | Gaps reported; working-hour rules hold; attendance reconciles; swap history preserved | all met |

**Status** is PASS only when every structural check and decision replay is clean, every
labelled anomaly is found by its own detector, no finding falls outside the labels, no boundary
case is flagged and every acceptance criterion is met.

### Tests and code quality

`npm test` runs 225 tests:

- **Rules on hand-built fixtures** — every leave, scheduling and swap rule, and every derived
  number (overtime, worked time, reconciliation outcomes, coverage, balances) against values
  worked out by hand.
- **Whole datasets, both profiles** — exact volumes from the brief, FK-clean loads, zero
  business-rule violations in the clean baseline, every anomaly detected and no boundary flagged,
  byte-identical regeneration.
- **Negative tests** — 17 kinds of broken rows rejected by the schema; every validation check
  and detector run on a copy of the data broken on purpose must fail; the CLI exits 1.
- **Exports** — the manifest matches every file, the database passes `PRAGMA integrity_check`,
  the seed loads into a fresh schema, and `reproduce` fails when the manifest disagrees.
- **API** — 24 tests against a freshly generated dataset: every endpoint, the what-if, review
  permissions, error shapes, and the dataset file unchanged after reviews.

### Reproducibility

`npm run reproduce` generates the profile twice from scratch with seed `20261022` and compares
the row count, size and SHA-256 of all 48 output files with each other and with the committed
`manifest.json`. Result for the full profile: **48 / 48 files identical** (391 MB). No output
file contains the time it was generated, which is what makes this possible.

## 8. Data model

| Document | Contents |
| --- | --- |
| [docs/data-dictionary.md](docs/data-dictionary.md) | Every field of all 21 tables: type, required/optional, allowed values, units, uniqueness, validation rule; ID conventions; ground-truth file layout |
| [docs/erd.md](docs/erd.md) | ER diagram, every FK with cardinality and optionality, N:M bridges, effective dates, lifecycle states |
| [docs/business-rules.md](docs/business-rules.md) | Actors, the 42 numbered rules behind every outcome, state machines, labelled anomalies, metrics, policy defaults |
| [sql/schema.sql](sql/schema.sql) | The executable schema (SQLite `STRICT` tables, PK/FK/UNIQUE/CHECK) |

**IDs.** From the brief: `EMP-000001`, `SHIFT-2026-01-01-A`, `LVE-2026-000001`,
`ATT-<employee-id>-<timestamp>` (e.g. `ATT-EMP-000001-20260101T055800`), `SWP-2026-000001`.
Added by this project: `TEAM-001`, `SKL-001`, `POL-FT-2026`, `HOL-2026-01-26`, `COV-000001`,
`ASG-2026-000001`, events `<parent-id>-E01`, labels `GT-000001`. Counters are zero-padded,
immutable and identical in every export.

**History.** Leave requests, swap requests and shift assignments keep their current status plus
an append-only event table. A swap or backfill creates a new assignment that points to the one
it replaces; nothing is overwritten.

**Integrity split.** The schema rejects structurally broken rows; cross-row business rules
(double booking, rest, overtime cap, swap approval) are checked by the validator, so the
deliberately injected anomalies can be loaded and then detected.

## 9. Edge cases and ground truth

The clean baseline is built first and shown to break no rule; labelled cases are then injected
and the derived tables recomputed. Labels are written only to
`data/<profile>/ground_truth/ground_truth.csv` and `.json`; no input table or column marks a row
as injected.

| Case | Rule | How it is made | Full profile |
| --- | --- | --- | --- |
| Employee double-booked | R-SCH-01 | A second booking of a shift they already work, with a no-show on it | 20 |
| Approved leave overlaps an assigned shift | R-SCH-02 | A shift added inside an existing approved leave | 20 |
| Required skill absent | R-SCH-03 | A worked assignment switched to a team skill the person does not hold | 20 |
| Overtime cap exceeded | R-OVT-02 | A week's last clock-out moved past the remaining overtime budget | 20 |
| Swap applied without approval | R-SWP-06 | The `APPROVED` event removed from an applied swap | 20 |
| *Boundary:* overtime exactly at the cap | R-OVT-02 | Last clock-out set so overtime = cap | 10 |
| *Boundary:* leave ends the day before a shift | R-SCH-02 | Found in the data | 10 |
| *Boundary:* exactly 6 consecutive days | R-SCH-07 | Found in the data | 10 |
| *Boundary:* swap requested exactly 24 h ahead | R-SWP-04 | `requested_at` set to shift start − 24 h | 10 |

Each anomaly breaks only its own rule (the one expected side effect: an unapproved swap also
breaks its event chain, R-SWP-08), touches only the rows it names, and uses a different employee
from every other label. Details:
[business rules §4](docs/business-rules.md#4-labelled-anomalies-and-boundary-cases).

## 10. Assumptions

- The 90-day window is 2026-01-01 → 2026-03-31, single time zone (Asia/Kolkata, `+05:30`).
- The published roster (ShiftAssignment) is treated as master data; leave, swaps and attendance
  change it only through appended events.
- One of the 100 teams is a non-operational Workforce Office holding the HR and operations
  partners, so every HR decision and manual punch correction traces to a person.
- Managers, HR partners and ops partners are not rostered; employees stay in one team for the
  whole window.
- All data is synthetic: names are random combinations of common given names and surnames, and
  the holiday calendar is a synthetic company calendar modelled on common Indian holidays (dates
  of moveable festivals are approximate).

Full list: [tracking.md §9](tracking.md#9-open-questions--assumptions).

## 11. Key decisions & trade-offs

The reasoning, architecture, trade-offs and a walkthrough are in
[docs/design-notes.md](docs/design-notes.md); every decision with its rejected alternatives is in
[tracking.md §8](tracking.md#8-decision-log). In short:

- **Outcomes come from numbered rules; randomness only drives behaviour**, so every decision can
  be explained and replayed.
- **One chronological timeline** for leave, roster publication, backfills, swaps and attendance,
  so no decision can see the future.
- **One implementation of each policy:** the same leave engine decides, replays and powers the
  what-if.
- **The schema enforces structure, the validator enforces business rules**, so labelled anomalies
  stay loadable and must be detected.
- **Clean baseline first, then one-rule anomalies on separate employees**, so precision and recall
  measure the detectors rather than noise.
- **No timestamps in outputs** and named random streams, so two runs are byte-identical.
- **SQLite instead of MongoDB**, because the brief asks for keys, joins and a SQL seed.
- **Deviation:** the API does not approve or reject requests (the dataset is a closed, checksummed
  snapshot); managers act through exception reviews and the leave what-if instead.

## 12. Testing approach

1. **Rule-level unit tests on hand-built fixtures**, with every expected value worked out by hand.
2. **Whole-dataset property tests on both profiles**: volumes, FK-clean loads, a clean baseline,
   every anomaly detected, byte-identical regeneration.
3. **Negative tests**: every validation check and detector must fail on data broken on purpose.
4. **End-to-end checks on the delivered files**: `npm run validate`, `npm run reproduce`, a clean
   clone running every command in this README, and the dashboard checked in a browser.

## 13. Known limitations & next steps

- Full-scale data is not in git (391 MB); it is regenerated in about 25 s and checked against the
  committed manifest. The SQLite file's checksum only matches on the same SQLite version.
- Injected assignments take the next free `ASG-` numbers, so their IDs sit after their
  neighbours' creation order. No detector uses ID order; renumbering would break immutable IDs.
- The starter profile is too small for a swap exactly at the notice limit, and the exact-11-hour
  rest boundary cannot occur with the configured templates (a unit test covers it).
- Swap decisions are checked against static rules in the validator, not fully replayed against
  the roster at decision time.
- The dashboard has no sign-in: the reviewer is picked from the people the API allows. A real
  deployment would take the reviewer from the session.
- Simplifications by design: one time zone, leave in calendar days, one team per employee, no
  certification renewals, paid breaks inside the 8-hour shift.

Next steps: make requests actionable on a copy of the dataset with the same rule engine; full
swap replay in the validator; sign-in with roles; per-site time zones and working-day leave
counting; a comparison of the fair scheduler with a simple greedy baseline on M-01 and M-08.

## 14. Data provenance

Every record is generated by this repository's code from seed `20261022`. No external or personal
data is used. Each profile's `manifest.json` records this provenance together with the generator
version, the SHA-256 of the configuration, the Node.js and SQLite versions, and the checksum of
every output file.

## 15. AI usage

See [ai-disclosure/](ai-disclosure/) for the prompt history and notes on how AI was used.
