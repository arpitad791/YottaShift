import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDatabase, loadTables } from '../src/db/database.js';
import { ENUMS, ID_PATTERNS } from '../src/domain/constants.js';
import { RULES } from '../src/domain/rules.js';
import { GROUND_TRUTH_COLUMNS } from '../src/export/ground-truth.js';
import { UNREACHABLE_BOUNDARIES } from '../src/generator/anomalies/inject.js';
import { loadConfig } from '../src/generator/config.js';
import { generateDataset } from '../src/generator/index.js';
import { checkBusinessRules } from '../src/validation/business-rules.js';

const config = loadConfig();
const ANOMALY_TYPES = [
  'DOUBLE_BOOKED',
  'LEAVE_OVERLAP',
  'SKILL_ABSENT',
  'OVERTIME_CAP_EXCEEDED',
  'SWAP_WITHOUT_APPROVAL',
];
const BOUNDARY_TYPES = ENUMS.ISSUE_TYPE.filter((t) => t.startsWith('BOUNDARY_'));
// Tables injection may change; every other source table must stay identical to the baseline.
const PRIMARY_KEYS = {
  shift_assignment: 'assignment_id',
  shift_assignment_event: 'event_id',
  attendance_event: 'attendance_event_id',
  swap_request: 'swap_id',
  swap_request_event: 'event_id',
};

const run = (profile) => {
  const injected = generateDataset(config, profile);
  const baseline = generateDataset(config, profile, { anomalies: false });
  const sourceNames = injected.tables.slice(0, 17).map(([name]) => name);
  return {
    profile,
    injected,
    tables: Object.fromEntries(injected.tables),
    base: Object.fromEntries(baseline.tables),
    sourceNames,
    truth: injected.groundTruth,
  };
};
const runs = { starter: run('starter'), full: run('full') };
const idsOf = (label) => label.record_ids.split(';');
const intersects = (a, b) => a.some((id) => b.includes(id));

