import { createDatabase, loadTables } from '../db/database.js';
import { deriveTables } from '../derive/derived-tables.js';
import { COLUMN_ENUMS, ENUMS, ID_PATTERNS, TRANSITIONS } from '../domain/constants.js';
import { addDays, addMinutes, clockMinutes, isoWeek, isWeekend } from '../lib/dates.js';

const SAMPLE_LIMIT = 5;
const DERIVED = [
  'employee_week_summary',
  'coverage_status',
  'leave_balance',
  'attendance_reconciliation',
];

const ID_COLUMNS = {
  employee: [
    'employee_id',
    'manager_employee_id',
    'hr_partner_employee_id',
    'decided_by_employee_id',
    'actor_employee_id',
    'recorded_by_employee_id',
    'requester_employee_id',
    'counterpart_employee_id',
  ],
  team: ['team_id'],
  skill: ['skill_id', 'primary_skill_id'],
  laborPolicy: ['policy_id'],
  holiday: ['holiday_id'],
  shift: ['shift_id'],
  coverageRequirement: ['coverage_id'],
  assignment: [
    'assignment_id',
    'supersedes_assignment_id',
    'requester_assignment_id',
    'counterpart_assignment_id',
  ],
  leaveRequest: ['leave_request_id'],
  swapRequest: ['swap_id'],
  attendanceEvent: ['attendance_event_id'],
  lifecycleEvent: ['event_id'],
};

function collector(id, name) {
  const result = { id, name, checked: 0, failures: 0, samples: [] };
  return {
    /** Runs a check body; an exception on broken data is reported as a failure, not a crash. */
    run(body) {
      try {
        body();
      } catch (error) {
        result.failures += 1;
        result.samples.push(`check could not run on this data: ${error.message}`);
      }
      return result;
    },
    result,
    count: (n = 1) => {
      result.checked += n;
    },
    fail: (message) => {
      result.failures += 1;
      if (result.samples.length < SAMPLE_LIMIT) result.samples.push(message);
    },
  };
}

function schemaMeta(db, tableNames) {
  const meta = {};
  for (const table of tableNames) {
    const info = db.prepare('SELECT name, pk FROM pragma_table_info(?)').all(table);
    const unique = db
      .prepare('SELECT name FROM pragma_index_list(?) WHERE "unique" = 1 AND origin = \'u\'')
      .all(table)
      .map((index) =>
        db
          .prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno')
          .all(index.name)
          .map((c) => c.name),
      );
    const foreignKeys = db
      .prepare(
        'SELECT "table" AS parent, "from" AS child, "to" AS parentColumn FROM pragma_foreign_key_list(?)',
      )
      .all(table);
    meta[table] = {
      primaryKey: info
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name),
      unique,
      foreignKeys,
    };
  }
  return meta;
}

const keyOf = (row, columns) => columns.map((c) => row[c]).join('|');

