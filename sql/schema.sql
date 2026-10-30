-- YottaShift schema (SQLite 3.45+, STRICT tables).
--
-- Conventions
--   * Dates are 'YYYY-MM-DD'; timestamps are ISO-8601 local time with the fixed offset
--     '+05:30', so string comparison orders them correctly.
--   * Enum CHECK lists mirror src/domain/constants.js (test/schema.test.js keeps them equal).
--   * The schema enforces structure only: keys, formats, enums and single-row consistency.
--     Cross-row business rules (double booking, rest, overtime cap, swap approval ...) are
--     checked by the validator so that labelled anomalies stay loadable (rule R-GEN-03).
--   * Lifecycle tables keep the current status as a projection of their *_event history;
--     events are append-only (rule R-GEN-01).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------------------

CREATE TABLE labor_policy (
  policy_id                  TEXT PRIMARY KEY
                             CHECK (policy_id GLOB 'POL-[A-Z][A-Z]-[0-9][0-9][0-9][0-9]'),
  employment_type            TEXT NOT NULL CHECK (employment_type IN ('FULL_TIME', 'PART_TIME')),
  contracted_weekly_hours    REAL NOT NULL CHECK (contracted_weekly_hours > 0 AND contracted_weekly_hours <= 48),
  max_weekly_scheduled_hours REAL NOT NULL CHECK (max_weekly_scheduled_hours <= 60),
  weekly_overtime_cap_hours  REAL NOT NULL CHECK (weekly_overtime_cap_hours >= 0),
  min_rest_hours             REAL NOT NULL CHECK (min_rest_hours > 0 AND min_rest_hours <= 24),
  max_consecutive_days       INTEGER NOT NULL CHECK (max_consecutive_days BETWEEN 1 AND 7),
  effective_from             TEXT NOT NULL CHECK (effective_from IS date(effective_from)),
  effective_to               TEXT CHECK (effective_to IS date(effective_to)),
  CHECK (max_weekly_scheduled_hours >= contracted_weekly_hours),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
) STRICT;

CREATE TABLE team (
  team_id             TEXT PRIMARY KEY CHECK (team_id GLOB 'TEAM-[0-9][0-9][0-9]'),
  team_name           TEXT NOT NULL UNIQUE CHECK (length(trim(team_name)) > 0),
  team_function       TEXT NOT NULL CHECK (team_function IN ('CUSTOMER_SUPPORT', 'WAREHOUSE', 'FIELD_SERVICE', 'SECURITY', 'IT_NOC', 'FACILITIES', 'WORKFORCE_OFFICE')),
  site_code           TEXT NOT NULL CHECK (site_code IN ('BLR', 'HYD', 'PUN', 'CHN')),
  operating_pattern   TEXT NOT NULL CHECK (operating_pattern IN ('TWENTY_FOUR_SEVEN', 'EXTENDED_HOURS', 'BUSINESS_HOURS')),
  -- team and employee reference each other; the deferred FKs let both load in one transaction.
  manager_employee_id TEXT NOT NULL UNIQUE
                      REFERENCES employee (employee_id) DEFERRABLE INITIALLY DEFERRED,
  hr_partner_employee_id TEXT NOT NULL
                      REFERENCES employee (employee_id) DEFERRABLE INITIALLY DEFERRED,
  effective_from      TEXT NOT NULL CHECK (effective_from IS date(effective_from)),
  effective_to        TEXT CHECK (effective_to IS date(effective_to)),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
) STRICT;

CREATE TABLE skill (
  skill_id                    TEXT PRIMARY KEY CHECK (skill_id GLOB 'SKL-[0-9][0-9][0-9]'),
  skill_name                  TEXT NOT NULL UNIQUE CHECK (length(trim(skill_name)) > 0),
  skill_category              TEXT NOT NULL CHECK (skill_category IN ('TECHNICAL', 'SAFETY', 'LANGUAGE', 'OPERATIONAL', 'LEADERSHIP')),
  requires_certification      INTEGER NOT NULL CHECK (requires_certification IN (0, 1)),
  certification_validity_days INTEGER CHECK (certification_validity_days > 0),
  CHECK ((requires_certification = 1) = (certification_validity_days IS NOT NULL))
) STRICT;

