import { ENUMS } from '../../domain/constants.js';
import { POLICY } from '../../domain/rules.js';
import { addDays, dateMs, daysBetween, timestampFromMs } from '../../lib/dates.js';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);

function weightedPicker(items, weights) {
  const prefix = [];
  let total = 0;
  for (const weight of weights) prefix.push((total += weight));
  return (rng) => {
    const target = rng.next() * total;
    let lo = 0;
    let hi = prefix.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefix[mid] > target) hi = mid;
      else lo = mid + 1;
    }
    return items[lo];
  };
}

const minuteOfDay = (rng, fromHour, spanMinutes) =>
  (fromHour * 60 + rng.int(0, spanMinutes)) * MINUTE_MS + rng.int(0, 59) * 1000;

export function generateLeaveRequests({ config, profile, window, employees, rng }) {
  const behaviour = config.leaveBehaviour;
  const candidates = employees.filter((e) => SCHEDULABLE.has(e.employee_role));
  const pickEmployee = weightedPicker(
    candidates,
    candidates.map(() => Math.exp(rng.normal(0, behaviour.requesterSpread))),
  );
  const typeEntries = Object.entries(behaviour.typeShares);
  const durationEntries = Object.fromEntries(
    Object.entries(behaviour.durationDays).map(([type, d]) => [
      type,
      Object.entries(d).map(([days, share]) => [Number(days), share]),
    ]),
  );

  const requests = [];
  while (requests.length < profile.leaveRequests) {
    const employee = pickEmployee(rng);
    const leaveType = rng.weighted(typeEntries);
    let days = rng.weighted(durationEntries[leaveType]);

    // Joiners only ask from the day after they start; leavers only for dates starting before they go.
    const from =
      employee.hire_date >= window.startDate ? addDays(employee.hire_date, 1) : window.startDate;
    let lastStart = addDays(window.endDate, -(days - 1));
    if (employee.termination_date && employee.termination_date < lastStart)
      lastStart = employee.termination_date;
    if (from > lastStart) {
      days = daysBetween(from, window.endDate) + 1;
      lastStart = from;
      if (days < 1 || (employee.termination_date && employee.termination_date < from)) continue;
    }
    const startDate = addDays(from, rng.int(0, daysBetween(from, lastStart)));
    const endDate = addDays(startDate, days - 1);
    const startMs = dateMs(startDate);

    let submittedMs;
    if (leaveType === 'SICK') {
      // Sick call-ins arrive in the early morning of the first sick day, before the first shift.
      submittedMs = startMs + minuteOfDay(rng, 3, 150);
    } else {
      const notice = behaviour.noticeDays[leaveType];
      const short = rng.chance(behaviour.shortNoticeShare[leaveType]);
      let submittedDate = addDays(
        startDate,
        -(short ? rng.int(1, notice.min - 1) : rng.int(notice.min, notice.max)),
      );
      if (submittedDate < employee.hire_date) submittedDate = employee.hire_date;
      submittedMs = dateMs(submittedDate) + minuteOfDay(rng, 8, 660);
    }

    let decidedMs = submittedMs;
    let withdrawnMs = null;
    if (leaveType !== 'SICK') {
      const delay =
        rng.float(behaviour.decisionDelayHours.min, behaviour.decisionDelayHours.max) * HOUR_MS;
      decidedMs = Math.max(
        submittedMs + MINUTE_MS,
        Math.min(submittedMs + delay, startMs - MINUTE_MS),
      );
      if (rng.chance(behaviour.withdrawShare)) {
        withdrawnMs = submittedMs + Math.round(rng.float(0.1, 0.9) * (decidedMs - submittedMs));
      }
    }

    requests.push({
      seq: requests.length,
      employee,
      leaveType,
      startDate,
      endDate,
      days,
      submittedMs,
      decidedMs: withdrawnMs === null ? decidedMs : null,
      withdrawnMs,
      cancelRoll: rng.next(),
      cancelPoint: rng.float(0.05, 0.95),
    });
  }
  return requests;
}

export function plannedCancellation(cancelShare) {
  return (request, decidedMs) => {
    if (request.leaveType === 'SICK' || request.cancelRoll >= cancelShare) return null;
    const latest = dateMs(request.startDate) - HOUR_MS;
    if (latest <= decidedMs) return null;
    return decidedMs + Math.round(request.cancelPoint * (latest - decidedMs));
  };
}

/**
 * Applies R-LVE-01 … R-LVE-07 in decision-time order (ties: submission time, then sequence),
 * so balance and team-cap checks only see decisions made earlier. A leave cancelled before a
 * later decision no longer counts for it (R-LVE-10).
 */
