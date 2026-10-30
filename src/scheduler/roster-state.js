// In-memory roster: every employee's active assignments plus the counters the hard rules
// (R-SCH-01 … R-SCH-08) and the fairness ordering (R-SCH-09) need. Timestamps are kept as
// numbers (timestampMs) and dates as window day indexes so checks stay fast at full scale.

import { ENUMS } from '../domain/constants.js';
import { isoWeek, timestampMs } from '../lib/dates.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);
// Weekly load band used by the fairness key: 0.2 = one 8-hour shift of a 40-hour contract.
export const FAIRNESS_BAND = 0.2;

/** Days of an ISO week that are inside the window and inside the employee's employment. */
export function employedDaysInWeek(employee, weekDates) {
  return weekDates.filter(
    (d) =>
      employee.hire_date <= d &&
      (employee.termination_date === null || d <= employee.termination_date),
  ).length;
}

/**
 * Weekly limits in minutes. Scheduled time is capped by R-SCH-08; worked time by R-OVT-02
 * (contracted hours prorated to the employed days of the week, plus the overtime cap).
 */
export function weeklyLimits(policy, employedDays) {
  const contracted = (policy.contracted_weekly_hours * 60 * employedDays) / 7;
  const workedCap = contracted + policy.weekly_overtime_cap_hours * 60;
  return {
    contractedMinutes: contracted,
    scheduledMinutes: Math.floor(Math.min(policy.max_weekly_scheduled_hours * 60, workedCap)),
    workedMinutes: Math.floor(workedCap),
  };
}

export class RosterState {
  constructor({ window, employees, employeeSkills, policiesById, shifts, shiftTemplates }) {
    this.window = window;
    this.dayIndex = new Map(window.dates.map((date, i) => [date, i]));
    this.weekDates = Map.groupBy(window.dates, isoWeek);

    const nightTemplates = new Set(
      shiftTemplates.filter((t) => t.is_night === 1).map((t) => t.template_code),
    );
    this.shifts = new Map(
      shifts.map((row) => {
        const startMs = timestampMs(row.start_at);
        const endMs = timestampMs(row.end_at);
        return [
          row.shift_id,
          {
            row,
            id: row.shift_id,
            date: row.shift_date,
            dayIdx: this.dayIndex.get(row.shift_date),
            week: row.iso_week,
            template: row.template_code,
            dayType: row.day_type,
            isNight: nightTemplates.has(row.template_code),
            startMs,
            endMs,
            minutes: (endMs - startMs) / MINUTE_MS,
          },
        ];
      }),
    );
    this.shiftByDateTemplate = new Map(
      [...this.shifts.values()].map((s) => [`${s.date}|${s.template}`, s]),
    );

    const skillsByEmployee = Map.groupBy(employeeSkills, (s) => s.employee_id);
    this.employees = new Map();
    for (const row of employees) {
      const policy = policiesById.get(row.policy_id);
      this.employees.set(row.employee_id, {
        row,
        id: row.employee_id,
        teamId: row.team_id,
        schedulable: SCHEDULABLE.has(row.employee_role),
        policy,
        skills: new Map((skillsByEmployee.get(row.employee_id) ?? []).map((s) => [s.skill_id, s])),
        leaves: [],
        active: [],
        dayCount: new Uint8Array(window.days),
        weekMinutes: new Map(),
        limits: new Map(),
        nights: 0,
        weekends: 0,
        holidays: 0,
        totalMinutes: 0,
        windowContractedMinutes: Math.max(
          1,
          [...this.weekDates.values()].reduce(
            (sum, dates) =>
              sum + weeklyLimits(policy, employedDaysInWeek(row, dates)).contractedMinutes,
            0,
          ),
        ),
      });
    }
    this.byTeam = Map.groupBy(
      [...this.employees.values()].filter((e) => e.schedulable),
      (e) => e.teamId,
    );
    this.activeByDay = Array.from({ length: window.days }, () => new Set());
  }

  limits(emp, week) {
    if (!emp.limits.has(week)) {
      emp.limits.set(
        week,
        weeklyLimits(emp.policy, employedDaysInWeek(emp.row, this.weekDates.get(week))),
      );
    }
    return emp.limits.get(week);
  }

  employedOn(emp, date) {
    const { hire_date: hire, termination_date: end } = emp.row;
    return emp.schedulable && hire <= date && (end === null || date <= end);
  }

  holdsSkill(emp, skillId, date) {
    const skill = emp.skills.get(skillId);
    return (
      skill !== undefined &&
      skill.valid_from <= date &&
      (skill.valid_to === null || date <= skill.valid_to)
    );
  }

  /** Leave counts from its approval until (if ever) its cancellation. */
  onLeave(emp, date, atMs) {
    return emp.leaves.some(
      (l) =>
        l.startDate <= date &&
        date <= l.endDate &&
        l.decidedMs <= atMs &&
        (l.cancelledMs === null || l.cancelledMs > atMs),
    );
  }

