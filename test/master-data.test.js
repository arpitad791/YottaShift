import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabase, loadTables, tableColumns } from '../src/db/database.js';
import { ENUMS, ID_PATTERNS } from '../src/domain/constants.js';
import { loadConfig } from '../src/generator/config.js';
import { generateDataset } from '../src/generator/index.js';
import { generateMasterData } from '../src/generator/master/index.js';
import { addDays, isWeekend } from '../src/lib/dates.js';

const config = loadConfig();
const generated = {
  starter: generateMasterData(config, 'starter'),
  full: generateMasterData(config, 'full'),
};
const table = (profile, name) => generated[profile].tables.find(([t]) => t === name)[1];
const SCHEDULABLE = new Set(ENUMS.SCHEDULABLE_ROLE);

describe('master data volumes', () => {
  it('matches the brief at full scale', () => {
    assert.equal(table('full', 'team').length, 100);
    assert.equal(table('full', 'employee').length, 2000);
    assert.equal(table('full', 'shift').length, 90 * 4);
    assert.equal(table('full', 'holiday_calendar').length, 5);
  });

  it('uses the same generator for the starter profile', () => {
    assert.equal(table('starter', 'team').length, 10);
    assert.equal(table('starter', 'employee').length, 200);
    assert.equal(table('starter', 'shift').length, 28 * 4);
  });
});

