// Hand-built SVG charts (no chart library), following the mark specs: 2px lines with ringed
// end dots, columns capped at 24px with 4px rounded data ends, hairline grid, a crosshair or
// per-mark tooltip, and a table view so no value depends on colour or hover alone.

import { useEffect, useRef, useState } from 'react';

import { compact } from '../format.js';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Round tick values: steps of 1, 2 or 5 × 10^k. */
function niceTicks(min, max, count = 4) {
  const raw = (max - min) / count || 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step)
    ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function DataTableView({ labels, series, format }) {
  return (
    <details className="as-table">
      <summary>Show data as table</summary>
      <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {series.map((s) => (
                <th key={s.key} className="num" scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}>
                <td>{label}</td>
                {series.map((s) => (
                  <td key={s.key} className="num">
                    {format(s.values[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const MARGIN = { top: 12, right: 64, bottom: 26, left: 48 };

/** Line chart over ordered categories (dates). series: [{ key, label, color, values }]. */
export function LineChart({
  labels,
  series,
  yMin = 0,
  yMax,
  format = String,
  height = 220,
  title,
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const top = yMax ?? Math.max(...series.flatMap((s) => s.values), 1);
  const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const n = labels.length;
  const x = (i) => MARGIN.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v) => MARGIN.top + plotH - ((v - yMin) / (top - yMin || 1)) * plotH;
  const ticks = niceTicks(yMin, top);
  const every = Math.max(1, Math.ceil(n / 6));
  const ends = series.map((s) => y(s.values.at(-1)));
  // End labels only when they do not collide; otherwise the legend and tooltip carry identity.
  const showEnds =
    series.length <= 4 &&
    ends.every((a, i) => ends.every((b, j) => i === j || Math.abs(a - b) >= 14));

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.round(((event.clientX - box.left - MARGIN.left) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && (
        <div className="legend" aria-hidden="true">
          {series.map((s) => (
            <span key={s.key}>
              <span className="key" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={t === yMin ? 'var(--baseline)' : 'var(--grid)'}
            />
            <text className="tick" x={MARGIN.left - 6} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((label, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={label} className="tick" x={x(i)} y={height - 8} textAnchor="middle">
              {label.slice(5)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={x(n - 1)}
              cy={y(s.values.at(-1))}
              r="4"
              fill={s.color}
              stroke="var(--surface-1)"
              strokeWidth="2"
            />
            {showEnds && (
              <text className="end-label" x={x(n - 1) + 10} y={y(s.values.at(-1)) + 4}>
                {format(s.values.at(-1))}
              </text>
            )}
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotH}
              stroke="var(--baseline)"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(s.values[hover])}
                r="4"
                fill={s.color}
                stroke="var(--surface-1)"
                strokeWidth="2"
              />
            ))}
          </g>
        )}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{ left: Math.min(x(hover) + 12, width - 170), top: MARGIN.top }}
        >
          <strong>{labels[hover]}</strong>
          {series.map((s) => (
            <div key={s.key}>
              <span
                className="key"
                style={{
                  background: s.color,
                  display: 'inline-block',
                  width: 10,
                  height: 3,
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {s.label}: {format(s.values[hover])}
            </div>
          ))}
        </div>
      )}
      <DataTableView labels={labels} series={series} format={format} />
    </div>
  );
}

/** Column chart over ordered categories. One series, so the title names it (no legend). */
export function ColumnChart({
  labels,
  values,
  color = 'var(--series-1)',
  format = String,
  height = 180,
  title,
  valueLabel,
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const top = Math.max(...values, 1);
  const plotW = Math.max(120, width - MARGIN.left - 16);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const band = plotW / Math.max(1, labels.length);
  const barW = Math.max(1, Math.min(24, band - 2));
  const ticks = niceTicks(0, top);
  const y = (v) => MARGIN.top + plotH - (v / (ticks.at(-1) || 1)) * plotH;
  const every = Math.max(1, Math.ceil(labels.length / 6));

  const column = (i, v) => {
    const x0 = MARGIN.left + i * band + (band - barW) / 2;
    const yTop = y(v);
    const base = y(0);
    const r = Math.min(4, barW / 2, base - yTop);
    if (base - yTop <= 0) return null;
    return `M${x0},${base}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + barW - r}Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r}V${base}Z`;
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? 'var(--baseline)' : 'var(--grid)'}
            />
            <text className="tick" x={MARGIN.left - 6} y={y(t) + 4} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => (
          <g key={labels[i]}>
            {column(i, v) && (
              <path
                d={column(i, v)}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            )}
            <rect
              x={MARGIN.left + i * band}
              y={MARGIN.top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        {labels.map((label, i) =>
          i % every === 0 ? (
            <text
              key={label}
              className="tick"
              x={MARGIN.left + i * band + band / 2}
              y={height - 8}
              textAnchor="middle"
            >
              {label.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{
            left: Math.min(MARGIN.left + hover * band + band, width - 150),
            top: MARGIN.top,
          }}
        >
          <strong>{labels[hover]}</strong>
          <div>
            {valueLabel}: {format(values[hover])}
          </div>
        </div>
      )}
      <DataTableView
        labels={labels}
        series={[{ key: 'v', label: valueLabel, values }]}
        format={format}
      />
    </div>
  );
}

/** Horizontal bars for categories, value at the tip in text ink. rows: [{ label, value }]. */
export function BarList({ rows, color = 'var(--series-1)', format = String }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div role="list">
      {rows.map((r) => (
        <div
          key={r.label}
          role="listitem"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 40%) 1fr',
            gap: 8,
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span
            className="secondary"
            style={{
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={r.label}
          >
            {r.label}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                height: 16,
                width: `${(r.value / max) * 85}%`,
                minWidth: r.value > 0 ? 2 : 0,
                background: color,
                borderRadius: '0 4px 4px 0',
              }}
            />
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {format(r.value)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