CREATE TABLE employee (
  employee_id       TEXT PRIMARY KEY CHECK (employee_id GLOB 'EMP-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  full_name         TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  team_id           TEXT NOT NULL REFERENCES team (team_id),
  employee_role     TEXT NOT NULL CHECK (employee_role IN ('MEMBER', 'LEAD', 'MANAGER', 'HR_PARTNER', 'OPS_PARTNER')),
  employment_type   TEXT NOT NULL CHECK (employment_type IN ('FULL_TIME', 'PART_TIME')),
  policy_id         TEXT NOT NULL REFERENCES labor_policy (policy_id),
  primary_skill_id  TEXT NOT NULL REFERENCES skill (skill_id),
  hire_date         TEXT NOT NULL CHECK (hire_date IS date(hire_date)),
  termination_date  TEXT CHECK (termination_date IS date(termination_date)),
  employment_status TEXT NOT NULL CHECK (employment_status IN ('ACTIVE', 'TERMINATED')),
  CHECK (termination_date IS NULL OR termination_date >= hire_date),
  -- Status is as of the dataset snapshot; terminations are only generated inside the window.
  CHECK ((employment_status = 'TERMINATED') = (termination_date IS NOT NULL))
) STRICT;

-- Bridge table: Employee N:M Skill.
CREATE TABLE employee_skill (
  employee_id TEXT NOT NULL REFERENCES employee (employee_id),
  skill_id    TEXT NOT NULL REFERENCES skill (skill_id),
  proficiency TEXT NOT NULL CHECK (proficiency IN ('BASIC', 'INTERMEDIATE', 'EXPERT')),
  valid_from  TEXT NOT NULL CHECK (valid_from IS date(valid_from)),
  valid_to    TEXT CHECK (valid_to IS date(valid_to)),
  PRIMARY KEY (employee_id, skill_id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
) STRICT;

CREATE TABLE leave_entitlement (
  employee_id   TEXT NOT NULL REFERENCES employee (employee_id),
  leave_type    TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'CASUAL', 'SICK')),
  period_start  TEXT NOT NULL CHECK (period_start IS date(period_start)),
  period_end    TEXT NOT NULL CHECK (period_end IS date(period_end)),
  entitled_days INTEGER NOT NULL CHECK (entitled_days BETWEEN 0 AND 60),
  PRIMARY KEY (employee_id, leave_type, period_start),
  CHECK (period_end >= period_start)
) STRICT;

CREATE TABLE shift_template (
  template_code    TEXT PRIMARY KEY CHECK (template_code IN ('A', 'B', 'C', 'G')),
  template_name    TEXT NOT NULL UNIQUE,
  start_time       TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time < '24:00'),
  end_time         TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND end_time < '24:00'),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 60 AND 720),
  is_overnight     INTEGER NOT NULL CHECK (is_overnight IN (0, 1)),
  is_night         INTEGER NOT NULL CHECK (is_night IN (0, 1)),
  effective_from   TEXT NOT NULL CHECK (effective_from IS date(effective_from)),
  effective_to     TEXT CHECK (effective_to IS date(effective_to)),
  CHECK ((is_overnight = 1) = (end_time <= start_time)),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
) STRICT;

CREATE TABLE holiday_calendar (
  holiday_id   TEXT PRIMARY KEY CHECK (holiday_id = 'HOL-' || holiday_date),
  holiday_date TEXT NOT NULL UNIQUE CHECK (holiday_date IS date(holiday_date)),
  holiday_name TEXT NOT NULL CHECK (length(trim(holiday_name)) > 0),
  holiday_type TEXT NOT NULL CHECK (holiday_type IN ('PUBLIC', 'COMPANY'))
) STRICT;

