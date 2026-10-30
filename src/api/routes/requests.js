// Leave and swap requests with their full decision history, plus a leave "what-if" that runs
// the real rule engine without storing anything.

import { Router } from 'express';

import { ENUMS } from '../../domain/constants.js';
import { RULES } from '../../domain/rules.js';
import { addDays, daysBetween, timestampMs, toTimestamp } from '../../lib/dates.js';
import { decideFromTables, leaveRequestsFromTables } from '../../validation/decisions.js';
import {
  badRequest,
  dateValue,
  enumValue,
  HttpError,
  idParam,
  idValue,
  notFound,
  page,
} from '../http.js';

const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/;

export function requestRoutes(store) {
  const router = Router();
  const { db } = store;

  router.get('/leave', (req, res) => {
    res.json(
      page(db, {
        from: 'leave_request l JOIN employee e USING (employee_id)',
        select: 'l.*, e.full_name AS employee_name, e.team_id',
        filters: [
          ['l.status = ?', enumValue(req.query.status, 'LEAVE_STATUS', 'status')],
          ['l.leave_type = ?', enumValue(req.query.type, 'LEAVE_TYPE', 'type')],
          [
            'l.decision_reason_code = ?',
            enumValue(req.query.reason, 'LEAVE_REASON_CODE', 'reason'),
          ],
          ['e.team_id = ?', idValue(req.query.teamId, 'team', 'teamId')],
          ['l.employee_id = ?', idValue(req.query.employeeId, 'employee', 'employeeId')],
        ],
        orderBy: 'l.leave_request_id',
        query: req.query,
      }),
    );
  });

  router.get('/leave/:leaveRequestId', (req, res) => {
    const id = idParam(req.params.leaveRequestId, 'leaveRequest');
    const leave = db
      .prepare(
        'SELECT l.*, e.full_name AS employee_name, e.team_id FROM leave_request l JOIN employee e USING (employee_id) WHERE l.leave_request_id = ?',
      )
      .get(id);
    if (!leave) throw notFound('Leave request', id);
    res.json({
      ...leave,
      rule: leave.decision_rule_id ? RULES[leave.decision_rule_id] : null,
      events: db
        .prepare('SELECT * FROM leave_request_event WHERE leave_request_id = ? ORDER BY event_seq')
        .all(id),
      // Roster changes this leave caused: cancellations and backfills (R-LVE-09).
      roster_effects: db
        .prepare(
          `SELECT ev.event_id, ev.assignment_id, ev.to_status, ev.reason_code, ev.event_at, a.employee_id, a.shift_id
           FROM shift_assignment_event ev JOIN shift_assignment a USING (assignment_id)
           WHERE ev.leave_request_id = ? ORDER BY ev.event_at, ev.event_id`,
        )
        .all(id),
    });
  });

  // What would the rules decide for this request, given everything recorded in the dataset?
  router.post('/leave/evaluate', (req, res) => {
    const body = req.body ?? {};
    const employeeId = idValue(body.employeeId, 'employee', 'employeeId');
    const leaveType = enumValue(body.leaveType, 'LEAVE_TYPE', 'leaveType');
    const startDate = dateValue(body.startDate, 'startDate');
    const endDate = dateValue(body.endDate, 'endDate');
    if (!employeeId || !leaveType || !startDate || !endDate) {
      throw badRequest('employeeId, leaveType, startDate and endDate are required');
    }
    if (endDate < startDate) throw badRequest('endDate must not be before startDate');
    // Default submission: sick call-ins arrive early on the day, other leave two weeks ahead.
    const submittedAt =
      body.submittedAt ??
      (leaveType === 'SICK'
        ? toTimestamp(startDate, '04:00')
        : toTimestamp(addDays(startDate, -14), '09:00'));
    if (typeof submittedAt !== 'string' || !TIMESTAMP_RE.test(submittedAt)) {
      throw badRequest('submittedAt must look like 2026-02-01T09:00:00+05:30');
    }
    if (submittedAt.slice(0, 10) > startDate && leaveType !== 'SICK') {
      throw badRequest('submittedAt must be before the leave starts');
    }

    const t = store.tables();
    const employee = t.employee.find((e) => e.employee_id === employeeId);
    if (!employee) throw notFound('Employee', employeeId);
    if (!SCHEDULABLE.has(employee.employee_role)) {
      throw new HttpError(
        422,
        'NOT_APPLICABLE',
        `${employeeId} is a ${employee.employee_role}; only members and leads request leave`,
      );
    }

    const existing = leaveRequestsFromTables(t);
    const submittedMs = timestampMs(submittedAt);
    const candidate = {
      seq: existing.length,
      employee,
      leaveType,
      startDate,
      endDate,
      days: daysBetween(startDate, endDate) + 1,
      submittedMs,
      decidedMs: submittedMs,
      withdrawnMs: null,
      cancelledMs: null,
    };
    const decision = decideFromTables(t, [...existing, candidate]).get(candidate);
    const entitlement = t.leave_entitlement.find(
      (e) => e.employee_id === employeeId && e.leave_type === leaveType,
    );
    const balance = t.leave_balance.find(
      (b) => b.employee_id === employeeId && b.leave_type === leaveType,
    );
    res.json({
      request: {
        employeeId,
        leaveType,
        startDate,
        endDate,
        requestedDays: candidate.days,
        submittedAt,
      },
      decision: {
        status: decision.status,
        rule_id: decision.ruleId,
        rule: RULES[decision.ruleId],
        reason_code: decision.reasonCode,
        decided_by_role: decision.decidedByRole,
        decided_by_employee_id: decision.decidedBy,
      },
      balance: entitlement
        ? {
            entitled_days: entitlement.entitled_days,
            approved_days: balance?.approved_days ?? 0,
            remaining_days: balance?.remaining_days ?? entitlement.entitled_days,
          }
        : null,
      stored: false,
    });
  });

  router.get('/swaps', (req, res) => {
    res.json(
      page(db, {
        from: 'swap_request',
        select: '*',
        filters: [
          ['status = ?', enumValue(req.query.status, 'SWAP_STATUS', 'status')],
          ['swap_type = ?', enumValue(req.query.type, 'SWAP_TYPE', 'type')],
          ['decision_reason_code = ?', enumValue(req.query.reason, 'SWAP_REASON_CODE', 'reason')],
          ['team_id = ?', idValue(req.query.teamId, 'team', 'teamId')],
        ],
        orderBy: 'swap_id',
        query: req.query,
      }),
    );
  });

  router.get('/swaps/:swapId', (req, res) => {
    const id = idParam(req.params.swapId, 'swapRequest');
    const swap = db.prepare('SELECT * FROM swap_request WHERE swap_id = ?').get(id);
    if (!swap) throw notFound('Swap request', id);
    const assignment = db.prepare(
      'SELECT a.*, s.shift_date, s.template_code, s.start_at FROM shift_assignment a JOIN shift s USING (shift_id) WHERE a.assignment_id = ?',
    );
    res.json({
      ...swap,
      rule: swap.decision_rule_id ? RULES[swap.decision_rule_id] : null,
      events: db
        .prepare('SELECT * FROM swap_request_event WHERE swap_id = ? ORDER BY event_seq')
        .all(id),
      requester_assignment: assignment.get(swap.requester_assignment_id),
      counterpart_assignment: swap.counterpart_assignment_id
        ? assignment.get(swap.counterpart_assignment_id)
        : null,
      created_assignments: db
        .prepare(
          'SELECT assignment_id, employee_id, shift_id, supersedes_assignment_id, status FROM shift_assignment WHERE swap_id = ? ORDER BY assignment_id',
        )
        .all(id),
    });
  });

  return router;
}
