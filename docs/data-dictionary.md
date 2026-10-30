# YottaShift — Data Dictionary

Field-level specification for every table produced by the generator. The executable version is
[`sql/schema.sql`](../sql/schema.sql); enums are mirrored in
[`src/domain/constants.js`](../src/domain/constants.js). Relationships and cardinality are in
[erd.md](erd.md); the rules that produce each value are in [business-rules.md](business-rules.md).

**Contents:** [1. Conventions](#1-conventions) · [2. ID conventions](#2-id-conventions) ·
[3. Table catalogue](#3-table-catalogue) · [4. Master data](#4-master-data) ·
[5. Roster](#5-roster) · [6. Leave](#6-leave) · [7. Attendance](#7-attendance) ·
[8. Swaps](#8-swaps) · [9. Derived outputs](#9-derived-outputs) ·
[10. Ground truth](#10-ground-truth-file) · [11. Validator checks](#11-checks-beyond-the-schema)

---

## 1. Conventions

| Topic | Convention |
| --- | --- |
| Types | `TEXT`, `INTEGER`, `REAL` (SQLite `STRICT` tables). `BOOLEAN` = `INTEGER` 0/1. |
| Date | `DATE` = `YYYY-MM-DD`, must be a real calendar date (`2026-02-30` is rejected). |
| Timestamp | `TIMESTAMP` = `YYYY-MM-DDThh:mm:ss+05:30`. One time zone (Asia/Kolkata) for all sites, so text order = time order. |
| Window | Full profile: **2026-01-01 → 2026-03-31** (90 days, ISO weeks 2026-W01 … 2026-W14). The starter profile uses a shorter window from the same start date. |
| Snapshot | Data is "as of" 12:00 on the day after the window ends (full: `2026-04-01T12:00:00+05:30`), after the last night shift has finished. Status columns describe that moment. |
| Required | **Req** = `NOT NULL`. **Opt** = nullable; the rule column says when it is null. |
| Units | Hours as `REAL` with 2 decimals; minutes and days as `INTEGER`; headcount as `INTEGER` people. |
| Naming | `snake_case` tables and columns; `*_id` = key; `*_at` = timestamp; `*_date` = date; `is_*` = boolean. |
| Effective dating | `effective_from` (inclusive) / `effective_to` (inclusive, null = open-ended) on records that can change over time. |
| History | Lifecycle tables keep current status plus an append-only `*_event` table (R-GEN-01). |

## 2. ID conventions

IDs are deterministic, zero-padded, immutable and identical in every export (R-GEN-02).

| Entity | Format | Example | How the number is assigned |
| --- | --- | --- | --- |
| Employee *(brief)* | `EMP-` + 6 digits | `EMP-000001` | Generation order: team by team, manager first |
| Shift *(brief)* | `SHIFT-<date>-<template>` | `SHIFT-2026-01-01-A` | Natural key: date × template code |
| Leave request *(brief)* | `LVE-<year>-` + 6 digits | `LVE-2026-000001` | Year of `start_date`; counter in `submitted_at` order |
| Attendance event *(brief)* | `ATT-<employee-id>-<YYYYMMDDThhmmss>` | `ATT-EMP-000001-20260101T055800` | Employee + local `event_at`. One person cannot punch twice in the same second; if two generated events would collide, the later one moves 1 s forward. |
| Swap request *(brief)* | `SWP-<year>-` + 6 digits | `SWP-2026-000001` | Year of `requested_at`; counter in request order |
| Team | `TEAM-` + 3 digits | `TEAM-001` | Generation order |
| Skill | `SKL-` + 3 digits | `SKL-001` | Catalogue order |
| Labour policy | `POL-<FT/PT>-<year>` | `POL-FT-2026` | Employment type + year of `effective_from` |
| Shift template | template code | `A` | Fixed: A, B, C, G |
| Holiday | `HOL-<date>` | `HOL-2026-01-26` | Natural key: holiday date |
| Coverage requirement | `COV-` + 6 digits | `COV-000001` | Order of (team, template, skill, day type, effective_from) |
| Shift assignment | `ASG-<year>-` + 6 digits | `ASG-2026-000001` | Year of the shift date; counter in creation order (weekly rosters, then replacements and swaps as they happen) |
| Lifecycle event | `<parent-id>-E` + 2 digits | `LVE-2026-000001-E02` | Parent ID + `event_seq` |
| Ground-truth label | `GT-` + 6 digits | `GT-000001` | Injection order |

## 3. Table catalogue

Load order is parent first, which is also the generation order (Step 2 of the brief). Volumes
are full-profile estimates; exact counts are written to the manifest (Phase 7).

| # | Table | Core entity | Kind | Grain | Primary key | ≈ Rows (full) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `labor_policy` | (supports Employee) | master | employment type × effective period | `policy_id` | 2 |
| 2 | `team` | **Team** | master | team | `team_id` | 100 |
| 3 | `skill` | **Skill** | master | skill | `skill_id` | 24 |
| 4 | `employee` | **Employee** | master | employee | `employee_id` | 2,000 |
| 5 | `employee_skill` | (bridge Employee N:M Skill) | master | employee × skill | (`employee_id`, `skill_id`) | ~5,000 |
| 6 | `leave_entitlement` | (supports LeaveRequest) | master | employee × leave type × period | (`employee_id`, `leave_type`, `period_start`) | 6,000 |
| 7 | `shift_template` | **ShiftTemplate** | master | template | `template_code` | 4 |
| 8 | `holiday_calendar` | **HolidayCalendar** | master | holiday date | `holiday_id` | 5 |
| 9 | `shift` | (instance of ShiftTemplate) | master | date × template | `shift_id` | 360 |
| 10 | `coverage_requirement` | **CoverageRequirement** | master | team × template × skill × day type × effective period | `coverage_id` | ~2,000 |
| 11 | `shift_assignment` | **ShiftAssignment** | roster | employee × shift (one version) | `assignment_id` | ~120,000 |
| 12 | `shift_assignment_event` | (history) | event | assignment status change | `event_id` | ~125,000 |
| 13 | `leave_request` | **LeaveRequest** | transaction | request | `leave_request_id` | 5,000 |
| 14 | `leave_request_event` | (history) | event | request status change | `event_id` | ~10,500 |
| 15 | `attendance_event` | **AttendanceEvent** | event | punch / no-show | `attendance_event_id` | ~230,000 |
| 16 | `swap_request` | **SwapRequest** | transaction | request | `swap_id` | ~1,500 |
| 17 | `swap_request_event` | (history) | event | request status change | `event_id` | ~3,500 |
| 18 | `employee_week_summary` | derived | derived | employee × ISO week | (`employee_id`, `iso_week`) | ~27,000 |
| 19 | `coverage_status` | derived | derived | shift × team × skill | (`shift_id`, `team_id`, `skill_id`) | ~45,000 |
| 20 | `leave_balance` | derived | derived | employee × leave type | (`employee_id`, `leave_type`) | 6,000 |
| 21 | `attendance_reconciliation` | derived | derived | due assignment | `assignment_id` | ~115,000 |

`ground_truth.csv/json` is **not** a table in this database; it is written to a separate folder
(§10).

---

## 4. Master data

### 4.1 `labor_policy` — working-time limits per employment type

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `policy_id` | TEXT | Req | `POL-FT-2026`, `POL-PT-2026` | — | PK | Matches `POL-[A-Z]{2}-\d{4}` |
| `employment_type` | TEXT | Req | `FULL_TIME`, `PART_TIME` | — | — | Enum |
| `contracted_weekly_hours` | REAL | Req | FT 40, PT 24 | hours / week | — | 0 < x ≤ 48 |
| `max_weekly_scheduled_hours` | REAL | Req | FT 48, PT 32 | hours / week | — | ≥ contracted, ≤ 60 (R-SCH-08) |
| `weekly_overtime_cap_hours` | REAL | Req | FT 12, PT 8 | hours / week | — | ≥ 0 (R-OVT-02) |
| `min_rest_hours` | REAL | Req | 11 | hours | — | 0 < x ≤ 24 (R-SCH-06) |
| `max_consecutive_days` | INTEGER | Req | 6 | days | — | 1–7 (R-SCH-07) |
| `effective_from` | DATE | Req | `2026-01-01` | — | — | Valid date |
| `effective_to` | DATE | Opt | null = still in force | — | — | ≥ `effective_from` |

### 4.2 `team` — **Team**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `team_id` | TEXT | Req | `TEAM-001` … `TEAM-100` | — | PK | `TEAM-\d{3}` |
| `team_name` | TEXT | Req | e.g. `Support Alpha` | — | Unique | Non-blank |
| `team_function` | TEXT | Req | `CUSTOMER_SUPPORT`, `WAREHOUSE`, `FIELD_SERVICE`, `SECURITY`, `IT_NOC`, `FACILITIES`, `WORKFORCE_OFFICE` | — | — | Enum; decides the skill pool. Exactly one `WORKFORCE_OFFICE` team (no coverage, never rostered) |
| `site_code` | TEXT | Req | `BLR`, `HYD`, `PUN`, `CHN` (synthetic sites) | — | — | Enum |
| `operating_pattern` | TEXT | Req | `TWENTY_FOUR_SEVEN`, `EXTENDED_HOURS`, `BUSINESS_HOURS` | — | — | Enum; templates per R-COV-02 |
| `manager_employee_id` | TEXT | Req | an `EMP-` ID | — | Unique | FK → `employee` (deferred). Validator: that employee has role `MANAGER` and `team_id` = this team |
| `hr_partner_employee_id` | TEXT | Req | an `EMP-` ID | — | — | FK → `employee` (deferred). Validator: role `HR_PARTNER`, member of the Workforce Office team; decides leave per R-LVE-07 |
| `effective_from` | DATE | Req | team creation date | — | — | Valid date |
| `effective_to` | DATE | Opt | null = active | — | — | ≥ `effective_from` |

### 4.3 `skill` — **Skill**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `skill_id` | TEXT | Req | `SKL-001` … | — | PK | `SKL-\d{3}` |
| `skill_name` | TEXT | Req | from the skill catalogue in `config/` (e.g. `Forklift Operation`) | — | Unique | Non-blank |
| `skill_category` | TEXT | Req | `TECHNICAL`, `SAFETY`, `LANGUAGE`, `OPERATIONAL`, `LEADERSHIP` | — | — | Enum |
| `requires_certification` | BOOLEAN | Req | 0 / 1 | — | — | 0/1 |
| `certification_validity_days` | INTEGER | Opt | e.g. 365; null when no certification | days | — | > 0; set **iff** `requires_certification = 1` |

### 4.4 `employee` — **Employee**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `employee_id` | TEXT | Req | `EMP-000001` … `EMP-002000` | — | PK | `EMP-\d{6}` |
| `full_name` | TEXT | Req | synthetic first + last name | — | — | Non-blank; not a real person |
| `team_id` | TEXT | Req | a `TEAM-` ID | — | — | FK → `team`. One team for the whole window (assumption A-03) |
| `employee_role` | TEXT | Req | `MEMBER`, `LEAD`, `MANAGER`, `HR_PARTNER`, `OPS_PARTNER` | — | — | Enum; exactly one `MANAGER` per team; `HR_PARTNER`/`OPS_PARTNER` only in the Workforce Office; only `MEMBER`/`LEAD` are schedulable (validator) |
| `employment_type` | TEXT | Req | `FULL_TIME`, `PART_TIME` | — | — | Enum; equals the policy's `employment_type` (validator) |
| `policy_id` | TEXT | Req | `POL-FT-2026` / `POL-PT-2026` | — | — | FK → `labor_policy` |
| `primary_skill_id` | TEXT | Req | a `SKL-` ID | — | — | FK → `skill`; must also be in `employee_skill` (validator) |
| `hire_date` | DATE | Req | ≤ window end; some fall inside the window | — | — | Valid date |
| `termination_date` | DATE | Opt | null = still employed; only inside the window | — | — | ≥ `hire_date` |
| `employment_status` | TEXT | Req | `ACTIVE`, `TERMINATED` (as of the snapshot) | — | — | `TERMINATED` **iff** `termination_date` is set |

### 4.5 `employee_skill` — bridge Employee N:M Skill

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `employee_id` | TEXT | Req | an `EMP-` ID | — | PK part | FK → `employee` |
| `skill_id` | TEXT | Req | a `SKL-` ID | — | PK part | FK → `skill`; drawn from the team function's skill pool |
| `proficiency` | TEXT | Req | `BASIC`, `INTERMEDIATE`, `EXPERT` | — | — | Enum |
| `valid_from` | DATE | Req | date acquired / certified | — | — | Valid date |
| `valid_to` | DATE | Opt | certification expiry; null = no expiry | — | — | ≥ `valid_from`; for certified skills = `valid_from + certification_validity_days − 1` (validator) |

One row per (employee, skill); renewals are out of scope (a lapsed certification simply expires).

### 4.6 `leave_entitlement` — leave days available for the window

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `employee_id` | TEXT | Req | an `EMP-` ID | — | PK part | FK → `employee` |
| `leave_type` | TEXT | Req | `ANNUAL`, `CASUAL`, `SICK` | — | PK part | Enum (UNPAID has no entitlement) |
| `period_start` | DATE | Req | window start | — | PK part | Valid date |
| `period_end` | DATE | Req | window end | — | — | ≥ `period_start` |
| `entitled_days` | INTEGER | Req | ANNUAL 2–18 (carry-over + accrual), CASUAL 3, SICK 6 (FT; PT prorated) | days | — | 0–60 |

### 4.7 `shift_template` — **ShiftTemplate**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `template_code` | TEXT | Req | `A` Morning 06–14, `B` Evening 14–22, `C` Night 22–06, `G` General 09–17 | — | PK | Enum |
| `template_name` | TEXT | Req | `Morning`, `Evening`, `Night`, `General` | — | Unique | Non-blank |
| `start_time` | TEXT | Req | `HH:MM` | local time | — | 00:00–23:59 |
| `end_time` | TEXT | Req | `HH:MM` | local time | — | 00:00–23:59 |
| `duration_minutes` | INTEGER | Req | 480 | minutes | — | 60–720; equals end − start, +24 h when overnight (validator) |
| `is_overnight` | BOOLEAN | Req | 1 for C | — | — | 1 **iff** `end_time ≤ start_time` |
| `is_night` | BOOLEAN | Req | 1 for C | — | — | 0/1; used by fairness (R-SCH-09, M-08) |
| `effective_from` | DATE | Req | — | — | — | Valid date |
| `effective_to` | DATE | Opt | null = in use | — | — | ≥ `effective_from` |

Breaks are paid and included in the duration (assumption); a shift is 8 paid hours.

### 4.8 `holiday_calendar` — **HolidayCalendar**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `holiday_id` | TEXT | Req | `HOL-<holiday_date>` | — | PK | Equals `'HOL-' ‖ holiday_date` |
| `holiday_date` | DATE | Req | inside the window | — | Unique | Valid date |
| `holiday_name` | TEXT | Req | e.g. `Republic Day` | — | — | Non-blank |
| `holiday_type` | TEXT | Req | `PUBLIC`, `COMPANY` | — | — | Enum |

The calendar is synthetic: company holidays modelled on common Indian public holidays and
applied to all sites. It is not an authoritative holiday list (see README, *Data provenance*).

### 4.9 `shift` — concrete shift (date × template)

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `shift_id` | TEXT | Req | `SHIFT-2026-01-01-A` | — | PK | Equals `'SHIFT-' ‖ shift_date ‖ '-' ‖ template_code` |
| `shift_date` | DATE | Req | inside the window | — | Unique with template | Valid date |
| `template_code` | TEXT | Req | A / B / C / G | — | Unique with date | FK → `shift_template` |
| `start_at` | TIMESTAMP | Req | `shift_date` + template start | — | — | Date part = `shift_date` |
| `end_at` | TIMESTAMP | Req | next day for C | — | — | > `start_at`; = `start_at` + duration (validator) |
| `iso_week` | TEXT | Req | `2026-W01` … | — | — | Equals `strftime('%G-W%V', shift_date)` |
| `day_type` | TEXT | Req | `WEEKDAY`, `WEEKEND`, `HOLIDAY` | — | — | Derived per R-COV-03 (validator recomputes) |
| `holiday_id` | TEXT | Opt | set only on holidays | — | — | FK → `holiday_calendar`; set **iff** `day_type = HOLIDAY` |

All four templates exist on every date; a team only uses the ones in its pattern (R-COV-02).

### 4.10 `coverage_requirement` — **CoverageRequirement**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `coverage_id` | TEXT | Req | `COV-000001` … | — | PK | `COV-\d{6}` |
| `team_id` | TEXT | Req | a `TEAM-` ID | — | Unique key part | FK → `team` |
| `template_code` | TEXT | Req | within the team's pattern | — | Unique key part | FK → `shift_template`; R-COV-02 (validator) |
| `skill_id` | TEXT | Req | a skill some team member holds | — | Unique key part | FK → `skill` |
| `day_type` | TEXT | Req | `WEEKDAY`, `WEEKEND`, `HOLIDAY` | — | Unique key part | Enum; none for WEEKEND/HOLIDAY in `BUSINESS_HOURS` teams |
| `min_headcount` | INTEGER | Req | typically 1–6 | people | — | 1–50 (no requirement = no row) |
| `effective_from` | DATE | Req | window start, or a mid-window revision date | — | Unique key part | Valid date |
| `effective_to` | DATE | Opt | null = open-ended | — | — | ≥ `effective_from`; ranges for the same key never overlap (validator) |

---

## 5. Roster

### 5.1 `shift_assignment` — **ShiftAssignment**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `assignment_id` | TEXT | Req | `ASG-2026-000001` | — | PK | `ASG-\d{4}-\d{6}`; year = shift year (validator) |
| `shift_id` | TEXT | Req | a `SHIFT-` ID | — | — | FK → `shift` |
| `employee_id` | TEXT | Req | an `EMP-` ID | — | — | FK → `employee`; R-SCH-01 … 08 (validator) |
| `team_id` | TEXT | Req | a `TEAM-` ID | — | — | FK → `team`; = employee's team (R-SCH-05) |
| `skill_id` | TEXT | Req | the skill this person covers on the shift | — | — | FK → `skill`; held and valid (R-SCH-03) |
| `source` | TEXT | Req | `ROSTER`, `REPLACEMENT`, `SWAP` | — | — | Enum |
| `swap_id` | TEXT | Opt | set only for `SWAP` | — | — | FK → `swap_request`; set **iff** `source = SWAP` |
| `supersedes_assignment_id` | TEXT | Opt | the assignment this one replaces | — | — | FK → `shift_assignment`; null **iff** `source = ROSTER`; never itself |
| `created_at` | TIMESTAMP | Req | roster publication time, or the time of the leave decision / swap | — | — | < shift `start_at` (validator) |
| `status` | TEXT | Req | `SCHEDULED`, `CANCELLED`, `SWAPPED_OUT` | — | — | Enum; = last event's `to_status` (R-GEN-01) |

The schema allows two active assignments for the same person and date on purpose, so the
`DOUBLE_BOOKED` anomaly can be loaded and then detected (R-GEN-03).

### 5.2 `shift_assignment_event` — assignment history

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `event_id` | TEXT | Req | `ASG-2026-000001-E01` | — | PK | = `assignment_id ‖ '-E' ‖ seq` |
| `assignment_id` | TEXT | Req | — | — | Unique with seq | FK → `shift_assignment` |
| `event_seq` | INTEGER | Req | 1, 2, … without gaps | — | Unique with parent | 1–99; no gaps (validator) |
| `from_status` | TEXT | Opt | null for the first event | — | — | Null **iff** `event_seq = 1`; = previous `to_status` |
| `to_status` | TEXT | Req | assignment status | — | — | Allowed transition (§3 of business rules) |
| `event_at` | TIMESTAMP | Req | — | — | — | Non-decreasing within the chain |
| `actor_role` | TEXT | Req | `SYSTEM` for publication, cancellation and swaps | — | — | Enum |
| `actor_employee_id` | TEXT | Opt | null when `SYSTEM` | — | — | FK → `employee`; null **iff** `actor_role = SYSTEM` |
| `reason_code` | TEXT | Req | `ROSTER_PUBLISHED`, `REPLACEMENT_FOR_LEAVE`, `LEAVE_APPROVED`, `SWAP_APPLIED` | — | — | Enum |
| `leave_request_id` | TEXT | Opt | the leave behind a cancellation or replacement | — | — | FK → `leave_request` |
| `swap_id` | TEXT | Opt | the swap behind a swap-out or swap-in | — | — | FK → `swap_request` |

---

## 6. Leave

### 6.1 `leave_request` — **LeaveRequest**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `leave_request_id` | TEXT | Req | `LVE-2026-000001` | — | PK | Year = `start_date` year |
| `employee_id` | TEXT | Req | a schedulable employee (`MEMBER`/`LEAD`) | — | — | FK → `employee` |
| `leave_type` | TEXT | Req | `ANNUAL`, `CASUAL`, `SICK`, `UNPAID` | — | — | Enum |
| `start_date` | DATE | Req | inside the window | — | — | Valid date |
| `end_date` | DATE | Req | inside the window | — | — | ≥ `start_date` |
| `requested_days` | INTEGER | Req | 1–15 | calendar days | — | = `end_date − start_date + 1` |
| `submitted_at` | TIMESTAMP | Req | may be before the window (advance requests) | — | — | ≤ decision time |
| `status` | TEXT | Req | `SUBMITTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `CANCELLED` | — | — | Enum; = last event's `to_status` |
| `decided_at` | TIMESTAMP | Opt | null while `SUBMITTED` or after `WITHDRAWN` | — | — | ≥ `submitted_at`; before `start_date` except SICK (R-LVE-08) |
| `decided_by_role` | TEXT | Opt | `MANAGER`, `HR_PARTNER`, `SYSTEM` | — | — | Set with `decided_at`; R-LVE-07 decides which |
| `decided_by_employee_id` | TEXT | Opt | `team.manager_employee_id` or `team.hr_partner_employee_id` | — | — | FK → `employee`; null **iff** decided by `SYSTEM` |
| `decision_rule_id` | TEXT | Opt | `R-LVE-01` … `R-LVE-07` | — | — | Set with `decided_at`; in the rule catalogue |
| `decision_reason_code` | TEXT | Opt | approve/reject reason | — | — | Set with `decided_at`; enum |

The decision columns hold the approve/reject decision. A later cancellation (`CANCELLED`) keeps
them and adds an event; it does not overwrite them.

### 6.2 `leave_request_event` — leave history

Same layout as `shift_assignment_event`, with `leave_request_id` as the parent, statuses from
`LEAVE_STATUS`, plus:

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `rule_id` | TEXT | Opt | rule applied at this step | — | — | In the rule catalogue |
| `reason_code` | TEXT | Opt | null for the `SUBMITTED` event | — | — | `LEAVE_REASON_CODE` enum |

A full chain looks like: E01 `null → SUBMITTED` (EMPLOYEE) → E02 `SUBMITTED → APPROVED`
(MANAGER, `R-LVE-07`) → E03 `APPROVED → CANCELLED` (EMPLOYEE, `R-LVE-10`).

---

## 7. Attendance

### 7.1 `attendance_event` — **AttendanceEvent**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `attendance_event_id` | TEXT | Req | `ATT-EMP-000001-20260101T055800` | — | PK | = `'ATT-' ‖ employee_id ‖ '-' ‖ compact(event_at)` |
| `employee_id` | TEXT | Req | an `EMP-` ID | — | — | FK → `employee`; = assignment's employee (validator) |
| `assignment_id` | TEXT | Req | the assignment being worked | — | — | FK → `shift_assignment`; must be final `SCHEDULED` (R-ATT-01) |
| `event_type` | TEXT | Req | `CLOCK_IN`, `CLOCK_OUT`, `NO_SHOW` | — | — | Enum; one in + one out, or one no-show, per assignment |
| `event_at` | TIMESTAMP | Req | when it happened | — | — | Clock-in ≥ start − 60 min; clock-out > clock-in |
| `source` | TEXT | Req | `BADGE`, `MOBILE`, `MANUAL`, `SYSTEM` | — | — | `SYSTEM` **iff** `NO_SHOW`; `MANUAL` = ops correction (R-ATT-04) |
| `recorded_at` | TIMESTAMP | Req | when it reached the system | — | — | ≥ `event_at`; later for `MANUAL` |
| `recorded_by_employee_id` | TEXT | Opt | the ops partner who keyed a `MANUAL` event | — | — | FK → `employee`; set **iff** `source = MANUAL`; role `OPS_PARTNER` (validator) |

---

## 8. Swaps

### 8.1 `swap_request` — **SwapRequest**

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `swap_id` | TEXT | Req | `SWP-2026-000001` | — | PK | Year = `requested_at` year |
| `swap_type` | TEXT | Req | `SWAP` (exchange), `COVER` (counterpart takes the shift) | — | — | Enum |
| `team_id` | TEXT | Req | a `TEAM-` ID | — | — | FK → `team`; R-SWP-01 |
| `requester_employee_id` | TEXT | Req | an `EMP-` ID | — | — | FK → `employee`; = owner of the requester assignment |
| `requester_assignment_id` | TEXT | Req | the shift being given away | — | — | FK → `shift_assignment` |
| `counterpart_employee_id` | TEXT | Req | an `EMP-` ID | — | — | FK → `employee`; ≠ requester |
| `counterpart_assignment_id` | TEXT | Opt | null for `COVER` | — | — | FK → `shift_assignment`; set **iff** `SWAP` |
| `requested_at` | TIMESTAMP | Req | — | — | — | Earlier than the earliest affected shift |
| `status` | TEXT | Req | `REQUESTED`, `APPROVED`, `REJECTED`, `APPLIED`, `CANCELLED`, `EXPIRED` | — | — | Enum; = last event's `to_status` |
| `decided_at` | TIMESTAMP | Opt | null while `REQUESTED` / after `CANCELLED` | — | — | ≥ `requested_at`; required for APPROVED, REJECTED, EXPIRED |
| `decided_by_role` | TEXT | Opt | `MANAGER`, or `SYSTEM` for expiry | — | — | Set with `decided_at` |
| `decided_by_employee_id` | TEXT | Opt | the team manager | — | — | FK → `employee`; null **iff** `SYSTEM` |
| `decision_rule_id` | TEXT | Opt | `R-SWP-0x` | — | — | Set with `decided_at` |
| `decision_reason_code` | TEXT | Opt | approve / reject / expiry reason | — | — | Set with `decided_at`; enum |
| `applied_at` | TIMESTAMP | Opt | set only when `APPLIED` | — | — | Set **iff** `APPLIED`; ≤ approval + 10 min and < shift start (validator) |

`APPLIED` without a decision is structurally allowed so that `SWAP_WITHOUT_APPROVAL` can be
loaded and detected (R-SWP-06).

### 8.2 `swap_request_event` — swap history

Same layout as `leave_request_event` with `swap_id` as the parent and statuses from
`SWAP_STATUS`. Normal chain: `REQUESTED` (EMPLOYEE) → `APPROVED` (MANAGER, `R-SWP-05`) →
`APPLIED` (SYSTEM, `R-SWP-06`).

---

## 9. Derived outputs

Recomputed from the tables above (Step 6 of the brief). The validator recomputes them again and
compares (arithmetic reconciliation).

### 9.1 `employee_week_summary`

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `employee_id` | TEXT | Req | schedulable employee | — | PK part | FK → `employee` |
| `iso_week` | TEXT | Req | `2026-W01` … | — | PK part | ISO week format |
| `days_in_window` | INTEGER | Req | 1–7 | days | — | Days of that week inside the window and employment |
| `contracted_hours` | REAL | Req | contracted × days_in_window / 7 | hours | — | ≥ 0 |
| `scheduled_hours` | REAL | Req | Σ duration of final `SCHEDULED` assignments | hours | — | ≤ R-SCH-08 limit outside anomalies |
| `worked_hours` | REAL | Req | Σ worked minutes / 60 (R-ATT-03) | hours | — | ≥ 0 |
| `overtime_hours` | REAL | Req | R-OVT-01 | hours | — | ≥ 0 |
| `overtime_cap_hours` | REAL | Req | from `labor_policy` | hours | — | ≥ 0 |
| `is_overtime_cap_exceeded` | BOOLEAN | Req | 0 / 1 | — | — | = `overtime_hours > overtime_cap_hours` |

### 9.2 `coverage_status`

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `shift_id`, `team_id`, `skill_id` | TEXT | Req | — | — | PK | FKs; one row per combination with a requirement or an assignment |
| `coverage_id` | TEXT | Opt | matching requirement (R-COV-01) | — | — | Null **iff** `required_headcount = 0` |
| `required_headcount` | INTEGER | Req | R-COV-01 | people | — | ≥ 0 |
| `assigned_headcount` | INTEGER | Req | final `SCHEDULED` assignments | people | — | ≥ qualified |
| `qualified_headcount` | INTEGER | Req | assigned **and** holding the skill | people | — | ≤ assigned |
| `attended_headcount` | INTEGER | Req | qualified people with outcome `PRESENT` | people | — | ≥ 0 |
| `gap_headcount` | INTEGER | Req | max(0, required − qualified) | people | — | Schema-checked |
| `attended_gap_headcount` | INTEGER | Req | max(0, required − attended) | people | — | Schema-checked |
| `status` | TEXT | Req | `MET`, `GAP` | — | — | `GAP` **iff** `gap_headcount > 0` |

### 9.3 `leave_balance`

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `employee_id`, `leave_type` | TEXT | Req | entitled types only | — | PK | FK → `employee` |
| `entitled_days` | INTEGER | Req | from `leave_entitlement` | days | — | ≥ 0 |
| `approved_days` | INTEGER | Req | Σ `requested_days` of leave whose final status is `APPROVED` | days | — | ≥ 0 |
| `remaining_days` | INTEGER | Req | entitled − approved | days | — | Schema-checked; ≥ 0 outside anomalies |

### 9.4 `attendance_reconciliation`

| Field | Type | Req | Allowed values / format | Units | Unique | Validation rule |
| --- | --- | --- | --- | --- | --- | --- |
| `assignment_id` | TEXT | Req | final `SCHEDULED` assignment whose shift ended before the snapshot | — | PK | FK → `shift_assignment` |
| `employee_id`, `shift_id` | TEXT | Req | copied from the assignment | — | — | FKs |
| `scheduled_minutes` | INTEGER | Req | template duration | minutes | — | > 0 |
| `clock_in_at`, `clock_out_at` | TIMESTAMP | Opt | from `attendance_event` | — | — | Out > in |
| `worked_minutes` | INTEGER | Opt | R-ATT-03 | minutes | — | Set **iff** `PRESENT` |
| `late_minutes`, `early_leave_minutes`, `extension_minutes` | INTEGER | Opt | R-ATT-02 | minutes | — | ≥ 0 |
| `outcome` | TEXT | Req | `PRESENT`, `NO_SHOW`, `MISSING_PUNCH`, `NO_RECORD` | — | — | Consistent with which punches exist |

---

## 10. Ground-truth file

Written to `data/<profile>/ground_truth/ground_truth.csv` and `.json`, **outside** the input
tables and the database, so no input feature can leak a label (Step 7 of the brief).

| Field | Type | Req | Allowed values / format | Validation rule |
| --- | --- | --- | --- | --- |
| `ground_truth_id` | TEXT | Req | `GT-000001` | Unique |
| `label_class` | TEXT | Req | `ANOMALY`, `BOUNDARY` | Enum `LABEL_CLASS` |
| `issue_type` | TEXT | Req | see business rules §4 | Enum `ISSUE_TYPE` |
| `rule_id` | TEXT | Req | rule broken (or tested at its limit) | In the rule catalogue |
| `primary_table` | TEXT | Req | e.g. `shift_assignment` | A table name |
| `record_ids` | TEXT | Req | `;`-separated IDs of the affected rows | Every ID exists in its table |
| `employee_id` | TEXT | Req | the employee concerned | Exists |
| `reference_date` | DATE | Req | shift date or ISO-week start | Inside the window |
| `expected_detection` | BOOLEAN | Req | 1 for ANOMALY, 0 for BOUNDARY | — |
| `description` | TEXT | Req | plain-language explanation | Non-blank |

---

## 11. Checks beyond the schema

The schema cannot express rules that span rows. The validator (Phase 6) runs these checks; each
one maps to a rule above.

| Group | Check |
| --- | --- |
| Keys | PK uniqueness in every exported file (CSV/JSON as well as DB); no duplicate natural keys (e.g. coverage key + date range) |
| Joins | Every FK resolves in every export; `team.manager_employee_id` is a `MANAGER` of that team; `team.hr_partner_employee_id` is an `HR_PARTNER`; `recorded_by_employee_id` is an `OPS_PARTNER`; event actors have the role they claim; `employee.employment_type` matches its policy |
| Enums | Every enum column in every export is in its allowed list |
| Dates | `effective_from ≤ effective_to`; non-overlapping effective ranges; shift `end_at = start_at + duration`; events in time order; decisions before leave/shift start |
| Derivations | `day_type`, `iso_week`, `requested_days`, certification `valid_to`, all four derived tables recomputed and compared |
| Lifecycles | Event chains start at the initial state, follow `TRANSITIONS`, have no gaps in `event_seq`, end at the parent's `status` |
| Business rules | R-SCH-01 … R-SCH-08, R-SWP-06, R-ATT-01, R-OVT-02 → findings compared with ground truth |
