# YottaShift — Fair & Feasible Workforce Scheduling

> Candidate project for the YottaFlex AI recruitment drive. Not an official YottaFlex product.

A seeded, reproducible synthetic dataset and a working scheduling
workflow that combine **leave requests, shift coverage, skills and labour constraints** into fair
and feasible schedules, expose every key decision and exception, keep full history, and produce
measurable outputs.

> **Status:** Phases 0–1 (setup, domain design, schema) complete. Phase-by-phase progress lives in
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
src/lib/         seeded RNG, ID, date, CSV and hashing helpers
src/domain/      enums and rule constants
src/generator/   master data → transactions → events → anomalies
src/scheduler/   fair, constraint-aware shift assignment
src/derive/      overtime, balances, coverage gaps, fairness
src/validation/  integrity checks, anomaly detectors, ground-truth evaluation
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

## 6. Run _(Phases 2–9)_

Commands are added as each phase lands. Planned:

| Command | Does |
| --- | --- |
| `npm run generate -- --profile starter` | Small dataset with the same generator and seed |
| `npm run generate -- --profile full` | 2,000 employees, 100 teams, 90 days, 5,000 leave requests |
| `npm run validate -- --profile full` | Integrity checks, anomaly detection, ground-truth evaluation |
| `npm run reproduce` | Generate twice with seed `20261022` and compare row counts + checksums |
| `npm run api` / `npm run client` | Local API and dashboard |

## 7. Verify

```bash
npm test
npm run lint
npm run format:check
```

`npm test` currently runs the schema suite: the schema loads into SQLite and accepts a fully
consistent fixture touching all 21 tables; enum, rule and lifecycle lists match between code,
schema and docs; 17 kinds of broken rows are each rejected by the constraint that should catch
them; labelled anomalies remain loadable.

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
- All data is synthetic. No real people, no external datasets.

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
