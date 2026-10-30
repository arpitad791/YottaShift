# Project Tracking — YottaShift (Fair & Feasible Workforce Scheduling)

Single source of truth for the phase-based build. Update the phase table, the checklists, the
traceability matrix and the change log at the end of every phase.

---

## 1. Snapshot

| Item | Value |
| --- | --- |
| Project | **YottaShift** — YottaFlex AI candidate project: combine leave requests, shift coverage, skills and labour constraints into fair and feasible schedules |
| Window | 72 hours from YottaFlex's send timestamp — **fill in:** start `____` / deadline `____` (same time zone as the send email) |
| Delivery | Dedicated **public GitHub repo** `github.com/arpitad791/YottaShift`; link sent from the recruitment email address |
| Git | Commits and pushes are made by the candidate only; the AI assistant never commits or pushes |
| Build | Fully local, no paid or hosted services |
| Stack | Node.js 24 (ESM) · Express 5 · React 19 + Vite · SQLite (built-in `node:sqlite`) · `node:test` · ESLint + Prettier |
| Fixed seed | `20261022` |
| Current phase | Phase 1 — done; next: Phase 2 |

## 2. Working agreement

- Build in the phases below. A phase is done only when its exit criteria pass on a real run
  (tests, lint, format check, generator run where relevant) — not when the code is written.
- After every phase: tick the checklist, update §5 (traceability), §8 (decisions), §10 (change log)
  and the README sections that changed.
- Commit once per phase (or per meaningful step) with the suggested message, so the history shows
  how the work evolved (Submission Guideline 02).
- Comments explain *why* (a rule, a trade-off, a non-obvious formula), never restate the code.
- Nothing secret, personal or proprietary goes into the repo. All people data is synthetic.

## 3. Phase plan

| # | Phase | Main output | Status |
| --- | --- | --- | --- |
| 0 | Setup & planning | tracking.md, README skeleton, folder structure, tooling, AI-disclosure folder | ✅ Done |
| 1 | Domain design & data dictionary | data dictionary (all 10 entities + supporting tables), ERD + cardinality, lifecycle state machines, business-rule catalogue, `sql/schema.sql`, enum constants | ✅ Done |
| 2 | Generator core & master data | seeded RNG, ID helpers, scale profiles, LaborPolicy, Team, Skill, Employee, EmployeeSkill, LeaveEntitlement, ShiftTemplate, HolidayCalendar, Shift, CoverageRequirement | ⏳ Next |
| 3 | Transactions & events | LeaveRequest + rule-based decisions, scheduler (ShiftAssignment), AttendanceEvent, SwapRequest with manager approval — all with event history | ⬜ |
| 4 | Derived values & metrics | overtime, leave balances, coverage gaps, attendance reconciliation, fairness scores — computed from source records | ⬜ |
| 5 | Edge-case injection & ground truth | 5 required anomaly types + boundary cases, `ground_truth.csv/json` kept separate | ⬜ |
| 6 | Validation & evaluation | integrity checks, rule detectors, detector-vs-ground-truth scoring, validation summary | ⬜ |
| 7 | Export & reproducibility | CSV / JSON / SQL seed / SQLite DB, source manifest with checksums, two-run reproducibility proof | ⬜ |
| 8 | Express API | read endpoints for schedules, gaps, exceptions, history; manager actions append events | ⬜ |
| 9 | React dashboard | manager / HR / ops views of coverage, exceptions, swaps, leave, metrics | ⬜ |
| 10 | Hardening, docs & submission | full-scale timing, clean-clone run, final README, design notes, AI disclosure, submission checklist | ⬜ |

Suggested order of priority if time runs short: Phases 1–7 are the graded core (data generation,
validation, ground truth, reproducibility). Phases 8–9 make decisions and exceptions visible to the
actors. Phase 10 is non-negotiable.

---

## 4. Phase details

### Phase 0 — Setup & planning ✅

- [x] Read the problem statement, FAQ PDF and Submission Guidelines PDF; record every point (§5)
- [x] Choose stack and record why (§8 D-01 … D-06)
- [x] Create folder structure (§7) and root tooling: `package.json`, ESLint, Prettier, EditorConfig, `.gitignore`, `.nvmrc`
- [x] README skeleton with every section the guidelines ask for
- [x] `ai-disclosure/` folder for prompt history and AI-usage notes
- [x] Tooling verified: `npm install`, `npm run lint`, `npm run format:check`, `npm test` pass; lint rule bans `Math.random` (all randomness must come from the seeded RNG)

