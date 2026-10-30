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
| Current phase | Phase 9 — done; next: Phase 10 |

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
| 2 | Generator core & master data | seeded RNG, ID helpers, scale profiles, LaborPolicy, Team, Skill, Employee, EmployeeSkill, LeaveEntitlement, ShiftTemplate, HolidayCalendar, Shift, CoverageRequirement | ✅ Done |
| 3 | Transactions & events | LeaveRequest + rule-based decisions, scheduler (ShiftAssignment), AttendanceEvent, SwapRequest with manager approval — all with event history | ✅ Done |
| 4 | Derived values & metrics | overtime, leave balances, coverage gaps, attendance reconciliation, fairness scores — computed from source records | ✅ Done |
| 5 | Edge-case injection & ground truth | 5 required anomaly types + boundary cases, `ground_truth.csv/json` kept separate | ✅ Done |
| 6 | Validation & evaluation | integrity checks, rule detectors, detector-vs-ground-truth scoring, validation summary | ✅ Done |
| 7 | Export & reproducibility | CSV / JSON / SQL seed / SQLite DB, source manifest with checksums, two-run reproducibility proof | ✅ Done |
| 8 | Express API | read endpoints for every entity with full histories; exception reviews (append-only, separate store); leave what-if on the real rule engine | ✅ Done |
| 9 | React dashboard | manager / HR / ops views of coverage, exceptions, swaps, leave, metrics | ✅ Done |
| 10 | Hardening, docs & submission | full-scale timing, clean-clone run, final README, design notes, AI disclosure, submission checklist | ⏳ Next |

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

### Phase 2 — Generator core & master data ✅

- [x] [`src/lib/rng.js`](src/lib/rng.js): sfc32 PRNG seeded by a cyrb128 hash of `seed:stream`; `int`, `float`, `chance`, `pick`, `weighted`, `shuffle`, `normal`, `fork` (independent named streams per step)
- [x] [`src/lib/ids.js`](src/lib/ids.js): formatter per ID kind, each checked against `ID_PATTERNS` (overflow throws); per-key counters for year-based IDs
- [x] [`src/lib/dates.js`](src/lib/dates.js): dates, ISO weekday/week, `+05:30` timestamps, minute arithmetic across midnight, compact timestamps for `ATT-` IDs; [`allocate.js`](src/lib/allocate.js) (largest remainder), [`csv.js`](src/lib/csv.js) (RFC 4180, LF)
- [x] [`config/generator.config.json`](config/generator.config.json) + [`src/generator/config.js`](src/generator/config.js): seed, window, `starter` / `full` profiles, labour policies, workforce mix, sites, operating patterns, 6 team functions with skill pools, Workforce Office, templates, holidays, coverage sizing, entitlements; strict validation (missing/unknown keys, shares sum to 1, enums, dates, certification validity > window)
- [x] Generators in [`src/generator/master/`](src/generator/master/), parents first: LaborPolicy → Skill → Team + Employee ([`organisation.js`](src/generator/master/organisation.js)) → EmployeeSkill + LeaveEntitlement ([`workforce-details.js`](src/generator/master/workforce-details.js)) → ShiftTemplate → HolidayCalendar → Shift ([`reference-tables.js`](src/generator/master/reference-tables.js)) → CoverageRequirement ([`coverage.js`](src/generator/master/coverage.js))
- [x] Realistic variation (full profile): team sizes 10–33 by pattern (24×7 avg 26, extended 20, business ≈ 12); 39 × 24×7, 33 × extended-hours, 27 × business-hours operational teams + the Workforce Office; 15% part-time members; 44 joiners and 39 leavers inside the window; 1–4 skills per person; 32 certifications lapse mid-window; 5 teams revise demand on 2026-02-16 (17 rows); 16 of 99 teams have demand ≥ 95% of contracted supply
- [x] Coverage demand sized from each team's real supply × demand ratio; revisions recompute headcounts with the same formula and are dropped if they exceed the team's maximum-hours capacity
- [x] [`src/cli/generate.js`](src/cli/generate.js) (`npm run generate -- --profile <name>`): generates, loads every row into the schema (columns checked against the table), checks FKs, then writes `data/<profile>/csv/`
- [x] Tests — 61 new ([`lib.test.js`](test/lib.test.js), [`config.test.js`](test/config.test.js), [`master-data.test.js`](test/master-data.test.js)): RNG determinism/independence/ranges/weights; ISO weeks incl. year boundaries; timestamps across midnight; ID formats + overflow; allocation; CSV quoting; config rejections; for both profiles: brief volumes, FK-clean load, identical regeneration, seed sensitivity, consecutive IDs, one manager per team, partners only in the Workforce Office, policy ↔ employment type, skill validity + expiry formula, R-COV-03 day types, R-COV-02 patterns, non-overlapping effective ranges, required skills held, demand ≤ max capacity; CLI output + error exit

Verified 2026-10-30: `npm test` 86/86 pass; lint and format clean; `generate` for both profiles succeeds (full ≈ 0.3 s); two independent runs of both profiles produce byte-identical CSVs (20/20 SHA-256 equal).
Fixed during the phase: the first revision rule pushed one team's demand to 133% of its maximum capacity; caught by the capacity test and replaced by the recompute-and-cap rule above.
Suggested commit: `feat(generator): seeded master data for teams, skills, employees, shifts, holidays, coverage`

### Phase 3 — Transactions & events ✅

