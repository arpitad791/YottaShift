import { useApi } from '../api.js';
import { Async, DataTable, Panel, RecordLink, StatusBadge } from '../components/ui.jsx';
import { hours, when } from '../format.js';

/** One assignment's full story: who, what, every status change, punches and the reconciled result. */
export function AssignmentView({ assignmentId }) {
  const a = useApi(assignmentId ? `/assignments/${assignmentId}` : null);
  if (!assignmentId) return <Panel title="No assignment selected" />;
  return (
    <Async state={a} what="Loading assignment">
      {(x) => (
        <div className="grid">
          <Panel
            title={`${x.assignment_id}`}
            sub={`${x.shift_date} · shift ${x.template_code} (${x.day_type.toLowerCase()}) · ${x.skill_name}`}
          >
            <dl className="facts">
              <dt>Employee</dt>
              <dd>
                <RecordLink id={x.employee_id} /> {x.employee_name} · team {x.team_id}
              </dd>
              <dt>Time</dt>
              <dd>
                {when(x.start_at)} → {when(x.end_at)}
              </dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={x.status} /> source {x.source.toLowerCase()}
              </dd>
              {x.swap_id && (
                <>
                  <dt>Swap</dt>
                  <dd>
                    <RecordLink id={x.swap_id} />
                  </dd>
                </>
              )}
              <dt>Replaces</dt>
              <dd>
                {x.supersedes ? (
                  <RecordLink id={x.supersedes} />
                ) : (
                  <span className="muted">nothing (original roster)</span>
                )}
              </dd>
              <dt>Replaced by</dt>
              <dd style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {x.superseded_by.length === 0 && <span className="muted">nothing</span>}
                {x.superseded_by.map((s) => (
                  <span key={s.assignment_id}>
                    <RecordLink id={s.assignment_id} /> ({s.source.toLowerCase()},{' '}
                    <RecordLink id={s.employee_id} />)
                  </span>
                ))}
              </dd>
            </dl>
          </Panel>

          <div className="grid two">
            <Panel title="Status history" sub="Append-only: the current status is the last event">
              <ol className="timeline">
                {x.events.map((e) => (
                  <li key={e.event_id}>
                    <StatusBadge status={e.to_status} />{' '}
                    {e.reason_code.replaceAll('_', ' ').toLowerCase()} · {when(e.event_at)}
                    <div className="secondary">
                      by {e.actor_role.replace('_', ' ').toLowerCase()}{' '}
                      {e.actor_employee_id && <RecordLink id={e.actor_employee_id} />}
                      {e.leave_request_id && (
                        <>
                          {' '}
                          · leave <RecordLink id={e.leave_request_id} />
                        </>
                      )}
                      {e.swap_id && (
                        <>
                          {' '}
                          · swap <RecordLink id={e.swap_id} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel title="Attendance" sub="Raw punches, then the reconciled result">
              <DataTable
                rowKey="attendance_event_id"
                columns={[
                  { key: 'event_type', label: 'Event' },
                  { key: 'event_at', label: 'At', render: (r) => when(r.event_at) },
                  { key: 'source', label: 'Source' },
                  {
                    key: 'recorded_by_employee_id',
                    label: 'Corrected by',
                    render: (r) =>
                      r.recorded_by_employee_id ? (
                        <RecordLink id={r.recorded_by_employee_id} />
                      ) : (
                        '—'
                      ),
                  },
                ]}
                rows={x.attendance}
                empty="No punches recorded."
              />
              {x.reconciliation ? (
                <dl className="facts" style={{ marginTop: 12 }}>
                  <dt>Outcome</dt>
                  <dd>
                    <StatusBadge status={x.reconciliation.outcome} />
                  </dd>
                  <dt>Scheduled</dt>
                  <dd>{hours(x.reconciliation.scheduled_minutes)}</dd>
                  <dt>Worked</dt>
                  <dd>
                    {x.reconciliation.worked_minutes === null
                      ? '—'
                      : hours(x.reconciliation.worked_minutes)}
                  </dd>
                  <dt>Late / early / extended</dt>
                  <dd>
                    {x.reconciliation.late_minutes ?? 0} /{' '}
                    {x.reconciliation.early_leave_minutes ?? 0} /{' '}
                    {x.reconciliation.extension_minutes ?? 0} min
                  </dd>
                </dl>
              ) : (
                <p className="muted">
                  Not reconciled: the assignment is not active or not yet due.
                </p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </Async>
  );
}