Exit criteria: lint and format check pass on the scaffold. Suggested commit: `chore: project scaffold, tooling and phased plan`

### Phase 1 — Domain design & data dictionary ✅

- [x] [`docs/data-dictionary.md`](docs/data-dictionary.md): **every field** of the 10 core entities plus supporting, event and derived tables (21 tables) — type, required/optional, allowed values, units, uniqueness, validation rule; ground-truth file layout; checks the schema cannot express
- [x] [`docs/erd.md`](docs/erd.md): Mermaid ERD; all 47 FK columns (35 relationship rows) with cardinality and optionality; the three N:M relationships and how each is resolved; effective-dated tables; lifecycle summary
- [x] Effective dates: `labor_policy`, `team`, `employee` (hire/termination), `employee_skill` (validity), `shift_template`, `coverage_requirement`, `leave_entitlement`
- [x] Lifecycle state machines (Mermaid) for LeaveRequest, SwapRequest, ShiftAssignment; Employee via effective dates; transitions encoded in `TRANSITIONS`
- [x] [`docs/business-rules.md`](docs/business-rules.md): 42 numbered rules (R-GEN, R-COV, R-SCH, R-LVE, R-SWP, R-ATT, R-OVT), actor matrix, anomaly + boundary labels, metrics M-01 … M-09, policy defaults
- [x] ID conventions finalised ([data dictionary §2](docs/data-dictionary.md#2-id-conventions)), including IDs the brief does not prescribe
- [x] [`sql/schema.sql`](sql/schema.sql): 21 `STRICT` tables with PK / FK / UNIQUE / CHECK; ID formats, real calendar dates, `+05:30` timestamps, derived columns (`iso_week`, `requested_days`, attendance ID, event IDs) checked in-row; deferred FKs for team ↔ manager/HR partner
- [x] [`src/domain/constants.js`](src/domain/constants.js) (enums, transitions, ID patterns) and [`src/domain/rules.js`](src/domain/rules.js) (rule catalogue, policy thresholds); [`src/db/database.js`](src/db/database.js) opens a DB with the schema applied
- [x] [`test/schema.test.js`](test/schema.test.js) — 25 tests: schema loads and accepts a consistent fixture covering all 21 tables; enum parity schema ↔ constants; transitions reference real states; ID patterns; rule parity code ↔ docs; 17 invalid rows each rejected by the **named** constraint; deferred FK enforced at commit; double-booking and unapproved swap stay loadable (R-GEN-03)

Verified: `npm test` 25/25 pass, `npm run lint` clean, `npm run format:check` clean (2026-10-30).
Suggested commit: `docs: data dictionary, ERD, business rules and SQL schema`

### Phase 2 — Generator core & master data

- [ ] `src/lib/rng.js`: seeded PRNG (no `Math.random` anywhere); helpers for int ranges, weighted pick, normal-ish draws, shuffle
- [ ] `src/lib/ids.js`: zero-padded deterministic ID formatters ([data dictionary §2](docs/data-dictionary.md#2-id-conventions)), checked against `ID_PATTERNS`; IDs never reassigned
- [ ] `src/lib/dates.js`: ISO-8601 date/time helpers, fixed `+05:30` offset, ISO weeks, overnight shift handling
- [ ] `config/generator.config.json`: seed, window, `starter` and `full` scale profiles (same generator, different numbers), labour policies, skill catalogue per team function, holiday list; every key validated at load
- [ ] Generators, parents first: LaborPolicy → Skill → Team (+ Workforce Office) → Employee (managers, HR/ops partners, members, leads) → EmployeeSkill (bridge) → LeaveEntitlement → ShiftTemplate → HolidayCalendar → Shift (date × template) → CoverageRequirement (incl. mid-window revisions)
- [ ] Realistic variation: uneven team sizes, skill rarity, full-time/part-time mix, hire dates and in-window joiners/leavers, expiring certifications, operating patterns, weekday/weekend/holiday staffing levels, some teams deliberately tight on supply (so gaps occur naturally)
- [ ] Master data loads into the schema with zero constraint errors (`createDatabase` + `insertRows`)
- [ ] Tests: ID formats, RNG determinism, profile scaling, every FK resolves, R-COV-02 pattern ↔ coverage rows, non-overlapping effective ranges

Exit criteria: `npm run generate -- --profile starter` writes master tables; tests pass.
Suggested commit: `feat(generator): seeded master data for teams, skills, employees, shifts, holidays, coverage`

### Phase 3 — Transactions & events

- [ ] LeaveRequest generation (5,000 at full scale) with types, notice periods, durations; decisions made by documented rules (balance, team leave cap, notice, sick-leave policy) — not random; decision reason code stored; every status change written to an event table
- [ ] Scheduler: assigns employees to shifts per team/skill coverage requirement, honouring approved leave, holidays, skills, weekly hour limit, minimum rest between shifts, maximum consecutive days; fairness-aware choice (balance hours, nights, weekends, holidays)
- [ ] Unfillable demand is **reported as a coverage gap**, never silently filled with an unqualified person
- [ ] AttendanceEvent: clock-in / clock-out per worked assignment with realistic jitter, late arrivals, early leave, overtime extensions, no-shows (absences) and unscheduled sick leave
- [ ] SwapRequest: employee-initiated swaps; manager approval by rule (qualification, constraints, notice); applied swaps create new assignment records and supersede old ones through events — history never overwritten
- [ ] Tests: no assignment on approved leave, rest/hour limits hold in the clean baseline, swap events form valid transition sequences

Exit criteria: clean baseline (before anomaly injection) has zero rule violations; tests pass.
Suggested commit: `feat(generator): leave decisions, scheduler, attendance and swap workflow with event history`

### Phase 4 — Derived values & metrics

- [ ] Overtime per employee-week from attendance (worked − contracted), capped-vs-actual comparison
- [ ] Leave balances: entitlement − approved days (per type), reconciled with leave records
- [ ] Coverage per shift × team × skill: required vs assigned vs attended → gap records
- [ ] Attendance reconciliation: every worked assignment has matching events; scheduled vs actual hours; absences classified
- [ ] Fairness: per-team spread of hours, night/weekend/holiday shifts (std-dev, Jain's index)
- [ ] KPI set M-01 … M-09 ([business rules §5](docs/business-rules.md#5-metrics)) written to `reports/metrics.json`
- [ ] Tests: hand-computed fixtures for overtime, balances and gaps

Exit criteria: every derived value recomputes identically from source tables. Suggested commit: `feat: derived overtime, balances, coverage gaps and fairness metrics`

### Phase 5 — Edge-case injection & ground truth

- [ ] Inject after the valid baseline, each with a label ([business rules §4](docs/business-rules.md#4-labelled-anomalies-and-boundary-cases)): double-booked employee, approved leave overlapping an assigned shift, required skill absent, overtime cap exceeded, swap applied without approval
- [ ] Boundary cases kept **valid** and labelled as such (overtime exactly at cap, rest exactly at minimum, leave ending the day before a shift, exactly max consecutive days, swap at the notice limit)
- [ ] Injection touches only the targeted rows; unrelated rows unchanged; counts configurable per profile
- [ ] `ground_truth/ground_truth.json` + `ground_truth.csv` in the layout of [data dictionary §10](docs/data-dictionary.md#10-ground-truth-file) — stored apart from inputs; no input column reveals a label
- [ ] Tests: every label points to real record IDs; no label leaks into input tables

Exit criteria: injected counts equal configured counts; leakage test passes. Suggested commit: `feat: labelled anomaly injection with separate ground truth`

### Phase 6 — Validation & evaluation

- [ ] Integrity checks: PK uniqueness, FK integrity (every join), allowed enums, date ordering, arithmetic reconciliation, lifecycle transitions, duplicate detection
- [ ] Rule detectors that find anomalies **from the data alone** (without reading ground truth)
- [ ] Evaluation: detector findings vs ground truth → precision / recall per issue type, confusion table
- [ ] Acceptance checks: coverage met or gaps reported; working-hour constraints hold (outside labelled anomalies); attendance reconciles; swap history preserved
- [ ] `reports/validation_summary.json` + `.md`; non-zero exit code when an integrity check fails
- [ ] Tests: each check fails on a purpose-built broken fixture

Exit criteria: all integrity checks pass on starter and full; recall = 1.0 for every injected type, any false positive explained.
Suggested commit: `feat(validation): integrity checks, anomaly detectors and ground-truth evaluation`

### Phase 7 — Export & reproducibility

- [ ] Export CSV + JSON per table, `sql/seed.sql` (INSERTs in parent→child order), SQLite database file
- [ ] `manifest.json`: generator command, seed, profile, generator version, timestamp-free content, per-file row count + SHA-256, provenance (synthetic; any public reference cited)
- [ ] `npm run reproduce`: generate twice with the same seed into separate folders, compare row counts and checksums, write `reports/reproducibility.md`
- [ ] Seed file loads into a fresh SQLite DB with FKs on
- [ ] Decide which profile outputs are committed (size check, §9 Q-04)

Exit criteria: both runs byte-identical; seed loads cleanly. Suggested commit: `feat(export): CSV/JSON/SQL seed, manifest and reproducibility check`

### Phase 8 — Express API

- [ ] `src/api`: Express 5 app over the SQLite DB; read endpoints for teams, employees, schedules, coverage gaps, exceptions, leave, swaps (with event history), metrics, validation summary
- [ ] Manager actions (approve / reject swap or leave) append events and re-run the affected checks — never update history in place
- [ ] Input validation, consistent error format, pagination for large tables
- [ ] Tests: endpoint tests with `node:test` against the starter DB

Exit criteria: API tests pass. Suggested commit: `feat(api): Express endpoints for schedules, exceptions and approvals`

### Phase 9 — React dashboard

- [ ] Add `"workspaces": ["client"]` to the root `package.json` once `client/package.json` exists (npm fails on an empty workspace folder)
- [ ] `client/` (Vite + React): Overview KPIs; Coverage (gaps by date/team/skill); Exceptions (detected anomalies + ground-truth match); Employee schedule with history trail; Leave and Swap queues for managers; Validation report
- [ ] Each view maps to an actor: manager, HR partner, IT/ops partner, system administrator, employee
- [ ] Builds with `npm run build`; no heavy UI libraries

Exit criteria: dashboard runs against the API locally. Suggested commit: `feat(client): dashboard for coverage, exceptions and approvals`

### Phase 10 — Hardening, docs & submission

- [ ] Full-scale run timed; one reasonable optimisation recorded with before/after numbers
- [ ] Fresh clone → `npm install` → documented commands work end to end
- [ ] README final: problem, assumptions, architecture, setup, run, verify, outputs, decisions, trade-offs, testing approach, limitations, next steps, deviations
- [ ] `docs/design-notes.md`: key decisions and trade-offs
- [ ] `ai-disclosure/`: prompt history, where AI accelerated, where relied on heavily, what was personally reviewed / changed / validated
- [ ] Secret/PII scan of the repo; licences of dependencies listed
- [ ] Submission checklist (§5.3) all green; repo public; link sent from the recruitment email

Suggested commit: `docs: final README, design notes and AI disclosure`

---

## 5. Requirement traceability matrix

Every point of the brief and both PDFs, mapped to the phase that delivers it and the evidence.
✅ = delivered; text after `·` says what a later phase still adds.

### 5.1 Problem statement

| ID | Requirement | Phase | Evidence |
| --- | --- | --- | --- |
| B-01 | Combine leave, shift coverage, skills and labour constraints into fair and feasible schedules | 3, 4 | scheduler + fairness metrics |
| B-02 | Expose key decisions and exceptions | 3, 6, 8, 9 | decision reason codes, exceptions report, dashboard |
| B-03 | Preserve traceability | 1, 3 | ✅ design: append-only `*_event` tables, `decision_rule_id` on every decision (R-GEN-01) · generation in Phase 3 |
| B-04 | Measurable outputs | 4, 6 | `metrics.json`, `validation_summary` |
| B-05 | Medium complexity: multiple related entities, conditional rules, ≥1 exception path, meaningful evaluation metrics | 1, 3, 6 | ✅ design: 21 tables, 42 conditional rules, exception paths (rejections, expiry, gaps, backfill), metrics M-01…M-09 · build Phases 3–6 |
| B-06 | Actors: employee, manager, HR partner, IT/ops partner, system administrator | 1, 9 | ✅ actor matrix in business-rules §1 (incl. Workforce Office for HR/ops partners) · dashboard views Phase 9 |
| W-01 | Master data first: Employee, Team, Skill, ShiftTemplate, ShiftAssignment | 2, 3 | generation order in code + README |
| W-02 | Dependent records use valid parent IDs | 2–3, 6 | FK checks |
| W-03 | Teams, skills, shift templates | 2 | master tables |
| W-04 | Minimum staffing per shift and skill | 2 | CoverageRequirement |
| W-05 | Leave requests and approval outcomes | 3 | LeaveRequest + events |
| W-06 | Attendance events | 3 | AttendanceEvent |
| W-07 | Assign shifts | 3 | ShiftAssignment |
| W-08 | Swaps with manager approval | 3 | SwapRequest + events |
| W-09 | Overtime and coverage gaps computed | 4 | derived tables |
| W-10 | State changes as explicit records/events; never overwrite history | 1, 3 | ✅ design: `*_event` tables, `supersedes_assignment_id`, status = last event (R-GEN-01) · generation Phase 3 |
| W-11 | Outcomes and ground-truth labels from documented rules, not random | 1, 3, 5 | ✅ design: every outcome cites an R-xx rule; randomness limited to inputs (business-rules intro) · Phases 3, 5 |
| E-01 | All 10 core entities present | 1 | ✅ data-dictionary §3 + schema.sql |
| E-02 | PK for every entity, FK for every relationship | 1 | ✅ schema.sql; erd.md §2 (all 47 FK columns) |
| E-03 | Cardinality, optional relationships, effective dates, lifecycle states documented | 1 | ✅ erd.md §2–§5, data-dictionary |
| E-04 | Bridge tables for N:M | 1 | ✅ `employee_skill` bridge; `shift_assignment`, `coverage_requirement` as associative entities (erd.md §3) |
| E-05 | Event history for state changes | 1, 3 | ✅ design: 3 event tables · populated Phase 3 |
| E-06 | Validate all joins | 6 | FK report |
| E-07 | Anomalies keep an issue_type / ground-truth label; unrelated rows untouched | 5 | ground_truth + injection test |
| N-01 | IDs: `EMP-000001`, `SHIFT-2026-01-01-A`, `LVE-2026-000001`, `ATT-<employee-id>-<timestamp>`, `SWP-2026-000001` | 2 | ✅ formats defined + enforced in schema and `ID_PATTERNS` · formatters Phase 2 |
| N-02 | Zero-padded counters, immutable IDs, identical across files | 2, 7 | ID tests, FK checks across CSV/JSON/SQL |
| S-01 | Step 1 data dictionary: type, required/optional, allowed values, units, uniqueness, validation rule | 1 | ✅ data-dictionary.md (all 21 tables) |
| S-02 | Step 2 parents before children/events | 2, 3 | generator order |
| S-03 | Step 3 deterministic IDs and naming | 2 | ids.js |
| S-04 | Step 4 volume: 2,000 employees, 100 teams, 90 days of shifts, 5,000 leave requests | 2, 3 | manifest row counts (full profile) |
| S-05 | Step 4 public holidays, absences, overtime caps, skill-specific staffing | 2, 3 | HolidayCalendar, absences, caps, CoverageRequirement |
| S-06 | Step 4 fixed seed 20261022; same generator for starter and full | 2 | config + CLI |
| S-07 | Step 5 valid baseline first, then labelled edge cases | 3, 5 | pipeline order, baseline test |
| S-08 | Step 6 derived values computed from source records | 4 | derive/ + reconciliation checks |
| S-09 | Step 7 separate ground_truth.csv/json, no leakage | 5 | ground_truth/, leakage test |
| S-10 | Step 8 validation: PK, FK, enums, date ordering, arithmetic reconciliation, lifecycle transitions, duplicates | 6 | validation_summary |
| S-11 | Step 9 export CSV/JSON/SQL seed + README, schema/dictionary, generator command, seed, source manifest, validation summary | 7 | output folder |
| S-12 | Step 10 regenerate twice with same seed; compare counts/checksums | 7 | reproducibility.md |
| X-01 | Edge case: employee double-booked | 5, 6 | ground truth + detector |
| X-02 | Edge case: approved leave overlaps assigned shift | 5, 6 | ground truth + detector |
| X-03 | Edge case: required skill absent | 5, 6 | ground truth + detector |
| X-04 | Edge case: overtime cap exceeded | 5, 6 | ground truth + detector |
| X-05 | Edge case: swap applied without approval | 5, 6 | ground truth + detector |
| A-01 | Coverage requirements met or gaps reported | 4, 6 | coverage gap report |
| A-02 | Working-hour constraints hold | 3, 6 | hour/rest checks |
| A-03 | Attendance reconciles with schedules | 4, 6 | reconciliation report |
| A-04 | Swap history preserved | 3, 6 | swap event chain check |
| V-01 | Realistic distributions and meaningful variation | 2, 3 | distribution stats in metrics |
| V-02 | Consistent IDs and valid joins | 6 | FK report |
| V-03 | Dependency/lifecycle consistency across entities | 6 | lifecycle checks |
| V-04 | Correct derived values and reconciliation | 4, 6 | reconciliation checks |
| V-05 | Normal, boundary, failure and exception coverage | 5, 6 | ground truth incl. boundary labels |
| V-06 | Separate ground truth | 5 | ground_truth/ |
| V-07 | Fixed-seed reproducibility, documentation, lawful provenance | 7, 10 | reproducibility.md, README, manifest provenance |
| P-01 | External data optional; if used record URL, version, retrieval date, licence, attribution, transformations, discarded fields | 2, 7 | manifest provenance + README |
| P-02 | No confidential/personal data; synthetic if licensing unclear | all | synthetic names, no real people |

### 5.2 FAQ PDF

| ID | Point | Phase | How we meet it |
| --- | --- | --- | --- |
| F-01 | 72-hour window from send timestamp; early submission allowed; latest version at deadline is evaluated | all | §1 window row; keep repo editable until deadline |
| F-02 | New dedicated public GitHub repo; link sent from the recruitment email | 10 | ✅ repo `arpitad791/YottaShift` created by the candidate · send link in Phase 10 |
| F-03 | Repo holds code, prompt history, supporting artifacts in a clearly identifiable directory | 0, 10 | `ai-disclosure/`, `docs/` |
| F-04 | Any AI tool allowed | — | disclosed in `ai-disclosure/` |
| F-05 | Prompt history: all prompts to every AI tool; responses optional; disclose export limits | 10 | `ai-disclosure/prompt-history.md` (§9 Q-02) |
| F-06 | Individual work; understand core logic, design choices, dependencies, limitations | all | design notes, walkthrough-ready README |
| F-07 | Own stack; free/local services; avoid large or slow dependencies | 0 | D-01 … D-06 (two runtime deps planned: Express, React) |
| F-08 | No hosted demo or test suite mandatory; clear setup/run steps and how core functionality was verified; environment needs and limitations | 10 | README "Verify" + "Limitations" |
| F-09 | Reuse only standard deps / small snippets; follow licences, attribute | 10 | dependency licence table in README |
| F-10 | Unclear requirements → reasonable assumptions; partial work OK if stated; explain deviations | all | §9 + README "Assumptions", "Deviations" |
| F-11 | No secrets, credentials, personal/sensitive info, proprietary code | all | `.gitignore`, synthetic data, scan in Phase 10 |

### 5.3 Submission Guidelines PDF (= submission checklist)

| ID | Point | Phase | How we meet it |
| --- | --- | --- | --- |
| G-01 | Make it run: working code + steps to install, configure, run, verify | 10 | README Quick start / Verify, clean-clone test |
| G-02 | Show your work: public repo, meaningful commits, supporting context | all | one commit per phase (§4) |
| G-03 | Use LLMs transparently: prompt history; where AI accelerated, where relied heavily, what you reviewed/changed/validated | 10 | `ai-disclosure/README.md` |
| G-04 | Make reasoning visible: problem, assumptions, decisions, trade-offs, testing approach, limitations, how you know it works | 1, 10 | README + `docs/design-notes.md` |
| G-05 | Artifact timestamps verify the window | all | commit inside the window |
| G-06 | Be ready to walk through the solution | 10 | walkthrough notes in design-notes |

---

## 6. Domain design (final, Phase 1)

The full design lives in the docs; this is the one-screen summary.

| Topic | Decision | Source |
| --- | --- | --- |
| Scenario | Synthetic multi-site operations company; 99 operational teams (customer support, warehouse, field service, security, IT NOC, facilities) + 1 Workforce Office (HR and ops partners) | [business rules §1](docs/business-rules.md#1-actors) |
| Window | 2026-01-01 → 2026-03-31 (90 days, ISO weeks W01–W14, partial first/last week); snapshot 2026-04-01 12:00; one time zone `+05:30` | [data dictionary §1](docs/data-dictionary.md#1-conventions) |
| Tables | 10 core entities + `labor_policy`, `employee_skill` (bridge), `leave_entitlement`, `shift`, 3 event tables, 4 derived tables = 21 | [data dictionary §3](docs/data-dictionary.md#3-table-catalogue) |
| Templates | A 06–14, B 14–22, C 22–06 (overnight, night), G 09–17; 8 paid hours | [data dictionary §4.7](docs/data-dictionary.md#47-shift_template--shifttemplate) |
| Rules | 42 rules R-GEN / R-COV / R-SCH / R-LVE / R-SWP / R-ATT / R-OVT, cited on every outcome | [business rules §2](docs/business-rules.md#2-rules) |
| Lifecycles | Leave, swap, assignment state machines; append-only events; status = last event | [business rules §3](docs/business-rules.md#3-lifecycles) |
| Anomalies | 5 required ANOMALY types + 5 BOUNDARY types, labels only in ground truth | [business rules §4](docs/business-rules.md#4-labelled-anomalies-and-boundary-cases) |
| Metrics | M-01 … M-09 (coverage, gaps, overtime, leave, swaps, attendance, reconciliation, fairness, detection) | [business rules §5](docs/business-rules.md#5-metrics) |
| Integrity split | Schema enforces structure; cross-row business rules are validator checks so anomalies stay loadable | R-GEN-03 |

## 7. Folder structure

```
YottaFlex.ai/  (repo: YottaShift)
├── README.md               # how to install, run, verify; decisions; limitations
├── tracking.md             # this file
├── package.json            # root package (generator, validator, API); client workspace added in Phase 9
├── config/                 # generator.config.json — seed + starter/full profiles (Phase 2)
├── sql/schema.sql          # ✅ 21 STRICT tables
├── docs/                   # ✅ data-dictionary.md, erd.md, business-rules.md; design-notes.md (Phase 10)
├── src/
│   ├── lib/                # rng, ids, dates, csv, hashing (Phase 2)
│   ├── domain/             # ✅ constants.js (enums, transitions, ID patterns), rules.js (rule catalogue, policy)
│   ├── generator/          # master data → transactions → events → anomalies
│   ├── scheduler/          # fair, constraint-aware shift assignment
│   ├── derive/             # overtime, balances, coverage gaps, fairness
│   ├── validation/         # integrity checks, detectors, ground-truth evaluation
│   ├── export/             # CSV, JSON, SQL seed, SQLite DB, manifest
│   ├── db/                 # ✅ database.js (open DB with schema, insert rows)
│   ├── api/                # Express app
│   └── cli/                # generate / validate / reproduce entry points
├── client/                 # React + Vite dashboard (workspace)
├── test/                   # ✅ schema.test.js, helpers/schema-fixture.js
├── data/                   # generated outputs per profile (starter, full)
└── ai-disclosure/          # prompt history and AI-usage notes
```

## 8. Decision log

| ID | Date | Decision | Why | Alternatives considered |
| --- | --- | --- | --- | --- |
| D-01 | 2026-10-30 | JavaScript end to end (Node 24 + Express + React) | Matches MERN skill set; one language for generator, API and UI | Python (pandas/Faker) |
| D-02 | 2026-10-30 | SQLite via built-in `node:sqlite` instead of MongoDB | Brief asks for SQL seed export, PK/FK, bridge tables and join validation — a relational store checks these natively; no DB server to install | MongoDB (would need a running server and gives no FK enforcement) |
| D-03 | 2026-10-30 | ESM modules, npm workspaces (root + `client/`) | One `npm install`; Vite/React are ESM-first | CommonJS, separate repos |
| D-04 | 2026-10-30 | Own seeded PRNG, no Faker | Full control over determinism; tiny code; no large dependency | Faker (large, version drift can change output) |
| D-05 | 2026-10-30 | `node:test` + ESLint 10 + Prettier 3 as devDependencies | Built-in runner, zero extra runtime deps | Jest, Vitest |
| D-06 | 2026-10-30 | Synthetic data only; holiday calendar is synthetic and labelled as such | Avoids licensing/provenance doubt (brief's public-data guidance) | Importing a public holiday dataset |
| D-07 | 2026-10-30 | Project name **YottaShift**, with a "not an official YottaFlex product" line in the README | Candidate's choice; the disclaimer avoids looking like company branding on a public repo | FairShift, Rosterly |
| D-08 | 2026-10-30 | Schema enforces structure only; cross-row business rules live in the validator (R-GEN-03) | Labelled anomalies (double booking, unapproved swap) must be loadable to be detected; a test proves both load | Unique/partial indexes that would reject them |
| D-09 | 2026-10-30 | Current status on the row + append-only `*_event` table, with status = last event checked by the validator | Fast reads for the API without losing history; satisfies "never overwrite history" | Event-sourcing only (status computed every read); status column only (loses history) |
| D-10 | 2026-10-30 | Explicit `shift` table (date × template) | Makes the brief's `SHIFT-2026-01-01-A` a real PK for assignments, coverage and attendance; derived `day_type` / `iso_week` checked in-row | Embedding date + template in every assignment |
| D-11 | 2026-10-30 | Workforce Office team for HR and ops partners; `team.hr_partner_employee_id`, `attendance_event.recorded_by_employee_id` | Every HR decision and manual punch traces to a real person (traceability, actor coverage) | Role-only actors with no employee ID |
| D-12 | 2026-10-30 | One time zone (`+05:30`) for all timestamps | Text order = time order; no DST; simple joins | Per-site zones with UTC storage |
| D-13 | 2026-10-30 | Weekly limits on ISO weeks, prorated by days in the window (R-SCH-08, R-OVT-01) | The window starts on a Thursday; proration keeps partial weeks fair | Rolling 7-day windows; pay weeks from the window start |
| D-14 | 2026-10-30 | Leave measured in calendar days, inclusive | Shift workers have no fixed weekend | Working days per employee pattern |
| D-15 | 2026-10-30 | Attendance outcome is derived (`attendance_reconciliation`), not an assignment status | Keeps plan vs actual separate so they can be reconciled (acceptance criterion) | `COMPLETED` / `NO_SHOW` assignment statuses |
| D-16 | 2026-10-30 | Enum, rule and transition lists are code constants with tests that keep them equal to schema and docs | One source of truth; drift breaks the build | Hand-kept copies |

## 9. Open questions & assumptions

| ID | Item | Status |
| --- | --- | --- |
| Q-01 | Dedicated repo needed (folder sat inside the home-directory repo). | ✅ Resolved — candidate ran `git init`, remote `arpitad791/YottaShift` |
| Q-02 | Prompt history: FAQ #6 asks for **all** prompts submitted to every AI tool. The final content of `ai-disclosure/prompt-history.md` is the candidate's call. | Waiting on user |
| Q-03 | 72-hour window start/deadline not yet recorded in §1. | Waiting on user |
| Q-04 | Whether the full-profile output is committed or regenerated on demand depends on its size (decide in Phase 7). | Open |
| A-01 | ShiftAssignment is treated as the published master roster; later changes are events. | Assumed |
| A-02 | A `shift` table (date × template) makes `SHIFT-2026-01-01-A` a real key (D-10). | Assumed |
| A-03 | Each employee belongs to one team for the whole window; team transfers are out of scope. | Assumed |
| A-04 | Managers, HR partners and ops partners do not fill coverage; leave is requested by schedulable employees only. | Assumed |
| A-05 | Breaks are paid and included in the 8-hour shift. | Assumed |
| A-06 | Leave dates fall inside the window; requests may be submitted before it. | Assumed |
| A-07 | Terminations happen only inside the window, so `employment_status` = `TERMINATED` iff `termination_date` is set. | Assumed |
| A-08 | One `employee_skill` row per employee × skill; certification renewals are out of scope (a lapsed certification just expires). | Assumed |
| A-09 | Cancelling approved leave does not restore assignments already cancelled for it. | Assumed |
| A-10 | Holiday calendar is a synthetic company calendar modelled on common Indian holidays, applied to all sites. | Assumed |

## 10. Change log

| Date | Phase | Change |
| --- | --- | --- |
| 2026-10-30 | 0 | Read brief + FAQ + submission guidelines; created phased plan, traceability matrix, folder structure, tooling, README skeleton, AI-disclosure folder |
| 2026-10-30 | 1 | Named the project YottaShift. Wrote data dictionary, ERD, business rules (42 rules, lifecycles, anomalies, metrics), `sql/schema.sql` (21 STRICT tables), domain constants and rule catalogue, DB helper and 25 schema tests. Added the Workforce Office team and HR/ops partner links for traceability. Decisions D-07 … D-16, assumptions A-03 … A-10 |