for (const profile of ['starter', 'full']) {
  describe(`${profile} profile`, () => {
    const teams = table(profile, 'team');
    const employees = table(profile, 'employee');
    const employeeSkills = table(profile, 'employee_skill');
    const skills = table(profile, 'skill');
    const coverage = table(profile, 'coverage_requirement');
    const { window } = generated[profile];
    const employeeById = new Map(employees.map((e) => [e.employee_id, e]));
    const teamById = new Map(teams.map((t) => [t.team_id, t]));

    let db;
    before(() => {
      db = createDatabase();
      loadTables(db, generated[profile].tables);
    });
    after(() => db.close());

    it('loads into the schema with every foreign key resolved', () => {
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    });

    it('is identical when generated again with the same seed', () => {
      assert.deepEqual(generateMasterData(config, profile).tables, generated[profile].tables);
    });

    it('changes when the seed changes', () => {
      const other = generateMasterData({ ...config, seed: config.seed + 1 }, profile);
      const names = (tables) => tables.find(([t]) => t === 'employee')[1].map((e) => e.full_name);
      assert.notDeepEqual(names(other.tables), names(generated[profile].tables));
    });

    it('numbers employees and teams consecutively from 1', () => {
      employees.forEach((e, i) =>
        assert.equal(e.employee_id, `EMP-${String(i + 1).padStart(6, '0')}`),
      );
      teams.forEach((t, i) => assert.equal(t.team_id, `TEAM-${String(i + 1).padStart(3, '0')}`));
      for (const s of skills) assert.match(s.skill_id, ID_PATTERNS.skill);
      for (const c of coverage) assert.match(c.coverage_id, ID_PATTERNS.coverageRequirement);
    });

    it('gives every team exactly one manager, who is its manager_employee_id', () => {
      for (const team of teams) {
        const managers = employees.filter(
          (e) => e.team_id === team.team_id && e.employee_role === 'MANAGER',
        );
        assert.equal(managers.length, 1, team.team_id);
        assert.equal(managers[0].employee_id, team.manager_employee_id);
      }
    });

    it('keeps HR and ops partners in the Workforce Office, which is the last team', () => {
      const office = teams.at(-1);
      assert.equal(office.team_function, 'WORKFORCE_OFFICE');
      assert.equal(teams.filter((t) => t.team_function === 'WORKFORCE_OFFICE').length, 1);
      for (const e of employees) {
        if (e.employee_role === 'HR_PARTNER' || e.employee_role === 'OPS_PARTNER')
          assert.equal(e.team_id, office.team_id);
      }
      for (const team of teams) {
        const partner = employeeById.get(team.hr_partner_employee_id);
        assert.equal(partner.employee_role, 'HR_PARTNER', team.team_id);
      }
      assert.ok(employees.some((e) => e.employee_role === 'OPS_PARTNER'));
    });

    it('links each employee to the policy of their employment type and keeps dates in order', () => {
      const policyType = new Map(
        table(profile, 'labor_policy').map((p) => [p.policy_id, p.employment_type]),
      );
      for (const e of employees) {
        assert.equal(policyType.get(e.policy_id), e.employment_type, e.employee_id);
        if (e.employment_type === 'PART_TIME') assert.equal(e.employee_role, 'MEMBER');
        assert.ok(e.hire_date >= teamById.get(e.team_id).effective_from, e.employee_id);
        if (e.termination_date) {
          assert.ok(e.termination_date >= window.startDate && e.termination_date <= window.endDate);
          assert.ok(e.termination_date >= e.hire_date);
        }
      }
    });

    it('records skills that are valid from the hire date, with certification expiry = start + validity − 1', () => {
      const skillById = new Map(skills.map((s) => [s.skill_id, s]));
      const held = new Set(employeeSkills.map((r) => `${r.employee_id}|${r.skill_id}`));
      for (const e of employees)
        assert.ok(held.has(`${e.employee_id}|${e.primary_skill_id}`), e.employee_id);
      for (const row of employeeSkills) {
        const validity = skillById.get(row.skill_id).certification_validity_days;
        assert.ok(row.valid_from >= employeeById.get(row.employee_id).hire_date);
        if (validity === null) assert.equal(row.valid_to, null);
        else assert.equal(row.valid_to, addDays(row.valid_from, validity - 1));
      }
    });

    it('creates leave entitlements only for schedulable employees, one per entitled type', () => {
      const entitlements = table(profile, 'leave_entitlement');
      const schedulable = employees.filter((e) => SCHEDULABLE.has(e.employee_role));
      assert.equal(entitlements.length, schedulable.length * ENUMS.ENTITLED_LEAVE_TYPE.length);
      for (const row of entitlements)
        assert.ok(SCHEDULABLE.has(employeeById.get(row.employee_id).employee_role));
    });

    it('derives shift day types from the holiday calendar and weekends (R-COV-03)', () => {
      const holidays = new Set(table(profile, 'holiday_calendar').map((h) => h.holiday_date));
      for (const shift of table(profile, 'shift')) {
        const expected = holidays.has(shift.shift_date)
          ? 'HOLIDAY'
          : isWeekend(shift.shift_date)
            ? 'WEEKEND'
            : 'WEEKDAY';
        assert.equal(shift.day_type, expected, shift.shift_id);
      }
    });

    it('only requires templates and day types of the team’s operating pattern (R-COV-02)', () => {
      for (const row of coverage) {
        const team = teamById.get(row.team_id);
        const pattern = config.operatingPatterns[team.operating_pattern];
        assert.notEqual(team.team_function, 'WORKFORCE_OFFICE');
        assert.ok(pattern.templates.includes(row.template_code), row.coverage_id);
        if (row.day_type === 'WEEKEND') assert.ok(pattern.staffsWeekends, row.coverage_id);
        if (row.day_type === 'HOLIDAY') assert.ok(pattern.staffsHolidays, row.coverage_id);
      }
      for (const team of teams.filter((t) => t.team_function !== 'WORKFORCE_OFFICE')) {
        for (const code of config.operatingPatterns[team.operating_pattern].templates) {
          assert.ok(
            coverage.some(
              (r) =>
                r.team_id === team.team_id && r.template_code === code && r.day_type === 'WEEKDAY',
            ),
            `${team.team_id} has no weekday requirement for ${code}`,
          );
        }
      }
    });

    it('never overlaps effective ranges for the same requirement key (R-COV-01)', () => {
      const byKey = Map.groupBy(coverage, (r) =>
        [r.team_id, r.template_code, r.skill_id, r.day_type].join('|'),
      );
      for (const [key, rows] of byKey) {
        const sorted = rows.toSorted((a, b) => a.effective_from.localeCompare(b.effective_from));
        for (let i = 1; i < sorted.length; i++) {
          assert.ok(
            sorted[i - 1].effective_to !== null &&
              sorted[i - 1].effective_to < sorted[i].effective_from,
            key,
          );
        }
      }
    });

    it('requires only skills that someone in the team holds', () => {
      for (const row of coverage) {
        const holders = employeeSkills.filter(
          (s) =>
            s.skill_id === row.skill_id &&
            employeeById.get(s.employee_id).team_id === row.team_id &&
            SCHEDULABLE.has(employeeById.get(s.employee_id).employee_role),
        );
        assert.ok(holders.length > 0, row.coverage_id);
      }
    });

    it('keeps weekly demand within what each team could staff at its maximum hours', () => {
      const policies = new Map(table(profile, 'labor_policy').map((p) => [p.policy_id, p]));
      for (const team of teams.filter((t) => t.team_function !== 'WORKFORCE_OFFICE')) {
        const demand = coverage
          .filter((r) => r.team_id === team.team_id && r.effective_to === null)
          .reduce(
            (sum, r) =>
              sum +
              r.min_headcount * (r.day_type === 'WEEKDAY' ? 5 : r.day_type === 'WEEKEND' ? 2 : 0),
            0,
          );
        const capacity = employees
          .filter((e) => e.team_id === team.team_id && SCHEDULABLE.has(e.employee_role))
          .reduce((sum, e) => sum + policies.get(e.policy_id).max_weekly_scheduled_hours / 8, 0);
        assert.ok(
          demand <= capacity * 1.1,
          `${team.team_id}: demand ${demand} vs capacity ${capacity}`,
        );
      }
    });
  });
}

