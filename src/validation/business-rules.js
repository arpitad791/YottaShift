import { overtimeHours, weekDatesOf, workedMinutes } from '../derive/derived-tables.js';
import { ENUMS, TRANSITIONS } from '../domain/constants.js';
import { minutesBetween, timestampMs } from '../lib/dates.js';
import { employedDaysInWeek, weeklyLimits } from '../scheduler/roster-state.js';

const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);
const HOUR_MS = 3_600_000;

const finding = (
  ruleId,
  issueType,
  table,
  recordIds,
  employeeId,
  referenceDate,
  message,
  kind = 'VIOLATION',
) => ({
  ruleId,
  issueType,
  kind,
  table,
  recordIds: [...recordIds].sort(),
  employeeId,
  referenceDate,
  message,
});

function context(tables) {
  const employees = new Map(tables.employee.map((e) => [e.employee_id, e]));
  const shifts = new Map(tables.shift.map((s) => [s.shift_id, s]));
  const policies = new Map(tables.labor_policy.map((p) => [p.policy_id, p]));
  const active = tables.shift_assignment.filter((a) => a.status === 'SCHEDULED');
  const activeByEmployee = Map.groupBy(active, (a) => a.employee_id);
  const weekDates = weekDatesOf(tables.shift);
  return { employees, shifts, policies, active, activeByEmployee, weekDates };
}

function rosterRules(tables, ctx, patterns) {
  const out = [];
  const { employees, shifts, policies, active, activeByEmployee, weekDates } = ctx;
  const teams = new Map(tables.team.map((t) => [t.team_id, t]));
  const skills = new Map(tables.employee_skill.map((s) => [`${s.employee_id}|${s.skill_id}`, s]));
  const approvedLeave = Map.groupBy(
    tables.leave_request.filter((l) => l.status === 'APPROVED'),
    (l) => l.employee_id,
  );

  for (const a of active) {
    const shift = shifts.get(a.shift_id);
    const emp = employees.get(a.employee_id);
    const date = shift.shift_date;

    for (const leave of approvedLeave.get(a.employee_id) ?? []) {
      if (leave.start_date <= date && date <= leave.end_date) {
        out.push(
          finding(
            'R-SCH-02',
            'LEAVE_OVERLAP',
            'shift_assignment',
            [a.assignment_id, leave.leave_request_id],
            emp.employee_id,
            date,
            `Assigned on ${date} during approved leave ${leave.leave_request_id}`,
          ),
        );
      }
    }
    const skill = skills.get(`${a.employee_id}|${a.skill_id}`);
    if (!skill || skill.valid_from > date || (skill.valid_to !== null && date > skill.valid_to)) {
      out.push(
        finding(
          'R-SCH-03',
          'SKILL_ABSENT',
          'shift_assignment',
          [a.assignment_id],
          emp.employee_id,
          date,
          `Covers ${a.skill_id} without holding it on ${date}`,
        ),
      );
    }
    if (
      !SCHEDULABLE.has(emp.employee_role) ||
      emp.hire_date > date ||
      (emp.termination_date !== null && date > emp.termination_date)
    ) {
      out.push(
        finding(
          'R-SCH-04',
          null,
          'shift_assignment',
          [a.assignment_id],
          emp.employee_id,
          date,
          'Employee not schedulable or not employed on the shift date',
        ),
      );
    }
    const team = teams.get(a.team_id);
    if (
      a.team_id !== emp.team_id ||
      !patterns[team.operating_pattern].templates.includes(shift.template_code)
    ) {
      out.push(
        finding(
          'R-SCH-05',
          null,
          'shift_assignment',
          [a.assignment_id],
          emp.employee_id,
          date,
          'Team or template does not match the employee and team pattern',
        ),
      );
    }
  }

  for (const [employeeId, list] of activeByEmployee) {
    const emp = employees.get(employeeId);
    const policy = policies.get(emp.policy_id);

    for (const sameDay of Map.groupBy(list, (a) => shifts.get(a.shift_id).shift_date).values()) {
      if (sameDay.length > 1) {
        const date = shifts.get(sameDay[0].shift_id).shift_date;
        out.push(
          finding(
            'R-SCH-01',
            'DOUBLE_BOOKED',
            'shift_assignment',
            sameDay.map((a) => a.assignment_id),
            employeeId,
            date,
            `${sameDay.length} active assignments on ${date}`,
          ),
        );
      }
    }

    const ordered = list
      .map((a) => ({ a, shift: shifts.get(a.shift_id) }))
      .sort((x, y) => x.shift.start_at.localeCompare(y.shift.start_at));
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      if (prev.shift.shift_date === next.shift.shift_date) continue; // reported as R-SCH-01
      const restHours =
        (timestampMs(next.shift.start_at) - timestampMs(prev.shift.end_at)) / HOUR_MS;
      if (restHours < policy.min_rest_hours) {
        out.push(
          finding(
            'R-SCH-06',
            null,
            'shift_assignment',
            [prev.a.assignment_id, next.a.assignment_id],
            employeeId,
            next.shift.shift_date,
            `Only ${restHours} h rest`,
          ),
        );
      }
    }

    const dates = [...new Set(ordered.map((o) => o.shift.shift_date))];
    let run = 1;
    for (let i = 1; i <= dates.length; i++) {
      const consecutive =
        i < dates.length &&
        timestampMs(`${dates[i]}T00:00:00+05:30`) -
          timestampMs(`${dates[i - 1]}T00:00:00+05:30`) ===
          24 * HOUR_MS;
      if (consecutive) run++;
      else {
        if (run > policy.max_consecutive_days) {
          out.push(
            finding(
              'R-SCH-07',
              null,
              'shift_assignment',
              [],
              employeeId,
              dates[i - 1],
              `${run} consecutive working days`,
            ),
          );
        }
        run = 1;
      }
    }

    for (const [week, weekList] of Map.groupBy(ordered, (o) => o.shift.iso_week)) {
      const minutes = weekList.reduce(
        (sum, o) => sum + minutesBetween(o.shift.start_at, o.shift.end_at),
        0,
      );
      const limit = weeklyLimits(
        policy,
        employedDaysInWeek(emp, weekDates.get(week)),
      ).scheduledMinutes;
      if (minutes > limit) {
        out.push(
          finding(
            'R-SCH-08',
            null,
            'shift_assignment',
            weekList.map((o) => o.a.assignment_id),
            employeeId,
            weekList[0].shift.shift_date,
            `${minutes / 60} h scheduled in ${week}, limit ${limit / 60} h`,
          ),
        );
      }
    }
  }
  return out;
}