- [x] Leave ([`transactions/leave.js`](src/generator/transactions/leave.js)): 5,000 seeded requests (type mix, durations, notice incl. deliberate short notice, sick call-ins 03:00–05:30, withdrawals, cancellations); `decideLeaves` is a pure, replayable function applying R-LVE-01 … R-LVE-07 in **decision-time** order; manager / HR partner / system deciders per R-LVE-07; every change an event with rule ID and reason
- [x] Roster state + scheduler ([`src/scheduler/`](src/scheduler/)): one `check()` for R-SCH-01 … R-SCH-08 (skill validity, double booking, leave known at that time, employment, 11 h rest, 6 consecutive days, weekly limit prorated to employed days); fairness key R-SCH-09 (weekly load in 20 % bands → nights/weekends/holidays → total load → seeded tie-break); scarcest skill first; unfilled slots stay gaps
- [x] Timeline ([`transactions/timeline.js`](src/generator/transactions/timeline.js)): one event queue in time order — weekly publication 7 days ahead (R-SCH-10), late leave cancels + backfills (R-LVE-09), swaps requested against the live roster, decided with the state at decision time, expired at 48 h / shift start, cancelled, or applied (new SWAP assignments supersede the old ones)
- [x] Attendance ([`transactions/attendance.js`](src/generator/transactions/attendance.js)): badge/mobile punches with early arrivals, lateness, early leave, extensions, no-shows (incl. refused sick call-ins), missing clock-outs with ops-partner MANUAL corrections; clock-outs capped by the week's overtime budget so the baseline never breaches R-OVT-02
- [x] Row builder ([`transactions/index.js`](src/generator/transactions/index.js)): IDs in creation order (`LVE` by submission, `ASG`/`SWP` chronological), event rows `<parent>-E01…`; `generateDataset` = master + transactions; `npm run generate` writes all 17 tables
- [x] Business-rule checks ([`src/validation/business-rules.js`](src/validation/business-rules.js)) from the tables alone: R-SCH-01 … 08, R-ATT-01/04, R-OVT-02, R-SWP-06, lifecycle chains (R-GEN-01 / R-SWP-08) — reused by Phase 6
- [x] Schema: `shift_assignment.swap_id` FK deferred (swap ↔ assignment cycle); swap reason `ASSIGNMENT_CHANGED`; indexes on FK child columns
- [x] Config: `leaveBehaviour`, `swapBehaviour`, `attendanceBehaviour` (strictly validated)
- [x] Tests — 44 new ([`leave-rules.test.js`](test/leave-rules.test.js), [`scheduler.test.js`](test/scheduler.test.js), [`transactions.test.js`](test/transactions.test.js)): every leave rule on a hand-built team; every hard roster rule; fairness pick; gap instead of unqualified fill; exact volumes; FK-clean load of both profiles; **zero violations** in both baselines; byte-identical regeneration; all leave reasons/deciders, all swap outcomes; swap/backfill history links; publication before the week; attendance sources; gaps but never over-staffing; and **each rule check proven by injecting the problem into a copy of the data**

Results (full profile): 95,930 assignments (90,761 roster still scheduled, 1,572 backfills, 755 swap-created), 184,535 attendance events; leave 3,696 approved / 1,122 rejected (5 reasons) / 93 withdrawn / 89 cancelled; swaps 522 applied / 750 rejected (9 reasons) / 158 expired / 70 cancelled; coverage 99.1 % of required headcount filled, 669 short slots, 0 over-staffed; fairness (Jain, per team) nights 0.977, weekends 0.948, hours/contract 0.994; late 6.9 %, early leave 3.1 %, extensions 9.3 %, no-shows 1.6 %.
Verified 2026-10-30: `npm test` 130/130 (≈ 18 s); lint and format clean; two independent runs of both profiles byte-identical (34/34 CSV SHA-256 equal); full CSV output 45 MB.
Fixed during the phase: (1) swap counterparts were picked without regard to their own shifts, so 531 of 1,499 swaps failed on double booking — requesters now usually ask an available colleague (configurable), approval of decided swaps rose to 41 %; (2) a raw weekly-load ratio made nights/weekends irrelevant in the fairness key — banded at 20 %, night fairness 0.971 → 0.977; (3) one swap request could not be placed near the window end — target day now clipped to the window; (4) full load took 16.7 s because deferred-FK checks scanned unindexed child columns — two indexes brought the run to ≈ 10.5 s.
Suggested commit: `feat(generator): leave decisions, scheduler, attendance and swap workflow with event history`

### Phase 4 — Derived values & metrics ✅

