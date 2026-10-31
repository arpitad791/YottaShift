import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createDatabase, loadTables } from '../src/db/database.js';
import { ENUMS } from '../src/domain/constants.js';
import { loadConfig } from '../src/generator/config.js';
import { generateDataset } from '../src/generator/index.js';
import { checkBusinessRules } from '../src/validation/business-rules.js';
import { addDays } from '../src/lib/dates.js';

const config = loadConfig();
const baseline = { anomalies: false };
const datasets = {
  starter: generateDataset(config, 'starter', baseline),
  full: generateDataset(config, 'full', baseline),
};
const tablesOf = (profile) => Object.fromEntries(datasets[profile].tables);
const check = (tables) => checkBusinessRules(tables, { patterns: config.operatingPatterns });
const violations = (tables) => check(tables).filter((f) => f.kind === 'VIOLATION');
const digest = (tables) => createHash('sha256').update(JSON.stringify(tables)).digest('hex');

describe('transaction volumes', () => {
  it('generates exactly the configured leave and swap requests', () => {
    for (const profile of ['starter', 'full']) {
      const t = tablesOf(profile);
      assert.equal(t.leave_request.length, config.profiles[profile].leaveRequests, profile);
      assert.equal(t.swap_request.length, config.profiles[profile].swapRequests, profile);
      assert.equal(datasets[profile].stats.swapShortfall, 0);
    }
    assert.equal(tablesOf('full').leave_request.length, 5000);
  });
});

for (const profile of ['starter', 'full']) {
  describe(`${profile} baseline`, () => {
    const t = tablesOf(profile);

    it('loads into the schema with every foreign key resolved', () => {
      const db = createDatabase();
      loadTables(db, datasets[profile].tables);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      db.close();
    });

    it('breaks no business rule before anomalies are injected', () => {
      assert.deepEqual(violations(t), []);
    });

    it('only reports uncorrected missing clock-outs as exceptions', () => {
      const exceptions = check(t).filter((f) => f.kind === 'EXCEPTION');
      assert.ok(exceptions.every((f) => f.ruleId === 'R-ATT-04'));
    });

    it('regenerates byte-identically with the same seed', () => {
      assert.equal(
        digest(generateDataset(config, profile, baseline).tables),
        digest(datasets[profile].tables),
      );
    });
  });
}