  /**
   * First broken rule if `emp` took `shift` covering `skillId` at time `atMs`, or null.
   * `ignore` is an assignment the employee gives up in the same move (swaps).
   * Order matches the reason order of R-SWP-02 / R-SWP-03.
   */
  check(emp, shift, skillId, atMs, ignore = null) {
    if (!this.holdsSkill(emp, skillId, shift.date)) return 'SKILL_NOT_HELD';
    const ignoreDay = ignore !== null && ignore.shift.dayIdx === shift.dayIdx ? 1 : 0;
    if (emp.dayCount[shift.dayIdx] - ignoreDay > 0) return 'DOUBLE_BOOKING';
    if (this.onLeave(emp, shift.date, atMs)) return 'ON_APPROVED_LEAVE';
    if (!this.employedOn(emp, shift.date)) return 'EMPLOYEE_NOT_ACTIVE';

    const restMs = emp.policy.min_rest_hours * HOUR_MS;
    const { before, after } = this.neighbours(emp, shift.startMs, ignore);
    if (before && shift.startMs - before.shift.endMs < restMs) return 'REST_RULE_BREACH';
    if (after && after.shift.startMs - shift.endMs < restMs) return 'REST_RULE_BREACH';

    let run = 1;
    const worksOn = (idx) =>
      emp.dayCount[idx] - (ignore !== null && ignore.shift.dayIdx === idx ? 1 : 0) > 0;
    for (let i = shift.dayIdx - 1; i >= 0 && worksOn(i); i--) run++;
    for (let i = shift.dayIdx + 1; i < this.window.days && worksOn(i); i++) run++;
    if (run > emp.policy.max_consecutive_days) return 'CONSECUTIVE_DAYS_BREACH';

    const ignoreMinutes =
      ignore !== null && ignore.shift.week === shift.week ? ignore.shift.minutes : 0;
    const weekMinutes = (emp.weekMinutes.get(shift.week) ?? 0) - ignoreMinutes + shift.minutes;
    if (weekMinutes > this.limits(emp, shift.week).scheduledMinutes) return 'WEEKLY_HOURS_BREACH';
    return null;
  }

  /**
   * What an employee can see in their own calendar: free that day and rested enough either side.
   * Used to model whom a requester asks; it deliberately ignores skills, leave and weekly limits.
   */
  isAvailable(emp, shift, ignore = null) {
    const ignoreDay = ignore !== null && ignore.shift.dayIdx === shift.dayIdx ? 1 : 0;
    if (emp.dayCount[shift.dayIdx] - ignoreDay > 0) return false;
    const restMs = emp.policy.min_rest_hours * HOUR_MS;
    const { before, after } = this.neighbours(emp, shift.startMs, ignore);
    return (
      !(before && shift.startMs - before.shift.endMs < restMs) &&
      !(after && after.shift.startMs - shift.endMs < restMs)
    );
  }

  /** Nearest active assignments before and after a start time, skipping `ignore`. */
  neighbours(emp, startMs, ignore) {
    const list = emp.active;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].shift.startMs < startMs) lo = mid + 1;
      else hi = mid;
    }
    let b = lo - 1;
    while (b >= 0 && list[b] === ignore) b--;
    let a = lo;
    while (a < list.length && (list[a] === ignore || list[a].shift.startMs === startMs)) a++;
    return { before: b >= 0 ? list[b] : null, after: a < list.length ? list[a] : null };
  }

  /**
   * Fairness ordering of R-SCH-09; lower sorts first. The weekly load is compared in bands of
   * FAIRNESS_BAND of the contract, so within a band the unsocial-shift count decides; a raw
   * ratio would almost always break the tie on its own and ignore nights and weekends.
   */
  fairnessKey(emp, shift, tiebreak) {
    const weekContracted = this.limits(emp, shift.week).contractedMinutes;
    let unsocial = 0;
    if (shift.isNight) unsocial += emp.nights;
    if (shift.dayType === 'WEEKEND') unsocial += emp.weekends;
    if (shift.dayType === 'HOLIDAY') unsocial += emp.holidays;
    const load =
      weekContracted > 0 ? (emp.weekMinutes.get(shift.week) ?? 0) / weekContracted : Infinity;
    return [
      Math.floor(load / FAIRNESS_BAND),
      unsocial,
      emp.totalMinutes / emp.windowContractedMinutes,
      tiebreak,
    ];
  }

  add(assignment) {
    const emp = assignment.employee;
    const { shift } = assignment;
    const list = emp.active;
    let i = list.length;
    while (i > 0 && list[i - 1].shift.startMs > shift.startMs) i--;
    list.splice(i, 0, assignment);
    this.adjust(emp, shift, 1);
    this.activeByDay[shift.dayIdx].add(assignment);
  }

  remove(assignment) {
    const emp = assignment.employee;
    emp.active.splice(emp.active.indexOf(assignment), 1);
    this.adjust(emp, assignment.shift, -1);
    this.activeByDay[assignment.shift.dayIdx].delete(assignment);
  }

  adjust(emp, shift, sign) {
    emp.dayCount[shift.dayIdx] += sign;
    emp.weekMinutes.set(shift.week, (emp.weekMinutes.get(shift.week) ?? 0) + sign * shift.minutes);
    emp.totalMinutes += sign * shift.minutes;
    if (shift.isNight) emp.nights += sign;
    if (shift.dayType === 'WEEKEND') emp.weekends += sign;
    if (shift.dayType === 'HOLIDAY') emp.holidays += sign;
  }
}

export function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