-- One row per calendar date x template: the concrete shift that assignments, coverage and
-- attendance join on. day_type and iso_week are derived and re-checked by the validator.
CREATE TABLE shift (
  shift_id      TEXT PRIMARY KEY CHECK (shift_id = 'SHIFT-' || shift_date || '-' || template_code),
  shift_date    TEXT NOT NULL CHECK (shift_date IS date(shift_date)),
  template_code TEXT NOT NULL REFERENCES shift_template (template_code),
  start_at      TEXT NOT NULL CHECK (start_at GLOB '????-??-??T??:??:??+05:30' AND substr(start_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(start_at, 1, 19))),
  end_at        TEXT NOT NULL CHECK (end_at GLOB '????-??-??T??:??:??+05:30' AND substr(end_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(end_at, 1, 19))),
  iso_week      TEXT NOT NULL CHECK (iso_week = strftime('%G-W%V', shift_date)),
  day_type      TEXT NOT NULL CHECK (day_type IN ('WEEKDAY', 'WEEKEND', 'HOLIDAY')),
  holiday_id    TEXT REFERENCES holiday_calendar (holiday_id),
  UNIQUE (shift_date, template_code),
  CHECK (substr(start_at, 1, 10) = shift_date),
  CHECK (end_at > start_at),
  CHECK ((day_type = 'HOLIDAY') = (holiday_id IS NOT NULL))
) STRICT;

