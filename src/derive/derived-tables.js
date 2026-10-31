import { ENUMS } from '../domain/constants.js';
import { isoWeek, timestampMs } from '../lib/dates.js';
import { employedDaysInWeek, weeklyLimits } from '../scheduler/roster-state.js';

const MINUTE_MS = 60_000;
const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);
const templateOrder = (code) => ENUMS.TEMPLATE_CODE.indexOf(code);

export const round2 = (value) => Math.round(value * 100) / 100;
const wholeMinutes = (fromTs, toTs) =>
  Math.floor((timestampMs(toTs) - timestampMs(fromTs)) / MINUTE_MS);

/** R-ATT-03: paid time runs from the later of clock-in and shift start to clock-out. */
export function workedMinutes(shift, clockIn, clockOut) {
  const paidStart = clockIn > shift.start_at ? clockIn : shift.start_at;
  return Math.max(0, wholeMinutes(paidStart, clockOut));
}

export function overtimeHours(worked, contractedMinutes) {
  return round2(Math.max(0, (worked - contractedMinutes) / 60));
}

export function weekDatesOf(shiftRows) {
  return Map.groupBy([...new Set(shiftRows.map((s) => s.shift_date))].sort(), isoWeek);
}

export function attendanceReconciliation(tables) {
  const shifts = new Map(tables.shift.map((s) => [s.shift_id, s]));
  const events = Map.groupBy(tables.attendance_event, (e) => e.assignment_id);
  const rows = [];
  for (const a of tables.shift_assignment) {
    if (a.status !== 'SCHEDULED') continue;
    const shift = shifts.get(a.shift_id);
    const list = events.get(a.assignment_id) ?? [];
    const clockIn = list.find((e) => e.event_type === 'CLOCK_IN')?.event_at ?? null;
    const clockOut = list.find((e) => e.event_type === 'CLOCK_OUT')?.event_at ?? null;
    const noShow = list.some((e) => e.event_type === 'NO_SHOW');

    let outcome = 'NO_RECORD';
    if (clockIn && clockOut) outcome = 'PRESENT';
    else if (clockIn) outcome = 'MISSING_PUNCH';
    else if (noShow) outcome = 'NO_SHOW';
    const present = outcome === 'PRESENT';
    rows.push({
      assignment_id: a.assignment_id,
      employee_id: a.employee_id,
      shift_id: a.shift_id,
      scheduled_minutes: wholeMinutes(shift.start_at, shift.end_at),
      clock_in_at: outcome === 'NO_SHOW' || outcome === 'NO_RECORD' ? null : clockIn,
      clock_out_at: present ? clockOut : null,
      worked_minutes: present ? workedMinutes(shift, clockIn, clockOut) : null,
      late_minutes: clockIn ? Math.max(0, wholeMinutes(shift.start_at, clockIn)) : null,
      early_leave_minutes: present ? Math.max(0, wholeMinutes(clockOut, shift.end_at)) : null,
      extension_minutes: present ? Math.max(0, wholeMinutes(shift.end_at, clockOut)) : null,
      outcome,
    });
  }
  return rows.sort((x, y) => x.assignment_id.localeCompare(y.assignment_id));
}

export function employeeWeekSummary(tables, reconciliation) {
  const shifts = new Map(tables.shift.map((s) => [s.shift_id, s]));
  const policies = new Map(tables.labor_policy.map((p) => [p.policy_id, p]));
  const weekDates = weekDatesOf(tables.shift);
  const scheduled = new Map();
  const worked = new Map();
  const add = (map, key, minutes) => map.set(key, (map.get(key) ?? 0) + minutes);

  for (const a of tables.shift_assignment) {
    if (a.status !== 'SCHEDULED') continue;
    const shift = shifts.get(a.shift_id);
    add(
      scheduled,
      `${a.employee_id}|${shift.iso_week}`,
      wholeMinutes(shift.start_at, shift.end_at),
    );
  }
  for (const r of reconciliation) {
    if (r.worked_minutes !== null)
      add(worked, `${r.employee_id}|${shifts.get(r.shift_id).iso_week}`, r.worked_minutes);
  }

  const rows = [];
  for (const emp of tables.employee) {
    if (!SCHEDULABLE.has(emp.employee_role)) continue;
    const policy = policies.get(emp.policy_id);
    for (const [week, dates] of weekDates) {
      const days = employedDaysInWeek(emp, dates);
      if (days === 0) continue;
      const key = `${emp.employee_id}|${week}`;
      const { contractedMinutes } = weeklyLimits(policy, days);
      const workedMins = worked.get(key) ?? 0;
      const overtime = overtimeHours(workedMins, contractedMinutes);
      rows.push({
        employee_id: emp.employee_id,
        iso_week: week,
        days_in_window: days,
        contracted_hours: round2(contractedMinutes / 60),
        scheduled_hours: round2((scheduled.get(key) ?? 0) / 60),
        worked_hours: round2(workedMins / 60),
        overtime_hours: overtime,
        overtime_cap_hours: policy.weekly_overtime_cap_hours,
        is_overtime_cap_exceeded: overtime > policy.weekly_overtime_cap_hours ? 1 : 0,
      });
    }
  }
  return rows;
}

