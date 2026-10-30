// Detected exceptions (business-rule findings) with their ground-truth match and review trail.
// Reviews are the API's only write: they are appended to a separate store and never change the
// dataset, so its published checksums stay valid.

import { Router } from 'express';

import { ENUMS } from '../../domain/constants.js';
import { RULES } from '../../domain/rules.js';
import { badRequest, enumValue, HttpError, idValue, notFound, pagination } from '../http.js';
import { REVIEW_STATUS } from '../store.js';

const FINDING_RE = /^FND-[0-9a-f]{12}$/;
const ATTENDANCE_RULES = /^R-(ATT|OVT)-/;

/**
 * Who may review a finding: the employee's team manager or HR partner, or an ops partner when
 * the finding is about attendance or overtime.
 */
function reviewerRole(actor, finding, team) {
  if (!actor) return null;
  if (actor.employee_role === 'MANAGER' && team?.manager_employee_id === actor.employee_id)
    return 'MANAGER';
  if (actor.employee_role === 'HR_PARTNER' && team?.hr_partner_employee_id === actor.employee_id)
    return 'HR_PARTNER';
  if (actor.employee_role === 'OPS_PARTNER' && ATTENDANCE_RULES.test(finding.rule_id))
    return 'OPS_PARTNER';
  return null;
}

export function exceptionRoutes(store) {
  const router = Router();

  const findingParam = (value) => {
    if (!FINDING_RE.test(value)) throw badRequest(`"${value}" is not a valid finding ID`);
    const finding = store.finding(value);
    if (!finding) throw notFound('Finding', value);
    return finding;
  };

  router.get('/exceptions', (req, res) => {
    const ruleId = req.query.ruleId;
    if (ruleId !== undefined && !(ruleId in RULES))
      throw badRequest(`ruleId ${ruleId} is not a known rule`);
    const issueType = enumValue(req.query.issueType, 'ISSUE_TYPE', 'issueType');
    const kind = req.query.kind;
    if (kind !== undefined && kind !== 'VIOLATION' && kind !== 'EXCEPTION')
      throw badRequest('kind must be VIOLATION or EXCEPTION');
    const teamId = idValue(req.query.teamId, 'team', 'teamId');
    const employeeId = idValue(req.query.employeeId, 'employee', 'employeeId');
    const review = req.query.reviewStatus;
    if (review !== undefined && review !== 'OPEN' && !REVIEW_STATUS.includes(review)) {
      throw badRequest(`reviewStatus must be OPEN or one of ${REVIEW_STATUS.join(', ')}`);
    }
    const { limit, offset } = pagination(req.query);
    const statuses = store.latestReviewStatuses();
    const rows = store
      .findings()
      .map((f) => ({ ...f, review_status: statuses.get(f.finding_id) ?? 'OPEN' }))
      .filter(
        (f) =>
          (ruleId === undefined || f.rule_id === ruleId) &&
          (issueType === undefined || f.issue_type === issueType) &&
          (kind === undefined || f.kind === kind) &&
          (teamId === undefined || f.team_id === teamId) &&
          (employeeId === undefined || f.employee_id === employeeId) &&
          (review === undefined || f.review_status === review),
      );
    res.json({
      data: rows.slice(offset, offset + limit),
      page: { limit, offset, total: rows.length },
    });
  });

  router.get('/exceptions/summary', (_req, res) => {
    const statuses = store.latestReviewStatuses();
    const summary = {};
    for (const f of store.findings()) {
      const key = `${f.rule_id} ${f.kind}`;
      summary[key] ??= {
        rule_id: f.rule_id,
        rule: f.rule,
        kind: f.kind,
        issue_type: f.issue_type,
        total: 0,
        labelled: 0,
        open: 0,
      };
      summary[key].total += 1;
      if (f.ground_truth_id) summary[key].labelled += 1;
      if (!statuses.has(f.finding_id)) summary[key].open += 1;
    }
    res.json({
      data: Object.values(summary).sort(
        (a, b) => a.rule_id.localeCompare(b.rule_id) || a.kind.localeCompare(b.kind),
      ),
    });
  });

  router.get('/exceptions/:findingId', (req, res) => {
    const finding = findingParam(req.params.findingId);
    const label = finding.ground_truth_id
      ? store.groundTruth().find((l) => l.ground_truth_id === finding.ground_truth_id)
      : null;
    res.json({ ...finding, ground_truth: label, reviews: store.reviewsFor(finding.finding_id) });
  });

  router.post('/exceptions/:findingId/reviews', (req, res) => {
    const finding = findingParam(req.params.findingId);
    const body = req.body ?? {};
    const actorId = idValue(body.actorEmployeeId, 'employee', 'actorEmployeeId');
    if (!actorId) throw badRequest('actorEmployeeId is required');
    if (!REVIEW_STATUS.includes(body.status))
      throw badRequest(`status must be one of ${REVIEW_STATUS.join(', ')}`);
    if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)) {
      throw badRequest('note must be text of at most 500 characters');
    }
    const actor = store.db.prepare('SELECT * FROM employee WHERE employee_id = ?').get(actorId);
    if (!actor) throw notFound('Employee', actorId);
    const team = finding.team_id
      ? store.db.prepare('SELECT * FROM team WHERE team_id = ?').get(finding.team_id)
      : null;
    const role = reviewerRole(actor, finding, team);
    if (!role) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        `${actorId} (${actor.employee_role}) may not review this finding: it needs the team's manager or HR partner${ATTENDANCE_RULES.test(finding.rule_id) ? ', or an ops partner' : ''}`,
      );
    }
    const review = store.addReview({
      findingId: finding.finding_id,
      status: body.status,
      actorEmployeeId: actorId,
      actorRole: role,
      note: body.note,
    });
    res.status(201).json(review);
  });

  router.get('/ground-truth', (req, res) => {
    const labelClass = enumValue(req.query.labelClass, 'LABEL_CLASS', 'labelClass');
    const data = store
      .groundTruth()
      .filter((l) => labelClass === undefined || l.label_class === labelClass);
    res.json({ data, issue_types: ENUMS.ISSUE_TYPE });
  });

  return router;
}
