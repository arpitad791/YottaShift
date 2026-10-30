# Validation summary — profile `starter`, seed 20261022

**Status: ✅ PASS**

Produced by `npm run validate -- --profile starter` from the exported files only
(`csv/` and `ground_truth/`). Machine-readable version: `validation_summary.json`.

## 1. Structural integrity and decision replay

| ID | Check | Checked | Failures | Samples |
| --- | --- | --- | --- | --- |
| I-01 | Every table file present with the schema header | 21 | ✅ 0 |  |
| I-02 | Loads into sql/schema.sql (types, CHECK constraints, foreign keys) | 18,633 | ✅ 0 |  |
| I-03 | Primary keys unique and not null | 18,633 | ✅ 0 |  |
| I-04 | Unique / natural keys have no duplicates | 3,647 | ✅ 0 |  |
| I-05 | Every foreign key resolves (all joins) | 43,529 | ✅ 0 |  |
| I-06 | Enum columns hold allowed values | 33,877 | ✅ 0 |  |
| I-07 | IDs follow the documented formats | 55,639 | ✅ 0 |  |
| I-08 | Dates and timestamps in order | 9,588 | ✅ 0 |  |
| I-09 | No duplicate records or overlapping effective ranges | 2,920 | ✅ 0 |  |
| I-10 | Event chains complete: seq 1…n, linked statuses, time order, status = last event | 3,051 | ✅ 0 |  |
| I-11 | Cross-table consistency of roles, policies, skills, calendar and IDs | 10,052 | ✅ 0 |  |
| I-12 | Derived tables recompute exactly from the source tables (arithmetic reconciliation) | 5,405 | ✅ 0 |  |
| D-01 | Leave decisions replay exactly from the rules (R-LVE-01 … R-LVE-07) | 160 | ✅ 0 |  |
| D-02 | Swap decisions consistent with R-SWP-01 … R-SWP-07 | 284 | ✅ 0 |  |

## 2. Detection against the ground truth (M-09)

A finding matches a label when it has same issue_type and at least one shared record ID.

| Issue type | Labels | Findings | Detected | Missed | Outside labels | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DOUBLE_BOOKED | 3 | 3 | 3 | 0 | 0 | 100.00 % | 100.00 % |
| LEAVE_OVERLAP | 3 | 3 | 3 | 0 | 0 | 100.00 % | 100.00 % |
| SKILL_ABSENT | 3 | 3 | 3 | 0 | 0 | 100.00 % | 100.00 % |
| OVERTIME_CAP_EXCEEDED | 3 | 3 | 3 | 0 | 0 | 100.00 % | 100.00 % |
| SWAP_WITHOUT_APPROVAL | 3 | 3 | 3 | 0 | 0 | 100.00 % | 100.00 % |

Overall: 15 / 15 anomalies detected (recall 100.00 %), precision 100.00 %.

**Boundary cases** (valid, must not be flagged): 0 of 6 flagged.

| Boundary type | Labels | Flagged |
| --- | --- | --- |
| BOUNDARY_OVERTIME_AT_CAP | 2 | 0 |
| BOUNDARY_LEAVE_ADJACENT_SHIFT | 2 | 0 |
| BOUNDARY_CONSECUTIVE_DAYS_AT_MAX | 2 | 0 |

**Confusion** (rows: label; columns: detector result on the labelled records):

| Label | Detected as |
| --- | --- |
| DOUBLE_BOOKED | DOUBLE_BOOKED: 3 |
| LEAVE_OVERLAP | LEAVE_OVERLAP: 3 |
| SKILL_ABSENT | SKILL_ABSENT: 3 |
| OVERTIME_CAP_EXCEEDED | OVERTIME_CAP_EXCEEDED: 3 |
| SWAP_WITHOUT_APPROVAL | SWAP_WITHOUT_APPROVAL: 3 |

**Secondary findings** (no issue type of their own): 3, of which 3 on labelled records and 0 unexplained. By rule: R-SWP-08 3.

## 3. Acceptance criteria

| ID | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| A-01 | Coverage requirements are met or gaps reported | ✅ met | 1156 requirement slots; 12 reported as GAP in coverage_status, which recomputes exactly from the roster (I-12); an assignee without the skill never counts as cover (qualified vs assigned headcount) |
| A-02 | Working-hour constraints hold (rest, consecutive days, weekly hours, overtime cap) | ✅ met | 3 working-time findings, 3 of them on labelled anomalies; 0 unexplained |
| A-03 | Attendance reconciles with schedules | ✅ met | 2759 due assignments; 2752 (99.75 %) with a complete record; 7 uncorrected missing clock-outs reported as exceptions; 0 R-ATT-01 violations required |
| A-04 | Swap history is preserved | ✅ met | 60 swaps with complete event chains (I-10); applied swaps link old and new assignments (D-02); 3 R-SWP-08 findings, all on labelled unapproved swaps: true |

## 4. Business-rule findings by rule

| Rule / kind | Count |
| --- | --- |
| R-ATT-04 EXCEPTION | 7 |
| R-OVT-02 VIOLATION | 3 |
| R-SCH-01 VIOLATION | 3 |
| R-SCH-02 VIOLATION | 3 |
| R-SCH-03 VIOLATION | 3 |
| R-SWP-06 VIOLATION | 3 |
| R-SWP-08 VIOLATION | 3 |

## 5. Rows read

| Table | Rows |
| --- | --- |
| labor_policy | 2 |
| skill | 30 |
| team | 10 |
| employee | 200 |
| employee_skill | 323 |
| leave_entitlement | 564 |
| shift_template | 4 |
| holiday_calendar | 3 |
| shift | 112 |
| coverage_requirement | 115 |
| leave_request | 160 |
| leave_request_event | 320 |
| shift_assignment | 2,831 |
| swap_request | 60 |
| swap_request_event | 140 |
| shift_assignment_event | 2,903 |
| attendance_event | 5,451 |
| employee_week_summary | 926 |
| coverage_status | 1,156 |
| leave_balance | 564 |
| attendance_reconciliation | 2,759 |
