import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  attendanceReconciliation,
  coverageStatus,
  employeeWeekSummary,
  leaveBalance,
} from '../src/derive/derived-tables.js';
import { computeMetrics, jainIndex, percentile } from '../src/derive/metrics.js';
import { metricsMarkdown } from '../src/export/reports.js';
import { buildWindow, loadConfig } from '../src/generator/config.js';
import { generateDataset } from '../src/generator/index.js';
import { buildShifts, buildShiftTemplates } from '../src/generator/master/reference-tables.js';
import { addMinutes } from '../src/lib/dates.js';

// ---------------------------------------------------------------------------------------------
// Hand-built fixture. Window 2026-01-01 … 2026-01-14: W01 has 4 days (Thu–Sun), W02 has 7,
// W03 has 3. Every expected number below is worked out by hand in the comments.
// ---------------------------------------------------------------------------------------------
const config = loadConfig();
const shifts = buildShifts(buildWindow('2026-01-01', 14), buildShiftTemplates(config), []);
const shiftOf = (date, template = 'A') =>
  shifts.find((s) => s.shift_id === `SHIFT-${date}-${template}`);

const policies = [
  {
    policy_id: 'POL-FT-2026',
    contracted_weekly_hours: 40,
    max_weekly_scheduled_hours: 48,
    weekly_overtime_cap_hours: 12,
  },
  {
    policy_id: 'POL-PT-2026',
    contracted_weekly_hours: 24,
    max_weekly_scheduled_hours: 32,
    weekly_overtime_cap_hours: 8,
  },
];
const employee = (id, policy, hire = '2024-01-01', role = 'MEMBER') => ({
  employee_id: id,
  employee_role: role,
  policy_id: policy,
  hire_date: hire,
  termination_date: null,
});
const employees = [
  employee('E1', 'POL-FT-2026'),
  employee('E2', 'POL-PT-2026'),
  employee('E3', 'POL-FT-2026', '2026-01-08'), // joiner: 4 employed days in W02
  employee('E4', 'POL-FT-2026'),
  employee('M1', 'POL-FT-2026', '2024-01-01', 'MANAGER'), // not schedulable: no week rows
];

let assignmentSeq = 0;
let eventSeq = 0;
const assignments = [];
const events = [];
/** punch(shift, inOffsetMin, outOffsetMin) relative to shift start / end; null = no event. */
function work(
  employeeId,
  date,
  { inOffset = -5, outOffset = 10, noShow = false, clockOut = true, status = 'SCHEDULED' } = {},
) {
  const shift = shiftOf(date);
  const id = `ASG-${++assignmentSeq}`;
  assignments.push({
    assignment_id: id,
    shift_id: shift.shift_id,
    employee_id: employeeId,
    team_id: 'T1',
    skill_id: 'S1',
    status,
  });
  const push = (type, at) =>
    events.push({
      attendance_event_id: `ATT-${++eventSeq}`,
      assignment_id: id,
      employee_id: employeeId,
      event_type: type,
      event_at: at,
    });
  if (noShow) push('NO_SHOW', shift.end_at);
  else if (inOffset !== null) {
    push('CLOCK_IN', addMinutes(shift.start_at, inOffset));
    if (clockOut) push('CLOCK_OUT', addMinutes(shift.end_at, outOffset));
  }
  return id;
}

// E1, W02: six shifts of 06:00–14:00, clocked in 5 min early (unpaid), out 10 min late
//   → 490 min × 6 = 2,940 min = 49 h worked; 40 h contracted → 9.00 h overtime (cap 12).
for (const day of ['05', '06', '07', '08', '09', '10']) work('E1', `2026-01-${day}`);
// E1, W01 (4 days): two shifts worked exactly 8 h → 16 h; contracted 40 × 4/7 = 22.857 → 0 overtime.
work('E1', '2026-01-01', { outOffset: 0 });
work('E1', '2026-01-02', { outOffset: 0 });
// E1, W03: one shift, leaves 30 min early → early_leave 30, worked 450.
const e1Early = work('E1', '2026-01-12', { outOffset: -30 });
// E2 (part-time), W02: four shifts, each 60 min extension → 540 × 4 = 2,160 min = 36 h;
//   24 h contracted → 12.00 h overtime > 8 h cap → exceeded.
for (const day of ['05', '06', '07', '08']) work('E2', `2026-01-${day}`, { outOffset: 60 });
// E3 (joined 2026-01-08): late 12 min on the 9th → worked 468, late 12;
//   no-show on the 10th; clock-in without clock-out on the 11th.
const e3Late = work('E3', '2026-01-09', { inOffset: 12, outOffset: 0 });
const e3NoShow = work('E3', '2026-01-10', { noShow: true });
const e3Missing = work('E3', '2026-01-11', { clockOut: false });
// E4 holds S1 only until 2026-01-08: unqualified on the 12th; no record at all on the 13th.
work('E4', '2026-01-12', { outOffset: 0 });
const e4NoRecord = work('E4', '2026-01-13', { inOffset: null });
// A cancelled assignment is never due and never reconciled.
work('E4', '2026-01-14', { inOffset: null, status: 'CANCELLED' });

