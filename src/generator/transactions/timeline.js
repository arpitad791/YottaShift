// Runs the scheduling workflow in time order on one event queue:
//   - weekly roster publication (R-SCH-10), 7 days before each ISO week;
//   - approved leave: overlapping published assignments are cancelled and backfilled when
//     someone eligible exists, otherwise the slot becomes a gap (R-LVE-09);
//   - swap requests against the roster as it stands, decided by the manager with the state at
//     decision time, expired, cancelled or applied (R-SWP-01 … R-SWP-08).
// Every state change is recorded as an event on the assignment or swap; nothing is overwritten.

import { POLICY } from '../../domain/rules.js';
import { addDays, dateMs, isoWeekday, timestampMs, toTimestamp } from '../../lib/dates.js';
import { MinHeap } from '../../lib/heap.js';
import { RosterState } from '../../scheduler/roster-state.js';
import {
  coverageIndex,
  pickCandidate,
  publishWeek,
  tiebreaker,
} from '../../scheduler/scheduler.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Same-time events: leave decisions first (a leave approved at publication time is honoured,
// R-SCH-10), then publication, then swap requests, then swap follow-ups.
const PRIORITY = { LEAVE: 0, PUBLISH: 1, SWAP_REQUEST: 2, SWAP_FOLLOW_UP: 3 };
// A cancelled shift starting sooner than this after the leave decision is not backfilled.
const MIN_BACKFILL_LEAD_MS = 30 * MINUTE_MS;