for (const profile of ['starter', 'full']) {
  const { tables, base, sourceNames, truth } = runs[profile];
  const settings = config.profiles[profile];
  const findings = checkBusinessRules(tables, { patterns: config.operatingPatterns }).filter(
    (f) => f.kind === 'VIOLATION',
  );
  const anomalies = truth.filter((l) => l.label_class === 'ANOMALY');
  const boundaries = truth.filter((l) => l.label_class === 'BOUNDARY');

  describe(`${profile}: ground truth`, () => {
    it('injects exactly the configured number of each anomaly type', () => {
      for (const type of ANOMALY_TYPES) {
        assert.equal(
          anomalies.filter((l) => l.issue_type === type).length,
          settings.anomaliesPerType,
          type,
        );
      }
    });

    it('adds the configured number of each reachable boundary case (starter: as the data allows)', () => {
      // Boundary cases are found in, or nudged from, real records. The small starter profile
      // has too few swaps decided within 24 h of their shift to place a notice-limit case.
      for (const type of BOUNDARY_TYPES) {
        const n = boundaries.filter((l) => l.issue_type === type).length;
        if (type in UNREACHABLE_BOUNDARIES) assert.equal(n, 0, type);
        else if (profile === 'full') assert.equal(n, settings.boundaryCasesPerType, type);
        else assert.ok(n <= settings.boundaryCasesPerType, `${type}: ${n}`);
      }
    });

    it('uses the documented layout, IDs, rules and classes', () => {
      truth.forEach((l, i) => {
        assert.deepEqual(Object.keys(l), [...GROUND_TRUTH_COLUMNS]);
        assert.equal(l.ground_truth_id, `GT-${String(i + 1).padStart(6, '0')}`);
        assert.match(l.ground_truth_id, ID_PATTERNS.groundTruth);
        assert.ok(ENUMS.ISSUE_TYPE.includes(l.issue_type), l.issue_type);
        assert.ok(l.rule_id in RULES, l.rule_id);
        assert.equal(l.expected_detection, l.label_class === 'ANOMALY' ? 1 : 0);
        assert.ok(l.description.length > 0);
      });
    });

    it('points every label at records that exist', () => {
      const tableFor = {
        ASG: 'shift_assignment',
        LVE: 'leave_request',
        SWP: 'swap_request',
        ATT: 'attendance_event',
      };
      const keyFor = {
        ASG: 'assignment_id',
        LVE: 'leave_request_id',
        SWP: 'swap_id',
        ATT: 'attendance_event_id',
      };
      const index = Object.fromEntries(
        Object.entries(tableFor).map(([prefix, table]) => [
          prefix,
          new Set(tables[table].map((r) => r[keyFor[prefix]])),
        ]),
      );
      for (const l of truth) {
        for (const id of idsOf(l))
          assert.ok(index[id.slice(0, 3)].has(id), `${l.ground_truth_id}: ${id}`);
        assert.ok(tables.employee.some((e) => e.employee_id === l.employee_id));
      }
    });
  });

  describe(`${profile}: detection against the ground truth`, () => {
    it('finds every labelled anomaly with the detector for its type', () => {
      for (const l of anomalies) {
        assert.ok(
          findings.some((f) => f.issueType === l.issue_type && intersects(f.recordIds, idsOf(l))),
          `${l.ground_truth_id} ${l.issue_type} not detected`,
        );
      }
    });

    it('flags no boundary case', () => {
      for (const l of boundaries) {
        assert.ok(
          !findings.some((f) => f.ruleId === l.rule_id && intersects(f.recordIds, idsOf(l))),
          `${l.ground_truth_id} ${l.issue_type} was flagged`,
        );
      }
    });

    it('raises no typed finding outside the labels, and side effects only on labelled records', () => {
      const labelled = anomalies.flatMap(idsOf);
      for (const f of findings) {
        if (f.issueType) {
          assert.ok(
            anomalies.some(
              (l) => l.issue_type === f.issueType && intersects(f.recordIds, idsOf(l)),
            ),
            `unexpected ${f.issueType}: ${f.recordIds.join(';')}`,
          );
        } else {
          assert.ok(intersects(f.recordIds, labelled), `unlabelled ${f.ruleId}: ${f.message}`);
        }
      }
    });

    it('shows the breaches in the derived tables', () => {
      const breaches = tables.employee_week_summary.filter((w) => w.is_overtime_cap_exceeded === 1);
      assert.equal(breaches.length, settings.anomaliesPerType);
      const atCap = boundaries.filter((l) => l.issue_type === 'BOUNDARY_OVERTIME_AT_CAP');
      const shifts = new Map(tables.shift.map((s) => [s.shift_id, s]));
      const assignments = new Map(tables.shift_assignment.map((a) => [a.assignment_id, a]));
      for (const l of atCap) {
        const a = assignments.get(idsOf(l).find((id) => id.startsWith('ASG')));
        const week = tables.employee_week_summary.find(
          (w) => w.employee_id === l.employee_id && w.iso_week === shifts.get(a.shift_id).iso_week,
        );
        assert.equal(week.overtime_hours, week.overtime_cap_hours, l.ground_truth_id);
        assert.equal(week.is_overtime_cap_exceeded, 0);
      }
    });
  });

  describe(`${profile}: isolation and leakage`, () => {
    it('leaves every untouched table identical to the clean baseline', () => {
      for (const name of sourceNames) {
        if (!(name in PRIMARY_KEYS)) assert.deepEqual(tables[name], base[name], name);
      }
    });

    it('changes only rows that belong to labelled records', () => {
      const labelled = new Set(truth.flatMap(idsOf));
      const related = (row) =>
        labelled.has(row[PRIMARY_KEYS.shift_assignment]) ||
        labelled.has(row.assignment_id) ||
        labelled.has(row.swap_id) ||
        labelled.has(row.attendance_event_id);
      for (const [name, key] of Object.entries(PRIMARY_KEYS)) {
        const before = new Map(base[name].map((r) => [r[key], r]));
        const after = new Map(tables[name].map((r) => [r[key], r]));
        for (const [id, row] of after) {
          if (JSON.stringify(before.get(id)) !== JSON.stringify(row))
            assert.ok(related(row), `${name} ${id} changed`);
        }
        for (const [id, row] of before)
          if (!after.has(id)) assert.ok(related(row), `${name} ${id} removed`);
      }
    });

    it('keeps labels out of the input tables', () => {
      assert.ok(!sourceNames.some((name) => /ground|truth|label|anomal/i.test(name)));
      for (const name of sourceNames) {
        const columns = Object.keys(tables[name][0] ?? {});
        assert.ok(!columns.some((c) => /issue|ground|truth|label|anomal|injected/i.test(c)), name);
      }
    });
  });
}

describe('injected dataset', () => {
  it('still loads into the schema with every foreign key resolved', () => {
    const db = createDatabase();
    loadTables(db, runs.full.injected.tables);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
  });

  it('labels the same records on every run with the same seed', () => {
    assert.deepEqual(generateDataset(config, 'starter').groundTruth, runs.starter.truth);
  });
});
