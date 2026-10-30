// Enumerations and ID formats shared by the schema, generator and validator.
// Every enum used in a CHECK (... IN (...)) list of sql/schema.sql must match exactly;
// test/schema.test.js enforces that parity through COLUMN_ENUMS.

const freeze = (values) => Object.freeze([...values]);

export const ENUMS = Object.freeze({
  TEAM_FUNCTION: freeze([
    'CUSTOMER_SUPPORT',
    'WAREHOUSE',
    'FIELD_SERVICE',
    'SECURITY',
    'IT_NOC',
    'FACILITIES',
    // Non-operational team holding the HR and operations partners; it has no coverage.
    'WORKFORCE_OFFICE',
  ]),
  SITE_CODE: freeze(['BLR', 'HYD', 'PUN', 'CHN']),
  OPERATING_PATTERN: freeze(['TWENTY_FOUR_SEVEN', 'EXTENDED_HOURS', 'BUSINESS_HOURS']),
  SKILL_CATEGORY: freeze(['TECHNICAL', 'SAFETY', 'LANGUAGE', 'OPERATIONAL', 'LEADERSHIP']),
  EMPLOYMENT_TYPE: freeze(['FULL_TIME', 'PART_TIME']),
  EMPLOYEE_ROLE: freeze(['MEMBER', 'LEAD', 'MANAGER', 'HR_PARTNER', 'OPS_PARTNER']),
  // Only these roles fill coverage (R-SCH-04).
  SCHEDULABLE_ROLE: freeze(['MEMBER', 'LEAD']),
  EMPLOYMENT_STATUS: freeze(['ACTIVE', 'TERMINATED']),
  PROFICIENCY: freeze(['BASIC', 'INTERMEDIATE', 'EXPERT']),
  TEMPLATE_CODE: freeze(['A', 'B', 'C', 'G']),
  DAY_TYPE: freeze(['WEEKDAY', 'WEEKEND', 'HOLIDAY']),
  HOLIDAY_TYPE: freeze(['PUBLIC', 'COMPANY']),

  LEAVE_TYPE: freeze(['ANNUAL', 'CASUAL', 'SICK', 'UNPAID']),
  // UNPAID leave has no balance, so it never gets an entitlement row.
  ENTITLED_LEAVE_TYPE: freeze(['ANNUAL', 'CASUAL', 'SICK']),
  LEAVE_STATUS: freeze(['SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED']),
  LEAVE_REASON_CODE: freeze([
    'APPROVED_WITHIN_POLICY',
    'SICK_AUTO_APPROVED',
    'EMPLOYEE_NOT_ACTIVE',
    'OVERLAPS_EXISTING_LEAVE',
    'INSUFFICIENT_BALANCE',
    'INSUFFICIENT_NOTICE',
    'TEAM_LEAVE_CAP_REACHED',
    'EMPLOYEE_WITHDREW',
    'EMPLOYEE_CANCELLED',
  ]),

  ASSIGNMENT_STATUS: freeze(['SCHEDULED', 'CANCELLED', 'SWAPPED_OUT']),
  ASSIGNMENT_SOURCE: freeze(['ROSTER', 'REPLACEMENT', 'SWAP']),
  ASSIGNMENT_REASON_CODE: freeze([
    'ROSTER_PUBLISHED',
    'REPLACEMENT_FOR_LEAVE',
    'LEAVE_APPROVED',
    'SWAP_APPLIED',
  ]),

  SWAP_TYPE: freeze(['SWAP', 'COVER']),
  SWAP_STATUS: freeze(['REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED', 'EXPIRED']),
  SWAP_REASON_CODE: freeze([
    'APPROVED_WITHIN_POLICY',
    // One of the swap's assignments was cancelled or moved before the manager decided.
    'ASSIGNMENT_CHANGED',
    'NOT_SAME_TEAM',
    'SKILL_NOT_HELD',
    'DOUBLE_BOOKING',
    'ON_APPROVED_LEAVE',
    'EMPLOYEE_NOT_ACTIVE',
    'REST_RULE_BREACH',
    'CONSECUTIVE_DAYS_BREACH',
    'WEEKLY_HOURS_BREACH',
    'INSUFFICIENT_NOTICE',
    'NO_DECISION_BEFORE_DEADLINE',
    'REQUESTER_CANCELLED',
    'SWAP_APPLIED',
  ]),

  ACTOR_ROLE: freeze(['EMPLOYEE', 'MANAGER', 'HR_PARTNER', 'OPS_PARTNER', 'SYSTEM']),
  DECISION_ROLE: freeze(['MANAGER', 'HR_PARTNER', 'SYSTEM']),

  ATTENDANCE_EVENT_TYPE: freeze(['CLOCK_IN', 'CLOCK_OUT', 'NO_SHOW']),
  ATTENDANCE_SOURCE: freeze(['BADGE', 'MOBILE', 'MANUAL', 'SYSTEM']),
  ATTENDANCE_OUTCOME: freeze(['PRESENT', 'NO_SHOW', 'MISSING_PUNCH', 'NO_RECORD']),

  COVERAGE_STATUS: freeze(['MET', 'GAP']),

  // Ground-truth labels (Phase 5). Never stored in input tables.
  LABEL_CLASS: freeze(['ANOMALY', 'BOUNDARY']),
  ISSUE_TYPE: freeze([
    'DOUBLE_BOOKED',
    'LEAVE_OVERLAP',
    'SKILL_ABSENT',
    'OVERTIME_CAP_EXCEEDED',
    'SWAP_WITHOUT_APPROVAL',
    'BOUNDARY_OVERTIME_AT_CAP',
    'BOUNDARY_REST_AT_MINIMUM',
    'BOUNDARY_LEAVE_ADJACENT_SHIFT',
    'BOUNDARY_CONSECUTIVE_DAYS_AT_MAX',
    'BOUNDARY_SWAP_AT_NOTICE_LIMIT',
  ]),
});