function attendanceRules(tables, ctx) {
  const out = [];
  const { employees, shifts, policies, weekDates } = ctx;
  const events = Map.groupBy(tables.attendance_event, (e) => e.assignment_id);
  const workedByWeek = new Map();

  for (const a of tables.shift_assignment) {
    const list = events.get(a.assignment_id) ?? [];
    const shift = shifts.get(a.shift_id);
    if (a.status !== 'SCHEDULED') {
      if (list.length > 0) {
        out.push(
          finding(
            'R-ATT-01',
            null,
            'attendance_event',
            list.map((e) => e.attendance_event_id),
            a.employee_id,
            shift.shift_date,
            `Attendance recorded for a ${a.status} assignment`,
          ),
        );
      }
      continue;
    }
    const types = list
      .map((e) => e.event_type)
      .sort()
      .join();
    if (types === 'CLOCK_IN') {
      out.push(
        finding(
          'R-ATT-04',
          null,
          'attendance_event',
          list.map((e) => e.attendance_event_id),
          a.employee_id,
          shift.shift_date,
          'Clock-in without clock-out (uncorrected missing punch)',
          'EXCEPTION',
        ),
      );
      continue;
    }
    if (types !== 'CLOCK_IN,CLOCK_OUT' && types !== 'NO_SHOW') {
      out.push(
        finding(
          'R-ATT-01',
          null,
          'shift_assignment',
          [a.assignment_id],
          a.employee_id,
          shift.shift_date,
          `Incomplete attendance: [${types}]`,
        ),
      );
      continue;
    }
    for (const e of list) {
      if (e.employee_id !== a.employee_id) {
        out.push(
          finding(
            'R-ATT-01',
            null,
            'attendance_event',
            [e.attendance_event_id],
            e.employee_id,
            shift.shift_date,
            'Attendance employee differs from the assigned employee',
          ),
        );
      }
    }
    if (types === 'CLOCK_IN,CLOCK_OUT') {
      const clockIn = list.find((e) => e.event_type === 'CLOCK_IN').event_at;
      const clockOut = list.find((e) => e.event_type === 'CLOCK_OUT').event_at;
      const worked = workedMinutes(shift, clockIn, clockOut);
      const key = `${a.employee_id}|${shift.iso_week}`;
      const entry = workedByWeek.get(key) ?? {
        minutes: 0,
        assignmentIds: [],
        firstDate: shift.shift_date,
      };
      entry.minutes += worked;
      entry.assignmentIds.push(a.assignment_id);
      if (shift.shift_date < entry.firstDate) entry.firstDate = shift.shift_date;
      workedByWeek.set(key, entry);
    }
  }

  for (const [key, entry] of workedByWeek) {
    const [employeeId, week] = key.split('|');
    const emp = employees.get(employeeId);
    const policy = policies.get(emp.policy_id);
    const { contractedMinutes } = weeklyLimits(
      policy,
      employedDaysInWeek(emp, weekDates.get(week)),
    );
    // R-OVT-02: strictly above the cap is a breach.
    const overtime = overtimeHours(entry.minutes, contractedMinutes);
    if (overtime > policy.weekly_overtime_cap_hours) {
      out.push(
        finding(
          'R-OVT-02',
          'OVERTIME_CAP_EXCEEDED',
          'attendance_event',
          entry.assignmentIds,
          employeeId,
          entry.firstDate,
          `${overtime} h overtime in ${week}, cap ${policy.weekly_overtime_cap_hours} h`,
        ),
      );
    }
  }
  return out;
}