describe('distributions at full scale', () => {
  const employees = table('full', 'employee');
  const schedulable = employees.filter((e) => SCHEDULABLE.has(e.employee_role));

  it('mixes full- and part-time staff, joiners and leavers', () => {
    const partTime =
      schedulable.filter((e) => e.employment_type === 'PART_TIME').length / schedulable.length;
    assert.ok(partTime > 0.1 && partTime < 0.25, `part-time share ${partTime}`);
    assert.ok(
      employees.some((e) => e.hire_date >= '2026-01-01'),
      'no joiners',
    );
    assert.ok(
      employees.some((e) => e.termination_date !== null),
      'no leavers',
    );
  });

  it('varies team sizes and uses every function and operating pattern', () => {
    const teams = table('full', 'team');
    const sizes = Object.values(Object.groupBy(employees, (e) => e.team_id)).map(
      (members) => members.length,
    );
    assert.ok(
      Math.max(...sizes) - Math.min(...sizes) >= 10,
      `sizes ${Math.min(...sizes)}..${Math.max(...sizes)}`,
    );
    assert.deepEqual(new Set(teams.map((t) => t.team_function)), new Set(ENUMS.TEAM_FUNCTION));
    assert.deepEqual(
      new Set(teams.map((t) => t.operating_pattern)),
      new Set(ENUMS.OPERATING_PATTERN),
    );
  });

  it('lets some certifications lapse and revises some requirements inside the window', () => {
    const lapsing = table('full', 'employee_skill').filter(
      (s) => s.valid_to && s.valid_to <= '2026-03-31',
    );
    assert.ok(lapsing.length > 0);
    assert.ok(table('full', 'coverage_requirement').some((r) => r.effective_from > '2026-01-01'));
  });
});

describe('generate CLI', () => {
  it('writes one CSV per table with schema-ordered headers', () => {
    const dataset = generateDataset(config, 'starter');
    const out = mkdtempSync(join(tmpdir(), 'yottashift-'));
    try {
      execFileSync(
        process.execPath,
        ['src/cli/generate.js', '--profile', 'starter', '--out', out],
        { stdio: 'pipe' },
      );
      const dir = join(out, 'starter', 'csv');
      const db = createDatabase();
      const expected = dataset.tables.map(([name]) => `${name}.csv`).sort();
      assert.deepEqual(readdirSync(dir).sort(), expected);
      for (const [name, rows] of dataset.tables) {
        const lines = readFileSync(join(dir, `${name}.csv`), 'utf8')
          .trimEnd()
          .split('\n');
        assert.equal(lines[0], tableColumns(db, name).join(','), name);
        assert.equal(lines.length - 1, rows.length, name);
      }
      db.close();
      const reports = join(out, 'starter', 'reports');
      assert.deepEqual(readdirSync(reports).sort(), ['metrics.json', 'metrics.md']);
      const metrics = JSON.parse(readFileSync(join(reports, 'metrics.json'), 'utf8'));
      assert.equal(metrics.M04_leave.requests, config.profiles.starter.leaveRequests);
      const truthDir = join(out, 'starter', 'ground_truth');
      assert.deepEqual(readdirSync(truthDir).sort(), ['ground_truth.csv', 'ground_truth.json']);
      const truth = JSON.parse(readFileSync(join(truthDir, 'ground_truth.json'), 'utf8'));
      assert.deepEqual(truth, dataset.groundTruth);
      assert.ok(!readdirSync(dir).some((file) => /ground|truth|label|anomal/i.test(file)));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('exits with an error for an unknown profile', () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, ['src/cli/generate.js', '--profile', 'huge'], {
          stdio: 'pipe',
        }),
      (error) => error.status === 1 && /Unknown profile/.test(error.stderr.toString()),
    );
  });
});
