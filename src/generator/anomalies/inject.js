// Labelled anomalies and boundary cases (Step 5 of the brief), applied to the clean baseline.
//
// Each anomaly is built so that it breaks exactly its own rule and nothing else, touches only
// the rows it names, and keeps every row structurally valid (schema, FKs, IDs). Boundary cases
// sit exactly at a limit and must NOT be flagged. Labels go to a separate ground-truth file;
// nothing in the input tables marks a row as injected.
//
//   DOUBLE_BOOKED          a second booking of a shift the employee already works (no-show on it)
//   LEAVE_OVERLAP          an assignment added inside an approved leave (no-show on it)
//   SKILL_ABSENT           an assignment switched to a team skill the employee does not hold
//   OVERTIME_CAP_EXCEEDED  one clock-out moved later so the week's overtime passes the cap
//   SWAP_WITHOUT_APPROVAL  the APPROVED event removed from an applied swap
//   BOUNDARY_*             overtime exactly at the cap, leave ending the day before a shift,
//                          exactly max consecutive days, swap requested exactly at the notice limit

import { ENUMS } from '../../domain/constants.js';
import { POLICY } from '../../domain/rules.js';
import { addDays, timestampFromMs, timestampMs } from '../../lib/dates.js';
import { ids } from '../../lib/ids.js';
import { employedDaysInWeek, weeklyLimits } from '../../scheduler/roster-state.js';
import { weekDatesOf, workedMinutes } from '../../derive/derived-tables.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);

function context(t, config) {
  const shifts = new Map(
    t.shift.map((s) => [
      s.shift_id,
      { ...s, startMs: timestampMs(s.start_at), endMs: timestampMs(s.end_at) },
    ]),
  );
  const employees = new Map(t.employee.map((e) => [e.employee_id, e]));
  const teams = new Map(t.team.map((x) => [x.team_id, x]));
  const policies = new Map(t.labor_policy.map((p) => [p.policy_id, p]));
  const skills = Map.groupBy(t.employee_skill, (s) => s.employee_id);
  const teamSkills = new Map();
  for (const c of t.coverage_requirement) {
    if (!teamSkills.has(c.team_id)) teamSkills.set(c.team_id, new Set());
    teamSkills.get(c.team_id).add(c.skill_id);
  }
  const attendance = Map.groupBy(t.attendance_event, (e) => e.assignment_id);
  const active = Map.groupBy(
    t.shift_assignment.filter((a) => a.status === 'SCHEDULED'),
    (a) => a.employee_id,
  );
  for (const list of active.values())
    list.sort((a, b) => shifts.get(a.shift_id).startMs - shifts.get(b.shift_id).startMs);
  const publication = new Map();
  for (const a of t.shift_assignment) {
    if (a.source !== 'ROSTER') continue;
    const week = shifts.get(a.shift_id).iso_week;
    if (!publication.has(week) || a.created_at < publication.get(week))
      publication.set(week, a.created_at);
  }
  let lastAssignment = 0;
  for (const a of t.shift_assignment)
    lastAssignment = Math.max(lastAssignment, Number(a.assignment_id.slice(9)));

  return {
    shifts,
    employees,
    teams,
    policies,
    skills,
    teamSkills,
    attendance,
    active,
    publication,
    weekDates: weekDatesOf(t.shift),
    patterns: config.operatingPatterns,
    attendanceIds: new Set(t.attendance_event.map((e) => e.attendance_event_id)),
    nextAssignment: () => ++lastAssignment,
  };
}

const holds = (ctx, employeeId, skillId, date) =>
  (ctx.skills.get(employeeId) ?? []).some(
    (s) =>
      s.skill_id === skillId && s.valid_from <= date && (s.valid_to === null || date <= s.valid_to),
  );

const outcomeOf = (ctx, assignmentId) => {
  const types = (ctx.attendance.get(assignmentId) ?? [])
    .map((e) => e.event_type)
    .sort()
    .join();
  return types === 'CLOCK_IN,CLOCK_OUT' ? 'PRESENT' : types;
};

