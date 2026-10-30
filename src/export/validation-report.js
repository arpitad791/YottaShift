import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pct = (value) => (value === null ? '—' : `${(value * 100).toFixed(2)} %`);
const table = (header, rows) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
const n = (value) => value.toLocaleString('en-US');

export function validationMarkdown(summary, { profileName, seed }) {
  const s = summary;
  const checkRows = [...s.integrity, ...s.decisions].map((c) => [
    c.id,
    c.name,
    n(c.checked),
    c.failures === 0 ? '✅ 0' : `❌ ${c.failures}`,
    c.samples.map((x) => x.replaceAll('|', '/')).join('<br>') || '',
  ]);
  const evaluation = s.evaluation;
  return `# Validation summary — profile \`${profileName}\`, seed ${seed}

**Status: ${s.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}**${s.problems.length ? `\n\n${s.problems.map((p) => `- ${p}`).join('\n')}` : ''}

Produced by \`npm run validate -- --profile ${profileName}\` from the exported files only
(\`csv/\` and \`ground_truth/\`). Machine-readable version: \`validation_summary.json\`.

## 1. Structural integrity and decision replay

${table(['ID', 'Check', 'Checked', 'Failures', 'Samples'], checkRows)}

${
  evaluation
    ? `## 2. Detection against the ground truth (M-09)

A finding matches a label when it has ${evaluation.matching}.

${table(
  [
    'Issue type',
    'Labels',
    'Findings',
    'Detected',
    'Missed',
    'Outside labels',
    'Precision',
    'Recall',
  ],
  evaluation.per_type.map((r) => [
    r.issue_type,
    r.labels,
    r.findings,
    r.true_positives,
    r.false_negatives,
    r.false_positives,
    pct(r.precision),
    pct(r.recall),
  ]),
)}

Overall: ${evaluation.overall.detected} / ${evaluation.overall.anomaly_labels} anomalies detected (recall ${pct(evaluation.overall.recall)}), precision ${pct(evaluation.overall.precision)}.

**Boundary cases** (valid, must not be flagged): ${evaluation.boundary.flagged} of ${evaluation.boundary.labels} flagged.

${table(
  ['Boundary type', 'Labels', 'Flagged'],
  Object.entries(evaluation.boundary.by_type).map(([type, v]) => [type, v.labels, v.flagged]),
)}

**Confusion** (rows: label; columns: detector result on the labelled records):

${table(
  ['Label', 'Detected as'],
  Object.entries(evaluation.confusion).map(([label, cols]) => [
    label,
    Object.entries(cols)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', '),
  ]),
)}

**Secondary findings** (no issue type of their own): ${evaluation.secondary_findings.total}, of which ${evaluation.secondary_findings.on_labelled_records} on labelled records and ${evaluation.secondary_findings.unexplained} unexplained. By rule: ${
        Object.entries(evaluation.secondary_findings.by_rule)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ') || 'none'
      }.

## 3. Acceptance criteria

${table(
  ['ID', 'Criterion', 'Result', 'Evidence'],
  s.acceptance.map((a) => [a.id, a.criterion, a.passed ? '✅ met' : '❌ not met', a.evidence]),
)}

## 4. Business-rule findings by rule

${table(
  ['Rule / kind', 'Count'],
  Object.entries(s.findings).map(([k, v]) => [k, v]),
)}
`
    : '## 2. Detection, acceptance and business rules\n\nSkipped because structural checks failed.\n'
}
## ${evaluation ? 5 : 3}. Rows read

${table(
  ['Table', 'Rows'],
  Object.entries(s.rows).map(([k, v]) => [k, n(v)]),
)}
`;
}

export function writeValidation(dir, summary, context) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'validation_summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, 'validation_summary.md'), validationMarkdown(summary, context));
}