const tables = {
  shift: shifts,
  labor_policy: policies,
  employee: employees,
  shift_assignment: assignments,
  attendance_event: events,
  employee_skill: [
    { employee_id: 'E1', skill_id: 'S1', valid_from: '2020-01-01', valid_to: null },
    { employee_id: 'E2', skill_id: 'S1', valid_from: '2020-01-01', valid_to: null },
    { employee_id: 'E3', skill_id: 'S1', valid_from: '2026-01-08', valid_to: null },
    { employee_id: 'E4', skill_id: 'S1', valid_from: '2020-01-01', valid_to: '2026-01-08' },
  ],
  // Two people on A from 2026-01-05 on weekdays, three on weekends.
  coverage_requirement: [
    {
      coverage_id: 'COV-1',
      team_id: 'T1',
      template_code: 'A',
      skill_id: 'S1',
      day_type: 'WEEKDAY',
      min_headcount: 2,
      effective_from: '2026-01-05',
      effective_to: null,
    },
    {
      coverage_id: 'COV-2',
      team_id: 'T1',
      template_code: 'A',
      skill_id: 'S1',
      day_type: 'WEEKEND',
      min_headcount: 3,
      effective_from: '2026-01-05',
      effective_to: null,
    },
  ],
  leave_entitlement: [
    { employee_id: 'E1', leave_type: 'ANNUAL', entitled_days: 10 },
    { employee_id: 'E1', leave_type: 'CASUAL', entitled_days: 3 },
  ],
  leave_request: [
    { employee_id: 'E1', leave_type: 'ANNUAL', status: 'APPROVED', requested_days: 3 },
    { employee_id: 'E1', leave_type: 'ANNUAL', status: 'CANCELLED', requested_days: 2 },
    { employee_id: 'E1', leave_type: 'ANNUAL', status: 'REJECTED', requested_days: 4 },
    { employee_id: 'E1', leave_type: 'CASUAL', status: 'APPROVED', requested_days: 1 },
  ],
};

const reconciliation = attendanceReconciliation(tables);
const byAssignment = new Map(reconciliation.map((r) => [r.assignment_id, r]));
const weeks = employeeWeekSummary(tables, reconciliation);
const week = (employeeId, isoWeek) =>
  weeks.find((w) => w.employee_id === employeeId && w.iso_week === isoWeek);
const coverage = coverageStatus(tables, reconciliation);
const cell = (date, template = 'A') =>
  coverage.find((c) => c.shift_id === `SHIFT-${date}-${template}`);

describe('employee_week_summary (R-OVT-01 / R-OVT-02)', () => {
  it('computes overtime from worked time against the prorated contract', () => {
    assert.deepEqual(week('E1', '2026-W02'), {
      employee_id: 'E1',
      iso_week: '2026-W02',
      days_in_window: 7,
      contracted_hours: 40,
      scheduled_hours: 48,
      worked_hours: 49,
      overtime_hours: 9,
      overtime_cap_hours: 12,
      is_overtime_cap_exceeded: 0,
    });
  });

  it('flags overtime strictly above the cap', () => {
    const w = week('E2', '2026-W02');
    assert.deepEqual([w.worked_hours, w.overtime_hours, w.is_overtime_cap_exceeded], [36, 12, 1]);
  });

  it('prorates partial weeks and joiners by employed days', () => {
    const first = week('E1', '2026-W01');
    assert.deepEqual(
      [first.days_in_window, first.contracted_hours, first.worked_hours, first.overtime_hours],
      [4, 22.86, 16, 0],
    );
    const joiner = week('E3', '2026-W02');
    assert.deepEqual([joiner.days_in_window, joiner.contracted_hours], [4, 22.86]);
    assert.equal(week('E3', '2026-W01'), undefined, 'not employed in W01');
    assert.ok(!weeks.some((w) => w.employee_id === 'M1'), 'managers are not schedulable');
  });

  it('counts only complete punch pairs as worked time', () => {
    // E3 in W02: 468 min on the 9th; the no-show and the missing clock-out add nothing.
    assert.equal(week('E3', '2026-W02').worked_hours, 7.8);
    assert.equal(week('E3', '2026-W02').scheduled_hours, 24);
  });
});