CREATE TABLE coverage_requirement (
  coverage_id    TEXT PRIMARY KEY CHECK (coverage_id GLOB 'COV-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  team_id        TEXT NOT NULL REFERENCES team (team_id),
  template_code  TEXT NOT NULL REFERENCES shift_template (template_code),
  skill_id       TEXT NOT NULL REFERENCES skill (skill_id),
  day_type       TEXT NOT NULL CHECK (day_type IN ('WEEKDAY', 'WEEKEND', 'HOLIDAY')),
  -- "No requirement" is the absence of a row, so a stored minimum is always at least 1.
  min_headcount  INTEGER NOT NULL CHECK (min_headcount BETWEEN 1 AND 50),
  effective_from TEXT NOT NULL CHECK (effective_from IS date(effective_from)),
  effective_to   TEXT CHECK (effective_to IS date(effective_to)),
  UNIQUE (team_id, template_code, skill_id, day_type, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
) STRICT;

-- ---------------------------------------------------------------------------------------
-- Roster (published schedule) and its history
-- ---------------------------------------------------------------------------------------

CREATE TABLE shift_assignment (
  assignment_id            TEXT PRIMARY KEY
                           CHECK (assignment_id GLOB 'ASG-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  shift_id                 TEXT NOT NULL REFERENCES shift (shift_id),
  employee_id              TEXT NOT NULL REFERENCES employee (employee_id),
  team_id                  TEXT NOT NULL REFERENCES team (team_id),
  skill_id                 TEXT NOT NULL REFERENCES skill (skill_id),
  source                   TEXT NOT NULL CHECK (source IN ('ROSTER', 'REPLACEMENT', 'SWAP')),
  -- Deferred: swaps reference the assignments they move, and SWAP assignments reference the swap.
  swap_id                  TEXT REFERENCES swap_request (swap_id) DEFERRABLE INITIALLY DEFERRED,
  supersedes_assignment_id TEXT REFERENCES shift_assignment (assignment_id),
  created_at               TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??+05:30' AND substr(created_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19))),
  status                   TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'CANCELLED', 'SWAPPED_OUT')),
  CHECK ((source = 'SWAP') = (swap_id IS NOT NULL)),
  CHECK ((source = 'ROSTER') = (supersedes_assignment_id IS NULL)),
  CHECK (supersedes_assignment_id IS NULL OR supersedes_assignment_id <> assignment_id)
) STRICT;

CREATE TABLE shift_assignment_event (
  event_id          TEXT PRIMARY KEY CHECK (event_id = assignment_id || '-E' || printf('%02d', event_seq)),
  assignment_id     TEXT NOT NULL REFERENCES shift_assignment (assignment_id),
  event_seq         INTEGER NOT NULL CHECK (event_seq BETWEEN 1 AND 99),
  from_status       TEXT CHECK (from_status IN ('SCHEDULED', 'CANCELLED', 'SWAPPED_OUT')),
  to_status         TEXT NOT NULL CHECK (to_status IN ('SCHEDULED', 'CANCELLED', 'SWAPPED_OUT')),
  event_at          TEXT NOT NULL CHECK (event_at GLOB '????-??-??T??:??:??+05:30' AND substr(event_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(event_at, 1, 19))),
  actor_role        TEXT NOT NULL CHECK (actor_role IN ('EMPLOYEE', 'MANAGER', 'HR_PARTNER', 'OPS_PARTNER', 'SYSTEM')),
  actor_employee_id TEXT REFERENCES employee (employee_id),
  reason_code       TEXT NOT NULL CHECK (reason_code IN ('ROSTER_PUBLISHED', 'REPLACEMENT_FOR_LEAVE', 'LEAVE_APPROVED', 'SWAP_APPLIED')),
  leave_request_id  TEXT REFERENCES leave_request (leave_request_id),
  swap_id           TEXT REFERENCES swap_request (swap_id),
  UNIQUE (assignment_id, event_seq),
  CHECK ((event_seq = 1) = (from_status IS NULL)),
  CHECK ((actor_role = 'SYSTEM') = (actor_employee_id IS NULL))
) STRICT;

-- ---------------------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------------------

CREATE TABLE leave_request (
  leave_request_id       TEXT PRIMARY KEY
                         CHECK (leave_request_id GLOB 'LVE-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  employee_id            TEXT NOT NULL REFERENCES employee (employee_id),
  leave_type             TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'CASUAL', 'SICK', 'UNPAID')),
  start_date             TEXT NOT NULL CHECK (start_date IS date(start_date)),
  end_date               TEXT NOT NULL CHECK (end_date IS date(end_date)),
  requested_days         INTEGER NOT NULL CHECK (requested_days >= 1),
  submitted_at           TEXT NOT NULL CHECK (submitted_at GLOB '????-??-??T??:??:??+05:30' AND substr(submitted_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(submitted_at, 1, 19))),
  status                 TEXT NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')),
  decided_at             TEXT CHECK (decided_at GLOB '????-??-??T??:??:??+05:30' AND substr(decided_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(decided_at, 1, 19))),
  decided_by_role        TEXT CHECK (decided_by_role IN ('MANAGER', 'HR_PARTNER', 'SYSTEM')),
  decided_by_employee_id TEXT REFERENCES employee (employee_id),
  decision_rule_id       TEXT CHECK (decision_rule_id GLOB 'R-[A-Z][A-Z][A-Z]-[0-9][0-9]'),
  decision_reason_code   TEXT CHECK (decision_reason_code IN ('APPROVED_WITHIN_POLICY', 'SICK_AUTO_APPROVED', 'EMPLOYEE_NOT_ACTIVE', 'OVERLAPS_EXISTING_LEAVE', 'INSUFFICIENT_BALANCE', 'INSUFFICIENT_NOTICE', 'TEAM_LEAVE_CAP_REACHED', 'EMPLOYEE_WITHDREW', 'EMPLOYEE_CANCELLED')),
  CHECK (substr(leave_request_id, 5, 4) = substr(start_date, 1, 4)),
  CHECK (end_date >= start_date),
  CHECK (requested_days = julianday(end_date) - julianday(start_date) + 1),
  CHECK (decided_at IS NULL OR decided_at >= submitted_at),
  -- Decision columns describe the approve/reject decision and are set together.
  CHECK ((status IN ('SUBMITTED', 'WITHDRAWN')) = (decided_at IS NULL)),
  CHECK ((decided_at IS NULL) = (decided_by_role IS NULL)),
  CHECK ((decided_at IS NULL) = (decision_rule_id IS NULL)),
  CHECK ((decided_at IS NULL) = (decision_reason_code IS NULL)),
  CHECK ((decided_by_role = 'SYSTEM') = (decided_by_employee_id IS NULL AND decided_at IS NOT NULL))
) STRICT;

