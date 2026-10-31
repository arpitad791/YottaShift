import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pct = (value) => (value === null ? '—' : `${(value * 100).toFixed(2)} %`);
const table = (header, rows) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
const counts = (object) =>
  table(
    ['Value', 'Count'],
    Object.entries(object).map(([k, v]) => [`\`${k}\``, v]),
  );

export function metricsMarkdown(metrics, { profileName, seed }) {
  const m = metrics;
  const fairness = (key) =>
    m.M08_fairness[key]
      ? `${m.M08_fairness[key].mean} (min ${m.M08_fairness[key].min}, ${m.M08_fairness[key].teams} teams)`
      : '—';
  return `# Metrics — profile \`${profileName}\`, seed ${seed}

Computed from the generated tables only (docs/business-rules.md §5). Machine-readable version:
\`metrics.json\`.

## M-01 Coverage fill
${table(
  ['Measure', 'Value'],
  [
    ['Requirement slots (shift × team × skill)', m.M01_coverage_fill.requirement_slots],
    ['Required headcount', m.M01_coverage_fill.required_headcount],
    [
      'Filled by qualified staff',
      `${m.M01_coverage_fill.filled_headcount} (${pct(m.M01_coverage_fill.fill_rate)})`,
    ],
    [
      'Filled by staff who clocked in',
      `${m.M01_coverage_fill.attended_headcount} (${pct(m.M01_coverage_fill.attended_fill_rate)})`,
    ],
  ],
)}

## M-02 Coverage gaps
${table(
  ['Measure', 'Value'],
  [
    ['Short slots', m.M02_gaps.gap_slots],
    ['Missing headcount', m.M02_gaps.gap_headcount],
    ['Missing headcount-hours', m.M02_gaps.gap_headcount_hours],
    ['Missing headcount after absences', m.M02_gaps.attended_gap_headcount],
  ],
)}

By template:

${table(
  ['Template', 'Short slots', 'Missing headcount', 'Headcount-hours'],
  Object.entries(m.M02_gaps.by_template).map(([k, v]) => [
    k,
    v.gap_slots,
    v.gap_headcount,
    v.gap_headcount_hours,
  ]),
)}

Teams with the most missing headcount-hours:

${table(
  ['Team', 'Name', 'Short slots', 'Headcount-hours'],
  m.M02_gaps.worst_teams.map((t) => [t.team_id, t.team_name, t.gap_slots, t.gap_headcount_hours]),
)}

## M-03 Overtime
${table(
  ['Measure', 'Value'],
  [
    ['Employee-weeks', m.M03_overtime.employee_weeks],
    ['Weeks with overtime', m.M03_overtime.weeks_with_overtime],
    ['Total overtime hours', m.M03_overtime.total_overtime_hours],
    [
      'Overtime per week p50 / p90 / max (h)',
      `${m.M03_overtime.overtime_hours_p50} / ${m.M03_overtime.overtime_hours_p90} / ${m.M03_overtime.overtime_hours_max}`,
    ],
    ['Overtime cap breaches', m.M03_overtime.cap_breaches],
    ['Scheduled ÷ contracted hours', pct(m.M03_overtime.scheduled_vs_contracted)],
  ],
)}

## M-04 Leave
${counts(m.M04_leave.by_status)}

Approval rate of decided requests by type: ${Object.entries(m.M04_leave.approval_rate_by_type)
    .map(([k, v]) => `${k} ${pct(v)}`)
    .join(' · ')}

Rejections by reason:

${counts(m.M04_leave.rejections_by_reason)}

## M-05 Swaps
${counts(m.M05_swaps.by_status)}

Approval rate of manager decisions: ${pct(m.M05_swaps.approval_rate_of_decided)} · expiry rate: ${pct(m.M05_swaps.expiry_rate)} · manager response p50 / p90: ${m.M05_swaps.manager_response_hours_p50} h / ${m.M05_swaps.manager_response_hours_p90} h

Rejections by reason:

${counts(m.M05_swaps.rejections_by_reason)}

## M-06 Attendance
${table(
  ['Measure', 'Value'],
  [
    ['Due assignments', m.M06_attendance.due_assignments],
    ['Punctuality (clock-in ≤ 5 min late)', pct(m.M06_attendance.punctuality_rate)],
    ['Late (> 5 min)', pct(m.M06_attendance.late_rate)],
    ['Early leave (> 5 min)', pct(m.M06_attendance.early_leave_rate)],
    ['Extension (> 15 min)', pct(m.M06_attendance.extension_rate)],
    ['No-show', pct(m.M06_attendance.no_show_rate)],
    ['Uncorrected missing clock-out', pct(m.M06_attendance.missing_punch_rate)],
    ['Clock-outs entered manually by ops', pct(m.M06_attendance.manual_correction_rate)],
  ],
)}

## M-07 Reconciliation
${table(
  ['Measure', 'Value'],
  [
    ['Assignments with a complete record', pct(m.M07_reconciliation.complete_record_rate)],
    ['Assignments with no record at all', m.M07_reconciliation.no_record],
    ['Scheduled hours (all due)', m.M07_reconciliation.scheduled_hours],
    ['Worked hours (present)', m.M07_reconciliation.worked_hours],
    ['Worked ÷ scheduled (present)', pct(m.M07_reconciliation.worked_vs_scheduled_present)],
  ],
)}

## M-08 Fairness
Population: ${m.M08_fairness.population} (${m.M08_fairness.people} people). Jain's index, 1 = perfectly even.

${table(
  ['Dimension', 'Mean across teams (min)'],
  [
    ['Night shifts', fairness('jain_nights')],
    ['Weekend shifts', fairness('jain_weekends')],
    ['Holiday shifts', fairness('jain_holidays')],
    ['Hours per contracted hour', fairness('jain_hours_per_contract')],
  ],
)}
`;
}

export function writeMetrics(dir, metrics, context) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  writeFileSync(join(dir, 'metrics.md'), metricsMarkdown(metrics, context));
}
