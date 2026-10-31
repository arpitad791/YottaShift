import { Router } from 'express';

import { ENUMS } from '../../domain/constants.js';
import { enumValue, idParam, idValue, notFound, page } from '../http.js';

export function catalogRoutes(store) {
  const router = Router();
  const { db } = store;

  router.get('/health', (_req, res) => {
    const manifest = store.json('manifest.json');
    res.json({
      status: 'ok',
      profile: store.profile,
      seed: manifest?.seed ?? null,
      window: manifest?.window ?? null,
      tables: manifest?.tables ?? null,
      ground_truth: manifest?.ground_truth ?? null,
    });
  });

  router.get('/metrics', (_req, res) => {
    const metrics = store.json('reports/metrics.json');
    if (!metrics) throw notFound('Report', 'metrics.json');
    res.json(metrics);
  });

  router.get('/validation', (_req, res) => {
    const summary = store.json('reports/validation_summary.json');
    if (!summary)
      throw notFound(
        'Report',
        `validation_summary.json (run: npm run validate -- --profile ${store.profile})`,
      );
    res.json(summary);
  });

  router.get('/reproducibility', (_req, res) => {
    const report = store.json('reports/reproducibility.json');
    if (!report) {
      throw notFound(
        'Report',
        `reproducibility.json (run: npm run reproduce -- --profile ${store.profile})`,
      );
    }
    res.json(report);
  });

  router.get('/skills', (_req, res) => {
    res.json({ data: db.prepare('SELECT * FROM skill ORDER BY skill_id').all() });
  });

  router.get('/teams', (_req, res) => {
    const data = db
      .prepare(
        `SELECT t.*, m.full_name AS manager_name, h.full_name AS hr_partner_name,
                (SELECT count(*) FROM employee e WHERE e.team_id = t.team_id
                   AND e.employee_role IN (${ENUMS.SCHEDULABLE_ROLE.map(() => '?').join(', ')})) AS schedulable_members,
                coalesce(g.gap_slots, 0) AS gap_slots
         FROM team t
         JOIN employee m ON m.employee_id = t.manager_employee_id
         JOIN employee h ON h.employee_id = t.hr_partner_employee_id
         -- One grouped pass: coverage_status is keyed by shift first, so a per-team lookup would scan it.
         LEFT JOIN (SELECT team_id, count(*) AS gap_slots FROM coverage_status WHERE status = 'GAP' GROUP BY team_id) g
           ON g.team_id = t.team_id
         ORDER BY t.team_id`,
      )
      .all(...ENUMS.SCHEDULABLE_ROLE);
    res.json({ data });
  });

  router.get('/teams/:teamId', (req, res) => {
    const teamId = idParam(req.params.teamId, 'team');
    const team = db
      .prepare(
        `SELECT t.*, m.full_name AS manager_name, h.full_name AS hr_partner_name
         FROM team t
         JOIN employee m ON m.employee_id = t.manager_employee_id
         JOIN employee h ON h.employee_id = t.hr_partner_employee_id
         WHERE t.team_id = ?`,
      )
      .get(teamId);
    if (!team) throw notFound('Team', teamId);
    res.json({
      ...team,
      members: db
        .prepare(
          'SELECT employee_id, full_name, employee_role, employment_type, primary_skill_id, hire_date, termination_date, employment_status FROM employee WHERE team_id = ? ORDER BY employee_id',
        )
        .all(teamId),
      coverage_requirements: db
        .prepare(
          `SELECT c.*, s.skill_name FROM coverage_requirement c JOIN skill s USING (skill_id)
           WHERE c.team_id = ? ORDER BY c.template_code, c.skill_id, c.day_type, c.effective_from`,
        )
        .all(teamId),
      coverage: db
        .prepare(
          `SELECT count(*) AS requirement_slots, sum(required_headcount) AS required,
                  sum(min(qualified_headcount, required_headcount)) AS filled,
                  sum(status = 'GAP') AS gap_slots, sum(gap_headcount) AS gap_headcount
           FROM coverage_status WHERE team_id = ? AND required_headcount > 0`,
        )
        .get(teamId),
    });
  });

  router.get('/employees', (req, res) => {
    const q =
      typeof req.query.q === 'string' && req.query.q.trim() !== ''
        ? `%${req.query.q.trim()}%`
        : undefined;
    res.json(
      page(db, {
        from: 'employee',
        select: '*',
        filters: [
          ['team_id = ?', idValue(req.query.teamId, 'team', 'teamId')],
          ['employee_role = ?', enumValue(req.query.role, 'EMPLOYEE_ROLE', 'role')],
          [
            'employment_type = ?',
            enumValue(req.query.employmentType, 'EMPLOYMENT_TYPE', 'employmentType'),
          ],
          ['(full_name LIKE ? OR employee_id LIKE ?)', q === undefined ? undefined : [q, q]],
        ],
        orderBy: 'employee_id',
        query: req.query,
      }),
    );
  });

  router.get('/employees/:employeeId', (req, res) => {
    const employeeId = idParam(req.params.employeeId, 'employee');
    const employee = db.prepare('SELECT * FROM employee WHERE employee_id = ?').get(employeeId);
    if (!employee) throw notFound('Employee', employeeId);
    res.json({
      ...employee,
      team: db
        .prepare(
          'SELECT team_id, team_name, team_function, operating_pattern FROM team WHERE team_id = ?',
        )
        .get(employee.team_id),
      policy: db.prepare('SELECT * FROM labor_policy WHERE policy_id = ?').get(employee.policy_id),
      skills: db
        .prepare(
          'SELECT es.*, s.skill_name, s.requires_certification FROM employee_skill es JOIN skill s USING (skill_id) WHERE es.employee_id = ? ORDER BY es.skill_id',
        )
        .all(employeeId),
      leave_balances: db
        .prepare('SELECT * FROM leave_balance WHERE employee_id = ? ORDER BY leave_type')
        .all(employeeId),
      weeks: db
        .prepare('SELECT * FROM employee_week_summary WHERE employee_id = ? ORDER BY iso_week')
        .all(employeeId),
    });
  });

  return router;
}