function scheduledMinutesInWeek(ctx, employeeId, week) {
  return (ctx.active.get(employeeId) ?? [])
    .filter((a) => ctx.shifts.get(a.shift_id).iso_week === week)
    .reduce(
      (sum, a) =>
        sum + (ctx.shifts.get(a.shift_id).endMs - ctx.shifts.get(a.shift_id).startMs) / MINUTE_MS,
      0,
    );
}

function limitsFor(ctx, emp, week) {
  return weeklyLimits(
    ctx.policies.get(emp.policy_id),
    employedDaysInWeek(emp, ctx.weekDates.get(week)),
  );
}

/** Would adding `shift` keep R-SCH-01 and R-SCH-04 … R-SCH-08 intact (leave is ignored)? */
function fitsRoster(ctx, emp, shift) {
  const team = ctx.teams.get(emp.team_id);
  if (!ctx.patterns[team.operating_pattern].templates.includes(shift.template_code)) return false;
  if (!SCHEDULABLE.has(emp.employee_role) || emp.hire_date > shift.shift_date) return false;
  if (emp.termination_date !== null && shift.shift_date > emp.termination_date) return false;
  const policy = ctx.policies.get(emp.policy_id);
  const list = ctx.active.get(emp.employee_id) ?? [];
  const dates = new Set(list.map((a) => ctx.shifts.get(a.shift_id).shift_date));
  if (dates.has(shift.shift_date)) return false;
  const restMs = policy.min_rest_hours * HOUR_MS;
  for (const a of list) {
    const other = ctx.shifts.get(a.shift_id);
    if (other.endMs <= shift.startMs && shift.startMs - other.endMs < restMs) return false;
    if (other.startMs >= shift.endMs && other.startMs - shift.endMs < restMs) return false;
  }
  let run = 1;
  for (let d = addDays(shift.shift_date, -1); dates.has(d); d = addDays(d, -1)) run++;
  for (let d = addDays(shift.shift_date, 1); dates.has(d); d = addDays(d, 1)) run++;
  if (run > policy.max_consecutive_days) return false;
  const minutes = (shift.endMs - shift.startMs) / MINUTE_MS;
  return (
    scheduledMinutesInWeek(ctx, emp.employee_id, shift.iso_week) + minutes <=
    limitsFor(ctx, emp, shift.iso_week).scheduledMinutes
  );
}

