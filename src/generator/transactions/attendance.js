// Attendance events for the final roster (R-ATT-01 … R-ATT-05, R-OVT-02).
//
// Only assignments still SCHEDULED at the end get events; cancelled and swapped-out ones were
// never worked. Clock-outs are capped so an employee's weekly worked time never exceeds
// contracted hours (prorated) + the overtime cap: the clean baseline has no cap breaches, so
// the labelled anomalies injected later are the only ones.

import { ids } from '../../lib/ids.js';
import { timestampFromMs } from '../../lib/dates.js';

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

export function generateAttendance({
  config,
  state,
  assignments,
  rejectedSickLeave,
  opsPartners,
  rng,
}) {
  const behaviour = config.attendanceBehaviour;
  const usedIds = new Set();
  const rows = [];

  const emit = (assignment, eventType, eventMs, source, recordedMs, recordedBy = null) => {
    const employeeId = assignment.employee.id;
    let at = eventMs;
    let id = ids.attendanceEvent(employeeId, timestampFromMs(at));
    // One person cannot punch twice in the same second; move a colliding event forward.
    while (usedIds.has(id)) {
      at += SECOND_MS;
      id = ids.attendanceEvent(employeeId, timestampFromMs(at));
    }
    usedIds.add(id);
    rows.push({
      attendance_event_id: id,
      employee_id: employeeId,
      assignment_id: assignment,
      event_type: eventType,
      event_at: timestampFromMs(at),
      source,
      recorded_at: timestampFromMs(Math.max(at, recordedMs)),
      recorded_by_employee_id: recordedBy,
    });
    return at;
  };

  const worked = assignments.filter((a) => a.status === 'SCHEDULED');
  const byEmployee = Map.groupBy(worked, (a) => a.employee.id);
  for (const [employeeId, list] of byEmployee) {
    const sick = rejectedSickLeave.get(employeeId) ?? [];
    for (const weekList of Map.groupBy(list, (a) => a.shift.week).values()) {
      weekList.sort((a, b) => a.shift.startMs - b.shift.startMs);
      const emp = weekList[0].employee;
      const limitMinutes = state.limits(emp, weekList[0].shift.week).workedMinutes;
      let workedMinutes = 0;
      let laterMinutes = weekList.reduce((sum, a) => sum + a.shift.minutes, 0);

      for (const assignment of weekList) {
        const { shift } = assignment;
        laterMinutes -= shift.minutes;
        const calledInSick = sick.some((s) => s.startDate <= shift.date && shift.date <= s.endDate);
        if (calledInSick || rng.chance(behaviour.noShowShare)) {
          // A refused sick call-in still keeps the person at home: an unexcused absence.
          emit(assignment, 'NO_SHOW', shift.endMs, 'SYSTEM', shift.endMs);
          continue;
        }

        const source = rng.chance(behaviour.mobileShare) ? 'MOBILE' : 'BADGE';
        const lag = () => (source === 'MOBILE' ? rng.int(0, 30) * SECOND_MS : 0);
        const lateMinutes = rng.chance(behaviour.lateShare)
          ? Math.min(
              behaviour.maxLateMinutes,
              6 + Math.round(-Math.log(1 - rng.next()) * behaviour.lateMeanMinutes),
            )
          : 0;
        const plannedInMs =
          lateMinutes > 0
            ? shift.startMs + lateMinutes * MINUTE_MS + rng.int(0, 59) * SECOND_MS
            : shift.startMs - rng.int(1, 25) * MINUTE_MS - rng.int(0, 59) * SECOND_MS;
        const clockInMs = emit(assignment, 'CLOCK_IN', plannedInMs, source, plannedInMs + lag());
        const paidStartMs = Math.max(clockInMs, shift.startMs);

        let clockOutMs = shift.endMs + rng.int(-120, 480) * SECOND_MS;
        if (rng.chance(behaviour.earlyLeaveShare)) {
          clockOutMs =
            shift.endMs -
            rng.int(behaviour.earlyLeaveMinutes.min, behaviour.earlyLeaveMinutes.max) * MINUTE_MS;
        } else if (rng.chance(behaviour.extensionShare)) {
          clockOutMs +=
            rng.int(behaviour.extensionMinutes.min, behaviour.extensionMinutes.max) * MINUTE_MS;
        }
        // R-OVT-02: leave room for the rest of the week's shifts at their scheduled length.
        const allowedMinutes = limitMinutes - workedMinutes - laterMinutes;
        clockOutMs = Math.min(clockOutMs, paidStartMs + allowedMinutes * MINUTE_MS);

        if (rng.chance(behaviour.missingClockOutShare)) {
          if (rng.chance(behaviour.manualCorrectionShare)) {
            // R-ATT-04: the ops partner records the clock-out at the scheduled end, a few hours later.
            const recordedMs = shift.endMs + rng.int(3 * 60, 5 * 60) * MINUTE_MS;
            emit(assignment, 'CLOCK_OUT', shift.endMs, 'MANUAL', recordedMs, rng.pick(opsPartners));
            workedMinutes += Math.floor((shift.endMs - paidStartMs) / MINUTE_MS);
          }
          continue;
        }
        const outMs = emit(assignment, 'CLOCK_OUT', clockOutMs, source, clockOutMs + lag());
        workedMinutes += Math.floor((outMs - paidStartMs) / MINUTE_MS);
      }
    }
  }
  return rows;
}
