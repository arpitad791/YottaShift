import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildWindow } from '../src/generator/config.js';
import { buildShifts, buildShiftTemplates } from '../src/generator/master/reference-tables.js';
import { loadConfig } from '../src/generator/config.js';
import { RosterState } from '../src/scheduler/roster-state.js';
import { pickCandidate, publishWeek, tiebreaker } from '../src/scheduler/scheduler.js';
import { createRng } from '../src/lib/rng.js';
import { timestampMs } from '../src/lib/dates.js';

// Two ISO weeks starting on a Monday, no holidays.
const window = buildWindow('2026-01-05', 14);
const templates = buildShiftTemplates(loadConfig());
const shifts = buildShifts(window, templates, []);
const policies = [
  {
    policy_id: 'POL-FT-2026',
    employment_type: 'FULL_TIME',
    contracted_weekly_hours: 40,
    max_weekly_scheduled_hours: 48,
    weekly_overtime_cap_hours: 12,
    min_rest_hours: 11,
    max_consecutive_days: 6,
  },
  {
    policy_id: 'POL-PT-2026',
    employment_type: 'PART_TIME',
    contracted_weekly_hours: 24,
    max_weekly_scheduled_hours: 32,
    weekly_overtime_cap_hours: 8,
    min_rest_hours: 11,
    max_consecutive_days: 6,
  },
];
const person = (n, policy = 'POL-FT-2026') => ({
  employee_id: `EMP-00000${n}`,
  team_id: 'TEAM-001',
  employee_role: 'MEMBER',
  policy_id: policy,
  hire_date: '2024-01-01',
  termination_date: null,
});
const employees = [person(1), person(2), person(3, 'POL-PT-2026')];
const skill = (n, skillId = 'SKL-001', validTo = null) => ({
  employee_id: `EMP-00000${n}`,
  skill_id: skillId,
  valid_from: '2024-01-01',
  valid_to: validTo,
});

function roster(extraSkills = []) {
  const state = new RosterState({
    window,
    employees,
    employeeSkills: [skill(1), skill(2), skill(3), ...extraSkills],
    policiesById: new Map(policies.map((p) => [p.policy_id, p])),
    shifts,
    shiftTemplates: templates,
  });
  const put = (n, date, template, skillId = 'SKL-001') => {
    const assignment = {
      employee: state.employees.get(`EMP-00000${n}`),
      shift: shiftOf(state, date, template),
      skillId,
    };
    state.add(assignment);
    return assignment;
  };
  return { state, put, emp: (n) => state.employees.get(`EMP-00000${n}`) };
}
const shiftOf = (state, date, template) => state.shiftByDateTemplate.get(`${date}|${template}`);
const NOW = timestampMs('2026-01-01T12:00:00+05:30');

describe('roster rules (R-SCH-01 … R-SCH-08)', () => {
  it('blocks a second shift on the same day (R-SCH-01)', () => {
    const { state, put, emp } = roster();
    put(1, '2026-01-05', 'A');
    assert.equal(
      state.check(emp(1), shiftOf(state, '2026-01-05', 'B'), 'SKL-001', NOW),
      'DOUBLE_BOOKING',
    );
  });

  it('needs 11 hours of rest: evening then next morning fails, night then night passes (R-SCH-06)', () => {
    const { state, put, emp } = roster();
    put(1, '2026-01-05', 'B');
    put(2, '2026-01-05', 'C');
    assert.equal(
      state.check(emp(1), shiftOf(state, '2026-01-06', 'A'), 'SKL-001', NOW),
      'REST_RULE_BREACH',
    );
    assert.equal(
      state.check(emp(2), shiftOf(state, '2026-01-06', 'A'), 'SKL-001', NOW),
      'REST_RULE_BREACH',
    );
    assert.equal(state.check(emp(2), shiftOf(state, '2026-01-06', 'C'), 'SKL-001', NOW), null);
  });

  it('allows six days in a row but not seven (R-SCH-07)', () => {
    const { state, put, emp } = roster();
    for (const day of ['05', '06', '07', '08', '09']) put(1, `2026-01-${day}`, 'A');
    assert.equal(state.check(emp(1), shiftOf(state, '2026-01-10', 'A'), 'SKL-001', NOW), null);
    put(1, '2026-01-10', 'A');
    assert.equal(
      state.check(emp(1), shiftOf(state, '2026-01-11', 'A'), 'SKL-001', NOW),
      'CONSECUTIVE_DAYS_BREACH',
    );
  });

  it('caps weekly scheduled hours (R-SCH-08): a part-timer stops at 32 h', () => {
    const { state, put, emp } = roster();
    for (const day of ['05', '06', '07', '08']) put(3, `2026-01-${day}`, 'A');
    assert.equal(
      state.check(emp(3), shiftOf(state, '2026-01-10', 'A'), 'SKL-001', NOW),
      'WEEKLY_HOURS_BREACH',
    );
  });

  it('respects approved leave only from its decision time (R-SCH-02)', () => {
    const { state, emp } = roster();
    const decidedMs = timestampMs('2026-01-02T10:00:00+05:30');
    emp(1).leaves.push({
      startDate: '2026-01-07',
      endDate: '2026-01-08',
      decidedMs,
      cancelledMs: null,
    });
    const shift = shiftOf(state, '2026-01-07', 'A');
    assert.equal(state.check(emp(1), shift, 'SKL-001', NOW), null, 'not yet approved');
    assert.equal(state.check(emp(1), shift, 'SKL-001', decidedMs), 'ON_APPROVED_LEAVE');
  });

  it('treats an expired certification as an absent skill (R-SCH-03)', () => {
    const { state, emp } = roster([skill(1, 'SKL-009', '2026-01-08')]);
    assert.equal(state.check(emp(1), shiftOf(state, '2026-01-08', 'A'), 'SKL-009', NOW), null);
    assert.equal(
      state.check(emp(1), shiftOf(state, '2026-01-09', 'A'), 'SKL-009', NOW),
      'SKILL_NOT_HELD',
    );
  });

  it('lets a swap give up one shift while taking another on the same day', () => {
    const { state, put, emp } = roster();
    const given = put(1, '2026-01-05', 'A');
    assert.equal(
      state.check(emp(1), shiftOf(state, '2026-01-05', 'B'), 'SKL-001', NOW, given),
      null,
    );
  });
});

describe('scheduler', () => {
  it('prefers the least-loaded eligible person (R-SCH-09)', () => {
    const { state, put } = roster();
    put(1, '2026-01-05', 'A');
    const best = pickCandidate(state, {
      candidates: [...state.employees.values()],
      shift: shiftOf(state, '2026-01-06', 'A'),
      skillId: 'SKL-001',
      atMs: NOW,
      tiebreak: tiebreaker(createRng(1)),
    });
    assert.notEqual(best.id, 'EMP-000001');
  });

  it('leaves a gap instead of using someone unqualified (R-COV-04)', () => {
    const { state } = roster([skill(1, 'SKL-002')]);
    const created = [];
    publishWeek(state, {
      week: '2026-W02',
      publishMs: NOW,
      teams: [{ team_id: 'TEAM-001', templates: ['A'] }],
      requirementsFor: (_team, _template, _dayType, date) =>
        date === '2026-01-05' ? [{ skill_id: 'SKL-002', min_headcount: 3 }] : [],
      rng: createRng(1),
      assign: (slot) => {
        created.push(slot);
        state.add({ employee: slot.emp, shift: slot.shift, skillId: slot.skillId });
      },
    });
    assert.equal(created.length, 1, 'only one person holds SKL-002');
    assert.equal(created[0].emp.id, 'EMP-000001');
  });
});
