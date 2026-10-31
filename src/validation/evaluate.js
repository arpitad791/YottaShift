import { ENUMS } from '../domain/constants.js';

const ANOMALY_TYPES = ENUMS.ISSUE_TYPE.filter((t) => !t.startsWith('BOUNDARY_'));
const idsOf = (label) => label.record_ids.split(';');
const intersects = (finding, label) => idsOf(label).some((id) => finding.recordIds.includes(id));
const ratio = (part, whole) => (whole === 0 ? null : Math.round((part / whole) * 10000) / 10000);

export function evaluateDetection(findings, groundTruth) {
  const violations = findings.filter((f) => f.kind === 'VIOLATION');
  const typed = violations.filter((f) => f.issueType);
  const anomalies = groundTruth.filter((l) => l.label_class === 'ANOMALY');
  const boundaries = groundTruth.filter((l) => l.label_class === 'BOUNDARY');

  const perType = ANOMALY_TYPES.map((type) => {
    const labels = anomalies.filter((l) => l.issue_type === type);
    const found = typed.filter((f) => f.issueType === type);
    const detected = labels.filter((l) => found.some((f) => intersects(f, l)));
    const correct = found.filter((f) => labels.some((l) => intersects(f, l)));
    return {
      issue_type: type,
      labels: labels.length,
      findings: found.length,
      true_positives: detected.length,
      false_negatives: labels.length - detected.length,
      false_positives: found.length - correct.length,
      precision: ratio(correct.length, found.length),
      recall: ratio(detected.length, labels.length),
      missed: labels.filter((l) => !detected.includes(l)).map((l) => l.ground_truth_id),
    };
  });

  const confusion = {};
  const bump = (row, column) => {
    confusion[row] ??= {};
    confusion[row][column] = (confusion[row][column] ?? 0) + 1;
  };
  for (const label of anomalies) {
    const types = [...new Set(typed.filter((f) => intersects(f, label)).map((f) => f.issueType))];
    if (types.length === 0) bump(label.issue_type, 'NOT_DETECTED');
    for (const type of types) bump(label.issue_type, type);
  }
  for (const f of typed) {
    if (!anomalies.some((l) => intersects(f, l))) bump('NO_LABEL', f.issueType);
  }

  const boundaryResults = boundaries.map((label) => ({
    ground_truth_id: label.ground_truth_id,
    issue_type: label.issue_type,
    flagged: violations.some((f) => f.ruleId === label.rule_id && intersects(f, label)),
  }));

  // Findings without an issue type (e.g. R-SWP-08 on an unapproved swap) are side effects; they
  // are acceptable only on records that a label already names.
  const secondary = violations.filter((f) => !f.issueType);
  const unexplained = secondary.filter((f) => !anomalies.some((l) => intersects(f, l)));

  const totals = perType.reduce(
    (sum, row) => ({
      labels: sum.labels + row.labels,
      truePositives: sum.truePositives + row.true_positives,
      findings: sum.findings + row.findings,
      falsePositives: sum.falsePositives + row.false_positives,
    }),
    { labels: 0, truePositives: 0, findings: 0, falsePositives: 0 },
  );

  return {
    matching: 'same issue_type and at least one shared record ID',
    per_type: perType,
    overall: {
      anomaly_labels: totals.labels,
      detected: totals.truePositives,
      recall: ratio(totals.truePositives, totals.labels),
      typed_findings: totals.findings,
      false_positives: totals.falsePositives,
      precision: ratio(totals.findings - totals.falsePositives, totals.findings),
    },
    boundary: {
      labels: boundaries.length,
      flagged: boundaryResults.filter((b) => b.flagged).length,
      by_type: Object.fromEntries(
        [...Map.groupBy(boundaryResults, (b) => b.issue_type)].map(([type, rows]) => [
          type,
          { labels: rows.length, flagged: rows.filter((b) => b.flagged).length },
        ]),
      ),
      flagged_ids: boundaryResults.filter((b) => b.flagged).map((b) => b.ground_truth_id),
    },
    confusion,
    secondary_findings: {
      total: secondary.length,
      on_labelled_records: secondary.length - unexplained.length,
      unexplained: unexplained.length,
      by_rule: Object.fromEntries(
        [...Map.groupBy(secondary, (f) => f.ruleId)].map(([rule, rows]) => [rule, rows.length]),
      ),
      unexplained_samples: unexplained.slice(0, 5).map((f) => `${f.ruleId}: ${f.message}`),
    },
  };
}
