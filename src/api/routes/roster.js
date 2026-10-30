// Schedules, coverage and assignment history.

import { Router } from 'express';

import { badRequest, dateValue, enumValue, idParam, idValue, notFound, page } from '../http.js';

export function rosterRoutes(store) {
  const router = Router();
  const { db } = store;

  router.get('/employees/:employeeId/schedule', (req, res) => {
    const employeeId = idParam(req.params.employeeId, 'employee');
    if (!db.prepare('SELECT 1 FROM employee WHERE employee_id = ?').get(employeeId))
      throw notFound('Employee', employeeId);
    const from = dateValue(req.query.from, 'from');
    const to = dateValue(req.query.to, 'to');
    if (from && to && from > to) throw badRequest('from must not be after to');
    const data = db
      .prepare(
        `SELECT a.assignment_id, a.shift_id, s.shift_date, s.template_code, s.start_at, s.end_at, s.day_type,
                a.team_id, a.skill_id, k.skill_name, a.source, a.status, a.swap_id, a.supersedes_assignment_id,
                r.outcome AS attendance_outcome, r.worked_minutes, r.late_minutes, r.early_leave_minutes, r.extension_minutes
         FROM shift_assignment a
         JOIN shift s USING (shift_id)
         JOIN skill k ON k.skill_id = a.skill_id
         LEFT JOIN attendance_reconciliation r ON r.assignment_id = a.assignment_id
         WHERE a.employee_id = ? AND s.shift_date >= ? AND s.shift_date <= ?
         ORDER BY s.start_at, a.assignment_id`,
      )
      .all(employeeId, from ?? '0000-01-01', to ?? '9999-12-31');
    res.json({ employee_id: employeeId, data });
  });

  router.get('/coverage', (req, res) => {
    res.json(
      page(db, {
        from: 'coverage_status c JOIN shift s USING (shift_id) JOIN team t USING (team_id) JOIN skill k USING (skill_id)',
        select: 'c.*, s.shift_date, s.template_code, s.day_type, t.team_name, k.skill_name',
        filters: [
          ['s.shift_date = ?', dateValue(req.query.date, 'date')],
          ['c.team_id = ?', idValue(req.query.teamId, 'team', 'teamId')],
          ['c.skill_id = ?', idValue(req.query.skillId, 'skill', 'skillId')],
          ['c.status = ?', enumValue(req.query.status, 'COVERAGE_STATUS', 'status')],
        ],
        orderBy: 's.start_at, c.team_id, c.skill_id',
        query: req.query,
      }),
    );
  });

  // Per-date totals for charts: required vs filled vs attended, and the size of the gaps.
  router.get('/coverage/daily', (req, res) => {
    const teamId = idValue(req.query.teamId, 'team', 'teamId');
    const data = db
      .prepare(
        `SELECT s.shift_date, sum(c.required_headcount) AS required,
                sum(min(c.qualified_headcount, c.required_headcount)) AS filled,
                sum(min(c.attended_headcount, c.required_headcount)) AS attended,
                sum(c.status = 'GAP') AS gap_slots, sum(c.gap_headcount) AS gap_headcount
         FROM coverage_status c JOIN shift s USING (shift_id)
         WHERE c.required_headcount > 0 AND (? IS NULL OR c.team_id = ?)
         GROUP BY s.shift_date ORDER BY s.shift_date`,
      )
      .all(teamId ?? null, teamId ?? null);
    res.json({ team_id: teamId ?? null, data });
  });

  router.get('/assignments/:assignmentId', (req, res) => {
    const assignmentId = idParam(req.params.assignmentId, 'assignment');
    const assignment = db
      .prepare(
        `SELECT a.*, s.shift_date, s.template_code, s.start_at, s.end_at, s.day_type, e.full_name AS employee_name, k.skill_name
         FROM shift_assignment a JOIN shift s USING (shift_id) JOIN employee e USING (employee_id) JOIN skill k ON k.skill_id = a.skill_id
         WHERE a.assignment_id = ?`,
      )
      .get(assignmentId);
    if (!assignment) throw notFound('Assignment', assignmentId);
    res.json({
      ...assignment,
      events: db
        .prepare('SELECT * FROM shift_assignment_event WHERE assignment_id = ? ORDER BY event_seq')
        .all(assignmentId),
      attendance: db
        .prepare('SELECT * FROM attendance_event WHERE assignment_id = ? ORDER BY event_at')
        .all(assignmentId),
      reconciliation:
        db
          .prepare('SELECT * FROM attendance_reconciliation WHERE assignment_id = ?')
          .get(assignmentId) ?? null,
      // History links: what this assignment replaced, and what replaced it.
      supersedes: assignment.supersedes_assignment_id,
      superseded_by: db
        .prepare(
          'SELECT assignment_id, employee_id, source, status FROM shift_assignment WHERE supersedes_assignment_id = ?',
        )
        .all(assignmentId),
    });
  });

  return router;
}