describe('attendance_reconciliation (R-ATT-01 … R-ATT-03)', () => {
  it('classifies every due assignment and skips cancelled ones', () => {
    assert.equal(reconciliation.length, assignments.filter((a) => a.status === 'SCHEDULED').length);
    assert.equal(byAssignment.get(e3NoShow).outcome, 'NO_SHOW');
    assert.equal(byAssignment.get(e3Missing).outcome, 'MISSING_PUNCH');
    assert.equal(byAssignment.get(e4NoRecord).outcome, 'NO_RECORD');
  });

  it('measures lateness, early leave and paid time', () => {
    assert.deepEqual(
      ['worked_minutes', 'late_minutes', 'early_leave_minutes', 'extension_minutes'].map(
        (k) => byAssignment.get(e3Late)[k],
      ),
      [468, 12, 0, 0],
    );
    assert.deepEqual(
      ['worked_minutes', 'early_leave_minutes'].map((k) => byAssignment.get(e1Early)[k]),
      [450, 30],
    );
    const missing = byAssignment.get(e3Missing);
    assert.deepEqual(
      [missing.worked_minutes, missing.clock_out_at, missing.late_minutes],
      [null, null, 0],
    );
  });
});

describe('coverage_status (R-COV-01 / R-COV-04)', () => {
  it('counts only qualified assignees and reports the gap', () => {
    // 12 Jan (Monday): E1 (qualified, present) + E4 (skill expired on the 8th).
    assert.deepEqual(cell('2026-01-12'), {
      shift_id: 'SHIFT-2026-01-12-A',
      team_id: 'T1',
      skill_id: 'S1',
      coverage_id: 'COV-1',
      required_headcount: 2,
      assigned_headcount: 2,
      qualified_headcount: 1,
      attended_headcount: 1,
      gap_headcount: 1,
      attended_gap_headcount: 1,
      status: 'GAP',
    });
    // 9 Jan: E1 + E3 (late, but clocked in) fill both places.
    assert.deepEqual(
      [cell('2026-01-09').qualified_headcount, cell('2026-01-09').status],
      [2, 'MET'],
    );
  });

  it('separates planned gaps from gaps caused by absence', () => {
    // 10 Jan is a Saturday: needs 3; E1 attended, E3 was a no-show.
    const saturday = cell('2026-01-10');
    assert.deepEqual(
      [
        saturday.coverage_id,
        saturday.required_headcount,
        saturday.qualified_headcount,
        saturday.attended_headcount,
        saturday.gap_headcount,
        saturday.attended_gap_headcount,
      ],
      ['COV-2', 3, 2, 1, 1, 2],
    );
  });

  it('keeps assignments without a requirement as MET rows and unstaffed demand as GAP rows', () => {
    const beforeRequirement = cell('2026-01-01');
    assert.deepEqual(
      [
        beforeRequirement.coverage_id,
        beforeRequirement.required_headcount,
        beforeRequirement.status,
      ],
      [null, 0, 'MET'],
    );
    assert.deepEqual(
      [cell('2026-01-14').assigned_headcount, cell('2026-01-14').gap_headcount],
      [0, 2],
    );
    assert.equal(cell('2026-01-05', 'B'), undefined, 'no requirement and no assignment → no row');
  });
});