- [x] [`src/derive/derived-tables.js`](src/derive/derived-tables.js) — pure functions of the source tables: `employee_week_summary` (contract prorated to employed days, scheduled, worked from punch pairs, overtime R-OVT-01, cap flag R-OVT-02), `coverage_status` (R-COV-01 lookup; assigned / qualified / attended; planned gap and gap after absences), `leave_balance` (entitlement − final APPROVED days), `attendance_reconciliation` (punches, worked / late / early / extension minutes, outcome)
- [x] One implementation of worked time and overtime (`workedMinutes`, `overtimeHours`), now also used by the rule checks, so derived tables and detectors cannot disagree
- [x] [`src/derive/metrics.js`](src/derive/metrics.js): M-01 … M-08 (coverage fill planned and attended; gaps by template / day type / function / worst teams; overtime distribution and breaches; leave and swap outcomes, approval rates, response times; attendance rates; reconciliation by pattern; fairness per team — Jain's index for nights, weekends, holidays, hours per contract, and CV)
- [x] [`src/export/reports.js`](src/export/reports.js): `data/<profile>/reports/metrics.json` + readable `metrics.md`; no timestamps, so reports are reproducible
- [x] `generateDataset` now returns all 21 tables; the schema's CHECKs re-verify derived arithmetic on load
- [x] Tests — 17 new ([`derive.test.js`](test/derive.test.js)) on a hand-built fixture with every expected value worked out by hand (overtime incl. breach, partial week, joiner; worked time only from punch pairs; all reconciliation outcomes; qualified vs attended coverage; balances; Jain / percentiles) and on the full profile (no cap breaches, every due shift reconciled, short slots = independent count, no negative balances, metrics add up and are reproducible); CLI test checks the report files

Results (full profile): coverage 99.10 % filled by qualified staff, 97.52 % by staff who clocked in; 669 short slots, 6,752 missing headcount-hours, worst team TEAM-031 (Field Service BLR 04); 7,371 employee-weeks with overtime, max 12 h, 0 breaches; scheduled hours 83.4 % of contracted; leave approval annual 63 % / casual 79 % / sick 91 % / unpaid 81 %; swap approval 41 %, expiry 10.5 %, manager response p50 7.9 h; punctuality 93.1 %, no-shows 1.6 %; 99.83 % of due shifts with a complete record; fairness nights 0.977, weekends 0.948, holidays 0.907, hours per contract 0.994.
Verified 2026-10-30: `npm test` 147/147 (≈ 26 s); lint and format clean; two independent runs of both profiles byte-identical (46/46 files incl. reports); full output 59.7 MB.
Fixed during the phase: one hand-computed expectation in the new fixture was wrong (it missed that E1 also worked that day); the code was right, the fixture was corrected to keep a genuine "unqualified assignee → gap" case.
Suggested commit: `feat(derive): derived overtime, coverage, balances, reconciliation and metrics`

### Phase 5 — Edge-case injection & ground truth ✅

- [x] [`src/generator/anomalies/inject.js`](src/generator/anomalies/inject.js) runs **after** the clean baseline; derived tables are then recomputed from the final records (`generateDataset`; `{ anomalies: false }` gives the baseline)
- [x] The 5 required anomalies, each built to break only its own rule and stay structurally valid: double booking (duplicate booking of a worked shift + no-show; only weeks with room under R-SCH-08), leave overlap (shift added inside an existing approved leave + no-show; the leave untouched so no later decision changes), skill absent (worked assignment switched to a team skill not held), overtime cap exceeded (last clock-out of a full worked week moved past the budget), swap without approval (APPROVED event removed; R-SWP-08 also fires — documented)
- [x] Boundary cases kept valid and labelled: overtime exactly at cap (nudged), leave ending the day before a shift (found), exactly 6 consecutive days (found), swap requested exactly 24 h ahead (nudged); rest exactly 11 h is impossible with the configured templates → covered by a new scheduler unit test (B → G) and listed in `UNREACHABLE_BOUNDARIES`
- [x] One employee per label, so no two cases interact; untouched tables stay byte-identical to the baseline
- [x] Counts per profile (`anomaliesPerType`, `boundaryCasesPerType`): starter 3 / 2, full 20 / 10 → full: 100 anomalies + 40 boundary cases; starter: 15 + 6 (no swap there is decided within 24 h of its shift)
- [x] [`src/export/ground-truth.js`](src/export/ground-truth.js): `data/<profile>/ground_truth/ground_truth.csv` + `.json` in the layout of data dictionary §10, separate from `csv/`; never loaded as a table
- [x] Tests — 25 new ([`anomalies.test.js`](test/anomalies.test.js) + 1 scheduler unit test): exact anomaly counts; boundary counts (full: complete); layout / IDs / rules / classes; every label points at existing records; **every anomaly detected by its own detector, no boundary flagged, no finding outside the labels**; breaches and at-cap weeks visible in `employee_week_summary`; untouched tables identical and changed rows only on labelled records; no label-like table or column; FK-clean load of the injected full profile; identical labels on rerun. Baseline tests (Phases 3–4) now explicitly use the clean baseline; the CLI test checks the ground-truth folder

Results (full profile): rule checks find 20/20 of each anomaly type, 0/40 boundary cases flagged, 0 unexpected findings (20 R-SWP-08 side effects, all on labelled swaps); `employee_week_summary` shows exactly 20 cap breaches; metrics move as expected (short slots 669 → 686 from the skill switches, max weekly overtime 12 → 13.48 h, swap approval 41 % → 40 %).
Verified 2026-10-30: `npm test` 172/172 (≈ 29 s); lint and format clean; two independent runs of both profiles byte-identical (50/50 files incl. ground truth).
Suggested commit: `feat(anomalies): labelled anomaly and boundary injection with separate ground truth`

### Phase 6 — Validation & evaluation ✅

- [x] `npm run validate -- --profile <name>` ([`src/cli/validate.js`](src/cli/validate.js)) reads **only the exported files** ([`read-dataset.js`](src/validation/read-dataset.js): RFC 4180 parser, schema-typed columns, parent-first `LOAD_ORDER`), writes `reports/validation_summary.{json,md}`, exits 1 on any problem (2 if it cannot run)
- [x] Integrity ([`integrity.js`](src/validation/integrity.js)), keys / uniques / FKs read from the schema via PRAGMAs: I-01 layout · I-02 schema load · I-03 PK · I-04 unique keys · I-05 all 47 FK columns · I-06 enums · I-07 ID formats · I-08 date ordering · I-09 duplicates and overlapping ranges · I-10 event-chain structure · I-11 cross-table consistency (data dictionary §11) · I-12 derived tables recompute exactly. Every check is guarded: broken data is reported, never crashes the validator
- [x] Decision replay ([`decisions.js`](src/validation/decisions.js)): D-01 re-runs every leave decision through the same pure rule engine from exported data; D-02 checks every swap outcome against the statically verifiable swap rules (roster-dependent reasons checked for evaluation-order consistency)
- [x] Detectors (Phase 3, reading only the tables) graded against the ground truth ([`evaluate.js`](src/validation/evaluate.js)): precision / recall per type, boundary cases flagged, confusion table, secondary findings explained only on labelled records (M-09)
- [x] Acceptance criteria A-01 … A-04 ([`validate.js`](src/validation/validate.js)) with evidence; report renderer [`validation-report.js`](src/export/validation-report.js)
- [x] Tests — 20 new ([`validation.test.js`](test/validation.test.js)): CSV parsing; CSV round trip returns exactly the generated data; starter passes; **each of I-01 … I-12, D-01, D-02 fails on a purpose-built broken copy**; evaluation fails on a missing label, a label on a clean record and a flagged boundary; CLI PASS then exit 1 after removing a row from `team.csv`

Results (full profile, from the files): **PASS** in ≈ 17 s — 583,330 rows; 0 integrity failures (1,422,115 FK lookups, 1,823,700 ID checks, 171,054 derived rows recomputed); 5,000 / 5,000 leave decisions replay identically; 7,075 swap checks pass; detection 100 / 100 (precision and recall 100 % for every type); 0 / 40 boundary cases flagged; 20 secondary R-SWP-08 findings, all on labelled swaps; A-01 … A-04 met.
Verified 2026-10-30: `npm test` 192/192 (≈ 30 s); lint and format clean; both profiles validate PASS; two independent generate + validate runs byte-identical (54/54 files incl. validation reports); a dataset with a deleted CSV fails cleanly with exit 1.
Fixed during the phase: (1) the reader returned tables in schema-creation order, so loading failed on an immediate FK — a shared `LOAD_ORDER` constant now drives generator and reader (test enforces equality); (2) a cross-table check crashed on an orphaned team instead of reporting it — every check now runs inside a guard; (3) an O(n²) parent lookup in I-10 replaced by a set.
Suggested commit: `feat(validation): file-level integrity checks, decision replay and ground-truth evaluation`

### Phase 7 — Export & reproducibility ✅

- [x] Export pipeline [`src/export/write-dataset.js`](src/export/write-dataset.js) behind `npm run generate`: SQLite database first (the integrity gate), then CSV, JSON, SQL seed, ground truth, metrics, manifest — all columns in schema order ([`formats.js`](src/export/formats.js))
- [x] `sql/seed.sql`: data-only `INSERT … VALUES` in batches of 500, parent tables first, one transaction (deferred FKs for the two cycles); loads into a fresh schema with FKs on (tested)
- [x] `sqlite/yottashift.db`: ready-to-query database; passes `PRAGMA integrity_check` and FK checks (tested)
- [x] `manifest.json`: dataset, profile, seed, generator command and version, config SHA-256, environment (Node 24.15.0, SQLite 3.51.3), window, volumes, row counts per table, ground-truth counts, provenance, policy thresholds, and rows / bytes / SHA-256 of all 48 files — no run timestamp
- [x] `npm run reproduce -- --profile <name>` ([`src/cli/reproduce.js`](src/cli/reproduce.js), [`manifest-compare.js`](src/export/manifest-compare.js)): two fresh runs into temporary folders, every file compared, plus comparison with the published manifest; `reports/reproducibility.{json,md}`; exit 1 on a difference; the SQLite file is the only one allowed to differ when Node/SQLite versions differ (its header records the version)
- [x] Validation gained I-13 ([`src/validation/formats.js`](src/validation/formats.js)): JSON, seed and database hold exactly the CSV rows (per-table SHA-256 in schema column order)
- [x] Q-04 decided: `data/starter/` committed in all formats (12.3 MB); `data/full/` (391 MB, SQLite file > GitHub's 100 MB limit) regenerated on demand — only its `manifest.json`, `reports/` and `ground_truth/` are committed (`.gitignore` negations)
- [x] Tests — 9 new ([`export.test.js`](test/export.test.js)): all formats written; manifest rows and checksums true and timestamp-free; database integrity and counts; seed loads with FKs; I-13 passes and fails on one changed JSON value; manifest comparison; reproduce CLI IDENTICAL then exit 1 on a tampered published checksum

Results: starter — 48 files, 12.3 MB, ≈ 1 s; full — 48 files, 391 MB (CSV 60, JSON 152, seed 77, SQLite 103 MB), ≈ 21 s. `npm run reproduce`: **48 / 48 files byte-identical** across two runs and with the published manifest, for both profiles. `npm run validate` PASS for both profiles with I-13 (63 / 63 table comparisons identical; full ≈ 29 s).
Verified 2026-10-30: `npm test` 201/201 (≈ 37 s); lint and format clean.
Suggested commit: `feat(export): JSON, SQL seed and SQLite exports, manifest and reproducibility check`

### Phase 8 — Express API ✅

- [x] `npm run api -- --profile <name> [--port 3001]` ([`src/cli/api.js`](src/cli/api.js)); Express 5.2.1 (exact pin; the project's only runtime dependency); app factory [`src/api/app.js`](src/api/app.js) with one error shape and JSON body limit
- [x] [`src/api/store.js`](src/api/store.js): the dataset's SQLite file opened **read-only**; tables loaded once on demand; business-rule findings computed once, given stable IDs (`FND-` + hash of rule + records) and matched to the ground truth; cache warmed after start-up
- [x] Read endpoints ([`routes/`](src/api/routes/)): health, metrics, validation, skills, teams (+ detail with members, requirements, coverage totals), employees (paged, filters, search; detail with skills, balances, weekly hours), employee schedule, coverage cells and daily totals, assignment history (events, punches, reconciliation, supersede links), leave and swap lists and details with rule text, event history and roster effects / created assignments, ground truth
- [x] Exceptions: list with filters (rule, issue type, kind, team, employee, review status), summary, detail with label and review trail; `POST /exceptions/:findingId/reviews` appends ACKNOWLEDGED / RESOLVED / DISMISSED by the team's manager or HR partner (ops partners for attendance / overtime findings) to `data/<profile>/api/reviews.db` — git-ignored, never part of the dataset
- [x] `POST /leave/evaluate`: the decision the real leave engine (R-LVE-01 … R-LVE-07) would give a new request against everything recorded, with rule, reason, decider and balance; nothing stored. Shares `leaveRequestsFromTables` / `decideFromTables` with validation D-01
- [x] Input validation: ID formats, enums, real dates, pagination bounds, body fields; 400 / 403 / 404 / 422 with a consistent body
- [x] Tests — 21 new ([`api.test.js`](test/api.test.js)) against a freshly generated starter dataset on a random port (see README §7)

Scope change from the plan: approving / rejecting leave or swaps through the API was dropped (D-51). The dataset is a closed snapshot in which every request is already decided by its rule; an approval endpoint would rewrite history and invalidate the published checksums. Exception reviews and the leave what-if give managers, HR and ops a real action and an explanation tool instead.
Results (full profile): reads 3–60 ms; first exceptions computation ≈ 5.4 s (now done in the background at start-up), then ≈ 6 ms; what-if ≈ 0.2 s (replays all 5,000 decisions); findings listed: 25 for the starter, 280 for the full profile (100 labelled anomalies, 20 per type; 20 R-SWP-08 side effects, all on labelled swaps; 160 uncorrected missing-punch exceptions).
Verified 2026-10-30: `npm test` 222/222 (≈ 36 s); lint and format clean; CLI started as a child process, `/health` answered, stopped; dataset files unchanged (SHA-256 test).
Suggested commit: `feat(api): Express API for schedules, coverage, histories, exceptions and leave what-if`

### Phase 9 — React dashboard ✅

- [x] `"workspaces": ["client"]` in the root `package.json`; `client/` pins React 19.3.1, Vite 8.3.4 and `@vitejs/plugin-react` 6.1.2 exactly; `npm run client` (dev server, `/api` proxied to port 3001) and `npm run client:build`
- [x] Views ([`client/src/views/`](client/src/views/)): Overview KPIs and per-day charts; Coverage per team (daily fill, missing headcount, short slots by date); Exceptions (findings by rule, filters, records, ground-truth label, review trail, add a review); People (search; policy, skills, balances, leave, weekly hours vs cap, full schedule); Assignment history (events, punches, reconciliation, supersede links); Leave & swaps (lists, decision rule, history, roster effects / created assignments) plus the leave what-if; Validation (acceptance, detection, boundaries, checks, reproducibility)
- [x] Each view names its actors (manager, HR partner, IT/ops partner, system administrator, employee); the review form offers only the reviewers the API accepts
- [x] Hash routes for every view and record; every ID links to the view that explains it
- [x] Charts hand-built in SVG (no chart or UI library): palette run through the dataviz validator in light and dark mode, 2 px lines, legend + selective end labels, hover tooltip, a "Show data as table" view per chart; status always icon + label, never colour alone
- [x] API additions found while building: `GET /reproducibility`; team detail returns manager and HR partner names; `/teams` gap count as one grouped join (D-60)
- [x] Tests — 1 new, 1 extended ([`api.test.js`](test/api.test.js)): 223 total

Changed from the plan: "Leave and Swap queues for managers" became read-only request views with the deciding rule and history, plus the what-if, because requests are not approvable through the API (D-51).
Results: production build 271 KB JS (83 KB gzip), 5 KB CSS. Checked in the browser pane against the full profile: all seven views load with no console errors; a review added through the form appears in the trail and the list; the what-if returns an approval and an R-LVE-03 rejection; no horizontal scroll at 375 px on any view; light and dark mode. API reads behind the views 14–30 ms.
Verified 2026-10-30: `npm test` 223/223; lint and format clean; `npm run client:build` passes.
Suggested commit: `feat(client): React dashboard for coverage, exceptions, people, requests and validation`

### Phase 10 — Hardening, docs & submission

- [ ] Full-scale run timed; one reasonable optimisation recorded with before/after numbers (first one already measured in Phase 3: D-29, 16.7 s → 10.5 s)
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
| B-01 | Combine leave, shift coverage, skills and labour constraints into fair and feasible schedules | 3, 4 | ✅ scheduler combines approved leave, coverage per skill, skill validity and labour limits; fairness key + Jain indices (nights 0.977, hours 0.994) · metrics Phase 4 |
| B-02 | Expose key decisions and exceptions | 3, 6, 8, 9 | ✅ decision rule ID + reason on every leave/swap decision; `validation_summary`; API exposes decisions with rule text, histories and exceptions (+ review trail); dashboard Exceptions, Leave & swaps and Validation views |
| B-03 | Preserve traceability | 1, 3 | ✅ append-only events for leave (10,089), swaps (3,522), assignments (98,772); `supersedes_assignment_id` and `swap_id` links |
| B-04 | Measurable outputs | 4, 6 | ✅ 4 derived tables + `metrics.json` / `metrics.md` (M-01 … M-08) · validation summary Phase 6 |
| B-05 | Medium complexity: multiple related entities, conditional rules, ≥1 exception path, meaningful evaluation metrics | 1, 3, 6 | ✅ 21 tables, 42 rules, exception paths in data (rejections, expiries, cancellations, backfills, gaps, no-shows, missing punches) · metrics Phases 4/6 |
| B-06 | Actors: employee, manager, HR partner, IT/ops partner, system administrator | 1, 9 | ✅ actor matrix (business rules §1); API endpoints per actor and review permissions by role (manager / HR partner / ops partner); each dashboard view names its actors |
| W-01 | Master data first: Employee, Team, Skill, ShiftTemplate, ShiftAssignment | 2, 3 | ✅ master data first, then transactions (`generateDataset`) |
| W-02 | Dependent records use valid parent IDs | 2–3, 6 | ✅ every row loaded into the schema with FKs checked (generate CLI + tests) |
| W-03 | Teams, skills, shift templates | 2 | ✅ 100 teams, 30 skills, 4 templates (full profile) |
| W-04 | Minimum staffing per shift and skill | 2 | ✅ 1,490 coverage requirements (team × template × skill × day type, effective-dated) |
| W-05 | Leave requests and approval outcomes | 3 | ✅ 5,000 leave requests, rule-based decisions with 5 rejection reasons |
| W-06 | Attendance events | 3 | ✅ 184,535 attendance events (punches, no-shows, manual corrections) |
| W-07 | Assign shifts | 3 | ✅ weekly rosters, 95,930 assignments incl. backfills and swap-created |
| W-08 | Swaps with manager approval | 3 | ✅ 1,500 swaps: manager approval/rejection, system expiry, requester cancellation, applied swaps |
| W-09 | Overtime and coverage gaps computed | 4 | ✅ `employee_week_summary` (overtime) and `coverage_status` (gaps) recomputed from source |
| W-10 | State changes as explicit records/events; never overwrite history | 1, 3 | ✅ status changes only as appended events; status = last event (checked) |
| W-11 | Outcomes and ground-truth labels from documented rules, not random | 1, 3, 5 | ✅ outcomes from rules with rule IDs; ground-truth labels come from the injection rules, each naming the rule it breaks; leave decisions replayable |
| E-01 | All 10 core entities present | 1 | ✅ data-dictionary §3 + schema.sql |
| E-02 | PK for every entity, FK for every relationship | 1 | ✅ schema.sql; erd.md §2 (all 47 FK columns) |
| E-03 | Cardinality, optional relationships, effective dates, lifecycle states documented | 1 | ✅ erd.md §2–§5, data-dictionary |
| E-04 | Bridge tables for N:M | 1 | ✅ `employee_skill` bridge; `shift_assignment`, `coverage_requirement` as associative entities (erd.md §3) |
| E-05 | Event history for state changes | 1, 3 | ✅ 3 event tables populated; lifecycle check passes on every chain |
| E-06 | Validate all joins | 6 | ✅ I-05 resolves all 47 FK columns across the exported files; I-02 loads them into the schema |
| E-07 | Anomalies keep an issue_type / ground-truth label; unrelated rows untouched | 5 | ✅ labels in `ground_truth/` only; anomalies touch only their own rows (isolation test); untouched tables identical to the baseline |
| N-01 | IDs: `EMP-000001`, `SHIFT-2026-01-01-A`, `LVE-2026-000001`, `ATT-<employee-id>-<timestamp>`, `SWP-2026-000001` | 2 | ✅ all five brief formats generated (EMP, SHIFT, LVE, ATT, SWP) and enforced by schema + `ID_PATTERNS` |
| N-02 | Zero-padded counters, immutable IDs, identical across files | 2, 7 | ✅ zero-padded, immutable, identical across reruns; I-13 proves CSV, JSON, SQL seed and SQLite hold identical rows |
| S-01 | Step 1 data dictionary: type, required/optional, allowed values, units, uniqueness, validation rule | 1 | ✅ data-dictionary.md (all 21 tables) |
| S-02 | Step 2 parents before children/events | 2, 3 | ✅ master → leave → roster/swaps → attendance; load order parent-first (one deferred FK) |
| S-03 | Step 3 deterministic IDs and naming | 2 | ✅ `src/lib/ids.js` |
| S-04 | Step 4 volume: 2,000 employees, 100 teams, 90 days of shifts, 5,000 leave requests | 2, 3 | ✅ 2,000 employees, 100 teams, 90 days (360 shifts), 5,000 leave requests — row counts in `data/full/manifest.json` |
| S-05 | Step 4 public holidays, absences, overtime caps, skill-specific staffing | 2, 3 | ✅ 5 holidays; absences (approved leave, sick call-ins, 1,481 no-shows); overtime caps enforced; skill-specific staffing |
| S-06 | Step 4 fixed seed 20261022; same generator for starter and full | 2 | ✅ seed `20261022`; `starter` and `full` profiles through one generator; byte-identical reruns |
| S-07 | Step 5 valid baseline first, then labelled edge cases | 3, 5 | ✅ clean baseline proven violation-free (Phase 3 tests), then labelled injection (`generateDataset`) |
| S-08 | Step 6 derived values computed from source records | 4 | ✅ `src/derive/derived-tables.js` — pure functions of the source tables; schema CHECKs re-verify the arithmetic · reconciliation of exported files Phase 6 |
| S-09 | Step 7 separate ground_truth.csv/json, no leakage | 5 | ✅ `data/<profile>/ground_truth/ground_truth.csv` + `.json`, separate folder, never loaded as a table; leakage tests on table and column names |
| S-10 | Step 8 validation: PK, FK, enums, date ordering, arithmetic reconciliation, lifecycle transitions, duplicates | 6 | ✅ `npm run validate`: PK, unique keys, FKs, enums, ID formats, date ordering, arithmetic reconciliation (I-12), lifecycle chains (I-10 + R-GEN-01/R-SWP-08), duplicates — `validation_summary.{json,md}` |
| S-11 | Step 9 export CSV/JSON/SQL seed + README, schema/dictionary, generator command, seed, source manifest, validation summary | 7 | ✅ `data/<profile>/`: CSV, JSON, `sql/seed.sql`, SQLite DB, ground truth, metrics, `manifest.json` (command, seed, config hash, provenance, checksums), validation summary; README + data dictionary + schema |
| S-12 | Step 10 regenerate twice with same seed; compare counts/checksums | 7 | ✅ `npm run reproduce`: 48 / 48 files byte-identical across two runs and with the published manifest (both profiles) |
| X-01 | Edge case: employee double-booked | 5, 6 | ✅ 20 labelled (full); recall and precision 100 % (validation summary) |
| X-02 | Edge case: approved leave overlaps assigned shift | 5, 6 | ✅ 20 labelled (full); recall and precision 100 % (validation summary) |
| X-03 | Edge case: required skill absent | 5, 6 | ✅ 20 labelled (full); recall and precision 100 % (validation summary) |
| X-04 | Edge case: overtime cap exceeded | 5, 6 | ✅ 20 labelled (full); recall and precision 100 %; 20 breaches in `employee_week_summary` |
| X-05 | Edge case: swap applied without approval | 5, 6 | ✅ 20 labelled (full); recall and precision 100 %; R-SWP-08 side effect explained |
| A-01 | Coverage requirements met or gaps reported | 4, 6 | ✅ A-01 met: 686 GAP slots reported; coverage_status recomputes exactly (I-12) |
| A-02 | Working-hour constraints hold | 3, 6 | ✅ A-02 met: every working-time finding is a labelled overtime anomaly |
| A-03 | Attendance reconciles with schedules | 4, 6 | ✅ A-03 met: 99.83 % complete records, 0 with no record, 0 R-ATT-01 violations |
| A-04 | Swap history preserved | 3, 6 | ✅ A-04 met: complete chains (I-10), linked applied swaps (D-02), R-SWP-08 only on labelled swaps |
| V-01 | Realistic distributions and meaningful variation | 2, 3 | ✅ master + transactions: leave/swap outcome mixes, lateness, no-shows, fairness spread (Phase 3 results) |
| V-02 | Consistent IDs and valid joins | 6 | ✅ I-05 / I-07 / I-11 on the exported files: 0 failures |
| V-03 | Dependency/lifecycle consistency across entities | 6 | ✅ I-10 event-chain structure, allowed transitions (R-GEN-01 / R-SWP-08), rosters before their week (I-08) |
| V-04 | Correct derived values and reconciliation | 4, 6 | ✅ I-12 derived tables recompute exactly from the exported files; D-01 leave decisions replay identically |
| V-05 | Normal, boundary, failure and exception coverage | 5, 6 | ✅ normal baseline, 4 boundary types (40 cases, none flagged), 5 failure types (100 cases), exception paths (rejections, expiries, gaps, missing punches) |
| V-06 | Separate ground truth | 5 | ✅ separate `ground_truth/` folder; no label-like table or column in the inputs (tested) |
| V-07 | Fixed-seed reproducibility, documentation, lawful provenance | 7, 10 | ✅ fixed seed, byte-identical reruns, manifest checksums, README / data dictionary / tracking, provenance section in manifest and README |
| P-01 | External data optional; if used record URL, version, retrieval date, licence, attribution, transformations, discarded fields | 2, 7 | ✅ no external data; provenance recorded in every manifest and README §14 |
| P-02 | No confidential/personal data; synthetic if licensing unclear | all | ✅ synthetic names from common-name lists; no real people |

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
├── package.json            # root package (generator, validator, API) + `client` workspace
├── config/                 # ✅ generator.config.json — seed, starter/full profiles, workforce, skills, coverage
├── sql/schema.sql          # ✅ 21 STRICT tables
├── docs/                   # ✅ data-dictionary.md, erd.md, business-rules.md; design-notes.md (Phase 10)
├── src/
│   ├── lib/                # ✅ rng, ids, dates, csv, allocate, heap (hashing in Phase 7)
│   ├── domain/             # ✅ constants.js (enums, transitions, ID patterns), rules.js (rule catalogue, policy)
│   ├── generator/          # ✅ config.js, master/, transactions/ (leave, timeline, attendance), anomalies/ (labelled injection), index.js
│   ├── scheduler/          # ✅ roster-state.js (hard rules, fairness key), scheduler.js (weekly publication)
│   ├── derive/             # ✅ derived-tables.js (4 derived tables), metrics.js (M-01 … M-08)
│   ├── validation/         # ✅ read-dataset, integrity, formats, decisions, business-rules (detectors), evaluate, validate
│   ├── export/             # ✅ write-dataset (pipeline), csv-export, formats (JSON, SQL seed, SQLite), manifest-compare, reports, ground-truth, validation-report
│   ├── db/                 # ✅ database.js (schema, load order, load / read all tables)
│   ├── api/                # ✅ app.js, store.js, http.js, routes/ (catalog, roster, requests, exceptions)
│   └── cli/                # ✅ generate.js, validate.js, reproduce.js, api.js
├── client/                 # ✅ React + Vite dashboard: src/{App, api, format}, components/ (ui, charts), views/ (7)
├── .claude/launch.json     # dev-server definitions (API + Vite) used for the browser check
├── test/                   # ✅ schema, lib, config, master-data, leave-rules, scheduler, transactions, derive, anomalies, validation, export, api tests
├── data/                   # ✅ <profile>/{csv,json,sql,sqlite,ground_truth,reports}, manifest.json; starter committed; full: manifest, reports, ground truth only
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
| D-17 | 2026-10-30 | sfc32 PRNG with one named stream per generation step (`rng.fork`) | Adding draws to one step never changes another step's data; tiny, dependency-free, deterministic across platforms | One shared stream (fragile); Faker (D-04) |
| D-18 | 2026-10-30 | Coverage demand sized from each team's real weekly supply × a demand ratio drawn from tiers (80% coverable, 15% near the limit, 5% short) | Gaps then arise naturally from data, and the scheduler is tested on both slack and tight teams | Random headcounts (could be impossible or trivially easy) |
| D-19 | 2026-10-30 | Mid-window revisions rescale team demand and recompute all headcounts; dropped if beyond maximum-hours capacity | Coherent with the base formula; the first per-row ±1 rule produced impossible demand (caught by a test) | Per-row multiplier with ±1 nudge |
| D-20 | 2026-10-30 | Generator loads every row into the real schema before writing files, and checks each row has exactly the table's columns | The schema is the contract; no broken file can be written | Validate only in Phase 6 |
| D-21 | 2026-10-30 | Strict config validation (all keys required, unknown keys rejected, shares sum to 1) | A typo cannot silently change the dataset | Defaults for missing keys |
| D-22 | 2026-10-30 | Workforce Office sized from team count (1 HR partner per 12 teams, 1 ops partner per 20) and taken out of the 2,000 before sizing operational teams | Keeps the brief's exact 2,000 employees / 100 teams | Extra headcount outside the 2,000 |
| D-23 | 2026-10-30 | One chronological event queue for publication, leave effects and swaps | Every decision sees exactly the state at its time; IDs in creation order are chronological | Separate passes per entity (inconsistent cross-effects) |
| D-24 | 2026-10-30 | Leave decided in decision-time order by a pure function | Balances and caps see only earlier decisions; the validator can replay the same function on exported data | Submission order (later-decided requests could see the future) |
| D-25 | 2026-10-30 | Fairness key compares weekly load in 20 % bands | A raw ratio almost never ties, so night/weekend balance never counted; banding raised night fairness 0.971 → 0.977 | Weighted score (harder to explain) |
| D-26 | 2026-10-30 | Swap requesters usually ask an available colleague with the skill (0.8 / 0.85, configurable) | Real people check the roster; the remaining share still produces every rejection reason | Random counterpart (36 % double-booking rejections) |
| D-27 | 2026-10-30 | Attendance clock-outs capped by the remaining weekly overtime budget | Clean baseline has zero cap breaches, so Phase 5 injections are the only ones | Free extensions (unlabelled breaches would pollute ground truth) |
| D-28 | 2026-10-30 | Business-rule checks written in Phase 3, reading only exported tables | Proves the baseline is clean now; the same detectors grade injected anomalies in Phase 6 | Write detectors only in Phase 6 |
| D-29 | 2026-10-30 | Indexes on FK child columns (`shift_assignment.swap_id`, `supersedes_assignment_id`, `team.hr_partner_employee_id`) | Deferred-FK checks were scanning 95k rows per parent insert: full run 16.7 s → ≈ 10.5 s (load 12.7 s → 7.0 s) — the measured optimisation for Phase 10 | Disable FK checks during load (loses the guarantee) |
| D-30 | 2026-10-30 | Refused sick call-ins become no-shows; approved ones cancel the shift | The person is still ill; keeps absences explainable from the data | Treat refused sick leave as present |
| D-31 | 2026-10-30 | Derived tables are pure functions of the source tables, kept in one module with the worked-time / overtime arithmetic shared by the rule checks | One definition of each number; the validator can recompute and compare exported files | Compute during generation (derived values could drift from the records) |
| D-32 | 2026-10-30 | "Attended" = a qualified assignee who clocked in (present or missing clock-out) | A missing clock-out still means the person turned up; it is an attendance data exception, not a coverage gap | Count only complete punch pairs |
| D-33 | 2026-10-30 | Fairness measured among members employed for the whole window, within their team | Joiners and leavers have fewer shifts by design and would distort the index | All members, or org-wide comparison |
| D-34 | 2026-10-30 | Metrics written as JSON plus a readable Markdown summary, with no timestamps | Machine-checkable and reviewer-friendly; stays byte-reproducible | JSON only |
| D-35 | 2026-10-30 | Inject anomalies on the finished baseline, then recompute derived tables | The baseline is proven clean first; derived values (overtime flags, gaps) then reflect the anomalies like they would in real data | Generate anomalies inside the simulation (hard to label precisely) |
| D-36 | 2026-10-30 | Each anomaly is built to break exactly one rule (e.g. duplicate booking of the same shift; extra bookings get a no-show) and uses its own employee | Clean labels: precision/recall measure the detector, not knock-on effects | Random corruption (many secondary violations) |
| D-37 | 2026-10-30 | Leave overlap made by adding a shift inside an existing approved leave, not by adding a leave | Leaves feed balances and team caps; a new approved leave would change later decisions on unrelated rows | Inject an approved leave |
| D-38 | 2026-10-30 | Boundary cases found in the data where they occur naturally, nudged only where needed; unreachable ones documented and unit-tested | Keeps boundaries realistic; honest about the 11 h rest case the templates cannot produce | Force every boundary (would need new templates) |
| D-39 | 2026-10-30 | A finding matches a label when issue type is equal and record IDs intersect | Detectors report whole groups (e.g. all of a week's shifts); exact set equality would be brittle | Exact record-set equality |
| D-40 | 2026-10-30 | The validator reads only the exported CSV files, never the generator's in-memory data | Validates what is delivered; also proves the CSV export loses nothing (round-trip test) | Validate in memory right after generation |
| D-41 | 2026-10-30 | Keys, unique constraints and FKs taken from the schema via PRAGMAs | One source of truth; a schema change cannot leave the validator behind | Hand-listed keys |
| D-42 | 2026-10-30 | Split structural integrity (must be 100 % clean, even with anomalies) from business-rule findings (graded against the ground truth) | Anomalies break rules, never structure; a structural failure means a broken export | One undifferentiated list of errors |
| D-43 | 2026-10-30 | Leave decisions replayed with the same pure engine; swaps checked only on statically verifiable rules | Full swap replay would need the whole roster timeline; the static checks still catch wrong approvals, wrong deciders, notice, deadline and links | Full swap re-simulation |
| D-44 | 2026-10-30 | Status PASS requires recall 1 and no finding outside the labels and no flagged boundary, not just clean structure | The detectors are part of the deliverable; a silent miss should fail the run | Report precision/recall without gating |
| D-45 | 2026-10-30 | Every check runs inside a guard; the CLI exits 1 for invalid data and 2 only if it cannot run | A validator must report broken data, not crash on it | Let exceptions propagate |
| D-46 | 2026-10-30 | The SQLite database is written first and is the integrity gate; the in-memory load was dropped | One load instead of two; a bad row stops the run before any other file is written | Separate in-memory check plus a second load |
| D-47 | 2026-10-30 | No output file carries a run timestamp; the environment (Node, SQLite) is recorded instead | Makes byte-for-byte reproducibility possible and explains the one file whose bytes depend on the SQLite version | `generated_at` in the manifest |
| D-48 | 2026-10-30 | Seed as batched multi-row INSERTs (500 per statement) in one transaction | Smaller and much faster to load than one statement per row; deferred FKs need one transaction | One INSERT per row |
| D-49 | 2026-10-30 | Commit the starter dataset in full; commit only the manifest, reports and ground truth of the full profile | Full data is 391 MB and the SQLite file exceeds GitHub's 100 MB limit; the committed checksums still let anyone verify a regeneration | Git LFS (extra setup for reviewers); committing CSV only (breaks the "all formats" sample) |
| D-50 | 2026-10-30 | Validation compares all four formats through per-table SHA-256 of rows in schema order | Proves IDs and values are identical across files without diffing 391 MB by hand | Row counts only |
| D-51 | 2026-10-30 | API is read-only over the dataset; managers act through exception reviews and the leave what-if, not by approving requests (deviation from the Phase 8 plan) | The dataset is a closed snapshot with every request already decided by rule; approving through the API would rewrite history and break the published checksums | Approval endpoints on a mutable copy of the database |
| D-52 | 2026-10-30 | Exception reviews in a separate, git-ignored SQLite file, append-only | Live user actions must not touch the reproducible dataset; append-only keeps the review trail | Extra table inside the dataset |
| D-53 | 2026-10-30 | Leave what-if runs the same pure rule engine as the generator and validator | One implementation of the leave policy, so the explanation can never disagree with the data | A separate simplified check |
| D-54 | 2026-10-30 | Stable finding IDs: `FND-` + hash of rule, kind and record IDs | Reviews keep pointing at the same finding across restarts and regenerations | Positional IDs |
| D-55 | 2026-10-30 | Express pinned to an exact version (5.2.1) | Reproducible installs for reviewers; the only runtime dependency | Caret range |
| D-56 | 2026-10-30 | Charts hand-built in SVG with one validated palette; no chart or UI library | Few chart types needed; full control of accessibility (legend, table view, tooltips) and dark mode; small bundle | Recharts / Chart.js, a component kit |
| D-57 | 2026-10-30 | Hash router written in a few lines | Every view and record has a shareable URL and the static build needs no server rewrite rules; no extra dependency | React Router |
| D-58 | 2026-10-30 | Client imports enum lists from `src/domain/constants.js` (Vite `fs.allow`) | One source of truth for statuses and types shared by schema, generator, API and UI | Copying the lists into the client |
| D-59 | 2026-10-30 | Vite dev proxy `/api` → port 3001 | Same origin in the browser, so the API needs no CORS setup | CORS middleware in Express |
| D-60 | 2026-10-30 | `/teams` gap count from one grouped join instead of a per-team subquery | `coverage_status` is keyed by shift first, so each team's count scanned 46k rows: 758 ms → 14–24 ms, same numbers | Extra index on `coverage_status (team_id)` |

## 9. Open questions & assumptions

| ID | Item | Status |
| --- | --- | --- |
| Q-01 | Dedicated repo needed (folder sat inside the home-directory repo). | ✅ Resolved — candidate ran `git init`, remote `arpitad791/YottaShift` |
| Q-02 | Prompt history: FAQ #6 asks for **all** prompts submitted to every AI tool. The final content of `ai-disclosure/prompt-history.md` is the candidate's call. | Waiting on user |
| Q-03 | 72-hour window start/deadline not yet recorded in §1. | Waiting on user |
| Q-04 | Commit the full-profile output? | ✅ Resolved (D-49): starter committed in full; full regenerated on demand, its manifest / reports / ground truth committed |
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
| A-11 | Leave entitlements are configured per 90 days and scaled to the window length and the days each person is employed in it; a late joiner can have 0 annual days. | Assumed |
| A-12 | Part-time contracts are only given to members (not leads or managers); about 15% of schedulable staff. | Assumed |
| A-13 | Each employee covers exactly one skill per shift; a requirement for skill k counts only assignments made for k. | Assumed |
| A-14 | Managers, HR and ops partners neither request leave nor swap shifts (they are not rostered). | Assumed |
| A-15 | Sick call-ins arrive 03:00–05:30 on the first sick day, before any shift that day; shifts starting within 30 min of a leave decision are not backfilled. | Assumed |
| A-16 | While a swap request is open, neither of its assignments can be targeted by another swap request. | Assumed |
| A-17 | A manual clock-out correction is recorded at the scheduled shift end, 3–5 h after it. | Assumed |
| A-18 | Injected assignments take the next free ID numbers (IDs are immutable); their IDs are therefore out of creation order. No detector uses ID order. | Assumed (known limitation) |
| A-19 | Boundary cases are "up to N as the data allows"; the full profile has all reachable types complete, the starter has no swap-at-notice-limit case. | Assumed |

## 10. Change log

| Date | Phase | Change |
| --- | --- | --- |
| 2026-10-30 | 0 | Read brief + FAQ + submission guidelines; created phased plan, traceability matrix, folder structure, tooling, README skeleton, AI-disclosure folder |
| 2026-10-30 | 1 | Named the project YottaShift. Wrote data dictionary, ERD, business rules (42 rules, lifecycles, anomalies, metrics), `sql/schema.sql` (21 STRICT tables), domain constants and rule catalogue, DB helper and 25 schema tests. Added the Workforce Office team and HR/ops partner links for traceability. Decisions D-07 … D-16, assumptions A-03 … A-10 |
| 2026-10-30 | 2 | Seeded RNG, date/ID/CSV/allocation helpers; strict generator config with starter and full profiles; master-data generators for all 10 master tables (Workforce Office, demand sized from supply, lapsing certifications, revisions); `npm run generate`; 61 new tests (86 total). Fixed the coverage-revision rule after a capacity test failed. Decisions D-17 … D-22, assumptions A-11 … A-13 |
| 2026-10-30 | 3 | Leave requests + replayable decision engine; roster state, fair scheduler, weekly publication, late-leave backfill, swap workflow, attendance; business-rule checks; all 17 source tables generated (≈ 400k rows at full scale); 44 new tests (130 total). Schema: deferred swap FK, `ASSIGNMENT_CHANGED`, FK child indexes. Fixed swap counterpart realism, fairness banding, end-of-window swap placement and load performance. Decisions D-23 … D-30, assumptions A-14 … A-17 |
| 2026-10-30 | 4 | Derived tables (week summary, coverage status, leave balance, attendance reconciliation) and metrics M-01 … M-08 with JSON + Markdown reports; shared worked-time/overtime arithmetic; 17 new tests (147 total). Decisions D-31 … D-34 |
| 2026-10-30 | 5 | Labelled anomaly injection (5 types) and boundary cases (4 reachable types) on the clean baseline; ground truth CSV + JSON in its own folder; derived tables recomputed after injection; `generateDataset({ anomalies: false })` for the baseline; 25 new tests (172 total) proving detection, no false positives, isolation and no leakage. Decisions D-35 … D-39, assumptions A-18 … A-19 |
| 2026-10-30 | 6 | `npm run validate`: file reader, 12 integrity checks, leave replay and swap decision checks, ground-truth evaluation (M-09), acceptance A-01 … A-04, JSON + Markdown summary; shared `LOAD_ORDER`; 20 new tests (192 total). Full profile PASS from files. Decisions D-40 … D-45 |
| 2026-10-30 | 7 | JSON, SQL seed and SQLite exports; manifest with checksums, provenance and environment; `npm run reproduce` (two runs + published manifest); I-13 format agreement in validation; `.gitignore` keeps full manifest / reports / ground truth; 9 new tests (201 total). Both profiles: 48 / 48 files byte-identical. Decisions D-46 … D-50, Q-04 resolved |
| 2026-10-30 | 8 | Express API (`npm run api`): read endpoints for every entity with histories, coverage, exceptions with ground-truth match, append-only exception reviews in a separate store, leave what-if on the real rule engine; validation and one error shape; 21 new tests (222 total). Leave/swap approval endpoints dropped by design (D-51). Decisions D-51 … D-55 |
| 2026-10-30 | 9 | React dashboard (`npm run client`): Overview, Coverage, Exceptions (with reviews), People, Assignment, Leave & swaps (with what-if) and Validation views; hand-built SVG charts on a validated palette; hash routes; `GET /reproducibility`, manager / HR partner names on team detail, faster `/teams`; 1 new test (223 total); checked in the browser at desktop and 375 px, light and dark. Decisions D-56 … D-60 |
