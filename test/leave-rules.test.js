import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decideLeaves, leaveContext } from '../src/generator/transactions/leave.js';
import { addDays, timestampMs } from '../src/lib/dates.js';

// One team of ten schedulable members, so the team leave cap is max(1, floor(0.15 × 10)) = 1.
const member = (n, extra = {}) => ({
  employee_id: `EMP-00000${n}`,
  team_id: 'TEAM-001',
  employee_role: 'MEMBER',
  hire_date: '2024-01-01',
  termination_date: null,
  ...extra,
});
const members = Array.from({ length: 10 }, (_, i) => member(i));
const teams = [
  { team_id: 'TEAM-001', manager_employee_id: 'EMP-000100', hr_partner_employee_id: 'EMP-000200' },
];
const entitlementRows = members.flatMap((e) => [
  { employee_id: e.employee_id, leave_type: 'ANNUAL', entitled_days: 10 },
  { employee_id: e.employee_id, leave_type: 'CASUAL', entitled_days: 2 },
  { employee_id: e.employee_id, leave_type: 'SICK', entitled_days: 3 },
]);

let seq = 0;
const at = (date, time = '09:00:00') => timestampMs(`${date}T${time}+05:30`);
function request(
  employee,
  leaveType,
  startDate,
  days,
  { submitted, delayHours = 2, withdrawn = null } = {},
) {
  const submittedMs = submitted ?? at(addDays(startDate, -10));
  return {
    seq: seq++,
    employee,
    leaveType,
    startDate,
    endDate: addDays(startDate, days - 1),
    days,
    submittedMs,
    decidedMs: withdrawn
      ? null
      : leaveType === 'SICK'
        ? submittedMs
        : submittedMs + delayHours * 3_600_000,
    withdrawnMs: withdrawn,
  };
}

const decide = (requests, { employees = members, cancel = () => null } = {}) =>
  decideLeaves(requests, leaveContext({ teams, employees, entitlementRows }), cancel);

