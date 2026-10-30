// Decision checks: are the recorded outcomes the ones the documented rules produce?
//   D-01 leave — the full decision engine (R-LVE-01 … R-LVE-07) is replayed on the exported
//        requests, with withdrawal and cancellation times taken from the exported events.
//   D-02 swaps — every decision is checked against the rules that can be verified from the
//        records alone (team, skills, notice, deadline, application window, links). Reasons that
//        depend on the live roster (rest, double booking, leave, weekly hours) are only checked
//        for consistency with the earlier rules in the evaluation order.

import { POLICY } from '../domain/rules.js';
import { decideLeaves, leaveContext } from '../generator/transactions/leave.js';
import { timestampFromMs, timestampMs } from '../lib/dates.js';

const SAMPLE_LIMIT = 5;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function collector(id, name) {
  const result = { id, name, checked: 0, failures: 0, samples: [] };
  return {
    result,
    check: (ok, message) => {
      result.checked += 1;
      if (ok) return;
      result.failures += 1;
      if (result.samples.length < SAMPLE_LIMIT) result.samples.push(message);
    },
  };
}

export function replayLeaveDecisions(t) {
  const c = collector(
    'D-01',
    'Leave decisions replay exactly from the rules (R-LVE-01 … R-LVE-07)',
  );
  const employees = new Map(t.employee.map((e) => [e.employee_id, e]));
  const events = Map.groupBy(t.leave_request_event, (e) => e.leave_request_id);
  const eventAt = (id, status) => {
    const event = (events.get(id) ?? []).find((e) => e.to_status === status);
    return event ? timestampMs(event.event_at) : null;
  };
  // Leave IDs follow submission order, which is the generator's tie-break order too.
  const requests = t.leave_request.map((l, seq) => ({
    seq,
    row: l,
    employee: employees.get(l.employee_id),
    leaveType: l.leave_type,
    startDate: l.start_date,
    endDate: l.end_date,
    days: l.requested_days,
    submittedMs: timestampMs(l.submitted_at),
    decidedMs: l.decided_at ? timestampMs(l.decided_at) : null,
    withdrawnMs: eventAt(l.leave_request_id, 'WITHDRAWN'),
    cancelledMs: eventAt(l.leave_request_id, 'CANCELLED'),
  }));
  const decisions = decideLeaves(
    requests,
    leaveContext({ teams: t.team, employees: t.employee, entitlementRows: t.leave_entitlement }),
    (request) => request.cancelledMs,
  );
  for (const request of requests) {
    const d = decisions.get(request);
    const row = request.row;
    const expected =
      d.status === 'WITHDRAWN'
        ? ['WITHDRAWN', null, null, null, null]
        : [d.status, d.decidedByRole, d.decidedBy, d.ruleId, d.reasonCode];
    const actual = [
      row.status,
      row.decided_by_role,
      row.decided_by_employee_id,
      row.decision_rule_id,
      row.decision_reason_code,
    ];
    c.check(
      expected.every((value, i) => value === actual[i]),
      `${row.leave_request_id}: recorded ${actual.join('/')} but the rules give ${expected.join('/')}`,
    );
  }
  return c.result;
}

