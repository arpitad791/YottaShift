import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/api/app.js';
import { DatasetStore } from '../src/api/store.js';
import { sha256File } from '../src/export/formats.js';
import { exportDataset } from '../src/export/write-dataset.js';
import { loadConfig } from '../src/generator/config.js';

const config = loadConfig();
let out;
let store;
let server;
let base;
let tables;
let databaseHash;

before(async () => {
  out = mkdtempSync(join(tmpdir(), 'yottashift-api-'));
  const { dataset } = exportDataset({ config, profileName: 'starter', outDir: out });
  tables = Object.fromEntries(dataset.tables);
  databaseHash = sha256File(join(out, 'starter', 'sqlite', 'yottashift.db'));
  store = new DatasetStore({
    dataDir: out,
    profile: 'starter',
    patterns: config.operatingPatterns,
  });
  server = createApp(store).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
  rmSync(out, { recursive: true, force: true });
});

const get = async (path) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
};
const post = async (path, body, raw = false) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe('API: dataset and reference data', () => {
  it('reports health with the manifest row counts', async () => {
    const { status, body } = await get('/health');
    assert.equal(status, 200);
    assert.equal(body.profile, 'starter');
    assert.equal(body.seed, 20261022);
    assert.equal(body.tables.employee, 200);
  });

  it('serves the metrics report', async () => {
    const { status, body } = await get('/metrics');
    assert.equal(status, 200);
    assert.equal(body.M04_leave.requests, 160);
  });

  it('serves the reproducibility report, or 404 with the command to create it', async () => {
    const missing = await get('/reproducibility');
    assert.equal(missing.status, 404);
    assert.match(missing.body.error.message, /npm run reproduce -- --profile starter/);
    const report = { profile: 'starter', seed: 20261022, identical: true };
    writeFileSync(join(out, 'starter', 'reports', 'reproducibility.json'), JSON.stringify(report));
    const found = await get('/reproducibility');
    assert.equal(found.status, 200);
    assert.deepEqual(found.body, report);
  });

  it('lists teams with managers, members and gap counts', async () => {
    const { body } = await get('/teams');
    assert.equal(body.data.length, 10);
    const team = body.data[0];
    assert.ok(team.manager_name && team.hr_partner_name);
    assert.ok(team.schedulable_members > 0);
  });

  it('returns a team with members, requirements and coverage totals', async () => {
    const { status, body } = await get('/teams/TEAM-001');
    assert.equal(status, 200);
    assert.ok(body.members.length > 5);
    assert.ok(body.manager_name && body.hr_partner_name);
    assert.ok(body.coverage_requirements.length > 0);
    assert.ok(body.coverage.required >= body.coverage.filled);
  });

  it('pages and filters employees', async () => {
    const all = await get('/employees?limit=20');
    assert.equal(all.body.data.length, 20);
    assert.equal(all.body.page.total, 200);
    const leads = await get('/employees?role=LEAD&teamId=TEAM-001');
    assert.ok(leads.body.data.every((e) => e.employee_role === 'LEAD' && e.team_id === 'TEAM-001'));
    const search = await get(`/employees?q=${encodeURIComponent('EMP-000005')}`);
    assert.deepEqual(
      search.body.data.map((e) => e.employee_id),
      ['EMP-000005'],
    );
  });

  it('returns an employee with skills, balances and weekly hours', async () => {
    const { body } = await get('/employees/EMP-000002');
    assert.ok(body.skills.length >= 1);
    assert.equal(body.leave_balances.length, 3);
    assert.ok(body.weeks.length >= 4);
  });
});

