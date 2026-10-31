import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDatabase, insertRows, readSchema } from '../src/db/database.js';
import { COLUMN_ENUMS, ENUMS, ID_PATTERNS, TRANSITIONS } from '../src/domain/constants.js';
import { RULES } from '../src/domain/rules.js';
import { VALID_FIXTURE } from './helpers/schema-fixture.js';

function loadFixture(db) {
  db.exec('BEGIN');
  for (const [table, rows] of VALID_FIXTURE) insertRows(db, table, rows);
  db.exec('COMMIT');
}

function fixtureRow(table, index = 0) {
  const entry = VALID_FIXTURE.find(([name]) => name === table);
  return structuredClone(entry[1][index]);
}

function schemaEnumChecks() {
  const checks = {};
  for (const [, table, body] of readSchema().matchAll(
    /CREATE TABLE (\w+) \(([\s\S]*?)\n\) STRICT;/g,
  )) {
    for (const [, column, list] of body.matchAll(/CHECK \((\w+) IN \(('[^)]*)\)\)/g)) {
      checks[`${table}.${column}`] = [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    }
  }
  return checks;
}

describe('schema', () => {
  it('loads into SQLite and accepts a fully consistent dataset', () => {
    const db = createDatabase();
    loadFixture(db);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const tables = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    const fixtureTables = [...new Set(VALID_FIXTURE.map(([table]) => table))].sort();
    assert.deepEqual(tables, fixtureTables, 'fixture should exercise every table');
  });

  it('keeps every enum CHECK list identical to src/domain/constants.js', () => {
    const checks = schemaEnumChecks();
    assert.deepEqual(Object.keys(checks).sort(), Object.keys(COLUMN_ENUMS).sort());
    for (const [column, enumName] of Object.entries(COLUMN_ENUMS)) {
      assert.deepEqual(checks[column], [...ENUMS[enumName]], column);
    }
  });

  it('defines transitions only between known statuses', () => {
    for (const [enumName, graph] of Object.entries(TRANSITIONS)) {
      const statuses = new Set(ENUMS[enumName]);
      for (const [from, targets] of Object.entries(graph)) {
        if (from !== 'null') assert.ok(statuses.has(from), `${enumName}: ${from}`);
        for (const to of targets) assert.ok(statuses.has(to), `${enumName}: ${from} -> ${to}`);
      }
      for (const status of statuses) assert.ok(status in graph, `${enumName}: ${status} missing`);
    }
  });

  it('uses fixture IDs that match the documented ID patterns', () => {
    const samples = {
      employee: 'EMP-000001',
      shift: 'SHIFT-2026-01-01-A',
      leaveRequest: 'LVE-2026-000001',
      attendanceEvent: 'ATT-EMP-000003-20260126T055700',
      swapRequest: 'SWP-2026-000001',
      team: 'TEAM-001',
      skill: 'SKL-001',
      laborPolicy: 'POL-FT-2026',
      holiday: 'HOL-2026-01-26',
      coverageRequirement: 'COV-000001',
      assignment: 'ASG-2026-000001',
      lifecycleEvent: 'SWP-2026-000001-E03',
      groundTruth: 'GT-000001',
    };
    assert.deepEqual(Object.keys(samples).sort(), Object.keys(ID_PATTERNS).sort());
    for (const [kind, id] of Object.entries(samples)) assert.match(id, ID_PATTERNS[kind], kind);
  });

  it('documents every rule in docs/business-rules.md and nothing else', () => {
    const doc = readFileSync(new URL('../docs/business-rules.md', import.meta.url), 'utf8');
    const documented = [...doc.matchAll(/^#### (R-[A-Z]{3}-\d{2})\b/gm)].map((m) => m[1]);
    assert.deepEqual(documented, Object.keys(RULES));
  });
});

describe('schema rejects structurally invalid rows', () => {
  // Each case changes one valid fixture row and names the constraint that must reject it,
  // so a case cannot pass by tripping some unrelated check.
  const cases = [
    {
      name: 'malformed employee ID',
      table: 'employee',
      change: { employee_id: 'EMP-12' },
      expect: 'employee_id GLOB',
    },
    {
      name: 'unknown enum value',
      table: 'employee',
      change: { employee_id: 'EMP-000009', employee_role: 'INTERN' },
      expect: 'employee_role IN',
    },
    {
      name: 'impossible calendar date',
      table: 'employee',
      change: { employee_id: 'EMP-000009', hire_date: '2026-02-30' },
      expect: 'hire_date IS date',
    },
    {
      name: 'timestamp in another offset',
      table: 'shift',
      change: {
        shift_id: 'SHIFT-2026-01-28-C',
        shift_date: '2026-01-28',
        template_code: 'C',
        start_at: '2026-01-28T22:00:00Z',
        end_at: '2026-01-29T06:00:00+05:30',
        day_type: 'WEEKDAY',
        holiday_id: null,
      },
      expect: 'start_at GLOB',
    },
    {
      name: 'iso_week not matching shift_date',
      table: 'shift',
      change: { shift_id: 'SHIFT-2026-01-26-C', template_code: 'C', iso_week: '2026-W04' },
      expect: 'iso_week = strftime',
    },
    {
      name: 'holiday day type without holiday',
      table: 'shift',
      change: { shift_id: 'SHIFT-2026-01-26-C', template_code: 'C', holiday_id: null },
      expect: "(day_type = 'HOLIDAY')",
    },
    {
      name: 'attendance ID not matching its timestamp',
      table: 'attendance_event',
      change: { attendance_event_id: 'ATT-EMP-000003-20260126T055701' },
      expect: "attendance_event_id = 'ATT-'",
    },
    {
      name: 'manual punch without the ops partner who entered it',
      table: 'attendance_event',
      change: {
        attendance_event_id: 'ATT-EMP-000003-20260126T140500',
        event_type: 'CLOCK_OUT',
        event_at: '2026-01-26T14:05:00+05:30',
        recorded_at: '2026-01-27T09:00:00+05:30',
        source: 'MANUAL',
      },
      expect: "(source = 'MANUAL')",
    },
    {
      name: 'leave day count not matching its dates',
      table: 'leave_request',
      change: { leave_request_id: 'LVE-2026-000009', requested_days: 3 },
      expect: 'requested_days = julianday',
    },
    {
      name: 'approved leave without a decision',
      table: 'leave_request',
      change: {
        leave_request_id: 'LVE-2026-000009',
        decided_at: null,
        decided_by_role: null,
        decided_by_employee_id: null,
        decision_rule_id: null,
        decision_reason_code: null,
      },
      expect: "(status IN ('SUBMITTED', 'WITHDRAWN'))",
    },
    {
      name: 'leave ID year different from start year',
      table: 'leave_request',
      change: { leave_request_id: 'LVE-2025-000009' },
      expect: 'substr(leave_request_id',
    },
    {
      name: 'assignment for a shift that does not exist',
      table: 'shift_assignment',
      change: { assignment_id: 'ASG-2026-000009', shift_id: 'SHIFT-2026-02-28-A' },
      expect: 'FOREIGN KEY constraint failed',
    },
    {
      name: 'event ID not matching its sequence',
      table: 'shift_assignment_event',
      change: { event_seq: 3 },
      expect: "event_id = assignment_id || '-E'",
    },
    {
      name: 'SWAP type without counterpart assignment',
      table: 'swap_request',
      change: { swap_id: 'SWP-2026-000009', swap_type: 'SWAP' },
      expect: "(swap_type = 'SWAP')",
    },
    {
      name: 'coverage minimum of zero',
      table: 'coverage_requirement',
      change: { coverage_id: 'COV-000009', min_headcount: 0 },
      expect: 'min_headcount BETWEEN',
    },
    {
      name: 'gap that does not reconcile',
      table: 'coverage_status',
      change: { skill_id: 'SKL-002', coverage_id: null, required_headcount: 0, gap_headcount: 1 },
      expect: 'gap_headcount = max',
    },
    {
      name: 'balance that does not reconcile',
      table: 'leave_balance',
      change: { employee_id: 'EMP-000003', remaining_days: 11 },
      expect: 'remaining_days = entitled_days',
    },
  ];

  for (const { name, table, change, expect } of cases) {
    it(name, () => {
      const db = createDatabase();
      loadFixture(db);
      const row = Object.assign(fixtureRow(table), change);
      assert.throws(
        () => insertRows(db, table, [row]),
        (error) => error.message.includes(expect),
      );
    });
  }

  it('enforces the deferred team ↔ manager reference at commit', () => {
    const db = createDatabase();
    loadFixture(db);
    db.exec('BEGIN');
    insertRows(db, 'team', [
      Object.assign(fixtureRow('team'), {
        team_id: 'TEAM-003',
        team_name: 'Ghost',
        manager_employee_id: 'EMP-999999',
      }),
    ]);
    assert.throws(() => db.exec('COMMIT'), /FOREIGN KEY constraint failed/);
  });
});

describe('schema keeps business-rule anomalies loadable (R-GEN-03)', () => {
  it('accepts a double-booked employee', () => {
    const db = createDatabase();
    loadFixture(db);
    const duplicate = Object.assign(fixtureRow('shift_assignment'), {
      assignment_id: 'ASG-2026-000003',
      employee_id: 'EMP-000003',
      status: 'SCHEDULED',
    });
    assert.doesNotThrow(() => insertRows(db, 'shift_assignment', [duplicate]));
  });

  it('accepts a swap marked applied without any approval', () => {
    const db = createDatabase();
    loadFixture(db);
    const unapproved = Object.assign(fixtureRow('swap_request'), {
      swap_id: 'SWP-2026-000002',
      decided_at: null,
      decided_by_role: null,
      decided_by_employee_id: null,
      decision_rule_id: null,
      decision_reason_code: null,
    });
    assert.doesNotThrow(() => insertRows(db, 'swap_request', [unapproved]));
  });
});
