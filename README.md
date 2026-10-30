# YottaShift — Fair & Feasible Workforce Scheduling

> Candidate project for the YottaFlex AI recruitment drive. Not an official YottaFlex product.

A seeded, reproducible synthetic dataset and a working scheduling
workflow that combine **leave requests, shift coverage, skills and labour constraints** into fair
and feasible schedules, expose every key decision and exception, keep full history, and produce
measurable outputs.

> **Status:** Phases 0–3 complete: setup, domain design and schema, master data, and the
> transaction workflow (leave, scheduling, swaps, attendance). Phase-by-phase progress lives in
> [tracking.md](tracking.md). Sections marked _(Phase N)_ are filled in as that phase lands.

---

## 1. Problem

Build an end-to-end workflow for a workforce of 2,000 employees in 100 teams over 90 days:
create teams, skills and shift templates; define minimum staffing per shift and skill; generate
leave requests and approval outcomes; create attendance events; assign shifts; handle swaps with
manager approval; compute overtime and coverage gaps — with labelled anomalies, a separate ground
truth, validation, and fixed-seed reproducibility.

**Actors:** employee, manager, HR partner, IT/operations partner, system administrator.

## 2. What it produces _(Phases 2–7)_

- Master and transaction tables: Employee, Team, Skill, ShiftTemplate, ShiftAssignment,
  LeaveRequest, HolidayCalendar, AttendanceEvent, CoverageRequirement, SwapRequest (plus bridge
  and event-history tables)
- Derived outputs: overtime, leave balances, coverage gaps, attendance reconciliation, fairness
- `ground_truth.csv` / `ground_truth.json` for injected anomalies, kept apart from the inputs
- Exports as CSV, JSON, SQL seed and a SQLite database, with a source manifest (row counts +
  SHA-256), validation summary and reproducibility report

## 3. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 24 (ES modules) | One language across generator, API and UI |
| Storage | SQLite via built-in `node:sqlite` | PK/FK and join validation, SQL seed export, no server to install |
| API | Express 5 _(Phase 8)_ | Small, familiar |
| UI | React 19 + Vite _(Phase 9)_ | Dashboard for decisions and exceptions |
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
src/derive/      overtime, balances, coverage gaps, fairness
src/validation/  business-rule checks (anomaly detectors); integrity checks and evaluation in Phase 6
src/export/      CSV, JSON, SQL seed, SQLite DB, manifest
src/db/          SQLite access for the API
src/api/         Express app
src/cli/         generate / validate / reproduce entry points
client/          React dashboard
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
(`config/generator.config.json`). Output goes to `data/<profile>/csv/`, one file per table.
Before writing, the run loads every row into an in-memory copy of `sql/schema.sql`, so a
constraint violation stops it with an error and no files are written. Options:
`--out <dir>` (default `data`), `--config <file>`.

| Profile | Teams | Employees | Days | Leave requests | Swap requests |
| --- | --- | --- | --- | --- | --- |
| `starter` | 10 | 200 | 28 | 160 | 60 |
| `full` | 100 | 2,000 | 90 | 5,000 | 1,500 |

Currently generated (Phases 2–3): all 17 source tables. Full profile:

| Master data | Rows | Transactions and events | Rows |
| --- | --- | --- | --- |
| labour policies | 2 | leave requests | 5,000 |
| skills | 30 | leave request events | 10,089 |
| teams | 100 | shift assignments | 95,930 |
| employees | 2,000 | shift assignment events | 98,772 |
| employee skills | 3,179 | swap requests | 1,500 |
| leave entitlements | 5,658 | swap request events | 3,522 |
| shift templates / holidays / shifts | 4 / 5 / 360 | attendance events | 184,535 |
| coverage requirements | 1,490 | | |

A full run takes about 10 s: about 3.5 s to generate, the rest for SQLite to load and
constraint-check 400,000 rows. The starter profile takes under 1 s.

Still to come:

| Command | Does | Phase |
| --- | --- | --- |
| `npm run validate -- --profile full` | Integrity checks, anomaly detection, ground-truth evaluation | 6 |
| `npm run reproduce` | Generate twice with seed `20261022` and compare row counts + checksums | 7 |
| `npm run api` / `npm run client` | Local API and dashboard | 8–9 |

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

Fairness at full scale (Jain's index per team, 1.0 = perfectly even): nights 0.977, weekends
0.948, hours per contracted hour 0.994.

## 7. Verify

```bash
npm test
npm run lint
npm run format:check
```

`npm test` (130 tests, about 18 s, most of it generating and loading the full profile) covers:

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
- **CLI:** writes one CSV per table with schema-ordered headers; fails cleanly on an unknown
  profile.

_(Phase 6–7: how to read the validation summary and reproducibility report.)_

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

## 9. Edge cases and ground truth _(Phase 5)_

Labelled anomalies: employee double-booked · approved leave overlaps assigned shift · required
skill absent · overtime cap exceeded · swap applied without approval. Valid boundary cases are
labelled too.

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

## 14. Data provenance

Every record is generated by this repository's code from seed `20261022`. No external or personal
data is used. If a public reference is ever used, its URL, version, retrieval date, licence,
attribution, transformations and discarded fields will be listed here and in the manifest.

## 15. AI usage

See [ai-disclosure/](ai-disclosure/) for the prompt history and notes on where AI was used and
what was reviewed and validated by hand.