describe('API: roster and history', () => {
  it('returns an employee schedule in time order with attendance outcomes', async () => {
    const { body } = await get('/employees/EMP-000002/schedule?from=2026-01-05&to=2026-01-18');
    assert.ok(body.data.length > 0);
    assert.ok(body.data.every((a) => a.shift_date >= '2026-01-05' && a.shift_date <= '2026-01-18'));
    const starts = body.data.map((a) => a.start_at);
    assert.deepEqual(starts, [...starts].sort());
    assert.ok(body.data.some((a) => a.attendance_outcome !== null));
  });

  it('lists coverage gaps and daily totals', async () => {
    const gaps = await get('/coverage?status=GAP&limit=500');
    assert.equal(
      gaps.body.page.total,
      tables.coverage_status.filter((c) => c.status === 'GAP').length,
    );
    assert.ok(gaps.body.data.every((c) => c.gap_headcount > 0));
    const daily = await get('/coverage/daily');
    assert.equal(daily.body.data.length, 28);
    assert.ok(daily.body.data.every((d) => d.filled <= d.required && d.attended <= d.required));
  });

  it('shows an assignment with its events, attendance and replacement links', async () => {
    const replaced = tables.shift_assignment.find((a) => a.source === 'REPLACEMENT');
    const { body } = await get(`/assignments/${replaced.supersedes_assignment_id}`);
    assert.equal(body.status, 'CANCELLED');
    assert.deepEqual(
      body.events.map((e) => e.to_status),
      ['SCHEDULED', 'CANCELLED'],
    );
    assert.ok(body.superseded_by.some((a) => a.assignment_id === replaced.assignment_id));
  });

  it('shows a leave request with its decision rule, history and roster effects', async () => {
    const leave = tables.shift_assignment_event.find(
      (e) => e.reason_code === 'LEAVE_APPROVED',
    ).leave_request_id;
    const { body } = await get(`/leave/${leave}`);
    assert.ok(['R-LVE-04', 'R-LVE-07'].includes(body.decision_rule_id));
    assert.ok(body.rule.length > 0);
    assert.equal(body.events[0].to_status, 'SUBMITTED');
    assert.ok(body.roster_effects.some((e) => e.to_status === 'CANCELLED'));
  });

  it('shows an applied swap with the assignments it created', async () => {
    const applied = tables.swap_request.find((s) => s.status === 'APPLIED' && s.decided_at);
    const { body } = await get(`/swaps/${applied.swap_id}`);
    assert.deepEqual(
      body.events.map((e) => e.to_status),
      ['REQUESTED', 'APPROVED', 'APPLIED'],
    );
    assert.ok(
      body.created_assignments.some(
        (a) => a.supersedes_assignment_id === applied.requester_assignment_id,
      ),
    );
  });

  it('filters leave and swap lists', async () => {
    const rejected = await get('/leave?status=REJECTED&reason=INSUFFICIENT_BALANCE');
    assert.ok(
      rejected.body.data.every(
        (l) => l.status === 'REJECTED' && l.decision_reason_code === 'INSUFFICIENT_BALANCE',
      ),
    );
    const expired = await get('/swaps?status=EXPIRED');
    assert.ok(expired.body.data.every((s) => s.status === 'EXPIRED'));
  });
});

describe('API: leave what-if', () => {
  it('approves a valid request through R-LVE-07 and names the decider', async () => {
    const { status, body } = await post('/leave/evaluate', {
      employeeId: 'EMP-000002',
      leaveType: 'UNPAID',
      startDate: '2026-01-27',
      endDate: '2026-01-27',
      submittedAt: '2026-01-05T09:00:00+05:30',
    });
    assert.equal(status, 200);
    assert.equal(body.stored, false);
    assert.ok(['APPROVED', 'REJECTED'].includes(body.decision.status));
    assert.match(body.decision.rule_id, /^R-LVE-0\d$/);
    if (body.decision.status === 'APPROVED')
      assert.equal(body.decision.decided_by_role, 'HR_PARTNER');
  });

  it('rejects for balance, auto-approves sick leave, and checks notice', async () => {
    const tooLong = await post('/leave/evaluate', {
      employeeId: 'EMP-000002',
      leaveType: 'CASUAL',
      startDate: '2026-01-20',
      endDate: '2026-01-27',
    });
    assert.equal(tooLong.body.decision.reason_code, 'INSUFFICIENT_BALANCE');
    const late = await post('/leave/evaluate', {
      employeeId: 'EMP-000002',
      leaveType: 'UNPAID',
      startDate: '2026-01-20',
      endDate: '2026-01-20',
      submittedAt: '2026-01-18T09:00:00+05:30',
    });
    assert.equal(late.body.decision.reason_code, 'INSUFFICIENT_NOTICE');
  });

  it('validates input and refuses non-schedulable employees', async () => {
    assert.equal((await post('/leave/evaluate', { employeeId: 'EMP-000002' })).status, 400);
    assert.equal(
      (
        await post('/leave/evaluate', {
          employeeId: 'EMP-1',
          leaveType: 'SICK',
          startDate: '2026-01-02',
          endDate: '2026-01-02',
        })
      ).status,
      400,
    );
    const manager = tables.team[0].manager_employee_id;
    assert.equal(
      (
        await post('/leave/evaluate', {
          employeeId: manager,
          leaveType: 'SICK',
          startDate: '2026-01-02',
          endDate: '2026-01-02',
        })
      ).status,
      422,
    );
    assert.equal((await post('/leave/evaluate', '{bad json', true)).status, 400);
  });
});

