import { ENUMS } from '../domain/constants.js';
import { POLICY } from '../domain/rules.js';
import { minutesBetween } from '../lib/dates.js';
import { round2 } from './derived-tables.js';

const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);
const rate = (part, whole) => (whole === 0 ? null : Math.round((part / whole) * 10000) / 10000);
const countBy = (rows, key) => {
  const counts = {};
  for (const row of rows) {
    const value = typeof key === 'function' ? key(row) : row[key];
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
};
const sum = (values) => values.reduce((a, b) => a + b, 0);

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Jain's fairness index (Σx)² / (n·Σx²): 1 = perfectly even; 1 when everyone has zero. */
export function jainIndex(values) {
  const squares = sum(values.map((v) => v * v));
  if (values.length === 0) return null;
  return squares === 0
    ? 1
    : Math.round((sum(values) ** 2 / (values.length * squares)) * 10000) / 10000;
}

function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const mean = sum(values) / values.length;
  if (mean === 0) return null;
  const variance = sum(values.map((v) => (v - mean) ** 2)) / values.length;
  return Math.round((Math.sqrt(variance) / mean) * 10000) / 10000;
}

export function computeMetrics(tables, { patterns, window }) {
  const shifts = new Map(tables.shift.map((s) => [s.shift_id, s]));
  const teams = new Map(tables.team.map((t) => [t.team_id, t]));
  const shiftHours = (shiftId) => {
    const s = shifts.get(shiftId);
    return minutesBetween(s.start_at, s.end_at) / 60;
  };

  const coverage = tables.coverage_status.filter((c) => c.required_headcount > 0);
  const required = sum(coverage.map((c) => c.required_headcount));
  const filled = sum(coverage.map((c) => Math.min(c.required_headcount, c.qualified_headcount)));
  const attended = sum(coverage.map((c) => Math.min(c.required_headcount, c.attended_headcount)));
  const gaps = coverage.filter((c) => c.status === 'GAP');
  const gapGroup = (keyOf) => {
    const groups = Map.groupBy(gaps, keyOf);
    return Object.fromEntries(
      [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, rows]) => [
          key,
          {
            gap_slots: rows.length,
            gap_headcount: sum(rows.map((r) => r.gap_headcount)),
            gap_headcount_hours: round2(
              sum(rows.map((r) => r.gap_headcount * shiftHours(r.shift_id))),
            ),
          },
        ]),
    );
  };
  const byTeam = gapGroup((r) => r.team_id);
  const worstTeams = Object.entries(byTeam)
    .sort(([a, x], [b, y]) => y.gap_headcount_hours - x.gap_headcount_hours || a.localeCompare(b))
    .slice(0, 5)
    .map(([teamId, values]) => ({
      team_id: teamId,
      team_name: teams.get(teamId).team_name,
      ...values,
    }));

  const weeks = tables.employee_week_summary;
  const overtimeWeeks = weeks.filter((w) => w.overtime_hours > 0);
  const overtimeValues = overtimeWeeks.map((w) => w.overtime_hours);

  const leave = tables.leave_request;
  const decidedLeave = leave.filter((l) => l.decided_at !== null);
  const approvedEver = (l) => l.status === 'APPROVED' || l.status === 'CANCELLED';
  const leaveApproval = Object.fromEntries(
    ENUMS.LEAVE_TYPE.map((type) => {
      const decided = decidedLeave.filter((l) => l.leave_type === type);
      return [type, rate(decided.filter(approvedEver).length, decided.length)];
    }),
  );

  const swaps = tables.swap_request;
  const managerDecided = swaps.filter((s) => s.decided_by_role === 'MANAGER');
  const approvedSwaps = managerDecided.filter(
    (s) => s.decision_reason_code === 'APPROVED_WITHIN_POLICY',
  );
  const responseHours = managerDecided.map(
    (s) => minutesBetween(s.requested_at, s.decided_at) / 60,
  );

  const due = tables.attendance_reconciliation;
  const outcomes = countBy(due, 'outcome');
  const clockedIn = due.filter((r) => r.clock_in_at !== null);
  const present = due.filter((r) => r.outcome === 'PRESENT');
  const { lateGraceMinutes, earlyLeaveGraceMinutes, extensionThresholdMinutes } = POLICY.attendance;
  const clockOuts = tables.attendance_event.filter((e) => e.event_type === 'CLOCK_OUT');
  const scheduledHours = sum(due.map((r) => r.scheduled_minutes)) / 60;
  const workedHours = sum(present.map((r) => r.worked_minutes)) / 60;
  const teamOfAssignment = new Map(
    tables.shift_assignment.map((a) => [a.assignment_id, a.team_id]),
  );
  const reconciliationByPattern = Object.fromEntries(
    [
      ...Map.groupBy(
        present,
        (r) => teams.get(teamOfAssignment.get(r.assignment_id)).operating_pattern,
      ),
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pattern, rows]) => [
        pattern,
        {
          present_assignments: rows.length,
          scheduled_hours: round2(sum(rows.map((r) => r.scheduled_minutes)) / 60),
          worked_hours: round2(sum(rows.map((r) => r.worked_minutes)) / 60),
          worked_vs_scheduled: rate(
            sum(rows.map((r) => r.worked_minutes)),
            sum(rows.map((r) => r.scheduled_minutes)),
          ),
        },
      ]),
  );

  // Fairness only among members employed for the whole window, compared within each team.
  const fullWindow = tables.employee.filter(
    (e) =>
      SCHEDULABLE.has(e.employee_role) &&
      e.hire_date <= window.startDate &&
      e.termination_date === null,
  );
  const contracted = new Map();
  for (const w of weeks)
    contracted.set(w.employee_id, (contracted.get(w.employee_id) ?? 0) + w.contracted_hours);
  const load = new Map(
    fullWindow.map((e) => [e.employee_id, { nights: 0, weekends: 0, holidays: 0, hours: 0 }]),
  );
  for (const a of tables.shift_assignment) {
    const entry = load.get(a.employee_id);
    if (!entry || a.status !== 'SCHEDULED') continue;
    const s = shifts.get(a.shift_id);
    if (s.template_code === 'C') entry.nights += 1;
    if (s.day_type === 'WEEKEND') entry.weekends += 1;
    if (s.day_type === 'HOLIDAY') entry.holidays += 1;
    entry.hours += shiftHours(a.shift_id);
  }
  const fairnessTeams = [...Map.groupBy(fullWindow, (e) => e.team_id)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([teamId, members]) => {
      const pattern = patterns[teams.get(teamId).operating_pattern];
      const values = members.map((m) => load.get(m.employee_id));
      return {
        team_id: teamId,
        operating_pattern: teams.get(teamId).operating_pattern,
        members: members.length,
        jain_nights: pattern.templates.includes('C')
          ? jainIndex(values.map((v) => v.nights))
          : null,
        jain_weekends: pattern.staffsWeekends ? jainIndex(values.map((v) => v.weekends)) : null,
        jain_holidays: pattern.staffsHolidays ? jainIndex(values.map((v) => v.holidays)) : null,
        jain_hours_per_contract: jainIndex(
          members.map((m) => load.get(m.employee_id).hours / contracted.get(m.employee_id)),
        ),
        cv_hours_per_contract: coefficientOfVariation(
          members.map((m) => load.get(m.employee_id).hours / contracted.get(m.employee_id)),
        ),
      };
    });
  const summarise = (key) => {
    const values = fairnessTeams.map((t) => t[key]).filter((v) => v !== null);
    return values.length === 0
      ? null
      : {
          teams: values.length,
          mean: Math.round((sum(values) / values.length) * 10000) / 10000,
          min: Math.min(...values),
          max: Math.max(...values),
        };
  };

  return {
    M01_coverage_fill: {
      requirement_slots: coverage.length,
      required_headcount: required,
      filled_headcount: filled,
      fill_rate: rate(filled, required),
      attended_headcount: attended,
      attended_fill_rate: rate(attended, required),
    },
    M02_gaps: {
      gap_slots: gaps.length,
      gap_headcount: sum(gaps.map((g) => g.gap_headcount)),
      gap_headcount_hours: round2(sum(gaps.map((g) => g.gap_headcount * shiftHours(g.shift_id)))),
      attended_gap_headcount: sum(coverage.map((c) => c.attended_gap_headcount)),
      by_template: gapGroup((r) => shifts.get(r.shift_id).template_code),
      by_day_type: gapGroup((r) => shifts.get(r.shift_id).day_type),
      by_team_function: gapGroup((r) => teams.get(r.team_id).team_function),
      worst_teams: worstTeams,
    },
    M03_overtime: {
      employee_weeks: weeks.length,
      weeks_with_overtime: overtimeWeeks.length,
      total_overtime_hours: round2(sum(overtimeValues)),
      overtime_hours_p50: percentile(overtimeValues, 50),
      overtime_hours_p90: percentile(overtimeValues, 90),
      overtime_hours_max: percentile(overtimeValues, 100),
      cap_breaches: weeks.filter((w) => w.is_overtime_cap_exceeded === 1).length,
      scheduled_vs_contracted: rate(
        sum(weeks.map((w) => w.scheduled_hours)),
        sum(weeks.map((w) => w.contracted_hours)),
      ),
    },
    M04_leave: {
      requests: leave.length,
      by_status: countBy(leave, 'status'),
      approval_rate_by_type: leaveApproval,
      rejections_by_reason: countBy(
        leave.filter((l) => l.status === 'REJECTED'),
        'decision_reason_code',
      ),
      decided_by_role: countBy(decidedLeave, 'decided_by_role'),
      requested_days_approved: sum(
        leave.filter((l) => l.status === 'APPROVED').map((l) => l.requested_days),
      ),
    },
    M05_swaps: {
      requests: swaps.length,
      by_status: countBy(swaps, 'status'),
      by_type: countBy(swaps, 'swap_type'),
      approval_rate_of_decided: rate(approvedSwaps.length, managerDecided.length),
      expiry_rate: rate(swaps.filter((s) => s.status === 'EXPIRED').length, swaps.length),
      rejections_by_reason: countBy(
        swaps.filter((s) => s.status === 'REJECTED'),
        'decision_reason_code',
      ),
      manager_response_hours_p50: round2(percentile(responseHours, 50) ?? 0),
      manager_response_hours_p90: round2(percentile(responseHours, 90) ?? 0),
    },
    M06_attendance: {
      due_assignments: due.length,
      by_outcome: outcomes,
      no_show_rate: rate(outcomes.NO_SHOW ?? 0, due.length),
      punctuality_rate: rate(
        clockedIn.filter((r) => r.late_minutes <= lateGraceMinutes).length,
        clockedIn.length,
      ),
      late_rate: rate(
        clockedIn.filter((r) => r.late_minutes > lateGraceMinutes).length,
        clockedIn.length,
      ),
      early_leave_rate: rate(
        present.filter((r) => r.early_leave_minutes > earlyLeaveGraceMinutes).length,
        present.length,
      ),
      extension_rate: rate(
        present.filter((r) => r.extension_minutes > extensionThresholdMinutes).length,
        present.length,
      ),
      missing_punch_rate: rate(outcomes.MISSING_PUNCH ?? 0, due.length),
      manual_correction_rate: rate(
        clockOuts.filter((e) => e.source === 'MANUAL').length,
        clockOuts.length,
      ),
    },
    M07_reconciliation: {
      due_assignments: due.length,
      complete_record_rate: rate((outcomes.PRESENT ?? 0) + (outcomes.NO_SHOW ?? 0), due.length),
      no_record: outcomes.NO_RECORD ?? 0,
      scheduled_hours: round2(scheduledHours),
      worked_hours: round2(workedHours),
      worked_vs_scheduled_present: rate(
        sum(present.map((r) => r.worked_minutes)),
        sum(present.map((r) => r.scheduled_minutes)),
      ),
      by_operating_pattern: reconciliationByPattern,
    },
    M08_fairness: {
      population: 'schedulable members employed for the whole window, compared within their team',
      people: fullWindow.length,
      jain_nights: summarise('jain_nights'),
      jain_weekends: summarise('jain_weekends'),
      jain_holidays: summarise('jain_holidays'),
      jain_hours_per_contract: summarise('jain_hours_per_contract'),
      cv_hours_per_contract: summarise('cv_hours_per_contract'),
      teams: fairnessTeams,
    },
  };
}
