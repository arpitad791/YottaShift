import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOAD_ORDER } from '../src/db/database.js';
import { loadConfig } from '../src/generator/config.js';
import { generateDataset } from '../src/generator/index.js';
import { addDays } from '../src/lib/dates.js';
import { parseCsv, readDataset } from '../src/validation/read-dataset.js';
import { validateDataset } from '../src/validation/validate.js';

const config = loadConfig();
const starter = generateDataset(config, 'starter');
const fresh = () => ({
  tables: structuredClone(Object.fromEntries(starter.tables)),
  layoutProblems: [],
  groundTruth: structuredClone(starter.groundTruth),
});
const validate = (input) => validateDataset(input, { patterns: config.operatingPatterns });
const failuresOf = (summary, id) =>
  [...summary.integrity, ...summary.decisions].find((c) => c.id === id)?.failures ?? 0;

describe('reading exported files', () => {
  it('parses RFC 4180 CSV: quotes, doubled quotes, commas, newlines, CRLF, empty fields', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,"x, ""y""",\r\n2,"line\nbreak",z\n'), [
      ['a', 'b', 'c'],
      ['1', 'x, "y"', ''],
      ['2', 'line\nbreak', 'z'],
    ]);
  });

  it('loads tables in parent-first order, the same order the generator uses', () => {
    assert.deepEqual(
      starter.tables.map(([name]) => name),
      [...LOAD_ORDER],
    );
  });
});