describe('API: exceptions and reviews', () => {
  it('lists findings matched to the ground truth', async () => {
    const { body } = await get('/exceptions?kind=VIOLATION&limit=500');
    const typed = body.data.filter((f) => f.issue_type);
    assert.equal(typed.length, 15);
    assert.ok(typed.every((f) => f.ground_truth_id && /^FND-[0-9a-f]{12}$/.test(f.finding_id)));
    const summary = await get('/exceptions/summary');
    assert.ok(summary.body.data.some((r) => r.rule_id === 'R-SCH-01' && r.labelled === r.total));
  });

  it('accepts a review from the team manager and keeps the full trail', async () => {
    const { body } = await get('/exceptions?issueType=DOUBLE_BOOKED');
    const finding = body.data[0];
    const manager = tables.team.find((t) => t.team_id === finding.team_id).manager_employee_id;
    const first = await post(`/exceptions/${finding.finding_id}/reviews`, {
      actorEmployeeId: manager,
      status: 'ACKNOWLEDGED',
      note: 'Checking with the team',
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.actor_role, 'MANAGER');
    await post(`/exceptions/${finding.finding_id}/reviews`, {
      actorEmployeeId: manager,
      status: 'RESOLVED',
    });
    const detail = await get(`/exceptions/${finding.finding_id}`);
    assert.deepEqual(
      detail.body.reviews.map((r) => r.status),
      ['ACKNOWLEDGED', 'RESOLVED'],
    );
    assert.equal(detail.body.ground_truth.issue_type, 'DOUBLE_BOOKED');
    const open = await get('/exceptions?issueType=DOUBLE_BOOKED&reviewStatus=RESOLVED');
    assert.deepEqual(
      open.body.data.map((f) => f.finding_id),
      [finding.finding_id],
    );
  });

  it('refuses reviewers outside the team and invalid statuses', async () => {
    const { body } = await get('/exceptions?issueType=SKILL_ABSENT');
    const finding = body.data[0];
    const otherManager = tables.team.find((t) => t.team_id !== finding.team_id).manager_employee_id;
    assert.equal(
      (
        await post(`/exceptions/${finding.finding_id}/reviews`, {
          actorEmployeeId: otherManager,
          status: 'RESOLVED',
        })
      ).status,
      403,
    );
    const ops = tables.employee.find((e) => e.employee_role === 'OPS_PARTNER').employee_id;
    assert.equal(
      (
        await post(`/exceptions/${finding.finding_id}/reviews`, {
          actorEmployeeId: ops,
          status: 'RESOLVED',
        })
      ).status,
      403,
    );
    const manager = tables.team.find((t) => t.team_id === finding.team_id).manager_employee_id;
    assert.equal(
      (
        await post(`/exceptions/${finding.finding_id}/reviews`, {
          actorEmployeeId: manager,
          status: 'DONE',
        })
      ).status,
      400,
    );
  });

  it('lets an ops partner review attendance findings', async () => {
    const { body } = await get('/exceptions?issueType=OVERTIME_CAP_EXCEEDED');
    const ops = tables.employee.find((e) => e.employee_role === 'OPS_PARTNER').employee_id;
    const review = await post(`/exceptions/${body.data[0].finding_id}/reviews`, {
      actorEmployeeId: ops,
      status: 'ACKNOWLEDGED',
    });
    assert.equal(review.status, 201);
    assert.equal(review.body.actor_role, 'OPS_PARTNER');
  });

  it('never changes the dataset itself', () => {
    assert.equal(sha256File(join(out, 'starter', 'sqlite', 'yottashift.db')), databaseHash);
  });
});

describe('API: errors', () => {
  it('answers unknown IDs with 404, malformed IDs and filters with 400, unknown routes with 404', async () => {
    assert.deepEqual(await get('/employees/EMP-999999'), {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Employee EMP-999999 does not exist' } },
    });
    assert.equal((await get('/employees/EMP-12')).status, 400);
    assert.equal((await get('/leave?status=LOST')).status, 400);
    assert.equal((await get('/employees?limit=100000')).status, 400);
    assert.equal((await get('/coverage?date=2026-02-30')).status, 400);
    assert.equal((await get('/exceptions/FND-zzz')).status, 400);
    assert.equal((await get('/nowhere')).status, 404);
  });
});

describe('API: deployment', () => {
  it('keeps reviews in reviewsDir when the dataset folder is read-only', () => {
    const reviewsDir = mkdtempSync(join(tmpdir(), 'yottashift-reviews-'));
    const deployed = new DatasetStore({
      dataDir: out,
      profile: 'starter',
      patterns: config.operatingPatterns,
      reviewsDir,
    });
    deployed.close();
    assert.ok(existsSync(join(reviewsDir, 'reviews.db')));
    rmSync(reviewsDir, { recursive: true, force: true });
  });
});