describe('leave_balance (R-LVE-03)', () => {
  it('subtracts only leave whose final status is APPROVED', () => {
    assert.deepEqual(leaveBalance(tables), [
      {
        employee_id: 'E1',
        leave_type: 'ANNUAL',
        entitled_days: 10,
        approved_days: 3,
        remaining_days: 7,
      },
      {
        employee_id: 'E1',
        leave_type: 'CASUAL',
        entitled_days: 3,
        approved_days: 1,
        remaining_days: 2,
      },
    ]);
  });
});

describe('metric helpers', () => {
  it('computes Jain’s index and nearest-rank percentiles', () => {
    assert.equal(jainIndex([5, 5, 5]), 1);
    assert.equal(jainIndex([0, 0]), 1);
    assert.equal(jainIndex([1, 0]), 0.5);
    assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
    assert.equal(percentile([5, 1, 3, 2, 4], 100), 5);
    assert.equal(percentile([], 50), null);
  });
});

// ---------------------------------------------------------------------------------------------
// Full profile: derived tables agree with independent recomputation and the metrics add up.
// ---------------------------------------------------------------------------------------------
describe('derived tables and metrics at full scale', () => {
  const dataset = generateDataset(config, 'full');
  const t = Object.fromEntries(dataset.tables);
  const metrics = computeMetrics(t, { patterns: config.operatingPatterns, window: dataset.window });

  it('has one week row per schedulable employee per employed week and no cap breach', () => {
    assert.ok(t.employee_week_summary.length > 25_000);
    assert.equal(t.employee_week_summary.filter((w) => w.is_overtime_cap_exceeded).length, 0);
    assert.ok(t.employee_week_summary.every((w) => w.overtime_hours <= w.overtime_cap_hours));
  });

  it('reconciles every due assignment, with nothing left unrecorded', () => {
    assert.equal(
      t.attendance_reconciliation.length,
      t.shift_assignment.filter((a) => a.status === 'SCHEDULED').length,
    );
    assert.equal(t.attendance_reconciliation.filter((r) => r.outcome === 'NO_RECORD').length, 0);
  });

  it('matches an independent count of short slots', () => {
    const active = new Map();
    for (const a of t.shift_assignment.filter((x) => x.status === 'SCHEDULED')) {
      const key = `${a.shift_id}|${a.team_id}|${a.skill_id}`;
      active.set(key, (active.get(key) ?? 0) + 1);
    }
    let short = 0;
    for (const s of t.shift) {
      for (const c of t.coverage_requirement) {
        if (c.template_code !== s.template_code || c.day_type !== s.day_type) continue;
        if (s.shift_date < c.effective_from || (c.effective_to && s.shift_date > c.effective_to))
          continue;
        if ((active.get(`${s.shift_id}|${c.team_id}|${c.skill_id}`) ?? 0) < c.min_headcount)
          short++;
      }
    }
    assert.equal(t.coverage_status.filter((c) => c.status === 'GAP').length, short);
  });

  it('never leaves a negative leave balance in the baseline', () => {
    assert.ok(t.leave_balance.every((b) => b.remaining_days >= 0));
  });

  it('produces metrics that add up to the source tables', () => {
    const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    assert.equal(total(metrics.M04_leave.by_status), 5000);
    assert.equal(total(metrics.M05_swaps.by_status), 1500);
    assert.equal(total(metrics.M06_attendance.by_outcome), t.attendance_reconciliation.length);
    assert.equal(metrics.M03_overtime.cap_breaches, 0);
    assert.ok(
      metrics.M01_coverage_fill.fill_rate > 0.95 && metrics.M01_coverage_fill.fill_rate < 1,
    );
    assert.ok(metrics.M01_coverage_fill.attended_fill_rate < metrics.M01_coverage_fill.fill_rate);
    for (const key of [
      'jain_nights',
      'jain_weekends',
      'jain_holidays',
      'jain_hours_per_contract',
    ]) {
      const { mean, min } = metrics.M08_fairness[key];
      assert.ok(mean > 0.8 && mean <= 1 && min > 0 && min <= mean, key);
    }
  });

  it('is reproducible and renders without missing values', () => {
    const again = computeMetrics(t, { patterns: config.operatingPatterns, window: dataset.window });
    assert.equal(JSON.stringify(again), JSON.stringify(metrics));
    const markdown = metricsMarkdown(metrics, { profileName: 'full', seed: config.seed });
    assert.doesNotMatch(markdown, /undefined|NaN|\[object/);
  });
});