export function decideLeaves(requests, context, cancellationFor) {
  const { teamsById, entitlements, schedulableByTeam } = context;
  const capByTeamDate = new Map();
  const teamCap = (teamId, date) => {
    const key = `${teamId}|${date}`;
    if (!capByTeamDate.has(key)) {
      const headcount = (schedulableByTeam.get(teamId) ?? []).filter(
        (e) => e.hire_date <= date && (e.termination_date === null || date <= e.termination_date),
      ).length;
      capByTeamDate.set(key, Math.max(1, Math.floor(POLICY.leave.teamLeaveCapRatio * headcount)));
    }
    return capByTeamDate.get(key);
  };

  const approvedByEmployee = new Map();
  const approvedByTeam = new Map();
  const byEmployee = Map.groupBy(requests, (r) => r.employee.employee_id);
  const activeAt = (record, ms) => record.cancelledMs === null || record.cancelledMs > ms;
  const overlaps = (a, b) => a.startDate <= b.endDate && b.startDate <= a.endDate;

  const order = requests
    .filter((r) => r.decidedMs !== null)
    .sort((a, b) => a.decidedMs - b.decidedMs || a.submittedMs - b.submittedMs || a.seq - b.seq);

  const decisions = new Map();
  for (const request of order) {
    const employee = request.employee;
    const team = teamsById.get(employee.team_id);
    const at = request.decidedMs;
    const own = (approvedByEmployee.get(employee.employee_id) ?? []).filter((r) => activeAt(r, at));

    let ruleId;
    let reasonCode;
    if (
      employee.hire_date > request.startDate ||
      (employee.termination_date !== null && employee.termination_date < request.endDate)
    ) {
      [ruleId, reasonCode] = ['R-LVE-01', 'EMPLOYEE_NOT_ACTIVE'];
    } else if (
      own.some((r) => overlaps(r.request, request)) ||
      (byEmployee.get(employee.employee_id) ?? []).some(
        (other) =>
          other !== request &&
          other.submittedMs < request.submittedMs &&
          overlaps(other, request) &&
          (other.decidedMs ?? other.withdrawnMs) > at,
      )
    ) {
      [ruleId, reasonCode] = ['R-LVE-02', 'OVERLAPS_EXISTING_LEAVE'];
    } else if (
      request.leaveType !== 'UNPAID' &&
      (entitlements.get(`${employee.employee_id}|${request.leaveType}`) ?? 0) -
        own
          .filter((r) => r.request.leaveType === request.leaveType)
          .reduce((sum, r) => sum + r.request.days, 0) <
        request.days
    ) {
      [ruleId, reasonCode] = ['R-LVE-03', 'INSUFFICIENT_BALANCE'];
    } else if (request.leaveType === 'SICK') {
      [ruleId, reasonCode] = ['R-LVE-04', 'SICK_AUTO_APPROVED'];
    } else if (
      daysBetween(timestampFromMs(request.submittedMs).slice(0, 10), request.startDate) <
      POLICY.leave.noticeDays[request.leaveType]
    ) {
      [ruleId, reasonCode] = ['R-LVE-05', 'INSUFFICIENT_NOTICE'];
    } else {
      const teamLeave = (approvedByTeam.get(team.team_id) ?? []).filter((r) => activeAt(r, at));
      let full = false;
      for (
        let date = request.startDate;
        date <= request.endDate && !full;
        date = addDays(date, 1)
      ) {
        const onLeave = teamLeave.filter(
          (r) => r.request.startDate <= date && date <= r.request.endDate,
        ).length;
        full = onLeave + 1 > teamCap(team.team_id, date);
      }
      [ruleId, reasonCode] = full
        ? ['R-LVE-06', 'TEAM_LEAVE_CAP_REACHED']
        : ['R-LVE-07', 'APPROVED_WITHIN_POLICY'];
    }

    const approved = ruleId === 'R-LVE-04' || ruleId === 'R-LVE-07';
    let decidedByRole = 'MANAGER';
    let decidedBy = team.manager_employee_id;
    if (request.leaveType === 'SICK') [decidedByRole, decidedBy] = ['SYSTEM', null];
    else if (request.days > POLICY.leave.hrApprovalAboveDays || request.leaveType === 'UNPAID') {
      [decidedByRole, decidedBy] = ['HR_PARTNER', team.hr_partner_employee_id];
    }

    const decision = {
      status: approved ? 'APPROVED' : 'REJECTED',
      decidedMs: at,
      decidedByRole,
      decidedBy,
      ruleId,
      reasonCode,
      cancelledMs: approved ? cancellationFor(request, at) : null,
    };
    if (decision.cancelledMs !== null) decision.status = 'CANCELLED';
    decisions.set(request, decision);

    if (approved) {
      const record = { request, cancelledMs: decision.cancelledMs };
      if (!approvedByEmployee.has(employee.employee_id))
        approvedByEmployee.set(employee.employee_id, []);
      approvedByEmployee.get(employee.employee_id).push(record);
      if (!approvedByTeam.has(team.team_id)) approvedByTeam.set(team.team_id, []);
      approvedByTeam.get(team.team_id).push(record);
    }
  }

  for (const request of requests) {
    if (request.withdrawnMs !== null) {
      decisions.set(request, { status: 'WITHDRAWN', withdrawnMs: request.withdrawnMs });
    }
  }
  return decisions;
}

export function leaveContext({ teams, employees, entitlementRows }) {
  return {
    teamsById: new Map(teams.map((t) => [t.team_id, t])),
    entitlements: new Map(
      entitlementRows.map((r) => [`${r.employee_id}|${r.leave_type}`, r.entitled_days]),
    ),
    schedulableByTeam: Map.groupBy(
      employees.filter((e) => SCHEDULABLE.has(e.employee_role)),
      (e) => e.team_id,
    ),
  };
}
