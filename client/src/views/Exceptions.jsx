import { useState } from 'react';

import { ENUMS } from '../../../src/domain/constants.js';
import { postJson, query, useApi } from '../api.js';
import { BarList } from '../components/charts.jsx';
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
import { fmt, when } from '../format.js';

const ANOMALY_TYPES = ENUMS.ISSUE_TYPE.filter((t) => !t.startsWith('BOUNDARY_'));
const REVIEW = ['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'];

function ReviewForm({ finding, onSaved }) {
  const team = useApi(finding.team_id ? `/teams/${finding.team_id}` : null);
  const ops = useApi(/^R-(ATT|OVT)-/.test(finding.rule_id) ? '/employees?role=OPS_PARTNER' : null);
  const [actor, setActor] = useState('');
  const [status, setStatus] = useState('ACKNOWLEDGED');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Only people allowed to review this finding are offered (the API enforces it as well).
  const reviewers = [];
  if (team.data) {
    const t = team.data;
    reviewers.push([
      t.manager_employee_id,
      `${t.manager_employee_id} · ${t.manager_name} (team manager)`,
    ]);
    reviewers.push([
      t.hr_partner_employee_id,
      `${t.hr_partner_employee_id} · ${t.hr_partner_name} (HR partner)`,
    ]);
  }
  for (const o of ops.data?.data ?? [])
    reviewers.push([o.employee_id, `${o.employee_id} · ${o.full_name} (ops partner)`]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await postJson(`/exceptions/${finding.finding_id}/reviews`, {
        actorEmployeeId: actor,
        status,
        note: note || undefined,
      });
      setNote('');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <Select
        label="Reviewer"
        value={actor}
        onChange={setActor}
        options={reviewers}
        all="Choose a reviewer"
      />
      <Select label="Status" value={status} onChange={setStatus} options={REVIEW} all={null} />
      <label>
        Note (optional)
        <textarea rows="2" maxLength="500" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <ErrorBox message={error} />}
      <div>
        <button className="primary" type="submit" disabled={!actor || saving}>
          {saving ? 'Saving…' : 'Add review'}
        </button>
      </div>
    </form>
  );
}

function FindingDetail({ id, onChanged }) {
  const detail = useApi(`/exceptions/${id}`);
  return (
    <Async state={detail} what="Loading finding">
      {(f) => (
        <Panel title={`${f.rule_id} · ${f.rule}`} sub={f.message}>
          <dl className="facts">
            <dt>Finding</dt>
            <dd>
              <code>{f.finding_id}</code> <StatusBadge status={f.kind} />
            </dd>
            <dt>Issue type</dt>
            <dd>{f.issue_type ?? '—'}</dd>
            <dt>Employee</dt>
            <dd>
              <RecordLink id={f.employee_id} /> · team {f.team_id ?? '—'}
            </dd>
            <dt>Records</dt>
            <dd style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {f.record_ids.map((r) => (
                <RecordLink key={r} id={r} />
              ))}
            </dd>
            <dt>Ground truth</dt>
            <dd>
              {f.ground_truth ? (
                <>
                  <Badge tone="good">labelled {f.ground_truth.ground_truth_id}</Badge>{' '}
                  {f.ground_truth.description}
                </>
              ) : (
                <span className="muted">not a labelled anomaly</span>
              )}
            </dd>
          </dl>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Review trail</h3>
          {f.reviews.length === 0 ? (
            <p className="muted">No reviews yet.</p>
          ) : (
            <ol className="timeline">
              {f.reviews.map((r) => (
                <li key={r.review_id}>
                  <StatusBadge status={r.status} /> by <RecordLink id={r.actor_employee_id} /> (
                  {r.actor_role.replace('_', ' ').toLowerCase()}) · {when(r.reviewed_at)}
                  {r.note && <div className="secondary">{r.note}</div>}
                </li>
              ))}
            </ol>
          )}
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Add a review</h3>
          <ReviewForm
            finding={f}
            onSaved={() => {
              detail.reload();
              onChanged();
            }}
          />
        </Panel>
      )}
    </Async>
  );
}

export function ExceptionsView({ findingId }) {
  const [issueType, setIssueType] = useState('');
  const [kind, setKind] = useState('VIOLATION');
  const [reviewStatus, setReviewStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const summary = useApi('/exceptions/summary');
  const list = useApi(`/exceptions${query({ issueType, kind, reviewStatus, limit: 20, offset })}`);
  const change = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  return (
    <div className="grid">
      <Panel
        title="Findings by rule"
        sub="Business-rule checks run on the data alone; labelled = matches a ground-truth anomaly"
      >
        <Async state={summary} what="Loading summary">
          {(s) => (
            <BarList
              rows={s.data.map((r) => ({
                label: `${r.rule_id} · ${r.kind.toLowerCase()} · ${r.labelled}/${r.total} labelled`,
                value: r.total,
              }))}
              format={fmt}
            />
          )}
        </Async>
      </Panel>
      <div className="grid two">
        <Panel title="Exceptions">
          <div className="filters">
            <Select
              label="Kind"
              value={kind}
              onChange={change(setKind)}
              options={['VIOLATION', 'EXCEPTION']}
            />
            <Select
              label="Issue type"
              value={issueType}
              onChange={change(setIssueType)}
              options={ANOMALY_TYPES}
            />
            <Select
              label="Review status"
              value={reviewStatus}
              onChange={change(setReviewStatus)}
              options={['OPEN', ...REVIEW]}
            />
          </div>
          <Async state={list} what="Loading exceptions">
            {(l) => (
              <>
                <DataTable
                  rowKey="finding_id"
                  selectedKey={findingId}
                  onRowClick={(r) => (window.location.hash = `#/exceptions/${r.finding_id}`)}
                  columns={[
                    { key: 'rule_id', label: 'Rule' },
                    {
                      key: 'issue_type',
                      label: 'Issue type',
                      render: (r) => r.issue_type ?? <span className="muted">side effect</span>,
                    },
                    {
                      key: 'employee_id',
                      label: 'Employee',
                      render: (r) => <code>{r.employee_id}</code>,
                    },
                    { key: 'reference_date', label: 'Date' },
                    {
                      key: 'ground_truth_id',
                      label: 'Label',
                      render: (r) => (r.ground_truth_id ? <code>{r.ground_truth_id}</code> : '—'),
                    },
                    {
                      key: 'review_status',
                      label: 'Review',
                      render: (r) => <StatusBadge status={r.review_status} />,
                    },
                  ]}
                  rows={l.data}
                  empty="No findings for this selection."
                />
                <Pager page={l.page} onOffset={setOffset} />
              </>
            )}
          </Async>
        </Panel>
        {findingId ? (
          <FindingDetail key={findingId} id={findingId} onChanged={list.reload} />
        ) : (
          <Panel
            title="Select a finding"
            sub="Pick a row to see its records, ground-truth label and review trail, and to add a review."
          />
        )}
      </div>
    </div>
  );
}