export function runTimeline({ config, profile, window, master, leaves, rng }) {
  const state = new RosterState({ window, ...master });
  for (const { request, decision } of leaves) {
    if (decision.status !== 'APPROVED' && decision.status !== 'CANCELLED') continue;
    state.employees.get(request.employee.employee_id).leaves.push({
      startDate: request.startDate,
      endDate: request.endDate,
      decidedMs: decision.decidedMs,
      cancelledMs: decision.cancelledMs,
    });
  }

  const operational = master.teams
    .filter((t) => t.team_function !== 'WORKFORCE_OFFICE')
    .map((t) => ({ ...t, templates: config.operatingPatterns[t.operating_pattern].templates }));
  const managerOf = new Map(master.teams.map((t) => [t.team_id, t.manager_employee_id]));
  const requirementsFor = coverageIndex(master.coverageRows);

  const queue = new MinHeap((a, b) => a.ms - b.ms || a.priority - b.priority || a.seq - b.seq);
  let queued = 0;
  const schedule = (ms, priority, run) => queue.push({ ms, priority, seq: queued++, run });

  const assignments = [];
  const createAssignment = ({
    emp,
    shift,
    teamId,
    skillId,
    createdMs,
    source,
    reason,
    swap = null,
    supersedes = null,
    leave = null,
  }) => {
    const assignment = {
      seq: assignments.length,
      employee: emp,
      shift,
      teamId,
      skillId,
      source,
      swap,
      supersedes,
      createdMs,
      status: 'SCHEDULED',
      events: [{ from: null, to: 'SCHEDULED', ms: createdMs, reason, leave, swap }],
    };
    assignments.push(assignment);
    state.add(assignment);
    return assignment;
  };
  const endAssignment = (assignment, to, ms, reason, { leave = null, swap = null } = {}) => {
    assignment.events.push({ from: assignment.status, to, ms, reason, leave, swap });
    assignment.status = to;
    state.remove(assignment);
  };

  // Weekly publication.
  for (const [week, dates] of state.weekDates) {
    const monday = addDays(dates[0], 1 - isoWeekday(dates[0]));
    const publishMs = timestampMs(
      toTimestamp(addDays(monday, -POLICY.roster.publishLeadDays), POLICY.roster.publishTime),
    );
    schedule(publishMs, PRIORITY.PUBLISH, () =>
      publishWeek(state, {
        week,
        publishMs,
        teams: operational,
        requirementsFor,
        rng: rng.fork(`publish/${week}`),
        assign: (slot) =>
          createAssignment({ ...slot, source: 'ROSTER', reason: 'ROSTER_PUBLISHED' }),
      }),
    );
  }

  // Approved leave cancels already-published assignments and tries to backfill them.
  const backfillRng = rng.fork('backfill');
  let backfilled = 0;
  for (const { request, decision } of leaves) {
    if (decision.status !== 'APPROVED' && decision.status !== 'CANCELLED') continue;
    schedule(decision.decidedMs, PRIORITY.LEAVE, (at) => {
      const emp = state.employees.get(request.employee.employee_id);
      const affected = emp.active.filter(
        (a) => a.shift.date >= request.startDate && a.shift.date <= request.endDate,
      );
      for (const cancelled of affected) {
        endAssignment(cancelled, 'CANCELLED', at, 'LEAVE_APPROVED', { leave: request });
        if (cancelled.shift.startMs - at < MIN_BACKFILL_LEAD_MS) continue;
        const replacement = pickCandidate(state, {
          candidates: state.byTeam.get(cancelled.teamId) ?? [],
          shift: cancelled.shift,
          skillId: cancelled.skillId,
          atMs: at,
          tiebreak: tiebreaker(backfillRng),
        });
        if (replacement === null) continue;
        backfilled += 1;
        createAssignment({
          emp: replacement,
          shift: cancelled.shift,
          teamId: cancelled.teamId,
          skillId: cancelled.skillId,
          createdMs: at,
          source: 'REPLACEMENT',
          reason: 'REPLACEMENT_FOR_LEAVE',
          supersedes: cancelled,
          leave: request,
        });
      }
    });
  }

  // Swaps.
  const behaviour = config.swapBehaviour;
  const swapRng = rng.fork('swaps');
  const windowStartMs = dateMs(window.startDate);
  const minLeadMs = behaviour.minLeadHours * HOUR_MS;
  const swaps = [];
  const locked = new Set();
  let unappliedApprovals = 0;

  const record = (swap, to, ms, role, actor, ruleId, reasonCode) => {
    swap.events.push({ from: swap.status, to, ms, role, actor, ruleId, reasonCode });
    swap.status = to;
  };
  const decide = (swap, ms, role, actor, ruleId, reasonCode, to) => {
    Object.assign(swap, {
      decidedMs: ms,
      decidedByRole: role,
      decidedBy: actor,
      ruleId,
      reasonCode,
    });
    record(swap, to, ms, role, actor, ruleId, reasonCode);
  };
  const release = (swap) => {
    locked.delete(swap.requesterAssignment);
    if (swap.counterpartAssignment) locked.delete(swap.counterpartAssignment);
  };

  /** First failing swap rule as [ruleId, reasonCode], or null when the swap is allowed. */
  const evaluate = (swap, ms) => {
    const {
      requester,
      counterpart,
      requesterAssignment: given,
      counterpartAssignment: taken,
    } = swap;
    if (given.status !== 'SCHEDULED' || (taken && taken.status !== 'SCHEDULED')) {
      return ['R-SWP-03', 'ASSIGNMENT_CHANGED'];
    }
    if (counterpart.teamId !== swap.teamId || (taken && taken.teamId !== swap.teamId)) {
      return ['R-SWP-01', 'NOT_SAME_TEAM'];
    }
    if (
      !state.holdsSkill(counterpart, given.skillId, given.shift.date) ||
      (taken && !state.holdsSkill(requester, taken.skillId, taken.shift.date))
    ) {
      return ['R-SWP-02', 'SKILL_NOT_HELD'];
    }
    const counterpartProblem = state.check(counterpart, given.shift, given.skillId, ms, taken);
    if (counterpartProblem) return ['R-SWP-03', counterpartProblem];
    if (taken) {
      const requesterProblem = state.check(requester, taken.shift, taken.skillId, ms, given);
      if (requesterProblem) return ['R-SWP-03', requesterProblem];
    }
    if (swap.requestedMs > swap.earliestStartMs - POLICY.swap.minNoticeHours * HOUR_MS) {
      return ['R-SWP-04', 'INSUFFICIENT_NOTICE'];
    }
    return null;
  };

  const apply = (swap, ms) => {
    const { requesterAssignment: given, counterpartAssignment: taken } = swap;
    release(swap);
    if (given.status !== 'SCHEDULED' || (taken && taken.status !== 'SCHEDULED')) {
      unappliedApprovals += 1;
      return;
    }
    endAssignment(given, 'SWAPPED_OUT', ms, 'SWAP_APPLIED', { swap });
    if (taken) endAssignment(taken, 'SWAPPED_OUT', ms, 'SWAP_APPLIED', { swap });
    const common = { createdMs: ms, source: 'SWAP', reason: 'SWAP_APPLIED', swap };
    createAssignment({
      ...common,
      emp: swap.counterpart,
      shift: given.shift,
      teamId: given.teamId,
      skillId: given.skillId,
      supersedes: given,
    });
    if (taken) {
      createAssignment({
        ...common,
        emp: swap.requester,
        shift: taken.shift,
        teamId: taken.teamId,
        skillId: taken.skillId,
        supersedes: taken,
      });
    }
    swap.appliedMs = ms;
    record(swap, 'APPLIED', ms, 'SYSTEM', null, 'R-SWP-06', 'SWAP_APPLIED');
  };

  const pickRequest = (t) => {
    const firstDay = Math.floor((t - windowStartMs) / DAY_MS);
    const horizon = Math.min(behaviour.horizonDays, window.days - firstDay);
    for (let attempt = 0; attempt < 30; attempt++) {
      const day = firstDay + swapRng.int(0, horizon - 1);
      const pool = [...state.activeByDay[day]].filter(
        (a) => a.shift.startMs >= t + minLeadMs && !locked.has(a),
      );
      if (pool.length === 0) continue;
      const given = swapRng.pick(pool);

      let people = state.byTeam.get(given.teamId);
      if (swapRng.chance(behaviour.crossTeamShare)) {
        const other = swapRng.pick(operational.filter((team) => team.team_id !== given.teamId));
        people = state.byTeam.get(other.team_id) ?? [];
      }
      people = people.filter((e) => e !== given.employee && state.employedOn(e, given.shift.date));
      // Requesters usually ask a colleague who holds the skill and is free (and rested) for the
      // shift; the preferences are not always met, so some requests break a rule and get rejected.
      const prefer = (list, keep) => {
        const preferred = list.filter(keep);
        return preferred.length > 0 ? preferred : list;
      };
      if (swapRng.chance(behaviour.sameSkillPreference)) {
        people = prefer(people, (e) => state.holdsSkill(e, given.skillId, given.shift.date));
      }
      const wantsFree = swapRng.chance(behaviour.freeCounterpartPreference);
      if (wantsFree) people = prefer(people, (e) => state.isAvailable(e, given.shift));
      if (people.length === 0) continue;
      const counterpart = swapRng.pick(people);

      let taken = null;
      if (swapRng.chance(behaviour.swapShare)) {
        let options = counterpart.active.filter(
          (a) =>
            Math.abs(a.shift.dayIdx - given.shift.dayIdx) <= behaviour.counterpartWindowDays &&
            a.shift.startMs >= t + minLeadMs &&
            !locked.has(a),
        );
        if (wantsFree)
          options = prefer(options, (a) => state.isAvailable(given.employee, a.shift, given));
        if (options.length > 0) taken = swapRng.pick(options);
      }
      return { given, counterpart, taken };
    }
    return null;
  };

  let swapShortfall = 0;
  // Requests stop two days before the window ends so every one can still target a later shift.
  const requestTimes = Array.from(
    { length: profile.swapRequests },
    () => windowStartMs + Math.round(swapRng.float(0, (window.days - 2) * DAY_MS)),
  ).sort((a, b) => a - b);
  for (const t of requestTimes) {
    schedule(t, PRIORITY.SWAP_REQUEST, () => {
      const picked = pickRequest(t);
      if (picked === null) {
        swapShortfall += 1;
        return;
      }
      const { given, counterpart, taken } = picked;
      const swap = {
        seq: swaps.length,
        type: taken ? 'SWAP' : 'COVER',
        teamId: given.teamId,
        requester: given.employee,
        requesterAssignment: given,
        counterpart,
        counterpartAssignment: taken,
        requestedMs: t,
        earliestStartMs: Math.min(given.shift.startMs, taken ? taken.shift.startMs : Infinity),
        status: 'REQUESTED',
        events: [
          {
            from: null,
            to: 'REQUESTED',
            ms: t,
            role: 'EMPLOYEE',
            actor: given.employee.id,
            ruleId: null,
            reasonCode: null,
          },
        ],
        decidedMs: null,
        decidedByRole: null,
        decidedBy: null,
        ruleId: null,
        reasonCode: null,
        appliedMs: null,
      };
      swaps.push(swap);
      locked.add(given);
      if (taken) locked.add(taken);

      const deadline = Math.min(
        t + POLICY.swap.decisionDeadlineHours * HOUR_MS,
        swap.earliestStartMs,
      );
      const responseHours = Math.min(
        behaviour.maxResponseHours,
        Math.max(0.25, -Math.log(1 - swapRng.next()) * behaviour.meanResponseHours),
      );
      const decisionMs = t + Math.round(responseHours * HOUR_MS);
      const cancels = swapRng.chance(behaviour.cancelShare);
      const cancelPoint = swapRng.float(0.05, 0.95);
      const applyDelay =
        swapRng.int(behaviour.applyDelayMinutes.min, behaviour.applyDelayMinutes.max) * MINUTE_MS;

      if (cancels) {
        const at = t + Math.round(cancelPoint * (Math.min(decisionMs, deadline) - t));
        schedule(at, PRIORITY.SWAP_FOLLOW_UP, () => {
          record(
            swap,
            'CANCELLED',
            at,
            'EMPLOYEE',
            swap.requester.id,
            'R-SWP-07',
            'REQUESTER_CANCELLED',
          );
          release(swap);
        });
      } else if (decisionMs >= deadline) {
        schedule(deadline, PRIORITY.SWAP_FOLLOW_UP, () => {
          decide(
            swap,
            deadline,
            'SYSTEM',
            null,
            'R-SWP-05',
            'NO_DECISION_BEFORE_DEADLINE',
            'EXPIRED',
          );
          release(swap);
        });
      } else {
        schedule(decisionMs, PRIORITY.SWAP_FOLLOW_UP, () => {
          const problem = evaluate(swap, decisionMs);
          const manager = managerOf.get(swap.teamId);
          if (problem) {
            decide(swap, decisionMs, 'MANAGER', manager, problem[0], problem[1], 'REJECTED');
            release(swap);
            return;
          }
          decide(
            swap,
            decisionMs,
            'MANAGER',
            manager,
            'R-SWP-05',
            'APPROVED_WITHIN_POLICY',
            'APPROVED',
          );
          const applyMs = Math.max(
            decisionMs,
            Math.min(decisionMs + applyDelay, swap.earliestStartMs - MINUTE_MS),
          );
          schedule(applyMs, PRIORITY.SWAP_FOLLOW_UP, () => apply(swap, applyMs));
        });
      }
    });
  }

  while (queue.size > 0) {
    const event = queue.pop();
    event.run(event.ms);
  }

  return { state, assignments, swaps, stats: { backfilled, swapShortfall, unappliedApprovals } };
}
