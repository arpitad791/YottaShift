import { useState } from 'react';

import { ENUMS } from '../../../src/domain/constants.js';
import { query, useApi } from '../api.js';
import {
  Async,
  Badge,
  DataTable,
  Link,
  Pager,
  Panel,
  RecordLink,
  Select,
  StatusBadge,
} from '../components/ui.jsx';
import { hours } from '../format.js';

function EmployeeDetail({ id }) {
  const employee = useApi(`/employees/${id}`);
  const schedule = useApi(`/employees/${id}/schedule`);
  const leave = useApi(`/leave${query({ employeeId: id, limit: 100 })}`);
  return (
    <Async state={employee} what="Loading employee">
      {(e) => (
        <div className="grid">
          <Panel
            title={`${e.full_name}`}
            sub={`${e.employee_id} · ${e.employee_role.replace('_', ' ').toLowerCase()} · ${e.employment_type.replaceAll('_', ' ').toLowerCase()}`}
          >
            <dl className="facts">
              <dt>Team</dt>
              <dd>
                <Link to={`coverage/${e.team.team_id}`}>{e.team.team_id}</Link> · {e.team.team_name}
              </dd>
              <dt>Employment</dt>
              <dd>
                <StatusBadge status={e.employment_status} /> hired {e.hire_date}
                {e.termination_date && ` · leaves ${e.termination_date}`}
              </dd>
              <dt>Policy</dt>
              <dd>
                {e.policy.policy_id} · {e.policy.contracted_weekly_hours} h/week contract · max{' '}
                {e.policy.max_weekly_scheduled_hours} h scheduled · overtime cap{' '}
                {e.policy.weekly_overtime_cap_hours} h · {e.policy.min_rest_hours} h rest · ≤{' '}
                {e.policy.max_consecutive_days} days in a row
              </dd>
              <dt>Skills</dt>
              <dd style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {e.skills.length === 0 && <span className="muted">none</span>}
                {e.skills.map((s) => (
                  <Badge
                    key={s.skill_id}
                    tone={s.skill_id === e.primary_skill_id ? 'good' : 'neutral'}
                  >
                    {s.skill_name} · {s.proficiency.toLowerCase()}
                    {s.valid_to && ` · until ${s.valid_to}`}
                  </Badge>
                ))}
              </dd>
            </dl>
          </Panel>

          {e.leave_balances.length > 0 && (
            <Panel title="Leave balances">
              <DataTable
                rowKey="leave_type"
                columns={[
                  { key: 'leave_type', label: 'Type' },
                  { key: 'entitled_days', label: 'Entitled', num: true },
                  { key: 'approved_days', label: 'Approved', num: true },
                  { key: 'remaining_days', label: 'Remaining', num: true },
                ]}
                rows={e.leave_balances}
              />
            </Panel>
          )}

          <Async state={leave} what="Loading leave">
            {(l) =>
              l.data.length > 0 && (
                <Panel title="Leave requests">
                  <DataTable
                    rowKey="leave_request_id"
                    columns={[
                      {
                        key: 'leave_request_id',
                        label: 'Request',
                        render: (r) => <RecordLink id={r.leave_request_id} />,
                      },
                      { key: 'leave_type', label: 'Type' },
                      { key: 'start_date', label: 'From' },
                      { key: 'end_date', label: 'To' },
                      {
                        key: 'status',
                        label: 'Status',
                        render: (r) => <StatusBadge status={r.status} />,
                      },
                      { key: 'decision_reason_code', label: 'Reason' },
                    ]}
                    rows={l.data}
                  />
                </Panel>
              )
            }
          </Async>

          {e.weeks.length > 0 && (
            <Panel
              title="Hours per week"
              sub="Overtime = worked hours above the contract; the cap comes from the labour policy (R-OVT-02)"
            >
              <DataTable
                rowKey="iso_week"
                columns={[
                  { key: 'iso_week', label: 'Week' },
                  { key: 'contracted_hours', label: 'Contract', num: true },
                  { key: 'scheduled_hours', label: 'Scheduled', num: true },
                  { key: 'worked_hours', label: 'Worked', num: true },
                  { key: 'overtime_hours', label: 'Overtime', num: true },
                  { key: 'overtime_cap_hours', label: 'Cap', num: true },
                  {
                    key: 'is_overtime_cap_exceeded',
                    label: 'Cap check',
                    render: (w) =>
                      w.is_overtime_cap_exceeded ? (
                        <Badge tone="critical">exceeded</Badge>
                      ) : (
                        <span className="muted">within</span>
                      ),
                  },
                ]}
                rows={e.weeks}
              />
            </Panel>
          )}

          <Panel
            title="Schedule"
            sub="Every assignment, including ones later cancelled or swapped out — open one for its full history"
          >
            <Async state={schedule} what="Loading schedule">
              {(s) => (
                <DataTable
                  rowKey="assignment_id"
                  columns={[
                    {
                      key: 'assignment_id',
                      label: 'Assignment',
                      render: (r) => <RecordLink id={r.assignment_id} />,
                    },
                    { key: 'shift_date', label: 'Date' },
                    { key: 'template_code', label: 'Shift' },
                    { key: 'skill_name', label: 'Skill' },
                    { key: 'source', label: 'Source' },
                    {
                      key: 'status',
                      label: 'Status',
                      render: (r) => <StatusBadge status={r.status} />,
                    },
                    {
                      key: 'attendance_outcome',
                      label: 'Attendance',
                      render: (r) =>
                        r.attendance_outcome ? <StatusBadge status={r.attendance_outcome} /> : '—',
                    },
                    {
                      key: 'worked_minutes',
                      label: 'Worked',
                      num: true,
                      render: (r) =>
                        r.worked_minutes === null || r.worked_minutes === undefined
                          ? '—'
                          : hours(r.worked_minutes),
                    },
                  ]}
                  rows={s.data}
                  empty="No assignments (managers and partners are not rostered)."
                />
              )}
            </Async>
          </Panel>
        </div>
      )}
    </Async>
  );
}

export function PeopleView({ employeeId }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useApi(`/employees${query({ q, role, limit: 15, offset })}`);

  return (
    <div className="grid two">
      <Panel title="People">
        <div className="filters">
          <label>
            Search
            <input
              type="search"
              placeholder="Name or EMP-…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <Select
            label="Role"
            value={role}
            onChange={(v) => {
              setRole(v);
              setOffset(0);
            }}
            options={ENUMS.EMPLOYEE_ROLE}
          />
        </div>
        <Async state={list} what="Loading people">
          {(l) => (
            <>
              <DataTable
                rowKey="employee_id"
                selectedKey={employeeId}
                onRowClick={(r) => (window.location.hash = `#/people/${r.employee_id}`)}
                columns={[
                  { key: 'employee_id', label: 'ID', render: (r) => <code>{r.employee_id}</code> },
                  { key: 'full_name', label: 'Name' },
                  { key: 'team_id', label: 'Team' },
                  { key: 'employee_role', label: 'Role' },
                ]}
                rows={l.data}
                empty="Nobody matches."
              />
              <Pager page={l.page} onOffset={setOffset} />
            </>
          )}
        </Async>
      </Panel>
      {employeeId ? (
        <EmployeeDetail key={employeeId} id={employeeId} />
      ) : (
        <Panel
          title="Select a person"
          sub="Pick someone to see their skills, leave balances, weekly hours and full schedule."
        />
      )}
    </div>
  );
}