/**
 * One row per shift × team × skill that has a requirement or an assignment. Qualified means the
 * assignee holds the skill on that date; attended means a qualified assignee clocked in
 * (PRESENT or MISSING_PUNCH).
 */
export function coverageStatus(tables, reconciliation) {
  const skills = new Map(tables.employee_skill.map((s) => [`${s.employee_id}|${s.skill_id}`, s]));
  const outcomes = new Map(reconciliation.map((r) => [r.assignment_id, r.outcome]));
  const requirements = Map.groupBy(
    tables.coverage_requirement,
    (c) => `${c.team_id}|${c.template_code}|${c.day_type}`,
  );
  const cells = new Map();
  const cell = (shift, teamId, skillId) => {
    const key = `${shift.shift_id}|${teamId}|${skillId}`;
    if (!cells.has(key)) {
      cells.set(key, {
        shift,
        teamId,
        skillId,
        coverageId: null,
        required: 0,
        assigned: 0,
        qualified: 0,
        attended: 0,
      });
    }
    return cells.get(key);
  };

  const teamIds = [...new Set(tables.coverage_requirement.map((c) => c.team_id))];
  for (const shift of tables.shift) {
    for (const teamId of teamIds) {
      for (const c of requirements.get(`${teamId}|${shift.template_code}|${shift.day_type}`) ??
        []) {
        if (
          shift.shift_date < c.effective_from ||
          (c.effective_to !== null && shift.shift_date > c.effective_to)
        )
          continue;
        const entry = cell(shift, teamId, c.skill_id);
        entry.coverageId = c.coverage_id;
        entry.required = c.min_headcount;
      }
    }
  }

  const shifts = new Map(tables.shift.map((s) => [s.shift_id, s]));
  for (const a of tables.shift_assignment) {
    if (a.status !== 'SCHEDULED') continue;
    const shift = shifts.get(a.shift_id);
    const entry = cell(shift, a.team_id, a.skill_id);
    entry.assigned += 1;
    const skill = skills.get(`${a.employee_id}|${a.skill_id}`);
    const qualified =
      skill &&
      skill.valid_from <= shift.shift_date &&
      (skill.valid_to === null || shift.shift_date <= skill.valid_to);
    if (!qualified) continue;
    entry.qualified += 1;
    const outcome = outcomes.get(a.assignment_id);
    if (outcome === 'PRESENT' || outcome === 'MISSING_PUNCH') entry.attended += 1;
  }

  return [...cells.values()]
    .sort(
      (x, y) =>
        x.shift.shift_date.localeCompare(y.shift.shift_date) ||
        templateOrder(x.shift.template_code) - templateOrder(y.shift.template_code) ||
        x.teamId.localeCompare(y.teamId) ||
        x.skillId.localeCompare(y.skillId),
    )
    .map((e) => {
      const gap = Math.max(0, e.required - e.qualified);
      return {
        shift_id: e.shift.shift_id,
        team_id: e.teamId,
        skill_id: e.skillId,
        coverage_id: e.coverageId,
        required_headcount: e.required,
        assigned_headcount: e.assigned,
        qualified_headcount: e.qualified,
        attended_headcount: e.attended,
        gap_headcount: gap,
        attended_gap_headcount: Math.max(0, e.required - e.attended),
        status: gap > 0 ? 'GAP' : 'MET',
      };
    });
}

export function leaveBalance(tables) {
  const approved = new Map();
  for (const l of tables.leave_request) {
    if (l.status !== 'APPROVED') continue;
    const key = `${l.employee_id}|${l.leave_type}`;
    approved.set(key, (approved.get(key) ?? 0) + l.requested_days);
  }
  return tables.leave_entitlement.map((e) => {
    const used = approved.get(`${e.employee_id}|${e.leave_type}`) ?? 0;
    return {
      employee_id: e.employee_id,
      leave_type: e.leave_type,
      entitled_days: e.entitled_days,
      approved_days: used,
      remaining_days: e.entitled_days - used,
    };
  });
}

export function deriveTables(tables) {
  const reconciliation = attendanceReconciliation(tables);
  return [
    ['employee_week_summary', employeeWeekSummary(tables, reconciliation)],
    ['coverage_status', coverageStatus(tables, reconciliation)],
    ['leave_balance', leaveBalance(tables)],
    ['attendance_reconciliation', reconciliation],
  ];
}