export function checkSwapDecisions(t) {
  const c = collector('D-02', 'Swap decisions consistent with R-SWP-01 … R-SWP-07');
  const assignments = new Map(t.shift_assignment.map((a) => [a.assignment_id, a]));
  const shifts = new Map(t.shift.map((s) => [s.shift_id, s]));
  const employees = new Map(t.employee.map((e) => [e.employee_id, e]));
  const teams = new Map(t.team.map((x) => [x.team_id, x]));
  const skillRows = Map.groupBy(t.employee_skill, (s) => `${s.employee_id}|${s.skill_id}`);
  const holds = (employeeId, skillId, date) =>
    (skillRows.get(`${employeeId}|${skillId}`) ?? []).some(
      (s) => s.valid_from <= date && (s.valid_to === null || date <= s.valid_to),
    );
  const created = Map.groupBy(
    t.shift_assignment.filter((a) => a.swap_id),
    (a) => a.swap_id,
  );
  const firstEvent = new Map(
    t.swap_request_event.filter((e) => e.event_seq === 1).map((e) => [e.swap_id, e]),
  );

  for (const s of t.swap_request) {
    const given = assignments.get(s.requester_assignment_id);
    const taken = s.counterpart_assignment_id ? assignments.get(s.counterpart_assignment_id) : null;
    const givenShift = shifts.get(given.shift_id);
    const takenShift = taken ? shifts.get(taken.shift_id) : null;
    const earliestMs = Math.min(
      timestampMs(givenShift.start_at),
      takenShift ? timestampMs(takenShift.start_at) : Infinity,
    );
    const requestedMs = timestampMs(s.requested_at);
    const deadline = timestampFromMs(
      Math.min(requestedMs + POLICY.swap.decisionDeadlineHours * HOUR_MS, earliestMs),
    );
    const sameTeam =
      employees.get(s.counterpart_employee_id).team_id === s.team_id &&
      given.team_id === s.team_id &&
      (!taken || taken.team_id === s.team_id);
    const skillsHeld =
      holds(s.counterpart_employee_id, given.skill_id, givenShift.shift_date) &&
      (!taken || holds(s.requester_employee_id, taken.skill_id, takenShift.shift_date));
    const noticeOk = requestedMs <= earliestMs - POLICY.swap.minNoticeHours * HOUR_MS;
    const manager = teams.get(s.team_id).manager_employee_id;
    const id = s.swap_id;

    c.check(
      firstEvent.get(id)?.event_at === s.requested_at,
      `${id}: REQUESTED event time differs from requested_at`,
    );
    if (s.decided_at !== null)
      c.check(s.decided_at <= deadline, `${id}: decided after the deadline ${deadline}`);

    if (s.status === 'EXPIRED') {
      c.check(
        s.decided_at === deadline && s.decided_by_role === 'SYSTEM',
        `${id}: expiry not recorded at the deadline by SYSTEM`,
      );
    } else if (s.decision_reason_code === 'APPROVED_WITHIN_POLICY') {
      c.check(
        sameTeam && skillsHeld && noticeOk,
        `${id}: approved although team, skill or notice rules fail`,
      );
      c.check(
        s.decided_by_role === 'MANAGER' && s.decided_by_employee_id === manager,
        `${id}: not approved by the team manager`,
      );
    } else if (s.status === 'REJECTED') {
      c.check(s.decided_by_employee_id === manager, `${id}: not rejected by the team manager`);
      const reason = s.decision_reason_code;
      if (reason === 'NOT_SAME_TEAM')
        c.check(!sameTeam, `${id}: rejected NOT_SAME_TEAM but the team matches`);
      else if (reason === 'SKILL_NOT_HELD')
        c.check(sameTeam && !skillsHeld, `${id}: SKILL_NOT_HELD inconsistent with the skills`);
      else if (reason === 'INSUFFICIENT_NOTICE')
        c.check(sameTeam && skillsHeld && !noticeOk, `${id}: INSUFFICIENT_NOTICE inconsistent`);
      // ASSIGNMENT_CHANGED is evaluated before every other rule, so nothing else is implied.
      else if (reason !== 'ASSIGNMENT_CHANGED')
        c.check(
          sameTeam && skillsHeld,
          `${id}: ${reason} recorded although an earlier rule already fails`,
        );
    }

    if (s.status === 'APPLIED' && s.decided_at !== null) {
      const appliedMs = timestampMs(s.applied_at);
      c.check(
        appliedMs >= timestampMs(s.decided_at) &&
          appliedMs <= timestampMs(s.decided_at) + POLICY.swap.applyWithinMinutes * MINUTE_MS &&
          appliedMs < earliestMs,
        `${id}: applied outside the window after approval`,
      );
      const links = created.get(id) ?? [];
      c.check(
        links.length === (taken ? 2 : 1) &&
          links.some(
            (a) =>
              a.supersedes_assignment_id === given.assignment_id &&
              a.employee_id === s.counterpart_employee_id,
          ),
        `${id}: applied swap does not link the new assignments to the old ones`,
      );
      c.check(
        given.status === 'SWAPPED_OUT' && (!taken || taken.status === 'SWAPPED_OUT'),
        `${id}: original assignments not swapped out`,
      );
    }
  }
  return c.result;
}