CREATE TABLE leave_request_event (
  event_id          TEXT PRIMARY KEY CHECK (event_id = leave_request_id || '-E' || printf('%02d', event_seq)),
  leave_request_id  TEXT NOT NULL REFERENCES leave_request (leave_request_id),
  event_seq         INTEGER NOT NULL CHECK (event_seq BETWEEN 1 AND 99),
  from_status       TEXT CHECK (from_status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')),
  to_status         TEXT NOT NULL CHECK (to_status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')),
  event_at          TEXT NOT NULL CHECK (event_at GLOB '????-??-??T??:??:??+05:30' AND substr(event_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(event_at, 1, 19))),
  actor_role        TEXT NOT NULL CHECK (actor_role IN ('EMPLOYEE', 'MANAGER', 'HR_PARTNER', 'OPS_PARTNER', 'SYSTEM')),
  actor_employee_id TEXT REFERENCES employee (employee_id),
  rule_id           TEXT CHECK (rule_id GLOB 'R-[A-Z][A-Z][A-Z]-[0-9][0-9]'),
  reason_code       TEXT CHECK (reason_code IN ('APPROVED_WITHIN_POLICY', 'SICK_AUTO_APPROVED', 'EMPLOYEE_NOT_ACTIVE', 'OVERLAPS_EXISTING_LEAVE', 'INSUFFICIENT_BALANCE', 'INSUFFICIENT_NOTICE', 'TEAM_LEAVE_CAP_REACHED', 'EMPLOYEE_WITHDREW', 'EMPLOYEE_CANCELLED')),
  UNIQUE (leave_request_id, event_seq),
  CHECK ((event_seq = 1) = (from_status IS NULL)),
  CHECK ((actor_role = 'SYSTEM') = (actor_employee_id IS NULL))
) STRICT;

-- ---------------------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------------------

CREATE TABLE attendance_event (
  attendance_event_id TEXT PRIMARY KEY
                      CHECK (attendance_event_id = 'ATT-' || employee_id || '-' || strftime('%Y%m%dT%H%M%S', substr(event_at, 1, 19))),
  employee_id         TEXT NOT NULL REFERENCES employee (employee_id),
  assignment_id       TEXT NOT NULL REFERENCES shift_assignment (assignment_id),
  event_type          TEXT NOT NULL CHECK (event_type IN ('CLOCK_IN', 'CLOCK_OUT', 'NO_SHOW')),
  event_at            TEXT NOT NULL CHECK (event_at GLOB '????-??-??T??:??:??+05:30' AND substr(event_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(event_at, 1, 19))),
  source              TEXT NOT NULL CHECK (source IN ('BADGE', 'MOBILE', 'MANUAL', 'SYSTEM')),
  recorded_at         TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??+05:30' AND substr(recorded_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(recorded_at, 1, 19))),
  -- The ops partner who entered a MANUAL correction (R-ATT-04).
  recorded_by_employee_id TEXT REFERENCES employee (employee_id),
  CHECK (recorded_at >= event_at),
  CHECK ((event_type = 'NO_SHOW') = (source = 'SYSTEM')),
  CHECK ((source = 'MANUAL') = (recorded_by_employee_id IS NOT NULL))
) STRICT;

-- ---------------------------------------------------------------------------------------
-- Swaps
-- ---------------------------------------------------------------------------------------

CREATE TABLE swap_request (
  swap_id                   TEXT PRIMARY KEY
                            CHECK (swap_id GLOB 'SWP-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  swap_type                 TEXT NOT NULL CHECK (swap_type IN ('SWAP', 'COVER')),
  team_id                   TEXT NOT NULL REFERENCES team (team_id),
  requester_employee_id     TEXT NOT NULL REFERENCES employee (employee_id),
  requester_assignment_id   TEXT NOT NULL REFERENCES shift_assignment (assignment_id),
  counterpart_employee_id   TEXT NOT NULL REFERENCES employee (employee_id),
  counterpart_assignment_id TEXT REFERENCES shift_assignment (assignment_id),
  requested_at              TEXT NOT NULL CHECK (requested_at GLOB '????-??-??T??:??:??+05:30' AND substr(requested_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(requested_at, 1, 19))),
  status                    TEXT NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED', 'EXPIRED')),
  decided_at                TEXT CHECK (decided_at GLOB '????-??-??T??:??:??+05:30' AND substr(decided_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(decided_at, 1, 19))),
  decided_by_role           TEXT CHECK (decided_by_role IN ('MANAGER', 'HR_PARTNER', 'SYSTEM')),
  decided_by_employee_id    TEXT REFERENCES employee (employee_id),
  decision_rule_id          TEXT CHECK (decision_rule_id GLOB 'R-[A-Z][A-Z][A-Z]-[0-9][0-9]'),
  decision_reason_code      TEXT CHECK (decision_reason_code IN ('APPROVED_WITHIN_POLICY', 'ASSIGNMENT_CHANGED', 'NOT_SAME_TEAM', 'SKILL_NOT_HELD', 'DOUBLE_BOOKING', 'ON_APPROVED_LEAVE', 'EMPLOYEE_NOT_ACTIVE', 'REST_RULE_BREACH', 'CONSECUTIVE_DAYS_BREACH', 'WEEKLY_HOURS_BREACH', 'INSUFFICIENT_NOTICE', 'NO_DECISION_BEFORE_DEADLINE', 'REQUESTER_CANCELLED', 'SWAP_APPLIED')),
  applied_at                TEXT CHECK (applied_at GLOB '????-??-??T??:??:??+05:30' AND substr(applied_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(applied_at, 1, 19))),
  CHECK (substr(swap_id, 5, 4) = substr(requested_at, 1, 4)),
  CHECK (requester_employee_id <> counterpart_employee_id),
  CHECK ((swap_type = 'SWAP') = (counterpart_assignment_id IS NOT NULL)),
  CHECK (decided_at IS NULL OR decided_at >= requested_at),
  CHECK (applied_at IS NULL OR applied_at >= requested_at),
  CHECK ((status = 'APPLIED') = (applied_at IS NOT NULL)),
  -- APPLIED is deliberately unconstrained here: "applied without approval" must be loadable
  -- so the validator can detect it (R-SWP-06).
  CHECK (status NOT IN ('REQUESTED', 'CANCELLED') OR decided_at IS NULL),
  CHECK (status NOT IN ('APPROVED', 'REJECTED', 'EXPIRED') OR decided_at IS NOT NULL),
  CHECK ((decided_at IS NULL) = (decided_by_role IS NULL)),
  CHECK ((decided_at IS NULL) = (decision_rule_id IS NULL)),
  CHECK ((decided_at IS NULL) = (decision_reason_code IS NULL)),
  CHECK ((decided_by_role = 'SYSTEM') = (decided_by_employee_id IS NULL AND decided_at IS NOT NULL))
) STRICT;

CREATE TABLE swap_request_event (
  event_id          TEXT PRIMARY KEY CHECK (event_id = swap_id || '-E' || printf('%02d', event_seq)),
  swap_id           TEXT NOT NULL REFERENCES swap_request (swap_id),
  event_seq         INTEGER NOT NULL CHECK (event_seq BETWEEN 1 AND 99),
  from_status       TEXT CHECK (from_status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED', 'EXPIRED')),
  to_status         TEXT NOT NULL CHECK (to_status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED', 'EXPIRED')),
  event_at          TEXT NOT NULL CHECK (event_at GLOB '????-??-??T??:??:??+05:30' AND substr(event_at, 1, 19) IS strftime('%Y-%m-%dT%H:%M:%S', substr(event_at, 1, 19))),
  actor_role        TEXT NOT NULL CHECK (actor_role IN ('EMPLOYEE', 'MANAGER', 'HR_PARTNER', 'OPS_PARTNER', 'SYSTEM')),
  actor_employee_id TEXT REFERENCES employee (employee_id),
  rule_id           TEXT CHECK (rule_id GLOB 'R-[A-Z][A-Z][A-Z]-[0-9][0-9]'),
  reason_code       TEXT CHECK (reason_code IN ('APPROVED_WITHIN_POLICY', 'ASSIGNMENT_CHANGED', 'NOT_SAME_TEAM', 'SKILL_NOT_HELD', 'DOUBLE_BOOKING', 'ON_APPROVED_LEAVE', 'EMPLOYEE_NOT_ACTIVE', 'REST_RULE_BREACH', 'CONSECUTIVE_DAYS_BREACH', 'WEEKLY_HOURS_BREACH', 'INSUFFICIENT_NOTICE', 'NO_DECISION_BEFORE_DEADLINE', 'REQUESTER_CANCELLED', 'SWAP_APPLIED')),
  UNIQUE (swap_id, event_seq),
  CHECK ((event_seq = 1) = (from_status IS NULL)),
  CHECK ((actor_role = 'SYSTEM') = (actor_employee_id IS NULL))
) STRICT;

-- ---------------------------------------------------------------------------------------
-- Derived outputs (Phase 4). Always recomputed from the tables above, never generated.
-- ---------------------------------------------------------------------------------------

CREATE TABLE employee_week_summary (
  employee_id              TEXT NOT NULL REFERENCES employee (employee_id),
  iso_week                 TEXT NOT NULL CHECK (iso_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  days_in_window           INTEGER NOT NULL CHECK (days_in_window BETWEEN 1 AND 7),
  contracted_hours         REAL NOT NULL CHECK (contracted_hours >= 0),
  scheduled_hours          REAL NOT NULL CHECK (scheduled_hours >= 0),
  worked_hours             REAL NOT NULL CHECK (worked_hours >= 0),
  overtime_hours           REAL NOT NULL CHECK (overtime_hours >= 0),
  overtime_cap_hours       REAL NOT NULL CHECK (overtime_cap_hours >= 0),
  is_overtime_cap_exceeded INTEGER NOT NULL CHECK (is_overtime_cap_exceeded IN (0, 1)),
  PRIMARY KEY (employee_id, iso_week),
  CHECK (is_overtime_cap_exceeded = (overtime_hours > overtime_cap_hours))
) STRICT;

CREATE TABLE coverage_status (
  shift_id                TEXT NOT NULL REFERENCES shift (shift_id),
  team_id                 TEXT NOT NULL REFERENCES team (team_id),
  skill_id                TEXT NOT NULL REFERENCES skill (skill_id),
  coverage_id             TEXT REFERENCES coverage_requirement (coverage_id),
  required_headcount      INTEGER NOT NULL CHECK (required_headcount >= 0),
  assigned_headcount      INTEGER NOT NULL CHECK (assigned_headcount >= 0),
  qualified_headcount     INTEGER NOT NULL CHECK (qualified_headcount >= 0),
  attended_headcount      INTEGER NOT NULL CHECK (attended_headcount >= 0),
  gap_headcount           INTEGER NOT NULL CHECK (gap_headcount = max(0, required_headcount - qualified_headcount)),
  attended_gap_headcount  INTEGER NOT NULL CHECK (attended_gap_headcount = max(0, required_headcount - attended_headcount)),
  status                  TEXT NOT NULL CHECK (status IN ('MET', 'GAP')),
  PRIMARY KEY (shift_id, team_id, skill_id),
  CHECK (qualified_headcount <= assigned_headcount),
  CHECK ((coverage_id IS NULL) = (required_headcount = 0)),
  CHECK ((status = 'GAP') = (gap_headcount > 0))
) STRICT;

CREATE TABLE leave_balance (
  employee_id    TEXT NOT NULL REFERENCES employee (employee_id),
  leave_type     TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'CASUAL', 'SICK')),
  entitled_days  INTEGER NOT NULL CHECK (entitled_days >= 0),
  approved_days  INTEGER NOT NULL CHECK (approved_days >= 0),
  remaining_days INTEGER NOT NULL CHECK (remaining_days = entitled_days - approved_days),
  PRIMARY KEY (employee_id, leave_type)
) STRICT;

CREATE TABLE attendance_reconciliation (
  assignment_id       TEXT PRIMARY KEY REFERENCES shift_assignment (assignment_id),
  employee_id         TEXT NOT NULL REFERENCES employee (employee_id),
  shift_id            TEXT NOT NULL REFERENCES shift (shift_id),
  scheduled_minutes   INTEGER NOT NULL CHECK (scheduled_minutes > 0),
  clock_in_at         TEXT CHECK (clock_in_at GLOB '????-??-??T??:??:??+05:30'),
  clock_out_at        TEXT CHECK (clock_out_at GLOB '????-??-??T??:??:??+05:30'),
  worked_minutes      INTEGER CHECK (worked_minutes >= 0),
  late_minutes        INTEGER CHECK (late_minutes >= 0),
  early_leave_minutes INTEGER CHECK (early_leave_minutes >= 0),
  extension_minutes   INTEGER CHECK (extension_minutes >= 0),
  outcome             TEXT NOT NULL CHECK (outcome IN ('PRESENT', 'NO_SHOW', 'MISSING_PUNCH', 'NO_RECORD')),
  CHECK (clock_out_at IS NULL OR clock_in_at IS NULL OR clock_out_at > clock_in_at),
  CHECK ((outcome = 'PRESENT') = (clock_in_at IS NOT NULL AND clock_out_at IS NOT NULL)),
  CHECK (outcome <> 'MISSING_PUNCH' OR (clock_in_at IS NOT NULL AND clock_out_at IS NULL)),
  CHECK (outcome NOT IN ('NO_SHOW', 'NO_RECORD') OR (clock_in_at IS NULL AND clock_out_at IS NULL)),
  CHECK ((worked_minutes IS NOT NULL) = (outcome = 'PRESENT'))
) STRICT;

-- ---------------------------------------------------------------------------------------
-- Join indexes (FK columns used by the validator, derivations and API)
-- ---------------------------------------------------------------------------------------

CREATE INDEX idx_employee_team ON employee (team_id);
CREATE INDEX idx_team_hr_partner ON team (hr_partner_employee_id);
CREATE INDEX idx_employee_skill_skill ON employee_skill (skill_id);
CREATE INDEX idx_coverage_lookup ON coverage_requirement (team_id, template_code, day_type);
CREATE INDEX idx_shift_week ON shift (iso_week);
CREATE INDEX idx_assignment_employee ON shift_assignment (employee_id);
CREATE INDEX idx_assignment_shift_team ON shift_assignment (shift_id, team_id);
CREATE INDEX idx_assignment_swap ON shift_assignment (swap_id);
CREATE INDEX idx_assignment_supersedes ON shift_assignment (supersedes_assignment_id);
CREATE INDEX idx_assignment_event_parent ON shift_assignment_event (assignment_id);
CREATE INDEX idx_leave_employee ON leave_request (employee_id, start_date);
CREATE INDEX idx_leave_event_parent ON leave_request_event (leave_request_id);
CREATE INDEX idx_attendance_assignment ON attendance_event (assignment_id);
CREATE INDEX idx_swap_team ON swap_request (team_id);
CREATE INDEX idx_swap_event_parent ON swap_request_event (swap_id);
