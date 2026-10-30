import { useState } from 'react';

import { ENUMS } from '../../../src/domain/constants.js';
import { postJson, query, useApi } from '../api.js';
import {
  Async,
  Badge,
  DataTable,
  ErrorBox,
  Pager,
  Panel,
  RecordLink,
  Select,
  StatusBadge,
} from '../components/ui.jsx';
import { when } from '../format.js';

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

const SUBTABS = [
  ['leave', 'Leave requests'],
  ['swaps', 'Shift swaps'],
  ['what-if', 'Leave what-if'],
];

function Timeline({ events }) {
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.event_id}>
          <StatusBadge status={e.to_status} /> · {when(e.event_at)} by{' '}
          {e.actor_role.replace('_', ' ').toLowerCase()}{' '}
          {e.actor_employee_id && <RecordLink id={e.actor_employee_id} />}
          {(e.rule_id || e.reason_code) && (
            <div className="secondary">
              {e.rule_id} {e.reason_code?.replaceAll('_', ' ').toLowerCase()}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function LeaveDetail({ id }) {
  const d = useApi(`/leave/${id}`);
  return (
    <Async state={d} what="Loading leave request">
      {(l) => (
        <Panel
          title={l.leave_request_id}
          sub={`${l.leave_type.toLowerCase()} leave · ${l.start_date} → ${l.end_date} (${days(l.requested_days)})`}
        >
          <dl className="facts">
            <dt>Employee</dt>
            <dd>
              <RecordLink id={l.employee_id} /> {l.employee_name} · team {l.team_id}
            </dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={l.status} /> submitted {when(l.submitted_at)}
            </dd>
            <dt>Decision</dt>
            <dd>
              {l.decided_at ? (
                <>
                  {l.decision_reason_code.replaceAll('_', ' ').toLowerCase()} by{' '}
                  {l.decided_by_role.replace('_', ' ').toLowerCase()}{' '}
                  {l.decided_by_employee_id && <RecordLink id={l.decided_by_employee_id} />} ·{' '}
                  {when(l.decided_at)}
                  <div className="secondary">
                    {l.decision_rule_id}: {l.rule}
                  </div>
                </>
              ) : (
                <span className="muted">not decided</span>
              )}
            </dd>
          </dl>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>History</h3>
          <Timeline events={l.events} />
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Roster changes caused by this leave</h3>
          <DataTable
            rowKey="event_id"
            columns={[
              {
                key: 'assignment_id',
                label: 'Assignment',
                render: (r) => <RecordLink id={r.assignment_id} />,
              },
              {
                key: 'employee_id',
                label: 'Employee',
                render: (r) => <RecordLink id={r.employee_id} />,
              },
              { key: 'shift_id', label: 'Shift' },
              {
                key: 'to_status',
                label: 'Became',
                render: (r) => <StatusBadge status={r.to_status} />,
              },
              {
                key: 'reason_code',
                label: 'Why',
                render: (r) => r.reason_code.replaceAll('_', ' ').toLowerCase(),
              },
            ]}
            rows={l.roster_effects}
            empty="None: no published shift fell inside this leave."
          />
        </Panel>
      )}
    </Async>
  );
}

function SwapDetail({ id }) {
  const d = useApi(`/swaps/${id}`);
  const shift = (a) => (a ? `${a.shift_date} shift ${a.template_code}` : '—');
  return (
    <Async state={d} what="Loading swap">
      {(s) => (
        <Panel
          title={s.swap_id}
          sub={`${s.swap_type === 'SWAP' ? 'Two-way swap' : 'Cover (one-way)'} · team ${s.team_id}`}
        >
          <dl className="facts">
            <dt>Requester</dt>
            <dd>
              <RecordLink id={s.requester_employee_id} /> gives up{' '}
              <RecordLink id={s.requester_assignment_id} /> ({shift(s.requester_assignment)})
            </dd>
            <dt>Counterpart</dt>
            <dd>
              <RecordLink id={s.counterpart_employee_id} />
              {s.counterpart_assignment_id && (
                <>
                  {' '}
                  gives up <RecordLink id={s.counterpart_assignment_id} /> (
                  {shift(s.counterpart_assignment)})
                </>
              )}
            </dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={s.status} /> requested {when(s.requested_at)}
              {s.applied_at && ` · applied ${when(s.applied_at)}`}
            </dd>
            <dt>Decision</dt>
            <dd>
              {s.decided_at ? (
                <>
                  {s.decision_reason_code.replaceAll('_', ' ').toLowerCase()} by{' '}
                  {s.decided_by_role.replace('_', ' ').toLowerCase()}{' '}
                  {s.decided_by_employee_id && <RecordLink id={s.decided_by_employee_id} />}
                  <div className="secondary">
                    {s.decision_rule_id}: {s.rule}
                  </div>
                </>
              ) : (
                <span className="muted">no decision recorded</span>
              )}
            </dd>
          </dl>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>History</h3>
          <Timeline events={s.events} />
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Assignments created by the swap</h3>
          <DataTable
            rowKey="assignment_id"
            columns={[
              {
                key: 'assignment_id',
                label: 'Assignment',
                render: (r) => <RecordLink id={r.assignment_id} />,
              },
              {
                key: 'employee_id',
                label: 'Employee',
                render: (r) => <RecordLink id={r.employee_id} />,
              },
              { key: 'shift_id', label: 'Shift' },
              {
                key: 'supersedes_assignment_id',
                label: 'Replaces',
                render: (r) => <RecordLink id={r.supersedes_assignment_id} />,
              },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            rows={s.created_assignments}
            empty="None: the swap was never applied."
          />
        </Panel>
      )}
    </Async>
  );
}

function RequestList({ kind, selected }) {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const leave = kind === 'leave';
  const list = useApi(`/${leave ? 'leave' : 'swaps'}${query({ status, type, limit: 15, offset })}`);
  const idKey = leave ? 'leave_request_id' : 'swap_id';
  const columns = leave
    ? [
        {
          key: 'leave_request_id',
          label: 'Request',
          render: (r) => <code>{r.leave_request_id}</code>,
        },
        { key: 'employee_name', label: 'Employee' },
        { key: 'leave_type', label: 'Type' },
        { key: 'start_date', label: 'From' },
        { key: 'requested_days', label: 'Days', num: true },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]
    : [
        { key: 'swap_id', label: 'Swap', render: (r) => <code>{r.swap_id}</code> },
        { key: 'swap_type', label: 'Type' },
        { key: 'team_id', label: 'Team' },
        { key: 'requested_at', label: 'Requested', render: (r) => when(r.requested_at) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ];
  const reset = (setter) => (v) => {
    setter(v);
    setOffset(0);
  };

  return (
    <Panel title={leave ? 'Leave requests' : 'Shift swaps'}>
      <div className="filters">
        <Select
          label="Status"
          value={status}
          onChange={reset(setStatus)}
          options={leave ? ENUMS.LEAVE_STATUS : ENUMS.SWAP_STATUS}
        />
        <Select
          label="Type"
          value={type}
          onChange={reset(setType)}
          options={leave ? ENUMS.LEAVE_TYPE : ENUMS.SWAP_TYPE}
        />
      </div>
      <Async state={list} what="Loading requests">
        {(l) => (
          <>
            <DataTable
              rowKey={idKey}
              selectedKey={selected}
              onRowClick={(r) => (window.location.hash = `#/requests/${kind}/${r[idKey]}`)}
              columns={columns}
              rows={l.data}
              empty="No requests match."
            />
            <Pager page={l.page} onOffset={setOffset} />
          </>
        )}
      </Async>
    </Panel>
  );
}

function WhatIf() {
  const [form, setForm] = useState({
    employeeId: 'EMP-000101',
    leaveType: 'ANNUAL',
    startDate: '',
    endDate: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await postJson('/leave/evaluate', form));
    } catch (e) {
      setResult(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid two">
      <Panel
        title="Would this leave be approved?"
        sub="Runs the same rule engine as the generator against everything already recorded. Nothing is stored."
      >
        <form className="form" onSubmit={submit}>
          <label>
            Employee ID
            <input
              value={form.employeeId}
              onChange={(e) => set('employeeId')(e.target.value.trim())}
              pattern="EMP-\d{6}"
              required
            />
          </label>
          <Select
            label="Leave type"
            value={form.leaveType}
            onChange={set('leaveType')}
            options={ENUMS.LEAVE_TYPE}
            all={null}
          />
          <label>
            First day
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate')(e.target.value)}
              required
            />
          </label>
          <label>
            Last day
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(e) => set('endDate')(e.target.value)}
              required
            />
          </label>
          <div>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Check'}
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Result">
        {error && <ErrorBox message={error} />}
        {!error && !result && (
          <p className="muted">Fill in the form to see the decision and the rule behind it.</p>
        )}
        {result && (
          <dl className="facts">
            <dt>Decision</dt>
            <dd>
              <StatusBadge status={result.decision.status} />{' '}
              {result.decision.reason_code.replaceAll('_', ' ').toLowerCase()}
            </dd>
            <dt>Rule</dt>
            <dd>
              {result.decision.rule_id}: {result.decision.rule}
            </dd>
            <dt>Decided by</dt>
            <dd>
              {result.decision.decided_by_role.replace('_', ' ').toLowerCase()}{' '}
              {result.decision.decided_by_employee_id && (
                <RecordLink id={result.decision.decided_by_employee_id} />
              )}
            </dd>
            <dt>Request</dt>
            <dd>
              {days(result.request.requestedDays)} · submitted {when(result.request.submittedAt)}{' '}
              (assumed)
            </dd>
            <dt>Balance</dt>
            <dd>
              {result.balance ? (
                `${result.balance.remaining_days} of ${result.balance.entitled_days} days left`
              ) : (
                <span className="muted">not an entitled leave type</span>
              )}
            </dd>
            <dt>Stored</dt>
            <dd>
              <Badge tone="neutral">no — what-if only</Badge>
            </dd>
          </dl>
        )}
      </Panel>
    </div>
  );
}

export function RequestsView({ kind, id }) {
  const active = SUBTABS.some(([k]) => k === kind) ? kind : 'leave';
  return (
    <div className="grid">
      <nav className="subtabs" aria-label="Request types">
        {SUBTABS.map(([k, label]) => (
          <a key={k} href={`#/requests/${k}`} aria-current={k === active ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {active === 'what-if' ? (
        <WhatIf />
      ) : (
        <div className="grid two">
          <RequestList key={active} kind={active} selected={id} />
          {id ? (
            active === 'leave' ? (
              <LeaveDetail key={id} id={id} />
            ) : (
              <SwapDetail key={id} id={id} />
            )
          ) : (
            <Panel
              title="Select a request"
              sub="Pick a row to see the decision, the rule that made it, its full history and what it changed on the roster."
            />
          )}
        </div>
      )}
    </div>
  );
}
