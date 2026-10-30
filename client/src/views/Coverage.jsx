import { useState } from 'react';

import { query, useApi } from '../api.js';
import { ColumnChart, LineChart } from '../components/charts.jsx';
import { Async, DataTable, Pager, Panel, Select, StatusBadge } from '../components/ui.jsx';
import { fmt, pct } from '../format.js';

export function CoverageView({ teamId: initialTeam }) {
  const [teamId, setTeamId] = useState(initialTeam ?? '');
  const [date, setDate] = useState('');
  const [offset, setOffset] = useState(0);
  const teams = useApi('/teams');
  const daily = useApi(`/coverage/daily${query({ teamId })}`);
  const gaps = useApi(`/coverage${query({ status: 'GAP', teamId, date, limit: 25, offset })}`);
  const team = teams.data?.data.find((t) => t.team_id === teamId);

  const change = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  return (
    <div className="grid">
      <div className="filters">
        <Async state={teams} what="Loading teams">
          {(t) => (
            <Select
              label="Team"
              value={teamId}
              onChange={change(setTeamId)}
              all="All teams"
              options={t.data
                .filter((x) => x.team_function !== 'WORKFORCE_OFFICE')
                .map((x) => [x.team_id, `${x.team_id} · ${x.team_name} (${x.gap_slots} short)`])}
            />
          )}
        </Async>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => change(setDate)(e.target.value)} />
        </label>
        {date && <button onClick={() => change(setDate)('')}>All dates</button>}
      </div>
      {team && (
        <p className="secondary" style={{ margin: 0 }}>
          {team.team_name} · {team.team_function.replaceAll('_', ' ').toLowerCase()} ·{' '}
          {team.operating_pattern.replaceAll('_', ' ').toLowerCase()} · manager {team.manager_name}{' '}
          · HR partner {team.hr_partner_name} · {team.schedulable_members} schedulable people
        </p>
      )}

      <Async state={daily} what="Loading coverage">
        {(d) => {
          const labels = d.data.map((r) => r.shift_date);
          const planned = d.data.map((r) => r.filled / r.required);
          const attended = d.data.map((r) => r.attended / r.required);
          const floor = Math.max(0, Math.floor(Math.min(...planned, ...attended) * 20) / 20);
          return (
            <div className="grid two">
              <Panel
                title="Share of required headcount filled, per day"
                sub={team ? team.team_name : 'All teams'}
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
                sub="Required minus qualified staff rostered (R-COV-04)"
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
        title="Short slots"
        sub="Each row is a shift × team × skill below its minimum. Gaps are reported, never filled with someone unqualified."
      >
        <Async state={gaps} what="Loading gaps">
          {(g) => (
            <>
              <DataTable
                rowKey="shift_id"
                columns={[
                  { key: 'shift_date', label: 'Date' },
                  { key: 'template_code', label: 'Shift' },
                  { key: 'day_type', label: 'Day type' },
                  { key: 'team_name', label: 'Team' },
                  { key: 'skill_name', label: 'Skill' },
                  { key: 'required_headcount', label: 'Required', num: true },
                  { key: 'assigned_headcount', label: 'Assigned', num: true },
                  { key: 'qualified_headcount', label: 'Qualified', num: true },
                  { key: 'attended_headcount', label: 'Clocked in', num: true },
                  { key: 'gap_headcount', label: 'Missing', num: true },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (r) => <StatusBadge status={r.status} />,
                  },
                ]}
                rows={g.data.map((r) => ({
                  ...r,
                  shift_id: `${r.shift_id}|${r.team_id}|${r.skill_id}`,
                }))}
                empty="No short slots for this selection."
              />
              <Pager page={g.page} onOffset={setOffset} />
            </>
          )}
        </Async>
      </Panel>
    </div>
  );
}