describe('leave decisions (R-LVE-01 … R-LVE-10)', () => {
  it('approves a request within policy and records the manager as decider', () => {
    const r = request(members[0], 'ANNUAL', '2026-01-20', 3);
    const d = decide([r]).get(r);
    assert.deepEqual(
      [d.status, d.ruleId, d.reasonCode, d.decidedByRole, d.decidedBy],
      ['APPROVED', 'R-LVE-07', 'APPROVED_WITHIN_POLICY', 'MANAGER', 'EMP-000100'],
    );
  });

  it('sends leave over 5 days and all unpaid leave to the HR partner', () => {
    const long = request(members[0], 'ANNUAL', '2026-01-20', 6);
    const unpaid = request(members[1], 'UNPAID', '2026-02-20', 2, { submitted: at('2026-01-20') });
    const decisions = decide([long, unpaid]);
    assert.equal(decisions.get(long).decidedByRole, 'HR_PARTNER');
    assert.equal(decisions.get(long).decidedBy, 'EMP-000200');
    assert.equal(decisions.get(unpaid).decidedByRole, 'HR_PARTNER');
    assert.equal(decisions.get(unpaid).status, 'APPROVED', 'unpaid leave has no balance check');
  });

  it('rejects for insufficient balance before checking anything else (R-LVE-03)', () => {
    const r = request(members[0], 'CASUAL', '2026-01-20', 3);
    assert.equal(decide([r]).get(r).reasonCode, 'INSUFFICIENT_BALANCE');
  });

  it('rejects short notice (R-LVE-05) but auto-approves sick leave without notice (R-LVE-04)', () => {
    const late = request(members[0], 'ANNUAL', '2026-01-20', 1, { submitted: at('2026-01-16') });
    const sick = request(members[1], 'SICK', '2026-01-20', 1, {
      submitted: at('2026-01-20', '04:00:00'),
    });
    const decisions = decide([late, sick]);
    assert.equal(decisions.get(late).reasonCode, 'INSUFFICIENT_NOTICE');
    assert.deepEqual(
      [
        decisions.get(sick).status,
        decisions.get(sick).decidedByRole,
        decisions.get(sick).decidedBy,
      ],
      ['APPROVED', 'SYSTEM', null],
    );
  });

  it('rejects sick leave beyond the sick balance', () => {
    const r = request(members[0], 'SICK', '2026-01-20', 4, {
      submitted: at('2026-01-20', '04:00:00'),
    });
    assert.deepEqual(
      [decide([r]).get(r).reasonCode, decide([r]).get(r).decidedByRole],
      ['INSUFFICIENT_BALANCE', 'SYSTEM'],
    );
  });

  it('applies the team leave cap to the later decision (R-LVE-06)', () => {
    const first = request(members[0], 'ANNUAL', '2026-01-20', 2);
    const second = request(members[1], 'ANNUAL', '2026-01-21', 1);
    const decisions = decide([first, second]);
    assert.equal(decisions.get(first).status, 'APPROVED');
    assert.equal(decisions.get(second).reasonCode, 'TEAM_LEAVE_CAP_REACHED');
  });

  it('decides in decision-time order, not submission order', () => {
    const slow = request(members[0], 'ANNUAL', '2026-01-20', 1, {
      submitted: at('2026-01-05'),
      delayHours: 48,
    });
    const fast = request(members[1], 'ANNUAL', '2026-01-20', 1, {
      submitted: at('2026-01-06'),
      delayHours: 1,
    });
    const decisions = decide([slow, fast]);
    assert.equal(decisions.get(fast).status, 'APPROVED');
    assert.equal(decisions.get(slow).reasonCode, 'TEAM_LEAVE_CAP_REACHED');
  });

  it('frees the cap and the balance once an approved leave is cancelled (R-LVE-10)', () => {
    const first = request(members[0], 'ANNUAL', '2026-01-20', 1, { submitted: at('2026-01-05') });
    const second = request(members[1], 'ANNUAL', '2026-01-20', 1, { submitted: at('2026-01-08') });
    const cancel = (r, decidedMs) => (r === first ? decidedMs + 3_600_000 : null);
    const decisions = decide([first, second], { cancel });
    assert.equal(decisions.get(first).status, 'CANCELLED');
    assert.equal(decisions.get(second).status, 'APPROVED');
  });

  it('rejects overlap with the employee’s own approved or still-pending request (R-LVE-02)', () => {
    const approved = request(members[0], 'ANNUAL', '2026-01-20', 3, {
      submitted: at('2026-01-02'),
    });
    const overlapping = request(members[0], 'CASUAL', '2026-01-21', 1, {
      submitted: at('2026-01-05'),
    });
    const pending = request(members[2], 'ANNUAL', '2026-02-10', 2, {
      submitted: at('2026-01-20'),
      delayHours: 40,
    });
    const whilePending = request(members[2], 'CASUAL', '2026-02-11', 1, {
      submitted: at('2026-01-21'),
      delayHours: 1,
    });
    const decisions = decide([approved, overlapping, pending, whilePending]);
    assert.equal(decisions.get(overlapping).reasonCode, 'OVERLAPS_EXISTING_LEAVE');
    assert.equal(decisions.get(whilePending).reasonCode, 'OVERLAPS_EXISTING_LEAVE');
  });

  it('ignores withdrawn requests and rejects dates outside employment (R-LVE-01)', () => {
    const withdrawn = request(members[0], 'ANNUAL', '2026-01-20', 1, {
      withdrawn: at('2026-01-11'),
    });
    const other = request(members[1], 'ANNUAL', '2026-01-20', 1);
    const leaver = member(9, { termination_date: '2026-01-25' });
    const pastLeaving = request(leaver, 'ANNUAL', '2026-01-24', 3);
    const decisions = decide([withdrawn, other, pastLeaving], {
      employees: [...members.slice(0, 9), leaver],
    });
    assert.equal(decisions.get(withdrawn).status, 'WITHDRAWN');
    assert.equal(decisions.get(other).status, 'APPROVED');
    assert.equal(decisions.get(pastLeaving).reasonCode, 'EMPLOYEE_NOT_ACTIVE');
  });
});
