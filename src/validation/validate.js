// Full validation of an exported dataset: structural integrity, decision replay, business-rule
// findings, evaluation against the ground truth, and the brief's acceptance criteria.
// The summary is deterministic (no timestamps) so it can be compared across runs.

import { checkBusinessRules } from './business-rules.js';
import { checkSwapDecisions, replayLeaveDecisions } from './decisions.js';
import { evaluateDetection } from './evaluate.js';
import { checkIntegrity } from './integrity.js';

const WORKING_TIME_RULES = new Set(['R-SCH-06', 'R-SCH-07', 'R-SCH-08', 'R-OVT-02']);

function acceptance(tables, { integrity, decisions, findings, groundTruth }) {
  const failed = (id) => integrity.find((c) => c.id === id)?.failures ?? 0;
  const anomalyIds = new Set(
    groundTruth.filter((l) => l.label_class === 'ANOMALY').flatMap((l) => l.record_ids.split(';')),
  );
  const explained = (f) => f.recordIds.some((id) => anomalyIds.has(id));
  const violations = findings.filter((f) => f.kind === 'VIOLATION');
  const coverage = tables.coverage_status.filter((c) => c.required_headcount > 0);
  const due = tables.attendance_reconciliation;
  const complete = due.filter((r) => r.outcome === 'PRESENT' || r.outcome === 'NO_SHOW').length;
  const workingTime = violations.filter((f) => WORKING_TIME_RULES.has(f.ruleId));
  const swapHistory = violations.filter((f) => f.ruleId === 'R-SWP-08');
  const swapDecisions = decisions.find((d) => d.id === 'D-02');

  return [
    {
      id: 'A-01',
      criterion: 'Coverage requirements are met or gaps reported',
      passed: failed('I-12') === 0,
      evidence: `${coverage.length} requirement slots; ${coverage.filter((c) => c.status === 'GAP').length} reported as GAP in coverage_status, which recomputes exactly from the roster (I-12); an assignee without the skill never counts as cover (qualified vs assigned headcount)`,
    },
    {
      id: 'A-02',
      criterion:
        'Working-hour constraints hold (rest, consecutive days, weekly hours, overtime cap)',
      passed: workingTime.every(explained),
      evidence: `${workingTime.length} working-time findings, ${workingTime.filter(explained).length} of them on labelled anomalies; ${workingTime.filter((f) => !explained(f)).length} unexplained`,
    },
    {
      id: 'A-03',
      criterion: 'Attendance reconciles with schedules',
      passed:
        !violations.some((f) => f.ruleId === 'R-ATT-01') &&
        due.every((r) => r.outcome !== 'NO_RECORD'),
      evidence: `${due.length} due assignments; ${complete} (${((complete / due.length) * 100).toFixed(2)} %) with a complete record; ${due.filter((r) => r.outcome === 'MISSING_PUNCH').length} uncorrected missing clock-outs reported as exceptions; 0 R-ATT-01 violations required`,
    },
    {
      id: 'A-04',
      criterion: 'Swap history is preserved',
      passed: failed('I-10') === 0 && swapDecisions.failures === 0 && swapHistory.every(explained),
      evidence: `${tables.swap_request.length} swaps with complete event chains (I-10); applied swaps link old and new assignments (D-02); ${swapHistory.length} R-SWP-08 findings, all on labelled unapproved swaps: ${swapHistory.every(explained)}`,
    },
  ];
}

export function validateDataset({ tables, layoutProblems, groundTruth }, { patterns }) {
  const integrity = checkIntegrity(tables, { layoutProblems });
  const structureOk = integrity.every((c) => c.failures === 0);
  // Rule checks need well-formed tables; on a structurally broken dataset they are skipped.
  const decisions = structureOk ? [replayLeaveDecisions(tables), checkSwapDecisions(tables)] : [];
  const findings = structureOk ? checkBusinessRules(tables, { patterns }) : [];
  const evaluation = structureOk ? evaluateDetection(findings, groundTruth) : null;
  const acceptanceResults = structureOk
    ? acceptance(tables, { integrity, decisions, findings, groundTruth })
    : [];

  const problems = [];
  for (const c of [...integrity, ...decisions])
    if (c.failures > 0) problems.push(`${c.id} ${c.name}: ${c.failures} failure(s)`);
  if (!structureOk)
    problems.push(
      'Business-rule checks, evaluation and acceptance skipped: fix structural failures first',
    );
  if (evaluation) {
    for (const row of evaluation.per_type) {
      if (row.labels > 0 && row.recall !== 1)
        problems.push(`${row.issue_type}: recall ${row.recall}`);
      if (row.false_positives > 0)
        problems.push(`${row.issue_type}: ${row.false_positives} finding(s) outside the labels`);
    }
    if (evaluation.boundary.flagged > 0)
      problems.push(`${evaluation.boundary.flagged} boundary case(s) flagged`);
    if (evaluation.secondary_findings.unexplained > 0) {
      problems.push(
        `${evaluation.secondary_findings.unexplained} finding(s) not explained by any label`,
      );
    }
  }
  for (const a of acceptanceResults)
    if (!a.passed) problems.push(`${a.id} not met: ${a.criterion}`);

  const byRule = {};
  for (const f of findings) {
    const key = `${f.ruleId} ${f.kind}`;
    byRule[key] = (byRule[key] ?? 0) + 1;
  }
  return {
    status: problems.length === 0 ? 'PASS' : 'FAIL',
    problems,
    rows: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    integrity,
    decisions,
    findings: Object.fromEntries(Object.entries(byRule).sort(([a], [b]) => a.localeCompare(b))),
    evaluation,
    acceptance: acceptanceResults,
  };
}
