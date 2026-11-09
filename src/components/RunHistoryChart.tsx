import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '../types';

type View = 'month' | 'year';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const km = (meters: number) => Math.round(meters / 10) / 100;

// start_date_local is already local time: read its parts directly.
const dateParts = (activity: Activity) => ({
  year: Number(activity.start_date_local.slice(0, 4)),
  month: Number(activity.start_date_local.slice(5, 7)) - 1,
  day: Number(activity.start_date_local.slice(8, 10)),
});

/** Year × 12 + month, so periods can be compared and stepped as one number. */
const monthIndex = (year: number, month: number) => year * 12 + month;

export function RunHistoryChart({ activities }: { activities: Activity[] }) {
  const runs = useMemo(
    () => activities.filter((activity) => activity.type === 'Run'),
    [activities]
  );
  const range = useMemo(() => {
    const indexes = runs.map((run) => {
      const { year, month } = dateParts(run);
      return monthIndex(year, month);
    });
    return indexes.length
      ? { first: Math.min(...indexes), last: Math.max(...indexes) }
      : null;
  }, [runs]);

  const [view, setView] = useState<View>('month');
  const [selected, setSelected] = useState<number | null>(null);
  const current = selected ?? range?.last ?? 0;
  const year = Math.floor(current / 12);
  const month = current % 12;

  const data = useMemo(() => {
    const inView = runs.filter((run) => {
      const parts = dateParts(run);
      return view === 'year'
        ? parts.year === year
        : parts.year === year && parts.month === month;
    });
    const size = view === 'year' ? 12 : new Date(year, month + 1, 0).getDate();
    const buckets = Array.from({ length: size }, (_, index) => ({
      label: view === 'year' ? MONTHS[index] : String(index + 1),
      meters: 0,
    }));
    for (const run of inView) {
      const parts = dateParts(run);
      buckets[view === 'year' ? parts.month : parts.day - 1].meters +=
        run.distance;
    }
    return {
      count: inView.length,
      total: km(inView.reduce((sum, run) => sum + run.distance, 0)),
      bars: buckets.map(({ label, meters }) => ({ label, km: km(meters) })),
    };
  }, [runs, view, year, month]);

  const step = view === 'year' ? 12 : 1;
  const canGoBack =
    !!range && current - step >= range.first - (view === 'year' ? month : 0);
  const canGoForward =
    !!range &&
    current + step <= range.last + (view === 'year' ? 11 - month : 0);
  const title = view === 'year' ? String(year) : `${MONTHS[month]} ${year}`;
  const unit = view === 'year' ? 'Month' : 'Day';
  const navButton =
    'rounded px-2 text-sm disabled:cursor-default disabled:opacity-30';

  return (
    <section
      aria-label="Run history"
      className="w-full min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Run History</h2>
        <div className="flex rounded-lg border border-[var(--color-border)] p-1">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`rounded-md px-3 py-1 text-xs ${
                view === value
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {value === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={navButton}
            disabled={!canGoBack}
            onClick={() => setSelected(current - step)}
            aria-label={`Previous ${view}`}
          >
            ←
          </button>
          <span className="min-w-20 text-center text-sm font-medium tabular-nums">
            {title}
          </span>
          <button
            type="button"
            className={navButton}
            disabled={!canGoForward}
            onClick={() => setSelected(current + step)}
            aria-label={`Next ${view}`}
          >
            →
          </button>
        </div>
        <p className="text-2xl font-semibold text-[var(--color-accent)] tabular-nums">
          {data.total.toLocaleString('en-US')}{' '}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            km · {data.count} {data.count === 1 ? 'run' : 'runs'}
          </span>
        </p>
      </div>
      <div
        role="img"
        aria-label={`Run history ${title}: ${data.bars
          .filter((bar) => bar.km > 0)
          .map((bar) => `${bar.label}: ${bar.km} km`)
          .join(', ')}`}
      >
        <div className="h-52 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.bars}
              margin={{ top: 8, right: 0, bottom: 0, left: -20 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={view === 'year' ? 0 : 'preserveStartEnd'}
                minTickGap={6}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-border)', opacity: 0.3 }}
                labelFormatter={(label) =>
                  view === 'year'
                    ? `${label} ${year}`
                    : `${MONTHS[month]} ${label}, ${year}`
                }
                contentStyle={{
                  background: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-text)',
                }}
              />
              <Bar
                dataKey="km"
                name="km"
                fill="var(--color-accent)"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-right text-xs text-[var(--color-muted)]">
          {unit} · km
        </p>
      </div>
    </section>
  );
}
