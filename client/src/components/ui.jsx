// Small presentational pieces shared by every view.

const STATUS = {
  good: { color: 'var(--good)', icon: '✓' },
  warning: { color: 'var(--warning)', icon: '!' },
  critical: { color: 'var(--critical)', icon: '✕' },
  neutral: { color: 'var(--text-muted)', icon: '•' },
};

/** Status shown as icon + label + dot, never colour alone. */
export function Badge({ tone = 'neutral', children }) {
  const s = STATUS[tone];
  return (
    <span className="badge">
      <span className="dot" style={{ background: s.color }} aria-hidden="true" />
      <span aria-hidden="true">{s.icon}</span>
      {children}
    </span>
  );
}

/** Maps a record status to a tone (good / warning / critical / neutral). */
export function toneOf(status) {
  if (['PASS', 'MET', 'APPROVED', 'APPLIED', 'SCHEDULED', 'PRESENT', 'RESOLVED'].includes(status))
    return 'good';
  if (
    [
      'GAP',
      'EXPIRED',
      'MISSING_PUNCH',
      'EXCEPTION',
      'ACKNOWLEDGED',
      'WITHDRAWN',
      'CANCELLED',
      'SWAPPED_OUT',
    ].includes(status)
  )
    return 'warning';
  if (['FAIL', 'REJECTED', 'NO_SHOW', 'NO_RECORD', 'VIOLATION', 'OPEN'].includes(status))
    return 'critical';
  return 'neutral';
}

export const StatusBadge = ({ status }) => <Badge tone={toneOf(status)}>{status}</Badge>;

export function Panel({ title, sub, children, actions }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}
        >
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="sub">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, note, hero = false }) {
  return (
    <div className={`panel tile${hero ? ' hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Loading({ what = 'Loading' }) {
  return (
    <p className="muted" role="status">
      {what}…
    </p>
  );
}

export function ErrorBox({ message }) {
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}

/** Renders loading / error states, then children(data). */
export function Async({ state, children, what }) {
  if (state.error) return <ErrorBox message={state.error} />;
  if (state.loading || !state.data) return <Loading what={what} />;
  return children(state.data);
}

/**
 * columns: [{ key, label, num?, render?(row) }]; rows: objects. onRowClick makes rows selectable.
 */
export function DataTable({
  columns,
  rows,
  onRowClick,
  selectedKey,
  rowKey,
  empty = 'Nothing to show.',
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? 'num' : undefined} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = rowKey ? row[rowKey] : i;
            const select = onRowClick ? () => onRowClick(row) : undefined;
            return (
              <tr
                key={key}
                className={
                  [
                    onRowClick && 'clickable',
                    selectedKey !== undefined && key === selectedKey && 'selected',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onClick={select}
                onKeyDown={
                  select
                    ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), select())
                    : undefined
                }
                tabIndex={select ? 0 : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : undefined}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, onOffset }) {
  if (!page || page.total <= page.limit)
    return page ? <p className="muted">{page.total} rows</p> : null;
  const last = Math.max(0, Math.floor((page.total - 1) / page.limit) * page.limit);
  return (
    <div className="pager">
      <button
        onClick={() => onOffset(Math.max(0, page.offset - page.limit))}
        disabled={page.offset === 0}
      >
        Previous
      </button>
      <span>
        {page.offset + 1}–{Math.min(page.offset + page.limit, page.total)} of{' '}
        {page.total.toLocaleString('en-US')}
      </span>
      <button
        onClick={() => onOffset(Math.min(last, page.offset + page.limit))}
        disabled={page.offset >= last}
      >
        Next
      </button>
    </div>
  );
}

export function Select({ label, value, onChange, options, all = 'All' }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => {
          const [v, text] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={v} value={v}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/** Links to other views via the hash router: #/people/EMP-000001 etc. */
export const Link = ({ to, children }) => <a href={`#/${to}`}>{children}</a>;

/** An ID rendered as a link to the view that explains it. */
export function RecordLink({ id }) {
  if (!id) return '—';
  if (id.startsWith('ASG-'))
    return (
      <Link to={`assignment/${id}`}>
        <code>{id}</code>
      </Link>
    );
  if (id.startsWith('LVE-'))
    return (
      <Link to={`requests/leave/${id}`}>
        <code>{id}</code>
      </Link>
    );
  if (id.startsWith('SWP-'))
    return (
      <Link to={`requests/swaps/${id}`}>
        <code>{id}</code>
      </Link>
    );
  if (id.startsWith('EMP-'))
    return (
      <Link to={`people/${id}`}>
        <code>{id}</code>
      </Link>
    );
  return <code>{id}</code>;
}
