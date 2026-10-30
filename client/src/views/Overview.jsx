import { useApi } from '../api.js';
import { ColumnChart, LineChart } from '../components/charts.jsx';
import { Async, DataTable, Link, Panel, StatTile } from '../components/ui.jsx';
import { fmt, pct } from '../format.js';

export function OverviewView() {
  const metrics = useApi('/metrics');
  const daily = useApi('/coverage/daily');
  const validation = useApi('/validation');

  return (
    <Async state={metrics} what="Loading metrics">
      {(m) => {
        const leave = m.M04_leave.by_status;
        const decidedLeave = (leave.APPROVED ?? 0) + (leave.CANCELLED ?? 0) + (leave.REJECTED ?? 0);
        const detection = validation.data?.evaluation?.overall;
        return (
          <div className="grid">
            <div className="grid tiles">
              <StatTile
                hero
                label="Required headcount filled by qualified staff"
                value={pct(m.M01_coverage_fill.fill_rate)}
                note={`${pct(m.M01_coverage_fill.attended_fill_rate)} after absences · ${fmt(m.M01_coverage_fill.required_headcount)} required`}
              />
              <StatTile
                label="Short slots"
                value={fmt(m.M02_gaps.gap_slots)}
                note={`${fmt(m.M02_gaps.gap_headcount_hours)} missing headcount-hours`}
              />
              <StatTile
                label="Overtime cap breaches"
                value={fmt(m.M03_overtime.cap_breaches)}
                note={`${fmt(m.M03_overtime.weeks_with_overtime)} weeks with overtime · max ${m.M03_overtime.overtime_hours_max} h`}
              />
              <StatTile
                label="Leave approved"
                value={pct(((leave.APPROVED ?? 0) + (leave.CANCELLED ?? 0)) / decidedLeave)}
                note={`${fmt(m.M04_leave.requests)} requests · ${fmt(leave.REJECTED)} rejected`}
              />
              <StatTile
                label="Swaps approved (of manager decisions)"
                value={pct(m.M05_swaps.approval_rate_of_decided)}
                note={`${pct(m.M05_swaps.expiry_rate)} expired`}
              />
              <StatTile
                label="Punctual clock-ins"
                value={pct(m.M06_attendance.punctuality_rate)}
                note={`${pct(m.M06_attendance.no_show_rate)} no-shows`}
              />
              <StatTile
                label="Shifts with a complete record"
                value={pct(m.M07_reconciliation.complete_record_rate, 2)}
                note={`${fmt(m.M07_reconciliation.due_assignments)} due shifts`}
              />
              <StatTile
                label="Night-shift fairness (Jain)"
                value={m.M08_fairness.jain_nights?.mean ?? '—'}
                note="1.0 = perfectly even, mean across 24×7 teams"
              />
              <StatTile
                label="Anomalies detected"
                value={detection ? `${detection.detected} / ${detection.anomaly_labels}` : '—'}
                note={detection ? `precision ${pct(detection.precision)}` : 'run npm run validate'}
              />
            </div>

            <Async state={daily} what="Loading coverage">
              {(d) => {
                const labels = d.data.map((r) => r.shift_date);
                const planned = d.data.map((r) => r.filled / r.required);
                const attended = d.data.map((r) => r.attended / r.required);
                // Start the axis at the 5 % step below the worst day so no value falls off it.
                const floor = Math.max(0, Math.floor(Math.min(...planned, ...attended) * 20) / 20);
                return (
                  <div className="grid two">
                    <Panel
                      title="Share of required headcount filled, per day"
                      sub="Planned roster vs people who actually clocked in"
                    >
                      <LineChart
                        title="Share of required headcount filled per day"
                        labels={labels}
                        yMin={floor}
                        yMax={1}
                        format={(v) => pct(v, 0)}
                        series={[
                          {
                            key: 'planned',
                            label: 'Qualified staff rostered',
                            color: 'var(--series-1)',
                            values: planned,
                          },
                          {
                            key: 'attended',
                            label: 'Staff who clocked in',
                            color: 'var(--series-2)',
                            values: attended,
                          },
                        ]}
                      />
                    </Panel>
                    <Panel
                      title="Missing headcount per day"
                      sub="People short of the minimum staffing, all teams and skills"
                    >
                      <ColumnChart
                        title="Missing headcount per day"
                        labels={labels}
                        values={d.data.map((r) => r.gap_headcount)}
                        format={fmt}
                        valueLabel="Missing headcount"
                      />
                    </Panel>
                  </div>
                );
              }}
            </Async>

            <Panel
              title="Teams with the most missing headcount-hours"
              sub="Open a team's coverage for the detail"
            >
              <DataTable
                rowKey="team_id"
                columns={[
                  {
                    key: 'team_id',
                    label: 'Team',
                    render: (r) => <Link to={`coverage/${r.team_id}`}>{r.team_id}</Link>,
                  },
                  { key: 'team_name', label: 'Name' },
                  { key: 'gap_slots', label: 'Short slots', num: true },
                  { key: 'gap_headcount', label: 'Missing headcount', num: true },
                  {
                    key: 'gap_headcount_hours',
                    label: 'Headcount-hours',
                    num: true,
                    render: (r) => fmt(r.gap_headcount_hours),
                  },
                ]}
                rows={m.M02_gaps.worst_teams}
              />
            </Panel>
          </div>
        );
      }}
    </Async>
  );
}