// table.column → enum name, for every CHECK IN list in sql/schema.sql.
export const COLUMN_ENUMS = Object.freeze({
  'labor_policy.employment_type': 'EMPLOYMENT_TYPE',
  'team.team_function': 'TEAM_FUNCTION',
  'team.site_code': 'SITE_CODE',
  'team.operating_pattern': 'OPERATING_PATTERN',
  'skill.skill_category': 'SKILL_CATEGORY',
  'employee.employee_role': 'EMPLOYEE_ROLE',
  'employee.employment_type': 'EMPLOYMENT_TYPE',
  'employee.employment_status': 'EMPLOYMENT_STATUS',
  'employee_skill.proficiency': 'PROFICIENCY',
  'leave_entitlement.leave_type': 'ENTITLED_LEAVE_TYPE',
  'shift_template.template_code': 'TEMPLATE_CODE',
  'holiday_calendar.holiday_type': 'HOLIDAY_TYPE',
  'shift.day_type': 'DAY_TYPE',
  'coverage_requirement.day_type': 'DAY_TYPE',
  'shift_assignment.source': 'ASSIGNMENT_SOURCE',
  'shift_assignment.status': 'ASSIGNMENT_STATUS',
  'shift_assignment_event.from_status': 'ASSIGNMENT_STATUS',
  'shift_assignment_event.to_status': 'ASSIGNMENT_STATUS',
  'shift_assignment_event.actor_role': 'ACTOR_ROLE',
  'shift_assignment_event.reason_code': 'ASSIGNMENT_REASON_CODE',
  'leave_request.leave_type': 'LEAVE_TYPE',
  'leave_request.status': 'LEAVE_STATUS',
  'leave_request.decided_by_role': 'DECISION_ROLE',
  'leave_request.decision_reason_code': 'LEAVE_REASON_CODE',
  'leave_request_event.from_status': 'LEAVE_STATUS',
  'leave_request_event.to_status': 'LEAVE_STATUS',
  'leave_request_event.actor_role': 'ACTOR_ROLE',
  'leave_request_event.reason_code': 'LEAVE_REASON_CODE',
  'attendance_event.event_type': 'ATTENDANCE_EVENT_TYPE',
  'attendance_event.source': 'ATTENDANCE_SOURCE',
  'swap_request.swap_type': 'SWAP_TYPE',
  'swap_request.status': 'SWAP_STATUS',
  'swap_request.decided_by_role': 'DECISION_ROLE',
  'swap_request.decision_reason_code': 'SWAP_REASON_CODE',
  'swap_request_event.from_status': 'SWAP_STATUS',
  'swap_request_event.to_status': 'SWAP_STATUS',
  'swap_request_event.actor_role': 'ACTOR_ROLE',
  'swap_request_event.reason_code': 'SWAP_REASON_CODE',
  'coverage_status.status': 'COVERAGE_STATUS',
  'leave_balance.leave_type': 'ENTITLED_LEAVE_TYPE',
  'attendance_reconciliation.outcome': 'ATTENDANCE_OUTCOME',
});

// Allowed lifecycle transitions; null is the initial (creation) state.
export const TRANSITIONS = Object.freeze({
  LEAVE_STATUS: Object.freeze({
    null: freeze(['SUBMITTED']),
    SUBMITTED: freeze(['APPROVED', 'REJECTED', 'WITHDRAWN']),
    APPROVED: freeze(['CANCELLED']),
    REJECTED: freeze([]),
    WITHDRAWN: freeze([]),
    CANCELLED: freeze([]),
  }),
  SWAP_STATUS: Object.freeze({
    null: freeze(['REQUESTED']),
    REQUESTED: freeze(['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']),
    APPROVED: freeze(['APPLIED']),
    REJECTED: freeze([]),
    APPLIED: freeze([]),
    CANCELLED: freeze([]),
    EXPIRED: freeze([]),
  }),
  ASSIGNMENT_STATUS: Object.freeze({
    null: freeze(['SCHEDULED']),
    SCHEDULED: freeze(['CANCELLED', 'SWAPPED_OUT']),
    CANCELLED: freeze([]),
    SWAPPED_OUT: freeze([]),
  }),
});

// Brief-mandated formats first, then the ones this project defines (docs/data-dictionary.md §2).
export const ID_PATTERNS = Object.freeze({
  employee: /^EMP-\d{6}$/,
  shift: /^SHIFT-\d{4}-\d{2}-\d{2}-[ABCG]$/,
  leaveRequest: /^LVE-\d{4}-\d{6}$/,
  attendanceEvent: /^ATT-EMP-\d{6}-\d{8}T\d{6}$/,
  swapRequest: /^SWP-\d{4}-\d{6}$/,
  team: /^TEAM-\d{3}$/,
  skill: /^SKL-\d{3}$/,
  laborPolicy: /^POL-(FT|PT)-\d{4}$/,
  holiday: /^HOL-\d{4}-\d{2}-\d{2}$/,
  coverageRequirement: /^COV-\d{6}$/,
  assignment: /^ASG-\d{4}-\d{6}$/,
  lifecycleEvent: /^(ASG|LVE|SWP)-\d{4}-\d{6}-E\d{2}$/,
  groundTruth: /^GT-\d{6}$/,
});

// The schema hard-codes this offset in its timestamp CHECKs; all sites share one time zone.
export const TIMEZONE = Object.freeze({ name: 'Asia/Kolkata', offset: '+05:30' });
