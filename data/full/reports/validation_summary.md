# Validation summary — profile `full`, seed 20261022

**Status: ✅ PASS**

Produced by `npm run validate -- --profile full` from the exported files only
(`csv/` and `ground_truth/`). Machine-readable version: `validation_summary.json`.

## 1. Structural integrity and decision replay

| ID | Check | Checked | Failures | Samples |
| --- | --- | --- | --- | --- |
| I-01 | Every table file present with the schema header | 21 | ✅ 0 |  |
| I-02 | Loads into sql/schema.sql (types, CHECK constraints, foreign keys) | 583,330 | ✅ 0 |  |
| I-03 | Primary keys unique and not null | 583,330 | ✅ 0 |  |
| I-04 | Unique / natural keys have no duplicates | 114,492 | ✅ 0 |  |
| I-05 | Every foreign key resolves (all joins) | 1,422,115 | ✅ 0 |  |
| I-06 | Enum columns hold allowed values | 1,089,500 | ✅ 0 |  |
| I-07 | IDs follow the documented formats | 1,823,700 | ✅ 0 |  |
| I-08 | Dates and timestamps in order | 303,151 | ✅ 0 |  |
| I-09 | No duplicate records or overlapping effective ranges | 98,145 | ✅ 0 |  |
| I-10 | Event chains complete: seq 1…n, linked statuses, time order, status = last event | 102,470 | ✅ 0 |  |
| I-11 | Cross-table consistency of roles, policies, skills, calendar and IDs | 308,777 | ✅ 0 |  |
| I-12 | Derived tables recompute exactly from the source tables (arithmetic reconciliation) | 171,054 | ✅ 0 |  |
| I-13 | JSON, SQL seed and SQLite database hold exactly the CSV data | 63 | ✅ 0 |  |
| D-01 | Leave decisions replay exactly from the rules (R-LVE-01 … R-LVE-07) | 5,000 | ✅ 0 |  |
| D-02 | Swap decisions consistent with R-SWP-01 … R-SWP-07 | 7,075 | ✅ 0 |  |

## 2. Detection against the ground truth (M-09)

A finding matches a label when it has same issue_type and at least one shared record ID.

| Issue type | Labels | Findings | Detected | Missed | Outside labels | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DOUBLE_BOOKED | 20 | 20 | 20 | 0 | 0 | 100.00 % | 100.00 % |
| LEAVE_OVERLAP | 20 | 20 | 20 | 0 | 0 | 100.00 % | 100.00 % |
| SKILL_ABSENT | 20 | 20 | 20 | 0 | 0 | 100.00 % | 100.00 % |
| OVERTIME_CAP_EXCEEDED | 20 | 20 | 20 | 0 | 0 | 100.00 % | 100.00 % |
| SWAP_WITHOUT_APPROVAL | 20 | 20 | 20 | 0 | 0 | 100.00 % | 100.00 % |

Overall: 100 / 100 anomalies detected (recall 100.00 %), precision 100.00 %.

**Boundary cases** (valid, must not be flagged): 0 of 40 flagged.

| Boundary type | Labels | Flagged |
| --- | --- | --- |
| BOUNDARY_OVERTIME_AT_CAP | 10 | 0 |
| BOUNDARY_LEAVE_ADJACENT_SHIFT | 10 | 0 |
| BOUNDARY_CONSECUTIVE_DAYS_AT_MAX | 10 | 0 |
| BOUNDARY_SWAP_AT_NOTICE_LIMIT | 10 | 0 |

**Confusion** (rows: label; columns: detector result on the labelled records):

| Label | Detected as |
| --- | --- |
| DOUBLE_BOOKED | DOUBLE_BOOKED: 20 |
| LEAVE_OVERLAP | LEAVE_OVERLAP: 20 |
| SKILL_ABSENT | SKILL_ABSENT: 20 |
| OVERTIME_CAP_EXCEEDED | OVERTIME_CAP_EXCEEDED: 20 |
| SWAP_WITHOUT_APPROVAL | SWAP_WITHOUT_APPROVAL: 20 |

**Secondary findings** (no issue type of their own): 20, of which 20 on labelled records and 0 unexplained. By rule: R-SWP-08 20.

## 3. Acceptance criteria

| ID | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| A-01 | Coverage requirements are met or gaps reported | ✅ met | 46320 requirement slots; 686 reported as GAP in coverage_status, which recomputes exactly from the roster (I-12); an assignee without the skill never counts as cover (qualified vs assigned headcount) |
| A-02 | Working-hour constraints hold (rest, consecutive days, weekly hours, overtime cap) | ✅ met | 20 working-time findings, 20 of them on labelled anomalies; 0 unexplained |
| A-03 | Attendance reconciles with schedules | ✅ met | 93128 due assignments; 92968 (99.83 %) with a complete record; 160 uncorrected missing clock-outs reported as exceptions; 0 R-ATT-01 violations required |
| A-04 | Swap history is preserved | ✅ met | 1500 swaps with complete event chains (I-10); applied swaps link old and new assignments (D-02); 20 R-SWP-08 findings, all on labelled unapproved swaps: true |

## 4. Business-rule findings by rule

| Rule / kind | Count |
| --- | --- |
| R-ATT-04 EXCEPTION | 160 |
| R-OVT-02 VIOLATION | 20 |
| R-SCH-01 VIOLATION | 20 |
| R-SCH-02 VIOLATION | 20 |
| R-SCH-03 VIOLATION | 20 |
| R-SWP-06 VIOLATION | 20 |
| R-SWP-08 VIOLATION | 20 |

## 5. Rows read

| Table | Rows |
| --- | --- |
| labor_policy | 2 |
| skill | 30 |
| team | 100 |
| employee | 2,000 |
| employee_skill | 3,179 |
| leave_entitlement | 5,658 |
| shift_template | 4 |
| holiday_calendar | 5 |
| shift | 360 |
| coverage_requirement | 1,490 |
| leave_request | 5,000 |
| leave_request_event | 10,089 |
| shift_assignment | 95,970 |
| swap_request | 1,500 |
| swap_request_event | 3,502 |
| shift_assignment_event | 98,812 |
| attendance_event | 184,575 |
| employee_week_summary | 25,948 |
| coverage_status | 46,320 |
| leave_balance | 5,658 |
| attendance_reconciliation | 93,128 |
