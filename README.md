# Fair & Feasible Workforce Scheduling

YottaFlex AI candidate project. A seeded, reproducible synthetic dataset and a working scheduling
workflow that combine **leave requests, shift coverage, skills and labour constraints** into fair
and feasible schedules, expose every key decision and exception, keep full history, and produce
measurable outputs.

> **Status:** Phase 0 (setup & planning) complete. Phase-by-phase progress lives in
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

_(Phase 6–7: how to read the validation summary and reproducibility report.)_

## 8. Data model _(Phase 1)_

See `docs/data-dictionary.md`, `docs/erd.md` and `docs/business-rules.md`.

ID conventions from the brief: `EMP-000001`, `SHIFT-2026-01-01-A`, `LVE-2026-000001`,
`ATT-<employee-id>-<timestamp>`, `SWP-2026-000001`. All counters zero-padded and immutable.

## 9. Edge cases and ground truth _(Phase 5)_

Labelled anomalies: employee double-booked · approved leave overlaps assigned shift · required
skill absent · overtime cap exceeded · swap applied without approval. Valid boundary cases are
labelled too.

## 10. Assumptions

- The 90-day window is 2026-01-01 → 2026-03-31, single time zone (Asia/Kolkata, `+05:30`).
- The published roster (ShiftAssignment) is treated as master data; leave, swaps and attendance
  change it only through appended events.
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