export function checkIntegrity(tables, { layoutProblems = [] } = {}) {
  const checks = [];
  const names = Object.keys(tables);
  const db = createDatabase();
  const meta = schemaMeta(db, names);

  {
    const c = collector('I-01', 'Every table file present with the schema header');
    checks.push(
      c.run(() => {
        c.count(names.length);
        layoutProblems.forEach((p) => c.fail(p));
      }),
    );
  }

  {
    const c = collector(
      'I-02',
      'Loads into sql/schema.sql (types, CHECK constraints, foreign keys)',
    );
    checks.push(
      c.run(() => {
        c.count(names.reduce((sum, n) => sum + tables[n].length, 0));
        try {
          loadTables(
            db,
            names.map((n) => [n, tables[n]]),
          );
          for (const p of db.prepare('PRAGMA foreign_key_check').all())
            c.fail(`${p.table} rowid ${p.rowid} → ${p.parent}`);
        } catch (error) {
          c.fail(error.message);
        }
      }),
    );
  }
  db.close();

  {
    const c = collector('I-03', 'Primary keys unique and not null');
    checks.push(
      c.run(() => {
        for (const n of names) {
          const seen = new Set();
          for (const row of tables[n]) {
            c.count();
            const key = keyOf(row, meta[n].primaryKey);
            if (meta[n].primaryKey.some((col) => row[col] === null))
              c.fail(`${n}: null key ${key}`);
            else if (seen.has(key)) c.fail(`${n}: duplicate key ${key}`);
            seen.add(key);
          }
        }
      }),
    );
  }

  {
    const c = collector('I-04', 'Unique / natural keys have no duplicates');
    checks.push(
      c.run(() => {
        for (const n of names) {
          for (const columns of meta[n].unique) {
            const seen = new Set();
            for (const row of tables[n]) {
              if (columns.some((col) => row[col] === null)) continue;
              c.count();
              const key = keyOf(row, columns);
              if (seen.has(key)) c.fail(`${n}(${columns.join(', ')}): duplicate ${key}`);
              seen.add(key);
            }
          }
        }
      }),
    );
  }

  {
    const c = collector('I-05', 'Every foreign key resolves (all joins)');
    checks.push(
      c.run(() => {
        const parents = new Map();
        const parentKeys = (table, column) => {
          const key = `${table}.${column}`;
          if (!parents.has(key))
            parents.set(key, new Set((tables[table] ?? []).map((r) => r[column])));
          return parents.get(key);
        };
        for (const n of names) {
          for (const fk of meta[n].foreignKeys) {
            const keys = parentKeys(fk.parent, fk.parentColumn);
            for (const row of tables[n]) {
              if (row[fk.child] === null) continue;
              c.count();
              if (!keys.has(row[fk.child]))
                c.fail(`${n}.${fk.child} = ${row[fk.child]} not in ${fk.parent}`);
            }
          }
        }
      }),
    );
  }

  {
    const c = collector('I-06', 'Enum columns hold allowed values');
    checks.push(
      c.run(() => {
        for (const [column, enumName] of Object.entries(COLUMN_ENUMS)) {
          const [table, field] = column.split('.');
          const allowed = new Set(ENUMS[enumName]);
          for (const row of tables[table] ?? []) {
            if (row[field] === null) continue;
            c.count();
            if (!allowed.has(row[field])) c.fail(`${column} = ${row[field]}`);
          }
        }
      }),
    );
  }

  {
    const c = collector('I-07', 'IDs follow the documented formats');
    checks.push(
      c.run(() => {
        for (const n of names) {
          const columns = Object.keys(tables[n][0] ?? {});
          for (const [kind, idColumns] of Object.entries(ID_COLUMNS)) {
            for (const column of idColumns.filter((col) => columns.includes(col))) {
              for (const row of tables[n]) {
                if (row[column] === null) continue;
                c.count();
                if (!ID_PATTERNS[kind].test(row[column])) c.fail(`${n}.${column} = ${row[column]}`);
              }
            }
          }
        }
      }),
    );
  }

  const t = tables;
  const shifts = new Map((t.shift ?? []).map((s) => [s.shift_id, s]));
  const employees = new Map((t.employee ?? []).map((e) => [e.employee_id, e]));
  const assignments = new Map((t.shift_assignment ?? []).map((a) => [a.assignment_id, a]));

  {
    const c = collector('I-08', 'Dates and timestamps in order');
    checks.push(
      c.run(() => {
        const ordered = (table, from, to, label = `${from} ≤ ${to}`, strict = false) => {
          for (const row of t[table]) {
            if (row[from] === null || row[to] === null) continue;
            c.count();
            if (strict ? row[from] >= row[to] : row[from] > row[to])
              c.fail(`${table} ${Object.values(row)[0]}: ${label}`);
          }
        };
        for (const n of ['labor_policy', 'team', 'shift_template', 'coverage_requirement'])
          ordered(n, 'effective_from', 'effective_to');
        ordered('employee_skill', 'valid_from', 'valid_to');
        ordered('employee', 'hire_date', 'termination_date');
        ordered('leave_entitlement', 'period_start', 'period_end');
        ordered('leave_request', 'start_date', 'end_date');
        ordered('leave_request', 'submitted_at', 'decided_at');
        ordered('shift', 'start_at', 'end_at', 'start < end', true);
        ordered('swap_request', 'requested_at', 'decided_at');
        ordered('swap_request', 'decided_at', 'applied_at');
        ordered('swap_request', 'requested_at', 'applied_at');
        ordered('attendance_event', 'event_at', 'recorded_at');
        for (const a of t.shift_assignment) {
          c.count();
          if (a.created_at >= shifts.get(a.shift_id).start_at)
            c.fail(`${a.assignment_id}: created at or after its shift start`);
        }
        for (const l of t.leave_request) {
          if (l.decided_at === null || l.leave_type === 'SICK') continue;
          c.count();
          if (l.decided_at >= `${l.start_date}T00:00:00+05:30`)
            c.fail(`${l.leave_request_id}: decided after the leave started (R-LVE-08)`);
        }
      }),
    );
  }

  {
    const c = collector('I-09', 'No duplicate records or overlapping effective ranges');
    checks.push(
      c.run(() => {
        for (const rows of Map.groupBy(
          t.coverage_requirement,
          (r) => `${r.team_id}|${r.template_code}|${r.skill_id}|${r.day_type}`,
        ).values()) {
          const sorted = rows.toSorted((a, b) => a.effective_from.localeCompare(b.effective_from));
          for (let i = 1; i < sorted.length; i++) {
            c.count();
            const prev = sorted[i - 1];
            if (prev.effective_to === null || prev.effective_to >= sorted[i].effective_from)
              c.fail(`${prev.coverage_id} overlaps ${sorted[i].coverage_id}`);
          }
        }
        for (const list of Map.groupBy(t.attendance_event, (e) => e.assignment_id).values()) {
          c.count();
          const types = list.map((e) => e.event_type);
          if (new Set(types).size !== types.length)
            c.fail(`${list[0].assignment_id}: repeated ${types.join(',')}`);
        }
        const leaveSeen = new Set();
        for (const l of t.leave_request) {
          c.count();
          const key = [l.employee_id, l.leave_type, l.start_date, l.end_date, l.submitted_at].join(
            '|',
          );
          if (leaveSeen.has(key)) c.fail(`${l.leave_request_id} duplicates another request`);
          leaveSeen.add(key);
        }
      }),
    );
  }

  {
    const c = collector(
      'I-10',
      'Event chains complete: seq 1…n, linked statuses, time order, status = last event',
    );
    checks.push(
      c.run(() => {
        const specs = [
          ['leave_request', 'leave_request_id', 'leave_request_event', 'LEAVE_STATUS'],
          ['swap_request', 'swap_id', 'swap_request_event', 'SWAP_STATUS'],
          ['shift_assignment', 'assignment_id', 'shift_assignment_event', 'ASSIGNMENT_STATUS'],
        ];
        for (const [table, key, eventTable, enumName] of specs) {
          const chains = Map.groupBy(t[eventTable], (e) => e[key]);
          for (const row of t[table]) {
            c.count();
            const chain = (chains.get(row[key]) ?? []).toSorted(
              (a, b) => a.event_seq - b.event_seq,
            );
            const initial = TRANSITIONS[enumName].null;
            const problem =
              chain.length === 0
                ? 'no events'
                : !initial.includes(chain[0].to_status)
                  ? `starts at ${chain[0].to_status}`
                  : chain.find((e, i) => e.event_seq !== i + 1)
                    ? 'event_seq gap'
                    : chain.find(
                          (e, i) => e.from_status !== (i === 0 ? null : chain[i - 1].to_status),
                        )
                      ? 'from_status does not follow the previous event'
                      : chain.find((e, i) => i > 0 && e.event_at < chain[i - 1].event_at)
                        ? 'events out of time order'
                        : chain.at(-1).to_status !== row.status
                          ? `status ${row.status} ≠ last event ${chain.at(-1).to_status}`
                          : null;
            if (problem) c.fail(`${row[key]}: ${problem}`);
          }
          const parents = new Set(t[table].map((r) => r[key]));
          for (const parent of chains.keys()) {
            if (!parents.has(parent)) c.fail(`${eventTable}: events for unknown ${parent}`);
          }
        }
      }),
    );
  }

  {
    const c = collector(
      'I-11',
      'Cross-table consistency of roles, policies, skills, calendar and IDs',
    );
    checks.push(
      c.run(() => {
        const expect = (condition, message) => {
          c.count();
          if (!condition) c.fail(message);
        };
        const policies = new Map(t.labor_policy.map((p) => [p.policy_id, p]));
        const skills = new Map(t.skill.map((s) => [s.skill_id, s]));
        const held = new Set(t.employee_skill.map((s) => `${s.employee_id}|${s.skill_id}`));
        const templates = new Map(t.shift_template.map((x) => [x.template_code, x]));
        const holidays = new Set(t.holiday_calendar.map((h) => h.holiday_date));
        const teams = new Map(t.team.map((x) => [x.team_id, x]));
        const offices = t.team.filter((x) => x.team_function === 'WORKFORCE_OFFICE');
        expect(offices.length === 1, `${offices.length} Workforce Office teams`);
        for (const team of t.team) {
          const manager = employees.get(team.manager_employee_id);
          expect(
            manager?.employee_role === 'MANAGER' && manager.team_id === team.team_id,
            `${team.team_id}: manager is not its MANAGER`,
          );
          const hr = employees.get(team.hr_partner_employee_id);
          expect(
            hr?.employee_role === 'HR_PARTNER' && hr.team_id === offices[0]?.team_id,
            `${team.team_id}: HR partner is not an HR_PARTNER of the Workforce Office`,
          );
        }
        for (const e of t.employee) {
          expect(
            policies.get(e.policy_id)?.employment_type === e.employment_type,
            `${e.employee_id}: policy does not match employment type`,
          );
          expect(
            held.has(`${e.employee_id}|${e.primary_skill_id}`),
            `${e.employee_id}: primary skill not in employee_skill`,
          );
        }
        for (const s of t.employee_skill) {
          const days = skills.get(s.skill_id)?.certification_validity_days;
          expect(
            days ? s.valid_to === addDays(s.valid_from, days - 1) : s.valid_to === null,
            `${s.employee_id}/${s.skill_id}: validity does not follow the certification rule`,
          );
        }
        for (const x of t.shift_template) {
          expect(
            x.duration_minutes === clockMinutes(x.start_time, x.end_time),
            `template ${x.template_code}: duration`,
          );
        }
        for (const s of t.shift) {
          const dayType = holidays.has(s.shift_date)
            ? 'HOLIDAY'
            : isWeekend(s.shift_date)
              ? 'WEEKEND'
              : 'WEEKDAY';
          expect(
            s.day_type === dayType,
            `${s.shift_id}: day_type ${s.day_type}, expected ${dayType}`,
          );
          expect(s.iso_week === isoWeek(s.shift_date), `${s.shift_id}: iso_week`);
          expect(
            s.end_at === addMinutes(s.start_at, templates.get(s.template_code).duration_minutes),
            `${s.shift_id}: end_at`,
          );
        }
        for (const a of t.shift_assignment) {
          expect(
            a.assignment_id.slice(4, 8) === shifts.get(a.shift_id).shift_date.slice(0, 4),
            `${a.assignment_id}: year differs from shift year`,
          );
        }
        for (const s of t.swap_request) {
          expect(
            s.swap_id.slice(4, 8) === s.requested_at.slice(0, 4),
            `${s.swap_id}: year differs from request year`,
          );
          expect(
            assignments.get(s.requester_assignment_id)?.employee_id === s.requester_employee_id,
            `${s.swap_id}: requester does not own the assignment`,
          );
          if (s.counterpart_assignment_id) {
            expect(
              assignments.get(s.counterpart_assignment_id)?.employee_id ===
                s.counterpart_employee_id,
              `${s.swap_id}: counterpart does not own the assignment`,
            );
          }
        }
        for (const e of t.attendance_event) {
          expect(
            assignments.get(e.assignment_id)?.employee_id === e.employee_id,
            `${e.attendance_event_id}: employee differs from the assignment`,
          );
          if (e.recorded_by_employee_id) {
            expect(
              employees.get(e.recorded_by_employee_id)?.employee_role === 'OPS_PARTNER',
              `${e.attendance_event_id}: recorded by a non ops partner`,
            );
          }
        }
        const roleFor = {
          MANAGER: ['MANAGER'],
          HR_PARTNER: ['HR_PARTNER'],
          EMPLOYEE: ENUMS.SCHEDULABLE_ROLE,
          OPS_PARTNER: ['OPS_PARTNER'],
        };
        for (const eventTable of [
          'leave_request_event',
          'swap_request_event',
          'shift_assignment_event',
        ]) {
          for (const e of t[eventTable]) {
            if (e.actor_employee_id === null) continue;
            expect(
              roleFor[e.actor_role]?.includes(employees.get(e.actor_employee_id)?.employee_role),
              `${e.event_id}: actor is not a ${e.actor_role}`,
            );
          }
        }
        for (const l of t.leave_request) {
          if (l.decided_by_employee_id === null) continue;
          const team = teams.get(employees.get(l.employee_id).team_id);
          const decider =
            l.decided_by_role === 'MANAGER'
              ? team.manager_employee_id
              : team.hr_partner_employee_id;
          expect(
            l.decided_by_employee_id === decider,
            `${l.leave_request_id}: decided by someone other than the team's ${l.decided_by_role}`,
          );
        }
      }),
    );
  }

  {
    const c = collector(
      'I-12',
      'Derived tables recompute exactly from the source tables (arithmetic reconciliation)',
    );
    checks.push(
      c.run(() => {
        const source = Object.fromEntries(
          names.filter((n) => !DERIVED.includes(n)).map((n) => [n, t[n]]),
        );
        const recomputed = Object.fromEntries(deriveTables(source));
        for (const n of DERIVED) {
          const pk = meta[n].primaryKey;
          const exported = new Map(t[n].map((r) => [keyOf(r, pk), r]));
          c.count(recomputed[n].length);
          if (exported.size !== recomputed[n].length)
            c.fail(`${n}: ${exported.size} rows exported, ${recomputed[n].length} recomputed`);
          for (const row of recomputed[n]) {
            const key = keyOf(row, pk);
            const other = exported.get(key);
            const differs =
              !other ||
              Object.entries(row).some(([col, value]) =>
                typeof value === 'number'
                  ? Math.abs(value - other[col]) > 1e-9
                  : value !== other[col],
              );
            if (differs) c.fail(`${n} ${key}: exported row differs from recomputation`);
          }
        }
      }),
    );
  }

  return checks;
}
