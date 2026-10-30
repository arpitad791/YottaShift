# Design notes

How YottaShift is put together, the choices that shaped it, what they cost, and how to walk
through it. The full decision log (D-01 … D-60, with rejected alternatives) is in
[tracking.md §8](../tracking.md#8-decision-log); this page explains the reasoning that ties those
decisions together.

## 1. Architecture

```
config/generator.config.json ──► generator ──────────────► clean baseline (17 source tables)
   seed 20261022, profiles         master data                  │  business-rule checks: 0 violations
                                   leave · roster · swaps       ▼
                                   attendance (one timeline)  anomaly injection ──► ground_truth/ (separate)
                                                                │
                                                                ▼
                                                    derived tables + metrics (pure functions)
                                                                │
                                                                ▼
                         export: SQLite DB (integrity gate) → CSV → JSON → SQL seed → manifest
                                                                │
                 ┌──────────────────────────────┬──────────────┴───────────────┐
                 ▼                              ▼                              ▼
        npm run validate                 npm run reproduce              npm run api ──► npm run client
        reads only the CSV files         two fresh runs + the           read-only over the DB;   React dashboard
        integrity · replay · grading     published manifest             reviews in a side DB
```

| Layer | Code | Job |
| --- | --- | --- |
| Domain | `src/domain/` | Enums, ID patterns, lifecycle transitions and the numbered rule catalogue; tests keep them equal to the schema and the docs |
| Generation | `src/generator/`, `src/scheduler/` | Master data, then one chronological event queue for leave, roster publication, late-leave backfills, swaps and attendance |
| Derivation | `src/derive/` | Weekly hours and overtime, coverage status, leave balances, attendance reconciliation, metrics M-01 … M-08 |
| Anomalies | `src/generator/anomalies/` | Labelled anomalies and boundary cases on the finished baseline |
| Export | `src/export/`, `src/db/` | Four formats with identical data, manifest with checksums, reports |
| Validation | `src/validation/` | Reads the exported files only: integrity, decision replay, detectors, evaluation against the ground truth |
| Serving | `src/api/`, `client/` | Express API and React dashboard for the five actors |

## 2. The ideas that hold it together

**Outcomes come from rules, not from dice.** Randomness decides behaviour: who asks for leave,
when, how late someone clocks in, how quickly a manager answers. Every outcome (approved,
rejected, gap, expired) comes from a numbered rule in
[business-rules.md](business-rules.md) and is stored with that rule's ID. That is what makes
decisions explainable in the API and replayable in the validator.

**One timeline.** Leave decisions, weekly roster publication, late-leave cancellations,
backfills, swaps and attendance run in one queue ordered by time (D-23, D-24). Each decision
sees exactly the state that existed at its moment, so no record can depend on the future, and
IDs in creation order are also chronological.

**One implementation of each policy.** The leave engine is a pure function used three times: by
the generator to decide, by the validator to replay all 5,000 decisions from the exported files
(validation check D-01), and by the API's what-if (D-53). Derived tables and the overtime arithmetic are
shared the same way (D-31). An explanation can therefore never disagree with the data.

**Structure in the schema, business rules in the validator.** The SQLite schema rejects anything
structurally impossible: bad IDs, unknown enums, broken foreign keys, wrong derived arithmetic.
Cross-row rules such as double booking or an unapproved swap are left to the validator (D-08),
because the labelled anomalies must be loadable to be detectable. A test proves both halves.

**A clean baseline first, then labelled damage.** The baseline is shown to break no business
rule. Anomalies are then injected one rule at a time, each on its own employee (D-35, D-36), and
derived tables are recomputed. So every finding is either a labelled anomaly or a bug, and
precision and recall measure the detectors rather than noise.

**History is appended, never overwritten.** Leave, swap and assignment status sit on the row for
fast reads, with an append-only event table behind each; the validator checks that the status is
the last event (D-09). A swap or backfill creates a new assignment that points to the one it
replaces.

**Reproducible to the byte.** Named random streams per step (D-17), no timestamps in any output
(D-47), and a manifest with the SHA-256 of every file. `npm run reproduce` runs the generator
twice and compares both runs, and the published manifest, file by file.

## 3. Trade-offs and deviations

| Choice | What it buys | What it costs |
| --- | --- | --- |
| SQLite (`node:sqlite`) instead of MongoDB, despite a MERN skill set (D-02) | Real PK/FK/CHECK enforcement, a SQL seed for free, no server to install | No document model; needs Node 24+ for the built-in driver |
| Own seeded PRNG and name lists instead of Faker (D-04) | Output cannot drift with a dependency update | Less varied names and text |
| Calendar days for leave, one time zone (D-12, D-14) | Simple, explainable arithmetic | Not how every company counts leave; no multi-zone sites |
| Swap decisions checked statically, not fully replayed (D-43) | Catches wrong approvals, deciders, notice and deadlines without rebuilding the roster timeline in the validator | A swap approved against a roster state that never existed would only be caught by the generator's own tests |
| API read-only over the dataset; no approve / reject endpoints (D-51) — **deviation from the plan** | Published checksums stay valid; every request keeps its rule-based decision | Managers act through exception reviews and the what-if instead |
| Full-profile data not committed (D-49) | Repo stays small; the SQLite file would exceed GitHub's 100 MB limit | Reviewers regenerate it (about 25 s) and check it against the committed manifest |
| No UI or chart library (D-56) | Small bundle, full control of accessibility and dark mode | More hand-written code to maintain |
| No sign-in in the dashboard | Simple local demo | The reviewer is chosen from a list instead of a session |

## 4. Performance

Measured on a clean clone (Windows 11, Node 24.15.0, SQLite 3.51.3, laptop):

| Step (full profile: 2,000 employees, 583,330 rows, 392 MB of output) | Time |
| --- | --- |
| `npm ci` (warm npm cache) | 3.3 s |
| `npm run generate -- --profile full` (all four formats, manifest, reports) | 25.4 s |
| `npm run validate -- --profile full` (reads the CSV files) | 35.1 s |
| `npm run reproduce -- --profile full` (two generations + comparison) | 47.7 s |
| `npm test` (223 tests, generates both profiles itself) | 40.3 s |
| `npm run client:build` | 4.5 s |
| Starter profile: generate / validate | 1.9 s / 1.9 s |
| API: `/health` / `/teams` on the full profile | 3 ms / 11 ms |

Two optimisations were measured, both found by looking at slow steps rather than guessed:

- **Indexes on foreign-key child columns (D-29).** Deferred FK checks scanned 95,000 assignments
  for each parent row inserted. Full generation went from 16.7 s to about 10.5 s (database load
  12.7 s → 7.0 s).
- **One grouped join for team gap counts (D-60).** `/teams` counted each team's gaps with a
  subquery over 46,320 coverage rows keyed by shift: 758 ms → 14–24 ms, same numbers.

## 5. How I know it works

- **223 automated tests** covering every rule on hand-built fixtures, both profiles end to end,
  hand-calculated derived values, each anomaly type detected, each validation check failing on a
  purpose-broken copy, the CSV round trip, all four formats agreeing, and the API (README §7).
- **The validator reads only the delivered files** (D-40). On the full profile it reports PASS:
  structure 100 % clean, all 5,000 leave decisions replayed exactly, 100 / 100 anomalies found
  with no false positives, 0 / 40 boundary cases flagged, acceptance criteria A-01 … A-04 met.
- **Reproducibility:** two fresh runs and the committed manifest agree on all 48 files.
- **A clean clone** of the repository installs and runs every documented command (tracking.md
  Phase 10).
- **The dashboard** was checked in a browser against the full profile at desktop and phone width,
  in light and dark mode.

## 6. Walkthrough (about 15 minutes)

1. **Problem and shape** — README §1–2, then [erd.md](erd.md): 10 entities plus the bridge, event
   and derived tables, and why a `shift` table makes `SHIFT-2026-01-01-A` a real key.
2. **Rules** — [business-rules.md](business-rules.md): pick R-LVE-03 (balance) and R-SCH-06
   (11 h rest); show the rule ID stored on a rejected leave
   (`#/requests/leave/<id>` in the dashboard).
3. **Generation** — `src/generator/transactions/timeline.js`: one queue, decisions in time order;
   `src/scheduler/roster-state.js`: hard rules and the fairness key.
4. **Ground truth** — inject → recompute → separate folder; show one `DOUBLE_BOOKED` label and
   find it in the Exceptions view with its records.
5. **Validation** — `npm run validate -- --profile full`: integrity, replay, grading; then break a
   row in `team.csv` and watch it fail.
6. **Reproducibility** — `npm run reproduce -- --profile full`: 48 / 48 identical; why there are
   no timestamps in outputs.
7. **Actors** — dashboard: a manager reviewing a finding, an employee's schedule and weekly
   overtime, the leave what-if, the administrator's Validation view.
8. **Limits** — README §13: what is simplified, and what would come next.
