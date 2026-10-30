// Transaction and event tables, built on top of the master data:
// leave requests and their decisions → timeline (rosters, backfills, swaps) → attendance.
// IDs are assigned at the end in creation order (leave by submission time; assignments and
// swaps in the timeline's chronological order), then every object is written as rows.

import { createCounter, ids } from '../../lib/ids.js';
import { timestampFromMs } from '../../lib/dates.js';
import { createRng } from '../../lib/rng.js';
import { generateAttendance } from './attendance.js';
import { decideLeaves, generateLeaveRequests, leaveContext, plannedCancellation } from './leave.js';
import { runTimeline } from './timeline.js';

const ts = (ms) => (ms === null || ms === undefined ? null : timestampFromMs(ms));

export function generateTransactions(config, master) {
  const { profile, window } = master;
  const t = Object.fromEntries(master.tables);
  const rng = createRng(config.seed, 'transactions');

  const requests = generateLeaveRequests({
    config,
    profile,
    window,
    employees: t.employee,
    rng: rng.fork('leave-requests'),
  });
  const decisions = decideLeaves(
    requests,
    leaveContext({ teams: t.team, employees: t.employee, entitlementRows: t.leave_entitlement }),
    plannedCancellation(config.leaveBehaviour.cancelShare),
  );
  const leaves = requests.map((request) => ({ request, decision: decisions.get(request) }));

  const { state, assignments, swaps, stats } = runTimeline({
    config,
    profile,
    window,
    master: {
      teams: t.team,
      employees: t.employee,
      employeeSkills: t.employee_skill,
      policiesById: new Map(t.labor_policy.map((p) => [p.policy_id, p])),
      shifts: t.shift,
      shiftTemplates: t.shift_template,
      coverageRows: t.coverage_requirement,
    },
    leaves,
    rng: rng.fork('timeline'),
  });

  const rejectedSick = Map.groupBy(
    leaves
      .filter((l) => l.request.leaveType === 'SICK' && l.decision.status === 'REJECTED')
      .map((l) => l.request),
    (r) => r.employee.employee_id,
  );
  const attendance = generateAttendance({
    config,
    state,
    assignments,
    rejectedSickLeave: rejectedSick,
    opsPartners: t.employee
      .filter((e) => e.employee_role === 'OPS_PARTNER')
      .map((e) => e.employee_id),
    rng: rng.fork('attendance'),
  });

  // --- IDs ---------------------------------------------------------------------------------
  const leaveId = new Map();
  const nextLeave = createCounter();
  for (const r of [...requests].sort((a, b) => a.submittedMs - b.submittedMs || a.seq - b.seq)) {
    const year = r.startDate.slice(0, 4);
    leaveId.set(r, ids.leaveRequest(year, nextLeave(year)));
  }
  const assignmentId = new Map();
  const nextAssignment = createCounter();
  for (const a of assignments) {
    const year = a.shift.date.slice(0, 4);
    assignmentId.set(a, ids.assignment(year, nextAssignment(year)));
  }
  const swapId = new Map();
  const nextSwap = createCounter();
  for (const s of swaps) {
    const year = timestampFromMs(s.requestedMs).slice(0, 4);
    swapId.set(s, ids.swapRequest(year, nextSwap(year)));
  }

  // --- Leave -------------------------------------------------------------------------------
  const leaveRows = [];
  const leaveEventRows = [];
  for (const { request: r, decision: d } of leaves) {
    const id = leaveId.get(r);
    const employeeId = r.employee.employee_id;
    const decided = d.status !== 'WITHDRAWN';
    leaveRows.push({
      leave_request_id: id,
      employee_id: employeeId,
      leave_type: r.leaveType,
      start_date: r.startDate,
      end_date: r.endDate,
      requested_days: r.days,
      submitted_at: ts(r.submittedMs),
      status: d.status,
      decided_at: decided ? ts(d.decidedMs) : null,
      decided_by_role: decided ? d.decidedByRole : null,
      decided_by_employee_id: decided ? d.decidedBy : null,
      decision_rule_id: decided ? d.ruleId : null,
      decision_reason_code: decided ? d.reasonCode : null,
    });

    const chain = [[null, 'SUBMITTED', r.submittedMs, 'EMPLOYEE', employeeId, null, null]];
    if (!decided) {
      chain.push([
        'SUBMITTED',
        'WITHDRAWN',
        d.withdrawnMs,
        'EMPLOYEE',
        employeeId,
        'R-LVE-10',
        'EMPLOYEE_WITHDREW',
      ]);
    } else {
      const outcome = d.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      chain.push([
        'SUBMITTED',
        outcome,
        d.decidedMs,
        d.decidedByRole,
        d.decidedBy,
        d.ruleId,
        d.reasonCode,
      ]);
      if (d.status === 'CANCELLED') {
        chain.push([
          'APPROVED',
          'CANCELLED',
          d.cancelledMs,
          'EMPLOYEE',
          employeeId,
          'R-LVE-10',
          'EMPLOYEE_CANCELLED',
        ]);
      }
    }
    chain.forEach(([from, to, ms, role, actor, ruleId, reasonCode], i) => {
      leaveEventRows.push({
        event_id: ids.lifecycleEvent(id, i + 1),
        leave_request_id: id,
        event_seq: i + 1,
        from_status: from,
        to_status: to,
        event_at: ts(ms),
        actor_role: role,
        actor_employee_id: actor,
        rule_id: ruleId,
        reason_code: reasonCode,
      });
    });
  }

  // --- Assignments ---------------------------------------------------------------------------
  const assignmentRows = [];
  const assignmentEventRows = [];
  for (const a of assignments) {
    const id = assignmentId.get(a);
    assignmentRows.push({
      assignment_id: id,
      shift_id: a.shift.id,
      employee_id: a.employee.id,
      team_id: a.teamId,
      skill_id: a.skillId,
      source: a.source,
      swap_id: a.swap ? swapId.get(a.swap) : null,
      supersedes_assignment_id: a.supersedes ? assignmentId.get(a.supersedes) : null,
      created_at: ts(a.createdMs),
      status: a.status,
    });
    a.events.forEach((e, i) => {
      assignmentEventRows.push({
        event_id: ids.lifecycleEvent(id, i + 1),
        assignment_id: id,
        event_seq: i + 1,
        from_status: e.from,
        to_status: e.to,
        event_at: ts(e.ms),
        actor_role: 'SYSTEM',
        actor_employee_id: null,
        reason_code: e.reason,
        leave_request_id: e.leave ? leaveId.get(e.leave) : null,
        swap_id: e.swap ? swapId.get(e.swap) : null,
      });
    });
  }

  // --- Swaps ---------------------------------------------------------------------------------
  const swapRows = [];
  const swapEventRows = [];
  for (const s of swaps) {
    const id = swapId.get(s);
    swapRows.push({
      swap_id: id,
      swap_type: s.type,
      team_id: s.teamId,
      requester_employee_id: s.requester.id,
      requester_assignment_id: assignmentId.get(s.requesterAssignment),
      counterpart_employee_id: s.counterpart.id,
      counterpart_assignment_id: s.counterpartAssignment
        ? assignmentId.get(s.counterpartAssignment)
        : null,
      requested_at: ts(s.requestedMs),
      status: s.status,
      decided_at: ts(s.decidedMs),
      decided_by_role: s.decidedByRole,
      decided_by_employee_id: s.decidedBy,
      decision_rule_id: s.ruleId,
      decision_reason_code: s.reasonCode,
      applied_at: ts(s.appliedMs),
    });
    s.events.forEach((e, i) => {
      swapEventRows.push({
        event_id: ids.lifecycleEvent(id, i + 1),
        swap_id: id,
        event_seq: i + 1,
        from_status: e.from,
        to_status: e.to,
        event_at: ts(e.ms),
        actor_role: e.role,
        actor_employee_id: e.actor,
        rule_id: e.ruleId,
        reason_code: e.reasonCode,
      });
    });
  }

  const attendanceRows = attendance
    .map((row) => ({ ...row, assignment_id: assignmentId.get(row.assignment_id) }))
    .sort((a, b) => a.attendance_event_id.localeCompare(b.attendance_event_id));

  const byId = (key) => (a, b) => a[key].localeCompare(b[key]);
  return {
    stats,
    // Load order: swap_request after shift_assignment (its swap_id FK is deferred).
    tables: [
      ['leave_request', leaveRows.sort(byId('leave_request_id'))],
      ['leave_request_event', leaveEventRows.sort(byId('event_id'))],
      ['shift_assignment', assignmentRows],
      ['swap_request', swapRows],
      ['swap_request_event', swapEventRows],
      ['shift_assignment_event', assignmentEventRows],
      ['attendance_event', attendanceRows],
    ],
  };
}