function lifecycleRules(tables) {
  const out = [];
  const specs = [
    ['leave_request', 'leave_request_id', 'leave_request_event', 'LEAVE_STATUS', 'R-GEN-01'],
    ['swap_request', 'swap_id', 'swap_request_event', 'SWAP_STATUS', 'R-SWP-08'],
    [
      'shift_assignment',
      'assignment_id',
      'shift_assignment_event',
      'ASSIGNMENT_STATUS',
      'R-GEN-01',
    ],
  ];
  for (const [table, key, eventTable, enumName, ruleId] of specs) {
    const chains = Map.groupBy(tables[eventTable], (e) => e[key]);
    for (const row of tables[table]) {
      const chain = (chains.get(row[key]) ?? []).toSorted((a, b) => a.event_seq - b.event_seq);
      const problems = [];
      if (chain.length === 0) problems.push('no events');
      chain.forEach((e, i) => {
        if (e.event_seq !== i + 1) problems.push(`event_seq gap at ${e.event_id}`);
        const previous = i === 0 ? null : chain[i - 1].to_status;
        if (e.from_status !== previous)
          problems.push(`${e.event_id} starts from ${e.from_status}, expected ${previous}`);
        if (!TRANSITIONS[enumName][String(previous)].includes(e.to_status)) {
          problems.push(`${e.event_id}: ${previous} → ${e.to_status} is not allowed`);
        }
        if (i > 0 && e.event_at < chain[i - 1].event_at)
          problems.push(`${e.event_id} is earlier than the previous event`);
      });
      if (chain.length > 0 && chain.at(-1).to_status !== row.status)
        problems.push(`status ${row.status} ≠ last event ${chain.at(-1).to_status}`);
      if (problems.length > 0) {
        out.push(
          finding(
            ruleId,
            null,
            table,
            [row[key]],
            row.employee_id ?? row.requester_employee_id ?? null,
            null,
            problems.join('; '),
          ),
        );
      }
    }
  }
  return out;
}

function swapRules(tables) {
  const out = [];
  const approved = new Set(
    tables.swap_request_event.filter((e) => e.to_status === 'APPROVED').map((e) => e.swap_id),
  );
  const swaps = new Map(tables.swap_request.map((s) => [s.swap_id, s]));
  const reported = new Set();
  const report = (swapId, extraIds) => {
    if (reported.has(swapId)) return;
    reported.add(swapId);
    const swap = swaps.get(swapId);
    out.push(
      finding(
        'R-SWP-06',
        'SWAP_WITHOUT_APPROVAL',
        'swap_request',
        [swapId, ...extraIds],
        swap.requester_employee_id,
        swap.requested_at.slice(0, 10),
        'Swap applied without an APPROVED event',
      ),
    );
  };
  for (const swap of tables.swap_request) {
    if (swap.status === 'APPLIED' && !approved.has(swap.swap_id)) report(swap.swap_id, []);
  }
  for (const a of tables.shift_assignment) {
    if (a.source === 'SWAP' && !approved.has(a.swap_id)) report(a.swap_id, [a.assignment_id]);
  }
  return out;
}

export function checkBusinessRules(tables, { patterns }) {
  const ctx = context(tables);
  return [
    ...rosterRules(tables, ctx, patterns),
    ...attendanceRules(tables, ctx),
    ...lifecycleRules(tables),
    ...swapRules(tables),
  ];
}