describe('validation of a good dataset', () => {
  it('passes every check on the generated starter dataset', () => {
    const summary = validate(fresh());
    assert.equal(summary.status, 'PASS', summary.problems.join('\n'));
    assert.equal(summary.evaluation.overall.recall, 1);
    assert.equal(summary.evaluation.overall.precision, 1);
    assert.equal(summary.evaluation.boundary.flagged, 0);
    assert.ok(summary.acceptance.every((a) => a.passed));
  });

  it('reads back from CSV exactly what was generated, and the CLI reports PASS', () => {
    const out = mkdtempSync(join(tmpdir(), 'yottashift-validate-'));
    try {
      execFileSync(
        process.execPath,
        ['src/cli/generate.js', '--profile', 'starter', '--out', out],
        { stdio: 'pipe' },
      );
      const read = readDataset(join(out, 'starter'));
      assert.deepEqual(read.layoutProblems, []);
      assert.deepEqual(
        read.tables,
        Object.fromEntries(starter.tables),
        'CSV round trip changes nothing',
      );
      assert.deepEqual(read.groundTruth, starter.groundTruth);

      execFileSync(
        process.execPath,
        ['src/cli/validate.js', '--profile', 'starter', '--data', out],
        { stdio: 'pipe' },
      );
      const summary = JSON.parse(
        readFileSync(join(out, 'starter', 'reports', 'validation_summary.json'), 'utf8'),
      );
      assert.equal(summary.status, 'PASS');

      // Removing a team from team.csv orphans its employees: validation must fail with exit 1.
      const teamFile = join(out, 'starter', 'csv', 'team.csv');
      const lines = readFileSync(teamFile, 'utf8').trimEnd().split('\n');
      writeFileSync(teamFile, `${[lines[0], ...lines.slice(2)].join('\n')}\n`);
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            ['src/cli/validate.js', '--profile', 'starter', '--data', out],
            { stdio: 'pipe' },
          ),
        (error) => error.status === 1 && /Status FAIL/.test(error.stdout.toString()),
      );

      unlinkSync(join(out, 'starter', 'csv', 'skill.csv'));
      assert.match(
        readDataset(join(out, 'starter')).layoutProblems.join(),
        /skill\.csv is missing/,
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('each check fails on purpose-built broken data', () => {
  const cases = [
    ['I-03', 'duplicate primary key', (t) => t.skill.push({ ...t.skill[0] })],
    ['I-04', 'duplicate natural key', (t) => t.team.push({ ...t.team[0], team_id: 'TEAM-999' })],
    ['I-05', 'dangling foreign key', (t) => (t.employee[5].team_id = 'TEAM-998')],
    ['I-06', 'value outside its enum', (t) => (t.leave_request[0].leave_type = 'MATERNITY')],
    [
      'I-07',
      'malformed ID',
      (t) => t.skill.push({ ...t.skill[0], skill_id: 'SKL-1', skill_name: 'Extra' }),
    ],
    [
      'I-08',
      'dates out of order',
      (t) => (t.employee[3].termination_date = addDays(t.employee[3].hire_date, -1)),
    ],
    [
      'I-09',
      'overlapping effective ranges',
      (t) => {
        const row = t.coverage_requirement[0];
        t.coverage_requirement.push({
          ...row,
          coverage_id: 'COV-999999',
          effective_from: addDays(row.effective_from, 1),
        });
      },
    ],
    [
      'I-10',
      'event chain with a gap',
      (t) =>
        t.leave_request_event.splice(
          t.leave_request_event.findIndex((e) => e.event_seq === 1),
          1,
        ),
    ],
    [
      'I-11',
      'policy that does not match the employment type',
      (t) => {
        const e = t.employee.find((x) => x.employment_type === 'FULL_TIME');
        e.employment_type = 'PART_TIME';
      },
    ],
    [
      'I-12',
      'derived value that does not reconcile',
      (t) => (t.employee_week_summary[0].worked_hours += 1),
    ],
    [
      'D-01',
      'leave outcome that the rules would not produce',
      (t) => {
        const l = t.leave_request.find(
          (x) => x.status === 'REJECTED' && x.decision_reason_code === 'INSUFFICIENT_BALANCE',
        );
        l.decision_reason_code = 'TEAM_LEAVE_CAP_REACHED';
        t.leave_request_event.find(
          (e) => e.leave_request_id === l.leave_request_id && e.to_status === 'REJECTED',
        ).reason_code = 'TEAM_LEAVE_CAP_REACHED';
      },
    ],
    [
      'D-02',
      'swap approval recorded under someone other than the team manager',
      (t) => {
        const s = t.swap_request.find((x) => x.status === 'APPLIED' && x.decided_at);
        const other = t.team.find((team) => team.team_id !== s.team_id).manager_employee_id;
        s.decided_by_employee_id = other;
      },
    ],
  ];

  for (const [id, name, mutate] of cases) {
    it(`${id}: ${name}`, () => {
      const input = fresh();
      mutate(input.tables);
      const summary = validate(input);
      assert.ok(failuresOf(summary, id) > 0, `${id} did not fail`);
      assert.equal(summary.status, 'FAIL');
    });
  }

  it('I-01: a missing or misshapen file', () => {
    const input = fresh();
    input.layoutProblems.push('skill.csv is missing');
    assert.ok(failuresOf(validate(input), 'I-01') > 0);
  });
});

describe('evaluation fails when detection and labels disagree', () => {
  it('a missing label turns a detection into a finding outside the labels', () => {
    const input = fresh();
    input.groundTruth = input.groundTruth.filter((l) => l.issue_type !== 'SKILL_ABSENT');
    const summary = validate(input);
    assert.equal(summary.status, 'FAIL');
    assert.ok(
      summary.evaluation.per_type.find((r) => r.issue_type === 'SKILL_ABSENT').false_positives > 0,
    );
  });

  it('a label on a clean record is a missed detection (recall < 1)', () => {
    const input = fresh();
    const clean = input.tables.shift_assignment.find(
      (a) =>
        a.status === 'SCHEDULED' &&
        !input.groundTruth.some((l) => l.record_ids.includes(a.assignment_id)),
    );
    input.groundTruth.push({
      ...input.groundTruth[0],
      ground_truth_id: 'GT-999999',
      record_ids: clean.assignment_id,
    });
    const summary = validate(input);
    assert.ok(
      summary.evaluation.per_type.find((r) => r.issue_type === input.groundTruth[0].issue_type)
        .recall < 1,
    );
    assert.equal(summary.status, 'FAIL');
  });

  it('a boundary label on a violating record counts as a flagged boundary case', () => {
    const input = fresh();
    const anomaly = input.groundTruth.find((l) => l.issue_type === 'DOUBLE_BOOKED');
    input.groundTruth.push({
      ...anomaly,
      ground_truth_id: 'GT-999998',
      label_class: 'BOUNDARY',
      issue_type: 'BOUNDARY_REST_AT_MINIMUM',
      expected_detection: 0,
    });
    const summary = validate(input);
    assert.equal(summary.evaluation.boundary.flagged, 1);
    assert.equal(summary.status, 'FAIL');
  });
});