export function injectAnomalies(source, { config, profile, rng }) {
  const t = { ...source };
  for (const name of [
    'shift_assignment',
    'shift_assignment_event',
    'attendance_event',
    'swap_request',
    'swap_request_event',
  ]) {
    t[name] = [...source[name]];
  }
  const ctx = context(t, config);
  const labels = [];
  // One label per employee keeps every case independent of the others.
  const used = new Set();
  const free = (...employeeIds) => employeeIds.every((id) => !used.has(id));
  const take = (...employeeIds) => employeeIds.forEach((id) => used.add(id));
  const label = (
    labelClass,
    issueType,
    ruleId,
    table,
    recordIds,
    employeeId,
    referenceDate,
    description,
  ) =>
    labels.push({
      labelClass,
      issueType,
      ruleId,
      table,
      recordIds,
      employeeId,
      referenceDate,
      description,
    });

  const addAssignment = (emp, shift, skillId, createdAt) => {
    const id = ids.assignment(shift.shift_date.slice(0, 4), ctx.nextAssignment());
    const row = {
      assignment_id: id,
      shift_id: shift.shift_id,
      employee_id: emp.employee_id,
      team_id: emp.team_id,
      skill_id: skillId,
      source: 'ROSTER',
      swap_id: null,
      supersedes_assignment_id: null,
      created_at: createdAt,
      status: 'SCHEDULED',
    };
    t.shift_assignment.push(row);
    t.shift_assignment_event.push({
      event_id: ids.lifecycleEvent(id, 1),
      assignment_id: id,
      event_seq: 1,
      from_status: null,
      to_status: 'SCHEDULED',
      event_at: createdAt,
      actor_role: 'SYSTEM',
      actor_employee_id: null,
      reason_code: 'ROSTER_PUBLISHED',
      leave_request_id: null,
      swap_id: null,
    });
    const list = ctx.active.get(emp.employee_id) ?? [];
    list.push(row);
    ctx.active.set(emp.employee_id, list);
    return row;
  };

  const attendanceId = (employeeId, ms) => {
    let at = ms;
    let id = ids.attendanceEvent(employeeId, timestampFromMs(at));
    while (ctx.attendanceIds.has(id)) {
      at += 1000;
      id = ids.attendanceEvent(employeeId, timestampFromMs(at));
    }
    ctx.attendanceIds.add(id);
    return { id, at: timestampFromMs(at) };
  };

  // The person cannot be in two places (or is on leave), so the extra booking is a no-show.
  const addNoShow = (assignment, shift) => {
    const { id, at } = attendanceId(assignment.employee_id, shift.endMs);
    t.attendance_event.push({
      attendance_event_id: id,
      employee_id: assignment.employee_id,
      assignment_id: assignment.assignment_id,
      event_type: 'NO_SHOW',
      event_at: at,
      source: 'SYSTEM',
      recorded_at: at,
      recorded_by_employee_id: null,
    });
  };

  /** Moves an assignment's CLOCK_OUT by `minutes`; returns the new attendance event ID. */
  const moveClockOut = (assignmentId, minutes) => {
    const index = t.attendance_event.findIndex(
      (e) => e.assignment_id === assignmentId && e.event_type === 'CLOCK_OUT',
    );
    const old = t.attendance_event[index];
    ctx.attendanceIds.delete(old.attendance_event_id);
    const lag = timestampMs(old.recorded_at) - timestampMs(old.event_at);
    const { id, at } = attendanceId(
      old.employee_id,
      timestampMs(old.event_at) + minutes * MINUTE_MS,
    );
    t.attendance_event[index] = {
      ...old,
      attendance_event_id: id,
      event_at: at,
      recorded_at: timestampFromMs(timestampMs(at) + lag),
    };
    return id;
  };

  const n = profile.anomaliesPerType;
  const nb = profile.boundaryCasesPerType;
  const pick = (stream, list) => rng.fork(stream).shuffle(list);
  const operational = (emp) => ctx.teams.get(emp.team_id).team_function !== 'WORKFORCE_OFFICE';
  const activeRows = () =>
    t.shift_assignment.filter(
      (a) => a.status === 'SCHEDULED' && outcomeOf(ctx, a.assignment_id) === 'PRESENT',
    );

  // DOUBLE_BOOKED — the same shift booked twice (rest and consecutive days stay unchanged).
  let count = 0;
  for (const a of pick('double-booked', activeRows())) {
    if (count === n) break;
    const emp = ctx.employees.get(a.employee_id);
    const shift = ctx.shifts.get(a.shift_id);
    const minutes = (shift.endMs - shift.startMs) / MINUTE_MS;
    if (!free(emp.employee_id) || !operational(emp)) continue;
    if (
      scheduledMinutesInWeek(ctx, emp.employee_id, shift.iso_week) + minutes >
      limitsFor(ctx, emp, shift.iso_week).scheduledMinutes
    )
      continue;
    const otherSkill = [...(ctx.teamSkills.get(emp.team_id) ?? [])].find(
      (s) => s !== a.skill_id && holds(ctx, emp.employee_id, s, shift.shift_date),
    );
    const extra = addAssignment(emp, shift, otherSkill ?? a.skill_id, a.created_at);
    addNoShow(extra, shift);
    take(emp.employee_id);
    label(
      'ANOMALY',
      'DOUBLE_BOOKED',
      'R-SCH-01',
      'shift_assignment',
      [a.assignment_id, extra.assignment_id],
      emp.employee_id,
      shift.shift_date,
      `Booked twice on ${shift.shift_id}`,
    );
    count++;
  }

  // LEAVE_OVERLAP — a shift added inside an approved leave; the leave itself is untouched.
  count = 0;
  for (const leave of pick(
    'leave-overlap',
    t.leave_request.filter((l) => l.status === 'APPROVED'),
  )) {
    if (count === n) break;
    const emp = ctx.employees.get(leave.employee_id);
    if (!free(emp.employee_id) || !operational(emp)) continue;
    const templates = ctx.patterns[ctx.teams.get(emp.team_id).operating_pattern].templates;
    const options = [];
    for (let date = leave.start_date; date <= leave.end_date; date = addDays(date, 1)) {
      for (const template of templates) {
        const shift = ctx.shifts.get(ids.shift(date, template));
        const skill = [...(ctx.teamSkills.get(emp.team_id) ?? [])].find((s) =>
          holds(ctx, emp.employee_id, s, date),
        );
        if (shift && skill && fitsRoster(ctx, emp, shift)) options.push({ shift, skill });
      }
    }
    if (options.length === 0) continue;
    const { shift, skill } = rng.fork(`leave-overlap/${leave.leave_request_id}`).pick(options);
    const extra = addAssignment(emp, shift, skill, ctx.publication.get(shift.iso_week));
    addNoShow(extra, shift);
    take(emp.employee_id);
    label(
      'ANOMALY',
      'LEAVE_OVERLAP',
      'R-SCH-02',
      'shift_assignment',
      [extra.assignment_id, leave.leave_request_id],
      emp.employee_id,
      shift.shift_date,
      `Assigned on ${shift.shift_date} during approved leave ${leave.leave_request_id}`,
    );
    count++;
  }

  // SKILL_ABSENT — an assignment switched to a team skill the employee does not hold.
  count = 0;
  for (const a of pick('skill-absent', activeRows())) {
    if (count === n) break;
    const emp = ctx.employees.get(a.employee_id);
    const date = ctx.shifts.get(a.shift_id).shift_date;
    if (!free(emp.employee_id) || !operational(emp)) continue;
    const missing = [...(ctx.teamSkills.get(emp.team_id) ?? [])].find(
      (s) => !holds(ctx, emp.employee_id, s, date),
    );
    if (!missing) continue;
    const index = t.shift_assignment.indexOf(a);
    t.shift_assignment[index] = { ...a, skill_id: missing };
    take(emp.employee_id);
    label(
      'ANOMALY',
      'SKILL_ABSENT',
      'R-SCH-03',
      'shift_assignment',
      [a.assignment_id],
      emp.employee_id,
      date,
      `Covers ${missing} without holding it`,
    );
    count++;
  }

  // Employee-weeks with a full 7 employed days and every shift worked with a punch pair.
  const fullWeeks = [];
  for (const [employeeId, list] of ctx.active) {
    const emp = ctx.employees.get(employeeId);
    for (const [week, weekList] of Map.groupBy(list, (a) => ctx.shifts.get(a.shift_id).iso_week)) {
      if (employedDaysInWeek(emp, ctx.weekDates.get(week)) !== 7) continue;
      if (!weekList.every((a) => outcomeOf(ctx, a.assignment_id) === 'PRESENT')) continue;
      let worked = 0;
      for (const a of weekList) {
        const events = ctx.attendance.get(a.assignment_id);
        worked += workedMinutes(
          ctx.shifts.get(a.shift_id),
          events.find((e) => e.event_type === 'CLOCK_IN').event_at,
          events.find((e) => e.event_type === 'CLOCK_OUT').event_at,
        );
      }
      const last = weekList.at(-1);
      const lastOut = ctx.attendance
        .get(last.assignment_id)
        .find((e) => e.event_type === 'CLOCK_OUT');
      if (lastOut.source === 'MANUAL') continue;
      const gap = limitsFor(ctx, emp, week).workedMinutes - worked;
      if (gap >= 0) fullWeeks.push({ emp, week, last, gap });
    }
  }

  // OVERTIME_CAP_EXCEEDED — the week's last clock-out moved past the remaining overtime budget.
  count = 0;
  const overtimeCandidates = pick(
    'overtime',
    fullWeeks.filter((w) => w.gap <= 240),
  );
  for (const w of [...overtimeCandidates, ...fullWeeks.toSorted((a, b) => a.gap - b.gap)]) {
    if (count === n) break;
    if (!free(w.emp.employee_id) || !operational(w.emp)) continue;
    const over = rng.fork(`overtime/${w.emp.employee_id}/${w.week}`).int(15, 90);
    const attId = moveClockOut(w.last.assignment_id, w.gap + over);
    take(w.emp.employee_id);
    const shift = ctx.shifts.get(w.last.shift_id);
    label(
      'ANOMALY',
      'OVERTIME_CAP_EXCEEDED',
      'R-OVT-02',
      'attendance_event',
      [w.last.assignment_id, attId],
      w.emp.employee_id,
      shift.shift_date,
      `Clock-out moved ${w.gap + over} min later: weekly overtime ${over} min above the cap in ${w.week}`,
    );
    count++;
  }

  // SWAP_WITHOUT_APPROVAL — the APPROVED event removed; the chain now goes REQUESTED → APPLIED.
  count = 0;
  const swapEvents = Map.groupBy(t.swap_request_event, (e) => e.swap_id);
  const appliedSwaps = t.swap_request.filter((s) => s.status === 'APPLIED');
  for (const swap of pick('swap-without-approval', appliedSwaps)) {
    if (count === n) break;
    if (!free(swap.requester_employee_id, swap.counterpart_employee_id)) continue;
    const kept = swapEvents
      .get(swap.swap_id)
      .filter((e) => e.to_status !== 'APPROVED')
      .sort((a, b) => a.event_seq - b.event_seq);
    t.swap_request_event = t.swap_request_event.filter((e) => e.swap_id !== swap.swap_id);
    kept.forEach((e, i) => {
      t.swap_request_event.push({
        ...e,
        event_id: ids.lifecycleEvent(swap.swap_id, i + 1),
        event_seq: i + 1,
        from_status: i === 0 ? null : kept[i - 1].to_status,
      });
    });
    const index = t.swap_request.indexOf(swap);
    t.swap_request[index] = {
      ...swap,
      decided_at: null,
      decided_by_role: null,
      decided_by_employee_id: null,
      decision_rule_id: null,
      decision_reason_code: null,
    };
    take(swap.requester_employee_id, swap.counterpart_employee_id);
    label(
      'ANOMALY',
      'SWAP_WITHOUT_APPROVAL',
      'R-SWP-06',
      'swap_request',
      [swap.swap_id],
      swap.requester_employee_id,
      swap.requested_at.slice(0, 10),
      'Swap applied with no APPROVED event (the chain also breaks R-SWP-08)',
    );
    count++;
  }

  // ---- Boundary cases: valid values exactly at a limit; detectors must not flag them. ----

  // Overtime exactly at the cap.
  count = 0;
  for (const w of pick(
    'boundary-overtime',
    fullWeeks.filter((x) => x.gap <= 240),
  )) {
    if (count === nb) break;
    if (!free(w.emp.employee_id) || !operational(w.emp)) continue;
    const attId =
      w.gap > 0
        ? moveClockOut(w.last.assignment_id, w.gap)
        : ctx.attendance.get(w.last.assignment_id).find((e) => e.event_type === 'CLOCK_OUT')
            .attendance_event_id;
    take(w.emp.employee_id);
    const shift = ctx.shifts.get(w.last.shift_id);
    const cap = ctx.policies.get(w.emp.policy_id).weekly_overtime_cap_hours;
    label(
      'BOUNDARY',
      'BOUNDARY_OVERTIME_AT_CAP',
      'R-OVT-02',
      'attendance_event',
      [w.last.assignment_id, attId],
      w.emp.employee_id,
      shift.shift_date,
      `Weekly overtime exactly ${cap} h (the cap) in ${w.week}`,
    );
    count++;
  }

  // Approved leave ending the day before an assigned shift (found in the data, unchanged).
  count = 0;
  for (const leave of pick(
    'boundary-leave',
    t.leave_request.filter((l) => l.status === 'APPROVED'),
  )) {
    if (count === nb) break;
    if (!free(leave.employee_id)) continue;
    const next = addDays(leave.end_date, 1);
    const after = (ctx.active.get(leave.employee_id) ?? []).find(
      (a) => ctx.shifts.get(a.shift_id).shift_date === next,
    );
    if (!after) continue;
    take(leave.employee_id);
    label(
      'BOUNDARY',
      'BOUNDARY_LEAVE_ADJACENT_SHIFT',
      'R-SCH-02',
      'shift_assignment',
      [leave.leave_request_id, after.assignment_id],
      leave.employee_id,
      next,
      `Leave ends ${leave.end_date}; works on ${next}`,
    );
    count++;
  }

  // Exactly the maximum number of consecutive working days (found in the data, unchanged).
  count = 0;
  for (const [employeeId, list] of pick('boundary-consecutive', [...ctx.active])) {
    if (count === nb) break;
    if (!free(employeeId)) continue;
    const max = ctx.policies.get(ctx.employees.get(employeeId).policy_id).max_consecutive_days;
    const byDate = new Map(list.map((a) => [ctx.shifts.get(a.shift_id).shift_date, a]));
    const dates = [...byDate.keys()].sort();
    let runStart = 0;
    for (let i = 1; i <= dates.length; i++) {
      if (i < dates.length && dates[i] === addDays(dates[i - 1], 1)) continue;
      if (i - runStart === max) {
        const run = dates.slice(runStart, i);
        take(employeeId);
        label(
          'BOUNDARY',
          'BOUNDARY_CONSECUTIVE_DAYS_AT_MAX',
          'R-SCH-07',
          'shift_assignment',
          run.map((d) => byDate.get(d).assignment_id),
          employeeId,
          run[0],
          `Works exactly ${max} consecutive days from ${run[0]}`,
        );
        count++;
        break;
      }
      runStart = i;
    }
  }

  // Swap requested exactly at the 24-hour notice limit and still approved.
  count = 0;
  const assignmentsById = new Map(t.shift_assignment.map((a) => [a.assignment_id, a]));
  for (const swap of pick(
    'boundary-swap',
    t.swap_request.filter((s) => s.status === 'APPLIED' && s.decided_at !== null),
  )) {
    if (count === nb) break;
    if (!free(swap.requester_employee_id, swap.counterpart_employee_id)) continue;
    const given = assignmentsById.get(swap.requester_assignment_id);
    const taken = swap.counterpart_assignment_id
      ? assignmentsById.get(swap.counterpart_assignment_id)
      : null;
    const earliest = Math.min(
      ctx.shifts.get(given.shift_id).startMs,
      taken ? ctx.shifts.get(taken.shift_id).startMs : Infinity,
    );
    const requestedAt = timestampFromMs(earliest - POLICY.swap.minNoticeHours * HOUR_MS);
    const latestCreated =
      taken && taken.created_at > given.created_at ? taken.created_at : given.created_at;
    if (
      requestedAt > swap.decided_at ||
      requestedAt < latestCreated ||
      requestedAt.slice(0, 4) !== swap.swap_id.slice(4, 8)
    )
      continue;
    t.swap_request[t.swap_request.indexOf(swap)] = { ...swap, requested_at: requestedAt };
    const first = t.swap_request_event.findIndex(
      (e) => e.swap_id === swap.swap_id && e.event_seq === 1,
    );
    t.swap_request_event[first] = { ...t.swap_request_event[first], event_at: requestedAt };
    take(swap.requester_employee_id, swap.counterpart_employee_id);
    label(
      'BOUNDARY',
      'BOUNDARY_SWAP_AT_NOTICE_LIMIT',
      'R-SWP-04',
      'swap_request',
      [swap.swap_id],
      swap.requester_employee_id,
      requestedAt.slice(0, 10),
      `Requested exactly ${POLICY.swap.minNoticeHours} h before the shift and approved`,
    );
    count++;
  }

  const byKey = (key) => (a, b) => a[key].localeCompare(b[key]);
  t.shift_assignment.sort(byKey('assignment_id'));
  t.shift_assignment_event.sort(byKey('event_id'));
  t.attendance_event.sort(byKey('attendance_event_id'));
  t.swap_request_event.sort(byKey('event_id'));

  const groundTruth = labels.map((l, i) => ({
    ground_truth_id: ids.groundTruth(i + 1),
    label_class: l.labelClass,
    issue_type: l.issueType,
    rule_id: l.ruleId,
    primary_table: l.table,
    record_ids: [...l.recordIds].sort().join(';'),
    employee_id: l.employeeId,
    reference_date: l.referenceDate,
    expected_detection: l.labelClass === 'ANOMALY' ? 1 : 0,
    description: l.description,
  }));
  return { tables: t, groundTruth };
}

/** Boundary labels the configured shift templates cannot produce (documented, tested in units). */
export const UNREACHABLE_BOUNDARIES = Object.freeze({
  BOUNDARY_REST_AT_MINIMUM:
    'No two templates within one operating pattern are exactly 11 h apart (A/B/C: 8 h or 16 h; G: 16 h); the exact-minimum case is covered by a scheduler unit test (B → G).',
});