describe('workflow outcomes at full scale', () => {
  const t = tablesOf('full');
  const assignments = new Map(t.shift_assignment.map((a) => [a.assignment_id, a]));

  it('produces every leave outcome through a documented rule', () => {
    const reasons = new Set(t.leave_request.map((l) => l.decision_reason_code).filter(Boolean));
    for (const reason of [
      'APPROVED_WITHIN_POLICY',
      'SICK_AUTO_APPROVED',
      'INSUFFICIENT_BALANCE',
      'INSUFFICIENT_NOTICE',
      'TEAM_LEAVE_CAP_REACHED',
      'OVERLAPS_EXISTING_LEAVE',
      'EMPLOYEE_NOT_ACTIVE',
    ]) {
      assert.ok(reasons.has(reason), reason);
    }
    const statuses = new Set(t.leave_request.map((l) => l.status));
    for (const status of ['APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'])
      assert.ok(statuses.has(status), status);
    for (const l of t.leave_request) {
      if (l.decided_at) assert.match(l.decision_rule_id, /^R-LVE-0[1-7]$/, l.leave_request_id);
    }
  });

  it('keeps leave decisions with the right decider', () => {
    for (const l of t.leave_request.filter((x) => x.decided_at)) {
      const expected =
        l.leave_type === 'SICK'
          ? 'SYSTEM'
          : l.requested_days > 5 || l.leave_type === 'UNPAID'
            ? 'HR_PARTNER'
            : 'MANAGER';
      assert.equal(l.decided_by_role, expected, l.leave_request_id);
    }
  });

  it('runs swaps through approval, rejection, expiry and cancellation', () => {
    const statuses = new Set(t.swap_request.map((s) => s.status));
    for (const status of ['APPLIED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
      assert.ok(statuses.has(status), status);
    assert.deepEqual(new Set(t.swap_request.map((s) => s.swap_type)), new Set(ENUMS.SWAP_TYPE));
  });

  it('preserves swap history: applied swaps link old and new assignments (R-SWP-08)', () => {
    const bySwap = Map.groupBy(
      t.shift_assignment.filter((a) => a.swap_id),
      (a) => a.swap_id,
    );
    for (const swap of t.swap_request.filter((s) => s.status === 'APPLIED')) {
      const created = bySwap.get(swap.swap_id);
      assert.equal(created.length, swap.swap_type === 'SWAP' ? 2 : 1, swap.swap_id);
      const given = assignments.get(swap.requester_assignment_id);
      assert.equal(given.status === 'SWAPPED_OUT' || given.status === 'SCHEDULED', true);
      const replacement = created.find(
        (a) => a.supersedes_assignment_id === swap.requester_assignment_id,
      );
      assert.equal(replacement.employee_id, swap.counterpart_employee_id, swap.swap_id);
      assert.equal(replacement.shift_id, given.shift_id);
    }
  });

  it('cancels and backfills assignments when leave is approved after publication (R-LVE-09)', () => {
    const cancelled = t.shift_assignment_event.filter((e) => e.to_status === 'CANCELLED');
    assert.ok(cancelled.length > 0);
    assert.ok(cancelled.every((e) => e.reason_code === 'LEAVE_APPROVED' && e.leave_request_id));
    const replacements = t.shift_assignment.filter((a) => a.source === 'REPLACEMENT');
    assert.ok(replacements.length > 0);
    for (const r of replacements) {
      const original = assignments.get(r.supersedes_assignment_id);
      assert.equal(original.shift_id, r.shift_id);
      assert.notEqual(original.employee_id, r.employee_id);
    }
  });

  it('publishes each week’s roster before the week starts', () => {
    for (const a of t.shift_assignment.filter((x) => x.source === 'ROSTER')) {
      assert.ok(a.created_at < `${a.shift_id.slice(6, 16)}T00:00:00+05:30`, a.assignment_id);
    }
  });

  it('includes absences, manual corrections and late arrivals in attendance', () => {
    const sources = new Set(t.attendance_event.map((e) => e.source));
    assert.deepEqual(sources, new Set(ENUMS.ATTENDANCE_SOURCE));
    const manual = t.attendance_event.filter((e) => e.source === 'MANUAL');
    const ops = new Set(
      t.employee.filter((e) => e.employee_role === 'OPS_PARTNER').map((e) => e.employee_id),
    );
    assert.ok(
      manual.every((e) => ops.has(e.recorded_by_employee_id) && e.recorded_at > e.event_at),
    );
  });

  it('reports coverage gaps instead of filling them with unqualified staff', () => {
    const shifts = new Map(t.shift.map((s) => [s.shift_id, s]));
    const assigned = new Map();
    for (const a of t.shift_assignment.filter((x) => x.status === 'SCHEDULED')) {
      const key = `${a.shift_id}|${a.team_id}|${a.skill_id}`;
      assigned.set(key, (assigned.get(key) ?? 0) + 1);
    }
    let gaps = 0;
    let over = 0;
    for (const shift of shifts.values()) {
      for (const c of t.coverage_requirement) {
        if (c.template_code !== shift.template_code || c.day_type !== shift.day_type) continue;
        if (
          shift.shift_date < c.effective_from ||
          (c.effective_to && shift.shift_date > c.effective_to)
        )
          continue;
        const n = assigned.get(`${shift.shift_id}|${c.team_id}|${c.skill_id}`) ?? 0;
        if (n < c.min_headcount) gaps++;
        if (n > c.min_headcount) over++;
      }
    }
    assert.ok(gaps > 0, 'tight teams should produce some gaps');
    assert.equal(over, 0, 'the scheduler never staffs above the requirement');
  });
});

describe('rule checks catch each kind of problem', () => {
  const clone = () => structuredClone(tablesOf('starter'));
  const issues = (tables, ruleId) => check(tables).filter((f) => f.ruleId === ruleId);
  const scheduled = (t) => t.shift_assignment.filter((a) => a.status === 'SCHEDULED');

  it('double booking (R-SCH-01)', () => {
    const t = clone();
    const a = scheduled(t)[0];
    t.shift_assignment.push({ ...a, assignment_id: 'ASG-2026-999999' });
    assert.ok(
      issues(t, 'R-SCH-01').some(
        (f) => f.recordIds.includes('ASG-2026-999999') && f.issueType === 'DOUBLE_BOOKED',
      ),
    );
  });

  it('approved leave overlapping a shift (R-SCH-02)', () => {
    const t = clone();
    const a = scheduled(t)[0];
    const date = a.shift_id.slice(6, 16);
    t.leave_request.push({
      ...t.leave_request.find((l) => l.status === 'APPROVED'),
      leave_request_id: 'LVE-2026-999999',
      employee_id: a.employee_id,
      start_date: date,
      end_date: date,
      requested_days: 1,
    });
    assert.ok(
      issues(t, 'R-SCH-02').some(
        (f) => f.recordIds.includes(a.assignment_id) && f.issueType === 'LEAVE_OVERLAP',
      ),
    );
  });

  it('required skill absent (R-SCH-03)', () => {
    const t = clone();
    const a = scheduled(t)[0];
    const held = new Set(
      t.employee_skill.filter((s) => s.employee_id === a.employee_id).map((s) => s.skill_id),
    );
    a.skill_id = t.skill.find((s) => !held.has(s.skill_id)).skill_id;
    assert.ok(
      issues(t, 'R-SCH-03').some(
        (f) => f.recordIds.includes(a.assignment_id) && f.issueType === 'SKILL_ABSENT',
      ),
    );
  });

  it('overtime cap exceeded (R-OVT-02)', () => {
    const t = clone();
    // +72 h on one shift exceeds contract + cap even for a lightly loaded week.
    const out = t.attendance_event.find(
      (e) => e.event_type === 'CLOCK_OUT' && e.source !== 'MANUAL',
    );
    out.event_at = `${addDays(out.event_at.slice(0, 10), 3)}${out.event_at.slice(10)}`;
    assert.ok(
      issues(t, 'R-OVT-02').some(
        (f) => f.employeeId === out.employee_id && f.issueType === 'OVERTIME_CAP_EXCEEDED',
      ),
    );
  });

  it('swap applied without approval (R-SWP-06)', () => {
    const t = clone();
    const swap = t.swap_request.find((s) => s.status === 'APPLIED');
    t.swap_request_event = t.swap_request_event.filter(
      (e) => !(e.swap_id === swap.swap_id && e.to_status === 'APPROVED'),
    );
    assert.ok(
      issues(t, 'R-SWP-06').some(
        (f) => f.recordIds.includes(swap.swap_id) && f.issueType === 'SWAP_WITHOUT_APPROVAL',
      ),
    );
  });

  it('rest, consecutive-day and weekly-hour breaches (R-SCH-06 … R-SCH-08)', () => {
    const t = clone();
    const a = scheduled(t).find((x) => x.shift_id.endsWith('-B'));
    const date = a.shift_id.slice(6, 16);
    const next = `SHIFT-${addDays(date, 1)}-A`;
    t.shift_assignment = t.shift_assignment.filter(
      (x) => !(x.employee_id === a.employee_id && x.shift_id.slice(6, 16) === addDays(date, 1)),
    );
    t.shift_assignment.push({ ...a, assignment_id: 'ASG-2026-999998', shift_id: next });
    assert.ok(issues(t, 'R-SCH-06').some((f) => f.recordIds.includes('ASG-2026-999998')));

    const busy = clone();
    const emp = scheduled(busy)[0];
    const firstDate = emp.shift_id.slice(6, 16);
    for (let d = 1; d <= 7; d++) {
      busy.shift_assignment.push({
        ...emp,
        assignment_id: `ASG-2026-9990${String(d).padStart(2, '0')}`,
        shift_id: `SHIFT-${addDays(firstDate, d)}-${emp.shift_id.at(-1)}`,
      });
    }
    assert.ok(issues(busy, 'R-SCH-07').some((f) => f.employeeId === emp.employee_id));
    assert.ok(issues(busy, 'R-SCH-08').some((f) => f.employeeId === emp.employee_id));
  });

  it('broken history: status changed without an event (R-GEN-01)', () => {
    const t = clone();
    const a = scheduled(t)[0];
    a.status = 'CANCELLED';
    assert.ok(issues(t, 'R-GEN-01').some((f) => f.recordIds.includes(a.assignment_id)));
  });

  it('attendance on an assignment that was not worked (R-ATT-01)', () => {
    const t = clone();
    const cancelled = t.shift_assignment.find((a) => a.status !== 'SCHEDULED');
    const event = t.attendance_event[0];
    t.attendance_event.push({
      ...event,
      attendance_event_id: 'ATT-EMP-999999-20260101T000000',
      assignment_id: cancelled.assignment_id,
    });
    assert.ok(
      issues(t, 'R-ATT-01').some((f) => f.recordIds.includes('ATT-EMP-999999-20260101T000000')),
    );
  });
});
