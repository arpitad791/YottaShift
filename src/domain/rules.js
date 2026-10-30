// Business-rule catalogue. IDs are cited on every generated decision (decision_rule_id,
// ground-truth rule_id) and each one is specified in docs/business-rules.md; a test keeps
// the two lists identical. Labour limits per employment type live in the labor_policy table.

export const RULES = Object.freeze({
  'R-GEN-01': 'State changes are appended as events; history is never overwritten',
  'R-GEN-02': 'IDs are deterministic, zero-padded, immutable and never reused',
  'R-GEN-03': 'Schema enforces structure; business rules are checked by the validator',

  'R-COV-01': 'Required headcount per team, template, skill and day type on a date',
  'R-COV-02': 'A team only staffs the templates of its operating pattern',
  'R-COV-03': 'Day type precedence: HOLIDAY over WEEKEND over WEEKDAY',
  'R-COV-04': 'Unfilled demand is reported as a coverage gap, never filled unqualified',

  'R-SCH-01': 'At most one active assignment per employee per shift date, no overlap',
  'R-SCH-02': 'No assignment on a date covered by approved leave',
  'R-SCH-03': 'Assigned skill must be held and valid on the shift date',
  'R-SCH-04': 'Employee must be employed on the shift date and not a manager',
  'R-SCH-05': 'Assignment team equals employee team; template within team pattern',
  'R-SCH-06': 'Minimum rest between consecutive assignments',
  'R-SCH-07': 'Maximum consecutive working days',
  'R-SCH-08': 'Weekly scheduled-hours limit',
  'R-SCH-09': 'Fair, deterministic candidate ordering',
  'R-SCH-10': 'Roster built and published one ISO week at a time',

  'R-LVE-01': 'Requests decided in submission order; employee must be employed',
  'R-LVE-02': 'No overlap with the employee’s own open or approved leave',
  'R-LVE-03': 'Sufficient balance for entitled leave types',
  'R-LVE-04': 'Sick leave auto-approved by the system',
  'R-LVE-05': 'Minimum notice per leave type',
  'R-LVE-06': 'Team concurrent-leave cap',
  'R-LVE-07': 'Approval and approver (manager or HR partner)',
  'R-LVE-08': 'Decision timing',
  'R-LVE-09': 'Leave approved after publication cancels and backfills assignments',
  'R-LVE-10': 'Employee withdrawal and cancellation',

  'R-SWP-01': 'Both employees and assignments belong to the same team',
  'R-SWP-02': 'Each employee holds the skill of the shift they take over',
  'R-SWP-03': 'Scheduling rules still hold for both employees after the swap',
  'R-SWP-04': 'Minimum notice before the earliest affected shift',
  'R-SWP-05': 'Manager decision, or system expiry at the deadline',
  'R-SWP-06': 'Only approved swaps are applied',
  'R-SWP-07': 'Requester may cancel while the request is open',
  'R-SWP-08': 'Swap history is preserved end to end',

  'R-ATT-01': 'Every due assignment has a complete punch pair or a no-show',
  'R-ATT-02': 'Punch classification: late, early leave, extension',
  'R-ATT-03': 'Worked time counts from the later of clock-in and shift start',
  'R-ATT-04': 'Missing clock-out is corrected manually by the ops partner',
  'R-ATT-05': 'No-show recorded by the system at shift end',

  'R-OVT-01': 'Weekly overtime from worked hours against prorated contracted hours',
  'R-OVT-02': 'Weekly overtime must not exceed the cap',
});

// Thresholds that are policy rather than per-employee data. Changing one changes outcomes,
// so the generator writes them into the manifest for traceability.
export const POLICY = Object.freeze({
  attendance: Object.freeze({
    lateGraceMinutes: 5,
    earlyLeaveGraceMinutes: 5,
    extensionThresholdMinutes: 15,
    earliestClockInMinutes: 60,
  }),
  leave: Object.freeze({
    noticeDays: Object.freeze({ ANNUAL: 7, CASUAL: 1, UNPAID: 14 }),
    teamLeaveCapRatio: 0.15,
    hrApprovalAboveDays: 5,
    maxDecisionDelayHours: 48,
  }),
  swap: Object.freeze({
    minNoticeHours: 24,
    decisionDeadlineHours: 48,
    applyWithinMinutes: 10,
  }),
  roster: Object.freeze({
    publishLeadDays: 7,
    publishTime: '18:00',
  }),
});
