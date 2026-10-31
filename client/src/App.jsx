import { useEffect, useState } from 'react';

import { useApi } from './api.js';
import { StatusBadge } from './components/ui.jsx';
import { AssignmentView } from './views/Assignment.jsx';
import { CoverageView } from './views/Coverage.jsx';
import { ExceptionsView } from './views/Exceptions.jsx';
import { OverviewView } from './views/Overview.jsx';
import { PeopleView } from './views/People.jsx';
import { RequestsView } from './views/Requests.jsx';
import { ValidationView } from './views/Validation.jsx';

const TABS = [
  ['overview', 'Overview', 'HR partner · system administrator'],
  ['coverage', 'Coverage', 'Manager · IT / operations partner'],
  ['exceptions', 'Exceptions', 'Manager · HR partner · operations partner'],
  ['people', 'People', 'Employee · manager'],
  ['requests', 'Leave & swaps', 'Employee · manager · HR partner'],
  ['validation', 'Validation', 'System administrator'],
];

function useRoute() {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function App() {
  const [view = 'overview', ...rest] = useRoute();
  const health = useApi('/health');
  const validation = useApi('/validation');
  const active = view === 'assignment' ? 'people' : view;
  const tab = TABS.find(([key]) => key === active) ?? TABS[0];

  return (
    <div className="app">
      <header className="top">
        <h1>YottaShift</h1>
        <span className="meta">
          {health.data
            ? `Profile ${health.data.profile} · seed ${health.data.seed} · ${health.data.window.start_date} → ${health.data.window.end_date}`
            : health.error
              ? 'API not reachable — start it with npm run api'
              : 'Connecting…'}
        </span>
        {validation.data && (
          <span>
            Validation <StatusBadge status={validation.data.status} />
          </span>
        )}
      </header>
      <nav className="tabs" aria-label="Views">
        {TABS.map(([key, label]) => (
          <a key={key} href={`#/${key}`} aria-current={key === active ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <p className="muted" style={{ marginTop: -8 }}>
        For: {tab[2]}
      </p>
      <main>
        {view === 'overview' && <OverviewView />}
        {view === 'coverage' && <CoverageView teamId={rest[0]} />}
        {view === 'exceptions' && <ExceptionsView findingId={rest[0]} />}
        {view === 'people' && <PeopleView employeeId={rest[0]} />}
        {view === 'assignment' && <AssignmentView assignmentId={rest[0]} />}
        {view === 'requests' && <RequestsView kind={rest[0] ?? 'leave'} id={rest[1]} />}
        {view === 'validation' && <ValidationView />}
        {!TABS.some(([key]) => key === active) && <OverviewView />}
      </main>
    </div>
  );
}
