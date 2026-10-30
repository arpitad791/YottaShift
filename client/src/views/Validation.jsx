import { useApi } from '../api.js';
import { Async, Badge, DataTable, Panel, StatTile, StatusBadge } from '../components/ui.jsx';
import { fmt, pct } from '../format.js';

const checkColumns = [
  { key: 'id', label: 'Check' },
  { key: 'name', label: 'What it proves' },
  { key: 'checked', label: 'Checked', num: true, render: (r) => fmt(r.checked) },
  { key: 'failures', label: 'Failures', num: true, render: (r) => fmt(r.failures) },
  {
    key: 'result',
    label: 'Result',
    render: (r) => <StatusBadge status={r.failures === 0 ? 'PASS' : 'FAIL'} />,
  },
];

function Reproducibility() {
  const r = useApi('/reproducibility');
  if (r.error) {
    return (
      <Panel title="Reproducibility">
        <p className="muted">{r.error}</p>
      </Panel>
    );
  }
  return (
    <Async state={r} what="Loading reproducibility report">
      {(x) => (
        <Panel
          title="Reproducibility"
          sub={`Seed ${x.seed} · config ${x.config_sha256.slice(0, 12)}… · Node ${x.environment.node} · SQLite ${x.environment.sqlite}`}
        >
          <dl className="facts">
            <dt>Two fresh runs</dt>
            <dd>
              <StatusBadge status={x.identical ? 'PASS' : 'FAIL'} /> {x.runs} runs, {x.files.length}{' '}
              files, {x.run_differences.length} differences
            </dd>
            <dt>Published manifest</dt>
            <dd>
              {x.published.present ? (
                <>
                  <StatusBadge status={x.published.differences.length === 0 ? 'PASS' : 'FAIL'} />{' '}
                  {x.published.differences.length} differences
                  {!x.published.same_environment && ' (different Node / SQLite version)'}
                </>
              ) : (
                <span className="muted">no published manifest to compare</span>
              )}
            </dd>
            <dt>Re-run it</dt>
            <dd>
              <code>{x.command}</code>
            </dd>
          </dl>
        </Panel>
      )}
    </Async>
  );
}

export function ValidationView() {
  const v = useApi('/validation');
  return (
    <Async state={v} what="Loading validation report">
      {(s) => {
        const o = s.evaluation.overall;
        const b = s.evaluation.boundary;
        return (
          <div className="grid">
            <div className="grid tiles">
              <StatTile
                hero
                label="Validation"
                value={<StatusBadge status={s.status} />}
                note={`${s.problems.length} problems · validator reads only the exported files`}
              />
              <StatTile
                label="Anomalies detected"
                value={`${o.detected} / ${o.anomaly_labels}`}
                note={`recall ${pct(o.recall)}`}
              />
              <StatTile
                label="Precision"
                value={pct(o.precision)}
                note={`${o.false_positives} false positives of ${o.typed_findings} typed findings`}
              />
              <StatTile
                label="Boundary cases flagged"
                value={`${b.flagged} / ${b.labels}`}
                note="valid edge cases; 0 means no false alarms"
              />
              <StatTile
                label="Rows checked"
                value={fmt(Object.values(s.rows).reduce((a, n) => a + n, 0))}
                note={`${Object.keys(s.rows).length} tables`}
              />
            </div>

            {s.problems.length > 0 && (
              <Panel title="Problems">
                <ul>
                  {s.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title="Acceptance criteria" sub="From the brief">
              <DataTable
                rowKey="id"
                columns={[
                  { key: 'id', label: 'ID' },
                  { key: 'criterion', label: 'Criterion' },
                  {
                    key: 'passed',
                    label: 'Result',
                    render: (r) => <StatusBadge status={r.passed ? 'PASS' : 'FAIL'} />,
                  },
                  {
                    key: 'evidence',
                    label: 'Evidence',
                    render: (r) => <span className="secondary">{r.evidence}</span>,
                  },
                ]}
                rows={s.acceptance}
              />
            </Panel>

            <div className="grid two">
              <Panel title="Detection by anomaly type" sub={`Match rule: ${s.evaluation.matching}`}>
                <DataTable
                  rowKey="issue_type"
                  columns={[
                    { key: 'issue_type', label: 'Issue type' },
                    { key: 'labels', label: 'Labels', num: true },
                    { key: 'true_positives', label: 'Found', num: true },
                    { key: 'false_negatives', label: 'Missed', num: true },
                    { key: 'false_positives', label: 'False alarms', num: true },
                    {
                      key: 'precision',
                      label: 'Precision',
                      num: true,
                      render: (r) => pct(r.precision, 0),
                    },
                    { key: 'recall', label: 'Recall', num: true, render: (r) => pct(r.recall, 0) },
                  ]}
                  rows={s.evaluation.per_type}
                />
              </Panel>
              <Panel
                title="Boundary cases"
                sub="Values exactly at a limit: legal, so they must not be flagged"
              >
                <DataTable
                  rowKey="type"
                  columns={[
                    { key: 'type', label: 'Boundary' },
                    { key: 'labels', label: 'Cases', num: true },
                    { key: 'flagged', label: 'Flagged', num: true },
                    {
                      key: 'ok',
                      label: 'Result',
                      render: (r) =>
                        r.flagged === 0 ? (
                          <Badge tone="good">none flagged</Badge>
                        ) : (
                          <Badge tone="critical">false alarm</Badge>
                        ),
                    },
                  ]}
                  rows={Object.entries(b.by_type).map(([type, x]) => ({ type, ...x }))}
                />
              </Panel>
            </div>

            <Panel
              title="Integrity checks"
              sub="Structure, keys, enums, time order and recomputed derived tables"
            >
              <DataTable rowKey="id" columns={checkColumns} rows={s.integrity} />
            </Panel>
            <Panel
              title="Decision replay"
              sub="Every stored decision is re-derived from the rules and must match"
            >
              <DataTable rowKey="id" columns={checkColumns} rows={s.decisions} />
            </Panel>
            <Reproducibility />
          </div>
        );
      }}
    </Async>
  );
}
