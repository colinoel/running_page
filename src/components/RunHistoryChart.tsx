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
import workouts from '../static/workouts.json';

type View = 'month' | 'year';
type Category = 'Run' | 'Strength' | 'Other';

interface Entry {
  date: string;
  value: number;
}

const CATEGORIES: Category[] = ['Run', 'Strength', 'Other'];
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

const round2 = (value: number) => Math.round(value * 100) / 100;

// Dates are already local: read their parts directly.
const dateParts = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)) - 1,
  day: Number(date.slice(8, 10)),
});

/** Year × 12 + month, so periods can be compared and stepped as one number. */
const monthIndex = (year: number, month: number) => year * 12 + month;

const toggleClass = (active: boolean) =>
  `rounded-md px-3 py-1 text-xs ${
    active
      ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
      : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
  }`;

export function RunHistoryChart({ activities }: { activities: Activity[] }) {
  const [category, setCategory] = useState<Category>('Run');
  const [view, setView] = useState<View>('month');
  const [selected, setSelected] = useState<number | null>(null);
  const isRun = category === 'Run';
  const unitLabel = isRun ? 'km' : 'min';

  const entries = useMemo<Entry[]>(
    () =>
      category === 'Run'
        ? activities
            .filter((activity) => activity.type === 'Run')
            .map((activity) => ({
              date: activity.start_date_local,
              value: activity.distance / 1000,
            }))
        : workouts
            .filter((workout) => workout.category === category)
            .map((workout) => ({
              date: workout.date,
              value: workout.minutes,
            })),
    [activities, category]
  );

  const range = useMemo(() => {
    const indexes = entries.map(({ date }) => {
      const { year, month } = dateParts(date);
      return monthIndex(year, month);
    });
    return indexes.length
      ? { first: Math.min(...indexes), last: Math.max(...indexes) }
      : null;
  }, [entries]);

  const current = selected ?? range?.last ?? 0;
  const year = Math.floor(current / 12);
  const month = current % 12;

  const data = useMemo(() => {
    const inView = entries.filter(({ date }) => {
      const parts = dateParts(date);
      return parts.year === year && (view === 'year' || parts.month === month);
    });
    const size = view === 'year' ? 12 : new Date(year, month + 1, 0).getDate();
    const buckets = Array.from({ length: size }, (_, index) => ({
      label: view === 'year' ? MONTHS[index] : String(index + 1),
      value: 0,
    }));
    for (const entry of inView) {
      const parts = dateParts(entry.date);
      buckets[view === 'year' ? parts.month : parts.day - 1].value +=
        entry.value;
    }
    return {
      count: inView.length,
      total: inView.reduce((sum, entry) => sum + entry.value, 0),
      bars: buckets.map((bucket) => ({
        ...bucket,
        value: round2(bucket.value),
      })),
    };
  }, [entries, view, year, month]);

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
  const countLabel = isRun
    ? data.count === 1
      ? 'run'
      : 'runs'
    : data.count === 1
      ? 'session'
      : 'sessions';
  const totalText = isRun
    ? round2(data.total).toLocaleString('en-US')
    : (data.total / 60).toLocaleString('en-US', { maximumFractionDigits: 1 });

  return (
    <section
      aria-label="Training history"
      className="w-full min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Training History</h2>
        <div className="flex rounded-lg border border-[var(--color-border)] p-1">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={toggleClass(view === value)}
            >
              {value === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 inline-flex rounded-lg border border-[var(--color-border)] p-1">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => {
              setCategory(value);
              setSelected(null);
            }}
            className={toggleClass(category === value)}
          >
            {value}
          </button>
        ))}
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
          {totalText}{' '}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            {isRun ? 'km' : 'h'} · {data.count} {countLabel}
          </span>
        </p>
      </div>
      <div
        role="img"
        aria-label={`${category} history ${title}: ${data.bars
          .filter((bar) => bar.value > 0)
          .map((bar) => `${bar.label}: ${bar.value} ${unitLabel}`)
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
                dataKey="value"
                name={unitLabel}
                fill="var(--color-accent)"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-right text-xs text-[var(--color-muted)]">
          {unit} · {unitLabel}
        </p>
      </div>
    </section>
  );
}
